const Groq = require("groq-sdk");
const { getConfig, setConfig } = require("./guildConfig");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─────────────────────────────────────────────
// Flag emoji → language name mapping
// ─────────────────────────────────────────────
const FLAG_TO_LANGUAGE = {
    '🇧🇬': 'Bulgarian', '🇬🇧': 'English', '🇺🇸': 'English',
    '🇩🇪': 'German', '🇫🇷': 'French', '🇪🇸': 'Spanish',
    '🇮🇹': 'Italian', '🇵🇹': 'Portuguese', '🇧🇷': 'Portuguese',
    '🇷🇺': 'Russian', '🇺🇦': 'Ukrainian', '🇵🇱': 'Polish',
    '🇷🇴': 'Romanian', '🇨🇿': 'Czech', '🇸🇰': 'Slovak',
    '🇭🇺': 'Hungarian', '🇬🇷': 'Greek', '🇳🇱': 'Dutch',
    '🇸🇪': 'Swedish', '🇳🇴': 'Norwegian', '🇩🇰': 'Danish',
    '🇫🇮': 'Finnish', '🇹🇷': 'Turkish', '🇯🇵': 'Japanese',
    '🇨🇳': 'Chinese', '🇰🇷': 'Korean', '🇸🇦': 'Arabic',
    '🇮🇱': 'Hebrew', '🇮🇳': 'Hindi', '🇹🇭': 'Thai',
    '🇻🇳': 'Vietnamese', '🇮🇩': 'Indonesian', '🇲🇽': 'Spanish',
    '🇦🇷': 'Spanish', '🇨🇱': 'Spanish', '🇭🇷': 'Croatian',
    '🇷🇸': 'Serbian', '🇸🇮': 'Slovenian', '🇧🇦': 'Bosnian',
    '🇲🇰': 'Macedonian', '🇦🇱': 'Albanian', '🇱🇹': 'Lithuanian',
    '🇱🇻': 'Latvian', '🇪🇪': 'Estonian', '🇮🇪': 'Irish',
    '🇮🇸': 'Icelandic', '🇵🇭': 'Filipino',
};

const flagCooldown = new Map();
const autoTranslateCooldown = new Map();
const COOLDOWN_MS = 4000;

const SKIP_CHANNEL_NAMES = ['ai-translator', 'bot-', 'admin', 'log', 'status'];

function initTranslateSystem(client) {

    // ─────────────────────────────────────────────
    // 1. FLAG REACTION TRANSLATOR (Оптимизиран Groq)
    // ─────────────────────────────────────────────
    client.on('messageReactionAdd', async (reaction, user) => {
        if (user.bot) return;
        if (!reaction.message.guild) return;

        const enabled = await getConfig(reaction.message.guild.id, 'flag_translate_enabled');
        if (enabled !== 'true') return;

        const flag = reaction.emoji.name;
        const targetLanguage = FLAG_TO_LANGUAGE[flag];
        if (!targetLanguage) return;

        if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
        if (reaction.message.partial) { try { await reaction.message.fetch(); } catch { return; } }

        const messageContent = reaction.message.content;
        if (!messageContent || messageContent.trim().length === 0) return;

        const cooldownKey = `${reaction.message.id}:${user.id}:${flag}`;
        if (flagCooldown.has(cooldownKey)) return;
        flagCooldown.set(cooldownKey, true);
        setTimeout(() => flagCooldown.delete(cooldownKey), COOLDOWN_MS);

        try {
            // Превежда на езика на флага
            const systemPrompt = `You are a strict, literal chat translator. Your only job is to translate messages into ${targetLanguage}.

RULES:
1. Translate the message accurately into ${targetLanguage}. Keep all specific names, words, and meaning exactly as they are. Do not substitute names with slang.
2. If the message is already in ${targetLanguage}, reply with exactly one word: SKIP
3. Output ONLY the raw translation or the word SKIP. No explanations, no quotes.`;

            const result = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: messageContent }
                ],
                model: "qwen/qwen3.6-27b",
                reasoning_effort: "none", // изключваме reasoning-а - не ни трябва за прост превод
                temperature: 0.3, // Ниска температура = по-точен и малко "сух" превод без измислици
                max_tokens: 400
            });

            const translated = result.choices[0].message.content.trim();
            if (!translated) return;

            const tempMsg = await reaction.message.channel.send(
                `${flag} <@${user.id}> **Translation to ${targetLanguage}:**\n> ${translated}`
            );
            setTimeout(() => tempMsg.delete().catch(() => {}), 2 * 60 * 1000);

        } catch (err) {
            console.error('Flag translate error:', err.message);
        }
    });

    // ─────────────────────────────────────────────
    // 2. AUTO TRANSLATE TO ENGLISH (Стегнат и подобрен Groq)
    // ─────────────────────────────────────────────
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!message.guild) return;

        const autoEnabled = await getConfig(message.guild.id, 'auto_translate_enabled');
        if (autoEnabled !== 'true') return;

        const channelName = message.channel.name.toLowerCase();
        if (SKIP_CHANNEL_NAMES.some(skip => channelName.includes(skip))) return;

        const text = message.content?.trim();
        if (!text || text.length < 3) return;

        if (text.startsWith('!') || text.startsWith('/')) return;

        const cleanText = text
            .replace(/<[^>]+>/g, '')                     
            .replace(/https?:\/\/\S+/g, '')              
            .trim();
            
        if (!cleanText || cleanText.length < 3) return;

        if (autoTranslateCooldown.has(message.author.id)) return;
        autoTranslateCooldown.set(message.author.id, true);
        setTimeout(() => autoTranslateCooldown.delete(message.author.id), COOLDOWN_MS);

        try {
            // Брутално директен и агресивен промпт
            const systemPrompt = `You are a strict language filter. Your ONLY job is to detect if a message is in English or not.

CRITICAL RULES:
1. If the message is already written in English (even with slang, typos, or abbreviations like "Oiii", "tf", "lol", "stalker"), you MUST reply with exactly one word: SKIP
2. If and ONLY IF the message is in a completely different language (French, Spanish, Bulgarian, etc.), translate it into English.
3. Keep the translation exact. Do not change words. Do not rewrite slang.
4. Output ONLY the word SKIP or the raw translation. No quotes, no explanations.`;

            const result = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: cleanText }
                ],
                model: "qwen/qwen3.6-27b",
                reasoning_effort: "none", // изключваме reasoning-а - не ни трябва за прост превод
                temperature: 0.0, // ВАЖНО: Пълна нула! Премахва всякакво филмиране и пренаписване от страна на ИИ
                max_tokens: 400
            });

            const translated = result.choices[0].message.content.trim();
            
            // Ако ни върне SKIP (или моделът се е опитал да напише "SKIP."), спираме
            if (!translated || translated.toUpperCase().includes('SKIP')) return;

            // Двойна застраховка: ако преводът съвпада с оригиналния текст, не пращаме нищо
            if (translated.toLowerCase() === cleanText.toLowerCase()) return;

            await message.channel.send({
                content: `🌐 <@${message.author.id}> **English:** ${translated}`,
                allowedMentions: { users: [] }
            }).catch(e => console.error('Грешка при пращане:', e.message));

        } catch (err) {
            console.error('Auto translate error:', err.message);
        }
    });

    console.log('✅ Translation systems ready (Optimized Groq engine).');
}

module.exports = { initTranslateSystem };
