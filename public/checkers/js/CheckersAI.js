// ============================================================
// CheckersAI.js — Single-player opponent (minimax + alpha-beta)
// ============================================================
// Plays one full turn for a given color against a board produced by
// RuleProcessor. Deliberately built as a thin layer ON TOP of
// RuleProcessor rather than re-implementing capture/promotion rules: every
// move the AI considers comes from rules.legalMoves(), so it automatically
// respects whichever variant (English/Russian) the match is using,
// including mandatory captures, multi-jump chains, and flying kings — the
// AI can never produce a move the rules engine itself wouldn't allow.
//
// Strength target: "a solid, reasonable opponent" — not a tournament
// engine. Depth 4 with alpha-beta keeps this fast enough to run on a
// phone's main thread (typically a few hundred legal-move evaluations,
// well under what'd cause a noticeable freeze), while still punishing
// careless trades and finding most short tactical sequences.
'use strict';

export class CheckersAI {
  /**
   * @param {RuleProcessor} rules  Shared rules engine instance (same one
   *   the human game uses) — guarantees the AI's move generation always
   *   matches the active variant exactly.
   * @param {string} color  'white' | 'black' — which side the AI plays.
   * @param {object} [opts]
   * @param {number} [opts.depth=4]  Minimax search depth (half-moves).
   */
  constructor(rules, color, opts = {}) {
    this.rules = rules;
    this.color = color;
    this.depth = opts.depth ?? 4;
  }

  /**
   * Pick a move for the AI's color on the given board.
   * @returns {{from:{row,col}, to:{row,col}, captured:Array, promote:bool} | null}
   *   null only if the AI genuinely has no legal moves (game should already
   *   be detected as over by the caller in that case).
   */
  chooseMove(board) {
    const moves = this.rules.legalMoves(board, this.color);
    if (!moves.length) return null;
    if (moves.length === 1) return moves[0]; // forced — skip the search entirely

    const opponent = this.color === 'white' ? 'black' : 'white';
    let best = [];
    let bestScore = -Infinity;

    for (const move of moves) {
      const next = this._applyMove(board, move);
      const score = -this._negamax(next, opponent, this.depth - 1, -Infinity, Infinity);
      if (score > bestScore) {
        bestScore = score;
        best = [move];
      } else if (score === bestScore) {
        best.push(move);
      }
    }

    // Among equally-good moves, pick randomly so the AI doesn't play the
    // exact same line every time you replay the same position — feels
    // less robotic without weakening play (these are genuine ties).
    return best[Math.floor(Math.random() * best.length)];
  }

  // ── Search ─────────────────────────────────────────────────
  // Negamax: same algorithm as minimax, but every recursive call returns
  // the score from the *current* player's point of view and the caller
  // negates it — avoids tracking separate maximize/minimize branches.

  _negamax(board, colorToMove, depth, alpha, beta) {
    const moves = this.rules.legalMoves(board, colorToMove);

    if (!moves.length) {
      // No legal moves = this side has lost (covers both "no pieces left"
      // and "no moves available" — RuleProcessor.checkGameOver treats both
      // as a loss for colorToMove). Make losing here look maximally bad
      // but still depth-aware, so a forced loss further away is preferred
      // over one right now (gives the opponent more chances to slip up).
      return -1000 - depth;
    }

    if (depth === 0) {
      return this._evaluate(board, colorToMove);
    }

    const opponent = colorToMove === 'white' ? 'black' : 'white';
    let value = -Infinity;

    for (const move of moves) {
      const next = this._applyMove(board, move);
      const score = -this._negamax(next, opponent, depth - 1, -beta, -alpha);
      if (score > value) value = score;
      if (value > alpha) alpha = value;
      if (alpha >= beta) break; // alpha-beta cutoff
    }

    return value;
  }

  // ── Board Evaluation ─────────────────────────────────────────
  // Positive = good for `forColor`. Weights: a king is worth roughly 1.7
  // men (kings dominate endgames but men aren't disposable), a small
  // mobility term rewards keeping options open, and a centrality term
  // very mildly favors controlling the middle of the board over the
  // edges — edge pieces have fewer ways to capture or be captured.

  _evaluate(board, forColor) {
    const other = forColor === 'white' ? 'black' : 'white';
    let score = 0;

    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        const cell = board[r][c];
        if (!cell) continue;

        let value = cell.king ? 170 : 100;

        // Centrality bonus: distance from the nearest edge column, scaled
        // small enough to never outweigh material.
        const distFromEdge = Math.min(c, board[r].length - 1 - c);
        value += distFromEdge * 2;

        score += cell.color === forColor ? value : -value;
      }
    }

    // Mobility: having more legal moves than the opponent is a mild
    // positive signal (more options, harder to zugzwang) — weighted low
    // so it never overrides a material difference.
    const myMoves    = this.rules.legalMoves(board, forColor).length;
    const theirMoves = this.rules.legalMoves(board, other).length;
    score += (myMoves - theirMoves) * 1.5;

    return score;
  }

  // ── Move Application ─────────────────────────────────────────
  // Mirrors GameEngine._applyMove exactly, but on a throwaway board copy —
  // the AI's search must never mutate the real game board.

  _applyMove(board, move) {
    const next  = board.map(row => row.map(cell => (cell ? { ...cell } : null)));
    const piece = next[move.from.row][move.from.col];

    next[move.to.row][move.to.col]     = move.promote ? { ...piece, king: true } : piece;
    next[move.from.row][move.from.col] = null;

    for (const cap of move.captured) {
      next[cap.row][cap.col] = null;
    }

    return next;
  }
}
