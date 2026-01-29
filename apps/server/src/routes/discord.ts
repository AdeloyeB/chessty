/**
 * Discord API Routes
 *
 * HTTP endpoints for Discord integration.
 * Called by the desktop app when handling deep links.
 */

import { authenticateRequest } from './auth';
import {
  verifyLinkToken,
  getChallenge,
  acceptChallenge,
  declineChallenge,
  completeChallenge,
} from '../services/discord';
import { db, users, games } from '../drizzle';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// Standard starting position FEN
const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * POST /api/discord/link
 *
 * Consumes a link token and links the Discord account to the authenticated user.
 *
 * Body: { token: string }
 * Returns: { success: true, discordUsername: string } or error
 */
export async function handleDiscordLink(req: Request): Promise<Response> {
  const authResult = await authenticateRequest(req);
  if (!authResult.success) {
    return Response.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.token || typeof body.token !== 'string') {
    return Response.json(
      { success: false, error: { code: 'INVALID_TOKEN', message: 'Token is required' } },
      { status: 400 }
    );
  }

  const result = await verifyLinkToken(body.token, authResult.userId);

  if (!result) {
    return Response.json(
      { success: false, error: { code: 'INVALID_TOKEN', message: 'Token is invalid, expired, or already used' } },
      { status: 400 }
    );
  }

  return Response.json({
    success: true,
    data: {
      discordId: result.discordId,
      discordUsername: result.discordUsername,
    },
  });
}

/**
 * GET /api/discord/challenge/:id
 *
 * Gets challenge details for the accept screen.
 * Requires authentication to prevent scraping.
 */
export async function handleGetDiscordChallenge(req: Request, challengeId: string): Promise<Response> {
  const authResult = await authenticateRequest(req);
  if (!authResult.success) {
    return Response.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    );
  }

  const challenge = await getChallenge(challengeId);

  if (!challenge) {
    return Response.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Challenge not found' } },
      { status: 404 }
    );
  }

  // Get challenger info
  const challengerInfo = await db
    .select({
      username: users.username,
      displayName: users.displayName,
      eloRating: users.eloRating,
    })
    .from(users)
    .where(eq(users.id, challenge.challengerId))
    .limit(1);

  return Response.json({
    success: true,
    data: {
      id: challenge.id,
      status: challenge.status,
      expiresAt: challenge.expiresAt.toISOString(),
      challenger: challengerInfo[0] || null,
    },
  });
}

/**
 * POST /api/discord/challenge/:id/accept
 *
 * Accepts a challenge and creates a game.
 *
 * Body: { timeControlKey: string, wagerAmount: number }
 */
export async function handleAcceptDiscordChallenge(req: Request, challengeId: string): Promise<Response> {
  const authResult = await authenticateRequest(req);
  if (!authResult.success) {
    return Response.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.timeControlKey || typeof body.wagerAmount !== 'number') {
    return Response.json(
      { success: false, error: { code: 'INVALID_BODY', message: 'timeControlKey and wagerAmount are required' } },
      { status: 400 }
    );
  }

  const challenge = await getChallenge(challengeId);

  if (!challenge) {
    return Response.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Challenge not found' } },
      { status: 404 }
    );
  }

  if (challenge.status !== 'pending') {
    return Response.json(
      { success: false, error: { code: 'CHALLENGE_NOT_PENDING', message: `Challenge is ${challenge.status}` } },
      { status: 400 }
    );
  }

  // Verify the accepting user is the intended opponent
  const acceptingUser = await db
    .select({ discordId: users.discordId })
    .from(users)
    .where(eq(users.id, authResult.userId))
    .limit(1);

  if (!acceptingUser[0]?.discordId || acceptingUser[0].discordId !== challenge.opponentDiscordId) {
    return Response.json(
      { success: false, error: { code: 'NOT_OPPONENT', message: 'You are not the intended opponent' } },
      { status: 403 }
    );
  }

  // Accept the challenge
  const accepted = await acceptChallenge(challengeId, authResult.userId);
  if (!accepted) {
    return Response.json(
      { success: false, error: { code: 'ACCEPT_FAILED', message: 'Failed to accept challenge' } },
      { status: 500 }
    );
  }

  // Parse time control
  const timeControlMap: Record<string, { initial: number; increment: number }> = {
    'bullet-1+0': { initial: 60, increment: 0 },
    'bullet-2+1': { initial: 120, increment: 1 },
    'blitz-3+0': { initial: 180, increment: 0 },
    'blitz-3+2': { initial: 180, increment: 2 },
    'blitz-5+0': { initial: 300, increment: 0 },
    'blitz-5+3': { initial: 300, increment: 3 },
    'rapid-10+0': { initial: 600, increment: 0 },
    'rapid-10+5': { initial: 600, increment: 5 },
    'rapid-15+10': { initial: 900, increment: 10 },
    'classical-30+0': { initial: 1800, increment: 0 },
  };

  const timeControl = timeControlMap[body.timeControlKey];
  if (!timeControl) {
    return Response.json(
      { success: false, error: { code: 'INVALID_TIME_CONTROL', message: 'Invalid time control' } },
      { status: 400 }
    );
  }

  // Get player ELO ratings
  const [challengerUser, acceptorUser] = await Promise.all([
    db.select({ eloRating: users.eloRating }).from(users).where(eq(users.id, challenge.challengerId)).limit(1),
    db.select({ eloRating: users.eloRating }).from(users).where(eq(users.id, authResult.userId)).limit(1),
  ]);

  if (!challengerUser[0] || !acceptorUser[0]) {
    return Response.json(
      { success: false, error: { code: 'USER_NOT_FOUND', message: 'Player not found' } },
      { status: 404 }
    );
  }

  // Create the game
  try {
    // Randomly assign colors
    const whitePlayerId = Math.random() < 0.5 ? challenge.challengerId : authResult.userId;
    const blackPlayerId = whitePlayerId === challenge.challengerId ? authResult.userId : challenge.challengerId;

    const whiteElo = whitePlayerId === challenge.challengerId ? challengerUser[0].eloRating : acceptorUser[0].eloRating;
    const blackElo = blackPlayerId === challenge.challengerId ? challengerUser[0].eloRating : acceptorUser[0].eloRating;

    const gameId = nanoid();
    const now = new Date();
    const wagerAmount = body.wagerAmount;
    const totalPot = wagerAmount * 2;

    const [game] = await db
      .insert(games)
      .values({
        id: gameId,
        whitePlayerId,
        blackPlayerId,
        status: 'active',
        gameMode: 'standard',
        startingFen: STARTING_FEN,
        currentFen: STARTING_FEN,
        pgn: '',
        moves: [],
        timeControlInitial: timeControl.initial,
        timeControlIncrement: timeControl.increment,
        whiteTimeRemaining: timeControl.initial,
        blackTimeRemaining: timeControl.initial,
        wagerAmount: wagerAmount.toString(),
        totalPot: totalPot.toString(),
        whiteEloAtStart: whiteElo,
        blackEloAtStart: blackElo,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
      })
      .returning();

    // Mark challenge as completed
    await completeChallenge(challengeId, game.id);

    return Response.json({
      success: true,
      data: {
        gameId: game.id,
      },
    });
  } catch (error) {
    console.error('[Discord] Failed to create game:', error);
    return Response.json(
      { success: false, error: { code: 'GAME_CREATE_FAILED', message: 'Failed to create game' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/discord/challenge/:id/decline
 *
 * Declines a challenge.
 */
export async function handleDeclineDiscordChallenge(req: Request, challengeId: string): Promise<Response> {
  const authResult = await authenticateRequest(req);
  if (!authResult.success) {
    return Response.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    );
  }

  const challenge = await getChallenge(challengeId);

  if (!challenge) {
    return Response.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Challenge not found' } },
      { status: 404 }
    );
  }

  // Verify the declining user is the intended opponent
  const decliningUser = await db
    .select({ discordId: users.discordId })
    .from(users)
    .where(eq(users.id, authResult.userId))
    .limit(1);

  if (!decliningUser[0]?.discordId || decliningUser[0].discordId !== challenge.opponentDiscordId) {
    return Response.json(
      { success: false, error: { code: 'NOT_OPPONENT', message: 'You are not the intended opponent' } },
      { status: 403 }
    );
  }

  const declined = await declineChallenge(challengeId);

  if (!declined) {
    return Response.json(
      { success: false, error: { code: 'DECLINE_FAILED', message: 'Challenge is not pending' } },
      { status: 400 }
    );
  }

  return Response.json({ success: true });
}
