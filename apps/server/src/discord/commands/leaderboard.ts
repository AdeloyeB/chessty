/**
 * /leaderboard Command
 *
 * Shows the top 10 players by ELO rating or total winnings.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { DiscordCommand } from '../types';
import { getEloLeaderboard, getWinningsLeaderboard } from '../../services/discord';
import { EMBED_COLORS } from '../config';

export const leaderboardCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the chkmate leaderboard')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Leaderboard type')
        .setRequired(false)
        .addChoices(
          { name: 'ELO Rating', value: 'elo' },
          { name: 'Total Winnings', value: 'winnings' }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const type = (interaction.options.getString('type') || 'elo') as 'elo' | 'winnings';

    await interaction.deferReply();

    try {
      const entries = type === 'elo'
        ? await getEloLeaderboard(10)
        : await getWinningsLeaderboard(10);

      if (entries.length === 0) {
        await interaction.editReply('No players found on the leaderboard yet.');
        return;
      }

      // Format leaderboard entries
      const lines = entries.map((entry) => {
        const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `${entry.rank}.`;
        const name = entry.displayName || entry.username;
        const value = type === 'elo'
          ? `${entry.value} ELO`
          : `$${entry.value.toLocaleString()} USDC`;

        return `${medal} **${name}** — ${value}`;
      });

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.PRIMARY)
        .setTitle(type === 'elo' ? '🏆 ELO Leaderboard' : '💰 Winnings Leaderboard')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'chkmate.xyz • Top 10 players' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[Discord] Leaderboard error:', error);
      await interaction.editReply('Failed to fetch leaderboard. Please try again.');
    }
  },
};
