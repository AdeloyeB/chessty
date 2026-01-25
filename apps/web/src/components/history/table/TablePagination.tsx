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
      <div className="flex justify-between items-center p-4 bg-black text-xs font-mono text-white/50 lowercase">
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
    <div className="flex justify-between items-center p-4 bg-black">
      <span className="text-xs font-mono text-white/50 lowercase">
        {totalItems} {totalItems === 1 ? 'game' : 'games'}
      </span>

      <div className="flex items-center">
        {/* Previous Button */}
        <button
          onClick={onPrevPage}
          disabled={page === 1}
          className={`px-3 py-1.5 font-mono text-xs border-y border-l border-white/15 transition-colors lowercase ${
            page === 1
              ? 'text-white/20 cursor-not-allowed'
              : 'text-white/50 hover:text-white'
          }`}
        >
          prev
        </button>

        {/* Page Numbers */}
        {getPageNumbers().map((pageNum, i) =>
          pageNum === 'ellipsis' ? (
            <span key={`ellipsis-${i}`} className="px-2 py-1.5 font-mono text-xs text-white/50 border-y border-l border-white/15">
              ...
            </span>
          ) : (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`w-8 h-8 font-mono text-xs border-y border-l border-white/15 transition-colors ${
                page === pageNum
                  ? 'bg-white text-black'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              {pageNum}
            </button>
          )
        )}

        {/* Next Button */}
        <button
          onClick={onNextPage}
          disabled={page === totalPages}
          className={`px-3 py-1.5 font-mono text-xs border border-white/15 transition-colors lowercase ${
            page === totalPages
              ? 'text-white/20 cursor-not-allowed'
              : 'text-white/50 hover:text-white'
          }`}
        >
          next
        </button>
      </div>

      <span className="text-xs font-mono text-white/50 lowercase">
        page {page} of {totalPages}
      </span>
    </div>
  );
}
