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
    <div className="bg-black border border-white/15">
      {/* Header */}
      <div className="p-4 border-b border-white/15">
        <p className="text-xs font-mono text-white/50 lowercase">create_game</p>
        <p className="text-lg font-mono text-white lowercase">post a new game</p>
      </div>

      <div className="p-6">
        {/* Desktop: Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Left Column: Configuration */}
          <div className="space-y-6">

            {/* Game Mode Selection */}
            <div>
              <p className="text-xs font-mono text-white/50 mb-3 lowercase">game_mode</p>
              <div className="flex">
                <button
                  onClick={() => setFormGameMode('standard')}
                  className={`flex-1 p-4 border-y border-l border-r border-white/15 transition-all ${
                    formGameMode === 'standard'
                      ? 'bg-white text-black'
                      : 'bg-black text-white/50 hover:text-white'
                  }`}
                >
                  <div className="text-3xl mb-2">&#9812;</div>
                  <div className="font-mono text-sm font-medium lowercase">standard</div>
                  <div className="text-xs opacity-60 mt-1 lowercase">classic chess rules</div>
                </button>
                <button
                  onClick={() => setFormGameMode('chess960')}
                  className={`flex-1 p-4 border-y border-r border-white/15 transition-all ${
                    formGameMode === 'chess960'
                      ? 'bg-white text-black'
                      : 'bg-black text-white/50 hover:text-white'
                  }`}
                >
                  <div className="text-3xl mb-2">&#9812;?</div>
                  <div className="font-mono text-sm font-medium lowercase">chess960</div>
                  <div className="text-xs opacity-60 mt-1 lowercase">randomized start</div>
                </button>
              </div>
            </div>

            {/* Time Control Selection */}
            <div>
              <p className="text-xs font-mono text-white/50 mb-3 lowercase">time_control</p>
              <div className="grid grid-cols-3 border border-white/15">
                {Object.entries(CHALLENGE_TIME_CONTROLS).map(([key, value], index) => {
                  const estimate = TIME_ESTIMATES[key];
                  const isLastInRow = (index + 1) % 3 === 0;
                  const isLastRow = index >= Object.keys(CHALLENGE_TIME_CONTROLS).length - 3;
                  return (
                    <button
                      key={key}
                      onClick={() => setFormTimeControlKey(key)}
                      className={`p-3 transition-all text-left ${
                        !isLastInRow ? 'border-r border-white/15' : ''
                      } ${!isLastRow ? 'border-b border-white/15' : ''} ${
                        formTimeControlKey === key
                          ? 'bg-white text-black'
                          : 'bg-black text-white/50 hover:text-white'
                      }`}
                    >
                      <div className="font-mono text-sm font-medium lowercase">{value.label}</div>
                      {estimate && (
                        <div className="text-xs opacity-60 mt-0.5 lowercase">
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
                <p className="text-xs font-mono text-white/50 lowercase">stake_amount</p>
                {isConnected ? (
                  <p className="text-xs font-mono text-white/50 lowercase">
                    <USDCAmount amount={userBalance} size="sm" className="inline" /> available
                  </p>
                ) : (
                  <button
                    onClick={onOpenWallet}
                    className="text-xs font-mono text-usdc hover:text-usdc-light lowercase"
                  >
                    connect wallet
                  </button>
                )}
              </div>

              {/* Stake Presets */}
              <div className="flex mb-3">
                {STAKE_PRESETS.slice(0, 4).map((amount, index) => {
                  const isSelected = formStakeAmount === amount && !customStake;
                  const affordable = isConnected && userBalance >= amount;
                  const isFirst = index === 0;
                  return (
                    <button
                      key={amount}
                      onClick={() => handleStakePreset(amount)}
                      disabled={!affordable}
                      className={`flex-1 p-2 font-mono text-sm transition-all border-y border-r ${
                        isFirst ? 'border-l' : ''
                      } border-white/15 ${
                        isSelected
                          ? 'bg-white text-black'
                          : !affordable
                          ? 'bg-black text-white/20 cursor-not-allowed'
                          : 'bg-black text-white/50 hover:text-white'
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
                  className="w-full bg-black border border-white/15 text-white px-4 py-3 font-mono text-sm placeholder:text-white/30 focus:border-white focus:outline-none lowercase"
                  min={1}
                  max={userBalance}
                  disabled={!isConnected}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-white/50">
                  USDC
                </span>
              </div>
            </div>

            {/* ELO Range (Optional) */}
            <div>
              <button
                onClick={() => setShowEloRange(!showEloRange)}
                className="text-xs font-mono text-white/50 hover:text-white transition-colors lowercase"
              >
                {showEloRange ? '− hide' : '+'} elo_restrictions (optional)
              </button>

              {showEloRange && (
                <div className="mt-3 p-4 bg-black border border-white/15">
                  <p className="text-xs font-mono text-white/30 mb-3 lowercase">
                    limit who can accept your challenge
                  </p>
                  <div className="flex">
                    <div className="flex-1 border border-white/15 border-r-0 p-3">
                      <p className="text-xs font-mono text-white/50 mb-1 lowercase">min_elo</p>
                      <input
                        type="number"
                        value={formMinElo || ''}
                        onChange={(e) =>
                          setFormMinElo(e.target.value ? parseInt(e.target.value) : null)
                        }
                        placeholder={String(Math.max(0, userElo - 300))}
                        className="w-full bg-black border border-white/15 text-white px-3 py-2 font-mono text-sm placeholder:text-white/30 focus:border-white focus:outline-none"
                        min={0}
                        max={3000}
                      />
                    </div>
                    <div className="flex-1 border border-white/15 p-3">
                      <p className="text-xs font-mono text-white/50 mb-1 lowercase">max_elo</p>
                      <input
                        type="number"
                        value={formMaxElo || ''}
                        onChange={(e) =>
                          setFormMaxElo(e.target.value ? parseInt(e.target.value) : null)
                        }
                        placeholder={String(userElo + 300)}
                        className="w-full bg-black border border-white/15 text-white px-3 py-2 font-mono text-sm placeholder:text-white/30 focus:border-white focus:outline-none"
                        min={0}
                        max={3000}
                      />
                    </div>
                  </div>
                  <p className="text-xs font-mono text-white/30 mt-2 lowercase">
                    your elo: {userElo}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Summary & Analysis */}
          <div className="space-y-4">

            {/* Your Stats Summary */}
            <div className="bg-black border border-white/15">
              <div className="p-3 border-b border-white/15">
                <p className="text-xs font-mono text-white/50 lowercase">your_stats</p>
              </div>
              <div className="grid grid-cols-4">
                <div className="p-3 text-center border-r border-white/15">
                  <p className="text-xl font-mono text-white">{userElo}</p>
                  <p className="text-xs font-mono text-white/50 lowercase">elo</p>
                </div>
                <div className="p-3 text-center border-r border-white/15">
                  <p className="text-xl font-mono text-white">{userStats.peakElo}</p>
                  <p className="text-xs font-mono text-white/50 lowercase">peak</p>
                </div>
                <div className="p-3 text-center border-r border-white/15">
                  <p className={`text-xl font-mono ${winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>{winRate}%</p>
                  <p className="text-xs font-mono text-white/50 lowercase">win_rate</p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-xl font-mono text-white">{userStats.gamesPlayed}</p>
                  <p className="text-xs font-mono text-white/50 lowercase">games</p>
                </div>
              </div>
            </div>

            {/* Game Summary */}
            <div className="bg-black border border-white/15">
              <div className="p-3 border-b border-white/15">
                <p className="text-xs font-mono text-white/50 lowercase">game_summary</p>
              </div>

              <div className="divide-y divide-white/15">
                <div className="flex justify-between items-center p-3">
                  <span className="text-sm font-mono text-white/50 lowercase">mode</span>
                  <span className="text-sm font-mono text-white lowercase">
                    {formGameMode === 'chess960' ? 'chess960' : 'standard'}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3">
                  <span className="text-sm font-mono text-white/50 lowercase">time</span>
                  <span className="text-sm font-mono text-white lowercase">
                    {CHALLENGE_TIME_CONTROLS[formTimeControlKey as keyof typeof CHALLENGE_TIME_CONTROLS]?.label}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3">
                  <span className="text-sm font-mono text-white/50 lowercase">est_duration</span>
                  <span className="text-sm font-mono text-white lowercase">
                    {riskMetrics.timeEstimate.min}-{riskMetrics.timeEstimate.max} min
                  </span>
                </div>
                <div className="flex justify-between items-center p-3">
                  <span className="text-sm font-mono text-white/50 lowercase">your_stake</span>
                  <USDCAmount amount={stakeAmount} size="sm" />
                </div>
                <div className="flex justify-between items-center p-3">
                  <span className="text-sm font-mono text-white/50 lowercase">total_pot</span>
                  <USDCAmount amount={riskMetrics.potentialWin} size="sm" />
                </div>
              </div>
            </div>

            {/* Risk Assessment */}
            <div className="bg-black border border-white/15">
              <div className="p-3 border-b border-white/15">
                <p className="text-xs font-mono text-white/50 lowercase">risk_assessment</p>
              </div>

              <div className="divide-y divide-white/15">
                <div className="flex justify-between items-center p-3">
                  <span className="text-sm font-mono text-white/50 lowercase">risk_level</span>
                  <span className={`text-sm font-mono font-medium lowercase ${riskMetrics.riskColor}`}>
                    {riskMetrics.riskLevel}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3">
                  <span className="text-sm font-mono text-white/50 lowercase">% of balance</span>
                  <span className={`text-sm font-mono ${riskMetrics.riskColor}`}>
                    {riskMetrics.riskPercent.toFixed(1)}%
                  </span>
                </div>

                {/* Risk Bar */}
                <div className="p-3">
                  <div className="h-2 bg-black border border-white/15 overflow-hidden">
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
                </div>

                <div className="flex justify-between items-center p-3">
                  <span className="text-sm font-mono text-white/50 lowercase">if_win</span>
                  <span className="text-sm font-mono text-green-400">
                    <USDCAmount amount={riskMetrics.balanceAfterWin} size="sm" className="inline" />
                  </span>
                </div>
                <div className="flex justify-between items-center p-3">
                  <span className="text-sm font-mono text-white/50 lowercase">if_lose</span>
                  <span className="text-sm font-mono text-red-400">
                    <USDCAmount amount={Math.max(0, riskMetrics.balanceAfterLoss)} size="sm" className="inline" />
                  </span>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              {!isConnected ? (
                <button
                  onClick={onOpenWallet}
                  className="w-full p-4 bg-usdc text-white font-mono hover:bg-usdc-light transition-colors lowercase"
                >
                  connect wallet to play
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!canAfford}
                  className={`w-full p-4 font-mono transition-all lowercase ${
                    canAfford
                      ? 'bg-white text-black hover:bg-white/90'
                      : 'bg-black text-white/20 border border-white/15 cursor-not-allowed'
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
              <div className="p-3 border border-red-500/30 bg-red-500/10">
                <p className="text-xs font-mono text-red-400 lowercase">
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
