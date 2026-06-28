// ============================================================
// GameEngine.js — Core state machine & orchestrator
// ============================================================
'use strict';

import { RuleProcessor } from './RuleProcessor.js';
import { EventBus } from './EventBus.js';

export class GameEngine {
  /**
   * @param {object} config
   * @param {string} config.gameType   'english' | 'russian'
   * @param {number} config.boardSize  8 (default)
   * @param {string} config.themePreset
   * @param {object} config.players   { white: PlayerProfile, black: PlayerProfile }
   */
  constructor(config = {}) {
    this.config = Object.assign({
      gameType: 'english',
      boardSize: 8,
      themePreset: 'classic',
      players: { white: null, black: null }
    }, config);

    this.rules      = new RuleProcessor(this.config.gameType, this.config.boardSize);
    this.bus        = new EventBus();
    this._reset();
  }

  // ── Public API ────────────────────────────────────────────

  /** Cold-start a fresh game. */
  startGame() {
    this._reset();
    this.status = 'playing';
    this.bus.emit('game:start', this._snapshot());
    this._notifyTurn();
  }

  /**
   * Attempt a move. Returns true on success.
   * @param {{row,col}} from
   * @param {{row,col}} to
   */
  move(from, to) {
    if (this.status !== 'playing') return false;

    const legal = this.rules.legalMoves(this.board, this.turn);
    const match = legal.find(m =>
      m.from.row === from.row && m.from.col === from.col &&
      m.to.row   === to.row   && m.to.col   === to.col
    );
    if (!match) return false;

    // Snapshot for undo
    this.history.push({
      board: this._cloneBoard(),
      turn:  this.turn,
      move:  match
    });

    // Apply
    this._applyMove(match);
    this.bus.emit('game:move', { move: match, board: this._cloneBoard(), turn: this.turn });

    // Check continuation (multi-jump)
    if (match.captured.length && this.rules.canContinueCapture(this.board, to, this.config.gameType)) {
      this.bus.emit('game:continuejump', { piece: to });
      return true;
    }

    // Switch turn
    this._endTurn();
    return true;
  }

  /** Undo last half-move. */
  undo() {
    if (!this.history.length) return false;
    const snap = this.history.pop();
    this.board  = snap.board;
    this.turn   = snap.turn;
    this.status = 'playing';
    this.bus.emit('game:undo', this._snapshot());
    this._notifyTurn();
    return true;
  }

  /** Get legal moves for a specific piece (for highlighting). */
  movesFor(row, col) {
    return this.rules.legalMoves(this.board, this.turn)
      .filter(m => m.from.row === row && m.from.col === col);
  }

  /** Get all legal moves for current player. */
  allLegalMoves() {
    return this.rules.legalMoves(this.board, this.turn);
  }

  get snapshot() { return this._snapshot(); }

  // ── Private ───────────────────────────────────────────────

  _reset() {
    this.board   = this.rules.initialBoard();
    this.turn    = 'black';   // black / dark pieces move first per standard rules
    this.status  = 'idle';    // idle | playing | ended
    this.winner  = null;
    this.history = [];
    this.moveCount = 0;
  }

  _applyMove(move) {
    const { from, to, captured, promote } = move;
    const piece = this.board[from.row][from.col];

    this.board[to.row][to.col]     = promote ? { ...piece, king: true } : piece;
    this.board[from.row][from.col] = null;

    for (const cap of captured) {
      this.board[cap.row][cap.col] = null;
    }
    this.moveCount++;
  }

  _endTurn() {
    this.turn = this.turn === 'black' ? 'white' : 'black';

    // Win / draw detection
    const result = this.rules.checkGameOver(this.board, this.turn, this.moveCount);
    if (result.over) {
      this.status = 'ended';
      this.winner = result.winner;
      this.bus.emit('game:over', { winner: this.winner, reason: result.reason });

      // Update player stats
      const wp = this.config.players.white;
      const bp = this.config.players.black;
      if (wp && bp) {
        if (result.winner === 'white') { wp.wins++; bp.losses++; }
        else if (result.winner === 'black') { bp.wins++; wp.losses++; }
        wp.save(); bp.save();
      }
      return;
    }
    this._notifyTurn();
  }

  _notifyTurn() {
    this.bus.emit('game:turn', {
      turn:  this.turn,
      moves: this.rules.legalMoves(this.board, this.turn),
      board: this._cloneBoard()
    });
  }

  _snapshot() {
    return {
      board:     this._cloneBoard(),
      turn:      this.turn,
      status:    this.status,
      winner:    this.winner,
      moveCount: this.moveCount,
      gameType:  this.config.gameType
    };
  }

  _cloneBoard() {
    return this.board.map(row => row.map(cell => cell ? { ...cell } : null));
  }
}
