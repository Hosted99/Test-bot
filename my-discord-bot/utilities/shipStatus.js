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
 *      → sends the screenshot(s) to Gemini (vision-capable AI), asks it to read
 *        off unit names/percentages/labels (merging units across all attached
 *        images into one list if you send several), then shows YOU a preview
 *        with Confirm/Cancel buttons before touching the real embed. Nothing
 *        is posted/edited automatically — a human always approves it, because
 *        AI reading of small game-UI text can misfire.
 *        REQUIRES: a GEMINI_API_KEY environment variable (Google AI Studio key).
 *        Images are also downscaled via Discord's CDN before sending, to keep
 *        upload size/latency down — see toResizedDiscordUrl() below.
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
const axios = require('axios');
const { getConfig, setConfig, getChannel } = require('./guildConfig');

// Gemini vision model (REST call via axios, no extra npm dependency needed).
// NOTE: gemini-2.5-pro is being retired by Google on 2026-10-16 — do NOT switch
// to that one. gemini-3.6-flash is the current GA Flash-tier model as of Aug 2026.
const VISION_MODEL = 'gemini-3.6-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent`;

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
// Parsing: "title:Sunny unit1:Akagami,100 unit2:Hosted,33,Team 3 Fatigue -30%"
// Delimiters are "title:" / "unitN:" — NOT plain spaces, so names with
// spaces (e.g. "Hosted) survive intact.
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
// Discord's media proxy (proxyURL, media.discordapp.net) поддържа on-the-fly
// resize през ?width= — режем размера на снимката ПРЕДИ да я пратим на AI,
// защото vision токените растат с резолюцията. Пълноразмерни game screenshots
// лесно надвишават TPM лимита на акаунта (виж грешката "Request too large").
// Никакви нови dependencies — просто друг URL за същия файл.
// ─────────────────────────────────────────────
function toResizedDiscordUrl(attachment, maxWidth = 1400) {
    const base = attachment.proxyURL || attachment.url;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}width=${maxWidth}`;
}

// ─────────────────────────────────────────────
// Едно AI извикване. Gemini НЯМА твърдия лимит "макс 3 снимки" на Groq, така
// че можем да пращаме до MAX_IMAGES_PER_AI_CALL накуп в едно извикване.
// ─────────────────────────────────────────────
async function readShipStatusBatch(imageUrls, titleHint) {
    const urls = imageUrls;

    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY липсва в environment variables.');
    }

    const imageParts = await Promise.all(urls.map(async (url) => {
        const imgRes = await axios.get(url, { responseType: 'arraybuffer' });
        const base64 = Buffer.from(imgRes.data).toString('base64');
        const mimeType = imgRes.headers['content-type'] || 'image/png';
        return { inlineData: { mimeType, data: base64 } };
    }));

    const systemPrompt = `You read one or more screenshots of a game's ship crew status panel (health/fatigue bars per crew member). ${urls.length > 1 ? `You will receive ${urls.length} screenshots — treat them as parts of the SAME ship's crew status (e.g. different scroll positions), not separate ships. Combine every unit you see across all images into ONE unified list. If the same unit name appears in more than one image, include it only once.` : ''}
Return ONLY a strict JSON object, no markdown, no commentary, matching exactly:
{"title": "string or null", "units": [{"name": "string", "percent": number (0-100), "label": "string or null"}]}
Rules:
- One entry per visible crew member/unit name, across ALL provided images combined.
- "percent" is the health/HP percentage shown for that unit (0 if it shows a disabled/blocked icon with no bar).
- If percent is 0 (the unit shows a disabled/blocked/"no entry" style icon instead of a bar), ALWAYS set
  "label" to null — do NOT report a team tab or fatigue for it, even if one of the Team 1/2/3 tabs still
  looks highlighted. That highlight is just a leftover UI default on an inactive unit, not a real
  assignment, so it must be ignored.
- For units with percent > 0 only: they usually have three small tabs/buttons labeled "Team 1", "Team 2",
  "Team 3" — exactly one of them is visually highlighted/selected (brighter fill / different color than
  the other two, which look greyed-out or dimmed). Identify which one (1, 2, or 3) is highlighted.
- Also for units with percent > 0: look very closely for a small icon showing a bent-over/exhausted person
  figure, usually paired with a small number (1, 2, 3, 4...). This icon is often quite small — zoom your
  attention near the unit's portrait/name/level area, not just at the main HP bar. This is the fatigue
  indicator — EACH number of stack equals exactly -10% fatigue (icon+"1" = -10%, icon+"2" = -20%,
  icon+"3" = -30%, etc.). Multiply the number you see by 10 to get the fatigue percentage. Only report
  this if you can actually see that icon with a number next to it — do not estimate fatigue from any bar
  fill level, and never guess a number.
- For units with percent > 0, combine both into "label" using EXACTLY this format when you have them:
  "Team <N> Fatigue -<X>%" (e.g. "Team 2 Fatigue -30%", where -30% came from a fatigue icon showing "3").
  If only the team tab is visible with no fatigue icon, use "Team <N>". If only a fatigue icon is visible
  with no clear team tab, use "Fatigue -<X>%". If neither is visible, set "label" to null.
- If you cannot confidently read a title for the panel, set "title" to null.
- Never invent units that are not visibly in any of the images.`;

    const userInstruction = urls.length > 1
        ? `Read these ${urls.length} ship status screenshots (same ship) and return the combined JSON described.`
        : 'Read this ship status screenshot and return the JSON described.';

    const response = await axios.post(
        `${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`,
        {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [
                { role: 'user', parts: [{ text: userInstruction }, ...imageParts] }
            ],
            generationConfig: {
                temperature: 0,
                maxOutputTokens: 4096,
                responseMimeType: 'application/json', // изчисто JSON, без markdown/reasoning шум
                // responseSchema принуждава Gemini да следва ТОЧНО тази структура
                // (schema-constrained decoding) — много по-надежден начин да не
                // получиш счупен JSON, отколкото само responseMimeType сам по себе си.
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        title: { type: 'STRING', nullable: true },
                        units: {
                            type: 'ARRAY',
                            items: {
                                type: 'OBJECT',
                                properties: {
                                    name: { type: 'STRING' },
                                    percent: { type: 'NUMBER' },
                                    label: { type: 'STRING', nullable: true }
                                },
                                required: ['name', 'percent']
                            }
                        }
                    },
                    required: ['units']
                }
            }
        },
        { headers: { 'Content-Type': 'application/json' } }
    );

    const candidate = response.data?.candidates?.[0];
    if (candidate?.finishReason === 'MAX_TOKENS') {
        throw new Error('Gemini отговорът беше отрязан (твърде много units за maxOutputTokens бюджета). Пробвай с по-малко снимки наведнъж.');
    }

    let raw = (candidate?.content?.parts || [])
        .map(p => p.text || '')
        .join('')
        .trim();

    // Защитно чистене в случай, че моделът все пак добави markdown fences или текст извън JSON-а
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        raw = raw.slice(firstBrace, lastBrace + 1);
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        const preview = raw.slice(0, 200).replace(/\s+/g, ' ');
        throw new Error(`Gemini не върна валиден JSON (${err.message}). Начало на отговора: "${preview}..."`);
    }

    if (!Array.isArray(parsed.units) || parsed.units.length === 0) {
        throw new Error(`AI не разчете нито един unit от ${urls.length > 1 ? 'снимките' : 'снимката'}.`);
    }

    // Премахваме евентуални дубликати по име (case-insensitive), ако AI-то все пак
    // повтори unit от няколко снимки — пазим първото срещане
    const seenNames = new Set();
    const units = parsed.units
        .map(u => {
            const percent = Math.max(0, Math.min(100, Number(u.percent) || 0));
            return {
                name: String(u.name || '').trim(),
                percent,
                // Code-level guard: 0% units never show a Team/Fatigue label, even if
                // the AI reports one anyway (leftover UI highlight on inactive units).
                label: percent > 0 && u.label ? String(u.label).trim() : null
            };
        })
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

// ─────────────────────────────────────────────
// Публичната функция, викана от команд handler-а. Приема произволен брой
// снимки (капнати на 8 по-долу). Gemini няма твърдия лимит "макс 3 снимки" на
// Groq, затова MAX_IMAGES_PER_AI_CALL е достатъчно висок, че на практика
// винаги да е 1 извикване — но ако някой ден трябва пак да се намали заради
// rate limits на Gemini акаунта, само тук се пипа.
// ─────────────────────────────────────────────
const MAX_IMAGES_PER_AI_CALL = 8;

async function readShipStatusFromImages(imageUrls, titleHint) {
    const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];

    const chunks = [];
    for (let i = 0; i < urls.length; i += MAX_IMAGES_PER_AI_CALL) {
        chunks.push(urls.slice(i, i + MAX_IMAGES_PER_AI_CALL));
    }

    const results = [];
    for (const chunk of chunks) {
        results.push(await readShipStatusBatch(chunk, titleHint));
    }

    if (results.length === 1) return results[0];

    // Merge на units от всички групи, дубликати по име (case-insensitive) — пазим първото срещане
    const seenNames = new Set();
    const mergedUnits = [];
    let title = titleHint || null;
    for (const r of results) {
        if (!title && r.title && r.title !== 'Ship') title = r.title;
        for (const u of r.units) {
            const key = u.name.toLowerCase();
            if (seenNames.has(key)) continue;
            seenNames.add(key);
            mergedUnits.push(u);
        }
    }

    return { title: title || 'Ship', units: mergedUnits };
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
        const imageUrls = imageAttachments.map(a => toResizedDiscordUrl(a));
        const numBatches = Math.ceil(imageUrls.length / MAX_IMAGES_PER_AI_CALL);

        const loadingMsg = await msg.reply(
            numBatches > 1
                ? `🔎 Reading ${imageUrls.length} screenshots with AI (in ${numBatches} batches of up to ${MAX_IMAGES_PER_AI_CALL}), one moment...`
                : imageUrls.length > 1
                    ? `🔎 Reading ${imageUrls.length} screenshots with AI, one moment...`
                    : '🔎 Reading the screenshot with AI, one moment...'
        );
        try {
            const data = await readShipStatusFromImages(imageUrls, titleHint);
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
            '❌ Format: `/shipstatus title:Sunny unit1:Mugiwara,100 unit2:Hosted,92 unit3:Akagami,33,Team 3 Fatigue -40%`\n' +
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
