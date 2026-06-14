// systems/featureGate.js — Feature toggle system for per-guild ON/OFF control
const { getSetting, setSetting } = require('../database');

// ======================== FEATURE DEFINITIONS ========================
// Each feature maps a setting key to a group of commands/interactions.
// Default is ON ('1'). Admin can set to '0' to disable.
const FEATURES = [
    { key: 'feature_economy',      label: 'Economy',       emoji: '💰', desc: '/wallet, /gift', commands: ['wallet', 'gift'] },
    { key: 'feature_daily',        label: 'Daily Reward',  emoji: '🎁', desc: '/daily, /calendar', commands: ['daily', 'calendar'] },
    { key: 'feature_shop',         label: 'Shop',          emoji: '🛒', desc: '/shop', commands: ['shop'] },
    { key: 'feature_fishing',      label: 'Fishing',       emoji: '🎣', desc: '/fish, /fishing', commands: ['fish', 'fishing'] },
    { key: 'feature_farming',      label: 'Farming',       emoji: '🌾', desc: '/farm (tanaman, ternak, craft)', commands: ['farm'] },
    { key: 'feature_pet',          label: 'Pet & Battle',  emoji: '🐾', desc: '/pet, /battle, /expedition, /worldboss', commands: ['pet', 'battle', 'expedition', 'worldboss'] },
    { key: 'feature_casino',       label: 'Casino',        emoji: '🎰', desc: '/casino, /blackjack, /togel, /rps, /horserace', commands: ['casino', 'blackjack', 'togel', 'rps', 'horserace'] },
    { key: 'feature_quest',        label: 'Quest',         emoji: '📜', desc: '/quest (daily & weekly)', commands: ['quest'] },
    { key: 'feature_arena',        label: 'Arena',         emoji: '⚔️', desc: '/arena', commands: ['arena'] },
    { key: 'feature_auction',      label: 'Auction',       emoji: '🏛️', desc: '/auction', commands: ['auction'] },
    { key: 'feature_trade',        label: 'Trade',         emoji: '🤝', desc: '/trade, /market', commands: ['trade', 'market'] },
    { key: 'feature_globalmarket', label: 'Global Market', emoji: '🌍', desc: '/globalmarket, /globaltrade', commands: ['globalmarket', 'globaltrade'] },
    { key: 'feature_card',         label: 'Cards',         emoji: '🃏', desc: '/card, /drop, /cards, /cardview, /wishlist, /cardlb', commands: ['card', 'drop', 'cards', 'cardview', 'wishlist', 'cardlb'] },
    { key: 'feature_giveaway',     label: 'Giveaway',      emoji: '🎉', desc: '/giveaway', commands: ['giveaway'] },
    { key: 'feature_starboard',    label: 'Starboard',     emoji: '⭐', desc: '/starboard', commands: ['starboard'] },
    { key: 'feature_invite',       label: 'Invite Tracker',emoji: '📨', desc: '/invite', commands: ['invite'] },
    { key: 'feature_tempvoice',    label: 'TempVoice',     emoji: '🎙️', desc: '/tempvoice', commands: ['tempvoice'] },
    { key: 'feature_aibot',        label: 'AI Bot',        emoji: '🤖', desc: '/tanya, /aibot', commands: ['tanya', 'aibot'] },
    { key: 'feature_selfrole',     label: 'Self Role',     emoji: '🏷️', desc: '/selfrole', commands: ['selfrole'] },
];

const PAGE_SIZE = 8;

// ======================== BUILD: command → feature key lookup ========================
// Pre-compute for O(1) lookups during command routing.
const _commandToFeature = {};
for (const f of FEATURES) {
    for (const cmd of f.commands) {
        _commandToFeature[cmd] = f.key;
    }
}

// ======================== PUBLIC API ========================

/**
 * Check if a feature is enabled for a guild.
 * @param {string} guildId
 * @param {string} featureKey  e.g. 'feature_fishing'
 * @returns {boolean}
 */
function isFeatureEnabled(guildId, featureKey) {
    return getSetting(guildId, featureKey, '1') !== '0';
}

/**
 * Toggle a feature for a guild. Returns the new state (true = ON).
 * @param {string} guildId
 * @param {string} featureKey
 * @returns {boolean} new state
 */
function toggleFeature(guildId, featureKey) {
    const current = isFeatureEnabled(guildId, featureKey);
    const newVal = current ? '0' : '1';
    setSetting(guildId, featureKey, newVal);
    return !current; // new state
}

/**
 * Given a slash command name, return the feature key (or null if ungated).
 * @param {string} commandName
 * @returns {string|null}
 */
function getFeatureKeyForCommand(commandName) {
    return _commandToFeature[commandName] || null;
}

/**
 * Build a user-friendly "feature disabled" reply message.
 * @param {string} featureLabel  e.g. 'Fishing'
 * @returns {string}
 */
function getDisabledMessage(featureLabel) {
    return `🚫 Fitur **${featureLabel}** sedang dinonaktifkan oleh admin server ini.\n> Hubungi admin jika ingin mengaktifkan fitur ini.`;
}

/**
 * Get feature definition by key.
 * @param {string} featureKey
 * @returns {object|undefined}
 */
function getFeatureDef(featureKey) {
    return FEATURES.find(f => f.key === featureKey);
}

// ======================== INTERACTION PREFIX MATCHING ========================
// Maps customId prefixes for buttons/selects/modals to their parent feature key.
// Used to gate button/select/modal interactions when the parent feature is OFF.
const INTERACTION_PREFIX_MAP = {
    // Economy
    'economy_':        'feature_economy',
    'econ_':           'feature_economy',
    // Daily Reward
    'daily_':          'feature_daily',
    // Shop
    'shop_buy_':       'feature_shop',
    // Farming (has seed_qty)
    'seed_qty_':       'feature_farming',
    // Fishing
    'fish_':           'feature_fishing',
    'fishing_':        'feature_fishing',
    // Farming
    'farm_':           'feature_farming',
    // Pet & Battle
    'pet_':            'feature_pet',
    'expedition_':     'feature_pet',
    'worldboss_':      'feature_pet',
    'fusion_':         'feature_pet',
    'mutation_':       'feature_pet',
    'dungeon_':        'feature_pet',
    'ability_':        'feature_pet',
    'awakening_':      'feature_pet',
    // Casino
    'casino_':         'feature_casino',
    'bj_':             'feature_casino',
    'lottery_':        'feature_casino',
    'coinflip_':       'feature_casino',
    'slot_':           'feature_casino',
    'rps_':            'feature_casino',
    'hr_':             'feature_casino',
    // Quest
    'quest_':          'feature_quest',
    // Arena
    'arena_':          'feature_arena',
    // Auction
    'auction_':        'feature_auction',
    // Trade
    'trade_':          'feature_trade',
    'market_':         'feature_trade',
    // Global Market
    'gmarket_':        'feature_globalmarket',
    'gtrade_':         'feature_globalmarket',
    // Cards
    'card_':           'feature_card',
    // Giveaway (public join button)
    'giveaway_join':   'feature_giveaway',
    // Starboard — no interactive components
    // Invite — no interactive components
    // TempVoice
    'tv_':             'feature_tempvoice',
    // AI Bot
    'aibot_':          'feature_aibot',
};

/**
 * Given a customId from a button/select/modal, find the feature key (or null).
 * @param {string} customId
 * @returns {string|null}
 */
function getFeatureKeyForInteraction(customId) {
    for (const [prefix, featureKey] of Object.entries(INTERACTION_PREFIX_MAP)) {
        if (customId.startsWith(prefix)) return featureKey;
    }
    return null;
}

module.exports = {
    FEATURES,
    PAGE_SIZE,
    isFeatureEnabled,
    toggleFeature,
    getFeatureKeyForCommand,
    getFeatureDef,
    getDisabledMessage,
    getFeatureKeyForInteraction,
};
