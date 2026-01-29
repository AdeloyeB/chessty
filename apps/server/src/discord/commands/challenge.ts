/**
 * /challenge Command
 *
 * Creates a challenge to another Discord user.
 * The opponent receives a DM with a deep link to accept.
 * Wager amount is set IN-APP (not in Discord) for ToS compliance.
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
import {
  createChallenge,
  isAccountLinked,
  setChallengeMessageId,
  getStatsByDiscordId,
} from '../../services/discord';
import { buildDeepLink, EMBED_COLORS } from '../config';

export const challengeCommand: DiscordCommand = {
  data: new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Challenge another player to a chess match')
    .addUserOption((option) =>
      option
        .setName('opponent')
        .setDescription('The player you want to challenge')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const challenger = interaction.user;
    const opponent = interaction.options.getUser('opponent', true);

    // Can't challenge yourself
    if (challenger.id === opponent.id) {
      await interaction.reply({
        content: 'You cannot challenge yourself.',
        ephemeral: true,
      });
      return;
    }

    // Can't challenge bots
    if (opponent.bot) {
      await interaction.reply({
        content: 'You cannot challenge bots.',
        ephemeral: true,
      });
      return;
    }

    // Challenger must be linked
    if (!(await isAccountLinked(challenger.id))) {
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.WARNING)
        .setTitle('Account Not Linked')
        .setDescription(
          'You need to link your Discord account to chkmate before creating challenges.\n\n' +
          'Use `/link` to connect your account.'
        )
        .setFooter({ text: 'chkmate.xyz' });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // Check if opponent is linked (warn but allow)
    const opponentLinked = await isAccountLinked(opponent.id);

    // Create the challenge
    const result = await createChallenge(
      challenger.id,
      opponent.id,
      interaction.guildId || '',
      interaction.channelId
    );

    if (result.error) {
      let errorMessage = 'Failed to create challenge.';
      if (result.error === 'CHALLENGE_ALREADY_EXISTS') {
        errorMessage = `You already have a pending challenge to <@${opponent.id}>.`;
      }
      await interaction.reply({ content: errorMessage, ephemeral: true });
      return;
    }

    const challenge = result.challenge;
    const deepLink = buildDeepLink(`challenge/${challenge.id}`);
    const webFallback = buildDeepLink(`challenge/${challenge.id}`, true);

    // Get challenger stats for the embed
    const challengerStats = await getStatsByDiscordId(challenger.id);
    const challengerElo = challengerStats?.eloRating || 1200;

    // Build the challenge embed
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLORS.PRIMARY)
      .setTitle('♟️ Chess Challenge')
      .setDescription(
        `<@${challenger.id}> has challenged <@${opponent.id}> to a chess match!`
      )
      .addFields(
        {
          name: 'Challenger',
          value: `<@${challenger.id}> (${challengerElo} ELO)`,
          inline: true,
        },
        {
          name: 'Opponent',
          value: `<@${opponent.id}>`,
          inline: true,
        },
        {
          name: 'Expires',
          value: '<t:' + Math.floor(challenge.expiresAt.getTime() / 1000) + ':R>',
          inline: true,
        }
      )
      .setFooter({ text: 'Wager and time control are set in the app' });

    // Add warning if opponent isn't linked
    if (!opponentLinked) {
      embed.addFields({
        name: '⚠️ Note',
        value: `<@${opponent.id}> hasn't linked their Discord account yet. They'll need to use \`/link\` first.`,
      });
    }

    // Create accept/decline buttons
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Accept Challenge')
        .setStyle(ButtonStyle.Link)
        .setURL(deepLink)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setLabel('Use Web')
        .setStyle(ButtonStyle.Link)
        .setURL(webFallback)
    );

    // Send the challenge
    const reply = await interaction.reply({
      content: `<@${opponent.id}>`,
      embeds: [embed],
      components: [row],
      fetchReply: true,
    });

    // Store the message ID so we can edit it later
    await setChallengeMessageId(challenge.id, reply.id);

    // Try to DM the opponent
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(EMBED_COLORS.PRIMARY)
        .setTitle('♟️ You\'ve Been Challenged!')
        .setDescription(
          `**${challenger.username}** (${challengerElo} ELO) has challenged you to a chess match on chkmate.\n\n` +
          'Click below to accept and set your wager in the app.'
        )
        .setFooter({ text: 'chkmate.xyz' });

      const dmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Accept Challenge')
          .setStyle(ButtonStyle.Link)
          .setURL(deepLink)
          .setEmoji('✅')
      );

      await opponent.send({ embeds: [dmEmbed], components: [dmRow] });
    } catch {
      // Opponent has DMs disabled, that's fine - they can see it in the channel
    }
  },
};
