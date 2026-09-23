// utilities/gameUpdate.js
// Следи version_config.json на играта и праща съобщение в канала game_update_channel.
// Не използва базата (Neon) - състоянието е само в паметта.

const ROOT = 'http://jbhzgmcdn.lxld668.com';
const CFG = '/res/dachen/dachen_android/config/version_config.json';
const WATCH = ['forceRes', 'backRes', 'app', 'notice'];
const INTERVAL = 10 * 60 * 1000;
const FAIL_WARN_AT = 6; // ~1 час без отговор

let last = null;       // последният version_config
let files = null;      // { име_на_файл: md5 }
let lastMaint = null;  // последният текст на обявата за поддръжка
let failures = 0;
let warned = false;

const fill = (tpl, ver) =>
    tpl.replace('{0}', 'dachen').replace('{1}', 'dachen_android').replace('{2}', ver);

const getJson = async (path) => {
    const r = await fetch(`${ROOT}${path}?${Date.now()}`);
    if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
    return r.json();
};

// role_luojie_battle.9 -> luojie
const heroOf = (n) =>
    (n.match(/^@?role_([a-z0-9_]+?)_(?:hx_)?(?:battle|ui|skin|boss)/) || [])[1];

// най-новата "维护" обява от всички групи сървъри (по датата в текста)
function latestMaintenance(data) {
    const found = [];
    for (const server of Object.values(data))
        for (const lang of Object.values(server))
            for (const group of lang)
                for (const n of group.notices || [])
                    if (n.title.includes('维护')) found.push(n.content);

    const date = (t) => {
        const m = t.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        return m ? new Date(m[1], m[2] - 1, m[3]).getTime() : 0;
    };
    return found.sort((a, b) => date(b) - date(a))[0] || null;
}

// сваля списъците с файлове (само имена и md5, не самите файлове)
async function loadList(cfg) {
    const out = {};
    for (const [key, tpl] of [['forceRes', cfg.forceResUrl], ['backRes', cfg.backResUrl]]) {
        if (!cfg[key] || cfg[key] === '0') continue;
        const data = await getJson(fill(tpl, cfg[key]));
        for (const f of data.files) out[f.res] = f.md5;
    }
    return out;
}

// праща съобщение в конфигурирания канал (game_update_channel) на всеки сървър
async function send(client, getChannel, text) {
    let sent = 0;
    for (const guild of client.guilds.cache.values()) {
        const channel = await getChannel(guild, 'game_update_channel').catch(() => null);
        if (!channel) continue;
        await channel.send(text.slice(0, 1990))
            .then(() => sent++)
            .catch((e) => console.error(`gameUpdate send (${guild.name}):`, e.message));
    }
    if (!sent) console.log('ℹ️ gameUpdate: няма конфигуриран game_update_channel, съобщението не е изпратено.');
    return sent;
}

async function check(client, getChannel) {
    try {
        const cfg = await getJson(CFG);
        failures = 0;
        warned = false;

        // първо пускане: тихо запомняме текущото състояние
        if (!last) {
            last = cfg;
            files = await loadList(cfg);
            try { lastMaint = latestMaintenance(await getJson(fill(cfg.noticeUrl, ''))); } catch {}
            console.log('🎮 Game update watcher: baseline saved.');
            return;
        }

        let changes = WATCH.filter((k) => String(cfg[k]) !== String(last[k]));
        if (!changes.length) return;

        const parts = [];

        // 1) обява за поддръжка (само ако е нова)
        if (changes.includes('notice')) {
            const text = latestMaintenance(await getJson(fill(cfg.noticeUrl, '')));
            if (text && text !== lastMaint) {
                lastMaint = text;
                parts.push('📢 **Обява за поддръжка:**\n' + text.slice(0, 1500));
            } else {
                changes = changes.filter((k) => k !== 'notice'); // друга обява, не ни интересува
            }
        }

        // 2) нови файлове
        if (changes.includes('forceRes') || changes.includes('backRes')) {
            const fresh = await loadList(cfg);
            const changed = Object.keys(fresh).filter((n) => files[n] !== fresh[n]);
            const oldHeroes = new Set(Object.keys(files).map(heroOf).filter(Boolean));
            const heroes = [...new Set(changed.map(heroOf).filter(Boolean))];
            const newHeroes = heroes.filter((h) => !oldHeroes.has(h));
            const updated = heroes.filter((h) => !newHeroes.includes(h));

            let s = `📦 **Файлове:** ${changed.length} нови/променени`;
            if (newHeroes.length) s += `\n🆕 Нов герой: ${newHeroes.join(', ')}`;
            if (updated.length) s += `\n♻️ Обновени герои: ${updated.join(', ')}`;
            s += '\n```\n' + changed.slice(0, 12).join('\n') + '\n```';
            parts.push(s);
            files = fresh;
        }

        last = cfg;
        if (!changes.length) return;

        await send(client, getChannel, `🔔 **Излезе ъпдейт!** (${changes.join(', ')})`);
        for (const p of parts) await send(client, getChannel, p);
    } catch (e) {
        failures++;
        console.error('gameUpdate:', e.message);
        if (failures >= FAIL_WARN_AT && !warned) {
            warned = true;
            try {
                await send(client, getChannel, '⚠️ Не мога да прочета данните на играта от около час. Домейнът може да е сменен.');
            } catch {}
        }
    }
}

module.exports = function startGameUpdateWatcher(client, getChannel) {
    check(client, getChannel);
    setInterval(() => check(client, getChannel), INTERVAL);
};
