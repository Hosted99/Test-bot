/**
 * bountyEmbed.js — Shared "Bounty Update" embed builder
 * ============================================================================
 * Used by BOTH bounty paths so the design never drifts apart between them:
 *   - Manual: !setbounty (in commandHandler.js)
 *   - Automatic: AI screenshot read (in bountyImage.js)
 *
 * Shows the before → after change and picks a punchier title/color depending
 * on whether the bounty went up, down, or is brand new.
 * ============================================================================
 */

const { EmbedBuilder } = require('discord.js');

function formatBounty(n) {
    return `฿ **${Number(n).toLocaleString()}**`;
}

/**
 * @param {Object} opts
 * @param {import('discord.js').User} opts.user - the pirate whose bounty changed
 * @param {number} opts.amount - new bounty amount
 * @param {number} opts.previousBounty - bounty before this update (0 if none)
 * @param {string|null} opts.assignedRank - role name returned by updateBountyRole(), or null
 * @param {'manual'|'ai'} opts.source - who triggered this update
 * @param {string} [opts.setByUsername] - only used when source === 'manual'
 */
function buildBountyUpdateEmbed({ user, amount, previousBounty, assignedRank, source, setByUsername }) {
    const delta = amount - previousBounty;
    const isFirstBounty = previousBounty <= 0;

    let title;
    let color;
    let deltaLine;

    if (isFirstBounty) {
        title = '☠️ NEW PIRATE MARKED ☠️';
        color = '#f1c40f'; // gold
        deltaLine = '🆕 First bounty on record!';
    } else if (delta > 0) {
        title = '🚨 BOUNTY SKYROCKETS 🚨';
        color = '#e74c3c'; // alert red
        deltaLine = `📈 **+${formatBounty(delta)}**`;
    } else if (delta < 0) {
        title = '⚠️ BOUNTY SLASHED ⚠️';
        color = '#3498db'; // cool blue, less alarming
        deltaLine = `📉 **-${formatBounty(Math.abs(delta))}**`;
    } else {
        title = '🎖️ BOUNTY REAFFIRMED 🎖️';
        color = '#95a5a6'; // neutral grey
        deltaLine = '➡️ No change';
    }

    const sourceLine = source === 'ai'
        ? '📸 Auto-detected from a screenshot by AI'
        : `🖋️ Set manually by **${setByUsername}**`;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(`🎊 **${user.username}** has a new bounty!\n${sourceLine}`)
        .addFields(
            { name: '💰 Previous Bounty', value: isFirstBounty ? '฿ *(none)*' : formatBounty(previousBounty), inline: true },
            { name: '💰 New Bounty', value: formatBounty(amount), inline: true },
            { name: '📊 Change', value: deltaLine, inline: true },
            { name: '📈 New Role', value: `🚀 **${assignedRank || 'Updated'}**`, inline: false }
        )
        .setImage(user.displayAvatarURL({ extension: 'png', dynamic: true, size: 512 }))
        .setColor(color)
        .setFooter({ text: 'The World Government is watching...' })
        .setTimestamp();

    return embed;
}

module.exports = { buildBountyUpdateEmbed };
