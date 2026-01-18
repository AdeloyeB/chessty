'use client';

import type { HistoryStats as HistoryStatsType } from '@chess-game/shared';
import { StatCard } from './StatCard';
import { USDCAmount } from '@/components/wallet/USDCAmount';

interface HistoryStatsProps {
  stats: HistoryStatsType | undefined;
  isLoading: boolean;
}

export function HistoryStats({ stats, isLoading }: HistoryStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="p-4 bg-pure-black border border-mid/30 animate-pulse">
            <div className="h-3 bg-mid/30 rounded w-20 mb-2" />
            <div className="h-6 bg-mid/30 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8 bg-pure-black border border-mid/30 text-center">
        <p className="text-mid-light font-mono">No data available</p>
      </div>
    );
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-4">
      {/* Primary Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard
          label="total_games"
          value={stats.totalGames}
          subValue={`${stats.wins}W ${stats.losses}L ${stats.draws}D`}
        />
        <StatCard
          label="win_rate"
          value={`${stats.winRate}%`}
          highlight={stats.winRate >= 50 ? 'positive' : 'negative'}
        />
        <StatCard
          label="net_profit"
          value={`$${formatMoney(stats.netProfit)}`}
          highlight={stats.netProfit >= 0 ? 'positive' : 'negative'}
          trend={stats.netProfit >= 0 ? 'up' : 'down'}
          trendValue={`${stats.roi}% ROI`}
        />
        <StatCard
          label="current_elo"
          value={stats.currentElo}
          subValue={`Peak: ${stats.peakElo}`}
          trend={stats.eloChange >= 0 ? 'up' : 'down'}
          trendValue={`${stats.eloChange >= 0 ? '+' : ''}${stats.eloChange}`}
        />
        <StatCard
          label="biggest_win"
          value={`$${formatMoney(stats.biggestWin)}`}
          highlight="positive"
        />
        <StatCard
          label="biggest_loss"
          value={`$${formatMoney(stats.biggestLoss)}`}
          highlight="negative"
        />
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard
          label="total_wagered"
          value={`$${formatMoney(stats.totalWagered)}`}
          size="sm"
        />
        <StatCard
          label="avg_opponent"
          value={stats.averageOpponentElo}
          size="sm"
        />
        <StatCard
          label="current_streak"
          value={stats.currentStreak}
          highlight={stats.currentStreak > 0 ? 'positive' : stats.currentStreak < 0 ? 'negative' : 'neutral'}
          size="sm"
        />
        <StatCard
          label="longest_win"
          value={stats.longestWinStreak}
          highlight="positive"
          size="sm"
        />
        <StatCard
          label="avg_duration"
          value={formatDuration(stats.averageGameDuration)}
          size="sm"
        />
        <StatCard
          label="most_active"
          value={stats.mostActiveDay}
          subValue={`${stats.mostActiveHour}:00`}
          size="sm"
        />
      </div>

      {/* Time Control Breakdown */}
      <div className="p-4 bg-pure-black border border-mid/30">
        <p className="text-xs font-mono text-mid-light mb-3">performance_by_time_control</p>
        <div className="grid grid-cols-4 gap-4">
          <TimeControlStat
            label="bullet"
            games={stats.bulletStats.games}
            winRate={stats.bulletStats.winRate}
          />
          <TimeControlStat
            label="blitz"
            games={stats.blitzStats.games}
            winRate={stats.blitzStats.winRate}
          />
          <TimeControlStat
            label="rapid"
            games={stats.rapidStats.games}
            winRate={stats.rapidStats.winRate}
          />
          <TimeControlStat
            label="classical"
            games={stats.classicalStats.games}
            winRate={stats.classicalStats.winRate}
          />
        </div>
      </div>
    </div>
  );
}

function TimeControlStat({
  label,
  games,
  winRate,
}: {
  label: string;
  games: number;
  winRate: number;
}) {
  return (
    <div className="text-center">
      <p className="text-xs font-mono text-mid-light mb-1">{label}</p>
      <p className="text-lg font-mono text-pure-white">{games}</p>
      <div className="flex items-center justify-center gap-2 mt-1">
        <div className="w-12 h-1 bg-mid/30 overflow-hidden">
          <div
            className={`h-full ${winRate >= 50 ? 'bg-green-400' : 'bg-red-400'}`}
            style={{ width: `${winRate}%` }}
          />
        </div>
        <span className={`text-xs font-mono ${winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
          {winRate}%
        </span>
      </div>
    </div>
  );
}
