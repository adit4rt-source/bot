// systems/scheduler.js — Centralized Job Scheduler
// Replaces scattered setInterval() calls throughout bot.js and systems/ with
// a managed, named job system. Each job has error handling, logging, and can
// be stopped/restarted independently.
//
// Usage:
//   const scheduler = require('./scheduler');
//   scheduler.start(client);  // called once from bot.js
//   scheduler.stop();         // graceful shutdown
//   scheduler.getStats();     // monitoring

const { log } = require('./logger');

// ---- Job Registry ----
const jobs = new Map(); // name → { timer, intervalMs, fn, runCount, lastRun, lastError, running }

/**
 * Register and start a recurring job.
 * @param {string} name - Human-readable job name
 * @param {number} intervalMs - Interval in milliseconds
 * @param {Function} fn - Async function to execute
 * @param {Object} [opts] - Options
 * @param {number} [opts.startupDelay] - Delay before first run (ms)
 * @param {boolean} [opts.runImmediately] - Run immediately on registration
 */
function registerJob(name, intervalMs, fn, opts = {}) {
    if (jobs.has(name)) {
        console.warn(`[Scheduler] Job "${name}" already registered, skipping duplicate`);
        return;
    }

    const job = {
        name,
        intervalMs,
        fn,
        timer: null,
        runCount: 0,
        lastRun: null,
        lastError: null,
        running: false,
    };

    // Wrapped execution with error handling
    const execute = async () => {
        if (job.running) return; // prevent overlap
        job.running = true;
        try {
            await fn();
            job.runCount++;
            job.lastRun = Date.now();
            job.lastError = null;
        } catch (e) {
            job.lastError = { message: e.message, at: Date.now() };
            // Log but don't crash — other jobs keep running
            log('ERROR', `[Scheduler] Job "${name}" failed: ${e.message}`);
        } finally {
            job.running = false;
        }
    };

    // Start the interval
    const startJob = () => {
        job.timer = setInterval(execute, intervalMs);
    };

    if (opts.runImmediately) {
        execute(); // fire once immediately
        startJob();
    } else if (opts.startupDelay) {
        setTimeout(() => {
            execute(); // first run after delay
            startJob();
        }, opts.startupDelay);
    } else {
        startJob();
    }

    jobs.set(name, job);
}

/**
 * Stop a specific job.
 */
function stopJob(name) {
    const job = jobs.get(name);
    if (job && job.timer) {
        clearInterval(job.timer);
        job.timer = null;
    }
}

/**
 * Stop all jobs.
 */
function stopAll() {
    for (const [, job] of jobs) {
        if (job.timer) {
            clearInterval(job.timer);
            job.timer = null;
        }
    }
    console.log(`[Scheduler] All ${jobs.size} jobs stopped`);
}

/**
 * Get stats for all registered jobs (useful for /admin monitoring).
 */
function getStats() {
    const stats = [];
    for (const [name, job] of jobs) {
        stats.push({
            name,
            intervalMs: job.intervalMs,
            intervalHuman: formatInterval(job.intervalMs),
            runCount: job.runCount,
            lastRun: job.lastRun ? new Date(job.lastRun).toISOString() : 'never',
            lastError: job.lastError,
            active: !!job.timer,
            running: job.running,
        });
    }
    return stats;
}

function formatInterval(ms) {
    if (ms >= 3600000) return `${(ms / 3600000).toFixed(1)}h`;
    if (ms >= 60000) return `${(ms / 60000).toFixed(0)}m`;
    return `${(ms / 1000).toFixed(0)}s`;
}

// ---- Main entry point: register all jobs ----
function start(client) {
    // ===== REMINDERS (from systems/reminders.js) =====
    const reminders = require('./reminders');

    // Startup cleanup (synchronous, runs once)
    try {
        const { FARM_CROPS, FARM_FERTILIZERS } = require('../data/farming');
        const { db } = require('../database');
        const now = Date.now();
        const orphanedPlots = db.prepare("SELECT * FROM farm_plots WHERE status = 'growing' AND notified = 0").all();
        for (const plot of orphanedPlots) {
            const crop = FARM_CROPS.find(c => c.id === plot.cropId);
            if (!crop) { db.prepare('UPDATE farm_plots SET notified = 1 WHERE id = ?').run(plot.id); continue; }
            const fert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer);
            const speedBonus = fert ? (fert.speedBonus || 0) : 0;
            const growTimeMs = crop.time * (1 - speedBonus) * 60 * 1000;
            const dryTime = now - (plot.wateredAt || plot.plantedAt);
            const deadThreshold = growTimeMs * 2.5;
            if (dryTime > deadThreshold) {
                db.prepare("UPDATE farm_plots SET notified = 1, status = 'dead' WHERE id = ?").run(plot.id);
            }
        }
        console.log('🌾 Farm plots cleanup done on startup');
    } catch (_) { /* non-critical */ }

    registerJob('ability-tick',        reminders.ABILITY_TICK_INTERVAL_MS,    () => reminders.runAbilityTickAll(client));
    registerJob('pest-tick',           1800000,                               () => reminders.runPestTick());

    console.log('⏰ Gameplay timers started (ability-tick & pest-tick via scheduler; DM reminders disabled)');

    // ===== PANEL REFRESH (from systems/panelRefresh.js) =====
    try {
        const panelRefresh = require('./panelRefresh');
        registerJob('panel-refresh', panelRefresh.REFRESH_MS || 30000, () => panelRefresh.tick()); // every 30s
        console.log('🔄 Panel auto-refresh: progress panel update tiap 30 detik');
    } catch (e) { console.error('Panel refresh scheduler error:', e.message); }

    // ===== VOICE TICK (from events/voiceStateUpdate.js) =====
    // voiceStateUpdate exports startVoiceTickInterval which uses setInterval internally.
    // We call it directly since it has its own internal state management.
    try {
        const { startVoiceTickInterval } = require('../events/voiceStateUpdate');
        startVoiceTickInterval();
        console.log('🎙️ Voice tick: quest progress setiap 1 menit');
    } catch (e) { console.error('Voice tick scheduler error:', e.message); }

    // ===== GIVEAWAY (from systems/giveaway.js) =====
    // Uses its own internal scheduler with _schedulerStarted guard
    try {
        const { startGiveawayScheduler } = require('./giveaway');
        startGiveawayScheduler(client);
        console.log('🎉 Giveaway scheduler: cek setiap 30 detik');
    } catch (e) { console.error('Giveaway scheduler error:', e.message); }

    // ===== LOTTERY (from systems/lottery.js) =====
    // Uses its own internal scheduler with _schedulerStarted guard
    try {
        const { startLotteryScheduler } = require('./lottery');
        startLotteryScheduler(client);
        console.log('🎟️ Lottery scheduler: undian togel otomatis tiap 1 jam');
    } catch (e) { console.error('Lottery scheduler error:', e.message); }

    // ===== LIVESTOCK (from systems/livestock.js) =====
    try {
        const { startLivestockDailySchedule } = require('./livestock');
        startLivestockDailySchedule();
        console.log('🐔 Livestock daily tick: cek pergantian hari WIB tiap 30 menit');
    } catch (e) { console.error('Livestock scheduler error:', e.message); }

    // ===== BACKUP (from systems/backup.js) =====
    // backup.startBackupSchedule has its own internal setInterval
    try {
        const { startBackupSchedule } = require('./backup');
        startBackupSchedule(client);
        console.log('💾 Auto-backup: setiap 6 jam → Discord channel');
    } catch (e) { console.error('Backup scheduler error:', e.message); }

    // ===== PRESENCE UPDATE =====
    const { ActivityType } = require('discord.js');
    registerJob('presence-update', 10 * 60000, () => {
        client.user.setPresence({
            activities: [{ name: `/help | ${client.guilds.cache.size} servers`, type: ActivityType.Playing }],
            status: 'online'
        });
    });

    console.log(`📋 Scheduler started: ${jobs.size} managed jobs + ${['voice-tick', 'giveaway', 'lottery', 'livestock', 'backup'].length} self-managed modules`);
}

module.exports = { start, stop: stopAll, stopJob, getStats, registerJob };
