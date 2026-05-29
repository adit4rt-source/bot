// events/voiceStateUpdate.js
const { db, getConf } = require('../database');
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
    if (!oldState.channelId && newState.channelId && !newState.selfMute && !newState.selfDeaf) state.voiceSessions.set(cdKey, Date.now());
    if ((oldState.channelId && !newState.channelId) || newState.selfMute || newState.selfDeaf) {
        if (state.voiceSessions.has(cdKey)) {
            const durationMins = Math.floor((Date.now() - state.voiceSessions.get(cdKey)) / 60000);
            const multiplier = Math.floor(durationMins / getConf(guildId, 'voice_cooldown', 10));
            if (multiplier > 0) await addXpAndMoney(newState.member, 'voice', multiplier);
            updateQuestProgress(guildId, newState.member.id, 'voice', durationMins);
            incrementUserStat(guildId, newState.member.id, 'total_voice_mins', durationMins);
            await checkAchievements(newState.guild, newState.member.id, { type: 'voice' });
            state.voiceSessions.delete(cdKey);
        }
    }
    if (oldState.channelId && newState.channelId && oldState.selfMute && !newState.selfMute && !newState.selfDeaf) state.voiceSessions.set(cdKey, Date.now());
};
