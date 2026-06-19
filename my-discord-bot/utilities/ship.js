const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { pool } = require("./db");
const { getConfig, getChannel } = require("./guildConfig");

const MAX_MEMBERS = 10;

// ─────────────────────────────────────────────
// Helper functions for reading ships from DB / Помощни функции за четене на кораби
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
// Send the ship registration panel / Send the panel за регистрация
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
            {
                name: '🛡️ Active Crew',
                value: 'These buttons are for **active players** who want to manage their participation. If you like switching ships or join frequently, pick your role below!',
                inline: false
            },
            {
                name: '⚓ Permanent Crew',
                value: 'Your spots are **secured**. If you don\'t feel like clicking, you are already part of the manifest. This is only for those who want to be active or have time on discord!',
                inline: false
            },
            {
                name: '📝 Request Permanent Status',
                value: 'If you don\'t want to deal with buttons every time and your ship choice **won\'t change** for future events, please **let us know**! We will assign you a permanent role so you don\'t have to register manually.',
                inline: false
            }
        )
        .setColor('#2ecc71')
        .setImage('https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExczVjbHA5emc1M3NuYmNybXZhNjlsNHk2OGtjbHMxODRzb2U0dGg1ZCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/7zmLy0sYn9Y8O6BrlF/giphy.gif')
        .setTimestamp();

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
// Handle button interactions / Обработва бутони
// ─────────────────────────────────────────────

async function handleShipInteraction(interaction) {
    if (!interaction.isButton()) return;
    const { customId, member, guild } = interaction;

    // Взимаме специфичната роля за този конкретен сървър от DB
    const modRoleId = await getConfig(guild.id, 'mod_role');
    const isAdmin = member.permissions.has('Administrator');
    const isOwner = guild.ownerId === member.id;
    const isMod = modRoleId ? member.roles.cache.has(modRoleId) : false;
    
    // Проверка за достъп до бутоните (Модераторска роля, Админ или Собственик)
    const isModOrAdmin = isAdmin || isOwner || isMod;

    // RESET FLEET / НУЛИРАНЕ НА ФЛОТА
    if (customId === 'ship_reset') {
        if (!isModOrAdmin) {
            return interaction.reply({ content: '❌ No permission.', flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

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

    // SHIP JOIN / ПРИСЪЕДИНЯВАНЕ КЪМ КОРАБ
    if (customId.startsWith('ship_join_')) {
        const shipKey = customId.replace('ship_join_', '');
        const ships = await getShips(guild.id);
        const ship = ships.find(s => s.ship_key === shipKey);
        if (!ship) return interaction.reply({ content: '❌ Ship not found.', flags: 64 });

        const role = guild.roles.cache.get(ship.role_id);
        if (!role) return interaction.reply({ content: '❌ Ship role not found. Contact an admin.', flags: 64 });

        if (member.roles.cache.has(ship.role_id)) {
            return interaction.reply({ content: 'ℹ️ You are already in this ship.', flags: 64 });
        }

        // Ако е оторизиран модератор/администратор, прескача ограниченията за пълен кораб
        if (!isModOrAdmin) {
            const permCheck = await pool.query(
                'SELECT 1 FROM permanent_crew WHERE guild_id = $1 AND user_id = $2',
                [guild.id, member.id]
            );
            if (permCheck.rowCount > 0) {
                return interaction.reply({ content: '⚠️ You are permanent crew. Your spot is already secured!', flags: 64 });
            }

            const captains = await getCaptains(guild.id);
            if (captains.includes(member.id)) {
                return interaction.reply({ content: '⚠️ Captains cannot switch ships.', flags: 64 });
            }

            if (role.members.size >= MAX_MEMBERS) {
                return interaction.reply({ content: `❌ **${ship.ship_name}** is full (${MAX_MEMBERS}/${MAX_MEMBERS}).`, flags: 64 });
            }
        }

        await interaction.deferReply({ flags: 64 });

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
// Handle !want and ship admin commands / Обработва !want и admin команди
// ─────────────────────────────────────────────

async function handleMessage(message) {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    // Ако съобщението изобщо не започва с !, директно спираме, за да не пречи на чата
    if (!content.startsWith('!')) return;

    const args = content.split(/\s+/);
    const cmd = args[0]?.toLowerCase();

    // 1. Взимаме mod_role от базата конкретно за ТОЗИ сървър
    const modRoleId = await getConfig(message.guild.id, 'mod_role');
    
    // 2. Вградени Discord права като бекъп
    const isAdmin = message.member.permissions.has('Administrator');
    const isOwner = message.guild.ownerId === message.author.id;
    
    // 3. Проверяваме дали потребителят притежава уникалната роля за този сървър
    const freshMember = await message.guild.members.fetch(message.author.id).catch(() => message.member);
    const isMod = modRoleId ? freshMember.roles.cache.has(modRoleId) : false;
    
    const isModOrAdmin = isAdmin || isOwner || isMod;

    // !want <ship-name> — request permanent crew spot (Достъпна за всички)
    if (cmd === '!want') {
        const rolesChannel = await getChannel(message.guild, 'belly_rush_roles_channel');
        const bellyChannel = await getChannel(message.guild, 'belly_rush_channel');
        const allowedChannel = rolesChannel || bellyChannel;
        if (allowedChannel && message.channel.id !== allowedChannel.id) {
            return message.reply(`❌ Use this command in <#${allowedChannel.id}>!`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }
        const shipName = args.slice(1).join(' ').toLowerCase();
        if (!shipName) return message.reply('❌ Usage: `!want <ship-name>`');

        const ships = await getShips(message.guild.id);
        const ship = ships.find(s => s.ship_name.toLowerCase() === shipName);

        if (!ship) {
            const list = ships.map(s => `\`${s.ship_name}\``).join(', ');
            return message.reply(`❌ Ship not found. Available ships: ${list || 'none'}`);
        }

        const adminLogId = await getConfig(message.guild.id, 'admin_log_channel');
        const adminLog = adminLogId ? message.guild.channels.cache.get(adminLogId) : null;

        const requestEmbed = new EmbedBuilder()
            .setTitle('⚓ Permanent Crew Request')
            .setDescription(`**${message.member.displayName}** wants to join **${ship.emoji} ${ship.ship_name}** as permanent crew.`)
            .addFields(
                { name: '👤 User', value: `${message.author}`, inline: true },
                { name: '🚢 Ship', value: `${ship.emoji} ${ship.ship_name}`, inline: true }
            )
            .setColor('#f39c12')
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`perm_approve:${message.author.id}:${ship.ship_key}`)
                .setLabel('✅ Approve')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`perm_deny:${message.author.id}:${ship.ship_key}`)
                .setLabel('❌ Deny')
                .setStyle(ButtonStyle.Danger)
        );

        if (adminLog) {
            await adminLog.send({ embeds: [requestEmbed], components: [row] });
            return message.reply(`📋 Your request to join **${ship.emoji} ${ship.ship_name}** as permanent crew has been sent for approval!`);
        } else {
            await addPermanentCrew(message.guild, message.member, ship, pool);
            return message.reply(`✅ You are now **PERMANENT** crew of **${ship.emoji} ${ship.ship_name}**!`);
        }
    }

    // Списък с админ команди за корабите, които изискват модераторски права
    const shipAdminCommands = [
        '!ship-add', '!ship-remove', '!ship-captain', '!ship-uncaptain', 
        '!ship-addpermanent', '!ship-removepermanent', '!ship-listpermanent', 
        '!ship-addrepair', '!ship-removerepair', '!ship-repairs'
    ];

    // Проверяваме дали командата е админска и дали потребителят НЯМА права
    if (shipAdminCommands.includes(cmd)) {
        if (!isModOrAdmin) {
            return message.reply('❌ Moderators and Admins only!');
        }
    }

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
            `INSERT INTO ships (guild_id, guild_name, ship_key, ship_name, emoji, role_id, position)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [message.guild.id, message.guild.name, shipKey, shipName, emoji, roleId, position]
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

    // !ship-list (Достъпна за всички)
    if (cmd === '!ship-list') {
        const ships = await getShips(message.guild.id);

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
            const captainRes = await pool.query(
                'SELECT username FROM ship_captains WHERE guild_id = $1 AND ship_key = $2',
                [message.guild.id, ship.ship_key]
            );
            const captainNames = captainRes.rows.map(r => r.username);

            embed.addFields({
                name: `${ship.emoji} ${ship.ship_name}`,
                value: `👥 Members: **${memberCount}/${MAX_MEMBERS}**\n⚓ Captain: ${captainNames.join(', ') || 'None'}\n🎭 Role: ${role ? `<@&${role.id}>` : '⚠️ Role missing'}`,
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

        // Изтриваме стария капитан на ТОЗИ кораб преди да назначим нов
        await pool.query(
            'DELETE FROM ship_captains WHERE guild_id = $1 AND ship_key = $2',
            [message.guild.id, ship.ship_key]
        );

        await pool.query(
            `INSERT INTO ship_captains (guild_id, guild_name, user_id, username, ship_key, ship_name)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (guild_id, user_id) DO UPDATE SET ship_key = $5, ship_name = $6, guild_name = $2, username = $4`,
            [message.guild.id, message.guild.name, targetUser.id, targetUser.displayName, ship.ship_key, ship.ship_name]
        );

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

    // !ship-addpermanent @user <ship-name>
    if (cmd === '!ship-addpermanent') {
        const targetUser = message.mentions.members.first();
        const shipName = args.slice(2).join(' ');
        if (!targetUser || !shipName) {
            return message.reply('❌ Usage: `!ship-addpermanent @user <ship-name>`');
        }
        const ships = await getShips(message.guild.id);
        const ship = ships.find(s => s.ship_name.toLowerCase() === shipName.toLowerCase());
        if (!ship) {
            const list = ships.map(s => `\`${s.ship_name}\``).join(', ');
            return message.reply(`❌ Ship not found. Available: ${list || 'none'}`);
        }
        await addPermanentCrew(message.guild, targetUser, ship, pool);
        return message.reply(`✅ **${targetUser.displayName}** added to permanent crew of **${ship.emoji} ${ship.ship_name}**!`);
    }

    // !ship-removepermanent @user
    if (cmd === '!ship-removepermanent') {
        const targetUser = message.mentions.members.first();
        if (!targetUser) return message.reply('❌ Usage: `!ship-removepermanent @user`');

        const res = await pool.query(
            'DELETE FROM permanent_crew WHERE guild_id = $1 AND user_id = $2 RETURNING ship_key',
            [message.guild.id, targetUser.id]
        );

        if (res.rowCount === 0) {
            return message.reply(`❌ **${targetUser.displayName}** is not in the permanent crew.`);
        }

        return message.reply(`✅ **${targetUser.displayName}** removed from permanent crew.`);
    }

    // !ship-listpermanent
    if (cmd === '!ship-listpermanent') {
        const res = await pool.query(
            'SELECT user_id, username, ship_key FROM permanent_crew WHERE guild_id = $1 ORDER BY ship_key',
            [message.guild.id]
        );

        if (res.rows.length === 0) {
            return message.reply('⚠️ No permanent crew members on this server.');
        }

        const ships = await getShips(message.guild.id);

        const embed = new EmbedBuilder()
            .setTitle('⚓ Permanent Crew')
            .setColor('#2ecc71')
            .setTimestamp();

        const grouped = {};
        res.rows.forEach(row => {
            const ship = ships.find(s => s.ship_key === row.ship_key);
            const shipName = ship ? `${ship.emoji} ${ship.ship_name}` : row.ship_key;
            if (!grouped[shipName]) grouped[shipName] = [];
            grouped[shipName].push(`<@${row.user_id}> (${row.username})`);
        });

        for (const [shipName, members] of Object.entries(grouped)) {
            embed.addFields({ name: shipName, value: members.join('\n'), inline: true });
        }

        return message.reply({ embeds: [embed] });
    }

    // !ship-addrepair
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
            'INSERT INTO repair_messages (guild_id, guild_name, ship_key, message) VALUES ($1, $2, $3, $4)',
            [message.guild.id, message.guild.name, ship.ship_key, repairMsg]
        );
        return message.reply(`✅ Repair message added for **${ship.emoji} ${ship.ship_name}**!\n> ${repairMsg.replace('{user}', '@someone')}`);
    }

    // !ship-removerepair
    if (cmd === '!ship-removerepair') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!ship-removerepair <id>` — get IDs with `!ship-repairs <name>`');
        const res = await pool.query('DELETE FROM repair_messages WHERE id = $1 AND guild_id = $2 RETURNING id', [id, message.guild.id]);
        if (res.rowCount === 0) return message.reply(`❌ No repair message with ID \`${id}\` found.`);
        return message.reply(`✅ Repair message \`${id}\` removed.`);
    }

    // !ship-repairs
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
        const list = res.rows.map(r => `\`ID: ${r.id}\` — ${r.message}`).join('\n');
        const embed = new EmbedBuilder()
            .setTitle(`🔥 Repair messages for ${ship.emoji} ${ship.ship_name}`)
            .setDescription(list)
            .setColor('#e74c3c')
            .setFooter({ text: 'Use !ship-removerepair <id> to delete | {user} = the @mention' });
        return message.reply({ embeds: [embed] });
    }
}

// ─────────────────────────────────────────────
// Helper: add member to permanent crew
// ─────────────────────────────────────────────
async function addPermanentCrew(guild, member, ship, pool) {
    const role = guild.roles.cache.get(ship.role_id);

    const ships = await getShips(guild.id);
    for (const s of ships) {
        if (member.roles.cache.has(s.role_id)) {
            await member.roles.remove(s.role_id).catch(() => {});
        }
    }
    if (role) await member.roles.add(role).catch(() => {});

    await pool.query(
        `INSERT INTO permanent_crew (guild_id, guild_name, user_id, username, ship_key, ship_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (guild_id, user_id) DO UPDATE SET username = $4, ship_key = $5, ship_name = $6, guild_name = $2`,
        [guild.id, guild.name, member.id, member.displayName, ship.ship_key, ship.ship_name]
    );
}

module.exports = { sendShipPanelDirect, handleShipInteraction, handleMessage, addPermanentCrew };
