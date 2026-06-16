// systems/robloxProfile.js — Roblox Avatar Viewer
//
// Command /roblox <username> — shows user's avatar, currently wearing items,
// and basic profile info. Uses public Roblox APIs (no key needed).
//
// APIs used:
//   - users.roblox.com/v1/usernames/users (username → userId)
//   - users.roblox.com/v1/users/{id} (profile info)
//   - avatar.roblox.com/v1/users/{id}/avatar (full avatar + items)
//   - thumbnails.roblox.com/v1/users/avatar (avatar image)
//   - economy.roblox.com/v1/users/{id}/currency (not used - private)

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

// ==================== API HELPERS ====================
async function robloxFetch(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': UA, Accept: 'application/json', ...options.headers },
            signal: controller.signal,
            ...options,
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        clearTimeout(timer);
        return null;
    }
}

// Username → User ID
async function resolveUserId(username) {
    const data = await robloxFetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
    if (!data || !data.data || !data.data.length) return null;
    return data.data[0]; // { requestedUsername, name, id }
}

// Get user profile info
async function getUserProfile(userId) {
    return await robloxFetch(`https://users.roblox.com/v1/users/${userId}`);
}

// Get avatar details (currently wearing items)
async function getAvatarDetails(userId) {
    return await robloxFetch(`https://avatar.roblox.com/v1/users/${userId}/avatar`);
}

// Get avatar thumbnail URL
async function getAvatarThumbnail(userId) {
    const data = await robloxFetch(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`
    );
    if (!data || !data.data || !data.data.length) return null;
    return data.data[0].imageUrl || null;
}

// Get headshot thumbnail
async function getHeadshotThumbnail(userId) {
    const data = await robloxFetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
    );
    if (!data || !data.data || !data.data.length) return null;
    return data.data[0].imageUrl || null;
}

// ==================== ITEM CATEGORIZATION ====================
const ASSET_TYPE_NAMES = {
    2: '👕 T-Shirt',
    8: '🎩 Hat',
    11: '👔 Shirt',
    12: '👖 Pants',
    17: '😊 Face',
    18: '⚙️ Gear',
    19: '🏷️ Badge',
    27: '🦾 Torso',
    28: '🦿 Right Arm',
    29: '🦿 Left Arm',
    30: '🦵 Right Leg',
    31: '🦵 Left Leg',
    41: '💇 Hair',
    42: '🎒 Accessory (Face)',
    43: '🎒 Accessory (Neck)',
    44: '🎒 Accessory (Shoulder)',
    45: '🎒 Accessory (Front)',
    46: '🎒 Accessory (Back)',
    47: '🎒 Accessory (Waist)',
    48: '🧥 Jacket',
    49: '👗 Sweater',
    50: '👖 Shorts',
    51: '🩳 Left Shoe',
    52: '🩳 Right Shoe',
    53: '👗 Dress/Skirt',
    64: '👕 T-Shirt Accessory',
    65: '👔 Shirt Accessory',
    66: '👖 Pants Accessory',
    67: '🧥 Jacket Accessory',
    68: '👗 Sweater Accessory',
    69: '👖 Shorts Accessory',
    70: '🩳 Left Shoe Accessory',
    71: '🩳 Right Shoe Accessory',
    72: '👗 Dress/Skirt Accessory',
};

function getAssetTypeName(typeId) {
    return ASSET_TYPE_NAMES[typeId] || `🎮 Item (${typeId})`;
}

// ==================== EMBED BUILDER ====================
function buildRobloxEmbed(profile, avatar, thumbnailUrl, headshotUrl) {
    const embed = new EmbedBuilder()
        .setColor('#E2231A') // Roblox red
        .setAuthor({ name: '🎮 Roblox Profile', iconURL: headshotUrl || undefined })
        .setTitle(profile.displayName || profile.name)
        .setURL(`https://www.roblox.com/users/${profile.id}/profile`)
        .setTimestamp();

    if (thumbnailUrl) embed.setImage(thumbnailUrl);

    // Description: basic info
    const lines = [];
    lines.push(`**Username:** \`${profile.name}\``);
    if (profile.displayName && profile.displayName !== profile.name) {
        lines.push(`**Display Name:** ${profile.displayName}`);
    }
    if (profile.description) {
        lines.push(`**Bio:** ${profile.description.slice(0, 150)}${profile.description.length > 150 ? '...' : ''}`);
    }
    const created = profile.created ? new Date(profile.created) : null;
    if (created) lines.push(`**Joined:** <t:${Math.floor(created.getTime() / 1000)}:D>`);
    if (profile.isBanned) lines.push('⛔ **BANNED**');

    embed.setDescription(lines.join('\n'));

    // Currently wearing items
    if (avatar && avatar.assets && avatar.assets.length) {
        // Group by type
        const grouped = {};
        for (const asset of avatar.assets) {
            const typeName = getAssetTypeName(asset.assetType?.id || 0);
            if (!grouped[typeName]) grouped[typeName] = [];
            grouped[typeName].push({
                name: asset.name || `ID: ${asset.id}`,
                id: asset.id,
            });
        }

        let itemList = '';
        for (const [type, items] of Object.entries(grouped)) {
            const itemNames = items.map(i => `[${i.name}](https://www.roblox.com/catalog/${i.id})`).join(', ');
            itemList += `${type}: ${itemNames}\n`;
        }

        // Discord embed field limit is 1024 chars
        if (itemList.length > 1024) {
            itemList = itemList.slice(0, 1020) + '...';
        }
        if (itemList) embed.addFields({ name: '👗 Currently Wearing', value: itemList, inline: false });
    }

    // Body colors
    if (avatar && avatar.bodyColors) {
        const bc = avatar.bodyColors;
        embed.addFields({
            name: '🎨 Body Colors',
            value: `Head: #${bc.headColorId || '?'} • Torso: #${bc.torsoColorId || '?'} • Legs: #${bc.leftLegColorId || '?'}`,
            inline: false,
        });
    }

    embed.setFooter({ text: `Roblox User ID: ${profile.id}` });
    return embed;
}

// ==================== COMMAND HANDLER ====================
async function handleRobloxCommand(interaction) {
    const username = interaction.options?.getString('username');
    if (!username || !username.trim()) {
        return interaction.reply({ content: '❌ Masukkan username Roblox!', ephemeral: true });
    }

    await interaction.deferReply();

    // Step 1: Resolve username → userId
    const userInfo = await resolveUserId(username.trim());
    if (!userInfo) {
        return interaction.editReply({ content: `❌ User Roblox **"${username}"** tidak ditemukan.` });
    }

    const userId = userInfo.id;

    // Step 2: Fetch all data in parallel
    const [profile, avatar, thumbnailUrl, headshotUrl] = await Promise.all([
        getUserProfile(userId),
        getAvatarDetails(userId),
        getAvatarThumbnail(userId),
        getHeadshotThumbnail(userId),
    ]);

    if (!profile) {
        return interaction.editReply({ content: '⚠️ Gagal mengambil profil Roblox. Coba lagi nanti.' });
    }

    const embed = buildRobloxEmbed(profile, avatar, thumbnailUrl, headshotUrl);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('🔗 Buka Profil')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://www.roblox.com/users/${userId}/profile`),
        new ButtonBuilder()
            .setLabel('🛒 Lihat Inventory')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://www.roblox.com/users/${userId}/inventory`)
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
}

// ==================== EXPORTS ====================
module.exports = {
    handleRobloxCommand,
    resolveUserId,
    getUserProfile,
    getAvatarDetails,
    getAvatarThumbnail,
};
