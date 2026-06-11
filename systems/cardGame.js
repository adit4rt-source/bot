// systems/cardGame.js — Pokemon TCG Card Gacha
// Buy packs → get real Pokemon cards from pokemontcg.io
// Fan-made • Not affiliated with Nintendo/The Pokemon Company
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { db, getOrCreateUser, incrementUserStat } = require('../database');
const state = require('../state');

// ==================== GACHA PACKS ====================
const PACKS = {
    basic:   { name: '🟢 Basic Pack',   price: 15000,   count: 3,  pool: ['Common','Uncommon','Rare'] },
    premium: { name: '🔵 Premium Pack',  price: 75000,   count: 3,  pool: ['Rare','Rare Holo','Rare Holo EX','Rare Holo GX','Rare Holo V'] },
    ultra:   { name: '🟣 Ultra Pack',    price: 200000,  count: 3,  pool: ['Rare Holo','Rare Ultra','Rare Rainbow','Rare Secret'] },
    master:  { name: '💎 Master Pack',   price: 750000,  count: 10, pool: ['Rare','Rare Holo','Rare Holo EX','Rare Holo GX','Rare Holo V','Rare Ultra','Rare Rainbow','Rare Secret','Illustration Rare'], guaranteed: 'Rare Ultra' },
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

// ==================== RARITY ====================
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

// ==================== API ====================
const API = 'https://api.pokemontcg.io/v2/cards';
const MAX_PG = { 'Common':80,'Uncommon':60,'Rare':50,'Rare Holo':30,'Rare Holo EX':10,'Rare Holo GX':10,'Rare Holo V':15,'Rare Ultra':8,'Rare Rainbow':5,'Rare Secret':4,'Illustration Rare':3,'Special Art Rare':2 };

async function apiFetch(rarity) {
    const q = encodeURIComponent(`rarity:"${rarity}"`);
    const pg = Math.floor(Math.random() * (MAX_PG[rarity] || 10)) + 1;
    try {
        let res = await fetch(`${API}?q=${q}&pageSize=20&page=${pg}`, { headers: { Accept: 'application/json' } });
        if (!res.ok) res = await fetch(`${API}?q=${q}&pageSize=20&page=1`, { headers: { Accept: 'application/json' } });
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
function fromCache(rarity) {
    try { return db.prepare('SELECT * FROM pokemon_card_cache WHERE rarity=? ORDER BY RANDOM() LIMIT 1').get(rarity); } catch(_){ return null; }
}

async function pullCards(pool, count) {
    const results = [];
    for (let i = 0; i < count; i++) {
        const rarity = pool[Math.floor(Math.random() * pool.length)];
        let card = null;
        // Try cache 30%
        if (Math.random() < 0.3) {
            const c = fromCache(rarity);
            if (c?.cardApiId && c?.name) card = { cardApiId:c.cardApiId, name:c.name, setName:c.setName||'', rarity:c.rarity||rarity, imageUrl:c.imageUrl||'', types:c.types||'', hp:c.hp||'', artist:c.artist||'' };
        }
        if (!card) card = await apiFetch(rarity);
        if (!card?.cardApiId) card = await apiFetch('Common');
        if (!card?.cardApiId) { const c = fromCache('Common'); if (c?.cardApiId) card = { cardApiId:c.cardApiId, name:c.name, setName:c.setName||'', rarity:c.rarity||'Common', imageUrl:c.imageUrl||'', types:c.types||'', hp:c.hp||'', artist:c.artist||'' }; }
        if (card?.cardApiId && card?.name) { cache(card); results.push(card); }
    }
    return results;
}

// ==================== IMAGE ====================
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
            if (cards[i].imageUrl) { const img = await loadImage(cards[i].imageUrl); ctx.drawImage(img, x, y, cw, ch); }
            else throw 0;
        } catch (_) {
            ctx.fillStyle = '#1e1e3a'; ctx.fillRect(x, y, cw, ch);
            ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(cards[i].name, x+cw/2, y+ch/2);
        }
        ctx.strokeStyle = rdata(cards[i].rarity).color; ctx.lineWidth = 2.5; ctx.strokeRect(x, y, cw, ch);
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
            if (cards[i].imageUrl) { const img = await loadImage(cards[i].imageUrl); ctx.drawImage(img, x, y, cw, ch); }
            else throw 0;
        } catch (_) {
            ctx.fillStyle = '#1e1e3a'; ctx.fillRect(x, y, cw, ch);
            ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(cards[i].name, x+cw/2, y+ch/2);
        }
        ctx.strokeStyle = rdata(cards[i].rarity).color; ctx.lineWidth = 2; ctx.strokeRect(x, y, cw, ch);
    }
    return canvas.toBuffer('image/png');
}

// ==================== STARDUST ====================
function getStardust(uid) { const r = db.prepare('SELECT amount FROM card_stardust WHERE userId=?').get(uid); return r ? r.amount : 0; }
function addStardust(uid, n) { db.prepare('INSERT OR IGNORE INTO card_stardust(userId,amount) VALUES(?,0)').run(uid); db.prepare('UPDATE card_stardust SET amount=amount+? WHERE userId=?').run(n,uid); }

// ==================== PANEL ====================
function buildPanel(userId) {
    const total = db.prepare('SELECT COUNT(*) as c FROM pokemon_cards WHERE userId=?').get(userId).c;
    const unique = db.prepare('SELECT COUNT(DISTINCT cardApiId) as c FROM pokemon_cards WHERE userId=?').get(userId).c;

    const top = db.prepare(`SELECT * FROM pokemon_cards WHERE userId=? ORDER BY
        CASE rarity WHEN 'Special Art Rare' THEN 0 WHEN 'Illustration Rare' THEN 1 WHEN 'Rare Secret' THEN 2
        WHEN 'Rare Rainbow' THEN 3 WHEN 'Rare Ultra' THEN 4 WHEN 'Rare Holo V' THEN 5
        WHEN 'Rare Holo GX' THEN 5 WHEN 'Rare Holo EX' THEN 5 WHEN 'Rare Holo' THEN 6 ELSE 9 END LIMIT 3`).all(userId);

    const topDesc = top.length > 0
        ? top.map(c => `> ${rdata(c.rarity).emoji} **${c.name}** — *${c.setName}*`).join('\n')
        : '> *Belum ada kartu!*';

    const embed = new EmbedBuilder()
        .setTitle('🃏 POKEMON TCG CARD PANEL')
        .setColor('#E74C3C')
        .setDescription(
            `**📊 Stats:**\n` +
            `> 🃏 Kartu: **${total}** | 🎴 Unique: **${unique}**\n\n` +
            `**🏆 Top Cards:**\n${topDesc}\n\n` +
            `**🎴 Gacha Packs:**\n` +
            `> 🟢 **Basic** — 3 kartu (💰 15.000)\n` +
            `> 🔵 **Premium** — 3 kartu (💰 75.000)\n` +
            `> 🟣 **Ultra** — 3 kartu (💰 200.000)\n` +
            `> 💎 **Master** — 10 kartu (💰 750.000)\n\n` +
            `**📋 Menu:**\n` +
            `> 📖 **Collection** — Gallery kartu milikmu (paginated)\n` +
            `> 🔄 **Trade** — Tukar kartu duplikat\n` +
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

async function handleCardPanelCommand(interaction) { return interaction.reply(buildPanel(interaction.user.id)); }

// ==================== GACHA ====================
async function handleGacha(interaction, packId, userId) {
    const guildId = interaction.guild.id;
    const pack = PACKS[packId];
    if (!pack) return interaction.reply({ content: '❌ Pack tidak valid!', ephemeral: true });

    const userData = getOrCreateUser(guildId, userId);
    if (userData.balance < pack.price) {
        return interaction.reply({ content: `❌ Uang tidak cukup! Butuh **💰 ${pack.price.toLocaleString('id-ID')}**, punya **💰 ${userData.balance.toLocaleString('id-ID')}**.`, ephemeral: true });
    }

    db.prepare('UPDATE users SET balance=balance-? WHERE guildId=? AND userId=?').run(pack.price, guildId, userId);
    await interaction.deferReply();

    try {
        let cards = await pullCards(pack.pool, pack.count);

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
            return `**${i+1}.** ${r.emoji} **${c.name}** — *${c.setName}* [${c.rarity}]`;
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

// ==================== COLLECTION (Paginated Gallery — 10 cards per page) ====================
async function handleCardsCommand(interaction, page = 0) {
    const target = interaction.options?.getUser?.('user') || interaction.user;
    const total = db.prepare('SELECT COUNT(*) as c FROM pokemon_cards WHERE userId=?').get(target.id).c;
    const unique = db.prepare('SELECT COUNT(DISTINCT cardApiId) as c FROM pokemon_cards WHERE userId=?').get(target.id).c;

    if (total === 0) return interaction.reply({ content: `📭 ${target.username} belum punya kartu!`, ephemeral: true });

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
        .setTitle(`📖 ${target.username}'s Collection`)
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

// Pagination button handler
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
        .setTitle(`📖 ${uname}'s Collection`)
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

    const r = rdata(card.rarity);
    const embed = new EmbedBuilder()
        .setColor(r.color)
        .setTitle(`${r.emoji} ${card.name}`)
        .setDescription(
            `**Set:** ${card.setName}\n**Rarity:** ${r.emoji} ${card.rarity}\n` +
            (card.types ? `**Type:** ${card.types}\n` : '') +
            (card.hp ? `**HP:** ${card.hp}\n` : '') +
            (card.artist ? `**Artist:** ${card.artist}\n` : '') +
            `**Owner:** <@${card.userId}>\n**Obtained:** <t:${Math.floor(card.obtainedAt/1000)}:R>` +
            (card.dye ? `\n**Dye:** ${card.dye}` : '')
        )
        .setImage(card.imageUrl || null)
        .setFooter({ text: `ID: ${card.id} • ${card.cardApiId}` });
    return interaction.reply({ embeds: [embed] });
}

// ==================== BURN ====================
async function handleCardBurn(interaction) {
    const id = interaction.options.getInteger('id');
    const userId = interaction.user.id;
    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id=? AND userId=?').get(id, userId);
    if (!card) return interaction.reply({ content: '❌ Kartu tidak ditemukan!', ephemeral: true });
    if (card.locked) return interaction.reply({ content: '❌ Kartu di-lock!', ephemeral: true });

    const dust = rdata(card.rarity).dust || 1;
    db.prepare('DELETE FROM pokemon_cards WHERE id=?').run(id);
    addStardust(userId, dust);

    return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FF6B35').setTitle('🔥 Card Burned!').setDescription(
        `${rdata(card.rarity).emoji} **${card.name}** — *${card.setName}*\n\n✨ **+${dust} Stardust** | 💫 Total: **${getStardust(userId)}**`
    )] });
}

// ==================== TRADE ====================
async function handleCardTrade(interaction) {
    const target = interaction.options.getUser('user');
    const cardId = interaction.options.getInteger('kartu_kamu');
    const userId = interaction.user.id;
    if (target.id === userId) return interaction.reply({ content: '❌ Tidak bisa trade sendiri!', ephemeral: true });
    if (target.bot) return interaction.reply({ content: '❌ Tidak bisa trade dengan bot!', ephemeral: true });

    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id=? AND userId=?').get(cardId, userId);
    if (!card) return interaction.reply({ content: '❌ Kartu tidak ditemukan!', ephemeral: true });
    if (card.locked) return interaction.reply({ content: '❌ Kartu di-lock!', ephemeral: true });

    db.prepare('INSERT INTO card_trades(senderId,receiverId,cardRowId,status,createdAt) VALUES(?,?,?,?,?)').run(userId, target.id, cardId, 'pending', Date.now());
    const tradeId = db.prepare('SELECT last_insert_rowid() as id').get().id;

    const embed = new EmbedBuilder().setColor('#3498DB').setTitle('🔄 Trade Offer!')
        .setDescription(`<@${userId}> → <@${target.id}>:\n\n${rdata(card.rarity).emoji} **${card.name}** — *${card.setName}* [${card.rarity}]\n\nKlik **Accept** untuk terima!`)
        .setThumbnail(card.imageUrl || null).setFooter({ text: `Trade #${tradeId} • 5 min` });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cardtrade_accept_${tradeId}_${target.id}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cardtrade_deny_${tradeId}_${target.id}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger));
    await interaction.reply({ embeds: [embed], components: [row] });
    setTimeout(() => { const t = db.prepare('SELECT * FROM card_trades WHERE id=? AND status=?').get(tradeId,'pending'); if(t) db.prepare('UPDATE card_trades SET status=? WHERE id=?').run('expired',tradeId); }, 300000);
}

async function handleCardTradeButton(interaction) {
    const [,action,tid,allowed] = interaction.customId.split('_');
    if (interaction.user.id !== allowed) return interaction.reply({ content: '❌ Bukan untukmu!', ephemeral: true });
    const trade = db.prepare('SELECT * FROM card_trades WHERE id=?').get(parseInt(tid));
    if (!trade || trade.status !== 'pending') return interaction.reply({ content: '❌ Trade expired/selesai!', ephemeral: true });
    if (action === 'deny') { db.prepare('UPDATE card_trades SET status=? WHERE id=?').run('denied',trade.id); return interaction.update({ content:'❌ Trade ditolak.', embeds:[], components:[] }); }
    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id=? AND userId=?').get(trade.cardRowId, trade.senderId);
    if (!card) { db.prepare('UPDATE card_trades SET status=? WHERE id=?').run('failed',trade.id); return interaction.update({ content:'❌ Kartu tidak ada!', embeds:[], components:[] }); }
    db.prepare('UPDATE pokemon_cards SET userId=? WHERE id=?').run(trade.receiverId, trade.cardRowId);
    db.prepare('UPDATE card_trades SET status=? WHERE id=?').run('completed', trade.id);
    return interaction.update({ content: `✅ ${rdata(card.rarity).emoji} **${card.name}** → <@${trade.receiverId}>!`, embeds:[], components:[] });
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

// ==================== DYE ====================
const DYES = { crimson:{name:'Crimson',hex:'#DC143C',cost:50}, ocean:{name:'Ocean',hex:'#006994',cost:50}, emerald:{name:'Emerald',hex:'#50C878',cost:50}, gold:{name:'Gold',hex:'#FFD700',cost:100}, sakura:{name:'Sakura',hex:'#FFB7C5',cost:75}, midnight:{name:'Midnight',hex:'#191970',cost:75} };

async function handleCardDye(interaction) {
    const id = interaction.options.getInteger('id'), dyeId = interaction.options.getString('warna'), userId = interaction.user.id;
    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id=? AND userId=?').get(id, userId);
    if (!card) return interaction.reply({ content: '❌ Kartu tidak ditemukan!', ephemeral: true });
    const dye = DYES[dyeId]; if (!dye) return interaction.reply({ content: '❌ Warna tidak valid!', ephemeral: true });
    const dust = getStardust(userId); if (dust < dye.cost) return interaction.reply({ content: `❌ Stardust kurang! Butuh ${dye.cost}, punya ${dust}.`, ephemeral: true });
    addStardust(userId, -dye.cost); db.prepare('UPDATE pokemon_cards SET dye=? WHERE id=?').run(dyeId, id);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(dye.hex).setTitle('🎨 Dyed!').setDescription(`${rdata(card.rarity).emoji} **${card.name}** → **${dye.name}**\n💫 -${dye.cost} Stardust`)] });
}

// ==================== ALBUM ====================
async function handleCardAlbum(interaction) {
    const userId = interaction.options?.getUser?.('user')?.id || interaction.user.id;
    const rows = db.prepare('SELECT setName, COUNT(*) as cnt, COUNT(DISTINCT cardApiId) as uniq FROM pokemon_cards WHERE userId=? GROUP BY setName ORDER BY cnt DESC LIMIT 15').all(userId);
    if (!rows.length) return interaction.reply({ content: '📭 Belum punya kartu!', ephemeral: true });

    const total = rows.reduce((s,r) => s+r.cnt, 0);
    const desc = rows.map(r => `> **${r.setName}** — ${r.cnt} kartu (${r.uniq} unique)${r.uniq>=5?' 🏆':r.uniq>=3?' ⭐':''}`).join('\n');

    // Set bonus
    const today = new Date().toLocaleDateString('sv-SE');
    const sets5 = rows.filter(r => r.uniq >= 5).length;
    let bonus = '';
    if (sets5 > 0 && interaction.user.id === userId) {
        const key = `album_${userId}_${today}`;
        if (!state.fishCooldowns.has(key)) { const amt = sets5*10; addStardust(userId,amt); state.fishCooldowns.set(key, Date.now()+86400000); bonus = `\n\n🏆 **Set Bonus!** +${amt} Stardust`; }
    }

    const embed = new EmbedBuilder().setTitle('📦 Album — By Set').setColor('#9B59B6')
        .setDescription(`${desc}${bonus}`).setFooter({ text: `${total} kartu | ${rows.length} sets` });
    return interaction.reply({ embeds: [embed] });
}

// ==================== LEADERBOARD ====================
async function handleCardLeaderboard(interaction) {
    const type = interaction.options?.getString?.('tipe') || 'total';
    let title, rows;
    if (type === 'rare') { title = '👑 Most Rare+'; rows = db.prepare(`SELECT userId, COUNT(*) as cnt FROM pokemon_cards WHERE rarity IN ('Rare Ultra','Rare Rainbow','Rare Secret','Illustration Rare','Special Art Rare') GROUP BY userId ORDER BY cnt DESC LIMIT 10`).all(); }
    else if (type === 'stardust') { title = '💫 Stardust'; rows = db.prepare('SELECT userId, amount as cnt FROM card_stardust ORDER BY amount DESC LIMIT 10').all(); }
    else { title = '🃏 Most Cards'; rows = db.prepare('SELECT userId, COUNT(*) as cnt FROM pokemon_cards GROUP BY userId ORDER BY cnt DESC LIMIT 10').all(); }
    if (!rows?.length) return interaction.reply({ content: '📭 Belum ada data!', ephemeral: true });
    const m = ['🥇','🥈','🥉'];
    const embed = new EmbedBuilder().setTitle(`📊 ${title}`).setColor('#FFD700').setTimestamp()
        .setDescription(rows.map((r,i) => `${m[i]||`**${i+1}.**`} <@${r.userId}> — **${r.cnt.toLocaleString('id-ID')}**`).join('\n'));
    return interaction.reply({ embeds: [embed] });
}

// ==================== STARDUST ====================
async function handleStardustCommand(interaction) {
    const embed = new EmbedBuilder().setTitle('💫 Stardust').setColor('#FFD700')
        .setDescription(`> 💎 Balance: **${getStardust(interaction.user.id)}** Stardust\n\n**Kegunaan:**\n> 🎨 Card Dye — 50-100 ✨\n\n-# Burn kartu untuk dapat Stardust!`);
    return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ==================== PANEL BUTTONS ====================
async function handleCardPanelButton(interaction) {
    const id = interaction.customId;

    // Pagination buttons: cardpage_prev_userId_page or cardpage_next_userId_page
    if (id.startsWith('cardpage_')) {
        return handleCardPageButton(interaction);
    }

    const parts = id.split('_');
    // card_gacha_<packId>_<userId> OR card_<action>_<userId>
    const userId = parts[parts.length - 1];
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan panel kamu!', ephemeral: true });

    // Gacha buttons: card_gacha_basic_123, card_gacha_premium_123, etc.
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
    fetchRandomCards: pullCards, RARITIES,
};
