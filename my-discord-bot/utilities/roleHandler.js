const {EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle,PermissionsBitField} = require("discord.js");
const { getConfig, getRole, getChannel } = require('./guildConfig');

// ✅ MULTI-SERVER: no ALLOWED_GUILDS — bot works for EVERY server / работи за ВСЕКИ сървър
// Ролите се конфигурират с !setconfig rookies_role <id> и !setconfig player_role <id>

const lastWelcomeMessage = new Map();

// ✅ Без таван: изчислява tier динамично на стъпки от 50M (50M+, 100M+, ... 1000M+, 1050M+, безкрайно нагоре)
// No cap: dynamically computes the bounty tier in 50M steps, scales infinitely
const BOUNTY_STEP = 50000000; // 50M
const BOUNTY_FLOOR = 50000000; // под 50M няма роля / below 50M no role

function getBountyTierName(amount) {
  if (amount < BOUNTY_FLOOR) return null;
  const tierM = Math.floor(amount / BOUNTY_STEP) * (BOUNTY_STEP / 1000000);
  return `Bounty: ${tierM}M+`;
}

/**
 * 1. ПОСРЕЩАНЕ И ВЕРИФИКАЦИЯ
 */
async function getOrCreateConfigRole(guild, configKey, roleName, roleColor) {
  // Взима ролята от конфига, ако не е зададена — търси по ime, ако я няма — създава я
  const { getConfig, setConfig } = require('./guildConfig');
  let role = await getRole(guild, configKey);
  if (!role) {
    // Search by name / Търсим по ime
    role = guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
      // Auto-create the role / Създаваме ролята автоматично
      try {
        role = await guild.roles.create({ name: roleName, color: roleColor, reason: `Auto-created by bot` });
        console.log(`✅ Created role "${roleName}" in ${guild.name}`);
      } catch (err) {
        console.error(`❌ Could not create role "${roleName}":`, err.message);
        return null;
      }
    }
    // Save role ID to config for next time / Запазваме ID-то в конфига
    await setConfig(guild.id, configKey, role.id, guild.name);
    console.log(`✅ Saved ${configKey} = ${role.id} for ${guild.name}`);
  }
  return role;
}

async function handleNewMember(member) {
  try {
    // ✅ Get or auto-create the Rookie role / Взима или създава Rookie ролята
    const rookieRole = await getOrCreateConfigRole(member.guild, 'rookies_role', 'Rookie', '#95a5a6');
    // ✅ MULTI-SERVER: get channel from THIS server's config / взима канала от конфига
    const welcomeChannel = await getChannel(member.guild, 'welcome_channel');

    if (rookieRole) await member.roles.add(rookieRole).catch(() => {});
    if (!welcomeChannel) return;

    // Fetch server owner dynamically / Взимаме собственика динамично
    const owner = await member.guild.fetchOwner().catch(() => null);
    const ownerMention = owner ? `${owner}` : 'the Captain';

    // ✅ Get channels from config for clickable links / Взимаме каналите от конфига
    const { getConfig } = require('./guildConfig');
    const rulesChId = await getConfig(member.guild.id, 'rules_channel');
    const bountiesChId = await getConfig(member.guild.id, 'bounty_channel');
    const generalChId = await getConfig(member.guild.id, 'general_channel');

    const rulesLink = rulesChId ? `<#${rulesChId}>` : 'the rules channel';
    const bountiesLink = bountiesChId ? `<#${bountiesChId}>` : 'the bounties channel';
    const generalLink = generalChId ? `<#${generalChId}>` : 'general chat';

    // 🎨 GIF банер за embed-а — смени с директен .gif линк (виж инструкциите в чата)
    const WELCOME_BANNER_GIF = "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExZjBweW4zdDlzMDVnd2l0Y3k4a2Z1a2U2cmp6cDR1dmhoZGpzdnZwNSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/jVfEGOXlm2sw0iJDat/giphy.gif";

    const embed = new EmbedBuilder()
      .setTitle("⚓ New Pirate Aboard!")
      .setDescription(
        `Ahoy, pirate ${member}! 🏴‍☠️\n\n` +
        `Welcome to **${member.guild.name}**, ruled by ${ownerMention}\n\n` +
        `📜 **The Pirate Code:** Check ${rulesLink} or risk walking the plank!\n\n` +
        `💰 **Bounties:** Drop your in-game profile pic in ${bountiesLink} to claim your reward!\n\n` +
        `👋 **The Tavern:** Say hi in ${generalLink}, but first put a NickName!\n\n` +
        `📝 **Nickname:** To unlock the server, press the button below and enter your nickname.\n` +
        "```ansi\n\u001b[1;33mNote: Your name should include the guild name or tag\u001b[0m\n" +
        `\u001b[1;33m(e.g., TS ${member.user.username}, Thousand Sunny ${member.user.username}).\u001b[0m\n` +
        "```"
      )
      .setColor("#2ECC71")
      .setThumbnail(member.user.displayAvatarURL())
      .setImage(WELCOME_BANNER_GIF)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("start_verify")
        .setLabel("Nickname")
        .setStyle(ButtonStyle.Success)
    );

    const msg = await welcomeChannel.send({
      content: `${member}`,
      embeds: [embed],
      components: [row]
    });

    lastWelcomeMessage.set(member.guild.id, msg);
  } catch (err) {
    console.error("Welcome error:", err);
  }
}

/**
 * 2. ОБРАБОТКА НА БУТОНА И МОДАЛА
 */
async function handleInteraction(interaction) {
  if (!interaction.guild) return;

  const { guild, member } = interaction;

  if (interaction.isButton() && interaction.customId === "start_verify") {
    const modal = new ModalBuilder()
      .setCustomId("nick_modal")
      .setTitle("NickName");

    const input = new TextInputBuilder()
      .setCustomId("new_nickname")
      .setLabel("Put guild name or initials before name:")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Example: TS Luffy or Thousand Sunny Luffy")
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(32);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "nick_modal") {
    const newNick = interaction.fields.getTextInputValue("new_nickname");

    try {
      // ✅ МУЛТИ-СЪРВЪР: взима ролите от конфига на ТОЗИ сървър
      const playerRole = await getOrCreateConfigRole(guild, 'player_role', 'Player', '#2ecc71');
      const rookieRole = await getOrCreateConfigRole(guild, 'rookies_role', 'Rookie', '#95a5a6');

      if (playerRole && member.roles.cache.has(playerRole.id)) {
        return interaction.reply({ content: "⚠️ You already have a nickname!", flags: 64 });
      }

      await member.setNickname(newNick);
      if (rookieRole) await member.roles.remove(rookieRole).catch(() => {});
      if (playerRole) await member.roles.add(playerRole).catch(() => {});

      return interaction.reply({ content: `✅ Welcome, **${newNick}**!`, flags: 64 });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "❌ Nickname error.", flags: 64 });
    }
  }
}

/**
 * 3. ROLE COMMANDS (!addrole, !removerole, !addroleallts, !addroleallgm)
 */
async function handleRoleCommands(msg, cmd, args) {
    if (!msg.member.permissions.has("ManageRoles")) return;

    if (cmd === "!addroleallts" || cmd === "!addroleallgm") {
        msg.delete().catch(() => {});
        if (!msg.member.permissions.has("Administrator")) {
            return msg.reply("❌ Only Admins can use mass-role commands.")
                      .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }

        const tag = (cmd === "!addroleallgm") ? "ᴳᴹ☠️" : "ᐪˢ☠️";
        const role = msg.mentions.roles.first() || msg.guild.roles.cache.get(args[0]);

        if (!role) {
            return msg.channel.send(`❌ Usage: \`${cmd} @role\``)
                      .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }

        const statusMsg = await msg.channel.send(`⏳ Scanning for members with tag **${tag}**...`);
        try {
            const allMembers = await msg.guild.members.fetch();
            const targets = allMembers.filter(m => 
                m.user.username.includes(tag) || (m.nickname && m.nickname.includes(tag))
            );
            if (targets.size === 0) return statusMsg.edit(`❌ No members found with tag **${tag}**.`);

            let count = 0;
            for (const [id, member] of targets) {
                if (!member.roles.cache.has(role.id)) { await member.roles.add(role).catch(() => {}); count++; }
            }
            return statusMsg.edit(`✅ Added **${role.name}** to **${count}** members with tag **${tag}**.`);
        } catch (err) {
            console.error(err);
            return statusMsg.edit("❌ Error during mass update.");
        }
    }

    const targetUser = msg.mentions.members.first();
    const mentionedRole = msg.mentions.roles.first();
    let roleName = mentionedRole ? mentionedRole.name : args.slice(1).join(" ").trim();

    if (!targetUser || !roleName) {
        return msg.reply("❌ Usage: `!addrole @user RoleName`").then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    }

    const role = mentionedRole || msg.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) return msg.reply(`❌ Role "**${roleName}**" not found in this server!`);

    try {
        if (cmd === "!addrole") {
            await targetUser.roles.add(role);
            if (roleName.toLowerCase().includes("leader") || roleName.toLowerCase().includes("king")) {
                const promo = new EmbedBuilder()
                    .setTitle("🎖️ New Promotion!")
                    .setDescription(`Congratulations! ${targetUser} has been promoted to **${role.name}**!`)
                    .setColor("#FFD700")
                    .setThumbnail(targetUser.user.displayAvatarURL({ dynamic: true }));
                return msg.channel.send({ embeds: [promo] });
            }
            return msg.reply(`✅ **${role.name}** assigned to ${targetUser.user.username}.`);
        }
        if (cmd === "!removerole") {
            await targetUser.roles.remove(role);
            return msg.reply(`🗑️ **${role.name}** removed from ${targetUser.user.username}.`);
        }
    } catch (err) {
        console.error(err);
        return msg.reply("❌ **Hierarchy Error!** Move the bot role HIGHER than the pirate roles in Server Settings.");
    }
}

/**
 * 4. BOUNTY ROLE UPDATE
 */
async function updateBountyRole(member, amount) {
    if (!member) return null;
    try {
        const newRoleName = getBountyTierName(amount);
        const currentBountyRoles = member.roles.cache.filter(r => r.name.startsWith("Bounty: "));
        if (newRoleName && member.roles.cache.some(r => r.name === newRoleName)) return newRoleName;
        if (currentBountyRoles.size > 0) await member.roles.remove(currentBountyRoles);
        if (newRoleName) {
            const roleToGive = member.guild.roles.cache.find(r => r.name === newRoleName);
            if (roleToGive) { await member.roles.add(roleToGive); return newRoleName; }
        }
    } catch (err) { console.error("Bounty Role Update Error:", err.message); }
    return null;
}

module.exports = { handleNewMember, handleRoleCommands, updateBountyRole, handleInteraction };
