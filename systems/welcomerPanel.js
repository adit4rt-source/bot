// systems/welcomerPanel.js - Welcomer Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } = require('discord.js');
const { db } = require('../database');
const { getAllWelcomerSettings, getWelcomerSetting, setWelcomerSetting, buildBannerAttachment } = require('./welcomer');
const ui = require('./ui');

// ============ BUILD: Main Welcomer Panel ============
function buildWelcomerPanel(guildId, userId, guild) {
    const settings = getAllWelcomerSettings(guildId);

    const welcomeStatus = settings.welcome_enabled === '1' ? '🟢 Aktif' : '🔴 Nonaktif';
    const goodbyeStatus = settings.goodbye_enabled === '1' ? '🟢 Aktif' : '🔴 Nonaktif';
    const dmStatus = settings.welcome_dm_enabled === '1' ? '🟢 Aktif' : '🔴 Nonaktif';
    const bannerW = settings.welcome_banner_enabled === '1' ? '🟢' : '🔴';
    const bannerG = settings.goodbye_banner_enabled === '1' ? '🟢' : '🔴';
    const autoroles = settings.welcome_autorole ? settings.welcome_autorole.split(',').filter(Boolean) : [];

    const embed = new EmbedBuilder()
        .setTitle(ui.title('👋', 'WELCOMER'))
        .setColor(settings.welcome_embed_color || ui.COLORS.info)
        .setDescription(
            ui.statBlock([
                `👋 Welcome: ${welcomeStatus}  •  📩 DM: ${dmStatus}`,
                `👋 Goodbye: ${goodbyeStatus}`,
                `🖼️ Banner: Welcome ${bannerW}  •  Goodbye ${bannerG}`,
                `🎭 Auto-Roles: ${autoroles.length > 0 ? autoroles.map(r => `<@&${r}>`).join(', ') : '*Tidak ada*'}`,
                `📍 Welcome ch: ${settings.welcome_channel ? `<#${settings.welcome_channel}>` : '*Belum diset*'}`,
                `📍 Goodbye ch: ${settings.goodbye_channel ? `<#${settings.goodbye_channel}>` : '*Belum diset*'}`,
            ]) +
            `\n` +
            ui.menuList([
                { emoji: '👁️', label: 'Preview', desc: 'Intip tampilan pesan sambutan' },
                { emoji: '👋', label: 'Goodbye Preview', desc: 'Intip tampilan pesan perpisahan' },
                { emoji: '⚙️', label: 'Settings', desc: 'Edit semua konfigurasi di sini' },
                { emoji: '📩', label: 'Test', desc: 'Kirim pesan uji coba ke channel' },
            ])
        )
        .setFooter({ text: ui.footer(`${guild.name} • Edit di Discord atau Dashboard`) })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`welpnl_preview_${userId}`).setLabel('👁️ Preview').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`welpnl_goodbye_${userId}`).setLabel('👋 Goodbye Preview').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`welpnl_settings_${userId}`).setLabel('⚙️ Edit Settings').setStyle(ButtonStyle.Secondary),
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

    // === SETTINGS (interactive edit view) ===
    if (action === 'settings') {
        return interaction.update(buildEditView(guildId, userId, interaction.guild));
    }

    // === TOGGLES ===
    const toggleMap = {
        togwelcome: 'welcome_enabled',
        togdm: 'welcome_dm_enabled',
        toggoodbye: 'goodbye_enabled',
        togbannerw: 'welcome_banner_enabled',
        togbannerg: 'goodbye_banner_enabled',
    };
    if (toggleMap[action]) {
        const key = toggleMap[action];
        const cur = getWelcomerSetting(guildId, key, '0');
        setWelcomerSetting(guildId, key, cur === '1' ? '0' : '1');
        return interaction.update(buildEditView(guildId, userId, interaction.guild));
    }

    // === EDIT TEXT (modal) ===
    if (action === 'edittext') {
        const s = getAllWelcomerSettings(guildId);
        const modal = new ModalBuilder().setCustomId(`welpnl_textmodal_${userId}`).setTitle('✏️ Edit Welcomer Text');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Welcome Message').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue((s.welcome_message || '').slice(0, 1000))),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Embed Title').setStyle(TextInputStyle.Short).setRequired(false).setValue((s.welcome_embed_title || '').slice(0, 100))),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('Embed Color (hex, mis. #5865F2)').setStyle(TextInputStyle.Short).setRequired(false).setValue((s.welcome_embed_color || '').slice(0, 7))),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('image').setLabel('Image/GIF URL (embed gambar, kosong = tanpa)').setStyle(TextInputStyle.Short).setRequired(false).setValue((s.welcome_embed_image || '').slice(0, 200))),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('delay').setLabel('Auto-Role Delay (detik)').setStyle(TextInputStyle.Short).setRequired(false).setValue(String(s.welcome_autorole_delay || '0')))
        );
        return interaction.showModal(modal);
    }

    // === EDIT GOODBYE TEXT (modal) ===
    if (action === 'editgoodbye') {
        const s = getAllWelcomerSettings(guildId);
        const modal = new ModalBuilder().setCustomId(`welpnl_goodbyemodal_${userId}`).setTitle('✏️ Edit Goodbye Text');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Goodbye Message').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue((s.goodbye_message || '').slice(0, 1000))),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('Embed Color (hex, mis. #FF6B6B)').setStyle(TextInputStyle.Short).setRequired(false).setValue((s.goodbye_embed_color || '').slice(0, 7))),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('image').setLabel('Image/GIF URL (kosong = tanpa gambar)').setStyle(TextInputStyle.Short).setRequired(false).setValue((s.goodbye_embed_image || '').slice(0, 200)))
        );
        return interaction.showModal(modal);
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

        const banner = await buildBannerAttachment(member, 'welcome');
        if (banner) {
            // Single block (matches real welcome): greeting text + large card.
            await channel.send({ content: `🧪 [TEST] ${message}`, files: [banner], allowedMentions: { parse: [] } }).catch(() => {});
        } else {
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
        }
        return interaction.reply({ content: `✅ Test message sent to <#${settings.welcome_channel}>!`, ephemeral: true });
    }
}

// ============ BUILD: Interactive Edit View ============
function buildEditView(guildId, userId, guild) {
    const s = getAllWelcomerSettings(guildId);
    const on = (v) => v === '1';
    const autoroles = s.welcome_autorole ? s.welcome_autorole.split(',').filter(Boolean) : [];

    const embed = new EmbedBuilder()
        .setTitle('⚙️ Edit Welcomer')
        .setColor(s.welcome_embed_color || '#5865F2')
        .setDescription(
            `**👋 Welcome:** ${on(s.welcome_enabled) ? '✅' : '❌'}  •  Channel: ${s.welcome_channel ? `<#${s.welcome_channel}>` : '*belum diset*'}\n` +
            `**📩 DM Welcome:** ${on(s.welcome_dm_enabled) ? '✅' : '❌'}\n` +
            `**🎭 Auto-Role:** ${autoroles.length ? autoroles.map(r => `<@&${r}>`).join(', ') : '*tidak ada*'}  •  Delay: ${s.welcome_autorole_delay || '0'}s\n` +
            `**👋 Goodbye:** ${on(s.goodbye_enabled) ? '✅' : '❌'}  •  Channel: ${s.goodbye_channel ? `<#${s.goodbye_channel}>` : '*belum diset*'}\n` +
            `**🖼️ Banner:** Welcome ${on(s.welcome_banner_enabled) ? '✅' : '❌'}  •  Goodbye ${on(s.goodbye_banner_enabled) ? '✅' : '❌'}\n` +
            `**🎨 Color:** \`${s.welcome_embed_color}\`  •  **Title:** ${s.welcome_embed_title || '*default*'}\n` +
            `**🖼️ Image/GIF:** Welcome ${s.welcome_embed_image ? '✅ terpasang' : '*tidak ada*'}  •  Goodbye ${s.goodbye_embed_image ? '✅ terpasang' : '*tidak ada*'}\n\n` +
            `Atur langsung pakai komponen di bawah 👇`
        )
        .setFooter({ text: ui.footer(guild?.name || 'Welcomer') });

    const chWelcome = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId(`welpnl_chwelcome_${userId}`).setPlaceholder('📍 Set Welcome Channel...').setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)
    );
    const chGoodbye = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder().setCustomId(`welpnl_chgoodbye_${userId}`).setPlaceholder('📍 Set Goodbye Channel...').setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)
    );
    const roleRow = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId(`welpnl_autorole_${userId}`).setPlaceholder('🎭 Set Auto-Roles (pilih kosong = hapus)...').setMinValues(0).setMaxValues(5)
    );
    const togRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`welpnl_togwelcome_${userId}`).setLabel(`👋 Welcome: ${on(s.welcome_enabled) ? 'ON' : 'OFF'}`).setStyle(on(s.welcome_enabled) ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`welpnl_togdm_${userId}`).setLabel(`📩 DM: ${on(s.welcome_dm_enabled) ? 'ON' : 'OFF'}`).setStyle(on(s.welcome_dm_enabled) ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`welpnl_toggoodbye_${userId}`).setLabel(`👋 Goodbye: ${on(s.goodbye_enabled) ? 'ON' : 'OFF'}`).setStyle(on(s.goodbye_enabled) ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`welpnl_edittext_${userId}`).setLabel('✏️ Text/Color').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`welpnl_back_${userId}`).setLabel('🔙').setStyle(ButtonStyle.Secondary)
    );
    const togRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`welpnl_togbannerw_${userId}`).setLabel(`🖼️ Banner Welcome: ${on(s.welcome_banner_enabled) ? 'ON' : 'OFF'}`).setStyle(on(s.welcome_banner_enabled) ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`welpnl_togbannerg_${userId}`).setLabel(`🖼️ Banner Goodbye: ${on(s.goodbye_banner_enabled) ? 'ON' : 'OFF'}`).setStyle(on(s.goodbye_banner_enabled) ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`welpnl_editgoodbye_${userId}`).setLabel('✏️ Goodbye Text').setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [chWelcome, chGoodbye, roleRow, togRow1, togRow2] };
}

// ============ HANDLERS: Channel / Role select & modal (edit view) ============
async function handleWelcomerChannelSelect(interaction) {
    const guildId = interaction.guild.id;
    const parts = interaction.customId.split('_'); // welpnl_chwelcome_<userId> | welpnl_chgoodbye_<userId>
    const which = parts[1];
    const userId = parts[parts.length - 1];
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });
    const key = which === 'chgoodbye' ? 'goodbye_channel' : 'welcome_channel';
    setWelcomerSetting(guildId, key, interaction.values[0]);
    return interaction.update(buildEditView(guildId, userId, interaction.guild));
}

async function handleWelcomerRoleSelect(interaction) {
    const guildId = interaction.guild.id;
    const parts = interaction.customId.split('_');
    const userId = parts[parts.length - 1];
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });
    setWelcomerSetting(guildId, 'welcome_autorole', (interaction.values || []).join(','));
    return interaction.update(buildEditView(guildId, userId, interaction.guild));
}

async function handleWelcomerModal(interaction) {
    const guildId = interaction.guild.id;
    const parts = interaction.customId.split('_');
    const modalType = parts[1]; // 'textmodal' or 'goodbyemodal'
    const userId = parts[parts.length - 1];
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });
    const f = interaction.fields;

    if (modalType === 'goodbyemodal') {
        // Goodbye text/color/image modal
        const message = (f.getTextInputValue('message') || '').trim();
        const colorRaw = (f.getTextInputValue('color') || '').trim();
        const imageRaw = (f.getTextInputValue('image') || '').trim();
        if (message) setWelcomerSetting(guildId, 'goodbye_message', message);
        if (colorRaw) {
            const c = colorRaw.startsWith('#') ? colorRaw : `#${colorRaw}`;
            if (/^#[0-9a-fA-F]{6}$/.test(c)) setWelcomerSetting(guildId, 'goodbye_embed_color', c);
        }
        if (imageRaw && /^https?:\/\/.+/i.test(imageRaw)) {
            setWelcomerSetting(guildId, 'goodbye_embed_image', imageRaw);
        } else if (imageRaw === '') {
            setWelcomerSetting(guildId, 'goodbye_embed_image', '');
        }
        return interaction.update(buildEditView(guildId, userId, interaction.guild));
    }

    // Welcome text/color/image/delay modal (default)
    const message = (f.getTextInputValue('message') || '').trim();
    const title = (f.getTextInputValue('title') || '').trim();
    const colorRaw = (f.getTextInputValue('color') || '').trim();
    const imageRaw = (f.getTextInputValue('image') || '').trim();
    const delayRaw = (f.getTextInputValue('delay') || '').trim();
    if (message) setWelcomerSetting(guildId, 'welcome_message', message);
    if (title) setWelcomerSetting(guildId, 'welcome_embed_title', title);
    if (colorRaw) {
        const c = colorRaw.startsWith('#') ? colorRaw : `#${colorRaw}`;
        if (/^#[0-9a-fA-F]{6}$/.test(c)) setWelcomerSetting(guildId, 'welcome_embed_color', c);
    }
    // Image/GIF URL (empty = remove)
    if (imageRaw && /^https?:\/\/.+/i.test(imageRaw)) {
        setWelcomerSetting(guildId, 'welcome_embed_image', imageRaw);
    } else if (imageRaw === '') {
        setWelcomerSetting(guildId, 'welcome_embed_image', '');
    }
    const delay = parseInt(delayRaw, 10);
    if (!isNaN(delay) && delay >= 0) setWelcomerSetting(guildId, 'welcome_autorole_delay', String(delay));
    return interaction.update(buildEditView(guildId, userId, interaction.guild));
}

// ============ UTILITY: Detection helper ============
function isWelcomerPanelButton(customId) {
    return customId.startsWith('welpnl_');
}
function isWelcomerChannelSelect(customId) {
    return typeof customId === 'string' && customId.startsWith('welpnl_ch');
}
function isWelcomerRoleSelect(customId) {
    return typeof customId === 'string' && customId.startsWith('welpnl_autorole_');
}
function isWelcomerPanelModal(customId) {
    return typeof customId === 'string' && (customId.startsWith('welpnl_textmodal_') || customId.startsWith('welpnl_goodbyemodal_'));
}

module.exports = {
    buildWelcomerPanel,
    handleWelcomerCommand,
    handleWelcomerButton,
    isWelcomerPanelButton,
    handleWelcomerChannelSelect,
    handleWelcomerRoleSelect,
    handleWelcomerModal,
    isWelcomerChannelSelect,
    isWelcomerRoleSelect,
    isWelcomerPanelModal
};
