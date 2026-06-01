// events/interactionCreate.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser, getConf, getSetting, getUserStat, incrementUserStat, addIncome, addSpending, getItemCount, addItem, removeItem, getPetFoodCount, addPetFood, removePetFood, getAllPetFood, getSeedCount, addSeed, removeSeed, getAllSeeds } = require('../database');
const { getRandomInt, replyTemp } = require('../utils');
const state = require('../state');
const { ACHIEVEMENTS, checkAchievements } = require('../systems/achievements');
const { addComboFeature, getComboMultiplier } = require('../systems/combo');
const { getContestState, startFishContest, addContestEntry, getContestLeaderboard } = require('../systems/contest');
const { generatePetStats, simulateBattle, simulatePvP, getPetData, getAllPets, addPetExp, checkPetEvolution, evolvePet } = require('../systems/pets');
const { handlePetCommand, handlePetButton, handlePetSelectMenu, handlePetModal, isPetPanelButton, isPetPanelSelectMenu, isPetPanelModal } = require('../systems/petPanel');
const { handleFishingCommand, handleFishingButton, handleFishingSelectMenu, handleFishingModal, isFishingPanelButton, isFishingPanelSelectMenu, isFishingPanelModal, buildFishingPanel } = require('../systems/fishPanel');
const { handleFarmCommand, handleFarmButton, handleFarmSelectMenu, handleFarmModal, isFarmPanelButton, isFarmPanelSelectMenu, isFarmPanelModal } = require('../systems/farmPanel');
const { handleQuestCommand, handleQuestButton, isQuestPanelButton } = require('../systems/questPanel');
const { handleCasinoCommand, handleCasinoButton, handleCasinoSelectMenu, isCasinoPanelButton, isCasinoPanelSelectMenu } = require('../systems/casinoPanel');
const { handleAdminCommand, handleAdminButton, handleAdminModal, isAdminPanelButton, isAdminPanelModal } = require('../systems/adminPanel');
const { handleEconomyPanelCommand, handleEconomyButton, handleEconomyModal, handleGiftCommand, isEconomyPanelButton, isEconomyPanelModal } = require('../systems/economyPanel');
const { handleProfilePanelCommand, handleProfileButton, handleProfileSelectMenu, isProfilePanelButton, isProfilePanelSelectMenu } = require('../systems/profilePanel');
const { handleLevelPanelCommand, handleLevelButton, isLevelPanelButton } = require('../systems/levelPanel');
const { handleTradeCommand, handleTradeButton, handleTradeSelectMenu, handleTradeModal, isTradePanelButton, isTradePanelSelectMenu, isTradePanelModal } = require('../systems/tradePanel');
const { handleMarketCommand, handleMarketButton, handleMarketSelectMenu, handleMarketModal, isMarketPanelButton, isMarketPanelSelectMenu, isMarketPanelModal } = require('../systems/marketPanel');
const { handleStatsCommand, handleStatsButton, isStatsPanelButton } = require('../systems/statsPanel');
const { handleLeaderboardCommand, handleLeaderboardButton, isLeaderboardButton } = require('../systems/leaderboard');
const { getNotifSettings, toggleNotif } = require('../systems/notifications');
const { catchFish, getEquipment, getPlayerLocation, setPlayerLocation } = require('../systems/fishing');
const { getFarmData, getFarmSlots, getPlots, getStorage, addStorage, removeStorage, getStorageQty } = require('../systems/farming');
const { updateQuestProgress, getOrCreateWeeklyQuests, getWeekId, checkDailyQuestStreak, DIFFICULTY_TIERS } = require('../systems/quests');
const { CALENDAR_REWARDS, getLoginCalendar } = require('../systems/calendar');
const { spinSlot, getSlotResult, GIFT_TAX_RATE, GIFT_RECEIVE_LIMIT_PER_DAY, getGiftReceivedToday, addGiftReceivedToday } = require('../systems/slots');
const { FISH_DATA, FISH_TIERS, BAIT_TYPES, ROD_TYPES, FISHING_LOCATIONS } = require('../data/fish');
const { PET_DATA, PET_FOODS, PET_EGGS, PET_CLASSES, PET_ELEMENTS, PET_EVOLUTIONS, PET_SKILL_MILESTONES, PET_LEVEL_MULTIPLIERS, RELIC_NAMES } = require('../data/pets');
const { ITEMS, CRAFT_RECIPES } = require('../data/items');
const { FARM_LEVELS, FARM_CROPS, FARM_RECIPES, FARM_FERTILIZERS, FARM_DECORATIONS } = require('../data/farming');
const { DUNGEON_TIERS, BOSS_LIST } = require('../data/dungeons');

const { fishCooldowns, activeCoinflips, slashCooldowns, activeMiniEvents, activeFishEvents, activeBossParties } = state;
const { isBlocked, getBlockRemaining, hasPendingCaptcha, shouldTriggerCaptcha, sendCaptcha } = require('../systems/captcha');

module.exports = async function handleInteractionCreate(interaction) {
    if (!interaction.guild) return interaction.reply({content: 'Hanya di Server!', ephemeral: true});
    const guildId = interaction.guild.id;

    // Block command usage in restricted channels
    const blockedChannels = ['1347190409402650736'];
    if (interaction.isChatInputCommand() && blockedChannels.includes(interaction.channelId)) {
        return interaction.reply({ content: '❌ Command bot tidak bisa digunakan di channel ini! Gunakan di channel lain.', ephemeral: true });
    }

    // Autocomplete: no registered command currently uses autocomplete.
    if (interaction.isAutocomplete()) return;

    if (interaction.isChatInputCommand()) {
        const command = interaction.commandName, subCmd = interaction.options.getSubcommand(false), group = interaction.options.getSubcommandGroup(false);
        const cdKey = `${interaction.user.id}_${command}`;
        if (slashCooldowns.has(cdKey) && Date.now() < slashCooldowns.get(cdKey)) return replyTemp(interaction, `⏳ Tunggu **${Math.ceil((slashCooldowns.get(cdKey) - Date.now()) / 1000)} detik** lagi.`);
        slashCooldowns.set(cdKey, Date.now() + 3000);

        // Anti-abuse: block check
        if (isBlocked(guildId, interaction.user.id)) {
            const rem = getBlockRemaining(guildId, interaction.user.id);
            return replyTemp(interaction, `🚫 Kamu diblokir sementara karena gagal verifikasi.\n⏳ Coba lagi dalam **${rem} detik**.`);
        }

        // Anti-abuse: pending captcha check (must answer first)
        if (hasPendingCaptcha(guildId, interaction.user.id)) {
            return replyTemp(interaction, '🔒 Jawab captcha di chat dulu sebelum pakai command!');
        }

        // Anti-abuse: trigger captcha if 15 min active without verification
        if (shouldTriggerCaptcha(guildId, interaction.user.id)) {
            return sendCaptcha(interaction);
        }

        // Track command usage analytics
        try {
            const cmdName = subCmd ? `${command} ${subCmd}` : command;
            db.prepare('INSERT OR REPLACE INTO command_summary (guildId, command, count, lastUsed) VALUES (?, ?, COALESCE((SELECT count FROM command_summary WHERE guildId = ? AND command = ?), 0) + 1, ?)').run(guildId, cmdName, guildId, cmdName, Date.now());
        } catch (e) { /* analytics failure should not block command */ }

        const userData = getOrCreateUser(guildId, interaction.user.id);
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        // === WELCOME / JOIN SERVER PROMPT (once per guild, first command usage) ===
        const welcomeShown = getSetting(guildId, 'welcome_shown', null);
        if (!welcomeShown) {
            db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'welcome_shown', '1');
            const welcomeEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🎉 Terima kasih sudah menggunakan idcommunity Bot!')
                .setDescription(
                    `Hai **${interaction.guild.name}**! Bot ini sekarang aktif di server kalian. 🚀\n\n` +
                    `📢 **Join Official Server** untuk:\n` +
                    `> 🎮 Event & Giveaway eksklusif\n` +
                    `> 🐛 Bug Report & Support\n` +
                    `> 📦 Update & fitur terbaru\n` +
                    `> 💬 Komunitas player lain\n\n` +
                    `Gunakan \`/help\` atau \`/menu\` untuk mulai! 🍀`
                )
                .setThumbnail(interaction.client.user.displayAvatarURL({ size: 256 }))
                .setFooter({ text: 'idcommunity Bot — Economy & RPG' })
                .setTimestamp();
            const welcomeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('🔗 Join Official Server').setStyle(ButtonStyle.Link).setURL('https://discord.gg/idcommunity'),
                new ButtonBuilder().setLabel('📖 Help').setCustomId('welcome_help').setStyle(ButtonStyle.Secondary)
            );
            interaction.channel.send({ embeds: [welcomeEmbed], components: [welcomeRow] }).catch(() => {});
        }

        if (command === 'help') {
            const helpEmbed = new EmbedBuilder().setTitle('📖 Panduan Lengkap Bot').setColor('#5865F2').setDescription('Semua fitur kini berbasis **panel interaktif** — cukup jalankan command lalu pakai tombol/menu!\nGunakan `/menu` untuk navigasi cepat.\n\n**Daftar Command:**').addFields(
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '💰 **EKONOMI & CASINO**', inline: false },
                { name: '\u200b', value: `> \`/wallet\` — 💰 Economy Panel (saldo, gift, redeem voucher)\n> \`/casino\` — 🎰 Casino Panel (coinflip, slot, roulette)\n> \`/daily\` — 🎁 Klaim hadiah harian\n> \`/calendar\` — 📅 Kalender login & reward\n> \`/shop\` — 🛒 Toko lengkap\n> \`/trade\` — 🤝 Trade item antar pemain\n> \`/market\` — 🏪 Marketplace jual/beli`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🎣 **FISHING** (`/fish` + `/fishing`)', inline: false },
                { name: '\u200b', value: `> \`/fish\` — Lempar pancing (quick cast)\n> \`/fishing\` — 🎣 Fishing Panel\n> Panel: Cast, Inventory, Shop, Stats, Collection, Lokasi`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🌾 **FARMING** (`/farm`)', inline: false },
                { name: '\u200b', value: `> \`/farm\` — 🌾 Farm Panel\n> Panel: Plant, Water, Harvest, Craft, Shop, Upgrade, Storage`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🐾 **PET & BATTLE** (`/pet` + `/battle`)', inline: false },
                { name: '\u200b', value: `> \`/pet\` — 🐾 Pet Panel (button-based)\n> Feed, Play, Hunt, Shop, Dungeon, Boss, Refine, **Evolve**\n> Semua diakses dari panel interaktif!\n> \`/battle @user\` — ⚔️ PvP auto-battle`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '📋 **PROFIL & QUEST**', inline: false },
                { name: '\u200b', value: `> \`/profile\` — 📋 Profile Panel (profil, badge, inventory, streak, stats)\n> \`/quest\` — 📜 Quest Panel (Daily & Weekly)\n> \`/levelpanel\` — 🌟 Level Panel (rank, leaderboard)\n> \`/stats\` — 📊 Stats Dashboard`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🎮 **EVENTS & VOICE**', inline: false },
                { name: '\u200b', value: `> 🎮 **Mini-Event** muncul setiap 30 pesan\n> 🎣 **Fishing Tournament** setiap 100 pesan\n> 🎶 **Temp Voice** — Buat voice privat`, inline: false }
            );
            if (isAdmin) helpEmbed.addFields({ name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🛡️ **ADMIN**', inline: false }, { name: '\u200b', value: `> \`/admin\` — 🛡️ Admin Panel (semua pengaturan dalam 1 panel)\n> Notifikasi channel, Temp Voice, Kelola Shop & Voucher,\n> Pengaturan XP/Level, Kelola Money & Streak user, Contest`, inline: false });
            helpEmbed.setFooter({ text: '💡 /menu navigasi | /leaderboard ranking | /gift kirim money | discord.gg/idcommunity', iconURL: interaction.client.user.displayAvatarURL() }).setTimestamp();
            return interaction.reply({ embeds: [helpEmbed] });
        }

        // ================= MENU HUB =================
        if (command === 'menu') {
            const menuEmbed = new EmbedBuilder()
                .setTitle('📱 Menu Utama')
                .setColor('#5865F2')
                .setDescription(`Halo **${interaction.user.username}**! Pilih kategori di bawah:\n\n💰 **Economy** — Balance, Coinflip, Slot, Gift, Redeem\n🎣 **Fishing** — Mancing, Jual, Koleksi\n🌾 **Farming** — Tanam, Panen, Craft\n🐾 **Pet & Battle** — Pet, Dungeon, Boss, PvP\n📋 **Profil** — Profile, Achievement, Quest, Streak\n🛒 **Shop** — Beli item, rod, bibit, pet\n\n*Gunakan tombol di bawah untuk akses cepat!*`)
                .setFooter({ text: `💰 Saldo: ${userData.balance.toLocaleString('id-ID')} | Lv.${userData.level}` })
                .setTimestamp();
            
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('menu_economy').setLabel('💰 Economy').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('menu_fishing').setLabel('🎣 Fishing').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('menu_farming').setLabel('🌾 Farming').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('menu_pet').setLabel('🐾 Pet & Battle').setStyle(ButtonStyle.Primary)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('menu_profile').setLabel('📋 Profil').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('menu_shop').setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('menu_daily').setLabel('🎁 Daily').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('menu_quest').setLabel('📜 Quest').setStyle(ButtonStyle.Secondary)
            );
            return interaction.reply({ embeds: [menuEmbed], components: [row1, row2] });
        }

        if (command === 'daily') {
            const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
            if (userData.lastDaily === today) return interaction.reply({ content: '⏳ Sudah klaim hari ini! Tunggu besok (00:00 WIB).', ephemeral: true });
            const streakData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id);
            const streak = streakData ? streakData.count : 0;
            const week = Math.floor(streak / 7);
            const dayInCycle = (streak % 7);
            let moneyReward = 500 + (dayInCycle * 100) + (week * 200);
            let petExpReward = 10 + Math.min(week * 5, 30);
            let bonusDesc = '';
            let isWeekBonus = (streak > 0 && streak % 7 === 0);
            if (isWeekBonus) { moneyReward += 1000; addItem(guildId, interaction.user.id, 'mystery_box', 1); bonusDesc += '> 🎉 **STREAK BONUS MINGGUAN!** +1.000 + 📦 Mystery Box!\n'; }
            if (streak > 0 && streak % 30 === 0) { moneyReward += 3000; addItem(guildId, interaction.user.id, 'rod_part', 3); bonusDesc += '> 🏆 **STREAK 30 HARI!** +3.000 + 🔧 Rod Parts x3!\n'; }
            const hasDoubler = getUserStat(guildId, interaction.user.id, 'daily_doubler_active') > 0;
            if (hasDoubler) { moneyReward *= 2; incrementUserStat(guildId, interaction.user.id, 'daily_doubler_active', -1); bonusDesc += '> 📅 **Daily Doubler** aktif! Money x2!\n'; }
            const roll = Math.random();
            let randomReward = '';
            if (roll < 0.15) { const possibleItems = ['mystery_box', 'lucky_charm', 'xp_booster_2x']; const wonItem = possibleItems[Math.floor(Math.random() * possibleItems.length)]; const itemDef = ITEMS.find(i => i.id === wonItem); addItem(guildId, interaction.user.id, wonItem); randomReward = `\n> 🎁 **Bonus Item:** ${itemDef.emoji} ${itemDef.name}!`; }
            else if (roll < 0.35) { const extra = getRandomInt(100, 500); moneyReward += extra; randomReward = `\n> 💰 **Bonus Money:** +${extra} extra!`; }
            else if (roll < 0.50) { petExpReward += 15; randomReward = `\n> 🐾 **Bonus Pet EXP:** +15 extra!`; }
            db.prepare('UPDATE users SET balance = balance + ?, lastDaily = ? WHERE guildId = ? AND userId = ?').run(moneyReward, today, guildId, interaction.user.id);
            incrementUserStat(guildId, interaction.user.id, 'total_dailies');
            addIncome(guildId, interaction.user.id, 'daily', moneyReward);
            addPetExp(guildId, interaction.user.id, petExpReward);
            await checkAchievements(interaction.guild, interaction.user.id, { type: 'daily' });
            const nextDayReward = 500 + (((dayInCycle + 1) % 7) * 100) + ((dayInCycle === 6 ? week + 1 : week) * 200);
            const progressBar = '▰'.repeat(Math.min(dayInCycle + 1, 7)) + '▱'.repeat(Math.max(0, 6 - dayInCycle));
            const embed = new EmbedBuilder()
                .setColor(isWeekBonus ? '#FFD700' : '#F1C40F')
                .setTitle(isWeekBonus ? '🎉 Daily Reward — WEEKLY BONUS!' : '🎁 Daily Reward!')
                .setDescription(`${bonusDesc}> 🪙 **Money:** +${moneyReward.toLocaleString('id-ID')}\n> 🐾 **Pet EXP:** +${petExpReward}\n> ✨ **XP Bonus:** +15${randomReward}\n\n> 🔥 **Streak:** ${streak} hari\n> 📈 **Minggu ini:** \`${progressBar}\` (${dayInCycle + 1}/7)\n> 💡 **Besok:** 🪙 ~${nextDayReward.toLocaleString('id-ID')}${dayInCycle === 6 ? ' + 🎉 BONUS!' : ''}`)
                .setFooter({ text: 'Login setiap hari = reward makin besar! | Reset jika streak putus' })
                .setTimestamp();
            
            // Bonus XP from daily
            const user = getOrCreateUser(guildId, interaction.user.id);
            user.xp += 15;
            db.prepare('UPDATE users SET xp = ? WHERE guildId = ? AND userId = ?').run(user.xp, guildId, interaction.user.id);
            
            return interaction.reply({ embeds: [embed] });
        }

        // ================= FISHING COMMANDS =================
        if (command === 'fish') {
            const cdKey = `fish_${guildId}_${interaction.user.id}`;
            const eq = getEquipment(guildId, interaction.user.id);
            const rod = ROD_TYPES.find(r => r.id === eq.rod) || ROD_TYPES[0];
            if (fishCooldowns.has(cdKey) && Date.now() < fishCooldowns.get(cdKey)) { const remaining = Math.ceil((fishCooldowns.get(cdKey) - Date.now()) / 1000); return interaction.reply({ content: `⏳ Pancingmu masih basah! Tunggu **${remaining} detik** lagi.`, ephemeral: true }); }
            fishCooldowns.set(cdKey, Date.now() + rod.cooldown * 1000);
            const result = catchFish(guildId, interaction.user.id);
            incrementUserStat(guildId, interaction.user.id, 'total_fish_caught');
            updateQuestProgress(guildId, interaction.user.id, 'fish', 1);
            addPetExp(guildId, interaction.user.id, 5);
            addComboFeature(guildId, interaction.user.id, 'fishing');
            const contestState = getContestState(guildId);
            let contestMsg = '';
            if (contestState && contestState.active && Date.now() < contestState.endsAt) { addContestEntry(guildId, interaction.user.id, result.fish.id, result.weight); contestMsg = '\n> 🏆 *Otomatis masuk kontes!*'; }
            const comboMult = getComboMultiplier(guildId, interaction.user.id);
            let comboMsg = comboMult > 1 ? `\n> 🔥 **Combo x${comboMult}!**` : '';
            const tierColors = { 'Trash': '#808080', 'Common': '#FFFFFF', 'Uncommon': '#2ECC71', 'Rare': '#3498DB', 'Epic': '#9B59B6', 'Legendary': '#F1C40F', 'Mythic': '#FF6B6B', 'Secret': '#8B00FF' };
            const embed = new EmbedBuilder()
                .setColor(tierColors[result.tier.tier] || '#2B2D31')
                .setTitle(`🎣 ${result.tier.tier === 'Trash' ? 'Kamu menangkap sampah...' : 'IKAN TERTANGKAP!'}`)
                .setDescription(`${result.tier.emoji} **${result.fish.name}**\n\n> 📊 **Tier:** ${result.tier.tier}\n> ⚖️ **Berat:** ${result.weight.toLocaleString('id-ID')} kg\n> 💰 **Nilai Jual:** 🪙 ${result.value.toLocaleString('id-ID')}\n\n> 🎋 Joran: **${rod.name}**\n> 🪱 Umpan: **${(BAIT_TYPES.find(b => b.id === eq.bait) || BAIT_TYPES[0]).name}** ${eq.bait !== 'none' ? `(${eq.bait_count > 0 ? eq.bait_count - 1 : 0} sisa)` : ''}` + contestMsg + comboMsg)
                .setFooter({ text: `Cooldown: ${rod.cooldown}s | Gunakan tombol di bawah!` });
            if (result.tier.tier === 'Secret') embed.setTitle('🔮💫 SECRET CATCH!!! 💫🔮');
            else if (result.tier.tier === 'Mythic') embed.setTitle('🌈✨ MYTHIC CATCH!! ✨🌈');
            else if (result.tier.tier === 'Legendary') embed.setTitle('🐉⚡ LEGENDARY CATCH! ⚡🐉');
            const afterCatchRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`fish_cast_${interaction.user.id}`).setLabel('🎣 Lagi').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`fish_inv_${interaction.user.id}`).setLabel('📦 Inventory').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`fish_shop_${interaction.user.id}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`fish_back_${interaction.user.id}`).setLabel('📋 Panel').setStyle(ButtonStyle.Secondary)
            );
            await interaction.reply({ embeds: [embed], components: [afterCatchRow] });
            await checkAchievements(interaction.guild, interaction.user.id, { type: 'fishing', tier: result.tier.tier, weight: result.weight });
            if (activeFishEvents.has(guildId)) {
                const ev = activeFishEvents.get(guildId);
                if (!ev.participants[interaction.user.id]) ev.participants[interaction.user.id] = { count: 0, heaviest: 0 };
                ev.participants[interaction.user.id].count++;
                if (result.weight > ev.participants[interaction.user.id].heaviest) ev.participants[interaction.user.id].heaviest = result.weight;
                let tournamentWin = false;
                if (ev.type === 'first_legendary' && ['Legendary', 'Mythic', 'Secret'].includes(result.tier.tier)) tournamentWin = true;
                if (ev.type === 'first_rare' && ['Rare', 'Epic', 'Legendary', 'Mythic', 'Secret'].includes(result.tier.tier)) tournamentWin = true;
                if (ev.type === 'first_trash' && result.tier.tier === 'Trash') tournamentWin = true;
                if (tournamentWin) {
                    activeFishEvents.delete(guildId);
                    userData.balance += ev.reward;
                    db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                    const ch = interaction.guild.channels.cache.get(ev.channelId);
                    if (ch) ch.send({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('🏆 TOURNAMENT WINNER!').setDescription(`<@${interaction.user.id}> memenangkan tournament!\n> Tangkapan: ${result.tier.emoji} **${result.fish.name}** (${result.weight} kg)\n\n🎁 Hadiah: 🪙 **${ev.reward.toLocaleString('id-ID')} Money**`)] });
                }
            }
            return;
        }

        if (command === 'fishing') {
            return handleFishingCommand(interaction);
        }


        // ================= FARMING COMMANDS =================
        if (command === 'farm') {
            return handleFarmCommand(interaction);
        }

        // ================= PET PANEL (Button-based) =================
        if (command === 'pet') {
            return handlePetCommand(interaction);
        }

        // ================= QUEST PANEL (Button-based) =================
        if (command === 'quest') {
            return handleQuestCommand(interaction);
        }

        // ================= CASINO PANEL (Button-based) =================
        if (command === 'casino') {
            return handleCasinoCommand(interaction);
        }

        // ================= ADMIN PANEL (Button-based) =================
        if (command === 'admin') {
            return handleAdminCommand(interaction);
        }

        // ================= ECONOMY PANEL (Button-based) =================
        if (command === 'wallet') {
            return handleEconomyPanelCommand(interaction);
        }

        if (command === 'gift') {
            return handleGiftCommand(interaction);
        }

        // ================= PROFILE PANEL (Button-based) =================
        if (command === 'profile') {
            return handleProfilePanelCommand(interaction);
        }

        // ================= LEVEL PANEL (Button-based) =================
        if (command === 'levelpanel') {
            return handleLevelPanelCommand(interaction);
        }



        // ================= BATTLE PVP =================
        if (command === 'battle') {
            const battleCd = `battle_${guildId}_${interaction.user.id}`;
            if (fishCooldowns.has(battleCd) && Date.now() < fishCooldowns.get(battleCd)) { return interaction.reply({ content: '⏳ Tunggu 5 menit sebelum battle lagi.', ephemeral: true }); }
            const myPet = getPetData(guildId, interaction.user.id);
            if (!myPet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
            const target = interaction.options.getUser('lawan');
            if (target.id === interaction.user.id) return interaction.reply({ content: '❌ Tidak bisa lawan diri sendiri!', ephemeral: true });
            if (target.bot) return interaction.reply({ content: '❌ Tidak bisa lawan bot!', ephemeral: true });
            const enemyPet = getPetData(guildId, target.id);
            if (!enemyPet) return interaction.reply({ content: `❌ <@${target.id}> belum punya pet aktif!`, ephemeral: true });
            const taruhan = Math.min(interaction.options.getInteger('taruhan') || 0, 5000);
            if (taruhan > 0) {
                if (userData.balance < taruhan) return interaction.reply({ content: '❌ Saldo kamu kurang untuk taruhan!', ephemeral: true });
                const enemyData = getOrCreateUser(guildId, target.id);
                if (enemyData.balance < taruhan) return interaction.reply({ content: `❌ <@${target.id}> saldo kurang untuk taruhan! (Butuh 🪙 ${taruhan.toLocaleString('id-ID')})`, ephemeral: true });
            }
            fishCooldowns.set(battleCd, Date.now() + 120000);
            addComboFeature(guildId, interaction.user.id, 'battle');
            const myPetDef = PET_DATA.find(p => p.id === myPet.petId);
            const enemyPetDef = PET_DATA.find(p => p.id === enemyPet.petId);
            
            await interaction.reply({ embeds: [new EmbedBuilder().setColor('#F39C12').setTitle('⚔️ BATTLE!').setDescription(`${myPetDef.emoji} **${myPet.name}** vs ${enemyPetDef.emoji} **${enemyPet.name}**${taruhan > 0 ? `\n> 💰 Taruhan: 🪙 **${taruhan.toLocaleString('id-ID')}**` : ''}\n\n> ⚔️ *Pertarungan sedang berlangsung...*`).setFooter({ text: 'Menunggu hasil...' })] });
            
            setTimeout(async () => {
                const result = simulatePvP(myPet, myPetDef, enemyPet, enemyPetDef);
                const winner = result.winner === 1 ? interaction.user : target;
                const loser = result.winner === 1 ? target : interaction.user;
                if (taruhan > 0) {
                    // Atomic transfer - re-check loser balance
                    const loserCheck = getOrCreateUser(guildId, loser.id);
                    if (loserCheck.balance >= taruhan) {
                        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(taruhan, guildId, loser.id);
                        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(taruhan, guildId, winner.id);
                        addIncome(guildId, winner.id, 'battle', taruhan);
                    }
                }
                addPetExp(guildId, winner.id, 15);
                addPetExp(guildId, loser.id, 5);
                incrementUserStat(guildId, winner.id, 'pvp_wins');
                incrementUserStat(guildId, loser.id, 'pvp_losses');
                updateQuestProgress(guildId, interaction.user.id, 'battle', 1);
                updateQuestProgress(guildId, target.id, 'battle', 1);
                await checkAchievements(interaction.guild, winner.id, { type: 'pvp_win' });
                const embed = new EmbedBuilder().setColor('#FF6B00').setTitle(`⚔️ BATTLE RESULT`).setDescription(`${result.log.join('\n')}\n\n━━━━━━ **RESULT** ━━━━━━\n🏆 Winner: ${result.winner === 1 ? myPetDef.emoji : enemyPetDef.emoji} **${result.winner === 1 ? myPet.name : enemyPet.name}** (<@${winner.id}>)\n💀 Loser: ${result.winner === 1 ? enemyPetDef.emoji : myPetDef.emoji} **${result.winner === 1 ? enemyPet.name : myPet.name}**${taruhan > 0 ? `\n\n💰 Taruhan: 🪙 **${taruhan.toLocaleString('id-ID')}** → <@${winner.id}>` : ''}`).setFooter({ text: 'Winner +15 EXP | Loser +5 EXP' });
                interaction.editReply({ embeds: [embed] }).catch(() => {});
            }, 3000);
            return;
        }


        // (legacy /admin_shop command removed — shop management is now in the /admin panel)

        if (command === 'shop') {
            const roles = db.prepare('SELECT * FROM shop_roles WHERE guildId = ?').all(guildId);
            const items = db.prepare('SELECT name, price, COUNT(*) as stock FROM shop_items WHERE guildId = ? GROUP BY name, price').all(guildId);
            const crPrice = parseInt(getSetting(guildId, 'custom_role_price', '0'));
            
            let shopDesc = '';
            const componentsRows = [];

            // 🎣 FISHING section (Joran + Umpan) — Row 1
            shopDesc += '🎣 **FISHING**\n';
            shopDesc += `> 🔧 Rod Parts — 🪙 **5.000** | Material upgrade joran\n`;
            ROD_TYPES.filter(r => r.price > 0).slice(0, 3).forEach(r => { shopDesc += `> ${r.emoji} ${r.name} — 🪙 **${r.price.toLocaleString('id-ID')}** | CD: ${r.cooldown}s\n`; });
            shopDesc += `> *...dan ${ROD_TYPES.filter(r => r.price > 0).length - 3} joran lainnya + ${BAIT_TYPES.filter(b => b.price > 0).length} umpan*\n\n`;
            const fishingMenu = new StringSelectMenuBuilder().setCustomId('shop_buy_fishing').setPlaceholder('🎣 Beli Joran / Umpan / Parts...').setMinValues(1).setMaxValues(1);
            // Rod Parts (upgrade material)
            fishingMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`🔧 Rod Parts (🪙 5.000)`).setValue('item_rod_part').setDescription('Material upgrade joran (8% drop dari mancing)'));
            ROD_TYPES.filter(r => r.price > 0).forEach(r => { fishingMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${r.name} (🪙 ${r.price.toLocaleString('id-ID')})`).setValue(`rod_${r.id}`).setDescription(`CD: ${r.cooldown}s | +${r.rareBonus}% Rare`)); });
            BAIT_TYPES.filter(b => b.price > 0).slice(0, 13).forEach(b => { fishingMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${b.name} (🪙 ${b.price.toLocaleString('id-ID')})`).setValue(`bait_${b.id}`).setDescription(`+${b.rareBonus}% chance ikan langka`)); });
            componentsRows.push(new ActionRowBuilder().addComponents(fishingMenu));

            // 🌾 FARMING section (Bibit + Pupuk) — Row 2
            shopDesc += '🌾 **FARMING**\n';
            FARM_CROPS.slice(0, 4).forEach(c => { shopDesc += `> ${c.emoji} ${c.name} — 🪙 **${c.cost}** | ${c.time}m\n`; });
            shopDesc += `> *...dan ${FARM_CROPS.length - 4} bibit lainnya*\n`;
            FARM_FERTILIZERS.filter(f => f.cost > 0).forEach(f => { shopDesc += `> ${f.emoji} ${f.name} — 🪙 **${f.cost}** | -${Math.round(f.speedBonus*100)}% waktu\n`; });
            shopDesc += '\n';
            const farmMenu = new StringSelectMenuBuilder().setCustomId('shop_buy_farming').setPlaceholder('🌾 Beli Bibit / Pupuk...').setMinValues(1).setMaxValues(1);
            FARM_CROPS.slice(0, 20).forEach(c => { farmMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${c.name} (🪙 ${c.cost})`).setValue(`crop_${c.id}`).setDescription(`${c.tier} | ${c.time}m | Jual: 🪙${c.sellPrice}`)); });
            FARM_FERTILIZERS.filter(f => f.cost > 0).forEach(f => { farmMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${f.name} (🪙 ${f.cost})`).setValue(`fert_${f.id}`).setDescription(`-${Math.round(f.speedBonus*100)}% waktu | +${Math.round(f.yieldBonus*100)}% hasil`)); });
            componentsRows.push(new ActionRowBuilder().addComponents(farmMenu));

            // 🐾 PET section (Food + Eggs) — Row 3
            shopDesc += '🐾 **PET**\n';
            PET_FOODS.forEach(f => { shopDesc += `> ${f.emoji} ${f.name} — 🪙 **${f.price}** | +${f.hunger} Hunger +${f.happiness} Happy\n`; });
            PET_EGGS.forEach(e => { shopDesc += `> ${e.emoji} ${e.name} — 🪙 **${e.price.toLocaleString('id-ID')}**\n`; });
            shopDesc += '\n';
            const petShopMenu = new StringSelectMenuBuilder().setCustomId('shop_buy_pet').setPlaceholder('🐾 Beli Pet Food / Egg...').setMinValues(1).setMaxValues(1);
            PET_FOODS.forEach(f => { petShopMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${f.name} (🪙 ${f.price})`).setValue(`food_${f.id}`).setDescription(`Hunger +${f.hunger} | Happy +${f.happiness}`)); });
            PET_EGGS.forEach(e => { petShopMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${e.name} (🪙 ${e.price.toLocaleString('id-ID')})`).setValue(`egg_${e.id}`).setDescription(`Gacha Pet Egg`)); });
            componentsRows.push(new ActionRowBuilder().addComponents(petShopMenu));

            // 🎒 ITEMS section (ALL game items: Battle, Booster, Special, etc) — Row 4
            shopDesc += '🎒 **ITEMS & BATTLE**\n';
            ITEMS.forEach(item => { shopDesc += `> ${item.emoji} ${item.name} — 🪙 **${item.price.toLocaleString('id-ID')}** | ${item.desc}\n`; });
            shopDesc += '\n';
            const gameItemMenu = new StringSelectMenuBuilder().setCustomId('shop_buy_game_item').setPlaceholder('🎒 Beli Item (Battle/Booster/Special)...').setMinValues(1).setMaxValues(1);
            ITEMS.forEach(item => { gameItemMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${item.menuEmoji} ${item.name} (🪙 ${item.price.toLocaleString('id-ID')})`).setDescription(`${item.desc.substring(0, 50)}`).setValue(item.id)); });
            componentsRows.push(new ActionRowBuilder().addComponents(gameItemMenu));

            // 🎭 ROLE & LAINNYA section — Row 5 (jika ada)
            if (roles.length > 0 || crPrice > 0 || items.length > 0) {
                shopDesc += '🎭 **ROLE & LAINNYA**\n';
                if (roles.length > 0) roles.forEach(r => { const roleObj = interaction.guild.roles.cache.get(r.roleId); shopDesc += `> ${roleObj ? roleObj.name : '?'} — 🪙 **${r.price.toLocaleString('id-ID')}**\n`; });
                if (crPrice > 0) shopDesc += `> 🎨 Custom Role — 🪙 **${crPrice.toLocaleString('id-ID')}**\n`;
                if (items.length > 0) items.forEach(i => { shopDesc += `> 📦 ${i.name} — 🪙 **${i.price.toLocaleString('id-ID')}** (Stok: ${i.stock})\n`; });
                shopDesc += '\n';
                const roleMenu = new StringSelectMenuBuilder().setCustomId('shop_buy_role_misc').setPlaceholder('🎭 Beli Role / Barang Virtual...').setMinValues(1).setMaxValues(1);
                if (roles.length > 0) roles.forEach(r => { const roleObj = interaction.guild.roles.cache.get(r.roleId); roleMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${roleObj ? roleObj.name : '?'}`).setDescription(`🪙 ${r.price.toLocaleString('id-ID')}`).setValue(`role_${r.roleId}`)); });
                if (crPrice > 0) roleMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel('🎨 Custom Role').setDescription(`🪙 ${crPrice.toLocaleString('id-ID')}`).setValue('init_cr'));
                if (items.length > 0) items.forEach((i, idx) => { if (idx < 10) roleMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`📦 ${i.name}`).setDescription(`🪙 ${i.price.toLocaleString('id-ID')} | Stok: ${i.stock}`).setValue(`item_${i.name}_${i.price}`)); });
                componentsRows.push(new ActionRowBuilder().addComponents(roleMenu));
            }

            // Truncate desc if too long
            if (shopDesc.length > 4000) shopDesc = shopDesc.substring(0, 3990) + '\n\n*...dan lainnya*';

            return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🛒 ${interaction.guild.name.toUpperCase()} STORE`).setColor('#2B2D31').setDescription(shopDesc).setFooter({ text: `💰 Saldo: ${userData.balance.toLocaleString('id-ID')} | Pilih dari menu di bawah` })], components: componentsRows });
        }


        // ================= TRADING SYSTEM (Panel) =================
        if (command === 'trade') {
            return handleTradeCommand(interaction);
        }

        // ================= MARKET SYSTEM (Panel) =================
        if (command === 'market') {
            return handleMarketCommand(interaction);
        }

        // ================= STATS DASHBOARD =================
        if (command === 'stats') {
            return handleStatsCommand(interaction);
        }

        // ================= LEADERBOARD =================
        if (command === 'leaderboard') {
            return handleLeaderboardCommand(interaction);
        }

        // ================= DAILY LOGIN CALENDAR =================
        if (command === 'calendar') {
            const calData = getLoginCalendar(guildId, interaction.user.id);
            const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
            const dayOfMonth = parseInt(today.split('-')[2]);
            let days = JSON.parse(calData.days || '[]');
            let claimed = JSON.parse(calData.claimed || '[]');
            
            // Check if already logged in today
            const alreadyClaimed = claimed.includes(dayOfMonth);
            let claimMsg = '';
            
            if (!alreadyClaimed) {
                // Claim today's reward
                days.push(dayOfMonth);
                claimed.push(dayOfMonth);
                const totalDays = claimed.length;
                const reward = CALENDAR_REWARDS[totalDays] || CALENDAR_REWARDS[Math.min(totalDays, 30)] || { money: 200, desc: '🪙 200 Money' };
                
                userData.balance += reward.money;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                if (reward.item) addItem(guildId, interaction.user.id, reward.item);
                if (reward.petExp) addPetExp(guildId, interaction.user.id, reward.petExp);
                
                db.prepare('UPDATE login_calendar SET days = ?, claimed = ? WHERE guildId = ? AND userId = ? AND month = ?').run(JSON.stringify(days), JSON.stringify(claimed), guildId, interaction.user.id, calData.month);
                claimMsg = `\n\n✅ **Hari ke-${totalDays} diklaim!** Reward: ${reward.desc}`;
            }
            
            // Build calendar visual
            const totalClaimed = claimed.length;
            let calVisual = '';
            for (let d = 1; d <= 30; d++) {
                const isClaimed = claimed.includes(d);
                const isSpecial = [7, 14, 21, 28, 30].includes(d);
                if (isClaimed) calVisual += '✅';
                else if (d === totalClaimed + 1 && !alreadyClaimed) calVisual += '🎁';
                else if (isSpecial) calVisual += '⭐';
                else calVisual += '⬜';
                if (d % 7 === 0) calVisual += '\n';
                else calVisual += ' ';
            }
            
            const nextReward = CALENDAR_REWARDS[totalClaimed + 1] || { desc: '🪙 Money' };
            const embed = new EmbedBuilder()
                .setTitle('📅 Daily Login Calendar')
                .setColor(alreadyClaimed ? '#2B2D31' : '#FFD700')
                .setDescription(`${calVisual}\n\n> 📊 Total login bulan ini: **${totalClaimed}/30 hari**\n> 🎁 Reward berikutnya (Hari ${totalClaimed + 1}): ${nextReward.desc}${claimMsg}`)
                .setFooter({ text: alreadyClaimed ? '✅ Sudah klaim hari ini! Kembali besok.' : '🎁 Reward diklaim otomatis! Kembali besok.' });
            return interaction.reply({ embeds: [embed] });
        }

    }


    // ================= SELECT MENU HANDLERS =================
    if (interaction.isStringSelectMenu()) {
        // --- FISHING PANEL SELECT MENUS ---
        if (isFishingPanelSelectMenu(interaction.customId)) {
            return handleFishingSelectMenu(interaction);
        }

        // --- FARM PANEL SELECT MENUS ---
        if (isFarmPanelSelectMenu(interaction.customId)) {
            return handleFarmSelectMenu(interaction);
        }

        // --- PET PANEL SELECT MENUS ---
        if (isPetPanelSelectMenu(interaction.customId)) {
            return handlePetSelectMenu(interaction);
        }

        // --- CASINO PANEL SELECT MENUS ---
        if (isCasinoPanelSelectMenu(interaction.customId)) {
            return handleCasinoSelectMenu(interaction);
        }

        // --- PROFILE PANEL SELECT MENUS ---
        if (isProfilePanelSelectMenu(interaction.customId)) {
            return handleProfileSelectMenu(interaction);
        }

        // --- MARKET PANEL SELECT MENUS ---
        if (isMarketPanelSelectMenu(interaction.customId)) {
            return handleMarketSelectMenu(interaction);
        }

        // --- TRADE PANEL SELECT MENUS ---
        if (isTradePanelSelectMenu(interaction.customId)) {
            return handleTradeSelectMenu(interaction);
        }

        if (interaction.customId.startsWith('ach_detail_')) { const targetUserId = interaction.customId.replace('ach_detail_', ''), selectedCat = interaction.values[0], catAchs = ACHIEVEMENTS.filter(a => a.category === selectedCat), userAchs = db.prepare('SELECT * FROM achievements WHERE guildId = ? AND userId = ?').all(guildId, targetUserId), unlockedIds = userAchs.map(a => a.achievementId); const catUnlocked = catAchs.filter(a => unlockedIds.includes(a.id)).length; const catIcon = { Social: '💬', Economy: '💰', Level: '📈', Streak: '🔥', Gambling: '🎰', Events: '🎮', Voice: '🎙️', Quest: '📜', Special: '✨', Fishing: '🎣', Farming: '🌾' }[selectedCat] || '📁'; let desc = `${catIcon} **${selectedCat}** — ${catUnlocked}/${catAchs.length} unlocked\n━━━━━━━━━━━━━━━━━━━━━━\n\n`; for (const ach of catAchs) { const unlocked = unlockedIds.includes(ach.id); const status = unlocked ? '✅' : '🔒'; const nameStyle = unlocked ? `**${ach.name}**` : `~~${ach.name}~~`; desc += `${status} ${ach.emoji} ${nameStyle}\n> *${ach.desc}*\n> Hadiah: 🪙 ${ach.reward.toLocaleString('id-ID')} Money${unlocked ? ' ✓ Diklaim' : ''}\n\n`; } return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${catIcon} Achievement: ${selectedCat}`).setColor(catUnlocked === catAchs.length ? '#FFD700' : '#2B2D31').setDescription(desc).setFooter({ text: catUnlocked === catAchs.length ? '🎉 Kategori ini sudah COMPLETE!' : `${catAchs.length - catUnlocked} badge tersisa` })], ephemeral: true }); }
        if (interaction.customId === 'shop_buy_custom_role' || (interaction.customId === 'shop_buy_role_misc' && interaction.values[0] === 'init_cr')) { const crPrice = parseInt(getSetting(guildId, 'custom_role_price', '0')), userData = getOrCreateUser(guildId, interaction.user.id); if (userData.balance < crPrice) return interaction.reply({ content: '❌ Uang kurang!', ephemeral: true }); const colorMenu = new StringSelectMenuBuilder().setCustomId('cr_select_color').setPlaceholder('🎨 Pilih Warna...').addOptions(new StringSelectMenuOptionBuilder().setLabel('🔴 Merah').setValue('FF0000'), new StringSelectMenuOptionBuilder().setLabel('🔵 Biru').setValue('0000FF'), new StringSelectMenuOptionBuilder().setLabel('🟢 Hijau').setValue('00FF00'), new StringSelectMenuOptionBuilder().setLabel('🟡 Kuning').setValue('FFFF00'), new StringSelectMenuOptionBuilder().setLabel('🟣 Ungu').setValue('800080'), new StringSelectMenuOptionBuilder().setLabel('🌸 Pink').setValue('FFC0CB'), new StringSelectMenuOptionBuilder().setLabel('⚫ Hitam').setValue('010101'), new StringSelectMenuOptionBuilder().setLabel('⚪ Putih').setValue('FFFFFF'), new StringSelectMenuOptionBuilder().setLabel('⚙️ Hex Sendiri').setValue('custom')); return interaction.reply({ content: 'Pilih warna:', components: [new ActionRowBuilder().addComponents(colorMenu)], ephemeral: true }); }
        if (interaction.customId === 'cr_select_color') { const selectedColor = interaction.values[0], modal = new ModalBuilder().setCustomId(`submit_cr_${selectedColor}`).setTitle('Custom Role 🎨'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cr_name').setLabel('Nama Role (Max 32)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32))); if (selectedColor === 'custom') modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cr_color').setLabel('Hex (#FF0000)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(7).setMaxLength(7).setPlaceholder('#FFFFFF'))); return interaction.showModal(modal); }
        // --- FISHING SHOP BUY ---
        if (interaction.customId === 'fishing_buy_rod' || interaction.customId === 'fishing_buy_bait' || interaction.customId === 'shop_buy_fishing') {
            const selected = interaction.values[0], userData = getOrCreateUser(guildId, interaction.user.id);
            if (selected === 'item_rod_part') {
                const price = 5000;
                if (userData.balance < price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${price.toLocaleString('id-ID')}**`, ephemeral: true });
                db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(price, guildId, interaction.user.id);
                addItem(guildId, interaction.user.id, 'rod_part', 1);
                const owned = getItemCount(guildId, interaction.user.id, 'rod_part');
                return interaction.reply({ content: `✅ Membeli 🔧 **Rod Parts** x1!\n> 📦 Total: **${owned}** parts\n> 💡 Upgrade joran di \`/fishing\` → 🔧 Upgrade Rod` });
            }
            if (selected.startsWith('rod_')) {
                const rodId = selected.substring(4), rodDef = ROD_TYPES.find(r => r.id === rodId);
                if (!rodDef) return interaction.reply({ content: '❌ Joran tidak ditemukan!', ephemeral: true });
                if (userData.balance < rodDef.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${rodDef.price.toLocaleString('id-ID')}**`, ephemeral: true });
                userData.balance -= rodDef.price;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                db.prepare('UPDATE fish_equipment SET rod = ? WHERE guildId = ? AND userId = ?').run(rodId, guildId, interaction.user.id);
                await checkAchievements(interaction.guild, interaction.user.id, { type: 'fish_rod', rod: rodId });
                return interaction.reply({ content: `✅ Berhasil membeli ${rodDef.emoji} **${rodDef.name}**! Joran langsung terpasang.\n> Cooldown: ${rodDef.cooldown}s | Rare Bonus: +${rodDef.rareBonus}%` });
            }
            if (selected.startsWith('bait_')) {
                const baitId = selected.substring(5), baitDef = BAIT_TYPES.find(b => b.id === baitId);
                if (!baitDef) return interaction.reply({ content: '❌ Umpan tidak ditemukan!', ephemeral: true });
                const totalPrice = baitDef.price * 10;
                if (userData.balance < totalPrice) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${totalPrice.toLocaleString('id-ID')}**`, ephemeral: true });
                userData.balance -= totalPrice;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                const eq = getEquipment(guildId, interaction.user.id);
                const newCount = (eq.bait === baitId ? eq.bait_count : 0) + 10;
                db.prepare('UPDATE fish_equipment SET bait = ?, bait_count = ? WHERE guildId = ? AND userId = ?').run(baitId, newCount, guildId, interaction.user.id);
                return interaction.reply({ content: `✅ Membeli ${baitDef.emoji} **${baitDef.name}** x10! Total umpan: **${newCount}**` });
            }
        }
        if (interaction.customId === 'shop_buy_game_item') {
            const itemId = interaction.values[0], userData = getOrCreateUser(guildId, interaction.user.id);
            const itemDef = ITEMS.find(i => i.id === itemId);
            if (!itemDef) return interaction.reply({ content: '❌ Item tidak ditemukan!', ephemeral: true });
            if (userData.balance < itemDef.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${itemDef.price.toLocaleString('id-ID')}**`, ephemeral: true });
            userData.balance -= itemDef.price;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
            addItem(guildId, interaction.user.id, itemId);
            return interaction.reply({ content: `✅ Berhasil membeli ${itemDef.emoji} **${itemDef.name}**!\n> Cek di \`/profile\` → Inventory` });
        }
        if (interaction.customId === 'farm_buy_seed' || interaction.customId === 'farm_buy_seed2') {
            const cropId = interaction.values[0];
            const crop = FARM_CROPS.find(c => c.id === cropId);
            if (!crop) return interaction.reply({ content: '❌ Bibit tidak ditemukan!', ephemeral: true });
            // Show modal for quantity input
            const modal = new ModalBuilder().setCustomId(`seed_qty_${cropId}`).setTitle(`Beli ${crop.emoji} ${crop.name}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('seed_qty_input').setLabel(`Berapa bibit? (🪙${crop.cost}/bibit)`).setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(3).setPlaceholder('Contoh: 10')
            ));
            return interaction.showModal(modal);
        }
        if (interaction.customId === 'farm_buy_fertilizer') {
            const fertId = interaction.values[0], userData = getOrCreateUser(guildId, interaction.user.id);
            const fert = FARM_FERTILIZERS.find(f => f.id === fertId);
            if (!fert) return interaction.reply({ content: '❌ Pupuk tidak ditemukan!', ephemeral: true });
            if (userData.balance < fert.cost) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${fert.cost}**`, ephemeral: true });
            // Check if there's any unfertilized plot
            const plot = db.prepare("SELECT * FROM farm_plots WHERE guildId = ? AND userId = ? AND fertilizer = 'none' AND status != 'dead' ORDER BY plantedAt ASC LIMIT 1").get(guildId, interaction.user.id);
            if (!plot) return interaction.reply({ content: '❌ Tidak ada tanaman yang bisa dipupuk! Semua sudah dipupuk atau tidak ada tanaman.\n> Pilih tanaman spesifik lewat `/farm` → 🧪 Pupuk.', ephemeral: true });
            userData.balance -= fert.cost;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
            db.prepare('UPDATE farm_plots SET fertilizer = ? WHERE id = ?').run(fertId, plot.id);
            const crop = FARM_CROPS.find(c => c.id === plot.cropId);
            return interaction.reply({ content: `✅ ${fert.emoji} **${fert.name}** → [Slot] ${crop ? crop.emoji + ' ' + crop.name : 'tanaman'}!\n> ⏩ -${Math.round(fert.speedBonus*100)}% waktu${fert.yieldBonus > 0 ? ` | 📈 +${Math.round(fert.yieldBonus*100)}% hasil` : ''}\n\n💡 *Tip: Atur pupuk per tanaman lewat `/farm` → 🧪 Pupuk!*` });
        }
        if (interaction.customId === 'shop_buy_farming') {
            const selected = interaction.values[0], userData = getOrCreateUser(guildId, interaction.user.id);
            if (selected.startsWith('crop_')) {
                const cropId = selected.substring(5);
                const crop = FARM_CROPS.find(c => c.id === cropId);
                if (!crop) return interaction.reply({ content: '❌ Bibit tidak ditemukan!', ephemeral: true });
                const modal = new ModalBuilder().setCustomId(`seed_qty_${cropId}`).setTitle(`Beli ${crop.emoji} ${crop.name}`);
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('seed_qty_input').setLabel(`Berapa bibit? (🪙${crop.cost}/bibit)`).setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(3).setPlaceholder('Contoh: 10')
                ));
                return interaction.showModal(modal);
            }
            if (selected.startsWith('fert_')) {
                const fertId = selected.substring(5);
                const fert = FARM_FERTILIZERS.find(f => f.id === fertId);
                if (!fert) return interaction.reply({ content: '❌ Pupuk tidak ditemukan!', ephemeral: true });
                if (userData.balance < fert.cost) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${fert.cost}**`, ephemeral: true });
                const plot = db.prepare("SELECT * FROM farm_plots WHERE guildId = ? AND userId = ? AND fertilizer = 'none' AND status != 'dead' ORDER BY plantedAt ASC LIMIT 1").get(guildId, interaction.user.id);
                if (!plot) return interaction.reply({ content: '❌ Tidak ada tanaman yang bisa dipupuk!\n> Pilih tanaman spesifik lewat `/farm` → 🧪 Pupuk.', ephemeral: true });
                userData.balance -= fert.cost;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                db.prepare('UPDATE farm_plots SET fertilizer = ? WHERE id = ?').run(fertId, plot.id);
                const crop = FARM_CROPS.find(c => c.id === plot.cropId);
                return interaction.reply({ content: `✅ ${fert.emoji} **${fert.name}** → ${crop ? crop.emoji + ' ' + crop.name : 'tanaman'}!\n> ⏩ -${Math.round(fert.speedBonus*100)}% waktu${fert.yieldBonus > 0 ? ` | 📈 +${Math.round(fert.yieldBonus*100)}% hasil` : ''}` });
            }
        }
        if (interaction.customId === 'shop_buy_pet' || interaction.customId === 'petshop_buy_food' || interaction.customId === 'petshop_buy_egg') {
            const selected = interaction.values[0], userData = getOrCreateUser(guildId, interaction.user.id);
            // Normalize: petshop_buy_food gives raw foodId, petshop_buy_egg gives raw eggId, shop_buy_pet gives food_/egg_ prefix
            let foodId = null, eggId = null;
            if (interaction.customId === 'petshop_buy_food') foodId = selected;
            else if (interaction.customId === 'petshop_buy_egg') eggId = selected;
            else if (selected.startsWith('food_')) foodId = selected.substring(5);
            else if (selected.startsWith('egg_')) eggId = selected.substring(4);

            if (foodId) {
                const food = PET_FOODS.find(f => f.id === foodId);
                if (!food) return interaction.reply({ content: '❌ Food tidak ditemukan!', ephemeral: true });
                if (userData.balance < food.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${food.price}**`, ephemeral: true });
                db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(food.price, guildId, interaction.user.id);
                addPetFood(guildId, interaction.user.id, foodId, 1);
                updateQuestProgress(guildId, interaction.user.id, 'spend_money', food.price);
                const owned = getPetFoodCount(guildId, interaction.user.id, foodId);
                return interaction.reply({ content: `✅ Membeli ${food.emoji} **${food.name}**! Masuk ke inventory makanan.\n> 📦 Total ${food.name}: **${owned}**\n> 💡 Pakai lewat `/pet` → 🍖 Feed` });
            }
            if (eggId) {
                const egg = PET_EGGS.find(e => e.id === eggId);
                if (!egg) return interaction.reply({ content: '❌ Egg tidak ditemukan!', ephemeral: true });
                if (userData.balance < egg.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${egg.price.toLocaleString('id-ID')}**`, ephemeral: true });
                const allPets = getAllPets(guildId, interaction.user.id);
                if (allPets.length >= 10) return interaction.reply({ content: '❌ Slot pet penuh (max 10)!', ephemeral: true });
                db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(egg.price, guildId, interaction.user.id);
                updateQuestProgress(guildId, interaction.user.id, 'spend_money', egg.price);
                let roll = Math.random() * 100, cumulative = 0, selectedTier = 'Common';
                for (const [tier, rate] of Object.entries(egg.rates)) { cumulative += rate; if (roll <= cumulative) { selectedTier = tier; break; } }
                const tierPets = PET_DATA.filter(p => p.tier === selectedTier);
                const wonPet = tierPets[Math.floor(Math.random() * tierPets.length)];
                const isFirst = allPets.length === 0 ? 1 : 0;
                const stats = generatePetStats(selectedTier);
                const pClass = PET_CLASSES[Math.floor(Math.random() * PET_CLASSES.length)];
                const pElement = PET_ELEMENTS[Math.floor(Math.random() * PET_ELEMENTS.length)];
                db.prepare('INSERT INTO pets (guildId, userId, petId, name, active, adoptedAt, class, element, hp, atk, def, spd, crit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(guildId, interaction.user.id, wonPet.id, wonPet.name, isFirst, Date.now(), pClass, pElement, stats.hp, stats.atk, stats.def, stats.spd, stats.crit);
                const tierColors = { Common: '#AAAAAA', Uncommon: '#2ECC71', Rare: '#3498DB', Epic: '#9B59B6', Legendary: '#FFD700', Mythic: '#FF6B6B' };
                let title = '🥚 Egg Hatched!';
                if (selectedTier === 'Mythic') title = '🌟✨ MYTHIC PET!!! ✨🌟';
                else if (selectedTier === 'Legendary') title = '⭐ LEGENDARY PET! ⭐';
                else if (selectedTier === 'Epic') title = '💜 EPIC PET! 💜';
                return interaction.reply({ embeds: [new EmbedBuilder().setColor(tierColors[selectedTier] || '#2B2D31').setTitle(title).setDescription(`${wonPet.emoji} **${wonPet.name}**\n> Tier: **${selectedTier}**\n> Bonus: +${wonPet.bonus.value}% ${wonPet.bonus.type.replace(/_/g, ' ')}\n\n${isFirst ? '✅ Langsung aktif!' : 'Aktifkan lewat `/pet` → 🔄 Swap.'}`)] });
            }
        }
        if (interaction.customId === 'shop_buy_item' || interaction.customId === 'shop_buy_role' || interaction.customId === 'shop_buy_role_misc') { const selected = interaction.values[0]; let itemName = '', price = 0; if (selected.startsWith('item_')) { const parts = selected.substring(5).split('_'); price = parseInt(parts.pop()); itemName = parts.join('_'); const itemInfo = db.prepare('SELECT price FROM shop_items WHERE guildId = ? AND name = ? AND price = ? LIMIT 1').get(guildId, itemName, price); if (!itemInfo) return interaction.reply({ content: '❌ Habis!', ephemeral: true }); price = itemInfo.price; } else if (selected.startsWith('role_')) { const roleId = selected.substring(5), roleInfo = db.prepare('SELECT price FROM shop_roles WHERE guildId = ? AND roleId = ?').get(guildId, roleId); if (!roleInfo) return interaction.reply({ content: '❌ Tidak dijual!', ephemeral: true }); const roleObj = interaction.guild.roles.cache.get(roleId); itemName = roleObj ? `Role: ${roleObj.name}` : 'Role'; price = roleInfo.price; } const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`confirm_${selected}`).setLabel('✅ Beli').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('cancel_buy').setLabel('❌ Batal').setStyle(ButtonStyle.Danger)); return interaction.reply({ content: `🧾 **${itemName}** — 🪙 **${price.toLocaleString('id-ID')}**\n\nLanjutkan pembelian?`, components: [row], ephemeral: true }); }
    }


    // ================= BUTTON HANDLERS =================
    if (interaction.isButton()) {
        // --- WELCOME HELP BUTTON ---
        if (interaction.customId === 'welcome_help') {
            return interaction.reply({ content: '📖 Gunakan `/help` untuk panduan lengkap, atau `/menu` untuk navigasi cepat!', ephemeral: true });
        }

        // --- FISHING PANEL BUTTONS ---
        if (isFishingPanelButton(interaction.customId)) {
            return handleFishingButton(interaction);
        }

        // --- FARM PANEL BUTTONS ---
        if (isFarmPanelButton(interaction.customId)) {
            return handleFarmButton(interaction);
        }

        // --- PET PANEL BUTTONS ---
        if (isPetPanelButton(interaction.customId)) {
            return handlePetButton(interaction);
        }

        // --- QUEST PANEL BUTTONS ---
        if (isQuestPanelButton(interaction.customId)) {
            return handleQuestButton(interaction);
        }

        // --- CASINO PANEL BUTTONS ---
        if (isCasinoPanelButton(interaction.customId)) {
            return handleCasinoButton(interaction);
        }

        // --- ADMIN PANEL BUTTONS ---
        if (isAdminPanelButton(interaction.customId)) {
            return handleAdminButton(interaction);
        }

        // --- ECONOMY PANEL BUTTONS ---
        if (isEconomyPanelButton(interaction.customId)) {
            return handleEconomyButton(interaction);
        }

        // --- PROFILE PANEL BUTTONS ---
        if (isProfilePanelButton(interaction.customId)) {
            return handleProfileButton(interaction);
        }

        // --- LEVEL PANEL BUTTONS ---
        if (isLevelPanelButton(interaction.customId)) {
            return handleLevelButton(interaction);
        }

        // --- TRADE PANEL BUTTONS ---
        if (isTradePanelButton(interaction.customId)) {
            return handleTradeButton(interaction);
        }

        // --- MARKET PANEL BUTTONS ---
        if (isMarketPanelButton(interaction.customId)) {
            return handleMarketButton(interaction);
        }

        // --- STATS PANEL BUTTONS ---
        if (isStatsPanelButton(interaction.customId)) {
            return handleStatsButton(interaction);
        }

        // --- LEADERBOARD PANEL BUTTONS ---
        if (isLeaderboardButton(interaction.customId)) {
            return handleLeaderboardButton(interaction);
        }

        // --- NOTIFICATION TOGGLE BUTTONS ---
        if (interaction.customId.startsWith('notif_toggle_')) {
            const parts = interaction.customId.split('_');
            const type = parts[2]; // daily, quest, trade, pet, farm
            const targetUserId = parts[3];
            if (interaction.user.id !== targetUserId) return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
            const newValue = toggleNotif(guildId, targetUserId, type);
            const settings = getNotifSettings(guildId, targetUserId);
            // Rebuild notification panel
            const { EmbedBuilder: EB, ActionRowBuilder: AR, ButtonBuilder: BB, ButtonStyle: BS } = require('discord.js');
            const notifEmbed = new EB()
                .setTitle('🔔 Notification Settings')
                .setColor('#F39C12')
                .setDescription(
                    `${settings.notif_daily ? '✅' : '❌'} Daily Reminder\n` +
                    `${settings.notif_quest ? '✅' : '❌'} Quest Complete\n` +
                    `${settings.notif_trade ? '✅' : '❌'} Trade & Market\n` +
                    `${settings.notif_pet ? '✅' : '❌'} Pet Warnings\n` +
                    `${settings.notif_farm ? '✅' : '❌'} Farm Harvest\n\n` +
                    `💡 *Klik tombol untuk toggle on/off*`
                );
            const row1 = new AR().addComponents(
                new BB().setCustomId(`notif_toggle_daily_${targetUserId}`).setLabel(`${settings.notif_daily ? '✅' : '❌'} Daily`).setStyle(settings.notif_daily ? BS.Success : BS.Secondary),
                new BB().setCustomId(`notif_toggle_quest_${targetUserId}`).setLabel(`${settings.notif_quest ? '✅' : '❌'} Quest`).setStyle(settings.notif_quest ? BS.Success : BS.Secondary),
                new BB().setCustomId(`notif_toggle_trade_${targetUserId}`).setLabel(`${settings.notif_trade ? '✅' : '❌'} Trade`).setStyle(settings.notif_trade ? BS.Success : BS.Secondary),
                new BB().setCustomId(`notif_toggle_pet_${targetUserId}`).setLabel(`${settings.notif_pet ? '✅' : '❌'} Pet`).setStyle(settings.notif_pet ? BS.Success : BS.Secondary),
                new BB().setCustomId(`notif_toggle_farm_${targetUserId}`).setLabel(`${settings.notif_farm ? '✅' : '❌'} Farm`).setStyle(settings.notif_farm ? BS.Success : BS.Secondary)
            );
            const row2 = new AR().addComponents(
                new BB().setCustomId(`profpnl_back_${targetUserId}`).setLabel('🔙 Kembali').setStyle(BS.Secondary)
            );
            return interaction.update({ embeds: [notifEmbed], components: [row1, row2] });
        }

        // --- COINFLIP BUTTONS ---
        if (interaction.customId.startsWith('coinflip_head_') || interaction.customId.startsWith('coinflip_tail_')) {
            const parts = interaction.customId.split('_');
            const choice = parts[1]; // 'head' or 'tail'
            const targetUserId = parts[2];
            const taruhan = parseInt(parts[3]);
            
            // Only the original user can click
            if (interaction.user.id !== targetUserId) return interaction.reply({ content: '❌ Ini bukan coinflip kamu!', ephemeral: true });
            if (!activeCoinflips.has(interaction.user.id)) return interaction.reply({ content: '❌ Coinflip ini sudah expired!', ephemeral: true });
            
            activeCoinflips.delete(interaction.user.id);
            
            // Disable buttons
            await interaction.update({ components: [] });
            
            // Animation stage 1
            const anim1 = new EmbedBuilder().setColor('#F1C40F').setTitle('🪙 Coinflip — Melempar...').setDescription(`> 🪙 *Koin melayang...*\n>\n> 💰 Taruhan: 🪙 **${taruhan.toLocaleString('id-ID')}**\n> 🎯 Pilihan: **${choice === 'head' ? '🪙 Head' : '🦅 Tail'}**`);
            await interaction.editReply({ embeds: [anim1], components: [] });
            
            setTimeout(async () => {
                // Animation stage 2
                const anim2 = new EmbedBuilder().setColor('#F39C12').setTitle('🪙 Coinflip — Berputar...').setDescription(`> 🌀 *Koin berputar di udara...*\n>\n> 💰 Taruhan: 🪙 **${taruhan.toLocaleString('id-ID')}**\n> 🎯 Pilihan: **${choice === 'head' ? '🪙 Head' : '🦅 Tail'}**`);
                await interaction.editReply({ embeds: [anim2], components: [] }).catch(()=>{});
                
                setTimeout(async () => {
                    // Animation stage 3
                    const anim3 = new EmbedBuilder().setColor('#E67E22').setTitle('🪙 Coinflip — Mendarat...').setDescription(`> ✨ *Koin hampir mendarat...*\n>\n> 💰 Taruhan: 🪙 **${taruhan.toLocaleString('id-ID')}**\n> 🎯 Pilihan: **${choice === 'head' ? '🪙 Head' : '🦅 Tail'}**`);
                    await interaction.editReply({ embeds: [anim3], components: [] }).catch(()=>{});
                    
                    setTimeout(async () => {
                        // Final result
                        const coinResult = Math.random() < 0.5 ? 'head' : 'tail';
                        const won = choice === coinResult;
                        const resultEmoji = coinResult === 'head' ? '🪙' : '🦅';
                        const resultName = coinResult === 'head' ? 'HEAD' : 'TAIL';
                        
                        if (won) {
                            db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(taruhan * 2, guildId, interaction.user.id);
                            incrementUserStat(guildId, interaction.user.id, 'coinflip_wins');
                            await checkAchievements(interaction.guild, interaction.user.id, { type: 'coinflip' });
                            const freshData = getOrCreateUser(guildId, interaction.user.id);
                            const winEmbed = new EmbedBuilder()
                                .setColor('#2ECC71')
                                .setTitle(`${resultEmoji} ${resultName} — MENANG! 🎉`)
                                .setDescription(`> Koin mendarat: ${resultEmoji} **${resultName}**\n> Pilihan kamu: **${choice === 'head' ? '🪙 Head' : '🦅 Tail'}** ✅\n\n> 💰 Dapat: 🪙 **+${taruhan.toLocaleString('id-ID')}**\n> 💳 Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**`)
                                .setFooter({ text: interaction.user.username });
                            interaction.editReply({ embeds: [winEmbed], components: [] }).catch(()=>{});
                        } else {
                            await checkAchievements(interaction.guild, interaction.user.id, { type: 'coinflip' });
                            const freshData = getOrCreateUser(guildId, interaction.user.id);
                            const loseEmbed = new EmbedBuilder()
                                .setColor('#E74C3C')
                                .setTitle(`${resultEmoji} ${resultName} — KALAH! 💀`)
                                .setDescription(`> Koin mendarat: ${resultEmoji} **${resultName}**\n> Pilihan kamu: **${choice === 'head' ? '🪙 Head' : '🦅 Tail'}** ❌\n\n> 💸 Hilang: 🪙 **-${taruhan.toLocaleString('id-ID')}**\n> 💳 Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**`)
                                .setFooter({ text: interaction.user.username });
                            interaction.editReply({ embeds: [loseEmbed], components: [] }).catch(()=>{});
                        }
                    }, 1000);
                }, 1000);
            }, 1000);
            return;
        }

        // --- FISH COLLECTION BUTTONS ---
        if (interaction.customId.startsWith('fcol_')) {
            const parts = interaction.customId.split('_');
            const tier = parts[1];
            const targetUserId = parts[2];
            const page = parseInt(parts[3]) || 0;
            const perPage = 15;
            const collected = db.prepare('SELECT * FROM fish_collection WHERE guildId = ? AND userId = ?').all(guildId, targetUserId);
            const collectedIds = collected.map(c => c.fishId);

            if (tier === 'back') {
                // Go back to main collection view
                const totalFish = FISH_DATA.length;
                const totalCollectedAll = collectedIds.length;
                const percentDex = Math.floor((totalCollectedAll / totalFish) * 100);
                const tiers = ['Trash', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret'];
                let mainDesc = `📖 **Fish Collection / Pokedex**\n> 🐟 **${totalCollectedAll}** / **${totalFish}** spesies ditemukan (**${percentDex}%**)\n\n`;
                for (const t of tiers) { const tf = FISH_DATA.filter(f => f.tier === t); const tc = tf.filter(f => collectedIds.includes(f.id)).length; const te = (FISH_TIERS.find(x => x.tier === t)||{emoji:'🐟'}).emoji; const p = tf.length > 0 ? Math.floor((tc/tf.length)*10) : 0; mainDesc += `${te} **${t}** — ${tc}/${tf.length}\n> \`${'▰'.repeat(p)}${'▱'.repeat(10-p)}\`\n`; }
                mainDesc += `\n> 🎯 *Pilih rarity untuk detail! Setiap ikan menampilkan lokasi mancingnya.*`;
                const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fcol_Trash_${targetUserId}_0`).setLabel('🗑️ Trash').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`fcol_Common_${targetUserId}_0`).setLabel('🐟 Common').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`fcol_Uncommon_${targetUserId}_0`).setLabel('🐠 Uncommon').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`fcol_Rare_${targetUserId}_0`).setLabel('🐡 Rare').setStyle(ButtonStyle.Primary));
                const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fcol_Epic_${targetUserId}_0`).setLabel('🦈 Epic').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(`fcol_Legendary_${targetUserId}_0`).setLabel('🐉 Legend').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`fcol_Mythic_${targetUserId}_0`).setLabel('🌈 Mythic').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`fcol_Secret_${targetUserId}_0`).setLabel('🔮 Secret').setStyle(ButtonStyle.Danger));
                const row3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fish_back_${targetUserId}`).setLabel('🎣 Kembali ke Panel').setStyle(ButtonStyle.Primary));
                return interaction.update({ embeds: [new EmbedBuilder().setTitle('📖 Fish Collection').setColor('#3498DB').setDescription(mainDesc).setFooter({ text: `${totalCollectedAll}/${totalFish} ditemukan` })], components: [row1, row2, row3] });
            }

            // Tier detail view — show fish WITH location
            const tierFish = FISH_DATA.filter(f => f.tier === tier);
            const tierCollected = tierFish.filter(f => collectedIds.includes(f.id)).length;
            const totalPages = Math.ceil(tierFish.length / perPage) || 1;
            const startIdx = page * perPage;
            const pageFish = tierFish.slice(startIdx, startIdx + perPage);
            const tierEmoji = (FISH_TIERS.find(t => t.tier === tier) || {emoji:'🐟'}).emoji;
            let desc = `${tierEmoji} **${tier}** — ${tierCollected}/${tierFish.length} ditemukan\n\n`;
            pageFish.forEach(f => {
                const loc = FISHING_LOCATIONS.find(l => l.id === f.location);
                const locName = loc ? loc.name : '???';
                if (collectedIds.includes(f.id)) {
                    desc += `> ${f.emoji} **${f.name}** ✅ — 📍 ${locName}\n`;
                } else {
                    desc += `> ▪️ ??? 🔒 — 📍 ${locName}\n`;
                }
            });
            if (desc.length > 3900) desc = desc.substring(0, 3890) + '\n...';
            const navRow = new ActionRowBuilder();
            if (page > 0) navRow.addComponents(new ButtonBuilder().setCustomId(`fcol_${tier}_${targetUserId}_${page-1}`).setLabel('◀').setStyle(ButtonStyle.Secondary));
            navRow.addComponents(new ButtonBuilder().setCustomId(`fcol_back_${targetUserId}_0`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Primary));
            if (page < totalPages - 1) navRow.addComponents(new ButtonBuilder().setCustomId(`fcol_${tier}_${targetUserId}_${page+1}`).setLabel('▶').setStyle(ButtonStyle.Secondary));
            navRow.addComponents(new ButtonBuilder().setCustomId(`fish_back_${targetUserId}`).setLabel('🎣 Panel').setStyle(ButtonStyle.Success));
            return interaction.update({ embeds: [new EmbedBuilder().setTitle(`📖 ${tierEmoji} ${tier} Collection`).setColor('#3498DB').setDescription(desc).setFooter({ text: `Halaman ${page+1}/${totalPages} | ${tierCollected}/${tierFish.length} ditemukan` })], components: [navRow] });
        }

        // --- MENU HUB BUTTONS ---
        if (interaction.customId.startsWith('menu_')) {
            const cat = interaction.customId.replace('menu_', '');
            let content = '';
            if (cat === 'economy') content = '💰 **Economy & Casino:**\n\n> `/wallet` — 💰 Economy Panel (saldo, gift, redeem voucher)\n> `/casino` — 🎰 Casino Panel (coinflip, slot, roulette)\n> `/daily` — 🎁 Klaim hadiah harian\n> `/calendar` — 📅 Kalender login & reward\n> `/levelpanel` — 🌟 Rank & leaderboard';
            else if (cat === 'fishing') content = '🎣 **Fishing Commands:**\n\n> `/fish` — Lempar pancing (quick cast)\n> `/fishing` — 🎣 Buka Fishing Panel\n> Panel: Cast, Inventory, Shop, Stats, Collection\n> Lock/Unlock, Sell All — semua dalam 1 panel!';
            else if (cat === 'farming') content = '🌾 **Farming Commands:**\n\n> `/farm` — 🌾 Buka Farm Panel\n> Panel: Plant, Water, Harvest, Shop\n> Storage, Craft, Upgrade, Pupuk — semua dalam 1 panel!';
            else if (cat === 'pet') content = '🐾 **Pet & Battle:**\n\n> `/pet` — Buka Pet Panel (semua fitur ada di sini!)\n> Feed, Play, Hunt, Shop, Dungeon, Boss, Refine, Evolve\n> Semua dalam 1 panel interaktif dengan tombol!\n> `/battle @user` — PvP auto-battle';
            else if (cat === 'profile') content = '📋 **Profil:**\n\n> `/profile` — 📋 Profile Panel\n> Profil, Achievement, Inventory, Streak, Stats\n> Semua dalam 1 panel interaktif!';
            else if (cat === 'shop') content = '🛒 **Shop:**\n\n> `/shop` — Buka toko lengkap\n> Kategori: 🎣 Fishing, 🌾 Farming, 🐾 Pet, 📿 Battle, 🎭 Role';
            else if (cat === 'daily') content = '🎁 **Daily Reward:**\n\n> `/daily` — Klaim hadiah harian\n> Dapat: Money + Pet EXP + Random Item\n> Bonus streak = hadiah lebih besar!';
            else if (cat === 'quest') content = '📜 **Quest:**\n\n> `/quest` — 📜 Quest Panel\n> Misi harian (3/hari) & mingguan (3/minggu)\n> Selesaikan untuk dapat money bonus!\n> Reset setiap 00:00 WIB';
            return interaction.reply({ content, ephemeral: true });
        }

        if (interaction.customId.startsWith('tv_create_')) { const tempVoiceData = db.prepare('SELECT * FROM temp_voices WHERE ownerId = ? AND guildId = ?').get(interaction.user.id, guildId); if (tempVoiceData) return interaction.reply({ content: `❌ Sudah punya channel (<#${tempVoiceData.channelId}>)!`, ephemeral: true }); const jtcCategoryId = getSetting(guildId, 'jtc_category', null); if (!jtcCategoryId) return interaction.reply({ content: '❌ Belum setup!', ephemeral: true }); if (interaction.customId === 'tv_create_custom') { const modal = new ModalBuilder().setCustomId('tv_modal_custom_create').setTitle('Buat Channel'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_custom_name').setLabel('Nama:').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50))); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_custom_limit').setLabel('Limit (0=bebas):').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setPlaceholder('0'))); return interaction.showModal(modal); } let limit = 0, isPrivate = false, vcName = `🔊 ${interaction.user.username}'s Room`; if (interaction.customId === 'tv_create_duo') { limit = 2; vcName = `👥 ${interaction.user.username}'s Duo`; } if (interaction.customId === 'tv_create_squad') { limit = 4; vcName = `👥 ${interaction.user.username}'s Squad`; } if (interaction.customId === 'tv_create_private') { isPrivate = true; vcName = `🔒 ${interaction.user.username}'s Private`; } await interaction.deferReply({ ephemeral: true }); try { const newVc = await interaction.guild.channels.create({ name: vcName, type: ChannelType.GuildVoice, parent: jtcCategoryId, userLimit: limit, permissionOverwrites: [{ id: guildId, allow: isPrivate ? [] : [PermissionsBitField.Flags.ViewChannel], deny: isPrivate ? [PermissionsBitField.Flags.Connect] : [] }, { id: interaction.user.id, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.Connect] }] }); db.prepare('INSERT INTO temp_voices (channelId, guildId, ownerId) VALUES (?, ?, ?)').run(newVc.id, guildId, interaction.user.id); interaction.editReply(`✅ Dibuat! <#${newVc.id}> (60 detik)`); setTimeout(async () => { const ch = interaction.guild.channels.cache.get(newVc.id); if (ch && ch.members.size === 0) { await ch.delete().catch(()=>{}); db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(newVc.id); } }, 60000); } catch(e) { interaction.editReply('❌ Gagal.'); } return; }

        if (interaction.customId.startsWith('tv_') && !interaction.customId.startsWith('tv_create_')) { const voiceChannel = interaction.member.voice.channel; if (!voiceChannel) return interaction.reply({ content: '❌ Masuk VC dulu!', ephemeral: true }); const channelId = voiceChannel.id, tempVoice = db.prepare('SELECT * FROM temp_voices WHERE channelId = ? AND guildId = ?').get(channelId, guildId); if (!tempVoice) return interaction.reply({ content: '❌ Bukan temp voice.', ephemeral: true }); if (interaction.customId === 'tv_claim') { if (tempVoice.ownerId === interaction.user.id) return interaction.reply({content: '❌ Sudah owner!', ephemeral: true}); if (voiceChannel.members.has(tempVoice.ownerId)) return interaction.reply({content: '❌ Owner masih ada!', ephemeral: true}); db.prepare('UPDATE temp_voices SET ownerId = ? WHERE channelId = ?').run(interaction.user.id, channelId); await voiceChannel.permissionOverwrites.edit(tempVoice.ownerId, { ManageChannels: null, ManageRoles: null }).catch(()=>{}); await voiceChannel.permissionOverwrites.edit(interaction.user.id, { ManageChannels: true, ManageRoles: true }).catch(()=>{}); return interaction.reply({content: '👑 Kamu owner sekarang!', ephemeral: true}); } if (tempVoice.ownerId !== interaction.user.id) return interaction.reply({content: '❌ Owner only.', ephemeral: true}); if (interaction.customId === 'tv_name') { const m = new ModalBuilder().setCustomId(`tv_modal_name_${channelId}`).setTitle('Ubah Nama'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_name').setLabel('Nama:').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50))); return interaction.showModal(m); } if (interaction.customId === 'tv_limit') { const m = new ModalBuilder().setCustomId(`tv_modal_limit_${channelId}`).setTitle('Ubah Limit'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_limit').setLabel('Limit (0=unlimited):').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2))); return interaction.showModal(m); } if (interaction.customId === 'tv_privacy') { const p = voiceChannel.permissionOverwrites.cache.get(guildId), locked = p && p.deny.has(PermissionsBitField.Flags.Connect); if (locked) { await voiceChannel.permissionOverwrites.edit(guildId, { Connect: null }).catch(()=>{}); return interaction.reply({content: '🔓 Terbuka.', ephemeral: true}); } else { await voiceChannel.permissionOverwrites.edit(guildId, { Connect: false }).catch(()=>{}); return interaction.reply({content: '🔒 Dikunci.', ephemeral: true}); } } if (interaction.customId === 'tv_hide') { const p = voiceChannel.permissionOverwrites.cache.get(guildId), hidden = p && p.deny.has(PermissionsBitField.Flags.ViewChannel); if (hidden) { await voiceChannel.permissionOverwrites.edit(guildId, { ViewChannel: null }).catch(()=>{}); return interaction.reply({content: '👁️ Terlihat.', ephemeral: true}); } else { await voiceChannel.permissionOverwrites.edit(guildId, { ViewChannel: false }).catch(()=>{}); return interaction.reply({content: '👻 Tersembunyi.', ephemeral: true}); } } if (interaction.customId === 'tv_kick') { const m = new ModalBuilder().setCustomId(`tv_modal_kick_${channelId}`).setTitle('Kick'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_kick').setLabel('User ID:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_block') { const m = new ModalBuilder().setCustomId(`tv_modal_block_${channelId}`).setTitle('Block'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_block').setLabel('User ID:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_unblock') { const m = new ModalBuilder().setCustomId(`tv_modal_unblock_${channelId}`).setTitle('Unblock'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_unblock').setLabel('User ID:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_transfer') { const m = new ModalBuilder().setCustomId(`tv_modal_transfer_${channelId}`).setTitle('Transfer'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_transfer').setLabel('User ID baru:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_delete') { await voiceChannel.delete().catch(()=>{}); db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(channelId); return interaction.reply({content: '🗑️ Dihapus.', ephemeral: true}); } }

        // --- FISHING INVENTORY PAGINATION (legacy — fishPanel now handles its own pagination) ---
        if (interaction.customId.startsWith('finv_prev_') || interaction.customId.startsWith('finv_next_')) {
            const currentPage = parseInt(interaction.customId.split('_')[2]);
            const newPage = interaction.customId.startsWith('finv_prev_') ? currentPage - 1 : currentPage + 1;
            const tierOrder = { 'Secret': 0, 'Mythic': 1, 'Legendary': 2, 'Epic': 3, 'Rare': 4, 'Uncommon': 5, 'Common': 6, 'Trash': 7 };
            const allInventory = db.prepare('SELECT * FROM fish_inventory WHERE guildId = ? AND userId = ?').all(guildId, interaction.user.id);
            const totalCount = allInventory.length;
            const lockedCount = allInventory.filter(i => i.locked === 1).length;
            if (totalCount === 0) return interaction.reply({ content: '🎒 Inventory ikan kosong!', ephemeral: true });
            const sorted = allInventory.sort((a, b) => {
                const fishA = FISH_DATA.find(f => f.id === a.fishId); const fishB = FISH_DATA.find(f => f.id === b.fishId);
                const tierA = fishA ? (tierOrder[fishA.tier] ?? 99) : 99; const tierB = fishB ? (tierOrder[fishB.tier] ?? 99) : 99;
                if (tierA !== tierB) return tierA - tierB; return b.weight - a.weight;
            });
            const perPage = 20; const totalPages = Math.ceil(totalCount / perPage);
            const page = Math.min(Math.max(1, newPage), totalPages);
            const start = (page - 1) * perPage; const pageItems = sorted.slice(start, start + perPage);
            let desc = `🎒 **Total: ${totalCount} ikan** (🔒 Locked: ${lockedCount})\n\n`;
            pageItems.forEach((item) => { const fd = FISH_DATA.find(f => f.id === item.fishId); const tier = fd ? FISH_TIERS.find(t => t.tier === fd.tier) : null; const lockIcon = item.locked ? '🔒 ' : ''; const tierTag = fd ? `**(${fd.tier})**` : ''; desc += `**ID #${item.id}** ${lockIcon}${tier ? tier.emoji : '🐟'} **${fd ? fd.name : '?'}** — ${item.weight} kg ${tierTag}\n`; });
            desc += `\n━━━━━━━━━━━━━━━━━━━━━━\n> 📄 Halaman **${page}** / **${totalPages}**`;
            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`finv_prev_${page}`).setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
                new ButtonBuilder().setCustomId(`finv_next_${page}`).setLabel('▶ Next').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
            );
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎣 Fishing Inventory').setColor('#2B2D31').setDescription(desc)], components: [navRow], ephemeral: true });
        }

        // --- BOSS PARTY BUTTONS ---
        if (interaction.customId.startsWith('boss_join_')) {
            const leaderId = interaction.customId.replace('boss_join_', '');
            const partyId = `${guildId}_${leaderId}`;
            const party = activeBossParties.get(partyId);
            if (!party) return interaction.reply({ content: '❌ Party sudah expire atau sudah dimulai!', ephemeral: true });
            if (party.members.includes(interaction.user.id)) return interaction.reply({ content: '❌ Kamu sudah di party ini!', ephemeral: true });
            const myPet = getPetData(guildId, interaction.user.id);
            if (!myPet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
            const boss = BOSS_LIST.find(b => b.id === party.bossId);
            if (myPet.level < boss.minLevel) return interaction.reply({ content: `❌ Pet kamu butuh minimal **Lv.${boss.minLevel}**!`, ephemeral: true });
            if (party.members.length >= 10) return interaction.reply({ content: '❌ Party sudah penuh (10/10)!', ephemeral: true });
            party.members.push(interaction.user.id);
            
            // Update embed
            const memberList = party.members.map((m, i) => `> ${i === 0 ? '👑' : '⚔️'} <@${m}>${i === 0 ? ' (Leader)' : ''}`).join('\n');
            const joinBtn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`boss_join_${leaderId}`).setLabel(`🎮 Join Party (${party.members.length}/10)`).setStyle(ButtonStyle.Success).setDisabled(party.members.length >= 10),
                new ButtonBuilder().setCustomId(`boss_start_${leaderId}`).setLabel('⚔️ Start Battle').setStyle(ButtonStyle.Danger)
            );
            const embed = new EmbedBuilder().setColor('#E74C3C').setTitle(`👹 BOSS RAID: ${boss.name}`).setDescription(`Party untuk melawan **${boss.name}**!\n\n> ❤️ HP: **${boss.hp.toLocaleString()}** | ⚔️ ATK: ${boss.atk}\n> 🎁 Reward: 🪙 ${boss.reward[0].toLocaleString()}-${boss.reward[1].toLocaleString()}/member\n\n**Party Members (${party.members.length}/10):**\n${memberList}\n\n*Leader klik Start untuk mulai!*`).setFooter({ text: 'Party expire dalam 5 menit' });
            await interaction.update({ embeds: [embed], components: [joinBtn] });
            return;
        }
        if (interaction.customId.startsWith('boss_start_')) {
            const leaderId = interaction.customId.replace('boss_start_', '');
            if (interaction.user.id !== leaderId) return interaction.reply({ content: '❌ Hanya leader yang bisa start!', ephemeral: true });
            const partyId = `${guildId}_${leaderId}`;
            const party = activeBossParties.get(partyId);
            if (!party) return interaction.reply({ content: '❌ Party tidak ditemukan!', ephemeral: true });
            activeBossParties.delete(partyId);
            
            const boss = BOSS_LIST.find(b => b.id === party.bossId);
            let totalDmg = 0, log = [`👹 **${boss.name}** — HP: ${boss.hp.toLocaleString()}\n`];
            for (const memberId of party.members) {
                const mPet = getPetData(guildId, memberId);
                if (!mPet) continue;
                const mPetDef = PET_DATA.find(p => p.id === mPet.petId);
                const dmg = (mPet.atk + mPet.level) * getRandomInt(3, 6);
                totalDmg += dmg;
                log.push(`> ${mPetDef ? mPetDef.emoji : '🐾'} **${mPet.name}** (Lv.${mPet.level}) → **${dmg}** dmg`);
            }
            const won = totalDmg >= boss.hp;
            log.push(`\n> 💥 Total: **${totalDmg.toLocaleString()}** / ${boss.hp.toLocaleString()}`);
            
            if (won) {
                log.push(`\n🏆 **BOSS DEFEATED!**`);
                for (const memberId of party.members) {
                    const reward = getRandomInt(boss.reward[0], boss.reward[1]);
                    const md = getOrCreateUser(guildId, memberId); md.balance += reward;
                    db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(md.balance, guildId, memberId);
                    addPetExp(guildId, memberId, boss.exp);
                    addItem(guildId, memberId, 'refine_stone', getRandomInt(1, 2));
                    incrementUserStat(guildId, memberId, 'boss_kills');
                    addIncome(guildId, memberId, 'battle', reward);
                    await checkAchievements(interaction.guild, memberId, { type: 'boss_kill' });
                    if (Math.random() < 0.2) { const slot = ['weapon','armor','accessory'][Math.floor(Math.random()*3)]; const rarity = Math.random()<0.1?'Legendary':Math.random()<0.3?'Epic':'Rare'; const names = RELIC_NAMES[slot]; const name = names[Math.floor(Math.random()*names.length)]; const st = slot==='weapon'?'atk':slot==='armor'?'def':(Math.random()<0.5?'spd':'crit'); const sv = rarity==='Legendary'?getRandomInt(50,80):rarity==='Epic'?getRandomInt(35,50):getRandomInt(20,35); db.prepare('INSERT INTO relics (guildId, userId, name, slot, rarity, stat_type, stat_value) VALUES (?, ?, ?, ?, ?, ?, ?)').run(guildId, memberId, name, slot, rarity, st, sv); }
                }
                log.push(`> 🎁 Reward → ${party.members.length} members!`);
            } else {
                log.push(`\n💀 **FAILED!**`);
                for (const memberId of party.members) { const md = getOrCreateUser(guildId, memberId); const p = Math.floor(md.balance*0.05); md.balance -= p; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(md.balance, guildId, memberId); }
                log.push(`> 🪙 -5% money semua member`);
            }
            const embed = new EmbedBuilder().setColor(won ? '#FFD700' : '#E74C3C').setTitle(`👹 ${boss.name}`).setDescription(log.join('\n')).setFooter({ text: `${party.members.length} members` });
            await interaction.update({ embeds: [embed], components: [] });
            return;
        }

        if (interaction.customId === 'airdrop_claim') { if (!activeMiniEvents.has(guildId)) return interaction.reply({ content: '❌ Sudah diklaim orang lain!', ephemeral: true }); activeMiniEvents.delete(guildId); const reward = getRandomInt(300, 600); db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(reward, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'event_wins'); addIncome(guildId, interaction.user.id, 'event', reward); await checkAchievements(interaction.guild, interaction.user.id, { type: 'event_win' }); return interaction.update({ content: `🎉 <@${interaction.user.id}> klaim Air Drop! 🪙 **${reward}**`, embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('x').setLabel(`Diklaim ${interaction.user.username}`).setStyle(ButtonStyle.Secondary).setDisabled(true))] }); }
        // Legacy claim_quest_ and claim_weekly_ buttons (kept for backward compat with old messages)
        if (interaction.customId.startsWith('claim_quest_')) { const qi = parseInt(interaction.customId.replace('claim_quest_', '')), today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); let row = db.prepare('SELECT * FROM daily_quests WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id); if (!row || row.date !== today) return interaction.update({ content: '\u274c Expired. Gunakan `/quest` untuk panel baru.', embeds: [], components: [] }); let quests = JSON.parse(row.data), tq = quests[qi]; if (tq.progress < tq.target || tq.claimed) return interaction.reply({content: '\u274c Belum selesai!', ephemeral: true}); tq.claimed = true; db.prepare('UPDATE daily_quests SET data = ? WHERE guildId = ? AND userId = ?').run(JSON.stringify(quests), guildId, interaction.user.id); let ud = getOrCreateUser(guildId, interaction.user.id); ud.balance += tq.reward; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(ud.balance, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'total_quests_done'); addIncome(guildId, interaction.user.id, 'quest', tq.reward); await checkAchievements(interaction.guild, interaction.user.id, { type: 'quest' }); if (quests.every(q => q.claimed)) await checkAchievements(interaction.guild, interaction.user.id, { type: 'all_quest_day' }); let bonusMsg = ''; const streakResult = checkDailyQuestStreak(guildId, interaction.user.id); if (streakResult) { addIncome(guildId, interaction.user.id, 'quest', streakResult.bonus); if (streakResult.weeklyBonus) addIncome(guildId, interaction.user.id, 'quest', 1000); bonusMsg = `\n\n\ud83c\udf81 **ALL DONE BONUS: +200 Money!**\n> \ud83c\udfc5 Perfect Days: ${streakResult.perfectDays}`; if (streakResult.weeklyBonus) bonusMsg += `\n\n\ud83c\udf89\ud83c\udf89 **7-DAY STREAK BONUS!** +1000 Money + \ud83d\udce6 Mystery Box! \ud83c\udf89\ud83c\udf89`; } return interaction.reply(`\u2705 Dapat \ud83e\ude99 **${tq.reward}**!${bonusMsg}`); }
        if (interaction.customId.startsWith('claim_weekly_')) { const qi = parseInt(interaction.customId.replace('claim_weekly_', '')); const week = getWeekId(); let row = db.prepare('SELECT * FROM weekly_quests WHERE guildId = ? AND userId = ? AND week = ?').get(guildId, interaction.user.id, week); if (!row) return interaction.update({ content: '\u274c Expired. Gunakan `/quest` untuk panel baru.', embeds: [], components: [] }); let quests = JSON.parse(row.data), tq = quests[qi]; if (!tq || tq.progress < tq.target || tq.claimed) return interaction.reply({content: '\u274c Belum selesai atau sudah diklaim!', ephemeral: true}); tq.claimed = true; db.prepare('UPDATE weekly_quests SET data = ? WHERE guildId = ? AND userId = ? AND week = ?').run(JSON.stringify(quests), guildId, interaction.user.id, week); let ud = getOrCreateUser(guildId, interaction.user.id); ud.balance += tq.reward; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(ud.balance, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'total_weekly_quests_done'); addIncome(guildId, interaction.user.id, 'quest', tq.reward); return interaction.reply(`\u2705 Weekly Quest selesai! Dapat \ud83e\ude99 **${tq.reward.toLocaleString('id-ID')}**!`); }
        if (interaction.customId === 'cancel_buy') return interaction.update({ content: '\u274c Dibatalkan.', components: [] });
        if (interaction.customId.startsWith('confirm_')) { const selected = interaction.customId.substring(8), userData = getOrCreateUser(guildId, interaction.user.id); let finalItemName = '', finalPrice = 0; if (selected.startsWith('item_')) { const parts = selected.substring(5).split('_'); const itemPrice = parseInt(parts.pop()); const itemName = parts.join('_'); const item = db.prepare('SELECT * FROM shop_items WHERE guildId = ? AND name = ? AND price = ? LIMIT 1').get(guildId, itemName, itemPrice); if (!item) return interaction.update({content: '❌ Habis!', components: []}); if (userData.balance < item.price) return interaction.update({content: '❌ Saldo kurang!', components: []}); try { await interaction.user.send(`🛍️ **${item.name}**:\n\`\`\`\n${item.content}\n\`\`\``); } catch(e) { return interaction.update({content: '❌ DM tertutup!', components: []}); } userData.balance -= item.price; finalItemName = item.name; finalPrice = item.price; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); db.prepare('DELETE FROM shop_items WHERE id = ?').run(item.id); } if (selected.startsWith('role_')) { const roleId = selected.substring(5), sr = db.prepare('SELECT * FROM shop_roles WHERE guildId = ? AND roleId = ?').get(guildId, roleId); if (!sr) return interaction.update({content: '❌ Tidak dijual.', components: []}); if (userData.balance < sr.price) return interaction.update({content: '❌ Saldo kurang!', components: []}); if (interaction.member.roles.cache.has(roleId)) return interaction.update({content: '❌ Sudah punya!', components: []}); userData.balance -= sr.price; const role = interaction.guild.roles.cache.get(roleId); finalItemName = role ? `Role ${role.name}` : 'Role'; finalPrice = sr.price; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); if (role) await interaction.member.roles.add(role).catch(()=>{}); } incrementUserStat(guildId, interaction.user.id, 'total_buys'); if (finalPrice > 0) { updateQuestProgress(guildId, interaction.user.id, 'spend_money', finalPrice); addSpending(guildId, interaction.user.id, 'shop', finalPrice); } await checkAchievements(interaction.guild, interaction.user.id, { type: 'buy' }); db.prepare('INSERT INTO logs (guildId, time, userId, action, item, price) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, Date.now(), interaction.user.id, 'BUY', finalItemName, finalPrice); const ts = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, 'testimoni_channel'); if (ts) { const tc = interaction.guild.channels.cache.get(ts.value); if (tc) tc.send({ embeds: [new EmbedBuilder().setColor('#2B2D31').setDescription(`<@${interaction.user.id}> beli **${finalItemName}** (🪙 ${finalPrice.toLocaleString('id-ID')})`).setTimestamp()] }).catch(()=>{}); } return interaction.update({content: `✅ Berhasil beli **${finalItemName}**!`, components: []}); }
    }


    // ================= MODAL HANDLERS =================
    if (interaction.isModalSubmit()) {
        // --- FISHING PANEL MODAL (Lock/Unlock) ---
        if (isFishingPanelModal(interaction.customId)) {
            return handleFishingModal(interaction);
        }

        // --- FARM PANEL MODAL (Seed Quantity) ---
        if (isFarmPanelModal(interaction.customId)) {
            return handleFarmModal(interaction);
        }

        // --- PET PANEL MODAL (Rename) ---
        if (isPetPanelModal(interaction.customId)) {
            return handlePetModal(interaction);
        }

        // --- ADMIN PANEL MODAL ---
        if (isAdminPanelModal(interaction.customId)) {
            return handleAdminModal(interaction);
        }

        // --- ECONOMY PANEL MODAL ---
        if (isEconomyPanelModal(interaction.customId)) {
            return handleEconomyModal(interaction);
        }

        // --- TRADE PANEL MODAL ---
        if (isTradePanelModal(interaction.customId)) {
            return handleTradeModal(interaction);
        }

        // --- MARKET PANEL MODAL ---
        if (isMarketPanelModal(interaction.customId)) {
            return handleMarketModal(interaction);
        }

        if (interaction.customId === 'tv_modal_custom_create') { const vcName = interaction.fields.getTextInputValue('tv_input_custom_name'); let limit = parseInt(interaction.fields.getTextInputValue('tv_input_custom_limit')); if (isNaN(limit)) limit = 0; const jtcCategoryId = getSetting(guildId, 'jtc_category', null); if (!jtcCategoryId) return interaction.reply({content: '❌ Belum setup!', ephemeral: true}); await interaction.deferReply({ephemeral: true}); try { const newVc = await interaction.guild.channels.create({ name: vcName, type: ChannelType.GuildVoice, parent: jtcCategoryId, userLimit: limit, permissionOverwrites: [{id: guildId, allow: [PermissionsBitField.Flags.ViewChannel]}, {id: interaction.user.id, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.Connect]}] }); db.prepare('INSERT INTO temp_voices (channelId, guildId, ownerId) VALUES (?, ?, ?)').run(newVc.id, guildId, interaction.user.id); interaction.editReply(`✅ <#${newVc.id}> (60 detik)`); setTimeout(async()=>{const ch=interaction.guild.channels.cache.get(newVc.id);if(ch&&ch.members.size===0){await ch.delete().catch(()=>{});db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(newVc.id);}},60000); } catch(e) { interaction.editReply('❌ Gagal.'); } return; }

        if (interaction.customId.startsWith('tv_modal_')) { const parts = interaction.customId.split('_'), actionType = parts[2], channelId = parts.slice(3).join('_'), voiceChannel = interaction.guild.channels.cache.get(channelId); if (!voiceChannel) return interaction.reply({content: '❌ Channel hilang.', ephemeral: true}); const tempVoice = db.prepare('SELECT * FROM temp_voices WHERE channelId = ? AND guildId = ?').get(channelId, guildId); if (!tempVoice || tempVoice.ownerId !== interaction.user.id) return interaction.reply({content: '❌ Bukan owner!', ephemeral: true}); if (actionType === 'name') { await voiceChannel.setName(interaction.fields.getTextInputValue('tv_input_name')).catch(()=>{}); return interaction.reply({content: '✅ Diubah.', ephemeral: true}); } if (actionType === 'limit') { let l = parseInt(interaction.fields.getTextInputValue('tv_input_limit')); if (isNaN(l)) l = 0; await voiceChannel.setUserLimit(l).catch(()=>{}); return interaction.reply({content: `✅ Limit: ${l||'unlimited'}`, ephemeral: true}); } if (actionType === 'kick') { const tid = interaction.fields.getTextInputValue('tv_input_kick'), m = voiceChannel.members.get(tid); if (!m) return interaction.reply({content: '❌ Tidak ada.', ephemeral: true}); await m.voice.disconnect().catch(()=>{}); return interaction.reply({content: `👢 Kicked.`, ephemeral: true}); } if (actionType === 'block') { const tid = interaction.fields.getTextInputValue('tv_input_block'); await voiceChannel.permissionOverwrites.edit(tid, {Connect: false, ViewChannel: false}).catch(()=>{}); const m = voiceChannel.members.get(tid); if (m) await m.voice.disconnect().catch(()=>{}); return interaction.reply({content: '🚫 Blocked.', ephemeral: true}); } if (actionType === 'unblock') { const tid = interaction.fields.getTextInputValue('tv_input_unblock'); await voiceChannel.permissionOverwrites.edit(tid, {Connect: null, ViewChannel: null}).catch(()=>{}); return interaction.reply({content: '🟢 Unblocked.', ephemeral: true}); } if (actionType === 'transfer') { const tid = interaction.fields.getTextInputValue('tv_input_transfer'), m = voiceChannel.members.get(tid); if (!m) return interaction.reply({content: '❌ User harus di VC.', ephemeral: true}); db.prepare('UPDATE temp_voices SET ownerId = ? WHERE channelId = ?').run(tid, channelId); await voiceChannel.permissionOverwrites.edit(interaction.user.id, {ManageChannels: null, ManageRoles: null}).catch(()=>{}); await voiceChannel.permissionOverwrites.edit(tid, {ManageChannels: true, ManageRoles: true}).catch(()=>{}); return interaction.reply({content: `🔄 Transferred.`, ephemeral: true}); } }

        if (interaction.customId.startsWith('submit_cr_')) { const colorData = interaction.customId.replace('submit_cr_', ''), crPrice = parseInt(getSetting(guildId, 'custom_role_price', '0')), userData = getOrCreateUser(guildId, interaction.user.id); if (userData.balance < crPrice) return interaction.reply({content: '❌ Saldo kurang!', ephemeral: true}); const roleName = interaction.fields.getTextInputValue('cr_name'); let roleColor = colorData === 'custom' ? interaction.fields.getTextInputValue('cr_color') : `#${colorData}`; if (!/^#[0-9A-F]{6}$/i.test(roleColor)) return interaction.reply({content: '❌ Format hex salah!', ephemeral: true}); await interaction.deferReply(); try { userData.balance -= crPrice; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); const targetRoleId = '1062034108433301515', targetRole = interaction.guild.roles.cache.get(targetRoleId); let targetPos = targetRole ? Math.max(1, targetRole.position - 1) : Math.max(1, (interaction.guild.members.me.roles.highest.position || 1) - 1); const newRole = await interaction.guild.roles.create({ name: roleName, color: roleColor, hoist: true, position: targetPos, reason: `Custom Role: ${interaction.user.username}` }); await interaction.member.roles.add(newRole); db.prepare('INSERT INTO logs (guildId, time, userId, action, item, price) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, Date.now(), interaction.user.id, 'BUY', `Custom Role: ${roleName}`, crPrice); incrementUserStat(guildId, interaction.user.id, 'total_buys'); await checkAchievements(interaction.guild, interaction.user.id, { type: 'custom_role' }); await checkAchievements(interaction.guild, interaction.user.id, { type: 'buy' }); const ts = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, 'testimoni_channel'); if (ts) { const tc = interaction.guild.channels.cache.get(ts.value); if (tc) tc.send({ embeds: [new EmbedBuilder().setColor(roleColor).setDescription(`<@${interaction.user.id}> buat **${roleName}** (🪙 ${crPrice.toLocaleString('id-ID')})`).setTimestamp()] }).catch(()=>{}); } return interaction.editReply(`🎉 Custom Role <@&${newRole.id}> dibuat! 🪙 **${crPrice.toLocaleString('id-ID')}**`); } catch(e) { userData.balance += crPrice; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); console.error(e); return interaction.editReply('❌ Gagal. Uang dikembalikan.'); } }

        // --- SEED QUANTITY MODAL ---
        if (interaction.customId.startsWith('seed_qty_')) {
            const cropId = interaction.customId.replace('seed_qty_', '');
            const crop = FARM_CROPS.find(c => c.id === cropId);
            if (!crop) return interaction.reply({ content: '❌ Bibit tidak ditemukan!', ephemeral: true });
            const input = interaction.fields.getTextInputValue('seed_qty_input');
            const qty = parseInt(input);
            if (isNaN(qty) || qty < 1 || qty > 999) return interaction.reply({ content: '❌ Masukkan angka valid (1-999)!', ephemeral: true });
            const totalCost = crop.cost * qty;
            const userData = getOrCreateUser(guildId, interaction.user.id);
            if (userData.balance < totalCost) {
                const affordable = Math.floor(userData.balance / crop.cost);
                return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${totalCost.toLocaleString('id-ID')}** untuk ${qty} bibit.\n> Kamu hanya mampu beli **${affordable}** bibit (🪙 ${(affordable * crop.cost).toLocaleString('id-ID')}).`, ephemeral: true });
            }
            db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(totalCost, guildId, interaction.user.id);
            addSeed(guildId, interaction.user.id, cropId, qty);
            const owned = getSeedCount(guildId, interaction.user.id, cropId);
            return interaction.reply({ content: `✅ Membeli ${crop.emoji} **${crop.name}** x**${qty}**!\n> 💰 Total harga: 🪙 **${totalCost.toLocaleString('id-ID')}**\n> 📦 Total bibit ${crop.name}: **${owned}**\n> 💡 Tanam lewat `/farm` → 🌱 Plant` });
        }
    }
};
