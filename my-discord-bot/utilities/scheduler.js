const cron = require("node-cron");
const { EmbedBuilder } = require("discord.js");
const { sendEmergencyDMs } = require('./dmHandler.js');
const staticList = require("../data/staticReminders");
const { pool } = require("./db");
const { getConfig, getChannel, getAllConfig } = require("./guildConfig");

const isValidCron = (expr) => typeof expr === "string" && cron.validate(expr);

// ─────────────────────────────────────────────
// Инициализира автоматичните таймери
// ─────────────────────────────────────────────
function initSchedulers(client, pool) {
    staticList.forEach(rem => {
        if (!isValidCron(rem.cron)) return;
        cron.schedule(rem.cron, () => {
            client.guilds.cache.forEach(async (guild) => {
                const ch = await getChannel(guild, 'reminders_channel');
                if (ch) {
                    const mention = await getMention(guild, rem.target);
                    const finalMsg = typeof rem.message === 'function' ? rem.message() : rem.message;
                    ch.send(`${mention} ${finalMsg}`);
                }
            });
        }, { timezone: "Europe/London" });
    });

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

// ─────────────────────────────────────────────
// Helper: get all configured mania guilds for this server / Помощна: взима гилдиите
// Връща масив: [{ key, roleId, planChannelId, notifyChannelId }]
// ─────────────────────────────────────────────
async function getManiaGuilds(guildId) {
    const config = await getAllConfig(guildId);
    return Object.keys(config)
        .filter(k => k.startsWith('mania_role_'))
        .map(k => {
            const key = k.replace('mania_role_', '');
            return {
                key,
                roleId: config[`mania_role_${key}`],
                planChannelId: config[`mania_plan_channel_${key}`],   // каналът за гласуване
                notifyChannelId: config[`mania_notify_channel_${key}`] // каналът за известия
            };
        });
}

// ─────────────────────────────────────────────
// MANIA PLAN
// ─────────────────────────────────────────────
async function handleManiaPlan(msg) {
    const arg = msg.content.toLowerCase().replace('mania-plan', '').trim();

    const guilds = await getManiaGuilds(msg.guild.id);
    if (guilds.length === 0) {
        return msg.reply("❌ No guilds configured. Use `!mania-addguild <key> @role #plan-channel #notify-channel`");
    }

    const targets = arg === 'all' ? guilds : guilds.filter(g => g.key === arg);

    if (targets.length === 0) {
        const keys = guilds.map(g => `\`${g.key}\``).join(', ');
        return msg.reply(`❌ Guild \`${arg}\` not found. Available: ${keys} or \`all\``);
    }

    for (const guild of targets) {
        await createPlan(msg, guild, arg === 'all');
    }

    if (msg.deletable) await msg.delete().catch(() => {});
}

async function createPlan(msg, guildData, useEveryone) {
    const { key, roleId, planChannelId, notifyChannelId } = guildData;

    // Каналът за гласуване — ако е зададен ползваме него, иначе текущия
    let planChannel = msg.channel;
    if (planChannelId) {
        const fetched = msg.client.channels.cache.get(planChannelId);
        if (fetched) planChannel = fetched;
    }

    const rolePing = `<@&${roleId}>`;
    const pingContent = useEveryone ? `@everyone (${rolePing})` : rolePing;
    const guildName = key.toUpperCase();

    const planEmbed = new EmbedBuilder()
        .setTitle(`⚔️ MANIA FORMATION - ${guildName}`)
        .setDescription(`${pingContent} Who will be able to play today?\n\n✅ - I'm in\n❌ - Can't play\n⏳ - Not sure yet`)
        .setColor("#0099FF")
        .setTimestamp();

    const planMsg = await planChannel.send({ content: pingContent, embeds: [planEmbed] });
    await planMsg.react("✅");
    await planMsg.react("❌");
    await planMsg.react("⏳");

    // Записваме plan message ID в базата
    try {
        await pool.query(
            "INSERT INTO global_vars (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
            [`planId_${msg.guild.id}_${key}`, planMsg.id]
        );
        // Запазваме и в кой канал е планът (за mania-list)
        await pool.query(
            "INSERT INTO global_vars (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
            [`planChannel_${msg.guild.id}_${key}`, planChannel.id]
        );
    } catch (err) {
        console.error("❌ Database Error:", err.message);
    }

    // Известие в notify канала
    if (notifyChannelId) {
        try {
            const notifyChannel = msg.client.channels.cache.get(notifyChannelId)
                || await msg.client.channels.fetch(notifyChannelId).catch(() => null);
            if (notifyChannel) {
                await notifyChannel.send(`🚨 **${pingContent} A new Mania Plan for ${guildName} has been posted!**\n🔗 ${planMsg.url}`);
            }
        } catch (e) {
            console.error("[LOG] Error sending notification:", e.message);
        }
    }
}

// ─────────────────────────────────────────────
// MANIA LIST
// ─────────────────────────────────────────────
async function handleManiaList(msg) {
    const arg = msg.content.toLowerCase().replace('mania-list', '').trim();

    const guilds = await getManiaGuilds(msg.guild.id);
    const guildData = guilds.find(g => g.key === arg);

    if (!arg || !guildData) {
        const keys = guilds.map(g => `\`${g.key}\``).join(', ');
        return msg.reply(`❌ Use: \`mania-list <key>\`. Available: ${keys}`);
    }

    try {
        const dbKey = `planId_${msg.guild.id}_${arg}`;
        const dbChannel = `planChannel_${msg.guild.id}_${arg}`;

        const res = await pool.query("SELECT value FROM global_vars WHERE key = $1", [dbKey]);
        const resCh = await pool.query("SELECT value FROM global_vars WHERE key = $1", [dbChannel]);

        if (!res.rows || res.rows.length === 0) {
            return msg.reply(`❌ No active plan for **${arg.toUpperCase()}**!`);
        }

        const targetPlanId = res.rows[0].value;
        const targetChannelId = resCh.rows?.[0]?.value || msg.channel.id;

        // Find the channel where the plan was posted / Намираме канала
        const planChannel = msg.client.channels.cache.get(targetChannelId) || msg.channel;
        let planMsg = planChannel.messages.cache.get(targetPlanId)
            || await planChannel.messages.fetch(targetPlanId).catch(() => null);

        if (!planMsg) return msg.reply(`❌ Original plan message not found.`);

        const reactionYes = planMsg.reactions.cache.get("✅");
        const usersYes = reactionYes ? await reactionYes.users.fetch() : new Map();
        const confirmed = usersYes.filter(u => !u.bot).map(u => `<@${u.id}>`);

        const reactionNo = planMsg.reactions.cache.get("❌");
        const usersNo = reactionNo ? await reactionNo.users.fetch() : new Map();
        const declined = usersNo.filter(u => !u.bot).map(u => `<@${u.id}>`);

        const targetRole = msg.guild.roles.cache.get(guildData.roleId);
        if (!targetRole) return msg.reply("❌ Role not found!");

        const votedIds = [...usersYes.keys(), ...usersNo.keys()];
        const missing = targetRole.members
            .filter(m => !m.user.bot && !votedIds.includes(m.id))
            .map(m => `<@${m.id}>`);

        const statusEmbed = new EmbedBuilder()
            .setTitle(`⚔️ FORMATION STATUS - ${arg.toUpperCase()}`)
            .setDescription(`Formation for: <@&${guildData.roleId}>`)
            .setColor("#0099FF")
            .addFields(
                { name: `✅ CONFIRMED (${confirmed.length})`, value: confirmed.join(", ") || "None yet", inline: false },
                { name: `❌ DECLINED (${declined.length})`, value: declined.join(", ") || "None", inline: false }
            );

        await msg.channel.send({ embeds: [statusEmbed] });

        if (missing.length > 0) {
            const missingText = missing.join(" ");
            await msg.channel.send(`🔔 **Attention!** These players from **${arg.toUpperCase()}** haven't voted yet:\n${missingText}`);

            // Also send to the notify channel / Изпраща и в notify канала
            if (guildData.notifyChannelId) {
                const notifyChannel = msg.client.channels.cache.get(guildData.notifyChannelId);
                if (notifyChannel) {
                    await notifyChannel.send(`🚨 **MANDATORY!** Members of **${arg.toUpperCase()}** need to vote:\n${missingText}\n\n🔗 **Plan:** ${planMsg.url}`);
                }
            }
        } else {
            await msg.channel.send(`✅ Everyone from **${arg.toUpperCase()}** has voted!`);
        }

        if (msg.deletable) await msg.delete().catch(() => {});

    } catch (e) {
        console.error("Error in mania-list:", e.message);
        msg.reply("❌ Rate limited or error. Please wait 10-20 seconds.");
    }
}

// ─────────────────────────────────────────────
// MANIA DM
// ─────────────────────────────────────────────
async function handleManiaDM(msg) {
    const arg = msg.content.toLowerCase().replace('mania-dm', '').trim();

    const guilds = await getManiaGuilds(msg.guild.id);
    const guildData = guilds.find(g => g.key === arg);

    if (!arg || !guildData) {
        const keys = guilds.map(g => `\`${g.key}\``).join(', ');
        return msg.reply(`❌ Use: \`mania-dm <key>\`. Available: ${keys}`);
    }

    try {
        const dbKey = `planId_${msg.guild.id}_${arg}`;
        const dbChannel = `planChannel_${msg.guild.id}_${arg}`;

        const res = await pool.query("SELECT value FROM global_vars WHERE key = $1", [dbKey]);
        const resCh = await pool.query("SELECT value FROM global_vars WHERE key = $1", [dbChannel]);

        if (!res.rows || res.rows.length === 0) {
            return msg.reply(`❌ No active plan for **${arg.toUpperCase()}** found!`);
        }

        const targetPlanId = res.rows[0].value;
        const targetChannelId = resCh.rows?.[0]?.value || msg.channel.id;

        const planChannel = msg.client.channels.cache.get(targetChannelId) || msg.channel;
        const planMsg = await planChannel.messages.fetch(targetPlanId).catch(() => null);
        if (!planMsg) return msg.reply("❌ Original plan message not found.");

        let votedIds = [];
        for (const [emoji, reaction] of planMsg.reactions.cache) {
            if (emoji === "✅" || emoji === "❌") {
                const users = await reaction.users.fetch();
                users.forEach(u => { if (!u.bot) votedIds.push(u.id); });
            }
        }

        const targetRole = msg.guild.roles.cache.get(guildData.roleId);
        if (!targetRole) return msg.reply("❌ Role not found!");

        const missingMembers = targetRole.members.filter(m => !m.user.bot && !votedIds.includes(m.id));

        if (missingMembers.size === 0) {
            return msg.reply(`✅ Everyone in **${arg.toUpperCase()}** has already voted!`);
        }

        const statusMsg = await msg.channel.send(`🚨 Sending emergency DMs to **${missingMembers.size}** members...`);
        const report = await sendEmergencyDMs(Array.from(missingMembers.values()), planMsg.url, arg.toUpperCase());
        await statusMsg.edit(`✅ **DM Blast Finished!**\n- Sent: ${report.successCount}\n- Failed: ${report.failCount}`);

        if (msg.deletable) await msg.delete().catch(() => {});

    } catch (error) {
        console.error("[LOG] FATAL ERROR:", error);
        msg.reply(`❌ **FATAL ERROR:** \`\`\`${error.message}\`\`\``);
    }
}

// ─────────────────────────────────────────────
// MANIA STRATEGY
// ─────────────────────────────────────────────
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

    lines.forEach(line => {
        if (line.includes('-')) {
            const firstDash = line.indexOf('-');
            const boss = line.substring(0, firstDash).trim().toUpperCase();
            const playersPart = line.substring(firstDash + 1).trim();
            const players = playersPart.split(/(?=\s@)|,\s*/).map(p => p.trim()).filter(p => p.length > 0);
            if (players.length > 0) {
                stratEmbed.addFields({ name: `⚔️ ${boss}`, value: `• ${players.join('\n• ')}`, inline: true });
            }
        }
    });

    await pool.query(
        "INSERT INTO global_vars (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [`last_strategy_${msg.guild.id}`, rawContent]
    );

    await msg.channel.send({ content: "@everyone 🚩 **TODAY'S TARGETS 👑 !**", embeds: [stratEmbed] });
    if (msg.deletable) await msg.delete().catch(() => {});
}

// ─────────────────────────────────────────────
// MANIA HELP
// ─────────────────────────────────────────────
async function handleManiaHelp(msg) {
    const helpEmbed = new EmbedBuilder()
        .setTitle("📖 Mania Command Guide")
        .setColor("#FF4500")
        .addFields(
            { name: "mania-plan <key> / all", value: "Start a Mania sign-up plan", inline: false },
            { name: "mania-list <key>", value: "Show who voted and ping missing members", inline: false },
            { name: "mania-dm <key>", value: "DM everyone who hasn't voted yet", inline: false },
            { name: "mania-strategy", value: "Post the battle plan\nFormat: `Boss - @player1 @player2` (one boss per line)", inline: false },
            { name: "⚙️ Setup (Admin)", value: "`!mania-addguild <key> @role #plan-channel #notify-channel`\n`!mania-guilds` — list all guilds\n`!mania-removeguild <key>` — remove a guild", inline: false }
        )
        .setFooter({ text: "Each line in strategy = one boss" });

    await msg.channel.send({ embeds: [helpEmbed] });
    if (msg.deletable) await msg.delete().catch(() => {});
}

async function getMention(guild, target) {
    if (target === "@everyone" || target === "@here") return target;
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === target.toLowerCase());
    if (role) return `<@&${role.id}>`;
    return target;
}

module.exports = { initSchedulers, isValidCron, handleManiaPlan, handleManiaList, handleManiaStrategy, handleManiaHelp, getMention, handleManiaDM };
