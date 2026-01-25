'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { Square, Piece, PieceType, Color } from '@chess-game/shared/chess';

// Outline-only piece SVGs
// White pieces: white stroke, no fill
// Black pieces: blue stroke, no fill
const PIECE_SVGS: Record<Color, Record<PieceType, (props: { size: number }) => React.JSX.Element>> = {
  w: {
    k: ({ size }) => (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 11.63V6M20 8h5"/>
          <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/>
          <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"/>
          <path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/>
        </g>
      </svg>
    ),
    q: ({ size }) => (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill="none" stroke="#ffffff" strokeWidth="2" strokeLinejoin="round">
          <circle cx="6" cy="12" r="2.5"/>
          <circle cx="14" cy="9" r="2.5"/>
          <circle cx="22.5" cy="8" r="2.5"/>
          <circle cx="31" cy="9" r="2.5"/>
          <circle cx="39" cy="12" r="2.5"/>
          <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L6 14l3 12z" strokeLinecap="butt"/>
          <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" strokeLinecap="butt"/>
          <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0"/>
        </g>
      </svg>
    ),
    r: ({ size }) => (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 39h27v-3H9v3zm3-3v-4h21v4H12zm-1-22V9h4v2h5V9h5v2h5V9h4v5"/>
          <path d="M34 14l-3 3H14l-3-3"/>
          <path d="M31 17v12.5H14V17"/>
          <path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/>
          <path d="M11 14h23"/>
        </g>
      </svg>
    ),
    b: ({ size }) => (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.46 3-2 3-2z"/>
          <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/>
          <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/>
          <path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"/>
        </g>
      </svg>
    ),
    n: ({ size }) => (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/>
          <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/>
          <circle cx="9" cy="25.5" r="0.5" fill="#ffffff"/>
          <ellipse cx="14.7" cy="15.8" rx="0.5" ry="1.5" transform="rotate(30 14.7 15.8)" fill="#ffffff"/>
        </g>
      </svg>
    ),
    p: ({ size }) => (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  b: {
    k: ({ size }) => (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 11.63V6M20 8h5"/>
          <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/>
          <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"/>
          <path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/>
        </g>
      </svg>
    ),
    q: ({ size }) => (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round">
          <circle cx="6" cy="12" r="2.5"/>
          <circle cx="14" cy="9" r="2.5"/>
          <circle cx="22.5" cy="8" r="2.5"/>
          <circle cx="31" cy="9" r="2.5"/>
          <circle cx="39" cy="12" r="2.5"/>
          <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L6 14l3 12z" strokeLinecap="butt"/>
          <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" strokeLinecap="butt"/>
          <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0"/>
        </g>
      </svg>
    ),
    r: ({ size }) => (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 39h27v-3H9v3zm3-3v-4h21v4H12zm-1-22V9h4v2h5V9h5v2h5V9h4v5"/>
          <path d="M34 14l-3 3H14l-3-3"/>
          <path d="M31 17v12.5H14V17"/>
          <path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/>
          <path d="M11 14h23"/>
        </g>
      </svg>
    ),
    b: ({ size }) => (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.46 3-2 3-2z"/>
          <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/>
          <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/>
          <path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"/>
        </g>
      </svg>
    ),
    n: ({ size }) => (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <g fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/>
          <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"/>
          <circle cx="9" cy="25.5" r="0.5" fill="#3b82f6"/>
          <ellipse cx="14.7" cy="15.8" rx="0.5" ry="1.5" transform="rotate(30 14.7 15.8)" fill="#3b82f6"/>
        </g>
      </svg>
    ),
    p: ({ size }) => (
      <svg viewBox="0 0 45 45" width={size} height={size}>
        <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

interface ChessBoardProps {
  position: string;
  onSquareClick?: (square: Square) => void;
  onPieceDrop?: (from: Square, to: Square) => boolean;
  selectedSquare?: Square | null;
  legalMoves?: Square[];
  lastMove?: { from: Square; to: Square } | null;
  checkSquare?: Square | null;
  orientation?: 'white' | 'black';
}

export function ChessBoard({
  position,
  onSquareClick,
  onPieceDrop,
  selectedSquare,
  legalMoves = [],
  lastMove,
  checkSquare,
  orientation = 'white',
}: ChessBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(0);
  const [boardHeight, setBoardHeight] = useState(0);
  const [dragging, setDragging] = useState<{
    square: Square;
    piece: Piece;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Parse FEN to get board state
  const board = useMemo(() => {
    const boardState: (Piece | null)[][] = [];
    const fenParts = position.split(' ');
    const rows = fenParts[0].split('/');

    for (const row of rows) {
      const boardRow: (Piece | null)[] = [];
      for (const char of row) {
        if (/\d/.test(char)) {
          for (let i = 0; i < parseInt(char); i++) {
            boardRow.push(null);
          }
        } else {
          const color: Color = char === char.toUpperCase() ? 'w' : 'b';
          const type = char.toLowerCase() as PieceType;
          boardRow.push({ type, color });
        }
      }
      boardState.push(boardRow);
    }
    return boardState;
  }, [position]);

  // Fill the entire container — the board IS the game area (rectangle, not square)
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setBoardWidth(Math.floor(rect.width));
      setBoardHeight(Math.floor(rect.height));
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  const cellWidth = boardWidth / 8;
  const cellHeight = boardHeight / 8;
  // Piece size uses the smaller cell dimension to keep pieces proportional
  const pieceSize = Math.min(cellWidth, cellHeight) * 0.88;

  const getSquareFromCoords = useCallback((row: number, col: number): Square => {
    const actualRow = orientation === 'white' ? row : 7 - row;
    const actualCol = orientation === 'white' ? col : 7 - col;
    return `${FILES[actualCol]}${RANKS[actualRow]}` as Square;
  }, [orientation]);

  const handleSquareClick = useCallback((row: number, col: number) => {
    if (!onSquareClick) return;
    const square = getSquareFromCoords(row, col);
    onSquareClick(square);
  }, [onSquareClick, getSquareFromCoords]);

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent, row: number, col: number, piece: Piece) => {
    e.preventDefault();
    const square = getSquareFromCoords(row, col);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    setDragging({
      square,
      piece,
      startX: clientX,
      startY: clientY,
      currentX: clientX,
      currentY: clientY,
    });
  }, [getSquareFromCoords]);

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragging(prev => prev ? { ...prev, currentX: clientX, currentY: clientY } : null);
  }, [dragging]);

  const handleDragEnd = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragging || !containerRef.current || !onPieceDrop) {
      setDragging(null);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
    const clientY = 'changedTouches' in e ? e.changedTouches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const col = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);

    if (row >= 0 && row < 8 && col >= 0 && col < 8) {
      const toSquare = getSquareFromCoords(row, col);
      if (toSquare !== dragging.square) {
        onPieceDrop(dragging.square, toSquare);
      }
    }

    setDragging(null);
  }, [dragging, cellWidth, cellHeight, onPieceDrop, getSquareFromCoords]);

  useEffect(() => {
    if (dragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      document.addEventListener('touchmove', handleDragMove);
      document.addEventListener('touchend', handleDragEnd);

      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchmove', handleDragMove);
        document.removeEventListener('touchend', handleDragEnd);
      };
    }
  }, [dragging, handleDragMove, handleDragEnd]);

  const renderSquare = (row: number, col: number) => {
    const square = getSquareFromCoords(row, col);
    const isLight = (row + col) % 2 === 0;
    const actualRow = orientation === 'white' ? row : 7 - row;
    const actualCol = orientation === 'white' ? col : 7 - col;
    const piece = board[actualRow]?.[actualCol];

    const isSelected = selectedSquare === square;
    const isLegalMove = legalMoves.includes(square);
    const isLastMoveSquare = lastMove && (lastMove.from === square || lastMove.to === square);
    const isCheckSquare = checkSquare === square;
    const isDragSource = dragging?.square === square;

    // All-black board — subtle contrast between light and dark squares
    const squareColorClass = isLight
      ? 'bg-[#141414]'  // Light squares: very slightly lighter black
      : 'bg-[#0a0a0a]'; // Dark squares: near-pure black

    const coordFontSize = Math.max(10, Math.min(cellWidth, cellHeight) * 0.2);

    return (
      <div
        key={square}
        className={`relative ${squareColorClass}`}
        onClick={() => handleSquareClick(row, col)}
      >
        {/* Last move highlight */}
        {isLastMoveSquare && (
          <div className="absolute inset-0 bg-blue-500/15" />
        )}

        {/* Selected square highlight */}
        {isSelected && (
          <div className="absolute inset-0 bg-blue-400/20 ring-1 ring-inset ring-blue-400/50" />
        )}

        {/* Check highlight */}
        {isCheckSquare && (
          <div className="absolute inset-0 bg-red-500/25 ring-1 ring-inset ring-red-400/60" />
        )}

        {/* Legal move indicator */}
        {isLegalMove && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {piece ? (
              <div className="absolute inset-[4px] rounded-full border-2 border-white/20" />
            ) : (
              <div
                className="rounded-full bg-white/15"
                style={{ width: Math.min(cellWidth, cellHeight) * 0.3, height: Math.min(cellWidth, cellHeight) * 0.3 }}
              />
            )}
          </div>
        )}

        {/* Piece */}
        {piece && !isDragSource && (
          <div
            className="absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => handleDragStart(e, row, col, piece)}
            onTouchStart={(e) => handleDragStart(e, row, col, piece)}
          >
            {PIECE_SVGS[piece.color][piece.type]({ size: pieceSize })}
          </div>
        )}

        {/* Rank coordinates (left edge) */}
        {col === 0 && (
          <span
            className="absolute left-[3px] top-[2px] font-semibold pointer-events-none select-none text-white/20"
            style={{ fontSize: coordFontSize }}
          >
            {orientation === 'white' ? RANKS[row] : RANKS[7 - row]}
          </span>
        )}

        {/* File coordinates (bottom edge) */}
        {row === 7 && (
          <span
            className="absolute right-[3px] bottom-[2px] font-semibold pointer-events-none select-none text-white/20"
            style={{ fontSize: coordFontSize }}
          >
            {orientation === 'white' ? FILES[col] : FILES[7 - col]}
          </span>
        )}
      </div>
    );
  };

  // Render dragging piece
  const renderDragPiece = () => {
    if (!dragging || !containerRef.current) return null;

    const rect = containerRef.current.getBoundingClientRect();
    const x = dragging.currentX - rect.left - pieceSize / 2;
    const y = dragging.currentY - rect.top - pieceSize / 2;

    return (
      <div
        className="fixed pointer-events-none z-50"
        style={{
          left: rect.left + x,
          top: rect.top + y,
          width: pieceSize,
          height: pieceSize,
          transform: 'scale(1.1)',
        }}
      >
        {PIECE_SVGS[dragging.piece.color][dragging.piece.type]({ size: pieceSize })}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full select-none bg-[#0a0a0a] relative"
    >
      {boardWidth > 0 && boardHeight > 0 && (
        <div
          className="grid grid-cols-8 grid-rows-8 absolute inset-0"
        >
          {Array.from({ length: 8 }, (_, row) =>
            Array.from({ length: 8 }, (_, col) => renderSquare(row, col))
          )}
        </div>
      )}
      {renderDragPiece()}
    </div>
  );
}

export default ChessBoard;
