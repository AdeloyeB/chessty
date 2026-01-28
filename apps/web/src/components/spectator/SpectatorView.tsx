'use client';

import { ChessBoard } from '../chess/ChessBoard';
import { useSpectatorStore } from '@/store/spectator';
import { useMultiSpectatorStore } from '@/store/multiSpectator';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useFeatureFlag } from '@/store/flags';
import { PredictionPanel } from '../predictions/PredictionPanel';
import { formatTime } from '@/lib/utils';

interface SpectatorViewProps {
  /** When provided, reads game data from the multi-spectator store.
   *  When omitted, falls back to the legacy single-game spectator store. */
  gameId?: string;
}

export function SpectatorView({ gameId: gameIdProp }: SpectatorViewProps) {
  // Multi-game store (used when gameId prop is provided)
  const multiGame = useMultiSpectatorStore((s) =>
    gameIdProp ? s.games[gameIdProp] : null
  );

  // Legacy single-game store (fallback when no gameId prop)
  const legacyStore = useSpectatorStore();

  // Resolve values: multi-game store takes priority when prop is given
  const currentFen = multiGame?.currentFen ?? legacyStore.currentFen;
  const whitePlayer = multiGame?.whitePlayer ?? legacyStore.whitePlayer;
  const blackPlayer = multiGame?.blackPlayer ?? legacyStore.blackPlayer;
  const whiteTimeRemaining = multiGame?.whiteTimeRemaining ?? legacyStore.whiteTimeRemaining;
  const blackTimeRemaining = multiGame?.blackTimeRemaining ?? legacyStore.blackTimeRemaining;
  const resolvedGameId = gameIdProp ?? legacyStore.gameId;

  const { stopSpectating, stopSpectatingGame } = useWebSocket();
  const predictionsEnabled = useFeatureFlag('spectator_predictions');
  const multiGameEnabled = useFeatureFlag('spectator_multi_game');

  const handleLeave = () => {
    if (gameIdProp && multiGameEnabled) {
      stopSpectatingGame(gameIdProp);
    } else {
      stopSpectating();
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-mono text-mid-light mb-1">live</p>
          <h2 className="text-xl font-mono text-pure-white">spectating</h2>
        </div>
        <button onClick={handleLeave} className="btn btn-secondary">
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

        {/* Right: Prediction Panel (gated by spectator_predictions flag) */}
        {predictionsEnabled && (
          <div className="order-3">
            {resolvedGameId && <PredictionPanel gameId={resolvedGameId} />}
          </div>
        )}
      </div>
    </div>
  );
}
