'use client';

import { useMemo } from 'react';
import type { ChallengeWithCreator } from '@chess-game/shared';
import { CHALLENGE_TIME_CONTROLS } from '@chess-game/shared';
import { USDCAmount } from '../wallet/USDCAmount';

interface ChallengeAcceptDialogProps {
  challenge: ChallengeWithCreator;
  userBalance: number;
  userElo: number;
  onAccept: () => void;
  onCancel: () => void;
}

// Calculate expected win probability based on ELO difference
function calculateWinProbability(yourElo: number, opponentElo: number): number {
  const eloDiff = opponentElo - yourElo;
  const probability = 1 / (1 + Math.pow(10, eloDiff / 400));
  return Math.round(probability * 100);
}

// Calculate expected ELO change
function calculateExpectedEloChange(yourElo: number, opponentElo: number, kFactor: number = 32): { win: number; loss: number } {
  const winProb = calculateWinProbability(yourElo, opponentElo) / 100;
  const winChange = Math.round(kFactor * (1 - winProb));
  const lossChange = Math.round(kFactor * winProb);
  return { win: winChange, loss: -lossChange };
}

export function ChallengeAcceptDialog({
  challenge,
  userBalance,
  userElo,
  onAccept,
  onCancel,
}: ChallengeAcceptDialogProps) {
  const timeControl =
    CHALLENGE_TIME_CONTROLS[challenge.timeControlKey as keyof typeof CHALLENGE_TIME_CONTROLS];
  const timeLabel = timeControl?.label || challenge.timeControlKey;
  const canAfford = userBalance >= challenge.stakeAmount;

  // Calculate all the metrics
  const analysis = useMemo(() => {
    const opponentElo = challenge.creator.eloRating;
    const eloDiff = opponentElo - userElo;
    const winProb = calculateWinProbability(userElo, opponentElo);
    const eloChange = calculateExpectedEloChange(userElo, opponentElo);
    const riskPercent = userBalance > 0 ? (challenge.stakeAmount / userBalance) * 100 : 100;

    // Opponent stats
    const opponentWinRate = challenge.creator.gamesPlayed > 0
      ? Math.round((challenge.creator.gamesWon / challenge.creator.gamesPlayed) * 100)
      : 0;

    // Risk assessment
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

    // Expected value calculation (simplified)
    const potentialWin = challenge.stakeAmount;
    const potentialLoss = challenge.stakeAmount;
    const expectedValue = (winProb / 100 * potentialWin) - ((100 - winProb) / 100 * potentialLoss);

    return {
      eloDiff,
      winProb,
      eloChange,
      riskPercent,
      riskLevel,
      riskColor,
      opponentWinRate,
      expectedValue,
      balanceAfterWin: userBalance + challenge.stakeAmount,
      balanceAfterLoss: userBalance - challenge.stakeAmount,
    };
  }, [challenge, userElo, userBalance]);

  const isUnderdog = analysis.winProb < 50;
  const isFavorite = analysis.winProb > 50;

  return (
    <div className="fixed inset-0 bg-pure-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-off-black border border-mid/30 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-mid/30">
          <p className="text-xs font-mono text-mid-light">accept_game</p>
          <p className="text-lg font-mono text-pure-white">confirm match</p>
        </div>

        <div className="p-6">
          {/* Opponent vs You Comparison */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Opponent */}
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-mid/20 flex items-center justify-center text-2xl font-mono text-mid-light mb-2">
                {challenge.creator.username[0].toLowerCase()}
              </div>
              <p className="text-pure-white font-mono text-sm truncate">
                {challenge.creator.username}
              </p>
              <p className={`text-lg font-mono ${analysis.eloDiff > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {challenge.creator.eloRating}
              </p>
              <p className="text-xs font-mono text-mid-light">
                {analysis.opponentWinRate}% WR | {challenge.creator.gamesPlayed} games
              </p>
            </div>

            {/* VS */}
            <div className="flex flex-col items-center justify-center">
              <p className="text-2xl font-mono text-mid-light mb-2">VS</p>
              <div className="text-xs font-mono text-mid-light">
                {analysis.eloDiff > 0 ? '+' : ''}{analysis.eloDiff} ELO diff
              </div>
            </div>

            {/* You */}
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-pure-white flex items-center justify-center text-2xl font-mono text-pure-black mb-2">
                you
              </div>
              <p className="text-pure-white font-mono text-sm">you</p>
              <p className={`text-lg font-mono ${analysis.eloDiff < 0 ? 'text-green-400' : 'text-red-400'}`}>
                {userElo}
              </p>
              <p className="text-xs font-mono text-mid-light">
                <USDCAmount amount={userBalance} size="sm" className="inline" /> balance
              </p>
            </div>
          </div>

          {/* Win Probability */}
          <div className="mb-6 p-4 bg-pure-black border border-mid/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-mid-light">your_win_probability</span>
              <span className={`text-lg font-mono font-medium ${
                analysis.winProb >= 50 ? 'text-green-400' : 'text-red-400'
              }`}>
                {analysis.winProb}%
              </span>
            </div>
            <div className="h-3 bg-off-black border border-mid/30 overflow-hidden flex">
              <div
                className={`h-full ${analysis.winProb >= 50 ? 'bg-green-400' : 'bg-red-400'}`}
                style={{ width: `${analysis.winProb}%` }}
              />
              <div
                className="h-full bg-mid/30"
                style={{ width: `${100 - analysis.winProb}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs font-mono text-mid-light">you</span>
              <span className="text-xs font-mono text-mid-light">opponent</span>
            </div>
            {isUnderdog && (
              <p className="text-xs font-mono text-yellow-400 mt-2">
                ⚠ you are the underdog in this match
              </p>
            )}
            {isFavorite && (
              <p className="text-xs font-mono text-green-400 mt-2">
                ★ you are favored to win
              </p>
            )}
          </div>

          {/* Game Details + Stakes in Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Game Details */}
            <div className="p-4 bg-pure-black border border-mid/30">
              <p className="text-xs font-mono text-mid-light mb-3">game_details</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-mono text-mid-light">mode</span>
                  <span className="text-sm font-mono text-pure-white">
                    {challenge.gameMode === 'chess960' ? 'Chess960' : 'Standard'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-mono text-mid-light">time</span>
                  <span className="text-sm font-mono text-pure-white">{timeLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-mono text-mid-light">total_pot</span>
                  <USDCAmount amount={challenge.stakeAmount * 2} size="sm" />
                </div>
              </div>
            </div>

            {/* Stakes */}
            <div className="p-4 bg-pure-black border border-mid/30">
              <p className="text-xs font-mono text-mid-light mb-3">your_stake</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-mono text-mid-light">amount</span>
                  <USDCAmount amount={challenge.stakeAmount} size="sm" />
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-mono text-mid-light">risk</span>
                  <span className={`text-sm font-mono ${analysis.riskColor}`}>
                    {analysis.riskPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-mono text-mid-light">level</span>
                  <span className={`text-sm font-mono ${analysis.riskColor}`}>
                    {analysis.riskLevel.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Outcomes */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* If Win */}
            <div className="p-4 bg-green-500/5 border border-green-500/30">
              <p className="text-xs font-mono text-green-400 mb-2">if_you_win</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm font-mono text-mid-light">balance</span>
                  <span className="text-sm font-mono text-green-400">
                    <USDCAmount amount={analysis.balanceAfterWin} size="sm" className="inline" />
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-mono text-mid-light">elo</span>
                  <span className="text-sm font-mono text-green-400">
                    {userElo} → {userElo + analysis.eloChange.win} (+{analysis.eloChange.win})
                  </span>
                </div>
              </div>
            </div>

            {/* If Lose */}
            <div className="p-4 bg-red-500/5 border border-red-500/30">
              <p className="text-xs font-mono text-red-400 mb-2">if_you_lose</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm font-mono text-mid-light">balance</span>
                  <span className="text-sm font-mono text-red-400">
                    <USDCAmount amount={Math.max(0, analysis.balanceAfterLoss)} size="sm" className="inline" />
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-mono text-mid-light">elo</span>
                  <span className="text-sm font-mono text-red-400">
                    {userElo} → {userElo + analysis.eloChange.loss} ({analysis.eloChange.loss})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Warning if can't afford */}
          {!canAfford && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 mb-6">
              <p className="text-sm font-mono text-red-400">
                ⚠ insufficient balance - you need{' '}
                <USDCAmount amount={challenge.stakeAmount - userBalance} size="sm" className="inline" />{' '}
                more to accept
              </p>
            </div>
          )}

          {/* High risk warning */}
          {canAfford && analysis.riskLevel === 'extreme' && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 mb-6">
              <p className="text-sm font-mono text-red-400">
                ⚠ extreme risk: you're staking {analysis.riskPercent.toFixed(0)}% of your balance
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 p-4 bg-pure-black border border-mid/50 text-mid-light font-mono hover:border-pure-white hover:text-pure-white transition-colors"
            >
              cancel
            </button>
            <button
              onClick={onAccept}
              disabled={!canAfford}
              className={`flex-1 p-4 font-mono transition-all ${
                canAfford
                  ? 'bg-pure-white text-pure-black hover:bg-off-white'
                  : 'bg-off-black text-mid/30 border border-mid/20 cursor-not-allowed'
              }`}
            >
              {canAfford ? 'accept game' : 'insufficient balance'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
