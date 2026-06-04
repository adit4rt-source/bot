// systems/reminders.js - Automatic DM reminders (daily reward + hungry pet)
// Runs on timers, independent of chat, with per-user dedup so users aren't spammed.
const { getUserStat, setUserStat, getUsersForDailyReminder, getActivePetsHungry } = require('../database');
const { notifyDailyReady, notifyPetHungry } = require('./notifications');

let log = () => {};
try { ({ log } = require('./logger')); } catch (e) { /* logger optional */ }

const DAILY_INTERVAL_MS = 60 * 60 * 1000;   // check hourly
const PET_INTERVAL_MS = 10 * 60 * 1000;     // check every 10 minutes
const PET_DM_COOLDOWN_MS = 6 * 60 * 60 * 1000; // at most one hungry-pet DM / 6h / user
const PET_HUNGER_THRESHOLD = 15;            // DM when hunger at/below this (or sick)
const STARTUP_DELAY_MS = 45 * 1000;

function wibDate(offsetDays = 0) {
    return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

// ---- Daily reward reminder ----
// Reminds players who were active recently (claimed in the last 2 days) but
// haven't claimed today yet. Skips long-inactive players to avoid spam.
async function runDailyReminderCheck(client) {
    try {
        const today = wibDate(0);
        const cutoff = wibDate(-2); // only remind users active within the last 2 days
        const todayInt = parseInt(today.replace(/-/g, ''), 10);
        const rows = getUsersForDailyReminder(today, cutoff);

        for (const { guildId, userId } of rows) {
            try {
                if (getUserStat(guildId, userId, 'daily_dm_ymd') === todayInt) continue; // already reminded today
                setUserStat(guildId, userId, 'daily_dm_ymd', todayInt);
                await notifyDailyReady(client, guildId, userId).catch(() => {});
            } catch (e) { log('ERROR', `dailyReminder failed for ${guildId}/${userId}`, e); }
        }
    } catch (e) {
        log('ERROR', 'dailyReminder check failed', e);
    }
}

// ---- Hungry / sick pet reminder ----
async function runPetHungryCheck(client) {
    try {
        const pets = getActivePetsHungry(PET_HUNGER_THRESHOLD);

        const now = Date.now();
        for (const pet of pets) {
            try {
                const last = getUserStat(pet.guildId, pet.userId, 'pet_hungry_dm_at');
                if (last && now - last < PET_DM_COOLDOWN_MS) continue; // cooldown
                setUserStat(pet.guildId, pet.userId, 'pet_hungry_dm_at', now);
                await notifyPetHungry(client, pet.guildId, pet.userId, pet.name, pet.hunger).catch(() => {});
            } catch (e) { log('ERROR', `petHungry failed for ${pet.guildId}/${pet.userId}`, e); }
        }
    } catch (e) {
        log('ERROR', 'petHungry check failed', e);
    }
}

function startReminderSchedules(client) {
    setTimeout(() => { runDailyReminderCheck(client).catch(() => {}); runPetHungryCheck(client).catch(() => {}); }, STARTUP_DELAY_MS);
    const t1 = setInterval(() => { runDailyReminderCheck(client).catch(() => {}); }, DAILY_INTERVAL_MS);
    const t2 = setInterval(() => { runPetHungryCheck(client).catch(() => {}); }, PET_INTERVAL_MS);
    return { dailyTimer: t1, petTimer: t2 };
}

module.exports = {
    startReminderSchedules,
    runDailyReminderCheck,
    runPetHungryCheck,
    PET_HUNGER_THRESHOLD,
    PET_DM_COOLDOWN_MS,
    DAILY_INTERVAL_MS,
    PET_INTERVAL_MS
};
