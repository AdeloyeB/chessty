/**
 * Behavioral Analysis Service
 * ============================
 *
 * This module analyzes player behavior patterns to detect anomalies that
 * might indicate cheating. While engine correlation looks at WHAT moves
 * are played, behavioral analysis looks at HOW they're played.
 *
 * BEHAVIORAL SIGNALS WE ANALYZE:
 * 1. Timing patterns - How long do they think? Is it consistent?
 * 2. Mouse movements - Are paths natural (curved) or robotic (linear)?
 * 3. Focus patterns - Do they alt-tab frequently? Refocus then instant move?
 * 4. Profile comparison - Is this game behavior different from their history?
 *
 * WHY BEHAVIOR MATTERS:
 * - A human using engine advice still has to input the move
 * - This creates detectable patterns: alt-tab to engine, copy move, play
 * - Even copy-pasting creates unnatural timing and mouse patterns
 * - Sudden improvement in behavior profile = potential account sharing
 *
 * PRIVACY CONSIDERATION:
 * We analyze patterns, not content. We don't record what other apps are
 * open, just window focus events and timing correlations.
 */

import type {
  MoveTimingProfile,
  TimingAnomalyResult,
  MousePattern,
  MouseAnomalyResult,
  Point,
  PlayerBehaviorProfile,
  BehaviorShiftAnalysis,
  BehaviorShift,
  GameBehaviorData,
  ComplexityBucket,
  Distribution,
  TimeControlType,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Expected thinking time multipliers by position complexity.
 * Complex positions should take longer to evaluate.
 *
 * These are relative multipliers - actual time depends on time control.
 */
const COMPLEXITY_TIME_MULTIPLIERS: Record<ComplexityBucket, number> = {
  low: 0.5, // Simple positions: quick moves
  medium: 1.0, // Average complexity: baseline time
  high: 1.5, // Complex positions: need more thought
  very_high: 2.0, // Very complex: significantly more thought
};

/**
 * Base expected thinking times by time control (in milliseconds).
 * These are calibrated from observed player behavior.
 */
const BASE_THINKING_TIME: Record<TimeControlType, number> = {
  bullet: 2000, // 2 seconds average in bullet
  blitz: 5000, // 5 seconds average in blitz
  rapid: 15000, // 15 seconds average in rapid
  classical: 60000, // 1 minute average in classical
};

// ---------------------------------------------------------------------------
// Timing Analysis
// ---------------------------------------------------------------------------

/**
 * Calculate expected thinking time for a move based on context.
 *
 * Factors considered:
 * - Time control (bullet vs. classical)
 * - Position complexity (simple vs. complex)
 * - Forced moves (only one good option)
 * - Time remaining (time pressure affects behavior)
 *
 * @param profile - Move timing context
 * @returns Expected thinking time in milliseconds
 */
function calculateExpectedTime(profile: MoveTimingProfile): number {
  const baseTime = BASE_THINKING_TIME[profile.timeControl];

  // Adjust for complexity
  const complexityBucket = getComplexityBucket(profile.positionComplexity);
  const complexityMultiplier = COMPLEXITY_TIME_MULTIPLIERS[complexityBucket];

  // Forced moves should be quick
  const forcedMoveMultiplier = profile.isForcedMove ? 0.3 : 1.0;

  // Time pressure affects thinking time
  const timePressureMultiplier = getTimePressureMultiplier(
    profile.clockRemaining,
    profile.timeControl
  );

  return baseTime * complexityMultiplier * forcedMoveMultiplier * timePressureMultiplier;
}

/**
 * Convert numeric complexity (0-100) to bucket.
 */
function getComplexityBucket(complexity: number): ComplexityBucket {
  if (complexity < 25) return 'low';
  if (complexity < 50) return 'medium';
  if (complexity < 75) return 'high';
  return 'very_high';
}

/**
 * Calculate time pressure effect on thinking time.
 *
 * Players in time trouble make moves faster (or should).
 * Playing slowly when in time trouble is actually normal (panic),
 * but playing FAST when you have lots of time is suspicious.
 *
 * @param clockRemaining - Time left in milliseconds
 * @param timeControl - Type of time control
 * @returns Multiplier for expected thinking time
 */
function getTimePressureMultiplier(
  clockRemaining: number,
  timeControl: TimeControlType
): number {
  // Define "low time" thresholds by time control
  const lowTimeThresholds: Record<TimeControlType, number> = {
    bullet: 10000, // 10 seconds
    blitz: 30000, // 30 seconds
    rapid: 60000, // 1 minute
    classical: 180000, // 3 minutes
  };

  const threshold = lowTimeThresholds[timeControl];

  if (clockRemaining < threshold) {
    // In time trouble - expect faster moves
    return 0.3 + (0.7 * clockRemaining) / threshold;
  }

  return 1.0;
}

/**
 * Analyze if a move's timing is anomalous.
 *
 * WHAT WE'RE LOOKING FOR:
 * - Suspiciously fast moves on complex positions
 * - Robotic consistency in timing (humans vary)
 * - Instant moves on non-obvious positions
 *
 * @param profile - Timing context for the move
 * @param historicalVariance - Player's historical timing variance (optional)
 * @returns Timing anomaly result with score and reason
 */
export function analyzeTimingAnomaly(
  profile: MoveTimingProfile,
  historicalVariance?: number
): TimingAnomalyResult {
  const expectedTime = calculateExpectedTime(profile);
  const actualTime = profile.moveTimeMs;

  // Check 1: Suspiciously fast on complex position
  // Playing the best move in 0.5 seconds on a position that should take 30 seconds
  if (profile.positionComplexity > 70 && actualTime < expectedTime * 0.3) {
    return {
      score: 0.7,
      reason: 'fast_complex_position',
      details: {
        expectedTime,
        actualTime,
      },
    };
  }

  // Check 2: Suspiciously consistent timing
  // Humans have variable thinking times; bots/engine-assisted play is consistent
  if (historicalVariance !== undefined && historicalVariance < 0.1) {
    return {
      score: 0.6,
      reason: 'robotic_consistency',
      details: {
        variance: historicalVariance,
      },
    };
  }

  // Check 3: Instant moves on non-obvious positions
  // A forced move can be instant. A complex position with many options shouldn't be.
  if (
    actualTime < 500 &&
    !profile.isForcedMove &&
    profile.legalMoveCount > 10
  ) {
    return {
      score: 0.5,
      reason: 'instant_non_forced',
      details: {
        expectedTime,
        actualTime,
      },
    };
  }

  // Check 4: Very slow on simple/forced position (could indicate looking up endgame tablebase)
  if (
    profile.isForcedMove &&
    actualTime > expectedTime * 3 &&
    profile.positionComplexity < 30
  ) {
    return {
      score: 0.3,
      reason: 'slow_on_forced_move',
      details: {
        expectedTime,
        actualTime,
      },
    };
  }

  // No anomaly detected
  return {
    score: 0,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Mouse Pattern Analysis
// ---------------------------------------------------------------------------

/**
 * Calculate the linearity of a mouse path.
 *
 * Linearity = how close to a straight line the path is.
 * - 1.0 = perfectly straight (suspicious - bots move in straight lines)
 * - 0.0 = completely curved (human micro-corrections and natural arcs)
 *
 * METHOD:
 * Compare total path length to direct distance (start to end).
 * Straight line: path length = direct distance (ratio = 1.0)
 * Curved path: path length > direct distance (ratio < 1.0)
 *
 * @param path - Array of points in the mouse path
 * @returns Linearity score from 0 to 1
 */
export function calculatePathLinearity(path: Point[]): number {
  if (path.length < 2) return 1.0; // Can't calculate with < 2 points

  // Calculate direct distance (start to end)
  const start = path[0];
  const end = path[path.length - 1];
  const directDistance = Math.sqrt(
    Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
  );

  if (directDistance === 0) return 1.0; // Didn't move

  // Calculate total path length
  let pathLength = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    pathLength += Math.sqrt(dx * dx + dy * dy);
  }

  // Linearity = direct / total (1.0 = straight line)
  return Math.min(directDistance / pathLength, 1.0);
}

/**
 * Check if a mouse path has natural acceleration curves.
 *
 * Human mouse movement follows a characteristic pattern:
 * - Start slow (acceleration from rest)
 * - Speed up in the middle
 * - Slow down at the end (deceleration to target)
 *
 * Bot/script movement often has:
 * - Constant velocity (no acceleration)
 * - Or artificial stepped acceleration
 *
 * @param accelerations - Array of acceleration values at each point
 * @returns true if the acceleration profile looks human
 */
export function checkAccelerationProfile(accelerations: number[]): boolean {
  if (accelerations.length < 5) return true; // Not enough data

  // Split into thirds: start, middle, end
  const thirdLength = Math.floor(accelerations.length / 3);
  const startAccel = accelerations.slice(0, thirdLength);
  const middleAccel = accelerations.slice(thirdLength, thirdLength * 2);
  const endAccel = accelerations.slice(thirdLength * 2);

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const _startAvg = mean(startAccel); // Used for future analysis patterns
  const middleAvg = mean(middleAccel);
  const endAvg = mean(endAccel);

  // Human pattern: start high (accelerating), middle moderate, end negative (decelerating)
  // We're looking for: start > middle AND end < middle (relatively)
  // Allow some tolerance for noisy data

  // Check for reasonable variation (constant = suspicious)
  const variance =
    accelerations.reduce((sum, a) => sum + Math.pow(a - mean(accelerations), 2), 0) /
    accelerations.length;

  // Very low variance = constant velocity = suspicious
  if (variance < 100) {
    return false;
  }

  // Check for deceleration at the end (most human-like indicator)
  return endAvg < middleAvg;
}

/**
 * Detect micro-corrections in a mouse path.
 *
 * Humans make small corrective movements when moving the mouse to a target:
 * - Overshoot then correct
 * - Wobble while moving
 * - Pause and adjust
 *
 * Scripts/bots typically move in smooth, efficient paths without these
 * natural human imperfections.
 *
 * @param path - Array of points in the mouse path
 * @returns true if micro-corrections are present
 */
export function detectMicroCorrections(path: Point[]): boolean {
  if (path.length < 10) return true; // Not enough data

  let correctionCount = 0;

  for (let i = 2; i < path.length; i++) {
    // Calculate direction change
    const prevDx = path[i - 1].x - path[i - 2].x;
    const prevDy = path[i - 1].y - path[i - 2].y;
    const currDx = path[i].x - path[i - 1].x;
    const currDy = path[i].y - path[i - 1].y;

    // Cross product gives direction change (sign flip = direction reversal)
    const cross = prevDx * currDy - prevDy * currDx;

    // Micro-correction = small direction change (not a major curve)
    const magnitude = Math.sqrt(currDx * currDx + currDy * currDy);
    if (magnitude > 0 && Math.abs(cross) / magnitude > 5) {
      correctionCount++;
    }
  }

  // Expect at least a few corrections in a natural path
  return correctionCount >= 2;
}

/**
 * Analyze a mouse pattern for suspicious behavior.
 *
 * WHAT WE'RE LOOKING FOR:
 * - Linear paths (bots move in straight lines)
 * - Unnatural acceleration (constant velocity or stepped)
 * - No micro-corrections (too perfect movement)
 *
 * @param pattern - Mouse movement pattern for a single move
 * @returns Analysis result with score and reason
 */
export function analyzeMousePattern(pattern: MousePattern): MouseAnomalyResult {
  // Check 1: Linear interpolation (bot-like)
  const linearity = calculatePathLinearity(pattern.path);
  if (linearity > 0.95) {
    return {
      score: 0.8,
      reason: 'linear_mouse_path',
      pathLinearity: linearity,
    };
  }

  // Check 2: Natural acceleration curve
  const hasNaturalCurve = checkAccelerationProfile(pattern.accelerations);
  if (!hasNaturalCurve) {
    return {
      score: 0.6,
      reason: 'unnatural_acceleration',
      pathLinearity: linearity,
    };
  }

  // Check 3: Micro-corrections (human fine-tuning)
  const hasMicroCorrections = detectMicroCorrections(pattern.path);
  if (!hasMicroCorrections && pattern.path.length > 50) {
    return {
      score: 0.4,
      reason: 'no_micro_corrections',
      pathLinearity: linearity,
    };
  }

  // Check 4: Suspiciously perfect hesitation pattern
  // Humans hesitate naturally; scripted hesitation looks artificial
  if (pattern.hesitations.length > 0) {
    const hesitationDurations = pattern.hesitations.map((h) => h.duration);
    const avgHesitation = hesitationDurations.reduce((a, b) => a + b, 0) / hesitationDurations.length;
    const variance =
      hesitationDurations.reduce((sum, d) => sum + Math.pow(d - avgHesitation, 2), 0) /
      hesitationDurations.length;

    // Perfectly consistent hesitations = suspicious
    if (variance < 100 && hesitationDurations.length > 3) {
      return {
        score: 0.5,
        reason: 'artificial_hesitation_pattern',
        pathLinearity: linearity,
      };
    }
  }

  // No anomaly detected
  return {
    score: 0,
    reason: null,
    pathLinearity: linearity,
  };
}

// ---------------------------------------------------------------------------
// Behavior Profile Comparison
// ---------------------------------------------------------------------------

/**
 * Compare statistical distributions to detect significant differences.
 *
 * Uses a simplified two-sample comparison to determine if
 * current behavior differs from historical baseline.
 *
 * @param historical - Player's historical distribution
 * @param current - Current game's values
 * @returns Object with significance level and effect size
 */
function compareDistributions(
  historical: Distribution,
  current: number[]
): { significanceLevel: number; effectSize: number; direction: 'increase' | 'decrease' } {
  if (current.length === 0) {
    return { significanceLevel: 1.0, effectSize: 0, direction: 'increase' };
  }

  const currentMean = current.reduce((a, b) => a + b, 0) / current.length;

  // Calculate effect size (Cohen's d approximation)
  const effectSize = (currentMean - historical.mean) / historical.std;

  // Simplified significance level (would use proper t-test in production)
  const absEffect = Math.abs(effectSize);
  let significanceLevel: number;
  if (absEffect > 3) {
    significanceLevel = 0.001; // Very significant
  } else if (absEffect > 2) {
    significanceLevel = 0.01;
  } else if (absEffect > 1) {
    significanceLevel = 0.05;
  } else {
    significanceLevel = 0.2; // Not significant
  }

  return {
    significanceLevel,
    effectSize: absEffect,
    direction: currentMean > historical.mean ? 'increase' : 'decrease',
  };
}

/**
 * Detect significant shifts in player behavior compared to their historical baseline.
 *
 * This function compares current game behavior to the player's established
 * profile. Sudden changes in behavior could indicate:
 * - Account sharing (different person playing)
 * - Starting to use engine assistance
 * - Playing under unusual conditions (sick, tired, etc.)
 *
 * We flag significant changes for review, understanding that there
 * can be innocent explanations.
 *
 * @param historical - Player's historical behavior profile
 * @param currentGame - Current game's behavior data
 * @returns Analysis of detected behavior shifts
 */
export function detectBehaviorShift(
  historical: PlayerBehaviorProfile,
  currentGame: GameBehaviorData
): BehaviorShiftAnalysis {
  const shifts: BehaviorShift[] = [];
  const possibleExplanations: string[] = [];

  // Compare timing patterns
  for (const [bucket, distribution] of historical.avgMoveTimeByComplexity.entries()) {
    const currentTimes = currentGame.moveTimesByComplexity.get(bucket) ?? [];
    if (currentTimes.length > 0) {
      const comparison = compareDistributions(distribution, currentTimes);
      if (comparison.significanceLevel < 0.01) {
        shifts.push({
          type: 'timing',
          direction: comparison.direction,
          magnitude: comparison.effectSize,
        });
      }
    }
  }

  // Compare accuracy (sudden improvement is suspicious)
  // Note: Would need historical accuracy in the profile
  const expectedAccuracy = getExpectedAccuracyForProfile(historical);
  const accuracyDiff = currentGame.accuracy - expectedAccuracy;
  if (accuracyDiff > 15) {
    // 15+ accuracy points above baseline
    shifts.push({
      type: 'accuracy',
      direction: 'increase',
      magnitude: accuracyDiff,
    });
    possibleExplanations.push('Playing in a familiar opening');
    possibleExplanations.push('Opponent making many mistakes');
  }

  // Compare mouse pattern (becoming more linear = suspicious)
  if (currentGame.avgPathCurvature < historical.avgPathCurvature * 0.5) {
    shifts.push({
      type: 'mouse_pattern',
      direction: 'more_linear',
      magnitude: (historical.avgPathCurvature - currentGame.avgPathCurvature) / historical.avgPathCurvature,
    });
    possibleExplanations.push('Using trackpad instead of mouse');
    possibleExplanations.push('Different monitor setup');
  }

  // Compare focus patterns (more unfocus = potential alt-tabbing to engine)
  if (currentGame.unfocusCount > historical.avgUnfocusPerGame * 2) {
    shifts.push({
      type: 'focus',
      direction: 'increase',
      magnitude: currentGame.unfocusCount / historical.avgUnfocusPerGame,
    });
    possibleExplanations.push('Multi-tasking during game');
    possibleExplanations.push('Checking messages/notifications');
  }

  // Calculate overall shift score
  const overallShiftScore = calculateOverallShiftScore(shifts);

  return {
    shifts,
    overallShiftScore,
    possibleExplanations,
  };
}

/**
 * Calculate expected accuracy from a player's profile.
 *
 * This is a simplified estimation based on performance metrics.
 *
 * @param profile - Player's behavior profile
 * @returns Expected accuracy percentage
 */
function getExpectedAccuracyForProfile(profile: PlayerBehaviorProfile): number {
  // Would be calculated from historical game data in production
  // Using a placeholder based on profile characteristics
  const blunderRate = profile.blunderRateByMoveNumber.length > 0
    ? profile.blunderRateByMoveNumber.reduce((a, b) => a + b, 0) / profile.blunderRateByMoveNumber.length
    : 0.05;

  // Lower blunder rate = higher accuracy
  return 100 - blunderRate * 100;
}

/**
 * Calculate overall suspicion score from behavior shifts.
 *
 * Different shifts have different weights:
 * - Accuracy shifts are most concerning
 * - Timing shifts are moderately concerning
 * - Mouse/focus shifts are less concerning alone
 *
 * @param shifts - Array of detected behavior shifts
 * @returns Overall suspicion score (0-1)
 */
function calculateOverallShiftScore(shifts: BehaviorShift[]): number {
  if (shifts.length === 0) return 0;

  const weights: Record<BehaviorShift['type'], number> = {
    accuracy: 0.4,
    timing: 0.3,
    mouse_pattern: 0.2,
    focus: 0.1,
  };

  let totalScore = 0;
  let totalWeight = 0;

  for (const shift of shifts) {
    const weight = weights[shift.type];
    // Normalize magnitude to 0-1 range (assuming magnitude is typically 0-5)
    const normalizedMagnitude = Math.min(shift.magnitude / 5, 1);
    totalScore += weight * normalizedMagnitude;
    totalWeight += weight;
  }

  return totalWeight > 0 ? totalScore / totalWeight : 0;
}

// ---------------------------------------------------------------------------
// Profile Building
// ---------------------------------------------------------------------------

/**
 * Build or update a player's behavior profile from game data.
 *
 * This function aggregates behavior data from multiple games to
 * establish a baseline for the player. The more games analyzed,
 * the more accurate the profile becomes.
 *
 * @param existingProfile - Player's existing profile (null if new player)
 * @param newGameData - Behavior data from a new game
 * @returns Updated behavior profile
 */
export function buildBehaviorProfile(
  existingProfile: PlayerBehaviorProfile | null,
  newGameData: GameBehaviorData & { playerId: string }
): PlayerBehaviorProfile {
  if (existingProfile === null) {
    // Create new profile from first game
    return createInitialProfile(newGameData);
  }

  // Update existing profile with new game data
  return updateProfile(existingProfile, newGameData);
}

/**
 * Create initial behavior profile from a single game.
 */
function createInitialProfile(
  gameData: GameBehaviorData & { playerId: string }
): PlayerBehaviorProfile {
  // Convert move times to distributions
  const avgMoveTimeByComplexity = new Map<ComplexityBucket, Distribution>();
  for (const [bucket, times] of gameData.moveTimesByComplexity.entries()) {
    if (times.length > 0) {
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      const variance = times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / times.length;
      avgMoveTimeByComplexity.set(bucket, {
        mean,
        std: Math.sqrt(variance),
      });
    }
  }

  return {
    playerId: gameData.playerId,
    gameCount: 1,
    avgMoveTimeByComplexity,
    moveTimeVariance: 0, // Will be calculated with more games
    avgPathCurvature: gameData.avgPathCurvature,
    avgMicroCorrectionCount: gameData.microCorrectionCount,
    avgUnfocusPerGame: gameData.unfocusCount,
    typicalUnfocusDuration: { mean: 0, std: 0 }, // Need per-unfocus data
    accuracyByTimeRemaining: new Map(),
    blunderRateByMoveNumber: [],
    performanceByTimeControl: new Map(),
    lastUpdated: new Date(),
  };
}

/**
 * Update existing profile with new game data.
 *
 * Uses exponential moving average to weight recent games more heavily
 * while maintaining historical baseline.
 */
function updateProfile(
  existing: PlayerBehaviorProfile,
  newGame: GameBehaviorData
): PlayerBehaviorProfile {
  const alpha = 0.2; // Weight for new data (20% new, 80% historical)
  const newCount = existing.gameCount + 1;

  // Update path curvature using EMA
  const newPathCurvature =
    alpha * newGame.avgPathCurvature + (1 - alpha) * existing.avgPathCurvature;

  // Update micro-correction count
  const newMicroCorrections =
    alpha * newGame.microCorrectionCount + (1 - alpha) * existing.avgMicroCorrectionCount;

  // Update unfocus count
  const newUnfocusAvg =
    alpha * newGame.unfocusCount + (1 - alpha) * existing.avgUnfocusPerGame;

  // Update move time distributions
  const updatedMoveTimeByComplexity = new Map(existing.avgMoveTimeByComplexity);
  for (const [bucket, times] of newGame.moveTimesByComplexity.entries()) {
    if (times.length > 0) {
      const newMean = times.reduce((a, b) => a + b, 0) / times.length;
      const existingDist = existing.avgMoveTimeByComplexity.get(bucket);

      if (existingDist) {
        updatedMoveTimeByComplexity.set(bucket, {
          mean: alpha * newMean + (1 - alpha) * existingDist.mean,
          std: existingDist.std, // Std dev update is more complex, keeping existing for now
        });
      } else {
        const variance = times.reduce((sum, t) => sum + Math.pow(t - newMean, 2), 0) / times.length;
        updatedMoveTimeByComplexity.set(bucket, {
          mean: newMean,
          std: Math.sqrt(variance),
        });
      }
    }
  }

  return {
    ...existing,
    gameCount: newCount,
    avgMoveTimeByComplexity: updatedMoveTimeByComplexity,
    avgPathCurvature: newPathCurvature,
    avgMicroCorrectionCount: newMicroCorrections,
    avgUnfocusPerGame: newUnfocusAvg,
    lastUpdated: new Date(),
  };
}
