const { EmbedBuilder } = require("discord.js");
const { getChannel } = require("./guildConfig");

/**
 * Send the full bot manual to bot_info_channel on startup
 * Изпраща мануала в bot_info_channel при стартиране
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
                name: "🌐 1. AI Translator",
                value: "• **Auto:** Write in any language in the translator channel → instantly translated to 🇺🇸 English.\n• **Reverse:** Reply to a translated message in English → translates back to the original language."
            },
            {
                name: "🛂 2. Nickname & Verification",
                value: "• New members start as **Rookies** with limited access.\n• Click the **'Nickname'** button in the welcome channel.\n• Include your guild tag (e.g. `TS Luffy` or `Thousand Sunny Luffy`).\n• Automatically grants **Player** role and unlocks the server! 🔓"
            },
            {
                name: "⚔️ 3. Mania Battle System",
                value: "• `mania-plan <key>/all` — Start recruitment with ✅ ❌ ⏳ reactions.\n• `mania-list <key>` — Live report of confirmed players + pings missing.\n• `mania-dm <key>` — DM everyone who hasn't voted yet.\n• `mania-strategy` — Post the battle plan and ping @everyone.\n• `!mania-addguild <key> @role #plan-ch #notify-ch` — Add a guild *(Admin)*\n• `!mania-guilds` / `!mania-removeguild <key>` — Manage guilds *(Admin)*"
            },
            {
                name: "⚓ 4. Leveling & Pirate Ranks",
                value: "• Chat to earn XP. Images grant **Bonus XP**! 🖼️\n• 220+ unique ranks from **Silent Snail** 🐌 to **Grass Avoider** 🌱❌.\n• `!rank` — See your progress bar `[▇▇▇——]` and current title.\n• `!top` — Top 10 most active on this server *(Admin)*\n• `!leveling-disable` — Disable XP for this server *(Admin)*"
            },
            {
                name: "🚢 5. Belly Rush Registration",
                value: "• Use buttons to join your ship when the panel is posted.\n• `!want <ship-name>` — Request a **permanent** spot in the belly-rush-roles channel.\n• `!setup` — Manually send the panel *(Admin)*\n• `!ship-add <name> <emoji> @role` — Add a ship *(Admin)*\n• `!ship-captain @user <ship>` — Set a permanent captain *(Admin)*"
            },
            {
                name: "⚙️ 6. Repair Ship",
                value: "• `repair @ship` — Send a random repair message *(in repair channel)*\n• `!ship-addrepair <ship> <msg>` — Add repair message, use `{user}` for @mention *(Admin)*\n• `!ship-repairs <ship>` — List all repair messages with IDs *(Admin)*\n• `!ship-removerepair <id>` — Remove a repair message *(Admin)*"
            },
            {
                name: "☠️ 7. Bounty & Wanted System",
                value: "• `!wanted [@user]` — View a pirate's Wanted Poster.\n• `!setbounty @user <amount>` — Set a bounty and assign tier role *(Mod/Admin)*\n• `!resetbounty @user` — Reset bounty to ฿0 *(Mod/Admin)*"
            },
            {
                name: "⚔️ 8. Hero Guides",
                value: "• `!hero <name>` — Full build guide (Role, Seals, Haki, Equipment) *(in unit-build channel)*\n• `!hero-list` — View all available heroes."
            },
            {
                name: "⏰ 9. Reminders & Events",
                value: "• Auto-pings for Mania and Belly Rush.\n• `!remind <cron> <text>` — Create custom reminders.\n• `!reminders` — List your active reminders.\n• `!allreminders` — View all schedules.\n• `!cron` — Cron format guide."
            },
            {
                name: "🎖️ 10. Role Management (Admin)",
                value: "• `!addrole @user <role>` — Assign a role.\n• `!removerole @user <role>` — Remove a role.\n• `!addroleallts @role` — Sync roles for everyone with **ᐪˢ☠️**.\n• `!addroleallgm @role` — Sync roles for everyone with **ᴳᴹ☠️**."
            },
            {
                name: "🛡️ 11. Admin Control",
                value: "• `!top` — Top 10 most active pirates.\n• `!sync` — Manually save all XP data.\n• `!clear <1-100>` — Bulk delete messages.\n• `!say <text>` / `!sendto #channel <text>` — Send messages as the bot."
            },
            {
                name: "⚙️ 12. Server Configuration (Admin)",
                value: "• `!setconfig <key> <value>` — Configure the bot for this server.\n• `!getconfig` — View current config.\n• `!checkconfig` — Check what's configured ✅ and what's missing ❌."
            },
            {
                name: "🛡️ 13. Security & Logging (Automatic)",
                value: "• **Link protection** — every link is scanned; malicious/phishing links are deleted and the user warned.\n• **Deleted messages** — logged to the admin log with author, who deleted it, content & attachments.\n• **Bulk deletes** — saved as a `.txt` file with who did it.\n• **Bans & timeouts** — logged with the responsible mod, reason & duration."
            }
        )
        .setFooter({ text: "Sailing Kingdom Engine • Automatically updated on startup" })
        .setTimestamp();

    await infoChannel.send({ embeds: [manualEmbed] });
};

/**
 * Send offline message on shutdown
 * Изпраща офлайн съобщение при спиране
 */
const sendFarewell = async (client) => {
    for (const [, guild] of client.guilds.cache) {
        const botChannel = await getChannel(guild, 'bot_status_channel');
        if (botChannel) {
            const farewellEmbed = new EmbedBuilder()
                .setTitle("📡 System Status: Offline")
                .setDescription("🌅 **Farewell, pirates! Heading to port for maintenance. Back soon!**")
                .setColor("#ff4444")
                .setTimestamp();
            await botChannel.send({ embeds: [farewellEmbed] }).catch(() => {});
        }
    }
};

module.exports = { sendBotManual, sendFarewell };
