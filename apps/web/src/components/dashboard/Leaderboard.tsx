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
      className="flex items-center justify-between p-3 border-b border-white/15 last:border-b-0 hover:bg-white/5 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-7 h-7 flex items-center justify-center font-mono text-sm border ${
            index === 0
              ? 'bg-white text-black border-white'
              : index === 1
              ? 'bg-white/20 text-white border-white/50'
              : index === 2
              ? 'bg-white/10 text-white/70 border-white/30'
              : 'bg-black text-white/50 border-white/15'
          }`}
        >
          {entry.rank}
        </span>
        <div>
          <div className="text-white font-mono text-sm">{entry.user.username}</div>
          <div className="text-xs text-white/30 font-mono lowercase">
            {entry.user.gamesPlayed} games • {entry.user.gamesWon} wins
          </div>
        </div>
      </div>
      <div className="text-right">
        {type === 'elo' ? (
          <>
            <div className="font-mono text-white">{entry.value}</div>
            <div className="text-xs font-mono text-white/30 lowercase">elo</div>
          </>
        ) : (
          <USDCAmount amount={entry.value} size="sm" />
        )}
      </div>
    </div>
  ), [type]);

  return (
    <div className="border border-white/15">
      <div className="flex items-center justify-between p-4 border-b border-white/15">
        <div>
          <p className="text-xs font-mono text-white/50 lowercase">rankings</p>
          <p className="text-xl font-mono text-white lowercase">leaderboard</p>
        </div>
        <div className="flex">
          <button
            onClick={() => setType('elo')}
            className={`px-3 py-1.5 font-mono text-xs border-y border-l border-white/15 transition-all lowercase ${
              type === 'elo'
                ? 'bg-white text-black'
                : 'bg-black text-white/50 hover:text-white'
            }`}
          >
            elo
          </button>
          <button
            onClick={() => setType('winnings')}
            className={`px-3 py-1.5 font-mono text-xs border border-white/15 transition-all lowercase ${
              type === 'winnings'
                ? 'bg-white text-black'
                : 'bg-black text-white/50 hover:text-white'
            }`}
          >
            returns
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8 bg-black">
          <span className="animate-blink text-white font-mono">_</span>
        </div>
      ) : !leaderboard?.length ? (
        <div className="text-center py-8 bg-black">
          <p className="text-white/30 font-mono text-sm lowercase">no data available</p>
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
