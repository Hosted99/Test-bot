const { EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
    async getRandomMeme(msg) {
        try {
            let data;

            for (let i = 0; i < 10; i++) {
                const res = await fetch('https://meme-api.com/gimme/OnePiece,animememes');
                const json = await res.json();

                if (
                    json.url &&
                    json.url.match(/\.(jpg|jpeg|png|gif)$/) &&
                    json.ups > 50 && // по-нисък праг
                    !json.over_18 && // без NSFW
                    !json.title.toLowerCase().includes("chapter") &&
                    !json.title.toLowerCase().includes("spoiler")
                ) {
                    data = json;
                    break;
                }
            }

            // ако не намерим "перфектно" → пращаме нещо все пак
            if (!data) {
                const res = await fetch('https://meme-api.com/gimme/animememes');
                data = await res.json();
            }

            const embed = new EmbedBuilder()
                .setTitle(data.title || "One Piece Meme 🏴‍☠️")
                .setImage(data.url)
                .setColor('#ffcc00')
                .setFooter({ text: `👍 ${data.ups} | r/${data.subreddit}` });

            await msg.channel.send({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            await msg.reply('Grand Line пак ни тролна 😭');
        }

        await msg.delete().catch(() => {});
    }
};
