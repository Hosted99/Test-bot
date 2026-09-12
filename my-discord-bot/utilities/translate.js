const Groq = require("groq-sdk");
const axios = require("axios");
const { getConfig, setConfig } = require("./guildConfig");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─────────────────────────────────────────────
// Gemini fallback — ползва се САМО когато Groq удари rate limit (429)
// ─────────────────────────────────────────────
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'; // ⚠️ провери точния model id в Google AI Studio, ако не работи

async function translateWithGemini(systemPrompt, userText) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY не е зададен в .env');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const { data } = await axios.post(url, {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 150 }
    }, { timeout: 10000 });
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

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

// Ключ в guild_config, под който пазим ID-та на допълнителни канали за игнориране, разделени със запетая.
const IGNORE_CHANNELS_CONFIG_KEY = 'translate_ignore_channels';

/**
 * Взима списъка от ID-та на ръчно добавени игнорирани канали за даден сървър.
 * @param {string} guildId
 * @returns {Promise<string[]>}
 */
async function getIgnoredChannelIds(guildId) {
    const raw = await getConfig(guildId, IGNORE_CHANNELS_CONFIG_KEY);
    if (!raw) return [];
    return raw.split(',').map(id => id.trim()).filter(Boolean);
}

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
3. Output ONLY the raw translation or the word SKIP. No explanations, no quotes.
4. If a third-person pronoun's gender is not actually determinable from the source text's grammar (e.g. a possessive like Italian "suo/sua" that agrees with the grammatical gender of the object owned, not the gender of the person), and ${targetLanguage} normally requires a gendered pronoun, translate it as "he/she" (or the natural dual form in ${targetLanguage}) instead of guessing a single gender.`;

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

        const ignoredChannelIds = await getIgnoredChannelIds(message.guild.id);
        if (ignoredChannelIds.includes(message.channel.id)) return;

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
            // Кратък промпт — пази цялата логика, по-малко токени на заявка
            const systemPrompt = `Language filter. If the message is already English (slang/typos OK), reply exactly: SKIP
Otherwise translate it to English — exact meaning, keep slang, output ONLY the translation, no quotes/explanations.
Don't be fooled by short English-looking words in other languages (German "das/man/war/sich", Spanish "si/lo/en", French "en/si/que") — judge the WHOLE sentence's grammar, not isolated words.
Unclear pronoun gender (e.g. Italian "suo/sua") → use "he/she".

Ex: "Na das hört sich gut an, muss man sich nicht mehr einen in Englisch abmachen." → That sounds good, no need to arrange one in English anymore.
Ex: "Hablo 4 lenguas entonces puedo mismo hablar español si lo quieres" → I speak 4 languages so I can even speak Spanish if you want.
Ex: "bro that's so real lol" → SKIP`;

            let rawOutput = null;
            try {
                const result = await groq.chat.completions.create({
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: cleanText }
                    ],
                    model: "qwen/qwen3.6-27b",
                    reasoning_effort: "none", // връщаме на "none" — "default" пали вътрешен <think> процес, който трябваше да се чисти отделно; вместо reasoning, компенсираме с конкретни примери в промпта по-горе
                    temperature: 0.0, // ВАЖНО: Пълна нула! Премахва всякакво филмиране и пренаписване от страна на ИИ
                    max_tokens: 150
                });
                rawOutput = result.choices[0].message.content.trim();
            } catch (groqErr) {
                const isRateLimited = groqErr?.status === 429 || /rate_limit_exceeded/i.test(groqErr?.message || '');
                if (!isRateLimited) {
                    console.error('Auto translate (Groq) error:', groqErr.message);
                    return;
                }
                // 🔄 Groq му е дошъл лимитът за деня/минутата — прехвърляме тази заявка на Gemini
                console.warn(`[Translate] Groq лимит достигнат — превключвам временно на Gemini (${GEMINI_MODEL}) за тази заявка.`);
                try {
                    rawOutput = await translateWithGemini(systemPrompt, cleanText);
                } catch (geminiErr) {
                    console.error('Auto translate (Gemini fallback) error:', geminiErr.message);
                    return;
                }
            }

            if (!rawOutput) return;
            let translated = rawOutput.trim();

            // ✅ Премахваме вътрешния "мисловен процес" на модела (<think>...</think>),
            // който идва ПРЕДИ реалния превод, когато reasoning_effort не е "none"
            translated = translated.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

            // Ако <think> блокът е бил отрязан по средата (недовършен, без затваряща тагче),
            // не можем да сме сигурни какво остава след него — по-безопасно е да пропуснем.
            if (/<think>/i.test(translated)) return;

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

module.exports = { initTranslateSystem, getIgnoredChannelIds, IGNORE_CHANNELS_CONFIG_KEY };
