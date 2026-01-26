'use client';

import { useState, useMemo } from 'react';
import type { ChallengeWithCreator } from '@chess-game/shared';
import { ChallengeCard } from './ChallengeCard';
import { ChallengeFilters, type ChallengeFilters as Filters } from './ChallengeFilters';

interface ChallengeListProps {
  challenges: ChallengeWithCreator[];
  currentUserId: string | undefined;
  userBalance: number;
  onAccept: (challengeId: string) => void;
}

export function ChallengeList({
  challenges,
  currentUserId,
  userBalance,
  onAccept,
}: ChallengeListProps) {
  const [filters, setFilters] = useState<Filters>({
    gameMode: 'all',
    timeControlKey: 'all',
    minWager: null,
    maxWager: null,
  });

  const filteredChallenges = useMemo(() => {
    return challenges.filter((challenge) => {
      // Filter by game mode
      if (filters.gameMode !== 'all' && challenge.gameMode !== filters.gameMode) {
        return false;
      }

      // Filter by time control
      if (filters.timeControlKey !== 'all' && challenge.timeControlKey !== filters.timeControlKey) {
        return false;
      }

      // Filter by stake range
      if (filters.minWager !== null && challenge.wagerAmount < filters.minWager) {
        return false;
      }
      if (filters.maxWager !== null && challenge.wagerAmount > filters.maxWager) {
        return false;
      }

      return true;
    });
  }, [challenges, filters]);

  if (challenges.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-mid-light font-mono text-sm">no open challenges</p>
        <p className="text-mid font-mono text-xs mt-1">be the first to create one!</p>
      </div>
    );
  }

  return (
    <div>
      <ChallengeFilters onFilterChange={setFilters} />

      {filteredChallenges.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-mid-light font-mono text-sm">no matching challenges</p>
          <p className="text-mid font-mono text-xs mt-1">try adjusting your filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredChallenges.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              onAccept={onAccept}
              isOwnChallenge={challenge.creatorId === currentUserId}
              canAccept={
                challenge.creatorId !== currentUserId &&
                userBalance >= challenge.wagerAmount
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
