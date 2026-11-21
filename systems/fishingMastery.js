// systems/fishingMastery.js — Fishing Mastery Rank + Location Mastery + Soft Pity
const { db, getUserStat, setUserStat, incrementUserStat } = require('../database');

db.exec(`CREATE TABLE IF NOT EXISTS fishing_mastery (
    userId TEXT PRIMARY KEY,
    xp INTEGER DEFAULT 0,
    rank INTEGER DEFAULT 0,
    pityRare INTEGER DEFAULT 0,
    pityEpic INTEGER DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS fishing_loc_mastery (
    userId TEXT,
    locationId TEXT,
    casts INTEGER DEFAULT 0,
    PRIMARY KEY(userId, locationId)
)`);

const MAX_RANK = 50;
function xpForRank(rank) {
    // Rank 0→1 needs 50, scales up
    return 40 + rank * 25 + Math.floor(rank * rank * 1.5);
}

function getMastery(userId) {
    let row = db.prepare('SELECT * FROM fishing_mastery WHERE userId = ?').get(userId);
    if (!row) {
        db.prepare('INSERT INTO fishing_mastery (userId) VALUES (?)').run(userId);
        row = { userId, xp: 0, rank: 0, pityRare: 0, pityEpic: 0 };
    }
    return row;
}

function getMasteryBonuses(userId) {
    const m = getMastery(userId);
    const r = m.rank || 0;
    return {
        rank: r,
        rareBonus: Math.floor(r * 0.35),       // +0.35% rare per rank (max ~17.5)
        trophyChance: Math.min(8, Math.floor(r / 8)), // up to +8% trophy tilt
        treasureBonus: Math.min(0.04, r * 0.0008), // up to +4% treasure chance absolute
        title: r >= 50 ? '🌊 Ocean Sovereign' : r >= 40 ? '⚓ Grand Admiral' : r >= 25 ? '🦈 Deep Hunter' : r >= 10 ? '🎣 Seasoned Angler' : r >= 1 ? '🐟 Fisher' : null,
    };
}

/**
 * Award mastery XP after a cast. Returns { leveled, newRank, xpGained } if rank up.
 */
function addMasteryXp(userId, amount, meta = {}) {
    const m = getMastery(userId);
    let xp = (m.xp || 0) + amount;
    let rank = m.rank || 0;
    let leveled = false;
    while (rank < MAX_RANK && xp >= xpForRank(rank)) {
        xp -= xpForRank(rank);
        rank++;
        leveled = true;
    }
    if (rank >= MAX_RANK) xp = Math.min(xp, xpForRank(MAX_RANK - 1));
    db.prepare('UPDATE fishing_mastery SET xp = ?, rank = ? WHERE userId = ?').run(xp, rank, userId);
    return { leveled, newRank: rank, xpGained: amount, xp, need: xpForRank(rank) };
}

function recordCastMastery(userId, locationId, tier) {
    // XP by tier
    const tierXp = {
        Trash: 1, Common: 2, Uncommon: 3, Rare: 6, Epic: 12,
        Legendary: 20, Mythic: 35, Secret: 50, God: 80,
    };
    let xp = tierXp[tier] || 2;
    if (metaTrophy(tier)) xp += 5;
    const result = addMasteryXp(userId, xp, { tier, locationId });

    // Location mastery
    db.prepare(`INSERT INTO fishing_loc_mastery (userId, locationId, casts) VALUES (?, ?, 1)
        ON CONFLICT(userId, locationId) DO UPDATE SET casts = casts + 1`).run(userId, locationId);

    // Soft pity counters
    const rareTiers = ['Rare', 'Epic', 'Legendary', 'Mythic', 'Secret', 'God'];
    const epicPlus = ['Epic', 'Legendary', 'Mythic', 'Secret', 'God'];
    const m = getMastery(userId);
    let pityRare = m.pityRare || 0;
    let pityEpic = m.pityEpic || 0;
    if (rareTiers.includes(tier)) pityRare = 0;
    else pityRare++;
    if (epicPlus.includes(tier)) pityEpic = 0;
    else pityEpic++;
    db.prepare('UPDATE fishing_mastery SET pityRare = ?, pityEpic = ? WHERE userId = ?').run(pityRare, pityEpic, userId);

    return { ...result, pityRare, pityEpic };
}

function metaTrophy() { return false; }

function getLocationMastery(userId, locationId) {
    const row = db.prepare('SELECT casts FROM fishing_loc_mastery WHERE userId = ? AND locationId = ?').get(userId, locationId);
    const casts = row ? row.casts : 0;
    // Every 100 casts = +1% rare at that location, cap +10%
    const rareBonus = Math.min(10, Math.floor(casts / 100));
    return { casts, rareBonus, nextAt: (Math.floor(casts / 100) + 1) * 100 };
}

/** Soft pity: after N dry casts without Rare+, bump rareBonus flat points */
function getPityRareBonus(userId) {
    const m = getMastery(userId);
    const p = m.pityRare || 0;
    // After 40 dry casts, +1 per 10 casts, soft cap +12
    if (p < 40) return 0;
    return Math.min(12, Math.floor((p - 40) / 10) + 1);
}

function getPityEpicBonus(userId) {
    const m = getMastery(userId);
    const p = m.pityEpic || 0;
    if (p < 80) return 0;
    return Math.min(8, Math.floor((p - 80) / 15) + 1);
}

function buildMasteryEmbed(userId, username) {
    const { EmbedBuilder } = require('discord.js');
    const m = getMastery(userId);
    const b = getMasteryBonuses(userId);
    const need = xpForRank(m.rank);
    const barLen = 12;
    const filled = need > 0 ? Math.min(barLen, Math.floor((m.xp / need) * barLen)) : barLen;
    const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
    const locs = db.prepare('SELECT * FROM fishing_loc_mastery WHERE userId = ? ORDER BY casts DESC LIMIT 8').all(userId);

    let locLines = locs.length
        ? locs.map(l => {
            const lm = getLocationMastery(userId, l.locationId);
            return `> 📍 \`${l.locationId}\` — **${l.casts}** cast (+${lm.rareBonus}% rare lokal)`;
        }).join('\n')
        : '> *Belum ada data lokasi*';

    return new EmbedBuilder()
        .setTitle(`🏅 Fishing Mastery — ${username}`)
        .setColor('#1ABC9C')
        .setDescription(
            `**Rank ${m.rank}/${MAX_RANK}** ${b.title ? `— ${b.title}` : ''}\n` +
            `XP: \`${bar}\` **${m.xp}/${need}**\n\n` +
            `**Bonus aktif:**\n` +
            `> 🍀 Rare +**${b.rareBonus}%**\n` +
            `> 🏆 Trophy tilt +**${b.trophyChance}%**\n` +
            `> 📦 Treasure chance +**${(b.treasureBonus * 100).toFixed(1)}%**\n\n` +
            `**Soft Pity:** dry rare ${m.pityRare} | dry epic+ ${m.pityEpic}\n` +
            `> Pity rare bonus: +${getPityRareBonus(userId)}% · epic +${getPityEpicBonus(userId)}%\n\n` +
            `**Location Mastery (top):**\n${locLines}\n\n` +
            `-# Cast naikin rank. 100 cast/zona = +1% rare di zona itu (max +10%).`
        );
}

module.exports = {
    MAX_RANK, xpForRank, getMastery, getMasteryBonuses, addMasteryXp, recordCastMastery,
    getLocationMastery, getPityRareBonus, getPityEpicBonus, buildMasteryEmbed,
};
