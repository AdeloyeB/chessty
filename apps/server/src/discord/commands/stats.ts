/**
 * /stats Command
 *
 * Shows a user's chkmate stats in a formatted embed.
 * Can view your own stats or mention another Discord user.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { DiscordCommand } from '../types';
import { getStatsByDiscordId, isAccountLinked } from '../../services/discord';
import { EMBED_COLORS } from '../config';

export const statsCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View chkmate player stats')
    .addUserOption((option) =>
      option
        .setName('player')
        .setDescription('The player to view stats for (defaults to yourself)')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('player') || interaction.user;
    const discordId = targetUser.id;
    const isSelf = targetUser.id === interaction.user.id;

    // Check if account is linked
    if (!(await isAccountLinked(discordId))) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.WARNING)
        .setTitle('Account Not Linked')
        .setDescription(
          isSelf
            ? 'You haven\'t linked your Discord account to chkmate yet.\n\nUse `/link` to connect your account.'
            : `<@${discordId}> hasn't linked their Discord account to chkmate yet.`
        )
        .setFooter({ text: 'chkmate.xyz' });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // Fetch stats
    const stats = await getStatsByDiscordId(discordId);

    if (!stats) {
      await interaction.reply({
        content: 'Failed to fetch stats. Please try again.',
        ephemeral: true,
      });
      return;
    }

    // Determine streak emoji
    let streakEmoji = '';
    if (stats.currentStreak >= 10) streakEmoji = '🔥🔥🔥';
    else if (stats.currentStreak >= 5) streakEmoji = '🔥🔥';
    else if (stats.currentStreak >= 3) streakEmoji = '🔥';

    // Build stats embed
    const displayName = stats.displayName || stats.username;
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.PRIMARY)
      .setTitle(`${displayName}'s Stats`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        {
          name: 'Rating',
          value: `**${stats.eloRating}** ELO\nPeak: ${stats.peakEloRating}`,
          inline: true,
        },
        {
          name: 'Record',
          value: `${stats.gamesWon}W / ${stats.gamesLost}L / ${stats.gamesDraw}D`,
          inline: true,
        },
        {
          name: 'Win Rate',
          value: `${stats.winRate}%`,
          inline: true,
        },
        {
          name: 'Games Played',
          value: `${stats.gamesPlayed}`,
          inline: true,
        },
        {
          name: 'Current Streak',
          value: `${stats.currentStreak} ${streakEmoji}`.trim(),
          inline: true,
        }
      )
      .setFooter({ text: 'chkmate.xyz' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
