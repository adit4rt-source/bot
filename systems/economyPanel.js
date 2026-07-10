// systems/economyPanel.js - Economy Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder } = require('discord.js');
const { db, getOrCreateUser, getUserStat, incrementUserStat, checkGlobalMode, transferBalance } = require('../database');
const { checkAchievements } = require('./achievements');
const { GIFT_TAX_RATE, GIFT_MAX_PER_TRANSACTION, GIFT_RECEIVE_LIMIT_PER_DAY, getGiftReceivedToday, addGiftReceivedToday } = require('./slots');
const { updateQuestProgress } = require('./quests');
// Voucher scope harus konsisten dengan adminPanel: GLOBAL saat ekonomi global.
function voucherScope(guildId) { return checkGlobalMode() ? 'GLOBAL' : guildId; }
// Redeem voucher HANYA boleh di server utama (anti-exploit multi-akun: bikin akun
// di server lain lalu trade ke akun utama). Override via env REDEEM_GUILD_ID.
const REDEEM_GUILD_ID = process.env.REDEEM_GUILD_ID || '1056412836433240074';
const ui = require('./ui');

// Gift cooldown (per sender): 10 seconds
const giftCooldowns = new Map();


// ============ BUILD: Main Economy Panel ============
function buildEconomyPanel(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);
    const cfWins = getUserStat(guildId, userId, 'coinflip_wins') || 0;
    const slotWins = getUserStat(guildId, userId, 'slot_wins') || 0;
    const totalBuys = getUserStat(guildId, userId, 'total_buys') || 0;

    const embed = new EmbedBuilder()
        .setTitle(ui.title('💰', 'ECONOMY', username))
        .setColor(ui.COLORS.economy)
        .setDescription(
            `Pusat kendali keuangan kamu — semua soal duit ada di sini. 💵\n` +
            ui.statBlock([
                `${ui.money(userData.balance)}  •  📈 Level **${userData.level}**`,
                `✨ EXP: ${ui.progressLine(userData.xp, (userData.level + 1) * 100)}`,
            ]) +
            `\n**Mau ngapain hari ini?**\n` +
            ui.menuList([
                { emoji: '💳', label: 'Balance', desc: 'Lihat saldo lengkap & rincian statistikmu' },
                { emoji: '🎁', label: 'Daily', desc: 'Klaim hadiah harian — jangan putus streak!' },
                { emoji: '🎰', label: 'Casino', desc: 'Coba peruntungan: coinflip, slot, roulette, blackjack' },
                { emoji: '💸', label: 'Gift', desc: 'Transfer money ke teman (kena pajak kecil)' },
                { emoji: '🎟️', label: 'Redeem', desc: 'Punya kode voucher? Tukar jadi hadiah di sini' },
                { emoji: '🏆', label: 'Leaderboard', desc: 'Lihat siapa yang paling tajir di server' },
                { emoji: '🛒', label: 'Shop', desc: 'Belanja item, role, & perlengkapan' },
            ])
        )
        .setFooter({ text: ui.footer(`Menang Coinflip: ${cfWins} • Menang Slot: ${slotWins} • Belanja: ${totalBuys}x`) })
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
            .setTitle(ui.title('💳', 'Balance Detail', interaction.user.username))
            .setColor(ui.COLORS.economy)
            .setDescription(
                ui.statBlock([
                    `${ui.money(userData.balance)}`,
                    `📈 Level **${userData.level}**  •  ✨ ${userData.xp}/${(userData.level + 1) * 100} XP`,
                ]) +
                `\n📊 **Total Kemenangan Casino:**\n` +
                `> 🎰 Dari Slot: ${ui.money(totalEarned)}\n` +
                `> 🎯 Dari Roulette: ${ui.money(rouletteWin)}\n\n` +
                `> 💡 *Saldo dipakai untuk belanja, gift, dan taruhan casino.*`
            )
            .setFooter({ text: ui.footer('Rajin daily & menang casino untuk nambah saldo!') });
        const row = ui.backRow(`ecopnl_back_${userId}`);
        return interaction.update({ embeds: [embed], components: [row] });
    }


    // === DAILY (redirect info) ===
    if (action === 'daily') {
        const embed = new EmbedBuilder()
            .setTitle(ui.title('🎁', 'Daily Reward'))
            .setColor(ui.COLORS.success)
            .setDescription('Login tiap hari, dapat hadiah tiap hari! Ketik `/daily` untuk klaim:\n\n> 🪙 **Money** — jumlah acak tiap hari\n> ✨ **Bonus EXP** — bantu naik level\n> 📦 **Item kejutan** — kadang dapat, kadang nggak 😉\n> 🔥 **Streak** — makin lama login beruntun, makin gede hadiahnya!')
            .setFooter({ text: ui.footer('Bolong sehari = streak reset. Jangan sampai kelewat ya!') });
        const row = ui.backRow(`ecopnl_back_${userId}`);
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === CASINO (redirect to /casino) ===
    if (action === 'casino') {
        const { buildCasinoPanel } = require('./casinoPanel');
        const panel = buildCasinoPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    // === GIFT (step 1: pick recipient via dropdown — no more typing User ID) ===
    if (action === 'gift') {
        const embed = new EmbedBuilder()
            .setTitle(ui.title('💸', 'Gift Money'))
            .setColor(ui.COLORS.economy)
            .setDescription(
                `Pilih **siapa** yang mau kamu kasih money dari menu di bawah 👇\n\n` +
                `> 1️⃣ Pilih penerima dari daftar\n` +
                `> 2️⃣ Nanti kamu tinggal isi jumlahnya\n\n` +
                `> 💡 *Kena pajak ${Math.round(GIFT_TAX_RATE * 100)}% (kecuali punya Tax-Free Voucher). Max ${GIFT_MAX_PER_TRANSACTION.toLocaleString('id-ID')}/kirim.*`
            )
            .setFooter({ text: ui.footer('Tinggal klik nama — nggak perlu copy User ID lagi!') });
        const selectRow = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`ecopnl_giftpick_${userId}`)
                .setPlaceholder('🎁 Pilih penerima gift...')
                .setMinValues(1).setMaxValues(1)
        );
        const backRow = ui.backRow(`ecopnl_back_${userId}`);
        return interaction.update({ embeds: [embed], components: [selectRow, backRow] });
    }

    // === REDEEM (modal) ===
    if (action === 'redeem') {
        if (guildId !== REDEEM_GUILD_ID) {
            return interaction.reply({ content: `\u274c Redeem voucher hanya bisa dilakukan di server **ID Community**.\n> Saldo kamu global, jadi tetap kepakai di server mana pun. Cukup redeem di sana ya. \ud83d\ude0a`, ephemeral: true });
        }
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
            desc += `${ui.medal(i)} <@${u.userId}> — ${ui.money(u.balance)}\n`;
        });
        const embed = new EmbedBuilder()
            .setTitle(ui.title('🏆', 'Money Leaderboard'))
            .setColor(ui.COLORS.leaderboard)
            .setDescription(desc)
            .setFooter({ text: ui.footer('Top 10 Money • /levelpanel untuk ranking level') });
        const row = ui.backRow(`ecopnl_back_${userId}`);
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === SHOP (redirect info) ===
    if (action === 'shop') {
        const embed = new EmbedBuilder()
            .setTitle(ui.title('🛒', 'Shop'))
            .setColor(ui.COLORS.success)
            .setDescription('Buka toko lengkap dengan ketik `/shop` di chat. Yang bisa dibeli:\n\n> 🎨 **Role Shop** — role keren buat dipajang\n> 📦 **Item Virtual** — berbagai item berguna\n> 🎨 **Custom Role** — bikin role sendiri (nama & warna bebas!)\n> 🎣 **Fishing Shop** — joran & umpan buat mancing')
            .setFooter({ text: ui.footer('Semua pembelian langsung masuk ke inventory kamu') });
        const row = ui.backRow(`ecopnl_back_${userId}`);
        return interaction.update({ embeds: [embed], components: [row] });
    }
}


// ============ HANDLER: Economy panel user-select (gift recipient picker) ============
async function handleEconomySelect(interaction) {
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '\u274c Ini bukan panel kamu!', ephemeral: true });
    }

    // === GIFT: recipient picked → ask amount via modal ===
    if (parts[1] === 'giftpick') {
        const targetId = interaction.values[0];
        if (targetId === userId) {
            return interaction.reply({ content: '\u274c Tidak bisa kirim gift ke diri sendiri! Pilih orang lain.', ephemeral: true });
        }
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (targetMember && targetMember.user.bot) {
            return interaction.reply({ content: '\u274c Tidak bisa kirim gift ke bot! Pilih pemain lain.', ephemeral: true });
        }
        // Show a small modal asking only for the amount; recipient is encoded in the customId.
        const modal = new ModalBuilder()
            .setCustomId(`ecopnl_modal_giftamount_${targetId}_${userId}`)
            .setTitle('🎁 Kirim Gift');
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('gift_amount')
                    .setLabel(`Jumlah money (max ${GIFT_MAX_PER_TRANSACTION.toLocaleString('id-ID')})`)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('Contoh: 1000')
            )
        );
        return interaction.showModal(modal);
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

    // === GIFT AMOUNT MODAL (recipient picked via dropdown, amount typed here) ===
    if (parts[2] === 'giftamount') {
        // customId: ecopnl_modal_giftamount_<targetId>_<userId>
        const targetId = parts[3];
        const amount = parseInt(interaction.fields.getTextInputValue('gift_amount'));
        if (!/^\d{16,20}$/.test(targetId)) return interaction.reply({ content: '\u274c Penerima tidak valid. Coba ulangi dari tombol Gift.', ephemeral: true });
        return processGift(interaction, userId, targetId, amount);
    }

    // === REDEEM MODAL ===
    if (parts[2] === 'redeem') {
        if (guildId !== REDEEM_GUILD_ID) return interaction.reply({ content: '\u274c Redeem voucher hanya bisa di server **ID Community**.', ephemeral: true });
        const code = interaction.fields.getTextInputValue('voucher_code').toUpperCase().trim();
        const vScope = voucherScope(guildId);
        const voucher = db.prepare('SELECT * FROM vouchers WHERE guildId = ? AND code = ?').get(vScope, code);
        if (!voucher) return interaction.reply({ content: '\u274c Kode tidak valid!', ephemeral: true });
        if (voucher.current_uses >= voucher.max_uses) return interaction.reply({ content: '\u274c Voucher sudah habis!', ephemeral: true });
        const alreadyClaimed = db.prepare('SELECT * FROM voucher_claims WHERE guildId = ? AND code = ? AND userId = ?').get(vScope, code, userId);
        if (alreadyClaimed) return interaction.reply({ content: '\u274c Kamu sudah klaim voucher ini!', ephemeral: true });
        db.prepare('UPDATE vouchers SET current_uses = current_uses + 1 WHERE guildId = ? AND code = ?').run(vScope, code);
        db.prepare('INSERT INTO voucher_claims (guildId, code, userId) VALUES (?, ?, ?)').run(vScope, code, userId);
        const userData = getOrCreateUser(guildId, userId);
        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(voucher.reward, guildId, userId);
        userData.balance += voucher.reward;
        try { const { checkAchievements } = require("./achievements"); await checkAchievements(interaction.guild, userId, { type: "redeem" }); } catch (_) {}
        return interaction.reply({ content: `\u2705 Voucher **${code}** berhasil! Dapat \ud83e\ude99 **${voucher.reward.toLocaleString('id-ID')}**\n> Saldo: \ud83e\ude99 **${userData.balance.toLocaleString('id-ID')}**` });
    }
}

// ============ UTILITY: Detection helpers ============
function isEconomyPanelButton(customId) {
    return customId.startsWith('ecopnl_') && !customId.startsWith('ecopnl_modal_') && !customId.startsWith('ecopnl_giftpick_');
}

function isEconomyPanelSelect(customId) {
    return customId.startsWith('ecopnl_giftpick_');
}

function isEconomyPanelModal(customId) {
    return customId.startsWith('ecopnl_modal_');
}

// Shared gift logic used by both the /wallet panel modal and the /gift slash command.
async function processGift(interaction, senderId, targetId, amount) {
    const guildId = interaction.guild.id;
    if (isNaN(amount) || amount < 1 || amount > GIFT_MAX_PER_TRANSACTION) return interaction.reply({ content: `\u274c Jumlah tidak valid (1-${GIFT_MAX_PER_TRANSACTION.toLocaleString('id-ID')})!`, ephemeral: true });
    if (targetId === senderId) return interaction.reply({ content: '\u274c Tidak bisa kirim ke diri sendiri!', ephemeral: true });

    // Cooldown (10s per sender)
    const cdKey = `${guildId}_${senderId}`;
    if (giftCooldowns.has(cdKey) && Date.now() < giftCooldowns.get(cdKey)) {
        const remaining = Math.ceil((giftCooldowns.get(cdKey) - Date.now()) / 1000);
        return interaction.reply({ content: `\u23f3 Tunggu **${remaining} detik** sebelum kirim gift lagi.`, ephemeral: true });
    }

    // Target must be a real, non-bot member of this guild
    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) return interaction.reply({ content: '\u274c User tidak ditemukan di server ini!', ephemeral: true });
    if (targetMember.user.bot) return interaction.reply({ content: '\u274c Tidak bisa kirim ke bot!', ephemeral: true });

    // Daily receive limit for the recipient (check before debit)
    const receivedToday = getGiftReceivedToday(guildId, targetId);
    if (receivedToday + amount > GIFT_RECEIVE_LIMIT_PER_DAY) {
        const sisa = Math.max(0, GIFT_RECEIVE_LIMIT_PER_DAY - receivedToday);
        return interaction.reply({ content: `\u274c <@${targetId}> sudah mencapai batas terima harian (\ud83e\ude99 ${GIFT_RECEIVE_LIMIT_PER_DAY.toLocaleString('id-ID')}/hari). Sisa kuota: \ud83e\ude99 ${sisa.toLocaleString('id-ID')}`, allowedMentions: { users: [] }, ephemeral: true });
    }

    // Tax-free voucher (consumes 1 only after successful transfer)
    const hasTaxFree = getUserStat(guildId, senderId, 'tax_free_voucher') > 0;
    const tax = hasTaxFree ? 0 : Math.floor(amount * GIFT_TAX_RATE);
    const net = amount - tax;

    // Atomic transfer: debit full amount from sender, credit net to target (tax burned).
    // Prevents double-spend / lost-update from concurrent gifts & rewards.
    const tx = transferBalance(guildId, senderId, targetId, amount, net);
    if (!tx.ok) {
        const bal = getOrCreateUser(guildId, senderId).balance;
        return interaction.reply({ content: `\u274c Saldo kurang! Kamu punya \ud83e\ude99 **${bal.toLocaleString('id-ID')}**`, ephemeral: true });
    }

    if (hasTaxFree) incrementUserStat(guildId, senderId, 'tax_free_voucher', -1);
    giftCooldowns.set(cdKey, Date.now() + 10000);

    addGiftReceivedToday(guildId, targetId, net);
    incrementUserStat(guildId, senderId, 'total_gifts_sent');
    incrementUserStat(guildId, senderId, 'total_gift_amount', amount);
    updateQuestProgress(guildId, senderId, 'gift', 1);
    await checkAchievements(interaction.guild, senderId, { type: 'gift_send' });
    await checkAchievements(interaction.guild, targetId, { type: 'gift_receive' });

    const freshBalance = getOrCreateUser(guildId, senderId).balance;
    const embed = new EmbedBuilder().setColor('#FF69B4').setTitle('\ud83c\udf81 Gift Terkirim!')
        .setDescription(`<@${senderId}> \u279c <@${targetId}>\n\n> \ud83d\udcb0 **Jumlah:** \ud83e\ude99 ${amount.toLocaleString('id-ID')}\n> \ud83d\udcca **Pajak (${hasTaxFree ? 'FREE!' : '10%'}):** \ud83e\ude99 ${tax.toLocaleString('id-ID')}${hasTaxFree ? ' *(Tax-Free Voucher)*' : ''}\n> \u2705 **Diterima:** \ud83e\ude99 ${net.toLocaleString('id-ID')}`)
        .setFooter({ text: `Saldo kamu: ${freshBalance.toLocaleString('id-ID')} | Limit harian penerima: ${(receivedToday + net).toLocaleString('id-ID')}/${GIFT_RECEIVE_LIMIT_PER_DAY.toLocaleString('id-ID')}` })
        .setTimestamp();
    return interaction.reply({ embeds: [embed], allowedMentions: { users: [] } });
}

// /gift @user <jumlah> slash command
async function handleGiftCommand(interaction) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('jumlah');
    return processGift(interaction, interaction.user.id, target.id, amount);
}

module.exports = {
    buildEconomyPanel,
    handleEconomyPanelCommand,
    handleEconomyButton,
    handleEconomySelect,
    handleEconomyModal,
    handleGiftCommand,
    isEconomyPanelButton,
    isEconomyPanelSelect,
    isEconomyPanelModal
};
