'use client';

import { useDraggable } from '@dnd-kit/core';
import type { SpectatedGameState } from '@/store/multiSpectator';
import { formatTime } from '@/lib/utils';

interface DraggableGameTileProps {
  game: SpectatedGameState;
  isActive: boolean;       // Currently focused in single-view
  isInGrid: boolean;       // Currently in multi-game grid
  onClick: () => void;
  onRemove: () => void;
}

/**
 * Horizontal game card used in the spectator sidebar.
 * Left: mini board diagram (64x64). Right: player names, clocks, spectator count.
 * Draggable — drag into the content area to add to the multi-game grid.
 * Click to focus in single-view mode.
 */
export function DraggableGameTile({ game, isActive, isInGrid, onClick, onRemove }: DraggableGameTileProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `tile-${game.gameId}`,
    data: { gameId: game.gameId },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const isEnded = game.status === 'ended';
  const turn = game.currentFen.split(' ')[1] === 'w' ? 'white' : 'black';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group flex-shrink-0 ${isDragging ? 'z-50 opacity-75' : ''}`}
    >
      {/* Tile body — draggable + clickable */}
      <button
        type="button"
        onClick={onClick}
        {...listeners}
        {...attributes}
        className={`
          flex items-stretch h-16 w-full border transition-all cursor-grab active:cursor-grabbing
          ${isActive
            ? 'border-white bg-white/10 shadow-[0_0_8px_rgba(255,255,255,0.3)]'
            : isInGrid
              ? 'border-white/50 bg-white/5'
              : 'border-white/15 bg-black hover:border-white/40'
          }
          ${isEnded ? 'opacity-50' : ''}
        `}
      >
        {/* Left: Mini board (fixed 64x64) */}
        <div className="w-16 h-16 flex-shrink-0 relative">
          <MiniBoard fen={game.currentFen} />

          {/* Live indicator */}
          {!isEnded && (
            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          )}
          {isEnded && (
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-mono text-white/70 bg-black/60">
              end
            </span>
          )}
        </div>

        {/* Right: Game info */}
        <div className="flex flex-col justify-center gap-0.5 px-2.5 min-w-0 border-l border-white/10">
          {/* Player names + turn indicator */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-1.5 h-1.5 flex-shrink-0 ${turn === 'white' ? 'bg-white' : 'bg-white/40 border border-white/30'}`} />
            <span className="text-[10px] font-mono text-white leading-tight">
              {game.whitePlayer?.username ?? '?'}
              {' '}<span className="text-amber-400/80 animate-subtle-blink">vs</span>{' '}
              {game.blackPlayer?.username ?? '?'}
            </span>
          </div>

          {/* Clocks */}
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-mono ${turn === 'white' && !isEnded ? 'text-white' : 'text-white/35'}`}>
              {formatTime(game.whiteTimeRemaining)}
            </span>
            <span className="text-[8px] text-white/15 font-mono">/</span>
            <span className={`text-[10px] font-mono ${turn === 'black' && !isEnded ? 'text-white' : 'text-white/35'}`}>
              {formatTime(game.blackTimeRemaining)}
            </span>
          </div>

          {/* Spectator count */}
          {game.spectatorCount > 0 && (
            <p className="text-[9px] font-mono text-white/25">
              {game.spectatorCount} watching
            </p>
          )}
        </div>
      </button>

      {/* Remove button — appears on hover */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-black border border-white/30 text-white/50 hover:text-white hover:border-white text-[10px] font-mono leading-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        title="Stop watching"
      >
        x
      </button>
    </div>
  );
}

/**
 * Tiny 4x4 representation of the board — shows occupied squares as dots.
 * Each cell covers a 2x2 area of the real board.
 */
function MiniBoard({ fen }: { fen: string }) {
  const rows = fen.split(' ')[0].split('/');

  // Parse into 8x8 grid of booleans (has piece or not) and color
  const grid: ({ color: 'w' | 'b' } | null)[][] = [];
  for (const row of rows) {
    const gridRow: ({ color: 'w' | 'b' } | null)[] = [];
    for (const char of row) {
      if (/\d/.test(char)) {
        for (let i = 0; i < parseInt(char); i++) gridRow.push(null);
      } else {
        gridRow.push({ color: char === char.toUpperCase() ? 'w' : 'b' });
      }
    }
    grid.push(gridRow);
  }

  // Reduce to 4x4 by sampling each 2x2 block
  const mini: ({ color: 'w' | 'b' } | null)[][] = [];
  for (let r = 0; r < 8; r += 2) {
    const miniRow: ({ color: 'w' | 'b' } | null)[] = [];
    for (let c = 0; c < 8; c += 2) {
      // Pick the most prominent piece in this 2x2 block
      const cells = [grid[r]?.[c], grid[r]?.[c + 1], grid[r + 1]?.[c], grid[r + 1]?.[c + 1]];
      const piece = cells.find((cell) => cell !== null) ?? null;
      miniRow.push(piece);
    }
    mini.push(miniRow);
  }

  return (
    <div className="w-full h-full grid grid-cols-4 grid-rows-4 gap-0 p-0.5">
      {mini.map((row, r) =>
        row.map((cell, c) => (
          <div
            key={`${r}-${c}`}
            className="flex items-center justify-center"
          >
            {cell && (
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  cell.color === 'w' ? 'bg-white' : 'bg-white/40'
                }`}
              />
            )}
          </div>
        ))
      )}
    </div>
  );
}
