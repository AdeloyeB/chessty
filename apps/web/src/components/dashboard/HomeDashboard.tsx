'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { useGameStore } from '@/store/game';
import { useApi } from '@/hooks/useApi';
import { useWallet } from '@/hooks/useWallet';
import { ChallengeMarketplace } from '../marketplace/ChallengeMarketplace';
import { LocalGame } from '../chess/LocalGame';
import { LiveGame } from '../chess/LiveGame';
import { ActiveGamesLobby } from '../spectator/ActiveGamesLobby';
import { SpectatorViewManager } from '../spectator/SpectatorViewManager';
import { Leaderboard } from './Leaderboard';
import { HistoryPage } from '../history/HistoryPage';
import { USDCAmount } from '../wallet/USDCAmount';
import { WalletButton } from '../wallet/WalletButton';
import { BalanceDisplay } from '../wallet/BalanceDisplay';
import { RankBadge, RankBadgeCompact } from '../profile/RankBadge';
import { AchievementBadge } from '../profile/AchievementBadge';
import { TitleBar } from '../desktop/TitleBar';
import { TickerBar } from '../desktop/TickerBar';
import { getRankTier, getProgressToNextRank, getNextRankTier } from '@chess-game/shared';
import { useFeatureFlag } from '@/store/flags';
import type { LeaderboardEntry, PublicUser } from '@chess-game/shared';

type Tab = 'home' | 'practice' | 'play' | 'watch' | 'history' | 'leaderboard' | 'live_game';

// ActiveGame interface matching server response from /api/games/active
interface ActiveGame {
  id: string;
  whitePlayer: PublicUser;
  blackPlayer: PublicUser;
  status: string;
  currentFen: string;
  moveCount: number;
  whiteTimeRemaining: number;
  blackTimeRemaining: number;
  wagerAmount: number;
  totalPot: number;
  startedAt: string | null;
}

function PlayerStatsCard({ player, rank }: { player: LeaderboardEntry; rank: number }) {
  const winRate = player.user.gamesPlayed > 0
    ? Math.round((player.user.gamesWon / player.user.gamesPlayed) * 100)
    : 0;

  return (
    <div className="flex items-center justify-between p-4 bg-black border-b border-white/15 last:border-b-0 hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 flex items-center justify-center border border-white/15 font-mono text-white/50">
          {rank}
        </div>
        <div>
          <p className="text-white font-mono">{player.user.username}</p>
          <p className="text-xs text-white/50 font-mono">{player.user.eloRating} elo</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-white font-mono">{player.user.gamesWon} wins</p>
        <p className="text-xs text-white/30 font-mono">{winRate}% wr</p>
      </div>
    </div>
  );
}

function LiveMatchCard({ game }: { game: ActiveGame }) {
  return (
    <div className="p-4 bg-black border-r border-white/15 last:border-r-0 hover:bg-white/5 transition-colors cursor-pointer">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          <span className="text-xs font-mono text-white/50 lowercase">live</span>
        </div>
        <span className="text-xs font-mono text-white/30 lowercase">move {game.moveCount}</span>
      </div>
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-white" />
          <span className="text-white font-mono text-sm">{game.whitePlayer.username}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-white/50" />
          <span className="text-white font-mono text-sm">{game.blackPlayer.username}</span>
        </div>
      </div>
      <div className="pt-3 border-t border-white/15 flex items-center justify-between">
        <span className="text-xs font-mono text-white/30 lowercase">pool</span>
        <USDCAmount amount={game.totalPot} size="sm" />
      </div>
    </div>
  );
}

function HomeContent({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { user } = useAuthStore();
  const { isConnected, initDevMode, isDevMode } = useWallet();
  const { getEloLeaderboard, getActiveGames } = useApi();
  const spectatorEnabled = useFeatureFlag('spectator_mode');

  // ============================================================================
  // MOCK DATA - See MOCK_DATA.md for all mock data locations
  // ============================================================================
  const [dailyChallenge] = useState({
    description: 'win 3 games today',
    progress: 1,
    total: 3,
  });
  // ============================================================================

  // Fetch top players from API
  const { data: topPlayers = [], isLoading: loadingPlayers, isError: playersError } = useQuery({
    queryKey: ['leaderboard', 'elo', 5],
    queryFn: () => getEloLeaderboard(5),
    staleTime: 60 * 1000, // 1 minute
  });

  // Fetch active games from API
  const { data: activeGames = [], isLoading: loadingGames, isError: gamesError } = useQuery({
    queryKey: ['games', 'active'],
    queryFn: () => getActiveGames(),
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  });

  // ============================================================================
  // MOCK DATA - See MOCK_DATA.md for all mock data locations
  // ============================================================================
  // Calculate profile stats from user data (placeholder until profile API exists)
  const profileStats = useMemo(() => ({
    currentStreak: 0, // TODO: Add to user profile API
    unlockedAchievements: 0, // TODO: Add achievements API
    recentAchievements: [] as { id: string }[],
  }), []);
  // ============================================================================

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
    <div className="border border-white/15">
      {/* Main Bento Grid - no gaps, shared borders */}
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left Column - Player Profile */}
        <div className="lg:col-span-3 border-r border-white/15">
          {/* Profile Card */}
          <Link href="/profile" className="block">
            <div className="bg-black hover:bg-white/5 transition-colors">
              {/* Header */}
              <div className="p-4 border-b border-white/15 flex items-center justify-between">
                <p className="text-xs font-mono text-white/50 lowercase">your_profile</p>
                <span className="text-xs font-mono text-white/30 hover:text-white transition-colors lowercase">
                  view →
                </span>
              </div>

              <div className="p-4 border-b border-white/15">
                {/* Avatar + Name + ELO */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-white flex items-center justify-center text-black text-xl font-mono flex-shrink-0">
                    {user?.username?.[0]?.toLowerCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-mono text-white truncate">{user?.username}</p>
                    <p className="text-white/50 font-mono text-sm">{user?.eloRating} elo</p>
                  </div>
                </div>

                {/* Rank Badge */}
                <RankBadge elo={user?.eloRating ?? 1200} size="md" showLabel showElo />

                {/* Progress to Next Rank */}
                {nextRank && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs font-mono text-white/30 mb-1 lowercase">
                      <span>progress to {nextRank.name}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-black border border-white/15 overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{ width: `${progress}%`, backgroundColor: rank.color }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Stats Grid - shared internal borders */}
              <div className="grid grid-cols-2 border-b border-white/15">
                <div className="p-3 border-r border-white/15 text-center">
                  <BalanceDisplay size="md" />
                  <p className="text-xs font-mono text-white/30 lowercase">balance</p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-lg font-mono text-white">{user?.peakEloRating}</p>
                  <p className="text-xs font-mono text-white/30 lowercase">peak_elo</p>
                </div>
              </div>

              {/* Win/Loss/Draw */}
              <div className="grid grid-cols-3 border-b border-white/15">
                <div className="p-3 border-r border-white/15 text-center">
                  <p className="text-lg font-mono text-white">{user?.gamesWon || 0}</p>
                  <p className="text-xs font-mono text-white/30 lowercase">wins</p>
                </div>
                <div className="p-3 border-r border-white/15 text-center">
                  <p className="text-lg font-mono text-white">{user?.gamesLost || 0}</p>
                  <p className="text-xs font-mono text-white/30 lowercase">losses</p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-lg font-mono text-white">{user?.gamesDraw || 0}</p>
                  <p className="text-xs font-mono text-white/30 lowercase">draws</p>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2">
                <div className="p-3 border-r border-white/15 text-center">
                  <span className="text-lg font-mono text-white">{profileStats.currentStreak}</span>
                  <span className="text-xs font-mono text-white/30 block lowercase">streak</span>
                </div>
                <div className="p-3 text-center">
                  <span className="text-lg font-mono text-white">{profileStats.unlockedAchievements}</span>
                  <span className="text-xs font-mono text-white/30 block lowercase">badges</span>
                </div>
              </div>
            </div>
          </Link>

          {/* Daily Challenge */}
          <div className="bg-black border-t border-white/15 p-4">
            <p className="text-xs font-mono text-white/50 mb-3 lowercase">daily_challenge</p>
            <p className="text-white font-mono mb-3 lowercase">{dailyChallenge.description}</p>
            <div className="mb-2">
              <div className="h-1.5 bg-black border border-white/15">
                <div
                  className="h-full bg-white"
                  style={{ width: `${(dailyChallenge.progress / dailyChallenge.total) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-white/30">{dailyChallenge.progress}/{dailyChallenge.total}</span>
            </div>
          </div>
        </div>

        {/* Center Column - Quick Play & Featured */}
        <div className="lg:col-span-6 border-r border-white/15">
          {/* Quick Play Actions - side by side with shared border */}
          <div className="grid grid-cols-2 border-b border-white/15">
            <button
              onClick={() => onNavigate('play')}
              className="p-8 bg-white text-black hover:bg-white/90 transition-colors text-left border-r border-white/15"
            >
              <p className="text-2xl font-mono mb-2">♟</p>
              <p className="text-xl font-mono mb-1 lowercase">find_game</p>
              <p className="text-sm text-black/60 lowercase">match against players</p>
            </button>
            <button
              onClick={() => onNavigate('practice')}
              className="p-8 bg-black hover:bg-white/5 transition-colors text-left"
            >
              <p className="text-2xl mb-2 text-white/70">♔</p>
              <p className="text-xl font-mono text-white mb-1 lowercase">practice</p>
              <p className="text-sm text-white/50 lowercase">play locally</p>
            </button>
          </div>

          {/* Featured Live Matches */}
          <div className="bg-black border-b border-white/15">
            <div className="flex items-center justify-between p-4 border-b border-white/15">
              <p className="text-xs font-mono text-white/50 lowercase">live_matches</p>
              {spectatorEnabled && (
                <button
                  onClick={() => onNavigate('watch')}
                  className="text-xs font-mono text-white/30 hover:text-white transition-colors lowercase"
                >
                  view_all
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3">
              {loadingGames ? (
                <div className="col-span-3 text-center py-8 text-white/30 font-mono text-sm lowercase">
                  loading...
                </div>
              ) : gamesError ? (
                <div className="col-span-3 text-center py-8 text-red-400/70 font-mono text-sm lowercase">
                  failed to load matches
                </div>
              ) : activeGames.length === 0 ? (
                <div className="col-span-3 text-center py-8 text-white/30 font-mono text-sm lowercase">
                  no live matches
                </div>
              ) : (
                activeGames.slice(0, 3).map((game: ActiveGame) => (
                  <LiveMatchCard key={game.id} game={game} />
                ))
              )}
            </div>
          </div>

          {/* Recent Activity / News */}
          <div className="bg-black">
            <div className="p-4 border-b border-white/15">
              <p className="text-xs font-mono text-white/50 lowercase">recent_activity</p>
            </div>
            <div>
              <div className="flex items-center gap-3 p-4 border-b border-white/15 hover:bg-white/5 transition-colors">
                <span className="text-white/70">♔</span>
                <div>
                  <p className="text-white font-mono text-sm">GrandMaster_X reached 2500 elo</p>
                  <p className="text-xs text-white/30 font-mono lowercase">2 hours ago</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 border-b border-white/15 hover:bg-white/5 transition-colors">
                <span className="text-white/70">♛</span>
                <div>
                  <p className="text-white font-mono text-sm">
                    Biggest pool today: <USDCAmount amount={2500} size="sm" className="inline" />
                  </p>
                  <p className="text-xs text-white/30 font-mono lowercase">5 hours ago</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 hover:bg-white/5 transition-colors">
                <span className="text-white/70">♞</span>
                <div>
                  <p className="text-white font-mono text-sm">Tournament starting in 2 days</p>
                  <p className="text-xs text-white/30 font-mono lowercase">announcement</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Rankings */}
        <div className="lg:col-span-3">
          {/* Top Players */}
          <div className="bg-black border-b border-white/15">
            <div className="flex items-center justify-between p-4 border-b border-white/15">
              <p className="text-xs font-mono text-white/50 lowercase">top_players</p>
              <button
                onClick={() => onNavigate('leaderboard')}
                className="text-xs font-mono text-white/30 hover:text-white transition-colors lowercase"
              >
                view_all
              </button>
            </div>
            <div>
              {loadingPlayers ? (
                <div className="text-center py-8 text-white/30 font-mono text-sm lowercase">
                  loading...
                </div>
              ) : playersError ? (
                <div className="text-center py-8 text-red-400/70 font-mono text-sm lowercase">
                  failed to load players
                </div>
              ) : topPlayers.length === 0 ? (
                <div className="text-center py-8 text-white/30 font-mono text-sm lowercase">
                  no players yet
                </div>
              ) : (
                topPlayers.map((player: LeaderboardEntry) => (
                  <PlayerStatsCard key={player.user.id} player={player} rank={player.rank} />
                ))
              )}
            </div>
          </div>

          {/* Platform Stats */}
          <div className="bg-black">
            <div className="p-4 border-b border-white/15">
              <p className="text-xs font-mono text-white/50 lowercase">platform_stats</p>
            </div>
            <div className="flex justify-between items-center p-4 border-b border-white/15">
              <span className="text-white/50 font-mono text-sm lowercase">online_now</span>
              <span className="text-white font-mono">847</span>
            </div>
            <div className="flex justify-between items-center p-4 border-b border-white/15">
              <span className="text-white/50 font-mono text-sm lowercase">games_today</span>
              <span className="text-white font-mono">1,234</span>
            </div>
            <div className="flex justify-between items-center p-4">
              <span className="text-white/50 font-mono text-sm lowercase">total_positions</span>
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
  const spectatorEnabled = useFeatureFlag('spectator_mode');
  const multiGameEnabled = useFeatureFlag('spectator_multi_game');

  // Track whether we're in an active game (queuing, matched, or playing)
  const isInGame = status === 'queuing' || status === 'matched' || status === 'playing';
  const isGameEnded = status === 'ended';

  // Auto-switch to live_game tab when a game starts
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (isInGame && prevStatusRef.current === 'idle') {
      setActiveTab('live_game');
    }
    prevStatusRef.current = status;
  }, [isInGame, status]);

  // When game ends and user dismisses the dialog (reset → idle),
  // return to home tab and remove the live_game tab
  useEffect(() => {
    if (status === 'idle' && activeTab === 'live_game') {
      setActiveTab('home');
    }
  }, [status, activeTab]);

  // Build tabs array — live_game appears dynamically when in a game or game just ended
  // spectate tab is behind the spectator_mode feature flag
  const showLiveTab = isInGame || isGameEnded;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'home', label: 'home' },
    { id: 'play', label: 'find_game' },
    ...(showLiveTab ? [{ id: 'live_game' as Tab, label: 'live_game' }] : []),
    { id: 'practice', label: 'practice' },
    ...(spectatorEnabled ? [{ id: 'watch' as Tab, label: 'spectate' }] : []),
    { id: 'history', label: 'history' },
    { id: 'leaderboard', label: 'rankings' },
  ];

  return (
    <div className="min-h-screen bg-black">
      {/* Desktop Titlebar — only renders inside Tauri (not in browser) */}
      <TitleBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user ? { username: user.username, eloRating: user.eloRating, balance: user.balance } : null}
        onLogout={logout}
      />

      {/* Top Navigation Bar — shown in browser, hidden when TitleBar is active */}
      <nav className="border-b border-white/15 bg-black sticky top-0 z-50 tauri-hidden">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Left: Logo & Nav */}
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <span className="text-3xl text-white/80">♔</span>
              </div>

              {/* Tab Navigation - white glow effect on active */}
              <div className="hidden md:flex items-center gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 font-mono text-sm transition-all relative flex items-center gap-1.5 ${
                      activeTab === tab.id
                        ? 'text-white'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    {tab.label}
                    {tab.id === 'live_game' && (
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    )}
                    {/* White glow underline for active tab */}
                    {activeTab === tab.id && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                    )}
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
                    <p className="text-white font-mono text-sm">{user.username}</p>
                    <RankBadgeCompact elo={user.eloRating} />
                  </div>
                  <div className="w-10 h-10 bg-white flex items-center justify-center text-black font-mono">
                    {user.username?.[0]?.toLowerCase()}
                  </div>
                </Link>

                <button
                  onClick={logout}
                  className="text-white/40 hover:text-white transition-colors text-sm font-mono lowercase"
                >
                  exit
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Tab Navigation */}
        <div className="md:hidden border-t border-white/15 overflow-x-auto">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 font-mono text-xs whitespace-nowrap transition-all relative flex items-center gap-1 ${
                  activeTab === tab.id
                    ? 'text-white'
                    : 'text-white/40'
                }`}
              >
                {tab.label}
                {tab.id === 'live_game' && (
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                )}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      {activeTab === 'live_game' ? (
        <main className="h-[calc(100vh-64px)]">
          <LiveGame />
        </main>
      ) : activeTab === 'practice' ? (
        <main className="h-[calc(100vh-64px)]">
          <LocalGame />
        </main>
      ) : activeTab === 'watch' && multiGameEnabled ? (
        // Multi-game spectator: sub-nav + content managed by SpectatorViewManager
        <main>
          <SpectatorViewManager />
        </main>
      ) : (
        <main className="container mx-auto px-6 py-6">
          {activeTab === 'home' && <HomeContent onNavigate={setActiveTab} />}
          {activeTab === 'play' && <ChallengeMarketplace />}
          {activeTab === 'watch' && <ActiveGamesLobby />}
          {activeTab === 'history' && <HistoryPage />}
          {activeTab === 'leaderboard' && <Leaderboard />}
        </main>
      )}

      {/* Desktop Ticker Bar — persistent bottom bar, only in Tauri */}
      <TickerBar
        balance={user?.balance ?? 0}
        isConnected={true}
      />
    </div>
  );
}
