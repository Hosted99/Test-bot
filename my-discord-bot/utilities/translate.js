const Groq = require("groq-sdk");
const { getConfig, setConfig } = require("./guildConfig");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─────────────────────────────────────────────
// Flag emoji → language name mapping
// Флаг емоджи → name на езика
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

// ISO mapping за Lingva детекцията (за да изписваме красиви имена на езиците)
const ISO_TO_LANG_NAME = {
    'fr': 'French', 'es': 'Spanish', 'it': 'Italian', 'de': 'German',
    'pl': 'Polish', 'bg': 'Bulgarian', 'en': 'English', 'ru': 'Russian'
};

// Cooldowns to prevent spam / Cooldown против спам
const flagCooldown = new Map();
const autoTranslateCooldown = new Map();
const COOLDOWN_MS = 5000;

// Channels to skip for auto-translate / Канали без авто-превод
const SKIP_CHANNEL_NAMES = ['ai-translator', 'bot-', 'admin', 'log', 'status'];

// Lingva instances — fallback if one is down / Резервни инстанции
const LINGVA_INSTANCES = [
    'https://lingva.ml',
    'https://translate.plausibility.cloud',
    'https://lingva.thedaviddelta.com',
];

/**
 * Translate text using Lingva (Google Translate backend, no rate limits)
 * Превежда с Lingva — ползва Google Translate отзад, без rate limiting
 */
async function lingvaTranslate(text, from = 'auto', to = 'en') {
    const encoded = encodeURIComponent(text);
    for (const instance of LINGVA_INSTANCES) {
        try {
            const res = await fetch(`${instance}/api/v1/${from}/${to}/${encoded}`, {
                headers: { 'Accept': 'application/json' }
            });
            if (!res.ok) continue;
            
            const data = await res.json();
            if (data?.translation) {
                return {
                    text: data.translation,
                    detectedLanguage: data.info?.detectedSource || null
                };
            }
        } catch (e) {
            // Try next instance / Пробваме следващата инстанция
            continue;
        }
    }
    return null;
}

/**
 * Initialize both translation systems
 * Инициализира двете системи за превод
 */
function initTranslateSystem(client) {

    // ─────────────────────────────────────────────
    // 1. FLAG REACTION TRANSLATOR (Lingva Detector + Groq Expert)
    // ─────────────────────────────────────────────
    client.on('messageReactionAdd', async (reaction, user) => {
        if (user.bot) return;
        if (!reaction.message.guild) return;

        // Check if flag translation is enabled / Проверяваме дали е активирано
        const enabled = await getConfig(reaction.message.guild.id, 'flag_translate_enabled');
        if (enabled !== 'true') return;

        const flag = reaction.emoji.name;
        const targetLanguage = FLAG_TO_LANGUAGE[flag];
        if (!targetLanguage) return;

        // Fetch partial reactions/messages / Зареждаме partial обекти
        if (reaction.partial) {
            try { await reaction.fetch(); } catch { return; }
        }
        if (reaction.message.partial) {
            try { await reaction.message.fetch(); } catch { return; }
        }

        const messageContent = reaction.message.content;
        if (!messageContent || messageContent.trim().length === 0) return;

        // Cooldown check / Проверка за cooldown
        const cooldownKey = `${reaction.message.id}:${user.id}:${flag}`;
        if (flagCooldown.has(cooldownKey)) return;
        flagCooldown.set(cooldownKey, true);
        setTimeout(() => flagCooldown.delete(cooldownKey), COOLDOWN_MS);

        try {
            // Стъпка 1: Използваме супер бързата Lingva само за да разберем СЪС СИГУРНОСТ оригиналния език
            const lingvaDetect = await lingvaTranslate(messageContent, 'auto', 'en');
            const sourceIso = lingvaDetect?.detectedLanguage || 'auto';
            const sourceLanguage = ISO_TO_LANG_NAME[sourceIso] || 'the original language';

            // Стъпка 2: Подаваме на Groq точния контекст (от кой към кой език се превежда)
            const systemPrompt = `You are a professional, elite slang-accurate translator. 
Your task is to translate a chat message from ${sourceLanguage} into native, context-aware, and natural-sounding ${targetLanguage}.

RULES:
1. NEVER translate word-for-word (literally). Focus heavily on the modern internet slang, idioms, and actual meaning used in casual chat rooms.
2. If the message uses casual emphasis or structural slang (like French 'grave mieux', Spanish 'de locos', German 'voll gut'), adapt it into an equivalent natural slang in ${targetLanguage}.
3. Keep the original text's tone, emotion, capitalization, and casual vibe exactly as it is.
4. Output ONLY the raw translated text. Do not wrap it in quotes, do not write explanations, and do not include any introductions.`;

            const result = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: messageContent }
                ],
                model: "llama-3.3-70b-versatile",
                max_tokens: 500
            });

            const translated = result.choices[0].message.content.trim();
            if (!translated) return;

            // Send in channel — auto-deletes after 2 minutes / Изпраща в канала, изтрива след 2 мин
            const tempMsg = await reaction.message.channel.send(
                `${flag} <@${user.id}> **Translation to ${targetLanguage}:**\n> ${translated}`
            );
            setTimeout(() => tempMsg.delete().catch(() => {}), 2 * 60 * 1000);

        } catch (err) {
            console.error('Flag translate error:', err.message);
        }
    });

    // ─────────────────────────────────────────────
    // 2. AUTO TRANSLATE TO ENGLISH (Lingva)
    // ─────────────────────────────────────────────
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!message.guild) return;

        // Check if auto-translate is enabled / Проверяваме дали е активирано
        const autoEnabled = await getConfig(message.guild.id, 'auto_translate_enabled');
        if (autoEnabled !== 'true') return;

        // Skip certain channels / Пропускаме определени канали
        const channelName = message.channel.name.toLowerCase();
        if (SKIP_CHANNEL_NAMES.some(skip => channelName.includes(skip))) return;

        const text = message.content?.trim();
        if (!text || text.length < 5) return;

        // Skip commands / Пропускаме команди
        if (text.startsWith('!') || text.startsWith('/')) return;

        // Clean text / Почистваме текста
        const cleanText = text
            .replace(/<[^>]+>/g, '')                     // remove mentions/channels
            .replace(/https?:\/\/\S+/g, '')              // remove links
            .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')      // remove emojis
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')           // keep only letters, numbers, spaces
            .trim();
        if (!cleanText || cleanText.length < 5) return;

        // Skip very short messages / Пропускаме много кратки съобщения
        const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;
        if (wordCount <= 2 && cleanText.length < 8) return;

        // Cooldown per user / Cooldown per потребител
        if (autoTranslateCooldown.has(message.author.id)) return;
        autoTranslateCooldown.set(message.author.id, true);
        setTimeout(() => autoTranslateCooldown.delete(message.author.id), COOLDOWN_MS);

        try {
            // Use Lingva for auto-translate / Ползваме Lingva
            const result = await lingvaTranslate(cleanText);
            if (!result?.text) return;

            // Skip if detected language is English / Пропускаме ако е английски
            if (result.detectedLanguage === 'en') return;

            // Skip if translation is identical to original / Пропускаме ако е същото
            if (result.text.toLowerCase().trim() === cleanText.toLowerCase().trim()) return;

            await message.reply({
                content: `🌐 **English:** ${result.text}`,
                allowedMentions: { repliedUser: false }
            });

        } catch (err) {
            console.error('Auto translate error:', err.message);
        }
    });

    console.log('✅ Translation systems ready (flag: Groq, auto: Lingva) / Системите за превод са готови.');
}

module.exports = { initTranslateSystem };
