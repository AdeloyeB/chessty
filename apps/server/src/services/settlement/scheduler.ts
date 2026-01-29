/**
 * Settlement Scheduler
 * ====================
 *
 * Background job scheduler for settlement-related tasks.
 * Currently handles one main task:
 *
 * 1. TIMEOUT CHECKER
 *    - Runs every hour
 *    - Finds disputed settlements older than 48 hours
 *    - Automatically releases funds to original winner
 *    - This is the "safety valve" ensuring funds are never stuck indefinitely
 *
 * HOW IT WORKS:
 * The scheduler uses setInterval to run periodic checks. In a production
 * environment with multiple server instances, you'd want to use a distributed
 * scheduler like:
 * - Bull/BullMQ (Redis-backed job queue)
 * - pg-boss (PostgreSQL-backed)
 * - Temporal (workflow engine)
 *
 * For our single-server setup, setInterval is sufficient.
 *
 * DESIGN NOTES:
 * - Jobs are idempotent (safe to run multiple times)
 * - Errors are logged but don't crash the scheduler
 * - Each job runs independently
 */

import { findTimedOutSettlements, handleTimeout } from './settlement.service';
import { notifyTimeoutRelease } from './notification.service';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * How often to check for timed-out settlements (in milliseconds).
 * Default: 1 hour
 */
const TIMEOUT_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Whether the scheduler is currently running.
 */
let isRunning = false;

/**
 * Reference to the interval timer for cleanup.
 */
let timeoutCheckInterval: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Scheduler Control
// ---------------------------------------------------------------------------

/**
 * Start the settlement scheduler.
 *
 * Begins periodic background jobs for settlement processing.
 * Safe to call multiple times (only starts once).
 */
export function startScheduler(): void {
  if (isRunning) {
    console.log('[Settlement:Scheduler] Already running, skipping start');
    return;
  }

  console.log('[Settlement:Scheduler] Starting settlement scheduler...');

  // Run timeout check immediately on startup, then periodically
  runTimeoutCheck().catch((err) => {
    console.error('[Settlement:Scheduler] Initial timeout check failed:', err);
  });

  timeoutCheckInterval = setInterval(() => {
    runTimeoutCheck().catch((err) => {
      console.error('[Settlement:Scheduler] Timeout check failed:', err);
    });
  }, TIMEOUT_CHECK_INTERVAL_MS);

  isRunning = true;
  console.log(
    `[Settlement:Scheduler] Started. Timeout check runs every ${TIMEOUT_CHECK_INTERVAL_MS / 60000} minutes.`
  );
}

/**
 * Stop the settlement scheduler.
 *
 * Cleans up intervals and stops all background jobs.
 * Safe to call multiple times.
 */
export function stopScheduler(): void {
  if (!isRunning) {
    console.log('[Settlement:Scheduler] Not running, nothing to stop');
    return;
  }

  console.log('[Settlement:Scheduler] Stopping settlement scheduler...');

  if (timeoutCheckInterval) {
    clearInterval(timeoutCheckInterval);
    timeoutCheckInterval = null;
  }

  isRunning = false;
  console.log('[Settlement:Scheduler] Stopped');
}

/**
 * Check if the scheduler is currently running.
 */
export function isSchedulerRunning(): boolean {
  return isRunning;
}

// ---------------------------------------------------------------------------
// Background Jobs
// ---------------------------------------------------------------------------

/**
 * Check for and process timed-out settlements.
 *
 * This is the main background job. It:
 * 1. Finds all disputed settlements older than 48 hours
 * 2. Releases funds to the original winner for each
 * 3. Sends notifications about the release
 *
 * The job is idempotent - running it multiple times won't cause issues
 * because handleTimeout() checks the settlement status first.
 */
async function runTimeoutCheck(): Promise<void> {
  console.log('[Settlement:Scheduler] Running timeout check...');

  try {
    // Find settlements that have been disputed for too long
    const timedOut = await findTimedOutSettlements();

    if (timedOut.length === 0) {
      console.log('[Settlement:Scheduler] No timed-out settlements found');
      return;
    }

    console.log(
      `[Settlement:Scheduler] Found ${timedOut.length} timed-out settlement(s)`
    );

    // Process each one
    let processed = 0;
    let failed = 0;

    for (const settlement of timedOut) {
      try {
        // Release funds
        await handleTimeout(settlement.id);

        // Notify the winner
        if (settlement.winnerId && settlement.winnerPayout !== null) {
          await notifyTimeoutRelease(
            settlement.winnerId,
            settlement.winnerPayout,
            settlement.gameId
          );
        }

        processed++;
      } catch (err) {
        console.error(
          `[Settlement:Scheduler] Failed to process timeout for ${settlement.id}:`,
          err instanceof Error ? err.message : err
        );
        failed++;
      }
    }

    console.log(
      `[Settlement:Scheduler] Timeout check complete. ` +
      `Processed: ${processed}, Failed: ${failed}`
    );
  } catch (err) {
    console.error(
      '[Settlement:Scheduler] Timeout check failed:',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Manual Triggers (for testing and admin)
// ---------------------------------------------------------------------------

/**
 * Manually trigger the timeout check.
 *
 * Useful for testing or admin-triggered cleanup.
 */
export async function triggerTimeoutCheck(): Promise<{
  processed: number;
  failed: number;
}> {
  console.log('[Settlement:Scheduler] Manual timeout check triggered');

  const timedOut = await findTimedOutSettlements();
  let processed = 0;
  let failed = 0;

  for (const settlement of timedOut) {
    try {
      await handleTimeout(settlement.id);

      if (settlement.winnerId && settlement.winnerPayout !== null) {
        await notifyTimeoutRelease(
          settlement.winnerId,
          settlement.winnerPayout,
          settlement.gameId
        );
      }

      processed++;
    } catch (err) {
      console.error(
        `[Settlement:Scheduler] Failed to process ${settlement.id}:`,
        err instanceof Error ? err.message : err
      );
      failed++;
    }
  }

  return { processed, failed };
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

/**
 * Get scheduler status for health checks.
 */
export function getSchedulerStatus(): {
  running: boolean;
  timeoutCheckIntervalMs: number;
} {
  return {
    running: isRunning,
    timeoutCheckIntervalMs: TIMEOUT_CHECK_INTERVAL_MS,
  };
}
