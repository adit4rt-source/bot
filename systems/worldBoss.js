// systems/worldBoss.js — World Boss (Weekly)
// A global boss that ALL players across ALL servers can attack.
// Resets every Monday 00:00 WIB. Rewards based on damage contribution.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getUserStat, incrementUserStat, addIncome, addItem } = require('../database');
const { getRandomInt } = require('../utils');
const { getPetData, getRelicBonus } = require('./pets');
const { PET_DATA } = require('../data/pets');
const { checkAchievements } = require('./achievements');
const { updateQuestProgress } = require('./quests');

// ==================== WORLD BOSS DATA ====================
const WORLD_BOSSES = [
    { id: 'titan_golem', name: '🗿 Titan Golem', emoji: '🗿', hp: 500000, atk: 120, def: 80, description: 'Raksasa batu yang bangun dari tidur panjangnya.' },
    { id: 'kraken', name: '🐙 Kraken', emoji: '🐙', hp: 750000, atk: 150, def: 60, description: 'Monster laut purba yang menghancurkan kapal-kapal.' },
    { id: 'ancient_dragon', name: '🐲 Ancient Dragon', emoji: '🐲', hp: 1000000, atk: 200, def: 100, description: 'Naga tertua yang pernah ada. Api-nya menghanguskan dunia.' },
    { id: 'void_emperor', name: '🌑 Void Emperor', emoji: '🌑', hp: 1500000, atk: 250, def: 120, description: 'Penguasa kekosongan. Siapa yang berani menantangnya?' },
    { id: 'celestial_hydra', name: '🐉 Celestial Hydra', emoji: '🐉', hp: 2000000, atk: 300, def: 150, description: 'Hydra 9 kepala dari langit. Setiap kepala punya kekuatan berbeda.' },
];

// ==================== REWARD TIERS ====================
const REWARD_TIERS = [
    { rank: 1, money: 500000, items: [{ id: 'protection_stone', qty: 15 }, { id: 'xp_booster_3x', qty: 8 }, { id: 'awakening_crystal', qty: 1 }, { id: 'mythic_fragment', qty: 5 }, { id: 'lucky_charm', qty: 3 }], title: '🥇 MVP' },
    { rank: 2, money: 350000, items: [{ id: 'protection_stone', qty: 10 }, { id: 'xp_booster_3x', qty: 6 }, { id: 'mythic_fragment', qty: 3 }, { id: 'lucky_charm', qty: 2 }, { id: 'money_magnet', qty: 2 }], title: '🥈 2nd' },
    { rank: 3, money: 250000, items: [{ id: 'protection_stone', qty: 7 }, { id: 'xp_booster_2x', qty: 6 }, { id: 'mythic_fragment', qty: 2 }, { id: 'money_magnet', qty: 2 }], title: '🥉 3rd' },
    { rank: 10, money: 150000, items: [{ id: 'refine_stone', qty: 10 }, { id: 'xp_booster_2x', qty: 4 }, { id: 'mythic_fragment', qty: 1 }, { id: 'mystery_box', qty: 4 }], title: 'Top 10' },
    { rank: 25, money: 90000, items: [{ id: 'refine_stone', qty: 6 }, { id: 'mystery_box', qty: 4 }, { id: 'lucky_charm', qty: 1 }], title: 'Top 25' },
    { rank: 50, money: 50000, items: [{ id: 'refine_stone', qty: 5 }, { id: 'mystery_box', qty: 3 }, { id: 'money_magnet', qty: 1 }], title: 'Top 50' },
    { rank: 999, money: 25000, items: [{ id: 'mystery_box', qty: 3 }, { id: 'refine_stone', qty: 2 }], title: 'Participant' },
];

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS world_boss (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bossId TEXT,
    bossName TEXT,
    maxHp INTEGER,
    currentHp INTEGER,
    weekId TEXT UNIQUE,
    status TEXT DEFAULT 'active',
    startedAt INTEGER,
    defeatedAt INTEGER DEFAULT NULL
)`);

db.exec(`CREATE TABLE IF NOT EXISTS world_boss_damage (
    weekId TEXT,
    userId TEXT,
    username TEXT,
    totalDamage INTEGER DEFAULT 0,
    attacks INTEGER DEFAULT 0,
    lastAttack INTEGER DEFAULT 0,
    PRIMARY KEY (weekId, userId)
)`);

// ==================== HELPERS ====================
function getWeekId() {
    // Week ID = YYYY-Www format (ISO week, but adjusted to Monday reset WIB)
    const now = new Date();
    const wib = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const year = wib.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const days = Math.floor((wib - startOfYear) / 86400000);
    const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function getCurrentBoss() {
    const weekId = getWeekId();
    let boss = db.prepare('SELECT * FROM world_boss WHERE weekId = ?').get(weekId);
    
    if (!boss) {
        // Spawn new boss for this week
        const bossData = WORLD_BOSSES[Math.floor(Math.random() * WORLD_BOSSES.length)];
        // Scale HP based on participation from the PREVIOUS week only.
        // (The old query did COUNT(DISTINCT userId) over ALL past weeks with a
        // no-op ORDER BY/LIMIT, so HP inflated every week until unbeatable.)
        const prevWeek = db.prepare('SELECT weekId FROM world_boss_damage WHERE weekId != ? ORDER BY weekId DESC LIMIT 1').get(weekId);
        let lastWeekAttackers = 5;
        if (prevWeek) {
            const row = db.prepare('SELECT COUNT(DISTINCT userId) as cnt FROM world_boss_damage WHERE weekId = ?').get(prevWeek.weekId);
            lastWeekAttackers = (row && row.cnt) ? row.cnt : 5;
        }
        const hpScale = Math.max(1, Math.floor(lastWeekAttackers / 5));
        const scaledHp = bossData.hp * hpScale;

        db.prepare('INSERT OR IGNORE INTO world_boss (bossId, bossName, maxHp, currentHp, weekId, status, startedAt) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
            bossData.id, bossData.name, scaledHp, scaledHp, weekId, 'active', Date.now()
        );
        boss = db.prepare('SELECT * FROM world_boss WHERE weekId = ?').get(weekId);
    }
    
    return boss;
}

function getBossDefinition(bossId) {
    return WORLD_BOSSES.find(b => b.id === bossId);
}

function getTopDamagers(weekId, limit = 10) {
    return db.prepare('SELECT * FROM world_boss_damage WHERE weekId = ? ORDER BY totalDamage DESC LIMIT ?').all(weekId, limit);
}

function getUserDamage(weekId, userId) {
    return db.prepare('SELECT * FROM world_boss_damage WHERE weekId = ? AND userId = ?').get(weekId, userId);
}

function getRewardTier(rank) {
    for (const tier of REWARD_TIERS) {
        if (rank <= tier.rank) return tier;
    }
    return REWARD_TIERS[REWARD_TIERS.length - 1];
}

// ==================== ATTACK LOGIC ====================
function attackWorldBoss(guildId, userId, username) {
    const boss = getCurrentBoss();
    if (!boss || boss.status !== 'active') {
        return { success: false, error: '☠️ Boss sudah dikalahkan minggu ini! Tunggu reset Senin.' };
    }

    const pet = getPetData(guildId, userId);
    if (!pet) {
        return { success: false, error: '❌ Kamu butuh pet aktif untuk menyerang World Boss!' };
    }

    // Check cooldown (30 seconds between attacks)
    const weekId = getWeekId();
    const userDmg = getUserDamage(weekId, userId);
    if (userDmg && (Date.now() - userDmg.lastAttack) < 30000) {
        const remaining = Math.ceil((30000 - (Date.now() - userDmg.lastAttack)) / 1000);
        return { success: false, error: `⏳ Tunggu **${remaining} detik** sebelum menyerang lagi!` };
    }

    const petDef = PET_DATA.find(p => p.id === pet.petId);
    const bossDef = getBossDefinition(boss.bossId);

    // Calculate damage
    const relicBonus = getRelicBonus(userId, pet.id); // equipped relic bonus applies here too
    const baseAtk = pet.atk + (pet.level * 2) + relicBonus.atk;
    const critChance = pet.crit + Math.floor(pet.level / 10) + relicBonus.crit;
    const isCrit = Math.random() * 100 < critChance;
    
    let damage = Math.max(10, baseAtk - Math.floor(bossDef.def * 0.3));
    // Add randomness (80%-120%)
    damage = Math.floor(damage * (0.8 + Math.random() * 0.4));
    if (isCrit) damage = Math.floor(damage * 2);

    // Pet element bonus (10% extra damage randomly)
    const elementBonus = Math.random() < 0.15;
    if (elementBonus) damage = Math.floor(damage * 1.1);

    // Apply damage to boss
    const newHp = Math.max(0, boss.currentHp - damage);
    db.prepare('UPDATE world_boss SET currentHp = ? WHERE weekId = ?').run(newHp, weekId);

    // Record damage
    if (userDmg) {
        db.prepare('UPDATE world_boss_damage SET totalDamage = totalDamage + ?, attacks = attacks + 1, lastAttack = ?, username = ? WHERE weekId = ? AND userId = ?').run(
            damage, Date.now(), username, weekId, userId
        );
    } else {
        db.prepare('INSERT INTO world_boss_damage (weekId, userId, username, totalDamage, attacks, lastAttack) VALUES (?, ?, ?, ?, 1, ?)').run(
            weekId, userId, username, damage, Date.now()
        );
    }

    // Check if boss is defeated
    let defeated = false;
    if (newHp <= 0) {
        db.prepare('UPDATE world_boss SET status = ?, defeatedAt = ? WHERE weekId = ?').run('defeated', Date.now(), weekId);
        defeated = true;
        incrementUserStat(guildId, userId, 'world_boss_last_hit');
    }

    // Give small money reward per attack
    const attackReward = getRandomInt(500, 1200);
    db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(attackReward, guildId, userId);
    addIncome(guildId, userId, 'battle', attackReward);
    incrementUserStat(guildId, userId, 'world_boss_attacks');
    updateQuestProgress(guildId, userId, 'worldboss', 1);

    // Pet XP from attacking
    const { addPetExp } = require('./pets');
    addPetExp(guildId, userId, getRandomInt(5, 15));

    return {
        success: true,
        damage,
        isCrit,
        elementBonus,
        newHp,
        maxHp: boss.maxHp,
        defeated,
        attackReward,
        pet,
        petDef,
        boss,
        bossDef,
        totalDamage: (userDmg ? userDmg.totalDamage : 0) + damage,
        attacks: (userDmg ? userDmg.attacks : 0) + 1
    };
}

// ==================== CLAIM REWARDS (after boss defeated) ====================
function claimWorldBossRewards(guildId, userId) {
    const weekId = getWeekId();
    // Look up THIS week's boss directly — do NOT call getCurrentBoss(), which
    // auto-spawns a fresh 'active' boss and would make a just-defeated boss
    // un-claimable (and could forfeit rewards right after defeat).
    const boss = db.prepare('SELECT * FROM world_boss WHERE weekId = ?').get(weekId);

    if (!boss || boss.status !== 'defeated') {
        return { success: false, error: '❌ Boss belum dikalahkan! Terus serang!' };
    }

    const userDmg = getUserDamage(weekId, userId);
    if (!userDmg || userDmg.totalDamage <= 0) {
        return { success: false, error: '❌ Kamu belum pernah menyerang boss minggu ini!' };
    }

    // Check if already claimed
    const claimKey = `wb_claimed_${weekId}`;
    const alreadyClaimed = getUserStat(guildId, userId, claimKey);
    if (alreadyClaimed) {
        return { success: false, error: '✅ Kamu sudah klaim reward minggu ini!' };
    }

    // Calculate rank
    const allDamagers = db.prepare('SELECT userId FROM world_boss_damage WHERE weekId = ? ORDER BY totalDamage DESC').all(weekId);
    const rank = allDamagers.findIndex(d => d.userId === userId) + 1;
    const reward = getRewardTier(rank);

    // Give rewards
    db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(reward.money, guildId, userId);
    addIncome(guildId, userId, 'event', reward.money);

    for (const item of reward.items) {
        addItem(guildId, userId, item.id, item.qty);
    }

    // Mark as claimed
    incrementUserStat(guildId, userId, claimKey);
    incrementUserStat(guildId, userId, 'world_boss_rewards_claimed');

    return {
        success: true,
        rank,
        reward,
        totalDamage: userDmg.totalDamage,
        attacks: userDmg.attacks,
        totalParticipants: allDamagers.length
    };
}

// ==================== BUILD: World Boss Panel ====================
function buildWorldBossPanel(guildId, userId, username) {
    const boss = getCurrentBoss();
    const bossDef = getBossDefinition(boss.bossId);
    const weekId = getWeekId();
    const pet = getPetData(guildId, userId);
    const userDmg = getUserDamage(weekId, userId);
    const topDamagers = getTopDamagers(weekId, 5);
    const totalParticipants = db.prepare('SELECT COUNT(*) as cnt FROM world_boss_damage WHERE weekId = ?').get(weekId)?.cnt || 0;

    const hpPercent = Math.max(0, Math.floor((boss.currentHp / boss.maxHp) * 100));
    const hpBarFilled = Math.floor(hpPercent / 5);
    const hpBar = '🟥'.repeat(Math.max(0, 20 - hpBarFilled)) + '⬛'.repeat(hpBarFilled);
    // Actually invert: red = remaining, black = lost
    const hpBarCorrect = '🟩'.repeat(Math.max(0, hpBarFilled)) + '⬛'.repeat(20 - hpBarFilled);

    let desc = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    desc += `${bossDef.emoji} **${boss.bossName}**\n`;
    desc += `> *${bossDef.description}*\n\n`;

    if (boss.status === 'defeated') {
        desc += `☠️ **BOSS DIKALAHKAN!** 🎉\n`;
        desc += `> Dikalahkan oleh **${totalParticipants}** player!\n\n`;
    } else {
        desc += `❤️ HP: \`${hpBarCorrect}\`\n`;
        desc += `> **${boss.currentHp.toLocaleString('id-ID')}** / ${boss.maxHp.toLocaleString('id-ID')} (${hpPercent}%)\n\n`;
    }

    desc += `> ⚔️ ATK: **${bossDef.atk}** | 🛡️ DEF: **${bossDef.def}**\n`;
    desc += `> 👥 Participants: **${totalParticipants}**\n`;
    desc += `> 📅 Week: **${weekId}**\n\n`;

    // User stats
    if (userDmg) {
        desc += `**📊 Kamu:**\n`;
        desc += `> ⚔️ Damage: **${userDmg.totalDamage.toLocaleString('id-ID')}**\n`;
        desc += `> 🗡️ Attacks: **${userDmg.attacks}**\n`;
        desc += `> 📈 Avg: **${Math.floor(userDmg.totalDamage / userDmg.attacks).toLocaleString('id-ID')}**/hit\n\n`;
    } else {
        desc += `**📊 Kamu:** *Belum menyerang*\n\n`;
    }

    // Top 5 leaderboard
    if (topDamagers.length > 0) {
        desc += `**🏆 Top 5 Damage:**\n`;
        topDamagers.forEach((d, i) => {
            const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i] || `${i+1}.`;
            desc += `> ${medal} **${d.username || 'Unknown'}** — ${d.totalDamage.toLocaleString('id-ID')} dmg (${d.attacks} hits)\n`;
        });
    }

    desc += `\n━━━━━━━━━━━━━━━━━━━━━━`;

    const embed = new EmbedBuilder()
        .setTitle(`🗺️ WORLD BOSS — Weekly`)
        .setColor(boss.status === 'defeated' ? '#2ECC71' : '#E74C3C')
        .setDescription(desc)
        .setFooter({ text: boss.status === 'defeated' ? 'Boss dikalahkan! Klaim reward!' : `Pet: ${pet ? pet.name + ' Lv.' + pet.level : 'Tidak ada'} | CD: 30 detik/attack` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`wb_attack_${userId}`).setLabel('⚔️ Attack!').setStyle(ButtonStyle.Danger).setDisabled(boss.status === 'defeated' || !pet),
        new ButtonBuilder().setCustomId(`wb_claim_${userId}`).setLabel('🎁 Claim Reward').setStyle(ButtonStyle.Success).setDisabled(boss.status !== 'defeated' || !userDmg),
        new ButtonBuilder().setCustomId(`wb_leaderboard_${userId}`).setLabel('🏆 Full Ranking').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`wb_rewards_${userId}`).setLabel('📋 Reward Info').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

// ==================== HANDLER: Button Clicks ====================
async function handleWorldBossButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    const action = parts[1];

    // === ATTACK ===
    if (action === 'attack') {
        const result = attackWorldBoss(guildId, userId, interaction.user.username);
        if (!result.success) {
            return interaction.reply({ content: result.error, ephemeral: true });
        }

        const hpPercent = Math.max(0, Math.floor((result.newHp / result.maxHp) * 100));

        let desc = `${result.petDef ? result.petDef.emoji : '🐾'} **${result.pet.name}** menyerang ${result.bossDef.emoji} **${result.boss.bossName}**!\n\n`;
        desc += `> ⚔️ Damage: **${result.damage.toLocaleString('id-ID')}**`;
        if (result.isCrit) desc += ` 💥 **CRIT!**`;
        if (result.elementBonus) desc += ` 🌟 **ELEMENT BONUS!**`;
        desc += `\n`;
        desc += `> 🪙 Reward: +**${result.attackReward}** money\n`;
        desc += `> 📊 Total Damage: **${result.totalDamage.toLocaleString('id-ID')}** (${result.attacks} hits)\n\n`;

        if (result.defeated) {
            desc += `\n🎉🎉 **BOSS DIKALAHKAN!!!** 🎉🎉\n`;
            desc += `> Kamu memberikan hit terakhir! 🏆\n`;
            desc += `> Klik **Claim Reward** untuk ambil hadiah!`;
        } else {
            desc += `> ❤️ Boss HP: **${result.newHp.toLocaleString('id-ID')}** / ${result.maxHp.toLocaleString('id-ID')} (${hpPercent}%)`;
        }

        const embed = new EmbedBuilder()
            .setTitle(result.defeated ? '☠️ BOSS DEFEATED!' : '⚔️ Attack!')
            .setColor(result.defeated ? '#FFD700' : (result.isCrit ? '#FF6B00' : '#E74C3C'))
            .setDescription(desc)
            .setFooter({ text: 'Cooldown: 30 detik' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`wb_attack_${userId}`).setLabel('⚔️ Attack Again!').setStyle(ButtonStyle.Danger).setDisabled(result.defeated),
            new ButtonBuilder().setCustomId(`wb_claim_${userId}`).setLabel('🎁 Claim').setStyle(ButtonStyle.Success).setDisabled(!result.defeated),
            new ButtonBuilder().setCustomId(`wb_main_${userId}`).setLabel('🔙 Boss Panel').setStyle(ButtonStyle.Secondary)
        );

        // Achievements are a side-effect: never let them block acknowledging the
        // interaction (a throw here previously left it unacknowledged -> "failed").
        try { await checkAchievements(interaction.guild, userId, { type: 'world_boss' }); } catch (e) { /* non-fatal */ }
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === CLAIM ===
    if (action === 'claim') {
        const result = claimWorldBossRewards(guildId, userId);
        if (!result.success) {
            return interaction.reply({ content: result.error, ephemeral: true });
        }

        let itemList = result.reward.items.map(i => {
            const def = require('../data/items').ITEMS.find(x => x.id === i.id);
            return `> ${def ? def.emoji : '📦'} **${def ? def.name : i.id}** x${i.qty}`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('🎁 World Boss Reward Claimed!')
            .setColor('#FFD700')
            .setDescription(
                `**Rank: #${result.rank}** (${result.reward.title}) — dari ${result.totalParticipants} player\n\n` +
                `> ⚔️ Total Damage: **${result.totalDamage.toLocaleString('id-ID')}** (${result.attacks} hits)\n\n` +
                `**🎁 Rewards:**\n` +
                `> 🪙 Money: **+${result.reward.money.toLocaleString('id-ID')}**\n` +
                `${itemList}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `*Boss baru muncul Senin depan!*`
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`wb_main_${userId}`).setLabel('🗺️ Boss Panel').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`wb_leaderboard_${userId}`).setLabel('🏆 Full Ranking').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === MAIN (refresh panel) ===
    if (action === 'main') {
        return interaction.update(buildWorldBossPanel(guildId, userId, interaction.user.username));
    }

    // === LEADERBOARD (top 20) ===
    if (action === 'leaderboard') {
        const weekId = getWeekId();
        const top = getTopDamagers(weekId, 20);
        const userDmg = getUserDamage(weekId, userId);

        let desc = `**📅 Week: ${weekId}**\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        if (top.length === 0) {
            desc += '*Belum ada yang menyerang boss minggu ini.*\n';
        } else {
            top.forEach((d, i) => {
                const medal = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
                const isMe = d.userId === userId ? ' ◀ **KAMU**' : '';
                desc += `${medal} **${d.username || 'Unknown'}** — ${d.totalDamage.toLocaleString('id-ID')} dmg (${d.attacks} hits)${isMe}\n`;
            });
        }

        if (userDmg) {
            const allDamagers = db.prepare('SELECT userId FROM world_boss_damage WHERE weekId = ? ORDER BY totalDamage DESC').all(weekId);
            const myRank = allDamagers.findIndex(d => d.userId === userId) + 1;
            desc += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
            desc += `> 📍 Rank kamu: **#${myRank}** | Damage: **${userDmg.totalDamage.toLocaleString('id-ID')}**`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🏆 World Boss — Damage Ranking')
            .setColor('#FFD700')
            .setDescription(desc);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`wb_main_${userId}`).setLabel('🔙 Boss Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === REWARD INFO ===
    if (action === 'rewards') {
        let desc = `**🎁 Reward berdasarkan Rank Damage:**\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        REWARD_TIERS.forEach(tier => {
            const items = tier.items.map(i => {
                const def = require('../data/items').ITEMS.find(x => x.id === i.id);
                return `${def ? def.emoji : '📦'} ${def ? def.name : i.id} x${i.qty}`;
            }).join(', ');
            const rankLabel = tier.rank === 1 ? '#1' : tier.rank <= 3 ? `#${tier.rank}` : tier.rank <= 999 ? `Top ${tier.rank}` : 'Semua';
            desc += `> ${tier.title} (${rankLabel}) — 🪙 ${tier.money.toLocaleString('id-ID')} + ${items}\n`;
        });
        desc += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
        desc += `> ⚔️ **Cara main:** Klik Attack untuk damage boss\n`;
        desc += `> ⏱️ **Cooldown:** 30 detik per attack\n`;
        desc += `> 🐾 **Butuh pet aktif** untuk menyerang\n`;
        desc += `> 📅 **Reset:** Setiap hari Senin 00:00 WIB\n`;
        desc += `> 🎁 **Claim:** Setelah boss dikalahkan`;

        const embed = new EmbedBuilder()
            .setTitle('📋 World Boss — Reward Info')
            .setColor('#9B59B6')
            .setDescription(desc);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`wb_main_${userId}`).setLabel('🔙 Boss Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

// ==================== DETECTORS ====================
function isWorldBossButton(customId) {
    return customId.startsWith('wb_');
}

// ==================== EXPORTS ====================
module.exports = {
    WORLD_BOSSES,
    getCurrentBoss,
    claimWorldBossRewards,
    buildWorldBossPanel,
    handleWorldBossButton,
    isWorldBossButton
};
