import { eq } from 'drizzle-orm';
import type { ApiResponse } from '@chess-game/shared';
import { db, users } from '../drizzle';
import * as authService from '../services/auth';
import * as bettingService from '../services/betting';

export async function handleGetUser(req: Request, userId: string): Promise<Response> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        } satisfies ApiResponse<never>,
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: authService.toPublicUser(user),
    } satisfies ApiResponse<unknown>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get user' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

export async function handleGetUserStats(req: Request, userId: string): Promise<Response> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        } satisfies ApiResponse<never>,
        { status: 404 }
      );
    }

    const betStats = await bettingService.getBetStats(userId);

    return Response.json({
      success: true,
      data: {
        user: authService.toPublicUser(user),
        gameStats: {
          gamesPlayed: user.gamesPlayed,
          gamesWon: user.gamesWon,
          gamesLost: user.gamesLost,
          gamesDraw: user.gamesDraw,
          winRate:
            user.gamesPlayed > 0
              ? Math.round((user.gamesWon / user.gamesPlayed) * 100)
              : 0,
        },
        bettingStats: betStats,
        financialStats: {
          totalWagered: parseFloat(user.totalWagered),
          totalWon: parseFloat(user.totalWon),
          netProfit: parseFloat(user.totalWon) - parseFloat(user.totalWagered),
        },
      },
    } satisfies ApiResponse<unknown>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get user stats' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}
