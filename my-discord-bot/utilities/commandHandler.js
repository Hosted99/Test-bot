const { EmbedBuilder } = require("discord.js");
const fs = require('fs'); 
const path = require('path')
const staticReminders = require("../data/staticReminders");
const { isValidCron } = require("./scheduler");
const { updateBountyRole } = require("./roleHandler");

// --- ФУНКЦИЯ ЗА ЗАРЕЖДАНЕ НА ГЕРОИТЕ (Hot Reload) ---
function getHeroes() {
    try {
        // Използваме path.join, за да сме сигурни, че намира папката 'data'
        const filePath = path.join(__dirname, "../data/heroes.json"); 
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("❌ ГРЕШКА ПРИ ЧЕТЕНЕ НА heroes.json:", err.message);
        return {}; // Връща празен обект, за да не крашне бота
    }
}

async function handleCommands(msg, pool) {
    const content = msg.content.trim();
    const args = content.split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // --- 1. КОМАНДА: !help (ПЪЛНО МЕНЮ) ---
    if (cmd === "!help") {
        const helpEmbed = new EmbedBuilder()
            .setTitle("🏴‍☠️ Sailing Kingdom - Command Manual")
            .setDescription("Welcome aboard! Here are all the tools available to our crew:")
            .setColor("#00AE86")
            .addFields(
                { 
                    name: "🌐 AI Translation System", 
                    value: "• **Auto:** Write in any language in `#ai-translator` for 🇺🇸 English.\n• **Reply:** Reply to a message in English to translate it back." 
                },
                { 
                    name: "📢 Communication (Admin)", 
                    value: "• `!say <msg>` - Send a message through the bot.\n• `!sendto #channel <msg>` - Send a message to a specific channel." 
                },
                { 
                    name: "💰 Bounty System", 
                    value: "• `!wanted [@user]` - Show wanted poster.\n• `!setbounty @user <amt>` - Set reward & role (Admin).\n• `!resetbounty @user` - Reset reward & role (Admin)." 
                },
                { 
                    name: "⚔️ Heroes & Guides", 
                    value: "• `!hero <name>` - Get guide (Only in `#unit-build`).\n• `!hero-list` - See all available heroes.\n"+
                         "• `!mania-help` - Show the mania guide."
                },
                { 
                    name: "⏰ Reminders", 
                    value: "• `!remind <cron> <msg>` - Set custom reminder.\n• `!reminders` - List your reminders.\n• `!allreminders` - View all schedules.\n• `!cron` — Show the timing & cron guide." 
                },
                {
                    name: "🎖️ Role Management (Admin)", 
                    value: "• `!addrole @user <Role>` - Assign crew role.\n" + 
                        "• ` !removerole @user <Role>` - Remove crew role.\n" +
                     "• `!addroleallts @role` — (Admin) Add role to everyone with **ᐪˢ☠️**.\n" + 
                       "• `!addroleallgm @role` — (Admin) Add role to everyone with **ᴳᴹ☠️**."
},
                { 
                    name: "🧹 Moderation", 
                    value: "• `!clear <1-100>` - Bulk delete messages (Admin)." 
                }
            )
            .setFooter({ text: "Sailing Kingdom | Official Bot Guide" })
            .setTimestamp();

        return msg.reply({ embeds: [helpEmbed] });
    }


// --- 2.1 КОМАНДА: !hero-list ---
if (cmd === "!hero-list") {
    // Проверка дали командата се използва в правилния канал
    if (msg.channel.name !== "│🛠️│unit-build") return msg.reply("❌ Use #│🛠️│unit-build channel!");
    
    const heroesData = getHeroes();
    const allKeys = Object.keys(heroesData).sort(); // Сортираме имената по азбучен ред

    // Разделяме героите на две групи според това дали съдържат "-cultiv1"
    const mainBuilds = allKeys.filter(name => !name.toLowerCase().includes("-cultiv1"));
    const cultiBuilds = allKeys.filter(name => name.toLowerCase().includes("-cultiv1"));

    // Функция за вертикално форматиране със заглавия и номерация
    const formatList = (list) => {
        if (list.length === 0) return "---";
        // Правим списък: 1. име, 2. име... на нов ред (\n)
        return list.map((name, index) => `**${index + 1}.** \`${name}\``).join("\n");
    };

    const listEmbed = new EmbedBuilder()
        .setTitle("📜 OP: Sailing Kingdom - Hero Roster")
        .setColor("#00AE86")
        .setDescription("Use `!hero <name>` to view a detailed build.")
        .addFields(
            { 
                name: "🔵 Main Builds", 
                value: formatList(mainBuilds), 
                inline: true 
            },
            { 
                name: "🟡 Culti V1 Variants", 
                value: formatList(cultiBuilds), 
                inline: true 
            }
        )
        .setFooter({ text: `Total Heroes: ${allKeys.length} | Build System` })
        .setTimestamp(); // Добавяме клеймо за време

    return msg.reply({ embeds: [listEmbed] });
}





            // --- 2.2 КОМАНДА: !hero ---
    if (cmd === "!hero") {
    if (msg.channel.name !== "│🛠️│unit-build") return msg.reply("❌ Use #│🛠️│unit-build!");
    if (!args[0]) return msg.reply("⚠️ Specify hero! Example: `!hero mihawk`.");

    const heroesData = getHeroes();
    
    // 1. Вземаме целия вход (в случай че има интервали) и го правим малък
    const inputName = args.join("-").toLowerCase(); 

    // 2. Търсим ключа в JSON файла, като игнорираме малки/големи букви
    const heroKey = Object.keys(heroesData).find(key => key.toLowerCase() === inputName);
    const hero = heroesData[heroKey];

    if (!hero) return msg.reply(`❌ Hero **${args.join(" ")}** not found! Use \`!hero-list\`.`);

    console.log("Link loaded from JSON:", hero.image);
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



    // --- 3. КОМАНДА: !remind ---
if (cmd === "!remind") {
    // Търсим канала 'reminders' по име
    const targetCh = msg.guild.channels.cache.find(ch => ch.name === "│📅│reminders");
    
    // Проверка за наличие на канал и достатъчно аргументи (5 за cron + съобщение)
    if (!targetCh || args.length < 6) {
        return msg.reply("❌ Usage: `!remind 0 12 * * * Your Message` (Make sure #reminders exists)");
    }

    const cronExpr = args.slice(0, 5).join(" "); // Взима "0 12 * * *"
    const text = args.slice(5).join(" ");       // Взима остатъка като съобщение

    if (!isValidCron(cronExpr)) return msg.reply("❌ Invalid Cron format!");

    try {
        // Генерираме уникално ID чрез текущото време (Date.now())
        const reminderId = Date.now(); 

        // ТУК Е ПОПРАВКАТА: Добавяме масива с данните СЛЕД заявката
        await pool.query(
            "INSERT INTO reminders (id, cron, message, channel_id, owner_id) VALUES ($1, $2, $3, $4, $5)",
        [reminderId, cronExpr, text, targetCh.id, msg.author.id]
    );

        msg.reply(`✅ Reminder set for <#${targetCh.id}> at \`${cronExpr}\`!`);
    } catch (err) { 
        console.error("❌ DB Error during !remind:", err.message);
        msg.reply("❌ Database Error. Check bot logs."); 
    }
}

     // --- 4. КОМАНДА: !reminders ---
    if (cmd === "!reminders") {
        try {
            const res = await pool.query("SELECT * FROM reminders ORDER BY id ASC"); 
            if (res.rows.length === 0) {
            return msg.reply("📋 **Dynamic Reminders:** None.");
            }
            let list = res.rows.map(r => `ID: \`${r.id}\` | \`${r.cron}\` | ${r.message}`).join("\n");
            // Проверка за лимита от 2000 символа на Discord
            if (list.length > 1950) {
                list = list.substring(0, 1947) + "...";
            }     return msg.reply("📋 **Dynamic Reminders:**\n" + list);
        }         catch (err) {console.error(err);
                return msg.reply("❌ Грешка при четене от базата данни.");
        }
    }

    
    // 5. КОМАНДА: !allreminders ---
    if (cmd === "!allreminders") {
    try {
        const res = await pool.query("SELECT * FROM reminders ORDER BY id ASC");
        // 5.1. Обработка на ДИНАМИЧНИ напомняния
        const dynamicList = res.rows.map(r => `ID: \`${r.id}\` | \`${r.cron}\` | ${r.message}`).join("\n") || "None";
        // 5.2. Обработка на СТАТИЧНИ напомняния (Важно!)
        let staticListRaw = staticReminders.map((r, i) => {
            // Извикваме функцията, ако е такава, за да вземем чист текст
            const msgText = typeof r.message === 'function' ? r.message() : r.message;
            return `\`${r.cron}\` | ${msgText}`;
        });
        // 5.3. Създаваме Ембеда
        const embed = new EmbedBuilder()
            .setTitle("📋 All Scheduled Events")
            .setColor("#F1C40F");
        // 5.4. Тъй като статичният списък е огромен, го разделяме на части (chunks)
        // Discord позволява до 1024 символа на field.value
        let currentFieldContent = "";
        let fieldCount = 1;
        for (const item of staticListRaw) {
            // Ако добавянето на новия ред ще премине лимита от 1000 символа, правим нов field
            if ((currentFieldContent + item).length > 1000) {
                embed.addFields({ name: `📌 Static (Part ${fieldCount})`, value: currentFieldContent });
                currentFieldContent = "";
                fieldCount++;
            }    currentFieldContent += item + "\n";
        }
         // Добавяме последната част от статичните, ако има останало
        if (currentFieldContent) {
        embed.addFields({ name: `📌 Static (Part ${fieldCount})`, value: currentFieldContent });
        }
        // 5.5. Добавяме динамичните накрая (режем ги на 1024, ако са много)
        const safeDynamic = dynamicList.length > 1024 ? dynamicList.substring(0, 1021) + "..." : dynamicList;
        embed.addFields({ name: "⏰ Dynamic", value: safeDynamic });
        return msg.reply({ embeds: [embed] });} 
        catch (err) {
        console.error("CRASH PREVENTED:", err);
        return msg.reply("❌ Грешка при показване на списъка. Провери конзолата!");
    }
}

    // --- КОМАНДА: !say ---
    if (cmd === "!say") {
        // Проверка за администраторски права
        if (!msg.member.permissions.has("Administrator")) {
            return msg.reply("🏴‍☠️ Only the Captain (Administrator) can use this command!");
        }

        // Вземане на текста след командата
        const content = args.join(" ");

        if (!content) {
            return msg.reply("❌ You need to write a message! Example: `!say Hello Pirates!`");
        }

        // Изтриване на съобщението на потребителя
        try {
            await msg.delete();
        } catch (err) {
            console.log("Missing permissions to delete messages.");
        }

        // Ботът изпраща съобщението
        return msg.channel.send(content);
    }

        // --- КОМАНДА: !sendto ---
    if (cmd === "!sendto") {
        // 1. Проверка за права (трие се след 2 сек)
        if (!msg.member.permissions.has("Administrator")) {
            return msg.reply("🏴‍☠️ Only the Captain can redirect messages!")
                .then(m => setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 2000));
        }

        const targetChannel = msg.mentions.channels.first();
        const content = args.slice(1).join(" ");

        // 2. Проверка за тагнат канал (трие се след 2 сек)
        if (!targetChannel) {
            return msg.reply("❌ You must tag a channel!")
                .then(m => setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 2000));
        }

        // 3. Проверка за съдържание (трие се след 2 сек)
        if (!content) {
            return msg.reply("❌ Please provide a message!")
                .then(m => setTimeout(() => { m.delete().catch(() => {}); msg.delete().catch(() => {}); }, 2000));
        }

        try {
            // Изпращане в целевия канал
            await targetChannel.send(content);

            // Пращаме потвърждение и го трием ЗАЕДНО с командата след 2 секунди
            const replyMsg = await msg.reply(`✅ Message successfully sent to ${targetChannel}`);
            
            setTimeout(() => {
                replyMsg.delete().catch(() => {}); // Трий потвърждението
                msg.delete().catch(() => {});      // Трий твоята команда (!sendto)
            }, 3000); 

        } catch (err) {
            console.error(err);
            const errMsg = await msg.reply("❌ I cannot send messages to that channel!");
            setTimeout(() => {
                errMsg.delete().catch(() => {});
                msg.delete().catch(() => {});
            }, 3000);
        }
    }


    // --- 6. КОМАНДА: !delete ---
    if (cmd === "!delete") {
        if (!msg.member.permissions.has("Administrator")) return msg.reply("❌ Only Admirals!");
        const id = args[0];
        if (!id) return msg.reply("❌ Usage: `!delete <id>`");
        await pool.query("DELETE FROM reminders WHERE id = $1", [id]);
        return msg.reply(`🗑️ Deleted reminder \`${id}\`.`);
    }

    // --- 7. BOUNTY КОМАНДА: !wanted (СТИЛИЗИРАН ПЛАКАТ) ---
if (cmd === "!wanted") {
    const bountyChannel = msg.guild.channels.cache.find(ch => ch.name === "│💰│bounties");
    if (!bountyChannel) return msg.reply("❌ Error: Channel `bounties` not found!");

    // 7.1. Дефинираме таргета (споменат или автора)
    const target = msg.mentions.users.first() || msg.author;
    
    try {
        const res = await pool.query("SELECT bounty FROM users WHERE user_id = $1", [target.id]);
        const bounty = res.rows.length > 0 ? res.rows[0].bounty : 0;

        // 7.2. СЪЗДАВАМЕ ЕМБЕДА 
        const wantedEmbed = new EmbedBuilder()
            .setAuthor({ name: "⚓ MARINE HEADQUARTERS" })
            .setTitle("☠️ W A N T E D ☠️")
            .setDescription(`**NAME: ${target.username.toUpperCase()}**\n---------------------------------`)
            .setColor("#e67e22") 
            .addFields(
                { name: "💰 REWARD", value: `฿ **${Number(bounty).toLocaleString()}**`, inline: true },
                { name: "📜 STATUS", value: "🔴 **DEAD OR ALIVE**", inline: true }
            )
            // ПОПРАВКА ТУК: Използваме 'target', а не 'targetUser'
            .setImage(target.displayAvatarURL({ extension: 'png', dynamic: true, size: 1024 }))
            .setFooter({ text: "By order of the World Government" })
            .setTimestamp();

        // 7.3. ИЗПРАЩАМЕ В #BOUNTIES
        await bountyChannel.send({ content: `📜 New Bounty Issued for ${target}!`, embeds: [wantedEmbed] });

        // 7.4. КРАТЪК ОТГОВОР И ПОЧИСТВАНЕ
        const reply = await msg.reply(`✅ Your Wanted poster has been created in <#${bountyChannel.id}>!`);
        
        setTimeout(() => {
            msg.delete().catch(() => {});
            reply.delete().catch(() => {});
        }, 10000);

    } catch (err) {
        console.error("Wanted error:", err.message);
        msg.reply("❌ Something went wrong while creating the poster.");
    }
}




    // --- 8. BOUNTY COMMAND: !setbounty <user> <amount> (ADMIN/MOD) ---
if (cmd === "!setbounty") {
    // 🛡️ 1. SECURITY CHECK FIRST (Replace with your Moderator Role ID)
    const modRoleId = "1494368806133301428"; 
    const hasModRole = msg.member.roles.cache.has(modRoleId);
    const hasAdminPerm = msg.member.permissions.has("Administrator");

    if (!hasModRole && !hasAdminPerm) {
        // We reply BEFORE deleting the command
        return msg.reply("❌ Access Denied! Administrators or Moderators only.")
            .then(m => {
                setTimeout(() => m.delete().catch(() => {}), 5000);
                msg.delete().catch(() => {}); // Delete the user's command now
            });
    }

    // 🛡️ 2. DELETE COMMAND (only if authorized)
    msg.delete().catch(() => {}); 

    const target = msg.mentions.members.first();
    const amount = args[1]; // Ensure you take the amount from the correct argument index

    if (!target || isNaN(amount)) {
        return msg.channel.send("❌ Usage: `!setbounty @user <amount>`");
    }

    try {
        await pool.query(
            "INSERT INTO users (user_id, bounty, username) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET bounty = $2, username = $3",
            [target.id, amount, target.user.username]
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

// --- 9. BOUNTY COMMAND: !resetbounty (ADMIN/MOD) ---
if (cmd === "!resetbounty") {
    // 🛡️ SECURITY CHECK
    const modRoleId = "123456789012345678"; 
    const hasModRole = msg.member.roles.cache.has(modRoleId);
    const hasAdminPerm = msg.member.permissions.has("Administrator");

    if (!hasModRole && !hasAdminPerm) {
        return msg.reply("❌ Access Denied! Admirals or Moderators only.")
            .then(m => {
                setTimeout(() => m.delete().catch(() => {}), 5000);
                msg.delete().catch(() => {});
            });
    }

    msg.delete().catch(() => {}); 

    const target = msg.mentions.members.first();
    if (!target) return msg.channel.send("❌ Please mention a user to reset.");
    
    try {
        await pool.query("UPDATE users SET bounty = 0 WHERE user_id = $1", [target.id]);

        const adminLog = msg.guild.channels.cache.find(ch => ch.name === "admin-logs");
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
    // --- 10. МОДЕРАЦИЯ: !clear (ДОСТЪПНА НАВСЯКЪДЕ) ---
// --- МОДЕРАЦИЯ: !clear ---
if (cmd === "!clear") {
    // 1. Проверка на права
    if (!msg.member.permissions.has("ManageMessages") && !msg.member.permissions.has("Administrator")) {
        const err = await msg.reply("❌ Only Admirals have the authority to clean the deck!");
        return setTimeout(() => { 
            err.delete().catch(()=>{}); 
            msg.delete().catch(()=>{}); 
        }, 5000);
    }

    // 2. Вземане на броя (args[0])
    const amount = parseInt(args[0]);

    // 3. Валидация на числото
    if (isNaN(amount) || amount < 1 || amount > 100) {
        return msg.reply("⚠️ Please specify a number between 1 and 100. Example: `!clear 50`").then(m => {
            setTimeout(() => { m.delete().catch(()=>{}); msg.delete().catch(()=>{}); }, 5000);
        });
    }

    // 4. Изпълнение и логване
    try {
        // Изтриваме съобщенията (+1 заради самата команда)
        const deletedMessages = await msg.channel.bulkDelete(amount + 1, true);
        
        // Извикваме лога, подавайки съобщенията, канала и човека, който е пуснал командата
        await logBulkDelete(deletedMessages, msg.channel, msg.author);
        
        // Кратко потвърждение в чата
        const success = await msg.channel.send(`🧹 **Cleaning complete!** Deleted ${deletedMessages.size - 1} messages.`);
        setTimeout(() => success.delete().catch(()=>{}), 3000);
        
    } catch (err) {
        console.error("Clear error:", err.message);
        msg.reply("❌ Failed to delete messages. (Messages older than 14 days cannot be bulk deleted).");
    }
}




// --- КОМАНДА: !mania-help ---
if (cmd === "!mania-help") {
    const { EmbedBuilder } = require('discord.js');

    const helpEmbed = new EmbedBuilder()
        .setTitle("🏴‍☠️ MANIA COMMANDS CENTER")
        .setDescription("Use these commands to organize the crew and prepare for battle!")
        .setColor("#FF4500")
        .setThumbnail("https://giphy.com")
        .addFields(
            { 
                name: "📝 mania-plan g1/g2", 
                value: "Starts the daily sign-up. It pings @everyone,only Guild1 or Guild2  and adds ✅/❌ reactions. The bot saves this post to track who is available." 
            },
            { 
                name: "📜 mania-list g1/g2", 
                value: "Checks the reactions from the active plan. It lists confirmed players and **pings anyone who hasn't voted yet!** 🔔" 
            },
            { 
                name: "⚔️ mania-strategy", 
                value: "Publishes the final battle plan. \n**Format:** `Boss Name - @Player1 @Player2` \n*Each boss must be on a new line with a dash `-`.*" 
            }
        )
        .setFooter({ text: "Captain's Tip: Use mania-list to find missing voters! 🏴‍☠️" })
        .setTimestamp();

    return msg.reply({ embeds: [helpEmbed] });
}







    
    // --- COMMAND: !cron (English Guide) ---
if (cmd === "!cron" || cmd === "!cronhelp") {
    // Getting current server time to avoid time zone confusion
    const serverTime = new Date().toLocaleTimeString("en-GB", { 
        timeZone: "Europe/London", 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    const cronEmbed = new EmbedBuilder()
        .setTitle("📜 Pirate's Timing Manual (Cron Guide)")
        .setDescription(`Use this format for \`!remind\` and strategy scheduling.\n**Current Server Time (London):** \`${serverTime}\``)
        .setColor("#3498db")
        .setThumbnail("https://imgur.com") // Optional: a clock or compass icon
        .addFields(
            { 
                name: "⏳ The 5-Star Format: `* * * * *`", 
                value: 
                    "1️⃣ **Minute** (0-59)\n" +
                    "2️⃣ **Hour** (0-23)\n" +
                    "3️⃣ **Day** of Month (1-31)\n" +
                    "4️⃣ **Month** (1-12)\n" +
                    "5️⃣ **Day of Week** (0-6, 0=Sunday)" 
            },
            { 
                name: "💡 Practical Examples:", 
                value: 
                    "• `0 12 * * *` — Every day at **12:00**\n" +
                    "• `30 19 * * 1-5` — Every weekday at **19:30**\n" +
                    "• `*/15 * * * *` — Every **15 minutes**\n" +
                    "• `0 12-20/2 * * *` — From 12:00 to 20:00, **every 2 hours**"
            },
            {
                name: "⚓ Pro-Tip",
                value: "Use [crontab.guru](https://crontab.guru) to test your expressions before setting them in the bot!"
            }
        )
        .setFooter({ text: "Example: !remind 0 21 * * * It's time for the Boss Raid!" })
        .setTimestamp();

    return msg.channel.send({ embeds: [cronEmbed] });
}

}


module.exports = { handleCommands };
