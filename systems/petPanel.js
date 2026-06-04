// systems/petPanel.js - Pet Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser, getPetFoodCount, addPetFood, removePetFood, getAllPetFood, getItemCount, addItem, removeItem } = require('../database');
const { getRandomInt } = require('../utils');
const { generatePetStats, simulateBattle, getPetData, getAllPets, addPetExp, checkPetEvolution, evolvePet, getExpNeeded, getPetSkills } = require('./pets');
const { PET_DATA, PET_FOODS, PET_EGGS, PET_CLASSES, PET_ELEMENTS, PET_EVOLUTIONS, PET_SKILL_MILESTONES, PET_LEVEL_MULTIPLIERS, RELIC_NAMES, PET_SKILLS } = require('../data/pets');
const { DUNGEON_TIERS, BOSS_LIST } = require('../data/dungeons');
const { checkAchievements } = require('./achievements');
const { getComboMultiplier, addComboFeature } = require('./combo');
const { updateQuestProgress } = require('./quests');
const { getUserStat, incrementUserStat, addIncome } = require('../database');
const state = require('../state');
const { fishCooldowns, activeBossParties } = state;


// ============ HELPER: Build main pet panel embed + buttons ============
function buildMainPanel(guildId, userId, username) {
    const pet = getPetData(guildId, userId);
    const userData = getOrCreateUser(guildId, userId);

    if (!pet) {
        // No pet - show adopt panel
        const embed = new EmbedBuilder()
            .setTitle('🐾 PET PANEL')
            .setColor('#FF69B4')
            .setDescription(`Halo **${username}**! Kamu belum punya pet.\n\n` +
                `Adopsi pet pertamamu untuk mulai petualangan!\n` +
                `Pet memberi **passive bonus**, bisa diajak **battle**, **dungeon**, dan **boss raid**!\n\n` +
                `> 🛒 Buka **Shop** untuk beli pet atau telur gacha\n` +
                `> 💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**`)
            .setFooter({ text: 'Klik Shop untuk mulai!' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`pet_collection_${userId}`).setLabel('📦 Collection').setStyle(ButtonStyle.Secondary)
        );
        return { embeds: [embed], components: [row] };
    }


    const petDef = PET_DATA.find(p => p.id === pet.petId);
    const expNeeded = getExpNeeded(pet.level);
    const happyPercent = pet.happiness;
    const hungerPercent = pet.hunger;
    const expPercent = Math.min(100, Math.floor((pet.exp / expNeeded) * 100));

    const makeBar = (val) => {
        const filled = Math.floor(val / 10);
        return '█'.repeat(filled) + '░'.repeat(10 - filled);
    };

    const bonusActive = pet.happiness >= 30 && pet.hunger >= 10 && pet.status !== 'sick';
    const lvlMult = PET_LEVEL_MULTIPLIERS[Math.min(pet.level, 30)] || 1.0;
    const bonusValue = bonusActive ? Math.floor(petDef.bonus.value * lvlMult) : 0;
    const isHunting = pet.hunting_until && pet.hunting_until > Date.now();
    const huntInfo = isHunting ? `\n🏹 **HUNTING** — Kembali <t:${Math.floor(pet.hunting_until / 1000)}:R>` : '';

    // Evolution info
    let evoInfo = '';
    const evo = PET_EVOLUTIONS.find(e => e.from === pet.petId);
    if (evo) {
        const evoPetDef = PET_DATA.find(p => p.id === evo.to);
        if (pet.level >= evo.level) evoInfo = `\n🧬 **SIAP EVOLVE!** → ${evoPetDef ? evoPetDef.emoji + ' ' + evoPetDef.name : evo.to}`;
        else evoInfo = `\n🧬 Evolution: Lv.${evo.level} → ${evoPetDef ? evoPetDef.emoji + ' ' + evoPetDef.name : evo.to}`;
    }


    const embed = new EmbedBuilder()
        .setTitle(`🐾 PET PANEL — ${pet.name} (Lv.${pet.level})`)
        .setColor(bonusActive ? '#2ECC71' : '#E74C3C')
        .setDescription(
            `${petDef.emoji} **${petDef.name}** — *${petDef.tier}*\n\n` +
            `❤️ Happy: \`${makeBar(happyPercent)}\` **${happyPercent}%**\n` +
            `🍖 Hunger: \`${makeBar(hungerPercent)}\` **${hungerPercent}%**\n` +
            `✨ EXP: \`${makeBar(expPercent)}\` **${pet.exp}/${expNeeded}**\n\n` +
            `⚔️ ATK: **${pet.atk}** | 🛡️ DEF: **${pet.def}** | 💨 SPD: **${pet.spd}**\n` +
            `❤️ HP: **${pet.hp}** | 🎯 CRIT: **${pet.crit}%**\n` +
            `🎁 Bonus: +**${bonusValue}%** ${petDef.bonus.type.replace(/_/g, ' ')} ${bonusActive ? '✅' : '❌'}` +
            huntInfo + evoInfo
        )
        .setFooter({ text: `💰 ${userData.balance.toLocaleString('id-ID')} | Class: ${pet.class || 'warrior'} | Element: ${pet.element || 'fire'}` });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pet_info_${userId}`).setLabel('📋 Info').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`pet_feed_${userId}`).setLabel('🍖 Feed').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`pet_play_${userId}`).setLabel('🎾 Play').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`pet_hunt_${userId}`).setLabel('🏹 Hunt').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pet_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`pet_collection_${userId}`).setLabel('📦 Collection').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`pet_swap_${userId}`).setLabel('🔄 Swap').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`pet_rename_${userId}`).setLabel('✏️ Rename').setStyle(ButtonStyle.Secondary)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pet_dungeon_${userId}`).setLabel('🏰 Dungeon').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`pet_boss_${userId}`).setLabel('👹 Boss').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`pet_expedition_${userId}`).setLabel('🌊 Expedition').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`pet_fusion_${userId}`).setLabel('🧬 Fusion').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`pet_evolve_${userId}`).setLabel('⬆️ More').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2, row3] };
}


// ============ HANDLER: /pet command (show main panel) ============
async function handlePetCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const panel = buildMainPanel(guildId, userId, interaction.user.username);
    return interaction.reply(panel);
}

// ============ HANDLER: Pet panel button clicks ============
async function handlePetButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    // Format: pet_action_userId or pet_action_extra_userId
    const userId = parts[parts.length - 1];

    // Validate ownership
    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel pet kamu!', ephemeral: true });
    }

    const action = parts[1];
    const userData = getOrCreateUser(guildId, userId);

    // === BACK TO MAIN PANEL ===
    if (action === 'back') {
        const panel = buildMainPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }


    // === INFO (detailed stats) ===
    if (action === 'info') {
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.update(buildMainPanel(guildId, userId, interaction.user.username));
        const petDef = PET_DATA.find(p => p.id === pet.petId);
        const expNeeded = getExpNeeded(pet.level);
        const happyBar = '▰'.repeat(Math.floor(pet.happiness / 10)) + '▱'.repeat(10 - Math.floor(pet.happiness / 10));
        const hungerBar = '▰'.repeat(Math.floor(pet.hunger / 10)) + '▱'.repeat(10 - Math.floor(pet.hunger / 10));
        const expBar = '▰'.repeat(Math.min(10, Math.floor((pet.exp / expNeeded) * 10))) + '▱'.repeat(10 - Math.min(10, Math.floor((pet.exp / expNeeded) * 10)));
        const statusEmoji = pet.status === 'sick' ? '🤒 Sakit!' : pet.happiness >= 70 ? '😊 Bahagia!' : pet.happiness >= 30 ? '😐 Biasa' : '😢 Sedih';
        const bonusActive = pet.happiness >= 30 && pet.hunger >= 10 && pet.status !== 'sick';
        const lvlMult = PET_LEVEL_MULTIPLIERS[Math.min(pet.level, 30)] || 1.0;
        const bonusValue = bonusActive ? Math.floor(petDef.bonus.value * lvlMult) : 0;
        const isHunting = pet.hunting_until && pet.hunting_until > Date.now();

        let skillDesc = '';
        for (const ms of PET_SKILL_MILESTONES) {
            if (pet.level >= ms.level) skillDesc += `> ✅ Lv.${ms.level}: **${ms.skill.name}**\n`;
            else skillDesc += `> 🔒 Lv.${ms.level}: ${ms.skill.name}\n`;
        }

        // Active Battle Skills
        const activeSkills = getPetSkills(pet);
        let battleSkillDesc = '';
        if (activeSkills.length > 0) {
            activeSkills.forEach(s => {
                battleSkillDesc += `> ${s.emoji} **${s.name}** (T${s.tier}) — *${s.desc}* | CD: ${s.cooldown} turns\n`;
            });
        } else {
            battleSkillDesc = '> *Belum ada skill aktif (unlock di Lv.10)*\n';
        }
        // Show locked tiers
        const skillTiers = [{ tier: 1, level: 10 }, { tier: 2, level: 30 }, { tier: 3, level: 60 }, { tier: 4, level: 100 }];
        for (const st of skillTiers) {
            const hasThisTier = activeSkills.some(s => s.tier === st.tier);
            if (!hasThisTier && pet.level < st.level) {
                battleSkillDesc += `> 🔒 Tier ${st.tier} — Unlock di **Lv.${st.level}**\n`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`${petDef.emoji} ${pet.name} — Detailed Info`)
            .setColor(bonusActive ? '#2ECC71' : '#E74C3C')
            .setDescription(
                `**${petDef.name}** — *${petDef.tier}*\n\n` +
                `> ❤️ Happiness: \`${happyBar}\` **${pet.happiness}%**\n` +
                `> 🍖 Hunger: \`${hungerBar}\` **${pet.hunger}%**\n` +
                `> ✨ EXP: \`${expBar}\` **${pet.exp}/${expNeeded}**\n` +
                `> 💪 Status: ${statusEmoji}\n\n` +
                `🎁 **Passive Bonus** ${bonusActive ? '(AKTIF ✅)' : '(MATI ❌)'}:\n` +
                `> +**${bonusValue}%** ${petDef.bonus.type.replace(/_/g, ' ')}` +
                `${!bonusActive ? '\n> ⚠️ *Happiness/Hunger terlalu rendah atau pet sakit!*' : ''}\n\n` +
                `⚔️ **Battle Stats:**\n` +
                `> Class: **${pet.class || 'warrior'}** | Element: **${pet.element || 'fire'}**\n` +
                `> HP: \`${pet.hp}\` | ATK: \`${pet.atk}\` | DEF: \`${pet.def}\`\n` +
                `> SPD: \`${pet.spd}\` | CRIT: \`${pet.crit}%\``
            );

        if (isHunting) embed.addFields({ name: '🏹 HUNTING', value: `> Kembali <t:${Math.floor(pet.hunting_until / 1000)}:R>\n> ⚠️ Buff MATI selama hunt`, inline: false });
        embed.addFields({ name: '🌟 Skill Buffs (Passive)', value: skillDesc || '> Belum ada skill', inline: false });
        embed.addFields({ name: '⚔️ Skills (Battle Active)', value: battleSkillDesc, inline: false });

        const evo = PET_EVOLUTIONS.find(e => e.from === pet.petId);
        if (evo) {
            const evoPetDef = PET_DATA.find(p => p.id === evo.to);
            const canEvolve = pet.level >= evo.level;
            const evoStatus = canEvolve ? '✅ **SIAP EVOLVE!**' : `🔒 Butuh **Lv.${evo.level}** (sekarang: Lv.${pet.level})`;
            embed.addFields({ name: '🧬 Evolution', value: `> ${evo.name}\n> → ${evoPetDef ? evoPetDef.emoji + ' ' + evoPetDef.name : evo.to}\n> ${evoStatus}`, inline: false });
        }

        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }


    // === FEED (show food select menu) ===
    if (action === 'feed') {
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
        const owned = getAllPetFood(guildId, userId);
        if (owned.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('🍖 Feed Pet')
                .setColor('#E74C3C')
                .setDescription(`📦 Inventory makanan **kosong**!\n\nBeli makanan dulu di Shop.`)
                .setFooter({ text: `${pet.name} — Hunger: ${pet.hunger}% | Happy: ${pet.happiness}%` });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }

        const foodMenu = new StringSelectMenuBuilder()
            .setCustomId(`pet_feed_select_${userId}`)
            .setPlaceholder('🍖 Pilih makanan...')
            .setMinValues(1).setMaxValues(1);
        owned.forEach(inv => {
            const f = PET_FOODS.find(pf => pf.id === inv.foodId);
            if (!f) return;
            foodMenu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`${f.name} (x${inv.quantity}) — +${f.hunger} hunger +${f.happiness} happy`)
                .setValue(f.id)
                .setEmoji(f.emoji));
        });

        const embed = new EmbedBuilder()
            .setTitle(`🍖 Feed ${pet.name}`)
            .setColor('#F39C12')
            .setDescription(`Pilih makanan dari inventory:\n\n> 🍖 Hunger: **${pet.hunger}%**\n> ❤️ Happy: **${pet.happiness}%**`)
            .setFooter({ text: 'Pilih makanan di menu bawah' });
        const row1 = new ActionRowBuilder().addComponents(foodMenu);
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }


    // === PLAY (instant action) ===
    if (action === 'play') {
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
        const playCdKey = `pet_play_${guildId}_${userId}`;
        if (fishCooldowns.has(playCdKey) && Date.now() < fishCooldowns.get(playCdKey)) {
            const remSec = Math.ceil((fishCooldowns.get(playCdKey) - Date.now()) / 1000);
            return interaction.reply({ content: `⏳ ${pet.name} masih capek! Tunggu **${remSec > 60 ? Math.ceil(remSec/60) + ' menit' : remSec + ' detik'}** lagi.`, ephemeral: true });
        }
        fishCooldowns.set(playCdKey, Date.now() + 180000);
        addComboFeature(guildId, userId, 'pet');
        updateQuestProgress(guildId, userId, 'pet_play', 1);
        const newHappy = Math.min(100, pet.happiness + 10);
        const newHunger = Math.max(0, pet.hunger - 3);
        db.prepare('UPDATE pets SET happiness = ?, hunger = ? WHERE id = ?').run(newHappy, newHunger, pet.id);
        const expResult = addPetExp(guildId, userId, 8);
        let lvlUpMsg = '';
        if (expResult && expResult.leveledUp) lvlUpMsg = `\n\n🎉 **LEVEL UP!** ${expResult.petName} → Lv.${expResult.newLevel}!`;
        if (expResult && expResult.newSkill) lvlUpMsg += `\n> 🌟 **SKILL UNLOCKED:** ${expResult.newSkill.skill.name}!`;
        const activities = ['bermain kejar-kejaran', 'bermain bola', 'bermain petak umpet', 'berguling-guling', 'melompat-lompat'];
        const activity = activities[Math.floor(Math.random() * activities.length)];
        const petDef = PET_DATA.find(p => p.id === pet.petId);

        const embed = new EmbedBuilder()
            .setTitle(`🎾 ${pet.name} ${activity}!`)
            .setColor('#2ECC71')
            .setDescription(
                `${petDef ? petDef.emoji : '🐾'} **${pet.name}** bersenang-senang!\n\n` +
                `> ❤️ Happy: +10 → **${newHappy}%**\n` +
                `> 🍖 Hunger: -3 → **${newHunger}%**\n` +
                `> ✨ +8 EXP${lvlUpMsg}`
            );
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_play_${userId}`).setLabel('🎾 Main Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }


    // === HUNT ===
    if (action === 'hunt') {
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
        if (pet.happiness < 50) return interaction.reply({ content: '❌ Pet terlalu sedih untuk berburu! (Happiness harus > 50)', ephemeral: true });
        // Check if pet is on expedition
        const { getActiveExpedition } = require('./expedition');
        const activeExp = getActiveExpedition(guildId, userId);
        if (activeExp) return interaction.reply({ content: '❌ Pet sedang dalam ekspedisi! Tunggu sampai selesai.', ephemeral: true });
        const petDef = PET_DATA.find(p => p.id === pet.petId);

        // Check if hunt finished - collect rewards
        if (pet.hunting_until && pet.hunting_until > 0 && pet.hunting_until <= Date.now()) {
            db.prepare('UPDATE pets SET hunting_until = 0 WHERE id = ?').run(pet.id);
            const success = Math.random() > 0.2;
            let embed;
            incrementUserStat(guildId, userId, 'hunt_missions');
            if (success) {
                const reward = getRandomInt(30, 150);
                userData.balance += reward;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, userId);
                addIncome(guildId, userId, 'battle', reward);
                const expResult = addPetExp(guildId, userId, 20);
                let lvlMsg = '';
                if (expResult && expResult.leveledUp) lvlMsg = `\n> 🎉 **LEVEL UP!** ${expResult.petName} → Lv.${expResult.newLevel}!`;
                if (expResult && expResult.newSkill) lvlMsg += `\n> 🌟 **SKILL UNLOCKED:** ${expResult.newSkill.skill.name}!`;
                embed = new EmbedBuilder().setColor('#2ECC71').setTitle('🏹 Hunt Complete!')
                    .setDescription(`${petDef ? petDef.emoji : '🐾'} **${pet.name}** kembali dari berburu!\n\n> ✅ Hasil: 🪙 **${reward} Money**\n> ✨ Pet EXP: +20${lvlMsg}\n\n*Buff pet kembali aktif!*`);
            } else {
                addPetExp(guildId, userId, 8);
                embed = new EmbedBuilder().setColor('#E74C3C').setTitle('🏹 Hunt Gagal...')
                    .setDescription(`${petDef ? petDef.emoji : '🐾'} **${pet.name}** pulang tanpa hasil.\n\n> ❌ Tidak menemukan apa-apa\n> ✨ Pet EXP: +8\n\n*Buff pet kembali aktif!*`);
            }
            const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_hunt_${userId}`).setLabel('🏹 Hunt Lagi').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [backRow] });
        }

        // Still hunting
        if (pet.hunting_until && pet.hunting_until > Date.now()) {
            const remaining = Math.ceil((pet.hunting_until - Date.now()) / 60000);
            return interaction.reply({ content: `⏳ ${pet.name} masih berburu! Kembali dalam **${remaining} menit**.\nKlik Hunt lagi nanti untuk mengambil hasil.`, ephemeral: true });
        }

        // Start new hunt
        const huntDuration = getRandomInt(10, 20) * 60000;
        const huntEnd = Date.now() + huntDuration;
        db.prepare('UPDATE pets SET hunting_until = ?, hunger = MAX(0, hunger - 20) WHERE id = ?').run(huntEnd, pet.id);
        const durationMin = Math.round(huntDuration / 60000);
        const embed = new EmbedBuilder().setColor('#F39C12').setTitle('🏹 Pet Hunt Started!')
            .setDescription(`${petDef ? petDef.emoji : '🐾'} **${pet.name}** pergi berburu!\n\n> ⏱️ Durasi: **${durationMin} menit**\n> ⚠️ Semua buff pet **MATI** selama hunt\n> 🍖 Hunger: -20\n\nKlik Hunt lagi nanti untuk mengambil hasil.`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }


    // === SHOP (food + egg menus) ===
    if (action === 'shop') {
        let desc = '**🍖 MAKANAN PET** *(masuk ke inventory, pakai Feed)*\n\n';
        PET_FOODS.forEach(f => { desc += `> ${f.emoji} **${f.name}** — 🪙 ${f.price} | +${f.hunger} hunger +${f.happiness} happy\n`; });
        desc += '\n━━━━━━━━━━━━━━━━━━━━━━\n**🥚 PET EGGS (Gacha)**\n\n';
        PET_EGGS.forEach(e => { const rates = Object.entries(e.rates).map(([t, r]) => `${t}: ${r}%`).join(', '); desc += `> ${e.emoji} **${e.name}** — 🪙 ${e.price.toLocaleString('id-ID')}\n> Rates: ${rates}\n`; });
        if (desc.length > 4000) desc = desc.substring(0, 3990) + '...';

        const foodMenu = new StringSelectMenuBuilder().setCustomId(`pet_shopfood_select_${userId}`).setPlaceholder('🍖 Beli Makanan...').setMinValues(1).setMaxValues(1);
        PET_FOODS.forEach(f => foodMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${f.name} — 🪙${f.price}`).setValue(f.id).setDescription(`Hunger +${f.hunger} | Happy +${f.happiness}`).setEmoji(f.emoji)));
        const eggMenu = new StringSelectMenuBuilder().setCustomId(`pet_shopegg_select_${userId}`).setPlaceholder('🥚 Beli & Buka Egg (Gacha)...').setMinValues(1).setMaxValues(1);
        PET_EGGS.forEach(e => eggMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${e.name} — 🪙${e.price.toLocaleString('id-ID')}`).setValue(e.id).setDescription('Gacha Pet Egg')));

        const embed = new EmbedBuilder().setTitle('🛒 Pet Shop').setColor('#FF69B4').setDescription(desc)
            .setFooter({ text: `💰 Saldo: ${userData.balance.toLocaleString('id-ID')}` });
        const row1 = new ActionRowBuilder().addComponents(foodMenu);
        const row2 = new ActionRowBuilder().addComponents(eggMenu);
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row1, row2, row3] });
    }


    // === COLLECTION ===
    if (action === 'collection') {
        const allPets = getAllPets(guildId, userId);
        if (allPets.length === 0) {
            const embed = new EmbedBuilder().setTitle('📦 Pet Collection').setColor('#FF69B4')
                .setDescription('🐾 Belum punya pet! Beli di Shop untuk mulai.');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }
        let desc = `🐾 **Pet Collection** (${allPets.length}/10 slot)\n\n`;
        const tierOrder = ['Mythic', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'];
        const sorted = allPets.sort((a, b) => {
            const ta = tierOrder.indexOf(PET_DATA.find(p => p.id === a.petId)?.tier || 'Common');
            const tb = tierOrder.indexOf(PET_DATA.find(p => p.id === b.petId)?.tier || 'Common');
            return ta - tb;
        });
        sorted.forEach(pet => {
            const def = PET_DATA.find(p => p.id === pet.petId);
            desc += `${pet.active ? '⭐' : '▪️'} **#${pet.id}** ${def ? def.emoji : '🐾'} **${pet.name}** (Lv.${pet.level}) — *${def ? def.tier : '?'}*\n`;
        });
        desc += `\n> ⭐ = Pet Aktif | Klik Swap untuk ganti`;

        const embed = new EmbedBuilder().setTitle('📦 Pet Collection').setColor('#FF69B4').setDescription(desc);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_swap_${userId}`).setLabel('🔄 Swap Pet').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }


    // === SWAP (select menu of owned pets) ===
    if (action === 'swap') {
        const allPets = getAllPets(guildId, userId);
        if (allPets.length <= 1) return interaction.reply({ content: '❌ Kamu hanya punya 1 pet! Tidak bisa swap.', ephemeral: true });
        const swapMenu = new StringSelectMenuBuilder()
            .setCustomId(`pet_swap_select_${userId}`)
            .setPlaceholder('🔄 Pilih pet untuk diaktifkan...')
            .setMinValues(1).setMaxValues(1);
        allPets.forEach(pet => {
            const def = PET_DATA.find(p => p.id === pet.petId);
            swapMenu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`#${pet.id} ${pet.name} (Lv.${pet.level}) — ${def ? def.tier : '?'}`)
                .setValue(pet.id.toString())
                .setDescription(pet.active ? '⭐ Currently Active' : `${def ? def.bonus.type.replace(/_/g, ' ') : ''}`));
        });
        const embed = new EmbedBuilder().setTitle('🔄 Swap Pet').setColor('#3498DB')
            .setDescription('Pilih pet yang mau diaktifkan:');
        const row1 = new ActionRowBuilder().addComponents(swapMenu);
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }

    // === RENAME (modal popup) ===
    if (action === 'rename') {
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
        const modal = new ModalBuilder()
            .setCustomId(`pet_rename_modal_${userId}`)
            .setTitle(`✏️ Rename ${pet.name}`);
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('pet_new_name')
                .setLabel('Nama Baru (max 10 karakter)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(10)
                .setPlaceholder(pet.name)
        ));
        return interaction.showModal(modal);
    }


    // === EXPEDITION (redirect to expedition panel) ===
    if (action === 'expedition') {
        const { buildExpeditionPanel } = require('./expedition');
        const panel = buildExpeditionPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    // === FUSION (redirect to fusion panel) ===
    if (action === 'fusion') {
        const { buildFusionPanel } = require('./petFusion');
        const panel = buildFusionPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    // === EVOLVE (now serves as "More" menu with Refine + Evolve) ===
    if (action === 'evolve') {
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
        const petDef = PET_DATA.find(p => p.id === pet.petId);
        const evo = PET_EVOLUTIONS.find(e => e.from === pet.petId);

        let desc = `${petDef ? petDef.emoji : '🐾'} **${pet.name}** (Lv.${pet.level})\n\n`;
        desc += `**⬆️ Fitur Upgrade:**\n`;
        desc += `> 📿 **Refine** — Upgrade relic equipment\n`;
        desc += `> 🧬 **Evolve** — Evolusi pet ke bentuk baru\n`;
        if (evo) {
            const evoPetDef = PET_DATA.find(p => p.id === evo.to);
            const canEvolve = pet.level >= evo.level;
            desc += `\n**🧬 Evolution:**\n`;
            desc += `> ${evo.name}\n`;
            desc += `> → ${evoPetDef ? evoPetDef.emoji + ' ' + evoPetDef.name : evo.to}\n`;
            desc += `> ${canEvolve ? '✅ **SIAP EVOLVE!**' : `🔒 Butuh Lv.${evo.level}`}\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle('⬆️ Upgrade Menu')
            .setColor('#9B59B6')
            .setDescription(desc);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_refine_${userId}`).setLabel('📿 Refine').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`pet_doevolve_${userId}`).setLabel('🧬 Evolve').setStyle(ButtonStyle.Success).setDisabled(!evo || pet.level < evo.level),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === DUNGEON (select menu of tiers) ===
    if (action === 'dungeon') {
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
        const dungeonMenu = new StringSelectMenuBuilder()
            .setCustomId(`pet_dungeon_select_${userId}`)
            .setPlaceholder('🏰 Pilih dungeon...')
            .setMinValues(1).setMaxValues(1);
        DUNGEON_TIERS.forEach(d => {
            const canEnter = pet.level >= d.minLevel;
            dungeonMenu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`${d.name} (Lv.${d.minLevel}+, ${d.waves} waves)`)
                .setValue(d.id)
                .setDescription(`${canEnter ? '✅' : '🔒'} Reward: 🪙${d.reward[0]}-${d.reward[1]} | ${d.exp} EXP`));
        });
        const embed = new EmbedBuilder().setTitle('🏰 Dungeon').setColor('#9B59B6')
            .setDescription(`${PET_DATA.find(p => p.id === pet.petId)?.emoji || '🐾'} **${pet.name}** (Lv.${pet.level})\n\nPilih dungeon untuk masuk:`);
        const row1 = new ActionRowBuilder().addComponents(dungeonMenu);
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }

    // === BOSS (select action) ===
    if (action === 'boss') {
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
        const bossMenu = new StringSelectMenuBuilder()
            .setCustomId(`pet_boss_select_${userId}`)
            .setPlaceholder('👹 Pilih aksi boss...')
            .setMinValues(1).setMaxValues(1);
        bossMenu.addOptions(
            new StringSelectMenuOptionBuilder().setLabel('📋 Lihat Daftar Boss').setValue('list').setDescription('Lihat semua boss yang tersedia'),
            new StringSelectMenuOptionBuilder().setLabel('⚔️ Solo Boss').setValue('solo').setDescription('Lawan boss sendirian'),
            new StringSelectMenuOptionBuilder().setLabel('🎮 Buat Party').setValue('create').setDescription('Buat party untuk raid boss')
        );
        const embed = new EmbedBuilder().setTitle('👹 Boss Battle').setColor('#E74C3C')
            .setDescription(`${PET_DATA.find(p => p.id === pet.petId)?.emoji || '🐾'} **${pet.name}** (Lv.${pet.level})\n\nPilih aksi:`);
        const row1 = new ActionRowBuilder().addComponents(bossMenu);
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }


    // === REFINE (select slot) ===
    if (action === 'refine') {
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
        const refineMenu = new StringSelectMenuBuilder()
            .setCustomId(`pet_refine_select_${userId}`)
            .setPlaceholder('📿 Pilih slot relic...')
            .setMinValues(1).setMaxValues(1);
        refineMenu.addOptions(
            new StringSelectMenuOptionBuilder().setLabel('⚔️ Weapon').setValue('weapon').setDescription('Refine weapon relic'),
            new StringSelectMenuOptionBuilder().setLabel('🛡️ Armor').setValue('armor').setDescription('Refine armor relic'),
            new StringSelectMenuOptionBuilder().setLabel('💍 Accessory').setValue('accessory').setDescription('Refine accessory relic')
        );
        const hasStone = getItemCount(guildId, userId, 'refine_stone');
        const embed = new EmbedBuilder().setTitle('📿 Refine Relic').setColor('#FFD700')
            .setDescription(`Pilih slot relic untuk refine:\n\n> 🪨 Refine Stone: **${hasStone}** buah\n> ⚠️ Rate turun setelah +10`);
        const row1 = new ActionRowBuilder().addComponents(refineMenu);
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }

    // === EVOLVE (instant action) ===
    if (action === 'evolve') {
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
        const evo = checkPetEvolution(guildId, userId);
        if (!evo) {
            // Show specific requirements
            const { PET_EVOLUTIONS } = require('../data/pets');
            const possibleEvo = PET_EVOLUTIONS.find(e => e.from === pet.petId);
            let hint = '';
            if (possibleEvo) {
                hint = `\n\n> 📋 **Syarat Evolve:**\n> 🐾 Pet: **${pet.petId}** ✅\n> 📈 Level: **${pet.level}** / **${possibleEvo.level}** ${pet.level >= possibleEvo.level ? '✅' : '❌'}\n> 🔄 Evolve ke: **${possibleEvo.name}**`;
            } else {
                hint = `\n\n> ℹ️ Pet **${pet.name}** (${pet.petId}) tidak memiliki evolusi.`;
            }
            return interaction.reply({ content: `❌ **${pet.name}** belum bisa evolve!${hint}`, ephemeral: true });
        }
        const result = evolvePet(guildId, userId);
        if (!result) return interaction.reply({ content: '❌ Gagal evolve!', ephemeral: true });
        const oldDef = PET_DATA.find(p => p.id === evo.from);
        const embed = new EmbedBuilder().setColor('#FFD700').setTitle('🧬 PET EVOLUTION!')
            .setDescription(`${oldDef ? oldDef.emoji : '🐾'} **${pet.name}** berevolusi!\n\n> 🔄 **${evo.name}**\n> ${result.newPetDef.emoji} Tier: **${result.newPetDef.tier}**\n\n> ⚔️ ATK: ${result.newStats.atk} | 🛡️ DEF: ${result.newStats.def}\n> ❤️ HP: ${result.newStats.hp} | 💨 SPD: ${result.newStats.spd}\n> 🎯 CRIT: ${result.newStats.crit}%\n\n🎉 *Selamat! Pet kamu sekarang jauh lebih kuat!*`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali ke Panel').setStyle(ButtonStyle.Success)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    return null; // Not handled
}


// ============ HANDLER: Pet panel select menu interactions ============
async function handlePetSelectMenu(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel pet kamu!', ephemeral: true });
    }

    const userData = getOrCreateUser(guildId, userId);

    // === FEED SELECT ===
    if (customId.startsWith('pet_feed_select_')) {
        const foodId = interaction.values[0];
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
        const food = PET_FOODS.find(f => f.id === foodId);
        if (!food) return interaction.reply({ content: '❌ Makanan tidak ditemukan!', ephemeral: true });
        const owned = getPetFoodCount(guildId, userId, foodId);
        if (owned <= 0) return interaction.reply({ content: `❌ Kamu tidak punya **${food.emoji} ${food.name}**!`, ephemeral: true });
        removePetFood(guildId, userId, foodId, 1);
        const newHunger = Math.min(100, pet.hunger + food.hunger);
        const newHappy = Math.min(100, pet.happiness + food.happiness);
        const newStatus = pet.status === 'sick' && newHunger > 50 ? 'happy' : pet.status;
        db.prepare('UPDATE pets SET hunger = ?, happiness = ?, exp = exp + 5, status = ? WHERE id = ?').run(newHunger, newHappy, newStatus, pet.id);
        const sisa = getPetFoodCount(guildId, userId, foodId);
        const petDef = PET_DATA.find(p => p.id === pet.petId);

        const embed = new EmbedBuilder()
            .setTitle(`🍖 ${pet.name} makan ${food.name}!`)
            .setColor('#2ECC71')
            .setDescription(`${petDef ? petDef.emoji : '🐾'} ${food.emoji}\n\n> 🍖 Hunger: ${pet.hunger}% → **${newHunger}%**\n> ❤️ Happy: ${pet.happiness}% → **${newHappy}%**\n> ✨ +5 EXP\n> 📦 Sisa ${food.name}: **${sisa}**`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_feed_${userId}`).setLabel('🍖 Feed Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }


    // === SHOP FOOD SELECT ===
    if (customId.startsWith('pet_shopfood_select_')) {
        const foodId = interaction.values[0];
        const food = PET_FOODS.find(f => f.id === foodId);
        if (!food) return interaction.reply({ content: '❌ Food tidak ditemukan!', ephemeral: true });
        if (userData.balance < food.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${food.price}**`, ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(food.price, guildId, userId);
        addPetFood(guildId, userId, foodId, 1);
        updateQuestProgress(guildId, userId, 'spend_money', food.price);
        const owned = getPetFoodCount(guildId, userId, foodId);
        const embed = new EmbedBuilder().setTitle('✅ Pembelian Berhasil!').setColor('#2ECC71')
            .setDescription(`${food.emoji} **${food.name}** masuk ke inventory!\n\n> 📦 Total ${food.name}: **${owned}**\n> 💰 Saldo: 🪙 **${(userData.balance - food.price).toLocaleString('id-ID')}**`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_shop_${userId}`).setLabel('🛒 Beli Lagi').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    // === SHOP EGG SELECT ===
    if (customId.startsWith('pet_shopegg_select_')) {
        const eggId = interaction.values[0];
        const egg = PET_EGGS.find(e => e.id === eggId);
        if (!egg) return interaction.reply({ content: '❌ Egg tidak ditemukan!', ephemeral: true });
        if (userData.balance < egg.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${egg.price.toLocaleString('id-ID')}**`, ephemeral: true });
        const allPets = getAllPets(guildId, userId);
        if (allPets.length >= 10) return interaction.reply({ content: '❌ Slot pet penuh (max 10)!', ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(egg.price, guildId, userId);
        updateQuestProgress(guildId, userId, 'spend_money', egg.price);
        let roll = Math.random() * 100, cumulative = 0, selectedTier = 'Common';
        for (const [tier, rate] of Object.entries(egg.rates)) { cumulative += rate; if (roll <= cumulative) { selectedTier = tier; break; } }
        const tierPets = PET_DATA.filter(p => p.tier === selectedTier);
        const wonPet = tierPets[Math.floor(Math.random() * tierPets.length)];
        const isFirst = allPets.length === 0 ? 1 : 0;
        const stats = generatePetStats(selectedTier);
        const pClass = PET_CLASSES[Math.floor(Math.random() * PET_CLASSES.length)];
        const pElement = PET_ELEMENTS[Math.floor(Math.random() * PET_ELEMENTS.length)];
        db.prepare('INSERT INTO pets (guildId, userId, petId, name, active, adoptedAt, class, element, hp, atk, def, spd, crit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(guildId, userId, wonPet.id, wonPet.name, isFirst, Date.now(), pClass, pElement, stats.hp, stats.atk, stats.def, stats.spd, stats.crit);
        const tierColors = { Common: '#AAAAAA', Uncommon: '#2ECC71', Rare: '#3498DB', Epic: '#9B59B6', Legendary: '#FFD700', Mythic: '#FF6B6B' };
        let title = '🥚 Egg Hatched!';
        if (selectedTier === 'Mythic') title = '🌟✨ MYTHIC PET!!! ✨🌟';
        else if (selectedTier === 'Legendary') title = '⭐ LEGENDARY PET! ⭐';
        else if (selectedTier === 'Epic') title = '💜 EPIC PET! 💜';
        const embed = new EmbedBuilder().setColor(tierColors[selectedTier] || '#2B2D31').setTitle(title)
            .setDescription(`${wonPet.emoji} **${wonPet.name}**\n> Tier: **${selectedTier}**\n> Bonus: +${wonPet.bonus.value}% ${wonPet.bonus.type.replace(/_/g, ' ')}\n\n${isFirst ? '✅ Langsung aktif!' : 'Gunakan Swap untuk mengaktifkan.'}`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_shop_${userId}`).setLabel('🛒 Beli Lagi').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }


    // === SWAP SELECT ===
    if (customId.startsWith('pet_swap_select_')) {
        const petDbId = parseInt(interaction.values[0]);
        const targetPet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(petDbId, guildId, userId);
        if (!targetPet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
        db.prepare('UPDATE pets SET active = 0 WHERE guildId = ? AND userId = ?').run(guildId, userId);
        db.prepare('UPDATE pets SET active = 1 WHERE id = ?').run(petDbId);
        const def = PET_DATA.find(p => p.id === targetPet.petId);
        const embed = new EmbedBuilder().setTitle('✅ Pet Swapped!').setColor('#2ECC71')
            .setDescription(`Pet aktif diganti ke ${def ? def.emoji : '🐾'} **${targetPet.name}** (Lv.${targetPet.level})`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali ke Panel').setStyle(ButtonStyle.Success)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    // === DUNGEON SELECT ===
    if (customId.startsWith('pet_dungeon_select_')) {
        const tierId = interaction.values[0];
        const dungeon = DUNGEON_TIERS.find(d => d.id === tierId);
        if (!dungeon) return interaction.reply({ content: '❌ Dungeon tidak ditemukan!', ephemeral: true });
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
        if (pet.level < dungeon.minLevel) return interaction.reply({ content: `❌ Pet butuh minimal **Level ${dungeon.minLevel}**! (Sekarang: Lv.${pet.level})`, ephemeral: true });
        const dungeonCd = `dungeon_${guildId}_${userId}`;
        if (fishCooldowns.has(dungeonCd) && Date.now() < fishCooldowns.get(dungeonCd)) {
            const rem = Math.ceil((fishCooldowns.get(dungeonCd) - Date.now()) / 60000);
            return interaction.reply({ content: `⏳ Dungeon cooldown! Tunggu **${rem} menit**.`, ephemeral: true });
        }
        fishCooldowns.set(dungeonCd, Date.now() + (dungeon.cooldown || 300000));
        addComboFeature(guildId, userId, 'dungeon');
        const petDef = PET_DATA.find(p => p.id === pet.petId);
        const enemies = dungeon.monsterHp.map((hp, i) => ({ hp, atk: dungeon.monsterAtk[i], def: Math.floor(dungeon.monsterAtk[i] * 0.3) }));

        // Show "entering dungeon" then resolve
        const enterEmbed = new EmbedBuilder().setColor('#F39C12').setTitle(`🏰 ${dungeon.name}`)
            .setDescription(`${petDef.emoji} **${pet.name}** memasuki dungeon...\n\n> ⚔️ *Pertarungan sedang berlangsung...*`);
        await interaction.update({ embeds: [enterEmbed], components: [] });

        setTimeout(async () => {
            const result = simulateBattle(pet, petDef, enemies);
            let reward = 0, expGain = 0;
            if (result.alive) {
                reward = getRandomInt(dungeon.reward[0], dungeon.reward[1]);
                const comboMult = getComboMultiplier(guildId, userId);
                reward = Math.floor(reward * comboMult);
                expGain = dungeon.exp;
                db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(reward, guildId, userId);
                addPetExp(guildId, userId, expGain);
                incrementUserStat(guildId, userId, 'dungeon_clears');
                addIncome(guildId, userId, 'battle', reward);
                updateQuestProgress(guildId, userId, 'dungeon', 1);
                await checkAchievements(interaction.guild, userId, { type: 'dungeon_clear' });
            } else {
                const freshData = getOrCreateUser(guildId, userId);
                const penalty = Math.floor(freshData.balance * 0.1);
                db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(penalty, guildId, userId);
                db.prepare('UPDATE pets SET happiness = MAX(0, happiness - 20) WHERE id = ?').run(pet.id);
                addPetExp(guildId, userId, Math.floor(dungeon.exp * 0.3));
                reward = -penalty;
            }
            const statusText = result.alive
                ? `🏆 **CLEAR!**\n> 🪙 +${reward.toLocaleString('id-ID')} Money\n> ✨ +${expGain} Pet EXP\n> ❤️ HP sisa: ${result.remainingHp}`
                : `💀 **FAILED!**\n> 🪙 -${Math.abs(reward).toLocaleString('id-ID')} Money (10%)\n> ❤️ Happiness -20`;
            const embed = new EmbedBuilder().setColor(result.alive ? '#2ECC71' : '#E74C3C').setTitle(`🏰 ${dungeon.name}`)
                .setDescription(`${result.log.join('\n')}\n\n━━━━━━ **RESULT** ━━━━━━\n${statusText}`)
                .setFooter({ text: `Pet: ${pet.name} Lv.${pet.level} | CD: ${Math.round((dungeon.cooldown||300000)/60000)} menit` });
            const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_dungeon_${userId}`).setLabel('🏰 Dungeon Lagi').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            interaction.editReply({ embeds: [embed], components: [backRow] }).catch(() => {});
        }, 3000);
        return;
    }


    // === BOSS SELECT ===
    if (customId.startsWith('pet_boss_select_')) {
        const selected = interaction.values[0];
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
        const petDef = PET_DATA.find(p => p.id === pet.petId);

        if (selected === 'list') {
            let desc = '👹 **DAFTAR BOSS**\n\n';
            BOSS_LIST.forEach(b => { desc += `${b.name}\n> Level: **${b.minLevel}+** | HP: **${b.hp.toLocaleString()}** | ATK: ${b.atk} | DEF: ${b.def}\n> Reward: 🪙 ${b.reward[0].toLocaleString()}-${b.reward[1].toLocaleString()} + ${b.exp} Pet EXP\n\n`; });
            const embed = new EmbedBuilder().setTitle('👹 Boss List').setColor('#E74C3C').setDescription(desc);
            const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_boss_${userId}`).setLabel('👹 Boss Menu').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [backRow] });
        }

        if (selected === 'solo') {
            // Show boss select for solo
            const bossSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`pet_bosssolo_select_${userId}`)
                .setPlaceholder('👹 Pilih boss untuk solo...')
                .setMinValues(1).setMaxValues(1);
            BOSS_LIST.forEach(b => {
                const canFight = pet.level >= b.minLevel;
                bossSelectMenu.addOptions(new StringSelectMenuOptionBuilder()
                    .setLabel(`${b.name} (Lv.${b.minLevel}+)`)
                    .setValue(b.id)
                    .setDescription(`${canFight ? '✅' : '🔒'} HP: ${b.hp.toLocaleString()} | Reward: 🪙${b.reward[0]}-${b.reward[1]}`));
            });
            const embed = new EmbedBuilder().setTitle('⚔️ Solo Boss').setColor('#E74C3C')
                .setDescription(`${petDef ? petDef.emoji : '🐾'} **${pet.name}** (Lv.${pet.level})\nPilih boss untuk dilawan:`);
            const row1 = new ActionRowBuilder().addComponents(bossSelectMenu);
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_boss_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [row1, row2] });
        }

        if (selected === 'create') {
            // Show boss select for party create
            const bossCreateMenu = new StringSelectMenuBuilder()
                .setCustomId(`pet_bosscreate_select_${userId}`)
                .setPlaceholder('👹 Pilih boss untuk party...')
                .setMinValues(1).setMaxValues(1);
            BOSS_LIST.forEach(b => {
                const canFight = pet.level >= b.minLevel;
                bossCreateMenu.addOptions(new StringSelectMenuOptionBuilder()
                    .setLabel(`${b.name} (Lv.${b.minLevel}+)`)
                    .setValue(b.id)
                    .setDescription(`${canFight ? '✅' : '🔒'} HP: ${b.hp.toLocaleString()} | Party 1-10`));
            });
            const embed = new EmbedBuilder().setTitle('🎮 Create Boss Party').setColor('#E74C3C')
                .setDescription(`${petDef ? petDef.emoji : '🐾'} **${pet.name}** (Lv.${pet.level})\nPilih boss untuk party raid:`);
            const row1 = new ActionRowBuilder().addComponents(bossCreateMenu);
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_boss_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [row1, row2] });
        }
    }


    // === BOSS SOLO SELECT (actual boss fight) ===
    if (customId.startsWith('pet_bosssolo_select_')) {
        const bossId = interaction.values[0];
        const boss = BOSS_LIST.find(b => b.id === bossId);
        if (!boss) return interaction.reply({ content: '❌ Boss tidak ditemukan!', ephemeral: true });
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
        if (pet.level < boss.minLevel) return interaction.reply({ content: `❌ Pet butuh minimal **Lv.${boss.minLevel}**!`, ephemeral: true });
        const bossCd = `boss_${guildId}_${userId}`;
        if (fishCooldowns.has(bossCd) && Date.now() < fishCooldowns.get(bossCd)) {
            const rem = Math.ceil((fishCooldowns.get(bossCd) - Date.now()) / 60000);
            return interaction.reply({ content: `⏳ Boss cooldown! Tunggu **${rem} menit**.`, ephemeral: true });
        }
        fishCooldowns.set(bossCd, Date.now() + 600000);
        const petDef = PET_DATA.find(p => p.id === pet.petId);
        const result = simulateBattle(pet, petDef, [{ hp: boss.hp, atk: boss.atk, def: boss.def }]);

        let reward = 0, expGain = 0;
        let relicDrop = '';
        if (result.alive) {
            reward = getRandomInt(boss.reward[0], boss.reward[1]);
            expGain = boss.exp;
            db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(reward, guildId, userId);
            addPetExp(guildId, userId, expGain);
            incrementUserStat(guildId, userId, 'boss_kills');
            addIncome(guildId, userId, 'battle', reward);
            await checkAchievements(interaction.guild, userId, { type: 'boss_kill' });
            if (Math.random() < 0.3) {
                const slot = ['weapon', 'armor', 'accessory'][Math.floor(Math.random() * 3)];
                const rarity = Math.random() < 0.1 ? 'Legendary' : Math.random() < 0.3 ? 'Epic' : 'Rare';
                const names = RELIC_NAMES[slot];
                const name = names[Math.floor(Math.random() * names.length)];
                const statType = slot === 'weapon' ? 'atk' : slot === 'armor' ? 'def' : (Math.random() < 0.5 ? 'spd' : 'crit');
                const statVal = rarity === 'Legendary' ? getRandomInt(50,80) : rarity === 'Epic' ? getRandomInt(35,50) : getRandomInt(20,35);
                db.prepare('INSERT INTO relics (guildId, userId, name, slot, rarity, stat_type, stat_value) VALUES (?, ?, ?, ?, ?, ?, ?)').run(guildId, userId, name, slot, rarity, statType, statVal);
                relicDrop = `\n> 📿 **DROP:** ${name} (${rarity})`;
            }
            addItem(guildId, userId, 'refine_stone', getRandomInt(1, 3));
        } else {
            const freshData = getOrCreateUser(guildId, userId);
            const penalty = Math.floor(freshData.balance * 0.05);
            db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(penalty, guildId, userId);
            db.prepare('UPDATE pets SET happiness = MAX(0, happiness - 10) WHERE id = ?').run(pet.id);
            addPetExp(guildId, userId, Math.floor(boss.exp * 0.3));
            reward = -penalty;
        }

        const statusText = result.alive
            ? `🏆 **BOSS DEFEATED!**\n> 🪙 +${reward.toLocaleString('id-ID')} Money\n> ✨ +${expGain} Pet EXP\n> 🪨 +1-3 Refine Stone${relicDrop}`
            : `💀 **FAILED!**\n> 🪙 -${Math.abs(reward).toLocaleString('id-ID')} (5% penalty)\n> ❤️ Happiness -10`;
        const embed = new EmbedBuilder().setColor(result.alive ? '#FFD700' : '#E74C3C').setTitle(`👹 Solo Boss: ${boss.name}`)
            .setDescription(`${result.log.join('\n')}\n\n━━━━━━ **RESULT** ━━━━━━\n${statusText}`)
            .setFooter({ text: 'Cooldown: 10 menit' });
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_boss_${userId}`).setLabel('👹 Boss Menu').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }


    // === BOSS CREATE SELECT (create party) ===
    if (customId.startsWith('pet_bosscreate_select_')) {
        const bossId = interaction.values[0];
        const boss = BOSS_LIST.find(b => b.id === bossId);
        if (!boss) return interaction.reply({ content: '❌ Boss tidak ditemukan!', ephemeral: true });
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
        if (pet.level < boss.minLevel) return interaction.reply({ content: `❌ Pet butuh minimal **Lv.${boss.minLevel}**!`, ephemeral: true });
        if (activeBossParties.has(`${guildId}_${userId}`)) return interaction.reply({ content: '❌ Kamu sudah punya party aktif!', ephemeral: true });

        const partyId = `${guildId}_${userId}`;
        activeBossParties.set(partyId, { leader: userId, bossId, members: [userId], channelId: interaction.channelId, createdAt: Date.now() });

        const joinBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`boss_join_${userId}`).setLabel('🎮 Join Party (1/10)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`boss_start_${userId}`).setLabel('⚔️ Start Battle').setStyle(ButtonStyle.Danger)
        );
        const embed = new EmbedBuilder().setColor('#E74C3C').setTitle(`👹 BOSS RAID: ${boss.name}`)
            .setDescription(`<@${userId}> membuat party untuk melawan **${boss.name}**!\n\n> 👹 **Boss:** ${boss.name}\n> ❤️ **HP:** ${boss.hp.toLocaleString()}\n> ⚔️ **ATK:** ${boss.atk} | 🛡️ **DEF:** ${boss.def}\n> 🎁 **Reward:** 🪙 ${boss.reward[0].toLocaleString()}-${boss.reward[1].toLocaleString()}/member\n\n**Party Members (1/10):**\n> 👑 <@${userId}> (Leader)\n\n*Klik Join untuk bergabung!*`)
            .setFooter({ text: 'Party expire dalam 5 menit | Leader klik Start untuk mulai' });

        // Party needs to be a new message (not update) so others can see and join
        await interaction.update({ content: '✅ Party dibuat! Lihat pesan baru di bawah.', embeds: [], components: [] });
        await interaction.channel.send({ embeds: [embed], components: [joinBtn] });
        setTimeout(() => { if (activeBossParties.has(partyId)) activeBossParties.delete(partyId); }, 300000);
        return;
    }

    // === REFINE SELECT ===
    if (customId.startsWith('pet_refine_select_')) {
        const slot = interaction.values[0];
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
        const relic = db.prepare('SELECT * FROM relics WHERE guildId = ? AND userId = ? AND slot = ? AND equipped_pet_id = ?').get(guildId, userId, slot, pet.id);
        if (!relic) {
            // Check unequipped relics
            const unequipped = db.prepare('SELECT * FROM relics WHERE guildId = ? AND userId = ? AND slot = ?').get(guildId, userId, slot);
            if (!unequipped) return interaction.reply({ content: `❌ Tidak punya relic di slot **${slot}**! Dapatkan dari dungeon/boss.`, ephemeral: true });
            // Use any relic the user owns for that slot
            return handleRefineAction(interaction, guildId, userId, slot, unequipped);
        }
        return handleRefineAction(interaction, guildId, userId, slot, relic);
    }

    return null;
}


// Helper for refine action
async function handleRefineAction(interaction, guildId, userId, slot, relic) {
    const hasStone = getItemCount(guildId, userId, 'refine_stone');
    if (hasStone <= 0) return interaction.reply({ content: '❌ Kamu butuh **🪨 Refine Stone**! Dapatkan dari dungeon/boss.', ephemeral: true });
    if (relic.refine_level >= 20) return interaction.reply({ content: '✅ Relic ini sudah **+20** (MAX)!', ephemeral: true });
    removeItem(guildId, userId, 'refine_stone');
    const lvl = relic.refine_level;
    const rate = lvl < 10 ? 100 : lvl < 15 ? 70 : lvl < 18 ? 50 : 30;
    const success = Math.random() * 100 < rate;
    const slotEmoji = slot === 'weapon' ? '⚔️' : slot === 'armor' ? '🛡️' : '💍';

    if (success) {
        db.prepare('UPDATE relics SET refine_level = refine_level + 1 WHERE id = ?').run(relic.id);
        incrementUserStat(guildId, userId, 'refine_successes');
        await checkAchievements(interaction.guild, userId, { type: 'refine_success', maxRefine: (lvl + 1) >= 20 });
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('✨ Refine Success!')
            .setDescription(`**${relic.name}** berhasil di-upgrade!\n\n> ${slotEmoji} **${relic.name}** +${lvl} → **+${lvl+1}**\n> Stats: +${Math.floor(relic.stat_value * (1 + (lvl+1)*0.05))} ${relic.stat_type}\n> Rate was: ${rate}%`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_refine_${userId}`).setLabel('📿 Refine Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    } else {
        const newLvl = Math.max(0, lvl - 1);
        db.prepare('UPDATE relics SET refine_level = ? WHERE id = ?').run(newLvl, relic.id);
        const embed = new EmbedBuilder().setColor('#E74C3C').setTitle('💔 Refine Failed!')
            .setDescription(`**${relic.name}** gagal di-upgrade...\n\n> ${slotEmoji} **${relic.name}** +${lvl} → **+${newLvl}**\n> Rate was: ${rate}%\n\n> 😢 Level turun 1!`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_refine_${userId}`).setLabel('📿 Refine Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }
}


// ============ HANDLER: Pet rename modal submit ============
async function handlePetModal(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;

    if (customId.startsWith('pet_rename_modal_')) {
        const userId = customId.replace('pet_rename_modal_', '');
        if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan milikmu!', ephemeral: true });
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
        const newName = interaction.fields.getTextInputValue('pet_new_name');
        db.prepare('UPDATE pets SET name = ? WHERE id = ?').run(newName, pet.id);
        const panel = buildMainPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }
    return null;
}

// ============ UTILITY: Check if a customId belongs to pet panel ============
function isPetPanelButton(customId) {
    return customId.startsWith('pet_') && !customId.startsWith('petshop_');
}

function isPetPanelSelectMenu(customId) {
    return customId.startsWith('pet_') && customId.includes('_select_');
}

function isPetPanelModal(customId) {
    return customId.startsWith('pet_rename_modal_');
}

module.exports = {
    handlePetCommand,
    handlePetButton,
    handlePetSelectMenu,
    handlePetModal,
    isPetPanelButton,
    isPetPanelSelectMenu,
    isPetPanelModal,
    buildMainPanel
};
