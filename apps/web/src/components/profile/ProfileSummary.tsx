'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { RankBadge } from './RankBadge';
import { AchievementBadge } from './AchievementBadge';
import { getRankTier, getProgressToNextRank, getNextRankTier } from '@chess-game/shared';

// ============================================================================
// MOCK DATA - See MOCK_DATA.md for all mock data locations
// ============================================================================
const MOCK_PROFILE_SUMMARY = {
  eloRating: 1847,
  currentStreak: 4,
  longestStreak: 12,
  unlockedAchievements: 20,
  totalAchievements: 27,
  recentAchievements: [
    { id: 'wins_100', unlocked: true },
    { id: 'elo_1800', unlocked: true },
    { id: 'streak_10', unlocked: true },
    { id: 'high_roller', unlocked: true },
  ],
};
// ============================================================================

export function ProfileSummaryWidget() {
  const { user } = useAuthStore();

  // Use mock data
  const profileData = MOCK_PROFILE_SUMMARY;
  const rank = getRankTier(profileData.eloRating);
  const nextRank = getNextRankTier(profileData.eloRating);
  const progress = getProgressToNextRank(profileData.eloRating);

  return (
    <Link href="/profile" className="block">
      <div className="bg-off-black border border-mid/30 hover:border-mid/50 transition-colors cursor-pointer">
        {/* Header */}
        <div className="p-4 border-b border-mid/30 flex items-center justify-between">
          <p className="text-xs font-mono text-mid-light">your_rank</p>
          <span className="text-xs font-mono text-mid-light hover:text-pure-white transition-colors">
            view_profile →
          </span>
        </div>

        <div className="p-4">
          {/* Rank Display */}
          <div className="mb-4">
            <RankBadge elo={profileData.eloRating} size="md" showLabel showElo />
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
              <span className="text-lg font-mono text-pure-white">{profileData.currentStreak}</span>
              <span className="text-xs font-mono text-mid-light block">streak 🔥</span>
            </div>
            <div className="p-3 bg-pure-black border border-mid/30 text-center">
              <span className="text-lg font-mono text-pure-white">{profileData.unlockedAchievements}</span>
              <span className="text-xs font-mono text-mid-light block">badges</span>
            </div>
          </div>

          {/* Recent Achievements */}
          {profileData.recentAchievements.length > 0 && (
            <div>
              <p className="text-xs font-mono text-mid-light mb-2">recent_badges</p>
              <div className="flex gap-2">
                {profileData.recentAchievements.map((a) => (
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
  );
}

// Compact version for nav bar
export function ProfileBadgeCompact() {
  const { user } = useAuthStore();
  if (!user) return null;

  return (
    <Link href="/profile" className="block">
      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-pure-black border border-mid/30 font-mono text-xs hover:border-mid/50 transition-colors">
        <span className="text-pure-white">{user.eloRating}</span>
        <span className="text-mid-light">elo</span>
      </div>
    </Link>
  );
}
