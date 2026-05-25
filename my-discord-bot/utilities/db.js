const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,                    // max connections / максимален брой връзки
  idleTimeoutMillis: 30000,   // close idle connections after 30s / затваря idle след 30с
  connectionTimeoutMillis: 5000, // timeout after 5s / timeout след 5с
});

// Auto-refresh config cache every 5 minutes / Обновява кеша на конфига на 5 мин
// This is imported and started from main.js after guildConfig is ready
// Стартира се от main.js след като guildConfig е готов

// Keepalive ping every 4 minutes to prevent Neon from closing the connection
// Ping на всеки 4 минути за да не затвори Neon връзката
setInterval(async () => {
  try { await pool.query('SELECT 1'); } catch (e) { /* silent */ }
}, 2 * 60 * 1000); // Every 2 min to prevent Neon sleep / На 2 мин за да не заспи Neon

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

    // Clean up old translation cache / Почистване на стари преводи
    const deleteResult = await pool.query("DELETE FROM translation_cache WHERE expires_at < NOW()");
    if (deleteResult.rowCount > 0) {
      console.log(`🧹 Cleaned ${deleteResult.rowCount} old translation records.`);
    }

  } catch (err) {
    console.error("❌ Database initialization error:", err.message);
  }
}

module.exports = { pool, initDB };
