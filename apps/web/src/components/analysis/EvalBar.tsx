'use client';

/**
 * EvalBar Component
 * =================
 *
 * A vertical evaluation bar that visually shows who's winning in a chess position.
 *
 * HOW IT WORKS:
 * - The bar is split between white (from bottom) and black (from top)
 * - An equal position (0.0) shows a 50/50 split
 * - If white is winning (+5.0), the white section grows from the bottom
 * - If black is winning (-5.0), the black section grows from the top
 *
 * SCORE CONVERSION:
 * - Engine scores are in "centipawns" (100 cp = 1 pawn advantage)
 * - We convert to a -10 to +10 scale for display (capped)
 * - This scale maps to 0% to 100% bar fill
 *
 * MATE SCORES:
 * - When there's a forced checkmate, we show "M5" or "M-3"
 * - The bar goes fully to one side (100% white or 100% black)
 */

import type { EngineEvaluation } from '@chess-game/shared';

interface EvalBarProps {
  /** Engine evaluation data (null if no analysis yet) */
  evaluation: EngineEvaluation | null;
  /** Board orientation - determines which color is at bottom */
  orientation?: 'white' | 'black';
}

/**
 * Converts centipawn score to a percentage for the bar.
 *
 * We use a sigmoid-like scaling that:
 * - Maps 0 cp to 50%
 * - Maps +1000 cp (+10 pawns) to ~100%
 * - Maps -1000 cp (-10 pawns) to ~0%
 * - Caps at 0% and 100%
 *
 * The formula: 50 + (score / 1000) * 50, capped at [5, 95]
 * We leave a small margin (5%) so you can always see both colors.
 */
function scoreToPercentage(scoreCp: number): number {
  // Scale: every 1000 centipawns = 50% of the bar
  // +1000 cp = 100%, -1000 cp = 0%, 0 cp = 50%
  const percentage = 50 + (scoreCp / 1000) * 50;

  // Clamp to [5, 95] so both colors are always slightly visible
  // unless it's a mate (handled separately)
  return Math.max(5, Math.min(95, percentage));
}

/**
 * Formats the score for display.
 *
 * Examples:
 * - +150 cp -> "+1.5"
 * - -300 cp -> "-3.0"
 * - Mate in 5 -> "M5"
 * - Getting mated in 3 -> "M-3"
 */
function formatScore(evaluation: EngineEvaluation): string {
  // Mate scores take priority
  if (evaluation.scoreMate !== null) {
    const mateIn = evaluation.scoreMate;
    // Positive = winning side can force mate
    // Negative = losing side will be mated
    return mateIn > 0 ? `M${mateIn}` : `M${mateIn}`;
  }

  // Convert centipawns to pawns (divide by 100)
  const pawns = evaluation.scoreCp / 100;
  // Show sign (+/-) and format to 1 decimal place
  const sign = pawns >= 0 ? '+' : '';
  return `${sign}${pawns.toFixed(1)}`;
}

export function EvalBar({ evaluation, orientation = 'white' }: EvalBarProps) {
  // Calculate the white fill percentage
  let whitePercent = 50; // Default to equal position

  if (evaluation) {
    if (evaluation.scoreMate !== null) {
      // Mate score: bar goes fully to one side
      // Positive mate = white wins = 100% white
      // Negative mate = black wins = 0% white
      whitePercent = evaluation.scoreMate > 0 ? 100 : 0;
    } else {
      whitePercent = scoreToPercentage(evaluation.scoreCp);
    }
  }

  // If board is flipped (black at bottom), invert the bar
  const displayPercent = orientation === 'white' ? whitePercent : 100 - whitePercent;

  // Format score for display
  const scoreText = evaluation ? formatScore(evaluation) : '0.0';

  // Determine if we should show score on white or black side
  // Show on the winning side (larger portion of bar)
  const showOnWhiteSide = displayPercent >= 50;

  return (
    <div className="relative h-full w-6 bg-off-black border border-mid/30 overflow-hidden">
      {/* Black section (fills from top) */}
      <div
        className="absolute top-0 left-0 right-0 bg-zinc-800 transition-all duration-300 ease-out"
        style={{ height: `${100 - displayPercent}%` }}
      />

      {/* White section (fills from bottom) */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-zinc-100 transition-all duration-300 ease-out"
        style={{ height: `${displayPercent}%` }}
      />

      {/* Score overlay - positioned on the winning side */}
      <div
        className={`
          absolute left-0 right-0 flex items-center justify-center
          transition-all duration-300 ease-out
          ${showOnWhiteSide ? 'bottom-1' : 'top-1'}
        `}
      >
        <span
          className={`
            text-[10px] font-mono font-bold px-0.5
            ${showOnWhiteSide ? 'text-zinc-900' : 'text-zinc-100'}
          `}
        >
          {scoreText}
        </span>
      </div>
    </div>
  );
}
