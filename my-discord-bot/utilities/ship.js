const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { pool } = require("./db");
const { getConfig, getChannel } = require("./guildConfig");

const MAX_MEMBERS = 10;

// ─────────────────────────────────────────────
// Помощни функции за четене на кораби от DB
// ─────────────────────────────────────────────

async function getShips(guildId) {
    const res = await pool.query(
        'SELECT * FROM ships WHERE guild_id = $1 ORDER BY position ASC',
        [guildId]
    );
    return res.rows; // [{ id, guild_id, ship_key, ship_name, emoji, role_id, position }]
}

async function getCaptains(guildId) {
    const res = await pool.query(
        'SELECT user_id FROM ship_captains WHERE guild_id = $1',
        [guildId]
    );
    return res.rows.map(r => r.user_id);
}

async function getPermanentCrew(guildId) {
    const res = await pool.query(
        'SELECT user_id, ship_key FROM permanent_crew WHERE guild_id = $1',
        [guildId]
    );
    return res.rows; // [{ user_id, ship_key }]
}

// ─────────────────────────────────────────────
// Изпраща панела за регистрация
// ─────────────────────────────────────────────

async function sendShipPanelDirect(channel) {
    const ships = await getShips(channel.guild.id);

    if (ships.length === 0) {
        return channel.send("⚠️ No ships configured. Use `!ship-add <name> <emoji>` to add ships.");
    }

    const embed = new EmbedBuilder()
        .setTitle('🚢 BELLY RUSH | Ship Registration')
        .setDescription('***Attention Sailors!*** ⚓\nThe fleet is preparing for departure. Get ready for battle!')
        .addFields(
            { name: '🛡️ Active Crew', value: 'Pick your ship using the buttons below!', inline: false },
            { name: '⚓ Permanent Crew', value: 'Your spots are **secured**. You are already part of the manifest.', inline: false },
            { name: '📝 Request Permanent Status', value: 'Use `!want <ship-name>` to never have to click buttons again!', inline: false }
        )
        .setColor('#2ecc71')
        .setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExczVjbHA5emc1M3NuYmNybXZhNjlsNHk2OGtjbHMxODRzb2U0dGg1ZCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/7zmLy0sYn9Y8O6BrlF/giphy.gif')
        .setTimestamp();

    // Добавяме бутон за всеки кораб (max 4 бутона на ред)
    const rows = [];
    let currentRow = new ActionRowBuilder();
    let count = 0;

    for (const ship of ships) {
        if (count > 0 && count % 4 === 0) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }
        currentRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`ship_join_${ship.ship_key}`)
                .setLabel(`${ship.emoji} ${ship.ship_name}`)
                .setStyle(ButtonStyle.Primary)
        );
        count++;
    }

    // Reset бутон на отделен ред
    rows.push(currentRow);
    rows.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ship_reset')
                .setLabel('Reset Fleet')
                .setStyle(ButtonStyle.Danger)
        )
    );

    await channel.send({ content: '@everyone Belly Rush is OPEN!', embeds: [embed], components: rows });
}

// ─────────────────────────────────────────────
// Обработва бутони
// ─────────────────────────────────────────────

async function handleShipInteraction(interaction) {
    if (!interaction.isButton()) return;
    const { customId, member, guild, user } = interaction;

    // RESET FLEET
    if (customId === 'ship_reset') {
        const isAdmin = member.permissions.has('Administrator');
        if (!isAdmin) {
            return interaction.reply({ content: '❌ No permission.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const permanentCrew = await getPermanentCrew(guild.id);
        const permanentIds = permanentCrew.map(r => r.user_id);
        const captains = await getCaptains(guild.id);
        const ships = await getShips(guild.id);

        let removed = 0;
        for (const ship of ships) {
            const role = guild.roles.cache.get(ship.role_id);
            if (!role) continue;
            for (const [, m] of role.members) {
                if (!permanentIds.includes(m.id) && !captains.includes(m.id)) {
                    await m.roles.remove(role).catch(() => {});
                    removed++;
                }
            }
        }
        return interaction.editReply(`✅ Cleared ${removed} users. Permanent crew and captains stayed.`);
    }

    // SHIP JOIN
    if (customId.startsWith('ship_join_')) {
        const shipKey = customId.replace('ship_join_', '');
        const ships = await getShips(guild.id);
        const ship = ships.find(s => s.ship_key === shipKey);
        if (!ship) return interaction.reply({ content: '❌ Ship not found.', ephemeral: true });

        const role = guild.roles.cache.get(ship.role_id);
        if (!role) return interaction.reply({ content: '❌ Ship role not found. Contact an admin.', ephemeral: true });

        // Вече в този кораб?
        if (member.roles.cache.has(ship.role_id)) {
            return interaction.reply({ content: 'ℹ️ You are already in this ship.', ephemeral: true });
        }

        // Постоянен екипаж?
        const permCheck = await pool.query(
            'SELECT 1 FROM permanent_crew WHERE guild_id = $1 AND user_id = $2',
            [guild.id, member.id]
        );
        if (permCheck.rowCount > 0) {
            return interaction.reply({ content: '⚠️ You are permanent crew. Your spot is already secured!', ephemeral: true });
        }

        // Капитан?
        const captains = await getCaptains(guild.id);
        if (captains.includes(member.id)) {
            return interaction.reply({ content: '⚠️ Captains cannot switch ships.', ephemeral: true });
        }

        // Пълен ли е корабът?
        if (role.members.size >= MAX_MEMBERS) {
            return interaction.reply({ content: `❌ **${ship.ship_name}** is full (${MAX_MEMBERS}/${MAX_MEMBERS}).`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        // Махаме всички стари корабни роли
        for (const s of ships) {
            if (member.roles.cache.has(s.role_id)) {
                await member.roles.remove(s.role_id).catch(() => {});
            }
        }

        await member.roles.add(role);
        return interaction.editReply(`✅ You joined **${ship.emoji} ${ship.ship_name}**!`);
    }
}

// ─────────────────────────────────────────────
// Обработва !want и ship admin команди
// ─────────────────────────────────────────────

async function handleMessage(message) {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    const args = content.split(/\s+/);
    const cmd = args[0]?.toLowerCase();

    // !want <ship-name> — заявка за постоянно място
    if (cmd === '!want') {
        const bellyChannel = await getChannel(message.guild, 'belly_rush_channel');
        if (bellyChannel && message.channel.id !== bellyChannel.id) return;

        const shipName = args.slice(1).join(' ').toLowerCase();
        if (!shipName) return message.reply('❌ Usage: `!want <ship-name>`');

        const ships = await getShips(message.guild.id);
        const ship = ships.find(s => s.ship_name.toLowerCase() === shipName);

        if (!ship) {
            const list = ships.map(s => `\`${s.ship_name}\``).join(', ');
            return message.reply(`❌ Ship not found. Available ships: ${list || 'none'}`);
        }

        const role = message.guild.roles.cache.get(ship.role_id);
        if (!role) return message.reply('❌ Ship role not found. Contact an admin.');

        // Махаме стари корабни роли
        for (const s of ships) {
            if (message.member.roles.cache.has(s.role_id)) {
                await message.member.roles.remove(s.role_id).catch(() => {});
            }
        }
        await message.member.roles.add(role);

        await pool.query(
            `INSERT INTO permanent_crew (guild_id, user_id, username, ship_key)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (guild_id, user_id) DO UPDATE SET username = $3, ship_key = $4`,
            [message.guild.id, message.author.id, message.author.username, ship.ship_key]
        );

        return message.reply(`✅ You are now **PERMANENT** crew of **${ship.emoji} ${ship.ship_name}**!`);
    }

    // ── ADMIN КОМАНДИ ──
    if (!message.member.permissions.has('Administrator')) return;

    // !ship-add <name> <emoji> <@role>
    if (cmd === '!ship-add') {
        const shipName = args[1];
        const emoji = args[2];
        const roleId = message.mentions.roles.first()?.id || args[3];

        if (!shipName || !emoji || !roleId) {
            return message.reply('❌ Usage: `!ship-add <name> <emoji> <@role>`\nExample: `!ship-add "Sunny" ☀️ @mugi-ship`');
        }

        const ships = await getShips(message.guild.id);
        const shipKey = `ship_${Date.now()}`;
        const position = ships.length + 1;

        await pool.query(
            `INSERT INTO ships (guild_id, ship_key, ship_name, emoji, role_id, position)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [message.guild.id, shipKey, shipName, emoji, roleId, position]
        );

        return message.reply(`✅ Ship **${emoji} ${shipName}** added! Use \`!ship-list\` to see all ships.`);
    }

    // !ship-remove <name>
    if (cmd === '!ship-remove') {
        const shipName = args.slice(1).join(' ');
        if (!shipName) return message.reply('❌ Usage: `!ship-remove <name>`');

        const res = await pool.query(
            'DELETE FROM ships WHERE guild_id = $1 AND LOWER(ship_name) = $2 RETURNING ship_name',
            [message.guild.id, shipName.toLowerCase()]
        );

        if (res.rowCount === 0) return message.reply(`❌ Ship **${shipName}** not found.`);
        return message.reply(`✅ Ship **${shipName}** removed.`);
    }

    // !ship-list
    if (cmd === '!ship-list') {
        const ships = await getShips(message.guild.id);
        const captains = await getCaptains(message.guild.id);

        if (ships.length === 0) {
            return message.reply('⚠️ No ships configured. Use `!ship-add <name> <emoji> <@role>`');
        }

        const embed = new EmbedBuilder()
            .setTitle('🚢 Ship Fleet')
            .setColor('#2ecc71')
            .setTimestamp();

        for (const ship of ships) {
            const role = message.guild.roles.cache.get(ship.role_id);
            const memberCount = role ? role.members.size : 0;
            const captainMembers = captains
                .map(id => message.guild.members.cache.get(id))
                .filter(m => m && m.roles.cache.has(ship.role_id))
                .map(m => m.displayName);

            embed.addFields({
                name: `${ship.emoji} ${ship.ship_name}`,
                value: `👥 Members: **${memberCount}/${MAX_MEMBERS}**\n⚓ Captain: ${captainMembers.join(', ') || 'None'}\n🎭 Role: ${role ? `<@&${role.id}>` : '⚠️ Role missing'}`,
                inline: true
            });
        }

        return message.reply({ embeds: [embed] });
    }

    // !ship-captain @user <ship-name>
    if (cmd === '!ship-captain') {
        const targetUser = message.mentions.members.first();
        const shipName = args.slice(2).join(' ');

        if (!targetUser || !shipName) {
            return message.reply('❌ Usage: `!ship-captain @user <ship-name>`');
        }

        const ships = await getShips(message.guild.id);
        const ship = ships.find(s => s.ship_name.toLowerCase() === shipName.toLowerCase());

        if (!ship) return message.reply(`❌ Ship **${shipName}** not found.`);

        await pool.query(
            `INSERT INTO ship_captains (guild_id, user_id, ship_key)
             VALUES ($1, $2, $3)
             ON CONFLICT (guild_id, user_id) DO UPDATE SET ship_key = $3`,
            [message.guild.id, targetUser.id, ship.ship_key]
        );

        // Дава ролята на капитана автоматично
        const role = message.guild.roles.cache.get(ship.role_id);
        if (role && !targetUser.roles.cache.has(ship.role_id)) {
            await targetUser.roles.add(role).catch(() => {});
        }

        return message.reply(`✅ **${targetUser.displayName}** is now captain of **${ship.emoji} ${ship.ship_name}**!`);
    }

    // !ship-uncaptain @user
    if (cmd === '!ship-uncaptain') {
        const targetUser = message.mentions.members.first();
        if (!targetUser) return message.reply('❌ Usage: `!ship-uncaptain @user`');

        await pool.query(
            'DELETE FROM ship_captains WHERE guild_id = $1 AND user_id = $2',
            [message.guild.id, targetUser.id]
        );

        return message.reply(`✅ **${targetUser.displayName}** is no longer a captain.`);
    }
}


    // !ship-addrepair <ship-name> <message>
    // Добавя repair съобщение за конкретен кораб
    // Използвай {user} за да покажеш @mention-а на кораба
    if (cmd === '!ship-addrepair') {
        const shipName = args[1];
        const repairMsg = args.slice(2).join(' ');
        if (!shipName || !repairMsg) {
            return message.reply('❌ Usage: `!ship-addrepair <ship-name> <message>`\nExample: `!ship-addrepair Sunny {user} the sails are on fire!!`\n\n💡 Use `{user}` where the @mention should appear.');
        }
        const ships = await getShips(message.guild.id);
        const ship = ships.find(s => s.ship_name.toLowerCase() === shipName.toLowerCase());
        if (!ship) {
            const list = ships.map(s => `\`${s.ship_name}\``).join(', ');
            return message.reply(`❌ Ship **${shipName}** not found. Available: ${list || 'none'}`);
        }
        await pool.query(
            'INSERT INTO repair_messages (guild_id, ship_key, message) VALUES ($1, $2, $3)',
            [message.guild.id, ship.ship_key, repairMsg]
        );
        return message.reply(`✅ Repair message added for **${ship.emoji} ${ship.ship_name}**!\n> ${repairMsg.replace('{user}', '@someone')}`);
    }

    // !ship-removerepair <id>
    // Маха repair съобщение по ID (взима ID от !ship-repairs)
    if (cmd === '!ship-removerepair') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!ship-removerepair <id>` — get IDs with `!ship-repairs <name>`');
        const res = await pool.query('DELETE FROM repair_messages WHERE id = $1 AND guild_id = $2 RETURNING id', [id, message.guild.id]);
        if (res.rowCount === 0) return message.reply(`❌ No repair message with ID \`${id}\` found.`);
        return message.reply(`✅ Repair message \`${id}\` removed.`);
    }

    // !ship-repairs <ship-name>
    // Показва всички repair съобщения за даден кораб с техните ID-та
    if (cmd === '!ship-repairs') {
        const shipName = args.slice(1).join(' ');
        if (!shipName) return message.reply('❌ Usage: `!ship-repairs <ship-name>`');
        const ships = await getShips(message.guild.id);
        const ship = ships.find(s => s.ship_name.toLowerCase() === shipName.toLowerCase());
        if (!ship) return message.reply(`❌ Ship **${shipName}** not found.`);
        const res = await pool.query(
            'SELECT id, message FROM repair_messages WHERE guild_id = $1 AND ship_key = $2 ORDER BY id ASC',
            [message.guild.id, ship.ship_key]
        );
        if (res.rows.length === 0) {
            return message.reply(`⚠️ No repair messages for **${ship.emoji} ${ship.ship_name}** yet.\nAdd one with: \`!ship-addrepair ${ship.ship_name} {user} your message here\``);
        }
        const { EmbedBuilder } = require('discord.js');
        const list = res.rows.map(r => `\`ID: ${r.id}\` — ${r.message}`).join('\n');
        const embed = new EmbedBuilder()
            .setTitle(`🔥 Repair messages for ${ship.emoji} ${ship.ship_name}`)
            .setDescription(list)
            .setColor('#e74c3c')
            .setFooter({ text: 'Use !ship-removerepair <id> to delete | {user} = the @mention' });
        return message.reply({ embeds: [embed] });
    }

module.exports = { sendShipPanelDirect, handleShipInteraction, handleMessage };
