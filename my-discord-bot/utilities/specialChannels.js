const { pool } = require("./db");
const { getConfig } = require("./guildConfig"); // ✅ МУЛТИ-СЪРВЪР

// Резервни съобщения ако корабът няма зададени repair съобщения
const FALLBACK_MESSAGES = [
    "**{user}**! 🔥 The ship is on fire! Someone do something!! 🔥",
    "**{user}**! 🔥 We're taking on water! HELP!! 🔥",
    "**{user}**! 🔥 The engine is broken! Get in here!! 🔥",
    "**{user}**! 🔥 Everything is on fire and nothing is fine!! 🔥",
    "**{user}**! 🔥 The crew is panicking! FIX IT!! 🔥"
];

// Съобщения за непознат кораб
const NO_SHIP_MESSAGES = [
    "🚫 **{user}**? This ship is not in our registry.",
    "🔍 We searched everywhere, but couldn't find **{user}**.",
    "⚓ Sorry, our dock doesn't support **{user}**.",
    "🛑 **{user}**? Check the ship name, mate!"
];

async function handleSpecialChannels(msg) {
    if (!msg.guild) return false;

    // ✅ МУЛТИ-СЪРВЪР: взима repair канала от конфига
    const repairChannelId = await getConfig(msg.guild.id, 'repair_channel');
    const isRepairChannel = repairChannelId
        ? msg.channel.id === repairChannelId
        : msg.channel.name.toLowerCase().includes('repair-ship');

    if (isRepairChannel) {
        const content = msg.content.trim();
        const lowerContent = content.toLowerCase();

        if (lowerContent.startsWith("repair ")) {
            const target = content.slice(7).trim();
            if (!target) return true;

            // Взимаме всички кораби на ТОЗИ сървър от базата
            const shipsRes = await pool.query(
                'SELECT ship_key, ship_name, emoji FROM ships WHERE guild_id = $1',
                [msg.guild.id]
            );

            // Намираме кораба по @mention или по ime
            const mentionedRole = msg.mentions.roles.first();
            let matchedShip = null;

            if (mentionedRole) {
                // Търсим по role_id
                const shipByRole = await pool.query(
                    'SELECT ship_key, ship_name, emoji FROM ships WHERE guild_id = $1 AND role_id = $2',
                    [msg.guild.id, mentionedRole.id]
                );
                if (shipByRole.rows.length > 0) matchedShip = shipByRole.rows[0];
            } else {
                // Търсим по ime (case-insensitive)
                matchedShip = shipsRes.rows.find(s =>
                    s.ship_name.toLowerCase() === target.toLowerCase()
                );
            }

            if (!matchedShip) {
                // Непознат кораб
                const randomMsg = NO_SHIP_MESSAGES[Math.floor(Math.random() * NO_SHIP_MESSAGES.length)];
                msg.channel.send(randomMsg.replace("{user}", target));
                return true;
            }

            // Взимаме repair съобщенията за ТОЗИ кораб на ТОЗИ сървър
            const repairRes = await pool.query(
                'SELECT message FROM repair_messages WHERE guild_id = $1 AND ship_key = $2',
                [msg.guild.id, matchedShip.ship_key]
            );

            let messages = repairRes.rows.map(r => r.message);

            // Ако няма зададени съобщения — ползваме fallback
            if (messages.length === 0) {
                messages = FALLBACK_MESSAGES;
            }

            const randomMsg = messages[Math.floor(Math.random() * messages.length)];
            const ping = mentionedRole ? `<@&${mentionedRole.id}>` : target;
            msg.channel.send(randomMsg.replace("{user}", ping));

        } else {
            // Грешно съобщение в repair канала — трие се
            try {
                await msg.delete();
                const warning = await msg.channel.send(
                    `⚠️ ${msg.author}, only \`repair @ship\` or \`repair ShipName\` commands are allowed here!`
                );
                setTimeout(() => warning.delete().catch(() => {}), 5000);
            } catch (err) {
                console.error("Repair channel error:", err.message);
            }
        }
        return true;
    }

    // ✅ Photos only канали
    if (msg.channel.name.toLowerCase().includes("photos")) {
        if (msg.attachments.size === 0) {
            try {
                await msg.delete();
                const warning = await msg.channel.send(`📸 ${msg.author}, only photos are allowed here!`);
                setTimeout(() => warning.delete().catch(() => {}), 5000);
            } catch (err) {
                console.error("Photo channel error:", err.message);
            }
            return true;
        }
    }

    return false;
}

module.exports = { handleSpecialChannels };
