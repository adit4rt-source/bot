// systems/dailyReward.js — Escalating daily login-streak rewards.
//
// Unlike the old inline handler (which scaled off the CHAT streak), this tracks a
// dedicated *daily-claim* streak (user_stats key `daily_streak`) that grows only when
// a user claims /daily on consecutive days — a true "login streak". Rewards escalate
// with the streak, milestone days pay big jackpots + items, and a `streak_shield`
// item is auto-consumed to forgive a single missed day.
//
// The compute helpers are pure (no DB) so they can be unit-tested in isolation.
const { db, getOrCreateUser, getUserStat, setUserStat, incrementUserStat, addItem, getItemCount, addIncome } = require('../database');

// ==================== DATE HELPERS ====================
// Compare calendar dates expressed as 'YYYY-MM-DD' strings. We parse them as UTC
// midnight so DST / timezone never shifts the day-count.
function dayNumber(dateStr) {
    if (!dateStr) return null;
    const t = Date.parse(`${dateStr}T00:00:00Z`);
    return Number.isFinite(t) ? Math.floor(t / 86400000) : null;
}

function dayDiff(fromStr, toStr) {
    const a = dayNumber(fromStr), b = dayNumber(toStr);
    if (a === null || b === null) return null;
    return b - a;
}

// ==================== PURE: STREAK PROGRESSION ====================
/**
 * Determine the new daily-claim streak.
 * @param {number} prevStreak previous daily_streak value
 * @param {string|null} lastDaily last claim date 'YYYY-MM-DD'
 * @param {string} today today's date 'YYYY-MM-DD'
 * @param {boolean} hasShield whether the user owns a streak_shield (forgives 1 gap)
 * @returns {{streak:number, shieldUsed:boolean, reset:boolean, alreadyClaimed:boolean}}
 */
function computeDailyStreak(prevStreak, lastDaily, today, hasShield = false) {
    prevStreak = Math.max(0, Math.floor(Number(prevStreak) || 0));
    if (!lastDaily) return { streak: 1, shieldUsed: false, reset: true, alreadyClaimed: false };

    const diff = dayDiff(lastDaily, today);
    if (diff === null) return { streak: 1, shieldUsed: false, reset: true, alreadyClaimed: false };
    if (diff <= 0) return { streak: prevStreak || 1, shieldUsed: false, reset: false, alreadyClaimed: true };
    if (diff === 1) return { streak: prevStreak + 1, shieldUsed: false, reset: false, alreadyClaimed: false };
    if (diff === 2 && hasShield) return { streak: prevStreak + 1, shieldUsed: true, reset: false, alreadyClaimed: false };
    return { streak: 1, shieldUsed: false, reset: true, alreadyClaimed: false };
}

// ==================== PURE: REWARD CURVE ====================
// Exact-day jackpots layered on top of the base escalation + recurring weekly bonus.
const MILESTONES = {
    14:  { money: 2000,  items: [{ id: 'xp_booster_2x', qty: 1 }],                                 label: '2 Minggu Beruntun!' },
    30:  { money: 5000,  items: [{ id: 'lucky_charm', qty: 1 }, { id: 'daily_doubler', qty: 1 }],  label: '30 Hari Beruntun!' },
    60:  { money: 12000, items: [{ id: 'money_magnet', qty: 1 }],                                   label: '60 Hari — Dewa Login!' },
    100: { money: 30000, items: [{ id: 'streak_shield', qty: 2 }, { id: 'xp_booster_3x', qty: 1 }], label: '100 HARI — LEGENDA!' },
};

const BASE = 500;
const PER_DAY = 100;     // +100 money per consecutive day
const CAP_DAYS = 60;     // escalation caps at day 60
const WEEKLY_BONUS = 1000;

function baseMoneyFor(streak) {
    const s = Math.max(1, Math.floor(streak));
    return BASE + Math.min(s - 1, CAP_DAYS) * PER_DAY;
}

/**
 * Compute the reward for a given streak. Pure — no DB, no randomness.
 * @returns {{money:number, baseMoney:number, petExp:number, items:Array, milestoneLabel:string|null, isWeeklyBonus:boolean, nextMoney:number}}
 */
function computeDailyReward(streak, opts = {}) {
    streak = Math.max(1, Math.floor(Number(streak) || 1));
    const hasDoubler = !!opts.hasDoubler;

    let money = baseMoneyFor(streak);
    const petExp = 10 + Math.min(Math.floor(streak / 7) * 5, 40);
    const items = [];
    let milestoneLabel = null;

    // Recurring weekly bonus on every 7th consecutive day.
    const isWeeklyBonus = streak % 7 === 0;
    if (isWeeklyBonus) {
        money += WEEKLY_BONUS;
        items.push({ id: 'mystery_box', qty: 1 });
        milestoneLabel = 'Bonus Mingguan';
    }

    // Special exact-day jackpots (take label priority, stack on top).
    if (MILESTONES[streak]) {
        money += MILESTONES[streak].money;
        for (const it of MILESTONES[streak].items) items.push(it);
        milestoneLabel = MILESTONES[streak].label;
    }

    if (hasDoubler) money *= 2;

    // Preview of tomorrow's base + any scheduled bonus (no doubler/random).
    const next = streak + 1;
    let nextMoney = baseMoneyFor(next);
    if (next % 7 === 0) nextMoney += WEEKLY_BONUS;
    if (MILESTONES[next]) nextMoney += MILESTONES[next].money;

    return { money, baseMoney: baseMoneyFor(streak), petExp, items, milestoneLabel, isWeeklyBonus, nextMoney };
}

// ==================== DB: FULL CLAIM ====================
/**
 * Perform a full /daily claim. Caller should already know it's a new day, but this
 * re-checks (returns {alreadyClaimed:true}) to stay safe under races.
 * @returns full result object used to build the reply embed.
 */
function claimDaily(guildId, userId, opts = {}) {
    const today = opts.today || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const user = getOrCreateUser(guildId, userId);

    if (user.lastDaily === today) {
        return { alreadyClaimed: true };
    }

    const prevStreak = getUserStat(guildId, userId, 'daily_streak') || 0;
    const hasShield = getItemCount(guildId, userId, 'streak_shield') > 0;
    const prog = computeDailyStreak(prevStreak, user.lastDaily, today, hasShield);
    const streak = prog.streak;

    // Consume the shield if it saved the streak.
    if (prog.shieldUsed) {
        try { addItem(guildId, userId, 'streak_shield', -1); } catch (_) {}
    }

    const hasDoubler = getUserStat(guildId, userId, 'daily_doubler_active') > 0;
    const reward = computeDailyReward(streak, { hasDoubler });
    if (hasDoubler) incrementUserStat(guildId, userId, 'daily_doubler_active', -1);

    // Random surprise bonus (kept from the original handler).
    let randomMoney = 0, randomItem = null, randomPetExp = 0;
    const roll = Math.random();
    if (roll < 0.15) {
        const pool = ['mystery_box', 'lucky_charm', 'xp_booster_2x'];
        randomItem = pool[Math.floor(Math.random() * pool.length)];
    } else if (roll < 0.35) {
        randomMoney = Math.floor(Math.random() * 401) + 100; // 100..500
    } else if (roll < 0.50) {
        randomPetExp = 15;
    }

    const totalMoney = reward.money + randomMoney;
    const totalPetExp = reward.petExp + randomPetExp;

    // ----- Persist -----
    db.prepare('UPDATE users SET balance = balance + ?, lastDaily = ? WHERE guildId = ? AND userId = ?').run(totalMoney, today, guildId, userId);
    setUserStat(guildId, userId, 'daily_streak', streak);
    try { incrementUserStat(guildId, userId, 'total_dailies'); } catch (_) {}
    try { addIncome(guildId, userId, 'daily', totalMoney); } catch (_) {}

    for (const it of reward.items) {
        try { addItem(guildId, userId, it.id, it.qty); } catch (_) {}
    }
    if (randomItem) { try { addItem(guildId, userId, randomItem, 1); } catch (_) {} }

    // Bonus XP (matches old +15).
    try { db.prepare('UPDATE users SET xp = xp + 15 WHERE guildId = ? AND userId = ?').run(guildId, userId); } catch (_) {}

    // Pet exp via pets module (best-effort).
    try { require('./pets').addPetExp(guildId, userId, totalPetExp); } catch (_) {}

    return {
        alreadyClaimed: false,
        streak,
        prevStreak,
        shieldUsed: prog.shieldUsed,
        reset: prog.reset,
        money: totalMoney,
        baseMoney: reward.baseMoney,
        petExp: totalPetExp,
        xp: 15,
        items: reward.items,
        randomItem,
        randomMoney,
        randomPetExp,
        milestoneLabel: reward.milestoneLabel,
        isWeeklyBonus: reward.isWeeklyBonus,
        hasDoubler,
        nextMoney: reward.nextMoney,
        today,
    };
}

module.exports = {
    computeDailyStreak,
    computeDailyReward,
    claimDaily,
    baseMoneyFor,
    MILESTONES,
};
