/**
 * Discord Service
 *
 * Business logic for Discord integration, completely decoupled from Discord.js.
 * This service can be called by the bot OR by HTTP endpoints.
 *
 * Why decoupled?
 * 1. Easier to test (no Discord.js mocking needed)
 * 2. Can be extracted to a separate microservice later
 * 3. HTTP API can reuse the same logic
 */

import { db, users, userProfiles, discordChallenges, discordLinkTokens } from '../drizzle';
import { eq, desc, and, gt, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { CHALLENGE_EXPIRY_MS, LINK_TOKEN_EXPIRY_MS } from '../discord/config';
import type {
  DiscordChallenge,
  DiscordLinkToken,
  DiscordUserStats,
  DiscordLeaderboardEntry,
} from '../discord/types';

// =============================================================================
// Account Linking
// =============================================================================

/**
 * Create a temporary token for linking a Discord account
 *
 * Flow:
 * 1. User runs /link in Discord
 * 2. Bot calls this function to generate a token
 * 3. Bot sends a button with deep link: chkmate://link/{token}
 * 4. User clicks, app opens, calls verifyLinkToken()
 */
export async function createLinkToken(
  discordId: string,
  discordUsername: string,
  discordAvatar: string | null
): Promise<DiscordLinkToken> {
  const token = nanoid(32); // Secure random token
  const expiresAt = new Date(Date.now() + LINK_TOKEN_EXPIRY_MS);

  await db.insert(discordLinkTokens).values({
    token,
    discordId,
    discordUsername,
    discordAvatar,
    expiresAt,
    used: false,
  });

  return {
    token,
    discordId,
    discordUsername,
    discordAvatar,
    expiresAt,
    used: false,
  };
}

/**
 * Verify and consume a link token, linking the Discord account to a platform user
 *
 * @param token - The link token from the deep link
 * @param userId - The authenticated platform user ID
 * @returns The linked Discord info, or null if invalid/expired
 */
export async function verifyLinkToken(
  token: string,
  userId: string
): Promise<{ discordId: string; discordUsername: string } | null> {
  const result = await db
    .select()
    .from(discordLinkTokens)
    .where(
      and(
        eq(discordLinkTokens.token, token),
        eq(discordLinkTokens.used, false),
        gt(discordLinkTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const linkToken = result[0];

  // Check if this Discord ID is already linked to another account
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.discordId, linkToken.discordId))
    .limit(1);

  if (existingUser.length > 0 && existingUser[0].id !== userId) {
    // Discord already linked to a different account
    return null;
  }

  // Atomically mark token as used and update user
  await db.transaction(async (tx) => {
    await tx
      .update(discordLinkTokens)
      .set({ used: true })
      .where(eq(discordLinkTokens.token, token));

    await tx
      .update(users)
      .set({ discordId: linkToken.discordId })
      .where(eq(users.id, userId));
  });

  return {
    discordId: linkToken.discordId,
    discordUsername: linkToken.discordUsername,
  };
}

/**
 * Get platform user ID from Discord ID
 */
export async function getUserByDiscordId(discordId: string): Promise<string | null> {
  const result = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.discordId, discordId))
    .limit(1);

  return result.length > 0 ? result[0].id : null;
}

/**
 * Check if a Discord user has linked their account
 */
export async function isAccountLinked(discordId: string): Promise<boolean> {
  const userId = await getUserByDiscordId(discordId);
  return userId !== null;
}

// =============================================================================
// Stats & Leaderboard
// =============================================================================

/**
 * Get stats for a Discord user (by Discord ID)
 */
export async function getStatsByDiscordId(discordId: string): Promise<DiscordUserStats | null> {
  const result = await db
    .select({
      username: users.username,
      displayName: users.displayName,
      eloRating: users.eloRating,
      peakEloRating: users.peakEloRating,
      gamesPlayed: users.gamesPlayed,
      gamesWon: users.gamesWon,
      gamesLost: users.gamesLost,
      gamesDraw: users.gamesDraw,
      currentStreak: userProfiles.currentStreak,
    })
    .from(users)
    .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(eq(users.discordId, discordId))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const user = result[0];
  const winRate = user.gamesPlayed > 0
    ? Math.round((user.gamesWon / user.gamesPlayed) * 100)
    : 0;

  return {
    username: user.username,
    displayName: user.displayName,
    eloRating: user.eloRating,
    peakEloRating: user.peakEloRating,
    gamesPlayed: user.gamesPlayed,
    gamesWon: user.gamesWon,
    gamesLost: user.gamesLost,
    gamesDraw: user.gamesDraw,
    winRate,
    currentStreak: user.currentStreak ?? 0,
  };
}

/**
 * Get ELO leaderboard (top N players by rating)
 */
export async function getEloLeaderboard(limit = 10): Promise<DiscordLeaderboardEntry[]> {
  const result = await db
    .select({
      username: users.username,
      displayName: users.displayName,
      eloRating: users.eloRating,
    })
    .from(users)
    .where(gt(users.gamesPlayed, 0)) // Only players who have played
    .orderBy(desc(users.eloRating))
    .limit(limit);

  return result.map((user, index) => ({
    rank: index + 1,
    username: user.username,
    displayName: user.displayName,
    value: user.eloRating,
  }));
}

/**
 * Get winnings leaderboard (top N players by total winnings)
 */
export async function getWinningsLeaderboard(limit = 10): Promise<DiscordLeaderboardEntry[]> {
  const result = await db
    .select({
      username: users.username,
      displayName: users.displayName,
      totalWon: users.totalWon,
    })
    .from(users)
    .where(gt(sql`CAST(${users.totalWon} AS NUMERIC)`, 0))
    .orderBy(desc(users.totalWon))
    .limit(limit);

  return result.map((user, index) => ({
    rank: index + 1,
    username: user.username,
    displayName: user.displayName,
    value: parseFloat(user.totalWon),
  }));
}

// =============================================================================
// Challenge System
// =============================================================================

/**
 * Create a Discord challenge
 *
 * @param challengerDiscordId - Discord ID of the challenger
 * @param opponentDiscordId - Discord ID of the opponent
 * @param guildId - Discord server ID
 * @param channelId - Channel where command was used
 */
export async function createChallenge(
  challengerDiscordId: string,
  opponentDiscordId: string,
  guildId: string,
  channelId: string
): Promise<{ challenge: DiscordChallenge; error?: string }> {
  // Get challenger's platform ID
  const challengerId = await getUserByDiscordId(challengerDiscordId);
  if (!challengerId) {
    return { challenge: null as any, error: 'CHALLENGER_NOT_LINKED' };
  }

  // Check if opponent is linked (optional - we can still create challenge)
  const opponentId = await getUserByDiscordId(opponentDiscordId);

  // Check for existing pending challenge between these users
  const existing = await db
    .select()
    .from(discordChallenges)
    .where(
      and(
        eq(discordChallenges.challengerDiscordId, challengerDiscordId),
        eq(discordChallenges.opponentDiscordId, opponentDiscordId),
        eq(discordChallenges.status, 'pending')
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return { challenge: null as any, error: 'CHALLENGE_ALREADY_EXISTS' };
  }

  const id = nanoid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_EXPIRY_MS);

  const challenge: DiscordChallenge = {
    id,
    challengerId,
    challengerDiscordId,
    opponentDiscordId,
    opponentId,
    guildId,
    channelId,
    messageId: null,
    status: 'pending',
    gameId: null,
    createdAt: now,
    expiresAt,
  };

  await db.insert(discordChallenges).values(challenge);

  return { challenge };
}

/**
 * Get a challenge by ID
 */
export async function getChallenge(id: string): Promise<DiscordChallenge | null> {
  const result = await db
    .select()
    .from(discordChallenges)
    .where(eq(discordChallenges.id, id))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Update challenge message ID (after bot sends response)
 */
export async function setChallengeMessageId(id: string, messageId: string): Promise<void> {
  await db
    .update(discordChallenges)
    .set({ messageId })
    .where(eq(discordChallenges.id, id));
}

/**
 * Accept a challenge (opponent clicked accept button)
 */
export async function acceptChallenge(id: string, opponentUserId: string): Promise<boolean> {
  const result = await db
    .update(discordChallenges)
    .set({
      status: 'accepted',
      opponentId: opponentUserId,
    })
    .where(
      and(
        eq(discordChallenges.id, id),
        eq(discordChallenges.status, 'pending')
      )
    )
    .returning();

  return result.length > 0;
}

/**
 * Decline a challenge
 */
export async function declineChallenge(id: string): Promise<boolean> {
  const result = await db
    .update(discordChallenges)
    .set({ status: 'declined' })
    .where(
      and(
        eq(discordChallenges.id, id),
        eq(discordChallenges.status, 'pending')
      )
    )
    .returning();

  return result.length > 0;
}

/**
 * Complete a challenge (game was created)
 */
export async function completeChallenge(id: string, gameId: string): Promise<boolean> {
  const result = await db
    .update(discordChallenges)
    .set({
      status: 'completed',
      gameId,
    })
    .where(
      and(
        eq(discordChallenges.id, id),
        eq(discordChallenges.status, 'accepted')
      )
    )
    .returning();

  return result.length > 0;
}

/**
 * Expire old challenges (called periodically)
 */
export async function expireChallenges(): Promise<number> {
  const result = await db
    .update(discordChallenges)
    .set({ status: 'expired' })
    .where(
      and(
        eq(discordChallenges.status, 'pending'),
        sql`${discordChallenges.expiresAt} < NOW()`
      )
    )
    .returning();

  return result.length;
}

/**
 * Cleanup expired link tokens (called periodically)
 */
export async function cleanupExpiredLinkTokens(): Promise<number> {
  const result = await db
    .delete(discordLinkTokens)
    .where(sql`${discordLinkTokens.expiresAt} < NOW()`)
    .returning();

  return result.length;
}
