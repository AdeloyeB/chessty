'use client';

import { ChessBoard } from '../chess/ChessBoard';
import { useSpectatorStore } from '@/store/spectator';
import { useWebSocket } from '@/hooks/useWebSocket';
import { PredictionPanel } from '../predictions/PredictionPanel';
import { formatTime } from '@/lib/utils';

export function SpectatorView() {
  const {
    currentFen,
    whitePlayer,
    blackPlayer,
    whiteTimeRemaining,
    blackTimeRemaining,
    gameId,
  } = useSpectatorStore();

  const { stopSpectating } = useWebSocket();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-mono text-mid-light mb-1">live</p>
          <h2 className="text-xl font-mono text-pure-white">spectating</h2>
        </div>
        <button onClick={stopSpectating} className="btn btn-secondary">
          leave
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Game Info */}
        <div className="order-2 lg:order-1">
          <div className="card mb-4">
            <p className="text-xs font-mono text-mid-light mb-4">players</p>

            {/* White Player */}
            <div className="flex items-center justify-between p-4 bg-pure-black border border-mid/30 mb-3">
              <div className="flex items-center gap-3">
                <span className="w-4 h-4 bg-pure-white border border-mid" />
                <div>
                  <div className="text-pure-white font-mono">
                    {whitePlayer?.username || 'white'}
                  </div>
                  <div className="text-xs text-light font-mono">
                    {whitePlayer?.eloRating}
                  </div>
                </div>
              </div>
              <div className="font-mono text-lg text-pure-white">
                {formatTime(whiteTimeRemaining)}
              </div>
            </div>

            {/* Black Player */}
            <div className="flex items-center justify-between p-4 bg-pure-black border border-mid/30">
              <div className="flex items-center gap-3">
                <span className="w-4 h-4 bg-pure-black border border-mid" />
                <div>
                  <div className="text-pure-white font-mono">
                    {blackPlayer?.username || 'black'}
                  </div>
                  <div className="text-xs text-light font-mono">
                    {blackPlayer?.eloRating}
                  </div>
                </div>
              </div>
              <div className="font-mono text-lg text-pure-white">
                {formatTime(blackTimeRemaining)}
              </div>
            </div>
          </div>

          {/* Current Turn Indicator */}
          <div className="card text-center">
            <p className="text-xs font-mono text-mid-light mb-2">turn</p>
            <p className="text-pure-white text-lg font-mono">
              {currentFen.split(' ')[1] === 'w' ? 'white' : 'black'}
            </p>
          </div>
        </div>

        {/* Center: Board */}
        <div className="order-1 lg:order-2">
          <div className="aspect-square">
            <ChessBoard
              position={currentFen}
              orientation="white"
            />
          </div>
        </div>

        {/* Right: Prediction Panel */}
        <div className="order-3">
          {gameId && <PredictionPanel gameId={gameId} />}
        </div>
      </div>
    </div>
  );
}
