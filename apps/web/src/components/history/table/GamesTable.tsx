'use client';

import { useState } from 'react';
import type { HistoryGame } from '@chess-game/shared';
import { USDCAmount } from '@/components/wallet/USDCAmount';

interface GamesTableProps {
  games: HistoryGame[];
  isLoading: boolean;
  onGameClick: (game: HistoryGame) => void;
}

type SortField = 'date' | 'opponent' | 'result' | 'wager' | 'elo';
type SortDirection = 'asc' | 'desc';

export function GamesTable({ games, isLoading, onGameClick }: GamesTableProps) {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(dir => dir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedGames = [...games].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortField) {
      case 'date':
        return dir * (new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime());
      case 'opponent':
        return dir * a.opponent.username.localeCompare(b.opponent.username);
      case 'result':
        const resultOrder = { win: 0, draw: 1, loss: 2 };
        return dir * (resultOrder[a.result] - resultOrder[b.result]);
      case 'wager':
        return dir * (a.wagerAmount - b.wagerAmount);
      case 'elo':
        return dir * (a.eloChange - b.eloChange);
      default:
        return 0;
    }
  });

  if (isLoading) {
    return (
      <div className="bg-black overflow-hidden">
        <div className="p-4 border-b border-white/15">
          <div className="h-4 bg-white/10 w-48 animate-pulse" />
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-4 border-b border-white/15">
            <div className="h-4 bg-white/10 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="bg-black p-12 text-center">
        <p className="text-2xl mb-2">&#9812;</p>
        <p className="text-white/50 font-mono lowercase">no games found</p>
        <p className="text-xs text-white/30 font-mono mt-1 lowercase">try adjusting your filters</p>
      </div>
    );
  }

  return (
    <div className="bg-black overflow-hidden">
      {/* Table Header */}
      <div className="grid grid-cols-12 gap-4 p-4 border-b border-white/15 text-xs font-mono text-white/50 lowercase">
        <SortableHeader
          className="col-span-2"
          field="date"
          currentField={sortField}
          direction={sortDir}
          onSort={handleSort}
        >
          date
        </SortableHeader>
        <SortableHeader
          className="col-span-3"
          field="opponent"
          currentField={sortField}
          direction={sortDir}
          onSort={handleSort}
        >
          opponent
        </SortableHeader>
        <SortableHeader
          className="col-span-1"
          field="result"
          currentField={sortField}
          direction={sortDir}
          onSort={handleSort}
        >
          result
        </SortableHeader>
        <div className="col-span-1">time</div>
        <SortableHeader
          className="col-span-2"
          field="wager"
          currentField={sortField}
          direction={sortDir}
          onSort={handleSort}
        >
          wager
        </SortableHeader>
        <SortableHeader
          className="col-span-1"
          field="elo"
          currentField={sortField}
          direction={sortDir}
          onSort={handleSort}
        >
          elo
        </SortableHeader>
        <div className="col-span-2">opening</div>
      </div>

      {/* Table Body */}
      <div>
        {sortedGames.map((game) => (
          <button
            key={game.id}
            onClick={() => onGameClick(game)}
            className="w-full grid grid-cols-12 gap-4 p-4 border-b border-white/15 last:border-b-0 hover:bg-white/5 transition-colors text-left"
          >
            {/* Date */}
            <div className="col-span-2">
              <p className="text-sm font-mono text-white lowercase">
                {new Date(game.endedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
              <p className="text-xs font-mono text-white/50">
                {new Date(game.endedAt).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>

            {/* Opponent */}
            <div className="col-span-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-white/10 border border-white/15 flex items-center justify-center text-white/50 font-mono text-sm shrink-0">
                {game.opponent.username[0].toLowerCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-mono text-white truncate">
                  {game.opponent.username}
                </p>
                <p className="text-xs font-mono text-white/50">
                  {game.opponentEloAtStart}
                </p>
              </div>
            </div>

            {/* Result */}
            <div className="col-span-1 flex items-center">
              <ResultBadge result={game.result} />
            </div>

            {/* Time Control */}
            <div className="col-span-1 flex flex-col justify-center">
              <p className="text-sm font-mono text-white lowercase">
                {game.timeControlLabel}
              </p>
              {game.gameMode === 'chess960' && (
                <span className="text-xs font-mono text-usdc">960</span>
              )}
            </div>

            {/* Wager */}
            <div className="col-span-2 flex flex-col justify-center">
              <USDCAmount amount={game.wagerAmount} size="sm" />
              <p className={`text-xs font-mono ${
                game.result === 'win' ? 'text-green-400' :
                game.result === 'loss' ? 'text-red-400' : 'text-white/50'
              }`}>
                {game.result === 'win' ? '+' : game.result === 'loss' ? '-' : ''}
                ${game.result === 'draw' ? '0' : game.wagerAmount.toFixed(2)}
              </p>
            </div>

            {/* ELO Change */}
            <div className="col-span-1 flex items-center">
              <span className={`font-mono text-sm ${
                game.eloChange > 0 ? 'text-green-400' :
                game.eloChange < 0 ? 'text-red-400' : 'text-white/50'
              }`}>
                {game.eloChange > 0 ? '+' : ''}{game.eloChange}
              </span>
            </div>

            {/* Opening */}
            <div className="col-span-2 flex items-center">
              <p className="text-xs font-mono text-white/50 truncate lowercase">
                {game.opening || 'unknown'}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SortableHeader({
  field,
  currentField,
  direction,
  onSort,
  className,
  children,
}: {
  field: SortField;
  currentField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const isActive = field === currentField;

  return (
    <button
      className={`${className} text-left hover:text-white transition-colors flex items-center gap-1`}
      onClick={() => onSort(field)}
    >
      {children}
      <span className={isActive ? 'text-white' : 'text-white/20'}>
        {direction === 'asc' ? '↑' : '↓'}
      </span>
    </button>
  );
}

function ResultBadge({ result }: { result: 'win' | 'loss' | 'draw' }) {
  const colors = {
    win: 'bg-green-400/10 text-green-400 border-green-400/30',
    loss: 'bg-red-400/10 text-red-400 border-red-400/30',
    draw: 'bg-black text-white/50 border-white/15',
  };

  const labels = {
    win: 'W',
    loss: 'L',
    draw: 'D',
  };

  return (
    <span className={`w-6 h-6 flex items-center justify-center font-mono text-xs border ${colors[result]}`}>
      {labels[result]}
    </span>
  );
}
