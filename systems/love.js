// systems/love.js — Global "Love" system (like followers).
//
// A member earns a "love" when someone reacts ❤️ on their message. Each love is
// UNIQUE per (lover -> loved) pair GLOBALLY: one person can only ever give you
// +1 love across ALL servers the bot is in. Re-reacting, reacting in a different
// server, or reacting again later never inflates the count. You also can't love
// your own message.
//
// Think of it like "followers" — the count shown is the number of DISTINCT people
// who loved you across the entire bot network: "PekoID ❤️10" = 10 different people
// like Peko, regardless of which server the love came from.
//
// The display lives both in /profile and (optionally) appended to the Discord
// nickname next to the streak: "PekoID 🔥10 ❤️10". Because the streak system also
// rewrites the nickname, BOTH suffixes are managed by one shared builder
// (refreshMemberNick) so they never clobber each other.
//
// Admin controls (server_settings, mirroring streak_*):
//   love_enabled        '1' (default) | '0' to turn it off
//   love_emoji          '❤️' (default) — the reaction emoji that grants love
//   love_min            min love count before it shows in the nickname (default 1)
//   love_auto_nickname  '1' (default) | '0' to keep love out of nicknames

const { db, getSetting } = require('../database');

// Global loves table — like "followers". One person can only give you ONE love,
// regardless of which server the reaction happened in. PK is (loverId, lovedId).
// The guildId column is kept for reference (where the love was first given) but
// is NOT part of the uniqueness constraint.
db.exec(`CREATE TABLE IF NOT EXISTS loves (loverId TEXT, lovedId TEXT, guildId TEXT, createdAt INTEGER, PRIMARY KEY(loverId, lovedId))`);

// --- Auto-migrate from per-guild to global schema ---
// Old schema had PK (guildId, loverId, lovedId). Detect and rebuild with the new
// global PK (loverId, lovedId), keeping the earliest love per pair.
(function ensureLovesSchema() {
    try {
        const cols = db.prepare('PRAGMA table_info(loves)').all();
        if (!cols.length) return;
        const pkCols = cols.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name);
        // Already correct: PK is (loverId, lovedId) only
        if (pkCols.length === 2 && pkCols[0] === 'loverId' && pkCols[1] === 'lovedId') return;
        // Need migration
        db.exec('DROP TABLE IF EXISTS loves_global');
        db.exec(`CREATE TABLE loves_global (loverId TEXT, lovedId TEXT, guildId TEXT, createdAt INTEGER, PRIMARY KEY(loverId, lovedId))`);
        // Insert only the earliest love per (loverId, lovedId) pair across all guilds
        db.exec(`INSERT OR IGNORE INTO loves_global (loverId, lovedId, guildId, createdAt)
                 SELECT loverId, lovedId, guildId, MIN(createdAt) FROM loves GROUP BY loverId, lovedId`);
        db.exec('DROP TABLE loves');
        db.exec('ALTER TABLE loves_global RENAME TO loves');
        console.log('[love] Migrated loves table to global PK (loverId, lovedId) — like followers');
    } catch (e) {
        try { console.error('[love] loves schema migration failed:', e && e.message); } catch (_) {}
    }
})();

const DEFAULT_EMOJI = '❤️';

// Discord may deliver hearts with/without the U+FE0F variation selector; strip it
// so "❤️" and "❤" compare equal.
function normEmoji(s) { return (s || '').replace(/\uFE0F/g, ''); }

function isEnabled(guildId) {
    return getSetting(guildId, 'love_enabled', '1') !== '0';
}

function getEmoji(guildId) {
    return getSetting(guildId, 'love_emoji', DEFAULT_EMOJI) || DEFAULT_EMOJI;
}

// True if the given reaction emoji name should be treated as a "love" react.
function isLoveEmoji(guildId, emojiName) {
    return normEmoji(emojiName) === normEmoji(getEmoji(guildId));
}

// Number of distinct people who have loved this user (GLOBAL — all servers combined).
function getLoveCount(guildId, userId) {
    return db.prepare('SELECT COUNT(*) AS c FROM loves WHERE lovedId = ?').get(userId)?.c || 0;
}

// Has this person already loved the target? (global check — regardless of server)
function hasLoved(guildId, loverId, lovedId) {
    return !!db.prepare('SELECT 1 FROM loves WHERE loverId = ? AND lovedId = ?').get(loverId, lovedId);
}

// People who loved this user, newest first (array of { loverId }). Global.
function getLovers(guildId, userId, limit = 25) {
    return db.prepare('SELECT loverId FROM loves WHERE lovedId = ? ORDER BY createdAt DESC LIMIT ?').all(userId, limit);
}

// Global leaderboard of most-loved users: [{ lovedId, count }].
function getTopLoved(guildId, limit = 10) {
    return db.prepare('SELECT lovedId, COUNT(*) AS count FROM loves GROUP BY lovedId ORDER BY count DESC, MIN(createdAt) ASC LIMIT ?').all(limit);
}

// Record a love. Returns { added, count, reason }.
//   added=true  -> a brand-new love was recorded (caller should refresh the nick)
//   added=false -> nothing changed; reason is 'self' | 'already'
// Love is GLOBAL: 1 person can only give 1 love to a target, ever (like a follow).
// guildId is stored for reference (where the love originated) but not for uniqueness.
function giveLove(guildId, loverId, lovedId) {
    if (!loverId || !lovedId || loverId === lovedId) {
        return { added: false, count: getLoveCount(guildId, lovedId), reason: 'self' };
    }
    if (hasLoved(guildId, loverId, lovedId)) {
        return { added: false, count: getLoveCount(guildId, lovedId), reason: 'already' };
    }
    db.prepare('INSERT OR IGNORE INTO loves (loverId, lovedId, guildId, createdAt) VALUES (?, ?, ?, ?)')
        .run(loverId, lovedId, guildId, Date.now());
    return { added: true, count: getLoveCount(guildId, lovedId) };
}

// ==================== UNIFIED NICKNAME TAGGING ====================
// Rebuilds a member's nickname as "<base> 🔥<streak> ❤️<love>", including only the
// suffixes that are enabled AND meet their minimum. Strips any previously-applied
// 🔥/❤️ suffixes first so repeated calls (from streak OR love events) stay stable,
// and trims the base name so the result fits Discord's 32-char nickname limit.

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Remove trailing " <emoji><optional space><digits>" groups for each emoji,
// repeatedly, so order/spacing variations all get cleaned.
function stripTags(name, emojis) {
    let s = name;
    let changed = true;
    while (changed) {
        changed = false;
        for (const e of emojis) {
            if (!e) continue;
            const re = new RegExp(`\\s*${escapeRegex(e)}\\s?\\d+\\s*$`);
            if (re.test(s)) { s = s.replace(re, ''); changed = true; }
        }
    }
    return s.trim();
}

async function refreshMemberNick(member) {
    try {
        if (!member || !member.user || member.user.bot) return;
        try { if (!member.guild.members.me) await member.guild.members.fetchMe(); } catch (_) {}
        let manageable = false;
        try { manageable = member.manageable; } catch (_) { manageable = false; }
        if (!manageable) return;
        const guildId = member.guild.id;
        const userId = member.id;

        const streakEmoji = getSetting(guildId, 'streak_emoji', '🔥');
        const loveEmoji = getEmoji(guildId);

        const current = member.nickname || member.user.username;
        let base = stripTags(current, [streakEmoji, loveEmoji]);

        // --- streak suffix (respects the existing streak_* settings) ---
        let streakSuffix = '';
        const streakAuto = getSetting(guildId, 'streak_auto_nickname', '0');
        if (streakAuto === '1' || streakAuto === 'true') {
            const minStreak = parseInt(getSetting(guildId, 'streak_min_days', '3')) || 3;
            const sc = db.prepare('SELECT count FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId)?.count || 0;
            if (sc >= minStreak) streakSuffix = ` ${streakEmoji}${sc}`;
        }

        // --- love suffix ---
        let loveSuffix = '';
        const loveAuto = getSetting(guildId, 'love_auto_nickname', '1');
        if (isEnabled(guildId) && (loveAuto === '1' || loveAuto === 'true')) {
            const minLove = parseInt(getSetting(guildId, 'love_min', '1')) || 1;
            const lc = getLoveCount(guildId, userId);
            if (lc >= minLove) loveSuffix = ` ${loveEmoji}${lc}`;
        }

        let newNick = `${base}${streakSuffix}${loveSuffix}`;
        if (newNick.length > 32) {
            // Trim the base so the suffixes still fit.
            const room = 32 - streakSuffix.length - loveSuffix.length;
            base = base.slice(0, Math.max(1, room)).trim();
            newNick = `${base}${streakSuffix}${loveSuffix}`;
            if (newNick.length > 32) newNick = newNick.slice(0, 32);
        }

        if (current !== newNick) await member.setNickname(newNick).catch(() => {});
    } catch (_) { /* nickname update is best-effort, never throw */ }
}

// ==================== ANNOUNCEMENT ====================
// Posts a notification when someone receives a new love, mirroring the streak
// announcement. Configured via server_settings:
//   love_announce_channel  channel ID to post in ('' = off)
//   love_announce_message  optional custom template, supports placeholders:
//     {lover.mention} {lover.name} {loved.mention} {loved.name} {count} {emoji}
// `lover`/`loved` are { id, name }. Best-effort; never throws.
async function announceLove(guild, lover, loved, count) {
    try {
        const { EmbedBuilder } = require('discord.js');
        const guildId = guild.id;
        const channelId = getSetting(guildId, 'love_announce_channel', '');
        if (!channelId) return; // notifications off until an admin sets a channel
        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || typeof channel.send !== 'function') return;

        const emoji = getEmoji(guildId);
        const tpl = getSetting(guildId, 'love_announce_message', '');
        let desc;
        if (tpl) {
            desc = tpl
                .replace(/{lover\.mention}/g, `<@${lover.id}>`)
                .replace(/{lover\.name}/g, lover.name || 'Seseorang')
                .replace(/{loved\.mention}/g, `<@${loved.id}>`)
                .replace(/{loved\.name}/g, loved.name || 'User')
                .replace(/{count}/g, String(count))
                .replace(/{emoji}/g, emoji);
        } else {
            desc = `${emoji} <@${lover.id}> memberikan love ke <@${loved.id}>!\n` +
                `Sekarang <@${loved.id}> disukai oleh ${emoji} **${count}** orang.`;
        }

        await channel.send({
            embeds: [new EmbedBuilder().setColor('#E91E63').setDescription(desc).setTimestamp()],
        }).catch(() => {});
    } catch (_) { /* announcement is best-effort */ }
}

module.exports = {
    isEnabled, getEmoji, isLoveEmoji,
    getLoveCount, hasLoved, getLovers, getTopLoved,
    giveLove, refreshMemberNick, announceLove,
    DEFAULT_EMOJI,
};
