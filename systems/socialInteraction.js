// systems/socialInteraction.js — Social Interaction / Roleplay with Giphy GIFs
const { EmbedBuilder } = require('discord.js');
const { db } = require('../database');

// Giphy API
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || '9oW7wjv3hYKQnkNIOwA19Ccdbp1enB4S';

// ==================== INTERACTION TYPES (60+ total) ====================
const INTERACTIONS = [
    // Romantis
    { id: 'kiss', name: 'Kiss', emoji: '💋', search: 'anime kiss', verb: 'mencium', selfVerb: 'mencium diri sendiri', color: '#FF69B4' },
    { id: 'hug', name: 'Hug', emoji: '🤗', search: 'anime hug', verb: 'memeluk', selfVerb: 'memeluk diri sendiri', color: '#FFB6C1' },
    { id: 'cuddle', name: 'Cuddle', emoji: '🥰', search: 'anime cuddle', verb: 'bermanja dengan', selfVerb: 'bermanja sendirian', color: '#DDA0DD' },
    { id: 'handhold', name: 'Handhold', emoji: '🤝', search: 'anime hand holding', verb: 'menggenggam tangan', selfVerb: 'menggenggam tangan sendiri', color: '#FFD700' },
    { id: 'wink', name: 'Wink', emoji: '😉', search: 'anime wink', verb: 'mengedipkan mata ke', selfVerb: 'mengedipkan mata sendirian', color: '#FF1493' },
    { id: 'blush', name: 'Blush', emoji: '😊', search: 'anime blush', verb: 'memerah karena', selfVerb: 'memerah sendirian', color: '#FF6347' },
    // Kasih sayang
    { id: 'pat', name: 'Pat', emoji: '✋', search: 'anime headpat', verb: 'menepuk kepala', selfVerb: 'menepuk kepala sendiri', color: '#87CEEB' },
    { id: 'poke', name: 'Poke', emoji: '👉', search: 'anime poke', verb: 'menyolek', selfVerb: 'menyolek diri sendiri', color: '#FFA500' },
    { id: 'feed', name: 'Feed', emoji: '🍜', search: 'anime feed', verb: 'menyuapi', selfVerb: 'makan sendiri', color: '#FF8C00' },
    { id: 'wave', name: 'Wave', emoji: '👋', search: 'anime wave', verb: 'melambai ke', selfVerb: 'melambai ke udara', color: '#4169E1' },
    { id: 'highfive', name: 'Highfive', emoji: '🙌', search: 'anime high five', verb: 'tos dengan', selfVerb: 'tos sendirian...', color: '#32CD32' },
    { id: 'tickle', name: 'Tickle', emoji: '😂', search: 'anime tickle', verb: 'menggelitik', selfVerb: 'menggelitik diri sendiri', color: '#FFFF00' },
    // Kekerasan (fun)
    { id: 'slap', name: 'Slap', emoji: '👋', search: 'anime slap', verb: 'menampar', selfVerb: 'menampar diri sendiri', color: '#FF4500' },
    { id: 'punch', name: 'Punch', emoji: '👊', search: 'anime punch', verb: 'memukul', selfVerb: 'memukul diri sendiri', color: '#DC143C' },
    { id: 'kick', name: 'Kick', emoji: '🦶', search: 'anime kick', verb: 'menendang', selfVerb: 'menendang diri sendiri', color: '#8B0000' },
    { id: 'bite', name: 'Bite', emoji: '😬', search: 'anime bite', verb: 'menggigit', selfVerb: 'menggigit diri sendiri', color: '#8B0000' },
    { id: 'bonk', name: 'Bonk', emoji: '🔨', search: 'anime bonk', verb: 'bonk', selfVerb: 'bonk diri sendiri', color: '#B22222' },
    { id: 'throw', name: 'Throw', emoji: '🪨', search: 'anime throw', verb: 'melempar sesuatu ke', selfVerb: 'melempar sesuatu ke udara', color: '#696969' },
    // Emosi
    { id: 'cry', name: 'Cry', emoji: '😢', search: 'anime cry', verb: 'menangis di depan', selfVerb: 'menangis sendirian', color: '#4682B4' },
    { id: 'laugh', name: 'Laugh', emoji: '😂', search: 'anime laugh', verb: 'menertawakan', selfVerb: 'tertawa sendiri', color: '#FFD700' },
    { id: 'smile', name: 'Smile', emoji: '😊', search: 'anime smile', verb: 'tersenyum ke', selfVerb: 'tersenyum sendiri', color: '#90EE90' },
    { id: 'angry', name: 'Angry', emoji: '😡', search: 'anime angry', verb: 'marah ke', selfVerb: 'marah sendiri', color: '#FF0000' },
    { id: 'pout', name: 'Pout', emoji: '😤', search: 'anime pout', verb: 'cemberut ke', selfVerb: 'cemberut sendirian', color: '#FF6B6B' },
    { id: 'smug', name: 'Smug', emoji: '😏', search: 'anime smug', verb: 'menatap sombong ke', selfVerb: 'merasa sombong sendiri', color: '#9B59B6' },
    // Aktivitas
    { id: 'dance', name: 'Dance', emoji: '💃', search: 'anime dance', verb: 'menari bersama', selfVerb: 'menari sendirian', color: '#9400D3' },
    { id: 'sleep', name: 'Sleep', emoji: '😴', search: 'anime sleep', verb: 'tidur di pundak', selfVerb: 'tertidur sendirian', color: '#191970' },
    { id: 'run', name: 'Run', emoji: '🏃', search: 'anime run', verb: 'berlari mengejar', selfVerb: 'berlari tanpa tujuan', color: '#00CED1' },
    { id: 'hide', name: 'Hide', emoji: '🙈', search: 'anime hide shy', verb: 'bersembunyi dari', selfVerb: 'bersembunyi sendirian', color: '#8FBC8F' },
    { id: 'stare', name: 'Stare', emoji: '👀', search: 'anime stare', verb: 'menatap', selfVerb: 'menatap ke langit', color: '#4B0082' },
    { id: 'lick', name: 'Lick', emoji: '👅', search: 'anime lick', verb: 'menjilat', selfVerb: 'menjilat diri sendiri', color: '#FF69B4' },
    // Bahasa Indonesia formal
    { id: 'cium', name: 'Cium', emoji: '💋', search: 'anime kiss', verb: 'mencium', selfVerb: 'mencium diri sendiri', color: '#FF69B4' },
    { id: 'peluk', name: 'Peluk', emoji: '🤗', search: 'anime hug', verb: 'memeluk', selfVerb: 'memeluk diri sendiri', color: '#FFB6C1' },
    { id: 'tampar', name: 'Tampar', emoji: '👋', search: 'anime slap', verb: 'menampar', selfVerb: 'menampar diri sendiri', color: '#FF4500' },
    { id: 'pukul', name: 'Pukul', emoji: '👊', search: 'anime punch', verb: 'memukul', selfVerb: 'memukul diri sendiri', color: '#DC143C' },
    { id: 'elus', name: 'Elus', emoji: '✋', search: 'anime headpat', verb: 'mengelus kepala', selfVerb: 'mengelus kepala sendiri', color: '#87CEEB' },
    { id: 'tendang', name: 'Tendang', emoji: '🦶', search: 'anime kick', verb: 'menendang', selfVerb: 'menendang diri sendiri', color: '#8B0000' },
    { id: 'gigit', name: 'Gigit', emoji: '😬', search: 'anime bite', verb: 'menggigit', selfVerb: 'menggigit diri sendiri', color: '#8B0000' },
    { id: 'suapi', name: 'Suapi', emoji: '🍜', search: 'anime feed', verb: 'menyuapi', selfVerb: 'makan sendiri', color: '#FF8C00' },
    { id: 'gelitik', name: 'Gelitik', emoji: '😂', search: 'anime tickle', verb: 'menggelitik', selfVerb: 'menggelitik diri sendiri', color: '#FFFF00' },
    { id: 'cubit', name: 'Cubit', emoji: '🤏', search: 'anime pinch', verb: 'mencubit', selfVerb: 'mencubit diri sendiri', color: '#FF6347' },
    { id: 'gendong', name: 'Gendong', emoji: '🫂', search: 'anime carry', verb: 'menggendong', selfVerb: 'menggendong diri sendiri??', color: '#DDA0DD' },
    { id: 'colek', name: 'Colek', emoji: '👉', search: 'anime poke', verb: 'menyolek', selfVerb: 'menyolek diri sendiri', color: '#FFA500' },
    // Slang / Kasar / Informal Indonesia
    { id: 'gampar', name: 'Gampar', emoji: '🤚', search: 'anime slap hard', verb: 'menggampar', selfVerb: 'menggampar muka sendiri', color: '#FF0000' },
    { id: 'gaplok', name: 'Gaplok', emoji: '✋', search: 'anime slap', verb: 'menggaplok', selfVerb: 'menggaplok diri sendiri', color: '#FF4500' },
    { id: 'jitak', name: 'Jitak', emoji: '👊', search: 'anime hit head', verb: 'menjitak', selfVerb: 'menjitak kepala sendiri', color: '#DC143C' },
    { id: 'toyor', name: 'Toyor', emoji: '🤜', search: 'anime flick forehead', verb: 'menoyor', selfVerb: 'menoyor jidat sendiri', color: '#B22222' },
    { id: 'jewer', name: 'Jewer', emoji: '👂', search: 'anime pull ear', verb: 'menjewer telinga', selfVerb: 'menjewer telinga sendiri', color: '#8B4513' },
    { id: 'tabok', name: 'Tabok', emoji: '🫲', search: 'anime slap', verb: 'menabok', selfVerb: 'menabok diri sendiri', color: '#B22222' },
    { id: 'lempar', name: 'Lempar', emoji: '🪨', search: 'anime throw', verb: 'ngelempar sandal ke', selfVerb: 'ngelempar sandal ke tembok', color: '#696969' },
    { id: 'dorong', name: 'Dorong', emoji: '🫸', search: 'anime push', verb: 'mendorong', selfVerb: 'mendorong angin', color: '#808080' },
    { id: 'injek', name: 'Injek', emoji: '🦶', search: 'anime stomp', verb: 'menginjak kaki', selfVerb: 'menginjak kaki sendiri', color: '#2F4F4F' },
    { id: 'cekik', name: 'Cekik', emoji: '😈', search: 'anime choke', verb: 'nyekik', selfVerb: 'nyekik diri sendiri??', color: '#4B0082' },
    { id: 'kentut', name: 'Kentut', emoji: '💨', search: 'anime fart', verb: 'kentut di depan', selfVerb: 'kentut sendirian', color: '#9ACD32' },
    { id: 'jedotin', name: 'Jedotin', emoji: '💥', search: 'anime headbutt', verb: 'menjedotkan kepala', selfVerb: 'menjedotkan kepala ke tembok', color: '#FF6347' },
    { id: 'ciee', name: 'Ciee', emoji: '😏', search: 'anime tease', verb: 'nge-ciee-in', selfVerb: 'ciee sama diri sendiri', color: '#FF69B4' },
    { id: 'gombal', name: 'Gombal', emoji: '🥴', search: 'anime flirt', verb: 'menggombal ke', selfVerb: 'menggombal ke cermin', color: '#FF1493' },
    { id: 'nangis', name: 'Nangis', emoji: '😭', search: 'anime cry hard', verb: 'nangis di depan', selfVerb: 'nangis sendirian di pojokan', color: '#4682B4' },
    { id: 'ngambek', name: 'Ngambek', emoji: '😤', search: 'anime pout angry', verb: 'ngambek ke', selfVerb: 'ngambek sendirian', color: '#FF6B6B' },
    { id: 'kepo', name: 'Kepo', emoji: '🧐', search: 'anime curious spy', verb: 'kepo-in', selfVerb: 'kepo sama diri sendiri', color: '#4169E1' },
    { id: 'bully', name: 'Bully', emoji: '😈', search: 'anime bully tease', verb: 'nge-bully', selfVerb: 'nge-bully diri sendiri', color: '#8B0000' },
    { id: 'bacot', name: 'Bacot', emoji: '🗣️', search: 'anime yell scream', verb: 'teriak ke', selfVerb: 'teriak sendiri', color: '#FF4500' },
    { id: 'kabur', name: 'Kabur', emoji: '🏃💨', search: 'anime run away', verb: 'kabur dari', selfVerb: 'kabur entah kemana', color: '#00CED1' },
    { id: 'manja', name: 'Manja', emoji: '🥺', search: 'anime clingy cute', verb: 'bermanja ke', selfVerb: 'manja sendirian', color: '#FFB6C1' },
];

// ==================== GIPHY API ====================
async function fetchTenorGif(searchTerm) {
    if (!GIPHY_API_KEY) return null;
    try {
        const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchTerm)}&limit=25&rating=pg-13&lang=en`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        if (!data.data || data.data.length === 0) return null;
        const gif = data.data[Math.floor(Math.random() * data.data.length)];
        return gif.images?.original?.url || gif.images?.downsized_medium?.url || null;
    } catch (e) {
        console.error('[social] Giphy API error:', e.message);
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
