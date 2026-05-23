const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// --- НАСТРОЙКИ ---
const TARGET_GUILD_ID = '1451310326019526800'; // Сложи ID на твоя сървър
const WELCOME_CHANNEL_ID = '1489675702914781337'; // Сложи ID на welcome канала
// -----------------

let lastWelcomeMessage = null;

module.exports = (client) => {

    // 1. ФУНКЦИЯ ЗА ПРАЩАНЕ НА ПАНЕЛА (използваме я на две места)
    const sendWelcomePanel = async (guild, targetMember = null) => {
        const channel = guild.channels.cache.get(WELCOME_CHANNEL_ID);
        if (!channel) return;

        // Изтриваме старото, ако го има
        if (lastWelcomeMessage) {
            await lastWelcomeMessage.delete().catch(() => {});
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('start_verify')
                .setLabel('Въведи никнейм за достъп')
                .setStyle(ButtonStyle.Success)
        );

        const embed = new EmbedBuilder()
            .setTitle('Добре дошли в сървъра!')
            .setDescription('За да получиш роля **Player** и достъп до каналите, натисни бутона и въведи името си.')
            .setColor('#5865F2');

        const content = targetMember ? `Добре дошъл, ${targetMember}!` : 'Панел за верификация:';
        
        lastWelcomeMessage = await channel.send({ content, embeds: [embed], components: [row] });
    };

    // 2. ПРИ ВЛИЗАНЕ НА НОВ ЧОВЕК
    client.on('guildMemberAdd', async (member) => {
        if (member.guild.id !== TARGET_GUILD_ID) return;

        // Даваме роля rookies
        const rookieRole = member.guild.roles.cache.find(r => r.name.toLowerCase() === 'rookies');
        if (rookieRole) await member.roles.add(rookieRole).catch(() => {});

        // Пращаме панела
        await sendWelcomePanel(member.guild, member);
    });

    // 3. РЪЧЕН SETUP (за тест)
    client.on('messageCreate', async (message) => {
        if (message.content === '!setupverify') {
            if (message.guild.id !== TARGET_GUILD_ID) return;
            if (!message.member.permissions.has('Administrator')) return;

            await message.delete().catch(() => {}); // Трие твоята команда
            await sendWelcomePanel(message.guild);
        }
    });

    // 4. ЛОГИКА ЗА БУТОНА И МОДАЛА
    client.on('interactionCreate', async (interaction) => {
        if (interaction.guildId !== TARGET_GUILD_ID) return;

        if (interaction.isButton() && interaction.customId === 'start_verify') {
            const modal = new ModalBuilder()
                .setCustomId('nick_modal')
                .setTitle('Регистрация');

            const nameInput = new TextInputBuilder()
                .setCustomId('nickname_input')
                .setLabel("Въведи твоя никнейм:")
                .setStyle(TextInputStyle.Short)
                .setMinLength(2)
                .setMaxLength(32)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
            await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'nick_modal') {
            const newNick = interaction.fields.getTextInputValue('nickname_input');
            const rookieRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'rookies');
            const playerRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'player');

            try {
                await interaction.member.setNickname(newNick);
                if (rookieRole) await interaction.member.roles.remove(rookieRole);
                if (playerRole) await interaction.member.roles.add(playerRole);

                await interaction.reply({ content: `Успешно променихме името ти на **${newNick}**. Вече си Player!`, ephemeral: true });
            } catch (err) {
                await interaction.reply({ content: 'Грешка! Провери дали ботът е над твоята роля в настройките.', ephemeral: true });
            }
        }
    });
};
