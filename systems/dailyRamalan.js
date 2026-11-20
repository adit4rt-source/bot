// systems/dailyRamalan.js - Auto Daily Ramalan Oracle (Jam 07:00 WIB)
const { EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const { RAMALAN_DATA } = require('../data/ramalan');
const { db, getSetting, setSetting } = require('../database');
const { log } = require('./logger');

const CATEGORY_COLORS = {
    motivasi: '#F1C40F', // Emas
    lucu: '#F39C12',     // Oranye
    galau: '#9B59B6',    // Ungu
    sedih: '#3498DB',    // Biru Mellow
    cinta: '#E91E63',    // Pink
    hoki: '#2ECC71'      // Hijau Hoki
};

/**
 * Hitung hari ke-n dalam setahun (1-365) berdasarkan zona waktu Asia/Jakarta (WIB)
 */
function getDayOfYear(date = new Date()) {
    const wibStr = date.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
    const wibDate = new Date(wibStr);
    const start = new Date(wibDate.getFullYear(), 0, 0);
    const diff = wibDate - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const day = Math.floor(diff / oneDay);
    return Math.min(365, Math.max(1, day));
}

/**
 * Ambil ramalan hari ini berdasarkan Day of Year (1-365)
 */
function getTodayRamalan(date = new Date()) {
    const day = getDayOfYear(date);
    const index = (day - 1) % RAMALAN_DATA.length;
    return RAMALAN_DATA[index] || RAMALAN_DATA[0];
}

/**
 * Format tanggal Indonesia (contoh: Jumat, 20 November 2026)
 */
function formatIndoDate(date = new Date()) {
    return date.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

/**
 * Buat Discord Embed estetik untuk ramalan harian
 */
function buildRamalanEmbed(ramalan, date = new Date()) {
    const dateStr = formatIndoDate(date);
    const color = CATEGORY_COLORS[ramalan.category] || '#5865F2';

    return new EmbedBuilder()
        .setTitle(`🔮 RAMALAN HARI INI • ${dateStr}`)
        .setColor(color)
        .setDescription(
            `${ramalan.emoji} **${ramalan.title}**\n` +
            `*Kategori: #${ramalan.category.toUpperCase()}*\n\n` +
            `📜 **Ramalan Hari Ini:**\n` +
            `> "${ramalan.forecast}"\n\n` +
            `💡 **Nasihat / Petunjuk:**\n` +
            `> "${ramalan.advice}"\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🔢 **Angka Hoki:** \`${ramalan.luckyNumber}\` | 🎨 **Warna Hoki:** \`${ramalan.luckyColor}\`\n` +
            `📊 **Energi / Mood:** \`${ramalan.moodIndex}\`\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: `✦ ID Community Oracle • Hari #${ramalan.id} dari 365 • Jam 07:00 WIB` })
        .setTimestamp();
}

/**
 * Kirim ramalan harian otomatis ke setiap server (dipanggil tiap menit oleh scheduler)
 * Hanya dieksekusi jika jam sekarang >= 7 WIB dan hari ini belum dikirim.
 */
async function checkAndSendDailyRamalan(client) {
    if (!client || !client.guilds) return;

    const nowWib = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const currentHour = nowWib.getHours();
    const todayStr = nowWib.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD

    // Hanya kirim pada atau setelah jam 7 pagi WIB
    if (currentHour < 7) return;

    const todayRamalan = getTodayRamalan(nowWib);
    const embed = buildRamalanEmbed(todayRamalan, nowWib);

    for (const [guildId, guild] of client.guilds.cache) {
        try {
            // Cek toggle enable & tanggal kirim terakhir
            const isEnabled = getSetting(guildId, 'ramalan_enabled', '1') !== '0';
            if (!isEnabled) continue;

            const lastDate = getSetting(guildId, 'ramalan_last_date', '');
            if (lastDate === todayStr) continue; // Sudah dikirim hari ini

            // Cari channel tujuan
            const channelId = getSetting(guildId, 'ramalan_channel', null);
            let targetChannel = null;

            if (channelId && guild.channels?.cache) {
                targetChannel = typeof guild.channels.cache.get === 'function' ? guild.channels.cache.get(channelId) : null;
            }

            // Fallback: cari channel chat publik (contoh: 'chat' atau text channel pertama)
            if (!targetChannel && guild.channels?.cache) {
                if (typeof guild.channels.cache.find === 'function') {
                    targetChannel = guild.channels.cache.find(c =>
                        (c.type === ChannelType.GuildText || c.type === 0) &&
                        c.name && (c.name.includes('chat') || c.name.includes('general') || c.name.includes('publik') || c.name.includes('public'))
                    );
                } else {
                    for (const [, c] of guild.channels.cache) {
                        if (c.name && (c.name.includes('chat') || c.name.includes('general') || c.name.includes('publik') || c.name.includes('public'))) {
                            targetChannel = c;
                            break;
                        }
                    }
                }
            }

            if (!targetChannel) continue;

            // Cek permission kirim
            const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
            if (!me || !targetChannel.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages)) {
                continue;
            }

            await targetChannel.send({ embeds: [embed] }).catch(() => {});
            setSetting(guildId, 'ramalan_last_date', todayStr);
            log('INFO', `[dailyRamalan] Terkirim ke #${targetChannel.name} di ${guild.name} (Day ${todayRamalan.id}/365)`);
        } catch (e) {
            log('ERROR', `[dailyRamalan] Gagal kirim di guild ${guildId}: ${e.message}`);
        }
    }
}

module.exports = {
    getDayOfYear,
    getTodayRamalan,
    buildRamalanEmbed,
    formatIndoDate,
    checkAndSendDailyRamalan
};
