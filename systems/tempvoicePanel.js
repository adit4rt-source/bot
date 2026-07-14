// systems/tempvoicePanel.js - Private Space panel
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    UserSelectMenuBuilder,
    ChannelType,
    PermissionsBitField,
    TextInputBuilder,
    TextInputStyle,
    ModalBuilder,
    MessageFlags
} = require('discord.js');
const { db } = require('../database');
const ui = require('./ui');

const SPACE_POSITION_AFTER_CATEGORY_ID = '1526405329917710387';

const EVERYONE_PERMISSIONS = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.Speak
];
const MEMBER_PERMISSIONS = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.Speak
];
const OWNER_PERMISSIONS = [
    ...MEMBER_PERMISSIONS,
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ManageRoles,
    PermissionsBitField.Flags.MoveMembers
];

function getSpace(guildId, ownerId) {
    return db.prepare('SELECT * FROM private_spaces WHERE guildId = ? AND ownerId = ?').get(guildId, ownerId);
}

function deleteSpaceRecord(guildId, ownerId) {
    db.prepare('DELETE FROM private_spaces WHERE guildId = ? AND ownerId = ?').run(guildId, ownerId);
}

function buildMainPanel(guild, ownerId) {
    const space = getSpace(guild.id, ownerId);
    const category = space ? guild.channels.cache.get(space.categoryId) : null;
    if (space && !category) {
        deleteSpaceRecord(guild.id, ownerId);
        return buildMainPanel(guild, ownerId);
    }

    const description = space
        ? ui.statBlock([
            `📁 Category: <#${space.categoryId}>`,
            `💬 Chat: <#${space.textChannelId}>`,
            `🔊 Voice: <#${space.voiceChannelId}>`,
            `👻 Category: ${space.hidden ? 'Tersembunyi dari member' : 'Terlihat untuk member'}`
        ]) + '\n\nGunakan tombol untuk mengelola member dan privasi Space.'
        : 'Buat Space privat berisi kategori, channel chat, dan channel voice. Hanya owner dan member yang ditambahkan bisa akses.';

    const embed = new EmbedBuilder()
        .setTitle(ui.title('🔒', 'PRIVATE SPACE'))
        .setColor(ui.COLORS.trade)
        .setDescription(description)
        .setFooter({ text: ui.footer(`${guild.name} • Space tidak dihapus saat voice kosong`) })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`psp_create_${ownerId}`).setLabel('➕ Create Space').setStyle(ButtonStyle.Success).setDisabled(Boolean(space)),
        new ButtonBuilder().setCustomId(`psp_manage_${ownerId}`).setLabel('⚙️ Manage Space').setStyle(ButtonStyle.Primary).setDisabled(!space),
        new ButtonBuilder().setCustomId(`psp_refresh_${ownerId}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

function buildManagePanel(guild, ownerId) {
    const space = getSpace(guild.id, ownerId);
    if (!space) return buildMainPanel(guild, ownerId);

    const embed = new EmbedBuilder()
        .setTitle('🔒 Private Space Control')
        .setColor(ui.COLORS.trade)
        .setDescription(
            `📁 <#${space.categoryId}>\n` +
            `💬 <#${space.textChannelId}>\n` +
            `🔊 <#${space.voiceChannelId}>\n\n` +
            '> Add User memberi akses kategori, chat, dan voice.\n' +
            '> Kick User mencabut akses lalu disconnect dari voice.\n' +
            `> Category sekarang: **${space.hidden ? 'Hidden' : 'Visible untuk member'}**.`
        );

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`psp_add_${ownerId}`).setLabel('➕ Add User').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`psp_kick_${ownerId}`).setLabel('👢 Kick User').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`psp_hide_${ownerId}`).setLabel(space.hidden ? '👁️ Show Category' : '👻 Hide Category').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`psp_rename_${ownerId}`).setLabel('✏️ Rename').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`psp_delete_${ownerId}`).setLabel('🗑️ Delete Space').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`psp_back_${ownerId}`).setLabel('🔙 Back').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2] };
}

function getOwnerId(customId) {
    return customId.split('_').at(-1);
}

function requireOwner(interaction) {
    if (interaction.user.id === getOwnerId(interaction.customId)) return true;
    interaction.reply({ content: '❌ Ini bukan Private Space kamu.', flags: MessageFlags.Ephemeral });
    return false;
}

async function createPrivateSpace(interaction) {
    const { guild, user } = interaction;
    if (getSpace(guild.id, user.id)) {
        return interaction.reply({ content: '❌ Kamu sudah punya Private Space.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferUpdate();
    const baseName = user.username.replace(/[\\/:*?"<>|]/g, '').slice(0, 60) || 'Member';
    const overwrites = [
        { id: guild.roles.everyone.id, deny: EVERYONE_PERMISSIONS },
        { id: user.id, allow: OWNER_PERMISSIONS }
    ];
    let category;
    let textChannel;
    let voiceChannel;

    try {
        category = await guild.channels.create({
            name: `🔒 ${baseName}'s Space`,
            type: ChannelType.GuildCategory,
            permissionOverwrites: overwrites,
            reason: `Private Space untuk ${user.tag}`
        });
        const positionAnchor = await guild.channels.fetch(SPACE_POSITION_AFTER_CATEGORY_ID).catch(() => null);
        if (positionAnchor?.type === ChannelType.GuildCategory) {
            await category.setPosition(positionAnchor.position + 1);
        }

        textChannel = await guild.channels.create({
            name: '💬-chat',
            type: ChannelType.GuildText,
            parent: category.id,
            reason: `Private Space untuk ${user.tag}`
        });
        voiceChannel = await guild.channels.create({
            name: '🔊 Voice',
            type: ChannelType.GuildVoice,
            parent: category.id,
            reason: `Private Space untuk ${user.tag}`
        });

        await textChannel.lockPermissions();
        await voiceChannel.lockPermissions();
        db.prepare('INSERT INTO private_spaces (guildId, ownerId, categoryId, textChannelId, voiceChannelId, hidden) VALUES (?, ?, ?, ?, ?, 0)')
            .run(guild.id, user.id, category.id, textChannel.id, voiceChannel.id);

        await textChannel.send({
            content: `<@${user.id}>`,
            embeds: [new EmbedBuilder()
                .setTitle('🔒 Private Space Ready')
                .setColor(ui.COLORS.trade)
                .setDescription('Gunakan `/tempvoice open` lalu **Manage Space** untuk add user, kick user, hide category, atau rename Space.')]
        }).catch(() => {});

        return interaction.editReply(buildManagePanel(guild, user.id));
    } catch (error) {
        console.error('[private-space] create failed:', error);
        await Promise.all([textChannel?.delete().catch(() => {}), voiceChannel?.delete().catch(() => {}), category?.delete().catch(() => {})]);
        return interaction.editReply({ content: '❌ Gagal membuat Private Space. Pastikan bot punya Manage Channels dan Manage Roles.', embeds: [], components: [] });
    }
}

function buildSetupPanel(guild) {
    const embed = new EmbedBuilder()
        .setTitle(ui.title('🔒', 'PRIVATE SPACE'))
        .setColor(ui.COLORS.trade)
        .setDescription(
            'Buat ruang privat sendiri berisi kategori, channel chat, dan channel voice.\n\n' +
            '> Owner bisa add user, kick user, hide category, rename, dan delete Space.'
        )
        .setFooter({ text: ui.footer(`${guild.name} • Klik tombol untuk mulai`) });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('psp_open').setLabel('🔒 Create Private Space').setStyle(ButtonStyle.Success)
    );
    return { embeds: [embed], components: [row] };
}

async function handleTempvoiceCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'setup') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ Hanya admin yang bisa setup panel.', flags: MessageFlags.Ephemeral });
        }
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        if (!targetChannel?.isTextBased()) {
            return interaction.reply({ content: '❌ Pilih channel text untuk panel.', flags: MessageFlags.Ephemeral });
        }
        await targetChannel.send(buildSetupPanel(interaction.guild));
        return interaction.reply({ content: `✅ Panel Private Space dikirim ke <#${targetChannel.id}>.`, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ ...buildMainPanel(interaction.guild, interaction.user.id), flags: MessageFlags.Ephemeral });
}

async function handleTempvoiceButton(interaction) {
    if (interaction.customId === 'psp_open') {
        return interaction.reply({ ...buildMainPanel(interaction.guild, interaction.user.id), flags: MessageFlags.Ephemeral });
    }
    if (!requireOwner(interaction)) return;
    const action = interaction.customId.split('_')[1];
    const { guild, user } = interaction;

    if (action === 'create') return createPrivateSpace(interaction);
    if (action === 'refresh' || action === 'back') return interaction.update(buildMainPanel(guild, user.id));
    if (action === 'manage') return interaction.update(buildManagePanel(guild, user.id));

    const space = getSpace(guild.id, user.id);
    if (!space) return interaction.update(buildMainPanel(guild, user.id));
    const category = guild.channels.cache.get(space.categoryId);
    if (!category) {
        deleteSpaceRecord(guild.id, user.id);
        return interaction.update(buildMainPanel(guild, user.id));
    }

    if (action === 'add' || action === 'kick') {
        const menu = new UserSelectMenuBuilder()
            .setCustomId(`psp_select_${action}_${user.id}`)
            .setPlaceholder(action === 'add' ? 'Pilih user untuk diberi akses' : 'Pilih user untuk dikeluarkan')
            .setMinValues(1)
            .setMaxValues(1);
        const row = new ActionRowBuilder().addComponents(menu);
        return interaction.reply({ content: action === 'add' ? 'Pilih member untuk ditambahkan.' : 'Pilih member untuk dikeluarkan.', components: [row], flags: MessageFlags.Ephemeral });
    }

    if (action === 'hide') {
        const nextHidden = space.hidden ? 0 : 1;
        const members = category.permissionOverwrites.cache.filter(overwrite => overwrite.type === 1 && overwrite.id !== user.id);
        for (const overwrite of members.values()) {
            await category.permissionOverwrites.edit(overwrite.id, { ViewChannel: nextHidden ? false : true }).catch(() => {});
        }
        db.prepare('UPDATE private_spaces SET hidden = ? WHERE guildId = ? AND ownerId = ?').run(nextHidden, guild.id, user.id);
        return interaction.update(buildManagePanel(guild, user.id));
    }

    if (action === 'rename') {
        const modal = new ModalBuilder().setCustomId(`psp_modal_rename_${user.id}`).setTitle('Rename Private Space');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('psp_name').setLabel('Nama category').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(category.name.replace(/^🔒\s*/, ''))
        ));
        return interaction.showModal(modal);
    }

    if (action === 'delete') {
        const textChannel = guild.channels.cache.get(space.textChannelId);
        const voiceChannel = guild.channels.cache.get(space.voiceChannelId);
        await Promise.all([textChannel?.delete().catch(() => {}), voiceChannel?.delete().catch(() => {})]);
        await category.delete().catch(() => {});
        deleteSpaceRecord(guild.id, user.id);
        return interaction.update(buildMainPanel(guild, user.id));
    }
}

async function handleTempvoiceUserSelect(interaction) {
    if (!requireOwner(interaction)) return;
    const [, , action] = interaction.customId.split('_');
    const ownerId = interaction.user.id;
    const memberId = interaction.values[0];
    if (memberId === ownerId) return interaction.reply({ content: '❌ Kamu sudah owner Space ini.', flags: MessageFlags.Ephemeral });

    const space = getSpace(interaction.guild.id, ownerId);
    const category = space && interaction.guild.channels.cache.get(space.categoryId);
    const voiceChannel = space && interaction.guild.channels.cache.get(space.voiceChannelId);
    if (!space || !category) return interaction.reply({ content: '❌ Private Space tidak ditemukan.', flags: MessageFlags.Ephemeral });

    if (action === 'add') {
        await category.permissionOverwrites.edit(memberId, { ViewChannel: !space.hidden, SendMessages: true, ReadMessageHistory: true, Connect: true, Speak: true });
        return interaction.update({ content: `✅ <@${memberId}> ditambahkan ke Private Space.`, components: [] });
    }

    if (action === 'kick') {
        await category.permissionOverwrites.delete(memberId).catch(() => {});
        const member = await interaction.guild.members.fetch(memberId).catch(() => null);
        if (member?.voice.channelId === voiceChannel?.id) await member.voice.disconnect().catch(() => {});
        return interaction.update({ content: `👢 <@${memberId}> dikeluarkan dari Private Space.`, components: [] });
    }
}

async function handleTempvoiceModal(interaction) {
    if (!requireOwner(interaction)) return;
    if (!interaction.customId.startsWith('psp_modal_rename_')) return;
    const space = getSpace(interaction.guild.id, interaction.user.id);
    const category = space && interaction.guild.channels.cache.get(space.categoryId);
    if (!category) return interaction.reply({ content: '❌ Private Space tidak ditemukan.', flags: MessageFlags.Ephemeral });
    const name = interaction.fields.getTextInputValue('psp_name').trim();
    if (!name) return interaction.reply({ content: '❌ Nama wajib diisi.', flags: MessageFlags.Ephemeral });
    await category.setName(`🔒 ${name}`).catch(() => null);
    return interaction.reply({ content: '✅ Nama category diubah.', flags: MessageFlags.Ephemeral });
}

function isTempvoicePanelButton(customId) {
    return customId.startsWith('psp_') && !customId.startsWith('psp_select_') && !customId.startsWith('psp_modal_');
}

function isTempvoiceUserSelect(customId) {
    return customId.startsWith('psp_select_');
}

function isTempvoiceModal(customId) {
    return customId.startsWith('psp_modal_');
}

module.exports = {
    handleTempvoiceCommand,
    handleTempvoiceButton,
    handleTempvoiceUserSelect,
    handleTempvoiceModal,
    isTempvoicePanelButton,
    isTempvoiceUserSelect,
    isTempvoiceModal
};