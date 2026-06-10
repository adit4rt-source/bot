// systems/socialInteraction.js — Social Interaction / Roleplay with Tenor GIFs
const { EmbedBuilder } = require('discord.js');
const { db } = require('../database');

// Tenor API v2 (free tier — needs API key from Google Cloud)
const TENOR_API_KEY = process.env.TENOR_API_KEY || '';
const TENOR_CLIENT_KEY = 'id_bot';

// ==================== INTERACTION TYPES ====================
const INTERACTIONS = [
    { id: 'kiss', name: 'Kiss', emoji: '💋', search: 'anime kiss', verb: 'mencium', selfVerb: 'mencium diri sendiri', color: '#FF69B4' },
    { id: 'hug', name: 'Hug', emoji: '🤗', search: 'anime hug', verb: 'memeluk', selfVerb: 'memeluk diri sendiri', color: '#FFB6C1' },
    { id: 'pat', name: 'Pat', emoji: '✋', search: 'anime headpat', verb: 'menepuk kepala', selfVerb: 'menepuk kepala sendiri', color: '#87CEEB' },
    { id: 'cuddle', name: 'Cuddle', emoji: '🥰', search: 'anime cuddle', verb: 'bermanja dengan', selfVerb: 'bermanja sendirian', color: '#DDA0DD' },
    { id: 'slap', name: 'Slap', emoji: '👋', search: 'anime slap', verb: 'menampar', selfVerb: 'menampar diri sendiri', color: '#FF4500' },
    { id: 'punch', name: 'Punch', emoji: '👊', search: 'anime punch', verb: 'memukul', selfVerb: 'memukul diri sendiri', color: '#DC143C' },
    { id: 'bite', name: 'Bite', emoji: '😬', search: 'anime bite', verb: 'menggigit', selfVerb: 'menggigit diri sendiri', color: '#8B0000' },
    { id: 'poke', name: 'Poke', emoji: '👉', search: 'anime poke', verb: 'menyolek', selfVerb: 'menyolek diri sendiri', color: '#FFA500' },
    { id: 'tickle', name: 'Tickle', emoji: '😂', search: 'anime tickle', verb: 'menggelitik', selfVerb: 'menggelitik diri sendiri', color: '#FFFF00' },
    { id: 'highfive', name: 'Highfive', emoji: '🙌', search: 'anime high five', verb: 'tos dengan', selfVerb: 'tos sendirian...', color: '#32CD32' },
    { id: 'wave', name: 'Wave', emoji: '👋', search: 'anime wave', verb: 'melambai ke', selfVerb: 'melambai ke udara', color: '#4169E1' },
    { id: 'cry', name: 'Cry', emoji: '😢', search: 'anime cry', verb: 'menangis di depan', selfVerb: 'menangis sendirian', color: '#4682B4' },
    { id: 'blush', name: 'Blush', emoji: '😊', search: 'anime blush', verb: 'memerah di depan', selfVerb: 'memerah sendirian', color: '#FF6347' },
    { id: 'dance', name: 'Dance', emoji: '💃', search: 'anime dance', verb: 'menari bersama', selfVerb: 'menari sendirian', color: '#9400D3' },
    { id: 'bonk', name: 'Bonk', emoji: '🔨', search: 'anime bonk', verb: 'bonk', selfVerb: 'bonk diri sendiri', color: '#B22222' },
    { id: 'wink', name: 'Wink', emoji: '😉', search: 'anime wink', verb: 'mengedipkan mata ke', selfVerb: 'mengedipkan mata', color: '#FF1493' },
    { id: 'feed', name: 'Feed', emoji: '🍜', search: 'anime feed', verb: 'menyuapi', selfVerb: 'makan sendiri', color: '#FF8C00' },
    { id: 'handhold', name: 'Handhold', emoji: '🤝', search: 'anime hand holding', verb: 'menggenggam tangan', selfVerb: 'menggenggam tangan sendiri', color: '#FFD700' },
];

// ==================== TENOR API ====================
async function fetchTenorGif(searchTerm) {
    if (!TENOR_API_KEY) return null;
    try {
        const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(searchTerm)}&key=${TENOR_API_KEY}&client_key=${TENOR_CLIENT_KEY}&limit=20&media_filter=gif`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        if (!data.results || data.results.length === 0) return null;
        // Pick random GIF from results
        const gif = data.results[Math.floor(Math.random() * data.results.length)];
        return gif.media_formats?.gif?.url || gif.media_formats?.mediumgif?.url || null;
    } catch (e) {
        console.error('[social] Tenor API error:', e.message);
        return null;
    }
}

// ==================== BUILD INTERACTION EMBED ====================
async function buildInteractionEmbed(interactionType, userId, targetId, guildName) {
    const type = INTERACTIONS.find(i => i.id === interactionType);
    if (!type) return null;

    const isSelf = userId === targetId;
    const text = isSelf
        ? `${type.emoji} **<@${userId}>** ${type.selfVerb}!`
        : `${type.emoji} **<@${userId}>** ${type.verb} **<@${targetId}>**!`;

    const gifUrl = await fetchTenorGif(type.search);

    const embed = new EmbedBuilder()
        .setColor(type.color)
        .setDescription(text);

    if (gifUrl) {
        embed.setImage(gifUrl);
    }

    embed.setFooter({ text: `${guildName} • Social Interaction` });

    return embed;
}

// ==================== MESSAGE-BASED DETECTION ====================
// Detects patterns like "@user kiss" or "kiss @user" in messages
function detectInteraction(message) {
    if (!message.mentions.users.size) return null;
    const content = message.content.toLowerCase().replace(/<@!?\d+>/g, '').trim();
    
    for (const type of INTERACTIONS) {
        if (content === type.id || content === type.name.toLowerCase()) {
            const target = message.mentions.users.first();
            return { type: type.id, targetId: target.id };
        }
    }
    return null;
}

// ==================== HANDLE INTERACTION ====================
async function handleSocialInteraction(message, interactionId, targetId) {
    const embed = await buildInteractionEmbed(interactionId, message.author.id, targetId, message.guild.name);
    if (!embed) return;
    
    await message.channel.send({ embeds: [embed] }).catch(() => {});
    
    // Track stats
    try {
        const { incrementUserStat } = require('../database');
        incrementUserStat(message.guild.id, message.author.id, `social_${interactionId}_given`);
        if (message.author.id !== targetId) {
            incrementUserStat(message.guild.id, targetId, `social_${interactionId}_received`);
        }
    } catch (_) {}
}

// ==================== EXPORTS ====================
module.exports = {
    INTERACTIONS,
    fetchTenorGif,
    buildInteractionEmbed,
    detectInteraction,
    handleSocialInteraction,
};
