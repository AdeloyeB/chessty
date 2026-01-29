/**
 * Discord Bot Client
 *
 * Manages the Discord.js client connection and command routing.
 * Designed to be modular - can be extracted to a separate service later.
 */

import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Collection,
  Events,
} from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { loadDiscordConfig } from './config';
import type { DiscordCommand, DiscordBotConfig } from './types';

// Import commands (will be created by sub-agents)
import { pingCommand } from './commands/ping';
import { linkCommand } from './commands/link';
import { statsCommand } from './commands/stats';
import { leaderboardCommand } from './commands/leaderboard';
import { challengeCommand } from './commands/challenge';

/**
 * Discord bot singleton instance
 */
let botClient: Client | null = null;
let botConfig: DiscordBotConfig | null = null;

/**
 * Collection of registered commands
 */
const commands = new Collection<string, DiscordCommand>();

/**
 * Register all commands
 */
function registerCommands(): void {
  const allCommands: DiscordCommand[] = [
    pingCommand,
    linkCommand,
    statsCommand,
    leaderboardCommand,
    challengeCommand,
  ];

  for (const command of allCommands) {
    commands.set(command.data.name, command);
  }
}

/**
 * Deploy slash commands to Discord
 *
 * In development (with DISCORD_GUILD_ID): deploys to single guild (instant)
 * In production: deploys globally (can take up to 1 hour to propagate)
 */
async function deployCommands(config: DiscordBotConfig): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.token);

  const commandsData = Array.from(commands.values()).map((cmd) => cmd.data.toJSON());

  try {
    if (config.guildId) {
      // Development: Guild-specific commands (instant update)
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commandsData }
      );
      console.log(`[Discord] Deployed ${commandsData.length} commands to guild ${config.guildId}`);
    } else {
      // Production: Global commands (up to 1 hour to propagate)
      await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commandsData }
      );
      console.log(`[Discord] Deployed ${commandsData.length} commands globally`);
    }
  } catch (error) {
    console.error('[Discord] Failed to deploy commands:', error);
    throw error;
  }
}

/**
 * Handle incoming slash command interactions
 */
async function handleInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
  const command = commands.get(interaction.commandName);

  if (!command) {
    console.warn(`[Discord] Unknown command: ${interaction.commandName}`);
    await interaction.reply({
      content: 'Unknown command.',
      ephemeral: true,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[Discord] Error executing ${interaction.commandName}:`, error);

    const errorMessage = 'An error occurred while executing this command.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
}

/**
 * Initialize and start the Discord bot
 *
 * Called from server startup. Returns immediately if Discord is not configured.
 */
export async function startDiscordBot(): Promise<void> {
  botConfig = loadDiscordConfig();

  if (!botConfig) {
    return; // Discord not configured, skip
  }

  // Register commands before creating client
  registerCommands();

  // Create Discord.js client with minimal intents (we only need slash commands)
  botClient = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  // Event: Bot is ready
  botClient.once(Events.ClientReady, async (client) => {
    console.log(`[Discord] Bot logged in as ${client.user.tag}`);

    // Deploy commands after login
    try {
      await deployCommands(botConfig!);
    } catch (error) {
      console.error('[Discord] Failed to deploy commands on startup:', error);
    }
  });

  // Event: Interaction received (slash commands, buttons, etc.)
  botClient.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      await handleInteraction(interaction);
    }
    // Future: Handle button interactions for challenge accept/decline
  });

  // Event: Error
  botClient.on(Events.Error, (error) => {
    console.error('[Discord] Client error:', error);
  });

  // Login to Discord
  try {
    await botClient.login(botConfig.token);
  } catch (error) {
    console.error('[Discord] Failed to login:', error);
    throw error;
  }
}

/**
 * Gracefully shutdown the Discord bot
 */
export async function stopDiscordBot(): Promise<void> {
  if (botClient) {
    botClient.destroy();
    botClient = null;
    console.log('[Discord] Bot disconnected');
  }
}

/**
 * Get the bot client (for Rich Presence updates, etc.)
 */
export function getDiscordClient(): Client | null {
  return botClient;
}

/**
 * Check if the bot is connected and ready
 */
export function isBotReady(): boolean {
  return botClient?.isReady() ?? false;
}
