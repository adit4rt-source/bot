// systems/farming.js
const { db } = require('../database');
const { FARM_LEVELS } = require('../data/farming');

function getFarmData(guildId, userId) {
    let data = db.prepare('SELECT * FROM farm_data WHERE userId = ?').get(userId);
    if (!data) { db.prepare('INSERT INTO farm_data (userId) VALUES (?)').run(userId); data = { farm_level: 1 }; }
    return data;
}

function getFarmSlots(guildId, userId) {
    const data = getFarmData(guildId, userId);
    return FARM_LEVELS.find(l => l.level === data.farm_level)?.slots || 3;
}

function getPlots(guildId, userId) {
    return db.prepare('SELECT * FROM farm_plots WHERE userId = ? AND greenhouse = 0').all(userId);
}

function getStorage(guildId, userId) {
    return db.prepare('SELECT * FROM farm_storage WHERE userId = ? AND quantity > 0').all(userId);
}

function addStorage(guildId, userId, itemId, qty) {
    const current = db.prepare('SELECT quantity FROM farm_storage WHERE userId = ? AND itemId = ?').get(userId, itemId);
    if (current) db.prepare('UPDATE farm_storage SET quantity = quantity + ? WHERE userId = ? AND itemId = ?').run(qty, userId, itemId);
    else db.prepare('INSERT INTO farm_storage (userId, itemId, quantity) VALUES (?, ?, ?)').run(userId, itemId, qty);
}

function removeStorage(guildId, userId, itemId, qty) {
    const current = db.prepare('SELECT quantity FROM farm_storage WHERE userId = ? AND itemId = ?').get(userId, itemId);
    if (!current || current.quantity < qty) return false;
    if (current.quantity - qty <= 0) db.prepare('DELETE FROM farm_storage WHERE userId = ? AND itemId = ?').run(userId, itemId);
    else db.prepare('UPDATE farm_storage SET quantity = quantity - ? WHERE userId = ? AND itemId = ?').run(qty, userId, itemId);
    return true;
}

function getStorageQty(guildId, userId, itemId) {
    const r = db.prepare('SELECT quantity FROM farm_storage WHERE userId = ? AND itemId = ?').get(userId, itemId);
    return r ? r.quantity : 0;
}

// ==================== FARM TOOL (craftable gear) ====================
function getFarmToolLevel(guildId, userId) {
    const { getUserStat } = require('../database');
    return getUserStat(guildId, userId, 'farm_tool_level') || 0;
}

// Harvest-yield multiplier bonus from the farm tool (e.g. level 3 => +0.30).
function getFarmToolYieldBonus(guildId, userId) {
    const { FARM_TOOLS } = require('../data/farming');
    return getFarmToolLevel(guildId, userId) * FARM_TOOLS.yieldPerLevel;
}

// ==================== GREENHOUSE ====================
const GREENHOUSE_COSTS = [
    { level: 1, cost: 150000, slots: 6 },
    { level: 2, cost: 300000, slots: 9 },
    { level: 3, cost: 700000, slots: 12 },
    { level: 4, cost: 1200000, slots: 15 },
];

function getGreenhouseLevel(userId) {
    const row = db.prepare('SELECT level FROM greenhouse WHERE userId = ?').get(userId);
    return row ? row.level : 0;
}

function getGreenhouseSlots(userId) {
    const level = getGreenhouseLevel(userId);
    if (level === 0) return 0;
    const tier = GREENHOUSE_COSTS.find(c => c.level === level);
    return tier ? tier.slots : 0;
}

function upgradeGreenhouse(userId) {
    const current = getGreenhouseLevel(userId);
    const next = current + 1;
    if (next > 3) return false;
    if (current === 0) {
        db.prepare('INSERT OR REPLACE INTO greenhouse (userId, level, purchasedAt) VALUES (?, ?, ?)').run(userId, 1, Date.now());
    } else {
        db.prepare('UPDATE greenhouse SET level = ? WHERE userId = ?').run(next, userId);
    }
    return true;
}

function getGreenhousePlots(guildId, userId) {
    return db.prepare('SELECT * FROM farm_plots WHERE userId = ? AND greenhouse = 1').all(userId);
}

function insertGreenhousePlot(guildId, userId, cropId, plantedAt, wateredAt) {
    db.prepare('INSERT INTO farm_plots (userId, cropId, plantedAt, wateredAt, greenhouse) VALUES (?, ?, ?, ?, 1)').run(userId, cropId, plantedAt, wateredAt);
}

module.exports = { getFarmData, getFarmSlots, getPlots, getStorage, addStorage, removeStorage, getStorageQty, getFarmToolLevel, getFarmToolYieldBonus, getGreenhouseLevel, getGreenhouseSlots, upgradeGreenhouse, getGreenhousePlots, insertGreenhousePlot, GREENHOUSE_COSTS };
