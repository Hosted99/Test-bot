const { EmbedBuilder } = require("discord.js");
const fs = require('fs');
const path = require('path');
const staticReminders = require("../data/staticReminders");
const { isValidCron } = require("./scheduler");
const { updateBountyRole } = require("./roleHandler");
const { buildBountyUpdateEmbed } = require("./bountyEmbed");
const { getConfig, getChannel } = require("./guildConfig");

// ─────────────────────────────────────────────
// Load heroes from heroes.json (hot reload)
// Зарежда героите от heroes.json (горещо презареждане)
// ─────────────────────────────────────────────
function getHeroes() {
    try {
        const filePath = path.join(__dirname, "../data/heroes.json");
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("❌ ERROR READING heroes.json / ГРЕШКА ПРИ ЧЕТЕНЕ НА heroes.json:", err.message);
        return {};
    }
}

// ─────────────────────────────────────────────
// Hero display helpers (archetype grouping, rarity badge, chip formatting)
// Помощни функции за показване на герои (групиране по archetype, rarity badge, chip формат)
// ─────────────────────────────────────────────
const ARCHETYPE_INFO = {
    tank: { icon: "🛡️", label: "Tank", color: "#378ADD" },
    warrior: { icon: "⚔️", label: "Warrior", color: "#E24B4A" },
    mage: { icon: "🔮", label: "Mage", color: "#7F77DD" },
    support: { icon: "✨", label: "Support", color: "#639922" },
    other: { icon: "📦", label: "Other", color: "#95a5a6" }
};

function getArchetype(hero) {
    const raw = (hero.role || "").split("/")[0].trim().toLowerCase();
    return ARCHETYPE_INFO[raw] ? raw : "other";
}

// Извлича rarity от заглавието, напр. "Roger (UR)" -> "UR". Взима последната скоба.
function extractRarity(title) {
    const matches = [...(title || "").matchAll(/\(([^)]+)\)/g)];
    return matches.length > 0 ? matches[matches.length - 1][1].trim() : null;
}

function cleanTitleName(title) {
    return (title || "").replace(/\([^)]*\)\s*$/, "").trim();
}

// "Mind | Pierce | Rage" -> "`Mind` `Pierce` `Rage`" — inline code се рендва
// от Discord с лек сив фон, най-близкото до "pill/chip" вид, което имаме.
function toChips(pipeStr) {
    if (!pipeStr) return null;
    return pipeStr.split("|").map(s => s.trim()).filter(Boolean).map(s => `\`${s}\``).join(" ");
}


async function handleCommands(msg, pool) {
    const content = msg.content.trim();
    const args = content.split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // ─────────────────────────────────────────────
    // !help — full command menu
    // !help — пълно меню с всички команди
    // ─────────────────────────────────────────────
    if (cmd === "!help") {
        const helpEmbed = new EmbedBuilder()
            .setTitle("🏴‍☠️ Sailing Kingdom — Command Manual")
            .setDescription("Welcome aboard! Here are all the tools available to our crew.")
            .setColor("#00AE86")
            .addFields(
                {
                    name: "🌐 AI Translator",
                    value: "• Write in any language in the translator channel → auto-translated to English\n• Reply to a foreign message in English → translates back to their language"
                },
                {
                    name: "🎖️ Leveling & XP",
                    value: "• `!rank` — Your level and progress bar (auto-deletes after 60s)\n• `!top` — Top 10 most active on this server (Admin)\n• `!sync` — Manually flush XP to database (Admin)"
                },
                {
                    name: "💰 Bounty System",
                    value: "• `!wanted [@user]` — Show Wanted poster\n• `!setbounty @user <amount>` — Set bounty and role (Mod/Admin)\n• `!resetbounty @user` — Reset bounty to ฿0 (Mod/Admin)\n• 📸 Anyone can just post a bounty screenshot in `bounty_upload_channel` (if configured) — AI reads it and updates the bounty automatically, no command needed"
                },
                {
                    name: "⚔️ Heroes & Guides",
                    value: "• `!hero <name>` — Full hero build (only in unit-build channel)\n• `!hero-list` — List all available heroes\n• `!mania-help` — Show the Mania command guide"
                },
                {
                    name: "⚔️ Mania System",
                    value: "• `mania-plan <key>/all` — Start a sign-up plan\n• `mania-list <key>` — Check votes and ping missing members\n• `mania-dm <key>` — DM everyone who hasn't voted\n• `mania-strategy` — Post the battle plan\n• `!mania-addguild <key> @role #plan-ch #notify-ch` — Add a guild (Admin)\n• `!mania-guilds` — List all guilds (Admin)\n• `!mania-removeguild <key>` — Remove a guild (Admin)"
                },
                {
                    name: "🚢 Belly Rush & Ships",
                    value: "• `!want <ship-name>` — Request permanent crew spot (in belly-rush-roles channel)\n• `!setup` — Manually send the Belly Rush panel (Admin)\n• `!ship-add <name> <emoji> @role` — Add a ship (Admin)\n• `!ship-remove <name>` — Remove a ship (Admin)\n• `!ship-list` — View all ships and crews (Admin)\n• `!ship-captain @user <ship>` — Set permanent captain (Admin)\n• `!ship-uncaptain @user` — Remove captain (Admin)"
                },
                {
                    name: "📊 Ship Status (HP/Fatigue)",
                    value: "• `!shipstatus title:<name> unit1:<name>,<percent>[,<label>] ...` — Post/update a ship's crew status board (Mod/Admin)\n• `!shipstatus-image [title]` + attach 1-8 screenshots — AI reads and merges the crew status from all of them and shows a Confirm/Cancel preview before posting (Mod/Admin)\n• Set `!setconfig ship_status_channel <channel>` to always post there, regardless of where the command is typed (optional)"
                },
                {
                    name: "🏴‍☠️ Belly Rush Blacklist",
                    value: "• `!black-list` — View the blacklist\n• `!blacklist-add <name> <reason>` — Add a name (Admin)\n• `!blacklist-remove <name>` — Remove a name (Admin)"
                },
                {
                    name: "🎂 Birthday",
                    value: "• `!setconfig bday_channel #channel` / `!setconfig bday_user <id>` — Configure (Admin)\n• Auto-sends daily at 08:30 (Sofia time) while set\n• `!sendbday` — Send it manually right now (Admin)"
                },
                {
                    name: "⚙️ Repair Ship",
                    value: "• `repair @ship` — Send a random repair message (in repair channel)\n• `!ship-addrepair <ship> <message>` — Add repair message, use `{user}` for mention (Admin)\n• `!ship-repairs <ship>` — List all repair messages with IDs (Admin)\n• `!ship-removerepair <id>` — Remove a repair message (Admin)"
                },
                {
                    name: "⏰ Reminders",
                    value: "• `!remind <cron> <message>` — Create a reminder\n• `!reminders` — List your reminders\n• `!allreminders` — View all schedules\n• `!delete <id>` — Delete a reminder\n• `!cron` — Cron format guide"
                },
                {
                    name: "🛂 Verification",
                    value: "• New members get Rookie role automatically\n• Press **Nickname** button → enter nickname with guild tag → get Player role"
                },
                {
                    name: "🎖️ Role Management (Admin)",
                    value: "• `!addrole @user <Role>` — Assign a role\n• `!removerole @user <Role>` — Remove a role\n• `!addroleallts @role` — Give role to everyone with **ᐪˢ☠️**\n• `!addroleallgm @role` — Give role to everyone with **ᴳᴹ☠️**"
                },
                {
                    name: "🧹 Moderation (Admin)",
                    value: "• `!clear <1-100>` — Bulk delete messages\n• `!say <text>` — Send a message as the bot\n• `!sendto #channel <text>` — Send to a specific channel"
                },
                {
                    name: "⚙️ Server Config (Admin)",
                    value: "• `!setconfig <key> <value>` — Configure the bot for this server\n• `!getconfig` — View current config\n• `!checkconfig` — Check what's configured ✅ and what's missing ❌"
                }
            )
            .setFooter({ text: "Sailing Kingdom | Use !mania-help for the full Mania guide" })
            .setTimestamp();
        return msg.reply({ embeds: [helpEmbed] });
    }

                  // ─────────────────────────────────────────────
    // !hero-list — list all available heroes
    // !hero-list — списък с всички герои
    // ✅ MULTI-SERVER / МУЛТИ-СЪРВЪР: checks unit_build_channel from config
    // ─────────────────────────────────────────────
    if (cmd === "!hero-list") {
        const unitBuildChannelId = await getConfig(msg.guild.id, 'unit_build_channel');
        const isCorrectChannel = unitBuildChannelId
            ? msg.channel.id === unitBuildChannelId
            : msg.channel.name.includes('unit-build');

        if (!isCorrectChannel) {
            return msg.reply("❌ Use the configured unit-build channel! (Ask an admin: `!setconfig unit_build_channel <id>`)");
        }

        const heroesData = getHeroes();
        const allKeys = Object.keys(heroesData).sort();
        const mainKeys = allKeys.filter(key => !key.toLowerCase().includes("-cultiv1"));
        const cultiKeys = allKeys.filter(key => key.toLowerCase().includes("-cultiv1"));

        // Групиране по archetype (Tank/Warrior/Mage/Support)
        const groups = {};
        for (const key of mainKeys) {
            const archetype = getArchetype(heroesData[key]);
            if (!groups[archetype]) groups[archetype] = [];
            groups[archetype].push(key);
        }

        // Цветови кодове за заглавията на ролите в ANSI формат
        const ansiColors = {
            tank: "\x1b[1;34m",     // Син цвят
            warrior: "\x1b[1;31m",  // Червен цвят
            mage: "\x1b[1;35m",     // Лилав цвят
            support: "\x1b[1;32m",  // Зелен цвят
            other: "\x1b[1;37m",    // Бял цвят
            culti: "\x1b[1;33m",    // Жълт цвят
            reset: "\x1b[0m"        // Нулиране на цвета
        };

        const descriptionLines = [
            `Use \`!hero <name>\` to view a detailed build. **${allKeys.length}** heroes total.\n`
        ];

        for (const archetype of ["tank", "warrior", "mage", "support", "other"]) {
            const keys = groups[archetype];
            if (!keys || keys.length === 0) continue;
            
            const info = ARCHETYPE_INFO[archetype];
            const colorCode = ansiColors[archetype] || ansiColors.other;
            
            // 1. Правим цветно заглавие на ролята в малко ANSI блокче
            descriptionLines.push("\`\`\`ansi");
            descriptionLines.push(`${info.icon} ${colorCode}${info.label}${ansiColors.reset}`);
            descriptionLines.push("\`\`\`");
            
            // 2. Нареждаме героите отдолу с техните сиви ID бутончета
            const formattedHeroes = keys.map(key => `**${cleanTitleName(heroesData[key].title)}** \`${key}\``).join(" • ");
            descriptionLines.push(`${formattedHeroes}\n`);
        }

        // Добавяме Culti V1 вариантите най-отдолу, ако съществуват
        if (cultiKeys.length > 0) {
            descriptionLines.push("\`\`\`ansi");
            descriptionLines.push(`🟡 ${ansiColors.culti}Culti V1 Variants${ansiColors.reset}`);
            descriptionLines.push("\`\`\`");

            const cultiLines = cultiKeys.map(key => `**${cleanTitleName(heroesData[key].title)}** \`${key}\``).join(" • ");
            descriptionLines.push(`${cultiLines}`);
        }

        // Създаване на финалния красив Embed
        const listEmbed = new EmbedBuilder()
            .setTitle("🗡️ OP: Sailing Kingdom — Hero Roster")
            .setColor("#7F77DD")
            .setDescription(descriptionLines.join("\n"))
            .setTimestamp();

        return msg.reply({ embeds: [listEmbed] });
    }

           // ─────────────────────────────────────────────
    // !hero <name> — full hero build guide
    // !hero <ime> — пълен билд на герой
    // ✅ MULTI-SERVER / МУЛТИ-СЪРВЪР: checks unit_build_channel from config
    // ─────────────────────────────────────────────
    if (cmd === "!hero") {
        const unitBuildChannelId = await getConfig(msg.guild.id, 'unit_build_channel');
        const isCorrectChannel = unitBuildChannelId
            ? msg.channel.id === unitBuildChannelId
            : msg.channel.name.includes('unit-build');

        if (!isCorrectChannel) return msg.reply("❌ Use the configured unit-build channel!");
        if (!args) return msg.reply("⚠️ Specify hero! Example: `!hero mihawk`");

        const heroesData = getHeroes();
        const inputName = args.join("-").toLowerCase();
        const heroKey = Object.keys(heroesData).find(key => key.toLowerCase() === inputName);
        const hero = heroesData[heroKey];

        if (!hero) return msg.reply(`❌ Hero **${args.join(" ")}** not found! Use \`!hero-list\`.`);

        const archetype = getArchetype(hero);
        const info = ARCHETYPE_INFO[archetype];
        const rarity = extractRarity(hero.title);
        const cleanName = cleanTitleName(hero.title);
        const subrole = (hero.role || "").split("/") || "";

        // Сглобяваме заглавието: Иконата и Името вляво, а ⭐`РАНГ` вдясно
        let finalTitle = `${info.icon} ${cleanName}`;
        if (rarity) {
            // Текстът, който ще отиде в десния край (напр. ⭐`UR`)
            const rarityTag = `⭐\`${rarity}\``;
            
            // Използваме специален празен символ \u00A0 за избутване вдясно.
            // Намаляваме числото на 44, за да има място за целия таг и да не отиде на нов ред.
            finalTitle = finalTitle.padEnd(44, '\u00A0') + rarityTag;
        }

        // Инициализираме embed обекта с новото заглавие
        const embed = new EmbedBuilder()
            .setTitle(finalTitle)
            .setColor(info.color)
            .setDescription(`${info.label}${subrole ? ` · ${subrole}` : ""}`);

        // Закачаме основните полета
        embed.addFields(
            { name: "🛡️ Equipment", value: hero.equipment || "---", inline: true },
            { name: "🧬 Haki Rec", value: hero.haki || "---", inline: true }
        );

        // Всяко поле се добавя само ако реално има съдержание — без "N/A" филър
        const chipFields = [
            { name: "📜 Seals", value: toChips(hero.seals) },
            { name: "✨ Extras", value: toChips(hero.extras) }
        ];
        for (const f of chipFields) {
            if (f.value) embed.addFields({ name: f.name, value: f.value, inline: false });
        }

        const plainFields = [
            { name: "🍎 Devil Fruit", value: hero.devil_fruit },
            { name: "🍊 2nd Devil Fruit", value: hero.secondary_fruit },
            { name: "🌊 Fruit Awakenings", value: hero.awakenings },
            { name: "✒️ Signature", value: hero.signature },
            { name: "💎 Treasure", value: hero.treasure }
        ];
        for (const f of plainFields) {
            if (f.value) embed.addFields({ name: f.name, value: f.value, inline: false });
        }

        // Only set image if it's a valid URL / Само ако е валиден URL
        if (hero.image && hero.image.startsWith('http')) embed.setImage(hero.image);
        return msg.channel.send({ embeds: [embed] });
    }



     
    // ─────────────────────────────────────────────
    // !remind — create a custom reminder
    // !remind — създава персонализирано напомняне
    // ✅ MULTI-SERVER / МУЛТИ-СЪРВЪР: posts in reminders_channel from config
    // ─────────────────────────────────────────────
    if (cmd === "!remind") {
        const targetCh = await getChannel(msg.guild, 'reminders_channel') || msg.channel;

        if (args.length < 6) {
            return msg.reply("❌ Usage: `!remind 0 12 * * * Your Message`\nUse `!cron` for timing help.");
        }

        const cronExpr = args.slice(0, 5).join(" ");
        const text = args.slice(5).join(" ");

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
    // !reminders — list your personal reminders
    // !reminders — показва твоите напомняния
    // ─────────────────────────────────────────────
    if (cmd === "!reminders") {
        try {
            const res = await pool.query("SELECT * FROM reminders WHERE owner_id = $1 ORDER BY id ASC", [msg.author.id]);
            if (res.rows.length === 0) return msg.reply("📋 **Your Reminders:** None set yet.");
            let list = res.rows.map(r => `ID: \`${r.id}\` | \`${r.cron}\` | ${r.message}`).join("\n");
            if (list.length > 1950) list = list.substring(0, 1947) + "...";
            return msg.reply("📋 **Your Reminders:**\n" + list);
        } catch (err) {
            console.error(err);
            return msg.reply("❌ Error reading from database.");
        }
    }

    // ─────────────────────────────────────────────
    // !allreminders — list all reminders (static + dynamic)
    // !allreminders — всички напомняния (статични + динамични)
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

            let currentFieldContent = "";
            let fieldCount = 1;
            for (const item of staticListRaw) {
                if ((currentFieldContent + item).length > 1000) {
                    embed.addFields({ name: `📌 Static Reminders (Part ${fieldCount})`, value: currentFieldContent });
                    currentFieldContent = "";
                    fieldCount++;
                }
                currentFieldContent += item + "\n";
            }
            if (currentFieldContent) {
                embed.addFields({ name: `📌 Static Reminders (Part ${fieldCount})`, value: currentFieldContent });
            }

            const safeDynamic = dynamicList.length > 1024 ? dynamicList.substring(0, 1021) + "..." : dynamicList;
            embed.addFields({ name: "⏰ Dynamic Reminders", value: safeDynamic });
            return msg.reply({ embeds: [embed] });
        } catch (err) {
            console.error("CRASH PREVENTED:", err);
            return msg.reply("❌ Error displaying reminders. Check console!");
        }
    }

    // ─────────────────────────────────────────────
    // !delete <id> — delete a reminder by ID
    // !delete <id> — изтрива напомняне по ID
    // ─────────────────────────────────────────────
    if (cmd === "!delete") {
        if (!msg.member.permissions.has("Administrator")) return msg.reply("❌ Admirals only!");
        const id = args[0];
        if (!id) return msg.reply("❌ Usage: `!delete <id>`");
        await pool.query("DELETE FROM reminders WHERE id = $1", [id]);
        return msg.reply(`🗑️ Reminder \`${id}\` deleted.`);
    }

    // ─────────────────────────────────────────────
    // !say — send a message as the bot
    // !say — ботът изпраща съобщение (командата се трие)
    // ─────────────────────────────────────────────
    if (cmd === "!say") {
        if (!msg.member.permissions.has("Administrator")) {
            return msg.reply("🏴‍☠️ Only the Captain (Administrator) can use this!");
        }
        const text = args.join(" ");
        if (!text) return msg.reply("❌ Example: `!say Ahoy Pirates!`");
        try { await msg.delete(); } catch (err) {}
        return msg.channel.send(text);
    }

    // ─────────────────────────────────────────────
    // !sendto #channel <text> — send to a specific channel
    // !sendto #канал <текст> — изпраща в конкретен канал
    // ─────────────────────────────────────────────
    if (cmd === "!sendto") {
        if (!msg.member.permissions.has("Administrator")) {
            return msg.reply("🏴‍☠️ Only the Captain can redirect messages!")
                .then(m => setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 2000));
        }
        const targetChannel = msg.mentions.channels.first();
        const text = args.slice(1).join(" ");
        if (!targetChannel) return msg.reply("❌ You must mention a channel!").then(m => setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 2000));
        if (!text) return msg.reply("❌ Please provide a message!").then(m => setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 2000));
        try {
            await targetChannel.send(text);
            const replyMsg = await msg.reply(`✅ Message sent to ${targetChannel}`);
            setTimeout(() => { replyMsg.delete().catch(() => {}); msg.delete().catch(() => {}); }, 3000);
        } catch (err) {
            console.error(err);
            const errMsg = await msg.reply("❌ Cannot send messages to that channel!");
            setTimeout(() => { errMsg.delete().catch(() => {}); msg.delete().catch(() => {}); }, 3000);
        }
    }

    // ─────────────────────────────────────────────
    // !wanted [@user] — show Wanted poster
    // !wanted [@user] — показва Wanted плакат
    // ✅ MULTI-SERVER / МУЛТИ-СЪРВЪР: posts in bounty_channel from config
    // ─────────────────────────────────────────────
    if (cmd === "!wanted") {
        const bountyChannel = await getChannel(msg.guild, 'bounty_channel');
        if (!bountyChannel) return msg.reply("❌ `bounty_channel` not configured! Use `!setconfig bounty_channel <id>`");

        const target = msg.mentions.users.first() || msg.author;

        try {
            // ✅ PER-SERVER bounty / PER-СЪРВЪР bounty
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
    // !setbounty @user <amount> — set a bounty
    // !setbounty @user <сума> — задава bounty
    // ✅ MULTI-SERVER: mod_role from config / МУЛТИ-СЪРВЪР: mod_role от конфига
    // ─────────────────────────────────────────────
    if (cmd === "!setbounty") {
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
            // Взимаме предишния bounty ПРЕДИ да го презапишем, за да покажем delta-та
            const prevRes = await pool.query("SELECT bounty FROM users WHERE guild_id = $1 AND user_id = $2", [msg.guild.id, target.id]);
            const previousBounty = prevRes.rows.length > 0 ? Number(prevRes.rows[0].bounty) : 0;

            // ✅ PER-SERVER bounty with guild_name / PER-СЪРВЪР bounty с guild_name
            await pool.query(
                "INSERT INTO users (guild_id, guild_name, user_id, bounty, username) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (guild_id, user_id) DO UPDATE SET bounty = $4, username = $5, guild_name = $2",
                [msg.guild.id, msg.guild.name, target.id, amount, target.user.username]
            );

            const assignedRank = await updateBountyRole(target, amount);

            const embed = buildBountyUpdateEmbed({
                user: target.user,
                amount: Number(amount),
                previousBounty,
                assignedRank,
                source: 'manual',
                setByUsername: msg.author.username
            });

            await msg.channel.send({ embeds: [embed] });
        } catch (err) {
            console.error("SetBounty error:", err.message);
            msg.channel.send("❌ Error updating bounty.");
        }
    }

    // ─────────────────────────────────────────────
    // !resetbounty @user — reset bounty to ฿0
    // !resetbounty @user — нулира bounty до ฿0
    // ✅ MULTI-SERVER / МУЛТИ-СЪРВЪР: per-guild bounty reset
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
            // ✅ PER-SERVER: only resets bounty for THIS guild
            // ✅ PER-СЪРВЪР: нулира само за ТОЗИ сървър
            await pool.query("UPDATE users SET bounty = 0 WHERE guild_id = $1 AND user_id = $2", [msg.guild.id, target.id]);

            const adminLog = await getChannel(msg.guild, 'admin_log_channel');
            if (adminLog) {
                const logEmbed = new EmbedBuilder()
                    .setTitle("🧹 Bounty Reset")
                    .setDescription(`**Staff:** ${msg.author}\n**Target:** ${target}\n**Action:** Bounty reset to ฿0`)
                    .setColor("#ff0000")
                    .setTimestamp();
                await adminLog.send({ embeds: [logEmbed] }).catch(() => {});
            }

            await updateBountyRole(target, 0);
            return msg.channel.send(`🧹 Bounty for **${target.user.username}** reset to ฿0.`);
        } catch (err) {
            console.error("ResetBounty error:", err.message);
            return msg.channel.send("❌ Error resetting bounty.");
        }
    }

    // ─────────────────────────────────────────────
    // !clear <amount> — bulk delete messages
    // !clear <брой> — масово триене на съобщения
    // ─────────────────────────────────────────────
    if (cmd === "!clear") {
        if (!msg.member.permissions.has("ManageMessages") && !msg.member.permissions.has("Administrator")) {
            const err = await msg.reply("❌ Only Admirals have the authority to clean the deck!");
            return setTimeout(() => { err.delete().catch(() => {}); msg.delete().catch(() => {}); }, 5000);
        }

        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return msg.reply("⚠️ Specify a number between 1 and 100. Example: `!clear 50`")
                .then(m => setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 5000));
        }

        try {
            const deletedMessages = await msg.channel.bulkDelete(amount + 1, true);
            const success = await msg.channel.send(`🧹 Deleted ${deletedMessages.size - 1} messages.`);
            setTimeout(() => success.delete().catch(() => {}), 3000);
        } catch (err) {
            console.error("Clear error:", err.message);
            msg.reply("❌ Failed. (Messages older than 14 days cannot be bulk deleted).");
        }
    }

    // ─────────────────────────────────────────────
    // !mania-help — Mania command guide
    // !mania-help — наръчник за Mania командите
    // ─────────────────────────────────────────────
    if (cmd === "!mania-help") {
        const helpEmbed = new EmbedBuilder()
            .setTitle("🏴‍☠️ MANIA COMMANDS")
            .setDescription("Use these commands to organize the crew and prepare for battle!")
            .setColor("#FF4500")
            .addFields(
                { name: "📝 mania-plan <key> / all", value: "Start a sign-up plan with ✅ ❌ ⏳ reactions." },
                { name: "📜 mania-list <key>", value: "Show votes and **ping anyone who hasn't voted** 🔔" },
                { name: "📩 mania-dm <key>", value: "DM everyone who hasn't voted yet." },
                { name: "⚔️ mania-strategy", value: "Post the battle plan.\n**Format:** `Boss - @Player1 @Player2`\n*Each boss on a new line.*" },
                { name: "⚙️ Setup (Admin)", value: "`!mania-addguild <key> @role #plan-channel #notify-channel`\n`!mania-guilds` — list all\n`!mania-removeguild <key>` — remove" }
            )
            .setFooter({ text: "Tip: Use mania-list to find missing voters! 🏴‍☠️" })
            .setTimestamp();
        return msg.reply({ embeds: [helpEmbed] });
    }

    // ─────────────────────────────────────────────
    // !cron — cron format guide
    // !cron — наръчник за cron формата
    // ─────────────────────────────────────────────
    if (cmd === "!cron" || cmd === "!cronhelp") {
        const serverTime = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: '2-digit', minute: '2-digit' });
        const cronEmbed = new EmbedBuilder()
            .setTitle("📜 Cron Format Guide")
            .setDescription(`Use this format for \`!remind\`.\n**Current Server Time (London):** \`${serverTime}\``)
            .setColor("#3498db")
            .addFields(
                { name: "⏳ Format: `* * * * *`", value: "1️⃣ **Minute** (0-59)\n2️⃣ **Hour** (0-23)\n3️⃣ **Day of Month** (1-31)\n4️⃣ **Month** (1-12)\n5️⃣ **Day of Week** (0-6, 0=Sunday)" },
                { name: "💡 Examples", value: "• `0 12 * * *` — Every day at **12:00**\n• `30 19 * * 1-5` — Weekdays at **19:30**\n• `*/15 * * * *` — Every **15 minutes**\n• `0 20 * * 2,5` — Tuesday & Friday at **20:00**" },
                { name: "⚓ Pro-Tip", value: "Use [crontab.guru](https://crontab.guru) to test your expressions!" }
            )
            .setFooter({ text: "Example: !remind 0 21 * * * Boss Raid time!" })
            .setTimestamp();
        return msg.channel.send({ embeds: [cronEmbed] });
    }
}

module.exports = { handleCommands };
