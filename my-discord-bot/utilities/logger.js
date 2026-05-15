const { EmbedBuilder, AuditLogEvent, AttachmentBuilder } = require("discord.js");
const { getChannel } = require("./guildConfig"); // ✅ МУЛТИ-СЪРВЪР

/**
 * Помощна функция за изпращане на лог в admin_log_channel
 * ✅ МУЛТИ-СЪРВЪР: взима канала от конфига на ТОЗИ сървър
 */
async function sendLog(guild, embed, files = []) {
    const logChannel = await getChannel(guild, 'admin_log_channel');
    if (logChannel && logChannel.isTextBased()) {
        await logChannel.send({ embeds: [embed], files: files });
    }
}

/**
 * ЛОГ: Единично изтрито съобщение
 */
async function logDeletedMessage(message) {
    if (!message.guild || message.author?.bot) return;

    await new Promise(resolve => setTimeout(resolve, 1000));

    const fetchedLogs = await message.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MessageDelete,
    }).catch(() => null);

    const deletionLog = fetchedLogs?.entries.first();
    let executor = "Unknown (Self or Auto)";

    if (deletionLog) {
        const { executor: user, target } = deletionLog;
        if (target.id === message.author.id) {
            executor = `${user.tag}`;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle("🗑️ Message Deleted")
        .setColor("#ff0000")
        .addFields(
            { name: "Author", value: `${message.author.tag}`, inline: true },
            { name: "Deleted By", value: `${executor}`, inline: true },
            { name: "Channel", value: `#${message.channel.name}`, inline: true },
            { name: "Content", value: message.content?.substring(0, 1024) || "*(No text content)*" }
        )
        .setTimestamp();

    await sendLog(message.guild, embed);
}

/**
 * ЛОГ: Масово триене — генерира .txt файл
 */
async function logBulkDelete(messages, channel, executor) {
    if (!messages || messages.size === 0) return;

    const logContent = messages.reverse().map(m => {
        const time = m.createdAt.toLocaleString('bg-BG');
        const author = m.author ? m.author.tag : "Unknown User";
        const content = m.content || "*(No text content/Image)*";
        return `[${time}] ${author}: ${content}`;
    }).join("\n");

    const logFile = new AttachmentBuilder(Buffer.from(logContent, 'utf-8'), { name: 'deleted_messages_log.txt' });

    const embed = new EmbedBuilder()
        .setTitle("🧹 Bulk Messages Deleted")
        .setColor("#ffa500")
        .addFields(
            { name: "Channel", value: `#${channel.name}`, inline: true },
            { name: "Executed By", value: `${executor.tag}`, inline: true },
            { name: "Total Messages", value: `${messages.size}`, inline: true }
        )
        .setDescription("Attached file contains the full text of all deleted messages.")
        .setTimestamp();

    await sendLog(channel.guild, embed, [logFile]);
}

module.exports = { logDeletedMessage, logBulkDelete };
