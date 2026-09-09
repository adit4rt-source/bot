// systems/notifications.js - Notification System (DM DISABLED)
const { db } = require('../database');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ============ DATABASE SETUP ============
db.exec(`CREATE TABLE IF NOT EXISTS notification_settings (
    guildId TEXT,
    userId TEXT,
    notif_daily INTEGER DEFAULT 0,
    notif_quest INTEGER DEFAULT 0,
    notif_trade INTEGER DEFAULT 0,
    notif_pet INTEGER DEFAULT 0,
    notif_farm INTEGER DEFAULT 0,
    PRIMARY KEY(guildId, userId)
)`);
// Migration: add new columns if missing
try { db.exec(`ALTER TABLE notification_settings ADD COLUMN notif_expedition INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE notification_settings ADD COLUMN notif_worldboss INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE notification_settings ADD COLUMN notif_streak INTEGER DEFAULT 0`); } catch(e) {}
// DM consent - DISABLED BY DEFAULT
try { db.exec(`ALTER TABLE notification_settings ADD COLUMN dm_consent INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE notification_settings ADD COLUMN dm_asked INTEGER DEFAULT 1`); } catch(e) {}

// ============ DM SYSTEM DISABLED ============
function getDmConsent(guildId, userId) {
    return 0; // Always disabled
}
function setDmConsent(guildId, userId, allowed) {
    return 0; // Always disabled
}
function canDM(guildId, userId, type = null) {
    return false; // DM system completely disabled
}
function wasDmAsked(guildId, userId) {
    return true; // Prevent asking
}
function markDmAsked(guildId, userId) {
    // Do nothing
}

// ============ GET NOTIFICATION SETTINGS ============
function getNotifSettings(guildId, userId) {
    let row = db.prepare('SELECT * FROM notification_settings WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!row) {
        db.prepare('INSERT INTO notification_settings (guildId, userId, dm_consent, dm_asked) VALUES (?, ?, 0, 1)').run(guildId, userId);
        row = { guildId, userId, notif_daily: 0, notif_quest: 0, notif_trade: 0, notif_pet: 0, notif_farm: 0, dm_consent: 0, dm_asked: 1 };
    }
    return row;
}

// ============ TOGGLE NOTIFICATION ============
function toggleNotif(guildId, userId, type) {
    // Do nothing - DM disabled
    return 0;
}

// ============ SEND NOTIFICATION (DISABLED) ============
async function sendNotification(client, guildId, userId, type, message) {
    // DM System completely disabled
    return false;
}

// Direct DM (DISABLED)
async function dmUser(client, guildId, userId, message) {
    // DM System completely disabled
    return false;
}

// ============ NOTIFICATION TYPES (ALL DISABLED) ============
async function notifyTradeReceived(client, guildId, receiverId, senderId, tradeId) {
    return false;
}

async function notifyTradeAccepted(client, guildId, senderId, receiverId, tradeId) {
    return false;
}

async function notifyPetHungry(client, guildId, userId, petName, hunger) {
    return false;
}

async function notifyFarmReady(client, guildId, userId, cropName) {
    return false;
}

async function notifyDailyReady(client, guildId, userId) {
    return false;
}

async function notifyMarketSold(client, guildId, sellerId, itemName, price, buyerName) {
    return false;
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

// ============ UI: Notification settings panel ============
function buildNotifPanel(guildId, userId) {
    const embed = new EmbedBuilder()
        .setTitle('🔔 Pengaturan Notifikasi')
        .setColor('#95a5a6')
        .setDescription(
            `**Status: ❌ SISTEM DM DINONAKTIFKAN**\n\n` +
            `Sistem notifikasi DM telah dinonaktifkan.\n` +
            `Semua notifikasi tidak akan dikirim via DM.\n\n` +
            `💡 *Gunakan command di server untuk cek status:*\n` +
            `• \`/farm\` - Cek tanaman\n` +
            `• \`/pet\` - Cek pet\n` +
            `• \`/daily\` - Cek daily reward\n` +
            `• \`/quest\` - Cek quest progress`
        );
    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [backRow] };
}

// Consent prompt (disabled)
function buildConsentPrompt(userId) {
    const embed = new EmbedBuilder()
        .setColor('#95a5a6')
        .setTitle('🔔 Sistem Notifikasi')
        .setDescription(
            '**Sistem notifikasi DM dinonaktifkan.**\n\n' +
            'Bot tidak akan mengirim DM untuk notifikasi apa pun.\n' +
            'Gunakan command di server untuk cek status aktivitas kamu.\n\n' +
            '-# Pengaturan bisa dilihat di `/profile` → 🔔 Notifs'
        );
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`dmconsent_close_${userId}`).setLabel('Mengerti').setEmoji('✅').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row], ephemeral: true };
}
