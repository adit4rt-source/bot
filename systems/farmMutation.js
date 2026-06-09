// systems/farmMutation.js — Crop Mutation System + Prestige Crops + Seed Upgrade + Rotation Bonus
// Mutations happen at harvest time. Prestige crops are ultra-rare long-grow plants.

const { db, getUserStat, incrementUserStat } = require('../database');
const { getRandomInt } = require('../utils');
const { getWeatherMutationBonus } = require('./farmWeather');

// ==================== MUTATION DATA ====================
// Every crop can mutate into a "Golden" or "Crystal" version worth 10x-25x.
// Mutations are a VERY RARE jackpot bonus — total base chance ~2% (tightened
// again from ~4%). Multipliers unchanged. NOTE: any flavor text shown to players
// elsewhere may quote higher "chance %" numbers — those are cosmetic hype, not
// the real odds defined here.
const MUTATION_TYPES = [
    { id: 'golden', prefix: 'Golden', emoji: '✨', multiplier: 5, chance: 0.007, color: '#FFD700' },
    { id: 'crystal', prefix: 'Crystal', emoji: '💎', multiplier: 8, chance: 0.002, color: '#B9F2FF' },
    { id: 'shadow', prefix: 'Shadow', emoji: '🌑', multiplier: 6, chance: 0.004, color: '#2C2F33' },
    { id: 'rainbow', prefix: 'Rainbow', emoji: '🌈', multiplier: 10, chance: 0.0006, color: '#FF69B4' },
];

// Maximum money a single mutation can give (hard cap to prevent economy breaking)

// ==================== PRESTIGE CROPS ====================
// Ultra-rare crops that take 24-48 hours but sell for massive amounts
const PRESTIGE_CROPS = [
    { id: 'golden_lotus', name: 'Golden Lotus', emoji: '🪷✨', tier: 'Prestige', cost: 15000, time: 1440, minYield: 1, maxYield: 1, sellPrice: 25000, desc: 'Bunga suci berlapis emas. Butuh 24 jam.', seasons: { spring: 'off', summer: 'off', autumn: 'peak', winter: 'off' } },
    { id: 'void_rose', name: 'Void Rose', emoji: '🌹🌑', tier: 'Prestige', cost: 20000, time: 1800, minYield: 1, maxYield: 1, sellPrice: 40000, desc: 'Mawar dari dimensi kegelapan. Butuh 30 jam.', seasons: { spring: 'off', summer: 'off', autumn: 'peak', winter: 'off' } },
    { id: 'celestial_tree', name: 'Celestial Tree', emoji: '🌳⭐', tier: 'Prestige', cost: 30000, time: 2160, minYield: 1, maxYield: 1, sellPrice: 65000, desc: 'Pohon langit yang memancarkan cahaya. 36 jam.', seasons: { spring: 'off', summer: 'off', autumn: 'peak', winter: 'off' } },
    { id: 'phoenix_flower', name: 'Phoenix Flower', emoji: '🌺🔥', tier: 'Prestige', cost: 25000, time: 1920, minYield: 1, maxYield: 2, sellPrice: 50000, desc: 'Bunga api yang tidak pernah mati. 32 jam.', seasons: { spring: 'off', summer: 'off', autumn: 'peak', winter: 'off' } },
    { id: 'time_blossom', name: 'Time Blossom', emoji: '🌸⌛', tier: 'Prestige', cost: 50000, time: 2880, minYield: 1, maxYield: 1, sellPrice: 120000, desc: 'Bunga waktu — paling langka. Butuh 48 jam penuh!', seasons: { spring: 'off', summer: 'off', autumn: 'peak', winter: 'off' } },
];

// ==================== SEED UPGRADE TIERS ====================
// Balance: seed is a MODERATE yield contributor (capped system fills +100% from
// many sources), so its identity is the unique +mutation-chance boost. Costs are
// meaningful because the upgrade is permanent per-user (buy once, applies forever).
const SEED_UPGRADES = [
    { level: 0, name: 'Normal Seed', emoji: '🌱', yieldBonus: 0, mutationBonus: 0, cost: 0 },
    { level: 1, name: 'Enhanced Seed', emoji: '🌱✨', yieldBonus: 0.10, mutationBonus: 0.02, cost: 5000 },
    { level: 2, name: 'Premium Seed', emoji: '🌱💎', yieldBonus: 0.20, mutationBonus: 0.05, cost: 25000 },
    { level: 3, name: 'Legendary Seed', emoji: '🌱🌟', yieldBonus: 0.35, mutationBonus: 0.10, cost: 100000 },
];

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS farm_mutations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    userId TEXT,
    cropId TEXT,
    mutationType TEXT,
    harvestedAt INTEGER
)`);

db.exec(`CREATE TABLE IF NOT EXISTS crop_rotation (
    guildId TEXT,
    userId TEXT,
    plotId INTEGER,
    lastCropId TEXT,
    rotationCount INTEGER DEFAULT 0,
    PRIMARY KEY(guildId, userId, plotId)
)`);

// ==================== ROLL MUTATION ====================
function rollMutation(guildId, userId, seedLevel = 0) {
    const weatherBonus = getWeatherMutationBonus();      // e.g. 0.05 (foggy) / 0.10 (rainbow)
    const seedUpgrade = SEED_UPGRADES[seedLevel] || SEED_UPGRADES[0];
    const seedBonus = seedUpgrade.mutationBonus;          // e.g. 0.02 .. 0.10
    const extra = weatherBonus + seedBonus;               // flat bonus to the TOTAL chance

    // Bug fix: the old code added `extra` to EVERY tier, so a +10% rainbow bonus
    // turned four ~2% tiers into ~12% each (~42% total!). Instead we add the bonus
    // to the TOTAL once and distribute it proportionally across tiers, preserving
    // their rarity ratios. So "+10% mutation chance" honestly means total ~4% -> ~14%.
    const baseTotal = MUTATION_TYPES.reduce((s, m) => s + m.chance, 0);
    const scale = baseTotal > 0 ? (baseTotal + extra) / baseTotal : 1;

    // Try each mutation type (rarest first)
    const sorted = [...MUTATION_TYPES].sort((a, b) => a.chance - b.chance);
    for (const mutation of sorted) {
        const totalChance = mutation.chance * scale;
        if (Math.random() < totalChance) {
            return mutation;
        }
    }
    return null; // No mutation
}

// ==================== CALCULATE YIELD WITH BONUSES ====================
function calculateHarvestYield(crop, options = {}) {
    const { weatherYieldMult = 1, fertYieldBonus = 0, seedLevel = 0, rotationBonus = 0, petFarmBonus = 0, toolBonus = 0 } = options;
    const seedUpgrade = SEED_UPGRADES[seedLevel] || SEED_UPGRADES[0];

    let baseYield = getRandomInt(crop.minYield, crop.maxYield);

    // Apply bonuses. All additive yield bonuses (fertilizer, seed, rotation, tool,
    // pet) are summed and CAPPED at +100% so stacking everything can't exceed a 2x
    // multiplier. Weather is kept SEPARATE (outside the cap) as a multiplicative
    // modifier so rare weather events can still push beyond the cap.
    const MAX_YIELD_BONUS = 1.0; // +100%
    const bonusSum = fertYieldBonus + seedUpgrade.yieldBonus + rotationBonus + toolBonus + (petFarmBonus / 100);
    const totalMultiplier = (1 + Math.min(bonusSum, MAX_YIELD_BONUS)) * weatherYieldMult;

    const finalYield = Math.max(1, Math.floor(baseYield * totalMultiplier));
    return finalYield;
}

// ==================== CROP ROTATION ====================
function getRotationBonus(guildId, userId, plotId, currentCropId) {
    const row = db.prepare('SELECT * FROM crop_rotation WHERE guildId = ? AND userId = ? AND plotId = ?').get(guildId, userId, plotId);

    if (!row) return 0;
    if (row.lastCropId === currentCropId) {
        // Same crop = no bonus, reset count
        return 0;
    }

    // Different crop = rotation bonus! (+5% per consecutive different crop, max +20%)
    const bonus = Math.min(0.20, row.rotationCount * 0.05);
    return bonus;
}

function updateRotation(guildId, userId, plotId, cropId) {
    const row = db.prepare('SELECT * FROM crop_rotation WHERE guildId = ? AND userId = ? AND plotId = ?').get(guildId, userId, plotId);

    if (!row) {
        db.prepare('INSERT INTO crop_rotation (guildId, userId, plotId, lastCropId, rotationCount) VALUES (?, ?, ?, ?, 1)').run(guildId, userId, plotId, cropId);
    } else if (row.lastCropId !== cropId) {
        // Different crop = increment rotation count
        const newCount = Math.min(4, row.rotationCount + 1);
        db.prepare('UPDATE crop_rotation SET lastCropId = ?, rotationCount = ? WHERE guildId = ? AND userId = ? AND plotId = ?').run(cropId, newCount, guildId, userId, plotId);
    } else {
        // Same crop = reset rotation
        db.prepare('UPDATE crop_rotation SET rotationCount = 0 WHERE guildId = ? AND userId = ? AND plotId = ?').run(guildId, userId, plotId);
    }
}

// ==================== LOG MUTATION ====================
function logMutation(guildId, userId, cropId, mutationType) {
    db.prepare('INSERT INTO farm_mutations (guildId, userId, cropId, mutationType, harvestedAt) VALUES (?, ?, ?, ?, ?)').run(guildId, userId, cropId, mutationType, Date.now());
    incrementUserStat(guildId, userId, 'total_mutations');
    incrementUserStat(guildId, userId, `mutation_${mutationType}`);
}

// ==================== GET MUTATION STATS ====================
function getMutationStats(guildId, userId) {
    const total = getUserStat(guildId, userId, 'total_mutations') || 0;
    const golden = getUserStat(guildId, userId, 'mutation_golden') || 0;
    const crystal = getUserStat(guildId, userId, 'mutation_crystal') || 0;
    const shadow = getUserStat(guildId, userId, 'mutation_shadow') || 0;
    const rainbow = getUserStat(guildId, userId, 'mutation_rainbow') || 0;
    return { total, golden, crystal, shadow, rainbow };
}

// ==================== EXPORTS ====================
module.exports = {
    MUTATION_TYPES,
    PRESTIGE_CROPS,
    SEED_UPGRADES,
    rollMutation,
    calculateHarvestYield,
    getRotationBonus,
    updateRotation,
    logMutation,
    getMutationStats
};
