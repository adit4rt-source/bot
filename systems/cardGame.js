// systems/cardGame.js — Pokemon TCG Card Gacha
// Beli pack → dapat kartu Pokemon asli dari pokemontcg.io API
// Fan-made • Not affiliated with Nintendo/The Pokemon Company
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { db, getOrCreateUser, incrementUserStat } = require('../database');
const state = require('../state');

// ==================== CONFIG ====================
const GACHA_PRICE = 10000;

// ==================== DATABASE SETUP ====================
// Drop old incompatible tables
try { db.exec(`DROP TABLE IF EXISTS card_prints`); } catch (_) {}
try { db.exec(`DROP TABLE IF EXISTS anime_cards`); } catch (_) {}

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

db.exec(`CREATE TABLE IF NOT EXISTS card_stardust (
    userId TEXT PRIMARY KEY,
    amount INTEGER DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS card_wishlist (
    userId TEXT,
    name TEXT,
    PRIMARY KEY(userId, name)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS card_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    senderId TEXT,
    receiverId TEXT,
    cardRowId INTEGER,
    status TEXT DEFAULT 'pending',
    createdAt INTEGER
)`);

db.exec(`CREATE TABLE IF NOT EXISTS pokemon_card_cache (
    cardApiId TEXT PRIMARY KEY,
    name TEXT,
    setName TEXT,
    rarity TEXT,
    imageUrl TEXT,
    types TEXT DEFAULT '',
    hp TEXT DEFAULT '',
    artist TEXT DEFAULT '',
    cachedAt INTEGER
)`);

// ==================== RARITY CONFIG ====================
const RARITIES = {
    'Common':            { emoji: '⚪', color: '#AAAAAA', weight: 50, tier: 0, dust: 1 },
    'Uncommon':          { emoji: '🟢', color: '#2ECC71', weight: 25, tier: 1, dust: 3 },
    'Rare':              { emoji: '🔵', color: '#3498DB', weight: 12, tier: 2, dust: 8 },
    'Rare Holo':         { emoji: '🟣', color: '#9B59B6', weight: 7,  tier: 3, dust: 20 },
    'Rare Holo EX':      { emoji: '🟡', color: '#FFD700', weight: 2,  tier: 4, dust: 50 },
    'Rare Holo GX':      { emoji: '🟡', color: '#FFD700', weight: 1.5, tier: 4, dust: 50 },
    'Rare Holo V':       { emoji: '🟡', color: '#FFD700', weight: 1,  tier: 4, dust: 50 },
    'Rare Ultra':        { emoji: '🔴', color: '#E74C3C', weight: 0.5, tier: 5, dust: 100 },
    'Rare Rainbow':      { emoji: '🌈', color: '#FF69B4', weight: 0.3, tier: 6, dust: 180 },
    'Rare Secret':       { emoji: '👑', color: '#FF0000', weight: 0.2, tier: 7, dust: 250 },
    'Illustration Rare': { emoji: '🎨', color: '#DA70D6', weight: 0.15, tier: 7, dust: 250 },
    'Special Art Rare':  { emoji: '💎', color: '#00CED1', weight: 0.1, tier: 8, dust: 400 },
};

function rd(rarity) {
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

function rollRarity() {
    const r = Math.random() * 100;
    let cum = 0;
    for (const [name, data] of Object.entries(RARITIES)) {
        cum += data.weight;
        if (r <= cum) return name;
    }
    return 'Common';
}

// ==================== POKEMON TCG API ====================
const API_BASE = 'https://api.pokemontcg.io/v2/cards';

const MAX_PAGES = {
    'Common': 80, 'Uncommon': 60, 'Rare': 50, 'Rare Holo': 30,
    'Rare Holo EX': 10, 'Rare Holo GX': 10, 'Rare Holo V': 15,
    'Rare Ultra': 8, 'Rare Rainbow': 5, 'Rare Secret': 4,
    'Illustration Rare': 3, 'Special Art Rare': 2,
};

async function apiFetch(rarity) {
    const q = encodeURIComponent(`rarity:"${rarity}"`);
    const page = Math.floor(Math.random() * (MAX_PAGES[rarity] || 10)) + 1;
    const url = `${API_BASE}?q=${q}&pageSize=20&page=${page}`;
    try {
        let res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok || res.status === 400) {
            res = await fetch(`${API_BASE}?q=${q}&pageSize=20&page=1`, { headers: { 'Accept': 'application/json' } });
        }
        if (!res.ok) return null;
        const json = await res.json();
        const cards = json.data || [];
        if (cards.length === 0) return null;
        const pick = cards[Math.floor(Math.random() * cards.length)];
        return {
            cardApiId: pick.id,
            name: pick.name,
            setName: pick.set?.name || 'Unknown',
            rarity: pick.rarity || rarity,
            imageUrl: pick.images?.large || pick.images?.small || '',
            types: (pick.types || []).join('/'),
            hp: pick.hp || '',
            artist: pick.artist || '',
        };
    } catch (e) {
        console.error('[Pokemon TCG] API error:', e.message);
        return null;
    }
}

function cacheCard(c) {
    try {
        db.prepare(`INSERT OR REPLACE INTO pokemon_card_cache
            (cardApiId, name, setName, rarity, imageUrl, types, hp, artist, cachedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            c.cardApiId, c.name, c.setName, c.rarity, c.imageUrl, c.types, c.hp, c.artist, Date.now());
    } catch (_) {}
}

function getFromCache(rarity) {
    try {
        return db.prepare('SELECT * FROM pokemon_card_cache WHERE rarity = ? ORDER BY RANDOM() LIMIT 1').get(rarity);
    } catch (_) { return null; }
}

async function pullCards(count = 3) {
    const results = [];
    for (let i = 0; i < count; i++) {
        const rarity = rollRarity();
        // 30% cache hit for speed
        if (Math.random() < 0.3) {
            const cached = getFromCache(rarity);
            if (cached) {
                results.push({ cardApiId: cached.cardApiId, name: cached.name, setName: cached.setName,
                    rarity: cached.rarity, imageUrl: cached.imageUrl, types: cached.types, hp: cached.hp, artist: cached.artist });
                continue;
            }
        }
        const card = await apiFetch(rarity);
        if (card) { cacheCard(card); results.push(card); }
        else {
            // fallback: try Common or cache
            const fb = await apiFetch('Common') || getFromCache('Common');
            if (fb) { if (fb.cardApiId) { cacheCard(fb); results.push(fb); } else {
                results.push({ cardApiId: fb.cardApiId || fb.cardApiId, name: fb.name, setName: fb.setName,
                    rarity: fb.rarity || 'Common', imageUrl: fb.imageUrl, types: fb.types || '', hp: fb.hp || '', artist: fb.artist || '' });
            }}
        }
    }
    return results;
}

// ==================== IMAGE GENERATION ====================
async function generateGachaImage(cards) {
    const cw = 245, ch = 342, gap = 10, pad = 12;
    const w = cw * cards.length + gap * (cards.length - 1) + pad * 2;
    const h = ch + pad * 2;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < cards.length; i++) {
        const x = pad + i * (cw + gap), y = pad;
        try {
            if (cards[i].imageUrl) {
                const img = await loadImage(cards[i].imageUrl);
                ctx.drawImage(img, x, y, cw, ch);
            } else { throw new Error('no url'); }
        } catch (_) {
            ctx.fillStyle = '#2d2d44';
            ctx.fillRect(x, y, cw, ch);
            ctx.fillStyle = '#fff';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(cards[i].name, x + cw / 2, y + ch / 2);
        }
        // rarity border
        ctx.strokeStyle = rd(cards[i].rarity).color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, cw, ch);
    }
    return canvas.toBuffer('image/png');
}

// ==================== STARDUST ====================
function getStardust(userId) {
    const r = db.prepare('SELECT amount FROM card_stardust WHERE userId = ?').get(userId);
    return r ? r.amount : 0;
}
function addStardust(userId, amt) {
    db.prepare('INSERT OR IGNORE INTO card_stardust (userId, amount) VALUES (?, 0)').run(userId);
    db.prepare('UPDATE card_stardust SET amount = amount + ? WHERE userId = ?').run(amt, userId);
}

// ==================== GACHA (BUY) ====================
async function handleDropCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const userData = getOrCreateUser(guildId, userId);

    if (userData.balance < GACHA_PRICE) {
        return interaction.reply({
            content: `❌ Uang tidak cukup! Butuh **💰 ${GACHA_PRICE.toLocaleString('id-ID')}**, kamu punya **💰 ${userData.balance.toLocaleString('id-ID')}**.\n> Kumpulkan dari /daily, chat rewards, dll!`,
            ephemeral: true
        });
    }

    // Deduct
    db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(GACHA_PRICE, guildId, userId);
    await interaction.deferReply();

    try {
        const cards = await pullCards(3);
        if (!cards || cards.length < 3) {
            db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(GACHA_PRICE, guildId, userId);
            return interaction.editReply('❌ Gagal fetch kartu. Uang dikembalikan, coba lagi!');
        }

        // Save to collection
        for (const c of cards) {
            db.prepare(`INSERT INTO pokemon_cards (userId, cardApiId, name, setName, rarity, imageUrl, types, hp, artist, obtainedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                userId, c.cardApiId, c.name, c.setName, c.rarity, c.imageUrl, c.types, c.hp, c.artist, Date.now());
        }
        incrementUserStat(guildId, userId, 'cards_grabbed');

        // Generate image
        const img = await generateGachaImage(cards);
        const att = new AttachmentBuilder(img, { name: 'gacha.png' });

        const desc = cards.map((c, i) => {
            const r = rd(c.rarity);
            return `**${i + 1}.** ${r.emoji} **${c.name}** — *${c.setName}* [${c.rarity}]`;
        }).join('\n');

        // Wishlist ping
        const pings = checkWishlist(cards);
        const pingText = pings.length > 0 ? '\n\n' + pings.map(p => `📢 <@${p.userId}> wishlist **${p.name}**!`).join('\n') : '';

        const bal = userData.balance - GACHA_PRICE;
        const embed = new EmbedBuilder()
            .setColor('#FF6B35')
            .setTitle('🎴 POKEMON TCG GACHA!')
            .setDescription(
                `<@${userId}> membeli gacha! 💰 **-${GACHA_PRICE.toLocaleString('id-ID')}**\n\n` +
                `${desc}${pingText}\n\n` +
                `> ✅ 3 kartu masuk koleksimu!\n> 💰 Sisa: **${bal.toLocaleString('id-ID')}**`
            )
            .setImage('attachment://gacha.png')
            .setFooter({ text: 'Fan-made • Not affiliated with Nintendo/The Pokemon Company • pokemontcg.io' })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed], files: [att] });
    } catch (e) {
        console.error('[Pokemon TCG] Gacha error:', e);
        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(GACHA_PRICE, guildId, userId);
        return interaction.editReply('❌ Error saat gacha. Uang dikembalikan!');
    }
}

// ==================== COLLECTION ====================
async function handleCardsCommand(interaction) {
    const target = interaction.options?.getUser?.('user') || interaction.user;
    const cards = db.prepare('SELECT * FROM pokemon_cards WHERE userId = ? ORDER BY obtainedAt DESC LIMIT 15').all(target.id);
    const total = db.prepare('SELECT COUNT(*) as c FROM pokemon_cards WHERE userId = ?').get(target.id).c;
    const unique = db.prepare('SELECT COUNT(DISTINCT cardApiId) as c FROM pokemon_cards WHERE userId = ?').get(target.id).c;

    if (total === 0) return interaction.reply({ content: `📭 ${target.username} belum punya kartu. Beli gacha dulu!`, ephemeral: true });

    const sorted = [...cards].sort((a, b) => (rd(b.rarity).tier || 0) - (rd(a.rarity).tier || 0));
    let desc = sorted.map(c => `${rd(c.rarity).emoji} **${c.name}** — *${c.setName}* [${c.rarity}] \`ID:${c.id}\``).join('\n');
    if (total > 15) desc += `\n\n*...dan ${total - 15} kartu lainnya*`;

    const embed = new EmbedBuilder()
        .setTitle(`🃏 ${target.username}'s Collection`)
        .setColor('#FF6B35')
        .setDescription(`> 📊 **${total}** kartu | **${unique}** unique\n\n${desc}`)
        .setFooter({ text: '/cardview id:<num> untuk detail • pokemontcg.io' });
    return interaction.reply({ embeds: [embed] });
}

// ==================== CARD VIEW ====================
async function handleCardViewCommand(interaction) {
    const id = interaction.options.getInteger('id');
    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ?').get(id);
    if (!card) return interaction.reply({ content: '❌ Kartu tidak ditemukan!', ephemeral: true });

    const r = rd(card.rarity);
    const embed = new EmbedBuilder()
        .setColor(r.color)
        .setTitle(`${r.emoji} ${card.name}`)
        .setDescription(
            `**Set:** ${card.setName}\n` +
            `**Rarity:** ${r.emoji} ${card.rarity}\n` +
            (card.types ? `**Type:** ${card.types}\n` : '') +
            (card.hp ? `**HP:** ${card.hp}\n` : '') +
            (card.artist ? `**Artist:** ${card.artist}\n` : '') +
            `**Owner:** <@${card.userId}>\n` +
            `**Obtained:** <t:${Math.floor(card.obtainedAt / 1000)}:R>\n` +
            (card.dye ? `**Dye:** ${card.dye}\n` : '')
        )
        .setImage(card.imageUrl || null)
        .setFooter({ text: `ID: ${card.id} • ${card.cardApiId} • pokemontcg.io` });
    return interaction.reply({ embeds: [embed] });
}

// ==================== BURN ====================
async function handleCardBurn(interaction) {
    const id = interaction.options.getInteger('id');
    const userId = interaction.user.id;
    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ? AND userId = ?').get(id, userId);
    if (!card) return interaction.reply({ content: '❌ Kartu tidak ditemukan atau bukan milikmu!', ephemeral: true });
    if (card.locked) return interaction.reply({ content: '❌ Kartu di-lock! Unlock dulu.', ephemeral: true });

    const dust = rd(card.rarity).dust || 1;
    db.prepare('DELETE FROM pokemon_cards WHERE id = ?').run(id);
    addStardust(userId, dust);

    const embed = new EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle('🔥 Card Burned!')
        .setDescription(
            `${rd(card.rarity).emoji} **${card.name}** — *${card.setName}*\n\n` +
            `✨ **+${dust} Stardust**\n💫 Total: **${getStardust(userId)}**`
        );
    return interaction.reply({ embeds: [embed] });
}

// ==================== TRADE ====================
async function handleCardTrade(interaction) {
    const target = interaction.options.getUser('user');
    const cardId = interaction.options.getInteger('kartu_kamu');
    const userId = interaction.user.id;

    if (target.id === userId) return interaction.reply({ content: '❌ Tidak bisa trade sendiri!', ephemeral: true });
    if (target.bot) return interaction.reply({ content: '❌ Tidak bisa trade dengan bot!', ephemeral: true });

    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ? AND userId = ?').get(cardId, userId);
    if (!card) return interaction.reply({ content: '❌ Kartu tidak ditemukan!', ephemeral: true });
    if (card.locked) return interaction.reply({ content: '❌ Kartu di-lock!', ephemeral: true });

    db.prepare('INSERT INTO card_trades (senderId, receiverId, cardRowId, status, createdAt) VALUES (?, ?, ?, ?, ?)').run(userId, target.id, cardId, 'pending', Date.now());
    const tradeId = db.prepare('SELECT last_insert_rowid() as id').get().id;

    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('🔄 Trade Offer!')
        .setDescription(
            `<@${userId}> menawarkan kartu ke <@${target.id}>:\n\n` +
            `${rd(card.rarity).emoji} **${card.name}** — *${card.setName}* [${card.rarity}]\n\n` +
            `Klik **Accept** untuk terima!`
        )
        .setThumbnail(card.imageUrl || null)
        .setFooter({ text: `Trade #${tradeId} • Expires 5 min` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cardtrade_accept_${tradeId}_${target.id}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cardtrade_deny_${tradeId}_${target.id}`).setLabel('❌ Deny').setStyle(ButtonStyle.Danger),
    );
    await interaction.reply({ embeds: [embed], components: [row] });

    setTimeout(() => {
        const t = db.prepare('SELECT * FROM card_trades WHERE id = ? AND status = ?').get(tradeId, 'pending');
        if (t) db.prepare('UPDATE card_trades SET status = ? WHERE id = ?').run('expired', tradeId);
    }, 5 * 60 * 1000);
}

async function handleCardTradeButton(interaction) {
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const tradeId = parseInt(parts[2]);
    const allowed = parts[3];

    if (interaction.user.id !== allowed) return interaction.reply({ content: '❌ Bukan untukmu!', ephemeral: true });

    const trade = db.prepare('SELECT * FROM card_trades WHERE id = ?').get(tradeId);
    if (!trade) return interaction.reply({ content: '❌ Trade tidak ditemukan!', ephemeral: true });
    if (trade.status !== 'pending') return interaction.reply({ content: '❌ Trade sudah selesai/expired!', ephemeral: true });

    if (action === 'deny') {
        db.prepare('UPDATE card_trades SET status = ? WHERE id = ?').run('denied', tradeId);
        return interaction.update({ content: '❌ Trade ditolak.', embeds: [], components: [] });
    }

    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ? AND userId = ?').get(trade.cardRowId, trade.senderId);
    if (!card) {
        db.prepare('UPDATE card_trades SET status = ? WHERE id = ?').run('failed', tradeId);
        return interaction.update({ content: '❌ Kartu sudah tidak ada!', embeds: [], components: [] });
    }

    db.prepare('UPDATE pokemon_cards SET userId = ? WHERE id = ?').run(trade.receiverId, trade.cardRowId);
    db.prepare('UPDATE card_trades SET status = ? WHERE id = ?').run('completed', tradeId);
    return interaction.update({ content: `✅ Trade berhasil! ${rd(card.rarity).emoji} **${card.name}** → <@${trade.receiverId}>`, embeds: [], components: [] });
}

// ==================== WISHLIST ====================
async function handleCardWishlist(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'add') {
        const name = interaction.options.getString('karakter');
        const cnt = db.prepare('SELECT COUNT(*) as c FROM card_wishlist WHERE userId = ?').get(userId).c;
        if (cnt >= 10) return interaction.reply({ content: '❌ Wishlist penuh (10)! Hapus dulu.', ephemeral: true });
        db.prepare('INSERT OR IGNORE INTO card_wishlist (userId, name) VALUES (?, ?)').run(userId, name.toLowerCase());
        return interaction.reply({ content: `❤️ **${name}** ditambahkan ke wishlist!`, ephemeral: true });
    }
    if (sub === 'remove') {
        const name = interaction.options.getString('karakter');
        db.prepare('DELETE FROM card_wishlist WHERE userId = ? AND name = ?').run(userId, name.toLowerCase());
        return interaction.reply({ content: `🗑️ **${name}** dihapus dari wishlist.`, ephemeral: true });
    }
    if (sub === 'list') {
        const list = db.prepare('SELECT * FROM card_wishlist WHERE userId = ?').all(userId);
        if (list.length === 0) return interaction.reply({ content: '📭 Wishlist kosong!', ephemeral: true });
        const desc = list.map((w, i) => `> **${i + 1}.** ❤️ ${w.name}`).join('\n');
        const embed = new EmbedBuilder().setTitle('❤️ Wishlist').setColor('#FF69B4')
            .setDescription(`${desc}\n\n-# Kamu di-ping saat Pokemon wishlist muncul di gacha orang lain!`)
            .setFooter({ text: `${list.length}/10` });
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

function checkWishlist(cards) {
    try {
        const all = db.prepare('SELECT * FROM card_wishlist').all();
        const hits = [];
        for (const c of cards) {
            const low = c.name.toLowerCase();
            for (const w of all) {
                if (low.includes(w.name) || w.name.includes(low)) {
                    hits.push({ userId: w.userId, name: c.name });
                }
            }
        }
        return hits;
    } catch (_) { return []; }
}

// ==================== DYE ====================
const DYE_COLORS = {
    crimson: { name: 'Crimson', hex: '#DC143C', cost: 50 },
    ocean: { name: 'Ocean Blue', hex: '#006994', cost: 50 },
    emerald: { name: 'Emerald', hex: '#50C878', cost: 50 },
    gold: { name: 'Gold', hex: '#FFD700', cost: 100 },
    sakura: { name: 'Sakura', hex: '#FFB7C5', cost: 75 },
    midnight: { name: 'Midnight', hex: '#191970', cost: 75 },
};

async function handleCardDye(interaction) {
    const id = interaction.options.getInteger('id');
    const dyeId = interaction.options.getString('warna');
    const userId = interaction.user.id;

    const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ? AND userId = ?').get(id, userId);
    if (!card) return interaction.reply({ content: '❌ Kartu tidak ditemukan!', ephemeral: true });

    const dye = DYE_COLORS[dyeId];
    if (!dye) return interaction.reply({ content: '❌ Warna tidak valid!', ephemeral: true });

    const dust = getStardust(userId);
    if (dust < dye.cost) return interaction.reply({ content: `❌ Stardust kurang! Butuh ${dye.cost}, punya ${dust}.`, ephemeral: true });

    addStardust(userId, -dye.cost);
    db.prepare('UPDATE pokemon_cards SET dye = ? WHERE id = ?').run(dyeId, id);

    return interaction.reply({ embeds: [new EmbedBuilder().setColor(dye.hex).setTitle('🎨 Card Dyed!').setDescription(
        `${rd(card.rarity).emoji} **${card.name}** → border **${dye.name}**!\n💫 -${dye.cost} Stardust`
    )] });
}

// ==================== ALBUM (by Set) ====================
async function handleCardAlbum(interaction) {
    const userId = interaction.options?.getUser?.('user')?.id || interaction.user.id;
    const rows = db.prepare('SELECT setName, COUNT(*) as cnt, COUNT(DISTINCT cardApiId) as uniq FROM pokemon_cards WHERE userId = ? GROUP BY setName ORDER BY cnt DESC LIMIT 15').all(userId);

    if (rows.length === 0) return interaction.reply({ content: '📭 Belum punya kartu!', ephemeral: true });

    const total = rows.reduce((s, r) => s + r.cnt, 0);
    let desc = rows.map(r => {
        const bonus = r.uniq >= 5 ? ' 🏆' : r.uniq >= 3 ? ' ⭐' : '';
        return `> **${r.setName}** — ${r.cnt} kartu (${r.uniq} unique)${bonus}`;
    }).join('\n');

    // Set bonus (5+ unique from same set = daily stardust)
    const today = new Date().toLocaleDateString('sv-SE');
    const setsOf5 = rows.filter(r => r.uniq >= 5).length;
    let bonusMsg = '';
    if (setsOf5 > 0 && interaction.user.id === userId) {
        const key = `album_${userId}_${today}`;
        if (!state.fishCooldowns.has(key)) {
            const amt = setsOf5 * 10;
            addStardust(userId, amt);
            state.fishCooldowns.set(key, Date.now() + 86400000);
            bonusMsg = `\n\n🏆 **Set Bonus!** +${amt} Stardust (${setsOf5} sets × 10)`;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('📦 Pokemon TCG Album')
        .setColor('#9B59B6')
        .setDescription(`${desc}${bonusMsg}`)
        .setFooter({ text: `Total: ${total} kartu | ${rows.length} sets • 🏆 = 5+ unique dari 1 set` });
    return interaction.reply({ embeds: [embed] });
}

// ==================== LEADERBOARD ====================
async function handleCardLeaderboard(interaction) {
    const type = interaction.options?.getString?.('tipe') || 'total';
    let title, rows;

    if (type === 'total') {
        title = '🃏 Most Cards';
        rows = db.prepare('SELECT userId, COUNT(*) as cnt FROM pokemon_cards GROUP BY userId ORDER BY cnt DESC LIMIT 10').all();
    } else if (type === 'rare') {
        title = '👑 Most Rare+ Cards';
        rows = db.prepare(`SELECT userId, COUNT(*) as cnt FROM pokemon_cards WHERE rarity IN ('Rare Ultra','Rare Rainbow','Rare Secret','Illustration Rare','Special Art Rare') GROUP BY userId ORDER BY cnt DESC LIMIT 10`).all();
    } else if (type === 'stardust') {
        title = '💫 Most Stardust';
        rows = db.prepare('SELECT userId, amount as cnt FROM card_stardust ORDER BY amount DESC LIMIT 10').all();
    } else {
        title = '🃏 Most Cards';
        rows = db.prepare('SELECT userId, COUNT(*) as cnt FROM pokemon_cards GROUP BY userId ORDER BY cnt DESC LIMIT 10').all();
    }

    if (!rows || rows.length === 0) return interaction.reply({ content: '📭 Belum ada data!', ephemeral: true });

    const medals = ['🥇', '🥈', '🥉'];
    const desc = rows.map((r, i) => `${medals[i] || `**${i+1}.**`} <@${r.userId}> — **${r.cnt.toLocaleString('id-ID')}**`).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`📊 Leaderboard — ${title}`)
        .setColor('#FFD700')
        .setDescription(desc)
        .setTimestamp();
    return interaction.reply({ embeds: [embed] });
}

// ==================== STARDUST CMD ====================
async function handleStardustCommand(interaction) {
    const amt = getStardust(interaction.user.id);
    const embed = new EmbedBuilder()
        .setTitle('💫 Stardust')
        .setColor('#FFD700')
        .setDescription(
            `> 💎 Kamu punya: **${amt}** Stardust\n\n` +
            `**🛒 Shop:**\n` +
            `> 🎨 Card Dye — 50-100 ✨\n\n` +
            `-# Burn kartu untuk dapat Stardust!`
        );
    return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ==================== PANEL ====================
function buildPanel(userId) {
    const total = db.prepare('SELECT COUNT(*) as c FROM pokemon_cards WHERE userId = ?').get(userId).c;
    const unique = db.prepare('SELECT COUNT(DISTINCT cardApiId) as c FROM pokemon_cards WHERE userId = ?').get(userId).c;
    const dust = getStardust(userId);

    const topCards = db.prepare(`SELECT * FROM pokemon_cards WHERE userId = ? ORDER BY
        CASE rarity WHEN 'Special Art Rare' THEN 0 WHEN 'Illustration Rare' THEN 1 WHEN 'Rare Secret' THEN 2
        WHEN 'Rare Rainbow' THEN 3 WHEN 'Rare Ultra' THEN 4 WHEN 'Rare Holo V' THEN 5 WHEN 'Rare Holo GX' THEN 5
        WHEN 'Rare Holo EX' THEN 5 WHEN 'Rare Holo' THEN 6 ELSE 9 END LIMIT 3`).all(userId);

    const topDesc = topCards.length > 0
        ? topCards.map(c => `> ${rd(c.rarity).emoji} **${c.name}** — *${c.setName}*`).join('\n')
        : '> *Belum ada kartu! Klik 🎴 Gacha untuk mulai.*';

    const embed = new EmbedBuilder()
        .setTitle('🃏 POKEMON TCG CARD PANEL')
        .setColor('#FF6B35')
        .setDescription(
            `**📊 Stats:**\n` +
            `> 🃏 Kartu: ${total} | 🎴 Unique: ${unique}\n` +
            `> 💫 Stardust: ${dust}\n\n` +
            `**🏆 Top Cards:**\n${topDesc}\n\n` +
            `**📋 Menu:**\n` +
            `> 🎴 **Gacha** — Beli 3 kartu Pokemon random (💰 ${GACHA_PRICE.toLocaleString('id-ID')})\n` +
            `> 📦 **Collection** — Lihat semua kartumu\n` +
            `> 🔥 **Burn** — Hancurkan kartu → Stardust\n` +
            `> 🔄 **Trade** — Tukar kartu dengan player lain\n` +
            `> 🎨 **Dye** — Beri warna custom\n` +
            `> ❤️ **Wishlist** — Pokemon incaran\n` +
            `> 📦 **Album** — Koleksi per Set\n` +
            `> 📊 **Leaderboard** — Top collectors`
        )
        .setFooter({ text: 'Fan-made • Not affiliated with Nintendo/The Pokemon Company' })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`card_drop_${userId}`).setLabel('🎴 Gacha (💰10k)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`card_collection_${userId}`).setLabel('📦 Collection').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`card_album_${userId}`).setLabel('📦 Album').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`card_wishlist_${userId}`).setLabel('❤️ Wishlist').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`card_leaderboard_${userId}`).setLabel('📊 Leaderboard').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`card_stardust_${userId}`).setLabel('💫 Stardust').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row1, row2] };
}

async function handleCardPanelCommand(interaction) {
    return interaction.reply(buildPanel(interaction.user.id));
}

async function handleCardPanelButton(interaction) {
    const parts = interaction.customId.split('_');
    const action = parts[1], userId = parts[2];
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan panel kamu!', ephemeral: true });

    if (action === 'drop') return handleDropCommand(interaction);
    if (action === 'collection') return handleCardsCommand(interaction);
    if (action === 'album') return handleCardAlbum(interaction);
    if (action === 'leaderboard') return handleCardLeaderboard(interaction);
    if (action === 'stardust') return handleStardustCommand(interaction);
    if (action === 'back') return interaction.update(buildPanel(userId));

    if (action === 'wishlist') {
        const list = db.prepare('SELECT * FROM card_wishlist WHERE userId = ?').all(userId);
        const desc = list.length > 0 ? list.map((w, i) => `> **${i+1}.** ❤️ ${w.name}`).join('\n') : '> *Kosong!*';
        const embed = new EmbedBuilder().setTitle('❤️ Wishlist').setColor('#FF69B4')
            .setDescription(`${desc}\n\n-# /wishlist add/remove untuk manage`).setFooter({ text: `${list.length}/10` });
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

function isCardPanelButton(id) { return typeof id === 'string' && id.startsWith('card_') && !id.startsWith('cardgrab_') && !id.startsWith('cardtrade_'); }

// ==================== LEGACY GRAB (no-op) ====================
async function handleCardGrab(interaction) {
    return interaction.reply({ content: '❌ Sistem baru: beli gacha → kartu langsung masuk koleksi!', ephemeral: true });
}
function isCardGrabButton(id) { return typeof id === 'string' && id.startsWith('cardgrab_') && !id.startsWith('cardgrab_expired') && !id.startsWith('cardgrab_claimed'); }
function isCardTradeButton(id) { return typeof id === 'string' && id.startsWith('cardtrade_'); }

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
    checkWishlistNotify: checkWishlist,
    isCardGrabButton,
    isCardTradeButton,
    isCardPanelButton,
    generateCardImage: generateGachaImage,
    generateDropImage: generateGachaImage,
    fetchRandomCards: pullCards,
    RARITIES,
};
