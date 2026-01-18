'use client';

import { useEffect, useRef } from 'react';
import type { Move } from '@chess-game/shared';

interface MoveListProps {
  moves: Move[];
  currentMoveIndex: number;
  onMoveClick: (index: number) => void;
}

export function MoveList({ moves, currentMoveIndex, onMoveClick }: MoveListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentMoveRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to current move
  useEffect(() => {
    if (currentMoveRef.current && containerRef.current) {
      const container = containerRef.current;
      const element = currentMoveRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentMoveIndex]);

  if (moves.length === 0) {
    return (
      <div className="text-center text-mid-light font-mono text-sm py-8">
        No moves recorded
      </div>
    );
  }

  // Group moves into pairs (white + black)
  const movePairs: { number: number; white: Move | null; black: Move | null; whiteIndex: number; blackIndex: number }[] = [];

  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i] || null,
      black: moves[i + 1] || null,
      whiteIndex: i,
      blackIndex: i + 1,
    });
  }

  return (
    <div ref={containerRef} className="font-mono text-sm">
      {movePairs.map((pair) => (
        <div key={pair.number} className="flex items-center gap-2 py-1">
          <span className="w-8 text-mid-light text-right shrink-0">
            {pair.number}.
          </span>
          {pair.white && (
            <MoveButton
              ref={currentMoveIndex === pair.whiteIndex ? currentMoveRef : undefined}
              move={pair.white}
              isActive={currentMoveIndex === pair.whiteIndex}
              onClick={() => onMoveClick(pair.whiteIndex)}
            />
          )}
          {pair.black && (
            <MoveButton
              ref={currentMoveIndex === pair.blackIndex ? currentMoveRef : undefined}
              move={pair.black}
              isActive={currentMoveIndex === pair.blackIndex}
              onClick={() => onMoveClick(pair.blackIndex)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

interface MoveButtonProps {
  move: Move;
  isActive: boolean;
  onClick: () => void;
}

import { forwardRef } from 'react';

const MoveButton = forwardRef<HTMLButtonElement, MoveButtonProps>(
  function MoveButton({ move, isActive, onClick }, ref) {
    // Add symbols for special moves
    const formatMove = (san: string) => {
      // Add piece symbols if desired (optional)
      return san;
    };

    return (
      <button
        ref={ref}
        onClick={onClick}
        className={`w-16 px-2 py-0.5 text-left transition-colors ${
          isActive
            ? 'bg-pure-white text-pure-black'
            : 'text-pure-white hover:bg-mid/20'
        }`}
      >
        {formatMove(move.san)}
      </button>
    );
  }
);
