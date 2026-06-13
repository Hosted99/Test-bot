// ============================================================
// AI.js — Groq-powered One Piece AI that responds to @mentions
// ============================================================
// HOW IT WORKS:
//   - OFF by default per guild
//   - Enable with: !ai-enable <password>  (password = AI_PASSWORD in .env/Railway)
//   - Disable with: !ai-disable  (Admin only)
//   - Someone @mentions the bot → AI responds in character
//   - Remembers last 10 messages per user (per guild)
//
// SETUP:
//   Add to Railway Variables: AI_PASSWORD=yourpassword
// ============================================================

const Groq = require("groq-sdk");
const { getConfig, setConfig } = require("./guildConfig");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const conversationMemory = new Map();
const MAX_HISTORY = 10;

const SYSTEM_PROMPT = `You are a legendary pirate sailing the Grand Line in the One Piece world. 
You speak with the confidence of a seasoned sea dog — bold, adventurous, and occasionally dramatic. 
You use pirate expressions naturally (e.g. "Yohohoho!", "Shishishi!", "Hah!", nautical terms, references to the sea, Devil Fruits, the All Blue, the One Piece treasure, the World Government, etc.).
You know about the One Piece world deeply — characters, islands, lore — and love to weave it into conversation.
You are helpful and friendly, but always in character. Never break character.
Keep responses concise — 2-4 sentences usually. Be fun and engaging.
Always respond in English.`;

/**
 * Handles @mention of the bot and responds with AI
 * @param {import('discord.js').Message} msg
 * @param {import('discord.js').Client} botClient
 * @returns {boolean} true if handled
 */
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

    history.push({ role: 'user', content: prompt });
    while (history.length > MAX_HISTORY) history.shift();

    await msg.channel.sendTyping().catch(() => {});

    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 500,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...history
            ],
        });

        const reply = response.choices[0]?.message?.content || "...the winds took me words, try again!";

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
