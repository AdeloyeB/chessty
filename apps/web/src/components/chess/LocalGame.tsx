'use client';

import { useState, useCallback, useMemo } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useAuthStore } from '@/store/auth';
import { formatTime } from '@/lib/utils';

// Piece values for scoring
const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
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
  const [whiteTime, setWhiteTime] = useState(300);
  const [blackTime, setBlackTime] = useState(300);
  const [gameStarted, setGameStarted] = useState(false);
  const [promotionMove, setPromotionMove] = useState<{ from: Square; to: Square } | null>(null);

  const playerName = user?.username || 'player';
  const currentTurn = game.turn() === 'w' ? 'white' : 'black';
  const isGameOver = game.isGameOver();

  const whiteScore = useMemo(() => calculateScore(game, 'w'), [game]);
  const blackScore = useMemo(() => calculateScore(game, 'b'), [game]);
  const whiteCaptured = useMemo(() => getCapturedPieces(game, 'b'), [game]);
  const blackCaptured = useMemo(() => getCapturedPieces(game, 'w'), [game]);

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
          if (!gameStarted) setGameStarted(true);
          return true;
        }
      } catch {
        // Invalid move
      }
      return false;
    },
    [game, gameStarted]
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
    setWhiteTime(300);
    setBlackTime(300);
    setGameStarted(false);
  };

  const undoMove = () => {
    game.undo();
    setGame(new Chess(game.fen()));
    setMoveHistory((prev) => prev.slice(0, -1));
    setSelectedSquare(null);
  };

  const getStatusMessage = () => {
    if (game.isCheckmate()) return `checkmate — ${game.turn() === 'w' ? 'black' : 'white'} wins`;
    if (game.isStalemate()) return 'stalemate';
    if (game.isDraw()) return 'draw';
    if (game.isCheck()) return `${currentTurn} in check`;
    return `${currentTurn}_to_move`;
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
    <div className="max-w-6xl mx-auto">
      {/* Practice Mode Banner */}
      <div className="mb-6 p-4 border-l border-pure-white/30 bg-off-black">
        <p className="text-xs font-mono text-mid-light">practice_mode</p>
        <p className="text-pure-white font-mono text-sm">
          {playerName} — playing both sides
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Move History */}
        <div className="lg:col-span-3 order-3 lg:order-1">
          <div className="card">
            <p className="text-xs font-mono text-mid-light mb-4">move_history</p>

            {moveHistory.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-mid-light font-mono text-sm">no moves yet</p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1 font-mono text-sm">
                {movePairs.map((pair) => (
                  <div key={pair.number} className="flex items-center gap-2">
                    <span className="w-6 text-mid">{pair.number}.</span>
                    <span className="w-12 text-pure-white">{pair.white || '...'}</span>
                    <span className="w-12 text-mid-light">{pair.black || ''}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-mid/30 space-y-2">
              <button
                onClick={undoMove}
                disabled={moveHistory.length === 0}
                className="w-full btn btn-secondary disabled:opacity-20 disabled:cursor-not-allowed"
              >
                undo
              </button>
              <button onClick={resetGame} className="w-full btn btn-danger">
                reset
              </button>
            </div>
          </div>
        </div>

        {/* Center: Chess Board */}
        <div className="lg:col-span-6 order-1 lg:order-2">
          {/* Black player */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-pure-black flex items-center justify-center border border-mid">
                <span className="text-pure-white text-xs font-mono">b</span>
              </div>
              <div>
                <p className="text-pure-white font-mono text-sm">{playerName}_black</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-mid-light font-mono">captured:</span>
                  <span className="text-sm text-light">{blackCaptured.join(' ') || '—'}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="score-box">
                <span className="text-pure-white">{blackScore}</span>
              </div>
              <div className={`px-3 py-1 font-mono text-sm border ${
                game.turn() === 'b'
                  ? 'bg-pure-white text-pure-black border-pure-white'
                  : 'bg-pure-black text-mid-light border-mid/50'
              }`}>
                {formatTime(blackTime)}
              </div>
            </div>
          </div>

          {/* Board */}
          <div className="chess-board">
            <Chessboard
              position={game.fen()}
              onPieceDrop={onDrop}
              onSquareClick={onSquareClick}
              customSquareStyles={squareStyles}
              animationDuration={150}
              areArrowsAllowed={true}
              customBoardStyle={{
                borderRadius: '0',
              }}
              customDarkSquareStyle={{ backgroundColor: '#000000' }}
              customLightSquareStyle={{ backgroundColor: '#ffffff' }}
            />
          </div>

          {/* White player */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-pure-white flex items-center justify-center border border-mid">
                <span className="text-pure-black text-xs font-mono">w</span>
              </div>
              <div>
                <p className="text-pure-white font-mono text-sm">{playerName}_white</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-mid-light font-mono">captured:</span>
                  <span className="text-sm text-light">{whiteCaptured.join(' ') || '—'}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="score-box">
                <span className="text-pure-white">{whiteScore}</span>
              </div>
              <div className={`px-3 py-1 font-mono text-sm border ${
                game.turn() === 'w'
                  ? 'bg-pure-white text-pure-black border-pure-white'
                  : 'bg-pure-black text-mid-light border-mid/50'
              }`}>
                {formatTime(whiteTime)}
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="mt-4 text-center">
            <p className={`text-sm font-mono ${isGameOver ? 'text-pure-white' : 'text-mid-light'}`}>
              {getStatusMessage()}
            </p>
          </div>
        </div>

        {/* Right: Game Info */}
        <div className="lg:col-span-3 order-2 lg:order-3">
          <div className="card">
            <p className="text-xs font-mono text-mid-light mb-4">game_info</p>

            <div className="space-y-4">
              <div>
                <p className="stat-label">status</p>
                <p className={`text-lg font-mono ${isGameOver ? 'text-pure-white' : 'text-light'}`}>
                  {isGameOver ? 'game_over' : 'in_progress'}
                </p>
              </div>

              <div>
                <p className="stat-label">moves</p>
                <p className="stat-value">{moveHistory.length}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="stat-label">white_pts</p>
                  <p className="text-2xl font-mono text-pure-white">{whiteScore}</p>
                </div>
                <div>
                  <p className="stat-label">black_pts</p>
                  <p className="text-2xl font-mono text-pure-white">{blackScore}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-mid/30">
                <p className="stat-label mb-2">fen</p>
                <p className="text-xs font-mono text-mid-light break-all leading-relaxed bg-pure-black p-2 border border-mid/30">
                  {game.fen()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Promotion Dialog */}
      {promotionMove && (
        <div className="fixed inset-0 bg-pure-black/95 flex items-center justify-center z-50">
          <div className="card max-w-xs w-full">
            <p className="text-xs font-mono text-mid-light mb-4 text-center">
              choose_promotion
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
            <button onClick={() => setPromotionMove(null)} className="w-full btn btn-secondary">
              cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
