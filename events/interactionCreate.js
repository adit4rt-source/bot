// events/interactionCreate.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser, getConf, getSetting, getUserStat, incrementUserStat, getItemCount, addItem, removeItem, getPetFoodCount, addPetFood, removePetFood, getAllPetFood, getSeedCount, addSeed, removeSeed, getAllSeeds } = require('../database');
const { getRandomInt } = require('../utils');
const state = require('../state');
const { ACHIEVEMENTS, checkAchievements } = require('../systems/achievements');
const { getComboTracker, addComboFeature, getComboMultiplier } = require('../systems/combo');
const { getContestState, startFishContest, addContestEntry, getContestLeaderboard } = require('../systems/contest');
const { generatePetStats, simulateBattle, simulatePvP, getPetData, getAllPets, addPetExp, checkPetEvolution, evolvePet } = require('../systems/pets');
const { catchFish, getEquipment } = require('../systems/fishing');
const { getFarmData, getFarmSlots, getPlots, getStorage, addStorage, removeStorage, getStorageQty } = require('../systems/farming');
const { updateQuestProgress } = require('../systems/quests');
const { CALENDAR_REWARDS, getLoginCalendar } = require('../systems/calendar');
const { spinSlot, getSlotResult, GIFT_TAX_RATE, GIFT_RECEIVE_LIMIT_PER_DAY, getGiftReceivedToday, addGiftReceivedToday } = require('../systems/slots');
const { FISH_DATA, FISH_TIERS, BAIT_TYPES, ROD_TYPES } = require('../data/fish');
const { PET_DATA, PET_FOODS, PET_EGGS, PET_CLASSES, PET_ELEMENTS, PET_SKILL_MILESTONES, PET_LEVEL_MULTIPLIERS, RELIC_NAMES } = require('../data/pets');
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

    // Autocomplete handler for /me use and /farm
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
        if (interaction.commandName === 'farm') {
            const focused = interaction.options.getFocused(true);
            if (focused.name === 'bibit') {
                const owned = getAllSeeds(guildId, interaction.user.id);
                if (owned.length === 0) return interaction.respond([{ name: '❌ Tidak punya bibit! Beli di /farm shop', value: 'none' }]);
                const choices = owned.map(inv => {
                    const c = FARM_CROPS.find(cr => cr.id === inv.cropId);
                    if (!c) return null;
                    return { name: `${c.emoji} ${c.name} (x${inv.quantity}) — ${c.tier} | ${c.time}m`, value: c.id };
                }).filter(Boolean).filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
                return interaction.respond(choices.length ? choices : [{ name: '❌ Tidak punya bibit! Beli di /farm shop', value: 'none' }]);
            }
            if (focused.name === 'resep') {
                const choices = FARM_RECIPES.map(r => {
                    const ingStr = r.ingredients.map(ing => { const c = FARM_CROPS.find(cr => cr.id === ing.id); return `${c ? c.emoji : ''}${ing.qty}`; }).join('+');
                    let label = `${r.emoji} ${r.name} (Butuh: ${ingStr}) — 🪙${r.sellPrice}`;
                    if (label.length > 100) label = label.substring(0, 97) + '...';
                    return { name: label, value: r.id };
                }).filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
                return interaction.respond(choices);
            }
            if (focused.name === 'jenis') {
                const choices = FARM_FERTILIZERS.filter(f => f.id !== 'none').map(f => ({ name: `${f.emoji} ${f.name} — 🪙${f.cost} | -${Math.round(f.speedBonus*100)}% waktu`, value: f.id })).filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
                return interaction.respond(choices);
            }
        }
        if (interaction.commandName === 'pet') {
            const focused = interaction.options.getFocused(true);
            if (focused.name === 'pet') {
                const choices = PET_DATA.filter(p => p.price > 0).map(p => ({ name: `${p.emoji} ${p.name} (${p.tier}) — 🪙${p.price.toLocaleString('id-ID')}`, value: p.id })).filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
                return interaction.respond(choices);
            }
            if (focused.name === 'food') {
                const owned = getAllPetFood(guildId, interaction.user.id);
                if (owned.length === 0) return interaction.respond([{ name: '❌ Inventory makanan kosong! Beli di /pet shop', value: 'none' }]);
                const choices = owned.map(inv => {
                    const f = PET_FOODS.find(pf => pf.id === inv.foodId);
                    if (!f) return null;
                    return { name: `${f.emoji} ${f.name} (x${inv.quantity}) — +${f.hunger} hunger +${f.happiness} happy`, value: f.id };
                }).filter(Boolean).filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
                return interaction.respond(choices.length ? choices : [{ name: '❌ Inventory makanan kosong! Beli di /pet shop', value: 'none' }]);
            }
            if (focused.name === 'tier') {
                const choices = DUNGEON_TIERS.map(d => ({ name: `${d.name} (Lv.${d.minLevel}+, ${d.waves} waves)`, value: d.id }));
                return interaction.respond(choices);
            }
            if (focused.name === 'boss') {
                const choices = BOSS_LIST.map(b => ({ name: `${b.name} (Lv.${b.minLevel}+, HP: ${b.hp.toLocaleString()})`, value: b.id }));
                return interaction.respond(choices);
            }
            return interaction.respond([]);
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
                { name: '\u200b', value: `> \`/pet adopt/info/feed/play/hunt\` — Kelola pet\n> \`/pet shop\` — Beli makanan & telur (gacha)\n> \`/pet dungeon <tier>\` — Lawan monster\n> \`/pet boss create/solo/list\` — Raid boss\n> \`/pet refine <slot>\` — Upgrade relic\n> \`/battle @user\` — PvP auto-battle`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '📋 **PROFIL & QUEST** (`/me`)', inline: false },
                { name: '\u200b', value: `> \`/me profile\` — Kartu profil\n> \`/me achievement\` — Koleksi badge\n> \`/me inventory\` — Lihat item\n> \`/me use <item>\` — Gunakan item\n> \`/me quest\` — Misi harian\n> \`/me streak\` — Info streak\n> \`/me restore\` — Pulihkan streak\n> \`/level rank\` — Cek XP & level`, inline: false },
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
            if (subCmd === 'quest_channel') { const ch = interaction.options.getChannel('channel'); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'quest_channel', ch.id); return interaction.reply(`✅ \`/me quest\` hanya bisa di <#${ch.id}>.`); }
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
                .setFooter({ text: `ID: ${targetUser.id} | /me achievement untuk badge | /pet info untuk pet`, iconURL: interaction.guild.iconURL() })
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

        if (command === 'me' && subCmd === 'quest') { const questChannelSetting = getSetting(guildId, 'quest_channel', null); if (questChannelSetting && interaction.channelId !== questChannelSetting) return interaction.reply({ content: `❌ Buka misi hanya di <#${questChannelSetting}>.`, ephemeral: true }); updateQuestProgress(guildId, interaction.user.id, 'dummy', 0); const row = db.prepare('SELECT * FROM daily_quests WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id), quests = JSON.parse(row.data); const embed = new EmbedBuilder().setTitle('📜 Papan Misi Harian').setColor('#2B2D31').setDescription('Selesaikan misi berikut!\n*(Reset 00:00 WIB)*'); const buttons = new ActionRowBuilder(); quests.forEach((q, i) => { const percent = Math.min(100, Math.floor((q.progress / q.target) * 100)), bar = '▰'.repeat(Math.floor(percent / 10)) + '▱'.repeat(10 - Math.floor(percent / 10)), status = q.claimed ? '✅ **SELESAI**' : `**${q.progress} / ${q.target}**`; embed.addFields({ name: `Misi ${i+1}`, value: `${q.desc}\n> 🪙 **${q.reward} Money**\n> \`${bar}\` ${status}`, inline: false }); const btn = new ButtonBuilder().setCustomId(`claim_quest_${i}`).setLabel(`Klaim ${i+1}`).setStyle(ButtonStyle.Success); if (q.progress < q.target || q.claimed) btn.setDisabled(true); buttons.addComponents(btn); }); return interaction.reply({ embeds: [embed], components: [buttons] }); }

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
            addPetExp(guildId, interaction.user.id, 5);
            addComboFeature(guildId, interaction.user.id, 'fishing');
            // Auto-enter fishing contest
            const contestState = getContestState(guildId);
            let contestMsg = '';
            if (contestState && contestState.active && Date.now() < contestState.endsAt) { addContestEntry(guildId, interaction.user.id, result.fish.id, result.weight); contestMsg = '\n> 🏆 *Otomatis masuk kontes!*'; }
            const comboCount = getComboTracker(guildId, interaction.user.id);
            const comboFeatures = JSON.parse(comboCount.features || '[]');
            const comboMult = getComboMultiplier(guildId, interaction.user.id);
            let comboMsg = comboMult > 1 ? `\n> 🔥 **Combo x${comboMult}!** (${comboFeatures.length} fitur aktif)` : '';
            const tierColors = { 'Trash': '#808080', 'Common': '#FFFFFF', 'Uncommon': '#2ECC71', 'Rare': '#3498DB', 'Epic': '#9B59B6', 'Legendary': '#F1C40F', 'Mythic': '#FF6B6B', 'Secret': '#8B00FF' };
            const embed = new EmbedBuilder()
                .setColor(tierColors[result.tier.tier] || '#2B2D31')
                .setTitle(`🎣 ${result.tier.tier === 'Trash' ? 'Kamu menangkap sampah...' : 'IKAN TERTANGKAP!'}`)
                .setDescription(`${result.tier.emoji} **${result.fish.name}**\n\n> 📊 **Tier:** ${result.tier.tier}\n> ⚖️ **Berat:** ${result.weight.toLocaleString('id-ID')} kg\n> 💰 **Nilai Jual:** 🪙 ${result.value.toLocaleString('id-ID')}\n\n> 🎋 Joran: **${rod.name}**\n> 🪱 Umpan: **${(BAIT_TYPES.find(b => b.id === eq.bait) || BAIT_TYPES[0]).name}** ${eq.bait !== 'none' ? `(${eq.bait_count > 0 ? eq.bait_count - 1 : 0} sisa)` : ''}`)
                .setFooter({ text: `Cooldown: ${rod.cooldown}s | /fishing sell untuk jual | /fishing inventory${comboMult > 1 ? ' | COMBO AKTIF!' : ''}` });
            if (result.tier.tier === 'Secret') embed.setTitle('🔮💫 SECRET CATCH!!! 💫🔮');
            else if (result.tier.tier === 'Mythic') embed.setTitle('🌈✨ MYTHIC CATCH!! ✨🌈');
            else if (result.tier.tier === 'Legendary') embed.setTitle('🐉⚡ LEGENDARY CATCH! ⚡🐉');
            await interaction.reply({ embeds: [embed] });
            await checkAchievements(interaction.guild, interaction.user.id, { type: 'fishing', tier: result.tier.tier, weight: result.weight });
            // --- FISHING TOURNAMENT PARTICIPATION ---
            if (activeFishEvents.has(guildId)) {
                const ev = activeFishEvents.get(guildId);
                if (!ev.participants[interaction.user.id]) ev.participants[interaction.user.id] = { count: 0, heaviest: 0 };
                ev.participants[interaction.user.id].count++;
                if (result.weight > ev.participants[interaction.user.id].heaviest) ev.participants[interaction.user.id].heaviest = result.weight;
                
                // Instant-win events
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
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎒 Item Inventory').setColor('#2B2D31').setDescription(desc).setFooter({ text: '/me use <item> untuk memakai item' })] });
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

        if (command === 'fishing') {
            if (subCmd === 'inventory') {
                const tierOrder = { 'Secret': 0, 'Mythic': 1, 'Legendary': 2, 'Epic': 3, 'Rare': 4, 'Uncommon': 5, 'Common': 6, 'Trash': 7 };
                const allInventory = db.prepare('SELECT * FROM fish_inventory WHERE guildId = ? AND userId = ?').all(guildId, interaction.user.id);
                const totalCount = allInventory.length;
                const lockedCount = allInventory.filter(i => i.locked === 1).length;
                if (totalCount === 0) return interaction.reply({ content: '🎒 Inventory kosong! Gunakan `/fish` untuk memancing.', ephemeral: true });
                
                const sorted = allInventory.sort((a, b) => {
                    const fishA = FISH_DATA.find(f => f.id === a.fishId);
                    const fishB = FISH_DATA.find(f => f.id === b.fishId);
                    const tierA = fishA ? (tierOrder[fishA.tier] ?? 99) : 99;
                    const tierB = fishB ? (tierOrder[fishB.tier] ?? 99) : 99;
                    if (tierA !== tierB) return tierA - tierB;
                    return b.weight - a.weight;
                });
                
                const page = interaction.options.getInteger('page') || 1;
                const perPage = 20;
                const totalPages = Math.ceil(totalCount / perPage);
                const currentPage = Math.min(Math.max(1, page), totalPages);
                const start = (currentPage - 1) * perPage;
                const pageItems = sorted.slice(start, start + perPage);
                
                let desc = `🎒 **Total: ${totalCount} ikan** (🔒 Locked: ${lockedCount})\n\n`;
                pageItems.forEach((item) => {
                    const fd = FISH_DATA.find(f => f.id === item.fishId);
                    const tier = fd ? FISH_TIERS.find(t => t.tier === fd.tier) : null;
                    const lockIcon = item.locked ? '🔒 ' : '';
                    const tierTag = fd ? `**(${fd.tier})**` : '';
                    desc += `**ID #${item.id}** ${lockIcon}${tier ? tier.emoji : '🐟'} **${fd ? fd.name : '?'}** — ${item.weight} kg ${tierTag}\n`;
                });
                desc += `\n━━━━━━━━━━━━━━━━━━━━━━\n> 📄 Halaman **${currentPage}** / **${totalPages}**`;
                
                const navRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`finv_prev_${currentPage}`).setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(currentPage <= 1),
                    new ButtonBuilder().setCustomId(`finv_next_${currentPage}`).setLabel('▶ Next').setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= totalPages)
                );
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎣 Fishing Inventory').setColor('#2B2D31').setDescription(desc)], components: [navRow] });
            }
            if (subCmd === 'equip') {
                const eq = getEquipment(guildId, interaction.user.id);
                const rod = ROD_TYPES.find(r => r.id === eq.rod) || ROD_TYPES[0];
                const bait = BAIT_TYPES.find(b => b.id === eq.bait) || BAIT_TYPES[0];
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚙️ Perlengkapan Mancing').setColor('#2B2D31').setDescription(`> 🎋 **Joran:** ${rod.emoji} ${rod.name}\n> ⏱️ Cooldown: ${rod.cooldown}s | Rare+: +${rod.rareBonus}%\n\n> 🪱 **Umpan:** ${bait.emoji} ${bait.name}\n> Sisa: **${eq.bait !== 'none' ? eq.bait_count : 0}** | Rare+: +${bait.rareBonus}%`)] });
            }
            if (subCmd === 'stats') {
                const totalCaught = getUserStat(guildId, interaction.user.id, 'total_fish_caught');
                const totalSoldValue = getUserStat(guildId, interaction.user.id, 'total_fish_sold_value');
                const totalSoldCount = getUserStat(guildId, interaction.user.id, 'total_fish_sold_count');
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📊 Statistik Memancing').setColor('#2B2D31').setDescription(`> 🎣 **Total Tangkapan:** ${totalCaught}\n> 💰 **Total Penjualan:** 🪙 ${totalSoldValue.toLocaleString('id-ID')}\n> 📦 **Ikan Dijual:** ${totalSoldCount}\n> 🐟 **Di Inventory:** ${db.prepare('SELECT COUNT(*) as c FROM fish_inventory WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id).c}`)] });
            }
            if (subCmd === 'shop') {
                let desc = '**🎋 JORAN (Beli Sekali, Pakai Selamanya)**\n\n';
                const eq = getEquipment(guildId, interaction.user.id);
                ROD_TYPES.forEach(r => { const owned = eq.rod === r.id || r.id === 'basic'; desc += `${r.emoji} **${r.name}** ${owned ? '✅ *(Dimiliki)*' : `— 🪙 ${r.price.toLocaleString('id-ID')}`}\n> CD: ${r.cooldown}s | Rare+: +${r.rareBonus}%\n\n`; });
                desc += '━━━━━━━━━━━━━━━━━━━━━━\n\n**🪱 UMPAN (Habis Pakai, per 10 buah)**\n\n';
                BAIT_TYPES.filter(b => b.id !== 'none').forEach(b => { desc += `${b.emoji} **${b.name}** — 🪙 ${(b.price * 10).toLocaleString('id-ID')} /10pcs\n> Rare+: +${b.rareBonus}%\n\n`; });
                const componentsShop = [];
                const availableRods = ROD_TYPES.filter(r => r.id !== 'basic' && r.id !== eq.rod);
                if (availableRods.length > 0) {
                    const rodMenu = new StringSelectMenuBuilder().setCustomId('fishing_buy_rod').setPlaceholder('🎋 Beli Joran...').addOptions(
                        ...availableRods.map(r => new StringSelectMenuOptionBuilder().setLabel(`${r.name} (🪙 ${r.price.toLocaleString('id-ID')})`).setValue(`rod_${r.id}`).setEmoji(r.emoji).setDescription(`CD: ${r.cooldown}s | Rare+${r.rareBonus}%`))
                    );
                    componentsShop.push(new ActionRowBuilder().addComponents(rodMenu));
                }
                const baitMenu = new StringSelectMenuBuilder().setCustomId('fishing_buy_bait').setPlaceholder('🪱 Beli Umpan (x10)...').addOptions(
                    ...BAIT_TYPES.filter(b => b.id !== 'none').map(b => new StringSelectMenuOptionBuilder().setLabel(`${b.name} x10 (🪙 ${(b.price * 10).toLocaleString('id-ID')})`).setValue(`bait_${b.id}`).setEmoji(b.emoji).setDescription(`Rare+${b.rareBonus}%`))
                );
                componentsShop.push(new ActionRowBuilder().addComponents(baitMenu));
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎣 Fishing Shop').setColor('#2B2D31').setDescription(desc).setFooter({ text: `Saldo: ${userData.balance.toLocaleString('id-ID')} money` })], components: componentsShop });
            }
            if (subCmd === 'sell') {
                const sellCdKey = `sell_${guildId}_${interaction.user.id}`;
                if (fishCooldowns.has(sellCdKey) && Date.now() < fishCooldowns.get(sellCdKey)) { return interaction.reply({ content: `⏳ Tunggu sebentar sebelum menjual lagi.`, ephemeral: true }); }
                fishCooldowns.set(sellCdKey, Date.now() + 10000);
                const inventory = db.prepare('SELECT * FROM fish_inventory WHERE guildId = ? AND userId = ? AND locked = 0').all(guildId, interaction.user.id);
                if (inventory.length === 0) return interaction.reply({ content: '❌ Tidak ada ikan yang bisa dijual! (Ikan yang di-lock tidak terjual)', ephemeral: true });
                let totalValue = 0, countByTier = {};
                for (const item of inventory) {
                    const fishDef = FISH_DATA.find(f => f.id === item.fishId);
                    const tierDef = fishDef ? FISH_TIERS.find(t => t.tier === fishDef.tier) : FISH_TIERS[0];
                    const weightRatio = tierDef ? (item.weight - tierDef.minWeight) / (tierDef.maxWeight - tierDef.minWeight) : 0;
                    const value = tierDef ? Math.floor(tierDef.minValue + Math.min(1, Math.max(0, weightRatio)) * (tierDef.maxValue - tierDef.minValue)) : 1;
                    totalValue += value;
                    const tier = fishDef ? fishDef.tier : 'Trash';
                    countByTier[tier] = (countByTier[tier] || 0) + 1;
                }
                const freshData = getOrCreateUser(guildId, interaction.user.id);
                freshData.balance += totalValue;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(freshData.balance, guildId, interaction.user.id);
                db.prepare('DELETE FROM fish_inventory WHERE guildId = ? AND userId = ? AND locked = 0').run(guildId, interaction.user.id);
                incrementUserStat(guildId, interaction.user.id, 'total_fish_sold_value', totalValue);
                incrementUserStat(guildId, interaction.user.id, 'total_fish_sold_count', inventory.length);
                const lockedCount = db.prepare('SELECT COUNT(*) as c FROM fish_inventory WHERE guildId = ? AND userId = ? AND locked = 1').get(guildId, interaction.user.id).c;
                let breakdown = Object.entries(countByTier).map(([t, c]) => `> ${(FISH_TIERS.find(ft => ft.tier === t) || {emoji:'🐟'}).emoji} ${t}: **${c}**`).join('\n');
                const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('💰 IKAN TERJUAL!')
                    .setDescription(`Kamu menjual **${inventory.length} ikan** dan mendapatkan:\n\n🪙 **${totalValue.toLocaleString('id-ID')} Money**\n\n${breakdown}\n\n> 💳 Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**${lockedCount > 0 ? `\n> 🔒 Ikan di-lock (tidak dijual): **${lockedCount}**` : ''}`);
                await interaction.reply({ embeds: [embed] });
                await checkAchievements(interaction.guild, interaction.user.id, { type: 'fish_sell' });
                return;
            }
            if (subCmd === 'collection') {
                const collected = db.prepare('SELECT * FROM fish_collection WHERE guildId = ? AND userId = ?').all(guildId, interaction.user.id);
                const collectedIds = collected.map(c => c.fishId);
                const totalFish = FISH_DATA.length;
                const totalCollected = collectedIds.length;
                const percentDex = Math.floor((totalCollected / totalFish) * 100);
                const tiers = ['Trash', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret'];
                const tierColors2 = { Trash: '⚫', Common: '⚪', Uncommon: '🟢', Rare: '🔵', Epic: '🟣', Legendary: '🟡', Mythic: '🔴', Secret: '🟤' };
                let desc = `📖 **Fish Collection / Pokedex**\n> 🐟 **${totalCollected}** / **${totalFish}** spesies ditemukan (**${percentDex}%**)\n\n`;
                for (const tier of tiers) {
                    const tierFish = FISH_DATA.filter(f => f.tier === tier);
                    const tierEmoji = (FISH_TIERS.find(t => t.tier === tier) || {emoji:'🐟'}).emoji;
                    const tierCollected = tierFish.filter(f => collectedIds.includes(f.id)).length;
                    const progress = tierFish.length > 0 ? Math.floor((tierCollected / tierFish.length) * 10) : 0;
                    const bar = '▰'.repeat(progress) + '▱'.repeat(10 - progress);
                    desc += `${tierEmoji} **${tier}** — ${tierCollected}/${tierFish.length}\n> \`${bar}\`\n`;
                }
                desc += `\n> 🎯 *Pilih rarity di bawah untuk melihat detail!*`;
                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`fcol_Trash_${interaction.user.id}_0`).setLabel(`🗑️ Trash`).setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`fcol_Common_${interaction.user.id}_0`).setLabel(`🐟 Common`).setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`fcol_Uncommon_${interaction.user.id}_0`).setLabel(`🐠 Uncommon`).setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`fcol_Rare_${interaction.user.id}_0`).setLabel(`🐡 Rare`).setStyle(ButtonStyle.Primary)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`fcol_Epic_${interaction.user.id}_0`).setLabel(`🦈 Epic`).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`fcol_Legendary_${interaction.user.id}_0`).setLabel(`🐉 Legendary`).setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`fcol_Mythic_${interaction.user.id}_0`).setLabel(`🌈 Mythic`).setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`fcol_Secret_${interaction.user.id}_0`).setLabel(`🔮 Secret`).setStyle(ButtonStyle.Danger)
                );
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📖 Fish Collection').setColor('#3498DB').setDescription(desc).setFooter({ text: `${totalCollected}/${totalFish} ditemukan | /fish untuk memancing` })], components: [row1, row2] });
            }
            if (subCmd === 'lock') {
                const fishDbId = interaction.options.getInteger('id');
                const item = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(fishDbId, guildId, interaction.user.id);
                if (!item) return interaction.reply({ content: '❌ Ikan tidak ditemukan! Cek ID di `/fishing inventory`.', ephemeral: true });
                if (item.locked === 1) return interaction.reply({ content: '❌ Ikan ini sudah di-lock!', ephemeral: true });
                db.prepare('UPDATE fish_inventory SET locked = 1 WHERE id = ?').run(fishDbId);
                const fishDef = FISH_DATA.find(f => f.id === item.fishId);
                return interaction.reply({ content: `🔒 **${fishDef ? fishDef.name : 'Ikan'}** (${item.weight} kg) berhasil di-lock! Ikan ini tidak akan terjual saat /fishing sell.` });
            }
            if (subCmd === 'unlock') {
                const fishDbId = interaction.options.getInteger('id');
                const item = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(fishDbId, guildId, interaction.user.id);
                if (!item) return interaction.reply({ content: '❌ Ikan tidak ditemukan!', ephemeral: true });
                if (item.locked === 0) return interaction.reply({ content: '❌ Ikan ini tidak di-lock!', ephemeral: true });
                db.prepare('UPDATE fish_inventory SET locked = 0 WHERE id = ?').run(fishDbId);
                const fishDef = FISH_DATA.find(f => f.id === item.fishId);
                return interaction.reply({ content: `🔓 **${fishDef ? fishDef.name : 'Ikan'}** berhasil di-unlock.` });
            }
        }

        // ================= FARMING COMMANDS =================
        if (command === 'farm') {
            const farmData = getFarmData(guildId, interaction.user.id);
            const maxSlots = getFarmSlots(guildId, interaction.user.id);
            const plots = getPlots(guildId, interaction.user.id);

            if (subCmd === 'status') {
                const levelInfo = FARM_LEVELS.find(l => l.level === farmData.farm_level);
                let desc = `${levelInfo.name} — Lahan **${plots.length}/${maxSlots}** terpakai\n\n`;
                if (plots.length === 0) { desc += '*Kebun kosong! Gunakan `/farm plant` untuk menanam.*'; }
                else {
                    plots.forEach((plot, i) => {
                        const crop = FARM_CROPS.find(c => c.id === plot.cropId);
                        if (!crop) return;
                        const fert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer) || FARM_FERTILIZERS[0];
                        const growTime = crop.time * (1 - fert.speedBonus) * 60000;
                        const elapsed = Date.now() - plot.plantedAt;
                        const needWater = (Date.now() - plot.wateredAt) > growTime * 0.6;
                        let status = '';
                        const dryTime = Date.now() - plot.wateredAt;
                        const wiltThreshold = growTime * 1.5;
                        const deadThreshold = growTime * 2.5;
                        if (plot.status === 'dead' || dryTime > deadThreshold) { status = '☠️ Mati'; if (plot.status !== 'dead') db.prepare('UPDATE farm_plots SET status = ? WHERE id = ?').run('dead', plot.id); }
                        else if (elapsed >= growTime) status = '✅ Siap Panen!';
                        else if (dryTime > wiltThreshold) status = '🥀 Layu! (Siram segera!)';
                        else if (needWater) status = '💧 Butuh Siram!';
                        else { const pct = Math.min(100, Math.floor((elapsed / growTime) * 100)); status = `🌱 ${pct}%`; }
                        desc += `**[${i+1}]** ${crop.emoji} ${crop.name} — ${status}${fert.id !== 'none' ? ` | ${fert.emoji}` : ''}\n`;
                    });
                }
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🌾 Kebun Kamu').setColor('#2ECC71').setDescription(desc).setFooter({ text: `/farm plant — tanam | /farm water — siram | /farm harvest — panen` })] });
            }

            if (subCmd === 'plant') {
                if (plots.length >= maxSlots) return interaction.reply({ content: `❌ Lahan penuh! (${plots.length}/${maxSlots}) Upgrade lahan atau panen dulu.`, ephemeral: true });
                const cropId = interaction.options.getString('bibit');
                if (cropId === 'none') return interaction.reply({ content: '❌ Tidak punya bibit! Beli dulu di `/farm shop`.', ephemeral: true });
                const crop = FARM_CROPS.find(c => c.id === cropId);
                if (!crop) return interaction.reply({ content: '❌ Bibit tidak ditemukan!', ephemeral: true });
                const owned = getSeedCount(guildId, interaction.user.id, cropId);
                if (owned <= 0) return interaction.reply({ content: `❌ Kamu tidak punya bibit **${crop.emoji} ${crop.name}**! Beli di \`/farm shop\`.`, ephemeral: true });
                // Konsumsi 1 bibit dari inventory
                removeSeed(guildId, interaction.user.id, cropId, 1);
                db.prepare('INSERT INTO farm_plots (guildId, userId, cropId, plantedAt, wateredAt) VALUES (?, ?, ?, ?, ?)').run(guildId, interaction.user.id, cropId, Date.now(), Date.now());
                const sisa = getSeedCount(guildId, interaction.user.id, cropId);
                return interaction.reply({ content: `🌱 **${crop.emoji} ${crop.name}** ditanam! Siap panen dalam **${crop.time} menit**.\n> 📦 Sisa bibit ${crop.name}: **${sisa}**\n> 💡 Siram dengan \`/farm water\`!` });
            }

            if (subCmd === 'water') {
                if (plots.length === 0) return interaction.reply({ content: '❌ Tidak ada tanaman untuk disiram!', ephemeral: true });
                let watered = 0;
                for (const plot of plots) { if (plot.status !== 'dead') { db.prepare('UPDATE farm_plots SET wateredAt = ? WHERE id = ?').run(Date.now(), plot.id); watered++; } }
                return interaction.reply({ content: `💧 Berhasil menyiram **${watered} tanaman**! Tanaman kamu tumbuh dengan baik.` });
            }

            if (subCmd === 'harvest') {
                if (plots.length === 0) return interaction.reply({ content: '❌ Tidak ada tanaman!', ephemeral: true });
                let harvested = 0, totalItems = 0, harvestDesc = '';
                for (const plot of plots) {
                    const crop = FARM_CROPS.find(c => c.id === plot.cropId);
                    if (!crop) continue;
                    const fert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer) || FARM_FERTILIZERS[0];
                    const growTime = crop.time * (1 - fert.speedBonus) * 60000;
                    if (Date.now() - plot.plantedAt >= growTime && plot.status !== 'dead') {
                        let qty = getRandomInt(crop.minYield, crop.maxYield);
                        if (Math.random() < fert.yieldBonus) qty += getRandomInt(1, 2);
                        addStorage(guildId, interaction.user.id, crop.id, qty);
                        harvestDesc += `> ${crop.emoji} ${crop.name} x${qty}\n`;
                        harvested++; totalItems += qty;
                        db.prepare('DELETE FROM farm_plots WHERE id = ?').run(plot.id);
                    }
                }
                // Auto-remove dead plants during harvest
                const deadPlots = plots.filter(p => p.status === 'dead');
                let deadMsg = '';
                if (deadPlots.length > 0) {
                    db.prepare("DELETE FROM farm_plots WHERE guildId = ? AND userId = ? AND status = 'dead'").run(guildId, interaction.user.id);
                    deadMsg = `\n\n🗑️ **${deadPlots.length} tanaman mati** otomatis dihapus.`;
                }
                if (harvested === 0 && deadPlots.length > 0) return interaction.reply({ content: `🗑️ **${deadPlots.length} tanaman mati** dihapus dari kebun! Slot sekarang tersedia untuk tanam baru.\n\n> Tidak ada tanaman yang siap dipanen.`, ephemeral: false });
                if (harvested === 0) return interaction.reply({ content: '❌ Belum ada tanaman yang siap dipanen! Cek `/farm status`.', ephemeral: true });
                incrementUserStat(guildId, interaction.user.id, 'total_harvests', harvested);
                addPetExp(guildId, interaction.user.id, 5);
                addComboFeature(guildId, interaction.user.id, 'farming');
                await checkAchievements(interaction.guild, interaction.user.id, { type: 'farm_harvest', legendary: harvestDesc.includes('Legendary') });
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ECC71').setTitle('🌾 Panen Berhasil!').setDescription(`Memanen **${harvested} tanaman** (${totalItems} item):\n\n${harvestDesc}\n> Hasil masuk ke \`/farm storage\`.\n> Gunakan \`/farm craft\` atau \`/farm sell\` untuk menjual.${deadMsg}`)] });
            }

            if (subCmd === 'storage') {
                const storage = getStorage(guildId, interaction.user.id);
                if (storage.length === 0) return interaction.reply({ content: '📦 Gudang kosong! Panen dulu dengan `/farm harvest`.', ephemeral: true });
                let desc = '';
                storage.forEach(s => { const crop = FARM_CROPS.find(c => c.id === s.itemId); desc += `> ${crop ? crop.emoji : '📦'} **${crop ? crop.name : s.itemId}** x${s.quantity}\n`; });
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Farm Storage').setColor('#2B2D31').setDescription(desc).setFooter({ text: '/farm sell — jual semua | /farm craft — buat resep' })] });
            }

            if (subCmd === 'sell') {
                const storage = getStorage(guildId, interaction.user.id);
                if (storage.length === 0) return interaction.reply({ content: '❌ Gudang kosong!', ephemeral: true });
                let totalMoney = 0, sellDesc = '';
                for (const s of storage) { const crop = FARM_CROPS.find(c => c.id === s.itemId); const price = crop ? crop.sellPrice * s.quantity : 0; totalMoney += price; sellDesc += `> ${crop ? crop.emoji : '📦'} ${crop ? crop.name : '?'} x${s.quantity} = 🪙 ${price}\n`; }
                userData.balance += totalMoney;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                db.prepare('DELETE FROM farm_storage WHERE guildId = ? AND userId = ?').run(guildId, interaction.user.id);
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#F1C40F').setTitle('💰 Hasil Panen Terjual!').setDescription(`${sellDesc}\n**Total: 🪙 ${totalMoney.toLocaleString('id-ID')}**\n> Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**`)] });
            }

            if (subCmd === 'upgrade') {
                const nextLevel = FARM_LEVELS.find(l => l.level === farmData.farm_level + 1);
                if (!nextLevel) return interaction.reply({ content: '👑 Lahan kamu sudah level maksimal!', ephemeral: true });
                if (userData.balance < nextLevel.cost) return interaction.reply({ content: `❌ Butuh 🪙 **${nextLevel.cost.toLocaleString('id-ID')}** untuk upgrade ke ${nextLevel.name} (${nextLevel.slots} slot)`, ephemeral: true });
                userData.balance -= nextLevel.cost;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                db.prepare('UPDATE farm_data SET farm_level = ? WHERE guildId = ? AND userId = ?').run(nextLevel.level, guildId, interaction.user.id);
                if (nextLevel.level === 6) await checkAchievements(interaction.guild, interaction.user.id, { type: 'farm_upgrade_max' });
                return interaction.reply({ content: `🎉 **Lahan di-upgrade!**\n> ${nextLevel.name} — Sekarang punya **${nextLevel.slots} slot** tanam!` });
            }

            if (subCmd === 'craft') {
                const recipeId = interaction.options.getString('resep');
                const recipe = FARM_RECIPES.find(r => r.id === recipeId);
                if (!recipe) return interaction.reply({ content: '❌ Resep tidak ditemukan!', ephemeral: true });
                // Check SEMUA bahan sekaligus
                const missing = [];
                for (const ing of recipe.ingredients) {
                    const have = getStorageQty(guildId, interaction.user.id, ing.id);
                    if (have < ing.qty) { const crop = FARM_CROPS.find(c => c.id === ing.id); missing.push(`> ${crop ? crop.emoji : '📦'} **${crop ? crop.name : ing.id}** — butuh ${ing.qty}, punya ${have}`); }
                }
                if (missing.length > 0) {
                    const fullList = recipe.ingredients.map(ing => { const c = FARM_CROPS.find(cr => cr.id === ing.id); return `${c ? c.emoji : '📦'} ${c ? c.name : ing.id} x${ing.qty}`; }).join(', ');
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor('#E74C3C').setTitle(`❌ Bahan Kurang untuk ${recipe.emoji} ${recipe.name}`).setDescription(`**Bahan yang kurang:**\n${missing.join('\n')}\n\n> 📋 **Resep lengkap:** ${fullList}\n> 💡 Tanam & panen bahan dulu di \`/farm plant\`!`)], ephemeral: true });
                }
                // Consume bahan
                for (const ing of recipe.ingredients) { removeStorage(guildId, interaction.user.id, ing.id, ing.qty); }
                // Tambah uang langsung (craft = jual produk) - atomic
                db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(recipe.sellPrice, guildId, interaction.user.id);
                const freshData = getOrCreateUser(guildId, interaction.user.id);
                incrementUserStat(guildId, interaction.user.id, 'total_crafts');
                addComboFeature(guildId, interaction.user.id, 'farming');
                await checkAchievements(interaction.guild, interaction.user.id, { type: 'farm_craft' });
                const ingredients = recipe.ingredients.map(ing => { const c = FARM_CROPS.find(cr => cr.id === ing.id); return `${c ? c.emoji : '📦'} ${c ? c.name : ing.id} x${ing.qty}`; }).join(' + ');
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#9B59B6').setTitle(`${recipe.emoji} ${recipe.name} di-Craft!`).setDescription(`> Bahan: ${ingredients}\n> \n> 💰 **Dijual seharga 🪙 ${recipe.sellPrice.toLocaleString('id-ID')}**\n> Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**`)] });
            }

            if (subCmd === 'pupuk') {
                const fertId = interaction.options.getString('jenis');
                const slotNum = interaction.options.getInteger('slot');
                const fert = FARM_FERTILIZERS.find(f => f.id === fertId);
                if (!fert || fert.id === 'none') return interaction.reply({ content: '❌ Pupuk tidak valid!', ephemeral: true });
                if (userData.balance < fert.cost) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${fert.cost.toLocaleString('id-ID')}**`, ephemeral: true });
                
                const plots = getPlots(guildId, interaction.user.id);
                if (plots.length === 0) return interaction.reply({ content: '❌ Tidak ada tanaman! Tanam dulu dengan `/farm plant`.', ephemeral: true });
                if (slotNum < 1 || slotNum > plots.length) return interaction.reply({ content: `❌ Slot tidak valid! Kamu punya ${plots.length} tanaman (slot 1-${plots.length}). Cek di \`/farm status\`.`, ephemeral: true });
                
                const plot = plots[slotNum - 1];
                if (plot.status === 'dead') return interaction.reply({ content: '❌ Tanaman ini sudah mati! Tidak bisa dipupuk.', ephemeral: true });
                if (plot.fertilizer !== 'none') {
                    const existingFert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer);
                    return interaction.reply({ content: `❌ Tanaman ini sudah diberi pupuk **${existingFert ? existingFert.emoji + ' ' + existingFert.name : ''}**! Satu tanaman hanya bisa dipupuk sekali.`, ephemeral: true });
                }
                
                userData.balance -= fert.cost;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                db.prepare('UPDATE farm_plots SET fertilizer = ? WHERE id = ?').run(fertId, plot.id);
                
                const crop = FARM_CROPS.find(c => c.id === plot.cropId);
                const newTime = Math.round(crop.time * (1 - fert.speedBonus));
                return interaction.reply({ content: `✅ ${fert.emoji} **${fert.name}** diberikan ke **[Slot ${slotNum}] ${crop ? crop.emoji + ' ' + crop.name : 'tanaman'}**!\n\n> ⏩ Waktu tumbuh: ~~${crop.time}m~~ → **${newTime}m**${fert.yieldBonus > 0 ? `\n> 📈 Bonus hasil: **+${Math.round(fert.yieldBonus*100)}%**` : ''}\n> 💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**` });
            }

            if (subCmd === 'shop') {
                const tiers = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
                let desc = '**🌱 BIBIT TANAMAN** *(masuk ke inventory, tanam dengan `/farm plant`)*\n\n';
                for (const tier of tiers) {
                    const crops = FARM_CROPS.filter(c => c.tier === tier);
                    desc += `**${tier}** (${tier === 'Common' ? '2-4m' : tier === 'Uncommon' ? '8-18m' : tier === 'Rare' ? '20-35m' : tier === 'Epic' ? '50-90m' : '2.5-3.5h'})\n`;
                    crops.forEach(c => { desc += `> ${c.emoji} ${c.name} — 🪙 ${c.cost} | ${c.time}m\n`; });
                    desc += '\n';
                }
                desc += '━━━━━━━━━━━━━━━━━━━━━━\n**🧪 PUPUK**\n\n';
                FARM_FERTILIZERS.filter(f => f.id !== 'none').forEach(f => { desc += `> ${f.emoji} ${f.name} — 🪙 ${f.cost} | ⏩ -${Math.round(f.speedBonus*100)}% waktu${f.yieldBonus > 0 ? ` | 📈 +${Math.round(f.yieldBonus*100)}% hasil` : ''}\n`; });
                if (desc.length > 4000) desc = desc.substring(0, 3990) + '...';
                const components = [];
                // Seed buy menu (bibit masuk inventory)
                const seedMenu = new StringSelectMenuBuilder().setCustomId('farm_buy_seed').setPlaceholder('🌱 Beli Bibit (→ inventory)...').setMinValues(1).setMaxValues(1);
                FARM_CROPS.slice(0, 25).forEach(c => seedMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${c.emoji} ${c.name} (🪙${c.cost})`).setValue(c.id).setDescription(`${c.tier} | ${c.time}m | Jual: 🪙${c.sellPrice}`)));
                components.push(new ActionRowBuilder().addComponents(seedMenu));
                // Fertilizer buy menu
                const fertMenu = new StringSelectMenuBuilder().setCustomId('farm_buy_fertilizer').setPlaceholder('🧪 Beli Pupuk...').addOptions(
                    ...FARM_FERTILIZERS.filter(f => f.id !== 'none').map(f => new StringSelectMenuOptionBuilder().setLabel(`${f.name} (🪙 ${f.cost})`).setValue(f.id).setDescription(`-${Math.round(f.speedBonus*100)}% waktu${f.yieldBonus > 0 ? `, +${Math.round(f.yieldBonus*100)}% hasil` : ''}`))
                );
                components.push(new ActionRowBuilder().addComponents(fertMenu));
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🌾 Farm Shop').setColor('#2B2D31').setDescription(desc).setFooter({ text: `💰 Saldo: ${userData.balance.toLocaleString('id-ID')} | Beli bibit → /farm plant untuk tanam` })], components });
            }
        }

        // ================= PET COMMANDS =================
        if (command === 'pet') {
            if (subCmd === 'info') {
                const pet = getPetData(guildId, interaction.user.id);
                if (!pet) return interaction.reply({ content: '❌ Kamu belum punya pet! Gunakan `/pet adopt` atau beli telur di `/pet shop`.', ephemeral: true });
                const petDef = PET_DATA.find(p => p.id === pet.petId);
                const expNeeded = pet.level <= 5 ? 50 : pet.level <= 10 ? 100 : pet.level <= 15 ? 200 : pet.level <= 20 ? 400 : pet.level <= 25 ? 600 : 1000;
                const happyBar = '▰'.repeat(Math.floor(pet.happiness / 10)) + '▱'.repeat(10 - Math.floor(pet.happiness / 10));
                const hungerBar = '▰'.repeat(Math.floor(pet.hunger / 10)) + '▱'.repeat(10 - Math.floor(pet.hunger / 10));
                const expBar = '▰'.repeat(Math.min(10, Math.floor((pet.exp / expNeeded) * 10))) + '▱'.repeat(10 - Math.min(10, Math.floor((pet.exp / expNeeded) * 10)));
                const statusEmoji = pet.status === 'sick' ? '🤒 Sakit!' : pet.happiness >= 70 ? '😊 Bahagia!' : pet.happiness >= 30 ? '😐 Biasa' : '😢 Sedih';
                const bonusActive = pet.happiness >= 30 && pet.hunger >= 10 && pet.status !== 'sick';
                const lvlMult = PET_LEVEL_MULTIPLIERS[Math.min(pet.level, 30)] || 1.0;
                const bonusValue = bonusActive ? Math.floor(petDef.bonus.value * lvlMult) : 0;
                const embed = new EmbedBuilder()
                    .setTitle(`${petDef.emoji} ${pet.name} (Level ${pet.level})`)
                    .setColor(bonusActive ? '#2ECC71' : '#E74C3C')
                    .setDescription(`**${petDef.name}** — *${petDef.tier}*\n\n> ❤️ Happiness: \`${happyBar}\` **${pet.happiness}%**\n> 🍖 Hunger: \`${hungerBar}\` **${pet.hunger}%**\n> ✨ EXP: \`${expBar}\` **${pet.exp}/${expNeeded}**\n> 💪 Status: ${statusEmoji}\n\n🎁 **Passive Bonus** ${bonusActive ? '(AKTIF ✅)' : '(MATI ❌)'}:\n> +**${bonusValue}%** ${petDef.bonus.type.replace(/_/g, ' ')}${!bonusActive ? '\n> ⚠️ *Happiness/Hunger terlalu rendah atau pet sakit!*' : ''}\n\n⚔️ **Battle Stats:**\n> Class: **${pet.class || 'warrior'}** | Element: **${pet.element || 'fire'}**\n> HP: \`${pet.hp || 100}\` | ATK: \`${pet.atk || 20}\` | DEF: \`${pet.def || 10}\`\n> SPD: \`${pet.spd || 10}\` | CRIT: \`${pet.crit || 5}%\``)
                    .setFooter({ text: '/pet feed — makan | /pet play — main | /pet hunt — berburu' });
                const isHunting = pet.hunting_until && pet.hunting_until > Date.now();
                let skillDesc = '';
                for (const ms of PET_SKILL_MILESTONES) {
                    if (pet.level >= ms.level) skillDesc += `> ✅ Lv.${ms.level}: **${ms.skill.name}**\n`;
                    else skillDesc += `> 🔒 Lv.${ms.level}: ${ms.skill.name}\n`;
                }
                if (isHunting) embed.addFields({ name: '🏹 HUNTING', value: `> Kembali dalam **${Math.ceil((pet.hunting_until - Date.now()) / 60000)} menit**\n> ⚠️ Buff MATI selama hunt`, inline: false });
                embed.addFields({ name: '🌟 Skill Buffs (Stack per Level)', value: skillDesc, inline: false });
                return interaction.reply({ embeds: [embed] });
            }

            if (subCmd === 'adopt') {
                const petId = interaction.options.getString('pet');
                const petDef = PET_DATA.find(p => p.id === petId);
                if (!petDef) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
                if (petDef.price <= 0) return interaction.reply({ content: '❌ Pet ini tidak bisa dibeli! Hanya dari Pet Egg di `/pet shop`.', ephemeral: true });
                if (userData.balance < petDef.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${petDef.price.toLocaleString('id-ID')}**`, ephemeral: true });
                const allPets = getAllPets(guildId, interaction.user.id);
                if (allPets.length >= 10) return interaction.reply({ content: '❌ Kamu sudah punya 10 pet (max)! Lepaskan salah satu dengan `/pet release`.', ephemeral: true });
                userData.balance -= petDef.price;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                const isFirst = allPets.length === 0 ? 1 : 0;
                const stats = generatePetStats(petDef.tier);
                const pClass = PET_CLASSES[Math.floor(Math.random() * PET_CLASSES.length)];
                const pElement = PET_ELEMENTS[Math.floor(Math.random() * PET_ELEMENTS.length)];
                db.prepare('INSERT INTO pets (guildId, userId, petId, name, active, adoptedAt, class, element, hp, atk, def, spd, crit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(guildId, interaction.user.id, petId, petDef.name, isFirst, Date.now(), pClass, pElement, stats.hp, stats.atk, stats.def, stats.spd, stats.crit);
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ECC71').setTitle('🐾 Pet Adopted!').setDescription(`Kamu mengadopsi ${petDef.emoji} **${petDef.name}**!\n\n> Tier: **${petDef.tier}**\n> Bonus: +${petDef.bonus.value}% ${petDef.bonus.type.replace(/_/g, ' ')}\n\n${isFirst ? '✅ Pet ini langsung menjadi pet aktifmu!' : 'Gunakan `/pet swap` untuk mengaktifkan.'}`)] });
            }

            if (subCmd === 'feed') {
                const pet = getPetData(guildId, interaction.user.id);
                if (!pet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
                const foodId = interaction.options.getString('food');
                if (foodId === 'none') return interaction.reply({ content: '❌ Inventory makanan kosong! Beli makanan dulu di `/pet shop`.', ephemeral: true });
                const food = PET_FOODS.find(f => f.id === foodId);
                if (!food) return interaction.reply({ content: '❌ Makanan tidak ditemukan!', ephemeral: true });
                const owned = getPetFoodCount(guildId, interaction.user.id, foodId);
                if (owned <= 0) return interaction.reply({ content: `❌ Kamu tidak punya **${food.emoji} ${food.name}**! Beli di \`/pet shop\`.`, ephemeral: true });
                // Konsumsi 1 makanan dari inventory (tanpa biaya money)
                removePetFood(guildId, interaction.user.id, foodId, 1);
                const newHunger = Math.min(100, pet.hunger + food.hunger);
                const newHappy = Math.min(100, pet.happiness + food.happiness);
                const newExp = pet.exp + 5;
                const newStatus = pet.status === 'sick' && newHunger > 50 ? 'happy' : pet.status;
                db.prepare('UPDATE pets SET hunger = ?, happiness = ?, exp = ?, status = ? WHERE id = ?').run(newHunger, newHappy, newExp, newStatus, pet.id);
                const sisa = getPetFoodCount(guildId, interaction.user.id, foodId);
                return interaction.reply({ content: `${food.emoji} **${pet.name}** makan ${food.name}!\n\n> 🍖 Hunger: ${pet.hunger}% → **${newHunger}%**\n> ❤️ Happy: ${pet.happiness}% → **${newHappy}%**\n> ✨ +5 EXP\n> 📦 Sisa ${food.name}: **${sisa}**` });
            }

            if (subCmd === 'play') {
                const pet = getPetData(guildId, interaction.user.id);
                if (!pet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
                const playCdKey = `pet_play_${guildId}_${interaction.user.id}`;
                if (fishCooldowns.has(playCdKey) && Date.now() < fishCooldowns.get(playCdKey)) { const remSec = Math.ceil((fishCooldowns.get(playCdKey) - Date.now()) / 1000); return interaction.reply({ content: `⏳ ${pet.name} masih capek! Tunggu **${remSec > 60 ? Math.ceil(remSec/60) + ' menit' : remSec + ' detik'}** lagi.`, ephemeral: true }); }
                fishCooldowns.set(playCdKey, Date.now() + 180000); // 3 menit
                addComboFeature(guildId, interaction.user.id, 'pet');
                const newHappy = Math.min(100, pet.happiness + 10);
                const newHunger = Math.max(0, pet.hunger - 3);
                db.prepare('UPDATE pets SET happiness = ?, hunger = ? WHERE id = ?').run(newHappy, newHunger, pet.id);
                const expResult = addPetExp(guildId, interaction.user.id, 8);
                let lvlUpMsg = '';
                if (expResult && expResult.leveledUp) lvlUpMsg = `\n\n🎉 **LEVEL UP!** ${expResult.petName} → Lv.${expResult.newLevel}!`;
                if (expResult && expResult.newSkill) lvlUpMsg += `\n> 🌟 **SKILL UNLOCKED:** ${expResult.newSkill.skill.name}!`;
                const activities = ['bermain kejar-kejaran', 'bermain bola', 'bermain petak umpet', 'berguling-guling', 'melompat-lompat'];
                const activity = activities[Math.floor(Math.random() * activities.length)];
                return interaction.reply({ content: `🎾 ${pet.name} ${activity}!\n\n> ❤️ Happy: +10 → **${newHappy}%**\n> 🍖 Hunger: -3 → **${newHunger}%**\n> ✨ +8 EXP${lvlUpMsg}` });
            }

            if (subCmd === 'shop') {
                let desc = '**🍖 MAKANAN PET** *(masuk ke inventory, pakai dengan `/pet feed`)*\n\n';
                PET_FOODS.forEach(f => { desc += `> ${f.emoji} **${f.name}** — 🪙 ${f.price} | Hunger +${f.hunger} | Happy +${f.happiness}\n`; });
                desc += '\n━━━━━━━━━━━━━━━━━━━━━━\n**🥚 PET EGGS (Gacha — langsung dibuka)**\n\n';
                PET_EGGS.forEach(e => { const rates = Object.entries(e.rates).map(([t, r]) => `${t}: ${r}%`).join(', '); desc += `> ${e.emoji} **${e.name}** — 🪙 ${e.price.toLocaleString('id-ID')}\n> Rates: ${rates}\n`; });
                if (desc.length > 4000) desc = desc.substring(0, 3990) + '...';
                const foodMenu = new StringSelectMenuBuilder().setCustomId('petshop_buy_food').setPlaceholder('🍖 Beli Makanan (→ inventory)...').setMinValues(1).setMaxValues(1);
                PET_FOODS.forEach(f => foodMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${f.name} — 🪙${f.price}`).setValue(f.id).setDescription(`Hunger +${f.hunger} | Happy +${f.happiness}`).setEmoji(f.emoji)));
                const eggMenu = new StringSelectMenuBuilder().setCustomId('petshop_buy_egg').setPlaceholder('🥚 Beli & Buka Egg (Gacha)...').setMinValues(1).setMaxValues(1);
                PET_EGGS.forEach(e => eggMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${e.name} — 🪙${e.price.toLocaleString('id-ID')}`).setValue(e.id).setDescription('Gacha Pet Egg')));
                const row1 = new ActionRowBuilder().addComponents(foodMenu);
                const row2 = new ActionRowBuilder().addComponents(eggMenu);
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🐾 Pet Shop').setColor('#FF69B4').setDescription(desc).setFooter({ text: `💰 Saldo: ${userData.balance.toLocaleString('id-ID')} | Beli makanan → /pet feed untuk pakai` })], components: [row1, row2] });
            }

            if (subCmd === 'collection') {
                const allPets = getAllPets(guildId, interaction.user.id);
                if (allPets.length === 0) return interaction.reply({ content: '🐾 Kamu belum punya pet! `/pet adopt` atau beli telur di `/pet shop` untuk mulai.', ephemeral: true });
                let desc = `🐾 **Pet Collection** (${allPets.length}/10 slot)\n\n`;
                const tierOrder = ['Mythic', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'];
                const sorted = allPets.sort((a, b) => { const ta = tierOrder.indexOf(PET_DATA.find(p => p.id === a.petId)?.tier || 'Common'); const tb = tierOrder.indexOf(PET_DATA.find(p => p.id === b.petId)?.tier || 'Common'); return ta - tb; });
                sorted.forEach(pet => { const def = PET_DATA.find(p => p.id === pet.petId); const bonusText = def ? `+${def.bonus.value}% ${def.bonus.type.replace(/_/g, ' ')}` : ''; desc += `${pet.active ? '⭐' : '▪️'} **#${pet.id}** ${def ? def.emoji : '🐾'} **${pet.name}** (Lv.${pet.level}) — **(${def ? def.tier : '?'})**\n> ${bonusText}\n`; });
                desc += `\n> ⭐ = Pet Aktif | /pet swap <id> untuk ganti`;
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🐾 Pet Collection').setColor('#FF69B4').setDescription(desc)] });
            }

            if (subCmd === 'swap') {
                const petDbId = interaction.options.getInteger('id');
                const targetPet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(petDbId, guildId, interaction.user.id);
                if (!targetPet) return interaction.reply({ content: '❌ Pet tidak ditemukan! Cek ID di `/pet collection`.', ephemeral: true });
                db.prepare('UPDATE pets SET active = 0 WHERE guildId = ? AND userId = ?').run(guildId, interaction.user.id);
                db.prepare('UPDATE pets SET active = 1 WHERE id = ?').run(petDbId);
                const def = PET_DATA.find(p => p.id === targetPet.petId);
                return interaction.reply({ content: `✅ Pet aktif diganti ke ${def ? def.emoji : '🐾'} **${targetPet.name}**!` });
            }

            if (subCmd === 'hunt') {
                const pet = getPetData(guildId, interaction.user.id);
                if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
                if (pet.happiness < 50) return interaction.reply({ content: '❌ Pet terlalu sedih untuk berburu! (Happiness harus > 50)', ephemeral: true });
                if (pet.hunting_until && pet.hunting_until > 0 && pet.hunting_until <= Date.now()) {
                    // Hunt finished! Collect rewards
                    db.prepare('UPDATE pets SET hunting_until = 0 WHERE id = ?').run(pet.id);
                    const success = Math.random() > 0.2; // 80% success
                    if (success) {
                        const reward = getRandomInt(30, 150);
                        userData.balance += reward;
                        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                        const expResult = addPetExp(guildId, interaction.user.id, 20);
                        let lvlMsg = '';
                        if (expResult && expResult.leveledUp) lvlMsg = `\n> 🎉 **LEVEL UP!** ${expResult.petName} → Lv.${expResult.newLevel}!`;
                        if (expResult && expResult.newSkill) lvlMsg += `\n> 🌟 **SKILL UNLOCKED:** ${expResult.newSkill.skill.name}!`;
                        const petDef = PET_DATA.find(p => p.id === pet.petId);
                        return interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ECC71').setTitle('🐾 Hunt Complete!').setDescription(`${petDef ? petDef.emoji : '🐾'} **${pet.name}** kembali dari berburu!\n\n> ✅ Hasil: 🪙 **${reward} Money**\n> ✨ Pet EXP: +20${lvlMsg}\n\n*Buff pet kembali aktif!*`)] });
                    } else {
                        addPetExp(guildId, interaction.user.id, 8);
                        const petDef = PET_DATA.find(p => p.id === pet.petId);
                        return interaction.reply({ embeds: [new EmbedBuilder().setColor('#E74C3C').setTitle('🐾 Hunt Gagal...').setDescription(`${petDef ? petDef.emoji : '🐾'} **${pet.name}** pulang tanpa hasil.\n\n> ❌ Tidak menemukan apa-apa\n> ✨ Pet EXP: +8\n\n*Buff pet kembali aktif!*`)] });
                    }
                }
                if (pet.hunting_until && pet.hunting_until > Date.now()) { const remaining = Math.ceil((pet.hunting_until - Date.now()) / 60000); return interaction.reply({ content: `⏳ ${pet.name} masih berburu! Kembali dalam **${remaining} menit**.`, ephemeral: true }); }
                const huntDuration = getRandomInt(10, 20) * 60000; // 10-20 menit
                const huntEnd = Date.now() + huntDuration;
                db.prepare('UPDATE pets SET hunting_until = ?, hunger = MAX(0, hunger - 20) WHERE id = ?').run(huntEnd, pet.id);
                const durationMin = Math.round(huntDuration / 60000);
                const petDef = PET_DATA.find(p => p.id === pet.petId);
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#F39C12').setTitle('🐾 Pet Hunt Started!').setDescription(`${petDef ? petDef.emoji : '🐾'} **${pet.name}** pergi berburu!\n\n> ⏱️ Durasi: **${durationMin} menit**\n> ⚠️ Semua buff pet **MATI** selama hunt\n> 🍖 Hunger: -20\n\nGunakan \`/pet hunt\` lagi nanti untuk mengambil hasil.`).setFooter({ text: 'Pet akan kembali otomatis. Buff aktif kembali setelah hunt selesai.' })] });
            }

            if (subCmd === 'rename') {
                const pet = getPetData(guildId, interaction.user.id);
                if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
                const newName = interaction.options.getString('nama');
                db.prepare('UPDATE pets SET name = ? WHERE id = ?').run(newName, pet.id);
                return interaction.reply({ content: `✅ Nama pet diubah menjadi **${newName}**!` });
            }

            if (subCmd === 'release') {
                const petDbId = interaction.options.getInteger('id');
                const targetPet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(petDbId, guildId, interaction.user.id);
                if (!targetPet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
                db.prepare('DELETE FROM pets WHERE id = ?').run(petDbId);
                const def = PET_DATA.find(p => p.id === targetPet.petId);
                return interaction.reply({ content: `👋 ${def ? def.emoji : '🐾'} **${targetPet.name}** telah dilepaskan... Selamat tinggal! 😢` });
            }
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
                await checkAchievements(interaction.guild, winner.id, { type: 'pvp_win' });
                const embed = new EmbedBuilder().setColor('#FF6B00').setTitle(`⚔️ BATTLE RESULT`).setDescription(`${result.log.join('\n')}\n\n━━━━━━ **RESULT** ━━━━━━\n🏆 Winner: ${result.winner === 1 ? myPetDef.emoji : enemyPetDef.emoji} **${result.winner === 1 ? myPet.name : enemyPet.name}** (<@${winner.id}>)\n💀 Loser: ${result.winner === 1 ? enemyPetDef.emoji : myPetDef.emoji} **${result.winner === 1 ? enemyPet.name : myPet.name}**${taruhan > 0 ? `\n\n💰 Taruhan: 🪙 **${taruhan.toLocaleString('id-ID')}** → <@${winner.id}>` : ''}`).setFooter({ text: 'Winner +15 EXP | Loser +5 EXP' });
                interaction.editReply({ embeds: [embed] }).catch(() => {});
            }, 3000);
            return;
        }

        // ================= DUNGEON (now under /pet dungeon) =================
        if (command === 'pet' && subCmd === 'dungeon') {
            const dungeonCd = `dungeon_${guildId}_${interaction.user.id}`;
            if (fishCooldowns.has(dungeonCd) && Date.now() < fishCooldowns.get(dungeonCd)) { const rem = Math.ceil((fishCooldowns.get(dungeonCd) - Date.now()) / 60000); return interaction.reply({ content: `⏳ Dungeon cooldown! Tunggu **${rem} menit**.`, ephemeral: true }); }
            const myPet = getPetData(guildId, interaction.user.id);
            if (!myPet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
            const tierId = interaction.options.getString('tier');
            const dungeon = DUNGEON_TIERS.find(d => d.id === tierId);
            if (!dungeon) return interaction.reply({ content: '❌ Dungeon tidak ditemukan!', ephemeral: true });
            if (myPet.level < dungeon.minLevel) return interaction.reply({ content: `❌ Pet kamu butuh minimal **Level ${dungeon.minLevel}** untuk dungeon ini! (Sekarang: Lv.${myPet.level})`, ephemeral: true });
            fishCooldowns.set(dungeonCd, Date.now() + (dungeon.cooldown || 300000));
            addComboFeature(guildId, interaction.user.id, 'dungeon');
            const myPetDef = PET_DATA.find(p => p.id === myPet.petId);
            const enemies = dungeon.monsterHp.map((hp, i) => ({ hp, atk: dungeon.monsterAtk[i], def: Math.floor(dungeon.monsterAtk[i] * 0.3) }));
            
            await interaction.reply({ embeds: [new EmbedBuilder().setColor('#F39C12').setTitle(`🏰 ${dungeon.name}`).setDescription(`${myPetDef.emoji} **${myPet.name}** memasuki dungeon...\n\n> ⚔️ *Pertarungan sedang berlangsung...*\n> 🐾 Pet Lv.${myPet.level} vs ${dungeon.waves} Wave Monster`).setFooter({ text: 'Menunggu hasil...' })] });
            
            setTimeout(async () => {
                const result = simulateBattle(myPet, myPetDef, enemies);
                let reward = 0, expGain = 0;
                if (result.alive) {
                    reward = getRandomInt(dungeon.reward[0], dungeon.reward[1]);
                    const comboMult = getComboMultiplier(guildId, interaction.user.id);
                    reward = Math.floor(reward * comboMult);
                    expGain = dungeon.exp;
                    const freshData = getOrCreateUser(guildId, interaction.user.id);
                    freshData.balance += reward;
                    db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(freshData.balance, guildId, interaction.user.id);
                    addPetExp(guildId, interaction.user.id, expGain);
                    incrementUserStat(guildId, interaction.user.id, 'dungeon_clears');
                    await checkAchievements(interaction.guild, interaction.user.id, { type: 'dungeon_clear' });
                } else {
                    const freshData = getOrCreateUser(guildId, interaction.user.id);
                    const penalty = Math.floor(freshData.balance * 0.1);
                    freshData.balance -= penalty;
                    db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(freshData.balance, guildId, interaction.user.id);
                    db.prepare('UPDATE pets SET happiness = MAX(0, happiness - 20) WHERE id = ?').run(myPet.id);
                    addPetExp(guildId, interaction.user.id, Math.floor(dungeon.exp * 0.3));
                    reward = -penalty;
                }
                const statusText = result.alive ? `🏆 **CLEAR!**\n> 🪙 +${reward.toLocaleString('id-ID')} Money\n> ✨ +${expGain} Pet EXP\n> ❤️ HP sisa: ${result.remainingHp}` : `💀 **FAILED!**\n> 🪙 -${Math.abs(reward).toLocaleString('id-ID')} Money (10%)\n> ❤️ Happiness -20\n> ✨ +${Math.floor(dungeon.exp*0.3)} EXP`;
                const embed = new EmbedBuilder().setColor(result.alive ? '#2ECC71' : '#E74C3C').setTitle(`🏰 ${dungeon.name}`).setDescription(`${result.log.join('\n')}\n\n━━━━━━ **RESULT** ━━━━━━\n${statusText}`).setFooter({ text: `Pet: ${myPet.name} Lv.${myPet.level} | CD: ${Math.round((dungeon.cooldown||300000)/60000)} menit` });
                interaction.editReply({ embeds: [embed] }).catch(() => {});
            }, 3000);
            return;
        }

        // ================= REFINE (now under /pet refine) =================
        if (command === 'pet' && subCmd === 'refine') {
            const slot = interaction.options.getString('slot');
            const myPet = getPetData(guildId, interaction.user.id);
            if (!myPet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
            const relic = db.prepare('SELECT * FROM relics WHERE guildId = ? AND userId = ? AND slot = ? AND equipped_pet_id = ?').get(guildId, interaction.user.id, slot, myPet.id);
            if (!relic) return interaction.reply({ content: `❌ Pet kamu tidak punya relic di slot **${slot}**! Dapatkan relic dari dungeon/boss.`, ephemeral: true });
            // Check refine stone
            const hasStone = getItemCount(guildId, interaction.user.id, 'refine_stone');
            if (hasStone <= 0) return interaction.reply({ content: '❌ Kamu butuh **🪨 Refine Stone** untuk upgrade! Dapatkan dari dungeon/boss.', ephemeral: true });
            if (relic.refine_level >= 20) return interaction.reply({ content: '✅ Relic ini sudah **+20** (MAX)!', ephemeral: true });
            removeItem(guildId, interaction.user.id, 'refine_stone');
            // Success rate
            const lvl = relic.refine_level;
            const rate = lvl < 10 ? 100 : lvl < 15 ? 70 : lvl < 18 ? 50 : 30;
            const success = Math.random() * 100 < rate;
            if (success) {
                db.prepare('UPDATE relics SET refine_level = refine_level + 1 WHERE id = ?').run(relic.id);
                incrementUserStat(guildId, interaction.user.id, 'refine_successes');
                await checkAchievements(interaction.guild, interaction.user.id, { type: 'refine_success', maxRefine: (lvl + 1) >= 20 });
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ECC71').setTitle('✨ Refine Success!').setDescription(`**${relic.name}** berhasil di-upgrade!\n\n> ${slot === 'weapon' ? '⚔️' : slot === 'armor' ? '🛡️' : '💍'} **${relic.name}** +${lvl} → **+${lvl+1}**\n> Stats: +${Math.floor(relic.stat_value * (1 + (lvl+1)*0.05))} ${relic.stat_type}\n\n> Rate: ${rate}%`)] });
            } else {
                const newLvl = Math.max(0, lvl - 1);
                db.prepare('UPDATE relics SET refine_level = ? WHERE id = ?').run(newLvl, relic.id);
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#E74C3C').setTitle('💔 Refine Failed!').setDescription(`**${relic.name}** gagal di-upgrade...\n\n> ${slot === 'weapon' ? '⚔️' : slot === 'armor' ? '🛡️' : '💍'} **${relic.name}** +${lvl} → **+${newLvl}** (-1)\n\n> Rate was: ${rate}%\n> 💡 *Tip: Gunakan Protection Stone untuk mencegah turun level*`)] });
            }
        }

        // ================= BOSS BATTLE (now under /pet boss) =================
        if (command === 'pet' && group === 'boss') {
            if (subCmd === 'list') {
                let desc = '👹 **DAFTAR BOSS**\n\n';
                BOSS_LIST.forEach(b => { desc += `${b.name}\n> Level: **${b.minLevel}+** | HP: **${b.hp.toLocaleString()}** | ATK: ${b.atk} | DEF: ${b.def}\n> Reward: 🪙 ${b.reward[0].toLocaleString()}-${b.reward[1].toLocaleString()} + ${b.exp} Pet EXP\n\n`; });
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('👹 Boss List').setColor('#E74C3C').setDescription(desc).setFooter({ text: '/boss create <boss> — buat party | /boss solo <boss> — solo' })] });
            }

            if (subCmd === 'create') {
                const myPet = getPetData(guildId, interaction.user.id);
                if (!myPet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
                const bossId = interaction.options.getString('boss');
                const boss = BOSS_LIST.find(b => b.id === bossId);
                if (!boss) return interaction.reply({ content: '❌ Boss tidak ditemukan!', ephemeral: true });
                if (myPet.level < boss.minLevel) return interaction.reply({ content: `❌ Pet butuh minimal **Lv.${boss.minLevel}**! (Sekarang: Lv.${myPet.level})`, ephemeral: true });
                if (activeBossParties.has(`${guildId}_${interaction.user.id}`)) return interaction.reply({ content: '❌ Kamu sudah punya party aktif! Gunakan `/boss start` untuk mulai.', ephemeral: true });
                
                const partyId = `${guildId}_${interaction.user.id}`;
                activeBossParties.set(partyId, { leader: interaction.user.id, bossId, members: [interaction.user.id], channelId: interaction.channelId, createdAt: Date.now() });
                
                const joinBtn = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`boss_join_${interaction.user.id}`).setLabel(`🎮 Join Party (1/10)`).setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`boss_start_${interaction.user.id}`).setLabel('⚔️ Start Battle').setStyle(ButtonStyle.Danger)
                );
                
                const embed = new EmbedBuilder()
                    .setColor('#E74C3C')
                    .setTitle(`👹 BOSS RAID: ${boss.name}`)
                    .setDescription(`<@${interaction.user.id}> membuat party untuk melawan **${boss.name}**!\n\n> 👹 **Boss:** ${boss.name}\n> ❤️ **HP:** ${boss.hp.toLocaleString()}\n> ⚔️ **ATK:** ${boss.atk} | 🛡️ **DEF:** ${boss.def}\n> 🎁 **Reward:** 🪙 ${boss.reward[0].toLocaleString()}-${boss.reward[1].toLocaleString()}/member\n> 🎯 **Min Level:** ${boss.minLevel}\n\n**Party Members (1/10):**\n> 👑 <@${interaction.user.id}> (Leader)\n\n*Klik tombol Join untuk bergabung!*`)
                    .setFooter({ text: 'Party auto-expire dalam 5 menit | Leader klik Start untuk mulai' });
                
                await interaction.reply({ embeds: [embed], components: [joinBtn] });
                
                // Auto-expire after 5 min
                setTimeout(() => { if (activeBossParties.has(partyId)) { activeBossParties.delete(partyId); } }, 300000);
                return;
            }

            if (subCmd === 'solo') {
                const bossCd = `boss_${guildId}_${interaction.user.id}`;
                if (fishCooldowns.has(bossCd) && Date.now() < fishCooldowns.get(bossCd)) { const rem = Math.ceil((fishCooldowns.get(bossCd) - Date.now()) / 60000); return interaction.reply({ content: `⏳ Boss cooldown! Tunggu **${rem} menit**.`, ephemeral: true }); }
                const myPet = getPetData(guildId, interaction.user.id);
                if (!myPet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
                const bossId = interaction.options.getString('boss');
                const boss = BOSS_LIST.find(b => b.id === bossId);
                if (!boss) return interaction.reply({ content: '❌ Boss tidak ditemukan!', ephemeral: true });
                if (myPet.level < boss.minLevel) return interaction.reply({ content: `❌ Pet butuh minimal **Lv.${boss.minLevel}**!`, ephemeral: true });
                fishCooldowns.set(bossCd, Date.now() + 600000); // 10 min cooldown solo
                
                const myPetDef = PET_DATA.find(p => p.id === myPet.petId);
                const result = simulateBattle(myPet, myPetDef, [{ hp: boss.hp, atk: boss.atk, def: boss.def }]);
                
                let reward = 0, expGain = 0;
                if (result.alive) {
                    reward = getRandomInt(boss.reward[0], boss.reward[1]);
                    expGain = boss.exp;
                    userData.balance += reward;
                    db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                    addPetExp(guildId, interaction.user.id, expGain);
                    incrementUserStat(guildId, interaction.user.id, 'boss_kills');
                    await checkAchievements(interaction.guild, interaction.user.id, { type: 'boss_kill' });
                    // Chance drop relic
                    if (Math.random() < 0.3) {
                        const slot = ['weapon', 'armor', 'accessory'][Math.floor(Math.random() * 3)];
                        const rarity = Math.random() < 0.1 ? 'Legendary' : Math.random() < 0.3 ? 'Epic' : 'Rare';
                        const names = RELIC_NAMES[slot];
                        const name = names[Math.floor(Math.random() * names.length)];
                        const statType = slot === 'weapon' ? 'atk' : slot === 'armor' ? 'def' : (Math.random() < 0.5 ? 'spd' : 'crit');
                        const statVal = rarity === 'Legendary' ? getRandomInt(50,80) : rarity === 'Epic' ? getRandomInt(35,50) : getRandomInt(20,35);
                        db.prepare('INSERT INTO relics (guildId, userId, name, slot, rarity, stat_type, stat_value) VALUES (?, ?, ?, ?, ?, ?, ?)').run(guildId, interaction.user.id, name, slot, rarity, statType, statVal);
                        reward = `${reward} + 📿 **${name}** (${rarity})`;
                    }
                    // Drop refine stone
                    addItem(guildId, interaction.user.id, 'refine_stone', getRandomInt(1, 3));
                } else {
                    const penalty = Math.floor(userData.balance * 0.05);
                    userData.balance -= penalty;
                    db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                    db.prepare('UPDATE pets SET happiness = MAX(0, happiness - 10) WHERE id = ?').run(myPet.id);
                    addPetExp(guildId, interaction.user.id, Math.floor(boss.exp * 0.3));
                    reward = -penalty;
                }
                
                const statusText = result.alive ? `🏆 **BOSS DEFEATED!**\n> 🪙 Reward: ${typeof reward === 'string' ? reward : '+' + reward.toLocaleString('id-ID')}\n> ✨ +${expGain} Pet EXP\n> 🪨 +1-3 Refine Stone` : `💀 **FAILED!**\n> 🪙 -${Math.abs(reward).toLocaleString('id-ID')} (5% penalty)\n> ❤️ Happiness -10`;
                const embed = new EmbedBuilder().setColor(result.alive ? '#FFD700' : '#E74C3C').setTitle(`👹 Solo Boss: ${boss.name}`).setDescription(`${result.log.join('\n')}\n\n━━━━━━ **RESULT** ━━━━━━\n${statusText}`).setFooter({ text: 'Cooldown: 10 menit (solo)' });
                return interaction.reply({ embeds: [embed] });
            }

            if (subCmd === 'start') {
                const partyId = `${guildId}_${interaction.user.id}`;
                const party = activeBossParties.get(partyId);
                if (!party) return interaction.reply({ content: '❌ Kamu tidak punya party aktif! Gunakan `/boss create` dulu.', ephemeral: true });
                if (party.leader !== interaction.user.id) return interaction.reply({ content: '❌ Hanya leader yang bisa start!', ephemeral: true });
                activeBossParties.delete(partyId);
                
                const boss = BOSS_LIST.find(b => b.id === party.bossId);
                // All members attack boss together
                let totalDmg = 0, bossHp = boss.hp, log = [`👹 **${boss.name}** — HP: ${boss.hp.toLocaleString()}\n`];
                for (const memberId of party.members) {
                    const mPet = getPetData(guildId, memberId);
                    if (!mPet) continue;
                    const mPetDef = PET_DATA.find(p => p.id === mPet.petId);
                    const dmg = (mPet.atk + mPet.level) * getRandomInt(3, 6);
                    totalDmg += dmg;
                    log.push(`> ${mPetDef ? mPetDef.emoji : '🐾'} **${mPet.name}** (Lv.${mPet.level}) dealt **${dmg}** dmg`);
                }
                
                const won = totalDmg >= boss.hp;
                log.push(`\n> 💥 Total Damage: **${totalDmg.toLocaleString()}** / ${boss.hp.toLocaleString()} HP`);
                
                if (won) {
                    log.push(`\n🏆 **BOSS DEFEATED!**`);
                    for (const memberId of party.members) {
                        const reward = getRandomInt(boss.reward[0], boss.reward[1]);
                        const memberData = getOrCreateUser(guildId, memberId);
                        memberData.balance += reward;
                        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(memberData.balance, guildId, memberId);
                        addPetExp(guildId, memberId, boss.exp);
                        addItem(guildId, memberId, 'refine_stone', getRandomInt(1, 2));
                        incrementUserStat(guildId, memberId, 'boss_kills');
                        await checkAchievements(interaction.guild, memberId, { type: 'boss_kill' });
                        // 20% chance relic per member
                        if (Math.random() < 0.2) {
                            const slot = ['weapon', 'armor', 'accessory'][Math.floor(Math.random() * 3)];
                            const rarity = Math.random() < 0.1 ? 'Legendary' : Math.random() < 0.3 ? 'Epic' : 'Rare';
                            const names = RELIC_NAMES[slot]; const name = names[Math.floor(Math.random() * names.length)];
                            const statType = slot === 'weapon' ? 'atk' : slot === 'armor' ? 'def' : (Math.random() < 0.5 ? 'spd' : 'crit');
                            const statVal = rarity === 'Legendary' ? getRandomInt(50,80) : rarity === 'Epic' ? getRandomInt(35,50) : getRandomInt(20,35);
                            db.prepare('INSERT INTO relics (guildId, userId, name, slot, rarity, stat_type, stat_value) VALUES (?, ?, ?, ?, ?, ?, ?)').run(guildId, memberId, name, slot, rarity, statType, statVal);
                        }
                    }
                    log.push(`> 🎁 Reward dibagikan ke ${party.members.length} member!`);
                } else {
                    log.push(`\n💀 **FAILED!** Damage tidak cukup.`);
                    for (const memberId of party.members) {
                        const memberData = getOrCreateUser(guildId, memberId);
                        const penalty = Math.floor(memberData.balance * 0.05);
                        memberData.balance -= penalty;
                        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(memberData.balance, guildId, memberId);
                    }
                    log.push(`> 🪙 Semua member kehilangan 5% money`);
                }
                
                const embed = new EmbedBuilder().setColor(won ? '#FFD700' : '#E74C3C').setTitle(`👹 BOSS RAID: ${boss.name}`).setDescription(log.join('\n')).setFooter({ text: `Party: ${party.members.length} members` });
                return interaction.reply({ embeds: [embed] });
            }
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


        // ================= TRADING SYSTEM =================
        if (command === 'trade') {
            if (subCmd === 'offer') {
                const target = interaction.options.getUser('user');
                if (target.id === interaction.user.id) return interaction.reply({ content: '❌ Tidak bisa trade dengan diri sendiri!', ephemeral: true });
                if (target.bot) return interaction.reply({ content: '❌ Tidak bisa trade dengan bot!', ephemeral: true });
                const give = interaction.options.getString('give');
                const want = interaction.options.getString('want');
                // Validate format
                const parseTradeItem = (str) => { const parts = str.split(':'); if (parts.length !== 2) return null; const [type, id] = parts; if (!['fish','relic','money','pet'].includes(type)) return null; return { type, id }; };
                const giveItem = parseTradeItem(give);
                const wantItem = parseTradeItem(want);
                if (!giveItem || !wantItem) return interaction.reply({ content: '❌ Format salah! Gunakan: `fish:ID`, `relic:ID`, `pet:ID`, atau `money:JUMLAH`\n\n> Contoh: `/trade offer @user give:fish:5 want:money:500`', ephemeral: true });
                // Validate ownership
                if (giveItem.type === 'fish') { const fish = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(giveItem.id), guildId, interaction.user.id); if (!fish) return interaction.reply({ content: '❌ Ikan tidak ditemukan di inventory kamu!', ephemeral: true }); }
                if (giveItem.type === 'relic') { const relic = db.prepare('SELECT * FROM relics WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(giveItem.id), guildId, interaction.user.id); if (!relic) return interaction.reply({ content: '❌ Relic tidak ditemukan!', ephemeral: true }); }
                if (giveItem.type === 'money') { if (userData.balance < parseInt(giveItem.id)) return interaction.reply({ content: '❌ Saldo kurang!', ephemeral: true }); }
                if (giveItem.type === 'pet') { const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(parseInt(giveItem.id), guildId, interaction.user.id); if (!pet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true }); }
                // Create trade
                db.prepare('INSERT INTO trades (guildId, senderId, receiverId, status, createdAt, senderOffer, receiverOffer) VALUES (?, ?, ?, ?, ?, ?, ?)').run(guildId, interaction.user.id, target.id, 'pending', Date.now(), give, want);
                const tradeId = db.prepare('SELECT last_insert_rowid() as id').get().id;
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#3498DB').setTitle('🔄 Trade Offer Sent!').setDescription(`<@${interaction.user.id}> → <@${target.id}>\n\n> 📤 **Menawarkan:** \`${give}\`\n> 📥 **Meminta:** \`${want}\`\n> 🆔 Trade ID: **#${tradeId}**\n\n<@${target.id}> gunakan \`/trade accept ${tradeId}\` untuk terima!`).setFooter({ text: 'Trade berlaku 24 jam' })] });
            }
            if (subCmd === 'accept') {
                const tradeId = interaction.options.getInteger('id');
                const trade = db.prepare('SELECT * FROM trades WHERE id = ? AND guildId = ? AND receiverId = ? AND status = ?').get(tradeId, guildId, interaction.user.id, 'pending');
                if (!trade) return interaction.reply({ content: '❌ Trade tidak ditemukan atau bukan untuk kamu!', ephemeral: true });
                if (Date.now() - trade.createdAt > 86400000) { db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('expired', tradeId); return interaction.reply({ content: '❌ Trade sudah expired (>24 jam)!', ephemeral: true }); }
                // Execute trade
                const parseItem = (str) => { const [type, id] = str.split(':'); return { type, id }; };
                const senderGive = parseItem(trade.senderOffer);
                const senderWant = parseItem(trade.receiverOffer);
                // Transfer sender's offer to receiver
                if (senderGive.type === 'fish') { db.prepare('UPDATE fish_inventory SET userId = ? WHERE id = ? AND guildId = ?').run(interaction.user.id, parseInt(senderGive.id), guildId); }
                if (senderGive.type === 'relic') { db.prepare('UPDATE relics SET userId = ? WHERE id = ? AND guildId = ?').run(interaction.user.id, parseInt(senderGive.id), guildId); }
                if (senderGive.type === 'money') { db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(parseInt(senderGive.id), guildId, trade.senderId); db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(parseInt(senderGive.id), guildId, interaction.user.id); }
                if (senderGive.type === 'pet') { db.prepare('UPDATE pets SET userId = ?, active = 0 WHERE id = ? AND guildId = ?').run(interaction.user.id, parseInt(senderGive.id), guildId); }
                // Transfer receiver's offer to sender
                if (senderWant.type === 'fish') { db.prepare('UPDATE fish_inventory SET userId = ? WHERE id = ? AND guildId = ?').run(trade.senderId, parseInt(senderWant.id), guildId); }
                if (senderWant.type === 'relic') { db.prepare('UPDATE relics SET userId = ? WHERE id = ? AND guildId = ?').run(trade.senderId, parseInt(senderWant.id), guildId); }
                if (senderWant.type === 'money') { db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(parseInt(senderWant.id), guildId, interaction.user.id); db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(parseInt(senderWant.id), guildId, trade.senderId); }
                if (senderWant.type === 'pet') { db.prepare('UPDATE pets SET userId = ?, active = 0 WHERE id = ? AND guildId = ?').run(trade.senderId, parseInt(senderWant.id), guildId); }
                db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('completed', tradeId);
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ECC71').setTitle('✅ Trade Complete!').setDescription(`Trade #${tradeId} berhasil!\n\n> <@${trade.senderId}> memberikan \`${trade.senderOffer}\`\n> <@${interaction.user.id}> memberikan \`${trade.receiverOffer}\``)] });
            }
            if (subCmd === 'reject') {
                const tradeId = interaction.options.getInteger('id');
                const trade = db.prepare('SELECT * FROM trades WHERE id = ? AND guildId = ? AND receiverId = ? AND status = ?').get(tradeId, guildId, interaction.user.id, 'pending');
                if (!trade) return interaction.reply({ content: '❌ Trade tidak ditemukan!', ephemeral: true });
                db.prepare('UPDATE trades SET status = ? WHERE id = ?').run('rejected', tradeId);
                return interaction.reply({ content: `❌ Trade #${tradeId} ditolak.` });
            }
            if (subCmd === 'list') {
                const pending = db.prepare('SELECT * FROM trades WHERE guildId = ? AND (senderId = ? OR receiverId = ?) AND status = ? ORDER BY createdAt DESC LIMIT 10').all(guildId, interaction.user.id, interaction.user.id, 'pending');
                if (pending.length === 0) return interaction.reply({ content: '📭 Tidak ada trade pending.', ephemeral: true });
                let desc = '';
                pending.forEach(t => { desc += `> **#${t.id}** | <@${t.senderId}> → <@${t.receiverId}>\n> 📤 ${t.senderOffer} | 📥 ${t.receiverOffer}\n\n`; });
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔄 Pending Trades').setColor('#3498DB').setDescription(desc).setFooter({ text: '/trade accept <id> atau /trade reject <id>' })], ephemeral: true });
            }
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
            if (!ahData.purchased) return interaction.reply({ content: '❌ Kamu belum punya **🔔 Auto-Harvest Pass**!\n\n> Beli di `/shop` kategori Items seharga 🪙 5,000\n> Setelah beli, gunakan `/me use auto_harvest_pass` untuk aktivasi permanen.', ephemeral: true });
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
            return interaction.reply({ content: `✅ Berhasil membeli ${itemDef.emoji} **${itemDef.name}**!\n> Cek di \`/me inventory\` — Gunakan dengan \`/me use\`` });
        }
        if (interaction.customId === 'farm_buy_seed') {
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
            else if (cat === 'fishing') content = '🎣 **Fishing Commands:**\n\n> `/fish` — Lempar pancing\n> `/fishing sell` — Jual ikan\n> `/fishing inventory` — Lihat ikan\n> `/fishing collection` — Pokedex ikan\n> `/fishing shop` — Beli joran & umpan\n> `/fishing stats` — Statistik\n> `/fishing lock/unlock <id>` — Kunci ikan';
            else if (cat === 'farming') content = '🌾 **Farming Commands:**\n\n> `/farm status` — Lihat kebun\n> `/farm plant <bibit>` — Tanam\n> `/farm water` — Siram semua\n> `/farm harvest` — Panen\n> `/farm sell` — Jual hasil\n> `/farm craft <resep>` — Craft produk\n> `/farm shop` — Beli bibit & pupuk\n> `/farm upgrade` — Upgrade lahan';
            else if (cat === 'pet') content = '🐾 **Pet & Battle Commands:**\n\n> `/pet adopt/info/feed/play/hunt` — Kelola pet\n> `/pet shop` — Beli makanan & telur (gacha)\n> `/pet dungeon <tier>` — Lawan monster\n> `/pet boss create/solo/list` — Raid boss\n> `/pet refine <slot>` — Upgrade relic\n> `/battle @user` — PvP auto-battle';
            else if (cat === 'profile') content = '📋 **Profil Commands:**\n\n> `/me profile` — Kartu profil\n> `/me achievement` — Koleksi badge\n> `/me inventory` — Lihat item\n> `/me use <item>` — Gunakan item\n> `/me quest` — Misi harian\n> `/me streak` — Info streak\n> `/me restore` — Pulihkan streak';
            else if (cat === 'shop') content = '🛒 **Shop:**\n\n> `/shop` — Buka toko lengkap\n> Kategori: 🎣 Fishing, 🌾 Farming, 🐾 Pet, 📿 Battle, 🎭 Role';
            else if (cat === 'daily') content = '🎁 **Daily Reward:**\n\n> `/daily` — Klaim hadiah harian\n> Dapat: Money + Pet EXP + Random Item\n> Bonus streak = hadiah lebih besar!';
            else if (cat === 'quest') content = '📜 **Quest:**\n\n> `/me quest` — Lihat misi harian (3 misi/hari)\n> Selesaikan untuk dapat money bonus!\n> Reset setiap 00:00 WIB';
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
        if (interaction.customId.startsWith('claim_quest_')) { const qi = parseInt(interaction.customId.replace('claim_quest_', '')), today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); let row = db.prepare('SELECT * FROM daily_quests WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id); if (!row || row.date !== today) return interaction.update({ content: '❌ Expired.', embeds: [], components: [] }); let quests = JSON.parse(row.data), tq = quests[qi]; if (tq.progress < tq.target || tq.claimed) return interaction.reply({content: '❌ Belum selesai!', ephemeral: true}); tq.claimed = true; db.prepare('UPDATE daily_quests SET data = ? WHERE guildId = ? AND userId = ?').run(JSON.stringify(quests), guildId, interaction.user.id); let ud = getOrCreateUser(guildId, interaction.user.id); ud.balance += tq.reward; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(ud.balance, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'total_quests_done'); await checkAchievements(interaction.guild, interaction.user.id, { type: 'quest' }); if (quests.every(q => q.claimed)) await checkAchievements(interaction.guild, interaction.user.id, { type: 'all_quest_day' }); return interaction.reply(`✅ Dapat 🪙 **${tq.reward}**!`); }
        if (interaction.customId === 'cancel_buy') return interaction.update({ content: '❌ Dibatalkan.', components: [] });
        if (interaction.customId.startsWith('confirm_')) { const selected = interaction.customId.substring(8), userData = getOrCreateUser(guildId, interaction.user.id); let finalItemName = '', finalPrice = 0; if (selected.startsWith('item_')) { const parts = selected.substring(5).split('_'); const itemPrice = parseInt(parts.pop()); const itemName = parts.join('_'); const item = db.prepare('SELECT * FROM shop_items WHERE guildId = ? AND name = ? AND price = ? LIMIT 1').get(guildId, itemName, itemPrice); if (!item) return interaction.update({content: '❌ Habis!', components: []}); if (userData.balance < item.price) return interaction.update({content: '❌ Saldo kurang!', components: []}); try { await interaction.user.send(`🛍️ **${item.name}**:\n\`\`\`\n${item.content}\n\`\`\``); } catch(e) { return interaction.update({content: '❌ DM tertutup!', components: []}); } userData.balance -= item.price; finalItemName = item.name; finalPrice = item.price; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); db.prepare('DELETE FROM shop_items WHERE id = ?').run(item.id); } if (selected.startsWith('role_')) { const roleId = selected.substring(5), sr = db.prepare('SELECT * FROM shop_roles WHERE guildId = ? AND roleId = ?').get(guildId, roleId); if (!sr) return interaction.update({content: '❌ Tidak dijual.', components: []}); if (userData.balance < sr.price) return interaction.update({content: '❌ Saldo kurang!', components: []}); if (interaction.member.roles.cache.has(roleId)) return interaction.update({content: '❌ Sudah punya!', components: []}); userData.balance -= sr.price; const role = interaction.guild.roles.cache.get(roleId); finalItemName = role ? `Role ${role.name}` : 'Role'; finalPrice = sr.price; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); if (role) await interaction.member.roles.add(role).catch(()=>{}); } incrementUserStat(guildId, interaction.user.id, 'total_buys'); await checkAchievements(interaction.guild, interaction.user.id, { type: 'buy' }); db.prepare('INSERT INTO logs (guildId, time, userId, action, item, price) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, Date.now(), interaction.user.id, 'BUY', finalItemName, finalPrice); const ts = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, 'testimoni_channel'); if (ts) { const tc = interaction.guild.channels.cache.get(ts.value); if (tc) tc.send({ embeds: [new EmbedBuilder().setColor('#2B2D31').setDescription(`<@${interaction.user.id}> beli **${finalItemName}** (🪙 ${finalPrice.toLocaleString('id-ID')})`).setTimestamp()] }).catch(()=>{}); } return interaction.update({content: `✅ Berhasil beli **${finalItemName}**!`, components: []}); }
    }


    // ================= MODAL HANDLERS =================
    if (interaction.isModalSubmit()) {
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
