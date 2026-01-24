import { eq, and, or } from 'drizzle-orm';
import { db, spectatorPredictions, users, games } from '../drizzle';
import type { SpectatorPredictionWithUsers, PublicUser } from '@chess-game/shared';
import * as walletService from './wallet';

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

function toPredictionWithUsers(
  prediction: typeof spectatorPredictions.$inferSelect,
  creator: typeof users.$inferSelect,
  predictedWinner: typeof users.$inferSelect,
  acceptor?: typeof users.$inferSelect
): SpectatorPredictionWithUsers {
  const amount = typeof prediction.amount === 'string'
    ? parseFloat(prediction.amount)
    : Number(prediction.amount);

  return {
    id: prediction.id,
    gameId: prediction.gameId,
    creatorId: prediction.creatorId,
    acceptorId: prediction.acceptorId,
    predictedWinnerId: prediction.predictedWinnerId,
    amount,
    status: prediction.status as any,
    createdAt: prediction.createdAt,
    settledAt: prediction.settledAt,
    creator: toPublicUser(creator),
    acceptor: acceptor ? toPublicUser(acceptor) : undefined,
    predictedWinner: toPublicUser(predictedWinner),
  };
}

export async function createPrediction(
  gameId: string,
  creatorId: string,
  predictedWinnerId: string,
  amount: number
): Promise<SpectatorPredictionWithUsers> {
  // Validate game exists and is active
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
  });

  if (!game) {
    throw new Error('Game not found');
  }

  if (game.status !== 'active') {
    throw new Error('Game is not active');
  }

  // Check if user is a player (players cannot make spectator predictions)
  if (game.whitePlayerId === creatorId || game.blackPlayerId === creatorId) {
    throw new Error('Players cannot make spectator predictions');
  }

  // Validate predicted winner is one of the players
  if (predictedWinnerId !== game.whitePlayerId && predictedWinnerId !== game.blackPlayerId) {
    throw new Error('Invalid predicted winner');
  }

  // Get creator
  const creator = await db.query.users.findFirst({
    where: eq(users.id, creatorId),
  });

  if (!creator) {
    throw new Error('User not found');
  }

  // Check balance
  const userBalance = parseFloat(creator.balance as unknown as string);
  if (userBalance < amount) {
    throw new Error('Insufficient balance');
  }

  // Check if user already has an open prediction on this game
  const existingPrediction = await db.query.spectatorPredictions.findFirst({
    where: and(
      eq(spectatorPredictions.gameId, gameId),
      eq(spectatorPredictions.creatorId, creatorId),
      eq(spectatorPredictions.status, 'open')
    ),
  });

  if (existingPrediction) {
    throw new Error('You already have an open prediction on this game');
  }

  // Reserve the amount
  await walletService.deductStake(creatorId, amount, `prediction-${gameId}`);

  // Get predicted winner for response
  const predictedWinner = await db.query.users.findFirst({
    where: eq(users.id, predictedWinnerId),
  });

  if (!predictedWinner) {
    throw new Error('Predicted winner not found');
  }

  const id = crypto.randomUUID();
  const now = new Date();

  const [prediction] = await db
    .insert(spectatorPredictions)
    .values({
      id,
      gameId,
      creatorId,
      predictedWinnerId,
      amount: amount.toString(),
      status: 'open',
      createdAt: now,
    })
    .returning();

  return toPredictionWithUsers(prediction, creator, predictedWinner);
}

export async function acceptPrediction(
  predictionId: string,
  acceptorId: string
): Promise<SpectatorPredictionWithUsers> {
  const prediction = await db.query.spectatorPredictions.findFirst({
    where: eq(spectatorPredictions.id, predictionId),
    with: {
      creator: true,
      predictedWinner: true,
      game: true,
    },
  });

  if (!prediction) {
    throw new Error('Prediction not found');
  }

  if (prediction.status !== 'open') {
    throw new Error('Prediction is not available');
  }

  if (prediction.creatorId === acceptorId) {
    throw new Error('Cannot accept your own prediction');
  }

  // Check if game is still active
  if (prediction.game.status !== 'active') {
    throw new Error('Game is no longer active');
  }

  // Check if acceptor is a player
  if (prediction.game.whitePlayerId === acceptorId || prediction.game.blackPlayerId === acceptorId) {
    throw new Error('Players cannot accept spectator predictions');
  }

  const acceptor = await db.query.users.findFirst({
    where: eq(users.id, acceptorId),
  });

  if (!acceptor) {
    throw new Error('User not found');
  }

  // Check acceptor balance
  const amount = parseFloat(prediction.amount as unknown as string);
  const userBalance = parseFloat(acceptor.balance as unknown as string);
  if (userBalance < amount) {
    throw new Error('Insufficient balance');
  }

  // Reserve the acceptor's amount
  await walletService.deductStake(acceptorId, amount, `prediction-${prediction.gameId}`);

  const [updated] = await db
    .update(spectatorPredictions)
    .set({
      status: 'matched',
      acceptorId,
    })
    .where(eq(spectatorPredictions.id, predictionId))
    .returning();

  return toPredictionWithUsers(updated, prediction.creator, prediction.predictedWinner, acceptor);
}

export async function settlePredictionsForGame(
  gameId: string,
  winnerId: string | null
): Promise<SpectatorPredictionWithUsers[]> {
  const predictions = await db.query.spectatorPredictions.findMany({
    where: and(
      eq(spectatorPredictions.gameId, gameId),
      eq(spectatorPredictions.status, 'matched')
    ),
    with: {
      creator: true,
      acceptor: true,
      predictedWinner: true,
    },
  });

  const settledPredictions: SpectatorPredictionWithUsers[] = [];
  const now = new Date();

  for (const prediction of predictions) {
    const amount = parseFloat(prediction.amount as unknown as string);
    const totalPot = amount * 2;

    if (winnerId === null) {
      // Draw - refund both parties
      await walletService.refundStake(prediction.creatorId, amount, prediction.id);
      if (prediction.acceptorId) {
        await walletService.refundStake(prediction.acceptorId, amount, prediction.id);
      }
    } else {
      // Determine prediction winner
      const creatorWins = prediction.predictedWinnerId === winnerId;
      const predictionWinnerId = creatorWins ? prediction.creatorId : prediction.acceptorId;

      if (predictionWinnerId) {
        // Award full pot to winner
        await walletService.awardWinnings(predictionWinnerId, totalPot, prediction.id);
      }
    }

    const [settled] = await db
      .update(spectatorPredictions)
      .set({
        status: 'settled',
        settledAt: now,
      })
      .where(eq(spectatorPredictions.id, prediction.id))
      .returning();

    settledPredictions.push(
      toPredictionWithUsers(
        settled,
        prediction.creator,
        prediction.predictedWinner,
        prediction.acceptor ?? undefined
      )
    );
  }

  // Also cancel any open predictions
  const openPredictions = await db.query.spectatorPredictions.findMany({
    where: and(
      eq(spectatorPredictions.gameId, gameId),
      eq(spectatorPredictions.status, 'open')
    ),
  });

  for (const prediction of openPredictions) {
    const amount = parseFloat(prediction.amount as unknown as string);
    await walletService.refundStake(prediction.creatorId, amount, prediction.id);

    await db
      .update(spectatorPredictions)
      .set({ status: 'cancelled' })
      .where(eq(spectatorPredictions.id, prediction.id));
  }

  return settledPredictions;
}

export async function cancelPrediction(
  predictionId: string,
  userId: string
): Promise<void> {
  const prediction = await db.query.spectatorPredictions.findFirst({
    where: eq(spectatorPredictions.id, predictionId),
  });

  if (!prediction) {
    throw new Error('Prediction not found');
  }

  if (prediction.creatorId !== userId) {
    throw new Error('Not authorized');
  }

  if (prediction.status !== 'open') {
    throw new Error('Cannot cancel a matched prediction');
  }

  // Refund the creator
  const amount = parseFloat(prediction.amount as unknown as string);
  await walletService.refundStake(userId, amount, predictionId);

  await db
    .update(spectatorPredictions)
    .set({ status: 'cancelled' })
    .where(eq(spectatorPredictions.id, predictionId));
}

export async function getGamePredictions(
  gameId: string
): Promise<SpectatorPredictionWithUsers[]> {
  const predictions = await db.query.spectatorPredictions.findMany({
    where: and(
      eq(spectatorPredictions.gameId, gameId),
      or(
        eq(spectatorPredictions.status, 'open'),
        eq(spectatorPredictions.status, 'matched')
      )
    ),
    with: {
      creator: true,
      acceptor: true,
      predictedWinner: true,
    },
    orderBy: (spectatorPredictions, { desc }) => [desc(spectatorPredictions.createdAt)],
  });

  return predictions.map((p) =>
    toPredictionWithUsers(p, p.creator, p.predictedWinner, p.acceptor ?? undefined)
  );
}

export async function getUserPredictions(
  userId: string,
  gameId?: string
): Promise<SpectatorPredictionWithUsers[]> {
  const whereConditions = [
    or(
      eq(spectatorPredictions.creatorId, userId),
      eq(spectatorPredictions.acceptorId, userId)
    ),
  ];

  if (gameId) {
    whereConditions.push(eq(spectatorPredictions.gameId, gameId));
  }

  const predictions = await db.query.spectatorPredictions.findMany({
    where: and(...whereConditions),
    with: {
      creator: true,
      acceptor: true,
      predictedWinner: true,
    },
    orderBy: (spectatorPredictions, { desc }) => [desc(spectatorPredictions.createdAt)],
  });

  return predictions.map((p) =>
    toPredictionWithUsers(p, p.creator, p.predictedWinner, p.acceptor ?? undefined)
  );
}
