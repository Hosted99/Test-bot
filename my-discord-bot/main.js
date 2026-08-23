const Groq = require("groq-sdk");
const { Client, GatewayIntentBits, EmbedBuilder, Events, AuditLogEvent } = require("discord.js");
const path = require('path'); 
const cron = require('node-cron');
const https = require('https'); // Заявки към VirusTotal API
const shipSystem = require('./utilities/ship.js');
const { pool, initDB, getLastWakeup, getWakeupHistory, setDiscordClient } = require("./utilities/db");
const { initGuildConfigTable, getConfig, setConfig, getAllConfig, getChannel, getRole, preloadAllConfigs } = require("./utilities/guildConfig");

const startBirthdayTimer = require('./utilities/bday.js');
const levelingSystem = require('./utilities/leveling.js');
const { initSchedulers, handleManiaPlan, handleManiaList, handleManiaStrategy, handleManiaHelp, handleManiaDM } = require("./utilities/scheduler");
const { handleCommands } = require("./utilities/commandHandler");
const { handleAIMention } = require("./utilities/AI");
const { handleShipStatusMessage, handleShipStatusInteraction } = require("./utilities/shipStatus"); // [ShipStatus]
const { handleBountyImageMessage } = require("./utilities/bountyImage"); // [BountyImage]
const { handleSpecialChannels } = require("./utilities/specialChannels");
const { handleNewMember, handleRoleCommands } = require("./utilities/roleHandler");
const { sendBotManual } = require("./utilities/infoHandler");
const { logDeletedMessage } = require("./utilities/logger");
const { initTranslateSystem } = require('./utilities/translate');
const memeSystem = require('./utilities/meme.js');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const translationCooldown = new Set();

// Изчистване на съдържанието на съобщението от линкове, емоджита и специални символи
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
            console.error("⚠️ VIRUSTOTAL_API_KEY is missing in .env file! All links are considered safe by default.");
            return resolve(true); 
        }

        // Превръщане на URL адреса в Base64 без запълващи '=' символи (както изисква VirusTotal v3)
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
                        
                        // Ако има дори 1 глас за malicious или suspicious, линкът е опасен
                        if (stats.malicious > 0 || stats.suspicious > 0) {
                            return resolve(false); 
                        }
                    } else if (res.statusCode === 404) {
                        console.log(`ℹ️ Link not found in VirusTotal database, accepted as safe.`);
                    }
                    resolve(true); 
                } catch (e) {
                    console.error("Error parsing VirusTotal response:", e.message);
                    resolve(true); 
                }
            });
        });

        req.on('error', (err) => {
            console.error("VirusTotal API error:", err.message);
            resolve(true);
        });

        req.end();
    });
}

// Конфигуриране на Discord клиента и неговите Intents
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

// Подаваме референция към клиента в db.js, за да може да превежда guild_id → име на сървъра в логовете
setDiscordClient(client);

// Създаване на елементарен HTTP сървър за мониторинг (напр. за платформи като Render)
const http = require('http');
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running!');
}).listen(port);
console.log(`Monitoring server started on port ${port}`);

// Инициализиране на базата данни и стартиране на бота
async function startSystem() {
    try {
        await initDB();
        await initGuildConfigTable(); 
        await preloadAllConfigs(); // ✅ Зарежда ВСИЧКИ конфиги в RAM с една заявка → четенията после са мигновени
        console.log("✅ Database is ready.");
        client.login(process.env.DISCORD_TOKEN); 
    } catch (err) {
        console.error("❌ Critical Startup Error:", err.message);
    }
}

// Събитие при успешна готовност на бота
client.once("clientReady", async () => {
    initSchedulers(client, pool);
    levelingSystem(client, { pool });
    initTranslateSystem(client); 
    startBirthdayTimer(client); // ✅ FIX: този ред липсваше — birthday cron никога не се стартираше
    console.log(`🤖 Online as: ${client.user.tag}`);

    // Кеширане на потребителите във всички сървъри
    client.guilds.cache.forEach(guild => {
        guild.members.fetch().then(() => console.log(`✅ Cached members for: ${guild.name}`));
    });

    // Планирано събитие (Cron Job) за Belly Rush панела всеки вторник и петък в 10:00
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

    // ℹ️ Nickname reminder проверката вече се изпълнява вътре в leveling.js
    // (в същия 2-часов sync cron, за да не будим базата отделно) — виж utilities/leveling.js


    // Изпращане на системно съобщение за статус "Online" в конфигурирания канал на всеки сървър
    client.guilds.cache.forEach(async (guild) => {
        await sendBotManual(guild).catch(err => console.log("Error sending manual msg:", err.message));

        const botChannel = await getChannel(guild, 'bot_status_channel');
        if (botChannel) {
            const aliveEmbed = new EmbedBuilder()
                .setTitle("📡 System Status: Online")
                .setDescription("🏴‍☠️ **The Captain is back on the deck!**\nAll systems are operational and the seas are under watch.")
                .setColor("#00ff00")
                .setTimestamp();
            await botChannel.send({ embeds: [aliveEmbed] }).catch(err => console.log("Error sending alive msg:", err.message));
        }
    });
});

// Логване на единично изтрито съобщение
client.on("messageDelete", async (message) => {
    await logDeletedMessage(message);
});

// Логване при масово изтриване на съобщения
client.on("messageDeleteBulk", async (messages) => {
    console.log(`[Log] Bulk delete: ${messages.size} messages`);
});

// Събитие при влизане на нов потребител в сървъра
client.on("guildMemberAdd", async (member) => {
    console.log(`📡 New user joined: ${member.user.tag}`);
    await handleNewMember(member);
});

// ✅ Авто-обновяване на shipless списъка при промяна на ship роля
// (бутон, !ship-captain, !ship-addpermanent, ръчно от админ — всичко минава оттук)
client.on("guildMemberUpdate", async (oldMember, newMember) => {
    try {
        if (oldMember.roles.cache.size === newMember.roles.cache.size &&
            oldMember.roles.cache.every(r => newMember.roles.cache.has(r.id))) {
            return; // Няма реална промяна в ролите
        }

        const { getShips } = require('./utilities/ship.js');
        const { getRole } = require('./utilities/guildConfig.js');
        const ships = await getShips(newMember.guild.id);
        const shipRoleIds = ships.map(s => s.role_id).filter(Boolean);
        const bellyRushRole = await getRole(newMember.guild, 'belly_rush_role');
        const watchedRoleIds = bellyRushRole ? [...shipRoleIds, bellyRushRole.id] : shipRoleIds;
        if (watchedRoleIds.length === 0) return;

        const changedWatchedRole = watchedRoleIds.some(roleId =>
            oldMember.roles.cache.has(roleId) !== newMember.roles.cache.has(roleId)
        );
        if (!changedWatchedRole) return;

        const { refreshShiplessList } = require('./utilities/shiplessList.js');
        await refreshShiplessList(newMember.guild);
    } catch (err) {
        console.error('[ShiplessList] guildMemberUpdate error:', err.message);
    }
});

// Основно събитие за обработка на текстови съобщения
client.on("messageCreate", async (msg) => {

    // КОМАНДА !neon-status — показва какво е събудило Neon последно
    if (msg.content.toLowerCase() === '!neon-status') {
      try {
        if (!msg.member || !msg.member.permissions.has('Administrator')) {
            return msg.reply("❌ Само администратори.").then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }
        const last = getLastWakeup();
        const history = getWakeupHistory();

        if (!last) {
            const embed = new EmbedBuilder()
                .setTitle("🌙 Neon Wake-up Status")
                .setDescription("Базата не е заспивала още (или ботът е рестартиран наскоро).")
                .setColor("#3498db")
                .setTimestamp();
            return msg.reply({ embeds: [embed] });
        }

        const historyText = history.slice(0, 5).map((w, i) => {
            const time = new Date(w.time).toLocaleString('bg-BG', { timeZone: 'Europe/Sofia' });
            const guildLabel = w.guildName ? `${w.guildName} (${w.guildId})` : (w.guildId || "неизвестен сървър");
            const keyLine = w.key ? `\n└ Ключ: \`${w.key}\`` : "";
            return `**${i + 1}.** \`${time}\`\n└ Сървър: **${guildLabel}**${keyLine}\n└ ${w.source}\n└ \`${w.query}\``;
        }).join('\n\n');

        const lastGuildLabel = last.guildName ? `${last.guildName} (${last.guildId})` : (last.guildId || "неизвестен сървър");
        const lastKeyLine = last.key ? `\n└ Ключ: \`${last.key}\`` : "";

        const embed = new EmbedBuilder()
            .setTitle("⚡ Neon Wake-up Status")
            .setDescription(`**Последно събуждане:**\n\`${new Date(last.time).toLocaleString('bg-BG', { timeZone: 'Europe/Sofia' })}\`\n└ Сървър: **${lastGuildLabel}**${lastKeyLine}\n└ Източник: ${last.source}\n└ Заявка: \`${last.query}\``)
            .addFields({ name: "📜 Последни 5 събуждания", value: historyText || "Няма данни" })
            .setColor("#f39c12")
            .setTimestamp();
        return msg.reply({ embeds: [embed] });
      } catch (e) {
        console.error("[neon-status] Грешка:", e);
        return msg.reply(`⚠️ Грешка при изпълнение на \`!neon-status\`: \`${e.message}\``).catch(() => {});
      }
    }

    if (msg.guild) {
        const restrictedChannelId = await getConfig(msg.guild.id, 'restricted_channel');
        const adminLogChannelId = await getConfig(msg.guild.id, 'admin_log_channel');
        const protectedUsersRaw = await getConfig(msg.guild.id, 'protected_users');
        const PROTECTED_USERS = protectedUsersRaw ? protectedUsersRaw.split(',') : [];

        // Защита срещу споменавания на защитени потребители в забранения канал чрез Slash команди
        if (restrictedChannelId && msg.channel.id === restrictedChannelId) {
            const isSlashCommand = msg.interaction !== null;
            const mentionedProtected = PROTECTED_USERS.filter(id => msg.mentions.users.has(id));
            const hasEveryone = msg.mentions.everyone;

            // Ако авторът е protected — може да пуска команди, НО не срещу друг protected потребител
            if (isSlashCommand && PROTECTED_USERS.includes(msg.interaction.user.id)) {
                const targetingProtected = PROTECTED_USERS.filter(id =>
                    id !== msg.interaction.user.id && msg.mentions.users.has(id)
                );
                if (targetingProtected.length === 0) return;
            }

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

    // [BountyImage] Автоматично разчита bounty от screenshot, качен в bounty_upload_channel — без нужда от команда
    const bountyImageHandled = await handleBountyImageMessage(msg, pool);
    if (bountyImageHandled) return;

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

            // 1. Изтриване на оригиналното съобщение на момента
            await msg.delete().catch(() => {});

            // 2. Проверка в VirusTotal в заден план
            const isSafe = await checkLinkWithVirusTotal(foundLinks[0]);

            if (isSafe) {
                // 3. Търсене или създаване на Webhook за препращане на безопасния линк от името на потребителя
                const webhooks = await msg.channel.fetchWebhooks().catch(() => null);
                let webhook = webhooks ? webhooks.find(wh => wh.name === "CaptainLinkScanner") : null;

                if (!webhook) {
                    webhook = await msg.channel.createWebhook({
                        name: 'CaptainLinkScanner',
                        avatar: client.user.displayAvatarURL(),
                        reason: 'Required for forwarding scanned safe links.'
                    }).catch(err => console.error("Could not create Webhook in channel:", err.message));
                }

                if (webhook) {
                    // Изпращане на съобщението, маскирано с профила на оригиналния потребител
                    await webhook.send({
                        content: originalContent,
                        username: member ? member.displayName : author.username,
                        avatarURL: author.displayAvatarURL({ dynamic: true })
                    });
                } else {
                    // Резервен вариант при липса на права за Webhook
                    await msg.channel.send(`✅ **Safe link from ${author}:**\n${originalContent}`);
                }
            } else {
                // Предупреждение при засичане на опасен или фишинг линк
                const warningMsg = await msg.channel.send(`❌ ${author}, your message was automatically blocked because it contains a malicious or phishing link!`);
                setTimeout(() => warningMsg.delete().catch(() => {}), 10000); // Почистване след 10 секунди

                // Логване на инцидента в администраторския канал
                const adminLogChannelId = await getConfig(msg.guild.id, 'admin_log_channel');
                if (adminLogChannelId) {
                    const logChannel = msg.guild.channels.cache.get(adminLogChannelId);
                    if (logChannel) {
                        const alertEmbed = new EmbedBuilder()
                            .setColor('#ff0000')
                            .setTitle('🚨 Cyber Threat Detected (Dangerous Link)')
                            .addFields(
                                { name: 'User:', value: `${author.tag} (\`${author.id}\`)`, inline: true },
                                { name: 'Channel:', value: `<#${msg.channel.id}>`, inline: true },
                                { name: 'Detected Link:', value: `\`${foundLinks[0]}\`` },
                                { name: 'Full Message Content:', value: `\`\`\`${originalContent}\`\`\`` }
                            )
                            .setTimestamp();
                        await logChannel.send({ embeds: [alertEmbed] }).catch(() => {});
                    }
                }
            }
            return; // Спиране на по-нататъшната обработка
        } catch (err) {
            console.error("Critical error in Link Scanner:", err.message);
        }
    }
    // =================================================================

    try { await shipSystem.handleMessage(msg); } catch (e) { console.error("Ship system error:", e); }

    const lowerContent = msg.content.toLowerCase().trim();

    // Обработка на специфични команди за Mania
    if (lowerContent.startsWith("mania-plan")) return await handleManiaPlan(msg);
    if (lowerContent.startsWith("mania-list")) return await handleManiaList(msg);
    if (lowerContent.startsWith("mania-dm")) return await handleManiaDM(msg);
    if (lowerContent.startsWith("mania-strategy")) return await handleManiaStrategy(msg, pool);

    // Обработка на стандартни текстови команди, започващи с "!"
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
                return msg.reply("❌ Error: `belly_rush_channel` is not configured. Use `!setconfig belly_rush_channel <channel_id>`");
            }
        }

        if (cmd === "!setconfig") {
            if (!msg.member.permissions.has('Administrator')) {
                return msg.reply("❌ Only administrators can configure the bot.");
            }
            const key = args[0];
            const value = args[1];
            if (!key || !value) {
                return msg.reply("❌ Format: `!setconfig <key> <value>`\n\nAvailable keys:\n" +
                "`level_up_channel` — channel for level-ups\n" +
                "`log_channel` — channel for XP logs\n" +
                "`stats_channel` — channel for !top leaderboards\n" +
                "`admin_log_channel` — channel for moderation logs\n" +
                "`welcome_channel` — channel for new members\n" +
                "`belly_rush_channel` — channel for Belly Rush panels\n" +
                "`reminders_channel` — channel for reminders\n" +
                "`repair_channel` — channel for ship-repairs\n" +
                "`translator_channel` — channel for AI translation\n" +
                "`bot_status_channel` — channel for Online/Offline status\n" +
                "`bot_info_channel` — channel for bot command manuals\n" +
                "`unit_build_channel` — channel for !hero commands\n" +
                "`bounty_channel` — channel for !wanted posters\n" +
                "`rookies_role` — role for new members\n" +
                "`player_role` — role given after verification\n" +
                "`mod_role` — role for moderators\n" +
                "`restricted_channel` — channel with mention restrictions\n" +
                "`protected_users` — protected user IDs (id1,id2)\n" +
                "`bday_channel` — channel for birthday messages\n" +
                "`bday_user` — user ID for birthday tracking\n" +
                "`blacklist_channel` — channel for the persistent Belly Rush blacklist embed (optional)\n" +
                "`ship_status_channel` — channel where !shipstatus / !shipstatus-image always posts, regardless of where typed (optional)\n" +
                "`bounty_upload_channel` — channel where any screenshot auto-triggers a bounty update (AI-read, no command needed, optional)\n" +
                "`mania_main_channel` — main channel for Mania notifications (optional)");
            }
            await setConfig(msg.guild.id, key, value, msg.guild.name);
            return msg.reply(`✅ Configuration saved: \`${key}\` = \`${value}\``);
        }

        if (cmd === "!unsetconfig") {
            // ✅ Реално ИЗТРИВА ключ от конфига (не просто го презаписва с "0"/боклук стойност,
            // защото в JS "0" е truthy и такива стойности пак минават проверки от рода на !friendId)
            if (!msg.member.permissions.has('Administrator')) {
                return msg.reply("❌ Only administrators can configure the bot.");
            }
            const key = args[0];
            if (!key) {
                return msg.reply("❌ Format: `!unsetconfig <key>`\nExample: `!unsetconfig bday_user`");
            }
            const { deleteConfig } = require("./utilities/guildConfig");
            await deleteConfig(msg.guild.id, key);
            return msg.reply(`✅ Cleared: \`${key}\` (removed from config).`);
        }

        if (cmd === "!post-shipless-list") {
            // ✅ Постоянен списък с членове без кораб — постват се веднъж, после само се edit-ват (авто-обновява се и при промяна на ship роля)
            if (!msg.member.permissions.has('Administrator')) {
                return msg.reply("❌ Only administrators can post the shipless list.");
            }
            try { await msg.delete(); } catch (err) {}
            try {
                const { refreshShiplessList } = require('./utilities/shiplessList.js');
                const result = await refreshShiplessList(msg.guild);
                if (!result) {
                    const warn = await msg.channel.send("❌ `shipless_list_channel` is not configured. Use `!setconfig shipless_list_channel <channel>` first.");
                    setTimeout(() => warn.delete().catch(() => {}), 5000);
                    return;
                }
                const confirm = await msg.channel.send(`✅ Shipless list posted/updated in ${result.channel}.`);
                setTimeout(() => confirm.delete().catch(() => {}), 3000);
            } catch (err) {
                console.error('[ShiplessList] !post-shipless-list error:', err);
                const warn = await msg.channel.send(`❌ Error posting shipless list: \`${err.message}\``);
                setTimeout(() => warn.delete().catch(() => {}), 5000);
            }
            return;
        }

        if (cmd === "!post-unlock-info") {
            // ✅ Постоянни инструкции в belly_rush_unlock_channel — постват се веднъж, после само се edit-ват
            if (!msg.member.permissions.has('Administrator')) {
                return msg.reply("❌ Only administrators can post channel instructions.");
            }
            try { await msg.delete(); } catch (err) {}
            try {
                const { refreshUnlockInstructions } = require('./utilities/categoryUnlock.js');
                const result = await refreshUnlockInstructions(msg.guild);
                if (!result) {
                    const warn = await msg.channel.send("❌ `belly_rush_unlock_channel` is not configured. Use `!setconfig belly_rush_unlock_channel <channel>` first.");
                    setTimeout(() => warn.delete().catch(() => {}), 5000);
                    return;
                }
                const confirm = await msg.channel.send(`✅ Instructions posted/updated in ${result.channel}.`);
                setTimeout(() => confirm.delete().catch(() => {}), 3000);
            } catch (err) {
                console.error('[CategoryUnlock] !post-unlock-info error:', err);
                const warn = await msg.channel.send(`❌ Error posting instructions: \`${err.message}\``);
                setTimeout(() => warn.delete().catch(() => {}), 5000);
            }
            return;
        }

        if (cmd === "!post-roles-info") {
            // ✅ Постоянни инструкции в belly_rush_roles_channel — постват се веднъж, после само се edit-ват
            if (!msg.member.permissions.has('Administrator')) {
                return msg.reply("❌ Only administrators can post channel instructions.");
            }
            try { await msg.delete(); } catch (err) {}
            try {
                const { refreshRolesInstructions } = require('./utilities/channelInstructions.js');
                const result = await refreshRolesInstructions(msg.guild);
                if (!result) {
                    const warn = await msg.channel.send("❌ `belly_rush_roles_channel` is not configured. Use `!setconfig belly_rush_roles_channel <channel>` first.");
                    setTimeout(() => warn.delete().catch(() => {}), 5000);
                    return;
                }
                const confirm = await msg.channel.send(`✅ Instructions posted/updated in ${result.channel}.`);
                setTimeout(() => confirm.delete().catch(() => {}), 3000);
            } catch (err) {
                console.error('[ChannelInstructions] !post-roles-info error:', err);
                const warn = await msg.channel.send(`❌ Error posting instructions: \`${err.message}\``);
                setTimeout(() => warn.delete().catch(() => {}), 5000);
            }
            return;
        }

        if (cmd === "!post-crew-info") {
            // ✅ Постоянни инструкции в crew_approval_channel — постват се веднъж, после само се edit-ват
            if (!msg.member.permissions.has('Administrator')) {
                return msg.reply("❌ Only administrators can post channel instructions.");
            }
            try { await msg.delete(); } catch (err) {}
            try {
                const { refreshCrewInstructions } = require('./utilities/channelInstructions.js');
                const result = await refreshCrewInstructions(msg.guild);
                if (!result) {
                    const warn = await msg.channel.send("❌ Neither `crew_approval_channel` nor `admin_log_channel` is configured. Use `!setconfig crew_approval_channel <channel>` first.");
                    setTimeout(() => warn.delete().catch(() => {}), 5000);
                    return;
                }
                const confirm = await msg.channel.send(`✅ Instructions posted/updated in ${result.channel}.`);
                setTimeout(() => confirm.delete().catch(() => {}), 3000);
            } catch (err) {
                console.error('[ChannelInstructions] !post-crew-info error:', err);
                const warn = await msg.channel.send(`❌ Error posting instructions: \`${err.message}\``);
                setTimeout(() => warn.delete().catch(() => {}), 5000);
            }
            return;
        }

        if (cmd === "!black-list" || cmd === "!blacklist") {
            // ✅ Показва текущия blacklist — вижда се от всеки
            try {
                const { getBlacklist, buildBlacklistEmbed } = require('./utilities/blacklist.js');
                const rows = await getBlacklist(msg.guild.id);
                const embed = buildBlacklistEmbed(msg.guild, rows);
                return msg.reply({ embeds: [embed] });
            } catch (err) {
                console.error('[Blacklist] !black-list error:', err);
                return msg.reply(`❌ Error loading the blacklist: \`${err.message}\``);
            }
        }

        if (cmd === "!blacklist-refresh") {
            // ✅ Форсира обновяване на живото embed съобщение в blacklist_channel
            // Полезно след ръчни промени директно в базата (напр. bulk insert през Neon)
            if (!msg.member.permissions.has('Administrator')) {
                return msg.reply("❌ Only administrators can refresh the blacklist.");
            }
            try {
                const { refreshBlacklistMessage } = require('./utilities/blacklist.js');
                const result = await refreshBlacklistMessage(msg.guild);
                if (!result) {
                    return msg.reply("❌ `blacklist_channel` is not configured. Use `!setconfig blacklist_channel <channel>` first.");
                }
                return msg.reply("✅ Blacklist embed refreshed.");
            } catch (err) {
                console.error('[Blacklist] !blacklist-refresh error:', err);
                return msg.reply(`❌ Error refreshing the blacklist: \`${err.message}\``);
            }
        }

        if (cmd === "!blacklist-add") {
            // ✅ Добавя ИМЕ (не Discord потребител) в blacklist-а (само Admin)
            if (!msg.member.permissions.has('Administrator')) {
                return msg.reply("❌ Only administrators can manage the blacklist.");
            }
            try {
                const { addToBlacklist, refreshBlacklistMessage, parseNameAndReason } = require('./utilities/blacklist.js');
                const rawText = args.join(' ');
                const { name, reason } = parseNameAndReason(rawText);
                if (!name) {
                    return msg.reply('❌ Format: `!blacklist-add <name> <reason>`\nFor names with spaces use quotes: `!blacklist-add "Red Hair Shanks" scammer`');
                }
                await addToBlacklist(msg.guild.id, name, reason, msg.author.id);
                await refreshBlacklistMessage(msg.guild);
                return msg.reply(`✅ Added **${name}** to the blacklist: \`${reason || 'No reason provided'}\``);
            } catch (err) {
                console.error('[Blacklist] !blacklist-add error:', err);
                return msg.reply(`❌ Error adding to the blacklist: \`${err.message}\``);
            }
        }

        if (cmd === "!blacklist-remove") {
            // ✅ Маха ИМЕ от blacklist-а (само Admin)
            if (!msg.member.permissions.has('Administrator')) {
                return msg.reply("❌ Only administrators can manage the blacklist.");
            }
            try {
                const { removeFromBlacklist, refreshBlacklistMessage, parseNameAndReason } = require('./utilities/blacklist.js');
                const rawText = args.join(' ');
                const { name } = parseNameAndReason(rawText);
                if (!name) {
                    return msg.reply('❌ Format: `!blacklist-remove <name>`\nFor names with spaces use quotes: `!blacklist-remove "Red Hair Shanks"`');
                }
                const wasRemoved = await removeFromBlacklist(msg.guild.id, name);
                if (!wasRemoved) {
                    return msg.reply(`❌ **${name}** is not on the blacklist.`);
                }
                await refreshBlacklistMessage(msg.guild);
                return msg.reply(`✅ Removed **${name}** from the blacklist.`);
            } catch (err) {
                console.error('[Blacklist] !blacklist-remove error:', err);
                return msg.reply(`❌ Error removing from the blacklist: \`${err.message}\``);
            }
        }

        if (cmd === "!sendbday") {
            // ✅ Ръчно изпращане на birthday съобщение веднага (не чака 08:30 cron-а)
            // Manually send the birthday message right now (doesn't wait for the 08:30 cron)
            if (!msg.member.permissions.has('Administrator')) {
                return msg.reply("❌ Only administrators can trigger the birthday message.");
            }
            const { sendBirthdayMessage } = require('./utilities/bday.js');
            const sent = await sendBirthdayMessage(msg.guild);
            if (!sent) {
                return msg.reply("❌ `bday_channel` or `bday_user` is not configured. Use `!setconfig bday_channel <channel>` and `!setconfig bday_user <user_id>` first.");
            }
            return msg.reply("✅ Birthday message sent!");
        }

        if (cmd === "!getconfig") {
            if (!msg.member.permissions.has('Administrator')) {
                return msg.reply("❌ Only administrators can view the configuration.");
            }
            const config = await getAllConfig(msg.guild.id);
            const entries = Object.entries(config);
            if (entries.length === 0) {
                return msg.reply("⚠️ No configuration found for this server. Use `!setconfig <key> <value>`");
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
                return msg.reply('❌ TRANSLATE_PASSWORD is not set in .env!');
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
            if (!storedPassword) return msg.reply('❌ TRANSLATE_PASSWORD is not set in .env!');
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
                return msg.reply("❌ Usage: `!mania-addguild <key> @role #plan-channel #notify-channel`\nExample: `!mania-addguild ts @ThousandSunny #mania-strategy #general`\n\n• `#plan-channel` — channel where users vote\n• `#notify-channel` — channel where everyone sees the notification");
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
                { key: "level_up_channel",         desc: "Level-up messages",          type: "channel" },
                { key: "log_channel",               desc: "XP logs",                   type: "channel" },
                { key: "stats_channel",             desc: "!top leaderboard",          type: "channel" },
                { key: "admin_log_channel",         desc: "Moderation logs",            type: "channel" },
                { key: "welcome_channel",           desc: "New members chat",           type: "channel" },
                { key: "belly_rush_channel",        desc: "Belly Rush panel",            type: "channel" },
                { key: "belly_rush_roles_channel",  desc: "Ship commands only (!want, !ship-captain, etc.)", type: "channel" },
                { key: "shipless_list_channel",     desc: "Auto-updating list of members without a ship", type: "channel" },
                { key: "belly_rush_role",           desc: "Only show these members in the shipless list", type: "role" },
                { key: "belly_rush_unlock_channel", desc: "Category unlock instructions", type: "channel" },
                { key: "reminders_channel",         desc: "Reminders notifications",     type: "channel" },
                { key: "repair_channel",            desc: "Repair-ship deck",            type: "channel" },
                { key: "translator_channel",        desc: "AI Translator room",          type: "channel" },
                { key: "bot_status_channel",        desc: "Online/Offline status",       type: "channel" },
                { key: "bot_info_channel",          desc: "Command manuals channel",     type: "channel" },
                { key: "unit_build_channel",        desc: "!hero commands arena",        type: "channel" },
                { key: "bounty_channel",            desc: "!wanted posters board",       type: "channel" },
                { key: "rules_channel",             desc: "Rules (welcome msg)",       type: "channel" },
                { key: "general_channel",           desc: "General chat (welcome msg)",  type: "channel" },
                { key: "rookies_role",              desc: "Role for newcomers",        type: "role" },
                { key: "player_role",               desc: "Role after verification",       type: "role" },
                { key: "mod_role",                  desc: "Role for moderators",          type: "role" },
                { key: "restricted_channel",        desc: "Channel with mention blocks",  type: "channel" },
                { key: "protected_users",           desc: "Protected users list",        type: "text" },
                { key: "bday_channel",              desc: "Birthday channel",              type: "channel", optional: true },
                { key: "bday_user",                 desc: "Birthday tracking user",         type: "text",    optional: true },
                { key: "blacklist_channel",          desc: "Belly Rush blacklist embed",     type: "channel", optional: true },
                { key: "ship_status_channel",        desc: "Fixed channel for !shipstatus (optional, else uses current channel)", type: "channel", optional: true },
                { key: "bounty_upload_channel",       desc: "Auto-detect bounty from any screenshot posted here (optional)", type: "channel", optional: true },
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
                missing.push(`❌ Mania Guilds — use \`!mania-addguild\``);
            }

            const { pool } = require("./utilities/db");
            const shipsRes = await pool.query("SELECT ship_name FROM ships WHERE guild_id = $1", [msg.guild.id]);
            if (shipsRes.rows.length > 0) {
                configured.push(`✅ Ships: ${shipsRes.rows.map(r => `**${r.ship_name}**`).join(", ")}`);
            } else {
                missing.push(`❌ Ships — use \`!ship-add <name> <emoji> @role\``);
            }

            // Спомагателна функция за разделяне на големи полета в Embed съобщението
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
                ? "🎉 **Everything is configured! The bot is ready for action.**"
                : `⚠️ **${missing.length} settings are missing.** Use \`!setconfig <key> <value>\` to add them.`;

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

            const aiStatus = config['ai_enabled'];
            configured.push(
                aiStatus === 'true'
                    ? '✅ `ai_chat` — 🟢 **Active** (AI responding to @mentions)'
                    : '🔴 `ai_chat` — **Disabled** (use `!ai-enable <password>` to activate)'
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

        // [ShipStatus] !shipstatus / !shipstatus-image — крие се преди AI/generic handler-ите
        const shipStatusHandled = await handleShipStatusMessage(msg);
        if (shipStatusHandled) return;

        // ✅ AI enable/disable команди
        const aiCmdHandled = await handleAIMention(msg, client);
        if (aiCmdHandled) return;

        return await handleCommands(msg, pool);
    } 

    const specialHandled = await handleSpecialChannels(msg, pool);
    if (specialHandled) return;

    // ✅ AI @mention handler — responds to pings with One Piece personality
    const aiHandled = await handleAIMention(msg, client);
    if (aiHandled) return;

    // ИИ Преводач система в определен канал
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
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
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
    
    // Пасхалка за лека нощ (Good night)
    const nightRegex = /\b(good night|nighty night)\b/i;
    if (nightRegex.test(msg.content.toLowerCase())) {
        const nightEmbed = new EmbedBuilder()
            .setTitle(`🌙 Good night!`)
            .setDescription("Rest well, pirate! The seas will be waiting for you tomorrow. 🏴‍☠️")
            .setColor("#2c3e50")
            .setImage("https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExMXl2amYzcXZxcml3Nm04dWJtN25qaGY2bWU0dmN3NmthcmdrOXZtMCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/F6bEXu79gwCENplJcB/giphy.gif");
        return msg.reply({ embeds: [nightEmbed] });
    }

    // Пасхалка за добро утро (Good morning)
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

// Събитие при добавяне на емоджи реакция към съобщенията (за Маnia формата)
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

// Обработка на бутони и други интеракции в Discord
client.on("interactionCreate", async (interaction) => {
    try {
        // [ShipStatus] Confirm/Cancel бутони за AI-прочетения ship status preview
        const shipStatusInteractionHandled = await handleShipStatusInteraction(interaction);
        if (shipStatusInteractionHandled) return;

        // Одобряване или отхвърляне на перманентен екипаж (Permanent Crew) от модератори
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

// Слушател за Одит Дневника (Audit Logs) — Банове и Тайм-аути
client.on(Events.GuildAuditLogEntryCreate, async (auditLog, guild) => {
    const { action, executorId, targetId, reason, changes } = auditLog;
    const logChannel = await getChannel(guild, 'admin_log_channel');
    if (!logChannel) return;

    try {
        const executor = await client.users.fetch(executorId).catch(() => null);
        const target = await client.users.fetch(targetId).catch(() => null);
        if (!executor || !target) return; 

        // При перманентен бан
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

        // При налагане на Тайм-аут (Timeout)
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

// Събитие при напускане на потребител (или изгонване - Kick)
client.on(Events.GuildMemberRemove, async (member) => {
    const logChannel = await getChannel(member.guild, 'admin_log_channel');
    if (!logChannel) return;

    await new Promise(resolve => setTimeout(resolve, 1200));
    const fetchedLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick });
    const kickLog = fetchedLogs.entries.first();

    let title = 'Member Left';
    let description = `**${member.user.tag}** has left the crew. 🏴‍☠️`;
    let color = '#ff4b2b';

    // Проверка дали напускането всъщност е Kick в последните 5 секунди
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

// Глобално прихващане на грешки, за да не крашва бота
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (error) => {
    console.error('⚠️ Uncaught Exception:', error.message);
});

client.on('error', (error) => {
    console.error('⚠️ Discord Client Error:', error.message);
});

// Стартиране на цялата система
startSystem();
