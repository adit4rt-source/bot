// systems/livestockPanel.js — Livestock Panel UI (Kandang Ayam, Peternakan, Crafting)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getItemCount } = require('../database');
const { ANIMALS, COOP_LEVELS, BARN_LEVELS, EVOLUTION_TIERS, PRODUCT_QUALITY, COOP_SHOP, BARN_SHOP, LIVESTOCK_RECIPES } = require('../data/livestock');
const { FARM_RECIPES } = require('../data/farming');
const { getCoopLevel, getBarnLevel, getCoopSlots, getBarnSlots, getAnimals, collectProducts, feedAnimals, sellAllProducts, getProductInventory } = require('./livestock');
const { getSeasonDisplay, getSeasonProductionMultiplier } = require('./farmSeason');

// ============ BUILD: Coop Panel (Kandang Ayam) ============
function buildCoopPanel(userId, username) {
    const season = getSeasonDisplay();
    const userData = getOrCreateUser(null, userId);
    const coopLvl = getCoopLevel(userId);
    const coopInfo = COOP_LEVELS.find(l => l.level === coopLvl);
    const maxSlots = getCoopSlots(userId);
    const chickens = getAnimals(userId, 'chicken').filter(a => a.status !== 'dead');
    const sickCount = chickens.filter(a => a.status === 'sick').length;
    const prodMult = getSeasonProductionMultiplier('chicken');

    // Count ready animals
    const now = Date.now();
    let totalReady = 0;
    let animalList = '';
    chickens.forEach((chicken, i) => {
        const { getProduceTime } = require('../data/livestock');
        const produceTime = getProduceTime('chicken', chicken.level, chicken.tier) / prodMult;
        const elapsed = now - (chicken.lastCollect || chicken.createdAt);
        const isReady = elapsed >= produceTime;
        if (isReady) totalReady++;

        const tierEmoji = chicken.tier > 0 ? ' ' + '⭐'.repeat(Math.min(chicken.tier, 5)) + (chicken.tier > 5 ? `+${chicken.tier - 5}` : '') : '';

        if (chicken.status === 'sick') {
            animalList += `\`[${i + 1}]\` 🐔 **Ayam** Lv.${chicken.level}${tierEmoji} 🤒\n ┗ ❌ \`░░░░░░░░░░\` SAKIT!\n`;
        } else if (isReady) {
            animalList += `\`[${i + 1}]\` 🐔 **Ayam** Lv.${chicken.level}${tierEmoji}\n ┗ 🥚 \`▰▰▰▰▰▰▰▰▰▰\` Ready!\n`;
        } else {
            const percent = Math.min(99, Math.floor((elapsed / produceTime) * 100));
            const filled = Math.floor(percent / 10);
            const bar = '▰'.repeat(filled) + '░'.repeat(10 - filled);
            const remainMin = Math.max(1, Math.ceil((produceTime - elapsed) / 60000));
            animalList += `\`[${i + 1}]\` 🐔 **Ayam** Lv.${chicken.level}${tierEmoji}\n ┗ ⏳ \`${bar}\` ${percent}% (${remainMin}m)\n`;
        }
    });

    if (chickens.length === 0) animalList = '> *Belum punya ayam. Beli di Shop!*\n';

    const embed = new EmbedBuilder()
        .setTitle(`🐔 KANDANG AYAM — ${username}`)
        .setColor(totalReady > 0 ? '#FFD700' : '#FFA500')
        .setDescription(
            `🏠 **${coopInfo.name}** (Lv.${coopLvl}) | ${season.emoji} ${season.name}\n` +
            `> 🐔 Ayam: **${chickens.length}**/${maxSlots} | 🥚 Siap: **${totalReady}**\n` +
            `> 📈 Produksi: **${Math.round(prodMult * 100)}%** | 💰 🪙 **${userData.balance.toLocaleString('id-ID')}**\n` +
            (sickCount > 0 ? `> ⚠️ **${sickCount} ayam sakit!** Beri obat segera.\n` : '') +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📋 **Daftar Ayam:**\n` +
            animalList
        )
        .setFooter({ text: `🥚 Ready | ⏳ Growing | 🤒 Sakit | ⭐ Tier Evo | 🔄 Refresh` });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_coop_collect_${userId}`).setLabel(`🥚 Collect (${totalReady})`).setStyle(ButtonStyle.Primary).setDisabled(totalReady === 0),
        new ButtonBuilder().setCustomId(`farm_coop_feed_${userId}`).setLabel('🌾 Feed All').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_coop_heal_${userId}`).setLabel(`💊 Heal${sickCount > 0 ? ` (${sickCount})` : ''}`).setStyle(sickCount > 0 ? ButtonStyle.Danger : ButtonStyle.Secondary).setDisabled(sickCount === 0),
        new ButtonBuilder().setCustomId(`farm_coop_evolve_${userId}`).setLabel('⬆️ Evolve').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_coop_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_coop_sell_${userId}`).setLabel('💰 Sell Products').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_coop_upgrade_${userId}`).setLabel('⬆️ Upgrade Kandang').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_coop_refresh_${userId}`).setLabel('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2] };
}

// ============ BUILD: Barn Panel (Peternakan - Sapi & Domba) ============
function buildBarnPanel(userId, username) {
    const season = getSeasonDisplay();
    const userData = getOrCreateUser(null, userId);
    const barnLvl = getBarnLevel(userId);
    const barnInfo = BARN_LEVELS.find(l => l.level === barnLvl);
    const maxSlots = getBarnSlots(userId);
    const cows = getAnimals(userId, 'cow').filter(a => a.status !== 'dead');
    const sheep = getAnimals(userId, 'sheep').filter(a => a.status !== 'dead');
    const totalAnimals = cows.length + sheep.length;
    const sickCows = cows.filter(a => a.status === 'sick').length;
    const sickSheep = sheep.filter(a => a.status === 'sick').length;
    const totalSick = sickCows + sickSheep;
    const cowProd = getSeasonProductionMultiplier('cow');
    const sheepProd = getSeasonProductionMultiplier('sheep');

    const now = Date.now();
    let totalMilk = 0, totalWool = 0;

    let cowList = '';
    cows.forEach((cow, i) => {
        const { getProduceTime } = require('../data/livestock');
        const produceTime = getProduceTime('cow', cow.level, cow.tier) / cowProd;
        const elapsed = now - (cow.lastCollect || cow.createdAt);
        const isReady = elapsed >= produceTime;
        if (isReady) totalMilk++;
        const tierInfo = cow.tier > 0 ? ` ${'⭐'.repeat(Math.min(cow.tier, 3))}${cow.tier > 3 ? `+${cow.tier - 3}` : ''}` : '';
        const statusIcon = cow.status === 'sick' ? ' 🤒' : isReady ? ' ✅' : '';
        const timeLeft = isReady ? '' : ` (${Math.ceil((produceTime - elapsed) / 60000)}m)`;
        cowList += `> \`[${i + 1}]\` 🐄 Lv.${cow.level}${tierInfo} — ${isReady ? '🥛 Ready!' : `⏳${timeLeft}`}${statusIcon}\n`;
    });

    let sheepList = '';
    sheep.forEach((s, i) => {
        const { getProduceTime } = require('../data/livestock');
        const produceTime = getProduceTime('sheep', s.level, s.tier) / sheepProd;
        const elapsed = now - (s.lastCollect || s.createdAt);
        const isReady = elapsed >= produceTime;
        if (isReady) totalWool++;
        const tierInfo = s.tier > 0 ? ` ${'⭐'.repeat(Math.min(s.tier, 3))}${s.tier > 3 ? `+${s.tier - 3}` : ''}` : '';
        const statusIcon = s.status === 'sick' ? ' 🤒' : isReady ? ' ✅' : '';
        const timeLeft = isReady ? '' : ` (${Math.ceil((produceTime - elapsed) / 60000)}m)`;
        sheepList += `> \`[${i + 1}]\` 🐑 Lv.${s.level}${tierInfo} — ${isReady ? '🧶 Ready!' : `⏳${timeLeft}`}${statusIcon}\n`;
    });

    if (cows.length === 0) cowList = '> *Belum punya sapi*\n';
    if (sheep.length === 0) sheepList = '> *Belum punya domba*\n';

    const embed = new EmbedBuilder()
        .setTitle(`🐄 PETERNAKAN — ${username}`)
        .setColor('#8B4513')
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🏠 **${barnInfo.name}** (Lv.${barnLvl}) | ${season.emoji} ${season.name}\n` +
            `> 🐄 Sapi: **${cows.length}** | 🐑 Domba: **${sheep.length}** (Total: ${totalAnimals}/${maxSlots})\n` +
            `> 🥛 Susu siap: **${totalMilk}** | 🧶 Bulu siap: **${totalWool}**\n` +
            (totalSick > 0 ? `> 🤒 Sakit: **${totalSick}** hewan\n` : '') +
            `> 💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📋 **Sapi:**\n${cowList}\n` +
            `📋 **Domba:**\n${sheepList}`
        )
        .setFooter({ text: `Produksi: 5-20 menit (tergantung level/evo) | Feed setiap hari` });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_barn_milk_${userId}`).setLabel(`🥛 Milk (${totalMilk})`).setStyle(ButtonStyle.Primary).setDisabled(totalMilk === 0),
        new ButtonBuilder().setCustomId(`farm_barn_shear_${userId}`).setLabel(`🧶 Shear (${totalWool})`).setStyle(ButtonStyle.Primary).setDisabled(totalWool === 0),
        new ButtonBuilder().setCustomId(`farm_barn_feed_${userId}`).setLabel('🌾 Feed All').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_barn_heal_${userId}`).setLabel(`💊 Heal${totalSick > 0 ? ` (${totalSick})` : ''}`).setStyle(totalSick > 0 ? ButtonStyle.Danger : ButtonStyle.Secondary).setDisabled(totalSick === 0)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_barn_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_barn_sell_${userId}`).setLabel('💰 Sell Products').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_barn_upgrade_${userId}`).setLabel('⬆️ Upgrade Kandang').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_barn_refresh_${userId}`).setLabel('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2] };
}

// ============ BUILD: Crafting Panel (simple — just route to farm craft) ============
function buildCraftingPanel(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);
    const { FARM_RECIPES } = require('../data/farming');

    const embed = new EmbedBuilder()
        .setTitle(`🧪 CRAFTING HUB — ${username}`)
        .setColor('#9B59B6')
        .setDescription(
            `💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n\n` +
            `📋 **${FARM_RECIPES.length} resep tersedia**\n\n` +
            `> 🌾 Tanaman: 36 resep\n` +
            `> 🐔🐄 Livestock: 15 resep baru\n\n` +
            `Klik **🧪 Craft** untuk membuka menu resep.\n` +
            `Bahan diambil dari **Storage** (panen + produk ternak).`
        )
        .setFooter({ text: 'Produk ternak (telur/susu/bulu) otomatis masuk Storage saat collect' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_craft_${userId}`).setLabel('🧪 Craft').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

// ============ BUILD: Storage Hub (all items from farm_storage) ============
function buildStorageHub(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);
    const { getStorage } = require('./farming');
    const { FARM_CROPS } = require('../data/farming');
    const PRESTIGE_CROPS = (() => { try { const { PRESTIGE_CROPS: PC } = require('./farmMutation'); return PC || []; } catch(e) { return []; } })();
    const ALL_CROPS = [...FARM_CROPS, ...PRESTIGE_CROPS];

    const storage = getStorage(guildId, userId);
    const totalItems = storage.reduce((sum, s) => sum + s.quantity, 0);

    // Separate farm items vs livestock products (livestock starts with egg_, milk_, wool_)
    const isLivestockProduct = (id) => id && (id.startsWith('egg_') || id.startsWith('milk_') || id.startsWith('wool_'));
    const farmItems = storage.filter(s => s.itemId && !isLivestockProduct(s.itemId));
    const livestockItems = storage.filter(s => s.itemId && isLivestockProduct(s.itemId));

    let desc = `💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n\n`;

    desc += `**🌾 Hasil Panen** (${farmItems.reduce((s, i) => s + i.quantity, 0)} items):\n`;
    if (farmItems.length === 0) {
        desc += `> *Kosong*\n`;
    } else {
        farmItems.slice(0, 8).forEach(s => {
            const crop = ALL_CROPS.find(c => c.id === s.itemId);
            if (crop) desc += `> ${crop.emoji} **${crop.name}** × ${s.quantity}\n`;
            else desc += `> 📦 ${s.itemId} × ${s.quantity}\n`;
        });
        if (farmItems.length > 8) desc += `> *...+${farmItems.length - 8} lainnya*\n`;
    }

    desc += `\n**🥚🥛🧶 Produk Ternak** (${livestockItems.reduce((s, i) => s + i.quantity, 0)} items):\n`;
    if (livestockItems.length === 0) {
        desc += `> *Kosong — collect dari hewan dulu!*\n`;
    } else {
        livestockItems.slice(0, 8).forEach(s => {
            const name = s.itemId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            desc += `> 📦 **${name}** × ${s.quantity}\n`;
        });
        if (livestockItems.length > 8) desc += `> *...+${livestockItems.length - 8} lainnya*\n`;
    }

    const embed = new EmbedBuilder()
        .setTitle(`📦 STORAGE HUB — ${username}`)
        .setColor('#E67E22')
        .setDescription(desc)
        .setFooter({ text: `Total: ${totalItems} items | Sell All untuk jual semua` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_storage_${userId}`).setLabel('💰 Sell Panen').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

// ============ HANDLER: Livestock button clicks (called from farmPanel) ============
async function handleLivestockButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    const { buyAnimal, upgradeCoopLevel, upgradeBarnLevel, collectProducts, feedAnimals, healAll, sellAllProducts, getProductInventory } = require('./livestock');

    // === COOP ACTIONS ===
    if (customId === `farm_coop_${userId}` || customId === `farm_coop_refresh_${userId}`) {
        return interaction.update(buildCoopPanel(userId, interaction.user.username));
    }
    if (customId === `farm_coop_collect_${userId}`) {
        const result = collectProducts(userId, 'chicken');
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        await interaction.reply({ content: `🥚 Collected **${result.totalCollected}** telur! (+${result.totalExp} EXP)`, ephemeral: true });
        return;
    }
    if (customId === `farm_coop_feed_${userId}`) {
        const result = feedAnimals(userId, 'chicken');
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return interaction.reply({ content: `🌾 Berhasil memberi makan **${result.fed}** ayam! (Pakan: -${result.feedUsed})`, ephemeral: true });
    }
    if (customId === `farm_coop_heal_${userId}`) {
        const result = healAll(userId, 'chicken');
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return interaction.reply({ content: `💊 Berhasil menyembuhkan **${result.healed}** ayam!`, ephemeral: true });
    }
    if (customId === `farm_coop_sell_${userId}`) {
        const result = sellAllProducts(userId);
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return interaction.reply({ content: `💰 Semua produk terjual! Pendapatan: 🪙 **${result.totalPrice.toLocaleString('id-ID')}**`, ephemeral: true });
    }
    if (customId === `farm_coop_upgrade_${userId}`) {
        const result = upgradeCoopLevel(userId);
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return interaction.reply({ content: `⬆️ Kandang Ayam upgraded ke **${result.name}** (Lv.${result.newLevel})! Slots: ${result.slots}`, ephemeral: true });
    }
    if (customId === `farm_coop_shop_${userId}`) {
        // Show full coop shop
        const { COOP_SHOP } = require('../data/livestock');
        const userData2 = getOrCreateUser(null, userId);
        let desc = `💰 Saldo: 🪙 **${userData2.balance.toLocaleString('id-ID')}**\n\n`;
        COOP_SHOP.forEach(item => { desc += `> ${item.name} — 🪙 ${item.price.toLocaleString('id-ID')}\n>  ┗ *${item.desc}*\n`; });
        const embed = new EmbedBuilder().setTitle('🛒 Shop Kandang Ayam').setColor('#FFA500').setDescription(desc);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_coop_buyhen_${userId}`).setLabel('🐔 Ayam (3,000)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`farm_coop_buyfeed_${userId}`).setLabel('🌾 Pakan x10 (600)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`farm_coop_buymeds_${userId}`).setLabel('💊 Obat (250)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`farm_coop_buypremium_${userId}`).setLabel('⭐ Premium (1,200)').setStyle(ButtonStyle.Secondary)
        );
        const row2x = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_coop_buyfeedbulk_${userId}`).setLabel('🌾 Pakan x50 (2,500)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`farm_coop_${userId}`).setLabel('🔙 Back').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row, row2x] });
    }
    if (customId === `farm_coop_buyhen_${userId}`) {
        const result = buyAnimal(userId, 'chicken');
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return interaction.reply({ content: `🐔 Berhasil beli ayam! (-🪙 ${result.price.toLocaleString('id-ID')})`, ephemeral: true });
    }
    if (customId === `farm_coop_buyfeed_${userId}`) {
        const user = getOrCreateUser(null, userId);
        if (user.balance < 600) return interaction.reply({ content: '❌ Saldo kurang!', ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - 600 WHERE userId = ?').run(userId);
        const { addItem: addI } = require('../database');
        addI(null, userId, 'chicken_feed', 10);
        return interaction.reply({ content: '🌾 Beli Pakan Ayam x10! (-🪙 600)', ephemeral: true });
    }
    if (customId === `farm_coop_buyfeedbulk_${userId}`) {
        const user = getOrCreateUser(null, userId);
        if (user.balance < 2500) return interaction.reply({ content: '❌ Saldo kurang!', ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - 2500 WHERE userId = ?').run(userId);
        const { addItem: addI } = require('../database');
        addI(null, userId, 'chicken_feed', 50);
        return interaction.reply({ content: '🌾 Beli Pakan Ayam x50! (-🪙 2,500)', ephemeral: true });
    }
    if (customId === `farm_coop_buymeds_${userId}`) {
        const user = getOrCreateUser(null, userId);
        if (user.balance < 250) return interaction.reply({ content: '❌ Saldo kurang!', ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - 250 WHERE userId = ?').run(userId);
        const { addItem: addI } = require('../database');
        addI(null, userId, 'chicken_medicine', 1);
        return interaction.reply({ content: '💊 Beli Obat Ayam x1! (-🪙 250)', ephemeral: true });
    }
    if (customId === `farm_coop_buypremium_${userId}`) {
        const user = getOrCreateUser(null, userId);
        if (user.balance < 1200) return interaction.reply({ content: '❌ Saldo kurang!', ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - 1200 WHERE userId = ?').run(userId);
        const { addItem: addI } = require('../database');
        addI(null, userId, 'premium_feed', 1);
        return interaction.reply({ content: '⭐ Beli Pakan Premium x1! (-🪙 1,200)', ephemeral: true });
    }

    // === BARN ACTIONS ===
    if (customId === `farm_barn_${userId}` || customId === `farm_barn_refresh_${userId}`) {
        return interaction.update(buildBarnPanel(userId, interaction.user.username));
    }
    if (customId === `farm_barn_milk_${userId}`) {
        const result = collectProducts(userId, 'cow');
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return interaction.reply({ content: `🥛 Collected **${result.totalCollected}** susu! (+${result.totalExp} EXP)`, ephemeral: true });
    }
    if (customId === `farm_barn_shear_${userId}`) {
        const result = collectProducts(userId, 'sheep');
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return interaction.reply({ content: `🧶 Collected **${result.totalCollected}** bulu! (+${result.totalExp} EXP)`, ephemeral: true });
    }
    if (customId === `farm_barn_feed_${userId}`) {
        const cowResult = feedAnimals(userId, 'cow');
        const sheepResult = feedAnimals(userId, 'sheep');
        const msgs = [];
        if (cowResult.success) msgs.push(`🐄 Fed ${cowResult.fed} sapi`);
        if (sheepResult.success) msgs.push(`🐑 Fed ${sheepResult.fed} domba`);
        if (msgs.length === 0) return interaction.reply({ content: `❌ ${cowResult.error || sheepResult.error || 'Tidak ada hewan!'}`, ephemeral: true });
        return interaction.reply({ content: `🌾 ${msgs.join(' | ')}`, ephemeral: true });
    }
    if (customId === `farm_barn_heal_${userId}`) {
        const cowResult = healAll(userId, 'cow');
        const sheepResult = healAll(userId, 'sheep');
        const healed = (cowResult.healed || 0) + (sheepResult.healed || 0);
        if (healed === 0) return interaction.reply({ content: `❌ Tidak ada hewan sakit!`, ephemeral: true });
        return interaction.reply({ content: `💊 Menyembuhkan **${healed}** hewan!`, ephemeral: true });
    }
    if (customId === `farm_barn_sell_${userId}`) {
        const result = sellAllProducts(userId);
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return interaction.reply({ content: `💰 Semua produk terjual! 🪙 **${result.totalPrice.toLocaleString('id-ID')}**`, ephemeral: true });
    }
    if (customId === `farm_barn_upgrade_${userId}`) {
        const result = upgradeBarnLevel(userId);
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return interaction.reply({ content: `⬆️ Peternakan upgraded ke **${result.name}** (Lv.${result.newLevel})! Slots: ${result.slots}`, ephemeral: true });
    }
    if (customId === `farm_barn_shop_${userId}`) {
        // Show full barn shop
        const { BARN_SHOP } = require('../data/livestock');
        const userData2 = getOrCreateUser(null, userId);
        let desc = `💰 Saldo: 🪙 **${userData2.balance.toLocaleString('id-ID')}**\n\n`;
        BARN_SHOP.forEach(item => { desc += `> ${item.name} — 🪙 ${item.price.toLocaleString('id-ID')}\n>  ┗ *${item.desc}*\n`; });
        const embed = new EmbedBuilder().setTitle('🛒 Shop Peternakan').setColor('#8B4513').setDescription(desc);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_barn_buycow_${userId}`).setLabel('🐄 Sapi (10,000)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`farm_barn_buysheep_${userId}`).setLabel('🐑 Domba (8,000)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`farm_barn_buycowfeed_${userId}`).setLabel('🌾 Pakan Sapi x10 (900)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`farm_barn_buysheepfeed_${userId}`).setLabel('🌾 Pakan Domba x10 (700)').setStyle(ButtonStyle.Success)
        );
        const row2x = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_barn_buycowmeds_${userId}`).setLabel('💊 Obat Sapi (400)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`farm_barn_buysheepmeds_${userId}`).setLabel('💊 Obat Domba (350)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`farm_barn_buypremium_${userId}`).setLabel('⭐ Premium (1,200)').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`farm_barn_${userId}`).setLabel('🔙 Back').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row, row2x] });
    }
    if (customId === `farm_barn_buycow_${userId}`) {
        const result = buyAnimal(userId, 'cow');
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return interaction.reply({ content: `🐄 Berhasil beli sapi! (-🪙 ${result.price.toLocaleString('id-ID')})`, ephemeral: true });
    }
    if (customId === `farm_barn_buysheep_${userId}`) {
        const result = buyAnimal(userId, 'sheep');
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return interaction.reply({ content: `🐑 Berhasil beli domba! (-🪙 ${result.price.toLocaleString('id-ID')})`, ephemeral: true });
    }
    if (customId === `farm_barn_buycowfeed_${userId}`) {
        const user = getOrCreateUser(null, userId);
        if (user.balance < 900) return interaction.reply({ content: '❌ Saldo kurang!', ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - 900 WHERE userId = ?').run(userId);
        const { addItem: addI } = require('../database');
        addI(null, userId, 'cow_feed', 10);
        return interaction.reply({ content: '🌾 Beli Pakan Sapi x10! (-🪙 900)', ephemeral: true });
    }
    if (customId === `farm_barn_buysheepfeed_${userId}`) {
        const user = getOrCreateUser(null, userId);
        if (user.balance < 700) return interaction.reply({ content: '❌ Saldo kurang!', ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - 700 WHERE userId = ?').run(userId);
        const { addItem: addI } = require('../database');
        addI(null, userId, 'sheep_feed', 10);
        return interaction.reply({ content: '🌾 Beli Pakan Domba x10! (-🪙 700)', ephemeral: true });
    }
    if (customId === `farm_barn_buycowmeds_${userId}`) {
        const user = getOrCreateUser(null, userId);
        if (user.balance < 400) return interaction.reply({ content: '❌ Saldo kurang!', ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - 400 WHERE userId = ?').run(userId);
        const { addItem: addI } = require('../database');
        addI(null, userId, 'cow_medicine', 1);
        return interaction.reply({ content: '💊 Beli Obat Sapi x1! (-🪙 400)', ephemeral: true });
    }
    if (customId === `farm_barn_buysheepmeds_${userId}`) {
        const user = getOrCreateUser(null, userId);
        if (user.balance < 350) return interaction.reply({ content: '❌ Saldo kurang!', ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - 350 WHERE userId = ?').run(userId);
        const { addItem: addI } = require('../database');
        addI(null, userId, 'sheep_medicine', 1);
        return interaction.reply({ content: '💊 Beli Obat Domba x1! (-🪙 350)', ephemeral: true });
    }
    if (customId === `farm_barn_buypremium_${userId}`) {
        const user = getOrCreateUser(null, userId);
        if (user.balance < 1200) return interaction.reply({ content: '❌ Saldo kurang!', ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - 1200 WHERE userId = ?').run(userId);
        const { addItem: addI } = require('../database');
        addI(null, userId, 'premium_feed', 1);
        return interaction.reply({ content: '⭐ Beli Pakan Premium x1! (-🪙 1,200)', ephemeral: true });
    }

    // === CRAFTING SELL ALL PRODUCTS ===
    if (customId === `farm_craft_sellall_${userId}`) {
        const { sellAllProducts: sellLP } = require('./livestock');
        const result = sellLP(userId);
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return interaction.reply({ content: `💰 Semua produk ternak terjual! 🪙 **${result.totalPrice.toLocaleString('id-ID')}**`, ephemeral: true });
    }

    // === CRAFTING PRODUCTS VIEW ===
    if (customId === `farm_craft_products_${userId}`) {
        const products = getProductInventory(userId);
        let desc = '';
        if (products.length === 0) {
            desc = '*Belum ada produk. Collect dari hewan dulu!*';
        } else {
            for (const p of products) {
                const qualityData = PRODUCT_QUALITY[p.productId]?.find(q => q.quality === p.quality);
                if (qualityData) {
                    desc += `> ${qualityData.name} × **${p.quantity}** (🪙 ${qualityData.price}/pc)\n`;
                }
            }
        }
        const embed = new EmbedBuilder()
            .setTitle('📦 Livestock Products')
            .setColor('#9B59B6')
            .setDescription(desc || '*Kosong*')
            .setFooter({ text: 'Products dijual via "Sell Products" di panel kandang' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_allcraft_${userId}`).setLabel('🔙 Back').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === STORAGE HUB: Sell ALL (farm + livestock) ===
    if (customId === `farm_allstorage_sellall_${userId}`) {
        const { getStorage, removeStorage } = require('./farming');
        const { FARM_CROPS } = require('../data/farming');
        const PRESTIGE_CROPS = (() => { try { const { PRESTIGE_CROPS: PC } = require('./farmMutation'); return PC || []; } catch(e) { return []; } })();
        const ALL_CROPS = [...FARM_CROPS, ...PRESTIGE_CROPS];

        let totalMoney = 0;

        // Sell farm storage
        const farmStorage = getStorage(guildId, userId);
        for (const s of farmStorage) {
            const crop = ALL_CROPS.find(c => c.id === s.cropId);
            if (crop) totalMoney += crop.sellPrice * s.quantity;
            removeStorage(guildId, userId, s.cropId, s.quantity);
        }

        // Sell livestock products
        const { sellAllProducts: sellLP } = require('./livestock');
        const lpResult = sellLP(userId);
        if (lpResult.success) totalMoney += lpResult.totalPrice;

        if (totalMoney === 0) return interaction.reply({ content: '❌ Tidak ada item untuk dijual!', ephemeral: true });

        db.prepare('UPDATE users SET balance = balance + ? WHERE userId = ?').run(totalMoney, userId);
        return interaction.reply({ content: `💰 Semua item terjual! Total: 🪙 **${totalMoney.toLocaleString('id-ID')}**`, ephemeral: true });
    }
}

// ============ UTILITY: Detection helper ============
function isLivestockButton(customId) {
    if (customId.startsWith('farm_coop_')) return true;
    if (customId.startsWith('farm_barn_')) return true;
    // Crafting products view
    if (customId.startsWith('farm_craft_products_')) return true;
    if (customId.startsWith('farm_craft_livestock_')) return true;
    if (customId.startsWith('farm_craft_sellall_')) return true;
    // Storage hub buttons
    if (customId.startsWith('farm_allstorage_')) return true;
    return false;
}

function isLivestockSelectMenu(customId) {
    return customId.startsWith('farm_hubcraft_') || customId.startsWith('farm_hubcraft2_');
}

// ============ HANDLER: Craft select menu ============
async function handleLivestockSelectMenu(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    if (customId.startsWith('farm_hubcraft_') || customId.startsWith('farm_hubcraft2_')) {
        const recipeId = interaction.values[0];
        const allRecipes = [...FARM_RECIPES, ...LIVESTOCK_RECIPES];
        const recipe = allRecipes.find(r => r.id === recipeId);
        if (!recipe) return interaction.reply({ content: '❌ Resep tidak ditemukan!', ephemeral: true });

        const { FARM_CROPS } = require('../data/farming');
        const PRESTIGE_CROPS = (() => { try { const { PRESTIGE_CROPS: PC } = require('./farmMutation'); return PC || []; } catch(e) { return []; } })();
        const ALL_CROPS = [...FARM_CROPS, ...PRESTIGE_CROPS];
        const { getStorage, removeStorage, getStorageQty } = require('./farming');
        const { getProductCount } = require('./livestock');
        const { getItemCount: getIC, addItem: addI } = require('../database');

        // Check ingredients
        for (const ing of recipe.ingredients) {
            let have = 0;
            if (ing.source === 'livestock') {
                // Format: egg_normal, milk_premium, wool_superior
                const [productId, quality] = [ing.id.substring(0, ing.id.lastIndexOf('_')), ing.id.substring(ing.id.lastIndexOf('_') + 1)];
                have = getProductCount(userId, productId, quality);
            } else {
                // Farm storage
                have = getStorageQty(guildId, userId, ing.id);
            }
            if (have < ing.qty) {
                const c = ALL_CROPS.find(cr => cr.id === ing.id);
                const name = c ? c.name : ing.id;
                return interaction.reply({ content: `❌ Bahan kurang! Butuh **${name}** × ${ing.qty} (punya: ${have})`, ephemeral: true });
            }
        }

        // Deduct ingredients
        for (const ing of recipe.ingredients) {
            if (ing.source === 'livestock') {
                const [productId, quality] = [ing.id.substring(0, ing.id.lastIndexOf('_')), ing.id.substring(ing.id.lastIndexOf('_') + 1)];
                db.prepare('UPDATE livestock_products SET quantity = quantity - ? WHERE userId = ? AND productId = ? AND quality = ?').run(ing.qty, userId, productId, quality);
            } else {
                removeStorage(guildId, userId, ing.id, ing.qty);
            }
        }

        // Add money
        db.prepare('UPDATE users SET balance = balance + ? WHERE userId = ?').run(recipe.sellPrice, userId);

        const ingredients = recipe.ingredients.map(ing => {
            const c = ALL_CROPS.find(cr => cr.id === ing.id);
            return `${c ? c.emoji : '📦'} ${c ? c.name : ing.id} ×${ing.qty}`;
        }).join(' + ');

        return interaction.reply({ content: `🧪 **Craft: ${recipe.emoji} ${recipe.name}!**\n> Bahan: ${ingredients}\n> Hasil: 🪙 **+${recipe.sellPrice.toLocaleString('id-ID')}**`, ephemeral: true });
    }
}

module.exports = {
    buildCoopPanel,
    buildBarnPanel,
    buildCraftingPanel,
    buildStorageHub,
    handleLivestockButton,
    handleLivestockSelectMenu,
    isLivestockButton,
    isLivestockSelectMenu,
};
