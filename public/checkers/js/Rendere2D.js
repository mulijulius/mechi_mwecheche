// ============================================================
// Renderer2D.js — Flat 2D Canvas board + pieces
// ============================================================
// Drop-in replacement for Renderer3D.js. Same constructor signature and
// same public API (syncPieces, animateMove, selectPiece, showHints,
// clearSelection, applyTheme, setCameraAngle, pick, onResize, destroy),
// so App.js, play.html, and index.html all work unchanged — only the
// import line needs to point here instead of at Renderer3D.js.
//
// Why this exists: the 3D board (Three.js, orbiting camera, raycasting)
// was "hectic" to play on, especially on phones — picking the right
// square through a perspective camera takes more care than tapping a
// flat grid. This renderer keeps the exact same theme system (colors,
// piece styling, king crowns, capture/selection/hint visuals) but draws
// everything top-down on a 2D <canvas>, so a tap maps straight to a
// row/col with simple division — no raycasting, no camera angles.
'use strict';

export class Renderer2D {
  constructor(canvas, theme) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.theme  = theme;
    this.size   = 8;

    // Pure render-state — no DOM nodes per piece like Three.js meshes.
    // pieces: key "r_c" -> { row, col, color, king, x, y } where x/y are
    // the piece's *current* center in board-units (0..8), separate from
    // row/col so animateMove can interpolate position independently of
    // logical board coordinates.
    this._pieces   = {};
    this._selected = null;     // { row, col }
    this._hints    = [];       // [{ row, col }]
    this._anim     = null;     // active move animation, or null

    this._dpr = Math.min(window.devicePixelRatio || 1, 2);

    this._resize();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this.canvas);
    this._onWindowResize = () => this._resize();
    window.addEventListener('resize', this._onWindowResize);

    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  // ── Piece Management ──────────────────────────────────────

  syncPieces(board) {
    const existing = new Set(Object.keys(this._pieces));

    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        const cell = board[r][c];
        const key  = `${r}_${c}`;
        if (cell) {
          existing.delete(key);
          if (!this._pieces[key]) {
            this._pieces[key] = { row: r, col: c, color: cell.color, king: !!cell.king, x: c + 0.5, y: r + 0.5 };
          } else {
            // Update king status / position in place (covers reconnects
            // and the "snap to server state" rollback path, where a piece
            // might already exist at a different key than the server now
            // reports — those are handled by the delete-then-recreate
            // below since the key itself encodes row/col).
            this._pieces[key].king = !!cell.king;
          }
        }
      }
    }

    // Remove captured pieces
    for (const key of existing) delete this._pieces[key];
  }

  // ── Move Animation ────────────────────────────────────────
  // Mirrors Renderer3D's arc-jump: the piece slides from->to while a
  // sine-wave "lift" temporarily scales it up and drops a soft shadow
  // beneath it, faking the hop without an actual depth axis.

  animateMove(fromPos, toPos, capturedPositions, onComplete) {
    const fromKey = `${fromPos.row}_${fromPos.col}`;
    const piece   = this._pieces[fromKey];
    if (!piece) { onComplete && onComplete(); return; }

    delete this._pieces[fromKey];

    this._anim = {
      piece,
      startX: fromPos.col + 0.5, startY: fromPos.row + 0.5,
      endX:   toPos.col + 0.5,   endY:   toPos.row + 0.5,
      t: 0,
      dur: 18, // frames — a bit snappier than the 3D version since there's
               // no real travel distance to sell, just a tap-to-tap hop
      onComplete: () => {
        piece.row = toPos.row;
        piece.col = toPos.col;
        piece.x   = toPos.col + 0.5;
        piece.y   = toPos.row + 0.5;
        this._pieces[`${toPos.row}_${toPos.col}`] = piece;

        for (const cap of capturedPositions) {
          delete this._pieces[`${cap.row}_${cap.col}`];
        }
        onComplete && onComplete();
      },
    };
  }

  _easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  // ── Highlights ───────────────────────────────────────────

  selectPiece(row, col) {
    this._selected = { row, col };
  }

  showHints(moves) {
    this._hints = moves.map(m => ({ row: m.to.row, col: m.to.col }));
  }

  clearSelection() {
    this._selected = null;
    this._hints = [];
  }

  // ── Theme Hot-swap ────────────────────────────────────────

  applyTheme(theme) {
    this.theme = theme;
    // Nothing to mutate eagerly — every draw call reads this.theme fresh.
  }

  // ── Camera (no-op in 2D, kept for API compatibility) ──────
  // index.html's camera-angle buttons call this on whichever renderer is
  // mounted. There's no camera to move in a flat top-down view, so this
  // is intentionally a no-op rather than removed, so swapping renderers
  // doesn't require touching App.js or index.html.

  setCameraAngle(_angle) {}

  // ── Picking ────────────────────────────────────────────────
  // Converts a screen point straight to a board cell — no raycasting
  // needed since the board is drawn as a simple top-down square grid.

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    if (px < this._boardX || px > this._boardX + this._boardPx ||
        py < this._boardY || py > this._boardY + this._boardPx) {
      return null;
    }

    const col = Math.floor((px - this._boardX) / this._cell);
    const row = Math.floor((py - this._boardY) / this._cell);
    if (row < 0 || row >= this.size || col < 0 || col >= this.size) return null;

    // Hints take priority over pieces/tiles at the same cell (matches the
    // 3D pick order: hint dots sit "above" pieces along the raycast).
    if (this._hints.some(h => h.row === row && h.col === col)) {
      return { type: 'hint', row, col };
    }

    const piece = this._pieces[`${row}_${col}`];
    if (piece) {
      return { type: 'piece', row, col, color: piece.color };
    }

    const isLight = (row + col) % 2 === 0;
    if (isLight) return null; // light squares were never pickable in 3D either

    return { type: 'tile', row, col };
  }

  // ── Render Loop ───────────────────────────────────────────

  _loop(now) {
    this._rafId = requestAnimationFrame((t) => this._loop(t));

    if (this._anim) {
      const a = this._anim;
      a.t++;
      const p  = a.t / a.dur;
      const ep = this._easeInOut(Math.min(p, 1));
      a.piece.x = a.startX + (a.endX - a.startX) * ep;
      a.piece.y = a.startY + (a.endY - a.startY) * ep;
      a.piece._hop = Math.sin(Math.min(p, 1) * Math.PI); // 0..1..0, drives lift+shadow
      if (p >= 1) {
        a.piece._hop = 0;
        this._anim = null;
        a.onComplete();
      }
    }

    this._draw(now || performance.now());
  }

  _draw(now) {
    const ctx = this.ctx;
    const th  = this.theme;
    ctx.save();
    ctx.scale(this._dpr, this._dpr);

    // Background behind the board frame
    ctx.fillStyle = th.boardBg || '#1a3d10';
    ctx.fillRect(0, 0, this._cssW, this._cssH);

    ctx.translate(this._boardX, this._boardY);

    this._drawFrame(ctx, th);
    this._drawTiles(ctx, th);
    this._drawHints(ctx, th, now);
    this._drawPieces(ctx, th, now);

    ctx.restore();
  }

  _drawFrame(ctx, th) {
    const pad = this._framePad;
    const s   = this._boardPx;
    ctx.fillStyle = numToHex(th.border);
    ctx.fillRect(-pad, -pad, s + pad * 2, s + pad * 2);
    // Gold accent strip along the top edge, echoing the 3D frame's top bar
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(-pad, -pad, s + pad * 2, Math.max(3, pad * 0.35));
  }

  _drawTiles(ctx, th) {
    const cell = this._cell;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const isLight = (r + c) % 2 === 0;
        ctx.fillStyle = numToHex(isLight ? th.lightTile : th.darkTile);
        ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
  }

  _drawHints(ctx, th, now) {
    if (!this._hints.length) return;
    const cell = this._cell;
    const pulse = 0.6 + 0.4 * Math.sin(now * 0.003);
    for (const h of this._hints) {
      const cx = h.col * cell + cell / 2;
      const cy = h.row * cell + cell / 2;
      const r  = cell * 0.16;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 255, 136, ${pulse})`;
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = cell * 0.25;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  _drawPieces(ctx, th, now) {
    const cell = this._cell;
    for (const piece of Object.values(this._pieces)) {
      this._drawOnePiece(ctx, th, piece, cell, now);
    }
  }

  _drawOnePiece(ctx, th, piece, cell, now) {
    const isWhite = piece.color === 'white';
    const baseR   = cell * 0.4;
    const hop     = piece._hop || 0;          // 0..1..0 across a move
    const r       = baseR * (1 + hop * 0.12); // slight grow at apex, like the 3D arc lift
    const cx = piece.x * cell;
    const cy = piece.y * cell - hop * cell * 0.22; // visual lift

    // Soft shadow — sits at the piece's logical (un-lifted) position so a
    // jumping piece visibly separates from its shadow at the apex.
    ctx.beginPath();
    ctx.ellipse(piece.x * cell, piece.y * cell + baseR * 0.15, baseR * 0.9, baseR * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,0,0,${0.35 - hop * 0.15})`;
    ctx.fill();

    // Body — radial gradient for a subtle sheen, same color slots as 3D
    const bodyColor = numToHex(isWhite ? th.whitePiece : th.blackPiece);
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    grad.addColorStop(0, lighten(bodyColor, 0.35));
    grad.addColorStop(1, bodyColor);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.strokeStyle = lighten(bodyColor, -0.35);
    ctx.stroke();

    // Concentric rings — echoes the torus detail rings from the 3D piece
    ctx.strokeStyle = isWhite ? 'rgba(180,150,100,0.6)' : 'rgba(0,0,0,0.45)';
    ctx.lineWidth = Math.max(1, r * 0.04);
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1 - i * 0.28), 0, Math.PI * 2);
      ctx.stroke();
    }

    // King crown
    if (piece.king) this._drawCrown(ctx, th, cx, cy, r, isWhite);

    // Selection glow ring
    if (this._selected && this._selected.row === piece.row && this._selected.col === piece.col) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, r * 0.12);
      ctx.strokeStyle = '#44aaff';
      ctx.shadowColor = '#44aaff';
      ctx.shadowBlur = r * 0.6;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  _drawCrown(ctx, th, cx, cy, r, isWhite) {
    const kingColor = numToHex(isWhite ? th.whiteKing : th.blackKing);
    const w = r * 1.1, h = r * 0.55;
    const y0 = cy - h * 0.35;

    ctx.beginPath();
    ctx.moveTo(cx - w / 2, y0 + h * 0.5);
    ctx.lineTo(cx - w / 2, y0);
    ctx.lineTo(cx - w / 4, y0 + h * 0.35);
    ctx.lineTo(cx, y0 - h * 0.15);
    ctx.lineTo(cx + w / 4, y0 + h * 0.35);
    ctx.lineTo(cx + w / 2, y0);
    ctx.lineTo(cx + w / 2, y0 + h * 0.5);
    ctx.closePath();
    ctx.fillStyle = kingColor;
    ctx.shadowColor = kingColor;
    ctx.shadowBlur = r * 0.3;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.strokeStyle = lighten(kingColor, -0.3);
    ctx.stroke();
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

    // Fit the largest square board that fits the container, centered —
    // mirrors how the 3D camera always framed a square board regardless
    // of the popup window's aspect ratio.
    const margin = Math.min(cssW, cssH) * 0.06;
    const avail  = Math.max(1, Math.min(cssW, cssH) - margin * 2);
    this._framePad  = avail * 0.045;
    this._boardPx   = avail - this._framePad * 2;
    this._cell      = this._boardPx / this.size;
    this._boardX    = (cssW - avail) / 2 + this._framePad;
    this._boardY    = (cssH - avail) / 2 + this._framePad;
  }

  onResize() { this._resize(); }

  destroy() {
    cancelAnimationFrame(this._rafId);
    if (this._ro) this._ro.disconnect();
    if (this._onWindowResize) window.removeEventListener('resize', this._onWindowResize);
  }
}

// ── Color helpers ────────────────────────────────────────────
// Theme color slots are numeric hex (Three.js style, e.g. 0xDEB887) for
// every value except boardBg, which is already a CSS string. Canvas 2D
// wants CSS strings everywhere, so numeric slots get converted on read.

function numToHex(n) {
  if (typeof n === 'string') return n; // already a CSS color (e.g. boardBg)
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
