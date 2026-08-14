/**
 * categoryUnlock.js — Постоянни инструкции за отключване на Belly Rush категорията
 *
 * Работи по същия принцип като channelInstructions.js / blacklist.js:
 * съобщението се праща ВЕДНЪЖ, ID-то му се пази в guild_config,
 * и всяко следващо извикване го EDIT-ва вместо да праща нов пост.
 *
 * !post-unlock-info — постоянни инструкции в belly_rush_unlock_channel
 */

const { EmbedBuilder } = require('discord.js');
const { getConfig, setConfig, getChannel } = require('./guildConfig');

// ─────────────────────────────────────────────
// Embed builder
// ─────────────────────────────────────────────

function buildUnlockEmbed(guild) {
    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🔓 Belly Rush Category — How to Unlock')
        .setDescription('To get access to this category, follow these steps:')
        .addFields(
            {
                name: '📋 Steps',
                value: '1️⃣ Post here whether you play **Belly Rush**\n2️⃣ Post whether you are allied with **Sunny**\n3️⃣ Wait for a review from an Administrator or Belly Rush Moderator\n4️⃣ Once approved, the category will be unlocked for you manually',
                inline: false
            },
            {
                name: '⚠️ Please Note',
                value: 'Reviews are done manually — please be patient and avoid spamming messages.',
                inline: false
            }
        )
        .setFooter({ text: `${guild.name} • Belly Rush` })
        .setTimestamp();

    const guildIcon = guild.iconURL ? guild.iconURL({ size: 128 }) : null;
    if (guildIcon) embed.setThumbnail(guildIcon);

    return embed;
}

// ─────────────────────────────────────────────
// Post веднъж / Edit при всяко следващо извикване
// ─────────────────────────────────────────────

async function refreshUnlockInstructions(guild) {
    const channel = await getChannel(guild, 'belly_rush_unlock_channel');
    if (!channel) return null; // Каналът не е конфигуриран

    const embed = buildUnlockEmbed(guild);
    const existingMessageId = await getConfig(guild.id, 'unlock_instructions_message_id');

    if (existingMessageId) {
        try {
            const existingMessage = await channel.messages.fetch(existingMessageId);
            await existingMessage.edit({ embeds: [embed] });
            return existingMessage;
        } catch (err) {
            console.log(`⚠️ Unlock instructions message not found, posting a new one in ${guild.name}: ${err.message}`);
        }
    }

    const newMessage = await channel.send({ embeds: [embed] });
    await setConfig(guild.id, 'unlock_instructions_message_id', newMessage.id, guild.name);
    return newMessage;
}

module.exports = {
    buildUnlockEmbed,
    refreshUnlockInstructions,
};
