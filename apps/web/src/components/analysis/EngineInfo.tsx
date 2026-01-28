'use client';

/**
 * EngineInfo Component
 * ====================
 *
 * Displays metadata about the chess engine and current analysis.
 *
 * WHAT THIS SHOWS:
 * - Engine name (e.g., "Stockfish 16")
 * - Current search depth (how many moves ahead the engine calculated)
 * - Best move for the current position
 * - Analysis progress when analyzing a full game
 *
 * WHY THIS IS USEFUL:
 * - Deeper depth = more accurate analysis (but takes longer)
 * - Seeing the best move helps users understand what they should have played
 * - Progress indicator shows how much of the game has been analyzed
 */

import type { EngineEvaluation, EngineInfo as EngineInfoType } from '@chess-game/shared';

interface EngineInfoProps {
  /** Engine metadata (name, author, ready status) */
  engineInfo: EngineInfoType | null;
  /** Current position evaluation (contains best move, depth) */
  currentEval: EngineEvaluation | null;
  /** Analysis progress for full game analysis */
  progress: { current: number; total: number } | null;
}

/**
 * A single info row with label and value.
 * Consistent styling across all engine info fields.
 */
function InfoRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-mid/20 last:border-b-0">
      <span className="text-xs font-mono text-mid-light lowercase">{label}</span>
      <span
        className={`text-xs font-mono ${highlight ? 'text-green-400' : 'text-pure-white'}`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Progress bar for game analysis.
 * Shows current/total positions analyzed.
 */
function ProgressBar({ current, total }: { current: number; total: number }) {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-mid-light lowercase">analyzing</span>
        <span className="text-xs font-mono text-pure-white">
          {current}/{total}
        </span>
      </div>
      <div className="h-1.5 bg-mid/30 rounded-sm overflow-hidden">
        <div
          className="h-full bg-green-400 transition-all duration-200 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function EngineInfo({ engineInfo, currentEval, progress }: EngineInfoProps) {
  // If no engine info, show placeholder state
  if (!engineInfo) {
    return (
      <div className="bg-pure-black border border-mid/30">
        <div className="p-3 border-b border-mid/30">
          <p className="text-xs font-mono text-mid-light lowercase">engine</p>
        </div>
        <div className="p-4">
          <p className="text-xs font-mono text-mid/50 lowercase text-center">
            engine not loaded
          </p>
        </div>
      </div>
    );
  }

  // Format best move for display
  // Prefer SAN (human-readable) over UCI (machine format)
  const bestMove = currentEval?.bestMoveSan || currentEval?.bestMove || '—';

  return (
    <div className="bg-pure-black border border-mid/30">
      {/* Header */}
      <div className="p-3 border-b border-mid/30">
        <p className="text-xs font-mono text-mid-light lowercase">engine</p>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Engine name */}
        <InfoRow label="name" value={engineInfo.name} />

        {/* Ready status */}
        <InfoRow
          label="status"
          value={engineInfo.ready ? 'ready' : 'loading...'}
          highlight={engineInfo.ready}
        />

        {/* Current depth (if analyzing) */}
        {currentEval && (
          <InfoRow label="depth" value={currentEval.depth} />
        )}

        {/* Best move for current position */}
        {currentEval && (
          <InfoRow label="best_move" value={bestMove} highlight />
        )}

        {/* Nodes searched (if available) */}
        {currentEval?.nodes && (
          <InfoRow
            label="nodes"
            value={formatNodes(currentEval.nodes)}
          />
        )}

        {/* Analysis time (if available) */}
        {currentEval?.timeMs && (
          <InfoRow
            label="time"
            value={`${(currentEval.timeMs / 1000).toFixed(1)}s`}
          />
        )}

        {/* Progress bar (for full game analysis) */}
        {progress && <ProgressBar current={progress.current} total={progress.total} />}
      </div>
    </div>
  );
}

/**
 * Formats large node counts for readability.
 *
 * Examples:
 * - 1234 -> "1.2K"
 * - 1234567 -> "1.2M"
 * - 1234567890 -> "1.2B"
 */
function formatNodes(nodes: number): string {
  if (nodes >= 1_000_000_000) {
    return `${(nodes / 1_000_000_000).toFixed(1)}B`;
  }
  if (nodes >= 1_000_000) {
    return `${(nodes / 1_000_000).toFixed(1)}M`;
  }
  if (nodes >= 1_000) {
    return `${(nodes / 1_000).toFixed(1)}K`;
  }
  return nodes.toString();
}
