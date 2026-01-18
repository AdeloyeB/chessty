import { eq, or, and, desc, gte, lte, sql, count, sum, avg } from 'drizzle-orm';
import { db, games, users, transactions } from '../drizzle';
import type { Game, Move, GameResult, GameStatus, HistoryFilters, HistoryGame, HistoryStats, HistoryTransaction, DateRange, getTimeControlCategory, getTimeControlLabel } from '@chess-game/shared';
import { STARTING_FEN } from '@chess-game/shared';
import * as eloService from './elo';
import * as walletService from './wallet';
import * as bettingService from './betting';
import * as authService from './auth';

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

// Helper to get time control category
function getTimeCategory(initial: number): 'bullet' | 'blitz' | 'rapid' | 'classical' {
  if (initial < 180) return 'bullet';
  if (initial < 600) return 'blitz';
  if (initial < 1800) return 'rapid';
  return 'classical';
}

// Helper to get time control label
function getTimeLabel(initial: number, increment: number): string {
  const minutes = Math.floor(initial / 60);
  if (increment > 0) {
    return `${minutes}+${increment}`;
  }
  return `${minutes} min`;
}

// Enhanced game history with filters and opponent info
export async function getUserGameHistoryFiltered(
  userId: string,
  filters: HistoryFilters,
  limit: number = 20,
  offset: number = 0
): Promise<{ games: any[]; total: number }> {
  // Build where conditions
  const conditions: any[] = [
    or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId)),
    eq(games.status, 'completed'),
  ];

  // Date range filter
  if (filters.dateRange.start) {
    conditions.push(gte(games.endedAt, filters.dateRange.start));
  }
  if (filters.dateRange.end) {
    conditions.push(lte(games.endedAt, filters.dateRange.end));
  }

  // Game mode filter
  if (filters.gameMode !== 'all') {
    conditions.push(eq(games.gameMode, filters.gameMode));
  }

  // Stake filters
  if (filters.minStake !== undefined) {
    conditions.push(gte(games.stakeAmount, filters.minStake));
  }
  if (filters.maxStake !== undefined) {
    conditions.push(lte(games.stakeAmount, filters.maxStake));
  }

  // Get all matching games with players
  const allGames = await db.query.games.findMany({
    where: and(...conditions),
    with: {
      whitePlayer: true,
      blackPlayer: true,
    },
    orderBy: [desc(games.endedAt)],
  });

  // Filter by result and time control in memory (more complex conditions)
  let filtered = allGames.filter(game => {
    // Result filter
    if (filters.result !== 'all') {
      const playerIsWhite = game.whitePlayerId === userId;
      const isWin = game.winnerId === userId;
      const isDraw = game.winnerId === null && game.result !== 'abandonment';

      if (filters.result === 'win' && !isWin) return false;
      if (filters.result === 'loss' && (isWin || isDraw)) return false;
      if (filters.result === 'draw' && !isDraw) return false;
    }

    // Time control filter
    if (filters.timeControl !== 'all') {
      const category = getTimeCategory(game.timeControlInitial);
      if (category !== filters.timeControl) return false;
    }

    return true;
  });

  const total = filtered.length;

  // Apply pagination
  const paginated = filtered.slice(offset, offset + limit);

  // Transform to HistoryGame format
  const historyGames = paginated.map(game => {
    const playerIsWhite = game.whitePlayerId === userId;
    const opponent = playerIsWhite ? game.blackPlayer : game.whitePlayer;
    const isWin = game.winnerId === userId;
    const isDraw = game.winnerId === null && game.result !== 'abandonment';

    let result: 'win' | 'loss' | 'draw';
    if (isWin) result = 'win';
    else if (isDraw) result = 'draw';
    else result = 'loss';

    const movesArray = game.moves as Move[] || [];
    const duration = game.endedAt && game.startedAt
      ? Math.floor((new Date(game.endedAt).getTime() - new Date(game.startedAt).getTime()) / 1000)
      : 0;

    // Calculate ELO change for this player
    let eloChange = game.eloChange || 0;
    if (result === 'loss') eloChange = -eloChange;
    else if (result === 'draw') eloChange = 0;

    return {
      id: game.id,
      opponent: authService.toPublicUser(opponent),
      playerColor: playerIsWhite ? 'white' : 'black',
      result,
      resultDetail: game.result,
      gameMode: game.gameMode,
      timeControlInitial: game.timeControlInitial,
      timeControlIncrement: game.timeControlIncrement,
      timeControlLabel: getTimeLabel(game.timeControlInitial, game.timeControlIncrement),
      stakeAmount: parseFloat(game.stakeAmount as any),
      totalPot: parseFloat(game.totalPot as any),
      eloChange,
      eloAtStart: playerIsWhite ? game.whiteEloAtStart : game.blackEloAtStart,
      opponentEloAtStart: playerIsWhite ? game.blackEloAtStart : game.whiteEloAtStart,
      opening: null, // Will be detected client-side
      moveCount: movesArray.length,
      moves: movesArray,
      pgn: game.pgn,
      startingFen: game.startingFen,
      endedAt: game.endedAt,
      duration,
    };
  });

  return { games: historyGames, total };
}

// Get comprehensive stats for user
export async function getUserHistoryStats(
  userId: string,
  dateRange?: DateRange
): Promise<HistoryStats> {
  // Build date conditions
  const dateConditions: any[] = [];
  if (dateRange?.start) {
    dateConditions.push(gte(games.endedAt, dateRange.start));
  }
  if (dateRange?.end) {
    dateConditions.push(lte(games.endedAt, dateRange.end));
  }

  // Get user's current stats
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get all completed games for detailed stats
  const userGames = await db.query.games.findMany({
    where: and(
      or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId)),
      eq(games.status, 'completed'),
      ...dateConditions
    ),
    orderBy: [desc(games.endedAt)],
  });

  // Calculate stats
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let totalWagered = 0;
  let totalWon = 0;
  let totalLost = 0;
  let biggestWin = 0;
  let biggestLoss = 0;
  let totalOpponentElo = 0;
  let totalDuration = 0;
  let currentStreak = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let tempWinStreak = 0;
  let tempLossStreak = 0;
  let eloChange = 0;

  const bulletGames: boolean[] = [];
  const blitzGames: boolean[] = [];
  const rapidGames: boolean[] = [];
  const classicalGames: boolean[] = [];

  const dayCount: Record<string, number> = {};
  const hourCount: Record<number, number> = {};

  for (const game of userGames) {
    const playerIsWhite = game.whitePlayerId === userId;
    const isWin = game.winnerId === userId;
    const isDraw = game.winnerId === null && game.result !== 'abandonment';
    const stakeAmount = parseFloat(game.stakeAmount as any);
    const gameEloChange = game.eloChange || 0;

    totalWagered += stakeAmount;

    if (isWin) {
      wins++;
      totalWon += stakeAmount * 2;
      if (stakeAmount > biggestWin) biggestWin = stakeAmount;
      eloChange += gameEloChange;
      tempWinStreak++;
      tempLossStreak = 0;
      if (tempWinStreak > longestWinStreak) longestWinStreak = tempWinStreak;
    } else if (isDraw) {
      draws++;
      // Draw returns stake, no profit/loss
    } else {
      losses++;
      totalLost += stakeAmount;
      if (stakeAmount > biggestLoss) biggestLoss = stakeAmount;
      eloChange -= gameEloChange;
      tempLossStreak++;
      tempWinStreak = 0;
      if (tempLossStreak > longestLossStreak) longestLossStreak = tempLossStreak;
    }

    // Opponent ELO
    const opponentElo = playerIsWhite ? game.blackEloAtStart : game.whiteEloAtStart;
    totalOpponentElo += opponentElo;

    // Duration
    if (game.endedAt && game.startedAt) {
      totalDuration += Math.floor(
        (new Date(game.endedAt).getTime() - new Date(game.startedAt).getTime()) / 1000
      );
    }

    // Time control category
    const category = getTimeCategory(game.timeControlInitial);
    if (category === 'bullet') bulletGames.push(isWin);
    else if (category === 'blitz') blitzGames.push(isWin);
    else if (category === 'rapid') rapidGames.push(isWin);
    else classicalGames.push(isWin);

    // Day/hour stats
    if (game.endedAt) {
      const date = new Date(game.endedAt);
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
      dayCount[day] = (dayCount[day] || 0) + 1;
      hourCount[date.getHours()] = (hourCount[date.getHours()] || 0) + 1;
    }
  }

  // Calculate current streak from most recent games
  currentStreak = tempWinStreak > 0 ? tempWinStreak : -tempLossStreak;

  // Calculate win rates per time control
  const calcWinRate = (games: boolean[]) =>
    games.length > 0 ? Math.round((games.filter(w => w).length / games.length) * 100) : 0;

  // Find most active day and hour
  let mostActiveDay = 'N/A';
  let maxDayCount = 0;
  for (const [day, count] of Object.entries(dayCount)) {
    if (count > maxDayCount) {
      maxDayCount = count;
      mostActiveDay = day;
    }
  }

  let mostActiveHour = 0;
  let maxHourCount = 0;
  for (const [hour, count] of Object.entries(hourCount)) {
    if (count > maxHourCount) {
      maxHourCount = count;
      mostActiveHour = parseInt(hour);
    }
  }

  const totalGames = wins + losses + draws;
  const netProfit = totalWon - totalWagered;

  return {
    totalGames,
    wins,
    losses,
    draws,
    winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0,

    totalWagered,
    totalWon,
    totalLost,
    netProfit,
    roi: totalWagered > 0 ? Math.round((netProfit / totalWagered) * 100) : 0,
    biggestWin,
    biggestLoss,

    currentElo: user.eloRating,
    peakElo: user.peakEloRating,
    eloChange,
    averageOpponentElo: totalGames > 0 ? Math.round(totalOpponentElo / totalGames) : 0,

    bulletStats: { games: bulletGames.length, winRate: calcWinRate(bulletGames) },
    blitzStats: { games: blitzGames.length, winRate: calcWinRate(blitzGames) },
    rapidStats: { games: rapidGames.length, winRate: calcWinRate(rapidGames) },
    classicalStats: { games: classicalGames.length, winRate: calcWinRate(classicalGames) },

    currentStreak,
    longestWinStreak,
    longestLossStreak,

    averageGameDuration: totalGames > 0 ? Math.round(totalDuration / totalGames) : 0,
    mostActiveDay,
    mostActiveHour,
  };
}

// Get transactions with optional date filter
export async function getUserTransactionsFiltered(
  userId: string,
  dateRange?: DateRange,
  limit: number = 50,
  offset: number = 0
): Promise<{ transactions: any[]; total: number }> {
  const conditions: any[] = [eq(transactions.userId, userId)];

  if (dateRange?.start) {
    conditions.push(gte(transactions.createdAt, dateRange.start));
  }
  if (dateRange?.end) {
    conditions.push(lte(transactions.createdAt, dateRange.end));
  }

  // Get total count
  const countResult = await db
    .select({ count: count() })
    .from(transactions)
    .where(and(...conditions));
  const total = countResult[0]?.count || 0;

  // Get paginated transactions
  const txs = await db.query.transactions.findMany({
    where: and(...conditions),
    orderBy: [desc(transactions.createdAt)],
    limit,
    offset,
  });

  return {
    transactions: txs.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      balanceAfter: tx.balanceAfter,
      referenceId: tx.referenceId,
      description: tx.description,
      createdAt: tx.createdAt,
    })),
    total,
  };
}

// Get financial summary for date range
export async function getUserFinancialSummary(
  userId: string,
  dateRange?: DateRange
): Promise<any> {
  const conditions: any[] = [
    eq(transactions.userId, userId),
  ];

  if (dateRange?.start) {
    conditions.push(gte(transactions.createdAt, dateRange.start));
  }
  if (dateRange?.end) {
    conditions.push(lte(transactions.createdAt, dateRange.end));
  }

  const txs = await db.query.transactions.findMany({
    where: and(...conditions),
    orderBy: [transactions.createdAt],
  });

  let gameWins = 0;
  let gameLosses = 0;
  let deposits = 0;
  let withdrawals = 0;
  let startingBalance = 0;
  let endingBalance = 0;
  let totalGames = 0;

  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    if (i === 0) startingBalance = tx.balanceAfter - tx.amount;
    endingBalance = tx.balanceAfter;

    switch (tx.type) {
      case 'game_win':
        gameWins += tx.amount;
        totalGames++;
        break;
      case 'game_stake':
        gameLosses += Math.abs(tx.amount);
        break;
      case 'deposit':
        deposits += tx.amount;
        break;
      case 'withdrawal':
        withdrawals += Math.abs(tx.amount);
        break;
    }
  }

  return {
    dateRange,
    totalGames,
    gameWins,
    gameLosses,
    gameProfit: gameWins - gameLosses,
    deposits,
    withdrawals,
    netChange: endingBalance - startingBalance,
    startingBalance,
    endingBalance,
  };
}
