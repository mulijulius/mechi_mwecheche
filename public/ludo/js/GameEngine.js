// ============================================================
// GameEngine.js — Core state machine & orchestrator (Ludo)
// ============================================================
// Same role as public/checkers/js/GameEngine.js: a local rules-validator
// and turn manager that both seated clients run identical copies of. The
// *rendered* state always comes from the server (game_state/current_seat
// columns), applied via applyServerState() in play.html — exactly like
// checkers' applyServerState(). This engine is what computes that server
// state in the first place, and what locally validates a pick before it's
// sent to the server.
'use strict';

import { RuleProcessor, COLORS } from './RuleProcessor.js';
import { EventBus } from './Modules.js';

/** Uniform 1-6 via rejection sampling on a crypto byte (ported from diceLogic.ts). */
function rollDie() {
  const buf = new Uint8Array(1);
  let value;
  do {
    crypto.getRandomValues(buf);
    value = buf[0] % 6;
  } while (buf[0] >= 252); // discard biased tail (252 = 6*42)
  return value + 1;
}

/** Resolves a roll against the player's current six-streak (ported from diceLogic.ts). */
function resolveDiceOutcome(value, consecutiveSixesSoFar) {
  const isSix = value === 6;
  if (isSix) {
    const newStreak = consecutiveSixesSoFar + 1;
    if (newStreak >= 3) {
      return { value, isSix, grantsExtraTurn: false, forfeitsTurnDueToTripleSix: true };
    }
    return { value, isSix, grantsExtraTurn: true, forfeitsTurnDueToTripleSix: false };
  }
  return { value, isSix: false, grantsExtraTurn: false, forfeitsTurnDueToTripleSix: false };
}

export class GameEngine {
  /**
   * @param {object} config
   * @param {string[]} config.playerIds   2-4 user ids, seat order = turn order
   * @param {string} config.matchId
   * @param {string} config.themePreset
   */
  constructor(config = {}) {
    this.config = Object.assign({
      playerIds: [],
      matchId: 'local',
      themePreset: 'classic',
    }, config);

    this.rules = new RuleProcessor();
    this.bus   = new EventBus();
    this._reset();
  }

  // ── Public API ────────────────────────────────────────────

  /** Cold-start a fresh game. */
  startGame() {
    this.state = this.rules.initialState(this.config.matchId, this.config.playerIds);
    this.status = 'playing';
    this.winnerOrder = [];
    this.moveCount = 0;
    this.bus.emit('game:start', this.snapshot);
    this._notifyTurn();
  }

  get currentPlayer() {
    return this.state.players[this.state.turnIndex];
  }

  get phase() { return this.state.phase; }
  get turn()  { return this.state.turnIndex; }
  get lastDiceValue() { return this.state.lastDiceValue; }

  /** Step 1 of a turn: roll the die for the current player. */
  roll() {
    if (this.status !== 'playing') return null;
    if (this.state.phase !== 'rolling') return null;

    const player = this.currentPlayer;
    const value = rollDie();
    const outcome = resolveDiceOutcome(value, this.state.consecutiveSixCount);
    this.state.lastDiceValue = value;
    this.moveCount++;

    if (outcome.forfeitsTurnDueToTripleSix) {
      this.bus.emit('game:roll', { playerId: player.id, value, autoSkipped: true });
      this._advanceTurn();
      return { diceValue: value, legalMoves: [], autoSkipped: true };
    }

    if (outcome.isSix) this.state.consecutiveSixCount += 1;

    const legalMoves = this.rules.getLegalMoves(this.state, player, value);

    this.bus.emit('game:roll', { playerId: player.id, value, autoSkipped: legalMoves.length === 0 });

    if (legalMoves.length === 0) {
      this._advanceTurn();
      return { diceValue: value, legalMoves: [], autoSkipped: true };
    }

    this.state.phase = 'moving';
    return { diceValue: value, legalMoves, autoSkipped: false };
  }

  /** Get legal moves for the current dice roll (for highlighting tappable tokens). */
  allLegalMoves() {
    if (this.state.phase !== 'moving' || this.state.lastDiceValue === null) return [];
    return this.rules.getLegalMoves(this.state, this.currentPlayer, this.state.lastDiceValue);
  }

  /** Step 2 of a turn: apply the chosen token's move. Returns the MoveEvent or null if illegal. */
  move(tokenId) {
    if (this.status !== 'playing' || this.state.phase !== 'moving') return null;

    const player = this.currentPlayer;
    const legal = this.allLegalMoves();
    const match = legal.find(m => m.tokenId === tokenId);
    if (!match) return null;

    this.moveCount++;
    const moveEvent = this.rules.applyMove(this.state, player, match);

    this.bus.emit('game:move', { move: moveEvent, state: this.snapshot });

    if (this.rules.hasPlayerWon(player) && !this.state.winnerOrder.includes(player.id)) {
      this.state.winnerOrder.push(player.id);
    }

    const remaining = this.state.players.filter(p => p.isActive && !this.rules.hasPlayerWon(p));
    if (remaining.length <= 1) {
      this.status = 'ended';
      this.winner = remaining.length === 1 ? remaining[0].id : (this.state.winnerOrder[0] ?? null);
      if (remaining.length === 1 && !this.state.winnerOrder.includes(remaining[0].id)) {
        this.state.winnerOrder.push(remaining[0].id);
      }
      this.state.phase = 'finished';
      this.bus.emit('game:over', { winner: this.winner, winnerOrder: this.state.winnerOrder });
      return moveEvent;
    }

    if (moveEvent.grantedExtraTurn) {
      this.state.phase = 'rolling';
      this.state.lastDiceValue = null;
      this.bus.emit('game:turn', { playerId: player.id, extraTurn: true, state: this.snapshot });
    } else {
      this._advanceTurn();
    }

    return moveEvent;
  }

  /** Mark a seat as having left the match (forfeit). Mirrors leave_ludo_contest's
   *  server-side bookkeeping so the local turn rotation skips that seat too. */
  forfeitSeat(playerId) {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || !player.isActive) return;
    player.isActive = false;

    const remaining = this.state.players.filter(p => p.isActive && !this.rules.hasPlayerWon(p));
    if (remaining.length <= 1) {
      this.status = 'ended';
      this.winner = remaining.length === 1 ? remaining[0].id : null;
      this.state.phase = 'finished';
      this.bus.emit('game:over', { winner: this.winner, winnerOrder: this.state.winnerOrder, forfeited: true });
      return;
    }

    if (this.currentPlayer.id === playerId) {
      this._advanceTurn();
    }
  }

  get snapshot() {
    return {
      ...this.state,
      status: this.status,
      moveCount: this.moveCount,
    };
  }

  /** Restore from a server-persisted state blob (used on resume/sync). */
  loadState(state, moveCount) {
    this.state = state;
    this.status = state.phase === 'finished' ? 'ended' : 'playing';
    this.moveCount = moveCount || 0;
  }

  // ── Private ───────────────────────────────────────────────

  _reset() {
    this.state = null;
    this.status = 'idle'; // idle | playing | ended
    this.winner = null;
    this.moveCount = 0;
  }

  _advanceTurn() {
    this.state.consecutiveSixCount = 0;
    const remaining = this.state.players.filter(p => p.isActive && !this.rules.hasPlayerWon(p));

    if (remaining.length <= 1) {
      this.status = 'ended';
      this.winner = remaining.length === 1 ? remaining[0].id : null;
      if (remaining.length === 1 && !this.state.winnerOrder.includes(remaining[0].id)) {
        this.state.winnerOrder.push(remaining[0].id);
      }
      this.state.phase = 'finished';
      this.bus.emit('game:over', { winner: this.winner, winnerOrder: this.state.winnerOrder });
      return;
    }

    let next = this.state.turnIndex;
    do {
      next = (next + 1) % this.state.players.length;
    } while (!this.state.players[next].isActive || this.rules.hasPlayerWon(this.state.players[next]));

    this.state.turnIndex = next;
    this.state.currentTurnPlayerId = this.state.players[next].id;
    this.state.phase = 'rolling';
    this.state.lastDiceValue = null;

    this._notifyTurn();
  }

  _notifyTurn() {
    this.bus.emit('game:turn', { playerId: this.currentPlayer.id, extraTurn: false, state: this.snapshot });
  }
}

export { COLORS };
