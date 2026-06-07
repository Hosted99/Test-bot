const Groq = require("groq-sdk");
const { Client, GatewayIntentBits, EmbedBuilder, Events, AuditLogEvent } = require("discord.js");
const path = require('path'); 
const cron = require('node-cron');
const https = require('https'); // Добавено за VirusTotal API заявките
const shipSystem = require('./utilities/ship.js');
const { pool, initDB } = require("./utilities/db");
const { initGuildConfigTable, getConfig, setConfig, getAllConfig, getChannel, getRole, preloadAllConfigs } = require("./utilities/guildConfig");

const startBirthdayTimer = require('./utilities/bday.js');
const levelingSystem = require('./utilities/leveling.js');
const { initSchedulers, handleManiaPlan, handleManiaList, handleManiaStrategy, handleManiaHelp, handleManiaDM } = require("./utilities/scheduler");
const { handleCommands } = require("./utilities/commandHandler");
const { handleSpecialChannels } = require("./utilities/specialChannels");
const { handleNewMember, handleRoleCommands } = require("./utilities/roleHandler");
const { sendBotManual } = require("./utilities/infoHandler");
const { logDeletedMessage } = require("./utilities/logger");
const { initTranslateSystem } = require('./utilities/translate');
const memeSystem = require('./utilities/meme.js');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const translationCooldown = new Set();

function cleanDiscordContent(content) {
    if (!content) return "";
    const cleaned = content
        .replace(/<a?:\w+:\d+>/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .trim();
    const hasLetters = /[a-zA-Zа-яА-Я]/.test(cleaned);
    if (!hasLetters) return "";
    return cleaned;
}

// === ФУНКЦИЯ ЗА ПРОВЕРКА НА ЛИНКОВЕ ЧРЕЗ VIRUSTOTAL API ===
function checkLinkWithVirusTotal(urlToCheck) {
    return new Promise((resolve) => {
        const apiKey = process.env.VIRUSTOTAL_API_KEY;
        if (!apiKey) {
            console.error("⚠️ VIRUSTOTAL_API_KEY липсва в .env файла! Всички линкове се приемат за безопасни.");
            return resolve(true); 
        }

        // Превръщаме URL адреса в Base64 без запълващи '=' символи (както изисква VirusTotal v3)
        const urlId = Buffer.from(urlToCheck).toString('base64').replace(/=/g, '');

        const options = {
            hostname: 'www.virustotal.com',
            path: `/api/v3/urls/${urlId}`,
            method: 'GET',
            headers: {
                'x-apikey': apiKey,
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        const json = JSON.parse(data);
                        const stats = json.data.attributes.last_analysis_stats;
                        
                        // Ако има дори 1 глас за malicious или suspicious, блокираме линка
                        if (stats.malicious > 0 || stats.suspicious > 0) {
                            return resolve(false); 
                        }
                    } else if (res.statusCode === 404) {
                        console.log(`ℹ️ Линка не е намерен в базата на VirusTotal, приема се за безопасен.`);
                    }
                    resolve(true); 
                } catch (e) {
                    console.error("Грешка при парсване на VirusTotal отговор:", e.message);
                    resolve(true); 
                }
            });
        });

        req.on('error', (err) => {
            console.error("VirusTotal API грешка:", err.message);
            resolve(true);
        });

        req.end();
    });
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildModeration
    ]
});

const http = require('http');
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running!');
}).listen(port);
console.log(`Monitoring server started on port ${port}`);

async function startSystem() {
    try {
        await initDB();
        await initGuildConfigTable(); 
        console.log("✅ Database is ready.");
        client.login(process.env.DISCORD_TOKEN); 
    } catch (err) {
        console.error("❌ Critical Startup Error:", err.message);
    }
}

client.once("clientReady", async () => {
    initSchedulers(client, pool);
    levelingSystem(client, { pool });
    initTranslateSystem(client); 
    console.log(`🤖 Online as: ${client.user.tag}`);

    client.guilds.cache.forEach(guild => {
        guild.members.fetch().then(() => console.log(`✅ Cached members for: ${guild.name}`));
    });

    cron.schedule('00 10 * * 2,5', async () => {
        client.guilds.cache.forEach(async (guild) => {
            const targetChannel = await getChannel(guild, 'belly_rush_channel');
            if (targetChannel) {
                try {
                    await shipSystem.sendShipPanelDirect(targetChannel);
                    console.log(`✅ Sent Belly Rush panel to #${targetChannel.name} in ${guild.name}`);
                } catch (err) {
                    console.error(`❌ Failed to send Belly Rush panel in ${guild.name}:`, err.message);
                }
            }
        });
    }, { timezone: "Europe/London" });

    client.guilds.cache.forEach(async (guild) => {
        await sendBotManual(guild).catch(err => console.log("Грешка при Manual msg:", err.message));

        const botChannel = await getChannel(guild, 'bot_status_channel');
        if (botChannel) {
            const aliveEmbed = new EmbedBuilder()
                .setTitle("📡 System Status: Online")
                .setDescription("🏴‍☠️ **The Captain is back on the deck!**\nAll systems are operational and the seas are under watch..")
                .setColor("#00ff00")
                .setTimestamp();
            await botChannel.send({ embeds: [aliveEmbed] }).catch(err => console.log("Грешка при Alive msg:", err.message));
        }
    });
});

client.on("messageDelete", async (message) => {
    await logDeletedMessage(message);
});

client.on("messageDeleteBulk", async (messages) => {
    console.log(`[Log] Bulk delete: ${messages.size} messages`);
});

client.on("guildMemberAdd", async (member) => {
    console.log(`📡 Нов потребител влезе: ${member.user.tag}`);
    await handleNewMember(member);
});

client.on("messageCreate", async (msg) => {

    if (msg.guild) {
        const restrictedChannelId = await getConfig(msg.guild.id, 'restricted_channel');
        const adminLogChannelId = await getConfig(msg.guild.id, 'admin_log_channel');
        const protectedUsersRaw = await getConfig(msg.guild.id, 'protected_users');
        const PROTECTED_USERS = protectedUsersRaw ? protectedUsersRaw.split(',') : [];

        if (restrictedChannelId && msg.channel.id === restrictedChannelId) {
            const isSlashCommand = msg.interaction !== null;
            const mentionedProtected = PROTECTED_USERS.filter(id => msg.mentions.users.has(id));
            const hasEveryone = msg.mentions.everyone;

            if (isSlashCommand && (mentionedProtected.length > 0 || hasEveryone)) {
                try {
                    const triggerUser = msg.interaction.user; 
                    const targetName = hasEveryone ? "@everyone" : mentionedProtected.map(id => `<@${id}>`).join(", ");
                    await msg.delete().catch(() => {});

                    if (adminLogChannelId) {
                        const logChannel = msg.guild.channels.cache.get(adminLogChannelId);
                        if (logChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setColor('#ff9900')
                                .setTitle('🛡️ Restricted Mention Blocked')
                                .addFields(
                                    { name: 'User who used command:', value: `${triggerUser.tag}`, inline: true },
                                    { name: 'Protected User targeted:', value: targetName, inline: true }
                                )
                                .setTimestamp();
                            await logChannel.send({ embeds: [logEmbed] });
                        }
                    }
                    return;
                } catch (err) { console.log("Error deleting/logging:", err.message); }
            }
        }
    }
    
    if (msg.author.bot || !msg.guild) return;

    // =================================================================
    // СИСТЕМА ЗА АВТОМАТИЧНА ПРОВЕРКА НА ЛИНКОВЕ И ИЗПРАЩАНЕ ЧРЕЗ WEBHOOK
    // =================================================================
    const linkRegex = /(https?:\/\/[^\s]+)/g;
    if (linkRegex.test(msg.content)) {
        try {
            const foundLinks = msg.content.match(linkRegex);
            const originalContent = msg.content;
            const author = msg.author;
            const member = msg.member;

            // 1. Изтриваме оригиналното съобщение на секундата
            await msg.delete().catch(() => {});

            // 2. Пускаме проверка в VirusTotal в заден план
            const isSafe = await checkLinkWithVirusTotal(foundLinks[0]);

            if (isSafe) {
                // 3. Търсим съществуващ Webhook на бота в този канал или създаваме нов
                const webhooks = await msg.channel.fetchWebhooks().catch(() => null);
                let webhook = webhooks ? webhooks.find(wh => wh.name === "CaptainLinkScanner") : null;

                if (!webhook) {
                    webhook = await msg.channel.createWebhook({
                        name: 'CaptainLinkScanner',
                        avatar: client.user.displayAvatarURL(),
                        reason: 'Необходим за препращане на проверени сигурни линкове.'
                    }).catch(err => console.error("Не можах да създам Webhook в канала:", err.message));
                }

                if (webhook) {
                    // Изпращаме оригиналния текст маскиран с профила на потребителя
                    await webhook.send({
                        content: originalContent,
                        username: member ? member.displayName : author.username,
                        avatarURL: author.displayAvatarURL({ dynamic: true })
                    });
                } else {
                    // Резервен вариант в случай, че липсват права за Webhook
                    await msg.channel.send(`✅ **Сигурен линк от ${author}:**\n${originalContent}`);
                }
            } else {
                // Линкът е опасен (Malicious / Phishing)
                const warningMsg = await msg.channel.send(`❌ ${author}, съобщението ти беше блокирано автоматично, тъй като съдържа вредоносен или фишинг линк!`);
                setTimeout(() => warningMsg.delete().catch(() => {}), 10000); // Почистваме предупреждението след 10 сек

                // Логваме опита за фишинг в администраторския канал на сървъра
                const adminLogChannelId = await getConfig(msg.guild.id, 'admin_log_channel');
                if (adminLogChannelId) {
                    const logChannel = msg.guild.channels.cache.get(adminLogChannelId);
                    if (logChannel) {
                        const alertEmbed = new EmbedBuilder()
                            .setColor('#ff0000')
                            .setTitle('🚨 Засечена Кибер Заплаха (Опасен Линк)')
                            .addFields(
                                { name: 'Потребител:', value: `${author.tag} (\`${author.id}\`)`, inline: true },
                                { name: 'Канал:', value: `<#${msg.channel.id}>`, inline: true },
                                { name: 'Хванат линк:', value: `\`${foundLinks[0]}\`` },
                                { name: 'Пълно съобщение:', value: `\`\`\`${originalContent}\`\`\`` }
                            )
                            .setTimestamp();
                        await logChannel.send({ embeds: [alertEmbed] }).catch(() => {});
                    }
                }
            }
            return; // Спираме по-нататъшната обработка на съобщението
        } catch (err) {
            console.error("Критична грешка в Линк Скенера:", err.message);
        }
    }
    // =================================================================

    try { await shipSystem.handleMessage(msg); } catch (e) { console.error("Ship system error:", e); }

    const lowerContent = msg.content.toLowerCase().trim();

    if (lowerContent.startsWith("mania-plan")) return await handleManiaPlan(msg);
    if (lowerContent.startsWith("mania-list")) return await handleManiaList(msg);
    if (lowerContent.startsWith("mania-dm")) return await handleManiaDM(msg);
    if (lowerContent.startsWith("mania-strategy")) return await handleManiaStrategy(msg, pool);

    if (msg.content.startsWith("!")) {
        const content = msg.content.trim();
        const args = content.split(/\s+/);
        const cmd = args.shift().toLowerCase();

        if (cmd === "!addrole" || cmd === "!removerole" || cmd === "!addroleallts" || cmd === "!addroleallgm") {
            return await handleRoleCommands(msg, cmd, args);
        }

        if (cmd === "!setup") {
            if (!msg.member.permissions.has('Administrator')) return;
            const targetChannel = await getChannel(msg.guild, 'belly_rush_channel');
            if (targetChannel) {
                await shipSystem.sendShipPanelDirect(targetChannel);
                return await msg.delete().catch(() => {});
            } else {
                return msg.reply("❌ Error: belly_rush_channel не е конфигуриран. Използвай `!setconfig belly_rush_channel <channel_id>`");
            }
        }

        if (cmd === "!setconfig") {
            if (!msg.member.permissions.has('Administrator')) {
                return msg.reply("❌ Only administrators can configure the bot.");
            }
            const key = args[0];
            const value = args[1];
            if (!key || !value) {
                return msg.reply("❌ Format: `!setconfig <ключ> <стойност>`\n\nAvailable keys:\n" +
                "`level_up_channel` — канал за level-up\n" +
                "`log_channel` — канал за XP логове\n" +
                "`stats_channel` — канал за !top\n" +
                "`admin_log_channel` — канал за мод логове\n" +
                "`welcome_channel` — канал за нови членове\n" +
                "`belly_rush_channel` — канал за Belly Rush\n" +
                "`reminders_channel` — канал за напомняния\n" +
                "`repair_channel` — канал за repair-ship\n" +
                "`translator_channel` — канал за AI превод\n" +
                "`bot_status_channel` — канал за Online/Offline статус\n" +
                "`bot_info_channel` — канал за мануала с командите\n" +
                "`unit_build_channel` — канал за !hero команди\n" +
                "`bounty_channel` — канал за !wanted плакати\n" +
                "`rookies_role` — роля за нови членове\n" +
                "`player_role` — роля след верификация\n" +
                "`mod_role` — роля за модератори\n" +
                "`restricted_channel` — канал с ограничения за менции\n" +
                "`protected_users` — защитени потребители (id1,id2)\n" +
                "`bday_channel` — канал за birthday съобщения\n" +
                "`bday_user` — user ID за birthday\n" +
                "`mania_main_channel` — главен канал за Mania известия (опционален)");
            }
            await setConfig(msg.guild.id, key, value, msg.guild.name);
            return msg.reply(`✅ Configuration saved: \`${key}\` = \`${value}\``);
        }

        if (cmd === "!getconfig") {
            if (!msg.member.permissions.has('Administrator')) {
                return msg.reply("❌ Only administrators can view the configuration.");
            }
            const config = await getAllConfig(msg.guild.id);
            const entries = Object.entries(config);
            if (entries.length === 0) {
                return msg.reply("⚠️ No configuration for this server. Use `!setconfig <ключ> <стойност>`");
            }
            const configText = entries.map(([k, v]) => `\`${k}\`: \`${v}\``).join('\n');
            const configEmbed = new EmbedBuilder()
                .setTitle(`⚙️ Configuration for ${msg.guild.name}`)
                .setDescription(configText)
                .setColor('#3498db')
                .setTimestamp();
            return msg.reply({ embeds: [configEmbed] });
        }

        if (cmd === "!translate-enable") {
            const inputPassword = args[0];
            const storedPassword = process.env.TRANSLATE_PASSWORD;
            console.log(`[Translate] inputPassword: "${inputPassword}", storedPassword: "${storedPassword}", match: ${inputPassword === storedPassword}`);
            if (!storedPassword) {
                return msg.reply('❌ TRANSLATE_PASSWORD not set in .env!');
            }
            if (inputPassword !== storedPassword) {
                return msg.reply(`❌ Wrong password! Got: "${inputPassword}"`);
            }
            await setConfig(msg.guild.id, 'flag_translate_enabled', 'true', msg.guild.name);
            return msg.reply('✅ **Flag translation activated!** React with a flag emoji to translate any message.');
        }

        if (cmd === "!translate-disable") {
            if (!msg.member.permissions.has('Administrator')) return;
            await setConfig(msg.guild.id, 'flag_translate_enabled', 'false', msg.guild.name);
            return msg.reply('🔒 **Flag translation disabled.**');
        }

        if (cmd === "!auto-translate-enable") {
            const inputPassword = args[0];
            const storedPassword = process.env.TRANSLATE_PASSWORD;
            if (!storedPassword) return msg.reply('❌ TRANSLATE_PASSWORD not set in .env!');
            if (inputPassword !== storedPassword) {
                return msg.reply('❌ Wrong password!')
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
            }
            await setConfig(msg.guild.id, 'auto_translate_enabled', 'true', msg.guild.name);
            return msg.reply('✅ **Auto-translate activated!** Non-English messages will be translated to English automatically.');
        }

        if (cmd === "!auto-translate-disable") {
            if (!msg.member.permissions.has('Administrator')) return;
            await setConfig(msg.guild.id, 'auto_translate_enabled', 'false', msg.guild.name);
            return msg.reply('🔒 **Auto-translate disabled.**');
        }

        if (cmd === "!mania-addguild") {
            if (!msg.member.permissions.has('Administrator')) return;
            const key = args[0];
            const roleId = msg.mentions.roles.first()?.id;
            const mentionedChannels = [...msg.mentions.channels.values()];
            const planChannelId = mentionedChannels[0]?.id;
            const notifyChannelId = mentionedChannels[1]?.id;
            if (!key || !roleId || !planChannelId) {
                return msg.reply("❌ Usage: `!mania-addguild <key> @role #plan-channel #notify-channel`\nExample: `!mania-addguild ts @ThousandSunny #mania-strategy #general`\n\n• `#plan-channel` — каналът където се гласува\n• `#notify-channel` — каналът където всички виждат известието");
            }
            await setConfig(msg.guild.id, `mania_role_${key}`, roleId, msg.guild.name);
            await setConfig(msg.guild.id, `mania_plan_channel_${key}`, planChannelId, msg.guild.name);
            if (notifyChannelId) await setConfig(msg.guild.id, `mania_notify_channel_${key}`, notifyChannelId, msg.guild.name);
            return msg.reply(`✅ Guild **${key.toUpperCase()}** added!\n🎭 Role: <@&${roleId}>\n📋 Plan channel: <#${planChannelId}>\n📣 Notify channel: ${notifyChannelId ? `<#${notifyChannelId}>` : '⚠️ not set'}`);
        }

        if (cmd === "!mania-removeguild") {
            if (!msg.member.permissions.has("Administrator")) return;
            const key = args[0];
            if (!key) return msg.reply("❌ Usage: `!mania-removeguild <key>`");
            const { deleteConfig } = require("./utilities/guildConfig");
            await deleteConfig(msg.guild.id, `mania_role_${key}`);
            await deleteConfig(msg.guild.id, `mania_plan_channel_${key}`);
            await deleteConfig(msg.guild.id, `mania_notify_channel_${key}`);
            return msg.reply(`✅ Guild **${key.toUpperCase()}** removed.`);
        }

        if (cmd === "!mania-guilds") {
            if (!msg.member.permissions.has("Administrator")) return;
            const { getAllConfig } = require("./utilities/guildConfig");
            const config = await getAllConfig(msg.guild.id);
            const maniaGuilds = Object.keys(config)
                .filter(k => k.startsWith("mania_role_"))
                .map(k => {
                    const key = k.replace("mania_role_", "");
                    const roleId = config[`mania_role_${key}`];
                    const planChId = config[`mania_plan_channel_${key}`];
                    const notifyChId = config[`mania_notify_channel_${key}`];
                    return `**${key.toUpperCase()}**\n🎭 Role: <@\&${roleId}>\n📋 Plan: ${planChId ? `<#${planChId}>` : "⚠️ not set"}\n📣 Notify: ${notifyChId ? `<#${notifyChId}>` : "⚠️ not set"}`;
                });
            if (maniaGuilds.length === 0) return msg.reply("⚠️ No mania guilds configured. Use `!mania-addguild`");
            const { EmbedBuilder: EB2 } = require("discord.js");
            const embed = new EB2().setTitle("⚔️ Mania Guilds").setDescription(maniaGuilds.join("\n\n")).setColor("#FF4500");
            return msg.reply({ embeds: [embed] });
        }

        if (cmd === "!checkconfig") {
            if (!msg.member.permissions.has("Administrator")) return;

            const { getAllConfig } = require("./utilities/guildConfig");
            const config = await getAllConfig(msg.guild.id);

            const allKeys = [
                { key: "level_up_channel",         desc: "Level-up съобщения",          type: "channel" },
                { key: "log_channel",               desc: "XP логове",                   type: "channel" },
                { key: "stats_channel",             desc: "!top класация",               type: "channel" },
                { key: "admin_log_channel",         desc: "Модерация логове",            type: "channel" },
                { key: "welcome_channel",           desc: "Нови членове",                type: "channel" },
                { key: "belly_rush_channel",        desc: "Belly Rush панел",            type: "channel" },
                { key: "belly_rush_roles_channel",  desc: "!want команди",               type: "channel" },
                { key: "reminders_channel",         desc: "Напомняния",                  type: "channel" },
                { key: "repair_channel",            desc: "Repair-ship",                 type: "channel" },
                { key: "translator_channel",        desc: "AI Преводач",                 type: "channel" },
                { key: "bot_status_channel",        desc: "Online/Offline статус",       type: "channel" },
                { key: "bot_info_channel",          desc: "Мануал с командите",          type: "channel" },
                { key: "unit_build_channel",        desc: "!hero команди",               type: "channel" },
                { key: "bounty_channel",            desc: "!wanted плакати",             type: "channel" },
                { key: "rules_channel",             desc: "Правила (welcome msg)",       type: "channel" },
                { key: "general_channel",           desc: "General chat (welcome msg)",  type: "channel" },
                { key: "rookies_role",              desc: "Роля за нови членове",        type: "role" },
                { key: "player_role",               desc: "Роля след верификация",       type: "role" },
                { key: "mod_role",                  desc: "Роля за модератори",          type: "role" },
                { key: "restricted_channel",        desc: "Канал с менции ограничения",  type: "channel" },
                { key: "protected_users",           desc: "Защитени потребители",        type: "text" },
                { key: "bday_channel",              desc: "Birthday канал",              type: "channel", optional: true },
                { key: "bday_user",                 desc: "Birthday потребител",         type: "text",    optional: true },
            ];

            const { EmbedBuilder } = require("discord.js");
            const configured = [];
            const missing = [];
            const optional = [];

            for (const item of allKeys) {
                const value = config[item.key];
                if (value) {
                    let display = value;
                    if (item.type === "channel") display = `<#${value}>`;
                    else if (item.type === "role") display = `<@&${value}>`;
                    configured.push(`✅ \`${item.key}\` — ${display}`);
                } else if (item.optional) {
                    optional.push(`⚪ \`${item.key}\` — ${item.desc}`);
                } else {
                    missing.push(`❌ \`${item.key}\` — ${item.desc}`);
                }
            }

            const maniaKeys = Object.keys(config).filter(k => k.startsWith("mania_role_"));
            if (maniaKeys.length > 0) {
                maniaKeys.forEach(k => {
                    const gKey = k.replace("mania_role_", "");
                    configured.push(`✅ Mania Guild: **${gKey.toUpperCase()}**`);
                });
            } else {
                missing.push(`❌ Mania гилдии — използвай \`!mania-addguild\``);
            }

            const { pool } = require("./utilities/db");
            const shipsRes = await pool.query("SELECT ship_name FROM ships WHERE guild_id = $1", [msg.guild.id]);
            if (shipsRes.rows.length > 0) {
                configured.push(`✅ Кораби: ${shipsRes.rows.map(r => `**${r.ship_name}**`).join(", ")}`);
            } else {
                missing.push(`❌ Кораби — използвай \`!ship-add <name> <emoji> @role\``);
            }

            const splitFields = (arr, title) => {
                const fields = [];
                let chunk = "";
                for (const line of arr) {
                    if ((chunk + line + "\n").length > 1000) {
                        fields.push({ name: fields.length === 0 ? title : `${title} (continued)`, value: chunk.trim() });
                        chunk = "";
                    }
                    chunk += line + "\n";
                }
                if (chunk) fields.push({ name: fields.length === 0 ? title : `${title} (continued)`, value: chunk.trim() });
                return fields;
            };

            const description = missing.length === 0
                ? "🎉 **Всичко е configured! Ботът е готов за работа.**"
                : `⚠️ **${missing.length} настройки missingт.** Използвай \`!setconfig <key> <value>\` to add them.`;

            const levelingStatus = config['leveling_enabled'];
            const translateStatus = config['flag_translate_enabled'];

            configured.push(
                levelingStatus === 'true'
                    ? '✅ `leveling` — 🟢 **Active** (XP system running)'
                    : '🔴 `leveling` — **Disabled** (use `!leveling-enable <password>` to activate)'
            );
            configured.push(
                translateStatus === 'true'
                    ? '✅ `flag_translate` — 🟢 **Active** (flag reactions translating)'
                    : '🔴 `flag_translate` — **Disabled** (use `!translate-enable <password>` to activate)'
            );

            const autoTranslateStatus = config['auto_translate_enabled'];
            configured.push(
                autoTranslateStatus === 'true'
                    ? '✅ `auto_translate` — 🟢 **Active** (non-English messages auto-translated)'
                    : '🔴 `auto_translate` — **Disabled** (use `!auto-translate-enable <password>` to activate)'
            );

            const embed = new EmbedBuilder()
                .setTitle(`⚙️ Config Check — ${msg.guild.name}`)
                .setDescription(description)
                .setColor(missing.length === 0 ? "#2ecc71" : "#e74c3c")
                .setTimestamp();

            if (configured.length > 0) {
                splitFields(configured, `✅ Configured (${configured.length})`).forEach(f => embed.addFields(f));
            }
            if (missing.length > 0) {
                splitFields(missing, `❌ Missing (${missing.length})`).forEach(f => embed.addFields(f));
            }
            if (optional.length > 0) {
                splitFields(optional, `⚪ Optional (${optional.length})`).forEach(f => embed.addFields(f));
            }

            return msg.reply({ embeds: [embed] });
        }

        return await handleCommands(msg, pool);
    } 

    const specialHandled = await handleSpecialChannels(msg, pool);
    if (specialHandled) return;

    const translatorChannelId = await getConfig(msg.guild.id, 'translator_channel');
    const isTranslatorChannel = translatorChannelId 
        ? msg.channel.id === translatorChannelId 
        : msg.channel.name === '│🌐│ai-translator'; 

    if (isTranslatorChannel) {
        if (msg.author.bot) return;
        const cleanedText = cleanDiscordContent(msg.content);
        if (!cleanedText || !/[a-zA-Zа-яА-Я]/.test(cleanedText)) return;
        if (translationCooldown.has(msg.author.id)) return;

        try {
            const analysis = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: "Analyze language. If the text is English, respond with {\"isEnglish\": true}. If NOT English, translate to English and respond ONLY JSON: {\"isEnglish\": boolean, \"detectedLang\": \"Language Name\", \"translatedText\": \"...\"}" },
                    { role: "user", content: cleanedText }
                ],
                model: "llama-3.3-70b-versatile",
                response_format: { type: "json_object" }
            });

            const data = JSON.parse(analysis.choices[0].message.content);

            if (data.isEnglish && !msg.reference) return;

            if (!data.isEnglish) {
                const expireTime = new Date();
                expireTime.setHours(expireTime.getHours() + 5);
                await pool.query(
                    "INSERT INTO translation_cache (user_id, last_lang, expires_at, guild_id, guild_name) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET last_lang = $2, expires_at = $3, guild_id = $4, guild_name = $5",
                    [msg.author.id, data.detectedLang, expireTime, msg.guild.id, msg.guild.name]
                );
                await msg.reply(`🇺🇸 **English:** ${data.translatedText}`);
            } else if (msg.reference) {
                try {
                    const repliedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
                    const res = await pool.query(
                        "SELECT last_lang FROM translation_cache WHERE user_id = $1 AND expires_at > NOW()",
                        [repliedMessage.author.id]
                    );
                    if (res.rows.length > 0) {
                        const targetLang = res.rows[0].last_lang;
                        const backResult = await groq.chat.completions.create({
                            messages: [
                                { role: "system", content: `Translate to ${targetLang}. Only translation.` },
                                { role: "user", content: cleanedText }
                            ],
                            model: "llama-3.3-70b-versatile"
                        });
                        await msg.reply(`🌍 **To ${targetLang}:** ${backResult.choices[0].message.content}`);
                    }
                } catch (err) { console.error("Reply translation error:", err.message); }
            }

            translationCooldown.add(msg.author.id);
            setTimeout(() => translationCooldown.delete(msg.author.id), 5000);
        } catch (err) { console.error("Groq error:", err.message); }
        return;
    }
    
    const nightRegex = /\b(good night|nighty night)\b/i;
    if (nightRegex.test(msg.content.toLowerCase())) {
        const nightEmbed = new EmbedBuilder()
            .setTitle(`🌙 Good night!`)
            .setDescription("Rest well, pirate! The seas will be waiting for you tomorrow. 🏴‍☠️")
            .setColor("#2c3e50")
            .setImage("https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExMXl2amYzcXZxcml3Nm04dWJtN25qaGY2bWU0dmN3NmthcmdrOXZtMCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/F6bEXu79gwCENplJcB/giphy.gif");
        return msg.reply({ embeds: [nightEmbed] });
    }

    const morningRegex = /\b(good morning|добро утро)\b/i;
    if (morningRegex.test(msg.content.toLowerCase())) {
        const morningGifs = [
            "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExZThydTQ4ZHE0NnpiNnRxODRsanZ5ZmZxaHZzY3owYWhtajV2cmcyNyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/12PFj4kepMjH51mp7d/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExcm04NGFyeXl1Y3p1NzJ6Y2tvY3gzcGYzaW5rMmhwejNyM25kdWhzbCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/mChteTAmcjCZq5p9Az/giphy.gif",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHg3emxudmRqZ2x4eG9nZ3FsYWFuZDZoeHF3MHVwbWI3a3Nod3ZuNyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/dlKxhG0vaPkXr6R4Da/giphy.gif",
        ];
        const randomGif = morningGifs[Math.floor(Math.random() * morningGifs.length)];
        const morningEmbed = new EmbedBuilder()
            .setTitle(`☀️ Good morning!`)
            .setDescription("Is your ass woken up yet? Because mine is! ⚓")
            .setColor("#f1c40f")
            .setImage(randomGif);
        return msg.reply({ embeds: [morningEmbed] });
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    const maniaEmojis = ['✅', '❌', '⏳'];
    if (!maniaEmojis.includes(reaction.emoji.name)) return;
    if (reaction.partial) await reaction.fetch().catch(() => null);
    const { message } = reaction;
    if (!message.embeds[0]?.title?.includes('MANIA FORMATION')) return;
    const otherReactions = message.reactions.cache.filter(r => maniaEmojis.includes(r.emoji.name) && r.emoji.name !== reaction.emoji.name);
    for (const otherReaction of otherReactions.values()) {
        const users = await otherReaction.users.fetch();
        if (users.has(user.id)) await otherReaction.users.remove(user.id).catch(() => null);
    }
});

client.on("interactionCreate", async (interaction) => {
    try {
        if (interaction.isButton() && (interaction.customId.startsWith('perm_approve:') || interaction.customId.startsWith('perm_deny:'))) {
            const modRole = await getConfig(interaction.guild.id, 'mod_role');
            const isAdmin = interaction.member.permissions.has('Administrator');
            const isMod = modRole ? interaction.member.roles.cache.has(modRole) : false;

            if (!isAdmin && !isMod) {
                return interaction.reply({ content: '❌ Only Moderators can approve this!', flags: 64 });
            }

            const [action, userId, shipKey] = interaction.customId.split(':');
            const member = await interaction.guild.members.fetch(userId).catch(() => null);

            if (!member) {
                return interaction.update({ content: '❌ User no longer in server.', components: [] });
            }

            if (action === 'perm_deny') {
                await interaction.update({ content: `❌ Request denied by **${interaction.member.displayName}**.`, embeds: [], components: [] });
                await member.send(`❌ Your permanent crew request was **denied** by a moderator.`).catch(() => {});
                return;
            }

            const { pool } = require('./utilities/db');
            const shipsRes = await pool.query('SELECT * FROM ships WHERE guild_id = $1 AND ship_key = $2', [interaction.guild.id, shipKey]);
            if (shipsRes.rows.length === 0) {
                return interaction.update({ content: '❌ Ship not found.', components: [] });
            }
            const ship = shipsRes.rows[0];
            const { addPermanentCrew } = require('./utilities/ship');
            await addPermanentCrew(interaction.guild, member, ship, pool);

            await interaction.update({
                content: `✅ **${member.displayName}** approved for **${ship.emoji || ''} ${ship.ship_name}** by **${interaction.member.displayName}**!`,
                embeds: [],
                components: []
            });
            await member.send(`✅ Your request to join **${ship.ship_name}** as permanent crew has been **approved**!`).catch(() => {});
            return;
        }

        await shipSystem.handleShipInteraction(interaction);
        const { handleInteraction } = require("./utilities/roleHandler");
        await handleInteraction(interaction);
    } catch (error) {
        console.log("Interaction processed.");
    }
});

client.on(Events.GuildAuditLogEntryCreate, async (auditLog, guild) => {
    const { action, executorId, targetId, reason, changes } = auditLog;
    const logChannel = await getChannel(guild, 'admin_log_channel');
    if (!logChannel) return;

    try {
        const executor = await client.users.fetch(executorId).catch(() => null);
        const target = await client.users.fetch(targetId).catch(() => null);
        if (!executor || !target) return; 

        if (action === AuditLogEvent.MemberBanAdd) {
            const banEmbed = new EmbedBuilder()
                .setColor('#d63031')
                .setAuthor({ name: 'Security Action: Permanent Ban' })
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '👤 Target Member', value: `**${target.tag}**\n\`${target.id}\``, inline: true },
                    { name: '🛡️ Responsible Mod', value: `**${executor.tag}**`, inline: true },
                    { name: '📝 Reason', value: `\`\`\`${reason || 'No reason specified'}\`\`\``, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `Action by: ${executor.tag}`, iconURL: executor.displayAvatarURL() });
            return logChannel.send({ embeds: [banEmbed] });
        }

        if (action === AuditLogEvent.MemberUpdate) {
            const timeoutChange = changes.find(c => c.key === 'communication_disabled_until');
            if (timeoutChange && timeoutChange.new) {
                const durationMs = new Date(timeoutChange.new).getTime() - Date.now();
                const durationMinutes = Math.round(durationMs / 60000);
                const timeoutEmbed = new EmbedBuilder()
                    .setColor('#fdcb6e')
                    .setAuthor({ name: 'Security Action: Member Timeout' })
                    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: '👤 Target Member', value: `**${target.tag}**`, inline: true },
                        { name: '⏳ Duration', value: `\`${durationMinutes} minutes\``, inline: true },
                        { name: '🛡️ Responsible Mod', value: `**${executor.tag}**`, inline: true },
                        { name: '📝 Reason', value: `\`${reason || 'No reason specified'}\``, inline: false }
                    )
                    .setTimestamp()
                    .setFooter({ text: `Target ID: ${target.id}` });
                return logChannel.send({ embeds: [timeoutEmbed] });
            }
        }
    } catch (err) { console.error("Mod Log Error:", err.message); }
});

client.on(Events.GuildMemberRemove, async (member) => {
    const logChannel = await getChannel(member.guild, 'admin_log_channel');
    if (!logChannel) return;

    await new Promise(resolve => setTimeout(resolve, 1200));
    const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
    const kickLog = fetchedLogs.entries.first();

    let title = 'Member Left';
    let description = `**${member.user.tag}** has left the crew. 🏴‍☠️`;
    let color = '#ff4b2b';

    if (kickLog && kickLog.target.id === member.id && (Date.now() - kickLog.createdTimestamp) < 5000) {
        title = 'Member Kicked';
        description = `**${member.user.tag}** was kicked from the crew by **${kickLog.executor.tag}**.`;
        color = '#e17055';
    }

    const leaveEmbed = new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: title })
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setDescription(description)
        .addFields(
            { name: '👤 User ID', value: `\`${member.id}\``, inline: true },
            { name: '📊 Total Members', value: `\`${member.guild.memberCount}\``, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Crew Logs System' });

    await logChannel.send({ embeds: [leaveEmbed] }).catch(() => {});
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (error) => {
    console.error('⚠️ Uncaught Exception:', error.message);
});

client.on('error', (error) => {
    console.error('⚠️ Discord Client Error:', error.message);
});

startSystem();
