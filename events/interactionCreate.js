// events/interactionCreate.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser, getConf, getSetting, setSetting, getUserStat, incrementUserStat, addIncome, addSpending, getItemCount, addItem, removeItem, getPetFoodCount, addPetFood, removePetFood, getAllPetFood, getSeedCount, addSeed, removeSeed, getAllSeeds } = require('../database');
const { getRandomInt, replyTemp } = require('../utils');
const state = require('../state');
const { isFeatureEnabled, getFeatureKeyForCommand, getFeatureDef, getDisabledMessage, getFeatureKeyForInteraction } = require('../systems/featureGate');
const { ACHIEVEMENTS, checkAchievements, getAchievementProgress } = require('../systems/achievements');
const { addComboFeature, getComboMultiplier } = require('../systems/combo');
const { getContestState, startFishContest, addContestEntry, getContestLeaderboard } = require('../systems/contest');
const { generatePetStats, simulateBattle, simulatePvP, getPetData, getAllPets, addPetExp, checkPetEvolution, evolvePet, elementMultiplier, ELEMENT_EMOJI, getRelicBonus } = require('../systems/pets');
const { handlePetCommand, handlePetButton, handlePetSelectMenu, handlePetModal, isPetPanelButton, isPetPanelSelectMenu, isPetPanelModal } = require('../systems/petPanel');
const { handleExpeditionButton, handleExpeditionSelectMenu, handleExpeditionConfirm, isExpeditionButton, isExpeditionSelectMenu, isExpeditionConfirm } = require('../systems/expedition');
const ui = require('../systems/ui');
const { handleFusionButton, handleFusionSelectMenu, isFusionButton, isFusionSelectMenu } = require('../systems/petFusion');
const { handleMutationButton, isMutationButton } = require('../systems/mutationLab');
const { handleDungeonCoopButton, isDungeonCoopButton } = require('../systems/dungeonCoop');
const { handleWorldBossButton, isWorldBossButton, buildWorldBossPanel } = require('../systems/worldBoss');
const { isLotteryButton, handleLotteryButton, buildLotteryPanel, placeBet, setPot, BET_PRICE, isLotteryModal, handleLotteryModal } = require('../systems/lottery');
const { startBlackjack, handleBlackjackButton, isBlackjackButton, handValue, getCardValue } = require('../systems/blackjack');
const { handleAbilityButton, handleAbilitySelectMenu, isAbilityButton, isAbilitySelectMenu } = require('../systems/petAbilities');
const { handleAwakeningButton, isAwakeningButton } = require('../systems/awakening');
const { handleGuideButton, isGuideButton } = require('../systems/guidePanel');
const { handleFishingCommand, handleFishingButton, handleFishingSelectMenu, handleFishingModal, isFishingPanelButton, isFishingPanelSelectMenu, isFishingPanelModal, buildFishingPanel } = require('../systems/fishPanel');
const { handleFarmCommand, handleFarmButton, handleFarmSelectMenu, handleFarmModal, isFarmPanelButton, isFarmPanelSelectMenu, isFarmPanelModal } = require('../systems/farmPanel');
const { handleArenaCommand, handleArenaButton, handleArenaSelectMenu, isArenaButton, isArenaSelectMenu } = require('../systems/arena');
const { handleAuctionCommand, handleAuctionButton, handleAuctionSelect, handleAuctionModal, isAuctionButton, isAuctionSelect, isAuctionModal } = require('../systems/auction');
const { handleCasinoCommand, handleCasinoButton, handleCasinoSelectMenu, isCasinoPanelButton, isCasinoPanelSelectMenu } = require('../systems/casinoPanel');
const { handleAdminCommand, handleAdminButton, handleAdminModal, isAdminPanelButton, isAdminPanelModal, handleAdminChannelSelect, isAdminPanelChannelSelect } = require('../systems/adminPanel');
const { handleEconomyPanelCommand, handleEconomyButton, handleEconomySelect, handleEconomyModal, handleGiftCommand, isEconomyPanelButton, isEconomyPanelSelect, isEconomyPanelModal } = require('../systems/economyPanel');
const { handleProfilePanelCommand, handleProfileButton, handleProfileSelectMenu, isProfilePanelButton, isProfilePanelSelectMenu } = require('../systems/profilePanel');
const { handleLevelPanelCommand, handleLevelButton, isLevelPanelButton } = require('../systems/levelPanel');
const { handleTradeCommand, handleTradeButton, handleTradeSelectMenu, handleTradeUserSelect, handleTradeModal, isTradePanelButton, isTradePanelSelectMenu, isTradePanelUserSelect, isTradePanelModal } = require('../systems/tradePanel');
const { handleMarketCommand, handleMarketButton, handleMarketSelectMenu, handleMarketModal, isMarketPanelButton, isMarketPanelSelectMenu, isMarketPanelModal } = require('../systems/marketPanel');
const { handleStatsCommand, handleStatsButton, isStatsPanelButton } = require('../systems/statsPanel');
const { handleLeaderboardCommand, handleLeaderboardButton, isLeaderboardButton } = require('../systems/leaderboard');
const { handleInviteCommand, handleInviteButton, isInvitePanelButton, handleInviteModal, isInvitePanelModal } = require('../systems/invitePanel');
const { handleWelcomerCommand, handleWelcomerButton, isWelcomerPanelButton, handleWelcomerChannelSelect, handleWelcomerRoleSelect, handleWelcomerModal, isWelcomerChannelSelect, isWelcomerRoleSelect, isWelcomerPanelModal } = require('../systems/welcomerPanel');
const { handleSelfRoleCommand, handleSelfRoleButton, handleSelfRoleSelect, handleSelfRoleRoleSelect, handleSelfRoleChannelSelect, handleSelfRoleModal, isSelfRolePanelButton, isSelfRolePanelSelect, isSelfRoleRoleSelect, isSelfRoleChannelSelect, isSelfRolePanelModal } = require('../systems/selfRolePanel');
const { handleSelfRolePick, isSelfRolePublicPick } = require('../systems/selfRoles');
const { handleGiveawayCommand, handleGiveawayButton, handleGiveawaySelect, handleGiveawayChannelSelect, handleGiveawayRoleSelect, handleGiveawayBonusRoleSelect, handleGiveawayModal, isGiveawayPanelButton, isGiveawayPanelSelect, isGiveawayChannelSelect, isGiveawayRoleSelect, isGiveawayBonusRoleSelect, isGiveawayPanelModal } = require('../systems/giveawayPanel');
const { handleGiveawayJoin, isGiveawayJoin } = require('../systems/giveaway');
const { handleTempvoiceCommand, handleTempvoiceButton, handleTempvoiceUserSelect, handleTempvoiceModal, isTempvoicePanelButton, isTempvoiceUserSelect, isTempvoiceModal } = require('../systems/tempvoicePanel');
const { handleStreakButton, isStreakPanelButton, buildStreakStatusPanel, buildStreakLeaderboard, buildLoungePanel, setupLounge, syncMemberStreakRole, syncAllMemberStreakRoles } = require('../systems/streakTier');
const { cleanServerLayout } = require('../systems/layoutCleanup');
const { getNotifSettings, toggleNotif, setDmConsent, canDM, wasDmAsked, markDmAsked, buildNotifPanel, buildConsentPrompt } = require('../systems/notifications');
const i18n = require('../systems/i18n');
const consent = require('../systems/consent');
const { catchFish, getEquipment, getPlayerLocation, setPlayerLocation, getFishingCooldown } = require('../systems/fishing');
const { getFarmData, getFarmSlots, getPlots, getStorage, addStorage, removeStorage, getStorageQty } = require('../systems/farming');
const { spinSlot, getSlotResult, GIFT_TAX_RATE, GIFT_RECEIVE_LIMIT_PER_DAY, getGiftReceivedToday, addGiftReceivedToday } = require('../systems/slots');
const { FISH_DATA, FISH_TIERS, BAIT_TYPES, ROD_TYPES, FISHING_LOCATIONS } = require('../data/fish');
const { PET_DATA, PET_FOODS, PET_EGGS, PET_CLASSES, PET_ELEMENTS, PET_EVOLUTIONS, PET_SKILL_MILESTONES, PET_LEVEL_MULTIPLIERS, RELIC_NAMES } = require('../data/pets');
const { ITEMS, CRAFT_RECIPES } = require('../data/items');
const { FARM_LEVELS, FARM_CROPS, FARM_RECIPES, FARM_FERTILIZERS, FARM_DECORATIONS } = require('../data/farming');
const { DUNGEON_TIERS, BOSS_LIST } = require('../data/dungeons');

const { fishCooldowns, slashCooldowns, activeMiniEvents, activeFishEvents, activeBossParties } = state;
const cooldowns = require('../systems/cooldowns');
const { isBlocked, getBlockRemaining, hasPendingCaptcha, shouldTriggerCaptcha, sendCaptcha } = require('../systems/captcha');

async function routeInteraction(interaction) {
    if (!interaction.guild) return interaction.reply({content: 'Hanya di Server!', ephemeral: true});
    const guildId = interaction.guild.id;

    // Single-Guild Lockdown: Bot hanya aktif di server utama ID COMMUNITY
    if (process.env.NODE_ENV !== 'test') {
        const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID || '1056412836433240074';
        const isMainGuild = guildId === MAIN_GUILD_ID || (interaction.guild.name && interaction.guild.name.toUpperCase().includes('ID COMMUNITY'));
        if (!isMainGuild) {
            if (typeof interaction.guild.leave === 'function') {
                interaction.guild.leave().catch(() => {});
            }
            return interaction.reply({ content: '❌ Bot ini hanya aktif eksklusif di server **ID COMMUNITY**.', ephemeral: true });
        }
    }

    // === MAINTENANCE MODE === semua fitur dimatikan sementara (kecuali Streak via chat).
    // Owner tetap boleh pakai untuk administrasi.
    const { isMaintenance, isOwner } = require('../systems/maintenance');
    if (isMaintenance() && !isOwner(interaction.user.id)) {
        const msg = '🛠️ **Bot sedang dalam perbaikan sementara.**\nSemua fitur dimatikan dulu — **kecuali Streak** (cukup chat seperti biasa untuk jaga streak 🔥).\nNantikan update ya! 🙏';
        try {
            if (interaction.isChatInputCommand && interaction.isChatInputCommand()) return interaction.reply({ content: msg, ephemeral: true });
            if (interaction.isButton?.() || interaction.isAnySelectMenu?.() || interaction.isStringSelectMenu?.() || interaction.isModalSubmit?.()) {
                return interaction.reply({ content: msg, ephemeral: true });
            }
        } catch (e) { /* ignore */ }
        return;
    }

    // Block command usage in restricted channels (configurable via admin panel)
    const { getSetting } = require('../database');
    const blockedChannelsRaw = getSetting(guildId, 'blocked_channels', '');
    const blockedChannels = blockedChannelsRaw ? blockedChannelsRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
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

        // === FEATURE GATE: check if the command's feature is enabled ===
        const featureKey = getFeatureKeyForCommand(command);
        if (featureKey && !isFeatureEnabled(guildId, featureKey)) {
            const fDef = getFeatureDef(featureKey);
            return replyTemp(interaction, getDisabledMessage(fDef ? fDef.label : command));
        }


        // === GAME CONSENT (opt-in) ===
        if (consent.isGatedGameCommand(command) && !consent.hasGameConsent(guildId, interaction.user.id)) {
            return interaction.reply({ ...consent.buildGameConsentPrompt(guildId, interaction.user.id), ephemeral: true });
        }

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
                .setFooter({ text: 'idcommunity Bot — Economy & Community' })
                .setTimestamp();
            const welcomeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('🔗 Join Official Server').setStyle(ButtonStyle.Link).setURL('https://discord.gg/idcommunity'),
                new ButtonBuilder().setLabel('📖 Help').setCustomId('welcome_help').setStyle(ButtonStyle.Secondary)
            );
            interaction.channel.send({ embeds: [welcomeEmbed], components: [welcomeRow] }).catch(() => {});
        }

        if (command === 'language') {
            const lang = interaction.options.getString('lang');
            if (lang !== 'id' && lang !== 'en') {
                return interaction.reply({ content: '❌ Invalid language / Pilihan bahasa tidak valid!', ephemeral: true });
            }
            i18n.setLocale(guildId, interaction.user.id, lang);
            const msg = i18n.t(guildId, interaction.user.id, 'language.success');
            return interaction.reply({ content: msg, ephemeral: true });
        }

        if (command === 'help') {
            const helpEmbed = new EmbedBuilder().setTitle('📖 Panduan Lengkap Bot').setColor(ui.COLORS.info).setDescription('Selamat datang! 👋 Hampir semua fitur pakai **panel interaktif** — cukup jalankan command, lalu klik tombolnya.\n\n💡 Baru pertama kali? Mulai dari `/menu` untuk navigasi cepat.\n\n**Daftar Command:**').addFields(
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '💰 **EKONOMI & CASINO**', inline: false },
                { name: '\u200b', value: `> \`/wallet\` — 💰 Economy Panel (saldo, gift, redeem voucher)\n> \`/shop\` — 🛒 Toko server & Role Shop\n> \`/gift\` — 🎁 Kirim money ke member lain\n> \`/daily\` — 🎁 Klaim hadiah harian\n> \`/casino\` — 🎰 Casino Panel (coinflip, slot, roulette)\n> \`/blackjack\` — 🃏 Main kartu 21\n> \`/togel\` — 🎟️ Togel tebak angka`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🔥 **STREAK & PRESTIGE**', inline: false },
                { name: '\u200b', value: `> \`/streak status\` — 🔥 Cek hari streak, role prestige & bonus chat\n> \`/streak leaderboard\` — 🏆 Top 10 streak terpanjang server\n> \`/streak lounge\` — 🏛️ VVIP High-Table Lounge (100+ hari)`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '📋 **PROFIL & PROGRESSION**', inline: false },
                { name: '\u200b', value: `> \`/profile\` — 📋 Profil, Achievement, Stats\n> \`/levelpanel\` — 🌟 Level, Rank & Rewards\n> \`/stats\` — 📊 Statistics Dashboard\n> \`/leaderboard\` — 🏆 Ranking pemain`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🎮 **MINIGAMES & RAMALAN**', inline: false },
                { name: '\u200b', value: `> \`/games\` — 🎮 Quiz 14 kategori (asah otak, tebak gambar, tebak kata)\n> \`/ramalan hari_ini\` — 🔮 Ramalan harian, angka & warna hoki`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🔧 **SERVER TOOLS**', inline: false },
                { name: '\u200b', value: `> \`/invite\` — 📨 Invite Tracker & reward tier\n> \`/tempvoice\` — 🎙️ Buat Private Space (voice & chat privat)\n> \`/selfrole\` — 🎭 Pilih role sendiri`, inline: false }
            );
            if (isAdmin) helpEmbed.addFields({ name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🛡️ **ADMIN**', inline: false }, { name: '\u200b', value: `> \`/admin\` — 🛡️ Admin Panel & konfigurasi server\n> \`/rapihkan\` — 🧹 Auto-rapihkan layout & VVIP lounge\n> \`/welcomer\` — 👋 Konfigurasi welcome/goodbye\n> \`/giveaway\` — 🎉 Panel kelola giveaway`, inline: false });
            helpEmbed.setFooter({ text: '💡 /guide panduan | /menu navigasi utama | discord.gg/idcommunity', iconURL: interaction.client.user.displayAvatarURL() }).setTimestamp();
            return interaction.reply({ embeds: [helpEmbed] });
        }

        // ================= GUIDE (in-bot feature guide) =================
        if (command === 'guide') {
            const { buildGuidePanel } = require('../systems/guidePanel');
            return interaction.reply(buildGuidePanel(interaction.user.id, 'overview'));
        }

        // ================= MENU HUB =================
        if (command === 'menu') {
            const menuEmbed = new EmbedBuilder()
                .setTitle('📱 Menu Utama')
                .setColor(ui.COLORS.info)
                .setDescription(
                    `Halo **${interaction.user.username}**! 👋\nPilih kategori di bawah untuk akses cepat:\n\n` +
                    ui.menuList([
                        { emoji: '💰', label: 'Economy', desc: 'Saldo, Hadiah, Dompet' },
                        { emoji: '🔥', label: 'Streak Prestige', desc: 'Streak harian, Prestige Role, Lounge' },
                        { emoji: '📋', label: 'Profil', desc: 'Profil, Level, Achievement, Stats' },
                        { emoji: '🛒', label: 'Shop', desc: 'Role eksklusif & booster' },
                        { emoji: '🎮', label: 'Games & Ramalan', desc: 'Quiz asah otak, Casino, Ramalan 365' },
                    ]) +
                    `\n\n> 💡 *Ketik \`/help\` untuk panduan lengkap.*`
                )
                .setFooter({ text: ui.footer(`Saldo: ${userData.balance.toLocaleString('id-ID')} • Lv.${userData.level}`) })
                .setTimestamp();
            
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('menu_economy').setLabel('💰 Economy').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('menu_streak').setLabel('🔥 Streak').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('menu_profile').setLabel('📋 Profil').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('menu_shop').setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('menu_daily').setLabel('🎁 Daily').setStyle(ButtonStyle.Success)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('menu_games').setLabel('🎮 Games').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('menu_casino').setLabel('🎰 Casino').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('menu_ramalan').setLabel('🔮 Ramalan').setStyle(ButtonStyle.Secondary)
            );
            return interaction.reply({ embeds: [menuEmbed], components: [row1, row2] });
        }

        if (command === 'daily') {
            const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
            const user = getOrCreateUser(guildId, interaction.user.id);
            if (user.lastDaily === today) return interaction.reply({ content: '⏳ Sudah klaim hari ini! Tunggu besok (00:00 WIB).', ephemeral: true });

            await interaction.deferReply({ ephemeral: true });

            const { claimDaily } = require('../systems/dailyReward');
            const r = await claimDaily(guildId, interaction.user.id, { today });
            if (r.alreadyClaimed) return interaction.editReply({ content: '⏳ Sudah klaim hari ini! Tunggu besok (00:00 WIB).' });

            await checkAchievements(interaction.guild, interaction.user.id, { type: 'daily' });

            // Build reward/bonus description lines.
            const ITEM_LABEL = (id, qty) => { const d = ITEMS.find(i => i.id === id); return `${d ? (d.menuEmoji || '') : ''} ${d ? d.name : id}${qty > 1 ? ` ×${qty}` : ''}`.trim(); };
            let bonusDesc = '';
            if (r.milestoneLabel) bonusDesc += `> 🎉 **${r.milestoneLabel}**\n`;
            if (r.hasDoubler) bonusDesc += `> 📅 **Daily Doubler** aktif! Money x2!\n`;

            const milestoneItems = (r.items || []);
            let itemLines = milestoneItems.map(it => `> 🎁 ${ITEM_LABEL(it.id, it.qty)}`).join('\n');
            if (itemLines) itemLines = '\n' + itemLines;

            let randomReward = '';
            if (r.randomItem) randomReward = `\n> 🎁 **Bonus Item:** ${ITEM_LABEL(r.randomItem, 1)}!`;
            else if (r.randomMoney) randomReward = `\n> 💰 **Bonus Money:** +${r.randomMoney} extra!`;

            const dayInCycle = ((r.streak - 1) % 7);
            const progressBar = '▰'.repeat(dayInCycle + 1) + '▱'.repeat(Math.max(0, 6 - dayInCycle));
            const nextIsMilestone = ((r.streak + 1) % 7 === 0) || [14, 30, 60, 100].includes(r.streak + 1);

            const embed = new EmbedBuilder()
                .setColor(r.milestoneLabel ? '#FFD700' : '#F1C40F')
                .setTitle(r.milestoneLabel ? `🎉 Daily Reward — ${r.milestoneLabel}` : '🎁 Daily Reward!')
                .setDescription(
                    `${bonusDesc}> 🪙 **Money:** +${r.money.toLocaleString('id-ID')}\n` +
                    `> ✨ **XP Bonus:** +${r.xp}${itemLines}${randomReward}\n\n` +
                    `> 🔥 **Streak:** ${r.streak} hari *(ikut streak chat)*\n` +
                    `> **Minggu ini:** \`${progressBar}\` (${dayInCycle + 1}/7)\n` +
                    `> 💡 **Besok:** 🪙 ~${r.nextMoney.toLocaleString('id-ID')}${nextIsMilestone ? ' + 🎉 BONUS!' : ''}`
                )
                .setFooter({ text: 'Makin panjang streak chat kamu, makin gede reward /daily!' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // ================= LEGACY / PURGED COMMANDS =================
        if (['fish', 'fishing', 'farm', 'pet', 'arena', 'auction'].includes(command)) {
            return interaction.reply({ content: '❌ Fitur ini telah dinonaktifkan.', ephemeral: true });
        }

        // ================= CASINO PANEL (Button-based) =================
        if (command === 'casino') {
            return handleCasinoCommand(interaction);
        }

        // ================= ADMIN PANEL (Button-based) =================
        if (command === 'admin') {
            return handleAdminCommand(interaction);
        }

        if (command === 'rapihkan') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ Hanya administrator yang bisa merapikan layout server.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            const res = await cleanServerLayout(interaction.guild);
            if (!res.ok) {
                return interaction.editReply({ content: `❌ Gagal merapikan layout: ${res.error}` });
            }
            const logText = res.log.length > 0 ? res.log.join('\n') : '• Tidak ada channel atau role yang perlu diperbaiki.';
            const embed = new EmbedBuilder()
                .setTitle('🧹 Server Layout Cleaned Up!')
                .setColor('#2ECC71')
                .setDescription(
                    `Berhasil merapikan layout server Discord:\n\n` +
                    `${logText}\n\n` +
                    `> 💡 *Catatan: Pastikan posisi role bot (\`ID BOT\`) di Server Settings ditaruh di atas role member.*`
                )
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        // ================= RAMALAN HARIAN =================
        if (command === 'ramalan') {
            const sub = interaction.options.getSubcommand(false) || 'hari_ini';
            const { getTodayRamalan, buildRamalanEmbed } = require('../systems/dailyRamalan');

            if (sub === 'setup') {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({ content: '❌ Hanya administrator yang bisa mengatur channel ramalan.', ephemeral: true });
                }
                const ch = interaction.options.getChannel('channel');
                setSetting(guildId, 'ramalan_channel', ch.id);
                setSetting(guildId, 'ramalan_enabled', '1');
                return interaction.reply({
                    content: `✅ Channel auto-ramalan harian diset ke <#${ch.id}>!\n> ⏰ Dikirim otomatis setiap hari jam **07:00 WIB**.`,
                    ephemeral: true
                });
            }

            if (sub === 'test') {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({ content: '❌ Hanya administrator yang bisa melakukan tes ramalan.', ephemeral: true });
                }
                const todayRamalan = getTodayRamalan();
                const embed = buildRamalanEmbed(todayRamalan);
                await interaction.channel.send({ embeds: [embed] });
                return interaction.reply({ content: '✅ Tes ramalan harian berhasil dikirim ke channel ini!', ephemeral: true });
            }

            // sub === 'hari_ini'
            const todayRamalan = getTodayRamalan();
            const embed = buildRamalanEmbed(todayRamalan);
            return interaction.reply({ embeds: [embed] });
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
            return interaction.reply({ content: '❌ Fitur battle telah dinonaktifkan.', ephemeral: true });
        }


        // (legacy /admin_shop command removed — shop management is now in the /admin panel)

        if (command === 'shop') {
            const roles = db.prepare('SELECT * FROM shop_roles WHERE guildId = ?').all(guildId);
            const items = db.prepare('SELECT name, price, COUNT(*) as stock FROM shop_items WHERE guildId = ? GROUP BY name, price').all(guildId);
            const crPrice = parseInt(getSetting(guildId, 'custom_role_price', '75000')) || 75000;

            let shopDesc = '🛒 **SELAMAT DATANG DI STORE SERVER**\n';
            shopDesc += 'Gunakan koinmu untuk utilitas komunitas, kosmetik profil, & booster!\n';
            shopDesc += `Saldo kamu: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n\n`;

            const componentsRows = [];

            // 🛡️ KATEGORI A: PROTEKSI & KOSMETIK PROFIL
            const protectItems = ITEMS.filter(i => ['Proteksi', 'Kosmetik'].includes(i.category) && i.price > 0);
            shopDesc += '🛡️ **KATEGORI A: PROTEKSI & KOSMETIK PROFIL**\n';
            protectItems.forEach(i => {
                shopDesc += `> ${i.emoji} **${i.name}** — 🪙 **${i.price.toLocaleString('id-ID')}** | ${i.desc}\n`;
            });
            shopDesc += '\n';

            const protectMenu = new StringSelectMenuBuilder()
                .setCustomId('shop_buy_protect')
                .setPlaceholder('🛡️ Beli Proteksi & Kosmetik Profil...')
                .setMinValues(1)
                .setMaxValues(1);
            protectItems.forEach(i => {
                protectMenu.addOptions(new StringSelectMenuOptionBuilder()
                    .setLabel(`${i.name} (🪙 ${i.price.toLocaleString('id-ID')})`)
                    .setValue(i.id)
                    .setDescription(i.desc.slice(0, 50))
                );
            });
            componentsRows.push(new ActionRowBuilder().addComponents(protectMenu));

            // 💬 KATEGORI B: FITUR SOSIAL
            const socialItems = ITEMS.filter(i => i.category === 'Sosial' && i.price > 0);
            shopDesc += '💬 **KATEGORI B: FITUR SOSIAL**\n';
            socialItems.forEach(i => {
                shopDesc += `> ${i.emoji} **${i.name}** — 🪙 **${i.price.toLocaleString('id-ID')}** | ${i.desc}\n`;
            });
            shopDesc += '\n';

            const socialMenu = new StringSelectMenuBuilder()
                .setCustomId('shop_buy_social')
                .setPlaceholder('💬 Beli Fitur Sosial Komunitas...')
                .setMinValues(1)
                .setMaxValues(1);
            socialItems.forEach(i => {
                socialMenu.addOptions(new StringSelectMenuOptionBuilder()
                    .setLabel(`${i.name} (🪙 ${i.price.toLocaleString('id-ID')})`)
                    .setValue(i.id)
                    .setDescription(i.desc.slice(0, 50))
                );
            });
            componentsRows.push(new ActionRowBuilder().addComponents(socialMenu));

            // ⚡ KATEGORI C: BOOSTER & HIBURAN
            const boosterItems = ITEMS.filter(i => ['Booster', 'Economy', 'Luck', 'Special'].includes(i.category) && i.price > 0);
            shopDesc += '⚡ **KATEGORI C: BOOSTER & HIBURAN**\n';
            boosterItems.forEach(i => {
                shopDesc += `> ${i.emoji} **${i.name}** — 🪙 **${i.price.toLocaleString('id-ID')}** | ${i.desc}\n`;
            });
            shopDesc += '\n';

            const boosterMenu = new StringSelectMenuBuilder()
                .setCustomId('shop_buy_booster')
                .setPlaceholder('⚡ Beli Booster & Hiburan...')
                .setMinValues(1)
                .setMaxValues(1);
            boosterItems.forEach(i => {
                boosterMenu.addOptions(new StringSelectMenuOptionBuilder()
                    .setLabel(`${i.name} (🪙 ${i.price.toLocaleString('id-ID')})`)
                    .setValue(i.id)
                    .setDescription(i.desc.slice(0, 50))
                );
            });
            componentsRows.push(new ActionRowBuilder().addComponents(boosterMenu));

            // 🎭 ROLE SERVER EKSKLUSIF (jika ada)
            if (roles.length > 0 || items.length > 0) {
                shopDesc += '🎭 **ROLE SERVER EKSKLUSIF**\n';
                if (roles.length > 0) roles.forEach(r => { const roleObj = interaction.guild.roles.cache.get(r.roleId); shopDesc += `> ${roleObj ? roleObj.name : '?'} — 🪙 **${r.price.toLocaleString('id-ID')}**\n`; });
                if (items.length > 0) items.forEach(i => { shopDesc += `> 📦 ${i.name} — 🪙 **${i.price.toLocaleString('id-ID')}** (Stok: ${i.stock})\n`; });
                shopDesc += '\n';
                const roleMenu = new StringSelectMenuBuilder().setCustomId('shop_buy_role_misc').setPlaceholder('🎭 Beli Role Server Eksklusif...').setMinValues(1).setMaxValues(1);
                if (roles.length > 0) roles.forEach(r => { const roleObj = interaction.guild.roles.cache.get(r.roleId); roleMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${roleObj ? roleObj.name : '?'}`).setDescription(`🪙 ${r.price.toLocaleString('id-ID')}`).setValue(`role_${r.roleId}`)); });
                if (items.length > 0) items.forEach((i, idx) => { if (idx < 10) roleMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`📦 ${i.name}`).setDescription(`🪙 ${i.price.toLocaleString('id-ID')} | Stok: ${i.stock}`).setValue(`item_${i.name}_${i.price}`)); });
                componentsRows.push(new ActionRowBuilder().addComponents(roleMenu));
            }

            // Truncate desc if too long
            if (shopDesc.length > 4000) shopDesc = shopDesc.substring(0, 3990) + '\n\n*...dan lainnya*';

            return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🛒 ${interaction.guild.name.toUpperCase()} STORE`).setColor('#2B2D31').setDescription(shopDesc).setFooter({ text: `💰 Saldo: ${userData.balance.toLocaleString('id-ID')} | Pilih item dari menu dropdown di bawah` })], components: componentsRows });
        }


        if (['trade', 'market', 'expedition', 'worldboss'].includes(command)) {
            return interaction.reply({ content: '❌ Fitur ini telah dinonaktifkan.', ephemeral: true });
        }

        // ================= TOGEL / LOTTERY =================
        if (command === 'togel') {
            const setpotVal = interaction.options.getInteger('setpot');
            if (setpotVal !== null) {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                    return interaction.reply({ content: '❌ Hanya admin (Manage Server) yang bisa set pot togel.', ephemeral: true });
                }
                const r = setPot(guildId, setpotVal);
                return interaction.reply({ content: `✅ Pot togel di-set ke 🪙 **${r.pot.toLocaleString('id-ID')}** (seed per ronde: 🪙 **${r.amount.toLocaleString('id-ID')}**). Ronde aktif: **#${r.roundId}**.` });
            }
            const promoOpt = interaction.options.getString('promo');
            if (promoOpt !== null) {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                    return interaction.reply({ content: '❌ Hanya admin (Manage Server) yang bisa atur promo togel.', ephemeral: true });
                }
                const { setSetting } = require('../database');
                setSetting(guildId, 'togel_promo_enabled', promoOpt === 'on' ? '1' : '0');
                return interaction.reply({
                    content: promoOpt === 'on'
                        ? '✅ **Promo togel otomatis: AKTIF.** Kartu togel akan muncul sesekali di channel yang sedang ramai (anti-spam: dibatasi cooldown & auto-hapus).'
                        : '🛑 **Promo togel otomatis: NONAKTIF.** Bot tidak akan lagi memunculkan kartu togel otomatis.',
                    ephemeral: true,
                });
            }
            const angka = interaction.options.getInteger('angka');
            if (angka !== null) {
                const result = placeBet(guildId, interaction.user.id, interaction.user.username, angka);
                if (!result.success) return interaction.reply({ content: result.error, ephemeral: true });
                return interaction.reply({
                    content: `🎟️ Kamu pasang angka **${result.number}** seharga 🪙 **${result.cost.toLocaleString('id-ID')}**!\n> 🔢 Angkamu ronde ini: **${result.myNumbers.join(', ')}**\n> 🎰 Pot sekarang: 🪙 **${result.pot.toLocaleString('id-ID')}**\n> 🪙 Saldo: **${result.newBalance.toLocaleString('id-ID')}**\n> ⏰ Diundi <t:${Math.floor(result.drawAt / 1000)}:R>`,
                    ephemeral: true,
                });
            }
            return interaction.reply(buildLotteryPanel(guildId));
        }

        // ================= BLACKJACK =================
        if (command === 'blackjack') {
            const bet = interaction.options.getInteger('taruhan') || 500;
            const result = startBlackjack(guildId, interaction.user.id, bet);
            if (!result.success) {
                return interaction.reply({ content: result.error, ephemeral: true });
            }

            const { buildGameEmbed, buildGameButtons } = require('../systems/blackjack');
            // Inline embed/button builders since they're internal to the module
            // We'll use the game data directly
            const game = result.game;

            if (result.immediate) {
                // Natural blackjack or immediate result
                const embed = new EmbedBuilder()
                    .setTitle(result.result.result === 'blackjack' ? '🃏 Blackjack!' : '🃏 Blackjack')
                    .setColor(result.result.result === 'blackjack' || result.result.result === 'win' ? '#2ECC71' : result.result.result === 'push' ? '#F1C40F' : '#E74C3C')
                    .setDescription(
                        `━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `**🎰 Taruhan:** 🪙 ${game.bet.toLocaleString('id-ID')}\n\n` +
                        `**🃏 Dealer:**\n> ${game.dealerHand.map(c => `\`${c.rank}${c.suit}\``).join(' ')} = **${game.dealerHand.reduce((sum, c) => { let v = parseInt(c.rank) || (['J','Q','K'].includes(c.rank) ? 10 : 11); return sum + v; }, 0) > 21 ? '💥' : handValue(game.dealerHand)}**\n\n` +
                        `**🧑 Kamu:**\n> ${game.playerHand.map(c => `\`${c.rank}${c.suit}\``).join(' ')} = **${handValue(game.playerHand)}**\n\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `**${result.result.label}**\n` +
                        (result.result.payout > 0 && result.result.result !== 'push' ? `> 🪙 Menang: **+${result.result.payout.toLocaleString('id-ID')}**\n` : result.result.result === 'push' ? `> 🪙 Dikembalikan: **${result.result.payout.toLocaleString('id-ID')}**\n` : `> 🪙 Kalah: **-${game.bet.toLocaleString('id-ID')}**\n`) +
                        `━━━━━━━━━━━━━━━━━━━━━━`
                    )
                    .setFooter({ text: 'Game selesai!' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`bj_newgame_${interaction.user.id}`).setLabel('🃏 Main Lagi').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`bj_quit_${interaction.user.id}`).setLabel('🚪 Selesai').setStyle(ButtonStyle.Secondary)
                );
                return interaction.reply({ embeds: [embed], components: [row] });
            }

            // Normal game start
            const playerVal = handValue(game.playerHand);
            const firstDealerCard = game.dealerHand[0];
            const embed = new EmbedBuilder()
                .setTitle('🃏 Blackjack')
                .setColor('#3498DB')
                .setDescription(
                    `━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `**🎰 Taruhan:** 🪙 ${game.bet.toLocaleString('id-ID')}\n\n` +
                    `**🃏 Dealer:**\n> \`${firstDealerCard.rank}${firstDealerCard.suit}\` \`??\` = **${getCardValue(firstDealerCard)}+?**\n\n` +
                    `**🧑 Kamu:**\n> ${game.playerHand.map(c => `\`${c.rank}${c.suit}\``).join(' ')} = **${playerVal}**\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━`
                )
                .setFooter({ text: 'Hit = ambil kartu | Stand = berhenti | Double = 2x taruhan + 1 kartu' });

            const userData2 = getOrCreateUser(guildId, interaction.user.id);
            const canDouble = userData2.balance >= bet;
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`bj_hit_${interaction.user.id}`).setLabel('🃏 Hit').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`bj_stand_${interaction.user.id}`).setLabel('✋ Stand').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`bj_double_${interaction.user.id}`).setLabel('💰 Double').setStyle(ButtonStyle.Danger).setDisabled(!canDouble)
            );
            return interaction.reply({ embeds: [embed], components: [row] });
        }

        // ================= STATS DASHBOARD =================
        if (command === 'stats') {
            return handleStatsCommand(interaction);
        }

        // ================= LEADERBOARD =================
        if (command === 'leaderboard') {
            return handleLeaderboardCommand(interaction);
        }

        // ================= INVITE PANEL =================
        if (command === 'invite') {
            return handleInviteCommand(interaction);
        }

        // ================= WELCOMER PANEL =================
        if (command === 'welcomer') {
            return handleWelcomerCommand(interaction);
        }

        // ================= SELF-ROLES PANEL =================
        if (command === 'selfrole') {
            return handleSelfRoleCommand(interaction);
        }

        // ================= GIVEAWAY PANEL =================
        if (command === 'giveaway') {
            return handleGiveawayCommand(interaction);
        }

        // ================= GAMES (QUIZ) =================
        if (command === 'games') {
            const { handleGamesCommand } = require('../systems/quiz');
            return handleGamesCommand(interaction);
        }

        // ================= AFK =================
        if (command === 'afk') {
            const { handleAfkCommand } = require('../systems/afk');
            return handleAfkCommand(interaction);
        }

        // ================= TEMPVOICE PANEL =================
        if (command === 'tempvoice') {
            return handleTempvoiceCommand(interaction);
        }

        // ================= STREAK PRESTIGE & VVIP LOUNGE =================
        if (command === 'streak') {
            const sub = interaction.options.getSubcommand(false) || 'status';
            const streakRow = db.prepare('SELECT count FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id);
            const streakCount = streakRow ? Number(streakRow.count) || 0 : 0;

            if (sub === 'sync') {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && !interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                    return interaction.reply({ content: '❌ Hanya admin atau member dengan permission Manage Roles yang bisa menjalankan sync role.', ephemeral: true });
                }
                await interaction.deferReply({ ephemeral: true });
                const res = await syncAllMemberStreakRoles(interaction.guild);
                if (!res.ok) {
                    return interaction.editReply({ content: `❌ Gagal sync role streak: ${res.error}` });
                }
                const sampleText = res.details.length > 0 ? `\n\n**Daftar Member yang Disinkronkan:**\n${res.details.join('\n')}` : '';
                return interaction.editReply({
                    content: `✅ **Sinkronisasi Role Streak Berhasil!**\n> 👥 Total Member Disinkronkan: **${res.syncedCount}** dari **${res.totalEligible}** pemilik streak\n> 🎭 Role Tier Aktif: **${res.rolesCreated}/7** tier${sampleText}`
                });
            }
            if (sub === 'leaderboard') {
                return interaction.reply(buildStreakLeaderboard(guildId, interaction.user.id));
            }
            if (sub === 'lounge') {
                return interaction.reply({ ...buildLoungePanel(guildId, interaction.user.id, streakCount), ephemeral: true });
            }
            if (sub === 'setup_lounge') {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({ content: '❌ Hanya admin yang bisa setup VVIP Lounge.', ephemeral: true });
                }
                await interaction.deferReply({ ephemeral: true });
                const res = await setupLounge(interaction.guild);
                if (!res.ok) {
                    return interaction.editReply({ content: `❌ Gagal setup lounge: ${res.error}` });
                }
                // Auto sync roles when lounge is configured
                syncAllMemberStreakRoles(interaction.guild).catch(() => {});
                return interaction.editReply({ content: `✅ **VVIP High-Table Lounge Berhasil Dikonfigurasi!**\n> 📁 Category: <#${res.category.id}>\n> 💬 Text: <#${res.textChannel.id}>\n> 🔊 Voice: <#${res.voiceChannel.id}>\n> 👑 Hak akses dan role tier otomatis disinkronkan ke member!` });
            }
            // Auto sync user's role when checking status
            syncMemberStreakRole(interaction.member, streakCount).catch(() => {});
            return interaction.reply(buildStreakStatusPanel(guildId, interaction.user.id, interaction.user.username, streakCount));
        }
    }


    // === GAME CONSENT GATE FOR INTERACTIONS ===
    if (interaction.customId && consent.isGatedGameInteraction(interaction.customId) && !consent.hasGameConsent(guildId, interaction.user.id)) {
        return interaction.reply({ ...consent.buildGameConsentPrompt(guildId, interaction.user.id), ephemeral: true });
    }

    // ================= USER SELECT MENU HANDLERS =================
    // UserSelectMenu is distinct from StringSelectMenu in discord.js v14.
    if (interaction.isUserSelectMenu && interaction.isUserSelectMenu()) {
        if (isTempvoiceUserSelect(interaction.customId)) {
            return handleTempvoiceUserSelect(interaction);
        }
        // --- ECONOMY PANEL: gift recipient picker ---
        if (isEconomyPanelSelect(interaction.customId)) {
            return handleEconomySelect(interaction);
        }
        // --- TRADE PANEL: trade target picker ---
        if (isTradePanelUserSelect(interaction.customId)) {
            return handleTradeUserSelect(interaction);
        }
        return; // no other user-select menus yet
    }

    // ================= ROLE SELECT MENU HANDLERS =================
    if (interaction.isRoleSelectMenu && interaction.isRoleSelectMenu()) {
        if (isSelfRoleRoleSelect(interaction.customId)) {
            return handleSelfRoleRoleSelect(interaction);
        }
        if (isGiveawayRoleSelect(interaction.customId)) {
            return handleGiveawayRoleSelect(interaction);
        }
        if (isGiveawayBonusRoleSelect(interaction.customId)) {
            return handleGiveawayBonusRoleSelect(interaction);
        }
        if (isWelcomerRoleSelect(interaction.customId)) {
            return handleWelcomerRoleSelect(interaction);
        }
        return;
    }

    // ================= CHANNEL SELECT MENU HANDLERS =================
    if (interaction.isChannelSelectMenu && interaction.isChannelSelectMenu()) {
        if (isSelfRoleChannelSelect(interaction.customId)) {
            return handleSelfRoleChannelSelect(interaction);
        }
        if (isGiveawayChannelSelect(interaction.customId)) {
            return handleGiveawayChannelSelect(interaction);
        }
        if (isAiBotChannelSelect(interaction.customId)) {
            return handleAiBotChannelSelect(interaction);
        }
        if (isWelcomerChannelSelect(interaction.customId)) {
            return handleWelcomerChannelSelect(interaction);
        }
        if (isAdminPanelChannelSelect(interaction.customId)) {
            return handleAdminChannelSelect(interaction);
        }
        return;
    }

    // ================= SELECT MENU HANDLERS =================
    if (interaction.isStringSelectMenu()) {
        // === FEATURE GATE for select menu components ===
        const selFeatureKey = getFeatureKeyForInteraction(interaction.customId);
        if (selFeatureKey && !isFeatureEnabled(guildId, selFeatureKey)) {
            const fDef = getFeatureDef(selFeatureKey);
            return interaction.reply({ content: getDisabledMessage(fDef ? fDef.label : 'ini'), ephemeral: true });
        }

        // --- SELF-ROLES: public role picker (any member) ---
        if (isSelfRolePublicPick(interaction.customId)) {
            return handleSelfRolePick(interaction);
        }

        // --- SELF-ROLES: admin panel selects ---
        if (isSelfRolePanelSelect(interaction.customId)) {
            return handleSelfRoleSelect(interaction);
        }

        // --- GIVEAWAY: admin panel selects ---
        if (isGiveawayPanelSelect(interaction.customId)) {
            return handleGiveawaySelect(interaction);
        }

        // --- FISHING PANEL SELECT MENUS ---
        if (isFishingPanelSelectMenu(interaction.customId)) {
            return handleFishingSelectMenu(interaction);
        }

        // --- FARM PANEL SELECT MENUS ---
        if (isFarmPanelSelectMenu(interaction.customId)) {
            return handleFarmSelectMenu(interaction);
        }

        // --- ARENA SHOP SELECT MENUS ---
        if (isArenaSelectMenu(interaction.customId)) {
            return handleArenaSelectMenu(interaction);
        }

        // --- PET PANEL SELECT MENUS ---
        if (isPetPanelSelectMenu(interaction.customId)) {
            return handlePetSelectMenu(interaction);
        }

        // --- EXPEDITION SELECT MENUS ---
        if (isExpeditionSelectMenu(interaction.customId)) {
            return handleExpeditionSelectMenu(interaction);
        }

        // --- FUSION SELECT MENUS ---
        if (isFusionSelectMenu(interaction.customId)) {
            return handleFusionSelectMenu(interaction);
        }

        // --- PET ABILITIES SELECT MENUS ---
        if (isAbilitySelectMenu(interaction.customId)) {
            return handleAbilitySelectMenu(interaction);
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
        if (isAuctionSelect(interaction.customId)) {
            return handleAuctionSelect(interaction);
        }

        if (interaction.customId.startsWith('ach_detail_')) { const targetUserId = interaction.customId.replace('ach_detail_', ''), selectedCat = interaction.values[0], catAchs = ACHIEVEMENTS.filter(a => a.category === selectedCat), userAchs = db.prepare('SELECT * FROM achievements WHERE guildId = ? AND userId = ?').all(guildId, targetUserId), unlockedIds = userAchs.map(a => a.achievementId); const catUnlocked = catAchs.filter(a => unlockedIds.includes(a.id)).length; const catIcon = { Social: '💬', Economy: '💰', Level: '📈', Streak: '🔥', Gambling: '🎰', Events: '🎮', Voice: '🎙️', Quest: '📜', Special: '✨' }[selectedCat] || '📁'; let desc = `${catIcon} **${selectedCat}** — ${catUnlocked}/${catAchs.length} unlocked\n━━━━━━━━━━━━━━━━━━━━━━\n\n`; for (const ach of catAchs) { const unlocked = unlockedIds.includes(ach.id); if (unlocked) { desc += `✅ ${ach.emoji} **${ach.name}** — ${ach.desc} · 🪙${ach.reward.toLocaleString('id-ID')} ✓\n`; } else { const prog = getAchievementProgress(guildId, targetUserId, ach.id); let ps = ''; if (prog) { const shown = Math.min(prog.raw, prog.target); const pct = Math.min(100, Math.floor((prog.raw / prog.target) * 100)); const f = Math.round(pct / 10); ps = `\n> ${'▰'.repeat(f)}${'▱'.repeat(10 - f)} ${shown.toLocaleString('id-ID')}/${prog.target.toLocaleString('id-ID')} (${pct}%)`; } desc += `🔒 ${ach.emoji} ~~${ach.name}~~ — ${ach.desc} · 🪙${ach.reward.toLocaleString('id-ID')}${ps}\n`; } } return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${catIcon} Achievement: ${selectedCat}`).setColor(catUnlocked === catAchs.length ? '#FFD700' : '#2B2D31').setDescription(desc.slice(0, 4096)).setFooter({ text: catUnlocked === catAchs.length ? '🎉 Kategori ini sudah COMPLETE!' : `${catAchs.length - catUnlocked} badge tersisa` })], ephemeral: true }); }
        if (interaction.customId === 'shop_buy_custom_role' || (interaction.customId === 'shop_buy_role_misc' && interaction.values[0] === 'init_cr')) { const crPrice = parseInt(getSetting(guildId, 'custom_role_price', '75000')) || 75000, userData = getOrCreateUser(guildId, interaction.user.id); if (userData.balance < crPrice) return interaction.reply({ content: `❌ Uang kurang! Butuh 🪙 ${crPrice.toLocaleString('id-ID')}`, ephemeral: true }); const colorMenu = new StringSelectMenuBuilder().setCustomId('cr_select_color').setPlaceholder('🎨 Pilih Warna...').addOptions(new StringSelectMenuOptionBuilder().setLabel('🔴 Merah').setValue('FF0000'), new StringSelectMenuOptionBuilder().setLabel('🔵 Biru').setValue('0000FF'), new StringSelectMenuOptionBuilder().setLabel('🟢 Hijau').setValue('00FF00'), new StringSelectMenuOptionBuilder().setLabel('🟡 Kuning').setValue('FFFF00'), new StringSelectMenuOptionBuilder().setLabel('🟣 Ungu').setValue('800080'), new StringSelectMenuOptionBuilder().setLabel('🌸 Pink').setValue('FFC0CB'), new StringSelectMenuOptionBuilder().setLabel('⚫ Hitam').setValue('010101'), new StringSelectMenuOptionBuilder().setLabel('⚪ Putih').setValue('FFFFFF'), new StringSelectMenuOptionBuilder().setLabel('⚙️ Hex Sendiri').setValue('custom')); return interaction.reply({ content: 'Pilih warna:', components: [new ActionRowBuilder().addComponents(colorMenu)], ephemeral: true }); }
        if (interaction.customId === 'cr_select_color') { const selectedColor = interaction.values[0], modal = new ModalBuilder().setCustomId(`submit_cr_${selectedColor}`).setTitle('Custom Role 🎨'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cr_name').setLabel('Nama Role (Max 32)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32))); if (selectedColor === 'custom') modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cr_color').setLabel('Hex (#FF0000)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(7).setMaxLength(7).setPlaceholder('#FFFFFF'))); return interaction.showModal(modal); }

        // --- NEW COMMUNITY & ECONOMY SHOP HANDLERS ---
        if (interaction.customId === 'shop_buy_protect' || interaction.customId === 'shop_buy_social' || interaction.customId === 'shop_buy_booster') {
            const itemId = interaction.values[0];
            const userData = getOrCreateUser(guildId, interaction.user.id);

            // 1. Color Role
            if (itemId === 'color_role') {
                const crPrice = parseInt(getSetting(guildId, 'custom_role_price', '75000')) || 75000;
                if (userData.balance < crPrice) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${crPrice.toLocaleString('id-ID')}** (Saldo kamu: 🪙 ${userData.balance.toLocaleString('id-ID')})`, ephemeral: true });
                const colorMenu = new StringSelectMenuBuilder().setCustomId('cr_select_color').setPlaceholder('🎨 Pilih Warna...').addOptions(
                    new StringSelectMenuOptionBuilder().setLabel('🔴 Merah').setValue('FF0000'),
                    new StringSelectMenuOptionBuilder().setLabel('🔵 Biru').setValue('0000FF'),
                    new StringSelectMenuOptionBuilder().setLabel('🟢 Hijau').setValue('00FF00'),
                    new StringSelectMenuOptionBuilder().setLabel('🟡 Kuning').setValue('FFFF00'),
                    new StringSelectMenuOptionBuilder().setLabel('🟣 Ungu').setValue('800080'),
                    new StringSelectMenuOptionBuilder().setLabel('🌸 Pink').setValue('FFC0CB'),
                    new StringSelectMenuOptionBuilder().setLabel('⚫ Hitam').setValue('010101'),
                    new StringSelectMenuOptionBuilder().setLabel('⚪ Putih').setValue('FFFFFF'),
                    new StringSelectMenuOptionBuilder().setLabel('⚙️ Hex Sendiri').setValue('custom')
                );
                return interaction.reply({ content: `🎨 **Custom Color Role** (🪙 ${crPrice.toLocaleString('id-ID')}):\nPilih warna role nama kamu:`, components: [new ActionRowBuilder().addComponents(colorMenu)], ephemeral: true });
            }

            // 2. Custom Title Tag
            if (itemId === 'custom_title') {
                const itemDef = ITEMS.find(i => i.id === 'custom_title') || { price: 35000 };
                if (userData.balance < itemDef.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${itemDef.price.toLocaleString('id-ID')}**`, ephemeral: true });
                const modal = new ModalBuilder().setCustomId('modal_buy_title').setTitle('📛 Pasang Custom Title Tag');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('title_text').setLabel('Gelar Profil (Maks 30 Karakter)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30).setPlaceholder('Contoh: Lord of Sparks')
                ));
                return interaction.showModal(modal);
            }

            // 3. Custom Profile Banner
            if (itemId === 'custom_banner') {
                const itemDef = ITEMS.find(i => i.id === 'custom_banner') || { price: 50000 };
                if (userData.balance < itemDef.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${itemDef.price.toLocaleString('id-ID')}**`, ephemeral: true });
                const modal = new ModalBuilder().setCustomId('modal_buy_banner').setTitle('🖼️ Pasang Custom Profile Banner');
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('banner_url').setLabel('Link Gambar (URL PNG/JPG)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('https://example.com/my-banner.png')
                ));
                return interaction.showModal(modal);
            }

            // 4. Standard Inventory Items
            const itemDef = ITEMS.find(i => i.id === itemId);
            if (!itemDef) return interaction.reply({ content: '❌ Item tidak ditemukan!', ephemeral: true });
            if (!itemDef.price || itemDef.price <= 0) return interaction.reply({ content: '❌ Item ini tidak dijual di toko!', ephemeral: true });
            if (userData.balance < itemDef.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${itemDef.price.toLocaleString('id-ID')}** (Saldo kamu: 🪙 ${userData.balance.toLocaleString('id-ID')})`, ephemeral: true });

            userData.balance -= itemDef.price;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
            addItem(guildId, interaction.user.id, itemId, 1);
            addSpending(guildId, interaction.user.id, 'shop', itemDef.price);
            incrementUserStat(guildId, interaction.user.id, 'total_buys');

            const actionRow = new ActionRowBuilder();
            let actionNote = '> Cek & gunakan item ini lewat `/profile` → 🎒 Inventory.';

            if (itemId === 'server_megaphone') {
                actionRow.addComponents(new ButtonBuilder().setCustomId(`btn_use_megaphone_${interaction.user.id}`).setLabel('📢 Siarkan Sekarang').setStyle(ButtonStyle.Success));
                actionNote = '> Klik tombol di bawah atau gunakan lewat `/profile` → 🎒 Inventory untuk broadcast.';
            } else if (itemId === 'menfess_token') {
                actionRow.addComponents(new ButtonBuilder().setCustomId(`btn_use_menfess_${interaction.user.id}`).setLabel('🤫 Kirim Menfess Sekarang').setStyle(ButtonStyle.Success));
                actionNote = '> Klik tombol di bawah atau gunakan lewat `/profile` → 🎒 Inventory untuk kirim pesan rahasia.';
            }

            const replyPayload = {
                content: `✅ Berhasil membeli ${itemDef.emoji} **${itemDef.name}** seharga 🪙 **${itemDef.price.toLocaleString('id-ID')}**!\n${actionNote}\n> Saldo tersisa: 🪙 **${userData.balance.toLocaleString('id-ID')}**`,
                ephemeral: true
            };
            if (actionRow.components.length > 0) {
                replyPayload.components = [actionRow];
            }
            return interaction.reply(replyPayload);
        }
        if (interaction.customId === 'shop_buy_item' || interaction.customId === 'shop_buy_role' || interaction.customId === 'shop_buy_role_misc') { const selected = interaction.values[0]; let itemName = '', price = 0; if (selected.startsWith('item_')) { const parts = selected.substring(5).split('_'); price = parseInt(parts.pop()); itemName = parts.join('_'); const itemInfo = db.prepare('SELECT price FROM shop_items WHERE guildId = ? AND name = ? AND price = ? LIMIT 1').get(guildId, itemName, price); if (!itemInfo) return interaction.reply({ content: '❌ Habis!', ephemeral: true }); price = itemInfo.price; } else if (selected.startsWith('role_')) { const roleId = selected.substring(5), roleInfo = db.prepare('SELECT price FROM shop_roles WHERE guildId = ? AND roleId = ?').get(guildId, roleId); if (!roleInfo) return interaction.reply({ content: '❌ Tidak dijual!', ephemeral: true }); const roleObj = interaction.guild.roles.cache.get(roleId); itemName = roleObj ? `Role: ${roleObj.name}` : 'Role'; price = roleInfo.price; } const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`confirm_${selected}`).setLabel('✅ Beli').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('cancel_buy').setLabel('❌ Batal').setStyle(ButtonStyle.Danger)); return interaction.reply({ content: `🧾 **${itemName}** — 🪙 **${price.toLocaleString('id-ID')}**\n\nLanjutkan pembelian?`, components: [row], ephemeral: true }); }
    }


    // ================= BUTTON HANDLERS =================
    if (interaction.isButton()) {
        // === FEATURE GATE for interactive components ===
        const btnFeatureKey = getFeatureKeyForInteraction(interaction.customId);
        if (btnFeatureKey && !isFeatureEnabled(guildId, btnFeatureKey)) {
            const fDef = getFeatureDef(btnFeatureKey);
            return interaction.reply({ content: getDisabledMessage(fDef ? fDef.label : 'ini'), ephemeral: true });
        }

        // --- MEGAPHONE & MENFESS BUTTONS ---
        if (interaction.customId.startsWith('btn_use_megaphone_')) {
            const targetUserId = interaction.customId.replace('btn_use_megaphone_', '');
            if (interaction.user.id !== targetUserId) return interaction.reply({ content: '❌ Tombol ini bukan untuk kamu!', ephemeral: true });
            if (getItemCount(guildId, interaction.user.id, 'server_megaphone') < 1) {
                return interaction.reply({ content: '❌ Kamu tidak memiliki Server Megaphone! Beli di `/shop`.', ephemeral: true });
            }
            const modal = new ModalBuilder().setCustomId('modal_submit_megaphone').setTitle('📢 Server Megaphone');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('megaphone_content').setLabel('Pesan Broadcast (Maks 300 Karakter)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300).setPlaceholder('Ketik pengumuman broadcast kamu di sini...')
            ));
            return interaction.showModal(modal);
        }

        if (interaction.customId.startsWith('btn_use_menfess_')) {
            const targetUserId = interaction.customId.replace('btn_use_menfess_', '');
            if (interaction.user.id !== targetUserId) return interaction.reply({ content: '❌ Tombol ini bukan untuk kamu!', ephemeral: true });
            if (getItemCount(guildId, interaction.user.id, 'menfess_token') < 1) {
                return interaction.reply({ content: '❌ Kamu tidak memiliki Menfess Token! Beli di `/shop`.', ephemeral: true });
            }
            const modal = new ModalBuilder().setCustomId('modal_submit_menfess').setTitle('🤫 Kirim Pesan Rahasia / Menfess');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('menfess_target').setLabel('Untuk Siapa? (Nama / Mention / General)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50).setPlaceholder('Contoh: @Seseorang atau Si Dia di Voice')
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('menfess_content').setLabel('Isi Pesan Anonim (Maks 500 Karakter)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setPlaceholder('Tulis perasaan atau pesan rahasiamu secara 100% anonim...')
                )
            );
            return interaction.showModal(modal);
        }

        // --- WELCOME HELP BUTTON ---
        if (interaction.customId === 'welcome_help') {
            return interaction.reply({ content: '📖 Gunakan `/help` untuk panduan lengkap, atau `/menu` untuk navigasi cepat!', ephemeral: true });
        }

        // --- DAILY CLAIM BUTTON (from chat reminder) ---
        if (interaction.customId.startsWith('daily_claim_')) {
            const targetUserId = interaction.customId.split('_')[2];
            if (interaction.user.id !== targetUserId) return interaction.reply({ content: '❌ Tombol ini bukan untuk kamu!', ephemeral: true });
            const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
            const user = getOrCreateUser(guildId, interaction.user.id);
            if (user.lastDaily === today) return interaction.reply({ content: '❌ Kamu sudah claim /daily hari ini!', ephemeral: true });
            
            await interaction.deferReply({ ephemeral: true });

            const { claimDaily } = require('../systems/dailyReward');
            const r = await claimDaily(guildId, interaction.user.id, { today });
            if (r.alreadyClaimed) return interaction.editReply({ content: '❌ Kamu sudah claim /daily hari ini!' });

            const streakEmoji = getSetting(guildId, 'streak_emoji', '🔥');
            let desc = `> 🪙 Money: **+${r.money.toLocaleString('id-ID')}**\n` +
                       `> ✨ XP Bonus: **+${r.xp}**\n\n`;
            if (r.randomItem) {
                desc += `> 🎁 **Bonus Item:** ${r.randomItem}!\n\n`;
            } else if (r.randomMoney) {
                desc += `> 💰 **Bonus Money:** +${r.randomMoney} extra!\n\n`;
            }
            desc += `> ${streakEmoji} **Streak:** ${r.streak} hari *(ikut streak chat ${streakEmoji})*`;

            const embed = new EmbedBuilder()
                .setTitle('🎁 Daily Reward!')
                .setColor('#2ECC71')
                .setDescription(desc)
                .setFooter({ text: 'Makin panjang streak chat, makin gede reward /daily!' });
            // Delete the reminder message
            try { interaction.message.delete().catch(() => {}); } catch (_) {}

            return interaction.editReply({ embeds: [embed] });
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

        // --- CO-OP DUNGEON BUTTONS ---
        if (isDungeonCoopButton(interaction.customId)) {
            return handleDungeonCoopButton(interaction);
        }

        // --- EXPEDITION PANEL BUTTONS ---
        // Check the more specific confirm detector first.
        if (isExpeditionConfirm(interaction.customId)) {
            return handleExpeditionConfirm(interaction);
        }
        if (isExpeditionButton(interaction.customId)) {
            return handleExpeditionButton(interaction);
        }

        // --- FUSION PANEL BUTTONS ---
        if (isFusionButton(interaction.customId)) {
            return handleFusionButton(interaction);
        }

        // --- MUTATION LAB BUTTONS ---
        if (isMutationButton(interaction.customId)) {
            return handleMutationButton(interaction);
        }

        // --- WORLD BOSS BUTTONS ---
        if (isWorldBossButton(interaction.customId)) {
            return handleWorldBossButton(interaction);
        }

        // --- LOTTERY / TOGEL BUTTONS ---
        if (isLotteryButton(interaction.customId)) {
            return handleLotteryButton(interaction);
        }

        // --- BLACKJACK BUTTONS ---
        if (isBlackjackButton(interaction.customId)) {
            return handleBlackjackButton(interaction);
        }

        // --- PET ABILITIES BUTTONS ---
        if (isAbilityButton(interaction.customId)) {
            return handleAbilityButton(interaction);
        }

        // --- AWAKENING BUTTONS ---
        if (isAwakeningButton(interaction.customId)) {
            return handleAwakeningButton(interaction);
        }

        // --- GUIDE BUTTONS ---
        if (isGuideButton(interaction.customId)) {
            return handleGuideButton(interaction);
        }

        if (isArenaButton(interaction.customId)) {
            return handleArenaButton(interaction);
        }
        if (isAuctionButton(interaction.customId)) {
            return handleAuctionButton(interaction);
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

        // --- INVITE PANEL BUTTONS ---
        if (isInvitePanelButton(interaction.customId)) {
            return handleInviteButton(interaction);
        }

        // --- WELCOMER PANEL BUTTONS ---
        if (isWelcomerPanelButton(interaction.customId)) {
            return handleWelcomerButton(interaction);
        }

        // --- GAMES BUTTONS ---
        if (interaction.customId.startsWith('games_')) {
            const { isGamesButton, handleGamesButton } = require('../systems/quiz');
            if (isGamesButton(interaction.customId)) {
                return handleGamesButton(interaction);
            }
        }


        // --- SELF-ROLES PANEL BUTTONS ---
        if (isSelfRolePanelButton(interaction.customId)) {
            return handleSelfRoleButton(interaction);
        }

        // --- GIVEAWAY: public join (any member) ---
        if (isGiveawayJoin(interaction.customId)) {
            return handleGiveawayJoin(interaction);
        }

        // --- GIVEAWAY PANEL BUTTONS (admin) ---
        if (isGiveawayPanelButton(interaction.customId)) {
            return handleGiveawayButton(interaction);
        }

        // --- TEMPVOICE PANEL BUTTONS ---
        if (isTempvoicePanelButton(interaction.customId)) {
            return handleTempvoiceButton(interaction);
        }

        // --- STREAK PRESTIGE & VVIP LOUNGE BUTTONS ---
        if (isStreakPanelButton(interaction.customId)) {
            return handleStreakButton(interaction);
        }

        // --- GAME TERMS CONSENT BUTTONS ---
        if (interaction.customId.startsWith('gameconsent_')) {
            const parts = interaction.customId.split('_'); // gameconsent_yes_<id> | gameconsent_no_<id>
            const choice = parts[1];
            const targetUserId = parts.slice(2).join('_');
            if (interaction.user.id !== targetUserId) return interaction.reply({ content: '❌ Ini bukan panel kamu! / This is not your panel!', ephemeral: true });
            if (choice === 'yes') {
                consent.setGameConsent(guildId, targetUserId, true);
                const msg = i18n.t(guildId, targetUserId, 'game_consent.success');
                return interaction.update({ content: msg, embeds: [], components: [] });
            }
            consent.setGameConsent(guildId, targetUserId, false);
            const msg = i18n.t(guildId, targetUserId, 'game_consent.declined');
            return interaction.update({ content: msg, embeds: [], components: [] });
        }

        // --- NOTIFICATION TOGGLE BUTTONS (DISABLED) ---
        if (interaction.customId.startsWith('dmconsent_') || interaction.customId.startsWith('notif_toggle_')) {
            return interaction.reply({ content: '❌ Fitur notifikasi DM telah dinonaktifkan sepenuhnya.', ephemeral: true });
        }

        // --- FISH COLLECTION BUTTONS (Disabled) ---
        if (interaction.customId.startsWith('fcol_')) {
            return interaction.reply({ content: '❌ Fitur ini telah dinonaktifkan.', ephemeral: true });
        }

        // --- MENU HUB BUTTONS ---
        if (interaction.customId.startsWith('menu_')) {
            const cat = interaction.customId.replace('menu_', '');
            let content = '';
            if (cat === 'economy') content = '💰 **Economy:**\n\n> `/wallet` — 💰 Economy Panel (saldo, gift, redeem voucher)\n> `/daily` — 🎁 Klaim hadiah harian\n> `/levelpanel` — 🌟 Rank & leaderboard level';
            else if (cat === 'streak') content = '🔥 **Streak Prestige:**\n\n> `/streak status` — Cek hari streak, rank role & bonus chat\n> `/streak leaderboard` — 🏆 Hall of Fame top streak server\n> `/streak lounge` — 🏛️ Akses eksklusif VVIP Lounge (100+ hari)';
            else if (cat === 'profile') content = '📋 **Profil:**\n\n> `/profile` — 📋 Profile Panel\n> Profil, Achievement, Level, Stats\n> Semua dalam 1 panel interaktif!';
            else if (cat === 'shop') content = '🛒 **Shop:**\n\n> `/shop` — Buka menu toko\n> Kategori: 🎭 Role Server, ⚡ Booster XP, 🛡️ Proteksi Streak';
            else if (cat === 'daily') content = '🎁 **Daily Reward:**\n\n> `/daily` — Klaim hadiah harian\n> Hadiah money berlipat dengan streak chat aktif!';
            else if (cat === 'games') content = '🎮 **Quiz Games:**\n\n> `/games` — 🎮 Quiz 14 kategori (asah otak, tebak gambar, tebak kata)\n> Jawab benar dapat hadiah Money!';
            else if (cat === 'casino') content = '🎰 **Casino & Gambling:**\n\n> `/casino` — 🎰 Casino Panel (coinflip, slot, roulette)\n> `/blackjack` — 🃏 Main kartu 21\n> `/togel` — 🎟️ Togel pasang angka';
            else if (cat === 'ramalan') content = '🔮 **Ramalan Harian:**\n\n> `/ramalan hari_ini` — Ramalan harian, angka & warna hoki\n> Otomatis hadir setiap jam 07:00 WIB!';
            else if (['fishing', 'farming', 'pet', 'quest', 'fun'].includes(cat)) content = '🚫 Fitur ini telah dinonaktifkan di server ini.';
            return interaction.reply({ content, ephemeral: true });
        }

        if (interaction.customId.startsWith('tv_create_')) { const tempVoiceData = db.prepare('SELECT * FROM temp_voices WHERE ownerId = ? AND guildId = ?').get(interaction.user.id, guildId); if (tempVoiceData) return interaction.reply({ content: `❌ Sudah punya channel (<#${tempVoiceData.channelId}>)!`, ephemeral: true }); const jtcCategoryId = getSetting(guildId, 'jtc_category', null); if (!jtcCategoryId) return interaction.reply({ content: '❌ Belum setup!', ephemeral: true }); if (interaction.customId === 'tv_create_custom') { const modal = new ModalBuilder().setCustomId('tv_modal_custom_create').setTitle('Buat Channel'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_custom_name').setLabel('Nama:').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50))); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_custom_limit').setLabel('Limit (0=bebas):').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setPlaceholder('0'))); return interaction.showModal(modal); } let limit = 0, isPrivate = false, vcName = `🔊 ${interaction.user.username}'s Room`; if (interaction.customId === 'tv_create_duo') { limit = 2; vcName = `👥 ${interaction.user.username}'s Duo`; } if (interaction.customId === 'tv_create_squad') { limit = 4; vcName = `👥 ${interaction.user.username}'s Squad`; } if (interaction.customId === 'tv_create_private') { isPrivate = true; vcName = `🔒 ${interaction.user.username}'s Private`; } await interaction.deferReply({ ephemeral: true }); try { const newVc = await interaction.guild.channels.create({ name: vcName, type: ChannelType.GuildVoice, parent: jtcCategoryId, userLimit: limit, permissionOverwrites: [{ id: guildId, allow: isPrivate ? [] : [PermissionsBitField.Flags.ViewChannel], deny: isPrivate ? [PermissionsBitField.Flags.Connect] : [] }, { id: interaction.user.id, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.Connect] }] }); db.prepare('INSERT INTO temp_voices (channelId, guildId, ownerId) VALUES (?, ?, ?)').run(newVc.id, guildId, interaction.user.id); interaction.editReply(`✅ Dibuat! <#${newVc.id}> (60 detik)`); setTimeout(async () => { const ch = interaction.guild.channels.cache.get(newVc.id); if (ch && ch.members.size === 0) { await ch.delete().catch(()=>{}); db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(newVc.id); } }, 60000); } catch(e) { interaction.editReply('❌ Gagal.'); } return; }

        if (interaction.customId.startsWith('tv_') && !interaction.customId.startsWith('tv_create_')) { const voiceChannel = interaction.member.voice.channel; if (!voiceChannel) return interaction.reply({ content: '❌ Masuk VC dulu!', ephemeral: true }); const channelId = voiceChannel.id, tempVoice = db.prepare('SELECT * FROM temp_voices WHERE channelId = ? AND guildId = ?').get(channelId, guildId); if (!tempVoice) return interaction.reply({ content: '❌ Bukan temp voice.', ephemeral: true }); if (interaction.customId === 'tv_claim') { if (tempVoice.ownerId === interaction.user.id) return interaction.reply({content: '❌ Sudah owner!', ephemeral: true}); if (voiceChannel.members.has(tempVoice.ownerId)) return interaction.reply({content: '❌ Owner masih ada!', ephemeral: true}); db.prepare('UPDATE temp_voices SET ownerId = ? WHERE channelId = ?').run(interaction.user.id, channelId); await voiceChannel.permissionOverwrites.edit(tempVoice.ownerId, { ManageChannels: null, ManageRoles: null }).catch(()=>{}); await voiceChannel.permissionOverwrites.edit(interaction.user.id, { ManageChannels: true, ManageRoles: true }).catch(()=>{}); return interaction.reply({content: '👑 Kamu owner sekarang!', ephemeral: true}); } if (tempVoice.ownerId !== interaction.user.id) return interaction.reply({content: '❌ Owner only.', ephemeral: true}); if (interaction.customId === 'tv_name') { const m = new ModalBuilder().setCustomId(`tv_modal_name_${channelId}`).setTitle('Ubah Nama'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_name').setLabel('Nama:').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50))); return interaction.showModal(m); } if (interaction.customId === 'tv_limit') { const m = new ModalBuilder().setCustomId(`tv_modal_limit_${channelId}`).setTitle('Ubah Limit'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_limit').setLabel('Limit (0=unlimited):').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2))); return interaction.showModal(m); } if (interaction.customId === 'tv_privacy') { const p = voiceChannel.permissionOverwrites.cache.get(guildId), locked = p && p.deny.has(PermissionsBitField.Flags.Connect); if (locked) { await voiceChannel.permissionOverwrites.edit(guildId, { Connect: null }).catch(()=>{}); return interaction.reply({content: '🔓 Terbuka.', ephemeral: true}); } else { await voiceChannel.permissionOverwrites.edit(guildId, { Connect: false }).catch(()=>{}); return interaction.reply({content: '🔒 Dikunci.', ephemeral: true}); } } if (interaction.customId === 'tv_hide') { const p = voiceChannel.permissionOverwrites.cache.get(guildId), hidden = p && p.deny.has(PermissionsBitField.Flags.ViewChannel); if (hidden) { await voiceChannel.permissionOverwrites.edit(guildId, { ViewChannel: null }).catch(()=>{}); return interaction.reply({content: '👁️ Terlihat.', ephemeral: true}); } else { await voiceChannel.permissionOverwrites.edit(guildId, { ViewChannel: false }).catch(()=>{}); return interaction.reply({content: '👻 Tersembunyi.', ephemeral: true}); } } if (interaction.customId === 'tv_kick') { const m = new ModalBuilder().setCustomId(`tv_modal_kick_${channelId}`).setTitle('Kick'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_kick').setLabel('User ID:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_block') { const m = new ModalBuilder().setCustomId(`tv_modal_block_${channelId}`).setTitle('Block'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_block').setLabel('User ID:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_unblock') { const m = new ModalBuilder().setCustomId(`tv_modal_unblock_${channelId}`).setTitle('Unblock'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_unblock').setLabel('User ID:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_transfer') { const m = new ModalBuilder().setCustomId(`tv_modal_transfer_${channelId}`).setTitle('Transfer'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_transfer').setLabel('User ID baru:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_delete') { await voiceChannel.delete().catch(()=>{}); db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(channelId); return interaction.reply({content: '🗑️ Dihapus.', ephemeral: true}); } }

        // --- FISHING INVENTORY & BOSS PARTY BUTTONS (Disabled) ---
        if (interaction.customId.startsWith('finv_') || interaction.customId.startsWith('boss_')) {
            return interaction.reply({ content: '❌ Fitur ini telah dinonaktifkan.', ephemeral: true });
        }

        if (interaction.customId === 'airdrop_claim') { if (!activeMiniEvents.has(guildId)) return interaction.reply({ content: '❌ Sudah diklaim orang lain!', ephemeral: true }); activeMiniEvents.delete(guildId); const reward = getRandomInt(3000, 6000); db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(reward, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'event_wins'); addIncome(guildId, interaction.user.id, 'event', reward); await checkAchievements(interaction.guild, interaction.user.id, { type: 'event_win' }); return interaction.update({ content: `🎉 <@${interaction.user.id}> klaim Air Drop! 🪙 **${reward.toLocaleString('id-ID')}**`, embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('x').setLabel(`Diklaim ${interaction.user.username}`).setStyle(ButtonStyle.Secondary).setDisabled(true))] }); }
        
        if (interaction.customId === 'cancel_buy') return interaction.update({ content: '\u274c Dibatalkan.', components: [] });
        if (interaction.customId.startsWith('confirm_')) { const selected = interaction.customId.substring(8), userData = getOrCreateUser(guildId, interaction.user.id); let finalItemName = '', finalPrice = 0; if (selected.startsWith('item_')) { const parts = selected.substring(5).split('_'); const itemPrice = parseInt(parts.pop()); const itemName = parts.join('_'); const item = db.prepare('SELECT * FROM shop_items WHERE guildId = ? AND name = ? AND price = ? LIMIT 1').get(guildId, itemName, itemPrice); if (!item) return interaction.update({content: '❌ Habis!', components: []}); if (userData.balance < item.price) return interaction.update({content: '❌ Saldo kurang!', components: []}); try { await interaction.user.send(`🛍️ **${item.name}**:\n\`\`\`\n${item.content}\n\`\`\``); } catch(e) { return interaction.update({content: '❌ DM tertutup!', components: []}); } userData.balance -= item.price; finalItemName = item.name; finalPrice = item.price; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); db.prepare('DELETE FROM shop_items WHERE id = ?').run(item.id); } if (selected.startsWith('role_')) { const roleId = selected.substring(5), sr = db.prepare('SELECT * FROM shop_roles WHERE guildId = ? AND roleId = ?').get(guildId, roleId); if (!sr) return interaction.update({content: '❌ Tidak dijual.', components: []}); if (userData.balance < sr.price) return interaction.update({content: '❌ Saldo kurang!', components: []}); if (interaction.member.roles.cache.has(roleId)) return interaction.update({content: '❌ Sudah punya!', components: []}); userData.balance -= sr.price; const role = interaction.guild.roles.cache.get(roleId); finalItemName = role ? `Role ${role.name}` : 'Role'; finalPrice = sr.price; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); if (role) await interaction.member.roles.add(role).catch(()=>{}); } incrementUserStat(guildId, interaction.user.id, 'total_buys'); if (finalPrice > 0) { addSpending(guildId, interaction.user.id, 'shop', finalPrice); } await checkAchievements(interaction.guild, interaction.user.id, { type: 'buy' }); db.prepare('INSERT INTO logs (guildId, time, userId, action, item, price) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, Date.now(), interaction.user.id, 'BUY', finalItemName, finalPrice); const ts = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, 'testimoni_channel'); if (ts) { const tc = interaction.guild.channels.cache.get(ts.value); if (tc) tc.send({ embeds: [new EmbedBuilder().setColor('#2B2D31').setDescription(`<@${interaction.user.id}> beli **${finalItemName}** (🪙 ${finalPrice.toLocaleString('id-ID')})`).setTimestamp()] }).catch(()=>{}); } return interaction.update({content: `✅ Berhasil beli **${finalItemName}**!`, components: []}); }
    }


    // ================= MODAL SUBMIT HANDLERS =================
    if (interaction.isModalSubmit()) {
        if (isTempvoiceModal(interaction.customId)) {
            return handleTempvoiceModal(interaction);
        }
        // === FEATURE GATE for modal components ===
        const modFeatureKey = getFeatureKeyForInteraction(interaction.customId);
        if (modFeatureKey && !isFeatureEnabled(guildId, modFeatureKey)) {
            const fDef = getFeatureDef(modFeatureKey);
            return interaction.reply({ content: getDisabledMessage(fDef ? fDef.label : 'ini'), ephemeral: true });
        }
        if (isAuctionModal(interaction.customId)) {
            return handleAuctionModal(interaction);
        }
        if (isWelcomerPanelModal(interaction.customId)) {
            return handleWelcomerModal(interaction);
        }
        // --- TOGEL / LOTTERY MODAL (one-click quick bet) ---
        if (isLotteryModal(interaction.customId)) {
            return handleLotteryModal(interaction);
        }
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

        // --- SELF-ROLES PANEL MODALS ---
        if (isSelfRolePanelModal(interaction.customId)) {
            return handleSelfRoleModal(interaction);
        }

        // --- GIVEAWAY PANEL MODALS ---
        if (isGiveawayPanelModal(interaction.customId)) {
            return handleGiveawayModal(interaction);
        }

        // --- INVITE PANEL MODALS ---
        if (isInvitePanelModal(interaction.customId)) {
            return handleInviteModal(interaction);
        }

        if (interaction.customId === 'tv_modal_custom_create') { const vcName = interaction.fields.getTextInputValue('tv_input_custom_name'); let limit = parseInt(interaction.fields.getTextInputValue('tv_input_custom_limit')); if (isNaN(limit)) limit = 0; const jtcCategoryId = getSetting(guildId, 'jtc_category', null); if (!jtcCategoryId) return interaction.reply({content: '❌ Belum setup!', ephemeral: true}); await interaction.deferReply({ephemeral: true}); try { const newVc = await interaction.guild.channels.create({ name: vcName, type: ChannelType.GuildVoice, parent: jtcCategoryId, userLimit: limit, permissionOverwrites: [{id: guildId, allow: [PermissionsBitField.Flags.ViewChannel]}, {id: interaction.user.id, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.Connect]}] }); db.prepare('INSERT INTO temp_voices (channelId, guildId, ownerId) VALUES (?, ?, ?)').run(newVc.id, guildId, interaction.user.id); interaction.editReply(`✅ <#${newVc.id}> (60 detik)`); setTimeout(async()=>{const ch=interaction.guild.channels.cache.get(newVc.id);if(ch&&ch.members.size===0){await ch.delete().catch(()=>{});db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(newVc.id);}},60000); } catch(e) { interaction.editReply('❌ Gagal.'); } return; }

        if (interaction.customId.startsWith('tv_modal_')) { const parts = interaction.customId.split('_'), actionType = parts[2], channelId = parts.slice(3).join('_'), voiceChannel = interaction.guild.channels.cache.get(channelId); if (!voiceChannel) return interaction.reply({content: '❌ Channel hilang.', ephemeral: true}); const tempVoice = db.prepare('SELECT * FROM temp_voices WHERE channelId = ? AND guildId = ?').get(channelId, guildId); if (!tempVoice || tempVoice.ownerId !== interaction.user.id) return interaction.reply({content: '❌ Bukan owner!', ephemeral: true}); if (actionType === 'name') { await voiceChannel.setName(interaction.fields.getTextInputValue('tv_input_name')).catch(()=>{}); return interaction.reply({content: '✅ Diubah.', ephemeral: true}); } if (actionType === 'limit') { let l = parseInt(interaction.fields.getTextInputValue('tv_input_limit')); if (isNaN(l)) l = 0; await voiceChannel.setUserLimit(l).catch(()=>{}); return interaction.reply({content: `✅ Limit: ${l||'unlimited'}`, ephemeral: true}); } if (actionType === 'kick') { const tid = interaction.fields.getTextInputValue('tv_input_kick'), m = voiceChannel.members.get(tid); if (!m) return interaction.reply({content: '❌ Tidak ada.', ephemeral: true}); await m.voice.disconnect().catch(()=>{}); return interaction.reply({content: `👢 Kicked.`, ephemeral: true}); } if (actionType === 'block') { const tid = interaction.fields.getTextInputValue('tv_input_block'); await voiceChannel.permissionOverwrites.edit(tid, {Connect: false, ViewChannel: false}).catch(()=>{}); const m = voiceChannel.members.get(tid); if (m) await m.voice.disconnect().catch(()=>{}); return interaction.reply({content: '🚫 Blocked.', ephemeral: true}); } if (actionType === 'unblock') { const tid = interaction.fields.getTextInputValue('tv_input_unblock'); await voiceChannel.permissionOverwrites.edit(tid, {Connect: null, ViewChannel: null}).catch(()=>{}); return interaction.reply({content: '🟢 Unblocked.', ephemeral: true}); } if (actionType === 'transfer') { const tid = interaction.fields.getTextInputValue('tv_input_transfer'), m = voiceChannel.members.get(tid); if (!m) return interaction.reply({content: '❌ User harus di VC.', ephemeral: true}); db.prepare('UPDATE temp_voices SET ownerId = ? WHERE channelId = ?').run(tid, channelId); await voiceChannel.permissionOverwrites.edit(interaction.user.id, {ManageChannels: null, ManageRoles: null}).catch(()=>{}); await voiceChannel.permissionOverwrites.edit(tid, {ManageChannels: true, ManageRoles: true}).catch(()=>{}); return interaction.reply({content: `🔄 Transferred.`, ephemeral: true}); } }

        if (interaction.customId.startsWith('submit_cr_')) { const colorData = interaction.customId.replace('submit_cr_', ''), crPrice = parseInt(getSetting(guildId, 'custom_role_price', '75000')) || 75000, userData = getOrCreateUser(guildId, interaction.user.id); if (userData.balance < crPrice) return interaction.reply({content: '❌ Saldo kurang!', ephemeral: true}); const roleName = interaction.fields.getTextInputValue('cr_name'); let roleColor = colorData === 'custom' ? interaction.fields.getTextInputValue('cr_color') : `#${colorData}`; if (!/^#[0-9A-F]{6}$/i.test(roleColor)) return interaction.reply({content: '❌ Format hex salah!', ephemeral: true}); await interaction.deferReply(); try { userData.balance -= crPrice; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); const targetRoleId = '1062034108433301515', targetRole = interaction.guild.roles.cache.get(targetRoleId); let targetPos = targetRole ? Math.max(1, targetRole.position - 1) : Math.max(1, (interaction.guild.members.me.roles.highest.position || 1) - 1); const newRole = await interaction.guild.roles.create({ name: roleName, color: roleColor, hoist: true, position: targetPos, reason: `Custom Role: ${interaction.user.username}` }); await interaction.member.roles.add(newRole); db.prepare('INSERT INTO logs (guildId, time, userId, action, item, price) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, Date.now(), interaction.user.id, 'BUY', `Custom Role: ${roleName}`, crPrice); incrementUserStat(guildId, interaction.user.id, 'total_buys'); await checkAchievements(interaction.guild, interaction.user.id, { type: 'custom_role' }); await checkAchievements(interaction.guild, interaction.user.id, { type: 'buy' }); const ts = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, 'testimoni_channel'); if (ts) { const tc = interaction.guild.channels.cache.get(ts.value); if (tc) tc.send({ embeds: [new EmbedBuilder().setColor(roleColor).setDescription(`<@${interaction.user.id}> buat **${roleName}** (🪙 ${crPrice.toLocaleString('id-ID')})`).setTimestamp()] }).catch(()=>{}); } return interaction.editReply(`🎉 Custom Role <@&${newRole.id}> dibuat! 🪙 **${crPrice.toLocaleString('id-ID')}**`); } catch(e) { userData.balance += crPrice; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); console.error(e); return interaction.editReply('❌ Gagal. Uang dikembalikan.'); } }

        // --- CUSTOM TITLE TAG MODAL ---
        if (interaction.customId === 'modal_buy_title') {
            const titlePrice = 35000;
            const userData = getOrCreateUser(guildId, interaction.user.id);
            if (userData.balance < titlePrice) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${titlePrice.toLocaleString('id-ID')}**`, ephemeral: true });
            const titleText = interaction.fields.getTextInputValue('title_text').trim();
            if (!titleText) return interaction.reply({ content: '❌ Gelar tidak boleh kosong!', ephemeral: true });

            userData.balance -= titlePrice;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
            db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, interaction.user.id, 'custom_profile_title', titleText);
            addSpending(guildId, interaction.user.id, 'shop', titlePrice);
            incrementUserStat(guildId, interaction.user.id, 'total_buys');

            return interaction.reply({ content: `🎉 **Custom Title Tag Berhasil Dipasang!**\n> Gelar profilmu sekarang: 📛 **${titleText}**\n> Cek tampilan baru di \`/profile\`!`, ephemeral: true });
        }

        // --- CUSTOM PROFILE BANNER MODAL ---
        if (interaction.customId === 'modal_buy_banner') {
            const bannerPrice = 50000;
            const userData = getOrCreateUser(guildId, interaction.user.id);
            if (userData.balance < bannerPrice) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${bannerPrice.toLocaleString('id-ID')}**`, ephemeral: true });
            const bannerUrl = interaction.fields.getTextInputValue('banner_url').trim();
            if (!/^https?:\/\/.+/i.test(bannerUrl)) return interaction.reply({ content: '❌ URL gambar tidak valid! Harus diawali http:// atau https://', ephemeral: true });

            userData.balance -= bannerPrice;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
            db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, interaction.user.id, 'custom_profile_banner', bannerUrl);
            addSpending(guildId, interaction.user.id, 'shop', bannerPrice);
            incrementUserStat(guildId, interaction.user.id, 'total_buys');

            return interaction.reply({ content: `🎉 **Custom Profile Banner Berhasil Dipasang!**\n> Background kartu profilmu telah diperbarui.\n> Cek tampilan barumu di \`/profile\` → 🖼️ Kartu Profil!`, ephemeral: true });
        }

        // --- SUBMIT MEGAPHONE BROADCAST MODAL ---
        if (interaction.customId === 'modal_submit_megaphone') {
            if (getItemCount(guildId, interaction.user.id, 'server_megaphone') < 1) {
                return interaction.reply({ content: '❌ Kamu tidak memiliki Server Megaphone! Beli di `/shop`.', ephemeral: true });
            }
            const content = interaction.fields.getTextInputValue('megaphone_content').trim();
            if (!content) return interaction.reply({ content: '❌ Pesan broadcast tidak boleh kosong!', ephemeral: true });

            removeItem(guildId, interaction.user.id, 'server_megaphone', 1);

            const broadcastEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('📢 SERVER MEGAPHONE BROADCAST')
                .setDescription(`>>> **"${content}"**`)
                .setFooter({ text: `Disiarkan oleh ${interaction.user.username} • idcommunity Megaphone`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();

            await interaction.channel.send({ embeds: [broadcastEmbed] }).catch(() => {});
            return interaction.reply({ content: '✅ Pesan megaphone berhasil disiarkan ke chat!', ephemeral: true });
        }

        // --- SUBMIT MENFESS SECRET MESSAGE MODAL ---
        if (interaction.customId === 'modal_submit_menfess') {
            if (getItemCount(guildId, interaction.user.id, 'menfess_token') < 1) {
                return interaction.reply({ content: '❌ Kamu tidak memiliki Menfess Token! Beli di `/shop`.', ephemeral: true });
            }
            const target = interaction.fields.getTextInputValue('menfess_target').trim();
            const content = interaction.fields.getTextInputValue('menfess_content').trim();
            if (!content) return interaction.reply({ content: '❌ Isi pesan tidak boleh kosong!', ephemeral: true });

            removeItem(guildId, interaction.user.id, 'menfess_token', 1);

            // Locate target channel: menfess channel if set, otherwise current channel
            const menfessChannelId = getSetting(guildId, 'menfess_channel', '') || interaction.channelId;
            const targetChannel = interaction.guild.channels.cache.get(menfessChannelId) || interaction.channel;

            const menfessEmbed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle('🤫 PESAN RAHASIA / MENFESS')
                .setDescription(`Untuk: **${target}**\n\n>>> "${content}"`)
                .setFooter({ text: 'Identitas pengirim 100% anonim • Dikirim via Menfess Token' })
                .setTimestamp();

            await targetChannel.send({ embeds: [menfessEmbed] }).catch(() => {});
            return interaction.reply({ content: `✅ Pesan rahasia anonim berhasil dikirim ke <#${targetChannel.id}>!`, ephemeral: true });
        }

        // --- SEED QUANTITY MODAL (Disabled) ---
        if (interaction.customId.startsWith('seed_qty_')) {
            return interaction.reply({ content: '❌ Fitur ini telah dinonaktifkan.', ephemeral: true });
        }
    }
};

// ================= SAFETY NET: catch unhandled component/modal interactions =================
// Some button/select/modal customIds may not match any routing branch above (e.g. stale
// messages after a bot update, or a missed detector). If we never acknowledge the interaction,
// Discord shows the user a confusing "This interaction failed". This wrapper guarantees every
// component/modal interaction is acknowledged exactly once.
module.exports = async function handleInteractionCreate(interaction) {
    await routeInteraction(interaction);

    // Chat input commands and autocomplete are always handled by their branches.
    if (interaction.isChatInputCommand && interaction.isChatInputCommand()) return;
    if (interaction.isAutocomplete && interaction.isAutocomplete()) return;

    // For components/modals: if routing forgot to acknowledge, do it now so the user
    // doesn't see "This interaction failed". This only fires when nothing else replied.
    const isComponent = (interaction.isButton && interaction.isButton())
        || (interaction.isAnySelectMenu && interaction.isAnySelectMenu())
        || (interaction.isStringSelectMenu && interaction.isStringSelectMenu())
        || (interaction.isModalSubmit && interaction.isModalSubmit());

    if (isComponent && !interaction.replied && !interaction.deferred) {
        try {
            const { log } = require('../systems/logger');
            log('WARN', `Unhandled interaction acknowledged by safety net: ${interaction.customId}`, null, {
                guildId: interaction.guild?.id,
                userId: interaction.user?.id,
                command: interaction.customId
            });
        } catch (e) { /* logging must never break the safety net */ }
        try {
            await interaction.reply({
                content: '⚠️ Tombol/menu ini sudah tidak berlaku (mungkin dari pesan lama setelah update bot). Coba jalankan command-nya lagi.',
                ephemeral: true
            });
        } catch (e) { /* already acknowledged or expired — nothing more to do */ }
    }
};
