/**
 * Jury System Event Handler
 * ==========================
 *
 * Connects the jury system to the game event flow.
 * Listens for anti-cheat events and creates jury cases for high-suspicion games.
 *
 * HOW IT WORKS:
 * 1. Listens for anticheat:review_required events (fired when suspicion > 95%)
 * 2. Creates a jury case for the flagged game
 * 3. Assigns eligible jurors to review the case
 * 4. Periodically checks for cases that need resolution
 *
 * DESIGN DECISIONS:
 * - NON-BLOCKING: Case creation and assignment run asynchronously
 * - LOW PRIORITY: Runs after core anti-cheat handlers (priority 95)
 * - FIRE-AND-FORGET: Errors logged but don't break the event chain
 *
 * TEST CASES:
 * The handler automatically inserts calibration cases (1 in 5) to measure
 * juror accuracy. These are mixed in with real cases.
 */

import type { GameEventEmitter } from '../GameEventEmitter';
import {
  createCase,
  checkAndResolveCases,
  expirePendingAssignments,
  maybeInsertTestCase,
} from '../../services/jury';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum suspicion score to create a jury case */
const JURY_CASE_THRESHOLD = 0.95;

/** How often to check for cases needing resolution (ms) */
const RESOLUTION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

/** How often to expire pending assignments (ms) */
const EXPIRATION_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Handler Registration
// ---------------------------------------------------------------------------

/**
 * Register jury system event handlers.
 *
 * These handlers run as non-blocking with low priority so they don't
 * affect the main anti-cheat flow.
 *
 * @param events - The game event emitter
 */
export function registerJuryHandlers(events: GameEventEmitter): void {
  // ---------------------------------------------------------------------------
  // Review Required Handler
  // ---------------------------------------------------------------------------
  //
  // When the anti-cheat system flags a game for human review (suspicion > 95%),
  // we create a jury case for community review.

  events.on(
    'anticheat:review_required',
    async (payload) => {
      try {
        // Only create jury cases for high suspicion scores
        // The threshold should match SUSPICION_THRESHOLDS.REVIEW from anticheat
        if (payload.score < JURY_CASE_THRESHOLD * 100) {
          console.log(
            `[Jury] Skipping case creation for game ${payload.gameId}: ` +
            `score ${payload.score} below threshold ${JURY_CASE_THRESHOLD * 100}`
          );
          return;
        }

        // Maybe insert a test case first (for calibration)
        await maybeInsertTestCase();

        // Determine case priority based on severity
        let priority: 'normal' | 'high' | 'urgent' = 'normal';
        if (payload.highestSeverity === 'critical') {
          priority = 'urgent';
        } else if (payload.highestSeverity === 'high') {
          priority = 'high';
        }

        // Create the jury case
        const juryCase = await createCase({
          gameId: payload.gameId,
          suspectPlayerId: payload.playerId,
          suspicionScore: payload.score / 100, // Convert from 0-100 to 0-1
          priority,
          anticheatMetadata: {
            flags: payload.flags,
            summary: payload.summary,
            metadata: payload.metadata,
            detectedAt: new Date().toISOString(),
          },
        });

        console.log(
          `[Jury] Created case ${juryCase.id} for game ${payload.gameId} ` +
          `(player: ${payload.playerId}, priority: ${priority})`
        );
      } catch (error) {
        // Log but don't throw - jury case creation shouldn't break the event chain
        console.error(
          `[Jury] Error creating case for game ${payload.gameId}:`,
          error instanceof Error ? error.message : error
        );
      }
    },
    {
      priority: 95, // Run after core anti-cheat handlers
      nonBlocking: true, // Don't block the event chain
      label: 'jury:review_required',
    }
  );

  // ---------------------------------------------------------------------------
  // Game Flagged Handler
  // ---------------------------------------------------------------------------
  //
  // For games flagged at lower thresholds (>50 suspicion), we log but don't
  // create jury cases. These are monitored but not yet ready for community review.

  events.on(
    'anticheat:game_flagged',
    (payload) => {
      // Just log for now - we don't create jury cases for lower thresholds
      // These games are queued for deep analysis first
      console.log(
        `[Jury] Game ${payload.gameId} flagged for monitoring ` +
        `(player: ${payload.playerId}, score: ${payload.score}, action: ${payload.recommendedAction})`
      );
    },
    {
      priority: 95,
      nonBlocking: true,
      label: 'jury:game_flagged',
    }
  );

  console.log('[Jury] Event handlers registered');
}

// ---------------------------------------------------------------------------
// Periodic Tasks
// ---------------------------------------------------------------------------

/**
 * Start periodic tasks for the jury system.
 *
 * These tasks run on intervals to:
 * 1. Check for cases that have enough verdicts to resolve
 * 2. Expire pending assignments that have passed their deadline
 *
 * Call this once at server startup.
 */
export function startJuryPeriodicTasks(): void {
  // Check for cases to resolve every 5 minutes
  setInterval(async () => {
    try {
      const resolved = await checkAndResolveCases();
      if (resolved > 0) {
        console.log(`[Jury] Periodic check resolved ${resolved} cases`);
      }
    } catch (error) {
      console.error('[Jury] Error in resolution check:', error);
    }
  }, RESOLUTION_CHECK_INTERVAL);

  // Expire pending assignments every hour
  setInterval(async () => {
    try {
      const expired = await expirePendingAssignments();
      if (expired > 0) {
        console.log(`[Jury] Expired ${expired} pending assignments`);
      }
    } catch (error) {
      console.error('[Jury] Error in expiration check:', error);
    }
  }, EXPIRATION_CHECK_INTERVAL);

  console.log('[Jury] Periodic tasks started');
}
