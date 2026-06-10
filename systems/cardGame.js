// systems/cardGame.js — Pokemon TCG Card System
// Drop cards, grab, collect, trade — powered by pokemontcg.io API
// Fan-made project, not affiliated with Nintendo/The Pokemon Company/Creatures Inc.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { db, getOrCreateUser, incrementUserStat } = require('../database');
const state = require('../state');

// ==================== DB TABLES ====================
db.exec(`CREATE TABLE IF NOT EXISTS pokemon_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    cardId TEXT,
    cardName TEXT,
    setName TEXT,
    rarity TEXT,
    imageUrl TEXT,
    types TEXT DEFAULT '',
    hp TEXT DEFAULT '',
    artist TEXT DEFAULT '',
    printNumber INTEGER DEFAULT 1,
    obtainedAt INTEGER,
    locked INTEGER DEFAULT 0,
    dye TEXT DEFAULT ''
)`);

db.exec(`CREATE TABLE IF NOT EXISTS card_prints (
    cardId TEXT PRIMARY KEY,
    totalPrints INTEGER DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS card_stardust (userId TEXT PRIMARY KEY, amount INTEGER DEFAULT 0)`);
db.exec(`CREATE TABLE IF NOT EXISTS card_wishlist (userId TEXT, cardName TEXT, PRIMARY KEY(userId, cardName))`);
db.exec(`CREATE TABLE IF NOT EXISTS card_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    senderId TEXT, receiverId TEXT,
    senderCardId INTEGER, receiverCardId INTEGER,
    status TEXT DEFAULT 'pending', createdAt INTEGER
)`);

// Cache table for Pokemon TCG API results
db.exec(`CREATE TABLE IF NOT EXISTS pokemon_card_cache (
    cardId TEXT PRIMARY KEY,
    cardName TEXT,
    setName TEXT,
    rarity TEXT,
    imageUrl TEXT,
    types TEXT DEFAULT '',
    hp TEXT DEFAULT '',
    artist TEXT DEFAULT '',
    cachedAt INTEGER
)`);

// Migrate old anime_cards table if exists (backward compat)
try {
    const hasOldTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='anime_cards'").get();
    if (hasOldTable) {
        // Keep old table but don't use it anymore — data is anime, not Pokemon
        // Users start fresh with Pokemon TCG cards
    }
} catch (_) {}

// ==================== RARITY SYSTEM (Pokemon TCG real rarities) ====================
const RARITIES = {
    'Common':           { emoji: '⚪', color: '#AAAAAA', weight: 50, tier: 0 },
    'Uncommon':         { emoji: '🟢', color: '#2ECC71', weight: 25, tier: 1 },
    'Rare':             { emoji: '🔵', color: '#3498DB', weight: 15, tier: 2 },
    'Rare Holo':        { emoji: '🟣', color: '#9B59B6', weight: 7, tier: 3 },
    'Rare Holo EX':     { emoji: '🟡', color: '#FFD700', weight: 1.2, tier: 4 },
    'Rare Holo GX':     { emoji: '🟡', color: '#FFD700', weight: 1.0, tier: 4 },
    'Rare Holo V':      { emoji: '🟡', color: '#FFD700', weight: 0.8, tier: 4 },
    'Rare Ultra':       { emoji: '🔴', color: '#E74C3C', weight: 0.5, tier: 5 },
    'Rare Rainbow':     { emoji: '🌈', color: '#FF69B4', weight: 0.3, tier: 6 },
    'Rare Secret':      { emoji: '👑', color: '#FF0000', weight: 0.2, tier: 7 },
    'Illustration Rare':{ emoji: '🎨', color: '#DA70D6', weight: 0.15, tier: 7 },
    'Special Art Rare':  { emoji: '💎', color: '#00CED1', weight: 0.1, tier: 8 },
};

// Fallback for unknown rarities from API
function getRarityData(rarity) {
    if (RARITIES[rarity]) return RARITIES[rarity];
    // Map some alternative names
    if (rarity && rarity.includes('VMAX')) return RARITIES['Rare Ultra'];
    if (rarity && rarity.includes('VSTAR')) return RARITIES['Rare Ultra'];
    if (rarity && rarity.includes('Secret')) return RARITIES['Rare Secret'];
    if (rarity && rarity.includes('Rainbow')) return RARITIES['Rare Rainbow'];
    if (rarity && rarity.includes('Ultra')) return RARITIES['Rare Ultra'];
    if (rarity && rarity.includes('Holo')) return RARITIES['Rare Holo'];
    if (rarity && rarity.includes('Rare')) return RARITIES['Rare'];
    if (rarity && rarity.includes('Uncommon')) return RARITIES['Uncommon'];
    return RARITIES['Common'];
}

function getRarityTier(rarity) {
    return getRarityData(rarity).tier || 0;
}

// Roll a rarity for drop query
function rollRarity() {
    const r = Math.random() * 100;
    let cumulative = 0;
    for (const [name, data] of Object.entries(RARITIES)) {
        cumulative += data.weight;
        if (r <= cumulative) return name;
    }
    return 'Common';
}

// ==================== POKEMON TCG API ====================
const POKEMONTCG_API = 'https://api.pokemontcg.io/v2/cards';

async function fetchPokemonCards(rarity, count = 3) {
    // Build query for the target rarity
    const rarityQuery = encodeURIComponent(`rarity:"${rarity}"`);
    const pageSize = 20;
    // Random page (different rarities have different total pages)
    const maxPages = {
        'Common': 100, 'Uncommon': 80, 'Rare': 60, 'Rare Holo': 40,
        'Rare Holo EX': 15, 'Rare Holo GX': 15, 'Rare Holo V': 20,
        'Rare Ultra': 10, 'Rare Rainbow': 8, 'Rare Secret': 5,
        'Illustration Rare': 5, 'Special Art Rare': 3,
    };
    const maxPage = maxPages[rarity] || 20;
    const page = Math.floor(Math.random() * maxPage) + 1;

    const url = `${POKEMONTCG_API}?q=${rarityQuery}&pageSize=${pageSize}&page=${page}`;

    try {
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) {
            // If page doesn't exist, try page 1
            if (res.status === 400 || res.status === 404) {
                const fallbackRes = await fetch(`${POKEMONTCG_API}?q=${rarityQuery}&pageSize=${pageSize}&page=1`, {
                    headers: { 'Accept': 'application/json' }
                });
                if (!fallbackRes.ok) return [];
                const fallbackData = await fallbackRes.json();
                return (fallbackData.data || []).slice(0, count);
            }
            return [];
        }
        const data = await res.json();
        const cards = data.data || [];
        if (cards.length === 0) {
            // Fallback to page 1
            const fallbackRes = await fetch(`${POKEMONTCG_API}?q=${rarityQuery}&pageSize=${pageSize}&page=1`, {
                headers: { 'Accept': 'application/json' }
            });
            if (!fallbackRes.ok) return [];
            const fallbackData = await fallbackRes.json();
            return (fallbackData.data || []).slice(0, count);
        }
        return cards;
    } catch (e) {
        console.error('[cardGame] Pokemon TCG API error:', e.message);
        return [];
    }
}

// Fetch 3 random cards based on rolled rarities
async function fetchRandomCards(count = 3) {
    const results = [];

    for (let i = 0; i < count; i++) {
        const rarity = rollRarity();
        // Try cache first
        const cached = getCachedCardsByRarity(rarity, 1);
        if (cached.length > 0 && Math.random() < 0.3) {
            // 30% chance to use cache for speed
            results.push(cached[0]);
            continue;
        }

        // Fetch from API
        const cards = await fetchPokemonCards(rarity, 10);
        if (cards.length > 0) {
            const pick = cards[Math.floor(Math.random() * cards.length)];
            const cardData = {
                cardId: pick.id,
                name: pick.name,
                setName: pick.set?.name || 'Unknown Set',
                rarity: pick.rarity || rarity,
                imageUrl: pick.images?.large || pick.images?.small || '',
                types: (pick.types || []).join(', '),
                hp: pick.hp || '',
                artist: pick.artist || '',
            };
            // Cache it
            cacheCard(cardData);
            results.push(cardData);
        } else {
            // Fallback: try Common
            const fallbackCards = await fetchPokemonCards('Common', 10);
            if (fallbackCards.length > 0) {
                const pick = fallbackCards[Math.floor(Math.random() * fallbackCards.length)];
                const cardData = {
                    cardId: pick.id,
                    name: pick.name,
                    setName: pick.set?.name || 'Unknown Set',
                    rarity: 'Common',
                    imageUrl: pick.images?.large || pick.images?.small || '',
                    types: (pick.types || []).join(', '),
                    hp: pick.hp || '',
                    artist: pick.artist || '',
                };
                cacheCard(cardData);
                results.push(cardData);
            }
        }
    }
    return results;
}

// ==================== CACHE HELPERS ====================
function cacheCard(cardData) {
    try {
        db.prepare(`INSERT OR REPLACE INTO pokemon_card_cache (cardId, cardName, setName, rarity, imageUrl, types, hp, artist, cachedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            cardData.cardId, cardData.name, cardData.setName, cardData.rarity,
            cardData.imageUrl, cardData.types, cardData.hp, cardData.artist, Date.now()
        );
    } catch (_) {}
}

function getCachedCardsByRarity(rarity, limit = 5) {
    try {
        const rows = db.prepare('SELECT * FROM pokemon_card_cache WHERE rarity = ? ORDER BY RANDOM() LIMIT ?').all(rarity, limit);
        return rows.map(r => ({
            cardId: r.cardId,
            name: r.cardName,
            setName: r.setName,
            rarity: r.rarity,
            imageUrl: r.imageUrl,
            types: r.types,
            hp: r.hp,
            artist: r.artist,
        }));
    } catch (_) { return []; }
}

// ==================== PRINT NUMBER ====================
function getNextPrint(cardId) {
    const row = db.prepare('SELECT totalPrints FROM card_prints WHERE cardId = ?').get(cardId);
    if (!row) {
        db.prepare('INSERT INTO card_prints (cardId, totalPrints) VALUES (?, 1)').run(cardId);
        return 1;
    }
    const next = row.totalPrints + 1;
    db.prepare('UPDATE card_prints SET totalPrints = ? WHERE cardId = ?').run(next, cardId);
    return next;
}

// ==================== DROP IMAGE (3 cards side by side — from API images) ====================
async function generateDropImage(cards) {
    const cardW = 245;  // Pokemon TCG card aspect ratio ~2.5:3.5
    const cardH = 342;
    const gap = 10;
    const padding = 12;
    const totalW = cardW * 3 + gap * 2 + padding * 2;
    const totalH = cardH + padding * 2;

    const canvas = createCanvas(totalW, totalH);
    const ctx = canvas.getContext('2d');

    // Dark background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, totalW, totalH);

    for (let i = 0; i < cards.length; i++) {
        const x = padding + i * (cardW + gap);
        const y = padding;

        try {
            if (cards[i].imageUrl) {
                const img = await loadImage(cards[i].imageUrl);
                ctx.drawImage(img, x, y, cardW, cardH);
            } else {
                // Placeholder if no image
                ctx.fillStyle = '#2d2d44';
                ctx.fillRect(x, y, cardW, cardH);
                ctx.fillStyle = '#FFF';
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(cards[i].name, x + cardW / 2, y + cardH / 2);
            }
        } catch (e) {
            // Draw placeholder on image load failure
            ctx.fillStyle = '#2d2d44';
            ctx.fillRect(x, y, cardW, cardH);
            ctx.fillStyle = '#FFF';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(cards[i].name, x + cardW / 2, y + cardH / 2);
        }

        // Rarity glow border
        const rd = getRarityData(cards[i].rarity);
        ctx.strokeStyle = rd.color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, cardW, cardH);
    }

    return canvas.toBuffer('image/png');
}

// Generate single card view image (embed the HD image directly with overlay info)
async function generateCardImage(cardData) {
    const { name, setName, rarity, imageUrl, printNumber } = cardData;
    const cardW = 350;
    const cardH = 490;

    const canvas = createCanvas(cardW, cardH);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0D0D0D';
    ctx.fillRect(0, 0, cardW, cardH);

    try {
        if (imageUrl) {
            const img = await loadImage(imageUrl);
            // Draw card image scaled to fit
            const scale = Math.min(cardW / img.width, cardH / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            const x = (cardW - w) / 2;
            const y = (cardH - h) / 2;
            ctx.drawImage(img, x, y, w, h);
        }
    } catch (_) {
        ctx.fillStyle = '#1A1A2E';
        ctx.fillRect(0, 0, cardW, cardH);
        ctx.fillStyle = '#FFF';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(name, cardW / 2, cardH / 2);
    }

    // Rarity border
    const rd = getRarityData(rarity);
    ctx.strokeStyle = rd.color;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, cardW - 4, cardH - 4);

    return canvas.toBuffer('image/png');
}

// ==================== STARDUST HELPERS ====================
const BURN_VALUES = {
    'Common': 1,
    'Uncommon': 3,
    'Rare': 8,
    'Rare Holo': 15,
    'Rare Holo EX': 40,
    'Rare Holo GX': 40,
    'Rare Holo V': 40,
    'Rare Ultra': 80,
    'Rare Rainbow': 150,
    'Rare Secret': 200,
    'Illustration Rare': 200,
    'Special Art Rare': 300,
};

function getStardust(userId) {
    const row = db.prepare('SELECT amount FROM card_stardust WHERE userId = ?').get(userId);
    return row ? row.amount : 0;
}
function addStardust(userId, amount) {
    db.prepare('INSERT OR IGNORE INTO card_stardust (userId, amount) VALUES (?, 0)').run(userId);
    db.prepare('UPDATE card_stardust SET amount = amount + ? WHERE userId = ?').run(amount, userId);
}

// ==================== CARD PANEL (Main Hub) ====================
function buildCardPanel(userId) {
    const totalCards = db.prepare('SELECT COUNT(*) as c FROM pokemon_cards WHERE userId = ?').get(userId);
    const uniqueCards = db.prepare('SELECT COUNT(DISTINCT cardId) as c FROM pokemon_cards WHERE userId = ?').get(userId);
    const stardust = getStardust(userId);

    // Top cards by rarity tier
    const topCards = db.prepare(`SELECT * FROM pokemon_cards WHERE userId = ? ORDER BY
        CASE rarity
            WHEN 'Special Art Rare' THEN 0
            WHEN 'Illustration Rare' THEN 1
            WHEN 'Rare Secret' THEN 2
            WHEN 'Rare Rainbow' THEN 3
            WHEN 'Rare Ultra' THEN 4
            WHEN 'Rare Holo V' THEN 5
            WHEN 'Rare Holo GX' THEN 5
            WHEN 'Rare Holo EX' THEN 5
            WHEN 'Rare Holo' THEN 6
            ELSE 9
        END LIMIT 3`).all(userId);

    let topDesc = topCards.length > 0
        ? topCards.map(c => `> ${getRarityData(c.rarity).emoji} **${c.cardName}** — *${c.setName}* (${c.rarity})`).join('\n')
        : '> *Belum ada kartu! Klik \u{1F0CF} Drop untuk mulai.*';

    const embed = new EmbedBuilder()
        .setTitle('\u{1F0CF} POKEMON TCG CARD PANEL')
        .setColor('#FF6B35')
        .setDescription(
            `**\u{1F4CA} Stats:**\n` +
            `> \u{1F0CF} Kartu: **${totalCards.c}** | \u{1F3B4} Unique: **${uniqueCards.c}**\n` +
            `> \u{1F4AB} Stardust: **${stardust}**\n\n` +
            `**\u{1F3C6} Top Cards:**\n${topDesc}\n\n` +
            `**\u{1F4CB} Menu:**\n` +
            `> \u{1F0CF} **Drop** \u2014 Drop 3 kartu Pokemon random (8 min CD)\n` +
            `> \u{1F4E6} **Collection** \u2014 Lihat semua kartumu\n` +
            `> \u{1F525} **Burn** \u2014 Hancurkan kartu \u2192 Stardust\n` +
            `> \u{1F504} **Trade** \u2014 Tukar kartu dengan player lain\n` +
            `> \u{1F3A8} **Dye** \u2014 Beri warna custom\n` +
            `> \u{2764}\u{FE0F} **Wishlist** \u2014 Pokemon incaran\n` +
            `> \u{1F4E6} **Album** \u2014 Koleksi per Set\n` +
            `> \u{1F4CA} **Leaderboard** \u2014 Top collectors`
        )
        .setFooter({ text: 'Fan-made \u2022 Not affiliated with Nintendo/The Pokemon Company' })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`card_drop_${userId}`).setLabel('\u{1F0CF} Drop').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`card_collection_${userId}`).setLabel('\u{1F4E6} Collection').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`card_album_${userId}`).setLabel('\u{1F4E6} Album').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`card_wishlist_${userId}`).setLabel('\u{2764}\u{FE0F} Wishlist').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`card_leaderboard_${userId}`).setLabel('\u{1F4CA} Leaderboard').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`card_stardust_${userId}`).setLabel('\u{1F4AB} Stardust').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2] };
}

// ==================== CARD PANEL COMMAND ====================
async function handleCardPanelCommand(interaction) {
    const panel = buildCardPanel(interaction.user.id);
    return interaction.reply(panel);
}

// ==================== CARD PANEL BUTTON HANDLER ====================
async function handleCardPanelButton(interaction) {
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const userId = parts[2];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '\u274C Ini bukan panel kartu kamu!', ephemeral: true });
    }

    if (action === 'drop') {
        return handleDropCommand(interaction);
    }

    if (action === 'collection') {
        return handleCardsCommand(interaction);
    }

    if (action === 'album') {
        return handleCardAlbum(interaction);
    }

    if (action === 'wishlist') {
        const wishes = db.prepare('SELECT * FROM card_wishlist WHERE userId = ?').all(userId);
        let desc = wishes.length > 0
            ? wishes.map((w, i) => `> **${i + 1}.** \u2764\u{FE0F} ${w.cardName}`).join('\n')
            : '> *Wishlist kosong! Ketik `/wishlist add karakter:Charizard` untuk menambah.*';
        const embed = new EmbedBuilder()
            .setTitle('\u2764\u{FE0F} Card Wishlist')
            .setColor('#FF69B4')
            .setDescription(`${desc}\n\n-# Kamu akan di-ping kalau Pokemon wishlist muncul di drop!\n-# Gunakan /wishlist add/remove untuk manage.`)
            .setFooter({ text: `${wishes.length}/10 slot` });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`card_back_${userId}`).setLabel('\u{1F519} Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (action === 'leaderboard') {
        return handleCardLeaderboard(interaction);
    }

    if (action === 'stardust') {
        return handleStardustCommand(interaction);
    }

    if (action === 'back') {
        const panel = buildCardPanel(userId);
        return interaction.update(panel);
    }
}

function isCardPanelButton(customId) {
    return typeof customId === 'string' && customId.startsWith('card_') && !customId.startsWith('cardgrab_') && !customId.startsWith('cardtrade_');
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
        return interaction.reply({ content: `\u23F3 Drop cooldown! Tunggu **${mins}m ${secs}s** lagi.`, ephemeral: true });
    }
    state.fishCooldowns.set(cdKey, Date.now() + cooldownMs);

    await interaction.deferReply();

    try {
        // Fetch 3 random Pokemon TCG cards
        const cards = await fetchRandomCards(3);
        if (!cards || cards.length < 3) {
            state.fishCooldowns.delete(cdKey);
            return interaction.editReply({ content: '\u274C Gagal fetch kartu dari Pokemon TCG API. Coba lagi!' });
        }

        // Assign print numbers
        const cardsWithPrint = cards.map(c => ({
            ...c,
            printNumber: getNextPrint(c.cardId),
        }));

        // Generate drop image (3 cards side by side using HD images from API)
        const dropImage = await generateDropImage(cardsWithPrint);
        const attachment = new AttachmentBuilder(dropImage, { name: 'drop.png' });

        // Store drop state for grab
        const dropId = `${guildId}_${Date.now()}`;
        state.activeCardDrops = state.activeCardDrops || new Map();
        state.activeCardDrops.set(dropId, {
            cards: cardsWithPrint,
            grabbed: [false, false, false],
            droppedBy: userId,
            timestamp: Date.now(),
        });

        // Clean old drops (> 60 seconds)
        for (const [key, drop] of state.activeCardDrops) {
            if (Date.now() - drop.timestamp > 60000) state.activeCardDrops.delete(key);
        }

        const rarityLine = cardsWithPrint.map((c, i) => {
            const rd = getRarityData(c.rarity);
            return `**${i + 1}.** ${rd.emoji} **${c.name}** \u2014 *${c.setName}* [${c.rarity}]`;
        }).join('\n');

        // Check wishlist notifications
        const wishNotifs = checkWishlistNotify(guildId, cardsWithPrint);
        let wishText = '';
        if (wishNotifs.length > 0) {
            wishText = '\n\n\u{1F4E2} ' + wishNotifs.map(n => `<@${n.userId}> wishlist: **${n.cardName}**!`).join(' | ');
        }

        const embed = new EmbedBuilder()
            .setColor('#FF6B35')
            .setTitle('\u{1F0CF} POKEMON TCG DROP!')
            .setDescription(`${rarityLine}${wishText}\n\n> Klik tombol di bawah untuk grab kartu!\n> \u23F1\u{FE0F} Hilang dalam 60 detik`)
            .setImage('attachment://drop.png')
            .setFooter({ text: `Dropped by ${interaction.user.username} \u2022 Grab cooldown: 4 min \u2022 pokemontcg.io` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`cardgrab_${dropId}_0`).setLabel('1').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`cardgrab_${dropId}_1`).setLabel('2').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`cardgrab_${dropId}_2`).setLabel('3').setStyle(ButtonStyle.Primary),
        );

        await interaction.editReply({ embeds: [embed], files: [attachment], components: [row] });

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
        return interaction.editReply({ content: '\u274C Error saat generate drop. Coba lagi!' });
    }
}

// ==================== GRAB HANDLER ====================
async function handleCardGrab(interaction) {
    const parts = interaction.customId.split('_');
    // cardgrab_<guildId>_<timestamp>_<index>
    const dropId = parts[1] + '_' + parts[2]; // reconstruct guildId_timestamp
    const cardIndex = parseInt(parts[3]);
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    state.activeCardDrops = state.activeCardDrops || new Map();
    const drop = state.activeCardDrops.get(dropId);

    if (!drop) {
        return interaction.reply({ content: '\u274C Drop ini sudah expired!', ephemeral: true });
    }

    if (cardIndex < 0 || cardIndex > 2) {
        return interaction.reply({ content: '\u274C Invalid card index.', ephemeral: true });
    }

    if (drop.grabbed[cardIndex]) {
        return interaction.reply({ content: '\u274C Kartu ini sudah di-grab orang lain!', ephemeral: true });
    }

    // Grab cooldown: 4 minutes per user
    const grabCdKey = `card_grab_${userId}`;
    const grabCooldownMs = 4 * 60 * 1000;
    if (state.fishCooldowns.has(grabCdKey) && Date.now() < state.fishCooldowns.get(grabCdKey)) {
        const remaining = Math.ceil((state.fishCooldowns.get(grabCdKey) - Date.now()) / 1000);
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        return interaction.reply({ content: `\u23F3 Grab cooldown! Tunggu **${mins}m ${secs}s** lagi.`, ephemeral: true });
    }
    state.fishCooldowns.set(grabCdKey, Date.now() + grabCooldownMs);

    // Mark as grabbed
    drop.grabbed[cardIndex] = true;
    const card = drop.cards[cardIndex];

    // Save to DB
    db.prepare(`INSERT INTO pokemon_cards (userId, cardId, cardName, setName, rarity, imageUrl, types, hp, artist, printNumber, obtainedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        userId, card.cardId, card.name, card.setName, card.rarity, card.imageUrl,
        card.types || '', card.hp || '', card.artist || '', card.printNumber, Date.now()
    );

    incrementUserStat(guildId, userId, 'cards_grabbed');

    const rarityData = getRarityData(card.rarity);
    await interaction.reply({
        content: `${rarityData.emoji} <@${userId}> grabbed **${card.name}** from *${card.setName}*! (${card.rarity} #${String(card.printNumber).padStart(4, '0')})`,
        allowedMentions: { users: [] }
    });

    // Update buttons (disable grabbed ones)
    const newRow = new ActionRowBuilder();
    for (let i = 0; i < 3; i++) {
        const btn = new ButtonBuilder()
            .setCustomId(drop.grabbed[i] ? `cardgrab_claimed_${i}` : `cardgrab_${dropId}_${i}`)
            .setLabel(drop.grabbed[i] ? '\u2713' : String(i + 1))
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
    const targetUser = interaction.options?.getUser?.('user') || interaction.user;
    const targetId = targetUser.id;

    const cards = db.prepare('SELECT * FROM pokemon_cards WHERE userId = ? ORDER BY obtainedAt DESC LIMIT 20').all(targetId);
    const totalCards = db.prepare('SELECT COUNT(*) as c FROM pokemon_cards WHERE userId = ?').get(targetId);
    const uniqueCards = db.prepare('SELECT COUNT(DISTINCT cardId) as c FROM pokemon_cards WHERE userId = ?').get(targetId);

    if (cards.length === 0) {
        return interaction.reply({ content: `\u{1F4ED} ${targetUser.username} belum punya kartu Pokemon TCG. Gunakan \`/drop\` untuk mulai collect!`, ephemeral: true });
    }

    let desc = `\u{1F0CF} **${targetUser.username}'s Pokemon TCG Collection**\n`;
    desc += `> \u{1F4CA} Total: **${totalCards.c}** kartu | **${uniqueCards.c}** unique\n\n`;

    // Sort by rarity tier (highest first)
    const sorted = [...cards].sort((a, b) => getRarityTier(b.rarity) - getRarityTier(a.rarity));

    for (const card of sorted.slice(0, 15)) {
        const rd = getRarityData(card.rarity);
        desc += `${rd.emoji} **${card.cardName}** \u2014 *${card.setName}*\n`;
        desc += `> #${String(card.printNumber).padStart(4, '0')} \u2022 ${card.rarity}${card.locked ? ' \u{1F512}' : ''}\n`;
    }
    if (totalCards.c > 15) desc += `\n*...dan ${totalCards.c - 15} kartu lainnya*`;

    const embed = new EmbedBuilder()
        .setTitle('\u{1F0CF} Pokemon TCG Collection')
        .setColor('#FF6B35')
        .setDescription(desc)
        .setFooter({ text: 'Gunakan /cardview <id> untuk melihat detail kartu \u2022 pokemontcg.io' })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

// ==================== CARD VIEW COMMAND ====================
async function handleCardViewCommand(interaction) {
    const cardId = interaction.options.getInteger('id');
    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ?').get(cardId);

    if (!card) return interaction.reply({ content: '\u274C Kartu tidak ditemukan!', ephemeral: true });

    await interaction.deferReply();

    try {
        const rd = getRarityData(card.rarity);

        // Use the HD image directly from API as embed image
        const embed = new EmbedBuilder()
            .setColor(rd.color)
            .setTitle(`${rd.emoji} ${card.cardName}`)
            .setDescription(
                `**Set:** ${card.setName}\n` +
                `**Rarity:** ${rd.emoji} ${card.rarity}\n` +
                `**Print:** #${String(card.printNumber).padStart(4, '0')}\n` +
                (card.types ? `**Type:** ${card.types}\n` : '') +
                (card.hp ? `**HP:** ${card.hp}\n` : '') +
                (card.artist ? `**Artist:** ${card.artist}\n` : '') +
                `**Owner:** <@${card.userId}>\n` +
                `**Obtained:** <t:${Math.floor(card.obtainedAt / 1000)}:R>`
            )
            .setImage(card.imageUrl || null)
            .setFooter({ text: `Card ID: ${card.id} \u2022 ${card.cardId} \u2022 pokemontcg.io` });

        return interaction.editReply({ embeds: [embed] });
    } catch (e) {
        return interaction.editReply({ content: '\u274C Gagal menampilkan kartu.' });
    }
}

// ==================== BURN (SALVAGE) ====================
async function handleCardBurn(interaction) {
    const cardId = interaction.options.getInteger('id');
    const userId = interaction.user.id;
    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ? AND userId = ?').get(cardId, userId);
    if (!card) return interaction.reply({ content: '\u274C Kartu tidak ditemukan atau bukan milikmu!', ephemeral: true });
    if (card.locked) return interaction.reply({ content: '\u274C Kartu ini di-lock! Unlock dulu sebelum burn.', ephemeral: true });

    const value = BURN_VALUES[card.rarity] || 1;
    db.prepare('DELETE FROM pokemon_cards WHERE id = ?').run(cardId);
    addStardust(userId, value);
    const total = getStardust(userId);

    const rd = getRarityData(card.rarity);
    const embed = new EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle('\u{1F525} Card Burned!')
        .setDescription(
            `${rd.emoji} **${card.cardName}** \u2014 *${card.setName}*\n` +
            `> Rarity: ${card.rarity} | Print #${String(card.printNumber).padStart(4, '0')}\n\n` +
            `\u2728 **+${value} Stardust** earned!\n` +
            `> \u{1F4AB} Total Stardust: **${total}**`
        )
        .setFooter({ text: 'Stardust bisa dipakai beli dye, extra drop, dll' });
    return interaction.reply({ embeds: [embed] });
}

// ==================== TRADE ====================
async function handleCardTrade(interaction) {
    const targetUser = interaction.options.getUser('user');
    const cardId = interaction.options.getInteger('kartu_kamu');
    const userId = interaction.user.id;

    if (targetUser.id === userId) return interaction.reply({ content: '\u274C Tidak bisa trade dengan diri sendiri!', ephemeral: true });
    if (targetUser.bot) return interaction.reply({ content: '\u274C Tidak bisa trade dengan bot!', ephemeral: true });

    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ? AND userId = ?').get(cardId, userId);
    if (!card) return interaction.reply({ content: '\u274C Kartu tidak ditemukan atau bukan milikmu!', ephemeral: true });
    if (card.locked) return interaction.reply({ content: '\u274C Kartu ini di-lock!', ephemeral: true });

    // Create trade offer
    db.prepare('INSERT INTO card_trades (senderId, receiverId, senderCardId, status, createdAt) VALUES (?, ?, ?, ?, ?)').run(userId, targetUser.id, cardId, 'pending', Date.now());
    const tradeId = db.prepare('SELECT last_insert_rowid() as id').get().id;

    const rd = getRarityData(card.rarity);
    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('\u{1F504} Trade Offer!')
        .setDescription(
            `<@${userId}> ingin memberikan kartu ke <@${targetUser.id}>:\n\n` +
            `${rd.emoji} **${card.cardName}** \u2014 *${card.setName}*\n` +
            `> ${card.rarity} | Print #${String(card.printNumber).padStart(4, '0')}\n\n` +
            `> <@${targetUser.id}> klik **Accept** untuk menerima!`
        )
        .setThumbnail(card.imageUrl || null)
        .setFooter({ text: `Trade ID: ${tradeId} \u2022 Expires in 5 min` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cardtrade_accept_${tradeId}_${targetUser.id}`).setLabel('\u2705 Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cardtrade_deny_${tradeId}_${targetUser.id}`).setLabel('\u274C Deny').setStyle(ButtonStyle.Danger),
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
        return interaction.reply({ content: '\u274C Trade ini bukan untukmu!', ephemeral: true });
    }

    const trade = db.prepare('SELECT * FROM card_trades WHERE id = ?').get(tradeId);
    if (!trade) return interaction.reply({ content: '\u274C Trade tidak ditemukan!', ephemeral: true });
    if (trade.status !== 'pending') return interaction.reply({ content: '\u274C Trade sudah expired/selesai!', ephemeral: true });

    if (action === 'deny') {
        db.prepare('UPDATE card_trades SET status = ? WHERE id = ?').run('denied', tradeId);
        return interaction.update({ content: '\u274C Trade ditolak.', embeds: [], components: [] });
    }

    // Accept: transfer card
    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ?').get(trade.senderCardId);
    if (!card || card.userId !== trade.senderId) {
        db.prepare('UPDATE card_trades SET status = ? WHERE id = ?').run('failed', tradeId);
        return interaction.update({ content: '\u274C Kartu sudah tidak ada di sender!', embeds: [], components: [] });
    }

    db.prepare('UPDATE pokemon_cards SET userId = ? WHERE id = ?').run(trade.receiverId, trade.senderCardId);
    db.prepare('UPDATE card_trades SET status = ? WHERE id = ?').run('completed', tradeId);

    const rd = getRarityData(card.rarity);
    return interaction.update({
        content: `\u2705 Trade berhasil! ${rd.emoji} **${card.cardName}** sekarang milik <@${trade.receiverId}>!`,
        embeds: [], components: []
    });
}

// ==================== WISHLIST ====================
async function handleCardWishlist(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'add') {
        const cardName = interaction.options.getString('karakter');
        const existing = db.prepare('SELECT COUNT(*) as c FROM card_wishlist WHERE userId = ?').get(userId);
        if (existing.c >= 10) return interaction.reply({ content: '\u274C Wishlist penuh! (maks 10). Hapus dulu pakai `/wishlist remove`.', ephemeral: true });
        db.prepare('INSERT OR IGNORE INTO card_wishlist (userId, cardName) VALUES (?, ?)').run(userId, cardName.toLowerCase());
        return interaction.reply({ content: `\u2764\u{FE0F} **${cardName}** ditambahkan ke wishlist!`, ephemeral: true });
    }

    if (sub === 'remove') {
        const cardName = interaction.options.getString('karakter');
        db.prepare('DELETE FROM card_wishlist WHERE userId = ? AND cardName = ?').run(userId, cardName.toLowerCase());
        return interaction.reply({ content: `\u{1F5D1}\u{FE0F} **${cardName}** dihapus dari wishlist.`, ephemeral: true });
    }

    if (sub === 'list') {
        const wishes = db.prepare('SELECT * FROM card_wishlist WHERE userId = ?').all(userId);
        if (wishes.length === 0) return interaction.reply({ content: '\u{1F4ED} Wishlist kosong! Tambah dengan `/wishlist add`.', ephemeral: true });
        const list = wishes.map((w, i) => `> **${i + 1}.** \u2764\u{FE0F} ${w.cardName}`).join('\n');
        const embed = new EmbedBuilder()
            .setTitle('\u2764\u{FE0F} Card Wishlist')
            .setColor('#FF69B4')
            .setDescription(`${list}\n\n-# Kamu akan di-ping kalau Pokemon wishlist muncul di drop!`)
            .setFooter({ text: `${wishes.length}/10 slot` });
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

// Check wishlist during drop
function checkWishlistNotify(guildId, cards) {
    try {
        const allWishes = db.prepare('SELECT * FROM card_wishlist').all();
        const notifications = [];
        for (const card of cards) {
            const nameLower = card.name.toLowerCase();
            for (const wish of allWishes) {
                if (nameLower.includes(wish.cardName) || wish.cardName.includes(nameLower)) {
                    notifications.push({ userId: wish.userId, cardName: card.name });
                }
            }
        }
        return notifications;
    } catch (_) { return []; }
}

// ==================== DYE / TINT ====================
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

    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ? AND userId = ?').get(cardId, userId);
    if (!card) return interaction.reply({ content: '\u274C Kartu tidak ditemukan atau bukan milikmu!', ephemeral: true });

    const dye = DYE_COLORS[dyeId];
    if (!dye) return interaction.reply({ content: '\u274C Warna tidak valid!', ephemeral: true });

    const stardust = getStardust(userId);
    if (stardust < dye.cost) return interaction.reply({ content: `\u274C Stardust tidak cukup! Butuh **${dye.cost}**, kamu punya **${stardust}**.\n> Burn kartu untuk dapat Stardust!`, ephemeral: true });

    addStardust(userId, -dye.cost);
    db.prepare('UPDATE pokemon_cards SET dye = ? WHERE id = ?').run(dyeId, cardId);

    const embed = new EmbedBuilder()
        .setColor(dye.hex)
        .setTitle('\u{1F3A8} Card Dyed!')
        .setDescription(
            `${getRarityData(card.rarity).emoji} **${card.cardName}** sekarang punya border **${dye.name}**!\n\n` +
            `> \u{1F4AB} -${dye.cost} Stardust | Sisa: **${getStardust(userId)}**\n\n` +
            `-# Gunakan /cardview untuk melihat hasilnya!`
        );
    return interaction.reply({ embeds: [embed] });
}

// ==================== ALBUM (group by Set) ====================
function getSetCompletion(userId) {
    const cards = db.prepare('SELECT DISTINCT cardId, setName FROM pokemon_cards WHERE userId = ?').all(userId);
    const setMap = {};
    for (const c of cards) {
        if (!setMap[c.setName]) setMap[c.setName] = 0;
        setMap[c.setName]++;
    }
    return setMap;
}

async function handleCardAlbum(interaction) {
    const userId = interaction.options?.getUser?.('user')?.id || interaction.user.id;
    const setMap = getSetCompletion(userId);

    const sorted = Object.entries(setMap).sort((a, b) => b[1] - a[1]).slice(0, 15);
    if (sorted.length === 0) {
        return interaction.reply({ content: '\u{1F4ED} Belum punya kartu! Gunakan `/drop` untuk mulai.', ephemeral: true });
    }

    let desc = `\u{1F4E6} **Pokemon TCG Album** \u2014 By Set\n\n`;
    for (const [setName, count] of sorted) {
        const bonus = count >= 5 ? ' \u{1F3C6} SET BONUS!' : count >= 3 ? ' \u2B50' : '';
        desc += `> **${setName}** \u2014 ${count} kartu${bonus}\n`;
    }
    desc += `\n-# \u{1F3C6} Set Bonus: 5+ kartu dari set yang sama = bonus Stardust harian!`;

    // Award set bonus for 5+ card sets (once per day)
    const today = new Date().toLocaleDateString('sv-SE');
    let bonusMsg = '';
    const setsOf5 = sorted.filter(([_, c]) => c >= 5).length;
    if (setsOf5 > 0 && interaction.user.id === userId) {
        const cdKey = `album_bonus_${userId}_${today}`;
        if (!state.fishCooldowns.has(cdKey)) {
            const bonusAmount = setsOf5 * 5;
            addStardust(userId, bonusAmount);
            state.fishCooldowns.set(cdKey, Date.now() + 86400000);
            bonusMsg = `\n\n\u{1F3C6} **Set Bonus claimed!** +${bonusAmount} Stardust (${setsOf5} sets \u00D7 5)`;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('\u{1F4E6} Pokemon TCG Album')
        .setColor('#9B59B6')
        .setDescription(desc + bonusMsg)
        .setFooter({ text: `Total: ${Object.values(setMap).reduce((a, b) => a + b, 0)} kartu | ${Object.keys(setMap).length} sets \u2022 pokemontcg.io` });
    return interaction.reply({ embeds: [embed] });
}

// ==================== LEADERBOARD ====================
async function handleCardLeaderboard(interaction) {
    const type = interaction.options?.getString?.('tipe') || 'total';

    let title, rows;
    if (type === 'total') {
        title = '\u{1F0CF} Most Cards';
        rows = db.prepare('SELECT userId, COUNT(*) as cnt FROM pokemon_cards GROUP BY userId ORDER BY cnt DESC LIMIT 10').all();
    } else if (type === 'rare') {
        title = '\u{1F451} Most Rare+ Cards';
        rows = db.prepare("SELECT userId, COUNT(*) as cnt FROM pokemon_cards WHERE rarity IN ('Rare Ultra','Rare Rainbow','Rare Secret','Illustration Rare','Special Art Rare') GROUP BY userId ORDER BY cnt DESC LIMIT 10").all();
    } else if (type === 'stardust') {
        title = '\u{1F4AB} Most Stardust';
        rows = db.prepare('SELECT userId, amount as cnt FROM card_stardust ORDER BY amount DESC LIMIT 10').all();
    } else if (type === 'prints') {
        title = '\u{1F3F7}\u{FE0F} Lowest Prints (Rarest Cards)';
        rows = db.prepare('SELECT userId, cardName, printNumber as cnt, rarity FROM pokemon_cards WHERE printNumber <= 10 ORDER BY printNumber ASC LIMIT 10').all();
    }

    if (!rows || rows.length === 0) {
        return interaction.reply({ content: '\u{1F4ED} Belum ada data leaderboard!', ephemeral: true });
    }

    let desc = '';
    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    rows.forEach((r, i) => {
        const medal = medals[i] || `**${i + 1}.**`;
        if (type === 'prints') {
            const rd = getRarityData(r.rarity);
            desc += `${medal} ${rd.emoji} **${r.cardName}** #${String(r.cnt).padStart(4, '0')} \u2014 <@${r.userId}>\n`;
        } else {
            desc += `${medal} <@${r.userId}> \u2014 **${r.cnt.toLocaleString('id-ID')}**\n`;
        }
    });

    const embed = new EmbedBuilder()
        .setTitle(`\u{1F4CA} Card Leaderboard \u2014 ${title}`)
        .setColor('#FFD700')
        .setDescription(desc)
        .setFooter({ text: 'Pokemon TCG \u2022 pokemontcg.io' })
        .setTimestamp();
    return interaction.reply({ embeds: [embed] });
}

// ==================== STARDUST BALANCE COMMAND ====================
async function handleStardustCommand(interaction) {
    const userId = interaction.user.id;
    const amount = getStardust(userId);

    let desc = `\u{1F4AB} **Stardust Balance**\n\n> \u{1F48E} Kamu punya: **${amount}** Stardust\n\n`;
    desc += `**\u{1F6D2} Stardust Shop:**\n`;
    desc += `> \u{1F3A8} Card Dye \u2014 50-100 \u2728\n`;
    desc += `> \u{1F0CF} Extra Drop (skip cooldown) \u2014 200 \u2728\n\n`;
    desc += `-# Burn kartu untuk dapat Stardust! /cardburn id:<card_id>`;

    const embed = new EmbedBuilder()
        .setTitle('\u{1F4AB} Stardust')
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

// ==================== EXPORTS ====================
module.exports = {
    handleCardPanelCommand,
    handleCardPanelButton,
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
    isCardPanelButton,
    generateCardImage,
    generateDropImage,
    fetchRandomCards,
    RARITIES,
};
