'use client';

import type { OpeningStats } from '@chess-game/shared';

interface OpeningDetailHeaderProps {
  opening: OpeningStats;
}

/**
 * Summary header for the opening detail view.
 * Shows the opening name, ECO code, stat cards, win rate bar, and record summary.
 */
export function OpeningDetailHeader({ opening }: OpeningDetailHeaderProps) {
  const winRateColor = getWinRateColor(opening.winRate);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      return `${hours}h ${mins % 60}m`;
    }
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  return (
    <div className="space-y-4">
      {/* Opening Name + ECO Code */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-mono text-white lowercase">
          {opening.name}
        </h2>
        {opening.ecoCode && (
          <span className="text-sm font-mono text-white/50">
            {opening.ecoCode}
          </span>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard value={opening.gamesPlayed.toString()} label="games" />
        <StatCard value={`${Math.round(opening.winRate)}%`} label="win rate" />
        <StatCard
          value={`${Math.round(opening.winRateAsWhite)}%`}
          label="as white"
        />
        <StatCard
          value={`${Math.round(opening.winRateAsBlack)}%`}
          label="as black"
        />
      </div>

      {/* Win Rate Bar */}
      <div className="space-y-1">
        <div className="w-full h-2 bg-white/10 rounded-none">
          <div
            className={`h-full ${winRateColor} transition-all`}
            style={{ width: `${Math.min(100, opening.winRate)}%` }}
          />
        </div>
        <p className="text-xs font-mono text-white/50 lowercase">
          {Math.round(opening.winRate)}% overall
        </p>
      </div>

      {/* Record + Duration */}
      <div className="space-y-1">
        <p className="text-sm font-mono text-white/50 lowercase">
          record:{' '}
          <span className="text-green-400">{opening.wins}w</span>
          {' '}&bull;{' '}
          <span className="text-red-400">{opening.losses}l</span>
          {' '}&bull;{' '}
          <span className="text-white/50">{opening.draws}d</span>
        </p>
        <p className="text-sm font-mono text-white/50 lowercase">
          avg duration: {formatDuration(opening.averageGameDuration)}
        </p>
      </div>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-pure-black border border-white/15 p-3">
      <p className="text-lg font-mono text-white">{value}</p>
      <p className="text-xs font-mono text-white/50 lowercase">{label}</p>
    </div>
  );
}

/**
 * Returns the Tailwind background color class for a win rate percentage.
 * Higher win rates get green, lower get red.
 */
function getWinRateColor(rate: number): string {
  if (rate >= 60) return 'bg-green-400';
  if (rate >= 50) return 'bg-green-400/50';
  if (rate >= 40) return 'bg-white/20';
  if (rate >= 30) return 'bg-red-400/50';
  return 'bg-red-400';
}
