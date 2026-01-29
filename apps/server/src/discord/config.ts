/**
 * Discord Bot Configuration
 *
 * Loads and validates Discord-related environment variables.
 * Throws on missing required values in production.
 */

import type { DiscordBotConfig } from './types';

/**
 * Load Discord bot configuration from environment variables
 *
 * Required env vars:
 *   DISCORD_BOT_TOKEN  - Bot token from Discord Developer Portal
 *   DISCORD_CLIENT_ID  - Application ID from Discord Developer Portal
 *
 * Optional env vars:
 *   DISCORD_GUILD_ID   - For development: restricts commands to one server
 *   DISCORD_ENABLED    - Set to 'false' to disable bot startup
 */
export function loadDiscordConfig(): DiscordBotConfig | null {
  // Check if Discord bot is explicitly disabled
  if (process.env.DISCORD_ENABLED === 'false') {
    console.log('[Discord] Bot disabled via DISCORD_ENABLED=false');
    return null;
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID; // Optional

  // In development, missing credentials just disables the bot
  // In production, we want to fail loudly
  if (!token || !clientId) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[Discord] Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID - bot will not start');
    } else {
      console.log('[Discord] Bot credentials not configured - skipping Discord integration');
    }
    return null;
  }

  return {
    token,
    clientId,
    guildId: guildId || undefined,
  };
}

/**
 * Deep link base URL for chkmate:// protocol
 * Falls back to https for environments without the app installed
 */
export const DEEP_LINK_BASE = 'chkmate://';
export const WEB_FALLBACK_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://chkmate.xyz';

/**
 * Build a deep link URL
 *
 * @param path - Path after the protocol (e.g., 'challenge/abc123')
 * @param useFallback - If true, returns web URL instead of deep link
 */
export function buildDeepLink(path: string, useFallback = false): string {
  if (useFallback) {
    return `${WEB_FALLBACK_BASE}/${path}`;
  }
  return `${DEEP_LINK_BASE}${path}`;
}

/**
 * Discord embed colors (hex values)
 */
export const EMBED_COLORS = {
  PRIMARY: 0x000000,    // Pure black - matches brand
  SUCCESS: 0x22c55e,    // Green
  ERROR: 0xef4444,      // Red
  WARNING: 0xf59e0b,    // Amber
  INFO: 0x3b82f6,       // Blue
} as const;

/**
 * Challenge expiry time in milliseconds (24 hours)
 */
export const CHALLENGE_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Link token expiry time in milliseconds (5 minutes)
 */
export const LINK_TOKEN_EXPIRY_MS = 5 * 60 * 1000;
