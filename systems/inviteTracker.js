// systems/inviteTracker.js — Invite Tracking System
// Tracks who invited whom, invite counts, and leaderboard.
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { db, getSetting } = require('../database');

// ==================== DATABASE SETUP ====================
db.exec(`CREATE TABLE IF NOT EXISTS invites (guildId TEXT, inviterId TEXT, invitedId TEXT, code TEXT, joinedAt INTEGER, leftAt INTEGER, fake INTEGER DEFAULT 0, PRIMARY KEY(guildId, invitedId))`);
db.exec(`CREATE TABLE IF NOT EXISTS invite_settings (guildId TEXT, key TEXT, value TEXT, PRIMARY KEY(guildId, key))`);
db.exec(`CREATE TABLE IF NOT EXISTS invite_bonus (guildId TEXT, userId TEXT, bonus INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId))`);
db.exec(`CREATE TABLE IF NOT EXISTS invite_blacklist (guildId TEXT, userId TEXT, reason TEXT, addedAt INTEGER, PRIMARY KEY(guildId, userId))`);

// In-memory invite cache: guildId -> Map<code, uses>
const inviteCache = new Map();

// ==================== SETTINGS HELPERS ====================
function getInviteSetting(guildId, key, defaultVal = null) {
    const row = db.prepare('SELECT value FROM invite_settings WHERE guildId = ? AND key = ?').get(guildId, key);
    return row ? row.value : defaultVal;
}

function setInviteSetting(guildId, key, value) {
    db.prepare('INSERT OR REPLACE INTO invite_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, key, String(value));
}

function getAllInviteSettings(guildId) {
    const keys = ['invite_enabled', 'invite_channel', 'invite_reward_channel', 'invite_message', 'invite_fake_threshold', 'invite_leave_deduct'];
    const defaults = {
        invite_enabled: '1',
        invite_channel: '',
        invite_reward_channel: '', // where tier-reward announcements go; falls back to invite_channel
        invite_message: '{inviter.mention} mengundang {user.mention}! (Total: **{inviter.total}** invites)',
        invite_fake_threshold: '7', // days — accounts younger than this are "fake"
        invite_leave_deduct: '1', // deduct when invited user leaves
    };
    const settings = {};
    for (const key of keys) {
        settings[key] = getInviteSetting(guildId, key, defaults[key]);
    }
    return settings;
}

// ==================== CACHE MANAGEMENT ====================
async function cacheGuildInvites(guild) {
    try {
        if (!guild?.members?.me?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return;
        const invites = await guild.invites.fetch();
        const cacheMap = new Map();
        invites.forEach(inv => cacheMap.set(inv.code, inv.uses || 0));
        inviteCache.set(guild.id, cacheMap);
    } catch (e) {
        // Bot might not have MANAGE_GUILD permission or guild unavailable
    }
}

async function cacheAllGuildInvites(client) {
    for (const [, guild] of client.guilds.cache) {
        await cacheGuildInvites(guild);
    }
}

// ==================== MEMBER JOIN HANDLER ====================
// Build a decorative framed description block: each line prefixed with "◆ ➣".
function inviteFrame(lines) {
    const top = '┏━━━━━━━━━━ ✦ ━━━━━━━━━━┓';
    const bottom = '┗━━━━━━━━━━ ✦ ━━━━━━━━━━┛';
    return [top, ...lines.map((l) => `◆ ➣ ${l}`), bottom].join('\n');
}

async function handleMemberJoin(member) {
    const guildId = member.guild.id;
    const enabled = getInviteSetting(guildId, 'invite_enabled', '1');
    if (enabled !== '1') return;

    let inviterUserId = null;
    let usedCode = null;

    try {
        const newInvites = await member.guild.invites.fetch();
        const oldCache = inviteCache.get(guildId) || new Map();

        // Find the invite that increased uses
        for (const [code, inv] of newInvites) {
            const oldUses = oldCache.get(code) || 0;
            if (inv.uses > oldUses) {
                inviterUserId = inv.inviterId;
                usedCode = code;
                break;
            }
        }

        // Update cache
        const newCache = new Map();
        newInvites.forEach(inv => newCache.set(inv.code, inv.uses || 0));
        inviteCache.set(guildId, newCache);
    } catch (e) {
        // Can't fetch invites
        return;
    }

    if (!inviterUserId) {
        // Check if joined via vanity URL
        try {
            const vanityData = await member.guild.fetchVanityData().catch(() => null);
            if (vanityData && vanityData.code) {
                // Vanity invite — log it
                const channelId = getInviteSetting(guildId, 'invite_channel', '');
                if (channelId) {
                    const channel = member.guild.channels.cache.get(channelId);
                    if (channel) {
                        const embed = new EmbedBuilder()
                            .setColor('#5865F2')
                            .setDescription(inviteFrame([
                                `**Invited :** <@${member.id}>`,
                                `**Invited by :** ✨ Vanity (discord.gg/${vanityData.code})`,
                                `**Total Member :** ${member.guild.memberCount}`,
                            ]))
                            .setFooter({ text: `ID: ${member.id}` })
                            .setTimestamp();
                        channel.send({ embeds: [embed] }).catch(() => {});
                    }
                }
            }
        } catch (_) {}
        return;
    }

    // Check if inviter is blacklisted
    if (isInviteBlacklisted(guildId, inviterUserId)) {
        // Log as blacklisted invite (not counted)
        const channelId = getInviteSetting(guildId, 'invite_channel', '');
        if (channelId) {
            const channel = member.guild.channels.cache.get(channelId);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setColor('#808080')
                    .setDescription(inviteFrame([
                        `**Invited :** <@${member.id}>`,
                        `**Invited by :** <@${inviterUserId}> 🚫 *(blacklist — tidak dihitung)*`,
                        `**Total Member :** ${member.guild.memberCount}`,
                    ]))
                    .setFooter({ text: `ID: ${member.id}` })
                    .setTimestamp();
                channel.send({ embeds: [embed] }).catch(() => {});
            }
        }
        // Still store the record but mark as fake so it doesn't count
        db.prepare('INSERT OR REPLACE INTO invites (guildId, inviterId, invitedId, code, joinedAt, leftAt, fake) VALUES (?, ?, ?, ?, ?, NULL, 1)').run(guildId, inviterUserId, member.id, usedCode, Date.now());
        // Update cache
        return;
    }

    // Anti-abuse checks
    const fakeThreshold = parseInt(getInviteSetting(guildId, 'invite_fake_threshold', '7')) || 7;
    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    const isTooYoung = accountAgeDays < fakeThreshold;
    const isSelf = inviterUserId === member.id;
    const isBot = Boolean(member.user?.bot);

    // Rejoin exploit prevention: check if member previously joined this server
    const prevRecord = db.prepare('SELECT 1 FROM invites WHERE guildId = ? AND invitedId = ?').get(guildId, member.id);
    const isRejoin = Boolean(prevRecord);

    const isFake = (isTooYoung || isSelf || isBot || isRejoin) ? 1 : 0;

    // Store invite record
    db.prepare('INSERT OR REPLACE INTO invites (guildId, inviterId, invitedId, code, joinedAt, leftAt, fake) VALUES (?, ?, ?, ?, ?, NULL, ?)').run(guildId, inviterUserId, member.id, usedCode, Date.now(), isFake);

    const channelId = getInviteSetting(guildId, 'invite_channel', '');

    // Tiered invite rewards — grant any milestone the inviter just crossed (valid
    // invites only). Best-effort: never let a reward error block the join flow.
    if (!isFake) {
        try {
            const { processInviteJoinRewards } = require('./inviteRewards');
            const validInvites = getInviterStats(guildId, inviterUserId).total;
            // Reward announcements go to a dedicated channel if set, else the invite channel.
            const rewardChannelId = getInviteSetting(guildId, 'invite_reward_channel', '') || channelId;
            await processInviteJoinRewards(member.guild, inviterUserId, validInvites, rewardChannelId);
        } catch (e) {
            // swallow — invite tracking must keep working even if rewards fail
        }
    }

    // Send announcement
    if (channelId) {
        const channel = member.guild.channels.cache.get(channelId);
        if (channel) {
            const stats = getInviterStats(guildId, inviterUserId);

            const notes = [];
            if (isSelf) notes.push('⚠️ *Self-invite — tidak dihitung*');
            else if (isBot) notes.push('🤖 *Bot invite — tidak dihitung*');
            else if (isRejoin) notes.push('🔄 *Rejoin — tidak dihitung ulang*');
            else if (isTooYoung) notes.push(`⚠️ *Akun baru (< ${fakeThreshold} hari)*`);

            const embed = new EmbedBuilder()
                .setColor(isFake ? '#FAA61A' : '#E91E63')
                .setDescription(inviteFrame([
                    `**Invited :** <@${member.id}>`,
                    `**Invited by :** <@${inviterUserId}>`,
                    `**Total Invite :** ${stats.total}`,
                    `**Total Member :** ${member.guild.memberCount}`,
                    ...notes,
                ]))
                .setFooter({ text: `ID: ${member.id}` })
                .setTimestamp();

            channel.send({ embeds: [embed] }).catch(() => {});
        }
    }
}

// ==================== MEMBER LEAVE HANDLER ====================
async function handleMemberLeave(member) {
    const guildId = member.guild.id;
    const enabled = getInviteSetting(guildId, 'invite_enabled', '1');
    if (enabled !== '1') return;

    const leaveDeduct = getInviteSetting(guildId, 'invite_leave_deduct', '1');

    // Mark invite record as left
    const record = db.prepare('SELECT * FROM invites WHERE guildId = ? AND invitedId = ?').get(guildId, member.id);
    if (record) {
        db.prepare('UPDATE invites SET leftAt = ? WHERE guildId = ? AND invitedId = ?').run(Date.now(), guildId, member.id);
    }

    // Announce leave if channel set
    if (record && record.inviterId) {
        const channelId = getInviteSetting(guildId, 'invite_channel', '');
        if (channelId) {
            const channel = member.guild.channels.cache.get(channelId);
            if (channel) {
                const stats = getInviterStats(guildId, record.inviterId);
                const embed = new EmbedBuilder()
                    .setColor('#ED4245')
                    .setDescription(inviteFrame([
                        `**Left :** <@${member.id}>`,
                        `**Invited by :** <@${record.inviterId}>`,
                        `**Inviter Invite :** ${stats.total}`,
                        `**Total Member :** ${member.guild.memberCount}`,
                    ]))
                    .setFooter({ text: `ID: ${member.id}` })
                    .setTimestamp();
                channel.send({ embeds: [embed] }).catch(() => {});
            }
        }
    }
}

// ==================== BONUS INVITES ====================
function getBonusInvites(guildId, userId) {
    const row = db.prepare('SELECT bonus FROM invite_bonus WHERE guildId = ? AND userId = ?').get(guildId, userId);
    return row ? row.bonus : 0;
}

function addBonusInvites(guildId, userId, amount) {
    const current = getBonusInvites(guildId, userId);
    db.prepare('INSERT OR REPLACE INTO invite_bonus (guildId, userId, bonus) VALUES (?, ?, ?)').run(guildId, userId, current + amount);
    return current + amount;
}

// ==================== INVITE BLACKLIST ====================
function isInviteBlacklisted(guildId, userId) {
    return !!db.prepare('SELECT 1 FROM invite_blacklist WHERE guildId = ? AND userId = ?').get(guildId, userId);
}

function addInviteBlacklist(guildId, userId, reason = '') {
    db.prepare('INSERT OR REPLACE INTO invite_blacklist (guildId, userId, reason, addedAt) VALUES (?, ?, ?, ?)').run(guildId, userId, reason, Date.now());
}

function removeInviteBlacklist(guildId, userId) {
    db.prepare('DELETE FROM invite_blacklist WHERE guildId = ? AND userId = ?').run(guildId, userId);
}

function getInviteBlacklist(guildId) {
    return db.prepare('SELECT * FROM invite_blacklist WHERE guildId = ? ORDER BY addedAt DESC').all(guildId);
}

// ==================== STATS HELPERS ====================
function getInviterStats(guildId, userId) {
    const valid = db.prepare('SELECT COUNT(*) as count FROM invites WHERE guildId = ? AND inviterId = ? AND fake = 0 AND leftAt IS NULL').get(guildId, userId)?.count || 0;
    const fake = db.prepare('SELECT COUNT(*) as count FROM invites WHERE guildId = ? AND inviterId = ? AND fake = 1').get(guildId, userId)?.count || 0;
    const left = db.prepare('SELECT COUNT(*) as count FROM invites WHERE guildId = ? AND inviterId = ? AND leftAt IS NOT NULL AND fake = 0').get(guildId, userId)?.count || 0;
    const bonus = getBonusInvites(guildId, userId);
    const total = valid + bonus;
    const totalAll = db.prepare('SELECT COUNT(*) as count FROM invites WHERE guildId = ? AND inviterId = ?').get(guildId, userId)?.count || 0;
    return { total, real: valid, fake, left, bonus, totalAll };
}

function getInviteLeaderboard(guildId, limit = 20) {
    const rows = db.prepare(`
        WITH inviter_totals AS (
            SELECT 
                u.userId,
                COALESCE(i.real_count, 0) as real,
                COALESCE(i.fake_count, 0) as fake,
                COALESCE(i.left_count, 0) as left_count,
                COALESCE(i.total_all, 0) as totalAll,
                COALESCE(b.bonus, 0) as bonus,
                (COALESCE(i.real_count, 0) + COALESCE(b.bonus, 0)) as total
            FROM (
                SELECT inviterId as userId FROM invites WHERE guildId = ?
                UNION
                SELECT userId FROM invite_bonus WHERE guildId = ?
            ) u
            LEFT JOIN (
                SELECT inviterId,
                    COUNT(CASE WHEN fake = 0 AND leftAt IS NULL THEN 1 END) as real_count,
                    COUNT(CASE WHEN fake = 1 THEN 1 END) as fake_count,
                    COUNT(CASE WHEN leftAt IS NOT NULL AND fake = 0 THEN 1 END) as left_count,
                    COUNT(*) as total_all
                FROM invites WHERE guildId = ?
                GROUP BY inviterId
            ) i ON i.inviterId = u.userId
            LEFT JOIN invite_bonus b ON b.guildId = ? AND b.userId = u.userId
        )
        SELECT userId, total, real, fake, left_count as 'left', bonus, totalAll
        FROM inviter_totals
        WHERE total > 0 OR totalAll > 0
        ORDER BY total DESC
        LIMIT ?
    `).all(guildId, guildId, guildId, guildId, limit);
    return rows;
}

function getInvitedBy(guildId, userId) {
    return db.prepare('SELECT * FROM invites WHERE guildId = ? AND invitedId = ?').get(guildId, userId);
}

function getInvitedList(guildId, inviterId, limit = 50) {
    return db.prepare('SELECT invitedId, joinedAt, leftAt, fake, code FROM invites WHERE guildId = ? AND inviterId = ? ORDER BY joinedAt DESC LIMIT ?').all(guildId, inviterId, limit);
}

function resetInvites(guildId, userId) {
    if (userId) {
        db.prepare('DELETE FROM invites WHERE guildId = ? AND inviterId = ?').run(guildId, userId);
    } else {
        db.prepare('DELETE FROM invites WHERE guildId = ?').run(guildId);
    }
}

module.exports = {
    cacheGuildInvites,
    cacheAllGuildInvites,
    handleMemberJoin,
    handleMemberLeave,
    getInviterStats,
    getInviteLeaderboard,
    getInvitedBy,
    getInvitedList,
    resetInvites,
    getAllInviteSettings,
    getInviteSetting,
    setInviteSetting,
    inviteCache,
    getBonusInvites,
    addBonusInvites,
    isInviteBlacklisted,
    addInviteBlacklist,
    removeInviteBlacklist,
    getInviteBlacklist,
};
