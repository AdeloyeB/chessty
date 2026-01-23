/**
 * @chess-game/chess-engine
 * Custom Chess Engine - Pure implementation with zero external dependencies
 */

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Square =
  | 'a8' | 'b8' | 'c8' | 'd8' | 'e8' | 'f8' | 'g8' | 'h8'
  | 'a7' | 'b7' | 'c7' | 'd7' | 'e7' | 'f7' | 'g7' | 'h7'
  | 'a6' | 'b6' | 'c6' | 'd6' | 'e6' | 'f6' | 'g6' | 'h6'
  | 'a5' | 'b5' | 'c5' | 'd5' | 'e5' | 'f5' | 'g5' | 'h5'
  | 'a4' | 'b4' | 'c4' | 'd4' | 'e4' | 'f4' | 'g4' | 'h4'
  | 'a3' | 'b3' | 'c3' | 'd3' | 'e3' | 'f3' | 'g3' | 'h3'
  | 'a2' | 'b2' | 'c2' | 'd2' | 'e2' | 'f2' | 'g2' | 'h2'
  | 'a1' | 'b1' | 'c1' | 'd1' | 'e1' | 'f1' | 'g1' | 'h1';

export interface Piece {
  type: PieceType;
  color: Color;
  square?: Square;
}

export interface Move {
  from: Square;
  to: Square;
  piece: PieceType;
  color: Color;
  captured?: PieceType;
  promotion?: PieceType;
  flags: string;
  san: string;
}

interface GameState {
  board: (Piece | null)[][];
  turn: Color;
  castling: { w: { k: boolean; q: boolean }; b: { k: boolean; q: boolean } };
  enPassant: Square | null;
  halfMoves: number;
  fullMoves: number;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const PIECE_VALUES: Record<PieceType, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0
};

export class ChessEngine {
  private state: GameState;
  private _moveHistory: { state: GameState; move: Move }[] = [];

  constructor(fen?: string) {
    this.state = this.parseFen(fen || STARTING_FEN);
  }

  // Board coordinate helpers
  private squareToCoords(square: Square): [number, number] {
    const file = FILES.indexOf(square[0]);
    const rank = RANKS.indexOf(square[1]);
    return [rank, file];
  }

  private coordsToSquare(row: number, col: number): Square | null {
    if (row < 0 || row > 7 || col < 0 || col > 7) return null;
    return `${FILES[col]}${RANKS[row]}` as Square;
  }

  private isValidCoord(row: number, col: number): boolean {
    return row >= 0 && row <= 7 && col >= 0 && col <= 7;
  }

  // FEN parsing
  private parseFen(fen: string): GameState {
    const parts = fen.split(' ');
    const board: (Piece | null)[][] = [];

    // Parse board position
    const rows = parts[0].split('/');
    for (const row of rows) {
      const boardRow: (Piece | null)[] = [];
      for (const char of row) {
        if (/\d/.test(char)) {
          for (let i = 0; i < parseInt(char); i++) {
            boardRow.push(null);
          }
        } else {
          const color: Color = char === char.toUpperCase() ? 'w' : 'b';
          const type = char.toLowerCase() as PieceType;
          boardRow.push({ type, color });
        }
      }
      board.push(boardRow);
    }

    // Parse turn
    const turn: Color = parts[1] === 'w' ? 'w' : 'b';

    // Parse castling rights
    const castlingStr = parts[2] || '-';
    const castling = {
      w: { k: castlingStr.includes('K'), q: castlingStr.includes('Q') },
      b: { k: castlingStr.includes('k'), q: castlingStr.includes('q') }
    };

    // Parse en passant
    const enPassant = parts[3] === '-' ? null : parts[3] as Square;

    // Parse move counts
    const halfMoves = parseInt(parts[4]) || 0;
    const fullMoves = parseInt(parts[5]) || 1;

    return { board, turn, castling, enPassant, halfMoves, fullMoves };
  }

  // FEN generation
  fen(): string {
    // Board position
    let fenBoard = '';
    for (let row = 0; row < 8; row++) {
      let emptyCount = 0;
      for (let col = 0; col < 8; col++) {
        const piece = this.state.board[row][col];
        if (piece) {
          if (emptyCount > 0) {
            fenBoard += emptyCount;
            emptyCount = 0;
          }
          const symbol = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
          fenBoard += symbol;
        } else {
          emptyCount++;
        }
      }
      if (emptyCount > 0) fenBoard += emptyCount;
      if (row < 7) fenBoard += '/';
    }

    // Castling rights
    let castlingStr = '';
    if (this.state.castling.w.k) castlingStr += 'K';
    if (this.state.castling.w.q) castlingStr += 'Q';
    if (this.state.castling.b.k) castlingStr += 'k';
    if (this.state.castling.b.q) castlingStr += 'q';
    if (!castlingStr) castlingStr = '-';

    // En passant
    const epStr = this.state.enPassant || '-';

    return `${fenBoard} ${this.state.turn} ${castlingStr} ${epStr} ${this.state.halfMoves} ${this.state.fullMoves}`;
  }

  // Get piece at square
  get(square: Square): Piece | null {
    const [row, col] = this.squareToCoords(square);
    const piece = this.state.board[row][col];
    if (piece) {
      return { ...piece, square };
    }
    return null;
  }

  // Get current turn
  turn(): Color {
    return this.state.turn;
  }

  // Get board as 2D array
  board(): (Piece | null)[][] {
    return this.state.board.map((row, rowIdx) =>
      row.map((piece, colIdx) => {
        if (piece) {
          return { ...piece, square: this.coordsToSquare(rowIdx, colIdx)! };
        }
        return null;
      })
    );
  }

  // Find king position
  private findKing(color: Color): Square | null {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.state.board[row][col];
        if (piece && piece.type === 'k' && piece.color === color) {
          return this.coordsToSquare(row, col);
        }
      }
    }
    return null;
  }

  // Check if a square is attacked by a color
  private isSquareAttacked(square: Square, byColor: Color): boolean {
    const [targetRow, targetCol] = this.squareToCoords(square);

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.state.board[row][col];
        if (!piece || piece.color !== byColor) continue;

        const attacks = this.getAttacks(row, col, piece);
        if (attacks.some(([r, c]) => r === targetRow && c === targetCol)) {
          return true;
        }
      }
    }
    return false;
  }

  // Get squares a piece attacks (not necessarily legal moves)
  private getAttacks(row: number, col: number, piece: Piece): [number, number][] {
    const attacks: [number, number][] = [];

    switch (piece.type) {
      case 'p': {
        const dir = piece.color === 'w' ? -1 : 1;
        // Pawn captures diagonally
        if (this.isValidCoord(row + dir, col - 1)) attacks.push([row + dir, col - 1]);
        if (this.isValidCoord(row + dir, col + 1)) attacks.push([row + dir, col + 1]);
        break;
      }
      case 'n': {
        const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        for (const [dr, dc] of knightMoves) {
          if (this.isValidCoord(row + dr, col + dc)) {
            attacks.push([row + dr, col + dc]);
          }
        }
        break;
      }
      case 'b': {
        const bishopDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        for (const [dr, dc] of bishopDirs) {
          for (let i = 1; i < 8; i++) {
            const newRow = row + dr * i;
            const newCol = col + dc * i;
            if (!this.isValidCoord(newRow, newCol)) break;
            attacks.push([newRow, newCol]);
            if (this.state.board[newRow][newCol]) break;
          }
        }
        break;
      }
      case 'r': {
        const rookDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dr, dc] of rookDirs) {
          for (let i = 1; i < 8; i++) {
            const newRow = row + dr * i;
            const newCol = col + dc * i;
            if (!this.isValidCoord(newRow, newCol)) break;
            attacks.push([newRow, newCol]);
            if (this.state.board[newRow][newCol]) break;
          }
        }
        break;
      }
      case 'q': {
        const queenDirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        for (const [dr, dc] of queenDirs) {
          for (let i = 1; i < 8; i++) {
            const newRow = row + dr * i;
            const newCol = col + dc * i;
            if (!this.isValidCoord(newRow, newCol)) break;
            attacks.push([newRow, newCol]);
            if (this.state.board[newRow][newCol]) break;
          }
        }
        break;
      }
      case 'k': {
        const kingMoves = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        for (const [dr, dc] of kingMoves) {
          if (this.isValidCoord(row + dr, col + dc)) {
            attacks.push([row + dr, col + dc]);
          }
        }
        break;
      }
    }

    return attacks;
  }

  // Check if current player is in check
  isCheck(): boolean {
    const kingSquare = this.findKing(this.state.turn);
    if (!kingSquare) return false;
    const opponent: Color = this.state.turn === 'w' ? 'b' : 'w';
    return this.isSquareAttacked(kingSquare, opponent);
  }

  // Generate all pseudo-legal moves for a piece at a position
  private generatePseudoMoves(row: number, col: number): Move[] {
    const piece = this.state.board[row][col];
    if (!piece || piece.color !== this.state.turn) return [];

    const moves: Move[] = [];
    const from = this.coordsToSquare(row, col)!;

    const addMove = (toRow: number, toCol: number, flags: string = '', promotion?: PieceType) => {
      const to = this.coordsToSquare(toRow, toCol);
      if (!to) return;

      const captured = this.state.board[toRow][toCol]?.type;
      moves.push({
        from,
        to,
        piece: piece.type,
        color: piece.color,
        captured,
        promotion,
        flags: flags + (captured ? 'c' : ''),
        san: '' // Will be generated later
      });
    };

    switch (piece.type) {
      case 'p': {
        const dir = piece.color === 'w' ? -1 : 1;
        const startRow = piece.color === 'w' ? 6 : 1;
        const promoteRow = piece.color === 'w' ? 0 : 7;

        // Forward move
        if (this.isValidCoord(row + dir, col) && !this.state.board[row + dir][col]) {
          if (row + dir === promoteRow) {
            for (const promo of ['q', 'r', 'b', 'n'] as PieceType[]) {
              addMove(row + dir, col, 'p', promo);
            }
          } else {
            addMove(row + dir, col);
          }

          // Double push from start
          if (row === startRow && !this.state.board[row + 2 * dir][col]) {
            addMove(row + 2 * dir, col, 'b'); // big pawn move
          }
        }

        // Captures
        for (const dc of [-1, 1]) {
          const newCol = col + dc;
          if (!this.isValidCoord(row + dir, newCol)) continue;

          const target = this.state.board[row + dir][newCol];
          if (target && target.color !== piece.color) {
            if (row + dir === promoteRow) {
              for (const promo of ['q', 'r', 'b', 'n'] as PieceType[]) {
                addMove(row + dir, newCol, 'p', promo);
              }
            } else {
              addMove(row + dir, newCol);
            }
          }

          // En passant
          const epSquare = this.coordsToSquare(row + dir, newCol);
          if (epSquare && epSquare === this.state.enPassant) {
            moves.push({
              from,
              to: epSquare,
              piece: 'p',
              color: piece.color,
              captured: 'p',
              flags: 'e',
              san: ''
            });
          }
        }
        break;
      }

      case 'n': {
        const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
        for (const [dr, dc] of knightMoves) {
          const newRow = row + dr;
          const newCol = col + dc;
          if (!this.isValidCoord(newRow, newCol)) continue;
          const target = this.state.board[newRow][newCol];
          if (!target || target.color !== piece.color) {
            addMove(newRow, newCol);
          }
        }
        break;
      }

      case 'b': {
        const bishopDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        for (const [dr, dc] of bishopDirs) {
          for (let i = 1; i < 8; i++) {
            const newRow = row + dr * i;
            const newCol = col + dc * i;
            if (!this.isValidCoord(newRow, newCol)) break;
            const target = this.state.board[newRow][newCol];
            if (!target) {
              addMove(newRow, newCol);
            } else {
              if (target.color !== piece.color) addMove(newRow, newCol);
              break;
            }
          }
        }
        break;
      }

      case 'r': {
        const rookDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dr, dc] of rookDirs) {
          for (let i = 1; i < 8; i++) {
            const newRow = row + dr * i;
            const newCol = col + dc * i;
            if (!this.isValidCoord(newRow, newCol)) break;
            const target = this.state.board[newRow][newCol];
            if (!target) {
              addMove(newRow, newCol);
            } else {
              if (target.color !== piece.color) addMove(newRow, newCol);
              break;
            }
          }
        }
        break;
      }

      case 'q': {
        const queenDirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        for (const [dr, dc] of queenDirs) {
          for (let i = 1; i < 8; i++) {
            const newRow = row + dr * i;
            const newCol = col + dc * i;
            if (!this.isValidCoord(newRow, newCol)) break;
            const target = this.state.board[newRow][newCol];
            if (!target) {
              addMove(newRow, newCol);
            } else {
              if (target.color !== piece.color) addMove(newRow, newCol);
              break;
            }
          }
        }
        break;
      }

      case 'k': {
        const kingMoves = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        for (const [dr, dc] of kingMoves) {
          const newRow = row + dr;
          const newCol = col + dc;
          if (!this.isValidCoord(newRow, newCol)) continue;
          const target = this.state.board[newRow][newCol];
          if (!target || target.color !== piece.color) {
            addMove(newRow, newCol);
          }
        }

        // Castling
        const homeRow = piece.color === 'w' ? 7 : 0;
        const opponent: Color = piece.color === 'w' ? 'b' : 'w';

        if (row === homeRow && col === 4 && !this.isSquareAttacked(from, opponent)) {
          // Kingside
          if (this.state.castling[piece.color].k) {
            if (!this.state.board[homeRow][5] && !this.state.board[homeRow][6]) {
              const f = this.coordsToSquare(homeRow, 5)!;
              const g = this.coordsToSquare(homeRow, 6)!;
              if (!this.isSquareAttacked(f, opponent) && !this.isSquareAttacked(g, opponent)) {
                moves.push({
                  from,
                  to: g,
                  piece: 'k',
                  color: piece.color,
                  flags: 'k',
                  san: 'O-O'
                });
              }
            }
          }

          // Queenside
          if (this.state.castling[piece.color].q) {
            if (!this.state.board[homeRow][1] && !this.state.board[homeRow][2] && !this.state.board[homeRow][3]) {
              const c = this.coordsToSquare(homeRow, 2)!;
              const d = this.coordsToSquare(homeRow, 3)!;
              if (!this.isSquareAttacked(c, opponent) && !this.isSquareAttacked(d, opponent)) {
                moves.push({
                  from,
                  to: c,
                  piece: 'k',
                  color: piece.color,
                  flags: 'q',
                  san: 'O-O-O'
                });
              }
            }
          }
        }
        break;
      }
    }

    return moves;
  }

  // Get all legal moves without SAN (used internally to avoid recursion)
  private getLegalMovesRaw(square?: Square): Move[] {
    const allMoves: Move[] = [];

    if (square) {
      const [row, col] = this.squareToCoords(square);
      const pseudoMoves = this.generatePseudoMoves(row, col);
      for (const move of pseudoMoves) {
        if (this.isLegalMove(move)) {
          allMoves.push(move);
        }
      }
    } else {
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const pseudoMoves = this.generatePseudoMoves(row, col);
          for (const move of pseudoMoves) {
            if (this.isLegalMove(move)) {
              allMoves.push(move);
            }
          }
        }
      }
    }

    return allMoves;
  }

  // Generate all legal moves
  moves(options?: { square?: Square; verbose?: boolean }): Move[] | string[] {
    const allMoves = this.getLegalMovesRaw(options?.square);

    // Generate SAN for each move
    for (const move of allMoves) {
      move.san = this.generateSan(move);
    }

    if (options?.verbose) {
      return allMoves;
    }
    return allMoves.map(m => m.san);
  }

  // Check if a move is legal (doesn't leave king in check)
  private isLegalMove(move: Move): boolean {
    // Make the move temporarily
    const savedState = this.cloneState();
    this.applyMove(move);

    // Check if our king is in check
    const opponent: Color = move.color === 'w' ? 'b' : 'w';
    const kingSquare = this.findKing(move.color);
    const inCheck = kingSquare ? this.isSquareAttacked(kingSquare, opponent) : true;

    // Restore state
    this.state = savedState;

    return !inCheck;
  }

  // Apply a move to the board (doesn't check legality)
  private applyMove(move: Move): void {
    const [fromRow, fromCol] = this.squareToCoords(move.from);
    const [toRow, toCol] = this.squareToCoords(move.to);
    const piece = this.state.board[fromRow][fromCol]!;

    // Remove piece from source
    this.state.board[fromRow][fromCol] = null;

    // Handle special moves
    if (move.flags.includes('e')) {
      // En passant - remove captured pawn
      const capturedRow = piece.color === 'w' ? toRow + 1 : toRow - 1;
      this.state.board[capturedRow][toCol] = null;
    }

    if (move.flags.includes('k')) {
      // Kingside castle - move rook
      const rookCol = 7;
      this.state.board[toRow][5] = this.state.board[toRow][rookCol];
      this.state.board[toRow][rookCol] = null;
    }

    if (move.flags.includes('q')) {
      // Queenside castle - move rook
      const rookCol = 0;
      this.state.board[toRow][3] = this.state.board[toRow][rookCol];
      this.state.board[toRow][rookCol] = null;
    }

    // Place piece at destination (with promotion if applicable)
    this.state.board[toRow][toCol] = {
      type: move.promotion || piece.type,
      color: piece.color
    };

    // Update castling rights
    if (piece.type === 'k') {
      this.state.castling[piece.color].k = false;
      this.state.castling[piece.color].q = false;
    }
    if (piece.type === 'r') {
      if (fromCol === 0) this.state.castling[piece.color].q = false;
      if (fromCol === 7) this.state.castling[piece.color].k = false;
    }
    // Also update if rook is captured
    if (move.captured === 'r') {
      if (toCol === 0 && toRow === 0) this.state.castling.b.q = false;
      if (toCol === 7 && toRow === 0) this.state.castling.b.k = false;
      if (toCol === 0 && toRow === 7) this.state.castling.w.q = false;
      if (toCol === 7 && toRow === 7) this.state.castling.w.k = false;
    }

    // Update en passant square
    if (move.flags.includes('b')) {
      const epRow = piece.color === 'w' ? toRow + 1 : toRow - 1;
      this.state.enPassant = this.coordsToSquare(epRow, toCol);
    } else {
      this.state.enPassant = null;
    }

    // Update half-move clock
    if (piece.type === 'p' || move.captured) {
      this.state.halfMoves = 0;
    } else {
      this.state.halfMoves++;
    }

    // Update full move number
    if (piece.color === 'b') {
      this.state.fullMoves++;
    }

    // Switch turn
    this.state.turn = piece.color === 'w' ? 'b' : 'w';
  }

  // Clone the current state
  private cloneState(): GameState {
    return {
      board: this.state.board.map(row => row.map(p => p ? { ...p } : null)),
      turn: this.state.turn,
      castling: {
        w: { ...this.state.castling.w },
        b: { ...this.state.castling.b }
      },
      enPassant: this.state.enPassant,
      halfMoves: this.state.halfMoves,
      fullMoves: this.state.fullMoves
    };
  }

  // Make a move
  move(moveInput: string | { from: Square; to: Square; promotion?: string }): Move | null {
    let move: Move | null = null;

    if (typeof moveInput === 'string') {
      // SAN notation - find matching move
      const legalMoves = this.moves({ verbose: true }) as Move[];
      move = legalMoves.find(m => m.san === moveInput) || null;
    } else {
      // From/to notation
      const [fromRow, fromCol] = this.squareToCoords(moveInput.from);
      const pseudoMoves = this.generatePseudoMoves(fromRow, fromCol);

      for (const m of pseudoMoves) {
        if (m.to === moveInput.to) {
          if (m.promotion && moveInput.promotion) {
            if (m.promotion === moveInput.promotion) {
              if (this.isLegalMove(m)) {
                move = m;
                break;
              }
            }
          } else if (!m.promotion) {
            if (this.isLegalMove(m)) {
              move = m;
              break;
            }
          }
        }
      }
    }

    if (!move) return null;

    // Save state for undo
    this._moveHistory.push({ state: this.cloneState(), move });

    // Generate SAN before applying move
    move.san = this.generateSan(move);

    // Apply the move
    this.applyMove(move);

    return move;
  }

  // Generate Standard Algebraic Notation for a move
  private generateSan(move: Move): string {
    if (move.flags.includes('k')) return 'O-O';
    if (move.flags.includes('q')) return 'O-O-O';

    let san = '';

    if (move.piece !== 'p') {
      san += move.piece.toUpperCase();

      // Check for ambiguity - use raw moves to avoid recursion
      const legalMoves = this.getLegalMovesRaw();
      const ambiguous = legalMoves.filter(m =>
        m.piece === move.piece &&
        m.to === move.to &&
        m.from !== move.from
      );

      if (ambiguous.length > 0) {
        const sameFile = ambiguous.some(m => m.from[0] === move.from[0]);
        const sameRank = ambiguous.some(m => m.from[1] === move.from[1]);

        if (!sameFile) {
          san += move.from[0];
        } else if (!sameRank) {
          san += move.from[1];
        } else {
          san += move.from;
        }
      }
    } else if (move.captured) {
      san += move.from[0];
    }

    if (move.captured) {
      san += 'x';
    }

    san += move.to;

    if (move.promotion) {
      san += '=' + move.promotion.toUpperCase();
    }

    // Check for check/checkmate
    const savedState = this.cloneState();
    this.applyMove(move);

    if (this.isCheck()) {
      if (this.isCheckmate()) {
        san += '#';
      } else {
        san += '+';
      }
    }

    this.state = savedState;

    return san;
  }

  // Undo the last move
  undo(): Move | null {
    const last = this._moveHistory.pop();
    if (!last) return null;

    this.state = last.state;
    return last.move;
  }

  // Reset the game
  reset(): void {
    this.state = this.parseFen(STARTING_FEN);
    this._moveHistory = [];
  }

  // Load a FEN position
  load(fen: string): boolean {
    try {
      this.state = this.parseFen(fen);
      this._moveHistory = [];
      return true;
    } catch {
      return false;
    }
  }

  // Game state checks
  isCheckmate(): boolean {
    if (!this.isCheck()) return false;
    return this.getLegalMovesRaw().length === 0;
  }

  isStalemate(): boolean {
    if (this.isCheck()) return false;
    return this.getLegalMovesRaw().length === 0;
  }

  isDraw(): boolean {
    // Stalemate
    if (this.isStalemate()) return true;

    // 50-move rule
    if (this.state.halfMoves >= 100) return true;

    // Insufficient material
    if (this.isInsufficientMaterial()) return true;

    return false;
  }

  private isInsufficientMaterial(): boolean {
    const pieces: Piece[] = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.state.board[row][col];
        if (piece) pieces.push(piece);
      }
    }

    // King vs King
    if (pieces.length === 2) return true;

    // King + Bishop vs King or King + Knight vs King
    if (pieces.length === 3) {
      const nonKings = pieces.filter(p => p.type !== 'k');
      if (nonKings.length === 1 && (nonKings[0].type === 'b' || nonKings[0].type === 'n')) {
        return true;
      }
    }

    // King + Bishop vs King + Bishop (same color)
    if (pieces.length === 4) {
      const bishops = pieces.filter(p => p.type === 'b');
      if (bishops.length === 2) {
        // Check if bishops are on same color squares
        // This is a simplification - would need square info for accurate check
      }
    }

    return false;
  }

  isGameOver(): boolean {
    return this.isCheckmate() || this.isDraw();
  }

  // Get move history
  history(): Move[] {
    return this._moveHistory.map(h => h.move);
  }

  // Get piece value
  static pieceValue(type: PieceType): number {
    return PIECE_VALUES[type];
  }
}

/** @deprecated Use ChessEngine instead */
export const Chess = ChessEngine;

export default ChessEngine;
