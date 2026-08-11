/**
 * shiplessList.js — Списък с членове БЕЗ кораб
 *
 * Работи по същия принцип като channelInstructions.js / blacklist.js:
 * съобщението се праща ВЕДНЪЖ, ID-то му се пази в guild_config,
 * и всяко следващо обновяване го EDIT-ва вместо да праща нов пост.
 *
 * !post-shipless-list  — първо пускане (Admin), после само се обновява автоматично
 *
 * Автоматично обновяване: когато член на сървъра получи ИЛИ загуби ship роля
 * (бутон, !ship-captain, !ship-addpermanent, ръчно от админ — няма значение),
 * main.js слуша 'guildMemberUpdate' и вика refreshShiplessList() веднага.
 */

const { EmbedBuilder } = require('discord.js');
const { getConfig, setConfig, getChannel } = require('./guildConfig');
const { getShips } = require('./ship');

// ─────────────────────────────────────────────
// Взима всички ship role_id-та + всички членове без нито един от тях
// ─────────────────────────────────────────────

async function getShiplessMembers(guild) {
    const ships = await getShips(guild.id);
    const shipRoleIds = ships.map(s => s.role_id).filter(Boolean);

    const members = await guild.members.fetch();
    const shipless = members.filter(member =>
        !member.user.bot &&
        !shipRoleIds.some(roleId => member.roles.cache.has(roleId))
    );

    return [...shipless.values()];
}

// ─────────────────────────────────────────────
// Embed builder
// ─────────────────────────────────────────────

function buildShiplessEmbed(guild, shiplessMembers) {
    const embed = new EmbedBuilder()
        .setColor(shiplessMembers.length > 0 ? '#e74c3c' : '#2ecc71')
        .setTitle('⚓ Members Without a Ship')
        .setFooter({ text: `${guild.name} • Belly Rush` })
        .setTimestamp();

    if (shiplessMembers.length === 0) {
        embed.setDescription('✅ Everyone has a ship! Nothing to see here.');
        return embed;
    }

    const intro = `**${shiplessMembers.length}** member(s) have not joined a ship yet.\nThis list updates automatically when someone gets or loses a ship role.\n\n`;
    let names = shiplessMembers.map(m => `• ${m}`).join('\n');

    // Description лимит е 4096 символа — ако сме близо до него, отрязваме и показваме бройката останали
    const maxNamesLength = 4096 - intro.length - 50;
    if (names.length > maxNamesLength) {
        const truncated = names.slice(0, maxNamesLength);
        const lastNewline = truncated.lastIndexOf('\n');
        const shownCount = truncated.slice(0, lastNewline).split('\n').length;
        names = truncated.slice(0, lastNewline) + `\n… and ${shiplessMembers.length - shownCount} more`;
    }

    embed.setDescription(intro + names);

    return embed;
}

// ─────────────────────────────────────────────
// Post веднъж / Edit при всяко следващо обновяване
// ─────────────────────────────────────────────

async function refreshShiplessList(guild) {
    const channel = await getChannel(guild, 'shipless_list_channel');
    if (!channel) return null; // Каналът не е конфигуриран

    const shiplessMembers = await getShiplessMembers(guild);
    const embed = buildShiplessEmbed(guild, shiplessMembers);
    const existingMessageId = await getConfig(guild.id, 'shipless_list_message_id');

    if (existingMessageId) {
        try {
            const existingMessage = await channel.messages.fetch(existingMessageId);
            await existingMessage.edit({ embeds: [embed] });
            return existingMessage;
        } catch (err) {
            console.log(`⚠️ Shipless list message not found, posting a new one in ${guild.name}: ${err.message}`);
        }
    }

    const newMessage = await channel.send({ embeds: [embed] });
    await setConfig(guild.id, 'shipless_list_message_id', newMessage.id, guild.name);
    return newMessage;
}

module.exports = {
    getShiplessMembers,
    buildShiplessEmbed,
    refreshShiplessList,
};
