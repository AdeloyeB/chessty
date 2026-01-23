import { z } from 'zod';
import type { ApiResponse } from '@chess-game/shared';
import { getRankTier, getProgressToNextRank, getNextRankTier } from '@chess-game/shared';
import * as achievementService from '../services/achievements';
import { authenticateRequest } from './auth';
import { db } from '../drizzle';
import { users, userProfiles } from '../drizzle';
import { eq } from 'drizzle-orm';

const UpdateProfileSchema = z.object({
  isPublic: z.boolean().optional(),
});

// Get current user's profile
export async function handleGetProfile(req: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!user) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        } satisfies ApiResponse<never>,
        { status: 404 }
      );
    }

    const profileData = await achievementService.getFullProfileData(auth.userId);
    const rank = getRankTier(user.eloRating);
    const nextRank = getNextRankTier(user.eloRating);
    const progress = getProgressToNextRank(user.eloRating);

    return Response.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          eloRating: user.eloRating,
          peakEloRating: user.peakEloRating,
          gamesPlayed: user.gamesPlayed,
          gamesWon: user.gamesWon,
          gamesLost: user.gamesLost,
          gamesDraw: user.gamesDraw,
          totalWagered: parseFloat(user.totalWagered),
          totalWon: parseFloat(user.totalWon),
          createdAt: user.createdAt,
        },
        rank: {
          current: rank,
          next: nextRank,
          progressToNext: progress,
        },
        profile: profileData.profile,
        achievements: profileData.achievements,
        stats: profileData.stats,
      },
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    console.error('Get profile error:', error);
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get profile' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

// Update profile settings
export async function handleUpdateProfile(req: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = UpdateProfileSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    if (parsed.data.isPublic !== undefined) {
      await achievementService.updateProfileVisibility(auth.userId, parsed.data.isPublic);
    }

    return Response.json({
      success: true,
      data: { updated: true },
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    console.error('Update profile error:', error);
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to update profile' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

// Get achievements list
export async function handleGetAchievements(req: Request): Promise<Response> {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return Response.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        } satisfies ApiResponse<never>,
        { status: 401 }
      );
    }

    const achievements = await achievementService.getAchievementProgress(auth.userId);

    return Response.json({
      success: true,
      data: { achievements },
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    console.error('Get achievements error:', error);
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get achievements' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

// Get another user's public profile
export async function handleGetPublicProfile(req: Request, userId: string): Promise<Response> {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        } satisfies ApiResponse<never>,
        { status: 404 }
      );
    }

    // Check if profile is public
    const profile = await achievementService.getUserProfile(userId);

    // If private, only return basic public info
    if (!profile.isPublic) {
      const rank = getRankTier(user.eloRating);
      return Response.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            eloRating: user.eloRating,
            gamesPlayed: user.gamesPlayed,
            gamesWon: user.gamesWon,
            gamesLost: user.gamesLost,
            gamesDraw: user.gamesDraw,
          },
          rank: {
            current: rank,
          },
          isPrivate: true,
        },
      } satisfies ApiResponse<unknown>);
    }

    // Full public profile
    const profileData = await achievementService.getFullProfileData(userId);
    const rank = getRankTier(user.eloRating);
    const nextRank = getNextRankTier(user.eloRating);
    const progress = getProgressToNextRank(user.eloRating);

    return Response.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          eloRating: user.eloRating,
          peakEloRating: user.peakEloRating,
          gamesPlayed: user.gamesPlayed,
          gamesWon: user.gamesWon,
          gamesLost: user.gamesLost,
          gamesDraw: user.gamesDraw,
          createdAt: user.createdAt,
        },
        rank: {
          current: rank,
          next: nextRank,
          progressToNext: progress,
        },
        profile: {
          currentStreak: profile.currentStreak,
          longestStreak: profile.longestStreak,
          totalCheckmates: profile.totalCheckmates,
          quickestWin: profile.quickestWin,
        },
        achievements: profileData.achievements,
        stats: profileData.stats,
        isPrivate: false,
      },
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    console.error('Get public profile error:', error);
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get profile' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}
