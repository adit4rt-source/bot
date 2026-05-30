// systems/notifications.js - Notification System (DM-based)
const { db } = require('../database');

// ============ DATABASE SETUP ============
db.exec(`CREATE TABLE IF NOT EXISTS notification_settings (
    guildId TEXT,
    userId TEXT,
    notif_daily INTEGER DEFAULT 1,
    notif_quest INTEGER DEFAULT 1,
    notif_trade INTEGER DEFAULT 1,
    notif_pet INTEGER DEFAULT 1,
    notif_farm INTEGER DEFAULT 1,
    PRIMARY KEY(guildId, userId)
)`);

// ============ GET NOTIFICATION SETTINGS ============
function getNotifSettings(guildId, userId) {
    let row = db.prepare('SELECT * FROM notification_settings WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!row) {
        db.prepare('INSERT INTO notification_settings (guildId, userId) VALUES (?, ?)').run(guildId, userId);
        row = { guildId, userId, notif_daily: 1, notif_quest: 1, notif_trade: 1, notif_pet: 1, notif_farm: 1 };
    }
    return row;
}

// ============ TOGGLE NOTIFICATION ============
function toggleNotif(guildId, userId, type) {
    const settings = getNotifSettings(guildId, userId);
    const key = `notif_${type}`;
    const newValue = settings[key] ? 0 : 1;
    db.prepare(`UPDATE notification_settings SET ${key} = ? WHERE guildId = ? AND userId = ?`).run(newValue, guildId, userId);
    return newValue;
}

// ============ SEND NOTIFICATION ============
async function sendNotification(client, guildId, userId, type, message) {
    try {
        const settings = getNotifSettings(guildId, userId);
        const key = `notif_${type}`;
        if (!settings[key]) return false; // Notification disabled

        const user = await client.users.fetch(userId).catch(() => null);
        if (!user) return false;

        await user.send(message).catch(() => null);
        return true;
    } catch (e) {
        return false;
    }
}

// ============ NOTIFICATION TYPES ============

// Trade notification - when someone sends you a trade
async function notifyTradeReceived(client, guildId, receiverId, senderId, tradeId) {
    const sender = await client.users.fetch(senderId).catch(() => null);
    const senderName = sender ? sender.username : 'Someone';
    return sendNotification(client, guildId, receiverId, 'trade',
        `🔄 **Trade Received!**\n\n` +
        `**${senderName}** mengirim trade offer ke kamu!\n` +
        `> 🆔 Trade ID: **#${tradeId}**\n\n` +
        `Gunakan \`/trade\` → Accept/Reject di server untuk merespon.`
    );
}

// Trade accepted notification - notify sender that their trade was accepted
async function notifyTradeAccepted(client, guildId, senderId, receiverId, tradeId) {
    const receiver = await client.users.fetch(receiverId).catch(() => null);
    const receiverName = receiver ? receiver.username : 'Someone';
    return sendNotification(client, guildId, senderId, 'trade',
        `✅ **Trade Accepted!**\n\n` +
        `**${receiverName}** menerima trade offer kamu!\n` +
        `> 🆔 Trade ID: **#${tradeId}**\n\n` +
        `Item sudah ditransfer. Cek inventory kamu!`
    );
}

// Quest completed notification
async function notifyQuestComplete(client, guildId, userId, questName, reward) {
    return sendNotification(client, guildId, userId, 'quest',
        `📜 **Quest Complete!**\n\n` +
        `Selamat! Kamu menyelesaikan quest:\n` +
        `> 🎯 **${questName}**\n` +
        `> 🪙 Reward: **${reward.toLocaleString('id-ID')}** money\n\n` +
        `Gunakan \`/quest\` untuk klaim reward!`
    );
}

// Pet hungry notification
async function notifyPetHungry(client, guildId, userId, petName, hunger) {
    return sendNotification(client, guildId, userId, 'pet',
        `🐾 **Pet Kelaparan!**\n\n` +
        `Pet kamu **${petName}** sedang kelaparan!\n` +
        `> 🍖 Hunger: **${hunger}%** (Kritis!)\n\n` +
        `Segera beri makan dengan \`/pet\` → Feed sebelum happiness turun!`
    );
}

// Farm harvest ready notification
async function notifyFarmReady(client, guildId, userId, cropName) {
    return sendNotification(client, guildId, userId, 'farm',
        `🌾 **Siap Panen!**\n\n` +
        `Tanaman kamu sudah siap dipanen!\n` +
        `> 🌱 **${cropName}** sudah matang\n\n` +
        `Gunakan \`/farm\` → Harvest untuk memanen.`
    );
}

// Daily reminder notification
async function notifyDailyReady(client, guildId, userId) {
    return sendNotification(client, guildId, userId, 'daily',
        `🎁 **Daily Reward Ready!**\n\n` +
        `Kamu belum klaim daily reward hari ini!\n` +
        `> Gunakan \`/daily\` untuk klaim hadiah harian.\n\n` +
        `Jangan lupa jaga streak! 🔥`
    );
}

// Market sold notification
async function notifyMarketSold(client, guildId, sellerId, itemName, price, buyerName) {
    return sendNotification(client, guildId, sellerId, 'trade',
        `🏪 **Item Terjual!**\n\n` +
        `Item kamu di market telah dibeli!\n` +
        `> 📦 **${itemName}**\n` +
        `> 💰 Harga: 🪙 **${price.toLocaleString('id-ID')}**\n` +
        `> 🛒 Pembeli: **${buyerName}**\n\n` +
        `Money sudah masuk ke saldo kamu.`
    );
}

module.exports = {
    getNotifSettings,
    toggleNotif,
    sendNotification,
    notifyTradeReceived,
    notifyTradeAccepted,
    notifyQuestComplete,
    notifyPetHungry,
    notifyFarmReady,
    notifyDailyReady,
    notifyMarketSold
};
