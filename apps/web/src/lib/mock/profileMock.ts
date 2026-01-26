/**
 * Mock data generators for profile and achievements
 * Used when USE_MOCK_DATA is true for development/demos
 */

import type { ProfileResponse, PublicProfileResponse, ProfileUser, ProfileRank, ProfileStats, UserProfileData, AchievementProgress } from '@chess-game/shared';
import { ACHIEVEMENTS, getRankTier, getNextRankTier, getProgressToNextRank, type AchievementCategory, type RankTier } from '@chess-game/shared';
import { mockDelay, MOCK_PLAYERS } from './mockData';

// ========================================
// PROFILE MOCK DATA
// ========================================

/**
 * Generate a mock profile user based on current auth user or a random player
 */
export function generateMockProfileUser(userId?: string): ProfileUser {
  // If userId is provided, try to find matching mock player
  const player = userId
    ? MOCK_PLAYERS.find(p => p.id === userId) || MOCK_PLAYERS[0]
    : MOCK_PLAYERS[0];

  return {
    id: player.id,
    username: player.username,
    eloRating: player.eloRating,
    peakEloRating: player.peakEloRating,
    gamesPlayed: player.gamesPlayed,
    gamesWon: player.gamesWon,
    gamesLost: player.gamesLost,
    gamesDraw: player.gamesDraw,
    totalWagered: Math.floor(player.totalWinnings * 1.2),
    totalWon: player.totalWinnings,
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
  };
}

/**
 * Generate mock rank information from ELO rating
 */
export function generateMockRank(eloRating: number): ProfileRank {
  return {
    current: getRankTier(eloRating),
    next: getNextRankTier(eloRating),
    progressToNext: getProgressToNextRank(eloRating),
  };
}

/**
 * Generate mock profile data (streaks, stats)
 */
export function generateMockProfileData(userId?: string): UserProfileData {
  // Vary data based on userId hash for consistency
  const hash = userId ? userId.charCodeAt(0) : 0;

  return {
    isPublic: true,
    currentStreak: (hash % 8) + 1,
    longestStreak: (hash % 15) + 5,
    totalCheckmates: Math.floor(Math.random() * 150) + 20,
    quickestWin: Math.floor(Math.random() * 15) + 12, // 12-27 moves
    biggestWagerWin: [50, 100, 200, 500, 1000][hash % 5],
  };
}

/**
 * Generate mock achievement progress
 * Simulates a player who has unlocked some achievements
 */
export function generateMockAchievementProgress(userId?: string): AchievementProgress[] {
  const hash = userId ? userId.charCodeAt(0) : 0;
  const unlockProbability = 0.3 + (hash % 40) / 100; // 30-70% unlock rate

  return ACHIEVEMENTS.map((achievement, index) => {
    // Deterministic unlock based on userId and achievement index
    const isUnlocked = ((hash + index) % 10) / 10 < unlockProbability;

    // Calculate progress towards requirement
    let progress: number;
    if (isUnlocked) {
      progress = achievement.requirement;
    } else {
      // Random progress between 20-90% of requirement
      progress = Math.floor(achievement.requirement * (0.2 + Math.random() * 0.7));
    }

    return {
      id: achievement.id,
      unlocked: isUnlocked,
      unlockedAt: isUnlocked
        ? new Date(Date.now() - Math.floor(Math.random() * 60 * 24 * 60 * 60 * 1000)) // Random date in last 60 days
        : undefined,
      progress,
    };
  });
}

/**
 * Generate mock profile stats (counts)
 */
export function generateMockProfileStats(achievements: AchievementProgress[]): ProfileStats {
  const unlocked = achievements.filter(a => a.unlocked).length;

  return {
    totalAchievements: ACHIEVEMENTS.length,
    unlockedAchievements: unlocked,
  };
}

/**
 * Generate complete mock profile response
 */
export async function generateMockProfile(userId?: string): Promise<ProfileResponse> {
  await mockDelay();

  const user = generateMockProfileUser(userId);
  const achievements = generateMockAchievementProgress(userId);

  return {
    user,
    rank: generateMockRank(user.eloRating),
    profile: generateMockProfileData(userId),
    achievements,
    stats: generateMockProfileStats(achievements),
  };
}

/**
 * Generate mock public profile (for viewing other users)
 */
export async function generateMockPublicProfile(userId: string): Promise<PublicProfileResponse> {
  const profile = await generateMockProfile(userId);

  // 20% chance profile is private
  const isPrivate = Math.random() < 0.2;

  return {
    ...profile,
    isPrivate,
  };
}

// ========================================
// ACHIEVEMENT UNLOCK SIMULATION
// ========================================

export interface MockAchievementUnlock {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  unlockedAt: Date;
}

/**
 * Simulate an achievement unlock (for testing notifications)
 */
export function generateMockAchievementUnlock(): MockAchievementUnlock {
  const achievement = ACHIEVEMENTS[Math.floor(Math.random() * ACHIEVEMENTS.length)];

  return {
    id: achievement.id,
    name: achievement.name,
    description: achievement.description,
    icon: achievement.icon,
    category: achievement.category,
    unlockedAt: new Date(),
  };
}
