'use client';

import { Chessboard } from 'react-chessboard';
import { useGameStore } from '@/store/game';
import { useChessGame } from '@/hooks/useChessGame';
import { useWebSocket } from '@/hooks/useWebSocket';
import { GameClock } from './GameClock';
import { MoveHistory } from './MoveHistory';
import { GameControls } from './GameControls';
import { PromotionDialog } from './PromotionDialog';
import { GameEndDialog } from './GameEndDialog';
import { USDCAmount } from '../wallet/USDCAmount';

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

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Move History */}
        <div className="lg:col-span-1 order-3 lg:order-1">
          <MoveHistory />
        </div>

        {/* Center: Chess Board */}
        <div className="lg:col-span-1 order-1 lg:order-2">
          {/* Opponent Info */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-pure-black border border-mid flex items-center justify-center text-pure-white font-mono">
                {(playerColor === 'white' ? blackPlayer : whitePlayer)?.username?.[0]?.toLowerCase()}
              </div>
              <div>
                <div className="text-pure-white font-mono">
                  {(playerColor === 'white' ? blackPlayer : whitePlayer)?.username}
                </div>
                <div className="text-xs text-light font-mono">
                  {(playerColor === 'white' ? blackPlayer : whitePlayer)?.eloRating}
                </div>
              </div>
            </div>
            <GameClock
              time={playerColor === 'white' ? blackTimeRemaining : whiteTimeRemaining}
              isActive={!isMyTurn && status === 'playing'}
            />
          </div>

          {/* Board */}
          <div className="chess-board relative">
            <Chessboard
              position={currentFen}
              onPieceDrop={onDrop}
              onSquareClick={onSquareClick}
              boardOrientation={boardOrientation}
              customSquareStyles={getSquareStyles}
              animationDuration={200}
              areArrowsAllowed={true}
              customBoardStyle={{
                borderRadius: '0',
              }}
              customDarkSquareStyle={{ backgroundColor: '#000000' }}
              customLightSquareStyle={{ backgroundColor: '#ffffff' }}
            />

            {/* Check indicator */}
            {isCheck && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 px-4 py-1 bg-pure-white text-pure-black text-sm font-mono border border-pure-white">
                check
              </div>
            )}

            {/* Turn indicator */}
            <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 px-4 py-1 text-sm font-mono border ${
              isMyTurn
                ? 'bg-pure-white text-pure-black border-pure-white'
                : 'bg-pure-black text-mid-light border-mid/50'
            }`}>
              {isMyTurn ? 'your_turn' : 'opponent_turn'}
            </div>
          </div>

          {/* Player Info */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-pure-white border border-mid flex items-center justify-center text-pure-black font-mono">
                {(playerColor === 'white' ? whitePlayer : blackPlayer)?.username?.[0]?.toLowerCase()}
              </div>
              <div>
                <div className="text-pure-white font-mono">
                  {(playerColor === 'white' ? whitePlayer : blackPlayer)?.username}
                  <span className="ml-2 text-xs text-light">(you)</span>
                </div>
                <div className="text-xs text-light font-mono">
                  {(playerColor === 'white' ? whitePlayer : blackPlayer)?.eloRating}
                </div>
              </div>
            </div>
            <GameClock
              time={playerColor === 'white' ? whiteTimeRemaining : blackTimeRemaining}
              isActive={isMyTurn && status === 'playing'}
            />
          </div>

          {/* Pool Info */}
          {game && (
            <div className="mt-6 p-4 bg-off-black border border-mid/30 text-center">
              <p className="text-xs font-mono text-mid-light mb-1">total_pool</p>
              <USDCAmount amount={game.totalPot} size="lg" className="justify-center" />
            </div>
          )}
        </div>

        {/* Right: Game Controls */}
        <div className="lg:col-span-1 order-2 lg:order-3">
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
