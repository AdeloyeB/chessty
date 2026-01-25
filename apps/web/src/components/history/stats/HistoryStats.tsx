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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-b border-white/15">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className={`p-4 bg-black animate-pulse ${
              i < 5 ? 'border-r border-white/15' : ''
            } ${i < 3 ? 'lg:border-b-0 border-b border-white/15' : ''}`}
          >
            <div className="h-3 bg-white/10 w-20 mb-2" />
            <div className="h-6 bg-white/10 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8 bg-black border-b border-white/15 text-center">
        <p className="text-white/50 font-mono lowercase">no data available</p>
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
    <div>
      {/* Primary Stats Row - bento grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-b border-white/15">
        <StatCard
          label="total_games"
          value={stats.totalGames}
          subValue={`${stats.wins}W ${stats.losses}L ${stats.draws}D`}
          className="border-r border-white/15 md:border-b lg:border-b-0 border-b border-white/15"
        />
        <StatCard
          label="win_rate"
          value={`${stats.winRate}%`}
          highlight={stats.winRate >= 50 ? 'positive' : 'negative'}
          className="md:border-r border-white/15 md:border-b lg:border-b-0 border-b border-white/15"
        />
        <StatCard
          label="net_profit"
          value={`$${formatMoney(stats.netProfit)}`}
          highlight={stats.netProfit >= 0 ? 'positive' : 'negative'}
          trend={stats.netProfit >= 0 ? 'up' : 'down'}
          trendValue={`${stats.roi}% ROI`}
          className="border-r border-white/15 border-b lg:border-b-0 border-white/15"
        />
        <StatCard
          label="current_elo"
          value={stats.currentElo}
          subValue={`Peak: ${stats.peakElo}`}
          trend={stats.eloChange >= 0 ? 'up' : 'down'}
          trendValue={`${stats.eloChange >= 0 ? '+' : ''}${stats.eloChange}`}
          className="md:border-r border-white/15 border-b lg:border-b-0 border-white/15"
        />
        <StatCard
          label="biggest_win"
          value={`$${formatMoney(stats.biggestWin)}`}
          highlight="positive"
          className="border-r border-white/15"
        />
        <StatCard
          label="biggest_loss"
          value={`$${formatMoney(stats.biggestLoss)}`}
          highlight="negative"
        />
      </div>

      {/* Secondary Stats Row - bento grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-b border-white/15">
        <StatCard
          label="total_wagered"
          value={`$${formatMoney(stats.totalWagered)}`}
          size="sm"
          className="border-r border-white/15 border-b lg:border-b-0 border-white/15"
        />
        <StatCard
          label="avg_opponent"
          value={stats.averageOpponentElo}
          size="sm"
          className="md:border-r border-white/15 border-b lg:border-b-0 border-white/15"
        />
        <StatCard
          label="current_streak"
          value={stats.currentStreak}
          highlight={stats.currentStreak > 0 ? 'positive' : stats.currentStreak < 0 ? 'negative' : 'neutral'}
          size="sm"
          className="border-r border-white/15 border-b lg:border-b-0 border-white/15"
        />
        <StatCard
          label="longest_win"
          value={stats.longestWinStreak}
          highlight="positive"
          size="sm"
          className="md:border-r border-white/15 border-b lg:border-b-0 border-white/15"
        />
        <StatCard
          label="avg_duration"
          value={formatDuration(stats.averageGameDuration)}
          size="sm"
          className="border-r border-white/15"
        />
        <StatCard
          label="most_active"
          value={stats.mostActiveDay}
          subValue={`${stats.mostActiveHour}:00`}
          size="sm"
        />
      </div>

      {/* Time Control Breakdown - bento grid */}
      <div className="border-b border-white/15">
        <div className="p-4 border-b border-white/15">
          <p className="text-xs font-mono text-white/50 lowercase">performance_by_time_control</p>
        </div>
        <div className="grid grid-cols-4">
          <TimeControlStat
            label="bullet"
            games={stats.bulletStats.games}
            winRate={stats.bulletStats.winRate}
            className="border-r border-white/15"
          />
          <TimeControlStat
            label="blitz"
            games={stats.blitzStats.games}
            winRate={stats.blitzStats.winRate}
            className="border-r border-white/15"
          />
          <TimeControlStat
            label="rapid"
            games={stats.rapidStats.games}
            winRate={stats.rapidStats.winRate}
            className="border-r border-white/15"
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
  className = '',
}: {
  label: string;
  games: number;
  winRate: number;
  className?: string;
}) {
  return (
    <div className={`p-4 text-center bg-black ${className}`}>
      <p className="text-xs font-mono text-white/50 mb-1 lowercase">{label}</p>
      <p className="text-lg font-mono text-white">{games}</p>
      <div className="flex items-center justify-center gap-2 mt-1">
        <div className="w-12 h-1 bg-white/10 overflow-hidden">
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
