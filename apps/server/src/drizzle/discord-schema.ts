/**
 * Discord Integration Database Schema
 *
 * Tables for Discord bot integration:
 * - discordChallenges: Challenges created via /challenge command
 * - discordLinkTokens: Temporary tokens for account linking
 */

import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users, games } from './pg-schema';

/**
 * Discord Challenges Table
 *
 * Stores challenges initiated via the Discord bot's /challenge command.
 * Tracks the lifecycle from creation through to game completion.
 */
export const discordChallenges = pgTable('discord_challenges', {
  // Primary key - nanoid
  id: text('id').primaryKey(),

  // Platform user IDs (challenger must be linked, opponent may not be yet)
  challengerId: text('challenger_id').notNull().references(() => users.id),
  opponentId: text('opponent_id').references(() => users.id), // Nullable until opponent links

  // Discord user IDs (snowflakes - stored as text since they're 64-bit integers)
  challengerDiscordId: text('challenger_discord_id').notNull(),
  opponentDiscordId: text('opponent_discord_id').notNull(),

  // Discord context - where the challenge was created
  guildId: text('guild_id').notNull(),   // Server ID
  channelId: text('channel_id').notNull(), // Channel ID
  messageId: text('message_id'),          // Bot's response message (for editing)

  // Status lifecycle: pending → accepted/declined/expired → completed
  status: text('status').notNull().default('pending'),

  // Game reference (set when challenge is completed and game starts)
  gameId: text('game_id').references(() => games.id),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (table) => [
  // Index for finding pending challenges for a user
  index('discord_challenges_opponent_status_idx').on(table.opponentDiscordId, table.status),
  // Index for expiry cleanup
  index('discord_challenges_expires_idx').on(table.expiresAt),
]);

/**
 * Discord Link Tokens Table
 *
 * Temporary tokens for the account linking flow.
 * When a user runs /link, we generate a token and send a deep link.
 * The token is consumed when the user opens the app and logs in.
 */
export const discordLinkTokens = pgTable('discord_link_tokens', {
  // Token is the primary key (nanoid, 32 chars)
  token: text('token').primaryKey(),

  // Discord user info (captured at token creation)
  discordId: text('discord_id').notNull(),
  discordUsername: text('discord_username').notNull(),
  discordAvatar: text('discord_avatar'), // Avatar hash, nullable

  // Token state
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').notNull().default(false),
}, (table) => [
  // Index for cleanup of expired tokens
  index('discord_link_tokens_expires_idx').on(table.expiresAt),
]);

// Relations
export const discordChallengesRelations = relations(discordChallenges, ({ one }) => ({
  challenger: one(users, {
    fields: [discordChallenges.challengerId],
    references: [users.id],
    relationName: 'discordChallengesAsChallenger',
  }),
  opponent: one(users, {
    fields: [discordChallenges.opponentId],
    references: [users.id],
    relationName: 'discordChallengesAsOpponent',
  }),
  game: one(games, {
    fields: [discordChallenges.gameId],
    references: [games.id],
  }),
}));

// Type exports
export type DiscordChallengeRow = typeof discordChallenges.$inferSelect;
export type NewDiscordChallenge = typeof discordChallenges.$inferInsert;
export type DiscordLinkTokenRow = typeof discordLinkTokens.$inferSelect;
export type NewDiscordLinkToken = typeof discordLinkTokens.$inferInsert;
