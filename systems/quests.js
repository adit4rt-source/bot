// systems/quests.js
const { EmbedBuilder } = require('discord.js');
const { db, getOrCreateUser, getSetting, getConf, getUserStat, incrementUserStat, addItem } = require('../database');
const { checkAchievements } = require('./achievements');
const { getRandomInt } = require('../utils');

const poolKata = ["kopi hitam", "bot super", "hari ini cerah", "push rank bang", "mabar yuk", "ikan terbang", "nasi padang", "sate madura", "es campur", "bakso urat"];
const poolTebakan = [{q: "Benda apa yang kalau ditutup jadi tongkat, kalau dibuka jadi tenda?", a: "payung"}, {q: "Hewan apa yang bersaudara?", a: "katak beradik"}];

// ================= QUEST TYPE DEFINITIONS =================
const QUEST_POOL = [
    // Original types
    { type: 'tag', descFn: () => '🏷️ Tag/Mention seseorang di channel chat', targetRange: { easy: [1,1], medium: [2,3], hard: [4,5] } },
    { type: 'typing', descFn: (q) => `⌨️ Ketik kalimat ini di chat: **"${q.text}"**`, targetRange: { easy: [1,1], medium: [1,1], hard: [1,1] } },
    { type: 'voice', descFn: (q) => `🎙️ Join voice channel selama ${q.target} menit`, targetRange: { easy: [3,5], medium: [5,10], hard: [10,15] } },
    { type: 'reaction', descFn: (q) => `👍 Berikan ${q.target} reaction ke pesan orang`, targetRange: { easy: [3,5], medium: [5,8], hard: [8,12] } },
    { type: 'tebak', descFn: (q) => `🧠 Jawab tebakan ini di chat:\n*"${q.question}"*`, targetRange: { easy: [1,1], medium: [1,1], hard: [1,1] } },
    // New quest types
    { type: 'fish', descFn: (q) => `🎣 Tangkap ${q.target} ikan`, targetRange: { easy: [3,4], medium: [5,6], hard: [7,8] } },
    { type: 'farm_harvest', descFn: (q) => `🌾 Panen ${q.target} tanaman`, targetRange: { easy: [2,2], medium: [3,4], hard: [4,5] } },
    { type: 'dungeon', descFn: (q) => `🏰 Clear ${q.target} dungeon`, targetRange: { easy: [1,1], medium: [2,2], hard: [2,3] } },
    { type: 'slot', descFn: (q) => `🎰 Main slot ${q.target} kali`, targetRange: { easy: [3,3], medium: [4,4], hard: [4,5] } },
    { type: 'pet_play', descFn: (q) => `🎾 Bermain dengan pet ${q.target} kali`, targetRange: { easy: [2,2], medium: [3,3], hard: [3,4] } },
    { type: 'spend_money', descFn: (q) => `🛒 Belanjakan ${q.target} money di shop`, targetRange: { easy: [200,300], medium: [400,600], hard: [700,1000] } },
    { type: 'trade', descFn: () => `🔄 Trade dengan player lain`, targetRange: { easy: [1,1], medium: [1,1], hard: [1,1] } },
    { type: 'coinflip', descFn: (q) => `🪙 Main coinflip ${q.target} kali`, targetRange: { easy: [2,2], medium: [3,4], hard: [4,5] } },
    { type: 'battle', descFn: (q) => `⚔️ Lawan player di PvP ${q.target > 1 ? q.target + ' kali' : ''}`, targetRange: { easy: [1,1], medium: [1,2], hard: [2,2] } },
    { type: 'craft', descFn: (q) => `🧪 Craft ${q.target} produk farming`, targetRange: { easy: [1,1], medium: [2,2], hard: [2,3] } },
];

// ================= DIFFICULTY TIERS =================
const DIFFICULTY_TIERS = {
    easy: { stars: '⭐', label: 'Easy', rewardRange: [150, 300] },
    medium: { stars: '⭐⭐', label: 'Medium', rewardRange: [300, 600] },
    hard: { stars: '⭐⭐⭐', label: 'Hard', rewardRange: [600, 1200] },
};

// ================= WEEKLY QUEST TABLE =================
db.exec(`CREATE TABLE IF NOT EXISTS weekly_quests (guildId TEXT, userId TEXT, week TEXT, data TEXT, PRIMARY KEY(guildId, userId, week))`);

// ================= QUEST GENERATION =================
function generateQuestByDifficulty(difficulty) {
    // Pick a random quest type from the pool
    const pool = QUEST_POOL.filter(q => q.type !== 'tebak' || difficulty === 'easy'); // tebak only easy
    const questDef = pool[Math.floor(Math.random() * pool.length)];
    const tier = DIFFICULTY_TIERS[difficulty];
    const range = questDef.targetRange[difficulty];
    const target = getRandomInt(range[0], range[1]);
    const reward = getRandomInt(tier.rewardRange[0], tier.rewardRange[1]);

    let quest = { type: questDef.type, target, reward, progress: 0, claimed: false, difficulty };

    // Add extra data for specific types
    if (questDef.type === 'typing') {
        const kata = poolKata[Math.floor(Math.random() * poolKata.length)];
        quest.text = kata;
        quest.desc = `⌨️ Ketik kalimat ini di chat: **"${kata}"**`;
    } else if (questDef.type === 'tebak') {
        const t = poolTebakan[Math.floor(Math.random() * poolTebakan.length)];
        quest.question = t.q;
        quest.answer = t.a;
        quest.desc = `🧠 Jawab tebakan ini di chat:\n*"${t.q}"*`;
    } else {
        quest.desc = questDef.descFn(quest);
    }

    return quest;
}

function generateDailyQuests() {
    // Generate 1 Easy + 1 Medium + 1 Hard
    const difficulties = ['easy', 'medium', 'hard'];
    const quests = [];
    const usedTypes = new Set();

    for (const diff of difficulties) {
        let attempts = 0;
        let quest;
        do {
            quest = generateQuestByDifficulty(diff);
            attempts++;
        } while (usedTypes.has(quest.type) && attempts < 20);
        usedTypes.add(quest.type);
        quests.push(quest);
    }

    return quests;
}

// ================= WEEKLY QUEST GENERATION =================
function getWeekId() {
    // Get ISO week string based on WIB timezone (UTC+7)
    const now = new Date();
    const wib = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    const jan1 = new Date(wib.getFullYear(), 0, 1);
    const days = Math.floor((wib - jan1) / 86400000);
    const weekNum = Math.ceil((days + jan1.getDay() + 1) / 7);
    return `${wib.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function generateWeeklyQuests() {
    const quests = [];
    const usedTypes = new Set();
    // Weekly quests are harder: 3-5x daily targets, reward 500-2000
    const weeklyPool = QUEST_POOL.filter(q => !['typing', 'tebak', 'trade'].includes(q.type));

    for (let i = 0; i < 3; i++) {
        let questDef;
        let attempts = 0;
        do {
            questDef = weeklyPool[Math.floor(Math.random() * weeklyPool.length)];
            attempts++;
        } while (usedTypes.has(questDef.type) && attempts < 20);
        usedTypes.add(questDef.type);

        // Use hard range * 3-5x multiplier
        const hardRange = questDef.targetRange.hard;
        const multiplier = getRandomInt(3, 5);
        const target = getRandomInt(hardRange[0] * multiplier, hardRange[1] * multiplier);
        const reward = getRandomInt(1500, 6000);

        let quest = { type: questDef.type, target, reward, progress: 0, claimed: false, difficulty: 'weekly' };
        quest.desc = questDef.descFn(quest);

        quests.push(quest);
    }

    return quests;
}

function getOrCreateWeeklyQuests(guildId, userId) {
    const week = getWeekId();
    let row = db.prepare('SELECT * FROM weekly_quests WHERE guildId = ? AND userId = ? AND week = ?').get(guildId, userId, week);
    if (!row) {
        const quests = generateWeeklyQuests();
        db.prepare('INSERT OR REPLACE INTO weekly_quests (guildId, userId, week, data) VALUES (?, ?, ?, ?)').run(guildId, userId, week, JSON.stringify(quests));
        return quests;
    }
    return JSON.parse(row.data);
}

// ================= QUEST PROGRESS UPDATE =================
function updateQuestProgress(guildId, userId, questType, amount = 1, payload = null) {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    let row = db.prepare('SELECT * FROM daily_quests WHERE guildId = ? AND userId = ?').get(guildId, userId);
    let quests = (!row || row.date !== today) ? generateDailyQuests() : JSON.parse(row.data);
    if (!row || row.date !== today) db.prepare('INSERT OR REPLACE INTO daily_quests (guildId, userId, date, data) VALUES (?, ?, ?, ?)').run(guildId, userId, today, JSON.stringify(quests));
    let updated = false;
    for (let q of quests) {
        if (q.type === questType && q.progress < q.target && !q.claimed) {
            let valid = true;
            if (questType === 'typing' && (!payload || !payload.toLowerCase().includes(q.text.toLowerCase()))) valid = false;
            if (questType === 'tebak' && (!payload || !payload.toLowerCase().includes(q.answer.toLowerCase()))) valid = false;
            if (valid) { q.progress += amount; if (q.progress > q.target) q.progress = q.target; updated = true; }
        }
    }
    if (updated) db.prepare('UPDATE daily_quests SET data = ? WHERE guildId = ? AND userId = ?').run(JSON.stringify(quests), guildId, userId);

    // Also update weekly quests
    updateWeeklyQuestProgress(guildId, userId, questType, amount, payload);
}

function updateWeeklyQuestProgress(guildId, userId, questType, amount = 1, payload = null) {
    const week = getWeekId();
    let row = db.prepare('SELECT * FROM weekly_quests WHERE guildId = ? AND userId = ? AND week = ?').get(guildId, userId, week);
    if (!row) {
        const quests = generateWeeklyQuests();
        db.prepare('INSERT OR REPLACE INTO weekly_quests (guildId, userId, week, data) VALUES (?, ?, ?, ?)').run(guildId, userId, week, JSON.stringify(quests));
        row = { data: JSON.stringify(quests) };
    }
    let quests = JSON.parse(row.data);
    let updated = false;
    for (let q of quests) {
        if (q.type === questType && q.progress < q.target && !q.claimed) {
            let valid = true;
            if (questType === 'typing' && (!payload || !payload.toLowerCase().includes(q.text || ''))) valid = false;
            if (questType === 'tebak' && (!payload || !payload.toLowerCase().includes(q.answer || ''))) valid = false;
            if (valid) { q.progress += amount; if (q.progress > q.target) q.progress = q.target; updated = true; }
        }
    }
    if (updated) db.prepare('UPDATE weekly_quests SET data = ? WHERE guildId = ? AND userId = ? AND week = ?').run(JSON.stringify(quests), guildId, userId, week);
}

// ================= QUEST STREAK BONUS =================
function checkDailyQuestStreak(guildId, userId) {
    // Check if all 3 daily quests are claimed → give bonus
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const row = db.prepare('SELECT * FROM daily_quests WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!row || row.date !== today) return null;
    const quests = JSON.parse(row.data);
    if (!quests.every(q => q.claimed)) return null;

    // Check if bonus already given today
    const bonusKey = `quest_bonus_${today}`;
    const alreadyGiven = getUserStat(guildId, userId, bonusKey);
    if (alreadyGiven) return null;

    // Give bonus 200 money
    db.prepare('UPDATE users SET balance = balance + 200 WHERE guildId = ? AND userId = ?').run(guildId, userId);
    incrementUserStat(guildId, userId, bonusKey, 1);

    // Track perfect days
    const perfectDays = incrementUserStat(guildId, userId, 'quest_perfect_days', 1);

    // Check consecutive perfect days for 7-day bonus
    const consecutiveDays = incrementUserStat(guildId, userId, 'quest_consecutive_perfect', 1);

    let weeklyBonus = false;
    if (consecutiveDays >= 7) {
        // Reset consecutive counter
        db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, 'quest_consecutive_perfect', 0);
        // Give 1000 money + 1 mystery_box
        db.prepare('UPDATE users SET balance = balance + 1000 WHERE guildId = ? AND userId = ?').run(guildId, userId);
        addItem(guildId, userId, 'mystery_box', 1);
        weeklyBonus = true;
    }

    return { bonus: 200, perfectDays, consecutiveDays, weeklyBonus };
}

function resetConsecutivePerfect(guildId, userId) {
    // Called when a day passes without completing all quests
    // We track this by checking if yesterday was a perfect day
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const bonusKey = `quest_bonus_${yesterday}`;
    const hadPerfectYesterday = getUserStat(guildId, userId, bonusKey);
    if (!hadPerfectYesterday) {
        // Reset consecutive counter
        db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, 'quest_consecutive_perfect', 0);
    }
}

// ================= STREAK SYSTEM (existing) =================
async function checkAndUpdateStreak(message) {
    const member = message.member;
    if (member.user.bot || getSetting(member.guild.id, 'streak_enabled', 'true') === 'false') return false;
    const guildId = member.guild.id, userId = member.id, today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    let streakData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId), streakActivatedToday = false;

    if (!streakData) {
        db.prepare('INSERT INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, 1, ?)').run(guildId, userId, today);
        streakData = { count: 1, last_date: today }; streakActivatedToday = true;
    } else if (streakData.last_date !== today) {
        const diffDays = Math.floor((new Date(today) - new Date(streakData.last_date)) / 86400000);
        if (diffDays === 1) streakData.count += 1;
        else { if (streakData.count > 1) db.prepare('INSERT OR REPLACE INTO streak_history (guildId, userId, lost_count) VALUES (?, ?, ?)').run(guildId, userId, streakData.count); streakData.count = 1; }
        db.prepare('UPDATE streaks SET count = ?, last_date = ? WHERE guildId = ? AND userId = ?').run(streakData.count, today, guildId, userId);
        streakActivatedToday = true;
    }

    if (getSetting(guildId, 'streak_auto_nick', 'true') === 'true' && member.manageable) {
        const minStreak = parseInt(getSetting(guildId, 'streak_min', '3')), emoji = getSetting(guildId, 'streak_emoji', '🔥');
        const baseNick = (member.nickname || member.user.username).split(` ${emoji} `)[0];
        const newNick = streakData.count >= minStreak ? `${baseNick} ${emoji} ${streakData.count}` : baseNick;
        if ((member.nickname || member.user.username) !== newNick && newNick.length <= 32) await member.setNickname(newNick).catch(() => {});
    }

    if (streakActivatedToday) {
        // Reset consecutive perfect if yesterday wasn't perfect
        resetConsecutivePerfect(guildId, userId);
        await checkAchievements(member.guild, userId, { type: 'streak' });
        const streakChannelId = getSetting(guildId, 'streak_channel', null);
        if (streakChannelId && streakData.count > 1) {
            const streakCh = member.guild.channels.cache.get(streakChannelId);
            if (streakCh) {
                const streakEmoji = getSetting(guildId, 'streak_emoji', '🔥');
                streakCh.send({ embeds: [new EmbedBuilder().setColor('#FF4500').setDescription(`${streakEmoji} <@${userId}> mengaktifkan streak hari ke-**${streakData.count}**!`).setTimestamp()] }).catch(() => {});
            }
        }
    }
    return streakActivatedToday;
}

async function addXpAndMoney(member, type, multiplier = 1) {
    const guildId = member.guild.id, user = getOrCreateUser(guildId, member.id);
    let defaultMin = 15, defaultMax = 25;
    if (type === 'voice') { defaultMin = 60; defaultMax = 120; }
    if (type === 'reaction') { defaultMin = 50; defaultMax = 100; }
    const gainedXp = (Math.floor(Math.random() * (getConf(guildId, `${type}_max_xp`, defaultMax) - getConf(guildId, `${type}_min_xp`, defaultMin) + 1)) + getConf(guildId, `${type}_min_xp`, defaultMin)) * multiplier;
    user.xp += gainedXp; user.balance += Math.floor(gainedXp / 2);

    if (user.xp >= (user.level + 1) * 100) {
        user.level += 1; user.xp = 0;
        const reward = db.prepare('SELECT * FROM rewards WHERE guildId = ? AND level = ?').get(guildId, user.level);
        let teksHadiah = "";
        if (reward) {
            let dapatRole = false, dapatUang = false;
            if (reward.roleId) { const role = member.guild.roles.cache.get(reward.roleId); if (role) { await member.roles.add(role).catch(() => {}); teksHadiah += ` Role <@&${reward.roleId}>`; dapatRole = true; } }
            if (reward.money > 0) { user.balance += reward.money; teksHadiah += `${dapatRole ? ' dan' : ''} 🪙 **${reward.money.toLocaleString('id-ID')} Money**`; dapatUang = true; }
            if (dapatRole || dapatUang) teksHadiah = `\n🎁 **Hadiah Bonus:** Kamu mendapatkan${teksHadiah}!`;
        }
        db.prepare('UPDATE users SET xp = ?, level = ?, balance = ?, lastDaily = ? WHERE guildId = ? AND userId = ?').run(user.xp, user.level, user.balance, user.lastDaily, guildId, member.id);
        const levelChannelId = getSetting(guildId, 'level_channel', null);
        const channel = levelChannelId ? member.guild.channels.cache.get(levelChannelId) : (member.guild.systemChannel || member.guild.channels.cache.filter(c => c.isTextBased()).first());
        if (channel) channel.send(`🎉 **LEVEL UP!** <@${member.id}> telah mencapai **Level ${user.level}**!${teksHadiah}`);
        await checkAchievements(member.guild, member.id, { type: 'level' });
    } else {
        db.prepare('UPDATE users SET xp = ?, level = ?, balance = ?, lastDaily = ? WHERE guildId = ? AND userId = ?').run(user.xp, user.level, user.balance, user.lastDaily, guildId, member.id);
    }
    await checkAchievements(member.guild, member.id, { type: 'balance' });
}

module.exports = { updateQuestProgress, updateWeeklyQuestProgress, generateDailyQuests, generateWeeklyQuests, getOrCreateWeeklyQuests, getWeekId, checkDailyQuestStreak, checkAndUpdateStreak, addXpAndMoney, getRandomInt, poolKata, poolTebakan, DIFFICULTY_TIERS };
