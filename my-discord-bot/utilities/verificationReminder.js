/**
 * verificationReminder.js — Напомня на нови членове да си сложат nickname
 *
 * 1. При влизане: записваме реда в pending_verification (вкл. линк към welcome съобщението) + пращаме DM веднага.
 * 2. Cron проверява на всеки X минути/часа и праща напомняне ПОВТОРНО, докато човекът не верифицира.
 * 3. При успешна верификация (nick_modal) редът се трие — спира напомнянията завинаги.
 */

const { pool } = require('./db');

// 🧪 ЗА ТЕСТ: 3 минути 
const REMINDER_INTERVAL_MINUTES = 600; // production стойност: 600 (= 10 часа)

// Изгражда директен jump link към конкретно Discord съобщение
function buildMessageLink(guildId, channelId, messageId) {
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

async function addPendingVerification(guildId, userId, channelId, messageId) {
    await pool.query(
        `INSERT INTO pending_verification (guild_id, user_id, channel_id, message_id, joined_at, last_reminder_at)
         VALUES ($1, $2, $3, $4, NOW(), NULL)
         ON CONFLICT (guild_id, user_id)
         DO UPDATE SET channel_id = $3, message_id = $4, joined_at = NOW(), last_reminder_at = NULL`,
        [guildId, userId, channelId, messageId]
    );
}

async function removePendingVerification(guildId, userId) {
    await pool.query(
        `DELETE FROM pending_verification WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
    );
}

// ✅ Взима редовете, за които е време за (следващо) напомняне:
// - или никога не е пращано напомняне и joined_at е минал прага
// - или последното напомняне е било преди повече от прага
async function getDueReminders() {
    const result = await pool.query(
        `SELECT guild_id, user_id, channel_id, message_id FROM pending_verification
         WHERE
           (last_reminder_at IS NULL AND joined_at <= NOW() - INTERVAL '${REMINDER_INTERVAL_MINUTES} minutes')
           OR
           (last_reminder_at IS NOT NULL AND last_reminder_at <= NOW() - INTERVAL '${REMINDER_INTERVAL_MINUTES} minutes')`
    );
    return result.rows;
}

async function updateLastReminder(guildId, userId) {
    await pool.query(
        `UPDATE pending_verification SET last_reminder_at = NOW() WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
    );
}

// ✅ Началното DM веднага при влизане — с директен линк към неговото welcome съобщение
async function sendInitialDM(member, channelId, messageId) {
    try {
        const link = buildMessageLink(member.guild.id, channelId, messageId);
        await member.send(
            `👋 Ahoy, welcome to **${member.guild.name}**!\n\n` +
            `To unlock the full server, head to your welcome message and press the **Nickname** button:\n${link} 🏴‍☠️`
        );
    } catch (err) {
        console.log(`[VerificationReminder] Could not DM ${member.user.tag} (DMs closed?): ${err.message}`);
    }
}

// ✅ Проверява всички чакащи и праща (повтарящо се) напомняне на дължимите
async function checkAndSendReminders(client) {
    const dueRows = await getDueReminders();
    for (const row of dueRows) {
        try {
            const guild = await client.guilds.fetch(row.guild_id).catch(() => null);
            if (!guild) { await removePendingVerification(row.guild_id, row.user_id); continue; }

            const member = await guild.members.fetch(row.user_id).catch(() => null);
            if (!member) {
                // Напуснал е сървъра — вече не е релевантно
                await removePendingVerification(row.guild_id, row.user_id);
                continue;
            }

            const link = buildMessageLink(row.guild_id, row.channel_id, row.message_id);
            await member.send(
                `⏰ Ahoy again! I see you still haven't set your **nickname** yet.\n\n` +
                `If you'd like to unlock the full potential of **${guild.name}**, please press the **Nickname** button here:\n${link} 🏴‍☠️`
            ).catch(err => console.log(`[VerificationReminder] Could not DM ${member.user.tag}: ${err.message}`));

            // ✅ Само обновяваме timestamp-а — НЕ спираме напомнянията, ще се повтори пак след интервала
            await updateLastReminder(row.guild_id, row.user_id);
        } catch (err) {
            console.error(`[VerificationReminder] Error processing reminder for ${row.user_id}:`, err.message);
            await updateLastReminder(row.guild_id, row.user_id).catch(() => {}); // избягваме tight retry loop при грешка
        }
    }
}

module.exports = {
    addPendingVerification,
    removePendingVerification,
    sendInitialDM,
    checkAndSendReminders,
};
