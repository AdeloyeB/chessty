/**
 * Anti-Cheat Analysis Types
 * =========================
 *
 * Type definitions for the server-side anti-cheat analysis system.
 * These types are used across all anti-cheat modules to detect and flag
 * potentially suspicious behavior in chess games.
 *
 * CONTEXT:
 * This is a real-money betting platform. Cheating directly steals from honest
 * players, so our detection system must be thorough while minimizing false
 * positives that could wrongly penalize legitimate players.
 */

// Re-export shared analysis types that are also used here
export type { EngineEvaluation, MoveClassification, AnalyzedMove } from '@chess-game/shared';

// ---------------------------------------------------------------------------
// Statistical Distribution Types
// ---------------------------------------------------------------------------

/**
 * Represents a normal (Gaussian) distribution of values.
 * Used for modeling expected performance ranges by rating band.
 *
 * Example: A 1400-rated player might have:
 * - mean: 0.45 (45% top move rate)
 * - std: 0.07 (standard deviation of 7%)
 */
export interface Distribution {
  /** The average/expected value */
  mean: number;
  /** Standard deviation - measures spread of values around the mean */
  std: number;
}

/**
 * Rating buckets for expected performance lookup.
 * Each bucket has different expected accuracy and move quality metrics.
 */
export type RatingBucket =
  | '0-1000'
  | '1000-1200'
  | '1200-1400'
  | '1400-1600'
  | '1600-1800'
  | '1800-2000'
  | '2000-2200'
  | '2200+';

// ---------------------------------------------------------------------------
// Engine Correlation Analysis Types
// ---------------------------------------------------------------------------

/**
 * Complete analysis of how closely a player's moves match engine recommendations.
 * This is the core output of engine correlation analysis.
 */
export interface EngineCorrelationAnalysis {
  /** ID of the game being analyzed */
  gameId: string;

  /** How many moves matched the engine's #1 choice */
  topMoveMatches: number;

  /** Total moves in the game (excluding opening book) */
  totalMoves: number;

  /** Ratio of top move matches to total moves (0-1) */
  topMoveRate: number;

  /** How many moves were in engine's top 3 choices */
  top3Matches: number;

  /** Ratio of top 3 matches to total moves (0-1) */
  top3Rate: number;

  /** Average centipawn loss per move (lower = more accurate) */
  avgCentipawnLoss: number;

  /** Average centipawn loss on critical positions only */
  criticalMoveCPL: number;

  /**
   * Distribution of move ranks: [#1 count, #2 count, #3 count, #4 count, #5+ count]
   * Shows how often the player found the best vs. suboptimal moves.
   */
  moveRankDistribution: [number, number, number, number, number];

  /** Correlation broken down by game phase (moves 1-15) */
  openingCorrelation: number;

  /** Correlation in middlegame (moves 16-35) */
  middlegameCorrelation: number;

  /** Correlation in endgame (moves 36+) */
  endgameCorrelation: number;
}

/**
 * Expected performance metrics for a given rating band.
 * Based on statistical analysis of millions of games.
 */
export interface ExpectedPerformance {
  /** Player rating for this band */
  rating: number;

  /** Expected rate of finding the engine's #1 move */
  expectedTopMoveRate: Distribution;

  /** Expected rate of finding a top-3 engine move */
  expectedTop3Rate: Distribution;

  /** Expected average centipawn loss per move */
  expectedAvgCPL: Distribution;

  /** Expected CPL on critical positions (harder moves) */
  expectedCriticalCPL: Distribution;
}

/**
 * Result of comparing observed performance to expected performance.
 * High positive Z-scores indicate playing suspiciously well for rating.
 */
export interface PerformanceAnomalyResult {
  /** Probability score of cheating (0-1) */
  score: number;

  /** Z-score for top move rate (how many std devs above expected) */
  topMoveZ: number;

  /** Z-score for critical position CPL */
  criticalZ: number;

  /** Detailed breakdown of observed vs. expected values */
  details: {
    observedTopMoveRate: number;
    expectedTopMoveRate: number;
    observedCriticalCPL: number;
    expectedCriticalCPL: number;
  };
}

// ---------------------------------------------------------------------------
// Move Analysis Types
// ---------------------------------------------------------------------------

/**
 * Analysis data for a single move with anti-cheat metrics.
 */
export interface MoveAnalysisData {
  /** Index of this move in the game (0-indexed) */
  moveIndex: number;

  /** The move that was played (UCI format: "e2e4") */
  playedMove: string;

  /** Where this move ranked in engine's top moves (1 = best) */
  moveRank: number;

  /** Centipawn loss compared to the best move */
  centipawnLoss: number;

  /** Whether this was a critical position (big gap between best and second best) */
  isCritical: boolean;

  /** Game phase: 'opening' | 'middlegame' | 'endgame' */
  phase: GamePhase;

  /** Position complexity score (0-100, higher = more complex) */
  positionComplexity: number;

  /** Gap between best move and second best in centipawns */
  positionGap: number;

  /** Evaluation before the move (in centipawns) */
  evalBefore: number;

  /** Evaluation after the move (in centipawns) */
  evalAfter: number;
}

export type GamePhase = 'opening' | 'middlegame' | 'endgame';

/**
 * Classification of a move for selective engine use detection.
 */
export type MoveClass = 'engine_likely' | 'human_likely' | 'ambiguous';

/**
 * Move with classification data for pattern detection.
 */
export interface ClassifiedMove extends MoveAnalysisData {
  /** Classification of whether move appears engine-assisted or human */
  classification: MoveClass;
}

// ---------------------------------------------------------------------------
// Behavioral Analysis Types
// ---------------------------------------------------------------------------

/**
 * Timing profile for analyzing move timing patterns.
 */
export interface MoveTimingProfile {
  /** Time taken for this specific move in milliseconds */
  moveTimeMs: number;

  /** Position complexity score (0-100) */
  positionComplexity: number;

  /** Number of legal moves available in this position */
  legalMoveCount: number;

  /** Whether this was a "forced" move (only one good option) */
  isForcedMove: boolean;

  /** Time remaining on the player's clock in milliseconds */
  clockRemaining: number;

  /** Time control type */
  timeControl: TimeControlType;
}

export type TimeControlType = 'bullet' | 'blitz' | 'rapid' | 'classical';

/**
 * Result of timing anomaly analysis.
 */
export interface TimingAnomalyResult {
  /** Suspicion score (0-1, higher = more suspicious) */
  score: number;

  /** Reason for the anomaly, if detected */
  reason: string | null;

  /** Additional details about the timing pattern */
  details?: {
    expectedTime?: number;
    actualTime?: number;
    variance?: number;
  };
}

/**
 * Mouse movement pattern data for a single move.
 */
export interface MousePattern {
  /** Path of mouse positions from click to click */
  path: Point[];

  /** Velocity at each point (pixels per second) */
  velocities: number[];

  /** Acceleration at each point (pixels per second squared) */
  accelerations: number[];

  /** Points where the mouse paused or slowed significantly */
  hesitations: Array<{ position: Point; duration: number }>;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Result of mouse pattern analysis.
 */
export interface MouseAnomalyResult {
  /** Suspicion score (0-1, higher = more suspicious) */
  score: number;

  /** Reason for the anomaly, if detected */
  reason: string | null;

  /** How linear the mouse path was (0-1, 1 = perfectly straight = suspicious) */
  pathLinearity?: number;
}

// ---------------------------------------------------------------------------
// Player Behavior Profile Types
// ---------------------------------------------------------------------------

/**
 * Historical behavioral fingerprint for a player.
 * Built up over many games to establish a baseline.
 */
export interface PlayerBehaviorProfile {
  /** Unique player identifier */
  playerId: string;

  /** Number of games used to build this profile */
  gameCount: number;

  /** Average move time by position complexity bucket */
  avgMoveTimeByComplexity: Map<ComplexityBucket, Distribution>;

  /** Variance in move timing (low variance = suspicious consistency) */
  moveTimeVariance: number;

  /** Average curvature of mouse paths (0 = straight line, higher = more curved) */
  avgPathCurvature: number;

  /** Average number of micro-corrections in mouse movement */
  avgMicroCorrectionCount: number;

  /** Average number of times player unfocuses window per game */
  avgUnfocusPerGame: number;

  /** Distribution of unfocus durations */
  typicalUnfocusDuration: Distribution;

  /** Accuracy by time remaining (do they play worse in time pressure?) */
  accuracyByTimeRemaining: Map<TimeBucket, number>;

  /** Blunder rate by move number (fatigue detection) */
  blunderRateByMoveNumber: number[];

  /** Performance rating for each time control */
  performanceByTimeControl: Map<TimeControlType, number>;

  /** Last updated timestamp */
  lastUpdated: Date;
}

export type ComplexityBucket = 'low' | 'medium' | 'high' | 'very_high';
export type TimeBucket = 'plenty' | 'moderate' | 'low' | 'critical';

/**
 * Detected shift in player behavior compared to their baseline.
 */
export interface BehaviorShift {
  /** Type of behavioral change detected */
  type: 'timing' | 'accuracy' | 'mouse_pattern' | 'focus';

  /** Direction of the shift */
  direction: 'increase' | 'decrease' | 'more_linear' | 'less_linear';

  /** Magnitude of the shift (how significant the change is) */
  magnitude: number;
}

/**
 * Result of comparing current game behavior to historical baseline.
 */
export interface BehaviorShiftAnalysis {
  /** List of detected behavioral shifts */
  shifts: BehaviorShift[];

  /** Overall suspicion score from behavior shift (0-1) */
  overallShiftScore: number;

  /** Possible non-cheating explanations for the shifts */
  possibleExplanations: string[];
}

/**
 * Current game's behavioral data for comparison against profile.
 */
export interface GameBehaviorData {
  /** Average accuracy in this game */
  accuracy: number;

  /** Move times grouped by complexity */
  moveTimesByComplexity: Map<ComplexityBucket, number[]>;

  /** Average path curvature in this game */
  avgPathCurvature: number;

  /** Number of micro-corrections in this game */
  microCorrectionCount: number;

  /** Number of window unfocus events */
  unfocusCount: number;
}

// ---------------------------------------------------------------------------
// Skill Shift Detection Types
// ---------------------------------------------------------------------------

/**
 * Result of detecting mid-game skill shifts.
 * A sudden improvement mid-game could indicate engine was turned on.
 */
export interface SkillShiftResult {
  /** Whether a significant skill shift was detected */
  detected: boolean;

  /** Move number where the shift was detected */
  shiftAtMove: number | null;

  /** CPL before the shift point */
  cplBeforeShift: number;

  /** CPL after the shift point */
  cplAfterShift: number;

  /** Statistical significance of the shift (p-value) */
  significance: number;

  /** Confidence level in the detection (0-1) */
  confidence: number;
}

/**
 * Configuration for sliding window analysis.
 */
export interface SlidingWindowConfig {
  /** Size of the analysis window in moves */
  windowSize: number;

  /** How much the window moves between analyses */
  stepSize: number;

  /** Minimum CPL difference to consider a shift */
  minCplDifference: number;

  /** Minimum number of moves required for analysis */
  minMoves: number;
}

// ---------------------------------------------------------------------------
// Aggregate Suspicion Score Types
// ---------------------------------------------------------------------------

/**
 * Combined suspicion score from all analysis layers.
 */
export interface AggregatedSuspicionScore {
  /** Overall cheat probability (0-1) */
  overallScore: number;

  /** Contribution from engine correlation analysis */
  engineCorrelationScore: number;

  /** Contribution from timing analysis */
  timingScore: number;

  /** Contribution from mouse pattern analysis */
  mousePatternScore: number;

  /** Contribution from behavior shift detection */
  behaviorShiftScore: number;

  /** Contribution from skill shift detection */
  skillShiftScore: number;

  /** List of specific flags that contributed to the score */
  flags: SuspicionFlag[];

  /** Recommended action based on score */
  recommendedAction: RecommendedAction;
}

export interface SuspicionFlag {
  /** Type of suspicious behavior */
  type: string;

  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Description of what was detected */
  description: string;

  /** Move number(s) where this was detected */
  moveNumbers?: number[];
}

export type RecommendedAction =
  | 'none' // Normal play
  | 'monitor' // Increase monitoring
  | 'restrict_stakes' // Limit betting amounts
  | 'flag_for_review' // Queue for human review
  | 'suspend_pending_review'; // Immediate suspension

// ---------------------------------------------------------------------------
// Stockfish Integration Types (Placeholder)
// ---------------------------------------------------------------------------

/**
 * Interface for Stockfish engine integration.
 * This is a placeholder that will be implemented when we add
 * server-side Stockfish analysis.
 */
export interface StockfishAnalyzer {
  /**
   * Analyze a single position.
   * @param fen - Position in FEN notation
   * @param depth - Search depth (default: 20)
   * @returns Engine evaluation with best moves
   */
  analyzePosition(fen: string, depth?: number): Promise<StockfishEvaluation>;

  /**
   * Analyze multiple positions (batch analysis).
   * @param positions - Array of FEN strings
   * @param depth - Search depth for each position
   * @returns Array of evaluations
   */
  analyzeBatch(positions: string[], depth?: number): Promise<StockfishEvaluation[]>;

  /**
   * Check if the engine is ready to receive commands.
   */
  isReady(): Promise<boolean>;

  /**
   * Stop any ongoing analysis.
   */
  stop(): Promise<void>;
}

/**
 * Raw Stockfish evaluation output.
 */
export interface StockfishEvaluation {
  /** Position that was analyzed */
  fen: string;

  /** Best move in UCI format */
  bestMove: string;

  /** Score in centipawns (from side to move's perspective) */
  scoreCp: number;

  /** Mate in N moves (null if no forced mate) */
  scoreMate: number | null;

  /** Search depth reached */
  depth: number;

  /** Top N moves with their scores */
  moves: Array<{
    move: string;
    score: number;
    isTactical?: boolean;
  }>;

  /** Principal variation (best line of play) */
  pv: string[];

  /** Nodes searched */
  nodes?: number;

  /** Time spent in milliseconds */
  timeMs?: number;
}
