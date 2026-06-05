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

    // Count ready eggs
    const now = Date.now();
    let totalReady = 0;
    let animalList = '';
    chickens.forEach((chicken, i) => {
        const produceTime = ANIMALS.chicken.produceTime / prodMult;
        const elapsed = now - (chicken.lastCollect || chicken.createdAt);
        const pending = Math.min(ANIMALS.chicken.maxPending, Math.floor(elapsed / produceTime));
        totalReady += pending;
        const tierInfo = chicken.tier > 0 ? ` ${'⭐'.repeat(Math.min(chicken.tier, 3))}${chicken.tier > 3 ? `+${chicken.tier - 3}` : ''}` : '';
        const statusIcon = chicken.status === 'sick' ? ' 🤒' : pending >= ANIMALS.chicken.maxPending ? ' ✅' : '';
        animalList += `> \`[${i + 1}]\` 🐔 Lv.${chicken.level}${tierInfo} — 🥚 ${pending}/${ANIMALS.chicken.maxPending}${statusIcon}\n`;
    });

    if (chickens.length === 0) animalList = '> *Belum punya ayam. Beli di Shop!*\n';

    const embed = new EmbedBuilder()
        .setTitle(`🐔 KANDANG AYAM — ${username}`)
        .setColor('#FFA500')
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🏠 **${coopInfo.name}** (Lv.${coopLvl}) | ${season.emoji} ${season.name}\n` +
            `> 🐔 Ayam: **${chickens.length}**/${maxSlots} slot\n` +
            `> 🥚 Telur siap: **${totalReady}** butir\n` +
            `> 📈 Produksi: **${Math.round(prodMult * 100)}%** (season effect)\n` +
            (sickCount > 0 ? `> 🤒 Sakit: **${sickCount}** ayam\n` : '') +
            `> 💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📋 **Daftar Ayam:**\n${animalList}`
        )
        .setFooter({ text: `Collect setiap 2 jam/ayam | Feed setiap hari` });

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
        const produceTime = ANIMALS.cow.produceTime / cowProd;
        const elapsed = now - (cow.lastCollect || cow.createdAt);
        const pending = Math.min(ANIMALS.cow.maxPending, Math.floor(elapsed / produceTime));
        totalMilk += pending;
        const tierInfo = cow.tier > 0 ? ` ${'⭐'.repeat(Math.min(cow.tier, 3))}${cow.tier > 3 ? `+${cow.tier - 3}` : ''}` : '';
        const statusIcon = cow.status === 'sick' ? ' 🤒' : pending >= ANIMALS.cow.maxPending ? ' ✅' : '';
        cowList += `> \`[${i + 1}]\` 🐄 Lv.${cow.level}${tierInfo} — 🥛 ${pending}/${ANIMALS.cow.maxPending}${statusIcon}\n`;
    });

    let sheepList = '';
    sheep.forEach((s, i) => {
        const produceTime = ANIMALS.sheep.produceTime / sheepProd;
        const elapsed = now - (s.lastCollect || s.createdAt);
        const pending = Math.min(ANIMALS.sheep.maxPending, Math.floor(elapsed / produceTime));
        totalWool += pending;
        const tierInfo = s.tier > 0 ? ` ${'⭐'.repeat(Math.min(s.tier, 3))}${s.tier > 3 ? `+${s.tier - 3}` : ''}` : '';
        const statusIcon = s.status === 'sick' ? ' 🤒' : pending >= ANIMALS.sheep.maxPending ? ' ✅' : '';
        sheepList += `> \`[${i + 1}]\` 🐑 Lv.${s.level}${tierInfo} — 🧶 ${pending}/${ANIMALS.sheep.maxPending}${statusIcon}\n`;
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
        .setFooter({ text: `Sapi: 3jam/perah | Domba: 4jam/cukur | Feed setiap hari` });

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

// ============ BUILD: Crafting Panel ============
function buildCraftingPanel(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);
    const allRecipes = [...FARM_RECIPES, ...LIVESTOCK_RECIPES];

    // Group by category
    const farmRecipes = FARM_RECIPES.slice(0, 12);
    const livestockRecipes = LIVESTOCK_RECIPES.slice(0, 12);

    let desc = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    desc += `💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n\n`;
    desc += `**🌾 Tanaman Recipes** (${FARM_RECIPES.length} total):\n`;
    farmRecipes.slice(0, 6).forEach(r => {
        desc += `> ${r.emoji} **${r.name}** — 🪙 ${r.sellPrice.toLocaleString('id-ID')}\n`;
    });
    desc += `\n**🐔🐄 Livestock Recipes** (${LIVESTOCK_RECIPES.length} total):\n`;
    livestockRecipes.slice(0, 6).forEach(r => {
        desc += `> ${r.emoji} **${r.name}** — 🪙 ${r.sellPrice.toLocaleString('id-ID')}\n`;
    });
    desc += `\n> *Gunakan tombol di bawah untuk craft!*`;

    const embed = new EmbedBuilder()
        .setTitle(`🧪 CRAFTING — ${username}`)
        .setColor('#9B59B6')
        .setDescription(desc)
        .setFooter({ text: `Total ${allRecipes.length} recipes | Craft = gabungkan bahan → jual harga tinggi` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_craft_farm_${userId}`).setLabel('🌾 Farm Recipes').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_craft_livestock_${userId}`).setLabel('🐔 Livestock Recipes').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_craft_products_${userId}`).setLabel('📦 My Products').setStyle(ButtonStyle.Secondary),
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
}

// ============ UTILITY: Detection helper ============
function isLivestockButton(customId) {
    return customId.startsWith('farm_coop_') || customId.startsWith('farm_barn_') || customId.startsWith('farm_craft_');
}

module.exports = {
    buildCoopPanel,
    buildBarnPanel,
    buildCraftingPanel,
    handleLivestockButton,
    isLivestockButton,
};
