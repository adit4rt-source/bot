// events/interactionCreate.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser, getConf, getSetting, getUserStat, incrementUserStat, getItemCount, addItem, removeItem, getPetFoodCount, addPetFood, removePetFood, getAllPetFood, getSeedCount, addSeed, removeSeed, getAllSeeds } = require('../database');
const { getRandomInt } = require('../utils');
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
const { handleEconomyPanelCommand, handleEconomyButton, handleEconomyModal, isEconomyPanelButton, isEconomyPanelModal } = require('../systems/economyPanel');
const { handleProfilePanelCommand, handleProfileButton, isProfilePanelButton } = require('../systems/profilePanel');
const { handleLevelPanelCommand, handleLevelButton, isLevelPanelButton } = require('../systems/levelPanel');
const { handleTradeCommand, handleTradeButton, handleTradeModal, isTradePanelButton, isTradePanelModal } = require('../systems/tradePanel');
const { catchFish, getEquipment } = require('../systems/fishing');
const { getFarmData, getFarmSlots, getPlots, getStorage, addStorage, removeStorage, getStorageQty } = require('../systems/farming');
const { updateQuestProgress, getOrCreateWeeklyQuests, getWeekId, checkDailyQuestStreak, DIFFICULTY_TIERS } = require('../systems/quests');
const { CALENDAR_REWARDS, getLoginCalendar } = require('../systems/calendar');
const { spinSlot, getSlotResult, GIFT_TAX_RATE, GIFT_RECEIVE_LIMIT_PER_DAY, getGiftReceivedToday, addGiftReceivedToday } = require('../systems/slots');
const { FISH_DATA, FISH_TIERS, BAIT_TYPES, ROD_TYPES } = require('../data/fish');
const { PET_DATA, PET_FOODS, PET_EGGS, PET_CLASSES, PET_ELEMENTS, PET_EVOLUTIONS, PET_SKILL_MILESTONES, PET_LEVEL_MULTIPLIERS, RELIC_NAMES } = require('../data/pets');
const { ITEMS } = require('../data/items');
const { FARM_LEVELS, FARM_CROPS, FARM_RECIPES, FARM_FERTILIZERS } = require('../data/farming');
const { DUNGEON_TIERS, BOSS_LIST } = require('../data/dungeons');

const { fishCooldowns, activeCoinflips, slashCooldowns, activeMiniEvents, activeFishEvents, activeBossParties } = state;

module.exports = async function handleInteractionCreate(interaction) {
    if (!interaction.guild) return interaction.reply({content: 'Hanya di Server!', ephemeral: true});
    const guildId = interaction.guild.id;

    // Block command usage in restricted channels
    const blockedChannels = ['1347190409402650736'];
    if (interaction.isChatInputCommand() && blockedChannels.includes(interaction.channelId)) {
        return interaction.reply({ content: '❌ Command bot tidak bisa digunakan di channel ini! Gunakan di channel lain.', ephemeral: true });
    }

    // Autocomplete handler for item use
    if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'use' || (interaction.commandName === 'me' && interaction.options.getSubcommand(false) === 'use')) {
            const ownedItems = db.prepare('SELECT * FROM item_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, interaction.user.id);
            const choices = ownedItems.map(inv => {
                const def = ITEMS.find(i => i.id === inv.itemId);
                if (!def) return null;
                return { name: `${def.emoji} ${def.name} (x${inv.quantity})`, value: def.id };
            }).filter(Boolean).slice(0, 25);
            return interaction.respond(choices);
        }
        return;
    }

    if (interaction.isChatInputCommand()) {
        const command = interaction.commandName, subCmd = interaction.options.getSubcommand(false), group = interaction.options.getSubcommandGroup(false);
        const cdKey = `${interaction.user.id}_${command}`;
        if (slashCooldowns.has(cdKey) && Date.now() < slashCooldowns.get(cdKey)) return interaction.reply({ content: `⏳ Sabar... Tunggu sebentar sebelum memakai perintah ini lagi.`, ephemeral: true });
        slashCooldowns.set(cdKey, Date.now() + 3000);
        const userData = getOrCreateUser(guildId, interaction.user.id);
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        if (command === 'help') {
            const helpEmbed = new EmbedBuilder().setTitle('📖 Panduan Lengkap Bot').setColor('#5865F2').setDescription('Gunakan `/menu` untuk navigasi cepat dengan tombol!\n\n**Daftar Command:**').addFields(
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '💰 **EKONOMI** (`/economy`)', inline: false },
                { name: '\u200b', value: `> \`/economy balance\` — Cek saldo\n> \`/economy coinflip <taruhan>\` — Lempar koin 50/50\n> \`/economy slot <taruhan>\` — Slot machine (max 25x!)\n> \`/economy gift @user <jumlah>\` — Kirim money\n> \`/economy redeem <kode>\` — Tukar voucher\n> \`/economy leaderboard\` — Ranking global\n> \`/daily\` — Klaim hadiah harian\n> \`/shop\` — Toko lengkap`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🎣 **FISHING** (`/fish` + `/fishing`)', inline: false },
                { name: '\u200b', value: `> \`/fish\` — Lempar pancing\n> \`/fishing sell\` — Jual ikan\n> \`/fishing inventory\` — Lihat ikan\n> \`/fishing collection\` — Pokedex ikan\n> \`/fishing shop\` — Beli joran & umpan\n> \`/fishing stats\` — Statistik`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🌾 **FARMING** (`/farm`)', inline: false },
                { name: '\u200b', value: `> \`/farm status\` — Lihat kebun\n> \`/farm plant\` — Tanam bibit\n> \`/farm water\` — Siram\n> \`/farm harvest\` — Panen\n> \`/farm craft\` — Craft resep\n> \`/farm shop\` — Bibit & pupuk\n> \`/farm upgrade\` — Upgrade lahan`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🐾 **PET & BATTLE** (`/pet` + `/battle`)', inline: false },
                { name: '\u200b', value: `> \`/pet\` — 🐾 Buka Pet Panel (button-based)\n> Feed, Play, Hunt, Shop, Dungeon, Boss, Refine\n> Semua diakses dari panel interaktif!\n> \`/battle @user\` — PvP auto-battle\n> \`/evolve\` — Evolve pet`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '📋 **PROFIL & QUEST** (`/profile` + `/quest`)', inline: false },
                { name: '\u200b', value: `> \`/profile\` — 📋 Profile Panel (profil, badge, inventory, stats)\n> \`/quest\` — 📜 Quest Panel (Daily & Weekly)\n> \`/levelpanel\` — 🌟 Level Panel (rank, leaderboard)\n> \`/wallet\` — 💰 Economy Panel (saldo, gift, redeem)`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🎮 **EVENTS & VOICE**', inline: false },
                { name: '\u200b', value: `> 🎮 **Mini-Event** muncul setiap 30 pesan\n> 🎣 **Fishing Tournament** setiap 100 pesan\n> 🎶 **Temp Voice** — Buat voice privat`, inline: false }
            );
            if (isAdmin) helpEmbed.addFields({ name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🛡️ **ADMIN**', inline: false }, { name: '\u200b', value: `> \`/setting\` — Atur channels notifikasi\n> \`/admin_shop\` — Kelola toko\n> \`/tempvoice setup\` — Setup voice\n> \`/level setting\` — Atur XP\n> \`/money manage\` — Kelola uang user\n> \`/streak\` — Kelola streak user`, inline: false });
            helpEmbed.setFooter({ text: '💡 Tip: Gunakan /menu untuk navigasi dengan tombol!', iconURL: interaction.client.user.displayAvatarURL() }).setTimestamp();
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

        if (command === 'setting') {
            if (!isAdmin) return interaction.reply({content: '❌ Hanya Admin!', ephemeral: true});
            if (subCmd === 'quest_channel') { const ch = interaction.options.getChannel('channel'); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'quest_channel', ch.id); return interaction.reply(`✅ \`/quest\` hanya bisa di <#${ch.id}>.`); }
            if (subCmd === 'level_channel') { const ch = interaction.options.getChannel('channel'); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'level_channel', ch.id); return interaction.reply(`✅ Level Up notif ke <#${ch.id}>.`); }
            if (subCmd === 'achievement_channel') { const ch = interaction.options.getChannel('channel'); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'achievement_channel', ch.id); return interaction.reply(`✅ Achievement notif ke <#${ch.id}>.`); }
            if (subCmd === 'streak_channel') { const ch = interaction.options.getChannel('channel'); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_channel', ch.id); return interaction.reply(`✅ Streak notif ke <#${ch.id}>.`); }
            if (subCmd === 'setup_notifications') {
                await interaction.deferReply();
                try {
                    const category = await interaction.guild.channels.create({ name: '📢 NOTIFICATIONS', type: ChannelType.GuildCategory });
                    const achChannel = await interaction.guild.channels.create({ name: '🏆-achievement', type: ChannelType.GuildText, parent: category.id });
                    const lvlChannel = await interaction.guild.channels.create({ name: '📈-level-up', type: ChannelType.GuildText, parent: category.id });
                    const streakChannel = await interaction.guild.channels.create({ name: '🔥-streak', type: ChannelType.GuildText, parent: category.id });
                    db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'achievement_channel', achChannel.id);
                    db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'level_channel', lvlChannel.id);
                    db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_channel', streakChannel.id);
                    return interaction.editReply(`✅ **Kategori Notification Dibuat!**\n\n📁 **${category.name}**\n> 🏆 Achievement: <#${achChannel.id}>\n> 📈 Level Up: <#${lvlChannel.id}>\n> 🔥 Streak: <#${streakChannel.id}>`);
                } catch (err) { console.error(err); return interaction.editReply('❌ Gagal membuat channel.'); }
            }
        }

        if (command === 'tempvoice') {
            if (!isAdmin) return interaction.reply({content: '❌ Hanya Admin!', ephemeral: true});
            if (subCmd === 'setup') {
                await interaction.deferReply();
                try {
                    const category = await interaction.guild.channels.create({ name: '💬 PRIVATE ROOMS', type: ChannelType.GuildCategory });
                    const interfaceChannel = await interaction.guild.channels.create({ name: '⚙️-interface', type: ChannelType.GuildText, parent: category.id });
                    db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'jtc_category', category.id);
                    const tvEmbed = new EmbedBuilder().setTitle('🔊 TEMP VOICE CONTROL PANEL').setColor('#2B2D31').setDescription('Selamat datang di sistem Private Voice!\n\n**✨ CARA MEMBUAT CHANNEL:**\nKlik tombol biru untuk membuat channel. Waktu **60 detik** untuk bergabung.\n\n**⚙️ CARA MENGATUR:**\nGunakan tombol abu-abu/merah untuk mengatur.').setImage('https://i.imgur.com/K1LWeqW.png').setFooter({ text: 'TempVoice System' });
                    const rowCreate = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tv_create_private').setLabel('Private 🔒').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('tv_create_duo').setLabel('Duo 👥 (2)').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('tv_create_squad').setLabel('Squad 👥 (4)').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('tv_create_custom').setLabel('Custom 🎛️').setStyle(ButtonStyle.Success));
                    const rowManage1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tv_name').setLabel('✏️ Name').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tv_limit').setLabel('👥 Limit').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tv_privacy').setLabel('🔒 Lock/Unlock').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tv_hide').setLabel('👁️ Hide/Unhide').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tv_claim').setLabel('👑 Claim Owner').setStyle(ButtonStyle.Secondary));
                    const rowManage2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tv_transfer').setLabel('🔄 Transfer').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tv_unblock').setLabel('🟢 Unblock').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tv_kick').setLabel('👢 Kick').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('tv_block').setLabel('🚫 Block').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('tv_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger));
                    await interfaceChannel.send({ embeds: [tvEmbed], components: [rowCreate, rowManage1, rowManage2] });
                    return interaction.editReply(`✅ **Temp Voice Dibuat!** Kategori **${category.name}** + <#${interfaceChannel.id}>`);
                } catch (err) { console.error(err); return interaction.editReply('❌ Gagal. Cek permission bot.'); }
            }
        }


        if (command === 'me' && subCmd === 'achievement') {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const userAchs = db.prepare('SELECT * FROM achievements WHERE guildId = ? AND userId = ?').all(guildId, targetUser.id);
            const unlockedIds = userAchs.map(a => a.achievementId);
            const categories = [...new Set(ACHIEVEMENTS.map(a => a.category))];
            const totalUnlocked = unlockedIds.length, totalAll = ACHIEVEMENTS.length;
            const percentComplete = Math.floor((totalUnlocked / totalAll) * 100);

            let desc = `> 🏆 **${totalUnlocked}** / **${totalAll}** badge terkumpul (**${percentComplete}%**)\n\n`;

            for (const cat of categories) {
                const catAchs = ACHIEVEMENTS.filter(a => a.category === cat);
                const catUnlocked = catAchs.filter(a => unlockedIds.includes(a.id)).length;
                const catIcon = { Social: '💬', Economy: '💰', Level: '📈', Streak: '🔥', Gambling: '🎰', Events: '🎮', Voice: '🎙️', Quest: '📜', Special: '✨', Fishing: '🎣', Farming: '🌾', Battle: '⚔️' }[cat] || '📁';
                desc += `${catIcon} **${cat}** (${catUnlocked}/${catAchs.length})\n`;
                catAchs.forEach(a => {
                    if (unlockedIds.includes(a.id)) {
                        desc += `> ${a.emoji} ${a.name}\n`;
                    } else {
                        desc += `> ▪️ ???\n`;
                    }
                });
                desc += '\n';
            }

            // Discord embed 4096 char limit
            if (desc.length > 4000) desc = desc.substring(0, 3990) + '\n\n*...dan lainnya*';

            const embed = new EmbedBuilder()
                .setAuthor({ name: `Achievement Collection | ${targetUser.username}`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
                .setColor('#FFD700')
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
                .setDescription(desc)
                .setFooter({ text: 'Pilih kategori di bawah untuk melihat detail + reward' })
                .setTimestamp();
            const selectMenu = new StringSelectMenuBuilder().setCustomId(`ach_detail_${targetUser.id}`).setPlaceholder('📂 Lihat detail per kategori...').addOptions(categories.map(cat => {
                const catIcon = { Social: '💬', Economy: '💰', Level: '📈', Streak: '🔥', Gambling: '🎰', Events: '🎮', Voice: '🎙️', Quest: '📜', Special: '✨', Fishing: '🎣', Farming: '🌾', Battle: '⚔️' }[cat] || '📁';
                const catAchs = ACHIEVEMENTS.filter(a => a.category === cat);
                const catUnlocked = catAchs.filter(a => unlockedIds.includes(a.id)).length;
                return new StringSelectMenuOptionBuilder().setLabel(`${cat} (${catUnlocked}/${catAchs.length})`).setValue(cat).setDescription(`Lihat detail achievement ${cat}`);
            }));
            return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
        }

        if (command === 'me' && subCmd === 'profile') {
            // VIEW (default)
            const targetUser = interaction.options.getUser('user') || interaction.user, targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!targetMember) return interaction.reply({content: 'User tidak ditemukan.', ephemeral: true});
            const tData = getOrCreateUser(guildId, targetUser.id), targetXp = (tData.level + 1) * 100, percent = Math.min(100, Math.max(0, Math.floor((tData.xp / targetXp) * 100))), progressBar = '▰'.repeat(Math.floor(percent / 10)) + '▱'.repeat(10 - Math.floor(percent / 10)), roles = targetMember.roles.cache.filter(r => r.name !== '@everyone').sort((a, b) => b.position - a.position).map(r => `<@&${r.id}>`);
            let displayRoles = roles.length > 0 ? roles.slice(0, 10).join(' • ') : '*Tidak ada role*'; if (roles.length > 10) displayRoles += ` *+${roles.length - 10} lainnya*`;
            const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, targetUser.id), streakCount = sData ? sData.count : 0, streakEmoji = getSetting(guildId, 'streak_emoji', '🔥');
            const userAchs = db.prepare('SELECT * FROM achievements WHERE guildId = ? AND userId = ? ORDER BY unlockedAt DESC').all(guildId, targetUser.id);
            const totalBadges = userAchs.length;
            let badgeDisplay = '';
            if (userAchs.length > 0) {
                badgeDisplay = userAchs.slice(0, 5).map(a => { const def = ACHIEVEMENTS.find(d => d.id === a.achievementId); return def ? `> ${def.emoji} **${def.name}** — *${def.desc}*` : ''; }).filter(Boolean).join('\n');
                if (totalBadges > 5) badgeDisplay += `\n> *...+${totalBadges - 5} badge lainnya*`;
            } else { badgeDisplay = '> *Belum ada badge.*'; }
            const fishCaught = getUserStat(guildId, targetUser.id, 'total_fish_caught');
            const slotWins = getUserStat(guildId, targetUser.id, 'slot_wins');
            const cfWins = getUserStat(guildId, targetUser.id, 'coinflip_wins');
            const harvests = getUserStat(guildId, targetUser.id, 'total_harvests');

            // Pet info for profile
            const activePet = getPetData(guildId, targetUser.id);
            const petInfo = activePet ? (() => { const pd = PET_DATA.find(p => p.id === activePet.petId); return pd ? `${pd.emoji} **${activePet.name}** (Lv.${activePet.level}) — *${pd.tier}*` : ''; })() : '*Belum punya pet*';

            const profileEmbed = new EmbedBuilder()
                .setAuthor({ name: `Kartu Profil | ${targetUser.username}`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
                .setColor('#2B2D31')
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
                .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
                .addFields(
                    { name: '📊 STATISTIK UTAMA', value: `> 🏅 **Level** \`${tData.level}\` — 💰 **Saldo** \`${tData.balance.toLocaleString('id-ID')}\` — ${streakEmoji} **Streak** \`${streakCount} Hari\`\n> \n> ✨ **Progress EXP**\n> \`${progressBar}\` **${percent}%** (\`${tData.xp.toLocaleString('id-ID')}/${targetXp.toLocaleString('id-ID')}\`)`, inline: false },
                    { name: `🏆 BADGE COLLECTION (${totalBadges}/${ACHIEVEMENTS.length})`, value: badgeDisplay, inline: false },
                    { name: '🎮 AKTIVITAS', value: `> 🎣 Ikan: **${fishCaught}** — 🎰 Slot: **${slotWins}** — 🪙 CF: **${cfWins}** — 🌾 Panen: **${harvests}**`, inline: false },
                    { name: '🐾 PET', value: `> ${petInfo}`, inline: false },
                    { name: '📅 INFO AKUN', value: `> 📥 Bergabung: <t:${Math.floor(targetMember.joinedTimestamp / 1000)}:D> — 📆 Dibuat: <t:${Math.floor(targetUser.createdTimestamp / 1000)}:D>`, inline: false },
                    { name: `🎭 Role [${roles.length}]`, value: displayRoles, inline: false }
                )
                .setFooter({ text: `ID: ${targetUser.id} | /profile untuk badge & stats | /pet untuk pet`, iconURL: interaction.guild.iconURL() })
                .setTimestamp();
            return interaction.reply({ embeds: [profileEmbed] });
        }

        if (command === 'level') {
            if (subCmd === 'rank') { const target = interaction.options.getUser('user') || interaction.user, tData = getOrCreateUser(guildId, target.id), targetXp = (tData.level + 1) * 100, percent = Math.min(100, Math.max(0, Math.floor((tData.xp / targetXp) * 100))); const embed = new EmbedBuilder().setAuthor({ name: target.username, iconURL: target.displayAvatarURL({ dynamic: true }) }).setTitle('🌟 Statistik Level').setColor('#2B2D31').setThumbnail(target.displayAvatarURL({ dynamic: true, size: 512 })).addFields({ name: 'Level', value: `\`${tData.level}\``, inline: true }, { name: 'EXP', value: `\`${tData.xp.toLocaleString('id-ID')} / ${targetXp.toLocaleString('id-ID')}\``, inline: true }, { name: 'Progress', value: `${'▰'.repeat(Math.floor(percent / 10)) + '▱'.repeat(10 - Math.floor(percent / 10))} **${percent}%**`, inline: false }); return interaction.reply({ embeds: [embed] }); }
            if (subCmd === 'leaderboard') { const data = db.prepare('SELECT * FROM users WHERE guildId = ? ORDER BY level DESC, xp DESC LIMIT 10').all(guildId); const embed = new EmbedBuilder().setTitle('🏆 Level Leaderboard').setColor('#2B2D31'); let desc = data.length ? '' : 'Belum ada data.'; data.forEach((u, i) => desc += `**${i+1}.** <@${u.userId}> — Level **${u.level}** (${u.xp}/${(u.level + 1) * 100} XP)\n`); embed.setDescription(desc); return interaction.reply({ embeds: [embed] }); }
            if (group === 'setting') {
                if (!isAdmin) return interaction.reply({content: '❌ Hanya Admin!', ephemeral: true});
                if (subCmd === 'rolereward') { const action = interaction.options.getString('action'); if (action === 'add') { db.prepare('INSERT OR REPLACE INTO rewards (guildId, level, roleId, money) VALUES (?, ?, ?, ?)').run(guildId, interaction.options.getInteger('level'), interaction.options.getRole('role')?.id || null, interaction.options.getInteger('money') || 0); return interaction.reply(`✅ Diatur.`); } if (action === 'remove') { db.prepare('DELETE FROM rewards WHERE guildId = ? AND level = ?').run(guildId, interaction.options.getInteger('level')); return interaction.reply(`🗑️ Dihapus.`); } if (action === 'list') { const req = db.prepare('SELECT * FROM rewards WHERE guildId = ? ORDER BY level ASC').all(guildId); let msg = '🎁 **DAFTAR REWARD**\n'; req.forEach(r => msg += `Level ${r.level} ➔ Role: ${r.roleId ? `<@&${r.roleId}>` : '-'} | Money: ${r.money.toLocaleString('id-ID')}\n`); return interaction.reply({ content: msg || 'Kosong.', allowedMentions: { roles: [] } }); } }
                if (subCmd === 'xp') { const tipe = interaction.options.getString('tipe'), min = interaction.options.getInteger('min_xp'), max = interaction.options.getInteger('max_xp'), cd = interaction.options.getInteger('cooldown'); if (min > max) return interaction.reply({content: '❌ Min > Max!', ephemeral: true}); db.prepare('INSERT OR REPLACE INTO config (guildId, key, value) VALUES (?, ?, ?)').run(guildId, `${tipe}_min_xp`, min); db.prepare('INSERT OR REPLACE INTO config (guildId, key, value) VALUES (?, ?, ?)').run(guildId, `${tipe}_max_xp`, max); db.prepare('INSERT OR REPLACE INTO config (guildId, key, value) VALUES (?, ?, ?)').run(guildId, `${tipe}_cooldown`, cd); let extraMsg = ''; if (tipe === 'reaction') { const awardTo = interaction.options.getString('award_to') || 'both'; db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'reaction_award_to', awardTo); extraMsg = `\n> Award To: **${awardTo.toUpperCase()}**`; } return interaction.reply(`⚙️ **Diperbarui!**\n> XP: **${min} - ${max}**\n> CD: **${cd}**${extraMsg}`); }
            }
        }


        if (command === 'economy' && subCmd === 'balance') return interaction.reply(`💰 Money: **${userData.balance.toLocaleString('id-ID')}**`);

        if (command === 'money') {
            if (group === 'manage') {
                const isOwner = interaction.user.id === interaction.guild.ownerId;
                if (subCmd === 'add_admin' || subCmd === 'remove_admin' || subCmd === 'list_admin') {
                    if (!isOwner) return interaction.reply({content: '🛑 Owner Only', ephemeral: true});
                    if (subCmd === 'add_admin') { const tUser = interaction.options.getUser('user'), tRole = interaction.options.getRole('role'); if (tUser) db.prepare('INSERT OR REPLACE INTO economy_admins (guildId, adminId, type) VALUES (?, ?, ?)').run(guildId, tUser.id, 'user'); if (tRole) db.prepare('INSERT OR REPLACE INTO economy_admins (guildId, adminId, type) VALUES (?, ?, ?)').run(guildId, tRole.id, 'role'); return interaction.reply(`✅ Banker ditambah.`); }
                    if (subCmd === 'remove_admin') { const tUser = interaction.options.getUser('user'), tRole = interaction.options.getRole('role'); if (tUser) db.prepare('DELETE FROM economy_admins WHERE guildId = ? AND adminId = ? AND type = ?').run(guildId, tUser.id, 'user'); if (tRole) db.prepare('DELETE FROM economy_admins WHERE guildId = ? AND adminId = ? AND type = ?').run(guildId, tRole.id, 'role'); return interaction.reply(`🗑️ Banker dihapus.`); }
                    if (subCmd === 'list_admin') { const list = db.prepare('SELECT * FROM economy_admins WHERE guildId = ?').all(guildId); let txt = '🛡️ **DAFTAR BANKER:**\n'; list.forEach(adm => txt += `• ${adm.type}: <@${adm.type === 'role' ? '&' : ''}${adm.adminId}>\n`); return interaction.reply({content: txt, allowedMentions: {users: [], roles: []}}); }
                }
                if (subCmd === 'atur') { let authorized = isOwner; if (!authorized) { const admins = db.prepare('SELECT * FROM economy_admins WHERE guildId = ?').all(guildId); for (const admin of admins) { if (admin.type === 'user' && interaction.user.id === admin.adminId) { authorized = true; break; } if (admin.type === 'role' && interaction.member.roles.cache.has(admin.adminId)) { authorized = true; break; } } } if (!authorized) return interaction.reply({content: '🛑 Akses Ditolak', ephemeral: true}); const amt = interaction.options.getInteger('jumlah'), target = interaction.options.getUser('user'), action = interaction.options.getString('action'), tData = getOrCreateUser(guildId, target.id); if (action === 'add') tData.balance += amt; if (action === 'take') tData.balance = Math.max(0, tData.balance - amt); if (action === 'set') tData.balance = amt; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(tData.balance, guildId, target.id); return interaction.reply(`✅ Saldo <@${target.id}> = **${tData.balance.toLocaleString('id-ID')}**.`); }
            }
        }

        if (command === 'economy' && subCmd === 'redeem') { const code = interaction.options.getString('kode').toUpperCase(); const voucher = db.prepare('SELECT * FROM vouchers WHERE guildId = ? AND code = ?').get(guildId, code); if (!voucher) return interaction.reply({ content: '❌ Kode tidak valid!', ephemeral: true }); if (voucher.current_uses >= voucher.max_uses) return interaction.reply({ content: '❌ Kuota habis!', ephemeral: true }); if (db.prepare('SELECT * FROM voucher_claims WHERE guildId = ? AND userId = ? AND code = ?').get(guildId, interaction.user.id, code)) return interaction.reply({ content: '❌ Sudah pernah ditukar!', ephemeral: true }); db.prepare('INSERT INTO voucher_claims (guildId, userId, code) VALUES (?, ?, ?)').run(guildId, interaction.user.id, code); db.prepare('UPDATE vouchers SET current_uses = current_uses + 1 WHERE guildId = ? AND code = ?').run(guildId, code); userData.balance += voucher.reward; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); await checkAchievements(interaction.guild, interaction.user.id, { type: 'redeem' }); return interaction.reply(`🎉 **BERHASIL!** Dapat **${voucher.reward.toLocaleString('id-ID')} money** gratis!`); }

        if (command === 'economy' && subCmd === 'leaderboard') {
            const kategori = interaction.options.getString('kategori') || 'overall';
            let data, title, desc = '';
            
            if (kategori === 'money') {
                title = '💰 Top Money';
                data = db.prepare('SELECT * FROM users WHERE guildId = ? ORDER BY balance DESC LIMIT 10').all(guildId);
                data.forEach((u, i) => { desc += `**${i+1}.** <@${u.userId}> — 🪙 **${u.balance.toLocaleString('id-ID')}**\n`; });
            } else if (kategori === 'level') {
                title = '📈 Top Level';
                data = db.prepare('SELECT * FROM users WHERE guildId = ? ORDER BY level DESC, xp DESC LIMIT 10').all(guildId);
                data.forEach((u, i) => { desc += `**${i+1}.** <@${u.userId}> — Lv.**${u.level}** (${u.xp} XP)\n`; });
            } else if (kategori === 'fish') {
                title = '🎣 Top Fisher';
                data = db.prepare("SELECT userId, stat_value FROM user_stats WHERE guildId = ? AND stat_key = 'total_fish_caught' ORDER BY stat_value DESC LIMIT 10").all(guildId);
                data.forEach((u, i) => { desc += `**${i+1}.** <@${u.userId}> — 🐟 **${u.stat_value}** ikan\n`; });
            } else if (kategori === 'fish_weight') {
                title = '🎣 Ikan Terberat';
                data = db.prepare('SELECT fi.*, fd.fishId FROM fish_inventory fi WHERE fi.guildId = ? ORDER BY fi.weight DESC LIMIT 10').all(guildId);
                data.forEach((u, i) => { const fishDef = FISH_DATA.find(f => f.id === u.fishId); desc += `**${i+1}.** <@${u.userId}> — ${fishDef ? fishDef.emoji : '🐟'} **${fishDef ? fishDef.name : '?'}** (${u.weight} kg) *${fishDef ? fishDef.tier : ''}*\n`; });
            } else if (kategori === 'farm') {
                title = '🌾 Top Farmer';
                data = db.prepare("SELECT userId, stat_value FROM user_stats WHERE guildId = ? AND stat_key = 'total_harvests' ORDER BY stat_value DESC LIMIT 10").all(guildId);
                data.forEach((u, i) => { desc += `**${i+1}.** <@${u.userId}> — 🌾 **${u.stat_value}** panen\n`; });
            } else if (kategori === 'pet') {
                title = '🐾 Top Pet Level';
                data = db.prepare('SELECT * FROM pets WHERE guildId = ? ORDER BY level DESC, exp DESC LIMIT 10').all(guildId);
                data.forEach((u, i) => { const petDef = PET_DATA.find(p => p.id === u.petId); desc += `**${i+1}.** <@${u.userId}> — ${petDef ? petDef.emoji : '🐾'} **${u.name}** Lv.**${u.level}** *(${petDef ? petDef.tier : '?'})*\n`; });
            } else if (kategori === 'streak') {
                title = '🔥 Top Streak';
                data = db.prepare('SELECT * FROM streaks WHERE guildId = ? ORDER BY count DESC LIMIT 10').all(guildId);
                data.forEach((u, i) => { desc += `**${i+1}.** <@${u.userId}> — 🔥 **${u.count}** hari\n`; });
            } else {
                title = '🏆 Overall Leaderboard';
                const users = db.prepare('SELECT * FROM users WHERE guildId = ?').all(guildId);
                const scored = users.map(u => {
                    const fishStat = db.prepare("SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = 'total_fish_caught'").get(guildId, u.userId);
                    const farmStat = db.prepare("SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = 'total_harvests'").get(guildId, u.userId);
                    const streakData = db.prepare('SELECT count FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, u.userId);
                    const petData = db.prepare('SELECT * FROM pets WHERE guildId = ? AND userId = ? ORDER BY level DESC LIMIT 1').get(guildId, u.userId);
                    const dungeonClears = db.prepare("SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = 'dungeon_clears'").get(guildId, u.userId);
                    const bossKills = db.prepare("SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = 'boss_kills'").get(guildId, u.userId);
                    const pvpWins = db.prepare("SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = 'pvp_wins'").get(guildId, u.userId);
                    const craftStat = db.prepare("SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = 'total_crafts'").get(guildId, u.userId);
                    const achieveCount = db.prepare('SELECT COUNT(*) as c FROM achievements WHERE guildId = ? AND userId = ?').get(guildId, u.userId);
                    const slotWins = db.prepare("SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = 'slot_wins'").get(guildId, u.userId);
                    const cfWins = db.prepare("SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = 'coinflip_wins'").get(guildId, u.userId);

                    const fish = fishStat ? fishStat.stat_value : 0;
                    const farm = farmStat ? farmStat.stat_value : 0;
                    const streak = streakData ? streakData.count : 0;
                    const petLv = petData ? petData.level : 0;
                    const dungeon = dungeonClears ? dungeonClears.stat_value : 0;
                    const boss = bossKills ? bossKills.stat_value : 0;
                    const pvp = pvpWins ? pvpWins.stat_value : 0;
                    const craft = craftStat ? craftStat.stat_value : 0;
                    const badges = achieveCount ? achieveCount.c : 0;
                    const gambling = (slotWins ? slotWins.stat_value : 0) + (cfWins ? cfWins.stat_value : 0);

                    // Scoring formula (weighted):
                    const score = (u.level * 150)           // Level contribution (paling penting)
                        + Math.floor(u.balance / 20)       // Wealth (diminishing)
                        + (fish * 3)                       // Fishing activity
                        + (farm * 4)                       // Farming activity
                        + (craft * 8)                      // Crafting (harder)
                        + (streak * 12)                    // Streak dedication
                        + (petLv * 5)                      // Pet progression
                        + (dungeon * 6)                    // Dungeon grinding
                        + (boss * 15)                      // Boss kills (harder)
                        + (pvp * 10)                       // PvP skill
                        + (badges * 20)                    // Achievement collecting
                        + (gambling * 2);                  // Gambling luck

                    return { ...u, score, fish, farm, streak, petLv, dungeon, boss, pvp, badges };
                }).sort((a, b) => b.score - a.score).slice(0, 10);
                scored.forEach((u, i) => { desc += `**${i+1}.** <@${u.userId}> — ⭐ **${u.score.toLocaleString('id-ID')}** pts\n> Lv.${u.level} | 🪙${u.balance.toLocaleString('id-ID')} | 🐟${u.fish} | 🌾${u.farm} | 🔥${u.streak} | 🐾${u.petLv} | ⚔️${u.dungeon+u.boss+u.pvp} | 🏆${u.badges}\n`; });
            }
            if (!desc) desc = '*Belum ada data.*';
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle(title).setColor('#FFD700').setDescription(desc).setFooter({ text: '/economy leaderboard <kategori> untuk filter | Overall = combined score' }).setTimestamp()] });
        }

        if (command === 'daily') {
            const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
            if (userData.lastDaily === today) return interaction.reply({ content: '⏳ Sudah klaim hari ini! Tunggu besok (00:00 WIB).', ephemeral: true });
            
            // Base reward
            let moneyReward = 500;
            let petExpReward = 10;
            let bonusDesc = '';
            
            // Check Daily Doubler item
            const hasDoubler = getUserStat(guildId, interaction.user.id, 'daily_doubler_active') > 0;
            if (hasDoubler) { moneyReward *= 2; incrementUserStat(guildId, interaction.user.id, 'daily_doubler_active', -1); bonusDesc += '> 📅 **Daily Doubler** aktif! Money x2!\n'; }
            
            // Random bonus reward (30% chance item, 20% chance extra money, 50% normal)
            const roll = Math.random();
            let randomReward = '';
            if (roll < 0.15) {
                // Random item reward
                const possibleItems = ['mystery_box', 'lucky_charm', 'xp_booster_2x'];
                const wonItem = possibleItems[Math.floor(Math.random() * possibleItems.length)];
                const itemDef = ITEMS.find(i => i.id === wonItem);
                addItem(guildId, interaction.user.id, wonItem);
                randomReward = `\n> 🎁 **Bonus Item:** ${itemDef.emoji} ${itemDef.name}!`;
            } else if (roll < 0.35) {
                // Extra money
                const extra = getRandomInt(100, 500);
                moneyReward += extra;
                randomReward = `\n> 💰 **Bonus Money:** +${extra} extra!`;
            } else if (roll < 0.50) {
                // Extra pet EXP
                petExpReward += 15;
                randomReward = `\n> 🐾 **Bonus Pet EXP:** +15 extra!`;
            }
            
            userData.balance += moneyReward;
            db.prepare('UPDATE users SET balance = ?, lastDaily = ? WHERE guildId = ? AND userId = ?').run(userData.balance, today, guildId, interaction.user.id);
            incrementUserStat(guildId, interaction.user.id, 'total_dailies');
            addPetExp(guildId, interaction.user.id, petExpReward);
            await checkAchievements(interaction.guild, interaction.user.id, { type: 'daily' });
            
            const embed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle('🎁 Daily Reward!')
                .setDescription(`${bonusDesc}> 🪙 **Money:** +${moneyReward.toLocaleString('id-ID')}\n> 🐾 **Pet EXP:** +${petExpReward}\n> ✨ **XP Bonus:** +15${randomReward}\n\n> 💳 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**`)
                .setFooter({ text: 'Kembali lagi besok! | Streak aktif = bonus lebih besar' })
                .setTimestamp();
            
            // Bonus XP from daily
            const user = getOrCreateUser(guildId, interaction.user.id);
            user.xp += 15;
            db.prepare('UPDATE users SET xp = ? WHERE guildId = ? AND userId = ?').run(user.xp, guildId, interaction.user.id);
            
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'economy' && subCmd === 'coinflip') {
            if (activeCoinflips.has(interaction.user.id)) return interaction.reply({ content: '⏳ Tunggu koinmu mendarat!', ephemeral: true });
            const taruhan = interaction.options.getInteger('taruhan');
            if (userData.balance < taruhan) return interaction.reply({ content: `❌ Saldo kurang! 🪙 **${userData.balance.toLocaleString('id-ID')}**`, ephemeral: true });
            activeCoinflips.add(interaction.user.id);
            addComboFeature(guildId, interaction.user.id, 'gambling');
            // Deduct balance atomically
            db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(taruhan, guildId, interaction.user.id);
            incrementUserStat(guildId, interaction.user.id, 'total_coinflips');
            updateQuestProgress(guildId, interaction.user.id, 'coinflip', 1);
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`coinflip_head_${interaction.user.id}_${taruhan}`).setLabel('🪙 Head').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`coinflip_tail_${interaction.user.id}_${taruhan}`).setLabel('🦅 Tail').setStyle(ButtonStyle.Danger)
            );
            const embed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle('🪙 Coinflip — Pilih Sisi!')
                .setDescription(`> 💰 Taruhan: 🪙 **${taruhan.toLocaleString('id-ID')}**\n\n> Pilih **Head** atau **Tail** dalam 30 detik!`)
                .setFooter({ text: `${interaction.user.username} | Klik tombol di bawah` });
            await interaction.reply({ embeds: [embed], components: [row] });
            
            // Auto-expire after 30s
            setTimeout(async () => {
                if (activeCoinflips.has(interaction.user.id)) {
                    activeCoinflips.delete(interaction.user.id);
                    // Refund
                    db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(taruhan, guildId, interaction.user.id);
                    const expiredEmbed = new EmbedBuilder().setColor('#95A5A6').setTitle('⏰ Coinflip Expired').setDescription(`> Kamu tidak memilih dalam 30 detik.\n> 🪙 **${taruhan.toLocaleString('id-ID')}** dikembalikan.`);
                    interaction.editReply({ embeds: [expiredEmbed], components: [] }).catch(()=>{});
                }
            }, 30000);
            return;
        }

        // ================= SLOT MACHINE =================
        if (command === 'economy' && subCmd === 'slot') {
            const slotCdKey = `slot_${guildId}_${interaction.user.id}`;
            if (fishCooldowns.has(slotCdKey) && Date.now() < fishCooldowns.get(slotCdKey)) { const remaining = Math.ceil((fishCooldowns.get(slotCdKey) - Date.now()) / 1000); return interaction.reply({ content: `⏳ Mesin slot masih panas! Tunggu **${remaining} detik**.`, ephemeral: true }); }
            fishCooldowns.set(slotCdKey, Date.now() + 5000);
            addComboFeature(guildId, interaction.user.id, 'gambling');
            const bet = interaction.options.getInteger('taruhan');
            if (userData.balance < bet) return interaction.reply({ content: `❌ Saldo kurang! Kamu punya 🪙 **${userData.balance.toLocaleString('id-ID')}**`, ephemeral: true });
            
            // Deduct balance atomically
            db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(bet, guildId, interaction.user.id);
            incrementUserStat(guildId, interaction.user.id, 'total_slot_spins');
            updateQuestProgress(guildId, interaction.user.id, 'slot', 1);
            
            // Show spinning animation first
            const spinEmbed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle('🎰 Slot Machine — Spinning...')
                .setDescription(`> 🎰 **SLOT MACHINE**\n>\n> ╔═══════════════════╗\n> ║   ❓  ┃  ❓  ┃  ❓   ║\n> ╚═══════════════════╝\n>\n> 💰 Taruhan: 🪙 **${bet.toLocaleString('id-ID')}**\n> 🎲 *Memutar gulungan...*`)
                .setFooter({ text: `${interaction.user.username} | Slot Machine` });
            await interaction.reply({ embeds: [spinEmbed] });
            
            // Generate reels
            let reels = spinSlot();
            
            // Lucky Spin Token check
            const luckySpinActive = getUserStat(guildId, interaction.user.id, 'lucky_spin_active');
            if (luckySpinActive > 0) {
                // Force reel[1] = reel[0] to guarantee at least 2x match
                reels[1] = reels[0];
                incrementUserStat(guildId, interaction.user.id, 'lucky_spin_active', -1);
            }
            
            const result = getSlotResult(reels, bet);
            
            setTimeout(async () => {
                const slotDisplay = `> 🎰 **SLOT MACHINE**\n>\n> ╔═══════════════════╗\n> ║   ${reels[0].emoji}  ┃  ${reels[1].emoji}  ┃  ${reels[2].emoji}   ║\n> ╚═══════════════════╝`;
                let embed;
                const luckyTag = luckySpinActive > 0 ? '\n> 🍀 *Lucky Spin Token digunakan!*' : '';
                
                if (result.jackpot && reels[0].id === 'seven') {
                    embed = new EmbedBuilder().setColor('#FFD700').setTitle('🎰💰 MEGA JACKPOT!!! 💰🎰').setDescription(`${slotDisplay}\n\n> ${result.desc}${luckyTag}\n\n> 💰 Taruhan: 🪙 ${bet.toLocaleString('id-ID')}\n> 🎉 Menang: 🪙 **+${result.payout.toLocaleString('id-ID')}** 🎉🎉🎉`);
                    incrementUserStat(guildId, interaction.user.id, 'slot_jackpot_7_count');
                } else if (result.jackpot) {
                    embed = new EmbedBuilder().setColor('#FF6B00').setTitle('🎰✨ JACKPOT! ✨🎰').setDescription(`${slotDisplay}\n\n> ${result.desc}${luckyTag}\n\n> 💰 Taruhan: 🪙 ${bet.toLocaleString('id-ID')}\n> 🎉 Menang: 🪙 **+${result.payout.toLocaleString('id-ID')}** 🎉`);
                } else if (result.win) {
                    embed = new EmbedBuilder().setColor('#2ECC71').setTitle('🎰 MENANG!').setDescription(`${slotDisplay}\n\n> ${result.desc}${luckyTag}\n\n> 💰 Taruhan: 🪙 ${bet.toLocaleString('id-ID')}\n> ✅ Menang: 🪙 **+${result.payout.toLocaleString('id-ID')}**`);
                } else {
                    embed = new EmbedBuilder().setColor('#E74C3C').setTitle('🎰 Slot Machine').setDescription(`${slotDisplay}\n\n> 😔 Tidak ada yang cocok...${luckyTag}\n\n> 💰 Taruhan: 🪙 ${bet.toLocaleString('id-ID')}\n> ❌ Kalah: 🪙 **-${bet.toLocaleString('id-ID')}**`);
                }
                
                if (result.win) {
                    db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(result.payout, guildId, interaction.user.id);
                    incrementUserStat(guildId, interaction.user.id, 'slot_wins');
                    incrementUserStat(guildId, interaction.user.id, 'slot_total_winnings', result.payout);
                    await checkAchievements(interaction.guild, interaction.user.id, { type: 'slot', jackpot: result.jackpot, jackpot7: result.jackpot && reels[0].id === 'seven' });
                }
                const freshData = getOrCreateUser(guildId, interaction.user.id);
                embed.setFooter({ text: `Saldo: ${freshData.balance.toLocaleString('id-ID')} money | ${interaction.user.username}` });
                interaction.editReply({ embeds: [embed] }).catch(()=>{});
            }, 2000);
            return;
        }

        // ================= ROULETTE =================
        if (command === 'economy' && subCmd === 'roulette') {
            const rouletteCdKey = `roulette_${guildId}_${interaction.user.id}`;
            if (fishCooldowns.has(rouletteCdKey) && Date.now() < fishCooldowns.get(rouletteCdKey)) { const remaining = Math.ceil((fishCooldowns.get(rouletteCdKey) - Date.now()) / 1000); return interaction.reply({ content: `⏳ Meja roulette masih berputar! Tunggu **${remaining} detik**.`, ephemeral: true }); }
            fishCooldowns.set(rouletteCdKey, Date.now() + 5000);
            addComboFeature(guildId, interaction.user.id, 'gambling');
            
            const bet = interaction.options.getInteger('taruhan');
            const pilihan = interaction.options.getString('pilihan').toLowerCase().trim();
            if (userData.balance < bet) return interaction.reply({ content: `❌ Saldo kurang! Kamu punya 🪙 **${userData.balance.toLocaleString('id-ID')}**`, ephemeral: true });
            
            // Validate choice
            const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
            const validChoices = ['merah', 'hitam', 'hijau', 'ganjil', 'genap'];
            const numChoice = parseInt(pilihan);
            const isNumber = !isNaN(numChoice) && numChoice >= 0 && numChoice <= 36;
            if (!validChoices.includes(pilihan) && !isNumber) {
                return interaction.reply({ content: '❌ Pilihan tidak valid! Gunakan: `Merah`, `Hitam`, `Hijau`, `Ganjil`, `Genap`, atau angka `0-36`', ephemeral: true });
            }
            
            // Deduct balance atomically
            db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(bet, guildId, interaction.user.id);
            incrementUserStat(guildId, interaction.user.id, 'total_roulette_spins');
            
            // Show spinning animation
            const spinEmbed = new EmbedBuilder()
                .setColor('#8B0000')
                .setTitle('🎯 Roulette — Spinning...')
                .setDescription(`> 🎡 **ROULETTE TABLE**\n>\n> ┌─────────────┐\n> │     ❓      │\n> │  *berputar...*  │\n> └─────────────┘\n>\n> 💰 Taruhan: 🪙 **${bet.toLocaleString('id-ID')}**\n> 🎯 Pilihan: **${pilihan.charAt(0).toUpperCase() + pilihan.slice(1)}**`)
                .setFooter({ text: `${interaction.user.username} | Roulette` });
            await interaction.reply({ embeds: [spinEmbed] });
            
            setTimeout(async () => {
                // Determine result
                const resultNumber = Math.floor(Math.random() * 37); // 0-36
                let resultColor, colorEmoji, colorName;
                if (resultNumber === 0) { resultColor = 'hijau'; colorEmoji = '🟢'; colorName = 'Hijau'; }
                else if (RED_NUMBERS.includes(resultNumber)) { resultColor = 'merah'; colorEmoji = '🔴'; colorName = 'Merah'; }
                else { resultColor = 'hitam'; colorEmoji = '⚫'; colorName = 'Hitam'; }
                
                const isOdd = resultNumber > 0 && resultNumber % 2 !== 0;
                const isEven = resultNumber > 0 && resultNumber % 2 === 0;
                
                // Check win condition
                let won = false;
                let multiplier = 0;
                if (isNumber && numChoice === resultNumber) { won = true; multiplier = 36; }
                else if (pilihan === 'merah' && resultColor === 'merah') { won = true; multiplier = 2; }
                else if (pilihan === 'hitam' && resultColor === 'hitam') { won = true; multiplier = 2; }
                else if (pilihan === 'hijau' && resultColor === 'hijau') { won = true; multiplier = 14; }
                else if (pilihan === 'ganjil' && isOdd) { won = true; multiplier = 2; }
                else if (pilihan === 'genap' && isEven) { won = true; multiplier = 2; }
                
                const payout = won ? bet * multiplier : 0;
                let embed;
                
                if (won) {
                    db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(payout, guildId, interaction.user.id);
                    incrementUserStat(guildId, interaction.user.id, 'roulette_wins');
                    incrementUserStat(guildId, interaction.user.id, 'roulette_total_winnings', payout);
                    await checkAchievements(interaction.guild, interaction.user.id, { type: 'roulette' });
                    embed = new EmbedBuilder()
                        .setColor(resultColor === 'merah' ? '#E74C3C' : resultColor === 'hijau' ? '#2ECC71' : '#2C2F33')
                        .setTitle('🎯🎉 ROULETTE — MENANG!')
                        .setDescription(`> 🎡 **ROULETTE TABLE**\n>\n> ┌─────────────┐\n> │  ${colorEmoji} **${resultNumber}**  │\n> │  ${colorName}  │\n> └─────────────┘\n\n> 🎯 Pilihan: **${pilihan.charAt(0).toUpperCase() + pilihan.slice(1)}** ✅\n> 💰 Taruhan: 🪙 ${bet.toLocaleString('id-ID')}\n> 🎉 Menang: 🪙 **+${payout.toLocaleString('id-ID')}** (${multiplier}x)`);
                } else {
                    await checkAchievements(interaction.guild, interaction.user.id, { type: 'roulette' });
                    embed = new EmbedBuilder()
                        .setColor('#95A5A6')
                        .setTitle('🎯 ROULETTE — Kalah!')
                        .setDescription(`> 🎡 **ROULETTE TABLE**\n>\n> ┌─────────────┐\n> │  ${colorEmoji} **${resultNumber}**  │\n> │  ${colorName}  │\n> └─────────────┘\n\n> 🎯 Pilihan: **${pilihan.charAt(0).toUpperCase() + pilihan.slice(1)}** ❌\n> 💰 Taruhan: 🪙 ${bet.toLocaleString('id-ID')}\n> 😔 Kalah: 🪙 **-${bet.toLocaleString('id-ID')}**`);
                }
                const freshData = getOrCreateUser(guildId, interaction.user.id);
                embed.setFooter({ text: `Saldo: ${freshData.balance.toLocaleString('id-ID')} money | ${interaction.user.username}` });
                interaction.editReply({ embeds: [embed] }).catch(()=>{});
            }, 2500);
            return;
        }

        // ================= GIFT / TRANSFER =================
        if (command === 'economy' && subCmd === 'gift') {
            const giftCdKey = `gift_${guildId}_${interaction.user.id}`;
            if (fishCooldowns.has(giftCdKey) && Date.now() < fishCooldowns.get(giftCdKey)) { const remaining = Math.ceil((fishCooldowns.get(giftCdKey) - Date.now()) / 1000); return interaction.reply({ content: `⏳ Tunggu **${remaining} detik** sebelum kirim gift lagi.`, ephemeral: true }); }
            fishCooldowns.set(giftCdKey, Date.now() + 10000);
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('jumlah');
            if (targetUser.id === interaction.user.id) return interaction.reply({ content: '❌ Tidak bisa kirim ke diri sendiri!', ephemeral: true });
            if (targetUser.bot) return interaction.reply({ content: '❌ Tidak bisa kirim ke bot!', ephemeral: true });
            if (userData.balance < amount) return interaction.reply({ content: `❌ Saldo kurang! Kamu punya 🪙 **${userData.balance.toLocaleString('id-ID')}**`, ephemeral: true });
            // Cek limit harian penerima
            const receivedToday = getGiftReceivedToday(guildId, targetUser.id);
            if (receivedToday + amount > GIFT_RECEIVE_LIMIT_PER_DAY) return interaction.reply({ content: `❌ <@${targetUser.id}> sudah mencapai batas terima harian (🪙 ${GIFT_RECEIVE_LIMIT_PER_DAY.toLocaleString('id-ID')}/hari). Sisa kuota: 🪙 ${(GIFT_RECEIVE_LIMIT_PER_DAY - receivedToday).toLocaleString('id-ID')}`, ephemeral: true });
            // Cek tax-free voucher (stat 'tax_free_voucher' > 0)
            const hasTaxFree = getUserStat(guildId, interaction.user.id, 'tax_free_voucher') > 0;
            const taxAmount = hasTaxFree ? 0 : Math.floor(amount * GIFT_TAX_RATE);
            const netAmount = amount - taxAmount;
            if (hasTaxFree) incrementUserStat(guildId, interaction.user.id, 'tax_free_voucher', -1);
            // Transfer
            userData.balance -= amount;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
            const targetData = getOrCreateUser(guildId, targetUser.id);
            targetData.balance += netAmount;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(targetData.balance, guildId, targetUser.id);
            addGiftReceivedToday(guildId, targetUser.id, netAmount);
            incrementUserStat(guildId, interaction.user.id, 'total_gifts_sent');
            incrementUserStat(guildId, interaction.user.id, 'total_gift_amount', amount);
            await checkAchievements(interaction.guild, interaction.user.id, { type: 'gift_send' });
            await checkAchievements(interaction.guild, targetUser.id, { type: 'gift_receive' });
            const embed = new EmbedBuilder().setColor('#FF69B4').setTitle('🎁 Gift Terkirim!')
                .setDescription(`<@${interaction.user.id}> ➜ <@${targetUser.id}>\n\n> 💰 **Jumlah:** 🪙 ${amount.toLocaleString('id-ID')}\n> 📊 **Pajak (${hasTaxFree ? 'FREE!' : '10%'}):** 🪙 ${taxAmount.toLocaleString('id-ID')}${hasTaxFree ? ' *(Tax-Free Voucher)*' : ''}\n> ✅ **Diterima:** 🪙 ${netAmount.toLocaleString('id-ID')}`)
                .setFooter({ text: `Saldo pengirim: ${userData.balance.toLocaleString('id-ID')} | Limit harian: ${(receivedToday + netAmount).toLocaleString('id-ID')}/${GIFT_RECEIVE_LIMIT_PER_DAY.toLocaleString('id-ID')}` })
                .setTimestamp();
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

        if (command === 'sell') {
            return interaction.reply({ content: '❌ Command `/sell` sudah dihapus! Gunakan `/fishing sell` untuk menjual ikan.', ephemeral: true });
        }

        if (command === 'me' && subCmd === 'inventory') {
            const items = db.prepare('SELECT * FROM item_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, interaction.user.id);
            if (items.length === 0) return interaction.reply({ content: '🎒 Inventory kosong! Beli item di `/shop` kategori Items.', ephemeral: true });
            let desc = '';
            for (const inv of items) {
                const def = ITEMS.find(i => i.id === inv.itemId);
                if (def) desc += `${def.emoji} **${def.name}** x${inv.quantity}\n> *${def.desc}*\n\n`;
            }
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎒 Item Inventory').setColor('#2B2D31').setDescription(desc).setFooter({ text: 'Gunakan item dari /profile → Inventory' })] });
        }

        if (command === 'me' && subCmd === 'use') {
            const useCdKey = `use_${guildId}_${interaction.user.id}`;
            if (fishCooldowns.has(useCdKey) && Date.now() < fishCooldowns.get(useCdKey)) { return interaction.reply({ content: '⏳ Tunggu sebentar sebelum menggunakan item lagi.', ephemeral: true }); }
            fishCooldowns.set(useCdKey, Date.now() + 3000);

            const itemId = interaction.options.getString('item');
            const itemDef = ITEMS.find(i => i.id === itemId);
            if (!itemDef) return interaction.reply({ content: '❌ Item tidak ditemukan!', ephemeral: true });
            if (getItemCount(guildId, interaction.user.id, itemId) <= 0) return interaction.reply({ content: '❌ Kamu tidak punya item ini! Beli di `/shop`.', ephemeral: true });
            
            if (itemId === 'mystery_box') {
                const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
                const usedToday = getUserStat(guildId, interaction.user.id, `mbox_${today}`);
                if (usedToday >= 5) return interaction.reply({ content: '❌ Kamu sudah membuka 5 Mystery Box hari ini! Tunggu besok.', ephemeral: true });
                removeItem(guildId, interaction.user.id, itemId);
                incrementUserStat(guildId, interaction.user.id, `mbox_${today}`);
                let reward;
                const roll = Math.random();
                if (roll < 0.50) reward = getRandomInt(50, 200);
                else if (roll < 0.80) reward = getRandomInt(200, 500);
                else if (roll < 0.95) reward = getRandomInt(500, 1000);
                else reward = getRandomInt(1000, 2000);
                userData.balance += reward;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#9B59B6').setTitle('📦 Mystery Box Dibuka!').setDescription(`Kamu mendapatkan 🪙 **${reward.toLocaleString('id-ID')} Money**!\n\n> Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**`)] });
            }
            if (itemId === 'daily_doubler') {
                removeItem(guildId, interaction.user.id, itemId);
                incrementUserStat(guildId, interaction.user.id, 'daily_doubler_active', 1);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **${itemDef.name}** diaktifkan! \`/daily\` berikutnya akan x2.`, ephemeral: false });
            }
            if (itemId === 'auto_harvest_pass') {
                removeItem(guildId, interaction.user.id, itemId);
                db.prepare('INSERT OR REPLACE INTO auto_harvest (guildId, userId, enabled, purchased) VALUES (?, ?, 1, 1)').run(guildId, interaction.user.id);
                return interaction.reply({ content: `✅ 🔔 **Auto-Harvest Pass** diaktifkan!\n\n> Bot akan ping kamu saat tanaman siap dipanen.\n> Toggle on/off dengan \`/autoharvest\``, ephemeral: false });
            }
            if (itemId === 'lucky_spin_token') {
                removeItem(guildId, interaction.user.id, itemId);
                incrementUserStat(guildId, interaction.user.id, 'lucky_spin_active', 1);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **${itemDef.name}** diaktifkan! Slot berikutnya dijamin 2 simbol sama.`, ephemeral: false });
            }
            if (itemId === 'xp_booster_2x') {
                removeItem(guildId, interaction.user.id, itemId);
                const expiry = Date.now() + 3600000; // 1 hour
                db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, interaction.user.id, 'xp_boost_2x_until', expiry);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **XP Booster 2x** aktif selama **1 jam**! Semua XP yang kamu dapat akan x2.`, ephemeral: false });
            }
            if (itemId === 'xp_booster_3x') {
                removeItem(guildId, interaction.user.id, itemId);
                const expiry = Date.now() + 3600000; // 1 hour
                db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, interaction.user.id, 'xp_boost_3x_until', expiry);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **XP Booster 3x** aktif selama **1 jam**! Semua XP yang kamu dapat akan x3.`, ephemeral: false });
            }
            if (itemId === 'streak_shield') {
                removeItem(guildId, interaction.user.id, itemId);
                incrementUserStat(guildId, interaction.user.id, 'streak_shield_count', 1);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **Streak Shield** diaktifkan! Jika kamu lupa chat 1 hari, streak akan otomatis terlindungi.`, ephemeral: false });
            }
            if (itemId === 'lucky_charm') {
                removeItem(guildId, interaction.user.id, itemId);
                const expiry = Date.now() + 3600000; // 1 hour
                db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, interaction.user.id, 'lucky_charm_until', expiry);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **Lucky Charm** aktif selama **1 jam**! +15% chance menang di semua game.`, ephemeral: false });
            }
            if (itemId === 'money_magnet') {
                removeItem(guildId, interaction.user.id, itemId);
                const expiry = Date.now() + 3600000; // 1 hour
                db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, interaction.user.id, 'money_magnet_until', expiry);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **Money Magnet** aktif selama **1 jam**! +50% money dari semua sumber.`, ephemeral: false });
            }
            if (itemId === 'tax_free_voucher') {
                removeItem(guildId, interaction.user.id, itemId);
                incrementUserStat(guildId, interaction.user.id, 'tax_free_voucher', 1);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **Tax-Free Voucher** diaktifkan! Gift berikutnya tanpa pajak 10%.`, ephemeral: false });
            }
            return interaction.reply({ content: '❌ Item tidak bisa digunakan langsung.', ephemeral: true });
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
                    }
                }
                addPetExp(guildId, winner.id, 15);
                addPetExp(guildId, loser.id, 5);
                incrementUserStat(guildId, winner.id, 'pvp_wins');
                updateQuestProgress(guildId, interaction.user.id, 'battle', 1);
                updateQuestProgress(guildId, target.id, 'battle', 1);
                await checkAchievements(interaction.guild, winner.id, { type: 'pvp_win' });
                const embed = new EmbedBuilder().setColor('#FF6B00').setTitle(`⚔️ BATTLE RESULT`).setDescription(`${result.log.join('\n')}\n\n━━━━━━ **RESULT** ━━━━━━\n🏆 Winner: ${result.winner === 1 ? myPetDef.emoji : enemyPetDef.emoji} **${result.winner === 1 ? myPet.name : enemyPet.name}** (<@${winner.id}>)\n💀 Loser: ${result.winner === 1 ? enemyPetDef.emoji : myPetDef.emoji} **${result.winner === 1 ? enemyPet.name : myPet.name}**${taruhan > 0 ? `\n\n💰 Taruhan: 🪙 **${taruhan.toLocaleString('id-ID')}** → <@${winner.id}>` : ''}`).setFooter({ text: 'Winner +15 EXP | Loser +5 EXP' });
                interaction.editReply({ embeds: [embed] }).catch(() => {});
            }, 3000);
            return;
        }


        if (command === 'admin_shop') { if (!isAdmin) return interaction.reply({content: '❌ Admin Only', ephemeral: true}); if (subCmd === 'add_item') { const nama = interaction.options.getString('nama'), harga = interaction.options.getInteger('harga'), isi = interaction.options.getString('isi').replace(/\\n/g, '\n'), jumlah = interaction.options.getInteger('jumlah') || 1; const stmt = db.prepare('INSERT INTO shop_items (guildId, name, price, content) VALUES (?, ?, ?, ?)'); for (let i = 0; i < jumlah; i++) stmt.run(guildId, nama, harga, isi); return interaction.reply(`✅ **${jumlah} stok** barang **${nama}** ditambah.`); } if (subCmd === 'add_role') { db.prepare('INSERT OR REPLACE INTO shop_roles (guildId, roleId, price) VALUES (?, ?, ?)').run(guildId, interaction.options.getRole('role').id, interaction.options.getInteger('harga')); return interaction.reply(`✅ Role ditambah.`); } if (subCmd === 'set_custom_role') { const harga = interaction.options.getInteger('harga'); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'custom_role_price', harga.toString()); if (harga <= 0) return interaction.reply('🛑 Custom Role dimatikan.'); return interaction.reply(`✅ Harga Custom Role: 🪙 **${harga.toLocaleString('id-ID')}**.`); } if (subCmd === 'voucher_add') { const code = interaction.options.getString('kode').toUpperCase(), reward = interaction.options.getInteger('reward'), limit = interaction.options.getInteger('limit'); db.prepare('INSERT OR REPLACE INTO vouchers (guildId, code, reward, max_uses, current_uses) VALUES (?, ?, ?, ?, 0)').run(guildId, code, reward, limit); return interaction.reply(`🎟️ Voucher \`${code}\` dibuat!`); } if (subCmd === 'set_testimoni') { db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'testimoni_channel', interaction.options.getChannel('channel').id); return interaction.reply(`✅ Testimoni diatur!`); } if (subCmd === 'history') { const logs = db.prepare('SELECT * FROM logs WHERE guildId = ? ORDER BY time DESC LIMIT ?').all(guildId, Math.min(interaction.options.getInteger('jumlah') || 10, 50)); if (logs.length === 0) return interaction.reply('Kosong.'); let logTxt = '📜 **RIWAYAT TRANSAKSI**\n\n'; logs.forEach(l => { logTxt += `\`[${new Date(l.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' })}]\` <@${l.userId}> beli **${l.item}** (🪙 ${l.price.toLocaleString('id-ID')})\n`; }); return interaction.reply({ embeds: [new EmbedBuilder().setDescription(logTxt).setColor('#2B2D31')], allowedMentions: {users: []} }); } }

        if (command === 'shop') {
            const roles = db.prepare('SELECT * FROM shop_roles WHERE guildId = ?').all(guildId);
            const items = db.prepare('SELECT name, price, COUNT(*) as stock FROM shop_items WHERE guildId = ? GROUP BY name, price').all(guildId);
            const crPrice = parseInt(getSetting(guildId, 'custom_role_price', '0'));
            
            let shopDesc = '';
            const componentsRows = [];

            // 🎣 FISHING section (Joran + Umpan) — Row 1
            shopDesc += '🎣 **FISHING**\n';
            ROD_TYPES.filter(r => r.price > 0).slice(0, 4).forEach(r => { shopDesc += `> ${r.emoji} ${r.name} — 🪙 **${r.price.toLocaleString('id-ID')}** | CD: ${r.cooldown}s\n`; });
            shopDesc += `> *...dan ${ROD_TYPES.filter(r => r.price > 0).length - 4} joran lainnya + ${BAIT_TYPES.filter(b => b.price > 0).length} umpan*\n\n`;
            const fishingMenu = new StringSelectMenuBuilder().setCustomId('shop_buy_fishing').setPlaceholder('🎣 Beli Joran / Umpan...').setMinValues(1).setMaxValues(1);
            ROD_TYPES.filter(r => r.price > 0).forEach(r => { fishingMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${r.name} (🪙 ${r.price.toLocaleString('id-ID')})`).setValue(`rod_${r.id}`).setDescription(`CD: ${r.cooldown}s | +${r.rareBonus}% Rare`)); });
            BAIT_TYPES.filter(b => b.price > 0).slice(0, 14).forEach(b => { fishingMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${b.name} (🪙 ${b.price.toLocaleString('id-ID')})`).setValue(`bait_${b.id}`).setDescription(`+${b.rareBonus}% chance ikan langka`)); });
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
            ITEMS.forEach(item => { gameItemMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${item.emoji} ${item.name} (🪙 ${item.price.toLocaleString('id-ID')})`).setDescription(`${item.desc.substring(0, 50)}`).setValue(item.id)); });
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

        // ================= PET EVOLUTION =================
        if (command === 'evolve') {
            const pet = getPetData(guildId, interaction.user.id);
            if (!pet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
            const evo = checkPetEvolution(guildId, interaction.user.id);
            if (!evo) return interaction.reply({ content: `❌ **${pet.name}** belum bisa evolve!\n\n> 💡 Cek syarat evolusi di \`/pet info\`\n> Pet kamu: **${pet.petId}** Lv.${pet.level}`, ephemeral: true });
            const result = evolvePet(guildId, interaction.user.id);
            if (!result) return interaction.reply({ content: '❌ Gagal evolve!', ephemeral: true });
            const oldDef = PET_DATA.find(p => p.id === evo.from);
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('🧬 PET EVOLUTION!').setDescription(`${oldDef ? oldDef.emoji : '🐾'} **${pet.name}** berevolusi!\n\n> 🔄 **${evo.name}**\n> ${result.newPetDef.emoji} Tier: **${result.newPetDef.tier}**\n\n> ⚔️ ATK: ${result.newStats.atk} | 🛡️ DEF: ${result.newStats.def}\n> ❤️ HP: ${result.newStats.hp} | 💨 SPD: ${result.newStats.spd}\n> 🎯 CRIT: ${result.newStats.crit}%\n\n🎉 *Selamat! Pet kamu sekarang jauh lebih kuat!*`).setFooter({ text: 'Stats di-reset sesuai tier baru' })] });
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

        // ================= FISHING CONTEST =================
        if (command === 'contest') {
            if (subCmd === 'start') {
                if (!isAdmin) return interaction.reply({ content: '❌ Hanya Admin!', ephemeral: true });
                const state = getContestState(guildId);
                if (state && state.active && Date.now() < state.endsAt) return interaction.reply({ content: '❌ Kontes sedang berjalan!', ephemeral: true });
                const durasi = interaction.options.getInteger('durasi') || 60;
                const endsAt = startFishContest(guildId, interaction.channelId, durasi);
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#F1C40F').setTitle('🏆 FISHING CONTEST DIMULAI!').setDescription(`Siapa yang bisa menangkap **ikan TERBERAT** dalam ${durasi} menit?\n\n> ⏱️ Berakhir: <t:${Math.floor(endsAt/1000)}:R>\n> 🎣 Gunakan \`/fish\` untuk berpartisipasi!\n> 📊 Cek ranking: \`/contest leaderboard\`\n\n🥇 **Hadiah:** Top 3 dapat bonus money!`).setFooter({ text: 'Setiap ikan yang kamu tangkap otomatis masuk kontes' })] });
            }
            if (subCmd === 'status') {
                const state = getContestState(guildId);
                if (!state || !state.active || Date.now() > state.endsAt) return interaction.reply({ content: '📭 Tidak ada kontes yang sedang berjalan.\n> Admin bisa mulai dengan `/contest start`', ephemeral: true });
                const remaining = Math.ceil((state.endsAt - Date.now()) / 60000);
                const top = getContestLeaderboard(guildId, 3);
                let topDesc = top.length > 0 ? top.map((e, i) => `> ${['🥇','🥈','🥉'][i]} <@${e.oderId}> — ${e.weight} kg`).join('\n') : '> Belum ada peserta!';
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#F1C40F').setTitle('🏆 Fishing Contest').setDescription(`> ⏱️ Sisa waktu: **${remaining} menit**\n> 🎯 Target: Ikan terberat!\n\n**Top 3 saat ini:**\n${topDesc}`).setFooter({ text: '/fish untuk berpartisipasi | /contest leaderboard untuk ranking lengkap' })] });
            }
            if (subCmd === 'leaderboard') {
                const state = getContestState(guildId);
                const top = getContestLeaderboard(guildId, 10);
                if (top.length === 0) return interaction.reply({ content: '📭 Belum ada data kontes.', ephemeral: true });
                let desc = '';
                top.forEach((e, i) => { const fishDef = FISH_DATA.find(f => f.id === e.fishId); desc += `**${i+1}.** <@${e.oderId}> — ${fishDef ? fishDef.emoji : '🐟'} ${fishDef ? fishDef.name : '?'} (**${e.weight} kg**)\n`; });
                const isActive = state && state.active && Date.now() < state.endsAt;
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Contest Leaderboard').setColor('#FFD700').setDescription(desc).setFooter({ text: isActive ? `Kontes aktif! Sisa: ${Math.ceil((state.endsAt-Date.now())/60000)} menit` : 'Kontes selesai' })] });
            }
            if (subCmd === 'end') {
                if (!isAdmin) return interaction.reply({ content: '❌ Hanya Admin!', ephemeral: true });
                const state = getContestState(guildId);
                if (!state || !state.active) return interaction.reply({ content: '❌ Tidak ada kontes aktif!', ephemeral: true });
                db.prepare('UPDATE fish_contest_state SET active = 0 WHERE guildId = ?').run(guildId);
                const top = getContestLeaderboard(guildId, 3);
                const prizes = [3000, 1500, 800];
                let desc = '🏆 **KONTES SELESAI!**\n\n';
                top.forEach((e, i) => { const fishDef = FISH_DATA.find(f => f.id === e.fishId); const prize = prizes[i] || 0; desc += `${['🥇','🥈','🥉'][i]} <@${e.oderId}> — ${fishDef ? fishDef.emoji : '🐟'} **${e.weight} kg** → 🪙 +${prize}\n`; db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(prize, guildId, e.oderId); });
                if (top.length === 0) desc += '*Tidak ada peserta!*';
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('🏆 Fishing Contest — Hasil!').setDescription(desc).setFooter({ text: 'Hadiah sudah dibagikan!' })] });
            }
        }

        // ================= AUTO-HARVEST TOGGLE =================
        if (command === 'autoharvest') {
            let ahData = db.prepare('SELECT * FROM auto_harvest WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id);
            if (!ahData) { db.prepare('INSERT INTO auto_harvest (guildId, userId) VALUES (?, ?)').run(guildId, interaction.user.id); ahData = { purchased: 0, enabled: 0 }; }
            if (!ahData.purchased) return interaction.reply({ content: '❌ Kamu belum punya **🔔 Auto-Harvest Pass**!\n\n> Beli di `/shop` kategori Items seharga 🪙 5,000\n> Setelah beli, gunakan dari `/profile` → Inventory untuk aktivasi.', ephemeral: true });
            const newState = ahData.enabled ? 0 : 1;
            db.prepare('UPDATE auto_harvest SET enabled = ? WHERE guildId = ? AND userId = ?').run(newState, guildId, interaction.user.id);
            return interaction.reply({ content: newState ? '🔔 **Auto-Harvest Notification AKTIF!**\n> Bot akan ping kamu saat tanaman siap dipanen.' : '🔕 **Auto-Harvest Notification DIMATIKAN.**\n> Kamu tidak akan di-ping lagi.', ephemeral: true });
        }

        // ================= STREAK (user: via /me, admin: via /streak) =================
        if (command === 'me' && subCmd === 'streak') { const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id), emoji = getSetting(guildId, 'streak_emoji', '🔥'), count = sData ? sData.count : 0; return interaction.reply({content: `${emoji} **Streak:** \`${count} Hari\` berturut-turut!`}); }
        if (command === 'me' && subCmd === 'restore') { const currentMonth = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).substring(0, 7); let restoreData = db.prepare('SELECT * FROM streak_restores WHERE guildId = ? AND userId = ? AND month = ?').get(guildId, interaction.user.id, currentMonth); const restoreCount = restoreData ? restoreData.count : 0; if (restoreCount >= 3) return interaction.reply({ content: '❌ Batas restore (3x) bulan ini habis!', ephemeral: true }); const history = db.prepare('SELECT * FROM streak_history WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id); if (!history || history.lost_count <= 1) return interaction.reply({ content: '❌ Tidak ada streak terputus.', ephemeral: true }); const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id), currentCount = sData ? sData.count : 0, newCount = history.lost_count + currentCount; db.prepare('UPDATE streaks SET count = ? WHERE guildId = ? AND userId = ?').run(newCount, guildId, interaction.user.id); db.prepare('DELETE FROM streak_history WHERE guildId = ? AND userId = ?').run(guildId, interaction.user.id); if (restoreData) db.prepare('UPDATE streak_restores SET count = count + 1 WHERE guildId = ? AND userId = ? AND month = ?').run(guildId, interaction.user.id, currentMonth); else db.prepare('INSERT INTO streak_restores (guildId, userId, month, count) VALUES (?, ?, ?, 1)').run(guildId, interaction.user.id, currentMonth); return interaction.reply({ content: `✅ Streak dipulihkan! Total: **${newCount} Hari**. (Sisa: ${2 - restoreCount}x)`, ephemeral: true }); }

        if (command === 'streak') {
            if (!isAdmin) return interaction.reply({content: '❌ Hanya Admin!', ephemeral: true});
            if (subCmd === 'setting') { const status = interaction.options.getString('status'), autoNick = interaction.options.getString('autonick'), minHari = interaction.options.getInteger('min_hari'), emoji = interaction.options.getString('emoji') || '🔥'; db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_enabled', status); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_auto_nick', autoNick); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_min', minHari.toString()); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_emoji', emoji); return interaction.reply(`✅ Streak: ${status === 'true' ? 'ON' : 'OFF'} | Nick: ${autoNick === 'true' ? 'Ya' : 'Tidak'} | Min: ${minHari} | Emoji: ${emoji}`); }
            if (subCmd === 'admin_set') { const target = interaction.options.getUser('user'), amount = interaction.options.getInteger('jumlah'), today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); db.prepare('INSERT OR REPLACE INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, ?, ?)').run(guildId, target.id, amount, today); return interaction.reply(`✅ Streak <@${target.id}> = **${amount}**.`); }
            if (subCmd === 'admin_reset') { const target = interaction.options.getUser('user'); db.prepare('DELETE FROM streaks WHERE guildId = ? AND userId = ?').run(guildId, target.id); db.prepare('DELETE FROM streak_history WHERE guildId = ? AND userId = ?').run(guildId, target.id); return interaction.reply(`🗑️ Streak <@${target.id}> reset ke 0.`); }
            if (subCmd === 'admin_restore') { const target = interaction.options.getUser('user'), history = db.prepare('SELECT * FROM streak_history WHERE guildId = ? AND userId = ?').get(guildId, target.id); if (!history || history.lost_count <= 1) return interaction.reply({ content: '❌ Tidak ada streak terputus.', ephemeral: true }); const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, target.id), currentCount = sData ? sData.count : 0, newCount = history.lost_count + currentCount, today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); db.prepare('INSERT OR REPLACE INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, ?, ?)').run(guildId, target.id, newCount, sData ? sData.last_date : today); db.prepare('DELETE FROM streak_history WHERE guildId = ? AND userId = ?').run(guildId, target.id); return interaction.reply(`✅ Streak <@${target.id}> dipulihkan: **${newCount}**.`); }
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

        if (interaction.customId.startsWith('ach_detail_')) { const targetUserId = interaction.customId.replace('ach_detail_', ''), selectedCat = interaction.values[0], catAchs = ACHIEVEMENTS.filter(a => a.category === selectedCat), userAchs = db.prepare('SELECT * FROM achievements WHERE guildId = ? AND userId = ?').all(guildId, targetUserId), unlockedIds = userAchs.map(a => a.achievementId); const catUnlocked = catAchs.filter(a => unlockedIds.includes(a.id)).length; const catIcon = { Social: '💬', Economy: '💰', Level: '📈', Streak: '🔥', Gambling: '🎰', Events: '🎮', Voice: '🎙️', Quest: '📜', Special: '✨', Fishing: '🎣', Farming: '🌾' }[selectedCat] || '📁'; let desc = `${catIcon} **${selectedCat}** — ${catUnlocked}/${catAchs.length} unlocked\n━━━━━━━━━━━━━━━━━━━━━━\n\n`; for (const ach of catAchs) { const unlocked = unlockedIds.includes(ach.id); const status = unlocked ? '✅' : '🔒'; const nameStyle = unlocked ? `**${ach.name}**` : `~~${ach.name}~~`; desc += `${status} ${ach.emoji} ${nameStyle}\n> *${ach.desc}*\n> Hadiah: 🪙 ${ach.reward.toLocaleString('id-ID')} Money${unlocked ? ' ✓ Diklaim' : ''}\n\n`; } return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${catIcon} Achievement: ${selectedCat}`).setColor(catUnlocked === catAchs.length ? '#FFD700' : '#2B2D31').setDescription(desc).setFooter({ text: catUnlocked === catAchs.length ? '🎉 Kategori ini sudah COMPLETE!' : `${catAchs.length - catUnlocked} badge tersisa` })], ephemeral: true }); }
        if (interaction.customId === 'shop_buy_custom_role' || (interaction.customId === 'shop_buy_role_misc' && interaction.values[0] === 'init_cr')) { const crPrice = parseInt(getSetting(guildId, 'custom_role_price', '0')), userData = getOrCreateUser(guildId, interaction.user.id); if (userData.balance < crPrice) return interaction.reply({ content: '❌ Uang kurang!', ephemeral: true }); const colorMenu = new StringSelectMenuBuilder().setCustomId('cr_select_color').setPlaceholder('🎨 Pilih Warna...').addOptions(new StringSelectMenuOptionBuilder().setLabel('🔴 Merah').setValue('FF0000'), new StringSelectMenuOptionBuilder().setLabel('🔵 Biru').setValue('0000FF'), new StringSelectMenuOptionBuilder().setLabel('🟢 Hijau').setValue('00FF00'), new StringSelectMenuOptionBuilder().setLabel('🟡 Kuning').setValue('FFFF00'), new StringSelectMenuOptionBuilder().setLabel('🟣 Ungu').setValue('800080'), new StringSelectMenuOptionBuilder().setLabel('🌸 Pink').setValue('FFC0CB'), new StringSelectMenuOptionBuilder().setLabel('⚫ Hitam').setValue('010101'), new StringSelectMenuOptionBuilder().setLabel('⚪ Putih').setValue('FFFFFF'), new StringSelectMenuOptionBuilder().setLabel('⚙️ Hex Sendiri').setValue('custom')); return interaction.reply({ content: 'Pilih warna:', components: [new ActionRowBuilder().addComponents(colorMenu)], ephemeral: true }); }
        if (interaction.customId === 'cr_select_color') { const selectedColor = interaction.values[0], modal = new ModalBuilder().setCustomId(`submit_cr_${selectedColor}`).setTitle('Custom Role 🎨'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cr_name').setLabel('Nama Role (Max 32)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32))); if (selectedColor === 'custom') modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cr_color').setLabel('Hex (#FF0000)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(7).setMaxLength(7).setPlaceholder('#FFFFFF'))); return interaction.showModal(modal); }
        // --- FISHING SHOP BUY ---
        if (interaction.customId === 'fishing_buy_rod' || interaction.customId === 'fishing_buy_bait' || interaction.customId === 'shop_buy_fishing') {
            const selected = interaction.values[0], userData = getOrCreateUser(guildId, interaction.user.id);
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
            if (!plot) return interaction.reply({ content: '❌ Tidak ada tanaman yang bisa dipupuk! Semua sudah dipupuk atau tidak ada tanaman.\n> Gunakan `/farm pupuk` untuk pilih tanaman spesifik.', ephemeral: true });
            userData.balance -= fert.cost;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
            db.prepare('UPDATE farm_plots SET fertilizer = ? WHERE id = ?').run(fertId, plot.id);
            const crop = FARM_CROPS.find(c => c.id === plot.cropId);
            return interaction.reply({ content: `✅ ${fert.emoji} **${fert.name}** → [Slot] ${crop ? crop.emoji + ' ' + crop.name : 'tanaman'}!\n> ⏩ -${Math.round(fert.speedBonus*100)}% waktu${fert.yieldBonus > 0 ? ` | 📈 +${Math.round(fert.yieldBonus*100)}% hasil` : ''}\n\n💡 *Tip: Gunakan \`/farm pupuk\` untuk memilih tanaman spesifik!*` });
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
                if (!plot) return interaction.reply({ content: '❌ Tidak ada tanaman yang bisa dipupuk!\n> Gunakan `/farm pupuk` untuk pilih tanaman spesifik.', ephemeral: true });
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
                return interaction.reply({ content: `✅ Membeli ${food.emoji} **${food.name}**! Masuk ke inventory makanan.\n> 📦 Total ${food.name}: **${owned}**\n> 💡 Pakai dengan \`/pet feed\`` });
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
                return interaction.reply({ embeds: [new EmbedBuilder().setColor(tierColors[selectedTier] || '#2B2D31').setTitle(title).setDescription(`${wonPet.emoji} **${wonPet.name}**\n> Tier: **${selectedTier}**\n> Bonus: +${wonPet.bonus.value}% ${wonPet.bonus.type.replace(/_/g, ' ')}\n\n${isFirst ? '✅ Langsung aktif!' : 'Gunakan `/pet swap` untuk mengaktifkan.'}`)] });
            }
        }
        if (interaction.customId === 'shop_buy_item' || interaction.customId === 'shop_buy_role' || interaction.customId === 'shop_buy_role_misc') { const selected = interaction.values[0]; let itemName = '', price = 0; if (selected.startsWith('item_')) { const parts = selected.substring(5).split('_'); price = parseInt(parts.pop()); itemName = parts.join('_'); const itemInfo = db.prepare('SELECT price FROM shop_items WHERE guildId = ? AND name = ? AND price = ? LIMIT 1').get(guildId, itemName, price); if (!itemInfo) return interaction.reply({ content: '❌ Habis!', ephemeral: true }); price = itemInfo.price; } else if (selected.startsWith('role_')) { const roleId = selected.substring(5), roleInfo = db.prepare('SELECT price FROM shop_roles WHERE guildId = ? AND roleId = ?').get(guildId, roleId); if (!roleInfo) return interaction.reply({ content: '❌ Tidak dijual!', ephemeral: true }); const roleObj = interaction.guild.roles.cache.get(roleId); itemName = roleObj ? `Role: ${roleObj.name}` : 'Role'; price = roleInfo.price; } const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`confirm_${selected}`).setLabel('✅ Beli').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('cancel_buy').setLabel('❌ Batal').setStyle(ButtonStyle.Danger)); return interaction.reply({ content: `🧾 **${itemName}** — 🪙 **${price.toLocaleString('id-ID')}**\n\nLanjutkan pembelian?`, components: [row], ephemeral: true }); }
    }


    // ================= BUTTON HANDLERS =================
    if (interaction.isButton()) {
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
            const perPage = 20;
            const collected = db.prepare('SELECT * FROM fish_collection WHERE guildId = ? AND userId = ?').all(guildId, targetUserId);
            const collectedIds = collected.map(c => c.fishId);
            const tierFish = FISH_DATA.filter(f => f.tier === tier);
            const tierCollected = tierFish.filter(f => collectedIds.includes(f.id)).length;
            const totalPages = Math.ceil(tierFish.length / perPage);
            const startIdx = page * perPage;
            const pageFish = tierFish.slice(startIdx, startIdx + perPage);
            const tierEmoji = (FISH_TIERS.find(t => t.tier === tier) || {emoji:'🐟'}).emoji;
            let desc = `${tierEmoji} **${tier}** — ${tierCollected}/${tierFish.length} ditemukan\n\n`;
            pageFish.forEach(f => {
                if (collectedIds.includes(f.id)) desc += `> ${f.emoji} ${f.name} ✅\n`;
                else desc += `> ▪️ ??? 🔒\n`;
            });
            if (desc.length > 3900) desc = desc.substring(0, 3890) + '\n...';
            const navRow = new ActionRowBuilder();
            if (page > 0) navRow.addComponents(new ButtonBuilder().setCustomId(`fcol_${tier}_${targetUserId}_${page-1}`).setLabel('◀ Prev').setStyle(ButtonStyle.Secondary));
            navRow.addComponents(new ButtonBuilder().setCustomId(`fcol_back_${targetUserId}_0`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Primary));
            if (page < totalPages - 1) navRow.addComponents(new ButtonBuilder().setCustomId(`fcol_${tier}_${targetUserId}_${page+1}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary));
            
            if (parts[1] === 'back') {
                // Go back to main collection view
                const totalFish = FISH_DATA.length;
                const totalCollectedAll = collectedIds.length;
                const percentDex = Math.floor((totalCollectedAll / totalFish) * 100);
                const tiers = ['Trash', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret'];
                let mainDesc = `📖 **Fish Collection / Pokedex**\n> 🐟 **${totalCollectedAll}** / **${totalFish}** spesies ditemukan (**${percentDex}%**)\n\n`;
                for (const t of tiers) { const tf = FISH_DATA.filter(f => f.tier === t); const tc = tf.filter(f => collectedIds.includes(f.id)).length; const te = (FISH_TIERS.find(x => x.tier === t)||{emoji:'🐟'}).emoji; const p = tf.length > 0 ? Math.floor((tc/tf.length)*10) : 0; mainDesc += `${te} **${t}** — ${tc}/${tf.length}\n> \`${'▰'.repeat(p)}${'▱'.repeat(10-p)}\`\n`; }
                mainDesc += `\n> 🎯 *Pilih rarity di bawah untuk melihat detail!*`;
                const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fcol_Trash_${targetUserId}_0`).setLabel('🗑️ Trash').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`fcol_Common_${targetUserId}_0`).setLabel('🐟 Common').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`fcol_Uncommon_${targetUserId}_0`).setLabel('🐠 Uncommon').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`fcol_Rare_${targetUserId}_0`).setLabel('🐡 Rare').setStyle(ButtonStyle.Primary));
                const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fcol_Epic_${targetUserId}_0`).setLabel('🦈 Epic').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(`fcol_Legendary_${targetUserId}_0`).setLabel('🐉 Legendary').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`fcol_Mythic_${targetUserId}_0`).setLabel('🌈 Mythic').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`fcol_Secret_${targetUserId}_0`).setLabel('🔮 Secret').setStyle(ButtonStyle.Danger));
                return interaction.update({ embeds: [new EmbedBuilder().setTitle('📖 Fish Collection').setColor('#3498DB').setDescription(mainDesc).setFooter({ text: `${totalCollectedAll}/${totalFish} ditemukan` })], components: [row1, row2] });
            }
            return interaction.update({ embeds: [new EmbedBuilder().setTitle(`📖 ${tierEmoji} ${tier} Collection`).setColor('#3498DB').setDescription(desc).setFooter({ text: `Halaman ${page+1}/${totalPages} | ${tierCollected}/${tierFish.length} ditemukan` })], components: [navRow] });
        }

        // --- MENU HUB BUTTONS ---
        if (interaction.customId.startsWith('menu_')) {
            const cat = interaction.customId.replace('menu_', '');
            let content = '';
            if (cat === 'economy') content = '💰 **Economy Commands:**\n\n> `/economy balance` — Cek saldo\n> `/economy coinflip <taruhan>` — Lempar koin 50/50\n> `/economy slot <taruhan>` — Slot machine\n> `/economy gift @user <jumlah>` — Kirim money\n> `/economy redeem <kode>` — Tukar voucher\n> `/economy leaderboard` — Ranking global\n> `/daily` — Klaim hadiah harian';
            else if (cat === 'fishing') content = '🎣 **Fishing Commands:**\n\n> `/fish` — Lempar pancing (quick cast)\n> `/fishing` — 🎣 Buka Fishing Panel\n> Panel: Cast, Inventory, Shop, Stats, Collection\n> Lock/Unlock, Sell All — semua dalam 1 panel!';
            else if (cat === 'farming') content = '🌾 **Farming Commands:**\n\n> `/farm` — 🌾 Buka Farm Panel\n> Panel: Plant, Water, Harvest, Shop\n> Storage, Craft, Upgrade, Pupuk — semua dalam 1 panel!';
            else if (cat === 'pet') content = '🐾 **Pet & Battle:**\n\n> `/pet` — Buka Pet Panel (semua fitur ada di sini!)\n> Feed, Play, Hunt, Shop, Dungeon, Boss, Refine, Evolve\n> Semua dalam 1 panel interaktif dengan tombol!\n> `/battle @user` — PvP auto-battle\n> `/evolve` — Evolve pet ke bentuk baru';
            else if (cat === 'profile') content = '📋 **Profil:**\n\n> `/profile` — 📋 Profile Panel\n> Profil, Achievement, Inventory, Streak, Stats\n> Semua dalam 1 panel interaktif!';
            else if (cat === 'shop') content = '🛒 **Shop:**\n\n> `/shop` — Buka toko lengkap\n> Kategori: 🎣 Fishing, 🌾 Farming, 🐾 Pet, 📿 Battle, 🎭 Role';
            else if (cat === 'daily') content = '🎁 **Daily Reward:**\n\n> `/daily` — Klaim hadiah harian\n> Dapat: Money + Pet EXP + Random Item\n> Bonus streak = hadiah lebih besar!';
            else if (cat === 'quest') content = '📜 **Quest:**\n\n> `/quest` — 📜 Quest Panel\n> Misi harian (3/hari) & mingguan (3/minggu)\n> Selesaikan untuk dapat money bonus!\n> Reset setiap 00:00 WIB';
            return interaction.reply({ content, ephemeral: true });
        }

        if (interaction.customId.startsWith('tv_create_')) { const tempVoiceData = db.prepare('SELECT * FROM temp_voices WHERE ownerId = ? AND guildId = ?').get(interaction.user.id, guildId); if (tempVoiceData) return interaction.reply({ content: `❌ Sudah punya channel (<#${tempVoiceData.channelId}>)!`, ephemeral: true }); const jtcCategoryId = getSetting(guildId, 'jtc_category', null); if (!jtcCategoryId) return interaction.reply({ content: '❌ Belum setup!', ephemeral: true }); if (interaction.customId === 'tv_create_custom') { const modal = new ModalBuilder().setCustomId('tv_modal_custom_create').setTitle('Buat Channel'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_custom_name').setLabel('Nama:').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50))); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_custom_limit').setLabel('Limit (0=bebas):').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setPlaceholder('0'))); return interaction.showModal(modal); } let limit = 0, isPrivate = false, vcName = `🔊 ${interaction.user.username}'s Room`; if (interaction.customId === 'tv_create_duo') { limit = 2; vcName = `👥 ${interaction.user.username}'s Duo`; } if (interaction.customId === 'tv_create_squad') { limit = 4; vcName = `👥 ${interaction.user.username}'s Squad`; } if (interaction.customId === 'tv_create_private') { isPrivate = true; vcName = `🔒 ${interaction.user.username}'s Private`; } await interaction.deferReply({ ephemeral: true }); try { const newVc = await interaction.guild.channels.create({ name: vcName, type: ChannelType.GuildVoice, parent: jtcCategoryId, userLimit: limit, permissionOverwrites: [{ id: guildId, allow: isPrivate ? [] : [PermissionsBitField.Flags.ViewChannel], deny: isPrivate ? [PermissionsBitField.Flags.Connect] : [] }, { id: interaction.user.id, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.Connect] }] }); db.prepare('INSERT INTO temp_voices (channelId, guildId, ownerId) VALUES (?, ?, ?)').run(newVc.id, guildId, interaction.user.id); interaction.editReply(`✅ Dibuat! <#${newVc.id}> (60 detik)`); setTimeout(async () => { const ch = interaction.guild.channels.cache.get(newVc.id); if (ch && ch.members.size === 0) { await ch.delete().catch(()=>{}); db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(newVc.id); } }, 60000); } catch(e) { interaction.editReply('❌ Gagal.'); } return; }

        if (interaction.customId.startsWith('tv_') && !interaction.customId.startsWith('tv_create_')) { const voiceChannel = interaction.member.voice.channel; if (!voiceChannel) return interaction.reply({ content: '❌ Masuk VC dulu!', ephemeral: true }); const channelId = voiceChannel.id, tempVoice = db.prepare('SELECT * FROM temp_voices WHERE channelId = ? AND guildId = ?').get(channelId, guildId); if (!tempVoice) return interaction.reply({ content: '❌ Bukan temp voice.', ephemeral: true }); if (interaction.customId === 'tv_claim') { if (tempVoice.ownerId === interaction.user.id) return interaction.reply({content: '❌ Sudah owner!', ephemeral: true}); if (voiceChannel.members.has(tempVoice.ownerId)) return interaction.reply({content: '❌ Owner masih ada!', ephemeral: true}); db.prepare('UPDATE temp_voices SET ownerId = ? WHERE channelId = ?').run(interaction.user.id, channelId); await voiceChannel.permissionOverwrites.edit(tempVoice.ownerId, { ManageChannels: null, ManageRoles: null }).catch(()=>{}); await voiceChannel.permissionOverwrites.edit(interaction.user.id, { ManageChannels: true, ManageRoles: true }).catch(()=>{}); return interaction.reply({content: '👑 Kamu owner sekarang!', ephemeral: true}); } if (tempVoice.ownerId !== interaction.user.id) return interaction.reply({content: '❌ Owner only.', ephemeral: true}); if (interaction.customId === 'tv_name') { const m = new ModalBuilder().setCustomId(`tv_modal_name_${channelId}`).setTitle('Ubah Nama'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_name').setLabel('Nama:').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50))); return interaction.showModal(m); } if (interaction.customId === 'tv_limit') { const m = new ModalBuilder().setCustomId(`tv_modal_limit_${channelId}`).setTitle('Ubah Limit'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_limit').setLabel('Limit (0=unlimited):').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2))); return interaction.showModal(m); } if (interaction.customId === 'tv_privacy') { const p = voiceChannel.permissionOverwrites.cache.get(guildId), locked = p && p.deny.has(PermissionsBitField.Flags.Connect); if (locked) { await voiceChannel.permissionOverwrites.edit(guildId, { Connect: null }).catch(()=>{}); return interaction.reply({content: '🔓 Terbuka.', ephemeral: true}); } else { await voiceChannel.permissionOverwrites.edit(guildId, { Connect: false }).catch(()=>{}); return interaction.reply({content: '🔒 Dikunci.', ephemeral: true}); } } if (interaction.customId === 'tv_hide') { const p = voiceChannel.permissionOverwrites.cache.get(guildId), hidden = p && p.deny.has(PermissionsBitField.Flags.ViewChannel); if (hidden) { await voiceChannel.permissionOverwrites.edit(guildId, { ViewChannel: null }).catch(()=>{}); return interaction.reply({content: '👁️ Terlihat.', ephemeral: true}); } else { await voiceChannel.permissionOverwrites.edit(guildId, { ViewChannel: false }).catch(()=>{}); return interaction.reply({content: '👻 Tersembunyi.', ephemeral: true}); } } if (interaction.customId === 'tv_kick') { const m = new ModalBuilder().setCustomId(`tv_modal_kick_${channelId}`).setTitle('Kick'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_kick').setLabel('User ID:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_block') { const m = new ModalBuilder().setCustomId(`tv_modal_block_${channelId}`).setTitle('Block'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_block').setLabel('User ID:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_unblock') { const m = new ModalBuilder().setCustomId(`tv_modal_unblock_${channelId}`).setTitle('Unblock'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_unblock').setLabel('User ID:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_transfer') { const m = new ModalBuilder().setCustomId(`tv_modal_transfer_${channelId}`).setTitle('Transfer'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_transfer').setLabel('User ID baru:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_delete') { await voiceChannel.delete().catch(()=>{}); db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(channelId); return interaction.reply({content: '🗑️ Dihapus.', ephemeral: true}); } }

        // --- FISHING INVENTORY PAGINATION ---
        if (interaction.customId.startsWith('finv_prev_') || interaction.customId.startsWith('finv_next_')) {
            const currentPage = parseInt(interaction.customId.split('_')[2]);
            const newPage = interaction.customId.startsWith('finv_prev_') ? currentPage - 1 : currentPage + 1;
            const tierOrder = { 'Secret': 0, 'Mythic': 1, 'Legendary': 2, 'Epic': 3, 'Rare': 4, 'Uncommon': 5, 'Common': 6, 'Trash': 7 };
            const allInventory = db.prepare('SELECT * FROM fish_inventory WHERE guildId = ? AND userId = ?').all(guildId, interaction.user.id);
            const totalCount = allInventory.length;
            const lockedCount = allInventory.filter(i => i.locked === 1).length;
            if (totalCount === 0) return interaction.update({ content: '🎒 Kosong!', embeds: [], components: [] });
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
            return interaction.update({ embeds: [new EmbedBuilder().setTitle('🎣 Fishing Inventory').setColor('#2B2D31').setDescription(desc)], components: [navRow] });
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

        if (interaction.customId === 'airdrop_claim') { if (activeMiniEvents.has(guildId)) activeMiniEvents.delete(guildId); const reward = getRandomInt(300, 600); let ud = getOrCreateUser(guildId, interaction.user.id); ud.balance += reward; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(ud.balance, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'event_wins'); await checkAchievements(interaction.guild, interaction.user.id, { type: 'event_win' }); return interaction.update({ content: `🎉 <@${interaction.user.id}> klaim Air Drop! 🪙 **${reward}**`, embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('x').setLabel(`Diklaim ${interaction.user.username}`).setStyle(ButtonStyle.Secondary).setDisabled(true))] }); }
        // Legacy claim_quest_ and claim_weekly_ buttons (kept for backward compat with old messages)
        if (interaction.customId.startsWith('claim_quest_')) { const qi = parseInt(interaction.customId.replace('claim_quest_', '')), today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); let row = db.prepare('SELECT * FROM daily_quests WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id); if (!row || row.date !== today) return interaction.update({ content: '\u274c Expired. Gunakan `/quest` untuk panel baru.', embeds: [], components: [] }); let quests = JSON.parse(row.data), tq = quests[qi]; if (tq.progress < tq.target || tq.claimed) return interaction.reply({content: '\u274c Belum selesai!', ephemeral: true}); tq.claimed = true; db.prepare('UPDATE daily_quests SET data = ? WHERE guildId = ? AND userId = ?').run(JSON.stringify(quests), guildId, interaction.user.id); let ud = getOrCreateUser(guildId, interaction.user.id); ud.balance += tq.reward; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(ud.balance, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'total_quests_done'); await checkAchievements(interaction.guild, interaction.user.id, { type: 'quest' }); if (quests.every(q => q.claimed)) await checkAchievements(interaction.guild, interaction.user.id, { type: 'all_quest_day' }); let bonusMsg = ''; const streakResult = checkDailyQuestStreak(guildId, interaction.user.id); if (streakResult) { bonusMsg = `\n\n\ud83c\udf81 **ALL DONE BONUS: +200 Money!**\n> \ud83c\udfc5 Perfect Days: ${streakResult.perfectDays}`; if (streakResult.weeklyBonus) bonusMsg += `\n\n\ud83c\udf89\ud83c\udf89 **7-DAY STREAK BONUS!** +1000 Money + \ud83d\udce6 Mystery Box! \ud83c\udf89\ud83c\udf89`; } return interaction.reply(`\u2705 Dapat \ud83e\ude99 **${tq.reward}**!${bonusMsg}`); }
        if (interaction.customId.startsWith('claim_weekly_')) { const qi = parseInt(interaction.customId.replace('claim_weekly_', '')); const week = getWeekId(); let row = db.prepare('SELECT * FROM weekly_quests WHERE guildId = ? AND userId = ? AND week = ?').get(guildId, interaction.user.id, week); if (!row) return interaction.update({ content: '\u274c Expired. Gunakan `/quest` untuk panel baru.', embeds: [], components: [] }); let quests = JSON.parse(row.data), tq = quests[qi]; if (!tq || tq.progress < tq.target || tq.claimed) return interaction.reply({content: '\u274c Belum selesai atau sudah diklaim!', ephemeral: true}); tq.claimed = true; db.prepare('UPDATE weekly_quests SET data = ? WHERE guildId = ? AND userId = ? AND week = ?').run(JSON.stringify(quests), guildId, interaction.user.id, week); let ud = getOrCreateUser(guildId, interaction.user.id); ud.balance += tq.reward; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(ud.balance, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'total_weekly_quests_done'); return interaction.reply(`\u2705 Weekly Quest selesai! Dapat \ud83e\ude99 **${tq.reward.toLocaleString('id-ID')}**!`); }
        if (interaction.customId === 'cancel_buy') return interaction.update({ content: '\u274c Dibatalkan.', components: [] });
        if (interaction.customId.startsWith('confirm_')) { const selected = interaction.customId.substring(8), userData = getOrCreateUser(guildId, interaction.user.id); let finalItemName = '', finalPrice = 0; if (selected.startsWith('item_')) { const parts = selected.substring(5).split('_'); const itemPrice = parseInt(parts.pop()); const itemName = parts.join('_'); const item = db.prepare('SELECT * FROM shop_items WHERE guildId = ? AND name = ? AND price = ? LIMIT 1').get(guildId, itemName, itemPrice); if (!item) return interaction.update({content: '❌ Habis!', components: []}); if (userData.balance < item.price) return interaction.update({content: '❌ Saldo kurang!', components: []}); try { await interaction.user.send(`🛍️ **${item.name}**:\n\`\`\`\n${item.content}\n\`\`\``); } catch(e) { return interaction.update({content: '❌ DM tertutup!', components: []}); } userData.balance -= item.price; finalItemName = item.name; finalPrice = item.price; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); db.prepare('DELETE FROM shop_items WHERE id = ?').run(item.id); } if (selected.startsWith('role_')) { const roleId = selected.substring(5), sr = db.prepare('SELECT * FROM shop_roles WHERE guildId = ? AND roleId = ?').get(guildId, roleId); if (!sr) return interaction.update({content: '❌ Tidak dijual.', components: []}); if (userData.balance < sr.price) return interaction.update({content: '❌ Saldo kurang!', components: []}); if (interaction.member.roles.cache.has(roleId)) return interaction.update({content: '❌ Sudah punya!', components: []}); userData.balance -= sr.price; const role = interaction.guild.roles.cache.get(roleId); finalItemName = role ? `Role ${role.name}` : 'Role'; finalPrice = sr.price; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); if (role) await interaction.member.roles.add(role).catch(()=>{}); } incrementUserStat(guildId, interaction.user.id, 'total_buys'); if (finalPrice > 0) updateQuestProgress(guildId, interaction.user.id, 'spend_money', finalPrice); await checkAchievements(interaction.guild, interaction.user.id, { type: 'buy' }); db.prepare('INSERT INTO logs (guildId, time, userId, action, item, price) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, Date.now(), interaction.user.id, 'BUY', finalItemName, finalPrice); const ts = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, 'testimoni_channel'); if (ts) { const tc = interaction.guild.channels.cache.get(ts.value); if (tc) tc.send({ embeds: [new EmbedBuilder().setColor('#2B2D31').setDescription(`<@${interaction.user.id}> beli **${finalItemName}** (🪙 ${finalPrice.toLocaleString('id-ID')})`).setTimestamp()] }).catch(()=>{}); } return interaction.update({content: `✅ Berhasil beli **${finalItemName}**!`, components: []}); }
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
            return interaction.reply({ content: `✅ Membeli ${crop.emoji} **${crop.name}** x**${qty}**!\n> 💰 Total harga: 🪙 **${totalCost.toLocaleString('id-ID')}**\n> 📦 Total bibit ${crop.name}: **${owned}**\n> 💡 Tanam dengan \`/farm plant\`` });
        }
    }
};
