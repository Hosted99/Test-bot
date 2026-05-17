const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const { getChannel } = require('./guildConfig'); // ✅ МУЛТИ-СЪРВЪР

module.exports = (client) => {
    // Изпраща birthday съобщение всеки ден в 08:30
    // ✅ МУЛТИ-СЪРВЪР: изпраща до всеки сървър поотделно
    // Конфигурира се с: !setconfig bday_channel <id> и !setconfig bday_user <user_id>
    cron.schedule('30 08 * * *', async () => {
        client.guilds.cache.forEach(async (guild) => {
            try {
                // Взимаме канала и потребителя от конфига на ТОЗИ сървър
                const channel = await getChannel(guild, 'bday_channel');
                const friendId = await require('./guildConfig').getConfig(guild.id, 'bday_user');

                if (!channel || !friendId) return; // Ако не е конфигурирано — пропускаме

                const bdayEmbed = new EmbedBuilder()
                    .setColor('#00FFFF')
                    .setTitle('🎉 HAPPY BIRTHDAY! 🎉')
                    .setDescription(`Wishing <@${friendId}> an incredible day! 🎂`)
                    .setImage('https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTVpbHliempjZWdmN3YzNDdvODFicWI0MG1vMWw4c2VpMmg3YThzdyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/YuKRFGvBhcSLVFO6Oh/giphy.gif');

                await channel.send({ content: `📢 @everyone, birthday time! <@${friendId}> 🎈`, embeds: [bdayEmbed] });
                console.log(`✅ Birthday message sent in ${guild.name}`);
            } catch (err) {
                console.error(`Birthday error in ${guild.name}:`, err.message);
            }
        });
    }, { timezone: "Europe/Sofia" });

    console.log("✅ Birthday system active.");
};
