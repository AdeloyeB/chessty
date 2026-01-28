'use client';

import { useMultiSpectatorStore } from '@/store/multiSpectator';
import { CompactSpectatorCard } from './CompactSpectatorCard';

/**
 * Adaptive grid layout for concurrent multi-game spectating.
 *
 * Layouts by game count:
 *   1: Centered single card
 *   2: Two columns
 *   3: Three columns
 *   4: 2x2 grid
 *   5: Top row 3 + bottom row 2
 *
 * Each card is capped at max-w-sm (~384px) to match the original
 * SpectatorView board size.
 */
export function MultiGameGrid() {
  const { gridGameIds } = useMultiSpectatorStore();
  const setFocusedGame = useMultiSpectatorStore((s) => s.setFocusedGame);
  const setViewMode = useMultiSpectatorStore((s) => s.setViewMode);

  const count = gridGameIds.length;

  if (count === 0) {
    return (
      <div className="border border-white/15 bg-black text-center py-12">
        <p className="text-white/50 font-mono mb-2 lowercase">no games in grid</p>
        <p className="text-xs text-white/30 font-mono lowercase">
          drag game tiles from the sub-nav into this area, or click "grid" to view all
        </p>
      </div>
    );
  }

  const handleExpand = (gameId: string) => {
    setFocusedGame(gameId);
    setViewMode('single');
  };

  // 1 game: centered single card
  if (count === 1) {
    return (
      <div className="flex justify-center">
        <CompactSpectatorCard
          gameId={gridGameIds[0]}
          onExpand={() => handleExpand(gridGameIds[0])}
        />
      </div>
    );
  }

  // 2 games: two columns
  if (count === 2) {
    return (
      <div className="grid grid-cols-2 gap-4 justify-items-center">
        {gridGameIds.map((id) => (
          <CompactSpectatorCard
            key={id}
            gameId={id}
            onExpand={() => handleExpand(id)}
          />
        ))}
      </div>
    );
  }

  // 3 games: three columns
  if (count === 3) {
    return (
      <div className="grid grid-cols-3 gap-4 justify-items-center">
        {gridGameIds.map((id) => (
          <CompactSpectatorCard
            key={id}
            gameId={id}
            onExpand={() => handleExpand(id)}
          />
        ))}
      </div>
    );
  }

  // 4 games: 2x2 grid
  if (count === 4) {
    return (
      <div className="grid grid-cols-2 gap-4 justify-items-center">
        {gridGameIds.map((id) => (
          <CompactSpectatorCard
            key={id}
            gameId={id}
            onExpand={() => handleExpand(id)}
          />
        ))}
      </div>
    );
  }

  // 5 games: top row 3 + bottom row 2
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 justify-items-center">
        {gridGameIds.slice(0, 3).map((id) => (
          <CompactSpectatorCard
            key={id}
            gameId={id}
            onExpand={() => handleExpand(id)}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 justify-items-center max-w-[66%] mx-auto">
        {gridGameIds.slice(3, 5).map((id) => (
          <CompactSpectatorCard
            key={id}
            gameId={id}
            onExpand={() => handleExpand(id)}
          />
        ))}
      </div>
    </div>
  );
}
