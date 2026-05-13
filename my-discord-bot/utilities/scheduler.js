const cron = require("node-cron");
const { EmbedBuilder } = require("discord.js");
const { sendEmergencyDMs } = require('./dmHandler.js');
const staticList = require("../data/staticReminders");
const path = require('path');
const { pool } = require("./db");
const { getConfig, getChannel } = require("./guildConfig"); // ✅ МУЛТИ-СЪРВЪР

let strategyMsgObject = null;

const isValidCron = (expr) => typeof expr === "string" && cron.validate(expr);

/**
 * Инициализира всички автоматични таймери
 */
function initSchedulers(client, pool) {
    // 1. СТАТИЧНИ НАПОМНЯНИЯ
    staticList.forEach(rem => {
        if (!isValidCron(rem.cron)) return;

        cron.schedule(rem.cron, () => {
            client.guilds.cache.forEach(async (guild) => {
                // ✅ МУЛТИ-СЪРВЪР: взима канала от конфига на ТОЗИ сървър
                const ch = await getChannel(guild, 'reminders_channel');
                if (ch) {
                    const mention = await getMention(guild, rem.target);
                    const finalMsg = typeof rem.message === 'function' ? rem.message() : rem.message;
                    ch.send(`${mention} ${finalMsg}`);
                }
            });
        }, { timezone: "Europe/London" });
    });

    // 2. ДИНАМИЧНИ НАПОМНЯНИЯ (от база данни)
    pool.query("SELECT * FROM reminders").then(res => {
        res.rows.forEach(rem => {
            if (!isValidCron(rem.cron)) return;
            cron.schedule(rem.cron, () => {
                const ch = client.channels.cache.get(rem.channel_id);
                if (ch) ch.send(rem.message);
            }, { timezone: "Europe/London" });
        });
    });
}

/**
 * MANIA PLAN
 */
async function handleManiaPlan(msg) {
    const content = msg.content.toLowerCase().trim();
    const arg = content.replace('mania-plan', '').trim();

    // ✅ МУЛТИ-СЪРВЪР: взима каналите и ролите от конфига на ТОЗИ сървър
    const mainChannelId = await getConfig(msg.guild.id, 'mania_main_channel');
    if (!mainChannelId) {
        return msg.reply("❌ `mania_main_channel` не е конфигуриран. Използвай `!setconfig mania_main_channel <channel_id>`");
    }

    // Динамично зареждаме всички настроени гилдии
    const { getAllConfig } = require('./guildConfig');
    const config = await getAllConfig(msg.guild.id);
    const allGuildKeys = Object.keys(config)
        .filter(k => k.startsWith('mania_role_'))
        .map(k => k.replace('mania_role_', ''));

    if (allGuildKeys.length === 0) {
        return msg.reply("❌ Няма настроени гилдии. Използвай `!mania-addguild <key> @role #channel`");
    }

    const roles = {};
    for (const key of allGuildKeys) {
        roles[key] = config[`mania_role_${key}`];
    }

    if (arg === 'all') {
        for (const key of allGuildKeys) {
            await createPlan(msg, key, roles[key], mainChannelId, true);
        }
    } else if (roles[arg]) {
        await createPlan(msg, arg, roles[arg], mainChannelId, false);
    } else {
        const errorMsg = await msg.reply("❌ Use: `mania-plan g1`, `g2` or `all`.");
        setTimeout(() => errorMsg.delete().catch(() => {}), 5000);
        return;
    }

    if (msg.deletable) await msg.delete().catch(() => {});
}

/**
 * Помощна функция за създаване на плана
 */
async function createPlan(msg, type, roleId, mainChannelId, useEveryone) {
    const targetRolePing = `<@&${roleId}>`;
    const pingContent = useEveryone ? `@everyone (${targetRolePing})` : targetRolePing;
    const guildName = type.toUpperCase();

    const planEmbed = new EmbedBuilder()
        .setTitle(`⚔️ MANIA FORMATION - ${guildName}`)
        .setDescription(`${pingContent} Who will be able to play today?\n\n✅ - I'm in\n❌ - Can't play\n⏳ - Not sure yet`)
        .setColor(type === 'g1' ? "#00FF00" : "#0099FF")
        .setTimestamp();

    const planMsg = await msg.channel.send({
        content: pingContent,
        embeds: [planEmbed]
    });

    await planMsg.react("✅");
    await planMsg.react("❌");
    await planMsg.react("⏳");

    // Записваме ID-то в базата (per-guild ключ)
    try {
        const dbKey = `planId_${msg.guild.id}_${type}`;
        await pool.query(
            "INSERT INTO global_vars (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
            [dbKey, planMsg.id]
        );
    } catch (err) {
        console.error("❌ Database Error:", err.message);
    }

    // Известие в главния канал
    try {
        let mainChannel = msg.client.channels.cache.get(mainChannelId);
        if (!mainChannel) {
            mainChannel = await msg.client.channels.fetch(mainChannelId).catch(() => null);
        }
        if (mainChannel) {
            await mainChannel.send(`🚨 **${pingContent} A new Mania Plan for ${guildName} has been posted: ${planMsg.url}**`);
        }
    } catch (e) {
        console.error("[LOG] Error sending notification:", e.message);
    }
}

/**
 * MANIA LIST
 */
async function handleManiaList(msg) {
    const content = msg.content.toLowerCase().trim();
    const parts = content.split(/\s+/);
    const arg = parts[1];

    // ✅ МУЛТИ-СЪРВЪР: взима от конфига на ТОЗИ сървър
    const mainChannelId = await getConfig(msg.guild.id, 'mania_main_channel');
    const roles = {
        'g1': await getConfig(msg.guild.id, 'mania_role_g1'),
        'g2': await getConfig(msg.guild.id, 'mania_role_g2')
    };

    if (!arg || !roles[arg]) {
        return msg.reply("❌ Use: `mania-list g1` or `mania-list g2`.");
    }
    if (!roles[arg]) {
        return msg.reply(`❌ \`mania_role_${arg}\` не е конфигуриран. Използвай \`!setconfig mania_role_${arg} <role_id>\``);
    }

    try {
        // ✅ МУЛТИ-СЪРВЪР: ключът включва guild ID-то
        const dbKey = `planId_${msg.guild.id}_${arg}`;
        const res = await pool.query("SELECT value FROM global_vars WHERE key = $1", [dbKey]);

        if (!res.rows || res.rows.length === 0) {
            return msg.reply(`❌ No active plan for **${arg.toUpperCase()}**!`);
        }

        const targetPlanId = res.rows[0].value;

        let planMsg = msg.channel.messages.cache.get(targetPlanId);
        if (!planMsg) {
            planMsg = await msg.channel.messages.fetch(targetPlanId).catch(() => null);
        }
        if (!planMsg) return msg.reply(`❌ Original message not found.`);

        const reactionYes = planMsg.reactions.cache.get("✅");
        const usersYes = reactionYes ? await reactionYes.users.fetch() : new Map();
        const confirmed = usersYes.filter(u => !u.bot).map(u => `<@${u.id}>`);

        const reactionNo = planMsg.reactions.cache.get("❌");
        const usersNo = reactionNo ? await reactionNo.users.fetch() : new Map();
        const declined = usersNo.filter(u => !u.bot).map(u => `<@${u.id}>`);

        const targetRole = msg.guild.roles.cache.get(roles[arg]);
        if (!targetRole) return msg.reply("❌ Role not found!");

        const votedIds = [...usersYes.keys(), ...usersNo.keys()];
        const missing = targetRole.members
            .filter(m => !m.user.bot && !votedIds.includes(m.id))
            .map(m => `<@${m.id}>`);

        const statusEmbed = new EmbedBuilder()
            .setTitle(`⚔️ FORMATION STATUS - ${arg.toUpperCase()}`)
            .setDescription(`Formation for: <@&${roles[arg]}>`)
            .setColor(arg === 'g1' ? "#00FF00" : "#0099FF")
            .addFields(
                { name: `✅ CONFIRMED (${confirmed.length})`, value: confirmed.join(", ") || "None yet", inline: false },
                { name: `❌ DECLINED (${declined.length})`, value: declined.join(", ") || "None", inline: false }
            );

        await msg.channel.send({ embeds: [statusEmbed] });

        if (missing.length > 0) {
            const missingText = missing.join(" ");
            await msg.channel.send(`🔔 **Attention!** These players from **${arg.toUpperCase()}** haven't voted yet:\n${missingText}`);

            if (mainChannelId) {
                const mainChannel = msg.client.channels.cache.get(mainChannelId);
                if (mainChannel) {
                    await mainChannel.send(`🚨 **MANDATORY!** Members of **${arg.toUpperCase()}** need to vote:\n${missingText}\n\n👉 **Go to channel:** <#${msg.channel.id}>\n🔗 **Direct Link to Plan:** ${planMsg.url}`);
                }
            }
        } else {
            await msg.channel.send(`✅ Everyone from **${arg.toUpperCase()}** has voted!`);
        }

        if (msg.deletable) await msg.delete().catch(() => {});

    } catch (e) {
        console.error("Грешка в mania-list:", e.message);
        msg.reply("❌ Rate limited or error. Please wait 10-20 seconds.");
    }
}

/**
 * MANIA DM
 */
async function handleManiaDM(msg) {
    const content = msg.content.toLowerCase().trim();
    const parts = content.split(/\s+/);
    const arg = parts[1];

    // ✅ МУЛТИ-СЪРВЪР: взима от конфига на ТОЗИ сървър
    const roles = {
        'g1': await getConfig(msg.guild.id, 'mania_role_g1'),
        'g2': await getConfig(msg.guild.id, 'mania_role_g2')
    };

    if (!arg || !roles[arg]) {
        return msg.reply("❌ Use: `mania-dm g1` or `mania-dm g2`.");
    }

    try {
        // ✅ МУЛТИ-СЪРВЪР: ключът включва guild ID-то
        const dbKey = `planId_${msg.guild.id}_${arg}`;
        const res = await pool.query("SELECT value FROM global_vars WHERE key = $1", [dbKey]);

        if (!res.rows || res.rows.length === 0) {
            return msg.reply(`❌ No active plan for **${arg.toUpperCase()}** found!`);
        }

        const targetPlanId = res.rows[0].value;
        const planMsg = await msg.channel.messages.fetch(targetPlanId).catch(() => null);

        if (!planMsg) {
            return msg.reply("❌ Original plan message not found in this channel.");
        }

        let votedIds = [];
        const reactions = planMsg.reactions.cache;
        for (const [emoji, reaction] of reactions) {
            if (emoji === "✅" || emoji === "❌") {
                const users = await reaction.users.fetch();
                users.forEach(u => { if (!u.bot) votedIds.push(u.id); });
            }
        }

        try {
            await msg.guild.members.fetch({ role: roles[arg] });
        } catch (fetchErr) {
            console.error("[LOG] Warning: Failed to fetch some members:", fetchErr.message);
        }

        const targetRole = msg.guild.roles.cache.get(roles[arg]);
        if (!targetRole) return msg.reply("❌ Role not found!");

        const missingMembers = targetRole.members.filter(m =>
            !m.user.bot && !votedIds.includes(m.id)
        );

        if (missingMembers.size === 0) {
            return msg.reply(`✅ Everyone in **${arg.toUpperCase()}** has already voted!`);
        }

        const statusMsg = await msg.channel.send(`🚨 Sending emergency DMs to **${missingMembers.size}** members...`);

        const report = await sendEmergencyDMs(
            Array.from(missingMembers.values()),
            planMsg.url,
            arg.toUpperCase()
        );

        await statusMsg.edit(`✅ **DM Blast Finished!**\n- Sent: ${report.successCount}\n- Failed: ${report.failCount}`);

        if (msg.deletable) await msg.delete().catch(() => {});

    } catch (error) {
        console.error("[LOG] FATAL ERROR:", error);
        msg.reply(`❌ **FATAL ERROR:** \`\`\`${error.message}\`\`\``);
    }
}

/**
 * MANIA STRATEGY
 */
async function handleManiaStrategy(msg, pool) {
    const rawContent = msg.content.replace(/mania-strategy/gi, "").trim();
    if (!rawContent) return;

    const strategyGifs = [
        "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3kxYzJmN3N2MTNqNzI4ZHk5dXVldWI3cjdvMndjdnJmMWN3bmdzdCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/QfD1Hv15WwflPZeeWF/giphy.gif",
        "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExODVhMWpwY3h6OGk5OW1ldDJucDVjZXp5ZjloNG82OW1pNjh0NDF1biZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Muqc4t03A8sz4ksa5i/giphy.gif",
        "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNzljYXR6cTQ2aWtrc25lbXljenVmMTN4YjdhMXcyNmJjeWdoZW1ueiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Rz24pRStq8KaEwz9c6/giphy.gif"
    ];
    const randomGif = strategyGifs[Math.floor(Math.random() * strategyGifs.length)];

    const lines = rawContent.split('\n').filter(l => l.trim() !== "");

    const stratEmbed = new EmbedBuilder()
        .setTitle("🏴‍☠️ DAILY BATTLE STRATEGY")
        .setDescription("All pirates to your positions!")
        .setColor("#FF4500")
        .setImage(randomGif)
        .setTimestamp();

    let fieldCount = 0;
    lines.forEach((line) => {
        if (line.includes('-')) {
            const firstDashIndex = line.indexOf('-');
            const boss = line.substring(0, firstDashIndex).trim().toUpperCase();
            const playersPart = line.substring(firstDashIndex + 1).trim();
            let players = playersPart.split(/(?=\s@)|(?<=me),?\s*/).map(p => p.trim()).filter(p => p.length > 0);
            if (players.length > 0) {
                stratEmbed.addFields({ name: `⚔️ ${boss}`, value: `• ${players.join('\n• ')}`, inline: true });
                fieldCount++;
            }
        }
    });

    await pool.query(
        `INSERT INTO global_vars (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [`last_strategy_${msg.guild.id}`, rawContent]
    );

    await msg.channel.send({
        content: "@everyone 🚩 **TODAY'S TARGETS 👑 !**",
        embeds: [stratEmbed]
    });

    if (msg.deletable) await msg.delete().catch(() => {});
}

/**
 * MANIA HELP
 */
async function handleManiaHelp(msg) {
    const helpEmbed = new EmbedBuilder()
        .setTitle("📖 Mania Command Guide")
        .setColor("#FF4500")
        .addFields(
            { name: "mania-plan g1 / g2 / all", value: "Start a Mania sign-up plan", inline: false },
            { name: "mania-list g1 / g2", value: "Show who voted and ping missing members", inline: false },
            { name: "mania-dm g1 / g2", value: "DM everyone who hasn't voted yet", inline: false },
            { name: "mania-strategy", value: "Post the battle plan\nFormat: `Boss - @player1 @player2` (one boss per line)", inline: false },
            { name: "⚙️ Setup (Admin)", value: "`!setconfig mania_main_channel <id>`\n`!setconfig mania_role_g1 <id>`\n`!setconfig mania_role_g2 <id>`", inline: false }
        )
        .setFooter({ text: "Each line in strategy = one boss" });

    await msg.channel.send({ embeds: [helpEmbed] });
    if (msg.deletable) await msg.delete().catch(() => {});
}

/**
 * Взима роля mention по име
 */
async function getMention(guild, target) {
    if (target === "@everyone" || target === "@here") return target;
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === target.toLowerCase());
    if (role) return `<@&${role.id}>`;
    return target;
}

module.exports = { initSchedulers, isValidCron, handleManiaPlan, handleManiaList, handleManiaStrategy, handleManiaHelp, getMention, handleManiaDM };
