// systems/leaderboard.js — /leaderboard Panel (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getUserStat } = require('../database');
const { PET_DATA } = require('../data/pets');

// ==================== BUILD LEADERBOARD EMBED ====================
function buildLeaderboard(guildId, kategori, userId) {
    let title, desc = '', color = '#FFD700';

    switch (kategori) {
        case 'level': {
            title = '📈 Top 10 — Level';
            const data = db.prepare('SELECT * FROM users WHERE guildId = ? ORDER BY level DESC, xp DESC LIMIT 10').all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — Lv.**${u.level}** (${u.xp}/${(u.level+1)*100} XP)\n`; });
            break;
        }
        case 'money': {
            title = '💰 Top 10 — Money';
            const data = db.prepare('SELECT * FROM users WHERE guildId = ? ORDER BY balance DESC LIMIT 10').all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — 🪙 **${u.balance.toLocaleString('id-ID')}**\n`; });
            break;
        }
        case 'fish': {
            title = '🎣 Top 10 — Fishing';
            const data = db.prepare("SELECT userId, stat_value FROM user_stats WHERE guildId = ? AND stat_key = 'total_fish_caught' ORDER BY stat_value DESC LIMIT 10").all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — 🐟 **${u.stat_value}** ikan\n`; });
            break;
        }
        case 'farm': {
            title = '🌾 Top 10 — Farming';
            const data = db.prepare("SELECT userId, stat_value FROM user_stats WHERE guildId = ? AND stat_key = 'total_harvests' ORDER BY stat_value DESC LIMIT 10").all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — 🌾 **${u.stat_value}** panen\n`; });
            break;
        }
        case 'pet': {
            title = '🐾 Top 10 — Pet Level';
            const data = db.prepare('SELECT * FROM pets WHERE guildId = ? AND active = 1 ORDER BY level DESC, exp DESC LIMIT 10').all(guildId);
            data.forEach((u, i) => { const pd = PET_DATA.find(p => p.id === u.petId); desc += `${medal(i)} <@${u.userId}> — ${pd ? pd.emoji : '🐾'} **${u.name}** Lv.**${u.level}**\n`; });
            break;
        }
        case 'streak': {
            title = '🔥 Top 10 — Streak';
            const data = db.prepare('SELECT * FROM streaks WHERE guildId = ? ORDER BY count DESC LIMIT 10').all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — 🔥 **${u.count}** hari\n`; });
            break;
        }
        case 'battle': {
            title = '⚔️ Top 10 — Battle Score';
            const pvp = db.prepare("SELECT userId, stat_value FROM user_stats WHERE guildId = ? AND stat_key = 'pvp_wins' ORDER BY stat_value DESC LIMIT 20").all(guildId);
            const dungeon = db.prepare("SELECT userId, stat_value FROM user_stats WHERE guildId = ? AND stat_key = 'dungeon_clears' ORDER BY stat_value DESC LIMIT 20").all(guildId);
            const boss = db.prepare("SELECT userId, stat_value FROM user_stats WHERE guildId = ? AND stat_key = 'boss_kills' ORDER BY stat_value DESC LIMIT 20").all(guildId);
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
            title = '🎰 Top 10 — Gambling';
            const data = db.prepare("SELECT userId, stat_value FROM user_stats WHERE guildId = ? AND stat_key = 'total_gambling_wins' ORDER BY stat_value DESC LIMIT 10").all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — 🪙 **${u.stat_value.toLocaleString('id-ID')}** menang\n`; });
            break;
        }
        case 'achievement': {
            title = '🏆 Top 10 — Achievement';
            const data = db.prepare('SELECT userId, COUNT(*) as cnt FROM achievements WHERE guildId = ? GROUP BY userId ORDER BY cnt DESC LIMIT 10').all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — 🏅 **${u.cnt}** badge\n`; });
            break;
        }
        case 'overall':
        default: {
            title = '⭐ Top 10 — Overall Score';
            color = '#FF6B00';
            const users = db.prepare('SELECT * FROM users WHERE guildId = ?').all(guildId);
            const scored = users.map(u => {
                const fish = getStat(guildId, u.userId, 'total_fish_caught');
                const farm = getStat(guildId, u.userId, 'total_harvests');
                const craft = getStat(guildId, u.userId, 'total_crafts');
                const streakRow = db.prepare('SELECT count FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, u.userId);
                const streak = streakRow ? streakRow.count : 0;
                const petRow = db.prepare('SELECT level FROM pets WHERE guildId = ? AND userId = ? ORDER BY level DESC LIMIT 1').get(guildId, u.userId);
                const petLv = petRow ? petRow.level : 0;
                const dungeon = getStat(guildId, u.userId, 'dungeon_clears');
                const boss = getStat(guildId, u.userId, 'boss_kills');
                const pvp = getStat(guildId, u.userId, 'pvp_wins');
                const badges = db.prepare('SELECT COUNT(*) as c FROM achievements WHERE guildId = ? AND userId = ?').get(guildId, u.userId).c;
                const gambling = getStat(guildId, u.userId, 'slot_wins') + getStat(guildId, u.userId, 'coinflip_wins') + getStat(guildId, u.userId, 'roulette_wins');

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
                desc += `> Lv.${u.level} | 🪙${shortNum(u.balance)} | 🐟${u.fish} | 🌾${u.farm} | 🔥${u.streak} | 🐾${u.petLv} | ⚔️${u.battle} | 🏅${u.badges}\n`;
            });

            desc += `\n━━━━━━━━━━━━━━━━━━━━\n`;
            desc += `> **📐 Scoring:** Level×150 + Money/20 + Fish×3 + Farm×4\n`;
            desc += `> Craft×8 + Streak×12 + Pet×5 + Dungeon×6 + Boss×15\n`;
            desc += `> PvP×10 + Badge×20 + Gambling×2`;
            break;
        }
    }

    if (!desc) desc = '*Belum ada data. Mulai bermain!*';

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription(desc)
        .setFooter({ text: `Gunakan tombol di bawah untuk ganti kategori` })
        .setTimestamp();

    // Highlight current category with different button style
    const row1 = new ActionRowBuilder().addComponents(
        btn(`lb_overall_${userId}`, '⭐ Overall', kategori === 'overall'),
        btn(`lb_level_${userId}`, '📈 Level', kategori === 'level'),
        btn(`lb_money_${userId}`, '💰 Money', kategori === 'money'),
        btn(`lb_fish_${userId}`, '🎣 Fish', kategori === 'fish'),
        btn(`lb_farm_${userId}`, '🌾 Farm', kategori === 'farm'),
    );
    const row2 = new ActionRowBuilder().addComponents(
        btn(`lb_pet_${userId}`, '🐾 Pet', kategori === 'pet'),
        btn(`lb_streak_${userId}`, '🔥 Streak', kategori === 'streak'),
        btn(`lb_battle_${userId}`, '⚔️ Battle', kategori === 'battle'),
        btn(`lb_gambling_${userId}`, '🎰 Gamble', kategori === 'gambling'),
        btn(`lb_achievement_${userId}`, '🏆 Badge', kategori === 'achievement'),
    );

    return { embeds: [embed], components: [row1, row2] };
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
    const parts = interaction.customId.split('_'); // lb_<kategori>_<userId>
    const kategori = parts[1];
    const ownerId = parts[2];

    // Any user can browse leaderboard (read-only, no need to restrict)
    const panel = buildLeaderboard(interaction.guild.id, kategori, ownerId);
    return interaction.update(panel);
}

// ==================== DETECTOR ====================
function isLeaderboardButton(customId) {
    return customId.startsWith('lb_');
}

// Helpers
function medal(i) { return ['🥇', '🥈', '🥉'][i] || `**${i+1}.**`; }
function getStat(guildId, userId, key) { return getUserStat(guildId, userId, key) || 0; }
function shortNum(n) { if (n >= 1000000) return (n/1000000).toFixed(1)+'M'; if (n >= 1000) return (n/1000).toFixed(1)+'K'; return n.toString(); }

module.exports = { handleLeaderboardCommand, handleLeaderboardButton, isLeaderboardButton };
