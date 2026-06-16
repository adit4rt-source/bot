// systems/automod.js — AutoMod System (Modular, toggleable per guild)
// All modules disabled by default. Enable via /admin or dashboard.
const { EmbedBuilder } = require('discord.js');
const { db, getSetting } = require('../database');

// ==================== DATABASE SETUP ====================
db.exec(`CREATE TABLE IF NOT EXISTS automod_config (guildId TEXT, module TEXT, enabled INTEGER DEFAULT 0, PRIMARY KEY(guildId, module))`);
db.exec(`CREATE TABLE IF NOT EXISTS automod_settings (guildId TEXT, key TEXT, value TEXT, PRIMARY KEY(guildId, key))`);
db.exec(`CREATE TABLE IF NOT EXISTS automod_blocked_words (guildId TEXT, word TEXT, PRIMARY KEY(guildId, word))`);
db.exec(`CREATE TABLE IF NOT EXISTS automod_whitelist (guildId TEXT, targetId TEXT, type TEXT DEFAULT 'user', PRIMARY KEY(guildId, targetId))`);
db.exec(`CREATE TABLE IF NOT EXISTS automod_ignored_channels (guildId TEXT, channelId TEXT, PRIMARY KEY(guildId, channelId))`);
db.exec(`CREATE TABLE IF NOT EXISTS automod_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, guildId TEXT, userId TEXT, module TEXT, action TEXT, details TEXT, timestamp INTEGER)`);

// ==================== MODULE DEFINITIONS ====================
const AUTOMOD_MODULES = [
    { id: 'anti_invites', name: 'Anti-Invites', emoji: '🔗', desc: 'Block Discord invite links' },
    { id: 'anti_links', name: 'Anti-Links', emoji: '🌐', desc: 'Block all external links' },
    { id: 'anti_spam', name: 'Anti-Spam', emoji: '🔁', desc: 'Detect and prevent spam' },
    { id: 'anti_badwords', name: 'Anti-Badwords', emoji: '🤬', desc: 'Filter inappropriate language' },
    { id: 'anti_mention', name: 'Anti-Mention', emoji: '📢', desc: 'Prevent excessive mentions' },
    { id: 'anti_caps', name: 'Anti-All Caps', emoji: '🔠', desc: 'Block excessive capital letters' },
    { id: 'anti_emoji', name: 'Anti-Emoji', emoji: '😀', desc: 'Prevent spammy emoji use' },
    { id: 'anti_zalgo', name: 'Anti-Zalgo', emoji: '⚠️', desc: 'Detect and block glitchy text' },
];

// ==================== CONFIG HELPERS ====================
function isModuleEnabled(guildId, moduleId) { const r = db.prepare('SELECT enabled FROM automod_config WHERE guildId = ? AND module = ?').get(guildId, moduleId); return r ? r.enabled === 1 : false; }
function setModuleEnabled(guildId, moduleId, enabled) { db.prepare('INSERT OR REPLACE INTO automod_config (guildId, module, enabled) VALUES (?, ?, ?)').run(guildId, moduleId, enabled ? 1 : 0); }
function getAutomodSetting(guildId, key, def = null) { const r = db.prepare('SELECT value FROM automod_settings WHERE guildId = ? AND key = ?').get(guildId, key); return r ? r.value : def; }
function setAutomodSetting(guildId, key, value) { db.prepare('INSERT OR REPLACE INTO automod_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, key, String(value)); }
function getBlockedWords(guildId) { return db.prepare('SELECT word FROM automod_blocked_words WHERE guildId = ?').all(guildId).map(r => r.word); }
function addBlockedWord(guildId, word) { db.prepare('INSERT OR IGNORE INTO automod_blocked_words (guildId, word) VALUES (?, ?)').run(guildId, word.toLowerCase().trim()); }
function removeBlockedWord(guildId, word) { db.prepare('DELETE FROM automod_blocked_words WHERE guildId = ? AND word = ?').run(guildId, word.toLowerCase().trim()); }
function getWhitelist(guildId) { return db.prepare('SELECT targetId, type FROM automod_whitelist WHERE guildId = ?').all(guildId); }
function addWhitelist(guildId, targetId, type = 'user') { db.prepare('INSERT OR IGNORE INTO automod_whitelist (guildId, targetId, type) VALUES (?, ?, ?)').run(guildId, targetId, type); }
function removeWhitelist(guildId, targetId) { db.prepare('DELETE FROM automod_whitelist WHERE guildId = ? AND targetId = ?').run(guildId, targetId); }
function isWhitelisted(guildId, userId, roleIds = []) { if (db.prepare('SELECT 1 FROM automod_whitelist WHERE guildId = ? AND targetId = ?').get(guildId, userId)) return true; for (const r of roleIds) { if (db.prepare('SELECT 1 FROM automod_whitelist WHERE guildId = ? AND targetId = ?').get(guildId, r)) return true; } return false; }
function getIgnoredChannels(guildId) { return db.prepare('SELECT channelId FROM automod_ignored_channels WHERE guildId = ?').all(guildId).map(r => r.channelId); }
function addIgnoredChannel(guildId, channelId) { db.prepare('INSERT OR IGNORE INTO automod_ignored_channels (guildId, channelId) VALUES (?, ?)').run(guildId, channelId); }
function removeIgnoredChannel(guildId, channelId) { db.prepare('DELETE FROM automod_ignored_channels WHERE guildId = ? AND channelId = ?').run(guildId, channelId); }
function logAutomodAction(guildId, userId, module, action, details = '') { db.prepare('INSERT INTO automod_logs (guildId, userId, module, action, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, module, action, details, Date.now()); }
function getAllModuleStates(guildId) { const s = {}; for (const m of AUTOMOD_MODULES) s[m.id] = isModuleEnabled(guildId, m.id); return s; }

// ==================== SPAM TRACKER ====================
const spamTracker = new Map();
const SPAM_WINDOW = 5000;
const SPAM_THRESHOLD = 5;
const DUPLICATE_THRESHOLD = 3;

// ==================== CHECK FUNCTIONS ====================
function checkAntiInvites(c) { return /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[\w-]+/gi.test(c); }
function checkAntiLinks(c) { return /https?:\/\/[^\s<]+/gi.test(c); }
function checkAntiSpam(guildId, userId, content) { const key = `${guildId}_${userId}`, now = Date.now(); if (!spamTracker.has(key)) spamTracker.set(key, { messages: [] }); const t = spamTracker.get(key); t.messages = t.messages.filter(m => now - m.time < SPAM_WINDOW); t.messages.push({ content, time: now }); if (t.messages.length >= SPAM_THRESHOLD) return { spam: true, reason: `${SPAM_THRESHOLD} messages in ${SPAM_WINDOW/1000}s` }; if (t.messages.filter(m => m.content === content).length >= DUPLICATE_THRESHOLD) return { spam: true, reason: `${DUPLICATE_THRESHOLD} duplicate messages` }; return { spam: false }; }

// Periodically evict spam-tracker entries whose messages have all expired, so the
// Map doesn't retain one key per user forever (unbounded memory growth).
const _spamSweep = setInterval(() => {
    const now = Date.now();
    for (const [key, t] of spamTracker) {
        if (!t.messages.length || now - t.messages[t.messages.length - 1].time > SPAM_WINDOW) {
            spamTracker.delete(key);
        }
    }
}, 60 * 1000);
if (typeof _spamSweep.unref === 'function') _spamSweep.unref();
function checkAntiBadwords(guildId, content) { const words = getBlockedWords(guildId); if (!words.length) return false; const l = content.toLowerCase(); return words.find(w => l.includes(w)) || false; }
function checkAntiMention(content, message) { const m = (message.mentions?.users?.size || 0) + (message.mentions?.roles?.size || 0); return m > 5 || content.includes('@everyone') || content.includes('@here'); }
function checkAntiCaps(c) { if (c.length < 10) return false; return (c.match(/[A-Z]/g) || []).length / c.length > 0.7; }
function checkAntiEmoji(c) { return (c.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length > 10; }
function checkAntiZalgo(c) { return /[\u0300-\u036f\u0489]{3,}/g.test(c); }

// ==================== VIOLATION ESCALATION TRACKER ====================
// Tracks recent violations per user. After `mute_threshold` violations within
// VIOLATION_WINDOW, the member is timed out (muted) for `mute_minutes`.
const violationTracker = new Map(); // `${guildId}_${userId}` -> [timestamps]
const VIOLATION_WINDOW = 60 * 1000; // 60s

function recordViolation(guildId, userId) {
    const key = `${guildId}_${userId}`;
    const now = Date.now();
    let arr = (violationTracker.get(key) || []).filter(t => now - t < VIOLATION_WINDOW);
    arr.push(now);
    violationTracker.set(key, arr);
    return arr.length;
}

const _violationSweep = setInterval(() => {
    const now = Date.now();
    for (const [key, arr] of violationTracker) {
        const live = arr.filter(t => now - t < VIOLATION_WINDOW);
        if (!live.length) violationTracker.delete(key);
        else violationTracker.set(key, live);
    }
}, 60 * 1000);
if (typeof _violationSweep.unref === 'function') _violationSweep.unref();

// ==================== MAIN HANDLER ====================
async function processAutomod(message) {
    if (!message.guild || message.author.bot) return null;
    const guildId = message.guild.id, userId = message.author.id, content = message.content;
    if (!content) return null;
    const ignoredChannels = getIgnoredChannels(guildId);
    if (ignoredChannels.includes(message.channel.id)) return null;
    const memberRoles = message.member?.roles?.cache?.map(r => r.id) || [];
    if (isWhitelisted(guildId, userId, memberRoles)) return null;
    if (message.member?.permissions?.has('ManageMessages')) return null;

    let violation = null;
    if (!violation && isModuleEnabled(guildId, 'anti_invites') && checkAntiInvites(content)) violation = { module: 'anti_invites', reason: 'Discord invite link detected', action: 'delete' };
    if (!violation && isModuleEnabled(guildId, 'anti_links') && checkAntiLinks(content)) violation = { module: 'anti_links', reason: 'External link detected', action: 'delete' };
    if (!violation && isModuleEnabled(guildId, 'anti_spam')) { const r = checkAntiSpam(guildId, userId, content); if (r.spam) violation = { module: 'anti_spam', reason: r.reason, action: 'delete_warn' }; }
    if (!violation && isModuleEnabled(guildId, 'anti_badwords')) { const w = checkAntiBadwords(guildId, content); if (w) violation = { module: 'anti_badwords', reason: `Blocked word: "${w}"`, action: 'delete' }; }
    if (!violation && isModuleEnabled(guildId, 'anti_mention') && checkAntiMention(content, message)) violation = { module: 'anti_mention', reason: 'Excessive mentions', action: 'delete_warn' };
    if (!violation && isModuleEnabled(guildId, 'anti_caps') && checkAntiCaps(content)) violation = { module: 'anti_caps', reason: 'Excessive capital letters (70%+)', action: 'delete' };
    if (!violation && isModuleEnabled(guildId, 'anti_emoji') && checkAntiEmoji(content)) violation = { module: 'anti_emoji', reason: 'Excessive emoji (10+)', action: 'delete' };
    if (!violation && isModuleEnabled(guildId, 'anti_zalgo') && checkAntiZalgo(content)) violation = { module: 'anti_zalgo', reason: 'Zalgo/glitchy text detected', action: 'delete' };

    if (!violation) return null;

    try {
        await message.delete().catch(() => {});
        const modDef = AUTOMOD_MODULES.find(m => m.id === violation.module);
        if (violation.action === 'delete_warn') {
            const w = await message.channel.send({ content: `<@${userId}> ⚠️ **AutoMod** — ${modDef?.emoji || '🛡️'} ${modDef?.name || ''}: ${violation.reason}` }).catch(() => null);
            if (w) setTimeout(() => w.delete().catch(() => {}), 5000);
        }
        logAutomodAction(guildId, userId, violation.module, violation.action, violation.reason);

        // ---- Escalation: auto-mute (timeout) after repeated violations ----
        const muteThreshold = parseInt(getAutomodSetting(guildId, 'mute_threshold', '3')) || 3;
        const muteMinutes = parseInt(getAutomodSetting(guildId, 'mute_minutes', '10')) || 10;
        const vcount = recordViolation(guildId, userId);
        let muted = false;
        if (muteThreshold > 0 && vcount >= muteThreshold) {
            try {
                if (message.member?.moderatable) {
                    await message.member.timeout(muteMinutes * 60 * 1000, `AutoMod: ${vcount} pelanggaran dalam 60 detik`);
                    muted = true;
                    violationTracker.delete(`${guildId}_${userId}`); // reset after mute
                    const m = await message.channel.send({ content: `🔇 <@${userId}> di-**mute ${muteMinutes} menit** karena ${vcount}x melanggar AutoMod.` }).catch(() => null);
                    if (m) setTimeout(() => m.delete().catch(() => {}), 8000);
                }
            } catch (_) { /* missing perms / not moderatable */ }
        }

        const logChannelId = getAutomodSetting(guildId, 'mod_log_channel');
        if (logChannelId) {
            const ch = message.guild.channels.cache.get(logChannelId);
            if (ch) ch.send({ embeds: [new EmbedBuilder().setColor('#E74C3C').setTitle(`${modDef?.emoji || '🛡️'} AutoMod: ${modDef?.name || violation.module}`).setDescription(`**User:** <@${userId}>\n**Channel:** <#${message.channel.id}>\n**Reason:** ${violation.reason}\n**Action:** ${muted ? `🔇 Muted ${muteMinutes}m (${vcount}x)` : (violation.action === 'delete_warn' ? 'Deleted + Warned' : 'Deleted')}`).addFields({ name: 'Content', value: content.substring(0, 500) || '[empty]' }).setTimestamp().setFooter({ text: `ID: ${userId}` })] }).catch(() => {});
        }
        return violation;
    } catch (e) { return null; }
}

module.exports = { AUTOMOD_MODULES, processAutomod, isModuleEnabled, setModuleEnabled, getAutomodSetting, setAutomodSetting, getBlockedWords, addBlockedWord, removeBlockedWord, getWhitelist, addWhitelist, removeWhitelist, getIgnoredChannels, addIgnoredChannel, removeIgnoredChannel, getAllModuleStates, logAutomodAction };
