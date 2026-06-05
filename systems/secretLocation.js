// systems/secretLocation.js — Secret Location Unlock System
// Unlock conditions:
// 1. Tangkap 50 ikan di Void Rift
// 2. Tangkap 5 ikan Secret tier
// Either condition unlocks the secret location "The Abyss"

const { db, getUserStat, incrementUserStat } = require('../database');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ==================== SECRET LOCATION CONFIG ====================
const SECRET_LOCATION = {
    id: 'abyss',
    name: '👁️ The Abyss',
    desc: 'Dimensi tersembunyi di bawah Void Rift — hanya pemancing elite yang bisa masuk',
    requiredRodTier: 7,
    luckPenalty: 35,
    bonusRare: 25,
    tiers: ['Epic', 'Legendary', 'Mythic', 'Secret'],
    isSecret: true
};

// ==================== UNLOCK CONDITIONS ====================
const UNLOCK_CONDITIONS = [
    {
        id: 'void_rift_50',
        desc: 'Tangkap 50 ikan di Void Rift',
        check: (guildId, userId) => {
            const count = getUserStat(guildId, userId, 'fish_caught_void_rift');
            return { met: count >= 50, progress: count, required: 50 };
        }
    },
    {
        id: 'secret_tier_5',
        desc: 'Tangkap 5 ikan Secret tier',
        check: (guildId, userId) => {
            const count = getUserStat(guildId, userId, 'fish_caught_secret_tier');
            return { met: count >= 5, progress: count, required: 5 };
        }
    }
];

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS secret_locations_unlocked (
    guildId TEXT,
    userId TEXT,
    locationId TEXT,
    unlockedAt INTEGER,
    unlockedBy TEXT,
    PRIMARY KEY(guildId, userId, locationId)
)`);

// ==================== CORE FUNCTIONS ====================

/**
 * Check if player has unlocked the secret location
 */
function hasSecretLocation(guildId, userId) {
    const row = db.prepare('SELECT 1 FROM secret_locations_unlocked WHERE guildId = ? AND userId = ? AND locationId = ?')
        .get(guildId, userId, SECRET_LOCATION.id);
    return !!row;
}

/**
 * Check unlock progress for a player
 * @returns {object} { unlocked, conditions: [{id, desc, met, progress, required}] }
 */
function checkUnlockProgress(guildId, userId) {
    if (hasSecretLocation(guildId, userId)) {
        return { unlocked: true, conditions: UNLOCK_CONDITIONS.map(c => ({ ...c, ...c.check(guildId, userId) })) };
    }

    const conditions = UNLOCK_CONDITIONS.map(c => ({
        id: c.id,
        desc: c.desc,
        ...c.check(guildId, userId)
    }));

    return { unlocked: false, conditions };
}

/**
 * Try to unlock secret location (called after relevant actions)
 * @returns {string|null} unlock condition id if just unlocked, null if not
 */
function tryUnlockSecretLocation(guildId, userId) {
    if (hasSecretLocation(guildId, userId)) return null;

    for (const condition of UNLOCK_CONDITIONS) {
        const result = condition.check(guildId, userId);
        if (result.met) {
            // UNLOCK!
            db.prepare('INSERT OR IGNORE INTO secret_locations_unlocked (guildId, userId, locationId, unlockedAt, unlockedBy) VALUES (?, ?, ?, ?, ?)')
                .run(guildId, userId, SECRET_LOCATION.id, Date.now(), condition.id);
            incrementUserStat(guildId, userId, 'secret_locations_unlocked');
            return condition.id;
        }
    }

    return null;
}

/**
 * Track fish caught at a specific location (for unlock progress)
 */
function trackLocationCatch(guildId, userId, locationId, fishTier) {
    if (locationId === 'void_rift') {
        incrementUserStat(guildId, userId, 'fish_caught_void_rift');
    }
    if (fishTier === 'Secret') {
        incrementUserStat(guildId, userId, 'fish_caught_secret_tier');
    }
}

/**
 * Build secret location discovery embed
 */
function buildSecretLocationUnlockEmbed(conditionId, userId) {
    const condition = UNLOCK_CONDITIONS.find(c => c.id === conditionId);

    const embed = new EmbedBuilder()
        .setColor('#8B00FF')
        .setTitle('👁️🌀 SECRET LOCATION UNLOCKED! 🌀👁️')
        .setDescription(
            `**Kamu menemukan lokasi tersembunyi!**\n\n` +
            `🗺️ **${SECRET_LOCATION.name}**\n` +
            `> *${SECRET_LOCATION.desc}*\n\n` +
            `📜 Unlock: *${condition ? condition.desc : 'Unknown'}*\n\n` +
            `**Info Lokasi:**\n` +
            `> 🎋 Rod Minimum: Tier ${SECRET_LOCATION.requiredRodTier}+ (Celestial)\n` +
            `> 🎯 Bonus Rare: +${SECRET_LOCATION.bonusRare}%\n` +
            `> 🐟 Tier: ${SECRET_LOCATION.tiers.join(', ')}\n` +
            `> ⚠️ Luck Penalty: -${SECRET_LOCATION.luckPenalty}% (jika rod di bawah rekomendasi)\n\n` +
            `🐋 *Lokasi ini juga memiliki Giant Fish eksklusif!*\n` +
            `🐠 *Ikan-ikan di sini TIDAK ADA di lokasi lain!*`
        )
        .setFooter({ text: 'Gunakan 📍 Location di Fishing Panel untuk berpindah ke The Abyss!' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fish_location_${userId}`).setLabel('📍 Pindah ke Abyss').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('📋 Panel').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

/**
 * Build secret location progress embed (for location panel)
 */
function buildSecretLocationProgressEmbed(guildId, userId) {
    const progress = checkUnlockProgress(guildId, userId);

    if (progress.unlocked) {
        return {
            unlocked: true,
            text: `> ✅ **${SECRET_LOCATION.name}** — *UNLOCKED!*\n> *${SECRET_LOCATION.desc}*\n> Tier: ${SECRET_LOCATION.tiers.join(', ')} | +${SECRET_LOCATION.bonusRare}% rare`
        };
    }

    let text = `> 🔒 **${SECRET_LOCATION.name}** — *LOCKED*\n> *Lokasi tersembunyi...*\n\n> **Cara Unlock (salah satu):**\n`;
    for (const cond of progress.conditions) {
        const bar = Math.min(10, Math.floor((cond.progress / cond.required) * 10));
        text += `> ${cond.met ? '✅' : '⬜'} ${cond.desc}: **${cond.progress}**/${cond.required} \`${'▰'.repeat(bar)}${'▱'.repeat(10 - bar)}\`\n`;
    }

    return { unlocked: false, text };
}

module.exports = {
    SECRET_LOCATION,
    UNLOCK_CONDITIONS,
    hasSecretLocation,
    checkUnlockProgress,
    tryUnlockSecretLocation,
    trackLocationCatch,
    buildSecretLocationUnlockEmbed,
    buildSecretLocationProgressEmbed
};
