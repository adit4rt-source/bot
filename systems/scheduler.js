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

    // ===== BACKUP (from systems/backup.js) =====
    // backup.startBackupSchedule has its own internal setInterval
    try {
        const { startBackupSchedule } = require('./backup');
        startBackupSchedule(client);
        console.log('💾 Auto-backup: setiap 6 jam → Discord channel');
    } catch (e) { console.error('Backup scheduler error:', e.message); }

    // ===== DAILY RAMALAN ORACLE (07:00 AM WIB) =====
    try {
        const { checkAndSendDailyRamalan } = require('./dailyRamalan');
        registerJob('daily-ramalan', 60000, () => checkAndSendDailyRamalan(client), { startupDelay: 10000 });
        console.log('🔮 Daily Ramalan Oracle: cek jadwal kirim jam 07:00 WIB tiap 1 menit');
    } catch (e) { console.error('Daily ramalan scheduler error:', e.message); }

    // ===== WEALTH TAX (Every Sunday 00:00 WIB) =====
    try {
        const { runWealthTax } = require('./vault');
        const { getSetting, setSetting } = require('../database');
        registerJob('weekly-wealth-tax', 60 * 60000, () => {
            const now = new Date();
            const jktDateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
            const jktDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' }).format(now);
            if (jktDay === 'Sun') {
                const lastRun = getSetting('GLOBAL', 'last_wealth_tax_date', '');
                if (lastRun !== jktDateStr) {
                    const res = runWealthTax('GLOBAL');
                    setSetting('GLOBAL', 'last_wealth_tax_date', jktDateStr);
                    if (res && res.affectedUsers > 0) {
                        console.log(`🏦 [WealthTax] Dipungut: ${res.affectedUsers} user, total 🪙${res.totalTaxCollected.toLocaleString('id-ID')} masuk server vault.`);
                    }
                }
            }
        }, { startupDelay: 30000 });
        console.log('🏦 Wealth Tax: evaluasi pajak mingguan hari Minggu (2% untuk saldo >= 500k)');
    } catch (e) { console.error('Wealth tax scheduler error:', e.message); }

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
