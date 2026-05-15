const {EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle,PermissionsBitField} = require("discord.js");
const { getConfig, getRole, getChannel } = require('./guildConfig');

// ✅ МУЛТИ-СЪРВЪР: няма ALLOWED_GUILDS — ботът работи за ВСЕКИ сървър
// Ролите се конфигурират с !setconfig rookies_role <id> и !setconfig player_role <id>

const lastWelcomeMessage = new Map();

const bountyTiers = [];
for (let i = 900; i >= 50; i -= 50) {
  bountyTiers.push({ min: i * 1000000, name: `Bounty: ${i}M+` });
}

/**
 * 1. ПОСРЕЩАНЕ И ВЕРИФИКАЦИЯ
 */
async function handleNewMember(member) {
  try {
    // ✅ МУЛТИ-СЪРВЪР: взима ролята от конфига на ТОЗИ сървър
    const rookieRole = await getRole(member.guild, 'rookies_role');
    // ✅ МУЛТИ-СЪРВЪР: взима канала от конфига на ТОЗИ сървър
    const welcomeChannel = await getChannel(member.guild, 'welcome_channel');

    if (rookieRole) await member.roles.add(rookieRole).catch(() => {});
    if (!welcomeChannel) return;

    const embed = new EmbedBuilder()
      .setTitle("⚓ New Pirate Aboard!")
      .setDescription(
        `Ahoy, pirate ${member}! 🏴‍☠️\n\n` +
        `Welcome to **${member.guild.name}**!\n\n` +
        `📝 **Nickname:** To unlock the server, press the button below and enter your nickname.\n` +
        `*Note: Your name should include the guild name or tag.*`
      )
      .setColor("#2ECC71")
      .setThumbnail(member.user.displayAvatarURL())
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
      const playerRole = await getRole(guild, 'player_role');
      const rookieRole = await getRole(guild, 'rookies_role');

      if (playerRole && member.roles.cache.has(playerRole.id)) {
        return interaction.reply({ content: "⚠️ You already have a nickname!", ephemeral: true });
      }

      await member.setNickname(newNick);
      if (rookieRole) await member.roles.remove(rookieRole).catch(() => {});
      if (playerRole) await member.roles.add(playerRole).catch(() => {});

      return interaction.reply({ content: `✅ Welcome, **${newNick}**!`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: "❌ Nickname error.", ephemeral: true });
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
            return msg.reply("❌ Only Admirals can use mass-role commands.")
                      .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }

        const tag = (cmd === "!addroleallgm") ? "ᴳᴹ☠️" : "ᐪˢ☠️";
        const role = msg.mentions.roles.first() || msg.guild.roles.cache.get(args[0]);

        if (!role) {
            return msg.channel.send(`❌ Usage: \`${cmd} @role\``)
                      .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }

        const statusMsg = await msg.channel.send(`⏳ Scanning for pirates with tag **${tag}**...`);
        try {
            const allMembers = await msg.guild.members.fetch();
            const targets = allMembers.filter(m => 
                m.user.username.includes(tag) || (m.nickname && m.nickname.includes(tag))
            );
            if (targets.size === 0) return statusMsg.edit(`❌ No users found with tag **${tag}**.`);

            let count = 0;
            for (const [id, member] of targets) {
                if (!member.roles.cache.has(role.id)) { await member.roles.add(role).catch(() => {}); count++; }
            }
            return statusMsg.edit(`✅ Added **${role.name}** to **${count}** members with the **${tag}** tag.`);
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
                    .setDescription(`Everyone salute! ${targetUser} has been promoted to **${role.name}**!`)
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
        return msg.reply("❌ **Hierarchy Error!** Move my bot role HIGHER than the pirate roles in Server Settings.");
    }
}

/**
 * 4. BOUNTY ROLE UPDATE
 */
async function updateBountyRole(member, amount) {
    if (!member) return null;
    try {
        const tier = bountyTiers.find(t => amount >= t.min);
        const newRoleName = tier ? tier.name : null;
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
