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
    // Try official Roblox first, then roproxy mirror (no rate-limit), with retries.
    const hosts = [
        'https://avatar.roblox.com',
        'https://avatar.roproxy.com',
    ];
    for (const host of hosts) {
        for (let attempt = 0; attempt < 2; attempt++) {
            const data = await robloxFetch(`${host}/v1/users/${userId}/avatar`);
            if (data && data.assets && data.assets.length) return data;
            await new Promise(r => setTimeout(r, 400));
        }
    }
    return null;
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

    // Layout — wide landscape card with bigger avatar
    const COLS = 5;
    const ROWS = Math.max(2, Math.ceil(itemCount / COLS));
    const ITEM_SIZE = 160;
    const ITEM_PAD = 14;
    const LABEL_H = 42;
    const AVATAR_W = 460;
    const AVATAR_H = 520;
    const HEADER_H = 110;
    const SIDE_PAD = 35;

    const GRID_W = COLS * (ITEM_SIZE + ITEM_PAD) + ITEM_PAD;
    const GRID_H = ROWS * (ITEM_SIZE + LABEL_H + ITEM_PAD) + ITEM_PAD;
    const W = AVATAR_W + GRID_W + SIDE_PAD * 3;
    const H = Math.max(HEADER_H + AVATAR_H + 80, HEADER_H + GRID_H + 50);

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Premium dark gradient background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0a0a1a');
    bg.addColorStop(0.5, '#16213e');
    bg.addColorStop(1, '#1a1a3e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Decorative red glow on top-right (Roblox accent)
    const glow = ctx.createRadialGradient(W - 100, 50, 0, W - 100, 50, 400);
    glow.addColorStop(0, 'rgba(226, 35, 26, 0.15)');
    glow.addColorStop(1, 'rgba(226, 35, 26, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Subtle dot pattern
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let gx = 0; gx < W; gx += 30) {
        for (let gy = 0; gy < H; gy += 30) {
            ctx.fillRect(gx, gy, 2, 2);
        }
    }

    // Header bar
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, HEADER_H);
    // Header bottom border
    ctx.fillStyle = 'rgba(226, 35, 26, 0.6)';
    ctx.fillRect(0, HEADER_H - 2, W, 2);

    // Display name (big)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText(profile.displayName || profile.name, SIDE_PAD, 52);

    // Username
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '18px sans-serif';
    ctx.fillText(`@${profile.name}`, SIDE_PAD, 82);

    // Roblox badge (top right)
    ctx.fillStyle = '#E2231A';
    ctx.font = 'bold 18px sans-serif';
    const badgeText = '🎮 ROBLOX';
    const badgeW = ctx.measureText(badgeText).width + 26;
    const badgeX = W - badgeW - SIDE_PAD;
    ctx.beginPath();
    ctx.roundRect(badgeX, 25, badgeW, 36, 8);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(badgeText, badgeX + 13, 49);

    // Item count badge
    const countText = `${itemCount} ITEMS`;
    ctx.font = 'bold 13px sans-serif';
    const countW = ctx.measureText(countText).width + 20;
    const countX = badgeX - countW - 10;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.roundRect(countX, 30, countW, 26, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(countText, countX + 10, 48);

    // Avatar (left, BIG)
    const avatarX = SIDE_PAD;
    const avatarY = HEADER_H + 25;
    const avatarCardW = AVATAR_W - 30;

    // Avatar background card with subtle gradient
    const avBg = ctx.createLinearGradient(avatarX, avatarY, avatarX, avatarY + AVATAR_H);
    avBg.addColorStop(0, 'rgba(255,255,255,0.08)');
    avBg.addColorStop(1, 'rgba(255,255,255,0.03)');
    ctx.fillStyle = avBg;
    ctx.beginPath();
    ctx.roundRect(avatarX, avatarY, avatarCardW, AVATAR_H, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Avatar image (preserve aspect ratio, centered)
    if (avatarUrl) {
        try {
            const img = await loadImage(avatarUrl);
            const imgSize = Math.min(avatarCardW - 20, AVATAR_H - 20);
            const imgX = avatarX + (avatarCardW - imgSize) / 2;
            const imgY = avatarY + (AVATAR_H - imgSize) / 2;
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(avatarX + 8, avatarY + 8, avatarCardW - 16, AVATAR_H - 16, 16);
            ctx.clip();
            ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
            ctx.restore();
        } catch (_) {}
    }

    // Bio under avatar
    const bioY = avatarY + AVATAR_H + 22;
    if (profile.description) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = 'italic 14px sans-serif';
        const bio = profile.description.slice(0, 55) + (profile.description.length > 55 ? '...' : '');
        ctx.fillText(`"${bio}"`, avatarX, bioY);
    }

    // Joined date
    const created = profile.created ? new Date(profile.created) : null;
    if (created) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '13px sans-serif';
        ctx.fillText(`📅 Joined ${created.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`, avatarX, bioY + 22);
    }

    // Item grid (right side)
    const gridX = AVATAR_W + SIDE_PAD;
    const gridStartY = HEADER_H + 25;

    // "Currently Wearing" header with accent line
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('👗 Currently Wearing', gridX, gridStartY + 8);
    // Accent underline
    ctx.fillStyle = '#E2231A';
    ctx.fillRect(gridX, gridStartY + 16, 80, 3);

    const startY = gridStartY + 38;

    for (let i = 0; i < itemCount && i < COLS * ROWS; i++) {
        const item = items[i];
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = gridX + col * (ITEM_SIZE + ITEM_PAD);
        const y = startY + row * (ITEM_SIZE + LABEL_H + ITEM_PAD);

        // Item card with subtle gradient
        const cardBg = ctx.createLinearGradient(x, y, x, y + ITEM_SIZE + LABEL_H);
        cardBg.addColorStop(0, 'rgba(255,255,255,0.1)');
        cardBg.addColorStop(1, 'rgba(255,255,255,0.04)');
        ctx.fillStyle = cardBg;
        ctx.beginPath();
        ctx.roundRect(x, y, ITEM_SIZE, ITEM_SIZE + LABEL_H, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Item thumbnail
        const thumbUrl = itemThumbnails[item.id];
        if (thumbUrl) {
            try {
                const img = await loadImage(thumbUrl);
                ctx.save();
                ctx.beginPath();
                ctx.roundRect(x + 8, y + 8, ITEM_SIZE - 16, ITEM_SIZE - 16, 8);
                ctx.clip();
                ctx.drawImage(img, x + 8, y + 8, ITEM_SIZE - 16, ITEM_SIZE - 16);
                ctx.restore();
            } catch (_) {
                ctx.fillStyle = 'rgba(255,255,255,0.04)';
                ctx.fillRect(x + 8, y + 8, ITEM_SIZE - 16, ITEM_SIZE - 16);
            }
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fillRect(x + 8, y + 8, ITEM_SIZE - 16, ITEM_SIZE - 16);
        }

        // Item name (full, can wrap if needed)
        const fullName = item.name || 'Unknown';
        const itemName = fullName.length > 18 ? fullName.slice(0, 18) + '...' : fullName;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = 'bold 12px sans-serif';
        const nameW = ctx.measureText(itemName).width;
        ctx.fillText(itemName, x + (ITEM_SIZE - nameW) / 2, y + ITEM_SIZE + 18);

        // Item type label (small) — prefer real assetType name from API
        const label = item.assetType?.name || ASSET_TYPE_SHORT[item.assetType?.id || 0] || 'Item';
        ctx.fillStyle = '#E2231A';
        ctx.font = 'bold 10px sans-serif';
        const labelW = ctx.measureText(label).width;
        ctx.fillText(label.toUpperCase(), x + (ITEM_SIZE - labelW) / 2, y + ITEM_SIZE + 34);
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
    const [profile, avatarRaw, avatarUrl] = await Promise.all([
        getUserProfile(userId),
        getAvatarDetails(userId),
        getAvatarThumbnail(userId),
    ]);

    if (!profile) {
        return interaction.editReply({ content: '⚠️ Gagal mengambil profil Roblox. Coba lagi nanti.' });
    }

    // Filter out animation/emote items — only show wearable items
    const isAnimation = (a) => {
        const typeName = (a.assetType?.name || '').toLowerCase();
        return typeName.includes('animation') || typeName.includes('emote') || typeName === 'mood';
    };
    const avatar = avatarRaw
        ? { ...avatarRaw, assets: (avatarRaw.assets || []).filter(a => !isAnimation(a)) }
        : null;

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

    // Send the main embed with canvas
    await interaction.editReply({ embeds: [embed], files, components: [row] });

    // Send item list as a clean follow-up — grouped by type
    const allItems = (avatar?.assets || []);
    if (allItems.length) {
        // Group by type name
        const grouped = {};
        for (const a of allItems) {
            const type = a.assetType?.name || ASSET_TYPE_SHORT[a.assetType?.id || 0] || 'Other';
            if (!grouped[type]) grouped[type] = [];
            grouped[type].push(a);
        }

        let body = '';
        for (const [type, list] of Object.entries(grouped)) {
            body += `\n**${type}**\n`;
            for (const a of list) {
                const name = a.name && !a.name.startsWith('Item ') ? a.name : `Asset ${a.id}`;
                body += `• [${name}](https://www.roblox.com/catalog/${a.id})\n`;
            }
        }

        // Split into chunks (Discord 2000 char limit) on line boundaries
        const lines = body.trim().split('\n');
        const chunks = [];
        let cur = `📋 **Item List — ${allItems.length} items**\n`;
        for (const line of lines) {
            if ((cur + '\n' + line).length > 1900) {
                chunks.push(cur);
                cur = '';
            }
            cur += (cur ? '\n' : '') + line;
        }
        if (cur.trim()) chunks.push(cur);

        for (const chunk of chunks) {
            await interaction.followUp({ content: chunk }).catch(() => {});
        }
    }

    return;
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
