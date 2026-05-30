// systems/marketPanel.js - Market/Auction House Panel UI System
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser } = require('../database');
const { notifyMarketSold } = require('./notifications');
const { FISH_DATA } = require('../data/fish');
const { PET_DATA } = require('../data/pets');
const { ITEMS } = require('../data/items');

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
            `> 📋 **Browse** — Lihat & beli listing aktif\n` +
            `> 📤 **Sell** — Jual item di market\n` +
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


// ============ BUILD: Browse Page ============
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
        .setFooter({ text: 'Klik Buy dan masukkan ID listing untuk membeli' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`market_browse_${userId}_${Math.max(0, safePage - 1)}`).setLabel('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(safePage <= 0),
        new ButtonBuilder().setCustomId(`market_buy_${userId}`).setLabel('🛒 Buy').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`market_browse_${userId}_${Math.min(maxPage, safePage + 1)}`).setLabel('➡️').setStyle(ButtonStyle.Secondary).setDisabled(safePage >= maxPage),
        new ButtonBuilder().setCustomId(`market_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}


// ============ BUILD: My Listings Page ============
function buildMyListings(guildId, userId, username) {
    expireOldListings(guildId);

    const listings = db.prepare('SELECT * FROM market_listings WHERE guildId = ? AND sellerId = ? AND status = ? ORDER BY listedAt DESC LIMIT 10')
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
        .setFooter({ text: 'Klik Cancel untuk membatalkan listing' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`market_cancel_${userId}`).setLabel('❌ Cancel Listing').setStyle(ButtonStyle.Danger).setDisabled(listings.length === 0),
        new ButtonBuilder().setCustomId(`market_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
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
    // market_ACTION_USERID or market_ACTION_USERID_PAGE
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

    // === SELL: Show Modal ===
    if (action === 'sell') {
        const modal = new ModalBuilder()
            .setCustomId(`market_modal_sell_${userId}`)
            .setTitle('📤 Jual Item di Market');

        const typeInput = new TextInputBuilder()
            .setCustomId('market_item_type')
            .setLabel('Tipe Item (fish/relic/pet/item)')
            .setPlaceholder('fish, relic, pet, atau item')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10);

        const idInput = new TextInputBuilder()
            .setCustomId('market_item_id')
            .setLabel('Item ID (DB row ID)')
            .setPlaceholder('Contoh: 5 (lihat di inventory)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(20);

        const priceInput = new TextInputBuilder()
            .setCustomId('market_price')
            .setLabel('Harga jual (money)')
            .setPlaceholder('Contoh: 5000')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10);

        modal.addComponents(
            new ActionRowBuilder().addComponents(typeInput),
            new ActionRowBuilder().addComponents(idInput),
            new ActionRowBuilder().addComponents(priceInput)
        );

        return interaction.showModal(modal);
    }

    // === BUY: Show Modal ===
    if (action === 'buy') {
        const modal = new ModalBuilder()
            .setCustomId(`market_modal_buy_${userId}`)
            .setTitle('🛒 Beli dari Market');

        const idInput = new TextInputBuilder()
            .setCustomId('market_listing_id')
            .setLabel('Listing ID')
            .setPlaceholder('Contoh: 5')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10);

        modal.addComponents(new ActionRowBuilder().addComponents(idInput));
        return interaction.showModal(modal);
    }

    // === MY LISTINGS ===
    if (action === 'mylist') {
        return interaction.update(buildMyListings(guildId, userId, interaction.user.username));
    }

    // === CANCEL: Show Modal ===
    if (action === 'cancel') {
        const modal = new ModalBuilder()
            .setCustomId(`market_modal_cancel_${userId}`)
            .setTitle('❌ Cancel Listing');

        const idInput = new TextInputBuilder()
            .setCustomId('market_listing_id')
            .setLabel('Listing ID yang mau dibatalkan')
            .setPlaceholder('Contoh: 5')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10);

        modal.addComponents(new ActionRowBuilder().addComponents(idInput));
        return interaction.showModal(modal);
    }
}


// ============ HANDLER: Market modal submissions ============
async function handleMarketModal(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];
    const action = parts[2]; // modal_sell, modal_buy, modal_cancel

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan modal kamu!', ephemeral: true });
    }

    // === SELL SUBMISSION ===
    if (action === 'sell') {
        const itemType = interaction.fields.getTextInputValue('market_item_type').trim().toLowerCase();
        const itemId = interaction.fields.getTextInputValue('market_item_id').trim();
        const priceStr = interaction.fields.getTextInputValue('market_price').trim();
        const price = parseInt(priceStr);

        if (!['fish', 'relic', 'pet', 'item'].includes(itemType)) {
            return interaction.reply({ content: '❌ Tipe harus: `fish`, `relic`, `pet`, atau `item`', ephemeral: true });
        }
        if (isNaN(price) || price < 1 || price > 10000000) {
            return interaction.reply({ content: '❌ Harga harus 1 - 10,000,000!', ephemeral: true });
        }

        // Check user listing limit
        const userListings = db.prepare('SELECT COUNT(*) as cnt FROM market_listings WHERE guildId = ? AND sellerId = ? AND status = ?')
            .get(guildId, userId, 'active').cnt;
        if (userListings >= MAX_LISTINGS_PER_USER) {
            return interaction.reply({ content: `❌ Max ${MAX_LISTINGS_PER_USER} listing aktif!`, ephemeral: true });
        }

        let itemName = '';

        // Validate ownership based on type
        if (itemType === 'fish') {
            const fish = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(itemId), guildId, userId);
            if (!fish) return interaction.reply({ content: '❌ Ikan tidak ditemukan di inventory!', ephemeral: true });
            const fishDef = FISH_DATA.find(f => f.id === fish.fishId);
            itemName = fishDef ? `${fishDef.name} (${fish.weight}kg)` : `Fish #${itemId}`;
            // Remove fish from inventory
            db.prepare('DELETE FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').run(parseInt(itemId), guildId, userId);
        } else if (itemType === 'relic') {
            const relic = db.prepare('SELECT * FROM relics WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(itemId), guildId, userId);
            if (!relic) return interaction.reply({ content: '❌ Relic tidak ditemukan!', ephemeral: true });
            itemName = `${relic.name} [${relic.rarity}] +${relic.stat_value} ${relic.stat_type}`;
            // Remove relic (unequip if equipped)
            db.prepare('UPDATE relics SET userId = ?, equipped_pet_id = 0 WHERE id = ? AND guildId = ?').run('MARKET_HOLD', parseInt(itemId), guildId);
        } else if (itemType === 'pet') {
            const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(itemId), guildId, userId);
            if (!pet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
            const petDef = PET_DATA.find(p => p.id === pet.petId);
            itemName = petDef ? `${pet.name} (${petDef.name} Lv.${pet.level})` : `Pet #${itemId}`;
            // Remove pet from user (hold in market)
            db.prepare('UPDATE pets SET userId = ?, active = 0 WHERE id = ? AND guildId = ?').run('MARKET_HOLD', parseInt(itemId), guildId);
        } else if (itemType === 'item') {
            const itemDef = ITEMS.find(i => i.id === itemId);
            if (!itemDef) return interaction.reply({ content: '❌ Item tidak ditemukan! Gunakan item ID (contoh: xp_booster_2x)', ephemeral: true });
            const qty = db.prepare('SELECT quantity FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, itemId);
            if (!qty || qty.quantity < 1) return interaction.reply({ content: '❌ Kamu tidak punya item ini!', ephemeral: true });
            itemName = `${itemDef.emoji} ${itemDef.name}`;
            // Deduct 1 from inventory
            const newQty = qty.quantity - 1;
            if (newQty <= 0) db.prepare('DELETE FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').run(guildId, userId, itemId);
            else db.prepare('UPDATE item_inventory SET quantity = ? WHERE guildId = ? AND userId = ? AND itemId = ?').run(newQty, guildId, userId, itemId);
        }

        // Create listing
        db.prepare('INSERT INTO market_listings (guildId, sellerId, itemType, itemId, itemName, price, listedAt, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(guildId, userId, itemType, itemId, itemName, price, Date.now(), 'active');
        const listingId = db.prepare('SELECT last_insert_rowid() as id').get().id;

        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('📤 Listed on Market!')
            .setDescription(
                `Item berhasil di-list di market!\n\n` +
                `> 🆔 Listing: **#${listingId}**\n` +
                `> 📦 Item: **${itemName}**\n` +
                `> 💰 Harga: 🪙 **${price.toLocaleString('id-ID')}**\n` +
                `> ⏱️ Expire: 7 hari\n\n` +
                `Player lain bisa membeli dari Browse.`
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`market_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({ embeds: [embed], components: [row] });
    }


    // === BUY SUBMISSION ===
    if (action === 'buy') {
        const listingIdStr = interaction.fields.getTextInputValue('market_listing_id').trim();
        const listingId = parseInt(listingIdStr);

        if (isNaN(listingId)) {
            return interaction.reply({ content: '❌ Listing ID harus angka!', ephemeral: true });
        }

        const listing = db.prepare('SELECT * FROM market_listings WHERE id = ? AND guildId = ? AND status = ?')
            .get(listingId, guildId, 'active');
        if (!listing) {
            return interaction.reply({ content: '❌ Listing tidak ditemukan atau sudah tidak aktif!', ephemeral: true });
        }
        if (listing.sellerId === userId) {
            return interaction.reply({ content: '❌ Tidak bisa membeli listing sendiri!', ephemeral: true });
        }

        // Check expiry
        if (Date.now() - listing.listedAt > LISTING_EXPIRY_MS) {
            db.prepare('UPDATE market_listings SET status = ? WHERE id = ?').run('expired', listingId);
            return interaction.reply({ content: '❌ Listing sudah expired!', ephemeral: true });
        }

        // Check buyer balance
        const buyerData = getOrCreateUser(guildId, userId);
        if (buyerData.balance < listing.price) {
            return interaction.reply({ content: `❌ Saldo kurang! Kamu punya 🪙 ${buyerData.balance.toLocaleString('id-ID')}, butuh 🪙 ${listing.price.toLocaleString('id-ID')}`, ephemeral: true });
        }

        // Execute purchase: deduct buyer, give seller
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(listing.price, guildId, userId);
        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(listing.price, guildId, listing.sellerId);

        // Transfer item to buyer
        if (listing.itemType === 'fish') {
            db.prepare('UPDATE fish_inventory SET userId = ? WHERE id = ? AND guildId = ?').run(userId, parseInt(listing.itemId), guildId);
        } else if (listing.itemType === 'relic') {
            db.prepare('UPDATE relics SET userId = ?, equipped_pet_id = 0 WHERE id = ? AND guildId = ?').run(userId, parseInt(listing.itemId), guildId);
        } else if (listing.itemType === 'pet') {
            db.prepare('UPDATE pets SET userId = ?, active = 0 WHERE id = ? AND guildId = ?').run(userId, parseInt(listing.itemId), guildId);
        } else if (listing.itemType === 'item') {
            const existing = db.prepare('SELECT quantity FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, listing.itemId);
            if (existing) {
                db.prepare('UPDATE item_inventory SET quantity = quantity + 1 WHERE guildId = ? AND userId = ? AND itemId = ?').run(guildId, userId, listing.itemId);
            } else {
                db.prepare('INSERT INTO item_inventory (guildId, userId, itemId, quantity) VALUES (?, ?, ?, 1)').run(guildId, userId, listing.itemId);
            }
        }

        // Mark as sold
        db.prepare('UPDATE market_listings SET status = ? WHERE id = ?').run('sold', listingId);

        // Notify seller
        try {
            await notifyMarketSold(interaction.client, guildId, listing.sellerId, listing.itemName, listing.price, interaction.user.username);
        } catch (e) { /* notification failure should not block */ }

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
            new ButtonBuilder().setCustomId(`market_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({ embeds: [embed], components: [row] });
    }


    // === CANCEL SUBMISSION ===
    if (action === 'cancel') {
        const listingIdStr = interaction.fields.getTextInputValue('market_listing_id').trim();
        const listingId = parseInt(listingIdStr);

        if (isNaN(listingId)) {
            return interaction.reply({ content: '❌ Listing ID harus angka!', ephemeral: true });
        }

        const listing = db.prepare('SELECT * FROM market_listings WHERE id = ? AND guildId = ? AND sellerId = ? AND status = ?')
            .get(listingId, guildId, userId, 'active');
        if (!listing) {
            return interaction.reply({ content: '❌ Listing tidak ditemukan atau bukan milik kamu!', ephemeral: true });
        }

        // Return item to seller
        if (listing.itemType === 'fish') {
            db.prepare('UPDATE fish_inventory SET userId = ? WHERE id = ? AND guildId = ?').run(userId, parseInt(listing.itemId), guildId);
        } else if (listing.itemType === 'relic') {
            db.prepare('UPDATE relics SET userId = ? WHERE id = ? AND guildId = ?').run(userId, parseInt(listing.itemId), guildId);
        } else if (listing.itemType === 'pet') {
            db.prepare('UPDATE pets SET userId = ? WHERE id = ? AND guildId = ?').run(userId, parseInt(listing.itemId), guildId);
        } else if (listing.itemType === 'item') {
            const existing = db.prepare('SELECT quantity FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, listing.itemId);
            if (existing) {
                db.prepare('UPDATE item_inventory SET quantity = quantity + 1 WHERE guildId = ? AND userId = ? AND itemId = ?').run(guildId, userId, listing.itemId);
            } else {
                db.prepare('INSERT INTO item_inventory (guildId, userId, itemId, quantity) VALUES (?, ?, ?, 1)').run(guildId, userId, listing.itemId);
            }
        }

        // Mark as cancelled
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
            new ButtonBuilder().setCustomId(`market_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({ embeds: [embed], components: [row] });
    }
}

// ============ UTILITY: Detection helpers ============
function isMarketPanelButton(customId) {
    return customId.startsWith('market_') && !customId.startsWith('market_modal_');
}

function isMarketPanelModal(customId) {
    return customId.startsWith('market_modal_');
}

module.exports = {
    buildMarketPanel,
    handleMarketCommand,
    handleMarketButton,
    handleMarketModal,
    isMarketPanelButton,
    isMarketPanelModal
};
