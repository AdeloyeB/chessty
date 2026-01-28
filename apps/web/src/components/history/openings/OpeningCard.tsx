'use client';

import type { OpeningStats } from '@chess-game/shared';

interface OpeningCardProps {
  opening: OpeningStats;
  onClick: () => void;
}

/**
 * Formats a Date into a relative time string like "2 days ago" or "3 hours ago".
 * Falls back to "just now" for anything under a minute.
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMonths > 0) {
    return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
  }
  if (diffWeeks > 0) {
    return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
  }
  if (diffDays > 0) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }
  if (diffHours > 0) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  if (diffMinutes > 0) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  }
  return 'just now';
}

/**
 * Returns a Tailwind bg class for the win rate bar based on the percentage.
 * Higher win rates get green, lower rates get red.
 */
function getWinRateBarColor(winRate: number): string {
  if (winRate >= 60) return 'bg-green-400';
  if (winRate >= 50) return 'bg-green-400/50';
  if (winRate >= 40) return 'bg-white/20';
  if (winRate >= 30) return 'bg-red-400/50';
  return 'bg-red-400';
}

export function OpeningCard({ opening, onClick }: OpeningCardProps) {
  const barColor = getWinRateBarColor(opening.winRate);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-off-black border border-white/15 p-4 hover:border-white/30 cursor-pointer transition-colors"
    >
      {/* Row 1: Opening name + ECO code */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="text-sm font-mono text-white lowercase">
          {opening.name}
        </p>
        {opening.ecoCode && (
          <span className="text-xs font-mono text-white/30 shrink-0">
            {opening.ecoCode}
          </span>
        )}
      </div>

      {/* Row 2: Win rate bar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-1.5 bg-white/10 overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${opening.winRate}%` }}
          />
        </div>
        <span className="text-xs font-mono text-white/50 shrink-0">
          {Math.round(opening.winRate)}%
        </span>
      </div>

      {/* Row 3: Games played + W/L/D breakdown */}
      <div className="flex items-center gap-1 text-xs font-mono mb-2">
        <span className="text-white/50">{opening.gamesPlayed} games</span>
        <span className="text-white/30 mx-1">&middot;</span>
        <span className="text-green-400">{opening.wins}w</span>
        <span className="text-red-400 ml-1">{opening.losses}l</span>
        <span className="text-white/50 ml-1">{opening.draws}d</span>
      </div>

      {/* Row 4: Color breakdown */}
      <div className="text-xs font-mono text-white/50 mb-2">
        <span>as white: {opening.gamesAsWhite} games, {Math.round(opening.winRateAsWhite)}%</span>
        <span className="text-white/30 mx-2">&middot;</span>
        <span>as black: {opening.gamesAsBlack} games, {Math.round(opening.winRateAsBlack)}%</span>
      </div>

      {/* Row 5: Last played */}
      <div className="text-xs font-mono text-white/30">
        last played: {formatRelativeTime(opening.lastPlayed)}
      </div>
    </button>
  );
}
