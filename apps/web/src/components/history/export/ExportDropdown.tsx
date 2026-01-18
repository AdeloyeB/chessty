'use client';

import { useState, useRef, useEffect } from 'react';

interface ExportDropdownProps {
  onExportGames: () => void;
  onExportTransactions: () => void;
  onExportBoth: () => void;
  isExporting: boolean;
}

export function ExportDropdown({
  onExportGames,
  onExportTransactions,
  onExportBoth,
  isExporting,
}: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className={`px-4 py-2 font-mono text-sm border transition-colors flex items-center gap-2 ${
          isExporting
            ? 'text-mid/50 border-mid/20 cursor-not-allowed'
            : 'text-mid-light border-mid/30 hover:text-pure-white hover:border-pure-white'
        }`}
      >
        {isExporting ? (
          <>
            <span className="animate-spin">&#8987;</span>
            exporting...
          </>
        ) : (
          <>
            export
            <span className="text-xs">{isOpen ? '▲' : '▼'}</span>
          </>
        )}
      </button>

      {isOpen && !isExporting && (
        <div className="absolute right-0 mt-1 w-48 bg-off-black border border-mid/30 shadow-lg z-10">
          <button
            onClick={() => {
              onExportGames();
              setIsOpen(false);
            }}
            className="w-full px-4 py-2 text-left font-mono text-sm text-mid-light hover:bg-pure-black hover:text-pure-white transition-colors"
          >
            Games (CSV)
          </button>
          <button
            onClick={() => {
              onExportTransactions();
              setIsOpen(false);
            }}
            className="w-full px-4 py-2 text-left font-mono text-sm text-mid-light hover:bg-pure-black hover:text-pure-white transition-colors"
          >
            Transactions (CSV)
          </button>
          <div className="border-t border-mid/30" />
          <button
            onClick={() => {
              onExportBoth();
              setIsOpen(false);
            }}
            className="w-full px-4 py-2 text-left font-mono text-sm text-mid-light hover:bg-pure-black hover:text-pure-white transition-colors"
          >
            Both (2 CSVs)
          </button>
        </div>
      )}
    </div>
  );
}
