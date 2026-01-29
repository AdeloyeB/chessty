/**
 * Anti-Cheat Event Handler
 * =========================
 *
 * This handler connects the anti-cheat monitoring system to the game event
 * flow. It runs behavioral analysis on each move without blocking the normal
 * game flow (moves still process instantly for players).
 *
 * HOW IT WORKS:
 * 1. Listens for game:started - Initializes monitoring for both players
 * 2. Listens for game:move_made - Runs behavioral analysis on each move
 * 3. Listens for game:ended - Cleans up monitoring session
 *
 * When suspicious patterns are detected, this handler emits anti-cheat events:
 * - anticheat:suspicion_flag: Each individual flag raised
 * - anticheat:game_flagged: When accumulated score exceeds threshold
 * - anticheat:review_required: When human review is needed
 *
 * KEY DESIGN DECISIONS:
 * - NON-BLOCKING: All anti-cheat analysis runs as non-blocking handlers
 *   so moves are never delayed by analysis. This is critical for real-time play.
 * - LOW PRIORITY: Runs after persistence and broadcast (priority 90)
 *   so it doesn't affect the critical path.
 * - FIRE-AND-FORGET: Errors in analysis don't break the game flow.
 *   They're logged but swallowed.
 *
 * FUTURE ENHANCEMENTS:
 * - Integrate with Stockfish for real-time position analysis
 * - Store suspicion summaries in database for historical tracking
 * - Webhook notifications for high-severity flags
 */

import type { GameEventEmitter } from '../GameEventEmitter';
import type { CheatFlag, CheatFlagSeverity } from '@chess-game/shared';
import {
  liveGameMonitor,
  startGameMonitoring,
  endGameMonitoring,
  SUSPICION_THRESHOLDS,
  type MoveBehaviorData,
  type TimeControlType,
} from '../../services/anticheat';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Time control mapping from milliseconds to type.
 * Used to determine expected behavior patterns.
 *
 * Time controls:
 * - Bullet: < 3 minutes
 * - Blitz: 3-10 minutes
 * - Rapid: 10-30 minutes
 * - Classical: > 30 minutes
 */
function getTimeControlType(initialTimeMs: number): TimeControlType {
  const minutes = initialTimeMs / 60000;
  if (minutes < 3) return 'bullet';
  if (minutes < 10) return 'blitz';
  if (minutes < 30) return 'rapid';
  return 'classical';
}

/**
 * Get the highest severity flag from a list.
 */
function getHighestSeverity(flags: CheatFlag[]): CheatFlagSeverity {
  const severityOrder: CheatFlagSeverity[] = ['low', 'medium', 'high', 'critical'];
  let highest: CheatFlagSeverity = 'low';

  for (const flag of flags) {
    if (severityOrder.indexOf(flag.severity) > severityOrder.indexOf(highest)) {
      highest = flag.severity;
    }
  }

  return highest;
}

/**
 * Create a human-readable summary of flags for review.
 */
function createFlagSummary(flags: CheatFlag[]): string {
  if (flags.length === 0) return 'No flags detected';

  const flagsByType = new Map<string, number>();
  for (const flag of flags) {
    const count = flagsByType.get(flag.type) ?? 0;
    flagsByType.set(flag.type, count + 1);
  }

  const parts: string[] = [];
  for (const [type, count] of flagsByType) {
    parts.push(`${type.replace(/_/g, ' ')} (${count}x)`);
  }

  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Handler Registration
// ---------------------------------------------------------------------------

/**
 * Register anti-cheat event handlers.
 *
 * These handlers run as non-blocking (fire-and-forget) with low priority
 * so they never slow down the main game flow.
 *
 * @param events - The game event emitter
 */
export function registerAnticheatHandlers(events: GameEventEmitter): void {
  // ---------------------------------------------------------------------------
  // Game Started Handler
  // ---------------------------------------------------------------------------
  //
  // When a game starts, we initialize monitoring for both players.
  // This creates tracking state for move timing, focus events, etc.

  events.on(
    'game:started',
    (payload) => {
      const timeControl = getTimeControlType(payload.timeControlInitial);

      startGameMonitoring(
        payload.gameId,
        payload.whitePlayerId,
        payload.blackPlayerId,
        timeControl
      );

      console.log(
        `[AntiCheat] Monitoring started for game ${payload.gameId} ` +
        `(${timeControl}, white: ${payload.whitePlayerId}, black: ${payload.blackPlayerId})`
      );
    },
    {
      priority: 90, // Low priority - run after critical handlers
      nonBlocking: true, // Don't block game start
      label: 'anticheat:game_started',
    }
  );

  // ---------------------------------------------------------------------------
  // Move Made Handler
  // ---------------------------------------------------------------------------
  //
  // This is the core of real-time anti-cheat. For each move:
  // 1. Extract behavioral data (timing, position, etc.)
  // 2. Run analysis through the monitoring system
  // 3. Emit anti-cheat events if thresholds are crossed

  events.on(
    'game:move_made',
    async (payload) => {
      try {
        // Extract move number from PGN
        // PGN format: "1. e4 e5 2. Nf3 Nc6..." - count the dots and piece moves
        const moveNumber = extractMoveNumber(payload.pgn);

        // Build behavioral data from what we have
        // Note: Full behavioral data (mouse patterns, focus events) would come
        // from the client. Here we use what's available from the move event.
        const behaviorData: MoveBehaviorData = {
          // We don't have exact move time from this event, but could calculate
          // from clock difference or add it to the event payload
          moveTimeMs: 3000, // Placeholder - would be calculated from clock delta

          // Focus loss would come from client
          focusLost: false,

          // Position complexity could be estimated from the position
          // For now, use a placeholder
          positionComplexity: estimatePositionComplexity(payload.fen),

          // These would ideally come from the client
          isForcedMove: payload.isCheckmate || false,
          legalMoveCount: estimateLegalMoveCount(payload.fen),
          clockRemaining: payload.whiteTime, // Simplified - should check whose turn
        };

        // Run analysis
        const result = liveGameMonitor.monitorMove(
          payload.gameId,
          payload.playerId,
          moveNumber,
          behaviorData
        );

        // Emit suspicion flag events for any new flags
        for (const flag of result.newFlags) {
          await events.emit('anticheat:suspicion_flag', {
            gameId: payload.gameId,
            playerId: payload.playerId,
            flag,
            currentScore: result.newScore,
            moveNumber,
          });
        }

        // Check if we crossed any important thresholds
        if (result.thresholdCrossed !== 'none') {
          const state = liveGameMonitor.getPlayerState(payload.gameId, payload.playerId);

          if (result.thresholdCrossed === 'review' || result.thresholdCrossed === 'suspend') {
            // High threshold - needs human review
            if (state && !state.flaggedForReview) {
              liveGameMonitor.markFlaggedForReview(payload.gameId, payload.playerId);

              await events.emit('anticheat:review_required', {
                gameId: payload.gameId,
                playerId: payload.playerId,
                score: result.newScore,
                highestSeverity: getHighestSeverity(state.flags),
                summary: createFlagSummary(state.flags),
                flags: state.flags,
                metadata: {
                  moveCount: state.moveTimes.length,
                  focusLossCount: state.focusLossEvents.length,
                  avgMoveTime: calculateAverage(state.moveTimes),
                },
              });
            }
          }

          // Any threshold crossing triggers a game flagged event
          if (state && !state.queuedForDeepAnalysis) {
            liveGameMonitor.markQueuedForDeepAnalysis(payload.gameId, payload.playerId);

            await events.emit('anticheat:game_flagged', {
              gameId: payload.gameId,
              playerId: payload.playerId,
              score: result.newScore,
              reason: `Suspicion score exceeded ${result.thresholdCrossed} threshold`,
              flags: state.flags,
              recommendedAction: result.recommendedAction as any,
            });
          }
        }
      } catch (error) {
        // Log but don't throw - anti-cheat errors shouldn't break the game
        console.error(
          `[AntiCheat] Error processing move in game ${payload.gameId}:`,
          error instanceof Error ? error.message : error
        );
      }
    },
    {
      priority: 90, // Low priority - run after persistence and broadcast
      nonBlocking: true, // Critical: don't block move processing
      label: 'anticheat:move_made',
    }
  );

  // ---------------------------------------------------------------------------
  // Game Ended Handler
  // ---------------------------------------------------------------------------
  //
  // When a game ends, we clean up the monitoring session and log a summary.
  // The monitoring data is ephemeral - only aggregated scores would be persisted.

  events.on(
    'game:ended',
    (payload) => {
      const sessions = endGameMonitoring(payload.gameId);

      // Log summary for each player
      for (const [playerId, session] of sessions) {
        const flagCount = session.flags.length;
        const score = session.suspicionScore;

        if (flagCount > 0 || score > SUSPICION_THRESHOLDS.NORMAL) {
          console.log(
            `[AntiCheat] Game ${payload.gameId} ended - Player ${playerId}: ` +
            `score=${score.toFixed(1)}, flags=${flagCount}`
          );
        }
      }
    },
    {
      priority: 90, // Low priority - cleanup
      nonBlocking: true, // Don't block game end
      label: 'anticheat:game_ended',
    }
  );

  console.log('[AntiCheat] Event handlers registered');
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Extract move number from PGN string.
 * PGN format: "1. e4 e5 2. Nf3 Nc6..."
 */
function extractMoveNumber(pgn: string): number {
  if (!pgn || pgn.trim() === '') return 1;

  // Count moves by looking at the pattern
  // Each move pair is "N. white black" where N is the move number
  const moves = pgn.trim().split(/\s+/).filter(token => {
    // Filter out move numbers (e.g., "1.", "2.")
    return !token.match(/^\d+\./);
  });

  return moves.length;
}

/**
 * Estimate position complexity from FEN.
 *
 * This is a simplified heuristic based on:
 * - Piece count (more pieces = more complex)
 * - Position type (certain patterns suggest complexity)
 *
 * A real implementation would use Stockfish analysis.
 */
function estimatePositionComplexity(fen: string): number {
  const piecePlacement = fen.split(' ')[0];

  // Count pieces
  const pieceCount = piecePlacement.replace(/[^rnbqkpRNBQKP]/g, '').length;

  // More pieces generally means more complexity
  // Baseline complexity from 0-100 based on piece count
  const baseComplexity = Math.min((pieceCount / 32) * 60, 60);

  // Add complexity for certain features
  let additionalComplexity = 0;

  // Pawns in the center (d/e files) add complexity
  const centerPawns = (piecePlacement.match(/[pP]/g) || []).length;
  additionalComplexity += centerPawns * 2;

  // Queens on the board add complexity
  if (piecePlacement.includes('q') && piecePlacement.includes('Q')) {
    additionalComplexity += 15;
  }

  return Math.min(baseComplexity + additionalComplexity, 100);
}

/**
 * Estimate the number of legal moves from a FEN position.
 *
 * This is a rough estimate. A real implementation would use a chess library.
 */
function estimateLegalMoveCount(fen: string): number {
  const piecePlacement = fen.split(' ')[0];
  const sideToMove = fen.split(' ')[1];

  // Count pieces for the side to move
  let pieceCount = 0;
  if (sideToMove === 'w') {
    pieceCount = (piecePlacement.match(/[RNBQKP]/g) || []).length;
  } else {
    pieceCount = (piecePlacement.match(/[rnbqkp]/g) || []).length;
  }

  // Very rough estimate: ~3 moves per piece on average
  return Math.max(pieceCount * 3, 1);
}

/**
 * Calculate average of an array of numbers.
 */
function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
