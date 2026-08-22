/**
 * shipStatus.js — Ship crew status embeds (HP / Fatigue), manual + AI image reading
 * ============================================================================
 * WHAT THIS DOES:
 *   1. !shipstatus title:<name> unit1:<name>,<percent>[,<label>] unit2:...
 *      → posts (or edits, if one already exists for that ship) a status embed
 *        with a bar per unit. Same idea as the screenshot you found on the
 *        other server, rebuilt with plain Discord embeds (text bars, not a
 *        rendered image — see NOTE at the bottom of this file).
 *
 *   2. !shipstatus-image [title]  (with one or more images attached to the message)
 *      → sends the screenshot(s) to a vision-capable AI model, asks it to read
 *        off unit names/percentages/labels (merging units across all attached
 *        images into one list if you send several), then shows YOU a preview
 *        with Confirm/Cancel buttons before touching the real embed. Nothing
 *        is posted/edited automatically — a human always approves it, because
 *        AI reading of small game-UI text can misfire.
 *
 *   Optional: !setconfig ship_status_channel <channel-id>
 *      → if set, BOTH commands above always post/update in that channel,
 *        no matter which channel the command was typed in. If not set,
 *        they fall back to whatever channel the command was used in.
 *
 * HOW TO REMOVE THIS FEATURE COMPLETELY:
 *   1. Delete this file (utilities/shipStatus.js).
 *   2. In main.js, remove the 3 lines tagged "// [ShipStatus]".
 *   That's it. No DB migration needed — it only ever writes normal
 *   guild_config rows (keys starting with "shipstatus_"), which just sit
 *   there unused and harmless if you remove the feature later.
 *
 * PERMISSIONS: same as the other ship-admin commands — Administrator, server
 * owner, or the configured `mod_role`.
 * ============================================================================
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Groq = require('groq-sdk');
const axios = require('axios');
const { getConfig, setConfig, getChannel } = require('./guildConfig');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Groq's current vision-capable model (as of Aug 2026). NOTE: llama-4-scout was
// decommissioned by Groq — same issue you hit with the translator earlier.
// qwen/qwen3.6-27b is listed by Groq as a "preview" vision model, so if Groq
// swaps it again later, this is the one constant to update.
const VISION_MODEL = 'qwen/qwen3.6-27b';

// ─────────────────────────────────────────────
// Pending AI previews waiting for Confirm/Cancel (in-memory, short-lived)
// token -> { guildId, channelId, requesterId, data }
// ─────────────────────────────────────────────
const pendingPreviews = new Map();
const PENDING_TTL_MS = 10 * 60 * 1000; // 10 минути

function rememberPending(token, entry) {
    pendingPreviews.set(token, { ...entry, expiresAt: Date.now() + PENDING_TTL_MS });
    // почистваме стари записи мързеливо при всяко ново добавяне
    for (const [t, e] of pendingPreviews) {
        if (e.expiresAt < Date.now()) pendingPreviews.delete(t);
    }
}

// ─────────────────────────────────────────────
// Permission check — огледало на shipAdminCommands логиката в ship.js
// ─────────────────────────────────────────────
async function isModOrAdmin(member) {
    if (!member) return false;
    if (member.permissions.has('Administrator')) return true;
    if (member.guild.ownerId === member.id) return true;
    const modRoleId = await getConfig(member.guild.id, 'mod_role');
    return modRoleId ? member.roles.cache.has(modRoleId) : false;
}

// ─────────────────────────────────────────────
// Parsing: "title:Embra unit1:EMP Lucky,100 unit2:Imhotep,33,Team 3 Fatigue -30%"
// Delimiters are "title:" / "unitN:" — NOT plain spaces, so names with
// spaces (e.g. "EMP Lucky") survive intact.
// ─────────────────────────────────────────────
function parseShipStatusText(raw) {
    const tokenRegex = /(?:^|\s)(title|unit\d+):/g;
    const matches = [...raw.matchAll(tokenRegex)];
    if (matches.length === 0) return null;

    const result = { title: null, units: [] };

    for (let i = 0; i < matches.length; i++) {
        const key = matches[i][1];
        const start = matches[i].index + matches[i][0].length;
        const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
        const value = raw.slice(start, end).trim();
        if (!value) continue;

        if (key === 'title') {
            result.title = value;
            continue;
        }

        const parts = value.split(',').map(p => p.trim());
        const name = parts[0];
        const percentRaw = parts[1];
        const label = parts.length > 2 ? parts.slice(2).join(',').trim() : null;
        if (!name || percentRaw === undefined) continue;

        const percent = parseFloat(percentRaw.replace('%', ''));
        if (isNaN(percent)) continue;

        result.units.push({ name, percent: Math.max(0, Math.min(100, percent)), label: label || null });
    }

    if (!result.title || result.units.length === 0) return null;
    return result;
}

function shipKeyFromTitle(title) {
    return title.toLowerCase().trim().replace(/[^a-z0-9а-я]+/gi, '_').slice(0, 60);
}

// ─────────────────────────────────────────────
// Ако е зададен `ship_status_channel`, статусите ВИНАГИ отиват там —
// независимо откъде е пусната командата. Иначе — fallback на текущия канал.
// ─────────────────────────────────────────────
async function resolveTargetChannel(guild, fallbackChannel) {
    const configured = await getChannel(guild, 'ship_status_channel');
    return configured || fallbackChannel;
}

// ─────────────────────────────────────────────
// Embed builder (text progress bar — see NOTE at bottom of file)
// ─────────────────────────────────────────────
function buildBar(percent, length = 12) {
    const filled = Math.round((percent / 100) * length);
    return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function buildShipStatusEmbed(data) {
    const avg = data.units.reduce((sum, u) => sum + u.percent, 0) / data.units.length;
    const color = avg >= 60 ? '#2ecc71' : avg >= 30 ? '#f39c12' : '#e74c3c';

    const embed = new EmbedBuilder()
        .setTitle(`🚢 ${data.title} — Ship Status`)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: 'Updates when re-run with the same title' });

    const lines = data.units.map(u => {
        const nameLine = u.label ? `**${u.name}** *(${u.label})*` : `**${u.name}**`;
        if (u.percent <= 0) {
            return `${nameLine}\n🚫 \`[0.00%]\``;
        }
        return `${nameLine}\n\`${buildBar(u.percent)}\` \`[${u.percent.toFixed(2)}%]\``;
    });

    // Discord embed descriptions cap at 4096 chars — chunk into fields if long
    let desc = '';
    let usedDescription = false;
    for (const line of lines) {
        if (!usedDescription && (desc + line + '\n\n').length <= 4000) {
            desc += line + '\n\n';
        } else {
            usedDescription = true;
            embed.addFields({ name: '\u200b', value: line });
        }
    }
    if (desc) embed.setDescription(desc.trim());

    return embed;
}

// ─────────────────────────────────────────────
// Post once / edit next time — same pattern as shiplessList.js
// ─────────────────────────────────────────────
async function postOrUpdateShipStatus(guild, channel, data) {
    const key = shipKeyFromTitle(data.title);
    const embed = buildShipStatusEmbed(data);
    const configKey = `shipstatus_msg_${key}`;
    const existingRef = await getConfig(guild.id, configKey); // "channelId:messageId"

    if (existingRef) {
        const [oldChannelId, oldMessageId] = existingRef.split(':');
        try {
            const oldChannel = oldChannelId === channel.id ? channel : await guild.channels.fetch(oldChannelId);
            const oldMessage = await oldChannel.messages.fetch(oldMessageId);
            await oldMessage.edit({ embeds: [embed] });
            return oldMessage;
        } catch (err) {
            console.log(`⚠️ [ShipStatus] Old message for "${data.title}" not found, posting a new one: ${err.message}`);
        }
    }

    const newMessage = await channel.send({ embeds: [embed] });
    await setConfig(guild.id, configKey, `${channel.id}:${newMessage.id}`, guild.name);
    return newMessage;
}

// ─────────────────────────────────────────────
// AI image reading — Groq vision model → strict JSON
// Приема МАСИВ от image URL-и (една или повече прикачени снимки, всичките
// части от статуса на един и същ кораб) и ги праща накуп в едно извикване,
// за да може AI-то да ги съчетае в един общ списък units.
// ─────────────────────────────────────────────
async function readShipStatusFromImage(imageUrls, titleHint) {
    const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];

    const imageContentBlocks = await Promise.all(urls.map(async (url) => {
        const imgRes = await axios.get(url, { responseType: 'arraybuffer' });
        const base64 = Buffer.from(imgRes.data).toString('base64');
        const contentType = imgRes.headers['content-type'] || 'image/png';
        return { type: 'image_url', image_url: { url: `data:${contentType};base64,${base64}` } };
    }));

    const systemPrompt = `You read one or more screenshots of a game's ship crew status panel (health/fatigue bars per crew member). ${urls.length > 1 ? `You will receive ${urls.length} screenshots — treat them as parts of the SAME ship's crew status (e.g. different scroll positions), not separate ships. Combine every unit you see across all images into ONE unified list. If the same unit name appears in more than one image, include it only once.` : ''}
Return ONLY a strict JSON object, no markdown, no commentary, matching exactly:
{"title": "string or null", "units": [{"name": "string", "percent": number (0-100), "label": "string or null"}]}
Rules:
- One entry per visible crew member/unit name, across ALL provided images combined.
- "percent" is the health/HP percentage shown for that unit (0 if it shows a disabled/blocked icon with no bar).
- Each unit usually has three small tabs/buttons labeled "Team 1", "Team 2", "Team 3" — exactly one of
  them is visually highlighted/selected (brighter fill / different color than the other two, which look
  greyed-out or dimmed). Identify which one (1, 2, or 3) is highlighted for that unit.
- Below the name there may also be a separate fatigue bar or fatigue percentage (often a colored bar
  distinct from the HP bar, or text like "Fatigue -30%"). Read that value if visible.
- Combine both into "label" using EXACTLY this format when you have them: "Team <N> Fatigue -<X>%"
  (e.g. "Team 2 Fatigue -30%"). If only the team tab is visible with no fatigue value, use "Team <N>".
  If only a fatigue value is visible with no clear team tab, use "Fatigue -<X>%". If neither is visible,
  set "label" to null. Never guess numbers you cannot actually read.
- If you cannot confidently read a title for the panel, set "title" to null.
- Never invent units that are not visibly in any of the images.`;

    const response = await groq.chat.completions.create({
        model: VISION_MODEL,
        max_tokens: 2500,
        temperature: 0,
        // qwen/qwen3.6-27b е reasoning модел — "none" изключва <think> разсъжденията,
        // същото решение като в translate.js за flag-reaction/auto-translate.
        // ВАЖНО: НЕ комбинирай с response_format:"json_object" — Groq прилага
        // grammar-constrained decoding, което се чупи от reasoning токените и
        // връща 400 "Failed to validate JSON" с празен failed_generation.
        reasoning_effort: 'none',
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: urls.length > 1
                            ? `Read these ${urls.length} ship status screenshots (same ship) and return the combined JSON described.`
                            : 'Read this ship status screenshot and return the JSON described.'
                    },
                    ...imageContentBlocks
                ]
            }
        ]
    });

    let raw = response.choices[0]?.message?.content || '';
    // qwen/qwen3.6-27b е reasoning модел — по подразбиране пише <think>...</think>
    // разсъждения преди истинския отговор. Махаме ги, после markdown fences, ако има.
    raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

    // Ако след чистенето остане текст преди/след JSON-а, изрязваме до първата { и последната }
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        raw = raw.slice(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(raw); // ако това хвърли грешка, я хващаме извън функцията

    if (!Array.isArray(parsed.units) || parsed.units.length === 0) {
        throw new Error(`AI не разчете нито един unit от ${urls.length > 1 ? 'снимките' : 'снимката'}.`);
    }

    // Премахваме евентуални дубликати по име (case-insensitive), ако AI-то все пак
    // повтори unit от няколко снимки — пазим първото срещане
    const seenNames = new Set();
    const units = parsed.units
        .map(u => ({
            name: String(u.name || '').trim(),
            percent: Math.max(0, Math.min(100, Number(u.percent) || 0)),
            label: u.label ? String(u.label).trim() : null
        }))
        .filter(u => {
            if (u.name.length === 0) return false;
            const key = u.name.toLowerCase();
            if (seenNames.has(key)) return false;
            seenNames.add(key);
            return true;
        });

    if (units.length === 0) throw new Error(`AI не разчете нито един валиден unit от ${urls.length > 1 ? 'снимките' : 'снимката'}.`);

    return {
        title: (titleHint || parsed.title || 'Ship').toString().trim(),
        units
    };
}

function buildPreviewEmbed(data) {
    const embed = buildShipStatusEmbed(data);
    embed.setFooter({ text: '⚠️ AI-read preview — press Confirm to post/update, or Cancel to discard.' });
    return embed;
}

function buildPreviewRow(token) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`shipstatus_confirm:${token}`).setLabel('✅ Confirm').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`shipstatus_cancel:${token}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Danger)
    );
}

// ─────────────────────────────────────────────
// Message command handler — !shipstatus / !shipstatus-image
// Return true if the message was handled (so main.js can stop further processing)
// ─────────────────────────────────────────────
async function handleShipStatusMessage(msg) {
    if (msg.author.bot || !msg.guild) return false;
    const content = msg.content.trim();
    if (!content.toLowerCase().startsWith('!shipstatus')) return false;

    if (!(await isModOrAdmin(msg.member))) {
        await msg.reply('❌ Only Moderators/Admins can update ship status.');
        return true;
    }

    // ── !shipstatus-image [title] + 1 or more attached screenshots ──
    if (content.toLowerCase().startsWith('!shipstatus-image')) {
        const imageAttachments = [...msg.attachments.values()].filter(a => (a.contentType || '').startsWith('image/'));
        if (imageAttachments.length === 0) {
            await msg.reply('❌ Attach one or more screenshots to the message when using `!shipstatus-image [title]`.');
            return true;
        }
        if (imageAttachments.length > 8) {
            await msg.reply('❌ Too many screenshots at once (max 8). Split into a couple of `!shipstatus-image` messages.');
            return true;
        }
        const titleHint = content.slice('!shipstatus-image'.length).trim() || null;
        const imageUrls = imageAttachments.map(a => a.url);

        const loadingMsg = await msg.reply(
            imageUrls.length > 1
                ? `🔎 Reading ${imageUrls.length} screenshots with AI, one moment...`
                : '🔎 Reading the screenshot with AI, one moment...'
        );
        try {
            const data = await readShipStatusFromImage(imageUrls, titleHint);
            const targetChannel = await resolveTargetChannel(msg.guild, msg.channel);
            const token = `${msg.id}`;
            rememberPending(token, {
                guildId: msg.guild.id,
                channelId: targetChannel.id,
                requesterId: msg.author.id,
                data
            });
            const destNote = targetChannel.id !== msg.channel.id ? ` (will be posted in ${targetChannel} on confirm)` : '';
            await loadingMsg.edit({
                content: `Here's what I read from the image for **${data.title}**${destNote} — check it before confirming:`,
                embeds: [buildPreviewEmbed(data)],
                components: [buildPreviewRow(token)]
            });
        } catch (err) {
            console.error('[ShipStatus] AI image read error:', err.message);
            await loadingMsg.edit(`❌ Couldn't read that screenshot reliably: \`${err.message}\`\nTry a clearer screenshot, or use \`!shipstatus\` manually.`);
        }
        return true;
    }

    // ── !shipstatus title:... unit1:... (manual, unchanged from your example) ──
    const rest = content.slice('!shipstatus'.length).trim();
    const data = parseShipStatusText(rest);
    if (!data) {
        await msg.reply(
            '❌ Format: `/shipstatus title:Embra unit1:EMP Lucky,100 unit2:Jochwirt,92 unit3:Imhotep,33,Team 3 Fatigue -30%`\n' +
            'Or attach a screenshot and use `!shipstatus-image [title]` to let AI fill it in for you.'
        );
        return true;
    }

    try {
        const targetChannel = await resolveTargetChannel(msg.guild, msg.channel);
        await postOrUpdateShipStatus(msg.guild, targetChannel, data);
        await msg.delete().catch(() => {});

        // Ако статусът отива в друг канал от този, в който е писана командата — кратко потвърждение тук
        if (targetChannel.id !== msg.channel.id) {
            const note = await msg.channel.send(`✅ Ship status for **${data.title}** posted/updated in ${targetChannel}.`);
            setTimeout(() => note.delete().catch(() => {}), 4000);
        }
    } catch (err) {
        console.error('[ShipStatus] manual update error:', err.message);
        await msg.reply(`❌ Error updating ship status: \`${err.message}\``);
    }
    return true;
}

// ─────────────────────────────────────────────
// Button interaction handler — Confirm/Cancel on the AI preview
// Return true if the interaction was handled
// ─────────────────────────────────────────────
async function handleShipStatusInteraction(interaction) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith('shipstatus_confirm:') && !interaction.customId.startsWith('shipstatus_cancel:')) return false;

    const [action, token] = interaction.customId.split(':');
    const pending = pendingPreviews.get(token);

    if (!pending || pending.expiresAt < Date.now()) {
        pendingPreviews.delete(token);
        await interaction.update({ content: '⌛ This preview expired. Run `!shipstatus-image` again.', embeds: [], components: [] });
        return true;
    }

    if (!(await isModOrAdmin(interaction.member))) {
        await interaction.reply({ content: '❌ Only Moderators/Admins can confirm this.', flags: 64 });
        return true;
    }

    if (action === 'shipstatus_cancel') {
        pendingPreviews.delete(token);
        await interaction.update({ content: '❌ Discarded — nothing was posted or changed.', embeds: [], components: [] });
        return true;
    }

    // Confirm
    try {
        const channel = interaction.channel.id === pending.channelId
            ? interaction.channel
            : await interaction.guild.channels.fetch(pending.channelId);
        const posted = await postOrUpdateShipStatus(interaction.guild, channel, pending.data);
        pendingPreviews.delete(token);
        await interaction.update({
            content: `✅ Ship status for **${pending.data.title}** posted/updated by **${interaction.member.displayName}** → ${posted.url ? posted.url : ''}`,
            embeds: [buildShipStatusEmbed(pending.data)],
            components: []
        });
    } catch (err) {
        console.error('[ShipStatus] confirm apply error:', err.message);
        await interaction.update({ content: `❌ Error applying the update: \`${err.message}\``, components: [] });
    }
    return true;
}

module.exports = {
    handleShipStatusMessage,
    handleShipStatusInteraction,
    // exported mainly for testing / reuse, not required by main.js
    parseShipStatusText,
    buildShipStatusEmbed
};

/**
 * NOTE on visuals:
 * The screenshot you found uses a smooth, rounded, colored progress bar —
 * that's almost certainly a Canvas-rendered image, not a native Discord
 * embed element (Discord embeds don't support real progress bars). This
 * file instead renders bars with Unicode blocks (█░░░) inside a normal
 * embed, which needs zero extra dependencies and will always deploy
 * cleanly on Railway. If you later want the exact pixel-perfect bar look,
 * that's a separate, heavier step (the `canvas` npm package + generating a
 * PNG per update) — happy to build that as a v2 once this version is
 * confirmed working.
 */
