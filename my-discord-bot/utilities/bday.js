const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');

module.exports = (client) => {
    // ТЕСТ: Нагласено за 02:20 (след 4 минути)
    cron.schedule('30 08 * * *', async () => {
        const CHANNEL_ID = '1486343047632523398';
        const FRIEND_ID = '1366783021193367633';

        try {
            const channel = await client.channels.fetch(CHANNEL_ID);
            const bdayEmbed = new EmbedBuilder()
                .setColor('#00FFFF')
                .setTitle('🎉 HAPPY BIRTHDAY! 🎉')
                .setDescription(`Wishing <@${FRIEND_ID}> an incredible day! 🎂`)
                .setImage('https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTVpbHliempjZWdmN3YzNDdvODFicWI0MG1vMWw4c2VpMmg3YThzdyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/YuKRFGvBhcSLVFO6Oh/giphy.gif');

            await channel.send({ content: `📢 @everyone, birthday time! <@${FRIEND_ID}> 🎈`, embeds: [bdayEmbed] });
            console.log("🚀 TEST SUCCESSFUL: Message sent.");
        } catch (err) {
            console.error("Cron Error:", err);
        }
    }, {
        timezone: "Europe/Sofia"
    });

    console.log("✅ Birthday system active. Waiting for 02:20...");
};
