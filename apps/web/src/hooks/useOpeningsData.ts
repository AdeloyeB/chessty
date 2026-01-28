'use client';

import { useState, useMemo } from 'react';
import type { HistoryGame, OpeningStats, OpeningSortOption, OpeningResultFilter, OpeningColorFilter } from '@chess-game/shared';
import { analyzeOpenings, sortOpenings, filterOpenings } from '@/lib/history/openingAnalyzer';

interface UseOpeningsDataParams {
  games: HistoryGame[];
  isLoading: boolean;
}

interface UseOpeningsDataReturn {
  // Processed data
  openings: OpeningStats[];
  totalOpenings: number;
  totalGamesAnalyzed: number;

  // Sort
  sortBy: OpeningSortOption;
  setSortBy: (sort: OpeningSortOption) => void;

  // Filters
  resultFilter: OpeningResultFilter;
  setResultFilter: (filter: OpeningResultFilter) => void;
  colorFilter: OpeningColorFilter;
  setColorFilter: (filter: OpeningColorFilter) => void;
  resetFilters: () => void;

  // Selection (for detail drawer)
  selectedOpening: OpeningStats | null;
  selectOpening: (opening: OpeningStats | null) => void;

  // Loading
  isLoading: boolean;
}

export function useOpeningsData({ games, isLoading }: UseOpeningsDataParams): UseOpeningsDataReturn {
  const [sortBy, setSortBy] = useState<OpeningSortOption>('most-played');
  const [resultFilter, setResultFilter] = useState<OpeningResultFilter>('all');
  const [colorFilter, setColorFilter] = useState<OpeningColorFilter>('all');
  const [selectedOpening, setSelectedOpening] = useState<OpeningStats | null>(null);

  // Step 1: Analyze all games into opening groups (expensive — memoized)
  const allOpenings = useMemo(() => analyzeOpenings(games), [games]);

  // Step 2: Apply filters (memoized on filter changes)
  const filteredOpenings = useMemo(
    () => filterOpenings(allOpenings, resultFilter, colorFilter),
    [allOpenings, resultFilter, colorFilter]
  );

  // Step 3: Sort (memoized on sort changes)
  const sortedOpenings = useMemo(
    () => sortOpenings(filteredOpenings, sortBy),
    [filteredOpenings, sortBy]
  );

  const resetFilters = () => {
    setResultFilter('all');
    setColorFilter('all');
    setSortBy('most-played');
  };

  const selectOpening = (opening: OpeningStats | null) => {
    setSelectedOpening(opening);
  };

  return {
    openings: sortedOpenings,
    totalOpenings: allOpenings.length,
    totalGamesAnalyzed: games.length,
    sortBy,
    setSortBy,
    resultFilter,
    setResultFilter,
    colorFilter,
    setColorFilter,
    resetFilters,
    selectedOpening,
    selectOpening,
    isLoading,
  };
}
