/**
 * Anti-Cheat Calibration Engine
 * =============================
 *
 * This module runs the calibration process to find optimal weights
 * and thresholds for the anti-cheat aggregation function.
 *
 * HOW IT WORKS:
 * 1. Take a dataset of labeled games (cheater vs clean)
 * 2. Analyze each game using our engine analysis
 * 3. Try different weight combinations
 * 4. Find the configuration that:
 *    - Catches the most cheaters (high true positive rate)
 *    - Minimizes false accusations (low false positive rate)
 *
 * The goal is to find weights where the score distributions for
 * cheaters and clean players are maximally separated.
 */

import type {
  CalibrationGame,
  CalibrationAnalysis,
  SignalWeights,
  ActionThresholds,
  CalibrationMetrics,
  CalibrationResult,
} from './types';

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

/**
 * Current (uncalibrated) weights - these are the guesses we want to improve
 */
export const CURRENT_WEIGHTS: SignalWeights = {
  engine: 0.35,
  behavior: 0.20,
  skillShift: 0.20,
  timing: 0.15,
  mouse: 0.10,
};

/**
 * Current (uncalibrated) thresholds
 */
export const CURRENT_THRESHOLDS: ActionThresholds = {
  monitor: 0.2,
  restrictStakes: 0.4,
  flagForReview: 0.6,
  suspend: 0.8,
};

// ---------------------------------------------------------------------------
// Analysis Functions
// ---------------------------------------------------------------------------

/**
 * Analyze a single game and compute signal scores
 *
 * This function computes each individual signal score for a game.
 * For Lichess games, we have:
 * - Engine correlation (from evaluations)
 * - Timing analysis (from clock data)
 * - Skill shift detection (from move quality over game)
 *
 * We DON'T have:
 * - Behavior baseline (no historical data)
 * - Mouse patterns (not available from Lichess)
 *
 * @param game - CalibrationGame to analyze
 * @returns Analysis result with scores
 */
export async function analyzeGame(
  game: CalibrationGame
): Promise<CalibrationAnalysis> {
  // Calculate engine correlation score
  const engineScore = calculateEngineScore(game);

  // Calculate timing score (if clock data available)
  const timingScore = game.clockTimes
    ? calculateTimingScore(game.clockTimes, game.moves.length)
    : 0;

  // Calculate skill shift (quality change over game)
  const skillShiftScore = game.evaluations
    ? calculateSkillShiftScore(game.evaluations, game.playerColor !== 'black')
    : 0;

  // Behavior score requires historical baseline - set to 0 for Lichess games
  const behaviorScore = 0;

  // Mouse score not available from Lichess
  const mouseScore = 0;

  // Calculate metrics for debugging/analysis
  const metrics = calculateMetrics(game);

  // Aggregate using current weights
  const aggregatedScore = aggregateScores(
    { engine: engineScore, behavior: behaviorScore, skillShift: skillShiftScore, timing: timingScore, mouse: mouseScore },
    CURRENT_WEIGHTS
  );

  return {
    gameId: game.gameId,
    isCheater: game.isCheater,
    playerRating: game.playerRating,
    timeControl: game.timeControl,
    scores: {
      engine: engineScore,
      behavior: behaviorScore,
      skillShift: skillShiftScore,
      timing: timingScore,
      mouse: mouseScore,
    },
    aggregatedScore,
    metrics,
  };
}

/**
 * Calculate engine correlation score from evaluations
 *
 * Higher scores indicate moves that match engine recommendations closely.
 *
 * IMPORTANT: We analyze only the target player's moves (every other ply).
 * Evaluations are from White's perspective, so:
 * - For White (even indices): position should improve (delta > 0 is good)
 * - For Black (odd indices): position should worsen for White (delta < 0 is good)
 *
 * CPL = centipawn loss = how much the position worsened from the player's perspective
 * We only count LOSSES (when the signed delta shows the position got worse for the player)
 */
function calculateEngineScore(game: CalibrationGame): number {
  if (!game.evaluations || game.evaluations.length < 5) {
    return 0;
  }

  // Determine which color the player is (from playerColor field or default to white)
  // Player's moves are at even indices (0, 2, 4...) for white, odd (1, 3, 5...) for black
  const isPlayerWhite = game.playerColor !== 'black';

  // Calculate centipawn loss for each of the PLAYER'S moves only
  // The evaluation at index i is AFTER move i was played
  // So for move i, the loss is eval[i] - eval[i-1]
  const cpLosses: number[] = [];

  for (let i = 1; i < game.evaluations.length; i++) {
    // Determine who made the move that led to evaluation[i]
    // Move 1 (index 1) is after White's first move, move 2 (index 2) is after Black's first move, etc.
    // So odd indices are after White moves, even indices are after Black moves
    const wasWhiteMove = i % 2 === 1;
    const wasPlayerMove = wasWhiteMove === isPlayerWhite;

    if (!wasPlayerMove) {
      continue; // Skip opponent's moves
    }

    const prevEval = game.evaluations[i - 1];
    const currEval = game.evaluations[i];

    // Compute SIGNED delta from the player's perspective
    // Evaluations are from White's perspective (positive = White is better)
    // For White: improvement = currEval > prevEval (delta > 0)
    // For Black: improvement = currEval < prevEval (delta < 0, because Black benefits when White's eval drops)
    let signedDelta: number;
    if (isPlayerWhite) {
      signedDelta = currEval - prevEval; // Positive = White improved
    } else {
      signedDelta = prevEval - currEval; // Positive = Black improved (White's position got worse)
    }

    // CPL is only counted when the position WORSENED (signedDelta < 0)
    // If the position improved or stayed the same, CPL = 0
    const cpLoss = signedDelta < 0 ? Math.abs(signedDelta) : 0;
    cpLosses.push(Math.min(cpLoss, 500)); // Cap at 500 to avoid outliers
  }

  if (cpLosses.length === 0) {
    return 0;
  }

  // Calculate average CPL
  const avgCPL = cpLosses.reduce((a, b) => a + b, 0) / cpLosses.length;

  // Get expected CPL for this rating
  const expectedCPL = getExpectedCPL(game.playerRating);

  // Convert to a 0-1 score
  // If avgCPL is much lower than expected, score is high (suspicious)
  // Formula: score = 1 - (avgCPL / expectedCPL), clamped to [0, 1]
  if (avgCPL >= expectedCPL) {
    return 0; // Playing at or below expected level
  }

  // How much better than expected? Score 0-1
  const improvementRatio = (expectedCPL - avgCPL) / expectedCPL;
  return Math.min(improvementRatio, 1);
}

/**
 * Calculate timing anomaly score from clock data
 *
 * Looks for suspicious patterns like:
 * - Consistently fast moves on complex positions
 * - Very low variance in thinking time
 * - Rapid-fire moves in critical positions
 */
function calculateTimingScore(clockTimes: number[], _moveCount: number): number {
  if (clockTimes.length < 5) {
    return 0;
  }

  // Calculate time used per move
  const timesUsed: number[] = [];
  for (let i = 1; i < clockTimes.length; i++) {
    const timeUsed = clockTimes[i - 1] - clockTimes[i];
    if (timeUsed > 0) {
      timesUsed.push(timeUsed);
    }
  }

  if (timesUsed.length < 5) {
    return 0;
  }

  // Calculate variance coefficient (std / mean)
  const mean = timesUsed.reduce((a, b) => a + b, 0) / timesUsed.length;
  const variance = timesUsed.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / timesUsed.length;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0;

  // Humans typically have CV > 0.5 (high variance in thinking time)
  // Engines/cheaters often have CV < 0.3 (consistent timing)
  if (cv >= 0.5) {
    return 0; // Normal human variance
  }

  // Suspicious low variance - score 0-1
  return Math.min((0.5 - cv) / 0.5, 1);
}

/**
 * Calculate skill shift score (improvement during game)
 *
 * Looks for suspicious mid-game improvement, like:
 * - Playing poorly at start, then suddenly playing perfectly
 * - CPL drops significantly partway through
 *
 * NOTE: This function analyzes both players' moves since we're looking at
 * overall game quality shift, not individual player CPL. The assumption is
 * that if a cheater starts using an engine mid-game, the overall position
 * quality will improve (fewer fluctuations, more consistent evaluations).
 *
 * @param evaluations - Full evaluation array
 * @param isPlayerWhite - Whether the player being analyzed is White (default: true)
 */
function calculateSkillShiftScore(evaluations: number[], isPlayerWhite: boolean = true): number {
  if (evaluations.length < 20) {
    return 0;
  }

  // Compare first half vs second half quality
  const midpoint = Math.floor(evaluations.length / 2);

  // Calculate CPL for each half, for the specific player only
  const firstHalfCPL = calculateHalfCPL(evaluations.slice(0, midpoint), 0, isPlayerWhite);
  const secondHalfCPL = calculateHalfCPL(evaluations.slice(midpoint), midpoint, isPlayerWhite);

  // Significant improvement in second half is suspicious
  if (secondHalfCPL >= firstHalfCPL) {
    return 0; // No improvement or got worse
  }

  // Guard against division by zero
  if (firstHalfCPL === 0) {
    return 0;
  }

  // How much did they improve?
  const improvementRatio = (firstHalfCPL - secondHalfCPL) / firstHalfCPL;

  // >30% improvement is very suspicious
  if (improvementRatio < 0.15) {
    return 0;
  }

  return Math.min((improvementRatio - 0.15) / 0.35, 1);
}

/**
 * Helper to calculate CPL for a portion of the game
 *
 * Uses SIGNED deltas to properly compute centipawn loss:
 * - Only counts moves where the position WORSENED for the player
 * - Filters to only the target player's moves (every other ply)
 *
 * @param evals - Array of evaluations (from White's perspective)
 * @param startIndex - The starting index in the full game (to determine ply parity)
 * @param isPlayerWhite - Whether the player being analyzed is White
 */
function calculateHalfCPL(evals: number[], startIndex: number = 0, isPlayerWhite: boolean = true): number {
  if (evals.length < 2) return 100;

  let totalLoss = 0;
  let moveCount = 0;

  for (let i = 1; i < evals.length; i++) {
    // Calculate the global index to determine who made this move
    const globalIndex = startIndex + i;

    // Odd global indices are after White moves, even are after Black moves
    const wasWhiteMove = globalIndex % 2 === 1;
    const wasPlayerMove = wasWhiteMove === isPlayerWhite;

    if (!wasPlayerMove) {
      continue; // Skip opponent's moves
    }

    const prevEval = evals[i - 1];
    const currEval = evals[i];

    // Compute SIGNED delta from the player's perspective
    let signedDelta: number;
    if (isPlayerWhite) {
      signedDelta = currEval - prevEval; // Positive = White improved
    } else {
      signedDelta = prevEval - currEval; // Positive = Black improved
    }

    // CPL is only counted when the position WORSENED (signedDelta < 0)
    if (signedDelta < 0) {
      totalLoss += Math.abs(signedDelta);
    }
    moveCount++;
  }

  if (moveCount === 0) {
    return 100; // Default high CPL if no moves to analyze
  }

  return totalLoss / moveCount;
}

/**
 * Get expected CPL for a given rating
 */
function getExpectedCPL(rating: number): number {
  // These values match PERFORMANCE_BY_RATING in engine-analysis.ts
  if (rating < 1000) return 100;
  if (rating < 1200) return 85;
  if (rating < 1400) return 65;
  if (rating < 1600) return 50;
  if (rating < 1800) return 40;
  if (rating < 2000) return 32;
  if (rating < 2200) return 25;
  return 20;
}

/**
 * Calculate additional metrics for analysis
 */
function calculateMetrics(game: CalibrationGame): CalibrationAnalysis['metrics'] {
  const isPlayerWhite = game.playerColor !== 'black';
  const avgCPL = game.evaluations
    ? calculateHalfCPL(game.evaluations, 0, isPlayerWhite)
    : 0;

  return {
    topMoveRate: 0, // Would need best move data to calculate
    avgCPL,
    criticalCPL: 0, // Would need position complexity data
    moveCount: game.moves.length,
  };
}

// ---------------------------------------------------------------------------
// Aggregation Functions
// ---------------------------------------------------------------------------

/**
 * Aggregate individual scores using weights
 */
export function aggregateScores(
  scores: SignalWeights,
  weights: SignalWeights
): number {
  return (
    scores.engine * weights.engine +
    scores.behavior * weights.behavior +
    scores.skillShift * weights.skillShift +
    scores.timing * weights.timing +
    scores.mouse * weights.mouse
  );
}

/**
 * Recalculate aggregated scores with new weights
 */
export function recalculateWithWeights(
  analyses: CalibrationAnalysis[],
  weights: SignalWeights
): CalibrationAnalysis[] {
  return analyses.map(analysis => ({
    ...analysis,
    aggregatedScore: aggregateScores(analysis.scores, weights),
  }));
}

// ---------------------------------------------------------------------------
// Calibration Metrics
// ---------------------------------------------------------------------------

/**
 * Calculate classification metrics at a given threshold
 *
 * @param analyses - Analyzed games with scores
 * @param threshold - Score threshold for flagging
 * @returns Metrics object
 */
export function calculateMetricsAtThreshold(
  analyses: CalibrationAnalysis[],
  threshold: number
): CalibrationMetrics {
  const cheaterGames = analyses.filter(a => a.isCheater);
  const cleanGames = analyses.filter(a => !a.isCheater);

  // True positives: cheaters flagged
  const truePositives = cheaterGames.filter(a => a.aggregatedScore >= threshold).length;

  // False positives: clean players flagged
  const falsePositives = cleanGames.filter(a => a.aggregatedScore >= threshold).length;

  // True negatives: clean players not flagged (for reference, not used in current metrics)
  const _trueNegatives = cleanGames.filter(a => a.aggregatedScore < threshold).length;

  // False negatives: cheaters not flagged (for reference, not used in current metrics)
  const _falseNegatives = cheaterGames.filter(a => a.aggregatedScore < threshold).length;

  // Calculate rates
  const truePositiveRate = cheaterGames.length > 0
    ? truePositives / cheaterGames.length
    : 0;

  const falsePositiveRate = cleanGames.length > 0
    ? falsePositives / cleanGames.length
    : 0;

  const precision = (truePositives + falsePositives) > 0
    ? truePositives / (truePositives + falsePositives)
    : 0;

  const recall = truePositiveRate;

  const f1Score = (precision + recall) > 0
    ? 2 * (precision * recall) / (precision + recall)
    : 0;

  return {
    truePositiveRate,
    falsePositiveRate,
    precision,
    f1Score,
    auc: 0, // Would need full ROC curve
    optimalThreshold: threshold,
  };
}

/**
 * Find the optimal threshold for a given false positive rate tolerance
 *
 * @param analyses - Analyzed games
 * @param targetFPR - Maximum acceptable false positive rate (e.g., 0.01 for 1%)
 * @returns Optimal threshold and metrics
 *
 * EDGE CASE FIX: We include a threshold strictly greater than the maximum score
 * to ensure we can always achieve FPR = 0 (by rejecting all samples).
 * This prevents the function from returning a default that violates targetFPR.
 */
export function findOptimalThreshold(
  analyses: CalibrationAnalysis[],
  targetFPR: number
): { threshold: number; metrics: CalibrationMetrics } {
  // Get all unique scores and find the maximum
  const allScores = analyses.map(a => a.aggregatedScore);
  const maxScore = allScores.length > 0 ? Math.max(...allScores) : 0;

  // Sort by score descending and include a threshold above max to guarantee FPR=0 is achievable
  // Adding a small epsilon above maxScore ensures we have a threshold that rejects ALL samples
  const sortedScores = [
    maxScore + 0.001, // Threshold above max score → FPR = 0, TPR = 0
    ...new Set(allScores),
  ].sort((a, b) => b - a);

  // Start with the highest threshold (above max score) to guarantee FPR = 0
  let bestThreshold = sortedScores[0];
  let bestMetrics = calculateMetricsAtThreshold(analyses, bestThreshold);

  for (const threshold of sortedScores) {
    const metrics = calculateMetricsAtThreshold(analyses, threshold);

    if (metrics.falsePositiveRate <= targetFPR) {
      if (metrics.truePositiveRate > bestMetrics.truePositiveRate) {
        bestThreshold = threshold;
        bestMetrics = metrics;
      }
    }
  }

  return { threshold: bestThreshold, metrics: { ...bestMetrics, optimalThreshold: bestThreshold } };
}

// ---------------------------------------------------------------------------
// Weight Optimization
// ---------------------------------------------------------------------------

/**
 * Grid search for optimal weights
 *
 * This function tries different weight combinations and finds the one
 * that maximizes the F1 score while keeping false positive rate low.
 *
 * @param analyses - Base analyses with individual scores
 * @param targetFPR - Maximum acceptable false positive rate
 * @returns Best weights found
 */
export function optimizeWeights(
  analyses: CalibrationAnalysis[],
  targetFPR: number = 0.05
): { weights: SignalWeights; metrics: CalibrationMetrics } {
  let bestWeights = { ...CURRENT_WEIGHTS };
  let bestF1 = 0;
  let bestMetrics = calculateMetricsAtThreshold(analyses, 0.5);

  // Grid search over weight space
  // Note: For Lichess data, behavior and mouse are always 0,
  // so we focus on engine, timing, and skillShift
  const weightSteps = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];

  for (const engineWeight of weightSteps) {
    for (const timingWeight of weightSteps) {
      for (const skillShiftWeight of weightSteps) {
        // Weights should sum to ~1 (within reason)
        const total = engineWeight + timingWeight + skillShiftWeight;
        if (total < 0.5 || total > 1.5) continue;

        const weights: SignalWeights = {
          engine: engineWeight,
          behavior: 0, // No behavior data from Lichess
          skillShift: skillShiftWeight,
          timing: timingWeight,
          mouse: 0, // No mouse data from Lichess
        };

        // Recalculate scores with these weights
        const recalculated = recalculateWithWeights(analyses, weights);

        // Find optimal threshold for this weight combination
        const { threshold, metrics } = findOptimalThreshold(recalculated, targetFPR);

        // Check if this is better
        if (metrics.f1Score > bestF1) {
          bestF1 = metrics.f1Score;
          bestWeights = weights;
          bestMetrics = { ...metrics, optimalThreshold: threshold };
        }
      }
    }
  }

  return { weights: bestWeights, metrics: bestMetrics };
}

// ---------------------------------------------------------------------------
// Full Calibration
// ---------------------------------------------------------------------------

/**
 * Run full calibration process
 *
 * @param games - Labeled calibration games
 * @returns Complete calibration result
 */
export async function runCalibration(
  games: CalibrationGame[]
): Promise<CalibrationResult> {
  console.log(`[Calibration] Starting calibration with ${games.length} games...`);

  // Step 1: Analyze all games
  console.log('[Calibration] Analyzing games...');
  const analyses: CalibrationAnalysis[] = [];

  for (const game of games) {
    const analysis = await analyzeGame(game);
    analyses.push(analysis);
  }

  // Step 2: Calculate dataset statistics
  const cheaterGames = analyses.filter(a => a.isCheater);
  const cleanGames = analyses.filter(a => !a.isCheater);

  console.log(`[Calibration] Analyzed ${cheaterGames.length} cheater games, ${cleanGames.length} clean games`);

  // Step 3: Optimize weights for different FPR targets
  console.log('[Calibration] Optimizing weights at 1% FPR...');
  const opt1pct = optimizeWeights(analyses, 0.01);

  console.log('[Calibration] Optimizing weights at 5% FPR...');
  const opt5pct = optimizeWeights(analyses, 0.05);

  console.log('[Calibration] Optimizing weights at 10% FPR...');
  const opt10pct = optimizeWeights(analyses, 0.10);

  // Step 4: Build rating distribution
  const ratingDistribution: Record<string, number> = {};
  for (const a of analyses) {
    const bucket = getRatingBucket(a.playerRating);
    ratingDistribution[bucket] = (ratingDistribution[bucket] || 0) + 1;
  }

  // Step 5: Build time control distribution
  const timeControlDistribution: Record<string, number> = {};
  for (const a of analyses) {
    timeControlDistribution[a.timeControl] = (timeControlDistribution[a.timeControl] || 0) + 1;
  }

  // Step 6: Determine final weights (use 5% FPR as default)
  const result: CalibrationResult = {
    optimizedWeights: opt5pct.weights,
    optimizedThresholds: {
      monitor: opt10pct.metrics.optimalThreshold,
      restrictStakes: opt5pct.metrics.optimalThreshold,
      flagForReview: opt1pct.metrics.optimalThreshold,
      suspend: Math.min(opt1pct.metrics.optimalThreshold + 0.1, 0.95),
    },
    metrics: {
      at1PercentFPR: opt1pct.metrics,
      at5PercentFPR: opt5pct.metrics,
      at10PercentFPR: opt10pct.metrics,
    },
    datasetStats: {
      totalGames: analyses.length,
      cheaterGames: cheaterGames.length,
      cleanGames: cleanGames.length,
      ratingDistribution,
      timeControlDistribution,
    },
    calibratedAt: new Date().toISOString(),
    version: '1.0.0',
  };

  console.log('[Calibration] Complete!');
  console.log(`[Calibration] Optimized weights: engine=${opt5pct.weights.engine}, timing=${opt5pct.weights.timing}, skillShift=${opt5pct.weights.skillShift}`);
  console.log(`[Calibration] At 5% FPR: TPR=${(opt5pct.metrics.truePositiveRate * 100).toFixed(1)}%, F1=${opt5pct.metrics.f1Score.toFixed(3)}`);

  return result;
}

/**
 * Get rating bucket string for a rating
 */
function getRatingBucket(rating: number): string {
  if (rating < 1000) return '0-1000';
  if (rating < 1200) return '1000-1200';
  if (rating < 1400) return '1200-1400';
  if (rating < 1600) return '1400-1600';
  if (rating < 1800) return '1600-1800';
  if (rating < 2000) return '1800-2000';
  if (rating < 2200) return '2000-2200';
  return '2200+';
}
