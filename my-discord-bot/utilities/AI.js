// ============================================================
// AI.js — Groq-powered One Piece AI that responds to @mentions
// ============================================================
// HOW IT WORKS:
//   - OFF by default per guild
//   - Enable with: !ai-enable <password>  (password = AI_PASSWORD in .env/Railway)
//   - Disable with: !ai-disable  (Admin only)
//   - Someone @mentions the bot → AI responds in character
//   - If message mentions a hero → fetches build info from the wiki
//   - If message contains a URL → bot fetches and reads the page
//   - Remembers last 10 messages per user (per guild)
//
// SETUP:
//   Add to Railway Variables: AI_PASSWORD=yourpassword
// ============================================================

const Groq = require("groq-sdk");
const https = require("https");
const http = require("http");
const { getConfig, setConfig } = require("./guildConfig");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const conversationMemory = new Map();
const MAX_HISTORY = 10;

const WIKI_BASE = "https://opking-of-sailing.fandom.com";

const SYSTEM_PROMPT = `You are a legendary pirate sailing the Grand Line in the One Piece world. 
You speak with the confidence of a seasoned sea dog — bold, adventurous, and occasionally dramatic. 
You use pirate expressions naturally (e.g. "Yohohoho!", "Shishishi!", "Hah!", nautical terms, references to the sea, Devil Fruits, the All Blue, the One Piece treasure, the World Government, etc.).
You know about the One Piece world deeply — characters, islands, lore — and love to weave it into conversation.
You are helpful and friendly, but always in character. Never break character.
Keep responses concise — 2-4 sentences usually. Be fun and engaging.
Always respond in English.
You CAN and SHOULD share links, URLs, and resources when asked. Never refuse to send a link.
When given wiki content about a hero build, explain it clearly and helpfully in character — seals, devil fruits, haki order, equipment, tips.
When given the content of a webpage, summarize or answer questions about it naturally in character.`;

// ── Fetch a URL and return plain text ─────────────────────
function fetchUrl(url) {
    return new Promise((resolve) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchUrl(res.headers.location));
            }
            let data = '';
            res.on('data', chunk => { data += chunk; if (data.length > 80000) req.destroy(); });
            res.on('end', () => {
                const text = data
                    .replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, 4000);
                resolve(text);
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    });
}

// ── Fetch a wiki page by title via HTML ───────────────────
async function fetchWikiPage(title) {
    const pageUrl = `${WIKI_BASE}/wiki/${encodeURIComponent(title)}`;
    const html = await fetchUrl(pageUrl);
    if (!html) return null;
    if (html.includes("doesn't seem to have a page") || html.includes('There is currently no text')) return null;
    return html.slice(0, 4000);
}

// ── Detect hero name in message ───────────────────────────
const HERO_NAMES = [
    'mihawk', 'blackbeard', 'kizaru', 'kaido', 'nika', 'zoro', 'akainu',
    'shanks', 'uta', 'yamato', 'shirahoshi', 'bigmom', 'big mom', 'marco',
    'garp', 'sengoku', 'enel', 'mars', 'saturn', 'rayleigh', 'oden',
    'bullet', 'whitebeard', 'doffy', 'doflamingo', 'legend mihawk'
];

function detectHero(text) {
    const lower = text.toLowerCase();
    return HERO_NAMES.find(h => lower.includes(h)) || null;
}

// Map common names to wiki page titles
const HERO_PAGE_MAP = {
    'bigmom': 'Big Mom',
    'big mom': 'Big Mom',
    'doffy': 'Doflamingo',
    'doflamingo': 'Doflamingo',
    'blackbeard': 'Blackbeard',
    'whitebeard': 'Whitebeard',
    'legend mihawk': 'Legend Mihawk',
    'akainu': 'Akainu',
    'zoro': 'Zoro',
};

function heroToPageTitle(hero) {
    return HERO_PAGE_MAP[hero] || (hero.charAt(0).toUpperCase() + hero.slice(1));
}

// ── Extract first URL from a string ──────────────────────
function extractUrl(text) {
    const match = text.match(/https?:\/\/[^\s]+/);
    return match ? match[0] : null;
}

// ── Main handler ──────────────────────────────────────────
async function handleAIMention(msg, botClient) {
    if (msg.author.bot || !msg.guild) return false;

    // ── !ai-enable <password> ──────────────────────────────
    if (msg.content.toLowerCase().startsWith('!ai-enable')) {
        const args = msg.content.trim().split(/\s+/);
        const inputPassword = args[1];
        const storedPassword = process.env.AI_PASSWORD;

        if (!storedPassword) {
            return msg.reply('❌ `AI_PASSWORD` not set in Railway Variables!').then(m => setTimeout(() => m.delete().catch(() => {}), 8000)), true;
        }
        if (inputPassword !== storedPassword) {
            return msg.reply('❌ Wrong password!').then(m => setTimeout(() => m.delete().catch(() => {}), 5000)), true;
        }

        await setConfig(msg.guild.id, 'ai_enabled', 'true', msg.guild.name);
        await msg.reply('✅ **AI system activated! Yohohoho! 🏴‍☠️**');
        setTimeout(() => msg.delete().catch(() => {}), 3000);
        return true;
    }

    // ── !ai-disable ────────────────────────────────────────
    if (msg.content.toLowerCase().startsWith('!ai-disable')) {
        if (!msg.member.permissions.has('Administrator')) return false;
        await setConfig(msg.guild.id, 'ai_enabled', 'false', msg.guild.name);
        await msg.reply('🔒 **AI system disabled.**');
        setTimeout(() => msg.delete().catch(() => {}), 3000);
        return true;
    }

    // ── Check if AI is enabled for this guild ──────────────
    const aiEnabled = await getConfig(msg.guild.id, 'ai_enabled');
    if (aiEnabled !== 'true') return false;

    // ── Handle @mention ────────────────────────────────────
    if (!msg.mentions.has(botClient.user)) return false;

    const userText = msg.content.replace(/<@!?\d+>/g, '').trim();
    const prompt = userText || 'Hello!';

    const memKey = `${msg.guild.id}-${msg.author.id}`;
    if (!conversationMemory.has(memKey)) conversationMemory.set(memKey, []);
    const history = conversationMemory.get(memKey);

    await msg.channel.sendTyping().catch(() => {});

    let finalPrompt = prompt;
    let extraContext = '';

    // ── 1. Check for hero name → fetch wiki build page ─────
    const hero = detectHero(prompt);
    if (hero) {
        const pageTitle = heroToPageTitle(hero);
        const wikiContent = await fetchWikiPage(pageTitle);
        if (wikiContent) {
            extraContext = `\n\n[Wiki build info for ${pageTitle}]:\n${wikiContent}\n[End of wiki info]`;
        }
    }

    // ── 2. Check for URL → fetch page content ──────────────
    const url = extractUrl(prompt);
    if (url && !hero) {
        const pageContent = await fetchUrl(url);
        if (pageContent) {
            extraContext = `\n\n[Page content from ${url}]:\n${pageContent}\n[End of page content]`;
        }
    }

    finalPrompt = prompt + extraContext;

    history.push({ role: 'user', content: finalPrompt });
    while (history.length > MAX_HISTORY) history.shift();

    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 600,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...history
            ],
        });

        const reply = response.choices[0]?.message?.content || "...the winds took me words, try again!";

        // Store only the original prompt in history (not the wiki dump)
        history[history.length - 1] = { role: 'user', content: prompt };
        history.push({ role: 'assistant', content: reply });
        while (history.length > MAX_HISTORY) history.shift();

        await msg.reply(reply);
        return true;

    } catch (err) {
        console.error('AI.js error:', err.message);
        await msg.reply('⚓ Blimey! The winds of the Grand Line scrambled me thoughts... try again, sailor!');
        return true;
    }
}

module.exports = { handleAIMention };
