import { eq, desc } from 'drizzle-orm';
import { db, spectatorChat, users, games } from '../drizzle';
import type { SpectatorChatMessage } from '@chess-game/shared';

export interface ChatMessageWithUsername extends SpectatorChatMessage {
  username: string;
}

function toChatMessage(
  message: typeof spectatorChat.$inferSelect,
  username: string
): ChatMessageWithUsername {
  return {
    id: message.id,
    gameId: message.gameId,
    userId: message.userId,
    username,
    message: message.message,
    createdAt: message.createdAt,
  };
}

export async function sendMessage(
  gameId: string,
  userId: string,
  messageText: string
): Promise<ChatMessageWithUsername> {
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

  // Check if user is a player (players cannot send spectator chat)
  if (game.whitePlayerId === userId || game.blackPlayerId === userId) {
    throw new Error('Players cannot send spectator chat messages');
  }

  // Get user for username
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Validate message length
  if (messageText.length > 500) {
    throw new Error('Message too long (max 500 characters)');
  }

  if (messageText.trim().length === 0) {
    throw new Error('Message cannot be empty');
  }

  const id = crypto.randomUUID();
  const now = new Date();

  const [message] = await db
    .insert(spectatorChat)
    .values({
      id,
      gameId,
      userId,
      message: messageText.trim(),
      createdAt: now,
    })
    .returning();

  return toChatMessage(message, user.username);
}

export async function getRecentMessages(
  gameId: string,
  limit: number = 50
): Promise<ChatMessageWithUsername[]> {
  const messages = await db.query.spectatorChat.findMany({
    where: eq(spectatorChat.gameId, gameId),
    with: { user: true },
    orderBy: [desc(spectatorChat.createdAt)],
    limit,
  });

  return messages
    .map((m) => toChatMessage(m, m.user.username))
    .reverse(); // Return in chronological order
}

export async function deleteMessage(
  messageId: string,
  userId: string
): Promise<void> {
  const message = await db.query.spectatorChat.findFirst({
    where: eq(spectatorChat.id, messageId),
  });

  if (!message) {
    throw new Error('Message not found');
  }

  if (message.userId !== userId) {
    throw new Error('Not authorized to delete this message');
  }

  await db.delete(spectatorChat).where(eq(spectatorChat.id, messageId));
}

export async function clearGameChat(gameId: string): Promise<void> {
  await db.delete(spectatorChat).where(eq(spectatorChat.gameId, gameId));
}
