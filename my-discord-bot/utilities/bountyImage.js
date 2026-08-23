/**
 * bountyImage.js — Auto-detect bounty from screenshots (no command needed)
 * ============================================================================
 * WHAT THIS DOES:
 *   If someone posts an image in the channel set as `bounty_upload_channel`,
 *   the bot reads the bounty number off the screenshot with AI (Gemini —
 *   gemini-3.1-flash-lite, a DIFFERENT/lighter model than shipStatus.js uses,
 *   chosen here for its much higher free-tier daily quota — see VISION_MODEL
 *   comment below), then automatically:
 *     1. saves it to the DB (same `users` table as !setbounty)
 *     2. assigns the matching "Bounty: XM+" role (reuses updateBountyRole
 *        from roleHandler.js — zero duplicated logic)
 *     3. posts the exact same "🎖️ Bounty Update" embed !setbounty posts
 *
 *   NO confirmation step, NO permission check — this is fully automatic and
 *   trusts whatever number is in the screenshot (by design — "for fun", per
 *   your call). Anyone could in theory upload a faked screenshot; there's no
 *   spoof protection here on purpose. There's a light per-user cooldown just
 *   to stop accidental spam from hammering the AI, not as a security measure.
 *
 * SETUP: !setconfig bounty_upload_channel <channel-id>
 *   (If not configured, this feature does nothing — safe to leave off.)
 *
 * HOW TO REMOVE THIS FEATURE COMPLETELY:
 *   1. Delete this file (utilities/bountyImage.js).
 *   2. In main.js, remove the 3 lines tagged "// [BountyImage]".
 *   That's it. The `bounty_upload_channel` config row, if set, just sits
 *   there unused and harmless if you remove the feature later.
 * ============================================================================
 */

const axios = require('axios');
const { getChannel } = require('./guildConfig');
const { updateBountyRole } = require('./roleHandler');
const { buildBountyUpdateEmbed } = require('./bountyEmbed');

// Same Gemini engine/model as shipStatus.js.
// gemini-3.1-flash-lite — НЕ gemini-3.6-flash (този е ползван в shipStatus.js).
// Причина за различния избор тук: Free tier лимитите за 3.6-flash са само
// 5 RPM / 20 RPD, докато 3.1-flash-lite дава 15 RPM / 500 RPD — 25x повече
// дневни заявки. Бонус: 3.1-flash-lite мисли на MINIMAL ниво по подразбиране,
// което почти елиминира риска от "MAX_TOKENS" truncation при простата задача
// тук (само едно число за извличане). За тази задача Lite е напълно достатъчен.
const VISION_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent`;

// Anti-spam only (not a security measure) — stops rapid re-uploads from the
// same person hammering the Gemini API back-to-back.
const lastAutoBounty = new Map(); // userId -> timestamp
const COOLDOWN_MS = 30 * 1000;

function toResizedDiscordUrl(attachment, maxWidth = 1400) {
    const base = attachment.proxyURL || attachment.url;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}width=${maxWidth}`;
}

// ─────────────────────────────────────────────
// AI reading — screenshot → bounty amount (plain number, not abbreviated)
// ─────────────────────────────────────────────
async function readBountyFromImage(imageUrl) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY липсва в environment variables.');
    }

    const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(imgRes.data).toString('base64');
    const mimeType = imgRes.headers['content-type'] || 'image/png';

    const systemPrompt = `You read screenshots from a mobile game's player profile screen. These screenshots come in several different layouts, but all of them show a BOUNTY amount next to a small red icon (looks like a wanted-poster ribbon / flag / butterfly-shaped icon), formatted like "552.93M", "650.22M", or "300.11M" — a decimal number followed by a letter suffix for scale (K = thousand, M = million, B = billion).
Return ONLY a strict JSON object, no markdown, no commentary, matching exactly:
{"amount": number or null}
Rules:
- "amount" is the FULL numeric value in plain units, not abbreviated — e.g. "650.22M" becomes 650220000, "300.11M" becomes 300110000, "552.93M" becomes 552930000.
- Only read the number that is directly next to that small red icon. Ignore level numbers, VIP numbers, UID numbers, dates, or any other numbers on the screen.
- If you cannot find a clear bounty number next to that specific icon, set "amount" to null. Never guess a number you cannot actually see.`;

    const response = await axios.post(
        `${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`,
        {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: 'Read the bounty amount from this screenshot and return the JSON described.' },
                        { inlineData: { mimeType, data: base64 } }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0,
                maxOutputTokens: 200,
                responseMimeType: 'application/json',
                // "low" thinking е доказано с 0 thinking токена при structured-extraction
                // задачи като тази — целият maxOutputTokens бюджет отива за отговора,
                // не за вътрешно "мислене". Пази срещу MAX_TOKENS truncation грешката.
                thinkingConfig: { thinkingLevel: 'low' },
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        amount: { type: 'NUMBER', nullable: true }
                    }
                }
            }
        },
        { headers: { 'Content-Type': 'application/json' } }
    );

    const candidate = response.data?.candidates?.[0];
    if (candidate?.finishReason === 'MAX_TOKENS') {
        throw new Error('Gemini отговорът беше отрязан.');
    }

    let raw = (candidate?.content?.parts || []).map(p => p.text || '').join('').trim();
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

    const amount = Number(parsed.amount);
    if (!parsed.amount || isNaN(amount) || amount <= 0) {
        throw new Error('AI не откри ясно bounty число в снимката.');
    }

    return Math.round(amount);
}

// ─────────────────────────────────────────────
// Message listener — triggers ONLY in the configured channel, on any image,
// with no "!" prefix needed. Return true if handled.
// ─────────────────────────────────────────────
async function handleBountyImageMessage(msg, pool) {
    if (msg.author.bot || !msg.guild) return false;
    if (msg.content.trim().startsWith('!')) return false; // остави explicit командите на command handler-а

    const imageAttachments = [...msg.attachments.values()].filter(a => (a.contentType || '').startsWith('image/'));
    if (imageAttachments.length === 0) return false;

    const uploadChannel = await getChannel(msg.guild, 'bounty_upload_channel');
    if (!uploadChannel || uploadChannel.id !== msg.channel.id) return false;

    // Anti-spam cooldown (не security мярка, само пести API извиквания)
    const now = Date.now();
    const last = lastAutoBounty.get(msg.author.id) || 0;
    if (now - last < COOLDOWN_MS) return true; // тихо пропускаме, без грешка/спам
    lastAutoBounty.set(msg.author.id, now);

    const attachment = imageAttachments[0]; // само първата снимка е достатъчна за едно bounty число

    try {
        const amount = await readBountyFromImage(toResizedDiscordUrl(attachment));

        // Взимаме предишния bounty ПРЕДИ да го презапишем, за да покажем delta-та
        const prevRes = await pool.query("SELECT bounty FROM users WHERE guild_id = $1 AND user_id = $2", [msg.guild.id, msg.author.id]);
        const previousBounty = prevRes.rows.length > 0 ? Number(prevRes.rows[0].bounty) : 0;

        await pool.query(
            "INSERT INTO users (guild_id, guild_name, user_id, bounty, username) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (guild_id, user_id) DO UPDATE SET bounty = $4, username = $5, guild_name = $2",
            [msg.guild.id, msg.guild.name, msg.author.id, amount, msg.author.username]
        );

        const assignedRank = await updateBountyRole(msg.member, amount);

        const embed = buildBountyUpdateEmbed({
            user: msg.author,
            amount,
            previousBounty,
            assignedRank,
            source: 'ai'
        });

        await msg.channel.send({ embeds: [embed] });
        await msg.react('✅').catch(() => {});
    } catch (err) {
        console.error('[BountyImage] read error:', err.message);
        await msg.react('❌').catch(() => {});
        const warn = await msg.reply(`❌ Couldn't read a bounty number from that screenshot: \`${err.message}\``);
        setTimeout(() => warn.delete().catch(() => {}), 8000);
    }

    return true;
}

module.exports = { handleBountyImageMessage };
