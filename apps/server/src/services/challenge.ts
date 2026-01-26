import { eq, and, or, gt, lt, ne } from 'drizzle-orm';
import { db, challenges, users, games } from '../drizzle';
import type { PublicUser, ChallengeWithCreator, GameMode } from '@chess-game/shared';
import { CHALLENGE_TIME_CONTROLS, CHALLENGE_EXPIRATION, STARTING_FEN } from '@chess-game/shared';
import * as walletService from './wallet';
import * as chess960Service from './chess960';

function toPublicUser(user: typeof users.$inferSelect): PublicUser {
  return {
    id: user.id,
    username: user.username,
    eloRating: user.eloRating,
    peakEloRating: user.peakEloRating,
    gamesPlayed: user.gamesPlayed,
    gamesWon: user.gamesWon,
    gamesLost: user.gamesLost,
    gamesDraw: user.gamesDraw,
  };
}

function toChallengeWithCreator(
  challenge: typeof challenges.$inferSelect,
  creator: typeof users.$inferSelect,
  acceptedBy?: typeof users.$inferSelect
): ChallengeWithCreator {
  const timeControlKey = challenge.timeControlKey as keyof typeof CHALLENGE_TIME_CONTROLS;
  const timeControl = CHALLENGE_TIME_CONTROLS[timeControlKey] || { initial: 300, increment: 0 };
  const wagerAmount = typeof challenge.wagerAmount === 'string'
    ? parseFloat(challenge.wagerAmount)
    : Number(challenge.wagerAmount);

  return {
    id: challenge.id,
    creatorId: challenge.creatorId,
    gameMode: challenge.gameMode as GameMode,
    timeControlKey: challenge.timeControlKey,
    timeControl: { initial: timeControl.initial, increment: timeControl.increment },
    wagerAmount,
    minElo: challenge.minElo,
    maxElo: challenge.maxElo,
    status: challenge.status as any,
    acceptedById: challenge.acceptedById,
    createdAt: challenge.createdAt,
    expiresAt: challenge.expiresAt,
    creator: toPublicUser(creator),
    acceptedBy: acceptedBy ? toPublicUser(acceptedBy) : undefined,
  };
}

export async function createChallenge(
  creatorId: string,
  gameMode: GameMode,
  timeControlKey: string,
  wagerAmount: number,
  minElo?: number,
  maxElo?: number
): Promise<ChallengeWithCreator> {
  const creator = await db.query.users.findFirst({ where: eq(users.id, creatorId) });
  if (!creator) throw new Error('User not found');

  const timeControl = CHALLENGE_TIME_CONTROLS[timeControlKey as keyof typeof CHALLENGE_TIME_CONTROLS];
  if (!timeControl) throw new Error('Invalid time control');

  // Check if user has sufficient balance
  const userBalance = parseFloat(creator.balance as unknown as string);
  if (userBalance < wagerAmount) {
    throw new Error('Insufficient balance');
  }

  // Check if user already has an open challenge
  const existingChallenge = await db.query.challenges.findFirst({
    where: and(
      eq(challenges.creatorId, creatorId),
      eq(challenges.status, 'open')
    ),
  });
  if (existingChallenge) {
    throw new Error('You already have an open challenge');
  }

  // Reserve the wager
  await walletService.deductWager(creatorId, wagerAmount, 'challenge-pending');

  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_EXPIRATION);

  const [challenge] = await db
    .insert(challenges)
    .values({
      id,
      creatorId,
      gameMode,
      timeControlKey,
      timeControlInitial: timeControl.initial,
      timeControlIncrement: timeControl.increment,
      wagerAmount: wagerAmount.toString(),
      minElo: minElo ?? null,
      maxElo: maxElo ?? null,
      status: 'open',
      createdAt: now,
      expiresAt,
    })
    .returning();

  return toChallengeWithCreator(challenge, creator);
}

export async function cancelChallenge(challengeId: string, userId: string): Promise<void> {
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, challengeId),
  });

  if (!challenge) throw new Error('Challenge not found');
  if (challenge.creatorId !== userId) throw new Error('Not authorized');
  if (challenge.status !== 'open') throw new Error('Challenge cannot be cancelled');

  // Refund the wager
  const wagerAmount = parseFloat(challenge.wagerAmount as unknown as string);
  await walletService.refundWager(userId, wagerAmount, challengeId);

  await db
    .update(challenges)
    .set({ status: 'cancelled' })
    .where(eq(challenges.id, challengeId));
}

export async function acceptChallenge(
  challengeId: string,
  acceptorId: string
): Promise<ChallengeWithCreator> {
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, challengeId),
    with: { creator: true },
  });

  if (!challenge) throw new Error('Challenge not found');
  if (challenge.status !== 'open') throw new Error('Challenge is not available');
  if (challenge.creatorId === acceptorId) throw new Error('Cannot accept your own challenge');

  // Check if challenge is expired
  if (new Date() > challenge.expiresAt) {
    await expireChallenge(challengeId);
    throw new Error('Challenge has expired');
  }

  const acceptor = await db.query.users.findFirst({ where: eq(users.id, acceptorId) });
  if (!acceptor) throw new Error('User not found');

  // Check ELO restrictions
  if (challenge.minElo && acceptor.eloRating < challenge.minElo) {
    throw new Error('Your ELO is below the minimum required');
  }
  if (challenge.maxElo && acceptor.eloRating > challenge.maxElo) {
    throw new Error('Your ELO is above the maximum allowed');
  }

  // Check if acceptor has sufficient balance
  const wagerAmount = parseFloat(challenge.wagerAmount as unknown as string);
  const userBalance = parseFloat(acceptor.balance as unknown as string);
  if (userBalance < wagerAmount) {
    throw new Error('Insufficient balance');
  }

  // Reserve the acceptor's wager
  await walletService.deductWager(acceptorId, wagerAmount, `challenge-${challengeId}`);

  const [updated] = await db
    .update(challenges)
    .set({
      status: 'accepted',
      acceptedById: acceptorId,
    })
    .where(eq(challenges.id, challengeId))
    .returning();

  return toChallengeWithCreator(updated, challenge.creator, acceptor);
}

/**
 * Confirm a challenge with transaction and row-level locking.
 *
 * When both players confirm simultaneously, there's a race condition:
 * 1. Player A reads challenge (both confirmed = false)
 * 2. Player B reads challenge (both confirmed = false)
 * 3. Player A updates their confirmed flag, checks, sees only their flag is true -> bothConfirmed = false
 * 4. Player B updates their confirmed flag, checks, sees only their flag is true -> bothConfirmed = false
 *
 * Neither player triggers game creation!
 *
 * The fix: Use a database transaction with row-level locking (SELECT FOR UPDATE)
 * to ensure atomic read-modify-write. The second transaction will block until the
 * first one commits, then see the updated state.
 */
export async function confirmChallenge(
  challengeId: string,
  userId: string
): Promise<{ confirmed: boolean; challenge: ChallengeWithCreator }> {
  // Use a transaction to prevent race conditions when both players confirm simultaneously
  return await db.transaction(async (tx) => {
    // FIX #4: Use SELECT FOR UPDATE to acquire row-level lock
    // This ensures only one transaction can read-modify-write at a time
    const [challengeRow] = await tx
      .select()
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .for('update');

    if (!challengeRow) throw new Error('Challenge not found');
    if (challengeRow.status !== 'accepted') throw new Error('Challenge is not in accepted state');
    if (challengeRow.creatorId !== userId && challengeRow.acceptedById !== userId) {
      throw new Error('Not authorized');
    }

    // Fetch related user data (not locked, just for response formatting)
    const creator = await tx.query.users.findFirst({
      where: eq(users.id, challengeRow.creatorId),
    });
    const acceptedBy = challengeRow.acceptedById
      ? await tx.query.users.findFirst({ where: eq(users.id, challengeRow.acceptedById) })
      : null;

    if (!creator) throw new Error('Creator not found');

    const isCreator = challengeRow.creatorId === userId;
    const updateField = isCreator ? 'creatorConfirmed' : 'acceptorConfirmed';

    // Check if this user has already confirmed (idempotency check)
    const alreadyConfirmed = isCreator ? challengeRow.creatorConfirmed : challengeRow.acceptorConfirmed;
    if (alreadyConfirmed) {
      console.log(`[confirmChallenge] User ${userId} already confirmed challenge ${challengeId}`);
      // Re-check if both are now confirmed
      const bothConfirmed = challengeRow.creatorConfirmed === true && challengeRow.acceptorConfirmed === true;
      return {
        confirmed: bothConfirmed,
        challenge: toChallengeWithCreator(challengeRow, creator, acceptedBy ?? undefined),
      };
    }

    // Update the confirmation flag within the transaction
    const [updated] = await tx
      .update(challenges)
      .set({ [updateField]: true })
      .where(eq(challenges.id, challengeId))
      .returning();

    // FIX #5: Use the updated row data to check if both confirmed
    // This uses the fresh data from the RETURNING clause
    const bothConfirmed = updated.creatorConfirmed === true && updated.acceptorConfirmed === true;

    console.log(`[confirmChallenge] User ${userId} confirmed challenge ${challengeId}. isCreator=${isCreator}, bothConfirmed=${bothConfirmed}`);

    const result = toChallengeWithCreator(
      updated,
      creator,
      acceptedBy ?? undefined
    );

    return { confirmed: bothConfirmed, challenge: result };
  });
}

export async function declineChallenge(
  challengeId: string,
  userId: string
): Promise<void> {
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, challengeId),
  });

  if (!challenge) throw new Error('Challenge not found');
  if (challenge.status !== 'accepted') throw new Error('Challenge is not in accepted state');
  if (challenge.creatorId !== userId && challenge.acceptedById !== userId) {
    throw new Error('Not authorized');
  }

  // Refund the acceptor's wager
  const wagerAmount = parseFloat(challenge.wagerAmount as unknown as string);
  if (challenge.acceptedById) {
    await walletService.refundWager(challenge.acceptedById, wagerAmount, challengeId);
  }

  // Reset challenge to open state
  await db
    .update(challenges)
    .set({
      status: 'open',
      acceptedById: null,
      creatorConfirmed: false,
      acceptorConfirmed: false,
    })
    .where(eq(challenges.id, challengeId));
}

export async function createGameFromChallenge(
  challengeId: string
): Promise<typeof games.$inferSelect> {
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, challengeId),
    with: { creator: true, acceptedBy: true },
  });

  if (!challenge) throw new Error('Challenge not found');
  if (challenge.status !== 'accepted') throw new Error('Challenge is not confirmed');
  if (!challenge.acceptedById) throw new Error('No acceptor found');

  // Randomly assign colors
  const whitePlayerId = Math.random() < 0.5 ? challenge.creatorId : challenge.acceptedById;
  const blackPlayerId = whitePlayerId === challenge.creatorId ? challenge.acceptedById : challenge.creatorId;

  const whitePlayer = whitePlayerId === challenge.creatorId ? challenge.creator : challenge.acceptedBy!;
  const blackPlayer = blackPlayerId === challenge.creatorId ? challenge.creator : challenge.acceptedBy!;

  // Generate starting position (Chess960 if needed)
  const startingFen = challenge.gameMode === 'chess960'
    ? chess960Service.generateChess960Position()
    : STARTING_FEN;

  const wagerAmount = typeof challenge.wagerAmount === 'string'
    ? parseFloat(challenge.wagerAmount)
    : challenge.wagerAmount;
  const totalPot = wagerAmount * 2;

  const gameId = crypto.randomUUID();
  const now = new Date();

  const [game] = await db
    .insert(games)
    .values({
      id: gameId,
      whitePlayerId,
      blackPlayerId,
      status: 'active',
      gameMode: challenge.gameMode,
      startingFen,
      currentFen: startingFen,
      pgn: '',
      moves: [],
      timeControlInitial: challenge.timeControlInitial,
      timeControlIncrement: challenge.timeControlIncrement,
      whiteTimeRemaining: challenge.timeControlInitial,
      blackTimeRemaining: challenge.timeControlInitial,
      wagerAmount: wagerAmount.toString(),
      totalPot: totalPot.toString(),
      whiteEloAtStart: whitePlayer.eloRating,
      blackEloAtStart: blackPlayer.eloRating,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
    })
    .returning();

  // Mark challenge as confirmed
  await db
    .update(challenges)
    .set({ status: 'confirmed' })
    .where(eq(challenges.id, challengeId));

  return game;
}

export async function expireChallenge(challengeId: string): Promise<void> {
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, challengeId),
  });

  if (!challenge) return;
  if (challenge.status !== 'open' && challenge.status !== 'accepted') return;

  // Refund wagers
  const wagerAmount = parseFloat(challenge.wagerAmount as unknown as string);
  await walletService.refundWager(challenge.creatorId, wagerAmount, challengeId);

  if (challenge.acceptedById) {
    await walletService.refundWager(challenge.acceptedById, wagerAmount, challengeId);
  }

  await db
    .update(challenges)
    .set({ status: 'expired' })
    .where(eq(challenges.id, challengeId));
}

export async function getOpenChallenges(): Promise<ChallengeWithCreator[]> {
  const now = new Date();

  const openChallenges = await db.query.challenges.findMany({
    where: and(
      eq(challenges.status, 'open'),
      gt(challenges.expiresAt, now)
    ),
    with: { creator: true },
    orderBy: (challenges, { desc }) => [desc(challenges.createdAt)],
  });

  return openChallenges.map((c) => toChallengeWithCreator(c, c.creator));
}

export async function getUserActiveChallenge(
  userId: string
): Promise<ChallengeWithCreator | null> {
  const challenge = await db.query.challenges.findFirst({
    where: and(
      or(
        eq(challenges.creatorId, userId),
        eq(challenges.acceptedById, userId)
      ),
      or(
        eq(challenges.status, 'open'),
        eq(challenges.status, 'accepted')
      )
    ),
    with: { creator: true, acceptedBy: true },
  });

  if (!challenge) return null;

  return toChallengeWithCreator(
    challenge,
    challenge.creator,
    challenge.acceptedBy ?? undefined
  );
}

export async function getChallenge(challengeId: string): Promise<ChallengeWithCreator | null> {
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, challengeId),
    with: { creator: true, acceptedBy: true },
  });

  if (!challenge) return null;

  return toChallengeWithCreator(
    challenge,
    challenge.creator,
    challenge.acceptedBy ?? undefined
  );
}

export async function cleanupExpiredChallenges(): Promise<number> {
  const now = new Date();

  const expiredChallenges = await db.query.challenges.findMany({
    where: and(
      or(eq(challenges.status, 'open'), eq(challenges.status, 'accepted')),
      lt(challenges.expiresAt, now)
    ),
  });

  for (const challenge of expiredChallenges) {
    await expireChallenge(challenge.id);
  }

  return expiredChallenges.length;
}
