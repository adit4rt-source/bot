// systems/cardGame.js — Anime Card Gacha System (Sofi-style)
// Drop cards, grab, collect, trade — powered by AniList API + Canvas
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { db, getOrCreateUser, incrementUserStat } = require('../database');
const path = require('path');
const state = require('../state');

// Load fonts
try {
    GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'fonts', 'Poppins-Bold.ttf'), 'Poppins Bold');
    GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'fonts', 'Poppins-SemiBold.ttf'), 'Poppins SemiBold');
} catch (_) {}

// ==================== DB TABLES ====================
db.exec(`CREATE TABLE IF NOT EXISTS anime_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    charId INTEGER,
    charName TEXT,
    charNameNative TEXT,
    series TEXT,
    imageUrl TEXT,
    rarity TEXT,
    printNumber INTEGER DEFAULT 1,
    favourites INTEGER DEFAULT 0,
    obtainedAt INTEGER,
    locked INTEGER DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS card_prints (
    charId INTEGER PRIMARY KEY,
    totalPrints INTEGER DEFAULT 0
)`);

// ==================== RARITY SYSTEM ====================
const RARITIES = {
    Common:    { emoji: '⚪', color: '#AAAAAA', weight: 55, minFav: 0 },
    Uncommon:  { emoji: '🟢', color: '#2ECC71', weight: 25, minFav: 500 },
    Rare:      { emoji: '🔵', color: '#3498DB', weight: 12, minFav: 2000 },
    Epic:      { emoji: '🟣', color: '#9B59B6', weight: 5, minFav: 8000 },
    Legendary: { emoji: '🟡', color: '#FFD700', weight: 2.5, minFav: 20000 },
    Mythic:    { emoji: '🔴', color: '#E74C3C', weight: 0.4, minFav: 35000 },
    God:       { emoji: '👑', color: '#FF0000', weight: 0.1, minFav: 40000 },
};

function rollRarity() {
    const r = Math.random() * 100;
    let cumulative = 0;
    for (const [name, data] of Object.entries(RARITIES)) {
        cumulative += data.weight;
        if (r <= cumulative) return name;
    }
    return 'Common';
}

function getRarityFromFavourites(fav) {
    if (fav >= 40000) return 'God';
    if (fav >= 35000) return 'Mythic';
    if (fav >= 20000) return 'Legendary';
    if (fav >= 8000) return 'Epic';
    if (fav >= 2000) return 'Rare';
    if (fav >= 500) return 'Uncommon';
    return 'Common';
}

// ==================== ANILIST API ====================
const ANILIST_URL = 'https://graphql.anilist.co';

async function fetchRandomCharacters(count = 3) {
    const characters = [];
    const rarities = [];
    for (let i = 0; i < count; i++) rarities.push(rollRarity());

    // Fetch characters based on rolled rarities
    for (const rarity of rarities) {
        const char = await fetchCharacterByRarity(rarity);
        if (char) characters.push({ ...char, rarity });
        else {
            // Fallback: fetch any random popular character
            const fallback = await fetchCharacterByRarity('Common');
            if (fallback) characters.push({ ...fallback, rarity: 'Common' });
        }
    }
    return characters;
}

async function fetchCharacterByRarity(rarity) {
    const rarityData = RARITIES[rarity];
    // Use favourites range to target rarity-appropriate characters
    const maxPage = rarity === 'God' ? 2 : rarity === 'Mythic' ? 3 : rarity === 'Legendary' ? 5 :
                    rarity === 'Epic' ? 15 : rarity === 'Rare' ? 40 : rarity === 'Uncommon' ? 80 : 200;
    const page = Math.floor(Math.random() * maxPage) + 1;

    const query = `
    query($page: Int) {
        Page(page: $page, perPage: 20) {
            characters(sort: FAVOURITES_DESC) {
                id
                name { full native }
                image { large }
                favourites
                media(page: 1, perPage: 1, sort: POPULARITY_DESC) {
                    nodes { title { romaji english } type }
                }
            }
        }
    }`;

    try {
        const res = await fetch(ANILIST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { page } })
        });
        if (!res.ok) return null;
        const data = await res.json();
        const chars = data?.data?.Page?.characters;
        if (!chars || chars.length === 0) return null;

        // Pick random from the page
        const char = chars[Math.floor(Math.random() * chars.length)];
        if (!char.image?.large) return null;

        const series = char.media?.nodes?.[0]?.title?.romaji || char.media?.nodes?.[0]?.title?.english || 'Unknown';
        return {
            charId: char.id,
            name: char.name.full,
            nameNative: char.name.native || '',
            series,
            imageUrl: char.image.large,
            favourites: char.favourites || 0,
        };
    } catch (e) {
        console.error('[cardGame] AniList fetch error:', e.message);
        return null;
    }
}

// ==================== PRINT NUMBER ====================
function getNextPrint(charId) {
    const row = db.prepare('SELECT totalPrints FROM card_prints WHERE charId = ?').get(charId);
    if (!row) {
        db.prepare('INSERT INTO card_prints (charId, totalPrints) VALUES (?, 1)').run(charId);
        return 1;
    }
    const next = row.totalPrints + 1;
    db.prepare('UPDATE card_prints SET totalPrints = ? WHERE charId = ?').run(next, charId);
    return next;
}

// ==================== CARD IMAGE GENERATOR ====================
async function generateCardImage(charData) {
    const { name, series, rarity, imageUrl, printNumber } = charData;
    const rarityData = RARITIES[rarity] || RARITIES.Common;

    // Card dimensions
    const cardW = 320;
    const cardH = 450;
    const canvas = createCanvas(cardW, cardH);
    const ctx = canvas.getContext('2d');

    // === BACKGROUND (dark) ===
    ctx.fillStyle = '#0D0D0D';
    ctx.fillRect(0, 0, cardW, cardH);

    // === CHARACTER IMAGE ===
    try {
        const img = await loadImage(imageUrl);
        const imgW = cardW - 24;
        const imgH = 300;
        const imgX = 12;
        const imgY = 12;

        // Draw image (cover fit)
        ctx.save();
        roundRectPath(ctx, imgX, imgY, imgW, imgH, 8);
        ctx.clip();
        // Calculate cover dimensions
        const scale = Math.max(imgW / img.width, imgH / img.height);
        const sw = img.width * scale;
        const sh = img.height * scale;
        const sx = imgX + (imgW - sw) / 2;
        const sy = imgY + (imgH - sh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh);
        ctx.restore();

        // Gradient overlay at bottom of image
        const grad = ctx.createLinearGradient(0, imgY + imgH - 80, 0, imgY + imgH);
        grad.addColorStop(0, 'rgba(13,13,13,0)');
        grad.addColorStop(1, 'rgba(13,13,13,0.9)');
        ctx.fillStyle = grad;
        roundRectPath(ctx, imgX, imgY, imgW, imgH, 8);
        ctx.fill();
    } catch (e) {
        // Fallback: solid color if image fails
        ctx.fillStyle = '#1A1A2E';
        roundRectPath(ctx, 12, 12, cardW - 24, 300, 8);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px "Poppins SemiBold"';
        ctx.textAlign = 'center';
        ctx.fillText('Image unavailable', cardW / 2, 160);
    }

    // === RARITY BORDER (accent) ===
    roundRectPath(ctx, 3, 3, cardW - 6, cardH - 6, 12);
    ctx.strokeStyle = rarityData.color;
    ctx.lineWidth = 3;
    ctx.stroke();

    // === OUTER BORDER ===
    roundRectPath(ctx, 0, 0, cardW, cardH, 14);
    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth = 2;
    ctx.stroke();

    // === RARITY BADGE (top-left) ===
    const badgeW = 90;
    const badgeH = 22;
    ctx.fillStyle = rarityData.color;
    roundRectPath(ctx, 16, 18, badgeW, badgeH, 4);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '11px "Poppins Bold"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${rarityData.emoji} ${rarity.toUpperCase()}`, 16 + badgeW / 2, 18 + badgeH / 2);

    // === PRINT NUMBER (top-right) ===
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    roundRectPath(ctx, cardW - 70, 18, 54, 22, 4);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '11px "Poppins SemiBold"';
    ctx.textAlign = 'center';
    ctx.fillText(`#${String(printNumber).padStart(4, '0')}`, cardW - 43, 29);

    // === CHARACTER NAME ===
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '16px "Poppins Bold"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const nameY = 325;
    const maxNameW = cardW - 30;
    let displayName = name;
    while (ctx.measureText(displayName).width > maxNameW && displayName.length > 3) {
        displayName = displayName.slice(0, -1);
    }
    if (displayName !== name) displayName += '…';
    ctx.fillText(displayName, 15, nameY);

    // === SERIES NAME ===
    ctx.fillStyle = '#999999';
    ctx.font = '12px "Poppins SemiBold"';
    let displaySeries = series;
    while (ctx.measureText(displaySeries).width > maxNameW && displaySeries.length > 3) {
        displaySeries = displaySeries.slice(0, -1);
    }
    if (displaySeries !== series) displaySeries += '…';
    ctx.fillText(displaySeries, 15, nameY + 22);

    // === BOTTOM ACCENT BAR ===
    ctx.fillStyle = rarityData.color;
    roundRectPath(ctx, 12, cardH - 38, cardW - 24, 4, 2);
    ctx.fill();

    // === FAVOURITES / STATS ===
    ctx.fillStyle = '#666666';
    ctx.font = '10px "Poppins SemiBold"';
    ctx.textAlign = 'left';
    ctx.fillText(`❤️ ${(charData.favourites || 0).toLocaleString('id-ID')} fans`, 15, cardH - 22);

    ctx.textAlign = 'right';
    ctx.fillStyle = rarityData.color;
    ctx.fillText(`★ ${rarity}`, cardW - 15, cardH - 22);

    return canvas.toBuffer('image/png');
}

// Helper: rounded rect path
function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

// ==================== GENERATE DROP IMAGE (3 cards side by side) ====================
async function generateDropImage(cards) {
    const cardW = 320;
    const cardH = 450;
    const gap = 15;
    const totalW = cardW * 3 + gap * 2 + 30;
    const totalH = cardH + 30;

    const canvas = createCanvas(totalW, totalH);
    const ctx = canvas.getContext('2d');

    // Dark background
    ctx.fillStyle = '#0D0D0D';
    ctx.fillRect(0, 0, totalW, totalH);

    // Generate each card and composite
    for (let i = 0; i < cards.length; i++) {
        const cardBuffer = await generateCardImage(cards[i]);
        const cardImg = await loadImage(cardBuffer);
        const x = 15 + i * (cardW + gap);
        const y = 15;
        ctx.drawImage(cardImg, x, y, cardW, cardH);
    }

    return canvas.toBuffer('image/png');
}

// ==================== DROP COMMAND ====================
async function handleDropCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // Cooldown: 8 minutes between drops
    const cdKey = `card_drop_${userId}`;
    const cooldownMs = 8 * 60 * 1000;
    if (state.fishCooldowns.has(cdKey) && Date.now() < state.fishCooldowns.get(cdKey)) {
        const remaining = Math.ceil((state.fishCooldowns.get(cdKey) - Date.now()) / 1000);
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        return interaction.reply({ content: `⏳ Drop cooldown! Tunggu **${mins}m ${secs}s** lagi.`, ephemeral: true });
    }
    state.fishCooldowns.set(cdKey, Date.now() + cooldownMs);

    await interaction.deferReply();

    try {
        // Fetch 3 random characters
        const characters = await fetchRandomCharacters(3);
        if (characters.length < 3) {
            state.fishCooldowns.delete(cdKey);
            return interaction.editReply({ content: '❌ Gagal fetch karakter dari AniList. Coba lagi!' });
        }

        // Assign print numbers
        const cards = characters.map(c => ({
            ...c,
            printNumber: getNextPrint(c.charId),
        }));

        // Generate drop image
        const dropImage = await generateDropImage(cards);
        const attachment = new AttachmentBuilder(dropImage, { name: 'drop.png' });

        // Store drop state for grab
        const dropId = `${guildId}_${Date.now()}`;
        state.activeCardDrops = state.activeCardDrops || new Map();
        state.activeCardDrops.set(dropId, {
            cards,
            grabbed: [false, false, false],
            droppedBy: userId,
            timestamp: Date.now(),
        });

        // Clean old drops (> 60 seconds)
        for (const [key, drop] of state.activeCardDrops) {
            if (Date.now() - drop.timestamp > 60000) state.activeCardDrops.delete(key);
        }

        const rarityLine = cards.map((c, i) => {
            const rd = RARITIES[c.rarity];
            return `**${i + 1}.** ${rd.emoji} ${c.name} — *${c.series}*`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('🎴 CARD DROP!')
            .setDescription(`${rarityLine}\n\n> Klik tombol di bawah untuk grab kartu!\n> ⏱️ Hilang dalam 60 detik`)
            .setImage('attachment://drop.png')
            .setFooter({ text: `Dropped by ${interaction.user.username} • Grab cooldown: 4 min` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`cardgrab_${dropId}_0`).setLabel('1').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`cardgrab_${dropId}_1`).setLabel('2').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`cardgrab_${dropId}_2`).setLabel('3').setStyle(ButtonStyle.Primary),
        );

        const msg = await interaction.editReply({ embeds: [embed], files: [attachment], components: [row] });

        // Auto-expire after 60 seconds
        setTimeout(() => {
            if (state.activeCardDrops.has(dropId)) {
                state.activeCardDrops.delete(dropId);
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`cardgrab_expired_0`).setLabel('1').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId(`cardgrab_expired_1`).setLabel('2').setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId(`cardgrab_expired_2`).setLabel('3').setStyle(ButtonStyle.Secondary).setDisabled(true),
                );
                interaction.editReply({ components: [disabledRow] }).catch(() => {});
            }
        }, 60000);

    } catch (e) {
        console.error('[cardGame] Drop error:', e);
        state.fishCooldowns.delete(cdKey);
        return interaction.editReply({ content: '❌ Error saat generate drop. Coba lagi!' });
    }
}

// ==================== GRAB HANDLER ====================
async function handleCardGrab(interaction) {
    const parts = interaction.customId.split('_');
    // cardgrab_<dropId>_<index>
    const dropId = parts[1] + '_' + parts[2]; // reconstruct guildId_timestamp
    const cardIndex = parseInt(parts[3]);
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    state.activeCardDrops = state.activeCardDrops || new Map();
    const drop = state.activeCardDrops.get(dropId);

    if (!drop) {
        return interaction.reply({ content: '❌ Drop ini sudah expired!', ephemeral: true });
    }

    if (cardIndex < 0 || cardIndex > 2) {
        return interaction.reply({ content: '❌ Invalid card index.', ephemeral: true });
    }

    if (drop.grabbed[cardIndex]) {
        return interaction.reply({ content: '❌ Kartu ini sudah di-grab orang lain!', ephemeral: true });
    }

    // Grab cooldown: 4 minutes per user
    const grabCdKey = `card_grab_${userId}`;
    const grabCooldownMs = 4 * 60 * 1000;
    if (state.fishCooldowns.has(grabCdKey) && Date.now() < state.fishCooldowns.get(grabCdKey)) {
        const remaining = Math.ceil((state.fishCooldowns.get(grabCdKey) - Date.now()) / 1000);
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        return interaction.reply({ content: `⏳ Grab cooldown! Tunggu **${mins}m ${secs}s** lagi.`, ephemeral: true });
    }
    state.fishCooldowns.set(grabCdKey, Date.now() + grabCooldownMs);

    // Mark as grabbed
    drop.grabbed[cardIndex] = true;
    const card = drop.cards[cardIndex];

    // Save to DB
    db.prepare('INSERT INTO anime_cards (userId, charId, charName, charNameNative, series, imageUrl, rarity, printNumber, favourites, obtainedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        userId, card.charId, card.name, card.nameNative || '', card.series, card.imageUrl, card.rarity, card.printNumber, card.favourites, Date.now()
    );

    incrementUserStat(guildId, userId, 'cards_grabbed');

    const rarityData = RARITIES[card.rarity];
    await interaction.reply({
        content: `${rarityData.emoji} <@${userId}> grabbed **${card.name}** from *${card.series}*! (${card.rarity} #${String(card.printNumber).padStart(4, '0')})`,
        allowedMentions: { users: [] }
    });

    // Update buttons (disable grabbed ones)
    const newRow = new ActionRowBuilder();
    for (let i = 0; i < 3; i++) {
        const btn = new ButtonBuilder()
            .setCustomId(drop.grabbed[i] ? `cardgrab_claimed_${i}` : `cardgrab_${dropId}_${i}`)
            .setLabel(drop.grabbed[i] ? '✓' : String(i + 1))
            .setStyle(drop.grabbed[i] ? ButtonStyle.Success : ButtonStyle.Primary)
            .setDisabled(drop.grabbed[i]);
        newRow.addComponents(btn);
    }
    try { await interaction.message.edit({ components: [newRow] }); } catch (_) {}

    // If all grabbed, delete drop state
    if (drop.grabbed.every(g => g)) state.activeCardDrops.delete(dropId);
}

// ==================== COLLECTION COMMAND ====================
async function handleCardsCommand(interaction) {
    const userId = interaction.user.id;
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const targetId = targetUser.id;

    const cards = db.prepare('SELECT * FROM anime_cards WHERE userId = ? ORDER BY obtainedAt DESC LIMIT 20').all(targetId);
    const totalCards = db.prepare('SELECT COUNT(*) as c FROM anime_cards WHERE userId = ?').get(targetId);
    const uniqueChars = db.prepare('SELECT COUNT(DISTINCT charId) as c FROM anime_cards WHERE userId = ?').get(targetId);

    if (cards.length === 0) {
        return interaction.reply({ content: `📭 ${targetUser.username} belum punya kartu anime. Gunakan \`/drop\` untuk mulai collect!`, ephemeral: true });
    }

    let desc = `🎴 **${targetUser.username}'s Collection**\n`;
    desc += `> 📊 Total: **${totalCards.c}** kartu | **${uniqueChars.c}** karakter unik\n\n`;

    const tierOrder = ['God', 'Mythic', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'];
    const sorted = cards.sort((a, b) => tierOrder.indexOf(a.rarity) - tierOrder.indexOf(b.rarity));

    for (const card of sorted.slice(0, 15)) {
        const rd = RARITIES[card.rarity];
        desc += `${rd.emoji} **${card.charName}** — *${card.series}*\n`;
        desc += `> #${String(card.printNumber).padStart(4, '0')} • ${card.rarity}${card.locked ? ' 🔒' : ''}\n`;
    }
    if (totalCards.c > 15) desc += `\n*...dan ${totalCards.c - 15} kartu lainnya*`;

    const embed = new EmbedBuilder()
        .setTitle('🎴 Card Collection')
        .setColor('#E74C3C')
        .setDescription(desc)
        .setFooter({ text: `Gunakan /cardview <id> untuk melihat detail kartu` })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

// ==================== CARD VIEW COMMAND ====================
async function handleCardViewCommand(interaction) {
    const cardId = interaction.options.getInteger('id');
    const card = db.prepare('SELECT * FROM anime_cards WHERE id = ?').get(cardId);

    if (!card) return interaction.reply({ content: '❌ Kartu tidak ditemukan!', ephemeral: true });

    await interaction.deferReply();

    try {
        const cardImage = await generateCardImage({
            name: card.charName,
            series: card.series,
            rarity: card.rarity,
            imageUrl: card.imageUrl,
            printNumber: card.printNumber,
            favourites: card.favourites,
        });

        const attachment = new AttachmentBuilder(cardImage, { name: 'card.png' });
        const rd = RARITIES[card.rarity];

        const embed = new EmbedBuilder()
            .setColor(rd.color)
            .setTitle(`${rd.emoji} ${card.charName}`)
            .setDescription(
                `**Series:** ${card.series}\n` +
                `**Rarity:** ${rd.emoji} ${card.rarity}\n` +
                `**Print:** #${String(card.printNumber).padStart(4, '0')}\n` +
                `**Fans:** ❤️ ${card.favourites.toLocaleString('id-ID')}\n` +
                `**Owner:** <@${card.userId}>\n` +
                `**Obtained:** <t:${Math.floor(card.obtainedAt / 1000)}:R>`
            )
            .setImage('attachment://card.png')
            .setFooter({ text: `Card ID: ${card.id}` });

        return interaction.editReply({ embeds: [embed], files: [attachment] });
    } catch (e) {
        return interaction.editReply({ content: '❌ Gagal generate gambar kartu.' });
    }
}

// ==================== DETECTORS ====================
function isCardGrabButton(customId) {
    return typeof customId === 'string' && customId.startsWith('cardgrab_') && !customId.startsWith('cardgrab_expired') && !customId.startsWith('cardgrab_claimed');
}

module.exports = {
    handleDropCommand,
    handleCardGrab,
    handleCardsCommand,
    handleCardViewCommand,
    isCardGrabButton,
    generateCardImage,
    generateDropImage,
    fetchRandomCharacters,
    RARITIES,
};
