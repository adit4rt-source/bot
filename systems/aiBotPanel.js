// systems/aiBotPanel.js — Slash command (/tanya) + admin panel (/aibot) for the AI assistant.

const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ChannelSelectMenuBuilder, ChannelType, PermissionsBitField,
} = require('discord.js');
const ai = require('./aiAssistant');
const ui = require('./ui');

function lastSeg(customId) { const p = customId.split('_'); return p[p.length - 1]; }
function isAdmin(interaction) { return interaction.member?.permissions?.has?.(PermissionsBitField.Flags.Administrator); }
function ownerOk(interaction) { return interaction.user.id === lastSeg(interaction.customId); }

// ==================== /tanya (public) ====================
async function handleTanyaCommand(interaction) {
    const question = interaction.options.getString('pertanyaan', true);
    if (!ai.isConfigured()) {
        return interaction.reply({ content: '⚠️ AI belum dikonfigurasi (admin perlu set `AI_API_KEY` di .env).', ephemeral: true });
    }
    await interaction.deferReply();
    const result = await ai.askAI(question);
    if (result.error) return interaction.editReply({ content: `⚠️ ${result.error}` });

    const chunks = ai.chunkText(result.answer, 1900);
    const embed = new EmbedBuilder()
        .setColor(ui.COLORS.info)
        .setAuthor({ name: '🤖 ID Bot Assistant' })
        .setDescription(chunks[0])
        .setFooter({ text: ui.footer(`Ditanya oleh ${interaction.user.username} • cuma jawab soal fitur bot`) });
    await interaction.editReply({ content: `❓ **${question.slice(0, 200)}**`, embeds: [embed] });
    for (let i = 1; i < chunks.length; i++) await interaction.followUp({ content: chunks[i], ephemeral: false });
}

// ==================== /aibot (admin panel) ====================
function buildPanel(guildId, userId) {
    const cfg = ai.getConfig();
    const enabled = ai.getAiSetting(guildId, 'ai_enabled', '0') === '1';
    const channel = ai.getAiSetting(guildId, 'ai_channel', '');

    const embed = new EmbedBuilder()
        .setColor(ui.COLORS.info)
        .setTitle('🤖 AI Assistant')
        .setDescription(
            'Asisten AI yang **hanya menjawab seputar fitur bot ini** (belajar dari dokumentasi repo).\n\n' +
            ui.statBlock([
                `🔌 API: ${cfg.apiKey ? '✅ terhubung' : '❌ belum diset (`AI_API_KEY`)'}`,
                `🧠 Model: \`${cfg.model}\``,
                `🔘 Status: ${enabled ? '✅ Aktif' : '⛔ Nonaktif'}`,
                `📺 Channel AI: ${channel ? `<#${channel}>` : '_belum diset_'}`,
            ]) +
            '\n**Cara kerja:**\n' +
            '• `/tanya` bisa dipakai siapa saja, di mana saja\n' +
            '• Mention bot + pertanyaan → dibalas otomatis (jika Aktif)\n' +
            '• Semua pesan di **Channel AI** dibalas otomatis (jika diset)'
        )
        .setFooter({ text: ui.footer('Knowledge diambil dari GUIDE.md, GUIDE-PET.md & daftar command') });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aibot_toggle_${userId}`).setLabel(enabled ? 'Nonaktifkan' : 'Aktifkan').setEmoji(enabled ? '⛔' : '✅').setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`aibot_setchan_${userId}`).setLabel('Set Channel AI').setEmoji('📺').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`aibot_clearchan_${userId}`).setLabel('Hapus Channel').setEmoji('🧹').setStyle(ButtonStyle.Secondary).setDisabled(!channel)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aibot_test_${userId}`).setLabel('Tes AI').setEmoji('🧪').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`aibot_refresh_${userId}`).setLabel('Refresh Pengetahuan').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row1, row2] };
}

async function handleAiBotCommand(interaction) {
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Hanya admin yang bisa membuka panel ini!', ephemeral: true });
    return interaction.reply({ ...buildPanel(interaction.guild.id, interaction.user.id), ephemeral: true });
}

async function handleAiBotButton(interaction) {
    if (!ownerOk(interaction)) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const action = interaction.customId.split('_')[1];

    if (action === 'toggle') {
        const enabled = ai.getAiSetting(guildId, 'ai_enabled', '0') === '1';
        ai.setAiSetting(guildId, 'ai_enabled', enabled ? '0' : '1');
        return interaction.update(buildPanel(guildId, userId));
    }

    if (action === 'setchan') {
        const sel = new ChannelSelectMenuBuilder().setCustomId(`aichan_set_${userId}`).setPlaceholder('Pilih channel khusus AI...').setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1);
        return interaction.reply({ content: '📺 Pilih channel di mana semua pesan akan dibalas AI:', components: [new ActionRowBuilder().addComponents(sel)], ephemeral: true });
    }

    if (action === 'clearchan') {
        ai.setAiSetting(guildId, 'ai_channel', '');
        return interaction.update(buildPanel(guildId, userId));
    }

    if (action === 'refresh') {
        ai.refreshKnowledge();
        return interaction.reply({ content: '🔄 Pengetahuan AI dimuat ulang dari dokumentasi terbaru.', ephemeral: true });
    }

    if (action === 'test') {
        if (!ai.isConfigured()) return interaction.reply({ content: '⚠️ `AI_API_KEY` belum diset di .env.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const result = await ai.askAI('Sebutkan 3 fitur utama bot ini secara singkat.');
        return interaction.editReply({ content: result.error ? `⚠️ ${result.error}` : `🧪 **Tes berhasil:**\n${result.answer}` });
    }
}

async function handleAiBotChannelSelect(interaction) {
    if (!ownerOk(interaction)) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    if (!isAdmin(interaction)) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });
    const channelId = interaction.values[0];
    ai.setAiSetting(interaction.guild.id, 'ai_channel', channelId);
    // Enabling makes the channel useful immediately.
    if (ai.getAiSetting(interaction.guild.id, 'ai_enabled', '0') !== '1') ai.setAiSetting(interaction.guild.id, 'ai_enabled', '1');
    return interaction.update({ content: `✅ Channel AI diset ke <#${channelId}> dan AI diaktifkan.`, components: [] });
}

function isAiBotButton(customId) { return typeof customId === 'string' && customId.startsWith('aibot_'); }
function isAiBotChannelSelect(customId) { return typeof customId === 'string' && customId.startsWith('aichan_'); }

module.exports = {
    handleTanyaCommand, handleAiBotCommand, handleAiBotButton, handleAiBotChannelSelect,
    buildPanel, isAiBotButton, isAiBotChannelSelect,
};
