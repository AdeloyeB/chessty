/**
 * Re-export from @chess-game/chess-engine for backward compatibility.
 * New code should import directly from '@chess-game/chess-engine'.
 */
export { ChessEngine, ChessEngine as Chess } from '@chess-game/chess-engine';
export type { Color, PieceType, Square, Piece, Move } from '@chess-game/chess-engine';
