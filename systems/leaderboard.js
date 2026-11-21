// systems/leaderboard.js — /leaderboard Panel (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getUserStat } = require('../database');
const { getTitleFromScore, computeScore } = require('./titles');

const ui = require('./ui');

// ==================== VISUAL HELPERS ====================
const { shortNum } = ui;

const RANK_MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
function getRankIcon(index) {
    return RANK_MEDALS[index] || `**#${index + 1}**`;
}

function getStat(guildId, userId, key) { return getUserStat(guildId, userId, key) || 0; }

function getGlobalStat(userId, key) {
    const row = db.prepare('SELECT stat_value FROM user_stats WHERE userId = ? AND stat_key = ? ORDER BY stat_value DESC LIMIT 1').get(userId, key);
    return row ? row.stat_value : 0;
}

function progressBar(value, max, length = 8) {
    return ui.progressBar(value, max, length);
}

function streakFire(count) {
    if (count >= 100) return '🔥🔥🔥';
    if (count >= 50) return '🔥🔥';
    if (count >= 7) return '🔥';
    return '🕯️';
}

// ==================== BUILD LEADERBOARD EMBED ====================
function buildLeaderboard(guildId, kategori, userId, isGlobal = false) {
    // The heavy part is the data computation (the switch below), which is identical
    // for every viewer of the same (kategori, scope, guild). Cache that for 45s.
    // The buttons (per-user customIds) and timestamp are rebuilt cheaply per call.
    const cache = require('./cache');
    const cacheKey = `lb:${isGlobal ? 'g' : 's'}:${isGlobal ? 'GLOBAL' : guildId}:${kategori}`;
    const content = cache.getOrCompute(cacheKey, 45 * 1000, () =>
        computeLeaderboardContent(guildId, kategori, isGlobal)
    );
    return renderLeaderboard(content, kategori, userId, isGlobal);
}

// Computes only the data-heavy { title, desc, color, scopeLabel } for a leaderboard.
function computeLeaderboardContent(guildId, kategori, isGlobal = false) {
    let title, desc = '', color = '#FFD700';
    const scopePrefix = isGlobal ? '🌍 ' : '📍 ';
    const scopeLabel = isGlobal ? 'Global' : 'Server';

    switch (kategori) {
        case 'level': {
            title = `${scopePrefix}📈 Top 10 — Level Leaderboard`;
            color = '#3498DB';
            let query = 'SELECT * FROM users';
            if (!isGlobal) query += ' WHERE guildId = ?';
            query += ' ORDER BY level DESC, xp DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            
            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            data.forEach((u, i) => {
                const xpNeeded = (u.level + 1) * 100;
                const bar = progressBar(u.xp, xpNeeded, 8);
                const medalIcon = getRankIcon(i);
                desc += `${medalIcon} <@${u.userId}> • **Level ${u.level}**\n`;
                desc += `> \`${bar}\` **${u.xp.toLocaleString('id-ID')}** / ${xpNeeded.toLocaleString('id-ID')} XP\n\n`;
            });
            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            desc += `-# ℹ️ Level naik otomatis dari keaktifan chat dan voice di server.`;
            break;
        }
        case 'money': {
            title = `${scopePrefix}💰 Top 10 — Richest Leaderboard`;
            color = '#F1C40F';
            let query = 'SELECT * FROM users';
            if (!isGlobal) query += ' WHERE guildId = ?';
            query += ' ORDER BY balance DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            const maxBal = data[0]?.balance || 1;
            
            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            data.forEach((u, i) => {
                const bar = progressBar(u.balance, maxBal, 8);
                const medalIcon = getRankIcon(i);
                desc += `${medalIcon} <@${u.userId}> • 🪙 **${u.balance.toLocaleString('id-ID')}**\n`;
                desc += `> \`${bar}\` Saldo Dompet\n\n`;
            });
            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            desc += `-# ℹ️ Peringkat kekayaan uang koin aktif di dompet member.`;
            break;
        }
        case 'streak': {
            title = `${scopePrefix}🔥 Top 10 — Streak Warriors`;
            color = '#E74C3C';
            let query = 'SELECT * FROM streaks';
            if (!isGlobal) query += ' WHERE guildId = ?';
            query += ' ORDER BY count DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            const maxStreak = data[0]?.count || 1;
            
            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            data.forEach((u, i) => {
                const fire = streakFire(u.count);
                const bar = progressBar(u.count, maxStreak, 8);
                const medalIcon = getRankIcon(i);
                desc += `${medalIcon} <@${u.userId}> • ${fire} **${u.count} Hari**\n`;
                desc += `> \`${bar}\` Rekor Streak Chat Aktif\n\n`;
            });
            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            desc += `-# ℹ️ Chat minimal 1x setiap hari (00:00 - 23:59 WIB) untuk menjaga streak.`;
            break;
        }
        case 'voice': {
            title = `${scopePrefix}🎙️ Top 10 — Voice Champions`;
            color = '#1ABC9C';
            let query = "SELECT userId, stat_value FROM user_stats WHERE stat_key = 'total_voice_mins'";
            if (!isGlobal) query += ' AND guildId = ?';
            query += ' ORDER BY CAST(stat_value AS INTEGER) DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            const maxVoice = Number(data[0]?.stat_value) || 60;

            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            data.forEach((u, i) => {
                const mins = Number(u.stat_value) || 0;
                const hours = (mins / 60).toFixed(1);
                const bar = progressBar(mins, maxVoice, 8);
                const medalIcon = getRankIcon(i);
                desc += `${medalIcon} <@${u.userId}> • 🎙️ **${hours} Jam** (\`${mins.toLocaleString('id-ID')}\` mnt)\n`;
                desc += `> \`${bar}\` Durasi Voice Aktif\n\n`;
            });
            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            desc += `-# ℹ️ Dihitung dari obrolan voice aktif (minimal 2 member di room).`;
            break;
        }
        case 'gambling': {
            title = `${scopePrefix}🎰 Top 10 — Lucky Players`;
            color = '#F39C12';
            let query = "SELECT userId, stat_value FROM user_stats WHERE stat_key = 'total_gambling_wins'";
            if (!isGlobal) query += ' AND guildId = ?';
            query += ' ORDER BY stat_value DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            const maxGamble = data[0]?.stat_value || 1;
            
            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            data.forEach((u, i) => {
                const bar = progressBar(u.stat_value, maxGamble, 8);
                const medalIcon = getRankIcon(i);
                desc += `${medalIcon} <@${u.userId}> • 🪙 **${Number(u.stat_value).toLocaleString('id-ID')}** menang\n`;
                desc += `> \`${bar}\` Akumulasi Kemenangan Casino\n\n`;
            });
            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            desc += `-# ℹ️ Total hasil profit bersih dari Coinflip, Slot, Roulette, & Blackjack.`;
            break;
        }
        case 'achievement': {
            title = `${scopePrefix}🏆 Top 10 — Badge Collectors`;
            color = '#8E44AD';
            let query = 'SELECT userId, COUNT(*) as cnt FROM achievements';
            if (!isGlobal) query += ' WHERE guildId = ?';
            query += ' GROUP BY userId ORDER BY cnt DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            
            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            data.forEach((u, i) => {
                const bar = progressBar(u.cnt, 89, 8);
                const medalIcon = getRankIcon(i);
                desc += `${medalIcon} <@${u.userId}> • 🏆 **${u.cnt}** / 89 Badges\n`;
                desc += `> \`${bar}\` Koleksi Achievement Selesai\n\n`;
            });
            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            desc += `-# ℹ️ Selesaikan misi di /profile untuk mendapatkan badge eksklusif.`;
            break;
        }
        case 'season': {
            const { getSeasonalLeaderboard, getSeasonInfo, getLastSeasonWinners } = require('./season');
            title = `${scopePrefix}🗓️ Seasonal — Top 10 (Bulan Ini)`;
            color = '#E67E22';
            const info = getSeasonInfo();
            const { entries } = getSeasonalLeaderboard(10);

            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            desc += `> 📅 Season **${info.seasonId}** • ⏳ Sisa **${info.daysLeft}** hari\n`;
            desc += `> 🔄 Reset otomatis tiap awal bulan (skor = aktivitas bulan ini)\n\n`;

            if (entries.length === 0) {
                desc += '*Belum ada aktivitas musim ini. Mulai chat, voice, kuis, atau daily!*\n\n';
            } else {
                const maxScore = entries[0]?.score || 1;
                entries.forEach((e, i) => {
                    const bar = progressBar(e.score, maxScore, 8);
                    const medalIcon = getRankIcon(i);
                    desc += `${medalIcon} <@${e.userId}> • 🏆 **${e.score.toLocaleString('id-ID')}** pts\n`;
                    desc += `> \`${bar}\` Poin Musim Ini\n\n`;
                });
            }

            const last = getLastSeasonWinners(3);
            if (last.winners.length > 0) {
                desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
                desc += `> 🏅 **Juara Season ${last.seasonId}:**\n`;
                last.winners.forEach(w => {
                    const medalIcon = getRankIcon(w.rank - 1);
                    desc += `> ${medalIcon} <@${w.userId}> — **${w.score.toLocaleString('id-ID')}** pts\n`;
                });
            }
            break;
        }
        case 'overall':
        default: {
            title = `${scopePrefix}⭐ Top 10 — Overall Score`;
            color = '#FF6B00';
            let usersQuery = 'SELECT * FROM users';
            if (!isGlobal) usersQuery += ' WHERE guildId = ?';
            const users = isGlobal ? db.prepare(usersQuery).all() : db.prepare(usersQuery).all(guildId);
            
            const scored = users.map(u => {
                const st = (k) => isGlobal ? getGlobalStat(u.userId, k) : getStat(guildId, u.userId, k);

                let streak = 0;
                if (!isGlobal) {
                    const streakRow = db.prepare('SELECT count FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, u.userId);
                    streak = streakRow ? streakRow.count : 0;
                }
                const badges = isGlobal
                    ? db.prepare('SELECT COUNT(*) as c FROM achievements WHERE userId = ?').get(u.userId).c
                    : db.prepare('SELECT COUNT(*) as c FROM achievements WHERE guildId = ? AND userId = ?').get(guildId, u.userId).c;

                const chats = st('total_chats');
                const voice = st('total_voice_mins');
                const eventWins = st('event_wins');
                const gifts = st('total_gifts_sent');
                const gambling = st('slot_wins') + st('coinflip_wins') + st('roulette_wins');
                const togelWins = st('togel_wins');

                const { score } = computeScore({
                    level: u.level, balance: u.balance, badges, streak,
                    chats, voice, eventWins, gifts, gambling, togelWins,
                });

                return { userId: u.userId, score, level: u.level, balance: u.balance, streak, badges, chats, voice, eventWins };
            }).sort((a, b) => b.score - a.score).slice(0, 10);

            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            scored.forEach((u, i) => {
                const rankTitle = getTitleFromScore(u.score);
                const medalIcon = getRankIcon(i);
                desc += `${medalIcon} <@${u.userId}> • **${u.score.toLocaleString('id-ID')}** pts\n`;
                desc += `> ${rankTitle.emoji} **${rankTitle.name}** • \`Lv.${u.level}\` • 🪙 **${shortNum(u.balance)}**`;
                if (!isGlobal) desc += ` • 🔥 **${u.streak}d**`;
                desc += ` • 💬 **${shortNum(u.chats)}** • 🎙️ **${Math.floor(u.voice / 60)}j** • 🏆 **${u.badges}**\n\n`;
            });

            desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            if (isGlobal) {
                desc += `-# ℹ️ **Formula:** Level (×150) + Saldo (/500) + Badge (×50) + Chat/Voice/Kuis/Gamble\n`;
                desc += `-# ⚠️ *Streak tidak dihitung di Global (anti-abuse)*`;
            } else {
                desc += `-# ℹ️ **Formula:** Level (×150) + Saldo (/500) + Streak (×20) + Badge (×50) + Chat/Voice/Kuis/Gamble`;
            }
            break;
        }
    }

    if (!desc || desc.trim() === `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`) desc = '```\n  Belum ada data. Mulai bermain!\n```';

    return { title, desc, color, scopeLabel };
}

// Builds the embed + navigation buttons from precomputed content (cheap, per-call).
function renderLeaderboard(content, kategori, userId, isGlobal = false) {
    const { title, desc, color, scopeLabel } = content;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription(desc)
        .setFooter({ text: `${scopeLabel} Leaderboard • Klik tombol di bawah untuk ganti kategori` })
        .setTimestamp();

    // Highlight current category with green, scope toggle with blurple
    const modePrefix = isGlobal ? 'lbg' : 'lb';
    const row1 = new ActionRowBuilder().addComponents(
        btn(`${modePrefix}_overall_${userId}`, '⭐ Overall', kategori === 'overall'),
        btn(`${modePrefix}_level_${userId}`, '📈 Level', kategori === 'level'),
        btn(`${modePrefix}_money_${userId}`, '💰 Money', kategori === 'money'),
        btn(`${modePrefix}_streak_${userId}`, '🔥 Streak', kategori === 'streak'),
        btn(`${modePrefix}_achievement_${userId}`, '🏆 Badge', kategori === 'achievement'),
    );

    const row2 = new ActionRowBuilder().addComponents(
        btn(`${modePrefix}_voice_${userId}`, '🎙️ Voice', kategori === 'voice'),
        btn(`${modePrefix}_gambling_${userId}`, '🎰 Gamble', kategori === 'gambling'),
        btn(`lb_season_${userId}`, '🗓️ Seasonal', kategori === 'season'),
        btnScope(`lb_server_${userId}`, '📍 Server', !isGlobal && kategori !== 'season'),
        btnScope(`lbg_global_${userId}`, '🌍 Global', isGlobal && kategori !== 'season'),
    );

    return { embeds: [embed], components: [row1, row2] };
}

function btn(customId, label, active) {
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(active ? ButtonStyle.Success : ButtonStyle.Secondary);
}

function btnScope(customId, label, active) {
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(active ? ButtonStyle.Primary : ButtonStyle.Secondary);
}

// ==================== COMMAND HANDLER ====================
async function handleLeaderboardCommand(interaction) {
    const kategori = interaction.options.getString('kategori') || 'overall';
    const panel = buildLeaderboard(interaction.guild.id, kategori, interaction.user.id);
    return interaction.reply(panel);
}

// ==================== BUTTON HANDLER ====================
async function handleLeaderboardButton(interaction) {
    const isGlobalMode = interaction.customId.startsWith('lbg_');
    const parts = interaction.customId.split('_');
    let kategori = parts[1];
    const ownerId = parts[2];

    // Handle mode toggle buttons
    if (kategori === 'server' || kategori === 'global') {
        kategori = 'overall'; // Default to overall when switching modes
    }

    const panel = buildLeaderboard(interaction.guild.id, kategori, ownerId, isGlobalMode);
    return interaction.update(panel);
}

// ==================== DETECTOR ====================
function isLeaderboardButton(customId) {
    return customId.startsWith('lb_') || customId.startsWith('lbg_');
}

module.exports = { handleLeaderboardCommand, handleLeaderboardButton, isLeaderboardButton };
