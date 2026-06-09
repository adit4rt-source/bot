// systems/inviteRewards.js — Tiered Invite Rewards
// When a member's VALID invite count crosses a milestone, the inviter is granted
// money + items (and optionally a role configured per-server). Each tier is granted
// exactly once (tracked in invite_rewards_claimed), so re-counting on every join is
// idempotent. Designed to ride on top of inviteTracker (which records the invites).
const { EmbedBuilder } = require('discord.js');
const { db, getOrCreateUser, addItem, addIncome } = require('../database');

// ==================== SCHEMA ====================
db.exec(`CREATE TABLE IF NOT EXISTS invite_rewards_claimed (guildId TEXT, userId TEXT, tier INTEGER, claimedAt INTEGER, PRIMARY KEY(guildId, userId, tier))`);

// ==================== TIER DEFINITIONS ====================
// `invites` = number of VALID invites required (fake/left excluded — see getInviterStats).
// `items`   = array of { id, qty } granted from data/items.js.
// `roleKey` = invite_settings key holding an optional role id the admin can configure.
const INVITE_TIERS = [
    { invites: 1,   money: 1000,   items: [{ id: 'mystery_box', qty: 1 }],                                   label: 'Pengajak Pemula',  emoji: '🌱', roleKey: 'invite_reward_role_1' },
    { invites: 3,   money: 3000,   items: [{ id: 'mystery_box', qty: 2 }],                                   label: 'Perekrut Aktif',   emoji: '🤝', roleKey: 'invite_reward_role_3' },
    { invites: 5,   money: 6000,   items: [{ id: 'lucky_charm', qty: 1 }, { id: 'daily_doubler', qty: 1 }],   label: 'Magnet Teman',     emoji: '🧲', roleKey: 'invite_reward_role_5' },
    { invites: 10,  money: 15000,  items: [{ id: 'xp_booster_2x', qty: 2 }, { id: 'mystery_box', qty: 3 }],   label: 'Duta Server',      emoji: '📣', roleKey: 'invite_reward_role_10' },
    { invites: 25,  money: 40000,  items: [{ id: 'streak_shield', qty: 1 }, { id: 'lucky_charm', qty: 2 }],   label: 'Legenda Rekrutmen', emoji: '🏆', roleKey: 'invite_reward_role_25' },
    { invites: 50,  money: 100000, items: [{ id: 'money_magnet', qty: 2 }, { id: 'xp_booster_3x', qty: 1 }],  label: 'Raja Undangan',    emoji: '👑', roleKey: 'invite_reward_role_50' },
];

function getTiers() { return INVITE_TIERS; }

// ==================== CLAIM TRACKING ====================
function getClaimedTiers(guildId, userId) {
    try {
        return db.prepare('SELECT tier FROM invite_rewards_claimed WHERE guildId = ? AND userId = ?').all(guildId, userId).map(r => r.tier);
    } catch (_) { return []; }
}

function markTierClaimed(guildId, userId, tier) {
    db.prepare('INSERT OR IGNORE INTO invite_rewards_claimed (guildId, userId, tier, claimedAt) VALUES (?, ?, ?, ?)').run(guildId, userId, tier, Date.now());
}

// ==================== GRANT LOGIC ====================
// Grant every tier the inviter has newly reached. `validInvites` is the inviter's
// current count of valid invites (caller passes it to avoid a circular require on
// inviteTracker). Returns an array of tier objects that were just awarded.
function grantTierRewards(guild, inviterId, validInvites) {
    if (!guild || !inviterId || !Number.isFinite(validInvites)) return [];
    const guildId = guild.id;
    const claimed = new Set(getClaimedTiers(guildId, inviterId));
    const newlyGranted = [];

    for (const tier of INVITE_TIERS) {
        if (validInvites < tier.invites || claimed.has(tier.invites)) continue;

        // Money
        getOrCreateUser(guildId, inviterId);
        if (tier.money > 0) {
            db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(tier.money, guildId, inviterId);
            try { addIncome(guildId, inviterId, 'invite_reward', tier.money); } catch (_) {}
        }
        // Items
        for (const it of (tier.items || [])) {
            try { addItem(guildId, inviterId, it.id, it.qty); } catch (_) {}
        }
        // Optional configured role (best-effort, never throws)
        try {
            const roleId = getInviteSettingSafe(guildId, tier.roleKey);
            if (roleId && guild.members) {
                const m = guild.members.cache && guild.members.cache.get(inviterId);
                const role = guild.roles && guild.roles.cache && guild.roles.cache.get(roleId);
                if (m && role) m.roles.add(role).catch(() => {});
            }
        } catch (_) {}

        markTierClaimed(guildId, inviterId, tier.invites);
        newlyGranted.push(tier);
    }
    return newlyGranted;
}

// Read an invite_settings value without importing inviteTracker (avoids a cycle).
function getInviteSettingSafe(guildId, key) {
    try {
        const row = db.prepare('SELECT value FROM invite_settings WHERE guildId = ? AND key = ?').get(guildId, key);
        return row ? row.value : null;
    } catch (_) { return null; }
}

// ==================== ANNOUNCE / DM ====================
function buildRewardEmbed(inviterId, tier, validInvites) {
    const itemDefs = (() => { try { return require('../data/items'); } catch (_) { return []; } })();
    const itemList = (tier.items || []).map(it => {
        const def = Array.isArray(itemDefs) ? itemDefs.find(d => d.id === it.id) : null;
        const name = def ? def.name : it.id;
        const emoji = def ? (def.menuEmoji || '') : '';
        return `> ${emoji} ${name} ×${it.qty}`;
    }).join('\n');

    return new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`${tier.emoji} Invite Reward — ${tier.label}!`)
        .setDescription(
            `🎉 <@${inviterId}> mencapai **${tier.invites} undangan valid** dan membuka hadiah:\n\n` +
            `> 🪙 **${tier.money.toLocaleString('id-ID')} Money**\n` +
            (itemList ? itemList + '\n' : '') +
            `\n📨 Total undangan valid: **${validInvites}**`
        )
        .setFooter({ text: 'Ajak lebih banyak teman untuk buka tier berikutnya!' })
        .setTimestamp();
}

// Process rewards on a new join, then announce in the invite channel (if set) and DM
// the inviter. Safe to call unconditionally; does nothing when no tier is reached.
async function processInviteJoinRewards(guild, inviterId, validInvites, announceChannelId) {
    const granted = grantTierRewards(guild, inviterId, validInvites);
    if (!granted.length) return granted;

    for (const tier of granted) {
        const embed = buildRewardEmbed(inviterId, tier, validInvites);
        // Channel announcement
        if (announceChannelId && guild.channels && guild.channels.cache) {
            const ch = guild.channels.cache.get(announceChannelId);
            if (ch) ch.send({ embeds: [embed] }).catch(() => {});
        }
        // DM the inviter (best-effort)
        try {
            const member = guild.members && guild.members.cache && guild.members.cache.get(inviterId);
            if (member) member.send({ embeds: [embed] }).catch(() => {});
        } catch (_) {}
    }
    return granted;
}

module.exports = {
    INVITE_TIERS,
    getTiers,
    getClaimedTiers,
    markTierClaimed,
    grantTierRewards,
    buildRewardEmbed,
    processInviteJoinRewards,
};
