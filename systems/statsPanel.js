// systems/statsPanel.js - Statistics Dashboard Panel
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getUserStat } = require('../database');
const ui = require('./ui');

// Local helper: horizontal text bar-chart row (12-wide) used by income/activity charts.
function chartBar(value, maxVal) {
    const len = maxVal > 0 ? Math.max(0, Math.round((value / maxVal) * 12)) : 0;
    return '█'.repeat(len) + '░'.repeat(12 - len);
}

// ============ BUILD: Main Stats Panel ============
function buildStatsPanel(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);

    // Calculate income today
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const incomeToday = getUserStat(guildId, userId, `income_${today}`) || 0;
    const totalEarned = getUserStat(guildId, userId, 'total_earned') || 0;

    const embed = new EmbedBuilder()
        .setTitle(ui.title('📊', 'STATISTICS', username))
        .setColor(ui.COLORS.casino)
        .setDescription(
            `Semua rekam jejakmu di server, dirangkum jadi satu. 📈\n` +
            ui.statBlock([
                `💰 Pemasukan Hari Ini: **+${incomeToday.toLocaleString('id-ID')}**`,
                `📈 Total Sepanjang Masa: **${totalEarned.toLocaleString('id-ID')}**`,
                `💳 Saldo Sekarang: ${ui.money(userData.balance)}`,
            ]) +
            `\n**Lihat rincian per kategori:**\n` +
            ui.menuList([
                { emoji: '💰', label: 'Income', desc: 'Dari mana saja uangmu datang' },
                { emoji: '🎮', label: 'Activity', desc: 'Mancing, bertani, quest, & lainnya' },
                { emoji: '⚔️', label: 'Battle', desc: 'Rekor dungeon, boss, & PvP' },
                { emoji: '🎰', label: 'Gambling', desc: 'Catatan untung-rugi di casino' },
            ])
        )
        .setFooter({ text: ui.footer(`Level ${userData.level} • Klik tombol untuk lihat detail`) })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`stats_income_${userId}`).setLabel('💰 Income').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`stats_activity_${userId}`).setLabel('🎮 Activity').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`stats_battle_${userId}`).setLabel('⚔️ Battle').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`stats_gambling_${userId}`).setLabel('🎰 Gambling').setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [row] };
}

// ============ BUILD: Income Sub-Panel ============
function buildIncomePanel(guildId, userId, username) {
    const fishIncome = getUserStat(guildId, userId, 'income_fishing') || 0;
    const farmIncome = getUserStat(guildId, userId, 'income_farming') || 0;
    const gamblingIncome = getUserStat(guildId, userId, 'income_gambling') || 0;
    const questIncome = getUserStat(guildId, userId, 'income_quest') || 0;
    const dailyIncome = getUserStat(guildId, userId, 'income_daily') || 0;
    const shopSpent = getUserStat(guildId, userId, 'total_spent_shop') || 0;
    const totalEarned = getUserStat(guildId, userId, 'total_earned') || 0;
    const netTotal = totalEarned - shopSpent;

    // Text bar chart
    const sources = [
        { name: '🎣 Fishing', value: fishIncome },
        { name: '🌾 Farming', value: farmIncome },
        { name: '🎰 Gambling', value: gamblingIncome },
        { name: '📜 Quest', value: questIncome },
        { name: '🎁 Daily', value: dailyIncome }
    ];
    const maxVal = Math.max(...sources.map(s => s.value), 1);

    let chart = '';
    sources.forEach(s => {
        chart += `${s.name}\n\`${chartBar(s.value, maxVal)}\` ${s.value.toLocaleString('id-ID')}\n`;
    });

    const embed = new EmbedBuilder()
        .setTitle(ui.title('💰', 'INCOME', username))
        .setColor(ui.COLORS.economy)
        .setDescription(
            `**📊 Income Breakdown (All Time)**\n` + ui.DIVIDER + `\n` +
            chart +
            ui.DIVIDER + `\n` +
            `**💸 Pengeluaran:**\n` +
            `> 🛒 Shop: **${shopSpent.toLocaleString('id-ID')}**\n\n` +
            `**📈 Net Total: ${netTotal >= 0 ? '+' : ''}${netTotal.toLocaleString('id-ID')}**`
        )
        .setFooter({ text: ui.footer('Sumber penghasilan kamu') });

    return { embeds: [embed], components: [ui.backRow(`stats_back_${userId}`)] };
}

// ============ BUILD: Activity Sub-Panel ============
function buildActivityPanel(guildId, userId, username) {
    const fishCaught = getUserStat(guildId, userId, 'total_fish_caught') || 0;
    const harvests = getUserStat(guildId, userId, 'total_harvests') || 0;
    const crafts = getUserStat(guildId, userId, 'total_crafts') || 0;
    const questsDone = getUserStat(guildId, userId, 'total_quests_done') || 0;
    const tradesCompleted = getUserStat(guildId, userId, 'trades_completed') || 0;
    const totalBuys = getUserStat(guildId, userId, 'total_buys') || 0;
    const fishSold = getUserStat(guildId, userId, 'total_fish_sold_count') || 0;
    const dailyClaims = getUserStat(guildId, userId, 'total_dailies') || 0;

    // Activity chart
    const activities = [
        { name: '🎣 Fish Caught', value: fishCaught },
        { name: '🌾 Harvests', value: harvests },
        { name: '🧪 Crafts', value: crafts },
        { name: '📜 Quests Done', value: questsDone },
        { name: '🔄 Trades', value: tradesCompleted }
    ];
    const maxVal = Math.max(...activities.map(a => a.value), 1);

    let chart = '';
    activities.forEach(a => {
        chart += `${a.name}\n\`${chartBar(a.value, maxVal)}\` ${a.value.toLocaleString('id-ID')}\n`;
    });

    const embed = new EmbedBuilder()
        .setTitle(ui.title('🎮', 'ACTIVITY', username))
        .setColor(ui.COLORS.fishing)
        .setDescription(
            `**📊 Activity Overview**\n` + ui.DIVIDER + `\n` +
            chart +
            ui.DIVIDER + `\n` +
            `**📋 Lainnya:**\n` +
            `> 🛒 Total Buys: **${totalBuys}**\n` +
            `> 💰 Fish Sold: **${fishSold}**\n` +
            `> 🎁 Daily Claims: **${dailyClaims}**`
        )
        .setFooter({ text: ui.footer('Semua aktivitas kamu') });

    return { embeds: [embed], components: [ui.backRow(`stats_back_${userId}`)] };
}

// ============ BUILD: Battle Sub-Panel ============
function buildBattlePanel(guildId, userId, username) {
    const dungeonClears = getUserStat(guildId, userId, 'dungeon_clears') || 0;
    const bossKills = getUserStat(guildId, userId, 'boss_kills') || 0;
    const pvpWins = getUserStat(guildId, userId, 'pvp_wins') || 0;
    const pvpLosses = getUserStat(guildId, userId, 'pvp_losses') || 0;
    const totalPvp = pvpWins + pvpLosses;
    const winRate = totalPvp > 0 ? Math.round((pvpWins / totalPvp) * 100) : 0;
    const huntMissions = getUserStat(guildId, userId, 'hunt_missions') || 0;

    const embed = new EmbedBuilder()
        .setTitle(ui.title('⚔️', 'BATTLE STATS', username))
        .setColor(ui.COLORS.battle)
        .setDescription(
            ui.statBlock([
                `**🏰 PvE:**`,
                `> 🏔️ Dungeon Clears: **${dungeonClears}**`,
                `> 👹 Boss Kills: **${bossKills}**`,
                `> 🐾 Hunt Missions: **${huntMissions}**`,
            ]) +
            `\n**⚔️ PvP:**\n` +
            `> ✅ Wins: **${pvpWins}**  •  ❌ Losses: **${pvpLosses}**\n` +
            `> 📊 Win Rate: ${ui.progressLine(winRate, 100)}\n` +
            `> 🎯 Total Battles: **${totalPvp}**`
        )
        .setFooter({ text: ui.footer('Catatan pertarungan kamu') });

    return { embeds: [embed], components: [ui.backRow(`stats_back_${userId}`)] };
}

// ============ BUILD: Gambling Sub-Panel ============
function buildGamblingPanel(guildId, userId, username) {
    const totalBets = getUserStat(guildId, userId, 'total_bets') || 0;
    const totalWins = getUserStat(guildId, userId, 'total_gambling_wins') || 0;
    const biggestWin = getUserStat(guildId, userId, 'biggest_win') || 0;
    const cfWins = getUserStat(guildId, userId, 'coinflip_wins') || 0;
    const cfLosses = getUserStat(guildId, userId, 'coinflip_losses') || 0;
    const slotWins = getUserStat(guildId, userId, 'slot_wins') || 0;
    const slotLosses = getUserStat(guildId, userId, 'slot_losses') || 0;
    const rouletteWins = getUserStat(guildId, userId, 'roulette_wins') || 0;
    const rouletteLosses = getUserStat(guildId, userId, 'roulette_losses') || 0;
    const totalGamblingIncome = getUserStat(guildId, userId, 'income_gambling') || 0;
    const totalGamblingLost = getUserStat(guildId, userId, 'total_gambling_lost') || 0;
    const netGambling = totalGamblingIncome - totalGamblingLost;

    const cfRate = cfWins + cfLosses > 0 ? Math.round((cfWins / (cfWins + cfLosses)) * 100) : 0;
    const slotRate = slotWins + slotLosses > 0 ? Math.round((slotWins / (slotWins + slotLosses)) * 100) : 0;
    const rlRate = rouletteWins + rouletteLosses > 0 ? Math.round((rouletteWins / (rouletteWins + rouletteLosses)) * 100) : 0;

    const embed = new EmbedBuilder()
        .setTitle(ui.title('🎰', 'GAMBLING STATS', username))
        .setColor(ui.COLORS.pet)
        .setDescription(
            ui.statBlock([
                `**📊 Overview:**`,
                `> 🎲 Total Bets: **${totalBets.toLocaleString('id-ID')}**`,
                `> 🏆 Total Wins: **${totalWins.toLocaleString('id-ID')}**`,
                `> 💎 Biggest Win: **${biggestWin.toLocaleString('id-ID')}**`,
                `> ${netGambling >= 0 ? '📈' : '📉'} Net: **${netGambling >= 0 ? '+' : ''}${netGambling.toLocaleString('id-ID')}**`,
            ]) +
            `\n**🪙 Coinflip:** ✅ ${cfWins}W / ❌ ${cfLosses}L (${cfRate}%)\n` +
            `**🎰 Slot:** ✅ ${slotWins}W / ❌ ${slotLosses}L (${slotRate}%)\n` +
            `**🎯 Roulette:** ✅ ${rouletteWins}W / ❌ ${rouletteLosses}L (${rlRate}%)`
        )
        .setFooter({ text: ui.footer('Riwayat gambling kamu') });

    return { embeds: [embed], components: [ui.backRow(`stats_back_${userId}`)] };
}

// ============ HANDLER: /stats command ============
async function handleStatsCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const panel = buildStatsPanel(guildId, userId, interaction.user.username);
    return interaction.reply(panel);
}

// ============ HANDLER: Stats panel buttons ============
async function handleStatsButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel stats kamu!', ephemeral: true });
    }

    const action = parts[1];

    if (action === 'back') {
        return interaction.update(buildStatsPanel(guildId, userId, interaction.user.username));
    }

    if (action === 'income') {
        return interaction.update(buildIncomePanel(guildId, userId, interaction.user.username));
    }

    if (action === 'activity') {
        return interaction.update(buildActivityPanel(guildId, userId, interaction.user.username));
    }

    if (action === 'battle') {
        return interaction.update(buildBattlePanel(guildId, userId, interaction.user.username));
    }

    if (action === 'gambling') {
        return interaction.update(buildGamblingPanel(guildId, userId, interaction.user.username));
    }

    return null;
}

// ============ UTILITY: Detection helpers ============
function isStatsPanelButton(customId) {
    return customId.startsWith('stats_');
}

module.exports = {
    buildStatsPanel,
    handleStatsCommand,
    handleStatsButton,
    isStatsPanelButton
};
