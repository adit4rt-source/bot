// systems/invitePanel.js - Invite Tracker Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getSetting } = require('../database');
const { getInviterStats, getInviteLeaderboard, getInvitedBy, getInvitedList, getAllInviteSettings } = require('./inviteTracker');
const { getTiers, getClaimedTiers } = require('./inviteRewards');
const ui = require('./ui');

let ITEM_DEFS = [];
try { ITEM_DEFS = require('../data/items'); } catch (_) { ITEM_DEFS = []; }
function itemLabel(it) {
    const def = Array.isArray(ITEM_DEFS) ? ITEM_DEFS.find(d => d.id === it.id) : null;
    const name = def ? def.name : it.id;
    const emoji = def ? (def.menuEmoji || '') : '';
    return `${emoji} ${name} ×${it.qty}`.trim();
}

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
                { emoji: '🎁', label: 'Rewards', desc: 'Hadiah berjenjang dari mengundang teman' },
                { emoji: '🏆', label: 'Leaderboard', desc: 'Siapa pengundang terbanyak di server' },
                { emoji: '📋', label: 'My Invites', desc: 'Daftar orang yang kamu undang' },
                { emoji: '📊', label: 'Detail Stats', desc: 'Rincian lengkap & peringkatmu' },
                { emoji: '⚙️', label: 'Settings', desc: 'Atur sistem invite (khusus Admin)' },
            ])
        )
        .setFooter({ text: ui.footer(`Status: ${settings.invite_enabled === '1' ? '🟢 Aktif' : '🔴 Nonaktif'} • ${guild.name}`) })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`invpnl_rewards_${userId}`).setLabel('🎁 Rewards').setStyle(ButtonStyle.Success),
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

    // === REWARDS (tiered invite milestones) ===
    if (action === 'rewards') {
        const stats = getInviterStats(guildId, userId);
        const claimed = new Set(getClaimedTiers(guildId, userId));
        const tiers = getTiers();

        let nextTier = null;
        const lines = tiers.map(t => {
            const done = claimed.has(t.invites) || stats.total >= t.invites;
            const isClaimed = claimed.has(t.invites);
            const mark = isClaimed ? '✅' : (stats.total >= t.invites ? '🎉' : '🔒');
            if (!done && !nextTier) nextTier = t;
            const items = (t.items || []).map(itemLabel).join(', ');
            return `${mark} ${t.emoji} **${t.invites} undangan** — 🪙 ${t.money.toLocaleString('id-ID')}` +
                (items ? ` + ${items}` : '') +
                `\n     *${t.label}*`;
        });

        let progressLine;
        if (nextTier) {
            const remaining = Math.max(0, nextTier.invites - stats.total);
            const bar = ui.progressBar(stats.total, nextTier.invites, 12);
            progressLine = `\n\n**Progress ke tier berikutnya (${nextTier.emoji} ${nextTier.invites}):**\n${bar} ${stats.total}/${nextTier.invites}\n💡 Tinggal **${remaining}** undangan valid lagi!`;
        } else {
            progressLine = `\n\n🏆 **Semua tier sudah terbuka — kamu legenda rekrutmen!**`;
        }

        const embed = new EmbedBuilder()
            .setTitle(ui.title('🎁', 'Invite Rewards', interaction.user.username))
            .setColor(ui.COLORS.economy)
            .setDescription(
                `Undang teman → makin banyak undangan **valid**, makin gede hadiahnya. Hadiah masuk otomatis saat tercapai! 🎉\n\n` +
                lines.join('\n') +
                progressLine
            )
            .setFooter({ text: ui.footer(`Undangan valid kamu: ${stats.total} • ✅ sudah diklaim | 🔒 terkunci`) });

        const row = ui.backRow(`invpnl_back_${userId}`);
        return interaction.update({ embeds: [embed], components: [row] });
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
                `> ✅ Valid Invites: **${stats.real}**\n` +
                `> 🎁 Bonus Invites: **${stats.bonus}**\n` +
                `> 👻 Fake Invites: **${stats.fake}**\n` +
                `> 👋 Left Server: **${stats.left}**\n` +
                `> 📋 All-time Total: **${stats.totalAll}**\n` +
                `> 🏆 Total (valid+bonus): **${stats.total}**\n\n` +
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
                    ? '💡 Gunakan tombol di bawah untuk admin controls.'
                    : '🔒 Hanya admin yang dapat mengubah pengaturan.')
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`invpnl_bonus_${userId}`).setLabel('🎁 Bonus').setStyle(ButtonStyle.Primary).setDisabled(!isAdmin),
            new ButtonBuilder().setCustomId(`invpnl_blacklist_${userId}`).setLabel('🚫 Blacklist').setStyle(ButtonStyle.Danger).setDisabled(!isAdmin),
            new ButtonBuilder().setCustomId(`invpnl_reset_${userId}`).setLabel('🔄 Reset').setStyle(ButtonStyle.Danger).setDisabled(!isAdmin),
            new ButtonBuilder().setCustomId(`invpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === BONUS (Admin modal) ===
    if (action === 'bonus') {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder().setCustomId(`invpnl_modal_bonus_${userId}`).setTitle('🎁 Add/Remove Bonus Invites');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target').setLabel('User ID atau @mention').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('123456789')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Jumlah (negatif untuk kurangi)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('5 atau -3'))
        );
        return interaction.showModal(modal);
    }

    // === BLACKLIST (Admin modal) ===
    if (action === 'blacklist') {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder().setCustomId(`invpnl_modal_blacklist_${userId}`).setTitle('🚫 Invite Blacklist');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target').setLabel('User ID (add/remove)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('123456789')),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('action').setLabel('Action: add / remove / list').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('add'))
        );
        return interaction.showModal(modal);
    }

    // === RESET (Admin modal) ===
    if (action === 'reset') {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder().setCustomId(`invpnl_modal_reset_${userId}`).setTitle('🔄 Reset Invites');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target').setLabel('User ID (kosong = reset semua)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('123456789 atau kosong'))
        );
        return interaction.showModal(modal);
    }
}

// ============ UTILITY: Detection helper ============
function isInvitePanelButton(customId) {
    return customId.startsWith('invpnl_');
}

// ============ MODAL HANDLERS ============
async function handleInviteModal(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;

    if (customId.startsWith('invpnl_modal_bonus_')) {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });
        const { addBonusInvites, getInviterStats } = require('./inviteTracker');
        const targetId = interaction.fields.getTextInputValue('target').replace(/[<@!>]/g, '').trim();
        const amount = parseInt(interaction.fields.getTextInputValue('amount'));
        if (!targetId || isNaN(amount)) return interaction.reply({ content: '❌ Input tidak valid!', ephemeral: true });
        const newBonus = addBonusInvites(guildId, targetId, amount);
        const stats = getInviterStats(guildId, targetId);
        return interaction.reply({ content: `✅ Bonus invite <@${targetId}> ${amount >= 0 ? '+' : ''}${amount}\n> Bonus: **${newBonus}** | Total: **${stats.total}**`, ephemeral: true });
    }

    if (customId.startsWith('invpnl_modal_blacklist_')) {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });
        const { addInviteBlacklist, removeInviteBlacklist, getInviteBlacklist } = require('./inviteTracker');
        const targetId = interaction.fields.getTextInputValue('target').replace(/[<@!>]/g, '').trim();
        const action = interaction.fields.getTextInputValue('action').toLowerCase().trim();
        
        if (action === 'list') {
            const list = getInviteBlacklist(guildId);
            const desc = list.length > 0 ? list.map((b, i) => `> ${i+1}. <@${b.userId}>${b.reason ? ` — ${b.reason}` : ''}`).join('\n') : '*Kosong*';
            return interaction.reply({ content: `🚫 **Invite Blacklist:**\n${desc}`, ephemeral: true });
        }
        if (action === 'add') {
            addInviteBlacklist(guildId, targetId, 'Admin blacklist');
            return interaction.reply({ content: `🚫 <@${targetId}> ditambahkan ke invite blacklist. Invite mereka tidak akan dihitung.`, ephemeral: true });
        }
        if (action === 'remove') {
            removeInviteBlacklist(guildId, targetId);
            return interaction.reply({ content: `✅ <@${targetId}> dihapus dari invite blacklist.`, ephemeral: true });
        }
        return interaction.reply({ content: '❌ Action harus: add / remove / list', ephemeral: true });
    }

    if (customId.startsWith('invpnl_modal_reset_')) {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only!', ephemeral: true });
        const { resetInvites } = require('./inviteTracker');
        const targetId = (interaction.fields.getTextInputValue('target') || '').trim();
        if (targetId) {
            resetInvites(guildId, targetId);
            return interaction.reply({ content: `🔄 Invites <@${targetId}> di-reset!`, ephemeral: true });
        } else {
            resetInvites(guildId, null);
            return interaction.reply({ content: `🔄 SEMUA invites di server ini di-reset!`, ephemeral: true });
        }
    }

    return false;
}

function isInvitePanelModal(customId) {
    return customId.startsWith('invpnl_modal_');
}

module.exports = {
    buildInvitePanel,
    handleInviteCommand,
    handleInviteButton,
    isInvitePanelButton,
    handleInviteModal,
    isInvitePanelModal
};
