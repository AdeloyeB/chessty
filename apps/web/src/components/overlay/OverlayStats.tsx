/**
 * OverlayStats — Expandable stats panel for the overlay window
 * =============================================================
 *
 * Shows game statistics in a collapsible panel:
 *   - Stake amounts and pot total
 *   - Move history (compact notation)
 *   - Engine evaluation (optional)
 *
 * DESIGN:
 * - Collapsed: Just an expand button with a preview indicator
 * - Expanded: Full panel with all stats
 * - Smooth slide animation
 */

'use client';

import { useMemo } from 'react';
import type { Move } from '@chess-game/shared';
import type { OverlayThemeColors } from '@/hooks/useOverlaySettings';
import { OVERLAY_THEMES, applyOpacityToColor } from '@/hooks/useOverlaySettings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverlayStatsProps {
  /** Is the panel expanded? */
  expanded: boolean;
  /** Toggle expanded state */
  onToggle: () => void;
  /** Player's wager amount */
  stake?: number;
  /** Total pot (both players' wagers) */
  pot?: number;
  /** Move history */
  moves?: Move[];
  /** Engine evaluation (optional, e.g., "+0.3" or "-1.2") */
  evaluation?: string;
  /** Show evaluation bar */
  showEval?: boolean;
  /** Player name */
  playerName?: string;
  /** Player rating */
  playerRating?: number;
  /** Theme colors */
  themeColors?: OverlayThemeColors;
  /** Window opacity (0.3-1.0) for transparent backgrounds */
  opacity?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OverlayStats({
  expanded,
  onToggle,
  stake = 0,
  pot = 0,
  moves = [],
  evaluation,
  showEval = true,
  playerName = 'You',
  playerRating,
  themeColors = OVERLAY_THEMES.dark,
  opacity = 1,
}: OverlayStatsProps) {
  // Apply opacity to background colors for window transparency
  const bgWithOpacity = applyOpacityToColor(themeColors.surface, opacity);
  const bgDarkWithOpacity = applyOpacityToColor(themeColors.background, opacity);
  const borderWithOpacity = applyOpacityToColor(themeColors.border, opacity);
  const borderSubtleWithOpacity = applyOpacityToColor(themeColors.borderSubtle, opacity);
  // Format moves into compact notation (e.g., "1.e4 e5 2.Nf3 Nc6")
  const moveNotation = useMemo(() => {
    if (moves.length === 0) return 'No moves yet';

    const pairs: string[] = [];
    for (let i = 0; i < moves.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const whiteMove = moves[i]?.san || '';
      const blackMove = moves[i + 1]?.san || '';
      pairs.push(`${moveNum}.${whiteMove}${blackMove ? ` ${blackMove}` : ''}`);
    }
    return pairs.join(' ');
  }, [moves]);

  return (
    <div
      className="overflow-hidden"
      style={{
        backgroundColor: bgWithOpacity,
        borderTop: `1px solid ${borderWithOpacity}`,
      }}
    >
      {/* Header bar - always visible */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer transition-colors"
        style={{ backgroundColor: bgWithOpacity }}
        onClick={onToggle}
      >
        {/* Player info */}
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-mono truncate max-w-[100px]"
            style={{ color: themeColors.textPrimary }}
          >
            {playerName}
          </span>
          {playerRating && (
            <span
              className="text-xs font-mono"
              style={{ color: themeColors.textSecondary }}
            >
              ({playerRating})
            </span>
          )}
        </div>

        {/* Expand/collapse button */}
        <button
          className="flex items-center gap-1 transition-colors"
          style={{ color: themeColors.textSecondary }}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className="text-[10px] font-mono">{expanded ? 'collapse' : 'expand'}</span>
        </button>
      </div>

      {/* Expandable content */}
      <div
        className={`
          overflow-hidden transition-all duration-200 ease-out
          ${expanded ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}
        `}
      >
        <div className="px-3 pb-3 space-y-2">
          {/* Stakes row */}
          {(stake > 0 || pot > 0) && (
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span style={{ color: themeColors.textMuted }}>stake:</span>
                <span style={{ color: themeColors.textPrimary }}>${stake.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ color: themeColors.textMuted }}>pot:</span>
                <span className="text-green-400">${pot.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Move history */}
          <div
            className="p-2 max-h-20 overflow-y-auto"
            style={{
              backgroundColor: bgDarkWithOpacity,
              border: `1px solid ${borderSubtleWithOpacity}`,
            }}
          >
            <p
              className="text-xs font-mono leading-relaxed break-words"
              style={{ color: themeColors.textSecondary }}
            >
              {moveNotation}
            </p>
          </div>

          {/* Evaluation (optional) */}
          {showEval && evaluation && (
            <div className="flex items-center justify-between text-xs font-mono">
              <span style={{ color: themeColors.textMuted }}>eval:</span>
              <span
                className={`
                  ${evaluation.startsWith('+') ? 'text-green-400' : ''}
                  ${evaluation.startsWith('-') ? 'text-red-400' : ''}
                `}
                style={evaluation === '0.0' ? { color: themeColors.textSecondary } : undefined}
              >
                {evaluation}
              </span>
            </div>
          )}

          {/* Move count */}
          <div
            className="flex items-center justify-between text-[10px] font-mono"
            style={{ color: themeColors.textMuted }}
          >
            <span>moves</span>
            <span>{moves.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OverlayStats;
