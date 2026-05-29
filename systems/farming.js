// systems/farming.js
const { db } = require('../database');
const { FARM_LEVELS } = require('../data/farming');

function getFarmData(guildId, userId) {
    let data = db.prepare('SELECT * FROM farm_data WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!data) { db.prepare('INSERT INTO farm_data (guildId, userId) VALUES (?, ?)').run(guildId, userId); data = { farm_level: 1 }; }
    return data;
}

function getFarmSlots(guildId, userId) {
    const data = getFarmData(guildId, userId);
    return FARM_LEVELS.find(l => l.level === data.farm_level)?.slots || 3;
}

function getPlots(guildId, userId) {
    return db.prepare('SELECT * FROM farm_plots WHERE guildId = ? AND userId = ?').all(guildId, userId);
}

function getStorage(guildId, userId) {
    return db.prepare('SELECT * FROM farm_storage WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, userId);
}

function addStorage(guildId, userId, itemId, qty) {
    const current = db.prepare('SELECT quantity FROM farm_storage WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, itemId);
    if (current) db.prepare('UPDATE farm_storage SET quantity = quantity + ? WHERE guildId = ? AND userId = ? AND itemId = ?').run(qty, guildId, userId, itemId);
    else db.prepare('INSERT INTO farm_storage (guildId, userId, itemId, quantity) VALUES (?, ?, ?, ?)').run(guildId, userId, itemId, qty);
}

function removeStorage(guildId, userId, itemId, qty) {
    const current = db.prepare('SELECT quantity FROM farm_storage WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, itemId);
    if (!current || current.quantity < qty) return false;
    if (current.quantity - qty <= 0) db.prepare('DELETE FROM farm_storage WHERE guildId = ? AND userId = ? AND itemId = ?').run(guildId, userId, itemId);
    else db.prepare('UPDATE farm_storage SET quantity = quantity - ? WHERE guildId = ? AND userId = ? AND itemId = ?').run(qty, guildId, userId, itemId);
    return true;
}

function getStorageQty(guildId, userId, itemId) {
    const r = db.prepare('SELECT quantity FROM farm_storage WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, itemId);
    return r ? r.quantity : 0;
}

module.exports = { getFarmData, getFarmSlots, getPlots, getStorage, addStorage, removeStorage, getStorageQty };
