/**
 * Chess960 (Fischer Random Chess) Position Generator
 *
 * Rules for valid Chess960 starting positions:
 * 1. Bishops must be on opposite-colored squares
 * 2. The king must be between the two rooks
 * 3. Pawns start on the second rank (unchanged from standard chess)
 *
 * There are exactly 960 possible starting positions.
 */

const PIECES = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

/**
 * Generate a random Chess960 position number (0-959)
 */
export function generatePositionNumber(): number {
  return Math.floor(Math.random() * 960);
}

/**
 * Convert a Chess960 position number to a piece arrangement
 * Uses the standard numbering system (SP-ID)
 */
export function positionNumberToArrangement(n: number): string[] {
  const pieces: (string | null)[] = Array(8).fill(null);

  // Place bishops on opposite-colored squares
  // First bishop (light squares: 1, 3, 5, 7)
  const bishop1 = (n % 4) * 2 + 1;
  n = Math.floor(n / 4);
  pieces[bishop1] = 'B';

  // Second bishop (dark squares: 0, 2, 4, 6)
  const bishop2 = (n % 4) * 2;
  n = Math.floor(n / 4);
  pieces[bishop2] = 'B';

  // Place queen on one of the remaining 6 squares
  const queenPos = n % 6;
  n = Math.floor(n / 6);

  let emptyCount = 0;
  for (let i = 0; i < 8; i++) {
    if (pieces[i] === null) {
      if (emptyCount === queenPos) {
        pieces[i] = 'Q';
        break;
      }
      emptyCount++;
    }
  }

  // Place knights on two of the remaining 5 squares
  // Use triangular number mapping for the 10 possible combinations
  const knightPositions = getKnightPositions(n);

  let emptySquares: number[] = [];
  for (let i = 0; i < 8; i++) {
    if (pieces[i] === null) {
      emptySquares.push(i);
    }
  }

  pieces[emptySquares[knightPositions[0]]] = 'N';
  pieces[emptySquares[knightPositions[1]]] = 'N';

  // Place rooks and king in the remaining 3 squares
  // King must be between the rooks (only one way to do this)
  emptySquares = [];
  for (let i = 0; i < 8; i++) {
    if (pieces[i] === null) {
      emptySquares.push(i);
    }
  }

  pieces[emptySquares[0]] = 'R';
  pieces[emptySquares[1]] = 'K';
  pieces[emptySquares[2]] = 'R';

  return pieces as string[];
}

/**
 * Get knight positions from a number 0-9
 */
function getKnightPositions(n: number): [number, number] {
  const positions: [number, number][] = [
    [0, 1], [0, 2], [0, 3], [0, 4],
    [1, 2], [1, 3], [1, 4],
    [2, 3], [2, 4],
    [3, 4],
  ];
  return positions[n];
}

/**
 * Convert piece arrangement to FEN string
 */
export function arrangementToFEN(pieces: string[]): string {
  // White's back rank (lowercase in FEN is black, uppercase is white)
  const whiteRank = pieces.join('');
  const blackRank = pieces.map((p) => p.toLowerCase()).join('');

  // Standard Chess960 starting position
  // Black pieces on rank 8, white pieces on rank 1
  // Pawns on ranks 7 and 2
  const fen = [
    blackRank,          // Rank 8 (black pieces)
    'pppppppp',         // Rank 7 (black pawns)
    '8',                // Rank 6 (empty)
    '8',                // Rank 5 (empty)
    '8',                // Rank 4 (empty)
    '8',                // Rank 3 (empty)
    'PPPPPPPP',         // Rank 2 (white pawns)
    whiteRank,          // Rank 1 (white pieces)
  ].join('/');

  // Determine castling rights based on rook and king positions
  const castlingRights = getCastlingRights(pieces);

  return `${fen} w ${castlingRights} - 0 1`;
}

/**
 * Determine castling rights based on piece arrangement
 * In Chess960, castling rights are denoted by the file of the rook
 */
function getCastlingRights(pieces: string[]): string {
  const kingPos = pieces.indexOf('K');
  const rookPositions = pieces
    .map((p, i) => (p === 'R' ? i : -1))
    .filter((i) => i !== -1);

  const files = 'ABCDEFGH';
  let rights = '';

  // White castling (uppercase)
  // King-side rook (right of king)
  const kingSideRook = rookPositions.find((r) => r > kingPos);
  if (kingSideRook !== undefined) {
    rights += files[kingSideRook];
  }

  // Queen-side rook (left of king)
  const queenSideRook = rookPositions.find((r) => r < kingPos);
  if (queenSideRook !== undefined) {
    rights += files[queenSideRook];
  }

  // Black castling (lowercase)
  if (kingSideRook !== undefined) {
    rights += files[kingSideRook].toLowerCase();
  }
  if (queenSideRook !== undefined) {
    rights += files[queenSideRook].toLowerCase();
  }

  return rights || '-';
}

/**
 * Generate a random Chess960 FEN position
 */
export function generateChess960Position(): string {
  const positionNumber = generatePositionNumber();
  const arrangement = positionNumberToArrangement(positionNumber);
  return arrangementToFEN(arrangement);
}

/**
 * Get a specific Chess960 position by number (for reproducibility)
 */
export function getChess960Position(positionNumber: number): string {
  if (positionNumber < 0 || positionNumber > 959) {
    throw new Error('Position number must be between 0 and 959');
  }
  const arrangement = positionNumberToArrangement(positionNumber);
  return arrangementToFEN(arrangement);
}

/**
 * Standard chess starting position (position 518 in Chess960)
 */
export function getStandardPosition(): string {
  return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
}

/**
 * Validate that a FEN string is a valid Chess960 position
 */
export function isValidChess960Position(fen: string): boolean {
  const parts = fen.split(' ');
  if (parts.length !== 6) return false;

  const ranks = parts[0].split('/');
  if (ranks.length !== 8) return false;

  // Check back ranks have the same piece arrangement
  const whiteRank = ranks[7].toUpperCase();
  const blackRank = ranks[0].toUpperCase();
  if (whiteRank !== blackRank) return false;

  // Check bishops are on opposite colors
  const pieces = whiteRank.split('');
  const bishopPositions = pieces
    .map((p, i) => (p === 'B' ? i : -1))
    .filter((i) => i !== -1);

  if (bishopPositions.length !== 2) return false;
  if (bishopPositions[0] % 2 === bishopPositions[1] % 2) return false;

  // Check king is between rooks
  const kingPos = pieces.indexOf('K');
  const rookPositions = pieces
    .map((p, i) => (p === 'R' ? i : -1))
    .filter((i) => i !== -1);

  if (rookPositions.length !== 2) return false;
  if (!(rookPositions[0] < kingPos && kingPos < rookPositions[1])) return false;

  return true;
}
