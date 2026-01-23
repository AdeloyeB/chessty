import { Chess } from '@chess-game/shared/chess';
import type { Square } from '@chess-game/shared/chess';
import type { Move } from '@chess-game/shared';

export interface MoveResult {
  move: Move;
  fen: string;
  pgn: string;
  isGameOver: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  isStalemate: boolean;
}

/**
 * Manages in-memory Chess instances and draw offers.
 * Pure game logic, no side effects.
 */
export class GameStateManager {
  // Map of gameId -> Chess instance
  private gameStates = new Map<string, Chess>();
  // Map of gameId -> offeringPlayerId
  private drawOffers = new Map<string, string>();

  /**
   * Initialize chess state from a FEN string.
   */
  initializeState(gameId: string, fen: string): void {
    if (!this.gameStates.has(gameId)) {
      const chess = new Chess(fen);
      this.gameStates.set(gameId, chess);
    }
  }

  /**
   * Validate and apply a move. Returns the move result or null if invalid.
   */
  validateAndApplyMove(
    gameId: string,
    from: string,
    to: string,
    promotion?: string
  ): MoveResult | null {
    const chess = this.gameStates.get(gameId);
    if (!chess) return null;

    try {
      const moveResult = chess.move({ from: from as Square, to: to as Square, promotion });
      if (!moveResult) return null;

      const move: Move = {
        from,
        to,
        promotion,
        san: moveResult.san,
        fen: chess.fen(),
        timestamp: Date.now(),
      };

      // Build PGN from move history
      const pgn = this.buildPgn(chess);

      return {
        move,
        fen: chess.fen(),
        pgn,
        isGameOver: chess.isGameOver(),
        isCheckmate: chess.isCheckmate(),
        isDraw: chess.isDraw(),
        isStalemate: chess.isStalemate(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Get the current chess state for a game.
   */
  getState(gameId: string): Chess | undefined {
    return this.gameStates.get(gameId);
  }

  /**
   * Clean up state for a game.
   */
  cleanupState(gameId: string): void {
    this.gameStates.delete(gameId);
    this.drawOffers.delete(gameId);
  }

  /**
   * Build a simple PGN string from the chess engine's move history.
   */
  private buildPgn(chess: Chess): string {
    const history = chess.history();
    const parts: string[] = [];
    for (let i = 0; i < history.length; i++) {
      if (i % 2 === 0) {
        parts.push(`${Math.floor(i / 2) + 1}.`);
      }
      parts.push(history[i].san);
    }
    return parts.join(' ');
  }

  // --- Draw Offer Management ---

  setDrawOffer(gameId: string, userId: string): void {
    this.drawOffers.set(gameId, userId);
  }

  getDrawOffer(gameId: string): string | undefined {
    return this.drawOffers.get(gameId);
  }

  clearDrawOffer(gameId: string): void {
    this.drawOffers.delete(gameId);
  }
}
