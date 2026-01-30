/**
 * OverlayClock — Compact clock display for the overlay window
 * ============================================================
 *
 * A streamlined clock component optimized for the overlay's compact layout.
 * Shows time remaining with color-coded urgency:
 *   - Green: > 50% time remaining (healthy)
 *   - Amber: 50% to 30 seconds (getting low)
 *   - Red: < 30 seconds (time pressure)
 *   - Red + pulse: < 10 seconds (critical)
 *
 * DESIGN:
 * - Horizontal layout with clock icon + time
 * - Active player gets a subtle glow
 * - Inactive clock is dimmed
 */

'use client';

import { useMemo } from 'react';
import { formatTime } from '@/lib/utils';
import type { OverlayThemeColors } from '@/hooks/useOverlaySettings';
import { OVERLAY_THEMES } from '@/hooks/useOverlaySettings';

interface OverlayClockProps {
  /** Time remaining in seconds */
  time: number;
  /** Is this the active player's turn? */
  isActive: boolean;
  /** Initial time for percentage calculation */
  initialTime?: number;
  /** Optional player name to display */
  playerName?: string;
  /** Compact mode - just the time, no icon */
  compact?: boolean;
  /** Theme colors */
  themeColors?: OverlayThemeColors;
}

export function OverlayClock({
  time,
  isActive,
  initialTime = 180,
  playerName,
  compact = false,
  themeColors = OVERLAY_THEMES.dark,
}: OverlayClockProps) {
  // Calculate time thresholds for color coding
  const timeState = useMemo(() => {
    const halfwayPoint = initialTime / 2;
    const lowTime = 30;
    const criticalTime = 10;

    if (time <= criticalTime) return 'critical';
    if (time <= lowTime) return 'low';
    if (time <= halfwayPoint) return 'halfway';
    return 'healthy';
  }, [time, initialTime]);

  // Color styles based on state - using inline styles for theme-aware colors
  // These colors are chosen for WCAG AA contrast on both dark and light backgrounds
  const timeColor = useMemo(() => {
    if (!isActive) {
      return themeColors.textMuted;
    }

    switch (timeState) {
      case 'critical':
        return '#ef4444'; // red-500 - high visibility on all backgrounds
      case 'low':
        return '#f87171'; // red-400
      case 'halfway':
        return '#f59e0b'; // amber-500 - darker for light theme visibility
      default:
        return '#22c55e'; // green-500 - good contrast on light/dark
    }
  }, [isActive, timeState, themeColors.textMuted]);

  // Animation class for critical time
  const animationClass = timeState === 'critical' && isActive ? 'animate-pulse' : '';

  // Glow effect for active player
  const glowClasses = useMemo(() => {
    if (!isActive) return '';

    switch (timeState) {
      case 'critical':
        return 'shadow-[0_0_12px_rgba(239,68,68,0.6)]';
      case 'low':
        return 'shadow-[0_0_8px_rgba(248,113,113,0.4)]';
      case 'halfway':
        return 'shadow-[0_0_8px_rgba(251,191,36,0.3)]';
      default:
        return 'shadow-[0_0_8px_rgba(74,222,128,0.3)]';
    }
  }, [isActive, timeState]);

  if (compact) {
    return (
      <span
        className={`font-mono text-sm tabular-nums ${animationClass}`}
        style={{ color: timeColor }}
      >
        {formatTime(time)}
      </span>
    );
  }

  return (
    <div
      className={`
        flex items-center justify-center gap-2
        px-3 py-1.5
        transition-all duration-150
        ${glowClasses}
      `}
      style={{
        backgroundColor: themeColors.background,
        border: `1px solid ${isActive ? themeColors.border : themeColors.borderSubtle}`,
      }}
    >
      {/* Clock icon */}
      <svg
        className={`w-3.5 h-3.5 ${animationClass}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        style={{ color: timeColor }}
      >
        <circle cx="12" cy="12" r="10" strokeWidth="2" />
        <path
          strokeLinecap="round"
          strokeWidth="2"
          d="M12 6v6l4 2"
        />
      </svg>

      {/* Time display */}
      <span
        className={`font-mono text-sm tabular-nums tracking-wide ${animationClass}`}
        style={{ color: timeColor }}
      >
        {formatTime(time)}
      </span>

      {/* Player name (optional) */}
      {playerName && (
        <span
          className="text-xs font-mono"
          style={{ color: isActive ? themeColors.textSecondary : themeColors.textMuted }}
        >
          {playerName}
        </span>
      )}
    </div>
  );
}

export default OverlayClock;
