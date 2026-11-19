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
const { db, getSetting } = require('../database');
const ui = require('./ui');

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
    const category = space ? guild.channels?.cache?.get(space.categoryId) : null;
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

    const voiceChannel = guild.channels?.cache?.get(space.voiceChannelId);
    const everyoneId = guild.roles?.everyone?.id;
    const isLocked = Boolean(everyoneId ? (voiceChannel?.permissionOverwrites?.cache?.get(everyoneId)?.deny?.has(PermissionsBitField.Flags.Connect) ?? true) : true);
    const userLimit = voiceChannel?.userLimit || 0;

    const embed = new EmbedBuilder()
        .setTitle('🔒 Private Space Control')
        .setColor(ui.COLORS.trade)
        .setDescription(
            `📁 <#${space.categoryId}>\n` +
            `💬 <#${space.textChannelId}>\n` +
            `🔊 <#${space.voiceChannelId}>\n\n` +
            `> 🔒 Voice Status: **${isLocked ? 'Terkunci (Private)' : 'Terbuka'}**\n` +
            `> 👥 Voice Limit: **${userLimit > 0 ? `${userLimit} orang` : 'Unlimited'}**\n` +
            `> 👻 Category: **${space.hidden ? 'Hidden' : 'Visible'}**\n\n` +
            '> Gunakan tombol di bawah untuk mengatur member, voice limit, dan privasi.'
        );

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`psp_add_${ownerId}`).setLabel('➕ Add User').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`psp_kick_${ownerId}`).setLabel('👢 Kick User').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`psp_lock_${ownerId}`).setLabel(isLocked ? '🔓 Unlock Voice' : '🔒 Lock Voice').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`psp_limit_${ownerId}`).setLabel('👥 Voice Limit').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`psp_hide_${ownerId}`).setLabel(space.hidden ? '👁️ Show Cat' : '👻 Hide Cat').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`psp_rename_${ownerId}`).setLabel('✏️ Rename').setStyle(ButtonStyle.Secondary),
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
        const anchorId = getSetting(guild.id, 'private_space_category_anchor', null);
        if (anchorId) {
            const positionAnchor = await guild.channels.fetch(anchorId).catch(() => null);
            if (positionAnchor?.type === ChannelType.GuildCategory) {
                await category.setPosition(positionAnchor.position + 1).catch(() => {});
            }
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
                .setDescription('Gunakan `/tempvoice` lalu **Manage Space** untuk atur member, voice limit, kunci voice, atau rename Space.')]
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
            '> Owner bisa add user, kick user, lock/unlock voice, set limit, rename, dan delete Space.'
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
    const category = guild.channels?.cache?.get(space.categoryId);
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

    if (action === 'lock') {
        const voiceChannel = guild.channels?.cache?.get(space.voiceChannelId);
        if (!voiceChannel) return interaction.reply({ content: '❌ Voice channel tidak ditemukan.', flags: MessageFlags.Ephemeral });
        const everyoneId = guild.roles?.everyone?.id;
        if (!everyoneId) return interaction.reply({ content: '❌ Role everyone tidak ditemukan.', flags: MessageFlags.Ephemeral });
        const isLocked = Boolean(voiceChannel.permissionOverwrites?.cache?.get(everyoneId)?.deny?.has(PermissionsBitField.Flags.Connect) ?? true);
        await voiceChannel.permissionOverwrites.edit(everyoneId, {
            Connect: isLocked ? null : false
        }).catch(() => {});
        return interaction.update(buildManagePanel(guild, user.id));
    }

    if (action === 'limit') {
        const voiceChannel = guild.channels?.cache?.get(space.voiceChannelId);
        const modal = new ModalBuilder().setCustomId(`psp_modal_limit_${user.id}`).setTitle('Voice Channel Limit');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('psp_limit_val')
                .setLabel('User Limit (0 = bebas, 1-99):')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(2)
                .setValue(String(voiceChannel?.userLimit || 0))
        ));
        return interaction.showModal(modal);
    }

    if (action === 'hide') {
        const nextHidden = space.hidden ? 0 : 1;
        const members = category.permissionOverwrites?.cache?.filter(overwrite => overwrite.type === 1 && overwrite.id !== user.id);
        if (members) {
            for (const overwrite of members.values()) {
                await category.permissionOverwrites.edit(overwrite.id, { ViewChannel: nextHidden ? false : true }).catch(() => {});
            }
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
        const textChannel = guild.channels?.cache?.get(space.textChannelId);
        const voiceChannel = guild.channels?.cache?.get(space.voiceChannelId);
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
    const category = space && interaction.guild.channels?.cache?.get(space.categoryId);
    const voiceChannel = space && interaction.guild.channels?.cache?.get(space.voiceChannelId);
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
    const space = getSpace(interaction.guild.id, interaction.user.id);
    if (!space) return interaction.reply({ content: '❌ Private Space tidak ditemukan.', flags: MessageFlags.Ephemeral });

    if (interaction.customId.startsWith('psp_modal_rename_')) {
        const category = interaction.guild.channels?.cache?.get(space.categoryId);
        if (!category) return interaction.reply({ content: '❌ Category tidak ditemukan.', flags: MessageFlags.Ephemeral });
        const name = interaction.fields.getTextInputValue('psp_name').trim();
        if (!name) return interaction.reply({ content: '❌ Nama wajib diisi.', flags: MessageFlags.Ephemeral });
        await category.setName(`🔒 ${name}`).catch(() => null);
        return interaction.reply({ content: '✅ Nama category diubah.', flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId.startsWith('psp_modal_limit_')) {
        const voiceChannel = interaction.guild.channels?.cache?.get(space.voiceChannelId);
        if (!voiceChannel) return interaction.reply({ content: '❌ Voice channel tidak ditemukan.', flags: MessageFlags.Ephemeral });
        let limit = parseInt(interaction.fields.getTextInputValue('psp_limit_val'), 10);
        if (isNaN(limit) || limit < 0) limit = 0;
        if (limit > 99) limit = 99;
        await voiceChannel.setUserLimit(limit).catch(() => {});
        return interaction.reply({ content: `✅ Voice limit diset ke **${limit === 0 ? 'Unlimited' : limit}**.`, flags: MessageFlags.Ephemeral });
    }
}

async function cleanupMemberSpace(guild, memberId) {
    if (!guild || !memberId) return;
    const space = getSpace(guild.id, memberId);
    if (!space) return;
    const textChannel = guild.channels?.cache?.get(space.textChannelId);
    const voiceChannel = guild.channels?.cache?.get(space.voiceChannelId);
    const category = guild.channels?.cache?.get(space.categoryId);
    await Promise.all([
        textChannel?.delete().catch(() => {}),
        voiceChannel?.delete().catch(() => {})
    ]);
    await category?.delete().catch(() => {});
    deleteSpaceRecord(guild.id, memberId);
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
    buildTempvoicePanel: buildMainPanel,
    buildManagePanel,
    handleTempvoiceCommand,
    handleTempvoiceButton,
    handleTempvoiceUserSelect,
    handleTempvoiceModal,
    cleanupMemberSpace,
    isTempvoicePanelButton,
    isTempvoiceUserSelect,
    isTempvoiceModal
};
