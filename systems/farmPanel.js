// systems/farmPanel.js - Farm Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser, getUserStat, incrementUserStat, addIncome, getSeedCount, addSeed, removeSeed, getAllSeeds, getFertCount, addFert, removeFert, getAllFerts, addUserBalance, subtractUserBalance, getFarmDecorations, hasFarmDecoration, addFarmDecoration, getFarmPlot, insertFarmPlot, deleteDeadFarmPlots, clearFarmStorage, upgradeFarmLevel } = require('../database');
const { getRandomInt } = require('../utils');
const { getFarmData, getFarmSlots, getPlots, getStorage, addStorage, removeStorage, getStorageQty } = require('./farming');
const { updateQuestProgress } = require('./quests');
const { checkAchievements } = require('./achievements');
const { addComboFeature } = require('./combo');
const { addPetExp } = require('../systems/pets');
const { FARM_LEVELS, FARM_CROPS, FARM_RECIPES, FARM_FERTILIZERS, FARM_DECORATIONS } = require('../data/farming');
const { getTodayWeather, getWeatherYieldMultiplier, getWeatherGrowMultiplier, getWeatherDeathChance, isAutoWaterWeather, formatWeatherEmbed } = require('./farmWeather');
const { rollMutation, calculateHarvestYield, getRotationBonus, updateRotation, logMutation, PRESTIGE_CROPS, SEED_UPGRADES } = require('./farmMutation');
const { getPetData } = require('./pets');
const { PET_DATA, PET_LEVEL_MULTIPLIERS } = require('../data/pets');
const state = require('../state');
const { fishCooldowns } = state;


// ============ HELPER: Build main farm panel embed + buttons ============
function buildFarmPanel(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);
    const farmData = getFarmData(guildId, userId);
    const maxSlots = getFarmSlots(guildId, userId);
    const plots = getPlots(guildId, userId);
    const storage = getStorage(guildId, userId);
    const levelInfo = FARM_LEVELS.find(l => l.level === farmData.farm_level);
    const storageCount = storage.reduce((sum, s) => sum + s.quantity, 0);
    const weather = getTodayWeather();
    const readyCount = plots.filter(p => {
        const crop = FARM_CROPS.find(c => c.id === p.cropId);
        if (!crop || p.status === 'dead') return false;
        const fert = FARM_FERTILIZERS.find(f => f.id === p.fertilizer) || FARM_FERTILIZERS[0];
        const growTime = crop.time * (1 - fert.speedBonus) * 60000;
        return Date.now() - p.plantedAt >= growTime;
    }).length;

    // Decoration display
    const ownedDecos = getFarmDecorations(guildId, userId);
    let decoDisplay = '';
    if (ownedDecos.length > 0) {
        decoDisplay = ownedDecos.map(d => {
            const deco = FARM_DECORATIONS.find(dec => dec.id === d.decoId);
            return deco ? deco.emoji : '';
        }).filter(Boolean).join(' ') + '\n';
    }

    let plotStatus = '';
    // Get active pests
    const { getActivePests, PEST_TYPES } = require('./farmWeather');
    const activePests = getActivePests(guildId, userId);
    const pestCount = activePests.length;

    if (plots.length === 0) {
        plotStatus = '> *🌿 Kebun kosong! Tanam bibit untuk mulai.*\n';
    } else {
        plots.forEach((plot, i) => {
            let crop = FARM_CROPS.find(c => c.id === plot.cropId);
            if (!crop) crop = PRESTIGE_CROPS.find(c => c.id === plot.cropId);
            if (!crop) return;
            const fert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer) || FARM_FERTILIZERS[0];
            const growTime = crop.time * (1 - fert.speedBonus) * 60000;
            const elapsed = Date.now() - plot.plantedAt;
            const dryTime = Date.now() - plot.wateredAt;
            const deadThreshold = growTime * 2.5;

            // Check if this plot has a pest
            const plotPest = activePests.find(p => p.plotId === plot.id);
            const pestIcon = plotPest ? (() => { const pt = PEST_TYPES.find(p => p.id === plotPest.pestId); return pt ? ` ${pt.emoji}` : ' 🐛'; })() : '';
            
            let statusIcon = '', statusText = '', progressBar = '';
            if (plot.status === 'dead' || dryTime > deadThreshold) {
                statusIcon = '☠️'; statusText = 'Mati';
                progressBar = '░░░░░░░░░░';
                if (plot.status !== 'dead') db.prepare('UPDATE farm_plots SET status = ? WHERE id = ?').run('dead', plot.id);
            } else if (elapsed >= growTime) {
                statusIcon = '✅'; statusText = 'Siap Panen!';
                progressBar = '██████████';
            } else if (dryTime > growTime * 1.5) {
                statusIcon = '🥀'; statusText = 'Layu!';
                const pct = Math.min(100, Math.floor((elapsed / growTime) * 100));
                const filled = Math.floor(pct / 10);
                progressBar = '█'.repeat(filled) + '░'.repeat(10 - filled);
            } else {
                const pct = Math.min(100, Math.floor((elapsed / growTime) * 100));
                const filled = Math.floor(pct / 10);
                progressBar = '█'.repeat(filled) + '░'.repeat(10 - filled);
                const remainMs = growTime - elapsed;
                const remainMin = Math.max(0, Math.ceil(remainMs / 60000));
                statusIcon = '🌱'; statusText = `${pct}% (${remainMin}m)`;
            }
            
            const fertIcon = fert.id !== 'none' ? ` ${fert.emoji}` : '';
            plotStatus += `> \`[${i+1}]\` ${crop.emoji} **${crop.name}**${fertIcon}${pestIcon}\n>  ┗ ${statusIcon} \`${progressBar}\` ${statusText}\n`;
        });
    }

    const embed = new EmbedBuilder()
        .setTitle(`🌾 FARM PANEL — ${username}`)
        .setColor(readyCount > 0 ? '#F1C40F' : '#2ECC71')
        .setDescription(
            (decoDisplay ? decoDisplay : '') +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🏡 **${levelInfo.name}** | ${weather.emoji} **${weather.name}**\n` +
            `> ${weather.desc}\n` +
            `> 📊 Slots: **${plots.length}** / ${maxSlots} terpakai\n` +
            `> 📦 Storage: **${storageCount}** items\n` +
            `> 💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n` +
            (readyCount > 0 ? `> 🔔 **${readyCount} tanaman siap panen!**\n` : '') +
            (pestCount > 0 ? `> 🐛 **${pestCount} hama menyerang!** Gunakan 🧴 Pestisida\n` : '') +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📋 **Status Tanaman:**\n${plotStatus}`
        )
        .setFooter({ text: '✅ Panen | 🌱 Growing | 🥀 Layu (siram!) | ☠️ Mati | 🔄 Refresh' });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_plant_${userId}`).setLabel('🌱 Plant').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_water_${userId}`).setLabel('💧 Water').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_harvest_${userId}`).setLabel('🌾 Harvest').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_pest_${userId}`).setLabel(`🧴 Pest${pestCount > 0 ? ` (${pestCount})` : ''}`).setStyle(pestCount > 0 ? ButtonStyle.Danger : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_refresh_${userId}`).setLabel('🔄').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_upgrade_${userId}`).setLabel('⬆️ Upgrade').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_pupuk_${userId}`).setLabel('🧫 Pupuk').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_deco_${userId}`).setLabel('🎨 Deco').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row1, row2] };
}


// ============ BUILD: Farm Hub (main entry with 4 buttons) ============
function buildFarmHub(guildId, userId, username) {
    const { getSeasonDisplay } = require('./farmSeason');
    const { getCoopLevel, getBarnLevel, getAnimals } = require('./livestock');
    const season = getSeasonDisplay();
    const userData = getOrCreateUser(guildId, userId);

    const chickens = getAnimals(userId, 'chicken').filter(a => a.status !== 'dead');
    const cows = getAnimals(userId, 'cow').filter(a => a.status !== 'dead');
    const sheep = getAnimals(userId, 'sheep').filter(a => a.status !== 'dead');
    const coopLvl = getCoopLevel(userId);
    const barnLvl = getBarnLevel(userId);

    const farmData = getFarmData(guildId, userId);
    const plots = getPlots(guildId, userId);
    const readyCount = plots.filter(p => {
        const crop = FARM_CROPS.find(c => c.id === p.cropId);
        if (!crop || p.status === 'dead') return false;
        const fert = FARM_FERTILIZERS.find(f => f.id === p.fertilizer) || FARM_FERTILIZERS[0];
        const growTime = crop.time * (1 - fert.speedBonus) * 60000 / (season.effects?.farmGrow || 1);
        return Date.now() - p.plantedAt >= growTime;
    }).length;

    const embed = new EmbedBuilder()
        .setTitle(`🌾 FARM — ${username}`)
        .setColor('#2ECC71')
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `${season.emoji} **Season: ${season.name}**\n` +
            `> ${season.desc}\n\n` +
            `📊 **Overview:**\n` +
            `> 🌱 Tanaman: **${plots.length}** plot ${readyCount > 0 ? `(🔔 ${readyCount} siap panen!)` : ''}\n` +
            `> 🐔 Ayam: **${chickens.length}** ekor (Kandang Lv.${coopLvl})\n` +
            `> 🐄 Sapi: **${cows.length}** | 🐑 Domba: **${sheep.length}** (Kandang Lv.${barnLvl})\n` +
            `> 💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Pilih fitur yang mau dikelola:`
        )
        .setFooter({ text: `Season berubah setiap hari 00:00 WIB | Next: ${season.nextSeason.emoji} ${season.nextSeason.name}` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_crops_${userId}`).setLabel('🌱 Tanaman').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_coop_${userId}`).setLabel(`🐔 Kandang Ayam`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_barn_${userId}`).setLabel(`🐄 Peternakan`).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_allcraft_${userId}`).setLabel('🧪 Crafting').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_allstorage_${userId}`).setLabel('📦 Storage').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

// ============ HANDLER: /farm command (show HUB panel) ============
async function handleFarmCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const panel = buildFarmHub(guildId, userId, interaction.user.username);
    return interaction.reply(panel);
}

// ============ HANDLER: Farm panel button clicks ============
async function handleFarmButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel farm kamu!', ephemeral: true });
    }

    const userData = getOrCreateUser(guildId, userId);

    // === HUB NAVIGATION (from main farm panel) ===
    if (customId === `farm_crops_${userId}`) {
        return interaction.update(buildFarmPanel(guildId, userId, interaction.user.username));
    }
    if (customId === `farm_coop_${userId}`) {
        const { buildCoopPanel } = require('./livestockPanel');
        return interaction.update(buildCoopPanel(userId, interaction.user.username));
    }
    if (customId === `farm_barn_${userId}`) {
        const { buildBarnPanel } = require('./livestockPanel');
        return interaction.update(buildBarnPanel(userId, interaction.user.username));
    }
    if (customId === `farm_allcraft_${userId}`) {
        const { buildCraftingPanel } = require('./livestockPanel');
        return interaction.update(buildCraftingPanel(guildId, userId, interaction.user.username));
    }
    if (customId === `farm_allstorage_${userId}`) {
        const { buildStorageHub } = require('./livestockPanel');
        return interaction.update(buildStorageHub(guildId, userId, interaction.user.username));
    }
    if (customId === `farm_hub_${userId}`) {
        return interaction.update(buildFarmHub(guildId, userId, interaction.user.username));
    }

    // === LIVESTOCK PANEL BUTTONS (delegate to livestockPanel) ===
    const { isLivestockButton, handleLivestockButton } = require('./livestockPanel');
    if (isLivestockButton(customId)) {
        return handleLivestockButton(interaction);
    }

    // === PUPUK MODE BUTTONS (special parsing) ===
    if (customId.startsWith('farm_pupuk_single_')) {
        const plots = getPlots(guildId, userId);
        const unfertilized = plots.filter(p => p.fertilizer === 'none' && p.status !== 'dead');
        if (unfertilized.length === 0) {
            return interaction.reply({ content: '❌ Tidak ada tanaman yang bisa dipupuk!', ephemeral: true });
        }
        const ownedFerts = getAllFerts(guildId, userId);
        if (ownedFerts.length === 0) {
            const embed = new EmbedBuilder().setTitle('🧫 Pupuk Tanaman').setColor('#E74C3C')
                .setDescription('❌ Tidak punya pupuk! Beli dulu di 🛒 Shop.');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`farm_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`farm_pupuk_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }
        const fertMenu = new StringSelectMenuBuilder().setCustomId(`farm_pupukfert_${userId}`).setPlaceholder('🧫 Pilih pupuk dari inventory...').setMinValues(1).setMaxValues(1);
        ownedFerts.forEach(inv => {
            const f = FARM_FERTILIZERS.find(fe => fe.id === inv.fertId);
            if (!f) return;
            fertMenu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`${f.name} (x${inv.quantity})`)
                .setValue(f.id)
                .setDescription(`-${Math.round(f.speedBonus * 100)}% waktu${f.yieldBonus > 0 ? ` | +${Math.round(f.yieldBonus * 100)}% hasil` : ''}`));
        });
        const embed = new EmbedBuilder().setTitle('🧫 Pupuk Tanaman (Satu Per Satu)').setColor('#F39C12')
            .setDescription(`Pilih pupuk untuk diterapkan ke satu tanaman:\n\n${ownedFerts.map(inv => { const f = FARM_FERTILIZERS.find(fe => fe.id === inv.fertId); return f ? `> ${f.emoji} ${f.name} x**${inv.quantity}**` : ''; }).filter(Boolean).join('\n')}`);
        const row1 = new ActionRowBuilder().addComponents(fertMenu);
        const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`farm_pupuk_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary));
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }

    if (customId.startsWith('farm_pupuk_all_')) {
        const plots = getPlots(guildId, userId);
        const unfertilized = plots.filter(p => p.fertilizer === 'none' && p.status !== 'dead');
        if (unfertilized.length === 0) {
            return interaction.reply({ content: '❌ Tidak ada tanaman yang bisa dipupuk!', ephemeral: true });
        }
        const ownedFerts = getAllFerts(guildId, userId);
        if (ownedFerts.length === 0) {
            const embed = new EmbedBuilder().setTitle('🧫 Pupuk Tanaman').setColor('#E74C3C')
                .setDescription('❌ Tidak punya pupuk! Beli dulu di 🛒 Shop.');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`farm_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`farm_pupuk_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }
        const fertMenu = new StringSelectMenuBuilder().setCustomId(`farm_pupukfert_all_${userId}`).setPlaceholder('🧫 Pilih pupuk untuk semua tanaman...').setMinValues(1).setMaxValues(1);
        ownedFerts.forEach(inv => {
            const f = FARM_FERTILIZERS.find(fe => fe.id === inv.fertId);
            if (!f) return;
            const needed = unfertilized.length;
            const canApply = Math.min(needed, inv.quantity);
            fertMenu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`${f.name} (x${inv.quantity})`)
                .setValue(f.id)
                .setDescription(`Bisa pupuk ${canApply}/${needed} tanaman | -${Math.round(f.speedBonus * 100)}% waktu${f.yieldBonus > 0 ? ` | +${Math.round(f.yieldBonus * 100)}% hasil` : ''}`));
        });
        const embed = new EmbedBuilder().setTitle('🧫 Pupuk Tanaman (Semua Sekaligus)').setColor('#1ABC9C')
            .setDescription(`📊 Tanaman yang akan dipupuk: **${unfertilized.length}**\n\nPilih pupuk untuk diterapkan ke semua tanaman yang belum dipupuk:\n\n${ownedFerts.map(inv => { const f = FARM_FERTILIZERS.find(fe => fe.id === inv.fertId); return f ? `> ${f.emoji} ${f.name} x**${inv.quantity}**` : ''; }).filter(Boolean).join('\n')}`);
        const row1 = new ActionRowBuilder().addComponents(fertMenu);
        const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`farm_pupuk_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary));
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }

    const action = parts[1];

    // === BACK TO MAIN PANEL ===
    if (action === 'back' || action === 'refresh') {
        const panel = buildFarmPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    // === PLANT (show seed select menu) ===
    if (action === 'plant') {
        const maxSlots = getFarmSlots(guildId, userId);
        const plots = getPlots(guildId, userId);
        if (plots.length >= maxSlots) {
            return interaction.reply({ content: `❌ Lahan penuh! (${plots.length}/${maxSlots}) Upgrade atau panen dulu.`, ephemeral: true });
        }
        const owned = getAllSeeds(guildId, userId);
        if (owned.length === 0) {
            const embed = new EmbedBuilder().setTitle('🌱 Tanam Bibit').setColor('#E74C3C')
                .setDescription('📦 Tidak punya bibit! Beli dulu di Shop.');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`farm_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }
        const seedMenu = new StringSelectMenuBuilder().setCustomId(`farm_plantseed_${userId}`).setPlaceholder('🌱 Pilih bibit...').setMinValues(1).setMaxValues(1);
        owned.slice(0, 25).forEach(inv => {
            let c = FARM_CROPS.find(cr => cr.id === inv.cropId);
            if (!c) c = PRESTIGE_CROPS.find(cr => cr.id === inv.cropId);
            if (!c) return;
            const timeDisplay = c.time >= 60 ? `${Math.floor(c.time / 60)}j` : `${c.time}m`;
            const isPrestige = c.tier === 'Prestige';
            seedMenu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`${isPrestige ? '🏆 ' : ''}${c.name} (x${inv.quantity}) — ${c.tier} | ${timeDisplay}`)
                .setValue(c.id).setDescription(`Jual: 🪙${c.sellPrice.toLocaleString('id-ID')} | Yield: ${c.minYield}-${c.maxYield}`));
        });
        const embed = new EmbedBuilder().setTitle('🌱 Tanam Bibit').setColor('#2ECC71')
            .setDescription(`Slot tersedia: **${maxSlots - plots.length}** dari ${maxSlots}\nPilih bibit dari inventory:`);
        const row1 = new ActionRowBuilder().addComponents(seedMenu);
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }


    // === WATER ===
    if (action === 'water') {
        const plots = getPlots(guildId, userId);
        if (plots.length === 0) return interaction.reply({ content: '❌ Tidak ada tanaman untuk disiram!', ephemeral: true });
        let watered = 0;
        for (const plot of plots) { if (plot.status !== 'dead') { db.prepare('UPDATE farm_plots SET wateredAt = ? WHERE id = ?').run(Date.now(), plot.id); watered++; } }
        const embed = new EmbedBuilder().setColor('#3498DB').setTitle('💧 Tanaman Disiram!')
            .setDescription(`Berhasil menyiram **${watered} tanaman**!`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    // === PEST (show pest panel + use pesticide) ===
    if (action === 'pest') {
        const { getActivePests, PEST_TYPES, resolvePest } = require('./farmWeather');
        const { getItemCount, removeItem } = require('../database');
        const pests = getActivePests(guildId, userId);

        if (pests.length === 0) {
            const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('🧴 Hama & Pestisida')
                .setDescription(`✅ **Kebun aman!** Tidak ada hama saat ini.\n\n> 🧴 Pestisida: **${getItemCount(guildId, userId, 'pesticide')}** buah\n> 🌿 Shield: **${getItemCount(guildId, userId, 'pesticide_shield')}** buah\n\n💡 *Hama menyerang random setiap 30 menit. Beli pestisida di Shop!*`);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }

        // Show pests with option to use pesticide
        const plots = getPlots(guildId, userId);
        const pesticideCount = getItemCount(guildId, userId, 'pesticide');
        let desc = `**🐛 ${pests.length}/5 Hama Aktif:**\n\n`;
        pests.forEach((p, i) => {
            const pest = PEST_TYPES.find(pt => pt.id === p.pestId);
            const plot = plots.find(pl => pl.id === p.plotId);
            let cropName = '?';
            if (plot) {
                let crop = FARM_CROPS.find(c => c.id === plot.cropId);
                if (!crop) crop = PRESTIGE_CROPS.find(c => c.id === plot.cropId);
                if (crop) cropName = `${crop.emoji} ${crop.name}`;
            }
            desc += `> **${i+1}.** ${pest ? pest.emoji : '🐛'} **${pest ? pest.name : 'Unknown'}** → ${cropName}\n`;
            desc += `>   ⚠️ *${pest ? pest.desc : ''}*\n\n`;
        });
        desc += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        desc += `> 🧴 Pestisida: **${pesticideCount}** buah (basmi 1 hama per use)\n`;
        desc += `> 💡 *Klik tombol di bawah untuk basmi hama random*`;

        const embed = new EmbedBuilder().setColor('#E74C3C').setTitle('🐛 HAMA MENYERANG!')
            .setDescription(desc);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_usepest_${userId}`).setLabel(`🧴 Gunakan Pestisida (${pesticideCount})`).setStyle(ButtonStyle.Success).setDisabled(pesticideCount <= 0),
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === USE PESTICIDE (basmi 1 hama random) ===
    if (action === 'usepest') {
        const { getActivePests, PEST_TYPES, resolvePest } = require('./farmWeather');
        const { getItemCount, removeItem } = require('../database');
        const pests = getActivePests(guildId, userId);
        const pesticideCount = getItemCount(guildId, userId, 'pesticide');

        if (pests.length === 0) return interaction.reply({ content: '✅ Tidak ada hama!', flags: 1 << 6 });
        if (pesticideCount <= 0) return interaction.reply({ content: '❌ Pestisida habis! Beli di Shop.', flags: 1 << 6 });

        // Remove 1 pesticide
        removeItem(guildId, userId, 'pesticide', 1);

        // Pick random pest to remove (hoki-hokian!)
        const randomIndex = Math.floor(Math.random() * pests.length);
        const removedPest = pests[randomIndex];
        resolvePest(guildId, userId, removedPest.id);

        const pest = PEST_TYPES.find(pt => pt.id === removedPest.pestId);
        const plots = getPlots(guildId, userId);
        const plot = plots.find(pl => pl.id === removedPest.plotId);
        let cropName = 'tanaman';
        if (plot) {
            let crop = FARM_CROPS.find(c => c.id === plot.cropId);
            if (!crop) crop = PRESTIGE_CROPS.find(c => c.id === plot.cropId);
            if (crop) cropName = `${crop.emoji} ${crop.name}`;
        }

        const remaining = pests.length - 1;
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('🧴 Hama Dibasmi!')
            .setDescription(
                `${pest ? pest.emoji : '🐛'} **${pest ? pest.name : 'Hama'}** di ${cropName} berhasil dibasmi!\n\n` +
                `> 🧴 Sisa pestisida: **${pesticideCount - 1}**\n` +
                `> 🐛 Hama tersisa: **${remaining}**` +
                (remaining > 0 ? `\n\n⚠️ Masih ada ${remaining} hama lagi!` : '\n\n✅ Semua hama sudah dibasmi!')
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_pest_${userId}`).setLabel(`🧴 Pest${remaining > 0 ? ` (${remaining})` : ''}`).setStyle(remaining > 0 ? ButtonStyle.Danger : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === HARVEST ===
    if (action === 'harvest') {
        const plots = getPlots(guildId, userId);
        if (plots.length === 0) return interaction.reply({ content: '❌ Tidak ada tanaman!', ephemeral: true });
        
        // Get bonuses
        const weatherYieldMult = getWeatherYieldMultiplier();
        const weatherDeathChance = getWeatherDeathChance();
        const pet = getPetData(guildId, userId);
        let petFarmBonus = 0;
        if (pet) {
            const petDef = PET_DATA.find(p => p.id === pet.petId);
            if (petDef && (petDef.bonus.type === 'farm_yield' || petDef.bonus.type === 'all_reward')) {
                const lvlMult = PET_LEVEL_MULTIPLIERS[Math.min(pet.level, 30)] || 1.0;
                petFarmBonus = petDef.bonus.value * lvlMult;
            }
        }

        let harvested = 0, totalItems = 0, harvestDesc = '', harvestedLegendary = false;
        let mutationCount = 0, mutationDesc = '';

        for (const plot of plots) {
            let crop = FARM_CROPS.find(c => c.id === plot.cropId);
            if (!crop) crop = PRESTIGE_CROPS.find(c => c.id === plot.cropId);
            if (!crop) continue;
            const fert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer) || FARM_FERTILIZERS[0];
            const growTime = crop.time * (1 - fert.speedBonus) * 60000;
            
            if (Date.now() - plot.plantedAt >= growTime && plot.status !== 'dead') {
                // Weather death check (stormy/drought can kill at harvest)
                if (weatherDeathChance > 0 && Math.random() < weatherDeathChance) {
                    harvestDesc += `> ☠️ ~~${crop.emoji} ${crop.name}~~ — *mati karena cuaca!*\n`;
                    db.prepare('DELETE FROM farm_plots WHERE id = ?').run(plot.id);
                    continue;
                }

                // Calculate yield with all bonuses
                const rotationBonus = getRotationBonus(guildId, userId, plot.id, crop.id);
                const qty = calculateHarvestYield(crop, {
                    weatherYieldMult,
                    fertYieldBonus: fert.yieldBonus,
                    seedLevel: 0, // TODO: integrate seed upgrade per-plot
                    rotationBonus,
                    petFarmBonus
                });

                // Roll mutation!
                const mutation = rollMutation(guildId, userId, 0);
                
                addStorage(guildId, userId, crop.id, qty);
                if (crop.tier === 'Legendary') harvestedLegendary = true;

                if (mutation) {
                    // Mutation success! Add bonus money directly
                    const mutationMoney = crop.sellPrice * qty * mutation.multiplier;
                    db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(mutationMoney, guildId, userId);
                    addIncome(guildId, userId, 'farm_mutation', mutationMoney);
                    logMutation(guildId, userId, crop.id, mutation.id);
                    mutationCount++;
                    mutationDesc += `> ${mutation.emoji} **${mutation.prefix} ${crop.name}!** (+🪙 ${mutationMoney.toLocaleString('id-ID')})\n`;
                    harvestDesc += `> ${crop.emoji} ${crop.name} x${qty} ${mutation.emoji} **MUTASI!**\n`;
                } else {
                    harvestDesc += `> ${crop.emoji} ${crop.name} x${qty}${rotationBonus > 0 ? ' 🔄' : ''}\n`;
                }

                // Update rotation tracking
                updateRotation(guildId, userId, plot.id, crop.id);

                harvested++; totalItems += qty;
                db.prepare('DELETE FROM farm_plots WHERE id = ?').run(plot.id);
            }
        }
        
        const deadPlots = plots.filter(p => p.status === 'dead');
        let deadMsg = '';
        if (deadPlots.length > 0) {
            deleteDeadFarmPlots(guildId, userId);
            deadMsg = `\n🗑️ **${deadPlots.length} tanaman mati** dihapus.`;
        }
        if (harvested === 0 && deadPlots.length > 0) {
            const embed = new EmbedBuilder().setColor('#E74C3C').setTitle('🗑️ Tanaman Mati Dihapus')
                .setDescription(`**${deadPlots.length} tanaman mati** dihapus dari kebun.\nTidak ada yang siap dipanen.`);
            const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary));
            return interaction.update({ embeds: [embed], components: [backRow] });
        }
        if (harvested === 0) return interaction.reply({ content: '❌ Belum ada tanaman siap dipanen!', ephemeral: true });
        
        incrementUserStat(guildId, userId, 'total_harvests', harvested);
        updateQuestProgress(guildId, userId, 'farm_harvest', harvested);
        addPetExp(guildId, userId, 5);
        addComboFeature(guildId, userId, 'farming');
        await checkAchievements(interaction.guild, userId, { type: 'farm_harvest', legendary: harvestedLegendary });

        // Build result embed
        const weather = getTodayWeather();
        let resultDesc = `**${harvested} tanaman** (${totalItems} item):\n\n${harvestDesc}`;
        if (mutationCount > 0) {
            resultDesc += `\n✨ **MUTASI! (${mutationCount}x)**\n${mutationDesc}`;
        }
        resultDesc += deadMsg;
        resultDesc += `\n\n> ${weather.emoji} Cuaca: ${weather.name}`;
        if (petFarmBonus > 0) resultDesc += ` | 🐾 Pet: +${Math.floor(petFarmBonus)}%`;
        resultDesc += `\n> Hasil masuk ke Storage.`;

        const embed = new EmbedBuilder()
            .setColor(mutationCount > 0 ? '#FFD700' : '#2ECC71')
            .setTitle(mutationCount > 0 ? '🌾✨ Panen + MUTASI!' : '🌾 Panen Berhasil!')
            .setDescription(resultDesc);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }


    // === SHOP ===
    if (action === 'shop') {
        let desc = '━━━━━━━━━━━━━━━━━━━━━━\n**🌱 BIBIT TANAMAN**\n';
        const tiers = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
        for (const tier of tiers) {
            const crops = FARM_CROPS.filter(c => c.tier === tier);
            desc += `\n**${tier}:**\n`;
            crops.forEach(c => { desc += `> ${c.emoji} ${c.name} — 🪙 ${c.cost} | ${c.time}m\n`; });
        }
        // Prestige Crops section
        desc += `\n**🏆 Prestige** *(ultra-rare, long-grow)*:\n`;
        PRESTIGE_CROPS.forEach(c => { 
            const hours = Math.floor(c.time / 60);
            desc += `> ${c.emoji} **${c.name}** — 🪙 ${c.cost.toLocaleString('id-ID')} | ⏱️${hours}j | Jual: 🪙${c.sellPrice.toLocaleString('id-ID')}\n`; 
        });

        desc += '\n━━━━━━━━━━━━━━━━━━━━━━\n**🧪 PUPUK** *(masuk inventory)*\n\n';
        FARM_FERTILIZERS.filter(f => f.id !== 'none').forEach(f => { desc += `> ${f.emoji} **${f.name}** — 🪙 ${f.cost}\n>  ┗ ⏩ -${Math.round(f.speedBonus * 100)}% waktu${f.yieldBonus > 0 ? ` | 📈 +${Math.round(f.yieldBonus * 100)}% hasil` : ''}\n`; });
        if (desc.length > 4000) desc = desc.substring(0, 3990) + '...';

        const cropsPage1 = FARM_CROPS.filter(c => ['Common', 'Uncommon', 'Rare'].includes(c.tier));
        const cropsPage2 = FARM_CROPS.filter(c => ['Epic', 'Legendary'].includes(c.tier));
        const seedMenu1 = new StringSelectMenuBuilder().setCustomId(`farm_buyseed_${userId}`).setPlaceholder('🌱 Bibit Common/Uncommon/Rare...').setMinValues(1).setMaxValues(1);
        cropsPage1.slice(0, 25).forEach(c => seedMenu1.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${c.name} (🪙${c.cost})`).setValue(c.id).setDescription(`${c.tier} | ${c.time}m | Jual:🪙${c.sellPrice}`)));

        const components = [new ActionRowBuilder().addComponents(seedMenu1)];
        if (cropsPage2.length > 0) {
            const seedMenu2 = new StringSelectMenuBuilder().setCustomId(`farm_buyseed2_${userId}`).setPlaceholder('🌟 Bibit Epic/Legendary...').setMinValues(1).setMaxValues(1);
            cropsPage2.slice(0, 25).forEach(c => seedMenu2.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${c.name} (🪙${c.cost})`).setValue(c.id).setDescription(`${c.tier} | ${c.time}m | Jual:🪙${c.sellPrice}`)));
            components.push(new ActionRowBuilder().addComponents(seedMenu2));
        }
        // Prestige Crops menu
        if (PRESTIGE_CROPS.length > 0) {
            const prestigeMenu = new StringSelectMenuBuilder().setCustomId(`farm_buyprestige_${userId}`).setPlaceholder('🏆 Bibit Prestige (24-48 jam)...').setMinValues(1).setMaxValues(1);
            PRESTIGE_CROPS.forEach(c => {
                const hours = Math.floor(c.time / 60);
                prestigeMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${c.name} (🪙${c.cost.toLocaleString('id-ID')})`).setValue(c.id).setDescription(`🏆 Prestige | ${hours}j | Jual:🪙${c.sellPrice.toLocaleString('id-ID')}`));
            });
            components.push(new ActionRowBuilder().addComponents(prestigeMenu));
        }
        const fertMenu = new StringSelectMenuBuilder().setCustomId(`farm_buyfert_${userId}`).setPlaceholder('🧪 Beli Pupuk...').setMinValues(1).setMaxValues(1);
        FARM_FERTILIZERS.filter(f => f.id !== 'none').forEach(f => fertMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${f.name} (🪙${f.cost})`).setValue(f.id).setDescription(`-${Math.round(f.speedBonus * 100)}% waktu${f.yieldBonus > 0 ? ` | +${Math.round(f.yieldBonus * 100)}% hasil` : ''}`)));
        components.push(new ActionRowBuilder().addComponents(fertMenu));
        components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)));

        const embed = new EmbedBuilder().setTitle('🛒 Farm Shop').setColor('#2B2D31').setDescription(desc)
            .setFooter({ text: `💰 Saldo: ${userData.balance.toLocaleString('id-ID')}` });
        return interaction.update({ embeds: [embed], components });
    }


    // === STORAGE ===
    if (action === 'storage') {
        const storage = getStorage(guildId, userId);
        if (storage.length === 0) {
            const embed = new EmbedBuilder().setTitle('📦 Farm Storage').setColor('#2B2D31')
                .setDescription('Gudang kosong! Panen dulu.');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`farm_harvest_${userId}`).setLabel('🌾 Harvest').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }
        let desc = '', totalValue = 0;
        storage.forEach(s => {
            const crop = FARM_CROPS.find(c => c.id === s.itemId);
            const value = crop ? crop.sellPrice * s.quantity : 0;
            totalValue += value;
            desc += `> ${crop ? crop.emoji : '📦'} **${crop ? crop.name : s.itemId}** x${s.quantity} (🪙${value})\n`;
        });
        desc += `\n> 💰 **Total Nilai Jual:** 🪙 ${totalValue.toLocaleString('id-ID')}`;
        const embed = new EmbedBuilder().setTitle('📦 Farm Storage').setColor('#2B2D31').setDescription(desc);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_sellall_${userId}`).setLabel('💰 Sell All').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === SELL ALL ===
    if (action === 'sellall') {
        const storage = getStorage(guildId, userId);
        if (storage.length === 0) return interaction.reply({ content: '❌ Gudang kosong!', ephemeral: true });
        let totalMoney = 0, sellDesc = '';
        for (const s of storage) {
            const crop = FARM_CROPS.find(c => c.id === s.itemId);
            const price = crop ? crop.sellPrice * s.quantity : 0;
            totalMoney += price;
            sellDesc += `> ${crop ? crop.emoji : '📦'} ${crop ? crop.name : '?'} x${s.quantity} = 🪙 ${price}\n`;
        }
        addUserBalance(guildId, userId, totalMoney);
        clearFarmStorage(guildId, userId);
        addIncome(guildId, userId, 'farming', totalMoney);
        const freshData = getOrCreateUser(guildId, userId);
        const embed = new EmbedBuilder().setColor('#F1C40F').setTitle('💰 Hasil Terjual!')
            .setDescription(`${sellDesc}\n**Total: 🪙 ${totalMoney.toLocaleString('id-ID')}**\n> Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }


    // === CRAFT (gabungan tanaman + livestock) ===
    if (action === 'craft') {
        const ALL_CROPS = [...FARM_CROPS, ...PRESTIGE_CROPS];
        const { LIVESTOCK_RECIPES } = require('../data/livestock');
        const allRecipes = [...FARM_RECIPES, ...LIVESTOCK_RECIPES];

        const craftMenu = new StringSelectMenuBuilder().setCustomId(`farm_craftselect_${userId}`).setPlaceholder('🧪 Pilih resep...').setMinValues(1).setMaxValues(1);
        allRecipes.slice(0, 25).forEach(r => {
            const ingStr = r.ingredients.map(ing => { const c = ALL_CROPS.find(cr => cr.id === ing.id); return `${c ? c.emoji : '📦'}${ing.qty}`; }).join('+');
            let label = `${r.name} — 🪙${r.sellPrice.toLocaleString('id-ID')}`;
            if (label.length > 100) label = label.substring(0, 97) + '...';
            let desc = `Bahan: ${ingStr}`;
            if (desc.length > 100) desc = desc.substring(0, 97) + '...';
            craftMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(label).setValue(r.id).setDescription(desc));
        });

        const components = [new ActionRowBuilder().addComponents(craftMenu)];

        if (allRecipes.length > 25) {
            const craftMenu2 = new StringSelectMenuBuilder().setCustomId(`farm_craftselect2_${userId}`).setPlaceholder('🧪 Resep Lanjutan...').setMinValues(1).setMaxValues(1);
            allRecipes.slice(25).forEach(r => {
                let label = `${r.name} — 🪙${r.sellPrice.toLocaleString('id-ID')}`;
                if (label.length > 100) label = label.substring(0, 97) + '...';
                const ingStr = r.ingredients.map(ing => { const c = ALL_CROPS.find(cr => cr.id === ing.id); return `${c ? c.emoji : '📦'}${ing.qty}`; }).join('+');
                let desc = `Bahan: ${ingStr}`;
                if (desc.length > 100) desc = desc.substring(0, 97) + '...';
                craftMenu2.addOptions(new StringSelectMenuOptionBuilder().setLabel(label).setValue(r.id).setDescription(desc));
            });
            components.push(new ActionRowBuilder().addComponents(craftMenu2));
        }

        const embed = new EmbedBuilder().setTitle('🧪 Craft Resep').setColor('#9B59B6')
            .setDescription(`Pilih resep untuk craft (bahan diambil dari Storage):\n\n> 🌾 Tanaman: ${FARM_RECIPES.length} resep\n> 🐔🐄 Livestock: ${LIVESTOCK_RECIPES.length} resep`);
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_hub_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        ));
        return interaction.update({ embeds: [embed], components });
    }

    // === UPGRADE ===
    if (action === 'upgrade') {
        const farmData = getFarmData(guildId, userId);
        const nextLevel = FARM_LEVELS.find(l => l.level === farmData.farm_level + 1);
        if (!nextLevel) {
            const embed = new EmbedBuilder().setColor('#FFD700').setTitle('👑 Level MAX!')
                .setDescription('Lahan kamu sudah level maksimal!');
            const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary));
            return interaction.update({ embeds: [embed], components: [backRow] });
        }
        if (userData.balance < nextLevel.cost) {
            const embed = new EmbedBuilder().setColor('#E74C3C').setTitle('⬆️ Upgrade Lahan')
                .setDescription(`Butuh 🪙 **${nextLevel.cost.toLocaleString('id-ID')}** untuk upgrade ke:\n> ${nextLevel.name} (**${nextLevel.slots} slot**)\n\n❌ Saldo kurang! (🪙 ${userData.balance.toLocaleString('id-ID')})`);
            const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary));
            return interaction.update({ embeds: [embed], components: [backRow] });
        }
        subtractUserBalance(guildId, userId, nextLevel.cost);
        upgradeFarmLevel(guildId, userId, nextLevel.level);
        if (nextLevel.level === 6) await checkAchievements(interaction.guild, userId, { type: 'farm_upgrade_max' });
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('🎉 Lahan Di-Upgrade!')
            .setDescription(`> ${nextLevel.name} — **${nextLevel.slots} slot** tanam!`);
        const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary));
        return interaction.update({ embeds: [embed], components: [backRow] });
    }


    // === PUPUK (show mode selection: single or all) ===
    if (action === 'pupuk') {
        const plots = getPlots(guildId, userId);
        const unfertilized = plots.filter(p => p.fertilizer === 'none' && p.status !== 'dead');
        if (unfertilized.length === 0) {
            return interaction.reply({ content: '❌ Tidak ada tanaman yang bisa dipupuk! Semua sudah dipupuk, mati, atau kebun kosong.', ephemeral: true });
        }
        const ownedFerts = getAllFerts(guildId, userId);
        if (ownedFerts.length === 0) {
            const embed = new EmbedBuilder().setTitle('🧫 Pupuk Tanaman').setColor('#E74C3C')
                .setDescription('❌ Tidak punya pupuk! Beli dulu di 🛒 Shop.');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`farm_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }

        let plotList = '';
        unfertilized.forEach((p, i) => {
            const crop = FARM_CROPS.find(c => c.id === p.cropId);
            plotList += `> [${plots.indexOf(p) + 1}] ${crop ? crop.emoji + ' ' + crop.name : '?'}\n`;
        });
        const embed = new EmbedBuilder().setTitle('🧫 Pupuk Tanaman').setColor('#F39C12')
            .setDescription(`**Pupuk yang dimiliki:**\n${ownedFerts.map(inv => { const f = FARM_FERTILIZERS.find(fe => fe.id === inv.fertId); return f ? `> ${f.emoji} ${f.name} x**${inv.quantity}**` : ''; }).filter(Boolean).join('\n')}\n\n**Tanaman yang bisa dipupuk (${unfertilized.length}):**\n${plotList}\n━━━━━━━━━━━━━━━━━━\n**Pilih mode pupuk:**`);
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_pupuk_single_${userId}`).setLabel('🌱 Satu Per Satu').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`farm_pupuk_all_${userId}`).setLabel('🌾 Semua Sekaligus').setStyle(ButtonStyle.Success)
        );
        const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary));
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }

    // === DECO (Farm Decorations) ===
    if (action === 'deco') {
        const ownedDecos = getFarmDecorations(guildId, userId);
        const ownedIds = ownedDecos.map(d => d.decoId);

        let desc = '**🎨 DEKORASI KEBUN**\n\n';
        if (ownedIds.length > 0) {
            desc += '**Milik kamu:**\n';
            ownedIds.forEach(id => {
                const deco = FARM_DECORATIONS.find(d => d.id === id);
                if (deco) desc += `> ${deco.emoji} ${deco.name} — *${deco.desc}*\n`;
            });
            desc += '\n';
        }
        desc += '**🛒 Shop Dekorasi:**\n';
        FARM_DECORATIONS.forEach(deco => {
            const owned = ownedIds.includes(deco.id);
            desc += `> ${owned ? '✅' : '🏷️'} ${deco.emoji} **${deco.name}** — 🪙 ${deco.price.toLocaleString('id-ID')}\n>  ┗ *${deco.desc}*${owned ? ' *(owned)*' : ''}\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle(`🎨 Decorations — ${interaction.user.username}`)
            .setColor('#E91E63')
            .setDescription(desc)
            .setFooter({ text: `💰 Saldo: ${userData.balance.toLocaleString('id-ID')} | Pilih dekorasi untuk beli` });

        const components = [];
        const buyable = FARM_DECORATIONS.filter(d => !ownedIds.includes(d.id));
        if (buyable.length > 0) {
            const decoMenu = new StringSelectMenuBuilder()
                .setCustomId(`farm_buydeco_${userId}`)
                .setPlaceholder('🎨 Beli dekorasi...')
                .setMinValues(1).setMaxValues(1);
            buyable.forEach(deco => {
                decoMenu.addOptions(new StringSelectMenuOptionBuilder()
                    .setLabel(`${deco.name} (🪙${deco.price.toLocaleString('id-ID')})`)
                    .setValue(deco.id)
                    .setDescription(deco.desc.substring(0, 50)));
            });
            components.push(new ActionRowBuilder().addComponents(decoMenu));
        }
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        ));
        return interaction.update({ embeds: [embed], components });
    }

    return null;
}


// ============ HANDLER: Farm panel select menus ============
async function handleFarmSelectMenu(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel farm kamu!', ephemeral: true });
    }

    // === LIVESTOCK CRAFT SELECT MENU (hub craft) ===
    const { isLivestockSelectMenu, handleLivestockSelectMenu } = require('./livestockPanel');
    if (isLivestockSelectMenu(customId)) {
        return handleLivestockSelectMenu(interaction);
    }

    const userData = getOrCreateUser(guildId, userId);

    // === PLANT SEED SELECT ===
    if (customId.startsWith('farm_plantseed_')) {
        const cropId = interaction.values[0];
        // Check both normal crops AND prestige crops
        let crop = FARM_CROPS.find(c => c.id === cropId);
        if (!crop) crop = PRESTIGE_CROPS.find(c => c.id === cropId);
        if (!crop) return interaction.reply({ content: '❌ Bibit tidak ditemukan!', ephemeral: true });
        const owned = getSeedCount(guildId, userId, cropId);
        if (owned <= 0) return interaction.reply({ content: `❌ Kamu tidak punya bibit **${crop.emoji} ${crop.name}**!`, ephemeral: true });
        const maxSlots = getFarmSlots(guildId, userId);
        const plots = getPlots(guildId, userId);
        if (plots.length >= maxSlots) return interaction.reply({ content: '❌ Lahan penuh!', ephemeral: true });
        removeSeed(guildId, userId, cropId, 1);
        insertFarmPlot(guildId, userId, cropId, Date.now(), Date.now());
        const sisa = getSeedCount(guildId, userId, cropId);
        const timeDisplay = crop.time >= 60 ? `${Math.floor(crop.time / 60)} jam ${crop.time % 60 > 0 ? crop.time % 60 + ' menit' : ''}` : `${crop.time} menit`;
        const isPrestige = crop.tier === 'Prestige';
        const embed = new EmbedBuilder().setColor(isPrestige ? '#FFD700' : '#2ECC71').setTitle(`🌱 ${crop.emoji} ${crop.name} Ditanam!${isPrestige ? ' 🏆' : ''}`)
            .setDescription(`> Siap panen dalam **${timeDisplay}**\n> 📦 Sisa bibit: **${sisa}**${isPrestige ? '\n\n> 🏆 *Prestige crop — jaga siram agar tidak mati!*' : ''}`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_plant_${userId}`).setLabel('🌱 Tanam Lagi').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    // === BUY SEED (shows quantity modal) ===
    if (customId.startsWith('farm_buyseed_') || customId.startsWith('farm_buyseed2_')) {
        const cropId = interaction.values[0];
        const crop = FARM_CROPS.find(c => c.id === cropId);
        if (!crop) return interaction.reply({ content: '❌ Bibit tidak ditemukan!', ephemeral: true });
        const modal = new ModalBuilder().setCustomId(`farm_seedqty_${cropId}_${userId}`).setTitle(`Beli ${crop.emoji} ${crop.name}`);
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('farm_seed_qty_input').setLabel(`Berapa bibit? (🪙${crop.cost}/bibit)`).setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(3).setPlaceholder('Contoh: 10')
        ));
        return interaction.showModal(modal);
    }

    // === BUY PRESTIGE CROP (1 bibit per pembelian, langsung beli) ===
    if (customId.startsWith('farm_buyprestige_')) {
        const cropId = interaction.values[0];
        const crop = PRESTIGE_CROPS.find(c => c.id === cropId);
        if (!crop) return interaction.reply({ content: '❌ Bibit prestige tidak ditemukan!', ephemeral: true });
        const userData = getOrCreateUser(guildId, userId);
        if (userData.balance < crop.cost) {
            return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 ${crop.cost.toLocaleString('id-ID')} (punya: 🪙 ${userData.balance.toLocaleString('id-ID')})`, ephemeral: true });
        }
        // Deduct money & add seed
        subtractUserBalance(guildId, userId, crop.cost);
        addSeed(guildId, userId, crop.id, 1);
        incrementUserStat(guildId, userId, 'total_buys');
        const hours = Math.floor(crop.time / 60);
        const embed = new EmbedBuilder().setColor('#FFD700').setTitle('🏆 Prestige Seed Purchased!')
            .setDescription(`${crop.emoji} **${crop.name}** x1 dibeli!\n\n> 💰 Harga: 🪙 ${crop.cost.toLocaleString('id-ID')}\n> ⏱️ Grow time: **${hours} jam**\n> 💵 Sell: 🪙 **${crop.sellPrice.toLocaleString('id-ID')}**\n\n> Tanam lewat 🌱 Plant!`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }


    // === BUY FERTILIZER — show qty modal (like seeds) ===
    if (customId.startsWith('farm_buyfert_')) {
        const fertId = interaction.values[0];
        const fert = FARM_FERTILIZERS.find(f => f.id === fertId);
        if (!fert) return interaction.reply({ content: '❌ Pupuk tidak ditemukan!', ephemeral: true });
        const modal = new ModalBuilder().setCustomId(`farm_fertqty_${fertId}_${userId}`).setTitle(`Beli ${fert.emoji} ${fert.name}`);
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('farm_fert_qty_input').setLabel(`Berapa? (🪙${fert.cost}/pupuk)`).setStyle(TextInputStyle.Short).setRequired(true).setMinLength(1).setMaxLength(3).setPlaceholder('Contoh: 5')
        ));
        return interaction.showModal(modal);
    }

    // === PUPUK FERTILIZER SELECT (from inventory) - Single mode ===
    if (customId.startsWith('farm_pupukfert_') && !customId.includes('_all_')) {
        const fertId = interaction.values[0];
        const fert = FARM_FERTILIZERS.find(f => f.id === fertId);
        if (!fert) return interaction.reply({ content: '❌ Pupuk tidak ditemukan!', ephemeral: true });
        const owned = getFertCount(guildId, userId, fertId);
        if (owned <= 0) return interaction.reply({ content: `❌ Kamu tidak punya ${fert.emoji} **${fert.name}**! Beli dulu di Shop.`, ephemeral: true });
        // Show plot select menu
        const plots = getPlots(guildId, userId);
        const unfertilized = plots.filter(p => p.fertilizer === 'none' && p.status !== 'dead');
        if (unfertilized.length === 0) return interaction.reply({ content: '❌ Tidak ada tanaman yang bisa dipupuk!', ephemeral: true });
        const plotMenu = new StringSelectMenuBuilder().setCustomId(`farm_pupukplot_${fertId}_${userId}`).setPlaceholder('🌱 Pilih tanaman...').setMinValues(1).setMaxValues(1);
        unfertilized.forEach(p => {
            const crop = FARM_CROPS.find(c => c.id === p.cropId);
            const slotNum = plots.indexOf(p) + 1;
            plotMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`[Slot ${slotNum}] ${crop ? crop.name : '?'}`).setValue(String(p.id)).setDescription(`${crop ? crop.emoji + ' ' + crop.tier : ''}`));
        });
        const embed = new EmbedBuilder().setTitle(`🧫 Pilih Tanaman untuk ${fert.emoji} ${fert.name}`).setColor('#F39C12')
            .setDescription(`📦 Stok: **${owned}** | -${Math.round(fert.speedBonus * 100)}% waktu${fert.yieldBonus > 0 ? ` | +${Math.round(fert.yieldBonus * 100)}% hasil` : ''}`);
        const row1 = new ActionRowBuilder().addComponents(plotMenu);
        const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`farm_pupuk_single_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary));
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }

    // === PUPUK FERTILIZER SELECT (from inventory) - All mode ===
    if (customId.startsWith('farm_pupukfert_all_')) {
        const fertId = interaction.values[0];
        const fert = FARM_FERTILIZERS.find(f => f.id === fertId);
        if (!fert) return interaction.reply({ content: '❌ Pupuk tidak ditemukan!', ephemeral: true });
        const owned = getFertCount(guildId, userId, fertId);
        if (owned <= 0) return interaction.reply({ content: `❌ Kamu tidak punya ${fert.emoji} **${fert.name}**! Beli dulu di Shop.`, ephemeral: true });

        const plots = getPlots(guildId, userId);
        const unfertilized = plots.filter(p => p.fertilizer === 'none' && p.status !== 'dead');
        if (unfertilized.length === 0) return interaction.reply({ content: '❌ Tidak ada tanaman yang bisa dipupuk!', ephemeral: true });

        const canApply = Math.min(owned, unfertilized.length);
        const willNotApply = unfertilized.length - canApply;

        // Apply fertilizer to all fertilizable plants
        for (let i = 0; i < canApply; i++) {
            const plot = unfertilized[i];
            db.prepare('UPDATE farm_plots SET fertilizer = ? WHERE id = ?').run(fertId, plot.id);
        }
        removeFert(guildId, userId, fertId, canApply);

        let resultDesc = `✅ **${canApply} tanaman** berhasil dipupuk dengan ${fert.emoji} **${fert.name}**!\n`;
        resultDesc += `> ⏩ -${Math.round(fert.speedBonus * 100)}% waktu${fert.yieldBonus > 0 ? ` | +${Math.round(fert.yieldBonus * 100)}% hasil` : ''}\n`;
        if (willNotApply > 0) {
            resultDesc += `> ⚠️ **${willNotApply} tanaman** tidak bisa dipupuk (kurang stok)\n`;
        }
        const remaining = getFertCount(guildId, userId, fertId);
        resultDesc += `> 📦 Sisa stok: **${remaining}**`;

        const embed = new EmbedBuilder().setColor('#1ABC9C').setTitle('✅ Pupuk Diterapkan ke Semua!')
            .setDescription(resultDesc);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_pupuk_${userId}`).setLabel('🧫 Pupuk Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }


    // === PUPUK PLOT SELECT (apply fertilizer from inventory to specific plot) ===
    if (customId.startsWith('farm_pupukplot_')) {
        // customId: farm_pupukplot_{fertId}_{userId} — fertId can have underscores!
        const withoutPrefix = customId.replace('farm_pupukplot_', '');
        const lastUnderscore = withoutPrefix.lastIndexOf('_');
        const fertId = withoutPrefix.substring(0, lastUnderscore);
        const plotId = parseInt(interaction.values[0]);
        const fert = FARM_FERTILIZERS.find(f => f.id === fertId);
        if (!fert) return interaction.reply({ content: '❌ Pupuk tidak ditemukan!', ephemeral: true });
        const owned = getFertCount(guildId, userId, fertId);
        if (owned <= 0) return interaction.reply({ content: `❌ Stok ${fert.emoji} **${fert.name}** habis! Beli lagi di Shop.`, ephemeral: true });
        const plot = getFarmPlot(guildId, userId, plotId);
        if (!plot) return interaction.reply({ content: '❌ Tanaman tidak ditemukan!', ephemeral: true });
        if (plot.fertilizer !== 'none') return interaction.reply({ content: '❌ Tanaman ini sudah dipupuk!', ephemeral: true });
        removeFert(guildId, userId, fertId, 1);
        db.prepare('UPDATE farm_plots SET fertilizer = ? WHERE id = ?').run(fertId, plot.id);
        const crop = FARM_CROPS.find(c => c.id === plot.cropId);
        const remaining = getFertCount(guildId, userId, fertId);
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('✅ Pupuk Diterapkan!')
            .setDescription(`${fert.emoji} **${fert.name}** → ${crop ? crop.emoji + ' ' + crop.name : 'tanaman'}\n> ⏩ -${Math.round(fert.speedBonus * 100)}% waktu${fert.yieldBonus > 0 ? ` | +${Math.round(fert.yieldBonus * 100)}% hasil` : ''}\n> 📦 Sisa stok: **${remaining}**`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_pupuk_${userId}`).setLabel('🧫 Pupuk Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    // === CRAFT SELECT ===
    if (customId.startsWith('farm_craftselect_') || customId.startsWith('farm_craftselect2_')) {
        const recipeId = interaction.values[0];
        const { LIVESTOCK_RECIPES } = require('../data/livestock');
        const allRecipes = [...FARM_RECIPES, ...LIVESTOCK_RECIPES];
        const recipe = allRecipes.find(r => r.id === recipeId);
        if (!recipe) return interaction.reply({ content: '❌ Resep tidak ditemukan!', ephemeral: true });
        const ALL_CROPS = [...FARM_CROPS, ...PRESTIGE_CROPS];
        const missing = [];
        for (const ing of recipe.ingredients) {
            let have = 0;
            if (ing.source === 'livestock') {
                // Livestock product: format "egg_normal", "milk_premium", etc.
                const lastUnderscore = ing.id.lastIndexOf('_');
                const productId = ing.id.substring(0, lastUnderscore);
                const quality = ing.id.substring(lastUnderscore + 1);
                const { getProductCount } = require('./livestock');
                have = getProductCount(userId, productId, quality);
            } else {
                have = getStorageQty(guildId, userId, ing.id);
            }
            if (have < ing.qty) {
                const crop = ALL_CROPS.find(c => c.id === ing.id);
                missing.push(`> ${crop ? crop.emoji : '📦'} **${crop ? crop.name : ing.id}** — butuh ${ing.qty}, punya ${have}`);
            }
        }
        if (missing.length > 0) {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#E74C3C').setTitle(`❌ Bahan Kurang: ${recipe.emoji} ${recipe.name}`).setDescription(`**Kurang:**\n${missing.join('\n')}`)], flags: 1 << 6 });
        }
        // Deduct ingredients
        for (const ing of recipe.ingredients) {
            if (ing.source === 'livestock') {
                const lastUnderscore = ing.id.lastIndexOf('_');
                const productId = ing.id.substring(0, lastUnderscore);
                const quality = ing.id.substring(lastUnderscore + 1);
                db.prepare('UPDATE livestock_products SET quantity = quantity - ? WHERE userId = ? AND productId = ? AND quality = ?').run(ing.qty, userId, productId, quality);
            } else {
                removeStorage(guildId, userId, ing.id, ing.qty);
            }
        }
        addUserBalance(guildId, userId, recipe.sellPrice);
        incrementUserStat(guildId, userId, 'total_crafts');
        addIncome(guildId, userId, 'farming', recipe.sellPrice);
        updateQuestProgress(guildId, userId, 'craft', 1);
        addComboFeature(guildId, userId, 'farming');
        await checkAchievements(interaction.guild, userId, { type: 'farm_craft' });
        const freshData = getOrCreateUser(guildId, userId);
        const ingredients = recipe.ingredients.map(ing => { const c = ALL_CROPS.find(cr => cr.id === ing.id); return `${c ? c.emoji : '📦'} ${c ? c.name : ing.id} x${ing.qty}`; }).join(' + ');
        const embed = new EmbedBuilder().setColor('#9B59B6').setTitle(`${recipe.emoji} ${recipe.name} Crafted!`)
            .setDescription(`> Bahan: ${ingredients}\n> 💰 Dijual: 🪙 **${recipe.sellPrice.toLocaleString('id-ID')}**\n> Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_craft_${userId}`).setLabel('🧪 Craft Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`farm_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    // === BUY DECORATION ===
    if (customId.startsWith('farm_buydeco_')) {
        const decoId = interaction.values[0];
        const deco = FARM_DECORATIONS.find(d => d.id === decoId);
        if (!deco) return interaction.reply({ content: '❌ Dekorasi tidak ditemukan!', ephemeral: true });
        // Check if already owned
        const existing = hasFarmDecoration(guildId, userId, decoId);
        if (existing) return interaction.reply({ content: `❌ Kamu sudah punya ${deco.emoji} **${deco.name}**!`, ephemeral: true });
        if (userData.balance < deco.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${deco.price.toLocaleString('id-ID')}**`, ephemeral: true });
        subtractUserBalance(guildId, userId, deco.price);
        addFarmDecoration(guildId, userId, decoId);
        const freshData = getOrCreateUser(guildId, userId);
        const embed = new EmbedBuilder().setColor('#E91E63').setTitle('🎨 Dekorasi Dibeli!')
            .setDescription(`${deco.emoji} **${deco.name}**\n> *${deco.desc}*\n\n> 💰 Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**\n> Dekorasi akan muncul di header Farm Panel!`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_deco_${userId}`).setLabel('🎨 Deco Shop').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    return null;
}


// ============ HANDLER: Farm panel modals ============
async function handleFarmModal(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;

    // === SEED QUANTITY MODAL ===
    if (customId.startsWith('farm_seedqty_')) {
        const remaining = customId.replace('farm_seedqty_', '');
        const lastUnderscore = remaining.lastIndexOf('_');
        const cropId = remaining.substring(0, lastUnderscore);
        const userId = remaining.substring(lastUnderscore + 1);
        if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan milikmu!', ephemeral: true });
        const crop = FARM_CROPS.find(c => c.id === cropId);
        if (!crop) return interaction.reply({ content: '❌ Bibit tidak ditemukan!', ephemeral: true });
        const input = interaction.fields.getTextInputValue('farm_seed_qty_input');
        const qty = parseInt(input);
        if (isNaN(qty) || qty < 1 || qty > 999) return interaction.reply({ content: '❌ Masukkan angka valid (1-999)!', ephemeral: true });
        const totalCost = crop.cost * qty;
        const userData = getOrCreateUser(guildId, userId);
        if (userData.balance < totalCost) {
            const affordable = Math.floor(userData.balance / crop.cost);
            return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${totalCost.toLocaleString('id-ID')}** untuk ${qty} bibit.\n> Mampu beli **${affordable}** bibit.`, ephemeral: true });
        }
        subtractUserBalance(guildId, userId, totalCost);
        addSeed(guildId, userId, cropId, qty);
        const owned = getSeedCount(guildId, userId, cropId);
        const panel = buildFarmPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    // === FERTILIZER QUANTITY MODAL ===
    if (customId.startsWith('farm_fertqty_')) {
        const remaining = customId.replace('farm_fertqty_', '');
        const lastUnderscore = remaining.lastIndexOf('_');
        const fertId = remaining.substring(0, lastUnderscore);
        const userId = remaining.substring(lastUnderscore + 1);
        if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan milikmu!', ephemeral: true });
        const fert = FARM_FERTILIZERS.find(f => f.id === fertId);
        if (!fert) return interaction.reply({ content: '❌ Pupuk tidak ditemukan!', ephemeral: true });
        const input = interaction.fields.getTextInputValue('farm_fert_qty_input');
        const qty = parseInt(input);
        if (isNaN(qty) || qty < 1 || qty > 999) return interaction.reply({ content: '❌ Masukkan angka valid (1-999)!', ephemeral: true });
        const totalCost = fert.cost * qty;
        const userData = getOrCreateUser(guildId, userId);
        if (userData.balance < totalCost) {
            const affordable = Math.floor(userData.balance / fert.cost);
            return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${totalCost.toLocaleString('id-ID')}** untuk ${qty} pupuk.\n> Mampu beli **${affordable}** pupuk.`, ephemeral: true });
        }
        subtractUserBalance(guildId, userId, totalCost);
        addFert(guildId, userId, fertId, qty);
        const owned = getFertCount(guildId, userId, fertId);
        return interaction.reply({ content: `✅ Membeli ${fert.emoji} **${fert.name}** x**${qty}**!\n> 💰 Total: 🪙 **${totalCost.toLocaleString('id-ID')}**\n> 📦 Stok pupuk: **${owned}**\n> 💡 Pakai lewat \`/farm\` → 🧪 Pupuk`, ephemeral: false });
    }

    return null;
}

// ============ UTILITY: Detection helpers ============
function isFarmPanelButton(customId) {
    return customId.startsWith('farm_') && 
           !customId.includes('plantseed_') && 
           !customId.includes('buyseed') && 
           !customId.includes('buyfert_') && 
           !customId.includes('pupukfert_') && 
           !customId.includes('pupukplot_') && 
           !customId.includes('craftselect_') && 
           !customId.includes('buydeco_');
}

function isFarmPanelSelectMenu(customId) {
    return customId.startsWith('farm_plantseed_') || customId.startsWith('farm_buyseed') ||
           customId.startsWith('farm_buyfert_') || customId.startsWith('farm_buyprestige_') ||
           customId.startsWith('farm_pupukfert_') || customId.startsWith('farm_pupukplot_') ||
           customId.startsWith('farm_craftselect') || customId.startsWith('farm_hubcraft') ||
           customId.startsWith('farm_buydeco_');
}

function isFarmPanelModal(customId) {
    return customId.startsWith('farm_seedqty_') || customId.startsWith('farm_fertqty_');
}

module.exports = {
    buildFarmPanel,
    buildFarmHub,
    handleFarmCommand,
    handleFarmButton,
    handleFarmSelectMenu,
    handleFarmModal,
    isFarmPanelButton,
    isFarmPanelSelectMenu,
    isFarmPanelModal
};
