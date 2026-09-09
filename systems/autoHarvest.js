// systems/autoHarvest.js - Auto-Harvest notifier
// Periodically checks farms of users who own & enabled the Auto-Harvest Pass and
// DMs them once when their crops become ready to harvest.
const { db } = require('../database');
const { FARM_CROPS, FARM_FERTILIZERS } = require('../data/farming');
const { PRESTIGE_CROPS } = require('./farmMutation');
const { getCropSeasonEffect, SEASON_CROP_EFFECTS } = require('./farmSeason');
const { notifyFarmReady } = require('./notifications');

let log = () => {};
try { ({ log } = require('./logger')); } catch (e) { /* logger optional */ }

const CHECK_INTERVAL_MS = 2 * 60 * 1000; // every 2 minutes (feels near-instant without spamming)
const STARTUP_DELAY_MS = 20 * 1000;       // first check 20s after boot

// Resolve a crop across normal + prestige crops (prestige plots store their plain id).
function findCrop(id) {
    return FARM_CROPS.find(c => c.id === id) || PRESTIGE_CROPS.find(c => c.id === id) || null;
}

// Mirror of the readiness calc used by the farm panel (farmPanel.js).
function isPlotReady(plot) {
    const crop = findCrop(plot.cropId);
    if (!crop) return false;
    const fert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer) || FARM_FERTILIZERS[0];
    const seasonEffect = (plot.greenhouse === 1) ? SEASON_CROP_EFFECTS['in'] : getCropSeasonEffect(crop);
    const growTime = crop.time * (1 - fert.speedBonus) * seasonEffect.growMult * 60000;
    return Date.now() - plot.plantedAt >= growTime;
}

async function runAutoHarvestCheck(client) {
    // DM notifications are disabled
    return;
}

function startAutoHarvestSchedule(client) {
    // Run once shortly after boot (catches crops that ripened while the bot was offline),
    // then on a fixed interval. Not unref'd so the loop never drops the timer.
    setTimeout(() => { runAutoHarvestCheck(client).catch(() => {}); }, STARTUP_DELAY_MS);
    return setInterval(() => { runAutoHarvestCheck(client).catch(() => {}); }, CHECK_INTERVAL_MS);
}

module.exports = { startAutoHarvestSchedule, runAutoHarvestCheck, isPlotReady, CHECK_INTERVAL_MS };
