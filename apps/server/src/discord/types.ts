/**
 * Discord Bot Types
 *
 * Defines types used across the Discord integration module.
 * Kept separate from shared types since these are server-internal.
 */

import type { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

/**
 * Command interface - each slash command must implement this
 */
export interface DiscordCommand {
  /** The slash command definition */
  data: SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  /** Handler function called when the command is invoked */
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

/**
 * Discord challenge status - tracks the lifecycle of a challenge created via Discord
 */
export type DiscordChallengeStatus =
  | 'pending'    // Created, waiting for opponent to accept
  | 'accepted'   // Opponent clicked accept, opening app to set wager
  | 'declined'   // Opponent declined
  | 'expired'    // 24hr timeout
  | 'completed'; // Game was created

/**
 * Discord challenge record - stored in database
 */
export interface DiscordChallenge {
  id: string;
  challengerId: string;        // Platform user ID
  challengerDiscordId: string; // Discord user ID (snowflake)
  opponentDiscordId: string;   // Discord user ID (snowflake)
  opponentId: string | null;   // Platform user ID (null if not linked yet)
  guildId: string;             // Discord server ID
  channelId: string;           // Channel where command was used
  messageId: string | null;    // Bot's response message ID (for editing)
  status: DiscordChallengeStatus;
  gameId: string | null;       // Created game ID (after completion)
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Discord link token - temporary token for account linking
 */
export interface DiscordLinkToken {
  token: string;
  discordId: string;
  discordUsername: string;
  discordAvatar: string | null;
  expiresAt: Date;
  used: boolean;
}

/**
 * Bot configuration
 */
export interface DiscordBotConfig {
  token: string;
  clientId: string;
  guildId?: string; // Optional - only set for development/testing
}

/**
 * Stats returned for /stats command
 */
export interface DiscordUserStats {
  username: string;
  displayName: string | null;
  eloRating: number;
  peakEloRating: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDraw: number;
  winRate: number; // Calculated percentage
  currentStreak: number;
}

/**
 * Leaderboard entry for /leaderboard command
 */
export interface DiscordLeaderboardEntry {
  rank: number;
  username: string;
  displayName: string | null;
  value: number; // ELO rating or total winnings
}
