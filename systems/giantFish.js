// systems/giantFish.js — Giant Fish (Boss Fish) System
// 1% chance muncul saat mancing di lokasi Deep Sea+
// Butuh 3-5 cast berturut dalam 60 detik untuk ditangkap
// Reward: 5000-20000 money + exclusive badge

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, incrementUserStat, getUserStat, addItem } = require('../database');
const { getRandomInt } = require('../utils');
const { checkAchievements } = require('./achievements');

// ==================== GIANT FISH DATA ====================
const GIANT_FISH = [
    // Deep Sea giants
    { id: 'giant_megalodon', name: 'Ancient Megalodon', emoji: '🦷', location: 'deep_sea', hp: 3, minReward: 5000, maxReward: 10000, desc: 'Hiu purba raksasa dari kedalaman laut!' },
    { id: 'giant_kraken', name: 'Elder Kraken', emoji: '🦑', location: 'deep_sea', hp: 4, minReward: 7000, maxReward: 12000, desc: 'Kraken tua yang menguasai dasar laut!' },
    // Ice Cave giants
    { id: 'giant_frost_whale', name: 'Frost Titan Whale', emoji: '🐋', location: 'ice_cave', hp: 4, minReward: 8000, maxReward: 14000, desc: 'Paus es kolosal yang membekukan lautan!' },
    { id: 'giant_ice_serpent', name: 'Glacial Serpent', emoji: '🐍', location: 'ice_cave', hp: 3, minReward: 6000, maxReward: 11000, desc: 'Ular es raksasa dari gletser purba!' },
    // Volcano giants
    { id: 'giant_magma_wyrm', name: 'Magma Wyrm King', emoji: '🐉', location: 'volcano', hp: 4, minReward: 9000, maxReward: 16000, desc: 'Raja naga lava yang tidur di gunung berapi!' },
    { id: 'giant_inferno_leviathan', name: 'Inferno Leviathan', emoji: '🌋', location: 'volcano', hp: 5, minReward: 10000, maxReward: 18000, desc: 'Leviathan api yang membakar siapapun yang mendekat!' },
    // Void Rift giants
    { id: 'giant_void_titan', name: 'Void Titan', emoji: '🌀', location: 'void_rift', hp: 5, minReward: 12000, maxReward: 20000, desc: 'Titan dari dimensi void — hampir mustahil ditangkap!' },
    { id: 'giant_cosmic_behemoth', name: 'Cosmic Behemoth', emoji: '🌌', location: 'void_rift', hp: 5, minReward: 15000, maxReward: 20000, desc: 'Makhluk kosmik terbesar yang pernah ada!' },
    // Secret Location giants
    { id: 'giant_abyssal_god', name: 'Abyssal God Fish', emoji: '👁️', location: 'abyss', hp: 5, minReward: 15000, maxReward: 20000, desc: 'Dewa ikan dari kedalaman abyss yang tak terukur!' },
];

// ==================== CONFIG ====================
const GIANT_FISH_SPAWN_CHANCE = 0.01; // 1% per cast
const GIANT_FISH_TIMEOUT = 60 * 1000; // 60 detik untuk menyelesaikan
const ADVANCED_LOCATIONS = ['deep_sea', 'ice_cave', 'volcano', 'void_rift', 'abyss']; // Lokasi yang bisa spawn giant fish

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS giant_fish_encounters (
    guildId TEXT,
    oderId TEXT,
    oderId2 TEXT,
    giantFishId TEXT,
    hitsRequired INTEGER DEFAULT 3,
    hitsLanded INTEGER DEFAULT 0,
    startedAt INTEGER,
    completedAt INTEGER,
    success INTEGER DEFAULT 0,
    reward INTEGER DEFAULT 0,
    PRIMARY KEY(guildId, oderId, startedAt)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS giant_fish_active (
    guildId TEXT,
    userId TEXT,
    giantFishId TEXT,
    hitsRequired INTEGER,
    hitsLanded INTEGER DEFAULT 0,
    startedAt INTEGER,
    expiresAt INTEGER,
    PRIMARY KEY(guildId, userId)
)`);

// ==================== CORE FUNCTIONS ====================

/**
 * Check if a giant fish should spawn for this cast
 * @returns {object|null} Giant fish data or null
 */
function checkGiantFishSpawn(locationId) {
    if (!ADVANCED_LOCATIONS.includes(locationId)) return null;
    if (Math.random() > GIANT_FISH_SPAWN_CHANCE) return null;

    // Get giant fish available for this location
    const available = GIANT_FISH.filter(g => g.location === locationId);
    if (available.length === 0) return null;

    return available[Math.floor(Math.random() * available.length)];
}

/**
 * Get active giant fish encounter for a player
 */
function getActiveGiantFish(guildId, userId) {
    const row = db.prepare('SELECT * FROM giant_fish_active WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!row) return null;

    // Check if expired
    if (Date.now() > row.expiresAt) {
        // Remove expired encounter
        db.prepare('DELETE FROM giant_fish_active WHERE guildId = ? AND userId = ?').run(guildId, userId);
        // Log as failed
        db.prepare(`INSERT INTO giant_fish_encounters (guildId, oderId, giantFishId, hitsRequired, hitsLanded, startedAt, completedAt, success, reward)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`).run(guildId, userId, row.giantFishId, row.hitsRequired, row.hitsLanded, row.startedAt, Date.now());
        return null;
    }

    return row;
}

/**
 * Start a giant fish encounter
 */
function startGiantFishEncounter(guildId, userId, giantFish) {
    const hitsRequired = getRandomInt(3, 5); // 3-5 casts needed
    const now = Date.now();
    const expiresAt = now + GIANT_FISH_TIMEOUT;

    // Remove any existing encounter first
    db.prepare('DELETE FROM giant_fish_active WHERE guildId = ? AND userId = ?').run(guildId, userId);

    db.prepare(`INSERT INTO giant_fish_active (guildId, userId, giantFishId, hitsRequired, hitsLanded, startedAt, expiresAt)
        VALUES (?, ?, ?, ?, 0, ?, ?)`).run(guildId, userId, giantFish.id, hitsRequired, now, expiresAt);

    return { giantFish, hitsRequired, hitsLanded: 0, startedAt: now, expiresAt };
}

/**
 * Hit (cast at) an active giant fish
 * @returns {object} { hit: true/false, defeated: true/false, encounter data }
 */
function hitGiantFish(guildId, userId) {
    const active = getActiveGiantFish(guildId, userId);
    if (!active) return null;

    const newHits = active.hitsLanded + 1;
    const giantFish = GIANT_FISH.find(g => g.id === active.giantFishId);

    if (newHits >= active.hitsRequired) {
        // DEFEATED! Calculate reward
        const reward = getRandomInt(giantFish.minReward, giantFish.maxReward);

        // Remove active encounter
        db.prepare('DELETE FROM giant_fish_active WHERE guildId = ? AND userId = ?').run(guildId, userId);

        // Log as success
        db.prepare(`INSERT INTO giant_fish_encounters (guildId, oderId, giantFishId, hitsRequired, hitsLanded, startedAt, completedAt, success, reward)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`).run(guildId, userId, giantFish.id, active.hitsRequired, newHits, active.startedAt, Date.now(), reward);

        // Grant reward
        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(reward, guildId, userId);

        // Increment stats
        incrementUserStat(guildId, userId, 'giant_fish_defeated');
        incrementUserStat(guildId, userId, 'giant_fish_total_reward', reward);

        // Grant badge item
        addItem(guildId, userId, `badge_${giantFish.id}`, 1);

        return {
            hit: true,
            defeated: true,
            giantFish,
            hitsLanded: newHits,
            hitsRequired: active.hitsRequired,
            reward,
            timeLeft: Math.max(0, active.expiresAt - Date.now())
        };
    } else {
        // Hit but not defeated yet
        db.prepare('UPDATE giant_fish_active SET hitsLanded = ? WHERE guildId = ? AND userId = ?').run(newHits, guildId, userId);

        return {
            hit: true,
            defeated: false,
            giantFish,
            hitsLanded: newHits,
            hitsRequired: active.hitsRequired,
            reward: 0,
            timeLeft: Math.max(0, active.expiresAt - Date.now())
        };
    }
}

/**
 * Get player giant fish stats
 */
function getGiantFishStats(guildId, userId) {
    const defeated = getUserStat(guildId, userId, 'giant_fish_defeated');
    const totalReward = getUserStat(guildId, userId, 'giant_fish_total_reward');
    const encounters = db.prepare('SELECT COUNT(*) as total FROM giant_fish_encounters WHERE guildId = ? AND oderId = ?').get(guildId, userId);
    const successes = db.prepare('SELECT COUNT(*) as total FROM giant_fish_encounters WHERE guildId = ? AND oderId = ? AND success = 1').get(guildId, userId);

    return {
        defeated: defeated || 0,
        totalReward: totalReward || 0,
        totalEncounters: encounters ? encounters.total : 0,
        successRate: encounters && encounters.total > 0 ? Math.round((successes.total / encounters.total) * 100) : 0
    };
}

/**
 * Build giant fish spawn embed (when it first appears)
 */
function buildGiantFishSpawnEmbed(giantFish, hitsRequired, userId) {
    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(`🐋💥 GIANT FISH MUNCUL! 💥🐋`)
        .setDescription(
            `${giantFish.emoji} **${giantFish.name}** telah muncul!\n\n` +
            `> *${giantFish.desc}*\n\n` +
            `⚔️ **Cast ${hitsRequired}x dalam 60 detik** untuk menangkapnya!\n` +
            `> 💰 Reward: 🪙 **${giantFish.minReward.toLocaleString('id-ID')}** ~ **${giantFish.maxReward.toLocaleString('id-ID')}**\n` +
            `> 🏆 + Exclusive Badge!\n\n` +
            `⏱️ Waktu tersisa: **60 detik**\n` +
            `❤️ HP: ${'🟥'.repeat(hitsRequired)} (0/${hitsRequired})`
        )
        .setFooter({ text: 'Tekan 🎣 Cast untuk menyerang!' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fish_cast_${userId}`).setLabel(`⚔️ SERANG! (0/${hitsRequired})`).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🏃 Kabur').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

/**
 * Build giant fish hit embed (progress update)
 */
function buildGiantFishHitEmbed(result, userId) {
    const { giantFish, hitsLanded, hitsRequired, timeLeft } = result;
    const hpRemaining = hitsRequired - hitsLanded;
    const hpBar = '🟩'.repeat(hitsLanded) + '🟥'.repeat(hpRemaining);
    const timeLeftSec = Math.ceil(timeLeft / 1000);

    const embed = new EmbedBuilder()
        .setColor('#FF6B00')
        .setTitle(`⚔️ HIT! ${giantFish.emoji} ${giantFish.name}`)
        .setDescription(
            `💥 **Seranganmu mengenai!**\n\n` +
            `❤️ HP: ${hpBar} (${hitsLanded}/${hitsRequired})\n` +
            `⏱️ Waktu tersisa: **${timeLeftSec} detik**\n\n` +
            `> Cast lagi **${hpRemaining}x** untuk menangkapnya!`
        )
        .setFooter({ text: 'Cepat! Waktu terbatas!' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fish_cast_${userId}`).setLabel(`⚔️ SERANG! (${hitsLanded}/${hitsRequired})`).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🏃 Kabur').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

/**
 * Build giant fish defeated embed (success!)
 */
function buildGiantFishDefeatedEmbed(result, userId) {
    const { giantFish, hitsLanded, hitsRequired, reward } = result;

    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`🐋🏆 GIANT FISH TERTANGKAP! 🏆🐋`)
        .setDescription(
            `${giantFish.emoji} **${giantFish.name}** berhasil ditangkap!\n\n` +
            `> *${giantFish.desc}*\n\n` +
            `🎉 **REWARD:**\n` +
            `> 💰 Money: 🪙 **+${reward.toLocaleString('id-ID')}**\n` +
            `> 🏅 Badge: **${giantFish.emoji} ${giantFish.name}** (Exclusive!)\n\n` +
            `⚔️ Serangan: ${hitsLanded}/${hitsRequired} ✅\n` +
            `❤️ HP: ${'🟩'.repeat(hitsRequired)} DEFEATED!`
        )
        .setFooter({ text: 'Selamat! Giant Fish sangat langka — tunjukkan badge-mu!' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fish_cast_${userId}`).setLabel('🎣 Lanjut Mancing').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('📋 Panel').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

/**
 * Build giant fish escaped embed (timeout/failed)
 */
function buildGiantFishEscapedEmbed(giantFish, hitsLanded, hitsRequired, userId) {
    const embed = new EmbedBuilder()
        .setColor('#95A5A6')
        .setTitle(`💨 GIANT FISH KABUR!`)
        .setDescription(
            `${giantFish.emoji} **${giantFish.name}** berhasil melarikan diri!\n\n` +
            `> ⏱️ Waktu habis!\n` +
            `> ❤️ Sisa HP: ${hitsRequired - hitsLanded} hit lagi\n` +
            `> ⚔️ Seranganmu: ${hitsLanded}/${hitsRequired}\n\n` +
            `*Jangan menyerah! Giant Fish punya 1% chance muncul di lokasi Deep Sea+*`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fish_cast_${userId}`).setLabel('🎣 Mancing Lagi').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('📋 Panel').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

module.exports = {
    GIANT_FISH,
    GIANT_FISH_SPAWN_CHANCE,
    GIANT_FISH_TIMEOUT,
    ADVANCED_LOCATIONS,
    checkGiantFishSpawn,
    getActiveGiantFish,
    startGiantFishEncounter,
    hitGiantFish,
    getGiantFishStats,
    buildGiantFishSpawnEmbed,
    buildGiantFishHitEmbed,
    buildGiantFishDefeatedEmbed,
    buildGiantFishEscapedEmbed
};
