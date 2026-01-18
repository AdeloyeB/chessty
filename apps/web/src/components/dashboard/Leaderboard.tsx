'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import type { LeaderboardEntry } from '@chess-game/shared';
import { USDCAmount } from '../wallet/USDCAmount';
import { PaginatedList } from '../ui/PaginatedGrid';

type LeaderboardType = 'elo' | 'winnings';

export function Leaderboard() {
  const [type, setType] = useState<LeaderboardType>('elo');
  const { getEloLeaderboard, getWinningsLeaderboard } = useApi();

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['leaderboard', type],
    queryFn: () => (type === 'elo' ? getEloLeaderboard(50) : getWinningsLeaderboard(50)),
  });

  const renderLeaderboardEntry = useCallback((entry: LeaderboardEntry, index: number) => (
    <div
      key={entry.user.id}
      className={`flex items-center justify-between p-3 border ${
        index < 3
          ? 'bg-pure-black border-pure-white/30'
          : 'bg-pure-black border-mid/20'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-7 h-7 flex items-center justify-center font-mono text-sm border ${
            index === 0
              ? 'bg-pure-white text-pure-black border-pure-white'
              : index === 1
              ? 'bg-light/20 text-pure-white border-light/50'
              : index === 2
              ? 'bg-mid/20 text-light border-mid/50'
              : 'bg-off-black text-mid-light border-mid/30'
          }`}
        >
          {entry.rank}
        </span>
        <div>
          <div className="text-pure-white font-mono text-sm">{entry.user.username}</div>
          <div className="text-xs text-mid-light font-mono">
            {entry.user.gamesPlayed} games • {entry.user.gamesWon} wins
          </div>
        </div>
      </div>
      <div className="text-right">
        {type === 'elo' ? (
          <>
            <div className="font-mono text-pure-white">{entry.value}</div>
            <div className="text-xs font-mono text-mid-light">elo</div>
          </>
        ) : (
          <USDCAmount amount={entry.value} size="sm" />
        )}
      </div>
    </div>
  ), [type]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-mono text-mid-light">rankings</p>
          <p className="text-xl font-mono text-pure-white">leaderboard</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setType('elo')}
            className={`px-3 py-1.5 font-mono text-xs border ${
              type === 'elo'
                ? 'bg-pure-white text-pure-black border-pure-white'
                : 'bg-transparent border-mid/50 text-mid-light hover:text-pure-white'
            }`}
          >
            elo
          </button>
          <button
            onClick={() => setType('winnings')}
            className={`px-3 py-1.5 font-mono text-xs border ${
              type === 'winnings'
                ? 'bg-pure-white text-pure-black border-pure-white'
                : 'bg-transparent border-mid/50 text-mid-light hover:text-pure-white'
            }`}
          >
            returns
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <span className="animate-blink text-pure-white font-mono">_</span>
        </div>
      ) : !leaderboard?.length ? (
        <div className="text-center py-8">
          <p className="text-mid-light font-mono text-sm">no data available</p>
        </div>
      ) : (
        <PaginatedList
          items={leaderboard as LeaderboardEntry[]}
          itemsPerPage={10}
          renderItem={renderLeaderboardEntry}
          emptyMessage="no data available"
          gap="sm"
        />
      )}
    </div>
  );
}
