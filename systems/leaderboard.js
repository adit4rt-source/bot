// systems/leaderboard.js — /leaderboard Panel (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getUserStat } = require('../database');
const { PET_DATA } = require('../data/pets');
const { getTitleFromScore, computeScore } = require('./titles');

// ==================== VISUAL HELPERS ====================
function medal(i) {
    const medals = ['🥇', '🥈', '🥉'];
    if (i < 3) return medals[i];
    return `\`#${i + 1}\``;
}

function getStat(guildId, userId, key) { return getUserStat(guildId, userId, key) || 0; }

function getGlobalStat(userId, key) {
    const row = db.prepare('SELECT stat_value FROM user_stats WHERE userId = ? AND stat_key = ? ORDER BY stat_value DESC LIMIT 1').get(userId, key);
    return row ? row.stat_value : 0;
}

function shortNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

function progressBar(value, max, length = 8) {
    const filled = Math.round((value / max) * length);
    return '▓'.repeat(Math.min(filled, length)) + '░'.repeat(Math.max(0, length - filled));
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
            title = `${scopePrefix}📈 Top 10 — Level`;
            color = '#3498DB';
            let query = 'SELECT * FROM users';
            if (!isGlobal) query += ' WHERE guildId = ?';
            query += ' ORDER BY level DESC, xp DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            const maxLv = data[0]?.level || 1;
            
            desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n\n`;
            data.forEach((u, i) => {
                const xpNeeded = (u.level + 1) * 100;
                const bar = progressBar(u.xp, xpNeeded);
                desc += `${medal(i)} <@${u.userId}>\n`;
                desc += `> 📊 Lv.**${u.level}** \`${bar}\` ${u.xp}/${xpNeeded} XP\n\n`;
            });
            break;
        }
        case 'money': {
            title = `${scopePrefix}💰 Top 10 — Richest`;
            color = '#F1C40F';
            let query = 'SELECT * FROM users';
            if (!isGlobal) query += ' WHERE guildId = ?';
            query += ' ORDER BY balance DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            const maxBal = data[0]?.balance || 1;
            
            desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n\n`;
            data.forEach((u, i) => {
                const bar = progressBar(u.balance, maxBal);
                desc += `${medal(i)} <@${u.userId}>\n`;
                desc += `> 🪙 **${u.balance.toLocaleString('id-ID')}** \`${bar}\`\n\n`;
            });
            break;
        }
        case 'fish': {
            title = `${scopePrefix}🎣 Top 10 — Master Angler`;
            color = '#1ABC9C';
            let query = "SELECT userId, stat_value FROM user_stats WHERE stat_key = 'total_fish_caught'";
            if (!isGlobal) query += ' AND guildId = ?';
            query += ' ORDER BY stat_value DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            const maxFish = data[0]?.stat_value || 1;
            
            desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n\n`;
            data.forEach((u, i) => {
                const bar = progressBar(u.stat_value, maxFish);
                desc += `${medal(i)} <@${u.userId}>\n`;
                desc += `> 🐟 **${u.stat_value}** ikan tertangkap \`${bar}\`\n\n`;
            });
            break;
        }
        case 'farm': {
            title = `${scopePrefix}🌾 Top 10 — Master Farmer`;
            color = '#27AE60';
            let query = "SELECT userId, stat_value FROM user_stats WHERE stat_key = 'total_harvests'";
            if (!isGlobal) query += ' AND guildId = ?';
            query += ' ORDER BY stat_value DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            const maxFarm = data[0]?.stat_value || 1;
            
            desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n\n`;
            data.forEach((u, i) => {
                const bar = progressBar(u.stat_value, maxFarm);
                desc += `${medal(i)} <@${u.userId}>\n`;
                desc += `> 🌾 **${u.stat_value}** panen \`${bar}\`\n\n`;
            });
            break;
        }
        case 'pet': {
            title = `${scopePrefix}🐾 Top 10 — Pet Master`;
            color = '#E91E63';
            let query = 'SELECT * FROM pets WHERE active = 1';
            if (!isGlobal) query += ' AND guildId = ?';
            query += ' ORDER BY level DESC, exp DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            
            desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n\n`;
            data.forEach((u, i) => {
                const pd = PET_DATA.find(p => p.id === u.petId);
                const tierColor = { Common: '⚪', Uncommon: '🟢', Rare: '🔵', Epic: '🟣', Legendary: '🟡', Mythic: '🔴', Secret: '🟪', God: '👑' }[pd?.tier] || '⚪';
                desc += `${medal(i)} <@${u.userId}>\n`;
                desc += `> ${pd ? pd.emoji : '🐾'} **${u.name}** ${tierColor} Lv.**${u.level}** | ⚔️${u.atk} 🛡️${u.def}\n\n`;
            });
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
            
            desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n\n`;
            data.forEach((u, i) => {
                const fire = streakFire(u.count);
                const bar = progressBar(u.count, maxStreak);
                desc += `${medal(i)} <@${u.userId}>\n`;
                desc += `> ${fire} **${u.count}** hari berturut-turut \`${bar}\`\n\n`;
            });
            break;
        }
        case 'battle': {
            title = `${scopePrefix}⚔️ Top 10 — Battle Champions`;
            color = '#9B59B6';
            let pvpQuery = "SELECT userId, stat_value FROM user_stats WHERE stat_key = 'pvp_wins'";
            if (!isGlobal) pvpQuery += ' AND guildId = ?';
            pvpQuery += ' ORDER BY stat_value DESC LIMIT 20';
            const pvp = isGlobal ? db.prepare(pvpQuery).all() : db.prepare(pvpQuery).all(guildId);

            let dungeonQuery = "SELECT userId, stat_value FROM user_stats WHERE stat_key = 'dungeon_clears'";
            if (!isGlobal) dungeonQuery += ' AND guildId = ?';
            dungeonQuery += ' ORDER BY stat_value DESC LIMIT 20';
            const dungeon = isGlobal ? db.prepare(dungeonQuery).all() : db.prepare(dungeonQuery).all(guildId);

            let bossQuery = "SELECT userId, stat_value FROM user_stats WHERE stat_key = 'boss_kills'";
            if (!isGlobal) bossQuery += ' AND guildId = ?';
            bossQuery += ' ORDER BY stat_value DESC LIMIT 20';
            const boss = isGlobal ? db.prepare(bossQuery).all() : db.prepare(bossQuery).all(guildId);

            const scoreMap = {};
            for (const r of pvp) scoreMap[r.userId] = (scoreMap[r.userId] || 0) + r.stat_value * 2;
            for (const r of dungeon) scoreMap[r.userId] = (scoreMap[r.userId] || 0) + r.stat_value;
            for (const r of boss) scoreMap[r.userId] = (scoreMap[r.userId] || 0) + r.stat_value * 3;
            const sorted = Object.entries(scoreMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
            
            desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n\n`;
            sorted.forEach(([uid, score], i) => {
                const pW = pvp.find(r => r.userId === uid)?.stat_value || 0;
                const dC = dungeon.find(r => r.userId === uid)?.stat_value || 0;
                const bK = boss.find(r => r.userId === uid)?.stat_value || 0;
                desc += `${medal(i)} <@${uid}> — ⚔️ **${score}** pts\n`;
                desc += `> 🗡️ PvP: ${pW} | 🏰 Dungeon: ${dC} | 👹 Boss: ${bK}\n\n`;
            });
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
            
            desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n\n`;
            data.forEach((u, i) => {
                const bar = progressBar(u.stat_value, maxGamble);
                desc += `${medal(i)} <@${u.userId}>\n`;
                desc += `> 🎰 **${u.stat_value.toLocaleString('id-ID')}** total menang \`${bar}\`\n\n`;
            });
            break;
        }
        case 'achievement': {
            title = `${scopePrefix}🏆 Top 10 — Badge Collectors`;
            color = '#8E44AD';
            let query = 'SELECT userId, COUNT(*) as cnt FROM achievements';
            if (!isGlobal) query += ' WHERE guildId = ?';
            query += ' GROUP BY userId ORDER BY cnt DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            
            desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n\n`;
            data.forEach((u, i) => {
                const bar = progressBar(u.cnt, 89, 10); // 89 total badges
                desc += `${medal(i)} <@${u.userId}>\n`;
                desc += `> 🏅 **${u.cnt}**/89 badges \`${bar}\`\n\n`;
            });
            break;
        }
        case 'season': {
            const { getSeasonalLeaderboard, getSeasonInfo, getLastSeasonWinners } = require('./season');
            title = `${scopePrefix}🗓️ Seasonal — Top 10 (Bulan Ini)`;
            color = '#E67E22';
            const info = getSeasonInfo();
            const { entries } = getSeasonalLeaderboard(10);

            desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n`;
            desc += `> 📅 Season **${info.seasonId}** • ⏳ Sisa **${info.daysLeft}** hari\n`;
            desc += `> 🔄 Reset otomatis tiap awal bulan (skor = aktivitas bulan ini)\n\n`;

            if (entries.length === 0) {
                desc += '*Belum ada aktivitas musim ini. Mulai mancing, farming, atau battle!*\n\n';
            } else {
                const maxScore = entries[0]?.score || 1;
                entries.forEach((e, i) => {
                    const bar = progressBar(e.score, maxScore);
                    desc += `${medal(i)} <@${e.userId}> — 🏆 **${e.score.toLocaleString('id-ID')}** pts\n`;
                    desc += `> \`${bar}\`\n\n`;
                });
            }

            // Show last season's winners (if any archived).
            const last = getLastSeasonWinners(3);
            if (last.winners.length > 0) {
                desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n`;
                desc += `> 🏅 **Juara Season ${last.seasonId}:**\n`;
                last.winners.forEach(w => {
                    desc += `> ${medal(w.rank - 1)} <@${w.userId}> — ${w.score.toLocaleString('id-ID')} pts\n`;
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
                // isGlobal-aware stat fetch (shared weights live in titles.computeScore)
                const st = (k) => isGlobal ? getGlobalStat(u.userId, k) : getStat(guildId, u.userId, k);

                // Streak is NOT counted in the GLOBAL leaderboard (server admins can manipulate it)
                let streak = 0;
                if (!isGlobal) {
                    const streakRow = db.prepare('SELECT count FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, u.userId);
                    streak = streakRow ? streakRow.count : 0;
                }
                const petRow = isGlobal
                    ? db.prepare('SELECT level FROM pets WHERE userId = ? ORDER BY level DESC LIMIT 1').get(u.userId)
                    : db.prepare('SELECT level FROM pets WHERE guildId = ? AND userId = ? ORDER BY level DESC LIMIT 1').get(guildId, u.userId);
                const petLv = petRow ? petRow.level : 0;
                const badges = isGlobal
                    ? db.prepare('SELECT COUNT(*) as c FROM achievements WHERE userId = ?').get(u.userId).c
                    : db.prepare('SELECT COUNT(*) as c FROM achievements WHERE guildId = ? AND userId = ?').get(guildId, u.userId).c;

                const { score } = computeScore({
                    level: u.level, balance: u.balance, badges, streak, petLv,
                    fish: st('total_fish_caught'), giantFish: st('giant_fish_defeated'), seaMonsters: st('sea_monster_encounters'),
                    godFish: st('fish_caught_god_tier'), secretFish: st('fish_caught_secret_tier'), voidFish: st('fish_caught_void_rift'),
                    abyssFish: st('fish_caught_abyss'), secretLocs: st('secret_locations_unlocked'), treasures: st('fishing_treasures_found'),
                    farm: st('total_harvests'), craft: st('total_crafts'),
                    dungeon: st('dungeon_clears'), boss: st('boss_kills'), pvp: st('pvp_wins'),
                    worldBossHits: st('world_boss_attacks'), worldBossKills: st('world_boss_last_hit'),
                    expeditions: st('total_expeditions'), refines: st('refine_successes'), relicMelts: st('relic_melts'),
                    fusions: st('fusion_success'), awakenings: st('total_awakenings'),
                    quests: st('total_quests_done'), weeklyQuests: st('total_weekly_quests_done'),
                    gifts: st('total_gifts_sent'), trades: st('trades_completed'),
                    chats: st('total_chats'), reactions: st('total_reactions'), voice: st('total_voice_mins'),
                    gambling: st('slot_wins') + st('coinflip_wins') + st('roulette_wins'), togelWins: st('togel_wins'),
                });

                return { userId: u.userId, score, level: u.level, balance: u.balance, fish: st('total_fish_caught'), farm: st('total_harvests'), streak, petLv, battle: st('dungeon_clears') + st('boss_kills') + st('pvp_wins'), badges };
            }).sort((a, b) => b.score - a.score).slice(0, 10);

            desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n\n`;
            scored.forEach((u, i) => {
                const rankTitle = getTitleFromScore(u.score);
                desc += `${medal(i)} <@${u.userId}> ${rankTitle.emoji} — ⭐ **${u.score.toLocaleString('id-ID')}** pts\n`;
                desc += `> Lv.${u.level} | 🪙${shortNum(u.balance)} | 🐟${u.fish} | 🌾${u.farm}`;
                if (!isGlobal) desc += ` | 🔥${u.streak}`;
                desc += ` | 🐾${u.petLv} | ⚔️${u.battle} | 🏅${u.badges}\n\n`;
            });

            desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n`;
            if (isGlobal) {
                desc += `> 📐 **Scoring:** Level×150 + Money/20 + Fish×3 + Farm×4\n`;
                desc += `> Craft×8 + Pet×5 + Dungeon×6 + Boss×15\n`;
                desc += `> PvP×10 + Badge×20 + Gambling×2\n`;
                desc += `> ⚠️ *Streak tidak dihitung di Global (anti-abuse)*`;
            } else {
                desc += `> 📐 **Scoring:** Level×150 + Money/20 + Fish×3 + Farm×4\n`;
                desc += `> Craft×8 + Streak×12 + Pet×5 + Dungeon×6 + Boss×15\n`;
                desc += `> PvP×10 + Badge×20 + Gambling×2`;
            }
            break;
        }
    }

    if (!desc || desc.trim() === `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n\n`) desc = '```\n  Belum ada data. Mulai bermain!\n```';

    return { title, desc, color, scopeLabel };
}

// Builds the embed + navigation buttons from precomputed content (cheap, per-call).
function renderLeaderboard(content, kategori, userId, isGlobal = false) {
    const { title, desc, color, scopeLabel } = content;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription(desc)
        .setFooter({ text: `${scopeLabel} • Gunakan tombol di bawah untuk ganti kategori • Today at ${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })}` })
        .setTimestamp();

    // Highlight current category with different button style
    const modePrefix = isGlobal ? 'lbg' : 'lb';
    const row1 = new ActionRowBuilder().addComponents(
        btn(`${modePrefix}_overall_${userId}`, '⭐ Overall', kategori === 'overall'),
        btn(`${modePrefix}_level_${userId}`, '📈 Level', kategori === 'level'),
        btn(`${modePrefix}_money_${userId}`, '💰 Money', kategori === 'money'),
        btn(`${modePrefix}_fish_${userId}`, '🎣 Fish', kategori === 'fish'),
        btn(`${modePrefix}_farm_${userId}`, '🌾 Farm', kategori === 'farm'),
    );
    // Di mode Global, streak dihilangkan karena bisa dimanipulasi admin server
    const row2Buttons = [
        btn(`${modePrefix}_pet_${userId}`, '🐾 Pet', kategori === 'pet'),
    ];
    if (!isGlobal) {
        row2Buttons.push(btn(`${modePrefix}_streak_${userId}`, '🔥 Streak', kategori === 'streak'));
    }
    row2Buttons.push(
        btn(`${modePrefix}_battle_${userId}`, '⚔️ Battle', kategori === 'battle'),
        btn(`${modePrefix}_gambling_${userId}`, '🎰 Gamble', kategori === 'gambling'),
        btn(`${modePrefix}_achievement_${userId}`, '🏆 Badge', kategori === 'achievement'),
    );
    const row2 = new ActionRowBuilder().addComponents(...row2Buttons);
    
    // Toggle button between Server and Global, plus Seasonal mode
    const row3 = new ActionRowBuilder().addComponents(
        btn(`lb_server_${userId}`, '📍 Server', !isGlobal && kategori !== 'season'),
        btn(`lbg_global_${userId}`, '🌍 Global', isGlobal && kategori !== 'season'),
        btn(`lb_season_${userId}`, '🗓️ Seasonal', kategori === 'season'),
    );

    return { embeds: [embed], components: [row1, row2, row3] };
}

function btn(customId, label, active) {
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(active ? ButtonStyle.Success : ButtonStyle.Secondary);
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
