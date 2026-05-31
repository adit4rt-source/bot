// systems/leaderboard.js — /leaderboard command handler
const { EmbedBuilder } = require('discord.js');
const { db, getUserStat } = require('../database');
const { FISH_DATA } = require('../data/fish');
const { PET_DATA } = require('../data/pets');

async function handleLeaderboardCommand(interaction) {
    const guildId = interaction.guild.id;
    const kategori = interaction.options.getString('kategori') || 'overall';

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
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — 🐟 **${u.stat_value}** ikan ditangkap\n`; });
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
            title = '⚔️ Top 10 — Battle';
            const pvp = db.prepare("SELECT userId, stat_value FROM user_stats WHERE guildId = ? AND stat_key = 'pvp_wins' ORDER BY stat_value DESC LIMIT 10").all(guildId);
            const dungeon = db.prepare("SELECT userId, stat_value FROM user_stats WHERE guildId = ? AND stat_key = 'dungeon_clears' ORDER BY stat_value DESC LIMIT 10").all(guildId);
            const boss = db.prepare("SELECT userId, stat_value FROM user_stats WHERE guildId = ? AND stat_key = 'boss_kills' ORDER BY stat_value DESC LIMIT 10").all(guildId);
            // Combine scores: pvp*2 + dungeon*1 + boss*3
            const scoreMap = {};
            for (const r of pvp) scoreMap[r.userId] = (scoreMap[r.userId] || 0) + r.stat_value * 2;
            for (const r of dungeon) scoreMap[r.userId] = (scoreMap[r.userId] || 0) + r.stat_value;
            for (const r of boss) scoreMap[r.userId] = (scoreMap[r.userId] || 0) + r.stat_value * 3;
            const sorted = Object.entries(scoreMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
            sorted.forEach(([uid, score], i) => {
                const pW = pvp.find(r => r.userId === uid)?.stat_value || 0;
                const dC = dungeon.find(r => r.userId === uid)?.stat_value || 0;
                const bK = boss.find(r => r.userId === uid)?.stat_value || 0;
                desc += `${medal(i)} <@${uid}> — ⚔️ **${score}** pts (PvP:${pW} | Dg:${dC} | Boss:${bK})\n`;
            });
            break;
        }
        case 'gambling': {
            title = '🎰 Top 10 — Gambling Wins';
            const data = db.prepare("SELECT userId, stat_value FROM user_stats WHERE guildId = ? AND stat_key = 'total_gambling_wins' ORDER BY stat_value DESC LIMIT 10").all(guildId);
            data.forEach((u, i) => { desc += `${medal(i)} <@${u.userId}> — 🪙 **${u.stat_value.toLocaleString('id-ID')}** total menang\n`; });
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
            title = '⭐ Top 10 — Overall Score (Event)';
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

                return { userId: u.userId, score, level: u.level, balance: u.balance, fish, farm, streak, petLv, dungeon, boss, pvp, badges };
            }).sort((a, b) => b.score - a.score).slice(0, 10);

            scored.forEach((u, i) => {
                desc += `${medal(i)} <@${u.userId}> — ⭐ **${u.score.toLocaleString('id-ID')}** pts\n`;
                desc += `> Lv.${u.level} | 🪙${shortNum(u.balance)} | 🐟${u.fish} | 🌾${u.farm} | 🔥${u.streak} | 🐾${u.petLv} | ⚔️${u.dungeon+u.boss+u.pvp} | 🏅${u.badges}\n`;
            });

            desc += `\n━━━━━━━━━━━━━━━━━━━━\n`;
            desc += `> **📐 Rumus Score:**\n`;
            desc += `> Level×150 + Money/20 + Fish×3 + Farm×4 + Craft×8\n`;
            desc += `> Streak×12 + Pet×5 + Dungeon×6 + Boss×15 + PvP×10\n`;
            desc += `> Badge×20 + Gambling×2`;
            break;
        }
    }

    if (!desc) desc = '*Belum ada data. Mulai bermain!*';

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription(desc)
        .setFooter({ text: `${interaction.guild.name} | /leaderboard <kategori>` })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

// Helpers
function medal(i) { return ['🥇', '🥈', '🥉'][i] || `**${i+1}.**`; }
function getStat(guildId, userId, key) { return getUserStat(guildId, userId, key) || 0; }
function shortNum(n) { if (n >= 1000000) return (n/1000000).toFixed(1)+'M'; if (n >= 1000) return (n/1000).toFixed(1)+'K'; return n.toString(); }

module.exports = { handleLeaderboardCommand };
