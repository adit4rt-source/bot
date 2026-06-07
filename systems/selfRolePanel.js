// systems/selfRolePanel.js — Admin UI for managing Self-Role menus.
//
// Flow (all admin-only, ephemeral where it makes sense):
//   /selfrole                       -> main panel (list menus + Create)
//   Create  (button)                -> modal (title, description, type)
//   Manage  (select a menu)         -> manage view for that menu
//   Add Role (button)               -> RoleSelect -> modal (label/emoji/desc)
//   Remove Role (button)            -> StringSelect of current roles
//   Publish (button)                -> ChannelSelect -> posts the public message
//   Toggle Type / Delete / Back     -> buttons
//
// customId scheme (userId is ALWAYS the last segment for ownership checks):
//   buttons       sradm_<action>[_<menuId>]_<userId>
//   string select srsel_pick_<userId>  |  srsel_del_<menuId>_<userId>
//   role select   srrole_<menuId>_<userId>
//   channel sel.  srchan_<menuId>_<userId>
//   modals        srmod_create_<userId>  |  srmod_add_<menuId>_<roleId>_<userId>

const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    RoleSelectMenuBuilder, ChannelSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType,
} = require('discord.js');
const sr = require('./selfRoles');
const ui = require('./ui');

// ==================== HELPERS ====================
function lastSeg(customId) { const p = customId.split('_'); return p[p.length - 1]; }

function isAdmin(interaction) {
    return interaction.member?.permissions?.has?.('Administrator');
}

function ownerOk(interaction) {
    return interaction.user.id === lastSeg(interaction.customId);
}

// ==================== BUILD: Main Panel ====================
function buildAdminPanel(guildId, userId, guild) {
    const menus = sr.getMenus(guildId);
    const lines = menus.length
        ? menus.map(m => {
            const opts = sr.getOptions(m.id);
            const status = m.messageId ? `✅ sudah tampil di <#${m.channelId}>` : '⏳ belum dikirim';
            return `> **${m.title || 'Menu tanpa nama'}** — ${opts.length} role • ${status}`;
        }).join('\n')
        : '> _Belum ada menu. Tekan **Buat Menu Baru** untuk mulai._';

    const embed = new EmbedBuilder()
        .setColor(ui.COLORS.info)
        .setTitle('🎭 Self Roles')
        .setDescription(
            'Bikin menu biar member bisa **ambil role sendiri** lewat dropdown (tanpa react emoji).\n\n' +
            '**Cara pakai (3 langkah):**\n' +
            '1️⃣ Tekan **Buat Menu Baru** → isi nama menu\n' +
            '2️⃣ Tekan **Atur Menu** → **Tambah Role**\n' +
            '3️⃣ Tekan **Kirim ke Channel** → pilih channel\n\n' +
            `**Menu kamu (${menus.length}):**\n${lines}`
        )
        .setFooter({ text: ui.footer(guild.name) });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sradm_create_${userId}`).setLabel('Buat Menu Baru').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`sradm_manage_${userId}`).setLabel('Atur Menu').setEmoji('🛠️').setStyle(ButtonStyle.Primary).setDisabled(menus.length === 0)
    );
    return { embeds: [embed], components: [row] };
}

// ==================== BUILD: Manage View ====================
function buildManageView(guildId, userId, guild, menuId) {
    const menu = sr.getMenu(guildId, menuId);
    if (!menu) return null;
    const opts = sr.getOptions(menuId);
    const roleLines = opts.length
        ? opts.map(o => `> ${o.emoji ? o.emoji + ' ' : ''}<@&${o.roleId}>${o.description ? ` — *${o.description}*` : ''}`).join('\n')
        : '> _Belum ada role. Tekan **Tambah Role** dulu._';

    const ruleText = menu.type === 'unique'
        ? '🔘 Member cuma bisa ambil **1 role** dari menu ini'
        : '✅ Member bisa ambil **banyak role** sekaligus';

    const nextStep = opts.length === 0
        ? '\n\n👉 **Langkah berikutnya:** tekan **Tambah Role**.'
        : (!menu.messageId ? '\n\n👉 **Langkah berikutnya:** tekan **Kirim ke Channel**.' : '');

    const embed = new EmbedBuilder()
        .setColor(menu.color || ui.COLORS.info)
        .setTitle(`🛠️ Atur Menu: ${menu.title || 'tanpa nama'}`)
        .setDescription(
            `📝 Keterangan: ${menu.description ? menu.description.slice(0, 100) : '_kosong_'}\n` +
            `🎯 Aturan pilih: ${ruleText}\n` +
            `📍 Status: ${menu.messageId ? `✅ sudah tampil di <#${menu.channelId}>` : '⏳ belum dikirim ke channel'}\n\n` +
            `**Role di menu ini (${opts.length}/25):**\n${roleLines}` +
            nextStep
        )
        .setFooter({ text: ui.footer('Setiap perubahan langsung ke-update di pesan yang sudah dikirim') });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sradm_addrole_${menuId}_${userId}`).setLabel('Tambah Role').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`sradm_delrole_${menuId}_${userId}`).setLabel('Hapus Role').setEmoji('➖').setStyle(ButtonStyle.Secondary).setDisabled(opts.length === 0),
        new ButtonBuilder().setCustomId(`sradm_publish_${menuId}_${userId}`).setLabel(menu.messageId ? 'Kirim Ulang' : 'Kirim ke Channel').setEmoji('📤').setStyle(ButtonStyle.Primary).setDisabled(opts.length === 0)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sradm_type_${menuId}_${userId}`).setLabel(menu.type === 'unique' ? 'Ubah: boleh banyak role' : 'Ubah: cuma 1 role').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`sradm_delete_${menuId}_${userId}`).setLabel('Hapus Menu').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`sradm_back_${userId}`).setLabel('Kembali').setEmoji('🔙').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row1, row2] };
}

// ==================== COMMAND ====================
async function handleSelfRoleCommand(interaction) {
    if (!isAdmin(interaction)) {
        return interaction.reply({ content: '❌ Hanya admin yang bisa menggunakan panel ini!', ephemeral: true });
    }
    return interaction.reply(buildAdminPanel(interaction.guild.id, interaction.user.id, interaction.guild));
}

// ==================== BUTTONS ====================
async function handleSelfRoleButton(interaction) {
    if (!ownerOk(interaction)) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const menuId = parts.length >= 4 ? parseInt(parts[2], 10) : null;

    if (action === 'back') {
        return interaction.update(buildAdminPanel(guildId, userId, interaction.guild));
    }

    if (action === 'create') {
        const modal = new ModalBuilder().setCustomId(`srmod_create_${userId}`).setTitle('Buat Menu Self-Role');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sr_title').setLabel('Nama menu').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder('Contoh: Pilih Role Notifikasi')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sr_desc').setLabel('Keterangan (boleh dikosongi)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setPlaceholder('Contoh: Pilih role buat dapat notifikasi event'))
        );
        return interaction.showModal(modal);
    }

    if (action === 'manage') {
        const menus = sr.getMenus(guildId);
        if (!menus.length) return interaction.reply({ content: '❌ Belum ada menu.', ephemeral: true });
        const select = new StringSelectMenuBuilder().setCustomId(`srsel_pick_${userId}`).setPlaceholder('🛠️ Pilih menu yang mau diatur...');
        for (const m of menus.slice(0, 25)) {
            const opt = new StringSelectMenuOptionBuilder()
                .setLabel((m.title || 'Menu tanpa nama').slice(0, 90))
                .setValue(String(m.id))
                .setDescription(`${sr.getOptions(m.id).length} role`);
            select.addOptions(opt);
        }
        return interaction.update({ embeds: [buildAdminPanel(guildId, userId, interaction.guild).embeds[0]], components: [new ActionRowBuilder().addComponents(select)] });
    }

    if (action === 'addrole') {
        const roleSelect = new RoleSelectMenuBuilder().setCustomId(`srrole_${menuId}_${userId}`).setPlaceholder('Pilih role yang mau ditambahkan...').setMinValues(1).setMaxValues(1);
        return interaction.reply({ content: '➕ Pilih role untuk ditambahkan ke menu:', components: [new ActionRowBuilder().addComponents(roleSelect)], ephemeral: true });
    }

    if (action === 'delrole') {
        const opts = sr.getOptions(menuId);
        if (!opts.length) return interaction.reply({ content: '❌ Tidak ada role untuk dihapus.', ephemeral: true });
        const select = new StringSelectMenuBuilder().setCustomId(`srsel_del_${menuId}_${userId}`).setPlaceholder('➖ Pilih role untuk dihapus...').setMinValues(1).setMaxValues(1);
        for (const o of opts) {
            const role = interaction.guild.roles.cache.get(o.roleId);
            select.addOptions(new StringSelectMenuOptionBuilder().setLabel((o.label || (role ? role.name : o.roleId)).slice(0, 100)).setValue(o.roleId));
        }
        return interaction.reply({ content: '➖ Pilih role untuk dihapus dari menu:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    }

    if (action === 'publish') {
        const chanSelect = new ChannelSelectMenuBuilder().setCustomId(`srchan_${menuId}_${userId}`).setPlaceholder('Pilih channel untuk publish...').setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1);
        return interaction.reply({ content: '📤 Pilih channel tempat menu akan dipublish:', components: [new ActionRowBuilder().addComponents(chanSelect)], ephemeral: true });
    }

    if (action === 'type') {
        const menu = sr.getMenu(guildId, menuId);
        if (!menu) return interaction.reply({ content: '❌ Menu tidak ditemukan.', ephemeral: true });
        const newType = menu.type === 'unique' ? 'multi' : 'unique';
        sr.updateMenu(guildId, menuId, { type: newType });
        await sr.refreshPublicMessage(interaction.guild, sr.getMenu(guildId, menuId));
        return interaction.update(buildManageView(guildId, userId, interaction.guild, menuId));
    }

    if (action === 'delete') {
        const menu = sr.getMenu(guildId, menuId);
        if (menu && menu.channelId && menu.messageId) {
            try {
                const ch = interaction.guild.channels.cache.get(menu.channelId);
                if (ch) { const msg = await ch.messages.fetch(menu.messageId).catch(() => null); if (msg) await msg.delete().catch(() => {}); }
            } catch (_) { /* ignore */ }
        }
        sr.deleteMenu(guildId, menuId);
        return interaction.update(buildAdminPanel(guildId, userId, interaction.guild));
    }

    // sradm_view_<menuId>_<userId> (used by selects to refresh manage view)
    if (action === 'view') {
        const view = buildManageView(guildId, userId, interaction.guild, menuId);
        if (!view) return interaction.update(buildAdminPanel(guildId, userId, interaction.guild));
        return interaction.update(view);
    }
}

// ==================== STRING SELECTS ====================
async function handleSelfRoleSelect(interaction) {
    if (!ownerOk(interaction)) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const parts = interaction.customId.split('_'); // srsel_<kind>_...
    const kind = parts[1];

    if (kind === 'pick') {
        const menuId = parseInt(interaction.values[0], 10);
        const view = buildManageView(guildId, userId, interaction.guild, menuId);
        if (!view) return interaction.update(buildAdminPanel(guildId, userId, interaction.guild));
        return interaction.update(view);
    }

    if (kind === 'del') {
        const menuId = parseInt(parts[2], 10);
        const roleId = interaction.values[0];
        sr.removeOption(menuId, roleId);
        await sr.refreshPublicMessage(interaction.guild, sr.getMenu(guildId, menuId));
        return interaction.update({ content: `✅ Role <@&${roleId}> dihapus dari menu #${menuId}.`, components: [] });
    }
}

// ==================== ROLE SELECT (add role) ====================
async function handleSelfRoleRoleSelect(interaction) {
    if (!ownerOk(interaction)) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });

    const parts = interaction.customId.split('_'); // srrole_<menuId>_<userId>
    const menuId = parseInt(parts[1], 10);
    const userId = parts[2];
    const roleId = interaction.values[0];

    // Block roles the bot can't manage (higher than bot's top role / managed roles).
    const role = interaction.guild.roles.cache.get(roleId);
    const me = interaction.guild.members.me;
    if (role && me && (role.managed || role.position >= me.roles.highest.position)) {
        return interaction.update({ content: `⚠️ Role <@&${roleId}> tidak bisa dikelola bot (posisi role bot harus di atasnya, dan bukan role terkelola integrasi).`, components: [] });
    }

    const modal = new ModalBuilder().setCustomId(`srmod_add_${menuId}_${roleId}_${userId}`).setTitle('Detail Role (opsional)');
    modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sr_label').setLabel('Label tampilan (kosong = nama role)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sr_emoji').setLabel('Emoji (1 emoji / <:nama:id>)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sr_optdesc').setLabel('Deskripsi singkat (opsional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100))
    );
    return interaction.showModal(modal);
}

// ==================== CHANNEL SELECT (publish) ====================
async function handleSelfRoleChannelSelect(interaction) {
    if (!ownerOk(interaction)) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });

    const parts = interaction.customId.split('_'); // srchan_<menuId>_<userId>
    const menuId = parseInt(parts[1], 10);
    const channelId = interaction.values[0];
    const guildId = interaction.guild.id;

    const menu = sr.getMenu(guildId, menuId);
    if (!menu) return interaction.update({ content: '❌ Menu tidak ditemukan.', components: [] });

    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel) return interaction.update({ content: '❌ Channel tidak ditemukan.', components: [] });

    // If re-publishing, try to remove the old message first.
    if (menu.messageId && menu.channelId) {
        try {
            const oldCh = interaction.guild.channels.cache.get(menu.channelId);
            if (oldCh) { const old = await oldCh.messages.fetch(menu.messageId).catch(() => null); if (old) await old.delete().catch(() => {}); }
        } catch (_) { /* ignore */ }
    }

    try {
        const payload = sr.buildPublicMessage(menu, sr.getOptions(menuId), interaction.guild);
        const sent = await channel.send(payload);
        sr.updateMenu(guildId, menuId, { channelId, messageId: sent.id });
        return interaction.update({ content: `✅ Menu #${menuId} dipublish ke <#${channelId}>!`, components: [] });
    } catch (e) {
        return interaction.update({ content: `❌ Gagal publish: ${e.message}. Pastikan bot punya izin kirim pesan di channel itu.`, components: [] });
    }
}

// ==================== MODALS ====================
async function handleSelfRoleModal(interaction) {
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const parts = interaction.customId.split('_'); // srmod_<kind>_...
    const kind = parts[1];

    if (kind === 'create') {
        const title = interaction.fields.getTextInputValue('sr_title').trim();
        const desc = (interaction.fields.getTextInputValue('sr_desc') || '').trim();
        // Default: members can pick many roles. Admin can switch to "1 role only"
        // later with a clearly-labelled button in the manage view.
        const menuId = sr.createMenu(guildId, { title, description: desc, type: 'multi' });
        const view = buildManageView(guildId, userId, interaction.guild, menuId);
        return interaction.reply({ ...view, ephemeral: false });
    }

    if (kind === 'add') {
        const menuId = parseInt(parts[2], 10);
        const roleId = parts[3];
        const label = (interaction.fields.getTextInputValue('sr_label') || '').trim();
        const emoji = (interaction.fields.getTextInputValue('sr_emoji') || '').trim();
        const optdesc = (interaction.fields.getTextInputValue('sr_optdesc') || '').trim();
        const res = sr.addOption(menuId, { roleId, label, emoji, description: optdesc });
        if (!res.ok) {
            const msg = res.reason === 'duplicate' ? '⚠️ Role itu sudah ada di menu.' : '⚠️ Menu sudah penuh (maks 25 role).';
            return interaction.reply({ content: msg, ephemeral: true });
        }
        await sr.refreshPublicMessage(interaction.guild, sr.getMenu(guildId, menuId));
        return interaction.reply({ content: `✅ Role <@&${roleId}> ditambahkan ke menu #${menuId}.${emoji && !sr.normalizeEmoji(emoji) ? '\n⚠️ Emoji diabaikan (harus 1 emoji atau format <:nama:id>).' : ''}`, ephemeral: true });
    }
}

// ==================== DETECTORS ====================
function isSelfRolePanelButton(customId) { return typeof customId === 'string' && customId.startsWith('sradm_'); }
function isSelfRolePanelSelect(customId) { return typeof customId === 'string' && customId.startsWith('srsel_'); }
function isSelfRoleRoleSelect(customId) { return typeof customId === 'string' && customId.startsWith('srrole_'); }
function isSelfRoleChannelSelect(customId) { return typeof customId === 'string' && customId.startsWith('srchan_'); }
function isSelfRolePanelModal(customId) { return typeof customId === 'string' && customId.startsWith('srmod_'); }

module.exports = {
    buildAdminPanel, buildManageView,
    handleSelfRoleCommand, handleSelfRoleButton, handleSelfRoleSelect,
    handleSelfRoleRoleSelect, handleSelfRoleChannelSelect, handleSelfRoleModal,
    isSelfRolePanelButton, isSelfRolePanelSelect, isSelfRoleRoleSelect,
    isSelfRoleChannelSelect, isSelfRolePanelModal,
};
