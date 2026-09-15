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
// Локален (безплатен, без AI) филтър — прихваща очевидно английските
// съобщения ПРЕДИ да похарчим AI заявка. Само съмнителните случаи стигат до Groq/Gemini.
// ─────────────────────────────────────────────
const FOREIGN_DIACRITICS_REGEX = /[äöüßàâçéèêëîïôùûÿñíóúãõşğ]/i;

// Общ списък за процентното съвпадение — премахнати са думи, които са ИСТИНСКИ
// еднакви думи в немски/нидерландски (man, in, an, of, was, will, her, we, is),
// за да не наддуват изкуствено резултата за чужд текст.
const COMMON_ENGLISH_WORDS = new Set([
    'the','be','to','and','a','that','have','i','it','for','not','with','he','as','you','do','at',
    'this','but','his','by','from','they','say','she','or','my','one','all','would','there',
    'their','what','so','up','out','if','about','who','get','which','go','me','when','make','can','like','time',
    'no','just','him','know','take','people','into','year','your','good','some','could','them','see','other','than',
    'then','now','look','only','come','its','over','think','also','back','after','use','two','how','our','work',
    'first','well','way','even','new','want','because','any','these','give','day','most','us','are',
    'were','been','has','had','did','does','am','im','dont','doesnt','didnt','cant','wont','isnt','arent','thats',
    'youre','theyre','hes','shes','ive','youve','weve','theyve','ill','youll','hell','shell',
    'theyll','id','youd','hed','shed','wed','theyd','yeah','yes','ok','okay','lol','lmao','bro','dude',
    'thanks','thank','please','sorry','hi','hey','hello','bye','cool','nice','great','bad','love','hate',
    'need','got','going','gonna','wanna','gotta','really','very','too','still','never',
    'always','maybe','probably','actually','literally','right','wrong','sure','fine','stop','wait','let','lets'
]);

// "Сигурни" маркери — думи/съкращения, които реално НЕ съществуват като думи в немски/нидерландски.
// Трябва да има поне 1 такава в съобщението, иначе не сме достатъчно уверени, че е английски.
const STRONG_ENGLISH_MARKERS = new Set([
    'dont','doesnt','didnt','cant','wont','isnt','arent','thats','youre','theyre','hes','shes',
    'ive','youve','weve','theyve','ill','youll','hell','shell','theyll','id','youd','hed','shed','wed','theyd',
    'lol','lmao','bro','dude','gonna','wanna','gotta','yeah','okay','thanks','thank','please','sorry',
    'hey','hello','bye','the','you','your','really','actually','literally','probably','maybe',
    'love','hate','good','cool','nice','great','right','wrong','sure','fine','stop','wait','lets',
    'need','want','got','going','still','never','always','because','people','something','anything','nothing','everything'
]);

function isConfidentlyEnglish(text) {
    if (FOREIGN_DIACRITICS_REGEX.test(text)) return false; // немски/френски/испански и т.н. букви — сигурно не е английски

    const words = (text.toLowerCase().match(/[a-z']+/g) || []).map(w => w.replace(/'/g, ''));
    if (words.length < 2) return false; // прекалено кратко, за да сме сигурни — оставяме AI да реши

    const hasStrongMarker = words.some(w => STRONG_ENGLISH_MARKERS.has(w));
    if (!hasStrongMarker) return false; // няма нито една дума, която да е ГАРАНТИРАНО английска — към AI

    const matches = words.filter(w => COMMON_ENGLISH_WORDS.has(w)).length;
    return (matches / words.length) >= 0.6; // 60%+ чести английски думи → достатъчно уверени
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
                model: "qwen/qwen3.8-27b",
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

        // 🛡️ Локална проверка БЕЗ AI — ако е очевидно английски, спираме тук, без да харчим заявка/токени
        if (isConfidentlyEnglish(cleanText)) return;

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
                    model: "qwen/qwen3.8-27b",
                    reasoning_effort: "none", // връщаме на "none" — "default" пали вътрешен <think> процес, който трябваше да се чисти отделно; вместо reasoning, компенсираме с конкретни примери в промпта по-горе
                    temperature: 0.0, // ВАЖНО: Пълна нула! Премахва всякакво филмиране и пренаписване от страна на ИИ
                    max_tokens: 150
                });
                rawOutput = result.choices[0].message.content.trim();
            } catch (groqErr) {
                const isRateLimited = groqErr?.status === 429 || /rate_limit_exceeded/i.test(groqErr?.message || '');
                // Груповите модели понякога изчезват без предупреждение (decommission/preview snapshot смяна) —
                // тогава API-то връща 404 model_not_found. Третираме го като fallback случай, не само rate limit,
                // иначе преводът просто спира да работи мълчаливо докато някой не забележи логовете.
                const isModelGone = groqErr?.status === 404 || /model_not_found/i.test(groqErr?.code || groqErr?.message || '');
                if (!isRateLimited && !isModelGone) {
                    console.error('Auto translate (Groq) error:', groqErr.message);
                    return;
                }
                // 🔄 Groq му е дошъл лимитът, или моделът вече не съществува — прехвърляме тази заявка на Gemini
                const reason = isRateLimited ? 'лимит достигнат' : 'моделът вече не съществува (404)';
                console.warn(`[Translate] Groq ${reason} — превключвам временно на Gemini (${GEMINI_MODEL}) за тази заявка.`);
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
