/**
 * Settlement Service Types
 * ========================
 *
 * Type definitions for the settlement system that handles game result processing,
 * fund distribution, and integration with the anti-cheat system.
 *
 * CONTEXT:
 * When a chess game ends on our real-money platform, we need to decide whether
 * to immediately pay out winnings or hold funds for review. This decision is
 * based on the anti-cheat system's suspicion scoring.
 *
 * SETTLEMENT FLOW:
 * 1. Game ends -> Settlement record created
 * 2. Anti-cheat evaluates the game (suspicion scoring)
 * 3. Based on score:
 *    - Low suspicion (<95): Auto-settle (pay winner immediately)
 *    - Medium suspicion (95-98): Hold for review with high priority
 *    - High suspicion (>98): Hold with urgent priority, create overwatch case
 * 4. If held:
 *    - Overwatch reviews the case
 *    - Verdict determines payout (innocent: pay winner, guilty: compensate victim)
 *    - 48-hour timeout auto-releases if no verdict
 */

// ---------------------------------------------------------------------------
// Status Types
// ---------------------------------------------------------------------------

/**
 * The lifecycle of a settlement.
 *
 * pending:   Settlement created, awaiting suspicion evaluation
 * settled:   Funds distributed to winner (clean game or cleared after review)
 * disputed:  Funds held, awaiting overwatch verdict
 * resolving: Intermediate state during resolution (prevents concurrent processing)
 * resolved:  Dispute resolved (after overwatch verdict or timeout)
 *
 * NOTE: 'resolving' is a transient state that should only exist during an
 * active transaction. If a settlement is stuck in 'resolving' state, it
 * indicates a crashed transaction that needs manual recovery.
 */
export type SettlementStatus = 'pending' | 'settled' | 'disputed' | 'resolving' | 'resolved';

/**
 * Who or what triggered the final settlement.
 *
 * auto:    Automatic settlement (clean game, low suspicion)
 * overwatch:    Human overwatch made a verdict
 * timeout: 48-hour safety valve released funds automatically
 * admin:   Manual admin intervention
 */
export type SettledBy = 'auto' | 'overwatch' | 'timeout' | 'admin';

// ---------------------------------------------------------------------------
// Core Settlement Types
// ---------------------------------------------------------------------------

/**
 * A settlement record for a completed game.
 *
 * Created when a game ends, tracks the state of fund distribution
 * from initial pot through final payout.
 */
export interface Settlement {
  /** Unique settlement identifier */
  id: string;

  /** The game this settlement is for */
  gameId: string;

  /** Total pot (both players' wagers combined) */
  totalPot: number;

  /**
   * Platform fee taken from the pot.
   * Currently 0 (fee-free during beta), but structured for future.
   */
  platformFee: number;

  /**
   * Amount paid to winner after fees.
   * null if game is still disputed or was a draw.
   */
  winnerPayout: number | null;

  /** ID of the winner. null for draws or disputed games. */
  winnerId: string | null;

  /** ID of the loser. null for draws or disputed games. */
  loserId: string | null;

  /** Current settlement status */
  status: SettlementStatus;

  /**
   * Anti-cheat suspicion score (0-100).
   * null until evaluation is complete.
   */
  suspicionScore: number | null;

  /**
   * The player who triggered the suspicion flag.
   * null if game was clean.
   */
  flaggedPlayerId: string | null;

  /**
   * Link to the overwatch review case if disputed.
   * Uses the reviewTasks table from anticheat-schema.
   */
  overwatchCaseId: string | null;

  /** When the settlement was finalized. null if still pending/disputed. */
  settledAt: Date | null;

  /** What triggered the final settlement. null if not yet settled. */
  settledBy: SettledBy | null;

  // ---------------------------------------------------------------------------
  // Blockchain Fields (Stubbed)
  // ---------------------------------------------------------------------------
  // These will be populated when smart contract integration is implemented.

  /**
   * Transaction hash of the initial escrow deposit.
   * TODO: Implement when ChessEscrow.sol is deployed.
   */
  escrowTxHash: string | null;

  /**
   * Transaction hash of the settlement transaction.
   * TODO: Implement when settlement flow is on-chain.
   */
  settlementTxHash: string | null;

  /** When this settlement record was created */
  createdAt: Date;

  /** When this settlement record was last updated */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Settlement Decision Types
// ---------------------------------------------------------------------------

/**
 * The decision output from evaluating a game's suspicion score.
 * Determines whether to auto-settle or hold for review.
 */
export interface SettlementDecision {
  /**
   * Whether to hold funds for review.
   * true = disputed, false = auto-settle.
   */
  shouldHold: boolean;

  /**
   * Human-readable reason for the decision.
   * Used for logging and UI display.
   */
  reason: string;

  /**
   * Priority level for review queue if held.
   * Higher priority = reviewed sooner.
   */
  priority: 'normal' | 'high' | 'urgent';
}

// ---------------------------------------------------------------------------
// Anti-Cheat Integration Types
// ---------------------------------------------------------------------------

/**
 * Result of evaluating a game for cheating.
 * Combines data from all anti-cheat modules.
 */
export interface GameEvaluationResult {
  /** The game that was evaluated */
  gameId: string;

  /** Combined suspicion score (0-100) */
  suspicionScore: number;

  /** Individual flags raised during analysis */
  flags: EvaluationFlag[];

  /** Which player (if any) appears suspicious */
  suspiciousPlayerId: string | null;

  /** Recommended action based on the score */
  recommendedAction: 'auto_settle' | 'monitor' | 'hold_for_review' | 'suspend_player';
}

/**
 * A single flag raised during game evaluation.
 */
export interface EvaluationFlag {
  /** Type of suspicious behavior detected */
  type: string;

  /** How serious this flag is */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Description of what was detected */
  description: string;

  /** Move numbers where this was detected (if applicable) */
  moveNumbers?: number[];
}

// ---------------------------------------------------------------------------
// Notification Types
// ---------------------------------------------------------------------------

/**
 * Notification to send to a player about their game settlement.
 */
export interface SettlementNotification {
  /** Who to notify */
  userId: string;

  /** Type of notification */
  type: 'winner' | 'under_review' | 'cleared' | 'guilty' | 'compensated';

  /** Game ID for reference */
  gameId: string;

  /** Amount involved (if applicable) */
  amount?: number;

  /** Additional message (if applicable) */
  message?: string;
}

// ---------------------------------------------------------------------------
// Scheduler Types
// ---------------------------------------------------------------------------

/**
 * A settlement that has timed out and needs automatic resolution.
 */
export interface TimedOutSettlement {
  /** Settlement ID */
  id: string;

  /** Game ID */
  gameId: string;

  /** Winner ID (will receive payout) */
  winnerId: string;

  /** Amount to pay out */
  amount: number;

  /** How long it was in disputed state */
  durationHours: number;
}
