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

// Cooldowns to prevent spam / Cooldown против спам
const flagCooldown = new Map();
const autoTranslateCooldown = new Map();
const COOLDOWN_MS = 5000;

// Channels to skip for auto-translate / Канали без авто-превод
const SKIP_CHANNEL_NAMES = ['ai-translator', 'bot-', 'admin', 'log', 'status'];

/**
 * Initialize both translation systems
 * Инициализира двете системи за превод
 */
function initTranslateSystem(client) {

    // ─────────────────────────────────────────────
    // 1. FLAG REACTION TRANSLATOR
    // Превод с флаг реакция — само реагиралият вижда
    // Изчезва след 2 минути
    // ─────────────────────────────────────────────
    client.on('messageReactionAdd', async (reaction, user) => {
        if (user.bot) return;
        if (!reaction.message.guild) return;

        // Check if flag translation is enabled / Проверяваме дали е активирано
        const enabled = await getConfig(reaction.message.guild.id, 'flag_translate_enabled');
        if (enabled !== 'true') return;

        const flag = reaction.emoji.name;
        const language = FLAG_TO_LANGUAGE[flag];
        if (!language) return;

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
            const result = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: `Translate the following text to ${language}. Return ONLY the translated text, nothing else.` },
                    { role: "user", content: messageContent }
                ],
                model: "llama-3.3-70b-versatile",
                max_tokens: 500
            });

            const translated = result.choices[0].message.content.trim();
            if (!translated) return;

            // Send in channel — auto-deletes after 2 minutes / Изпраща в канала, изтрива след 2 мин
            const tempMsg = await reaction.message.channel.send(
                `${flag} <@${user.id}> **Translation to ${language}:**\n> ${translated}`
            );
            setTimeout(() => tempMsg.delete().catch(() => {}), 2 * 60 * 1000);

        } catch (err) {
            console.error('Flag translate error:', err.message);
        }
    });

    // ─────────────────────────────────────────────
    // 2. AUTO TRANSLATE TO ENGLISH
    // Авто-превод на не-английски съобщения → английски
    // Появява се под оригиналното съобщение, не изчезва
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
            .replace(/<[^>]+>/g, '')                    // remove mentions/channels
            .replace(/https?:\/\/\S+/g, '')            // remove links
            .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')     // remove emojis
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')         // keep only letters, numbers, spaces
            .trim();
        if (!cleanText || cleanText.length < 5) return;

        // Skip very short messages / Пропускаме много кратки съобщения
        const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;
        if (wordCount <= 2 && cleanText.length < 8) return;

        // Skip if text looks like English (all common English words)
        // Пропускаме ако изглежда като английски
        const englishOnlyPattern = /^[a-zA-Z0-9\s\.,!?'"-]+$/;
        if (englishOnlyPattern.test(cleanText)) {
            // Could be English OR Latin-based language (Italian, French, Spanish etc.)
            // Let Groq decide — don't skip automatically
            // Нека Groq реши — може да е италиански/френски с латиница
        }

        // Cooldown per user / Cooldown per потребител
        if (autoTranslateCooldown.has(message.author.id)) return;
        autoTranslateCooldown.set(message.author.id, true);
        setTimeout(() => autoTranslateCooldown.delete(message.author.id), COOLDOWN_MS);

        try {
            // Detect language first / Първо засичаме езика
            const detection = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: 'Detect the language of the text. If it is English, respond with {"isEnglish": true}. If NOT English, translate to English and respond ONLY with JSON: {"isEnglish": false, "translated": "..."}'
                    },
                    { role: "user", content: cleanText }
                ],
                model: "llama-3.3-70b-versatile",
                response_format: { type: "json_object" },
                max_tokens: 500
            });

            const data = JSON.parse(detection.choices[0].message.content);
            if (data.isEnglish || !data.translated) return;

            // Reply to the original message with translation
            // Отговаряме на оригиналното съобщение с превода
            await message.reply({
                content: `🌐 **English:** ${data.translated}`,
                allowedMentions: { repliedUser: false } // Don't ping the user / Не пингваме
            });

        } catch (err) {
            console.error('Auto translate error:', err.message);
        }
    });

    console.log('✅ Translation systems ready (flag + auto) / Системите за превод са готови.');
}

module.exports = { initTranslateSystem };
