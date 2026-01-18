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
        <p className="text-mid-light font-mono text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Navigation Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {showCount && (
            <p className="text-xs font-mono text-mid-light">
              {items.length} {countLabel}
            </p>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevious}
              disabled={currentPage === 0}
              className={`w-8 h-8 flex items-center justify-center border font-mono transition-all ${
                currentPage === 0
                  ? 'border-mid/20 text-mid/40 cursor-not-allowed'
                  : 'border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
              }`}
              aria-label="Previous page"
            >
              ←
            </button>

            <span className="text-xs font-mono text-mid-light min-w-[60px] text-center">
              {currentPage + 1} / {totalPages}
            </span>

            <button
              onClick={goToNext}
              disabled={currentPage >= totalPages - 1}
              className={`w-8 h-8 flex items-center justify-center border font-mono transition-all ${
                currentPage >= totalPages - 1
                  ? 'border-mid/20 text-mid/40 cursor-not-allowed'
                  : 'border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
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
  gap?: 'sm' | 'md';
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

  const gapClass = gap === 'sm' ? 'space-y-2' : 'space-y-3';

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-mid-light font-mono text-sm">{emptyMessage}</p>
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
        <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-mid/30">
          <button
            onClick={goToPrevious}
            disabled={currentPage === 0}
            className={`w-8 h-8 flex items-center justify-center border font-mono transition-all ${
              currentPage === 0
                ? 'border-mid/20 text-mid/40 cursor-not-allowed'
                : 'border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
            }`}
            aria-label="Previous page"
          >
            ←
          </button>

          <span className="text-xs font-mono text-mid-light min-w-[60px] text-center">
            {currentPage + 1} / {totalPages}
          </span>

          <button
            onClick={goToNext}
            disabled={currentPage >= totalPages - 1}
            className={`w-8 h-8 flex items-center justify-center border font-mono transition-all ${
              currentPage >= totalPages - 1
                ? 'border-mid/20 text-mid/40 cursor-not-allowed'
                : 'border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
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
