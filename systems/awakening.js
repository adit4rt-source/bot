// systems/awakening.js — Pet Awakening System
// Pets at Lv.200 (max) can "Awaken" — reset to Lv.1 but gain permanent stat boosts,
// visual auras (★), exclusive ability slots, and awakening titles.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getUserStat, incrementUserStat, addItem, removeItem, getItemCount } = require('../database');
const { getPetData } = require('./pets');
const { PET_DATA } = require('../data/pets');

// ==================== AWAKENING TIERS ====================
const AWAKENING_TIERS = [
    {
        level: 1, stars: '★', name: 'Awakened', title: '「Awakened」',
        color: '#87CEEB',
        statBoost: 0.15, // +15% all base stats
        requirements: { petLevel: 200, money: 50000, items: [] },
        reward: { desc: '+15% all base stats' }
    },
    {
        level: 2, stars: '★★', name: 'Transcendent', title: '「Transcendent」',
        color: '#9B59B6',
        statBoost: 0.30, // +30% all base stats
        requirements: { petLevel: 200, money: 200000, items: [{ id: 'refine_stone', qty: 10 }] },
        reward: { desc: '+30% all base stats + Ability Tier 4 slot', abilitySlot4: true }
    },
    {
        level: 3, stars: '★★★', name: 'Ascended', title: '「Ascended」',
        color: '#FFD700',
        statBoost: 0.50, // +50% all base stats
        requirements: { petLevel: 200, money: 500000, items: [{ id: 'protection_stone', qty: 15 }, { id: 'refine_stone', qty: 20 }] },
        reward: { desc: '+50% all base stats + 8% All Reward permanent', permanentBonus: { type: 'all_reward', value: 8 } }
    },
    {
        level: 4, stars: '★★★★', name: 'Divine', title: '「Divine」',
        color: '#FF6B00',
        statBoost: 0.75, // +75% all base stats
        requirements: { petLevel: 200, money: 1500000, items: [{ id: 'protection_stone', qty: 25 }, { id: 'mythic_fragment', qty: 3 }] },
        reward: { desc: '+75% all base stats + Exclusive title + 12% All Reward', permanentBonus: { type: 'all_reward', value: 12 } }
    },
    {
        level: 5, stars: '★★★★★', name: 'Immortal Champion', title: '「Immortal Champion」',
        color: '#FF1493',
        statBoost: 1.0, // +100% all base stats (DOUBLE!)
        requirements: { petLevel: 200, money: 5000000, items: [{ id: 'awakening_crystal', qty: 1 }, { id: 'mythic_fragment', qty: 5 }] },
        reward: { desc: '+100% all base stats + 15% All Reward + Exclusive badge + RAINBOW aura', permanentBonus: { type: 'all_reward', value: 15 } }
    },
];

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS pet_awakening (
    petId INTEGER PRIMARY KEY,
    guildId TEXT,
    userId TEXT,
    awakeningLevel INTEGER DEFAULT 0,
    totalAwakenings INTEGER DEFAULT 0,
    baseHpBoost INTEGER DEFAULT 0,
    baseAtkBoost INTEGER DEFAULT 0,
    baseDefBoost INTEGER DEFAULT 0,
    baseSpdBoost INTEGER DEFAULT 0,
    baseCritBoost INTEGER DEFAULT 0,
    lastAwakening INTEGER DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS awakening_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    userId TEXT,
    petId INTEGER,
    awakeningLevel INTEGER,
    awakenedAt INTEGER,
    statsBefore TEXT,
    statsAfter TEXT
)`);

// Add mythic_fragment and awakening_crystal as obtainable items
try { db.exec(`INSERT OR IGNORE INTO item_inventory (guildId, userId, itemId, quantity) SELECT '', '', 'mythic_fragment', 0 WHERE 0`); } catch(e) {}

// ==================== HELPERS ====================
function getAwakeningData(petId) {
    let row = db.prepare('SELECT * FROM pet_awakening WHERE petId = ?').get(petId);
    if (!row) {
        row = { petId, awakeningLevel: 0, totalAwakenings: 0, baseHpBoost: 0, baseAtkBoost: 0, baseDefBoost: 0, baseSpdBoost: 0, baseCritBoost: 0, lastAwakening: 0 };
    }
    return row;
}

function getAwakeningTier(level) {
    return AWAKENING_TIERS.find(t => t.level === level) || null;
}

function getNextAwakeningTier(currentLevel) {
    return AWAKENING_TIERS.find(t => t.level === currentLevel + 1) || null;
}

function getStarsDisplay(level) {
    if (level <= 0) return '';
    const tier = AWAKENING_TIERS.find(t => t.level === level);
    return tier ? ` ${tier.stars}` : ` ${'★'.repeat(level)}`;
}

function getAwakeningTitle(level) {
    const tier = AWAKENING_TIERS.find(t => t.level === level);
    return tier ? tier.title : null;
}

// ==================== CALCULATE BOOSTED STATS ====================
function calculateBoostedStats(originalStats, awakeningLevel) {
    if (awakeningLevel <= 0) return originalStats;
    const tier = AWAKENING_TIERS.find(t => t.level === awakeningLevel);
    if (!tier) return originalStats;

    const boost = tier.statBoost;
    return {
        hp: Math.floor(originalStats.hp * (1 + boost)),
        atk: Math.floor(originalStats.atk * (1 + boost)),
        def: Math.floor(originalStats.def * (1 + boost)),
        spd: Math.floor(originalStats.spd * (1 + boost)),
        crit: Math.min(50, Math.floor(originalStats.crit * (1 + boost * 0.5))), // Crit scales slower
    };
}

// ==================== CHECK REQUIREMENTS ====================
function checkRequirements(guildId, userId, pet, nextTier) {
    const results = { met: true, details: [] };

    // Level check
    if (pet.level < nextTier.requirements.petLevel) {
        results.met = false;
        results.details.push({ label: `Pet Level ${nextTier.requirements.petLevel}`, have: pet.level, need: nextTier.requirements.petLevel, ok: false });
    } else {
        results.details.push({ label: `Pet Level ${nextTier.requirements.petLevel}`, have: pet.level, need: nextTier.requirements.petLevel, ok: true });
    }

    // Money check
    const userData = getOrCreateUser(guildId, userId);
    if (userData.balance < nextTier.requirements.money) {
        results.met = false;
        results.details.push({ label: `Money`, have: userData.balance, need: nextTier.requirements.money, ok: false });
    } else {
        results.details.push({ label: `Money`, have: userData.balance, need: nextTier.requirements.money, ok: true });
    }

    // Items check
    for (const item of nextTier.requirements.items) {
        const have = getItemCount(guildId, userId, item.id);
        if (have < item.qty) {
            results.met = false;
            results.details.push({ label: item.id.replace(/_/g, ' '), have, need: item.qty, ok: false });
        } else {
            results.details.push({ label: item.id.replace(/_/g, ' '), have, need: item.qty, ok: true });
        }
    }

    return results;
}

// ==================== EXECUTE AWAKENING ====================
function executeAwakening(guildId, userId) {
    const pet = getPetData(guildId, userId);
    if (!pet) return { success: false, error: '❌ Pet tidak ditemukan!' };

    const awakData = getAwakeningData(pet.id);
    const nextTier = getNextAwakeningTier(awakData.awakeningLevel);
    if (!nextTier) return { success: false, error: '❌ Pet sudah mencapai Awakening maksimal (★★★★★)!' };

    // Verify requirements
    const reqs = checkRequirements(guildId, userId, pet, nextTier);
    if (!reqs.met) return { success: false, error: '❌ Requirements belum terpenuhi!' };

    // Deduct resources
    db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(nextTier.requirements.money, guildId, userId);
    for (const item of nextTier.requirements.items) {
        removeItem(guildId, userId, item.id, item.qty);
    }

    // Save stats before
    const statsBefore = { hp: pet.hp, atk: pet.atk, def: pet.def, spd: pet.spd, crit: pet.crit, level: pet.level };

    // Calculate new boosted base stats
    const petDef = PET_DATA.find(p => p.id === pet.petId);
    // We store the boost based on the CURRENT stats at Lv.200
    const boostedStats = calculateBoostedStats(
        { hp: pet.hp, atk: pet.atk, def: pet.def, spd: pet.spd, crit: pet.crit },
        nextTier.level
    );

    // Reset pet to level 1 BUT with boosted base stats
    db.prepare(`UPDATE pets SET level = 1, exp = 0, hp = ?, atk = ?, def = ?, spd = ?, crit = ? WHERE id = ?`).run(
        boostedStats.hp, boostedStats.atk, boostedStats.def, boostedStats.spd, boostedStats.crit, pet.id
    );

    // Update awakening record
    if (awakData.awakeningLevel === 0) {
        db.prepare(`INSERT OR REPLACE INTO pet_awakening (petId, guildId, userId, awakeningLevel, totalAwakenings, baseHpBoost, baseAtkBoost, baseDefBoost, baseSpdBoost, baseCritBoost, lastAwakening) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            pet.id, guildId, userId, nextTier.level, 1,
            boostedStats.hp - pet.hp, boostedStats.atk - pet.atk, boostedStats.def - pet.def,
            boostedStats.spd - pet.spd, boostedStats.crit - pet.crit, Date.now()
        );
    } else {
        db.prepare(`UPDATE pet_awakening SET awakeningLevel = ?, totalAwakenings = totalAwakenings + 1, baseHpBoost = ?, baseAtkBoost = ?, baseDefBoost = ?, baseSpdBoost = ?, baseCritBoost = ?, lastAwakening = ? WHERE petId = ?`).run(
            nextTier.level,
            boostedStats.hp - statsBefore.hp, boostedStats.atk - statsBefore.atk,
            boostedStats.def - statsBefore.def, boostedStats.spd - statsBefore.spd,
            boostedStats.crit - statsBefore.crit, Date.now(), pet.id
        );
    }

    // Log history
    db.prepare('INSERT INTO awakening_history (guildId, userId, petId, awakeningLevel, awakenedAt, statsBefore, statsAfter) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        guildId, userId, pet.id, nextTier.level, Date.now(),
        JSON.stringify(statsBefore), JSON.stringify(boostedStats)
    );

    // Grant permanent bonus if applicable
    if (nextTier.reward.permanentBonus) {
        const bonusKey = `awakening_bonus_${nextTier.reward.permanentBonus.type}`;
        const currentBonus = getUserStat(guildId, userId, bonusKey) || 0;
        incrementUserStat(guildId, userId, bonusKey, nextTier.reward.permanentBonus.value - currentBonus);
    }

    // Stats
    incrementUserStat(guildId, userId, 'total_awakenings');

    const statsAfter = boostedStats;

    return {
        success: true,
        pet,
        petDef,
        nextTier,
        statsBefore,
        statsAfter,
        awakData: { ...awakData, awakeningLevel: nextTier.level }
    };
}

// ==================== BUILD: Awakening Panel ====================
function buildAwakeningPanel(guildId, userId, username) {
    const pet = getPetData(guildId, userId);
    if (!pet) {
        const embed = new EmbedBuilder().setTitle('⚡ AWAKENING').setColor('#F39C12')
            .setDescription('❌ Kamu belum punya pet aktif!');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return { embeds: [embed], components: [row] };
    }

    const petDef = PET_DATA.find(p => p.id === pet.petId);
    const awakData = getAwakeningData(pet.id);
    const currentTier = awakData.awakeningLevel > 0 ? getAwakeningTier(awakData.awakeningLevel) : null;
    const nextTier = getNextAwakeningTier(awakData.awakeningLevel);
    const stars = getStarsDisplay(awakData.awakeningLevel);

    let desc = `${petDef ? petDef.emoji : '🐾'} **${pet.name}${stars}** (Lv.${pet.level})\n`;

    if (currentTier) {
        desc += `> ⚡ Awakening: **${currentTier.stars} ${currentTier.name}**\n`;
        desc += `> 📈 Stat Boost: **+${Math.floor(currentTier.statBoost * 100)}%** all base stats\n`;
        if (currentTier.reward.permanentBonus) {
            desc += `> 🎁 Permanent: +${currentTier.reward.permanentBonus.value}% ${currentTier.reward.permanentBonus.type.replace(/_/g, ' ')}\n`;
        }
    } else {
        desc += `> ⚡ Awakening: **Belum**\n`;
    }

    desc += `\n\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n\n`;

    // Current stats
    desc += `**📊 Stats Saat Ini:**\n`;
    desc += `> ❤️ HP: **${pet.hp}** | ⚔️ ATK: **${pet.atk}** | 🛡️ DEF: **${pet.def}**\n`;
    desc += `> 💨 SPD: **${pet.spd}** | 🎯 CRIT: **${pet.crit}%**\n\n`;

    // Next awakening info
    if (nextTier) {
        const reqs = checkRequirements(guildId, userId, pet, nextTier);
        const predictedStats = calculateBoostedStats(
            { hp: pet.hp, atk: pet.atk, def: pet.def, spd: pet.spd, crit: pet.crit },
            nextTier.level
        );

        desc += `**⚡ Next: ${nextTier.stars} ${nextTier.name}**\n`;
        desc += `> 📈 Boost: **+${Math.floor(nextTier.statBoost * 100)}%** all base stats\n`;
        desc += `> 🎁 ${nextTier.reward.desc}\n\n`;

        desc += `**📋 Requirements:**\n`;
        reqs.details.forEach(d => {
            const icon = d.ok ? '✅' : '❌';
            if (d.label === 'Money') {
                desc += `> ${icon} 🪙 **${d.have.toLocaleString('id-ID')}** / ${d.need.toLocaleString('id-ID')}\n`;
            } else if (d.label.startsWith('Pet Level')) {
                desc += `> ${icon} 📈 Pet Lv.**${d.have}** / ${d.need}\n`;
            } else {
                desc += `> ${icon} 📦 ${d.label}: **${d.have}** / ${d.need}\n`;
            }
        });

        desc += `\n**🔮 Stats Setelah Awakening:**\n`;
        desc += `> ❤️ HP: ${pet.hp} → **${predictedStats.hp}** (+${predictedStats.hp - pet.hp})\n`;
        desc += `> ⚔️ ATK: ${pet.atk} → **${predictedStats.atk}** (+${predictedStats.atk - pet.atk})\n`;
        desc += `> 🛡️ DEF: ${pet.def} → **${predictedStats.def}** (+${predictedStats.def - pet.def})\n`;
        desc += `> 💨 SPD: ${pet.spd} → **${predictedStats.spd}** (+${predictedStats.spd - pet.spd})\n`;
        desc += `> 🎯 CRIT: ${pet.crit}% → **${predictedStats.crit}%**\n\n`;

        desc += `> ⚠️ **Level akan RESET ke 1!** (Skills & abilities tetap)\n`;
        desc += `> ⚠️ EXP required -10% per ★ (leveling lebih cepat)`;
    } else {
        desc += `\n🏆 **MAX AWAKENING TERCAPAI!** ★★★★★\n`;
        desc += `> Pet ini sudah mencapai puncak kekuatan.\n`;
        desc += `> Title: **${currentTier.title}**`;
    }

    desc += `\n\n\`━━━━━━━━━━━━━━━━━━━━━━━━\``;

    const embed = new EmbedBuilder()
        .setTitle(`⚡ AWAKENING — ${pet.name}${stars}`)
        .setColor(currentTier ? currentTier.color : '#F39C12')
        .setDescription(desc)
        .setFooter({ text: 'Awakening = permanent power! Level reset tapi stats jauh lebih kuat.' });

    const canAwaken = nextTier && checkRequirements(guildId, userId, pet, nextTier).met;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`awaken_execute_${userId}`).setLabel(`⚡ AWAKEN${nextTier ? ' → ' + nextTier.stars : ''}`).setStyle(ButtonStyle.Danger).setDisabled(!canAwaken),
        new ButtonBuilder().setCustomId(`awaken_tiers_${userId}`).setLabel('📋 All Tiers').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`awaken_history_${userId}`).setLabel('📜 History').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

// ==================== HANDLER: Awakening Buttons ====================
async function handleAwakeningButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    const action = parts[1];

    // === MAIN PANEL ===
    if (action === 'main') {
        return interaction.update(buildAwakeningPanel(guildId, userId, interaction.user.username));
    }

    // === EXECUTE AWAKENING ===
    if (action === 'execute') {
        const result = executeAwakening(guildId, userId);
        if (!result.success) {
            return interaction.reply({ content: result.error, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle(`⚡✨ AWAKENING BERHASIL! ✨⚡`)
            .setColor(result.nextTier.color)
            .setDescription(
                `${result.petDef ? result.petDef.emoji : '🐾'} **${result.pet.name}** telah di-Awaken!\n\n` +
                `> ⚡ **${result.nextTier.stars} ${result.nextTier.name}**\n` +
                `> 🏷️ Title: **${result.nextTier.title}**\n\n` +
                `**📊 Stat Changes:**\n` +
                `> ❤️ HP: ${result.statsBefore.hp} → **${result.statsAfter.hp}** (+${result.statsAfter.hp - result.statsBefore.hp})\n` +
                `> ⚔️ ATK: ${result.statsBefore.atk} → **${result.statsAfter.atk}** (+${result.statsAfter.atk - result.statsBefore.atk})\n` +
                `> 🛡️ DEF: ${result.statsBefore.def} → **${result.statsAfter.def}** (+${result.statsAfter.def - result.statsBefore.def})\n` +
                `> 💨 SPD: ${result.statsBefore.spd} → **${result.statsAfter.spd}** (+${result.statsAfter.spd - result.statsBefore.spd})\n` +
                `> 🎯 CRIT: ${result.statsBefore.crit}% → **${result.statsAfter.crit}%**\n\n` +
                `> 📈 Level: ${result.statsBefore.level} → **1** (reset)\n` +
                `> 🎁 ${result.nextTier.reward.desc}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `> 💡 Skills & Abilities tetap terbuka!\n` +
                `> 📈 EXP required -${result.nextTier.level * 10}% (leveling lebih cepat)`
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`awaken_main_${userId}`).setLabel('⚡ Awakening Panel').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Pet Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === ALL TIERS INFO ===
    if (action === 'tiers') {
        let desc = `**⚡ Awakening Tiers:**\n\n`;
        const pet = getPetData(guildId, userId);
        const awakData = pet ? getAwakeningData(pet.id) : { awakeningLevel: 0 };

        AWAKENING_TIERS.forEach(tier => {
            const isCurrent = tier.level === awakData.awakeningLevel;
            const isNext = tier.level === awakData.awakeningLevel + 1;
            const isPast = tier.level < awakData.awakeningLevel;
            const marker = isCurrent ? ' ◀ NOW' : isNext ? ' ◀ NEXT' : isPast ? ' ✅' : '';

            desc += `**${tier.stars} ${tier.name}**${marker}\n`;
            desc += `> 📈 +${Math.floor(tier.statBoost * 100)}% all stats\n`;
            desc += `> 🪙 ${tier.requirements.money.toLocaleString('id-ID')} money\n`;
            if (tier.requirements.items.length > 0) {
                desc += `> 📦 ${tier.requirements.items.map(i => `${i.id.replace(/_/g, ' ')} x${i.qty}`).join(', ')}\n`;
            }
            desc += `> 🎁 ${tier.reward.desc}\n\n`;
        });

        desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n`;
        desc += `> **Materials Langka:**\n`;
        desc += `> 🌟 Mythic Fragment — World Boss Top 3 / Expedition Menara Langit (5%)\n`;
        desc += `> 💫 Awakening Crystal — World Boss #1 / Special Event`;

        const embed = new EmbedBuilder()
            .setTitle('⚡ Awakening Tiers — Overview')
            .setColor('#FFD700')
            .setDescription(desc);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`awaken_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === HISTORY ===
    if (action === 'history') {
        const history = db.prepare('SELECT * FROM awakening_history WHERE guildId = ? AND userId = ? ORDER BY awakenedAt DESC LIMIT 10').all(guildId, userId);
        const totalAwakenings = getUserStat(guildId, userId, 'total_awakenings') || 0;

        let desc = `> 📊 Total Awakenings: **${totalAwakenings}**\n\n`;
        if (history.length === 0) {
            desc += '*Belum ada riwayat awakening.*';
        } else {
            history.forEach((h, i) => {
                const tier = getAwakeningTier(h.awakeningLevel);
                const time = `<t:${Math.floor(h.awakenedAt / 1000)}:R>`;
                desc += `**${i + 1}.** ${tier ? tier.stars : '★'} **${tier ? tier.name : '?'}** — ${time}\n`;
                try {
                    const before = JSON.parse(h.statsBefore);
                    const after = JSON.parse(h.statsAfter);
                    desc += `> ATK: ${before.atk}→${after.atk} | DEF: ${before.def}→${after.def} | HP: ${before.hp}→${after.hp}\n`;
                } catch(e) {}
                desc += `\n`;
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('📜 Awakening History')
            .setColor('#9B59B6')
            .setDescription(desc);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`awaken_main_${userId}`).setLabel('⚡ Awakening').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Pet Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

// ==================== DETECTORS ====================
function isAwakeningButton(customId) {
    return customId.startsWith('awaken_');
}

// ==================== EXPORTS ====================
module.exports = {
    AWAKENING_TIERS,
    buildAwakeningPanel,
    handleAwakeningButton,
    isAwakeningButton,
    getAwakeningData,
    getStarsDisplay,
    getAwakeningTitle,
    calculateBoostedStats,
    executeAwakening
};
