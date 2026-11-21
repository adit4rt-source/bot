// systems/reminders.js - Automatic DM reminders (COMPLETELY DISABLED)
// All DM reminder functions are disabled to prevent spam
const { db, getUserStat, setUserStat, getUsersForDailyReminder, getActivePetsHungry, checkGlobalMode } = require('../database');
const { notifyDailyReady, notifyPetHungry, notifyFarmReady, sendNotification } = require('./notifications');

let log = () => {};
try { ({ log } = require('./logger')); } catch (e) { /* logger optional */ }

// All intervals set to very high values (effectively disabled)
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;   // 24 hours (disabled)
const PET_INTERVAL_MS = 24 * 60 * 60 * 1000;     // 24 hours (disabled)
const EXPEDITION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (disabled)
const QUEST_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (disabled)
const STREAK_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (disabled)
const FARM_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (disabled)
const ABILITY_TICK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes (kept for passive abilities)

const PET_DM_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const QUEST_DM_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const PET_HUNGER_THRESHOLD = 15;
const STARTUP_DELAY_MS = 45 * 1000;

function wibDate(offsetDays = 0) {
    return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

function wibHour() {
    return new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false });
}

// ---- All reminder functions disabled (return immediately) ----
async function runDailyReminderCheck(client) {
    return; // DISABLED
}

async function runPetHungryCheck(client) {
    return; // DISABLED
}

async function runExpeditionCheck(client) {
    return; // DISABLED
}

async function runQuestReminderCheck(client) {
    return; // DISABLED
}

async function runStreakReminderCheck(client) {
    return; // DISABLED
}

async function runFarmReadyCheck(client) {
    return; // DISABLED
}

async function runWorldBossReminderCheck(client) {
    return; // DISABLED
}

// ---- Pet ability passive tick (KEPT - for gameplay mechanics) ----
async function runAbilityTickAll(client) {
    try {
        const { runAbilityTick } = require('./petAbilities');
        const rows = db.prepare("SELECT guildId, userId FROM pet_abilities WHERE slot1 IS NOT NULL OR slot2 IS NOT NULL OR slot3 IS NOT NULL").all();
        const seen = new Set();
        for (const { guildId, userId } of rows) {
            if (seen.has(userId)) continue;
            seen.add(userId);
            try {
                await runAbilityTick(guildId, userId);
            } catch (e) { /* skip */ }
        }
    } catch (e) {
        log('ERROR', 'abilityTick check failed', e);
    }
}

// ---- Farm pest attack tick (KEPT - for gameplay mechanics) ----
async function runPestTick() {
    try {
        const { rollPestAttack, applyPest, getActivePests } = require('../data/farming');

        let activeFarmers;
        if (checkGlobalMode()) {
            activeFarmers = db.prepare("SELECT DISTINCT userId FROM farm_plots WHERE status = 'growing'").all()
                .map(r => ({ guildId: null, userId: r.userId }));
        } else {
            activeFarmers = db.prepare("SELECT DISTINCT guildId, userId FROM farm_plots WHERE status = 'growing'").all();
        }

        for (const { guildId, userId } of activeFarmers) {
            try {
                const currentPests = getActivePests(guildId, userId);
                if (currentPests.length >= 5) continue;

                let plots;
                if (checkGlobalMode()) {
                    plots = db.prepare("SELECT id FROM farm_plots WHERE userId = ? AND status = 'growing'").all(userId);
                } else {
                    plots = db.prepare("SELECT id FROM farm_plots WHERE guildId = ? AND userId = ? AND status = 'growing'").all(guildId, userId);
                }
                if (plots.length === 0) continue;

                const randomPlot = plots[Math.floor(Math.random() * plots.length)];
                const pest = rollPestAttack(guildId, userId, randomPlot.id);
                if (pest) {
                    applyPest(guildId, userId, randomPlot.id, pest.id);
                }
            } catch (e) { /* skip */ }
        }
    } catch (e) {
        log('ERROR', 'pestTick failed', e);
    }
}

function startReminderSchedules(client) {
    console.log('⏰ Reminder System: DM NOTIFICATIONS COMPLETELY DISABLED');
    console.log('✅ Ability tick and pest mechanics still active for gameplay');
    
    // Only keep ability tick and pest tick for gameplay mechanics
    const t8 = setInterval(() => { runAbilityTickAll(client).catch(() => {}); }, ABILITY_TICK_INTERVAL_MS);
    const t9 = setInterval(() => { runPestTick().catch(() => {}); }, 30 * 60 * 1000);

    return { abilityTimer: t8, pestTimer: t9 };
}

module.exports = {
    startReminderSchedules,
    runDailyReminderCheck,
    runPetHungryCheck,
    runExpeditionCheck,
    runQuestReminderCheck,
    runStreakReminderCheck,
    runFarmReadyCheck,
    runWorldBossReminderCheck,
    runAbilityTickAll,
    runPestTick,
    PET_HUNGER_THRESHOLD,
    PET_DM_COOLDOWN_MS,
    QUEST_DM_COOLDOWN_MS,
    DAILY_INTERVAL_MS,
    PET_INTERVAL_MS,
    EXPEDITION_INTERVAL_MS,
    QUEST_CHECK_INTERVAL_MS,
    STREAK_CHECK_INTERVAL_MS,
    FARM_CHECK_INTERVAL_MS,
    ABILITY_TICK_INTERVAL_MS,
};
