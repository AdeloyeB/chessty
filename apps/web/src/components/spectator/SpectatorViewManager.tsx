'use client';

import { useCallback } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { useMultiSpectatorStore } from '@/store/multiSpectator';
import { SpectatorSubNav } from './SpectatorSubNav';
import { SpectatorView } from './SpectatorView';
import { MultiGameGrid } from './MultiGameGrid';
import { DroppableContentArea } from './DroppableGridCell';
import { ActiveGamesLobby } from './ActiveGamesLobby';

/**
 * Top-level orchestrator for the multi-game spectator experience.
 *
 * Layout: left sidebar (game tiles) + right content area.
 * Wraps everything in a DndContext so tiles can be dragged from the sidebar
 * into the content area. Manages which view to show:
 *   - No games spectated → ActiveGamesLobby (game browser)
 *   - Single mode → Full SpectatorView for the focused game
 *   - Multi mode → MultiGameGrid with compact cards
 */
export function SpectatorViewManager() {
  const { games, viewMode, focusedGameId, addToGrid, setViewMode } = useMultiSpectatorStore();
  const gameCount = Object.keys(games).length;

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    // Only handle drops onto the content area
    if (!over || over.id !== 'content-area') return;

    // Extract the gameId from the draggable tile's data
    const gameId = (active.data.current as any)?.gameId;
    if (!gameId) return;

    // Add the game to the grid and switch to multi mode
    addToGrid(gameId);
    setViewMode('multi');
  }, [addToGrid, setViewMode]);

  // No games being spectated — show the lobby
  if (gameCount === 0) {
    return <ActiveGamesLobby />;
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left sidebar with draggable game tiles */}
        <SpectatorSubNav />

        {/* Content area — droppable zone */}
        <DroppableContentArea>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {viewMode === 'single' && focusedGameId ? (
              <SpectatorView gameId={focusedGameId} />
            ) : viewMode === 'multi' ? (
              <MultiGameGrid />
            ) : (
              // Fallback: show lobby if no focused game
              <ActiveGamesLobby />
            )}
          </div>
        </DroppableContentArea>
      </div>
    </DndContext>
  );
}
