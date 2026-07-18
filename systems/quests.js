// systems/quests.js
const { EmbedBuilder } = require('discord.js');
const { db, getOrCreateUser, getSetting, getConf, getUserStat, incrementUserStat, addItem } = require('../database');
const { checkAchievements } = require('./achievements');
const { getRandomInt } = require('../utils');

const poolKata = ["kopi hitam", "bot super", "hari ini cerah", "push rank bang", "mabar yuk", "ikan terbang", "nasi padang", "sate madura", "es campur", "bakso urat", "selamat pagi", "ngopi dulu", "rajin menabung", "semangat terus", "jangan menyerah", "gas terus bro", "santuy aja", "rebahan dulu", "lapar berat", "ayo gacor", "mancing mania", "panen raya", "naik level", "jackpot besar", "kerja keras"];
const poolTebakan = [
    {q: "Benda apa yang kalau ditutup jadi tongkat, kalau dibuka jadi tenda?", a: "payung"},
    {q: "Hewan apa yang bersaudara?", a: "katak beradik"},
    {q: "Bola apa yang bisa dimakan?", a: "bakso"},
    {q: "Ayam apa yang paling besar?", a: "ayam betina"},
    {q: "Kunci apa yang bisa berenang?", a: "kunci pas"},
    {q: "Buah apa yang punya mahkota tapi bukan raja?", a: "nanas"},
    {q: "Apa yang naik tapi tidak pernah turun?", a: "umur"},
    {q: "Pintu apa yang bisa dimakan?", a: "pintu gerbang"},
    {q: "Sapi apa yang bisa nempel di dinding?", a: "sapiderman"},
    {q: "Batu apa yang paling capek?", a: "batuk"},
];

// ================= QUEST TYPE DEFINITIONS =================
const QUEST_POOL = [
    // Original types
    { type: 'tag', descFn: (q) => `🏷️ Tag/Mention seseorang di chat${q.target > 1 ? ` ${q.target} kali` : ''}`, targetRange: { easy: [1,1], medium: [2,3], hard: [4,5] } },
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
    { type: 'battle', descFn: (q) => `⚔️ Lawan player di PvP ${q.target} kali`, targetRange: { easy: [1,1], medium: [1,2], hard: [2,2] } },
    { type: 'craft', descFn: (q) => `🧪 Craft ${q.target} produk farming`, targetRange: { easy: [1,1], medium: [2,2], hard: [2,3] } },
    // New quest types (v2 — wired to boss/gift/togel/expedition/refine/daily)
    { type: 'boss', descFn: (q) => `👹 Kalahkan ${q.target} boss`, targetRange: { easy: [1,1], medium: [1,2], hard: [2,3] } },
    { type: 'gift', descFn: (q) => `🎁 Kirim gift ke player lain ${q.target} kali`, targetRange: { easy: [1,1], medium: [2,2], hard: [3,4] } },
    { type: 'togel', descFn: (q) => `🎟️ Pasang ${q.target} angka togel`, targetRange: { easy: [1,2], medium: [2,3], hard: [3,5] } },
    { type: 'expedition', descFn: (q) => `🌊 Selesaikan ${q.target} ekspedisi pet`, targetRange: { easy: [1,1], medium: [1,2], hard: [2,3] } },
    { type: 'refine', descFn: (q) => `🔨 Refine relic ${q.target} kali`, targetRange: { easy: [1,1], medium: [2,2], hard: [2,3] } },
    { type: 'daily', descFn: (q) => q.target > 1 ? `📅 Klaim Daily Reward ${q.target} kali` : `📅 Klaim Daily Reward hari ini`, targetRange: { easy: [1,1], medium: [1,1], hard: [1,1] } },
    { type: 'worldboss', descFn: (q) => `🗺️ Serang World Boss ${q.target} kali`, targetRange: { easy: [1,1], medium: [2,3], hard: [3,5] } },
    { type: 'card_gacha', descFn: (q) => `🃏 Buka ${q.target} pack kartu`, targetRange: { easy: [1,1], medium: [2,2], hard: [2,3] } },
    { type: 'arena', descFn: (q) => `⚔️ Bertarung di Arena ${q.target} kali`, targetRange: { easy: [2,3], medium: [3,5], hard: [5,8] } },
    { type: 'cook', descFn: (q) => `🍳 Masak ${q.target} hidangan di Cooking Hub`, targetRange: { easy: [1,1], medium: [2,2], hard: [3,4] } },
    { type: 'relic_socket', descFn: (q) => `🧬 Soket permata ke Relic`, targetRange: { easy: [1,1], medium: [1,1], hard: [1,1] } },
    { type: 'belajar', descFn: (q) => `📚 Selesaikan ${q.target} kuis di Belajar Hub`, targetRange: { easy: [1,1], medium: [2,2], hard: [3,4] } },
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
            if (questType === 'typing' && (!payload || !payload.toLowerCase().includes((q.text || '').toLowerCase()))) valid = false;
            if (questType === 'tebak' && (!payload || !payload.toLowerCase().includes((q.answer || '').toLowerCase()))) valid = false;
            if (valid) { q.progress += amount; if (q.progress > q.target) q.progress = q.target; updated = true; }
        }
    }
    if (updated) db.prepare('UPDATE weekly_quests SET data = ? WHERE guildId = ? AND userId = ? AND week = ?').run(JSON.stringify(quests), guildId, userId, week);
}

// ================= QUEST STREAK BONUS =================
async function checkDailyQuestStreak(guildId, userId) {
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

    // Give 3 random Pokemon cards as "All Done" bonus!
    let gotCardsText = "";
    try {
        const { fetchRandomCards } = require('./cardGame');
        const dailyPool = ['Common', 'Uncommon', 'Rare'];
        const cards = await fetchRandomCards(dailyPool, 3, userId);
        if (cards && cards.length > 0) {
            for (const c of cards) {
                db.prepare(`INSERT INTO pokemon_cards (userId,cardApiId,name,setName,rarity,imageUrl,types,hp,artist,obtainedAt,marketPrice) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
                    userId, c.cardApiId, c.name, c.setName, c.rarity, c.imageUrl, c.types, c.hp, c.artist, Date.now(), c.marketPrice||0);
            }
            gotCardsText = `\n🃏 **Bonus 3 Kartu Pokemon:** Dimasukkan ke koleksi!`;
        }
    } catch (e) {
        console.error('[Quest Bonus] Gagal memberikan kartu:', e.message);
    }

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

    return { bonus: 200, perfectDays, consecutiveDays, weeklyBonus, gotCardsText };
}

function resetConsecutivePerfect(guildId, userId) {
    // If yesterday was NOT a perfect day (all quests completed), reset the
    // consecutive-perfect-days counter. The stat `quest_bonus_<date>` is set
    // to 1 by checkDailyQuestStreak when all quests are claimed that day.
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const bonusKey = `quest_bonus_${yesterday}`;
    const hadPerfectYesterday = getUserStat(guildId, userId, bonusKey) >= 1;
    if (!hadPerfectYesterday) {
        // Reset consecutive counter
        db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, 'quest_consecutive_perfect', 0);
    }
}

// ================= STREAK SYSTEM (existing) =================
async function checkAndUpdateStreak(message) {
    const member = message.member;
    const guildId = member.guild.id;
    if (member.user.bot) return false;

    // Read settings from server_settings (dashboard) with fallback to old getSetting
    const streakEnabled = getSetting(guildId, 'streak_enabled', '1');
    if (streakEnabled === '0' || streakEnabled === 'false') return false;

    const streakTimezone = getSetting(guildId, 'streak_timezone', 'Asia/Jakarta');
    const userId = member.id;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: streakTimezone });

    let streakData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId), streakActivatedToday = false;

    if (!streakData) {
        db.prepare('INSERT INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, 1, ?)').run(guildId, userId, today);
        streakData = { count: 1, last_date: today }; streakActivatedToday = true;
    }
    
    if (!streakActivatedToday && streakData.last_date !== today) {
        const diffDays = Math.floor((new Date(today) - new Date(streakData.last_date)) / 86400000);
        if (diffDays === 1) streakData.count += 1;
        else { if (streakData.count > 1) db.prepare('INSERT OR REPLACE INTO streak_history (guildId, userId, lost_count) VALUES (?, ?, ?)').run(guildId, userId, streakData.count); streakData.count = 1; }
        db.prepare('UPDATE streaks SET count = ?, last_date = ? WHERE guildId = ? AND userId = ?').run(streakData.count, today, guildId, userId);
        streakActivatedToday = true;
    }

    // Auto-nickname — delegated to the unified builder so the 🔥 streak and ❤️ love
    // suffixes coexist on the nickname instead of overwriting each other.
    // (refreshMemberNick internally respects streak_auto_nickname / streak_min_days.)
    try { await require('./love').refreshMemberNick(member); } catch (_) { /* best-effort */ }

    if (streakActivatedToday) {
        resetConsecutivePerfect(guildId, userId);
        await checkAchievements(member.guild, userId, { type: 'streak' });

        // Milestone announcement from dashboard settings
        const announceChannelId = getSetting(guildId, 'streak_announce_channel', '') || getSetting(guildId, 'streak_channel', '');
        if (announceChannelId && streakData.count > 1) {
            const streakCh = member.guild.channels.cache.get(announceChannelId);
            if (streakCh) {
                const streakEmoji = getSetting(guildId, 'streak_emoji', '🔥');
                let announceMsg = getSetting(guildId, 'streak_announce_message', '');
                if (announceMsg) {
                    announceMsg = announceMsg
                        .replace(/{user\.mention}/g, `<@${userId}>`)
                        .replace(/{user\.name}/g, member.user.username)
                        .replace(/{streak}/g, String(streakData.count));
                    streakCh.send({ embeds: [new EmbedBuilder().setColor('#FF4500').setDescription(`${streakEmoji} ${announceMsg}`).setTimestamp()] }).catch(() => {});
                } else {
                    streakCh.send({ embeds: [new EmbedBuilder().setColor('#FF4500').setDescription(`${streakEmoji} <@${userId}> mengaktifkan streak hari ke-**${streakData.count}**!`).setTimestamp()] }).catch(() => {});
                }
            }
        }

        // Streak milestone rewards from dashboard settings
        try {
            const rewardsJson = getSetting(guildId, 'streak_rewards', '');
            if (rewardsJson) {
                const rewards = JSON.parse(rewardsJson);
                const milestone = rewards.find(r => r.days === streakData.count);
                if (milestone) {
                    if (milestone.money > 0) {
                        const user = getOrCreateUser(guildId, userId);
                        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(milestone.money, guildId, userId);
                    }
                    if (milestone.roleId) {
                        const role = member.guild.roles.cache.get(milestone.roleId);
                        if (role) await member.roles.add(role).catch(() => {});
                    }
                }
            } else {
                // Fallback: check individual milestone keys (streak_reward_7, etc.)
                const milestones = [7, 14, 30, 60, 100];
                if (milestones.includes(streakData.count)) {
                    const reward = parseInt(getSetting(guildId, `streak_reward_${streakData.count}`, '0')) || 0;
                    const roleId = getSetting(guildId, `streak_role_${streakData.count}`, '');
                    if (reward > 0) {
                        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(reward, guildId, userId);
                    }
                    if (roleId) {
                        const role = member.guild.roles.cache.get(roleId);
                        if (role) await member.roles.add(role).catch(() => {});
                    }
                }
            }
        } catch (e) { /* ignore reward errors */ }
    }
    return streakActivatedToday;
}

async function addXpAndMoney(member, type, multiplier = 1) {
    const guildId = member.guild.id;

    // Check if leveling is enabled (from dashboard settings)
    const levelingEnabled = getSetting(guildId, 'leveling_enabled', '1');
    if (levelingEnabled === '0') return;

    // Check if this XP source is enabled
    const sourceKey = type === 'voice' ? 'voice_xp_enabled' : type === 'reaction' ? 'reaction_xp_enabled' : 'msg_xp_enabled';
    const sourceEnabled = getSetting(guildId, sourceKey, '1');
    if (sourceEnabled === '0') return;

    // Check no-XP channels
    if (type === 'message' || type === 'msg') {
        const noXpChannels = getSetting(guildId, 'no_xp_channels', '[]');
        try {
            const channels = noXpChannels.startsWith('[') ? JSON.parse(noXpChannels) : noXpChannels.split(',').filter(Boolean);
            if (channels.includes(member.voice?.channelId || '') || channels.includes(member.lastMessage?.channelId || '')) return;
        } catch (e) {}
    }

    // Check no-XP roles
    const noXpRoles = getSetting(guildId, 'no_xp_roles', '[]');
    try {
        const roles = noXpRoles.startsWith('[') ? JSON.parse(noXpRoles) : noXpRoles.split(',').filter(Boolean);
        if (roles.length > 0 && member.roles?.cache?.some(r => roles.includes(r.id))) return;
    } catch (e) {}

    const user = getOrCreateUser(guildId, member.id);

    // Read XP range from dashboard settings
    let xpMin, xpMax;
    if (type === 'voice') {
        xpMin = parseInt(getSetting(guildId, 'voice_xp_min', '')) || parseInt(getConf(guildId, 'voice_min_xp', 3));
        xpMax = parseInt(getSetting(guildId, 'voice_xp_max', '')) || parseInt(getConf(guildId, 'voice_max_xp', 8));
    } else if (type === 'reaction') {
        xpMin = parseInt(getSetting(guildId, 'reaction_xp_min', '')) || parseInt(getConf(guildId, 'reaction_min_xp', 1));
        xpMax = parseInt(getSetting(guildId, 'reaction_xp_max', '')) || parseInt(getConf(guildId, 'reaction_max_xp', 5));
    } else {
        xpMin = parseInt(getSetting(guildId, 'msg_xp_min', '')) || parseInt(getConf(guildId, 'msg_min_xp', 5));
        xpMax = parseInt(getSetting(guildId, 'msg_xp_max', '')) || parseInt(getConf(guildId, 'msg_max_xp', 15));
    }

    // Apply global XP multiplier from dashboard
    const xpMultiplier = parseFloat(getSetting(guildId, 'xp_multiplier', '1')) || 1;
    const maxLevel = parseInt(getSetting(guildId, 'max_level', '200')) || 200;

    // Booster XP check (2x or 3x)
    let boosterXpMult = 1;
    if (Date.now() < (getUserStat(guildId, member.id, 'xp_boost_3x_until') || 0)) {
        boosterXpMult = 3;
    } else if (Date.now() < (getUserStat(guildId, member.id, 'xp_boost_2x_until') || 0)) {
        boosterXpMult = 2;
    }

    const baseGainedXp = Math.floor((Math.floor(Math.random() * (xpMax - xpMin + 1)) + xpMin) * multiplier * xpMultiplier);
    const gainedXp = baseGainedXp * boosterXpMult;

    // Money Magnet booster (+50%) check
    let moneyMult = 1.0;
    if (Date.now() < (getUserStat(guildId, member.id, 'money_magnet_until') || 0)) {
        moneyMult = 1.5;
    }

    // Pet passive bonuses (chat / voice / reaction)
    let petXpPct = 0, petMoneyPct = 0;
    try {
        const { getTotalPetBonus } = require('./pets');
        if (type === 'voice') {
            petXpPct = getTotalPetBonus(guildId, member.id, 'voice_xp') || getTotalPetBonus(guildId, member.id, 'xp_all');
            petMoneyPct = getTotalPetBonus(guildId, member.id, 'money_all');
        } else if (type === 'reaction') {
            petXpPct = getTotalPetBonus(guildId, member.id, 'xp_all');
            petMoneyPct = getTotalPetBonus(guildId, member.id, 'money_all');
        } else {
            petXpPct = getTotalPetBonus(guildId, member.id, 'xp_chat');
            petMoneyPct = getTotalPetBonus(guildId, member.id, 'money_chat');
        }
    } catch (_) {}

    let finalXp = gainedXp;
    if (petXpPct > 0) finalXp = Math.floor(finalXp * (1 + petXpPct / 100));

    const baseMoneyGained = Math.floor(finalXp / 2);
    let moneyGained = Math.floor(baseMoneyGained * moneyMult);
    if (petMoneyPct > 0) moneyGained = Math.floor(moneyGained * (1 + petMoneyPct / 100));

    user.xp += finalXp;
    user.balance += moneyGained;

    // Check max level
    if (user.level >= maxLevel) {
        user.xp = 0;
        db.prepare('UPDATE users SET xp = ?, balance = ? WHERE guildId = ? AND userId = ?').run(user.xp, user.balance, guildId, member.id);
        return;
    }

    // XP needed to advance from level L to L+1 = (L+1) * 100 — MUST stay in sync
    // with the formula shown in the level/profile panels. xpMultiplier only boosts
    // XP GAIN (applied above), never the requirement; otherwise faster gain would be
    // cancelled out by a higher threshold and progress would look "stuck".
    let leveledUp = false;
    let teksHadiah = "";
    // Loop so a single XP gain can grant multiple levels, and so users whose XP was
    // accumulated above the old (broken) threshold instantly catch up to their level.
    while (user.level < maxLevel && user.xp >= (user.level + 1) * 100) {
        user.xp -= (user.level + 1) * 100;
        user.level += 1;
        leveledUp = true;

        // Check rewards from old rewards table
        const reward = db.prepare('SELECT * FROM rewards WHERE guildId = ? AND level = ?').get(guildId, user.level);
        if (reward) {
            let dapatRole = false, dapatUang = false;
            if (reward.roleId) { const role = member.guild.roles.cache.get(reward.roleId); if (role) { await member.roles.add(role).catch(() => {}); teksHadiah += ` Role <@&${reward.roleId}>`; dapatRole = true; } }
            if (reward.money > 0) { user.balance += reward.money; teksHadiah += `${dapatRole ? ' dan' : ''} 🪙 **${reward.money.toLocaleString('id-ID')} Money**`; dapatUang = true; }
            if (dapatRole || dapatUang) teksHadiah = `\n🎁 **Hadiah Bonus:** Kamu mendapatkan${teksHadiah}!`;
        }

        // Check role_rewards from dashboard settings (JSON format)
        try {
            const roleRewardsJson = getSetting(guildId, 'role_rewards', '[]');
            if (roleRewardsJson && roleRewardsJson !== '[]') {
                const roleRewards = JSON.parse(roleRewardsJson);
                const dashReward = roleRewards.find(r => r.days === user.level); // 'days' field is used as level
                if (dashReward) {
                    if (dashReward.roleId) {
                        const role = member.guild.roles.cache.get(dashReward.roleId);
                        if (role) { await member.roles.add(role).catch(() => {}); if (!teksHadiah) teksHadiah = `\n🎁 **Hadiah Bonus:** Kamu mendapatkan Role <@&${dashReward.roleId}>`; }
                    }
                    if (dashReward.money > 0) {
                        user.balance += dashReward.money;
                        if (!teksHadiah) teksHadiah = `\n🎁 **Hadiah Bonus:** 🪙 **${dashReward.money.toLocaleString('id-ID')} Money**`;
                    }
                }
            }
        } catch (e) { /* ignore parse errors */ }
    }

    if (user.level >= maxLevel) user.xp = 0;

    db.prepare('UPDATE users SET xp = ?, level = ?, balance = ?, lastDaily = ? WHERE guildId = ? AND userId = ?').run(user.xp, user.level, user.balance, user.lastDaily, guildId, member.id);

    if (leveledUp) {
        // Level-up announcement from dashboard settings
        const announceEnabled = getSetting(guildId, 'levelup_announce_enabled', '1');
        if (announceEnabled !== '0') {
            const levelChannelId = getSetting(guildId, 'levelup_channel', '') || getSetting(guildId, 'level_channel', null);
            const channel = levelChannelId ? member.guild.channels.cache.get(levelChannelId) : (member.guild.systemChannel || member.guild.channels.cache.filter(c => c.isTextBased()).first());
            if (channel) {
                let lvlMsg = getSetting(guildId, 'levelup_message', '');
                if (lvlMsg) {
                    lvlMsg = lvlMsg
                        .replace(/{user\.mention}/g, `<@${member.id}>`)
                        .replace(/{user\.name}/g, member.user.username)
                        .replace(/{user\.level}/g, String(user.level))
                        .replace(/{user\.xp}/g, String(user.xp));
                    channel.send(`${lvlMsg}${teksHadiah}`).then(m => setTimeout(() => m.delete().catch(() => {}), 15000)).catch(() => {});
                } else {
                    channel.send(`✧ **LEVEL UP** ✧\n<@${member.id}> telah mencapai **Level ${user.level}**!${teksHadiah}`).then(m => setTimeout(() => m.delete().catch(() => {}), 15000)).catch(() => {});
                }
            }
        }
        await checkAchievements(member.guild, member.id, { type: 'level' });
    }
    await checkAchievements(member.guild, member.id, { type: 'balance' });
}

module.exports = { updateQuestProgress, updateWeeklyQuestProgress, generateDailyQuests, generateWeeklyQuests, generateQuestByDifficulty, getOrCreateWeeklyQuests, getWeekId, checkDailyQuestStreak, checkAndUpdateStreak, addXpAndMoney, getRandomInt, poolKata, poolTebakan, DIFFICULTY_TIERS, QUEST_POOL };
