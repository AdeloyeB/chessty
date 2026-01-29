'use client';

import { useSpectatorPredictionStore } from '@/store/spectatorPrediction';
import { useAuthStore } from '@/store/auth';
import { useWallet } from '@/hooks/useWallet';
import { useWebSocket } from '@/hooks/useWebSocket';
import { USDCAmount } from '../wallet/USDCAmount';
import { CreatePredictionForm } from './CreatePredictionForm';
import type { PublicUser, SpectatorPredictionWithUsers } from '@chess-game/shared';

interface SpectatorPredictionsProps {
  gameId: string;
  whitePlayer: PublicUser;
  blackPlayer: PublicUser;
}

export function SpectatorPredictions({
  gameId,
  whitePlayer,
  blackPlayer,
}: SpectatorPredictionsProps) {
  const { predictions } = useSpectatorPredictionStore();
  const { user } = useAuthStore();
  const { isConnected, usdcBalance } = useWallet();
  const { acceptSpectatorPrediction } = useWebSocket();

  const balance = parseFloat(usdcBalance) || 0;

  // Filter predictions for this game
  const gamePredictions = predictions.filter((p) => p.gameId === gameId);
  const openPredictions = gamePredictions.filter((p) => p.status === 'open');
  const matchedPredictions = gamePredictions.filter((p) => p.status === 'matched');

  const handleAccept = (prediction: SpectatorPredictionWithUsers) => {
    acceptSpectatorPrediction(prediction.id);
  };

  return (
    <div className="card h-full">
      <p className="text-xs font-mono text-mid-light mb-3">p2p_predictions</p>

      {/* Create Prediction Form */}
      {user && isConnected && (
        <CreatePredictionForm
          gameId={gameId}
          whitePlayer={whitePlayer}
          blackPlayer={blackPlayer}
          userBalance={balance}
        />
      )}

      {/* Open Predictions */}
      <div className="mt-4">
        <p className="text-xs font-mono text-mid-light mb-2">
          open ({openPredictions.length})
        </p>
        {openPredictions.length === 0 ? (
          <p className="text-xs font-mono text-mid text-center py-2">
            no open predictions
          </p>
        ) : (
          <div className="space-y-2">
            {openPredictions.map((prediction) => (
              <PredictionCard
                key={prediction.id}
                prediction={prediction}
                currentUserId={user?.id}
                userBalance={balance}
                onAccept={handleAccept}
              />
            ))}
          </div>
        )}
      </div>

      {/* Matched Predictions */}
      {matchedPredictions.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-mono text-mid-light mb-2">
            matched ({matchedPredictions.length})
          </p>
          <div className="space-y-2">
            {matchedPredictions.map((prediction) => (
              <PredictionCard
                key={prediction.id}
                prediction={prediction}
                currentUserId={user?.id}
                userBalance={balance}
                onAccept={() => {}}
              />
            ))}
          </div>
        </div>
      )}

      {!user && (
        <p className="text-xs font-mono text-mid text-center mt-4">
          login to create predictions
        </p>
      )}
    </div>
  );
}

interface PredictionCardProps {
  prediction: SpectatorPredictionWithUsers;
  currentUserId: string | undefined;
  userBalance: number;
  onAccept: (prediction: SpectatorPredictionWithUsers) => void;
}

function PredictionCard({
  prediction,
  currentUserId,
  userBalance,
  onAccept,
}: PredictionCardProps) {
  const isOwn = prediction.creatorId === currentUserId;
  const isOpen = prediction.status === 'open';
  const canAfford = userBalance >= prediction.amount;
  const canAccept = isOpen && !isOwn && canAfford;

  return (
    <div
      className={`p-3 border text-sm ${
        isOwn
          ? 'bg-off-black border-usdc/30'
          : 'bg-pure-black border-mid/30'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-mid-light">
          {prediction.creator.username}
        </span>
        <USDCAmount amount={prediction.amount} size="sm" />
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-pure-white text-xs">
          bets on {prediction.predictedWinner.username}
        </span>
        {isOpen && !isOwn && (
          <button
            onClick={() => onAccept(prediction)}
            disabled={!canAccept}
            className={`text-xs font-mono px-2 py-1 ${
              canAccept
                ? 'bg-usdc text-white hover:bg-usdc-light'
                : 'bg-mid/20 text-mid/50 cursor-not-allowed'
            }`}
          >
            accept
          </button>
        )}
        {isOwn && isOpen && (
          <span className="text-xs font-mono text-mid-light">your bet</span>
        )}
        {prediction.status === 'matched' && (
          <span className="text-xs font-mono text-usdc">matched</span>
        )}
      </div>
    </div>
  );
}
