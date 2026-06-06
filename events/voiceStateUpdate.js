// events/voiceStateUpdate.js
const { db, getConf, getSetting } = require('../database');
const { incrementUserStat } = require('../database');
const { checkAchievements } = require('../systems/achievements');
const { updateQuestProgress, addXpAndMoney } = require('../systems/quests');
const state = require('../state');

async function handleVoiceStateUpdate(oldState, newState) {
    if (newState.member.user.bot) return;
    const guildId = newState.guild.id;

    // Temp voice cleanup
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        const tempVoiceData = db.prepare('SELECT * FROM temp_voices WHERE channelId = ?').get(oldState.channelId);
        if (tempVoiceData) { const oldChannel = oldState.channel; if (oldChannel && oldChannel.members.size === 0) { db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(oldState.channelId); await oldChannel.delete().catch(() => {}); } }
    }

    const cdKey = `${guildId}_${newState.member.id}`;

    // === JOIN VC → start session ===
    if (!oldState.channelId && newState.channelId) {
        if (!newState.selfDeaf) {
            state.voiceSessions.set(cdKey, Date.now());
        }
    }

    // === LEAVE VC → end session, give XP (quest handled by tick) ===
    else if (oldState.channelId && !newState.channelId) {
        if (state.voiceSessions.has(cdKey)) {
            const durationMins = Math.floor((Date.now() - state.voiceSessions.get(cdKey)) / 60000);
            if (durationMins >= 1) {
                const voiceCd = parseInt(getSetting(guildId, 'voice_xp_cooldown', '') || getConf(guildId, 'voice_cooldown', 5)) || 5;
                const multiplier = Math.floor(durationMins / voiceCd);
                if (multiplier > 0) await addXpAndMoney(newState.member, 'voice', multiplier);
                updateQuestProgress(guildId, newState.member.id, 'voice', durationMins);
                incrementUserStat(guildId, newState.member.id, 'total_voice_mins', durationMins);
                await checkAchievements(newState.guild, newState.member.id, { type: 'voice' });
            }
            state.voiceSessions.delete(cdKey);
        }
    }

    // === DEAFEN → pause (end session) ===
    else if (oldState.channelId && newState.channelId && !oldState.selfDeaf && newState.selfDeaf) {
        if (state.voiceSessions.has(cdKey)) {
            const durationMins = Math.floor((Date.now() - state.voiceSessions.get(cdKey)) / 60000);
            if (durationMins >= 1) {
                updateQuestProgress(guildId, newState.member.id, 'voice', durationMins);
                incrementUserStat(guildId, newState.member.id, 'total_voice_mins', durationMins);
            }
            state.voiceSessions.delete(cdKey);
        }
    }

    // === UNDEAFEN → resume (start session) ===
    else if (oldState.channelId && newState.channelId && oldState.selfDeaf && !newState.selfDeaf) {
        state.voiceSessions.set(cdKey, Date.now());
    }

    // === SWITCH CHANNEL → keep session running ===
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        if (!state.voiceSessions.has(cdKey) && !newState.selfDeaf) {
            state.voiceSessions.set(cdKey, Date.now());
        }
    }
}

// === PERIODIC VOICE TICK ===
// Every 1 minute, update quest progress for users currently in VC
// This ensures quest updates even if user stays in VC without leaving
function startVoiceTickInterval() {
    setInterval(() => {
        const now = Date.now();
        for (const [cdKey, startTime] of state.voiceSessions.entries()) {
            const durationMins = Math.floor((now - startTime) / 60000);
            if (durationMins >= 1) {
                const idx = cdKey.indexOf('_');
                const guildId = cdKey.substring(0, idx);
                const userId = cdKey.substring(idx + 1);
                updateQuestProgress(guildId, userId, 'voice', durationMins);
                incrementUserStat(guildId, userId, 'total_voice_mins', durationMins);
                // Reset start time so we don't double-count
                state.voiceSessions.set(cdKey, now);
            }
        }
    }, 60 * 1000); // every 1 minute
}

module.exports = handleVoiceStateUpdate;
module.exports.startVoiceTickInterval = startVoiceTickInterval;
