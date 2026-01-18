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
    <div className="flex flex-wrap items-center gap-4">
      {/* Result Filter */}
      <FilterGroup label="result">
        <FilterButton
          active={filters.result === 'all'}
          onClick={() => onResultChange('all')}
        >
          All
        </FilterButton>
        <FilterButton
          active={filters.result === 'win'}
          onClick={() => onResultChange('win')}
          color="green"
        >
          Wins
        </FilterButton>
        <FilterButton
          active={filters.result === 'loss'}
          onClick={() => onResultChange('loss')}
          color="red"
        >
          Losses
        </FilterButton>
        <FilterButton
          active={filters.result === 'draw'}
          onClick={() => onResultChange('draw')}
        >
          Draws
        </FilterButton>
      </FilterGroup>

      {/* Time Control Filter */}
      <FilterGroup label="time">
        <FilterButton
          active={filters.timeControl === 'all'}
          onClick={() => onTimeControlChange('all')}
        >
          All
        </FilterButton>
        <FilterButton
          active={filters.timeControl === 'bullet'}
          onClick={() => onTimeControlChange('bullet')}
        >
          Bullet
        </FilterButton>
        <FilterButton
          active={filters.timeControl === 'blitz'}
          onClick={() => onTimeControlChange('blitz')}
        >
          Blitz
        </FilterButton>
        <FilterButton
          active={filters.timeControl === 'rapid'}
          onClick={() => onTimeControlChange('rapid')}
        >
          Rapid
        </FilterButton>
        <FilterButton
          active={filters.timeControl === 'classical'}
          onClick={() => onTimeControlChange('classical')}
        >
          Classical
        </FilterButton>
      </FilterGroup>

      {/* Game Mode Filter */}
      <FilterGroup label="mode">
        <FilterButton
          active={filters.gameMode === 'all'}
          onClick={() => onGameModeChange('all')}
        >
          All
        </FilterButton>
        <FilterButton
          active={filters.gameMode === 'standard'}
          onClick={() => onGameModeChange('standard')}
        >
          Standard
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
          className="px-3 py-1.5 font-mono text-xs text-mid-light hover:text-pure-white transition-colors"
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
      <span className="text-xs font-mono text-mid-light">{label}:</span>
      <div className="flex gap-1">
        {children}
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: 'green' | 'red';
  children: React.ReactNode;
}) {
  const baseClasses = 'px-2 py-1 font-mono text-xs border transition-colors';
  const activeClasses = color === 'green'
    ? 'bg-green-400/20 text-green-400 border-green-400/50'
    : color === 'red'
      ? 'bg-red-400/20 text-red-400 border-red-400/50'
      : 'bg-pure-white text-pure-black border-pure-white';
  const inactiveClasses = 'bg-pure-black text-mid-light border-mid/30 hover:border-mid hover:text-pure-white';

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${active ? activeClasses : inactiveClasses}`}
    >
      {children}
    </button>
  );
}
