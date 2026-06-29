// ============================================================
// App.js — Main controller
// ============================================================
'use strict';

import { GameEngine }   from './GameEngine.js';
import { Renderer2D }   from './Renderer2D.js';
import { ThemeManager, THEMES } from './Modules.js';
import { PlayerProfile, TrialManager } from './Modules.js';
import { CheckersAI }    from './CheckersAI.js';

export class App {
  constructor() {
    this.themeManager = new ThemeManager('classic');
    this.players = {
      white: new PlayerProfile('p1', 'Player 1'),
      black: new PlayerProfile('p2', 'Player 2')
    };
    // A separate, stable profile id for the bot so its W/L record persists
    // across sessions independently of whatever human name currently
    // occupies the p2 slot.
    this.aiProfile = new PlayerProfile('ai-bot', 'Computer');

    this._engine   = null;
    this._renderer = null;
    this._waitingForJump = null; // for multi-jump continuation
    this._ai       = null;       // CheckersAI instance, set when vs-AI is active
    this._aiColor  = null;       // 'white' | 'black' | null (null = no AI this game)
    this._aiThinking = false;    // true while the AI's move is being computed/animated

    this._buildUI();
    this._showScreen('home');
  }

  // ── UI Construction ───────────────────────────────────────

  _buildUI() {
    document.getElementById('btn-start').addEventListener('click', () => this._tryStartGame());
    document.getElementById('btn-undo').addEventListener('click',  () => this._doUndo());
    document.getElementById('btn-resign').addEventListener('click',() => this._doResign());
    document.getElementById('btn-new').addEventListener('click',   () => this._showScreen('home'));
    document.getElementById('btn-rules').addEventListener('click', () => this._toggleRulesPanel());

    // Theme buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => this._applyTheme(btn.dataset.theme));
    });

    // Game type selector
    document.getElementById('game-type').addEventListener('change', e => {
      document.getElementById('rules-desc').textContent = e.target.value === 'english'
        ? 'English Draughts: diagonal forward movement, mandatory captures, kings move one step.'
        : 'Russian Checkers: kings fly along diagonals, captures in all directions, mandatory.';
    });

    // Canvas click
    const canvas = document.getElementById('game-canvas');
    canvas.addEventListener('click',      e => this._onCanvasClick(e));
    canvas.addEventListener('touchstart', e => { e.preventDefault(); this._onCanvasClick(e.touches[0]); }, { passive: false });

    window.addEventListener('resize', () => { if (this._renderer) this._renderer.onResize(); });

    // Player name inputs
    ['p1', 'p2'].forEach(id => {
      document.getElementById(`name-${id}`).addEventListener('input', e => {
        const which = id === 'p1' ? 'white' : 'black';
        this.players[which].displayName = e.target.value || (id === 'p1' ? 'Player 1' : 'Player 2');
      });
    });

    // Play vs AI toggle
    const aiToggle = document.getElementById('vs-ai-toggle');
    aiToggle.addEventListener('change', () => this._setAIModeUI(aiToggle.checked));
    document.querySelectorAll('input[name="ai-color"]').forEach(radio => {
      radio.addEventListener('change', () => this._updateAIColorPreview());
    });
  }

  // Toggling "Play vs AI" replaces whichever name input belongs to the
  // bot's chosen color with a disabled "Computer" field, and reveals the
  // color-choice control. Re-toggling off restores normal two-human setup.
  _setAIModeUI(enabled) {
    document.getElementById('ai-color-row').classList.toggle('hidden', !enabled);
    this._updateAIColorPreview();
  }

  _updateAIColorPreview() {
    const enabled  = document.getElementById('vs-ai-toggle').checked;
    const aiPlaysWhite = document.querySelector('input[name="ai-color"]:checked')?.value === 'white';

    const p1Input = document.getElementById('name-p1'); // white
    const p2Input = document.getElementById('name-p2'); // black

    if (!enabled) {
      p1Input.disabled = false; p1Input.placeholder = 'Light Player';
      p2Input.disabled = false; p2Input.placeholder = 'Dark Player';
      if (p1Input.value === 'Computer') p1Input.value = 'Player 1';
      if (p2Input.value === 'Computer') p2Input.value = 'Player 2';
      return;
    }

    const aiInput   = aiPlaysWhite ? p1Input : p2Input;
    const humanInput = aiPlaysWhite ? p2Input : p1Input;

    aiInput.disabled = true;
    aiInput.value = 'Computer';
    humanInput.disabled = false;
    if (humanInput.value === 'Computer') {
      humanInput.value = humanInput === p1Input ? 'Player 1' : 'Player 2';
    }
  }

  // ── Game Lifecycle ────────────────────────────────────────

  _tryStartGame() {
    if (!TrialManager.canPlay()) {
      this._showToast('Daily limit reached! 3 free matches per day. Come back tomorrow.', 'warn');
      return;
    }

    const gameType = document.getElementById('game-type').value;
    const theme    = this.themeManager.current;
    const vsAI     = document.getElementById('vs-ai-toggle').checked;
    this._aiColor  = vsAI
      ? (document.querySelector('input[name="ai-color"]:checked')?.value || 'black')
      : null;

    // Update player names from inputs
    this.players.white.displayName = document.getElementById('name-p1').value || 'Player 1';
    this.players.black.displayName = document.getElementById('name-p2').value || 'Player 2';

    // Build this game's white/black -> profile lookup. this.players.white/
    // .black always stay the two persistent HUMAN profiles (p1/p2) — we
    // never overwrite them — so switching back to a human-vs-human game
    // later is always clean. Instead, _activePlayers is a fresh per-game
    // substitution that swaps in the bot's profile for whichever color
    // it's playing this round.
    this._activePlayers = {
      white: this._aiColor === 'white' ? this.aiProfile : this.players.white,
      black: this._aiColor === 'black' ? this.aiProfile : this.players.black,
    };

    // Destroy old renderer
    if (this._renderer) { this._renderer.destroy(); this._renderer = null; }

    // Build engine
    this._engine = new GameEngine({
      gameType,
      boardSize: 8,
      themePreset: theme.id,
      players: this._activePlayers
    });

    // Show game screen, then init renderer (canvas must be visible)
    this._showScreen('game');

    requestAnimationFrame(() => {
      const canvas = document.getElementById('game-canvas');
      this._renderer = new Renderer2D(canvas, theme);
      this._wireEngineEvents();
      this._engine.startGame();
      TrialManager.recordMatch();
      this._updateTrialBadge();
    });
  }

  _wireEngineEvents() {
    const eng = this._engine;
    const bus = eng.bus;

    bus.on('game:start', snap => {
      this._renderer.syncPieces(snap.board);
      this._updateSidebar(snap);
      this._maybeTriggerAI();
    });

    bus.on('game:turn', data => {
      this._renderer.syncPieces(data.board);
      this._updateSidebar({ turn: data.turn, board: data.board });
      this._waitingForJump = null;
      this._maybeTriggerAI();
    });

    bus.on('game:move', data => {
      // Renderer animation is triggered from click handler
    });

    bus.on('game:continuejump', data => {
      this._waitingForJump = data.piece;
      // Only show the "keep capturing" toast for the human — the AI
      // doesn't need it, and legalMoves() already hands the AI the whole
      // jump chain as one move, so it never actually lands in this
      // mid-jump state to begin with. This fires only for human multi-jumps.
      if (data.piece && this._aiColor !== eng.turn) {
        this._showToast('Continue your capture!', 'info');
      }
    });

    bus.on('game:undo', snap => {
      this._renderer.syncPieces(snap.board);
      this._updateSidebar(snap);
      this._waitingForJump = null;
    });

    bus.on('game:over', data => {
      this._aiThinking = false;
      setTimeout(() => this._showResult(data), 400);
    });
  }

  // ── AI Turn ────────────────────────────────────────────────
  // Called after every turn change. If it's now the bot's turn, compute
  // and play its move on a short delay — purely cosmetic (so the move
  // doesn't appear instantaneously, which reads as jarring/unnatural),
  // but also gives the board a moment to finish the human's own move
  // animation before the bot's move starts.

  _maybeTriggerAI() {
    const eng = this._engine;
    if (!eng || eng.status !== 'playing') return;
    if (eng.turn !== this._aiColor) return;
    if (this._aiThinking) return; // already scheduled/running

    this._aiThinking = true;
    setTimeout(() => this._playAITurn(), 450);
  }

  _playAITurn() {
    const eng = this._engine;
    if (!eng || eng.status !== 'playing' || eng.turn !== this._aiColor) {
      this._aiThinking = false;
      return;
    }

    if (!this._ai || this._ai.color !== this._aiColor || this._ai.rules !== eng.rules) {
      this._ai = new CheckersAI(eng.rules, this._aiColor, { depth: 4 });
    }

    const move = this._ai.chooseMove(eng.board);
    if (!move) {
      // No legal moves — GameEngine's own checkGameOver (run inside the
      // turn switch that got us here) should already have ended the game
      // before we'd ever reach this branch, but bail safely either way.
      this._aiThinking = false;
      return;
    }

    this._renderer.clearSelection();
    this._selectedPos = null;
    this._renderer.animateMove(move.from, move.to, move.captured, () => {
      eng.move(move.from, move.to);
      this._aiThinking = false;
    });
  }

  // ── Canvas Interaction ───────────────────────────────────

  _onCanvasClick(e) {
    if (!this._renderer || !this._engine || this._engine.status !== 'playing') return;
    if (this._aiThinking || this._engine.turn === this._aiColor) return;

    const hit = this._renderer.pick(e.clientX, e.clientY);
    if (!hit) {
      this._renderer.clearSelection();
      this._selectedPos = null;
      return;
    }

    const { row, col } = hit;

    // If waiting for continuation jump, only allow moves from that piece
    if (this._waitingForJump) {
      const wj = this._waitingForJump;
      if (hit.type === 'hint') {
        this._executeMove(wj, { row, col });
      }
      return;
    }

    if (hit.type === 'piece' && hit.color === this._engine.turn) {
      // Select piece
      this._selectedPos = { row, col };
      this._renderer.selectPiece(row, col);
      const moves = this._engine.movesFor(row, col);
      this._renderer.showHints(moves);
      return;
    }

    if ((hit.type === 'hint' || hit.type === 'tile') && this._selectedPos) {
      this._executeMove(this._selectedPos, { row, col });
      return;
    }

    // Clicked non-own piece or empty tile without selection
    this._renderer.clearSelection();
    this._selectedPos = null;
  }

  _executeMove(from, to) {
    const legal = this._engine.allLegalMoves();
    const match = legal.find(m =>
      m.from.row === from.row && m.from.col === from.col &&
      m.to.row   === to.row   && m.to.col   === to.col
    );

    if (!match) {
      this._showToast('Invalid move', 'warn');
      return;
    }

    // Animate first, then apply
    this._renderer.clearSelection();
    this._selectedPos = null;
    this._renderer.animateMove(from, to, match.captured, () => {
      this._engine.move(from, to);
    });
  }

  // ── Resign / Undo ─────────────────────────────────────────

  _doResign() {
    if (!this._engine || this._engine.status !== 'playing') return;
    if (this._aiThinking) return; // let the AI finish its move first
    const loser  = this._engine.turn;
    const winner = loser === 'black' ? 'white' : 'black';
    this._engine.status = 'ended';
    this._aiThinking = false;
    this._showResult({ winner, reason: 'resignation' });
  }

  _doUndo() {
    if (!this._engine) return;
    if (this._aiThinking) return; // AI's move is already in flight — let it land first
    this._engine.undo();
    // Against the AI, one undo should return control to the human rather
    // than leaving it the AI's turn again (which would just replay the
    // same AI move right back) — so when undoing lands on the bot's
    // turn, undo once more to also roll back its reply.
    if (this._aiColor && this._engine.turn === this._aiColor && this._engine.history.length) {
      this._engine.undo();
    }
  }

  // ── Results Modal ─────────────────────────────────────────

  _showResult(data) {
    const { winner, reason } = data;
    const modal = document.getElementById('result-modal');

    const wp = this._activePlayers.white;
    const bp = this._activePlayers.black;

    let title, sub;
    if (!winner) {
      title = '🤝 Draw!';
      sub   = 'No moves available — it\'s a stalemate!';
    } else {
      const name = winner === 'white' ? wp.displayName : bp.displayName;
      title = `🏆 ${name} Wins!`;
      sub   = reason === 'resignation' ? 'by resignation' : `by ${reason.replace('-', ' ')}`;
    }

    document.getElementById('result-title').textContent = title;
    document.getElementById('result-sub').textContent   = sub;

    document.getElementById('result-stats').innerHTML = `
      <div class="stat-row"><span>${wp.displayName}</span><span>${wp.wins}W / ${wp.losses}L</span></div>
      <div class="stat-row"><span>${bp.displayName}</span><span>${bp.wins}W / ${bp.losses}L</span></div>
    `;

    modal.classList.remove('hidden');
    document.getElementById('btn-play-again').onclick = () => {
      modal.classList.add('hidden');
      this._tryStartGame();
    };
    document.getElementById('btn-main-menu').onclick = () => {
      modal.classList.add('hidden');
      this._showScreen('home');
    };
  }

  // ── Sidebar & HUD ─────────────────────────────────────────

  _updateSidebar(snap) {
    const { turn, board } = snap;
    const wp = this._activePlayers.white;
    const bp = this._activePlayers.black;

    // Count pieces
    let wCount = 0, bCount = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell?.color === 'white') wCount++;
        if (cell?.color === 'black') bCount++;
      }
    }

    document.getElementById('p1-name').textContent   = wp.displayName;
    document.getElementById('p2-name').textContent   = bp.displayName;
    document.getElementById('p1-count').textContent  = wCount;
    document.getElementById('p2-count').textContent  = bCount;
    document.getElementById('p1-wins').textContent   = `${wp.wins}W ${wp.losses}L`;
    document.getElementById('p2-wins').textContent   = `${bp.wins}W ${bp.losses}L`;

    document.getElementById('p1-card').classList.toggle('active-turn', turn === 'white');
    document.getElementById('p2-card').classList.toggle('active-turn', turn === 'black');

    document.getElementById('turn-indicator').textContent =
      turn === 'white' ? `${wp.displayName}'s turn` : `${bp.displayName}'s turn`;
  }

  // ── Theme ─────────────────────────────────────────────────

  _applyTheme(themeId) {
    this.themeManager.apply(themeId);
    const theme = this.themeManager.current;
    if (this._renderer) this._renderer.applyTheme(theme);
    document.documentElement.style.setProperty('--board-bg', theme.boardBg);
    document.querySelectorAll('.theme-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === themeId);
    });
  }

  // ── Screens ───────────────────────────────────────────────

  _showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(`screen-${name}`).classList.remove('hidden');
    if (name === 'home') {
      this._updateTrialBadge();
      // Leaving the game screen ends the current game outright — this
      // matters specifically for the AI's pending setTimeout in
      // _maybeTriggerAI: setting status off 'playing' makes _playAITurn's
      // own guard bail instead of moving on a game the player already left.
      if (this._engine) this._engine.status = 'ended';
      this._aiThinking = false;
    }
  }

  _updateTrialBadge() {
    const rem = TrialManager.remaining();
    document.getElementById('trial-badge').textContent = `${rem} free match${rem !== 1 ? 'es' : ''} remaining today`;
    document.getElementById('trial-badge').className   = rem === 0 ? 'badge badge-red' : 'badge badge-green';
  }

  _toggleRulesPanel() {
    document.getElementById('rules-panel').classList.toggle('hidden');
  }

  _showToast(msg, type = 'info') {
    const t = document.getElementById('toast');
    t.textContent  = msg;
    t.className    = `toast toast-${type} show`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.className = 'toast hidden', 2800);
  }
}
