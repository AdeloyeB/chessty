import type { ApiResponse } from '@chess-game/shared';
import * as gameService from '../services/game';
import * as authService from '../services/auth';
import { authenticateRequest } from './auth';

export async function handleGetActiveGames(req: Request): Promise<Response> {
  try {
    const games = await gameService.getActiveGames();

    // Get player info for each game
    const gamesWithPlayers = await Promise.all(
      games.map(async (game) => {
        const gameData = await gameService.getGameWithPlayers(game.id);
        if (!gameData) return null;

        return {
          id: game.id,
          whitePlayer: authService.toPublicUser(gameData.whitePlayer),
          blackPlayer: authService.toPublicUser(gameData.blackPlayer),
          status: game.status,
          currentFen: game.currentFen,
          moveCount: (game.moves as unknown[]).length,
          whiteTimeRemaining: game.whiteTimeRemaining,
          blackTimeRemaining: game.blackTimeRemaining,
          stakeAmount: parseFloat(game.stakeAmount),
          totalPot: parseFloat(game.totalPot),
          startedAt: game.startedAt,
        };
      })
    );

    return Response.json({
      success: true,
      data: gamesWithPlayers.filter(Boolean),
    } satisfies ApiResponse<unknown>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get active games' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

export async function handleGetGame(req: Request, gameId: string): Promise<Response> {
  try {
    const gameData = await gameService.getGameWithPlayers(gameId);

    if (!gameData) {
      return Response.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Game not found' },
        } satisfies ApiResponse<never>,
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: {
        id: gameData.game.id,
        whitePlayer: authService.toPublicUser(gameData.whitePlayer),
        blackPlayer: authService.toPublicUser(gameData.blackPlayer),
        status: gameData.game.status,
        result: gameData.game.result,
        currentFen: gameData.game.currentFen,
        pgn: gameData.game.pgn,
        moves: gameData.game.moves,
        whiteTimeRemaining: gameData.game.whiteTimeRemaining,
        blackTimeRemaining: gameData.game.blackTimeRemaining,
        stakeAmount: parseFloat(gameData.game.stakeAmount),
        totalPot: parseFloat(gameData.game.totalPot),
        whiteEloAtStart: gameData.game.whiteEloAtStart,
        blackEloAtStart: gameData.game.blackEloAtStart,
        eloChange: gameData.game.eloChange,
        startedAt: gameData.game.startedAt,
        endedAt: gameData.game.endedAt,
      },
    } satisfies ApiResponse<unknown>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get game' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

export async function handleGetUserGameHistory(req: Request): Promise<Response> {
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
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const games = await gameService.getUserGameHistory(auth.userId, limit, offset);

    return Response.json({
      success: true,
      data: games.map((game) => ({
        id: game.id,
        whitePlayerId: game.whitePlayerId,
        blackPlayerId: game.blackPlayerId,
        winnerId: game.winnerId,
        status: game.status,
        result: game.result,
        pgn: game.pgn,
        stakeAmount: parseFloat(game.stakeAmount),
        totalPot: parseFloat(game.totalPot),
        eloChange: game.eloChange,
        endedAt: game.endedAt,
      })),
    } satisfies ApiResponse<unknown>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get game history' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}

export async function handleGetUserActiveGame(req: Request): Promise<Response> {
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

    const game = await gameService.getUserActiveGame(auth.userId);

    if (!game) {
      return Response.json({
        success: true,
        data: null,
      } satisfies ApiResponse<null>);
    }

    const gameData = await gameService.getGameWithPlayers(game.id);
    if (!gameData) {
      return Response.json({
        success: true,
        data: null,
      } satisfies ApiResponse<null>);
    }

    const playerColor = gameService.getPlayerColor(game, auth.userId);

    return Response.json({
      success: true,
      data: {
        id: game.id,
        whitePlayer: authService.toPublicUser(gameData.whitePlayer),
        blackPlayer: authService.toPublicUser(gameData.blackPlayer),
        playerColor,
        status: game.status,
        currentFen: game.currentFen,
        pgn: game.pgn,
        moves: game.moves,
        whiteTimeRemaining: game.whiteTimeRemaining,
        blackTimeRemaining: game.blackTimeRemaining,
        stakeAmount: parseFloat(game.stakeAmount),
        totalPot: parseFloat(game.totalPot),
        startedAt: game.startedAt,
      },
    } satisfies ApiResponse<unknown>);
  } catch {
    return Response.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to get active game' },
      } satisfies ApiResponse<never>,
      { status: 500 }
    );
  }
}
