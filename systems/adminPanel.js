// systems/adminPanel.js - Admin Panel UI System (Button-based admin controls)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, ChannelType } = require('discord.js');
const { db, getOrCreateUser, getSetting } = require('../database');


// ============ HELPER: Check admin permission ============
function isAdminUser(interaction) {
    return interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
}

// ============ BUILD: Main Admin Panel ============
function buildAdminPanel(guildId) {
    const embed = new EmbedBuilder()
        .setTitle('\ud83d\udee1\ufe0f ADMIN PANEL')
        .setColor('#2B2D31')
        .setDescription(
            `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n` +
            `Kelola server bot dari sini:\n\n` +
            `> \ud83d\uded2 **Shop** \u2014 Tambah role/item/voucher ke toko\n` +
            `> \ud83d\udcb0 **Money** \u2014 Kelola uang user & banker\n` +
            `> \ud83d\udd25 **Streak** \u2014 Set/reset/restore streak user\n` +
            `> \u2699\ufe0f **Setting** \u2014 Atur channel notifikasi\n` +
            `> \ud83d\udce2 **Notifications** \u2014 Auto-create channel notif\n` +
            `> \ud83c\udf99\ufe0f **TempVoice** \u2014 Setup voice channel privat\n` +
            `> 🏆 **Contest** — Fishing contest\n` +
            `> 📊 **Analytics** — Command usage stats\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: 'Hanya Admin yang bisa menggunakan panel ini' })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admpnl_shop').setLabel('\ud83d\uded2 Shop').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('admpnl_money').setLabel('\ud83d\udcb0 Money').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('admpnl_streak').setLabel('\ud83d\udd25 Streak').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('admpnl_setting').setLabel('\u2699\ufe0f Setting').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admpnl_notifications').setLabel('\ud83d\udce2 Notifications').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('admpnl_tempvoice').setLabel('\ud83c\udf99\ufe0f TempVoice').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('admpnl_contest').setLabel('\ud83c\udfc6 Contest').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('admpnl_analytics').setLabel('📊 Analytics').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2] };
}


// ============ BUILD: Shop sub-panel ============
function buildShopSubPanel() {
    const embed = new EmbedBuilder()
        .setTitle('\ud83d\uded2 ADMIN SHOP')
        .setColor('#3498DB')
        .setDescription(
            `Kelola toko server:\n\n` +
            `> \ud83c\udfa8 **Add Role** \u2014 Tambah role ke shop\n` +
            `> \ud83d\udce6 **Add Item** \u2014 Tambah item virtual\n` +
            `> \ud83c\udf9f\ufe0f **Voucher** \u2014 Buat kode promo\n` +
            `> \ud83d\udcdc **History** \u2014 Lihat log transaksi\n` +
            `> \ud83c\udfa8 **Custom Role Price** \u2014 Atur harga custom role`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admpnl_shop_addrole').setLabel('\ud83c\udfa8 Add Role').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('admpnl_shop_additem').setLabel('\ud83d\udce6 Add Item').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('admpnl_shop_voucher').setLabel('\ud83c\udf9f\ufe0f Voucher').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('admpnl_shop_history').setLabel('\ud83d\udcdc History').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admpnl_shop_crprice').setLabel('\ud83c\udfa8 Custom Role Price').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('admpnl_back').setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row, row2] };
}


// ============ BUILD: Money sub-panel ============
function buildMoneySubPanel() {
    const embed = new EmbedBuilder()
        .setTitle('\ud83d\udcb0 ADMIN MONEY')
        .setColor('#F1C40F')
        .setDescription(
            `Kelola ekonomi server:\n\n` +
            `> \u2795 **Add Money** \u2014 Tambah uang ke user\n` +
            `> \u2796 **Take Money** \u2014 Ambil uang dari user\n` +
            `> \ud83d\udccc **Set Money** \u2014 Set jumlah uang user\n` +
            `> \ud83d\udee1\ufe0f **Add Banker** \u2014 Beri izin banker (Owner)\n` +
            `> \ud83d\uddd1\ufe0f **Remove Banker** \u2014 Cabut izin banker (Owner)\n` +
            `> \ud83d\udccb **List Banker** \u2014 Lihat daftar banker`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admpnl_money_add').setLabel('\u2795 Add').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('admpnl_money_take').setLabel('\u2796 Take').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('admpnl_money_set').setLabel('\ud83d\udccc Set').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('admpnl_money_listbanker').setLabel('\ud83d\udccb List Banker').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admpnl_money_addbanker').setLabel('\ud83d\udee1\ufe0f Add Banker').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('admpnl_money_removebanker').setLabel('\ud83d\uddd1\ufe0f Remove Banker').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('admpnl_back').setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row, row2] };
}


// ============ BUILD: Streak sub-panel ============
function buildStreakSubPanel() {
    const embed = new EmbedBuilder()
        .setTitle('\ud83d\udd25 ADMIN STREAK')
        .setColor('#E74C3C')
        .setDescription(
            `Kelola streak user:\n\n` +
            `> \ud83d\udccc **Set Streak** \u2014 Atur jumlah streak user\n` +
            `> \ud83d\uddd1\ufe0f **Reset Streak** \u2014 Reset streak ke 0\n` +
            `> \u267b\ufe0f **Restore Streak** \u2014 Pulihkan streak tanpa batas`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admpnl_streak_set').setLabel('\ud83d\udccc Set').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('admpnl_streak_reset').setLabel('\ud83d\uddd1\ufe0f Reset').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('admpnl_streak_restore').setLabel('\u267b\ufe0f Restore').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('admpnl_back').setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

// ============ BUILD: Setting sub-panel ============
function buildSettingSubPanel(guildId) {
    const questCh = getSetting(guildId, 'quest_channel', null);
    const levelCh = getSetting(guildId, 'level_channel', null);
    const achCh = getSetting(guildId, 'achievement_channel', null);
    const streakCh = getSetting(guildId, 'streak_channel', null);

    const embed = new EmbedBuilder()
        .setTitle('\u2699\ufe0f SERVER SETTINGS')
        .setColor('#95A5A6')
        .setDescription(
            `Channel saat ini:\n\n` +
            `> \ud83d\udccb Quest: ${questCh ? `<#${questCh}>` : '*Belum diatur*'}\n` +
            `> \ud83d\udcc8 Level Up: ${levelCh ? `<#${levelCh}>` : '*Belum diatur*'}\n` +
            `> \ud83c\udfc6 Achievement: ${achCh ? `<#${achCh}>` : '*Belum diatur*'}\n` +
            `> \ud83d\udd25 Streak: ${streakCh ? `<#${streakCh}>` : '*Belum diatur*'}\n\n` +
            `Klik tombol untuk mengatur channel (gunakan ID channel):`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admpnl_set_quest').setLabel('\ud83d\udccb Quest').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('admpnl_set_level').setLabel('\ud83d\udcc8 Level').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('admpnl_set_achievement').setLabel('\ud83c\udfc6 Achievement').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('admpnl_set_streak').setLabel('\ud83d\udd25 Streak').setStyle(ButtonStyle.Primary)
    );
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admpnl_back').setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row, navRow] };
}


// ============ BUILD: Contest sub-panel ============
function buildContestSubPanel(guildId) {
    const embed = new EmbedBuilder()
        .setTitle('\ud83c\udfc6 FISHING CONTEST')
        .setColor('#FFD700')
        .setDescription(
            `Kelola fishing contest:\n\n` +
            `> \u25b6\ufe0f **Start** \u2014 Mulai kontes baru\n` +
            `> \u23f9\ufe0f **End** \u2014 Akhiri kontes & bagi hadiah\n\n` +
            `*Gunakan \`/contest status\` untuk cek status aktif*`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admpnl_contest_start').setLabel('\u25b6\ufe0f Start Contest').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('admpnl_contest_end').setLabel('\u23f9\ufe0f End Contest').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('admpnl_back').setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

// ============ BUILD: Notifications sub-panel ============
function buildNotificationsSubPanel() {
    const embed = new EmbedBuilder()
        .setTitle('\ud83d\udce2 NOTIFICATIONS SETUP')
        .setColor('#2ECC71')
        .setDescription(
            `Auto-create kategori & channel notifikasi:\n\n` +
            `Akan membuat:\n` +
            `> \ud83d\udcc1 **NOTIFICATIONS** (kategori)\n` +
            `> \u2514 \ud83c\udfc6 #achievement\n` +
            `> \u2514 \ud83d\udcc8 #level-up\n` +
            `> \u2514 \ud83d\udd25 #streak\n\n` +
            `\u26a0\ufe0f Ini akan membuat channel baru!`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admpnl_notif_create').setLabel('\ud83d\udce2 Create Channels').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('admpnl_back').setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

// ============ BUILD: TempVoice sub-panel ============
function buildTempVoiceSubPanel() {
    const embed = new EmbedBuilder()
        .setTitle('\ud83c\udf99\ufe0f TEMP VOICE SETUP')
        .setColor('#9B59B6')
        .setDescription(
            `Setup sistem Private Voice:\n\n` +
            `Akan membuat:\n` +
            `> \ud83d\udcc1 **PRIVATE ROOMS** (kategori)\n` +
            `> \u2514 \u2699\ufe0f #interface (control panel)\n\n` +
            `\u26a0\ufe0f Ini akan membuat channel baru!`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('admpnl_tv_create').setLabel('\ud83c\udf99\ufe0f Setup TempVoice').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('admpnl_back').setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}


// ============ HANDLER: /admin command ============
async function handleAdminCommand(interaction) {
    if (!isAdminUser(interaction)) {
        return interaction.reply({ content: '\u274c Hanya Admin yang bisa menggunakan panel ini!', ephemeral: true });
    }
    const panel = buildAdminPanel(interaction.guild.id);
    return interaction.reply(panel);
}

// ============ HANDLER: Admin panel button clicks ============
async function handleAdminButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;

    // Validate admin permission
    if (!isAdminUser(interaction)) {
        return interaction.reply({ content: '\u274c Hanya Admin!', ephemeral: true });
    }

    // === BACK TO MAIN ===
    if (customId === 'admpnl_back') {
        return interaction.update(buildAdminPanel(guildId));
    }

    // === SUB-PANEL NAVIGATION ===
    if (customId === 'admpnl_shop') return interaction.update(buildShopSubPanel());
    if (customId === 'admpnl_money') return interaction.update(buildMoneySubPanel());
    if (customId === 'admpnl_streak') return interaction.update(buildStreakSubPanel());
    if (customId === 'admpnl_setting') return interaction.update(buildSettingSubPanel(guildId));
    if (customId === 'admpnl_contest') return interaction.update(buildContestSubPanel(guildId));
    if (customId === 'admpnl_notifications') return interaction.update(buildNotificationsSubPanel());
    if (customId === 'admpnl_tempvoice') return interaction.update(buildTempVoiceSubPanel());

    // === ANALYTICS ===
    if (customId === 'admpnl_analytics') {
        const topCommands = db.prepare('SELECT command, SUM(count) as total, MAX(lastUsed) as lastUsed FROM command_summary WHERE guildId = ? GROUP BY command ORDER BY total DESC LIMIT 10').all(guildId);
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const activeToday = db.prepare('SELECT COUNT(DISTINCT userId) as cnt FROM users WHERE guildId = ? AND userId IN (SELECT DISTINCT userId FROM command_summary WHERE guildId = ? AND lastUsed > ?)').get(guildId, guildId, todayStart.getTime());

        let cmdList = topCommands.length ? topCommands.map((c, i) => `> **${i+1}.** \`/${c.command}\` — ${c.total.toLocaleString('id-ID')}x`).join('\n') : '> *Belum ada data*';

        const embed = new EmbedBuilder()
            .setTitle('📊 COMMAND ANALYTICS')
            .setColor('#9B59B6')
            .setDescription(`━━━━━━━━━━━━━━━━━━━━━━\n` +
                `**Top 10 Commands:**\n${cmdList}\n\n` +
                `**Hari Ini:**\n> 👥 Active Users: **${activeToday?.cnt || 0}**\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`)
            .setFooter({ text: 'Data resets never — lifetime analytics' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admpnl_back').setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }


    // === SHOP: Add Role (Modal) ===
    if (customId === 'admpnl_shop_addrole') {
        const modal = new ModalBuilder().setCustomId('admpnl_modal_addrole').setTitle('\ud83c\udfa8 Add Role to Shop');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('Role ID').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Klik kanan role > Copy ID')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_price').setLabel('Harga (angka)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Contoh: 5000'))
        );
        return interaction.showModal(modal);
    }

    // === SHOP: Add Item (Modal) ===
    if (customId === 'admpnl_shop_additem') {
        const modal = new ModalBuilder().setCustomId('admpnl_modal_additem').setTitle('\ud83d\udce6 Add Item to Shop');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_name').setLabel('Nama Barang').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Contoh: VIP Pass')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_price').setLabel('Harga (angka)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Contoh: 10000')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_content').setLabel('Isi DM (yang dikirim ke pembeli)').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Isi pesan yang dikirim ke DM pembeli')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('item_stock').setLabel('Stok (jumlah unit, kosong = 1)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Contoh: 10'))
        );
        return interaction.showModal(modal);
    }

    // === SHOP: Voucher (Modal) ===
    if (customId === 'admpnl_shop_voucher') {
        const modal = new ModalBuilder().setCustomId('admpnl_modal_voucher').setTitle('\ud83c\udf9f\ufe0f Create Voucher');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('voucher_code').setLabel('Kode Voucher').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Contoh: PROMO2024')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('voucher_reward').setLabel('Reward Money (angka)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Contoh: 1000')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('voucher_limit').setLabel('Batas Klaim (angka)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Contoh: 50'))
        );
        return interaction.showModal(modal);
    }


    // === SHOP: History ===
    if (customId === 'admpnl_shop_history') {
        const logs = db.prepare('SELECT * FROM logs WHERE guildId = ? ORDER BY time DESC LIMIT 15').all(guildId);
        let desc = logs.length ? '' : '*Belum ada transaksi.*';
        logs.forEach(l => {
            const time = `<t:${Math.floor(l.time / 1000)}:R>`;
            desc += `> ${time} \u2014 <@${l.userId}> | ${l.action}: **${l.item}** (\ud83e\ude99 ${l.price.toLocaleString('id-ID')})\n`;
        });
        const embed = new EmbedBuilder().setTitle('\ud83d\udcdc Transaction History').setColor('#3498DB').setDescription(desc).setFooter({ text: '15 transaksi terakhir' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admpnl_shop').setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === SHOP: Custom Role Price (Modal) ===
    if (customId === 'admpnl_shop_crprice') {
        const modal = new ModalBuilder().setCustomId('admpnl_modal_crprice').setTitle('\ud83c\udfa8 Set Custom Role Price');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cr_price').setLabel('Harga (0 = matikan fitur)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Contoh: 25000'))
        );
        return interaction.showModal(modal);
    }

    // === MONEY: Add/Take/Set (Modals) ===
    if (customId === 'admpnl_money_add' || customId === 'admpnl_money_take' || customId === 'admpnl_money_set') {
        const actionMap = { 'admpnl_money_add': 'add', 'admpnl_money_take': 'take', 'admpnl_money_set': 'set' };
        const labelMap = { add: 'Add Money', take: 'Take Money', set: 'Set Money' };
        const act = actionMap[customId];
        const modal = new ModalBuilder().setCustomId(`admpnl_modal_money_${act}`).setTitle(labelMap[act]);
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_user_id').setLabel('User ID').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Klik kanan user > Copy ID')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Jumlah').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Contoh: 5000'))
        );
        return interaction.showModal(modal);
    }


    // === MONEY: Add/Remove Banker (Modal) ===
    if (customId === 'admpnl_money_addbanker' || customId === 'admpnl_money_removebanker') {
        if (interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: '\ud83d\uded1 Hanya Owner yang bisa mengelola banker!', ephemeral: true });
        }
        const isAdd = customId === 'admpnl_money_addbanker';
        const modal = new ModalBuilder().setCustomId(`admpnl_modal_banker_${isAdd ? 'add' : 'remove'}`).setTitle(isAdd ? 'Add Banker' : 'Remove Banker');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banker_id').setLabel('User ID atau Role ID').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Copy ID target')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banker_type').setLabel('Tipe: user / role').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('user atau role'))
        );
        return interaction.showModal(modal);
    }

    // === MONEY: List Banker ===
    if (customId === 'admpnl_money_listbanker') {
        const list = db.prepare('SELECT * FROM economy_admins WHERE guildId = ?').all(guildId);
        let txt = list.length ? '' : '*Belum ada banker.*';
        list.forEach(adm => { txt += `> \u2022 ${adm.type}: <@${adm.type === 'role' ? '&' : ''}${adm.adminId}>\n`; });
        const embed = new EmbedBuilder().setTitle('\ud83d\udee1\ufe0f Daftar Banker').setColor('#F1C40F').setDescription(txt);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admpnl_money').setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === STREAK: Set/Reset/Restore (Modals) ===
    if (customId === 'admpnl_streak_set' || customId === 'admpnl_streak_reset' || customId === 'admpnl_streak_restore') {
        const act = customId.replace('admpnl_streak_', '');
        const titleMap = { set: 'Set Streak', reset: 'Reset Streak', restore: 'Restore Streak' };
        const modal = new ModalBuilder().setCustomId(`admpnl_modal_streak_${act}`).setTitle(titleMap[act]);
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target_user_id').setLabel('User ID').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Klik kanan user > Copy ID'))
        );
        if (act === 'set') {
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('streak_amount').setLabel('Jumlah Streak Baru').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Contoh: 30'))
            );
        }
        return interaction.showModal(modal);
    }


    // === SETTING: Channel modals ===
    if (customId.startsWith('admpnl_set_')) {
        const type = customId.replace('admpnl_set_', '');
        const titleMap = { quest: 'Quest Channel', level: 'Level Up Channel', achievement: 'Achievement Channel', streak: 'Streak Channel' };
        const modal = new ModalBuilder().setCustomId(`admpnl_modal_setchannel_${type}`).setTitle(`Set ${titleMap[type]}`);
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel_id').setLabel('Channel ID').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Klik kanan channel > Copy ID'))
        );
        return interaction.showModal(modal);
    }

    // === NOTIFICATIONS: Create channels ===
    if (customId === 'admpnl_notif_create') {
        await interaction.deferUpdate();
        try {
            const category = await interaction.guild.channels.create({ name: '\ud83d\udce2 NOTIFICATIONS', type: ChannelType.GuildCategory });
            const achChannel = await interaction.guild.channels.create({ name: '\ud83c\udfc6-achievement', type: ChannelType.GuildText, parent: category.id });
            const lvlChannel = await interaction.guild.channels.create({ name: '\ud83d\udcc8-level-up', type: ChannelType.GuildText, parent: category.id });
            const streakChannel = await interaction.guild.channels.create({ name: '\ud83d\udd25-streak', type: ChannelType.GuildText, parent: category.id });
            db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'achievement_channel', achChannel.id);
            db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'level_channel', lvlChannel.id);
            db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_channel', streakChannel.id);
            const embed = new EmbedBuilder().setTitle('\u2705 Notifications Created!').setColor('#2ECC71')
                .setDescription(`\ud83d\udcc1 **${category.name}**\n> \ud83c\udfc6 <#${achChannel.id}>\n> \ud83d\udcc8 <#${lvlChannel.id}>\n> \ud83d\udd25 <#${streakChannel.id}>`);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admpnl_back').setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary));
            return interaction.editReply({ embeds: [embed], components: [row] });
        } catch (err) {
            console.error(err);
            return interaction.followUp({ content: '\u274c Gagal membuat channel. Cek permission bot.', ephemeral: true });
        }
    }


    // === TEMPVOICE: Setup ===
    if (customId === 'admpnl_tv_create') {
        await interaction.deferUpdate();
        try {
            const category = await interaction.guild.channels.create({ name: '\ud83d\udcac PRIVATE ROOMS', type: ChannelType.GuildCategory });
            const interfaceChannel = await interaction.guild.channels.create({ name: '\u2699\ufe0f-interface', type: ChannelType.GuildText, parent: category.id });
            db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'jtc_category', category.id);
            const tvEmbed = new EmbedBuilder().setTitle('\ud83d\udd0a TEMP VOICE CONTROL PANEL').setColor('#2B2D31')
                .setDescription('Selamat datang di sistem Private Voice!\n\n**\u2728 CARA MEMBUAT CHANNEL:**\nKlik tombol biru untuk membuat channel.\n\n**\u2699\ufe0f CARA MENGATUR:**\nGunakan tombol abu-abu/merah.');
            const rowCreate = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tv_create_private').setLabel('Private \ud83d\udd12').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('tv_create_duo').setLabel('Duo \ud83d\udc65 (2)').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('tv_create_squad').setLabel('Squad \ud83d\udc65 (4)').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('tv_create_custom').setLabel('Custom \ud83c\udf9b\ufe0f').setStyle(ButtonStyle.Success)
            );
            const rowManage1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tv_name').setLabel('\u270f\ufe0f Name').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('tv_limit').setLabel('\ud83d\udc65 Limit').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('tv_privacy').setLabel('\ud83d\udd12 Lock/Unlock').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('tv_hide').setLabel('\ud83d\udc41\ufe0f Hide/Unhide').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('tv_claim').setLabel('\ud83d\udc51 Claim Owner').setStyle(ButtonStyle.Secondary)
            );
            const rowManage2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tv_transfer').setLabel('\ud83d\udd04 Transfer').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('tv_unblock').setLabel('\ud83d\udfe2 Unblock').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('tv_kick').setLabel('\ud83d\udc62 Kick').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('tv_block').setLabel('\ud83d\udeab Block').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('tv_delete').setLabel('\ud83d\uddd1\ufe0f Delete').setStyle(ButtonStyle.Danger)
            );
            await interfaceChannel.send({ embeds: [tvEmbed], components: [rowCreate, rowManage1, rowManage2] });
            const embed = new EmbedBuilder().setTitle('\u2705 TempVoice Created!').setColor('#9B59B6')
                .setDescription(`\ud83d\udcc1 **${category.name}**\n> \u2699\ufe0f <#${interfaceChannel.id}>`);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admpnl_back').setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary));
            return interaction.editReply({ embeds: [embed], components: [row] });
        } catch (err) {
            console.error(err);
            return interaction.followUp({ content: '\u274c Gagal. Cek permission bot.', ephemeral: true });
        }
    }


    // === CONTEST: Start/End ===
    if (customId === 'admpnl_contest_start') {
        const { getContestState, startFishContest } = require('./contest');
        const state = getContestState(guildId);
        if (state && state.active) {
            return interaction.reply({ content: '\u274c Sudah ada kontes aktif! Akhiri dulu.', ephemeral: true });
        }
        startFishContest(guildId, interaction.channelId, 60);
        const embed = new EmbedBuilder().setTitle('\ud83c\udfc6 Contest Started!').setColor('#FFD700')
            .setDescription('\u2705 Fishing contest dimulai! Durasi: **60 menit**\n\nGunakan `/contest status` untuk cek.');
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admpnl_contest').setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary));
        return interaction.update({ embeds: [embed], components: [row] });
    }

    if (customId === 'admpnl_contest_end') {
        const { getContestState } = require('./contest');
        const state = getContestState(guildId);
        if (!state || !state.active) {
            return interaction.reply({ content: '\u274c Tidak ada kontes aktif!', ephemeral: true });
        }
        // Mark contest inactive - rewards distributed via /contest end command
        db.prepare('UPDATE fish_contest_state SET active = 0 WHERE guildId = ? AND active = 1').run(guildId);
        const embed = new EmbedBuilder().setTitle('\ud83c\udfc6 Contest Ended!').setColor('#E74C3C')
            .setDescription('\u2705 Kontes diakhiri.\n\nGunakan `/contest leaderboard` untuk lihat hasil.\n*Hadiah otomatis dibagikan.*');
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admpnl_contest').setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary));
        return interaction.update({ embeds: [embed], components: [row] });
    }
}


// ============ HANDLER: Admin panel modal submissions ============
async function handleAdminModal(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;

    if (!isAdminUser(interaction)) {
        return interaction.reply({ content: '\u274c Hanya Admin!', ephemeral: true });
    }

    // === ADD ROLE TO SHOP ===
    if (customId === 'admpnl_modal_addrole') {
        const roleId = interaction.fields.getTextInputValue('role_id').trim();
        const price = parseInt(interaction.fields.getTextInputValue('role_price'));
        if (isNaN(price) || price < 1) return interaction.reply({ content: '\u274c Harga tidak valid!', ephemeral: true });
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) return interaction.reply({ content: '\u274c Role tidak ditemukan! Pastikan ID benar.', ephemeral: true });
        db.prepare('INSERT OR REPLACE INTO shop_roles (guildId, roleId, price) VALUES (?, ?, ?)').run(guildId, roleId, price);
        return interaction.reply({ content: `\u2705 Role <@&${roleId}> ditambah ke shop! Harga: \ud83e\ude99 **${price.toLocaleString('id-ID')}**`, allowedMentions: { roles: [] } });
    }

    // === ADD ITEM TO SHOP ===
    if (customId === 'admpnl_modal_additem') {
        const name = interaction.fields.getTextInputValue('item_name');
        const price = parseInt(interaction.fields.getTextInputValue('item_price'));
        const content = interaction.fields.getTextInputValue('item_content');
        const stockRaw = interaction.fields.getTextInputValue('item_stock');
        if (isNaN(price) || price < 1) return interaction.reply({ content: '\u274c Harga tidak valid!', ephemeral: true });
        // shop_items stores ONE ROW PER STOCK UNIT (the /shop list uses COUNT(*) and buying does DELETE).
        // There is no `quantity` column, so insert N rows. Blank stock defaults to 1.
        let stock = stockRaw ? parseInt(stockRaw) : 1;
        if (isNaN(stock) || stock < 1) stock = 1;
        const insertItem = db.prepare('INSERT INTO shop_items (guildId, name, price, content) VALUES (?, ?, ?, ?)');
        const insertManyItems = db.transaction((n) => { for (let i = 0; i < n; i++) insertItem.run(guildId, name, price, content); });
        insertManyItems(stock);
        return interaction.reply({ content: `\u2705 Item **${name}** ditambah! Harga: \ud83e\ude99 **${price.toLocaleString('id-ID')}** | Stok: **${stock}**` });
    }


    // === CREATE VOUCHER ===
    if (customId === 'admpnl_modal_voucher') {
        const code = interaction.fields.getTextInputValue('voucher_code').toUpperCase();
        const reward = parseInt(interaction.fields.getTextInputValue('voucher_reward'));
        const limit = parseInt(interaction.fields.getTextInputValue('voucher_limit'));
        if (isNaN(reward) || isNaN(limit)) return interaction.reply({ content: '\u274c Angka tidak valid!', ephemeral: true });
        db.prepare('INSERT OR REPLACE INTO vouchers (guildId, code, reward, max_uses, current_uses) VALUES (?, ?, ?, ?, 0)').run(guildId, code, reward, limit);
        return interaction.reply({ content: `\u2705 Voucher **${code}** dibuat! Reward: \ud83e\ude99 **${reward.toLocaleString('id-ID')}** | Limit: **${limit}x**` });
    }

    // === CUSTOM ROLE PRICE ===
    if (customId === 'admpnl_modal_crprice') {
        const price = parseInt(interaction.fields.getTextInputValue('cr_price'));
        if (isNaN(price) || price < 0) return interaction.reply({ content: '\u274c Angka tidak valid!', ephemeral: true });
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'custom_role_price', price.toString());
        if (price === 0) return interaction.reply({ content: '\u2705 Fitur Custom Role **dimatikan**.' });
        return interaction.reply({ content: `\u2705 Harga Custom Role: \ud83e\ude99 **${price.toLocaleString('id-ID')}**` });
    }

    // === MONEY: Add/Take/Set ===
    if (customId.startsWith('admpnl_modal_money_')) {
        const act = customId.replace('admpnl_modal_money_', '');
        const targetId = interaction.fields.getTextInputValue('target_user_id').trim();
        const amount = parseInt(interaction.fields.getTextInputValue('amount'));
        if (isNaN(amount) || amount < 1) return interaction.reply({ content: '\u274c Jumlah tidak valid!', ephemeral: true });
        const tData = getOrCreateUser(guildId, targetId);
        if (act === 'add') tData.balance += amount;
        if (act === 'take') tData.balance = Math.max(0, tData.balance - amount);
        if (act === 'set') tData.balance = amount;
        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(tData.balance, guildId, targetId);
        const actLabel = { add: 'ditambah', take: 'dikurangi', set: 'diset ke' }[act];
        return interaction.reply({ content: `\u2705 Money <@${targetId}> ${actLabel} \ud83e\ude99 **${amount.toLocaleString('id-ID')}**\n> Saldo sekarang: \ud83e\ude99 **${tData.balance.toLocaleString('id-ID')}**`, allowedMentions: { users: [] } });
    }


    // === BANKER: Add/Remove ===
    if (customId.startsWith('admpnl_modal_banker_')) {
        if (interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: '\ud83d\uded1 Hanya Owner!', ephemeral: true });
        }
        const act = customId.replace('admpnl_modal_banker_', '');
        const bankerId = interaction.fields.getTextInputValue('banker_id').trim();
        const bankerType = interaction.fields.getTextInputValue('banker_type').trim().toLowerCase();
        if (!['user', 'role'].includes(bankerType)) return interaction.reply({ content: '\u274c Tipe harus `user` atau `role`!', ephemeral: true });
        if (act === 'add') {
            db.prepare('INSERT OR REPLACE INTO economy_admins (guildId, adminId, type) VALUES (?, ?, ?)').run(guildId, bankerId, bankerType);
            return interaction.reply({ content: `\u2705 Banker (${bankerType}) <@${bankerType === 'role' ? '&' : ''}${bankerId}> ditambahkan!`, allowedMentions: { users: [], roles: [] } });
        } else {
            db.prepare('DELETE FROM economy_admins WHERE guildId = ? AND adminId = ? AND type = ?').run(guildId, bankerId, bankerType);
            return interaction.reply({ content: `\ud83d\uddd1\ufe0f Banker (${bankerType}) dihapus.` });
        }
    }

    // === STREAK: Set/Reset/Restore ===
    if (customId.startsWith('admpnl_modal_streak_')) {
        const act = customId.replace('admpnl_modal_streak_', '');
        const targetId = interaction.fields.getTextInputValue('target_user_id').trim();

        if (act === 'set') {
            const amount = parseInt(interaction.fields.getTextInputValue('streak_amount'));
            if (isNaN(amount) || amount < 0) return interaction.reply({ content: '\u274c Angka tidak valid!', ephemeral: true });
            db.prepare('INSERT OR REPLACE INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, ?, ?)').run(guildId, targetId, amount, new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }));
            return interaction.reply({ content: `\u2705 Streak <@${targetId}> diset ke **${amount}** hari.`, allowedMentions: { users: [] } });
        }
        if (act === 'reset') {
            db.prepare('UPDATE streaks SET count = 0 WHERE guildId = ? AND userId = ?').run(guildId, targetId);
            return interaction.reply({ content: `\ud83d\uddd1\ufe0f Streak <@${targetId}> direset ke **0**.`, allowedMentions: { users: [] } });
        }
        if (act === 'restore') {
            const row = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, targetId);
            if (!row) return interaction.reply({ content: '\u274c User tidak punya data streak!', ephemeral: true });
            // Try to recover the streak the user had before it was lost (streak_history.lost_count),
            // otherwise keep the current count (min 1).
            const history = db.prepare('SELECT * FROM streak_history WHERE guildId = ? AND userId = ?').get(guildId, targetId);
            const prevCount = (history && history.lost_count > 0) ? history.lost_count : (row.count > 0 ? row.count : 1);
            db.prepare('UPDATE streaks SET count = ?, last_date = ? WHERE guildId = ? AND userId = ?').run(prevCount, new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }), guildId, targetId);
            db.prepare('DELETE FROM streak_history WHERE guildId = ? AND userId = ?').run(guildId, targetId);
            return interaction.reply({ content: `\u267b\ufe0f Streak <@${targetId}> dipulihkan ke **${prevCount}** hari.`, allowedMentions: { users: [] } });
        }
    }


    // === SETTING: Set Channel ===
    if (customId.startsWith('admpnl_modal_setchannel_')) {
        const type = customId.replace('admpnl_modal_setchannel_', '');
        const channelId = interaction.fields.getTextInputValue('channel_id').trim();
        const keyMap = { quest: 'quest_channel', level: 'level_channel', achievement: 'achievement_channel', streak: 'streak_channel' };
        const key = keyMap[type];
        if (!key) return interaction.reply({ content: '\u274c Error!', ephemeral: true });
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, key, channelId);
        return interaction.reply({ content: `\u2705 Channel **${type}** diatur ke <#${channelId}>.` });
    }
}

// ============ UTILITY: Detection helpers ============
function isAdminPanelButton(customId) {
    return customId.startsWith('admpnl_');
}

function isAdminPanelModal(customId) {
    return customId.startsWith('admpnl_modal_');
}

module.exports = {
    buildAdminPanel,
    handleAdminCommand,
    handleAdminButton,
    handleAdminModal,
    isAdminPanelButton,
    isAdminPanelModal
};
