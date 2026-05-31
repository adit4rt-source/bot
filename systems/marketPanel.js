// systems/marketPanel.js - Market/Auction House Panel UI System
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { db, getOrCreateUser } = require('../database');
const { notifyMarketSold } = require('./notifications');
const { FISH_DATA } = require('../data/fish');
const { PET_DATA } = require('../data/pets');
const { ITEMS } = require('../data/items');
const { pendingMarketSell } = require('../state');

// ============ DATABASE SETUP ============
db.exec(`CREATE TABLE IF NOT EXISTS market_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    sellerId TEXT,
    itemType TEXT,
    itemId TEXT,
    itemName TEXT,
    price INTEGER,
    listedAt INTEGER,
    status TEXT DEFAULT 'active'
)`);

// ============ CONSTANTS ============
const LISTING_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_LISTINGS_PER_USER = 10;
const LISTINGS_PER_PAGE = 10;
const SELL_MENU_LIMIT = 25; // Discord select menu hard cap


// ============ HELPER: Expire old listings ============
function expireOldListings(guildId) {
    const cutoff = Date.now() - LISTING_EXPIRY_MS;
    db.prepare('UPDATE market_listings SET status = ? WHERE guildId = ? AND status = ? AND listedAt < ?')
        .run('expired', guildId, 'active', cutoff);
}

// ============ HELPER: Get item display for listing ============
function getListingDisplay(listing) {
    const typeEmoji = { fish: '🐟', relic: '💎', pet: '🐾', item: '📦' }[listing.itemType] || '❓';
    return `${typeEmoji} **${listing.itemName}**`;
}

// ============ HELPER: Gather a player's sellable items ============
// Returns [{ type, id, label, desc }] ready to be turned into select options.
function getSellableItems(guildId, userId) {
    const out = [];

    // Relics (high value, usually few)
    const relics = db.prepare('SELECT * FROM relics WHERE guildId = ? AND userId = ?').all(guildId, userId);
    for (const r of relics) {
        out.push({ type: 'relic', id: String(r.id), label: `💎 ${r.name} [${r.rarity}]`, desc: `+${r.stat_value} ${r.stat_type}` });
    }

    // Pets
    const pets = db.prepare('SELECT * FROM pets WHERE guildId = ? AND userId = ?').all(guildId, userId);
    for (const p of pets) {
        const pd = PET_DATA.find(x => x.id === p.petId);
        out.push({ type: 'pet', id: String(p.id), label: `${pd ? pd.emoji : '🐾'} ${p.name} (Lv.${p.level})`, desc: pd ? pd.name : 'Pet' });
    }

    // Game items
    const inv = db.prepare('SELECT * FROM item_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, userId);
    for (const it of inv) {
        const def = ITEMS.find(x => x.id === it.itemId);
        if (def) out.push({ type: 'item', id: it.itemId, label: `${def.emoji} ${def.name}`, desc: `Punya x${it.quantity}` });
    }

    // Fish (not locked, heaviest first — usually the most valuable)
    const fish = db.prepare('SELECT * FROM fish_inventory WHERE guildId = ? AND userId = ? AND locked = 0 ORDER BY weight DESC').all(guildId, userId);
    for (const f of fish) {
        const fd = FISH_DATA.find(x => x.id === f.fishId);
        out.push({ type: 'fish', id: String(f.id), label: `${fd ? fd.emoji : '🐟'} ${fd ? fd.name : 'Fish'} (${f.weight}kg)`, desc: fd ? fd.tier : 'Fish' });
    }

    return out;
}

// ============ HELPER: Resolve a sellable item's display name (for ownership check) ============
function resolveSellItemName(guildId, userId, itemType, itemId) {
    if (itemType === 'fish') {
        const fish = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(itemId), guildId, userId);
        if (!fish) return null;
        const fishDef = FISH_DATA.find(f => f.id === fish.fishId);
        return fishDef ? `${fishDef.name} (${fish.weight}kg)` : `Fish #${itemId}`;
    }
    if (itemType === 'relic') {
        const relic = db.prepare('SELECT * FROM relics WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(itemId), guildId, userId);
        if (!relic) return null;
        return `${relic.name} [${relic.rarity}] +${relic.stat_value} ${relic.stat_type}`;
    }
    if (itemType === 'pet') {
        const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(itemId), guildId, userId);
        if (!pet) return null;
        const petDef = PET_DATA.find(p => p.id === pet.petId);
        return petDef ? `${pet.name} (${petDef.name} Lv.${pet.level})` : `Pet #${itemId}`;
    }
    if (itemType === 'item') {
        const itemDef = ITEMS.find(i => i.id === itemId);
        if (!itemDef) return null;
        const qty = db.prepare('SELECT quantity FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, itemId);
        if (!qty || qty.quantity < 1) return null;
        return `${itemDef.emoji} ${itemDef.name}`;
    }
    return null;
}

// ============ HELPER: Remove item from seller & create the listing ============
function createMarketListing(guildId, userId, itemType, itemId, price) {
    let itemName = '';

    if (itemType === 'fish') {
        const fish = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(itemId), guildId, userId);
        if (!fish) return { ok: false, error: '❌ Ikan tidak ditemukan di inventory!' };
        const fishDef = FISH_DATA.find(f => f.id === fish.fishId);
        itemName = fishDef ? `${fishDef.name} (${fish.weight}kg)` : `Fish #${itemId}`;
        db.prepare('DELETE FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').run(parseInt(itemId), guildId, userId);
    } else if (itemType === 'relic') {
        const relic = db.prepare('SELECT * FROM relics WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(itemId), guildId, userId);
        if (!relic) return { ok: false, error: '❌ Relic tidak ditemukan!' };
        itemName = `${relic.name} [${relic.rarity}] +${relic.stat_value} ${relic.stat_type}`;
        db.prepare('UPDATE relics SET userId = ?, equipped_pet_id = 0 WHERE id = ? AND guildId = ?').run('MARKET_HOLD', parseInt(itemId), guildId);
    } else if (itemType === 'pet') {
        const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(itemId), guildId, userId);
        if (!pet) return { ok: false, error: '❌ Pet tidak ditemukan!' };
        const petDef = PET_DATA.find(p => p.id === pet.petId);
        itemName = petDef ? `${pet.name} (${petDef.name} Lv.${pet.level})` : `Pet #${itemId}`;
        db.prepare('UPDATE pets SET userId = ?, active = 0 WHERE id = ? AND guildId = ?').run('MARKET_HOLD', parseInt(itemId), guildId);
    } else if (itemType === 'item') {
        const itemDef = ITEMS.find(i => i.id === itemId);
        if (!itemDef) return { ok: false, error: '❌ Item tidak ditemukan!' };
        const qty = db.prepare('SELECT quantity FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, itemId);
        if (!qty || qty.quantity < 1) return { ok: false, error: '❌ Kamu tidak punya item ini!' };
        itemName = `${itemDef.emoji} ${itemDef.name}`;
        const newQty = qty.quantity - 1;
        if (newQty <= 0) db.prepare('DELETE FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').run(guildId, userId, itemId);
        else db.prepare('UPDATE item_inventory SET quantity = ? WHERE guildId = ? AND userId = ? AND itemId = ?').run(newQty, guildId, userId, itemId);
    } else {
        return { ok: false, error: '❌ Tipe item tidak valid!' };
    }

    db.prepare('INSERT INTO market_listings (guildId, sellerId, itemType, itemId, itemName, price, listedAt, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(guildId, userId, itemType, itemId, itemName, price, Date.now(), 'active');
    const listingId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    return { ok: true, itemName, listingId };
}

// ============ HELPER: Return a listed item to its owner ============
function returnListingItem(listing, toUserId, guildId, unequip) {
    if (listing.itemType === 'fish') {
        db.prepare('UPDATE fish_inventory SET userId = ? WHERE id = ? AND guildId = ?').run(toUserId, parseInt(listing.itemId), guildId);
    } else if (listing.itemType === 'relic') {
        if (unequip) db.prepare('UPDATE relics SET userId = ?, equipped_pet_id = 0 WHERE id = ? AND guildId = ?').run(toUserId, parseInt(listing.itemId), guildId);
        else db.prepare('UPDATE relics SET userId = ? WHERE id = ? AND guildId = ?').run(toUserId, parseInt(listing.itemId), guildId);
    } else if (listing.itemType === 'pet') {
        db.prepare('UPDATE pets SET userId = ? WHERE id = ? AND guildId = ?').run(toUserId, parseInt(listing.itemId), guildId);
    } else if (listing.itemType === 'item') {
        const existing = db.prepare('SELECT quantity FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, toUserId, listing.itemId);
        if (existing) db.prepare('UPDATE item_inventory SET quantity = quantity + 1 WHERE guildId = ? AND userId = ? AND itemId = ?').run(guildId, toUserId, listing.itemId);
        else db.prepare('INSERT INTO item_inventory (guildId, userId, itemId, quantity) VALUES (?, ?, ?, 1)').run(guildId, toUserId, listing.itemId);
    }
}

// ============ HELPER: Execute a purchase (returns result for caller to reply) ============
function executePurchase(guildId, userId, listingId) {
    const listing = db.prepare('SELECT * FROM market_listings WHERE id = ? AND guildId = ? AND status = ?').get(listingId, guildId, 'active');
    if (!listing) return { ok: false, error: '❌ Listing tidak ditemukan atau sudah tidak aktif!' };
    if (listing.sellerId === userId) return { ok: false, error: '❌ Tidak bisa membeli listing sendiri!' };

    if (Date.now() - listing.listedAt > LISTING_EXPIRY_MS) {
        db.prepare('UPDATE market_listings SET status = ? WHERE id = ?').run('expired', listingId);
        return { ok: false, error: '❌ Listing sudah expired!' };
    }

    const buyerData = getOrCreateUser(guildId, userId);
    if (buyerData.balance < listing.price) {
        return { ok: false, error: `❌ Saldo kurang! Kamu punya 🪙 ${buyerData.balance.toLocaleString('id-ID')}, butuh 🪙 ${listing.price.toLocaleString('id-ID')}` };
    }

    // Money transfer
    db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(listing.price, guildId, userId);
    db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(listing.price, guildId, listing.sellerId);

    // Transfer item to buyer
    returnListingItem(listing, userId, guildId, true);

    db.prepare('UPDATE market_listings SET status = ? WHERE id = ?').run('sold', listingId);
    return { ok: true, listing };
}


// ============ BUILD: Main Market Panel ============
function buildMarketPanel(guildId, userId, username) {
    expireOldListings(guildId);

    const activeCount = db.prepare('SELECT COUNT(*) as cnt FROM market_listings WHERE guildId = ? AND status = ?')
        .get(guildId, 'active').cnt;
    const userData = getOrCreateUser(guildId, userId);

    const embed = new EmbedBuilder()
        .setTitle(`🏪 MARKET — ${username}`)
        .setColor('#E67E22')
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📊 Active Listings: **${activeCount}** | 💰 Saldo: **${userData.balance.toLocaleString('id-ID')}**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `> 📋 **Browse** — Lihat & beli listing (pilih dari menu)\n` +
            `> 📤 **Sell** — Jual item (pilih dari daftar item kamu)\n` +
            `> 📦 **My Listings** — Kelola listing kamu\n\n` +
            `💡 *Listing expired setelah 7 hari*`
        )
        .setFooter({ text: 'Market — Jual beli antar player' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`market_browse_${userId}_0`).setLabel('📋 Browse').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`market_sell_${userId}`).setLabel('📤 Sell').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`market_mylist_${userId}`).setLabel('📦 My Listings').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}


// ============ BUILD: Sell — select menu of player's items ============
function buildSellMenu(guildId, userId, username) {
    const items = getSellableItems(guildId, userId);

    const embed = new EmbedBuilder()
        .setTitle(`📤 Market — Jual Item`)
        .setColor('#2ECC71')
        .setFooter({ text: 'Pilih item dari daftar, lalu masukkan harga' });

    if (items.length === 0) {
        embed.setDescription('📭 Kamu tidak punya item yang bisa dijual.\n\n> Yang bisa dijual: 🐟 ikan (tidak terkunci), 💎 relic, 🐾 pet, 📦 item game.');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`market_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return { embeds: [embed], components: [row] };
    }

    const shown = items.slice(0, SELL_MENU_LIMIT);
    embed.setDescription(
        `Menampilkan **${shown.length}** dari **${items.length}** item milikmu.\n` +
        (items.length > SELL_MENU_LIMIT ? `> ⚠️ Hanya ${SELL_MENU_LIMIT} item teratas yang muncul (batas Discord).\n` : '') +
        `\n👇 Pilih item yang ingin dijual:`
    );

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`market_sellitem_${userId}`)
        .setPlaceholder('📤 Pilih item untuk dijual...')
        .setMinValues(1).setMaxValues(1);
    shown.forEach(it => {
        menu.addOptions(new StringSelectMenuOptionBuilder()
            .setLabel(it.label.substring(0, 100))
            .setValue(`${it.type}:${it.id}`.substring(0, 100))
            .setDescription((it.desc || '').substring(0, 100)));
    });

    const components = [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`market_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        )
    ];
    return { embeds: [embed], components };
}


// ============ BUILD: Browse Page (with buy select menu) ============
function buildBrowsePage(guildId, userId, username, page) {
    expireOldListings(guildId);

    const total = db.prepare('SELECT COUNT(*) as cnt FROM market_listings WHERE guildId = ? AND status = ? AND sellerId != ?')
        .get(guildId, 'active', userId).cnt;
    const maxPage = Math.max(0, Math.ceil(total / LISTINGS_PER_PAGE) - 1);
    const safePage = Math.min(Math.max(0, page), maxPage);
    const offset = safePage * LISTINGS_PER_PAGE;

    const listings = db.prepare('SELECT * FROM market_listings WHERE guildId = ? AND status = ? AND sellerId != ? ORDER BY listedAt DESC LIMIT ? OFFSET ?')
        .all(guildId, 'active', userId, LISTINGS_PER_PAGE, offset);

    let desc = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (listings.length === 0) {
        desc += `\n📭 Tidak ada listing saat ini.\n`;
    } else {
        for (const l of listings) {
            const timeLeft = Math.max(0, Math.floor((LISTING_EXPIRY_MS - (Date.now() - l.listedAt)) / 3600000));
            desc += `> **#${l.id}** ${getListingDisplay(l)}\n`;
            desc += `>   💰 ${l.price.toLocaleString('id-ID')} | ⏱️ ${timeLeft}h | 👤 <@${l.sellerId}>\n\n`;
        }
    }
    desc += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    desc += `📄 Halaman ${safePage + 1}/${maxPage + 1} (${total} listing)`;

    const embed = new EmbedBuilder()
        .setTitle(`📋 Market — Browse`)
        .setColor('#3498DB')
        .setDescription(desc)
        .setFooter({ text: 'Pilih listing dari menu untuk membeli' });

    const components = [];

    // Buy select menu — each active listing on this page is an option
    if (listings.length > 0) {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`market_buyselect_${userId}`)
            .setPlaceholder('🛒 Pilih listing untuk dibeli...')
            .setMinValues(1).setMaxValues(1);
        listings.forEach(l => {
            const typeEmoji = { fish: '🐟', relic: '💎', pet: '🐾', item: '📦' }[l.itemType] || '❓';
            menu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`#${l.id} ${l.itemName}`.substring(0, 100))
                .setValue(String(l.id))
                .setDescription(`🪙 ${l.price.toLocaleString('id-ID')}`.substring(0, 100))
                .setEmoji(typeEmoji));
        });
        components.push(new ActionRowBuilder().addComponents(menu));
    }

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`market_browse_${userId}_${Math.max(0, safePage - 1)}`).setLabel('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(safePage <= 0),
        new ButtonBuilder().setCustomId(`market_browse_${userId}_${Math.min(maxPage, safePage + 1)}`).setLabel('➡️').setStyle(ButtonStyle.Secondary).setDisabled(safePage >= maxPage),
        new ButtonBuilder().setCustomId(`market_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );
    components.push(navRow);

    return { embeds: [embed], components };
}


// ============ BUILD: My Listings Page (with cancel select menu) ============
function buildMyListings(guildId, userId, username) {
    expireOldListings(guildId);

    const listings = db.prepare('SELECT * FROM market_listings WHERE guildId = ? AND sellerId = ? AND status = ? ORDER BY listedAt DESC LIMIT 25')
        .all(guildId, userId, 'active');

    let desc = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (listings.length === 0) {
        desc += `\n📭 Kamu belum punya listing aktif.\n`;
    } else {
        for (const l of listings) {
            const timeLeft = Math.max(0, Math.floor((LISTING_EXPIRY_MS - (Date.now() - l.listedAt)) / 3600000));
            desc += `> **#${l.id}** ${getListingDisplay(l)}\n`;
            desc += `>   💰 ${l.price.toLocaleString('id-ID')} | ⏱️ ${timeLeft}h left\n\n`;
        }
    }
    desc += `━━━━━━━━━━━━━━━━━━━━━━`;

    const embed = new EmbedBuilder()
        .setTitle(`📦 My Listings — ${username}`)
        .setColor('#9B59B6')
        .setDescription(desc)
        .setFooter({ text: 'Pilih listing dari menu untuk membatalkan' });

    const components = [];
    if (listings.length > 0) {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`market_cancelselect_${userId}`)
            .setPlaceholder('❌ Pilih listing untuk dibatalkan...')
            .setMinValues(1).setMaxValues(1);
        listings.forEach(l => {
            const typeEmoji = { fish: '🐟', relic: '💎', pet: '🐾', item: '📦' }[l.itemType] || '❓';
            menu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`#${l.id} ${l.itemName}`.substring(0, 100))
                .setValue(String(l.id))
                .setDescription(`🪙 ${l.price.toLocaleString('id-ID')}`.substring(0, 100))
                .setEmoji(typeEmoji));
        });
        components.push(new ActionRowBuilder().addComponents(menu));
    }
    components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`market_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    ));

    return { embeds: [embed], components };
}

// ============ HANDLER: /market command ============
async function handleMarketCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const panel = buildMarketPanel(guildId, userId, interaction.user.username);
    return interaction.reply(panel);
}


// ============ HANDLER: Market panel button clicks ============
async function handleMarketButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    // market_ACTION_USERID[_EXTRA]
    const action = parts[1];
    const userId = parts[2];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    // === BACK TO MAIN ===
    if (action === 'back') {
        return interaction.update(buildMarketPanel(guildId, userId, interaction.user.username));
    }

    // === BROWSE ===
    if (action === 'browse') {
        const page = parseInt(parts[3]) || 0;
        return interaction.update(buildBrowsePage(guildId, userId, interaction.user.username, page));
    }

    // === SELL: Show select menu of owned items ===
    if (action === 'sell') {
        return interaction.update(buildSellMenu(guildId, userId, interaction.user.username));
    }

    // === MY LISTINGS ===
    if (action === 'mylist') {
        return interaction.update(buildMyListings(guildId, userId, interaction.user.username));
    }

    // === BUY CONFIRM: execute purchase ===  market_buyconfirm_USERID_LISTINGID
    if (action === 'buyconfirm') {
        const listingId = parseInt(parts[3]);
        const result = executePurchase(guildId, userId, listingId);
        if (!result.ok) {
            return interaction.update({
                embeds: [new EmbedBuilder().setColor('#E74C3C').setTitle('🛒 Pembelian Gagal').setDescription(result.error)],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`market_browse_${userId}_0`).setLabel('🔙 Browse').setStyle(ButtonStyle.Secondary)
                )]
            });
        }

        const listing = result.listing;
        // Notify seller (non-blocking)
        try { await notifyMarketSold(interaction.client, guildId, listing.sellerId, listing.itemName, listing.price, interaction.user.username); } catch (e) { /* ignore */ }

        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('🛒 Purchase Complete!')
            .setDescription(
                `Pembelian berhasil!\n\n` +
                `> 📦 Item: **${listing.itemName}**\n` +
                `> 💰 Harga: 🪙 **${listing.price.toLocaleString('id-ID')}**\n` +
                `> 👤 Seller: <@${listing.sellerId}>\n\n` +
                `Item sudah masuk ke inventory kamu.`
            )
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`market_browse_${userId}_0`).setLabel('📋 Browse Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`market_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
}


// ============ HANDLER: Market select menus ============
async function handleMarketSelectMenu(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    // === SELL: item picked -> store & show price modal ===
    if (customId.startsWith('market_sellitem_')) {
        const val = interaction.values[0];
        const sep = val.indexOf(':');
        const itemType = val.substring(0, sep);
        const itemId = val.substring(sep + 1);

        // Verify still owned and get display name
        const itemName = resolveSellItemName(guildId, userId, itemType, itemId);
        if (!itemName) {
            return interaction.reply({ content: '❌ Item itu sudah tidak ada di inventory kamu!', ephemeral: true });
        }

        // Listing limit check before asking for price
        const userListings = db.prepare('SELECT COUNT(*) as cnt FROM market_listings WHERE guildId = ? AND sellerId = ? AND status = ?')
            .get(guildId, userId, 'active').cnt;
        if (userListings >= MAX_LISTINGS_PER_USER) {
            return interaction.reply({ content: `❌ Max ${MAX_LISTINGS_PER_USER} listing aktif!`, ephemeral: true });
        }

        pendingMarketSell.set(`${guildId}_${userId}`, { itemType, itemId, itemName });

        const modal = new ModalBuilder()
            .setCustomId(`market_modal_sellprice_${userId}`)
            .setTitle('📤 Tentukan Harga Jual');
        const priceInput = new TextInputBuilder()
            .setCustomId('market_price')
            .setLabel(`Harga (item: ${itemName}`.substring(0, 42) + ')')
            .setPlaceholder('Contoh: 5000')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10);
        modal.addComponents(new ActionRowBuilder().addComponents(priceInput));
        return interaction.showModal(modal);
    }

    // === BUY: listing picked -> confirmation ===
    if (customId.startsWith('market_buyselect_')) {
        const listingId = parseInt(interaction.values[0]);
        const listing = db.prepare('SELECT * FROM market_listings WHERE id = ? AND guildId = ? AND status = ?').get(listingId, guildId, 'active');
        if (!listing) {
            return interaction.reply({ content: '❌ Listing tidak ditemukan atau sudah terjual!', ephemeral: true });
        }
        if (listing.sellerId === userId) {
            return interaction.reply({ content: '❌ Tidak bisa membeli listing sendiri!', ephemeral: true });
        }
        const buyerData = getOrCreateUser(guildId, userId);
        const canAfford = buyerData.balance >= listing.price;

        const embed = new EmbedBuilder()
            .setColor(canAfford ? '#F1C40F' : '#E74C3C')
            .setTitle('🛒 Konfirmasi Pembelian')
            .setDescription(
                `> 📦 Item: ${getListingDisplay(listing)}\n` +
                `> 💰 Harga: 🪙 **${listing.price.toLocaleString('id-ID')}**\n` +
                `> 👤 Seller: <@${listing.sellerId}>\n` +
                `> 💳 Saldo kamu: 🪙 **${buyerData.balance.toLocaleString('id-ID')}**\n\n` +
                (canAfford ? `Klik **Konfirmasi Beli** untuk melanjutkan.` : `❌ Saldo kamu tidak cukup!`)
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`market_buyconfirm_${userId}_${listingId}`).setLabel('✅ Konfirmasi Beli').setStyle(ButtonStyle.Success).setDisabled(!canAfford),
            new ButtonBuilder().setCustomId(`market_browse_${userId}_0`).setLabel('🔙 Batal').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === CANCEL: listing picked -> cancel directly ===
    if (customId.startsWith('market_cancelselect_')) {
        const listingId = parseInt(interaction.values[0]);
        const listing = db.prepare('SELECT * FROM market_listings WHERE id = ? AND guildId = ? AND sellerId = ? AND status = ?')
            .get(listingId, guildId, userId, 'active');
        if (!listing) {
            return interaction.reply({ content: '❌ Listing tidak ditemukan atau bukan milik kamu!', ephemeral: true });
        }

        // Return item to seller
        returnListingItem(listing, userId, guildId, false);
        db.prepare('UPDATE market_listings SET status = ? WHERE id = ?').run('cancelled', listingId);

        const embed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('❌ Listing Cancelled')
            .setDescription(
                `Listing **#${listingId}** dibatalkan.\n\n` +
                `> 📦 Item: **${listing.itemName}**\n` +
                `> 💰 Harga: 🪙 ${listing.price.toLocaleString('id-ID')}\n\n` +
                `Item dikembalikan ke inventory kamu.`
            )
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`market_mylist_${userId}`).setLabel('📦 My Listings').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`market_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
}


// ============ HANDLER: Market modal submissions ============
async function handleMarketModal(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];
    const action = parts[2]; // sellprice

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan modal kamu!', ephemeral: true });
    }

    // === SELL PRICE SUBMISSION ===
    if (action === 'sellprice') {
        const pendingKey = `${guildId}_${userId}`;
        const pending = pendingMarketSell.get(pendingKey);
        if (!pending) {
            return interaction.reply({ content: '❌ Sesi penjualan kadaluarsa. Silakan pilih item lagi dari menu Sell.', ephemeral: true });
        }

        const priceStr = interaction.fields.getTextInputValue('market_price').trim();
        const price = parseInt(priceStr);
        if (isNaN(price) || price < 1 || price > 10000000) {
            return interaction.reply({ content: '❌ Harga harus angka 1 - 10,000,000!', ephemeral: true });
        }

        // Re-check listing limit
        const userListings = db.prepare('SELECT COUNT(*) as cnt FROM market_listings WHERE guildId = ? AND sellerId = ? AND status = ?')
            .get(guildId, userId, 'active').cnt;
        if (userListings >= MAX_LISTINGS_PER_USER) {
            pendingMarketSell.delete(pendingKey);
            return interaction.reply({ content: `❌ Max ${MAX_LISTINGS_PER_USER} listing aktif!`, ephemeral: true });
        }

        const result = createMarketListing(guildId, userId, pending.itemType, pending.itemId, price);
        pendingMarketSell.delete(pendingKey);
        if (!result.ok) {
            return interaction.reply({ content: result.error, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('📤 Listed on Market!')
            .setDescription(
                `Item berhasil di-list di market!\n\n` +
                `> 🆔 Listing: **#${result.listingId}**\n` +
                `> 📦 Item: **${result.itemName}**\n` +
                `> 💰 Harga: 🪙 **${price.toLocaleString('id-ID')}**\n` +
                `> ⏱️ Expire: 7 hari\n\n` +
                `Player lain bisa membeli dari Browse.`
            )
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`market_mylist_${userId}`).setLabel('📦 My Listings').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`market_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ embeds: [embed], components: [row] });
    }
}

// ============ UTILITY: Detection helpers ============
function isMarketPanelButton(customId) {
    return customId.startsWith('market_')
        && !customId.startsWith('market_modal_')
        && !customId.startsWith('market_sellitem_')
        && !customId.startsWith('market_buyselect_')
        && !customId.startsWith('market_cancelselect_');
}

function isMarketPanelSelectMenu(customId) {
    return customId.startsWith('market_sellitem_')
        || customId.startsWith('market_buyselect_')
        || customId.startsWith('market_cancelselect_');
}

function isMarketPanelModal(customId) {
    return customId.startsWith('market_modal_');
}

module.exports = {
    buildMarketPanel,
    handleMarketCommand,
    handleMarketButton,
    handleMarketSelectMenu,
    handleMarketModal,
    isMarketPanelButton,
    isMarketPanelSelectMenu,
    isMarketPanelModal
};
