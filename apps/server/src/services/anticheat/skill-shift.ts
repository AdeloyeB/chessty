/**
 * Mid-Game Skill Shift Detection
 * ================================
 *
 * This module detects sudden improvements in play quality during a game.
 * A player who struggles in the opening but suddenly plays perfectly in
 * the middlegame might have turned on engine assistance mid-game.
 *
 * HOW IT WORKS:
 * We use a sliding window analysis to compare CPL (centipawn loss) between
 * different segments of the game. A statistically significant drop in CPL
 * (meaning improved play) mid-game is flagged as suspicious.
 *
 * WHY THIS MATTERS:
 * - Using engine from the start is somewhat easier to detect
 * - Smart cheaters might start clean then switch on engine when needed
 * - This pattern is very hard to explain away legitimately
 *
 * LIMITATIONS:
 * - Natural improvement during a game is possible (getting "in the zone")
 * - Opening theory can cause high CPL early (playing main lines but not best)
 * - Opponent mistakes can make later moves "easier" to find
 *
 * We account for these by requiring statistically significant shifts and
 * cross-referencing with other anti-cheat signals.
 */

import type {
  SkillShiftResult,
  SlidingWindowConfig,
  MoveAnalysisData,
} from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Default configuration for sliding window analysis.
 *
 * windowSize: How many moves to include in each analysis window
 * stepSize: How far to move the window between analyses
 * minCplDifference: Minimum CPL drop to consider a shift
 * minMoves: Minimum moves required before analysis is meaningful
 */
export const DEFAULT_SLIDING_WINDOW_CONFIG: SlidingWindowConfig = {
  windowSize: 10, // Analyze 10 moves at a time
  stepSize: 5, // Move window by 5 moves each step
  minCplDifference: 30, // Must improve by at least 30 CPL
  minMoves: 20, // Need at least 20 moves for meaningful analysis
};

// ---------------------------------------------------------------------------
// Mid-Game Shift Analyzer Class
// ---------------------------------------------------------------------------

/**
 * Analyzer for detecting mid-game skill shifts.
 *
 * This class maintains state for ongoing analysis and provides methods
 * for both post-game deep analysis and real-time detection during play.
 *
 * USAGE:
 * ```typescript
 * const analyzer = new MidGameShiftAnalyzer();
 *
 * // For post-game analysis (all moves at once):
 * const result = analyzer.detectSkillShift(allMoveAnalyses);
 *
 * // For real-time analysis (move by move):
 * analyzer.addMove(moveAnalysis);
 * const currentResult = analyzer.checkForMidGameShift();
 * ```
 */
export class MidGameShiftAnalyzer {
  private config: SlidingWindowConfig;
  private moveAnalyses: MoveAnalysisData[] = [];

  /**
   * Create a new mid-game shift analyzer.
   *
   * @param config - Custom configuration (optional, uses defaults)
   */
  constructor(config: Partial<SlidingWindowConfig> = {}) {
    this.config = {
      ...DEFAULT_SLIDING_WINDOW_CONFIG,
      ...config,
    };
  }

  /**
   * Reset the analyzer state.
   * Call this when starting analysis of a new game.
   */
  reset(): void {
    this.moveAnalyses = [];
  }

  /**
   * Add a move analysis for real-time detection.
   *
   * @param move - Analysis data for a single move
   */
  addMove(move: MoveAnalysisData): void {
    this.moveAnalyses.push(move);
  }

  /**
   * Get the current number of analyzed moves.
   */
  getMoveCount(): number {
    return this.moveAnalyses.length;
  }

  /**
   * Detect skill shifts in a completed game.
   *
   * This is the main analysis function for post-game analysis.
   * It examines the full game to find statistically significant
   * improvements in play quality.
   *
   * @param moves - All move analyses for the game
   * @returns Skill shift detection result
   */
  detectSkillShift(moves: MoveAnalysisData[]): SkillShiftResult {
    // Need minimum number of moves for meaningful analysis
    if (moves.length < this.config.minMoves) {
      return this.createNoShiftResult();
    }

    // Calculate CPL for sliding windows
    const windows = this.calculateWindowCPLs(moves);

    // Find the point of maximum improvement
    const shiftPoint = this.findMaxImprovement(windows);

    if (shiftPoint === null) {
      return this.createNoShiftResult();
    }

    // Calculate statistical significance
    const significance = this.calculateSignificance(moves, shiftPoint.moveNumber);

    // Determine if the shift is significant enough to flag
    const isSignificant =
      shiftPoint.improvement >= this.config.minCplDifference && significance < 0.05;

    return {
      detected: isSignificant,
      shiftAtMove: isSignificant ? shiftPoint.moveNumber : null,
      cplBeforeShift: shiftPoint.cplBefore,
      cplAfterShift: shiftPoint.cplAfter,
      significance,
      confidence: isSignificant ? this.calculateConfidence(shiftPoint.improvement, significance) : 0,
    };
  }

  /**
   * Real-time check for mid-game shift during an ongoing game.
   *
   * This is called after each move to detect shifts as they happen.
   * Less accurate than post-game analysis but enables live flagging.
   *
   * @returns Current skill shift result (may be incomplete)
   */
  checkForMidGameShift(): SkillShiftResult {
    // Need minimum moves for analysis
    if (this.moveAnalyses.length < this.config.minMoves) {
      return this.createNoShiftResult();
    }

    // Use stored moves for analysis
    return this.detectSkillShift(this.moveAnalyses);
  }

  // ---------------------------------------------------------------------------
  // Private Helper Methods
  // ---------------------------------------------------------------------------

  /**
   * Calculate average CPL for each sliding window position.
   */
  private calculateWindowCPLs(moves: MoveAnalysisData[]): WindowCPL[] {
    const windows: WindowCPL[] = [];
    const { windowSize, stepSize } = this.config;

    for (let start = 0; start <= moves.length - windowSize; start += stepSize) {
      const windowMoves = moves.slice(start, start + windowSize);
      const avgCPL = this.calculateAverageCPL(windowMoves);

      windows.push({
        startMove: start,
        endMove: start + windowSize - 1,
        avgCPL,
      });
    }

    return windows;
  }

  /**
   * Calculate average centipawn loss for a set of moves.
   */
  private calculateAverageCPL(moves: MoveAnalysisData[]): number {
    if (moves.length === 0) return 0;

    const totalCPL = moves.reduce((sum, m) => sum + m.centipawnLoss, 0);
    return totalCPL / moves.length;
  }

  /**
   * Find the point of maximum CPL improvement in the game.
   *
   * We're looking for a transition where:
   * - Earlier windows have higher CPL (worse play)
   * - Later windows have lower CPL (better play)
   * - The transition is sharp (not gradual improvement)
   */
  private findMaxImprovement(
    windows: WindowCPL[]
  ): ShiftPoint | null {
    if (windows.length < 3) return null;

    let maxImprovement = 0;
    let bestShiftPoint: ShiftPoint | null = null;

    // For each potential shift point, compare average CPL before vs after
    for (let i = 1; i < windows.length - 1; i++) {
      // Average CPL before this point
      const beforeWindows = windows.slice(0, i);
      const beforeCPL = beforeWindows.reduce((sum, w) => sum + w.avgCPL, 0) / beforeWindows.length;

      // Average CPL after this point
      const afterWindows = windows.slice(i);
      const afterCPL = afterWindows.reduce((sum, w) => sum + w.avgCPL, 0) / afterWindows.length;

      // Improvement = decrease in CPL (positive value = got better)
      const improvement = beforeCPL - afterCPL;

      if (improvement > maxImprovement) {
        maxImprovement = improvement;
        bestShiftPoint = {
          moveNumber: windows[i].startMove,
          cplBefore: beforeCPL,
          cplAfter: afterCPL,
          improvement,
        };
      }
    }

    return bestShiftPoint;
  }

  /**
   * Calculate statistical significance of the detected shift.
   *
   * Uses a simplified t-test approach to determine if the difference
   * between before/after CPL is statistically significant.
   *
   * @param moves - All move analyses
   * @param shiftMove - The detected shift point
   * @returns p-value (lower = more significant)
   */
  private calculateSignificance(
    moves: MoveAnalysisData[],
    shiftMove: number
  ): number {
    const beforeMoves = moves.slice(0, shiftMove);
    const afterMoves = moves.slice(shiftMove);

    if (beforeMoves.length < 5 || afterMoves.length < 5) {
      return 1.0; // Not enough data
    }

    // Calculate means
    const beforeMean = this.calculateAverageCPL(beforeMoves);
    const afterMean = this.calculateAverageCPL(afterMoves);

    // Calculate standard deviations
    const beforeStd = this.calculateStdDev(beforeMoves.map((m) => m.centipawnLoss));
    const afterStd = this.calculateStdDev(afterMoves.map((m) => m.centipawnLoss));

    // Pooled standard error
    const pooledSE = Math.sqrt(
      (beforeStd * beforeStd) / beforeMoves.length +
        (afterStd * afterStd) / afterMoves.length
    );

    if (pooledSE === 0) return 1.0;

    // t-statistic
    const t = (beforeMean - afterMean) / pooledSE;

    // Simplified p-value estimation from t-statistic
    // (Would use proper t-distribution in production)
    return this.tToPValue(Math.abs(t), Math.min(beforeMoves.length, afterMoves.length) - 1);
  }

  /**
   * Calculate standard deviation of an array of numbers.
   */
  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * Convert t-statistic to approximate p-value.
   *
   * This is a simplified approximation. In production, you'd use
   * a proper statistical library for the t-distribution CDF.
   */
  private tToPValue(t: number, df: number): number {
    // Simplified approximation based on common critical values
    // df is degrees of freedom (n-1 for each sample)
    if (df < 5) df = 5; // Minimum for stability

    // Approximate critical values (two-tailed)
    // t > 2.0 roughly corresponds to p < 0.05 for reasonable df
    // t > 2.7 roughly corresponds to p < 0.01
    // t > 3.5 roughly corresponds to p < 0.001

    if (t > 4.0) return 0.0001;
    if (t > 3.5) return 0.001;
    if (t > 3.0) return 0.005;
    if (t > 2.7) return 0.01;
    if (t > 2.4) return 0.02;
    if (t > 2.0) return 0.05;
    if (t > 1.7) return 0.1;
    if (t > 1.3) return 0.2;
    return 0.5; // Not significant
  }

  /**
   * Calculate confidence level in the detection.
   *
   * Combines the magnitude of improvement with statistical significance.
   */
  private calculateConfidence(improvement: number, pValue: number): number {
    // Higher improvement = more confident
    const improvementScore = Math.min(improvement / 50, 1); // 50 CPL = max score

    // Lower p-value = more confident
    const significanceScore = 1 - Math.min(pValue * 10, 1); // p=0.05 -> 0.5, p=0.01 -> 0.9

    // Combined confidence
    return (improvementScore + significanceScore) / 2;
  }

  /**
   * Create a result indicating no shift was detected.
   */
  private createNoShiftResult(): SkillShiftResult {
    return {
      detected: false,
      shiftAtMove: null,
      cplBeforeShift: 0,
      cplAfterShift: 0,
      significance: 1.0,
      confidence: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Supporting Types (internal to this module)
// ---------------------------------------------------------------------------

/**
 * CPL data for a single sliding window.
 */
interface WindowCPL {
  startMove: number;
  endMove: number;
  avgCPL: number;
}

/**
 * Information about a detected shift point.
 */
interface ShiftPoint {
  moveNumber: number;
  cplBefore: number;
  cplAfter: number;
  improvement: number;
}

// ---------------------------------------------------------------------------
// Convenience Functions
// ---------------------------------------------------------------------------

/**
 * Quick check for skill shift in a completed game.
 *
 * This is a convenience function for one-off analysis without
 * creating an analyzer instance.
 *
 * @param moves - All move analyses for the game
 * @param config - Optional custom configuration
 * @returns Skill shift detection result
 */
export function detectSkillShift(
  moves: MoveAnalysisData[],
  config?: Partial<SlidingWindowConfig>
): SkillShiftResult {
  const analyzer = new MidGameShiftAnalyzer(config);
  return analyzer.detectSkillShift(moves);
}

/**
 * Check if a game's skill shift result indicates likely cheating.
 *
 * This is a helper function that interprets the skill shift result
 * in the context of anti-cheat decisions.
 *
 * @param result - Skill shift detection result
 * @returns true if the shift strongly suggests cheating
 */
export function isSkillShiftSuspicious(result: SkillShiftResult): boolean {
  return (
    result.detected &&
    result.confidence > 0.6 && // High confidence in the detection
    result.cplAfterShift < 25 && // Playing very accurately after shift
    result.cplBeforeShift - result.cplAfterShift > 40 // Large improvement
  );
}

/**
 * Get a human-readable description of a skill shift result.
 *
 * Useful for displaying to human reviewers in the anti-cheat pipeline.
 *
 * @param result - Skill shift detection result
 * @returns Description string
 */
export function describeSkillShift(result: SkillShiftResult): string {
  if (!result.detected) {
    return 'No significant mid-game skill shift detected.';
  }

  const improvement = result.cplBeforeShift - result.cplAfterShift;
  const confidenceLevel =
    result.confidence > 0.8 ? 'high' : result.confidence > 0.5 ? 'moderate' : 'low';

  return (
    `Skill shift detected at move ${result.shiftAtMove}. ` +
    `CPL dropped from ${result.cplBeforeShift.toFixed(1)} to ${result.cplAfterShift.toFixed(1)} ` +
    `(improvement of ${improvement.toFixed(1)} centipawns). ` +
    `Confidence: ${confidenceLevel} (${(result.confidence * 100).toFixed(0)}%). ` +
    `Statistical significance: p=${result.significance.toFixed(4)}.`
  );
}
