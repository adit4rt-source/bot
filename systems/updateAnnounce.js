// systems/updateAnnounce.js — Auto-send changelog to #update-bot channel on startup
// Only sends ONCE per version (tracked in DB). Set UPDATE_VERSION env or edit here.
const { EmbedBuilder } = require('discord.js');
const { db } = require('../database');

const UPDATE_CHANNEL_ID = '1510705567944151150';
const CURRENT_VERSION = '3.8.0';
const RELEASE_DATE = '2026-06-13';

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
                `Update besar! Sistem Cooking Hub & Relic Socketing untuk Pet kamu.\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            )
            .setTimestamp();

        const embed2 = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('🍳 Cooking Hub (BARU!)')
            .setDescription(
                `Masak bahan makanan dari storage menjadi hidangan berguna!\nAkses via \`/pet\` → 🍳 **Cook**.\n\n` +
                `**Resep Tersedia:**\n` +
                `> 🥞 **Pancake** (2 Gandum + 1 Telur + 1 Susu)\n` +
                `>    *Memulihkan 100% Hunger & Happiness pet.*\n` +
                `> 🍜 **Spicy Fish Soup** (1 Rare Fish + 2 Pestisida)\n` +
                `>    *Buff Pet: +10% ATK selama 1 jam.*\n` +
                `> 🥗 **Veggie Salad** (3 Wortel + 2 Kentang)\n` +
                `>    *Proteksi Farm: Kebal serangan hama selama 6 jam.*\n`
            );

        const embed3 = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🧬 Relic Gem Socketing')
            .setDescription(
                `Perkuat Relic kamu dengan menyisipkan Permata!\nAkses via \`/pet\` → 📿 **Relic** → 🧬 **Socket**.\n\n` +
                `**Slot Tersedia:**\n` +
                `> 🟣 Epic: **1 Slot**\n` +
                `> 🟡 Legendary: **2 Slot**\n` +
                `> 🔴 Mythic / 👑 GOD: **3 Slot**\n\n` +
                `**Efek Permata:**\n` +
                `> 🧬 **DNA Shard**: +5% Max HP\n` +
                `> 🧪 **Mutation Serum**: +5% ATK\n` +
                `> 🪨 **Refine Stone**: +5% DEF\n` +
                `> 🛡️ **Protection Stone**: +5% SPD\n` +
                `> ✨ **Awakening Crystal**: +5% CRIT\n\n` +
                `*Cabut permata kapan saja tanpa biaya untuk mengembalikannya ke tas.*`
            );

        const embed4 = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('🔧 Perbaikan & Update Lainnya')
            .setDescription(
                `**🐛 Bug Fixed:**\n` +
                `> ❌ SyntaxError \`finalCdSec\` di interactionCreate — **SOLVED!**\n\n` +
                `**🆕 Fitur Lain:**\n` +
                `> 🏆 **Achievement Baru:** First Cook, Chef (10x), Socket Master.\n` +
                `> 📜 **Quest Baru:** Quest memasak (cook) & pasang gem (relic_socket).\n` +
                `> 📖 **Guide Panel:** Update informasi Cooking & Farming di \`/guide\`.\n\n` +
                `-# Selamat menikmati update terbaru!`
            )
            .setFooter({ text: `Update oleh Tim Dev • v${CURRENT_VERSION} • ${RELEASE_DATE}` })
            .setTimestamp();

        await channel.send({ embeds: [embed1, embed2, embed3, embed4] });
        markSent();
        console.log(`[update] Changelog v${CURRENT_VERSION} sent to #update-bot`);
    } catch (e) {
        console.error('[update] Failed to send changelog:', e?.message || e);
    }
}

module.exports = { sendUpdateAnnouncement, CURRENT_VERSION };
