/**
 * Settlement Service
 * ==================
 *
 * Core service for handling game result processing, fund distribution,
 * and integration with the anti-cheat system.
 *
 * WHAT THIS SERVICE DOES:
 * When a chess game ends, this service decides whether to immediately pay
 * the winner or hold funds for review if cheating is suspected.
 *
 * SETTLEMENT FLOW:
 * 1. Game ends -> createSettlement() creates a pending record
 * 2. evaluateGame() calls anti-cheat system to get suspicion score
 * 3. decideSettlement() determines action based on score:
 *    - Low (<95): Auto-settle -> winner gets paid immediately
 *    - Medium (95-98): Hold for review -> jury case created
 *    - High (>98): Urgent hold -> immediate player restrictions
 * 4. If held: Jury reviews, then resolveDispute() processes verdict
 * 5. Safety valve: handleTimeout() releases funds after 48 hours
 *
 * SECURITY NOTES:
 * - All fund transfers use atomic database operations (see wallet.ts)
 * - Settlement status changes are tracked in history table for auditing
 * - Platform fee is currently 0 (beta), but architecture supports it
 */

import { eq, and, lt, sql } from 'drizzle-orm';
import {
  db,
  games,
  settlements,
  settlementHistory,
  juryCases,
} from '../../drizzle';
import type { SettlementRecord, CheatFlag } from '../../drizzle';
import type {
  Settlement,
  SettlementStatus,
  SettlementDecision,
  GameEvaluationResult,
  EvaluationFlag,
} from './types';
import * as walletService from '../wallet';
import {
  getPlayerSuspicionScore,
  getPlayerFlags,
} from '../anticheat';
import { withTransaction } from '../../utils/transaction';
// Future use: liveGameMonitor, aggregateSuspicionScore - for real-time monitoring

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Platform fee percentage (0-1).
 * Currently 0 for beta. When enabled, winner gets (pot - platformFee).
 */
const PLATFORM_FEE_RATE = 0;

/**
 * Suspicion score thresholds for settlement decisions.
 * Values are 0-100 (not 0-1) to match the anti-cheat scoring.
 *
 * - Below 95: Game is auto-settled (clean)
 * - 95-98: High suspicion, held for review
 * - Above 98: Critical suspicion, urgent review + restrictions
 */
const SUSPICION_THRESHOLDS = {
  AUTO_SETTLE: 95, // Below this = auto-settle
  HIGH: 98, // Above this = urgent priority
} as const;

/**
 * How long (in hours) to wait before auto-releasing disputed funds.
 * This is a safety valve to ensure funds are never stuck indefinitely.
 */
const TIMEOUT_HOURS = 48;

/**
 * How long (in minutes) a settlement can stay in 'resolving' status before
 * being considered stuck. If a process crashes mid-resolution, this allows
 * recovery without human intervention.
 */
const RESOLVING_STALENESS_MINUTES = 10;

// ---------------------------------------------------------------------------
// Helper Functions (Score Normalization)
// ---------------------------------------------------------------------------

/**
 * Normalize suspicion score for database storage.
 * Input: 0-100 scale (from anti-cheat system)
 * Output: "0.XXXX" string (0-1 scale for DB)
 *
 * WHY: The anti-cheat system uses 0-100 scale (e.g., 95 = 95% suspicious)
 * but the database stores scores as 0-1 scale (0.95) for consistency with
 * probability conventions used elsewhere in the codebase.
 *
 * DEFENSIVE GUARDS:
 * - NaN/undefined → 0 (assume clean if no data)
 * - Negative → 0 (clamp to valid range)
 * - >100 → 1.0000 (clamp to max)
 *
 * @param score - Suspicion score on 0-100 scale
 * @returns String representation on 0-1 scale with 4 decimal places
 */
function normalizeScore(score: number): string {
  // Guard against NaN, undefined, or non-finite values
  if (!Number.isFinite(score)) {
    console.warn(`[Settlement] normalizeScore received invalid value: ${score}, defaulting to 0`);
    return '0.0000';
  }

  // Clamp to valid 0-100 range before normalizing
  const clamped = Math.max(0, Math.min(100, score));
  return (clamped / 100).toFixed(4);
}

// ---------------------------------------------------------------------------
// Core Settlement Functions
// ---------------------------------------------------------------------------

/**
 * Create a settlement record when a game ends.
 *
 * This is called immediately when endGame() completes. It creates a pending
 * settlement that will be evaluated for suspicion shortly after.
 *
 * @param gameId - The completed game's ID
 * @param winnerId - Who won (null for draws)
 * @param totalPot - Total wager amount from both players
 * @returns The created settlement record
 */
export async function createSettlement(
  gameId: string,
  winnerId: string | null,
  loserId: string | null,
  totalPot: number
): Promise<Settlement> {
  // Calculate platform fee (currently 0)
  const platformFee = totalPot * PLATFORM_FEE_RATE;
  const winnerPayout = winnerId ? totalPot - platformFee : null;

  // Create the settlement record
  const [settlement] = await db
    .insert(settlements)
    .values({
      gameId,
      winnerId,
      loserId,
      totalPot: totalPot.toString(),
      platformFee: platformFee.toString(),
      winnerPayout: winnerPayout?.toString() ?? null,
      status: 'pending',
    })
    .returning();

  // Record the creation in history
  await db.insert(settlementHistory).values({
    settlementId: settlement.id,
    previousStatus: null,
    newStatus: 'pending',
    trigger: 'created',
    details: {
      gameId,
      winnerId,
      loserId,
      totalPot,
    },
  });

  console.log(
    `[Settlement] Created settlement ${settlement.id} for game ${gameId} ` +
    `(pot: ${totalPot}, winner: ${winnerId ?? 'draw'})`
  );

  return mapSettlementRecord(settlement);
}

/**
 * Evaluate a game for cheating using the anti-cheat system.
 *
 * This pulls data from the real-time monitoring system and calculates
 * a combined suspicion score. For games that weren't monitored in real-time,
 * it returns a neutral score.
 *
 * @param gameId - The game to evaluate
 * @returns Suspicion score and flags
 */
export async function evaluateGame(
  gameId: string
): Promise<GameEvaluationResult> {
  // Get the game to find player IDs
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
  });

  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  // Check for real-time monitoring data
  const whiteScore = getPlayerSuspicionScore(gameId, game.whitePlayerId);
  const blackScore = getPlayerSuspicionScore(gameId, game.blackPlayerId);
  const whiteFlags = getPlayerFlags(gameId, game.whitePlayerId);
  const blackFlags = getPlayerFlags(gameId, game.blackPlayerId);

  // Find the more suspicious player
  let suspiciousPlayerId: string | null = null;
  let maxScore = 0;
  let allFlags: EvaluationFlag[] = [];

  if (whiteScore > blackScore && whiteScore > 0) {
    suspiciousPlayerId = game.whitePlayerId;
    maxScore = whiteScore;
    allFlags = whiteFlags.map(mapCheatFlag);
  } else if (blackScore > 0) {
    suspiciousPlayerId = game.blackPlayerId;
    maxScore = blackScore;
    allFlags = blackFlags.map(mapCheatFlag);
  }

  // Determine recommended action
  let recommendedAction: GameEvaluationResult['recommendedAction'];
  if (maxScore < SUSPICION_THRESHOLDS.AUTO_SETTLE) {
    recommendedAction = 'auto_settle';
  } else if (maxScore < SUSPICION_THRESHOLDS.HIGH) {
    recommendedAction = 'hold_for_review';
  } else if (maxScore < 99) {
    recommendedAction = 'hold_for_review';
  } else {
    recommendedAction = 'suspend_player';
  }

  return {
    gameId,
    suspicionScore: maxScore,
    flags: allFlags,
    suspiciousPlayerId,
    recommendedAction,
  };
}

/**
 * Decide whether to auto-settle or hold funds based on suspicion score.
 *
 * This is the core decision logic. Lower suspicion = auto-settle (pay immediately).
 * Higher suspicion = hold for human review.
 *
 * @param suspicionScore - The combined suspicion score (0-100)
 * @returns Decision object with action and priority
 */
export function decideSettlement(suspicionScore: number): SettlementDecision {
  // Clean game - auto-settle
  if (suspicionScore < SUSPICION_THRESHOLDS.AUTO_SETTLE) {
    return {
      shouldHold: false,
      reason: 'auto_cleared',
      priority: 'normal',
    };
  }

  // High suspicion - hold for review
  if (suspicionScore < SUSPICION_THRESHOLDS.HIGH) {
    return {
      shouldHold: true,
      reason: 'high_suspicion',
      priority: 'high',
    };
  }

  // Critical suspicion - urgent review
  return {
    shouldHold: true,
    reason: 'critical_suspicion',
    priority: 'urgent',
  };
}

/**
 * Auto-settle a clean game by paying the winner.
 *
 * This is called for games with low suspicion scores.
 * The winner receives the pot (minus platform fee) immediately.
 *
 * SECURITY: Wrapped in a transaction to prevent race conditions.
 * Uses row locking to ensure only one process can settle at a time.
 *
 * @param settlementId - The settlement to finalize
 * @param winnerId - Who to pay
 */
export async function settleGame(
  settlementId: string,
  winnerId: string
): Promise<void> {
  await withTransaction(async (tx) => {
    // Lock the settlement row to prevent concurrent modifications
    // .for('update') acquires a row-level lock - other transactions will wait
    const [lockedSettlement] = await tx
      .select()
      .from(settlements)
      .where(eq(settlements.id, settlementId))
      .for('update');

    if (!lockedSettlement) {
      throw new Error('Settlement not found');
    }

    const settlement = mapSettlementRecord(lockedSettlement);

    if (settlement.status !== 'pending') {
      throw new Error('Settlement cannot be processed');
    }

    const payout = settlement.winnerPayout;
    if (payout === null) {
      throw new Error('Settlement has no winner payout');
    }

    // Update settlement to settled
    await tx
      .update(settlements)
      .set({
        status: 'settled',
        settledAt: new Date(),
        settledBy: 'auto',
        updatedAt: new Date(),
      })
      .where(eq(settlements.id, settlementId));

    // Record in history
    await tx.insert(settlementHistory).values({
      settlementId,
      previousStatus: 'pending',
      newStatus: 'settled',
      trigger: 'auto_settle',
      details: {
        winnerId,
        payout,
        suspicionScore: settlement.suspicionScore,
      },
    });

    console.log(
      `[Settlement] Auto-settled ${settlementId} for game ${settlement.gameId} ` +
      `(winner: ${winnerId}, payout: ${payout})`
    );

    // Note: Actual fund transfer already happened in game.ts endGame()
    // This service tracks the settlement state, not the wallet operations
    // TODO: When blockchain integration is added, trigger on-chain settlement here
  });
}

/**
 * Hold funds for review when suspicion is detected.
 *
 * This marks the settlement as disputed and creates a jury case
 * for community review.
 *
 * @param settlementId - The settlement to hold
 * @param flaggedPlayerId - The player who triggered the suspicion
 * @param suspicionScore - The suspicion score
 * @param priority - Review priority level
 */
export async function holdForReview(
  settlementId: string,
  flaggedPlayerId: string,
  suspicionScore: number,
  priority: 'normal' | 'high' | 'urgent'
): Promise<string> {
  const settlement = await getSettlement(settlementId);
  if (!settlement) {
    throw new Error(`Settlement ${settlementId} not found`);
  }

  if (settlement.status !== 'pending') {
    throw new Error(`Settlement ${settlementId} is not pending`);
  }

  // Create a jury case for review
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + TIMEOUT_HOURS);

  const [juryCase] = await db
    .insert(juryCases)
    .values({
      gameId: settlement.gameId,
      suspectPlayerId: flaggedPlayerId,
      // Use normalizeScore() for consistent 0-100 to 0-1 scale conversion
      suspicionScore: normalizeScore(suspicionScore),
      priority,
      deadline,
      status: 'pending_assignment',
    })
    .returning();

  // Update settlement to disputed
  await db
    .update(settlements)
    .set({
      status: 'disputed',
      suspicionScore: suspicionScore.toString(),
      flaggedPlayerId,
      juryCaseId: juryCase.id,
      updatedAt: new Date(),
    })
    .where(eq(settlements.id, settlementId));

  // Record in history
  await db.insert(settlementHistory).values({
    settlementId,
    previousStatus: 'pending',
    newStatus: 'disputed',
    trigger: 'suspicion_detected',
    details: {
      flaggedPlayerId,
      suspicionScore,
      priority,
      juryCaseId: juryCase.id,
    },
  });

  console.log(
    `[Settlement] Held ${settlementId} for review ` +
    `(suspect: ${flaggedPlayerId}, score: ${suspicionScore}, priority: ${priority})`
  );

  // TODO: Send notification to flagged player about review
  // TODO: Trigger juror assignment process

  return juryCase.id;
}

/**
 * Resolve a dispute after jury verdict.
 *
 * Based on the verdict:
 * - 'not_guilty': Pay the original winner
 * - 'guilty': Compensate the victim (opponent of cheater)
 *
 * SECURITY: Wrapped in a transaction with row locking to prevent:
 * - Double-payment if verdict and timeout race
 * - Inconsistent state if process crashes mid-operation
 * - Concurrent resolution attempts
 *
 * @param settlementId - The disputed settlement
 * @param verdict - The jury's decision
 * @param victimId - If guilty, who should receive compensation
 */
export async function resolveDispute(
  settlementId: string,
  verdict: 'guilty' | 'not_guilty',
  victimId?: string
): Promise<void> {
  await withTransaction(async (tx) => {
    // Lock the settlement row to prevent concurrent modifications
    // This ensures only one process can resolve this dispute at a time
    // .for('update') acquires a row-level lock - other transactions will wait
    const [lockedSettlement] = await tx
      .select()
      .from(settlements)
      .where(eq(settlements.id, settlementId))
      .for('update');

    if (!lockedSettlement) {
      throw new Error('Settlement not found');
    }

    const settlement = mapSettlementRecord(lockedSettlement);

    // Check for 'resolving' status - another process already started resolving
    // This is a race condition guard: if timeout and verdict race, one will win
    if (settlement.status === 'resolving') {
      console.log(`[Settlement] Verdict skipped for ${settlementId} - already resolving`);
      return;
    }

    // Only proceed if status is 'disputed' (normal case)
    if (settlement.status !== 'disputed') {
      console.log(`[Settlement] Verdict skipped for ${settlementId} - status is ${settlement.status}`);
      return;
    }

    // Mark as 'resolving' BEFORE doing wallet operations to prevent race
    // This is an intermediate status that blocks other resolution attempts
    await tx
      .update(settlements)
      .set({
        status: 'resolving' as SettlementStatus,
        updatedAt: new Date(),
      })
      .where(eq(settlements.id, settlementId));

    const payout = settlement.totalPot - settlement.platformFee;

    if (verdict === 'not_guilty') {
      // Original winner was not cheating - pay them
      if (settlement.winnerId) {
        await walletService.awardWinnings(
          settlement.winnerId,
          payout,
          settlement.gameId
        );
      }
    } else {
      // Cheater found guilty - compensate the victim
      if (!victimId) {
        throw new Error('Missing required data for resolution');
      }

      await walletService.awardWinnings(
        victimId,
        payout,
        settlement.gameId
      );
    }

    // Update settlement to resolved
    await tx
      .update(settlements)
      .set({
        status: 'resolved',
        settledAt: new Date(),
        settledBy: 'jury',
        // Update winner if verdict changed the outcome
        winnerId: verdict === 'guilty' && victimId ? victimId : settlement.winnerId,
        winnerPayout: payout.toString(),
        updatedAt: new Date(),
      })
      .where(eq(settlements.id, settlementId));

    // Record in history
    await tx.insert(settlementHistory).values({
      settlementId,
      previousStatus: 'disputed',
      newStatus: 'resolved',
      trigger: 'verdict',
      details: {
        verdict,
        victimId,
        payout,
      },
    });

    console.log(
      `[Settlement] Resolved ${settlementId} with verdict: ${verdict} ` +
      `(payout: ${payout} to ${verdict === 'guilty' ? victimId : settlement.winnerId})`
    );
  });
}

/**
 * Handle settlement timeout - safety valve after 48 hours.
 *
 * If a disputed settlement hasn't been resolved within the timeout period,
 * funds are released to the original winner. This prevents funds from being
 * locked indefinitely.
 *
 * SECURITY: Wrapped in a transaction with row locking to prevent:
 * - Double-payment if timeout and verdict race
 * - Processing already-resolved settlements
 *
 * @param settlementId - The timed-out settlement
 */
export async function handleTimeout(settlementId: string): Promise<void> {
  await withTransaction(async (tx) => {
    // Lock the settlement row to prevent concurrent modifications
    // .for('update') acquires a row-level lock - other transactions will wait
    const [lockedSettlement] = await tx
      .select()
      .from(settlements)
      .where(eq(settlements.id, settlementId))
      .for('update');

    if (!lockedSettlement) {
      throw new Error('Settlement not found');
    }

    const settlement = mapSettlementRecord(lockedSettlement);

    if (settlement.status !== 'disputed') {
      // Already resolved by jury verdict - skip silently
      // This is not an error; it's expected in race conditions
      console.log(
        `[Settlement] Timeout skipped for ${settlementId} - already ${settlement.status}`
      );
      return;
    }

    // Mark as 'resolving' to prevent concurrent processing
    await tx
      .update(settlements)
      .set({
        status: 'resolving' as SettlementStatus,
        updatedAt: new Date(),
      })
      .where(eq(settlements.id, settlementId));

    const payout = settlement.totalPot - settlement.platformFee;

    // Release funds to original winner
    if (settlement.winnerId) {
      await walletService.awardWinnings(
        settlement.winnerId,
        payout,
        settlement.gameId
      );
    }

    // Update settlement
    await tx
      .update(settlements)
      .set({
        status: 'resolved',
        settledAt: new Date(),
        settledBy: 'timeout',
        winnerPayout: payout.toString(),
        updatedAt: new Date(),
      })
      .where(eq(settlements.id, settlementId));

    // Record in history
    await tx.insert(settlementHistory).values({
      settlementId,
      previousStatus: 'disputed',
      newStatus: 'resolved',
      trigger: 'timeout',
      details: {
        timeoutHours: TIMEOUT_HOURS,
        winnerId: settlement.winnerId,
        payout,
      },
    });

    console.log(
      `[Settlement] Timeout release for ${settlementId} ` +
      `(winner: ${settlement.winnerId}, payout: ${payout})`
    );
  });
}

// ---------------------------------------------------------------------------
// Query Functions
// ---------------------------------------------------------------------------

/**
 * Get a settlement by ID.
 */
export async function getSettlement(settlementId: string): Promise<Settlement | null> {
  const record = await db.query.settlements.findFirst({
    where: eq(settlements.id, settlementId),
  });

  return record ? mapSettlementRecord(record) : null;
}

/**
 * Get settlement by game ID.
 */
export async function getSettlementByGame(gameId: string): Promise<Settlement | null> {
  const record = await db.query.settlements.findFirst({
    where: eq(settlements.gameId, gameId),
  });

  return record ? mapSettlementRecord(record) : null;
}

/**
 * Find settlements that have timed out and need automatic resolution.
 */
export async function findTimedOutSettlements(): Promise<Settlement[]> {
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - TIMEOUT_HOURS);

  const records = await db.query.settlements.findMany({
    where: and(
      eq(settlements.status, 'disputed'),
      lt(settlements.createdAt, cutoffTime)
    ),
  });

  return records.map(mapSettlementRecord);
}

/**
 * Find settlements stuck in 'resolving' status.
 *
 * WHY: The 'resolving' status is a transient lock state used to prevent
 * double-payment races. A settlement should only be in this state for
 * a few seconds while wallet operations complete. If a process crashes
 * mid-resolution, the settlement gets stuck.
 *
 * RECOVERY: If a settlement has been 'resolving' for longer than the
 * staleness threshold (10 minutes), we reset it to 'disputed' so the
 * normal timeout or verdict process can retry.
 *
 * @returns Array of stuck settlements
 */
export async function findStuckResolvingSettlements(): Promise<Settlement[]> {
  const cutoffTime = new Date();
  cutoffTime.setMinutes(cutoffTime.getMinutes() - RESOLVING_STALENESS_MINUTES);

  const records = await db.query.settlements.findMany({
    where: and(
      eq(settlements.status, 'resolving'),
      lt(settlements.updatedAt, cutoffTime)
    ),
  });

  return records.map(mapSettlementRecord);
}

/**
 * Recover a stuck 'resolving' settlement by resetting it to 'disputed'.
 *
 * This allows the normal resolution flow (verdict or timeout) to retry.
 * We log the recovery for auditing purposes.
 *
 * @param settlementId - The stuck settlement to recover
 */
export async function recoverStuckSettlement(settlementId: string): Promise<void> {
  await withTransaction(async (tx) => {
    const [lockedSettlement] = await tx
      .select()
      .from(settlements)
      .where(eq(settlements.id, settlementId))
      .for('update');

    if (!lockedSettlement) {
      throw new Error('Settlement not found');
    }

    const settlement = mapSettlementRecord(lockedSettlement);

    // Only recover if still in 'resolving' state
    if (settlement.status !== 'resolving') {
      console.log(
        `[Settlement] Recovery skipped for ${settlementId} - status is now ${settlement.status}`
      );
      return;
    }

    // Reset to 'disputed' to allow retry
    await tx
      .update(settlements)
      .set({
        status: 'disputed' as SettlementStatus,
        updatedAt: new Date(),
      })
      .where(eq(settlements.id, settlementId));

    // Record in history for auditing
    await tx.insert(settlementHistory).values({
      settlementId,
      previousStatus: 'resolving',
      newStatus: 'disputed',
      trigger: 'recovery',
      details: {
        reason: 'Stuck in resolving state, reset for retry',
        stalenessMinutes: RESOLVING_STALENESS_MINUTES,
      },
    });

    console.log(
      `[Settlement] Recovered stuck settlement ${settlementId} - reset to disputed`
    );
  });
}

/**
 * Get settlements pending evaluation (recently created, not yet evaluated).
 */
export async function findPendingSettlements(): Promise<Settlement[]> {
  const records = await db.query.settlements.findMany({
    where: and(
      eq(settlements.status, 'pending'),
      sql`${settlements.suspicionScore} IS NULL`
    ),
  });

  return records.map(mapSettlementRecord);
}

// ---------------------------------------------------------------------------
// Process Settlement (Main Entry Point)
// ---------------------------------------------------------------------------

/**
 * Full settlement processing flow.
 *
 * This is the main entry point called after a game ends:
 * 1. Create settlement record
 * 2. Evaluate for suspicion
 * 3. Either auto-settle or hold for review
 *
 * @param gameId - The completed game
 * @param winnerId - Who won (null for draws)
 * @param loserId - Who lost (null for draws)
 * @param totalPot - Total wager amount
 */
export async function processSettlement(
  gameId: string,
  winnerId: string | null,
  loserId: string | null,
  totalPot: number
): Promise<Settlement> {
  // Step 1: Create settlement record
  const settlement = await createSettlement(gameId, winnerId, loserId, totalPot);

  // Step 2: Evaluate the game for suspicion
  const evaluation = await evaluateGame(gameId);

  // Step 3: Update settlement with evaluation results
  await db
    .update(settlements)
    .set({
      suspicionScore: evaluation.suspicionScore.toString(),
      flaggedPlayerId: evaluation.suspiciousPlayerId,
      updatedAt: new Date(),
    })
    .where(eq(settlements.id, settlement.id));

  // Step 4: Decide and execute settlement action
  const decision = decideSettlement(evaluation.suspicionScore);

  if (!decision.shouldHold && winnerId) {
    // Clean game - auto-settle
    await settleGame(settlement.id, winnerId);
  } else if (decision.shouldHold && evaluation.suspiciousPlayerId) {
    // Suspicious game - hold for review
    await holdForReview(
      settlement.id,
      evaluation.suspiciousPlayerId,
      evaluation.suspicionScore,
      decision.priority
    );
  } else if (!winnerId) {
    // Draw - mark as settled (no payout needed)
    await db
      .update(settlements)
      .set({
        status: 'settled',
        settledAt: new Date(),
        settledBy: 'auto',
        updatedAt: new Date(),
      })
      .where(eq(settlements.id, settlement.id));

    await db.insert(settlementHistory).values({
      settlementId: settlement.id,
      previousStatus: 'pending',
      newStatus: 'settled',
      trigger: 'draw',
      details: { reason: 'Game ended in draw' },
    });
  }

  // Return updated settlement
  return (await getSettlement(settlement.id))!;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Map database record to Settlement type.
 */
function mapSettlementRecord(record: SettlementRecord): Settlement {
  return {
    id: record.id,
    gameId: record.gameId,
    winnerId: record.winnerId,
    loserId: record.loserId,
    totalPot: parseFloat(record.totalPot),
    platformFee: parseFloat(record.platformFee),
    winnerPayout: record.winnerPayout ? parseFloat(record.winnerPayout) : null,
    status: record.status as SettlementStatus,
    suspicionScore: record.suspicionScore ? parseFloat(record.suspicionScore) : null,
    flaggedPlayerId: record.flaggedPlayerId,
    juryCaseId: record.juryCaseId,
    settledAt: record.settledAt,
    settledBy: record.settledBy as Settlement['settledBy'],
    escrowTxHash: record.escrowTxHash,
    settlementTxHash: record.settlementTxHash,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Map CheatFlag from anticheat to EvaluationFlag.
 */
function mapCheatFlag(flag: CheatFlag): EvaluationFlag {
  return {
    type: flag.type,
    severity: flag.severity,
    description: flag.description || `${flag.type} detected`,
    moveNumbers: flag.moveNumber ? [flag.moveNumber] : undefined,
  };
}
