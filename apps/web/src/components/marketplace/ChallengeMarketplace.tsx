'use client';

import { useState, useEffect, useMemo } from 'react';
import { useChallengeStore } from '@/store/challenge';
import { useAuthStore } from '@/store/auth';
import { useWallet } from '@/hooks/useWallet';
import { useWebSocket } from '@/hooks/useWebSocket';
import { CreateChallengeForm } from './CreateChallengeForm';
import { ChallengeTable } from './ChallengeTable';
import { MyChallengePanel } from './MyChallengePanel';
import { ChallengeAcceptDialog } from './ChallengeAcceptDialog';
import { USDCAmount } from '../wallet/USDCAmount';
import type { ChallengeWithCreator, GameMode } from '@chess-game/shared';
import { CHALLENGE_TIME_CONTROLS } from '@chess-game/shared';

type ViewMode = 'browse' | 'create';

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

export function ChallengeMarketplace() {
  const [viewMode, setViewMode] = useState<ViewMode>('browse');
  const [challengeToAccept, setChallengeToAccept] = useState<ChallengeWithCreator | null>(null);
  const [sortBy, setSortBy] = useState<'stake' | 'elo' | 'time' | 'winProb'>('stake');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterMode, setFilterMode] = useState<GameMode | 'all'>('all');
  const [filterTime, setFilterTime] = useState<string>('all');

  const { user } = useAuthStore();
  const { isConnected, usdcBalance, openWalletModal } = useWallet();
  const {
    uiState,
    challenges,
    myChallenge,
    formGameMode,
    formTimeControlKey,
    formStakeAmount,
    formMinElo,
    formMaxElo,
  } = useChallengeStore();

  const {
    createChallenge,
    cancelChallenge,
    acceptChallenge,
    confirmChallenge,
    declineChallenge,
  } = useWebSocket();

  const balance = parseFloat(usdcBalance) || 0;
  const userElo = user?.eloRating || 1200;

  // Enhanced challenges with calculated metrics
  const enhancedChallenges = useMemo(() => {
    return challenges
      .filter(c => c.creatorId !== user?.id) // Don't show own challenges in browse
      .map(challenge => {
        const winProb = calculateWinProbability(userElo, challenge.creator.eloRating);
        const eloChange = calculateExpectedEloChange(userElo, challenge.creator.eloRating);
        const riskPercent = balance > 0 ? (challenge.stakeAmount / balance) * 100 : 100;
        const eloDiff = challenge.creator.eloRating - userElo;
        const creatorWinRate = challenge.creator.gamesPlayed > 0
          ? Math.round((challenge.creator.gamesWon / challenge.creator.gamesPlayed) * 100)
          : 0;

        return {
          ...challenge,
          winProb,
          eloChange,
          riskPercent,
          eloDiff,
          creatorWinRate,
        };
      });
  }, [challenges, userElo, balance, user?.id]);

  // Filter and sort
  const filteredChallenges = useMemo(() => {
    let filtered = enhancedChallenges;

    if (filterMode !== 'all') {
      filtered = filtered.filter(c => c.gameMode === filterMode);
    }
    if (filterTime !== 'all') {
      filtered = filtered.filter(c => c.timeControlKey === filterTime);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'stake':
          comparison = a.stakeAmount - b.stakeAmount;
          break;
        case 'elo':
          comparison = a.creator.eloRating - b.creator.eloRating;
          break;
        case 'time':
          comparison = a.timeControl.initial - b.timeControl.initial;
          break;
        case 'winProb':
          comparison = a.winProb - b.winProb;
          break;
      }
      return sortDir === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [enhancedChallenges, filterMode, filterTime, sortBy, sortDir]);

  // Stats calculations
  const marketStats = useMemo(() => {
    const total = challenges.length;
    const totalStake = challenges.reduce((sum, c) => sum + c.stakeAmount, 0);
    const avgStake = total > 0 ? totalStake / total : 0;
    const standardCount = challenges.filter(c => c.gameMode === 'standard').length;
    const chess960Count = challenges.filter(c => c.gameMode === 'chess960').length;
    const affordableCount = enhancedChallenges.filter(c => c.stakeAmount <= balance).length;

    return { total, totalStake, avgStake, standardCount, chess960Count, affordableCount };
  }, [challenges, enhancedChallenges, balance]);

  // Show my challenge panel if I have an active challenge
  if (myChallenge && (uiState === 'waiting' || uiState === 'accepted' || uiState === 'confirming')) {
    return (
      <MyChallengePanel
        challenge={myChallenge}
        currentUserId={user?.id || ''}
        onCancel={() => cancelChallenge(myChallenge.id)}
        onConfirm={() => confirmChallenge(myChallenge.id)}
        onDecline={() => declineChallenge(myChallenge.id)}
      />
    );
  }

  const handleCreateChallenge = () => {
    createChallenge({
      gameMode: formGameMode,
      timeControlKey: formTimeControlKey,
      stakeAmount: formStakeAmount,
      minElo: formMinElo || undefined,
      maxElo: formMaxElo || undefined,
    });
  };

  const handleAcceptClick = (challengeId: string) => {
    const challenge = enhancedChallenges.find((c) => c.id === challengeId);
    if (challenge) {
      setChallengeToAccept(challenge);
    }
  };

  const handleAcceptConfirm = () => {
    if (challengeToAccept) {
      acceptChallenge(challengeToAccept.id);
      setChallengeToAccept(null);
    }
  };

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDir('desc');
    }
  };

  return (
    <div className="w-full">
      {/* Desktop Layout: 3-column grid */}
      <div className="hidden lg:grid lg:grid-cols-12 gap-6">

        {/* Left Sidebar: Your Profile & Quick Stats */}
        <div className="lg:col-span-3 space-y-4">
          {/* Your Stats Card */}
          <div className="bg-off-black border border-mid/30 p-4">
            <p className="text-xs font-mono text-mid-light mb-3">your_profile</p>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-pure-white flex items-center justify-center text-pure-black text-xl font-mono">
                {user?.username?.[0]?.toLowerCase()}
              </div>
              <div>
                <p className="text-pure-white font-mono">{user?.username}</p>
                <p className="text-mid-light font-mono text-sm">{userElo} ELO</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              <div className="bg-pure-black p-2 border border-mid/20">
                <p className="text-pure-white font-mono">{user?.gamesWon || 0}</p>
                <p className="text-xs text-mid-light font-mono">W</p>
              </div>
              <div className="bg-pure-black p-2 border border-mid/20">
                <p className="text-pure-white font-mono">{user?.gamesLost || 0}</p>
                <p className="text-xs text-mid-light font-mono">L</p>
              </div>
              <div className="bg-pure-black p-2 border border-mid/20">
                <p className="text-pure-white font-mono">{user?.gamesDraw || 0}</p>
                <p className="text-xs text-mid-light font-mono">D</p>
              </div>
            </div>

            {user && user.gamesPlayed > 0 && (
              <div className="flex items-center justify-between p-2 bg-pure-black border border-mid/20">
                <span className="text-xs font-mono text-mid-light">win_rate</span>
                <span className="font-mono text-pure-white">
                  {Math.round((user.gamesWon / user.gamesPlayed) * 100)}%
                </span>
              </div>
            )}
          </div>

          {/* Balance Card */}
          <div className="bg-off-black border border-mid/30 p-4">
            <p className="text-xs font-mono text-mid-light mb-2">balance</p>
            <div className="flex items-center justify-between">
              <USDCAmount amount={balance} size="lg" />
              <button
                onClick={openWalletModal}
                className="text-xs font-mono text-usdc hover:text-usdc-light"
              >
                {isConnected ? 'manage' : 'connect'}
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-2">
            <button
              onClick={() => setViewMode('create')}
              className={`w-full p-3 font-mono text-sm border transition-all ${
                viewMode === 'create'
                  ? 'bg-pure-white text-pure-black border-pure-white'
                  : 'bg-pure-black border-mid/50 text-pure-white hover:border-pure-white'
              }`}
            >
              + create_game
            </button>
            <button
              onClick={() => setViewMode('browse')}
              className={`w-full p-3 font-mono text-sm border transition-all ${
                viewMode === 'browse'
                  ? 'bg-pure-white text-pure-black border-pure-white'
                  : 'bg-pure-black border-mid/50 text-pure-white hover:border-pure-white'
              }`}
            >
              browse_games
            </button>
          </div>

          {/* Market Summary */}
          <div className="bg-off-black border border-mid/30 p-4">
            <p className="text-xs font-mono text-mid-light mb-3">market_summary</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs font-mono text-mid-light">open_games</span>
                <span className="font-mono text-pure-white">{marketStats.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-mono text-mid-light">total_stake</span>
                <USDCAmount amount={marketStats.totalStake} size="sm" />
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-mono text-mid-light">avg_stake</span>
                <USDCAmount amount={marketStats.avgStake} size="sm" />
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-mono text-mid-light">affordable</span>
                <span className="font-mono text-pure-white">{marketStats.affordableCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-9">
          {viewMode === 'browse' ? (
            <div className="space-y-4">
              {/* Filters Bar */}
              <div className="bg-off-black border border-mid/30 p-4">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Game Mode Filter */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-mid-light">mode:</span>
                    <div className="flex gap-1">
                      {(['all', 'standard', 'chess960'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => setFilterMode(mode)}
                          className={`px-3 py-1 text-xs font-mono border transition-all ${
                            filterMode === mode
                              ? 'bg-pure-white text-pure-black border-pure-white'
                              : 'bg-pure-black border-mid/50 text-mid-light hover:border-light'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Control Filter */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-mid-light">time:</span>
                    <select
                      value={filterTime}
                      onChange={(e) => setFilterTime(e.target.value)}
                      className="bg-pure-black border border-mid/50 text-pure-white px-3 py-1 text-xs font-mono"
                    >
                      <option value="all">all</option>
                      {Object.entries(CHALLENGE_TIME_CONTROLS).map(([key, value]) => (
                        <option key={key} value={key}>{value.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Results Count */}
                  <div className="ml-auto">
                    <span className="text-xs font-mono text-mid-light">
                      {filteredChallenges.length} {filteredChallenges.length === 1 ? 'game' : 'games'} available
                    </span>
                  </div>
                </div>
              </div>

              {/* Challenge Table */}
              <ChallengeTable
                challenges={filteredChallenges}
                userBalance={balance}
                userElo={userElo}
                onAccept={handleAcceptClick}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
              />
            </div>
          ) : (
            <CreateChallengeForm
              userBalance={balance}
              userElo={userElo}
              userStats={{
                gamesPlayed: user?.gamesPlayed || 0,
                gamesWon: user?.gamesWon || 0,
                gamesLost: user?.gamesLost || 0,
                gamesDraw: user?.gamesDraw || 0,
                peakElo: user?.peakEloRating || userElo,
              }}
              isConnected={isConnected}
              onSubmit={handleCreateChallenge}
              onOpenWallet={openWalletModal}
            />
          )}
        </div>
      </div>

      {/* Mobile Layout: Single column */}
      <div className="lg:hidden space-y-4">
        {/* Mobile Tab Navigation */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('browse')}
            className={`flex-1 px-4 py-3 font-mono text-sm border transition-all ${
              viewMode === 'browse'
                ? 'bg-pure-white text-pure-black border-pure-white'
                : 'bg-pure-black border-mid/50 text-mid-light'
            }`}
          >
            browse_games ({challenges.length})
          </button>
          <button
            onClick={() => setViewMode('create')}
            className={`flex-1 px-4 py-3 font-mono text-sm border transition-all ${
              viewMode === 'create'
                ? 'bg-pure-white text-pure-black border-pure-white'
                : 'bg-pure-black border-mid/50 text-mid-light'
            }`}
          >
            create_game
          </button>
        </div>

        {/* Mobile Balance Bar */}
        <div className="flex items-center justify-between bg-off-black border border-mid/30 p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-mid-light">balance:</span>
            <USDCAmount amount={balance} size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-mid-light">elo:</span>
            <span className="font-mono text-pure-white">{userElo}</span>
          </div>
        </div>

        {/* Mobile Content */}
        {viewMode === 'browse' ? (
          <div className="space-y-3">
            {/* Mobile Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {(['all', 'standard', 'chess960'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`px-3 py-1.5 text-xs font-mono border whitespace-nowrap ${
                    filterMode === mode
                      ? 'bg-pure-white text-pure-black border-pure-white'
                      : 'bg-pure-black border-mid/50 text-mid-light'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Mobile Challenge Cards */}
            {filteredChallenges.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-mid-light font-mono text-sm">no games available</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredChallenges.map(challenge => (
                  <MobileChallengeCard
                    key={challenge.id}
                    challenge={challenge}
                    userBalance={balance}
                    onAccept={() => handleAcceptClick(challenge.id)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <CreateChallengeForm
            userBalance={balance}
            userElo={userElo}
            userStats={{
              gamesPlayed: user?.gamesPlayed || 0,
              gamesWon: user?.gamesWon || 0,
              gamesLost: user?.gamesLost || 0,
              gamesDraw: user?.gamesDraw || 0,
              peakElo: user?.peakEloRating || userElo,
            }}
            isConnected={isConnected}
            onSubmit={handleCreateChallenge}
            onOpenWallet={openWalletModal}
          />
        )}
      </div>

      {/* Accept Dialog */}
      {challengeToAccept && (
        <ChallengeAcceptDialog
          challenge={challengeToAccept}
          userBalance={balance}
          userElo={userElo}
          onAccept={handleAcceptConfirm}
          onCancel={() => setChallengeToAccept(null)}
        />
      )}
    </div>
  );
}

// Mobile Challenge Card Component
interface MobileChallengeCardProps {
  challenge: ChallengeWithCreator & {
    winProb: number;
    eloChange: { win: number; loss: number };
    riskPercent: number;
    eloDiff: number;
    creatorWinRate: number;
  };
  userBalance: number;
  onAccept: () => void;
}

function MobileChallengeCard({ challenge, userBalance, onAccept }: MobileChallengeCardProps) {
  const timeControl = CHALLENGE_TIME_CONTROLS[challenge.timeControlKey as keyof typeof CHALLENGE_TIME_CONTROLS];
  const canAfford = userBalance >= challenge.stakeAmount;

  return (
    <div className="bg-off-black border border-mid/30 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-pure-white flex items-center justify-center text-pure-black text-sm font-mono">
            {challenge.creator.username[0].toLowerCase()}
          </div>
          <div>
            <p className="text-pure-white font-mono text-sm">{challenge.creator.username}</p>
            <p className="text-xs font-mono text-mid-light">{challenge.creator.eloRating} ELO</p>
          </div>
        </div>
        {challenge.gameMode === 'chess960' && (
          <span className="text-xs font-mono text-usdc bg-usdc/10 px-2 py-0.5">960</span>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2 mb-3 text-center">
        <div className="bg-pure-black p-2 border border-mid/20">
          <p className="text-pure-white font-mono text-sm">{timeControl?.label}</p>
          <p className="text-xs text-mid-light font-mono">time</p>
        </div>
        <div className="bg-pure-black p-2 border border-mid/20">
          <USDCAmount amount={challenge.stakeAmount} size="sm" />
          <p className="text-xs text-mid-light font-mono">stake</p>
        </div>
        <div className="bg-pure-black p-2 border border-mid/20">
          <p className={`font-mono text-sm ${challenge.winProb >= 50 ? 'text-green-400' : 'text-red-400'}`}>
            {challenge.winProb}%
          </p>
          <p className="text-xs text-mid-light font-mono">odds</p>
        </div>
        <div className="bg-pure-black p-2 border border-mid/20">
          <p className="text-pure-white font-mono text-sm">{challenge.creatorWinRate}%</p>
          <p className="text-xs text-mid-light font-mono">their WR</p>
        </div>
      </div>

      {/* Action */}
      <button
        onClick={onAccept}
        disabled={!canAfford}
        className={`w-full py-2 font-mono text-sm transition-all ${
          canAfford
            ? 'bg-pure-white text-pure-black hover:bg-off-white'
            : 'bg-off-black text-mid/30 border border-mid/20 cursor-not-allowed'
        }`}
      >
        {canAfford ? 'accept' : 'insufficient balance'}
      </button>
    </div>
  );
}
