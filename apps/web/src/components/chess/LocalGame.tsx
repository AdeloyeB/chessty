'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useAuthStore } from '@/store/auth';
import { nanoid } from 'nanoid';

// Piece values for scoring
const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

function calculateScore(game: Chess, color: 'w' | 'b'): number {
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

function getCapturedPieces(game: Chess, color: 'w' | 'b'): string[] {
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
  const [game, setGame] = useState(new Chess());
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [promotionMove, setPromotionMove] = useState<{ from: Square; to: Square } | null>(null);
  const [sessionId] = useState(() => nanoid(8));
  const [sessionStart] = useState(() => new Date());
  const [elapsedTime, setElapsedTime] = useState(0);

  const playerName = user?.username || 'player';
  const currentTurn = game.turn() === 'w' ? 'white' : 'black';
  const isGameOver = game.isGameOver();

  const whiteScore = useMemo(() => calculateScore(game, 'w'), [game]);
  const blackScore = useMemo(() => calculateScore(game, 'b'), [game]);
  const whiteCaptured = useMemo(() => getCapturedPieces(game, 'b'), [game]);
  const blackCaptured = useMemo(() => getCapturedPieces(game, 'w'), [game]);
  const scoreDiff = whiteScore - blackScore;

  // Session timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - sessionStart.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStart]);

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const legalMoves = useMemo(() => {
    if (!selectedSquare) return [];
    return game.moves({ square: selectedSquare, verbose: true });
  }, [game, selectedSquare]);

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
      try {
        const move = game.move({ from, to, promotion });
        if (move) {
          setGame(new Chess(game.fen()));
          setMoveHistory((prev) => [...prev, move.san]);
          setSelectedSquare(null);
          return true;
        }
      } catch {
        // Invalid move
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

      if (isPromotion(sourceSquare, targetSquare)) {
        setPromotionMove({ from: sourceSquare, to: targetSquare });
        return false;
      }

      return makeMove(sourceSquare, targetSquare);
    },
    [isPromotion, makeMove, isGameOver]
  );

  const onPromotionSelect = (piece: string) => {
    if (promotionMove) {
      makeMove(promotionMove.from, promotionMove.to, piece);
      setPromotionMove(null);
    }
  };

  const squareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: 'rgba(255, 255, 255, 0.3)' };
    }

    legalMoves.forEach((move) => {
      styles[move.to] = {
        background: game.get(move.to as Square)
          ? 'radial-gradient(circle, rgba(255, 255, 255, 0.4) 85%, transparent 85%)'
          : 'radial-gradient(circle, rgba(255, 255, 255, 0.3) 25%, transparent 25%)',
        borderRadius: '50%',
      };
    });

    if (game.isCheck()) {
      const kingSquare = game
        .board()
        .flat()
        .find((p) => p?.type === 'k' && p.color === game.turn())?.square;
      if (kingSquare) {
        styles[kingSquare] = { backgroundColor: 'rgba(255, 255, 255, 0.5)' };
      }
    }

    return styles;
  }, [selectedSquare, legalMoves, game]);

  const resetGame = () => {
    setGame(new Chess());
    setMoveHistory([]);
    setSelectedSquare(null);
  };

  const undoMove = () => {
    game.undo();
    setGame(new Chess(game.fen()));
    setMoveHistory((prev) => prev.slice(0, -1));
    setSelectedSquare(null);
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
    <div className="h-full bg-pure-black flex flex-col overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar */}
        <div className="w-64 border-r border-mid/30 flex flex-col bg-off-black">
          {/* Sidebar Header */}
          <div className="p-3 border-b border-mid/30">
            <div className="flex items-center gap-2">
              <span className="text-lg">♔</span>
              <span className="text-xs font-mono text-mid-light">PRACTICE MODE</span>
            </div>
          </div>

          {/* Game Stats */}
          <div className="p-3 border-b border-mid/30 space-y-3">
            <div className="text-xs font-mono text-mid-light">GAME STATS</div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-pure-black border border-mid/30">
                <div className="text-xs font-mono text-mid-light">MOVES</div>
                <div className="text-lg font-mono text-pure-white">{moveHistory.length}</div>
              </div>
              <div className="p-2 bg-pure-black border border-mid/30">
                <div className="text-xs font-mono text-mid-light">STATUS</div>
                <div className={`text-xs font-mono ${isGameOver ? 'text-pure-white' : 'text-mid-light'}`}>
                  {isGameOver ? 'ENDED' : 'ACTIVE'}
                </div>
              </div>
            </div>

            <div className="p-2 bg-pure-black border border-mid/30">
              <div className="text-xs font-mono text-mid-light mb-1">MATERIAL</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-pure-white" />
                  <span className="font-mono text-pure-white">{whiteScore}</span>
                </div>
                <span className={`font-mono text-xs ${scoreDiff > 0 ? 'text-pure-white' : scoreDiff < 0 ? 'text-mid-light' : 'text-mid'}`}>
                  {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff < 0 ? `${scoreDiff}` : '='}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-pure-white">{blackScore}</span>
                  <span className="w-3 h-3 bg-pure-black border border-mid" />
                </div>
              </div>
            </div>
          </div>

          {/* Move History */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-3 border-b border-mid/30">
              <div className="text-xs font-mono text-mid-light">MOVE HISTORY</div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {moveHistory.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs font-mono text-mid">No moves yet</p>
                </div>
              ) : (
                <div className="space-y-1 font-mono text-xs">
                  {movePairs.map((pair) => (
                    <div key={pair.number} className="flex items-center">
                      <span className="w-6 text-mid">{pair.number}.</span>
                      <span className="w-14 text-pure-white">{pair.white || '...'}</span>
                      <span className="w-14 text-mid-light">{pair.black || ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Actions */}
          <div className="p-3 border-t border-mid/30 space-y-2">
            <button
              onClick={undoMove}
              disabled={moveHistory.length === 0}
              className="w-full px-3 py-2 text-xs font-mono border border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              ← UNDO
            </button>
            <button
              onClick={resetGame}
              className="w-full px-3 py-2 text-xs font-mono border border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white transition-all"
            >
              ↺ NEW GAME
            </button>
          </div>
        </div>

        {/* Main Chess Board Area */}
        <div className="flex-1 flex flex-col min-h-0 bg-pure-black">
          {/* Board Header - Player Info */}
          <div className="p-3 border-b border-mid/30 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-pure-black border border-mid" />
                <span className="text-xs font-mono text-pure-white">{playerName}_black</span>
              </div>
              <div className="text-xs font-mono text-mid-light">
                {blackCaptured.length > 0 && `captured: ${blackCaptured.join(' ')}`}
              </div>
            </div>
            <div className={`px-3 py-1 text-xs font-mono ${
              game.turn() === 'b' ? 'bg-pure-white text-pure-black' : 'text-mid-light'
            }`}>
              {game.turn() === 'b' ? '● THINKING' : '○'}
            </div>
          </div>

          {/* Chess Board Container */}
          <div className="flex-1 flex items-center justify-center p-6 min-h-0">
            <div className="aspect-square max-h-full max-w-full" style={{ height: 'min(100%, calc(100vw - 320px))' }}>
              <Chessboard
                position={game.fen()}
                onPieceDrop={onDrop}
                onSquareClick={onSquareClick}
                customSquareStyles={squareStyles}
                animationDuration={150}
                areArrowsAllowed={true}
                customBoardStyle={{
                  borderRadius: '0',
                  boxShadow: 'none',
                }}
                customDarkSquareStyle={{ backgroundColor: '#1a1a1a' }}
                customLightSquareStyle={{ backgroundColor: '#e5e5e5' }}
              />
            </div>
          </div>

          {/* Board Footer - Player Info */}
          <div className="p-3 border-t border-mid/30 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-pure-white" />
                <span className="text-xs font-mono text-pure-white">{playerName}_white</span>
              </div>
              <div className="text-xs font-mono text-mid-light">
                {whiteCaptured.length > 0 && `captured: ${whiteCaptured.join(' ')}`}
              </div>
            </div>
            <div className={`px-3 py-1 text-xs font-mono ${
              game.turn() === 'w' ? 'bg-pure-white text-pure-black' : 'text-mid-light'
            }`}>
              {game.turn() === 'w' ? '● THINKING' : '○'}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="h-8 border-t border-mid/30 bg-off-black flex items-center px-3 gap-6">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isGameOver ? 'bg-mid' : 'bg-pure-white animate-pulse'}`} />
          <span className="text-xs font-mono text-mid-light">{getStatusMessage()}</span>
        </div>

        <div className="h-4 w-px bg-mid/30" />

        <div className="flex items-center gap-4 text-xs font-mono text-mid">
          <span>SESSION: {sessionId}</span>
          <span>TIME: {formatElapsed(elapsedTime)}</span>
          <span>HALF-MOVES: {moveHistory.length}</span>
          <span>WHITE: {whiteScore} pts</span>
          <span>BLACK: {blackScore} pts</span>
        </div>

        <div className="ml-auto flex items-center gap-4 text-xs font-mono text-mid">
          <span>FEN: {game.fen().slice(0, 20)}...</span>
        </div>
      </div>

      {/* Promotion Dialog */}
      {promotionMove && (
        <div className="fixed inset-0 bg-pure-black/95 flex items-center justify-center z-50">
          <div className="bg-off-black border border-mid/30 p-4 max-w-xs w-full">
            <p className="text-xs font-mono text-mid-light mb-4 text-center">
              SELECT PROMOTION
            </p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { key: 'q', symbol: game.turn() === 'w' ? '♕' : '♛' },
                { key: 'r', symbol: game.turn() === 'w' ? '♖' : '♜' },
                { key: 'b', symbol: game.turn() === 'w' ? '♗' : '♝' },
                { key: 'n', symbol: game.turn() === 'w' ? '♘' : '♞' },
              ].map((piece) => (
                <button
                  key={piece.key}
                  onClick={() => onPromotionSelect(piece.key)}
                  className="p-3 bg-pure-black border border-mid hover:border-pure-white transition-colors"
                >
                  <div className="text-3xl text-center">{piece.symbol}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPromotionMove(null)}
              className="w-full px-3 py-2 text-xs font-mono border border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white transition-all"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
