/**
 * guildConfig.js — Мулти-сървър конфигурация
 *
 * Всеки сървър си пази настройките в базата данни.
 * Администраторите ги задават с командата !setconfig <ключ> <стойност>
 *
 * Примери за ключове:
 *   level_up_channel    — канал за level-up съобщения
 *   log_channel         — канал за логове
 *   stats_channel       — канал за статистики
 *   admin_log_channel   — канал за admin логове
 *   welcome_channel     — канал за посрещане на нови членове
 *   belly_rush_channel  — канал за Belly Rush
 *   reminders_channel   — канал за напомняния
 *   repair_channel      — канал за repair-ship
 *   translator_channel  — канал за ai-translator
 *   bot_status_channel  — канал за bot status
 *   rookies_role        — роля за нови членове
 *   player_role         — роля за играчи
 *   restricted_channel  — канал с ограничения за менции
 */

const { pool } = require('./db');

// Локален кеш: guildId -> { key: value }
const configCache = new Map();

/**
 * Инициализира таблицата в базата данни (извика се от initDB)
 */
async function initGuildConfigTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS guild_config (
            guild_id VARCHAR(50),
            key TEXT,
            value TEXT,
            PRIMARY KEY (guild_id, key)
        );
    `);
    console.log('✅ Table guild_config is ready.');
}

/**
 * Взима стойност за даден сървър и ключ.
 * Първо проверява кеша, после базата.
 * @param {string} guildId
 * @param {string} key
 * @returns {string|null}
 */
async function getConfig(guildId, key) {
    // Проверка в кеша
    if (configCache.has(guildId) && configCache.get(guildId)[key] !== undefined) {
        return configCache.get(guildId)[key];
    }

    // Взимаме от базата
    try {
        const res = await pool.query(
            'SELECT value FROM guild_config WHERE guild_id = $1 AND key = $2',
            [guildId, key]
        );
        const value = res.rows.length > 0 ? res.rows[0].value : null;

        // Запазваме в кеша
        if (!configCache.has(guildId)) configCache.set(guildId, {});
        configCache.get(guildId)[key] = value;

        return value;
    } catch (e) {
        console.error(`[GuildConfig] Грешка при четене на ${key} за ${guildId}:`, e.message);
        return null;
    }
}

/**
 * Задава стойност за даден сървър и ключ.
 * @param {string} guildId
 * @param {string} key
 * @param {string} value
 */
async function setConfig(guildId, key, value, guildName = 'unknown') {
    try {
        await pool.query(
            `INSERT INTO guild_config (guild_id, guild_name, key, value) VALUES ($1, $2, $3, $4)
             ON CONFLICT (guild_id, key) DO UPDATE SET value = $4, guild_name = $2`,
            [guildId, guildName, key, value]
        );

        // Обновяваме кеша
        if (!configCache.has(guildId)) configCache.set(guildId, {});
        configCache.get(guildId)[key] = value;

        return true;
    } catch (e) {
        console.error(`[GuildConfig] Грешка при запис на ${key} за ${guildId}:`, e.message);
        return false;
    }
}

/**
 * Изтрива настройка.
 */
async function deleteConfig(guildId, key) {
    await pool.query('DELETE FROM guild_config WHERE guild_id = $1 AND key = $2', [guildId, key]);
    if (configCache.has(guildId)) delete configCache.get(guildId)[key];
}

/**
 * Взима всички настройки за даден сървър.
 */
async function getAllConfig(guildId) {
    const res = await pool.query('SELECT key, value FROM guild_config WHERE guild_id = $1', [guildId]);
    const config = {};
    res.rows.forEach(row => { config[row.key] = row.value; });
    configCache.set(guildId, config);
    return config;
}

/**
 * Помощна функция: взима канал по конфиг ключ.
 * @param {Guild} guild
 * @param {string} key
 * @returns {TextChannel|null}
 */
async function getChannel(guild, key) {
    const channelId = await getConfig(guild.id, key);
    if (!channelId) return null;
    return guild.channels.cache.get(channelId) || null;
}

/**
 * Помощна функция: взима роля по конфиг ключ.
 * @param {Guild} guild
 * @param {string} key
 * @returns {Role|null}
 */
async function getRole(guild, key) {
    const roleId = await getConfig(guild.id, key);
    if (!roleId) return null;
    return guild.roles.cache.get(roleId) || null;
}

/**
 * Изчиства кеша за даден сървър (например при рестарт).
 */
function clearCache(guildId) {
    configCache.delete(guildId);
}

module.exports = {
    initGuildConfigTable,
    getConfig,
    setConfig,
    deleteConfig,
    getAllConfig,
    getChannel,
    getRole,
    clearCache
};
