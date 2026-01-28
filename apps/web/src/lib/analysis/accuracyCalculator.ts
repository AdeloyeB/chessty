/**
 * Accuracy Calculator
 * ===================
 *
 * Calculates player accuracy based on engine analysis.
 *
 * WHAT IS ACCURACY?
 * Accuracy measures how closely a player's moves matched the engine's
 * recommendations. It's shown as a percentage:
 * - 90%+ = exceptional play (near engine level)
 * - 80-90% = very strong play
 * - 70-80% = good play
 * - 60-70% = average play
 * - <60% = room for improvement
 *
 * HOW IT'S CALCULATED:
 * There are different formulas used by chess sites. This implementation
 * uses a method similar to Chess.com's, based on "centipawn loss" - how
 * much evaluation was lost on each move compared to the best move.
 *
 * The basic idea:
 * 1. For each move, calculate how many centipawns were "lost" vs the best move
 * 2. Convert centipawn loss to an accuracy percentage using a formula
 * 3. Average all move accuracies for the overall accuracy
 */

import type { AnalyzedMove } from '@chess-game/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccuracyResult {
  /** White's accuracy (0-100) */
  white: number;

  /** Black's accuracy (0-100) */
  black: number;

  /** Individual move accuracies for white */
  whiteMoveAccuracies: number[];

  /** Individual move accuracies for black */
  blackMoveAccuracies: number[];

  /** Average centipawn loss per move for white */
  whiteAvgCpLoss: number;

  /** Average centipawn loss per move for black */
  blackAvgCpLoss: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Scaling factor for the accuracy formula.
 *
 * Higher values make the accuracy drop faster with centipawn loss.
 * 0.00368 is calibrated to match Chess.com's curve approximately:
 * - 0 cp loss = 100% accuracy
 * - 25 cp loss = ~91% accuracy
 * - 50 cp loss = ~83% accuracy
 * - 100 cp loss = ~69% accuracy
 * - 200 cp loss = ~48% accuracy
 */
const ACCURACY_SCALING = 0.00368;

/**
 * Maximum centipawn value to consider.
 *
 * Positions with evaluations beyond this are "winning" or "lost".
 * We cap cp loss calculations at this to avoid skewing from
 * already-won positions where any move wins.
 */
const MAX_EVAL_CP = 1000;

// ---------------------------------------------------------------------------
// Main Calculation Function
// ---------------------------------------------------------------------------

/**
 * Calculate accuracy for both players from analyzed moves.
 *
 * @param moves - Array of analyzed moves with classifications
 * @returns Accuracy results for both players
 *
 * IMPORTANT:
 * This function expects moves to have `evalDelta` already calculated
 * from the mover's perspective. The evalDelta should be:
 * - Positive if the move improved the position
 * - Negative if the move worsened the position (centipawn loss)
 *
 * @example
 * ```ts
 * const result = calculateAccuracy(analyzedMoves);
 * console.log(`White: ${result.white}%, Black: ${result.black}%`);
 * ```
 */
export function calculateAccuracy(moves: AnalyzedMove[]): AccuracyResult {
  const whiteMoveAccuracies: number[] = [];
  const blackMoveAccuracies: number[] = [];
  let whiteTotalCpLoss = 0;
  let blackTotalCpLoss = 0;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const isWhiteMove = i % 2 === 0; // Even indices are white's moves

    // Calculate centipawn loss (negative evalDelta = loss)
    // If evalDelta is positive, the move improved things (no loss)
    const cpLoss = Math.max(0, -move.evalDelta);

    // Cap at MAX_EVAL_CP to avoid skewing from won positions
    const cappedCpLoss = Math.min(cpLoss, MAX_EVAL_CP);

    // Convert cp loss to accuracy using exponential decay formula
    // This is similar to Chess.com's formula
    const moveAccuracy = cpLossToAccuracy(cappedCpLoss);

    if (isWhiteMove) {
      whiteMoveAccuracies.push(moveAccuracy);
      whiteTotalCpLoss += cappedCpLoss;
    } else {
      blackMoveAccuracies.push(moveAccuracy);
      blackTotalCpLoss += cappedCpLoss;
    }
  }

  // Calculate averages
  const whiteAvgAccuracy = whiteMoveAccuracies.length > 0
    ? average(whiteMoveAccuracies)
    : 0;

  const blackAvgAccuracy = blackMoveAccuracies.length > 0
    ? average(blackMoveAccuracies)
    : 0;

  const whiteAvgCpLoss = whiteMoveAccuracies.length > 0
    ? whiteTotalCpLoss / whiteMoveAccuracies.length
    : 0;

  const blackAvgCpLoss = blackMoveAccuracies.length > 0
    ? blackTotalCpLoss / blackMoveAccuracies.length
    : 0;

  return {
    white: Math.round(whiteAvgAccuracy * 10) / 10, // Round to 1 decimal
    black: Math.round(blackAvgAccuracy * 10) / 10,
    whiteMoveAccuracies,
    blackMoveAccuracies,
    whiteAvgCpLoss: Math.round(whiteAvgCpLoss * 10) / 10,
    blackAvgCpLoss: Math.round(blackAvgCpLoss * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Convert centipawn loss to accuracy percentage.
 *
 * Uses an exponential decay formula:
 * accuracy = 100 * e^(-k * cpLoss)
 *
 * where k is the scaling factor.
 *
 * @param cpLoss - Centipawn loss (non-negative)
 * @returns Accuracy percentage (0-100)
 */
export function cpLossToAccuracy(cpLoss: number): number {
  // Ensure non-negative
  const loss = Math.max(0, cpLoss);

  // Exponential decay: 100 * e^(-k * loss)
  // At loss=0, accuracy=100
  // As loss increases, accuracy decays toward 0
  const accuracy = 100 * Math.exp(-ACCURACY_SCALING * loss);

  // Round to reasonable precision
  return Math.max(0, Math.min(100, accuracy));
}

/**
 * Calculate the average of an array of numbers.
 *
 * @param numbers - Array of numbers
 * @returns Average value
 */
function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/**
 * Get a rating descriptor based on accuracy.
 *
 * Useful for displaying "Excellent", "Good", etc.
 *
 * @param accuracy - Accuracy percentage (0-100)
 * @returns Descriptor string
 */
export function getAccuracyRating(accuracy: number): string {
  if (accuracy >= 95) return 'Perfect';
  if (accuracy >= 90) return 'Excellent';
  if (accuracy >= 80) return 'Great';
  if (accuracy >= 70) return 'Good';
  if (accuracy >= 60) return 'Okay';
  if (accuracy >= 50) return 'Inaccurate';
  return 'Poor';
}

/**
 * Get a color for the accuracy value.
 *
 * Useful for styling accuracy displays.
 *
 * @param accuracy - Accuracy percentage (0-100)
 * @returns Hex color code
 */
export function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 90) return '#4caf50'; // Green
  if (accuracy >= 80) return '#8bc34a'; // Light green
  if (accuracy >= 70) return '#cddc39'; // Yellow-green
  if (accuracy >= 60) return '#ffeb3b'; // Yellow
  if (accuracy >= 50) return '#ff9800'; // Orange
  return '#f44336'; // Red
}

// ---------------------------------------------------------------------------
// Alternative Calculation Methods
// ---------------------------------------------------------------------------

/**
 * Calculate accuracy using win probability method.
 *
 * This is an alternative approach that converts evaluations to
 * win probabilities and measures how much win probability was lost.
 *
 * Some argue this is more accurate for positions that are already
 * winning or losing, as centipawn loss matters less when you're
 * up 10 pawns vs up 9 pawns.
 *
 * @param evalBefore - Evaluation before move (mover's perspective)
 * @param evalAfter - Evaluation after move (mover's perspective)
 * @returns Accuracy percentage (0-100)
 */
export function winProbabilityAccuracy(evalBefore: number, evalAfter: number): number {
  const winProbBefore = evalToWinProb(evalBefore);
  const winProbAfter = evalToWinProb(evalAfter);

  // If win probability stayed the same or improved, 100% accuracy
  if (winProbAfter >= winProbBefore) {
    return 100;
  }

  // Calculate how much win probability was preserved
  // If before was 80% and after is 60%, we preserved 60/80 = 75%
  // Scale to 0-100 range
  const preserved = winProbBefore > 0 ? winProbAfter / winProbBefore : 1;
  return preserved * 100;
}

/**
 * Convert centipawn evaluation to win probability.
 *
 * Uses Lichess's formula: 50 + 50 * (2 / (1 + exp(-0.00368 * cp)) - 1)
 *
 * @param evalCp - Evaluation in centipawns
 * @returns Win probability (0-100)
 */
export function evalToWinProb(evalCp: number): number {
  const exp = Math.exp(-0.00368 * evalCp);
  return 50 + 50 * (2 / (1 + exp) - 1);
}

/**
 * Calculate ACPL (Average Centipawn Loss).
 *
 * A simpler metric that just averages centipawn loss across moves.
 * Lower is better:
 * - <20: Elite/engine level
 * - 20-40: Strong player
 * - 40-60: Intermediate
 * - 60-100: Developing player
 * - >100: Beginner
 *
 * @param moves - Analyzed moves
 * @returns ACPL for white and black
 */
export function calculateACPL(moves: AnalyzedMove[]): { white: number; black: number } {
  let whiteLoss = 0;
  let blackLoss = 0;
  let whiteCount = 0;
  let blackCount = 0;

  for (let i = 0; i < moves.length; i++) {
    const cpLoss = Math.max(0, -moves[i].evalDelta);
    const isWhite = i % 2 === 0;

    if (isWhite) {
      whiteLoss += cpLoss;
      whiteCount++;
    } else {
      blackLoss += cpLoss;
      blackCount++;
    }
  }

  return {
    white: whiteCount > 0 ? Math.round(whiteLoss / whiteCount) : 0,
    black: blackCount > 0 ? Math.round(blackLoss / blackCount) : 0,
  };
}
