// systems/invitePanel.js - Invite Tracker Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getSetting } = require('../database');
const { getInviterStats, getInviteLeaderboard, getInvitedBy, getInvitedList, getAllInviteSettings } = require('./inviteTracker');
const ui = require('./ui');

// ============ BUILD: Main Invite Panel ============
function buildInvitePanel(guildId, userId, username, guild) {
    const stats = getInviterStats(guildId, userId);
    const invitedByData = getInvitedBy(guildId, userId);
    const settings = getAllInviteSettings(guildId);

    const invitedByLine = invitedByData ? `📨 Diundang oleh: <@${invitedByData.inviterId}>` : '📨 Diundang oleh: *Tidak diketahui*';

    const embed = new EmbedBuilder()
        .setTitle(ui.title('📨', 'INVITE', username))
        .setColor(ui.COLORS.farming)
        .setDescription(
            `Ajak teman gabung, pantau kontribusimu di sini! 🎉\n` +
            ui.statBlock([
                `${invitedByLine}`,
                `✅ Undangan Sukses: **${stats.total}**  •  👻 Palsu: **${stats.fake}**`,
                `👋 Sudah Keluar: **${stats.left}**  •  📋 Total: **${stats.totalAll}**`,
            ]) +
            `\n**Menu:**\n` +
            ui.menuList([
                { emoji: '🏆', label: 'Leaderboard', desc: 'Siapa pengundang terbanyak di server' },
                { emoji: '📋', label: 'My Invites', desc: 'Daftar orang yang kamu undang' },
                { emoji: '📊', label: 'Detail Stats', desc: 'Rincian lengkap & peringkatmu' },
                { emoji: '⚙️', label: 'Settings', desc: 'Atur sistem invite (khusus Admin)' },
            ])
        )
        .setFooter({ text: ui.footer(`Status: ${settings.invite_enabled === '1' ? '🟢 Aktif' : '🔴 Nonaktif'} • ${guild.name}`) })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`invpnl_leaderboard_${userId}`).setLabel('🏆 Leaderboard').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`invpnl_myinvites_${userId}`).setLabel('📋 My Invites').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`invpnl_stats_${userId}`).setLabel('📊 Detail Stats').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`invpnl_settings_${userId}`).setLabel('⚙️ Settings').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

// ============ HANDLER: /invite command ============
async function handleInviteCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const panel = buildInvitePanel(guildId, userId, interaction.user.username, interaction.guild);
    return interaction.reply(panel);
}

// ============ HANDLER: Button clicks ============
async function handleInviteButton(interaction) {
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
        return interaction.update(buildInvitePanel(guildId, userId, interaction.user.username, interaction.guild));
    }

    // === LEADERBOARD ===
    if (action === 'leaderboard') {
        const rows = getInviteLeaderboard(guildId, 10);
        let desc = '';
        if (rows.length === 0) {
            desc = '*Belum ada data invite.*';
        } else {
            rows.forEach((r, i) => {
                desc += `${ui.medal(i)} <@${r.userId}> — ✅ **${r.total}** invites`;
                if (r.fake > 0) desc += ` | 👻 ${r.fake}`;
                if (r.left > 0) desc += ` | 👋 ${r.left}`;
                desc += '\n';
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(ui.title('🏆', 'Invite Leaderboard'))
            .setColor(ui.COLORS.leaderboard)
            .setDescription(desc)
            .setFooter({ text: ui.footer('Top 10 Inviters • ✅ Valid | 👻 Fake | 👋 Left') });

        const row = ui.backRow(`invpnl_back_${userId}`);
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === MY INVITES ===
    if (action === 'myinvites') {
        const invited = getInvitedList(guildId, userId, 15);
        let desc = '';
        if (invited.length === 0) {
            desc = '*Kamu belum mengundang siapapun.*\n\n💡 Share invite link server untuk mulai tracking!';
        } else {
            invited.forEach(inv => {
                const status = inv.leftAt ? '👋 Left' : inv.fake ? '👻 Fake' : '✅ Active';
                const date = new Date(inv.joinedAt).toLocaleDateString('id-ID');
                desc += `> <@${inv.invitedId}> — ${status} (${date})\n`;
            });
            desc += `\n📊 Total ditampilkan: ${invited.length} member`;
        }

        const embed = new EmbedBuilder()
            .setTitle(`📋 Daftar Undangan — ${interaction.user.username}`)
            .setColor('#43B581')
            .setDescription(desc)
            .setFooter({ text: '✅ Active | 👻 Fake (akun baru) | 👋 Sudah keluar' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`invpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === DETAIL STATS ===
    if (action === 'stats') {
        const stats = getInviterStats(guildId, userId);
        const invitedByData = getInvitedBy(guildId, userId);

        // Rank calculation
        const lb = getInviteLeaderboard(guildId, 100);
        const rank = lb.findIndex(r => r.userId === userId) + 1;

        const embed = new EmbedBuilder()
            .setTitle(`📊 Detail Invite Stats — ${interaction.user.username}`)
            .setColor('#3498DB')
            .setDescription(
                `**📈 Ranking:**\n` +
                `> 🏆 Rank: #${rank || 'N/A'}\n\n` +
                `**📊 Statistik:**\n` +
                `> ✅ Valid Invites: **${stats.total}**\n` +
                `> 👻 Fake Invites: **${stats.fake}**\n` +
                `> 👋 Left Server: **${stats.left}**\n` +
                `> 📋 All-time Total: **${stats.totalAll}**\n\n` +
                `**📨 Siapa yang mengundangmu:**\n` +
                `> ${invitedByData ? `<@${invitedByData.inviterId}> (code: \`${invitedByData.code}\`)` : '*Tidak diketahui*'}`
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`invpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === SETTINGS (Admin only info) ===
    if (action === 'settings') {
        const settings = getAllInviteSettings(guildId);
        const isAdmin = interaction.member.permissions.has('Administrator');

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Invite Tracker Settings')
            .setColor('#2B2D31')
            .setDescription(
                `**Status:** ${settings.invite_enabled === '1' ? '🟢 Aktif' : '🔴 Nonaktif'}\n` +
                `**Log Channel:** ${settings.invite_channel ? `<#${settings.invite_channel}>` : '*Belum diset*'}\n` +
                `**Fake Threshold:** ${settings.invite_fake_threshold} hari\n` +
                `**Deduct on Leave:** ${settings.invite_leave_deduct === '1' ? '✅ Ya' : '❌ Tidak'}\n\n` +
                (isAdmin
                    ? '💡 Gunakan **Dashboard** untuk mengubah pengaturan invite tracker.'
                    : '🔒 Hanya admin yang dapat mengubah pengaturan.')
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`invpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

// ============ UTILITY: Detection helper ============
function isInvitePanelButton(customId) {
    return customId.startsWith('invpnl_');
}

module.exports = {
    buildInvitePanel,
    handleInviteCommand,
    handleInviteButton,
    isInvitePanelButton
};
