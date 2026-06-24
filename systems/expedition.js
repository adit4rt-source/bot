// systems/expedition.js — Expedition System (2-8 hour AFK missions for pets)
// Player sends their active pet on timed expeditions to various zones.
// Returns with money, items, rare drops, and pet EXP.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { db, getOrCreateUser, getUserStat, incrementUserStat, addItem, addIncome } = require('../database');
const { getRandomInt } = require('../utils');
const { getPetData, addPetExp, ELEMENT_EMOJI } = require('./pets');
const { PET_DATA } = require('../data/pets');
const { checkAchievements } = require('./achievements');
const { updateQuestProgress } = require('./quests');

// ==================== EXPEDITION ZONES ====================
const EXPEDITION_ZONES = [
    {
        id: 'forest_trail',
        name: '🌲 Jalan Hutan',
        emoji: '🌲',
        description: 'Jalur hutan yang tenang. Cocok untuk pemula.',
        favoredElement: 'nature',
        minPetLevel: 1,
        duration: 2 * 60, // 2 jam (menit)
        rewards: {
            moneyRange: [8000, 20000],
            expRange: [100, 250],
            drops: [
                { id: 'mystery_box', name: 'Mystery Box', emoji: '📦', chance: 45, min: 1, max: 2 },
                { id: 'rod_part', name: 'Rod Parts', emoji: '🔧', chance: 25, min: 1, max: 2 },
                { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', chance: 25, min: 1, max: 2 },
            ]
        }
    },
    {
        id: 'mountain_cave',
        name: '🏔️ Gua Gunung',
        emoji: '🏔️',
        description: 'Gua gelap penuh mineral berharga.',
        favoredElement: 'electric',
        minPetLevel: 10,
        duration: 3 * 60, // 3 jam
        rewards: {
            moneyRange: [20000, 50000],
            expRange: [200, 400],
            drops: [
                { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', chance: 50, min: 1, max: 3 },
                { id: 'mystery_box', name: 'Mystery Box', emoji: '📦', chance: 40, min: 1, max: 2 },
                { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', chance: 20, min: 1, max: 1 },
                { id: 'rod_part', name: 'Rod Parts', emoji: '🔧', chance: 30, min: 1, max: 2 },
            ]
        }
    },
    {
        id: 'ancient_ruins',
        name: '🏛️ Reruntuhan Kuno',
        emoji: '🏛️',
        description: 'Bekas peradaban lama. Banyak artifact tersembunyi.',
        favoredElement: 'light',
        minPetLevel: 25,
        duration: 4 * 60, // 4 jam
        rewards: {
            moneyRange: [40000, 100000],
            expRange: [300, 600],
            drops: [
                { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', chance: 55, min: 2, max: 3 },
                { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', chance: 30, min: 1, max: 2 },
                { id: 'lucky_charm', name: 'Lucky Charm', emoji: '🍀', chance: 22, min: 1, max: 1 },
                { id: 'xp_booster_2x', name: 'XP Booster 2x', emoji: '⚡', chance: 25, min: 1, max: 2 },
                { id: 'mystery_box', name: 'Mystery Box', emoji: '📦', chance: 35, min: 1, max: 2 },
                { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', chance: 8, min: 1, max: 1 },
            ]
        }
    },
    {
        id: 'deep_ocean',
        name: '🌊 Lautan Dalam',
        emoji: '🌊',
        description: 'Kedalaman laut yang misterius dan berbahaya.',
        favoredElement: 'water',
        minPetLevel: 40,
        duration: 5 * 60, // 5 jam
        rewards: {
            moneyRange: [75000, 180000],
            expRange: [400, 800],
            drops: [
                { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', chance: 60, min: 2, max: 4 },
                { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', chance: 35, min: 1, max: 2 },
                { id: 'lucky_charm', name: 'Lucky Charm', emoji: '🍀', chance: 25, min: 1, max: 2 },
                { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡', chance: 18, min: 1, max: 1 },
                { id: 'streak_shield', name: 'Streak Shield', emoji: '🛡️', chance: 20, min: 1, max: 1 },
                { id: 'money_magnet', name: 'Money Magnet', emoji: '🧲', chance: 15, min: 1, max: 2 },
                { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', chance: 12, min: 1, max: 1 },
            ]
        }
    },
    {
        id: 'shadow_realm',
        name: '🌑 Shadow Realm',
        emoji: '🌑',
        description: 'Dimensi gelap. Hanya pet kuat yang bisa bertahan.',
        favoredElement: 'dark',
        minPetLevel: 60,
        duration: 6 * 60, // 6 jam
        rewards: {
            moneyRange: [120000, 300000],
            expRange: [600, 1200],
            drops: [
                { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', chance: 70, min: 3, max: 5 },
                { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', chance: 45, min: 1, max: 3 },
                { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡', chance: 28, min: 1, max: 2 },
                { id: 'lucky_charm', name: 'Lucky Charm', emoji: '🍀', chance: 32, min: 1, max: 2 },
                { id: 'money_magnet', name: 'Money Magnet', emoji: '🧲', chance: 22, min: 1, max: 2 },
                { id: 'streak_shield', name: 'Streak Shield', emoji: '🛡️', chance: 25, min: 1, max: 2 },
                { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', chance: 20, min: 1, max: 2 },
            ]
        }
    },
    {
        id: 'celestial_tower',
        name: '🗼 Menara Langit',
        emoji: '🗼',
        description: 'Puncak dunia. Reward luar biasa bagi yang berani.',
        favoredElement: 'fire',
        minPetLevel: 100,
        duration: 8 * 60, // 8 jam
        rewards: {
            moneyRange: [200000, 500000],
            expRange: [1000, 2000],
            drops: [
                { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', chance: 80, min: 3, max: 6 },
                { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', chance: 55, min: 2, max: 3 },
                { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡', chance: 38, min: 2, max: 3 },
                { id: 'lucky_charm', name: 'Lucky Charm', emoji: '🍀', chance: 38, min: 2, max: 3 },
                { id: 'money_magnet', name: 'Money Magnet', emoji: '🧲', chance: 30, min: 1, max: 3 },
                { id: 'streak_shield', name: 'Streak Shield', emoji: '🛡️', chance: 28, min: 1, max: 2 },
                { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', chance: 30, min: 1, max: 3 },
                { id: 'awakening_crystal', name: 'Awakening Crystal', emoji: '💫', chance: 8, min: 1, max: 1 },
            ]
        }
    },
    {
        id: 'frozen_abyss',
        name: '❄️ Frozen Abyss',
        emoji: '❄️',
        description: 'Kedalaman es abadi. Temperatur -100°C.',
        favoredElement: 'water',
        minPetLevel: 50,
        duration: 4 * 60,
        rewards: {
            moneyRange: [60000, 150000],
            expRange: [350, 700],
            drops: [
                { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', chance: 65, min: 2, max: 4 },
                { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', chance: 40, min: 1, max: 3 },
                { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡', chance: 25, min: 1, max: 2 },
                { id: 'money_magnet', name: 'Money Magnet', emoji: '🧲', chance: 20, min: 1, max: 2 },
                { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', chance: 15, min: 1, max: 2 },
            ]
        }
    },
    {
        id: 'volcanic_core',
        name: '🌋 Volcanic Core',
        emoji: '🌋',
        description: 'Inti gunung berapi aktif. Panas luar biasa.',
        favoredElement: 'fire',
        minPetLevel: 70,
        duration: 6 * 60,
        rewards: {
            moneyRange: [100000, 250000],
            expRange: [500, 1000],
            drops: [
                { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', chance: 75, min: 3, max: 5 },
                { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', chance: 50, min: 2, max: 3 },
                { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡', chance: 32, min: 1, max: 2 },
                { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', chance: 25, min: 1, max: 2 },
                { id: 'awakening_crystal', name: 'Awakening Crystal', emoji: '💫', chance: 5, min: 1, max: 1 },
            ]
        }
    },
    {
        id: 'spirit_world',
        name: '👻 Spirit World',
        emoji: '👻',
        description: 'Dunia roh — antara hidup dan mati.',
        favoredElement: 'dark',
        minPetLevel: 80,
        duration: 7 * 60,
        rewards: {
            moneyRange: [150000, 350000],
            expRange: [700, 1400],
            drops: [
                { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', chance: 80, min: 3, max: 6 },
                { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', chance: 55, min: 2, max: 3 },
                { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡', chance: 35, min: 2, max: 3 },
                { id: 'lucky_charm', name: 'Lucky Charm', emoji: '🍀', chance: 35, min: 1, max: 2 },
                { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', chance: 28, min: 1, max: 3 },
                { id: 'awakening_crystal', name: 'Awakening Crystal', emoji: '💫', chance: 10, min: 1, max: 1 },
            ]
        }
    },
    {
        id: 'dimension_rift',
        name: '🌀 Dimension Rift',
        emoji: '🌀',
        description: 'Celah dimensi — reward luar biasa, bahaya tak terduga.',
        favoredElement: 'light',
        minPetLevel: 90,
        duration: 10 * 60,
        rewards: {
            moneyRange: [250000, 600000],
            expRange: [1000, 2500],
            drops: [
                { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', chance: 85, min: 4, max: 8 },
                { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', chance: 60, min: 2, max: 4 },
                { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡', chance: 40, min: 2, max: 3 },
                { id: 'lucky_charm', name: 'Lucky Charm', emoji: '🍀', chance: 40, min: 2, max: 3 },
                { id: 'money_magnet', name: 'Money Magnet', emoji: '🧲', chance: 35, min: 2, max: 3 },
                { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', chance: 35, min: 2, max: 3 },
                { id: 'awakening_crystal', name: 'Awakening Crystal', emoji: '💫', chance: 15, min: 1, max: 2 },
            ]
        }
    },
    {
        id: 'void_realm',
        name: '🕳️ Void Realm',
        emoji: '🕳️',
        description: '⚠️ SECRET ZONE — Hanya untuk explorer sejati (100+ expeditions).',
        favoredElement: null,
        minPetLevel: 50,
        duration: 12 * 60,
        isSecret: true,
        unlockCondition: 100, // total_expeditions required
        rewards: {
            moneyRange: [400000, 1000000],
            expRange: [2000, 4000],
            drops: [
                { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', chance: 90, min: 5, max: 10 },
                { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', chance: 50, min: 2, max: 5 },
                { id: 'awakening_crystal', name: 'Awakening Crystal', emoji: '💫', chance: 25, min: 1, max: 2 },
                { id: 'lucky_charm', name: 'Lucky Charm', emoji: '🍀', chance: 50, min: 2, max: 3 },
                { id: 'money_magnet', name: 'Money Magnet', emoji: '🧲', chance: 45, min: 2, max: 3 },
                { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡', chance: 45, min: 2, max: 3 },
                { id: 'streak_shield', name: 'Streak Shield', emoji: '🛡️', chance: 35, min: 1, max: 2 },
            ]
        }
    },
];

// ==================== DATABASE TABLE ====================
db.exec(`CREATE TABLE IF NOT EXISTS expeditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    userId TEXT,
    petId INTEGER,
    zoneId TEXT,
    startedAt INTEGER,
    endsAt INTEGER,
    status TEXT DEFAULT 'active',
    rewards TEXT DEFAULT '{}'
)`);

db.exec(`CREATE TABLE IF NOT EXISTS expedition_coop (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    leaderId TEXT,
    memberId TEXT,
    expeditionId INTEGER,
    bonusApplied INTEGER DEFAULT 0
)`);

// ==================== HELPER: Get active expedition ====================
function getActiveExpedition(guildId, userId) {
    return db.prepare('SELECT * FROM expeditions WHERE guildId = ? AND userId = ? AND status = ?').get(guildId, userId, 'active');
}

// ==================== HELPER: Calculate bonus from pet stats ====================
function calculatePetBonus(pet) {
    // Higher level pets get bonus rewards
    const levelBonus = Math.floor(pet.level / 10) * 5; // +5% per 10 levels
    const luckBonus = Math.min(30, Math.floor(pet.level / 5)); // +1% luck per 5 levels (max 30%)
    return { levelBonus, luckBonus };
}

// ==================== HELPER: Zone element synergy ====================
// Expedition identity: bawa pet yang SE-ELEMEN dengan tema zona untuk bonus pasif
// (kebalikan dungeon yang butuh COUNTER elemen musuh).
const SYNERGY_BONUS = { money: 0.25, drop: 15, exp: 0.20 };
function hasZoneSynergy(pet, zone) {
    return !!(pet && zone && zone.favoredElement && pet.element === zone.favoredElement);
}

// ==================== BUILD: Expedition Panel ====================
function buildExpeditionPanel(guildId, userId, username) {
    const pet = getPetData(guildId, userId);
    const activeExp = getActiveExpedition(guildId, userId);
    const userData = getOrCreateUser(guildId, userId);
    const totalExpeditions = getUserStat(guildId, userId, 'total_expeditions') || 0;

    if (!pet) {
        const embed = new EmbedBuilder()
            .setTitle('🌊 EXPEDITION')
            .setColor('#3498DB')
            .setDescription('❌ Kamu belum punya pet aktif!\n\nAdopsi pet dulu di `/pet` → Shop untuk mulai ekspedisi.');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`exp_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return { embeds: [embed], components: [row] };
    }

    const petDef = PET_DATA.find(p => p.id === pet.petId);

    // Active expedition
    if (activeExp) {
        const zone = EXPEDITION_ZONES.find(z => z.id === activeExp.zoneId);
        const now = Date.now();
        const remaining = Math.max(0, activeExp.endsAt - now);
        const totalDuration = activeExp.endsAt - activeExp.startedAt;
        const elapsed = totalDuration - remaining;
        const progress = Math.min(100, Math.floor((elapsed / totalDuration) * 100));
        const progressBar = '▰'.repeat(Math.floor(progress / 10)) + '▱'.repeat(10 - Math.floor(progress / 10));
        const isComplete = remaining <= 0;

        const embed = new EmbedBuilder()
            .setTitle(`🌊 EXPEDITION — ${isComplete ? '✅ SELESAI!' : 'Sedang Berlangsung'}`)
            .setColor(isComplete ? '#2ECC71' : '#F39C12')
            .setDescription(
                `${petDef ? petDef.emoji : '🐾'} **${pet.name}** (Lv.${pet.level})\n` +
                `📍 Zona: **${zone ? zone.name : 'Unknown'}**\n\n` +
                `> ⏱️ Progress: \`${progressBar}\` **${progress}%**\n` +
                (isComplete
                    ? `> ✅ **Ekspedisi selesai!** Klik tombol untuk klaim reward.\n`
                    : `> ⏰ Selesai: <t:${Math.floor(activeExp.endsAt / 1000)}:R>\n`) +
                `\n> 📊 Total Expeditions: **${totalExpeditions}**`
            )
            .setFooter({ text: isComplete ? 'Klik Claim untuk ambil reward!' : 'Pet tidak bisa digunakan selama ekspedisi' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`exp_claim_${userId}`).setLabel('🎁 Claim Reward').setStyle(ButtonStyle.Success).setDisabled(!isComplete),
            new ButtonBuilder().setCustomId(`exp_cancel_${userId}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Danger).setDisabled(isComplete),
            new ButtonBuilder().setCustomId(`exp_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return { embeds: [embed], components: [row] };
    }

    // No active expedition - show zone selection
    const { levelBonus, luckBonus } = calculatePetBonus(pet);
    const petEl = pet.element;
    let desc = `${petDef ? petDef.emoji : '🐾'} **${pet.name}** (Lv.${pet.level}) ${petEl ? (ELEMENT_EMOJI[petEl] || '') : ''}\n`;
    desc += `> 💤 *Misi AFK panjang — fokus **EXP & perbekalan**, tanpa risiko.*\n`;
    desc += `> 💪 Bonus Money: +**${levelBonus}%** | 🍀 Bonus Drop: +**${luckBonus}%**\n`;
    desc += `> 🎯 Bawa pet **se-elemen** zona untuk **Synergy** (+25% money, +20% EXP, +15% drop)\n`;
    desc += `> 📊 Total Expeditions: **${totalExpeditions}**\n\n`;
    desc += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    desc += `**📍 Pilih Zona Ekspedisi:**\n\n`;

    EXPEDITION_ZONES.forEach(zone => {
        // Skip secret zones that aren't unlocked
        if (zone.isSecret) {
            const totalExps = getUserStat(guildId, userId, 'total_expeditions') || 0;
            if (totalExps < zone.unlockCondition) {
                desc += `🔒 ❓ **???** (Unlock setelah ${zone.unlockCondition} expeditions — kamu: ${totalExps})\n\n`;
                return; // skip adding to select menu
            }
        }
        const canEnter = pet.level >= zone.minPetLevel;
        const lock = canEnter ? '✅' : '🔒';
        const hours = Math.floor(zone.duration / 60);
        const synTag = hasZoneSynergy(pet, zone) ? ' 🎯**SYNERGY!**' : '';
        const zoneEl = zone.favoredElement ? (ELEMENT_EMOJI[zone.favoredElement] || '') : '';
        desc += `${lock} ${zone.emoji} **${zone.name}** (Lv.${zone.minPetLevel}+) ${zoneEl}${synTag}\n`;
        desc += `> ⏱️ ${hours}j | 🪙 ${zone.rewards.moneyRange[0].toLocaleString('id-ID')}-${zone.rewards.moneyRange[1].toLocaleString('id-ID')} | ✨ ${zone.rewards.expRange[0]}-${zone.rewards.expRange[1]} EXP\n`;
    });

    const embed = new EmbedBuilder()
        .setTitle('🌊 EXPEDITION')
        .setColor('#3498DB')
        .setDescription(desc)
        .setFooter({ text: '⚠️ Pet tidak bisa digunakan selama ekspedisi. Pilih zona di bawah!' });

    // Build select menu for zones
    const zoneMenu = new StringSelectMenuBuilder()
        .setCustomId(`exp_zone_select_${userId}`)
        .setPlaceholder('📍 Pilih zona ekspedisi...')
        .setMinValues(1).setMaxValues(1);

    EXPEDITION_ZONES.forEach(zone => {
        // Skip secret zones that aren't unlocked for select menu
        if (zone.isSecret) {
            const totalExps = getUserStat(guildId, userId, 'total_expeditions') || 0;
            if (totalExps < zone.unlockCondition) return;
        }
        const canEnter = pet.level >= zone.minPetLevel;
        const hours = Math.floor(zone.duration / 60);
        const synTag = hasZoneSynergy(pet, zone) ? '🎯 SYNERGY! ' : '';
        zoneMenu.addOptions(new StringSelectMenuOptionBuilder()
            .setLabel(`${zone.name} (${hours}jam, Lv.${zone.minPetLevel}+)`)
            .setValue(zone.id)
            .setDescription(canEnter ? `${synTag}🪙${zone.rewards.moneyRange[0]}-${zone.rewards.moneyRange[1]} | ${zone.rewards.drops.length} drops` : `🔒 Butuh Pet Lv.${zone.minPetLevel}`)
            .setEmoji(zone.emoji));
    });

    const row1 = new ActionRowBuilder().addComponents(zoneMenu);
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`exp_history_${userId}`).setLabel('📜 History').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`exp_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row1, row2] };
}

// ==================== HANDLER: Start Expedition ====================
function startExpedition(guildId, userId, zoneId) {
    const pet = getPetData(guildId, userId);
    if (!pet) return { success: false, message: '❌ Belum punya pet aktif!' };

    const zone = EXPEDITION_ZONES.find(z => z.id === zoneId);
    if (!zone) return { success: false, message: '❌ Zona tidak ditemukan!' };

    // Check secret zone unlock
    if (zone.isSecret) {
        const totalExps = getUserStat(guildId, userId, 'total_expeditions') || 0;
        if (totalExps < zone.unlockCondition) {
            return { success: false, message: `🔒 Zona ini membutuhkan ${zone.unlockCondition} total expeditions untuk unlock! (kamu: ${totalExps})` };
        }
    }

    if (pet.level < zone.minPetLevel) {
        return { success: false, message: `🔒 Pet level terlalu rendah! Butuh Lv.${zone.minPetLevel}+ (sekarang: Lv.${pet.level})` };
    }

    const activeExp = getActiveExpedition(guildId, userId);
    if (activeExp) return { success: false, message: '❌ Sudah ada ekspedisi aktif! Selesaikan dulu.' };

    // Check if pet is hunting
    if (pet.hunting_until && pet.hunting_until > Date.now()) {
        return { success: false, message: '❌ Pet sedang hunting! Tunggu sampai selesai.' };
    }

    const now = Date.now();
    const durationMs = zone.duration * 60 * 1000;
    const endsAt = now + durationMs;

    db.prepare('INSERT INTO expeditions (guildId, userId, petId, zoneId, startedAt, endsAt, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        guildId, userId, pet.id, zoneId, now, endsAt, 'active'
    );

    return {
        success: true,
        zone,
        endsAt,
        pet
    };
}

// ==================== HANDLER: Claim Expedition Rewards ====================
function claimExpeditionRewards(guildId, userId) {
    const activeExp = getActiveExpedition(guildId, userId);
    if (!activeExp) return { success: false, message: '❌ Tidak ada ekspedisi aktif!' };
    if (activeExp.endsAt > Date.now()) return { success: false, message: '⏳ Ekspedisi belum selesai!' };

    // Use the pet that was sent on the expedition (by ID), not the currently active pet
    const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(activeExp.petId);
    if (!pet) return { success: false, message: '❌ Pet tidak ditemukan!' };

    const zone = EXPEDITION_ZONES.find(z => z.id === activeExp.zoneId);
    if (!zone) return { success: false, message: '❌ Zona tidak valid!' };

    const { levelBonus, luckBonus } = calculatePetBonus(pet);
    const synergy = hasZoneSynergy(pet, zone);

    // Calculate money reward
    let money = getRandomInt(zone.rewards.moneyRange[0], zone.rewards.moneyRange[1]);
    money = Math.floor(money * (1 + levelBonus / 100)); // Apply pet level bonus
    if (synergy) money = Math.floor(money * (1 + SYNERGY_BONUS.money)); // Element synergy bonus

    // Calculate EXP reward
    let exp = getRandomInt(zone.rewards.expRange[0], zone.rewards.expRange[1]);
    if (synergy) exp = Math.floor(exp * (1 + SYNERGY_BONUS.exp));

    // Calculate item drops
    const drops = [];
    const synergyDrop = synergy ? SYNERGY_BONUS.drop : 0;
    for (const drop of zone.rewards.drops) {
        const adjustedChance = Math.min(95, drop.chance + luckBonus + synergyDrop);
        if (Math.random() * 100 < adjustedChance) {
            const qty = getRandomInt(drop.min || 1, drop.max || 1);
            drops.push({ ...drop, qty });
        }
    }

    // Rare bonus: 5% chance for double money
    let doubleMoney = false;
    if (Math.random() < 0.05) {
        money *= 2;
        doubleMoney = true;
    }

    // Rare Events (10% chance total)
    let rareEvent = null;
    const eventRoll = Math.random();
    if (eventRoll < 0.03) {
        // 3% — Hidden Treasure Cache
        const bonusMoney = Math.floor(money * 0.5);
        money += bonusMoney;
        rareEvent = { type: 'treasure', label: '💎 **HIDDEN TREASURE!** Pet menemukan gua harta karun!', bonusMoney };
    } else if (eventRoll < 0.06) {
        // 3% — Ancient Spirit Blessing (2x EXP)
        exp *= 2;
        rareEvent = { type: 'spirit', label: '👻 **SPIRIT BLESSING!** Roh kuno memberkati pet — EXP x2!' };
    } else if (eventRoll < 0.08) {
        // 2% — Mysterious Merchant (free rare item)
        const rareItems = [
            { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', qty: 2 },
            { id: 'awakening_crystal', name: 'Awakening Crystal', emoji: '💫', qty: 1 },
            { id: 'money_magnet', name: 'Money Magnet', emoji: '🧲', qty: 2 },
        ];
        const picked = rareItems[Math.floor(Math.random() * rareItems.length)];
        drops.push({ ...picked });
        rareEvent = { type: 'merchant', label: `🧙 **MYSTERIOUS MERCHANT!** Pedagang misterius memberi hadiah: ${picked.emoji} ${picked.name} x${picked.qty}!` };
    } else if (eventRoll < 0.10) {
        // 2% — Portal Discovery (instant money bonus)
        const portalBonus = getRandomInt(50000, 200000);
        money += portalBonus;
        rareEvent = { type: 'portal', label: `🌀 **PORTAL DISCOVERY!** Pet menemukan portal dimensi lain — bonus 🪙 ${portalBonus.toLocaleString('id-ID')}!` };
    }

    // Co-op bonus check
    let coopBonus = false;
    try {
        const coopRow = db.prepare('SELECT * FROM expedition_coop WHERE expeditionId = ? AND bonusApplied = 0').get(activeExp.id);
        if (coopRow) {
            money = Math.floor(money * 1.3);
            coopBonus = true;
            db.prepare('UPDATE expedition_coop SET bonusApplied = 1 WHERE id = ?').run(coopRow.id);
            // Give partner bonus too
            const partnerBonus = Math.floor(money * 0.15);
            db.prepare('UPDATE users SET balance = balance + ? WHERE userId = ?').run(partnerBonus, coopRow.memberId);
        }
    } catch (_) {}

    // Apply rewards
    db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(money, guildId, userId);
    addIncome(guildId, userId, 'expedition', money);

    for (const drop of drops) {
        addItem(guildId, userId, drop.id, drop.qty || 1);
    }

    // Add pet EXP
    const expResult = addPetExp(guildId, userId, exp);

    // Update stats
    incrementUserStat(guildId, userId, 'total_expeditions');
    incrementUserStat(guildId, userId, 'expedition_money_earned', money);
    updateQuestProgress(guildId, userId, 'expedition', 1);

    // Mark expedition as complete
    const rewardsData = JSON.stringify({ money, exp, drops: drops.map(d => d.id), doubleMoney, synergy, rareEvent: rareEvent ? rareEvent.type : null, coopBonus });
    db.prepare('UPDATE expeditions SET status = ?, rewards = ? WHERE id = ?').run('completed', rewardsData, activeExp.id);

    return {
        success: true,
        money,
        exp,
        drops,
        doubleMoney,
        synergy,
        rareEvent,
        coopBonus,
        expResult,
        zone,
        pet
    };
}

// ==================== HANDLER: Cancel Expedition ====================
function cancelExpedition(guildId, userId) {
    const activeExp = getActiveExpedition(guildId, userId);
    if (!activeExp) return { success: false, message: '❌ Tidak ada ekspedisi aktif!' };
    if (activeExp.endsAt <= Date.now()) return { success: false, message: '⚠️ Ekspedisi sudah selesai! Klaim reward-nya.' };

    db.prepare('UPDATE expeditions SET status = ? WHERE id = ?').run('cancelled', activeExp.id);
    return { success: true, message: '✅ Ekspedisi dibatalkan. Pet kembali tanpa reward.' };
}

// ==================== HANDLER: Expedition Button Clicks ====================
async function handleExpeditionButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel ekspedisi kamu!', ephemeral: true });
    }

    const action = parts[1];

    // === BACK (to pet panel) ===
    if (action === 'back') {
        // Redirect ke pet panel
        const { buildMainPanel } = require('./petPanel');
        const panel = buildMainPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    // === REFRESH (refresh expedition panel) ===
    if (action === 'refresh') {
        const panel = buildExpeditionPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    // === CLAIM REWARD ===
    if (action === 'claim') {
        const result = claimExpeditionRewards(guildId, userId);
        if (!result.success) {
            return interaction.reply({ content: result.message, ephemeral: true });
        }

        const petDef = PET_DATA.find(p => p.id === result.pet.petId);
        let desc = `${petDef ? petDef.emoji : '🐾'} **${result.pet.name}** kembali dari ${result.zone.name}!\n\n`;
        desc += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        desc += `**🎁 REWARD:**\n\n`;
        desc += `> 🪙 Money: **+${result.money.toLocaleString('id-ID')}**${result.doubleMoney ? ' (**2x LUCKY!** 🍀)' : ''}\n`;
        desc += `> ✨ Pet EXP: **+${result.exp}**\n`;
        if (result.synergy) {
            desc += `> ${ELEMENT_EMOJI[result.zone.favoredElement] || '✨'} **ELEMENT SYNERGY!** +25% money, +20% EXP, +15% drop 🎯\n`;
        }
        if (result.rareEvent) {
            desc += `\n${result.rareEvent.label}\n`;
        }
        if (result.coopBonus) {
            desc += `> 👥 **CO-OP BONUS!** +30% money (partner juga dapat 15%)\n`;
        }

        if (result.drops.length > 0) {
            desc += `\n**📦 Item Drops:**\n`;
            result.drops.forEach(d => {
                desc += `> ${d.emoji} **${d.name}** x${d.qty || 1}\n`;
            });
        } else {
            desc += `\n> 📦 Tidak ada item drop kali ini.\n`;
        }

        if (result.expResult && result.expResult.leveledUp) {
            desc += `\n✧ **PET LEVEL UP** ✧\n→ Lv.${result.expResult.newLevel}!`;
        }
        if (result.expResult && result.expResult.newSkill) {
            desc += `\n🌟 **SKILL UNLOCKED:** ${result.expResult.newSkill.skill.name}!`;
        }

        desc += `\n━━━━━━━━━━━━━━━━━━━━━━`;

        const embed = new EmbedBuilder()
            .setTitle('🎉 Expedition Complete!')
            .setColor('#2ECC71')
            .setDescription(desc)
            .setFooter({ text: 'Mulai ekspedisi baru kapan saja!' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`exp_refresh_${userId}`).setLabel('🌊 Ekspedisi Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`exp_history_${userId}`).setLabel('📜 History').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`exp_back_${userId}`).setLabel('🔙 Pet Panel').setStyle(ButtonStyle.Secondary)
        );

        // Check achievements
        checkAchievements(interaction.guild, userId, { type: 'expedition' });

        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === CANCEL ===
    if (action === 'cancel') {
        const result = cancelExpedition(guildId, userId);
        if (!result.success) {
            return interaction.reply({ content: result.message, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('❌ Expedition Cancelled')
            .setColor('#E74C3C')
            .setDescription('Ekspedisi dibatalkan. Pet kamu kembali tanpa reward.\n\n*Mulai ekspedisi baru kapan saja.*');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`exp_refresh_${userId}`).setLabel('🌊 Expedition').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`exp_back_${userId}`).setLabel('🔙 Pet Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === HISTORY ===
    if (action === 'history') {
        const history = db.prepare('SELECT * FROM expeditions WHERE guildId = ? AND userId = ? AND status = ? ORDER BY endsAt DESC LIMIT 10').all(guildId, userId, 'completed');
        let desc = '';

        if (history.length === 0) {
            desc = '*Belum ada riwayat ekspedisi.*\n\nMulai ekspedisi pertamamu!';
        } else {
            history.forEach((exp, i) => {
                const zone = EXPEDITION_ZONES.find(z => z.id === exp.zoneId);
                let rewards = {};
                try { rewards = JSON.parse(exp.rewards || '{}'); } catch(e) {}
                const time = `<t:${Math.floor(exp.endsAt / 1000)}:R>`;
                desc += `**${i + 1}.** ${zone ? zone.emoji : '📍'} ${zone ? zone.name : 'Unknown'} — ${time}\n`;
                desc += `> 🪙 ${(rewards.money || 0).toLocaleString('id-ID')} | ✨ ${rewards.exp || 0} EXP`;
                if (rewards.drops && rewards.drops.length > 0) desc += ` | 📦 ${rewards.drops.length} items`;
                if (rewards.doubleMoney) desc += ` | 🍀 2x!`;
                desc += `\n`;
            });
        }

        const totalMoney = getUserStat(guildId, userId, 'expedition_money_earned') || 0;
        const totalExps = getUserStat(guildId, userId, 'total_expeditions') || 0;
        desc += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
        desc += `> 📊 Total: **${totalExps}** ekspedisi | 🪙 **${totalMoney.toLocaleString('id-ID')}** earned`;

        const embed = new EmbedBuilder()
            .setTitle('📜 Expedition History')
            .setColor('#9B59B6')
            .setDescription(desc);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`exp_refresh_${userId}`).setLabel('🌊 Expedition').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`exp_back_${userId}`).setLabel('🔙 Pet Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

// ==================== HANDLER: Expedition Select Menu ====================
async function handleExpeditionSelectMenu(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const userId = customId.split('_').pop();

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    // === ZONE SELECT ===
    if (customId.startsWith('exp_zone_select_')) {
        const zoneId = interaction.values[0];
        const zone = EXPEDITION_ZONES.find(z => z.id === zoneId);
        const pet = getPetData(guildId, userId);

        if (!pet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
        if (!zone) return interaction.reply({ content: '❌ Zona tidak valid!', ephemeral: true });

        if (pet.level < zone.minPetLevel) {
            return interaction.reply({ content: `🔒 Pet level terlalu rendah! Butuh Lv.${zone.minPetLevel}+ (sekarang: Lv.${pet.level})`, ephemeral: true });
        }

        // Check if pet is hunting
        if (pet.hunting_until && pet.hunting_until > Date.now()) {
            return interaction.reply({ content: '❌ Pet sedang hunting! Tunggu sampai selesai.', ephemeral: true });
        }

        // Show confirmation
        const petDef = PET_DATA.find(p => p.id === pet.petId);
        const hours = Math.floor(zone.duration / 60);
        const { levelBonus, luckBonus } = calculatePetBonus(pet);
        const synergy = hasZoneSynergy(pet, zone);
        const zoneEl = zone.favoredElement ? (ELEMENT_EMOJI[zone.favoredElement] || '') : '';
        const petEl = pet.element ? (ELEMENT_EMOJI[pet.element] || '') : '';

        let dropList = zone.rewards.drops.map(d => `> ${d.emoji} ${d.name} (${Math.min(95, d.chance + luckBonus + (synergy ? SYNERGY_BONUS.drop : 0))}%)`).join('\n');

        const synergyLine = synergy
            ? `\n> 🎯 **ELEMENT SYNERGY AKTIF!** ${petEl}=${zoneEl} → +25% money, +20% EXP, +15% drop\n`
            : `\n> ${zoneEl} Tema zona: **${zone.favoredElement || '-'}** — bawa pet se-elemen untuk **Synergy** bonus (pet kamu: ${petEl || '-'})\n`;

        const embed = new EmbedBuilder()
            .setTitle(`📍 Konfirmasi Ekspedisi`)
            .setColor(synergy ? '#2ECC71' : '#F39C12')
            .setDescription(
                `${petDef ? petDef.emoji : '🐾'} **${pet.name}** (Lv.${pet.level}) → ${zone.emoji} **${zone.name}**\n` +
                synergyLine +
                `\n> ⏱️ Durasi: **${hours} jam**\n` +
                `> 🪙 Money: **${zone.rewards.moneyRange[0].toLocaleString('id-ID')}** - **${zone.rewards.moneyRange[1].toLocaleString('id-ID')}** (+${levelBonus}% bonus)\n` +
                `> ✨ Pet EXP: **${zone.rewards.expRange[0]}** - **${zone.rewards.expRange[1]}**\n\n` +
                `**📦 Possible Drops** (🍀+${luckBonus}% luck${synergy ? ` +${SYNERGY_BONUS.drop}% synergy` : ''}):\n${dropList}\n\n` +
                `⚠️ **Pet tidak bisa digunakan** selama ekspedisi!\n` +
                `(Hunt, Battle, Dungeon, Boss akan disabled)`
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`exp_confirm_${zoneId}_${userId}`).setLabel('✅ Mulai Ekspedisi!').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`exp_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

// ==================== HANDLER: Confirm Start (from confirm button) ====================
async function handleExpeditionConfirm(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    // Format: exp_confirm_zoneId_userId (zoneId may contain underscores!)
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];
    const zoneId = parts.slice(2, -1).join('_'); // everything between 'confirm' and userId

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    const result = startExpedition(guildId, userId, zoneId);
    if (!result.success) {
        return interaction.reply({ content: result.message, ephemeral: true });
    }

    const petDef = PET_DATA.find(p => p.id === result.pet.petId);
    const hours = Math.floor(result.zone.duration / 60);

    const embed = new EmbedBuilder()
        .setTitle('🌊 Expedition Started!')
        .setColor('#3498DB')
        .setDescription(
            `${petDef ? petDef.emoji : '🐾'} **${result.pet.name}** berangkat ke ${result.zone.emoji} **${result.zone.name}**!\n\n` +
            `> ⏱️ Durasi: **${hours} jam**\n` +
            `> ⏰ Selesai: <t:${Math.floor(result.endsAt / 1000)}:R> (<t:${Math.floor(result.endsAt / 1000)}:T>)\n\n` +
            `💤 Santai dulu! Kembali nanti untuk klaim reward.\n` +
            `⚠️ Pet tidak bisa digunakan selama ekspedisi.`
        )
        .setFooter({ text: 'Cek progress kapan saja lewat tombol Expedition' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`exp_back_${userId}`).setLabel('🌊 Cek Progress').setStyle(ButtonStyle.Primary)
    );
    return interaction.update({ embeds: [embed], components: [row] });
}

// ==================== DETECTOR ====================
function isExpeditionButton(customId) {
    // Must exclude exp_zone_select_ (select menu) AND exp_confirm_ (confirm button)
    // so those are routed to their dedicated handlers instead of being swallowed here.
    return customId.startsWith('exp_')
        && !customId.startsWith('exp_zone_select_')
        && !customId.startsWith('exp_confirm_');
}

function isExpeditionSelectMenu(customId) {
    return customId.startsWith('exp_zone_select_');
}

function isExpeditionConfirm(customId) {
    return customId.startsWith('exp_confirm_');
}

// ==================== SAFETY WRAPPER ====================
// Wraps an interaction handler so any thrown error surfaces as an ephemeral
// message instead of a silent "This interaction failed". Without this, a DB
// throw inside a handler leaves the interaction unacknowledged.
function withErrorHandling(handlerName, handler) {
    return async function (interaction) {
        try {
            return await handler(interaction);
        } catch (err) {
            console.error(`[expedition] Error in ${handlerName} (customId=${interaction.customId}):`, err);
            const errMsg = { content: '⚠️ Terjadi error saat memproses ekspedisi. Coba lagi sebentar lagi.', ephemeral: true };
            try {
                if (interaction.replied || interaction.deferred) {
                    return await interaction.followUp(errMsg);
                }
                return await interaction.reply(errMsg);
            } catch (replyErr) {
                console.error(`[expedition] Failed to send error reply for ${handlerName}:`, replyErr);
            }
        }
    };
}

// ==================== EXPORTS ====================
module.exports = {
    EXPEDITION_ZONES,
    buildExpeditionPanel,
    handleExpeditionButton: withErrorHandling('handleExpeditionButton', handleExpeditionButton),
    handleExpeditionSelectMenu: withErrorHandling('handleExpeditionSelectMenu', handleExpeditionSelectMenu),
    handleExpeditionConfirm: withErrorHandling('handleExpeditionConfirm', handleExpeditionConfirm),
    isExpeditionButton,
    isExpeditionSelectMenu,
    isExpeditionConfirm,
    getActiveExpedition
};
