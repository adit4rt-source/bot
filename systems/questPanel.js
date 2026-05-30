// systems/questPanel.js - Quest Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getSetting, getUserStat, incrementUserStat, addItem } = require('../database');
const { updateQuestProgress, getOrCreateWeeklyQuests, getWeekId, checkDailyQuestStreak, DIFFICULTY_TIERS } = require('./quests');
const { checkAchievements } = require('./achievements');

// ============ HELPER: Build progress bar ============
function makeBar(percent) {
    const filled = Math.floor(percent / 10);
    return '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
}

// ============ HELPER: Get daily quests for user ============
function getDailyQuests(guildId, userId) {
    // Trigger quest generation if needed
    updateQuestProgress(guildId, userId, 'dummy', 0);
    const row = db.prepare('SELECT * FROM daily_quests WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!row) return [];
    return JSON.parse(row.data);
}

// ============ BUILD: Main Quest Panel ============
function buildQuestPanel(guildId, userId, username) {
    const quests = getDailyQuests(guildId, userId);
    const weeklyQuests = getOrCreateWeeklyQuests(guildId, userId);

    const dailyDone = quests.filter(q => q.claimed).length;
    const weeklyDone = weeklyQuests.filter(q => q.claimed).length;
    const perfectDays = getUserStat(guildId, userId, 'quest_perfect_days') || 0;
    const consecutive = getUserStat(guildId, userId, 'quest_consecutive_perfect') || 0;

    const embed = new EmbedBuilder()
        .setTitle(`\ud83d\udcdc QUEST PANEL \u2014 ${username}`)
        .setColor(dailyDone === 3 && weeklyDone === 3 ? '#2ECC71' : '#5865F2')
        .setDescription(
            `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n` +
            `\ud83d\udccb **Daily Quest:** ${dailyDone}/3 selesai\n` +
            `\ud83d\udcc5 **Weekly Quest:** ${weeklyDone}/3 selesai\n` +
            `\ud83c\udfc5 **Perfect Days:** ${perfectDays} | \ud83d\udd25 **Consecutive:** ${consecutive}/7\n` +
            `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n` +
            `> \ud83d\udccb Klik **Daily** untuk misi harian\n` +
            `> \ud83d\udcc5 Klik **Weekly** untuk misi mingguan\n` +
            `> \ud83d\udd04 Klik **Refresh** untuk update progress`
        )
        .setFooter({ text: `Daily reset 00:00 WIB | Weekly reset Senin 00:00 WIB` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`quest_daily_${userId}`).setLabel('\ud83d\udccb Daily').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`quest_weekly_${userId}`).setLabel('\ud83d\udcc5 Weekly').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`quest_refresh_${userId}`).setLabel('\ud83d\udd04 Refresh').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

// ============ BUILD: Daily Quest Sub-panel ============
function buildDailyPanel(guildId, userId, username) {
    const quests = getDailyQuests(guildId, userId);
    const allDailyDone = quests.every(q => q.claimed);
    const perfectDays = getUserStat(guildId, userId, 'quest_perfect_days') || 0;
    const consecutive = getUserStat(guildId, userId, 'quest_consecutive_perfect') || 0;

    // Check if bonus already given today
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const bonusKey = `quest_bonus_${today}`;
    const bonusGiven = getUserStat(guildId, userId, bonusKey);

    let desc = `\ud83d\udccb **MISI HARIAN** \u2014 Reset 00:00 WIB\n\n`;

    quests.forEach((q, i) => {
        const diff = DIFFICULTY_TIERS[q.difficulty] || DIFFICULTY_TIERS.easy;
        const percent = Math.min(100, Math.floor((q.progress / q.target) * 100));
        const bar = makeBar(percent);
        const status = q.claimed ? '\u2705 DIKLAIM' : `${q.progress}/${q.target}`;
        desc += `${diff.stars} **Misi ${i + 1}** \u2014 ${diff.label}\n`;
        desc += `${q.desc}\n`;
        desc += `> \ud83e\ude99 **${q.reward} Money**\n`;
        desc += `> \`[${bar}]\` ${percent}% \u2014 ${status}\n\n`;
    });

    if (allDailyDone) {
        const bonusStatus = bonusGiven ? '\u2705 sudah diklaim' : '\ud83c\udf81 belum diklaim';
        desc += `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n`;
        desc += `\ud83c\udf81 **All Done Bonus:** +200 Money (${bonusStatus})`;
    }

    const embed = new EmbedBuilder()
        .setTitle(`\ud83d\udccb DAILY QUEST \u2014 ${username}`)
        .setColor(allDailyDone ? '#2ECC71' : '#F39C12')
        .setDescription(desc)
        .setFooter({ text: `\ud83c\udfc5 Perfect Days: ${perfectDays} | \ud83d\udd25 Consecutive: ${consecutive}/7 \u2192 Bonus 1000 + Mystery Box` });

    // Claim buttons
    const buttons = new ActionRowBuilder();
    quests.forEach((q, i) => {
        const btn = new ButtonBuilder()
            .setCustomId(`quest_claim_daily_${i}_${userId}`)
            .setLabel(`Klaim ${i + 1}`)
            .setStyle(ButtonStyle.Success);
        if (q.progress < q.target || q.claimed) btn.setDisabled(true);
        buttons.addComponents(btn);
    });

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`quest_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [buttons, navRow] };
}

// ============ BUILD: Weekly Quest Sub-panel ============
function buildWeeklyPanel(guildId, userId, username) {
    const weeklyQuests = getOrCreateWeeklyQuests(guildId, userId);
    const allWeeklyDone = weeklyQuests.every(q => q.claimed);

    let desc = `\ud83d\udcc5 **MISI MINGGUAN** \u2014 Reset Senin 00:00 WIB\n`;
    desc += `> \ud83c\udd94 Week: **${getWeekId()}**\n\n`;

    weeklyQuests.forEach((q, i) => {
        const percent = Math.min(100, Math.floor((q.progress / q.target) * 100));
        const bar = makeBar(percent);
        const status = q.claimed ? '\u2705 DIKLAIM' : `${q.progress}/${q.target}`;
        desc += `\ud83c\udfc6 **Weekly ${i + 1}**\n`;
        desc += `${q.desc}\n`;
        desc += `> \ud83e\ude99 **${q.reward.toLocaleString('id-ID')} Money**\n`;
        desc += `> \`[${bar}]\` ${percent}% \u2014 ${status}\n\n`;
    });

    const embed = new EmbedBuilder()
        .setTitle(`\ud83d\udcc5 WEEKLY QUEST \u2014 ${username}`)
        .setColor(allWeeklyDone ? '#F1C40F' : '#3498DB')
        .setDescription(desc)
        .setFooter({ text: `Misi besar dengan hadiah besar! | Week: ${getWeekId()}` });

    // Claim buttons
    const buttons = new ActionRowBuilder();
    weeklyQuests.forEach((q, i) => {
        const btn = new ButtonBuilder()
            .setCustomId(`quest_claim_weekly_${i}_${userId}`)
            .setLabel(`Klaim W${i + 1}`)
            .setStyle(ButtonStyle.Primary);
        if (q.progress < q.target || q.claimed) btn.setDisabled(true);
        buttons.addComponents(btn);
    });

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`quest_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [buttons, navRow] };
}

// ============ HANDLER: /quest command ============
async function handleQuestCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // Check quest channel restriction
    const questChannelSetting = getSetting(guildId, 'quest_channel', null);
    if (questChannelSetting && interaction.channelId !== questChannelSetting) {
        return interaction.reply({ content: `\u274c Buka quest hanya di <#${questChannelSetting}>.`, ephemeral: true });
    }

    const panel = buildQuestPanel(guildId, userId, interaction.user.username);
    return interaction.reply(panel);
}

// ============ HANDLER: Quest panel button clicks ============
async function handleQuestButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    // Format: quest_action_userId or quest_claim_type_index_userId
    const userId = parts[parts.length - 1];

    // Validate ownership
    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '\u274c Ini bukan panel quest kamu!', ephemeral: true });
    }

    const action = parts[1];

    // === BACK TO MAIN PANEL ===
    if (action === 'back') {
        const panel = buildQuestPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    // === REFRESH ===
    if (action === 'refresh') {
        const panel = buildQuestPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    // === DAILY SUB-PANEL ===
    if (action === 'daily') {
        const panel = buildDailyPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    // === WEEKLY SUB-PANEL ===
    if (action === 'weekly') {
        const panel = buildWeeklyPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    // === CLAIM DAILY QUEST ===
    if (action === 'claim' && parts[2] === 'daily') {
        const qi = parseInt(parts[3]);
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
        let row = db.prepare('SELECT * FROM daily_quests WHERE guildId = ? AND userId = ?').get(guildId, userId);
        if (!row || row.date !== today) return interaction.reply({ content: '\u274c Quest expired.', ephemeral: true });

        let quests = JSON.parse(row.data);
        const tq = quests[qi];
        if (!tq || tq.progress < tq.target || tq.claimed) {
            return interaction.reply({ content: '\u274c Belum selesai atau sudah diklaim!', ephemeral: true });
        }

        tq.claimed = true;
        db.prepare('UPDATE daily_quests SET data = ? WHERE guildId = ? AND userId = ?').run(JSON.stringify(quests), guildId, userId);

        let ud = getOrCreateUser(guildId, userId);
        ud.balance += tq.reward;
        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(ud.balance, guildId, userId);
        incrementUserStat(guildId, userId, 'total_quests_done');
        await checkAchievements(interaction.guild, userId, { type: 'quest' });

        if (quests.every(q => q.claimed)) {
            await checkAchievements(interaction.guild, userId, { type: 'all_quest_day' });
        }

        // Check streak bonus
        let bonusMsg = '';
        const streakResult = checkDailyQuestStreak(guildId, userId);
        if (streakResult) {
            bonusMsg = `\n\n\ud83c\udf81 **ALL DONE BONUS: +200 Money!**\n> \ud83c\udfc5 Perfect Days: ${streakResult.perfectDays}`;
            if (streakResult.weeklyBonus) {
                bonusMsg += `\n\n\ud83c\udf89\ud83c\udf89 **7-DAY STREAK BONUS!** +1000 Money + \ud83d\udce6 Mystery Box! \ud83c\udf89\ud83c\udf89`;
            }
        }

        // Update the panel to reflect new state
        const panel = buildDailyPanel(guildId, userId, interaction.user.username);
        await interaction.update(panel);

        // Send bonus message if any
        if (bonusMsg) {
            return interaction.followUp({ content: `\u2705 Dapat \ud83e\ude99 **${tq.reward}**!${bonusMsg}`, ephemeral: true });
        }
        return interaction.followUp({ content: `\u2705 Dapat \ud83e\ude99 **${tq.reward}**!`, ephemeral: true });
    }

    // === CLAIM WEEKLY QUEST ===
    if (action === 'claim' && parts[2] === 'weekly') {
        const qi = parseInt(parts[3]);
        const week = getWeekId();
        let row = db.prepare('SELECT * FROM weekly_quests WHERE guildId = ? AND userId = ? AND week = ?').get(guildId, userId, week);
        if (!row) return interaction.reply({ content: '\u274c Quest expired.', ephemeral: true });

        let quests = JSON.parse(row.data);
        const tq = quests[qi];
        if (!tq || tq.progress < tq.target || tq.claimed) {
            return interaction.reply({ content: '\u274c Belum selesai atau sudah diklaim!', ephemeral: true });
        }

        tq.claimed = true;
        db.prepare('UPDATE weekly_quests SET data = ? WHERE guildId = ? AND userId = ? AND week = ?').run(JSON.stringify(quests), guildId, userId, week);

        let ud = getOrCreateUser(guildId, userId);
        ud.balance += tq.reward;
        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(ud.balance, guildId, userId);
        incrementUserStat(guildId, userId, 'total_weekly_quests_done');

        // Update the panel to reflect new state
        const panel = buildWeeklyPanel(guildId, userId, interaction.user.username);
        await interaction.update(panel);
        return interaction.followUp({ content: `\u2705 Weekly Quest selesai! Dapat \ud83e\ude99 **${tq.reward.toLocaleString('id-ID')}**!`, ephemeral: true });
    }
}

// ============ UTILITY: Detection helper ============
function isQuestPanelButton(customId) {
    return customId.startsWith('quest_');
}

module.exports = {
    buildQuestPanel,
    handleQuestCommand,
    handleQuestButton,
    isQuestPanelButton
};
