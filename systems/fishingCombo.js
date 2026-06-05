// systems/fishingCombo.js — Fishing Combo + Treasure/Loot System
// Combo: cast berturut-turut tanpa jeda >2 menit = multiplier naik
// Treasure: 5% chance dapat item random saat mancing

const { db, getUserStat, incrementUserStat, addItem } = require('../database');
const { getRandomInt } = require('../utils');

// ==================== COMBO CONFIG ====================
const COMBO_TIMEOUT = 2 * 60 * 1000; // 2 menit — break combo jika lebih dari ini
const COMBO_TIERS = [
    { min: 1, mult: 1.0, label: '' },
    { min: 3, mult: 1.2, label: '🔥 x3 (+20%)' },
    { min: 5, mult: 1.5, label: '🔥🔥 x5 (+50%)' },
    { min: 8, mult: 1.8, label: '🔥🔥🔥 x8 (+80%)' },
    { min: 10, mult: 2.0, label: '💥 x10 (2x!)' },
    { min: 15, mult: 2.5, label: '💥💥 x15 (2.5x!!)' },
    { min: 20, mult: 3.0, label: '⚡ x20 (3x!!!)' },
];

// ==================== TREASURE DROPS ====================
const TREASURE_DROPS = [
    // Common drops (total ~60%)
    { id: 'mystery_box', name: 'Mystery Box', emoji: '📦', chance: 20, category: 'common' },
    { id: 'rod_part', name: 'Rod Parts', emoji: '🔧', chance: 15, category: 'common' },
    { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', chance: 12, category: 'common' },
    // Uncommon drops (total ~25%)
    { id: 'lucky_charm', name: 'Lucky Charm', emoji: '🍀', chance: 8, category: 'uncommon' },
    { id: 'xp_booster_2x', name: 'XP Booster 2x', emoji: '⚡', chance: 7, category: 'uncommon' },
    { id: 'money_magnet', name: 'Money Magnet', emoji: '🧲', chance: 5, category: 'uncommon' },
    { id: 'streak_shield', name: 'Streak Shield', emoji: '🛡️', chance: 5, category: 'uncommon' },
    // Rare drops (total ~12%)
    { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡⚡', chance: 5, category: 'rare' },
    { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', chance: 4, category: 'rare' },
    { id: 'pesticide_shield', name: 'Pestisida Shield', emoji: '🌿', chance: 3, category: 'rare' },
    // Ultra rare drops (total ~3%)
    { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', chance: 2, category: 'legendary' },
    { id: 'awakening_crystal', name: 'Awakening Crystal', emoji: '💫', chance: 0.5, category: 'mythic' },
];

const BASE_TREASURE_CHANCE = 0.05; // 5% base chance per cast

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS fishing_combo (
    guildId TEXT,
    userId TEXT,
    combo INTEGER DEFAULT 0,
    lastCast INTEGER DEFAULT 0,
    maxCombo INTEGER DEFAULT 0,
    PRIMARY KEY(guildId, userId)
)`);

// ==================== GET/UPDATE COMBO ====================
function getFishingCombo(guildId, userId) {
    let row = db.prepare('SELECT * FROM fishing_combo WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!row) {
        db.prepare('INSERT INTO fishing_combo (guildId, userId, combo, lastCast, maxCombo) VALUES (?, ?, 0, 0, 0)').run(guildId, userId);
        row = { combo: 0, lastCast: 0, maxCombo: 0 };
    }
    return row;
}

function updateFishingCombo(guildId, userId) {
    const now = Date.now();
    const row = getFishingCombo(guildId, userId);

    let newCombo;
    if (now - row.lastCast > COMBO_TIMEOUT) {
        // Combo broken! Reset to 1
        newCombo = 1;
    } else {
        // Continue combo!
        newCombo = row.combo + 1;
    }

    const newMax = Math.max(row.maxCombo, newCombo);
    db.prepare('UPDATE fishing_combo SET combo = ?, lastCast = ?, maxCombo = ? WHERE guildId = ? AND userId = ?').run(newCombo, now, newMax, guildId, userId);

    return { combo: newCombo, maxCombo: newMax };
}

// ==================== GET COMBO MULTIPLIER ====================
function getComboFishMultiplier(combo) {
    let tier = COMBO_TIERS[0];
    for (const t of COMBO_TIERS) {
        if (combo >= t.min) tier = t;
    }
    return tier;
}

// ==================== ROLL TREASURE ====================
function rollTreasure(combo) {
    // Higher combo = higher treasure chance (5% base + 1% per 5 combo)
    const bonusChance = Math.floor(combo / 5) * 0.01;
    const totalChance = BASE_TREASURE_CHANCE + bonusChance;

    if (Math.random() > totalChance) return null; // No treasure

    // Roll which treasure
    const totalWeight = TREASURE_DROPS.reduce((sum, d) => sum + d.chance, 0);
    let roll = Math.random() * totalWeight;
    for (const drop of TREASURE_DROPS) {
        roll -= drop.chance;
        if (roll <= 0) return drop;
    }
    return TREASURE_DROPS[0]; // fallback
}

// ==================== APPLY TREASURE ====================
function applyTreasure(guildId, userId, treasure) {
    if (!treasure) return;
    addItem(guildId, userId, treasure.id, 1);
    incrementUserStat(guildId, userId, 'fishing_treasures_found');
}

// ==================== FORMAT COMBO DISPLAY ====================
function formatComboDisplay(combo) {
    const tier = getComboFishMultiplier(combo);
    if (combo < 3) return '';
    return `\n> ${tier.label}`;
}

// ==================== FORMAT TREASURE DISPLAY ====================
function formatTreasureDisplay(treasure) {
    if (!treasure) return '';
    const categoryColors = { common: '', uncommon: '✨', rare: '🌟', legendary: '💫', mythic: '🏆' };
    return `\n> ${categoryColors[treasure.category] || ''} 📦 **TREASURE!** ${treasure.emoji} **${treasure.name}** ditemukan!`;
}

// ==================== EXPORTS ====================
module.exports = {
    COMBO_TIERS,
    COMBO_TIMEOUT,
    TREASURE_DROPS,
    BASE_TREASURE_CHANCE,
    getFishingCombo,
    updateFishingCombo,
    getComboFishMultiplier,
    rollTreasure,
    applyTreasure,
    formatComboDisplay,
    formatTreasureDisplay
};
