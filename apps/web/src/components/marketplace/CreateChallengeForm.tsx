'use client';

import { useState, useMemo } from 'react';
import type { GameMode } from '@chess-game/shared';
import { CHALLENGE_TIME_CONTROLS, STAKE_PRESETS } from '@chess-game/shared';
import { useChallengeStore } from '@/store/challenge';
import { USDCAmount } from '../wallet/USDCAmount';
import { formatUSDC } from '@/lib/utils';

interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDraw: number;
  peakElo: number;
}

interface CreateChallengeFormProps {
  userBalance: number;
  userElo: number;
  userStats: UserStats;
  isConnected: boolean;
  onSubmit: () => void;
  onOpenWallet: () => void;
}

// Estimate average game duration by time control
const TIME_ESTIMATES: Record<string, { min: number; max: number; avg: number }> = {
  bullet_1: { min: 1, max: 3, avg: 2 },
  blitz_3: { min: 3, max: 8, avg: 5 },
  blitz_5: { min: 5, max: 12, avg: 8 },
  rapid_10: { min: 10, max: 25, avg: 15 },
  rapid_15: { min: 15, max: 35, avg: 22 },
  classical_30: { min: 30, max: 70, avg: 45 },
};

export function CreateChallengeForm({
  userBalance,
  userElo,
  userStats,
  isConnected,
  onSubmit,
  onOpenWallet,
}: CreateChallengeFormProps) {
  const {
    formGameMode,
    formTimeControlKey,
    formStakeAmount,
    formMinElo,
    formMaxElo,
    setFormGameMode,
    setFormTimeControlKey,
    setFormStakeAmount,
    setFormMinElo,
    setFormMaxElo,
  } = useChallengeStore();

  const [customStake, setCustomStake] = useState('');
  const [showEloRange, setShowEloRange] = useState(false);

  const stakeAmount = customStake ? parseInt(customStake) || 0 : formStakeAmount;
  const canAfford = isConnected && userBalance >= stakeAmount && stakeAmount > 0;
  const winRate = userStats.gamesPlayed > 0
    ? Math.round((userStats.gamesWon / userStats.gamesPlayed) * 100)
    : 0;

  // Calculate risk metrics
  const riskMetrics = useMemo(() => {
    const riskPercent = userBalance > 0 ? (stakeAmount / userBalance) * 100 : 100;
    const timeEstimate = TIME_ESTIMATES[formTimeControlKey] || { min: 5, max: 15, avg: 10 };

    // Risk level based on stake % of balance
    let riskLevel: 'low' | 'medium' | 'high' | 'extreme' = 'low';
    let riskColor = 'text-green-400';
    if (riskPercent > 75) {
      riskLevel = 'extreme';
      riskColor = 'text-red-500';
    } else if (riskPercent > 50) {
      riskLevel = 'high';
      riskColor = 'text-red-400';
    } else if (riskPercent > 25) {
      riskLevel = 'medium';
      riskColor = 'text-yellow-400';
    }

    // Potential outcomes
    const potentialWin = stakeAmount * 2;
    const balanceAfterWin = userBalance + stakeAmount;
    const balanceAfterLoss = userBalance - stakeAmount;

    return {
      riskPercent,
      riskLevel,
      riskColor,
      timeEstimate,
      potentialWin,
      balanceAfterWin,
      balanceAfterLoss,
    };
  }, [stakeAmount, userBalance, formTimeControlKey]);

  const handleSubmit = () => {
    if (!canAfford) return;
    if (customStake) {
      setFormStakeAmount(parseInt(customStake));
    }
    onSubmit();
  };

  const handleStakePreset = (amount: number) => {
    setFormStakeAmount(amount);
    setCustomStake('');
  };

  return (
    <div className="bg-off-black border border-mid/30">
      {/* Header */}
      <div className="p-4 border-b border-mid/30">
        <p className="text-xs font-mono text-mid-light">create_game</p>
        <p className="text-lg font-mono text-pure-white">post a new game</p>
      </div>

      <div className="p-6">
        {/* Desktop: Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Left Column: Configuration */}
          <div className="space-y-6">

            {/* Game Mode Selection */}
            <div>
              <p className="text-xs font-mono text-mid-light mb-3">game_mode</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setFormGameMode('standard')}
                  className={`p-4 border transition-all ${
                    formGameMode === 'standard'
                      ? 'bg-pure-white text-pure-black border-pure-white'
                      : 'bg-pure-black border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
                  }`}
                >
                  <div className="text-3xl mb-2">&#9812;</div>
                  <div className="font-mono text-sm font-medium">standard</div>
                  <div className="text-xs opacity-60 mt-1">classic chess rules</div>
                </button>
                <button
                  onClick={() => setFormGameMode('chess960')}
                  className={`p-4 border transition-all ${
                    formGameMode === 'chess960'
                      ? 'bg-pure-white text-pure-black border-pure-white'
                      : 'bg-pure-black border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
                  }`}
                >
                  <div className="text-3xl mb-2">&#9812;?</div>
                  <div className="font-mono text-sm font-medium">chess960</div>
                  <div className="text-xs opacity-60 mt-1">randomized start</div>
                </button>
              </div>
            </div>

            {/* Time Control Selection */}
            <div>
              <p className="text-xs font-mono text-mid-light mb-3">time_control</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(CHALLENGE_TIME_CONTROLS).map(([key, value]) => {
                  const estimate = TIME_ESTIMATES[key];
                  return (
                    <button
                      key={key}
                      onClick={() => setFormTimeControlKey(key)}
                      className={`p-3 border transition-all text-left ${
                        formTimeControlKey === key
                          ? 'bg-pure-white text-pure-black border-pure-white'
                          : 'bg-pure-black border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
                      }`}
                    >
                      <div className="font-mono text-sm font-medium">{value.label}</div>
                      {estimate && (
                        <div className="text-xs opacity-60 mt-0.5">
                          ~{estimate.avg} min
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stake Selection */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-mono text-mid-light">stake_amount</p>
                {isConnected ? (
                  <p className="text-xs font-mono text-mid-light">
                    <USDCAmount amount={userBalance} size="sm" className="inline" /> available
                  </p>
                ) : (
                  <button
                    onClick={onOpenWallet}
                    className="text-xs font-mono text-usdc hover:text-usdc-light"
                  >
                    connect wallet
                  </button>
                )}
              </div>

              {/* Stake Presets */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                {STAKE_PRESETS.slice(0, 4).map((amount) => {
                  const isSelected = formStakeAmount === amount && !customStake;
                  const affordable = isConnected && userBalance >= amount;
                  return (
                    <button
                      key={amount}
                      onClick={() => handleStakePreset(amount)}
                      disabled={!affordable}
                      className={`p-2 border font-mono text-sm transition-all ${
                        isSelected
                          ? 'bg-pure-white text-pure-black border-pure-white'
                          : !affordable
                          ? 'bg-pure-black border-mid/20 text-mid/30 cursor-not-allowed'
                          : 'bg-pure-black border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
                      }`}
                    >
                      {formatUSDC(amount)}
                    </button>
                  );
                })}
              </div>

              {/* Custom Stake Input */}
              <div className="relative">
                <input
                  type="number"
                  value={customStake}
                  onChange={(e) => setCustomStake(e.target.value)}
                  placeholder="custom amount..."
                  className="w-full bg-pure-black border border-mid/50 text-pure-white px-4 py-3 font-mono text-sm placeholder:text-mid focus:border-pure-white focus:outline-none"
                  min={1}
                  max={userBalance}
                  disabled={!isConnected}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-mid-light">
                  USDC
                </span>
              </div>
            </div>

            {/* ELO Range (Optional) */}
            <div>
              <button
                onClick={() => setShowEloRange(!showEloRange)}
                className="text-xs font-mono text-mid-light hover:text-pure-white transition-colors"
              >
                {showEloRange ? '− hide' : '+'} elo_restrictions (optional)
              </button>

              {showEloRange && (
                <div className="mt-3 p-4 bg-pure-black border border-mid/30">
                  <p className="text-xs font-mono text-mid mb-3">
                    limit who can accept your challenge
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-mono text-mid-light mb-1">min_elo</p>
                      <input
                        type="number"
                        value={formMinElo || ''}
                        onChange={(e) =>
                          setFormMinElo(e.target.value ? parseInt(e.target.value) : null)
                        }
                        placeholder={String(Math.max(0, userElo - 300))}
                        className="w-full bg-off-black border border-mid/50 text-pure-white px-3 py-2 font-mono text-sm placeholder:text-mid focus:border-pure-white focus:outline-none"
                        min={0}
                        max={3000}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-mono text-mid-light mb-1">max_elo</p>
                      <input
                        type="number"
                        value={formMaxElo || ''}
                        onChange={(e) =>
                          setFormMaxElo(e.target.value ? parseInt(e.target.value) : null)
                        }
                        placeholder={String(userElo + 300)}
                        className="w-full bg-off-black border border-mid/50 text-pure-white px-3 py-2 font-mono text-sm placeholder:text-mid focus:border-pure-white focus:outline-none"
                        min={0}
                        max={3000}
                      />
                    </div>
                  </div>
                  <p className="text-xs font-mono text-mid mt-2">
                    your elo: {userElo}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Summary & Analysis */}
          <div className="space-y-4">

            {/* Your Stats Summary */}
            <div className="p-4 bg-pure-black border border-mid/30">
              <p className="text-xs font-mono text-mid-light mb-3">your_stats</p>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-xl font-mono text-pure-white">{userElo}</p>
                  <p className="text-xs font-mono text-mid-light">elo</p>
                </div>
                <div>
                  <p className="text-xl font-mono text-pure-white">{userStats.peakElo}</p>
                  <p className="text-xs font-mono text-mid-light">peak</p>
                </div>
                <div>
                  <p className="text-xl font-mono text-pure-white">{winRate}%</p>
                  <p className="text-xs font-mono text-mid-light">win_rate</p>
                </div>
                <div>
                  <p className="text-xl font-mono text-pure-white">{userStats.gamesPlayed}</p>
                  <p className="text-xs font-mono text-mid-light">games</p>
                </div>
              </div>
            </div>

            {/* Game Summary */}
            <div className="p-4 bg-pure-black border border-mid/30">
              <p className="text-xs font-mono text-mid-light mb-3">game_summary</p>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-mono text-mid-light">mode</span>
                  <span className="text-sm font-mono text-pure-white">
                    {formGameMode === 'chess960' ? 'Chess960' : 'Standard'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-mono text-mid-light">time</span>
                  <span className="text-sm font-mono text-pure-white">
                    {CHALLENGE_TIME_CONTROLS[formTimeControlKey as keyof typeof CHALLENGE_TIME_CONTROLS]?.label}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-mono text-mid-light">est_duration</span>
                  <span className="text-sm font-mono text-pure-white">
                    {riskMetrics.timeEstimate.min}-{riskMetrics.timeEstimate.max} min
                  </span>
                </div>

                <div className="border-t border-mid/30 pt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono text-mid-light">your_stake</span>
                    <USDCAmount amount={stakeAmount} size="sm" />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-mono text-mid-light">total_pot</span>
                  <USDCAmount amount={riskMetrics.potentialWin} size="sm" />
                </div>
              </div>
            </div>

            {/* Risk Assessment */}
            <div className="p-4 bg-pure-black border border-mid/30">
              <p className="text-xs font-mono text-mid-light mb-3">risk_assessment</p>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-mono text-mid-light">risk_level</span>
                  <span className={`text-sm font-mono font-medium ${riskMetrics.riskColor}`}>
                    {riskMetrics.riskLevel.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-mono text-mid-light">% of balance</span>
                  <span className={`text-sm font-mono ${riskMetrics.riskColor}`}>
                    {riskMetrics.riskPercent.toFixed(1)}%
                  </span>
                </div>

                {/* Risk Bar */}
                <div className="h-2 bg-off-black border border-mid/30 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      riskMetrics.riskLevel === 'extreme' ? 'bg-red-500' :
                      riskMetrics.riskLevel === 'high' ? 'bg-red-400' :
                      riskMetrics.riskLevel === 'medium' ? 'bg-yellow-400' :
                      'bg-green-400'
                    }`}
                    style={{ width: `${Math.min(100, riskMetrics.riskPercent)}%` }}
                  />
                </div>

                <div className="border-t border-mid/30 pt-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono text-mid-light">if_win</span>
                    <span className="text-sm font-mono text-green-400">
                      <USDCAmount amount={riskMetrics.balanceAfterWin} size="sm" className="inline" />
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono text-mid-light">if_lose</span>
                    <span className="text-sm font-mono text-red-400">
                      <USDCAmount amount={Math.max(0, riskMetrics.balanceAfterLoss)} size="sm" className="inline" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              {!isConnected ? (
                <button
                  onClick={onOpenWallet}
                  className="w-full p-4 bg-usdc text-white font-mono hover:bg-usdc-light transition-colors"
                >
                  connect wallet to play
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!canAfford}
                  className={`w-full p-4 font-mono transition-all ${
                    canAfford
                      ? 'bg-pure-white text-pure-black hover:bg-off-white'
                      : 'bg-off-black text-mid/30 border border-mid/20 cursor-not-allowed'
                  }`}
                >
                  {!canAfford
                    ? stakeAmount > userBalance
                      ? 'insufficient balance'
                      : 'enter stake amount'
                    : 'create game'}
                </button>
              )}
            </div>

            {/* Warning for high risk */}
            {canAfford && riskMetrics.riskLevel === 'extreme' && (
              <div className="p-3 border border-red-500/50 bg-red-500/10">
                <p className="text-xs font-mono text-red-400">
                  ⚠ high risk: staking {riskMetrics.riskPercent.toFixed(0)}% of your balance
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
