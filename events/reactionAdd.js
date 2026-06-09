// events/reactionAdd.js
const { db, getConf, incrementUserStat } = require('../database');
const { checkAchievements } = require('../systems/achievements');
const { updateQuestProgress, addXpAndMoney } = require('../systems/quests');
const state = require('../state');

module.exports = async function handleReactionAdd(reaction, user) {
    if (user.bot || !reaction.message.guild) return;
    const { isMaintenance } = require('../systems/maintenance');
    if (isMaintenance()) return; // fitur reaction reward dimatikan sementara
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

    // ❤️ LOVE — reacting with the love emoji gives the message author +1 love
    // (unique per reactor→author, no self-love). See systems/love.js.
    try {
        const love = require('../systems/love');
        if (love.isEnabled(guildId) && love.isLoveEmoji(guildId, reaction.emoji && reaction.emoji.name)) {
            // Re-derive the author safely (the message may be a partial that wasn't cached).
            let msg = reaction.message;
            if (msg.partial) msg = await msg.fetch().catch(() => null);
            const lovedId = msg && msg.author ? msg.author.id : null;
            const lovedBot = msg && msg.author ? msg.author.bot : true;
            if (lovedId && !lovedBot && lovedId !== reactorId) {
                const res = love.giveLove(guildId, reactorId, lovedId);
                if (res.added) {
                    incrementUserStat(guildId, lovedId, 'love_received');
                    const lovedMember = await reaction.message.guild.members.fetch(lovedId).catch(() => null);
                    if (lovedMember) await love.refreshMemberNick(lovedMember);
                }
            }
        }
    } catch (_) { /* love is best-effort; never break reaction handling */ }
};
