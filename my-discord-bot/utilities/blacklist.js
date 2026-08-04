/**
 * blacklist.js — Belly Rush Blacklist система
 *
 * Работи с ОБИКНОВЕНИ ИМЕНА (текст), не с Discord потребители/ID —
 * защото blacklist-натите хора не са задължително членове на сървъра.
 *
 * !black-list                          — показва списъка (всеки може)
 * !blacklist-add <име> <причина>       — добавя (само Admin)
 *   пример: !blacklist-add Luffy123 duplicate account
 *   с интервали в името: !blacklist-add "Red Hair Shanks" scammer
 * !blacklist-remove <име>              — маха (само Admin)
 *
 * Ако е зададен `blacklist_channel` (!setconfig blacklist_channel #канал),
 * ботът пази ID-то на embed съобщението и го edit-ва при всяка промяна,
 * вместо да спамва нов пост всеки път.
 */

const { EmbedBuilder } = require('discord.js');
const { pool } = require('./db');
const { getConfig, setConfig, getChannel } = require('./guildConfig');

// ─────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────

async function addToBlacklist(guildId, name, reason, addedBy) {
    await pool.query(
        `INSERT INTO blacklist (guild_id, name, reason, added_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, name)
         DO UPDATE SET reason = $3, added_by = $4, added_at = NOW()`,
        [guildId, name, reason || 'No reason provided', addedBy]
    );
}

async function removeFromBlacklist(guildId, name) {
    // Case-insensitive match, за да не се налага точно същия регистър
    const result = await pool.query(
        `DELETE FROM blacklist WHERE guild_id = $1 AND LOWER(name) = LOWER($2)`,
        [guildId, name]
    );
    return result.rowCount > 0; // true ако наистина е бил в списъка
}

async function getBlacklist(guildId) {
    const result = await pool.query(
        `SELECT name, reason, added_by, added_at FROM blacklist
         WHERE guild_id = $1 ORDER BY added_at DESC`,
        [guildId]
    );
    return result.rows;
}

// ─────────────────────────────────────────────
// Embed builder
// ─────────────────────────────────────────────

function buildBlacklistEmbed(guild, rows) {
    const embed = new EmbedBuilder()
        .setColor('#E24B4A')
        .setTitle('🏴\u200d☠️ Belly Rush Blacklist')
        .setDescription('Players below are banned from joining Belly Rush events.')
        .setFooter({ text: `${guild.name} • ${rows.length} blacklisted` })
        .setTimestamp();

    const guildIcon = guild.iconURL ? guild.iconURL({ size: 128 }) : null;
    if (guildIcon) embed.setThumbnail(guildIcon);

    if (rows.length === 0) {
        embed.setDescription('✅ No one is currently blacklisted.');
        return embed;
    }

    // Discord позволява до 25 fields в едно embed — режем ако стане повече
    const visibleRows = rows.slice(0, 25);

    for (const r of visibleRows) {
        const addedDate = r.added_at ? new Date(r.added_at).toLocaleDateString('en-GB') : 'unknown';
        embed.addFields({
            name: `☠️ ${r.name}`,
            value: `**Reason:** ${r.reason}\n*Added by <@${r.added_by}> • ${addedDate}*`,
            inline: false,
        });
    }

    if (rows.length > 25) {
        embed.addFields({ name: '\u200b', value: `*...and ${rows.length - 25} more.*` });
    }

    return embed;
}

// ─────────────────────────────────────────────
// Постване / обновяване на постоянното embed съобщение
// ─────────────────────────────────────────────

async function refreshBlacklistMessage(guild) {
    const channel = await getChannel(guild, 'blacklist_channel');
    if (!channel) return null; // Не е конфигуриран канал — просто пропускаме

    const rows = await getBlacklist(guild.id);
    const embed = buildBlacklistEmbed(guild, rows);

    const existingMessageId = await getConfig(guild.id, 'blacklist_message_id');

    if (existingMessageId) {
        try {
            const existingMessage = await channel.messages.fetch(existingMessageId);
            await existingMessage.edit({ embeds: [embed] });
            return existingMessage;
        } catch (err) {
            // Съобщението вероятно е изтрито ръчно — постваме ново
            console.log(`⚠️ Blacklist message not found, posting a new one in ${guild.name}: ${err.message}`);
        }
    }

    const newMessage = await channel.send({ embeds: [embed] });
    await setConfig(guild.id, 'blacklist_message_id', newMessage.id, guild.name);
    return newMessage;
}

// ─────────────────────────────────────────────
// Helper: парсва "<име> <причина>" от суровия текст на командата,
// поддържайки име в кавички ако съдържа интервали.
// пример: !blacklist-add "Red Hair Shanks" scammer, ban evader
// пример: !blacklist-add Luffy123 duplicate account
// ─────────────────────────────────────────────
function parseNameAndReason(rawArgsText) {
    const text = rawArgsText.trim();
    if (!text) return { name: null, reason: null };

    if (text.startsWith('"')) {
        const closingQuoteIndex = text.indexOf('"', 1);
        if (closingQuoteIndex !== -1) {
            const name = text.slice(1, closingQuoteIndex).trim();
            const reason = text.slice(closingQuoteIndex + 1).trim() || null;
            return { name, reason };
        }
    }

    // Без кавички: първата дума е името, останалото е причината
    const firstSpaceIndex = text.indexOf(' ');
    if (firstSpaceIndex === -1) return { name: text, reason: null };
    return {
        name: text.slice(0, firstSpaceIndex).trim(),
        reason: text.slice(firstSpaceIndex + 1).trim() || null,
    };
}

module.exports = {
    addToBlacklist,
    removeFromBlacklist,
    getBlacklist,
    buildBlacklistEmbed,
    refreshBlacklistMessage,
    parseNameAndReason,
};
