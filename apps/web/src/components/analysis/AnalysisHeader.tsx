'use client';

import { useState, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// WHAT IS THIS COMPONENT?
// ---------------------------------------------------------------------------
// AnalysisHeader is the control bar at the top of the analysis view.
// It provides:
// 1. A back button to return to game history
// 2. A depth selector (how deep the engine analyzes - higher = more accurate)
// 3. Start/Cancel analysis button
// 4. Export PGN button (when analysis is complete)
//
// WHAT IS "DEPTH"?
// When a chess engine analyzes, it looks ahead a certain number of moves.
// Depth 15 = looks 15 moves ahead (fast, less accurate)
// Depth 25 = looks 25 moves ahead (slow, very accurate)
// Higher depth finds better moves but takes exponentially longer.
// ---------------------------------------------------------------------------

interface AnalysisHeaderProps {
  /** Called when user clicks the back button */
  onClose: () => void;
  /** Called when user starts analysis with selected depth */
  onStartAnalysis: (depth: number) => void;
  /** Called when user cancels ongoing analysis */
  onCancelAnalysis: () => void;
  /** Whether analysis is currently running */
  isAnalyzing: boolean;
  /** Whether we have analysis results to display/export */
  hasAnalysis: boolean;
}

// Available depth options for the dropdown
// Lower values = faster but less accurate
// Higher values = slower but finds better moves
const DEPTH_OPTIONS = [15, 18, 20, 22, 25] as const;

export function AnalysisHeader({
  onClose,
  onStartAnalysis,
  onCancelAnalysis,
  isAnalyzing,
  hasAnalysis,
}: AnalysisHeaderProps) {
  // Selected analysis depth (default to 20 - good balance of speed/accuracy)
  const [selectedDepth, setSelectedDepth] = useState<number>(20);
  // Whether the depth dropdown is open
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  // Ref for dropdown to detect outside clicks
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle export PGN click
  // PGN = Portable Game Notation, a standard format for sharing chess games
  const handleExportPgn = () => {
    // TODO: Implement PGN export with analysis annotations
    console.log('Export PGN clicked - implementation pending');
  };

  return (
    <div className="flex items-center justify-between p-4 border-b border-mid/30 bg-off-black">
      {/* Left side: Back button */}
      <button
        onClick={onClose}
        className="px-3 py-1.5 font-mono text-sm text-mid-light hover:text-pure-white transition-colors lowercase"
      >
        ← back_to_history
      </button>

      {/* Right side: Controls */}
      <div className="flex items-center gap-3">
        {/* Depth Selector Dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            disabled={isAnalyzing}
            className={`px-3 py-1.5 font-mono text-sm border transition-colors lowercase flex items-center gap-2 ${
              isAnalyzing
                ? 'text-mid/40 border-mid/20 cursor-not-allowed'
                : 'bg-pure-black border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
            }`}
          >
            depth: {selectedDepth}
            <span className="text-xs">{isDropdownOpen ? '▲' : '▼'}</span>
          </button>

          {/* Dropdown menu */}
          {isDropdownOpen && !isAnalyzing && (
            <div className="absolute right-0 mt-1 w-full bg-pure-black border border-mid/50 shadow-lg z-10">
              {DEPTH_OPTIONS.map((depth) => (
                <button
                  key={depth}
                  onClick={() => {
                    setSelectedDepth(depth);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left font-mono text-sm transition-colors lowercase ${
                    depth === selectedDepth
                      ? 'bg-pure-white text-pure-black'
                      : 'text-mid-light hover:bg-mid/20 hover:text-pure-white'
                  }`}
                >
                  {depth}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Analyze / Cancel Button */}
        {isAnalyzing ? (
          <button
            onClick={onCancelAnalysis}
            className="px-4 py-1.5 font-mono text-sm border transition-colors lowercase bg-red-900/30 border-red-500/50 text-red-300 hover:bg-red-900/50 hover:border-red-500"
          >
            cancel
          </button>
        ) : (
          <button
            onClick={() => onStartAnalysis(selectedDepth)}
            className="px-4 py-1.5 font-mono text-sm border transition-colors lowercase bg-pure-white text-pure-black border-pure-white hover:bg-light"
          >
            analyze
          </button>
        )}

        {/* Export PGN Button - only shown when we have analysis and not currently analyzing */}
        {hasAnalysis && !isAnalyzing && (
          <button
            onClick={handleExportPgn}
            className="px-3 py-1.5 font-mono text-sm border transition-colors lowercase bg-pure-black border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white"
          >
            export pgn
          </button>
        )}
      </div>
    </div>
  );
}
