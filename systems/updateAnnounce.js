// systems/updateAnnounce.js — Auto-send changelog to #update-bot channel on startup
// Only sends ONCE per version (tracked in DB). Set UPDATE_VERSION env or edit here.
const { EmbedBuilder } = require('discord.js');
const { db } = require('../database');

const UPDATE_CHANNEL_ID = '1510705567944151150';
const CURRENT_VERSION = '3.7.0';
const RELEASE_DATE = '2026-06-11';

// Ensure table
try { db.exec(`CREATE TABLE IF NOT EXISTS bot_updates (version TEXT PRIMARY KEY, sentAt INTEGER)`); } catch (_) {}

function alreadySent() {
    try {
        return !!db.prepare('SELECT 1 FROM bot_updates WHERE version = ?').get(CURRENT_VERSION);
    } catch (_) { return false; }
}

function markSent() {
    try {
        db.prepare('INSERT OR REPLACE INTO bot_updates (version, sentAt) VALUES (?, ?)').run(CURRENT_VERSION, Date.now());
    } catch (_) {}
}

async function sendUpdateAnnouncement(client) {
    if (alreadySent()) return;

    // Wait a bit for bot to be fully ready
    await new Promise(r => setTimeout(r, 15000));

    try {
        const channel = await client.channels.fetch(UPDATE_CHANNEL_ID).catch(() => null);
        if (!channel) { console.log('[update] Channel not found:', UPDATE_CHANNEL_ID); return; }

        const embed1 = new EmbedBuilder()
            .setColor('#FF6B35')
            .setTitle(`🎉 MAJOR UPDATE — v${CURRENT_VERSION}`)
            .setDescription(
                `**Release ${CURRENT_VERSION}** — ${RELEASE_DATE}\n\n` +
                `🃏 **Pokemon TCG Card Gacha** + 🎣 **Fishing Rod Inventory**!\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            )
            .setTimestamp();

        const embed2 = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('🃏 Pokemon TCG Card System (BARU!)')
            .setDescription(
                `Sistem gacha kartu Pokemon dengan 20,000+ kartu asli!\n\n` +
                `**🎴 Gacha Packs:**\n` +
                `> 🟢 Basic — 3 kartu (💰 15.000) ⏱️ 5m\n` +
                `> 🔵 Premium — 3 kartu (💰 75.000) ⏱️ 15m\n` +
                `> 🟣 Ultra — 3 kartu (💰 200.000) ⏱️ 30m\n` +
                `> 💎 Master — 10 kartu (💰 750.000) ⏱️ 60m\n\n` +
                `**✨ Fitur:**\n` +
                `> 📖 Collection Gallery — 10 kartu/page, style card book\n` +
                `> 🔄 Dupe Detection — Tandai kartu duplikat\n` +
                `> ❤️ Wishlist — Ping saat Pokemon incaran muncul\n` +
                `> 📊 Leaderboard — Most Cards / Rare / Unique\n` +
                `> 💸 Total Spent tracking\n` +
                `> 🔄 Trade via /trade → 🃏 Kartu (2-way confirm)\n\n` +
                `**⚡ Command:** \`/card\``
            );

        const embed3 = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('🎣 Fishing — Rod Inventory System')
            .setDescription(
                `Joran sekarang **permanen** dan bisa di-equip/unequip!\n\n` +
                `**🆕 Yang Berubah:**\n` +
                `> 🎋 Joran yang dibeli masuk **inventory** (tidak hilang!)\n` +
                `> ❌ Tidak bisa beli joran yang sudah dimiliki\n` +
                `> 🔄 **Equip/Unequip** — Ganti joran kapan saja\n` +
                `> ✅ Shop tampilkan status "Owned" per joran\n\n` +
                `**💡 Cara Pakai:**\n` +
                `> \`/fishing\` → 🎋 **Equip Rod** → Pilih joran\n\n` +
                `-# *Joran yang sudah dimiliki sebelum update otomatis masuk inventory.*`
            );

        const embed4 = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('📋 Detail Lainnya')
            .setDescription(
                `**🃏 Card System Tech:**\n` +
                `> 🌐 Data: pokemontcg.io (20,359 kartu)\n` +
                `> 💾 Cache offline — gacha instant tanpa internet\n` +
                `> 🖼️ Gambar HD langsung dari API\n` +
                `> ⏱️ Cooldown per pack tier\n\n` +
                `**🎣 Fishing Fix:**\n` +
                `> 🐛 Fix: beli joran 2x uang hilang → SOLVED\n` +
                `> 🐛 Fix: joran lama hilang saat beli baru → SOLVED\n\n` +
                `**🔧 Infrastructure:**\n` +
                `> Background card prefetch saat bot start\n` +
                `> Image timeout protection (8s)\n` +
                `> Smart cache scaling (90% cache saat penuh)\n`
            )
            .setFooter({ text: `Update oleh Peko • v${CURRENT_VERSION} • ${RELEASE_DATE}` })
            .setTimestamp();

        await channel.send({ embeds: [embed1, embed2, embed3, embed4] });
        markSent();
        console.log(`[update] Changelog v${CURRENT_VERSION} sent to #update-bot`);
    } catch (e) {
        console.error('[update] Failed to send changelog:', e?.message || e);
    }
}

module.exports = { sendUpdateAnnouncement, CURRENT_VERSION };
