import { eq, or, and, desc } from 'drizzle-orm';
import { db, games, users } from '../drizzle';
import type { Game, Move, GameResult, GameStatus } from '@chess-game/shared';
import { STARTING_FEN } from '@chess-game/shared';
import * as eloService from './elo';
import * as walletService from './wallet';
import * as bettingService from './betting';

export interface GameWithPlayers {
  game: typeof games.$inferSelect;
  whitePlayer: typeof users.$inferSelect;
  blackPlayer: typeof users.$inferSelect;
}

export async function getGame(gameId: string): Promise<typeof games.$inferSelect | null> {
  return db.query.games.findFirst({
    where: eq(games.id, gameId),
  });
}

export async function getGameWithPlayers(gameId: string): Promise<GameWithPlayers | null> {
  const game = await db.query.games.findFirst({
    where: eq(games.id, gameId),
    with: {
      whitePlayer: true,
      blackPlayer: true,
    },
  });

  if (!game) return null;

  return {
    game,
    whitePlayer: game.whitePlayer,
    blackPlayer: game.blackPlayer,
  };
}

export async function startGame(gameId: string): Promise<typeof games.$inferSelect> {
  const [updated] = await db
    .update(games)
    .set({
      status: 'active',
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(games.id, gameId))
    .returning();

  return updated;
}

export async function makeMove(
  gameId: string,
  move: Move,
  newFen: string,
  newPgn: string,
  whiteTime: number,
  blackTime: number
): Promise<typeof games.$inferSelect> {
  const game = await getGame(gameId);
  if (!game) throw new Error('Game not found');

  const currentMoves = game.moves as Move[];
  const updatedMoves = [...currentMoves, move];

  const [updated] = await db
    .update(games)
    .set({
      currentFen: newFen,
      pgn: newPgn,
      moves: updatedMoves,
      whiteTimeRemaining: whiteTime,
      blackTimeRemaining: blackTime,
      updatedAt: new Date(),
    })
    .where(eq(games.id, gameId))
    .returning();

  return updated;
}

export async function endGame(
  gameId: string,
  result: GameResult,
  winnerId: string | null
): Promise<{ game: typeof games.$inferSelect; eloChanges: eloService.EloUpdate }> {
  const game = await getGame(gameId);
  if (!game) throw new Error('Game not found');

  // Determine result type for ELO calculation
  let eloResult: 'white' | 'black' | 'draw';
  if (result === 'white_wins' || result === 'timeout' && winnerId === game.whitePlayerId || result === 'resignation' && winnerId === game.whitePlayerId) {
    eloResult = 'white';
  } else if (result === 'black_wins' || result === 'timeout' && winnerId === game.blackPlayerId || result === 'resignation' && winnerId === game.blackPlayerId) {
    eloResult = 'black';
  } else {
    eloResult = 'draw';
  }

  // Update ELO ratings
  const eloChanges = await eloService.updateEloRatings(
    game.whitePlayerId,
    game.blackPlayerId,
    game.whiteEloAtStart,
    game.blackEloAtStart,
    eloResult
  );

  // Distribute winnings
  const totalPot = parseFloat(game.totalPot);
  if (winnerId) {
    await walletService.awardWinnings(winnerId, totalPot, gameId);
  } else {
    // Draw - return stakes
    const stakeAmount = parseFloat(game.stakeAmount);
    await Promise.all([
      walletService.awardWinnings(game.whitePlayerId, stakeAmount, gameId),
      walletService.awardWinnings(game.blackPlayerId, stakeAmount, gameId),
    ]);
  }

  // Settle spectator bets
  await bettingService.settleBetsForGame(gameId, winnerId);

  // Update game record
  const [updated] = await db
    .update(games)
    .set({
      status: 'completed',
      result,
      winnerId,
      eloChange: Math.abs(eloChanges.whiteChange),
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(games.id, gameId))
    .returning();

  return { game: updated, eloChanges };
}

export async function abandonGame(gameId: string, abandoningPlayerId: string): Promise<typeof games.$inferSelect> {
  const game = await getGame(gameId);
  if (!game) throw new Error('Game not found');

  const winnerId =
    abandoningPlayerId === game.whitePlayerId ? game.blackPlayerId : game.whitePlayerId;

  const { game: updated } = await endGame(gameId, 'abandonment', winnerId);
  return updated;
}

export async function getUserActiveGame(userId: string): Promise<typeof games.$inferSelect | null> {
  return db.query.games.findFirst({
    where: and(
      or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId)),
      or(eq(games.status, 'pending'), eq(games.status, 'active'))
    ),
  });
}

export async function getUserGameHistory(
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<typeof games.$inferSelect[]> {
  return db.query.games.findMany({
    where: and(
      or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId)),
      eq(games.status, 'completed')
    ),
    orderBy: [desc(games.endedAt)],
    limit,
    offset,
  });
}

export async function getActiveGames(): Promise<typeof games.$inferSelect[]> {
  return db.query.games.findMany({
    where: eq(games.status, 'active'),
    orderBy: [desc(games.startedAt)],
  });
}

export async function updateClocks(
  gameId: string,
  whiteTime: number,
  blackTime: number
): Promise<void> {
  await db
    .update(games)
    .set({
      whiteTimeRemaining: whiteTime,
      blackTimeRemaining: blackTime,
      updatedAt: new Date(),
    })
    .where(eq(games.id, gameId));
}

export function isPlayerInGame(game: typeof games.$inferSelect, userId: string): boolean {
  return game.whitePlayerId === userId || game.blackPlayerId === userId;
}

export function getPlayerColor(
  game: typeof games.$inferSelect,
  userId: string
): 'white' | 'black' | null {
  if (game.whitePlayerId === userId) return 'white';
  if (game.blackPlayerId === userId) return 'black';
  return null;
}

export function isPlayerTurn(game: typeof games.$inferSelect, userId: string): boolean {
  const fen = game.currentFen;
  const isWhiteTurn = fen.split(' ')[1] === 'w';
  const playerColor = getPlayerColor(game, userId);
  return (isWhiteTurn && playerColor === 'white') || (!isWhiteTurn && playerColor === 'black');
}
