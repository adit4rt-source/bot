// systems/economyPanel.js - Economy Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser, getUserStat, incrementUserStat } = require('../database');
const { checkAchievements } = require('./achievements');
const { GIFT_TAX_RATE, GIFT_MAX_PER_TRANSACTION, GIFT_RECEIVE_LIMIT_PER_DAY, getGiftReceivedToday, addGiftReceivedToday } = require('./slots');

// Gift cooldown (per sender): 10 seconds
const giftCooldowns = new Map();


// ============ BUILD: Main Economy Panel ============
function buildEconomyPanel(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);
    const cfWins = getUserStat(guildId, userId, 'coinflip_wins') || 0;
    const slotWins = getUserStat(guildId, userId, 'slot_wins') || 0;
    const totalBuys = getUserStat(guildId, userId, 'total_buys') || 0;

    const embed = new EmbedBuilder()
        .setTitle(`\ud83d\udcb0 ECONOMY \u2014 ${username}`)
        .setColor('#F1C40F')
        .setDescription(
            `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n` +
            `\ud83e\ude99 Saldo: **${userData.balance.toLocaleString('id-ID')}**\n` +
            `\ud83d\udcc8 Level: **${userData.level}** | \u2728 EXP: **${userData.xp}/${(userData.level + 1) * 100}**\n` +
            `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n` +
            `> \ud83d\udcb3 **Balance** \u2014 Cek saldo detail\n` +
            `> \ud83c\udf81 **Daily** \u2014 Klaim hadiah harian\n` +
            `> \ud83c\udfb0 **Casino** \u2014 Buka panel gambling\n` +
            `> \ud83c\udf81 **Gift** \u2014 Kirim money ke player lain\n` +
            `> \ud83c\udf9f\ufe0f **Redeem** \u2014 Tukar kode voucher\n` +
            `> \ud83c\udfc6 **Leaderboard** \u2014 Ranking global\n` +
            `> \ud83d\uded2 **Shop** \u2014 Beli item & role`
        )
        .setFooter({ text: `\ud83c\udfb2 CF Wins: ${cfWins} | \ud83c\udfb0 Slot Wins: ${slotWins} | \ud83d\uded2 Total Buys: ${totalBuys}` })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ecopnl_balance_${userId}`).setLabel('\ud83d\udcb3 Balance').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ecopnl_daily_${userId}`).setLabel('\ud83c\udf81 Daily').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ecopnl_casino_${userId}`).setLabel('\ud83c\udfb0 Casino').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ecopnl_gift_${userId}`).setLabel('\ud83c\udf81 Gift').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ecopnl_redeem_${userId}`).setLabel('\ud83c\udf9f\ufe0f Redeem').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ecopnl_leaderboard_${userId}`).setLabel('\ud83c\udfc6 Leaderboard').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ecopnl_shop_${userId}`).setLabel('\ud83d\uded2 Shop').setStyle(ButtonStyle.Success)
    );

    return { embeds: [embed], components: [row1, row2] };
}


// ============ HANDLER: /economypanel command ============
async function handleEconomyPanelCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const panel = buildEconomyPanel(guildId, userId, interaction.user.username);
    return interaction.reply(panel);
}

// ============ HANDLER: Economy panel button clicks ============
async function handleEconomyButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '\u274c Ini bukan panel kamu!', ephemeral: true });
    }

    const action = parts[1];

    // === BACK TO MAIN ===
    if (action === 'back') {
        return interaction.update(buildEconomyPanel(guildId, userId, interaction.user.username));
    }

    // === BALANCE DETAIL ===
    if (action === 'balance') {
        const userData = getOrCreateUser(guildId, userId);
        const totalEarned = getUserStat(guildId, userId, 'slot_total_winnings') || 0;
        const rouletteWin = getUserStat(guildId, userId, 'roulette_total_winnings') || 0;
        const embed = new EmbedBuilder()
            .setTitle(`\ud83d\udcb3 Balance Detail \u2014 ${interaction.user.username}`)
            .setColor('#F1C40F')
            .setDescription(
                `> \ud83e\ude99 **Saldo:** ${userData.balance.toLocaleString('id-ID')}\n` +
                `> \ud83d\udcc8 **Level:** ${userData.level}\n` +
                `> \u2728 **EXP:** ${userData.xp}/${(userData.level + 1) * 100}\n\n` +
                `\ud83d\udcca **Statistik:**\n` +
                `> \ud83c\udfb0 Slot Winnings: \ud83e\ude99 ${totalEarned.toLocaleString('id-ID')}\n` +
                `> \ud83c\udfaf Roulette Winnings: \ud83e\ude99 ${rouletteWin.toLocaleString('id-ID')}`
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ecopnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }


    // === DAILY (redirect info) ===
    if (action === 'daily') {
        const embed = new EmbedBuilder()
            .setTitle('\ud83c\udf81 Daily Reward')
            .setColor('#2ECC71')
            .setDescription('Gunakan command `/daily` untuk klaim hadiah harian!\n\n> \ud83e\ude99 Money random\n> \u2728 EXP bonus\n> \ud83d\udce6 Chance item')
            .setFooter({ text: 'Ketik /daily di chat' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ecopnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === CASINO (redirect to /casino) ===
    if (action === 'casino') {
        const { buildCasinoPanel } = require('./casinoPanel');
        const panel = buildCasinoPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    // === GIFT (modal) ===
    if (action === 'gift') {
        const modal = new ModalBuilder().setCustomId(`ecopnl_modal_gift_${userId}`).setTitle('\ud83c\udf81 Gift Money');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gift_target').setLabel('User ID penerima').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Klik kanan user > Copy ID')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gift_amount').setLabel('Jumlah (Max: 10,000)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Contoh: 1000'))
        );
        return interaction.showModal(modal);
    }

    // === REDEEM (modal) ===
    if (action === 'redeem') {
        const modal = new ModalBuilder().setCustomId(`ecopnl_modal_redeem_${userId}`).setTitle('\ud83c\udf9f\ufe0f Redeem Voucher');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('voucher_code').setLabel('Kode Voucher').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Masukkan kode'))
        );
        return interaction.showModal(modal);
    }


    // === LEADERBOARD ===
    if (action === 'leaderboard') {
        const data = db.prepare('SELECT * FROM users WHERE guildId = ? ORDER BY balance DESC LIMIT 10').all(guildId);
        let desc = data.length ? '' : '*Belum ada data.*';
        data.forEach((u, i) => {
            const medal = i === 0 ? '\ud83e\udd47' : i === 1 ? '\ud83e\udd48' : i === 2 ? '\ud83e\udd49' : `**${i + 1}.**`;
            desc += `${medal} <@${u.userId}> \u2014 \ud83e\ude99 **${u.balance.toLocaleString('id-ID')}**\n`;
        });
        const embed = new EmbedBuilder()
            .setTitle('\ud83c\udfc6 Money Leaderboard')
            .setColor('#FFD700')
            .setDescription(desc)
            .setFooter({ text: 'Top 10 Money | /economy leaderboard untuk kategori lain' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ecopnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === SHOP (redirect info) ===
    if (action === 'shop') {
        const embed = new EmbedBuilder()
            .setTitle('\ud83d\uded2 Shop')
            .setColor('#2ECC71')
            .setDescription('Gunakan command `/shop` untuk membuka toko lengkap!\n\n> \ud83c\udfa8 Role shop\n> \ud83d\udce6 Item virtual\n> \ud83c\udfa8 Custom Role\n> \ud83c\udfa3 Fishing shop (rod & bait)')
            .setFooter({ text: 'Ketik /shop di chat' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ecopnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
}


// ============ HANDLER: Economy panel modal submissions ============
async function handleEconomyModal(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '\u274c Ini bukan panel kamu!', ephemeral: true });
    }

    // === GIFT MODAL ===
    if (parts[2] === 'gift') {
        const targetId = interaction.fields.getTextInputValue('gift_target').trim();
        const amount = parseInt(interaction.fields.getTextInputValue('gift_amount'));
        if (isNaN(amount) || amount < 1 || amount > GIFT_MAX_PER_TRANSACTION) return interaction.reply({ content: `\u274c Jumlah tidak valid (1-${GIFT_MAX_PER_TRANSACTION.toLocaleString('id-ID')})!`, ephemeral: true });
        if (!/^\d{16,20}$/.test(targetId)) return interaction.reply({ content: '\u274c User ID tidak valid! Klik kanan user > Copy ID.', ephemeral: true });
        if (targetId === userId) return interaction.reply({ content: '\u274c Tidak bisa kirim ke diri sendiri!', ephemeral: true });

        // Cooldown (10s per sender)
        const cdKey = `${guildId}_${userId}`;
        if (giftCooldowns.has(cdKey) && Date.now() < giftCooldowns.get(cdKey)) {
            const remaining = Math.ceil((giftCooldowns.get(cdKey) - Date.now()) / 1000);
            return interaction.reply({ content: `\u23f3 Tunggu **${remaining} detik** sebelum kirim gift lagi.`, ephemeral: true });
        }

        // Target must be a real, non-bot member of this guild
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!targetMember) return interaction.reply({ content: '\u274c User tidak ditemukan di server ini!', ephemeral: true });
        if (targetMember.user.bot) return interaction.reply({ content: '\u274c Tidak bisa kirim ke bot!', ephemeral: true });

        const userData = getOrCreateUser(guildId, userId);
        if (userData.balance < amount) return interaction.reply({ content: `\u274c Saldo kurang! Kamu punya \ud83e\ude99 **${userData.balance.toLocaleString('id-ID')}**`, ephemeral: true });

        // Daily receive limit for the recipient
        const receivedToday = getGiftReceivedToday(guildId, targetId);
        if (receivedToday + amount > GIFT_RECEIVE_LIMIT_PER_DAY) {
            const sisa = Math.max(0, GIFT_RECEIVE_LIMIT_PER_DAY - receivedToday);
            return interaction.reply({ content: `\u274c <@${targetId}> sudah mencapai batas terima harian (\ud83e\ude99 ${GIFT_RECEIVE_LIMIT_PER_DAY.toLocaleString('id-ID')}/hari). Sisa kuota: \ud83e\ude99 ${sisa.toLocaleString('id-ID')}`, allowedMentions: { users: [] }, ephemeral: true });
        }

        // Tax-free voucher (consumes 1 if active)
        const hasTaxFree = getUserStat(guildId, userId, 'tax_free_voucher') > 0;
        const tax = hasTaxFree ? 0 : Math.floor(amount * GIFT_TAX_RATE);
        const net = amount - tax;
        if (hasTaxFree) incrementUserStat(guildId, userId, 'tax_free_voucher', -1);

        giftCooldowns.set(cdKey, Date.now() + 10000);

        // Transfer
        userData.balance -= amount;
        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, userId);
        const tData = getOrCreateUser(guildId, targetId);
        tData.balance += net;
        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(tData.balance, guildId, targetId);
        addGiftReceivedToday(guildId, targetId, net);
        incrementUserStat(guildId, userId, 'total_gifts_sent');
        incrementUserStat(guildId, userId, 'total_gift_amount', amount);
        await checkAchievements(interaction.guild, userId, { type: 'gift_send' });
        await checkAchievements(interaction.guild, targetId, { type: 'gift_receive' });

        const embed = new EmbedBuilder().setColor('#FF69B4').setTitle('\ud83c\udf81 Gift Terkirim!')
            .setDescription(`<@${userId}> \u279c <@${targetId}>\n\n> \ud83d\udcb0 **Jumlah:** \ud83e\ude99 ${amount.toLocaleString('id-ID')}\n> \ud83d\udcca **Pajak (${hasTaxFree ? 'FREE!' : '10%'}):** \ud83e\ude99 ${tax.toLocaleString('id-ID')}${hasTaxFree ? ' *(Tax-Free Voucher)*' : ''}\n> \u2705 **Diterima:** \ud83e\ude99 ${net.toLocaleString('id-ID')}`)
            .setFooter({ text: `Saldo kamu: ${userData.balance.toLocaleString('id-ID')} | Limit harian penerima: ${(receivedToday + net).toLocaleString('id-ID')}/${GIFT_RECEIVE_LIMIT_PER_DAY.toLocaleString('id-ID')}` })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], allowedMentions: { users: [] } });
    }

    // === REDEEM MODAL ===
    if (parts[2] === 'redeem') {
        const code = interaction.fields.getTextInputValue('voucher_code').toUpperCase().trim();
        const voucher = db.prepare('SELECT * FROM vouchers WHERE guildId = ? AND code = ?').get(guildId, code);
        if (!voucher) return interaction.reply({ content: '\u274c Kode tidak valid!', ephemeral: true });
        if (voucher.current_uses >= voucher.max_uses) return interaction.reply({ content: '\u274c Voucher sudah habis!', ephemeral: true });
        const alreadyClaimed = db.prepare('SELECT * FROM voucher_claims WHERE guildId = ? AND code = ? AND userId = ?').get(guildId, code, userId);
        if (alreadyClaimed) return interaction.reply({ content: '\u274c Kamu sudah klaim voucher ini!', ephemeral: true });
        db.prepare('UPDATE vouchers SET current_uses = current_uses + 1 WHERE guildId = ? AND code = ?').run(guildId, code);
        db.prepare('INSERT INTO voucher_claims (guildId, code, userId) VALUES (?, ?, ?)').run(guildId, code, userId);
        const userData = getOrCreateUser(guildId, userId);
        userData.balance += voucher.reward;
        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, userId);
        return interaction.reply({ content: `\u2705 Voucher **${code}** berhasil! Dapat \ud83e\ude99 **${voucher.reward.toLocaleString('id-ID')}**\n> Saldo: \ud83e\ude99 **${userData.balance.toLocaleString('id-ID')}**` });
    }
}

// ============ UTILITY: Detection helpers ============
function isEconomyPanelButton(customId) {
    return customId.startsWith('ecopnl_') && !customId.startsWith('ecopnl_modal_');
}

function isEconomyPanelModal(customId) {
    return customId.startsWith('ecopnl_modal_');
}

module.exports = {
    buildEconomyPanel,
    handleEconomyPanelCommand,
    handleEconomyButton,
    handleEconomyModal,
    isEconomyPanelButton,
    isEconomyPanelModal
};
