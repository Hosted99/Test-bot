// utilities/gameUpdate.js
// Следи version_config.json на играта и праща съобщение в канала game_update_channel.
// Не използва базата (Neon) - състоянието е само в паметта.

const ROOT = 'http://jbhzgmcdn.lxld668.com';
const CFG = '/res/dachen/dachen_android/config/version_config.json';
const WATCH = ['forceRes', 'backRes', 'app', 'notice'];
const INTERVAL = 10 * 60 * 1000;
const FAIL_WARN_AT = 6; // ~1 час без отговор

let last = null;       // последният version_config
let files = null;      // { име_на_файл: { md5, size, ver } }
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

// сваля списъците с файлове (само имена, md5, размер и версия - не самите файлове)
async function loadList(cfg) {
    const out = {};
    for (const [key, tpl] of [['forceRes', cfg.forceResUrl], ['backRes', cfg.backResUrl]]) {
        if (!cfg[key] || cfg[key] === '0') continue;
        const data = await getJson(fill(tpl, cfg[key]));
        for (const f of data.files) out[f.res] = { md5: f.md5, size: f.size, ver: f.ver };
    }
    return out;
}

// ───────── Групиране на промените ─────────
// Редът има значение: първата съвпаднала категория печели.
const CATS = [
    ['⚙️ Системни', (n) => /^(ds_pkg_|_dep\.)/i.test(n)],
    ['📊 Таблици', (n) => /^t_.+\.bbytes$/i.test(n)],
    ['🔊 Звуци', (n) => /^(music_sound_|sound_|voc_)/i.test(n)],
    ['✨ Ефекти', (n) => /^(eff_|buff_|effect_)/i.test(n)],
    ['🖼️ UI и сцени', (n) => /^(ui_|lvl_|hd_|logo_|zhujiemian)|(_fui|_atlas\d*(_\d+)?)\.9$/i.test(n)],
];
const OTHER = '📁 Други';
// Ред на показване: важното първо, системният шум накрая
const DISPLAY = ['📊 Таблици', '✨ Ефекти', '🔊 Звуци', '🖼️ UI и сцени', OTHER, '⚙️ Системни'];

const kb = (b) => (b / 1024).toFixed(b >= 1048576 ? 0 : 1);
const mb = (b) => (b / 1048576).toFixed(1);
const tableName = (n) => n.replace(/^t_/, '').replace(/Bean\.bbytes$/, '');

// файл -> герой (ако името съдържа пинйин името на герой, намерен от role_* файловете)
function makeHeroMatcher(changed) {
    const heroes = [...new Set(changed.map((f) => heroOf(f.res)).filter((h) => h && h.length >= 3))]
        .sort((a, b) => b.length - a.length);
    return {
        heroes,
        of(name) {
            const lname = name.toLowerCase();
            const tokens = lname.replace(/\.[^.]*$/, '').split(/[^a-z0-9]+/).filter(Boolean);
            return heroes.find((h) =>
                h.includes('_') ? lname.includes(h) : tokens.some((t) => t === h || t.endsWith(h)));
        },
    };
}

// -> { summary (за съобщението), listing (за .txt файла) }
function buildReport(changed, oldHeroes, versionLabel) {
    const matcher = makeHeroMatcher(changed);
    const byHero = new Map();
    const byCat = new Map();

    for (const f of changed) {
        const hero = matcher.of(f.res);
        if (hero) {
            if (!byHero.has(hero)) byHero.set(hero, []);
            byHero.get(hero).push(f);
            continue;
        }
        const cat = (CATS.find(([, test]) => test(f.res)) || [OTHER])[0];
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat).push(f);
    }

    const total = changed.reduce((s, f) => s + f.size, 0);
    const size = (arr) => arr.reduce((s, f) => s + f.size, 0);
    const newHeroes = [...byHero.keys()].filter((h) => !oldHeroes.has(h));
    const updated = [...byHero.keys()].filter((h) => oldHeroes.has(h));

    // ── съобщение ──
    const lines = [`📦 **Файлове:** ${changed.length} (${mb(total)} MB)`];
    if (newHeroes.length)
        lines.push(`🆕 **Нов герой:** ${newHeroes.map((h) => `${h} (${byHero.get(h).length} файла)`).join(', ')}`);
    if (updated.length)
        lines.push(`♻️ **Обновени герои:** ${updated.map((h) => `${h} (${byHero.get(h).length})`).join(', ')}`);
    for (const cat of DISPLAY.filter((c) => byCat.has(c))) {
        const arr = byCat.get(cat);
        let l = `${cat} (${arr.length})`;
        if (cat === '📊 Таблици') {
            const names = arr.map((f) => tableName(f.res));
            l += ': ' + names.slice(0, 12).join(', ') + (names.length > 12 ? ` и още ${names.length - 12}` : '');
        }
        lines.push(l);
    }
    lines.push('📎 Пълният списък е в прикачения файл.');

    // ── .txt файл ──
    const out = [`Ъпдейт: ${versionLabel}`, `Файлове: ${changed.length} (${mb(total)} MB)`, ''];
    const section = (title, arr) => {
        out.push(`=== ${title} (${arr.length}, ${mb(size(arr))} MB) ===`);
        for (const f of arr.sort((a, b) => a.res.localeCompare(b.res)))
            out.push(`${f.res}\t${kb(f.size)} KB\tv${f.ver}`);
        out.push('');
    };
    for (const h of [...newHeroes, ...updated]) section(`${newHeroes.includes(h) ? '🆕' : '♻️'} ${h}`, byHero.get(h));
    for (const cat of DISPLAY.filter((c) => byCat.has(c))) section(cat, byCat.get(cat));

    return { summary: lines.join('\n'), listing: out.join('\n') };
}

// праща съобщение (низ или { content, files }) в game_update_channel на всеки сървър
async function send(client, getChannel, payload) {
    const body = typeof payload === 'string' ? { content: payload } : payload;
    const opts = { ...body, content: (body.content || '').slice(0, 1990) };
    let sent = 0;
    for (const guild of client.guilds.cache.values()) {
        const channel = await getChannel(guild, 'game_update_channel').catch(() => null);
        if (!channel) continue;
        try {
            await channel.send(opts);
            sent++;
        } catch (e) {
            console.error(`gameUpdate send (${guild.name}):`, e.message);
            if (opts.files) { // може да няма право да прикачва файлове - пробваме само с текст
                await channel.send({ content: opts.content })
                    .then(() => sent++)
                    .catch((e2) => console.error(`gameUpdate send retry (${guild.name}):`, e2.message));
            }
        }
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

            // ТЕСТОВ РЕЖИМ (GAMEUPDATE_TEST=1): преструва се, че има ъпдейт
            if (process.env.GAMEUPDATE_TEST) {
                last = { ...cfg, forceRes: '0', notice: '0' };
                lastMaint = null;
                for (const k of Object.keys(files).slice(0, 3)) delete files[k];
                console.log('🧪 Game update watcher: TEST mode, fake update in 10s.');
                setTimeout(() => check(client, getChannel), 10 * 1000);
            }
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
            const changed = Object.keys(fresh)
                .filter((n) => !files[n] || files[n].md5 !== fresh[n].md5)
                .map((n) => ({ res: n, ...fresh[n] }));

            if (changed.length) {
                const oldHeroes = new Set(Object.keys(files).map(heroOf).filter(Boolean));
                const label = `forceRes ${last.forceRes} → ${cfg.forceRes}` +
                    (cfg.backRes !== last.backRes ? `, backRes ${last.backRes} → ${cfg.backRes}` : '');
                const report = buildReport(changed, oldHeroes, label);
                parts.push({
                    content: report.summary,
                    files: [{ attachment: Buffer.from(report.listing, 'utf8'), name: `update-${cfg.forceRes}.txt` }],
                });
            }
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
module.exports.buildReport = buildReport; // за тестове
