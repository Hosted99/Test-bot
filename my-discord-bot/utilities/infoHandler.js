const { EmbedBuilder } = require("discord.js");
const { getChannel } = require("./guildConfig");

/**
 * Изпраща пълното ръководство в bot_status_channel при стартиране
 */
const sendBotManual = async (guild) => {
    // ✅ MULTI-SERVER: manual goes to bot_info_channel / мануалът отива в bot_info_channel
    // if not configured — skip / ако не е зададен — пропускаме
    const infoChannel = await getChannel(guild, 'bot_info_channel');
    if (!infoChannel) return;

    await infoChannel.bulkDelete(100).catch(() => {});

    const manualEmbed = new EmbedBuilder()
        .setTitle("🏴‍☠️ Sailing Kingdom | Complete Bot Manual")
        .setDescription("Welcome aboard! Here is the complete guide to all systems and commands:")
        .setColor("#ff0044")
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .addFields(
            {
                name: "🌐 1. AI Translator (#ai-translator)",
                value: "• **Auto-Translate:** Write in any language → instantly translated to 🇺🇸 English.\n" +
                       "• **Reverse:** Reply to a translated message in English → translates back to the original language."
            },
            {
                name: "🛂 2. Nickname & Verification",
                value: "• New members start as **Rookies** with limited access.\n" +
                       "• Click the **'Nickname'** button in the welcome channel.\n" +
                       "• Include your guild tag (e.g. `TS Luffy` or `Thousand Sunny Luffy`).\n" +
                       "• Automatically grants **Player** role and unlocks the server! 🔓"
            },
            {
                name: "⚔️ 3. Mania Battle System",
                value: "• `mania-plan g1/g2/all` — Start recruitment with ✅ ❌ ⏳ reactions.\n" +
                       "• `mania-list g1/g2` — Live report of confirmed players + pings missing.\n" +
                       "• `mania-dm g1/g2` — DM everyone who hasn't voted yet.\n" +
                       "• `mania-strategy` — Post the battle plan and ping @everyone."
            },
            {
                name: "⚓ 4. Leveling & Pirate Ranks",
                value: "• Chat to earn XP. Images grant **Bonus XP**! 🖼️\n" +
                       "• 220+ unique ranks from **Silent Snail** 🐌 to **Grass Avoider** 🌱❌.\n" +
                       "• `!rank` — See your progress bar `[▇▇▇——]` and current title."
            },
            {
                name: "🚢 5. Belly Rush Registration",
                value: "• Use buttons to join your ship when the panel is posted.\n" +
                       "• `!want <ship-name>` — Request a **permanent** spot (never gets reset).\n" +
                       "• Ships are fully customizable by admins per server."
            },
            {
                name: "☠️ 6. Bounty & Wanted System",
                value: "• `!wanted [@user]` — View a pirate's Wanted Poster.\n" +
                       "• `!setbounty @user <amount>` — (Admin) Set a bounty.\n" +
                       "• `!resetbounty @user` — (Admin) Reset bounty to ฿0."
            },
            {
                name: "⚔️ 7. Hero Guides (#unit-build)",
                value: "• `!hero <name>` — Full build guide (Role, Seals, Haki, Equipment).\n" +
                       "• `!hero-list` — View all available heroes."
            },
            {
                name: "⏰ 8. Reminders & Events",
                value: "• **Auto-Pings** for Mania and Belly Rush.\n" +
                       "• `!remind <cron> <text>` — Create custom reminders.\n" +
                       "• `!reminders` — List your active reminders.\n" +
                       "• `!cron` — Cron format guide."
            },
            {
                name: "🎖️ 9. Role Management (Admin)",
                value: "• `!addrole @user <role>` — Assign a role.\n" +
                       "• `!removerole @user <role>` — Remove a role.\n" +
                       "• `!addroleallts @role` — Sync roles for everyone with **ᐪˢ☠️**.\n" +
                       "• `!addroleallgm @role` — Sync roles for everyone with **ᴳᴹ☠️**."
            },
            {
                name: "🛡️ 10. Admin Control",
                value: "• `!top` — Top 10 most active pirates.\n" +
                       "• `!sync` — Manually save all XP data to the database.\n" +
                       "• `!clear <1-100>` — Bulk delete messages.\n" +
                       "• `!say <text>` / `!sendto #channel <text>` — Send messages as the bot.\n" +
                       "• `!setconfig <key> <value>` — Configure the bot for this server.\n" +
                       "• `!getconfig` — View current server configuration."
            },
            {
                name: "🚢 11. Ship Management (Admin)",
                value: "• `!ship-add <name> <emoji> <@role>` — Add a new ship.\n" +
                       "• `!ship-remove <name>` — Remove a ship.\n" +
                       "• `!ship-list` — View all ships and their crews.\n" +
                       "• `!ship-captain @user <ship>` — Set a permanent captain.\n" +
                       "• `!ship-uncaptain @user` — Remove captain status."
            },
            {
                name: "⚔️ 12. Mania Guild Management (Admin)",
                value: "• `!mania-addguild <key> @role #channel` — Add a guild (e.g. g3).\n" +
                       "• `!mania-removeguild <key>` — Remove a guild.\n" +
                       "• `!mania-guilds` — List all configured guilds."
            }
        )
        .setFooter({ text: "Sailing Kingdom Engine • Automatically updated on startup" })
        .setTimestamp();

    await infoChannel.send({ embeds: [manualEmbed] });
};

/**
 * Изпраща съобщение за офлайн при спиране
 */
const sendFarewell = async (client) => {
    for (const [, guild] of client.guilds.cache) {
        const botChannel = await getChannel(guild, 'bot_status_channel');
        if (botChannel) {
            const farewellEmbed = new EmbedBuilder()
                .setTitle("📡 System Status: Offline")
                .setDescription("🌅 **Farewell, pirates! I'm heading to port for maintenance. I will be back soon!**")
                .setColor("#ff4444")
                .setTimestamp();
            await botChannel.send({ embeds: [farewellEmbed] }).catch(() => {});
        }
    }
};

module.exports = { sendBotManual, sendFarewell };
