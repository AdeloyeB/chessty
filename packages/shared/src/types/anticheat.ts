import { z } from 'zod';

// ============================================================================
// ANTI-CHEAT SYSTEM TYPES
// ============================================================================
//
// These types support the multi-layered anti-cheat system for detecting
// engine-assisted play, behavioral anomalies, and other cheating methods.
//
// WHAT THESE TYPES ARE FOR:
// - MoveAnalysis: Per-move data for statistical engine detection
// - EngineCorrelationAnalysis: Game-level metrics for detecting engine use
// - BehaviorData: Real-time behavioral tracking (focus, timing, input)
// - NetworkSummary: Privacy-preserving network activity metrics
// - InputValidation: Physics-based input verification
// - CheatFlag: Suspicion flags raised by various detection layers
// - PlayerBehaviorProfile: Historical baseline for behavior comparison
// - MidGameSkillShift: Detection of sudden skill changes mid-game
//
// ============================================================================

// ---------------------------------------------------------------------------
// Game Phase
// ---------------------------------------------------------------------------

/**
 * Phase of the chess game, used to analyze performance by game stage.
 * Engine users often show different patterns in different phases.
 */
export const GamePhaseSchema = z.enum(['opening', 'middlegame', 'endgame']);
export type GamePhase = z.infer<typeof GamePhaseSchema>;

// ---------------------------------------------------------------------------
// Move Analysis (Per-Move Engine Detection Data)
// ---------------------------------------------------------------------------

/**
 * Analysis data for a single move, used for engine correlation detection.
 *
 * WHY THIS MATTERS:
 * By comparing each played move to what the engine recommends, we can
 * detect patterns that suggest engine assistance. A single match means
 * nothing, but consistently finding top engine moves is suspicious.
 */
export const MoveAnalysisSchema = z.object({
  /** Index of this move in the game (0-indexed) */
  moveIndex: z.number().int().min(0),

  /** The move that was actually played (in UCI format, e.g., "e2e4") */
  playedMove: z.string(),

  /**
   * Where this move ranked in the engine's recommendations.
   * 1 = engine's top choice, 2 = second best, etc.
   * 99 = not in the engine's top moves list
   */
  moveRank: z.number().int().min(1).max(99),

  /**
   * How much evaluation was lost compared to the best move.
   * Measured in centipawns (100 centipawns = 1 pawn).
   * 0 = played the best move, 100 = lost about a pawn of advantage.
   */
  centipawnLoss: z.number().min(0),

  /**
   * Whether this was a "critical" position where finding the best
   * move required deep calculation (not obvious at a glance).
   * Critical moves are weighted more heavily in cheat detection.
   */
  isCritical: z.boolean(),

  /** Which phase of the game this move occurred in */
  phase: GamePhaseSchema,

  /**
   * Engine evaluation BEFORE this move was played.
   * Positive = white is better, negative = black is better.
   * Measured in centipawns (100 = 1 pawn advantage).
   */
  evalBefore: z.number(),

  /**
   * Engine evaluation AFTER this move was played.
   * Comparing evalBefore vs evalAfter shows move quality.
   */
  evalAfter: z.number(),
});

export type MoveAnalysis = z.infer<typeof MoveAnalysisSchema>;

// ---------------------------------------------------------------------------
// Engine Correlation Analysis (Game-Level Statistics)
// ---------------------------------------------------------------------------

/**
 * Aggregated statistics for an entire game, comparing player moves to engine.
 *
 * WHY THIS MATTERS:
 * This is the core of statistical cheat detection. We compare these metrics
 * against expected values for the player's rating level. Humans at 1500 ELO
 * have very different patterns than humans at 2200 ELO or engines at 3500.
 */
export const EngineCorrelationAnalysisSchema = z.object({
  /** ID of the analyzed game */
  gameId: z.string(),

  /** ID of the player being analyzed */
  playerId: z.string(),

  /**
   * Rate of moves that matched the engine's #1 choice.
   * Value between 0 and 1 (e.g., 0.65 = 65% top move rate).
   * Higher than expected for rating = suspicious.
   */
  topMoveRate: z.number().min(0).max(1),

  /**
   * Rate of moves that were in the engine's top 3 choices.
   * Smart cheaters sometimes pick #2 or #3 to appear more human.
   */
  top3Rate: z.number().min(0).max(1),

  /**
   * Average centipawn loss per move across the game.
   * Lower values indicate stronger/more accurate play.
   * Typical values: 1500 ELO ~50-80 CPL, 2000 ELO ~30-40 CPL.
   */
  avgCentipawnLoss: z.number().min(0),

  /**
   * Average CPL on critical moves specifically.
   * Cheaters often show much lower critical CPL than their rating predicts.
   */
  criticalMoveCPL: z.number().min(0),

  /**
   * Distribution of where player's moves ranked: [#1, #2, #3, #4, #5+]
   * Example: [12, 5, 3, 2, 8] means 12 top moves, 5 second-best, etc.
   */
  moveRankDistribution: z.array(z.number().int().min(0)).length(5),

  /** Engine correlation rate during opening phase (moves 1-15) */
  openingCorrelation: z.number().min(0).max(1),

  /** Engine correlation rate during middlegame (moves 16-35) */
  middlegameCorrelation: z.number().min(0).max(1),

  /** Engine correlation rate during endgame (moves 36+) */
  endgameCorrelation: z.number().min(0).max(1),
});

export type EngineCorrelationAnalysis = z.infer<typeof EngineCorrelationAnalysisSchema>;

// ---------------------------------------------------------------------------
// Behavior Data (Real-Time Behavioral Tracking)
// ---------------------------------------------------------------------------

/**
 * Behavioral data captured for each move, used for anomaly detection.
 *
 * WHY THIS MATTERS:
 * Humans exhibit predictable patterns that are hard to fake:
 * - Thinking time varies with position complexity
 * - Mouse movements are curved, not linear
 * - Focus shifts naturally, not in suspicious patterns
 *
 * This data helps detect:
 * - Alt-tabbing to an engine (focusLost before best moves)
 * - Remote assistance (screen sharing + instant moves)
 * - Automated input injection (too-linear mouse paths)
 */
export const BehaviorDataSchema = z.object({
  /** Time spent on this move in milliseconds */
  moveTimeMs: z.number().int().min(0),

  /**
   * Whether the app window lost focus during thinking time.
   * Suspicious pattern: unfocus -> refocus -> instant best move
   */
  focusLost: z.boolean(),

  /**
   * Measure of how straight vs curved the mouse path was.
   * Value 0-1 where 1.0 = perfectly straight line (bot-like).
   * Humans typically have values < 0.9 due to natural curvature.
   */
  mouseLinearity: z.number().min(0).max(1),

  /**
   * The actual mouse/input path taken to make this move.
   * Array of {x, y, timestamp} points capturing the movement.
   * Used for physics validation and synthetic input detection.
   */
  inputPath: z.array(z.object({
    x: z.number(),
    y: z.number(),
    timestamp: z.number().int().min(0),
    /** Pressure value for touch devices (0-1, optional) */
    pressure: z.number().min(0).max(1).optional(),
  })),
});

export type BehaviorData = z.infer<typeof BehaviorDataSchema>;

// ---------------------------------------------------------------------------
// Network Summary (Privacy-Preserving Network Activity Metrics)
// ---------------------------------------------------------------------------

/**
 * Summary of network activity during a game, for detecting external engine APIs.
 *
 * WHY THIS MATTERS:
 * A player might have a browser tab sending positions to an analysis API.
 * We don't inspect packet contents (privacy), but we track patterns:
 * - Requests to known chess analysis domains
 * - Request timing correlated with move timing
 *
 * PRIVACY NOTE: We only collect domain counts and timestamps, never
 * request contents, authentication tokens, or personal data.
 */
export const NetworkSummarySchema = z.object({
  /** Total HTTP/WebSocket requests during the game */
  totalRequests: z.number().int().min(0),

  /** Number of requests to suspicious domains (chess engines, analysis APIs) */
  suspiciousRequestCount: z.number().int().min(0),

  /**
   * Timestamps of requests to suspicious domains.
   * Used to correlate with move timing (request 5 seconds before move = suspicious).
   */
  suspiciousRequestTimestamps: z.array(z.number().int().min(0)),
});

export type NetworkSummary = z.infer<typeof NetworkSummarySchema>;

// ---------------------------------------------------------------------------
// Input Validation (Physics-Based Input Verification)
// ---------------------------------------------------------------------------

/**
 * Types of physics violations in input data.
 * These indicate potentially synthetic or manipulated input.
 */
export const PhysicsViolationTypeSchema = z.enum([
  /** Mouse moved faster than humanly possible (~15,000 px/sec max) */
  'impossible_speed',
  /** Large instant position jump (teleportation) */
  'teleportation',
  /** Timestamps went backwards (impossible in real input) */
  'negative_time',
  /** Acceleration exceeded human limits (~50,000 px/sec^2) */
  'impossible_acceleration',
]);

export type PhysicsViolationType = z.infer<typeof PhysicsViolationTypeSchema>;

/**
 * A specific physics violation detected in input data.
 */
export const PhysicsViolationSchema = z.object({
  type: PhysicsViolationTypeSchema,
  details: z.string(),
  severity: z.enum(['warning', 'critical']),
});

export type PhysicsViolation = z.infer<typeof PhysicsViolationSchema>;

/**
 * Result of validating a move's input data for physical plausibility.
 *
 * WHY THIS MATTERS:
 * Automated tools can inject moves, but may generate impossible physics:
 * - Mouse moving faster than humanly possible
 * - Perfectly timed intervals (no OS scheduler jitter)
 * - Sub-pixel coordinates (real mice report integers)
 * - Paths that are too smooth (no micro-tremors)
 */
export const InputValidationSchema = z.object({
  /** Whether the input data is physically possible for a human */
  physicsValid: z.boolean(),

  /** List of specific physics violations found */
  physicsViolations: z.array(PhysicsViolationSchema),

  /**
   * Likelihood that input was synthetically generated (0-1).
   * Based on: timestamp regularity, sub-pixel precision, path smoothness.
   * Values > 0.6 are highly suspicious.
   */
  syntheticScore: z.number().min(0).max(1),
});

export type InputValidation = z.infer<typeof InputValidationSchema>;

// ---------------------------------------------------------------------------
// Cheat Flag (Suspicion Flags from Detection Layers)
// ---------------------------------------------------------------------------

/**
 * Categories of cheat flags, organized by detection layer.
 */
export const CheatFlagTypeSchema = z.enum([
  // Layer 1: Client Integrity
  'chess_engine_detected',
  'screen_sharing_active',
  'mobile_mirroring_detected',
  'automation_tool_detected',
  'ocr_tool_detected',
  'debugger_present',
  'tampered_binary',

  // Layer 2: Behavioral Analysis
  'unfocus_then_best_move',
  'robotic_timing_consistency',
  'linear_mouse_path',
  'unnatural_acceleration',
  'instant_move_after_refocus',
  'behavior_shift_detected',

  // Layer 3: Statistical Engine Detection
  'high_engine_correlation',
  'abnormal_critical_move_accuracy',
  'selective_engine_use',
  'consistent_engine_signature',
  'performance_above_rating',

  // Layer 4: Network Analysis
  'chess_api_request_detected',
  'request_move_correlation',
  'suspicious_websocket_activity',

  // Layer 5: Input Validation
  'synthetic_input_detected',
  'physics_violation',
  'move_without_input',
  'input_started_before_turn',

  // Layer 6: Economic / Account
  'new_account_profit',
  'unusual_win_rate',
  'sandbagging_detected',
  'multi_account_detected',
  'collusion_suspected',

  // Layer 7: Mid-Game Analysis
  'mid_game_skill_shift',
  'improvement_when_losing',
  'sudden_perfect_play',
]);

export type CheatFlagType = z.infer<typeof CheatFlagTypeSchema>;

/**
 * Severity levels for cheat flags.
 *
 * WHAT THEY MEAN:
 * - low: Noted but doesn't affect trust score much (e.g., withdrawing full balance)
 * - medium: Contributes to suspicion, warrants monitoring
 * - high: Significant concern, triggers enhanced monitoring
 * - critical: Strong evidence of cheating, may trigger intervention
 */
export const CheatFlagSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type CheatFlagSeverity = z.infer<typeof CheatFlagSeveritySchema>;

/**
 * A suspicion flag raised by the anti-cheat system.
 *
 * WHY THIS MATTERS:
 * Flags are the output of detection layers. No single flag proves cheating,
 * but accumulated flags from multiple layers build a suspicion score.
 * Flags are reviewed by humans before any action is taken.
 */
export const CheatFlagSchema = z.object({
  /** What type of suspicious activity was detected */
  type: CheatFlagTypeSchema,

  /** How serious is this flag */
  severity: CheatFlagSeveritySchema,

  /**
   * Contribution to overall suspicion score (0-100).
   * Combined across all flags to determine action thresholds.
   */
  score: z.number().min(0).max(100),

  /** Human-readable description of what was detected */
  details: z.string(),

  /** Which game this flag relates to (if applicable) */
  gameId: z.string().optional(),

  /** Which player this flag is for */
  playerId: z.string(),

  /** When this flag was raised */
  timestamp: z.number().int().min(0),

  /** Move number where this was detected (if applicable) */
  moveNumber: z.number().int().min(0).optional(),

  /** Additional context data for human review */
  metadata: z.record(z.unknown()).optional(),
});

export type CheatFlag = z.infer<typeof CheatFlagSchema>;

// ---------------------------------------------------------------------------
// Player Behavior Profile (Historical Baseline)
// ---------------------------------------------------------------------------

/**
 * Statistical distribution with mean and standard deviation.
 * Used for comparing current behavior to historical baseline.
 */
export const DistributionSchema = z.object({
  mean: z.number(),
  std: z.number().min(0),
});

export type Distribution = z.infer<typeof DistributionSchema>;

/**
 * Buckets for categorizing position complexity.
 * Used to compare timing by how complex the position is.
 */
export const ComplexityBucketSchema = z.enum(['simple', 'moderate', 'complex', 'critical']);
export type ComplexityBucket = z.infer<typeof ComplexityBucketSchema>;

/**
 * Buckets for remaining time on clock.
 * Performance often changes in time pressure.
 */
export const TimeBucketSchema = z.enum(['plenty', 'normal', 'low', 'critical']);
export type TimeBucket = z.infer<typeof TimeBucketSchema>;

/**
 * Historical behavior profile for a player, built over many games.
 *
 * WHY THIS MATTERS:
 * Everyone has a "fingerprint" - their typical timing, mouse patterns,
 * focus habits, and performance curves. When behavior suddenly changes
 * (different account? cheating?), we detect it by comparing to baseline.
 *
 * HOW IT'S USED:
 * 1. After each game, we update the player's profile with new data
 * 2. During games, we compare current behavior to historical baseline
 * 3. Significant deviations raise flags for investigation
 */
export const PlayerBehaviorProfileSchema = z.object({
  /** Player this profile belongs to */
  playerId: z.string(),

  /**
   * Average move time by position complexity.
   * Key = complexity bucket, Value = distribution of move times.
   * Humans take longer on complex positions; consistent timing = suspicious.
   */
  avgMoveTimeByComplexity: z.record(ComplexityBucketSchema, DistributionSchema),

  /**
   * How much the player's timing varies game-to-game.
   * Low variance (robotic consistency) is suspicious.
   */
  moveTimeVariance: z.number().min(0),

  /**
   * Typical curvature of mouse paths (0 = very curved, 1 = straight).
   * Most humans are 0.3-0.8. Values close to 1.0 suggest automation.
   */
  avgPathCurvature: z.number().min(0).max(1),

  /** Average number of micro-corrections per move */
  avgMicroCorrectionCount: z.number().min(0),

  /** Average number of times the window loses focus per game */
  avgUnfocusPerGame: z.number().min(0),

  /** Typical duration of unfocus events */
  typicalUnfocusDuration: DistributionSchema,

  /**
   * Accuracy (0-100) by time remaining bucket.
   * Most players get worse under time pressure.
   */
  accuracyByTimeRemaining: z.record(TimeBucketSchema, z.number().min(0).max(100)),

  /**
   * Blunder rate by move number (index = move, value = blunder rate).
   * Most players make more blunders late in games (fatigue).
   */
  blunderRateByFatigue: z.array(z.number().min(0).max(1)),

  /** Number of games used to build this profile */
  gamesAnalyzed: z.number().int().min(0),

  /** When this profile was last updated */
  lastUpdated: z.number().int().min(0),
});

export type PlayerBehaviorProfile = z.infer<typeof PlayerBehaviorProfileSchema>;

// ---------------------------------------------------------------------------
// Mid-Game Skill Shift Detection
// ---------------------------------------------------------------------------

/**
 * Detected skill shift point within a game.
 *
 * WHY THIS MATTERS:
 * A common cheating pattern: struggle for 20 moves, then suddenly play
 * perfect chess. This detects the moment where play quality dramatically
 * changes, along with any coincident events (unfocus, network request, etc.).
 */
export const MidGameSkillShiftSchema = z.object({
  /** The game where this shift was detected */
  gameId: z.string(),

  /** Player whose skill appeared to shift */
  playerId: z.string(),

  /** Move number where the shift became apparent */
  moveIndex: z.number().int().min(0),

  /**
   * Average CPL in the window BEFORE the shift.
   * Higher = weaker play.
   */
  beforeWindowAvgCPL: z.number().min(0),

  /**
   * Average CPL in the window AFTER the shift.
   * Much lower = suddenly much stronger play.
   */
  afterWindowAvgCPL: z.number().min(0),

  /**
   * How much the play improved (before - after).
   * Values > 30 CPL improvement are flagged as significant.
   */
  shiftMagnitude: z.number(),

  /**
   * Events that coincided with the skill shift.
   * These provide context for human reviewers.
   * Examples: 'focus_lost_before_improvement', 'network_activity_before_improvement'
   */
  coincidentEvents: z.array(z.string()),

  /** When this shift was detected */
  detectedAt: z.number().int().min(0),
});

export type MidGameSkillShift = z.infer<typeof MidGameSkillShiftSchema>;

// ---------------------------------------------------------------------------
// Suspicion Score Summary
// ---------------------------------------------------------------------------

/**
 * Overall suspicion summary for a player in a game or across games.
 * Used to determine what action to take (monitor, restrict, suspend).
 */
export const SuspicionSummarySchema = z.object({
  playerId: z.string(),
  gameId: z.string().optional(),

  /**
   * Overall suspicion score (0-100).
   * Thresholds:
   * - 0-20: Normal play, no action
   * - 20-50: Monitor closely
   * - 50-80: Restrict high-stakes games
   * - 80-95: Suspend betting privileges
   * - 95+: Account suspension pending appeal
   */
  overallScore: z.number().min(0).max(100),

  /** All flags contributing to this score */
  flags: z.array(CheatFlagSchema),

  /** Engine correlation analysis (if available) */
  engineAnalysis: EngineCorrelationAnalysisSchema.optional(),

  /** Behavior profile comparison (if available) */
  behaviorDeviation: z.object({
    timingDeviation: z.number(),
    accuracyDeviation: z.number(),
    patternDeviation: z.number(),
  }).optional(),

  /** Mid-game skill shifts detected (if any) */
  skillShifts: z.array(MidGameSkillShiftSchema),

  /** Recommended action based on score and flags */
  recommendedAction: z.enum([
    'none',
    'monitor',
    'restrict_stakes',
    'suspend_betting',
    'suspend_account',
    'human_review',
  ]),

  /** When this summary was generated */
  generatedAt: z.number().int().min(0),
});

export type SuspicionSummary = z.infer<typeof SuspicionSummarySchema>;

// ---------------------------------------------------------------------------
// Anti-Cheat Event Types (for real-time monitoring)
// ---------------------------------------------------------------------------

/**
 * Real-time anti-cheat event sent during games.
 * Used for live monitoring of high-stakes games.
 */
export const AntiCheatEventSchema = z.object({
  type: z.enum(['flag_raised', 'score_updated', 'intervention_triggered', 'shift_detected']),
  gameId: z.string(),
  playerId: z.string(),
  timestamp: z.number().int().min(0),
  data: z.union([
    CheatFlagSchema,
    z.object({ newScore: z.number().min(0).max(100), previousScore: z.number().min(0).max(100) }),
    z.object({ intervention: z.string(), reason: z.string() }),
    MidGameSkillShiftSchema,
  ]),
});

export type AntiCheatEvent = z.infer<typeof AntiCheatEventSchema>;
