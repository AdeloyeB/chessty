'use client';

import { useState, useMemo, useCallback, ReactNode } from 'react';

interface PaginatedGridProps<T> {
  items: T[];
  itemsPerPage: number;
  renderItem: (item: T, index: number) => ReactNode;
  columns?: 1 | 2 | 3 | 4;
  emptyMessage?: string;
  showCount?: boolean;
  countLabel?: string;
}

export function PaginatedGrid<T>({
  items,
  itemsPerPage,
  renderItem,
  columns = 3,
  emptyMessage = 'No items',
  showCount = false,
  countLabel = 'items',
}: PaginatedGridProps<T>) {
  const [currentPage, setCurrentPage] = useState(0);

  const totalPages = Math.ceil(items.length / itemsPerPage);

  const currentItems = useMemo(() => {
    const start = currentPage * itemsPerPage;
    return items.slice(start, start + itemsPerPage);
  }, [items, currentPage, itemsPerPage]);

  const goToPrevious = useCallback(() => {
    setCurrentPage((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1));
  }, [totalPages]);

  const columnClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  }[columns];

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-white/50 font-mono text-sm lowercase">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Navigation Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {showCount && (
            <p className="text-xs font-mono text-white/50 lowercase">
              {items.length} {countLabel}
            </p>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center">
            <button
              onClick={goToPrevious}
              disabled={currentPage === 0}
              className={`w-8 h-8 flex items-center justify-center border-y border-l border-r border-white/15 font-mono transition-all ${
                currentPage === 0
                  ? 'text-white/20 cursor-not-allowed'
                  : 'text-white/50 hover:text-white'
              }`}
              aria-label="Previous page"
            >
              ←
            </button>

            <span className="text-xs font-mono text-white/50 min-w-[60px] text-center px-2 border-y border-white/15">
              {currentPage + 1} / {totalPages}
            </span>

            <button
              onClick={goToNext}
              disabled={currentPage >= totalPages - 1}
              className={`w-8 h-8 flex items-center justify-center border border-white/15 font-mono transition-all ${
                currentPage >= totalPages - 1
                  ? 'text-white/20 cursor-not-allowed'
                  : 'text-white/50 hover:text-white'
              }`}
              aria-label="Next page"
            >
              →
            </button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className={`grid ${columnClass} gap-4`}>
        {currentItems.map((item, index) => renderItem(item, currentPage * itemsPerPage + index))}
      </div>
    </div>
  );
}

// Simpler list version for vertical lists
interface PaginatedListProps<T> {
  items: T[];
  itemsPerPage: number;
  renderItem: (item: T, index: number) => ReactNode;
  emptyMessage?: string;
  gap?: 'none' | 'sm' | 'md';
}

export function PaginatedList<T>({
  items,
  itemsPerPage,
  renderItem,
  emptyMessage = 'No items',
  gap = 'sm',
}: PaginatedListProps<T>) {
  const [currentPage, setCurrentPage] = useState(0);

  const totalPages = Math.ceil(items.length / itemsPerPage);

  const currentItems = useMemo(() => {
    const start = currentPage * itemsPerPage;
    return items.slice(start, start + itemsPerPage);
  }, [items, currentPage, itemsPerPage]);

  const goToPrevious = useCallback(() => {
    setCurrentPage((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1));
  }, [totalPages]);

  const gapClass = gap === 'none' ? '' : gap === 'sm' ? 'space-y-2' : 'space-y-3';

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-white/50 font-mono text-sm lowercase">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      {/* List */}
      <div className={gapClass}>
        {currentItems.map((item, index) => renderItem(item, currentPage * itemsPerPage + index))}
      </div>

      {/* Navigation Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center mt-4 pt-4 border-t border-white/15">
          <button
            onClick={goToPrevious}
            disabled={currentPage === 0}
            className={`w-8 h-8 flex items-center justify-center border-y border-l border-r border-white/15 font-mono transition-all ${
              currentPage === 0
                ? 'text-white/20 cursor-not-allowed'
                : 'text-white/50 hover:text-white'
            }`}
            aria-label="Previous page"
          >
            ←
          </button>

          <span className="text-xs font-mono text-white/50 min-w-[60px] text-center px-2 border-y border-white/15">
            {currentPage + 1} / {totalPages}
          </span>

          <button
            onClick={goToNext}
            disabled={currentPage >= totalPages - 1}
            className={`w-8 h-8 flex items-center justify-center border border-white/15 font-mono transition-all ${
              currentPage >= totalPages - 1
                ? 'text-white/20 cursor-not-allowed'
                : 'text-white/50 hover:text-white'
            }`}
            aria-label="Next page"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
