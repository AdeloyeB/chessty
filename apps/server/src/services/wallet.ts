import { eq, sql, and, gte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, users, transactions } from '../drizzle';
import type { TransactionType } from '@chess-game/shared';

export async function getBalance(userId: string): Promise<number> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error('User not found');
  }

  return parseFloat(user.balance);
}

/**
 * Atomically update a user's balance with race condition protection.
 *
 * SECURITY: This uses an atomic SQL UPDATE with a WHERE clause that checks
 * the balance condition. This prevents the TOCTOU (Time-of-Check to Time-of-Use)
 * race condition where two concurrent requests could both pass a balance check
 * and overdraw the account.
 *
 * How it works:
 * 1. For deductions (amount < 0): WHERE clause ensures balance + amount >= 0
 * 2. If condition fails, zero rows are updated
 * 3. We detect this and throw 'Insufficient balance'
 * 4. The check and update happen atomically in the database
 */
export async function updateBalance(
  userId: string,
  amount: number,
  type: TransactionType,
  referenceId?: string,
  description?: string
): Promise<{ newBalance: number; transaction: typeof transactions.$inferSelect }> {
  // Determine if we need to update totalWagered or totalWon
  const isWager = type === 'bet_placed' || type === 'game_wager';
  const isWin = type === 'bet_won' || type === 'game_win';

  // Build the atomic update with balance check in WHERE clause
  // For deductions (negative amount), we check that balance + amount >= 0
  // This happens atomically in the database, preventing race conditions
  const updateResult = await db
    .update(users)
    .set({
      // Atomic: balance = balance + amount (computed by database, not JavaScript)
      balance: sql`(${users.balance}::numeric + ${amount})::text`,
      // Atomic: totalWagered = totalWagered + |amount| (only for wager types)
      totalWagered: isWager
        ? sql`(${users.totalWagered}::numeric + ${Math.abs(amount)})::text`
        : users.totalWagered,
      // Atomic: totalWon = totalWon + amount (only for win types)
      totalWon: isWin
        ? sql`(${users.totalWon}::numeric + ${amount})::text`
        : users.totalWon,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(users.id, userId),
        // CRITICAL: This is the atomic balance check
        // For deposits (amount >= 0), this always passes
        // For withdrawals (amount < 0), this ensures balance won't go negative
        sql`(${users.balance}::numeric + ${amount}) >= 0`
      )
    )
    .returning({
      newBalance: users.balance,
    });

  // If no rows were updated, either user doesn't exist or balance check failed
  if (updateResult.length === 0) {
    // Check if user exists to give appropriate error
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, balance: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // User exists but update failed = insufficient balance
    throw new Error('Insufficient balance');
  }

  const newBalance = parseFloat(updateResult[0].newBalance);

  // Create transaction record (this is safe - balance already updated atomically)
  const [transaction] = await db
    .insert(transactions)
    .values({
      id: nanoid(),
      userId,
      type,
      amount: amount.toString(),
      balanceAfter: newBalance.toString(),
      referenceId,
      description,
    })
    .returning();

  return { newBalance, transaction };
}

export async function deductWager(userId: string, amount: number, gameId: string): Promise<number> {
  const { newBalance } = await updateBalance(
    userId,
    -amount,
    'game_wager',
    gameId,
    `Wager for game ${gameId}`
  );
  return newBalance;
}

export async function awardWinnings(
  userId: string,
  amount: number,
  gameId: string
): Promise<number> {
  const { newBalance } = await updateBalance(
    userId,
    amount,
    'game_win',
    gameId,
    `Winnings from game ${gameId}`
  );
  return newBalance;
}

export async function refundWager(
  userId: string,
  amount: number,
  referenceId: string
): Promise<number> {
  const { newBalance } = await updateBalance(
    userId,
    amount,
    'bet_refunded',
    referenceId,
    `Wager refunded: ${referenceId}`
  );
  return newBalance;
}

export async function placeBet(userId: string, amount: number, betId: string): Promise<number> {
  const { newBalance } = await updateBalance(
    userId,
    -amount,
    'bet_placed',
    betId,
    `Bet placed: ${betId}`
  );
  return newBalance;
}

export async function settleBetWin(
  userId: string,
  payout: number,
  betId: string
): Promise<number> {
  const { newBalance } = await updateBalance(
    userId,
    payout,
    'bet_won',
    betId,
    `Bet won: ${betId}`
  );
  return newBalance;
}

export async function refundBet(
  userId: string,
  amount: number,
  betId: string,
  reason: string = 'Game ended in draw'
): Promise<number> {
  const { newBalance } = await updateBalance(
    userId,
    amount,
    'bet_refunded',
    betId,
    `Bet refunded: ${reason}`
  );
  return newBalance;
}

export async function getTransactionHistory(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<typeof transactions.$inferSelect[]> {
  const result = await db.query.transactions.findMany({
    where: eq(transactions.userId, userId),
    orderBy: (transactions, { desc }) => [desc(transactions.createdAt)],
    limit,
    offset,
  });

  return result;
}
