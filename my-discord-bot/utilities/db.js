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

    // ✅ PER-GUILD: bounty е отделно за всеки сървър
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        guild_id VARCHAR(50),
        user_id VARCHAR(50),
        bounty BIGINT DEFAULT 0,
        username TEXT,
        PRIMARY KEY (guild_id, user_id)
      );
    `);
    console.log("✅ Table users (per-guild) is ready.");

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

    // ✅ PER-GUILD: XP и нива са отделни за всеки сървър
    await pool.query(`
      CREATE TABLE IF NOT EXISTS levels (
        guild_id VARCHAR(50),
        user_id VARCHAR(50),
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        username TEXT,
        PRIMARY KEY (guild_id, user_id)
      );
    `);
    console.log("✅ Table levels (per-guild) is ready.");

    // ✅ PER-GUILD: постоянен екипаж
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

    // ✅ PER-GUILD: кораби
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

    // ✅ PER-GUILD: капитани
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ship_captains (
        guild_id VARCHAR(50),
        user_id VARCHAR(50),
        ship_key TEXT,
        PRIMARY KEY (guild_id, user_id)
      );
    `);
    console.log("✅ Table ship_captains is ready.");

    // ✅ PER-GUILD: конфигурация
    await pool.query(`
      CREATE TABLE IF NOT EXISTS guild_config (
        guild_id VARCHAR(50),
        key TEXT,
        value TEXT,
        PRIMARY KEY (guild_id, key)
      );
    `);
    console.log("✅ Table guild_config is ready.");

    // ✅ PER-GUILD: repair съобщения
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repair_messages (
        id SERIAL PRIMARY KEY,
        guild_id VARCHAR(50),
        ship_key TEXT,
        message TEXT
      );
    `);
    console.log("✅ Table repair_messages is ready.");

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
