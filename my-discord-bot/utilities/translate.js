const Groq = require("groq-sdk");
const axios = require("axios"); // Използваме супер стабилния axios
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

const ISO_TO_LANG_NAME = {
    'fr': 'French', 'es': 'Spanish', 'it': 'Italian', 'de': 'German',
    'pl': 'Polish', 'bg': 'Bulgarian', 'en': 'English', 'ru': 'Russian',
    'uk': 'Ukrainian', 'ro': 'Romanian', 'tr': 'Turkish', 'zh': 'Chinese'
};

const flagCooldown = new Map();
const autoTranslateCooldown = new Map();
const COOLDOWN_MS = 5000;

const SKIP_CHANNEL_NAMES = ['ai-translator', 'bot-', 'admin', 'log', 'status'];

const LINGVA_INSTANCES = [
    'https://lingva.ml',
    'https://translate.plausibility.cloud',
    'https://lingva.thedaviddelta.com',
    'https://lingva.lunar.icu',
    'https://lingva.garudalinux.org',
    'https://lingva.totalandrogyny.com',
    'https://lingva.seby.io',
    'https://lingva.no-logs.com'
];

/**
 * Превежда/Детектва с Lingva чрез Axios със светкавичен таймаут
 */
async function lingvaTranslate(text, from = 'auto', to = 'en') {
    const encoded = encodeURIComponent(text);
    
    for (const instance of LINGVA_INSTANCES) {
        try {
            // Използваме axios с твърд timeout от 1500 милисекунди
            const res = await axios.get(`${instance}/api/v1/${from}/${to}/${encoded}`, {
                timeout: 1500,
                headers: { 'Accept': 'application/json' }
            });

            if (res.status === 200 && res.data?.translation) {
                return {
                    text: res.data.translation,
                    detectedLanguage: res.data.info?.detectedSource || null
                };
            }
        } catch (e) {
            // При грешка или забавяне скача веднага на следващото огледало
            continue;
        }
    }
    return null;
}

function initTranslateSystem(client) {

    // ─────────────────────────────────────────────
    // 1. FLAG REACTION TRANSLATOR
    // ─────────────────────────────────────────────
    client.on('messageReactionAdd', async (reaction, user) => {
        if (user.bot) return;
        if (!reaction.message.guild) return;

        const enabled = await getConfig(reaction.message.guild.id, 'flag_translate_enabled');
        if (enabled !== 'true') return;

        const flag = reaction.emoji.name;
        const targetLanguage = FLAG_TO_LANGUAGE[flag];
        if (!targetLanguage) return;

        // ПЪЛНО ПОДСИГУРЯВАНЕ: Задължително теглим обектите, ако са partial
        if (reaction.partial) { try { await reaction.fetch(); } catch (e) { return; } }
        if (reaction.message.partial) { try { await reaction.message.fetch(); } catch (e) { return; } }

        const messageContent = reaction.message.content;
        if (!messageContent || messageContent.trim().length === 0) return;

        const cooldownKey = `${reaction.message.id}:${user.id}:${flag}`;
        if (flagCooldown.has(cooldownKey)) return;
        flagCooldown.set(cooldownKey, true);
        setTimeout(() => flagCooldown.delete(cooldownKey), COOLDOWN_MS);

        try {
            const lingvaDetect = await lingvaTranslate(messageContent, 'auto', 'en');
            const sourceIso = lingvaDetect?.detectedLanguage || 'auto';
            const sourceLanguage = ISO_TO_LANG_NAME[sourceIso] || 'the original language';

            const systemPrompt = `You are an expert multilingual translator specializing in casual internet slang, chat context, and idioms.
Your task is to translate the user's message from ${sourceLanguage} into fluent, natural-sounding ${targetLanguage}.

CRITICAL RULES:
1. Do NOT translate literally word-for-word. Focus heavily on modern internet slang, context, and actual meaning.
2. If the message uses casual emphasis or slang (like French 'grave mieux'), adapt it into an equivalent natural phrasing in ${targetLanguage}.
3. Words like 'le traducteur', 'el traductor', 'the translator' refer to the translation tool/bot itself (IT), NOT a person (HE/SHE).
4. Output ONLY the raw translated text without quotes or explanations.`;

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

            const tempMsg = await reaction.message.channel.send(
                `${flag} <@${user.id}> **Translation to ${targetLanguage}:**\n> ${translated}`
            );
            setTimeout(() => tempMsg.delete().catch(() => {}), 2 * 60 * 1000);

        } catch (err) {
            console.error('Flag translate error:', err);
        }
    });

    // ─────────────────────────────────────────────
    // 2. AUTO TRANSLATE TO ENGLISH
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
            const result = await lingvaTranslate(cleanText, 'auto', 'en');
            if (!result?.text) return;

            if (result.detectedLanguage === 'en') return;
            if (result.text.toLowerCase().trim() === cleanText.toLowerCase().trim()) return;

            await message.reply({
                content: `🌐 **English:** ${result.text}`,
                allowedMentions: { repliedUser: false }
            });

        } catch (err) {
            console.error('Auto translate error:', err);
        }
    });

    console.log('✅ Translation systems bulletproofed with Axios.');
}

module.exports = { initTranslateSystem };
