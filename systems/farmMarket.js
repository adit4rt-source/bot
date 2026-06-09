// systems/farmMarket.js — NPC Market Orders (daily rotating buy orders at premium prices)
const { db, getUserStat, incrementUserStat } = require('../database');
const { FARM_CROPS } = require('../data/farming');
const { PRESTIGE_CROPS } = require('./farmMutation');
const { getTodaySeason } = require('./farmSeason');
const { getRandomInt } = require('../utils');

const ALL_CROPS = [...FARM_CROPS, ...PRESTIGE_CROPS];
const MAX_ORDERS = 4;

db.exec(`CREATE TABLE IF NOT EXISTS farm_market_orders (
    date TEXT,
    cropId TEXT,
    qty INTEGER,
    pricePerUnit INTEGER,
    PRIMARY KEY(date, cropId)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS farm_market_fulfilled (
    date TEXT,
    userId TEXT,
    cropId TEXT,
    qtyFilled INTEGER DEFAULT 0,
    PRIMARY KEY(date, userId, cropId)
)`);

function getTodayOrders() {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    let orders = db.prepare('SELECT * FROM farm_market_orders WHERE date = ?').all(today);
    
    if (orders.length === 0) {
        // Generate new daily orders — prefer in-season crops
        const season = getTodaySeason();
        const eligible = ALL_CROPS.filter(c => {
            if (!c.seasons) return true;
            const compat = c.seasons[season.id];
            return compat === 'peak' || compat === 'in';
        });
        
        const shuffled = [...eligible].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, MAX_ORDERS);
        
        for (const crop of selected) {
            const qty = crop.tier === 'Common' ? getRandomInt(10, 20) : 
                       crop.tier === 'Uncommon' ? getRandomInt(8, 15) :
                       crop.tier === 'Rare' ? getRandomInt(5, 10) :
                       crop.tier === 'Epic' ? getRandomInt(3, 6) :
                       crop.tier === 'Legendary' ? getRandomInt(2, 4) :
                       crop.tier === 'Prestige' ? 1 : getRandomInt(5, 10);
            const pricePerUnit = Math.floor(crop.sellPrice * getRandomInt(25, 35) / 10); // 2.5x - 3.5x normal sell price
            db.prepare('INSERT OR REPLACE INTO farm_market_orders (date, cropId, qty, pricePerUnit) VALUES (?, ?, ?, ?)').run(today, crop.id, qty, pricePerUnit);
        }
        orders = db.prepare('SELECT * FROM farm_market_orders WHERE date = ?').all(today);
    }
    
    return orders;
}

function getFulfilledQty(userId, cropId) {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const row = db.prepare('SELECT qtyFilled FROM farm_market_fulfilled WHERE date = ? AND userId = ? AND cropId = ?').get(today, userId, cropId);
    return row ? row.qtyFilled : 0;
}

function fulfillOrder(userId, cropId, qty) {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const order = db.prepare('SELECT * FROM farm_market_orders WHERE date = ? AND cropId = ?').get(today, cropId);
    if (!order) return { success: false, error: 'Order tidak ditemukan!' };
    
    const filled = getFulfilledQty(userId, cropId);
    const remaining = order.qty - filled;
    if (remaining <= 0) return { success: false, error: 'Order sudah terpenuhi!' };
    
    const toFill = Math.min(qty, remaining);
    const totalPrice = toFill * order.pricePerUnit;
    
    // Update fulfilled
    const existing = db.prepare('SELECT 1 FROM farm_market_fulfilled WHERE date = ? AND userId = ? AND cropId = ?').get(today, userId, cropId);
    if (existing) {
        db.prepare('UPDATE farm_market_fulfilled SET qtyFilled = qtyFilled + ? WHERE date = ? AND userId = ? AND cropId = ?').run(toFill, today, userId, cropId);
    } else {
        db.prepare('INSERT INTO farm_market_fulfilled (date, userId, cropId, qtyFilled) VALUES (?, ?, ?, ?)').run(today, userId, cropId, toFill);
    }
    
    return { success: true, filled: toFill, totalPrice, remaining: remaining - toFill };
}

function buildMarketEmbed(userId) {
    const orders = getTodayOrders();
    const season = getTodaySeason();
    
    let desc = `${season.emoji} **NPC Market — ${season.name}**\n`;
    desc += `> Pedagang mencari crop yang sedang musim!\n`;
    desc += `> Harga **2.5-3.5x** lebih tinggi dari harga normal.\n`;
    desc += `> Refresh setiap hari jam 00:00 WIB.\n\n`;
    desc += `**📋 Orders hari ini:**\n\n`;
    
    for (const order of orders) {
        const crop = ALL_CROPS.find(c => c.id === order.cropId);
        if (!crop) continue;
        const filled = getFulfilledQty(userId, order.cropId);
        const remaining = Math.max(0, order.qty - filled);
        const status = remaining === 0 ? '✅ DONE' : `${filled}/${order.qty}`;
        desc += `> ${crop.emoji} **${crop.name}** x${order.qty} — 🪙 **${order.pricePerUnit.toLocaleString('id-ID')}**/pc\n`;
        desc += `>   Status: ${status} | Total: 🪙 ${(order.qty * order.pricePerUnit).toLocaleString('id-ID')}\n\n`;
    }
    
    desc += `*Jual crop dari Storage ke NPC Market untuk harga premium!*`;
    
    return { desc, orders };
}

module.exports = { getTodayOrders, getFulfilledQty, fulfillOrder, buildMarketEmbed, ALL_CROPS };
