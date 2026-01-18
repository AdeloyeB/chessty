'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { useGameStore } from '@/store/game';
import { useApi } from '@/hooks/useApi';
import { useWallet } from '@/hooks/useWallet';
import { ChallengeMarketplace } from '../marketplace/ChallengeMarketplace';
import { GameBoard } from '../chess/GameBoard';
import { LocalGame } from '../chess/LocalGame';
import { ActiveGamesLobby } from '../spectator/ActiveGamesLobby';
import { Leaderboard } from './Leaderboard';
import { HistoryPage } from '../history/HistoryPage';
import { USDCAmount } from '../wallet/USDCAmount';
import { WalletButton } from '../wallet/WalletButton';
import { BalanceDisplay } from '../wallet/BalanceDisplay';
import { RankBadge, RankBadgeCompact } from '../profile/RankBadge';
import { AchievementBadge } from '../profile/AchievementBadge';
import { getRankTier, getProgressToNextRank, getNextRankTier } from '@chess-game/shared';

type Tab = 'home' | 'practice' | 'play' | 'watch' | 'history' | 'leaderboard';

// ============================================================================
// MOCK DATA - See MOCK_DATA.md for all mock data locations
// ============================================================================
const RANDOM_PLAYERS = [
  { username: 'GrandMaster_X', elo: 2450, wins: 342, winRate: 78 },
  { username: 'KnightRider99', elo: 2280, wins: 256, winRate: 71 },
  { username: 'QueenGambit', elo: 2190, wins: 198, winRate: 69 },
  { username: 'BishopSlayer', elo: 2150, wins: 167, winRate: 65 },
  { username: 'PawnStorm', elo: 2080, wins: 143, winRate: 62 },
  { username: 'RookieKing', elo: 1950, wins: 112, winRate: 58 },
];

const LIVE_MATCHES = [
  { white: 'GrandMaster_X', black: 'QueenGambit', pool: 500, viewers: 124 },
  { white: 'KnightRider99', black: 'BishopSlayer', pool: 250, viewers: 67 },
  { white: 'PawnStorm', black: 'RookieKing', pool: 100, viewers: 23 },
];

const MOCK_PROFILE_DATA = {
  currentStreak: 4,
  longestStreak: 12,
  unlockedAchievements: 20,
  totalAchievements: 27,
  recentAchievements: [
    { id: 'wins_100' },
    { id: 'elo_1800' },
    { id: 'streak_10' },
    { id: 'high_roller' },
  ],
};
// ============================================================================

function PlayerStatsCard({ player, rank }: { player: typeof RANDOM_PLAYERS[0]; rank: number }) {
  return (
    <div className="flex items-center justify-between p-4 bg-pure-black border border-mid/30 hover:border-mid/50 transition-colors">
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 flex items-center justify-center bg-off-black border border-mid/30 font-mono text-mid-light">
          {rank}
        </div>
        <div>
          <p className="text-pure-white font-mono">{player.username}</p>
          <p className="text-xs text-mid-light font-mono">{player.elo} elo</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-pure-white font-mono">{player.wins} wins</p>
        <p className="text-xs text-mid-light font-mono">{player.winRate}% wr</p>
      </div>
    </div>
  );
}

function LiveMatchCard({ match }: { match: typeof LIVE_MATCHES[0] }) {
  return (
    <div className="p-4 bg-pure-black border border-mid/30 hover:border-pure-white/30 transition-colors cursor-pointer">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-pure-white rounded-full animate-pulse" />
          <span className="text-xs font-mono text-mid-light">live</span>
        </div>
        <span className="text-xs font-mono text-mid-light">{match.viewers} watching</span>
      </div>
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-pure-white border border-mid" />
          <span className="text-pure-white font-mono text-sm">{match.white}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-pure-black border border-mid" />
          <span className="text-pure-white font-mono text-sm">{match.black}</span>
        </div>
      </div>
      <div className="pt-3 border-t border-mid/30 flex items-center justify-between">
        <span className="text-xs font-mono text-mid-light">pool</span>
        <USDCAmount amount={match.pool} size="sm" />
      </div>
    </div>
  );
}

function HomeContent({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { user } = useAuthStore();
  const { isConnected, initDevMode, isDevMode } = useWallet();
  const [dailyChallenge] = useState({
    description: 'win 3 games today',
    progress: 1,
    total: 3,
  });

  // Memoize rank calculations
  const { rank, nextRank, progress } = useMemo(() => {
    const elo = user?.eloRating ?? 1200;
    return {
      rank: getRankTier(elo),
      nextRank: getNextRankTier(elo),
      progress: getProgressToNextRank(elo),
    };
  }, [user?.eloRating]);

  // Auto-init dev mode in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && !isDevMode && !isConnected) {
      initDevMode();
    }
  }, [isDevMode, isConnected, initDevMode]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column - Player Profile */}
      <div className="lg:col-span-3 space-y-6">
        {/* Unified Profile Card */}
        <Link href="/profile" className="block">
          <div className="bg-off-black border border-mid/30 hover:border-mid/50 transition-colors">
            {/* Header with View Profile */}
            <div className="p-4 border-b border-mid/30 flex items-center justify-between">
              <p className="text-xs font-mono text-mid-light">your_profile</p>
              <span className="text-xs font-mono text-mid-light hover:text-pure-white transition-colors">
                view_details →
              </span>
            </div>

            <div className="p-4">
              {/* Avatar + Name + ELO */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-pure-white flex items-center justify-center text-pure-black text-xl font-mono flex-shrink-0">
                  {user?.username?.[0]?.toLowerCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-mono text-pure-white truncate">{user?.username}</p>
                  <p className="text-mid-light font-mono text-sm">{user?.eloRating} elo</p>
                </div>
              </div>

              {/* Balance & Peak ELO Row */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 bg-pure-black border border-mid/30">
                  <p className="text-xs font-mono text-mid-light mb-1">balance</p>
                  <BalanceDisplay size="md" />
                </div>
                <div className="p-3 bg-pure-black border border-mid/30">
                  <p className="text-xs font-mono text-mid-light mb-1">peak_elo</p>
                  <p className="text-lg font-mono text-pure-white">{user?.peakEloRating}</p>
                </div>
              </div>

              {/* Win/Loss/Draw */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="p-2 bg-pure-black border border-mid/30 text-center">
                  <p className="text-lg font-mono text-pure-white">{user?.gamesWon || 0}</p>
                  <p className="text-xs font-mono text-mid-light">wins</p>
                </div>
                <div className="p-2 bg-pure-black border border-mid/30 text-center">
                  <p className="text-lg font-mono text-pure-white">{user?.gamesLost || 0}</p>
                  <p className="text-xs font-mono text-mid-light">losses</p>
                </div>
                <div className="p-2 bg-pure-black border border-mid/30 text-center">
                  <p className="text-lg font-mono text-pure-white">{user?.gamesDraw || 0}</p>
                  <p className="text-xs font-mono text-mid-light">draws</p>
                </div>
              </div>

              {/* Rank Badge */}
              <div className="pt-4 border-t border-mid/30 mb-4">
                <RankBadge elo={user?.eloRating ?? 1200} size="md" showLabel showElo />
              </div>

              {/* Progress to Next Rank */}
              {nextRank && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs font-mono text-mid-light mb-1">
                    <span>progress to {nextRank.name}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1.5 bg-pure-black border border-mid/30 overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${progress}%`, backgroundColor: rank.color }}
                    />
                  </div>
                </div>
              )}

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="p-3 bg-pure-black border border-mid/30 text-center">
                  <span className="text-lg font-mono text-pure-white">{MOCK_PROFILE_DATA.currentStreak}</span>
                  <span className="text-xs font-mono text-mid-light block">streak</span>
                </div>
                <div className="p-3 bg-pure-black border border-mid/30 text-center">
                  <span className="text-lg font-mono text-pure-white">{MOCK_PROFILE_DATA.unlockedAchievements}</span>
                  <span className="text-xs font-mono text-mid-light block">badges</span>
                </div>
              </div>

              {/* Recent Achievements */}
              {MOCK_PROFILE_DATA.recentAchievements.length > 0 && (
                <div>
                  <p className="text-xs font-mono text-mid-light mb-2">recent_badges</p>
                  <div className="flex gap-2">
                    {MOCK_PROFILE_DATA.recentAchievements.map((a) => (
                      <AchievementBadge
                        key={a.id}
                        achievementId={a.id}
                        unlocked={true}
                        size="sm"
                        showTooltip={false}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Link>

        {/* Daily Challenge */}
        <div className="card">
          <p className="text-xs font-mono text-mid-light mb-4">daily_challenge</p>
          <p className="text-pure-white font-mono mb-3">{dailyChallenge.description}</p>
          <div className="mb-3">
            <div className="h-2 bg-pure-black border border-mid/30">
              <div
                className="h-full bg-pure-white"
                style={{ width: `${(dailyChallenge.progress / dailyChallenge.total) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex justify-between text-xs font-mono">
            <span className="text-mid-light">{dailyChallenge.progress}/{dailyChallenge.total}</span>
          </div>
        </div>
      </div>

      {/* Center Column - Quick Play & Featured */}
      <div className="lg:col-span-6 space-y-6">
        {/* Quick Play Actions */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onNavigate('play')}
            className="p-8 bg-pure-white text-pure-black hover:bg-off-white transition-colors text-left"
          >
            <p className="text-2xl font-mono mb-2">♟</p>
            <p className="text-xl font-mono mb-1">find_game</p>
            <p className="text-sm text-pure-black/60">match against players</p>
          </button>
          <button
            onClick={() => onNavigate('practice')}
            className="p-8 bg-off-black border border-mid/30 hover:border-pure-white/50 transition-colors text-left"
          >
            <p className="text-2xl mb-2">♔</p>
            <p className="text-xl font-mono text-pure-white mb-1">practice</p>
            <p className="text-sm text-mid-light">play locally</p>
          </button>
        </div>

        {/* Featured Live Matches */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-mono text-mid-light">live_matches</p>
            <button
              onClick={() => onNavigate('watch')}
              className="text-xs font-mono text-mid-light hover:text-pure-white transition-colors"
            >
              view_all
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {LIVE_MATCHES.map((match, i) => (
              <LiveMatchCard key={i} match={match} />
            ))}
          </div>
        </div>

        {/* Recent Activity / News */}
        <div className="card">
          <p className="text-xs font-mono text-mid-light mb-4">recent_activity</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-pure-black border border-mid/30">
              <div className="flex items-center gap-3">
                <span className="text-pure-white">♔</span>
                <div>
                  <p className="text-pure-white font-mono text-sm">GrandMaster_X reached 2500 elo</p>
                  <p className="text-xs text-mid-light font-mono">2 hours ago</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-pure-black border border-mid/30">
              <div className="flex items-center gap-3">
                <span className="text-pure-white">♛</span>
                <div>
                  <p className="text-pure-white font-mono text-sm">
                    Biggest pool today: <USDCAmount amount={2500} size="sm" className="inline" />
                  </p>
                  <p className="text-xs text-mid-light font-mono">5 hours ago</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-pure-black border border-mid/30">
              <div className="flex items-center gap-3">
                <span className="text-pure-white">♞</span>
                <div>
                  <p className="text-pure-white font-mono text-sm">Tournament starting in 2 days</p>
                  <p className="text-xs text-mid-light font-mono">announcement</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column - Rankings */}
      <div className="lg:col-span-3 space-y-6">
        {/* Top Players */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-mono text-mid-light">top_players</p>
            <button
              onClick={() => onNavigate('leaderboard')}
              className="text-xs font-mono text-mid-light hover:text-pure-white transition-colors"
            >
              view_all
            </button>
          </div>
          <div className="space-y-2">
            {RANDOM_PLAYERS.slice(0, 5).map((player, i) => (
              <PlayerStatsCard key={i} player={player} rank={i + 1} />
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="card">
          <p className="text-xs font-mono text-mid-light mb-4">platform_stats</p>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-mid-light font-mono text-sm">online_now</span>
              <span className="text-pure-white font-mono">847</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-mid-light font-mono text-sm">games_today</span>
              <span className="text-pure-white font-mono">1,234</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-mid-light font-mono text-sm">total_positions</span>
              <USDCAmount amount={45200} size="sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const { user } = useAuthStore();
  const { status } = useGameStore();
  const { logout } = useApi();

  // If in a game, show the game board
  if (status === 'playing' || status === 'matched' || status === 'queuing') {
    return <GameBoard />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'home', label: 'home' },
    { id: 'play', label: 'find_game' },
    { id: 'practice', label: 'practice' },
    { id: 'watch', label: 'spectate' },
    { id: 'history', label: 'history' },
    { id: 'leaderboard', label: 'rankings' },
  ];

  return (
    <div className="min-h-screen bg-pure-black">
      {/* Top Navigation Bar */}
      <nav className="border-b border-mid/30 bg-off-black sticky top-0 z-50">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Left: Logo & Nav */}
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <span className="text-3xl">♔</span>
              </div>

              {/* Tab Navigation */}
              <div className="hidden md:flex items-center gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 font-mono text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'text-pure-white bg-pure-white/10'
                        : 'text-mid-light hover:text-pure-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Wallet & User Info */}
            {user && (
              <div className="flex items-center gap-4">
                <WalletButton />

                <Link href="/profile" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                  <div className="text-right hidden sm:block">
                    <p className="text-pure-white font-mono text-sm">{user.username}</p>
                    <RankBadgeCompact elo={user.eloRating} />
                  </div>
                  <div className="w-10 h-10 bg-pure-white flex items-center justify-center text-pure-black font-mono">
                    {user.username?.[0]?.toLowerCase()}
                  </div>
                </Link>

                <button
                  onClick={logout}
                  className="text-mid-light hover:text-pure-white transition-colors text-sm font-mono"
                >
                  exit
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Tab Navigation */}
        <div className="md:hidden border-t border-mid/30 overflow-x-auto">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 font-mono text-xs whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'text-pure-white border-b-2 border-pure-white'
                    : 'text-mid-light'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      {activeTab === 'practice' ? (
        <main className="h-[calc(100vh-64px)]">
          <LocalGame />
        </main>
      ) : (
        <main className="container mx-auto px-6 py-8">
          {activeTab === 'home' && <HomeContent onNavigate={setActiveTab} />}
          {activeTab === 'play' && <ChallengeMarketplace />}
          {activeTab === 'watch' && <ActiveGamesLobby />}
          {activeTab === 'history' && <HistoryPage />}
          {activeTab === 'leaderboard' && <Leaderboard />}
        </main>
      )}
    </div>
  );
}
