// systems/consent.js - Game Consent & Agreement Gating Manager
const { db } = require('../database');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const i18n = require('./i18n');

// In-memory cache for game consent status to prevent redundant DB reads
const consentCache = new Map();

// Commands list that are gated under the Game Consent agreement
const GAME_COMMANDS = [
    'pet', 'fishing', 'fish', 'farm', 'quest',
    'casino', 'blackjack', 'togel', 'arena', 'auction',
    'trade', 'market', 'globalmarket', 'globaltrade',
    'expedition', 'worldboss', 'battle',
    'card', 'drop', 'cardview', 'cards', 'cardlb',
    'rps', 'horserace'
];

/**
 * Check if a command name is a gated game command
 * @param {string} commandName 
 * @returns {boolean}
 */
function isGatedGameCommand(commandName) {
    return GAME_COMMANDS.includes(commandName);
}

/**
 * Check if the user has accepted the game terms consent
 * @param {string} guildId 
 * @param {string} userId 
 * @returns {boolean}
 */
function hasGameConsent(guildId, userId) {
    const cacheKey = `${guildId}_${userId}`;
    if (consentCache.has(cacheKey)) {
        return consentCache.get(cacheKey);
    }

    try {
        const row = db.prepare('SELECT game_consent FROM users WHERE guildId = ? AND userId = ?').get(guildId, userId);
        const accepted = row?.game_consent === 1;
        consentCache.set(cacheKey, accepted);
        return accepted;
    } catch (e) {
        // Fallback to true if database column is missing/error occurs, to prevent bricking the bot
        return true;
    }
}

/**
 * Set the game terms consent status for a user
 * @param {string} guildId 
 * @param {string} userId 
 * @param {boolean} allowed 
 */
function setGameConsent(guildId, userId, allowed) {
    const cacheKey = `${guildId}_${userId}`;
    const statusVal = allowed ? 1 : 0;
    consentCache.set(cacheKey, allowed);

    // Update database (guildId is rewritten automatically in global mode)
    db.prepare('UPDATE users SET game_consent = ? WHERE guildId = ? AND userId = ?').run(statusVal, guildId, userId);
}

/**
 * Build the localized Game Consent agreement prompt
 * @param {string} guildId 
 * @param {string} userId 
 * @returns {object} Discord message payload
 */
function buildGameConsentPrompt(guildId, userId) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(i18n.t(guildId, userId, 'game_consent.title'))
        .setDescription(i18n.t(guildId, userId, 'game_consent.desc'));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`gameconsent_yes_${userId}`)
            .setLabel(i18n.t(guildId, userId, 'game_consent.agree'))
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`gameconsent_no_${userId}`)
            .setLabel(i18n.t(guildId, userId, 'game_consent.disagree'))
            .setEmoji('❌')
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

const GATED_FEATURES = [
    'feature_fishing',
    'feature_farming',
    'feature_pet',
    'feature_casino',
    'feature_quest',
    'feature_arena',
    'feature_auction',
    'feature_trade',
    'feature_globalmarket',
    'feature_card'
];

/**
 * Check if a customId belongs to a gated game feature interaction
 * @param {string} customId 
 * @returns {boolean}
 */
function isGatedGameInteraction(customId) {
    const { getFeatureKeyForInteraction } = require('./featureGate');
    const featureKey = getFeatureKeyForInteraction(customId);
    if (featureKey && GATED_FEATURES.includes(featureKey)) {
        return true;
    }
    const extraPrefixes = ['cardgrab_', 'cardtrade_', 'cardpage_', 'fcol_', 'rps_', 'hr_'];
    for (const p of extraPrefixes) {
        if (customId.startsWith(p)) return true;
    }
    return false;
}

module.exports = {
    GAME_COMMANDS,
    isGatedGameCommand,
    hasGameConsent,
    setGameConsent,
    buildGameConsentPrompt,
    isGatedGameInteraction
};
