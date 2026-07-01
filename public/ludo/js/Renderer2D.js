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

const YARD_SLOTS = {
  red:    [[1.3,1.3],[1.3,4.3],[4.3,1.3],[4.3,4.3]],
  green:  [[1.3,9.7],[1.3,12.7],[4.3,9.7],[4.3,12.7]],
  yellow: [[9.7,9.7],[9.7,12.7],[12.7,9.7],[12.7,12.7]],
  blue:   [[9.7,1.3],[9.7,4.3],[12.7,1.3],[12.7,4.3]],
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

    // _tokens: tokenId -> { color, x, y, targetX, targetY, finished, _hop }
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

    // Self-heal: force one more re-measure a couple frames after startup,
    // in case the very first _resize() above ran before the mobile browser
    // had finished settling its real viewport height (e.g. address bar
    // still animating away). Cheap no-op if the size was already correct.
    setTimeout(() => this._scheduleResize(), 300);

    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  // ── Token position resolution ─────────────────────────────

  _targetFor(color, tokenIndex, token) {
    if (token.state === 'home') {
      const [r, c] = YARD_SLOTS[color][tokenIndex];
      return { x: c, y: r };
    }
    if (token.state === 'finished') {
      // Small fan-out around center so finished tokens don't fully overlap.
      const angle = (tokenIndex / 4) * Math.PI * 2;
      return { x: CENTER_COORD[1] + Math.cos(angle) * 0.35, y: CENTER_COORD[0] + Math.sin(angle) * 0.35 };
    }
    if (token.pathIndex <= 50) {
      const g = localToGlobal(color, token.pathIndex);
      const [r, c] = TRACK_COORDS[g];
      return { x: c + 0.5, y: r + 0.5 };
    }
    const [r, c] = HOME_STRETCH_COORDS[color][token.pathIndex - 51];
    return { x: c + 0.5, y: r + 0.5 };
  }

  /** Sync rendered tokens from the authoritative LudoGameState. */
  syncTokens(state) {
    const seen = new Set();
    for (const player of state.players) {
      player.tokens.forEach((token, idx) => {
        const key = token.id;
        seen.add(key);
        const target = this._targetFor(player.color, idx, token);
        const existing = this._tokens[key];
        if (!existing) {
          this._tokens[key] = { color: player.color, x: target.x, y: target.y, targetX: target.x, targetY: target.y, state: token.state };
        } else {
          existing.color = player.color;
          existing.state = token.state;
          if (existing.targetX !== target.x || existing.targetY !== target.y) {
            existing.targetX = target.x;
            existing.targetY = target.y;
            existing._animT = 0;
          }
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
        if (t.x !== t.targetX || t.y !== t.targetY) {
          if (t._fromX === undefined) { t._fromX = t.x; t._fromY = t.y; t._animT = 0; }
          t._animT = Math.min(1, t._animT + 0.12);
          const ep = this._easeInOut(t._animT);
          t.x = lerp(t._fromX, t.targetX, ep);
          t.y = lerp(t._fromY, t.targetY, ep);
          if (t._animT >= 1) {
            t.x = t.targetX; t.y = t.targetY;
            t._fromX = undefined; t._fromY = undefined;
          }
        } else {
          t._fromX = undefined; t._fromY = undefined; t._animT = undefined;
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
      ctx.fillStyle = numToHex(th[color]);
      ctx.globalAlpha = 0.22;
      ctx.fillRect(col * cell, row * cell, 6 * cell, 6 * cell);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = numToHex(th[`${color}Dark`]);
      ctx.lineWidth = Math.max(1, cell * 0.05);
      ctx.strokeRect(col * cell + cell * 0.6, row * cell + cell * 0.6, 4.8 * cell, 4.8 * cell);
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

  onResize() { this._resize(); }

  destroy() {
    cancelAnimationFrame(this._rafId);
    if (this._ro) this._ro.disconnect();
    if (this._onWindowResize) window.removeEventListener('resize', this._onWindowResize);
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
