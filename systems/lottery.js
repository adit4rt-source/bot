// systems/lottery.js — Weekly Lottery / Togel
//
// Players buy tickets with money. A share of every purchase feeds a weekly
// jackpot (the rest is burned — a healthy money sink). Every Monday 00:00 WIB
// the round is drawn: one winner is picked, weighted by how many tickets they
// hold, and takes the whole jackpot. If nobody bought tickets, the jackpot
// rolls over into next week.
//
// Per-guild rounds (own jackpot/draw per server). Balances are global.
// Optional announcement channel: server_settings key `togel_channel`.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const { db, getOrCreateUser, getSetting, addUserBalance, subtractUserBalance, addIncome, addSpending, incrementUserStat } = require('../database');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

// ==================== CONFIG ====================
const TICKET_PRICE = 500;            // money per ticket
const JACKPOT_CONTRIB = 0.70;        // 70% of each sale feeds the jackpot; 30% burned (sink)
const SEED_JACKPOT = 5000;           // base jackpot each fresh week
const MAX_TICKETS_PER_USER = 100;    // cap per user per week (anti-whale)

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS lottery_rounds (
    guildId TEXT,
    weekId TEXT,
    jackpot INTEGER DEFAULT 0,
    ticketsSold INTEGER DEFAULT 0,
    status TEXT DEFAULT 'open',
    winnerId TEXT DEFAULT NULL,
    winnerName TEXT DEFAULT NULL,
    winnerTickets INTEGER DEFAULT 0,
    totalTickets INTEGER DEFAULT 0,
    participants INTEGER DEFAULT 0,
    carriedOver INTEGER DEFAULT 0,
    createdAt INTEGER,
    drawnAt INTEGER DEFAULT NULL,
    PRIMARY KEY (guildId, weekId)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS lottery_tickets (
    guildId TEXT,
    weekId TEXT,
    userId TEXT,
    username TEXT,
    tickets INTEGER DEFAULT 0,
    spent INTEGER DEFAULT 0,
    PRIMARY KEY (guildId, weekId, userId)
)`);

// ==================== TIME HELPERS ====================
// Weekly key (WIB, Monday reset) — same scheme as World Boss / quests.
function getWeekId(date = new Date()) {
    const wib = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const year = wib.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const days = Math.floor((wib - startOfYear) / 86400000);
    const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

// Unix seconds of the next Monday 00:00 WIB (used for the countdown display).
function nextDrawUnix() {
    const now = new Date();
    const wib = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const day = wib.getDay(); // 0=Sun..6=Sat
    const daysUntilMonday = ((8 - day) % 7) || 7; // always next Monday (>=1)
    const next = new Date(wib);
    next.setDate(wib.getDate() + daysUntilMonday);
    next.setHours(0, 0, 0, 0);
    // Convert WIB wall-clock back to a real instant: WIB = UTC+7.
    const utcMs = next.getTime() - (7 * 3600 * 1000) - (next.getTimezoneOffset() * 60000) * 0;
    // Simpler & robust: compute offset between the parsed-WIB clock and real now.
    const driftMs = now.getTime() - wib.getTime();
    return Math.floor((next.getTime() + driftMs) / 1000);
}

// ==================== ROUND LIFECYCLE ====================
function getRoundRow(guildId, weekId) {
    return db.prepare('SELECT * FROM lottery_rounds WHERE guildId = ? AND weekId = ?').get(guildId, weekId);
}

// Get (or lazily create) the current open round for a guild.
function getCurrentRound(guildId) {
    const weekId = getWeekId();
    let round = getRoundRow(guildId, weekId);
    if (round) return round;

    // Roll over any undrawn-with-no-winner jackpot from a previous week.
    let carry = 0;
    const prevCarry = db.prepare(
        "SELECT weekId, jackpot FROM lottery_rounds WHERE guildId = ? AND status = 'drawn' AND winnerId IS NULL AND jackpot > 0 ORDER BY weekId DESC LIMIT 1"
    ).get(guildId);
    if (prevCarry) {
        carry = prevCarry.jackpot;
        // Zero it out so it can't be carried twice.
        db.prepare('UPDATE lottery_rounds SET jackpot = 0 WHERE guildId = ? AND weekId = ?').run(guildId, prevCarry.weekId);
    }

    db.prepare(
        'INSERT OR IGNORE INTO lottery_rounds (guildId, weekId, jackpot, status, carriedOver, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(guildId, weekId, SEED_JACKPOT + carry, 'open', carry, Date.now());

    return getRoundRow(guildId, weekId);
}

function getUserTicket(guildId, weekId, userId) {
    return db.prepare('SELECT * FROM lottery_tickets WHERE guildId = ? AND weekId = ? AND userId = ?').get(guildId, weekId, userId);
}

function getRoundTickets(guildId, weekId) {
    return db.prepare('SELECT * FROM lottery_tickets WHERE guildId = ? AND weekId = ? AND tickets > 0 ORDER BY tickets DESC').all(guildId, weekId);
}

// ==================== BUY TICKETS ====================
function buyTickets(guildId, userId, username, qty) {
    qty = Math.floor(Number(qty) || 0);
    if (qty <= 0) return { success: false, error: '❌ Jumlah tiket tidak valid.' };

    const round = getCurrentRound(guildId);
    if (round.status !== 'open') return { success: false, error: '❌ Undian minggu ini sudah ditutup. Tunggu minggu baru ya!' };
    const existing = getUserTicket(guildId, round.weekId, userId);
    const owned = existing ? existing.tickets : 0;
    if (owned + qty > MAX_TICKETS_PER_USER) {
        return { success: false, error: `❌ Maksimal **${MAX_TICKETS_PER_USER} tiket** per minggu. Kamu sudah punya **${owned}**.` };
    }

    const cost = qty * TICKET_PRICE;
    const user = getOrCreateUser(guildId, userId);
    if (user.balance < cost) {
        return { success: false, error: `❌ Saldo kurang! Butuh 🪙 **${cost.toLocaleString('id-ID')}**, saldomu 🪙 **${user.balance.toLocaleString('id-ID')}**.` };
    }

    // Charge the player.
    subtractUserBalance(guildId, userId, cost);
    addSpending(guildId, userId, 'lottery', cost);

    // Feed the jackpot (70%); the remaining 30% is burned (money sink).
    const contrib = Math.floor(cost * JACKPOT_CONTRIB);
    db.prepare('UPDATE lottery_rounds SET jackpot = jackpot + ?, ticketsSold = ticketsSold + ? WHERE guildId = ? AND weekId = ?')
        .run(contrib, qty, guildId, round.weekId);

    // Record the player's tickets.
    if (existing) {
        db.prepare('UPDATE lottery_tickets SET tickets = tickets + ?, spent = spent + ?, username = ? WHERE guildId = ? AND weekId = ? AND userId = ?')
            .run(qty, cost, username, guildId, round.weekId, userId);
    } else {
        db.prepare('INSERT INTO lottery_tickets (guildId, weekId, userId, username, tickets, spent) VALUES (?, ?, ?, ?, ?, ?)')
            .run(guildId, round.weekId, userId, username, qty, cost);
    }

    incrementUserStat(guildId, userId, 'lottery_tickets_bought', qty);

    const updated = getRoundRow(guildId, round.weekId);
    return {
        success: true,
        qty,
        cost,
        contrib,
        ownedTickets: owned + qty,
        jackpot: updated.jackpot,
        ticketsSold: updated.ticketsSold,
        newBalance: user.balance - cost,
        weekId: round.weekId,
    };
}

// ==================== DRAW ====================
function pickWeightedWinner(tickets) {
    const total = tickets.reduce((s, t) => s + t.tickets, 0);
    if (total <= 0) return null;
    let r = Math.floor(Math.random() * total);
    for (const t of tickets) {
        r -= t.tickets;
        if (r < 0) return t;
    }
    return tickets[tickets.length - 1];
}

// Draw a specific round (defaults to the current week's). Idempotent: a round
// can only be drawn once.
function drawRound(guildId, weekId = getWeekId()) {
    const round = getRoundRow(guildId, weekId);
    if (!round) return { success: false, error: 'no_round' };
    if (round.status === 'drawn') return { success: false, error: 'already_drawn' };

    const tickets = getRoundTickets(guildId, weekId);
    const totalTickets = tickets.reduce((s, t) => s + t.tickets, 0);
    const participants = tickets.length;

    if (participants === 0) {
        // No buyers — keep the jackpot so getCurrentRound() rolls it over.
        db.prepare("UPDATE lottery_rounds SET status = 'drawn', drawnAt = ?, totalTickets = 0, participants = 0 WHERE guildId = ? AND weekId = ?")
            .run(Date.now(), guildId, weekId);
        return { success: true, winner: null, jackpot: round.jackpot, totalTickets: 0, participants: 0, weekId };
    }

    const winner = pickWeightedWinner(tickets);
    const payout = round.jackpot;

    addUserBalance(guildId, winner.userId, payout);
    addIncome(guildId, winner.userId, 'event', payout);
    incrementUserStat(guildId, winner.userId, 'lottery_wins');
    incrementUserStat(guildId, winner.userId, 'lottery_won_total', payout);

    db.prepare("UPDATE lottery_rounds SET status = 'drawn', drawnAt = ?, winnerId = ?, winnerName = ?, winnerTickets = ?, totalTickets = ?, participants = ? WHERE guildId = ? AND weekId = ?")
        .run(Date.now(), winner.userId, winner.username, winner.tickets, totalTickets, participants, guildId, weekId);

    return {
        success: true,
        winner,
        payout,
        jackpot: payout,
        totalTickets,
        participants,
        odds: ((winner.tickets / totalTickets) * 100),
        weekId,
    };
}

function getLastDrawn(guildId) {
    return db.prepare("SELECT * FROM lottery_rounds WHERE guildId = ? AND status = 'drawn' AND winnerId IS NOT NULL ORDER BY drawnAt DESC LIMIT 1").get(guildId);
}

// ==================== PANEL UI ====================
function buildLotteryPanel(guildId) {
    const round = getCurrentRound(guildId);
    const tickets = getRoundTickets(guildId, round.weekId);
    const totalTickets = tickets.reduce((s, t) => s + t.tickets, 0);
    const last = getLastDrawn(guildId);

    let desc = '━━━━━━━━━━━━━━━━━━━━━━\n';
    desc += `🎰 **JACKPOT MINGGU INI**\n`;
    desc += `# 🪙 ${round.jackpot.toLocaleString('id-ID')}\n`;
    if (round.carriedOver > 0) desc += `-# ↪️ termasuk carry-over 🪙 ${round.carriedOver.toLocaleString('id-ID')} dari minggu lalu\n`;
    desc += '\n';
    desc += `> 🎟️ Harga tiket: **${TICKET_PRICE.toLocaleString('id-ID')}** /tiket\n`;
    desc += `> 📦 Tiket terjual: **${totalTickets.toLocaleString('id-ID')}** (${tickets.length} peserta)\n`;
    desc += `> ⏰ Undian: <t:${nextDrawUnix()}:R> (Senin 00:00 WIB)\n`;
    desc += `> 🧢 Maks **${MAX_TICKETS_PER_USER}** tiket/orang\n\n`;

    if (tickets.length > 0) {
        desc += `**🏆 Pembeli Teratas:**\n`;
        tickets.slice(0, 5).forEach((t, i) => {
            const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i] || `${i + 1}.`;
            const pct = totalTickets ? ((t.tickets / totalTickets) * 100).toFixed(1) : '0';
            desc += `> ${medal} **${t.username || 'Unknown'}** — ${t.tickets} tiket (${pct}%)\n`;
        });
        desc += '\n';
    }

    if (last && last.winnerId) {
        desc += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        desc += `**🎉 Pemenang Minggu Lalu (${last.weekId}):**\n`;
        desc += `> 👑 <@${last.winnerId}> menang 🪙 **${last.jackpot.toLocaleString('id-ID')}**!\n`;
    }
    desc += `━━━━━━━━━━━━━━━━━━━━━━`;

    const embed = new EmbedBuilder()
        .setTitle('🎟️ TOGEL MINGGUAN — Weekly Lottery')
        .setColor('#F1C40F')
        .setDescription(desc)
        .setFooter({ text: 'Beli tiket → makin banyak tiket, makin besar peluang menang!' })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('lottery_buy_1').setLabel(`Beli 1 (${TICKET_PRICE.toLocaleString('id-ID')})`).setEmoji('🎟️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('lottery_buy_5').setLabel(`Beli 5`).setEmoji('🎟️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('lottery_buy_10').setLabel(`Beli 10`).setEmoji('🎟️').setStyle(ButtonStyle.Success),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('lottery_mytickets').setLabel('Tiket Saya').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('lottery_refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('lottery_info').setLabel('Cara Main').setEmoji('❓').setStyle(ButtonStyle.Secondary),
    );

    return { embeds: [embed], components: [row1, row2] };
}

// ==================== BUTTON HANDLER ====================
function isLotteryButton(customId) {
    return typeof customId === 'string' && customId.startsWith('lottery_');
}

async function handleLotteryButton(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const id = interaction.customId;

    // Buy buttons.
    if (id === 'lottery_buy_1' || id === 'lottery_buy_5' || id === 'lottery_buy_10') {
        const qty = parseInt(id.split('_')[2], 10);
        const result = buyTickets(guildId, userId, username, qty);
        if (!result.success) {
            return interaction.reply({ content: result.error, ephemeral: true });
        }
        // Refresh the shared panel for everyone, plus a private confirmation.
        await interaction.update(buildLotteryPanel(guildId)).catch(() => {});
        return interaction.followUp({
            content: `✅ Kamu beli **${result.qty} tiket** seharga 🪙 **${result.cost.toLocaleString('id-ID')}**!\n> 🎟️ Total tiketmu: **${result.ownedTickets}**\n> 🪙 Saldo: **${result.newBalance.toLocaleString('id-ID')}**\n> 🎰 Jackpot sekarang: **${result.jackpot.toLocaleString('id-ID')}**`,
            ephemeral: true,
        }).catch(() => {});
    }

    if (id === 'lottery_refresh') {
        return interaction.update(buildLotteryPanel(guildId)).catch(() => {});
    }

    if (id === 'lottery_mytickets') {
        const round = getCurrentRound(guildId);
        const t = getUserTicket(guildId, round.weekId, userId);
        const owned = t ? t.tickets : 0;
        const allTickets = getRoundTickets(guildId, round.weekId);
        const totalTickets = allTickets.reduce((s, x) => s + x.tickets, 0);
        const odds = totalTickets ? ((owned / totalTickets) * 100).toFixed(2) : '0';
        const embed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle('🧾 Tiket Saya')
            .setDescription(
                `> 🎟️ Tiket minggu ini: **${owned}** / ${MAX_TICKETS_PER_USER}\n` +
                `> 💸 Total dibelanjakan: 🪙 **${(t ? t.spent : 0).toLocaleString('id-ID')}**\n` +
                `> 🎯 Peluang menang: **${odds}%** (dari ${totalTickets} tiket)\n` +
                `> 🎰 Jackpot: 🪙 **${round.jackpot.toLocaleString('id-ID')}**`
            );
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (id === 'lottery_info') {
        const embed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle('❓ Cara Main Togel Mingguan')
            .setDescription(
                `> 🎟️ Beli tiket seharga **${TICKET_PRICE.toLocaleString('id-ID')}** /tiket (maks **${MAX_TICKETS_PER_USER}**/minggu).\n` +
                `> 🎰 **${Math.round(JACKPOT_CONTRIB * 100)}%** dari tiap pembelian masuk ke **jackpot**.\n` +
                `> 👑 Setiap **Senin 00:00 WIB**, 1 pemenang diundi — makin banyak tiket, makin besar peluang.\n` +
                `> 💰 Pemenang membawa pulang **seluruh jackpot**.\n` +
                `> ↪️ Kalau minggu itu tidak ada yang beli, jackpot **carry-over** ke minggu depan.`
            );
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Admin: set this channel as the weekly winner announcement channel.
    if (id === 'lottery_setchannel') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: '❌ Hanya admin (Manage Server) yang bisa mengatur channel pengumuman.', ephemeral: true });
        }
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'togel_channel', interaction.channelId);
        return interaction.reply({ content: `✅ Pengumuman pemenang togel akan dikirim ke <#${interaction.channelId}>.`, ephemeral: true });
    }
}

// ==================== SCHEDULER (auto weekly draw) ====================
async function announceDraw(client, guildId, result) {
    const channelId = getSetting(guildId, 'togel_channel', null);
    if (!channelId) return;
    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    if (!result.winner) {
        await channel.send({
            embeds: [new EmbedBuilder().setColor('#95A5A6').setTitle('🎟️ Togel Mingguan — Tidak Ada Pemenang')
                .setDescription(`Minggu **${result.weekId}** tidak ada yang beli tiket.\n🎰 Jackpot 🪙 **${result.jackpot.toLocaleString('id-ID')}** di-**carry over** ke minggu depan!`)],
        }).catch(() => {});
        return;
    }

    await channel.send({
        content: `🎉 Selamat <@${result.winner.userId}>!`,
        embeds: [new EmbedBuilder().setColor('#F1C40F').setTitle('🎟️🎉 PEMENANG TOGEL MINGGUAN!')
            .setDescription(
                `👑 <@${result.winner.userId}> memenangkan jackpot!\n\n` +
                `> 🪙 Hadiah: **${result.payout.toLocaleString('id-ID')}**\n` +
                `> 🎟️ Tiket: **${result.winner.tickets}** / ${result.totalTickets} (${result.odds.toFixed(1)}% peluang)\n` +
                `> 👥 Peserta: **${result.participants}**\n` +
                `> 📅 Minggu: **${result.weekId}**\n\n` +
                `*Togel minggu baru sudah dibuka — beli tiketmu dengan \`/togel\`!*`
            ).setTimestamp()],
        allowedMentions: { users: [result.winner.userId] },
    }).catch(() => {});

    // Best-effort DM to the winner.
    try {
        const u = await client.users.fetch(result.winner.userId).catch(() => null);
        if (u) await u.send(`🎉 Selamat! Kamu memenangkan Togel Mingguan: 🪙 **${result.payout.toLocaleString('id-ID')}**!`).catch(() => {});
    } catch (_) { /* DMs closed */ }
}

let _schedulerStarted = false;
function startLotteryScheduler(client, intervalMs = 60000) {
    if (_schedulerStarted) return;
    _schedulerStarted = true;
    const tick = async () => {
        const currentWeek = getWeekId();
        // Any open round from a past week is due to be drawn.
        const due = db.prepare("SELECT guildId, weekId FROM lottery_rounds WHERE status = 'open' AND weekId != ?").all(currentWeek);
        for (const r of due) {
            try {
                const result = drawRound(r.guildId, r.weekId);
                if (result.success) await announceDraw(client, r.guildId, result);
            } catch (e) {
                log('WARN', `[lottery] draw failed for ${r.guildId}/${r.weekId}: ${e.message}`);
            }
        }
    };
    // Run shortly after startup, then on an interval.
    setTimeout(() => { tick().catch(() => {}); }, 10000);
    setInterval(() => { tick().catch(() => {}); }, intervalMs);
}

module.exports = {
    TICKET_PRICE, JACKPOT_CONTRIB, SEED_JACKPOT, MAX_TICKETS_PER_USER,
    getWeekId, nextDrawUnix,
    getCurrentRound, getRoundRow, getUserTicket, getRoundTickets, getLastDrawn,
    buyTickets, drawRound, pickWeightedWinner,
    buildLotteryPanel, isLotteryButton, handleLotteryButton,
    startLotteryScheduler, announceDraw,
};
