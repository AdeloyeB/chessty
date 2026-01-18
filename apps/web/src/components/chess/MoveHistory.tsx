'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/game';

export function MoveHistory() {
  const { moves } = useGameStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves]);

  // Group moves into pairs (white, black)
  const movePairs: { number: number; white?: string; black?: string }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i]?.san,
      black: moves[i + 1]?.san,
    });
  }

  return (
    <div className="card h-full">
      <p className="text-xs font-mono text-mid-light mb-4">move_history</p>

      {moves.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-mid-light font-mono">no moves yet</p>
          <p className="text-xs text-mid font-mono mt-2">game will start when both players are ready</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="max-h-80 overflow-y-auto space-y-1 font-mono text-sm"
        >
          {movePairs.map((pair) => (
            <div
              key={pair.number}
              className="flex items-center gap-3"
            >
              <span className="w-6 text-mid">{pair.number}.</span>
              <span className="w-14 text-pure-white">{pair.white || '...'}</span>
              <span className="w-14 text-mid-light">{pair.black || ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
