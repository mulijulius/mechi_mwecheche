// ============================================================
// RuleProcessor.js — Move validation & rule variants
// ============================================================
'use strict';

export class RuleProcessor {
  constructor(gameType = 'english', boardSize = 8) {
    this.gameType  = gameType;
    this.boardSize = boardSize;
    this.NO_PROGRESS_LIMIT = 40; // half-moves without capture → draw
  }

  // ── Board Initialization ──────────────────────────────────

  initialBoard() {
    const size  = this.boardSize;
    const board = Array.from({ length: size }, () => Array(size).fill(null));
    const rows  = Math.floor(size / 2) - 1; // rows per side

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < size; c++) {
        if ((r + c) % 2 === 1) {
          board[r][c] = { color: 'white', king: false };
        }
      }
    }
    for (let r = size - rows; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if ((r + c) % 2 === 1) {
          board[r][c] = { color: 'black', king: false };
        }
      }
    }
    return board;
  }

  // ── Legal Move Generation ─────────────────────────────────

  /**
   * Returns all legal moves for `color`.
   * Each move: { from:{row,col}, to:{row,col}, captured:[{row,col}], promote:bool }
   */
  legalMoves(board, color) {
    const captures = this._allCaptures(board, color);
    if (captures.length) return captures; // forced capture rule

    return this._allSimpleMoves(board, color);
  }

  canContinueCapture(board, pos, gameType) {
    return this._capturesFrom(board, pos.row, pos.col, board[pos.row][pos.col], gameType === 'russian').length > 0;
  }

  // ── Win / Draw Detection ──────────────────────────────────

  /**
   * @returns {{ over:bool, winner:string|null, reason:string }}
   */
  checkGameOver(board, colorToMove, moveCount) {
    const pieces = this._pieces(board, colorToMove);
    if (!pieces.length) {
      return { over: true, winner: colorToMove === 'black' ? 'white' : 'black', reason: 'no-pieces' };
    }
    const moves = this.legalMoves(board, colorToMove);
    if (!moves.length) {
      return { over: true, winner: colorToMove === 'black' ? 'white' : 'black', reason: 'no-moves' };
    }
    // Draw by no-progress (simplified: track via moveCount passed in from engine)
    // Real impl would track capture-since counter in engine; simplified here
    return { over: false, winner: null, reason: null };
  }

  // ── Private Helpers ───────────────────────────────────────

  _allSimpleMoves(board, color) {
    const moves = [];
    for (const { row, col, piece } of this._pieces(board, color)) {
      const dirs = this._moveDirs(piece, this.gameType);
      for (const [dr, dc] of dirs) {
        if (this.gameType === 'russian' && piece.king) {
          // Flying king: slide along diagonal
          let r = row + dr, c = col + dc;
          while (this._inBounds(r, c) && !board[r][c]) {
            moves.push(this._makeMove({ row, col }, { row: r, col: c }, [], board));
            r += dr; c += dc;
          }
        } else {
          const nr = row + dr, nc = col + dc;
          if (this._inBounds(nr, nc) && !board[nr][nc]) {
            moves.push(this._makeMove({ row, col }, { row: nr, col: nc }, [], board));
          }
        }
      }
    }
    return moves;
  }

  _allCaptures(board, color) {
    const moves = [];
    for (const { row, col, piece } of this._pieces(board, color)) {
      const caps = this._captureSequences(board, row, col, piece, [], this.gameType === 'russian');
      moves.push(...caps);
    }
    return moves;
  }

  /**
   * Recursively build all capture sequences (multi-jump).
   */
  _captureSequences(board, row, col, piece, captured, flyingKing) {
    const seqs     = [];
    const singles  = this._capturesFrom(board, row, col, piece, flyingKing, captured);

    if (!singles.length) {
      // Terminal node — if we've already captured something, this is a valid end
      if (captured.length) {
        seqs.push({ captured: [...captured], finalPos: { row, col } });
      }
      return seqs;
    }

    for (const cap of singles) {
      // Temporarily apply
      const boardCopy = board.map(r => [...r]);
      boardCopy[cap.landing.row][cap.landing.col] = piece;
      boardCopy[row][col]                          = null;
      boardCopy[cap.over.row][cap.over.col]        = null;

      // Check promotion mid-jump (English: stops; Russian: can continue)
      const promoted = this._isPromoteRow(cap.landing.row, piece);
      const continuePiece = (promoted && this.gameType === 'russian')
        ? { ...piece, king: true }
        : piece;

      const nexts = (promoted && this.gameType === 'english')
        ? [] // English: promotion ends sequence
        : this._captureSequences(boardCopy, cap.landing.row, cap.landing.col,
            continuePiece, [...captured, cap.over], flyingKing);

      if (nexts.length) {
        seqs.push(...nexts.map(n => ({ ...n, captured: [cap.over, ...n.captured.filter(c => !(c.row === cap.over.row && c.col === cap.over.col))] })));
      } else {
        seqs.push({ captured: [...captured, cap.over], finalPos: cap.landing });
      }
    }
    return seqs;
  }

  _capturesFrom(board, row, col, piece, flyingKing, alreadyCaptured = []) {
    const caps = [];
    const allDirs = [[-1,-1],[-1,1],[1,-1],[1,1]]; // kings & Russian capture all dirs

    const dirs = (piece.king || this.gameType === 'russian')
      ? allDirs
      : this._moveDirs(piece, this.gameType);

    for (const [dr, dc] of dirs) {
      if (flyingKing && piece.king) {
        // Slide until we find an enemy, then land beyond
        let r = row + dr, c = col + dc;
        let enemy = null;
        while (this._inBounds(r, c)) {
          const sq = board[r][c];
          if (sq) {
            if (sq.color !== piece.color && !alreadyCaptured.find(a => a.row === r && a.col === c)) {
              enemy = { row: r, col: c };
            }
            break;
          }
          r += dr; c += dc;
        }
        if (enemy) {
          // All empty squares beyond enemy
          let lr = enemy.row + dr, lc = enemy.col + dc;
          while (this._inBounds(lr, lc) && !board[lr][lc]) {
            caps.push({ over: enemy, landing: { row: lr, col: lc } });
            lr += dr; lc += dc;
          }
        }
      } else {
        const er = row + dr,   ec = col + dc;
        const lr = row + 2*dr, lc = col + 2*dc;
        if (!this._inBounds(er, ec) || !this._inBounds(lr, lc)) continue;
        const enemy = board[er][ec];
        if (enemy && enemy.color !== piece.color
            && !alreadyCaptured.find(a => a.row === er && a.col === ec)
            && !board[lr][lc]) {
          caps.push({ over: { row: er, col: ec }, landing: { row: lr, col: lc } });
        }
      }
    }
    return caps;
  }

  _makeMove(from, to, capturedPieces, board) {
    const piece   = board[from.row][from.col];
    const promote = this._isPromoteRow(to.row, piece);
    return { from, to, captured: capturedPieces, promote };
  }

  _moveDirs(piece, gameType) {
    if (piece.king) return [[-1,-1],[-1,1],[1,-1],[1,1]];
    // white pieces (top) move down, black (bottom) move up
    return piece.color === 'white' ? [[1,-1],[1,1]] : [[-1,-1],[-1,1]];
  }

  _isPromoteRow(row, piece) {
    if (piece.king) return false;
    return (piece.color === 'white' && row === this.boardSize - 1) ||
           (piece.color === 'black' && row === 0);
  }

  _inBounds(r, c) {
    return r >= 0 && r < this.boardSize && c >= 0 && c < this.boardSize;
  }

  _pieces(board, color) {
    const list = [];
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        if (board[r][c] && board[r][c].color === color) {
          list.push({ row: r, col: c, piece: board[r][c] });
        }
      }
    }
    return list;
  }
}

// ── Move builder helper called from capture sequences ─────
RuleProcessor.prototype._captureSequences = function(board, row, col, piece, captured, flyingKing) {
  const seqs    = [];
  const singles = this._capturesFrom(board, row, col, piece, flyingKing, captured);

  if (!singles.length) {
    if (captured.length) seqs.push({ captured: [...captured], finalPos: { row, col } });
    return seqs;
  }

  for (const cap of singles) {
    const boardCopy = board.map(r => [...r]);
    boardCopy[cap.landing.row][cap.landing.col] = piece;
    boardCopy[row][col]                          = null;
    boardCopy[cap.over.row][cap.over.col]        = null;

    const promoted     = this._isPromoteRow(cap.landing.row, piece);
    const continuePiece = (promoted && this.gameType === 'russian')
      ? { ...piece, king: true } : piece;

    const allCaptured = [...captured, cap.over];

    const nexts = (promoted && this.gameType === 'english')
      ? []
      : this._captureSequences(boardCopy, cap.landing.row, cap.landing.col,
          continuePiece, allCaptured, flyingKing);

    if (nexts.length) {
      seqs.push(...nexts);
    } else {
      seqs.push({ captured: allCaptured, finalPos: cap.landing });
    }
  }
  return seqs;
};

// Patch legalMoves to use fixed capture sequences
const _origAllCaptures = RuleProcessor.prototype._allCaptures;
RuleProcessor.prototype._allCaptures = function(board, color) {
  const moves = [];
  for (const { row, col, piece } of this._pieces(board, color)) {
    const seqs = this._captureSequences(board, row, col, piece, [], this.gameType === 'russian' && piece.king);
    for (const seq of seqs) {
      moves.push({
        from: { row, col },
        to:   seq.finalPos,
        captured: seq.captured,
        promote: this._isPromoteRow(seq.finalPos.row, piece)
      });
    }
  }
  return moves;
};
