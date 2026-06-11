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
                `Update besar! Sistem kartu Pokemon TCG & perbaikan fishing.\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            )
            .setTimestamp();

        const embed2 = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('🃏 Pokemon TCG Card System (BARU!)')
            .setDescription(
                `Koleksi kartu Pokemon asli dari database **20,359 kartu** HD!\nDari generasi pertama sampai terbaru — semua ada.\n\n` +
                `**🎴 Gacha Packs (beli dari /card):**\n` +
                `> 🟢 **Basic Pack** — 3 kartu (💰 15.000) ⏱️ 5m CD\n` +
                `>    Pool: Common, Uncommon, Rare\n` +
                `> 🔵 **Premium Pack** — 3 kartu (💰 75.000) ⏱️ 15m CD\n` +
                `>    Pool: Rare, Rare Holo, Holo EX/GX/V\n` +
                `> 🟣 **Ultra Pack** — 3 kartu (💰 200.000) ⏱️ 30m CD\n` +
                `>    Pool: Rare Holo, Ultra, Rainbow, Secret\n` +
                `> 💎 **Master Pack** — **10 kartu** (💰 750.000) ⏱️ 60m CD\n` +
                `>    Pool: SEMUA rarity + guaranteed 1 Ultra+!\n\n` +
                `**📊 Rarity (jumlah kartu):**\n` +
                `> ⚪ Common (5,289) | 🟢 Uncommon (4,862)\n` +
                `> 🔵 Rare (8,600) | 🟣 Rare Holo (2,695)\n` +
                `> 🟡 Holo EX/GX/V (764) | 🔴 Ultra (798)\n` +
                `> 🌈 Rainbow (324) | 👑 Secret (325) | 🎨 Illustration (697)`
            );

        const embed3 = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('✨ Fitur Card System')
            .setDescription(
                `**📖 Collection Gallery:**\n` +
                `> Tampilan card book premium (10 kartu/page)\n` +
                `> Background gelap + gold border + rarity glow\n` +
                `> Pagination ◀️ ▶️ untuk browse\n\n` +
                `**🔄 Dupe Detection:** Kartu duplikat ditandai 🔄 DUPE\n` +
                `**❤️ Wishlist:** Max 10 Pokemon, auto-ping saat muncul\n` +
                `**🔄 Trade:** /trade → 🃏 Kartu (2-way, kedua setuju)\n` +
                `**📊 Leaderboard:** Most Cards / Rare / Unique\n` +
                `**💸 Total Spent:** Track pengeluaran di panel\n` +
                `**⏱️ Cooldown:** 5m - 60m per pack tier`
            );

        const embed4 = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('🎣 Fishing — Rod Inventory & Equip')
            .setDescription(
                `**🐛 Bug Fixed:**\n` +
                `> ❌ Beli joran 2x → uang hilang — **SOLVED!**\n` +
                `> ❌ Joran lama hilang saat beli baru — **SOLVED!**\n\n` +
                `**🆕 Sistem Baru:**\n` +
                `> 🎋 **Rod Inventory** — Joran tersimpan permanen\n` +
                `> 🔄 **Equip/Unequip** — Ganti joran via /fishing → 🎋 Equip\n` +
                `> ✅ Shop tampilkan "Owned" per joran\n` +
                `> 🚫 Tidak bisa beli joran yang sudah punya\n\n` +
                `-# Joran lama otomatis masuk inventory.`
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
