'use client';

import type { OpeningSortOption, OpeningResultFilter, OpeningColorFilter } from '@chess-game/shared';

interface OpeningsFiltersProps {
  sortBy: OpeningSortOption;
  onSortChange: (sort: OpeningSortOption) => void;
  resultFilter: OpeningResultFilter;
  onResultChange: (filter: OpeningResultFilter) => void;
  colorFilter: OpeningColorFilter;
  onColorChange: (filter: OpeningColorFilter) => void;
  onReset: () => void;
}

export function OpeningsFilters({
  sortBy,
  onSortChange,
  resultFilter,
  onResultChange,
  colorFilter,
  onColorChange,
  onReset,
}: OpeningsFiltersProps) {
  const hasActiveFilters =
    sortBy !== 'most-played' ||
    resultFilter !== 'all' ||
    colorFilter !== 'all';

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-black">
      {/* Sort */}
      <FilterGroup label="sort">
        <FilterButton
          active={sortBy === 'most-played'}
          onClick={() => onSortChange('most-played')}
        >
          most played
        </FilterButton>
        <FilterButton
          active={sortBy === 'best-winrate'}
          onClick={() => onSortChange('best-winrate')}
        >
          best win%
        </FilterButton>
        <FilterButton
          active={sortBy === 'worst-winrate'}
          onClick={() => onSortChange('worst-winrate')}
        >
          worst win%
        </FilterButton>
        <FilterButton
          active={sortBy === 'most-recent'}
          onClick={() => onSortChange('most-recent')}
        >
          recent
        </FilterButton>
      </FilterGroup>

      {/* Result Filter */}
      <FilterGroup label="result">
        <FilterButton
          active={resultFilter === 'all'}
          onClick={() => onResultChange('all')}
        >
          all
        </FilterButton>
        <FilterButton
          active={resultFilter === 'win'}
          onClick={() => onResultChange('win')}
        >
          wins
        </FilterButton>
        <FilterButton
          active={resultFilter === 'loss'}
          onClick={() => onResultChange('loss')}
        >
          losses
        </FilterButton>
        <FilterButton
          active={resultFilter === 'draw'}
          onClick={() => onResultChange('draw')}
        >
          draws
        </FilterButton>
      </FilterGroup>

      {/* Color Filter */}
      <FilterGroup label="color">
        <FilterButton
          active={colorFilter === 'all'}
          onClick={() => onColorChange('all')}
        >
          all
        </FilterButton>
        <FilterButton
          active={colorFilter === 'white'}
          onClick={() => onColorChange('white')}
        >
          as white
        </FilterButton>
        <FilterButton
          active={colorFilter === 'black'}
          onClick={() => onColorChange('black')}
        >
          as black
        </FilterButton>
      </FilterGroup>

      {/* Reset Button */}
      {hasActiveFilters && (
        <button
          onClick={onReset}
          className="px-3 py-1.5 font-mono text-xs text-white/50 hover:text-white transition-colors lowercase"
        >
          reset filters
        </button>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-white/50 lowercase">{label}:</span>
      <div className="flex">
        {children}
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 font-mono text-xs border-y border-r first:border-l border-white/15 transition-colors lowercase ${
        active
          ? 'bg-white text-black'
          : 'bg-black text-white/50 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
