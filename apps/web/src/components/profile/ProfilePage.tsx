'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { RankBadge } from './RankBadge';
import { AchievementBadge } from './AchievementBadge';
import { PaginatedGrid } from '../ui/PaginatedGrid';
import {
  ACHIEVEMENTS,
  getAchievementsByCategory,
  getRankTier,
  getNextRankTier,
  getProgressToNextRank,
  type AchievementCategory,
  type Achievement,
} from '@chess-game/shared';

// ============================================================================
// MOCK DATA - See MOCK_DATA.md for all mock data locations
// ============================================================================
const MOCK_PROFILE = {
  user: {
    id: 'mock-user-123',
    username: 'ChessMaster99',
    eloRating: 1847,
    peakEloRating: 1923,
    gamesPlayed: 342,
    gamesWon: 198,
    gamesLost: 127,
    gamesDraw: 17,
    totalWagered: 15420,
    totalWon: 18350,
    createdAt: '2024-03-15T10:30:00Z',
  },
  profile: {
    isPublic: true,
    currentStreak: 4,
    longestStreak: 12,
    totalCheckmates: 89,
    quickestWin: 14,
    biggestStakeWin: 500,
  },
  achievements: [
    { id: 'first_game', unlocked: true, unlockedAt: '2024-03-15T10:35:00Z', progress: 100 },
    { id: 'first_win', unlocked: true, unlockedAt: '2024-03-15T11:20:00Z', progress: 100 },
    { id: 'games_10', unlocked: true, unlockedAt: '2024-03-18T14:00:00Z', progress: 100 },
    { id: 'games_50', unlocked: true, unlockedAt: '2024-04-02T09:15:00Z', progress: 100 },
    { id: 'games_100', unlocked: true, unlockedAt: '2024-05-10T16:30:00Z', progress: 100 },
    { id: 'wins_10', unlocked: true, unlockedAt: '2024-03-22T11:45:00Z', progress: 100 },
    { id: 'wins_50', unlocked: true, unlockedAt: '2024-04-28T13:00:00Z', progress: 100 },
    { id: 'wins_100', unlocked: true, unlockedAt: '2024-06-15T10:00:00Z', progress: 100 },
    { id: 'elo_1200', unlocked: true, unlockedAt: '2024-03-16T09:00:00Z', progress: 100 },
    { id: 'elo_1400', unlocked: true, unlockedAt: '2024-03-25T14:30:00Z', progress: 100 },
    { id: 'elo_1600', unlocked: true, unlockedAt: '2024-04-15T11:00:00Z', progress: 100 },
    { id: 'elo_1800', unlocked: true, unlockedAt: '2024-05-20T16:45:00Z', progress: 100 },
    { id: 'streak_3', unlocked: true, unlockedAt: '2024-03-20T12:00:00Z', progress: 100 },
    { id: 'streak_5', unlocked: true, unlockedAt: '2024-04-08T15:30:00Z', progress: 100 },
    { id: 'streak_10', unlocked: true, unlockedAt: '2024-05-01T10:15:00Z', progress: 100 },
    { id: 'checkmate_10', unlocked: true, unlockedAt: '2024-03-28T09:30:00Z', progress: 100 },
    { id: 'checkmate_50', unlocked: true, unlockedAt: '2024-05-15T14:00:00Z', progress: 100 },
    { id: 'first_stake', unlocked: true, unlockedAt: '2024-03-15T11:00:00Z', progress: 100 },
    { id: 'high_roller', unlocked: true, unlockedAt: '2024-06-01T17:30:00Z', progress: 100 },
    { id: 'speed_demon', unlocked: true, unlockedAt: '2024-04-12T13:45:00Z', progress: 100 },
    // In progress achievements
    { id: 'games_500', unlocked: false, progress: 68 },
    { id: 'games_1000', unlocked: false, progress: 34 },
    { id: 'wins_500', unlocked: false, progress: 40 },
    { id: 'elo_2000', unlocked: false, progress: 92 },
    { id: 'streak_20', unlocked: false, progress: 60 },
    { id: 'checkmate_100', unlocked: false, progress: 89 },
  ],
};
// ============================================================================

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  games: 'games_played',
  elo: 'elo_milestones',
  streaks: 'win_streaks',
  special_moves: 'special_moves',
  milestones: 'milestones',
};

type TabType = 'overview' | 'achievements';

export function ProfilePage() {
  const { user: authUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedCategory, setSelectedCategory] = useState<AchievementCategory | 'all'>('all');
  const [isPublic, setIsPublic] = useState(MOCK_PROFILE.profile.isPublic);

  // Use mock data
  const profileUser = MOCK_PROFILE.user;
  const profile = MOCK_PROFILE.profile;
  const achievements = MOCK_PROFILE.achievements;

  // Memoize expensive calculations
  const { rank, nextRank, progress, winRate, netProfit } = useMemo(() => ({
    rank: getRankTier(profileUser.eloRating),
    nextRank: getNextRankTier(profileUser.eloRating),
    progress: getProgressToNextRank(profileUser.eloRating),
    winRate: profileUser.gamesPlayed > 0
      ? Math.round((profileUser.gamesWon / profileUser.gamesPlayed) * 100)
      : 0,
    netProfit: profileUser.totalWon - profileUser.totalWagered,
  }), [profileUser.eloRating, profileUser.gamesPlayed, profileUser.gamesWon, profileUser.totalWon, profileUser.totalWagered]);

  // Memoize achievement data
  const { unlockedCount, totalCount, achievementMap, visibleAchievements, recentUnlocked } = useMemo(() => {
    const map = new Map(achievements.map((a) => [a.id, a]));
    const unlocked = achievements.filter((a) => a.unlocked);
    const unlockedIds = new Set(unlocked.map((a) => a.id));

    const filtered = selectedCategory === 'all'
      ? ACHIEVEMENTS
      : getAchievementsByCategory(selectedCategory);

    // Filter out hidden achievements that aren't unlocked
    const visible = filtered.filter((a) => !a.hidden || unlockedIds.has(a.id));

    return {
      unlockedCount: unlocked.length,
      totalCount: ACHIEVEMENTS.length,
      achievementMap: map,
      visibleAchievements: visible,
      recentUnlocked: unlocked.slice(0, 8),
    };
  }, [achievements, selectedCategory]);

  // Achievement card renderer for PaginatedGrid
  const renderAchievementCard = useCallback((achievement: Achievement) => {
    const progressData = achievementMap.get(achievement.id);
    const isUnlocked = progressData?.unlocked || false;

    return (
      <div
        key={achievement.id}
        className={`p-4 border transition-all ${
          isUnlocked
            ? 'bg-pure-black border-mid/50'
            : 'bg-pure-black border-mid/20 opacity-60'
        }`}
      >
        <div className="flex items-start gap-4">
          <div
            className={`flex items-center justify-center w-12 h-12 border text-2xl flex-shrink-0 ${
              isUnlocked ? 'border-pure-white/50' : 'border-mid/30 grayscale'
            }`}
          >
            {achievement.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-mono text-sm ${isUnlocked ? 'text-pure-white' : 'text-mid'}`}>
              {achievement.name}
            </p>
            <p className="text-xs font-mono text-mid-light mt-1 line-clamp-2">
              {achievement.description}
            </p>
            {!isUnlocked && progressData?.progress !== undefined && progressData.progress > 0 && (
              <div className="mt-2">
                <div className="h-1 bg-off-black border border-mid/30 overflow-hidden">
                  <div
                    className="h-full bg-mid-light transition-all"
                    style={{ width: `${progressData.progress}%` }}
                  />
                </div>
                <p className="text-xs font-mono text-mid mt-1">{progressData.progress}%</p>
              </div>
            )}
            {isUnlocked && progressData?.unlockedAt && (
              <p className="text-xs font-mono text-mid mt-2">
                ✓ {new Date(progressData.unlockedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }, [achievementMap]);

  return (
    <div className="min-h-screen bg-pure-black">
      {/* Navigation */}
      <nav className="border-b border-mid/30 bg-off-black sticky top-0 z-50">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-3xl hover:opacity-80 transition-opacity">♔</Link>
              <span className="text-mid-light font-mono">/</span>
              <span className="text-pure-white font-mono">profile</span>
            </div>
            <Link
              href="/"
              className="text-mid-light hover:text-pure-white transition-colors font-mono text-sm"
            >
              back_to_home
            </Link>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-8">
        {/* Profile Header Card */}
        <div className="bg-off-black border border-mid/30 mb-6">
          {/* Header */}
          <div className="p-4 border-b border-mid/30 flex items-center justify-between">
            <div>
              <p className="text-xs font-mono text-mid-light">player_profile</p>
              <p className="text-lg font-mono text-pure-white">{profileUser.username}</p>
            </div>
            <button
              onClick={() => setIsPublic(!isPublic)}
              className={`px-4 py-2 border font-mono text-sm transition-all ${
                isPublic
                  ? 'bg-pure-black border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
                  : 'bg-pure-white text-pure-black border-pure-white'
              }`}
            >
              {isPublic ? '🌐 public' : '🔒 private'}
            </button>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left: Avatar & Rank */}
              <div className="flex flex-col items-center lg:items-start gap-4">
                <div className="w-24 h-24 bg-pure-white flex items-center justify-center text-pure-black text-4xl font-mono">
                  {profileUser.username?.[0]?.toLowerCase()}
                </div>
                <RankBadge elo={profileUser.eloRating} size="lg" showElo />
                <p className="text-sm font-mono text-mid-light text-center lg:text-left">
                  {rank.description}
                </p>
              </div>

              {/* Center: Stats Grid */}
              <div className="lg:col-span-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-pure-black border border-mid/30 text-center">
                    <p className="text-2xl font-mono text-pure-white">{profileUser.eloRating}</p>
                    <p className="text-xs font-mono text-mid-light">current_elo</p>
                  </div>
                  <div className="p-4 bg-pure-black border border-mid/30 text-center">
                    <p className="text-2xl font-mono text-pure-white">{profileUser.peakEloRating}</p>
                    <p className="text-xs font-mono text-mid-light">peak_elo</p>
                  </div>
                  <div className="p-4 bg-pure-black border border-mid/30 text-center">
                    <p className="text-2xl font-mono text-pure-white">{winRate}%</p>
                    <p className="text-xs font-mono text-mid-light">win_rate</p>
                  </div>
                  <div className="p-4 bg-pure-black border border-mid/30 text-center">
                    <p className="text-2xl font-mono text-pure-white">{unlockedCount}/{totalCount}</p>
                    <p className="text-xs font-mono text-mid-light">achievements</p>
                  </div>
                </div>

                {/* Rank Progress */}
                {nextRank && (
                  <div className="p-4 bg-pure-black border border-mid/30">
                    <div className="flex items-center justify-between text-xs font-mono text-mid-light mb-2">
                      <span>{rank.name}</span>
                      <span>{nextRank.name}</span>
                    </div>
                    <div className="h-2 bg-off-black border border-mid/30 overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{ width: `${progress}%`, backgroundColor: rank.color }}
                      />
                    </div>
                    <p className="text-xs font-mono text-mid mt-2 text-center">
                      {nextRank.minElo - profileUser.eloRating} ELO to {nextRank.name}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['overview', 'achievements'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 border font-mono text-sm transition-all ${
                activeTab === tab
                  ? 'bg-pure-white text-pure-black border-pure-white'
                  : 'bg-pure-black border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Game Statistics */}
            <div className="bg-off-black border border-mid/30">
              <div className="p-4 border-b border-mid/30">
                <p className="text-xs font-mono text-mid-light">game_statistics</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-pure-black border border-mid/30 text-center">
                    <p className="text-2xl font-mono text-pure-white">{profileUser.gamesWon}</p>
                    <p className="text-xs font-mono text-mid-light">wins</p>
                  </div>
                  <div className="p-4 bg-pure-black border border-mid/30 text-center">
                    <p className="text-2xl font-mono text-pure-white">{profileUser.gamesLost}</p>
                    <p className="text-xs font-mono text-mid-light">losses</p>
                  </div>
                  <div className="p-4 bg-pure-black border border-mid/30 text-center">
                    <p className="text-2xl font-mono text-pure-white">{profileUser.gamesDraw}</p>
                    <p className="text-xs font-mono text-mid-light">draws</p>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-mid/30">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono text-mid-light">total_games</span>
                    <span className="text-sm font-mono text-pure-white">{profileUser.gamesPlayed}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono text-mid-light">current_streak</span>
                    <span className="text-sm font-mono text-pure-white">{profile.currentStreak} 🔥</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono text-mid-light">longest_streak</span>
                    <span className="text-sm font-mono text-pure-white">{profile.longestStreak}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono text-mid-light">total_checkmates</span>
                    <span className="text-sm font-mono text-pure-white">{profile.totalCheckmates}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono text-mid-light">quickest_win</span>
                    <span className="text-sm font-mono text-pure-white">{profile.quickestWin} moves</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Statistics */}
            <div className="bg-off-black border border-mid/30">
              <div className="p-4 border-b border-mid/30">
                <p className="text-xs font-mono text-mid-light">financial_statistics</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono text-mid-light">total_wagered</span>
                    <span className="text-sm font-mono text-pure-white">${profileUser.totalWagered.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono text-mid-light">total_won</span>
                    <span className="text-sm font-mono text-pure-white">${profileUser.totalWon.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-mid/30">
                    <span className="text-sm font-mono text-mid-light">net_profit</span>
                    <span className={`text-sm font-mono font-medium ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-mono text-mid-light">biggest_win</span>
                    <span className="text-sm font-mono text-pure-white">${profile.biggestStakeWin}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-mid/30">
                  <p className="text-xs font-mono text-mid-light mb-2">member_since</p>
                  <p className="text-sm font-mono text-pure-white">
                    {new Date(profileUser.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Recent Achievements */}
            <div className="bg-off-black border border-mid/30 lg:col-span-2">
              <div className="p-4 border-b border-mid/30 flex items-center justify-between">
                <p className="text-xs font-mono text-mid-light">recent_achievements</p>
                <button
                  onClick={() => setActiveTab('achievements')}
                  className="text-xs font-mono text-mid-light hover:text-pure-white transition-colors"
                >
                  view_all →
                </button>
              </div>
              <div className="p-6">
                <div className="flex flex-wrap gap-3">
                  {recentUnlocked.map((achievement) => (
                    <AchievementBadge
                      key={achievement.id}
                      achievementId={achievement.id}
                      unlocked={true}
                      unlockedAt={achievement.unlockedAt ? new Date(achievement.unlockedAt) : undefined}
                      size="md"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'achievements' && (
          <div className="bg-off-black border border-mid/30">
            <div className="p-4 border-b border-mid/30 flex items-center justify-between">
              <div>
                <p className="text-xs font-mono text-mid-light">all_achievements</p>
                <p className="text-lg font-mono text-pure-white">{unlockedCount} / {totalCount} unlocked</p>
              </div>
              {/* Category Filter */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 border font-mono text-xs transition-all ${
                    selectedCategory === 'all'
                      ? 'bg-pure-white text-pure-black border-pure-white'
                      : 'bg-pure-black border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
                  }`}
                >
                  all
                </button>
                {(Object.keys(CATEGORY_LABELS) as AchievementCategory[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 border font-mono text-xs transition-all ${
                      selectedCategory === cat
                        ? 'bg-pure-white text-pure-black border-pure-white'
                        : 'bg-pure-black border-mid/50 text-mid-light hover:border-pure-white hover:text-pure-white'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6">
              <PaginatedGrid
                items={visibleAchievements}
                itemsPerPage={6}
                renderItem={renderAchievementCard}
                columns={3}
                emptyMessage="no achievements in this category"
                showCount
                countLabel="achievements"
              />
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
