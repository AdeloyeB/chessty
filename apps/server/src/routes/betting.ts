import { z } from 'zod';
import type { ApiResponse } from '@chess-game/shared';
import { MIN_BET, MAX_BET } from '@chess-game/shared';
import * as bettingService from '../services/betting';
import { authenticateRequest } from './auth';

const PlaceBetSchema = z.object({
  gameId: z.string().min(1),
  betOnPlayerId: z.string().min(1),
  amount: z.number().positive().min(MIN_BET).max(MAX_BET),
});

export async function handlePlaceBet(req: Request): Promise<Response> {
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
    const parsed = PlaceBetSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    const bet = await bettingService.placeBet({
      ...parsed.data,
      userId: auth.userId,
    });

    return Response.json({
      success: true,
      data: {
        id: bet.id,
        gameId: bet.gameId,
        betOnPlayerId: bet.betOnPlayerId,
        amount: parseFloat(bet.amount),
        odds: parseFloat(bet.odds),
        potentialPayout: parseFloat(bet.potentialPayout),
        status: bet.status,
      },
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to place bet';
    return Response.json(
      {
        success: false,
        error: { code: 'BETTING_ERROR', message },
      } satisfies ApiResponse<never>,
      { status: 400 }
    );
  }
}

export async function handleGetGameOdds(req: Request, gameId: string): Promise<Response> {
  try {
    const odds = await bettingService.getGameOdds(gameId);

    return Response.json({
      success: true,
      data: odds,
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get odds';
    return Response.json(
      {
        success: false,
        error: { code: 'BETTING_ERROR', message },
      } satisfies ApiResponse<never>,
      { status: 400 }
    );
  }
}

export async function handleGetBetHistory(req: Request): Promise<Response> {
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

    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const bets = await bettingService.getUserBetHistory(auth.userId, limit, offset);

    return Response.json({
      success: true,
      data: bets.map((bet) => ({
        id: bet.id,
        gameId: bet.gameId,
        betOnPlayerId: bet.betOnPlayerId,
        amount: parseFloat(bet.amount),
        odds: parseFloat(bet.odds),
        potentialPayout: parseFloat(bet.potentialPayout),
        status: bet.status,
        createdAt: bet.createdAt,
        settledAt: bet.settledAt,
      })),
    } satisfies ApiResponse<unknown>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get bet history' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

export async function handleGetBetStats(req: Request): Promise<Response> {
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

    const stats = await bettingService.getBetStats(auth.userId);

    return Response.json({
      success: true,
      data: stats,
    } satisfies ApiResponse<unknown>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get bet stats' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}
