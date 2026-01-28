'use client';

import { useEffect, useRef, forwardRef } from 'react';
import type { AnalyzedMove, MoveClassification } from '@chess-game/shared';

// ---------------------------------------------------------------------------
// WHAT IS THIS COMPONENT?
// ---------------------------------------------------------------------------
// AnalyzedMoveList displays a game's moves alongside engine analysis.
// Each move shows:
// 1. The move number and notation (e.g., "1. e4 e5")
// 2. A classification icon showing how good/bad the move was
// 3. The evaluation score after that move
//
// Users can click any move to jump to that position on the board.
// The current move is highlighted so you know where you are in the game.
// ---------------------------------------------------------------------------

interface AnalyzedMoveListProps {
  /** Array of moves with their analysis data */
  moves: AnalyzedMove[];
  /** Index of the currently displayed move (for highlighting) */
  currentIndex: number;
  /** Callback when user clicks a move to navigate */
  onMoveClick: (index: number) => void;
}

// ---------------------------------------------------------------------------
// CLASSIFICATION DISPLAY CONFIG
// ---------------------------------------------------------------------------
// Maps each move classification to its display icon and color.
// These match chess.com/lichess conventions so users recognize them.
// ---------------------------------------------------------------------------

type ClassificationConfig = {
  icon: string;
  color: string;
  label: string;
};

const CLASSIFICATION_CONFIG: Record<MoveClassification, ClassificationConfig> = {
  brilliant: {
    icon: '★',
    color: 'text-cyan-400',
    label: 'Brilliant move - exceptional, hard to find',
  },
  great: {
    icon: '⭐',
    color: 'text-green-400',
    label: 'Great move - significantly improved position',
  },
  best: {
    icon: '✓',
    color: 'text-green-400',
    label: 'Best move - the engine\'s top choice',
  },
  excellent: {
    icon: '●',
    color: 'text-green-300',
    label: 'Excellent move - nearly as good as the best',
  },
  good: {
    icon: '○',
    color: 'text-light',
    label: 'Good move - a reasonable choice',
  },
  book: {
    icon: '📖',
    color: 'text-mid-light',
    label: 'Book move - standard opening theory',
  },
  inaccuracy: {
    icon: '?!',
    color: 'text-yellow-400',
    label: 'Inaccuracy - slightly worse than the best',
  },
  mistake: {
    icon: '?',
    color: 'text-orange-400',
    label: 'Mistake - a notable error',
  },
  blunder: {
    icon: '??',
    color: 'text-red-400',
    label: 'Blunder - a serious error',
  },
};

// ---------------------------------------------------------------------------
// HELPER: Format Evaluation Score
// ---------------------------------------------------------------------------
// Converts centipawn scores to human-readable format.
// +150 centipawns = +1.5 (white is ahead by 1.5 pawns)
// Mate scores show "M3" for mate in 3 moves.
// ---------------------------------------------------------------------------

function formatEval(move: AnalyzedMove): string {
  const { evaluation } = move;

  // If there's a forced mate, show "M" + number of moves
  if (evaluation.scoreMate !== null) {
    const mateIn = evaluation.scoreMate;
    return mateIn > 0 ? `M${mateIn}` : `M${Math.abs(mateIn)}`;
  }

  // Convert centipawns to pawns (e.g., 150 → +1.5)
  const score = evaluation.scoreCp / 100;
  const sign = score >= 0 ? '+' : '';
  return `${sign}${score.toFixed(1)}`;
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

export function AnalyzedMoveList({
  moves,
  currentIndex,
  onMoveClick,
}: AnalyzedMoveListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentMoveRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to keep the current move visible
  // This is important when navigating with keyboard shortcuts
  useEffect(() => {
    if (currentMoveRef.current && containerRef.current) {
      const container = containerRef.current;
      const element = currentMoveRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      // Only scroll if the element is outside the visible area
      if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentIndex]);

  // Empty state
  if (moves.length === 0) {
    return (
      <div className="text-center text-mid-light font-mono text-sm py-8">
        no moves to display
      </div>
    );
  }

  // Group moves into pairs (white move + black move per row)
  // This is standard chess notation: "1. e4 e5  2. Nf3 Nc6"
  const movePairs: {
    number: number;
    white: AnalyzedMove | null;
    black: AnalyzedMove | null;
    whiteIndex: number;
    blackIndex: number;
  }[] = [];

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
    <div ref={containerRef} className="font-mono text-sm overflow-y-auto">
      {movePairs.map((pair) => (
        <div
          key={pair.number}
          className="flex items-center gap-1 py-0.5 border-b border-mid/10 last:border-b-0"
        >
          {/* Move number */}
          <span className="w-8 text-mid-light text-right shrink-0 pr-1">
            {pair.number}.
          </span>

          {/* White's move */}
          {pair.white && (
            <AnalyzedMoveButton
              ref={currentIndex === pair.whiteIndex ? currentMoveRef : undefined}
              move={pair.white}
              isActive={currentIndex === pair.whiteIndex}
              onClick={() => onMoveClick(pair.whiteIndex)}
            />
          )}

          {/* Black's move */}
          {pair.black && (
            <AnalyzedMoveButton
              ref={currentIndex === pair.blackIndex ? currentMoveRef : undefined}
              move={pair.black}
              isActive={currentIndex === pair.blackIndex}
              onClick={() => onMoveClick(pair.blackIndex)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MOVE BUTTON COMPONENT
// ---------------------------------------------------------------------------
// Individual clickable move with classification icon and eval score.
// Using forwardRef so the parent can scroll this element into view.
// ---------------------------------------------------------------------------

interface AnalyzedMoveButtonProps {
  move: AnalyzedMove;
  isActive: boolean;
  onClick: () => void;
}

const AnalyzedMoveButton = forwardRef<HTMLButtonElement, AnalyzedMoveButtonProps>(
  function AnalyzedMoveButton({ move, isActive, onClick }, ref) {
    const config = CLASSIFICATION_CONFIG[move.classification];

    return (
      <button
        ref={ref}
        onClick={onClick}
        title={config.label}
        className={`flex items-center gap-1 px-2 py-0.5 min-w-[100px] text-left transition-colors ${
          isActive
            ? 'bg-pure-white/10 text-pure-white'
            : 'text-pure-white hover:bg-mid/20'
        }`}
      >
        {/* Classification icon */}
        <span className={`w-5 text-center shrink-0 ${config.color}`}>
          {config.icon}
        </span>

        {/* Move notation (e.g., "Nf3", "O-O") */}
        <span className="flex-1">{move.san}</span>

        {/* Evaluation score */}
        <span className="text-xs text-mid-light shrink-0">
          {formatEval(move)}
        </span>
      </button>
    );
  }
);
