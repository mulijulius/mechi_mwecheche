// ============================================================
// RuleProcessor.js — Ludo board layout & move validation
// ============================================================
// Ported from the original TypeScript core (boardLayout.ts + moveLogic.ts)
// into a vanilla-JS ES module so it can be served statically and dynamically
// imported at runtime, exactly the way public/checkers/js/RuleProcessor.js
// is — no build step, no bundler involvement.
'use strict';

export const COLORS = ['red', 'green', 'yellow', 'blue'];

export const PATH_LENGTH         = 51;   // shared ring squares per color (0..50)
export const HOME_STRETCH_LENGTH = 6;    // local 51..56
export const FINISHED_INDEX      = 57;
export const GLOBAL_RING_LENGTH  = 52;

export const START_OFFSET = { red: 0, green: 13, yellow: 26, blue: 39 };

// Safe squares (global ring indices): each color's start square + 4 stars.
export const SAFE_SQUARES_GLOBAL = [0, 8, 13, 21, 26, 34, 39, 47];

/** Local pathIndex (0-50, relative to `color`) → global ring index (0-51). */
export function localToGlobal(color, localIndex) {
  if (localIndex < 0 || localIndex > 50) return null; // yard or home-stretch/finished
  return (START_OFFSET[color] + localIndex) % GLOBAL_RING_LENGTH;
}

export function isSafeSquare(color, localIndex) {
  const g = localToGlobal(color, localIndex);
  if (g === null) return true; // home stretch is a private lane, always safe
  return SAFE_SQUARES_GLOBAL.includes(g);
}

export class RuleProcessor {
  constructor() {
    this.colors = COLORS;
  }

  // ── Board / state initialization ──────────────────────────

  /**
   * @param {string[]} playerIds  2-4 user ids, in seat order (seat 0 = red)
   */
  initialState(matchId, playerIds) {
    if (playerIds.length < 2 || playerIds.length > 4) {
      throw new Error('Ludo requires 2-4 players');
    }
    const players = playerIds.map((id, i) => ({
      id,
      color: COLORS[i],
      isActive: true,
      consecutiveSixes: 0,
      tokens: Array.from({ length: 4 }, (_, t) => ({
        id: `${COLORS[i]}-${t}`,
        color: COLORS[i],
        state: 'home',
        pathIndex: -1,
      })),
    }));

    const now = Date.now();
    return {
      matchId,
      players,
      currentTurnPlayerId: players[0].id,
      turnIndex: 0,
      phase: 'rolling',
      lastDiceValue: null,
      consecutiveSixCount: 0,
      winnerOrder: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  // ── Legal move generation ─────────────────────────────────

  /** All tokens of `player` that can legally move given a dice value. */
  getLegalMoves(state, player, diceValue) {
    const moves = [];

    for (const token of player.tokens) {
      if (token.state === 'finished') continue;

      if (token.state === 'home') {
        if (diceValue === 6) {
          const captured = this._findCapturesAt(state, player, 0);
          moves.push({ tokenId: token.id, fromIndex: -1, toIndex: 0, isSpawn: true, capturedTokenIds: captured });
        }
        continue;
      }

      const target = token.pathIndex + diceValue;
      if (target > FINISHED_INDEX) continue; // overshoot, illegal
      if (target === FINISHED_INDEX) {
        moves.push({ tokenId: token.id, fromIndex: token.pathIndex, toIndex: FINISHED_INDEX, isSpawn: false, capturedTokenIds: [] });
        continue;
      }
      const captured = target <= 50 ? this._findCapturesAt(state, player, target) : [];
      moves.push({ tokenId: token.id, fromIndex: token.pathIndex, toIndex: target, isSpawn: false, capturedTokenIds: captured });
    }

    return moves;
  }

  _findCapturesAt(state, mover, moverLocalIndex) {
    if (isSafeSquare(mover.color, moverLocalIndex)) return [];
    const moverGlobal = localToGlobal(mover.color, moverLocalIndex);
    if (moverGlobal === null) return [];

    const captured = [];
    for (const opp of state.players) {
      if (opp.id === mover.id) continue;
      for (const t of opp.tokens) {
        if (t.state !== 'active') continue;
        const g = localToGlobal(t.color, t.pathIndex);
        if (g === moverGlobal) captured.push(t.id);
      }
    }
    return captured;
  }

  /** Applies a chosen legal move to the state, mutating it in place. */
  applyMove(state, player, move) {
    const token = player.tokens.find(t => t.id === move.tokenId);

    token.pathIndex = move.toIndex;
    token.state = move.toIndex === FINISHED_INDEX ? 'finished' : 'active';

    for (const capturedId of move.capturedTokenIds) {
      for (const p of state.players) {
        const ct = p.tokens.find(t => t.id === capturedId);
        if (ct) { ct.state = 'home'; ct.pathIndex = -1; }
      }
    }

    const grantedExtraTurn = move.capturedTokenIds.length > 0 || token.state === 'finished';
    state.updatedAt = Date.now();

    return {
      playerId: player.id,
      tokenId: token.id,
      fromIndex: move.fromIndex,
      toIndex: move.toIndex,
      capturedTokenIds: move.capturedTokenIds,
      grantedExtraTurn,
    };
  }

  hasPlayerWon(player) {
    return player.tokens.every(t => t.state === 'finished');
  }
}
