// systems/farmMastery.js — Farm Mastery Rank + Crop Mastery
const { db, getUserStat, setUserStat } = require('../database');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

db.exec(`CREATE TABLE IF NOT EXISTS farm_mastery (
    userId TEXT PRIMARY KEY,
    xp INTEGER DEFAULT 0,
    rank INTEGER DEFAULT 0
)`);
db.exec(`CREATE TABLE IF NOT EXISTS farm_crop_mastery (
    userId TEXT, cropId TEXT, harvests INTEGER DEFAULT 0,
    PRIMARY KEY(userId, cropId)
)`);

const MAX_RANK = 50;
function xpForRank(rank) { return 35 + rank * 20 + Math.floor(rank * rank * 1.2); }

function getMastery(userId) {
    let row = db.prepare('SELECT * FROM farm_mastery WHERE userId = ?').get(userId);
    if (!row) {
        db.prepare('INSERT INTO farm_mastery (userId) VALUES (?)').run(userId);
        row = { userId, xp: 0, rank: 0 };
    }
    return row;
}

function getMasteryBonuses(userId) {
    const r = getMastery(userId).rank || 0;
    return {
        rank: r,
        yieldBonus: Math.min(25, Math.floor(r * 0.4)), // % yield
        mutBonus: Math.min(0.08, r * 0.0015), // flat mutation chance
        growSpeed: Math.min(0.15, r * 0.0025), // grow time reduction fraction
        livestockYield: Math.min(20, Math.floor(r * 0.3)),
        title: r >= 50 ? '👑 Agri Lord' : r >= 40 ? '🌾 Grand Farmer' : r >= 25 ? '🏡 Estate Owner' : r >= 10 ? '🌱 Planter' : r >= 1 ? '🪴 Novice' : null,
    };
}

function addMasteryXp(userId, amount) {
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
    db.prepare('UPDATE farm_mastery SET xp = ?, rank = ? WHERE userId = ?').run(xp, rank, userId);
    return { leveled, newRank: rank, xp, need: xpForRank(rank) };
}

function recordHarvest(userId, cropId, qty, mutation) {
    let xp = 3 + Math.min(20, qty);
    if (mutation) xp += 15;
    const tierXp = { Common: 0, Uncommon: 2, Rare: 5, Epic: 10, Legendary: 20, Prestige: 40, Mythic: 30 };
    try {
        const { FARM_CROPS } = require('../data/farming');
        const { PRESTIGE_CROPS } = require('./farmMutation');
        const c = FARM_CROPS.find(x => x.id === cropId) || PRESTIGE_CROPS.find(x => x.id === cropId);
        if (c) xp += tierXp[c.tier] || 0;
    } catch (_) {}
    db.prepare(`INSERT INTO farm_crop_mastery (userId, cropId, harvests) VALUES (?, ?, ?)
        ON CONFLICT(userId, cropId) DO UPDATE SET harvests = harvests + ?`).run(userId, cropId, qty, qty);
    return addMasteryXp(userId, xp);
}

function getCropMastery(userId, cropId) {
    const row = db.prepare('SELECT harvests FROM farm_crop_mastery WHERE userId = ? AND cropId = ?').get(userId, cropId);
    const h = row ? row.harvests : 0;
    // Every 50 harvests of same crop = +1% yield that crop, max +15%
    return { harvests: h, yieldBonus: Math.min(15, Math.floor(h / 50)) };
}

function buildMasteryEmbed(userId, username) {
    const m = getMastery(userId);
    const b = getMasteryBonuses(userId);
    const need = xpForRank(m.rank);
    const filled = need > 0 ? Math.min(12, Math.floor((m.xp / need) * 12)) : 12;
    const bar = '█'.repeat(filled) + '░'.repeat(12 - filled);
    const top = db.prepare('SELECT * FROM farm_crop_mastery WHERE userId = ? ORDER BY harvests DESC LIMIT 6').all(userId);
    let cropLines = top.length
        ? top.map(t => {
            const cm = getCropMastery(userId, t.cropId);
            return `> \`${t.cropId}\` — **${t.harvests}** panen (+${cm.yieldBonus}% yield crop)`;
        }).join('\n')
        : '> *Belum ada data crop*';

    return new EmbedBuilder()
        .setTitle(`🏅 Farm Mastery — ${username}`)
        .setColor('#2ECC71')
        .setDescription(
            `**Rank ${m.rank}/${MAX_RANK}** ${b.title ? `— ${b.title}` : ''}\n` +
            `XP: \`${bar}\` **${m.xp}/${need}**\n\n` +
            `**Bonus aktif:**\n` +
            `> 🌾 Yield +**${b.yieldBonus}%**\n` +
            `> 🧬 Mutation +**${(b.mutBonus * 100).toFixed(2)}%**\n` +
            `> ⏱️ Grow speed +**${(b.growSpeed * 100).toFixed(1)}%** (lebih cepat)\n` +
            `> 🐄 Livestock yield +**${b.livestockYield}%**\n\n` +
            `**Crop Mastery (top):**\n${cropLines}\n\n` +
            `-# 50 panen/crop = +1% yield crop itu (max +15%).`
        );
}

module.exports = {
    MAX_RANK, xpForRank, getMastery, getMasteryBonuses, addMasteryXp,
    recordHarvest, getCropMastery, buildMasteryEmbed,
};
