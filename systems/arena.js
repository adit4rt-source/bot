// systems/arena.js — Pet PvP Ranked Arena (ELO rating + leaderboard).
// Features: ELO matchmaking, win streak bonus, arena points, tier promotion
// rewards, arena shop (exclusive items), monthly seasons with end-of-season rewards.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { db, getOrCreateUser, getUserStat, setUserStat, incrementUserStat, addUserBalance, addIncome, addItem } = require('../database');
const { simulatePvP, getPetData } = require('./pets');
const { PET_DATA } = require('../data/pets');
const { getRandomInt } = require('../utils');
const cooldowns = require('./cooldowns');

const BASE_RATING = 1000;
const K_FACTOR = 32;
const RATING_FLOOR = 100;
const FIGHT_COOLDOWN_MS = 45000; // 45 seconds between fights (was 30)
const MAX_AP_PER_DAY = 500;      // Cap arena points earned per day
const MAX_FIGHTS_PER_DAY = 50;   // Max fights per day to prevent mindless farming

// ==================== TIER SYSTEM ====================
const ARENA_TIERS = [
    { min: 0,    name: 'Bronze',   emoji: '🥉', promotionReward: { money: 0, points: 0, item: null } },
    { min: 1100, name: 'Silver',   emoji: '🥈', promotionReward: { money: 5000, points: 50, item: 'mystery_box' } },
    { min: 1250, name: 'Gold',     emoji: '🥇', promotionReward: { money: 15000, points: 100, item: 'mystery_box' } },
    { min: 1400, name: 'Platinum', emoji: '💠', promotionReward: { money: 35000, points: 200, item: 'lucky_charm' } },
    { min: 1600, name: 'Diamond',  emoji: '💎', promotionReward: { money: 75000, points: 400, item: 'xp_booster_3x' } },
    { min: 1850, name: 'Master',   emoji: '👑', promotionReward: { money: 150000, points: 800, item: 'mythic_fragment' } },
];

// ==================== ARENA SHOP ====================
const ARENA_SHOP = [
    { id: 'arena_relic_box', name: 'Arena Relic Box', emoji: '🗡️', cost: 300, desc: 'Random relic (arena-exclusive)' },
    { id: 'arena_egg', name: 'Arena Egg', emoji: '🥚', cost: 500, desc: 'Egg eksklusif (Epic-Mythic)' },
    { id: 'premium_feed', name: 'Premium Feed x5', emoji: '⭐', cost: 100, desc: '5x Pakan Premium (untuk evolve ternak)', qty: 5 },
    { id: 'mystery_box', name: 'Mystery Box x3', emoji: '📦', cost: 150, desc: '3x Mystery Box', qty: 3 },
    { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡', cost: 200, desc: 'Triple XP 1 jam' },
    { id: 'lucky_charm', name: 'Lucky Charm', emoji: '🍀', cost: 250, desc: '+15% chance menang semua game' },
    { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', cost: 600, desc: 'Bahan awakening' },
    { id: 'awakening_crystal', name: 'Awakening Crystal', emoji: '💫', cost: 1500, desc: 'Langsung untuk awakening' },
];

// ==================== WIN STREAK MULTIPLIERS ====================
const STREAK_BONUS = [
    { streak: 3, mult: 1.5, label: '🔥 x1.5' },
    { streak: 5, mult: 2.0, label: '🔥🔥 x2' },
    { streak: 7, mult: 2.5, label: '🔥🔥🔥 x2.5' },
    { streak: 10, mult: 3.0, label: '💥 x3' },
];

function getStreakMultiplier(streak) {
    let mult = 1.0, label = '';
    for (const s of STREAK_BONUS) {
        if (streak >= s.streak) { mult = s.mult; label = s.label; }
    }
    return { mult, label };
}

// ==================== SEASON SYSTEM ====================
function getCurrentSeason() {
    const now = new Date();
    const month = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7); // YYYY-MM
    const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const [y, m] = month.split('-');
    return { id: month, name: `Season ${monthNames[parseInt(m)]} ${y}`, month: parseInt(m), year: parseInt(y) };
}

function getSeasonEndDate() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return Math.floor(nextMonth.getTime() / 1000);
}

// End-of-season rewards (top players)
const SEASON_REWARDS = [
    { rank: 1, money: 500000, points: 2000, title: '🏆 Arena Champion' },
    { rank: 2, money: 300000, points: 1200, title: '🥈 Arena Runner-up' },
    { rank: 3, money: 200000, points: 800, title: '🥉 Arena 3rd Place' },
    { rank: 4, money: 100000, points: 500, title: null }, // rank 4-5
    { rank: 5, money: 100000, points: 500, title: null },
    { rank: 10, money: 50000, points: 300, title: null }, // rank 6-10
];

// ==================== HELPERS ====================
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

function getArenaPoints(guildId, userId) {
    return getUserStat(guildId, userId, 'arena_points') || 0;
}

function addArenaPoints(guildId, userId, amount) {
    incrementUserStat(guildId, userId, 'arena_points', amount);
}

function getWinStreak(guildId, userId) {
    return getUserStat(guildId, userId, 'arena_win_streak') || 0;
}

function setWinStreak(guildId, userId, streak) {
    setUserStat(guildId, userId, 'arena_win_streak', streak);
}

function getHighestTier(guildId, userId) {
    return getUserStat(guildId, userId, 'arena_highest_tier') || 0;
}

function setHighestTier(guildId, userId, tierMin) {
    setUserStat(guildId, userId, 'arena_highest_tier', tierMin);
}

function getArenaStats(guildId, userId) {
    const rating = getRating(guildId, userId);
    const wins = getUserStat(guildId, userId, 'arena_wins') || 0;
    const losses = getUserStat(guildId, userId, 'arena_losses') || 0;
    const points = getArenaPoints(guildId, userId);
    const streak = getWinStreak(guildId, userId);
    return { rating, wins, losses, tier: getTier(rating), points, streak };
}

// ==================== MATCHMAKING ====================
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
    const pool = scored.slice(0, 5);
    return pool[Math.floor(Math.random() * pool.length)];
}

// ==================== FIGHT LOGIC ====================
function doArenaFight(guildId, userId) {
    // Daily fight limit
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const fightKey = `arena_fights_${today}`;
    const fightsToday = getUserStat(guildId, userId, fightKey) || 0;
    if (fightsToday >= MAX_FIGHTS_PER_DAY) return { error: 'daily_limit' };

    const myPet = getPetData(guildId, userId);
    if (!myPet) return { error: 'no_pet' };
    const myRating = getRating(guildId, userId);
    const opp = findOpponent(guildId, userId, myRating);
    if (!opp) return { error: 'no_opponent' };
    const oppPet = getPetData(guildId, opp.userId);
    if (!oppPet) return { error: 'no_opponent' };

    // Anti-collusion: can't fight same opponent twice in a row
    const lastOpp = getUserStat(guildId, userId, 'arena_last_opp') || '';
    if (lastOpp === opp.userId) {
        // Try to find a different opponent
        const altOpp = findOpponent(guildId, userId, myRating);
        if (altOpp && altOpp.userId !== opp.userId) {
            Object.assign(opp, altOpp);
        }
        // If still same, allow it (small server) but no streak bonus
    }
    setUserStat(guildId, userId, 'arena_last_opp', opp.userId);

    const myDef = PET_DATA.find(p => p.id === myPet.petId) || { emoji: '🐾' };
    const oppDef = PET_DATA.find(p => p.id === oppPet.petId) || { emoji: '🐾' };
    const result = simulatePvP(myPet, myDef, oppPet, oppDef);
    const win = result.winner === 1;

    // Increment daily fight counter
    incrementUserStat(guildId, userId, fightKey);

    // ELO update
    const expected = 1 / (1 + Math.pow(10, (opp.rating - myRating) / 400));
    const change = Math.round(K_FACTOR * ((win ? 1 : 0) - expected));
    const newRating = Math.max(RATING_FLOOR, myRating + change);
    setRating(guildId, userId, newRating);
    incrementUserStat(guildId, userId, win ? 'arena_wins' : 'arena_losses');

    // Win streak
    let currentStreak = getWinStreak(guildId, userId);
    if (win) { currentStreak++; } else { currentStreak = 0; }
    setWinStreak(guildId, userId, currentStreak);

    // Rewards (money + arena points + streak bonus)
    // Money is modest: base 300 + rating/10 (capped by streak at x2 max for money)
    let reward = 0, pointsEarned = 0, streakLabel = '';
    if (win) {
        const baseMoney = 300 + Math.floor(newRating / 10);
        const basePoints = 8 + Math.floor(newRating / 150);
        const { mult, label } = getStreakMultiplier(currentStreak);
        streakLabel = label;
        // Money multiplier capped at x2 to prevent hyperinflation
        const moneyMult = Math.min(2.0, mult);
        reward = Math.floor(baseMoney * moneyMult);
        pointsEarned = Math.floor(basePoints * mult);

        // Daily AP cap
        const apToday = getUserStat(guildId, userId, `arena_ap_${today}`) || 0;
        if (apToday + pointsEarned > MAX_AP_PER_DAY) {
            pointsEarned = Math.max(0, MAX_AP_PER_DAY - apToday);
        }

        addUserBalance(guildId, userId, reward);
        addIncome(guildId, userId, 'battle', reward);
        if (pointsEarned > 0) {
            addArenaPoints(guildId, userId, pointsEarned);
            setUserStat(guildId, userId, `arena_ap_${today}`, apToday + pointsEarned);
        }
    } else {
        // Small consolation points
        pointsEarned = 2;
        const apToday = getUserStat(guildId, userId, `arena_ap_${today}`) || 0;
        if (apToday < MAX_AP_PER_DAY) {
            addArenaPoints(guildId, userId, pointsEarned);
            setUserStat(guildId, userId, `arena_ap_${today}`, apToday + pointsEarned);
        } else { pointsEarned = 0; }
    }

    // Tier promotion check
    const oldTier = getTier(myRating);
    const newTier = getTier(newRating);
    let tierPromotion = null;
    if (newTier.min > oldTier.min) {
        const highestSeen = getHighestTier(guildId, userId);
        if (newTier.min > highestSeen) {
            // First time reaching this tier ever!
            setHighestTier(guildId, userId, newTier.min);
            tierPromotion = { tier: newTier, reward: newTier.promotionReward, firstTime: true };
            // Grant promotion rewards
            if (newTier.promotionReward.money > 0) addUserBalance(guildId, userId, newTier.promotionReward.money);
            if (newTier.promotionReward.points > 0) addArenaPoints(guildId, userId, newTier.promotionReward.points);
            if (newTier.promotionReward.item) { try { addItem(guildId, userId, newTier.promotionReward.item, 1); } catch (_) {} }
        } else {
            tierPromotion = { tier: newTier, reward: null, firstTime: false };
        }
    }

    return {
        win, myPet, myDef, oppPet, oppDef, oppUserId: opp.userId,
        change, oldRating: myRating, newRating, reward, pointsEarned,
        streak: currentStreak, streakLabel, tierPromotion,
        log: result.log
    };
}

// ==================== PANELS ====================
function buildArenaPanel(guildId, userId, username) {
    const s = getArenaStats(guildId, userId);
    const total = s.wins + s.losses;
    const wr = total > 0 ? Math.round((s.wins / total) * 100) : 0;
    const season = getCurrentSeason();
    const seasonEnd = getSeasonEndDate();
    const { mult, label } = getStreakMultiplier(s.streak);

    // Next tier progress
    const currentTierIdx = ARENA_TIERS.findIndex(t => t.min === s.tier.min);
    const nextTier = ARENA_TIERS[currentTierIdx + 1];
    let progressText = '';
    if (nextTier) {
        const needed = nextTier.min - s.rating;
        progressText = `\n> 📈 Next tier (${nextTier.emoji} ${nextTier.name}): **${needed}** MMR lagi`;
    } else {
        progressText = `\n> 🌟 **Tier Tertinggi!**`;
    }

    const embed = new EmbedBuilder()
        .setColor('#E67E22')
        .setTitle(`⚔️ RANKED ARENA — ${username}`)
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `${s.tier.emoji} **${s.tier.name}**  •  🏆 **${s.rating}** MMR\n` +
            `> ✅ Menang: **${s.wins}**  ❌ Kalah: **${s.losses}**  📊 Winrate: **${wr}%**\n` +
            `> 🔥 Win Streak: **${s.streak}** ${label || ''}\n` +
            `> 🎖️ Arena Points: **${s.points.toLocaleString('id-ID')}** AP` +
            progressText + `\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `> ⚔️ Menang → MMR↑ + 🪙 + 🎖️ AP${s.streak >= 3 ? ` (${label} bonus!)` : ''}\n` +
            `> ❌ Kalah → MMR↓ + 2 AP (tidak hilang uang)\n` +
            `> 🏅 Naik tier = bonus besar!\n\n` +
            `📅 **${season.name}** — reset <t:${seasonEnd}:R>`
        )
        .setFooter({ text: 'Ranked Arena • ELO matchmaking • Monthly seasons' });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`arena_fight_${userId}`).setLabel('⚔️ Cari Lawan').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`arena_lb_${userId}`).setLabel('🏆 Leaderboard').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`arena_shop_${userId}`).setLabel('🎖️ Shop').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`arena_season_${userId}`).setLabel('📅 Season').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row1] };
}

function buildArenaLeaderboard(guildId, userId, username) {
    let rows = [];
    try { rows = db.prepare("SELECT userId, stat_value AS rating FROM user_stats WHERE stat_key = 'arena_rating' ORDER BY stat_value DESC LIMIT 10").all(); }
    catch (_) { rows = []; }
    const medals = ['🥇', '🥈', '🥉'];
    let desc = rows.length ? '' : '*Belum ada peserta arena. Jadilah yang pertama!*';
    rows.forEach((r, i) => {
        const tier = getTier(r.rating);
        const streak = getUserStat(guildId, r.userId, 'arena_win_streak') || 0;
        desc += `${medals[i] || `**#${i + 1}**`} <@${r.userId}> — ${tier.emoji} **${r.rating}** (${tier.name})${streak >= 3 ? ` 🔥${streak}` : ''}\n`;
    });
    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏆 ARENA LEADERBOARD — Top 10')
        .setDescription(desc)
        .setFooter({ text: `Season: ${getCurrentSeason().name}` });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`arena_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
}

function buildArenaShop(guildId, userId) {
    const points = getArenaPoints(guildId, userId);
    let desc = `🎖️ **Arena Points kamu:** ${points.toLocaleString('id-ID')} AP\n\n`;
    desc += `**Item Eksklusif Arena:**\n`;
    ARENA_SHOP.forEach((item, i) => {
        const canBuy = points >= item.cost;
        desc += `> ${item.emoji} **${item.name}** — 🎖️ ${item.cost} AP\n>   *${item.desc}* ${canBuy ? '✅' : '🔒'}\n`;
    });
    desc += `\n*Dapatkan AP dari fight arena + tier promotion + season rewards!*`;

    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('🎖️ ARENA SHOP')
        .setDescription(desc)
        .setFooter({ text: 'Pilih item di dropdown untuk membeli' });

    const options = ARENA_SHOP.map(item => ({
        label: `${item.name} (${item.cost} AP)`,
        value: item.id,
        description: item.desc,
        emoji: item.emoji
    }));
    const select = new StringSelectMenuBuilder()
        .setCustomId(`arena_shopbuy_${userId}`)
        .setPlaceholder('🛒 Pilih item untuk dibeli...')
        .addOptions(options);

    const row1 = new ActionRowBuilder().addComponents(select);
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`arena_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row1, row2] };
}

function buildSeasonPanel(guildId, userId) {
    const season = getCurrentSeason();
    const seasonEnd = getSeasonEndDate();
    const myRating = getRating(guildId, userId);
    const myTier = getTier(myRating);

    let desc = `📅 **${season.name}**\n`;
    desc += `> ⏰ Berakhir: <t:${seasonEnd}:R> (<t:${seasonEnd}:D>)\n\n`;
    desc += `**🏆 End-of-Season Rewards:**\n`;
    desc += `> 🥇 #1 — 🪙 500.000 + 🎖️ 2.000 AP + Title\n`;
    desc += `> 🥈 #2 — 🪙 300.000 + 🎖️ 1.200 AP + Title\n`;
    desc += `> 🥉 #3 — 🪙 200.000 + 🎖️ 800 AP + Title\n`;
    desc += `> **#4-5** — 🪙 100.000 + 🎖️ 500 AP\n`;
    desc += `> **#6-10** — 🪙 50.000 + 🎖️ 300 AP\n\n`;
    desc += `**📊 Status kamu:**\n`;
    desc += `> ${myTier.emoji} **${myTier.name}** — 🏆 ${myRating} MMR\n\n`;
    desc += `*Saat season berakhir, rating di soft-reset:*\n`;
    desc += `> *Rating baru = 1000 + (rating - 1000) × 0.5*\n`;
    desc += `> *Contoh: 1600 MMR → 1300 MMR*`;

    const embed = new EmbedBuilder()
        .setColor('#1ABC9C')
        .setTitle(`📅 ARENA SEASON`)
        .setDescription(desc)
        .setFooter({ text: 'Top players get exclusive rewards at season end!' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`arena_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
}

// ==================== HANDLERS ====================
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
    if (action === 'shop') return interaction.update(buildArenaShop(guildId, userId));
    if (action === 'season') return interaction.update(buildSeasonPanel(guildId, userId));

    if (action === 'fight') {
        const rem = cooldowns.getRemaining('arena', guildId, userId);
        if (rem > 0) return interaction.reply({ content: `⏳ Tunggu **${Math.ceil(rem / 1000)} detik** sebelum cari lawan lagi.`, ephemeral: true });
        await interaction.deferUpdate();
        const res = doArenaFight(guildId, userId);
        if (res.error === 'no_pet') return interaction.followUp({ content: '❌ Kamu belum punya pet aktif! Tetaskan/aktifkan pet dulu di `/pet`.', ephemeral: true });
        if (res.error === 'no_opponent') return interaction.followUp({ content: '❌ Belum ada lawan tersedia (belum ada pemain lain dengan pet aktif). Coba lagi nanti.', ephemeral: true });
        if (res.error === 'daily_limit') return interaction.followUp({ content: `❌ Kamu sudah mencapai limit **${MAX_FIGHTS_PER_DAY} fight/hari**! Istirahat dulu, lanjut besok.`, ephemeral: true });
        cooldowns.setCooldown('arena', guildId, userId, FIGHT_COOLDOWN_MS);

        const tier = getTier(res.newRating);
        const sign = res.change >= 0 ? '+' : '';

        // Build result description
        let desc = `${res.myDef.emoji} **${res.myPet.name}** vs ${res.oppDef.emoji} **${res.oppPet.name}** (<@${res.oppUserId}>)\n\n`;
        desc += res.log.slice(-6).join('\n');
        desc += `\n\n━━━━━━━━━━━━━━━━━━━━━━\n`;
        desc += `${tier.emoji} MMR: **${res.oldRating} → ${res.newRating}** (${sign}${res.change})\n`;

        if (res.win) {
            desc += `🪙 Money: **+${res.reward.toLocaleString('id-ID')}**`;
            if (res.streakLabel) desc += ` ${res.streakLabel}`;
            desc += `\n🎖️ AP: **+${res.pointsEarned}**`;
            if (res.streak >= 3) desc += ` | 🔥 Streak: **${res.streak}**`;
        } else {
            desc += `🎖️ AP: +${res.pointsEarned} (consolation)\n`;
            desc += `Streak reset. Jangan menyerah!`;
        }

        // Tier promotion
        if (res.tierPromotion) {
            const tp = res.tierPromotion;
            desc += `\n\n🎉 **TIER UP!** → ${tp.tier.emoji} **${tp.tier.name}**`;
            if (tp.firstTime && tp.reward) {
                desc += `\n> 🎁 Bonus: 🪙 ${tp.reward.money.toLocaleString('id-ID')}`;
                if (tp.reward.points > 0) desc += ` + 🎖️ ${tp.reward.points} AP`;
                if (tp.reward.item) desc += ` + 📦 ${tp.reward.item}`;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(res.win ? '#2ECC71' : '#E74C3C')
            .setTitle(res.win ? '⚔️ RANKED — MENANG! 🏆' : '⚔️ RANKED — KALAH 💀')
            .setDescription(desc)
            .setFooter({ text: `${tier.name} • Season: ${getCurrentSeason().name}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`arena_fight_${userId}`).setLabel('⚔️ Cari Lawan Lagi').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`arena_back_${userId}`).setLabel('🔙 Arena').setStyle(ButtonStyle.Secondary)
        );
        return interaction.editReply({ embeds: [embed], components: [row] });
    }
}

// ==================== ARENA SHOP SELECT HANDLER ====================
async function handleArenaSelectMenu(interaction) {
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];
    const guildId = interaction.guild.id;
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });

    if (customId.startsWith('arena_shopbuy_')) {
        const itemId = interaction.values[0];
        const shopItem = ARENA_SHOP.find(i => i.id === itemId);
        if (!shopItem) return interaction.reply({ content: '❌ Item tidak ditemukan!', ephemeral: true });

        const points = getArenaPoints(guildId, userId);
        if (points < shopItem.cost) {
            return interaction.reply({ content: `❌ AP tidak cukup! Butuh **${shopItem.cost} AP**, punya **${points} AP**.`, ephemeral: true });
        }

        // Deduct points
        setUserStat(guildId, userId, 'arena_points', points - shopItem.cost);

        // Grant item
        const qty = shopItem.qty || 1;
        if (itemId === 'arena_relic_box') {
            // Generate random arena relic
            const slots = ['weapon', 'armor', 'accessory'];
            const rarityRoll = Math.random();
            const rarity = rarityRoll < 0.02 ? 'Mythic' : rarityRoll < 0.15 ? 'Legendary' : rarityRoll < 0.45 ? 'Epic' : 'Rare';
            const slot = slots[Math.floor(Math.random() * slots.length)];
            const statType = slot === 'weapon' ? 'atk' : slot === 'armor' ? 'def' : (Math.random() < 0.5 ? 'spd' : 'crit');
            const value = rarity === 'Mythic' ? getRandomInt(80, 120) : rarity === 'Legendary' ? getRandomInt(50, 80) : rarity === 'Epic' ? getRandomInt(35, 50) : getRandomInt(20, 35);
            db.prepare('INSERT INTO relics (userId, name, slot, rarity, stat_type, stat_value) VALUES (?, ?, ?, ?, ?, ?)').run(userId, `Arena ${rarity} ${slot}`, slot, rarity, statType, value);
            await interaction.reply({ content: `🗡️ **Arena Relic Box dibuka!**\n> ${rarity} ${slot}: +${value} ${statType}\n> -🎖️ ${shopItem.cost} AP`, ephemeral: true });
        } else if (itemId === 'arena_egg') {
            // Hatch a pet (Epic-Mythic range)
            const tiers = ['Epic', 'Epic', 'Epic', 'Legendary', 'Legendary', 'Mythic'];
            const tier = tiers[Math.floor(Math.random() * tiers.length)];
            const petsOfTier = PET_DATA.filter(p => p.tier === tier);
            if (petsOfTier.length > 0) {
                const pet = petsOfTier[Math.floor(Math.random() * petsOfTier.length)];
                const { generatePetStats } = require('./pets');
                const stats = generatePetStats(tier);
                const elements = ['fire', 'water', 'nature', 'electric', 'dark', 'light'];
                const element = elements[Math.floor(Math.random() * elements.length)];
                db.prepare('INSERT INTO pets (userId, petId, name, level, exp, hp, atk, def, spd, crit, element, adoptedAt) VALUES (?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?)').run(userId, pet.id, pet.name, stats.hp, stats.atk, stats.def, stats.spd, stats.crit, element, Date.now());
                await interaction.reply({ content: `🥚 **Arena Egg menetas!**\n> ${pet.emoji} **${pet.name}** (${tier})\n> HP:${stats.hp} ATK:${stats.atk} DEF:${stats.def} SPD:${stats.spd}\n> -🎖️ ${shopItem.cost} AP`, ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ Gagal hatch!', ephemeral: true });
            }
        } else {
            addItem(guildId, userId, itemId, qty);
            await interaction.reply({ content: `✅ Dibeli: ${shopItem.emoji} **${shopItem.name}**${qty > 1 ? ` x${qty}` : ''}\n> -🎖️ ${shopItem.cost} AP | Sisa: ${(points - shopItem.cost).toLocaleString('id-ID')} AP`, ephemeral: true });
        }
        return;
    }
}

// ==================== SEASON RESET (call from scheduler) ====================
function processSeasonEnd(client) {
    try {
        const season = getCurrentSeason();
        const lastProcessed = getUserStat(null, 'SYSTEM', 'arena_last_season') || '';
        if (lastProcessed === season.id) return; // Already processed this month

        // Get top players
        let topPlayers = [];
        try { topPlayers = db.prepare("SELECT userId, stat_value AS rating FROM user_stats WHERE stat_key = 'arena_rating' ORDER BY stat_value DESC LIMIT 10").all(); } catch (_) {}

        // Grant rewards to top players
        for (let i = 0; i < topPlayers.length; i++) {
            const player = topPlayers[i];
            const rewardDef = SEASON_REWARDS.find(r => r.rank === i + 1) || (i < 5 ? SEASON_REWARDS[3] : SEASON_REWARDS[5]);
            if (rewardDef) {
                if (rewardDef.money > 0) addUserBalance(null, player.userId, rewardDef.money);
                if (rewardDef.points > 0) addArenaPoints(null, player.userId, rewardDef.points);
            }
        }

        // Soft-reset all ratings: new = 1000 + (old - 1000) * 0.5
        try {
            const allRatings = db.prepare("SELECT userId, stat_value AS rating FROM user_stats WHERE stat_key = 'arena_rating' AND stat_value > 0").all();
            for (const r of allRatings) {
                const newRating = Math.max(BASE_RATING, Math.round(BASE_RATING + (r.rating - BASE_RATING) * 0.5));
                setUserStat(null, r.userId, 'arena_rating', newRating);
            }
        } catch (_) {}

        // Reset win streaks
        try { db.prepare("UPDATE user_stats SET stat_value = 0 WHERE stat_key = 'arena_win_streak'").run(); } catch (_) {}

        // Mark season as processed
        setUserStat(null, 'SYSTEM', 'arena_last_season', season.id);

        console.log(`[arena] Season reset completed: ${season.name}`);
    } catch (e) {
        console.error('[arena] Season reset error:', e?.message || e);
    }
}

// ==================== DETECTION ====================
function isArenaButton(customId) {
    return typeof customId === 'string' && customId.startsWith('arena_');
}

function isArenaSelectMenu(customId) {
    return typeof customId === 'string' && customId.startsWith('arena_shopbuy_');
}

module.exports = {
    handleArenaCommand, handleArenaButton, handleArenaSelectMenu,
    isArenaButton, isArenaSelectMenu,
    buildArenaPanel, buildArenaLeaderboard, buildArenaShop, buildSeasonPanel,
    doArenaFight, getArenaStats, getRating, getTier,
    processSeasonEnd, ARENA_TIERS, ARENA_SHOP
};
