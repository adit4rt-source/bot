// systems/cardGame.js — Anime Card Gacha System (Sofi-style)
// Drop cards, grab, collect, trade — powered by AniList API + Canvas
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { db, getOrCreateUser, incrementUserStat } = require('../database');
const path = require('path');
const state = require('../state');
const { KPOP_IDOLS } = require('../data/kpop');

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

// ==================== CARD IMAGE GENERATOR (Premium Sofi-style v3) ====================
async function generateCardImage(charData) {
    const { name, series, rarity, imageUrl, printNumber } = charData;
    const rarityData = RARITIES[rarity] || RARITIES.Common;

    const cardW = 350;
    const cardH = 500;
    const borderW = 4;
    const radius = 16;
    const canvas = createCanvas(cardW, cardH);
    const ctx = canvas.getContext('2d');

    // === OUTER GLOW (layered rarity strokes) ===
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cardW, cardH);
    for (let i = 3; i >= 1; i--) {
        roundRectPath(ctx, i, i, cardW - i * 2, cardH - i * 2, radius);
        ctx.strokeStyle = rarityData.color + (i === 3 ? '40' : i === 2 ? '80' : 'CC');
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // === CARD BODY ===
    roundRectPath(ctx, borderW, borderW, cardW - borderW * 2, cardH - borderW * 2, radius - 2);
    ctx.fillStyle = '#0D0D0D';
    ctx.fill();

    // === CHARACTER IMAGE (full-bleed) ===
    const imgPad = borderW + 2;
    const imgX = imgPad;
    const imgY = imgPad;
    const imgW = cardW - imgPad * 2;
    const imgH = cardH - imgPad * 2;

    try {
        const img = await loadImage(imageUrl);
        ctx.save();
        roundRectPath(ctx, imgX, imgY, imgW, imgH, radius - 3);
        ctx.clip();
        const scale = Math.max(imgW / img.width, imgH / img.height);
        const sw = img.width * scale;
        const sh = img.height * scale;
        const sx = imgX + (imgW - sw) / 2;
        const sy = imgY + (imgH - sh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh);

        // Top vignette
        const topGrad = ctx.createLinearGradient(0, imgY, 0, imgY + 80);
        topGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
        topGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = topGrad;
        ctx.fillRect(imgX, imgY, imgW, 80);

        // Bottom gradient
        const botGrad = ctx.createLinearGradient(0, cardH - 180, 0, cardH - imgPad);
        botGrad.addColorStop(0, 'rgba(0,0,0,0)');
        botGrad.addColorStop(0.3, 'rgba(0,0,0,0.4)');
        botGrad.addColorStop(0.6, 'rgba(0,0,0,0.75)');
        botGrad.addColorStop(1, 'rgba(0,0,0,0.95)');
        ctx.fillStyle = botGrad;
        ctx.fillRect(imgX, cardH - 180, imgW, 180);

        // Side vignettes
        const leftGrad = ctx.createLinearGradient(imgX, 0, imgX + 40, 0);
        leftGrad.addColorStop(0, 'rgba(0,0,0,0.3)');
        leftGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = leftGrad;
        ctx.fillRect(imgX, imgY, 40, imgH);
        const rightGrad = ctx.createLinearGradient(imgX + imgW, 0, imgX + imgW - 40, 0);
        rightGrad.addColorStop(0, 'rgba(0,0,0,0.3)');
        rightGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rightGrad;
        ctx.fillRect(imgX + imgW - 40, imgY, 40, imgH);
        ctx.restore();
    } catch (e) {
        roundRectPath(ctx, imgX, imgY, imgW, imgH, radius - 3);
        ctx.fillStyle = '#1A1A2E';
        ctx.fill();
        ctx.fillStyle = '#FFF';
        ctx.font = '14px "Poppins SemiBold"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, cardW / 2, cardH / 2);
    }

    // === INNER BORDER (thin rarity accent) ===
    roundRectPath(ctx, borderW + 1, borderW + 1, cardW - (borderW + 1) * 2, cardH - (borderW + 1) * 2, radius - 2);
    ctx.strokeStyle = rarityData.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // === RARITY ACCENT LINE (separator above text) ===
    const accentY = cardH - imgPad - 68;
    ctx.beginPath();
    ctx.moveTo(imgX + 14, accentY);
    ctx.lineTo(imgX + 60, accentY);
    ctx.strokeStyle = rarityData.color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();

    // === PRINT # (top-right pill) ===
    const printText = `#${String(printNumber).padStart(4, '0')}`;
    ctx.font = '11px "Poppins Bold"';
    const printW = ctx.measureText(printText).width + 16;
    const printX = cardW - imgPad - 8 - printW;
    const printY = imgY + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRectPath(ctx, printX, printY, printW, 22, 11);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.5;
    roundRectPath(ctx, printX, printY, printW, 22, 11);
    ctx.stroke();
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(printText, printX + printW / 2, printY + 11);

    // === CHARACTER NAME ===
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '18px "Poppins Bold"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const nameMaxW = imgW - 30;
    let displayName = name;
    while (ctx.measureText(displayName).width > nameMaxW && displayName.length > 3) displayName = displayName.slice(0, -1);
    if (displayName !== name) displayName += '…';
    ctx.fillText(displayName, imgX + 14, cardH - imgPad - 32);

    // === SERIES ===
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px "Poppins SemiBold"';
    ctx.textBaseline = 'bottom';
    let displaySeries = series;
    const seriesMaxW = nameMaxW - 90;
    while (ctx.measureText(displaySeries).width > seriesMaxW && displaySeries.length > 3) displaySeries = displaySeries.slice(0, -1);
    if (displaySeries !== series) displaySeries += '…';
    ctx.fillText(displaySeries, imgX + 14, cardH - imgPad - 12);

    // === RARITY BADGE (bottom-right, gradient pill) ===
    const badgeText = rarity.toUpperCase();
    ctx.font = '9px "Poppins Bold"';
    const badgeTextW = ctx.measureText(badgeText).width;
    const badgePad = 10;
    const badgeTotalW = badgeTextW + badgePad * 2;
    const badgeH = 20;
    const badgeX = cardW - imgPad - 10 - badgeTotalW;
    const badgeY = cardH - imgPad - 28;
    const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeTotalW, badgeY + badgeH);
    badgeGrad.addColorStop(0, rarityData.color);
    badgeGrad.addColorStop(1, rarityData.color + 'AA');
    ctx.fillStyle = badgeGrad;
    roundRectPath(ctx, badgeX, badgeY, badgeTotalW, badgeH, 5);
    ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, badgeX + badgeTotalW / 2, badgeY + badgeH / 2);

    // === FAVOURITES INDICATOR (small, below accent line) ===
    ctx.fillStyle = rarityData.color;
    ctx.font = '8px "Poppins Bold"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', imgX + 14, accentY + 12);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '8px "Poppins SemiBold"';
    ctx.fillText(` ${(charData.favourites || 0).toLocaleString('id-ID')}`, imgX + 23, accentY + 12);

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
    const cardW = 350;
    const cardH = 500;
    const gap = 12;
    const padding = 15;
    const totalW = cardW * 3 + gap * 2 + padding * 2;
    const totalH = cardH + padding * 2;

    const canvas = createCanvas(totalW, totalH);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, totalW, totalH);

    for (let i = 0; i < cards.length; i++) {
        const cardBuffer = await generateCardImage(cards[i]);
        const cardImg = await loadImage(cardBuffer);
        const x = padding + i * (cardW + gap);
        const y = padding;
        ctx.drawImage(cardImg, x, y, cardW, cardH);
    }

    return canvas.toBuffer('image/png');
}

// ==================== KPOP CHARACTERS ====================
function fetchKpopCharacters(count = 3) {
    const characters = [];
    for (let i = 0; i < count; i++) {
        const rarity = rollRarity();
        const rarityData = RARITIES[rarity];
        // Filter idols by popularity matching rarity
        let pool;
        if (rarity === 'God' || rarity === 'Mythic') pool = KPOP_IDOLS.filter(k => k.popularity >= 35000);
        else if (rarity === 'Legendary') pool = KPOP_IDOLS.filter(k => k.popularity >= 20000 && k.popularity < 40000);
        else if (rarity === 'Epic') pool = KPOP_IDOLS.filter(k => k.popularity >= 12000 && k.popularity < 25000);
        else if (rarity === 'Rare') pool = KPOP_IDOLS.filter(k => k.popularity >= 5000 && k.popularity < 15000);
        else if (rarity === 'Uncommon') pool = KPOP_IDOLS.filter(k => k.popularity >= 2000 && k.popularity < 8000);
        else pool = KPOP_IDOLS.filter(k => k.popularity < 5000);

        // Fallback to any idol if pool is empty
        if (!pool || pool.length === 0) pool = KPOP_IDOLS;

        const idol = pool[Math.floor(Math.random() * pool.length)];
        characters.push({
            charId: idol.id.hashCode ? idol.id.hashCode() : Math.abs(idol.id.split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0)),
            name: idol.name,
            nameNative: '',
            series: idol.group,
            imageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(idol.name)}&size=400&background=${rarityData.color.replace('#', '')}&color=fff&bold=true&format=png`,
            favourites: idol.popularity,
            rarity,
            category: 'kpop',
        });
    }
    return characters;
}

// ==================== DROP COMMAND ====================
async function handleDropCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const category = interaction.options.getString('kategori') || 'anime';

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
        // Fetch 3 random characters based on category
        let characters;
        if (category === 'kpop') {
            characters = fetchKpopCharacters(3);
        } else {
            characters = await fetchRandomCharacters(3);
        }
        if (!characters || characters.length < 3) {
            state.fishCooldowns.delete(cdKey);
            return interaction.editReply({ content: '❌ Gagal fetch karakter. Coba lagi!' });
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

        const categoryEmoji = category === 'kpop' ? '🎤' : '🎌';
        const categoryLabel = category === 'kpop' ? 'K-POP' : 'ANIME';

        const embed = new EmbedBuilder()
            .setColor(category === 'kpop' ? '#FF69B4' : '#E74C3C')
            .setTitle(`🎴 ${categoryEmoji} ${categoryLabel} DROP!`)
            .setDescription(`${rarityLine}\n\n> Klik tombol di bawah untuk grab kartu!\n> ⏱️ Hilang dalam 60 detik`)
            .setImage('attachment://drop.png')
            .setFooter({ text: `Dropped by ${interaction.user.username} • ${categoryLabel} • Grab cooldown: 4 min` })
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

// ==================== NEW DB TABLES (Burn, Trade, Wishlist, Dye, Album) ====================
db.exec(`CREATE TABLE IF NOT EXISTS card_stardust (userId TEXT PRIMARY KEY, amount INTEGER DEFAULT 0)`);
db.exec(`CREATE TABLE IF NOT EXISTS card_wishlist (userId TEXT, charName TEXT, PRIMARY KEY(userId, charName))`);
db.exec(`CREATE TABLE IF NOT EXISTS card_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    senderId TEXT, receiverId TEXT,
    senderCardId INTEGER, receiverCardId INTEGER,
    status TEXT DEFAULT 'pending', createdAt INTEGER
)`);
try { db.exec(`ALTER TABLE anime_cards ADD COLUMN dye TEXT DEFAULT ''`); } catch (_) {}

// ==================== STARDUST HELPERS ====================
const BURN_VALUES = { Common: 1, Uncommon: 3, Rare: 10, Epic: 30, Legendary: 100, Mythic: 300, God: 1000 };

function getStardust(userId) {
    const row = db.prepare('SELECT amount FROM card_stardust WHERE userId = ?').get(userId);
    return row ? row.amount : 0;
}
function addStardust(userId, amount) {
    db.prepare('INSERT OR IGNORE INTO card_stardust (userId, amount) VALUES (?, 0)').run(userId);
    db.prepare('UPDATE card_stardust SET amount = amount + ? WHERE userId = ?').run(amount, userId);
}

// ==================== 🔥 BURN (SALVAGE) ====================
async function handleCardBurn(interaction) {
    const cardId = interaction.options.getInteger('id');
    const userId = interaction.user.id;
    const card = db.prepare('SELECT * FROM anime_cards WHERE id = ? AND userId = ?').get(cardId, userId);
    if (!card) return interaction.reply({ content: '❌ Kartu tidak ditemukan atau bukan milikmu!', ephemeral: true });
    if (card.locked) return interaction.reply({ content: '❌ Kartu ini di-lock! Unlock dulu sebelum burn.', ephemeral: true });

    const value = BURN_VALUES[card.rarity] || 1;
    db.prepare('DELETE FROM anime_cards WHERE id = ?').run(cardId);
    addStardust(userId, value);
    const total = getStardust(userId);

    const rd = RARITIES[card.rarity];
    const embed = new EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle('🔥 Card Burned!')
        .setDescription(
            `${rd.emoji} **${card.charName}** — *${card.series}*\n` +
            `> Rarity: ${card.rarity} | Print #${String(card.printNumber).padStart(4, '0')}\n\n` +
            `✨ **+${value} Stardust** earned!\n` +
            `> 💫 Total Stardust: **${total}**`
        )
        .setFooter({ text: 'Stardust bisa dipakai beli dye, extra drop, dll' });
    return interaction.reply({ embeds: [embed] });
}

// ==================== 🔄 TRADE ====================
async function handleCardTrade(interaction) {
    const targetUser = interaction.options.getUser('user');
    const cardId = interaction.options.getInteger('kartu_kamu');
    const userId = interaction.user.id;

    if (targetUser.id === userId) return interaction.reply({ content: '❌ Tidak bisa trade dengan diri sendiri!', ephemeral: true });
    if (targetUser.bot) return interaction.reply({ content: '❌ Tidak bisa trade dengan bot!', ephemeral: true });

    const card = db.prepare('SELECT * FROM anime_cards WHERE id = ? AND userId = ?').get(cardId, userId);
    if (!card) return interaction.reply({ content: '❌ Kartu tidak ditemukan atau bukan milikmu!', ephemeral: true });
    if (card.locked) return interaction.reply({ content: '❌ Kartu ini di-lock!', ephemeral: true });

    // Create trade offer
    db.prepare('INSERT INTO card_trades (senderId, receiverId, senderCardId, status, createdAt) VALUES (?, ?, ?, ?, ?)').run(userId, targetUser.id, cardId, 'pending', Date.now());
    const tradeId = db.prepare('SELECT last_insert_rowid() as id').get().id;

    const rd = RARITIES[card.rarity];
    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('🔄 Trade Offer!')
        .setDescription(
            `<@${userId}> ingin memberikan kartu ke <@${targetUser.id}>:\n\n` +
            `${rd.emoji} **${card.charName}** — *${card.series}*\n` +
            `> ${card.rarity} | Print #${String(card.printNumber).padStart(4, '0')}\n\n` +
            `> <@${targetUser.id}> klik **Accept** untuk menerima!`
        )
        .setFooter({ text: `Trade ID: ${tradeId} • Expires in 5 min` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cardtrade_accept_${tradeId}_${targetUser.id}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cardtrade_deny_${tradeId}_${targetUser.id}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger),
    );

    await interaction.reply({ embeds: [embed], components: [row] });

    // Auto-expire
    setTimeout(() => {
        const trade = db.prepare('SELECT * FROM card_trades WHERE id = ? AND status = ?').get(tradeId, 'pending');
        if (trade) db.prepare('UPDATE card_trades SET status = ? WHERE id = ?').run('expired', tradeId);
    }, 5 * 60 * 1000);
}

async function handleCardTradeButton(interaction) {
    const parts = interaction.customId.split('_');
    const action = parts[1]; // accept or deny
    const tradeId = parseInt(parts[2]);
    const allowedUser = parts[3];

    if (interaction.user.id !== allowedUser) {
        return interaction.reply({ content: '❌ Trade ini bukan untukmu!', ephemeral: true });
    }

    const trade = db.prepare('SELECT * FROM card_trades WHERE id = ?').get(tradeId);
    if (!trade) return interaction.reply({ content: '❌ Trade tidak ditemukan!', ephemeral: true });
    if (trade.status !== 'pending') return interaction.reply({ content: '❌ Trade sudah expired/selesai!', ephemeral: true });

    if (action === 'deny') {
        db.prepare('UPDATE card_trades SET status = ? WHERE id = ?').run('denied', tradeId);
        return interaction.update({ content: '❌ Trade ditolak.', embeds: [], components: [] });
    }

    // Accept: transfer card
    const card = db.prepare('SELECT * FROM anime_cards WHERE id = ?').get(trade.senderCardId);
    if (!card || card.userId !== trade.senderId) {
        db.prepare('UPDATE card_trades SET status = ? WHERE id = ?').run('failed', tradeId);
        return interaction.update({ content: '❌ Kartu sudah tidak ada di sender!', embeds: [], components: [] });
    }

    db.prepare('UPDATE anime_cards SET userId = ? WHERE id = ?').run(trade.receiverId, trade.senderCardId);
    db.prepare('UPDATE card_trades SET status = ? WHERE id = ?').run('completed', tradeId);

    const rd = RARITIES[card.rarity];
    return interaction.update({
        content: `✅ Trade berhasil! ${rd.emoji} **${card.charName}** sekarang milik <@${trade.receiverId}>!`,
        embeds: [], components: []
    });
}

// ==================== ❤️ WISHLIST ====================
async function handleCardWishlist(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'add') {
        const charName = interaction.options.getString('karakter');
        const existing = db.prepare('SELECT COUNT(*) as c FROM card_wishlist WHERE userId = ?').get(userId);
        if (existing.c >= 10) return interaction.reply({ content: '❌ Wishlist penuh! (maks 10). Hapus dulu pakai `/wishlist remove`.', ephemeral: true });
        db.prepare('INSERT OR IGNORE INTO card_wishlist (userId, charName) VALUES (?, ?)').run(userId, charName.toLowerCase());
        return interaction.reply({ content: `❤️ **${charName}** ditambahkan ke wishlist!`, ephemeral: true });
    }

    if (sub === 'remove') {
        const charName = interaction.options.getString('karakter');
        db.prepare('DELETE FROM card_wishlist WHERE userId = ? AND charName = ?').run(userId, charName.toLowerCase());
        return interaction.reply({ content: `🗑️ **${charName}** dihapus dari wishlist.`, ephemeral: true });
    }

    if (sub === 'list') {
        const wishes = db.prepare('SELECT * FROM card_wishlist WHERE userId = ?').all(userId);
        if (wishes.length === 0) return interaction.reply({ content: '📭 Wishlist kosong! Tambah dengan `/wishlist add`.', ephemeral: true });
        const list = wishes.map((w, i) => `> **${i + 1}.** ❤️ ${w.charName}`).join('\n');
        const embed = new EmbedBuilder()
            .setTitle('❤️ Card Wishlist')
            .setColor('#FF69B4')
            .setDescription(`${list}\n\n-# Kamu akan di-ping kalau karakter wishlist muncul di drop!`)
            .setFooter({ text: `${wishes.length}/10 slot` });
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

// Check wishlist during drop (called from drop handler)
function checkWishlistNotify(guildId, cards, channelId) {
    try {
        const allWishes = db.prepare('SELECT * FROM card_wishlist').all();
        const notifications = [];
        for (const card of cards) {
            const nameLower = card.name.toLowerCase();
            for (const wish of allWishes) {
                if (nameLower.includes(wish.charName) || wish.charName.includes(nameLower)) {
                    notifications.push({ userId: wish.userId, charName: card.name });
                }
            }
        }
        return notifications;
    } catch (_) { return []; }
}

// ==================== 🎨 DYE / TINT ====================
const DYE_COLORS = {
    crimson: { name: 'Crimson', hex: '#DC143C', cost: 50 },
    ocean: { name: 'Ocean Blue', hex: '#006994', cost: 50 },
    emerald: { name: 'Emerald', hex: '#50C878', cost: 50 },
    royal: { name: 'Royal Purple', hex: '#7851A9', cost: 50 },
    sunset: { name: 'Sunset Orange', hex: '#FF4500', cost: 50 },
    gold: { name: 'Gold', hex: '#FFD700', cost: 100 },
    sakura: { name: 'Sakura Pink', hex: '#FFB7C5', cost: 75 },
    midnight: { name: 'Midnight', hex: '#191970', cost: 75 },
    ice: { name: 'Ice Blue', hex: '#99FFFF', cost: 75 },
    blood: { name: 'Blood Red', hex: '#8B0000', cost: 100 },
};

async function handleCardDye(interaction) {
    const cardId = interaction.options.getInteger('id');
    const dyeId = interaction.options.getString('warna');
    const userId = interaction.user.id;

    const card = db.prepare('SELECT * FROM anime_cards WHERE id = ? AND userId = ?').get(cardId, userId);
    if (!card) return interaction.reply({ content: '❌ Kartu tidak ditemukan atau bukan milikmu!', ephemeral: true });

    const dye = DYE_COLORS[dyeId];
    if (!dye) return interaction.reply({ content: '❌ Warna tidak valid!', ephemeral: true });

    const stardust = getStardust(userId);
    if (stardust < dye.cost) return interaction.reply({ content: `❌ Stardust tidak cukup! Butuh **${dye.cost}**, kamu punya **${stardust}**.\n> Burn kartu untuk dapat Stardust!`, ephemeral: true });

    addStardust(userId, -dye.cost);
    db.prepare('UPDATE anime_cards SET dye = ? WHERE id = ?').run(dyeId, cardId);

    const embed = new EmbedBuilder()
        .setColor(dye.hex)
        .setTitle('🎨 Card Dyed!')
        .setDescription(
            `${RARITIES[card.rarity]?.emoji || '⚪'} **${card.charName}** sekarang punya border **${dye.name}**!\n\n` +
            `> 💫 -${dye.cost} Stardust | Sisa: **${getStardust(userId)}**\n\n` +
            `-# Gunakan /cardview untuk melihat hasilnya!`
        );
    return interaction.reply({ embeds: [embed] });
}

// ==================== 📦 ALBUM / SET BONUS ====================
function getSeriesCompletion(userId) {
    // Group user's cards by series, find how many unique chars per series
    const cards = db.prepare('SELECT DISTINCT charId, series FROM anime_cards WHERE userId = ?').all(userId);
    const seriesMap = {};
    for (const c of cards) {
        if (!seriesMap[c.series]) seriesMap[c.series] = 0;
        seriesMap[c.series]++;
    }
    return seriesMap;
}

async function handleCardAlbum(interaction) {
    const userId = interaction.options.getUser('user')?.id || interaction.user.id;
    const seriesMap = getSeriesCompletion(userId);

    const sorted = Object.entries(seriesMap).sort((a, b) => b[1] - a[1]).slice(0, 15);
    if (sorted.length === 0) {
        return interaction.reply({ content: '📭 Belum punya kartu! Gunakan `/drop` untuk mulai.', ephemeral: true });
    }

    let desc = `📦 **Card Album** — Top Series\n\n`;
    for (const [series, count] of sorted) {
        const bonus = count >= 5 ? ' 🏆 SET BONUS!' : count >= 3 ? ' ⭐' : '';
        desc += `> **${series}** — ${count} kartu${bonus}\n`;
    }
    desc += `\n-# 🏆 Set Bonus: 5+ kartu dari seri yang sama = bonus Stardust harian!`;

    // Award set bonus for 5+ card series (once per day)
    const today = new Date().toLocaleDateString('sv-SE');
    const claimedToday = db.prepare('SELECT 1 FROM card_stardust WHERE userId = ? AND amount >= 0').get(userId); // always true but check
    let bonusMsg = '';
    const setsOf5 = sorted.filter(([_, c]) => c >= 5).length;
    if (setsOf5 > 0 && interaction.user.id === userId) {
        const cdKey = `album_bonus_${userId}_${today}`;
        if (!state.fishCooldowns.has(cdKey)) {
            const bonusAmount = setsOf5 * 5;
            addStardust(userId, bonusAmount);
            state.fishCooldowns.set(cdKey, Date.now() + 86400000);
            bonusMsg = `\n\n🏆 **Set Bonus claimed!** +${bonusAmount} Stardust (${setsOf5} sets × 5)`;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('📦 Card Album')
        .setColor('#9B59B6')
        .setDescription(desc + bonusMsg)
        .setFooter({ text: `Total: ${Object.values(seriesMap).reduce((a, b) => a + b, 0)} kartu | ${Object.keys(seriesMap).length} series` });
    return interaction.reply({ embeds: [embed] });
}

// ==================== 📊 CARD LEADERBOARD ====================
async function handleCardLeaderboard(interaction) {
    const type = interaction.options.getString('tipe') || 'total';

    let title, rows;
    if (type === 'total') {
        title = '🎴 Most Cards';
        rows = db.prepare('SELECT userId, COUNT(*) as cnt FROM anime_cards GROUP BY userId ORDER BY cnt DESC LIMIT 10').all();
    } else if (type === 'rare') {
        title = '👑 Most Rare+ Cards';
        rows = db.prepare("SELECT userId, COUNT(*) as cnt FROM anime_cards WHERE rarity IN ('Legendary','Mythic','God') GROUP BY userId ORDER BY cnt DESC LIMIT 10").all();
    } else if (type === 'stardust') {
        title = '💫 Most Stardust';
        rows = db.prepare('SELECT userId, amount as cnt FROM card_stardust ORDER BY amount DESC LIMIT 10').all();
    } else if (type === 'prints') {
        title = '🏷️ Lowest Prints (Rarest Cards)';
        rows = db.prepare('SELECT userId, charName, printNumber as cnt, rarity FROM anime_cards WHERE printNumber <= 10 ORDER BY printNumber ASC LIMIT 10').all();
    }

    if (!rows || rows.length === 0) {
        return interaction.reply({ content: '📭 Belum ada data leaderboard!', ephemeral: true });
    }

    let desc = '';
    const medals = ['🥇', '🥈', '🥉'];
    rows.forEach((r, i) => {
        const medal = medals[i] || `**${i + 1}.**`;
        if (type === 'prints') {
            const rd = RARITIES[r.rarity] || RARITIES.Common;
            desc += `${medal} ${rd.emoji} **${r.charName}** #${String(r.cnt).padStart(4, '0')} — <@${r.userId}>\n`;
        } else {
            desc += `${medal} <@${r.userId}> — **${r.cnt.toLocaleString('id-ID')}**\n`;
        }
    });

    const embed = new EmbedBuilder()
        .setTitle(`📊 Card Leaderboard — ${title}`)
        .setColor('#FFD700')
        .setDescription(desc)
        .setTimestamp();
    return interaction.reply({ embeds: [embed] });
}

// ==================== STARDUST BALANCE COMMAND ====================
async function handleStardustCommand(interaction) {
    const userId = interaction.user.id;
    const amount = getStardust(userId);
    const totalBurned = db.prepare('SELECT SUM(amount) as total FROM card_stardust WHERE userId = ?').get(userId);

    let desc = `💫 **Stardust Balance**\n\n> 💎 Kamu punya: **${amount}** Stardust\n\n`;
    desc += `**🛒 Stardust Shop:**\n`;
    desc += `> 🎨 Card Dye — 50-100 ✨\n`;
    desc += `> 🎴 Extra Drop (skip cooldown) — 200 ✨\n\n`;
    desc += `-# Burn kartu untuk dapat Stardust! /cardburn id:<card_id>`;

    const embed = new EmbedBuilder()
        .setTitle('💫 Stardust')
        .setColor('#FFD700')
        .setDescription(desc);
    return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ==================== DETECTORS ====================
function isCardGrabButton(customId) {
    return typeof customId === 'string' && customId.startsWith('cardgrab_') && !customId.startsWith('cardgrab_expired') && !customId.startsWith('cardgrab_claimed');
}

function isCardTradeButton(customId) {
    return typeof customId === 'string' && customId.startsWith('cardtrade_');
}

module.exports = {
    handleDropCommand,
    handleCardGrab,
    handleCardsCommand,
    handleCardViewCommand,
    handleCardBurn,
    handleCardTrade,
    handleCardTradeButton,
    handleCardWishlist,
    handleCardDye,
    handleCardAlbum,
    handleCardLeaderboard,
    handleStardustCommand,
    checkWishlistNotify,
    isCardGrabButton,
    isCardTradeButton,
    generateCardImage,
    generateDropImage,
    fetchRandomCharacters,
    RARITIES,
};
