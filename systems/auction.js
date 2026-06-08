// systems/auction.js — Auction House (lelang item/pet/relic/fish with money bids).
// Listing escrows the asset; bidding escrows the bidder's money (previous bidder is
// refunded when outbid). On settle: winner gets the asset, seller gets the gold.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser, addUserBalance, subtractUserBalance, addIncome, addItem } = require('../database');
const { getOfferableItems } = require('./globalTrade');
const { PET_DATA } = require('../data/pets');

const AUCTION_ESCROW = 'AUCTION_ESCROW';
const MAX_ACTIVE_PER_USER = 5;
const ANTISNIPE_MS = 60000;     // bids in the last minute extend the auction by 1 min
const MIN_DURATION_H = 1, MAX_DURATION_H = 48, DEFAULT_DURATION_H = 6;

db.exec(`CREATE TABLE IF NOT EXISTS auctions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT, sellerId TEXT, sellerName TEXT,
    offerType TEXT, offerId TEXT, offerName TEXT,
    minBid INTEGER DEFAULT 0, currentBid INTEGER DEFAULT 0, bidderId TEXT,
    createdAt INTEGER, endsAt INTEGER, status TEXT DEFAULT 'active'
)`);

// Move a unique asset row (relic/pet/fish) to another owner. Items are stackable
// and handled separately via addItem/removeItem.
function transferItem(type, id, toUserId, guildId) {
    if (type === 'fish') db.prepare('UPDATE fish_inventory SET userId = ? WHERE id = ?').run(toUserId, parseInt(id));
    else if (type === 'relic') db.prepare('UPDATE relics SET userId = ?, equipped_pet_id = 0 WHERE id = ?').run(toUserId, parseInt(id));
    else if (type === 'pet') db.prepare('UPDATE pets SET userId = ?, active = 0 WHERE id = ?').run(toUserId, parseInt(id));
    else if (type === 'item') addItem(guildId, toUserId, id, 1);
}

function activeCountFor(userId) {
    return db.prepare("SELECT COUNT(*) c FROM auctions WHERE sellerId = ? AND status = 'active'").get(userId).c;
}

function getActiveAuctions(limit = 25) {
    return db.prepare("SELECT * FROM auctions WHERE status = 'active' ORDER BY endsAt ASC LIMIT ?").all(limit);
}

function getAuction(id) {
    return db.prepare('SELECT * FROM auctions WHERE id = ?').get(id);
}


// Create an auction. offerType: relic|pet|item|fish. Escrows the asset.
function createAuction(guildId, sellerId, sellerName, offerType, offerId, minBid, durationH) {
    minBid = Math.max(1, Math.floor(Number(minBid) || 0));
    durationH = Math.min(MAX_DURATION_H, Math.max(MIN_DURATION_H, Math.floor(Number(durationH) || DEFAULT_DURATION_H)));
    if (activeCountFor(sellerId) >= MAX_ACTIVE_PER_USER) return { ok: false, error: `❌ Maksimal ${MAX_ACTIVE_PER_USER} lelang aktif!` };

    let offerName = '';
    if (offerType === 'relic') {
        const r = db.prepare('SELECT * FROM relics WHERE id = ? AND userId = ?').get(parseInt(offerId), sellerId);
        if (!r) return { ok: false, error: '❌ Relic tidak ditemukan!' };
        if (r.equipped_pet_id > 0) return { ok: false, error: '❌ Relic sedang dipakai pet! Lepas dulu.' };
        offerName = `💎 ${r.name} [${r.rarity}] +${r.refine_level}`;
    } else if (offerType === 'pet') {
        const p = db.prepare('SELECT * FROM pets WHERE id = ? AND userId = ? AND active = 0').get(parseInt(offerId), sellerId);
        if (!p) return { ok: false, error: '❌ Pet tidak ditemukan / masih aktif (nonaktifkan dulu)!' };
        const pd = PET_DATA.find(x => x.id === p.petId);
        offerName = `${pd ? pd.emoji : '🐾'} ${p.name} (Lv.${p.level})`;
    } else if (offerType === 'fish') {
        const f = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND userId = ?').get(parseInt(offerId), sellerId);
        if (!f) return { ok: false, error: '❌ Ikan tidak ditemukan!' };
        offerName = `🐟 Fish #${offerId} (${f.weight}kg)`;
    } else if (offerType === 'item') {
        const cnt = db.prepare('SELECT quantity q FROM item_inventory WHERE userId = ? AND itemId = ?').get(sellerId, offerId);
        if (!cnt || cnt.q < 1) return { ok: false, error: '❌ Kamu tidak punya item itu!' };
        const found = getOfferableItems(guildId, sellerId).find(o => o.type === 'item' && o.id === offerId);
        offerName = found ? found.label.replace(/\s*\(x\d+\)/, '') : `📦 ${offerId}`;
    } else return { ok: false, error: '❌ Tipe tidak valid!' };

    // Escrow the asset
    if (offerType === 'item') {
        const row = db.prepare('SELECT quantity q FROM item_inventory WHERE userId = ? AND itemId = ?').get(sellerId, offerId);
        if (row.q <= 1) db.prepare('DELETE FROM item_inventory WHERE userId = ? AND itemId = ?').run(sellerId, offerId);
        else db.prepare('UPDATE item_inventory SET quantity = quantity - 1 WHERE userId = ? AND itemId = ?').run(sellerId, offerId);
    } else {
        transferItem(offerType, offerId, AUCTION_ESCROW, guildId);
    }

    const now = Date.now();
    const info = db.prepare(`INSERT INTO auctions (guildId, sellerId, sellerName, offerType, offerId, offerName, minBid, currentBid, bidderId, createdAt, endsAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, 'active')`).run(guildId, sellerId, sellerName, offerType, String(offerId), offerName, minBid, now, now + durationH * 3600000);
    return { ok: true, id: info.lastInsertRowid, offerName, minBid, durationH };
}

// Place a bid. Refunds the previous bidder. Escrows the new bidder's money.
function placeBid(guildId, auctionId, bidderId, amount) {
    amount = Math.floor(Number(amount) || 0);
    const a = getAuction(auctionId);
    if (!a || a.status !== 'active') return { ok: false, error: '❌ Lelang tidak aktif.' };
    if (Date.now() >= a.endsAt) return { ok: false, error: '❌ Lelang sudah berakhir.' };
    if (a.sellerId === bidderId) return { ok: false, error: '❌ Tidak bisa bid lelang sendiri.' };
    const floor = a.currentBid > 0 ? a.currentBid + 1 : a.minBid;
    if (amount < floor) return { ok: false, error: `❌ Bid minimal 🪙 **${floor.toLocaleString('id-ID')}**.` };
    const u = getOrCreateUser(guildId, bidderId);
    if (u.balance < amount) return { ok: false, error: `❌ Saldo kurang! Butuh 🪙 ${amount.toLocaleString('id-ID')}.` };

    if (a.bidderId) addUserBalance(guildId, a.bidderId, a.currentBid); // refund previous bidder
    subtractUserBalance(guildId, bidderId, amount);                    // escrow new bid
    let endsAt = a.endsAt;
    if (endsAt - Date.now() < ANTISNIPE_MS) endsAt = Date.now() + ANTISNIPE_MS; // anti-snipe extend
    db.prepare('UPDATE auctions SET currentBid = ?, bidderId = ?, endsAt = ? WHERE id = ?').run(amount, bidderId, endsAt, auctionId);
    return { ok: true, amount, offerName: a.offerName, extended: endsAt !== a.endsAt };
}


// Finalize an auction: winner gets the asset, seller gets the gold; or return to seller.
function settleAuction(auctionId) {
    const a = getAuction(auctionId);
    if (!a || a.status !== 'active') return { ok: false };
    if (a.bidderId) {
        transferItem(a.offerType, a.offerId, a.bidderId, a.guildId); // give asset to winner
        addUserBalance(a.guildId, a.sellerId, a.currentBid);          // pay seller (bid was escrowed)
        addIncome(a.guildId, a.sellerId, 'auction', a.currentBid);
        db.prepare("UPDATE auctions SET status = 'sold' WHERE id = ?").run(auctionId);
        return { ok: true, sold: true, auction: a };
    }
    transferItem(a.offerType, a.offerId, a.sellerId, a.guildId);      // no bids → return to seller
    db.prepare("UPDATE auctions SET status = 'expired' WHERE id = ?").run(auctionId);
    return { ok: true, sold: false, auction: a };
}

// Seller cancels an auction (only allowed when there are no bids).
function cancelAuction(auctionId, sellerId) {
    const a = getAuction(auctionId);
    if (!a || a.status !== 'active') return { ok: false, error: '❌ Lelang tidak aktif.' };
    if (a.sellerId !== sellerId) return { ok: false, error: '❌ Bukan lelang kamu.' };
    if (a.bidderId) return { ok: false, error: '❌ Sudah ada bid — tidak bisa dibatalkan.' };
    transferItem(a.offerType, a.offerId, a.sellerId, a.guildId);
    db.prepare("UPDATE auctions SET status = 'cancelled' WHERE id = ?").run(auctionId);
    return { ok: true, offerName: a.offerName };
}

// Sweep & settle all expired active auctions. Returns the settled results.
function settleExpiredAuctions() {
    const due = db.prepare("SELECT id FROM auctions WHERE status = 'active' AND endsAt <= ?").all(Date.now());
    const results = [];
    for (const row of due) { const r = settleAuction(row.id); if (r.ok) results.push(r); }
    return results;
}

// Background sweeper (unref so it never keeps tests/process alive).
try {
    const _timer = setInterval(() => { try { settleExpiredAuctions(); } catch (_) {} }, 30000);
    if (_timer && _timer.unref) _timer.unref();
} catch (_) { /* timers unavailable */ }


function fmtTimeLeft(endsAt) {
    const ms = endsAt - Date.now();
    if (ms <= 0) return 'berakhir';
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

function buildAuctionPanel(guildId, userId, username) {
    const active = getActiveAuctions(50);
    const mine = active.filter(a => a.sellerId === userId);
    const embed = new EmbedBuilder()
        .setColor('#C27C0E')
        .setTitle(`🏛️ AUCTION HOUSE — ${username}`)
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📦 Lelang aktif: **${active.length}**  •  🧾 Punyamu: **${mine.length}/${MAX_ACTIVE_PER_USER}**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Lelang item, pet, relic, atau ikanmu — pemain lain saling bid!\n` +
            `> 💰 Bid tertinggi menang saat waktu habis\n` +
            `> ♻️ Bid yang kalah otomatis dikembalikan\n` +
            `> 🛡️ Aset & uang bid diamankan (escrow)`
        )
        .setFooter({ text: 'Auction House • bid otomatis di-settle saat berakhir' });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`auc_browse_${userId}`).setLabel('🔍 Browse & Bid').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`auc_sell_${userId}`).setLabel('➕ Jual / Lelang').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`auc_mine_${userId}`).setLabel('🧾 Lelangku').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
}

function buildBrowse(guildId, userId, username) {
    const active = getActiveAuctions(25);
    if (!active.length) {
        return { embeds: [new EmbedBuilder().setColor('#C27C0E').setTitle('🔍 Browse Lelang').setDescription('*Belum ada lelang aktif. Jadilah yang pertama menjual!*')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`auc_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary))] };
    }
    let desc = '';
    const menu = new StringSelectMenuBuilder().setCustomId(`aucsel_bid_${userId}`).setPlaceholder('Pilih lelang untuk bid...').setMinValues(1).setMaxValues(1);
    for (const a of active) {
        const bidTxt = a.currentBid > 0 ? `🪙 ${a.currentBid.toLocaleString('id-ID')}` : `min 🪙 ${a.minBid.toLocaleString('id-ID')}`;
        desc += `**#${a.id}** ${a.offerName} — ${bidTxt} • ⏳ ${fmtTimeLeft(a.endsAt)}\n`;
        menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`#${a.id} ${a.offerName}`.slice(0, 100)).setValue(String(a.id)).setDescription(`${bidTxt} • ⏳ ${fmtTimeLeft(a.endsAt)}`.slice(0, 100)));
    }
    const embed = new EmbedBuilder().setColor('#C27C0E').setTitle('🔍 Lelang Aktif').setDescription(desc.slice(0, 4000)).setFooter({ text: 'Pilih dari menu untuk menempatkan bid' });
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`auc_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary))] };
}

function buildSellMenu(guildId, userId, username) {
    const items = getOfferableItems(guildId, userId).slice(0, 25);
    if (!items.length) {
        return { embeds: [new EmbedBuilder().setColor('#C27C0E').setTitle('➕ Jual / Lelang').setDescription('*Tidak ada aset yang bisa dilelang (relic/pet non-aktif/item/ikan langka).*')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`auc_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary))] };
    }
    const menu = new StringSelectMenuBuilder().setCustomId(`aucsel_sell_${userId}`).setPlaceholder('Pilih aset untuk dilelang...').setMinValues(1).setMaxValues(1);
    for (const it of items) menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(it.label.slice(0, 100)).setValue(`${it.type}:${it.id}`).setDescription((it.desc || '').slice(0, 100) || '—'));
    const embed = new EmbedBuilder().setColor('#C27C0E').setTitle('➕ Pilih Aset untuk Dilelang').setDescription('Pilih aset, lalu tentukan harga minimal & durasi.');
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`auc_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary))] };
}

function buildMyListings(guildId, userId, username) {
    const mine = db.prepare("SELECT * FROM auctions WHERE sellerId = ? AND status = 'active' ORDER BY endsAt ASC").all(userId);
    let desc = mine.length ? '' : '*Kamu belum punya lelang aktif.*';
    const comps = [];
    if (mine.length) {
        const menu = new StringSelectMenuBuilder().setCustomId(`aucsel_cancel_${userId}`).setPlaceholder('Batalkan lelang (hanya yang belum ada bid)...').setMinValues(1).setMaxValues(1);
        for (const a of mine) {
            const bidTxt = a.currentBid > 0 ? `🪙 ${a.currentBid.toLocaleString('id-ID')} (ada bid)` : `belum ada bid`;
            desc += `**#${a.id}** ${a.offerName} — ${bidTxt} • ⏳ ${fmtTimeLeft(a.endsAt)}\n`;
            menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`#${a.id} ${a.offerName}`.slice(0, 100)).setValue(String(a.id)).setDescription(bidTxt.slice(0, 100)));
        }
        comps.push(new ActionRowBuilder().addComponents(menu));
    }
    comps.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`auc_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)));
    return { embeds: [new EmbedBuilder().setColor('#C27C0E').setTitle(`🧾 Lelangku — ${username}`).setDescription(desc.slice(0, 4000))], components: comps };
}


const state = require('../state');

async function handleAuctionCommand(interaction) {
    return interaction.reply(buildAuctionPanel(interaction.guild.id, interaction.user.id, interaction.user.username));
}

async function handleAuctionButton(interaction) {
    const parts = interaction.customId.split('_');
    const userId = parts[parts.length - 1];
    const guildId = interaction.guild.id;
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    const action = parts[1];
    if (action === 'back') return interaction.update(buildAuctionPanel(guildId, userId, interaction.user.username));
    if (action === 'browse') return interaction.update(buildBrowse(guildId, userId, interaction.user.username));
    if (action === 'sell') return interaction.update(buildSellMenu(guildId, userId, interaction.user.username));
    if (action === 'mine') return interaction.update(buildMyListings(guildId, userId, interaction.user.username));
}

async function handleAuctionSelect(interaction) {
    const parts = interaction.customId.split('_');
    const kind = parts[1];
    const userId = parts[parts.length - 1];
    const guildId = interaction.guild.id;
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    const value = interaction.values[0];

    if (kind === 'bid') {
        const a = getAuction(parseInt(value));
        if (!a || a.status !== 'active') return interaction.reply({ content: '❌ Lelang tidak aktif lagi.', ephemeral: true });
        const floor = a.currentBid > 0 ? a.currentBid + 1 : a.minBid;
        const modal = new ModalBuilder().setCustomId(`aucmodal_bid_${a.id}_${userId}`).setTitle(`Bid #${a.id}`);
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel(`Jumlah bid (min ${floor})`).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12).setPlaceholder(String(floor))));
        return interaction.showModal(modal);
    }
    if (kind === 'sell') {
        const [type, id] = value.split(':');
        state.pendingAuctionSell.set(`${guildId}_${userId}`, { type, id });
        const modal = new ModalBuilder().setCustomId(`aucmodal_sell_${userId}`).setTitle('Lelang Aset');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('minbid').setLabel('Harga minimal (🪙)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12).setPlaceholder('contoh: 5000')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hours').setLabel(`Durasi jam (${MIN_DURATION_H}-${MAX_DURATION_H})`).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setPlaceholder(String(DEFAULT_DURATION_H)))
        );
        return interaction.showModal(modal);
    }
    if (kind === 'cancel') {
        const res = cancelAuction(parseInt(value), userId);
        await interaction.update(buildMyListings(guildId, userId, interaction.user.username));
        return interaction.followUp({ content: res.ok ? `✅ Lelang dibatalkan, aset dikembalikan.` : res.error, ephemeral: true });
    }
}

async function handleAuctionModal(interaction) {
    const parts = interaction.customId.split('_');
    const kind = parts[1];
    const userId = parts[parts.length - 1];
    const guildId = interaction.guild.id;
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan panel kamu!', ephemeral: true });

    if (kind === 'bid') {
        const auctionId = parseInt(parts[2]);
        const amount = parseInt(interaction.fields.getTextInputValue('amount').replace(/[^\d]/g, ''));
        const res = placeBid(guildId, auctionId, userId, amount);
        return interaction.reply({ content: res.ok ? `✅ Bid 🪙 **${res.amount.toLocaleString('id-ID')}** untuk **${res.offerName}**!${res.extended ? ' ⏱️ Waktu diperpanjang (anti-snipe).' : ''}` : res.error, ephemeral: true });
    }
    if (kind === 'sell') {
        const key = `${guildId}_${userId}`;
        const sel = state.pendingAuctionSell.get(key);
        if (!sel) return interaction.reply({ content: '❌ Pilihan kadaluarsa, ulangi dari menu Jual.', ephemeral: true });
        state.pendingAuctionSell.delete(key);
        const minbid = parseInt(interaction.fields.getTextInputValue('minbid').replace(/[^\d]/g, ''));
        const hours = parseInt(interaction.fields.getTextInputValue('hours').replace(/[^\d]/g, ''));
        const res = createAuction(guildId, userId, interaction.user.username, sel.type, sel.id, minbid, hours);
        return interaction.reply({ content: res.ok ? `✅ Lelang **#${res.id}** dibuat: **${res.offerName}** • min 🪙 ${res.minBid.toLocaleString('id-ID')} • ⏳ ${res.durationH}j` : res.error, ephemeral: true });
    }
}

function isAuctionButton(customId) { return typeof customId === 'string' && customId.startsWith('auc_'); }
function isAuctionSelect(customId) { return typeof customId === 'string' && customId.startsWith('aucsel_'); }
function isAuctionModal(customId) { return typeof customId === 'string' && customId.startsWith('aucmodal_'); }

module.exports = {
    createAuction, placeBid, settleAuction, cancelAuction, settleExpiredAuctions, getActiveAuctions, getAuction,
    buildAuctionPanel, buildBrowse, buildSellMenu, buildMyListings,
    handleAuctionCommand, handleAuctionButton, handleAuctionSelect, handleAuctionModal,
    isAuctionButton, isAuctionSelect, isAuctionModal,
};
