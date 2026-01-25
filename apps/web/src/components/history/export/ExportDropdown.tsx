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
        className={`px-4 py-2 font-mono text-sm border transition-colors flex items-center gap-2 lowercase ${
          isExporting
            ? 'text-white/20 border-white/10 cursor-not-allowed'
            : 'text-white/50 border-white/15 hover:text-white hover:border-white'
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
        <div className="absolute right-0 mt-1 w-48 bg-black border border-white/15 shadow-lg z-10">
          <button
            onClick={() => {
              onExportGames();
              setIsOpen(false);
            }}
            className="w-full px-4 py-2 text-left font-mono text-sm text-white/50 hover:bg-white/5 hover:text-white transition-colors lowercase"
          >
            games (csv)
          </button>
          <button
            onClick={() => {
              onExportTransactions();
              setIsOpen(false);
            }}
            className="w-full px-4 py-2 text-left font-mono text-sm text-white/50 hover:bg-white/5 hover:text-white transition-colors lowercase border-t border-white/15"
          >
            transactions (csv)
          </button>
          <button
            onClick={() => {
              onExportBoth();
              setIsOpen(false);
            }}
            className="w-full px-4 py-2 text-left font-mono text-sm text-white/50 hover:bg-white/5 hover:text-white transition-colors lowercase border-t border-white/15"
          >
            both (2 csvs)
          </button>
        </div>
      )}
    </div>
  );
}
