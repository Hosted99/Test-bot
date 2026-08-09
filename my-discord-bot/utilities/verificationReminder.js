/**
 * verificationReminder.js — Напомня на нови членове да си сложат nickname
 *
 * 1. При влизане: записваме реда в pending_verification + пращаме DM веднага.
 * 2. Всеки час cron проверява кой чака повече от 10ч. и още няма nickname → праща напомнящо DM.
 * 3. При успешна верификация (nick_modal) редът се трие — спира напомнянията.
 */

const { pool } = require('./db');

// 🧪 ЗА ТЕСТ: 3 минути вместо 10 часа. Върни на 600 (10*60) след теста!
const REMINDER_AFTER_MINUTES = 3; // production стойност: 600 (= 10 часа)

async function addPendingVerification(guildId, userId) {
    await pool.query(
        `INSERT INTO pending_verification (guild_id, user_id, joined_at, reminder_sent)
         VALUES ($1, $2, NOW(), false)
         ON CONFLICT (guild_id, user_id)
         DO UPDATE SET joined_at = NOW(), reminder_sent = false`,
        [guildId, userId]
    );
}

async function removePendingVerification(guildId, userId) {
    await pool.query(
        `DELETE FROM pending_verification WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
    );
}

async function getDueReminders() {
    const result = await pool.query(
        `SELECT guild_id, user_id FROM pending_verification
         WHERE reminder_sent = false
         AND joined_at <= NOW() - INTERVAL '${REMINDER_AFTER_MINUTES} minutes'`
    );
    return result.rows;
}

async function markReminderSent(guildId, userId) {
    await pool.query(
        `UPDATE pending_verification SET reminder_sent = true WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
    );
}

// ✅ Началното DM веднага при влизане
async function sendInitialDM(member) {
    try {
        await member.send(
            `👋 Ahoy, welcome to **${member.guild.name}**!\n\n` +
            `To unlock the full server, head back to the welcome channel and press the **Nickname** button under the welcome message. 🏴‍☠️`
        );
    } catch (err) {
        console.log(`[VerificationReminder] Could not DM ${member.user.tag} (DMs closed?): ${err.message}`);
    }
}

// ✅ Проверява всички чакащи и праща напомняне на тези, чакащи над 10ч.
async function checkAndSendReminders(client) {
    const dueRows = await getDueReminders();
    for (const row of dueRows) {
        try {
            const guild = await client.guilds.fetch(row.guild_id).catch(() => null);
            if (!guild) { await markReminderSent(row.guild_id, row.user_id); continue; }

            const member = await guild.members.fetch(row.user_id).catch(() => null);
            if (!member) {
                // Напуснал е сървъра — вече не е релевантно
                await removePendingVerification(row.guild_id, row.user_id);
                continue;
            }

            await member.send(
                `⏰ Ahoy again! I see you still haven't set your **nickname** yet.\n\n` +
                `If you'd like to unlock the full potential of **${guild.name}**, please press the **Nickname** button under the welcome message in the welcome channel. 🏴‍☠️`
            ).catch(err => console.log(`[VerificationReminder] Could not DM ${member.user.tag}: ${err.message}`));

            await markReminderSent(row.guild_id, row.user_id);
        } catch (err) {
            console.error(`[VerificationReminder] Error processing reminder for ${row.user_id}:`, err.message);
            await markReminderSent(row.guild_id, row.user_id).catch(() => {}); // избягваме безкраен retry loop
        }
    }
}

module.exports = {
    addPendingVerification,
    removePendingVerification,
    sendInitialDM,
    checkAndSendReminders,
};
