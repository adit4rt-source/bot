// systems/petFusion.js — Pet Fusion System
// Combine 2 pets of the same tier to create a stronger pet of the next tier.
// Fusion costs money and has a success chance.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { db, getOrCreateUser, incrementUserStat } = require('../database');
const { getRandomInt } = require('../utils');
const { generatePetStats, getAllPets } = require('./pets');
const { PET_DATA, PET_CLASSES, PET_ELEMENTS } = require('../data/pets');
const { checkAchievements } = require('./achievements');

// ==================== FUSION CONFIG ====================
const FUSION_CONFIG = {
    // tier: { cost, successRate, resultTier }
    'Common': { cost: 3000, successRate: 90, resultTier: 'Uncommon' },
    'Uncommon': { cost: 10000, successRate: 75, resultTier: 'Rare' },
    'Rare': { cost: 30000, successRate: 60, resultTier: 'Epic' },
    'Epic': { cost: 80000, successRate: 45, resultTier: 'Legendary' },
    'Legendary': { cost: 200000, successRate: 30, resultTier: 'Mythic' },
    'Mythic': { cost: 600000, successRate: 15, resultTier: 'Secret' },
    'Secret': { cost: 2000000, successRate: 6, resultTier: 'God' },
};

// Fusion cannot upgrade God (already the absolute max tier)
const FUSABLE_TIERS = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret'];

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS fusion_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    userId TEXT,
    pet1Id INTEGER,
    pet2Id INTEGER,
    resultPetId INTEGER DEFAULT NULL,
    resultTier TEXT,
    success INTEGER DEFAULT 0,
    fusedAt INTEGER
)`);

// ==================== HELPER: Get fusable pets by tier ====================
function getFusablePets(guildId, userId) {
    const allPets = getAllPets(guildId, userId);
    const fusable = {};
    
    for (const pet of allPets) {
        if (pet.active) continue; // Can't fuse active pet
        const petDef = PET_DATA.find(p => p.id === pet.petId);
        if (!petDef) continue;
        if (!FUSABLE_TIERS.includes(petDef.tier)) continue;
        
        if (!fusable[petDef.tier]) fusable[petDef.tier] = [];
        fusable[petDef.tier].push({ ...pet, tierName: petDef.tier, petDef });
    }
    
    return fusable;
}

// ==================== HELPER: Calculate fusion stats bonus ====================
function calculateFusionStats(pet1, pet2, resultTier) {
    // Result pet gets base stats of new tier + bonus from parents
    const baseStats = generatePetStats(resultTier);
    
    // Bonus: average 10% of both parent stats added on top
    const bonus = {
        hp: Math.floor((pet1.hp + pet2.hp) * 0.1),
        atk: Math.floor((pet1.atk + pet2.atk) * 0.1),
        def: Math.floor((pet1.def + pet2.def) * 0.1),
        spd: Math.floor((pet1.spd + pet2.spd) * 0.1),
        crit: Math.floor((pet1.crit + pet2.crit) * 0.05),
    };

    return {
        hp: baseStats.hp + bonus.hp,
        atk: baseStats.atk + bonus.atk,
        def: baseStats.def + bonus.def,
        spd: baseStats.spd + bonus.spd,
        crit: Math.min(25, baseStats.crit + bonus.crit),
    };
}

// ==================== BUILD: Fusion Panel ====================
function buildFusionPanel(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);
    const fusable = getFusablePets(guildId, userId);
    const totalFusions = db.prepare('SELECT COUNT(*) as cnt FROM fusion_history WHERE guildId = ? AND userId = ? AND success = 1').get(guildId, userId)?.cnt || 0;

    let desc = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    desc += `Gabungkan **2 pet tier sama** untuk mendapatkan pet **tier lebih tinggi**!\n\n`;
    desc += `> 💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n`;
    desc += `> 📊 Total Fusions: **${totalFusions}**\n\n`;
    desc += `**📋 Fusion Rates & Cost:**\n`;

    for (const tier of FUSABLE_TIERS) {
        const config = FUSION_CONFIG[tier];
        const petsInTier = fusable[tier] ? fusable[tier].length : 0;
        const canFuse = petsInTier >= 2;
        const icon = canFuse ? '✅' : '🔒';
        desc += `> ${icon} **${tier}** → ${config.resultTier} | 🪙 ${config.cost.toLocaleString('id-ID')} | ${config.successRate}% chance | (${petsInTier} pets)\n`;
    }

    desc += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    desc += `> ⚠️ **Pet aktif tidak bisa di-fuse**\n`;
    desc += `> ⚠️ **Gagal = kehilangan 1 pet random dari pair**\n`;
    desc += `> 💡 **Sukses = 2 pet hilang, dapat 1 pet tier lebih tinggi**`;

    const embed = new EmbedBuilder()
        .setTitle(`🧬 PET FUSION — ${username}`)
        .setColor('#9B59B6')
        .setDescription(desc)
        .setFooter({ text: 'Pilih tier di bawah untuk mulai fusion' })
        .setTimestamp();

    // Build tier select menu
    const availableTiers = FUSABLE_TIERS.filter(t => fusable[t] && fusable[t].length >= 2);

    const components = [];
    if (availableTiers.length > 0) {
        const tierMenu = new StringSelectMenuBuilder()
            .setCustomId(`fusion_tier_${userId}`)
            .setPlaceholder('🧬 Pilih tier untuk fusion...')
            .setMinValues(1).setMaxValues(1);

        availableTiers.forEach(tier => {
            const config = FUSION_CONFIG[tier];
            tierMenu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`${tier} → ${config.resultTier} (${config.successRate}% chance)`)
                .setValue(tier)
                .setDescription(`Cost: 🪙${config.cost.toLocaleString('id-ID')} | ${fusable[tier].length} pets available`));
        });
        components.push(new ActionRowBuilder().addComponents(tierMenu));
    }

    components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fusion_history_${userId}`).setLabel('📜 History').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Pet Panel').setStyle(ButtonStyle.Secondary)
    ));

    return { embeds: [embed], components };
}

// ==================== BUILD: Select Pets for Fusion ====================
function buildFusionSelectPets(guildId, userId, tier) {
    const fusable = getFusablePets(guildId, userId);
    const petsInTier = fusable[tier] || [];
    const config = FUSION_CONFIG[tier];

    if (petsInTier.length < 2) {
        const embed = new EmbedBuilder()
            .setTitle('🧬 Fusion — Pet Kurang')
            .setColor('#E74C3C')
            .setDescription(`Kamu butuh minimal **2 pet ${tier}** (non-aktif) untuk fusion.\nSekarang: ${petsInTier.length} pet tersedia.`);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fusion_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return { embeds: [embed], components: [row] };
    }

    let desc = `**Tier:** ${tier} → **${config.resultTier}**\n`;
    desc += `**Cost:** 🪙 ${config.cost.toLocaleString('id-ID')} | **Success:** ${config.successRate}%\n\n`;
    desc += `**Pet ${tier} kamu:**\n`;
    petsInTier.forEach((p, i) => {
        desc += `> **#${p.id}** ${p.petDef.emoji} **${p.name}** (Lv.${p.level}) — ATK:${p.atk} DEF:${p.def} HP:${p.hp}\n`;
    });
    desc += `\n👇 Pilih **pet pertama** untuk di-fuse:`;

    const embed = new EmbedBuilder()
        .setTitle(`🧬 Fusion — Pilih Pet 1`)
        .setColor('#9B59B6')
        .setDescription(desc);

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`fusion_pet1_${tier}_${userId}`)
        .setPlaceholder('🐾 Pilih Pet 1...')
        .setMinValues(1).setMaxValues(1);

    petsInTier.slice(0, 25).forEach(p => {
        const opt = new StringSelectMenuOptionBuilder()
            .setLabel(`#${p.id} ${p.name} (Lv.${p.level})`)
            .setValue(String(p.id))
            .setDescription(`${p.petDef.name} | ATK:${p.atk} DEF:${p.def} HP:${p.hp}`);
        // Hanya set emoji unicode. Emoji custom (<:name:id>) bisa COMPONENT_INVALID_EMOJI
        // kalau bot tidak punya akses ke emoji guild tsb -> select menu gagal tampil.
        if (p.petDef.emoji && !/^<a?:\w+:\d+>$/.test(p.petDef.emoji)) opt.setEmoji(p.petDef.emoji);
        menu.addOptions(opt);
    });

    const components = [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fusion_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        )
    ];
    return { embeds: [embed], components };
}

// ==================== BUILD: Select Pet 2 ====================
function buildFusionSelectPet2(guildId, userId, tier, pet1Id) {
    const fusable = getFusablePets(guildId, userId);
    const petsInTier = (fusable[tier] || []).filter(p => p.id !== pet1Id);
    const pet1 = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(pet1Id, guildId, userId);
    const pet1Def = pet1 ? PET_DATA.find(p => p.id === pet1.petId) : null;
    const config = FUSION_CONFIG[tier];

    let desc = `**Pet 1:** ${pet1Def ? pet1Def.emoji : '🐾'} **${pet1 ? pet1.name : '?'}** (Lv.${pet1 ? pet1.level : 0})\n\n`;
    desc += `👇 Pilih **pet kedua** untuk digabungkan:`;

    const embed = new EmbedBuilder()
        .setTitle(`🧬 Fusion — Pilih Pet 2`)
        .setColor('#9B59B6')
        .setDescription(desc);

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`fusion_pet2_${tier}_${pet1Id}_${userId}`)
        .setPlaceholder('🐾 Pilih Pet 2...')
        .setMinValues(1).setMaxValues(1);

    petsInTier.slice(0, 25).forEach(p => {
        const opt = new StringSelectMenuOptionBuilder()
            .setLabel(`#${p.id} ${p.name} (Lv.${p.level})`)
            .setValue(String(p.id))
            .setDescription(`${p.petDef.name} | ATK:${p.atk} DEF:${p.def} HP:${p.hp}`);
        // Hanya set emoji unicode. Emoji custom (<:name:id>) bisa COMPONENT_INVALID_EMOJI
        // kalau bot tidak punya akses ke emoji guild tsb -> select menu gagal tampil.
        if (p.petDef.emoji && !/^<a?:\w+:\d+>$/.test(p.petDef.emoji)) opt.setEmoji(p.petDef.emoji);
        menu.addOptions(opt);
    });

    const components = [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fusion_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        )
    ];
    return { embeds: [embed], components };
}

// ==================== EXECUTE FUSION ====================
function executeFusion(guildId, userId, tier, pet1Id, pet2Id) {
    const config = FUSION_CONFIG[tier];
    if (!config) return { success: false, error: '❌ Tier tidak valid!' };

    const userData = getOrCreateUser(guildId, userId);
    if (userData.balance < config.cost) {
        return { success: false, error: `❌ Saldo kurang! Butuh 🪙 ${config.cost.toLocaleString('id-ID')}` };
    }

    const pet1 = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ? AND active = 0').get(pet1Id, guildId, userId);
    const pet2 = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ? AND active = 0').get(pet2Id, guildId, userId);
    if (!pet1 || !pet2) return { success: false, error: '❌ Pet tidak ditemukan atau masih aktif!' };
    if (pet1Id === pet2Id) return { success: false, error: '❌ Tidak bisa fuse pet yang sama!' };

    const pet1Def = PET_DATA.find(p => p.id === pet1.petId);
    const pet2Def = PET_DATA.find(p => p.id === pet2.petId);
    if (!pet1Def || !pet2Def) return { success: false, error: '❌ Data pet error!' };
    if (pet1Def.tier !== tier || pet2Def.tier !== tier) return { success: false, error: '❌ Pet tier tidak cocok!' };

    // Deduct cost
    db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(config.cost, guildId, userId);

    // Roll success
    const roll = Math.random() * 100;
    const isSuccess = roll < config.successRate;

    if (!isSuccess) {
        // FAIL: lose 1 random pet from the pair
        const lostPet = Math.random() < 0.5 ? pet1 : pet2;
        const keptPet = lostPet.id === pet1.id ? pet2 : pet1;
        db.prepare('DELETE FROM pets WHERE id = ? AND guildId = ?').run(lostPet.id, guildId);
        
        // Log
        db.prepare('INSERT INTO fusion_history (guildId, userId, pet1Id, pet2Id, resultTier, success, fusedAt) VALUES (?, ?, ?, ?, ?, 0, ?)').run(
            guildId, userId, pet1Id, pet2Id, config.resultTier, Date.now()
        );
        incrementUserStat(guildId, userId, 'fusion_fails');

        const lostDef = PET_DATA.find(p => p.id === lostPet.petId);
        const keptDef = PET_DATA.find(p => p.id === keptPet.petId);
        return {
            success: false,
            failed: true,
            lostPet: { ...lostPet, def: lostDef },
            keptPet: { ...keptPet, def: keptDef },
            cost: config.cost
        };
    }

    // SUCCESS: Delete both pets, create new one of higher tier
    const resultTier = config.resultTier;
    const possiblePets = PET_DATA.filter(p => p.tier === resultTier);
    const chosenPet = possiblePets[Math.floor(Math.random() * possiblePets.length)];

    // Calculate fusion stats (base + parent bonus)
    const stats = calculateFusionStats(pet1, pet2, resultTier);

    // Determine class & element (inherit from stronger parent)
    const strongerParent = (pet1.atk + pet1.def + pet1.hp) >= (pet2.atk + pet2.def + pet2.hp) ? pet1 : pet2;
    const resultClass = strongerParent.class || PET_CLASSES[Math.floor(Math.random() * PET_CLASSES.length)];
    const resultElement = strongerParent.element || PET_ELEMENTS[Math.floor(Math.random() * PET_ELEMENTS.length)];

    // Starting level: average of parents / 2 (min 1)
    const startLevel = Math.max(1, Math.floor((pet1.level + pet2.level) / 4));

    // Create new pet
    const fusionName = `${chosenPet.name}★`;
    db.prepare(`INSERT INTO pets (guildId, userId, petId, name, level, exp, happiness, hunger, status, active, adoptedAt, class, element, hp, atk, def, spd, crit, skills)
        VALUES (?, ?, ?, ?, ?, 0, 100, 100, 'happy', 0, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`).run(
        guildId, userId, chosenPet.id, fusionName, startLevel, Date.now(),
        resultClass, resultElement, stats.hp, stats.atk, stats.def, stats.spd, stats.crit
    );
    try { const { registerPetDiscovery } = require('../database'); registerPetDiscovery(userId, chosenPet.id); } catch (_) {}

    const newPetRow = db.prepare('SELECT last_insert_rowid() as id').get();
    const newPetId = newPetRow.id;

    // Delete source pets
    db.prepare('DELETE FROM pets WHERE id = ? AND guildId = ?').run(pet1.id, guildId);
    db.prepare('DELETE FROM pets WHERE id = ? AND guildId = ?').run(pet2.id, guildId);

    // Log
    db.prepare('INSERT INTO fusion_history (guildId, userId, pet1Id, pet2Id, resultPetId, resultTier, success, fusedAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)').run(
        guildId, userId, pet1Id, pet2Id, newPetId, resultTier, Date.now()
    );
    incrementUserStat(guildId, userId, 'fusion_success');
    incrementUserStat(guildId, userId, 'total_fusions');

    return {
        success: true,
        newPet: { id: newPetId, name: fusionName, level: startLevel, ...stats, class: resultClass, element: resultElement },
        chosenPetDef: chosenPet,
        pet1: { ...pet1, def: pet1Def },
        pet2: { ...pet2, def: pet2Def },
        resultTier,
        cost: config.cost
    };
}

// ==================== HANDLER: Button Clicks ====================
async function handleFusionButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    const action = parts[1];

    // === MAIN PANEL ===
    if (action === 'main') {
        return interaction.update(buildFusionPanel(guildId, userId, interaction.user.username));
    }

    // === HISTORY ===
    if (action === 'history') {
        const history = db.prepare('SELECT * FROM fusion_history WHERE guildId = ? AND userId = ? ORDER BY fusedAt DESC LIMIT 10').all(guildId, userId);
        const totalSuccess = db.prepare('SELECT COUNT(*) as cnt FROM fusion_history WHERE guildId = ? AND userId = ? AND success = 1').get(guildId, userId)?.cnt || 0;
        const totalFail = db.prepare('SELECT COUNT(*) as cnt FROM fusion_history WHERE guildId = ? AND userId = ? AND success = 0').get(guildId, userId)?.cnt || 0;

        let desc = `> ✅ Sukses: **${totalSuccess}** | ❌ Gagal: **${totalFail}**\n\n`;
        if (history.length === 0) {
            desc += '*Belum ada riwayat fusion.*';
        } else {
            history.forEach((h, i) => {
                const status = h.success ? '✅' : '❌';
                const time = `<t:${Math.floor(h.fusedAt / 1000)}:R>`;
                desc += `${status} **${h.resultTier}** fusion — ${time}\n`;
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('📜 Fusion History')
            .setColor('#9B59B6')
            .setDescription(desc);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fusion_main_${userId}`).setLabel('🧬 Fusion').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Pet Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === CONFIRM FUSION ===
    // fusion_confirm_TIER_PET1_PET2_USERID
    if (action === 'confirm') {
        const tier = parts[2];
        const pet1Id = parseInt(parts[3]);
        const pet2Id = parseInt(parts[4]);
        // userId is parts[5]

        const result = executeFusion(guildId, userId, tier, pet1Id, pet2Id);

        if (result.error) {
            return interaction.reply({ content: result.error, ephemeral: true });
        }

        if (result.failed) {
            // Fusion failed
            const embed = new EmbedBuilder()
                .setTitle('❌ Fusion GAGAL!')
                .setColor('#E74C3C')
                .setDescription(
                    `Fusion gagal... 😢\n\n` +
                    `> 💀 **${result.lostPet.def ? result.lostPet.def.emoji : '🐾'} ${result.lostPet.name}** (Lv.${result.lostPet.level}) — **HILANG**\n` +
                    `> ✅ **${result.keptPet.def ? result.keptPet.def.emoji : '🐾'} ${result.keptPet.name}** (Lv.${result.keptPet.level}) — Selamat\n\n` +
                    `> 🪙 Cost: -${result.cost.toLocaleString('id-ID')} (tidak dikembalikan)\n\n` +
                    `*Coba lagi dengan pet lain!*`
                );
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`fusion_main_${userId}`).setLabel('🧬 Fusion Lagi').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Pet Panel').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }

        // Fusion success!
        const embed = new EmbedBuilder()
            .setTitle('🧬✨ FUSION BERHASIL! ✨🧬')
            .setColor('#FFD700')
            .setDescription(
                `Selamat! Fusion berhasil!\n\n` +
                `**Material:**\n` +
                `> ${result.pet1.def.emoji} ~~${result.pet1.name}~~ (Lv.${result.pet1.level})\n` +
                `> ${result.pet2.def.emoji} ~~${result.pet2.name}~~ (Lv.${result.pet2.level})\n\n` +
                `**Hasil:**\n` +
                `> ${result.chosenPetDef.emoji} **${result.newPet.name}** ⭐\n` +
                `> Tier: **${result.resultTier}** | Level: **${result.newPet.level}**\n` +
                `> ❤️ HP: **${result.newPet.hp}** | ⚔️ ATK: **${result.newPet.atk}**\n` +
                `> 🛡️ DEF: **${result.newPet.def}** | 💨 SPD: **${result.newPet.spd}**\n` +
                `> 🎯 CRIT: **${result.newPet.crit}%**\n` +
                `> 🏷️ Class: **${result.newPet.class}** | Element: **${result.newPet.element}**\n\n` +
                `> 🪙 Cost: -${result.cost.toLocaleString('id-ID')}`
            )
            .setFooter({ text: 'Pet baru di Collection! Aktifkan lewat Swap.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fusion_main_${userId}`).setLabel('🧬 Fusion Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Pet Panel').setStyle(ButtonStyle.Secondary)
        );

        // Achievement: pet obtained via fusion (tier firsts + collection milestones)
        try {
            const distinctPets = db.prepare('SELECT COUNT(DISTINCT petId) AS c FROM pets WHERE guildId = ? AND userId = ?').get(guildId, userId).c;
            await checkAchievements(interaction.guild, userId, { type: 'pet_obtain', tier: result.resultTier, distinctPets });
        } catch (e) { /* never block fusion */ }
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

// ==================== HANDLER: Select Menus ====================
async function handleFusionSelectMenu(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const userId = customId.split('_').pop();

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    // === TIER SELECT ===
    if (customId.startsWith('fusion_tier_')) {
        const tier = interaction.values[0];
        return interaction.update(buildFusionSelectPets(guildId, userId, tier));
    }

    // === PET 1 SELECT ===
    if (customId.startsWith('fusion_pet1_')) {
        const parts = customId.split('_');
        const tier = parts[2];
        const pet1Id = parseInt(interaction.values[0]);
        return interaction.update(buildFusionSelectPet2(guildId, userId, tier, pet1Id));
    }

    // === PET 2 SELECT → Show confirmation ===
    if (customId.startsWith('fusion_pet2_')) {
        const parts = customId.split('_');
        const tier = parts[2];
        const pet1Id = parseInt(parts[3]);
        const pet2Id = parseInt(interaction.values[0]);
        const config = FUSION_CONFIG[tier];

        const pet1 = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ?').get(pet1Id, guildId);
        const pet2 = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ?').get(pet2Id, guildId);
        const pet1Def = pet1 ? PET_DATA.find(p => p.id === pet1.petId) : null;
        const pet2Def = pet2 ? PET_DATA.find(p => p.id === pet2.petId) : null;
        const userData = getOrCreateUser(guildId, userId);
        const canAfford = userData.balance >= config.cost;

        const embed = new EmbedBuilder()
            .setTitle('🧬 Konfirmasi Fusion')
            .setColor(canAfford ? '#F1C40F' : '#E74C3C')
            .setDescription(
                `**Material:**\n` +
                `> ${pet1Def ? pet1Def.emoji : '🐾'} **${pet1 ? pet1.name : '?'}** (Lv.${pet1 ? pet1.level : 0}) — ATK:${pet1?.atk} DEF:${pet1?.def}\n` +
                `> ${pet2Def ? pet2Def.emoji : '🐾'} **${pet2 ? pet2.name : '?'}** (Lv.${pet2 ? pet2.level : 0}) — ATK:${pet2?.atk} DEF:${pet2?.def}\n\n` +
                `**Hasil:** Pet tier **${config.resultTier}** (random)\n` +
                `**Cost:** 🪙 ${config.cost.toLocaleString('id-ID')}\n` +
                `**Success Rate:** ${config.successRate}%\n\n` +
                `> 💰 Saldo: 🪙 ${userData.balance.toLocaleString('id-ID')} ${canAfford ? '✅' : '❌ KURANG!'}\n\n` +
                `⚠️ **PERINGATAN:**\n` +
                `> Sukses = kedua pet hilang, dapat 1 pet tier lebih tinggi\n` +
                `> Gagal = kehilangan 1 pet random dari pair + uang hangus`
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fusion_confirm_${tier}_${pet1Id}_${pet2Id}_${userId}`).setLabel('✅ FUSE!').setStyle(ButtonStyle.Success).setDisabled(!canAfford),
            new ButtonBuilder().setCustomId(`fusion_main_${userId}`).setLabel('❌ Batal').setStyle(ButtonStyle.Danger)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

// ==================== DETECTORS ====================
function isFusionButton(customId) {
    return customId.startsWith('fusion_') && !customId.startsWith('fusion_tier_') && !customId.startsWith('fusion_pet1_') && !customId.startsWith('fusion_pet2_');
}

function isFusionSelectMenu(customId) {
    return customId.startsWith('fusion_tier_') || customId.startsWith('fusion_pet1_') || customId.startsWith('fusion_pet2_');
}

// ==================== EXPORTS ====================
module.exports = {
    buildFusionPanel,
    handleFusionButton,
    handleFusionSelectMenu,
    isFusionButton,
    isFusionSelectMenu,
    FUSION_CONFIG
};
