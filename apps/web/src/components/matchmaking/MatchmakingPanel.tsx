'use client';

import { useState } from 'react';
import { useGameStore } from '@/store/game';
import { useAuthStore } from '@/store/auth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useWallet } from '@/hooks/useWallet';
import { TIME_CONTROLS, WAGER_PRESETS } from '@chess-game/shared';
import { formatUSDC, formatTime } from '@/lib/utils';
import { USDCAmount } from '../wallet/USDCAmount';

export function MatchmakingPanel() {
  const [selectedTime, setSelectedTime] = useState<keyof typeof TIME_CONTROLS>('blitz_5');
  const [selectedPosition, setSelectedPosition] = useState(100);
  const [customPosition, setCustomPosition] = useState('');

  const { status, queueJoinedAt } = useGameStore();
  const { user } = useAuthStore();
  const { isConnected, usdcBalance, openWalletModal } = useWallet();
  const { joinQueue, leaveQueue } = useWebSocket();

  const timeControl = TIME_CONTROLS[selectedTime];
  const positionSize = customPosition ? parseInt(customPosition) : selectedPosition;
  const balance = parseFloat(usdcBalance) || 0;
  const canAfford = isConnected && balance >= positionSize;

  const handleJoinQueue = () => {
    if (!canAfford) return;
    joinQueue(positionSize, timeControl);
  };

  const handleLeaveQueue = () => {
    leaveQueue();
  };

  if (status === 'queuing') {
    const waitTime = queueJoinedAt ? Math.floor((Date.now() - queueJoinedAt.getTime()) / 1000) : 0;

    return (
      <div className="card max-w-md mx-auto text-center">
        <div className="mb-6">
          <div className="w-12 h-12 mx-auto mb-4 border border-pure-white flex items-center justify-center">
            <span className="animate-blink text-pure-white font-mono text-xl">_</span>
          </div>
          <p className="text-xs font-mono text-mid-light">searching...</p>
          <p className="text-pure-white font-mono">finding opponent</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-3 bg-pure-black border border-mid/30">
            <p className="text-xs font-mono text-mid-light">time</p>
            <p className="text-pure-white font-mono">
              {formatTime(timeControl.initial)}
              {timeControl.increment > 0 && ` +${timeControl.increment}s`}
            </p>
          </div>
          <div className="p-3 bg-pure-black border border-mid/30">
            <p className="text-xs font-mono text-mid-light">position</p>
            <USDCAmount amount={positionSize} size="sm" />
          </div>
        </div>

        <p className="text-sm text-mid-light mb-4 font-mono">
          {formatTime(waitTime)}
        </p>

        <button onClick={handleLeaveQueue} className="btn btn-secondary w-full">
          cancel
        </button>
      </div>
    );
  }

  return (
    <div className="card max-w-md mx-auto">
      <p className="text-xs font-mono text-mid-light mb-1">matchmaking</p>
      <p className="text-xl font-mono text-pure-white mb-6">find_game</p>

      {/* Time Control Selection */}
      <div className="mb-6">
        <p className="text-xs font-mono text-mid-light mb-3">time_control</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(TIME_CONTROLS).map(([key, value]) => {
            const label = key.replace('_', ' ');
            return (
              <button
                key={key}
                onClick={() => setSelectedTime(key as keyof typeof TIME_CONTROLS)}
                className={`p-3 text-left transition-all border font-mono text-sm ${
                  selectedTime === key
                    ? 'bg-pure-white text-pure-black border-pure-white'
                    : 'bg-pure-black border-mid/50 text-mid-light hover:border-light'
                }`}
              >
                <div className="lowercase">{label}</div>
                <div className="text-xs opacity-70">
                  {formatTime(value.initial)}
                  {value.increment > 0 && ` +${value.increment}s`}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Position Size Selection */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
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
        <div className="grid grid-cols-4 gap-2 mb-3">
          {WAGER_PRESETS.map((amount) => (
            <button
              key={amount}
              onClick={() => {
                setSelectedPosition(amount);
                setCustomPosition('');
              }}
              disabled={!isConnected || balance < amount}
              className={`p-2 text-center transition-all border font-mono text-sm ${
                selectedPosition === amount && !customPosition
                  ? 'bg-pure-white text-pure-black border-pure-white'
                  : !isConnected || balance < amount
                  ? 'bg-pure-black border-mid/20 text-mid/30 cursor-not-allowed'
                  : 'bg-pure-black border-mid/50 text-mid-light hover:border-light'
              }`}
            >
              {formatUSDC(amount)}
            </button>
          ))}
        </div>
        <input
          type="number"
          value={customPosition}
          onChange={(e) => setCustomPosition(e.target.value)}
          placeholder="custom_amount..."
          className="input"
          min={10}
          max={balance}
          disabled={!isConnected}
        />
      </div>

      {/* Summary */}
      <div className="p-3 bg-pure-black border border-mid/30 mb-6 font-mono text-sm">
        <div className="flex justify-between mb-2">
          <span className="text-mid-light">your_position</span>
          <USDCAmount amount={positionSize} size="sm" />
        </div>
        <div className="flex justify-between mb-2">
          <span className="text-mid-light">potential_returns</span>
          <USDCAmount amount={positionSize * 2} size="sm" />
        </div>
        <div className="flex justify-between pt-2 border-t border-mid/30">
          <span className="text-mid-light">after_balance</span>
          <USDCAmount amount={Math.max(0, balance - positionSize)} size="sm" />
        </div>
      </div>

      {/* Play Button */}
      {!isConnected ? (
        <button
          onClick={openWalletModal}
          className="w-full btn bg-usdc text-white hover:bg-usdc-light"
        >
          Connect Wallet
        </button>
      ) : (
        <button
          onClick={handleJoinQueue}
          disabled={!canAfford}
          className={`w-full btn ${
            canAfford ? 'btn-primary' : 'bg-off-black text-mid/30 cursor-not-allowed border border-mid/20'
          }`}
        >
          {!canAfford ? 'insufficient_balance' : 'find_game'}
        </button>
      )}
    </div>
  );
}
