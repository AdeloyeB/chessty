import { desc } from 'drizzle-orm';
import type { ApiResponse, LeaderboardEntry } from '@chess-game/shared';
import { db, users } from '../drizzle';
import * as authService from '../services/auth';

export async function handleGetEloLeaderboard(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

    const topPlayers = await db.query.users.findMany({
      orderBy: [desc(users.eloRating)],
      limit,
    });

    const leaderboard: LeaderboardEntry[] = topPlayers.map((user, index) => ({
      rank: index + 1,
      user: authService.toPublicUser(user),
      value: user.eloRating,
    }));

    return Response.json({
      success: true,
      data: leaderboard,
    } satisfies ApiResponse<LeaderboardEntry[]>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get leaderboard' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

export async function handleGetWinningsLeaderboard(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

    const topWinners = await db.query.users.findMany({
      orderBy: [desc(users.totalWon)],
      limit,
    });

    const leaderboard: LeaderboardEntry[] = topWinners.map((user, index) => ({
      rank: index + 1,
      user: authService.toPublicUser(user),
      value: parseFloat(user.totalWon),
    }));

    return Response.json({
      success: true,
      data: leaderboard,
    } satisfies ApiResponse<LeaderboardEntry[]>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get leaderboard' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}
