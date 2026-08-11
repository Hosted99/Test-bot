/**
 * channelInstructions.js — Постоянни инструкции за belly-rush-roles и crew-approval каналите
 *
 * Работи по същия принцип като blacklist.js:
 * съобщението се праща ВЕДНЪЖ, ID-то му се пази в guild_config,
 * и всяко следващо извикване го EDIT-ва вместо да праща нов пост.
 *
 * !post-roles-info   — постоянни инструкции в belly_rush_roles_channel (само команди се допускат)
 * !post-crew-info    — постоянни инструкции в crew_approval_channel (управление на кораби + одобрения)
 *
 * Пускаш командата отново по всяко време, за да редактираш текста —
 * съобщението и датата му НЕ се променят, само съдържанието.
 */

const { EmbedBuilder } = require('discord.js');
const { getConfig, setConfig, getChannel } = require('./guildConfig');

// ─────────────────────────────────────────────
// Embed builders
// ─────────────────────────────────────────────

function buildRolesInstructionsEmbed(guild) {
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('🚢 Belly Rush Roles — Channel Rules')
        .setDescription('This channel is for **ship selection commands only**. Anything       TEST           that is not a command gets deleted automatically.')
        .addFields(
            {
                name: '📋 Available Commands',
                value: '`!want <ship-name>` — Request a **permanent** spot on a ship (needs Mod approval)\n`!ship-list` — View all ships, member counts & captains',
                inline: false
            },
            {
                name: '⚠️ Rules',
                value: 'Only messages starting with `!` are allowed here. Everything else — chat, images, reactions-as-text — is deleted on sight.',
                inline: false
            }
        )
        .setFooter({ text: `${guild.name} • Belly Rush` })
        .setTimestamp();

    const guildIcon = guild.iconURL ? guild.iconURL({ size: 128 }) : null;
    if (guildIcon) embed.setThumbnail(guildIcon);

    return embed;
}

function buildCrewInstructionsEmbed(guild) {
    const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('⚓ Crew Approval & Ship Management — Mod Guide')
        .setDescription('This is where Mods/Admins manage the fleet and approve permanent crew requests.')
        .addFields(
            {
                name: '🛠️ Ship Management',
                value: '`!ship-add <name> <emoji> @role` — Add a new ship\n`!ship-remove <name>` — Remove a ship\n`!ship-list` — View all ships and their crews\n`!ship-captain @user <ship>` — Assign a permanent captain\n`!ship-uncaptain @user` — Remove a captain',
                inline: false
            },
            {
                name: '⚓ Permanent Crew',
                value: '`!ship-addpermanent @user <ship>` — Add directly, skips approval\n`!ship-removepermanent @user` — Remove from permanent crew\n`!ship-listpermanent` — List all permanent crew members',
                inline: false
            },
            {
                name: '✅ Approval Flow',
                value: 'When a player uses `!want <ship-name>` in the roles channel, a request card with **✅ Approve** / **❌ Deny** buttons shows up here. Click one to resolve it — the player gets a DM with the result.',
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

async function refreshRolesInstructions(guild) {
    const channel = await getChannel(guild, 'belly_rush_roles_channel');
    if (!channel) return null; // Каналът не е конфигуриран

    const embed = buildRolesInstructionsEmbed(guild);
    const existingMessageId = await getConfig(guild.id, 'roles_instructions_message_id');

    if (existingMessageId) {
        try {
            const existingMessage = await channel.messages.fetch(existingMessageId);
            await existingMessage.edit({ embeds: [embed] });
            return existingMessage;
        } catch (err) {
            console.log(`⚠️ Roles instructions message not found, posting a new one in ${guild.name}: ${err.message}`);
        }
    }

    const newMessage = await channel.send({ embeds: [embed] });
    await setConfig(guild.id, 'roles_instructions_message_id', newMessage.id, guild.name);
    return newMessage;
}

async function refreshCrewInstructions(guild) {
    const channel = await getChannel(guild, 'crew_approval_channel') || await getChannel(guild, 'admin_log_channel');
    if (!channel) return null; // Нито crew_approval_channel, нито admin_log_channel е конфигуриран

    const embed = buildCrewInstructionsEmbed(guild);
    const existingMessageId = await getConfig(guild.id, 'crew_instructions_message_id');

    if (existingMessageId) {
        try {
            const existingMessage = await channel.messages.fetch(existingMessageId);
            await existingMessage.edit({ embeds: [embed] });
            return existingMessage;
        } catch (err) {
            console.log(`⚠️ Crew instructions message not found, posting a new one in ${guild.name}: ${err.message}`);
        }
    }

    const newMessage = await channel.send({ embeds: [embed] });
    await setConfig(guild.id, 'crew_instructions_message_id', newMessage.id, guild.name);
    return newMessage;
}

module.exports = {
    buildRolesInstructionsEmbed,
    buildCrewInstructionsEmbed,
    refreshRolesInstructions,
    refreshCrewInstructions,
};
