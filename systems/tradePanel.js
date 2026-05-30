// systems/tradePanel.js - Trade Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser } = require('../database');
const { updateQuestProgress } = require('./quests');
const { PET_DATA } = require('../data/pets');
const { FISH_DATA } = require('../data/fish');

// ============ HELPER: Parse trade item string ============
function parseTradeItem(str) {
    const parts = str.split(':');
    if (parts.length !== 2) return null;
    const [type, id] = parts;
    if (!['fish', 'relic', 'money', 'pet'].includes(type)) return null;
    return { type, id };
}

// ============ HELPER: Get item display name ============
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
    return `❓ Unknown`;
}

// ============ BUILD: Main Trade Panel ============
function buildTradePanel(guildId, userId, username) {
    const sentPending = db.prepare('SELECT COUNT(*) as cnt FROM trades WHERE guildId = ? AND senderId = ? AND status = ?').get(guildId, userId, 'pending');
    const receivedPending = db.prepare('SELECT COUNT(*) as cnt FROM trades WHERE guildId = ? AND receiverId = ? AND status = ?').get(guildId, userId, 'pending');

    const embed = new EmbedBuilder()
        .setTitle(`🔄 TRADE PANEL — ${username}`)
        .setColor('#3498DB')
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📤 Pending Sent: **${sentPending.cnt}** | 📥 Pending Received: **${receivedPending.cnt}**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `> 📤 **Offer** — Tawarkan trade ke player lain\n` +
            `> 📋 **List** — Lihat trade yang pending\n` +
            `> ✅ **Accept** — Terima trade (masukkan ID)\n` +
            `> ❌ **Reject** — Tolak trade (masukkan ID)\n\n` +
            `💡 *Format item:* \`fish:ID\` \`relic:ID\` \`pet:ID\` \`money:JUMLAH\``
        )
        .setFooter({ text: 'Trade berlaku 24 jam setelah dibuat' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trade_offer_${userId}`).setLabel('📤 Offer').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`trade_list_${userId}`).setLabel('📋 List').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`trade_accept_${userId}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`trade_reject_${userId}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row] };
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

    // === OFFER: Show Modal ===
    if (action === 'offer') {
        const modal = new ModalBuilder()
            .setCustomId(`trade_modal_offer_${userId}`)
            .setTitle('📤 Buat Trade Offer');

        const userInput = new TextInputBuilder()
            .setCustomId('trade_target_user')
            .setLabel('User ID yang dituju')
            .setPlaceholder('Contoh: 123456789012345678')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(20);

        const giveInput = new TextInputBuilder()
            .setCustomId('trade_give')
            .setLabel('Yang kamu kasih')
            .setPlaceholder('fish:5 / relic:2 / pet:3 / money:1000')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const wantInput = new TextInputBuilder()
            .setCustomId('trade_want')
            .setLabel('Yang kamu minta')
            .setPlaceholder('fish:5 / relic:2 / pet:3 / money:1000')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(userInput),
            new ActionRowBuilder().addComponents(giveInput),
            new ActionRowBuilder().addComponents(wantInput)
        );

        return interaction.showModal(modal);
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
            const giveDisplay = getItemDisplayName(...t.senderOffer.split(':').length === 2 ? [t.senderOffer.split(':')[0], t.senderOffer.split(':')[1], guildId] : ['money', '0', guildId]);
            const wantDisplay = getItemDisplayName(...t.receiverOffer.split(':').length === 2 ? [t.receiverOffer.split(':')[0], t.receiverOffer.split(':')[1], guildId] : ['money', '0', guildId]);

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
            .setFooter({ text: 'Gunakan Accept/Reject dengan Trade ID' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`trade_accept_${userId}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`trade_reject_${userId}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`trade_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );

        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === ACCEPT: Show Modal for Trade ID ===
    if (action === 'accept') {
        const modal = new ModalBuilder()
            .setCustomId(`trade_modal_accept_${userId}`)
            .setTitle('✅ Accept Trade');

        const idInput = new TextInputBuilder()
            .setCustomId('trade_id')
            .setLabel('Masukkan Trade ID')
            .setPlaceholder('Contoh: 5')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10);

        modal.addComponents(new ActionRowBuilder().addComponents(idInput));
        return interaction.showModal(modal);
    }

    // === REJECT: Show Modal for Trade ID ===
    if (action === 'reject') {
        const modal = new ModalBuilder()
            .setCustomId(`trade_modal_reject_${userId}`)
            .setTitle('❌ Reject Trade');

        const idInput = new TextInputBuilder()
            .setCustomId('trade_id')
            .setLabel('Masukkan Trade ID')
            .setPlaceholder('Contoh: 5')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10);

        modal.addComponents(new ActionRowBuilder().addComponents(idInput));
        return interaction.showModal(modal);
    }
}

// ============ HANDLER: Trade modal submissions ============
async function handleTradeModal(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];
    const action = parts[2]; // modal_offer, modal_accept, modal_reject

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan modal kamu!', ephemeral: true });
    }

    // === OFFER SUBMISSION ===
    if (action === 'offer') {
        const targetUserId = interaction.fields.getTextInputValue('trade_target_user').trim();
        const give = interaction.fields.getTextInputValue('trade_give').trim().toLowerCase();
        const want = interaction.fields.getTextInputValue('trade_want').trim().toLowerCase();

        // Validate target user
        if (targetUserId === userId) {
            return interaction.reply({ content: '❌ Tidak bisa trade dengan diri sendiri!', ephemeral: true });
        }

        // Verify target user exists in guild
        let targetMember;
        try {
            targetMember = await interaction.guild.members.fetch(targetUserId);
        } catch (e) {
            return interaction.reply({ content: '❌ User tidak ditemukan di server ini! Pastikan User ID benar.', ephemeral: true });
        }

        if (targetMember.user.bot) {
            return interaction.reply({ content: '❌ Tidak bisa trade dengan bot!', ephemeral: true });
        }

        // Parse items
        const giveItem = parseTradeItem(give);
        const wantItem = parseTradeItem(want);

        if (!giveItem || !wantItem) {
            return interaction.reply({ content: '❌ Format salah! Gunakan: `fish:ID`, `relic:ID`, `pet:ID`, atau `money:JUMLAH`\n\n> Contoh: `fish:5` atau `money:500`', ephemeral: true });
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
                `<@${targetUserId}> gunakan \`/trade\` → Accept untuk menerima!`
            )
            .setFooter({ text: 'Trade berlaku 24 jam' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`trade_back_${userId}`).setLabel('🔙 Kembali ke Panel').setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({ embeds: [embed], components: [row] });
    }

    // === ACCEPT SUBMISSION ===
    if (action === 'accept') {
        const tradeIdStr = interaction.fields.getTextInputValue('trade_id').trim();
        const tradeId = parseInt(tradeIdStr);

        if (isNaN(tradeId)) {
            return interaction.reply({ content: '❌ Trade ID harus berupa angka!', ephemeral: true });
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

        // Parse items
        const senderGive = parseTradeItem(trade.senderOffer);
        const senderWant = parseTradeItem(trade.receiverOffer);

        if (!senderGive || !senderWant) {
            return interaction.reply({ content: '❌ Trade data corrupt!', ephemeral: true });
        }

        // Validate sender still has the item
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

        // Execute trade: Transfer sender's offer to receiver
        if (senderGive.type === 'fish') { db.prepare('UPDATE fish_inventory SET userId = ? WHERE id = ? AND guildId = ?').run(userId, parseInt(senderGive.id), guildId); }
        if (senderGive.type === 'relic') { db.prepare('UPDATE relics SET userId = ? WHERE id = ? AND guildId = ?').run(userId, parseInt(senderGive.id), guildId); }
        if (senderGive.type === 'money') { db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(parseInt(senderGive.id), guildId, trade.senderId); db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(parseInt(senderGive.id), guildId, userId); }
        if (senderGive.type === 'pet') { db.prepare('UPDATE pets SET userId = ?, active = 0 WHERE id = ? AND guildId = ?').run(userId, parseInt(senderGive.id), guildId); }

        // Transfer receiver's offer to sender
        if (senderWant.type === 'fish') { db.prepare('UPDATE fish_inventory SET userId = ? WHERE id = ? AND guildId = ?').run(trade.senderId, parseInt(senderWant.id), guildId); }
        if (senderWant.type === 'relic') { db.prepare('UPDATE relics SET userId = ? WHERE id = ? AND guildId = ?').run(trade.senderId, parseInt(senderWant.id), guildId); }
        if (senderWant.type === 'money') { db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(parseInt(senderWant.id), guildId, userId); db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(parseInt(senderWant.id), guildId, trade.senderId); }
        if (senderWant.type === 'pet') { db.prepare('UPDATE pets SET userId = ?, active = 0 WHERE id = ? AND guildId = ?').run(trade.senderId, parseInt(senderWant.id), guildId); }

        // Mark trade as completed
        db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('completed', tradeId);

        // Update quest progress for both parties
        updateQuestProgress(guildId, userId, 'trade', 1);
        updateQuestProgress(guildId, trade.senderId, 'trade', 1);

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

        return interaction.reply({ embeds: [embed], components: [row] });
    }

    // === REJECT SUBMISSION ===
    if (action === 'reject') {
        const tradeIdStr = interaction.fields.getTextInputValue('trade_id').trim();
        const tradeId = parseInt(tradeIdStr);

        if (isNaN(tradeId)) {
            return interaction.reply({ content: '❌ Trade ID harus berupa angka!', ephemeral: true });
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

        return interaction.reply({ embeds: [embed], components: [row] });
    }
}

// ============ UTILITY: Detection helpers ============
function isTradePanelButton(customId) {
    return customId.startsWith('trade_') && !customId.startsWith('trade_modal_');
}

function isTradePanelModal(customId) {
    return customId.startsWith('trade_modal_');
}

module.exports = {
    buildTradePanel,
    handleTradeCommand,
    handleTradeButton,
    handleTradeModal,
    isTradePanelButton,
    isTradePanelModal
};
