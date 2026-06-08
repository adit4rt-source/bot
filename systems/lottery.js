// systems/lottery.js — Togel (Number Betting 1-100)
//
// Players bet on a number 1-100 with `/togel angka:<n>` for a fixed price.
// Every bet adds to the round's pot. Every hour a random number 1-100 is drawn;
// everyone who picked it splits the whole pot equally. If nobody picked it, the
// pot rolls over to the next round (so it can grow into a big jackpot).
//
// Admins seed the starting pot with `/togel setpot:<amount>` (also becomes the
// per-round base seed). Per-guild rounds. Balances are global.
// Optional announcement channel: server_settings key `togel_channel`.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getSetting, addUserBalance, subtractUserBalance, addIncome, addSpending, incrementUserStat } = require('../database');
const { getRandomInt } = require('../utils');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

// ==================== CONFIG ====================
const BET_PRICE = 5000;               // money per number bet
const NUMBER_MIN = 1;
const NUMBER_MAX = 100;
const MAX_NUMBERS_PER_USER = 2;       // numbers a player can bet per round
const DRAW_INTERVAL_MS = 60 * 60 * 1000; // draw every 1 hour
const DEFAULT_SEED = 0;               // base pot each round (admin configurable)

// ==================== DATABASE ====================
// Migrate away from the earlier weekly-lottery schema (weekId-keyed) if present.
// This feature is unreleased, so dropping the old throwaway tables is safe.
try {
    const old = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='lottery_rounds'").get();
    if (old && old.sql && old.sql.includes('weekId')) {
        db.exec('DROP TABLE IF EXISTS lottery_rounds');
        db.exec('DROP TABLE IF EXISTS lottery_tickets');
        db.exec('DROP TABLE IF EXISTS lottery_bets');
    }
} catch (_) { /* fresh DB — nothing to migrate */ }

db.exec(`CREATE TABLE IF NOT EXISTS lottery_rounds (
    guildId TEXT,
    roundId INTEGER,
    pot INTEGER DEFAULT 0,
    status TEXT DEFAULT 'open',
    drawAt INTEGER,
    drawnNumber INTEGER DEFAULT NULL,
    totalBets INTEGER DEFAULT 0,
    winnersCount INTEGER DEFAULT 0,
    payoutEach INTEGER DEFAULT 0,
    carriedOver INTEGER DEFAULT 0,
    createdAt INTEGER,
    drawnAt INTEGER DEFAULT NULL,
    PRIMARY KEY (guildId, roundId)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS lottery_bets (
    guildId TEXT,
    roundId INTEGER,
    userId TEXT,
    username TEXT,
    number INTEGER,
    createdAt INTEGER,
    PRIMARY KEY (guildId, roundId, userId, number)
)`);

// ==================== CONFIG HELPERS ====================
function getSeed(guildId) {
    const v = getSetting(guildId, 'togel_seed', null);
    const n = v === null ? DEFAULT_SEED : parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SEED;
}
function setSeed(guildId, amount) {
    amount = Math.max(0, Math.floor(Number(amount) || 0));
    db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'togel_seed', String(amount));
    return amount;
}

// ==================== ROUND LIFECYCLE ====================
function getOpenRound(guildId) {
    return db.prepare("SELECT * FROM lottery_rounds WHERE guildId = ? AND status = 'open' ORDER BY roundId DESC LIMIT 1").get(guildId);
}
function getRoundRow(guildId, roundId) {
    return db.prepare('SELECT * FROM lottery_rounds WHERE guildId = ? AND roundId = ?').get(guildId, roundId);
}
function nextRoundId(guildId) {
    const row = db.prepare('SELECT MAX(roundId) AS m FROM lottery_rounds WHERE guildId = ?').get(guildId);
    return (row && row.m ? row.m : 0) + 1;
}

function createRound(guildId, pot, carriedOver = 0) {
    const roundId = nextRoundId(guildId);
    const drawAt = Date.now() + DRAW_INTERVAL_MS;
    db.prepare('INSERT INTO lottery_rounds (guildId, roundId, pot, status, drawAt, carriedOver, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(guildId, roundId, Math.max(0, Math.floor(pot)), 'open', drawAt, Math.max(0, Math.floor(carriedOver)), Date.now());
    return getRoundRow(guildId, roundId);
}

// Get (or lazily create) the current open round.
function getCurrentRound(guildId) {
    let round = getOpenRound(guildId);
    if (!round) round = createRound(guildId, getSeed(guildId), 0);
    return round;
}

function getUserBets(guildId, roundId, userId) {
    return db.prepare('SELECT * FROM lottery_bets WHERE guildId = ? AND roundId = ? AND userId = ?').all(guildId, roundId, userId);
}
function getRoundBets(guildId, roundId) {
    return db.prepare('SELECT * FROM lottery_bets WHERE guildId = ? AND roundId = ?').all(guildId, roundId);
}

// ==================== ADMIN: SET POT ====================
// Sets the per-round base seed AND tops the current round up to that pot.
function setPot(guildId, amount) {
    amount = Math.max(0, Math.floor(Number(amount) || 0));
    setSeed(guildId, amount);
    const round = getCurrentRound(guildId);
    if (round.pot < amount) {
        db.prepare('UPDATE lottery_rounds SET pot = ? WHERE guildId = ? AND roundId = ?').run(amount, guildId, round.roundId);
    }
    return { amount, roundId: round.roundId, pot: Math.max(round.pot, amount) };
}

// ==================== PLACE BET ====================
function placeBet(guildId, userId, username, number) {
    number = Math.floor(Number(number));
    if (!Number.isFinite(number) || number < NUMBER_MIN || number > NUMBER_MAX) {
        return { success: false, error: `❌ Angka harus antara **${NUMBER_MIN}-${NUMBER_MAX}**.` };
    }

    const round = getCurrentRound(guildId);
    const mine = getUserBets(guildId, round.roundId, userId);
    if (mine.some(b => b.number === number)) {
        return { success: false, error: `❌ Kamu sudah pasang angka **${number}** ronde ini.` };
    }
    if (mine.length >= MAX_NUMBERS_PER_USER) {
        return { success: false, error: `❌ Maksimal **${MAX_NUMBERS_PER_USER} angka** per ronde. Kamu sudah pasang: ${mine.map(b => b.number).join(', ')}.` };
    }

    const user = getOrCreateUser(guildId, userId);
    if (user.balance < BET_PRICE) {
        return { success: false, error: `❌ Saldo kurang! Pasang angka butuh 🪙 **${BET_PRICE.toLocaleString('id-ID')}**, saldomu 🪙 **${user.balance.toLocaleString('id-ID')}**.` };
    }

    subtractUserBalance(guildId, userId, BET_PRICE);
    addSpending(guildId, userId, 'lottery', BET_PRICE);
    db.prepare('UPDATE lottery_rounds SET pot = pot + ?, totalBets = totalBets + 1 WHERE guildId = ? AND roundId = ?')
        .run(BET_PRICE, guildId, round.roundId);
    db.prepare('INSERT INTO lottery_bets (guildId, roundId, userId, username, number, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
        .run(guildId, round.roundId, userId, username, number, Date.now());
    incrementUserStat(guildId, userId, 'togel_bets');

    const updated = getRoundRow(guildId, round.roundId);
    return {
        success: true,
        number,
        cost: BET_PRICE,
        pot: updated.pot,
        myNumbers: [...mine.map(b => b.number), number],
        newBalance: user.balance - BET_PRICE,
        drawAt: round.drawAt,
        roundId: round.roundId,
    };
}

// ==================== DRAW ====================
// forceNumber is only used by tests; production passes nothing (random).
function drawRound(guildId, roundId, forceNumber = null) {
    const round = getRoundRow(guildId, roundId);
    if (!round) return { success: false, error: 'no_round' };
    if (round.status === 'drawn') return { success: false, error: 'already_drawn' };

    const drawnNumber = forceNumber != null ? forceNumber : getRandomInt(NUMBER_MIN, NUMBER_MAX);
    const bets = getRoundBets(guildId, roundId);
    const totalBets = bets.length;

    // Distinct winners (a user can only bet a number once, so this is unique).
    const winners = bets.filter(b => b.number === drawnNumber);
    const pot = round.pot;

    let payoutEach = 0;
    if (winners.length > 0) {
        payoutEach = Math.floor(pot / winners.length);
        for (const w of winners) {
            addUserBalance(guildId, w.userId, payoutEach);
            addIncome(guildId, w.userId, 'event', payoutEach);
            incrementUserStat(guildId, w.userId, 'togel_wins');
            incrementUserStat(guildId, w.userId, 'togel_won_total', payoutEach);
        }
    }

    db.prepare("UPDATE lottery_rounds SET status = 'drawn', drawnAt = ?, drawnNumber = ?, totalBets = ?, winnersCount = ?, payoutEach = ? WHERE guildId = ? AND roundId = ?")
        .run(Date.now(), drawnNumber, totalBets, winners.length, payoutEach, guildId, roundId);

    // Open the next round: fresh seed if someone won, otherwise carry the pot.
    const seed = getSeed(guildId);
    const nextPot = winners.length > 0 ? seed : pot;
    const carried = winners.length > 0 ? 0 : pot;
    const next = createRound(guildId, nextPot, carried);

    return {
        success: true,
        drawnNumber,
        pot,
        totalBets,
        winners: winners.map(w => ({ userId: w.userId, username: w.username })),
        winnersCount: winners.length,
        payoutEach,
        nextRoundId: next.roundId,
        nextPot: next.pot,
        roundId,
    };
}

function getLastDrawn(guildId) {
    return db.prepare("SELECT * FROM lottery_rounds WHERE guildId = ? AND status = 'drawn' ORDER BY drawnAt DESC LIMIT 1").get(guildId);
}

// ==================== PANEL UI ====================
function buildLotteryPanel(guildId) {
    const round = getCurrentRound(guildId);
    const bets = getRoundBets(guildId, round.roundId);
    const uniqueNumbers = new Set(bets.map(b => b.number)).size;
    const players = new Set(bets.map(b => b.userId)).size;
    const last = getLastDrawn(guildId);

    let desc = '━━━━━━━━━━━━━━━━━━━━━━\n';
    desc += `🎰 **POT RONDE #${round.roundId}**\n`;
    desc += `# 🪙 ${round.pot.toLocaleString('id-ID')}\n`;
    if (round.carriedOver > 0) desc += `-# ↪️ termasuk carry-over 🪙 ${round.carriedOver.toLocaleString('id-ID')} dari ronde sebelumnya\n`;
    desc += '\n';
    desc += `> 🎟️ **Harga pasang angka: 🪙 ${BET_PRICE.toLocaleString('id-ID')}**\n`;
    desc += `> 🔢 Pilih angka **${NUMBER_MIN}-${NUMBER_MAX}** (maks **${MAX_NUMBERS_PER_USER}** angka/ronde)\n`;
    desc += `> ⏰ Diundi: <t:${Math.floor(round.drawAt / 1000)}:R> (tiap 1 jam)\n`;
    desc += `> 📦 Taruhan ronde ini: **${bets.length}** dari **${players}** pemain (${uniqueNumbers} angka)\n\n`;

    desc += `**📌 Cara pasang:**\n`;
    desc += `> Ketik \`/togel angka:19\` untuk pasang angka 19 (bayar 🪙 ${BET_PRICE.toLocaleString('id-ID')}).\n\n`;

    if (last) {
        desc += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        desc += `**🎲 Hasil Ronde Lalu (#${last.roundId}):**\n`;
        desc += `> 🔢 Angka keluar: **${last.drawnNumber}**\n`;
        if (last.winnersCount > 0) {
            desc += `> 🏆 **${last.winnersCount} pemenang** — masing-masing 🪙 **${last.payoutEach.toLocaleString('id-ID')}**\n`;
        } else {
            desc += `> 😶 Tidak ada pemenang — pot di-carry over!\n`;
        }
    }
    desc += `━━━━━━━━━━━━━━━━━━━━━━`;

    const embed = new EmbedBuilder()
        .setTitle('🎟️ TOGEL — Pasang Angka 1-100')
        .setColor('#F1C40F')
        .setDescription(desc)
        .setFooter({ text: `Harga pasang: ${BET_PRICE.toLocaleString('id-ID')} /angka • Undian tiap 1 jam` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('lottery_mybets').setLabel('Angka Saya').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('lottery_refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('lottery_info').setLabel('Cara Main').setEmoji('❓').setStyle(ButtonStyle.Secondary),
    );

    return { embeds: [embed], components: [row] };
}

// ==================== BUTTON HANDLER ====================
function isLotteryButton(customId) {
    return typeof customId === 'string' && customId.startsWith('lottery_');
}

async function handleLotteryButton(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const id = interaction.customId;

    if (id === 'lottery_refresh') {
        return interaction.update(buildLotteryPanel(guildId)).catch(() => {});
    }

    if (id === 'lottery_mybets') {
        const round = getCurrentRound(guildId);
        const mine = getUserBets(guildId, round.roundId, userId);
        const nums = mine.map(b => b.number);
        const embed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle('🧾 Angka Saya — Ronde #' + round.roundId)
            .setDescription(
                (nums.length ? `> 🔢 Angka kamu: **${nums.join(', ')}**\n` : `> 🔢 Kamu belum pasang angka ronde ini.\n`) +
                `> 🎟️ Sisa slot: **${MAX_NUMBERS_PER_USER - nums.length}** / ${MAX_NUMBERS_PER_USER}\n` +
                `> 💸 Total taruhan: 🪙 **${(nums.length * BET_PRICE).toLocaleString('id-ID')}**\n` +
                `> 🎰 Pot: 🪙 **${round.pot.toLocaleString('id-ID')}**\n\n` +
                `Pasang lagi: \`/togel angka:<${NUMBER_MIN}-${NUMBER_MAX}>\``
            );
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (id === 'lottery_info') {
        const embed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle('❓ Cara Main Togel (Pasang Angka)')
            .setDescription(
                `> 🔢 Pilih angka **${NUMBER_MIN}-${NUMBER_MAX}** dengan \`/togel angka:<n>\`.\n` +
                `> 🎟️ Tiap pasang angka bayar 🪙 **${BET_PRICE.toLocaleString('id-ID')}** (langsung masuk pot).\n` +
                `> 🧢 Maks **${MAX_NUMBERS_PER_USER} angka** per ronde per orang.\n` +
                `> ⏰ Tiap **1 jam** 1 angka diundi acak.\n` +
                `> 🏆 Semua yang pasang angka itu **bagi rata pot**.\n` +
                `> ↪️ Kalau tidak ada yang tembus, pot **carry-over** ke ronde berikutnya.`
            );
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

// ==================== SCHEDULER (auto hourly draw) ====================
async function announceDraw(client, guildId, result) {
    const channelId = getSetting(guildId, 'togel_channel', null);
    if (!channelId) return;
    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    if (result.winnersCount === 0) {
        await channel.send({
            embeds: [new EmbedBuilder().setColor('#95A5A6').setTitle(`🎲 Togel Ronde #${result.roundId} — Angka ${result.drawnNumber}`)
                .setDescription(`Tidak ada yang tembus angka **${result.drawnNumber}**.\n🎰 Pot 🪙 **${result.pot.toLocaleString('id-ID')}** di-**carry over** ke ronde #${result.nextRoundId}!`)],
        }).catch(() => {});
        return;
    }

    const winnerMentions = result.winners.map(w => `<@${w.userId}>`).join(', ');
    await channel.send({
        content: `🎉 Selamat ${winnerMentions}!`,
        embeds: [new EmbedBuilder().setColor('#F1C40F').setTitle(`🎲🎉 TOGEL RONDE #${result.roundId} — ANGKA ${result.drawnNumber}!`)
            .setDescription(
                `🏆 **${result.winnersCount} pemenang** tembus angka **${result.drawnNumber}**!\n\n` +
                `> 🪙 Masing-masing dapat: **${result.payoutEach.toLocaleString('id-ID')}**\n` +
                `> 🎰 Total pot: **${result.pot.toLocaleString('id-ID')}**\n` +
                `> 📦 Total taruhan: **${result.totalBets}**\n\n` +
                `*Ronde #${result.nextRoundId} sudah dibuka — pasang angkamu dengan \`/togel angka:<n>\`!*`
            ).setTimestamp()],
        allowedMentions: { users: result.winners.map(w => w.userId) },
    }).catch(() => {});

    for (const w of result.winners) {
        try {
            const u = await client.users.fetch(w.userId).catch(() => null);
            if (u) await u.send(`🎉 Selamat! Angka **${result.drawnNumber}** tembus — kamu dapat 🪙 **${result.payoutEach.toLocaleString('id-ID')}** dari Togel!`).catch(() => {});
        } catch (_) { /* DMs closed */ }
    }
}

let _schedulerStarted = false;
function startLotteryScheduler(client, intervalMs = 60000) {
    if (_schedulerStarted) return;
    _schedulerStarted = true;
    const tick = async () => {
        const now = Date.now();
        const due = db.prepare("SELECT guildId, roundId FROM lottery_rounds WHERE status = 'open' AND drawAt <= ?").all(now);
        for (const r of due) {
            try {
                const result = drawRound(r.guildId, r.roundId);
                if (result.success) await announceDraw(client, r.guildId, result);
            } catch (e) {
                log('WARN', `[lottery] draw failed for ${r.guildId}/#${r.roundId}: ${e.message}`);
            }
        }
    };
    setTimeout(() => { tick().catch(() => {}); }, 10000);
    setInterval(() => { tick().catch(() => {}); }, intervalMs);
}

module.exports = {
    BET_PRICE, NUMBER_MIN, NUMBER_MAX, MAX_NUMBERS_PER_USER, DRAW_INTERVAL_MS, DEFAULT_SEED,
    getSeed, setSeed, setPot,
    getCurrentRound, getRoundRow, getOpenRound, getUserBets, getRoundBets, getLastDrawn,
    placeBet, drawRound,
    buildLotteryPanel, isLotteryButton, handleLotteryButton,
    startLotteryScheduler, announceDraw,
};
