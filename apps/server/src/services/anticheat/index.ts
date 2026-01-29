/**
 * Anti-Cheat Analysis Service
 * ============================
 *
 * This module provides server-side analysis for detecting cheating in chess games.
 * It's designed for a real-money betting platform where cheating directly harms
 * honest players financially.
 *
 * ARCHITECTURE OVERVIEW:
 *
 * The anti-cheat system uses multiple independent detection layers:
 *
 * 1. ENGINE ANALYSIS (engine-analysis.ts)
 *    - Compares player moves to Stockfish recommendations
 *    - Calculates centipawn loss, top move rates, etc.
 *    - Flags players performing suspiciously well for their rating
 *
 * 2. BEHAVIORAL ANALYSIS (behavior-analysis.ts)
 *    - Analyzes HOW moves are made (timing, mouse patterns, focus)
 *    - Builds player profiles over time
 *    - Detects shifts from established baseline behavior
 *
 * 3. SKILL SHIFT DETECTION (skill-shift.ts)
 *    - Detects sudden mid-game improvements
 *    - Uses sliding window CPL analysis
 *    - Flags games where engine was potentially turned on mid-game
 *
 * HOW TO USE THIS SERVICE:
 *
 * ```typescript
 * import * as anticheat from './services/anticheat';
 *
 * // Post-game analysis
 * const engineResult = await anticheat.analyzeEngineCorrelation(
 *   gameId, moves, fens, stockfish
 * );
 *
 * const anomalyResult = anticheat.calculatePerformanceAnomaly(
 *   engineResult, playerRating
 * );
 *
 * // Build player profile over time
 * const updatedProfile = anticheat.buildBehaviorProfile(
 *   existingProfile, newGameData
 * );
 *
 * // Detect mid-game skill shifts
 * const shiftResult = anticheat.detectSkillShift(moveAnalyses);
 * ```
 *
 * PHILOSOPHY:
 * - Defense in depth: Multiple independent layers
 * - Probabilistic scoring: Never binary cheater/not-cheater
 * - Human review: High-suspicion cases go to humans
 * - Privacy-conscious: Analyze patterns, not content
 *
 * See /docs/ANTI_CHEAT_PLAN.md for the full design document.
 */

// ---------------------------------------------------------------------------
// Type Exports
// ---------------------------------------------------------------------------

// Export all types from the types module
export type {
  // Statistical types
  Distribution,
  RatingBucket,

  // Engine analysis types
  EngineCorrelationAnalysis,
  ExpectedPerformance,
  PerformanceAnomalyResult,
  MoveAnalysisData,
  GamePhase,
  MoveClass,
  ClassifiedMove,

  // Behavioral analysis types
  MoveTimingProfile,
  TimingAnomalyResult,
  MousePattern,
  MouseAnomalyResult,
  Point,
  PlayerBehaviorProfile,
  BehaviorShift,
  BehaviorShiftAnalysis,
  GameBehaviorData,
  ComplexityBucket,
  TimeBucket,
  TimeControlType,

  // Skill shift types
  SkillShiftResult,
  SlidingWindowConfig,

  // Aggregate scoring types
  AggregatedSuspicionScore,
  SuspicionFlag,
  RecommendedAction,

  // Stockfish integration types
  StockfishAnalyzer,
  StockfishEvaluation,
} from './types';

// ---------------------------------------------------------------------------
// Engine Analysis Exports
// ---------------------------------------------------------------------------

export {
  // Performance expectations
  PERFORMANCE_BY_RATING,
  getRatingBucket,
  getExpectedPerformance,
  getGamePhase,

  // Critical position detection
  isCriticalPosition,
  calculatePositionComplexity,

  // Main analysis function
  analyzeEngineCorrelation,

  // Anomaly detection
  calculatePerformanceAnomaly,

  // Stockfish integration
  createStockfishAnalyzer,
  createStockfishAnalyzerSync,
  validateStockfishSetup,
  checkStockfishHealth,

  // Convenience functions for move analysis
  calculateCentipawnLossForMove,
  getMoveRankInEvaluation,
  isPositionCritical,
} from './engine-analysis';

// ---------------------------------------------------------------------------
// Behavioral Analysis Exports
// ---------------------------------------------------------------------------

export {
  // Timing analysis
  analyzeTimingAnomaly,

  // Mouse pattern analysis
  calculatePathLinearity,
  checkAccelerationProfile,
  detectMicroCorrections,
  analyzeMousePattern,

  // Behavior profile comparison
  detectBehaviorShift,

  // Profile building
  buildBehaviorProfile,
} from './behavior-analysis';

// ---------------------------------------------------------------------------
// Skill Shift Detection Exports
// ---------------------------------------------------------------------------

export {
  // Configuration
  DEFAULT_SLIDING_WINDOW_CONFIG,

  // Main analyzer class
  MidGameShiftAnalyzer,

  // Convenience functions
  detectSkillShift,
  isSkillShiftSuspicious,
  describeSkillShift,
} from './skill-shift';

// ---------------------------------------------------------------------------
// Real-Time Monitoring Exports
// ---------------------------------------------------------------------------

export {
  // Singleton instance
  liveGameMonitor,

  // Classes
  LiveGameMonitor,

  // Constants
  SUSPICION_THRESHOLDS,

  // Convenience functions
  startGameMonitoring,
  monitorMove,
  endGameMonitoring,
  getPlayerSuspicionScore,
  getPlayerFlags,
} from './realtime';

// Re-export types from realtime
export type {
  PlayerGameMonitorState,
  MoveBehaviorData,
  MoveAnalysisResult,
} from './realtime';

// ---------------------------------------------------------------------------
// Aggregate Analysis (TODO: Implement)
// ---------------------------------------------------------------------------

/**
 * Combine all analysis results into a single suspicion score.
 *
 * This function takes results from all analysis layers and produces
 * a unified score with recommended action.
 *
 * TODO: Implement this function with proper weight calibration
 * based on empirical data from confirmed cheat cases.
 *
 * @param engineResult - Result from engine correlation analysis
 * @param behaviorResult - Result from behavior shift detection
 * @param skillShiftResult - Result from skill shift detection
 * @param timingAnomalies - Array of timing anomaly results
 * @param mouseAnomalies - Array of mouse pattern anomaly results
 * @returns Aggregated suspicion score with recommended action
 */
export function aggregateSuspicionScore(
  engineScore: number,
  behaviorScore: number,
  skillShiftScore: number,
  timingScore: number,
  mouseScore: number
): import('./types').AggregatedSuspicionScore {
  // Weight each signal type
  // These weights should be calibrated from empirical data
  const weights = {
    engine: 0.35, // Engine correlation is strongest signal
    behavior: 0.20, // Behavior shift is moderate signal
    skillShift: 0.20, // Mid-game shift is strong when detected
    timing: 0.15, // Timing anomalies are supportive
    mouse: 0.10, // Mouse patterns are weakest (easy to spoof)
  };

  // Calculate weighted average
  const overallScore =
    engineScore * weights.engine +
    behaviorScore * weights.behavior +
    skillShiftScore * weights.skillShift +
    timingScore * weights.timing +
    mouseScore * weights.mouse;

  // Determine recommended action based on score
  let recommendedAction: import('./types').RecommendedAction;
  if (overallScore < 0.2) {
    recommendedAction = 'none';
  } else if (overallScore < 0.4) {
    recommendedAction = 'monitor';
  } else if (overallScore < 0.6) {
    recommendedAction = 'restrict_stakes';
  } else if (overallScore < 0.8) {
    recommendedAction = 'flag_for_review';
  } else {
    recommendedAction = 'suspend_pending_review';
  }

  // Build flags array
  const flags: import('./types').SuspicionFlag[] = [];

  if (engineScore > 0.5) {
    flags.push({
      type: 'engine_correlation',
      severity: engineScore > 0.8 ? 'critical' : engineScore > 0.6 ? 'high' : 'medium',
      description: 'Move accuracy significantly exceeds expected for rating',
    });
  }

  if (behaviorScore > 0.5) {
    flags.push({
      type: 'behavior_shift',
      severity: behaviorScore > 0.8 ? 'high' : 'medium',
      description: 'Current game behavior differs from historical baseline',
    });
  }

  if (skillShiftScore > 0.5) {
    flags.push({
      type: 'mid_game_skill_shift',
      severity: 'high',
      description: 'Sudden improvement in play quality detected mid-game',
    });
  }

  if (timingScore > 0.5) {
    flags.push({
      type: 'timing_anomaly',
      severity: 'medium',
      description: 'Move timing patterns are unusual',
    });
  }

  if (mouseScore > 0.5) {
    flags.push({
      type: 'mouse_pattern',
      severity: 'low',
      description: 'Mouse movement patterns appear non-human',
    });
  }

  return {
    overallScore,
    engineCorrelationScore: engineScore,
    timingScore,
    mousePatternScore: mouseScore,
    behaviorShiftScore: behaviorScore,
    skillShiftScore,
    flags,
    recommendedAction,
  };
}

// ---------------------------------------------------------------------------
// Service Initialization
// ---------------------------------------------------------------------------

import { shutdownStockfishPool } from '../stockfish';
import { validateStockfishSetup } from './engine-analysis';

// Track initialization state
let serviceInitialized = false;
let stockfishAvailable = false;

/**
 * Initialize the anti-cheat service.
 *
 * This should be called during server startup to:
 * - Validate Stockfish is available (if using engine analysis)
 * - Initialize the real-time monitoring system
 * - Load any ML models (future)
 * - Connect to any external services (future)
 *
 * @param options Configuration options
 * @param options.skipStockfish If true, skip Stockfish initialization (useful for testing)
 * @returns true if initialization succeeded
 */
export async function initializeAnticheatService(options?: {
  skipStockfish?: boolean;
}): Promise<boolean> {
  console.log('[AntiCheat] Initializing anti-cheat service...');

  // Initialize Stockfish unless skipped
  if (!options?.skipStockfish) {
    try {
      stockfishAvailable = await validateStockfishSetup();
      if (stockfishAvailable) {
        console.log('[AntiCheat] Stockfish engine initialized successfully');
      } else {
        console.warn('[AntiCheat] Stockfish unavailable - engine analysis disabled');
        console.warn('[AntiCheat] Set STOCKFISH_PATH environment variable or install Stockfish');
      }
    } catch (error) {
      console.error('[AntiCheat] Failed to initialize Stockfish:', error);
      stockfishAvailable = false;
    }
  } else {
    console.log('[AntiCheat] Stockfish initialization skipped');
  }

  serviceInitialized = true;
  console.log('[AntiCheat] Anti-cheat service initialized');
  return true;
}

/**
 * Shut down the anti-cheat service.
 *
 * This should be called during server shutdown to clean up resources.
 */
export async function shutdownAnticheatService(): Promise<void> {
  console.log('[AntiCheat] Shutting down anti-cheat service...');

  // Shut down Stockfish worker pool
  await shutdownStockfishPool();

  serviceInitialized = false;
  stockfishAvailable = false;

  console.log('[AntiCheat] Anti-cheat service shut down');
}

/**
 * Get the current status of the anti-cheat service.
 *
 * Useful for health checks and monitoring.
 */
export function getAnticheatServiceStatus(): {
  initialized: boolean;
  stockfishAvailable: boolean;
  analysisEnabled: boolean;
} {
  return {
    initialized: serviceInitialized,
    stockfishAvailable,
    analysisEnabled: serviceInitialized && stockfishAvailable,
  };
}

/**
 * Check if engine analysis is available.
 *
 * @returns true if Stockfish is initialized and can analyze positions
 */
export function isEngineAnalysisAvailable(): boolean {
  return serviceInitialized && stockfishAvailable;
}
