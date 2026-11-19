// systems/activity.js — Activity-based XP, Economy, and Streak Progression
const { EmbedBuilder } = require('discord.js');
const { db, getSetting, getOrCreateUser, getUserStat, incrementUserStat } = require('../database');
const { checkAchievements } = require('./achievements');

function getConf(guildId, key, def) {
    return getSetting(guildId, key, def);
}

async function checkAndUpdateStreak(message) {
    const member = message.member;
    if (!member || member.user.bot) return false;
    const guildId = member.guild.id;

    const streakEnabled = getSetting(guildId, 'streak_enabled', '1');
    if (streakEnabled === '0' || streakEnabled === 'false') return false;

    const streakTimezone = getSetting(guildId, 'streak_timezone', 'Asia/Jakarta');
    const userId = member.id;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: streakTimezone });

    let streakData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId);
    let streakActivatedToday = false;

    if (!streakData) {
        db.prepare('INSERT INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, 1, ?)').run(guildId, userId, today);
        streakData = { count: 1, last_date: today };
        streakActivatedToday = true;
    }

    if (!streakActivatedToday && streakData.last_date !== today) {
        const diffDays = Math.floor((new Date(today) - new Date(streakData.last_date)) / 86400000);
        const streakFreeze = getSetting(guildId, 'streak_freeze', '1');
        const isFrozen = streakFreeze !== '0' && streakFreeze !== 'false';

        if (isFrozen) {
            if (diffDays >= 1) {
                streakData.count = (streakData.count || 0) + 1;
            } else if (!streakData.count) {
                streakData.count = 1;
            }
        } else {
            if (diffDays >= 1 && diffDays <= 3) {
                streakData.count += 1;
            } else {
                if (streakData.count > 1) {
                    db.prepare('INSERT OR REPLACE INTO streak_history (guildId, userId, lost_count) VALUES (?, ?, ?)').run(guildId, userId, streakData.count);
                }
                streakData.count = 1;
            }
        }
        db.prepare('UPDATE streaks SET count = ?, last_date = ? WHERE guildId = ? AND userId = ?').run(streakData.count, today, guildId, userId);
        streakActivatedToday = true;
    }

    // Auto-nickname with streak emoji
    try {
        const streakAutoNick = getSetting(guildId, 'streak_auto_nickname', '1');
        const streakMinDays = parseInt(getSetting(guildId, 'streak_min_days', '3')) || 3;
        if (streakAutoNick === '1' && streakData.count >= streakMinDays) {
            const streakEmoji = getSetting(guildId, 'streak_emoji', '🔥');
            const cleanName = member.displayName.replace(/\s*[🔥].*$/, '');
            const newNick = `${cleanName} ${streakEmoji}${streakData.count}`.slice(0, 32);
            if (member.manageable && member.displayName !== newNick) {
                await member.setNickname(newNick).catch(() => {});
            }
        }
    } catch (_) {}

    if (streakActivatedToday) {
        await checkAchievements(member.guild, userId, { type: 'streak' });

        // Milestone announcement
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

        // Streak milestone rewards
        try {
            const rewardsJson = getSetting(guildId, 'streak_rewards', '');
            if (rewardsJson) {
                const rewards = JSON.parse(rewardsJson);
                const milestone = rewards.find(r => r.days === streakData.count);
                if (milestone) {
                    if (milestone.money > 0) {
                        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(milestone.money, guildId, userId);
                    }
                    if (milestone.roleId) {
                        const role = member.guild.roles.cache.get(milestone.roleId);
                        if (role) await member.roles.add(role).catch(() => {});
                    }
                }
            } else {
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
        } catch (_) {}
    }
    return streakActivatedToday;
}

async function addXpAndMoney(member, type, multiplier = 1) {
    const guildId = member.guild.id;

    const levelingEnabled = getSetting(guildId, 'leveling_enabled', '1');
    if (levelingEnabled === '0') return;

    const sourceKey = type === 'voice' ? 'voice_xp_enabled' : type === 'reaction' ? 'reaction_xp_enabled' : 'msg_xp_enabled';
    const sourceEnabled = getSetting(guildId, sourceKey, '1');
    if (sourceEnabled === '0') return;

    if (type === 'message' || type === 'msg') {
        const noXpChannels = getSetting(guildId, 'no_xp_channels', '[]');
        try {
            const channels = noXpChannels.startsWith('[') ? JSON.parse(noXpChannels) : noXpChannels.split(',').filter(Boolean);
            if (channels.includes(member.voice?.channelId || '') || channels.includes(member.lastMessage?.channelId || '')) return;
        } catch (_) {}
    }

    const noXpRoles = getSetting(guildId, 'no_xp_roles', '[]');
    try {
        const roles = noXpRoles.startsWith('[') ? JSON.parse(noXpRoles) : noXpRoles.split(',').filter(Boolean);
        if (roles.length > 0 && member.roles?.cache?.some(r => roles.includes(r.id))) return;
    } catch (_) {}

    const user = getOrCreateUser(guildId, member.id);

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

    const xpMultiplier = parseFloat(getSetting(guildId, 'xp_multiplier', '1')) || 1;
    const maxLevel = parseInt(getSetting(guildId, 'max_level', '200')) || 200;

    let boosterXpMult = 1;
    if (Date.now() < (getUserStat(guildId, member.id, 'xp_boost_3x_until') || 0)) {
        boosterXpMult = 3;
    } else if (Date.now() < (getUserStat(guildId, member.id, 'xp_boost_2x_until') || 0)) {
        boosterXpMult = 2;
    }

    const baseGainedXp = Math.floor((Math.floor(Math.random() * (xpMax - xpMin + 1)) + xpMin) * multiplier * xpMultiplier);
    const gainedXp = baseGainedXp * boosterXpMult;

    let gainedMoney = 0;
    const moneyEnabled = getSetting(guildId, 'msg_money_enabled', '1');
    if (moneyEnabled !== '0' && type !== 'reaction') {
        const moneyMin = parseInt(getSetting(guildId, 'msg_money_min', '')) || parseInt(getConf(guildId, 'msg_min_money', 1));
        const moneyMax = parseInt(getSetting(guildId, 'msg_money_max', '')) || parseInt(getConf(guildId, 'msg_max_money', 5));
        const baseMoney = Math.floor((Math.floor(Math.random() * (moneyMax - moneyMin + 1)) + moneyMin) * multiplier);

        let moneyBoosterMult = 1;
        if (Date.now() < (getUserStat(guildId, member.id, 'money_boost_until') || 0)) {
            moneyBoosterMult = 1.5;
        }
        gainedMoney = Math.floor(baseMoney * moneyBoosterMult);
    }

    let currentXp = user.xp + gainedXp;
    let currentLevel = user.level;
    let leveledUp = false;

    while (currentLevel < maxLevel) {
        const requiredXp = (currentLevel + 1) * 100;
        if (currentXp >= requiredXp) {
            currentXp -= requiredXp;
            currentLevel++;
            leveledUp = true;
        } else {
            break;
        }
    }

    db.prepare('UPDATE users SET xp = ?, level = ?, balance = balance + ? WHERE guildId = ? AND userId = ?')
        .run(currentXp, currentLevel, gainedMoney, guildId, member.id);

    if (gainedMoney > 0) {
        incrementUserStat(guildId, member.id, 'total_chat_money_earned', gainedMoney);
    }

    if (leveledUp) {
        await checkAchievements(member.guild, member.id, { type: 'level', level: currentLevel });

        const levelUpChannelId = getSetting(guildId, 'levelup_channel', '');
        const targetChannel = levelUpChannelId ? member.guild.channels.cache.get(levelUpChannelId) : null;
        if (targetChannel) {
            const embed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🎉 LEVEL UP!')
                .setDescription(`Selamat <@${member.id}>! Kamu naik ke **Level ${currentLevel}**! ⭐`)
                .setTimestamp();
            targetChannel.send({ embeds: [embed] }).catch(() => {});
        }
    }
}

module.exports = {
    checkAndUpdateStreak,
    addXpAndMoney,
};
