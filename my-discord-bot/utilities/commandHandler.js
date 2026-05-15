const { EmbedBuilder } = require("discord.js");
const fs = require('fs');
const path = require('path');
const staticReminders = require("../data/staticReminders");
const { isValidCron } = require("./scheduler");
const { updateBountyRole } = require("./roleHandler");
const { getConfig, getChannel } = require("./guildConfig"); // ✅ МУЛТИ-СЪРВЪР

// ─────────────────────────────────────────────
// Зарежда героите от heroes.json (hot reload)
// ─────────────────────────────────────────────
function getHeroes() {
    try {
        const filePath = path.join(__dirname, "../data/heroes.json");
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("❌ ГРЕШКА ПРИ ЧЕТЕНЕ НА heroes.json:", err.message);
        return {};
    }
}

async function handleCommands(msg, pool) {
    const content = msg.content.trim();
    const args = content.split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // ─────────────────────────────────────────────
    // !help — пълно меню с команди
    // ─────────────────────────────────────────────
    if (cmd === "!help") {
        const helpEmbed = new EmbedBuilder()
            .setTitle("🏴‍☠️ Sailing Kingdom - Command Manual")
            .setDescription("Welcome aboard! Here are all the tools available to our crew:")
            .setColor("#00AE86")
            .addFields(
                { name: "🌐 AI Translation System", value: "• **Auto:** Write in any language in `#ai-translator` for 🇺🇸 English.\n• **Reply:** Reply to a message in English to translate it back." },
                { name: "📢 Communication (Admin)", value: "• `!say <msg>` - Send a message through the bot.\n• `!sendto #channel <msg>` - Send a message to a specific channel." },
                { name: "💰 Bounty System", value: "• `!wanted [@user]` - Show wanted poster.\n• `!setbounty @user <amt>` - Set reward & role (Mod/Admin).\n• `!resetbounty @user` - Reset reward & role (Mod/Admin)." },
                { name: "⚔️ Heroes & Guides", value: "• `!hero <name>` - Get guide (Only in configured unit-build channel).\n• `!hero-list` - See all available heroes.\n• `!mania-help` - Show the mania guide." },
                { name: "⏰ Reminders", value: "• `!remind <cron> <msg>` - Set custom reminder.\n• `!reminders` - List your reminders.\n• `!allreminders` - View all schedules.\n• `!cron` — Show the timing & cron guide." },
                { name: "🎖️ Role Management (Admin)", value: "• `!addrole @user <Role>` - Assign crew role.\n• `!removerole @user <Role>` - Remove crew role.\n• `!addroleallts @role` — Add role to everyone with **ᐪˢ☠️**.\n• `!addroleallgm @role` — Add role to everyone with **ᴳᴹ☠️**." },
                { name: "🧹 Moderation", value: "• `!clear <1-100>` - Bulk delete messages (Admin)." },
                { name: "⚙️ Server Config (Admin)", value: "• `!setconfig <key> <value>` - Configure the bot for this server.\n• `!getconfig` - View current config." }
            )
            .setFooter({ text: "Sailing Kingdom | Official Bot Guide" })
            .setTimestamp();
        return msg.reply({ embeds: [helpEmbed] });
    }

    // ─────────────────────────────────────────────
    // !hero-list — списък с всички герои
    // ✅ МУЛТИ-СЪРВЪР: проверява unit_build_channel от конфига
    // ─────────────────────────────────────────────
    if (cmd === "!hero-list") {
        const unitBuildChannelId = await getConfig(msg.guild.id, 'unit_build_channel');
        const isCorrectChannel = unitBuildChannelId
            ? msg.channel.id === unitBuildChannelId
            : msg.channel.name.includes('unit-build'); // fallback към име

        if (!isCorrectChannel) {
            return msg.reply("❌ Use the configured unit-build channel! (Ask an admin to set it with `!setconfig unit_build_channel <id>`)");
        }

        const heroesData = getHeroes();
        const allKeys = Object.keys(heroesData).sort();
        const mainBuilds = allKeys.filter(name => !name.toLowerCase().includes("-cultiv1"));
        const cultiBuilds = allKeys.filter(name => name.toLowerCase().includes("-cultiv1"));

        const formatList = (list) => {
            if (list.length === 0) return "---";
            return list.map((name, index) => `**${index + 1}.** \`${name}\``).join("\n");
        };

        const listEmbed = new EmbedBuilder()
            .setTitle("📜 OP: Sailing Kingdom - Hero Roster")
            .setColor("#00AE86")
            .setDescription("Use `!hero <name>` to view a detailed build.")
            .addFields(
                { name: "🔵 Main Builds", value: formatList(mainBuilds), inline: true },
                { name: "🟡 Culti V1 Variants", value: formatList(cultiBuilds), inline: true }
            )
            .setFooter({ text: `Total Heroes: ${allKeys.length} | Build System` })
            .setTimestamp();

        return msg.reply({ embeds: [listEmbed] });
    }

    // ─────────────────────────────────────────────
    // !hero <name> — пълен билд на герой
    // ✅ МУЛТИ-СЪРВЪР: проверява unit_build_channel от конфига
    // ─────────────────────────────────────────────
    if (cmd === "!hero") {
        const unitBuildChannelId = await getConfig(msg.guild.id, 'unit_build_channel');
        const isCorrectChannel = unitBuildChannelId
            ? msg.channel.id === unitBuildChannelId
            : msg.channel.name.includes('unit-build');

        if (!isCorrectChannel) return msg.reply("❌ Use the configured unit-build channel!");
        if (!args[0]) return msg.reply("⚠️ Specify hero! Example: `!hero mihawk`.");

        const heroesData = getHeroes();
        const inputName = args.join("-").toLowerCase();
        const heroKey = Object.keys(heroesData).find(key => key.toLowerCase() === inputName);
        const hero = heroesData[heroKey];

        if (!hero) return msg.reply(`❌ Hero **${args.join(" ")}** not found! Use \`!hero-list\`.`);

        const embed = new EmbedBuilder()
            .setTitle(hero.title)
            .setImage(hero.image)
            .setColor(hero.color || "#2b2d31")
            .addFields(
                { name: "⚔️ Role", value: hero.role || "N/A", inline: true },
                { name: "🛡️ Equipment", value: hero.equipment || "N/A", inline: true },
                { name: "🧬 Haki Rec", value: hero.haki || "N/A", inline: true },
                { name: "📜 Seals", value: hero.seals || "N/A", inline: false },
                { name: "✨ Extras", value: hero.extras || "N/A", inline: false },
                { name: "🍎 Devil Fruit", value: hero.devil_fruit || "N/A", inline: false },
                { name: "🍊 2nd Devil Fruit", value: hero.secondary_fruit || "---", inline: false },
                { name: "🌊 Fruit Awakenings", value: hero.awakenings || "N/A", inline: false },
                { name: "💎 Treasure", value: hero.treasure || "N/A", inline: false }
            );

        return msg.channel.send({ embeds: [embed] });
    }

    // ─────────────────────────────────────────────
    // !remind — създава напомняне
    // ✅ МУЛТИ-СЪРВЪР: взима reminders_channel от конфига
    // ─────────────────────────────────────────────
    if (cmd === "!remind") {
        // Взимаме канала от конфига — ако не е зададен, ползваме текущия канал
        const targetCh = await getChannel(msg.guild, 'reminders_channel') || msg.channel;

        if (args.length < 6) {
            return msg.reply("❌ Usage: `!remind 0 12 * * * Your Message`");
        }

        const cronExpr = args.slice(0, 5).join(" "); // "0 12 * * *"
        const text = args.slice(5).join(" ");         // текстът на напомнянето

        if (!isValidCron(cronExpr)) return msg.reply("❌ Invalid Cron format! Use `!cron` for help.");

        try {
            const reminderId = Date.now();
            await pool.query(
                "INSERT INTO reminders (id, cron, message, channel_id, owner_id) VALUES ($1, $2, $3, $4, $5)",
                [reminderId, cronExpr, text, targetCh.id, msg.author.id]
            );
            msg.reply(`✅ Reminder set! Will post in <#${targetCh.id}> at \`${cronExpr}\`.`);
        } catch (err) {
            console.error("❌ DB Error during !remind:", err.message);
            msg.reply("❌ Database Error. Check bot logs.");
        }
    }

    // ─────────────────────────────────────────────
    // !reminders — показва напомнянията на потребителя
    // ─────────────────────────────────────────────
    if (cmd === "!reminders") {
        try {
            const res = await pool.query("SELECT * FROM reminders WHERE owner_id = $1 ORDER BY id ASC", [msg.author.id]);
            if (res.rows.length === 0) return msg.reply("📋 **Your Reminders:** None.");
            let list = res.rows.map(r => `ID: \`${r.id}\` | \`${r.cron}\` | ${r.message}`).join("\n");
            if (list.length > 1950) list = list.substring(0, 1947) + "...";
            return msg.reply("📋 **Your Reminders:**\n" + list);
        } catch (err) {
            console.error(err);
            return msg.reply("❌ Error reading from database.");
        }
    }

    // ─────────────────────────────────────────────
    // !allreminders — показва всички напомняния (статични + динамични)
    // ─────────────────────────────────────────────
    if (cmd === "!allreminders") {
        try {
            const res = await pool.query("SELECT * FROM reminders ORDER BY id ASC");
            const dynamicList = res.rows.map(r => `ID: \`${r.id}\` | \`${r.cron}\` | ${r.message}`).join("\n") || "None";
            const staticListRaw = staticReminders.map(r => {
                const msgText = typeof r.message === 'function' ? r.message() : r.message;
                return `\`${r.cron}\` | ${msgText}`;
            });

            const embed = new EmbedBuilder().setTitle("📋 All Scheduled Events").setColor("#F1C40F");

            // Разделяме статичните на части (Discord лимит: 1024 символа на field)
            let currentFieldContent = "";
            let fieldCount = 1;
            for (const item of staticListRaw) {
                if ((currentFieldContent + item).length > 1000) {
                    embed.addFields({ name: `📌 Static (Part ${fieldCount})`, value: currentFieldContent });
                    currentFieldContent = "";
                    fieldCount++;
                }
                currentFieldContent += item + "\n";
            }
            if (currentFieldContent) {
                embed.addFields({ name: `📌 Static (Part ${fieldCount})`, value: currentFieldContent });
            }

            const safeDynamic = dynamicList.length > 1024 ? dynamicList.substring(0, 1021) + "..." : dynamicList;
            embed.addFields({ name: "⏰ Dynamic", value: safeDynamic });
            return msg.reply({ embeds: [embed] });
        } catch (err) {
            console.error("CRASH PREVENTED:", err);
            return msg.reply("❌ Error displaying reminders. Check console!");
        }
    }

    // ─────────────────────────────────────────────
    // !delete <id> — изтрива напомняне
    // ─────────────────────────────────────────────
    if (cmd === "!delete") {
        if (!msg.member.permissions.has("Administrator")) return msg.reply("❌ Only Admirals!");
        const id = args[0];
        if (!id) return msg.reply("❌ Usage: `!delete <id>`");
        await pool.query("DELETE FROM reminders WHERE id = $1", [id]);
        return msg.reply(`🗑️ Deleted reminder \`${id}\`.`);
    }

    // ─────────────────────────────────────────────
    // !say — ботът изпраща съобщение
    // ─────────────────────────────────────────────
    if (cmd === "!say") {
        if (!msg.member.permissions.has("Administrator")) {
            return msg.reply("🏴‍☠️ Only the Captain (Administrator) can use this command!");
        }
        const text = args.join(" ");
        if (!text) return msg.reply("❌ You need to write a message! Example: `!say Hello Pirates!`");
        try { await msg.delete(); } catch (err) {}
        return msg.channel.send(text);
    }

    // ─────────────────────────────────────────────
    // !sendto #channel <text> — изпраща в конкретен канал
    // ─────────────────────────────────────────────
    if (cmd === "!sendto") {
        if (!msg.member.permissions.has("Administrator")) {
            return msg.reply("🏴‍☠️ Only the Captain can redirect messages!")
                .then(m => setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 2000));
        }
        const targetChannel = msg.mentions.channels.first();
        const text = args.slice(1).join(" ");
        if (!targetChannel) return msg.reply("❌ You must tag a channel!").then(m => setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 2000));
        if (!text) return msg.reply("❌ Please provide a message!").then(m => setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 2000));
        try {
            await targetChannel.send(text);
            const replyMsg = await msg.reply(`✅ Message successfully sent to ${targetChannel}`);
            setTimeout(() => { replyMsg.delete().catch(() => {}); msg.delete().catch(() => {}); }, 3000);
        } catch (err) {
            console.error(err);
            const errMsg = await msg.reply("❌ I cannot send messages to that channel!");
            setTimeout(() => { errMsg.delete().catch(() => {}); msg.delete().catch(() => {}); }, 3000);
        }
    }

    // ─────────────────────────────────────────────
    // !wanted [@user] — Wanted плакат
    // ✅ МУЛТИ-СЪРВЪР: взима bounty_channel от конфига
    // ─────────────────────────────────────────────
    if (cmd === "!wanted") {
        // Взимаме канала от конфига на ТОЗИ сървър
        const bountyChannel = await getChannel(msg.guild, 'bounty_channel');
        if (!bountyChannel) return msg.reply("❌ Error: `bounty_channel` not configured! Use `!setconfig bounty_channel <id>`");

        const target = msg.mentions.users.first() || msg.author;

        try {
            // Bounty е глобално (без guild_id) — един акаунт = едно bounty
            // ✅ PER-GUILD: bounty е отделно за всеки сървър
            const res = await pool.query("SELECT bounty FROM users WHERE guild_id = $1 AND user_id = $2", [msg.guild.id, target.id]);
            const bounty = res.rows.length > 0 ? res.rows[0].bounty : 0;

            const wantedEmbed = new EmbedBuilder()
                .setAuthor({ name: "⚓ MARINE HEADQUARTERS" })
                .setTitle("☠️ W A N T E D ☠️")
                .setDescription(`**NAME: ${target.username.toUpperCase()}**\n---------------------------------`)
                .setColor("#e67e22")
                .addFields(
                    { name: "💰 REWARD", value: `฿ **${Number(bounty).toLocaleString()}**`, inline: true },
                    { name: "📜 STATUS", value: "🔴 **DEAD OR ALIVE**", inline: true }
                )
                .setImage(target.displayAvatarURL({ extension: 'png', dynamic: true, size: 1024 }))
                .setFooter({ text: "By order of the World Government" })
                .setTimestamp();

            await bountyChannel.send({ content: `📜 New Bounty Issued for ${target}!`, embeds: [wantedEmbed] });

            const reply = await msg.reply(`✅ Wanted poster created in <#${bountyChannel.id}>!`);
            setTimeout(() => { msg.delete().catch(() => {}); reply.delete().catch(() => {}); }, 10000);
        } catch (err) {
            console.error("Wanted error:", err.message);
            msg.reply("❌ Something went wrong while creating the poster.");
        }
    }

    // ─────────────────────────────────────────────
    // !setbounty @user <amount> — задава bounty
    // ✅ МУЛТИ-СЪРВЪР: взима mod_role от конфига
    // ─────────────────────────────────────────────
    if (cmd === "!setbounty") {
        // Взимаме mod роля от конфига на ТОЗИ сървър
        const modRoleId = await getConfig(msg.guild.id, 'mod_role');
        const hasModRole = modRoleId ? msg.member.roles.cache.has(modRoleId) : false;
        const hasAdminPerm = msg.member.permissions.has("Administrator");

        if (!hasModRole && !hasAdminPerm) {
            return msg.reply("❌ Access Denied! Administrators or Moderators only.")
                .then(m => { setTimeout(() => m.delete().catch(() => {}), 5000); msg.delete().catch(() => {}); });
        }

        msg.delete().catch(() => {});

        const target = msg.mentions.members.first();
        const amount = args[1];

        if (!target || isNaN(amount)) {
            return msg.channel.send("❌ Usage: `!setbounty @user <amount>`");
        }

        try {
            // ✅ Bounty е глобално — без guild_id
            // ✅ PER-GUILD: записваме bounty per-сървър
            await pool.query(
                "INSERT INTO users (guild_id, user_id, bounty, username) VALUES ($1, $2, $3, $4) ON CONFLICT (guild_id, user_id) DO UPDATE SET bounty = $3, username = $4",
                [msg.guild.id, target.id, amount, target.user.username]
            );

            const assignedRank = await updateBountyRole(target, amount);

            const embed = new EmbedBuilder()
                .setTitle("🎖️ New Rank: Bounty Update")
                .setDescription(`🎊 Congratulations ${target.user.username}! Your status has been updated.`)
                .addFields(
                    { name: "💰 New Bounty", value: `฿ **${Number(amount).toLocaleString()}**`, inline: true },
                    { name: "📈 Status", value: `🚀 **New Role: ${assignedRank || "Updated"}**`, inline: true }
                )
                .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
                .setColor("#f1c40f")
                .setFooter({ text: "The World Government is watching you..." })
                .setTimestamp();

            await msg.channel.send({ embeds: [embed] });
        } catch (err) {
            console.error("SetBounty error:", err.message);
            msg.channel.send("❌ Error updating bounty in database.");
        }
    }

    // ─────────────────────────────────────────────
    // !resetbounty @user — нулира bounty
    // ✅ МУЛТИ-СЪРВЪР: взима mod_role и admin_log_channel от конфига
    // ─────────────────────────────────────────────
    if (cmd === "!resetbounty") {
        const modRoleId = await getConfig(msg.guild.id, 'mod_role');
        const hasModRole = modRoleId ? msg.member.roles.cache.has(modRoleId) : false;
        const hasAdminPerm = msg.member.permissions.has("Administrator");

        if (!hasModRole && !hasAdminPerm) {
            return msg.reply("❌ Access Denied! Admirals or Moderators only.")
                .then(m => { setTimeout(() => m.delete().catch(() => {}), 5000); msg.delete().catch(() => {}); });
        }

        msg.delete().catch(() => {});

        const target = msg.mentions.members.first();
        if (!target) return msg.channel.send("❌ Please mention a user to reset.");

        try {
            // ✅ Bounty е глобално — без guild_id
            // ✅ PER-GUILD: нулираме bounty само за ТОЗИ сървър
            await pool.query("UPDATE users SET bounty = 0 WHERE guild_id = $1 AND user_id = $2", [msg.guild.id, target.id]);

            // ✅ МУЛТИ-СЪРВЪР: взима admin log канала от конфига на ТОЗИ сървър
            const adminLog = await getChannel(msg.guild, 'admin_log_channel');
            if (adminLog) {
                const logEmbed = new EmbedBuilder()
                    .setTitle("🧹 Bounty Reset Log")
                    .setDescription(`**Staff:** ${msg.author}\n**Target:** ${target}\n**Action:** Bounty reset to ฿0`)
                    .setColor("#ff0000")
                    .setTimestamp();
                await adminLog.send({ embeds: [logEmbed] }).catch(() => {});
            }

            await updateBountyRole(target, 0);
            return msg.channel.send(`🧹 **Cleaning the Deck:** Bounty for **${target.user.username}** has been reset to ฿0.`);
        } catch (err) {
            console.error("ResetBounty error:", err.message);
            return msg.channel.send("❌ Error resetting bounty. Check database connection.");
        }
    }

    // ─────────────────────────────────────────────
    // !clear <amount> — трие съобщения
    // ─────────────────────────────────────────────
    if (cmd === "!clear") {
        if (!msg.member.permissions.has("ManageMessages") && !msg.member.permissions.has("Administrator")) {
            const err = await msg.reply("❌ Only Admirals have the authority to clean the deck!");
            return setTimeout(() => { err.delete().catch(() => {}); msg.delete().catch(() => {}); }, 5000);
        }

        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return msg.reply("⚠️ Please specify a number between 1 and 100. Example: `!clear 50`")
                .then(m => setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 5000));
        }

        try {
            const deletedMessages = await msg.channel.bulkDelete(amount + 1, true);
            const success = await msg.channel.send(`🧹 **Cleaning complete!** Deleted ${deletedMessages.size - 1} messages.`);
            setTimeout(() => success.delete().catch(() => {}), 3000);
        } catch (err) {
            console.error("Clear error:", err.message);
            msg.reply("❌ Failed to delete messages. (Messages older than 14 days cannot be bulk deleted).");
        }
    }

    // ─────────────────────────────────────────────
    // !mania-help — наръчник за Mania командите
    // ─────────────────────────────────────────────
    if (cmd === "!mania-help") {
        const helpEmbed = new EmbedBuilder()
            .setTitle("🏴‍☠️ MANIA COMMANDS CENTER")
            .setDescription("Use these commands to organize the crew and prepare for battle!")
            .setColor("#FF4500")
            .addFields(
                { name: "📝 mania-plan <key> / all", value: "Starts the daily sign-up with ✅ ❌ ⏳ reactions." },
                { name: "📜 mania-list <key>", value: "Checks reactions and **pings anyone who hasn't voted yet!** 🔔" },
                { name: "📩 mania-dm <key>", value: "Sends DMs to all non-voters." },
                { name: "⚔️ mania-strategy", value: "Publishes the final battle plan.\n**Format:** `Boss Name - @Player1 @Player2`\n*Each boss on a new line with a dash `-`.*" },
                { name: "⚙️ Setup (Admin)", value: "`!mania-addguild <key> @role #plan-channel #notify-channel`\n`!mania-guilds` — list all\n`!mania-removeguild <key>` — remove" }
            )
            .setFooter({ text: "Captain's Tip: Use mania-list to find missing voters! 🏴‍☠️" })
            .setTimestamp();
        return msg.reply({ embeds: [helpEmbed] });
    }

    // ─────────────────────────────────────────────
    // !cron — наръчник за cron формата
    // ─────────────────────────────────────────────
    if (cmd === "!cron" || cmd === "!cronhelp") {
        const serverTime = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: '2-digit', minute: '2-digit' });
        const cronEmbed = new EmbedBuilder()
            .setTitle("📜 Pirate's Timing Manual (Cron Guide)")
            .setDescription(`Use this format for \`!remind\` and strategy scheduling.\n**Current Server Time (London):** \`${serverTime}\``)
            .setColor("#3498db")
            .addFields(
                { name: "⏳ The 5-Star Format: `* * * * *`", value: "1️⃣ **Minute** (0-59)\n2️⃣ **Hour** (0-23)\n3️⃣ **Day** of Month (1-31)\n4️⃣ **Month** (1-12)\n5️⃣ **Day of Week** (0-6, 0=Sunday)" },
                { name: "💡 Practical Examples:", value: "• `0 12 * * *` — Every day at **12:00**\n• `30 19 * * 1-5` — Every weekday at **19:30**\n• `*/15 * * * *` — Every **15 minutes**\n• `0 12-20/2 * * *` — From 12:00 to 20:00, **every 2 hours**" },
                { name: "⚓ Pro-Tip", value: "Use [crontab.guru](https://crontab.guru) to test your expressions!" }
            )
            .setFooter({ text: "Example: !remind 0 21 * * * It's time for the Boss Raid!" })
            .setTimestamp();
        return msg.channel.send({ embeds: [cronEmbed] });
    }
}

module.exports = { handleCommands };
