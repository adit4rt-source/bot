// events/reactionAdd.js
const { db, getConf, incrementUserStat } = require('../database');
const { checkAchievements } = require('../systems/achievements');
const { updateQuestProgress, addXpAndMoney } = require('../systems/quests');
const state = require('../state');

module.exports = async function handleReactionAdd(reaction, user) {
    if (user.bot || !reaction.message.guild) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});
    const guildId = reaction.message.guild.id;
    const awardSetting = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, 'reaction_award_to');
    const awardTo = awardSetting ? awardSetting.value : 'both';
    if (awardTo === 'none') return;

    const reactorId = user.id, authorId = reaction.message.author.id, isAuthorBot = reaction.message.author.bot;
    const cdTime = getConf(guildId, 'reaction_cooldown', 10) * 1000;

    const processReactionXp = async (targetId) => {
        updateQuestProgress(guildId, targetId, 'reaction', 1);
        const cdKey = `${guildId}_${targetId}_react`;
        if (!state.reactionCooldowns.has(cdKey)) {
            const member = await reaction.message.guild.members.fetch(targetId).catch(() => null);
            if (member) { await addXpAndMoney(member, 'reaction'); state.reactionCooldowns.add(cdKey); setTimeout(() => state.reactionCooldowns.delete(cdKey), cdTime); }
        }
    };

    incrementUserStat(guildId, reactorId, 'total_reactions');
    await checkAchievements(reaction.message.guild, reactorId, { type: 'reaction' });
    if (awardTo === 'both' || awardTo === 'reactor') await processReactionXp(reactorId);
    if ((awardTo === 'both' || awardTo === 'author') && !isAuthorBot && reactorId !== authorId) await processReactionXp(authorId);
};
