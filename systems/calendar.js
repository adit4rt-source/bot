// systems/calendar.js
const { db } = require('../database');

const CALENDAR_REWARDS = {
    1: { money: 200, desc: '🪙 200 Money' },
    2: { money: 250, desc: '🪙 250 Money' },
    3: { money: 300, item: 'mystery_box', desc: '🪙 300 + 📦 Mystery Box' },
    4: { money: 350, desc: '🪙 350 Money' },
    5: { money: 400, desc: '🪙 400 Money' },
    6: { money: 500, desc: '🪙 500 Money' },
    7: { money: 1000, item: 'lucky_charm', desc: '🪙 1000 + 🍀 Lucky Charm' },
    8: { money: 300, desc: '🪙 300 Money' },
    9: { money: 350, desc: '🪙 350 Money' },
    10: { money: 400, desc: '🪙 400 Money' },
    11: { money: 450, desc: '🪙 450 Money' },
    12: { money: 500, desc: '🪙 500 Money' },
    13: { money: 600, desc: '🪙 600 Money' },
    14: { money: 1500, item: 'xp_booster_2x', desc: '🪙 1500 + ⚡ XP Booster 2x' },
    15: { money: 400, desc: '🪙 400 Money' },
    16: { money: 450, desc: '🪙 450 Money' },
    17: { money: 500, desc: '🪙 500 Money' },
    18: { money: 550, desc: '🪙 550 Money' },
    19: { money: 600, desc: '🪙 600 Money' },
    20: { money: 700, desc: '🪙 700 Money' },
    21: { money: 2000, item: 'streak_shield', desc: '🪙 2000 + 🛡️ Streak Shield' },
    22: { money: 500, desc: '🪙 500 Money' },
    23: { money: 600, desc: '🪙 600 Money' },
    24: { money: 700, desc: '🪙 700 Money' },
    25: { money: 800, desc: '🪙 800 Money' },
    26: { money: 900, desc: '🪙 900 Money' },
    27: { money: 1000, desc: '🪙 1000 Money' },
    28: { money: 3000, item: 'refine_stone', desc: '🪙 3000 + 🪨 Refine Stone' },
    29: { money: 1000, desc: '🪙 1000 Money' },
    30: { money: 5000, item: 'money_magnet', petExp: 50, desc: '🪙 5000 + 🧲 Money Magnet + 50 Pet EXP' },
};

function getLoginCalendar(guildId, userId) {
    const month = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).substring(0, 7);
    let row = db.prepare('SELECT * FROM login_calendar WHERE guildId = ? AND userId = ? AND month = ?').get(guildId, userId, month);
    if (!row) { db.prepare('INSERT INTO login_calendar (guildId, userId, month) VALUES (?, ?, ?)').run(guildId, userId, month); row = { days: '[]', claimed: '[]' }; }
    return { ...row, month };
}

module.exports = { CALENDAR_REWARDS, getLoginCalendar };
