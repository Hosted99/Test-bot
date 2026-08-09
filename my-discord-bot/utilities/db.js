const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,                    // max connections / максимален брой връзки
  idleTimeoutMillis: 30000,   // close idle connections after 30s / затваря idle след 30с
  connectionTimeoutMillis: 5000, // timeout after 5s / timeout след 5с
});

// ─────────────────────────────────────────────────────────────
// УМЕН (адаптивен) keepalive
// ─────────────────────────────────────────────────────────────
// Старите keepalive-и пингаха на всеки 2 мин ДЕНОНОЩНО и държаха Neon
// буден 24/7 → ~720 часа/месец. Това изяждаше безплатния лимит.
//
// Тук пингваме базата САМО ако наистина е била ползвана наскоро.
// Така:
//   • Докато хората са активни → базата стои топла → заявките са бързи.
//   • Като утихне (нощем, никой не пише) → пинговете спират → Neon заспива → 0 часа.
//
// lastActivity се обновява при ВСЯКА реална заявка (заради обвивката отдолу).
// Самият keepalive пинг ползва originalQuery, за да НЕ нулира прозореца —
// иначе веднъж събудена, базата нямаше да заспи никога.

let lastActivity = 0;
const WARM_WINDOW_MS = 4 * 60 * 1000;   // дръж топло 4 мин след последна реална заявка
const PING_EVERY_MS  = 60 * 1000;       // проверявай на всяка минута

// ─────────────────────────────────────────────────────────────
// СЛЕДЕНЕ НА "СЪБУЖДАНЕ" — какво точно е разбудило Neon
// ─────────────────────────────────────────────────────────────
// Идея: ако базата е била "студена" (по-дълго от WARM_WINDOW_MS без активност)
// и точно сега пристига нова реална заявка → тази заявка я е събудила.
// Пазим кратка история (последните 15 будения) с: кога, от какъв файл/функция,
// и каква заявка точно — за да можеш да го видиш в Discord.

const wakeupHistory = [];          // [{ time, query, source, guildId, guildName }]
const MAX_WAKEUP_HISTORY = 15;

// Discord client се подава отвън (от main.js), за да превеждаме guild_id → име на сървъра
// без circular require между db.js и main.js.
let discordClient = null;
function setDiscordClient(client) {
  discordClient = client;
}

function getCallerInfo() {
  // Взимаме stack trace и търсим първия ред извън db.js, за да разберем
  // кой файл/функция реално е извикал заявката.
  const stack = new Error().stack || "";
  const lines = stack.split("\n").slice(1); // ред 0 е "Error"
  for (const line of lines) {
    if (line.includes("db.js")) continue; // прескачаме самата обвивка
    const match = line.match(/\(([^)]+)\)/) || line.match(/at (.+)/);
    if (match) return match[1].replace(process.cwd(), "").trim();
  }
  return "unknown source";
}

// Discord guild ID-та са числови низове с 17-19 цифри. Търсим такъв сред
// параметрите на заявката, за да познаем кой сървър я е причинил.
// Допълнително: ако заявка е към guild_config, вторият (нечислов) параметър
// обикновено е "key" — настройката, която е питана (напр. log_channel, ai_enabled).
function extractGuildInfo(queryParams) {
  if (!Array.isArray(queryParams)) return { guildId: null, guildName: null, key: null };
  let guildId = null;
  let guildName = null;
  let key = null;
  for (const param of queryParams) {
    if (typeof param === "string" && /^\d{17,19}$/.test(param)) {
      if (!guildId) {
        guildId = param;
        if (discordClient) {
          const guild = discordClient.guilds.cache.get(param);
          if (guild) guildName = guild.name;
        }
      }
    } else if (typeof param === "string" && !key) {
      key = param; // вероятен "key" параметър (нечислов низ)
    }
  }
  return { guildId, guildName, key };
}

const originalQuery = pool.query.bind(pool);
pool.query = (...args) => {
  const now = Date.now();
  const wasAsleep = now - lastActivity > WARM_WINDOW_MS + 30 * 1000; // +30с буфер за безопасност

  if (wasAsleep) {
    const queryText = typeof args[0] === "string" ? args[0].slice(0, 200) : "[non-string query]";
    const callerInfo = getCallerInfo();
    const { guildId, guildName, key } = extractGuildInfo(args[1]);
    const guildLabel = guildName ? `${guildName} (${guildId})` : (guildId || "неизвестен сървър");
    const keyLabel = key ? ` | Ключ: ${key}` : "";

    // Автоматичен лог в Railway — появява се сам, без нужда от команда
    console.log(`⚡ [NEON WAKE-UP] ${new Date(now).toLocaleString('bg-BG', { timeZone: 'Europe/Sofia' })} | Сървър: ${guildLabel}${keyLabel} | Източник: ${callerInfo} | Заявка: ${queryText}`);

    wakeupHistory.unshift({
      time: now,
      query: queryText,
      source: callerInfo,
      guildId,
      guildName,
      key,
    });
    if (wakeupHistory.length > MAX_WAKEUP_HISTORY) wakeupHistory.pop();
  }

  lastActivity = now;
  return originalQuery(...args);
};

// Връща последното събуждане (или null, ако няма история все още)
function getLastWakeup() {
  return wakeupHistory[0] || null;
}

// Връща цялата история на буденията (най-новото first)
function getWakeupHistory() {
  return wakeupHistory;
}

setInterval(() => {
  if (Date.now() - lastActivity < WARM_WINDOW_MS) {
    originalQuery("SELECT 1").catch(() => { /* silent */ });
  }
}, PING_EVERY_MS);

async function initDB() {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Connected to Neon/Postgres!");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id BIGINT PRIMARY KEY,
        cron VARCHAR(100),
        message TEXT,
        channel_id VARCHAR(50),
        owner_id VARCHAR(50)
      );
    `);

    // ✅ PER-GUILD: bounty is separate per server / bounty е отделно за всеки сървър
    // CREATE for new installs, ALTER for existing databases / CREATE за нови, ALTER за съществуващи
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id VARCHAR(50) PRIMARY KEY,
        bounty BIGINT DEFAULT 0,
        username TEXT
      );
    `);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS guild_id VARCHAR(50) DEFAULT 'global';`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS guild_name TEXT DEFAULT 'unknown';`);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'users' AND constraint_name = 'users_guild_user_pkey'
        ) THEN
          ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;
          ALTER TABLE users ADD CONSTRAINT users_guild_user_pkey PRIMARY KEY (guild_id, user_id);
        END IF;
      END $$;
    `).catch(() => {});
    console.log("✅ Table users (per-guild) is ready.");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS translation_cache (
        user_id VARCHAR(50) PRIMARY KEY,
        last_lang TEXT,
        expires_at TIMESTAMP,
        guild_id VARCHAR(50) DEFAULT 'global',
        guild_name TEXT DEFAULT 'unknown'
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS global_vars (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    await pool.query(`ALTER TABLE translation_cache ADD COLUMN IF NOT EXISTS guild_id VARCHAR(50) DEFAULT 'global';`);
    await pool.query(`ALTER TABLE translation_cache ADD COLUMN IF NOT EXISTS guild_name TEXT DEFAULT 'unknown';`);
    console.log("✅ Table global_vars is ready.");

    // ✅ PER-GUILD: XP and levels are separate per server / XP и нива са отделни
    // CREATE for new installs, ALTER for existing databases / CREATE за нови, ALTER за съществуващи
    await pool.query(`
      CREATE TABLE IF NOT EXISTS levels (
        user_id VARCHAR(50) PRIMARY KEY,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        username TEXT
      );
    `);
    await pool.query(`ALTER TABLE levels ADD COLUMN IF NOT EXISTS guild_id VARCHAR(50) DEFAULT 'global';`);
    await pool.query(`ALTER TABLE levels ADD COLUMN IF NOT EXISTS guild_name TEXT DEFAULT 'unknown';`);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'levels' AND constraint_name = 'levels_guild_user_pkey'
        ) THEN
          ALTER TABLE levels DROP CONSTRAINT IF EXISTS levels_pkey;
          ALTER TABLE levels ADD CONSTRAINT levels_guild_user_pkey PRIMARY KEY (guild_id, user_id);
        END IF;
      END $$;
    `).catch(() => {});
    console.log("✅ Table levels (per-guild) is ready.");

    // ✅ PER-GUILD: permanent crew / постоянен екипаж
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permanent_crew (
        guild_id VARCHAR(50),
        guild_name TEXT DEFAULT 'unknown',
        user_id VARCHAR(50),
        username TEXT,
        ship_key TEXT,
        ship_name TEXT DEFAULT 'unknown',
        PRIMARY KEY (guild_id, user_id)
      );
    `);
    await pool.query(`ALTER TABLE permanent_crew ADD COLUMN IF NOT EXISTS guild_name TEXT DEFAULT 'unknown';`);
    await pool.query(`ALTER TABLE permanent_crew ADD COLUMN IF NOT EXISTS ship_name TEXT DEFAULT 'unknown';`);
    console.log("✅ Table permanent_crew is ready.");

    // ✅ PER-GUILD: ships / кораби
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ships (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(50),
        guild_name TEXT DEFAULT 'unknown',
        ship_key VARCHAR(50),
        ship_name TEXT,
        emoji TEXT,
        role_id VARCHAR(50),
        position INTEGER DEFAULT 0
      );
    `);
    await pool.query(`ALTER TABLE ships ADD COLUMN IF NOT EXISTS guild_name TEXT DEFAULT 'unknown';`);
    console.log("✅ Table ships is ready.");

    // ✅ PER-GUILD: captains / капитани
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ship_captains (
        guild_id VARCHAR(50),
        guild_name TEXT DEFAULT 'unknown',
        user_id VARCHAR(50),
        username TEXT DEFAULT 'unknown',
        ship_key TEXT,
        ship_name TEXT DEFAULT 'unknown',
        PRIMARY KEY (guild_id, user_id)
      );
    `);
    await pool.query(`ALTER TABLE ship_captains ADD COLUMN IF NOT EXISTS guild_name TEXT DEFAULT 'unknown';`);
    await pool.query(`ALTER TABLE ship_captains ADD COLUMN IF NOT EXISTS username TEXT DEFAULT 'unknown';`);
    await pool.query(`ALTER TABLE ship_captains ADD COLUMN IF NOT EXISTS ship_name TEXT DEFAULT 'unknown';`);
    console.log("✅ Table ship_captains is ready.");

    // ✅ PER-GUILD: configuration / конфигурация
    await pool.query(`
      CREATE TABLE IF NOT EXISTS guild_config (
        guild_id VARCHAR(50),
        guild_name TEXT DEFAULT 'unknown',
        key TEXT,
        value TEXT,
        PRIMARY KEY (guild_id, key)
      );
    `);
    await pool.query(`ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS guild_name TEXT DEFAULT 'unknown';`);
    console.log("✅ Table guild_config is ready.");

    // ✅ PER-GUILD: repair messages / repair съобщения
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repair_messages (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(50),
        guild_name TEXT DEFAULT 'unknown',
        ship_key TEXT,
        message TEXT
      );
    `);
    await pool.query(`ALTER TABLE repair_messages ADD COLUMN IF NOT EXISTS guild_name TEXT DEFAULT 'unknown';`);
    console.log("✅ Table repair_messages is ready.");

    // ✅ Blacklist за Belly Rush / Blacklist for Belly Rush
    // Пази се по ИМЕ (текст), не по Discord ID — хората в списъка не са задължително членове на сървъра
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blacklist (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(50),
        name TEXT,
        reason TEXT DEFAULT 'No reason provided',
        added_by VARCHAR(50),
        added_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(guild_id, name)
      );
    `);
    console.log("✅ Table blacklist is ready.");

    // ✅ Проследяване на нови членове без nickname, за 10ч. напомняне
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pending_verification (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(50),
        user_id VARCHAR(50),
        channel_id VARCHAR(50),
        message_id VARCHAR(50),
        joined_at TIMESTAMP DEFAULT NOW(),
        reminder_sent BOOLEAN DEFAULT false,
        UNIQUE(guild_id, user_id)
      );
    `);
    await pool.query(`ALTER TABLE pending_verification ADD COLUMN IF NOT EXISTS channel_id VARCHAR(50);`);
    await pool.query(`ALTER TABLE pending_verification ADD COLUMN IF NOT EXISTS message_id VARCHAR(50);`);
    await pool.query(`ALTER TABLE pending_verification ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMP;`);
    console.log("✅ Table pending_verification is ready.");

    // Clean up old translation cache / Почистване на стари преводи
    const deleteResult = await pool.query("DELETE FROM translation_cache WHERE expires_at < NOW()");
    if (deleteResult.rowCount > 0) {
      console.log(`🧹 Cleaned ${deleteResult.rowCount} old translation records.`);
    }

  } catch (err) {
    console.error("❌ Database initialization error:", err.message);
  }
}

module.exports = { pool, initDB, getLastWakeup, getWakeupHistory, setDiscordClient };
