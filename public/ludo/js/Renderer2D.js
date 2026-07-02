// ============================================================
// Renderer2D.js — Flat 2D Canvas Ludo board + tokens
// ============================================================
// There was no renderer in the original vanilla Ludo core (it only shipped
// rules logic) — this is a new component, but deliberately built to expose
// the same shape of API as public/checkers/js/Renderer2D.js (constructor,
// syncing from authoritative state, select/hints, pick(), applyTheme,
// onResize, destroy) so play.html/index.html can drive it exactly the same
// way the checkers pages drive their board.
'use strict';

import { localToGlobal, SAFE_SQUARES_GLOBAL } from './RuleProcessor.js';

// ── Static board geometry (15x15 grid units) ────────────────
// Standard cross-shaped Ludo layout. TRACK_COORDS[i] is the [row, col] for
// global ring index i (0-51) — index 0 sits just outside red's yard, and the
// ring runs clockwise through green, yellow, and blue's start squares at
// indices 13, 26, and 39 respectively (matches START_OFFSET in RuleProcessor.js).
const TRACK_COORDS = [
  [6,1],[6,2],[6,3],[6,4],[6,5],
  [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
  [0,7],
  [0,8],[1,8],[2,8],[3,8],[4,8],[5,8],
  [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
  [7,14],
  [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],
  [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],
  [14,6],[13,6],[12,6],[11,6],[10,6],[9,6],
  [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],
  [6,0],
];

const HOME_STRETCH_COORDS = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  green:  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  yellow: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  blue:   [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
};

const CENTER_COORD = [7, 7];

// Token-holder slots inside each yard: a small 2x2 grid centered exactly on
// that yard's circle center (row+3, col+3 — see YARD_BOUNDS/_drawYards),
// offset by 1.05 grid units so the four tokens sit evenly spaced well
// inside the rim (circle radius is 2.55*cell, token radius is 0.32*cell,
// so 1.05 + 0.32 ≈ 1.37 leaves plenty of clearance either way).
const YARD_SLOTS = {
  red:    [[1.95,1.95],[1.95,4.05],[4.05,1.95],[4.05,4.05]],
  green:  [[1.95,10.95],[1.95,13.05],[4.05,10.95],[4.05,13.05]],
  yellow: [[10.95,10.95],[10.95,13.05],[13.05,10.95],[13.05,13.05]],
  blue:   [[10.95,1.95],[10.95,4.05],[13.05,1.95],[13.05,4.05]],
};

const YARD_BOUNDS = {
  red:    { row: 0, col: 0 },
  green:  { row: 0, col: 9 },
  yellow: { row: 9, col: 9 },
  blue:   { row: 9, col: 0 },
};

export class Renderer2D {
  constructor(canvas, theme) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.theme  = theme;
    this.gridSize = 15;

    // _tokens: tokenId -> { color, x, y, state, _logicalState, _logicalPath, _waypoints }
    this._tokens   = {};
    this._hints    = []; // tokenIds eligible to move this turn
    this._selected = null; // tokenId

    this._dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Resize is debounced through rAF instead of running synchronously on
    // every ResizeObserver/window-resize callback. On mobile, the address
    // bar collapsing right after page load fires a burst of rapid resize
    // events; calling _resize() synchronously for each one can overwhelm
    // the browser's ResizeObserver delivery queue, which then emits
    // "ResizeObserver loop completed with undelivered notifications" and
    // silently drops the pending (correct) size update — leaving the
    // canvas stuck at its very first, often near-zero, measurement. This
    // never showed up in "desktop site" mode because that skips the
    // address-bar animation entirely.
    this._resizePending = false;
    this._scheduleResize = () => {
      if (this._resizePending) return;
      this._resizePending = true;
      requestAnimationFrame(() => {
        this._resizePending = false;
        this._resize();
      });
    };

    this._resize();
    this._ro = new ResizeObserver(() => this._scheduleResize());
    this._ro.observe(this.canvas);
    this._onWindowResize = () => this._scheduleResize();
    window.addEventListener('resize', this._onWindowResize);
    window.addEventListener('orientationchange', this._onWindowResize);
    // visualViewport fires as mobile Chrome's address bar / toolbar animates
    // in or out — window 'resize' alone can miss these on some Android
    // builds, which is the main known cause of a canvas getting stuck at a
    // stale (sometimes zero) size until the page is force-reloaded (e.g. by
    // toggling "Desktop site").
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this._onWindowResize);
    }

    // Self-heal: force a few more re-measures over the first couple seconds,
    // in case the very first _resize() above ran before the mobile browser
    // had finished settling its real viewport height (e.g. address bar
    // still animating away), or before the popup window itself had finished
    // sizing. Cheap no-ops once the size is already correct.
    for (const delay of [100, 300, 800, 1500]) {
      setTimeout(() => this._scheduleResize(), delay);
    }

    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  // ── Token position resolution ─────────────────────────────

  /** Coordinate (in 15x15 grid units) for a given logical (state, pathIndex). */
  _coordFor(color, tokenIndex, state, pathIndex) {
    if (state === 'home') {
      const [r, c] = YARD_SLOTS[color][tokenIndex];
      return { x: c, y: r };
    }
    if (state === 'finished') {
      // Small fan-out around center so finished tokens don't fully overlap.
      const angle = (tokenIndex / 4) * Math.PI * 2;
      return { x: CENTER_COORD[1] + Math.cos(angle) * 0.35, y: CENTER_COORD[0] + Math.sin(angle) * 0.35 };
    }
    if (pathIndex <= 50) {
      const g = localToGlobal(color, pathIndex);
      const [r, c] = TRACK_COORDS[g];
      return { x: c + 0.5, y: r + 0.5 };
    }
    const [r, c] = HOME_STRETCH_COORDS[color][pathIndex - 51];
    return { x: c + 0.5, y: r + 0.5 };
  }

  _targetFor(color, tokenIndex, token) {
    return this._coordFor(color, tokenIndex, token.state, token.pathIndex);
  }

  /**
   * Builds the sequence of intermediate waypoints a token should visibly
   * hop through when moving from one logical position to another — so a
   * move of N squares drags/hops through each square along the actual
   * track instead of snapping in a straight line across the board (which,
   * for moves that cross a corner of the cross-shaped board, would cut
   * visibly through the middle of the yards).
   */
  _buildWaypoints(color, tokenIndex, fromState, fromPath, toState, toPath) {
    if (fromState === 'active' && toPath > fromPath && (toState === 'active' || toState === 'finished')) {
      const steps = [];
      const lastTrackStep = Math.min(toPath, 56);
      for (let p = fromPath + 1; p <= lastTrackStep; p++) {
        steps.push(this._coordFor(color, tokenIndex, 'active', p));
      }
      if (toState === 'finished') steps.push(this._coordFor(color, tokenIndex, 'finished', toPath));
      return steps;
    }
    // Spawning out of the yard, being captured back to the yard, or any
    // other non-sequential transition: nothing to walk through, just glide.
    return [this._coordFor(color, tokenIndex, toState, toPath)];
  }

  /** Sync rendered tokens from the authoritative LudoGameState. */
  syncTokens(state) {
    const seen = new Set();
    for (const player of state.players) {
      player.tokens.forEach((token, idx) => {
        const key = token.id;
        seen.add(key);
        const existing = this._tokens[key];
        if (!existing) {
          const target = this._coordFor(player.color, idx, token.state, token.pathIndex);
          this._tokens[key] = {
            color: player.color, x: target.x, y: target.y,
            state: token.state,
            _logicalState: token.state, _logicalPath: token.pathIndex,
            _waypoints: [], _fromX: undefined, _fromY: undefined, _segT: 0,
          };
          return;
        }
        existing.color = player.color;
        existing.state = token.state;
        const changed = existing._logicalState !== token.state || existing._logicalPath !== token.pathIndex;
        if (changed) {
          existing._waypoints = this._buildWaypoints(player.color, idx, existing._logicalState, existing._logicalPath, token.state, token.pathIndex);
          existing._fromX = undefined;
          existing._fromY = undefined;
          existing._segT = 0;
          existing._logicalState = token.state;
          existing._logicalPath = token.pathIndex;
        }
      });
    }
    for (const key of Object.keys(this._tokens)) {
      if (!seen.has(key)) delete this._tokens[key];
    }
  }

  // ── Highlights ─────────────────────────────────────────────

  showHints(legalMoves) {
    this._hints = legalMoves.map(m => m.tokenId);
  }

  selectToken(tokenId) { this._selected = tokenId; }

  clearSelection() {
    this._selected = null;
    this._hints = [];
  }

  // ── Theme hot-swap ─────────────────────────────────────────

  applyTheme(theme) { this.theme = theme; }

  /** Tell the renderer whose turn it is, so that player's yard gets a glow ring. */
  setActiveColor(color) { this._activeColor = color; }

  setCameraAngle(_angle) {} // kept for API parity, no-op in a flat top-down board

  // ── Picking ─────────────────────────────────────────────────
  // Returns the nearest token within a tap radius, prioritizing tokens
  // that are currently flagged as legal-move hints (so overlapping yard
  // tokens of the same color are easy to disambiguate by relevance).

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const px = (clientX - rect.left - this._boardX) / this._cell;
    const py = (clientY - rect.top - this._boardY) / this._cell;

    let best = null;
    let bestDist = Infinity;
    let bestIsHint = false;

    for (const [tokenId, t] of Object.entries(this._tokens)) {
      const d = Math.hypot(t.x - px, t.y - py);
      if (d > 0.55) continue;
      const isHint = this._hints.includes(tokenId);
      if (best === null || (isHint && !bestIsHint) || (isHint === bestIsHint && d < bestDist)) {
        best = tokenId;
        bestDist = d;
        bestIsHint = isHint;
      }
    }

    if (best) return { type: 'token', tokenId: best, color: this._tokens[best].color, isHint: bestIsHint };
    return null;
  }

  // ── Render loop ───────────────────────────────────────────

  _loop(now) {
    try {
      this._rafId = requestAnimationFrame((t) => this._loop(t));

      for (const t of Object.values(this._tokens)) {
        if (t._waypoints && t._waypoints.length > 0) {
          const next = t._waypoints[0];
          if (t._fromX === undefined) { t._fromX = t.x; t._fromY = t.y; t._segT = 0; }
          // ~7 frames per hop at 60fps (≈115ms/square) — slow enough to read
          // as dragging/hopping across the board rather than teleporting.
          t._segT = Math.min(1, t._segT + 0.14);
          const ep = this._easeInOut(t._segT);
          const hop = Math.sin(Math.min(1, t._segT) * Math.PI) * 0.16; // small vertical bounce per square
          t.x = lerp(t._fromX, next.x, ep);
          t.y = lerp(t._fromY, next.y, ep) - hop;
          if (t._segT >= 1) {
            t.x = next.x; t.y = next.y;
            t._waypoints.shift();
            t._fromX = undefined; t._fromY = undefined; t._segT = 0;
          }
        }
      }

      this._draw(now || performance.now());
    } catch (err) {
      // Stop retrying every frame (which would otherwise silently re-throw
      // 60x/sec) and surface the error once via a DOM event that the host
      // page can display on-screen.
      cancelAnimationFrame(this._rafId);
      console.error('Renderer2D render loop crashed:', err);
      window.dispatchEvent(new CustomEvent('ludo-render-error', { detail: err }));
    }
  }

  _easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

  _draw(now) {
    const ctx = this.ctx;
    const th  = this.theme;
    ctx.save();
    ctx.scale(this._dpr, this._dpr);

    ctx.fillStyle = th.boardBg || '#1b1b1b';
    ctx.fillRect(0, 0, this._cssW, this._cssH);

    ctx.translate(this._boardX, this._boardY);

    this._drawFrame(ctx, th);
    this._drawYards(ctx, th);
    this._drawAvatars(ctx, th);
    this._drawTrack(ctx, th, now);
    this._drawHomeStretches(ctx, th);
    this._drawCenter(ctx, th);
    this._drawTokens(ctx, th, now);

    ctx.restore();
  }

  _drawFrame(ctx, th) {
    const pad = this._framePad;
    const s   = this._boardPx;
    ctx.fillStyle = numToHex(th.frameColor);
    ctx.fillRect(-pad, -pad, s + pad * 2, s + pad * 2);
  }

  _drawYards(ctx, th) {
    const cell = this._cell;
    for (const color of ['red', 'green', 'yellow', 'blue']) {
      const { row, col } = YARD_BOUNDS[color];
      const cx = (col + 3) * cell, cy = (row + 3) * cell;
      const r = cell * 2.55;

      // Big filled token-holder circle (the round colored disc each player's
      // pieces sit inside, matching a classic Ludo app look).
      const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.15, cx, cy, r);
      grad.addColorStop(0, lighten(numToHex(th[color]), 0.12));
      grad.addColorStop(1, numToHex(th[color]));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, cell * 0.06);
      ctx.strokeStyle = numToHex(th[`${color}Dark`]);
      ctx.stroke();

      // Glowing ring around whoever's turn it currently is.
      if (this._activeColor === color) {
        ctx.beginPath();
        ctx.arc(cx, cy, r + cell * 0.16, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(2, cell * 0.12);
        ctx.strokeStyle = '#00ff88';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = cell * 0.4;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Four small token-slot sockets inside the disc, under YARD_SLOTS.
      for (const [sr, sc] of YARD_SLOTS[color]) {
        const scx = sc * cell, scy = sr * cell;
        ctx.beginPath();
        ctx.arc(scx, scy, cell * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = numToHex(th[`${color}Dark`]);
        ctx.globalAlpha = 0.35;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  // Corner (in 15x15 grid units) where each yard meets the center cross —
  // this is where the small player-avatar bubble sits, straddling the yard
  // and the track, matching the reference board.
  _avatarAnchor(color) {
    const { row, col } = YARD_BOUNDS[color];
    const cornerRow = row === 0 ? 6 : 9;
    const cornerCol = col === 0 ? 6 : 9;
    const dr = row === 0 ? -0.55 : 0.55;
    const dc = col === 0 ? -0.55 : 0.55;
    return { x: (cornerCol + dc) , y: (cornerRow + dr) };
  }

  _drawAvatars(ctx, th) {
    const cell = this._cell;
    for (const color of ['red', 'green', 'yellow', 'blue']) {
      const { x, y } = this._avatarAnchor(color);
      const cx = x * cell, cy = y * cell;
      const r = cell * 0.62;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = numToHex(th[color]);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, cell * 0.06);
      ctx.strokeStyle = '#f0f0e8';
      ctx.stroke();

      // Simple generic silhouette: head + shoulders, in a darker tone.
      ctx.fillStyle = numToHex(th[`${color}Dark`]);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.32, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.62, r * 0.62, Math.PI, 0);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (this._activeColor === color) {
        ctx.beginPath();
        ctx.arc(cx, cy, r + cell * 0.08, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(1.5, cell * 0.08);
        ctx.strokeStyle = '#00ff88';
        ctx.stroke();
      }
    }
  }

  _drawTrack(ctx, th, now) {
    const cell = this._cell;
    // Light "neutral" background under the whole 15x15 grid for the cross arms.
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        const inYard = (
          (r < 6 && c < 6) || (r < 6 && c > 8) || (r > 8 && c > 8) || (r > 8 && c < 6)
        );
        if (inYard) continue;
        ctx.fillStyle = numToHex(th.cellLight);
        ctx.fillRect(c * cell, r * cell, cell, cell);
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(c * cell, r * cell, cell, cell);
      }
    }

    // Colored start squares + path tinting per color's first cell after its yard.
    for (let i = 0; i < TRACK_COORDS.length; i++) {
      const [r, c] = TRACK_COORDS[i];
      const colorAtStart = Object.entries(START_OFFSET_LOOKUP).find(([, off]) => off === i)?.[0];
      if (colorAtStart) {
        ctx.fillStyle = numToHex(th[colorAtStart]);
        ctx.globalAlpha = 0.35;
        ctx.fillRect(c * cell, r * cell, cell, cell);
        ctx.globalAlpha = 1;
      }
      if (SAFE_SQUARES_GLOBAL.includes(i)) {
        this._drawStar(ctx, th, c * cell + cell / 2, r * cell + cell / 2, cell * 0.22);
      }
    }
  }

  _drawStar(ctx, th, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a1 = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const a2 = a1 + Math.PI / 5;
      const x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
      const x2 = cx + Math.cos(a2) * r * 0.45, y2 = cy + Math.sin(a2) * r * 0.45;
      if (i === 0) ctx.moveTo(x1, y1); else ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.closePath();
    ctx.fillStyle = numToHex(th.starColor);
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawHomeStretches(ctx, th) {
    const cell = this._cell;
    for (const color of ['red', 'green', 'yellow', 'blue']) {
      ctx.fillStyle = numToHex(th[color]);
      ctx.globalAlpha = 0.55;
      for (const [r, c] of HOME_STRETCH_COORDS[color]) {
        ctx.fillRect(c * cell, r * cell, cell, cell);
      }
      ctx.globalAlpha = 1;
    }
  }

  _drawCenter(ctx, th) {
    const cell = this._cell;
    const cx = 7.5 * cell, cy = 7.5 * cell;
    const half = 1.5 * cell;

    ctx.fillStyle = numToHex(th.centerBg);
    ctx.fillRect(cx - half, cy - half, half * 2, half * 2);

    // Four triangles pointing inward, one per color, like a classic Ludo home.
    const tris = [
      { color: 'red',    pts: [[-half,-half],[half,-half],[0,0]] },
      { color: 'green',  pts: [[half,-half],[half,half],[0,0]] },
      { color: 'yellow', pts: [[half,half],[-half,half],[0,0]] },
      { color: 'blue',   pts: [[-half,half],[-half,-half],[0,0]] },
    ];
    for (const tri of tris) {
      ctx.beginPath();
      tri.pts.forEach(([dx, dy], i) => {
        const x = cx + dx, y = cy + dy;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = numToHex(th[tri.color]);
      ctx.fill();
    }
  }

  _drawTokens(ctx, th, now) {
    const cell = this._cell;
    const order = Object.entries(this._tokens).sort((a, b) => {
      // Draw the selected/hinted tokens last so they sit on top.
      const aHot = this._hints.includes(a[0]) || this._selected === a[0];
      const bHot = this._hints.includes(b[0]) || this._selected === b[0];
      return (aHot ? 1 : 0) - (bHot ? 1 : 0);
    });
    for (const [tokenId, t] of order) {
      this._drawOneToken(ctx, th, tokenId, t, cell, now);
    }
  }

  _drawOneToken(ctx, th, tokenId, t, cell, now) {
    const cx = t.x * cell;
    const cy = t.y * cell;
    const r = cell * 0.32;
    const isHint = this._hints.includes(tokenId);
    const isSelected = this._selected === tokenId;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.5, r * 0.85, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    const bodyColor = numToHex(th[t.color]);
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    grad.addColorStop(0, lighten(bodyColor, 0.4));
    grad.addColorStop(1, bodyColor);

    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.25, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.strokeStyle = numToHex(th[`${t.color}Dark`]);
    ctx.stroke();

    // Small bead on top, like a classic ludo piece's "head"
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.85, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = lighten(bodyColor, 0.5);
    ctx.fill();

    if (isHint) {
      const pulse = 0.6 + 0.4 * Math.sin(now * 0.005);
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.25, r * 1.35, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,255,136,${pulse})`;
      ctx.lineWidth = Math.max(2, r * 0.18);
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = r * 0.5;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.25, r * 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#44aaff';
      ctx.lineWidth = Math.max(2, r * 0.14);
      ctx.shadowColor = '#44aaff';
      ctx.shadowBlur = r * 0.6;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // ── Sizing ─────────────────────────────────────────────────

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    if (cssW === this._cssW && cssH === this._cssH) return;
    this._cssW = cssW;
    this._cssH = cssH;

    this.canvas.width  = Math.round(cssW * this._dpr);
    this.canvas.height = Math.round(cssH * this._dpr);

    const margin = Math.min(cssW, cssH) * 0.04;
    const avail  = Math.max(1, Math.min(cssW, cssH) - margin * 2);
    this._framePad = avail * 0.03;
    this._boardPx  = avail - this._framePad * 2;
    this._cell     = this._boardPx / this.gridSize;
    this._boardX   = (cssW - avail) / 2 + this._framePad;
    this._boardY   = (cssH - avail) / 2 + this._framePad;
  }

  /** CSS-pixel anchor (relative to the canvas element) for each color's
   *  name/percentage label, placed just outside its yard circle. */
  getYardLabelAnchors() {
    const cell = this._cell;
    const out = {};
    for (const color of ['red', 'green', 'yellow', 'blue']) {
      const { row, col } = YARD_BOUNDS[color];
      const cx = this._boardX + (col + 3) * cell;
      const cyCenter = this._boardY + (row + 3) * cell;
      const r = cell * 2.55;
      const y = row === 0 ? (cyCenter - r - cell * 0.5) : (cyCenter + r + cell * 0.5);
      out[color] = { x: cx, y, topAligned: row !== 0 };
    }
    return out;
  }

  onResize() { this._resize(); }

  destroy() {
    cancelAnimationFrame(this._rafId);
    if (this._ro) this._ro.disconnect();
    if (this._onWindowResize) {
      window.removeEventListener('resize', this._onWindowResize);
      window.removeEventListener('orientationchange', this._onWindowResize);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', this._onWindowResize);
    }
  }
}

const START_OFFSET_LOOKUP = { red: 0, green: 13, yellow: 26, blue: 39 };

function lerp(a, b, t) { return a + (b - a) * t; }

function numToHex(n) {
  if (typeof n === 'string') return n;
  return '#' + (n >>> 0).toString(16).padStart(6, '0');
}

function lighten(hex, amount) {
  const c = hex.replace('#', '');
  const num = parseInt(c, 16);
  let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  const adj = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amount)));
  r = adj(r); g = adj(g); b = adj(b);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
