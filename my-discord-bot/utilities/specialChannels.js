const repairMessages = require("../data/repairMessages");

const allowedShips = ["@mugi-ship", "@goat-ship", "@ati-ship", "@mari-ship"];
const noShipMessages = [
    "🚫 Hmm, **{user}**? This ship is not in our registry.",
    "🔍 We searched everywhere, but couldn't find **{user}**.",
    "⚓ Sorry, our dock doesn't support models like **{user}**.",
    "🛑 **{user}**? Check your spelling, mate!"
];

async function handleSpecialChannels(msg) {
    if (msg.channel.name === "│🚢│repair-ship") {
        const content = msg.content.trim();
        const lowerContent = content.toLowerCase();

        if (lowerContent.startsWith("repair ")) {
            // 1. Взимаме таргет текста (напр. "@mugi-ship")
            const target = content.slice(7).trim(); 
            if (!target) return true;

            // 2. Опит за намиране на роля, ако потребителят е тагнал истинска роля в Discord
            const mentionedRole = msg.mentions.roles.first();
            
            // Ако има тагната роля, ползваме нейното име с @ отпред, иначе ползваме написания текст
            const shipKey = mentionedRole ? `@${mentionedRole.name.toLowerCase()}` : target.toLowerCase();

            // 3. Проверка в обекта със съобщения (от repairMessages.js)
            if (repairMessages[shipKey]) {
                const shipSpecificMessages = repairMessages[shipKey];
                const randomMsg = shipSpecificMessages[Math.floor(Math.random() * shipSpecificMessages.length)];
                
                // Изпращаме съобщението, замествайки {user} с тага на ролята
                msg.channel.send(randomMsg.replace("{user}", target));
            } else {
                // Ако името не съвпада с нищо в списъка
                const randomNoShip = noShipMessages[Math.floor(Math.random() * noShipMessages.length)];
                msg.channel.send(randomNoShip.replace("{user}", target));
            }
        } else {
            // Изтриване на грешни съобщения в канала
            try {
                await msg.delete();
                const warning = await msg.channel.send(`⚠️ ${msg.author}, only repair commands are allowed here!`);
                setTimeout(() => warning.delete().catch(() => {}), 5000);
            } catch (err) { console.error("Error:", err.message); }
        }
        return true; 
    }

   // --- 2. НОВАТА Логика за СНИМКИ (Photos Only) ---
    // Сега ботът ще трие САМО ако името на канала съдържа думата "photos"
    // Пример: #daily-photos, #island-photos. В #nsfw вече няма да трие!
    if (msg.channel.name.toLowerCase().includes("photos")) {
        if (msg.attachments.size === 0) {
            try {
                await msg.delete();
                const warning = await msg.channel.send(`📸 ${msg.author}, only photos are allowed in this channel!`);
                setTimeout(() => warning.delete().catch(() => {}), 5000);
            } catch (err) { console.error("Photo channel cleanup error:", err.message); }
            return true; 
        }
    }
    
    return false; 
}

module.exports = { handleSpecialChannels };
