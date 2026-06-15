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
const MAX_HISTORY = 4; // Намалено на 4, за да пестим токени от стара история за 50 човека

const WIKI_BASE = "https://opking-of-sailing.fandom.com";

const SYSTEM_PROMPT = `You are a legendary pirate sailing the Grand Line in the One Piece world.
You speak with the confidence of a seasoned sea dog — bold, adventurous, and occasionally dramatic.
You have a strong One Piece vibe: nautical terms, references to the sea, Devil Fruits, the Grand Line, the World Government, treasure, and pirate life come naturally to you.
You are helpful and friendly, but always in character. Never break character.
Keep responses concise — 2-4 sentences usually. Be fun and engaging.
Always respond in English.

Laughter rules — use sparingly, only when it truly fits the moment:
- "Shishishi!" — when something is genuinely funny or exciting (like Luffy)
- "Yohohoho!" — when something is whimsical or you make a joke (like Brook)
Do NOT start every message with a laugh. Use them at most once per response, and only when it feels natural.

You CAN and SHOULD share links, URLs, and resources when asked. Never refuse to send a link.
When given wiki content about a hero build, explain it clearly and helpfully in character — seals, devil fruits, haki order, equipment, tips.
When given the content of a webpage, summarize or answer questions about it naturally in character.`;

// ── Fetch a URL and return plain text (SMART FILTER FOR JSON & HTML) ──────
function fetchUrl(url) {
    return new Promise((resolve) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchUrl(res.headers.location));
            }
            let data = '';
            // Голям буфер, за да не режем суровия JSON или тежкия HTML по средата
            res.on('data', chunk => { data += chunk; if (data.length > 500000) req.destroy(); });
            res.on('end', () => {
                // АКО Е API ЗАЯВКА (JSON) -> Връщаме целия суров текст, за да не се чупи JSON.parse()
                if (url.includes('api.php') || data.trim().startsWith('{')) {
                    return resolve(data.trim());
                }

                // АКО Е HTML СТРАНИЦА -> Премахваме кода и филтрираме умните секции
                let text = data
                    .replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '') // Поправено от Claude (беше </script>)
                    .replace(/<\/td>/gi, ' | ')          
                    .replace(/<\/tr>/gi, '\n')           
                    .replace(/<[^>]+>/g, ' ')            
                    .replace(/[ \t]+/g, ' ')             
                    .trim();

                // 1. Взимаме базовото въведение (първите 1500 символа)
                let compressedText = "=== OVERVIEW ===\n" + text.slice(0, 1500) + "\n\n";

                // 2. Критични секции за плодове и герои, които търсим из цялата страница
                const keyWords = ["awakening", "seals", "haki", "equipment", "build", "best team"];

                // 3. Сканираме и изрязваме парчета от по 800 символа около ключовите думи
                keyWords.forEach(word => {
                    let index = text.toLowerCase().indexOf(word);
                    if (index !== -1) {
                        let sectionText = text.slice(index, index + 800);
                        compressedText += `=== SECTION: ${word.toUpperCase()} ===\n...${sectionText}...\n\n`;
                    }
                });

                // Почистваме излишните нови редове и пращаме сглобения текст
                let finalData = compressedText.replace(/\n\s*\n+/g, '\n').trim();
                resolve(finalData);
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    });
}

// ── Fetch a wiki page via API (good for simple pages) ─────
async function fetchWikiPageAPI(title) {
    const apiUrl = `${WIKI_BASE}/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&format=json&rvslots=main&redirects=1`;
    const data = await fetchUrl(apiUrl);
    console.log('[API RAW]', title, '->', data ? data.slice(0, 300) : 'NULL');
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
            content = rev.slots.main.content; // Поправено от Claude (беше rev.slots.content)
        }

        console.log('[API CONTENT]', title, '->', content ? content.slice(0, 100) : 'NULL');
        if (!content || typeof content !== 'string') return null;

        const cleaned = content
            .replace(/\{\{[\s\S]*?\}\}/g, '') 
            .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
            .replace(/==+([^=]+)==+/g, '\n$1:\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        if (cleaned.length < 50) return null; // Преминава към HTML бекъпа, ако уикитекстът е твърде къс
        return cleaned.slice(0, 3000);
    } catch (err) {
        console.error('[API ERROR] Грешка при парсване на API за:', title, err.message);
        return null; 
    }
}

// ── Fetch a wiki page via HTML (good for complex table pages) ──
async function fetchWikiPageHTML(title) {
    const pageUrl = `${WIKI_BASE}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    const html = await fetchUrl(pageUrl);
    if (!html) return null;
    if (html.includes("doesn't seem to have a page") || html.includes('There is currently no text')) return null;
    if (html.length < 200) return null;
    return html;
}

// ── Try API first, fallback to HTML if tables are complex ──
async function fetchWikiPage(title) {
    const apiResult = await fetchWikiPageAPI(title);
    if (apiResult) return apiResult;
    return await fetchWikiPageHTML(title);
}

// ── Common words to skip when searching wiki ─────────────
const SKIP_WORDS = new Set([
    'build', 'best', 'for', 'what', 'seal', 'seals', 'haki', 'fruit',
    'tell', 'give', 'show', 'me', 'the', 'is', 'how', 'who', 'can',
    'and', 'or', 'a', 'an', 'in', 'on', 'of', 'to', 'my', 'your',
    'his', 'her', 'with', 'use', 'good', 'great', 'about', 'info',
    'recommend', 'help', 'please', 'hey', 'hi', 'hello', 'jarvis',
    'equipment', 'team', 'pvp', 'pve', 'vs', 'devil', 'awakening',
    'should', 'i', 'do', 'need', 'want', 'get', 'have', 'are', 'be'
]);

// ── Extract potential hero names from message ─────────────
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

// ── Capitalize for wiki page title ────────────────────────
function toPageTitle(word) {
    return word.split(' ').map(w =>
        w.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('-')
    ).join(' ');
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
    const candidates = extractPotentialHeroes(prompt);
    let wikiContent = null;
    let foundTitle = null;
    console.log('[AI] Candidates:', candidates);
    for (const candidate of candidates) {
        const pageTitle = toPageTitle(candidate);
        console.log('[AI] Trying wiki page:', pageTitle);
        const result = await fetchWikiPage(pageTitle);
        console.log('[AI] Result:', result ? 'FOUND (' + result.length + ' chars)' : 'NOT FOUND');
        if (result) {
            wikiContent = result;
            foundTitle = pageTitle;
            break;
        }
    }
    if (wikiContent) {
        extraContext = `\n\n[Wiki build info for ${foundTitle}]:\n${wikiContent}\n[End of wiki info]`;
    }

    // ── 2. Check for URL → fetch page content ──────────────
    const url = extractUrl(prompt);
    if (url && !wikiContent) {
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
            model: 'llama-3.1-8b-instant', // Сменено на модела с 5 пъти по-голям безплатен лимит
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
        await msg.reply('⚓ Blimey! The winds of the Grand Line scrambled me thoughts... try again, sailor!');
        return true;
    }
}

module.exports = { handleAIMention };
