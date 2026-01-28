'use client';

import { useMultiSpectatorStore } from '@/store/multiSpectator';
import { useWebSocket } from '@/hooks/useWebSocket';
import { DraggableGameTile } from './DraggableGameTile';

/**
 * Left sidebar that appears when spectating games.
 * Shows a vertical stack of horizontal game tiles — one per spectated game.
 *
 * - Click a tile → switches to single-game focus view
 * - Drag a tile into the content area → adds to multi-game grid
 * - X button on tile → stops spectating that game
 * - "leave all" button → exits all spectated games
 */
export function SpectatorSubNav() {
  const { games, focusedGameId, gridGameIds, viewMode } = useMultiSpectatorStore();
  const { stopSpectatingGame, stopAllSpectating } = useWebSocket();
  const setFocusedGame = useMultiSpectatorStore((s) => s.setFocusedGame);
  const setViewMode = useMultiSpectatorStore((s) => s.setViewMode);

  const gameList = Object.values(games);

  if (gameList.length === 0) return null;

  return (
    <div className="w-56 flex-shrink-0 border-r border-white/15 bg-black flex flex-col h-full overflow-hidden">
      {/* Label */}
      <div className="px-3 pt-4 pb-2">
        <span className="text-xs font-mono text-white/30 lowercase">
          watching
        </span>
      </div>

      {/* Game tiles — vertical stack, scrollable */}
      <div className="flex-1 overflow-y-auto px-3 space-y-2">
        {gameList.map((game) => (
          <DraggableGameTile
            key={game.gameId}
            game={game}
            isActive={viewMode === 'single' && focusedGameId === game.gameId}
            isInGrid={gridGameIds.includes(game.gameId)}
            onClick={() => setFocusedGame(game.gameId)}
            onRemove={() => stopSpectatingGame(game.gameId)}
          />
        ))}
      </div>

      {/* Controls — pinned to bottom */}
      <div className="px-3 py-3 border-t border-white/10 space-y-2">
        {/* View mode toggle */}
        {gameList.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewMode('single')}
              className={`flex-1 px-2 py-1 text-xs font-mono border transition-colors ${
                viewMode === 'single'
                  ? 'border-white text-white bg-white/10'
                  : 'border-white/15 text-white/40 hover:text-white/70'
              }`}
              title="Single game view"
            >
              1
            </button>
            <button
              type="button"
              onClick={() => {
                // When switching to multi mode, add all games to grid
                const store = useMultiSpectatorStore.getState();
                const allIds = Object.keys(store.games);
                for (const id of allIds) {
                  if (!store.gridGameIds.includes(id)) {
                    store.addToGrid(id);
                  }
                }
                setViewMode('multi');
              }}
              className={`flex-1 px-2 py-1 text-xs font-mono border transition-colors ${
                viewMode === 'multi'
                  ? 'border-white text-white bg-white/10'
                  : 'border-white/15 text-white/40 hover:text-white/70'
              }`}
              title="Multi-game grid view"
            >
              grid
            </button>
          </div>
        )}

        {/* Leave all */}
        <button
          type="button"
          onClick={stopAllSpectating}
          className="w-full px-3 py-1.5 text-xs font-mono border border-white/15 text-white/40 hover:text-white hover:border-white transition-colors lowercase"
        >
          leave_all
        </button>
      </div>
    </div>
  );
}
