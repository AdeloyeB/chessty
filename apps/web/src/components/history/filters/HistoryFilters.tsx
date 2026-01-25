'use client';

import type { HistoryFilters as HistoryFiltersType } from '@chess-game/shared';

interface HistoryFiltersProps {
  filters: HistoryFiltersType;
  onResultChange: (result: HistoryFiltersType['result']) => void;
  onTimeControlChange: (tc: HistoryFiltersType['timeControl']) => void;
  onGameModeChange: (mode: HistoryFiltersType['gameMode']) => void;
  onReset: () => void;
}

export function HistoryFilters({
  filters,
  onResultChange,
  onTimeControlChange,
  onGameModeChange,
  onReset,
}: HistoryFiltersProps) {
  const hasActiveFilters =
    filters.result !== 'all' ||
    filters.timeControl !== 'all' ||
    filters.gameMode !== 'all';

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-black">
      {/* Result Filter */}
      <FilterGroup label="result">
        <FilterButton
          active={filters.result === 'all'}
          onClick={() => onResultChange('all')}
        >
          all
        </FilterButton>
        <FilterButton
          active={filters.result === 'win'}
          onClick={() => onResultChange('win')}
        >
          wins
        </FilterButton>
        <FilterButton
          active={filters.result === 'loss'}
          onClick={() => onResultChange('loss')}
        >
          losses
        </FilterButton>
        <FilterButton
          active={filters.result === 'draw'}
          onClick={() => onResultChange('draw')}
        >
          draws
        </FilterButton>
      </FilterGroup>

      {/* Time Control Filter */}
      <FilterGroup label="time">
        <FilterButton
          active={filters.timeControl === 'all'}
          onClick={() => onTimeControlChange('all')}
        >
          all
        </FilterButton>
        <FilterButton
          active={filters.timeControl === 'bullet'}
          onClick={() => onTimeControlChange('bullet')}
        >
          bullet
        </FilterButton>
        <FilterButton
          active={filters.timeControl === 'blitz'}
          onClick={() => onTimeControlChange('blitz')}
        >
          blitz
        </FilterButton>
        <FilterButton
          active={filters.timeControl === 'rapid'}
          onClick={() => onTimeControlChange('rapid')}
        >
          rapid
        </FilterButton>
        <FilterButton
          active={filters.timeControl === 'classical'}
          onClick={() => onTimeControlChange('classical')}
        >
          classical
        </FilterButton>
      </FilterGroup>

      {/* Game Mode Filter */}
      <FilterGroup label="mode">
        <FilterButton
          active={filters.gameMode === 'all'}
          onClick={() => onGameModeChange('all')}
        >
          all
        </FilterButton>
        <FilterButton
          active={filters.gameMode === 'standard'}
          onClick={() => onGameModeChange('standard')}
        >
          standard
        </FilterButton>
        <FilterButton
          active={filters.gameMode === 'chess960'}
          onClick={() => onGameModeChange('chess960')}
        >
          960
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
