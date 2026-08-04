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
        .setFooter({ text: `${guild.name} • ${rows.length} blacklisted` });

    const guildIcon = guild.iconURL ? guild.iconURL({ size: 128 }) : null;
    if (guildIcon) embed.setThumbnail(guildIcon);

    if (rows.length === 0) {
        embed.setDescription('✅ No one is currently blacklisted.');
        return embed;
    }

    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    // Red names need an ANSI code block; rendered as a 3-column "roster board"
    // with gold header/footer bars. Everything lives in the description so it
    // scales past Discord's 25-field-per-embed cap.
    const COLS = 3, W = 15, BW = COLS * W;
    const center = (txt, w, ch) => {
        const pad = Math.max(0, w - txt.length), l = Math.floor(pad / 2);
        return ch.repeat(l) + txt + ch.repeat(pad - l);
    };
    const GOLD = '\x1b[1;33m', RED = '\x1b[1;31m', OFF = '\x1b[0m';

    let grid = '```ansi\n';
    grid += GOLD + center(' \u2620 ROSTER \u2620 ', BW, '═') + OFF + '\n';
    for (let i = 0; i < sorted.length; i += COLS) {
        let row = '';
        for (let c = 0; c < COLS && i + c < sorted.length; c++) {
            row += RED + sorted[i + c].name.padEnd(W) + OFF;
        }
        grid += row + '\n';
    }
    grid += GOLD + center(` ${sorted.length} listed `, BW, '═') + OFF + '\n```';

    const flagged = sorted.filter(r => r.reason && r.reason !== 'No reason provided');
    let reasons = '';
    if (flagged.length) {
        reasons = '\n⚠️ **Rap sheet**\n' +
            flagged.map(r => `\`•\` **${r.name}** — ${r.reason}`).join('\n');
    }

    let desc = `*Banned from all Belly Rush & Alliance events.*\n${grid}`;
    if (reasons && (desc + reasons).length <= 4096) desc += reasons;

    embed.setDescription(desc);
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
