/**
 * Discord Module Index
 *
 * Public exports for the Discord integration module.
 */

// Bot lifecycle
export { startDiscordBot, stopDiscordBot, getDiscordClient, isBotReady } from './bot';

// Configuration
export { loadDiscordConfig, buildDeepLink, EMBED_COLORS } from './config';

// Types
export type {
  DiscordCommand,
  DiscordChallenge,
  DiscordChallengeStatus,
  DiscordLinkToken,
  DiscordBotConfig,
  DiscordUserStats,
  DiscordLeaderboardEntry,
} from './types';
