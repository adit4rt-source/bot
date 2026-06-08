// systems/notifications.js - Notification System (DM-based)
const { db } = require('../database');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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
// Migration: add new columns if missing
try { db.exec(`ALTER TABLE notification_settings ADD COLUMN notif_expedition INTEGER DEFAULT 1`); } catch(e) {}
try { db.exec(`ALTER TABLE notification_settings ADD COLUMN notif_worldboss INTEGER DEFAULT 1`); } catch(e) {}
try { db.exec(`ALTER TABLE notification_settings ADD COLUMN notif_streak INTEGER DEFAULT 1`); } catch(e) {}
// DM consent (opt-in): dm_consent 0 = not allowed (default), 1 = allowed.
// dm_asked 0 = first-use prompt not shown yet, 1 = already prompted once.
try { db.exec(`ALTER TABLE notification_settings ADD COLUMN dm_consent INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE notification_settings ADD COLUMN dm_asked INTEGER DEFAULT 0`); } catch(e) {}

// ============ DM CONSENT (opt-in) ============
function getDmConsent(guildId, userId) {
    const row = getNotifSettings(guildId, userId);
    return row.dm_consent ? 1 : 0;
}
function setDmConsent(guildId, userId, allowed) {
    getNotifSettings(guildId, userId); // ensure row exists
    db.prepare('UPDATE notification_settings SET dm_consent = ?, dm_asked = 1 WHERE guildId = ? AND userId = ?').run(allowed ? 1 : 0, guildId, userId);
    return allowed ? 1 : 0;
}
// True only if the player has explicitly opted in to DMs.
function canDM(guildId, userId) {
    return getDmConsent(guildId, userId) === 1;
}
function wasDmAsked(guildId, userId) {
    const row = getNotifSettings(guildId, userId);
    return !!row.dm_asked;
}
function markDmAsked(guildId, userId) {
    getNotifSettings(guildId, userId);
    db.prepare('UPDATE notification_settings SET dm_asked = 1 WHERE guildId = ? AND userId = ?').run(guildId, userId);
}
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
        // Opt-in gate: never DM a user who hasn't explicitly consented.
        if (!canDM(guildId, userId)) return false;

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

// Direct DM that still respects consent — for one-off DMs (giveaway/lottery
// winners) that don't fit a notification category.
async function dmUser(client, guildId, userId, message) {
    try {
        if (!canDM(guildId, userId)) return false;
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
    dmUser,
    getDmConsent,
    setDmConsent,
    canDM,
    wasDmAsked,
    markDmAsked,
    buildNotifPanel,
    buildConsentPrompt,
    notifyTradeReceived,
    notifyTradeAccepted,
    notifyPetHungry,
    notifyFarmReady,
    notifyDailyReady,
    notifyMarketSold
};

// ============ UI: Notification settings panel (shared) ============
const _NOTIF_CATS = [
    { type: 'daily', label: 'Daily', key: 'notif_daily' },
    { type: 'quest', label: 'Quest', key: 'notif_quest' },
    { type: 'trade', label: 'Trade', key: 'notif_trade' },
    { type: 'pet', label: 'Pet', key: 'notif_pet' },
    { type: 'farm', label: 'Farm', key: 'notif_farm' },
];

function buildNotifPanel(guildId, userId) {
    const s = getNotifSettings(guildId, userId);
    const on = s.dm_consent ? 1 : 0;
    const embed = new EmbedBuilder()
        .setTitle('🔔 Pengaturan Notifikasi DM')
        .setColor('#F39C12')
        .setDescription(
            `**Status DM:** ${on ? '✅ AKTIF' : '❌ NONAKTIF'}\n` +
            (on ? '' : '> ⚠️ Kamu tidak menerima DM apa pun sampai diaktifkan.\n') +
            `\n${on ? '**Kategori:**' : '*Aktifkan DM dulu untuk mengatur kategori:*'}\n` +
            `${s.notif_daily ? '✅' : '❌'} Daily Reminder\n` +
            `${s.notif_quest ? '✅' : '❌'} Quest Complete\n` +
            `${s.notif_trade ? '✅' : '❌'} Trade & Market\n` +
            `${s.notif_pet ? '✅' : '❌'} Pet & Expedition\n` +
            `${s.notif_farm ? '✅' : '❌'} Farm Harvest\n\n` +
            `💡 *Klik tombol untuk ubah.*`
        );
    const masterRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`notif_toggle_master_${userId}`)
            .setLabel(on ? 'DM: AKTIF (klik untuk matikan)' : 'DM: NONAKTIF (klik untuk aktifkan)')
            .setEmoji(on ? '🔔' : '🔕')
            .setStyle(on ? ButtonStyle.Success : ButtonStyle.Danger)
    );
    const catRow = new ActionRowBuilder().addComponents(
        ..._NOTIF_CATS.map(c => new ButtonBuilder()
            .setCustomId(`notif_toggle_${c.type}_${userId}`)
            .setLabel(`${s[c.key] ? '✅' : '❌'} ${c.label}`)
            .setStyle(s[c.key] ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!on))
    );
    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [masterRow, catRow, backRow] };
}

// First-use consent prompt (ephemeral).
function buildConsentPrompt(userId) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🔔 Izinkan Notifikasi DM dari Bot?')
        .setDescription(
            'Bot ini bisa mengirim **DM pengingat** seputar progres kamu: daily reward, pet lapar, panen siap, ekspedisi selesai, menang giveaway/togel, dll.\n\n' +
            '✅ **Izinkan** — kamu akan menerima DM pengingat.\n' +
            '❌ **Jangan** — kamu tidak akan di-DM sama sekali.\n\n' +
            '-# Bisa diubah kapan saja di `/profile` → 🔔 Notifs. Semua fitur tetap bisa dipakai tanpa DM.'
        );
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`dmconsent_yes_${userId}`).setLabel('Izinkan DM').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`dmconsent_no_${userId}`).setLabel('Jangan').setEmoji('❌').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row], ephemeral: true };
}
