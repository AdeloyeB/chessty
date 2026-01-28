'use client';

import { ChessBoard } from '../chess/ChessBoard';
import { useMultiSpectatorStore, type SpectatedGameState } from '@/store/multiSpectator';
import { useWebSocket } from '@/hooks/useWebSocket';
import { formatTime } from '@/lib/utils';

interface CompactSpectatorCardProps {
  gameId: string;
  /** Click to expand this game into single-view mode */
  onExpand: () => void;
}

/**
 * Compact game card for the multi-game grid view.
 * Shows: mini chess board + player names + clocks + odds.
 * Click to expand to full SpectatorView.
 */
export function CompactSpectatorCard({ gameId, onExpand }: CompactSpectatorCardProps) {
  const game = useMultiSpectatorStore((s) => s.games[gameId]);
  const { stopSpectatingGame } = useWebSocket();
  const removeFromGrid = useMultiSpectatorStore((s) => s.removeFromGrid);

  if (!game) return null;

  const isEnded = game.status === 'ended';
  const turn = game.currentFen.split(' ')[1] === 'w' ? 'white' : 'black';

  return (
    <div className={`relative border border-white/15 bg-black group h-full flex flex-col max-w-sm w-full mx-auto ${isEnded ? 'opacity-60' : ''}`}>
      {/* Header: players + close */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/15 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* White */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2.5 h-2.5 bg-white border border-white/50 flex-shrink-0" />
            <span className="text-xs font-mono text-white truncate">
              {game.whitePlayer?.username ?? '?'}
            </span>
          </div>
          <span className="text-xs text-white/20 font-mono flex-shrink-0">vs</span>
          {/* Black */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2.5 h-2.5 bg-black border border-white/50 flex-shrink-0" />
            <span className="text-xs font-mono text-white truncate">
              {game.blackPlayer?.username ?? '?'}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isEnded && (
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeFromGrid(gameId); }}
            className="w-5 h-5 flex items-center justify-center text-white/30 hover:text-white text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove from grid"
          >
            x
          </button>
        </div>
      </div>

      {/* Board — click to expand */}
      <button
        type="button"
        onClick={onExpand}
        className="flex-1 relative cursor-pointer hover:bg-white/[0.02] transition-colors"
      >
        <div className="aspect-square w-full">
          <ChessBoard
            position={game.currentFen}
            orientation="white"
          />
        </div>

        {/* Game-ended overlay */}
        {isEnded && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-sm font-mono text-white/70 border border-white/30 px-3 py-1">
              game over
            </span>
          </div>
        )}
      </button>

      {/* Footer: clocks + turn indicator */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-white/15 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* White clock */}
          <div className={`flex items-center gap-1 ${turn === 'white' && !isEnded ? 'text-white' : 'text-white/40'}`}>
            <span className="text-[10px] font-mono">W</span>
            <span className="text-xs font-mono">{formatTime(game.whiteTimeRemaining)}</span>
          </div>
          {/* Black clock */}
          <div className={`flex items-center gap-1 ${turn === 'black' && !isEnded ? 'text-white' : 'text-white/40'}`}>
            <span className="text-[10px] font-mono">B</span>
            <span className="text-xs font-mono">{formatTime(game.blackTimeRemaining)}</span>
          </div>
        </div>

        {/* Turn dot */}
        {!isEnded && (
          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 ${turn === 'white' ? 'bg-white' : 'bg-white/40 border border-white/30'}`} />
            <span className="text-[10px] font-mono text-white/30">{turn}</span>
          </div>
        )}
      </div>
    </div>
  );
}
