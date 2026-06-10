// systems/updateAnnounce.js — Auto-send changelog to #update-bot channel on startup
// Only sends ONCE per version (tracked in DB). Set UPDATE_VERSION env or edit here.
const { EmbedBuilder } = require('discord.js');
const { db } = require('../database');

const UPDATE_CHANNEL_ID = '1510705567944151150';
const CURRENT_VERSION = '3.6.0';
const RELEASE_DATE = '2026-06-10';

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
            .setColor('#2ECC71')
            .setTitle(`🎉 Update — v${CURRENT_VERSION}`)
            .setDescription(
                `**Release ${CURRENT_VERSION}** — ${RELEASE_DATE}\n\n` +
                `Update besar: fitur baru, perbaikan, & penyeimbangan! 🎊\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            )
            .setTimestamp();

        const embed2 = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('✨ Fitur Baru')
            .setDescription(
                `🌤️ **Season Compatibility** — Tanaman punya musim ideal!\n` +
                `> 🌈 Musim Ideal = -20% waktu, +30% hasil\n` +
                `> ❌ Tidak Cocok = +50% waktu, -30% hasil, 15% mati!\n\n` +
                `🏠 **Greenhouse** — Lahan baru anti-penalty musim!\n` +
                `> Lv.1: 6 slot (🪙 150K) → Lv.4: 15 slot (🪙 1.2M)\n` +
                `> Kebal season, auto-water, bisa dipupuk\n\n` +
                `🏪 **NPC Market** — Jual crop ke pedagang harga 2.5-3.5x!\n` +
                `> Refresh tiap hari, fokus crop in-season\n\n` +
                `⚔️ **Arena Overhaul:**\n` +
                `> 🔥 Win Streak (x1.5 - x3) | 🏅 Tier Rewards\n` +
                `> 🎖️ Arena Points + Shop | 📅 Monthly Seasons\n\n` +
                `🌊 **5 Zona Expedition Baru:**\n` +
                `> ❄️ Frozen Abyss | 🌋 Volcanic Core | 👻 Spirit World\n` +
                `> 🌀 Dimension Rift | 🕳️ Void Realm (SECRET!)\n` +
                `> 💰 Reward 3-4x lipat | 🌟 Rare Events (10%)\n\n` +
                `🃏 **Blackjack Upgrade:**\n` +
                `> Max bet 🪙 100K | 🎰 Side Bets (Pair bonus!)\n` +
                `> 📊 Stats | Terintegrasi ke /casino\n\n` +
                `🛡️ **Admin Panel +5 Fitur:**\n` +
                `> 🎁 Giveaway | 👤 Lookup | 📢 Announce | 🚫 Blacklist | 🏷️ Embed`
            );

        const embed3 = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('⚖️ Penyeimbangan & Perbaikan')
            .setDescription(
                `🎁 **Daily Reward Naik Drastis:**\n` +
                `> Base 🪙 500 → **🪙 3.000** (+400/hari)\n` +
                `> Milestone: Hari 7/14/30/60/100 (hingga 🪙 500K!)\n` +
                `> 🔔 Reminder otomatis muncul saat chat pertama\n\n` +
                `🎣 **Fishing Tournament Reward:**\n` +
                `> first_legendary: 🪙 3K → **🪙 500K** + 5× Mystery Box\n` +
                `> heaviest/most_fish: → **🪙 250-350K** + Mystery Box\n\n` +
                `🐔 **Peternakan:**\n` +
                `> Evolve sekarang BERFUNGSI! + Biaya naik\n` +
                `> Bulk plant + bulk pupuk (tanam banyak sekaligus!)\n\n` +
                `🏛️ **Auction:** Filter by Pet/Relic/Item/Fish\n` +
                `❤️ **Love:** Sekarang global (1 orang = 1 love max)\n` +
                `🌈 **Mutasi:** Multiplier diturunkan (max 10x), chance ~1.9%\n\n` +
                `🔧 **Bug Fixes:**\n` +
                `> ✅ Fix "Unknown interaction" error\n` +
                `> ✅ Fix streak 🔥 tidak muncul di nickname\n` +
                `> ✅ Auto-backup ke Discord setiap 6 jam\n` +
                `> ✅ Custom artwork untuk crops, items, hewan\n\n` +
                `🎨 **Custom Emoji:** Legendary crops, prestige, items, pupuk, dekorasi, dan hewan sekarang pakai gambar custom!`
            )
            .setFooter({ text: `Update oleh Peko • v${CURRENT_VERSION} • ${RELEASE_DATE}` })
            .setTimestamp();

        await channel.send({ embeds: [embed1, embed2, embed3] });
        markSent();
        console.log(`[update] Changelog v${CURRENT_VERSION} sent to #update-bot`);
    } catch (e) {
        console.error('[update] Failed to send changelog:', e?.message || e);
    }
}

module.exports = { sendUpdateAnnouncement, CURRENT_VERSION };
