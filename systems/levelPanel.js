// systems/levelPanel.js - Level Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getConf } = require('../database');


// ============ BUILD: Main Level Panel ============
function buildLevelPanel(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);
    const targetXp = (userData.level + 1) * 100;
    const percent = Math.min(100, Math.floor((userData.xp / targetXp) * 100));
    const progressBar = '\u2588'.repeat(Math.floor(percent / 10)) + '\u2591'.repeat(10 - Math.floor(percent / 10));

    // Get rank
    const allUsers = db.prepare('SELECT userId FROM users WHERE guildId = ? ORDER BY level DESC, xp DESC').all(guildId);
    const rank = allUsers.findIndex(u => u.userId === userId) + 1;

    const embed = new EmbedBuilder()
        .setTitle(`\ud83c\udf1f LEVEL PANEL \u2014 ${username}`)
        .setColor('#5865F2')
        .setDescription(
            `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n` +
            `\ud83c\udfc5 **Level:** ${userData.level} | \ud83c\udfc6 **Rank:** #${rank}\n` +
            `\u2728 **EXP:** \`${progressBar}\` **${percent}%**\n` +
            `> ${userData.xp.toLocaleString('id-ID')} / ${targetXp.toLocaleString('id-ID')} XP\n` +
            `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n` +
            `> \ud83d\udcca **Rank** \u2014 Lihat detail rank kamu\n` +
            `> \ud83c\udfc6 **Leaderboard** \u2014 Top player level\n` +
            `> \ud83c\udf81 **Rewards** \u2014 Hadiah per level`
        )
        .setFooter({ text: 'Dapatkan XP dari chat, voice, dan reaction!' })
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
        const percent = Math.min(100, Math.floor((userData.xp / targetXp) * 100));
        const progressBar = '\u25b0'.repeat(Math.floor(percent / 10)) + '\u25b1'.repeat(10 - Math.floor(percent / 10));

        const chatMin = getConf(guildId, 'chat_min_xp', 5);
        const chatMax = getConf(guildId, 'chat_max_xp', 15);
        const chatCd = getConf(guildId, 'chat_cooldown', 30);
        const voiceMin = getConf(guildId, 'voice_min_xp', 3);
        const voiceMax = getConf(guildId, 'voice_max_xp', 8);

        const embed = new EmbedBuilder()
            .setTitle(`\ud83d\udcca Rank Detail \u2014 ${interaction.user.username}`)
            .setColor('#5865F2')
            .setDescription(
                `\ud83c\udfc5 **Level:** ${userData.level}\n` +
                `\u2728 **Progress:** \`${progressBar}\` **${percent}%**\n` +
                `> ${userData.xp} / ${targetXp} XP\n\n` +
                `**\u2699\ufe0f XP Settings:**\n` +
                `> \ud83d\udcac Chat: ${chatMin}-${chatMax} XP (CD: ${chatCd}s)\n` +
                `> \ud83c\udf99\ufe0f Voice: ${voiceMin}-${voiceMax} XP/menit`
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`lvlpnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }


    // === LEADERBOARD ===
    if (action === 'leaderboard') {
        const data = db.prepare('SELECT * FROM users WHERE guildId = ? ORDER BY level DESC, xp DESC LIMIT 10').all(guildId);
        let desc = data.length ? '' : '*Belum ada data.*';
        data.forEach((u, i) => {
            const medal = i === 0 ? '\ud83e\udd47' : i === 1 ? '\ud83e\udd48' : i === 2 ? '\ud83e\udd49' : `**${i + 1}.**`;
            desc += `${medal} <@${u.userId}> \u2014 Level **${u.level}** (${u.xp}/${(u.level + 1) * 100} XP)\n`;
        });
        const embed = new EmbedBuilder()
            .setTitle('\ud83c\udfc6 Level Leaderboard')
            .setColor('#FFD700')
            .setDescription(desc)
            .setFooter({ text: 'Top 10 Level' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`lvlpnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === REWARDS ===
    if (action === 'rewards') {
        const rewards = db.prepare('SELECT * FROM rewards WHERE guildId = ? ORDER BY level ASC').all(guildId);
        let desc = rewards.length ? '' : '*Belum ada reward yang diatur.*\n\nReward level diatur oleh admin server.';
        rewards.forEach(r => {
            desc += `> \ud83c\udf81 **Level ${r.level}** \u2192 `;
            if (r.roleId) desc += `Role: <@&${r.roleId}> `;
            if (r.money) desc += `\ud83e\ude99 ${r.money.toLocaleString('id-ID')}`;
            desc += '\n';
        });
        const embed = new EmbedBuilder()
            .setTitle('\ud83c\udf81 Level Rewards')
            .setColor('#2ECC71')
            .setDescription(desc)
            .setFooter({ text: 'Role & money otomatis diberikan saat naik level' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`lvlpnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
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
