// systems/profilePanel.js - Profile Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getUserStat, getSetting } = require('../database');
const { ACHIEVEMENTS } = require('./achievements');
const { getPetData } = require('./pets');
const { PET_DATA } = require('../data/pets');


// ============ BUILD: Main Profile Panel ============
function buildProfilePanel(guildId, userId, username, member) {
    const userData = getOrCreateUser(guildId, userId);
    const targetXp = (userData.level + 1) * 100;
    const percent = Math.min(100, Math.floor((userData.xp / targetXp) * 100));
    const progressBar = '\u25b0'.repeat(Math.floor(percent / 10)) + '\u25b1'.repeat(10 - Math.floor(percent / 10));

    const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId);
    const streakCount = sData ? sData.count : 0;
    const streakEmoji = getSetting(guildId, 'streak_emoji', '\ud83d\udd25');

    const userAchs = db.prepare('SELECT * FROM achievements WHERE guildId = ? AND userId = ?').all(guildId, userId);
    const totalBadges = userAchs.length;

    const activePet = getPetData(guildId, userId);
    const petInfo = activePet ? (() => { const pd = PET_DATA.find(p => p.id === activePet.petId); return pd ? `${pd.emoji} **${activePet.name}** (Lv.${activePet.level})` : '\ud83d\udc3e Pet'; })() : '*Belum punya pet*';

    const fishCaught = getUserStat(guildId, userId, 'total_fish_caught') || 0;
    const harvests = getUserStat(guildId, userId, 'total_harvests') || 0;
    const questsDone = getUserStat(guildId, userId, 'total_quests_done') || 0;

    const embed = new EmbedBuilder()
        .setTitle(`\ud83d\udccb PROFIL \u2014 ${username}`)
        .setColor('#2B2D31')
        .setThumbnail(member ? member.displayAvatarURL({ dynamic: true, size: 256 }) : null)
        .setDescription(
            `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n` +
            `\ud83c\udfc5 **Level** \`${userData.level}\` \u2014 \ud83d\udcb0 **Saldo** \`${userData.balance.toLocaleString('id-ID')}\`\n` +
            `${streakEmoji} **Streak** \`${streakCount} Hari\`\n\n` +
            `\u2728 **EXP:** \`${progressBar}\` **${percent}%** (${userData.xp}/${targetXp})\n\n` +
            `\ud83c\udfc6 **Badge:** ${totalBadges}/${ACHIEVEMENTS.length}\n` +
            `\ud83d\udc3e **Pet:** ${petInfo}\n` +
            `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n` +
            `> \ud83c\udfa3 Ikan: **${fishCaught}** | \ud83c\udf3e Panen: **${harvests}** | \ud83d\udccb Quest: **${questsDone}**`
        )
        .setFooter({ text: 'Pilih menu di bawah untuk detail' })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`profpnl_achievement_${userId}`).setLabel('\ud83c\udfc6 Achievement').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`profpnl_inventory_${userId}`).setLabel('\ud83c\udf92 Inventory').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`profpnl_streak_${userId}`).setLabel(`${streakEmoji} Streak`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`profpnl_stats_${userId}`).setLabel('\ud83d\udcca Stats').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1] };
}


// ============ HANDLER: /profile command ============
async function handleProfilePanelCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    const panel = buildProfilePanel(guildId, userId, interaction.user.username, member);
    return interaction.reply(panel);
}

// ============ HANDLER: Profile panel button clicks ============
async function handleProfileButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '\u274c Ini bukan panel profil kamu!', ephemeral: true });
    }

    const action = parts[1];

    // === BACK TO MAIN ===
    if (action === 'back') {
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        return interaction.update(buildProfilePanel(guildId, userId, interaction.user.username, member));
    }

    // === ACHIEVEMENT SUMMARY ===
    if (action === 'achievement') {
        const userAchs = db.prepare('SELECT * FROM achievements WHERE guildId = ? AND userId = ?').all(guildId, userId);
        const unlockedIds = userAchs.map(a => a.achievementId);
        const categories = [...new Set(ACHIEVEMENTS.map(a => a.category))];
        const totalUnlocked = unlockedIds.length;
        const percentComplete = Math.floor((totalUnlocked / ACHIEVEMENTS.length) * 100);

        let desc = `> \ud83c\udfc6 **${totalUnlocked}** / **${ACHIEVEMENTS.length}** badge (**${percentComplete}%**)\n\n`;
        for (const cat of categories) {
            const catAchs = ACHIEVEMENTS.filter(a => a.category === cat);
            const catUnlocked = catAchs.filter(a => unlockedIds.includes(a.id)).length;
            const catIcon = { Social: '\ud83d\udcac', Economy: '\ud83d\udcb0', Level: '\ud83d\udcc8', Streak: '\ud83d\udd25', Gambling: '\ud83c\udfb0', Events: '\ud83c\udfae', Voice: '\ud83c\udf99\ufe0f', Quest: '\ud83d\udcdc', Special: '\u2728', Fishing: '\ud83c\udfa3', Farming: '\ud83c\udf3e', Battle: '\u2694\ufe0f' }[cat] || '\ud83d\udcc1';
            desc += `${catIcon} **${cat}** (${catUnlocked}/${catAchs.length})\n`;
        }
        if (desc.length > 4000) desc = desc.substring(0, 3990) + '\n*...dan lainnya*';

        const embed = new EmbedBuilder()
            .setTitle(`\ud83c\udfc6 Achievement \u2014 ${interaction.user.username}`)
            .setColor('#FFD700')
            .setDescription(desc)
            .setFooter({ text: 'Gunakan /me achievement untuk detail per kategori' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }


    // === INVENTORY ===
    if (action === 'inventory') {
        const { ITEMS } = require('../data/items');
        const ownedItems = db.prepare('SELECT * FROM item_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, userId);
        let desc = '';
        if (ownedItems.length === 0) {
            desc = '*Inventory kosong!*\n\nBeli item di `/shop` atau dapatkan dari quest & event.';
        } else {
            ownedItems.forEach(inv => {
                const def = ITEMS.find(i => i.id === inv.itemId);
                if (!def) return;
                desc += `> ${def.emoji} **${def.name}** x${inv.quantity}\n`;
            });
        }
        const embed = new EmbedBuilder()
            .setTitle(`\ud83c\udf92 Inventory \u2014 ${interaction.user.username}`)
            .setColor('#3498DB')
            .setDescription(desc)
            .setFooter({ text: 'Gunakan /me use <item> untuk pakai item' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === STREAK ===
    if (action === 'streak') {
        const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId);
        const streakCount = sData ? sData.count : 0;
        const lastDate = sData ? sData.lastDate : 'Belum pernah';
        const restoreCount = getUserStat(guildId, userId, 'streak_restores_this_month') || 0;
        const streakEmoji = getSetting(guildId, 'streak_emoji', '\ud83d\udd25');

        const embed = new EmbedBuilder()
            .setTitle(`${streakEmoji} Streak Info \u2014 ${interaction.user.username}`)
            .setColor('#E74C3C')
            .setDescription(
                `> ${streakEmoji} **Streak:** ${streakCount} hari\n` +
                `> \ud83d\udcc5 **Last Active:** ${lastDate}\n` +
                `> \u267b\ufe0f **Restore Used:** ${restoreCount}/3 bulan ini\n\n` +
                `*Ketik pesan setiap hari untuk menjaga streak!*\n` +
                `*Gunakan \`/me restore\` untuk pulihkan streak yang putus.*`
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }


    // === STATS ===
    if (action === 'stats') {
        const cfWins = getUserStat(guildId, userId, 'coinflip_wins') || 0;
        const slotWins = getUserStat(guildId, userId, 'slot_wins') || 0;
        const rouletteWins = getUserStat(guildId, userId, 'roulette_wins') || 0;
        const fishCaught = getUserStat(guildId, userId, 'total_fish_caught') || 0;
        const harvests = getUserStat(guildId, userId, 'total_harvests') || 0;
        const questsDone = getUserStat(guildId, userId, 'total_quests_done') || 0;
        const eventWins = getUserStat(guildId, userId, 'event_wins') || 0;
        const bossKills = getUserStat(guildId, userId, 'boss_kills') || 0;
        const totalBuys = getUserStat(guildId, userId, 'total_buys') || 0;

        const embed = new EmbedBuilder()
            .setTitle(`\ud83d\udcca Statistics \u2014 ${interaction.user.username}`)
            .setColor('#9B59B6')
            .setDescription(
                `**\ud83c\udfae Game Stats:**\n` +
                `> \ud83e\ude99 Coinflip Wins: **${cfWins}**\n` +
                `> \ud83c\udfb0 Slot Wins: **${slotWins}**\n` +
                `> \ud83c\udfaf Roulette Wins: **${rouletteWins}**\n\n` +
                `**\ud83c\udf1f Activity Stats:**\n` +
                `> \ud83c\udfa3 Ikan Ditangkap: **${fishCaught}**\n` +
                `> \ud83c\udf3e Total Panen: **${harvests}**\n` +
                `> \ud83d\udccb Quest Selesai: **${questsDone}**\n` +
                `> \ud83c\udfae Event Wins: **${eventWins}**\n` +
                `> \ud83d\udc79 Boss Kills: **${bossKills}**\n` +
                `> \ud83d\uded2 Total Buys: **${totalBuys}**`
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

// ============ UTILITY: Detection helper ============
function isProfilePanelButton(customId) {
    return customId.startsWith('profpnl_');
}

module.exports = {
    buildProfilePanel,
    handleProfilePanelCommand,
    handleProfileButton,
    isProfilePanelButton
};
