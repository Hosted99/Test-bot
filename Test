// test_bot.js
const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const app = express();

const TOKEN = process.env.TOKEN; // добави в Render Environment Variable

// Създаваме Discord клиента
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ],
});

// Keep-alive сървър
app.get("/", (req, res) => res.send("Bot is alive!"));
app.listen(3000, () => console.log("Keep-alive server running on port 3000"));

// Функция за изпращане на тестово съобщение
function sendTestMessage() {
  client.guilds.cache.forEach(guild => {
    const channel = guild.channels.cache.find(
      c => c.isTextBased() && c.permissionsFor(guild.members.me).has("SendMessages")
    );

    if (channel) {
      channel.send("✅ Тест: ботът работи!");
    }
  });
}

// Когато ботът е готов
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Задаваме онлайн статус и активност
  client.user.setStatus("online");
  client.user.setActivity("тест съобщение", { type: "WATCHING" });

  // Изпращаме тестово съобщение след 1 минута
  setTimeout(() => {
    sendTestMessage();
    console.log("Тестовото съобщение е изпратено!");
  }, 60 * 1000); // 60 секунди
});

// Логинваме бота
client.login(TOKEN);
