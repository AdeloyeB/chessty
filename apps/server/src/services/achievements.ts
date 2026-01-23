import { db } from '../drizzle';
import { userAchievements, userProfiles, users, games } from '../drizzle';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ACHIEVEMENTS, getAchievementById, type AchievementCategory } from '@chess-game/shared';

export interface UnlockedAchievement {
  id: string;
  achievementId: string;
  category: AchievementCategory;
  unlockedAt: Date;
}

export interface UserProfileData {
  isPublic: boolean;
  currentStreak: number;
  longestStreak: number;
  totalCheckmates: number;
  quickestWin: number | null;
  biggestStakeWin: number;
}

// Get user's unlocked achievements
export async function getUserAchievements(userId: string): Promise<UnlockedAchievement[]> {
  try {
    const achievements = await db
      .select()
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId))
      .orderBy(desc(userAchievements.unlockedAt));

    return achievements.map((a) => ({
      id: a.id,
      achievementId: a.achievementId,
      category: a.category as AchievementCategory,
      unlockedAt: a.unlockedAt,
    }));
  } catch (error) {
    // Table might not exist yet - return empty array
    console.warn('getUserAchievements failed (table may not exist):', error);
    return [];
  }
}

// Default profile data when table doesn't exist
const DEFAULT_PROFILE: UserProfileData = {
  isPublic: true,
  currentStreak: 0,
  longestStreak: 0,
  totalCheckmates: 0,
  quickestWin: null,
  biggestStakeWin: 0,
};

// Get or create user profile
export async function getUserProfile(userId: string): Promise<UserProfileData> {
  try {
    const existing = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      return {
        isPublic: existing[0].isPublic === 1,
        currentStreak: existing[0].currentStreak,
        longestStreak: existing[0].longestStreak,
        totalCheckmates: existing[0].totalCheckmates,
        quickestWin: existing[0].quickestWin,
        biggestStakeWin: parseFloat(existing[0].biggestStakeWin || '0'),
      };
    }

    // Create default profile
    await db.insert(userProfiles).values({
      userId,
      isPublic: 1,
      currentStreak: 0,
      longestStreak: 0,
      totalCheckmates: 0,
      biggestStakeWin: '0',
    });

    return DEFAULT_PROFILE;
  } catch (error) {
    // Table might not exist yet - return default profile
    console.warn('getUserProfile failed (table may not exist):', error);
    return DEFAULT_PROFILE;
  }
}

// Update profile visibility
export async function updateProfileVisibility(userId: string, isPublic: boolean): Promise<void> {
  try {
    await db
      .update(userProfiles)
      .set({ isPublic: isPublic ? 1 : 0, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId));
  } catch (error) {
    console.warn('updateProfileVisibility failed (table may not exist):', error);
  }
}

// Unlock an achievement for a user
export async function unlockAchievement(
  userId: string,
  achievementId: string
): Promise<UnlockedAchievement | null> {
  try {
    const achievement = getAchievementById(achievementId);
    if (!achievement) return null;

    // Check if already unlocked
    const existing = await db
      .select()
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.achievementId, achievementId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return null; // Already unlocked
    }

    const id = nanoid();
    const now = new Date();

    await db.insert(userAchievements).values({
      id,
      userId,
      achievementId,
      category: achievement.category,
      unlockedAt: now,
    });

    return {
      id,
      achievementId,
      category: achievement.category,
      unlockedAt: now,
    };
  } catch (error) {
    console.warn('unlockAchievement failed (table may not exist):', error);
    return null;
  }
}

// Check and unlock achievements after a game ends
export async function checkGameAchievements(
  userId: string,
  isWin: boolean,
  isCheckmate: boolean,
  moveCount: number,
  stakeAmount: number
): Promise<UnlockedAchievement[]> {
  const unlocked: UnlockedAchievement[] = [];

  // Get user stats
  const [user] = await db
    .select({
      gamesPlayed: users.gamesPlayed,
      gamesWon: users.gamesWon,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return unlocked;

  // Get user profile for streaks
  const profile = await getUserProfile(userId);

  // Check games played achievements
  const gamesAchievements = [
    { id: 'first_game', req: 1 },
    { id: 'games_10', req: 10 },
    { id: 'games_50', req: 50 },
    { id: 'games_100', req: 100 },
    { id: 'games_500', req: 500 },
    { id: 'games_1000', req: 1000 },
  ];

  for (const { id, req } of gamesAchievements) {
    if (user.gamesPlayed >= req) {
      const result = await unlockAchievement(userId, id);
      if (result) unlocked.push(result);
    }
  }

  // Check wins achievements
  if (isWin) {
    const winsAchievements = [
      { id: 'first_win', req: 1 },
      { id: 'wins_10', req: 10 },
      { id: 'wins_50', req: 50 },
      { id: 'wins_100', req: 100 },
      { id: 'wins_500', req: 500 },
    ];

    for (const { id, req } of winsAchievements) {
      if (user.gamesWon >= req) {
        const result = await unlockAchievement(userId, id);
        if (result) unlocked.push(result);
      }
    }

    // Check streak achievements
    const streakAchievements = [
      { id: 'streak_3', req: 3 },
      { id: 'streak_5', req: 5 },
      { id: 'streak_10', req: 10 },
      { id: 'streak_20', req: 20 },
    ];

    for (const { id, req } of streakAchievements) {
      if (profile.currentStreak >= req) {
        const result = await unlockAchievement(userId, id);
        if (result) unlocked.push(result);
      }
    }

    // Check speed demon (win in under 20 moves)
    if (moveCount < 20) {
      const result = await unlockAchievement(userId, 'speed_demon');
      if (result) unlocked.push(result);
    }

    // Check high roller (win with 100+ stake)
    if (stakeAmount >= 100) {
      const result = await unlockAchievement(userId, 'high_roller');
      if (result) unlocked.push(result);
    }
  }

  // Check checkmate achievements
  if (isCheckmate && isWin) {
    const checkmateAchievements = [
      { id: 'checkmate_10', req: 10 },
      { id: 'checkmate_50', req: 50 },
      { id: 'checkmate_100', req: 100 },
    ];

    for (const { id, req } of checkmateAchievements) {
      if (profile.totalCheckmates >= req) {
        const result = await unlockAchievement(userId, id);
        if (result) unlocked.push(result);
      }
    }
  }

  // Check first stake achievement
  if (stakeAmount > 0) {
    const result = await unlockAchievement(userId, 'first_stake');
    if (result) unlocked.push(result);
  }

  return unlocked;
}

// Check ELO achievements
export async function checkEloAchievements(
  userId: string,
  newElo: number
): Promise<UnlockedAchievement[]> {
  const unlocked: UnlockedAchievement[] = [];

  const eloAchievements = [
    { id: 'elo_1200', req: 1200 },
    { id: 'elo_1400', req: 1400 },
    { id: 'elo_1600', req: 1600 },
    { id: 'elo_1800', req: 1800 },
    { id: 'elo_2000', req: 2000 },
    { id: 'elo_2200', req: 2200 },
    { id: 'elo_2500', req: 2500 },
  ];

  for (const { id, req } of eloAchievements) {
    if (newElo >= req) {
      const result = await unlockAchievement(userId, id);
      if (result) unlocked.push(result);
    }
  }

  return unlocked;
}

// Update profile stats after game
export async function updateProfileStats(
  userId: string,
  isWin: boolean,
  isCheckmate: boolean,
  moveCount: number,
  stakeAmount: number
): Promise<void> {
  try {
    // Get or create profile
    await getUserProfile(userId);

    if (isWin) {
      // Update streak and checkmates
      await db
        .update(userProfiles)
        .set({
          currentStreak: sql`${userProfiles.currentStreak} + 1`,
          longestStreak: sql`GREATEST(${userProfiles.longestStreak}, ${userProfiles.currentStreak} + 1)`,
          totalCheckmates: isCheckmate
            ? sql`${userProfiles.totalCheckmates} + 1`
            : userProfiles.totalCheckmates,
          quickestWin: sql`CASE WHEN ${userProfiles.quickestWin} IS NULL OR ${moveCount} < ${userProfiles.quickestWin} THEN ${moveCount} ELSE ${userProfiles.quickestWin} END`,
          biggestStakeWin: sql`GREATEST(${userProfiles.biggestStakeWin}, ${stakeAmount})`,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.userId, userId));
    } else {
      // Reset streak on loss
      await db
        .update(userProfiles)
        .set({
          currentStreak: 0,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.userId, userId));
    }
  } catch (error) {
    console.warn('updateProfileStats failed (table may not exist):', error);
  }
}

// Get achievement progress for display
export async function getAchievementProgress(userId: string): Promise<
  Array<{
    id: string;
    unlocked: boolean;
    unlockedAt?: Date;
    progress: number;
  }>
> {
  const [user] = await db
    .select({
      gamesPlayed: users.gamesPlayed,
      gamesWon: users.gamesWon,
      eloRating: users.eloRating,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const profile = await getUserProfile(userId);
  const unlockedAchievements = await getUserAchievements(userId);
  const unlockedIds = new Set(unlockedAchievements.map((a) => a.achievementId));

  return ACHIEVEMENTS.map((achievement) => {
    const isUnlocked = unlockedIds.has(achievement.id);
    const unlockedData = unlockedAchievements.find((a) => a.achievementId === achievement.id);

    // Calculate progress based on achievement type
    let progress = 0;
    if (!isUnlocked && user) {
      if (achievement.id.startsWith('games_') || achievement.id === 'first_game') {
        progress = Math.min(100, (user.gamesPlayed / achievement.requirement) * 100);
      } else if (achievement.id.startsWith('wins_') || achievement.id === 'first_win') {
        progress = Math.min(100, (user.gamesWon / achievement.requirement) * 100);
      } else if (achievement.id.startsWith('elo_')) {
        progress = Math.min(100, (user.eloRating / achievement.requirement) * 100);
      } else if (achievement.id.startsWith('streak_')) {
        progress = Math.min(100, (profile.longestStreak / achievement.requirement) * 100);
      } else if (achievement.id.startsWith('checkmate_')) {
        progress = Math.min(100, (profile.totalCheckmates / achievement.requirement) * 100);
      }
    }

    return {
      id: achievement.id,
      unlocked: isUnlocked,
      unlockedAt: unlockedData?.unlockedAt,
      progress: isUnlocked ? 100 : Math.floor(progress),
    };
  });
}

// Get full profile data for display
export async function getFullProfileData(userId: string): Promise<{
  profile: UserProfileData;
  achievements: Awaited<ReturnType<typeof getAchievementProgress>>;
  stats: {
    totalAchievements: number;
    unlockedAchievements: number;
  };
}> {
  const profile = await getUserProfile(userId);
  const achievements = await getAchievementProgress(userId);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return {
    profile,
    achievements,
    stats: {
      totalAchievements: ACHIEVEMENTS.length,
      unlockedAchievements: unlockedCount,
    },
  };
}
