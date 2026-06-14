// systems/i18n.js - Localization and Translation Engine
const fs = require('fs');
const path = require('path');
const db = require('../database').db;

// Load translation dictionaries
const locales = {};
const localesDir = path.join(__dirname, '..', 'locales');

try {
    const files = fs.readdirSync(localesDir);
    for (const file of files) {
        if (file.endsWith('.json')) {
            const lang = path.basename(file, '.json');
            const content = fs.readFileSync(path.join(localesDir, file), 'utf8');
            locales[lang] = JSON.parse(content);
        }
    }
} catch (e) {
    console.error('❌ Failed to load localization files:', e.message);
}

// User locale cache to avoid redundant database reads in high-throughput flows
const localeCache = new Map();

/**
 * Get preferred locale for a user
 * @param {string} guildId 
 * @param {string} userId 
 * @returns {string} locale code
 */
function getLocale(guildId, userId) {
    const cacheKey = `${guildId}_${userId}`;
    if (localeCache.has(cacheKey)) {
        return localeCache.get(cacheKey);
    }
    
    try {
        const row = db.prepare('SELECT locale FROM users WHERE guildId = ? AND userId = ?').get(guildId, userId);
        const locale = row?.locale || 'id';
        localeCache.set(cacheKey, locale);
        return locale;
    } catch (e) {
        return 'id';
    }
}

/**
 * Set preferred locale for a user
 * @param {string} guildId 
 * @param {string} userId 
 * @param {string} locale 
 */
function setLocale(guildId, userId, locale) {
    const cacheKey = `${guildId}_${userId}`;
    localeCache.set(cacheKey, locale);
    
    // Write to DB (guildId is managed by rewrite query proxy in global mode)
    db.prepare('UPDATE users SET locale = ? WHERE guildId = ? AND userId = ?').run(locale, guildId, userId);
}

/**
 * Translate a key into the user's preferred language
 * @param {string} guildId 
 * @param {string} userId 
 * @param {string} key Dot-notation key (e.g. 'cooking.success')
 * @param {Object} [replaceObj] Variables to replace in the translated string
 * @returns {string} Translated string
 */
function t(guildId, userId, key, replaceObj = {}) {
    const locale = getLocale(guildId, userId);
    
    let text = getNestedString(locales[locale], key);
    
    // Fallback to default locale 'id' if key not found in target locale
    if (text === undefined || text === null) {
        text = getNestedString(locales['id'], key);
    }
    
    // If still not found, return the key itself
    if (text === undefined || text === null) {
        return key;
    }
    
    // Perform replacement
    if (typeof text === 'string') {
        for (const [k, v] of Object.entries(replaceObj)) {
            text = text.replace(new RegExp(`{${k}}`, 'g'), v);
        }
    }
    
    return text;
}

/**
 * Helper to traverse object using dot notation path
 */
function getNestedString(obj, path) {
    if (!obj) return null;
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
            current = current[part];
        } else {
            return null;
        }
    }
    return current;
}

module.exports = {
    t,
    getLocale,
    setLocale,
    locales
};
