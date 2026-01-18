'use client';

import { useState } from 'react';
import { useSpectatorChatStore } from '@/store/spectatorChat';
import { useWebSocket } from '@/hooks/useWebSocket';
import { USDCAmount } from '../wallet/USDCAmount';
import type { PublicUser } from '@chess-game/shared';

interface CreatePredictionFormProps {
  gameId: string;
  whitePlayer: PublicUser;
  blackPlayer: PublicUser;
  userBalance: number;
}

export function CreatePredictionForm({
  gameId,
  whitePlayer,
  blackPlayer,
  userBalance,
}: CreatePredictionFormProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const { predictionAmount, setPredictionAmount } = useSpectatorChatStore();
  const { createSpectatorPrediction } = useWebSocket();

  const [customAmount, setCustomAmount] = useState('');
  const amount = customAmount ? parseInt(customAmount) : predictionAmount;
  const canAfford = userBalance >= amount;

  const handleCreate = () => {
    if (!selectedPlayer || !canAfford) return;

    createSpectatorPrediction(gameId, selectedPlayer, amount);
    setSelectedPlayer(null);
    setCustomAmount('');
  };

  const presetAmounts = [5, 10, 25, 50];

  return (
    <div className="p-3 bg-pure-black border border-mid/30">
      <p className="text-xs font-mono text-mid-light mb-2">create_prediction</p>

      {/* Player Selection */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={() => setSelectedPlayer(whitePlayer.id)}
          className={`p-2 text-center text-xs font-mono border transition-all ${
            selectedPlayer === whitePlayer.id
              ? 'bg-pure-white text-pure-black border-pure-white'
              : 'bg-pure-black border-mid/50 text-mid-light hover:border-light'
          }`}
        >
          {whitePlayer.username}
          <span className="block text-[10px] opacity-70">white</span>
        </button>
        <button
          onClick={() => setSelectedPlayer(blackPlayer.id)}
          className={`p-2 text-center text-xs font-mono border transition-all ${
            selectedPlayer === blackPlayer.id
              ? 'bg-pure-white text-pure-black border-pure-white'
              : 'bg-pure-black border-mid/50 text-mid-light hover:border-light'
          }`}
        >
          {blackPlayer.username}
          <span className="block text-[10px] opacity-70">black</span>
        </button>
      </div>

      {/* Amount Selection */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        {presetAmounts.map((preset) => (
          <button
            key={preset}
            onClick={() => {
              setPredictionAmount(preset);
              setCustomAmount('');
            }}
            disabled={userBalance < preset}
            className={`p-1 text-xs font-mono border transition-all ${
              predictionAmount === preset && !customAmount
                ? 'bg-pure-white text-pure-black border-pure-white'
                : userBalance < preset
                ? 'bg-pure-black border-mid/20 text-mid/30 cursor-not-allowed'
                : 'bg-pure-black border-mid/50 text-mid-light hover:border-light'
            }`}
          >
            ${preset}
          </button>
        ))}
      </div>

      <input
        type="number"
        value={customAmount}
        onChange={(e) => setCustomAmount(e.target.value)}
        placeholder="custom..."
        className="input text-xs mb-2"
        min={5}
        max={userBalance}
      />

      {/* Create Button */}
      <button
        onClick={handleCreate}
        disabled={!selectedPlayer || !canAfford}
        className={`w-full btn text-xs ${
          selectedPlayer && canAfford
            ? 'btn-primary'
            : 'bg-off-black text-mid/30 cursor-not-allowed border border-mid/20'
        }`}
      >
        {!selectedPlayer
          ? 'select player'
          : !canAfford
          ? 'insufficient balance'
          : `bet ${amount} USDC`}
      </button>
    </div>
  );
}
