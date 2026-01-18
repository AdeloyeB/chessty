import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, bets, games, users } from '../drizzle';
import { calculateOdds, calculatePotentialPayout, getMoveNumber, HOUSE_EDGE_DRAW_REFUND } from '@chess-game/shared';
import * as walletService from './wallet';

export interface PlaceBetInput {
  gameId: string;
  userId: string;
  betOnPlayerId: string;
  amount: number;
}

export interface BetOdds {
  whiteOdds: number;
  blackOdds: number;
  whitePlayerId: string;
  blackPlayerId: string;
}

export async function getGameOdds(gameId: string): Promise<BetOdds> {
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
  });

  if (!game) {
    throw new Error('Game not found');
  }

  const whiteOdds = calculateOdds(
    game.whiteEloAtStart,
    game.blackEloAtStart,
    game.whiteTimeRemaining,
    game.blackTimeRemaining
  );

  const blackOdds = calculateOdds(
    game.blackEloAtStart,
    game.whiteEloAtStart,
    game.blackTimeRemaining,
    game.whiteTimeRemaining
  );

  return {
    whiteOdds,
    blackOdds,
    whitePlayerId: game.whitePlayerId,
    blackPlayerId: game.blackPlayerId,
  };
}

export async function placeBet(input: PlaceBetInput): Promise<typeof bets.$inferSelect> {
  const { gameId, userId, betOnPlayerId, amount } = input;

  // Get the game
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
  });

  if (!game) {
    throw new Error('Game not found');
  }

  if (game.status !== 'active') {
    throw new Error('Can only bet on active games');
  }

  // Cannot bet on own game
  if (game.whitePlayerId === userId || game.blackPlayerId === userId) {
    throw new Error('Cannot bet on your own game');
  }

  // Validate bet target
  if (betOnPlayerId !== game.whitePlayerId && betOnPlayerId !== game.blackPlayerId) {
    throw new Error('Invalid bet target');
  }

  // Check user balance
  const balance = await walletService.getBalance(userId);
  if (balance < amount) {
    throw new Error('Insufficient balance');
  }

  // Calculate odds at time of bet
  const isWhiteBet = betOnPlayerId === game.whitePlayerId;
  const odds = isWhiteBet
    ? calculateOdds(
        game.whiteEloAtStart,
        game.blackEloAtStart,
        game.whiteTimeRemaining,
        game.blackTimeRemaining
      )
    : calculateOdds(
        game.blackEloAtStart,
        game.whiteEloAtStart,
        game.blackTimeRemaining,
        game.whiteTimeRemaining
      );

  const potentialPayout = calculatePotentialPayout(amount, odds);
  const moveNumber = getMoveNumber(game.pgn);

  const betId = nanoid();

  // Deduct bet amount from user
  await walletService.placeBet(userId, amount, betId);

  // Create bet record
  const [bet] = await db
    .insert(bets)
    .values({
      id: betId,
      gameId,
      userId,
      betOnPlayerId,
      amount: amount.toString(),
      odds: odds.toString(),
      potentialPayout: potentialPayout.toString(),
      status: 'pending',
      fenAtBet: game.currentFen,
      moveNumberAtBet: moveNumber,
    })
    .returning();

  return bet;
}

export async function settleBetsForGame(gameId: string, winnerId: string | null): Promise<void> {
  const gameBets = await db.query.bets.findMany({
    where: and(eq(bets.gameId, gameId), eq(bets.status, 'pending')),
  });

  for (const bet of gameBets) {
    if (winnerId === null) {
      // Draw - refund with house edge
      const refundAmount = parseFloat(bet.amount) * (1 - HOUSE_EDGE_DRAW_REFUND);
      await walletService.refundBet(bet.userId, refundAmount, bet.id, 'Game ended in draw');

      await db
        .update(bets)
        .set({
          status: 'draw',
          settledAt: new Date(),
        })
        .where(eq(bets.id, bet.id));
    } else if (bet.betOnPlayerId === winnerId) {
      // Win - pay out
      const payout = parseFloat(bet.potentialPayout);
      await walletService.settleBetWin(bet.userId, payout, bet.id);

      await db
        .update(bets)
        .set({
          status: 'won',
          settledAt: new Date(),
        })
        .where(eq(bets.id, bet.id));
    } else {
      // Loss - already deducted, just update status
      await db
        .update(bets)
        .set({
          status: 'lost',
          settledAt: new Date(),
        })
        .where(eq(bets.id, bet.id));
    }
  }
}

export async function getUserBetHistory(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<typeof bets.$inferSelect[]> {
  return db.query.bets.findMany({
    where: eq(bets.userId, userId),
    orderBy: [desc(bets.createdAt)],
    limit,
    offset,
  });
}

export async function getGameBets(gameId: string): Promise<typeof bets.$inferSelect[]> {
  return db.query.bets.findMany({
    where: eq(bets.gameId, gameId),
    orderBy: [desc(bets.createdAt)],
  });
}

export async function getPendingBetsForUser(userId: string): Promise<typeof bets.$inferSelect[]> {
  return db.query.bets.findMany({
    where: and(eq(bets.userId, userId), eq(bets.status, 'pending')),
    orderBy: [desc(bets.createdAt)],
  });
}

export async function getBetStats(userId: string): Promise<{
  totalBets: number;
  wins: number;
  losses: number;
  draws: number;
  totalWagered: number;
  totalWon: number;
  profitLoss: number;
}> {
  const userBets = await db.query.bets.findMany({
    where: eq(bets.userId, userId),
  });

  const stats = {
    totalBets: userBets.length,
    wins: 0,
    losses: 0,
    draws: 0,
    totalWagered: 0,
    totalWon: 0,
    profitLoss: 0,
  };

  for (const bet of userBets) {
    const amount = parseFloat(bet.amount);
    stats.totalWagered += amount;

    switch (bet.status) {
      case 'won':
        stats.wins++;
        const payout = parseFloat(bet.potentialPayout);
        stats.totalWon += payout;
        stats.profitLoss += payout - amount;
        break;
      case 'lost':
        stats.losses++;
        stats.profitLoss -= amount;
        break;
      case 'draw':
        stats.draws++;
        const refund = amount * (1 - HOUSE_EDGE_DRAW_REFUND);
        stats.profitLoss += refund - amount;
        break;
    }
  }

  return stats;
}
