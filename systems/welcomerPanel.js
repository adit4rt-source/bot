// systems/welcomerPanel.js - Welcomer Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('../database');
const { getAllWelcomerSettings, getWelcomerSetting } = require('./welcomer');
const ui = require('./ui');

// ============ BUILD: Main Welcomer Panel ============
function buildWelcomerPanel(guildId, userId, guild) {
    const settings = getAllWelcomerSettings(guildId);

    const welcomeStatus = settings.welcome_enabled === '1' ? '🟢 Aktif' : '🔴 Nonaktif';
    const goodbyeStatus = settings.goodbye_enabled === '1' ? '🟢 Aktif' : '🔴 Nonaktif';
    const dmStatus = settings.welcome_dm_enabled === '1' ? '🟢 Aktif' : '🔴 Nonaktif';
    const autoroles = settings.welcome_autorole ? settings.welcome_autorole.split(',').filter(Boolean) : [];

    const embed = new EmbedBuilder()
        .setTitle(ui.title('👋', 'WELCOMER'))
        .setColor(settings.welcome_embed_color || ui.COLORS.info)
        .setDescription(
            ui.statBlock([
                `👋 Welcome: ${welcomeStatus}  •  📩 DM: ${dmStatus}`,
                `👋 Goodbye: ${goodbyeStatus}`,
                `🎭 Auto-Roles: ${autoroles.length > 0 ? autoroles.map(r => `<@&${r}>`).join(', ') : '*Tidak ada*'}`,
                `📍 Welcome ch: ${settings.welcome_channel ? `<#${settings.welcome_channel}>` : '*Belum diset*'}`,
                `📍 Goodbye ch: ${settings.goodbye_channel ? `<#${settings.goodbye_channel}>` : '*Belum diset*'}`,
            ]) +
            `\n` +
            ui.menuList([
                { emoji: '👁️', label: 'Preview', desc: 'Lihat contoh welcome' },
                { emoji: '👋', label: 'Goodbye Preview', desc: 'Lihat contoh goodbye' },
                { emoji: '⚙️', label: 'Settings', desc: 'Detail konfigurasi' },
                { emoji: '📩', label: 'Test', desc: 'Kirim test message' },
            ])
        )
        .setFooter({ text: ui.footer(`${guild.name} • Ubah settings via Dashboard`) })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`welpnl_preview_${userId}`).setLabel('👁️ Preview').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`welpnl_goodbye_${userId}`).setLabel('👋 Goodbye Preview').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`welpnl_settings_${userId}`).setLabel('⚙️ Settings').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`welpnl_test_${userId}`).setLabel('📩 Test').setStyle(ButtonStyle.Success)
    );

    return { embeds: [embed], components: [row] };
}

// ============ HANDLER: /welcomer command ============
async function handleWelcomerCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ Hanya admin yang bisa menggunakan panel ini!', ephemeral: true });
    }

    const panel = buildWelcomerPanel(guildId, userId, interaction.guild);
    return interaction.reply(panel);
}

// ============ HANDLER: Button clicks ============
async function handleWelcomerButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ Admin only!', ephemeral: true });
    }

    const action = parts[1];

    // === BACK ===
    if (action === 'back') {
        return interaction.update(buildWelcomerPanel(guildId, userId, interaction.guild));
    }

    // === PREVIEW WELCOME ===
    if (action === 'preview') {
        const settings = getAllWelcomerSettings(guildId);
        const message = settings.welcome_message
            .replace(/{user\.mention}/g, `<@${userId}>`)
            .replace(/{user\.name}/g, interaction.user.username)
            .replace(/{user\.tag}/g, interaction.user.username)
            .replace(/{user\.avatar}/g, interaction.user.displayAvatarURL({ size: 256 }))
            .replace(/{user\.createdAt}/g, `<t:${Math.floor(interaction.user.createdTimestamp / 1000)}:R>`)
            .replace(/{server\.name}/g, interaction.guild.name)
            .replace(/{server\.memberCount}/g, String(interaction.guild.memberCount));

        const title = (settings.welcome_embed_title || '👋 Welcome!')
            .replace(/{user\.name}/g, interaction.user.username)
            .replace(/{server\.name}/g, interaction.guild.name);

        const embed = new EmbedBuilder()
            .setTitle(`[PREVIEW] ${title}`)
            .setColor(settings.welcome_embed_color || '#5865F2')
            .setDescription(message)
            .setFooter({ text: '⚠️ Ini preview — pesan asli dikirim saat member join' })
            .setTimestamp();

        const thumbnail = (settings.welcome_embed_thumbnail || '').replace(/{user\.avatar}/g, interaction.user.displayAvatarURL({ size: 256 }));
        if (thumbnail && thumbnail.startsWith('http')) embed.setThumbnail(thumbnail);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`welpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === PREVIEW GOODBYE ===
    if (action === 'goodbye') {
        const settings = getAllWelcomerSettings(guildId);
        if (settings.goodbye_enabled !== '1') {
            const embed = new EmbedBuilder()
                .setTitle('👋 Goodbye Message')
                .setColor('#FF6B6B')
                .setDescription('❌ Goodbye message belum diaktifkan.\n\nAktifkan melalui **Dashboard** → Welcomer → Enable Goodbye Message.');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`welpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }

        const message = settings.goodbye_message
            .replace(/{user\.mention}/g, `<@${userId}>`)
            .replace(/{user\.name}/g, interaction.user.username)
            .replace(/{server\.name}/g, interaction.guild.name)
            .replace(/{server\.memberCount}/g, String(interaction.guild.memberCount));

        const embed = new EmbedBuilder()
            .setTitle('[PREVIEW] 👋 Goodbye')
            .setColor(settings.goodbye_embed_color || '#FF6B6B')
            .setDescription(message)
            .setFooter({ text: '⚠️ Ini preview — pesan asli dikirim saat member leave' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`welpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === SETTINGS ===
    if (action === 'settings') {
        const settings = getAllWelcomerSettings(guildId);
        const autoroles = settings.welcome_autorole ? settings.welcome_autorole.split(',').filter(Boolean) : [];

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Welcomer Configuration')
            .setColor('#2B2D31')
            .setDescription(
                `**👋 Welcome Message:**\n` +
                `> Enabled: ${settings.welcome_enabled === '1' ? '✅' : '❌'}\n` +
                `> Channel: ${settings.welcome_channel ? `<#${settings.welcome_channel}>` : '❌ Belum diset'}\n` +
                `> Color: \`${settings.welcome_embed_color}\`\n` +
                `> Title: ${settings.welcome_embed_title || '*Default*'}\n\n` +
                `**📩 DM Welcome:**\n` +
                `> Enabled: ${settings.welcome_dm_enabled === '1' ? '✅' : '❌'}\n\n` +
                `**🎭 Auto-Role:**\n` +
                `> Roles: ${autoroles.length > 0 ? autoroles.map(r => `<@&${r}>`).join(', ') : '*Tidak ada*'}\n` +
                `> Delay: ${settings.welcome_autorole_delay || '0'}s\n\n` +
                `**👋 Goodbye:**\n` +
                `> Enabled: ${settings.goodbye_enabled === '1' ? '✅' : '❌'}\n` +
                `> Channel: ${settings.goodbye_channel ? `<#${settings.goodbye_channel}>` : '❌ Belum diset'}\n\n` +
                `💡 *Gunakan Dashboard untuk mengubah semua pengaturan.*`
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`welpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === TEST ===
    if (action === 'test') {
        const settings = getAllWelcomerSettings(guildId);
        if (!settings.welcome_channel) {
            return interaction.reply({ content: '❌ Welcome channel belum diset! Atur di Dashboard.', ephemeral: true });
        }

        const channel = interaction.guild.channels.cache.get(settings.welcome_channel);
        if (!channel) {
            return interaction.reply({ content: '❌ Channel tidak ditemukan!', ephemeral: true });
        }

        const member = interaction.member;
        const message = settings.welcome_message
            .replace(/{user\.mention}/g, `<@${member.id}>`)
            .replace(/{user\.name}/g, member.user.username)
            .replace(/{user\.tag}/g, member.user.username)
            .replace(/{user\.avatar}/g, member.user.displayAvatarURL({ size: 256 }))
            .replace(/{user\.createdAt}/g, `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`)
            .replace(/{server\.name}/g, interaction.guild.name)
            .replace(/{server\.memberCount}/g, String(interaction.guild.memberCount));

        const title = (settings.welcome_embed_title || '👋 Welcome!')
            .replace(/{user\.name}/g, member.user.username)
            .replace(/{server\.name}/g, interaction.guild.name);

        const embed = new EmbedBuilder()
            .setTitle(`[TEST] ${title}`)
            .setColor(settings.welcome_embed_color || '#5865F2')
            .setDescription(message)
            .setFooter({ text: '⚠️ Test message from /welcomer panel' })
            .setTimestamp();

        const thumbnail = (settings.welcome_embed_thumbnail || '').replace(/{user\.avatar}/g, member.user.displayAvatarURL({ size: 256 }));
        if (thumbnail && thumbnail.startsWith('http')) embed.setThumbnail(thumbnail);

        await channel.send({ embeds: [embed] }).catch(() => {});
        return interaction.reply({ content: `✅ Test message sent to <#${settings.welcome_channel}>!`, ephemeral: true });
    }
}

// ============ UTILITY: Detection helper ============
function isWelcomerPanelButton(customId) {
    return customId.startsWith('welpnl_');
}

module.exports = {
    buildWelcomerPanel,
    handleWelcomerCommand,
    handleWelcomerButton,
    isWelcomerPanelButton
};
