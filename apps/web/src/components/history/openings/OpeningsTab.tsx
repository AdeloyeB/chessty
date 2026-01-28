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

  // Loading skeleton: compact rows matching the stacked-bar layout
  if (isLoading) {
    return (
      <div>
        {/* Header skeleton */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10">
          <div className="w-[220px] h-3 bg-white/5" />
          <div className="w-[48px] h-3 bg-white/5" />
          <div className="flex-1 h-3 bg-white/5" />
          <div className="w-[100px] h-3 bg-white/5" />
        </div>
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-3 border-b border-white/10 animate-pulse"
          >
            <div className="w-[220px] h-4 bg-white/10 shrink-0" />
            <div className="w-[48px] h-3 bg-white/10 shrink-0" />
            <div className="flex-1 h-5 bg-white/[0.06]" />
            <div className="w-[100px] h-3 bg-white/10 shrink-0" />
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

      {/* Column header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10">
        <span className="w-[220px] shrink-0 text-[10px] font-mono text-white/25 uppercase tracking-wider">
          opening
        </span>
        <span className="w-[48px] shrink-0 text-[10px] font-mono text-white/25 uppercase tracking-wider text-right">
          games
        </span>
        <span className="flex-1 text-[10px] font-mono text-white/25 uppercase tracking-wider text-center">
          win · draw · loss
        </span>
        <span className="w-[100px] shrink-0 text-[10px] font-mono text-white/25 uppercase tracking-wider text-right">
          record
        </span>
      </div>

      {/* Openings List */}
      <div>
        <PaginatedList
          items={openingsData.openings}
          itemsPerPage={12}
          renderItem={(opening) => (
            <OpeningCard
              opening={opening}
              onClick={() => openingsData.selectOpening(opening)}
            />
          )}
          emptyMessage="no openings match your filters"
          gap="none"
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
