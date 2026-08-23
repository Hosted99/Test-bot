/**
 * bountyEmbed.js — Shared "Bounty Update" embed builder
 * ============================================================================
 * Used by BOTH bounty paths so the design never drifts apart between them:
 *   - Manual: !setbounty (in commandHandler.js)
 *   - Automatic: AI screenshot read (in bountyImage.js)
 *
 * Shows the before → after change and picks a punchier title/color depending
 * on whether the bounty went up, down, or is brand new. Titles (and the
 * celebratory intro line) are picked randomly from a few variants per case,
 * so it doesn't say the exact same thing every single time.
 * ============================================================================
 */

const { EmbedBuilder } = require('discord.js');

function formatBounty(n) {
    return `฿ **${Number(n).toLocaleString()}**`;
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Няколко варианта на заглавие + intro фраза за всеки случай — random избор,
// за да не звучи еднакво всеки път. Добави нови стрингове тук по всяко време.
const VARIANTS = {
    firstBounty: {
        titles: ['☠️ NEW PIRATE MARKED ☠️', '🏴‍☠️ A NEW BOUNTY RISES 🏴‍☠️', '📜 FIRST WANTED POSTER 📜', '⚓ WELCOME TO THE SEAS ⚓'],
        intros: ['has just been marked by the World Government!', 'is now officially a wanted pirate!', 'just got their first bounty!']
    },
    increase: {
        titles: ['🚨 BOUNTY SKYROCKETS 🚨', '📈 THE WORLD GOVERNMENT PANICS 📈', '🔥 MORE WANTED THAN EVER 🔥', '⚡ THREAT LEVEL INCREASED ⚡', '💰 BOUNTY ON THE RISE 💰'],
        intros: ['has a new bounty!', 'just became more dangerous!', 'is climbing the ranks!']
    },
    decrease: {
        titles: ['⚠️ BOUNTY SLASHED ⚠️', '📉 BOUNTY TAKES A HIT 📉', '🧊 THREAT LEVEL COOLING 🧊', '✂️ REWARD TRIMMED ✂️'],
        intros: ['has a new bounty...', 'took a step back.', 'is losing the Marines\' attention.']
    },
    noChange: {
        titles: ['🎖️ BOUNTY REAFFIRMED 🎖️', '📋 STATUS CONFIRMED 📋', '🔁 NO CHANGE DETECTED 🔁', '🗂️ RECORD UPDATED 🗂️'],
        intros: ['has the same bounty as before.', 'remains at the same threat level.']
    }
};

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

    let variantKey;
    let color;
    let deltaLine;

    if (isFirstBounty) {
        variantKey = 'firstBounty';
        color = '#f1c40f'; // gold
        deltaLine = '🆕 First bounty on record!';
    } else if (delta > 0) {
        variantKey = 'increase';
        color = '#e74c3c'; // alert red
        deltaLine = `📈 +${formatBounty(delta)}`; // formatBounty вече слага **bold** — не увиваме пак
    } else if (delta < 0) {
        variantKey = 'decrease';
        color = '#3498db'; // cool blue, less alarming
        deltaLine = `📉 -${formatBounty(Math.abs(delta))}`;
    } else {
        variantKey = 'noChange';
        color = '#95a5a6'; // neutral grey
        deltaLine = '➡️ No change';
    }

    const { titles, intros } = VARIANTS[variantKey];
    const title = pick(titles);
    const intro = pick(intros);

    const sourceLine = source === 'ai'
        ? '📸 Auto-detected from a screenshot by AI'
        : `🖋️ Set manually by **${setByUsername}**`;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(`🎊 **${user.username}** ${intro}\n${sourceLine}`)
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
