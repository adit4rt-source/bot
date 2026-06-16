// systems/robloxProfile.js — Roblox Avatar Viewer (Canvas Card)
//
// Command /roblox <username> — generates a canvas image showing the user's
// avatar and a grid of all items they're currently wearing (with thumbnails).
//
// APIs (all public, no key):
//   - users.roblox.com/v1/usernames/users
//   - users.roblox.com/v1/users/{id}
//   - avatar.roblox.com/v1/users/{id}/avatar
//   - thumbnails.roblox.com/v1/users/avatar
//   - thumbnails.roblox.com/v1/assets (batch item thumbnails)

const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
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

async function resolveUserId(username) {
    const data = await robloxFetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
    if (!data || !data.data || !data.data.length) return null;
    return data.data[0];
}

async function getUserProfile(userId) {
    return await robloxFetch(`https://users.roblox.com/v1/users/${userId}`);
}

async function getAvatarDetails(userId) {
    return await robloxFetch(`https://avatar.roblox.com/v1/users/${userId}/avatar`);
}

async function getAvatarThumbnail(userId) {
    const data = await robloxFetch(
        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=420x420&format=Png&isCircular=false`
    );
    if (!data || !data.data || !data.data.length) return null;
    return data.data[0].imageUrl || null;
}

// Get batch asset thumbnails (up to 100 at once)
async function getAssetThumbnails(assetIds) {
    if (!assetIds.length) return {};
    const ids = assetIds.slice(0, 100).join(',');
    const data = await robloxFetch(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${ids}&size=150x150&format=Png&isCircular=false`
    );
    if (!data || !data.data) return {};
    const map = {};
    for (const item of data.data) {
        if (item.imageUrl && item.state === 'Completed') {
            map[item.targetId] = item.imageUrl;
        }
    }
    return map;
}

// ==================== ASSET TYPE NAMES ====================
const ASSET_TYPE_SHORT = {
    2: 'T-Shirt', 8: 'Hat', 11: 'Shirt', 12: 'Pants', 17: 'Face', 18: 'Gear',
    27: 'Torso', 28: 'R.Arm', 29: 'L.Arm', 30: 'R.Leg', 31: 'L.Leg',
    41: 'Hair', 42: 'Face Acc', 43: 'Neck Acc', 44: 'Shoulder', 45: 'Front Acc',
    46: 'Back Acc', 47: 'Waist Acc', 48: 'Jacket', 49: 'Sweater', 50: 'Shorts',
    51: 'L.Shoe', 52: 'R.Shoe', 53: 'Dress', 64: 'T-Shirt', 65: 'Shirt',
    66: 'Pants', 67: 'Jacket', 68: 'Sweater', 69: 'Shorts', 70: 'L.Shoe',
    71: 'R.Shoe', 72: 'Dress', 79: 'Head',
};

// ==================== CANVAS CARD GENERATOR ====================
async function generateRobloxCard({ profile, avatar, avatarUrl, itemThumbnails }) {
    const items = (avatar && avatar.assets) || [];
    const itemCount = items.length;

    // Layout
    const COLS = 4;
    const ROWS = Math.max(2, Math.ceil(itemCount / COLS));
    const ITEM_SIZE = 120;
    const ITEM_PAD = 10;
    const AVATAR_W = 300;
    const HEADER_H = 80;
    const GRID_W = COLS * (ITEM_SIZE + ITEM_PAD) + ITEM_PAD;
    const GRID_H = ROWS * (ITEM_SIZE + 28 + ITEM_PAD) + ITEM_PAD;
    const W = AVATAR_W + GRID_W + 40;
    const H = Math.max(HEADER_H + 320 + 20, HEADER_H + GRID_H + 20);

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#1a1a2e');
    bg.addColorStop(0.5, '#16213e');
    bg.addColorStop(1, '#0f3460');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Header bar
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, W, HEADER_H);

    // Username + display name
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(profile.displayName || profile.name, 20, 35);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '16px sans-serif';
    ctx.fillText(`@${profile.name}`, 20, 60);

    // Roblox badge
    ctx.fillStyle = '#E2231A';
    ctx.font = 'bold 14px sans-serif';
    const badgeText = 'ROBLOX';
    const badgeW = ctx.measureText(badgeText).width + 16;
    const badgeX = W - badgeW - 15;
    ctx.beginPath();
    ctx.roundRect(badgeX, 15, badgeW, 24, 4);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(badgeText, badgeX + 8, 33);

    // Avatar image (left side)
    const avatarX = 15;
    const avatarY = HEADER_H + 10;
    const avatarSize = 280;

    if (avatarUrl) {
        try {
            const img = await loadImage(avatarUrl);
            // Rounded rect clip for avatar
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(avatarX, avatarY, avatarSize, avatarSize, 16);
            ctx.clip();
            ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
            ctx.restore();
            // Border
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(avatarX, avatarY, avatarSize, avatarSize, 16);
            ctx.stroke();
        } catch (_) {}
    }

    // Bio under avatar
    if (profile.description) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '12px sans-serif';
        const bio = profile.description.slice(0, 60) + (profile.description.length > 60 ? '...' : '');
        ctx.fillText(bio, avatarX, avatarY + avatarSize + 20);
    }

    // Item grid (right side)
    const gridX = AVATAR_W + 25;
    const gridY = HEADER_H + 10;

    // "Currently Wearing" label
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`👗 Currently Wearing (${itemCount} items)`, gridX, gridY);

    const startY = gridY + 20;

    for (let i = 0; i < itemCount && i < COLS * ROWS; i++) {
        const item = items[i];
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = gridX + col * (ITEM_SIZE + ITEM_PAD);
        const y = startY + row * (ITEM_SIZE + 28 + ITEM_PAD);

        // Item card background
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.roundRect(x, y, ITEM_SIZE, ITEM_SIZE + 24, 8);
        ctx.fill();

        // Item thumbnail
        const thumbUrl = itemThumbnails[item.id];
        if (thumbUrl) {
            try {
                const img = await loadImage(thumbUrl);
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(x + 4, y + 4, ITEM_SIZE - 8, ITEM_SIZE - 8, 6);
                ctx.clip();
                ctx.drawImage(img, x + 4, y + 4, ITEM_SIZE - 8, ITEM_SIZE - 8);
                ctx.restore();
            } catch (_) {
                // Placeholder
                ctx.fillStyle = 'rgba(255,255,255,0.05)';
                ctx.fillRect(x + 4, y + 4, ITEM_SIZE - 8, ITEM_SIZE - 8);
            }
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.fillRect(x + 4, y + 4, ITEM_SIZE - 8, ITEM_SIZE - 8);
        }

        // Item type label
        const typeId = item.assetType?.id || 0;
        const label = ASSET_TYPE_SHORT[typeId] || 'Item';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '10px sans-serif';
        const labelW = ctx.measureText(label).width;
        ctx.fillText(label, x + (ITEM_SIZE - labelW) / 2, y + ITEM_SIZE + 14);
    }

    // If more items than grid can show
    if (itemCount > COLS * ROWS) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '12px sans-serif';
        ctx.fillText(`+${itemCount - COLS * ROWS} more items...`, gridX, startY + ROWS * (ITEM_SIZE + 28 + ITEM_PAD) + 10);
    }

    return canvas.toBuffer('image/png');
}

// ==================== COMMAND HANDLER ====================
async function handleRobloxCommand(interaction) {
    const username = interaction.options?.getString('username');
    if (!username || !username.trim()) {
        return interaction.reply({ content: '❌ Masukkan username Roblox!', ephemeral: true });
    }

    await interaction.deferReply();

    // Step 1: Resolve username
    const userInfo = await resolveUserId(username.trim());
    if (!userInfo) {
        return interaction.editReply({ content: `❌ User Roblox **"${username}"** tidak ditemukan.` });
    }

    const userId = userInfo.id;

    // Step 2: Fetch all data in parallel
    const [profile, avatar, avatarUrl] = await Promise.all([
        getUserProfile(userId),
        getAvatarDetails(userId),
        getAvatarThumbnail(userId),
    ]);

    if (!profile) {
        return interaction.editReply({ content: '⚠️ Gagal mengambil profil Roblox. Coba lagi nanti.' });
    }

    // Step 3: Get item thumbnails (batch)
    const assetIds = (avatar?.assets || []).map(a => a.id).filter(Boolean);
    const itemThumbnails = await getAssetThumbnails(assetIds);

    // Step 4: Generate canvas card
    let cardBuffer = null;
    try {
        cardBuffer = await generateRobloxCard({ profile, avatar, avatarUrl, itemThumbnails });
    } catch (e) {
        log('WARN', `[roblox] Canvas generation failed: ${e.message}`);
    }

    // Build embed
    const embed = new EmbedBuilder()
        .setColor('#E2231A')
        .setAuthor({ name: `🎮 ${profile.displayName || profile.name}`, url: `https://www.roblox.com/users/${userId}/profile` })
        .setTimestamp();

    const created = profile.created ? new Date(profile.created) : null;
    const desc = [
        `**@${profile.name}**`,
        created ? `📅 Joined <t:${Math.floor(created.getTime() / 1000)}:D>` : '',
        profile.description ? `> ${profile.description.slice(0, 100)}${profile.description.length > 100 ? '...' : ''}` : '',
        `👗 **${assetIds.length}** items equipped`,
    ].filter(Boolean).join('\n');
    embed.setDescription(desc);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('🔗 Profil')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://www.roblox.com/users/${userId}/profile`),
        new ButtonBuilder()
            .setLabel('🛒 Inventory')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://www.roblox.com/users/${userId}/inventory`)
    );

    const files = [];
    if (cardBuffer) {
        files.push(new AttachmentBuilder(cardBuffer, { name: 'roblox-profile.png' }));
        embed.setImage('attachment://roblox-profile.png');
    } else if (avatarUrl) {
        embed.setImage(avatarUrl);
    }

    return interaction.editReply({ embeds: [embed], files, components: [row] });
}

// ==================== EXPORTS ====================
module.exports = {
    handleRobloxCommand,
    resolveUserId,
    getUserProfile,
    getAvatarDetails,
    getAvatarThumbnail,
    getAssetThumbnails,
    generateRobloxCard,
};
