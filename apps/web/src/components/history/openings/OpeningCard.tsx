'use client';

import type { OpeningStats } from '@chess-game/shared';

interface OpeningCardProps {
  opening: OpeningStats;
  onClick: () => void;
}

/**
 * Horizontal stacked bar row for an opening.
 *
 * Layout (one row per opening, all bars same width for comparison):
 *
 *   italian game  C50   12  ████████░░░▓▓▓   75% / 8% / 17%
 *
 * The bar has 3 segments: wins (green), draws (gray), losses (red).
 * This is the same pattern Chess.com and Lichess use in their opening
 * explorers — it lets you visually compare all openings at once.
 */
export function OpeningCard({ opening, onClick }: OpeningCardProps) {
  const { wins, draws, losses, gamesPlayed } = opening;

  // Percentages for the 3 segments
  const winPct = gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0;
  const drawPct = gamesPlayed > 0 ? (draws / gamesPlayed) * 100 : 0;
  const lossPct = gamesPlayed > 0 ? (losses / gamesPlayed) * 100 : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left border-b border-white/10 hover:bg-white/[0.03] cursor-pointer transition-colors"
    >
      {/* Main row: name, ECO, games count, stacked bar, percentages */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Opening name + ECO code */}
        <div className="w-[220px] shrink-0 flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-mono text-white lowercase truncate">
            {opening.name}
          </span>
          {opening.ecoCode && (
            <span className="text-[10px] font-mono text-white/25 shrink-0">
              {opening.ecoCode}
            </span>
          )}
        </div>

        {/* Games count */}
        <span className="w-[48px] shrink-0 text-xs font-mono text-white/40 text-right tabular-nums">
          {gamesPlayed}
        </span>

        {/* Stacked bar — the core visualization */}
        <div className="flex-1 h-5 flex overflow-hidden bg-white/[0.04]">
          {/* Win segment (green) */}
          {winPct > 0 && (
            <div
              className="h-full bg-green-400/80 flex items-center justify-center"
              style={{ width: `${winPct}%` }}
            >
              {winPct >= 15 && (
                <span className="text-[10px] font-mono text-black/70 font-medium">
                  {Math.round(winPct)}%
                </span>
              )}
            </div>
          )}
          {/* Draw segment (neutral gray) */}
          {drawPct > 0 && (
            <div
              className="h-full bg-white/20 flex items-center justify-center"
              style={{ width: `${drawPct}%` }}
            >
              {drawPct >= 15 && (
                <span className="text-[10px] font-mono text-white/60">
                  {Math.round(drawPct)}%
                </span>
              )}
            </div>
          )}
          {/* Loss segment (red) */}
          {lossPct > 0 && (
            <div
              className="h-full bg-red-400/70 flex items-center justify-center"
              style={{ width: `${lossPct}%` }}
            >
              {lossPct >= 15 && (
                <span className="text-[10px] font-mono text-black/70 font-medium">
                  {Math.round(lossPct)}%
                </span>
              )}
            </div>
          )}
        </div>

        {/* W / D / L numbers */}
        <div className="shrink-0 flex items-center gap-2 text-xs font-mono tabular-nums w-[100px] justify-end">
          <span className="text-green-400">{wins}w</span>
          <span className="text-white/30">{draws}d</span>
          <span className="text-red-400">{losses}l</span>
        </div>
      </div>
    </button>
  );
}
