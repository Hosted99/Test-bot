const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const cron = require('node-cron');
const { getChannel, getConfig } = require("./guildConfig"); // ← МУЛТИ-СЪРВЪР КОНФИГ

const xpCache = new Map();
const messageTracker = new Map();
const warnTracker = new Map();

function createProgressBar(current, total, size = 10) {
    const progress = Math.min(size, Math.floor((current / total) * size));
    const emptyProgress = size - progress;
    return `\`[${'▇'.repeat(progress)}${'—'.repeat(emptyProgress)}]\` ${Math.floor((current / total) * 100)}%`;
}

const RANK_ROLES = {
    1:   { name: "Silent Snail 🐌", color: "#7f8c8d", msg: "Welcome to the crew... or are you just watching? 👀" },
    3:   { name: "Keyboard Lost", color: "#95a5a6", msg: "Did you drop your keyboard in the ocean? Say something! 🌊" },
    5:   { name: "Typing… (forever)", color: "#bdc3c7", msg: "The bubble is there, but no message. Suspicious... 💬" },
    8:   { name: "Sea Lurker", color: "#7f8c8d", msg: "Hiding in the deep sea of the chat? We see you! 🐙" },
    10:  { name: "Background NPC", color: "#95a5a6", msg: "The main characters are talking, keep up! 🎮" },
    15:  { name: "Chat Rookie", color: "#2ecc71", msg: "First steps into the world of chatter! ⚓" },
    20:  { name: "Word Dripper", color: "#27ae60", msg: "One word at a time... you're getting there. 💧" },
    25:  { name: "Slow Typist", color: "#16a085", msg: "Slow and steady wins the race? Not here! 🐢" },
    30:  { name: "Casual Talker", color: "#2ecc71", msg: "Just enjoying a grog and a chat in the tavern. 🍻" },
    35:  { name: "Den Den Beginner", color: "#1abc9c", msg: "Starting to use the Den Den Mushi properly! 📞" },
    40:  { name: "Message Machine", color: "#3498db", msg: "You're starting to pump those numbers up! ⚙️" },
    45:  { name: "Chat Sailor", color: "#2980b9", msg: "Sailing through the sea of messages! ⛵" },
    50:  { name: "Spam Apprentice", color: "#3498db", msg: "You're learning the dark arts of spamming... ✍️" },
    55:  { name: "Typing Pirate", color: "#2980b9", msg: "Your fingers are fast as a cutlass! ⚔️" },
    60:  { name: "Den Den Caller", color: "#34495e", msg: "Bero-bero-bero-bero! You never hang up! 🐌🔊" },
    65:  { name: "Keyboard Warrior", color: "#9b59b6", msg: "Your keyboard is your strongest weapon! 🛡️" },
    70:  { name: "Spam Cannon", color: "#8e44ad", msg: "Boom! Messages flying everywhere! 💣" },
    75:  { name: "Chat Addict", color: "#9b59b6", msg: "You can't go 5 minutes without checking the chat! 💉" },
    80:  { name: "Message Storm", color: "#8e44ad", msg: "A literal hurricane of words! 🌪️" },
    85:  { name: "No-Life Sailor", color: "#34495e", msg: "Is there even a real world outside? 🏚️" },
    90:  { name: "Typing Beast", color: "#e67e22", msg: "Your hands are a blur! Stop them if you can! 🦁" },
    95:  { name: "Chat Hurricane", color: "#d35400", msg: "The chat is shaking from your activity! 💨" },
    100: { name: "Infinite Talker", color: "#e67e22", msg: "Does this guy ever stop for breath? ♾️" },
    110: { name: "Spam Lord", color: "#d35400", msg: "All hail the master of the fast type! 👑" },
    120: { name: "Den Den Master", color: "#e67e22", msg: "You own the communication lines! 📞💎" },
    130: { name: "Touch Grass Needed 🌱❌", color: "#e74c3c", msg: "Go outside. The sun won't hurt you, I promise. ☀️" },
    140: { name: "Sleep Is Optional", color: "#c0392b", msg: "Sleep is for the weak. Spam is for the legends. 💤" },
    150: { name: "Server Resident", color: "#e74c3c", msg: "You literally live here now. Rent is due! 🏠" },
    160: { name: "Keyboard Destroyer", color: "#c0392b", msg: "How many keyboards have you broken so far? ⌨️💥" },
    170: { name: "No Break Pirate", color: "#e74c3c", msg: "Breaks are for marines. Pirates never stop! ⚓" },
    180: { name: "Chat Emperor", color: "#f1c40f", msg: "Your words rule these waters! 👑" },
    190: { name: "Spam Yonko", color: "#f39c12", msg: "One of the four Great Spam-lords! 🚩" },
    200: { name: "Message King", color: "#f1c40f", msg: "The ultimate title for the ultimate talker! 🏆" },
    210: { name: "Server Overlord", color: "#ffffff", msg: "The server is your kingdom. ✨" },
    220: { name: "Grass Avoider 🌱❌", color: "#ffeb3b", msg: "Legend says he hasn't seen a tree since 2012. 👑🔥" }
};

const FUNNY_FALLBACKS = [
    "Still a nobody, but at least you're a louder nobody now. 🤡",
    "Level up! Sadly, your reputation is still 0. 📉",
    "Congratulations! You've achieved... absolutely nothing new. ✨"
];

async function saveToDatabase(pool, guildId, userId, data) {
    const query = `INSERT INTO levels (guild_id, guild_name, user_id, xp, level, username)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (guild_id, user_id) DO UPDATE SET xp = $4, level = $5, username = $6, guild_name = $2;`;
    try { await pool.query(query, [guildId, data.guildName || 'unknown', userId, data.xp, data.level, data.username]); } catch (e) { console.error("DB Error:", e); }
}

async function getOrCreateRole(guild, roleData) {
    if (!guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) return null;
    let role = guild.roles.cache.find(r => r.name === roleData.name);
    if (!role) { try { role = await guild.roles.create({ name: roleData.name, color: roleData.color, reason: 'Automated Rank' }); } catch (e) { console.error(e); } }
    return role;
}

module.exports = (client, poolObj) => {
    const pool = poolObj.pool;

    async function loadCacheFromDB() {
        try {
            const res = await pool.query('SELECT guild_id, guild_name, user_id, xp, level, username FROM levels');
            res.rows.forEach(row => {
                const cacheKey = `${row.guild_id}:${row.user_id}`;
                xpCache.set(cacheKey, { xp: parseInt(row.xp), level: parseInt(row.level), username: row.username, guildName: row.guild_name || 'unknown', needsUpdate: false });
            });
            console.log(`[System] Loaded ${res.rowCount} profiles from Neon.`);
        } catch (e) { console.error("Cache load error:", e); }
    }

    loadCacheFromDB();

    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;

        const levelingEnabled = await getConfig(message.guild.id, 'leveling_enabled');

        // Команди за пускане и спиране на системата
        if (message.content.toLowerCase().startsWith('!leveling-enable')) {
            const args = message.content.trim().split(/\s+/);
            const inputPassword = args[1];
            const storedPassword = process.env.LEVELING_PASSWORD;
            if (!storedPassword) return message.reply('❌ LEVELING_PASSWORD not set in .env!').then(m => setTimeout(() => m.delete().catch(() => {}), 8000));
            if (inputPassword !== storedPassword) return message.reply('❌ Wrong password!').then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
            await require('./guildConfig').setConfig(message.guild.id, 'leveling_enabled', 'true', message.guild.name);
            await message.reply('✅ **Leveling system activated!**');
            setTimeout(() => { message.delete().catch(() => {}); }, 3000);
            return;
        }

        if (message.content.toLowerCase().startsWith('!leveling-disable')) {
            if (!message.member.permissions.has('Administrator')) return;
            await require('./guildConfig').setConfig(message.guild.id, 'leveling_enabled', 'false', message.guild.name);
            await message.reply('🔒 **Leveling system disabled.**');
            setTimeout(() => { message.delete().catch(() => {}); }, 3000);
            return;
        }

        if (levelingEnabled !== 'true') return;

        const userId = message.author.id;
        const guildId = message.guild.id;
        const cacheKey = `${guildId}:${userId}`;

        let userData = xpCache.get(cacheKey);
        if (!userData) {
            try {
                const dbRes = await pool.query('SELECT xp, level, username FROM levels WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
                if (dbRes.rows.length > 0) {
                    userData = { xp: parseInt(dbRes.rows[0].xp), level: parseInt(dbRes.rows[0].level), username: dbRes.rows[0].username, guildName: message.guild.name, needsUpdate: false };
                } else {
                    userData = { xp: 0, level: 1, username: message.member.displayName, guildName: message.guild.name, needsUpdate: true };
                    await saveToDatabase(pool, guildId, userId, userData);
                }
            } catch(e) {
                userData = { xp: 0, level: 1, username: message.member.displayName, guildName: message.guild.name, needsUpdate: true };
            }
            xpCache.set(cacheKey, userData);
        }
        
        userData.guildName = message.guild.name;
        userData.username = message.member.displayName;

        // ПРОВЕРКА ЗА НАЧАЛНА РОЛЯ (Защитена от блокиране)
        try {
            const allRankNames = Object.values(RANK_ROLES).map(r => r.name);
            const hasLevelRole = message.member.roles.cache.some(role => allRankNames.includes(role.name));

            if (!hasLevelRole && userData.level >= 1) {
                const role1 = RANK_ROLES[1];
                const role = await getOrCreateRole(message.guild, role1);
                if (role && message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                    await message.member.roles.add(role).catch(() => {});
                    const lvlChannel = await getChannel(message.guild, 'level_up_channel');
                    if (lvlChannel) {
                        const welcomeEmbed = new EmbedBuilder()
                            .setAuthor({ name: `${message.member.displayName} joined the crew!`, iconURL: message.author.displayAvatarURL() })
                            .setTitle('🏴‍☠️ NEW RECRUIT SPOTTED')
                            .setDescription(`Welcome ${message.author}!\n🔹 **Status:** **${role1.name}**\n\n> *"${role1.msg}"*`)
                            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                            .setColor(role1.color);
                        lvlChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
                    }
                }
            }
        } catch (roleError) {
            console.error("Role check failed, skipping to prevent lock:", roleError);
        }

        // КОМАНДА !rank
if (message.content.toLowerCase().startsWith('!rank')) {
    message.delete().catch(() => {});

    const rankChannel = await getChannel(message.guild, 'level_up_channel') || message.channel;
    const nextXP = 200 + (userData.level * 80);
    const roleInfo = RANK_ROLES[userData.level];
    let timeLeft = 60;

    // 🌟 НОВО: Изчисляваме процента и правим текстовия формат за цифрите (напр. "120 / 300 XP")
    const percentage = Math.min(Math.floor((userData.xp / nextXP) * 100), 100);
    const xpDigits = `📊 **${userData.xp}** / **${nextXP} XP**`;

    const embed = new EmbedBuilder()
        .setTitle(`⚓ ${message.member.displayName}'s Status`)
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .setColor(roleInfo?.color || '#34495e')
        .addFields(
            { name: '👤 Title', value: `**${roleInfo?.name || "Wanderer"}**`, inline: true },
            { name: '📈 Level', value: `\`${userData.level}\``, inline: true },
            // 🌟 РЕДАКТИРАНО: Тук комбинираме цифрите на новия ред и прогрес бара под тях с процентите
            { 
                name: '📊 Progress', 
                value: `${xpDigits}\n${createProgressBar(userData.xp, nextXP)} **${percentage}%**`, 
                inline: false 
            }
        )
        .setFooter({ text: `Auto-deleting in ${timeLeft}s` });

    const rankMsg = await rankChannel.send({ content: `⚓ ${message.author}, check your status:`, embeds: [embed] }).catch(() => {});
    if (!rankMsg) return;

    const countdown = setInterval(async () => {
        timeLeft -= 10;
        if (timeLeft <= 0) {
            clearInterval(countdown);
            return rankMsg.delete().catch(() => {});
        }
        const updatedEmbed = EmbedBuilder.from(embed).setFooter({ text: `Auto-deleting in ${timeLeft}s` });
        await rankMsg.edit({ embeds: [updatedEmbed] }).catch(() => clearInterval(countdown));
    }, 10000);
    
    return;
}

        // КОМАНДА !top
        if (message.content.toLowerCase() === '!top') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) { 
                return message.reply("❌ Moderators and Admins only!").then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
            }
            const statsChannel = await getChannel(message.guild, 'stats_channel');
            if (!statsChannel) return;
            message.delete().catch(() => {});

            try {
                const res = await pool.query('SELECT username, level, xp FROM levels WHERE guild_id = $1 ORDER BY level DESC, xp DESC LIMIT 10', [message.guild.id]);
                const desc = res.rows.map((row, i) => `\`#${i + 1}\` **${row.username}** — Level \`${row.level}\` (${row.xp} XP)`).join('\n');
                const variants = [
                    { t: '🏴‍☠️ THE NOISIEST PIRATES ON DECK!', d: `*Arrr! These sea dogs be makin the most noise:* \n\n${desc}` },
                    { t: '🍻 WHO WONT SHUT UP?!', d: `*These pirates drank too much rum...*\n\n${desc}` },
                ];
                const v = variants[Math.floor(Math.random() * variants.length)];
                const embed = new EmbedBuilder().setTitle(v.t).setDescription(v.d).setColor('#FF4500').setThumbnail(message.guild.iconURL({ dynamic: true })).setFooter({ text: '☠️ Vanish in 60s' }).setTimestamp();
                statsChannel.send({ embeds: [embed] }).then(m => setTimeout(() => m.delete().catch(() => {}), 60000));
            } catch (e) { console.error(e); }
            return;
        }

        // КОМАНДА !sync
        if (message.content.toLowerCase() === '!sync') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return message.reply("❌ Moderators and Admins only!").then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
            }
            message.delete().catch(() => {});
            let count = 0;
            try {
                for (const [key, data] of xpCache.entries()) {
                    if (data.needsUpdate) {
                        const [gId, uId] = key.split(':');
                        const syncGuild = client.guilds.cache.get(gId);
                        if (syncGuild) data.guildName = syncGuild.name;
                        await saveToDatabase(pool, gId, uId, data);
                        data.needsUpdate = false;
                        count++;
                    }
                }
                const logChannel = await getChannel(message.guild, 'log_channel');
                if (logChannel) {
                    const syncEmbed = new EmbedBuilder().setTitle('♻️ Manual Sync Executed').setDescription(`Admin **${message.member.displayName}** triggered a manual sync.\nUpdated **${count}** pirate profiles.`).setColor('#2ecc71').setTimestamp();
                    logChannel.send({ embeds: [syncEmbed] });
                }
            } catch (e) { console.error(e); }
            return;
        }

        // НАЧИСЛЯВАНЕ НА XP И АНТИ-СПАМ СИСТЕМА
        let now = Date.now();
        let track = messageTracker.get(userId) || { count: 0, lastReset: now };
        let warnData = warnTracker.get(userId) || { warns: 0, lastWarnTime: 0 };

        if (now - track.lastReset > 10000) { track.count = 0; track.lastReset = now; }
        track.count += 1;
        messageTracker.set(userId, track);

        let words = message.content?.trim() ? message.content.trim().split(/\s+/).length : 0;
        let baseXP = message.attachments.size > 0 ? 35 : 15;
        let lengthBonus = Math.min(Math.floor(words / 10) * 10, 50);
        let multiplier = 1;
        let shouldWarn = false;

        if (track.count > 3) { multiplier = 0.7; shouldWarn = true; }
        if (track.count > 6) { multiplier = 0.4; shouldWarn = true; }
        if (track.count > 10) { multiplier = 0.1; shouldWarn = true; }

        let xpGain = Math.floor((baseXP + lengthBonus) * multiplier);
        userData.xp += xpGain;

        const currentNeededXP = 200 + (userData.level * 80);

        // ПРОВЕРКА ЗА LEVEL UP
        if (userData.xp >= currentNeededXP) {
            userData.level++;
            userData.xp = 0;
            const roleData = RANK_ROLES[userData.level];
            const lvlChannel = await getChannel(message.guild, 'level_up_channel');

            if (lvlChannel) {
                const customMsg = roleData ? roleData.msg : FUNNY_FALLBACKS[Math.floor(Math.random() * FUNNY_FALLBACKS.length)];
                const lvEmbed = new EmbedBuilder()
                    .setAuthor({ name: `${message.member.displayName} ranked up!`, iconURL: message.author.displayAvatarURL() })
                    .setDescription(`Congratulations ${message.author}!\n🔹 **Level:** \`${userData.level}\`\n🔹 **Status:** **${roleData?.name || "Wanderer"}**\n\n> *"${customMsg}"*`)
                    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                    .setColor(roleData?.color || '#34495e');
                lvlChannel.send({ content: `${message.author}`, embeds: [lvEmbed] }).catch(() => {});
            }

            if (roleData && message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                const newRole = await getOrCreateRole(message.guild, roleData);
                if (newRole) {
                    const allRankNames2 = Object.values(RANK_ROLES).map(r => r.name);
                    const oldRoles = message.member.roles.cache.filter(r => allRankNames2.includes(r.name));
                    if (oldRoles.size > 0) await message.member.roles.remove(oldRoles).catch(() => {});
                    await message.member.roles.add(newRole).catch(() => {});
                }
            }
            await saveToDatabase(pool, guildId, userId, userData);
            userData.needsUpdate = false;
        } else {
            userData.needsUpdate = true;
        }

        // Спам предупреждения и мут
        if (shouldWarn && now - (warnData.lastWarnTime || 0) > 10000) {
            warnData.warns += 1;
            warnData.lastWarnTime = now;
            warnTracker.set(userId, warnData);
            const warnMsg = await message.channel.send(`⚠️ ${message.author} stop spamming! Warning **${warnData.warns}/3**`).catch(() => {});
            if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
            
            if (warnData.warns >= 3) {
                const member = message.member;
                if (member && member.moderatable) await member.timeout(10 * 60 * 1000, "Spam - 3 warnings reached").catch(() => {});
                warnTracker.set(userId, { warns: 0, lastWarnTime: 0 });
                const muteMsg = await message.channel.send(`🔇 ${message.author} has been muted for **10 minutes**.`).catch(() => {});
                if (muteMsg) setTimeout(() => muteMsg.delete().catch(() => {}), 8000);
            }
        }
        xpCache.set(cacheKey, userData);
    });

    // СЕДМИЧЕН ТОП 10 КРОН
    cron.schedule('59 23 * * 0', async () => {
        client.guilds.cache.forEach(async (guild) => {
            const statsChannel = await getChannel(guild, 'stats_channel');
            if (!statsChannel) return;
            try {
                const res = await pool.query('SELECT username, level, xp FROM levels WHERE guild_id = $1 ORDER BY level DESC, xp DESC LIMIT 10', [guild.id]);
                const desc = res.rows.map((row, i) => {
                    let icon = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `\`#${i + 1}\``;
                    return `${icon} **${row.username || 'Unknown'}** — Level \`${row.level}\` (${row.xp} XP)`;
                }).join('\n');
                const embed = new EmbedBuilder().setTitle('🏆 The Loudest Pirates of the Week').setColor('#FF4500').setDescription(`${desc}`).setTimestamp();
                statsChannel.send({ content: "🔔 **WEEKLY LEADERBOARD IS HERE!**", embeds: [embed] });
            } catch (e) { console.error(e); }
        });
    }, { timezone: "Europe/London" });

    // АВТОМАТИЧНА СИНХРОНИЗАЦИЯ
    cron.schedule('0 */2 * * *', async () => {
        try {
            let count = 0;
            for (const [key, data] of xpCache.entries()) {
                if (data.needsUpdate) {
                    const [gId, uId] = key.split(':');
                    const guild = client.guilds.cache.get(gId);
                    if (guild) data.guildName = guild.name;
                    await saveToDatabase(pool, gId, uId, data);
                    data.needsUpdate = false;
                    count++;
                }
            }
        } catch (e) { console.error(e); }
    }, { timezone: "Europe/London" });
};
