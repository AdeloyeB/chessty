'use client';

import { useEffect } from 'react';
import type { OpeningStats, HistoryGame } from '@chess-game/shared';
import { PaginatedList } from '@/components/ui/PaginatedGrid';
import { OpeningDetailHeader } from './OpeningDetailHeader';

interface OpeningDetailDrawerProps {
  opening: OpeningStats | null;
  onClose: () => void;
}

/**
 * Full-screen drawer showing detailed stats and games list for a selected opening.
 * Follows the same pattern as GameDetailDrawer: right-slide panel with backdrop,
 * escape key to close, and body scroll lock.
 */
export function OpeningDetailDrawer({ opening, onClose }: OpeningDetailDrawerProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (opening) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [opening]);

  if (!opening) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-pure-black/80"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-4xl bg-off-black border-l border-mid/30 overflow-y-auto">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-pure-black border-b border-mid/30">
          <div>
            <p className="text-xs font-mono text-mid-light">opening_detail</p>
            <p className="text-lg font-mono text-pure-white lowercase">
              {opening.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-mid-light hover:text-pure-white transition-colors"
          >
            <span className="text-2xl">&times;</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Stats Header */}
          <OpeningDetailHeader opening={opening} />

          {/* Games List */}
          <div>
            <div className="p-4 border-b border-white/15 bg-pure-black border border-white/15 border-b-0">
              <p className="text-xs font-mono text-white/50 lowercase">
                games ({opening.games.length})
              </p>
            </div>
            <div className="border border-white/15 border-t-0 p-4">
              <PaginatedList
                items={opening.games}
                itemsPerPage={10}
                emptyMessage="no games found"
                renderItem={(game) => (
                  <GameRow key={game.id} game={game} />
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Individual game row inside the opening detail drawer.
 * Shows opponent, result, ELO change, color played, and relative time.
 */
function GameRow({ game }: { game: HistoryGame }) {
  const resultLabel = game.result;
  const resultColor =
    game.result === 'win'
      ? 'text-green-400'
      : game.result === 'loss'
        ? 'text-red-400'
        : 'text-white/50';

  const eloPrefix = game.eloChange > 0 ? '+' : '';
  const eloColor =
    game.eloChange > 0
      ? 'text-green-400'
      : game.eloChange < 0
        ? 'text-red-400'
        : 'text-white/50';

  const colorIndicator = game.playerColor === 'white' ? '[W]' : '[B]';

  return (
    <div className="flex items-center justify-between py-2 px-3 font-mono text-sm border-b border-white/10 last:border-b-0 hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-3">
        <span className="text-white/30 text-xs">{colorIndicator}</span>
        <span className="text-white lowercase">
          vs {game.opponent.username}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className={`${resultColor} lowercase`}>{resultLabel}</span>
        <span className={`${eloColor} text-xs min-w-[40px] text-right`}>
          {eloPrefix}{game.eloChange}
        </span>
        <span className="text-white/30 text-xs min-w-[90px] text-right lowercase">
          {formatRelativeTime(new Date(game.endedAt))}
        </span>
      </div>
    </div>
  );
}

/**
 * Formats a Date into a human-readable relative time string.
 * - "just now" (< 1 min)
 * - "X minutes ago" (< 1 hr)
 * - "X hours ago" (< 24 hr)
 * - "X days ago" (< 30 days)
 * - "X months ago" (>= 30 days)
 */
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  if (diffDays < 30) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
}
