/**
 * Изпраща масови DM-и до незагласували членове
 * @param {Array} membersToNotify - Масив с GuildMember обекти
 * @param {string} planUrl - Линк към плана за гласуване
 * @param {string} guildName - Името на гилдията
 */
async function sendEmergencyDMs(membersToNotify, planUrl, guildName) {
    let successCount = 0;
    let failCount = 0;

    for (const member of membersToNotify) {
        // Пропускаме ботове
        if (member.user.bot) continue;

        const messageBody =
            `🚨 **EMERGENCY REMINDER - ${guildName}**\n\n` +
            `You haven't voted in today's Mania Plan yet! Please do it now.\n\n` +
            `🔗 **Click here to vote:** ${planUrl}`;

        try {
            await member.send(messageBody);
            successCount++;
            console.log(`[DM-Sent] Notified ${member.user.tag}`);
        } catch (err) {
            // Потребителят е затворил ЛС-ите
            failCount++;
            console.log(`[DM-Failed] Could not notify ${member.user.tag} (DMs closed)`);
        }

        // 1.2 секунди пауза за защита от Discord spam филтри
        await new Promise(resolve => setTimeout(resolve, 1200));
    }

    return { successCount, failCount };
}

module.exports = { sendEmergencyDMs };
