// systems/giveawayPanel.js — Admin UI for creating & managing giveaways.
//
// Flow (admin-only):
//   /giveaway                  -> main panel (list active + Create)
//   Create (button)            -> modal (prize, duration, winners)
//   modal submit               -> creates record -> ChannelSelect to post
//   Manage (select)            -> manage view (End Now / Reroll / Set Role / Cancel)
//
// customId scheme (userId is ALWAYS the last segment):
//   buttons        gwadm_<action>[_<gwId>]_<userId>
//   string select  gwsel_pick_<userId>
//   channel select gwchan_<gwId>_<userId>
//   role select    gwrole_<gwId>_<userId>
//   modal          gwmod_create_<userId>

const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder, RoleSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField,
} = require('discord.js');
const gv = require('./giveaway');
const ui = require('./ui');

// ==================== HELPERS ====================
function lastSeg(customId) { const p = customId.split('_'); return p[p.length - 1]; }
function isAdmin(interaction) {
    const p = interaction.member?.permissions;
    if (!p?.has) return false;
    return p.has(PermissionsBitField.Flags.Administrator) || p.has(PermissionsBitField.Flags.ManageGuild);
}
function ownerOk(interaction) { return interaction.user.id === lastSeg(interaction.customId); }

// ==================== BUILD: Main Panel ====================
function buildAdminPanel(guildId, userId, guild) {
    const active = gv.getGuildGiveaways(guildId, { activeOnly: true });
    const lines = active.length
        ? active.map(g => {
            const posted = g.messageId ? `<#${g.channelId}>` : '⏳ belum diposting';
            return `> 🎁 **${g.prize}** — ${g.winners} pemenang • berakhir <t:${Math.floor(g.endsAt / 1000)}:R> • ${posted}`;
        }).join('\n')
        : '> _Belum ada giveaway aktif. Tekan **Buat Giveaway** untuk mulai._';

    const embed = new EmbedBuilder()
        .setColor(ui.COLORS.casino)
        .setTitle('🎉 Giveaway')
        .setDescription(
            'Bikin giveaway, member ikut lewat tombol, bot otomatis pilih pemenang.\n\n' +
            '**Cara pakai:**\n' +
            '1️⃣ Tekan **Buat Giveaway** → isi hadiah, durasi, jumlah pemenang\n' +
            '2️⃣ Pilih channel tempat giveaway diposting\n' +
            '3️⃣ Bot menutup & mengumumkan pemenang otomatis saat waktu habis\n\n' +
            `**Giveaway aktif (${active.length}):**\n${lines}`
        )
        .setFooter({ text: ui.footer(guild.name) });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gwadm_create_${userId}`).setLabel('Buat Giveaway').setEmoji('🎉').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`gwadm_manage_${userId}`).setLabel('Atur Giveaway').setEmoji('🛠️').setStyle(ButtonStyle.Primary).setDisabled(active.length === 0)
    );
    return { embeds: [embed], components: [row] };
}

// ==================== BUILD: Manage View ====================
function buildManageView(userId, guild, gwId) {
    const g = gv.getGiveaway(gwId);
    if (!g) return null;
    const ended = g.ended === 1;
    const winners = g.winnerIds ? JSON.parse(g.winnerIds) : [];

    const embed = new EmbedBuilder()
        .setColor(ended ? ui.COLORS.neutral : ui.COLORS.casino)
        .setTitle(`🛠️ Atur Giveaway: ${g.prize}`)
        .setDescription(
            `🏅 Jumlah pemenang: **${g.winners}**\n` +
            `🎫 Peserta: **${gv.countEntries(gwId)}**\n` +
            `⏰ ${ended ? 'Status: **SELESAI**' : `Berakhir: <t:${Math.floor(g.endsAt / 1000)}:R>`}\n` +
            `📍 ${g.messageId ? `Tampil di <#${g.channelId}>` : '⏳ Belum diposting'}\n` +
            (g.requiredRoleId ? `🔒 Syarat role: <@&${g.requiredRoleId}>\n` : '') +
            (g.minAccountAgeDays > 0 ? `🛡️ Umur akun min: **${g.minAccountAgeDays} hari**\n` : '') +
            (g.bonusRoleId && g.bonusEntries > 0 ? `🎟️ Bonus: <@&${g.bonusRoleId}> +**${g.bonusEntries}** entry\n` : '') +
            (ended && winners.length ? `\n🎉 Pemenang: ${winners.map(w => `<@${w}>`).join(', ')}` : '')
        )
        .setFooter({ text: ui.footer('Kelola giveaway') });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gwadm_endnow_${gwId}_${userId}`).setLabel('Tutup Sekarang').setEmoji('⏱️').setStyle(ButtonStyle.Primary).setDisabled(ended || !g.messageId),
        new ButtonBuilder().setCustomId(`gwadm_reroll_${gwId}_${userId}`).setLabel('Undi Ulang').setEmoji('🔁').setStyle(ButtonStyle.Secondary).setDisabled(!ended),
        new ButtonBuilder().setCustomId(`gwadm_extend_${gwId}_${userId}`).setLabel('Tambah Waktu').setEmoji('⏳').setStyle(ButtonStyle.Secondary).setDisabled(ended)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gwadm_setrole_${gwId}_${userId}`).setLabel('Syarat Role').setEmoji('🔒').setStyle(ButtonStyle.Secondary).setDisabled(ended),
        new ButtonBuilder().setCustomId(`gwadm_antialt_${gwId}_${userId}`).setLabel('Anti-Alt (umur akun)').setEmoji('🛡️').setStyle(ButtonStyle.Secondary).setDisabled(ended),
        new ButtonBuilder().setCustomId(`gwadm_bonus_${gwId}_${userId}`).setLabel('Bonus Entry Role').setEmoji('🎟️').setStyle(ButtonStyle.Secondary).setDisabled(ended)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gwadm_cancel_${gwId}_${userId}`).setLabel('Batalkan / Hapus').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`gwadm_back_${userId}`).setLabel('Kembali').setEmoji('🔙').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row1, row2, row3] };
}

// ==================== COMMAND ====================
async function handleGiveawayCommand(interaction) {
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Butuh izin **Manage Server** untuk pakai panel ini!', ephemeral: true });
    return interaction.reply(buildAdminPanel(interaction.guild.id, interaction.user.id, interaction.guild));
}

// ==================== BUTTONS ====================
async function handleGiveawayButton(interaction) {
    if (!ownerOk(interaction)) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Butuh izin Manage Server!', ephemeral: true });

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const gwId = parts.length >= 4 ? parseInt(parts[2], 10) : null;

    if (action === 'back') return interaction.update(buildAdminPanel(guildId, userId, interaction.guild));

    if (action === 'create') {
        const modal = new ModalBuilder().setCustomId(`gwmod_create_${userId}`).setTitle('Buat Giveaway');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gw_prize').setLabel('Hadiah').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200).setPlaceholder('Contoh: Nitro 1 bulan')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gw_duration').setLabel('Durasi (cth: 30m, 2h, 1d)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20).setPlaceholder('1h')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gw_winners').setLabel('Jumlah pemenang').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setPlaceholder('1'))
        );
        return interaction.showModal(modal);
    }

    if (action === 'manage') {
        const active = gv.getGuildGiveaways(guildId, { activeOnly: true });
        if (!active.length) return interaction.reply({ content: '❌ Tidak ada giveaway aktif.', ephemeral: true });
        const select = new StringSelectMenuBuilder().setCustomId(`gwsel_pick_${userId}`).setPlaceholder('🛠️ Pilih giveaway untuk diatur...');
        for (const g of active.slice(0, 25)) {
            select.addOptions(new StringSelectMenuOptionBuilder().setLabel(g.prize.slice(0, 90)).setValue(String(g.id)).setDescription(`${g.winners} pemenang • ${gv.countEntries(g.id)} peserta`));
        }
        return interaction.update({ embeds: [buildAdminPanel(guildId, userId, interaction.guild).embeds[0]], components: [new ActionRowBuilder().addComponents(select)] });
    }

    if (action === 'endnow') {
        const g = gv.getGiveaway(gwId);
        if (!g || g.ended === 1) return interaction.reply({ content: '❌ Giveaway tidak aktif.', ephemeral: true });
        await gv.endGiveaway(interaction.client, g);
        const view = buildManageView(userId, interaction.guild, gwId);
        return interaction.update(view || buildAdminPanel(guildId, userId, interaction.guild));
    }

    if (action === 'reroll') {
        const g = gv.getGiveaway(gwId);
        if (!g || g.ended !== 1) return interaction.reply({ content: '❌ Hanya giveaway yang sudah selesai bisa di-undi ulang.', ephemeral: true });
        const winners = await gv.endGiveaway(interaction.client, g, { reroll: true });
        const view = buildManageView(userId, interaction.guild, gwId);
        await interaction.update(view || buildAdminPanel(guildId, userId, interaction.guild));
        return;
    }

    if (action === 'setrole') {
        const roleSelect = new RoleSelectMenuBuilder().setCustomId(`gwrole_${gwId}_${userId}`).setPlaceholder('Pilih role syarat ikut...').setMinValues(1).setMaxValues(1);
        return interaction.reply({ content: '🔒 Pilih role yang wajib dimiliki untuk ikut giveaway ini:', components: [new ActionRowBuilder().addComponents(roleSelect)], ephemeral: true });
    }

    if (action === 'extend') {
        const modal = new ModalBuilder().setCustomId(`gwmod_extend_${gwId}_${userId}`).setTitle('Tambah Waktu Giveaway');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gw_extend').setLabel('Tambah berapa lama? (cth: 30m, 2h)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20).setPlaceholder('1h'))
        );
        return interaction.showModal(modal);
    }

    if (action === 'antialt') {
        const g = gv.getGiveaway(gwId);
        const modal = new ModalBuilder().setCustomId(`gwmod_antialt_${gwId}_${userId}`).setTitle('Anti-Alt: Umur Akun');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gw_minage').setLabel('Umur akun minimal (hari, 0 = nonaktif)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4).setPlaceholder('7').setValue(String((g && g.minAccountAgeDays) || 0)))
        );
        return interaction.showModal(modal);
    }

    if (action === 'bonus') {
        const roleSelect = new RoleSelectMenuBuilder().setCustomId(`gwbrole_${gwId}_${userId}`).setPlaceholder('Pilih role yang dapat bonus entry...').setMinValues(1).setMaxValues(1);
        return interaction.reply({ content: '🎟️ Pilih role yang akan mendapat **entry bonus** (mis. Booster):', components: [new ActionRowBuilder().addComponents(roleSelect)], ephemeral: true });
    }

    if (action === 'cancel') {
        const g = gv.getGiveaway(gwId);
        if (g && g.channelId && g.messageId) {
            try {
                const ch = interaction.guild.channels.cache.get(g.channelId);
                if (ch) { const msg = await ch.messages.fetch(g.messageId).catch(() => null); if (msg) await msg.delete().catch(() => {}); }
            } catch (_) { /* ignore */ }
        }
        gv.deleteGiveaway(gwId);
        return interaction.update(buildAdminPanel(guildId, userId, interaction.guild));
    }
}

// ==================== STRING SELECT ====================
async function handleGiveawaySelect(interaction) {
    if (!ownerOk(interaction)) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Butuh izin Manage Server!', ephemeral: true });

    const userId = interaction.user.id;
    const parts = interaction.customId.split('_'); // gwsel_<kind>_<userId>
    const kind = parts[1];

    if (kind === 'pick') {
        const gwId = parseInt(interaction.values[0], 10);
        const view = buildManageView(userId, interaction.guild, gwId);
        if (!view) return interaction.update(buildAdminPanel(interaction.guild.id, userId, interaction.guild));
        return interaction.update(view);
    }
}

// ==================== CHANNEL SELECT (post) ====================
async function handleGiveawayChannelSelect(interaction) {
    if (!ownerOk(interaction)) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Butuh izin Manage Server!', ephemeral: true });

    const parts = interaction.customId.split('_'); // gwchan_<gwId>_<userId>
    const gwId = parseInt(parts[1], 10);
    const channelId = interaction.values[0];

    const g = gv.getGiveaway(gwId);
    if (!g) return interaction.update({ content: '❌ Giveaway tidak ditemukan.', components: [] });
    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel) return interaction.update({ content: '❌ Channel tidak ditemukan.', components: [] });

    try {
        const payload = gv.buildGiveawayMessage(g, gv.countEntries(gwId));
        const sent = await channel.send(payload);
        gv.updateGiveaway(gwId, { channelId, messageId: sent.id });
        return interaction.update({ content: `✅ Giveaway diposting ke <#${channelId}>! Bot akan otomatis mengumumkan pemenang saat waktu habis.`, components: [] });
    } catch (e) {
        return interaction.update({ content: `❌ Gagal posting: ${e.message}. Pastikan bot bisa kirim pesan di channel itu.`, components: [] });
    }
}

// ==================== ROLE SELECT (set requirement) ====================
async function handleGiveawayRoleSelect(interaction) {
    if (!ownerOk(interaction)) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Butuh izin Manage Server!', ephemeral: true });

    const parts = interaction.customId.split('_'); // gwrole_<gwId>_<userId>
    const gwId = parseInt(parts[1], 10);
    const roleId = interaction.values[0];
    gv.updateGiveaway(gwId, { requiredRoleId: roleId });
    const g = gv.getGiveaway(gwId);
    if (g && g.messageId) {
        try {
            const ch = interaction.guild.channels.cache.get(g.channelId);
            if (ch) { const msg = await ch.messages.fetch(g.messageId).catch(() => null); if (msg) await msg.edit(gv.buildGiveawayMessage(g, gv.countEntries(gwId))).catch(() => {}); }
        } catch (_) { /* ignore */ }
    }
    return interaction.update({ content: `✅ Syarat role diset ke <@&${roleId}>.`, components: [] });
}

// ==================== ROLE SELECT (bonus entry role) ====================
async function handleGiveawayBonusRoleSelect(interaction) {
    if (!ownerOk(interaction)) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Butuh izin Manage Server!', ephemeral: true });

    const parts = interaction.customId.split('_'); // gwbrole_<gwId>_<userId>
    const gwId = parseInt(parts[1], 10);
    const userId = parts[2];
    const roleId = interaction.values[0];

    const modal = new ModalBuilder().setCustomId(`gwmod_bonusamt_${gwId}_${roleId}_${userId}`).setTitle('Bonus Entry');
    modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gw_bonusamt').setLabel('Entry tambahan untuk role ini').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setPlaceholder('2'))
    );
    return interaction.showModal(modal);
}

// ==================== MODAL ====================
async function handleGiveawayModal(interaction) {
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Butuh izin Manage Server!', ephemeral: true });

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const parts = interaction.customId.split('_'); // gwmod_<kind>_<userId>
    const kind = parts[1];

    if (kind === 'create') {
        const prize = interaction.fields.getTextInputValue('gw_prize').trim();
        const durationMs = gv.parseDuration(interaction.fields.getTextInputValue('gw_duration'));
        let winners = parseInt(interaction.fields.getTextInputValue('gw_winners'), 10);
        if (isNaN(winners) || winners < 1) winners = 1;
        if (winners > 50) winners = 50;
        if (!durationMs) {
            return interaction.reply({ content: '❌ Durasi tidak valid. Pakai format seperti `30m`, `2h`, atau `1d`.', ephemeral: true });
        }
        const gwId = gv.createGiveaway(guildId, { prize, winners, hostId: userId, durationMs });

        const chanSelect = new ChannelSelectMenuBuilder().setCustomId(`gwchan_${gwId}_${userId}`).setPlaceholder('Pilih channel untuk posting giveaway...').setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1);
        return interaction.reply({
            content: `✅ Giveaway **${prize}** dibuat (durasi ${gv.formatDuration(durationMs)}, ${winners} pemenang).\n📤 Sekarang pilih channel untuk memposting:`,
            components: [new ActionRowBuilder().addComponents(chanSelect)],
            ephemeral: true,
        });
    }

    if (kind === 'extend') {
        const gwId = parseInt(parts[2], 10);
        const add = gv.parseDuration(interaction.fields.getTextInputValue('gw_extend'));
        if (!add) return interaction.reply({ content: '❌ Durasi tidak valid. Pakai `30m`, `2h`, `1d`.', ephemeral: true });
        const g = gv.getGiveaway(gwId);
        if (!g || g.ended === 1) return interaction.reply({ content: '❌ Giveaway tidak aktif.', ephemeral: true });
        gv.updateGiveaway(gwId, { endsAt: g.endsAt + add });
        await refreshGiveawayMessage(interaction, gwId);
        const view = buildManageView(userId, interaction.guild, gwId);
        return interaction.update(view || buildAdminPanel(guildId, userId, interaction.guild));
    }

    if (kind === 'antialt') {
        const gwId = parseInt(parts[2], 10);
        let days = parseInt(interaction.fields.getTextInputValue('gw_minage'), 10);
        if (isNaN(days) || days < 0) days = 0;
        if (days > 3650) days = 3650;
        gv.updateGiveaway(gwId, { minAccountAgeDays: days });
        await refreshGiveawayMessage(interaction, gwId);
        const view = buildManageView(userId, interaction.guild, gwId);
        return interaction.update(view || buildAdminPanel(guildId, userId, interaction.guild));
    }

    if (kind === 'bonusamt') {
        const gwId = parseInt(parts[2], 10);
        const roleId = parts[3];
        let amt = parseInt(interaction.fields.getTextInputValue('gw_bonusamt'), 10);
        if (isNaN(amt) || amt < 1) amt = 1;
        if (amt > 50) amt = 50;
        gv.updateGiveaway(gwId, { bonusRoleId: roleId, bonusEntries: amt });
        await refreshGiveawayMessage(interaction, gwId);
        return interaction.reply({ content: `✅ Role <@&${roleId}> sekarang dapat **+${amt} entry**. (Berlaku untuk yang ikut setelah ini.)`, ephemeral: true });
    }
}

// Best-effort: re-render the posted giveaway message after an admin edit.
async function refreshGiveawayMessage(interaction, gwId) {
    const g = gv.getGiveaway(gwId);
    if (!g || !g.channelId || !g.messageId) return;
    try {
        const ch = interaction.guild.channels.cache.get(g.channelId);
        if (ch) { const msg = await ch.messages.fetch(g.messageId).catch(() => null); if (msg) await msg.edit(gv.buildGiveawayMessage(g, gv.countEntries(gwId))).catch(() => {}); }
    } catch (_) { /* ignore */ }
}

// ==================== DETECTORS ====================
function isGiveawayPanelButton(customId) { return typeof customId === 'string' && customId.startsWith('gwadm_'); }
function isGiveawayPanelSelect(customId) { return typeof customId === 'string' && customId.startsWith('gwsel_'); }
function isGiveawayChannelSelect(customId) { return typeof customId === 'string' && customId.startsWith('gwchan_'); }
function isGiveawayRoleSelect(customId) { return typeof customId === 'string' && customId.startsWith('gwrole_'); }
function isGiveawayBonusRoleSelect(customId) { return typeof customId === 'string' && customId.startsWith('gwbrole_'); }
function isGiveawayPanelModal(customId) { return typeof customId === 'string' && customId.startsWith('gwmod_'); }

module.exports = {
    buildAdminPanel, buildManageView,
    handleGiveawayCommand, handleGiveawayButton, handleGiveawaySelect,
    handleGiveawayChannelSelect, handleGiveawayRoleSelect, handleGiveawayBonusRoleSelect, handleGiveawayModal,
    isGiveawayPanelButton, isGiveawayPanelSelect, isGiveawayChannelSelect,
    isGiveawayRoleSelect, isGiveawayBonusRoleSelect, isGiveawayPanelModal,
};
