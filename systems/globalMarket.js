// systems/globalMarket.js — Global Marketplace (cross-server trading)
// All players across all servers can buy/sell here. Uses the same market_listings table
// but without guildId filtering — truly global visibility.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser, addItem, removeItem, getItemCount } = require('../database');
const { FISH_DATA } = require('../data/fish');
const { PET_DATA } = require('../data/pets');
const { ITEMS } = require('../data/items');
const state = require('../state');

// ==================== CONSTANTS ====================
const GLOBAL_LISTING_EXPIRY_MS = 5 * 24 * 60 * 60 * 1000; // 5 days (shorter than server market)
const MAX_GLOBAL_LISTINGS = 5; // Per user
const LISTINGS_PER_PAGE = 8;
const GLOBAL_TAX_RATE = 0.05; // 5% tax on global sales

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS global_market (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sellerId TEXT,
    sellerName TEXT,
    guildId TEXT,
    itemType TEXT,
    itemId TEXT,
    itemName TEXT,
    itemDetails TEXT DEFAULT '',
    price INTEGER,
    listedAt INTEGER,
    status TEXT DEFAULT 'active',
    buyerId TEXT DEFAULT NULL,
    boughtAt INTEGER DEFAULT NULL
)`);

// ==================== HELPER: Expire old listings ====================
function expireGlobalListings() {
    const cutoff = Date.now() - GLOBAL_LISTING_EXPIRY_MS;
    const expiring = db.prepare('SELECT * FROM global_market WHERE status = ? AND listedAt < ?').all('active', cutoff);
    for (const listing of expiring) {
        returnGlobalItem(listing, listing.sellerId, listing.guildId);
        db.prepare('UPDATE global_market SET status = ? WHERE id = ?').run('expired', listing.id);
    }
}

// ==================== HELPER: Return item to owner ====================
function returnGlobalItem(listing, toUserId, guildId) {
    if (listing.itemType === 'fish') {
        db.prepare('UPDATE fish_inventory SET userId = ? WHERE id = ?').run(toUserId, parseInt(listing.itemId));
    } else if (listing.itemType === 'relic') {
        db.prepare('UPDATE relics SET userId = ?, equipped_pet_id = 0 WHERE id = ?').run(toUserId, parseInt(listing.itemId));
    } else if (listing.itemType === 'pet') {
        db.prepare('UPDATE pets SET userId = ?, active = 0 WHERE id = ?').run(toUserId, parseInt(listing.itemId));
    } else if (listing.itemType === 'item') {
        const existing = db.prepare('SELECT quantity FROM item_inventory WHERE userId = ? AND itemId = ?').get(toUserId, listing.itemId);
        if (existing) db.prepare('UPDATE item_inventory SET quantity = quantity + 1 WHERE userId = ? AND itemId = ?').run(toUserId, listing.itemId);
        else db.prepare('INSERT INTO item_inventory (guildId, userId, itemId, quantity) VALUES (?, ?, ?, 1)').run(guildId, toUserId, listing.itemId);
    }
}

// ==================== HELPER: Get sellable items ====================
function getGlobalSellableItems(guildId, userId) {
    const out = [];

    // Relics
    const relics = db.prepare('SELECT * FROM relics WHERE guildId = ? AND userId = ?').all(guildId, userId);
    for (const r of relics) {
        if (r.equipped_pet_id > 0) continue; // Skip equipped relics
        out.push({ type: 'relic', id: String(r.id), label: `💎 ${r.name} [${r.rarity}] +${r.refine_level}`, desc: `+${r.stat_value} ${r.stat_type}`, details: `${r.rarity} | +${r.stat_value} ${r.stat_type} | Refine +${r.refine_level}` });
    }

    // Pets (non-active only)
    const pets = db.prepare('SELECT * FROM pets WHERE guildId = ? AND userId = ? AND active = 0').all(guildId, userId);
    for (const p of pets) {
        const pd = PET_DATA.find(x => x.id === p.petId);
        out.push({ type: 'pet', id: String(p.id), label: `${pd ? pd.emoji : '🐾'} ${p.name} (Lv.${p.level})`, desc: `${pd ? pd.tier : '?'} | ATK:${p.atk} DEF:${p.def}`, details: `${pd ? pd.tier : '?'} | Lv.${p.level} | ATK:${p.atk} DEF:${p.def} HP:${p.hp}` });
    }

    // Items (high value only for global market)
    const inv = db.prepare('SELECT * FROM item_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, userId);
    for (const it of inv) {
        const def = ITEMS.find(x => x.id === it.itemId);
        if (def) out.push({ type: 'item', id: it.itemId, label: `${def.emoji} ${def.name} (x${it.quantity})`, desc: def.desc.substring(0, 50), details: def.desc });
    }

    // Fish (rare+ only, not locked)
    const fish = db.prepare("SELECT fi.*, fc.fishId as fishType FROM fish_inventory fi LEFT JOIN fish_collection fc ON fi.fishId = fc.fishId WHERE fi.userId = ? AND fi.locked = 0 ORDER BY fi.weight DESC LIMIT 20").all(userId);
    for (const f of fish) {
        const fd = FISH_DATA.find(x => x.id === f.fishId);
        if (!fd) continue;
        // Only allow Rare+ fish on global market
        const rareTiers = ['Rare', 'Epic', 'Legendary', 'Mythic', 'Secret'];
        if (!rareTiers.includes(fd.tier)) continue;
        out.push({ type: 'fish', id: String(f.id), label: `${fd.emoji} ${fd.name} (${f.weight}kg)`, desc: `${fd.tier} fish`, details: `${fd.tier} | ${f.weight}kg` });
    }

    return out.slice(0, 25); // Discord limit
}

// ==================== BUILD: Global Market Panel ====================
function buildGlobalMarketPanel(guildId, userId, username) {
    expireGlobalListings();

    const totalActive = db.prepare('SELECT COUNT(*) as cnt FROM global_market WHERE status = ?').get('active').cnt;
    const myListings = db.prepare('SELECT COUNT(*) as cnt FROM global_market WHERE sellerId = ? AND status = ?').get(userId, 'active').cnt;
    const userData = getOrCreateUser(guildId, userId);
    const totalSold = db.prepare('SELECT COUNT(*) as cnt FROM global_market WHERE sellerId = ? AND status = ?').get(userId, 'sold').cnt;
    const totalBought = db.prepare('SELECT COUNT(*) as cnt FROM global_market WHERE buyerId = ? AND status = ?').get(userId, 'sold').cnt;

    const embed = new EmbedBuilder()
        .setTitle('🌍 GLOBAL MARKETPLACE')
        .setColor('#FF6B00')
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Jual & beli item **lintas server**!\n` +
            `Semua player dari semua server bisa melihat listing kamu.\n\n` +
            `> 📊 Total Listings: **${totalActive}** aktif\n` +
            `> 📦 Listing Kamu: **${myListings}**/${MAX_GLOBAL_LISTINGS}\n` +
            `> 💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n` +
            `> 📈 Stats: ${totalSold} sold | ${totalBought} bought\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `> 🛒 **Browse** — Lihat semua listing global\n` +
            `> 📤 **Sell** — Jual item ke pasar global\n` +
            `> 📦 **My Listings** — Kelola listing kamu\n\n` +
            `⚠️ *Tax 5% dari harga jual | Expired setelah 5 hari*\n` +
            `⚠️ *Hanya item Rare+ (fish) bisa dijual global*`
        )
        .setFooter({ text: '🌍 Global Market — Visible to all servers' })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gm_browse_${userId}_0`).setLabel('🛒 Browse All').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`gm_browse_fish_${userId}_0`).setLabel('🐟 Fish').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gm_browse_pet_${userId}_0`).setLabel('🐾 Pet').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gm_browse_relic_${userId}_0`).setLabel('💎 Relic').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gm_browse_item_${userId}_0`).setLabel('📦 Item').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gm_sell_${userId}`).setLabel('📤 Sell').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`gm_mylist_${userId}`).setLabel('📦 My Listings').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`gm_history_${userId}`).setLabel('📜 History').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2] };
}

// ==================== BUILD: Browse Page ====================
function buildGlobalBrowse(guildId, userId, filter, page) {
    expireGlobalListings();

    let query = 'SELECT * FROM global_market WHERE status = ? AND sellerId != ?';
    const params = ['active', userId];
    if (filter && filter !== 'all') {
        query += ' AND itemType = ?';
        params.push(filter);
    }
    
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as cnt');
    const total = db.prepare(countQuery).get(...params).cnt;
    const maxPage = Math.max(0, Math.ceil(total / LISTINGS_PER_PAGE) - 1);
    const safePage = Math.min(Math.max(0, page), maxPage);

    query += ' ORDER BY listedAt DESC LIMIT ? OFFSET ?';
    params.push(LISTINGS_PER_PAGE, safePage * LISTINGS_PER_PAGE);
    const listings = db.prepare(query).all(...params);

    const filterLabel = { all: '🌍 All', fish: '🐟 Fish', pet: '🐾 Pet', relic: '💎 Relic', item: '📦 Item' }[filter || 'all'] || '🌍 All';

    let desc = `**${filterLabel}** — ${total} listing\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (listings.length === 0) {
        desc += '📭 Tidak ada listing untuk kategori ini.\n';
    } else {
        for (const l of listings) {
            const typeEmoji = { fish: '🐟', relic: '💎', pet: '🐾', item: '📦' }[l.itemType] || '❓';
            const timeLeft = Math.max(0, Math.floor((GLOBAL_LISTING_EXPIRY_MS - (Date.now() - l.listedAt)) / 3600000));
            desc += `**#${l.id}** ${typeEmoji} **${l.itemName}**\n`;
            desc += `> 🪙 ${l.price.toLocaleString('id-ID')} | ⏱️ ${timeLeft}h | 👤 ${l.sellerName || 'Unknown'}\n`;
            if (l.itemDetails) desc += `> 📋 *${l.itemDetails}*\n`;
            desc += `\n`;
        }
    }
    desc += `━━━━━━━━━━━━━━━━━━━━━━\n📄 Page ${safePage + 1}/${maxPage + 1}`;

    const embed = new EmbedBuilder()
        .setTitle(`🌍 Global Market — Browse`)
        .setColor('#3498DB')
        .setDescription(desc)
        .setFooter({ text: 'Pilih listing untuk membeli' });

    const components = [];

    if (listings.length > 0) {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`gm_buyselect_${userId}`)
            .setPlaceholder('🛒 Pilih listing untuk dibeli...')
            .setMinValues(1).setMaxValues(1);
        listings.forEach(l => {
            const typeEmoji = { fish: '🐟', relic: '💎', pet: '🐾', item: '📦' }[l.itemType] || '❓';
            menu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`#${l.id} ${l.itemName}`.substring(0, 100))
                .setValue(String(l.id))
                .setDescription(`🪙 ${l.price.toLocaleString('id-ID')} | ${l.itemDetails || l.itemType}`.substring(0, 100))
                .setEmoji(typeEmoji));
        });
        components.push(new ActionRowBuilder().addComponents(menu));
    }

    const filterPrefix = filter || 'all';
    const prevPage = Math.max(0, safePage - 1);
    const nextPage = Math.min(maxPage, safePage + 1);
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gm_browse_${filterPrefix}_${userId}_${prevPage}`).setLabel('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(safePage <= 0),
        new ButtonBuilder().setCustomId(`gm_browsenxt_${filterPrefix}_${userId}_${nextPage}`).setLabel('➡️').setStyle(ButtonStyle.Secondary).setDisabled(safePage >= maxPage),
        new ButtonBuilder().setCustomId(`gm_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );
    components.push(navRow);

    return { embeds: [embed], components };
}

// ==================== BUILD: Sell Menu ====================
function buildGlobalSellMenu(guildId, userId) {
    const items = getGlobalSellableItems(guildId, userId);
    const myListings = db.prepare('SELECT COUNT(*) as cnt FROM global_market WHERE sellerId = ? AND status = ?').get(userId, 'active').cnt;

    const embed = new EmbedBuilder()
        .setTitle('📤 Global Market — Sell')
        .setColor('#2ECC71')
        .setFooter({ text: `Listing kamu: ${myListings}/${MAX_GLOBAL_LISTINGS} | Tax: 5%` });

    if (myListings >= MAX_GLOBAL_LISTINGS) {
        embed.setDescription(`❌ Kamu sudah mencapai batas **${MAX_GLOBAL_LISTINGS}** listing aktif!\n\nBatalkan listing lama untuk bisa menjual lagi.`);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`gm_mylist_${userId}`).setLabel('📦 My Listings').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`gm_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return { embeds: [embed], components: [row] };
    }

    if (items.length === 0) {
        embed.setDescription('📭 Tidak ada item yang bisa dijual di Global Market.\n\n> Yang bisa dijual:\n> 💎 Relic (tidak equipped)\n> 🐾 Pet (non-aktif)\n> 📦 Item game\n> 🐟 Fish (Rare+ tier, tidak terkunci)');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`gm_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return { embeds: [embed], components: [row] };
    }

    embed.setDescription(`Pilih item yang ingin dijual ke **Global Market**:\n\n> ⚠️ Tax 5% dikenakan saat item terjual\n> ⚠️ Hanya fish tier **Rare+** yang bisa dijual global\n> ⚠️ Pet aktif tidak bisa dijual`);

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`gm_sellitem_${userId}`)
        .setPlaceholder('📤 Pilih item untuk dijual...')
        .setMinValues(1).setMaxValues(1);

    items.forEach(it => {
        menu.addOptions(new StringSelectMenuOptionBuilder()
            .setLabel(it.label.substring(0, 100))
            .setValue(`${it.type}:${it.id}`.substring(0, 100))
            .setDescription((it.desc || '').substring(0, 100)));
    });

    const components = [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`gm_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        )
    ];
    return { embeds: [embed], components };
}

// ==================== BUILD: My Listings ====================
function buildGlobalMyListings(userId) {
    const listings = db.prepare('SELECT * FROM global_market WHERE sellerId = ? AND status = ? ORDER BY listedAt DESC').all(userId, 'active');

    let desc = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (listings.length === 0) {
        desc += '\n📭 Kamu belum punya listing global aktif.\n';
    } else {
        for (const l of listings) {
            const typeEmoji = { fish: '🐟', relic: '💎', pet: '🐾', item: '📦' }[l.itemType] || '❓';
            const timeLeft = Math.max(0, Math.floor((GLOBAL_LISTING_EXPIRY_MS - (Date.now() - l.listedAt)) / 3600000));
            desc += `> **#${l.id}** ${typeEmoji} **${l.itemName}**\n`;
            desc += `>   🪙 ${l.price.toLocaleString('id-ID')} | ⏱️ ${timeLeft}h left\n\n`;
        }
    }
    desc += `━━━━━━━━━━━━━━━━━━━━━━`;

    const embed = new EmbedBuilder()
        .setTitle('📦 My Global Listings')
        .setColor('#9B59B6')
        .setDescription(desc)
        .setFooter({ text: 'Pilih listing untuk dibatalkan' });

    const components = [];
    if (listings.length > 0) {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`gm_cancelselect_${userId}`)
            .setPlaceholder('❌ Pilih listing untuk dibatalkan...')
            .setMinValues(1).setMaxValues(1);
        listings.forEach(l => {
            menu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`#${l.id} ${l.itemName}`.substring(0, 100))
                .setValue(String(l.id))
                .setDescription(`🪙 ${l.price.toLocaleString('id-ID')}`.substring(0, 100)));
        });
        components.push(new ActionRowBuilder().addComponents(menu));
    }
    components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gm_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    ));

    return { embeds: [embed], components };
}

// ==================== BUILD: History ====================
function buildGlobalHistory(userId) {
    const sold = db.prepare('SELECT * FROM global_market WHERE sellerId = ? AND status = ? ORDER BY boughtAt DESC LIMIT 5').all(userId, 'sold');
    const bought = db.prepare('SELECT * FROM global_market WHERE buyerId = ? AND status = ? ORDER BY boughtAt DESC LIMIT 5').all(userId, 'sold');

    let desc = '**📤 Terjual Terakhir:**\n';
    if (sold.length === 0) desc += '> *Belum ada*\n';
    else sold.forEach(l => { desc += `> ${l.itemName} — 🪙 ${l.price.toLocaleString('id-ID')} (tax: -${Math.floor(l.price * GLOBAL_TAX_RATE).toLocaleString('id-ID')})\n`; });

    desc += '\n**🛒 Dibeli Terakhir:**\n';
    if (bought.length === 0) desc += '> *Belum ada*\n';
    else bought.forEach(l => { desc += `> ${l.itemName} — 🪙 ${l.price.toLocaleString('id-ID')} dari ${l.sellerName || 'Unknown'}\n`; });

    const embed = new EmbedBuilder()
        .setTitle('📜 Global Market History')
        .setColor('#F39C12')
        .setDescription(desc);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gm_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
}

// ==================== CREATE LISTING ====================
function createGlobalListing(guildId, userId, username, itemType, itemId, price, details) {
    let itemName = '';

    if (itemType === 'fish') {
        const fish = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(itemId), guildId, userId);
        if (!fish) return { ok: false, error: '❌ Ikan tidak ditemukan!' };
        const fd = FISH_DATA.find(f => f.id === fish.fishId);
        itemName = fd ? `${fd.name} (${fish.weight}kg)` : `Fish #${itemId}`;
        db.prepare("UPDATE fish_inventory SET userId = 'GLOBAL_MARKET' WHERE id = ? AND guildId = ?").run(parseInt(itemId), guildId);
    } else if (itemType === 'relic') {
        const relic = db.prepare('SELECT * FROM relics WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(itemId), guildId, userId);
        if (!relic) return { ok: false, error: '❌ Relic tidak ditemukan!' };
        itemName = `${relic.name} [${relic.rarity}] +${relic.refine_level}`;
        db.prepare("UPDATE relics SET userId = 'GLOBAL_MARKET', equipped_pet_id = 0 WHERE id = ? AND guildId = ?").run(parseInt(itemId), guildId);
    } else if (itemType === 'pet') {
        const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ? AND active = 0').get(parseInt(itemId), guildId, userId);
        if (!pet) return { ok: false, error: '❌ Pet tidak ditemukan atau masih aktif!' };
        const pd = PET_DATA.find(p => p.id === pet.petId);
        itemName = pd ? `${pet.name} (${pd.name} Lv.${pet.level})` : `Pet #${itemId}`;
        db.prepare("UPDATE pets SET userId = 'GLOBAL_MARKET', active = 0 WHERE id = ? AND guildId = ?").run(parseInt(itemId), guildId);
    } else if (itemType === 'item') {
        const def = ITEMS.find(i => i.id === itemId);
        if (!def) return { ok: false, error: '❌ Item tidak ditemukan!' };
        const qty = db.prepare('SELECT quantity FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, itemId);
        if (!qty || qty.quantity < 1) return { ok: false, error: '❌ Kamu tidak punya item ini!' };
        itemName = `${def.emoji} ${def.name}`;
        const newQty = qty.quantity - 1;
        if (newQty <= 0) db.prepare('DELETE FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').run(guildId, userId, itemId);
        else db.prepare('UPDATE item_inventory SET quantity = ? WHERE guildId = ? AND userId = ? AND itemId = ?').run(newQty, guildId, userId, itemId);
    }

    db.prepare('INSERT INTO global_market (sellerId, sellerName, guildId, itemType, itemId, itemName, itemDetails, price, listedAt, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        userId, username, guildId, itemType, itemId, itemName, details || '', price, Date.now(), 'active'
    );

    return { ok: true, itemName };
}

// ==================== EXECUTE PURCHASE ====================
function executeGlobalPurchase(guildId, userId, listingId) {
    try {
        let listing, tax, sellerReceives;
        const runTx = db.transaction(() => {
            listing = db.prepare('SELECT * FROM global_market WHERE id = ? AND status = ?').get(listingId, 'active');
            if (!listing) throw new Error('NOT_ACTIVE');
            if (listing.sellerId === userId) throw new Error('SELF_BUY');

            // Safe balance check & atomic deduction
            const { subtractUserBalance, addUserBalance } = require('../database');
            if (!subtractUserBalance(guildId, userId, listing.price)) {
                throw new Error('INSUFFICIENT_BALANCE');
            }

            // Pay seller (minus tax)
            tax = Math.floor(listing.price * GLOBAL_TAX_RATE);
            sellerReceives = listing.price - tax;
            addUserBalance(listing.guildId, listing.sellerId, sellerReceives);

            // Transfer item to buyer
            returnGlobalItem(listing, userId, guildId);

            // Mark as sold
            db.prepare('UPDATE global_market SET status = ?, buyerId = ?, boughtAt = ? WHERE id = ?').run('sold', userId, Date.now(), listingId);
        });
        runTx();
        return { ok: true, listing, tax, sellerReceives };
    } catch (e) {
        if (e.message === 'NOT_ACTIVE') return { ok: false, error: '❌ Listing tidak ditemukan atau sudah tidak aktif!' };
        if (e.message === 'SELF_BUY') return { ok: false, error: '❌ Tidak bisa membeli listing sendiri!' };
        if (e.message === 'INSUFFICIENT_BALANCE') {
            const bal = getOrCreateUser(guildId, userId).balance;
            return { ok: false, error: "❌ Saldo kurang! Kamu punya 🪙 " + bal.toLocaleString('id-ID') + ", butuh 🪙 " + listing.price.toLocaleString('id-ID') };
        }
        return { ok: false, error: "❌ Gagal memproses pembelian global: " + e.message };
    }
}

// ==================== HANDLER: Button Clicks ====================
async function handleGlobalMarketButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');

    // gm_ACTION_..._USERID_...
    // Find userId (always second to last or last depending on format)
    let action, userId, extra;

    if (parts[1] === 'main') {
        userId = parts[2];
        action = 'main';
    } else if (parts[1] === 'sell') {
        userId = parts[2];
        action = 'sell';
    } else if (parts[1] === 'mylist') {
        userId = parts[2];
        action = 'mylist';
    } else if (parts[1] === 'history') {
        userId = parts[2];
        action = 'history';
    } else if (parts[1] === 'browse') {
        // gm_browse_FILTER_USERID_PAGE or gm_browse_USERID_PAGE
        if (parts.length === 5) {
            // gm_browse_filter_userId_page
            action = 'browse';
            const filter = parts[2];
            userId = parts[3];
            extra = { filter, page: parseInt(parts[4]) || 0 };
        } else if (parts.length === 4) {
            // gm_browse_userId_page (all)
            action = 'browse';
            userId = parts[2];
            extra = { filter: 'all', page: parseInt(parts[3]) || 0 };
        }
    } else if (parts[1] === 'browsenxt') {
        // gm_browsenxt_filter_userId_page (next page button)
        action = 'browse';
        const filter = parts[2];
        userId = parts[3];
        extra = { filter, page: parseInt(parts[4]) || 0 };
    } else if (parts[1] === 'buyconfirm') {
        // gm_buyconfirm_userId_listingId
        action = 'buyconfirm';
        userId = parts[2];
        extra = { listingId: parseInt(parts[3]) };
    }

    if (!userId || interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    if (action === 'main') {
        return interaction.update(buildGlobalMarketPanel(guildId, userId, interaction.user.username));
    }

    if (action === 'browse') {
        return interaction.update(buildGlobalBrowse(guildId, userId, extra.filter, extra.page));
    }

    if (action === 'sell') {
        return interaction.update(buildGlobalSellMenu(guildId, userId));
    }

    if (action === 'mylist') {
        return interaction.update(buildGlobalMyListings(userId));
    }

    if (action === 'history') {
        return interaction.update(buildGlobalHistory(userId));
    }

    if (action === 'buyconfirm') {
        const result = executeGlobalPurchase(guildId, userId, extra.listingId);
        if (!result.ok) {
            return interaction.reply({ content: result.error, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('🛒 Global Purchase Complete!')
            .setDescription(
                `Pembelian berhasil!\n\n` +
                `> 📦 Item: **${result.listing.itemName}**\n` +
                `> 💰 Harga: 🪙 **${result.listing.price.toLocaleString('id-ID')}**\n` +
                `> 👤 Seller: ${result.listing.sellerName || 'Unknown'}\n` +
                `> 🏷️ Tax: 🪙 ${result.tax.toLocaleString('id-ID')} (5%)\n\n` +
                `Item sudah masuk ke inventory kamu!`
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`gm_browse_all_${userId}_0`).setLabel('🛒 Browse Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`gm_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

// ==================== HANDLER: Select Menus ====================
async function handleGlobalMarketSelectMenu(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const userId = customId.split('_').pop();

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    // === SELL: Item selected → show price modal ===
    if (customId.startsWith('gm_sellitem_')) {
        const val = interaction.values[0];
        const sep = val.indexOf(':');
        const itemType = val.substring(0, sep);
        const itemId = val.substring(sep + 1);

        // Store pending sell in state
        if (!state.pendingGlobalSell) state.pendingGlobalSell = new Map();
        state.pendingGlobalSell.set(`${guildId}_${userId}`, { itemType, itemId });

        const modal = new ModalBuilder()
            .setCustomId(`gm_modal_price_${userId}`)
            .setTitle('🌍 Set Harga Global Market');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('gm_price')
                .setLabel('Harga jual (angka)')
                .setPlaceholder('Contoh: 10000')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(10)
        ));
        return interaction.showModal(modal);
    }

    // === BUY: Listing selected → confirmation ===
    if (customId.startsWith('gm_buyselect_')) {
        const listingId = parseInt(interaction.values[0]);
        const listing = db.prepare('SELECT * FROM global_market WHERE id = ? AND status = ?').get(listingId, 'active');
        if (!listing) return interaction.reply({ content: '❌ Listing sudah tidak tersedia!', ephemeral: true });
        if (listing.sellerId === userId) return interaction.reply({ content: '❌ Tidak bisa membeli listing sendiri!', ephemeral: true });

        const buyerData = getOrCreateUser(guildId, userId);
        const canAfford = buyerData.balance >= listing.price;

        const embed = new EmbedBuilder()
            .setColor(canAfford ? '#F1C40F' : '#E74C3C')
            .setTitle('🌍 Konfirmasi Pembelian Global')
            .setDescription(
                `> 📦 **${listing.itemName}**\n` +
                (listing.itemDetails ? `> 📋 ${listing.itemDetails}\n` : '') +
                `> 💰 Harga: 🪙 **${listing.price.toLocaleString('id-ID')}**\n` +
                `> 👤 Seller: **${listing.sellerName || 'Unknown'}**\n` +
                `> 💳 Saldo kamu: 🪙 **${buyerData.balance.toLocaleString('id-ID')}**\n\n` +
                (canAfford ? '✅ Klik **Konfirmasi** untuk membeli.' : '❌ Saldo tidak cukup!')
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`gm_buyconfirm_${userId}_${listingId}`).setLabel('✅ Konfirmasi Beli').setStyle(ButtonStyle.Success).setDisabled(!canAfford),
            new ButtonBuilder().setCustomId(`gm_main_${userId}`).setLabel('🔙 Batal').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === CANCEL: Listing selected → cancel ===
    if (customId.startsWith('gm_cancelselect_')) {
        const listingId = parseInt(interaction.values[0]);
        const listing = db.prepare('SELECT * FROM global_market WHERE id = ? AND sellerId = ? AND status = ?').get(listingId, userId, 'active');
        if (!listing) return interaction.reply({ content: '❌ Listing tidak ditemukan!', ephemeral: true });

        returnGlobalItem(listing, userId, listing.guildId);
        db.prepare('UPDATE global_market SET status = ? WHERE id = ?').run('cancelled', listingId);

        const embed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('❌ Global Listing Cancelled')
            .setDescription(`Listing **#${listingId}** — **${listing.itemName}** dibatalkan.\nItem dikembalikan ke inventory kamu.`);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`gm_mylist_${userId}`).setLabel('📦 My Listings').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`gm_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

// ==================== HANDLER: Modal Submit ====================
async function handleGlobalMarketModal(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const userId = customId.split('_').pop();

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Error!', ephemeral: true });
    }

    if (customId.startsWith('gm_modal_price_')) {
        if (!state.pendingGlobalSell) return interaction.reply({ content: '❌ Session expired!', ephemeral: true });
        const pending = state.pendingGlobalSell.get(`${guildId}_${userId}`);
        if (!pending) return interaction.reply({ content: '❌ Session expired! Coba lagi.', ephemeral: true });

        const price = parseInt(interaction.fields.getTextInputValue('gm_price'));
        if (isNaN(price) || price < 100) {
            state.pendingGlobalSell.delete(`${guildId}_${userId}`);
            return interaction.reply({ content: '❌ Harga minimal 100!', ephemeral: true });
        }
        if (price > 10000000) {
            state.pendingGlobalSell.delete(`${guildId}_${userId}`);
            return interaction.reply({ content: '❌ Harga maksimal 10.000.000!', ephemeral: true });
        }

        // Get item details
        let details = '';
        if (pending.itemType === 'relic') {
            const r = db.prepare('SELECT * FROM relics WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(pending.itemId), guildId, userId);
            if (r) details = `${r.rarity} | +${r.stat_value} ${r.stat_type} | Refine +${r.refine_level}`;
        } else if (pending.itemType === 'pet') {
            const p = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(pending.itemId), guildId, userId);
            if (p) { const pd = PET_DATA.find(x => x.id === p.petId); details = `${pd ? pd.tier : '?'} | Lv.${p.level} | ATK:${p.atk} DEF:${p.def}`; }
        } else if (pending.itemType === 'fish') {
            const f = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(pending.itemId), guildId, userId);
            if (f) { const fd = FISH_DATA.find(x => x.id === f.fishId); details = `${fd ? fd.tier : '?'} | ${f.weight}kg`; }
        }

        const result = createGlobalListing(guildId, userId, interaction.user.username, pending.itemType, pending.itemId, price, details);
        state.pendingGlobalSell.delete(`${guildId}_${userId}`);

        if (!result.ok) {
            return interaction.reply({ content: result.error, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('✅ Listed on Global Market!')
            .setDescription(
                `Item berhasil dipasang di **Global Market**!\n\n` +
                `> 📦 **${result.itemName}**\n` +
                `> 💰 Harga: 🪙 **${price.toLocaleString('id-ID')}**\n` +
                `> 🏷️ Tax saat terjual: 🪙 ${Math.floor(price * GLOBAL_TAX_RATE).toLocaleString('id-ID')} (5%)\n` +
                `> ⏱️ Expired: 5 hari\n\n` +
                `🌍 Semua player di semua server bisa melihat dan membeli listing ini!`
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`gm_sell_${userId}`).setLabel('📤 Sell Lagi').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`gm_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [row] });
    }
}

// ==================== DETECTORS ====================
function isGlobalMarketButton(customId) {
    return customId.startsWith('gm_') && !customId.startsWith('gm_sellitem_') && !customId.startsWith('gm_buyselect_') && !customId.startsWith('gm_cancelselect_') && !customId.startsWith('gm_modal_');
}

function isGlobalMarketSelectMenu(customId) {
    return customId.startsWith('gm_sellitem_') || customId.startsWith('gm_buyselect_') || customId.startsWith('gm_cancelselect_');
}

function isGlobalMarketModal(customId) {
    return customId.startsWith('gm_modal_');
}

// ==================== EXPORTS ====================
module.exports = {
    buildGlobalMarketPanel,
    handleGlobalMarketButton,
    handleGlobalMarketSelectMenu,
    handleGlobalMarketModal,
    isGlobalMarketButton,
    isGlobalMarketSelectMenu,
    isGlobalMarketModal
};
