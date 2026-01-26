'use client';

import { ChessBoard } from './ChessBoard';
import { useGameStore } from '@/store/game';
import { useChessGame } from '@/hooks/useChessGame';
import { useWebSocket } from '@/hooks/useWebSocket';
import { GameClock } from './GameClock';
import { MoveHistory } from './MoveHistory';
import { GameControls } from './GameControls';
import { PromotionDialog } from './PromotionDialog';
import { GameEndDialog } from './GameEndDialog';
import { USDCAmount } from '../wallet/USDCAmount';
import type { Square } from '@chess-game/shared/chess';

export function GameBoard() {
  const {
    status,
    currentFen,
    whitePlayer,
    blackPlayer,
    playerColor,
    whiteTimeRemaining,
    blackTimeRemaining,
    isMyTurn,
    game,
  } = useGameStore();

  const {
    onDrop,
    onSquareClick,
    getSquareStyles,
    promotionMove,
    onPromotionSelect,
    cancelPromotion,
    isCheck,
  } = useChessGame();

  const { joinGame } = useWebSocket();

  // Join game when matched
  if (status === 'matched' && game) {
    joinGame(game.id);
  }

  const boardOrientation = playerColor === 'black' ? 'black' : 'white';

  // Get initial time from game time control (default to 3 minutes)
  // Use ?? instead of || to preserve 0 for unlimited time controls
  const initialTime = game?.timeControl?.initial ?? 180;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 border border-white/15">
        {/* Left: Move History */}
        <div className="lg:col-span-1 order-3 lg:order-1 border-r border-white/15">
          <MoveHistory />
        </div>

        {/* Center: Chess Board */}
        <div className="lg:col-span-1 order-1 lg:order-2 bg-black">
          {/* Opponent Info */}
          <div className="flex items-center justify-between p-3 border-b border-white/15">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/10 border border-white/15 flex items-center justify-center text-white font-mono text-sm lowercase">
                {(playerColor === 'white' ? blackPlayer : whitePlayer)?.username?.[0]?.toLowerCase()}
              </div>
              <div>
                <div className="text-white font-mono text-sm lowercase">
                  {(playerColor === 'white' ? blackPlayer : whitePlayer)?.username}
                </div>
                <div className="text-xs text-white/50 font-mono lowercase">
                  {(playerColor === 'white' ? blackPlayer : whitePlayer)?.eloRating} elo
                </div>
              </div>
            </div>
            <GameClock
              time={playerColor === 'white' ? blackTimeRemaining : whiteTimeRemaining}
              isActive={!isMyTurn && status === 'playing'}
              initialTime={initialTime}
              size="md"
            />
          </div>

          {/* Board */}
          <div className="aspect-square relative">
            <ChessBoard
              position={currentFen}
              onPieceDrop={onDrop as (from: Square, to: Square) => boolean}
              onSquareClick={onSquareClick as (square: Square) => void}
              orientation={boardOrientation}
            />

            {/* Check indicator */}
            {isCheck && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 px-4 py-1 bg-red-500 text-white text-sm font-mono border border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.7)] z-10 lowercase">
                check
              </div>
            )}

            {/* Turn indicator */}
            <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 px-4 py-1 text-sm font-mono border z-10 lowercase ${
              isMyTurn
                ? 'bg-white text-black border-white shadow-[0_0_8px_rgba(255,255,255,0.5)]'
                : 'bg-black text-white/50 border-white/15'
            }`}>
              {isMyTurn ? 'your_turn' : 'opponent_turn'}
            </div>
          </div>

          {/* Player Info */}
          <div className="flex items-center justify-between p-3 border-t border-white/15">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white border border-white/15 flex items-center justify-center text-black font-mono text-sm lowercase">
                {(playerColor === 'white' ? whitePlayer : blackPlayer)?.username?.[0]?.toLowerCase()}
              </div>
              <div>
                <div className="text-white font-mono text-sm lowercase">
                  {(playerColor === 'white' ? whitePlayer : blackPlayer)?.username}
                  <span className="ml-2 text-xs text-green-400">(you)</span>
                </div>
                <div className="text-xs text-white/50 font-mono lowercase">
                  {(playerColor === 'white' ? whitePlayer : blackPlayer)?.eloRating} elo
                </div>
              </div>
            </div>
            <GameClock
              time={playerColor === 'white' ? whiteTimeRemaining : blackTimeRemaining}
              isActive={isMyTurn && status === 'playing'}
              initialTime={initialTime}
              size="md"
            />
          </div>

          {/* Pool Info */}
          {game && (
            <div className="p-3 border-t border-white/15 text-center">
              <p className="text-xs font-mono text-white/50 mb-1 lowercase">total_pool</p>
              <USDCAmount amount={game.totalPot} size="lg" className="justify-center" />
            </div>
          )}
        </div>

        {/* Right: Game Controls */}
        <div className="lg:col-span-1 order-2 lg:order-3 border-l border-white/15">
          <GameControls />
        </div>
      </div>

      {/* Dialogs */}
      {promotionMove && (
        <PromotionDialog
          color={playerColor || 'white'}
          onSelect={onPromotionSelect}
          onCancel={cancelPromotion}
        />
      )}

      {status === 'ended' && <GameEndDialog />}
    </div>
  );
}
