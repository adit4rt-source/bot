// systems/cardGame.js — Pokemon TCG & One Piece TCG Card Gacha
// Buy packs → get real cards from pokemontcg.io / onepiece cache
// Fan-made • Not affiliated with Nintendo/The Pokemon Company/Bandai
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { db, getOrCreateUser, incrementUserStat } = require('../database');
const state = require('../state');

// ==================== POKEMON GACHA PACKS ====================
const PACKS = {
    basic:   { name: '🟢 Basic Pack',   price: 15000,   count: 3,  pool: ['Common','Uncommon','Rare'], cooldown: 5 * 60 * 1000 },
    premium: { name: '🔵 Premium Pack',  price: 75000,   count: 3,  pool: ['Rare','Rare Holo','Rare Holo EX','Rare Holo GX','Rare Holo V'], cooldown: 15 * 60 * 1000 },
    ultra:   { name: '🟣 Ultra Pack',    price: 200000,  count: 3,  pool: ['Rare Holo','Rare Ultra','Rare Rainbow','Rare Secret'], cooldown: 30 * 60 * 1000 },
    master:  { name: '💎 Master Pack',   price: 750000,  count: 10, pool: ['Rare','Rare Holo','Rare Holo EX','Rare Holo GX','Rare Holo V','Rare Ultra','Rare Rainbow','Rare Secret','Illustration Rare'], guaranteed: 'Rare Ultra', cooldown: 60 * 60 * 1000 },
};

// ==================== ONE PIECE GACHA PACKS ====================
const OP_PACKS = {
    basic:   { name: '🟢 Basic Pack',  price: 15000,  count: 3,  pool: ['C','UC','R'], cooldown: 5*60*1000 },
    premium: { name: '🔵 Premium Pack', price: 75000,  count: 3,  pool: ['R','SR','P'], cooldown: 15*60*1000 },
    ultra:   { name: '🟣 Ultra Pack',   price: 200000, count: 3,  pool: ['SR','SEC','SP CARD'], cooldown: 30*60*1000 },
    master:  { name: '💎 Master Pack',  price: 750000, count: 10, pool: ['R','SR','SEC','SP CARD','L'], guaranteed: 'SEC', cooldown: 60*60*1000 },
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
    dye TEXT DEFAULT ''
)`);

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
    imageUrl TEXT, types TEXT DEFAULT '', hp TEXT DEFAULT '', artist TEXT DEFAULT '', cachedAt INTEGER
)`);

// Stats table for tracking total spent
db.exec(`CREATE TABLE IF NOT EXISTS card_stats (userId TEXT PRIMARY KEY, totalSpent INTEGER DEFAULT 0)`);

// ==================== ONE PIECE DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS onepiece_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    cardId TEXT NOT NULL,
    name TEXT NOT NULL,
    rarity TEXT DEFAULT 'C',
    cardType TEXT DEFAULT 'CHARACTER',
    imageUrl TEXT DEFAULT '',
    color TEXT DEFAULT '',
    power TEXT DEFAULT '',
    cost TEXT DEFAULT '',
    cardSet TEXT DEFAULT '',
    obtainedAt INTEGER DEFAULT 0,
    locked INTEGER DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS onepiece_card_cache (
    cardId TEXT PRIMARY KEY, name TEXT NOT NULL, rarity TEXT DEFAULT 'C',
    cardType TEXT DEFAULT 'CHARACTER', imageUrl TEXT DEFAULT '',
    color TEXT DEFAULT '', power TEXT DEFAULT '', cost TEXT DEFAULT '',
    attribute TEXT DEFAULT '', cardSet TEXT DEFAULT '', effect TEXT DEFAULT '', cachedAt INTEGER
)`);

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

// ==================== ONE PIECE RARITY ====================
const OP_RARITIES = {
    'C':        { emoji: '⚪', color: '#AAAAAA', tier: 0, name: 'Common' },
    'UC':       { emoji: '🟢', color: '#2ECC71', tier: 1, name: 'Uncommon' },
    'R':        { emoji: '🔵', color: '#3498DB', tier: 2, name: 'Rare' },
    'SR':       { emoji: '🟣', color: '#9B59B6', tier: 3, name: 'Super Rare' },
    'SEC':      { emoji: '👑', color: '#FFD700', tier: 4, name: 'Secret Rare' },
    'L':        { emoji: '🔴', color: '#E74C3C', tier: 5, name: 'Leader' },
    'SP CARD':  { emoji: '💎', color: '#00CED1', tier: 4, name: 'Special' },
    'P':        { emoji: '🟡', color: '#F39C12', tier: 3, name: 'Promo' },
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

function opRdata(rarity) {
    return OP_RARITIES[rarity] || OP_RARITIES['C'];
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

async function apiFetch(rarity) {
    const q = encodeURIComponent(`rarity:"${rarity}"`);
    const pg = Math.floor(Math.random() * (MAX_PG[rarity] || 10)) + 1;
    try {
        const headers = getApiHeaders();
        let res = await fetch(`${API}?q=${q}&pageSize=20&page=${pg}`, { headers });
        if (!res.ok) res = await fetch(`${API}?q=${q}&pageSize=20&page=1`, { headers });
        if (!res.ok) return null;
        const json = await res.json();
        const cards = json.data || [];
        if (!cards.length) return null;
        const p = cards[Math.floor(Math.random() * cards.length)];
        if (!p.id || !p.name) return null;
        return { cardApiId: p.id, name: p.name, setName: p.set?.name || 'Unknown', rarity: p.rarity || rarity,
            imageUrl: p.images?.large || p.images?.small || '', types: (p.types||[]).join('/'), hp: p.hp||'', artist: p.artist||'' };
    } catch (e) { console.error('[TCG] API:', e.message); return null; }
}

function cache(c) {
    try { db.prepare(`INSERT OR REPLACE INTO pokemon_card_cache (cardApiId,name,setName,rarity,imageUrl,types,hp,artist,cachedAt) VALUES(?,?,?,?,?,?,?,?,?)`).run(
        c.cardApiId,c.name,c.setName,c.rarity,c.imageUrl,c.types,c.hp,c.artist,Date.now()); } catch(_){}
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
    // If cache has 1000+ cards, prefer cache heavily (90%). If CACHE_ONLY, use 100% cache.
    const cacheChance = CACHE_ONLY ? 1.0 : (cacheSize >= 1000 ? 0.9 : 0.5);

    for (let i = 0; i < count; i++) {
        const rarity = pool[Math.floor(Math.random() * pool.length)];
        let card = null;

        // Try cache first
        if (Math.random() < cacheChance || CACHE_ONLY) {
            const c = fromCache(rarity, ownedIds);
            if (c?.cardApiId && c?.name) card = { cardApiId:c.cardApiId, name:c.name, setName:c.setName||'', rarity:c.rarity||rarity, imageUrl:c.imageUrl||'', types:c.types||'', hp:c.hp||'', artist:c.artist||'' };
            // If cache miss on specific rarity, try any rarity from pool
            if (!card && CACHE_ONLY) {
                for (const fallbackRarity of pool) {
                    const fc = fromCache(fallbackRarity, ownedIds);
                    if (fc?.cardApiId && fc?.name) { card = { cardApiId:fc.cardApiId, name:fc.name, setName:fc.setName||'', rarity:fc.rarity||fallbackRarity, imageUrl:fc.imageUrl||'', types:fc.types||'', hp:fc.hp||'', artist:fc.artist||'' }; break; }
                }
            }
        }

        // API fetch if no cache hit (and not CACHE_ONLY)
        if (!card && !CACHE_ONLY) {
            card = await apiFetch(rarity);
            if (!card?.cardApiId) card = await apiFetch('Common');
        }

        // Final fallback: any cache
        if (!card?.cardApiId) {
            const c = fromCache('Common', ownedIds) || fromCache(rarity, new Set());
            if (c?.cardApiId) card = { cardApiId:c.cardApiId, name:c.name, setName:c.setName||'', rarity:c.rarity||'Common', imageUrl:c.imageUrl||'', types:c.types||'', hp:c.hp||'', artist:c.artist||'' };
        }

        if (card?.cardApiId && card?.name) { cache(card); results.push(card); }
    }
    return results;
}

// ==================== ONE PIECE PULL (100% from cache) ====================
function pullOnePieceCards(pool, count, userId) {
    const results = [];
    const ownedIds = new Set();
    try { db.prepare('SELECT DISTINCT cardId FROM onepiece_cards WHERE userId=?').all(userId).forEach(r => ownedIds.add(r.cardId)); } catch(_){}
    
    for (let i = 0; i < count; i++) {
        const rarity = pool[Math.floor(Math.random() * pool.length)];
        let row = db.prepare('SELECT * FROM onepiece_card_cache WHERE rarity=? ORDER BY RANDOM() LIMIT 10').all(rarity);
        // Try to avoid dupes
        let pick = row.find(r => !ownedIds.has(r.cardId)) || row[0];
        if (!pick) { // fallback to any rarity in pool
            for (const fr of pool) {
                const fb = db.prepare('SELECT * FROM onepiece_card_cache WHERE rarity=? ORDER BY RANDOM() LIMIT 1').get(fr);
                if (fb) { pick = fb; break; }
            }
        }
        if (pick) results.push(pick);
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
        const rarityColor = cards[i]._opRarity ? opRdata(cards[i].rarity).color : rdata(cards[i].rarity).color;
        ctx.strokeStyle = rarityColor; ctx.lineWidth = 2.5; ctx.strokeRect(x, y, cw, ch);
    }
    return canvas.toBuffer('image/png');
}

// Gallery image for collection (5 per row, up to 10 cards)
async function generateGalleryImage(cards) {
    const cols = Math.min(cards.length, 5);
    const rows = Math.ceil(cards.length / 5);
    const cw = 160, ch = 224, gap = 6, pad = 8;
    const w = cols * cw + (cols-1) * gap + pad * 2;
    const h = rows * ch + (rows-1) * gap + pad * 2;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#121225';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < cards.length; i++) {
        const col = i % 5, row = Math.floor(i / 5);
        const x = pad + col * (cw + gap), y = pad + row * (ch + gap);
        try {
            if (cards[i].imageUrl) { const img = await loadImageWithTimeout(cards[i].imageUrl); ctx.drawImage(img, x, y, cw, ch); }
            else throw new Error('no url');
        } catch (_) {
            ctx.fillStyle = '#1e1e3a'; ctx.fillRect(x, y, cw, ch);
            ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(cards[i].name, x+cw/2, y+ch/2);
        }
        const rarityColor = cards[i]._opRarity ? opRdata(cards[i].rarity).color : rdata(cards[i].rarity).color;
        ctx.strokeStyle = rarityColor; ctx.lineWidth = 2; ctx.strokeRect(x, y, cw, ch);
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

// ==================== CATEGORY SELECTOR PANEL ====================
function buildCategoryPanel(userId) {
    const embed = new EmbedBuilder()
        .setTitle('🃏 CARD GACHA')
        .setColor('#E74C3C')
        .setDescription(
            `Pilih kategori:\n` +
            `> 🎴 **Pokemon TCG** — 20,000+ kartu dari semua generasi\n` +
            `> 🏴‍☠️ **One Piece TCG** — 2,400+ kartu dari OP-01 sampai OP-13`
        )
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`card_cat_pokemon_${userId}`).setLabel('🎴 Pokemon TCG').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`card_cat_onepiece_${userId}`).setLabel('🏴‍☠️ One Piece TCG').setStyle(ButtonStyle.Danger),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`card_collection_${userId}`).setLabel('📖 Collection').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`card_leaderboard_${userId}`).setLabel('📊 Leaderboard').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row1, row2] };
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
        new ButtonBuilder().setCustomId(`card_back_${userId}`).setLabel('⬅️ Kembali').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row1, row2] };
}

// ==================== ONE PIECE PANEL ====================
function buildOnePiecePanel(userId) {
    let total = 0, unique = 0;
    try { total = db.prepare('SELECT COUNT(*) as c FROM onepiece_cards WHERE userId=?').get(userId).c; } catch(_){}
    try { unique = db.prepare('SELECT COUNT(DISTINCT cardId) as c FROM onepiece_cards WHERE userId=?').get(userId).c; } catch(_){}
    const totalSpent = getTotalSpent(userId);

    let topDesc = '> *Belum ada kartu!*';
    try {
        const top = db.prepare(`SELECT * FROM onepiece_cards WHERE userId=? ORDER BY
            CASE rarity WHEN 'L' THEN 0 WHEN 'SEC' THEN 1 WHEN 'SP CARD' THEN 2
            WHEN 'SR' THEN 3 WHEN 'P' THEN 4 WHEN 'R' THEN 5 ELSE 9 END LIMIT 3`).all(userId);
        if (top.length > 0) {
            topDesc = top.map(c => `> ${opRdata(c.rarity).emoji} **${c.name}** — *${c.cardSet}* [${opRdata(c.rarity).name}]`).join('\n');
        }
    } catch(_){}

    const embed = new EmbedBuilder()
        .setTitle('🏴‍☠️ ONE PIECE TCG CARD PANEL')
        .setColor('#DC143C')
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
            `> 📖 **Collection** — Gallery kartu One Piece milikmu\n` +
            `> 📊 **Leaderboard** — Top collectors`
        )
        .setFooter({ text: 'Fan-made • Not affiliated with Bandai/Toei Animation' })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`card_op_gacha_basic_${userId}`).setLabel('🟢 Basic (💰15k)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`card_op_gacha_premium_${userId}`).setLabel('🔵 Premium (💰75k)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`card_op_gacha_ultra_${userId}`).setLabel('🟣 Ultra (💰200k)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`card_op_gacha_master_${userId}`).setLabel('💎 Master (💰750k)').setStyle(ButtonStyle.Danger),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`card_op_collection_${userId}`).setLabel('📖 Collection').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`card_leaderboard_${userId}`).setLabel('📊 Leaderboard').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`card_back_${userId}`).setLabel('⬅️ Kembali').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row1, row2] };
}

// ==================== /card COMMAND (Category Selector) ====================
async function handleCardPanelCommand(interaction) {
    return interaction.reply(buildCategoryPanel(interaction.user.id));
}

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
            db.prepare(`INSERT INTO pokemon_cards (userId,cardApiId,name,setName,rarity,imageUrl,types,hp,artist,obtainedAt) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
                userId, c.cardApiId, c.name, c.setName, c.rarity, c.imageUrl, c.types, c.hp, c.artist, Date.now());
        }
        incrementUserStat(guildId, userId, 'cards_grabbed');

        const img = await generateGachaImage(cards);
        const att = new AttachmentBuilder(img, { name: 'gacha.png' });

        const desc = cards.map((c, i) => {
            const r = rdata(c.rarity);
            const isDupe = ownedIds.has(c.cardApiId);
            const dupeTag = isDupe ? ' 🔄 **DUPE**' : '';
            return `**${i+1}.** ${r.emoji} **${c.name}** — *${c.setName}* [${c.rarity}]${dupeTag}`;
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

// ==================== ONE PIECE GACHA ====================
async function handleOnePieceGacha(interaction, packId, userId) {
    const guildId = interaction.guild.id;
    const pack = OP_PACKS[packId];
    if (!pack) return interaction.reply({ content: '❌ Pack tidak valid!', ephemeral: true });

    // Cooldown check
    const cdMins = checkPackCooldown(packId, userId, 'oppack');
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
        let cards = pullOnePieceCards(pack.pool, pack.count, userId);

        // Master pack: guarantee at least 1 SEC+
        if (pack.guaranteed && cards.length > 0) {
            const hasSec = cards.some(c => (opRdata(c.rarity).tier || 0) >= 4);
            if (!hasSec) {
                const secRow = db.prepare('SELECT * FROM onepiece_card_cache WHERE rarity=? ORDER BY RANDOM() LIMIT 1').get(pack.guaranteed);
                if (secRow) cards[0] = secRow;
            }
        }

        if (!cards || cards.length === 0) {
            db.prepare('UPDATE users SET balance=balance+? WHERE guildId=? AND userId=?').run(pack.price, guildId, userId);
            return interaction.editReply('❌ Gagal fetch kartu (cache kosong?). Uang dikembalikan!');
        }

        // Set cooldown after successful purchase
        setPackCooldown(packId, userId, pack.cooldown, 'oppack');

        // Track total spent
        addTotalSpent(userId, pack.price);

        // Get owned IDs for dupe detection
        const ownedIds = new Set();
        try { db.prepare('SELECT DISTINCT cardId FROM onepiece_cards WHERE userId=?').all(userId).forEach(r => ownedIds.add(r.cardId)); } catch(_){}

        // Save all to collection
        for (const c of cards) {
            db.prepare(`INSERT INTO onepiece_cards (userId,cardId,name,rarity,cardType,imageUrl,color,power,cost,cardSet,obtainedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
                userId, c.cardId, c.name, c.rarity, c.cardType||'CHARACTER', c.imageUrl||'', c.color||'', c.power||'', c.cost||'', c.cardSet||'', Date.now());
        }
        incrementUserStat(guildId, userId, 'cards_grabbed');

        // Generate image — mark cards as OP for rarity color
        const imgCards = cards.map(c => ({ ...c, _opRarity: true }));
        const img = await generateGachaImage(imgCards);
        const att = new AttachmentBuilder(img, { name: 'gacha_op.png' });

        const desc = cards.map((c, i) => {
            const r = opRdata(c.rarity);
            const isDupe = ownedIds.has(c.cardId);
            const dupeTag = isDupe ? ' 🔄 **DUPE**' : '';
            return `**${i+1}.** ${r.emoji} **${c.name}** — *${c.cardSet||'OP'}* [${r.name}]${dupeTag}`;
        }).join('\n');

        const bal = userData.balance - pack.price;
        const embed = new EmbedBuilder()
            .setColor(packId === 'master' ? '#00CED1' : packId === 'ultra' ? '#9B59B6' : packId === 'premium' ? '#3498DB' : '#2ECC71')
            .setTitle(`🏴‍☠️ ${pack.name} OPENED!`)
            .setDescription(
                `<@${userId}> membuka One Piece ${pack.name}! 💰 **-${pack.price.toLocaleString('id-ID')}**\n\n` +
                `${desc}\n\n` +
                `> ✅ ${cards.length} kartu masuk koleksi!\n> 💰 Sisa: **${bal.toLocaleString('id-ID')}**`
            )
            .setImage('attachment://gacha_op.png')
            .setFooter({ text: 'Fan-made • Not affiliated with Bandai/Toei Animation' })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed], files: [att] });
    } catch (e) {
        console.error('[OP TCG] Gacha error:', e);
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

    const img = await generateGalleryImage(cards);
    const att = new AttachmentBuilder(img, { name: 'collection.png' });

    const list = cards.map(c => `${rdata(c.rarity).emoji} **${c.name}** — *${c.setName}* \`ID:${c.id}\``).join('\n');

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

// ==================== ONE PIECE COLLECTION (Paginated Gallery) ====================
async function handleOpCardsCommand(interaction, page = 0) {
    const target = interaction.user;
    let total = 0, unique = 0;
    try { total = db.prepare('SELECT COUNT(*) as c FROM onepiece_cards WHERE userId=?').get(target.id).c; } catch(_){}
    try { unique = db.prepare('SELECT COUNT(DISTINCT cardId) as c FROM onepiece_cards WHERE userId=?').get(target.id).c; } catch(_){}

    if (total === 0) return interaction.reply({ content: `📭 ${target.username} belum punya kartu One Piece!`, ephemeral: true });

    const perPage = 10;
    const maxPage = Math.ceil(total / perPage) - 1;
    page = Math.max(0, Math.min(page, maxPage));
    const offset = page * perPage;

    await interaction.deferReply();

    const cards = db.prepare(`SELECT * FROM onepiece_cards WHERE userId=? ORDER BY
        CASE rarity WHEN 'L' THEN 0 WHEN 'SEC' THEN 1 WHEN 'SP CARD' THEN 2
        WHEN 'SR' THEN 3 WHEN 'P' THEN 4 WHEN 'R' THEN 5 ELSE 9 END
        LIMIT ? OFFSET ?`).all(target.id, perPage, offset);

    // Mark as OP for rarity color
    const imgCards = cards.map(c => ({ ...c, _opRarity: true }));
    const img = await generateGalleryImage(imgCards);
    const att = new AttachmentBuilder(img, { name: 'op_collection.png' });

    const list = cards.map(c => `${opRdata(c.rarity).emoji} **${c.name}** — *${c.cardSet||'OP'}* [${opRdata(c.rarity).name}] \`ID:${c.id}\``).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`🏴‍☠️ ${target.username}'s One Piece Collection`)
        .setColor('#DC143C')
        .setDescription(`> 🃏 **${total}** kartu | 🎴 **${unique}** unique\n\n${list}`)
        .setImage('attachment://op_collection.png')
        .setFooter({ text: `Page ${page+1}/${maxPage+1}` });

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`opcardpage_prev_${target.id}_${page}`).setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`opcardpage_info_${target.id}`).setLabel(`📖 ${page+1}/${maxPage+1}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`opcardpage_next_${target.id}_${page}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= maxPage),
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

    const img = await generateGalleryImage(cards);
    const att = new AttachmentBuilder(img, { name: 'collection.png' });
    const list = cards.map(c => `${rdata(c.rarity).emoji} **${c.name}** — *${c.setName}* \`ID:${c.id}\``).join('\n');
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

// ==================== ONE PIECE Pagination button handler ====================
async function handleOpCardPageButton(interaction) {
    const parts = interaction.customId.split('_');
    // opcardpage_prev_userId_page or opcardpage_next_userId_page
    const action = parts[1]; // prev or next
    const targetId = parts[2];
    const currentPage = parseInt(parts[3]);
    const newPage = action === 'prev' ? currentPage - 1 : currentPage + 1;

    let total = 0, unique = 0;
    try { total = db.prepare('SELECT COUNT(*) as c FROM onepiece_cards WHERE userId=?').get(targetId).c; } catch(_){}
    try { unique = db.prepare('SELECT COUNT(DISTINCT cardId) as c FROM onepiece_cards WHERE userId=?').get(targetId).c; } catch(_){}

    const perPage = 10;
    const maxPage = Math.ceil(total / perPage) - 1;
    const page = Math.max(0, Math.min(newPage, maxPage));
    const offset = page * perPage;

    await interaction.deferUpdate();

    const cards = db.prepare(`SELECT * FROM onepiece_cards WHERE userId=? ORDER BY
        CASE rarity WHEN 'L' THEN 0 WHEN 'SEC' THEN 1 WHEN 'SP CARD' THEN 2
        WHEN 'SR' THEN 3 WHEN 'P' THEN 4 WHEN 'R' THEN 5 ELSE 9 END
        LIMIT ? OFFSET ?`).all(targetId, perPage, offset);

    const imgCards = cards.map(c => ({ ...c, _opRarity: true }));
    const img = await generateGalleryImage(imgCards);
    const att = new AttachmentBuilder(img, { name: 'op_collection.png' });
    const list = cards.map(c => `${opRdata(c.rarity).emoji} **${c.name}** — *${c.cardSet||'OP'}* [${opRdata(c.rarity).name}] \`ID:${c.id}\``).join('\n');
    const member = interaction.guild.members.cache.get(targetId);
    const uname = member?.user?.username || 'User';

    const embed = new EmbedBuilder()
        .setTitle(`🏴‍☠️ ${uname}'s One Piece Collection`)
        .setColor('#DC143C')
        .setDescription(`> 🃏 **${total}** kartu | 🎴 **${unique}** unique\n\n${list}`)
        .setImage('attachment://op_collection.png')
        .setFooter({ text: `Page ${page+1}/${maxPage+1}` });

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`opcardpage_prev_${targetId}_${page}`).setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`opcardpage_info_${targetId}`).setLabel(`📖 ${page+1}/${maxPage+1}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`opcardpage_next_${targetId}_${page}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= maxPage),
    );

    return interaction.editReply({ embeds: [embed], files: [att], components: [navRow] });
}

// ==================== CARD VIEW ====================
async function handleCardViewCommand(interaction) {
    const id = interaction.options.getInteger('id');
    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id=?').get(id);
    if (!card) return interaction.reply({ content: '❌ Kartu tidak ditemukan!', ephemeral: true });

    const r = rdata(card.rarity);
    const embed = new EmbedBuilder()
        .setColor(r.color)
        .setTitle(`${r.emoji} ${card.name}`)
        .setDescription(
            `**Set:** ${card.setName}\n**Rarity:** ${r.emoji} ${card.rarity}\n` +
            (card.types ? `**Type:** ${card.types}\n` : '') +
            (card.hp ? `**HP:** ${card.hp}\n` : '') +
            (card.artist ? `**Artist:** ${card.artist}\n` : '') +
            `**Owner:** <@${card.userId}>\n**Obtained:** <t:${Math.floor(card.obtainedAt/1000)}:R>`
        )
        .setImage(card.imageUrl || null)
        .setFooter({ text: `ID: ${card.id} • ${card.cardApiId}` });
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
    let title, rows;
    if (type === 'rare') {
        title = '👑 Most Rare+ (Pokemon)';
        rows = db.prepare(`SELECT userId, COUNT(*) as cnt FROM pokemon_cards WHERE rarity IN ('Rare Ultra','Rare Rainbow','Rare Secret','Illustration Rare','Special Art Rare') GROUP BY userId ORDER BY cnt DESC LIMIT 10`).all();
    } else if (type === 'unique') {
        title = '🎴 Most Unique (Pokemon)';
        rows = db.prepare('SELECT userId, COUNT(DISTINCT cardApiId) as cnt FROM pokemon_cards GROUP BY userId ORDER BY cnt DESC LIMIT 10').all();
    } else if (type === 'pokemon') {
        title = '🎴 Pokemon Cards';
        rows = db.prepare('SELECT userId, COUNT(*) as cnt FROM pokemon_cards GROUP BY userId ORDER BY cnt DESC LIMIT 10').all();
    } else if (type === 'onepiece') {
        title = '🏴‍☠️ One Piece Cards';
        rows = db.prepare('SELECT userId, COUNT(*) as cnt FROM onepiece_cards GROUP BY userId ORDER BY cnt DESC LIMIT 10').all();
    } else {
        // total: combine both tables
        title = '🃏 Most Cards (Combined)';
        rows = db.prepare(`
            SELECT userId, SUM(cnt) as cnt FROM (
                SELECT userId, COUNT(*) as cnt FROM pokemon_cards GROUP BY userId
                UNION ALL
                SELECT userId, COUNT(*) as cnt FROM onepiece_cards GROUP BY userId
            ) GROUP BY userId ORDER BY cnt DESC LIMIT 10
        `).all();
    }
    if (!rows?.length) return interaction.reply({ content: '📭 Belum ada data!', ephemeral: true });
    const m = ['🥇','🥈','🥉'];
    const embed = new EmbedBuilder().setTitle(`📊 ${title}`).setColor('#FFD700').setTimestamp()
        .setDescription(rows.map((r,i) => `${m[i]||`**${i+1}.**`} <@${r.userId}> — **${r.cnt.toLocaleString('id-ID')}**`).join('\n'));
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

    // One Piece Pagination buttons: opcardpage_prev_userId_page or opcardpage_next_userId_page
    if (id.startsWith('opcardpage_')) {
        return handleOpCardPageButton(interaction);
    }

    // Pokemon Pagination buttons: cardpage_prev_userId_page or cardpage_next_userId_page
    if (id.startsWith('cardpage_')) {
        return handleCardPageButton(interaction);
    }

    const parts = id.split('_');
    // card_gacha_<packId>_<userId> OR card_<action>_<userId> OR card_op_gacha_<packId>_<userId> OR card_cat_<type>_<userId>
    const userId = parts[parts.length - 1];
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan panel kamu!', ephemeral: true });

    // Category selector buttons: card_cat_pokemon_userId or card_cat_onepiece_userId
    if (parts[1] === 'cat') {
        const catType = parts[2]; // pokemon or onepiece
        if (catType === 'pokemon') return interaction.update(buildPanel(userId));
        if (catType === 'onepiece') return interaction.update(buildOnePiecePanel(userId));
    }

    // One Piece gacha buttons: card_op_gacha_basic_userId, card_op_gacha_premium_userId, etc.
    if (parts[1] === 'op' && parts[2] === 'gacha') {
        const packId = parts[3]; // basic, premium, ultra, master
        return handleOnePieceGacha(interaction, packId, userId);
    }

    // One Piece collection button: card_op_collection_userId
    if (parts[1] === 'op' && parts[2] === 'collection') {
        return handleOpCardsCommand(interaction);
    }

    // Pokemon Gacha buttons: card_gacha_basic_123, card_gacha_premium_123, etc.
    if (parts[1] === 'gacha') {
        const packId = parts[2]; // basic, premium, ultra, master
        return handleGacha(interaction, packId, userId);
    }

    const action = parts[1];
    if (action === 'collection') return handleCardsCommand(interaction);
    if (action === 'leaderboard') return handleCardLeaderboard(interaction);
    if (action === 'drop') return handleGacha(interaction, 'basic', userId);
    if (action === 'back') return interaction.update(buildCategoryPanel(userId));
    if (action === 'wishlist') {
        const list = db.prepare('SELECT * FROM card_wishlist WHERE userId=?').all(userId);
        const desc = list.length ? list.map((w,i) => `**${i+1}.** ❤️ ${w.name}`).join('\n') : '*Kosong!*';
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❤️ Wishlist').setColor('#FF69B4').setDescription(desc+'\n\n-# /wishlist add/remove').setFooter({text:`${list.length}/10`})], ephemeral: true });
    }
    // Legacy handlers for old buttons still in chat
    if (action === 'album') return handleCardAlbum(interaction);
    if (action === 'stardust') return handleStardustCommand(interaction);
}

function isCardPanelButton(id) { return typeof id === 'string' && (id.startsWith('card_') || id.startsWith('cardpage_') || id.startsWith('opcardpage_')) && !id.startsWith('cardgrab_') && !id.startsWith('cardtrade_'); }

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
    handleOnePieceGacha, handleOpCardsCommand, handleOpCardPageButton,
    checkWishlistNotify: checkWishlist,
    isCardGrabButton, isCardTradeButton, isCardPanelButton,
    generateCardImage: generateGachaImage, generateDropImage: generateGachaImage,
    fetchRandomCards: pullCards, RARITIES, OP_RARITIES, OP_PACKS,
};
