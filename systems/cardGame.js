// systems/cardGame.js — Pokemon TCG Card Gacha
// Buy packs → get real cards from pokemontcg.io
// Fan-made • Not affiliated with Nintendo/The Pokemon Company
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { db, getOrCreateUser, incrementUserStat, getUserStat } = require('../database');
const state = require('../state');

// ==================== POKEMON GACHA PACKS ====================
const PACKS = {
    basic:   { name: '🟢 Basic Pack',   price: 15000,   count: 3,  pool: ['Common','Uncommon','Rare'], cooldown: 5 * 60 * 1000 },
    premium: { name: '🔵 Premium Pack',  price: 75000,   count: 3,  pool: ['Rare','Rare Holo','Rare Holo EX','Rare Holo GX','Rare Holo V'], cooldown: 15 * 60 * 1000 },
    ultra:   { name: '🟣 Ultra Pack',    price: 200000,  count: 3,  pool: ['Rare Holo','Rare Ultra','Rare Rainbow','Rare Secret'], cooldown: 30 * 60 * 1000 },
    master:  { name: '💎 Master Pack',   price: 750000,  count: 10, pool: ['Rare','Rare Holo','Rare Holo EX','Rare Holo GX','Rare Holo V','Rare Ultra','Rare Rainbow','Rare Secret','Illustration Rare'], guaranteed: 'Rare Ultra', cooldown: 60 * 60 * 1000 },
};

// ==================== DATABASE ====================
try { db.exec(`DROP TABLE IF EXISTS card_prints`); } catch (_) {}
try { db.exec(`DROP TABLE IF EXISTS anime_cards`); } catch (_) {}

// Migrate pokemon_cards
try {
    const cols = db.prepare("PRAGMA table_info(pokemon_cards)").all();
    if (cols.length > 0 && !cols.some(c => c.name === 'cardApiId')) db.exec(`DROP TABLE pokemon_cards`);
} catch (_) {}

db.exec(`CREATE TABLE IF NOT EXISTS pokemon_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    cardApiId TEXT NOT NULL,
    name TEXT NOT NULL,
    setName TEXT DEFAULT '',
    rarity TEXT DEFAULT 'Common',
    imageUrl TEXT DEFAULT '',
    types TEXT DEFAULT '',
    hp TEXT DEFAULT '',
    artist TEXT DEFAULT '',
    obtainedAt INTEGER DEFAULT 0,
    locked INTEGER DEFAULT 0,
    dye TEXT DEFAULT '',
    marketPrice REAL DEFAULT 0
)`);
try { db.exec(`ALTER TABLE pokemon_cards ADD COLUMN marketPrice REAL DEFAULT 0`); } catch(_) {}

db.exec(`CREATE TABLE IF NOT EXISTS card_stardust (userId TEXT PRIMARY KEY, amount INTEGER DEFAULT 0)`);

try {
    const cols = db.prepare("PRAGMA table_info(card_wishlist)").all();
    if (cols.length > 0 && !cols.some(c => c.name === 'name')) db.exec(`DROP TABLE card_wishlist`);
} catch (_) {}
db.exec(`CREATE TABLE IF NOT EXISTS card_wishlist (userId TEXT, name TEXT, PRIMARY KEY(userId, name))`);

try {
    const cols = db.prepare("PRAGMA table_info(card_trades)").all();
    if (cols.length > 0 && !cols.some(c => c.name === 'cardRowId')) db.exec(`DROP TABLE card_trades`);
} catch (_) {}
db.exec(`CREATE TABLE IF NOT EXISTS card_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT, senderId TEXT, receiverId TEXT,
    cardRowId INTEGER, status TEXT DEFAULT 'pending', createdAt INTEGER
)`);

try {
    const cols = db.prepare("PRAGMA table_info(pokemon_card_cache)").all();
    if (cols.length > 0 && !cols.some(c => c.name === 'cardApiId')) db.exec(`DROP TABLE pokemon_card_cache`);
} catch (_) {}
db.exec(`CREATE TABLE IF NOT EXISTS pokemon_card_cache (
    cardApiId TEXT PRIMARY KEY, name TEXT, setName TEXT, rarity TEXT,
    imageUrl TEXT, types TEXT DEFAULT '', hp TEXT DEFAULT '', artist TEXT DEFAULT '', cachedAt INTEGER,
    marketPrice REAL DEFAULT 0
)`);
try { db.exec(`ALTER TABLE pokemon_card_cache ADD COLUMN marketPrice REAL DEFAULT 0`); } catch(_) {}

// Stats table for tracking total spent
db.exec(`CREATE TABLE IF NOT EXISTS card_stats (userId TEXT PRIMARY KEY, totalSpent INTEGER DEFAULT 0)`);

// Backfill: sync marketPrice from cache to pokemon_cards for cards that have price=0
try {
    db.exec(`UPDATE pokemon_cards SET marketPrice = (
        SELECT pokemon_card_cache.marketPrice FROM pokemon_card_cache
        WHERE pokemon_card_cache.cardApiId = pokemon_cards.cardApiId AND pokemon_card_cache.marketPrice > 0
    ) WHERE marketPrice = 0 AND cardApiId IN (SELECT cardApiId FROM pokemon_card_cache WHERE marketPrice > 0)`);
} catch(_) {}

// ==================== POKEMON RARITY ====================
const RARITIES = {
    'Common':            { emoji: '⚪', color: '#AAAAAA', tier: 0, dust: 1 },
    'Uncommon':          { emoji: '🟢', color: '#2ECC71', tier: 1, dust: 3 },
    'Rare':              { emoji: '🔵', color: '#3498DB', tier: 2, dust: 8 },
    'Rare Holo':         { emoji: '🟣', color: '#9B59B6', tier: 3, dust: 20 },
    'Rare Holo EX':      { emoji: '🟡', color: '#FFD700', tier: 4, dust: 50 },
    'Rare Holo GX':      { emoji: '🟡', color: '#FFD700', tier: 4, dust: 50 },
    'Rare Holo V':       { emoji: '🟡', color: '#FFD700', tier: 4, dust: 50 },
    'Rare Ultra':        { emoji: '🔴', color: '#E74C3C', tier: 5, dust: 100 },
    'Rare Rainbow':      { emoji: '🌈', color: '#FF69B4', tier: 6, dust: 180 },
    'Rare Secret':       { emoji: '👑', color: '#FF0000', tier: 7, dust: 250 },
    'Illustration Rare': { emoji: '🎨', color: '#DA70D6', tier: 7, dust: 250 },
    'Special Art Rare':  { emoji: '💎', color: '#00CED1', tier: 8, dust: 400 },
};

function rdata(rarity) {
    if (RARITIES[rarity]) return RARITIES[rarity];
    if (rarity?.includes('VMAX') || rarity?.includes('VSTAR')) return RARITIES['Rare Ultra'];
    if (rarity?.includes('Secret')) return RARITIES['Rare Secret'];
    if (rarity?.includes('Rainbow')) return RARITIES['Rare Rainbow'];
    if (rarity?.includes('Ultra')) return RARITIES['Rare Ultra'];
    if (rarity?.includes('Holo')) return RARITIES['Rare Holo'];
    if (rarity?.includes('Rare')) return RARITIES['Rare'];
    if (rarity?.includes('Uncommon')) return RARITIES['Uncommon'];
    return RARITIES['Common'];
}

// ==================== POKEMON API ====================
const API = 'https://api.pokemontcg.io/v2/cards';
const MAX_PG = { 'Common':80,'Uncommon':60,'Rare':50,'Rare Holo':30,'Rare Holo EX':10,'Rare Holo GX':10,'Rare Holo V':15,'Rare Ultra':8,'Rare Rainbow':5,'Rare Secret':4,'Illustration Rare':3,'Special Art Rare':2 };

function getApiHeaders() {
    const headers = { Accept: 'application/json' };
    if (process.env.POKEMON_TCG_API_KEY) {
        headers['X-Api-Key'] = process.env.POKEMON_TCG_API_KEY;
    }
    return headers;
}

let apiCooldownUntil = 0;

async function apiFetch(rarity) {
    if (Date.now() < apiCooldownUntil) return null;
    const q = encodeURIComponent(`rarity:"${rarity}"`);
    const pg = Math.floor(Math.random() * (MAX_PG[rarity] || 10)) + 1;
    try {
        const headers = getApiHeaders();
        let res = await fetch(`${API}?q=${q}&pageSize=20&page=${pg}`, { headers });
        if (!res.ok) {
            if (res.status === 429) {
                console.error('[TCG] API Rate limited! Cooling down for 5m.');
                apiCooldownUntil = Date.now() + 5 * 60 * 1000;
            }
            res = await fetch(`${API}?q=${q}&pageSize=20&page=1`, { headers });
        }
        if (!res.ok) {
            if (res.status === 429) {
                console.error('[TCG] API Rate limited! Cooling down for 5m.');
                apiCooldownUntil = Date.now() + 5 * 60 * 1000;
            }
            return null;
        }
        const json = await res.json();
        const cards = json.data || [];
        if (!cards.length) return null;
        const p = cards[Math.floor(Math.random() * cards.length)];
        if (!p.id || !p.name) return null;

        // Extract market price from API response
        let marketPrice = 0;
        if (p.tcgplayer?.prices) {
            const priceVariants = p.tcgplayer.prices;
            for (const variant of ['holofoil', 'reverseHolofoil', '1stEditionHolofoil', 'normal', '1stEditionNormal', 'unlimitedHolofoil']) {
                if (priceVariants[variant]?.market) { marketPrice = priceVariants[variant].market; break; }
            }
            if (!marketPrice) {
                for (const variant of Object.keys(priceVariants)) {
                    if (priceVariants[variant]?.market) { marketPrice = priceVariants[variant].market; break; }
                    if (!marketPrice && priceVariants[variant]?.mid) { marketPrice = priceVariants[variant].mid; }
                }
            }
        }
        if (!marketPrice && p.cardmarket?.prices?.averageSellPrice) {
            marketPrice = Math.round(p.cardmarket.prices.averageSellPrice * 1.1 * 100) / 100;
        }

        return { cardApiId: p.id, name: p.name, setName: p.set?.name || 'Unknown', rarity: p.rarity || rarity,
            imageUrl: p.images?.large || p.images?.small || '', types: (p.types||[]).join('/'), hp: p.hp||'', artist: p.artist||'', marketPrice: marketPrice || 0 };
    } catch (e) { console.error('[TCG] API:', e.message); return null; }
}

function cache(c) {
    try { db.prepare(`INSERT OR REPLACE INTO pokemon_card_cache (cardApiId,name,setName,rarity,imageUrl,types,hp,artist,cachedAt,marketPrice) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
        c.cardApiId,c.name,c.setName,c.rarity,c.imageUrl,c.types,c.hp,c.artist,Date.now(),c.marketPrice||0); } catch(_){}
}

function fromCache(rarity, excludeIds) {
    try {
        if (excludeIds && excludeIds.size > 0) {
            const all = db.prepare('SELECT * FROM pokemon_card_cache WHERE rarity=? ORDER BY RANDOM() LIMIT 10').all(rarity);
            const filtered = all.filter(c => !excludeIds.has(c.cardApiId));
            return filtered.length > 0 ? filtered[0] : (all.length > 0 ? all[0] : null);
        }
        return db.prepare('SELECT * FROM pokemon_card_cache WHERE rarity=? ORDER BY RANDOM() LIMIT 1').get(rarity);
    } catch(_){ return null; }
}

function getUserOwnedCardIds(userId) {
    try {
        const rows = db.prepare('SELECT DISTINCT cardApiId FROM pokemon_cards WHERE userId=?').all(userId);
        return new Set(rows.map(r => r.cardApiId));
    } catch(_){ return new Set(); }
}

// CACHE_ONLY mode: if pre-fetch has been done, skip API entirely
const CACHE_ONLY = process.env.POKEMON_TCG_CACHE_ONLY === '1';

function getCacheCount() {
    try { return db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c; } catch(_){ return 0; }
}

async function pullCards(pool, count, userId) {
    const results = [];
    const ownedIds = userId ? getUserOwnedCardIds(userId) : new Set();
    const cacheSize = getCacheCount();
    const isApiCooledDown = Date.now() < apiCooldownUntil;
    // If cache has 1000+ cards, prefer cache heavily (90%). If CACHE_ONLY or API cooldown, use 100% cache.
    const cacheChance = (CACHE_ONLY || isApiCooledDown) ? 1.0 : (cacheSize >= 1000 ? 0.9 : 0.5);

    for (let i = 0; i < count; i++) {
        const rarity = pool[Math.floor(Math.random() * pool.length)];
        let card = null;

        // Try cache first
        if (Math.random() < cacheChance || CACHE_ONLY || isApiCooledDown) {
            const c = fromCache(rarity, ownedIds);
            if (c?.cardApiId && c?.name) card = { cardApiId:c.cardApiId, name:c.name, setName:c.setName||'', rarity:c.rarity||rarity, imageUrl:c.imageUrl||'', types:c.types||'', hp:c.hp||'', artist:c.artist||'', marketPrice:c.marketPrice||0 };
            // If cache miss on specific rarity, try any rarity from pool
            if (!card && (CACHE_ONLY || isApiCooledDown)) {
                for (const fallbackRarity of pool) {
                    const fc = fromCache(fallbackRarity, ownedIds);
                    if (fc?.cardApiId && fc?.name) { card = { cardApiId:fc.cardApiId, name:fc.name, setName:fc.setName||'', rarity:fc.rarity||fallbackRarity, imageUrl:fc.imageUrl||'', types:fc.types||'', hp:fc.hp||'', artist:fc.artist||'', marketPrice:fc.marketPrice||0 }; break; }
                }
            }
        }

        // API fetch if no cache hit (and not CACHE_ONLY/cooldown)
        if (!card && !CACHE_ONLY && !isApiCooledDown) {
            card = await apiFetch(rarity);
            if (!card?.cardApiId) card = await apiFetch('Common');
        }

        // Final fallback: any cache
        if (!card?.cardApiId) {
            const c = fromCache('Common', ownedIds) || fromCache(rarity, new Set());
            if (c?.cardApiId) card = { cardApiId:c.cardApiId, name:c.name, setName:c.setName||'', rarity:c.rarity||'Common', imageUrl:c.imageUrl||'', types:c.types||'', hp:c.hp||'', artist:c.artist||'', marketPrice:c.marketPrice||0 };
        }

        if (card?.cardApiId && card?.name) { cache(card); results.push(card); }
    }
    return results;
}

// ==================== IMAGE ====================
async function loadImageWithTimeout(url, timeoutMs = 8000) {
    return Promise.race([
        loadImage(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Image load timeout')), timeoutMs))
    ]);
}

async function generateGachaImage(cards) {
    // Max 5 per row
    const cols = Math.min(cards.length, 5);
    const rows = Math.ceil(cards.length / 5);
    const cw = 200, ch = 280, gap = 8, pad = 10;
    const w = cols * cw + (cols-1) * gap + pad * 2;
    const h = rows * ch + (rows-1) * gap + pad * 2;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < cards.length; i++) {
        const col = i % 5, row = Math.floor(i / 5);
        const x = pad + col * (cw + gap), y = pad + row * (ch + gap);
        try {
            if (cards[i].imageUrl) { const img = await loadImageWithTimeout(cards[i].imageUrl); ctx.drawImage(img, x, y, cw, ch); }
            else throw new Error('no url');
        } catch (_) {
            ctx.fillStyle = '#1e1e3a'; ctx.fillRect(x, y, cw, ch);
            ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(cards[i].name, x+cw/2, y+ch/2);
        }
        const rarityColor = rdata(cards[i].rarity).color;
        ctx.strokeStyle = rarityColor; ctx.lineWidth = 2.5; ctx.strokeRect(x, y, cw, ch);
    }
    return canvas.toBuffer('image/png');
}

// Gallery image for collection — Card Book / Binder style
async function generateGalleryImage(cards) {
    const cols = Math.min(cards.length, 5);
    const rows = Math.ceil(cards.length / 5);
    const cw = 220, ch = 308; // bigger cards for clarity
    const slotPad = 8;
    const slotW = cw + slotPad * 2, slotH = ch + slotPad * 2;
    const gapX = 16, gapY = 18;
    const marginX = 30, marginY = 30;
    const w = cols * slotW + (cols - 1) * gapX + marginX * 2;
    const h = rows * slotH + (rows - 1) * gapY + marginY * 2;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');

    // === BINDER BACKGROUND (dark leather texture) ===
    ctx.fillStyle = '#1a1520';
    ctx.fillRect(0, 0, w, h);
    // Subtle grid pattern
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < w; gx += 20) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
    for (let gy = 0; gy < h; gy += 20) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

    // === OUTER BORDER (gold accent) ===
    ctx.strokeStyle = 'rgba(218,165,32,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.strokeStyle = 'rgba(218,165,32,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, w - 24, h - 24);

    // === CARD SLOTS ===
    for (let i = 0; i < cards.length; i++) {
        const col = i % 5, row = Math.floor(i / 5);
        const slotX = marginX + col * (slotW + gapX);
        const slotY = marginY + row * (slotH + gapY);

        // Slot background (recessed look)
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(slotX, slotY, slotW, slotH);

        // Slot inner border
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(slotX, slotY, slotW, slotH);

        // Card image
        const cardX = slotX + slotPad;
        const cardY = slotY + slotPad;
        try {
            if (cards[i].imageUrl) {
                const img = await loadImageWithTimeout(cards[i].imageUrl);
                ctx.drawImage(img, cardX, cardY, cw, ch);
            } else throw new Error('no url');
        } catch (_) {
            // Empty slot placeholder
            ctx.fillStyle = '#2a2035';
            ctx.fillRect(cardX, cardY, cw, ch);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cards[i].name, cardX + cw / 2, cardY + ch / 2);
        }

        // Rarity glow border around card
        const rarityColor = rdata(cards[i].rarity).color;
        ctx.strokeStyle = rarityColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(cardX - 1, cardY - 1, cw + 2, ch + 2);

        // Subtle shadow below card
        const shadowGrad = ctx.createLinearGradient(cardX, cardY + ch, cardX, cardY + ch + 4);
        shadowGrad.addColorStop(0, 'rgba(0,0,0,0.4)');
        shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = shadowGrad;
        ctx.fillRect(cardX, cardY + ch, cw, 4);
    }

    // === EMPTY SLOTS (if less than 10 cards, show empty slots) ===
    const totalSlots = cols * rows;
    for (let i = cards.length; i < totalSlots; i++) {
        const col = i % 5, row = Math.floor(i / 5);
        const slotX = marginX + col * (slotW + gapX);
        const slotY = marginY + row * (slotH + gapY);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(slotX, slotY, slotW, slotH);
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.strokeRect(slotX, slotY, slotW, slotH);
    }

    return canvas.toBuffer('image/png');
}

// ==================== STATS HELPERS ====================
function getTotalSpent(userId) {
    try {
        const r = db.prepare('SELECT totalSpent FROM card_stats WHERE userId=?').get(userId);
        return r ? r.totalSpent : 0;
    } catch(_){ return 0; }
}

function addTotalSpent(userId, amount) {
    try {
        db.prepare('INSERT OR IGNORE INTO card_stats(userId, totalSpent) VALUES(?, 0)').run(userId);
        db.prepare('UPDATE card_stats SET totalSpent = totalSpent + ? WHERE userId=?').run(amount, userId);
    } catch(_){}
}

// ==================== COOLDOWN HELPERS ====================
function checkPackCooldown(packId, userId, prefix = 'cardpack') {
    const key = `${prefix}_${packId}_${userId}`;
    const expiry = state.fishCooldowns.get(key);
    if (expiry && Date.now() < expiry) {
        const remaining = expiry - Date.now();
        const mins = Math.ceil(remaining / 60000);
        return mins;
    }
    return 0;
}

function setPackCooldown(packId, userId, cooldown, prefix = 'cardpack') {
    const key = `${prefix}_${packId}_${userId}`;
    state.fishCooldowns.set(key, Date.now() + cooldown);
}

// ==================== POKEMON PANEL ====================
function buildPanel(userId) {
    const total = db.prepare('SELECT COUNT(*) as c FROM pokemon_cards WHERE userId=?').get(userId).c;
    const unique = db.prepare('SELECT COUNT(DISTINCT cardApiId) as c FROM pokemon_cards WHERE userId=?').get(userId).c;
    const totalSpent = getTotalSpent(userId);

    const top = db.prepare(`SELECT * FROM pokemon_cards WHERE userId=? ORDER BY
        CASE rarity WHEN 'Special Art Rare' THEN 0 WHEN 'Illustration Rare' THEN 1 WHEN 'Rare Secret' THEN 2
        WHEN 'Rare Rainbow' THEN 3 WHEN 'Rare Ultra' THEN 4 WHEN 'Rare Holo V' THEN 5
        WHEN 'Rare Holo GX' THEN 5 WHEN 'Rare Holo EX' THEN 5 WHEN 'Rare Holo' THEN 6 ELSE 9 END LIMIT 3`).all(userId);

    const topDesc = top.length > 0
        ? top.map(c => `> ${rdata(c.rarity).emoji} **${c.name}** — *${c.setName}*`).join('\n')
        : '> *Belum ada kartu!*';

    const embed = new EmbedBuilder()
        .setTitle('🎴 POKEMON TCG CARD PANEL')
        .setColor('#E74C3C')
        .setDescription(
            `**📊 Stats:**\n` +
            `> 🃏 Kartu: **${total}** | 🎴 Unique: **${unique}**\n` +
            `> 💸 Total Spent: **${totalSpent.toLocaleString('id-ID')}**\n\n` +
            `**🏆 Top Cards:**\n${topDesc}\n\n` +
            `**🎴 Gacha Packs:**\n` +
            `> 🟢 Basic — 3 kartu (💰 15.000) ⏱️ 5m CD\n` +
            `> 🔵 Premium — 3 kartu (💰 75.000) ⏱️ 15m CD\n` +
            `> 🟣 Ultra — 3 kartu (💰 200.000) ⏱️ 30m CD\n` +
            `> 💎 Master — 10 kartu (💰 750.000) ⏱️ 60m CD\n\n` +
            `**📋 Menu:**\n` +
            `> 📖 **Collection** — Gallery kartu milikmu (paginated)\n` +
            `> 🔄 **Trade** — Gunakan /trade untuk tukar kartu\n` +
            `> ❤️ **Wishlist** — Pokemon incaran\n` +
            `> 📊 **Leaderboard** — Top collectors`
        )
        .setFooter({ text: 'Fan-made • Not affiliated with Nintendo/The Pokemon Company' })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`card_gacha_basic_${userId}`).setLabel('🟢 Basic (💰15k)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`card_gacha_premium_${userId}`).setLabel('🔵 Premium (💰75k)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`card_gacha_ultra_${userId}`).setLabel('🟣 Ultra (💰200k)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`card_gacha_master_${userId}`).setLabel('💎 Master (💰750k)').setStyle(ButtonStyle.Danger),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`card_collection_${userId}`).setLabel('📖 Collection').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`card_wishlist_${userId}`).setLabel('❤️ Wishlist').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`card_leaderboard_${userId}`).setLabel('📊 Leaderboard').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row1, row2] };
}

// ==================== /card COMMAND ====================
async function handleCardPanelCommand(interaction) { return interaction.reply(buildPanel(interaction.user.id)); }

// ==================== POKEMON GACHA ====================
async function handleGacha(interaction, packId, userId) {
    const guildId = interaction.guild.id;
    const pack = PACKS[packId];
    if (!pack) return interaction.reply({ content: '❌ Pack tidak valid!', ephemeral: true });

    // Cooldown check
    const cdMins = checkPackCooldown(packId, userId, 'cardpack');
    if (cdMins > 0) {
        return interaction.reply({ content: `⏱️ Cooldown! Pack **${pack.name}** bisa dibuka lagi dalam **${cdMins} menit**.`, ephemeral: true });
    }

    const userData = getOrCreateUser(guildId, userId);
    if (userData.balance < pack.price) {
        return interaction.reply({ content: `❌ Uang tidak cukup! Butuh **💰 ${pack.price.toLocaleString('id-ID')}**, punya **💰 ${userData.balance.toLocaleString('id-ID')}**.`, ephemeral: true });
    }

    db.prepare('UPDATE users SET balance=balance-? WHERE guildId=? AND userId=?').run(pack.price, guildId, userId);
    await interaction.deferReply();

    try {
        let cards = await pullCards(pack.pool, pack.count, userId);

        // Master pack: guarantee at least 1 Ultra+
        if (pack.guaranteed && cards.length > 0) {
            const hasUltra = cards.some(c => (rdata(c.rarity).tier || 0) >= 5);
            if (!hasUltra) {
                const ultra = await apiFetch(pack.guaranteed);
                if (ultra?.cardApiId) { cache(ultra); cards[0] = ultra; }
            }
        }

        if (!cards || cards.length < pack.count) {
            db.prepare('UPDATE users SET balance=balance+? WHERE guildId=? AND userId=?').run(pack.price, guildId, userId);
            return interaction.editReply('❌ Gagal fetch kartu. Uang dikembalikan!');
        }

        // Set cooldown after successful purchase
        setPackCooldown(packId, userId, pack.cooldown, 'cardpack');

        // Track total spent
        addTotalSpent(userId, pack.price);

        // Get user's existing cardApiIds for dupe detection
        const ownedIds = getUserOwnedCardIds(userId);

        // Save all to collection
        for (const c of cards) {
            db.prepare(`INSERT INTO pokemon_cards (userId,cardApiId,name,setName,rarity,imageUrl,types,hp,artist,obtainedAt,marketPrice) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
                userId, c.cardApiId, c.name, c.setName, c.rarity, c.imageUrl, c.types, c.hp, c.artist, Date.now(), c.marketPrice||0);
        }
        incrementUserStat(guildId, userId, 'cards_grabbed');

        // Quest progress: card_gacha
        try { const { updateQuestProgress } = require('./quests'); updateQuestProgress(guildId, userId, 'card_gacha', 1); } catch (_) {}

        // Achievement check: card collection
        try {
            const { checkAchievements } = require('./achievements');
            const totalCards = db.prepare('SELECT COUNT(*) AS c FROM pokemon_cards WHERE userId = ?').get(userId)?.c || 0;
            const hasRareHolo = cards.some(c => { const t = (RARITIES[c.rarity] || {}).tier || 0; return t >= 3; });
            const hasUltra = cards.some(c => { const t = (RARITIES[c.rarity] || {}).tier || 0; return t >= 5; });
            await checkAchievements(interaction.guild, userId, { type: 'card_gacha', totalCards, hasRareHolo, hasUltra });
        } catch (_) {}

        const img = await require('./imageRenderer').generateCardImage(cards);
        const att = new AttachmentBuilder(img, { name: 'gacha.png' });

        const desc = cards.map((c, i) => {
            const r = rdata(c.rarity);
            const isDupe = ownedIds.has(c.cardApiId);
            const dupeTag = isDupe ? ' 🔄 **DUPE**' : '';
            const priceTag = c.marketPrice > 0 ? ` 💰$${c.marketPrice.toFixed(2)}` : '';
            return `**${i+1}.** ${r.emoji} **${c.name}** — *${c.setName}* [${c.rarity}]${priceTag}${dupeTag}`;
        }).join('\n');

        const pings = checkWishlist(cards);
        const pingText = pings.length > 0 ? '\n\n' + pings.map(p => `📢 <@${p.userId}> wishlist **${p.name}**!`).join('\n') : '';

        const bal = userData.balance - pack.price;
        const embed = new EmbedBuilder()
            .setColor(packId === 'master' ? '#00CED1' : packId === 'ultra' ? '#9B59B6' : packId === 'premium' ? '#3498DB' : '#2ECC71')
            .setTitle(`🎴 ${pack.name} OPENED!`)
            .setDescription(
                `<@${userId}> membuka ${pack.name}! 💰 **-${pack.price.toLocaleString('id-ID')}**\n\n` +
                `${desc}${pingText}\n\n` +
                `> ✅ ${cards.length} kartu masuk koleksi!\n> 💰 Sisa: **${bal.toLocaleString('id-ID')}**`
            )
            .setImage('attachment://gacha.png')
            .setFooter({ text: 'Fan-made • Not affiliated with Nintendo/The Pokemon Company • pokemontcg.io' })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed], files: [att] });
    } catch (e) {
        console.error('[TCG] Gacha error:', e);
        db.prepare('UPDATE users SET balance=balance+? WHERE guildId=? AND userId=?').run(pack.price, guildId, userId);
        return interaction.editReply('❌ Error. Uang dikembalikan!');
    }
}

// Legacy /drop command → basic pack
async function handleDropCommand(interaction) {
    return handleGacha(interaction, 'basic', interaction.user.id);
}

// ==================== POKEMON COLLECTION (Paginated Gallery — 10 cards per page) ====================
async function handleCardsCommand(interaction, page = 0) {
    const target = interaction.options?.getUser?.('user') || interaction.user;
    const total = db.prepare('SELECT COUNT(*) as c FROM pokemon_cards WHERE userId=?').get(target.id).c;
    const unique = db.prepare('SELECT COUNT(DISTINCT cardApiId) as c FROM pokemon_cards WHERE userId=?').get(target.id).c;

    if (total === 0) return interaction.reply({ content: `📭 ${target.username} belum punya kartu Pokemon!`, ephemeral: true });

    const perPage = 10;
    const maxPage = Math.ceil(total / perPage) - 1;
    page = Math.max(0, Math.min(page, maxPage));
    const offset = page * perPage;

    await interaction.deferReply();

    const cards = db.prepare(`SELECT * FROM pokemon_cards WHERE userId=? ORDER BY
        CASE rarity WHEN 'Special Art Rare' THEN 0 WHEN 'Illustration Rare' THEN 1 WHEN 'Rare Secret' THEN 2
        WHEN 'Rare Rainbow' THEN 3 WHEN 'Rare Ultra' THEN 4 WHEN 'Rare Holo V' THEN 5
        WHEN 'Rare Holo GX' THEN 5 WHEN 'Rare Holo EX' THEN 5 WHEN 'Rare Holo' THEN 6 ELSE 9 END
        LIMIT ? OFFSET ?`).all(target.id, perPage, offset);

    const img = await require('./imageRenderer').generateGalleryImage(cards);
    const att = new AttachmentBuilder(img, { name: 'collection.png' });

    const list = cards.map(c => {
        const priceTag = c.marketPrice > 0 ? ` 💰$${c.marketPrice.toFixed(2)}` : '';
        return `${rdata(c.rarity).emoji} **${c.name}** — *${c.setName}*${priceTag} \`ID:${c.id}\``;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`📖 ${target.username}'s Pokemon Collection`)
        .setColor('#E74C3C')
        .setDescription(`> 🃏 **${total}** kartu | 🎴 **${unique}** unique\n\n${list}`)
        .setImage('attachment://collection.png')
        .setFooter({ text: `Page ${page+1}/${maxPage+1} • /cardview id:<num> untuk detail` });

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cardpage_prev_${target.id}_${page}`).setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`cardpage_info_${target.id}`).setLabel(`📖 ${page+1}/${maxPage+1}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`cardpage_next_${target.id}_${page}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= maxPage),
    );

    return interaction.editReply({ embeds: [embed], files: [att], components: [navRow] });
}

// ==================== POKEMON Pagination button handler ====================
async function handleCardPageButton(interaction) {
    const parts = interaction.customId.split('_');
    const action = parts[1]; // prev or next
    const targetId = parts[2];
    const currentPage = parseInt(parts[3]);
    const newPage = action === 'prev' ? currentPage - 1 : currentPage + 1;

    const total = db.prepare('SELECT COUNT(*) as c FROM pokemon_cards WHERE userId=?').get(targetId).c;
    const unique = db.prepare('SELECT COUNT(DISTINCT cardApiId) as c FROM pokemon_cards WHERE userId=?').get(targetId).c;
    const perPage = 10;
    const maxPage = Math.ceil(total / perPage) - 1;
    const page = Math.max(0, Math.min(newPage, maxPage));
    const offset = page * perPage;

    await interaction.deferUpdate();

    const cards = db.prepare(`SELECT * FROM pokemon_cards WHERE userId=? ORDER BY
        CASE rarity WHEN 'Special Art Rare' THEN 0 WHEN 'Illustration Rare' THEN 1 WHEN 'Rare Secret' THEN 2
        WHEN 'Rare Rainbow' THEN 3 WHEN 'Rare Ultra' THEN 4 WHEN 'Rare Holo V' THEN 5
        WHEN 'Rare Holo GX' THEN 5 WHEN 'Rare Holo EX' THEN 5 WHEN 'Rare Holo' THEN 6 ELSE 9 END
        LIMIT ? OFFSET ?`).all(targetId, perPage, offset);

    const img = await require('./imageRenderer').generateGalleryImage(cards);
    const att = new AttachmentBuilder(img, { name: 'collection.png' });
    const list = cards.map(c => {
        const priceTag = c.marketPrice > 0 ? ` 💰$${c.marketPrice.toFixed(2)}` : '';
        return `${rdata(c.rarity).emoji} **${c.name}** — *${c.setName}*${priceTag} \`ID:${c.id}\``;
    }).join('\n');
    const member = interaction.guild.members.cache.get(targetId);
    const uname = member?.user?.username || 'User';

    const embed = new EmbedBuilder()
        .setTitle(`📖 ${uname}'s Pokemon Collection`)
        .setColor('#E74C3C')
        .setDescription(`> 🃏 **${total}** kartu | 🎴 **${unique}** unique\n\n${list}`)
        .setImage('attachment://collection.png')
        .setFooter({ text: `Page ${page+1}/${maxPage+1} • /cardview id:<num> untuk detail` });

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cardpage_prev_${targetId}_${page}`).setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`cardpage_info_${targetId}`).setLabel(`📖 ${page+1}/${maxPage+1}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`cardpage_next_${targetId}_${page}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= maxPage),
    );

    return interaction.editReply({ embeds: [embed], files: [att], components: [navRow] });
}

// ==================== CARD VIEW ====================
async function handleCardViewCommand(interaction) {
    const id = interaction.options.getInteger('id');
    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id=?').get(id);
    if (!card) return interaction.reply({ content: '❌ Kartu tidak ditemukan!', ephemeral: true });

    // Lazy backfill: if card has no price, try cache first, then API
    let price = card.marketPrice || 0;
    let needsApiFetch = false;
    if (!price && card.cardApiId) {
        try {
            const cached = db.prepare('SELECT marketPrice FROM pokemon_card_cache WHERE cardApiId=?').get(card.cardApiId);
            if (cached?.marketPrice > 0) {
                price = cached.marketPrice;
            }
        } catch(_){}

        // Always allow single-card API fetch for price (even in CACHE_ONLY mode)
        if (!price) needsApiFetch = true;
    }

    // Defer if we need to fetch from API (takes time)
    if (needsApiFetch) {
        await interaction.deferReply();
        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API}/${encodeURIComponent(card.cardApiId)}`, { headers });
            if (res.ok) {
                const json = await res.json();
                const p = json.data;
                if (p?.tcgplayer?.prices) {
                    const priceVariants = p.tcgplayer.prices;
                    for (const variant of ['holofoil', 'reverseHolofoil', '1stEditionHolofoil', 'normal', '1stEditionNormal', 'unlimitedHolofoil']) {
                        if (priceVariants[variant]?.market) { price = priceVariants[variant].market; break; }
                    }
                    if (!price) {
                        for (const variant of Object.keys(priceVariants)) {
                            if (priceVariants[variant]?.market) { price = priceVariants[variant].market; break; }
                            if (!price && priceVariants[variant]?.mid) { price = priceVariants[variant].mid; }
                        }
                    }
                }
                if (!price && p?.cardmarket?.prices?.averageSellPrice) {
                    price = Math.round(p.cardmarket.prices.averageSellPrice * 1.1 * 100) / 100;
                }
            }
        } catch(_){}
    }

    // Save price back to both tables for future lookups
    if (price > 0 && !card.marketPrice) {
        try {
            db.prepare('UPDATE pokemon_cards SET marketPrice=? WHERE id=?').run(price, card.id);
            db.prepare('UPDATE pokemon_card_cache SET marketPrice=? WHERE cardApiId=?').run(price, card.cardApiId);
            // Also update all other copies of this card owned by anyone
            db.prepare('UPDATE pokemon_cards SET marketPrice=? WHERE cardApiId=? AND marketPrice=0').run(price, card.cardApiId);
        } catch(_){}
    }

    const r = rdata(card.rarity);
    const priceDisplay = price > 0 ? `\n💰 **Market Value: $${price.toFixed(2)}**` : '';
    const embed = new EmbedBuilder()
        .setColor(r.color)
        .setTitle(`${r.emoji} ${card.name}`)
        .setDescription(
            `**Set:** ${card.setName}\n**Rarity:** ${r.emoji} ${card.rarity}\n` +
            (card.types ? `**Type:** ${card.types}\n` : '') +
            (card.hp ? `**HP:** ${card.hp}\n` : '') +
            (card.artist ? `**Artist:** ${card.artist}\n` : '') +
            `**Owner:** <@${card.userId}>\n**Obtained:** <t:${Math.floor(card.obtainedAt/1000)}:R>` +
            priceDisplay
        )
        .setImage(card.imageUrl || null)
        .setFooter({ text: `ID: ${card.id} • ${card.cardApiId}` });

    if (needsApiFetch) {
        return interaction.editReply({ embeds: [embed] });
    }
    return interaction.reply({ embeds: [embed] });
}

// ==================== WISHLIST ====================
async function handleCardWishlist(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    if (sub === 'add') {
        const name = interaction.options.getString('karakter');
        const cnt = db.prepare('SELECT COUNT(*) as c FROM card_wishlist WHERE userId=?').get(userId).c;
        if (cnt >= 10) return interaction.reply({ content: '❌ Wishlist penuh (10)!', ephemeral: true });
        db.prepare('INSERT OR IGNORE INTO card_wishlist(userId,name) VALUES(?,?)').run(userId, name.toLowerCase());
        return interaction.reply({ content: `❤️ **${name}** ditambahkan!`, ephemeral: true });
    }
    if (sub === 'remove') {
        const name = interaction.options.getString('karakter');
        db.prepare('DELETE FROM card_wishlist WHERE userId=? AND name=?').run(userId, name.toLowerCase());
        return interaction.reply({ content: `🗑️ **${name}** dihapus.`, ephemeral: true });
    }
    if (sub === 'list') {
        const list = db.prepare('SELECT * FROM card_wishlist WHERE userId=?').all(userId);
        if (!list.length) return interaction.reply({ content: '📭 Wishlist kosong!', ephemeral: true });
        const embed = new EmbedBuilder().setTitle('❤️ Wishlist').setColor('#FF69B4')
            .setDescription(list.map((w,i) => `**${i+1}.** ❤️ ${w.name}`).join('\n') + '\n\n-# Kamu di-ping saat Pokemon ini muncul!')
            .setFooter({ text: `${list.length}/10` });
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

function checkWishlist(cards) {
    try { const all = db.prepare('SELECT * FROM card_wishlist').all(); const hits = [];
        for (const c of cards) { const low = c.name.toLowerCase(); for (const w of all) { if (low.includes(w.name)||w.name.includes(low)) hits.push({userId:w.userId,name:c.name}); }}
        return hits; } catch(_){ return []; }
}

// ==================== LEADERBOARD ====================
async function handleCardLeaderboard(interaction) {
    const type = interaction.options?.getString?.('tipe') || 'total';
    let title, rows, valueMode = false;
    if (type === 'rare') {
        title = '👑 Most Rare+ (Pokemon)';
        rows = db.prepare(`SELECT userId, COUNT(*) as cnt FROM pokemon_cards WHERE rarity IN ('Rare Ultra','Rare Rainbow','Rare Secret','Illustration Rare','Special Art Rare') GROUP BY userId ORDER BY cnt DESC LIMIT 10`).all();
    } else if (type === 'unique') {
        title = '🎴 Most Unique (Pokemon)';
        rows = db.prepare('SELECT userId, COUNT(DISTINCT cardApiId) as cnt FROM pokemon_cards GROUP BY userId ORDER BY cnt DESC LIMIT 10').all();
    } else if (type === 'value') {
        title = '💰 Most Valuable Collection';
        rows = db.prepare('SELECT userId, SUM(marketPrice) as cnt FROM pokemon_cards WHERE marketPrice > 0 GROUP BY userId ORDER BY cnt DESC LIMIT 10').all();
        valueMode = true;
    } else {
        // total: pokemon_cards only
        title = '🃏 Most Cards (Pokemon)';
        rows = db.prepare('SELECT userId, COUNT(*) as cnt FROM pokemon_cards GROUP BY userId ORDER BY cnt DESC LIMIT 10').all();
    }
    if (!rows?.length) return interaction.reply({ content: '📭 Belum ada data!', ephemeral: true });
    const m = ['🥇','🥈','🥉'];
    const embed = new EmbedBuilder().setTitle(`📊 ${title}`).setColor('#FFD700').setTimestamp()
        .setDescription(rows.map((r,i) => {
            const display = valueMode ? `$${Number(r.cnt).toFixed(2)}` : r.cnt.toLocaleString('id-ID');
            return `${m[i]||`**${i+1}.**`} <@${r.userId}> — **${display}**`;
        }).join('\n'));
    return interaction.reply({ embeds: [embed] });
}

// ==================== REMOVED FEATURES (no-op stubs) ====================
async function handleCardBurn(interaction) {
    return interaction.reply({ content: '❌ Fitur ini sudah dihapus.', ephemeral: true });
}

async function handleCardTrade(interaction) {
    return interaction.reply({ content: '❌ Fitur ini sudah dihapus.', ephemeral: true });
}

async function handleCardTradeButton(interaction) {
    return interaction.reply({ content: '❌ Fitur ini sudah dihapus.', ephemeral: true });
}

async function handleCardDye(interaction) {
    return interaction.reply({ content: '❌ Fitur ini sudah dihapus.', ephemeral: true });
}

async function handleCardAlbum(interaction) {
    return interaction.reply({ content: '❌ Fitur ini sudah dihapus.', ephemeral: true });
}

async function handleStardustCommand(interaction) {
    return interaction.reply({ content: '❌ Fitur ini sudah dihapus.', ephemeral: true });
}

// ==================== PANEL BUTTONS ====================
async function handleCardPanelButton(interaction) {
    const id = interaction.customId;

    // Pokemon Pagination buttons: cardpage_prev_userId_page or cardpage_next_userId_page
    if (id.startsWith('cardpage_')) {
        return handleCardPageButton(interaction);
    }

    const parts = id.split('_');
    // card_gacha_<packId>_<userId> OR card_<action>_<userId>
    const userId = parts[parts.length - 1];
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan panel kamu!', ephemeral: true });

    // Pokemon Gacha buttons: card_gacha_basic_123, card_gacha_premium_123, etc.
    if (parts[1] === 'gacha') {
        const packId = parts[2]; // basic, premium, ultra, master
        return handleGacha(interaction, packId, userId);
    }

    const action = parts[1];
    if (action === 'collection') return handleCardsCommand(interaction);
    if (action === 'leaderboard') return handleCardLeaderboard(interaction);
    if (action === 'drop') return handleGacha(interaction, 'basic', userId);
    if (action === 'back') return interaction.update(buildPanel(userId));
    if (action === 'wishlist') {
        const list = db.prepare('SELECT * FROM card_wishlist WHERE userId=?').all(userId);
        const desc = list.length ? list.map((w,i) => `**${i+1}.** ❤️ ${w.name}`).join('\n') : '*Kosong!*';
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❤️ Wishlist').setColor('#FF69B4').setDescription(desc+'\n\n-# /wishlist add/remove').setFooter({text:`${list.length}/10`})], ephemeral: true });
    }
    // Legacy handlers for old buttons still in chat
    if (action === 'album') return handleCardAlbum(interaction);
    if (action === 'stardust') return handleStardustCommand(interaction);
}

function isCardPanelButton(id) { return typeof id === 'string' && (id.startsWith('card_') || id.startsWith('cardpage_')) && !id.startsWith('cardgrab_') && !id.startsWith('cardtrade_'); }

// ==================== LEGACY ====================
async function handleCardGrab(interaction) { return interaction.reply({ content: '❌ Sistem baru: beli gacha → kartu langsung masuk!', ephemeral: true }); }
function isCardGrabButton(id) { return typeof id === 'string' && id.startsWith('cardgrab_') && !id.startsWith('cardgrab_expired') && !id.startsWith('cardgrab_claimed'); }
function isCardTradeButton(id) { return typeof id === 'string' && id.startsWith('cardtrade_'); }

// ==================== EXPORTS ====================
module.exports = {
    handleCardPanelCommand, handleCardPanelButton,
    handleDropCommand, handleCardGrab, handleCardPageButton,
    handleCardsCommand, handleCardViewCommand,
    handleCardBurn, handleCardTrade, handleCardTradeButton,
    handleCardWishlist, handleCardDye,
    handleCardAlbum, handleCardLeaderboard, handleStardustCommand,
    checkWishlistNotify: checkWishlist,
    isCardGrabButton, isCardTradeButton, isCardPanelButton,
    generateCardImage: generateGachaImage, generateDropImage: generateGachaImage,
    generateGalleryImage,
    fetchRandomCards: pullCards, RARITIES,
};
