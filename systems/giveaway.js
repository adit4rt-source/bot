// systems/giveaway.js — Giveaway System
//
// Members join a giveaway by clicking a button; when the timer ends the bot
// picks N random winners, announces them, and lets admins re-roll.
// Admin UI (create/manage) lives in systems/giveawayPanel.js.
//
// Guild-scoped tables (a giveaway always belongs to one guild).

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('../database');
const ui = require('./ui');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

// ==================== DATABASE SETUP ====================
db.exec(`
  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    channelId TEXT,
    messageId TEXT,
    prize TEXT,
    winners INTEGER DEFAULT 1,
    hostId TEXT,
    requiredRoleId TEXT,
    endsAt INTEGER,
    ended INTEGER DEFAULT 0,
    winnerIds TEXT,
    createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS giveaway_entries (
    giveawayId INTEGER,
    userId TEXT,
    createdAt INTEGER,
    PRIMARY KEY (giveawayId, userId)
  );
`);

// ==================== DURATION PARSING ====================
// Accepts things like "30m", "2h", "1d", "1d12h", "90s". Returns ms or null.
function parseDuration(input) {
    if (!input) return null;
    const str = String(input).trim().toLowerCase();
    const re = /(\d+)\s*(d|h|m|s)/g;
    let total = 0, matched = false, m;
    const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    while ((m = re.exec(str)) !== null) { total += parseInt(m[1], 10) * mult[m[2]]; matched = true; }
    if (!matched) {
        // bare number = minutes
        const n = parseInt(str, 10);
        if (!isNaN(n) && n > 0) return n * 60000;
        return null;
    }
    return total > 0 ? total : null;
}

function formatDuration(ms) {
    if (ms <= 0) return '0 detik';
    const d = Math.floor(ms / 86400000); ms %= 86400000;
    const h = Math.floor(ms / 3600000); ms %= 3600000;
    const m = Math.floor(ms / 60000); ms %= 60000;
    const s = Math.floor(ms / 1000);
    const parts = [];
    if (d) parts.push(`${d} hari`);
    if (h) parts.push(`${h} jam`);
    if (m) parts.push(`${m} menit`);
    if (s && !d && !h) parts.push(`${s} detik`);
    return parts.join(' ') || '0 detik';
}

// ==================== CRUD ====================
function createGiveaway(guildId, { prize, winners = 1, hostId, durationMs, requiredRoleId = null }) {
    const endsAt = Date.now() + durationMs;
    const res = db.prepare(
        'INSERT INTO giveaways (guildId, prize, winners, hostId, requiredRoleId, endsAt, ended, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
    ).run(guildId, prize, Math.max(1, Number(winners) || 1), hostId, requiredRoleId, endsAt, Date.now());
    return Number(res.lastInsertRowid);
}

function getGiveaway(id) {
    return db.prepare('SELECT * FROM giveaways WHERE id = ?').get(id);
}

function getGuildGiveaways(guildId, { activeOnly = false } = {}) {
    if (activeOnly) return db.prepare('SELECT * FROM giveaways WHERE guildId = ? AND ended = 0 ORDER BY endsAt ASC').all(guildId);
    return db.prepare('SELECT * FROM giveaways WHERE guildId = ? ORDER BY id DESC').all(guildId);
}

function getDueGiveaways(now = Date.now()) {
    // Only end giveaways that were actually posted (have a messageId).
    return db.prepare('SELECT * FROM giveaways WHERE ended = 0 AND endsAt <= ? AND messageId IS NOT NULL').all(now);
}

function updateGiveaway(id, fields) {
    const allowed = ['channelId', 'messageId', 'prize', 'winners', 'requiredRoleId', 'endsAt', 'ended', 'winnerIds'];
    const sets = [], vals = [];
    for (const [k, v] of Object.entries(fields)) {
        if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
    }
    if (!sets.length) return;
    vals.push(id);
    db.prepare(`UPDATE giveaways SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

function deleteGiveaway(id) {
    db.prepare('DELETE FROM giveaway_entries WHERE giveawayId = ?').run(id);
    db.prepare('DELETE FROM giveaways WHERE id = ?').run(id);
}

// ==================== ENTRIES ====================
function hasEntry(giveawayId, userId) {
    return !!db.prepare('SELECT 1 FROM giveaway_entries WHERE giveawayId = ? AND userId = ?').get(giveawayId, userId);
}
function addEntry(giveawayId, userId) {
    db.prepare('INSERT OR IGNORE INTO giveaway_entries (giveawayId, userId, createdAt) VALUES (?, ?, ?)').run(giveawayId, userId, Date.now());
}
function removeEntry(giveawayId, userId) {
    db.prepare('DELETE FROM giveaway_entries WHERE giveawayId = ? AND userId = ?').run(giveawayId, userId);
}
function getEntryIds(giveawayId) {
    return db.prepare('SELECT userId FROM giveaway_entries WHERE giveawayId = ?').all(giveawayId).map(r => r.userId);
}
function countEntries(giveawayId) {
    return db.prepare('SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveawayId = ?').get(giveawayId).c;
}

// ==================== WINNER PICKING ====================
function pickWinners(entryIds, count, exclude = []) {
    const pool = entryIds.filter(id => !exclude.includes(id));
    // Fisher–Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.max(1, count));
}

// ==================== PUBLIC MESSAGE BUILDER ====================
function buildGiveawayMessage(gw, entryCount = 0) {
    const ended = gw.ended === 1;
    const winners = gw.winnerIds ? JSON.parse(gw.winnerIds) : [];
    const endTs = Math.floor(gw.endsAt / 1000);

    const desc = ended
        ? (winners.length
            ? `🎉 **Pemenang:** ${winners.map(w => `<@${w}>`).join(', ')}\n\n` +
              `🏆 Hadiah: **${gw.prize}**\n👤 Host: <@${gw.hostId}>\n🎫 Total peserta: **${entryCount}**`
            : `😢 Giveaway selesai tanpa peserta yang valid.\n\n🏆 Hadiah: **${gw.prize}**`)
        : `🏆 Hadiah: **${gw.prize}**\n` +
          `🏅 Jumlah pemenang: **${gw.winners}**\n` +
          `⏰ Berakhir: <t:${endTs}:R> (<t:${endTs}:f>)\n` +
          `👤 Host: <@${gw.hostId}>\n` +
          (gw.requiredRoleId ? `🔒 Syarat: harus punya role <@&${gw.requiredRoleId}>\n` : '') +
          `🎫 Peserta: **${entryCount}**\n\n` +
          `Tekan tombol **🎉 Ikut Giveaway** di bawah untuk ikutan!`;

    const embed = new EmbedBuilder()
        .setColor(ended ? ui.COLORS.neutral : ui.COLORS.casino)
        .setTitle(ended ? '🎉 GIVEAWAY SELESAI' : '🎉 GIVEAWAY')
        .setDescription(desc)
        .setFooter({ text: ui.footer(ended ? 'Giveaway telah berakhir' : 'Semoga beruntung!') })
        .setTimestamp(gw.endsAt);

    const button = new ButtonBuilder()
        .setCustomId(`gwjoin_${gw.id}`)
        .setLabel(ended ? 'Giveaway Berakhir' : 'Ikut Giveaway')
        .setEmoji('🎉')
        .setStyle(ended ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(ended);

    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] };
}

// ==================== JOIN HANDLER (public) ====================
async function handleGiveawayJoin(interaction) {
    const giveawayId = parseInt(interaction.customId.split('_')[1], 10);
    const gw = getGiveaway(giveawayId);
    if (!gw) return interaction.reply({ content: '❌ Giveaway ini sudah tidak ada.', ephemeral: true });
    if (gw.ended === 1) return interaction.reply({ content: '❌ Giveaway ini sudah berakhir.', ephemeral: true });

    // Requirement check
    if (gw.requiredRoleId && !interaction.member.roles.cache.has(gw.requiredRoleId)) {
        return interaction.reply({ content: `❌ Kamu butuh role <@&${gw.requiredRoleId}> untuk ikut giveaway ini.`, ephemeral: true });
    }

    const userId = interaction.user.id;
    let msg;
    if (hasEntry(giveawayId, userId)) {
        removeEntry(giveawayId, userId);
        msg = '➖ Kamu keluar dari giveaway. Tekan tombol lagi kalau berubah pikiran.';
    } else {
        addEntry(giveawayId, userId);
        msg = '✅ Kamu ikut giveaway! Semoga beruntung 🍀';
    }

    // Refresh entry count on the original message (best-effort).
    try {
        const payload = buildGiveawayMessage(gw, countEntries(giveawayId));
        await interaction.message.edit(payload);
    } catch (_) { /* ignore edit errors */ }

    return interaction.reply({ content: msg, ephemeral: true });
}

// ==================== END / REROLL ====================
// Ends a giveaway: picks winners, edits the message, announces in-channel.
async function endGiveaway(client, gw, { reroll = false } = {}) {
    const entryIds = getEntryIds(gw.id);
    const previous = gw.winnerIds ? JSON.parse(gw.winnerIds) : [];
    const winners = pickWinners(entryIds, gw.winners, reroll ? previous : []);

    updateGiveaway(gw.id, { ended: 1, winnerIds: JSON.stringify(winners) });
    const fresh = getGiveaway(gw.id);

    try {
        const channel = client.channels.cache.get(gw.channelId) || await client.channels.fetch(gw.channelId).catch(() => null);
        if (channel) {
            const payload = buildGiveawayMessage(fresh, countEntries(gw.id));
            if (gw.messageId) {
                const msg = await channel.messages.fetch(gw.messageId).catch(() => null);
                if (msg) await msg.edit(payload).catch(() => {});
            }
            if (winners.length) {
                await channel.send({
                    content: `🎉 Selamat ${winners.map(w => `<@${w}>`).join(', ')}! Kalian memenangkan **${gw.prize}**!`,
                    allowedMentions: { users: winners },
                }).catch(() => {});
            } else {
                await channel.send({ content: `😢 Giveaway **${gw.prize}** berakhir tanpa peserta.` }).catch(() => {});
            }
        }
    } catch (e) {
        log('WARN', `[giveaway] Gagal menutup giveaway ${gw.id}: ${e.message}`);
    }
    return winners;
}

// ==================== SCHEDULER ====================
let _schedulerStarted = false;
function startGiveawayScheduler(client, intervalMs = 30000) {
    if (_schedulerStarted) return;
    _schedulerStarted = true;
    const tick = async () => {
        const due = getDueGiveaways();
        for (const gw of due) {
            await endGiveaway(client, gw).catch(() => {});
        }
    };
    setInterval(() => { tick().catch(() => {}); }, intervalMs);
}

// ==================== DETECTOR ====================
function isGiveawayJoin(customId) {
    return typeof customId === 'string' && customId.startsWith('gwjoin_');
}

module.exports = {
    parseDuration, formatDuration,
    createGiveaway, getGiveaway, getGuildGiveaways, getDueGiveaways, updateGiveaway, deleteGiveaway,
    hasEntry, addEntry, removeEntry, getEntryIds, countEntries,
    pickWinners, buildGiveawayMessage, handleGiveawayJoin, endGiveaway,
    startGiveawayScheduler, isGiveawayJoin,
};
