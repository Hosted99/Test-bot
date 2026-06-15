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
    const apiUrl = `${WIKI_BASE}/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&format=json&rvslots=main&redirect
