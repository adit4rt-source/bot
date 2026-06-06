// events/voiceStateUpdate.js
const { db, getConf, getSetting } = require('../database');
const { incrementUserStat } = require('../database');
const { checkAchievements } = require('../systems/achievements');
const { updateQuestProgress, addXpAndMoney } = require('../systems/quests');
const state = require('../state');

module.exports = async function handleVoiceStateUpdate(oldState, newState) {
    if (newState.member.user.bot) return;
    const guildId = newState.guild.id;

    // Temp voice cleanup
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        const tempVoiceData = db.prepare('SELECT * FROM temp_voices WHERE channelId = ?').get(oldState.channelId);
        if (tempVoiceData) { const oldChannel = oldState.channel; if (oldChannel && oldChannel.members.size === 0) { db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(oldState.channelId); await oldChannel.delete().catch(() => {}); } }
    }

    const cdKey = `${guildId}_${newState.member.id}`;

    // === JOIN VC (or unmute) → start session ===
    if (!oldState.channelId && newState.channelId && !newState.selfDeaf) {
        state.voiceSessions.set(cdKey, Date.now());
    }

    // === LEAVE VC (or mute/deafen) → end session, give rewards ===
    if ((oldState.channelId && !newState.channelId) || newState.selfDeaf) {
        if (state.voiceSessions.has(cdKey)) {
            const durationMins = Math.floor((Date.now() - state.voiceSessions.get(cdKey)) / 60000);
            if (durationMins >= 1) {
                // XP reward (per voice_cooldown interval, default 5 min)
                const voiceCd = parseInt(getSetting(guildId, 'voice_xp_cooldown', '') || getConf(guildId, 'voice_cooldown', 5)) || 5;
                const multiplier = Math.floor(durationMins / voiceCd);
                if (multiplier > 0) await addXpAndMoney(newState.member, 'voice', multiplier);

                // Quest progress (raw minutes)
                updateQuestProgress(guildId, newState.member.id, 'voice', durationMins);
                incrementUserStat(guildId, newState.member.id, 'total_voice_mins', durationMins);
                await checkAchievements(newState.guild, newState.member.id, { type: 'voice' });
            }
            state.voiceSessions.delete(cdKey);
        }
    }

    // === SWITCH CHANNEL (stay in VC) → keep session ===
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        if (!state.voiceSessions.has(cdKey) && !newState.selfDeaf) {
            state.voiceSessions.set(cdKey, Date.now());
        }
    }

    // === UNMUTE → restart session if not tracked ===
    if (oldState.channelId && newState.channelId && oldState.selfDeaf && !newState.selfDeaf) {
        state.voiceSessions.set(cdKey, Date.now());
    }
};

// === PERIODIC VOICE TICK (every 5 min, update quest progress for active sessions) ===
// Called from bot.js on ready
function startVoiceTickInterval(client) {
    setInterval(() => {
        const now = Date.now();
        for (const [cdKey, startTime] of state.voiceSessions.entries()) {
            const durationMins = Math.floor((now - startTime) / 60000);
            if (durationMins >= 5) {
                const [guildId, userId] = cdKey.split('_');
                // Update quest progress with accumulated minutes
                updateQuestProgress(guildId, userId, 'voice', durationMins);
                incrementUserStat(guildId, userId, 'total_voice_mins', durationMins);
                // Reset session start to now (so we don't double count)
                state.voiceSessions.set(cdKey, now);
            }
        }
    }, 5 * 60 * 1000); // every 5 minutes
}

module.exports.startVoiceTickInterval = startVoiceTickInterval;
