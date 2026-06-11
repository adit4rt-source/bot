// systems/tradePanel.js - Trade Panel UI System (Button + Select-menu based)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, UserSelectMenuBuilder } = require('discord.js');
const { db, getOrCreateUser, incrementUserStat } = require('../database');
const { updateQuestProgress } = require('./quests');
const { notifyTradeReceived, notifyTradeAccepted } = require('./notifications');
const { PET_DATA } = require('../data/pets');
const { FISH_DATA } = require('../data/fish');
const { pendingTradeGive } = require('../state');
const ui = require('./ui');

// ============ HELPER: Parse trade item string ============
function parseTradeItem(str) {
    const parts = str.split(':');
    if (parts.length !== 2) return null;
    const [type, id] = parts;
    if (!['fish', 'relic', 'money', 'pet', 'card'].includes(type)) return null;
    return { type, id };
}

// ============ HELPER: Get item display name (markdown) ============
function getItemDisplayName(type, id, guildId) {
    if (type === 'money') return `🪙 **${parseInt(id).toLocaleString('id-ID')}** Money`;
    if (type === 'fish') {
        const fish = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ?').get(parseInt(id), guildId);
        if (!fish) return `🐟 Fish #${id} (tidak ditemukan)`;
        const fishDef = FISH_DATA.find(f => f.id === fish.fishId);
        return fishDef ? `${fishDef.emoji} **${fishDef.name}** (${fish.weight}kg)` : `🐟 Fish #${id}`;
    }
    if (type === 'relic') {
        const relic = db.prepare('SELECT * FROM relics WHERE id = ? AND guildId = ?').get(parseInt(id), guildId);
        if (!relic) return `💎 Relic #${id} (tidak ditemukan)`;
        return `💎 **${relic.name}** [${relic.rarity}] +${relic.stat_value} ${relic.stat_type}`;
    }
    if (type === 'pet') {
        const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ?').get(parseInt(id), guildId);
        if (!pet) return `🐾 Pet #${id} (tidak ditemukan)`;
        const petDef = PET_DATA.find(p => p.id === pet.petId);
        return petDef ? `${petDef.emoji} **${pet.name}** (Lv.${pet.level})` : `🐾 Pet #${id}`;
    }
    if (type === 'card') {
        const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ?').get(parseInt(id));
        if (!card) return `🃏 Card #${id} (tidak ditemukan)`;
        const RARITIES = require('./cardGame').RARITIES;
        const r = RARITIES[card.rarity] || { emoji: '⚪' };
        return `${r.emoji} **${card.name}** — *${card.setName}* [${card.rarity}]`;
    }
    return `❓ Unknown`;
}

// ============ HELPER: Plain (no markdown) item name for select option labels ============
function plainItemName(offer, guildId) {
    const parsed = parseTradeItem(offer || '');
    if (!parsed) return offer || '?';
    return getItemDisplayName(parsed.type, parsed.id, guildId).replace(/\*\*/g, '').replace(/`/g, '');
}

// ============ HELPER: Gather a player's giveable items for the offer select menu ============
function getGiveableItems(guildId, userId) {
    const out = [];
    // Money is always offerable (amount asked in modal)
    out.push({ type: 'money', id: '0', label: '🪙 Money (masukkan jumlah)', desc: 'Tawarkan sejumlah uang' });

    // Relics
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
    // Fish (heaviest first)
    const fish = db.prepare('SELECT * FROM fish_inventory WHERE guildId = ? AND userId = ? AND locked = 0 ORDER BY weight DESC').all(guildId, userId);
    for (const f of fish) {
        const fd = FISH_DATA.find(x => x.id === f.fishId);
        out.push({ type: 'fish', id: String(f.id), label: `${fd ? fd.emoji : '🐟'} ${fd ? fd.name : 'Fish'} (${f.weight}kg)`, desc: fd ? fd.tier : 'Fish' });
    }
    // Pokemon Cards
    try {
        const cards = db.prepare('SELECT * FROM pokemon_cards WHERE userId = ? AND locked = 0 ORDER BY id DESC').all(userId);
        for (const c of cards) {
            const RARITIES = require('./cardGame').RARITIES;
            const r = RARITIES[c.rarity] || { emoji: '⚪' };
            out.push({ type: 'card', id: String(c.id), label: `${r.emoji} ${c.name} [${c.rarity}]`.substring(0, 100), desc: c.setName || 'Pokemon TCG' });
        }
    } catch (_) {}
    return out;
}

// ============ BUILD: Main Trade Panel ============
function buildTradePanel(guildId, userId, username) {
    const sentPending = db.prepare('SELECT COUNT(*) as cnt FROM trades WHERE guildId = ? AND senderId = ? AND status = ?').get(guildId, userId, 'pending');
    const receivedPending = db.prepare('SELECT COUNT(*) as cnt FROM trades WHERE guildId = ? AND receiverId = ? AND status = ?').get(guildId, userId, 'pending');

    const embed = new EmbedBuilder()
        .setTitle(ui.title('🔄', 'TRADE', username))
        .setColor(ui.COLORS.trade)
        .setDescription(
            `Tukar item dengan teman secara aman, langsung di dalam bot. 🤝\n` +
            ui.statBlock([
                `📤 Tawaran Terkirim: **${sentPending.cnt}**  •  📥 Tawaran Masuk: **${receivedPending.cnt}**`,
            ]) +
            `\n**Apa yang mau kamu lakukan?**\n` +
            ui.menuList([
                { emoji: '📤', label: 'Offer', desc: 'Tawarkan itemmu ke pemain lain' },
                { emoji: '🃏', label: 'Kartu', desc: 'Trade kartu Pokemon TCG (masukkan ID)' },
                { emoji: '📋', label: 'List', desc: 'Lihat semua tawaran yang masih berjalan' },
                { emoji: '✅', label: 'Accept', desc: 'Setujui tawaran yang masuk ke kamu' },
                { emoji: '❌', label: 'Reject', desc: 'Tolak tawaran masuk / batalkan punyamu' },
            ])
        )
        .setFooter({ text: ui.footer('Tawaran otomatis hangus 24 jam setelah dibuat') })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trade_offer_${userId}`).setLabel('📤 Offer').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`trade_card_${userId}`).setLabel('🃏 Kartu').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`trade_list_${userId}`).setLabel('📋 List').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`trade_accept_${userId}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`trade_reject_${userId}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row] };
}

// ============ BUILD: Offer — select menu of giveable items ============
function buildGiveMenu(guildId, userId, username) {
    const items = getGiveableItems(guildId, userId);
    const embed = new EmbedBuilder()
        .setTitle('📤 Trade — Pilih yang Kamu Tawarkan')
        .setColor('#3498DB')
        .setFooter({ text: 'Pilih item, lalu isi tujuan & permintaan' });

    const shown = items.slice(0, 25);
    embed.setDescription(
        `Pilih **1 item** yang ingin kamu berikan dalam trade ini.\n` +
        (items.length > 25 ? `> ⚠️ Hanya 25 item teratas yang muncul (batas Discord).\n` : '') +
        `\n👇 Pilih item di bawah:`
    );

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`trade_giveselect_${userId}`)
        .setPlaceholder('📤 Pilih item untuk ditawarkan...')
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
            new ButtonBuilder().setCustomId(`trade_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        )
    ];
    return { embeds: [embed], components };
}

// ============ BUILD: Accept — select menu of incoming pending trades ============
function buildAcceptMenu(guildId, userId, username) {
    const pending = db.prepare('SELECT * FROM trades WHERE guildId = ? AND receiverId = ? AND status = ? ORDER BY createdAt DESC LIMIT 25').all(guildId, userId, 'pending');
    const embed = new EmbedBuilder().setTitle('✅ Accept Trade').setColor('#2ECC71');
    const components = [];

    if (pending.length === 0) {
        embed.setDescription('📭 Tidak ada trade masuk yang bisa diterima saat ini.');
    } else {
        let desc = 'Pilih trade yang ingin kamu **terima**:\n\n';
        for (const t of pending) {
            const give = plainItemName(t.senderOffer, guildId);
            const want = plainItemName(t.receiverOffer, guildId);
            desc += `> **#${t.id}** dari <@${t.senderId}>\n> 📥 Terima: ${give} | 📤 Beri: ${want}\n\n`;
        }
        embed.setDescription(desc);

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`trade_acceptselect_${userId}`)
            .setPlaceholder('✅ Pilih trade untuk diterima...')
            .setMinValues(1).setMaxValues(1);
        pending.forEach(t => {
            const give = plainItemName(t.senderOffer, guildId);
            const want = plainItemName(t.receiverOffer, guildId);
            menu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`#${t.id} terima ${give}`.substring(0, 100))
                .setValue(String(t.id))
                .setDescription(`Beri: ${want}`.substring(0, 100)));
        });
        components.push(new ActionRowBuilder().addComponents(menu));
    }
    components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trade_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    ));
    return { embeds: [embed], components };
}

// ============ BUILD: Reject — select menu of pending trades (sent or received) ============
function buildRejectMenu(guildId, userId, username) {
    const pending = db.prepare('SELECT * FROM trades WHERE guildId = ? AND (senderId = ? OR receiverId = ?) AND status = ? ORDER BY createdAt DESC LIMIT 25').all(guildId, userId, userId, 'pending');
    const embed = new EmbedBuilder().setTitle('❌ Reject / Cancel Trade').setColor('#E74C3C');
    const components = [];

    if (pending.length === 0) {
        embed.setDescription('📭 Tidak ada trade pending untuk ditolak/dibatalkan.');
    } else {
        let desc = 'Pilih trade yang ingin kamu **tolak/batalkan**:\n\n';
        for (const t of pending) {
            const isSender = t.senderId === userId;
            const give = plainItemName(t.senderOffer, guildId);
            const want = plainItemName(t.receiverOffer, guildId);
            desc += `> **#${t.id}** ${isSender ? `→ <@${t.receiverId}> (kamu kirim)` : `dari <@${t.senderId}> (kamu terima)`}\n> 📤 ${give} | 📥 ${want}\n\n`;
        }
        embed.setDescription(desc);

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`trade_rejectselect_${userId}`)
            .setPlaceholder('❌ Pilih trade untuk ditolak...')
            .setMinValues(1).setMaxValues(1);
        pending.forEach(t => {
            const isSender = t.senderId === userId;
            menu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`#${t.id} ${isSender ? '(kamu kirim)' : '(kamu terima)'}`.substring(0, 100))
                .setValue(String(t.id))
                .setDescription(`${plainItemName(t.senderOffer, guildId)} ⇄ ${plainItemName(t.receiverOffer, guildId)}`.substring(0, 100)));
        });
        components.push(new ActionRowBuilder().addComponents(menu));
    }
    components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trade_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    ));
    return { embeds: [embed], components };
}

// ============ HANDLER: /trade command ============
async function handleTradeCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const panel = buildTradePanel(guildId, userId, interaction.user.username);
    return interaction.reply(panel);
}

// ============ HANDLER: Trade panel button clicks ============
async function handleTradeButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    const action = parts[1];

    // === BACK TO MAIN ===
    if (action === 'back') {
        return interaction.update(buildTradePanel(guildId, userId, interaction.user.username));
    }

    // === OFFER: show giveable items select menu ===
    if (action === 'offer') {
        return interaction.update(buildGiveMenu(guildId, userId, interaction.user.username));
    }

    // === CARD TRADE: show modal asking for card ID ===
    if (action === 'card') {
        const modal = new ModalBuilder()
            .setCustomId(`trade_modal_card_${userId}`)
            .setTitle('🃏 Trade Kartu Pokemon');
        const idInput = new TextInputBuilder()
            .setCustomId('card_id')
            .setLabel('Masukkan ID kartu yang ingin di-trade')
            .setPlaceholder('Contoh: 15 (lihat ID di /card → Collection)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10);
        modal.addComponents(new ActionRowBuilder().addComponents(idInput));
        return interaction.showModal(modal);
    }

    // === CARD CONFIRM: user confirmed the card trade ===
    if (action === 'cardconfirm') {
        const cardId = parseInt(parts[2]);
        const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ? AND userId = ?').get(cardId, userId);
        if (!card) return interaction.reply({ content: '❌ Kartu tidak ditemukan atau bukan milikmu!', ephemeral: true });

        // Store card in pending and show user picker
        pendingTradeGive.set(`${guildId}_${userId}`, { type: 'card', id: String(cardId) });

        const RARITIES = require('./cardGame').RARITIES;
        const r = RARITIES[card.rarity] || { emoji: '⚪' };
        const embed = new EmbedBuilder()
            .setTitle('🃏 Trade Kartu — Pilih Lawan Trade')
            .setColor('#E74C3C')
            .setDescription(
                `Kamu akan trade:\n\n` +
                `> ${r.emoji} **${card.name}** — *${card.setName}* [${card.rarity}]\n\n` +
                `Sekarang pilih **siapa** yang mau diajak trade 👇`
            )
            .setThumbnail(card.imageUrl || null)
            .setFooter({ text: 'Pilih user, lalu isi apa yang kamu minta' });

        const pickRow = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`trade_targetpick_${userId}`)
                .setPlaceholder('🤝 Pilih lawan trade...')
                .setMinValues(1).setMaxValues(1)
        );
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`trade_back_${userId}`).setLabel('🔙 Batal').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [pickRow, backRow] });
    }

    // === CARD CANCEL: user cancelled card trade ===
    if (action === 'cardcancel') {
        return interaction.update(buildTradePanel(guildId, userId, interaction.user.username));
    }

    // === LIST: Show pending trades ===
    if (action === 'list') {
        const pending = db.prepare('SELECT * FROM trades WHERE guildId = ? AND (senderId = ? OR receiverId = ?) AND status = ? ORDER BY createdAt DESC LIMIT 10').all(guildId, userId, userId, 'pending');

        if (pending.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('📋 Pending Trades')
                .setColor('#95A5A6')
                .setDescription('📭 Tidak ada trade yang pending saat ini.')
                .setFooter({ text: 'Gunakan tombol Offer untuk membuat trade baru' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`trade_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }

        let sentDesc = '';
        let recvDesc = '';

        for (const t of pending) {
            const age = Date.now() - t.createdAt;
            const hoursLeft = Math.max(0, Math.floor((86400000 - age) / 3600000));
            const giveDisplay = getItemDisplayName(...(t.senderOffer.split(':').length === 2 ? [t.senderOffer.split(':')[0], t.senderOffer.split(':')[1], guildId] : ['money', '0', guildId]));
            const wantDisplay = getItemDisplayName(...(t.receiverOffer.split(':').length === 2 ? [t.receiverOffer.split(':')[0], t.receiverOffer.split(':')[1], guildId] : ['money', '0', guildId]));

            if (t.senderId === userId) {
                sentDesc += `> **#${t.id}** → <@${t.receiverId}>\n> 📤 ${giveDisplay}\n> 📥 ${wantDisplay}\n> ⏱️ ${hoursLeft}h tersisa\n\n`;
            } else {
                recvDesc += `> **#${t.id}** dari <@${t.senderId}>\n> 📤 Mereka kasih: ${giveDisplay}\n> 📥 Mereka minta: ${wantDisplay}\n> ⏱️ ${hoursLeft}h tersisa\n\n`;
            }
        }

        let desc = '';
        if (sentDesc) desc += `**📤 Trade yang kamu kirim:**\n${sentDesc}`;
        if (recvDesc) desc += `**📥 Trade yang kamu terima:**\n${recvDesc}`;

        const embed = new EmbedBuilder()
            .setTitle('📋 Pending Trades')
            .setColor('#3498DB')
            .setDescription(desc || '📭 Tidak ada trade pending.')
            .setFooter({ text: 'Gunakan Accept/Reject untuk memproses' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`trade_accept_${userId}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`trade_reject_${userId}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`trade_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );

        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === ACCEPT: show select menu of incoming trades ===
    if (action === 'accept') {
        return interaction.update(buildAcceptMenu(guildId, userId, interaction.user.username));
    }

    // === REJECT: show select menu of pending trades ===
    if (action === 'reject') {
        return interaction.update(buildRejectMenu(guildId, userId, interaction.user.username));
    }
}

// ============ HANDLER: Trade select menus ============
async function handleTradeSelectMenu(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    // === GIVE selected -> store & show offer modal ===
    if (customId.startsWith('trade_giveselect_')) {
        const val = interaction.values[0]; // type:id  (money:0 for money)
        const sep = val.indexOf(':');
        const type = val.substring(0, sep);
        const id = val.substring(sep + 1);

        // Validate ownership for item types
        if (type === 'fish') {
            const fish = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(id), guildId, userId);
            if (!fish) return interaction.reply({ content: '❌ Ikan itu sudah tidak ada di inventory kamu!', ephemeral: true });
        } else if (type === 'relic') {
            const relic = db.prepare('SELECT * FROM relics WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(id), guildId, userId);
            if (!relic) return interaction.reply({ content: '❌ Relic itu sudah tidak ada!', ephemeral: true });
        } else if (type === 'pet') {
            const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(id), guildId, userId);
            if (!pet) return interaction.reply({ content: '❌ Pet itu sudah tidak ada!', ephemeral: true });
        } else if (type === 'card') {
            const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ? AND userId = ?').get(parseInt(id), userId);
            if (!card) return interaction.reply({ content: '❌ Kartu Pokemon itu sudah tidak ada!', ephemeral: true });
        }

        // Store the chosen give-item, then ask WHO to trade with via a user-picker
        // dropdown (no more typing User IDs). targetId is filled in the next step.
        pendingTradeGive.set(`${guildId}_${userId}`, { type, id });

        const giveLabel = getItemDisplayName(type, id, guildId);
        const embed = new EmbedBuilder()
            .setTitle('📤 Trade — Pilih Lawan Trade')
            .setColor(ui.COLORS.trade)
            .setDescription(
                `Kamu menawarkan: ${giveLabel}\n\n` +
                `Sekarang pilih **siapa** yang mau diajak trade dari menu di bawah 👇\n` +
                `> Nanti kamu tinggal isi barang yang kamu minta.`
            )
            .setFooter({ text: ui.footer('Tinggal klik nama — nggak perlu copy User ID lagi!') });

        const pickRow = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`trade_targetpick_${userId}`)
                .setPlaceholder('🤝 Pilih lawan trade...')
                .setMinValues(1).setMaxValues(1)
        );
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`trade_offer_${userId}`).setLabel('🔙 Pilih item lain').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [pickRow, backRow] });
    }

    // === ACCEPT selected ===
    if (customId.startsWith('trade_acceptselect_')) {
        const tradeId = parseInt(interaction.values[0]);
        return processTradeAccept(interaction, guildId, userId, tradeId);
    }

    // === REJECT selected ===
    if (customId.startsWith('trade_rejectselect_')) {
        const tradeId = parseInt(interaction.values[0]);
        return processTradeReject(interaction, guildId, userId, tradeId);
    }
}

// ============ HANDLER: Trade user-select (target picker) ============
async function handleTradeUserSelect(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    if (!customId.startsWith('trade_targetpick_')) return;

    const pendingKey = `${guildId}_${userId}`;
    const pendingGive = pendingTradeGive.get(pendingKey);
    if (!pendingGive) {
        return interaction.reply({ content: '❌ Sesi offer kadaluarsa. Mulai lagi dari tombol Offer.', ephemeral: true });
    }

    const targetUserId = interaction.values[0];
    if (targetUserId === userId) {
        return interaction.reply({ content: '❌ Tidak bisa trade dengan diri sendiri! Pilih orang lain.', ephemeral: true });
    }
    const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
    if (targetMember && targetMember.user.bot) {
        return interaction.reply({ content: '❌ Tidak bisa trade dengan bot! Pilih pemain lain.', ephemeral: true });
    }

    // Remember the chosen target alongside the give-item.
    pendingTradeGive.set(pendingKey, { ...pendingGive, targetUserId });

    // Show the modal that now only asks what you WANT (+ money amount if giving money).
    const modal = new ModalBuilder()
        .setCustomId(`trade_modal_offer_${userId}`)
        .setTitle('📤 Lengkapi Trade Offer');

    const wantInput = new TextInputBuilder()
        .setCustomId('trade_want')
        .setLabel('Yang kamu minta sebagai gantinya')
        .setPlaceholder('fish:5 / relic:2 / pet:3 / money:1000')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(wantInput));

    if (pendingGive.type === 'money') {
        const amountInput = new TextInputBuilder()
            .setCustomId('trade_money_amount')
            .setLabel('Jumlah money yang kamu berikan')
            .setPlaceholder('Contoh: 1000')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10);
        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
    }

    return interaction.showModal(modal);
}

// ============ CORE: process an accept ============
async function processTradeAccept(interaction, guildId, userId, tradeId) {
    if (isNaN(tradeId)) {
        return interaction.reply({ content: '❌ Trade ID tidak valid!', ephemeral: true });
    }

    const trade = db.prepare('SELECT * FROM trades WHERE id = ? AND guildId = ? AND receiverId = ? AND status = ?').get(tradeId, guildId, userId, 'pending');
    if (!trade) {
        return interaction.reply({ content: '❌ Trade tidak ditemukan atau bukan untuk kamu!', ephemeral: true });
    }

    // Check expiry
    if (Date.now() - trade.createdAt > 86400000) {
        db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('expired', tradeId);
        return interaction.reply({ content: '❌ Trade sudah expired (>24 jam)!', ephemeral: true });
    }

    const senderGive = parseTradeItem(trade.senderOffer);
    const senderWant = parseTradeItem(trade.receiverOffer);
    if (!senderGive || !senderWant) {
        return interaction.reply({ content: '❌ Trade data corrupt!', ephemeral: true });
    }

    // Validate sender still has their offered item
    if (senderGive.type === 'fish') {
        const fish = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(senderGive.id), guildId, trade.senderId);
        if (!fish) return interaction.reply({ content: '❌ Sender sudah tidak punya item tersebut!', ephemeral: true });
    }
    if (senderGive.type === 'relic') {
        const relic = db.prepare('SELECT * FROM relics WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(senderGive.id), guildId, trade.senderId);
        if (!relic) return interaction.reply({ content: '❌ Sender sudah tidak punya relic tersebut!', ephemeral: true });
    }
    if (senderGive.type === 'money') {
        const senderData = getOrCreateUser(guildId, trade.senderId);
        if (senderData.balance < parseInt(senderGive.id)) return interaction.reply({ content: '❌ Sender tidak punya cukup money!', ephemeral: true });
    }
    if (senderGive.type === 'pet') {
        const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(senderGive.id), guildId, trade.senderId);
        if (!pet) return interaction.reply({ content: '❌ Sender sudah tidak punya pet tersebut!', ephemeral: true });
    }
    if (senderGive.type === 'card') {
        const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ? AND userId = ?').get(parseInt(senderGive.id), trade.senderId);
        if (!card) return interaction.reply({ content: '❌ Sender sudah tidak punya kartu tersebut!', ephemeral: true });
    }

    // Validate receiver (current user) has what sender wants
    const receiverData = getOrCreateUser(guildId, userId);
    if (senderWant.type === 'fish') {
        const fish = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(senderWant.id), guildId, userId);
        if (!fish) return interaction.reply({ content: '❌ Kamu tidak punya fish yang diminta!', ephemeral: true });
    }
    if (senderWant.type === 'relic') {
        const relic = db.prepare('SELECT * FROM relics WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(senderWant.id), guildId, userId);
        if (!relic) return interaction.reply({ content: '❌ Kamu tidak punya relic yang diminta!', ephemeral: true });
    }
    if (senderWant.type === 'money') {
        if (receiverData.balance < parseInt(senderWant.id)) return interaction.reply({ content: '❌ Saldo kamu kurang untuk trade ini!', ephemeral: true });
    }
    if (senderWant.type === 'pet') {
        const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(senderWant.id), guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Kamu tidak punya pet yang diminta!', ephemeral: true });
    }
    if (senderWant.type === 'card') {
        const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ? AND userId = ?').get(parseInt(senderWant.id), userId);
        if (!card) return interaction.reply({ content: '❌ Kamu tidak punya kartu yang diminta!', ephemeral: true });
    }

    // Execute trade: sender's offer -> receiver
    if (senderGive.type === 'fish') { db.prepare('UPDATE fish_inventory SET userId = ? WHERE id = ? AND guildId = ?').run(userId, parseInt(senderGive.id), guildId); }
    if (senderGive.type === 'relic') { db.prepare('UPDATE relics SET userId = ? WHERE id = ? AND guildId = ?').run(userId, parseInt(senderGive.id), guildId); }
    if (senderGive.type === 'money') { db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(parseInt(senderGive.id), guildId, trade.senderId); db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(parseInt(senderGive.id), guildId, userId); }
    if (senderGive.type === 'pet') { db.prepare('UPDATE pets SET userId = ?, active = 0 WHERE id = ? AND guildId = ?').run(userId, parseInt(senderGive.id), guildId); }
    if (senderGive.type === 'card') { db.prepare('UPDATE pokemon_cards SET userId = ? WHERE id = ?').run(userId, parseInt(senderGive.id)); }

    // receiver's offer -> sender
    if (senderWant.type === 'fish') { db.prepare('UPDATE fish_inventory SET userId = ? WHERE id = ? AND guildId = ?').run(trade.senderId, parseInt(senderWant.id), guildId); }
    if (senderWant.type === 'relic') { db.prepare('UPDATE relics SET userId = ? WHERE id = ? AND guildId = ?').run(trade.senderId, parseInt(senderWant.id), guildId); }
    if (senderWant.type === 'money') { db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(parseInt(senderWant.id), guildId, userId); db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(parseInt(senderWant.id), guildId, trade.senderId); }
    if (senderWant.type === 'pet') { db.prepare('UPDATE pets SET userId = ?, active = 0 WHERE id = ? AND guildId = ?').run(trade.senderId, parseInt(senderWant.id), guildId); }
    if (senderWant.type === 'card') { db.prepare('UPDATE pokemon_cards SET userId = ? WHERE id = ?').run(trade.senderId, parseInt(senderWant.id)); }

    db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('completed', tradeId);

    updateQuestProgress(guildId, userId, 'trade', 1);
    updateQuestProgress(guildId, trade.senderId, 'trade', 1);
    incrementUserStat(guildId, userId, 'trades_completed');
    incrementUserStat(guildId, trade.senderId, 'trades_completed');

    const giveDisplay = getItemDisplayName(senderGive.type, senderGive.id, guildId);
    const wantDisplay = getItemDisplayName(senderWant.type, senderWant.id, guildId);

    const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('✅ Trade Complete!')
        .setDescription(
            `Trade **#${tradeId}** berhasil!\n\n` +
            `> <@${trade.senderId}> memberikan: ${giveDisplay}\n` +
            `> <@${userId}> memberikan: ${wantDisplay}\n\n` +
            `🎉 Kedua pihak sudah menerima item masing-masing!`
        )
        .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trade_back_${userId}`).setLabel('🔙 Kembali ke Panel').setStyle(ButtonStyle.Secondary)
    );

    try { await notifyTradeAccepted(interaction.client, guildId, trade.senderId, userId, tradeId); } catch (e) {}

    return interaction.update({ embeds: [embed], components: [row] });
}

// ============ CORE: process a reject/cancel ============
async function processTradeReject(interaction, guildId, userId, tradeId) {
    if (isNaN(tradeId)) {
        return interaction.reply({ content: '❌ Trade ID tidak valid!', ephemeral: true });
    }

    const trade = db.prepare('SELECT * FROM trades WHERE id = ? AND guildId = ? AND (receiverId = ? OR senderId = ?) AND status = ?').get(tradeId, guildId, userId, userId, 'pending');
    if (!trade) {
        return interaction.reply({ content: '❌ Trade tidak ditemukan atau bukan milik kamu!', ephemeral: true });
    }

    const isSender = trade.senderId === userId;
    db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('rejected', tradeId);

    const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('❌ Trade Rejected')
        .setDescription(
            `Trade **#${tradeId}** telah ${isSender ? 'dibatalkan' : 'ditolak'}.\n\n` +
            `> 📤 Offer: \`${trade.senderOffer}\`\n` +
            `> 📥 Want: \`${trade.receiverOffer}\`\n\n` +
            `${isSender ? '🗑️ Kamu membatalkan trade yang kamu kirim.' : '❌ Trade dari <@' + trade.senderId + '> ditolak.'}`
        )
        .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trade_back_${userId}`).setLabel('🔙 Kembali ke Panel').setStyle(ButtonStyle.Secondary)
    );

    return interaction.update({ embeds: [embed], components: [row] });
}

// ============ HANDLER: Trade modal submissions ============
async function handleTradeModal(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];
    const action = parts[2]; // offer

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan modal kamu!', ephemeral: true });
    }

    // === CARD ID SUBMISSION: show preview + confirm ===
    if (action === 'card') {
        const cardIdStr = interaction.fields.getTextInputValue('card_id').trim();
        const cardId = parseInt(cardIdStr);
        if (isNaN(cardId)) return interaction.reply({ content: '❌ ID harus berupa angka!', ephemeral: true });

        const card = db.prepare('SELECT * FROM pokemon_cards WHERE id = ? AND userId = ?').get(cardId, userId);
        if (!card) return interaction.reply({ content: `❌ Kartu dengan ID **${cardId}** tidak ditemukan di koleksimu!\n> Cek ID di /card → Collection.`, ephemeral: true });

        const RARITIES = require('./cardGame').RARITIES;
        const r = RARITIES[card.rarity] || { emoji: '⚪', color: '#AAA' };

        const embed = new EmbedBuilder()
            .setTitle('🃏 Konfirmasi Trade Kartu')
            .setColor(r.color || '#E74C3C')
            .setDescription(
                `Apakah kamu yakin ingin **trade** kartu ini?\n\n` +
                `> ${r.emoji} **${card.name}**\n` +
                `> 📦 Set: *${card.setName}*\n` +
                `> ⭐ Rarity: ${card.rarity}\n` +
                (card.types ? `> 🔥 Type: ${card.types}\n` : '') +
                (card.hp ? `> ❤️ HP: ${card.hp}\n` : '') +
                `> 🆔 ID: \`${card.id}\`\n\n` +
                `⚠️ Kartu akan **hilang** dari koleksimu setelah trade berhasil!`
            )
            .setImage(card.imageUrl || null)
            .setFooter({ text: 'Klik Confirm untuk lanjut pilih lawan trade' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`trade_cardconfirm_${cardId}_${userId}`).setLabel('✅ Confirm').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`trade_cardcancel_0_${userId}`).setLabel('❌ Batal').setStyle(ButtonStyle.Danger),
        );

        return interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
    }

    // === OFFER SUBMISSION ===
    if (action === 'offer') {
        const pendingKey = `${guildId}_${userId}`;
        const pendingGive = pendingTradeGive.get(pendingKey);
        if (!pendingGive) {
            return interaction.reply({ content: '❌ Sesi offer kadaluarsa. Silakan pilih item lagi dari menu Offer.', ephemeral: true });
        }

        const targetUserId = pendingGive.targetUserId;
        if (!targetUserId) {
            return interaction.reply({ content: '❌ Lawan trade belum dipilih. Mulai lagi dari tombol Offer.', ephemeral: true });
        }
        const want = interaction.fields.getTextInputValue('trade_want').trim().toLowerCase();

        // Build the "give" string from the stored selection
        let give;
        if (pendingGive.type === 'money') {
            const amount = parseInt(interaction.fields.getTextInputValue('trade_money_amount').trim());
            if (isNaN(amount) || amount <= 0) {
                return interaction.reply({ content: '❌ Jumlah money harus angka positif!', ephemeral: true });
            }
            give = `money:${amount}`;
        } else {
            give = `${pendingGive.type}:${pendingGive.id}`;
        }

        // Validate target (already picked via dropdown, but re-check it still exists)
        if (targetUserId === userId) {
            return interaction.reply({ content: '❌ Tidak bisa trade dengan diri sendiri!', ephemeral: true });
        }
        let targetMember;
        try {
            targetMember = await interaction.guild.members.fetch(targetUserId);
        } catch (e) {
            return interaction.reply({ content: '❌ User tujuan sudah tidak ada di server ini!', ephemeral: true });
        }
        if (targetMember.user.bot) {
            return interaction.reply({ content: '❌ Tidak bisa trade dengan bot!', ephemeral: true });
        }

        // Parse items
        const giveItem = parseTradeItem(give);
        const wantItem = parseTradeItem(want);
        if (!giveItem || !wantItem) {
            return interaction.reply({ content: '❌ Format permintaan salah! Gunakan: `fish:ID`, `relic:ID`, `pet:ID`, atau `money:JUMLAH`\n\n> Contoh: `fish:5` atau `money:500`', ephemeral: true });
        }

        const userData = getOrCreateUser(guildId, userId);

        // Validate ownership of offered item
        if (giveItem.type === 'fish') {
            const fish = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(giveItem.id), guildId, userId);
            if (!fish) return interaction.reply({ content: '❌ Ikan tidak ditemukan di inventory kamu!', ephemeral: true });
        }
        if (giveItem.type === 'relic') {
            const relic = db.prepare('SELECT * FROM relics WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(giveItem.id), guildId, userId);
            if (!relic) return interaction.reply({ content: '❌ Relic tidak ditemukan!', ephemeral: true });
        }
        if (giveItem.type === 'money') {
            const amount = parseInt(giveItem.id);
            if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '❌ Jumlah money harus angka positif!', ephemeral: true });
            if (userData.balance < amount) return interaction.reply({ content: `❌ Saldo kurang! Kamu punya 🪙 ${userData.balance.toLocaleString('id-ID')}`, ephemeral: true });
        }
        if (giveItem.type === 'pet') {
            const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(giveItem.id), guildId, userId);
            if (!pet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
        }

        // Create trade
        db.prepare('INSERT INTO trades (guildId, senderId, receiverId, status, createdAt, senderOffer, receiverOffer) VALUES (?, ?, ?, ?, ?, ?, ?)').run(guildId, userId, targetUserId, 'pending', Date.now(), give, want);
        const tradeId = db.prepare('SELECT last_insert_rowid() as id').get().id;
        pendingTradeGive.delete(pendingKey);

        const giveDisplay = getItemDisplayName(giveItem.type, giveItem.id, guildId);
        const wantDisplay = getItemDisplayName(wantItem.type, wantItem.id, guildId);

        const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('🔄 Trade Offer Sent!')
            .setDescription(
                `<@${userId}> → <@${targetUserId}>\n\n` +
                `> 📤 **Menawarkan:** ${giveDisplay}\n` +
                `> 📥 **Meminta:** ${wantDisplay}\n` +
                `> 🆔 Trade ID: **#${tradeId}**\n\n` +
                `<@${targetUserId}> buka \`/trade\` → Accept untuk menerima!`
            )
            .setFooter({ text: 'Trade berlaku 24 jam' })
            .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`trade_back_${userId}`).setLabel('🔙 Kembali ke Panel').setStyle(ButtonStyle.Secondary)
        );

        try { await notifyTradeReceived(interaction.client, guildId, targetUserId, userId, tradeId); } catch (e) {}

        return interaction.reply({ embeds: [embed], components: [row] });
    }
}

// ============ UTILITY: Detection helpers ============
function isTradePanelButton(customId) {
    return customId.startsWith('trade_')
        && !customId.startsWith('trade_modal_')
        && !customId.startsWith('trade_giveselect_')
        && !customId.startsWith('trade_acceptselect_')
        && !customId.startsWith('trade_rejectselect_')
        && !customId.startsWith('trade_targetpick_');
}

function isTradePanelSelectMenu(customId) {
    return customId.startsWith('trade_giveselect_')
        || customId.startsWith('trade_acceptselect_')
        || customId.startsWith('trade_rejectselect_');
}

function isTradePanelUserSelect(customId) {
    return customId.startsWith('trade_targetpick_');
}

function isTradePanelModal(customId) {
    return customId.startsWith('trade_modal_');
}

module.exports = {
    buildTradePanel,
    handleTradeCommand,
    handleTradeButton,
    handleTradeSelectMenu,
    handleTradeUserSelect,
    handleTradeModal,
    isTradePanelButton,
    isTradePanelSelectMenu,
    isTradePanelUserSelect,
    isTradePanelModal
};
