'use client';

import type { HistoryGame } from '@chess-game/shared';
import { useOpeningsData } from '@/hooks/useOpeningsData';
import { PaginatedList } from '@/components/ui/PaginatedGrid';
import { OpeningsFilters } from './OpeningsFilters';
import { OpeningCard } from './OpeningCard';
import { OpeningDetailDrawer } from './OpeningDetailDrawer';

interface OpeningsTabProps {
  games: HistoryGame[];
  isLoading: boolean;
}

export function OpeningsTab({ games, isLoading }: OpeningsTabProps) {
  const openingsData = useOpeningsData({ games, isLoading });

  // Loading skeleton: 3 placeholder cards with pulse animation
  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="bg-off-black border border-white/15 p-4 animate-pulse"
          >
            {/* Title row skeleton */}
            <div className="flex items-center justify-between mb-3">
              <div className="h-4 w-40 bg-white/10" />
              <div className="h-3 w-8 bg-white/10" />
            </div>
            {/* Bar skeleton */}
            <div className="h-1.5 w-full bg-white/10 mb-3" />
            {/* Stats skeleton */}
            <div className="h-3 w-48 bg-white/10 mb-2" />
            {/* Color breakdown skeleton */}
            <div className="h-3 w-64 bg-white/10 mb-2" />
            {/* Last played skeleton */}
            <div className="h-3 w-32 bg-white/10" />
          </div>
        ))}
      </div>
    );
  }

  // Empty state: no games played yet
  if (games.length === 0) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm font-mono text-white/30 lowercase">
          no games played yet
        </p>
        <p className="text-xs font-mono text-white/20 mt-2 lowercase">
          play some games and your opening repertoire will appear here
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Summary stats bar */}
      <div className="p-4 border-b border-white/15">
        <p className="text-xs font-mono text-white/50 lowercase">
          {openingsData.totalOpenings} openings across {openingsData.totalGamesAnalyzed} games
        </p>
      </div>

      {/* Filters */}
      <div className="border-b border-white/15">
        <OpeningsFilters
          sortBy={openingsData.sortBy}
          onSortChange={openingsData.setSortBy}
          resultFilter={openingsData.resultFilter}
          onResultChange={openingsData.setResultFilter}
          colorFilter={openingsData.colorFilter}
          onColorChange={openingsData.setColorFilter}
          onReset={openingsData.resetFilters}
        />
      </div>

      {/* Openings List */}
      <div className="p-4">
        <PaginatedList
          items={openingsData.openings}
          itemsPerPage={8}
          renderItem={(opening) => (
            <OpeningCard
              opening={opening}
              onClick={() => openingsData.selectOpening(opening)}
            />
          )}
          emptyMessage="no openings match your filters"
          gap="md"
        />
      </div>

      {/* Detail Drawer */}
      <OpeningDetailDrawer
        opening={openingsData.selectedOpening}
        onClose={() => openingsData.selectOpening(null)}
      />
    </div>
  );
}
