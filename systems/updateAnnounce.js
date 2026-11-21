// systems/updateAnnounce.js — Auto-send changelog to #update-bot channel on startup
// Only sends ONCE per version (tracked in DB). Set UPDATE_VERSION env or edit here.
const { EmbedBuilder } = require('discord.js');
const { db } = require('../database');

const UPDATE_CHANNEL_ID = '1510705567944151150';
const CURRENT_VERSION = '3.9.0';
const RELEASE_DATE = '2026-06-23';

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
                `Update besar! Pet Stats Scaling, Boss Baru, dan Awakening Tier 6! ⚡\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            )
            .setTimestamp();

        const embed2 = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('⚔️ Pet Level Stats Scaling (BARU!)')
            .setDescription(
                `Pet kamu sekarang **makin kuat** setiap naik level!\n\n` +
                `**Bonus Per Level:**\n` +
                `> ❤️ **HP** +5 per level\n` +
                `> ⚔️ **ATK** +2 per level\n` +
                `> 🛡️ **DEF** +1 per level\n` +
                `> 💨 **SPD** +0.2 per level (1 setiap 5 level)\n` +
                `> 🎯 **CRIT** +0.1% per level (1% setiap 10 level)\n\n` +
                `*Stats scaling terlihat di panel pet — semakin tinggi level, semakin tangguh!*`
            );

        const embed3 = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🔱 Boss Baru: Omega Genesis + Cosmic Deity Awakening')
            .setDescription(
                `**🔱 Omega Genesis** — Boss End-Game tertinggi!\n` +
                `> 📈 Min Level: **200** | HP: **120.000** | ATK: **380**\n` +
                `> 🎁 Reward: 🪙 150K–300K + 600 Pet EXP\n` +
                `> 🔱 Drop: **Omega Core** (10%) — material ultra-langka!\n\n` +
                `**★★★★★★ Cosmic Deity** — Awakening Tier 6!\n` +
                `> ⚡ Stat Boost: **+150%** all base stats\n` +
                `> 🎁 Bonus: **+25% All Reward** + COSMIC aura\n` +
                `> 📦 Requirements: 🪙 10.000.000 + 🔱 Omega Core ×1 + 💫 Awakening Crystal ×3\n\n` +
                `*Omega Core hanya drop dari Boss Omega Genesis — tantang jika berani!*`
            );

        const embed4 = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('📚 English Learning & Perbaikan Lainnya')
            .setDescription(
                `**📚 Belajar Bahasa Inggris:**\n` +
                `> 📖 **BAB 2** dibuka — topik dan soal baru!\n` +
                `> 🛡️ **Streak Shield** — lindungi streak belajar jika skip 1 hari\n` +
                `> 🏆 **7 Achievement** baru untuk Education\n` +
                `> 🔊 TTS error handling — tidak crash lagi saat Google TTS gagal\n\n` +
                `**🐟 Fishing:**\n` +
                `> 🌟 Chance ikan **Secret** dinaikkan sedikit\n\n` +
                `**🛠️ Perbaikan:**\n` +
                `> 🐛 35+ bug fix dari audit komprehensif\n` +
                `> 📊 HP kini ditampilkan dengan **(base X)** di panel pet\n` +
                `> ⚔️ World Boss menggunakan stats scaling terbaru\n` +
                `> 🔱 Omega Core ditambahkan ke daftar drop-only materials`
            )
            .setFooter({ text: `idcommunity Bot v${CURRENT_VERSION} — ${RELEASE_DATE} | discord.gg/idcommunity` })
            .setTimestamp();

        await channel.send({ embeds: [embed1, embed2, embed3, embed4] });
        markSent();
        console.log(`[update] Changelog v${CURRENT_VERSION} sent to #update-bot`);
    } catch (e) {
        console.error('[update] Failed to send changelog:', e?.message || e);
    }
}

module.exports = { sendUpdateAnnouncement, CURRENT_VERSION };
