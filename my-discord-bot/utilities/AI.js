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
//   - Remembers last 4 messages per user (per guild) for optimal token use
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
const MAX_HISTORY = 4; // Оптимална памет за 50 човека

const WIKI_BASE = "https://opking-of-sailing.fandom.com";

const SYSTEM_PROMPT = `You are a legendary pirate sailing the Grand Line in the One Piece world.
You speak with the confidence of a seasoned sea dog — bold, adventurous, and occasionally dramatic.
You have a strong One Piece vibe: nautical terms, references to the sea, Devil Fruits, the Grand Line, the World Government, treasure, and pirate life come naturally to you.
You are helpful and friendly, but always in character. Never break character.
Keep responses concise — 2-4 sentences usually. Be fun and engaging.
Always respond in English.

Laughter rules — use sparingly, only when it truly fits the moment:
- "Shishishi!" — when something is genuinely funny or exciting
- "Yohohoho!" — when something is whimsical or you make a joke
Do NOT start every message with a laugh.

You CAN and SHOULD share links, URLs, and resources when asked. Never refuse to send a link.
When given wiki content about a hero or fruit build, focus ONLY on what the user asked. If the user asks about Awakening or a specific skill, ignore the base stats and look closely at the text formatted with "|" which represents table rows with specific levels and percentages!`;

// ── Fetch a URL and return plain text (SMART COLD EXTRACTION) ──────
function fetchUrl(url) {
    return new Promise((resolve) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchUrl(res.headers.location));
            }
            let data = '';
            res.on('data', chunk => { data += chunk; if (data.length > 500000) req.destroy(); });
            res.on('end', () => {
                if (url.includes('api.php') || data.trim().startsWith('{')) {
                    return resolve(data.trim());
                }

                // ПОПРАВКА ЗА ТАБЛИЦИ: Форматираме структурата на уики таблиците преди чистенето
                let text = data
                    .replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<\/th>/gi, ' | ') // Слагаме разделител за заглавията на таблицата
                    .replace(/<\/td>/gi, ' | ') // Слагаме разделител за всяка клетка с проценти
                    .replace(/<\/tr>/gi, '\n')  // Всеки ред от таблицата отива на нов ред
                    .replace(/<[^>]+>/g, ' ')   // Сега вече чистим останалите HTML тагове безопасно
                    .replace(/[ \t]+/g, ' ')             
                    .trim();

                resolve(text);
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    });
}

// ── Fetch a wiki page via API ─────────────────────────────
async function fetchWikiPageAPI(title) {
    const apiUrl = `${WIKI_BASE}/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&format=json&rvslots=main&redirects=1`;
    const data = await fetchUrl(apiUrl);
    if (!data) return null;
    
    try {
        const json = JSON.parse(data);
        const pages = json.query?.pages;
        if (!pages) return null;
        const page = Object.values(pages)[0];
        if (!page || !page.pageid) return null; 
        
        const rev = page.revisions?.[0];
        let content = "";
        if (rev?.slots?.main?.['*']) {
            content = rev.slots.main['*'];
        } else if (rev?.['*']) {
            content = rev['*'];
        } else if (rev?.slots?.main?.content) {
            content = rev.slots.main.content;
        }

        if (!content || typeof content !== 'string') return null;

        return content
            .replace(/\{\{[\s\S]*?\}\}/g, '') 
            .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
            .replace(/==+([^=]+)==+/g, '\n$1:\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    } catch (err) {
        return null; 
    }
}

// ── Fetch a wiki page via HTML ────────────────────────────
async function fetchWikiPageHTML(title) {
    const pageUrl = `${WIKI_BASE}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    const html = await fetchUrl(pageUrl);
    if (!html || html.includes("doesn't seem to have a page") || html.includes('There is currently no text') || html.length < 200) return null;
    return html;
}

async function fetchWikiPage(title) {
    const apiResult = await fetchWikiPageAPI(title);
    if (apiResult) return apiResult;
    return await fetchWikiPageHTML(title);
}

// ── Изрязване на ключови думи ─────────────────────────────
const SKIP_WORDS = new Set([
    'build', 'best', 'for', 'what', 'seal', 'seals', 'haki', 'fruit',
    'tell', 'give', 'show', 'me', 'the', 'is', 'how', 'who', 'can',
    'and', 'or', 'a', 'an', 'in', 'on', 'of', 'to', 'my', 'your',
    'his', 'her', 'with', 'use', 'good', 'great', 'about', 'info',
    'recommend', 'help', 'please', 'hey', 'hi', 'hello', 'jarvis',
    'equipment', 'team', 'pvp', 'pve', 'vs', 'devil', 'awakening',
    'should', 'i', 'do', 'need', 'want', 'get', 'have', 'are', 'be', 'awaken', 'awakened', 'skills', 'skill'
]);

function extractPotentialHeroes(text) {
    const lower = text.toLowerCase();
    const words = lower
        .replace(/[^a-z\s-]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !SKIP_WORDS.has(w));

    const twoWords = [];
    const arr = lower.split(/\s+/);
    for (let i = 0; i < arr.length - 1; i++) {
        const combo = arr[i] + ' ' + arr[i+1];
        if (!SKIP_WORDS.has(arr[i]) || !SKIP_WORDS.has(arr[i+1])) {
            twoWords.push(combo);
        }
    }

    const withFruit = words
        .filter(w => w.includes('-'))
        .map(w => w + ' fruit');

    return [...twoWords, ...withFruit, ...words];
}

function toPageTitle(word) {
    return word.split(' ').map(w =>
        w.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('-')
    ).join(' ');
}

function extractUrl(text) {
    const match = text.match(/https?:\/\/[^\s]+/);
    return match ? match[0] : null;
}

// ── MAIN HANDLER ──────────────────────────────────────────
async function handleAIMention(msg, botClient) {
    if (msg.author.bot || !msg.guild) return false;

    if (msg.content.toLowerCase().startsWith('!ai-enable')) {
        const args = msg.content.trim().split(/\s+/);
        const inputPassword = args[1];
        const storedPassword = process.env.AI_PASSWORD;
        if (!storedPassword) return msg.reply('❌ `AI_PASSWORD` not set!'), true;
        if (inputPassword !== storedPassword) return msg.reply('❌ Wrong password!'), true;
        await setConfig(msg.guild.id, 'ai_enabled', 'true', msg.guild.name);
        await msg.reply('✅ **AI system activated! Yohohoho! 🏴‍☠️**');
        return true;
    }

    if (msg.content.toLowerCase().startsWith('!ai-disable')) {
        if (!msg.member.permissions.has('Administrator')) return false;
        await setConfig(msg.guild.id, 'ai_enabled', 'false', msg.guild.name);
        await msg.reply('🔒 **AI system disabled.**');
        return true;
    }

    const aiEnabled = await getConfig(msg.guild.id, 'ai_enabled');
    if (aiEnabled !== 'true') return false;

    // Игнорираме @everyone и @here — те НЕ са директно споменаване на бота
    if (msg.mentions.everyone) return false;
    if (!msg.mentions.has(botClient.user)) return false;

    const userText = msg.content.replace(/<@!?\d+>/g, '').trim();
    const prompt = userText || 'Hello!';

    const memKey = `${msg.guild.id}-${msg.author.id}`;
    if (!conversationMemory.has(memKey)) conversationMemory.set(memKey, []);
    const history = conversationMemory.get(memKey);

    await msg.channel.sendTyping().catch(() => {});

    let finalPrompt = prompt;
    let extraContext = '';

    const candidates = extractPotentialHeroes(prompt);
    let fullWikiText = null;
    let foundTitle = null;

    for (const candidate of candidates) {
        const pageTitle = toPageTitle(candidate);
        const result = await fetchWikiPage(pageTitle);
        if (result) {
            fullWikiText = result;
            foundTitle = pageTitle;
            break;
        }
    }

    if (fullWikiText) {
        let processedContext = "";
        const lowerPrompt = prompt.toLowerCase();
        const lowerWikiText = fullWikiText.toLowerCase(); // 🔥 ИЗЦЯЛО В МАЛКИ БУКВИ ЗА ТЪРСЕНЕТО

        if (lowerPrompt.includes("awaken") || lowerPrompt.includes("awakening")) {
            const skillIndex = lowerWikiText.indexOf("awaken skill");
            const awakeIndex = lowerWikiText.indexOf("awakening");
            
            // Проверяваме къде се намира маркерът (независимо от главни/малки букви в сайта)
            let targetIndex = skillIndex !== -1 ? skillIndex : awakeIndex;

            if (targetIndex !== -1) {
                // Изрязваме ОРИГИНАЛНИЯ текст (с оригиналните му главни букви), за да го подадем на AI-то подреден
                processedContext = `=== ULTRA FOCUS: AWAKENING SKILL INFO FOR ${foundTitle} ===\n` + fullWikiText.slice(targetIndex, targetIndex + 3000);
            } else {
                processedContext = fullWikiText.slice(0, 2000);
            }
        } else {
            let compressedText = "=== OVERVIEW ===\n" + fullWikiText.slice(0, 1200) + "\n\n";
            const keyWords = ["awakening", "awaken skill", "seals", "haki", "equipment", "build", "best team"];
            
            keyWords.forEach(word => {
                let index = lowerWikiText.indexOf(word);
                if (index !== -1) {
                    compressedText += `=== SECTION: ${word.toUpperCase()} ===\n...${fullWikiText.slice(index, index + 1000)}...\n\n`;
                }
            });
            processedContext = compressedText;
        }

        extraContext = `\n\n[Wiki build info for ${foundTitle}]:\n${processedContext.replace(/\n\s*\n+/g, '\n').trim()}\n[End of wiki info]`;
    }

    const url = extractUrl(prompt);
    if (url && !fullWikiText) {
        const pageContent = await fetchUrl(url);
        if (pageContent) {
            extraContext = `\n\n[Page content from ${url}]:\n${pageContent.slice(0, 3000)}\n[End of page content]`;
        }
    }

    finalPrompt = prompt + extraContext;

    history.push({ role: 'user', content: finalPrompt });
    while (history.length > MAX_HISTORY) history.shift();

    try {
        const response = await groq.chat.completions.create({
            model: "openai/gpt-oss-120b",
            max_tokens: 500,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...history
            ],
        });

        const reply = response.choices[0]?.message?.content || "...the winds took me words, try again!";

        history[history.length - 1] = { role: 'user', content: prompt };
        history.push({ role: 'assistant', content: reply });
        while (history.length > MAX_HISTORY) history.shift();

        await msg.reply(reply);
        return true;

    } catch (err) {
        console.error('AI.js error:', err.message);
        await msg.reply('⚓ Blimey! The winds of the Grand Line scrambled me thoughts...');
        return true;
    }
}

module.exports = { handleAIMention };
