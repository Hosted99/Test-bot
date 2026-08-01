const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const { getChannel } = require('./guildConfig'); // ✅ МУЛТИ-СЪРВЪР

// ✅ Изнесена логика, за да може да се вика и ръчно (!sendbday), не само от cron-а
// Extracted so it can also be triggered manually (!sendbday), not just from the cron job
async function sendBirthdayMessage(guild) {
    const channel = await getChannel(guild, 'bday_channel');
    const friendId = await require('./guildConfig').getConfig(guild.id, 'bday_user');

    if (!channel || !friendId) return false; // If not configured — skip / Ако не е конфигурирано — пропускаме

    const bdayEmbed = new EmbedBuilder()
        .setColor('#00FFFF')
        .setTitle('🎉 HAPPY BIRTHDAY! 🎉')
        .setDescription(`Wishing <@${friendId}> an incredible day! 🎂`)
        .setImage('https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTVpbHliempjZWdmN3YzNDdvODFicWI0MG1vMWw4c2VpMmg3YThzdyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/YuKRFGvBhcSLVFO6Oh/giphy.gif');

    await channel.send({ content: `📢 @everyone, birthday time! <@${friendId}> 🎈`, embeds: [bdayEmbed] });
    console.log(`✅ Birthday message sent in ${guild.name} / Изпратено birthday в ${guild.name}`);
    return true;
}

module.exports = (client) => {
    // Send birthday message every day at 08:30 / Изпраща birthday съобщение в 08:30
    // ✅ MULTI-SERVER: sends to each server separately / изпраща до всеки сървър
    // Configure with: !setconfig bday_channel <id> and !setconfig bday_user <user_id>
    cron.schedule('30 08 * * *', async () => {
        client.guilds.cache.forEach(async (guild) => {
            try {
                await sendBirthdayMessage(guild);
            } catch (err) {
                console.error(`Birthday error in ${guild.name}:`, err.message);
            }
        });
    }, { timezone: "Europe/Sofia" });

    console.log("✅ Birthday system active.");
};

module.exports.sendBirthdayMessage = sendBirthdayMessage;
