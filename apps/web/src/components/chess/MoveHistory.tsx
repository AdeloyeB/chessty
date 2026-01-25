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
    <div className="bg-black h-full flex flex-col">
      <div className="px-3 py-2 border-b border-white/15">
        <p className="text-xs font-mono text-white/50 lowercase">move_history</p>
      </div>

      {moves.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-white/30 font-mono lowercase">no moves yet</p>
            <p className="text-xs text-white/20 font-mono mt-2 lowercase">game will start when both players are ready</p>
          </div>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-2"
        >
          <div className="space-y-0.5 font-mono text-sm">
            {movePairs.map((pair) => (
              <div
                key={pair.number}
                className="flex items-center hover:bg-white/5 px-1"
              >
                <span className="w-6 text-white/30">{pair.number}.</span>
                <span className="w-14 text-white/70">{pair.white || '...'}</span>
                <span className="w-14 text-white/50">{pair.black || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
