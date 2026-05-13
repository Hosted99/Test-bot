// utilities/dmHandler.js

/**
 * Функция за масово изпращане на ЛС към списък от потребители
 * @param {Array} membersToNotify - Масив с GuildMember обекти
 * @param {string} planUrl - Линк към оригиналното съобщение на плана
 * @param {string} guildName - Името на гилдията (G1 или G2)
 */
async function sendEmergencyDMs(membersToNotify, planUrl, guildName) {
    let successCount = 0;
    let failCount = 0;

    // Влизаме в цикъла за всеки потребител
    for (const member of membersToNotify) {
        
        // ВАЖНО: Дефинираме съобщението ВЪТРЕ в цикъла, 
        // за да може да използва информацията за конкретния 'member'
        const messageBody = `🚨 **EMERGENCY REMINDER - ${guildName}**\n\n` +
        `You haven't voted in today's Mania Plan yet! Please do it now.\n Or **@Marika** will Spank you! 😈😈😈  \n\n` +
        `🔗 **Click here to vote:** ${planUrl}\n` +
        `👉 Or check the channel: <#${member.guild.channels.cache.find(c => c.name.includes('mania'))?.id || ''}>`;
      


        try {
            // Пропускаме, ако е бот
            if (member.user.bot) continue;

            // Изпращаме съобщението
            await member.send(messageBody);
            
            successCount++;
            console.log(`[DM-Sent] Successfully notified ${member.user.tag}`);
        } catch (err) {
            // Ако потребителят е със затворени ЛС
            failCount++;
            console.log(`[DM-Failed] Could not notify ${member.user.tag} (DMs closed)`);
        }

        // 1.2 секунди пауза за защита от спам филтрите на Discord
        await new Promise(resolve => setTimeout(resolve, 1200));
    }

    // Връщаме резултата към основния файл
    return { successCount, failCount };
}

module.exports = { sendEmergencyDMs };
