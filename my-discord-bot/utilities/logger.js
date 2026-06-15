const { EmbedBuilder, AuditLogEvent, AttachmentBuilder } = require("discord.js");
const { getChannel } = require("./guildConfig"); // ✅ МУЛТИ-СЪРВЪР

/**
 * Помощна функция за изпращане на лог в admin_log_channel
 * ✅ МУЛТИ-СЪРВЪР: взима канала от конфига на ТОЗИ сървър
 */
async function sendLog(guild, embed, files = []) {
    const logChannel = await getChannel(guild, 'admin_log_channel');
    if (logChannel && logChannel.isTextBased()) {
        await logChannel.send({ embeds: [embed], files }).catch(() => {});
    }
}

// ─────────────────────────────────────────────────────────────
// Засичане на ИЗВЪРШИТЕЛЯ през Audit Log
// ─────────────────────────────────────────────────────────────
// Discord НЕ казва в самото messageDelete събитие кой е изтрил.
// Когато някой трие ЧУЖДО съобщение → Discord прави Audit Log запис.
// Когато човек трие СВОЕ съобщение → НЯМА Audit запис изобщо.
//
// Тънкият момент: при триене на няколко съобщения от един и същ автор
// Discord не прави нов запис всеки път, а УВЕЛИЧАВА брояча (extra.count)
// на съществуващия. Затова пазим последния видян запис за всеки сървър и
// атрибутираме само ако записът е НОВ или броячът е скочил → реален модератор.
const auditCache = new Map(); // guildId -> { id, count }

async function resolveDeleteExecutor(message) {
    if (!message.guild || !message.author) return null;
    try {
        const logs = await message.guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MessageDelete,
        }).catch(() => null);

        const entry = logs?.entries?.first();
        if (!entry) return null;

        const { executor, target, extra, id, createdTimestamp } = entry;
        const count = extra?.count ?? 0;

        const prev = auditCache.get(message.guild.id);
        auditCache.set(message.guild.id, { id, count });

        // Трябва да е за същия автор и (ако знаем) същия канал
        if (target?.id !== message.author.id) return null;
        if (extra?.channel && extra.channel.id !== message.channel?.id) return null;

        // Нов запис ИЛИ скочил брояч = някой друг го е изтрил
        const isNewOrIncremented = !prev || prev.id !== id || count > prev.count;
        // Пресен запис (за да не приписваме старо триене след рестарт)
        const isRecent = Date.now() - createdTimestamp < 15000;

        return (isNewOrIncremented && isRecent) ? executor : null;
    } catch {
        return null;
    }
}

/**
 * ЛОГ: Единично изтрито съобщение
 */
async function logDeletedMessage(message) {
    if (!message.guild) return;
    // (Логваме и съобщенията на ботове, вкл. на самия бот — по желание на потребителя)

    // Малко изчакване, за да успее Audit Log-ът да се обнови
    await new Promise(resolve => setTimeout(resolve, 1200));

    const executor = await resolveDeleteExecutor(message);

    // Кой го е изтрил
    let deletedBy;
    if (executor) {
        deletedBy = `${executor.tag} \`(${executor.id})\``;
    } else if (message.author) {
        deletedBy = `${message.author.tag} (сам си го изтри) / неизвестно`;
    } else {
        deletedBy = "Неизвестно";
    }

    const authorText = message.author
        ? `${message.author.tag} \`(${message.author.id})\``
        : "Неизвестен (некеширано съобщение)";

    const channelMention = message.channel?.id ? `<#${message.channel.id}>` : "неизвестен канал";

    const embed = new EmbedBuilder()
        .setTitle("🗑️ Message Deleted")
        .setColor("#ff0000")
        .addFields(
            { name: "👤 Author", value: authorText, inline: true },
            { name: "🛡️ Deleted By", value: deletedBy, inline: true },
            { name: "📍 Channel", value: channelMention, inline: true }
        )
        .setTimestamp();

    // Съдържание (или бележка ако е некеширано)
    const content = message.content && message.content.length > 0
        ? message.content.substring(0, 1024)
        : (message.partial ? "*(некеширано — съдържанието не е налично)*" : "*(без текст)*");
    embed.addFields({ name: "💬 Content", value: content });

    // Прикачени файлове (имена + линкове, ако ги има)
    if (message.attachments && message.attachments.size > 0) {
        const files = [...message.attachments.values()]
            .map(a => `[${a.name}](${a.url})`)
            .join("\n")
            .substring(0, 1024);
        embed.addFields({ name: `📎 Attachments (${message.attachments.size})`, value: files });
    }

    // Кога е било пратено оригинално
    if (message.createdTimestamp) {
        embed.addFields({
            name: "⏱️ Originally sent",
            value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`,
            inline: true
        });
    }

    await sendLog(message.guild, embed);
}

/**
 * ЛОГ: Масово триене — генерира .txt файл с всички съобщения
 */
async function logBulkDelete(messages, channel, executor) {
    if (!messages || messages.size === 0 || !channel?.guild) return;

    const logContent = [...messages.values()].reverse().map(m => {
        const time = m.createdAt ? m.createdAt.toLocaleString('bg-BG') : "неизвестно време";
        const author = m.author ? m.author.tag : "Неизвестен (некеширано)";
        let content = m.content || "*(без текст)*";
        if (m.attachments && m.attachments.size > 0) {
            content += " " + [...m.attachments.values()].map(a => `[файл: ${a.name}]`).join(" ");
        }
        return `[${time}] ${author}: ${content}`;
    }).join("\n");

    const logFile = new AttachmentBuilder(Buffer.from(logContent || "няма налично съдържание", 'utf-8'), {
        name: 'deleted_messages_log.txt'
    });

    const embed = new EmbedBuilder()
        .setTitle("🧹 Bulk Messages Deleted")
        .setColor("#ffa500")
        .addFields(
            { name: "📍 Channel", value: channel.id ? `<#${channel.id}>` : `#${channel.name || "?"}`, inline: true },
            { name: "🛡️ Executed By", value: executor?.tag ? `${executor.tag}` : "Неизвестно", inline: true },
            { name: "🔢 Total Messages", value: `${messages.size}`, inline: true }
        )
        .setDescription("Прикаченият файл съдържа пълния текст на изтритите съобщения.")
        .setTimestamp();

    await sendLog(channel.guild, embed, [logFile]);
}

/**
 * Засича извършителя на масово триене (за main.js)
 */
async function resolveBulkExecutor(guild) {
    try {
        const logs = await guild.fetchAuditLogs({
            limit: 1,
            type: AuditLogEvent.MessageBulkDelete,
        }).catch(() => null);
        const entry = logs?.entries?.first();
        if (entry && Date.now() - entry.createdTimestamp < 15000) return entry.executor;
    } catch { /* silent */ }
    return null;
}

module.exports = { logDeletedMessage, logBulkDelete, resolveBulkExecutor };
