// systems/quests.js
const { EmbedBuilder } = require('discord.js');
const { db, getOrCreateUser, getSetting, getConf } = require('../database');
const { checkAchievements } = require('./achievements');
const { getRandomInt } = require('../utils');

const poolKata = ["kopi hitam", "bot super", "hari ini cerah", "push rank bang", "mabar yuk", "ikan terbang", "nasi padang", "sate madura", "es campur", "bakso urat"];
const poolTebakan = [{q: "Benda apa yang kalau ditutup jadi tongkat, kalau dibuka jadi tenda?", a: "payung"}, {q: "Hewan apa yang bersaudara?", a: "katak beradik"}];

function generateDailyQuests() {
    const types = ['tag', 'typing', 'voice', 'reaction', 'tebak'].sort(() => 0.5 - Math.random()).slice(0, 3);
    const quests = [];
    types.forEach(type => {
        if (type === 'tag') quests.push({ type: 'tag', target: 1, reward: getRandomInt(50, 100), desc: '🏷️ Tag/Mention seseorang di channel chat', progress: 0, claimed: false });
        else if (type === 'typing') { const kata = poolKata[Math.floor(Math.random() * poolKata.length)]; quests.push({ type: 'typing', target: 1, text: kata, reward: getRandomInt(50, 100), desc: `⌨️ Ketik kalimat ini di chat: **"${kata}"**`, progress: 0, claimed: false }); }
        else if (type === 'voice') quests.push({ type: 'voice', target: getRandomInt(5, 10), reward: getRandomInt(50, 100), desc: `🎙️ Join voice channel selama ${getRandomInt(5, 10)} menit`, progress: 0, claimed: false });
        else if (type === 'reaction') quests.push({ type: 'reaction', target: getRandomInt(5, 10), reward: getRandomInt(50, 100), desc: `👍 Berikan ${getRandomInt(5, 10)} reaction ke pesan orang`, progress: 0, claimed: false });
        else if (type === 'tebak') { const t = poolTebakan[Math.floor(Math.random() * poolTebakan.length)]; quests.push({ type: 'tebak', target: 1, question: t.q, answer: t.a, reward: getRandomInt(100, 200), desc: `🧠 Jawab tebakan ini di chat:\n*"${t.q}"*`, progress: 0, claimed: false }); }
    });
    return quests;
}

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
}

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

module.exports = { updateQuestProgress, generateDailyQuests, checkAndUpdateStreak, addXpAndMoney, getRandomInt, poolKata, poolTebakan };
