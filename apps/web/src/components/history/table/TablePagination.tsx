'use client';

interface TablePaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export function TablePagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
  onPrevPage,
  onNextPage,
}: TablePaginationProps) {
  if (totalPages <= 1) {
    return (
      <div className="flex justify-between items-center p-4 bg-pure-black border-t border-mid/30 text-xs font-mono text-mid-light">
        <span>{totalItems} {totalItems === 1 ? 'game' : 'games'}</span>
      </div>
    );
  }

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const showEllipsisStart = page > 3;
    const showEllipsisEnd = page < totalPages - 2;

    if (totalPages <= 7) {
      // Show all pages
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    pages.push(1);

    if (showEllipsisStart) {
      pages.push('ellipsis');
    }

    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);

    for (let i = start; i <= end; i++) {
      if (!pages.includes(i)) {
        pages.push(i);
      }
    }

    if (showEllipsisEnd) {
      pages.push('ellipsis');
    }

    if (!pages.includes(totalPages)) {
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex justify-between items-center p-4 bg-pure-black border-t border-mid/30">
      <span className="text-xs font-mono text-mid-light">
        {totalItems} {totalItems === 1 ? 'game' : 'games'}
      </span>

      <div className="flex items-center gap-2">
        {/* Previous Button */}
        <button
          onClick={onPrevPage}
          disabled={page === 1}
          className={`px-2 py-1 font-mono text-xs border transition-colors ${
            page === 1
              ? 'text-mid/30 border-mid/20 cursor-not-allowed'
              : 'text-mid-light border-mid/30 hover:text-pure-white hover:border-pure-white'
          }`}
        >
          prev
        </button>

        {/* Page Numbers */}
        <div className="flex gap-1">
          {getPageNumbers().map((pageNum, i) =>
            pageNum === 'ellipsis' ? (
              <span key={`ellipsis-${i}`} className="px-2 py-1 font-mono text-xs text-mid-light">
                ...
              </span>
            ) : (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`w-8 h-8 font-mono text-xs border transition-colors ${
                  page === pageNum
                    ? 'bg-pure-white text-pure-black border-pure-white'
                    : 'text-mid-light border-mid/30 hover:text-pure-white hover:border-pure-white'
                }`}
              >
                {pageNum}
              </button>
            )
          )}
        </div>

        {/* Next Button */}
        <button
          onClick={onNextPage}
          disabled={page === totalPages}
          className={`px-2 py-1 font-mono text-xs border transition-colors ${
            page === totalPages
              ? 'text-mid/30 border-mid/20 cursor-not-allowed'
              : 'text-mid-light border-mid/30 hover:text-pure-white hover:border-pure-white'
          }`}
        >
          next
        </button>
      </div>

      <span className="text-xs font-mono text-mid-light">
        page {page} of {totalPages}
      </span>
    </div>
  );
}
