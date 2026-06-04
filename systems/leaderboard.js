// systems/leaderboard.js — /leaderboard Panel (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getUserStat } = require('../database');
const { PET_DATA } = require('../data/pets');

// ==================== BUILD LEADERBOARD EMBED ====================
function buildLeaderboard(guildId, kategori, userId, isGlobal = false) {
    let title, desc = '', color = '#FFD700';
    const scopePrefix = isGlobal ? '🌍 GLOBAL • ' : '';

    switch (kategori) {
        case 'level': {
            title = `${scopePrefix}📈 Top 10 — Level`;
            let query = 'SELECT * FROM users';
            if (!isGlobal) query += ' WHERE guildId = ?';
            query += ' ORDER BY level DESC, xp DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — Lv.**${u.level}** (${u.xp}/${(u.level+1)*100} XP)\n`; });
            break;
        }
        case 'money': {
            title = `${scopePrefix}💰 Top 10 — Money`;
            let query = 'SELECT * FROM users';
            if (!isGlobal) query += ' WHERE guildId = ?';
            query += ' ORDER BY balance DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — 🪙 **${u.balance.toLocaleString('id-ID')}**\n`; });
            break;
        }
        case 'fish': {
            title = `${scopePrefix}🎣 Top 10 — Fishing`;
            let query = "SELECT userId, stat_value FROM user_stats WHERE stat_key = 'total_fish_caught'";
            if (!isGlobal) query += ' AND guildId = ?';
            query += ' ORDER BY stat_value DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — 🐟 **${u.stat_value}** ikan\n`; });
            break;
        }
        case 'farm': {
            title = `${scopePrefix}🌾 Top 10 — Farming`;
            let query = "SELECT userId, stat_value FROM user_stats WHERE stat_key = 'total_harvests'";
            if (!isGlobal) query += ' AND guildId = ?';
            query += ' ORDER BY stat_value DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — 🌾 **${u.stat_value}** panen\n`; });
            break;
        }
        case 'pet': {
            title = `${scopePrefix}🐾 Top 10 — Pet Level`;
            let query = 'SELECT * FROM pets WHERE active = 1';
            if (!isGlobal) query += ' AND guildId = ?';
            query += ' ORDER BY level DESC, exp DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            data.forEach((u, i) => { const pd = PET_DATA.find(p => p.id === u.petId); desc += `${medal(i)} <@${u.userId}> — ${pd ? pd.emoji : '🐾'} **${u.name}** Lv.**${u.level}**\n`; });
            break;
        }
        case 'streak': {
            title = `${scopePrefix}🔥 Top 10 — Streak`;
            let query = 'SELECT * FROM streaks';
            if (!isGlobal) query += ' WHERE guildId = ?';
            query += ' ORDER BY count DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — 🔥 **${u.count}** hari\n`; });
            break;
        }
        case 'battle': {
            title = `${scopePrefix}⚔️ Top 10 — Battle Score`;
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
            sorted.forEach(([uid, score], i) => {
                const pW = pvp.find(r => r.userId === uid)?.stat_value || 0;
                const dC = dungeon.find(r => r.userId === uid)?.stat_value || 0;
                const bK = boss.find(r => r.userId === uid)?.stat_value || 0;
                desc += `${medal(i)} <@${uid}> — ⚔️ **${score}** (PvP:${pW} Dg:${dC} Boss:${bK})\n`;
            });
            break;
        }
        case 'gambling': {
            title = `${scopePrefix}🎰 Top 10 — Gambling`;
            let query = "SELECT userId, stat_value FROM user_stats WHERE stat_key = 'total_gambling_wins'";
            if (!isGlobal) query += ' AND guildId = ?';
            query += ' ORDER BY stat_value DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — 🪙 **${u.stat_value.toLocaleString('id-ID')}** menang\n`; });
            break;
        }
        case 'achievement': {
            title = `${scopePrefix}🏆 Top 10 — Achievement`;
            let query = 'SELECT userId, COUNT(*) as cnt FROM achievements';
            if (!isGlobal) query += ' WHERE guildId = ?';
            query += ' GROUP BY userId ORDER BY cnt DESC LIMIT 10';
            const data = isGlobal ? db.prepare(query).all() : db.prepare(query).all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — 🏅 **${u.cnt}** badge\n`; });
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
                const fish = isGlobal ? getGlobalStat(u.userId, 'total_fish_caught') : getStat(guildId, u.userId, 'total_fish_caught');
                const farm = isGlobal ? getGlobalStat(u.userId, 'total_harvests') : getStat(guildId, u.userId, 'total_harvests');
                const craft = isGlobal ? getGlobalStat(u.userId, 'total_crafts') : getStat(guildId, u.userId, 'total_crafts');
                
                // Streak TIDAK dihitung di leaderboard GLOBAL (bisa dimanipulasi admin server)
                let streak = 0;
                if (!isGlobal) {
                    const streakRow = db.prepare('SELECT count FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, u.userId);
                    streak = streakRow ? streakRow.count : 0;
                }
                
                let petRow;
                if (isGlobal) {
                    petRow = db.prepare('SELECT level FROM pets WHERE userId = ? ORDER BY level DESC LIMIT 1').get(u.userId);
                } else {
                    petRow = db.prepare('SELECT level FROM pets WHERE guildId = ? AND userId = ? ORDER BY level DESC LIMIT 1').get(guildId, u.userId);
                }
                const petLv = petRow ? petRow.level : 0;
                
                const dungeon = isGlobal ? getGlobalStat(u.userId, 'dungeon_clears') : getStat(guildId, u.userId, 'dungeon_clears');
                const boss = isGlobal ? getGlobalStat(u.userId, 'boss_kills') : getStat(guildId, u.userId, 'boss_kills');
                const pvp = isGlobal ? getGlobalStat(u.userId, 'pvp_wins') : getStat(guildId, u.userId, 'pvp_wins');
                
                let badges;
                if (isGlobal) {
                    badges = db.prepare('SELECT COUNT(*) as c FROM achievements WHERE userId = ?').get(u.userId).c;
                } else {
                    badges = db.prepare('SELECT COUNT(*) as c FROM achievements WHERE guildId = ? AND userId = ?').get(guildId, u.userId).c;
                }
                
                const slot = isGlobal ? getGlobalStat(u.userId, 'slot_wins') : getStat(guildId, u.userId, 'slot_wins');
                const coin = isGlobal ? getGlobalStat(u.userId, 'coinflip_wins') : getStat(guildId, u.userId, 'coinflip_wins');
                const roulette = isGlobal ? getGlobalStat(u.userId, 'roulette_wins') : getStat(guildId, u.userId, 'roulette_wins');
                const gambling = slot + coin + roulette;

                // Di mode GLOBAL, streak tidak dihitung (bobot 0)
                const score = (u.level * 150)
                    + Math.floor(u.balance / 20)
                    + (fish * 3)
                    + (farm * 4)
                    + (craft * 8)
                    + (streak * 12)
                    + (petLv * 5)
                    + (dungeon * 6)
                    + (boss * 15)
                    + (pvp * 10)
                    + (badges * 20)
                    + (gambling * 2);

                return { userId: u.userId, score, level: u.level, balance: u.balance, fish, farm, streak, petLv, battle: dungeon+boss+pvp, badges };
            }).sort((a, b) => b.score - a.score).slice(0, 10);

            scored.forEach((u, i) => {
                desc += `${medal(i)} <@${u.userId}> — ⭐ **${u.score.toLocaleString('id-ID')}** pts\n`;
                if (isGlobal) {
                    desc += `> Lv.${u.level} | 🪙${shortNum(u.balance)} | 🐟${u.fish} | 🌾${u.farm} | 🐾${u.petLv} | ⚔️${u.battle} | 🏅${u.badges}\n`;
                } else {
                    desc += `> Lv.${u.level} | 🪙${shortNum(u.balance)} | 🐟${u.fish} | 🌾${u.farm} | 🔥${u.streak} | 🐾${u.petLv} | ⚔️${u.battle} | 🏅${u.badges}\n`;
                }
            });

            desc += `\n━━━━━━━━━━━━━━━━━━━━\n`;
            if (isGlobal) {
                desc += `> **📐 Scoring:** Level×150 + Money/20 + Fish×3 + Farm×4\n`;
                desc += `> Craft×8 + Pet×5 + Dungeon×6 + Boss×15\n`;
                desc += `> PvP×10 + Badge×20 + Gambling×2\n`;
                desc += `> ⚠️ *Streak tidak dihitung di Global (anti-abuse)*`;
            } else {
                desc += `> **📐 Scoring:** Level×150 + Money/20 + Fish×3 + Farm×4\n`;
                desc += `> Craft×8 + Streak×12 + Pet×5 + Dungeon×6 + Boss×15\n`;
                desc += `> PvP×10 + Badge×20 + Gambling×2`;
            }
            break;
        }
    }

    if (!desc) desc = '*Belum ada data. Mulai bermain!*';

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription(desc)
        .setFooter({ text: isGlobal ? `🌍 Mode GLOBAL | Gunakan tombol untuk ganti kategori` : `Gunakan tombol di bawah untuk ganti kategori` })
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
    
    // Toggle button between Server and Global
    const row3 = new ActionRowBuilder().addComponents(
        btn(`lb_server_${userId}`, isGlobal ? '📍 Server' : '📍 Server', !isGlobal),
        btn(`lbg_global_${userId}`, isGlobal ? '🌍 Global' : '🌍 Global', isGlobal),
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
    const prefix = isGlobalMode ? 'lbg' : 'lb';
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

// Helpers
function medal(i) { return ['🥇', '🥈', '🥉'][i] || `**${i+1}.**`; }
function getStat(guildId, userId, key) { return getUserStat(guildId, userId, key) || 0; }
function getGlobalStat(userId, key) {
    const row = db.prepare('SELECT stat_value FROM user_stats WHERE userId = ? AND stat_key = ? ORDER BY stat_value DESC LIMIT 1').get(userId, key);
    return row ? row.stat_value : 0;
}
function shortNum(n) { if (n >= 1000000) return (n/1000000).toFixed(1)+'M'; if (n >= 1000) return (n/1000).toFixed(1)+'K'; return n.toString(); }

module.exports = { handleLeaderboardCommand, handleLeaderboardButton, isLeaderboardButton };
