// systems/livestockPanel.js — Livestock Panel UI (Kandang Ayam, Peternakan, Crafting)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getItemCount } = require('../database');
const ui = require('./ui');

// Helper: reply yang auto-delete setelah 4 detik (non-ephemeral)
async function tempReply(interaction, content) {
    const msg = await interaction.reply({ content, fetchReply: true });
    setTimeout(() => msg.delete().catch(() => {}), 4000);
}
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
    const deadCount = getAnimals(userId, 'chicken').filter(a => a.status === 'dead').length;
    const sickCount = chickens.filter(a => a.status === 'sick').length;
    const prodMult = getSeasonProductionMultiplier('chicken');

    // Count ready animals
    const now = Date.now();
    let totalReady = 0;
    let animalList = '';
    const { getHungerPercent } = require('./livestock');
    chickens.forEach((chicken, i) => {
        const { getProduceTime } = require('../data/livestock');
        const produceTime = getProduceTime('chicken', chicken.level, chicken.tier) / prodMult;
        const elapsed = now - (chicken.lastCollect || chicken.createdAt);
        const isReady = elapsed >= produceTime;
        if (isReady) totalReady++;

        const tierEmoji = chicken.tier > 0 ? ' ' + '⭐'.repeat(Math.min(chicken.tier, 5)) + (chicken.tier > 5 ? `+${chicken.tier - 5}` : '') : '';
        const hunger = getHungerPercent(chicken);
        const hungerIcon = hunger > 70 ? '' : hunger > 30 ? ' 🍗' : hunger > 0 ? ' 🍗❗' : ' ⚠️🍗';
        const rarityIcon = chicken.rarity === 'diamond' ? '💎 ' : chicken.rarity === 'golden' ? '✨ ' : '';

        if (chicken.status === 'sick') {
            const name = chicken.name || 'Ayam';
            animalList += `\`[${i + 1}]\` 🐔 ${rarityIcon}**${name}** Lv.${chicken.level}${tierEmoji} 🤒\n ┗ ❌ \`░░░░░░░░░░\` SAKIT!${hungerIcon}\n`;
        } else if (isReady) {
            const name = chicken.name || 'Ayam';
            animalList += `\`[${i + 1}]\` 🐔 ${rarityIcon}**${name}** Lv.${chicken.level}${tierEmoji}\n ┗ 🥚 \`▰▰▰▰▰▰▰▰▰▰\` Ready!${hungerIcon}\n`;
        } else {
            const name = chicken.name || 'Ayam';
            const percent = Math.min(99, Math.floor((elapsed / produceTime) * 100));
            const filled = Math.floor(percent / 10);
            const bar = '▰'.repeat(filled) + '░'.repeat(10 - filled);
            const remainMin = Math.max(1, Math.ceil((produceTime - elapsed) / 60000));
            animalList += `\`[${i + 1}]\` 🐔 ${rarityIcon}**${name}** Lv.${chicken.level}${tierEmoji}\n ┗ ⏳ \`${bar}\` ${percent}% (${remainMin}m)${hungerIcon}\n`;
        }
    });

    if (chickens.length === 0) animalList = '> *Belum punya ayam. Beli di Shop!*\n';

    // Calculate average hunger
    const avgHunger = chickens.length > 0 ? Math.round(chickens.reduce((s, c) => s + getHungerPercent(c), 0) / chickens.length) : 100;
    const hungerBar = '▰'.repeat(Math.floor(avgHunger / 10)) + '░'.repeat(10 - Math.floor(avgHunger / 10));
    const hungerStatus = avgHunger > 70 ? '😊' : avgHunger > 30 ? '😐' : avgHunger > 0 ? '😫' : '😵';

    const embed = new EmbedBuilder()
        .setTitle(ui.title('🐔', 'KANDANG AYAM', username))
        .setColor(totalReady > 0 ? ui.COLORS.economy : ui.COLORS.pet)
        .setDescription(
            `🏠 **${coopInfo.name}** (Lv.${coopLvl})  •  ${season.emoji} ${season.name}\n` +
            `> 🐔 Ayam: **${chickens.length}**/${maxSlots}  •  🥚 Siap: **${totalReady}**\n` +
            `> 🍗 Pakan: \`${hungerBar}\` **${avgHunger}%** ${hungerStatus}\n` +
            `> 📈 Produksi: **${Math.round(prodMult * 100)}%**  •  ${ui.money(userData.balance)}\n` +
            (sickCount > 0 ? `> ⚠️ **${sickCount} ayam sakit!** Beri obat segera.\n` : '') +
            ui.DIVIDER + `\n` +
            `📋 **Daftar Ayam:**\n` +
            animalList
        )
        .setFooter({ text: ui.footer('🥚 Ready • ⏳ Growing • 🤒 Sakit • 🍗 Lapar • 🔄 Refresh') });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_coop_collect_${userId}`).setLabel(`🥚 Collect (${totalReady})`).setStyle(ButtonStyle.Primary).setDisabled(totalReady === 0),
        new ButtonBuilder().setCustomId(`farm_coop_feed_${userId}`).setLabel('🌾 Feed All').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_coop_heal_${userId}`).setLabel(`💊 Heal`).setStyle(sickCount > 0 ? ButtonStyle.Danger : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_coop_evolve_${userId}`).setLabel('⬆️ Evolve').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_coop_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_coop_sell_${userId}`).setLabel('💰 Sell Telur').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_coop_sellbird_${userId}`).setLabel('🐔 Jual Ayam').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`farm_coop_rename_${userId}`).setLabel('✏️ Rename').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_coop_upgrade_${userId}`).setLabel('⬆️ Upgrade').setStyle(ButtonStyle.Secondary)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_coop_leaderboard_${userId}`).setLabel('🏆 Leaderboard').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_coop_stats_${userId}`).setLabel('📊 Stats').setStyle(ButtonStyle.Secondary),
        ...(deadCount > 0 ? [new ButtonBuilder().setCustomId(`farm_coop_bury_${userId}`).setLabel(`⚰️ Kubur (${deadCount})`).setStyle(ButtonStyle.Danger)] : []),
        new ButtonBuilder().setCustomId(`farm_coop_refresh_${userId}`).setLabel('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2, row3] };
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
    const deadBarnCount = db.prepare("SELECT COUNT(*) as c FROM livestock WHERE userId = ? AND animalType IN ('cow', 'sheep') AND status = 'dead'").get(userId)?.c || 0;
    const cowProd = getSeasonProductionMultiplier('cow');
    const sheepProd = getSeasonProductionMultiplier('sheep');
    const { getHungerPercent } = require('./livestock');

    const now = Date.now();
    let totalMilk = 0, totalWool = 0;

    let cowList = '';
    cows.forEach((cow, i) => {
        const { getProduceTime } = require('../data/livestock');
        const produceTime = getProduceTime('cow', cow.level, cow.tier) / cowProd;
        const elapsed = now - (cow.lastCollect || cow.createdAt);
        const isReady = elapsed >= produceTime;
        if (isReady) totalMilk++;
        const tierEmoji = cow.tier > 0 ? ' ' + '⭐'.repeat(Math.min(cow.tier, 5)) + (cow.tier > 5 ? `+${cow.tier - 5}` : '') : '';
        const hunger = getHungerPercent(cow);
        const hungerIcon = hunger > 70 ? '' : hunger > 30 ? ' 🍗' : hunger > 0 ? ' 🍗❗' : ' ⚠️🍗';

        const rarityIcon = cow.rarity === 'diamond' ? '💎 ' : cow.rarity === 'golden' ? '✨ ' : '';
        if (cow.status === 'sick') {
            cowList += `\`[${i + 1}]\` 🐄 ${rarityIcon}**Sapi** Lv.${cow.level}${tierEmoji} 🤒\n ┗ ❌ \`░░░░░░░░░░\` SAKIT!${hungerIcon}\n`;
        } else if (isReady) {
            cowList += `\`[${i + 1}]\` 🐄 ${rarityIcon}**Sapi** Lv.${cow.level}${tierEmoji}\n ┗ 🥛 \`▰▰▰▰▰▰▰▰▰▰\` Ready!${hungerIcon}\n`;
        } else {
            const percent = Math.min(99, Math.floor((elapsed / produceTime) * 100));
            const filled = Math.floor(percent / 10);
            const bar = '▰'.repeat(filled) + '░'.repeat(10 - filled);
            const remainMin = Math.max(1, Math.ceil((produceTime - elapsed) / 60000));
            cowList += `\`[${i + 1}]\` 🐄 ${rarityIcon}**Sapi** Lv.${cow.level}${tierEmoji}\n ┗ ⏳ \`${bar}\` ${percent}% (${remainMin}m)${hungerIcon}\n`;
        }
    });

    let sheepList = '';
    sheep.forEach((s, i) => {
        const { getProduceTime } = require('../data/livestock');
        const produceTime = getProduceTime('sheep', s.level, s.tier) / sheepProd;
        const elapsed = now - (s.lastCollect || s.createdAt);
        const isReady = elapsed >= produceTime;
        if (isReady) totalWool++;
        const tierEmoji = s.tier > 0 ? ' ' + '⭐'.repeat(Math.min(s.tier, 5)) + (s.tier > 5 ? `+${s.tier - 5}` : '') : '';
        const hunger = getHungerPercent(s);
        const hungerIcon = hunger > 70 ? '' : hunger > 30 ? ' 🍗' : hunger > 0 ? ' 🍗❗' : ' ⚠️🍗';

        const rarityIcon = s.rarity === 'diamond' ? '💎 ' : s.rarity === 'golden' ? '✨ ' : '';
        if (s.status === 'sick') {
            sheepList += `\`[${i + 1}]\` 🐑 ${rarityIcon}**Domba** Lv.${s.level}${tierEmoji} 🤒\n ┗ ❌ \`░░░░░░░░░░\` SAKIT!${hungerIcon}\n`;
        } else if (isReady) {
            sheepList += `\`[${i + 1}]\` 🐑 ${rarityIcon}**Domba** Lv.${s.level}${tierEmoji}\n ┗ 🧶 \`▰▰▰▰▰▰▰▰▰▰\` Ready!${hungerIcon}\n`;
        } else {
            const percent = Math.min(99, Math.floor((elapsed / produceTime) * 100));
            const filled = Math.floor(percent / 10);
            const bar = '▰'.repeat(filled) + '░'.repeat(10 - filled);
            const remainMin = Math.max(1, Math.ceil((produceTime - elapsed) / 60000));
            sheepList += `\`[${i + 1}]\` 🐑 ${rarityIcon}**Domba** Lv.${s.level}${tierEmoji}\n ┗ ⏳ \`${bar}\` ${percent}% (${remainMin}m)${hungerIcon}\n`;
        }
    });

    if (cows.length === 0) cowList = '*Belum punya sapi*\n';
    if (sheep.length === 0) sheepList = '*Belum punya domba*\n';

    const allBarn = [...cows, ...sheep];
    const avgHunger = allBarn.length > 0 ? Math.round(allBarn.reduce((s, a) => s + getHungerPercent(a), 0) / allBarn.length) : 100;
    const hungerBar = '▰'.repeat(Math.floor(avgHunger / 10)) + '░'.repeat(10 - Math.floor(avgHunger / 10));
    const hungerStatus = avgHunger > 70 ? '😊' : avgHunger > 30 ? '😐' : avgHunger > 0 ? '😫' : '😵';

    const embed = new EmbedBuilder()
        .setTitle(ui.title('🐄', 'PETERNAKAN', username))
        .setColor((totalMilk + totalWool) > 0 ? ui.COLORS.economy : '#8B4513')
        .setDescription(
            `🏠 **${barnInfo.name}** (Lv.${barnLvl})  •  ${season.emoji} ${season.name}\n` +
            `> 🐄 Sapi: **${cows.length}**  •  🐑 Domba: **${sheep.length}** (${totalAnimals}/${maxSlots})\n` +
            `> 🥛 Siap: **${totalMilk}**  •  🧶 Siap: **${totalWool}**\n` +
            `> 🍗 Pakan: \`${hungerBar}\` **${avgHunger}%** ${hungerStatus}\n` +
            `> ${ui.money(userData.balance)}\n` +
            (totalSick > 0 ? `> ⚠️ **${totalSick} hewan sakit!**\n` : '') +
            ui.DIVIDER + `\n` +
            `📋 **Sapi:**\n${cowList}\n` +
            `📋 **Domba:**\n${sheepList}`
        )
        .setFooter({ text: ui.footer('🥛🧶 Ready • ⏳ Growing • 🤒 Sakit • 🍗 Lapar • 🎾 Play boost') });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_barn_milk_${userId}`).setLabel(`🥛 Milk (${totalMilk})`).setStyle(ButtonStyle.Primary).setDisabled(totalMilk === 0),
        new ButtonBuilder().setCustomId(`farm_barn_shear_${userId}`).setLabel(`🧶 Shear (${totalWool})`).setStyle(ButtonStyle.Primary).setDisabled(totalWool === 0),
        new ButtonBuilder().setCustomId(`farm_barn_feed_${userId}`).setLabel('🌾 Feed All').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_barn_play_${userId}`).setLabel('🎾 Play').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_barn_heal_${userId}`).setLabel(`💊 Heal`).setStyle(totalSick > 0 ? ButtonStyle.Danger : ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_barn_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_barn_sell_${userId}`).setLabel('💰 Sell Products').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_barn_upgrade_${userId}`).setLabel('⬆️ Upgrade').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_barn_stats_${userId}`).setLabel('📊 Stats').setStyle(ButtonStyle.Secondary),
        ...(deadBarnCount > 0 ? [new ButtonBuilder().setCustomId(`farm_barn_bury_${userId}`).setLabel(`⚰️ Kubur (${deadBarnCount})`).setStyle(ButtonStyle.Danger)] : [])
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_barn_refresh_${userId}`).setLabel('🔄').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2, row3] };
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
        const reply = await interaction.reply({ content: `🥚 Collected **${result.totalCollected}** telur! (+${result.totalExp} EXP)`, fetchReply: true });
        setTimeout(() => { reply.delete().catch(() => {}); }, 4000);
        setTimeout(() => { interaction.message.edit(buildCoopPanel(userId, interaction.user.username)).catch(() => {}); }, 1500);
        return;
    }
    if (customId === `farm_coop_feed_${userId}`) {
        const result = feedAnimals(userId, 'chicken');
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        const reply = await interaction.reply({ content: `🌾 Berhasil memberi makan **${result.fed}** ayam! (Pakan: -${result.feedUsed})`, fetchReply: true });
        setTimeout(() => { reply.delete().catch(() => {}); }, 4000);
        setTimeout(() => { interaction.message.edit(buildCoopPanel(userId, interaction.user.username)).catch(() => {}); }, 1500);
        return;
    }
    if (customId === `farm_coop_heal_${userId}`) {
        const { getHungerPercent } = require('./livestock');
        const chickens = getAnimals(userId, 'chicken').filter(a => a.status !== 'dead');
        const sickOnes = chickens.filter(a => a.status === 'sick');
        const starvingOnes = chickens.filter(a => a.status !== 'sick' && getHungerPercent(a) <= 0);
        
        if (sickOnes.length > 0) {
            const result = healAll(userId, 'chicken');
            if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
            const reply = await interaction.reply({ content: `💊 Menyembuhkan **${result.healed}** ayam!`, fetchReply: true });
            setTimeout(() => { reply.delete().catch(() => {}); }, 4000);
            setTimeout(() => { interaction.message.edit(buildCoopPanel(userId, interaction.user.username)).catch(() => {}); }, 1500);
            return;
        }
        if (starvingOnes.length > 0) {
            return interaction.reply({ content: `❌ Ayam kelaparan, bukan sakit. Gunakan **🌾 Feed All**!`, ephemeral: true });
        }
        return interaction.reply({ content: `❌ Tidak ada ayam sakit!`, ephemeral: true });
    }
    if (customId === `farm_coop_sell_${userId}`) {
        // Sell egg products from farm_storage
        const { PRODUCT_QUALITY } = require('../data/livestock');
        const eggItems = db.prepare("SELECT * FROM farm_storage WHERE userId = ? AND itemId LIKE 'egg_%' AND quantity > 0").all(userId);
        if (eggItems.length === 0) return interaction.reply({ content: '❌ Tidak ada telur untuk dijual! Collect dulu.', ephemeral: true });
        let totalPrice = 0;
        for (const item of eggItems) {
            const lastU = item.itemId.lastIndexOf('_');
            const prodId = item.itemId.substring(0, lastU);
            const quality = item.itemId.substring(lastU + 1);
            const qData = PRODUCT_QUALITY[prodId]?.find(q => q.quality === quality);
            if (qData) totalPrice += qData.price * item.quantity;
        }
        db.prepare("DELETE FROM farm_storage WHERE userId = ? AND itemId LIKE 'egg_%'").run(userId);
        db.prepare('UPDATE users SET balance = balance + ? WHERE userId = ?').run(totalPrice, userId);
        await tempReply(interaction, `💰 Semua telur terjual! 🪙 **+${totalPrice.toLocaleString('id-ID')}**`); return;
    }
    if (customId === `farm_coop_upgrade_${userId}`) {
        const result = upgradeCoopLevel(userId);
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        await tempReply(interaction, `⬆️ Kandang Ayam upgraded ke **${result.name}** (Lv.${result.newLevel})! Slots: ${result.slots}`); return;
    }

    // === RENAME AYAM ===
    if (customId === `farm_coop_rename_${userId}`) {
        const chickens = getAnimals(userId, 'chicken').filter(a => a.status !== 'dead');
        if (chickens.length === 0) return interaction.reply({ content: '❌ Tidak punya ayam!', ephemeral: true });
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder().setCustomId(`farm_coop_modal_rename_${userId}`).setTitle('Rename Ayam');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('slot').setLabel('Nomor ayam (contoh: 1)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nama baru (max 20 karakter)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20))
        );
        return interaction.showModal(modal);
    }

    // === SELL AYAM (jual hewan) ===
    if (customId === `farm_coop_sellbird_${userId}`) {
        const chickens = getAnimals(userId, 'chicken').filter(a => a.status !== 'dead');
        if (chickens.length === 0) return interaction.reply({ content: '❌ Tidak punya ayam!', ephemeral: true });
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder().setCustomId(`farm_coop_modal_sellbird_${userId}`).setTitle('Jual Ayam');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('slot').setLabel('Nomor ayam yang mau dijual (contoh: 3)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3))
        );
        return interaction.showModal(modal);
    }

    // === LEADERBOARD TERNAK ===
    if (customId === `farm_coop_leaderboard_${userId}`) {
        // Top farmers by total eggs collected (stat: total_eggs_collected)
        const topFarmers = db.prepare("SELECT userId, stat_value as total FROM user_stats WHERE stat_key = 'total_eggs_collected' ORDER BY stat_value DESC LIMIT 10").all();
        let desc = '';
        if (topFarmers.length === 0) {
            desc = '*Belum ada data.*';
        } else {
            topFarmers.forEach((r, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
                desc += `${medal} <@${r.userId}> — 🥚 **${r.total.toLocaleString('id-ID')}** telur\n`;
            });
        }
        const embed = new EmbedBuilder().setTitle('🏆 Leaderboard Ternak').setColor('#FFD700').setDescription(desc).setFooter({ text: 'Top 10 — Total telur yang pernah di-collect' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_coop_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === KUBUR AYAM MATI ===
    if (customId === `farm_coop_bury_${userId}`) {
        const { buryAllDead } = require('./livestock');
        const result = buryAllDead(userId);
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        await tempReply(interaction, `⚰️ **${result.count}** ayam mati telah dikubur. Slot kandang dibebaskan.`); return;
    }

    // === STATS PANEL ===
    if (customId === `farm_coop_stats_${userId}`) {
        const { getUserStat } = require('../database');
        const chickens = getAnimals(userId, 'chicken');
        const alive = chickens.filter(a => a.status !== 'dead');
        const goldenCount = alive.filter(a => a.rarity === 'golden').length;
        const diamondCount = alive.filter(a => a.rarity === 'diamond').length;
        const totalEggs = getUserStat(null, userId, 'total_eggs_collected') || 0;
        const highestLv = alive.length > 0 ? Math.max(...alive.map(a => a.level)) : 0;
        const highestTier = alive.length > 0 ? Math.max(...alive.map(a => a.tier)) : 0;
        const avgLevel = alive.length > 0 ? Math.round(alive.reduce((s, a) => s + a.level, 0) / alive.length) : 0;

        const embed = new EmbedBuilder()
            .setTitle('📊 Stats Kandang Ayam')
            .setColor('#FFA500')
            .setDescription(
                `**📈 Overview:**\n` +
                `> 🐔 Total Ayam (hidup): **${alive.length}**\n` +
                `> ✨ Golden: **${goldenCount}** | 💎 Diamond: **${diamondCount}**\n` +
                `> 🥚 Total Telur Collected: **${totalEggs.toLocaleString('id-ID')}**\n` +
                `> 📈 Rata-rata Level: **${avgLevel}**\n` +
                `> 🏆 Level Tertinggi: **${highestLv}**\n` +
                `> ⭐ Tier Tertinggi: **${highestTier}**\n\n` +
                `**🎲 Rarity Chance:**\n` +
                `> Normal: 94% | ✨ Golden: 5% (2x produksi) | 💎 Diamond: 1% (3x produksi)`
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_coop_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
    if (customId === `farm_coop_shop_${userId}`) {
        // Show full coop shop with input buttons
        const userData2 = getOrCreateUser(null, userId);
        const feedCount = require('../database').getItemCount(null, userId, 'chicken_feed');
        const medCount = require('../database').getItemCount(null, userId, 'chicken_medicine');
        const premCount = require('../database').getItemCount(null, userId, 'premium_feed');
        let desc = `💰 Saldo: 🪙 **${userData2.balance.toLocaleString('id-ID')}**\n\n`;
        desc += `📦 **Stok saat ini:**\n`;
        desc += `> 🌾 Pakan Ayam: **${feedCount}** pack\n`;
        desc += `> 💊 Obat Ayam: **${medCount}** dosis\n`;
        desc += `> ⭐ Pakan Premium: **${premCount}** pc\n\n`;
        desc += `🛒 **Daftar Harga:**\n`;
        desc += `> 🐔 Ayam Baru — 🪙 3,000/ekor\n`;
        desc += `> 🌾 Pakan Ayam — 🪙 60/pack (1 pack = +10% hunger)\n`;
        desc += `> 💊 Obat Ayam — 🪙 250/dosis\n`;
        desc += `> ⭐ Pakan Premium — 🪙 1,200/pc (untuk evolve)\n`;
        const embed = new EmbedBuilder().setTitle('🛒 Shop Kandang Ayam').setColor('#FFA500').setDescription(desc);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_coop_buyhen_${userId}`).setLabel('🐔 Beli Ayam').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`farm_coop_buyfeed_input_${userId}`).setLabel('🌾 Beli Pakan').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`farm_coop_buymeds_input_${userId}`).setLabel('💊 Beli Obat').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`farm_coop_buypremium_input_${userId}`).setLabel('⭐ Beli Premium').setStyle(ButtonStyle.Secondary)
        );
        const row2x = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_coop_${userId}`).setLabel('🔙 Back').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row, row2x] });
    }
    if (customId === `farm_coop_buyhen_${userId}`) {
        const result = buyAnimal(userId, 'chicken');
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        await tempReply(interaction, `🐔 Berhasil beli ayam! (-🪙 ${result.price.toLocaleString('id-ID')})${result.rarityMsg || ''}`); return;
    }
    if (customId === `farm_coop_buyfeed_input_${userId}`) {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder().setCustomId(`farm_coop_modal_feed_${userId}`).setTitle('Beli Pakan Ayam');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('qty').setLabel('Jumlah (🪙 60/pack)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: 50').setMaxLength(5)
        ));
        return interaction.showModal(modal);
    }
    if (customId === `farm_coop_buymeds_input_${userId}`) {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder().setCustomId(`farm_coop_modal_meds_${userId}`).setTitle('Beli Obat Ayam');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('qty').setLabel('Jumlah (🪙 250/dosis)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: 10').setMaxLength(5)
        ));
        return interaction.showModal(modal);
    }
    if (customId === `farm_coop_buypremium_input_${userId}`) {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder().setCustomId(`farm_coop_modal_premium_${userId}`).setTitle('Beli Pakan Premium');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('qty').setLabel('Jumlah (🪙 1,200/pc)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: 5').setMaxLength(5)
        ));
        return interaction.showModal(modal);
    }

    // === BARN ACTIONS ===
    if (customId === `farm_barn_${userId}` || customId === `farm_barn_refresh_${userId}`) {
        return interaction.update(buildBarnPanel(userId, interaction.user.username));
    }
    if (customId === `farm_barn_milk_${userId}`) {
        const result = collectProducts(userId, 'cow');
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        const reply = await interaction.reply({ content: `🥛 Collected **${result.totalCollected}** susu! (+${result.totalExp} EXP)`, fetchReply: true });
        setTimeout(() => { reply.delete().catch(() => {}); }, 4000);
        setTimeout(() => { interaction.message.edit(buildBarnPanel(userId, interaction.user.username)).catch(() => {}); }, 1500);
        return;
    }
    if (customId === `farm_barn_shear_${userId}`) {
        const result = collectProducts(userId, 'sheep');
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        const reply = await interaction.reply({ content: `🧶 Collected **${result.totalCollected}** bulu! (+${result.totalExp} EXP)`, fetchReply: true });
        setTimeout(() => { reply.delete().catch(() => {}); }, 4000);
        setTimeout(() => { interaction.message.edit(buildBarnPanel(userId, interaction.user.username)).catch(() => {}); }, 1500);
        return;
    }
    if (customId === `farm_barn_feed_${userId}`) {
        const cowResult = feedAnimals(userId, 'cow');
        const sheepResult = feedAnimals(userId, 'sheep');
        const msgs = [];
        if (cowResult.success) msgs.push(`🐄 Fed ${cowResult.fed} sapi`);
        if (sheepResult.success) msgs.push(`🐑 Fed ${sheepResult.fed} domba`);
        if (msgs.length === 0) return interaction.reply({ content: `❌ ${cowResult.error || sheepResult.error || 'Tidak ada hewan!'}`, ephemeral: true });
        const reply = await interaction.reply({ content: `🌾 ${msgs.join(' | ')}`, fetchReply: true });
        setTimeout(() => { reply.delete().catch(() => {}); }, 4000);
        setTimeout(() => { interaction.message.edit(buildBarnPanel(userId, interaction.user.username)).catch(() => {}); }, 1500);
        return;
    }
    if (customId === `farm_barn_heal_${userId}`) {
        const { getHungerPercent } = require('./livestock');
        const allBarn = [...getAnimals(userId, 'cow').filter(a => a.status !== 'dead'), ...getAnimals(userId, 'sheep').filter(a => a.status !== 'dead')];
        const sickOnes = allBarn.filter(a => a.status === 'sick');
        const starvingOnes = allBarn.filter(a => a.status !== 'sick' && getHungerPercent(a) <= 0);
        
        if (sickOnes.length > 0) {
            const cowResult = healAll(userId, 'cow');
            const sheepResult = healAll(userId, 'sheep');
            const healed = (cowResult.healed || 0) + (sheepResult.healed || 0);
            const reply = await interaction.reply({ content: `💊 Menyembuhkan **${healed}** hewan!`, fetchReply: true });
            setTimeout(() => { reply.delete().catch(() => {}); }, 4000);
            setTimeout(() => { interaction.message.edit(buildBarnPanel(userId, interaction.user.username)).catch(() => {}); }, 1500);
            return;
        }
        if (starvingOnes.length > 0) {
            return interaction.reply({ content: `❌ Hewan kelaparan, bukan sakit. Gunakan **🌾 Feed All**!`, ephemeral: true });
        }
        return interaction.reply({ content: `❌ Tidak ada hewan sakit!`, ephemeral: true });
    }
    if (customId === `farm_barn_play_${userId}`) {
        // Play with barn animals — boosts production speed temporarily
        const allBarn = [...getAnimals(userId, 'cow').filter(a => a.status !== 'dead'), ...getAnimals(userId, 'sheep').filter(a => a.status !== 'dead')];
        if (allBarn.length === 0) return interaction.reply({ content: '❌ Tidak ada hewan!', ephemeral: true });
        // Cooldown check (1x per 30 menit)
        const { getLivestockData, setLivestockData } = require('./livestock');
        const lastPlay = parseInt(getLivestockData(userId, 'barn_last_play', '0')) || 0;
        const playCD = 30 * 60 * 1000; // 30 menit
        if (Date.now() - lastPlay < playCD) {
            const remaining = Math.ceil((playCD - (Date.now() - lastPlay)) / 60000);
            return interaction.reply({ content: `⏳ Hewan masih capek bermain! Tunggu **${remaining} menit** lagi.`, ephemeral: true });
        }
        // Play effect: reset lastCollect to speed up next production by 50%
        setLivestockData(userId, 'barn_last_play', String(Date.now()));
        for (const animal of allBarn) {
            const currentCollect = animal.lastCollect || animal.createdAt;
            const boostedCollect = currentCollect - (5 * 60 * 1000); // Move 5 minutes forward
            db.prepare('UPDATE livestock SET lastCollect = ? WHERE id = ?').run(boostedCollect, animal.id);
        }
        const playMsgs = ['🐄 Sapi berlari senang!', '🐑 Domba melompat-lompat!', '🎾 Hewan-hewan bermain bersama!', '🌿 Mereka makan rumput segar sambil bermain!'];
        const msg = playMsgs[Math.floor(Math.random() * playMsgs.length)];
        await tempReply(interaction, `🎾 **Bermain dengan hewan!**\n> ${msg}\n> ⚡ Produksi dipercepat 5 menit untuk semua hewan!`); return;
    }
    if (customId === `farm_barn_sell_${userId}`) {
        // Sell milk + wool products from farm_storage
        const { PRODUCT_QUALITY } = require('../data/livestock');
        const barnItems = db.prepare("SELECT * FROM farm_storage WHERE userId = ? AND (itemId LIKE 'milk_%' OR itemId LIKE 'wool_%') AND quantity > 0").all(userId);
        if (barnItems.length === 0) return interaction.reply({ content: '❌ Tidak ada susu/bulu untuk dijual! Collect dulu.', ephemeral: true });
        let totalPrice = 0;
        for (const item of barnItems) {
            const lastU = item.itemId.lastIndexOf('_');
            const prodId = item.itemId.substring(0, lastU);
            const quality = item.itemId.substring(lastU + 1);
            const qData = PRODUCT_QUALITY[prodId]?.find(q => q.quality === quality);
            if (qData) totalPrice += qData.price * item.quantity;
        }
        db.prepare("DELETE FROM farm_storage WHERE userId = ? AND (itemId LIKE 'milk_%' OR itemId LIKE 'wool_%')").run(userId);
        db.prepare('UPDATE users SET balance = balance + ? WHERE userId = ?').run(totalPrice, userId);
        await tempReply(interaction, `💰 Semua susu & bulu terjual! 🪙 **+${totalPrice.toLocaleString('id-ID')}**`); return;
    }
    if (customId === `farm_barn_upgrade_${userId}`) {
        const result = upgradeBarnLevel(userId);
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        await tempReply(interaction, `⬆️ Peternakan upgraded ke **${result.name}** (Lv.${result.newLevel})! Slots: ${result.slots}`); return;
    }
    if (customId === `farm_barn_bury_${userId}`) {
        const { buryAllDead } = require('./livestock');
        const result = buryAllDead(userId);
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        await tempReply(interaction, `⚰️ **${result.count}** hewan mati telah dikubur. Slot kandang dibebaskan.`); return;
    }
    if (customId === `farm_barn_stats_${userId}`) {
        const { getUserStat } = require('../database');
        const cows = getAnimals(userId, 'cow').filter(a => a.status !== 'dead');
        const sheep = getAnimals(userId, 'sheep').filter(a => a.status !== 'dead');
        const allBarn = [...cows, ...sheep];
        const goldenCount = allBarn.filter(a => a.rarity === 'golden').length;
        const diamondCount = allBarn.filter(a => a.rarity === 'diamond').length;
        const totalMilk = getUserStat(null, userId, 'total_milk_collected') || 0;
        const totalWool = getUserStat(null, userId, 'total_wool_collected') || 0;
        const highestLv = allBarn.length > 0 ? Math.max(...allBarn.map(a => a.level)) : 0;
        const highestTier = allBarn.length > 0 ? Math.max(...allBarn.map(a => a.tier)) : 0;

        const embed = new EmbedBuilder()
            .setTitle('📊 Stats Peternakan')
            .setColor('#8B4513')
            .setDescription(
                `**📈 Overview:**\n` +
                `> 🐄 Sapi: **${cows.length}** | 🐑 Domba: **${sheep.length}**\n` +
                `> ✨ Golden: **${goldenCount}** | 💎 Diamond: **${diamondCount}**\n` +
                `> 🥛 Total Susu Collected: **${totalMilk.toLocaleString('id-ID')}**\n` +
                `> 🧶 Total Bulu Collected: **${totalWool.toLocaleString('id-ID')}**\n` +
                `> 🏆 Level Tertinggi: **${highestLv}**\n` +
                `> ⭐ Tier Tertinggi: **${highestTier}**\n\n` +
                `**🎲 Rarity Chance:**\n` +
                `> Normal: 94% | ✨ Golden: 5% (2x) | 💎 Diamond: 1% (3x)`
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_barn_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
    if (customId === `farm_barn_shop_${userId}`) {
        const userData2 = getOrCreateUser(null, userId);
        const cowFeed = require('../database').getItemCount(null, userId, 'cow_feed');
        const sheepFeed = require('../database').getItemCount(null, userId, 'sheep_feed');
        const cowMed = require('../database').getItemCount(null, userId, 'cow_medicine');
        const sheepMed = require('../database').getItemCount(null, userId, 'sheep_medicine');
        const premCount = require('../database').getItemCount(null, userId, 'premium_feed');
        let desc = `💰 Saldo: 🪙 **${userData2.balance.toLocaleString('id-ID')}**\n\n`;
        desc += `📦 **Stok saat ini:**\n`;
        desc += `> 🌾 Pakan Sapi: **${cowFeed}** | Pakan Domba: **${sheepFeed}**\n`;
        desc += `> 💊 Obat Sapi: **${cowMed}** | Obat Domba: **${sheepMed}**\n`;
        desc += `> ⭐ Pakan Premium: **${premCount}**\n\n`;
        desc += `🛒 **Daftar Harga:**\n`;
        desc += `> 🐄 Sapi — 🪙 10,000 | 🐑 Domba — 🪙 8,000\n`;
        desc += `> 🌾 Pakan Sapi — 🪙 90/pc | Pakan Domba — 🪙 70/pc\n`;
        desc += `> 💊 Obat Sapi — 🪙 400 | Obat Domba — 🪙 350\n`;
        desc += `> ⭐ Pakan Premium — 🪙 1,200/pc\n`;
        const embed = new EmbedBuilder().setTitle('🛒 Shop Peternakan').setColor('#8B4513').setDescription(desc);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_barn_buycow_${userId}`).setLabel('🐄 Sapi (10K)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`farm_barn_buysheep_${userId}`).setLabel('🐑 Domba (8K)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`farm_barn_buycowfeed_input_${userId}`).setLabel('🌾 Pakan Sapi').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`farm_barn_buysheepfeed_input_${userId}`).setLabel('🌾 Pakan Domba').setStyle(ButtonStyle.Success)
        );
        const row2x = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_barn_buycowmeds_input_${userId}`).setLabel('💊 Obat Sapi').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`farm_barn_buysheepmeds_input_${userId}`).setLabel('💊 Obat Domba').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`farm_barn_buypremium_input_${userId}`).setLabel('⭐ Premium').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`farm_barn_${userId}`).setLabel('🔙 Back').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row, row2x] });
    }
    if (customId === `farm_barn_buycow_${userId}`) {
        const result = buyAnimal(userId, 'cow');
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        await tempReply(interaction, `🐄 Berhasil beli sapi! (-🪙 ${result.price.toLocaleString('id-ID')})${result.rarityMsg || ''}`); return;
    }
    if (customId === `farm_barn_buysheep_${userId}`) {
        const result = buyAnimal(userId, 'sheep');
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        await tempReply(interaction, `🐑 Berhasil beli domba! (-🪙 ${result.price.toLocaleString('id-ID')})${result.rarityMsg || ''}`); return;
    }
    // Modal inputs for barn shop
    if (customId === `farm_barn_buycowfeed_input_${userId}`) {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder().setCustomId(`farm_barn_modal_cowfeed_${userId}`).setTitle('Beli Pakan Sapi');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qty').setLabel('Jumlah (90/pc)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: 30').setMaxLength(5)));
        return interaction.showModal(modal);
    }
    if (customId === `farm_barn_buysheepfeed_input_${userId}`) {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder().setCustomId(`farm_barn_modal_sheepfeed_${userId}`).setTitle('Beli Pakan Domba');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qty').setLabel('Jumlah (70/pc)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: 30').setMaxLength(5)));
        return interaction.showModal(modal);
    }
    if (customId === `farm_barn_buycowmeds_input_${userId}`) {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder().setCustomId(`farm_barn_modal_cowmeds_${userId}`).setTitle('Beli Obat Sapi');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qty').setLabel('Jumlah (400/pc)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: 5').setMaxLength(5)));
        return interaction.showModal(modal);
    }
    if (customId === `farm_barn_buysheepmeds_input_${userId}`) {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder().setCustomId(`farm_barn_modal_sheepmeds_${userId}`).setTitle('Beli Obat Domba');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qty').setLabel('Jumlah (350/pc)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: 5').setMaxLength(5)));
        return interaction.showModal(modal);
    }
    if (customId === `farm_barn_buypremium_input_${userId}`) {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
        const modal = new ModalBuilder().setCustomId(`farm_barn_modal_premium_${userId}`).setTitle('Beli Pakan Premium');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qty').setLabel('Jumlah (1,200/pc)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('contoh: 5').setMaxLength(5)));
        return interaction.showModal(modal);
    }

    // === CRAFTING SELL ALL PRODUCTS ===
    if (customId === `farm_craft_sellall_${userId}`) {
        const { sellAllProducts: sellLP } = require('./livestock');
        const result = sellLP(userId);
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        await tempReply(interaction, `💰 Semua produk ternak terjual! 🪙 **${result.totalPrice.toLocaleString('id-ID')}**`); return;
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
        await tempReply(interaction, `💰 Semua item terjual! Total: 🪙 **${totalMoney.toLocaleString('id-ID')}**`); return;
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

function isLivestockModal(customId) {
    return customId.startsWith('farm_coop_modal_') || customId.startsWith('farm_barn_modal_');
}

// ============ HANDLER: Modal submits (shop buy with qty input) ============
async function handleLivestockModal(interaction) {
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    // === RENAME AYAM MODAL ===
    if (customId === `farm_coop_modal_rename_${userId}`) {
        const slot = parseInt(interaction.fields.getTextInputValue('slot'));
        const newName = interaction.fields.getTextInputValue('name').trim();
        if (isNaN(slot) || slot < 1) return interaction.reply({ content: '❌ Nomor slot tidak valid!', ephemeral: true });
        if (!newName || newName.length > 20) return interaction.reply({ content: '❌ Nama harus 1-20 karakter!', ephemeral: true });
        const chickens = getAnimals(userId, 'chicken').filter(a => a.status !== 'dead');
        if (slot > chickens.length) return interaction.reply({ content: `❌ Slot ${slot} tidak ada! (Punya ${chickens.length} ayam)`, ephemeral: true });
        const chicken = chickens[slot - 1];
        db.prepare('UPDATE livestock SET name = ? WHERE id = ?').run(newName, chicken.id);
        await tempReply(interaction, `✏️ Ayam #${slot} renamed menjadi **${newName}**!`); return;
    }

    // === SELL BIRD MODAL ===
    if (customId === `farm_coop_modal_sellbird_${userId}`) {
        const slot = parseInt(interaction.fields.getTextInputValue('slot'));
        if (isNaN(slot) || slot < 1) return interaction.reply({ content: '❌ Nomor slot tidak valid!', ephemeral: true });
        const chickens = getAnimals(userId, 'chicken').filter(a => a.status !== 'dead');
        if (slot > chickens.length) return interaction.reply({ content: `❌ Slot ${slot} tidak ada!`, ephemeral: true });
        const chicken = chickens[slot - 1];
        // Sell price: base 1000 + (level * 100) + (tier * 3000)
        const sellPrice = 1000 + (chicken.level * 100) + (chicken.tier * 3000);
        const name = chicken.name || 'Ayam';
        db.prepare('DELETE FROM livestock WHERE id = ?').run(chicken.id);
        db.prepare('UPDATE users SET balance = balance + ? WHERE userId = ?').run(sellPrice, userId);
        await tempReply(interaction, `🐔 **${name}** (Lv.${chicken.level}) terjual! 🪙 **+${sellPrice.toLocaleString('id-ID')}**`); return;
    }

    const qty = parseInt(interaction.fields.getTextInputValue('qty'));
    if (isNaN(qty) || qty <= 0) return interaction.reply({ content: '❌ Jumlah tidak valid!', ephemeral: true });

    const user = getOrCreateUser(null, userId);
    const { addItem: addI } = require('../database');

    // Coop modals
    if (customId === `farm_coop_modal_feed_${userId}`) {
        const cost = qty * 60;
        if (user.balance < cost) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 ${cost.toLocaleString('id-ID')}`, ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?').run(cost, userId);
        addI(null, userId, 'chicken_feed', qty);
        await tempReply(interaction, `🌾 Beli Pakan Ayam x**${qty}**! (-🪙 ${cost.toLocaleString('id-ID')})`); return;
    }
    if (customId === `farm_coop_modal_meds_${userId}`) {
        const cost = qty * 250;
        if (user.balance < cost) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 ${cost.toLocaleString('id-ID')}`, ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?').run(cost, userId);
        addI(null, userId, 'chicken_medicine', qty);
        await tempReply(interaction, `💊 Beli Obat Ayam x**${qty}**! (-🪙 ${cost.toLocaleString('id-ID')})`); return;
    }
    if (customId === `farm_coop_modal_premium_${userId}`) {
        const cost = qty * 1200;
        if (user.balance < cost) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 ${cost.toLocaleString('id-ID')}`, ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?').run(cost, userId);
        addI(null, userId, 'premium_feed', qty);
        await tempReply(interaction, `⭐ Beli Pakan Premium x**${qty}**! (-🪙 ${cost.toLocaleString('id-ID')})`); return;
    }

    // Barn modals
    if (customId === `farm_barn_modal_cowfeed_${userId}`) {
        const cost = qty * 90;
        if (user.balance < cost) return interaction.reply({ content: `❌ Saldo kurang!`, ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?').run(cost, userId);
        addI(null, userId, 'cow_feed', qty);
        await tempReply(interaction, `🌾 Beli Pakan Sapi x**${qty}**! (-🪙 ${cost.toLocaleString('id-ID')})`); return;
    }
    if (customId === `farm_barn_modal_sheepfeed_${userId}`) {
        const cost = qty * 70;
        if (user.balance < cost) return interaction.reply({ content: `❌ Saldo kurang!`, ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?').run(cost, userId);
        addI(null, userId, 'sheep_feed', qty);
        await tempReply(interaction, `🌾 Beli Pakan Domba x**${qty}**! (-🪙 ${cost.toLocaleString('id-ID')})`); return;
    }
    if (customId === `farm_barn_modal_cowmeds_${userId}`) {
        const cost = qty * 400;
        if (user.balance < cost) return interaction.reply({ content: `❌ Saldo kurang!`, ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?').run(cost, userId);
        addI(null, userId, 'cow_medicine', qty);
        await tempReply(interaction, `💊 Beli Obat Sapi x**${qty}**! (-🪙 ${cost.toLocaleString('id-ID')})`); return;
    }
    if (customId === `farm_barn_modal_sheepmeds_${userId}`) {
        const cost = qty * 350;
        if (user.balance < cost) return interaction.reply({ content: `❌ Saldo kurang!`, ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?').run(cost, userId);
        addI(null, userId, 'sheep_medicine', qty);
        await tempReply(interaction, `💊 Beli Obat Domba x**${qty}**! (-🪙 ${cost.toLocaleString('id-ID')})`); return;
    }
    if (customId === `farm_barn_modal_premium_${userId}`) {
        const cost = qty * 1200;
        if (user.balance < cost) return interaction.reply({ content: `❌ Saldo kurang!`, ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?').run(cost, userId);
        addI(null, userId, 'premium_feed', qty);
        await tempReply(interaction, `⭐ Beli Pakan Premium x**${qty}**! (-🪙 ${cost.toLocaleString('id-ID')})`); return;
    }
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

        await tempReply(interaction, `🧪 **Craft: ${recipe.emoji} ${recipe.name}!**\n> Bahan: ${ingredients}\n> Hasil: 🪙 **+${recipe.sellPrice.toLocaleString('id-ID')}**`); return;
    }
}

module.exports = {
    buildCoopPanel,
    buildBarnPanel,
    buildCraftingPanel,
    buildStorageHub,
    handleLivestockButton,
    handleLivestockModal,
    handleLivestockSelectMenu,
    isLivestockButton,
    isLivestockModal,
    isLivestockSelectMenu,
};
