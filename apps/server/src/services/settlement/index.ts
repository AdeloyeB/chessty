/**
 * Settlement Service Module
 * =========================
 *
 * This module handles game result processing, fund distribution, and
 * integration with the anti-cheat system.
 *
 * MAIN COMPONENTS:
 *
 * 1. settlement.service.ts - Core settlement logic
 *    - createSettlement(): Create record when game ends
 *    - evaluateGame(): Get suspicion score from anti-cheat
 *    - decideSettlement(): Determine auto-settle vs hold
 *    - settleGame(): Pay winner for clean games
 *    - holdForReview(): Create jury case for suspicious games
 *    - resolveDispute(): Handle jury verdict
 *    - handleTimeout(): 48-hour safety release
 *    - processSettlement(): Main entry point combining all steps
 *
 * 2. notification.service.ts - Player notifications
 *    - notifyWinner(): Tell winner about payout
 *    - notifyUnderReview(): Tell players game is being reviewed
 *    - notifyResolution(): Tell players about verdict
 *    - notifyTimeoutRelease(): Tell winner about timeout release
 *
 * 3. scheduler.ts - Background jobs
 *    - startScheduler(): Begin periodic tasks
 *    - stopScheduler(): Clean shutdown
 *    - triggerTimeoutCheck(): Manual timeout processing
 *
 * 4. types.ts - TypeScript type definitions
 *
 * USAGE:
 *
 * ```typescript
 * import * as settlementService from './services/settlement';
 *
 * // Process a game settlement (called after game ends)
 * const settlement = await settlementService.processSettlement(
 *   gameId,
 *   winnerId,
 *   loserId,
 *   totalPot
 * );
 *
 * // Start the background scheduler on server startup
 * settlementService.startScheduler();
 *
 * // Stop on server shutdown
 * settlementService.stopScheduler();
 * ```
 *
 * INTEGRATION:
 * The settlement event handler (events/handlers/settlement.ts) listens for
 * game:ended events and calls processSettlement() automatically.
 */

// ---------------------------------------------------------------------------
// Type Exports
// ---------------------------------------------------------------------------

export type {
  SettlementStatus,
  SettledBy,
  Settlement,
  SettlementDecision,
  GameEvaluationResult,
  EvaluationFlag,
  SettlementNotification,
  TimedOutSettlement,
} from './types';

// ---------------------------------------------------------------------------
// Core Settlement Service
// ---------------------------------------------------------------------------

export {
  // Main entry point
  processSettlement,

  // Individual steps (for fine-grained control)
  createSettlement,
  evaluateGame,
  decideSettlement,
  settleGame,
  holdForReview,
  resolveDispute,
  handleTimeout,

  // Query functions
  getSettlement,
  getSettlementByGame,
  findTimedOutSettlements,
  findPendingSettlements,

  // Recovery functions (for stuck settlements)
  findStuckResolvingSettlements,
  recoverStuckSettlement,
} from './settlement.service';

// ---------------------------------------------------------------------------
// Notification Service
// ---------------------------------------------------------------------------

export {
  notifyWinner,
  notifyUnderReview,
  notifyResolution,
  notifyTimeoutRelease,

  // Testing utilities
  getNotificationQueue,
  getUserNotifications,
  clearNotificationQueue,
} from './notification.service';

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export {
  startScheduler,
  stopScheduler,
  isSchedulerRunning,
  triggerTimeoutCheck,
  triggerRecoveryCheck,
  getSchedulerStatus,
} from './scheduler';
