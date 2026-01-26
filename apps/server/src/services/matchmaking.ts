import { eq, and, gte, lte, ne, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, matchmakingQueue, games, users } from '../drizzle';
import type { TimeControl } from '@chess-game/shared';
import {
  WAGER_TOLERANCE_PERCENT,
  MAX_ELO_SEARCH_RANGE,
  ELO_SEARCH_EXPANSION_RATE,
  ELO_SEARCH_EXPANSION_INTERVAL,
} from '@chess-game/shared';
import * as walletService from './wallet';

export interface QueueEntry {
  userId: string;
  eloRating: number;
  wagerAmount: number;
  timeControl: TimeControl;
  minElo: number | null;
  maxElo: number | null;
  joinedAt: Date;
}

export interface MatchResult {
  gameId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  wagerAmount: number;
  timeControl: TimeControl;
}

export async function joinQueue(
  userId: string,
  wagerAmount: number,
  timeControl: TimeControl,
  minElo?: number,
  maxElo?: number
): Promise<QueueEntry> {
  // Check if user is already in queue
  const existing = await db.query.matchmakingQueue.findFirst({
    where: eq(matchmakingQueue.userId, userId),
  });

  if (existing) {
    throw new Error('Already in matchmaking queue');
  }

  // Get user's ELO
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Check if user has enough balance
  const balance = parseFloat(user.balance);
  if (balance < wagerAmount) {
    throw new Error('Insufficient balance for wager');
  }

  const entry = {
    userId,
    eloRating: user.eloRating,
    wagerAmount: wagerAmount.toString(),
    timeControlInitial: timeControl.initial,
    timeControlIncrement: timeControl.increment,
    minElo: minElo ?? null,
    maxElo: maxElo ?? null,
  };

  await db.insert(matchmakingQueue).values(entry);

  return {
    userId,
    eloRating: user.eloRating,
    wagerAmount,
    timeControl,
    minElo: minElo ?? null,
    maxElo: maxElo ?? null,
    joinedAt: new Date(),
  };
}

export async function leaveQueue(userId: string): Promise<void> {
  await db.delete(matchmakingQueue).where(eq(matchmakingQueue.userId, userId));
}

export async function findMatch(userId: string): Promise<MatchResult | null> {
  // Get the current user's queue entry
  const userEntry = await db.query.matchmakingQueue.findFirst({
    where: eq(matchmakingQueue.userId, userId),
  });

  if (!userEntry) {
    return null;
  }

  const userWager = parseFloat(userEntry.wagerAmount);
  const waitTime = Date.now() - userEntry.joinedAt.getTime();
  const eloExpansion = Math.min(
    MAX_ELO_SEARCH_RANGE,
    Math.floor(waitTime / ELO_SEARCH_EXPANSION_INTERVAL) * ELO_SEARCH_EXPANSION_RATE
  );

  // Calculate ELO range
  const minSearchElo = userEntry.eloRating - 100 - eloExpansion;
  const maxSearchElo = userEntry.eloRating + 100 + eloExpansion;

  // Find potential matches
  const potentialMatches = await db.query.matchmakingQueue.findMany({
    where: and(
      ne(matchmakingQueue.userId, userId),
      gte(matchmakingQueue.eloRating, minSearchElo),
      lte(matchmakingQueue.eloRating, maxSearchElo),
      eq(matchmakingQueue.timeControlInitial, userEntry.timeControlInitial),
      eq(matchmakingQueue.timeControlIncrement, userEntry.timeControlIncrement)
    ),
    orderBy: [asc(matchmakingQueue.joinedAt)],
  });

  for (const match of potentialMatches) {
    const matchWager = parseFloat(match.wagerAmount);

    // Check wager compatibility
    const wagerDiff = Math.abs(userWager - matchWager);
    const maxWager = Math.max(userWager, matchWager);
    if (wagerDiff > maxWager * WAGER_TOLERANCE_PERCENT) {
      continue;
    }

    // Check ELO preferences
    if (userEntry.minElo !== null && match.eloRating < userEntry.minElo) continue;
    if (userEntry.maxElo !== null && match.eloRating > userEntry.maxElo) continue;
    if (match.minElo !== null && userEntry.eloRating < match.minElo) continue;
    if (match.maxElo !== null && userEntry.eloRating > match.maxElo) continue;

    // Found a match! Create the game
    const gameWager = Math.min(userWager, matchWager);
    const gameResult = await createGame(
      userId,
      match.userId,
      gameWager,
      {
        initial: userEntry.timeControlInitial,
        increment: userEntry.timeControlIncrement,
      }
    );

    // Remove both players from queue
    await db.delete(matchmakingQueue).where(eq(matchmakingQueue.userId, userId));
    await db.delete(matchmakingQueue).where(eq(matchmakingQueue.userId, match.userId));

    return gameResult;
  }

  return null;
}

async function createGame(
  player1Id: string,
  player2Id: string,
  wagerAmount: number,
  timeControl: TimeControl
): Promise<MatchResult> {
  // Get both players
  const [player1, player2] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, player1Id) }),
    db.query.users.findFirst({ where: eq(users.id, player2Id) }),
  ]);

  if (!player1 || !player2) {
    throw new Error('Player not found');
  }

  // Randomly assign colors
  const isPlayer1White = Math.random() < 0.5;
  const whitePlayer = isPlayer1White ? player1 : player2;
  const blackPlayer = isPlayer1White ? player2 : player1;

  // Deduct wagers from both players
  await Promise.all([
    walletService.deductWager(whitePlayer.id, wagerAmount, 'pending'),
    walletService.deductWager(blackPlayer.id, wagerAmount, 'pending'),
  ]);

  const gameId = nanoid();

  // Create the game
  await db.insert(games).values({
    id: gameId,
    whitePlayerId: whitePlayer.id,
    blackPlayerId: blackPlayer.id,
    status: 'pending',
    timeControlInitial: timeControl.initial,
    timeControlIncrement: timeControl.increment,
    whiteTimeRemaining: timeControl.initial,
    blackTimeRemaining: timeControl.initial,
    wagerAmount: wagerAmount.toString(),
    totalPot: (wagerAmount * 2).toString(),
    whiteEloAtStart: whitePlayer.eloRating,
    blackEloAtStart: blackPlayer.eloRating,
  });

  // Update transaction references with actual game ID
  // (Already done in deductWager, but with 'pending' - would need to update in real implementation)

  return {
    gameId,
    whitePlayerId: whitePlayer.id,
    blackPlayerId: blackPlayer.id,
    wagerAmount,
    timeControl,
  };
}

export async function getQueueStatus(userId: string): Promise<QueueEntry | null> {
  const entry = await db.query.matchmakingQueue.findFirst({
    where: eq(matchmakingQueue.userId, userId),
  });

  if (!entry) {
    return null;
  }

  return {
    userId: entry.userId,
    eloRating: entry.eloRating,
    wagerAmount: parseFloat(entry.wagerAmount),
    timeControl: {
      initial: entry.timeControlInitial,
      increment: entry.timeControlIncrement,
    },
    minElo: entry.minElo,
    maxElo: entry.maxElo,
    joinedAt: entry.joinedAt,
  };
}

export async function getQueueCount(): Promise<number> {
  const entries = await db.query.matchmakingQueue.findMany();
  return entries.length;
}
