const Groq = require("groq-sdk");
const { getConfig } = require("./guildConfig");

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
    '🇦🇷': 'Spanish', '🇨🇱': 'Spanish', '🇸🇷': 'Dutch',
    '🇭🇷': 'Croatian', '🇷🇸': 'Serbian', '🇸🇮': 'Slovenian',
    '🇧🇦': 'Bosnian', '🇲🇰': 'Macedonian', '🇦🇱': 'Albanian',
    '🇱🇹': 'Lithuanian', '🇱🇻': 'Latvian', '🇪🇪': 'Estonian',
    '🇮🇪': 'Irish', '🇮🇸': 'Icelandic', '🇵🇭': 'Filipino',
};

// Cooldown to prevent spam / Cooldown против спам
const translationCooldown = new Map();
const COOLDOWN_MS = 5000;

/**
 * Initialize the flag reaction translation system
 * Инициализира системата за превод с флаг реакции
 */
function initTranslateSystem(client) {
    client.on('messageReactionAdd', async (reaction, user) => {
        if (user.bot) return;
        if (!reaction.message.guild) return;

        // ✅ Check if flag translation is enabled for THIS server / Проверяваме дали е активирано
        const enabled = await getConfig(reaction.message.guild.id, 'flag_translate_enabled');
        if (enabled !== 'true') return;

        // Check if reaction is a flag emoji / Проверяваме дали е флаг емоджи
        const flag = reaction.emoji.name;
        const language = FLAG_TO_LANGUAGE[flag];
        if (!language) return;

        // Get the message content / Взимаме съдържанието
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
        if (translationCooldown.has(cooldownKey)) return;
        translationCooldown.set(cooldownKey, true);
        setTimeout(() => translationCooldown.delete(cooldownKey), COOLDOWN_MS);

        try {
            // Translate using Groq / Превеждаме с Groq
            const result = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `Translate the following text to ${language}. Return ONLY the translated text, nothing else.`
                    },
                    { role: "user", content: messageContent }
                ],
                model: "llama-3.3-70b-versatile",
                max_tokens: 500
            });

            const translated = result.choices[0].message.content.trim();
            if (!translated) return;

            // Send as ephemeral-style DM to the user / Изпращаме само на потребителя чрез ЛС
            try {
                await user.send(
                    `${flag} **Translation to ${language}:**\n\n` +
                    `> **Original:** ${messageContent.substring(0, 200)}${messageContent.length > 200 ? '...' : ''}\n\n` +
                    `**${language}:** ${translated}\n\n` +
                    `*From: #${reaction.message.channel.name} in ${reaction.message.guild.name}*`
                );
            } catch (dmErr) {
                // If DMs are closed, send as ephemeral in channel / Ако ЛС-ите са затворени
                const tempMsg = await reaction.message.channel.send(
                    `${flag} ${user}, **${language} translation:**\n> ${translated}`
                );
                setTimeout(() => tempMsg.delete().catch(() => {}), 15000);
            }

        } catch (err) {
            console.error('Flag translate error / Грешка при превод с флаг:', err.message);
        }
    });

    console.log('✅ Flag translation system ready. / Системата за флаг превод е готова.');
}

module.exports = { initTranslateSystem };
