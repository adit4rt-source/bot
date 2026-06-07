// systems/profilePanel.js - Profile Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { db, getOrCreateUser, getUserStat, incrementUserStat, getSetting, getItemCount, addItem, removeItem } = require('../database');
const { getRandomInt } = require('../utils');
const { ACHIEVEMENTS } = require('./achievements');
const { getPetData } = require('./pets');
const { PET_DATA } = require('../data/pets');
const { ITEMS, CRAFT_RECIPES } = require('../data/items');
const { BAIT_TYPES } = require('../data/fish');
const { getNotifSettings } = require('./notifications');
const { getUserTitle, getTitleProgress, formatTitle, formatProgressBar, getAllTitles } = require('./titles');
const ui = require('./ui');

// ============ HELPER: Safe emoji for select-menu options ============
// Discord's .setEmoji() only accepts ONE unicode emoji or a <:name:id> custom
// emoji. Some items store a combined two-emoji string (e.g. '🛡️✨') in `emoji`,
// which throws a shapeshift UnionValidator error. Prefer the single `menuEmoji`,
// and only apply it if it looks valid; otherwise skip the emoji entirely.
function applyMenuEmoji(option, def) {
    const candidate = def.menuEmoji || def.emoji;
    if (!candidate || typeof candidate !== 'string') return option;
    // Custom emoji format <:name:id> / <a:name:id>
    if (/^<a?:\w+:\d+>$/.test(candidate)) return option.setEmoji(candidate);
    // Single unicode emoji: use Intl segmenter to count grapheme clusters when available.
    let graphemes;
    try {
        graphemes = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(candidate)].length;
    } catch (e) {
        graphemes = Array.from(candidate).length; // fallback (rough)
    }
    if (graphemes !== 1) return option; // multi-emoji or weird string → skip emoji
    try { return option.setEmoji(candidate); } catch (e) { return option; }
}


// ============ BUILD: Main Profile Panel ============
function buildProfilePanel(guildId, userId, username, member) {
    const userData = getOrCreateUser(guildId, userId);
    const targetXp = (userData.level + 1) * 100;

    const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId);
    const streakCount = sData ? sData.count : 0;
    const streakEmoji = getSetting(guildId, 'streak_emoji', '🔥');

    const userAchs = db.prepare('SELECT * FROM achievements WHERE guildId = ? AND userId = ?').all(guildId, userId);
    const totalBadges = userAchs.length;

    const activePet = getPetData(guildId, userId);
    const petInfo = activePet ? (() => { const pd = PET_DATA.find(p => p.id === activePet.petId); return pd ? `${pd.emoji} **${activePet.name}** (Lv.${activePet.level})` : '🐾 Pet'; })() : '*Belum punya pet*';

    const fishCaught = getUserStat(guildId, userId, 'total_fish_caught') || 0;
    const harvests = getUserStat(guildId, userId, 'total_harvests') || 0;
    const questsDone = getUserStat(guildId, userId, 'total_quests_done') || 0;

    // Get achievement title
    const achievementTitleRow = db.prepare('SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = ?').get(guildId, userId, 'achievement_title');
    const achievementTitle = achievementTitleRow ? achievementTitleRow.stat_value : null;
    const titleLine = achievementTitle ? `\n🏆 **Title:** ${achievementTitle}` : '';

    // Get rank title from score
    const rankTitle = getUserTitle(guildId, userId);
    const titleProgress = getTitleProgress(guildId, userId);
    const rankLine = `\n${rankTitle.emoji} **Rank:** ${rankTitle.name}`;
    const progressLine = titleProgress.next
        ? `\n> ${formatProgressBar(titleProgress.progress)} ${titleProgress.progress}% → ${titleProgress.next.emoji} ${titleProgress.next.name} (${titleProgress.remaining.toLocaleString('id-ID')} pts lagi)`
        : `\n> ${formatProgressBar(100)} **MAX RANK!** ⭐ ${titleProgress.score.toLocaleString('id-ID')} pts`;

    const embed = new EmbedBuilder()
        .setTitle(ui.title('📋', 'PROFIL', username))
        .setColor(rankTitle.color || ui.COLORS.profile)
        .setThumbnail(member ? member.displayAvatarURL({ dynamic: true, size: 256 }) : null)
        .setDescription(
            ui.statBlock([
                `🏅 **Level** \`${userData.level}\`  •  ${ui.money(userData.balance)}`,
                `${streakEmoji} **Streak** \`${streakCount} Hari\`${titleLine}${rankLine}${progressLine}`,
                `✨ **EXP:** ${ui.progressLine(userData.xp, targetXp, 10, 'arrow')} (${userData.xp}/${targetXp})`,
                `🏆 **Badge:** ${totalBadges}/${ACHIEVEMENTS.length}  •  🐾 **Pet:** ${petInfo}`,
            ]) +
            `\n> 🎣 Ikan ditangkap: **${fishCaught}**  •  🌾 Panen: **${harvests}**  •  📋 Quest selesai: **${questsDone}**`
        )
        .setFooter({ text: ui.footer('Klik tombol di bawah untuk Achievement, Inventory, Rank, & lainnya') })
        .setTimestamp();

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`profpnl_achievement_${userId}`).setLabel('🏆 Achievement').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`profpnl_inventory_${userId}`).setLabel('🎒 Inventory').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`profpnl_rank_${userId}`).setLabel('🏅 Rank').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`profpnl_stats_${userId}`).setLabel('📊 Stats').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`profpnl_notifs_${userId}`).setLabel('🔔 Notifs').setStyle(ButtonStyle.Secondary)
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
            const catIcon = { Social: '\ud83d\udcac', Economy: '\ud83d\udcb0', Level: '\ud83d\udcc8', Streak: '\ud83d\udd25', Gambling: '\ud83c\udfb0', Events: '\ud83c\udfae', Voice: '\ud83c\udf99\ufe0f', Quest: '\ud83d\udcdc', Special: '\u2728', Fishing: '\ud83c\udfa3', Farming: '\ud83c\udf3e', Battle: '\u2694\ufe0f', Mining: '\u26cf\ufe0f' }[cat] || '\ud83d\udcc1';
            desc += `${catIcon} **${cat}** (${catUnlocked}/${catAchs.length})\n`;
        }
        if (desc.length > 4000) desc = desc.substring(0, 3990) + '\n*...dan lainnya*';

        const embed = new EmbedBuilder()
            .setTitle(`\ud83c\udfc6 Achievement \u2014 ${interaction.user.username}`)
            .setColor('#FFD700')
            .setDescription(desc)
            .setFooter({ text: 'Klik kembali untuk lihat per kategori' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }


    // === INVENTORY ===
    if (action === 'inventory') {
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
            .setFooter({ text: 'Pilih item dari menu di bawah untuk menggunakan' });

        const components = [];

        // Build select menu for usable items
        const usableItems = ownedItems.filter(inv => {
            const def = ITEMS.find(i => i.id === inv.itemId);
            if (!def) return false;
            if (['refine_stone', 'protection_stone'].includes(def.id)) return false;
            return true;
        });

        if (usableItems.length > 0) {
            const useMenu = new StringSelectMenuBuilder()
                .setCustomId(`profpnl_useitem_${userId}`)
                .setPlaceholder('\ud83c\udf92 Pilih item untuk digunakan...')
                .setMinValues(1).setMaxValues(1);

            usableItems.slice(0, 25).forEach(inv => {
                const def = ITEMS.find(i => i.id === inv.itemId);
                if (!def) return;
                useMenu.addOptions(applyMenuEmoji(new StringSelectMenuOptionBuilder()
                    .setLabel(`${def.name} (x${inv.quantity})`)
                    .setValue(def.id)
                    .setDescription((def.desc || ' ').substring(0, 50)), def));
            });
            components.push(new ActionRowBuilder().addComponents(useMenu));
        }

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`profpnl_craft_${userId}`).setLabel('\ud83d\udd28 Craft').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        components.push(backRow);

        return interaction.update({ embeds: [embed], components });
    }

    // === CRAFT (Non-Farm item crafting) ===
    if (action === 'craft') {
        let desc = '**🔨 CRAFTING RECIPES**\n\n';
        CRAFT_RECIPES.forEach(recipe => {
            const canCraft = recipe.ingredients.every(ing => getItemCount(guildId, userId, ing.id) >= ing.qty);
            const statusIcon = canCraft ? '✅' : '❌';
            desc += `${statusIcon} ${recipe.emoji} **${recipe.name}**\n> ${recipe.desc}\n`;
            recipe.ingredients.forEach(ing => {
                const def = ITEMS.find(i => i.id === ing.id);
                const have = getItemCount(guildId, userId, ing.id);
                desc += `>  ┗ ${def ? def.emoji : '📦'} ${def ? def.name : ing.id}: ${have}/${ing.qty}\n`;
            });
            desc += '\n';
        });

        const embed = new EmbedBuilder()
            .setTitle(`🔨 Crafting — ${interaction.user.username}`)
            .setColor('#9B59B6')
            .setDescription(desc)
            .setFooter({ text: 'Pilih resep di bawah untuk craft' });

        const components = [];

        // Build select menu for craftable recipes
        const craftableRecipes = CRAFT_RECIPES.filter(r => r.ingredients.every(ing => getItemCount(guildId, userId, ing.id) >= ing.qty));
        if (craftableRecipes.length > 0) {
            const craftMenu = new StringSelectMenuBuilder()
                .setCustomId(`profpnl_craftitem_${userId}`)
                .setPlaceholder('🔨 Pilih resep untuk craft...')
                .setMinValues(1).setMaxValues(1);

            craftableRecipes.forEach(recipe => {
                craftMenu.addOptions(applyMenuEmoji(new StringSelectMenuOptionBuilder()
                    .setLabel(recipe.name)
                    .setValue(recipe.id)
                    .setDescription((recipe.desc || ' ').substring(0, 50)), recipe));
            });
            components.push(new ActionRowBuilder().addComponents(craftMenu));
        }

        const craftBackRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`profpnl_inventory_${userId}`).setLabel('🎒 Inventory').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        components.push(craftBackRow);

        return interaction.update({ embeds: [embed], components });
    }

    // === RANK TITLE ===
    if (action === 'rank') {
        const titleInfo = getTitleProgress(guildId, userId);
        const allTitles = getAllTitles();
        
        let desc = `**⭐ Score Kamu:** \`${titleInfo.score.toLocaleString('id-ID')}\` pts\n`;
        desc += `**${titleInfo.current.emoji} Rank:** ${titleInfo.current.name}\n`;
        if (titleInfo.next) {
            desc += `**Next:** ${titleInfo.next.emoji} ${titleInfo.next.name} (butuh ${titleInfo.remaining.toLocaleString('id-ID')} pts lagi)\n`;
            desc += `> ${formatProgressBar(titleInfo.progress)} **${titleInfo.progress}%**\n`;
        } else {
            desc += `> 🏆 **RANK TERTINGGI TERCAPAI!**\n`;
        }
        desc += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
        desc += `**📋 Semua Rank:**\n\n`;
        
        allTitles.forEach((tier, i) => {
            const isCurrent = tier.id === titleInfo.current.id;
            const isUnlocked = titleInfo.score >= tier.minScore;
            const marker = isCurrent ? ' ◀ *KAMU*' : '';
            const lock = isUnlocked ? '✅' : '🔒';
            desc += `${lock} ${tier.emoji} **${tier.name}** — ${tier.minScore.toLocaleString('id-ID')}+ pts${marker}\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle(`🏅 Rank System — ${interaction.user.username}`)
            .setColor(titleInfo.current.color || '#FFD700')
            .setDescription(desc)
            .setFooter({ text: 'Score = Level×150 + Money/20 + Fish×3 + Farm×4 + Craft×8 + Streak×12 + Pet×5 + Dungeon×6 + Boss×15 + PvP×10 + Badge×20 + Gambling×2' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`profpnl_streak_${userId}`).setLabel('🔥 Streak').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === STREAK ===
    if (action === 'streak') {
        const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId);
        const streakCount = sData ? sData.count : 0;
        const lastDate = (sData && sData.last_date) ? sData.last_date : 'Belum pernah';
        const currentMonth = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).substring(0, 7);
        const restoreRow = db.prepare('SELECT count FROM streak_restores WHERE guildId = ? AND userId = ? AND month = ?').get(guildId, userId, currentMonth);
        const restoreCount = restoreRow ? restoreRow.count : 0;
        const streakEmoji = getSetting(guildId, 'streak_emoji', '\ud83d\udd25');

        const embed = new EmbedBuilder()
            .setTitle(`${streakEmoji} Streak Info \u2014 ${interaction.user.username}`)
            .setColor('#E74C3C')
            .setDescription(
                `> ${streakEmoji} **Streak:** ${streakCount} hari\n` +
                `> \ud83d\udcc5 **Last Active:** ${lastDate}\n` +
                `> \u267b\ufe0f **Restore Used:** ${restoreCount}/3 bulan ini\n\n` +
                `*Ketik pesan setiap hari untuk menjaga streak!*\n` +
                `*Jika streak terputus, klik \u267b\ufe0f Restore (maks 3x/bulan).*`
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`profpnl_streakrestore_${userId}`).setLabel('\u267b\ufe0f Restore Streak').setStyle(ButtonStyle.Success).setDisabled(restoreCount >= 3),
            new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === STREAK RESTORE (user self-service, max 3x/month) ===
    if (action === 'streakrestore') {
        const currentMonth = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).substring(0, 7);
        const restoreData = db.prepare('SELECT * FROM streak_restores WHERE guildId = ? AND userId = ? AND month = ?').get(guildId, userId, currentMonth);
        const restoreCount = restoreData ? restoreData.count : 0;
        if (restoreCount >= 3) return interaction.reply({ content: '\u274c Batas restore (3x) bulan ini sudah habis!', ephemeral: true });
        const history = db.prepare('SELECT * FROM streak_history WHERE guildId = ? AND userId = ?').get(guildId, userId);
        if (!history || history.lost_count <= 1) return interaction.reply({ content: '\u274c Tidak ada streak terputus yang bisa dipulihkan.', ephemeral: true });
        const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId);
        const currentCount = sData ? sData.count : 0;
        const newCount = history.lost_count + currentCount;
        db.prepare('UPDATE streaks SET count = ? WHERE guildId = ? AND userId = ?').run(newCount, guildId, userId);
        db.prepare('DELETE FROM streak_history WHERE guildId = ? AND userId = ?').run(guildId, userId);
        if (restoreData) db.prepare('UPDATE streak_restores SET count = count + 1 WHERE guildId = ? AND userId = ? AND month = ?').run(guildId, userId, currentMonth);
        else db.prepare('INSERT INTO streak_restores (guildId, userId, month, count) VALUES (?, ?, ?, 1)').run(guildId, userId, currentMonth);
        const streakEmoji = getSetting(guildId, 'streak_emoji', '\ud83d\udd25');
        const embed = new EmbedBuilder()
            .setTitle(`${streakEmoji} Streak Dipulihkan!`)
            .setColor('#2ECC71')
            .setDescription(`\u2705 Streak kamu dipulihkan menjadi **${newCount} hari**!\n> \u267b\ufe0f Sisa restore bulan ini: **${2 - restoreCount}x**`);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`profpnl_streak_${userId}`).setLabel(`${streakEmoji} Streak`).setStyle(ButtonStyle.Primary),
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

    // === NOTIFICATIONS ===
    if (action === 'notifs') {
        const settings = getNotifSettings(guildId, userId);
        const embed = new EmbedBuilder()
            .setTitle('\ud83d\udd14 Notification Settings')
            .setColor('#F39C12')
            .setDescription(
                `${settings.notif_daily ? '\u2705' : '\u274c'} Daily Reminder\n` +
                `${settings.notif_quest ? '\u2705' : '\u274c'} Quest Complete\n` +
                `${settings.notif_trade ? '\u2705' : '\u274c'} Trade & Market\n` +
                `${settings.notif_pet ? '\u2705' : '\u274c'} Pet Warnings\n` +
                `${settings.notif_farm ? '\u2705' : '\u274c'} Farm Harvest\n\n` +
                `\ud83d\udca1 *Klik tombol untuk toggle on/off*`
            );
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`notif_toggle_daily_${userId}`).setLabel(`${settings.notif_daily ? '\u2705' : '\u274c'} Daily`).setStyle(settings.notif_daily ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`notif_toggle_quest_${userId}`).setLabel(`${settings.notif_quest ? '\u2705' : '\u274c'} Quest`).setStyle(settings.notif_quest ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`notif_toggle_trade_${userId}`).setLabel(`${settings.notif_trade ? '\u2705' : '\u274c'} Trade`).setStyle(settings.notif_trade ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`notif_toggle_pet_${userId}`).setLabel(`${settings.notif_pet ? '\u2705' : '\u274c'} Pet`).setStyle(settings.notif_pet ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`notif_toggle_farm_${userId}`).setLabel(`${settings.notif_farm ? '\u2705' : '\u274c'} Farm`).setStyle(settings.notif_farm ? ButtonStyle.Success : ButtonStyle.Secondary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }
}

// ============ UTILITY: Detection helper ============
function isProfilePanelButton(customId) {
    return customId.startsWith('profpnl_') && !customId.startsWith('profpnl_useitem_');
}

function isProfilePanelSelectMenu(customId) {
    return customId.startsWith('profpnl_useitem_') || customId.startsWith('profpnl_craftitem_');
}

// ============ HANDLER: Profile panel select menu (Use Item & Craft) ============
async function handleProfileSelectMenu(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const userId = customId.split('_').pop();

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '\u274c Ini bukan panel profil kamu!', ephemeral: true });
    }

    // === CRAFT ITEM SELECT ===
    if (customId.startsWith('profpnl_craftitem_')) {
        const recipeId = interaction.values[0];
        const recipe = CRAFT_RECIPES.find(r => r.id === recipeId);
        if (!recipe) return interaction.reply({ content: '❌ Resep tidak ditemukan!', ephemeral: true });

        // Verify ingredients
        const missing = [];
        for (const ing of recipe.ingredients) {
            const have = getItemCount(guildId, userId, ing.id);
            if (have < ing.qty) {
                const def = ITEMS.find(i => i.id === ing.id);
                missing.push(`${def ? def.emoji : '📦'} ${def ? def.name : ing.id}: ${have}/${ing.qty}`);
            }
        }
        if (missing.length > 0) {
            return interaction.reply({ content: `❌ Bahan kurang!\n${missing.join('\n')}`, ephemeral: true });
        }

        // Consume ingredients
        for (const ing of recipe.ingredients) {
            removeItem(guildId, userId, ing.id, ing.qty);
        }

        // Give result
        let resultMsg = '';
        if (recipe.result.type === 'item') {
            addItem(guildId, userId, recipe.result.id, recipe.result.qty);
            const resDef = ITEMS.find(i => i.id === recipe.result.id);
            resultMsg = `${resDef ? resDef.emoji : '📦'} **${resDef ? resDef.name : recipe.result.id}** x${recipe.result.qty}`;
        } else if (recipe.result.type === 'bait') {
            // Add bait to fish equipment
            const eq = db.prepare('SELECT * FROM fish_equipment WHERE guildId = ? AND userId = ?').get(guildId, userId);
            if (eq && eq.bait === recipe.result.id) {
                db.prepare('UPDATE fish_equipment SET bait_count = bait_count + ? WHERE guildId = ? AND userId = ?').run(recipe.result.qty, guildId, userId);
            } else {
                // Store as item for now (bait tokens)
                const baitDef = BAIT_TYPES ? BAIT_TYPES.find(b => b.id === recipe.result.id) : null;
                resultMsg = `🎣 **${baitDef ? baitDef.name : recipe.result.id}** x${recipe.result.qty} (pasang di Fishing Panel)`;
                // Add to bait count directly
                if (!eq) {
                    db.prepare('INSERT INTO fish_equipment (guildId, userId, bait, bait_count) VALUES (?, ?, ?, ?)').run(guildId, userId, recipe.result.id, recipe.result.qty);
                } else {
                    db.prepare('UPDATE fish_equipment SET bait = ?, bait_count = bait_count + ? WHERE guildId = ? AND userId = ?').run(recipe.result.id, recipe.result.qty, guildId, userId);
                }
            }
            const baitDef = BAIT_TYPES ? BAIT_TYPES.find(b => b.id === recipe.result.id) : null;
            resultMsg = `🎣 **${baitDef ? baitDef.name : recipe.result.id}** x${recipe.result.qty}`;
        } else if (recipe.result.type === 'money') {
            db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(recipe.result.amount, guildId, userId);
            resultMsg = `🪙 **${recipe.result.amount.toLocaleString('id-ID')}** money`;
        }

        incrementUserStat(guildId, userId, 'total_crafts');

        const embed = new EmbedBuilder()
            .setTitle('✅ Craft Berhasil!')
            .setColor('#9B59B6')
            .setDescription(`${recipe.emoji} **${recipe.name}**\n\n> Hasil: ${resultMsg}`)
            .setFooter({ text: recipe.desc });

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`profpnl_craft_${userId}`).setLabel('🔨 Craft Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );

        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    // === USE ITEM SELECT ===
    const selectedItemId = interaction.values[0];
    const itemDef = ITEMS.find(i => i.id === selectedItemId);
    if (!itemDef) {
        return interaction.reply({ content: '\u274c Item tidak ditemukan!', ephemeral: true });
    }

    // Check if user owns the item
    const qty = getItemCount(guildId, userId, selectedItemId);
    if (qty <= 0) {
        return interaction.reply({ content: '\u274c Kamu tidak memiliki item ini!', ephemeral: true });
    }

    // Items that cannot be used directly
    if (['refine_stone', 'protection_stone'].includes(selectedItemId)) {
        return interaction.reply({ content: '\u26a0\ufe0f Item ini **tidak bisa digunakan langsung**.\n> Digunakan otomatis saat refine di `/pet` \u2192 Refine.', ephemeral: true });
    }

    let resultMsg = '';
    const userData = getOrCreateUser(guildId, userId);

    // ---- ITEM EFFECTS ----
    switch (selectedItemId) {
        case 'xp_booster_2x': {
            const until = Date.now() + 3600000;
            db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, 'xp_boost_2x_until', until);
            resultMsg = `\u26a1 **XP Booster 2x** aktif!\n> Double XP selama **1 jam** (sampai <t:${Math.floor(until / 1000)}:T>)`;
            break;
        }
        case 'xp_booster_3x': {
            const until = Date.now() + 3600000;
            db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, 'xp_boost_3x_until', until);
            resultMsg = `\u26a1 **XP Booster 3x** aktif!\n> Triple XP selama **1 jam** (sampai <t:${Math.floor(until / 1000)}:T>)`;
            break;
        }
        case 'streak_shield': {
            db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, 'streak_shield_active', 1);
            resultMsg = `\ud83d\udee1\ufe0f **Streak Shield** aktif!\n> Streak kamu terlindungi jika skip 1 hari.`;
            break;
        }
        case 'lucky_charm': {
            db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, 'lucky_charm_active', 1);
            resultMsg = `\ud83c\udf40 **Lucky Charm** aktif!\n> +15% chance menang di semua game.`;
            break;
        }
        case 'money_magnet': {
            const until = Date.now() + 3600000;
            db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, 'money_magnet_until', until);
            resultMsg = `\ud83e\uddf2 **Money Magnet** aktif!\n> +50% money dari semua sumber selama **1 jam** (sampai <t:${Math.floor(until / 1000)}:T>)`;
            break;
        }
        case 'daily_doubler': {
            incrementUserStat(guildId, userId, 'daily_doubler_active', 1);
            resultMsg = `\ud83d\udcc5 **Daily Doubler** aktif!\n> /daily reward berikutnya akan digandakan.`;
            break;
        }
        case 'tax_free_voucher': {
            incrementUserStat(guildId, userId, 'tax_free_voucher', 1);
            resultMsg = `\ud83e\uddfe **Tax-Free Voucher** aktif!\n> Gift berikutnya tanpa pajak (sekali pakai).`;
            break;
        }
        case 'lucky_spin_token': {
            incrementUserStat(guildId, userId, 'lucky_spin_active', 1);
            resultMsg = `\ud83c\udfab **Lucky Spin Token** aktif!\n> Slot berikutnya dijamin minimal 2 simbol sama.`;
            break;
        }
        case 'mystery_box': {
            // Daily limit: 5 per day
            const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
            const mboxKey = `mbox_${today}`;
            const mboxUsed = getUserStat(guildId, userId, mboxKey);
            if (mboxUsed >= 5) {
                return interaction.reply({ content: '\ud83d\udce6 **Mystery Box** sudah mencapai limit harian (5/5)!\n> Coba lagi besok.', ephemeral: true });
            }

            // Roll: 50% → 50-200, 30% → 200-500, 15% → 500-1000, 5% → 1000-2000
            const roll = Math.random() * 100;
            let money;
            if (roll < 50) {
                money = getRandomInt(50, 200);
            } else if (roll < 80) {
                money = getRandomInt(200, 500);
            } else if (roll < 95) {
                money = getRandomInt(500, 1000);
            } else {
                money = getRandomInt(1000, 2000);
            }

            db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(money, guildId, userId);
            incrementUserStat(guildId, userId, mboxKey, 1);
            const tierEmoji = money >= 1000 ? '\ud83c\udf1f' : money >= 500 ? '\u2728' : money >= 200 ? '\ud83d\udcab' : '\ud83d\udce6';
            resultMsg = `\ud83d\udce6 **Mystery Box** dibuka!\n> ${tierEmoji} Kamu mendapat \ud83e\ude99 **${money.toLocaleString('id-ID')}** money!\n> Limit hari ini: ${mboxUsed + 1}/5`;
            break;
        }
        case 'auto_harvest_pass': {
            // Set auto_harvest table
            db.prepare('INSERT OR REPLACE INTO auto_harvest (guildId, userId, purchased, enabled) VALUES (?, ?, 1, 1)').run(guildId, userId);
            resultMsg = `\ud83d\udd14 **Auto-Harvest Pass** diaktifkan!\n> Kamu akan mendapat notifikasi saat tanaman siap panen.`;
            break;
        }
        default:
            return interaction.reply({ content: '\u274c Item ini tidak bisa digunakan dari sini.', ephemeral: true });
    }

    // Consume item (1 unit)
    removeItem(guildId, userId, selectedItemId, 1);

    // Build result embed
    const resultEmbed = new EmbedBuilder()
        .setTitle(`\u2705 Item Digunakan!`)
        .setColor('#2ECC71')
        .setDescription(resultMsg)
        .setFooter({ text: `${itemDef.emoji} ${itemDef.name} \u2014 Sisa: ${qty - 1}` })
        .setTimestamp();

    // Rebuild inventory panel after use
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
    const invEmbed = new EmbedBuilder()
        .setTitle(`\ud83c\udf92 Inventory \u2014 ${interaction.user.username}`)
        .setColor('#3498DB')
        .setDescription(desc)
        .setFooter({ text: 'Pilih item dari menu di bawah untuk menggunakan' });

    const components = [];

    // Rebuild select menu
    const usableItems = ownedItems.filter(inv => {
        const def = ITEMS.find(i => i.id === inv.itemId);
        if (!def) return false;
        if (['refine_stone', 'protection_stone'].includes(def.id)) return false;
        return true;
    });

    if (usableItems.length > 0) {
        const useMenu = new StringSelectMenuBuilder()
            .setCustomId(`profpnl_useitem_${userId}`)
            .setPlaceholder('\ud83c\udf92 Pilih item untuk digunakan...')
            .setMinValues(1).setMaxValues(1);

        usableItems.slice(0, 25).forEach(inv => {
            const def = ITEMS.find(i => i.id === inv.itemId);
            if (!def) return;
            useMenu.addOptions(applyMenuEmoji(new StringSelectMenuOptionBuilder()
                .setLabel(`${def.name} (x${inv.quantity})`)
                .setValue(def.id)
                .setDescription((def.desc || ' ').substring(0, 50)), def));
        });
        components.push(new ActionRowBuilder().addComponents(useMenu));
    }

    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
    );
    components.push(backRow);

    // Update the panel and send result as ephemeral follow-up
    await interaction.update({ embeds: [invEmbed], components });
    await interaction.followUp({ embeds: [resultEmbed], ephemeral: true });
}

module.exports = {
    buildProfilePanel,
    handleProfilePanelCommand,
    handleProfileButton,
    handleProfileSelectMenu,
    isProfilePanelButton,
    isProfilePanelSelectMenu
};
