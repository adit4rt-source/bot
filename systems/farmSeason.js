// systems/farmSeason.js — Season System (rotates daily at 00:00 WIB)
const { SEASONS } = require('../data/livestock');

// ==================== CROP SEASON COMPATIBILITY ====================
const SEASON_CROP_EFFECTS = {
    peak:  { growMult: 0.80, yieldMult: 1.30, deathChance: 0, mutationBonus: 0.05, label: '🌈 Musim Ideal', color: '#2ECC71' },
    in:    { growMult: 1.00, yieldMult: 1.20, deathChance: 0, mutationBonus: 0, label: '✅ Cocok', color: '#3498DB' },
    off:   { growMult: 1.00, yieldMult: 1.00, deathChance: 0, mutationBonus: 0, label: '⚠️ Kurang Cocok', color: '#F1C40F' },
    wrong: { growMult: 1.50, yieldMult: 0.70, deathChance: 0.15, mutationBonus: 0, label: '❌ Tidak Cocok', color: '#E74C3C' },
};

function getCropSeasonEffect(crop) {
    const season = getTodaySeason();
    if (!crop || !crop.seasons) return SEASON_CROP_EFFECTS['off'];
    const compat = crop.seasons[season.id] || 'off';
    return SEASON_CROP_EFFECTS[compat];
}

/**
 * Get today's season based on WIB timezone.
 * Cycle: 4 days (Spring → Summer → Autumn → Winter → repeat)
 */
function getTodaySeason() {
    const now = new Date();
    // Convert to WIB (UTC+7)
    const wib = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    const startOfYear = new Date(wib.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((wib - startOfYear) / (1000 * 60 * 60 * 24));
    const seasonIndex = dayOfYear % 4; // 0=spring, 1=summer, 2=autumn, 3=winter
    return SEASONS[seasonIndex];
}

/**
 * Get season info with day count for display
 */
function getSeasonDisplay() {
    const season = getTodaySeason();
    const now = new Date();
    const wib = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    const startOfYear = new Date(wib.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((wib - startOfYear) / (1000 * 60 * 60 * 24));
    const dayInCycle = (dayOfYear % 4) + 1; // day 1 of current season

    return {
        ...season,
        dayInCycle,
        totalDays: 1, // each season lasts 1 day
        nextSeason: SEASONS[(SEASONS.indexOf(season) + 1) % 4],
    };
}

/**
 * Apply season effect to production time
 */
function getSeasonProductionMultiplier(animalType) {
    const season = getTodaySeason();
    if (animalType === 'chicken') return season.effects.chickenProd;
    if (animalType === 'cow') return season.effects.cowProd;
    if (animalType === 'sheep') return season.effects.sheepProd;
    return 1.0;
}

/**
 * Get season sick chance (daily roll per animal)
 */
function getSeasonSickChance() {
    const season = getTodaySeason();
    return season.effects.sickChance || 0;
}

/**
 * Get season pest chance
 */
function getSeasonPestChance() {
    const season = getTodaySeason();
    return season.effects.pestChance || 0;
}

/**
 * Get feed multiplier (summer = 2x feed consumption)
 */
function getSeasonFeedMultiplier() {
    const season = getTodaySeason();
    return season.effects.feedMultiplier || 1;
}

/**
 * Check if wabah can happen (winter special)
 */
function getSeasonWabahChance() {
    const season = getTodaySeason();
    return season.effects.wabahChance || 0;
}

/**
 * Get farm effects for crops
 */
function getSeasonFarmEffects() {
    const season = getTodaySeason();
    return {
        growMultiplier: season.effects.farmGrow,
        yieldMultiplier: season.effects.farmYield,
        deathMultiplier: season.effects.farmDeath,
        mutationBonus: season.effects.mutationBonus || 0,
    };
}

function getDynamicPrice(crop, type) {
    if (!crop) return 0;
    const season = module.exports.getTodaySeason();
    if (type === 'buy' || type === 'cost') {
        let cost = crop.cost;
        if (season.id === 'winter') {
            cost = Math.round(cost * 1.2);
        } else if (season.id === 'spring') {
            cost = Math.round(cost * 0.8);
        }
        return Math.max(1, cost);
    } else if (type === 'sell') {
        const farmWeatherModule = require('./farmWeather');
        const weather = farmWeatherModule.getTodayWeather();
        let multiplier = 1.0;
        if (season.id === 'winter') {
            multiplier *= 1.3;
        }
        if (weather && (weather.id === 'sunny' || weather.id === 'rainbow')) {
            multiplier *= 0.9;
        } else if (weather && (weather.id === 'stormy' || weather.id === 'drought')) {
            multiplier *= 1.2;
        }
        return Math.max(1, Math.round(crop.sellPrice * multiplier));
    }
    return type === 'sell' ? crop.sellPrice : crop.cost;
}

module.exports = {
    getTodaySeason,
    getSeasonDisplay,
    getSeasonProductionMultiplier,
    getSeasonSickChance,
    getSeasonPestChance,
    getSeasonFeedMultiplier,
    getSeasonWabahChance,
    getSeasonFarmEffects,
    SEASON_CROP_EFFECTS,
    getCropSeasonEffect,
    getDynamicPrice,
};
