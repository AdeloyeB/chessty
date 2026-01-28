import { Chess } from '@chess-game/shared/chess';
import type { Square } from '@chess-game/shared/chess';
import type { Move } from '@chess-game/shared';
import { getRedis } from '../redis/client';
import { CircuitBreaker } from '../redis/circuitBreaker';
import * as gameService from '../services/game';

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
 * Redis key structure:
 * Key: "game:state:{gameId}"
 * Type: Hash
 * Fields:
 *   - fen: Current position as FEN string
 *   - pgn: Game notation in PGN format
 *   - moveHistory: JSON stringified array of moves
 *   - drawOffer: UserId of player who offered draw, or empty string
 * TTL: 86400 seconds (24 hours)
 */
const GAME_STATE_TTL = 86400; // 24 hours in seconds
const REDIS_KEY_PREFIX = 'game:state:';

/**
 * Manages game state in Redis with database fallback.
 *
 * Architecture:
 * - Chess instances CANNOT be serialized, so we store FEN strings
 * - On each operation, we load FEN from Redis, create a Chess instance,
 *   perform the operation, and save the new FEN back to Redis
 * - This is fast (~1ms to create Chess from FEN) and enables horizontal scaling
 * - CircuitBreaker protects against Redis failures with database fallback
 */
export class GameStateManager {
  private circuitBreaker: CircuitBreaker;

  // In-memory fallback when Redis is unavailable
  // This ensures the game can continue even during Redis outages
  private localCache = new Map<string, { fen: string; pgn: string; moveHistory: Move[]; drawOffer: string }>();

  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      name: 'GameStateManager',
      failureThreshold: 5,
      resetTimeout: 30000, // 30 seconds
    });
  }

  /**
   * Generate Redis key for a game.
   */
  private getRedisKey(gameId: string): string {
    return `${REDIS_KEY_PREFIX}${gameId}`;
  }

  /**
   * Initialize game state from a FEN string.
   * Called when a player joins a game.
   */
  async initializeState(gameId: string, fen: string): Promise<void> {
    const key = this.getRedisKey(gameId);

    try {
      await this.circuitBreaker.execute(
        async () => {
          const redis = getRedis();
          if (!redis) {
            throw new Error('Redis not available');
          }

          // Create new game state atomically using HSETNX to prevent race conditions
          // HSETNX returns 1 if field was set (didn't exist), 0 if field already existed
          const chess = new Chess(fen);
          const wasSet = await redis.hsetnx(key, 'fen', chess.fen());

          if (wasSet === 0) {
            // State already exists, another player initialized it first
            console.log(`[GameStateManager] State already exists for game ${gameId}`);
            return;
          }

          // Initialize remaining fields (fen was just set atomically)
          await redis.hset(key, {
            pgn: '',
            moveHistory: JSON.stringify([]),
            drawOffer: '',
          });
          await redis.expire(key, GAME_STATE_TTL);

          console.log(`[GameStateManager] Initialized state in Redis for game ${gameId}`);
        },
        // Fallback: use local cache
        () => {
          if (!this.localCache.has(gameId)) {
            const chess = new Chess(fen);
            this.localCache.set(gameId, {
              fen: chess.fen(),
              pgn: '',
              moveHistory: [],
              drawOffer: '',
            });
            console.warn(`[GameStateManager] Using local cache for game ${gameId} (Redis unavailable)`);
          }
        }
      );
    } catch (error) {
      console.error(`[GameStateManager] Failed to initialize state for game ${gameId}:`, error);
      // Ensure we have local state even on error
      if (!this.localCache.has(gameId)) {
        const chess = new Chess(fen);
        this.localCache.set(gameId, {
          fen: chess.fen(),
          pgn: '',
          moveHistory: [],
          drawOffer: '',
        });
      }
    }
  }

  /**
   * Validate and apply a move. Returns the move result or null if invalid.
   *
   * Flow:
   * 1. Load FEN from Redis (or local cache)
   * 2. Create Chess instance from FEN
   * 3. Validate and apply the move
   * 4. Save new state back to Redis
   * 5. Return move result
   */
  async validateAndApplyMove(
    gameId: string,
    from: string,
    to: string,
    promotion?: string
  ): Promise<MoveResult | null> {
    const key = this.getRedisKey(gameId);

    try {
      return await this.circuitBreaker.execute<MoveResult | null>(
        async () => {
          const redis = getRedis();
          if (!redis) {
            throw new Error('Redis not available');
          }

          // Load current state
          const [fen, moveHistoryStr] = await Promise.all([
            redis.hget(key, 'fen'),
            redis.hget(key, 'moveHistory'),
          ]);

          if (!fen) {
            console.warn(`[GameStateManager] No state found in Redis for game ${gameId}`);
            return null;
          }

          // Create Chess instance from FEN
          const chess = new Chess(fen);

          // Try to make the move
          try {
            const moveResult = chess.move({ from: from as Square, to: to as Square, promotion });
            if (!moveResult) return null;

            // Build move object
            const move: Move = {
              from,
              to,
              promotion,
              san: moveResult.san,
              fen: chess.fen(),
              timestamp: Date.now(),
            };

            // Update move history
            const moveHistory: Move[] = moveHistoryStr ? JSON.parse(moveHistoryStr) : [];
            moveHistory.push(move);

            // Build PGN from history
            const pgn = this.buildPgn(chess);

            // Save new state to Redis (pipeline for atomicity)
            const pipeline = redis.pipeline();
            pipeline.hset(key, {
              fen: chess.fen(),
              pgn,
              moveHistory: JSON.stringify(moveHistory),
            });
            pipeline.expire(key, GAME_STATE_TTL);
            await pipeline.exec();

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
        },
        // Fallback: use local cache
        () => {
          const state = this.localCache.get(gameId);
          if (!state) {
            console.warn(`[GameStateManager] No local state for game ${gameId}`);
            return null;
          }

          const chess = new Chess(state.fen);

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

            state.moveHistory.push(move);
            state.fen = chess.fen();
            state.pgn = this.buildPgn(chess);

            console.warn(`[GameStateManager] Applied move via local cache for game ${gameId}`);

            return {
              move,
              fen: chess.fen(),
              pgn: state.pgn,
              isGameOver: chess.isGameOver(),
              isCheckmate: chess.isCheckmate(),
              isDraw: chess.isDraw(),
              isStalemate: chess.isStalemate(),
            };
          } catch {
            return null;
          }
        }
      );
    } catch (error) {
      console.error(`[GameStateManager] Error applying move for game ${gameId}:`, error);
      return null;
    }
  }

  /**
   * Get the current chess state for a game.
   * Returns a Chess instance (recreated from FEN).
   *
   * Note: The returned Chess instance is a snapshot - changes to it
   * will NOT be persisted. Use validateAndApplyMove() for moves.
   */
  async getState(gameId: string): Promise<Chess | undefined> {
    const key = this.getRedisKey(gameId);

    try {
      return await this.circuitBreaker.execute<Chess | undefined>(
        async () => {
          const redis = getRedis();
          if (!redis) {
            throw new Error('Redis not available');
          }

          const fen = await redis.hget(key, 'fen');
          if (!fen) return undefined;

          return new Chess(fen);
        },
        // Fallback: use local cache
        () => {
          const state = this.localCache.get(gameId);
          if (!state) return undefined;
          return new Chess(state.fen);
        }
      );
    } catch (error) {
      console.error(`[GameStateManager] Error getting state for game ${gameId}:`, error);
      // Try local cache as last resort
      const state = this.localCache.get(gameId);
      if (state) return new Chess(state.fen);
      return undefined;
    }
  }

  /**
   * Get the current FEN string for a game.
   * Useful when you just need the position, not a Chess instance.
   */
  async getFen(gameId: string): Promise<string | undefined> {
    const key = this.getRedisKey(gameId);

    try {
      return await this.circuitBreaker.execute<string | undefined>(
        async () => {
          const redis = getRedis();
          if (!redis) {
            throw new Error('Redis not available');
          }

          const fen = await redis.hget(key, 'fen');
          return fen || undefined;
        },
        // Fallback: use local cache or database
        async () => {
          const state = this.localCache.get(gameId);
          if (state) return state.fen;

          // Last resort: fetch from database
          const game = await gameService.getGame(gameId);
          return game?.currentFen;
        }
      );
    } catch (error) {
      console.error(`[GameStateManager] Error getting FEN for game ${gameId}:`, error);
      // Try database as last resort
      try {
        const game = await gameService.getGame(gameId);
        return game?.currentFen;
      } catch {
        return undefined;
      }
    }
  }

  /**
   * Get the move history for a game.
   */
  async getMoveHistory(gameId: string): Promise<Move[]> {
    const key = this.getRedisKey(gameId);

    try {
      return await this.circuitBreaker.execute<Move[]>(
        async () => {
          const redis = getRedis();
          if (!redis) {
            throw new Error('Redis not available');
          }

          const moveHistoryStr = await redis.hget(key, 'moveHistory');
          if (!moveHistoryStr) return [];
          return JSON.parse(moveHistoryStr);
        },
        // Fallback: use local cache
        () => {
          const state = this.localCache.get(gameId);
          return state?.moveHistory || [];
        }
      );
    } catch (error) {
      console.error(`[GameStateManager] Error getting move history for game ${gameId}:`, error);
      return [];
    }
  }

  /**
   * Clean up state for a game.
   * Called when a game ends.
   */
  async cleanupState(gameId: string): Promise<void> {
    const key = this.getRedisKey(gameId);

    try {
      await this.circuitBreaker.execute(
        async () => {
          const redis = getRedis();
          if (!redis) {
            throw new Error('Redis not available');
          }

          await redis.del(key);
          console.log(`[GameStateManager] Cleaned up Redis state for game ${gameId}`);
        },
        // Fallback: just clear local cache
        () => {
          console.warn(`[GameStateManager] Could not clean Redis, clearing local cache for game ${gameId}`);
        }
      );
    } catch (error) {
      console.error(`[GameStateManager] Error cleaning up state for game ${gameId}:`, error);
    }

    // Always clear local cache
    this.localCache.delete(gameId);
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

  /**
   * Set a draw offer for a game.
   */
  async setDrawOffer(gameId: string, userId: string): Promise<void> {
    const key = this.getRedisKey(gameId);

    try {
      await this.circuitBreaker.execute(
        async () => {
          const redis = getRedis();
          if (!redis) {
            throw new Error('Redis not available');
          }

          await redis.hset(key, 'drawOffer', userId);
        },
        // Fallback: use local cache
        () => {
          const state = this.localCache.get(gameId);
          if (state) {
            state.drawOffer = userId;
          }
        }
      );
    } catch (error) {
      console.error(`[GameStateManager] Error setting draw offer for game ${gameId}:`, error);
    }
  }

  /**
   * Get the user who offered a draw, if any.
   */
  async getDrawOffer(gameId: string): Promise<string | undefined> {
    const key = this.getRedisKey(gameId);

    try {
      return await this.circuitBreaker.execute<string | undefined>(
        async () => {
          const redis = getRedis();
          if (!redis) {
            throw new Error('Redis not available');
          }

          const drawOffer = await redis.hget(key, 'drawOffer');
          return drawOffer || undefined;
        },
        // Fallback: use local cache
        () => {
          const state = this.localCache.get(gameId);
          return state?.drawOffer || undefined;
        }
      );
    } catch (error) {
      console.error(`[GameStateManager] Error getting draw offer for game ${gameId}:`, error);
      return undefined;
    }
  }

  /**
   * Clear any draw offer for a game.
   */
  async clearDrawOffer(gameId: string): Promise<void> {
    const key = this.getRedisKey(gameId);

    try {
      await this.circuitBreaker.execute(
        async () => {
          const redis = getRedis();
          if (!redis) {
            throw new Error('Redis not available');
          }

          await redis.hset(key, 'drawOffer', '');
        },
        // Fallback: use local cache
        () => {
          const state = this.localCache.get(gameId);
          if (state) {
            state.drawOffer = '';
          }
        }
      );
    } catch (error) {
      console.error(`[GameStateManager] Error clearing draw offer for game ${gameId}:`, error);
    }
  }
}
