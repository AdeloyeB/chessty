import { eq } from 'drizzle-orm';
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

export async function updateBalance(
  userId: string,
  amount: number,
  type: TransactionType,
  referenceId?: string,
  description?: string
): Promise<{ newBalance: number; transaction: typeof transactions.$inferSelect }> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error('User not found');
  }

  const currentBalance = parseFloat(user.balance);
  const newBalance = currentBalance + amount;

  if (newBalance < 0) {
    throw new Error('Insufficient balance');
  }

  // Update user balance
  await db
    .update(users)
    .set({
      balance: newBalance.toString(),
      totalWagered:
        type === 'bet_placed' || type === 'game_wager'
          ? (parseFloat(user.totalWagered) + Math.abs(amount)).toString()
          : user.totalWagered,
      totalWon:
        type === 'bet_won' || type === 'game_win'
          ? (parseFloat(user.totalWon) + amount).toString()
          : user.totalWon,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  // Create transaction record
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
