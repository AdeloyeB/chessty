/**
 * /ping Command
 *
 * Simple test command to verify the bot is working.
 * Returns the bot's latency to Discord's API.
 */

import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { DiscordCommand } from '../types';

export const pingCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the chkmate bot is online'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sent = await interaction.reply({
      content: 'Pinging...',
      fetchReply: true,
    });

    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);

    await interaction.editReply(
      `\`\`\`\n` +
      `chkmate bot status: ONLINE\n` +
      `─────────────────────────\n` +
      `Roundtrip latency: ${latency}ms\n` +
      `Discord API ping:  ${apiLatency}ms\n` +
      `\`\`\``
    );
  },
};
