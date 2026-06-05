// systems/reminders.js - Automatic DM reminders (daily reward + hungry pet + more)
// Runs on timers, independent of chat, with per-user dedup so users aren't spammed.
const { db, getUserStat, setUserStat, getUsersForDailyReminder, getActivePetsHungry } = require('../database');
const { notifyDailyReady, notifyPetHungry, notifyFarmReady, sendNotification } = require('./notifications');

let log = () => {};
try { ({ log } = require('./logger')); } catch (e) { /* logger optional */ }

const DAILY_INTERVAL_MS = 60 * 60 * 1000;   // check hourly
const PET_INTERVAL_MS = 10 * 60 * 1000;     // check every 10 minutes
const EXPEDITION_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes
const QUEST_CHECK_INTERVAL_MS = 60 * 60 * 1000; // check hourly
const STREAK_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000; // check every 2 hours
const FARM_CHECK_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes
const ABILITY_TICK_INTERVAL_MS = 7 * 60 * 1000; // check every 7 minutes (for auto-fish timing)

const PET_DM_COOLDOWN_MS = 6 * 60 * 60 * 1000; // at most one hungry-pet DM / 6h / user
const PET_HUNGER_THRESHOLD = 15;            // DM when hunger at/below this (or sick)
const STARTUP_DELAY_MS = 45 * 1000;

function wibDate(offsetDays = 0) {
    return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

function wibHour() {
    return new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false });
}

// ---- Daily reward reminder ----
async function runDailyReminderCheck(client) {
    try {
        const today = wibDate(0);
        const cutoff = wibDate(-2);
        const todayInt = parseInt(today.replace(/-/g, ''), 10);
        const rows = getUsersForDailyReminder(today, cutoff);

        for (const { guildId, userId } of rows) {
            try {
                if (getUserStat(guildId, userId, 'daily_dm_ymd') === todayInt) continue;
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
                if (last && now - last < PET_DM_COOLDOWN_MS) continue;
                setUserStat(pet.guildId, pet.userId, 'pet_hungry_dm_at', now);
                await notifyPetHungry(client, pet.guildId, pet.userId, pet.name, pet.hunger).catch(() => {});
            } catch (e) { log('ERROR', `petHungry failed for ${pet.guildId}/${pet.userId}`, e); }
        }
    } catch (e) {
        log('ERROR', 'petHungry check failed', e);
    }
}

// ---- Expedition complete reminder ----
async function runExpeditionCheck(client) {
    try {
        const now = Date.now();
        const completed = db.prepare("SELECT * FROM expeditions WHERE status = 'active' AND endsAt <= ?").all(now);

        for (const exp of completed) {
            try {
                const dmKey = `exp_done_dm_${exp.id}`;
                const alreadyNotified = getUserStat(exp.guildId, exp.userId, dmKey);
                if (alreadyNotified) continue;
                setUserStat(exp.guildId, exp.userId, dmKey, 1);

                await sendNotification(client, exp.guildId, exp.userId, 'pet',
                    `🌊 **Ekspedisi Selesai!**\n\n` +
                    `Pet kamu sudah kembali dari ekspedisi!\n` +
                    `> 📍 Zona: **${exp.zoneId}**\n\n` +
                    `Gunakan \`/expedition\` atau \`/pet\` → 🌊 Expedition untuk klaim reward! 🎁`
                ).catch(() => {});
            } catch (e) { log('ERROR', `expeditionReminder failed for ${exp.userId}`, e); }
        }
    } catch (e) {
        log('ERROR', 'expeditionReminder check failed', e);
    }
}

// ---- Quest incomplete reminder (at 20:00 WIB) ----
async function runQuestReminderCheck(client) {
    try {
        const hour = parseInt(wibHour());
        // Only remind at 20:00 (8 PM WIB) — give players time to complete
        if (hour !== 20) return;

        const today = wibDate(0);
        const todayInt = parseInt(today.replace(/-/g, ''), 10);

        // Get all users who have quests today
        const questRows = db.prepare("SELECT guildId, userId, data FROM daily_quests WHERE date = ?").all(today);

        for (const row of questRows) {
            try {
                const dmKey = `quest_remind_${todayInt}`;
                const alreadyNotified = getUserStat(row.guildId, row.userId, dmKey);
                if (alreadyNotified) continue;

                // Parse quest data to check if any incomplete
                let quests;
                try { quests = JSON.parse(row.data); } catch (e) { continue; }
                const incomplete = quests.filter(q => q.progress < q.target);
                if (incomplete.length === 0) continue; // All done!

                setUserStat(row.guildId, row.userId, dmKey, 1);

                await sendNotification(client, row.guildId, row.userId, 'quest',
                    `📜 **Quest Belum Selesai!**\n\n` +
                    `Kamu masih punya **${incomplete.length}** quest yang belum selesai hari ini!\n` +
                    `> ⏰ Reset dalam beberapa jam lagi!\n\n` +
                    incomplete.slice(0, 3).map(q => `> • ${q.desc || q.type} (${q.progress}/${q.target})`).join('\n') +
                    `\n\nSelesaikan sebelum tengah malam! 🔥`
                ).catch(() => {});
            } catch (e) { log('ERROR', `questReminder failed for ${row.userId}`, e); }
        }
    } catch (e) {
        log('ERROR', 'questReminder check failed', e);
    }
}

// ---- Streak at risk reminder (at 21:00 WIB) ----
async function runStreakReminderCheck(client) {
    try {
        const hour = parseInt(wibHour());
        // Only remind at 21:00 (9 PM WIB)
        if (hour !== 21) return;

        const today = wibDate(0);
        const todayInt = parseInt(today.replace(/-/g, ''), 10);

        // Find players with streak > 3 who haven't chatted today
        const atRisk = db.prepare("SELECT guildId, userId, count FROM streaks WHERE count >= 3 AND last_date != ?").all(today);

        for (const row of atRisk) {
            try {
                const dmKey = `streak_remind_${todayInt}`;
                const alreadyNotified = getUserStat(row.guildId, row.userId, dmKey);
                if (alreadyNotified) continue;

                setUserStat(row.guildId, row.userId, dmKey, 1);

                await sendNotification(client, row.guildId, row.userId, 'daily',
                    `🔥 **Streak Terancam!**\n\n` +
                    `Streak kamu **${row.count} hari** belum aman hari ini!\n` +
                    `> ⚠️ Kirim minimal **1 pesan** di server sebelum tengah malam!\n\n` +
                    `Jangan sampai streak-mu putus! 😱\n` +
                    `💡 *Punya Streak Shield? Otomatis aktif jika kamu lupa.*`
                ).catch(() => {});
            } catch (e) { log('ERROR', `streakReminder failed for ${row.userId}`, e); }
        }
    } catch (e) {
        log('ERROR', 'streakReminder check failed', e);
    }
}

// ---- Farm ready reminder ----
// Rules:
// 1. Plot harus status 'growing' (bukan dead/harvested)
// 2. Notified = 0 (belum pernah dikirim DM)
// 3. Crop BENAR-BENAR sudah matang (termasuk fertilizer speedBonus)
// 4. Plot TIDAK layu/mati berdasarkan waktu (dryTime < deadThreshold)
// 5. Hanya kirim 1 DM per user per batch (grouping semua tanaman siap)
// 6. Cooldown per-user 12 jam — tidak bisa spam walau ada banyak plot
async function runFarmReadyCheck(client) {
    try {
        const now = Date.now();
        const FARM_DM_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 jam cooldown per user

        // Hanya cek plot yang: growing, belum dinotif, ada data
        const plots = db.prepare(
            "SELECT * FROM farm_plots WHERE status = 'growing' AND notified = 0"
        ).all();

        let FARM_CROPS, FARM_FERTILIZERS;
        try {
            ({ FARM_CROPS, FARM_FERTILIZERS } = require('../data/farming'));
        } catch (e) { return; }

        // Kelompokkan plot siap panen per user
        const readyByUser = {};

        for (const plot of plots) {
            try {
                const crop = FARM_CROPS.find(c => c.id === plot.cropId);
                if (!crop) {
                    // Plot tidak valid, mark notified supaya tidak loop terus
                    db.prepare('UPDATE farm_plots SET notified = 1 WHERE id = ?').run(plot.id);
                    continue;
                }

                // Hitung waktu tumbuh dengan fertilizer
                const fert = (FARM_FERTILIZERS || []).find(f => f.id === plot.fertilizer);
                const speedBonus = fert ? (fert.speedBonus || 0) : 0;
                const growTimeMs = crop.time * (1 - speedBonus) * 60 * 1000;
                const readyAt = plot.plantedAt + growTimeMs;

                // Belum matang → skip
                if (now < readyAt) continue;

                // Cek apakah sudah mati (dryTime > 2.5x growTime)
                const dryTime = now - (plot.wateredAt || plot.plantedAt);
                const deadThreshold = growTimeMs * 2.5;
                if (dryTime > deadThreshold) {
                    // Sudah mati, tandai notified agar tidak dikirim DM
                    db.prepare("UPDATE farm_plots SET notified = 1, status = 'dead' WHERE id = ?").run(plot.id);
                    continue;
                }

                // Plot ini siap panen dan masih hidup → kumpulkan per user
                const key = `${plot.guildId}_${plot.userId}`;
                if (!readyByUser[key]) {
                    readyByUser[key] = { guildId: plot.guildId, userId: plot.userId, crops: [], plotIds: [] };
                }
                readyByUser[key].crops.push(crop.name);
                readyByUser[key].plotIds.push(plot.id);

            } catch (e) { log('ERROR', `farmReady plot check failed for plot ${plot.id}`, e); }
        }

        // Kirim 1 DM per user (semua tanaman siap digabung)
        for (const [key, data] of Object.entries(readyByUser)) {
            try {
                // Cek cooldown per user (12 jam)
                const lastDm = getUserStat(data.guildId, data.userId, 'farm_ready_dm_at');
                if (lastDm && (now - lastDm) < FARM_DM_COOLDOWN_MS) {
                    // Masih dalam cooldown, tapi tandai notified supaya tidak re-check
                    for (const plotId of data.plotIds) {
                        db.prepare('UPDATE farm_plots SET notified = 1 WHERE id = ?').run(plotId);
                    }
                    continue;
                }

                // Tandai semua plot sebagai sudah dinotif
                for (const plotId of data.plotIds) {
                    db.prepare('UPDATE farm_plots SET notified = 1 WHERE id = ?').run(plotId);
                }

                // Catat waktu DM terakhir
                setUserStat(data.guildId, data.userId, 'farm_ready_dm_at', now);

                // Buat daftar tanaman unik
                const uniqueCrops = [...new Set(data.crops)];
                const cropList = uniqueCrops.slice(0, 5).join(', ');
                const extraCount = data.crops.length - uniqueCrops.slice(0, 5).length;

                await sendNotification(client, data.guildId, data.userId, 'farm',
                    `🌾 **Siap Panen!**\n\n` +
                    `**${data.crops.length}** tanaman kamu sudah siap dipanen!\n` +
                    `> 🌱 ${cropList}${extraCount > 0 ? ` +${extraCount} lainnya` : ''}\n\n` +
                    `Gunakan \`/farm\` → 🌾 Harvest untuk memanen.\n` +
                    `> ⚠️ *Siram jika layu agar tidak mati!*`
                ).catch(() => {});

            } catch (e) { log('ERROR', `farmReady DM failed for ${data.userId}`, e); }
        }
    } catch (e) {
        log('ERROR', 'farmReady check failed', e);
    }
}

// ---- World Boss available reminder (Monday 08:00 WIB) ----
async function runWorldBossReminderCheck(client) {
    try {
        const now = new Date();
        const wib = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
        const dayOfWeek = wib.getDay(); // 0=Sun, 1=Mon
        const hour = wib.getHours();

        // Only on Monday at 8 AM WIB
        if (dayOfWeek !== 1 || hour !== 8) return;

        const today = wibDate(0);
        const todayInt = parseInt(today.replace(/-/g, ''), 10);

        // Get all active users from last week
        const recentUsers = db.prepare("SELECT DISTINCT guildId, userId FROM users WHERE lastDaily IS NOT NULL").all();

        for (const { guildId, userId } of recentUsers.slice(0, 100)) { // Limit to prevent spam
            try {
                const dmKey = `wb_remind_${todayInt}`;
                const alreadyNotified = getUserStat(guildId, userId, dmKey);
                if (alreadyNotified) continue;

                setUserStat(guildId, userId, dmKey, 1);

                await sendNotification(client, guildId, userId, 'pet',
                    `🗺️ **World Boss Baru!**\n\n` +
                    `Boss mingguan baru telah muncul! 💀\n` +
                    `> Serang bersama player lain untuk hadiah besar!\n\n` +
                    `Gunakan \`/worldboss\` untuk mulai menyerang! ⚔️`
                ).catch(() => {});
            } catch (e) { /* skip */ }
        }
    } catch (e) {
        log('ERROR', 'worldBossReminder check failed', e);
    }
}

// ---- Pet Abilities Tick (passive income, auto-fish, auto-water) ----
async function runAbilityTickAll(client) {
    try {
        const { runAbilityTick } = require('./petAbilities');
        // Get all users with active pets that have abilities equipped
        const users = db.prepare("SELECT DISTINCT guildId, userId FROM pet_abilities WHERE slot1 IS NOT NULL OR slot2 IS NOT NULL OR slot3 IS NOT NULL").all();
        for (const { guildId, userId } of users) {
            try {
                runAbilityTick(client, guildId, userId);
            } catch (e) { /* skip individual failures */ }
        }
    } catch (e) {
        log('ERROR', 'abilityTick check failed', e);
    }
}

// ---- Farm Pest Tick (random hama attack every 30 min) ----
async function runPestTick() {
    try {
        const { rollPestAttack, applyPest, getActivePests } = require('./farmWeather');
        // Get all users who have active growing plots
        const activeFarmers = db.prepare("SELECT DISTINCT guildId, userId FROM farm_plots WHERE status = 'growing'").all();

        for (const { guildId, userId } of activeFarmers) {
            try {
                const currentPests = getActivePests(guildId, userId);
                if (currentPests.length >= 5) continue; // Already at max pests

                // Get their plots
                const plots = db.prepare("SELECT id FROM farm_plots WHERE guildId = ? AND userId = ? AND status = 'growing'").all(guildId, userId);
                if (plots.length === 0) continue;

                // Roll pest for a random plot
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
    // Startup: bersihkan plot mati/invalid yang masih notified=0 agar tidak spam
    try {
        const { FARM_CROPS } = require('../data/farming');
        const { FARM_FERTILIZERS } = require('../data/farming');
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
    } catch (e) { /* non-critical */ }

    // Initial checks after startup delay
    setTimeout(() => {
        runDailyReminderCheck(client).catch(() => {});
        runPetHungryCheck(client).catch(() => {});
        runExpeditionCheck(client).catch(() => {});
        runFarmReadyCheck(client).catch(() => {});
    }, STARTUP_DELAY_MS);

    // Set up intervals
    const t1 = setInterval(() => { runDailyReminderCheck(client).catch(() => {}); }, DAILY_INTERVAL_MS);
    const t2 = setInterval(() => { runPetHungryCheck(client).catch(() => {}); }, PET_INTERVAL_MS);
    const t3 = setInterval(() => { runExpeditionCheck(client).catch(() => {}); }, EXPEDITION_INTERVAL_MS);
    const t4 = setInterval(() => { runQuestReminderCheck(client).catch(() => {}); }, QUEST_CHECK_INTERVAL_MS);
    const t5 = setInterval(() => { runStreakReminderCheck(client).catch(() => {}); }, STREAK_CHECK_INTERVAL_MS);
    const t6 = setInterval(() => { runFarmReadyCheck(client).catch(() => {}); }, FARM_CHECK_INTERVAL_MS);
    const t7 = setInterval(() => { runWorldBossReminderCheck(client).catch(() => {}); }, 60 * 60 * 1000); // hourly
    const t8 = setInterval(() => { runAbilityTickAll(client).catch(() => {}); }, ABILITY_TICK_INTERVAL_MS);
    const t9 = setInterval(() => { runPestTick().catch(() => {}); }, 30 * 60 * 1000); // every 30 min

    console.log('⏰ Reminder System v2 started (7 reminder types + ability tick + pest tick active)');
    return { dailyTimer: t1, petTimer: t2, expeditionTimer: t3, questTimer: t4, streakTimer: t5, farmTimer: t6, worldBossTimer: t7, abilityTimer: t8 };
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
    PET_HUNGER_THRESHOLD,
    PET_DM_COOLDOWN_MS,
    DAILY_INTERVAL_MS,
    PET_INTERVAL_MS,
    EXPEDITION_INTERVAL_MS
};
