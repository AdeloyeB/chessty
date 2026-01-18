import { z } from 'zod';
import type { ApiResponse, TimeControl } from '@chess-game/shared';
import { MIN_STAKE, MAX_STAKE } from '@chess-game/shared';
import * as matchmakingService from '../services/matchmaking';
import { authenticateRequest } from './auth';

const JoinQueueSchema = z.object({
  stakeAmount: z.number().positive().min(MIN_STAKE).max(MAX_STAKE),
  timeControl: z.object({
    initial: z.number().positive().min(60).max(3600), // 1 min to 1 hour
    increment: z.number().min(0).max(60),
  }),
  minElo: z.number().min(0).max(3500).optional(),
  maxElo: z.number().min(0).max(3500).optional(),
});

export async function handleJoinQueue(req: Request): Promise<Response> {
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
    const parsed = JoinQueueSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        } satisfies ApiResponse<never>,
        { status: 400 }
      );
    }

    const { stakeAmount, timeControl, minElo, maxElo } = parsed.data;

    const entry = await matchmakingService.joinQueue(
      auth.userId,
      stakeAmount,
      timeControl as TimeControl,
      minElo,
      maxElo
    );

    // Immediately try to find a match
    const match = await matchmakingService.findMatch(auth.userId);

    if (match) {
      return Response.json({
        success: true,
        data: {
          status: 'matched',
          gameId: match.gameId,
          whitePlayerId: match.whitePlayerId,
          blackPlayerId: match.blackPlayerId,
          stakeAmount: match.stakeAmount,
          timeControl: match.timeControl,
        },
      } satisfies ApiResponse<unknown>);
    }

    return Response.json({
      success: true,
      data: {
        status: 'queued',
        entry,
      },
    } satisfies ApiResponse<unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to join queue';
    return Response.json(
      {
        success: false,
        error: { code: 'MATCHMAKING_ERROR', message },
      } satisfies ApiResponse<never>,
      { status: 400 }
    );
  }
}

export async function handleLeaveQueue(req: Request): Promise<Response> {
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

    await matchmakingService.leaveQueue(auth.userId);

    return Response.json({
      success: true,
      data: { status: 'left' },
    } satisfies ApiResponse<unknown>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to leave queue' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

export async function handleGetQueueStatus(req: Request): Promise<Response> {
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

    const entry = await matchmakingService.getQueueStatus(auth.userId);
    const queueCount = await matchmakingService.getQueueCount();

    return Response.json({
      success: true,
      data: {
        inQueue: !!entry,
        entry,
        queueCount,
      },
    } satisfies ApiResponse<unknown>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get queue status' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}
