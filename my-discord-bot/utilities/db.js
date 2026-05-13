const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id VARCHAR(50) PRIMARY KEY,
        bounty BIGINT DEFAULT 0,
        username TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS translation_cache (
        user_id VARCHAR(50) PRIMARY KEY,
        last_lang TEXT,
        expires_at TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS global_vars (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    console.log("✅ Table global_vars is ready.");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS levels (
        user_id VARCHAR(50) PRIMARY KEY,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        username TEXT
      );
    `);
    console.log("✅ Table levels is ready.");

    // ✅ НОВА: постоянен екипаж per-guild
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permanent_crew (
        guild_id VARCHAR(50),
        user_id VARCHAR(50),
        username TEXT,
        ship_key TEXT,
        PRIMARY KEY (guild_id, user_id)
      );
    `);
    console.log("✅ Table permanent_crew is ready.");

    // ✅ НОВА: кораби per-guild (динамични)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ships (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(50),
        ship_key VARCHAR(50),
        ship_name TEXT,
        emoji TEXT,
        role_id VARCHAR(50),
        position INTEGER DEFAULT 0
      );
    `);
    console.log("✅ Table ships is ready.");

    // ✅ НОВА: капитани per-guild
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ship_captains (
        guild_id VARCHAR(50),
        user_id VARCHAR(50),
        ship_key TEXT,
        PRIMARY KEY (guild_id, user_id)
      );
    `);
    console.log("✅ Table ship_captains is ready.");

    // ✅ НОВА: конфиг per-guild
    await pool.query(`
      CREATE TABLE IF NOT EXISTS guild_config (
        guild_id VARCHAR(50),
        key TEXT,
        value TEXT,
        PRIMARY KEY (guild_id, key)
      );
    `);
    console.log("✅ Table guild_config is ready.");

    // Почистване на стари преводи
    const deleteResult = await pool.query("DELETE FROM translation_cache WHERE expires_at < NOW()");
    if (deleteResult.rowCount > 0) {
      console.log(`🧹 Cleaned ${deleteResult.rowCount} old translation records.`);
    }

  } catch (err) {
    console.error("❌ Database initialization error:", err.message);
  }
}

module.exports = { pool, initDB };
