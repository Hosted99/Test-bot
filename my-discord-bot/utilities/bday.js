const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const { getChannel } = require('./guildConfig'); // ✅ МУЛТИ-СЪРВЪР

// ✅ Изнесена логика, за да може да се вика и ръчно (!sendbday), не само от cron-а
// Extracted so it can also be triggered manually (!sendbday), not just from the cron job
async function sendBirthdayMessage(guild) {
    const channel = await getChannel(guild, 'bday_channel');
    const friendId = await require('./guildConfig').getConfig(guild.id, 'bday_user');

    if (!channel || !friendId) return false;

    // Try to fetch the member object to grab their avatar and name
    let targetMember;
    try {
        targetMember = await guild.members.fetch(friendId);
    } catch (e) {
        targetMember = null;
    }

    const avatarURL = targetMember ? targetMember.user.displayAvatarURL({ dynamic: true, size: 512 }) : guild.iconURL();

    const bdayEmbed = new EmbedBuilder()
        .setColor('#FF3366') // Bright, festive pink/red accent
        .setAuthor({ name: '🎂 SPECIAL BIRTHDAY', iconURL: guild.iconURL() })
        .setTitle('✨ Cheers to Our Birthday Star! ✨')
        .setDescription(`Hey <@${friendId}>, the team and the entire community wish you an incredible celebration! We hope your day is filled with smiles, great energy, and unforgettable moments. 🥂`)
        .addFields(
            { name: '🎯 The Year Ahead', value: 'May this year bring you new achievements, bold adventures, and the realization of all your biggest dreams!', inline: false },
            { name: '🎁 Party Time', value: 'Raise your glasses and time to celebrate! Party hard today! 🍻🎉', inline: false }
        )
        .setThumbnail(avatarURL) // Displays the birthday person's avatar in the top right corner
        .setImage('https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTVpbHliempjZWdmN3YzNDdvODFicWI0MG1vMWw4c2VpMmg3YThzdyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/YuKRFGvBhcSLVFO6Oh/giphy.gif')
        .setFooter({ text: `Celebrating in ${guild.name} • Cheers!`, iconURL: guild.iconURL() })
        .setTimestamp();

    const msg = await channel.send({ 
        content: `🎉 **ATTENTION! WE HAVE A BIRTHDAY TODAY!** 🎉\nEveryone send your best wishes to <@${friendId}>! 🎈`, 
        embeds: [bdayEmbed] 
    });

    // Automatically add reaction emojis to the message for community interaction
    try {
        await msg.react('🎂');
        await msg.react('🥳');
        await msg.react('🍻');
    } catch (err) {
        // Ignored if the bot lacks permission to add reactions
    }
    
    console.log(`✅ Birthday message sent in ${guild.name}`);
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
