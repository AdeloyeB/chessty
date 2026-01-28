/**
 * Move Classification Utilities
 * =============================
 *
 * Classifies chess moves based on engine evaluation.
 *
 * WHAT IS MOVE CLASSIFICATION?
 * After analyzing a game with an engine, we can compare each move played
 * to what the engine recommended. The difference tells us how good or
 * bad the move was. This is displayed on chess sites with symbols like:
 * - !! (brilliant)
 * - ! (best/great)
 * - ?! (inaccuracy)
 * - ? (mistake)
 * - ?? (blunder)
 *
 * HOW IT WORKS:
 * 1. Engine evaluates position BEFORE the move
 * 2. Engine evaluates position AFTER the move
 * 3. We compare: did the evaluation get better or worse?
 * 4. Based on how much it changed, we classify the move
 *
 * CENTIPAWN LOSS:
 * "Centipawn loss" is how much worse a move made things compared to the best move.
 * - 0 cp loss = played the best move
 * - 50 cp loss = cost about half a pawn
 * - 300 cp loss = cost about a minor piece (knight/bishop)
 */

import type { MoveClassification } from '@chess-game/shared';

// ---------------------------------------------------------------------------
// Classification Thresholds
// ---------------------------------------------------------------------------

/**
 * Thresholds for classifying moves based on centipawn loss.
 *
 * These values are similar to what Chess.com and Lichess use.
 * The exact numbers vary between platforms, but the general idea is:
 * - Small losses (< 50cp) are fine
 * - Medium losses (50-100cp) are inaccuracies
 * - Large losses (100-300cp) are mistakes
 * - Huge losses (> 300cp) are blunders
 */
const THRESHOLDS = {
  /** Minimum eval swing for "brilliant" classification */
  BRILLIANT_SWING: 200,

  /** Minimum eval swing for "great" classification */
  GREAT_SWING: 100,

  /** Maximum loss to still be "excellent" (within this of best) */
  EXCELLENT_THRESHOLD: 10,

  /** Maximum loss to still be "good" */
  GOOD_THRESHOLD: 50,

  /** Maximum loss for "inaccuracy" (above this becomes mistake) */
  INACCURACY_THRESHOLD: 100,

  /** Maximum loss for "mistake" (above this becomes blunder) */
  MISTAKE_THRESHOLD: 300,
} as const;

// ---------------------------------------------------------------------------
// Main Classification Function
// ---------------------------------------------------------------------------

/**
 * Classify a move based on engine evaluation.
 *
 * @param evalBefore - Evaluation in centipawns BEFORE the move (from mover's perspective)
 * @param evalAfter - Evaluation in centipawns AFTER the move (from mover's perspective)
 * @param wasBestMove - Whether this was the engine's top recommendation
 * @param isWhiteMove - Whether white made this move (used for perspective)
 * @param isBookMove - Whether this is a recognized opening book move
 * @returns The move classification
 *
 * IMPORTANT NOTE ON EVALUATION PERSPECTIVE:
 * Engine evaluations are typically from WHITE's perspective:
 * - +100 = white is better
 * - -100 = black is better
 *
 * This function expects evaluations normalized to the MOVER's perspective:
 * - +100 = the side that moved is better
 * - -100 = the side that moved is worse
 *
 * Use `normalizeEvalForMover()` if you have white-perspective evals.
 */
export function classifyMove(
  evalBefore: number,
  evalAfter: number,
  wasBestMove: boolean,
  isWhiteMove: boolean,
  isBookMove = false
): MoveClassification {
  // Book moves get their own classification
  // These are established opening theory - neither good nor bad
  if (isBookMove) {
    return 'book';
  }

  // Calculate eval change from the mover's perspective
  // Positive = improved position, Negative = worsened position
  const evalDelta = evalAfter - evalBefore;

  // Calculate centipawn loss (how much worse than best move)
  // If they played the best move, loss is 0
  // Otherwise, loss is how much the eval dropped
  const cpLoss = wasBestMove ? 0 : Math.max(0, -evalDelta);

  // Eval swing: how much the eval changed (absolute value)
  const evalSwing = Math.abs(evalDelta);

  // ---------------------------------------------------------------------------
  // Classification Logic
  // ---------------------------------------------------------------------------

  // BRILLIANT: Best move in a complex position with big positive swing
  // This catches tactical shots that were hard to find
  if (wasBestMove && evalSwing >= THRESHOLDS.BRILLIANT_SWING && evalDelta > 0) {
    return 'brilliant';
  }

  // GREAT: Best move with significant positive swing
  if (wasBestMove && evalSwing >= THRESHOLDS.GREAT_SWING && evalDelta > 0) {
    return 'great';
  }

  // BEST: The engine's top choice
  if (wasBestMove) {
    return 'best';
  }

  // From here on, it wasn't the best move. Classify by how much was lost.

  // EXCELLENT: Within 10cp of best - essentially just as good
  if (cpLoss <= THRESHOLDS.EXCELLENT_THRESHOLD) {
    return 'excellent';
  }

  // GOOD: Within 50cp - a reasonable alternative
  if (cpLoss <= THRESHOLDS.GOOD_THRESHOLD) {
    return 'good';
  }

  // INACCURACY: Lost 50-100cp
  if (cpLoss <= THRESHOLDS.INACCURACY_THRESHOLD) {
    return 'inaccuracy';
  }

  // MISTAKE: Lost 100-300cp
  if (cpLoss <= THRESHOLDS.MISTAKE_THRESHOLD) {
    return 'mistake';
  }

  // BLUNDER: Lost more than 300cp
  return 'blunder';
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Normalize an evaluation from white's perspective to the mover's perspective.
 *
 * Engine evals are typically from white's POV:
 * - +100 means white is winning
 * - -100 means black is winning
 *
 * To classify moves correctly, we need the eval from the mover's POV:
 * - For white's move: use eval as-is
 * - For black's move: flip the sign
 *
 * @param evalCp - Evaluation in centipawns (white's perspective)
 * @param isWhiteMove - Whether white is the one moving
 * @returns Evaluation from the mover's perspective
 */
export function normalizeEvalForMover(evalCp: number, isWhiteMove: boolean): number {
  return isWhiteMove ? evalCp : -evalCp;
}

/**
 * Check if a move matches the engine's best move.
 *
 * @param playedMove - Move that was played (UCI format, e.g., "e2e4")
 * @param bestMove - Engine's recommended move (UCI format)
 * @returns True if they match
 */
export function isBestMove(playedMove: string, bestMove: string): boolean {
  // Normalize both to lowercase and compare
  return playedMove.toLowerCase() === bestMove.toLowerCase();
}

/**
 * Calculate centipawn loss for a move.
 *
 * @param evalBefore - Eval before move (mover's perspective)
 * @param evalAfter - Eval after move (mover's perspective)
 * @returns Centipawn loss (0 or positive number)
 */
export function calculateCpLoss(evalBefore: number, evalAfter: number): number {
  const delta = evalAfter - evalBefore;
  return Math.max(0, -delta);
}

/**
 * Get the CSS color class for a move classification.
 *
 * Useful for styling moves in the UI.
 *
 * @param classification - The move classification
 * @returns Tailwind color class or hex color
 */
export function getClassificationColor(classification: MoveClassification): string {
  switch (classification) {
    case 'brilliant':
      return '#1baca6'; // Teal - Chess.com style
    case 'great':
      return '#5c8bb0'; // Blue
    case 'best':
      return '#96bc4b'; // Green
    case 'excellent':
      return '#96bc4b'; // Same green, slightly different meaning
    case 'good':
      return '#a0a0a0'; // Gray - neutral
    case 'book':
      return '#a88b4a'; // Brown/gold for book moves
    case 'inaccuracy':
      return '#f7c631'; // Yellow
    case 'mistake':
      return '#e69500'; // Orange
    case 'blunder':
      return '#ca3431'; // Red
  }
}

/**
 * Get the symbol for a move classification.
 *
 * Traditional chess annotation symbols.
 *
 * @param classification - The move classification
 * @returns Annotation symbol (e.g., "!!", "?")
 */
export function getClassificationSymbol(classification: MoveClassification): string {
  switch (classification) {
    case 'brilliant':
      return '!!';
    case 'great':
      return '!';
    case 'best':
      return '';
    case 'excellent':
      return '';
    case 'good':
      return '';
    case 'book':
      return '';
    case 'inaccuracy':
      return '?!';
    case 'mistake':
      return '?';
    case 'blunder':
      return '??';
  }
}

/**
 * Get human-readable label for a classification.
 *
 * @param classification - The move classification
 * @returns Display label (e.g., "Brilliant", "Mistake")
 */
export function getClassificationLabel(classification: MoveClassification): string {
  switch (classification) {
    case 'brilliant':
      return 'Brilliant';
    case 'great':
      return 'Great move';
    case 'best':
      return 'Best move';
    case 'excellent':
      return 'Excellent';
    case 'good':
      return 'Good';
    case 'book':
      return 'Book move';
    case 'inaccuracy':
      return 'Inaccuracy';
    case 'mistake':
      return 'Mistake';
    case 'blunder':
      return 'Blunder';
  }
}
