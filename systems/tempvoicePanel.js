// systems/tempvoicePanel.js - Tempvoice Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { db, getSetting } = require('../database');

// ============ BUILD: Main Tempvoice Panel ============
function buildTempvoicePanel(guildId, userId, guild) {
    const categoryId = getSetting(guildId, 'jtc_category', '');
    const enabled = getSetting(guildId, 'tv_enabled', '1');
    const defaultName = getSetting(guildId, 'tv_default_name', "{user.name}'s Channel");
    const defaultLimit = getSetting(guildId, 'tv_default_limit', '0');

    // Get active temp voices
    const activeVoices = db.prepare('SELECT * FROM temp_voices WHERE guildId = ?').all(guildId);
    const userVoice = db.prepare('SELECT * FROM temp_voices WHERE guildId = ? AND ownerId = ?').get(guildId, userId);

    const embed = new EmbedBuilder()
        .setTitle('🎙️ TEMPVOICE PANEL')
        .setColor('#00D4AA')
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Kelola temporary voice channels.\n\n` +
            `**📊 Status:**\n` +
            `> System: ${enabled === '1' ? '🟢 Aktif' : '🔴 Nonaktif'}\n` +
            `> Category: ${categoryId ? `Set ✅` : '❌ Belum setup'}\n` +
            `> Active Channels: **${activeVoices.length}**\n` +
            `> Your Channel: ${userVoice ? `<#${userVoice.channelId}> ✅` : '*Tidak ada*'}\n\n` +
            `**⚙️ Default Settings:**\n` +
            `> Name: \`${defaultName}\`\n` +
            `> Limit: ${defaultLimit === '0' ? 'Unlimited' : defaultLimit + ' users'}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `> 🎙️ **Create** — Buat channel baru\n` +
            `> 📋 **My Channel** — Kelola channel kamu\n` +
            `> 📊 **Active List** — Lihat semua channel aktif`
        )
        .setFooter({ text: `Server: ${guild.name} | Channel otomatis dihapus saat kosong` })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tvpnl_create_${userId}`).setLabel('🎙️ Create').setStyle(ButtonStyle.Success).setDisabled(enabled !== '1' || !categoryId),
        new ButtonBuilder().setCustomId(`tvpnl_mychannel_${userId}`).setLabel('📋 My Channel').setStyle(ButtonStyle.Primary).setDisabled(!userVoice),
        new ButtonBuilder().setCustomId(`tvpnl_list_${userId}`).setLabel('📊 Active List').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tvpnl_settings_${userId}`).setLabel('⚙️ Settings').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1] };
}

// ============ HANDLER: /tempvoice command ============
async function handleTempvoiceCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const panel = buildTempvoicePanel(guildId, userId, interaction.guild);
    return interaction.reply(panel);
}

// ============ HANDLER: Button clicks ============
async function handleTempvoiceButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    const action = parts[1];

    // === BACK ===
    if (action === 'back') {
        return interaction.update(buildTempvoicePanel(guildId, userId, interaction.guild));
    }

    // === CREATE CHANNEL ===
    if (action === 'create') {
        const enabled = getSetting(guildId, 'tv_enabled', '1');
        if (enabled !== '1') return interaction.reply({ content: '❌ Tempvoice belum diaktifkan!', ephemeral: true });

        const categoryId = getSetting(guildId, 'jtc_category', '');
        if (!categoryId) return interaction.reply({ content: '❌ Category belum di-setup! Admin harus setup via Dashboard atau /admin.', ephemeral: true });

        // Check if user already has a channel
        const existing = db.prepare('SELECT * FROM temp_voices WHERE guildId = ? AND ownerId = ?').get(guildId, userId);
        if (existing) return interaction.reply({ content: `❌ Kamu sudah punya channel: <#${existing.channelId}>`, ephemeral: true });

        // Check if user is in a voice channel (optional - nice to have but not required)
        const defaultName = getSetting(guildId, 'tv_default_name', "{user.name}'s Channel")
            .replace(/{user\.name}/g, interaction.user.username)
            .replace(/{user\.id}/g, userId);
        const defaultLimit = parseInt(getSetting(guildId, 'tv_default_limit', '0')) || 0;

        try {
            const channel = await interaction.guild.channels.create({
                name: defaultName,
                type: ChannelType.GuildVoice,
                parent: categoryId,
                userLimit: defaultLimit,
                permissionOverwrites: [
                    { id: userId, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.Connect] }
                ]
            });

            db.prepare('INSERT INTO temp_voices (channelId, guildId, ownerId) VALUES (?, ?, ?)').run(channel.id, guildId, userId);

            const embed = new EmbedBuilder()
                .setTitle('🎙️ Channel Created!')
                .setColor('#00D4AA')
                .setDescription(
                    `✅ Channel berhasil dibuat!\n\n` +
                    `> 📍 Channel: <#${channel.id}>\n` +
                    `> 👑 Owner: <@${userId}>\n` +
                    `> 👥 Limit: ${defaultLimit || 'Unlimited'}\n\n` +
                    `**Kontrol channel kamu:**\n` +
                    `Gunakan tombol di bawah atau klik "My Channel" dari panel.`
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`tvpnl_mychannel_${userId}`).setLabel('📋 My Channel').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`tvpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );

            return interaction.update({ embeds: [embed], components: [row] });
        } catch (e) {
            return interaction.reply({ content: '❌ Gagal membuat channel! Pastikan bot punya permission di category.', ephemeral: true });
        }
    }

    // === MY CHANNEL ===
    if (action === 'mychannel') {
        const voiceData = db.prepare('SELECT * FROM temp_voices WHERE guildId = ? AND ownerId = ?').get(guildId, userId);
        if (!voiceData) {
            return interaction.reply({ content: '❌ Kamu tidak punya channel aktif!', ephemeral: true });
        }

        const channel = interaction.guild.channels.cache.get(voiceData.channelId);
        if (!channel) {
            db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(voiceData.channelId);
            return interaction.reply({ content: '❌ Channel sudah tidak ada!', ephemeral: true });
        }

        const isLocked = channel.permissionOverwrites.cache.get(guildId)?.deny?.has(PermissionsBitField.Flags.Connect) || false;
        const isHidden = channel.permissionOverwrites.cache.get(guildId)?.deny?.has(PermissionsBitField.Flags.ViewChannel) || false;

        const embed = new EmbedBuilder()
            .setTitle(`📋 My Channel — ${channel.name}`)
            .setColor('#00D4AA')
            .setDescription(
                `> 📍 Channel: <#${channel.id}>\n` +
                `> 👑 Owner: <@${userId}>\n` +
                `> 👥 Members: **${channel.members.size}** ${channel.userLimit ? `/ ${channel.userLimit}` : ''}\n` +
                `> 🔒 Locked: ${isLocked ? '✅ Ya' : '❌ Tidak'}\n` +
                `> 👻 Hidden: ${isHidden ? '✅ Ya' : '❌ Tidak'}\n\n` +
                `Gunakan tombol di bawah untuk mengontrol channel:`
            );

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`tvpnl_lock_${userId}`).setLabel(isLocked ? '🔓 Unlock' : '🔒 Lock').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`tvpnl_hide_${userId}`).setLabel(isHidden ? '👁️ Show' : '👻 Hide').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`tvpnl_delete_${userId}`).setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`tvpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );

        return interaction.update({ embeds: [embed], components: [row1] });
    }

    // === LOCK/UNLOCK ===
    if (action === 'lock') {
        const voiceData = db.prepare('SELECT * FROM temp_voices WHERE guildId = ? AND ownerId = ?').get(guildId, userId);
        if (!voiceData) return interaction.reply({ content: '❌ Tidak punya channel!', ephemeral: true });
        const channel = interaction.guild.channels.cache.get(voiceData.channelId);
        if (!channel) return interaction.reply({ content: '❌ Channel hilang!', ephemeral: true });

        const isLocked = channel.permissionOverwrites.cache.get(guildId)?.deny?.has(PermissionsBitField.Flags.Connect) || false;
        if (isLocked) {
            await channel.permissionOverwrites.edit(guildId, { Connect: null }).catch(() => {});
            return interaction.reply({ content: '🔓 Channel di-unlock!', ephemeral: true });
        } else {
            await channel.permissionOverwrites.edit(guildId, { Connect: false }).catch(() => {});
            return interaction.reply({ content: '🔒 Channel di-lock!', ephemeral: true });
        }
    }

    // === HIDE/SHOW ===
    if (action === 'hide') {
        const voiceData = db.prepare('SELECT * FROM temp_voices WHERE guildId = ? AND ownerId = ?').get(guildId, userId);
        if (!voiceData) return interaction.reply({ content: '❌ Tidak punya channel!', ephemeral: true });
        const channel = interaction.guild.channels.cache.get(voiceData.channelId);
        if (!channel) return interaction.reply({ content: '❌ Channel hilang!', ephemeral: true });

        const isHidden = channel.permissionOverwrites.cache.get(guildId)?.deny?.has(PermissionsBitField.Flags.ViewChannel) || false;
        if (isHidden) {
            await channel.permissionOverwrites.edit(guildId, { ViewChannel: null }).catch(() => {});
            return interaction.reply({ content: '👁️ Channel terlihat!', ephemeral: true });
        } else {
            await channel.permissionOverwrites.edit(guildId, { ViewChannel: false }).catch(() => {});
            return interaction.reply({ content: '👻 Channel tersembunyi!', ephemeral: true });
        }
    }

    // === DELETE ===
    if (action === 'delete') {
        const voiceData = db.prepare('SELECT * FROM temp_voices WHERE guildId = ? AND ownerId = ?').get(guildId, userId);
        if (!voiceData) return interaction.reply({ content: '❌ Tidak punya channel!', ephemeral: true });
        const channel = interaction.guild.channels.cache.get(voiceData.channelId);
        if (channel) await channel.delete().catch(() => {});
        db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(voiceData.channelId);
        return interaction.reply({ content: '🗑️ Channel dihapus!', ephemeral: true });
    }

    // === ACTIVE LIST ===
    if (action === 'list') {
        const voices = db.prepare('SELECT * FROM temp_voices WHERE guildId = ?').all(guildId);
        let desc = '';
        if (voices.length === 0) {
            desc = '*Tidak ada temp voice channel aktif.*';
        } else {
            voices.forEach((v, i) => {
                const ch = interaction.guild.channels.cache.get(v.channelId);
                if (ch) {
                    desc += `> **${i + 1}.** <#${v.channelId}> — 👑 <@${v.ownerId}> (${ch.members.size} user)\n`;
                }
            });
            if (!desc) desc = '*Semua channel sudah dihapus.*';
        }

        const embed = new EmbedBuilder()
            .setTitle('📊 Active Temp Voices')
            .setColor('#00D4AA')
            .setDescription(desc)
            .setFooter({ text: `Total: ${voices.length} channel aktif` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`tvpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === SETTINGS ===
    if (action === 'settings') {
        const isAdmin = interaction.member.permissions.has('Administrator');
        const categoryId = getSetting(guildId, 'jtc_category', '');
        const enabled = getSetting(guildId, 'tv_enabled', '1');
        const defaultName = getSetting(guildId, 'tv_default_name', "{user.name}'s Channel");
        const allowLock = getSetting(guildId, 'tv_allow_lock', '1');
        const allowHide = getSetting(guildId, 'tv_allow_hide', '1');
        const allowKick = getSetting(guildId, 'tv_allow_kick', '1');
        const allowBlock = getSetting(guildId, 'tv_allow_block', '1');

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Tempvoice Settings')
            .setColor('#2B2D31')
            .setDescription(
                `**System:** ${enabled === '1' ? '🟢 Aktif' : '🔴 Nonaktif'}\n` +
                `**Category:** ${categoryId ? `\`${categoryId}\` ✅` : '❌ Belum setup'}\n` +
                `**Default Name:** \`${defaultName}\`\n\n` +
                `**Permissions:**\n` +
                `> 🔒 Lock/Unlock: ${allowLock === '1' ? '✅' : '❌'}\n` +
                `> 👻 Hide/Show: ${allowHide === '1' ? '✅' : '❌'}\n` +
                `> 👢 Kick: ${allowKick === '1' ? '✅' : '❌'}\n` +
                `> 🚫 Block: ${allowBlock === '1' ? '✅' : '❌'}\n\n` +
                (isAdmin
                    ? '💡 Gunakan **Dashboard** untuk mengubah pengaturan tempvoice.'
                    : '🔒 Hanya admin yang dapat mengubah pengaturan.')
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`tvpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

// ============ UTILITY: Detection helper ============
function isTempvoicePanelButton(customId) {
    return customId.startsWith('tvpnl_');
}

module.exports = {
    buildTempvoicePanel,
    handleTempvoiceCommand,
    handleTempvoiceButton,
    isTempvoicePanelButton
};
