// systems/farmPanel.js - Farm Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser, getUserStat, incrementUserStat, getSeedCount, addSeed, removeSeed, getAllSeeds } = require('../database');
const { getRandomInt } = require('../utils');
const { getFarmData, getFarmSlots, getPlots, getStorage, addStorage, removeStorage, getStorageQty } = require('./farming');
const { updateQuestProgress } = require('./quests');
const { checkAchievements } = require('./achievements');
const { addComboFeature } = require('./combo');
const { addPetExp } = require('../systems/pets');
const { FARM_LEVELS, FARM_CROPS, FARM_RECIPES, FARM_FERTILIZERS } = require('../data/farming');
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

    let plotStatus = '';
    if (plots.length === 0) {
        plotStatus = '*Kebun kosong! Tanam bibit untuk mulai.*';
    } else {
        plots.forEach((plot, i) => {
            const crop = FARM_CROPS.find(c => c.id === plot.cropId);
            if (!crop) return;
            const fert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer) || FARM_FERTILIZERS[0];
            const growTime = crop.time * (1 - fert.speedBonus) * 60000;
            const elapsed = Date.now() - plot.plantedAt;
            const dryTime = Date.now() - plot.wateredAt;
            const deadThreshold = growTime * 2.5;
            let status = '';
            if (plot.status === 'dead' || dryTime > deadThreshold) { status = '☠️'; if (plot.status !== 'dead') db.prepare('UPDATE farm_plots SET status = ? WHERE id = ?').run('dead', plot.id); }
            else if (elapsed >= growTime) status = '✅';
            else if (dryTime > growTime * 1.5) status = '🥀';
            else if ((Date.now() - plot.wateredAt) > growTime * 0.6) status = '💧';
            else { const pct = Math.min(100, Math.floor((elapsed / growTime) * 100)); status = `${pct}%`; }
            plotStatus += `[${i + 1}]${crop.emoji}${status} `;
            if ((i + 1) % 4 === 0) plotStatus += '\n';
        });
    }

    const embed = new EmbedBuilder()
        .setTitle(`🌾 FARM PANEL — ${username}`)
        .setColor('#2ECC71')
        .setDescription(
            `🏡 Level: **${levelInfo.name}** | Slots: **${plots.length}/${maxSlots}**\n` +
            `📦 Storage: **${storageCount} items** | 💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n\n` +
            `${plotStatus}`
        )
        .setFooter({ text: '✅=Panen | 💧=Siram | 🥀=Layu | ☠️=Mati' });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_plant_${userId}`).setLabel('🌱 Plant').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_water_${userId}`).setLabel('💧 Water').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_harvest_${userId}`).setLabel('🌾 Harvest').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_storage_${userId}`).setLabel('📦 Storage').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_craft_${userId}`).setLabel('🧪 Craft').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_upgrade_${userId}`).setLabel('⬆️ Upgrade').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_pupuk_${userId}`).setLabel('🧫 Pupuk').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row1, row2] };
}


// ============ HANDLER: /farm command (show main panel) ============
async function handleFarmCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const panel = buildFarmPanel(guildId, userId, interaction.user.username);
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

    const action = parts[1];
    const userData = getOrCreateUser(guildId, userId);

    // === BACK TO MAIN PANEL ===
    if (action === 'back') {
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
            const c = FARM_CROPS.find(cr => cr.id === inv.cropId);
            if (!c) return;
            seedMenu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`${c.name} (x${inv.quantity}) — ${c.tier} | ${c.time}m`)
                .setValue(c.id).setDescription(`Jual: 🪙${c.sellPrice} | Yield: ${c.minYield}-${c.maxYield}`));
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

    // === HARVEST ===
    if (action === 'harvest') {
        const plots = getPlots(guildId, userId);
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
                addStorage(guildId, userId, crop.id, qty);
                harvestDesc += `> ${crop.emoji} ${crop.name} x${qty}\n`;
                harvested++; totalItems += qty;
                db.prepare('DELETE FROM farm_plots WHERE id = ?').run(plot.id);
            }
        }
        const deadPlots = plots.filter(p => p.status === 'dead');
        let deadMsg = '';
        if (deadPlots.length > 0) {
            db.prepare("DELETE FROM farm_plots WHERE guildId = ? AND userId = ? AND status = 'dead'").run(guildId, userId);
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
        await checkAchievements(interaction.guild, userId, { type: 'farm_harvest', legendary: harvestDesc.includes('Legendary') });
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('🌾 Panen Berhasil!')
            .setDescription(`**${harvested} tanaman** (${totalItems} item):\n\n${harvestDesc}${deadMsg}\n> Hasil masuk ke Storage.`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }


    // === SHOP ===
    if (action === 'shop') {
        let desc = '**🌱 BIBIT** *(pilih di menu bawah)*\n';
        const tiers = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
        for (const tier of tiers) {
            const crops = FARM_CROPS.filter(c => c.tier === tier);
            desc += `> **${tier}:** ${crops.map(c => `${c.emoji}${c.name}(🪙${c.cost})`).join(', ')}\n`;
        }
        desc += '\n**🧪 PUPUK**\n';
        FARM_FERTILIZERS.filter(f => f.id !== 'none').forEach(f => { desc += `> ${f.emoji} ${f.name} 🪙${f.cost} | -${Math.round(f.speedBonus * 100)}%${f.yieldBonus > 0 ? ` +${Math.round(f.yieldBonus * 100)}%` : ''}\n`; });
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
        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(totalMoney, guildId, userId);
        db.prepare('DELETE FROM farm_storage WHERE guildId = ? AND userId = ?').run(guildId, userId);
        const freshData = getOrCreateUser(guildId, userId);
        const embed = new EmbedBuilder().setColor('#F1C40F').setTitle('💰 Hasil Terjual!')
            .setDescription(`${sellDesc}\n**Total: 🪙 ${totalMoney.toLocaleString('id-ID')}**\n> Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }


    // === CRAFT ===
    if (action === 'craft') {
        const craftMenu = new StringSelectMenuBuilder().setCustomId(`farm_craftselect_${userId}`).setPlaceholder('🧪 Pilih resep...').setMinValues(1).setMaxValues(1);
        FARM_RECIPES.forEach(r => {
            const ingStr = r.ingredients.map(ing => { const c = FARM_CROPS.find(cr => cr.id === ing.id); return `${c ? c.emoji : ''}${ing.qty}`; }).join('+');
            let label = `${r.name} (${ingStr}) — 🪙${r.sellPrice}`;
            if (label.length > 100) label = label.substring(0, 97) + '...';
            craftMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(label).setValue(r.id).setDescription(`Jual: 🪙${r.sellPrice}`));
        });
        const embed = new EmbedBuilder().setTitle('🧪 Craft Resep').setColor('#9B59B6')
            .setDescription('Pilih resep untuk craft (bahan diambil dari Storage):');
        const row1 = new ActionRowBuilder().addComponents(craftMenu);
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row1, row2] });
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
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(nextLevel.cost, guildId, userId);
        db.prepare('UPDATE farm_data SET farm_level = ? WHERE guildId = ? AND userId = ?').run(nextLevel.level, guildId, userId);
        if (nextLevel.level === 6) await checkAchievements(interaction.guild, userId, { type: 'farm_upgrade_max' });
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('🎉 Lahan Di-Upgrade!')
            .setDescription(`> ${nextLevel.name} — **${nextLevel.slots} slot** tanam!`);
        const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary));
        return interaction.update({ embeds: [embed], components: [backRow] });
    }


    // === PUPUK (select fertilizer menu) ===
    if (action === 'pupuk') {
        const plots = getPlots(guildId, userId);
        const unfertilized = plots.filter(p => p.fertilizer === 'none' && p.status !== 'dead');
        if (unfertilized.length === 0) {
            return interaction.reply({ content: '❌ Tidak ada tanaman yang bisa dipupuk! Semua sudah dipupuk, mati, atau kebun kosong.', ephemeral: true });
        }
        const fertMenu = new StringSelectMenuBuilder().setCustomId(`farm_pupukfert_${userId}`).setPlaceholder('🧫 Pilih pupuk...').setMinValues(1).setMaxValues(1);
        FARM_FERTILIZERS.filter(f => f.id !== 'none').forEach(f => {
            fertMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${f.name} (🪙${f.cost})`).setValue(f.id).setDescription(`-${Math.round(f.speedBonus * 100)}% waktu${f.yieldBonus > 0 ? ` | +${Math.round(f.yieldBonus * 100)}% hasil` : ''}`));
        });
        let plotList = '';
        unfertilized.forEach((p, i) => {
            const crop = FARM_CROPS.find(c => c.id === p.cropId);
            plotList += `> [${plots.indexOf(p) + 1}] ${crop ? crop.emoji + ' ' + crop.name : '?'}\n`;
        });
        const embed = new EmbedBuilder().setTitle('🧫 Pupuk Tanaman').setColor('#F39C12')
            .setDescription(`**Tanaman yang bisa dipupuk:**\n${plotList}\nPilih pupuk dulu, lalu pilih tanaman:`);
        const row1 = new ActionRowBuilder().addComponents(fertMenu);
        const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary));
        return interaction.update({ embeds: [embed], components: [row1, row2] });
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

    const userData = getOrCreateUser(guildId, userId);

    // === PLANT SEED SELECT ===
    if (customId.startsWith('farm_plantseed_')) {
        const cropId = interaction.values[0];
        const crop = FARM_CROPS.find(c => c.id === cropId);
        if (!crop) return interaction.reply({ content: '❌ Bibit tidak ditemukan!', ephemeral: true });
        const owned = getSeedCount(guildId, userId, cropId);
        if (owned <= 0) return interaction.reply({ content: `❌ Kamu tidak punya bibit **${crop.emoji} ${crop.name}**!`, ephemeral: true });
        const maxSlots = getFarmSlots(guildId, userId);
        const plots = getPlots(guildId, userId);
        if (plots.length >= maxSlots) return interaction.reply({ content: '❌ Lahan penuh!', ephemeral: true });
        removeSeed(guildId, userId, cropId, 1);
        db.prepare('INSERT INTO farm_plots (guildId, userId, cropId, plantedAt, wateredAt) VALUES (?, ?, ?, ?, ?)').run(guildId, userId, cropId, Date.now(), Date.now());
        const sisa = getSeedCount(guildId, userId, cropId);
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle(`🌱 ${crop.emoji} ${crop.name} Ditanam!`)
            .setDescription(`> Siap panen dalam **${crop.time} menit**\n> 📦 Sisa bibit: **${sisa}**`);
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


    // === BUY FERTILIZER ===
    if (customId.startsWith('farm_buyfert_')) {
        const fertId = interaction.values[0];
        const fert = FARM_FERTILIZERS.find(f => f.id === fertId);
        if (!fert) return interaction.reply({ content: '❌ Pupuk tidak ditemukan!', ephemeral: true });
        if (userData.balance < fert.cost) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${fert.cost}**`, ephemeral: true });
        const plot = db.prepare("SELECT * FROM farm_plots WHERE guildId = ? AND userId = ? AND fertilizer = 'none' AND status != 'dead' ORDER BY plantedAt ASC LIMIT 1").get(guildId, userId);
        if (!plot) return interaction.reply({ content: '❌ Tidak ada tanaman yang bisa dipupuk!', ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(fert.cost, guildId, userId);
        db.prepare('UPDATE farm_plots SET fertilizer = ? WHERE id = ?').run(fertId, plot.id);
        const crop = FARM_CROPS.find(c => c.id === plot.cropId);
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('✅ Pupuk Diterapkan!')
            .setDescription(`${fert.emoji} **${fert.name}** → ${crop ? crop.emoji + ' ' + crop.name : 'tanaman'}\n> ⏩ -${Math.round(fert.speedBonus * 100)}% waktu${fert.yieldBonus > 0 ? ` | +${Math.round(fert.yieldBonus * 100)}% hasil` : ''}`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    // === PUPUK FERTILIZER SELECT ===
    if (customId.startsWith('farm_pupukfert_')) {
        const fertId = interaction.values[0];
        const fert = FARM_FERTILIZERS.find(f => f.id === fertId);
        if (!fert) return interaction.reply({ content: '❌ Pupuk tidak ditemukan!', ephemeral: true });
        if (userData.balance < fert.cost) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${fert.cost}**`, ephemeral: true });
        // Show plot select menu
        const plots = getPlots(guildId, userId);
        const unfertilized = plots.filter(p => p.fertilizer === 'none' && p.status !== 'dead');
        if (unfertilized.length === 0) return interaction.reply({ content: '❌ Tidak ada tanaman yang bisa dipupuk!', ephemeral: true });
        const plotMenu = new StringSelectMenuBuilder().setCustomId(`farm_pupukplot_${fertId}_${userId}`).setPlaceholder('🌱 Pilih tanaman...').setMinValues(1).setMaxValues(1);
        unfertilized.forEach(p => {
            const crop = FARM_CROPS.find(c => c.id === p.cropId);
            const slotNum = plots.indexOf(p) + 1;
            plotMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`[Slot ${slotNum}] ${crop ? crop.name : '?'}`).setValue(p.id.toString()).setDescription(crop ? `${crop.tier} | ${crop.time}m` : ''));
        });
        const embed = new EmbedBuilder().setTitle(`🧫 Pilih Tanaman untuk ${fert.emoji} ${fert.name}`).setColor('#F39C12')
            .setDescription(`Harga: 🪙 **${fert.cost}** | -${Math.round(fert.speedBonus * 100)}% waktu`);
        const row1 = new ActionRowBuilder().addComponents(plotMenu);
        const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary));
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }


    // === PUPUK PLOT SELECT (apply fertilizer to specific plot) ===
    if (customId.startsWith('farm_pupukplot_')) {
        const fertId = parts[2];
        const plotId = parseInt(interaction.values[0]);
        const fert = FARM_FERTILIZERS.find(f => f.id === fertId);
        if (!fert) return interaction.reply({ content: '❌ Pupuk tidak ditemukan!', ephemeral: true });
        if (userData.balance < fert.cost) return interaction.reply({ content: `❌ Saldo kurang!`, ephemeral: true });
        const plot = db.prepare('SELECT * FROM farm_plots WHERE id = ? AND guildId = ? AND userId = ?').get(plotId, guildId, userId);
        if (!plot) return interaction.reply({ content: '❌ Tanaman tidak ditemukan!', ephemeral: true });
        if (plot.fertilizer !== 'none') return interaction.reply({ content: '❌ Tanaman ini sudah dipupuk!', ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(fert.cost, guildId, userId);
        db.prepare('UPDATE farm_plots SET fertilizer = ? WHERE id = ?').run(fertId, plot.id);
        const crop = FARM_CROPS.find(c => c.id === plot.cropId);
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('✅ Pupuk Diterapkan!')
            .setDescription(`${fert.emoji} **${fert.name}** → ${crop ? crop.emoji + ' ' + crop.name : 'tanaman'}\n> ⏩ -${Math.round(fert.speedBonus * 100)}% waktu${fert.yieldBonus > 0 ? ` | +${Math.round(fert.yieldBonus * 100)}% hasil` : ''}`);
        const backRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`farm_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary));
        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    // === CRAFT SELECT ===
    if (customId.startsWith('farm_craftselect_')) {
        const recipeId = interaction.values[0];
        const recipe = FARM_RECIPES.find(r => r.id === recipeId);
        if (!recipe) return interaction.reply({ content: '❌ Resep tidak ditemukan!', ephemeral: true });
        const missing = [];
        for (const ing of recipe.ingredients) {
            const have = getStorageQty(guildId, userId, ing.id);
            if (have < ing.qty) { const crop = FARM_CROPS.find(c => c.id === ing.id); missing.push(`> ${crop ? crop.emoji : '📦'} **${crop ? crop.name : ing.id}** — butuh ${ing.qty}, punya ${have}`); }
        }
        if (missing.length > 0) {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#E74C3C').setTitle(`❌ Bahan Kurang: ${recipe.emoji} ${recipe.name}`).setDescription(`**Kurang:**\n${missing.join('\n')}`)], ephemeral: true });
        }
        for (const ing of recipe.ingredients) { removeStorage(guildId, userId, ing.id, ing.qty); }
        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(recipe.sellPrice, guildId, userId);
        incrementUserStat(guildId, userId, 'total_crafts');
        updateQuestProgress(guildId, userId, 'craft', 1);
        addComboFeature(guildId, userId, 'farming');
        await checkAchievements(interaction.guild, userId, { type: 'farm_craft' });
        const freshData = getOrCreateUser(guildId, userId);
        const ingredients = recipe.ingredients.map(ing => { const c = FARM_CROPS.find(cr => cr.id === ing.id); return `${c ? c.emoji : '📦'} ${c ? c.name : ing.id} x${ing.qty}`; }).join(' + ');
        const embed = new EmbedBuilder().setColor('#9B59B6').setTitle(`${recipe.emoji} ${recipe.name} Crafted!`)
            .setDescription(`> Bahan: ${ingredients}\n> 💰 Dijual: 🪙 **${recipe.sellPrice.toLocaleString('id-ID')}**\n> Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_craft_${userId}`).setLabel('🧪 Craft Lagi').setStyle(ButtonStyle.Primary),
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
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(totalCost, guildId, userId);
        addSeed(guildId, userId, cropId, qty);
        const owned = getSeedCount(guildId, userId, cropId);
        const panel = buildFarmPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    return null;
}

// ============ UTILITY: Detection helpers ============
function isFarmPanelButton(customId) {
    return customId.startsWith('farm_');
}

function isFarmPanelSelectMenu(customId) {
    return customId.startsWith('farm_plantseed_') || customId.startsWith('farm_buyseed') ||
           customId.startsWith('farm_buyfert_') || customId.startsWith('farm_pupukfert_') ||
           customId.startsWith('farm_pupukplot_') || customId.startsWith('farm_craftselect_');
}

function isFarmPanelModal(customId) {
    return customId.startsWith('farm_seedqty_');
}

module.exports = {
    buildFarmPanel,
    handleFarmCommand,
    handleFarmButton,
    handleFarmSelectMenu,
    handleFarmModal,
    isFarmPanelButton,
    isFarmPanelSelectMenu,
    isFarmPanelModal
};
