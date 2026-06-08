// systems/globalTrade.js — Global Trade Board (cross-server bartering)
// Unlike Global Market (sell item FOR MONEY), Global Trade lets a player post an
// item they OFFER and what they WANT in return — either money OR an item of a
// chosen category/tier. Any player on any server can fulfill the trade.
//
// Escrow model (same as globalMarket): the offered item is moved to a sentinel
// owner 'GLOBAL_TRADE' while listed, and returned to the poster on cancel/expire.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { db, getOrCreateUser } = require('../database');
const { FISH_DATA } = require('../data/fish');
const { PET_DATA } = require('../data/pets');
const { ITEMS } = require('../data/items');

// ==================== CONSTANTS ====================
const TRADE_EXPIRY_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
const MAX_TRADES = 3; // per user
const TRADES_PER_PAGE = 8;
const ESCROW_OWNER = 'GLOBAL_TRADE';

// Preset "want" options shown when posting (keeps UX simple + testable).
// type 'money' uses `amount`; item types use `tier` ('' = any tier).
const WANT_PRESETS = [
    { key: 'money_10k', type: 'money', amount: 10000, label: '💰 Money 10.000' },
    { key: 'money_50k', type: 'money', amount: 50000, label: '💰 Money 50.000' },
    { key: 'money_100k', type: 'money', amount: 100000, label: '💰 Money 100.000' },
    { key: 'money_500k', type: 'money', amount: 500000, label: '💰 Money 500.000' },
    { key: 'pet_legendary', type: 'pet', tier: 'Legendary', label: '🐾 Pet Legendary (apa saja)' },
    { key: 'pet_mythic', type: 'pet', tier: 'Mythic', label: '🐾 Pet Mythic (apa saja)' },
    { key: 'pet_secret', type: 'pet', tier: 'Secret', label: '🐾 Pet Secret (apa saja)' },
    { key: 'relic_legendary', type: 'relic', tier: 'Legendary', label: '💎 Relic Legendary (apa saja)' },
    { key: 'relic_epic', type: 'relic', tier: 'Epic', label: '💎 Relic Epic (apa saja)' },
    { key: 'fish_legendary', type: 'fish', tier: 'Legendary', label: '🐟 Fish Legendary (apa saja)' },
    { key: 'fish_mythic', type: 'fish', tier: 'Mythic', label: '🐟 Fish Mythic (apa saja)' },
];
function getWantPreset(key) { return WANT_PRESETS.find(w => w.key === key) || null; }
function describeWant(t) {
    if (t.wantType === 'money') return `💰 ${Number(t.wantAmount).toLocaleString('id-ID')} money`;
    const emoji = { pet: '🐾', relic: '💎', fish: '🐟', item: '📦' }[t.wantType] || '❓';
    return `${emoji} ${t.wantTier || 'Any'} ${t.wantType}`;
}

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS global_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    posterId TEXT,
    posterName TEXT,
    guildId TEXT,
    offerType TEXT,
    offerId TEXT,
    offerName TEXT,
    offerDetails TEXT DEFAULT '',
    wantType TEXT,
    wantTier TEXT DEFAULT '',
    wantAmount INTEGER DEFAULT 0,
    listedAt INTEGER,
    status TEXT DEFAULT 'active',
    accepterId TEXT DEFAULT NULL,
    acceptedAt INTEGER DEFAULT NULL
)`);

// ==================== HELPER: item ownership transfer ====================
// Move an escrowed/owned item record to `toUserId`. Mirrors globalMarket logic.
function transferItem(type, id, toUserId, guildId) {
    if (type === 'fish') {
        db.prepare('UPDATE fish_inventory SET userId = ? WHERE id = ?').run(toUserId, parseInt(id));
    } else if (type === 'relic') {
        db.prepare('UPDATE relics SET userId = ?, equipped_pet_id = 0 WHERE id = ?').run(toUserId, parseInt(id));
    } else if (type === 'pet') {
        db.prepare('UPDATE pets SET userId = ?, active = 0 WHERE id = ?').run(toUserId, parseInt(id));
    } else if (type === 'item') {
        const existing = db.prepare('SELECT quantity FROM item_inventory WHERE userId = ? AND itemId = ?').get(toUserId, id);
        if (existing) db.prepare('UPDATE item_inventory SET quantity = quantity + 1 WHERE userId = ? AND itemId = ?').run(toUserId, id);
        else db.prepare('INSERT INTO item_inventory (guildId, userId, itemId, quantity) VALUES (?, ?, ?, 1)').run(guildId, toUserId, id);
    }
}

// ==================== HELPER: tier lookups ====================
function petTier(petId) { const p = PET_DATA.find(x => x.id === petId); return p ? p.tier : null; }
function fishTier(fishId) { const f = FISH_DATA.find(x => x.id === fishId); return f ? f.tier : null; }

// ==================== HELPER: sellable (offerable) items ====================
function getOfferableItems(guildId, userId) {
    const out = [];
    const relics = db.prepare('SELECT * FROM relics WHERE guildId = ? AND userId = ?').all(guildId, userId);
    for (const r of relics) {
        if (r.equipped_pet_id > 0) continue;
        out.push({ type: 'relic', id: String(r.id), label: `💎 ${r.name} [${r.rarity}] +${r.refine_level}`, desc: `+${r.stat_value} ${r.stat_type}`, details: `${r.rarity} | +${r.stat_value} ${r.stat_type}` });
    }
    const pets = db.prepare('SELECT * FROM pets WHERE guildId = ? AND userId = ? AND active = 0').all(guildId, userId);
    for (const p of pets) {
        const pd = PET_DATA.find(x => x.id === p.petId);
        out.push({ type: 'pet', id: String(p.id), label: `${pd ? pd.emoji : '🐾'} ${p.name} (Lv.${p.level})`, desc: `${pd ? pd.tier : '?'} | ATK:${p.atk}`, details: `${pd ? pd.tier : '?'} | Lv.${p.level} | ATK:${p.atk} DEF:${p.def} HP:${p.hp}` });
    }
    const inv = db.prepare('SELECT * FROM item_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, userId);
    for (const it of inv) {
        const def = ITEMS.find(x => x.id === it.itemId);
        if (def) out.push({ type: 'item', id: it.itemId, label: `${def.emoji} ${def.name} (x${it.quantity})`, desc: (def.desc || '').substring(0, 50), details: def.desc || '' });
    }
    const fish = db.prepare("SELECT * FROM fish_inventory WHERE guildId = ? AND userId = ? AND locked = 0 ORDER BY weight DESC LIMIT 20").all(guildId, userId);
    for (const f of fish) {
        const fd = FISH_DATA.find(x => x.id === f.fishId);
        if (!fd) continue;
        if (!['Rare', 'Epic', 'Legendary', 'Mythic', 'Secret', 'God'].includes(fd.tier)) continue;
        out.push({ type: 'fish', id: String(f.id), label: `${fd.emoji} ${fd.name} (${f.weight}kg)`, desc: `${fd.tier} fish`, details: `${fd.tier} | ${f.weight}kg` });
    }
    return out; // no global cap — the offer menu paginates per category (each up to 25)
}

// Items the accepter owns that satisfy a trade's WANT (type + optional tier).
function getMatchingItems(guildId, userId, wantType, wantTier) {
    return getOfferableItems(guildId, userId).filter(it => {
        if (it.type !== wantType) return false;
        if (!wantTier) return true;
        if (wantType === 'pet') { const t = petTier(db.prepare('SELECT petId FROM pets WHERE id = ?').get(parseInt(it.id))?.petId); return t === wantTier; }
        if (wantType === 'fish') { const t = fishTier(db.prepare('SELECT fishId FROM fish_inventory WHERE id = ?').get(parseInt(it.id))?.fishId); return t === wantTier; }
        if (wantType === 'relic') { const r = db.prepare('SELECT rarity FROM relics WHERE id = ?').get(parseInt(it.id)); return r && r.rarity === wantTier; }
        return true;
    });
}

// ==================== HELPER: expire old trades ====================
function expireTrades() {
    const cutoff = Date.now() - TRADE_EXPIRY_MS;
    const expiring = db.prepare('SELECT * FROM global_trades WHERE status = ? AND listedAt < ?').all('active', cutoff);
    for (const t of expiring) {
        transferItem(t.offerType, t.offerId, t.posterId, t.guildId); // return escrow
        db.prepare('UPDATE global_trades SET status = ? WHERE id = ?').run('expired', t.id);
    }
}

// ==================== CREATE TRADE ====================
function createTrade(guildId, userId, username, offerType, offerId, wantKey) {
    const want = getWantPreset(wantKey);
    if (!want) return { ok: false, error: '❌ Permintaan tidak valid!' };

    const active = db.prepare('SELECT COUNT(*) c FROM global_trades WHERE posterId = ? AND status = ?').get(userId, 'active').c;
    if (active >= MAX_TRADES) return { ok: false, error: `❌ Maksimal ${MAX_TRADES} trade aktif!` };

    let offerName = '';
    if (offerType === 'fish') {
        const f = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(offerId), guildId, userId);
        if (!f) return { ok: false, error: '❌ Ikan tidak ditemukan!' };
        const fd = FISH_DATA.find(x => x.id === f.fishId); offerName = fd ? `${fd.name} (${f.weight}kg)` : `Fish #${offerId}`;
    } else if (offerType === 'relic') {
        const r = db.prepare('SELECT * FROM relics WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(offerId), guildId, userId);
        if (!r) return { ok: false, error: '❌ Relic tidak ditemukan!' };
        if (r.equipped_pet_id > 0) return { ok: false, error: '❌ Relic sedang dipakai!' };
        offerName = `${r.name} [${r.rarity}] +${r.refine_level}`;
    } else if (offerType === 'pet') {
        const p = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ? AND active = 0').get(parseInt(offerId), guildId, userId);
        if (!p) return { ok: false, error: '❌ Pet tidak ditemukan atau masih aktif!' };
        const pd = PET_DATA.find(x => x.id === p.petId); offerName = pd ? `${pet_label(pd, p)}` : `Pet #${offerId}`;
    } else if (offerType === 'item') {
        const def = ITEMS.find(i => i.id === offerId);
        if (!def) return { ok: false, error: '❌ Item tidak ditemukan!' };
        const qty = db.prepare('SELECT quantity FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, offerId);
        if (!qty || qty.quantity < 1) return { ok: false, error: '❌ Kamu tidak punya item ini!' };
        offerName = `${def.emoji} ${def.name}`;
    } else {
        return { ok: false, error: '❌ Tipe item tidak valid!' };
    }

    // Escrow the offered item
    if (offerType === 'item') {
        const qty = db.prepare('SELECT quantity FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, offerId);
        const newQty = qty.quantity - 1;
        if (newQty <= 0) db.prepare('DELETE FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').run(guildId, userId, offerId);
        else db.prepare('UPDATE item_inventory SET quantity = ? WHERE guildId = ? AND userId = ? AND itemId = ?').run(newQty, guildId, userId, offerId);
        // For stackable items we escrow by recording a synthetic offer; store under ESCROW as a 1-qty row.
        const esc = db.prepare('SELECT quantity FROM item_inventory WHERE userId = ? AND itemId = ?').get(ESCROW_OWNER, offerId);
        if (esc) db.prepare('UPDATE item_inventory SET quantity = quantity + 1 WHERE userId = ? AND itemId = ?').run(ESCROW_OWNER, offerId);
        else db.prepare('INSERT INTO item_inventory (guildId, userId, itemId, quantity) VALUES (?, ?, ?, 1)').run(guildId, ESCROW_OWNER, offerId);
    } else {
        transferItem(offerType, offerId, ESCROW_OWNER, guildId);
    }

    const details = (getOfferableItems(guildId, userId).find(o => o.type === offerType && o.id === String(offerId)) || {}).details || '';
    db.prepare(`INSERT INTO global_trades (posterId, posterName, guildId, offerType, offerId, offerName, offerDetails, wantType, wantTier, wantAmount, listedAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`).run(
        userId, username, guildId, offerType, String(offerId), offerName, details,
        want.type, want.tier || '', want.amount || 0, Date.now()
    );
    return { ok: true, offerName, want };
}

function pet_label(pd, p) { return `${p.name} (${pd.name} Lv.${p.level})`; }

// ==================== ACCEPT TRADE ====================
// For money-want: accepter pays money, receives offered item.
// For item-want: accepter gives `giveItemId` (must match want type+tier), receives offered item.
function acceptTrade(guildId, accepterId, tradeId, giveItemId) {
    const t = db.prepare('SELECT * FROM global_trades WHERE id = ? AND status = ?').get(tradeId, 'active');
    if (!t) return { ok: false, error: '❌ Trade tidak ditemukan / sudah selesai!' };
    if (t.posterId === accepterId) return { ok: false, error: '❌ Tidak bisa menerima trade sendiri!' };

    if (t.wantType === 'money') {
        const acc = getOrCreateUser(guildId, accepterId);
        if (acc.balance < t.wantAmount) return { ok: false, error: `❌ Saldo kurang! Butuh 🪙 ${Number(t.wantAmount).toLocaleString('id-ID')}` };
        // accepter pays, poster receives (no tax — it's a direct trade)
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(t.wantAmount, guildId, accepterId);
        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(t.wantAmount, t.guildId, t.posterId);
        // give offered item to accepter
        if (t.offerType === 'item') giveEscrowItemTo(t, accepterId, guildId);
        else transferItem(t.offerType, t.offerId, accepterId, guildId);
    } else {
        // item-for-item: validate accepter's give item matches the want
        const match = getMatchingItems(guildId, accepterId, t.wantType, t.wantTier).find(m => m.id === String(giveItemId));
        if (!match) return { ok: false, error: '❌ Item yang kamu pilih tidak cocok dengan permintaan trade ini!' };
        // give accepter's item to poster
        if (t.wantType === 'item') {
            // move one unit from accepter to poster
            const q = db.prepare('SELECT quantity FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, accepterId, giveItemId);
            if (!q || q.quantity < 1) return { ok: false, error: '❌ Item sudah tidak ada!' };
            const nq = q.quantity - 1;
            if (nq <= 0) db.prepare('DELETE FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').run(guildId, accepterId, giveItemId);
            else db.prepare('UPDATE item_inventory SET quantity = ? WHERE guildId = ? AND userId = ? AND itemId = ?').run(nq, guildId, accepterId, giveItemId);
            transferItem('item', giveItemId, t.posterId, t.guildId);
        } else {
            transferItem(t.wantType, giveItemId, t.posterId, t.guildId);
        }
        // give poster's escrowed offer to accepter
        if (t.offerType === 'item') giveEscrowItemTo(t, accepterId, guildId);
        else transferItem(t.offerType, t.offerId, accepterId, guildId);
    }

    db.prepare('UPDATE global_trades SET status = ?, accepterId = ?, acceptedAt = ? WHERE id = ?').run('completed', accepterId, Date.now(), tradeId);
    return { ok: true, trade: t };
}

// Move one escrowed stackable item unit to a user (for offerType === 'item').
function giveEscrowItemTo(trade, toUserId, guildId) {
    const esc = db.prepare('SELECT quantity FROM item_inventory WHERE userId = ? AND itemId = ?').get(ESCROW_OWNER, trade.offerId);
    if (esc && esc.quantity > 1) db.prepare('UPDATE item_inventory SET quantity = quantity - 1 WHERE userId = ? AND itemId = ?').run(ESCROW_OWNER, trade.offerId);
    else db.prepare('DELETE FROM item_inventory WHERE userId = ? AND itemId = ?').run(ESCROW_OWNER, trade.offerId);
    transferItem('item', trade.offerId, toUserId, guildId);
}

// ==================== CANCEL TRADE ====================
function cancelTrade(userId, tradeId) {
    const t = db.prepare('SELECT * FROM global_trades WHERE id = ? AND posterId = ? AND status = ?').get(tradeId, userId, 'active');
    if (!t) return { ok: false, error: '❌ Trade tidak ditemukan!' };
    if (t.offerType === 'item') giveEscrowItemTo(t, userId, t.guildId);
    else transferItem(t.offerType, t.offerId, userId, t.guildId);
    db.prepare('UPDATE global_trades SET status = ? WHERE id = ?').run('cancelled', tradeId);
    return { ok: true, trade: t };
}

// ==================== BUILD: Main Panel ====================
function buildGlobalTradePanel(guildId, userId, username) {
    expireTrades();
    const totalActive = db.prepare('SELECT COUNT(*) c FROM global_trades WHERE status = ?').get('active').c;
    const mine = db.prepare('SELECT COUNT(*) c FROM global_trades WHERE posterId = ? AND status = ?').get(userId, 'active').c;
    const userData = getOrCreateUser(guildId, userId);

    const embed = new EmbedBuilder()
        .setTitle('🔄 GLOBAL TRADE BOARD')
        .setColor('#16A085')
        .setDescription(
            `Tukar item **lintas server**! Tawarkan item, minta money atau item lain.\n\n` +
            `> 📊 Trade aktif: **${totalActive}**\n` +
            `> 📦 Trade kamu: **${mine}**/${MAX_TRADES}\n` +
            `> 💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n\n` +
            `> 🔍 **Browse** — Lihat & terima trade dari semua server\n` +
            `> 📤 **Post** — Pasang penawaran trade kamu\n` +
            `> 📦 **My Trades** — Kelola trade kamu\n\n` +
            `⚠️ *Item ditahan (escrow) selama dipasang. Expired 5 hari → dikembalikan.*\n` +
            `✅ *Trade item-for-item BEBAS pajak (beda dari Global Market).*`
        )
        .setFooter({ text: '🔄 Global Trade — barter lintas server' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gt_browse_${userId}_0`).setLabel('🔍 Browse').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`gt_post_${userId}`).setLabel('📤 Post Trade').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`gt_mine_${userId}`).setLabel('📦 My Trades').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
}

// ==================== BUILD: Browse ====================
function buildTradeBrowse(guildId, userId, page) {
    expireTrades();
    const total = db.prepare('SELECT COUNT(*) c FROM global_trades WHERE status = ? AND posterId != ?').get('active', userId).c;
    const maxPage = Math.max(0, Math.ceil(total / TRADES_PER_PAGE) - 1);
    const safePage = Math.min(Math.max(0, page), maxPage);
    const trades = db.prepare('SELECT * FROM global_trades WHERE status = ? AND posterId != ? ORDER BY listedAt DESC LIMIT ? OFFSET ?')
        .all('active', userId, TRADES_PER_PAGE, safePage * TRADES_PER_PAGE);

    let desc = `**🔍 Trade tersedia** — ${total} aktif\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (trades.length === 0) desc += '📭 Belum ada trade dari player lain.\n';
    else for (const t of trades) {
        const oe = { fish: '🐟', relic: '💎', pet: '🐾', item: '📦' }[t.offerType] || '❓';
        const hrsLeft = Math.max(0, Math.floor((TRADE_EXPIRY_MS - (Date.now() - t.listedAt)) / 3600000));
        desc += `**#${t.id}** ${oe} **${t.offerName}**\n`;
        desc += `> 🔁 Minta: ${describeWant(t)}\n`;
        desc += `> 👤 ${t.posterName || 'Unknown'} | ⏱️ ${hrsLeft}h\n\n`;
    }
    desc += `━━━━━━━━━━━━━━━━━━━━━━\n📄 Page ${safePage + 1}/${maxPage + 1}`;

    const embed = new EmbedBuilder().setTitle('🔄 Global Trade — Browse').setColor('#3498DB').setDescription(desc)
        .setFooter({ text: 'Pilih trade untuk menerima' });

    const components = [];
    if (trades.length > 0) {
        const menu = new StringSelectMenuBuilder().setCustomId(`gt_accept_${userId}`).setPlaceholder('🤝 Pilih trade untuk diterima...').setMinValues(1).setMaxValues(1);
        trades.forEach(t => {
            const oe = { fish: '🐟', relic: '💎', pet: '🐾', item: '📦' }[t.offerType] || '❓';
            menu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`#${t.id} ${t.offerName}`.substring(0, 100))
                .setValue(String(t.id))
                .setDescription(`Minta: ${describeWant(t)}`.substring(0, 100))
                .setEmoji(oe));
        });
        components.push(new ActionRowBuilder().addComponents(menu));
    }
    components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gt_browse_${userId}_${Math.max(0, safePage - 1)}`).setLabel('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(safePage <= 0),
        new ButtonBuilder().setCustomId(`gt_browse_${userId}_${Math.min(maxPage, safePage + 1)}`).setLabel('➡️').setStyle(ButtonStyle.Secondary).setDisabled(safePage >= maxPage),
        new ButtonBuilder().setCustomId(`gt_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    ));
    return { embeds: [embed], components };
}

// ==================== BUILD: Post (choose offer item) ====================
const _GT_CATS = [
    { type: 'relic', emoji: '💎', name: 'Relic' },
    { type: 'pet', emoji: '🐾', name: 'Pet' },
    { type: 'item', emoji: '📦', name: 'Item' },
    { type: 'fish', emoji: '🐟', name: 'Fish' },
];

function buildPostOfferMenu(guildId, userId, category = null) {
    const allItems = getOfferableItems(guildId, userId);
    const mine = db.prepare('SELECT COUNT(*) c FROM global_trades WHERE posterId = ? AND status = ?').get(userId, 'active').c;
    const embed = new EmbedBuilder().setTitle('📤 Post Trade — Pilih Item Ditawarkan').setColor('#2ECC71')
        .setFooter({ text: `Trade kamu: ${mine}/${MAX_TRADES}` });

    if (mine >= MAX_TRADES) {
        embed.setDescription(`❌ Sudah mencapai batas **${MAX_TRADES}** trade aktif. Batalkan dulu yang lama.`);
        return { embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gt_mine_${userId}`).setLabel('📦 My Trades').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`gt_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary))] };
    }
    if (allItems.length === 0) {
        embed.setDescription('📭 Tidak ada item yang bisa ditawarkan.\n\n> Relic (tidak dipakai), Pet (non-aktif), Item, atau Fish Rare+.');
        return { embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gt_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary))] };
    }

    // Count items per category.
    const counts = {};
    for (const it of allItems) counts[it.type] = (counts[it.type] || 0) + 1;
    const availableCats = _GT_CATS.filter(c => counts[c.type] > 0);

    // Step 1: choose a category (unless one was selected). This is what lets us
    // show far more than Discord's 25-option-per-menu limit.
    if (!category || !counts[category]) {
        embed.setDescription('Pilih **kategori** item yang ingin kamu tawarkan:');
        const catMenu = new StringSelectMenuBuilder().setCustomId(`gt_offercat_${userId}`).setPlaceholder('🗂️ Pilih kategori...').setMinValues(1).setMaxValues(1);
        availableCats.forEach(c => catMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${c.name} (${counts[c.type]})`).setValue(c.type).setEmoji(c.emoji)));
        return { embeds: [embed], components: [
            new ActionRowBuilder().addComponents(catMenu),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gt_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)),
        ] };
    }

    // Step 2: list items within the chosen category (up to 25).
    const catDef = _GT_CATS.find(c => c.type === category) || { emoji: '📦', name: category };
    const items = allItems.filter(it => it.type === category).slice(0, 25);
    embed.setDescription(`${catDef.emoji} **${catDef.name}** — pilih item yang ingin kamu **tawarkan**:` + (counts[category] > 25 ? `\n-# Menampilkan 25 dari ${counts[category]} (lebur/jual sisanya agar muncul).` : ''));
    const menu = new StringSelectMenuBuilder().setCustomId(`gt_offer_${userId}`).setPlaceholder(`${catDef.emoji} Pilih ${catDef.name} ditawarkan...`).setMinValues(1).setMaxValues(1);
    items.forEach(it => menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(it.label.substring(0, 100)).setValue(`${it.type}:${it.id}`.substring(0, 100)).setDescription((it.desc || '').substring(0, 100))));
    return { embeds: [embed], components: [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gt_post_${userId}`).setLabel('🗂️ Ganti Kategori').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`gt_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)),
    ] };
}

// ==================== BUILD: Post (choose what you want) ====================
function buildPostWantMenu(userId, offerType, offerId) {
    const embed = new EmbedBuilder().setTitle('📤 Post Trade — Pilih Permintaan').setColor('#2ECC71')
        .setDescription('Pilih **apa yang kamu inginkan** sebagai gantinya:');
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`gt_want_${offerType}_${offerId}_${userId}`)
        .setPlaceholder('🔁 Pilih permintaan...').setMinValues(1).setMaxValues(1);
    WANT_PRESETS.forEach(w => menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(w.label.substring(0, 100)).setValue(w.key)));
    return { embeds: [embed], components: [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gt_post_${userId}`).setLabel('🔙 Pilih item lain').setStyle(ButtonStyle.Secondary)),
    ] };
}

// ==================== BUILD: My Trades ====================
function buildMyTrades(userId) {
    const trades = db.prepare('SELECT * FROM global_trades WHERE posterId = ? AND status = ? ORDER BY listedAt DESC').all(userId, 'active');
    let desc = '━━━━━━━━━━━━━━━━━━━━━━\n';
    if (trades.length === 0) desc += '\n📭 Kamu belum punya trade aktif.\n';
    else for (const t of trades) {
        const oe = { fish: '🐟', relic: '💎', pet: '🐾', item: '📦' }[t.offerType] || '❓';
        desc += `> **#${t.id}** ${oe} **${t.offerName}** → 🔁 ${describeWant(t)}\n`;
    }
    desc += '━━━━━━━━━━━━━━━━━━━━━━';
    const embed = new EmbedBuilder().setTitle('📦 My Global Trades').setColor('#9B59B6').setDescription(desc).setFooter({ text: 'Pilih untuk membatalkan' });
    const components = [];
    if (trades.length > 0) {
        const menu = new StringSelectMenuBuilder().setCustomId(`gt_cancel_${userId}`).setPlaceholder('❌ Pilih trade untuk dibatalkan...').setMinValues(1).setMaxValues(1);
        trades.forEach(t => menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`#${t.id} ${t.offerName}`.substring(0, 100)).setValue(String(t.id)).setDescription(`Minta: ${describeWant(t)}`.substring(0, 100))));
        components.push(new ActionRowBuilder().addComponents(menu));
    }
    components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gt_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)));
    return { embeds: [embed], components };
}

// ==================== BUILD: Accept (item-want -> pick item to give) ====================
function buildAcceptGiveMenu(guildId, userId, tradeId) {
    const t = db.prepare('SELECT * FROM global_trades WHERE id = ? AND status = ?').get(tradeId, 'active');
    if (!t) return { embeds: [new EmbedBuilder().setTitle('🔄 Trade').setColor('#E74C3C').setDescription('❌ Trade sudah tidak tersedia.')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gt_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary))] };
    const matches = getMatchingItems(guildId, userId, t.wantType, t.wantTier);
    const embed = new EmbedBuilder().setTitle('🤝 Terima Trade — Pilih Item Diberikan').setColor('#F1C40F')
        .setDescription(`Trade **#${t.id}**: dapat **${t.offerName}**\nMinta: ${describeWant(t)}\n\nPilih item milikmu yang cocok untuk diberikan:`);
    if (matches.length === 0) {
        embed.setDescription(`❌ Kamu tidak punya item yang cocok (${describeWant(t)}) untuk trade ini.`);
        return { embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gt_browse_${userId}_0`).setLabel('🔙 Browse').setStyle(ButtonStyle.Secondary))] };
    }
    const menu = new StringSelectMenuBuilder().setCustomId(`gt_give_${tradeId}_${userId}`).setPlaceholder('🎁 Pilih item untuk diberikan...').setMinValues(1).setMaxValues(1);
    matches.forEach(m => menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(m.label.substring(0, 100)).setValue(m.id).setDescription((m.desc || '').substring(0, 100))));
    return { embeds: [embed], components: [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gt_browse_${userId}_0`).setLabel('🔙 Browse').setStyle(ButtonStyle.Secondary)),
    ] };
}

// ==================== DETECTORS ====================
function isGlobalTradeButton(customId) {
    return customId.startsWith('gt_') && !isGlobalTradeSelect(customId);
}
function isGlobalTradeSelect(customId) {
    return customId.startsWith('gt_accept_') || customId.startsWith('gt_offer_') || customId.startsWith('gt_offercat_') || customId.startsWith('gt_want_')
        || customId.startsWith('gt_cancel_') || customId.startsWith('gt_give_');
}

module.exports = {
    WANT_PRESETS, getWantPreset, describeWant,
    createTrade, acceptTrade, cancelTrade, expireTrades,
    getOfferableItems, getMatchingItems,
    buildGlobalTradePanel, buildTradeBrowse, buildPostOfferMenu, buildPostWantMenu, buildMyTrades, buildAcceptGiveMenu,
    handleGlobalTradeButton, handleGlobalTradeSelect,
    isGlobalTradeButton, isGlobalTradeSelect,
};

// ==================== HANDLER: Buttons ====================
async function handleGlobalTradeButton(interaction) {
    const guildId = interaction.guild.id;
    const parts = interaction.customId.split('_'); // gt_<action>_<userId>[_<page>]
    const action = parts[1];
    // userId: for gt_browse_<userId>_<page> it's parts[2]; for others it's parts[2] too.
    const userId = parts[2];
    if (!userId || interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    if (action === 'main') return interaction.update(buildGlobalTradePanel(guildId, userId, interaction.user.username));
    if (action === 'browse') return interaction.update(buildTradeBrowse(guildId, userId, parseInt(parts[3]) || 0));
    if (action === 'post') return interaction.update(buildPostOfferMenu(guildId, userId));
    if (action === 'mine') return interaction.update(buildMyTrades(userId));
}

// ==================== HANDLER: Select menus ====================
async function handleGlobalTradeSelect(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;

    // gt_offercat_<userId> -> chose a category, show items in it
    if (customId.startsWith('gt_offercat_')) {
        const userId = customId.split('_').pop();
        if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan panel kamu!', ephemeral: true });
        return interaction.update(buildPostOfferMenu(guildId, userId, interaction.values[0]));
    }

    // gt_offer_<userId>  -> chose offer item, ask what they want
    if (customId.startsWith('gt_offer_')) {
        const userId = customId.split('_').pop();
        if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan panel kamu!', ephemeral: true });
        const [offerType, offerId] = interaction.values[0].split(':');
        return interaction.update(buildPostWantMenu(userId, offerType, offerId));
    }

    // gt_want_<offerType>_<offerId>_<userId> -> create the trade
    if (customId.startsWith('gt_want_')) {
        const p = customId.split('_'); // gt, want, offerType, offerId, userId
        const userId = p[p.length - 1];
        if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan panel kamu!', ephemeral: true });
        const offerType = p[2];
        const offerId = p.slice(3, p.length - 1).join('_'); // item ids may contain underscores
        const wantKey = interaction.values[0];
        const res = createTrade(guildId, userId, interaction.user.username, offerType, offerId, wantKey);
        if (!res.ok) return interaction.reply({ content: res.error, ephemeral: true });
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('✅ Trade Diposting!')
            .setDescription(`> 📤 Menawarkan: **${res.offerName}**\n> 🔁 Meminta: ${res.want.label}\n\n🌍 Semua server bisa melihat & menerima trade ini!`);
        return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`gt_post_${userId}`).setLabel('📤 Post Lagi').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`gt_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary),
        )] });
    }

    // gt_accept_<userId> -> chose a trade to accept
    if (customId.startsWith('gt_accept_')) {
        const userId = customId.split('_').pop();
        if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan panel kamu!', ephemeral: true });
        const tradeId = parseInt(interaction.values[0]);
        const t = db.prepare('SELECT * FROM global_trades WHERE id = ? AND status = ?').get(tradeId, 'active');
        if (!t) return interaction.reply({ content: '❌ Trade sudah tidak tersedia!', ephemeral: true });
        if (t.posterId === userId) return interaction.reply({ content: '❌ Tidak bisa menerima trade sendiri!', ephemeral: true });

        if (t.wantType === 'money') {
            // execute immediately (with balance check inside)
            const res = acceptTrade(guildId, userId, tradeId, null);
            if (!res.ok) return interaction.reply({ content: res.error, ephemeral: true });
            const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('🤝 Trade Berhasil!')
                .setDescription(`Kamu membayar ${describeWant(t)} dan menerima **${t.offerName}**!\n\nItem sudah masuk inventory kamu.`);
            return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`gt_browse_${userId}_0`).setLabel('🔍 Browse Lagi').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`gt_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary),
            )] });
        }
        // item-want: show menu to pick the item to give
        return interaction.update(buildAcceptGiveMenu(guildId, userId, tradeId));
    }

    // gt_give_<tradeId>_<userId> -> execute item-for-item trade
    if (customId.startsWith('gt_give_')) {
        const p = customId.split('_'); // gt, give, tradeId, userId
        const userId = p[p.length - 1];
        if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan panel kamu!', ephemeral: true });
        const tradeId = parseInt(p[2]);
        const giveItemId = interaction.values[0];
        const res = acceptTrade(guildId, userId, tradeId, giveItemId);
        if (!res.ok) return interaction.reply({ content: res.error, ephemeral: true });
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('🤝 Trade Berhasil!')
            .setDescription(`Barter selesai! Kamu menerima **${res.trade.offerName}**.\n\nItem sudah masuk inventory kamu.`);
        return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`gt_browse_${userId}_0`).setLabel('🔍 Browse Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`gt_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary),
        )] });
    }

    // gt_cancel_<userId> -> cancel one of my trades
    if (customId.startsWith('gt_cancel_')) {
        const userId = customId.split('_').pop();
        if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan panel kamu!', ephemeral: true });
        const tradeId = parseInt(interaction.values[0]);
        const res = cancelTrade(userId, tradeId);
        if (!res.ok) return interaction.reply({ content: res.error, ephemeral: true });
        const embed = new EmbedBuilder().setColor('#E74C3C').setTitle('❌ Trade Dibatalkan')
            .setDescription(`Trade **#${tradeId}** — **${res.trade.offerName}** dibatalkan. Item dikembalikan.`);
        return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`gt_mine_${userId}`).setLabel('📦 My Trades').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`gt_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary),
        )] });
    }
}
