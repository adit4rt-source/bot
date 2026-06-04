// systems/autoHarvest.js - Auto-Harvest notifier
// Periodically checks farms of users who own & enabled the Auto-Harvest Pass and
// DMs them once when their crops become ready to harvest.
const { db } = require('../database');
const { FARM_CROPS, FARM_FERTILIZERS } = require('../data/farming');
const { notifyFarmReady } = require('./notifications');

let log = () => {};
try { ({ log } = require('./logger')); } catch (e) { /* logger optional */ }

const CHECK_INTERVAL_MS = 2 * 60 * 1000; // every 2 minutes (feels near-instant without spamming)
const STARTUP_DELAY_MS = 20 * 1000;       // first check 20s after boot

// Mirror of the readiness calc used by the farm panel (farmPanel.js).
function isPlotReady(plot) {
    const crop = FARM_CROPS.find(c => c.id === plot.cropId);
    if (!crop) return false;
    const fert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer) || FARM_FERTILIZERS[0];
    const growTime = crop.time * (1 - fert.speedBonus) * 60000;
    return Date.now() - plot.plantedAt >= growTime;
}

async function runAutoHarvestCheck(client) {
    let enabledRows;
    try {
        enabledRows = db.prepare('SELECT userId FROM auto_harvest WHERE enabled = 1 AND purchased = 1').all();
    } catch (e) {
        log('ERROR', 'autoHarvest: failed to read auto_harvest table', e);
        return;
    }

    for (const { userId } of enabledRows) {
        try {
            // Plots that are alive and not yet notified for this planting.
            const plots = db.prepare(
                "SELECT * FROM farm_plots WHERE userId = ? AND status != 'dead' AND COALESCE(notified, 0) = 0"
            ).all(userId);

            const readyPlots = plots.filter(isPlotReady);
            if (readyPlots.length === 0) continue;

            // Mark as notified first so we never double-ping (even if the DM fails).
            const markStmt = db.prepare('UPDATE farm_plots SET notified = 1 WHERE id = ?');
            for (const p of readyPlots) markStmt.run(p.id);

            // Build a short summary of ready crops, e.g. "🌾 Gandum x2, 🍅 Tomat x1".
            const counts = {};
            for (const p of readyPlots) {
                const crop = FARM_CROPS.find(c => c.id === p.cropId);
                const label = crop ? `${crop.emoji} ${crop.name}` : p.cropId;
                counts[label] = (counts[label] || 0) + 1;
            }
            const summary = Object.entries(counts).map(([label, c]) => `${label} x${c}`).join(', ');

            await notifyFarmReady(client, guildId, userId, summary).catch(() => {});
        } catch (e) {
            log('ERROR', `autoHarvest: check failed for ${guildId}/${userId}`, e);
        }
    }
}

function startAutoHarvestSchedule(client) {
    // Run once shortly after boot (catches crops that ripened while the bot was offline),
    // then on a fixed interval. Not unref'd so the loop never drops the timer.
    setTimeout(() => { runAutoHarvestCheck(client).catch(() => {}); }, STARTUP_DELAY_MS);
    return setInterval(() => { runAutoHarvestCheck(client).catch(() => {}); }, CHECK_INTERVAL_MS);
}

module.exports = { startAutoHarvestSchedule, runAutoHarvestCheck, isPlotReady, CHECK_INTERVAL_MS };
