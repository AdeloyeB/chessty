/**
 * Game Recovery Module
 *
 * Restores active games to Redis and restarts their clocks when the server starts.
 *
 * Why this is needed:
 * When the server restarts (crash, deploy, etc.), in-memory state is lost:
 * - Clock intervals stop ticking
 * - Game state (FEN, draw offers) disappears from GameStateManager
 * - Clock state (time remaining, whose turn) disappears from ClockManager
 *
 * The database still has all active games, so we can recover them:
 * 1. Query all games with status='active' from PostgreSQL
 * 2. For each game:
 *    - Calculate time remaining based on when the last move happened
 *    - Initialize the clock state in ClockManager
 *    - Initialize the game state in GameStateManager
 *    - Start the clock interval so it ticks again
 */

import { db, games } from '../drizzle';
import { eq } from 'drizzle-orm';
import { getRedis, isRedisAvailable } from './client';
import type { ClockManager } from '../websocket/ClockManager';
import type { GameStateManager } from '../websocket/GameStateManager';
import * as gameService from '../services/game';

interface RecoveryStats {
  total: number;
  recovered: number;
  failed: number;
  skipped: number;
  errors: Array<{ gameId: string; error: string }>;
}

/**
 * Calculate the remaining time for a player based on when the game was last updated.
 *
 * Important: We use `updatedAt` from the database, which is set on every move.
 * If the server was down for 5 minutes but a player made a move 10 seconds before
 * the crash, we only subtract 10 seconds from the active player's clock, not 5 minutes.
 *
 * @param storedTime - The time remaining stored in the database (in seconds)
 * @param lastUpdateAt - When the game was last updated (move made)
 * @param isThisPlayersTurn - Whether it's this player's turn (only active player loses time)
 * @returns The adjusted time remaining (in seconds), minimum 0
 */
function calculateRemainingTime(
  storedTime: number,
  lastUpdateAt: Date | null,
  isThisPlayersTurn: boolean
): number {
  // If it's not this player's turn, their time hasn't been decreasing
  if (!isThisPlayersTurn) {
    return storedTime;
  }

  // If no update timestamp, return stored time (shouldn't happen for active games)
  if (!lastUpdateAt) {
    return storedTime;
  }

  // Calculate how long since the last move was made
  const elapsedMs = Date.now() - new Date(lastUpdateAt).getTime();
  const elapsedSeconds = elapsedMs / 1000;

  // Subtract elapsed time from the active player's clock
  // Don't go below 0
  return Math.max(0, storedTime - elapsedSeconds);
}

/**
 * Determine whose turn it is based on the FEN string.
 *
 * FEN format: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
 * The second part (after first space) is the active color: 'w' for white, 'b' for black.
 *
 * @param fen - The FEN string representing the board position
 * @returns true if it's white's turn, false if black's turn
 */
function isWhiteTurn(fen: string): boolean {
  const activeColor = fen.split(' ')[1];
  return activeColor === 'w';
}

/**
 * Recover all active games from the database and restore them to memory/Redis.
 *
 * This function is idempotent - running it twice won't cause issues.
 * If a game is already initialized in the managers, it will be skipped or re-initialized.
 *
 * @param clockManager - The ClockManager instance to restore clock state to
 * @param gameStateManager - The GameStateManager instance to restore game state to
 * @returns Statistics about the recovery process
 */
export async function recoverActiveGames(
  clockManager: ClockManager,
  gameStateManager: GameStateManager
): Promise<RecoveryStats> {
  const stats: RecoveryStats = {
    total: 0,
    recovered: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  console.log('[Recovery] Starting game recovery process...');

  try {
    // Step 1: Query all active games from the database
    const activeGames = await db.query.games.findMany({
      where: eq(games.status, 'active'),
    });

    stats.total = activeGames.length;
    console.log(`[Recovery] Found ${stats.total} active games to recover`);

    if (stats.total === 0) {
      console.log('[Recovery] No active games to recover');
      return stats;
    }

    // Step 2: Process each game
    for (const game of activeGames) {
      try {
        // Determine whose turn it is
        const whiteTurn = isWhiteTurn(game.currentFen);

        // Calculate adjusted time remaining
        // The active player loses time for any period the server was down
        const adjustedWhiteTime = calculateRemainingTime(
          game.whiteTimeRemaining,
          game.updatedAt,
          whiteTurn
        );
        const adjustedBlackTime = calculateRemainingTime(
          game.blackTimeRemaining,
          game.updatedAt,
          !whiteTurn
        );

        // Check if either player has timed out during the downtime
        if (adjustedWhiteTime <= 0 || adjustedBlackTime <= 0) {
          console.log(`[Recovery] Game ${game.id} has a player who timed out during downtime`);

          // Determine who timed out and end the game
          const losingColor = adjustedWhiteTime <= 0 ? 'white' : 'black';
          const winnerId = losingColor === 'white' ? game.blackPlayerId : game.whitePlayerId;

          // End the game due to timeout
          try {
            await gameService.endGame(game.id, 'timeout', winnerId);
            console.log(`[Recovery] Game ${game.id} ended - ${losingColor} timed out during server downtime`);
            stats.skipped++;
          } catch (endError) {
            console.error(`[Recovery] Failed to end timed-out game ${game.id}:`, endError);
            stats.errors.push({
              gameId: game.id,
              error: `Failed to end timed-out game: ${endError instanceof Error ? endError.message : String(endError)}`,
            });
            stats.failed++;
          }
          continue;
        }

        // Step 3a: Initialize game state (FEN, chess rules)
        await gameStateManager.initializeState(game.id, game.currentFen);

        // Step 3b: Initialize clock state (async for Redis storage)
        await clockManager.initializeClock(game.id, adjustedWhiteTime, adjustedBlackTime, whiteTurn);

        // Step 3c: Start the clock interval
        // This callback is called when a player times out
        clockManager.startClock(game.id, game.timeControlIncrement, async (gameId, losingColor) => {
          const currentGame = await gameService.getGame(gameId);
          if (!currentGame || currentGame.status !== 'active') {
            return null;
          }
          return losingColor === 'white' ? currentGame.blackPlayerId : currentGame.whitePlayerId;
        });

        // Step 4: Optionally store in Redis if available
        const redis = getRedis();
        if (redis && isRedisAvailable()) {
          try {
            // Store game state in Redis for persistence
            await redis.hset(`game:state:${game.id}`, {
              fen: game.currentFen,
              pgn: game.pgn,
              whitePlayerId: game.whitePlayerId,
              blackPlayerId: game.blackPlayerId,
              status: game.status,
            });

            // Store clock state in Redis
            await redis.hset(`clock:${game.id}`, {
              whiteTime: adjustedWhiteTime.toString(),
              blackTime: adjustedBlackTime.toString(),
              lastUpdate: Date.now().toString(),
              isWhiteTurn: whiteTurn ? '1' : '0',
              increment: game.timeControlIncrement.toString(),
            });
          } catch (redisError) {
            // Redis errors are non-fatal - log but continue
            console.warn(`[Recovery] Failed to store game ${game.id} in Redis:`, redisError);
          }
        }

        console.log(
          `[Recovery] Recovered game ${game.id} - ` +
            `White: ${Math.round(adjustedWhiteTime)}s, Black: ${Math.round(adjustedBlackTime)}s, ` +
            `Turn: ${whiteTurn ? 'white' : 'black'}`
        );
        stats.recovered++;
      } catch (error) {
        console.error(`[Recovery] Failed to recover game ${game.id}:`, error);
        stats.errors.push({
          gameId: game.id,
          error: error instanceof Error ? error.message : String(error),
        });
        stats.failed++;
      }
    }
  } catch (error) {
    console.error('[Recovery] Fatal error during recovery:', error);
    throw error;
  }

  // Log summary
  console.log('[Recovery] Recovery complete:');
  console.log(`  - Total active games: ${stats.total}`);
  console.log(`  - Successfully recovered: ${stats.recovered}`);
  console.log(`  - Skipped (timed out): ${stats.skipped}`);
  console.log(`  - Failed: ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log('[Recovery] Errors:');
    for (const err of stats.errors) {
      console.log(`  - Game ${err.gameId}: ${err.error}`);
    }
  }

  return stats;
}

/**
 * Clean up Redis state for a game.
 * Called when a game ends to remove stale data.
 *
 * @param gameId - The game ID to clean up
 */
export async function cleanupGameFromRedis(gameId: string): Promise<void> {
  const redis = getRedis();
  if (!redis || !isRedisAvailable()) {
    return;
  }

  try {
    await redis.del(`game:state:${gameId}`);
    await redis.del(`clock:${gameId}`);
  } catch (error) {
    console.warn(`[Recovery] Failed to clean up Redis for game ${gameId}:`, error);
  }
}
