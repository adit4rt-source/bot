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
    return db.prepare('SELECT * FROM farm_plots WHERE userId = ?').all(userId);
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

module.exports = { getFarmData, getFarmSlots, getPlots, getStorage, addStorage, removeStorage, getStorageQty };
