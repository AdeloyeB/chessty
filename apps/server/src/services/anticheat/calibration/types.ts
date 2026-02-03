/**
 * Calibration Types for Anti-Cheat System
 * ========================================
 *
 * This module defines types for the calibration system that tunes
 * anti-cheat weights and thresholds using real game data from Lichess.
 *
 * The calibration process:
 * 1. Fetch games from confirmed cheaters (tosViolation: true)
 * 2. Fetch games from clean players at similar ratings
 * 3. Analyze all games using our engine analysis
 * 4. Compare score distributions
 * 5. Find optimal weights/thresholds to maximize accuracy
 */

// ---------------------------------------------------------------------------
// Lichess API Types
// ---------------------------------------------------------------------------

/**
 * Lichess user object from /api/user/{username}
 */
export interface LichessUser {
  id: string;
  username: string;
  /** True if user was banned for ToS violation (cheating) */
  tosViolation?: boolean;
  /** User's performance ratings by time control */
  perfs?: {
    blitz?: { rating: number; games: number };
    rapid?: { rating: number; games: number };
    bullet?: { rating: number; games: number };
    classical?: { rating: number; games: number };
  };
  /** Account creation timestamp */
  createdAt?: number;
  /** Last seen timestamp */
  seenAt?: number;
  /** Account is closed/disabled */
  disabled?: boolean;
}

/**
 * Lichess game object from NDJSON export
 */
export interface LichessGame {
  id: string;
  /** Game speed (bullet, blitz, rapid, classical) */
  speed: 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence';
  /** Game variant */
  variant: string;
  /** White player info */
  players: {
    white: {
      user?: { id: string; name: string };
      rating?: number;
      ratingDiff?: number;
    };
    black: {
      user?: { id: string; name: string };
      rating?: number;
      ratingDiff?: number;
    };
  };
  /** Game result */
  winner?: 'white' | 'black';
  status: string;
  /** Moves in SAN notation (space-separated) */
  moves?: string;
  /** Clock times in centiseconds for each move */
  clocks?: number[];
  /** Lichess server evaluations (centipawns) for each position */
  analysis?: Array<{
    eval?: number;
    mate?: number;
    best?: string;
    variation?: string;
    judgment?: {
      name: 'Inaccuracy' | 'Mistake' | 'Blunder';
      comment: string;
    };
  }>;
  /** Game timestamp */
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Calibration Dataset Types
// ---------------------------------------------------------------------------

/**
 * A game prepared for calibration analysis
 */
export interface CalibrationGame {
  /** Lichess game ID */
  gameId: string;
  /** Is this from a confirmed cheater? (ground truth label) */
  isCheater: boolean;
  /** Player's rating at time of game */
  playerRating: number;
  /** Time control */
  timeControl: 'bullet' | 'blitz' | 'rapid' | 'classical';
  /** Which color the player was */
  playerColor: 'white' | 'black';
  /** Moves in SAN notation */
  moves: string[];
  /** Clock times in seconds for each move (if available) */
  clockTimes?: number[];
  /** Lichess evaluations (if available) */
  evaluations?: number[];
}

/**
 * Analysis result for a calibration game
 */
export interface CalibrationAnalysis {
  gameId: string;
  isCheater: boolean;
  playerRating: number;
  timeControl: CalibrationGame['timeControl'];
  /** Individual signal scores (0-1) */
  scores: {
    engine: number;
    behavior: number;
    skillShift: number;
    timing: number;
    mouse: number; // Always 0 for Lichess games (no mouse data)
  };
  /** Aggregated score using current weights */
  aggregatedScore: number;
  /** Metrics used for analysis */
  metrics: {
    topMoveRate: number;
    avgCPL: number;
    criticalCPL: number;
    moveCount: number;
  };
}

// ---------------------------------------------------------------------------
// Calibration Configuration Types
// ---------------------------------------------------------------------------

/**
 * Weight configuration for signal aggregation
 */
export interface SignalWeights {
  engine: number;
  behavior: number;
  skillShift: number;
  timing: number;
  mouse: number;
}

/**
 * Threshold configuration for recommended actions
 */
export interface ActionThresholds {
  monitor: number; // Score above this → monitor
  restrictStakes: number; // Score above this → restrict stakes
  flagForReview: number; // Score above this → flag for human review
  suspend: number; // Score above this → auto-suspend
}

/**
 * Full calibration configuration
 */
export interface CalibrationConfig {
  weights: SignalWeights;
  thresholds: ActionThresholds;
  /** Per-rating adjustments (optional) */
  ratingAdjustments?: Record<string, {
    weightMultiplier: number;
    thresholdOffset: number;
  }>;
}

// ---------------------------------------------------------------------------
// Calibration Results Types
// ---------------------------------------------------------------------------

/**
 * Metrics for evaluating calibration quality
 */
export interface CalibrationMetrics {
  /** True positive rate (sensitivity) - % of cheaters correctly flagged */
  truePositiveRate: number;
  /** False positive rate - % of clean players incorrectly flagged */
  falsePositiveRate: number;
  /** Precision - % of flagged players who are actually cheaters */
  precision: number;
  /** F1 score - harmonic mean of precision and recall */
  f1Score: number;
  /** Area under ROC curve */
  auc: number;
  /** Optimal threshold for given false positive tolerance */
  optimalThreshold: number;
}

/**
 * Full calibration result
 */
export interface CalibrationResult {
  /** Optimized weights */
  optimizedWeights: SignalWeights;
  /** Optimized thresholds */
  optimizedThresholds: ActionThresholds;
  /** Metrics at various false positive rates */
  metrics: {
    at1PercentFPR: CalibrationMetrics;
    at5PercentFPR: CalibrationMetrics;
    at10PercentFPR: CalibrationMetrics;
  };
  /** Dataset statistics */
  datasetStats: {
    totalGames: number;
    cheaterGames: number;
    cleanGames: number;
    ratingDistribution: Record<string, number>;
    timeControlDistribution: Record<string, number>;
  };
  /** Timestamp of calibration */
  calibratedAt: string;
  /** Version identifier */
  version: string;
}

// ---------------------------------------------------------------------------
// Lichess API Response Types
// ---------------------------------------------------------------------------

/**
 * Options for fetching games from Lichess
 */
export interface LichessFetchOptions {
  /** Maximum number of games to fetch */
  max?: number;
  /** Filter by time control */
  perfType?: 'bullet' | 'blitz' | 'rapid' | 'classical';
  /** Include clock data */
  clocks?: boolean;
  /** Include analysis data */
  evals?: boolean;
  /** Only rated games */
  rated?: boolean;
  /** Games since timestamp (ms) */
  since?: number;
  /** Games until timestamp (ms) */
  until?: number;
}
