'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ChessEngine, type Square, type Move, type PieceType } from '@chess-game/shared/chess';
import { ChessBoard } from './ChessBoard';
import { GameClock, MatchClock } from './GameClock';
import { useAuthStore } from '@/store/auth';
import { nanoid } from 'nanoid';
import { CHALLENGE_TIME_CONTROLS } from '@chess-game/shared';

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

// Time control options for practice mode
const TIME_CONTROL_OPTIONS = [
  { key: 'unlimited', label: 'unlimited', seconds: 0, increment: 0 },
  { key: 'bullet_1', label: '1 min', seconds: 60, increment: 0 },
  { key: 'blitz_3', label: '3 min', seconds: 180, increment: 0 },
  { key: 'blitz_5', label: '5 min', seconds: 300, increment: 0 },
  { key: 'rapid_10', label: '10 min', seconds: 600, increment: 0 },
  { key: 'rapid_15', label: '15+10', seconds: 900, increment: 10 },
];

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

  // Time control state
  const [selectedTimeControl, setSelectedTimeControl] = useState(TIME_CONTROL_OPTIONS[2]); // Default 3 min
  const [whiteTime, setWhiteTime] = useState(selectedTimeControl.seconds);
  const [blackTime, setBlackTime] = useState(selectedTimeControl.seconds);
  const [gameStarted, setGameStarted] = useState(false);
  const clockIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Game result state - tracks how the game ended
  type GameResult = null | 'white-checkmate' | 'black-checkmate' | 'stalemate' | 'draw' | 'white-timeout' | 'black-timeout';
  const [gameResult, setGameResult] = useState<GameResult>(null);

  const playerName = user?.username || 'Player';
  const currentTurn = game.turn() === 'w' ? 'white' : 'black';
  const isGameOver = game.isGameOver();

  const whiteScore = useMemo(() => calculateScore(game, 'w'), [game]);
  const blackScore = useMemo(() => calculateScore(game, 'b'), [game]);
  const whiteCaptured = useMemo(() => getCapturedPieces(game, 'b'), [game]);
  const blackCaptured = useMemo(() => getCapturedPieces(game, 'w'), [game]);
  const scoreDiff = whiteScore - blackScore;

  // Elapsed time counter - stops when game ends
  // Include isGameOver in guard to prevent timer restart during position review
  useEffect(() => {
    if (!gameStarted || gameResult || isGameOver) return;
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - sessionStart.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStart, gameStarted, gameResult, isGameOver]);

  // Chess clock countdown
  useEffect(() => {
    // Don't run clock if unlimited time or game not started or game is over
    if (selectedTimeControl.seconds === 0 || !gameStarted || isGameOver) {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
        clockIntervalRef.current = null;
      }
      return;
    }

    // Clear any existing interval
    if (clockIntervalRef.current) {
      clearInterval(clockIntervalRef.current);
    }

    // Start countdown for active player
    clockIntervalRef.current = setInterval(() => {
      if (game.turn() === 'w') {
        setWhiteTime((prev) => {
          if (prev <= 0) {
            if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBlackTime((prev) => {
          if (prev <= 0) {
            if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
        clockIntervalRef.current = null;
      }
    };
  }, [game, gameStarted, selectedTimeControl.seconds, isGameOver]);

  // Handle time control change
  const handleTimeControlChange = (timeControl: typeof TIME_CONTROL_OPTIONS[0]) => {
    setSelectedTimeControl(timeControl);
    setWhiteTime(timeControl.seconds);
    setBlackTime(timeControl.seconds);
    setGameStarted(false);
  };

  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Check for time out
  const isWhiteTimeout = whiteTime <= 0 && selectedTimeControl.seconds > 0 && gameStarted;
  const isBlackTimeout = blackTime <= 0 && selectedTimeControl.seconds > 0 && gameStarted;

  // Effect to handle timeout and set game result
  useEffect(() => {
    if (gameResult) return; // Already have a result

    if (isWhiteTimeout) {
      setGameResult('white-timeout');
      // Add result to move history
      setMoveHistory((prev) => [...prev, '0-1']);
    } else if (isBlackTimeout) {
      setGameResult('black-timeout');
      // Add result to move history
      setMoveHistory((prev) => [...prev, '1-0']);
    } else if (game.isCheckmate()) {
      const winner = game.turn() === 'w' ? 'black-checkmate' : 'white-checkmate';
      setGameResult(winner);
      setMoveHistory((prev) => [...prev, game.turn() === 'w' ? '0-1' : '1-0']);
    } else if (game.isStalemate()) {
      setGameResult('stalemate');
      setMoveHistory((prev) => [...prev, '½-½']);
    } else if (game.isDraw()) {
      setGameResult('draw');
      setMoveHistory((prev) => [...prev, '½-½']);
    }
  }, [isWhiteTimeout, isBlackTimeout, game, gameResult]);

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
      // Check for timeout before allowing move
      if ((game.turn() === 'w' && isWhiteTimeout) || (game.turn() === 'b' && isBlackTimeout)) {
        return false;
      }

      const move = game.move({ from, to, promotion });
      if (move) {
        // Start the game on first move
        if (!gameStarted) {
          setGameStarted(true);
        }

        // Add increment to the player who just moved
        if (selectedTimeControl.increment > 0) {
          if (game.turn() === 'b') {
            // White just moved (turn switched to black)
            setWhiteTime((prev) => prev + selectedTimeControl.increment);
          } else {
            // Black just moved (turn switched to white)
            setBlackTime((prev) => prev + selectedTimeControl.increment);
          }
        }

        const newGame = new ChessEngine(game.fen());
        setGame(newGame);
        setMoveHistory((prev) => [...prev, move.san]);
        setLastMove({ from, to });
        setSelectedSquare(null);
        return true;
      }
      return false;
    },
    [game, gameStarted, selectedTimeControl.increment, isWhiteTimeout, isBlackTimeout]
  );

  const onSquareClick = useCallback(
    (square: Square) => {
      if (isGameOver || isWhiteTimeout || isBlackTimeout) return;

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
    [game, selectedSquare, legalMoves, isPromotion, makeMove, isGameOver, isWhiteTimeout, isBlackTimeout]
  );

  const onDrop = useCallback(
    (sourceSquare: Square, targetSquare: Square): boolean => {
      if (isGameOver || isWhiteTimeout || isBlackTimeout) return false;
      const piece = game.get(sourceSquare);
      if (!piece || piece.color !== game.turn()) return false;

      if (isPromotion(sourceSquare, targetSquare)) {
        setPromotionMove({ from: sourceSquare, to: targetSquare });
        return false;
      }

      return makeMove(sourceSquare, targetSquare);
    },
    [game, isPromotion, makeMove, isGameOver, isWhiteTimeout, isBlackTimeout]
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
    setWhiteTime(selectedTimeControl.seconds);
    setBlackTime(selectedTimeControl.seconds);
    setGameStarted(false);
    setElapsedTime(0);
    setGameResult(null);
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
    if (isWhiteTimeout) return 'BLACK WINS ON TIME';
    if (isBlackTimeout) return 'WHITE WINS ON TIME';
    if (game.isCheckmate()) return `CHECKMATE — ${game.turn() === 'w' ? 'BLACK' : 'WHITE'} WINS`;
    if (game.isStalemate()) return 'STALEMATE';
    if (game.isDraw()) return 'DRAW';
    if (game.isCheck()) return `${currentTurn.toUpperCase()} IN CHECK`;
    return `${currentTurn.toUpperCase()} TO MOVE`;
  };

  // Determine if game ended (including timeout)
  const isGameEnded = isGameOver || isWhiteTimeout || isBlackTimeout;

  // Filter out the result from move history for display purposes
  const movesOnly = moveHistory.filter(m => !['1-0', '0-1', '½-½'].includes(m));
  const resultEntry = moveHistory.find(m => ['1-0', '0-1', '½-½'].includes(m));

  const movePairs: { number: number; white?: string; black?: string }[] = [];
  for (let i = 0; i < movesOnly.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: movesOnly[i],
      black: movesOnly[i + 1],
    });
  }

  // Get result message for the end game dialog
  const getResultMessage = () => {
    switch (gameResult) {
      case 'white-timeout':
        return { winner: 'black', reason: 'white ran out of time' };
      case 'black-timeout':
        return { winner: 'white', reason: 'black ran out of time' };
      case 'white-checkmate':
        return { winner: 'white', reason: 'checkmate' };
      case 'black-checkmate':
        return { winner: 'black', reason: 'checkmate' };
      case 'stalemate':
        return { winner: 'draw', reason: 'stalemate' };
      case 'draw':
        return { winner: 'draw', reason: 'draw' };
      default:
        return null;
    }
  };

  const resultMessage = getResultMessage();

  return (
    <div className="h-full bg-black flex flex-col overflow-hidden border-t border-white/15">
      {/* Content Row: Sidebar + Board */}
      <div className="flex-1 flex min-h-0">
      {/* Left Sidebar - Blueprint style with shared borders */}
      <div className="w-56 border-r border-white/15 flex flex-col bg-black">
        {/* Header */}
        <div className="px-3 py-2 border-b border-white/15 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white/70">♔</span>
            <span className="text-xs font-mono text-white/50 lowercase tracking-wide">practice</span>
          </div>
          <MatchClock elapsedSeconds={elapsedTime} showLabel={false} size="sm" />
        </div>

        {/* Time Control Selector */}
        <div className="border-b border-white/15">
          <div className="px-3 py-1.5 text-[10px] text-white/30 lowercase tracking-wide">time control</div>
          <div className="grid grid-cols-3">
            {TIME_CONTROL_OPTIONS.map((tc, index) => {
              const isSelected = selectedTimeControl.key === tc.key;
              const isLastInRow = (index + 1) % 3 === 0;
              const isFirstRow = index < 3;
              return (
                <button
                  key={tc.key}
                  onClick={() => handleTimeControlChange(tc)}
                  disabled={gameStarted && moveHistory.length > 0}
                  className={`
                    py-1.5 text-[10px] font-mono transition-all lowercase
                    ${!isLastInRow ? 'border-r border-white/15' : ''}
                    ${isFirstRow ? 'border-b border-white/15' : ''}
                    ${isSelected ? 'bg-white text-black' : 'text-white/50 hover:text-white'}
                    ${gameStarted && moveHistory.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {tc.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chess Clocks */}
        {selectedTimeControl.seconds > 0 && (
          <div className="border-b border-white/15">
            <div className="px-3 py-1.5 text-[10px] text-white/30 lowercase tracking-wide border-b border-white/15">
              chess clock
            </div>
            <div className="flex">
              {/* White Clock */}
              <div className="flex-1 p-2 border-r border-white/15 flex flex-col items-center">
                <GameClock
                  time={whiteTime}
                  isActive={gameStarted && game.turn() === 'w' && !isGameEnded}
                  initialTime={selectedTimeControl.seconds}
                  size="sm"
                />
                <div className="flex items-center gap-1 mt-1">
                  <span className="w-2 h-2 bg-white" />
                  <span className="text-[10px] text-white/30 lowercase">white</span>
                </div>
              </div>
              {/* Black Clock */}
              <div className="flex-1 p-2 flex flex-col items-center">
                <GameClock
                  time={blackTime}
                  isActive={gameStarted && game.turn() === 'b' && !isGameEnded}
                  initialTime={selectedTimeControl.seconds}
                  size="sm"
                />
                <div className="flex items-center gap-1 mt-1">
                  <span className="w-2 h-2 bg-white/50" />
                  <span className="text-[10px] text-white/30 lowercase">black</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats - grid cells with shared borders */}
        <div className="border-b border-white/15">
          <div className="flex">
            <div className="flex-1 p-3 border-r border-white/15 text-center">
              <div className="text-lg font-mono text-white">{moveHistory.length}</div>
              <div className="text-[10px] text-white/30 lowercase">moves</div>
            </div>
            <div className="flex-1 p-3 text-center">
              <div className={`text-lg font-mono ${scoreDiff > 0 ? 'text-white' : scoreDiff < 0 ? 'text-white/40' : 'text-white/50'}`}>
                {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff < 0 ? `${scoreDiff}` : '='}
              </div>
              <div className="text-[10px] text-white/30 lowercase">eval</div>
            </div>
          </div>

          {/* Material */}
          <div className="flex items-center justify-between text-xs font-mono px-3 py-2 border-t border-white/15">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-white" />
              <span className="text-white/70">{whiteScore}</span>
            </div>
            <span className="text-[10px] text-white/30 lowercase">material</span>
            <div className="flex items-center gap-1">
              <span className="text-white/70">{blackScore}</span>
              <span className="w-2 h-2 bg-white/50" />
            </div>
          </div>
        </div>

        {/* Move History */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-3 py-1.5 text-[10px] text-white/30 lowercase tracking-wide border-b border-white/15">history</div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {movesOnly.length === 0 && !resultEntry ? (
              <div className="text-xs text-white/20 text-center py-4 lowercase">no moves yet</div>
            ) : (
              <div className="space-y-0.5 font-mono text-xs">
                {movePairs.map((pair) => (
                  <div key={pair.number} className="flex items-center hover:bg-white/5 px-1">
                    <span className="w-5 text-white/30">{pair.number}.</span>
                    <span className="w-12 text-white/70">{pair.white || '...'}</span>
                    <span className="w-12 text-white/50">{pair.black || ''}</span>
                  </div>
                ))}
                {/* Show game result */}
                {resultEntry && (
                  <div className="flex items-center justify-center pt-2 mt-2 border-t border-white/15">
                    <span className={`text-sm font-mono ${
                      resultEntry === '1-0' ? 'text-white' :
                      resultEntry === '0-1' ? 'text-white/50' :
                      'text-white/70'
                    }`}>
                      {resultEntry}
                    </span>
                    {resultMessage && (
                      <span className="text-[10px] text-white/30 ml-2 lowercase">
                        ({resultMessage.reason})
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-2 border-t border-white/15 space-y-1">
          <button
            onClick={undoMove}
            disabled={movesOnly.length === 0 || isGameEnded}
            className="w-full px-2 py-1.5 text-xs font-mono bg-black border border-white/15 text-white/50 hover:border-white hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all lowercase"
          >
            undo
          </button>
          <button
            onClick={resetGame}
            className="w-full px-2 py-1.5 text-xs font-mono bg-black border border-white/15 text-white/50 hover:border-white hover:text-white transition-all lowercase"
          >
            new game
          </button>
        </div>
      </div>

      {/* Main Board Area - Board fills as rectangle */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top Player Bar (Black) */}
        <div className="h-10 px-4 border-b border-white/15 flex items-center justify-between bg-black">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 ${isBlackTimeout ? 'bg-red-500' : 'bg-white/50'}`} />
            <span className="text-sm font-mono text-white/70 lowercase">{playerName}</span>
            {blackCaptured.length > 0 && (
              <span className="text-xs text-white/30">{blackCaptured.join(' ')}</span>
            )}
          </div>
          <div className={`px-2 py-0.5 text-xs font-mono ${
            isBlackTimeout ? 'border border-red-500/50 text-red-400' :
            game.turn() === 'b' && !isGameEnded ? 'border border-white/30 text-white' : 'text-white/30'
          }`}>
            {isBlackTimeout ? 'timeout' : game.turn() === 'b' && !isGameEnded ? 'turn' : ''}
          </div>
        </div>

        {/* Chess Board - fills the space as a rectangle */}
        <div className="flex-1 min-h-0 p-4">
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

        {/* Bottom Player Bar (White) */}
        <div className="h-10 px-4 border-t border-white/15 flex items-center justify-between bg-black">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 ${isWhiteTimeout ? 'bg-red-500' : 'bg-white'}`} />
            <span className="text-sm font-mono text-white/70 lowercase">{playerName}</span>
            {whiteCaptured.length > 0 && (
              <span className="text-xs text-white/30">{whiteCaptured.join(' ')}</span>
            )}
          </div>
          <div className={`px-2 py-0.5 text-xs font-mono ${
            isWhiteTimeout ? 'border border-red-500/50 text-red-400' :
            game.turn() === 'w' && !isGameEnded ? 'border border-white/30 text-white' : 'text-white/30'
          }`}>
            {isWhiteTimeout ? 'timeout' : game.turn() === 'w' && !isGameEnded ? 'turn' : ''}
          </div>
        </div>
      </div>

      </div>{/* end content row */}

      {/* Status Bar - Bottom */}
      <div className="h-6 shrink-0 border-t border-white/15 bg-black flex items-center px-3 gap-4 text-[10px] font-mono text-white/30">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isGameEnded ? 'bg-white/30' : 'bg-white animate-pulse'}`} />
          <span className={`lowercase ${isWhiteTimeout || isBlackTimeout ? 'text-red-400' : 'text-white/50'}`}>{getStatusMessage()}</span>
        </div>
        <span className="text-white/20">|</span>
        <span className="lowercase">session: {sessionId}</span>
        <span className="lowercase">moves: {movesOnly.length}</span>
        <span className="ml-auto text-white/20 truncate max-w-48 lowercase">fen: {game.fen().slice(0, 30)}...</span>
      </div>

      {/* Promotion Dialog */}
      {promotionMove && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50">
          <div className="bg-black border border-white/15 p-4">
            <p className="text-xs font-mono text-white/50 mb-3 text-center lowercase tracking-wide">
              select promotion
            </p>
            <div className="flex gap-1 mb-3">
              {[
                { key: 'q', symbol: game.turn() === 'w' ? '♕' : '♛' },
                { key: 'r', symbol: game.turn() === 'w' ? '♖' : '♜' },
                { key: 'b', symbol: game.turn() === 'w' ? '♗' : '♝' },
                { key: 'n', symbol: game.turn() === 'w' ? '♘' : '♞' },
              ].map((piece) => (
                <button
                  key={piece.key}
                  onClick={() => onPromotionSelect(piece.key)}
                  className="w-14 h-14 bg-black border border-white/15 hover:border-white transition-all"
                >
                  <span className="text-4xl">{piece.symbol}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPromotionMove(null)}
              className="w-full px-3 py-1.5 text-xs font-mono text-white/30 hover:text-white transition-colors lowercase"
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {/* Game End Dialog */}
      {gameResult && resultMessage && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-black border border-white/15 p-6 min-w-[280px]">
            {/* Result */}
            <div className="text-center mb-4">
              <p className="text-xs font-mono text-white/30 mb-2 lowercase">game over</p>
              <p className={`text-4xl font-mono mb-2 ${
                resultMessage.winner === 'white' ? 'text-white' :
                resultMessage.winner === 'black' ? 'text-white/50' :
                'text-white/70'
              }`}>
                {resultEntry}
              </p>
              <p className={`text-lg font-mono lowercase ${
                resultMessage.winner === 'draw' ? 'text-white/50' : 'text-white'
              }`}>
                {resultMessage.winner === 'draw' ? resultMessage.reason : `${resultMessage.winner} wins`}
              </p>
              <p className="text-xs font-mono text-white/30 mt-1 lowercase">
                {resultMessage.winner !== 'draw' && resultMessage.reason}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 border border-white/15 mb-4">
              <div className="p-2 text-center border-r border-white/15">
                <p className="text-lg font-mono text-white">{movesOnly.length}</p>
                <p className="text-[10px] text-white/30 lowercase">moves</p>
              </div>
              <div className="p-2 text-center border-r border-white/15">
                <p className="text-lg font-mono text-white/70">{formatElapsed(elapsedTime)}</p>
                <p className="text-[10px] text-white/30 lowercase">time</p>
              </div>
              <div className="p-2 text-center">
                <p className={`text-lg font-mono ${
                  scoreDiff > 0 ? 'text-white' : scoreDiff < 0 ? 'text-white/50' : 'text-white/70'
                }`}>
                  {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff < 0 ? `${scoreDiff}` : '='}
                </p>
                <p className="text-[10px] text-white/30 lowercase">eval</p>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={resetGame}
                className="w-full px-4 py-2 bg-white text-black font-mono text-sm lowercase hover:bg-white/90 transition-all"
              >
                new game
              </button>
              <button
                onClick={() => setGameResult(null)}
                className="w-full px-4 py-2 bg-black text-white/50 border border-white/15 font-mono text-sm lowercase hover:border-white hover:text-white transition-all"
              >
                review position
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
