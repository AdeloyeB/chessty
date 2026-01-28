/**
 * Evaluation Formatting Utilities
 * ================================
 *
 * Functions for displaying chess engine evaluations in the UI.
 *
 * WHAT IS AN EVALUATION?
 * Chess engines assign numerical values to positions:
 * - Measured in "centipawns" (1/100th of a pawn value)
 * - +100 = one pawn advantage for white
 * - -300 = roughly one minor piece advantage for black
 * - "M3" = forced checkmate in 3 moves
 *
 * DISPLAY CONVENTIONS:
 * - Positive scores (white winning) usually displayed without "+" in casual play
 * - Scores are typically shown as pawns (divide by 100): +1.5, -0.8
 * - Mate scores show "M" followed by move count: M5, -M3
 * - Colors: Green for white advantage, Red for black advantage
 */

// ---------------------------------------------------------------------------
// Score Formatting
// ---------------------------------------------------------------------------

/**
 * Format an engine evaluation for display.
 *
 * @param scoreCp - Score in centipawns (from white's perspective)
 * @param scoreMate - Mate in N moves (null if not a forced mate)
 * @returns Formatted string like "+1.5", "-0.3", "M5", "-M3"
 *
 * EXAMPLES:
 * - formatEval(150, null) → "+1.5"
 * - formatEval(-78, null) → "-0.8"
 * - formatEval(30000, 5) → "M5"
 * - formatEval(-30000, -3) → "-M3"
 * - formatEval(0, null) → "0.0"
 */
export function formatEval(scoreCp: number, scoreMate: number | null): string {
  // Mate scores take precedence
  if (scoreMate !== null) {
    if (scoreMate > 0) {
      // White can force mate in N moves
      return `M${scoreMate}`;
    } else {
      // Black can force mate in |N| moves
      return `-M${Math.abs(scoreMate)}`;
    }
  }

  // Convert centipawns to pawns
  const pawns = scoreCp / 100;

  // Format with sign and one decimal place
  if (scoreCp > 0) {
    return `+${pawns.toFixed(1)}`;
  } else if (scoreCp < 0) {
    return pawns.toFixed(1); // Negative sign included automatically
  } else {
    return '0.0';
  }
}

/**
 * Format evaluation with more compact representation.
 *
 * Used when space is limited (e.g., in move lists).
 *
 * @param scoreCp - Score in centipawns
 * @param scoreMate - Mate in N moves (null if not mate)
 * @returns Compact string like "1.5", "-0.3", "M5"
 */
export function formatEvalCompact(scoreCp: number, scoreMate: number | null): string {
  if (scoreMate !== null) {
    if (scoreMate > 0) {
      return `M${scoreMate}`;
    } else {
      return `M${Math.abs(scoreMate)}`;
    }
  }

  const pawns = Math.abs(scoreCp) / 100;
  return pawns.toFixed(1);
}

// ---------------------------------------------------------------------------
// Color Utilities
// ---------------------------------------------------------------------------

/**
 * Get the display color for an evaluation.
 *
 * Uses the project's color system for consistency.
 *
 * @param scoreCp - Score in centipawns
 * @param scoreMate - Mate in N moves (null if not mate)
 * @returns Hex color code
 *
 * COLOR MEANING:
 * - Green: White is winning (positive score)
 * - Red: Black is winning (negative score)
 * - Gray: Equal position (near zero)
 */
export function getEvalColor(scoreCp: number, scoreMate: number | null = null): string {
  // Mate always uses strong colors
  if (scoreMate !== null) {
    return scoreMate > 0 ? '#96bc4b' : '#ca3431'; // Green / Red
  }

  // Threshold for "equal" position (within 0.3 pawns)
  const EQUAL_THRESHOLD = 30;

  if (scoreCp > EQUAL_THRESHOLD) {
    // White advantage - green shades based on magnitude
    if (scoreCp > 300) return '#4caf50'; // Strong green
    if (scoreCp > 100) return '#8bc34a'; // Medium green
    return '#96bc4b'; // Light green
  } else if (scoreCp < -EQUAL_THRESHOLD) {
    // Black advantage - red shades based on magnitude
    if (scoreCp < -300) return '#f44336'; // Strong red
    if (scoreCp < -100) return '#e57373'; // Medium red
    return '#ca3431'; // Light red
  } else {
    // Equal position
    return '#888888'; // Gray (mid-light from color system)
  }
}

/**
 * Get Tailwind color classes for an evaluation.
 *
 * Useful when you want Tailwind classes instead of inline styles.
 *
 * @param scoreCp - Score in centipawns
 * @returns Tailwind text color class
 */
export function getEvalColorClass(scoreCp: number): string {
  const EQUAL_THRESHOLD = 30;

  if (scoreCp > EQUAL_THRESHOLD) {
    return 'text-green-500';
  } else if (scoreCp < -EQUAL_THRESHOLD) {
    return 'text-red-500';
  } else {
    return 'text-mid-light';
  }
}

// ---------------------------------------------------------------------------
// Eval Bar Utilities
// ---------------------------------------------------------------------------

/**
 * Calculate the percentage for an evaluation bar.
 *
 * Evaluation bars show the advantage visually:
 * - 50% = equal position
 * - 100% = white is winning decisively
 * - 0% = black is winning decisively
 *
 * Uses a sigmoid-like curve so extreme evals don't overflow.
 *
 * @param scoreCp - Score in centipawns
 * @param scoreMate - Mate in N moves (null if not mate)
 * @returns Percentage (0-100) for white's side of the bar
 *
 * EXAMPLES:
 * - getEvalBarPercent(0, null) → 50
 * - getEvalBarPercent(100, null) → ~58
 * - getEvalBarPercent(-500, null) → ~18
 * - getEvalBarPercent(0, 5) → 100 (white mates)
 * - getEvalBarPercent(0, -3) → 0 (black mates)
 */
export function getEvalBarPercent(scoreCp: number, scoreMate: number | null = null): number {
  // Mate positions go to the extreme
  if (scoreMate !== null) {
    return scoreMate > 0 ? 100 : 0;
  }

  // Use a sigmoid function to map centipawns to 0-100
  // This creates a smooth curve that:
  // - Centers at 50% for equal positions
  // - Approaches 100% as white's advantage grows
  // - Approaches 0% as black's advantage grows
  // - Never quite reaches 0% or 100% without mate

  // Convert to pawns
  const pawns = scoreCp / 100;

  // Sigmoid: 1 / (1 + e^(-x))
  // We use a scaling factor to control how quickly it approaches the extremes
  // k = 0.4 means ~90% at +5 pawns, ~10% at -5 pawns
  const k = 0.4;
  const sigmoid = 1 / (1 + Math.exp(-k * pawns));

  // Convert to percentage and clamp to 2-98 range
  // (Never show completely full/empty without mate)
  const percent = sigmoid * 100;
  return Math.min(98, Math.max(2, percent));
}

/**
 * Get the height percentages for a vertical evaluation bar.
 *
 * Vertical bars show white on bottom, black on top.
 *
 * @param scoreCp - Score in centipawns
 * @param scoreMate - Mate in N moves (null if not mate)
 * @returns Object with white and black percentages
 */
export function getEvalBarHeights(
  scoreCp: number,
  scoreMate: number | null = null
): { white: number; black: number } {
  const whitePercent = getEvalBarPercent(scoreCp, scoreMate);
  return {
    white: whitePercent,
    black: 100 - whitePercent,
  };
}

// ---------------------------------------------------------------------------
// Interpretation Helpers
// ---------------------------------------------------------------------------

/**
 * Get a human-readable description of the evaluation.
 *
 * Useful for tooltips or accessibility.
 *
 * @param scoreCp - Score in centipawns
 * @param scoreMate - Mate in N moves (null if not mate)
 * @returns Description like "White is slightly better", "Forced mate for Black"
 */
export function getEvalDescription(scoreCp: number, scoreMate: number | null): string {
  // Mate descriptions
  if (scoreMate !== null) {
    if (scoreMate > 0) {
      return `Forced checkmate in ${scoreMate} move${scoreMate === 1 ? '' : 's'} for White`;
    } else {
      return `Forced checkmate in ${Math.abs(scoreMate)} move${Math.abs(scoreMate) === 1 ? '' : 's'} for Black`;
    }
  }

  // Centipawn-based descriptions
  const absCp = Math.abs(scoreCp);
  const side = scoreCp >= 0 ? 'White' : 'Black';

  if (absCp < 20) return 'Equal position';
  if (absCp < 50) return `${side} is slightly better`;
  if (absCp < 100) return `${side} has a small advantage`;
  if (absCp < 200) return `${side} has a clear advantage`;
  if (absCp < 300) return `${side} has a significant advantage`;
  if (absCp < 500) return `${side} is winning`;
  if (absCp < 1000) return `${side} has a decisive advantage`;
  return `${side} is winning decisively`;
}

/**
 * Check if the position is roughly equal.
 *
 * @param scoreCp - Score in centipawns
 * @param threshold - Threshold in centipawns (default: 30)
 * @returns True if position is within threshold of equality
 */
export function isEqualPosition(scoreCp: number, threshold = 30): boolean {
  return Math.abs(scoreCp) <= threshold;
}

/**
 * Check if the position is a forced mate.
 *
 * @param scoreMate - Mate in N moves
 * @returns True if there's a forced mate
 */
export function isMateScore(scoreMate: number | null): boolean {
  return scoreMate !== null;
}

/**
 * Get which side is winning.
 *
 * @param scoreCp - Score in centipawns
 * @returns 'white', 'black', or 'equal'
 */
export function getWinningSide(scoreCp: number): 'white' | 'black' | 'equal' {
  if (scoreCp > 30) return 'white';
  if (scoreCp < -30) return 'black';
  return 'equal';
}
