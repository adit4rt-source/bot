// systems/inviteTracker.js — Invite Tracking System
// Tracks who invited whom, invite counts, and leaderboard.
const { EmbedBuilder } = require('discord.js');
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
    const keys = ['invite_enabled', 'invite_channel', 'invite_message', 'invite_fake_threshold', 'invite_leave_deduct'];
    const defaults = {
        invite_enabled: '1',
        invite_channel: '',
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
        const invites = await guild.invites.fetch();
        const cacheMap = new Map();
        invites.forEach(inv => cacheMap.set(inv.code, inv.uses || 0));
        inviteCache.set(guild.id, cacheMap);
    } catch (e) {
        // Bot might not have MANAGE_GUILD permission
    }
}

async function cacheAllGuildInvites(client) {
    for (const [, guild] of client.guilds.cache) {
        await cacheGuildInvites(guild);
    }
}

// ==================== MEMBER JOIN HANDLER ====================
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
                            .setColor('#7289DA')
                            .setDescription(`**${member.user.username}** joined using a vanity invite. (discord.gg/${vanityData.code})`)
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
                    .setDescription(`**${member.user.username}** joined. Inviter <@${inviterUserId}> is blacklisted — invite not counted.`)
                    .setTimestamp();
                channel.send({ embeds: [embed] }).catch(() => {});
            }
        }
        // Still store the record but mark as fake so it doesn't count
        db.prepare('INSERT OR REPLACE INTO invites (guildId, inviterId, invitedId, code, joinedAt, leftAt, fake) VALUES (?, ?, ?, ?, ?, NULL, 1)').run(guildId, inviterUserId, member.id, usedCode, Date.now());
        // Update cache
        return;
    }

    // Check if fake (account age)
    const fakeThreshold = parseInt(getInviteSetting(guildId, 'invite_fake_threshold', '7')) || 7;
    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    const isFake = accountAgeDays < fakeThreshold ? 1 : 0;

    // Store invite record
    db.prepare('INSERT OR REPLACE INTO invites (guildId, inviterId, invitedId, code, joinedAt, leftAt, fake) VALUES (?, ?, ?, ?, ?, NULL, ?)').run(guildId, inviterUserId, member.id, usedCode, Date.now(), isFake);

    const channelId = getInviteSetting(guildId, 'invite_channel', '');

    // Tiered invite rewards — grant any milestone the inviter just crossed (valid
    // invites only). Best-effort: never let a reward error block the join flow.
    if (!isFake) {
        try {
            const { processInviteJoinRewards } = require('./inviteRewards');
            const validInvites = getInviterStats(guildId, inviterUserId).total;
            await processInviteJoinRewards(member.guild, inviterUserId, validInvites, channelId);
        } catch (e) {
            // swallow — invite tracking must keep working even if rewards fail
        }
    }

    // Send announcement
    if (channelId) {
        const channel = member.guild.channels.cache.get(channelId);
        if (channel) {
            const stats = getInviterStats(guildId, inviterUserId);
            const inviterMember = member.guild.members.cache.get(inviterUserId);
            const inviterName = inviterMember ? inviterMember.user.username : inviterUserId;
            
            const embed = new EmbedBuilder()
                .setColor(isFake ? '#FF6B6B' : '#43B581')
                .setDescription(
                    `**Name :** <@${member.id}>\n` +
                    `**Inviter :** ${inviterName}\n` +
                    `**Total Invite :** ${stats.total}\n` +
                    `**Total Member :** ${member.guild.memberCount} Member\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` +
                    (isFake ? `\n⚠️ *Possible fake invite (akun baru < ${fakeThreshold} hari)*` : '')
                )
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
                    .setColor('#FF6B6B')
                    .setDescription(`👋 **${member.user.username}** left. Invited by <@${record.inviterId}> (Now: **${stats.total}** invites)`)
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
        SELECT inviterId as userId, 
            COUNT(CASE WHEN fake = 0 AND leftAt IS NULL THEN 1 END) as total,
            COUNT(CASE WHEN fake = 1 THEN 1 END) as fake,
            COUNT(CASE WHEN leftAt IS NOT NULL AND fake = 0 THEN 1 END) as 'left',
            COUNT(*) as totalAll
        FROM invites WHERE guildId = ? 
        GROUP BY inviterId 
        ORDER BY total DESC LIMIT ?
    `).all(guildId, limit);
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
