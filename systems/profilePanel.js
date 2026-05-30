// systems/profilePanel.js - Profile Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { db, getOrCreateUser, getUserStat, incrementUserStat, getSetting, getItemCount, addItem, removeItem } = require('../database');
const { getRandomInt } = require('../utils');
const { ACHIEVEMENTS } = require('./achievements');
const { getPetData } = require('./pets');
const { PET_DATA } = require('../data/pets');
const { ITEMS } = require('../data/items');
const { getNotifSettings } = require('./notifications');


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

    // Get achievement title
    const achievementTitleRow = db.prepare('SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = ?').get(guildId, userId, 'achievement_title');
    const achievementTitle = achievementTitleRow ? achievementTitleRow.stat_value : null;
    const titleLine = achievementTitle ? `\n\ud83c\udfc6 **Title:** ${achievementTitle}` : '';

    const embed = new EmbedBuilder()
        .setTitle(`\ud83d\udccb PROFIL \u2014 ${username}`)
        .setColor('#2B2D31')
        .setThumbnail(member ? member.displayAvatarURL({ dynamic: true, size: 256 }) : null)
        .setDescription(
            `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n` +
            `\ud83c\udfc5 **Level** \`${userData.level}\` \u2014 \ud83d\udcb0 **Saldo** \`${userData.balance.toLocaleString('id-ID')}\`\n` +
            `${streakEmoji} **Streak** \`${streakCount} Hari\`${titleLine}\n\n` +
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
        new ButtonBuilder().setCustomId(`profpnl_stats_${userId}`).setLabel('\ud83d\udcca Stats').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`profpnl_notifs_${userId}`).setLabel('\ud83d\udd14 Notifs').setStyle(ButtonStyle.Secondary)
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
                useMenu.addOptions(new StringSelectMenuOptionBuilder()
                    .setLabel(`${def.name} (x${inv.quantity})`)
                    .setValue(def.id)
                    .setDescription(def.desc.substring(0, 50))
                    .setEmoji(def.emoji));
            });
            components.push(new ActionRowBuilder().addComponents(useMenu));
        }

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`profpnl_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
        );
        components.push(backRow);

        return interaction.update({ embeds: [embed], components });
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
                `*Streak restore: hubungi admin server.*`
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
    return customId.startsWith('profpnl_useitem_');
}

// ============ HANDLER: Profile panel select menu (Use Item) ============
async function handleProfileSelectMenu(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const userId = customId.split('_').pop();

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '\u274c Ini bukan panel profil kamu!', ephemeral: true });
    }

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
            useMenu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`${def.name} (x${inv.quantity})`)
                .setValue(def.id)
                .setDescription(def.desc.substring(0, 50))
                .setEmoji(def.emoji));
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
