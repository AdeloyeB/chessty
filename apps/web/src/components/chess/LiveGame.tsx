'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { ChessBoard } from './ChessBoard';
import { GameClock } from './GameClock';
import { PromotionDialog } from './PromotionDialog';
import { GameEndDialog } from './GameEndDialog';
import { USDCAmount } from '../wallet/USDCAmount';
import { useGameStore } from '@/store/game';
import { useChessGame } from '@/hooks/useChessGame';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { Square } from '@chess-game/shared/chess';

/**
 * LiveGame — in-dashboard multiplayer game view.
 *
 * Uses the same sidebar + rectangular board layout as LocalGame (practice mode)
 * but reads all state from the Zustand game store and sends moves via WebSocket.
 *
 * Renders inside the dashboard layout so the nav bar stays visible.
 */
export function LiveGame() {
  const {
    status,
    currentFen,
    whitePlayer,
    blackPlayer,
    playerColor,
    whiteTimeRemaining,
    blackTimeRemaining,
    isMyTurn,
    moves,
    game,
    drawOffered,
    drawOfferedByMe,
    queueTimeControl,
    queueWagerAmount,
  } = useGameStore();

  const {
    selectedSquare,
    legalMoves,
    onDrop,
    onSquareClick,
    promotionMove,
    onPromotionSelect,
    cancelPromotion,
    isCheck,
  } = useChessGame();

  const { joinGame, resign, offerDraw, acceptDraw, declineDraw, leaveQueue } =
    useWebSocket();

  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const moveListRef = useRef<HTMLDivElement>(null);

  // Join game automatically when matched
  const hasJoinedRef = useRef<string | null>(null);
  useEffect(() => {
    if (status === 'matched' && game && hasJoinedRef.current !== game.id) {
      hasJoinedRef.current = game.id;
      joinGame(game.id);
    }
  }, [status, game, joinGame]);

  // Auto-scroll move list
  useEffect(() => {
    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [moves]);

  const boardOrientation = playerColor === 'black' ? 'black' : 'white';
  const initialTime = game?.timeControl?.initial ?? queueTimeControl?.initial ?? 180;

  // Determine which player is on top / bottom based on our color
  const topPlayer = playerColor === 'white' ? blackPlayer : whitePlayer;
  const bottomPlayer = playerColor === 'white' ? whitePlayer : blackPlayer;
  const isTopActive = !isMyTurn && status === 'playing';
  const isBottomActive = isMyTurn && status === 'playing';

  // Legal move squares for the board highlight
  const legalMoveSquares = useMemo(
    () => legalMoves.map((m) => m.to),
    [legalMoves]
  );

  // Check square highlight
  const checkSquare = useMemo(() => {
    if (!isCheck) return null;
    // Find the king of the side to move from the FEN
    const isWhiteTurn = currentFen.split(' ')[1] === 'w';
    const kingChar = isWhiteTurn ? 'K' : 'k';
    const ranks = currentFen.split(' ')[0].split('/');
    const files = 'abcdefgh';
    for (let r = 0; r < 8; r++) {
      let fileIdx = 0;
      for (const ch of ranks[r]) {
        if (/\d/.test(ch)) {
          fileIdx += parseInt(ch);
        } else {
          if (ch === kingChar) {
            return `${files[fileIdx]}${8 - r}` as Square;
          }
          fileIdx++;
        }
      }
    }
    return null;
  }, [isCheck, currentFen]);

  // Build move pairs for sidebar history
  const movePairs = useMemo(() => {
    const pairs: { number: number; white?: string; black?: string }[] = [];
    for (let i = 0; i < moves.length; i += 2) {
      pairs.push({
        number: Math.floor(i / 2) + 1,
        white: moves[i]?.san,
        black: moves[i + 1]?.san,
      });
    }
    return pairs;
  }, [moves]);

  // Time control label for sidebar
  const timeLabel = useMemo(() => {
    if (!initialTime) return 'unlimited';
    const mins = Math.floor(initialTime / 60);
    const inc = game?.timeControl?.increment ?? queueTimeControl?.increment ?? 0;
    return inc > 0 ? `${mins}+${inc}` : `${mins} min`;
  }, [initialTime, game?.timeControl?.increment, queueTimeControl?.increment]);

  // Turn text for status bar
  const turnText = useMemo(() => {
    if (status === 'queuing') return 'SEARCHING';
    if (status === 'matched') return 'CONNECTING';
    if (status === 'ended') return 'GAME OVER';
    return isMyTurn ? 'YOUR TURN' : 'OPPONENT TURN';
  }, [status, isMyTurn]);

  // ── Queuing state ────────────────────────────────────────────────────────
  if (status === 'queuing') {
    return (
      <div className="h-full bg-black flex flex-col overflow-hidden border-t border-white/15">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="mb-6">
              <span className="text-4xl">♔</span>
            </div>
            <p className="text-white font-mono text-lg mb-2 lowercase">searching for opponent...</p>
            <p className="text-white/50 font-mono text-sm mb-1 lowercase">{timeLabel}</p>
            {queueWagerAmount > 0 && (
              <div className="flex items-center justify-center gap-1 mb-6">
                <span className="text-white/30 font-mono text-sm lowercase">wager:</span>
                <USDCAmount amount={queueWagerAmount} size="sm" />
              </div>
            )}
            <div className="flex items-center justify-center gap-2 mb-8">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-xs font-mono text-white/30 lowercase">waiting for match</span>
            </div>
            <button
              onClick={leaveQueue}
              className="px-6 py-2 bg-black text-white/50 border border-white/15 font-mono text-sm lowercase hover:border-white hover:text-white transition-all"
            >
              cancel
            </button>
          </div>
        </div>
        {/* Status Bar */}
        <div className="h-6 shrink-0 border-t border-white/15 bg-black flex items-center px-3 gap-4 text-[10px] font-mono text-white/30">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-white/50 lowercase">SEARCHING</span>
          </div>
          <span className="text-white/20">|</span>
          <span className="lowercase">{timeLabel}</span>
        </div>
      </div>
    );
  }

  // ── Main game layout (matched / playing / ended) ─────────────────────────
  return (
    <div className="h-full bg-black flex flex-col overflow-hidden border-t border-white/15">
      {/* Content Row: Sidebar + Board */}
      <div className="flex-1 flex min-h-0">

        {/* ── Left Sidebar ── */}
        <div className="w-56 border-r border-white/15 flex flex-col bg-black">
          {/* Header */}
          <div className="px-3 py-2 border-b border-white/15 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-white/70">♔</span>
              <span className="text-xs font-mono text-white/50 lowercase tracking-wide">live_game</span>
            </div>
            <span className="text-xs font-mono text-white/30 lowercase">{timeLabel}</span>
          </div>

          {/* Game Info */}
          <div className="border-b border-white/15">
            <div className="px-3 py-1.5 text-[10px] text-white/30 lowercase tracking-wide border-b border-white/15">
              game_info
            </div>
            {/* Pool */}
            {game && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/15">
                <span className="text-[10px] text-white/30 lowercase">pool</span>
                <USDCAmount amount={game.totalPot} size="sm" />
              </div>
            )}
            {/* Players */}
            <div className="flex">
              <div className="flex-1 p-2 border-r border-white/15 text-center">
                <div className="w-6 h-6 mx-auto mb-1 bg-white flex items-center justify-center text-black text-xs font-mono">
                  {(whitePlayer?.displayName ?? whitePlayer?.username)?.[0]?.toLowerCase()}
                </div>
                <div className="text-[10px] font-mono text-white/70 truncate">{whitePlayer?.displayName ?? whitePlayer?.username}</div>
                <div className="text-[10px] font-mono text-white/30">{whitePlayer?.eloRating}</div>
              </div>
              <div className="flex-1 p-2 text-center">
                <div className="w-6 h-6 mx-auto mb-1 bg-white/50 flex items-center justify-center text-black text-xs font-mono">
                  {(blackPlayer?.displayName ?? blackPlayer?.username)?.[0]?.toLowerCase()}
                </div>
                <div className="text-[10px] font-mono text-white/70 truncate">{blackPlayer?.displayName ?? blackPlayer?.username}</div>
                <div className="text-[10px] font-mono text-white/30">{blackPlayer?.eloRating}</div>
              </div>
            </div>
          </div>

          {/* Chess Clocks */}
          {initialTime > 0 && (
            <div className="border-b border-white/15">
              <div className="px-3 py-1.5 text-[10px] text-white/30 lowercase tracking-wide border-b border-white/15">
                chess clock
              </div>
              <div className="flex">
                <div className="flex-1 p-2 border-r border-white/15 flex flex-col items-center">
                  <GameClock
                    time={whiteTimeRemaining}
                    isActive={
                      status === 'playing' &&
                      currentFen.split(' ')[1] === 'w'
                    }
                    initialTime={initialTime}
                    size="sm"
                  />
                  <div className="flex items-center gap-1 mt-1">
                    <span className="w-2 h-2 bg-white" />
                    <span className="text-[10px] text-white/30 lowercase">white</span>
                  </div>
                </div>
                <div className="flex-1 p-2 flex flex-col items-center">
                  <GameClock
                    time={blackTimeRemaining}
                    isActive={
                      status === 'playing' &&
                      currentFen.split(' ')[1] === 'b'
                    }
                    initialTime={initialTime}
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

          {/* Move History */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-3 py-1.5 text-[10px] text-white/30 lowercase tracking-wide border-b border-white/15">
              history
            </div>
            <div ref={moveListRef} className="flex-1 overflow-y-auto px-3 py-2">
              {moves.length === 0 ? (
                <div className="text-xs text-white/20 text-center py-4 lowercase">
                  {status === 'matched' ? 'connecting...' : 'no moves yet'}
                </div>
              ) : (
                <div className="space-y-0.5 font-mono text-xs">
                  {movePairs.map((pair) => (
                    <div key={pair.number} className="flex items-center hover:bg-white/5 px-1">
                      <span className="w-5 text-white/30">{pair.number}.</span>
                      <span className="w-12 text-white/70">{pair.white || '...'}</span>
                      <span className="w-12 text-white/50">{pair.black || ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Game Controls (draw / resign) */}
          {status === 'playing' && (
            <div className="p-2 border-t border-white/15 space-y-1">
              {/* Draw */}
              {drawOffered && !drawOfferedByMe ? (
                <div className="p-2 border border-green-400/30">
                  <p className="text-[10px] font-mono text-white/70 mb-2 lowercase">draw offered</p>
                  <div className="flex gap-1">
                    <button
                      onClick={acceptDraw}
                      className="flex-1 px-2 py-1.5 text-xs font-mono bg-white text-black hover:bg-white/90 transition-all lowercase"
                    >
                      accept
                    </button>
                    <button
                      onClick={declineDraw}
                      className="flex-1 px-2 py-1.5 text-xs font-mono bg-black border border-white/15 text-white/50 hover:border-white hover:text-white transition-all lowercase"
                    >
                      decline
                    </button>
                  </div>
                </div>
              ) : drawOfferedByMe ? (
                <div className="px-2 py-1.5 text-[10px] font-mono text-white/50 text-center border border-white/15 lowercase">
                  draw offer sent...
                </div>
              ) : (
                <button
                  onClick={offerDraw}
                  className="w-full px-2 py-1.5 text-xs font-mono bg-black border border-white/15 text-white/50 hover:border-white hover:text-white transition-all lowercase"
                >
                  offer draw
                </button>
              )}

              {/* Resign */}
              {showResignConfirm ? (
                <div className="p-2 border border-red-500/30">
                  <p className="text-[10px] font-mono text-white/50 mb-2 lowercase">resign?</p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        resign();
                        setShowResignConfirm(false);
                      }}
                      className="flex-1 px-2 py-1.5 text-xs font-mono bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500 hover:text-white transition-all lowercase"
                    >
                      confirm
                    </button>
                    <button
                      onClick={() => setShowResignConfirm(false)}
                      className="flex-1 px-2 py-1.5 text-xs font-mono bg-black border border-white/15 text-white/50 hover:border-white hover:text-white transition-all lowercase"
                    >
                      cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowResignConfirm(true)}
                  className="w-full px-2 py-1.5 text-xs font-mono bg-black border border-red-500/30 text-red-400 hover:border-red-500 transition-all lowercase"
                >
                  resign
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Board Area ── */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Top Player Bar (opponent) */}
          <div className="h-10 px-4 border-b border-white/15 flex items-center justify-between bg-black">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 ${playerColor === 'white' ? 'bg-white/50' : 'bg-white'}`} />
              <span className="text-sm font-mono text-white/70 lowercase">
                {topPlayer?.displayName ?? topPlayer?.username ?? 'opponent'}
              </span>
              <span className="text-xs font-mono text-white/30">
                {topPlayer?.eloRating}
              </span>
            </div>
            {isTopActive && (
              <span className="text-white/50 font-mono text-xs animate-subtle-blink">◄</span>
            )}
          </div>

          {/* Chess Board — rectangular, fills available space */}
          <div className="flex-1 min-h-0 p-4">
            <ChessBoard
              position={currentFen}
              onSquareClick={onSquareClick as (square: Square) => void}
              onPieceDrop={onDrop as (from: Square, to: Square) => boolean}
              selectedSquare={selectedSquare}
              legalMoves={legalMoveSquares}
              checkSquare={checkSquare}
              orientation={boardOrientation}
            />
          </div>

          {/* Bottom Player Bar (you) */}
          <div className="h-10 px-4 border-t border-white/15 flex items-center justify-between bg-black">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 ${playerColor === 'white' ? 'bg-white' : 'bg-white/50'}`} />
              <span className="text-sm font-mono text-white/70 lowercase">
                {bottomPlayer?.displayName ?? bottomPlayer?.username ?? 'you'}
              </span>
              <span className="text-xs font-mono text-white/30">
                {bottomPlayer?.eloRating}
              </span>
            </div>
            {isBottomActive && (
              <span className="text-white/50 font-mono text-xs animate-subtle-blink">◄</span>
            )}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="h-6 shrink-0 border-t border-white/15 bg-black flex items-center px-3 gap-4 text-[10px] font-mono text-white/30">
        <div className={`flex items-center gap-1.5 ${status === 'playing' ? 'animate-subtle-blink' : ''}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            status === 'ended' ? 'bg-white/30' :
            status === 'playing' && isMyTurn ? 'bg-green-400' :
            status === 'playing' && !isMyTurn ? 'bg-red-400' :
            'bg-white animate-pulse'
          }`} />
          <span className={`lowercase ${
            status === 'playing' && isMyTurn ? 'text-green-400' :
            status === 'playing' && !isMyTurn ? 'text-red-400' :
            'text-white/30'
          }`}>
            {turnText}
          </span>
        </div>
        <span className="text-white/20">|</span>
        {game && <span className="lowercase">game: {game.id.slice(0, 8)}</span>}
        <span className="lowercase">moves: {moves.length}</span>
        <span className="ml-auto text-white/20 truncate max-w-48 lowercase">fen: {currentFen.slice(0, 30)}...</span>
      </div>

      {/* Promotion Dialog */}
      {promotionMove && (
        <PromotionDialog
          color={playerColor || 'white'}
          onSelect={onPromotionSelect}
          onCancel={cancelPromotion}
        />
      )}

      {/* Game End Dialog */}
      {status === 'ended' && <GameEndDialog />}
    </div>
  );
}
