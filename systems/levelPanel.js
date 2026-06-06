// systems/levelPanel.js - Level Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getConf } = require('../database');
const ui = require('./ui');


// ============ BUILD: Main Level Panel ============
function buildLevelPanel(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);
    const targetXp = (userData.level + 1) * 100;

    // Get rank
    const allUsers = db.prepare('SELECT userId FROM users WHERE guildId = ? ORDER BY level DESC, xp DESC').all(guildId);
    const rank = allUsers.findIndex(u => u.userId === userId) + 1;

    const embed = new EmbedBuilder()
        .setTitle(ui.title('🌟', 'LEVEL', username))
        .setColor(ui.COLORS.level)
        .setDescription(
            ui.statBlock([
                `🏅 **Level:** ${userData.level}  •  🏆 **Rank:** #${rank}`,
                `✨ **EXP:** ${ui.progressLine(userData.xp, targetXp)}`,
                `> ${userData.xp.toLocaleString('id-ID')} / ${targetXp.toLocaleString('id-ID')} XP`,
            ]) +
            `\n` +
            ui.menuList([
                { emoji: '📊', label: 'Rank', desc: 'Lihat detail rank kamu' },
                { emoji: '🏆', label: 'Leaderboard', desc: 'Top player level di server' },
                { emoji: '🎁', label: 'Rewards', desc: 'Hadiah otomatis per level' },
            ])
        )
        .setFooter({ text: ui.footer('Dapatkan XP dari chat, voice, dan reaction!') })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`lvlpnl_rank_${userId}`).setLabel('\ud83d\udcca Rank').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`lvlpnl_leaderboard_${userId}`).setLabel('\ud83c\udfc6 Leaderboard').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`lvlpnl_rewards_${userId}`).setLabel('\ud83c\udf81 Rewards').setStyle(ButtonStyle.Success)
    );

    return { embeds: [embed], components: [row] };
}


// ============ HANDLER: /levelpanel command ============
async function handleLevelPanelCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const panel = buildLevelPanel(guildId, userId, interaction.user.username);
    return interaction.reply(panel);
}

// ============ HANDLER: Level panel button clicks ============
async function handleLevelButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '\u274c Ini bukan panel kamu!', ephemeral: true });
    }

    const action = parts[1];

    // === BACK ===
    if (action === 'back') {
        return interaction.update(buildLevelPanel(guildId, userId, interaction.user.username));
    }

    // === RANK DETAIL ===
    if (action === 'rank') {
        const userData = getOrCreateUser(guildId, userId);
        const targetXp = (userData.level + 1) * 100;

        const chatMin = getConf(guildId, 'chat_min_xp', 5);
        const chatMax = getConf(guildId, 'chat_max_xp', 15);
        const chatCd = getConf(guildId, 'chat_cooldown', 30);
        const voiceMin = getConf(guildId, 'voice_min_xp', 3);
        const voiceMax = getConf(guildId, 'voice_max_xp', 8);

        const embed = new EmbedBuilder()
            .setTitle(ui.title('📊', 'Rank Detail', interaction.user.username))
            .setColor(ui.COLORS.level)
            .setDescription(
                ui.statBlock([
                    `🏅 **Level:** ${userData.level}`,
                    `✨ **Progress:** ${ui.progressLine(userData.xp, targetXp, 10, 'arrow')}`,
                    `> ${userData.xp} / ${targetXp} XP`,
                ]) +
                `\n**⚙️ Cara dapat XP:**\n` +
                `> 💬 Chat: ${chatMin}-${chatMax} XP (CD: ${chatCd}s)\n` +
                `> 🎙️ Voice: ${voiceMin}-${voiceMax} XP/menit\n` +
                `> 😄 Reaction juga memberi XP!`
            )
            .setFooter({ text: ui.footer('Makin aktif, makin cepat naik level!') });
        const row = ui.backRow(`lvlpnl_back_${userId}`);
        return interaction.update({ embeds: [embed], components: [row] });
    }


    // === LEADERBOARD ===
    if (action === 'leaderboard') {
        const data = db.prepare('SELECT * FROM users WHERE guildId = ? ORDER BY level DESC, xp DESC LIMIT 10').all(guildId);
        let desc = data.length ? '' : '*Belum ada data. Mulai ngobrol untuk dapat XP!*';
        data.forEach((u, i) => {
            desc += `${ui.medal(i)} <@${u.userId}> — Level **${u.level}** \`(${u.xp}/${(u.level + 1) * 100} XP)\`\n`;
        });
        const embed = new EmbedBuilder()
            .setTitle(ui.title('🏆', 'Level Leaderboard'))
            .setColor(ui.COLORS.leaderboard)
            .setDescription(desc)
            .setFooter({ text: ui.footer('Top 10 Level di server ini') });
        const row = ui.backRow(`lvlpnl_back_${userId}`);
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === REWARDS ===
    if (action === 'rewards') {
        const rewards = db.prepare('SELECT * FROM rewards WHERE guildId = ? ORDER BY level ASC').all(guildId);
        let desc = rewards.length ? '' : '*Belum ada reward yang diatur.*\n\nReward level diatur oleh admin server.';
        rewards.forEach(r => {
            desc += `> 🎁 **Level ${r.level}** → `;
            if (r.roleId) desc += `Role: <@&${r.roleId}> `;
            if (r.money) desc += ui.money(r.money);
            desc += '\n';
        });
        const embed = new EmbedBuilder()
            .setTitle(ui.title('🎁', 'Level Rewards'))
            .setColor(ui.COLORS.success)
            .setDescription(desc)
            .setFooter({ text: ui.footer('Role & money otomatis diberikan saat naik level') });
        const row = ui.backRow(`lvlpnl_back_${userId}`);
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

// ============ UTILITY: Detection helper ============
function isLevelPanelButton(customId) {
    return customId.startsWith('lvlpnl_');
}

module.exports = {
    buildLevelPanel,
    handleLevelPanelCommand,
    handleLevelButton,
    isLevelPanelButton
};
