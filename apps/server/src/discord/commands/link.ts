/**
 * /link Command
 *
 * Generates a secure token and sends a deep link for account linking.
 * The user clicks the button, which opens the chkmate desktop app,
 * where they log in and their Discord account gets linked.
 */

import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { DiscordCommand } from '../types';
import { createLinkToken, isAccountLinked, getStatsByDiscordId } from '../../services/discord';
import { buildDeepLink, EMBED_COLORS } from '../config';

export const linkCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord account to chkmate'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const discordId = interaction.user.id;
    const discordUsername = interaction.user.username;
    const discordAvatar = interaction.user.avatar;

    // Check if already linked
    if (await isAccountLinked(discordId)) {
      const stats = await getStatsByDiscordId(discordId);
      const displayName = stats?.displayName || stats?.username || 'Unknown';

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.SUCCESS)
        .setTitle('Already Linked')
        .setDescription(
          `Your Discord account is already linked to **${displayName}** on chkmate.\n\n` +
          `Use \`/stats\` to see your stats or \`/challenge\` to challenge someone.`
        )
        .setFooter({ text: 'chkmate.xyz' });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // Create a link token
    const linkToken = await createLinkToken(discordId, discordUsername, discordAvatar);
    const deepLink = buildDeepLink(`link/${linkToken.token}`);
    const webFallback = buildDeepLink(`link/${linkToken.token}`, true);

    // Create the embed
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.PRIMARY)
      .setTitle('Link Your chkmate Account')
      .setDescription(
        'Click the button below to link your Discord account to chkmate.\n\n' +
        'This will open the chkmate app where you can log in or create an account.'
      )
      .addFields({
        name: 'Token expires in',
        value: '5 minutes',
        inline: true,
      })
      .setFooter({ text: 'chkmate.xyz' });

    // Create buttons
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Open chkmate')
        .setStyle(ButtonStyle.Link)
        .setURL(deepLink)
        .setEmoji('♟️'),
      new ButtonBuilder()
        .setLabel('Use Web Link')
        .setStyle(ButtonStyle.Link)
        .setURL(webFallback)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true, // Only visible to the user
    });
  },
};
