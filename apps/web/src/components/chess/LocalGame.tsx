'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { ChessEngine, type Square, type Move, type PieceType } from '@chess-game/shared/chess';
import { ChessBoard } from './ChessBoard';
import { useAuthStore } from '@/store/auth';
import { nanoid } from 'nanoid';

const PIECE_VALUES: Record<PieceType, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

function calculateScore(game: ChessEngine, color: 'w' | 'b'): number {
  const board = game.board();
  let score = 0;
  for (const row of board) {
    for (const piece of row) {
      if (piece && piece.color === color) {
        score += PIECE_VALUES[piece.type] || 0;
      }
    }
  }
  return score;
}

function getCapturedPieces(game: ChessEngine, color: 'w' | 'b'): string[] {
  const startingPieces = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const currentPieces: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };

  const board = game.board();
  for (const row of board) {
    for (const piece of row) {
      if (piece && piece.color === color) {
        currentPieces[piece.type] = (currentPieces[piece.type] || 0) + 1;
      }
    }
  }

  const captured: string[] = [];
  const symbols = color === 'w'
    ? { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' }
    : { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' };

  for (const [type, count] of Object.entries(startingPieces)) {
    const diff = count - (currentPieces[type] || 0);
    for (let i = 0; i < diff; i++) {
      captured.push(symbols[type as keyof typeof symbols]);
    }
  }

  return captured;
}

export function LocalGame() {
  const { user } = useAuthStore();
  const [game, setGame] = useState(() => new ChessEngine());
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [promotionMove, setPromotionMove] = useState<{ from: Square; to: Square } | null>(null);
  const [sessionId] = useState(() => nanoid(8));
  const [sessionStart] = useState(() => new Date());
  const [elapsedTime, setElapsedTime] = useState(0);

  const playerName = user?.username || 'Player';
  const currentTurn = game.turn() === 'w' ? 'white' : 'black';
  const isGameOver = game.isGameOver();

  const whiteScore = useMemo(() => calculateScore(game, 'w'), [game]);
  const blackScore = useMemo(() => calculateScore(game, 'b'), [game]);
  const whiteCaptured = useMemo(() => getCapturedPieces(game, 'b'), [game]);
  const blackCaptured = useMemo(() => getCapturedPieces(game, 'w'), [game]);
  const scoreDiff = whiteScore - blackScore;

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - sessionStart.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStart]);

  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const legalMoves = useMemo(() => {
    if (!selectedSquare) return [];
    return game.moves({ square: selectedSquare, verbose: true }) as Move[];
  }, [game, selectedSquare]);

  const legalMoveSquares = useMemo(() => legalMoves.map(m => m.to), [legalMoves]);

  const isPromotion = useCallback(
    (from: Square, to: Square): boolean => {
      const piece = game.get(from);
      if (!piece || piece.type !== 'p') return false;
      const toRank = to[1];
      return (piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1');
    },
    [game]
  );

  const makeMove = useCallback(
    (from: Square, to: Square, promotion?: string) => {
      const move = game.move({ from, to, promotion });
      if (move) {
        const newGame = new ChessEngine(game.fen());
        setGame(newGame);
        setMoveHistory((prev) => [...prev, move.san]);
        setLastMove({ from, to });
        setSelectedSquare(null);
        return true;
      }
      return false;
    },
    [game]
  );

  const onSquareClick = useCallback(
    (square: Square) => {
      if (isGameOver) return;

      if (selectedSquare) {
        const move = legalMoves.find((m) => m.to === square);
        if (move) {
          if (isPromotion(selectedSquare, square)) {
            setPromotionMove({ from: selectedSquare, to: square });
          } else {
            makeMove(selectedSquare, square);
          }
        } else {
          const piece = game.get(square);
          if (piece && piece.color === game.turn()) {
            setSelectedSquare(square);
          } else {
            setSelectedSquare(null);
          }
        }
        return;
      }

      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
      }
    },
    [game, selectedSquare, legalMoves, isPromotion, makeMove, isGameOver]
  );

  const onDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square): boolean => {
      if (isGameOver) return false;
      const piece = game.get(sourceSquare);
      if (!piece || piece.color !== game.turn()) return false;

      if (isPromotion(sourceSquare, targetSquare)) {
        setPromotionMove({ from: sourceSquare, to: targetSquare });
        return false;
      }

      return makeMove(sourceSquare, targetSquare);
    },
    [game, isPromotion, makeMove, isGameOver]
  );

  const onPromotionSelect = (pieceType: string) => {
    if (promotionMove) {
      makeMove(promotionMove.from, promotionMove.to, pieceType);
      setPromotionMove(null);
    }
  };

  const checkSquare = useMemo(() => {
    if (!game.isCheck()) return null;
    const board = game.board();
    for (const row of board) {
      for (const piece of row) {
        if (piece && piece.type === 'k' && piece.color === game.turn()) {
          return piece.square || null;
        }
      }
    }
    return null;
  }, [game]);

  const resetGame = () => {
    setGame(new ChessEngine());
    setMoveHistory([]);
    setSelectedSquare(null);
    setLastMove(null);
  };

  const undoMove = () => {
    const move = game.undo();
    if (move) {
      setGame(new ChessEngine(game.fen()));
      setMoveHistory((prev) => prev.slice(0, -1));
      setSelectedSquare(null);
      const history = game.history();
      if (history.length > 0) {
        const lastHistoryMove = history[history.length - 1];
        setLastMove({ from: lastHistoryMove.from, to: lastHistoryMove.to });
      } else {
        setLastMove(null);
      }
    }
  };

  const getStatusMessage = () => {
    if (game.isCheckmate()) return `CHECKMATE — ${game.turn() === 'w' ? 'BLACK' : 'WHITE'} WINS`;
    if (game.isStalemate()) return 'STALEMATE';
    if (game.isDraw()) return 'DRAW';
    if (game.isCheck()) return `${currentTurn.toUpperCase()} IN CHECK`;
    return `${currentTurn.toUpperCase()} TO MOVE`;
  };

  const movePairs: { number: number; white?: string; black?: string }[] = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: moveHistory[i],
      black: moveHistory[i + 1],
    });
  }

  return (
    <div className="h-full bg-black flex flex-col overflow-hidden">
      {/* Content Row: Sidebar + Board */}
      <div className="flex-1 flex min-h-0">
      {/* Left Sidebar - Compact */}
      <div className="w-56 border-r border-[#666666]/30 flex flex-col bg-black">
        {/* Header */}
        <div className="px-3 py-2 border-b border-[#666666]/30 flex items-center gap-2">
          <span className="text-white">♔</span>
          <span className="text-xs font-mono text-[#888888] uppercase tracking-wider">Practice</span>
        </div>

        {/* Stats */}
        <div className="px-3 py-2 border-b border-[#666666]/30 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 p-2 bg-[#0a0a0a] rounded text-center">
              <div className="text-lg font-mono text-white">{moveHistory.length}</div>
              <div className="text-[10px] text-[#666666] uppercase">Moves</div>
            </div>
            <div className="flex-1 p-2 bg-[#0a0a0a] rounded text-center">
              <div className="text-lg font-mono text-[#cccccc]">{formatElapsed(elapsedTime)}</div>
              <div className="text-[10px] text-[#666666] uppercase">Time</div>
            </div>
          </div>

          {/* Material */}
          <div className="flex items-center justify-between text-xs font-mono px-1">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-white rounded-sm" />
              <span className="text-[#cccccc]">{whiteScore}</span>
            </div>
            <span className={`text-xs ${scoreDiff > 0 ? 'text-white' : scoreDiff < 0 ? 'text-red-400' : 'text-[#666666]'}`}>
              {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff < 0 ? `${scoreDiff}` : '='}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[#cccccc]">{blackScore}</span>
              <span className="w-2 h-2 bg-[#3b82f6] rounded-sm" />
            </div>
          </div>
        </div>

        {/* Move History */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-3 py-1 text-[10px] text-[#666666] uppercase tracking-wider">History</div>
          <div className="flex-1 overflow-y-auto px-3 pb-2">
            {moveHistory.length === 0 ? (
              <div className="text-xs text-[#666666]/70 text-center py-4">No moves yet</div>
            ) : (
              <div className="space-y-0.5 font-mono text-xs">
                {movePairs.map((pair) => (
                  <div key={pair.number} className="flex items-center hover:bg-white/5 rounded px-1">
                    <span className="w-5 text-[#666666]">{pair.number}.</span>
                    <span className="w-12 text-[#cccccc]">{pair.white || '...'}</span>
                    <span className="w-12 text-[#888888]">{pair.black || ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-2 border-t border-[#666666]/30 space-y-1">
          <button
            onClick={undoMove}
            disabled={moveHistory.length === 0}
            className="w-full px-2 py-1.5 text-xs font-mono bg-[#0a0a0a] border border-[#666666]/50 text-[#888888] rounded hover:border-white hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            ← Undo
          </button>
          <button
            onClick={resetGame}
            className="w-full px-2 py-1.5 text-xs font-mono bg-[#0a0a0a] border border-[#666666]/50 text-[#888888] rounded hover:border-white hover:text-white transition-all"
          >
            ↺ New Game
          </button>
        </div>
      </div>

      {/* Main Board Area - Maximized */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top Player Bar - Minimal */}
        <div className="h-10 px-4 border-b border-[#666666]/30 flex items-center justify-between bg-black">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-[#3b82f6] rounded-sm" />
            <span className="text-sm font-medium text-[#cccccc]">{playerName}</span>
            {blackCaptured.length > 0 && (
              <span className="text-xs text-[#666666]">{blackCaptured.join(' ')}</span>
            )}
          </div>
          <div className={`px-2 py-0.5 text-xs font-mono rounded ${
            game.turn() === 'b' ? 'bg-white/10 text-white' : 'text-[#666666]'
          }`}>
            {game.turn() === 'b' ? '● TURN' : '○'}
          </div>
        </div>

        {/* Chess Board - fills the entire game area */}
        <div className="flex-1 min-h-0">
          <ChessBoard
            position={game.fen()}
            onSquareClick={onSquareClick}
            onPieceDrop={onDrop}
            selectedSquare={selectedSquare}
            legalMoves={legalMoveSquares}
            lastMove={lastMove}
            checkSquare={checkSquare}
            orientation="white"
          />
        </div>

        {/* Bottom Player Bar - Minimal */}
        <div className="h-10 px-4 border-t border-[#666666]/30 flex items-center justify-between bg-black">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-white rounded-sm" />
            <span className="text-sm font-medium text-[#cccccc]">{playerName}</span>
            {whiteCaptured.length > 0 && (
              <span className="text-xs text-[#666666]">{whiteCaptured.join(' ')}</span>
            )}
          </div>
          <div className={`px-2 py-0.5 text-xs font-mono rounded ${
            game.turn() === 'w' ? 'bg-white/10 text-white' : 'text-[#666666]'
          }`}>
            {game.turn() === 'w' ? '● TURN' : '○'}
          </div>
        </div>
      </div>

      </div>{/* end content row */}

      {/* Status Bar - Bottom (normal flow, not absolute) */}
      <div className="h-6 shrink-0 border-t border-[#666666]/30 bg-[#0a0a0a] flex items-center px-3 gap-4 text-[10px] font-mono text-[#666666]">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isGameOver ? 'bg-[#666666]' : 'bg-white animate-pulse'}`} />
          <span className="text-[#888888]">{getStatusMessage()}</span>
        </div>
        <span className="text-[#666666]/50">|</span>
        <span>Session: {sessionId}</span>
        <span>Moves: {moveHistory.length}</span>
        <span className="ml-auto text-[#666666]/70 truncate max-w-48">FEN: {game.fen().slice(0, 30)}...</span>
      </div>

      {/* Promotion Dialog */}
      {promotionMove && (
        <div className="fixed inset-0 bg-[#0a0a0a]/90 flex items-center justify-center z-50">
          <div className="bg-black border border-[#666666]/30 rounded-lg p-4 shadow-2xl">
            <p className="text-xs font-mono text-[#888888] mb-3 text-center uppercase tracking-wider">
              Select Promotion
            </p>
            <div className="flex gap-2 mb-3">
              {[
                { key: 'q', symbol: game.turn() === 'w' ? '♕' : '♛' },
                { key: 'r', symbol: game.turn() === 'w' ? '♖' : '♜' },
                { key: 'b', symbol: game.turn() === 'w' ? '♗' : '♝' },
                { key: 'n', symbol: game.turn() === 'w' ? '♘' : '♞' },
              ].map((piece) => (
                <button
                  key={piece.key}
                  onClick={() => onPromotionSelect(piece.key)}
                  className="w-14 h-14 bg-[#0a0a0a] border border-[#666666]/50 rounded hover:border-white hover:bg-[#141414] transition-all"
                >
                  <span className="text-4xl">{piece.symbol}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPromotionMove(null)}
              className="w-full px-3 py-1.5 text-xs font-mono text-[#888888] hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
