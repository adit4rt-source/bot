// systems/arena.js — Pet PvP Ranked Arena (ELO rating + leaderboard).
// Players fight an AI-controlled snapshot of another player's active pet.
// Only the active player's rating changes (offline opponents are never penalized).
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getUserStat, setUserStat, incrementUserStat, addUserBalance, addIncome } = require('../database');
const { simulatePvP, getPetData } = require('./pets');
const { PET_DATA } = require('../data/pets');
const cooldowns = require('./cooldowns');

const BASE_RATING = 1000;
const K_FACTOR = 32;
const RATING_FLOOR = 100;
const FIGHT_COOLDOWN_MS = 30000;

const ARENA_TIERS = [
    { min: 0,    name: 'Bronze',   emoji: '🥉' },
    { min: 1100, name: 'Silver',   emoji: '🥈' },
    { min: 1250, name: 'Gold',     emoji: '🥇' },
    { min: 1400, name: 'Platinum', emoji: '💠' },
    { min: 1600, name: 'Diamond',  emoji: '💎' },
    { min: 1850, name: 'Master',   emoji: '👑' },
];

function getTier(rating) {
    let t = ARENA_TIERS[0];
    for (const x of ARENA_TIERS) if (rating >= x.min) t = x;
    return t;
}

function getRating(guildId, userId) {
    const r = getUserStat(guildId, userId, 'arena_rating');
    return r && r > 0 ? r : BASE_RATING;
}

function setRating(guildId, userId, rating) {
    setUserStat(guildId, userId, 'arena_rating', Math.max(RATING_FLOOR, Math.round(rating)));
}

function getArenaStats(guildId, userId) {
    const rating = getRating(guildId, userId);
    const wins = getUserStat(guildId, userId, 'arena_wins') || 0;
    const losses = getUserStat(guildId, userId, 'arena_losses') || 0;
    return { rating, wins, losses, tier: getTier(rating) };
}


// Pick an opponent: another user with an active pet, rating as close as possible.
function findOpponent(guildId, userId, myRating) {
    let rows;
    try { rows = db.prepare('SELECT DISTINCT userId FROM pets WHERE active = 1 AND userId != ?').all(userId); }
    catch (_) { rows = []; }
    if (!rows.length) return null;
    const scored = rows.map(r => {
        const rt = getRating(guildId, r.userId);
        return { userId: r.userId, rating: rt, dist: Math.abs(rt - myRating) };
    });
    scored.sort((a, b) => a.dist - b.dist);
    const pool = scored.slice(0, 5); // closest 5, pick one at random for variety
    return pool[Math.floor(Math.random() * pool.length)];
}

// Run one ranked fight. Returns a result object or { error }.
function doArenaFight(guildId, userId) {
    const myPet = getPetData(guildId, userId);
    if (!myPet) return { error: 'no_pet' };
    const myRating = getRating(guildId, userId);
    const opp = findOpponent(guildId, userId, myRating);
    if (!opp) return { error: 'no_opponent' };
    const oppPet = getPetData(guildId, opp.userId);
    if (!oppPet) return { error: 'no_opponent' };

    const myDef = PET_DATA.find(p => p.id === myPet.petId) || { emoji: '🐾' };
    const oppDef = PET_DATA.find(p => p.id === oppPet.petId) || { emoji: '🐾' };
    const result = simulatePvP(myPet, myDef, oppPet, oppDef);
    const win = result.winner === 1;

    // ELO update (only the active player's rating moves)
    const expected = 1 / (1 + Math.pow(10, (opp.rating - myRating) / 400));
    const change = Math.round(K_FACTOR * ((win ? 1 : 0) - expected));
    const newRating = Math.max(RATING_FLOOR, myRating + change);
    setRating(guildId, userId, newRating);
    incrementUserStat(guildId, userId, win ? 'arena_wins' : 'arena_losses');

    let reward = 0;
    if (win) {
        reward = 500 + Math.floor(newRating / 5);
        addUserBalance(guildId, userId, reward);
        addIncome(guildId, userId, 'battle', reward);
    }
    return { win, myPet, myDef, oppPet, oppDef, oppUserId: opp.userId, change, oldRating: myRating, newRating, reward, log: result.log };
}


function buildArenaPanel(guildId, userId, username) {
    const s = getArenaStats(guildId, userId);
    const total = s.wins + s.losses;
    const wr = total > 0 ? Math.round((s.wins / total) * 100) : 0;
    const embed = new EmbedBuilder()
        .setColor('#E67E22')
        .setTitle(`⚔️ RANKED ARENA — ${username}`)
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `${s.tier.emoji} **${s.tier.name}**  •  🏆 **${s.rating}** MMR\n` +
            `> ✅ Menang: **${s.wins}**  ❌ Kalah: **${s.losses}**  📊 Winrate: **${wr}%**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Lawan pet pemain lain (snapshot) untuk naik peringkat!\n` +
            `> ⚔️ Menang → MMR naik + 🪙 reward\n` +
            `> ❌ Kalah → MMR turun (tidak kehilangan uang)\n` +
            `> 🛡️ Pet aktifmu yang dipakai bertarung`
        )
        .setFooter({ text: 'Ranked Arena • ELO-based matchmaking' });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`arena_fight_${userId}`).setLabel('⚔️ Cari Lawan').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`arena_lb_${userId}`).setLabel('🏆 Leaderboard').setStyle(ButtonStyle.Primary)
    );
    return { embeds: [embed], components: [row] };
}

function buildArenaLeaderboard(guildId, userId, username) {
    let rows = [];
    try { rows = db.prepare("SELECT userId, stat_value AS rating FROM user_stats WHERE stat_key = 'arena_rating' ORDER BY stat_value DESC LIMIT 10").all(); }
    catch (_) { rows = []; }
    const medals = ['🥇', '🥈', '🥉'];
    let desc = rows.length ? '' : '*Belum ada peserta arena. Jadilah yang pertama!*';
    rows.forEach((r, i) => {
        const tier = getTier(r.rating);
        desc += `${medals[i] || `**#${i + 1}**`} <@${r.userId}> — ${tier.emoji} **${r.rating}** (${tier.name})\n`;
    });
    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏆 ARENA LEADERBOARD — Top 10')
        .setDescription(desc)
        .setFooter({ text: 'Naik peringkat dengan menang ranked fight!' });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`arena_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
}


async function handleArenaCommand(interaction) {
    const guildId = interaction.guild.id;
    return interaction.reply(buildArenaPanel(guildId, interaction.user.id, interaction.user.username));
}

async function handleArenaButton(interaction) {
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];
    const guildId = interaction.guild.id;
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Ini bukan panel arena kamu!', ephemeral: true });
    const action = parts[1];

    if (action === 'back') return interaction.update(buildArenaPanel(guildId, userId, interaction.user.username));
    if (action === 'lb') return interaction.update(buildArenaLeaderboard(guildId, userId, interaction.user.username));
    if (action === 'fight') {
        const rem = cooldowns.getRemaining('arena', guildId, userId);
        if (rem > 0) return interaction.reply({ content: `⏳ Tunggu **${Math.ceil(rem / 1000)} detik** sebelum cari lawan lagi.`, ephemeral: true });
        const res = doArenaFight(guildId, userId);
        if (res.error === 'no_pet') return interaction.reply({ content: '❌ Kamu belum punya pet aktif! Tetaskan/aktifkan pet dulu di `/pet`.', ephemeral: true });
        if (res.error === 'no_opponent') return interaction.reply({ content: '❌ Belum ada lawan tersedia (belum ada pemain lain dengan pet aktif). Coba lagi nanti.', ephemeral: true });
        cooldowns.setCooldown('arena', guildId, userId, FIGHT_COOLDOWN_MS);
        const tier = getTier(res.newRating);
        const sign = res.change >= 0 ? '+' : '';
        const embed = new EmbedBuilder()
            .setColor(res.win ? '#2ECC71' : '#E74C3C')
            .setTitle(res.win ? '⚔️ RANKED — MENANG! 🏆' : '⚔️ RANKED — KALAH 💀')
            .setDescription(
                `${res.myDef.emoji} **${res.myPet.name}** vs ${res.oppDef.emoji} **${res.oppPet.name}** (<@${res.oppUserId}>)\n\n` +
                res.log.slice(-6).join('\n') +
                `\n\n━━━━━━━━━━━━━━━━━━━━━━\n` +
                `${tier.emoji} MMR: **${res.oldRating} → ${res.newRating}** (${sign}${res.change})\n` +
                (res.win ? `🎁 Reward: 🪙 **${res.reward.toLocaleString('id-ID')}**` : `Jangan menyerah — coba lagi!`)
            )
            .setFooter({ text: `${tier.name} • Ranked Arena` });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`arena_fight_${userId}`).setLabel('⚔️ Cari Lawan Lagi').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`arena_back_${userId}`).setLabel('🔙 Arena').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

function isArenaButton(customId) {
    return typeof customId === 'string' && customId.startsWith('arena_');
}

module.exports = { handleArenaCommand, handleArenaButton, isArenaButton, buildArenaPanel, buildArenaLeaderboard, doArenaFight, getArenaStats, getRating, getTier };
