'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { useAuthStore } from '@/store/auth';
import { useSpectatorStore } from '@/store/spectator';
import { formatUSDC, formatProbability } from '@/lib/utils';
import { USDCAmount } from '@/components/wallet/USDCAmount';
import { useWallet } from '@/hooks/useWallet';

interface PredictionPanelProps {
  gameId: string;
}

export function PredictionPanel({ gameId }: PredictionPanelProps) {
  const [positionSize, setPositionSize] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { user } = useAuthStore();
  const { whitePlayer, blackPlayer, whiteOdds, blackOdds } = useSpectatorStore();
  const { placeBet, getGameOdds } = useApi();
  const { isConnected, usdcBalance, openWalletModal } = useWallet();
  const queryClient = useQueryClient();

  // Fetch odds (probabilities)
  useQuery({
    queryKey: ['odds', gameId],
    queryFn: () => getGameOdds(gameId),
    refetchInterval: 3000,
  });

  const positionMutation = useMutation({
    mutationFn: (data: { betOnPlayerId: string; amount: number }) =>
      placeBet(gameId, data.betOnPlayerId, data.amount),
    onSuccess: () => {
      setPositionSize('');
      setSelectedPlayer(null);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['balance'] });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const amount = parseFloat(positionSize) || 0;
  const balance = parseFloat(usdcBalance) || 0;
  const selectedOdds =
    selectedPlayer === whitePlayer?.id
      ? whiteOdds
      : selectedPlayer === blackPlayer?.id
      ? blackOdds
      : 0;
  const potentialReturns = amount * selectedOdds;
  const canTakePosition = amount > 0 && selectedPlayer && isConnected && balance >= amount;

  const handleTakePosition = () => {
    if (!canTakePosition || !selectedPlayer) return;
    positionMutation.mutate({
      betOnPlayerId: selectedPlayer,
      amount,
    });
  };

  return (
    <div className="card">
      <p className="text-xs font-mono text-mid-light mb-4">predictions</p>

      {/* Player Selection */}
      <div className="space-y-3 mb-6">
        <button
          onClick={() => setSelectedPlayer(whitePlayer?.id || null)}
          className={`w-full p-4 flex items-center justify-between transition-all duration-150 border ${
            selectedPlayer === whitePlayer?.id
              ? 'bg-pure-white text-pure-black border-pure-white'
              : 'bg-pure-black border-mid/50 text-mid-light hover:border-light'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`w-4 h-4 border ${selectedPlayer === whitePlayer?.id ? 'bg-pure-black border-pure-black' : 'bg-pure-white border-mid'}`} />
            <span className="font-mono">{whitePlayer?.username || 'white'}</span>
          </div>
          <div className="font-mono text-usdc">{formatProbability(whiteOdds)}</div>
        </button>

        <button
          onClick={() => setSelectedPlayer(blackPlayer?.id || null)}
          className={`w-full p-4 flex items-center justify-between transition-all duration-150 border ${
            selectedPlayer === blackPlayer?.id
              ? 'bg-pure-white text-pure-black border-pure-white'
              : 'bg-pure-black border-mid/50 text-mid-light hover:border-light'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`w-4 h-4 border ${selectedPlayer === blackPlayer?.id ? 'bg-pure-black border-pure-black' : 'bg-pure-black border-mid'}`} />
            <span className="font-mono">{blackPlayer?.username || 'black'}</span>
          </div>
          <div className="font-mono text-usdc">{formatProbability(blackOdds)}</div>
        </button>
      </div>

      {/* Position Size */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-mono text-mid-light">position_size</p>
          {isConnected ? (
            <p className="text-xs font-mono">
              <USDCAmount amount={usdcBalance} size="sm" /> available
            </p>
          ) : (
            <button
              onClick={openWalletModal}
              className="text-xs font-mono text-usdc hover:text-usdc-light"
            >
              connect wallet
            </button>
          )}
        </div>
        <input
          type="number"
          value={positionSize}
          onChange={(e) => setPositionSize(e.target.value)}
          placeholder="enter amount..."
          className="input"
          min={5}
          max={balance}
          disabled={!isConnected}
        />

        {/* Quick amounts */}
        <div className="flex gap-2 mt-3">
          {[10, 25, 50, 100].map((amt) => (
            <button
              key={amt}
              onClick={() => setPositionSize(amt.toString())}
              disabled={!isConnected || balance < amt}
              className={`flex-1 py-2 text-xs font-mono transition-all duration-150 border ${
                !isConnected || balance < amt
                  ? 'bg-pure-black border-mid/20 text-mid/30 cursor-not-allowed'
                  : 'bg-pure-black border-mid/50 text-mid-light hover:border-light'
              }`}
            >
              {amt}
            </button>
          ))}
        </div>
      </div>

      {/* Returns Preview */}
      {selectedPlayer && amount > 0 && (
        <div className="p-4 bg-pure-black border border-mid/30 mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-mid-light font-mono">your_position</span>
            <USDCAmount amount={amount} size="sm" />
          </div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-mid-light font-mono">probability</span>
            <span className="text-usdc font-mono">{formatProbability(selectedOdds)}</span>
          </div>
          <div className="flex justify-between text-sm pt-3 border-t border-mid/30">
            <span className="text-mid-light font-mono">potential_returns</span>
            <USDCAmount amount={potentialReturns} size="sm" />
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-pure-black border border-mid text-light text-sm font-mono mb-4">
          error: {error}
        </div>
      )}

      {!isConnected ? (
        <button
          onClick={openWalletModal}
          className="w-full btn bg-usdc text-white hover:bg-usdc-light"
        >
          Connect Wallet
        </button>
      ) : (
        <button
          onClick={handleTakePosition}
          disabled={!canTakePosition || positionMutation.isPending}
          className={`w-full btn ${
            canTakePosition ? 'btn-primary' : 'bg-off-black text-mid/30 cursor-not-allowed border border-mid/20'
          }`}
        >
          {positionMutation.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-blink">_</span>
              taking position...
            </span>
          ) : (
            'take_position'
          )}
        </button>
      )}

      <p className="text-xs text-mid font-mono mt-4 text-center">
        5% platform fee applied
      </p>
    </div>
  );
}
