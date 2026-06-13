// systems/petPanel.js - Pet Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser, getPetFoodCount, addPetFood, removePetFood, getAllPetFood, getItemCount, addItem, removeItem } = require('../database');
const { getRandomInt } = require('../utils');
const { generatePetStats, simulateBattle, getPetData, getAllPets, addPetExp, checkPetEvolution, evolvePet, getExpNeeded, getPetSkills, ELEMENT_EMOJI, getEffectiveStats, getUserRelics, getEquippedRelics, relicEffective, equipRelic, unequipAll, meltRelic, getRelicBonus, isPercentRelic } = require('./pets');
const { PET_DATA, PET_FOODS, PET_EGGS, PET_CLASSES, PET_ELEMENTS, PET_EVOLUTIONS, PET_SKILL_MILESTONES, PET_LEVEL_MULTIPLIERS, RELIC_NAMES, RELIC_MYTHIC_NAMES, RELIC_GOD_NAMES, PET_SKILLS } = require('../data/pets');
const { DUNGEON_TIERS, BOSS_LIST } = require('../data/dungeons');
const { ITEMS } = require('../data/items');
const { checkAchievements } = require('./achievements');
const { getComboMultiplier, addComboFeature } = require('./combo');
const { updateQuestProgress } = require('./quests');
const { getUserStat, incrementUserStat, addIncome } = require('../database');
const state = require('../state');
const { fishCooldowns, activeBossParties } = state;
const ui = require('./ui');
const { formatTrait } = require('./mutationLab');

// ============ Release Pet: refund per tier (money) ============
const PET_RELEASE_REFUND = { Common: 100, Uncommon: 500, Rare: 2500, Epic: 10000, Legendary: 25000, Mythic: 50000, Secret: 125000, God: 250000 };
const RARE_RELEASE_TIERS = ['Legendary', 'Mythic', 'Secret', 'God'];
// Cek apakah pet boleh dilepas (tidak aktif, tidak hunting, tidak ekspedisi). Return {ok, reason}.
function canReleasePet(guildId, userId, pet) {
    if (!pet) return { ok: false, reason: '❌ Pet tidak ditemukan!' };
    if (pet.active === 1) return { ok: false, reason: '❌ Tidak bisa lepas pet **aktif**! Swap ke pet lain dulu.' };
    if (pet.hunting_until && pet.hunting_until > Date.now()) return { ok: false, reason: '❌ Pet sedang **Hunting**! Tunggu selesai dulu.' };
    try {
        const { getActiveExpedition } = require('./expedition');
        const exp = getActiveExpedition(guildId, userId);
        if (exp && exp.petId === pet.id) return { ok: false, reason: '❌ Pet sedang **Ekspedisi**! Tunggu selesai dulu.' };
    } catch (e) {}
    return { ok: true };
}

// ============ HELPER: Reward & loot for dungeon/boss ============
// Scaling reward per level pet: reward * (1 + level/200) → Lv50 ×1.25, Lv100 ×1.5, Lv150 ×1.75
function applyLevelScaling(reward, level) {
    return Math.floor(reward * (1 + (level || 1) / 200));
}

// Hitung penalti kalah: min(reward_max * 0.3, cap, saldo). Tidak pernah lebih dari saldo.
function computePenalty(entry, balance) {
    const maxReward = (entry.reward && entry.reward[1]) || 0;
    const cap = entry.penaltyCap || 2000;
    return Math.max(0, Math.min(Math.floor(maxReward * 0.3), cap, Math.max(0, balance)));
}

// Roll loot table → apply addItem & return display string.
function rollLoot(guildId, userId, lootTable) {
    if (!Array.isArray(lootTable) || lootTable.length === 0) return '';
    const lines = [];
    for (const entry of lootTable) {
        if (Math.random() < (entry.chance ?? 1)) {
            const qty = getRandomInt(entry.min || 1, entry.max || 1);
            if (qty <= 0) continue;
            addItem(guildId, userId, entry.item, qty);
            const def = ITEMS.find(i => i.id === entry.item);
            const emoji = def ? (def.menuEmoji || def.emoji) : '📦';
            const name = def ? def.name : entry.item;
            lines.push(`> ${emoji} +${qty} ${name}`);
        }
    }
    return lines.join('\n');
}

// Roll relic drop (equipment) → insert ke DB & return display string.
function rollRelicDrop(guildId, userId, chance, rareBonus) {
    if (!chance || Math.random() >= chance) return '';
    const slot = ['weapon', 'armor', 'accessory'][Math.floor(Math.random() * 3)];
    const r = Math.random();
    let rarity;
    if (rareBonus) rarity = r < 0.001 ? 'God' : r < 0.011 ? 'Mythic' : r < 0.20 ? 'Legendary' : r < 0.55 ? 'Epic' : 'Rare';
    else rarity = r < 0.005 ? 'Mythic' : r < 0.08 ? 'Legendary' : r < 0.28 ? 'Epic' : 'Rare';
    let nameList;
    if (rarity === 'God') nameList = RELIC_GOD_NAMES[slot];
    else if (rarity === 'Mythic') nameList = RELIC_MYTHIC_NAMES[slot];
    else nameList = RELIC_NAMES[slot];
    const name = nameList[Math.floor(Math.random() * nameList.length)];
    const statType = slot === 'weapon' ? 'atk' : slot === 'armor' ? 'def' : (Math.random() < 0.5 ? 'spd' : 'crit');
    const statVal = rarity === 'God' ? getRandomInt(25, 50) : rarity === 'Mythic' ? getRandomInt(15, 30) : rarity === 'Legendary' ? getRandomInt(50, 80) : rarity === 'Epic' ? getRandomInt(35, 50) : getRandomInt(20, 35);
    db.prepare('INSERT INTO relics (guildId, userId, name, slot, rarity, stat_type, stat_value) VALUES (?, ?, ?, ?, ?, ?, ?)').run(guildId, userId, name, slot, rarity, statType, statVal);
    return `\n> 📿 **RELIC DROP:** ${name} (${rarity})`;
}


// ============ HELPER: Build the Relic Manager panel (equip / melt / refine) ============
const _SLOT_EMOJI = { weapon: '⚔️', armor: '🛡️', accessory: '💍' };
const _STAT_EMOJI = { atk: '⚔️', def: '🛡️', spd: '💨', crit: '🎯' };

function _relicLabel(r) {
    const eff = relicEffective(r);
    const unit = r.stat_type === 'crit' ? '%' : '';
    return `${_SLOT_EMOJI[r.slot] || '📿'} ${r.name} (${_STAT_EMOJI[r.stat_type] || ''}+${eff}${unit})`;
}

function buildRelicPanel(guildId, userId) {
    const pet = getPetData(guildId, userId);
    if (!pet) {
        const embed = new EmbedBuilder().setTitle('📿 Relic Manager').setColor('#FFD700')
            .setDescription('❌ Kamu belum punya pet aktif! Adopsi pet dulu lewat `/pet`.');
        return { embeds: [embed], components: [] };
    }

    const equipped = getEquippedRelics(pet.id);
    const equippedBySlot = {};
    for (const r of equipped) equippedBySlot[r.slot] = r;
    const all = getUserRelics(userId);
    const bonus = getRelicBonus(userId, pet.id);
    const stones = getItemCount(guildId, userId, 'refine_stone');

    let desc = `🐾 **${pet.name}** (Lv.${pet.level})\n━━━━━━━━━━━━━━━━━━━━━━\n**🎽 Terpasang:**\n`;
    for (const slot of ['weapon', 'armor', 'accessory']) {
        const r = equippedBySlot[slot];
        const unit = r && r.stat_type === 'crit' ? '%' : '';
        desc += r
            ? `> ${_SLOT_EMOJI[slot]} **${r.name}** +${r.refine_level} — ${_STAT_EMOJI[r.stat_type]}+${relicEffective(r)}${unit}\n`
            : `> ${_SLOT_EMOJI[slot]} *(kosong)*\n`;
    }
    // Calculate effective stats (base + flat, then apply percent)
    const baseAtk = pet.atk || 0, baseDef = pet.def || 0, baseSpd = pet.spd || 0, baseCrit = pet.crit || 0;
    const finalAtk = Math.floor((baseAtk + bonus.atk) * (1 + (bonus.percent.atk || 0) / 100));
    const finalDef = Math.floor((baseDef + bonus.def) * (1 + (bonus.percent.def || 0) / 100));
    const finalSpd = Math.floor((baseSpd + bonus.spd) * (1 + (bonus.percent.spd || 0) / 100));
    const finalCrit = Math.floor((baseCrit + bonus.crit) * (1 + (bonus.percent.crit || 0) / 100));

    desc += `\n**📊 Effective Stats:**\n`;
    desc += bonus.percent.atk
        ? `> ⚔️ ATK: ${baseAtk} + ${bonus.percent.atk}% = **${finalAtk}**\n`
        : `> ⚔️ ATK: ${baseAtk}${bonus.atk ? ` + ${bonus.atk}` : ''} = **${finalAtk}**\n`;
    desc += bonus.percent.def
        ? `> 🛡️ DEF: ${baseDef} + ${bonus.percent.def}% = **${finalDef}**\n`
        : `> 🛡️ DEF: ${baseDef}${bonus.def ? ` + ${bonus.def}` : ''} = **${finalDef}**\n`;
    desc += bonus.percent.spd
        ? `> 💨 SPD: ${baseSpd} + ${bonus.percent.spd}% = **${finalSpd}**\n`
        : `> 💨 SPD: ${baseSpd}${bonus.spd ? ` + ${bonus.spd}` : ''} = **${finalSpd}**\n`;
    desc += bonus.percent.crit
        ? `> 🎯 CRIT: ${baseCrit}% + ${bonus.percent.crit}% = **${finalCrit}%**\n`
        : `> 🎯 CRIT: ${baseCrit}%${bonus.crit ? ` + ${bonus.crit}%` : ''} = **${finalCrit}%**\n`;
    desc += `🪨 Refine Stone: **${stones}** | 📿 Total relic: **${all.length}** (${equipped.length} terpasang)\n`;
    desc += `━━━━━━━━━━━━━━━━━━━━━━\n-# Pilih relic untuk **dipasang**, atau **lebur** relic tak terpakai jadi Refine Stone.`;

    const embed = new EmbedBuilder().setTitle('📿 Relic Manager').setColor('#FFD700').setDescription(desc);
    const components = [];

    // Equip select — relics not currently equipped to this pet (max 25).
    const equippable = all.filter(r => r.equipped_pet_id !== pet.id).slice(0, 25);
    if (equippable.length > 0) {
        const equipMenu = new StringSelectMenuBuilder()
            .setCustomId(`pet_relicequip_select_${userId}`)
            .setPlaceholder('🎽 Pasang relic...')
            .setMinValues(1).setMaxValues(1);
        for (const r of equippable) {
            equipMenu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(_relicLabel(r).slice(0, 100))
                .setValue(String(r.id))
                .setDescription(`${r.rarity} • +${r.refine_level}${r.equipped_pet_id ? ' • terpasang di pet lain' : ''}`.slice(0, 100)));
        }
        components.push(new ActionRowBuilder().addComponents(equipMenu));
    }

    // Melt select — any relic (multi). Melting an equipped relic auto-removes it.
    const meltable = all.slice(0, 25);
    if (meltable.length > 0) {
        const meltMenu = new StringSelectMenuBuilder()
            .setCustomId(`pet_relicmelt_select_${userId}`)
            .setPlaceholder('🔥 Lebur relic jadi Refine Stone...')
            .setMinValues(1).setMaxValues(Math.min(meltable.length, 25));
        for (const r of meltable) {
            const yield_ = (r.rarity === 'God' ? 10 : r.rarity === 'Mythic' ? 6 : r.rarity === 'Legendary' ? 3 : r.rarity === 'Epic' ? 2 : 1) + Math.floor((r.refine_level || 0) / 3);
            meltMenu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(_relicLabel(r).slice(0, 100))
                .setValue(String(r.id))
                .setDescription(`Lebur → 🪨 ${yield_} Refine Stone`.slice(0, 100)));
        }
        components.push(new ActionRowBuilder().addComponents(meltMenu));
    }

    components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pet_refine_${userId}`).setLabel('Refine').setEmoji('✨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`pet_relicunequipall_${userId}`).setLabel('Lepas Semua').setEmoji('🧷').setStyle(ButtonStyle.Secondary).setDisabled(equipped.length === 0),
        new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('Kembali').setEmoji('🔙').setStyle(ButtonStyle.Secondary),
    ));

    return { embeds: [embed], components };
}


// ============ HELPER: Build the Drop Rates info panel ============
// Data-driven from DUNGEON_TIERS / BOSS_LIST / EXPEDITION_ZONES so it always
// matches the real loot tables.
function _rateLine(itemId, chancePct, min, max) {
    const d = ITEMS.find(i => i.id === itemId);
    const emoji = d ? (d.menuEmoji || d.emoji) : '📦';
    const name = d ? d.name : itemId;
    const qty = (min == null || min === max) ? `${min || 1}` : `${min}-${max}`;
    return `> ${emoji} ${name} — **${chancePct}%** (x${qty})`;
}

function buildDropRatesPanel(userId, category = 'dungeon') {
    let desc = '';
    let title = '📊 Drop Rates';

    if (category === 'dungeon') {
        title = '📊 Drop Rates — ⚔️ Dungeon';
        for (const dg of DUNGEON_TIERS) {
            desc += `**${dg.name}** (Lv.${dg.minLevel}+)\n`;
            if (!dg.loot || dg.loot.length === 0) desc += `> *(tidak ada item drop)*\n`;
            else for (const l of dg.loot) desc += _rateLine(l.item, Math.round(l.chance * 100), l.min, l.max) + '\n';
            if (dg.relicChance > 0) desc += `> 📿 Relic Equipment — **${Math.round(dg.relicChance * 100)}%**\n`;
            desc += '\n';
        }
    } else if (category === 'boss') {
        title = '📊 Drop Rates — 👹 Boss (solo)';
        for (const b of BOSS_LIST) {
            desc += `**${b.name}** (Lv.${b.minLevel}+)\n`;
            for (const l of b.loot) desc += _rateLine(l.item, Math.round(l.chance * 100), l.min, l.max) + '\n';
            desc += `> 📿 Relic — **${Math.round(b.relicChance * 100)}%**${b.relicRareBonus ? ' (rarity tinggi)' : ''}\n\n`;
        }
        desc += `-# Boss Party Raid: tiap member dapat 🪨 Refine Stone 1-2 (pasti).`;
    } else if (category === 'expedition') {
        title = '📊 Drop Rates — 🌊 Expedition';
        const { EXPEDITION_ZONES } = require('./expedition');
        for (const z of EXPEDITION_ZONES) {
            desc += `**${z.name}** (Lv.${z.minPetLevel}+)\n`;
            for (const d of z.rewards.drops) desc += _rateLine(d.id, d.chance, d.min, d.max) + '\n';
            desc += '\n';
        }
        desc += `-# Peluang final = base + bonus luck (level pet) + synergy (+15% kalau se-elemen), maks **95%**.`;
    } else if (category === 'hunt') {
        title = '📊 Drop Rates — 🏹 Hunt';
        desc += `Hunt **berhasil 80%** dulu (20% gagal). Jika berhasil, roll loot:\n\n`;
        desc += _rateLine('refine_stone', 12, 1, 1) + '\n';
        desc += _rateLine('mystery_box', 8, 1, 1) + '\n';
        desc += _rateLine('rod_part', 5, 1, 1) + '\n';
        desc += `\n-# Peluang efektif per hunt (×80% sukses): Refine ~9.6%, Mystery ~6.4%, Rod ~4%.`;
    }

    const embed = new EmbedBuilder().setTitle(title).setColor('#1ABC9C')
        .setDescription(desc.slice(0, 4096))
        .setFooter({ text: 'Relic rarity: normal 70/20/10% (Rare/Epic/Leg) • rareBonus 40/35/25%' });

    const menu = new StringSelectMenuBuilder().setCustomId(`pet_droprates_select_${userId}`).setPlaceholder('📊 Pilih sumber drop...').setMinValues(1).setMaxValues(1)
        .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('Dungeon').setValue('dungeon').setEmoji('⚔️').setDefault(category === 'dungeon'),
            new StringSelectMenuOptionBuilder().setLabel('Boss').setValue('boss').setEmoji('👹').setDefault(category === 'boss'),
            new StringSelectMenuOptionBuilder().setLabel('Expedition').setValue('expedition').setEmoji('🌊').setDefault(category === 'expedition'),
            new StringSelectMenuOptionBuilder().setLabel('Hunt').setValue('hunt').setEmoji('🏹').setDefault(category === 'hunt'),
        );
    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), backRow] };
}


// ============ HELPER: Build main pet panel embed + buttons ============
function buildMainPanel(guildId, userId, username) {
    const pet = getPetData(guildId, userId);
    const userData = getOrCreateUser(guildId, userId);

    if (!pet) {
        // No pet - show adopt panel
        const embed = new EmbedBuilder()
            .setTitle(ui.title('🐾', 'PET'))
            .setColor(ui.COLORS.pet)
            .setDescription(`Halo **${username}**! Kamu belum punya pet nih. 🥺\n\n` +
                `Yuk adopsi pet pertamamu dan mulai petualangan bareng!\n` +
                `Pet kasih **bonus pasif** otomatis, dan bisa diajak **bertarung**, **masuk dungeon**, sampai **lawan boss raid**!\n\n` +
                `> 🛒 Buka **Shop** untuk adopsi pet atau buka telur gacha\n` +
                `> ${ui.money(userData.balance)}`)
            .setFooter({ text: ui.footer('Klik Shop untuk adopsi pet pertamamu!') });

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

    const bar = (val) => ui.progressBar(val, 100);

    const bonusActive = pet.happiness >= 30 && pet.hunger >= 10 && pet.status !== 'sick';
    const lvlMult = PET_LEVEL_MULTIPLIERS[Math.min(pet.level, 30)] || 1.0;
    const bonusValue = bonusActive ? Math.floor(petDef.bonus.value * lvlMult) : 0;
    const isHunting = pet.hunting_until && pet.hunting_until > Date.now();
    const huntInfo = isHunting ? `\n🏹 **HUNTING** — Kembali <t:${Math.floor(pet.hunting_until / 1000)}:R>` : '';
    const mutationLine = pet.mutation_trait ? `\n🧪 **Mutation:** ${formatTrait(pet)}` : '';

    // Evolution info
    let evoInfo = '';
    const evo = PET_EVOLUTIONS.find(e => e.from === pet.petId);
    if (evo) {
        const evoPetDef = PET_DATA.find(p => p.id === evo.to);
        if (pet.level >= evo.level) evoInfo = `\n🧬 **SIAP EVOLVE!** → ${evoPetDef ? evoPetDef.emoji + ' ' + evoPetDef.name : evo.to}`;
        else evoInfo = `\n🧬 Evolution: Lv.${evo.level} → ${evoPetDef ? evoPetDef.emoji + ' ' + evoPetDef.name : evo.to}`;
    }

    // Effective stats including equipped/owned relic bonuses (from Refine).
    const eff = getEffectiveStats(pet);
    const hasRelic = eff.bonus.atk || eff.bonus.def || eff.bonus.spd || eff.bonus.crit ||
        (eff.bonus.percent && (eff.bonus.percent.atk || eff.bonus.percent.def || eff.bonus.percent.spd || eff.bonus.percent.crit));
    // Show effective total (already includes percent calc from getEffectiveStats)
    const statFmt = (effective, base) => effective !== base ? `**${effective}** (base ${base})` : `**${base}**`;

    const embed = new EmbedBuilder()
        .setTitle(ui.title('🐾', 'PET', `${pet.name} (Lv.${pet.level})`))
        .setColor(bonusActive ? ui.COLORS.success : ui.COLORS.danger)
        .setDescription(
            `${petDef.emoji} **${petDef.name}** — *${petDef.tier}*\n\n` +
            `❤️ Senang: \`${bar(happyPercent)}\` **${happyPercent}%**\n` +
            `🍖 Kenyang: \`${bar(hungerPercent)}\` **${hungerPercent}%**\n` +
            `✨ EXP: ${ui.progressLine(pet.exp, expNeeded)} (${pet.exp}/${expNeeded})\n\n` +
            `⚔️ ATK: ${statFmt(eff.atk, pet.atk)} | 🛡️ DEF: ${statFmt(eff.def, pet.def)} | 💨 SPD: ${statFmt(eff.spd, pet.spd)}\n` +
            `❤️ HP: **${pet.hp}** | 🎯 CRIT: ${eff.crit !== pet.crit ? `**${eff.crit}%** (base ${pet.crit}%)` : `**${pet.crit}%**`}\n` +
            (hasRelic ? `📿 *Bonus relic aktif — naikkan dengan 📿 Refine!*\n` : '') +
            `🎁 Bonus: +**${bonusValue}%** ${petDef.bonus.type.replace(/_/g, ' ')} ${bonusActive ? '✅ aktif' : '❌ nonaktif — beri makan & ajak main!'}` + mutationLine +
            huntInfo + evoInfo
        )
        .setFooter({ text: ui.footer(`${ui.money(userData.balance)} • Class: ${pet.class || 'warrior'} • Element: ${pet.element || 'fire'}`) });

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

        // Pet Abilities info
        const { getAbilitySlots, getAbilityById, isPetEligibleForAbilities } = require('./petAbilities');
        const abilitySlots = getAbilitySlots(guildId, userId);
        const abilitiesEligible = isPetEligibleForAbilities(pet);
        let abilityDesc = '';
        const activeAbilityIds = [abilitySlots.slot1, abilitySlots.slot2, abilitySlots.slot3].filter(Boolean);
        if (activeAbilityIds.length > 0) {
            activeAbilityIds.forEach(aId => {
                const ab = getAbilityById(aId);
                if (ab) abilityDesc += `> ${ab.emoji} **${ab.name}** — ${ab.desc}\n`;
            });
            abilityDesc += `> Status: ${abilitiesEligible ? '✅ AKTIF' : '❌ MATI (happiness/hunger rendah)'}`;
        } else {
            if (pet.level >= 30) abilityDesc = '> ⚪ *Belum dipasang* — Buka lewat ⬆️ More → 🧪 Abilities';
            else abilityDesc = `> 🔒 Unlock di **Lv.30** (sekarang: Lv.${pet.level})`;
        }
        embed.addFields({ name: '🧪 World Abilities', value: abilityDesc, inline: false });

        // Awakening info
        const { getAwakeningData, getStarsDisplay, AWAKENING_TIERS } = require('./awakening');
        const awakData = getAwakeningData(pet.id);
        const stars = getStarsDisplay(awakData.awakeningLevel);
        let awakenDesc = '';
        if (awakData.awakeningLevel > 0) {
            const tier = AWAKENING_TIERS.find(t => t.level === awakData.awakeningLevel);
            awakenDesc = `> ${tier.stars} **${tier.name}** — +${Math.floor(tier.statBoost * 100)}% all base stats\n`;
            awakenDesc += `> 🏷️ Title: **${tier.title}**`;
            if (tier.reward.permanentBonus) {
                awakenDesc += `\n> 🎁 Permanent: +${tier.reward.permanentBonus.value}% ${tier.reward.permanentBonus.type.replace(/_/g, ' ')}`;
            }
        } else {
            if (pet.level >= 200) awakenDesc = '> ⭐ **SIAP AWAKENING!** — Buka lewat ⬆️ More → ⚡ Awakening';
            else awakenDesc = `> 🔒 Butuh **Lv.200** untuk Awakening (sekarang: Lv.${pet.level})`;
        }
        embed.addFields({ name: `⚡ Awakening${stars}`, value: awakenDesc, inline: false });

        // Evolution
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
                const reward = applyLevelScaling(getRandomInt(100, 400), pet.level);
                userData.balance += reward;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, userId);
                addIncome(guildId, userId, 'battle', reward);
                const expResult = addPetExp(guildId, userId, 20);
                let lvlMsg = '';
                if (expResult && expResult.leveledUp) lvlMsg = `\n> 🎉 **LEVEL UP!** ${expResult.petName} → Lv.${expResult.newLevel}!`;
                if (expResult && expResult.newSkill) lvlMsg += `\n> 🌟 **SKILL UNLOCKED:** ${expResult.newSkill.skill.name}!`;
                const huntLoot = rollLoot(guildId, userId, [
                    { item: 'refine_stone', chance: 0.12, min: 1, max: 1 },
                    { item: 'mystery_box', chance: 0.08, min: 1, max: 1 },
                    { item: 'rod_part', chance: 0.05, min: 1, max: 1 }
                ]);
                const lootMsg = huntLoot ? `\n${huntLoot}` : '';
                embed = new EmbedBuilder().setColor('#2ECC71').setTitle('🏹 Hunt Complete!')
                    .setDescription(`${petDef ? petDef.emoji : '🐾'} **${pet.name}** kembali dari berburu!\n\n> ✅ Hasil: 🪙 **${reward.toLocaleString('id-ID')} Money**\n> ✨ Pet EXP: +20${lvlMsg}${lootMsg}\n\n*Buff pet kembali aktif!*`);
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


    // === COLLECTION (My Pets) ===
    if (action === 'collection') {
        const allPets = getAllPets(guildId, userId);
        if (allPets.length === 0) {
            const embed = new EmbedBuilder().setTitle('📦 Pet Collection').setColor('#FF69B4')
                .setDescription('🐾 Belum punya pet! Beli di Shop untuk mulai.');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`pet_dex_Common_${userId}`).setLabel('📖 Pet Dex').setStyle(ButtonStyle.Primary),
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
            new ButtonBuilder().setCustomId(`pet_dex_Common_${userId}`).setLabel('📖 Pet Dex').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`pet_release_${userId}`).setLabel('♻️ Release').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === PET DEX (Catalog semua pet per tier — PERMANENT discovery) ===
    if (action === 'dex') {
        const tier = parts[2]; // pet_dex_TIER_userId
        const validTiers = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret', 'God'];
        const currentTier = validTiers.includes(tier) ? tier : 'Common';
        const tierColors = { Common: '#AAAAAA', Uncommon: '#2ECC71', Rare: '#3498DB', Epic: '#9B59B6', Legendary: '#FFD700', Mythic: '#FF1493', Secret: '#8B00FF', God: '#FF0000' };
        const tierEmojis = { Common: '⚪', Uncommon: '🟢', Rare: '🔵', Epic: '🟣', Legendary: '🟡', Mythic: '🔴', Secret: '🟪', God: '👑' };

        // Get all pets of this tier
        const tierPets = PET_DATA.filter(p => p.tier === currentTier);
        // Use PERMANENT discovery table (persists even after release/sell)
        const { getPetDiscoveries } = require('../database');
        const discoveries = getPetDiscoveries(userId);
        const discoveredPetIds = new Set(discoveries.map(d => d.petId));
        const discoveryMap = {};
        for (const d of discoveries) discoveryMap[d.petId] = d;
        const discoveredCount = tierPets.filter(p => discoveredPetIds.has(p.id)).length;

        // Check for evolution paths
        const { PET_EVOLUTIONS } = require('../data/pets');

        let desc = `${tierEmojis[currentTier]} **${currentTier.toUpperCase()}** — ${tierPets.length} pet\n`;
        desc += `> 📊 Discovered: **${discoveredCount}/${tierPets.length}**\n`;
        desc += `> -# *Pet yang pernah dimiliki tetap tercatat meski di-release*\n`;
        desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n\n`;

        tierPets.forEach(pet => {
            const discovered = discoveredPetIds.has(pet.id);
            const discoveredIcon = discovered ? '✅' : '🔒';
            const evo = PET_EVOLUTIONS.find(e => e.from === pet.id);
            const entry = discoveryMap[pet.id];
            const countInfo = entry && entry.obtain_count > 1 ? ` (×${entry.obtain_count})` : '';

            desc += `${discoveredIcon} ${pet.emoji} **${pet.name}**${countInfo}\n`;
            desc += `> 💰 ${pet.price > 0 ? pet.price.toLocaleString('id-ID') : 'Egg Only'} | 🎁 +${pet.bonus.value}% ${pet.bonus.type.replace(/_/g, ' ')}`;
            if (evo) {
                const evoPet = PET_DATA.find(p => p.id === evo.to);
                desc += `\n> 🧬 Evolve Lv.${evo.level} → ${evoPet ? evoPet.emoji : '?'} ${evoPet ? evoPet.name : evo.to}`;
            }
            desc += `\n\n`;
        });

        if (desc.length > 4000) desc = desc.substring(0, 3950) + '\n*...dan lainnya*';

        const embed = new EmbedBuilder()
            .setTitle(`📖 PET DEX — ${currentTier}`)
            .setColor(tierColors[currentTier] || '#FF69B4')
            .setDescription(desc)
            .setFooter({ text: `${discoveredCount}/${tierPets.length} discovered | Pet yang pernah dimiliki tetap tercatat!` });

        // Tier navigation buttons (8 tiers across 2 rows + nav row)
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_dex_Common_${userId}`).setLabel('⚪ Common').setStyle(currentTier === 'Common' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`pet_dex_Uncommon_${userId}`).setLabel('🟢 Uncommon').setStyle(currentTier === 'Uncommon' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`pet_dex_Rare_${userId}`).setLabel('🔵 Rare').setStyle(currentTier === 'Rare' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`pet_dex_Epic_${userId}`).setLabel('🟣 Epic').setStyle(currentTier === 'Epic' ? ButtonStyle.Success : ButtonStyle.Secondary),
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_dex_Legendary_${userId}`).setLabel('🟡 Legendary').setStyle(currentTier === 'Legendary' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`pet_dex_Mythic_${userId}`).setLabel('🔴 Mythic').setStyle(currentTier === 'Mythic' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`pet_dex_Secret_${userId}`).setLabel('🟪 Secret').setStyle(currentTier === 'Secret' ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`pet_dex_God_${userId}`).setLabel('👑 GOD').setStyle(currentTier === 'God' ? ButtonStyle.Success : ButtonStyle.Secondary),
        );
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_collection_${userId}`).setLabel('📦 My Pets').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary),
        );

        return interaction.update({ embeds: [embed], components: [row1, row2, row3] });
    }


    // === RELEASE (pilih pet untuk dilepas) ===
    if (action === 'release') {
        const allPets = getAllPets(guildId, userId);
        const releasable = allPets.filter(p => p.active !== 1);
        if (releasable.length === 0) return interaction.reply({ content: '❌ Tidak ada pet yang bisa dilepas! Pet **aktif** tidak bisa dilepas — swap ke pet lain dulu.', ephemeral: true });
        const tierRank = { God: 0, Secret: 1, Mythic: 2, Legendary: 3, Epic: 4, Rare: 5, Uncommon: 6, Common: 7 };
        const sorted = releasable.sort((a, b) => (tierRank[PET_DATA.find(p => p.id === b.petId)?.tier] ?? 9) - (tierRank[PET_DATA.find(p => p.id === a.petId)?.tier] ?? 9));
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`pet_release_select_${userId}`)
            .setPlaceholder('♻️ Pilih pet untuk dilepas...')
            .setMinValues(1).setMaxValues(1);
        sorted.slice(0, 25).forEach(pet => {
            const def = PET_DATA.find(p => p.id === pet.petId);
            const tier = def ? def.tier : 'Common';
            const refund = PET_RELEASE_REFUND[tier] || 0;
            menu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`#${pet.id} ${pet.name} (Lv.${pet.level}) — ${tier}`)
                .setValue(pet.id.toString())
                .setDescription(`Refund 🪙${refund.toLocaleString('id-ID')}`));
        });
        const embed = new EmbedBuilder().setTitle('♻️ Release Pet').setColor('#E74C3C')
            .setDescription('Pilih pet yang mau dilepas — kamu dapat **refund** sesuai tier.\n\n> ⚠️ Pet yang dilepas **HILANG PERMANEN**!\n> ⭐ Pet aktif tidak muncul di sini (swap dulu kalau mau dilepas).');
        const row1 = new ActionRowBuilder().addComponents(menu);
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_collection_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }

    // === RELEASE CONFIRM (eksekusi setelah konfirmasi) ===
    if (action === 'relconf') {
        const petId = parseInt(parts[2]);
        const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(petId, guildId, userId);
        const check = canReleasePet(guildId, userId, pet);
        if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });
        const def = PET_DATA.find(p => p.id === pet.petId);
        const tier = def ? def.tier : 'Common';
        const refund = PET_RELEASE_REFUND[tier] || 0;
        db.prepare('DELETE FROM pets WHERE id = ? AND guildId = ? AND userId = ?').run(petId, guildId, userId);
        if (refund > 0) {
            db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(refund, guildId, userId);
            addIncome(guildId, userId, 'release', refund);
        }
        const fresh = getOrCreateUser(guildId, userId);
        const embed = new EmbedBuilder().setColor('#95A5A6').setTitle('♻️ Pet Dilepas')
            .setDescription(`${def ? def.emoji : '🐾'} **${pet.name}** (${tier}) telah dilepas ke alam bebas. 👋\n\n> 🪙 Refund: **+${refund.toLocaleString('id-ID')}**\n> 💳 Saldo: **${fresh.balance.toLocaleString('id-ID')}**`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_collection_${userId}`).setLabel('📦 Collection').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Pet Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
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

    // === EVOLVE (now serves as "More" menu with Refine + Evolve + Abilities + Awakening) ===
    if (action === 'evolve') {
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
        const petDef = PET_DATA.find(p => p.id === pet.petId);
        const evo = PET_EVOLUTIONS.find(e => e.from === pet.petId);
        const { getAwakeningData, getStarsDisplay } = require('./awakening');
        const { getAbilitySlots, getAbilityById, isPetEligibleForAbilities } = require('./petAbilities');
        const awakData = getAwakeningData(pet.id);
        const stars = getStarsDisplay(awakData.awakeningLevel);
        const slots = getAbilitySlots(guildId, userId);
        const abilitiesActive = isPetEligibleForAbilities(pet);

        let desc = `${petDef ? petDef.emoji : '🐾'} **${pet.name}${stars}** (Lv.${pet.level})\n\n`;
        desc += `**⬆️ Fitur Upgrade & Abilities:**\n`;
        desc += `> 📿 **Refine** — Upgrade relic equipment\n`;
        desc += `> 🧬 **Evolve** — Evolusi pet ke bentuk baru\n`;
        desc += `> 🧪 **Abilities** — Passive world abilities (Lv.30+)\n`;
        desc += `> ⚡ **Awakening** — Reset & power up (Lv.200)\n`;

        // Show ability summary
        const activeAbilities = [slots.slot1, slots.slot2, slots.slot3].filter(Boolean);
        if (activeAbilities.length > 0) {
            desc += `\n**🧪 Active Abilities:** ${abilitiesActive ? '✅' : '❌'}\n`;
            activeAbilities.forEach(aId => {
                const ab = getAbilityById(aId);
                if (ab) desc += `> ${ab.emoji} ${ab.name}\n`;
            });
        }

        // Show evolution info
        if (evo) {
            const evoPetDef = PET_DATA.find(p => p.id === evo.to);
            const canEvolve = pet.level >= evo.level;
            desc += `\n**🧬 Evolution:**\n`;
            desc += `> ${evo.name}\n`;
            desc += `> → ${evoPetDef ? evoPetDef.emoji + ' ' + evoPetDef.name : evo.to}\n`;
            desc += `> ${canEvolve ? '✅ **SIAP EVOLVE!**' : `🔒 Butuh Lv.${evo.level}`}\n`;
        }

        // Show awakening info
        if (awakData.awakeningLevel > 0) {
            desc += `\n**⚡ Awakening:** ${stars} (+${Math.floor(awakData.awakeningLevel * 15)}% stats)\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle('⬆️ Upgrade & Abilities')
            .setColor('#9B59B6')
            .setDescription(desc);

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_relic_${userId}`).setLabel('📿 Relic').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`pet_doevolve_${userId}`).setLabel('🧬 Evolve').setStyle(ButtonStyle.Success).setDisabled(!evo || pet.level < evo.level),
            new ButtonBuilder().setCustomId(`pet_abilities_${userId}`).setLabel('🧪 Abilities').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pet_awakening_${userId}`).setLabel('⚡ Awakening').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`pet_droprates_${userId}`).setLabel('📊 Rates').setStyle(ButtonStyle.Secondary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }

    // === ABILITIES (redirect to abilities panel) ===
    if (action === 'abilities') {
        const { buildAbilitiesPanel } = require('./petAbilities');
        return interaction.update(buildAbilitiesPanel(guildId, userId, interaction.user.username));
    }

    // === AWAKENING (redirect to awakening panel) ===
    if (action === 'awakening') {
        const { buildAwakeningPanel } = require('./awakening');
        return interaction.update(buildAwakeningPanel(guildId, userId, interaction.user.username));
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
                .setDescription(`${canEnter ? '✅' : '🔒'} ${ELEMENT_EMOJI[d.element] || ''} Reward: 🪙${d.reward[0]}-${d.reward[1]} | ${d.exp} EXP`));
        });
        const embed = new EmbedBuilder().setTitle('🏰 Dungeon').setColor('#9B59B6')
            .setDescription(`${PET_DATA.find(p => p.id === pet.petId)?.emoji || '🐾'} **${pet.name}** (Lv.${pet.level})\n\n> ⚔️ *Combat cepat — **COUNTER** elemen musuh untuk +25% dmg. Sumber utama **relic & material gear** (ada risiko kalah).*\n\nPilih dungeon untuk masuk:`);
        const row1 = new ActionRowBuilder().addComponents(dungeonMenu);
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`dngcoop_panel_${userId}`).setLabel('🤝 Co-op Roguelike').setStyle(ButtonStyle.Success),
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


    // === RELIC MANAGER ===
    if (action === 'relic') {
        return interaction.update(buildRelicPanel(guildId, userId));
    }

    // === DROP RATES INFO ===
    if (action === 'droprates') {
        return interaction.update(buildDropRatesPanel(userId, 'dungeon'));
    }

    // === UNEQUIP ALL RELICS ===
    if (action === 'relicunequipall') {
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
        unequipAll(userId, pet.id);
        return interaction.update(buildRelicPanel(guildId, userId));
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

    // === EVOLVE (instant action) — triggered by the "🧬 Evolve" button (pet_doevolve_) ===
    if (action === 'doevolve') {
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
        let tierPets = PET_DATA.filter(p => p.tier === selectedTier);
        // Safety: if a tier somehow has no pets (or rates don't reach 100), fall back
        // to the lowest tier in this egg so the player still gets a pet (no money lost).
        if (tierPets.length === 0) {
            const firstTier = Object.keys(egg.rates)[0] || 'Common';
            selectedTier = firstTier;
            tierPets = PET_DATA.filter(p => p.tier === selectedTier);
            if (tierPets.length === 0) tierPets = PET_DATA.filter(p => p.tier === 'Common');
        }
        const wonPet = tierPets[Math.floor(Math.random() * tierPets.length)];
        const isFirst = allPets.length === 0 ? 1 : 0;
        const stats = generatePetStats(selectedTier);
        const pClass = PET_CLASSES[Math.floor(Math.random() * PET_CLASSES.length)];
        const pElement = PET_ELEMENTS[Math.floor(Math.random() * PET_ELEMENTS.length)];
        db.prepare('INSERT INTO pets (guildId, userId, petId, name, active, adoptedAt, class, element, hp, atk, def, spd, crit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(guildId, userId, wonPet.id, wonPet.name, isFirst, Date.now(), pClass, pElement, stats.hp, stats.atk, stats.def, stats.spd, stats.crit);
        // Register in permanent Pokédex
        try { const { registerPetDiscovery } = require('../database'); registerPetDiscovery(userId, wonPet.id); } catch (_) {}
        // Achievement: pet obtained (tier firsts + distinct-collection milestones)
        try {
            const distinctPets = db.prepare('SELECT COUNT(*) AS c FROM pet_discovery WHERE userId = ?').get(userId).c;
            await checkAchievements(interaction.guild, userId, { type: 'pet_obtain', tier: selectedTier, distinctPets });
        } catch (e) { /* achievements must never block hatching */ }
        const tierColors = { Common: '#AAAAAA', Uncommon: '#2ECC71', Rare: '#3498DB', Epic: '#9B59B6', Legendary: '#FFD700', Mythic: '#FF6B6B', Secret: '#8B00FF', God: '#FF0000' };
        let title = '🥚 Egg Hatched!';
        if (selectedTier === 'God') title = '👑🌠 G O D   P E T !!!! 🌠👑';
        else if (selectedTier === 'Secret') title = '🟪🔮 SECRET PET!!! 🔮🟪';
        else if (selectedTier === 'Mythic') title = '🌟✨ MYTHIC PET!!! ✨🌟';
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

    // === RELEASE SELECT (konfirmasi sebelum lepas) ===
    if (customId.startsWith('pet_release_select_')) {
        const petDbId = parseInt(interaction.values[0]);
        const pet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(petDbId, guildId, userId);
        const check = canReleasePet(guildId, userId, pet);
        if (!check.ok) return interaction.reply({ content: check.reason, ephemeral: true });
        const def = PET_DATA.find(p => p.id === pet.petId);
        const tier = def ? def.tier : 'Common';
        const refund = PET_RELEASE_REFUND[tier] || 0;
        const isRare = RARE_RELEASE_TIERS.includes(tier);
        let desc = `${def ? def.emoji : '🐾'} **${pet.name}** (Lv.${pet.level}) — *${tier}*\n\n` +
            `> 🪙 Refund: **+${refund.toLocaleString('id-ID')}**\n` +
            `> ⚠️ Pet ini akan **HILANG PERMANEN** dan tidak bisa dikembalikan!`;
        if (isRare) desc = `🚨 **PERHATIAN — PET LANGKA!** 🚨\n\n` + desc + `\n\n> ‼️ Yakin lepas pet **${tier}** ini? Tindakan ini tidak bisa di-undo!`;
        const embed = new EmbedBuilder().setColor(isRare ? '#FF0000' : '#E74C3C').setTitle('♻️ Konfirmasi Release').setDescription(desc);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_relconf_${pet.id}_${userId}`).setLabel(isRare ? '🚨 YA, LEPAS PET LANGKA' : '♻️ Ya, Lepas').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`pet_collection_${userId}`).setLabel('❌ Batal').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
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
        const enemies = dungeon.monsterHp.map((hp, i) => ({ hp, atk: dungeon.monsterAtk[i], def: Math.floor(dungeon.monsterAtk[i] * 0.3), element: dungeon.element }));

        // Defer first so Discord knows we're processing (15 min window)
        await interaction.deferUpdate();

        // Show "entering dungeon" animation
        const enterEmbed = new EmbedBuilder().setColor('#F39C12').setTitle(`🏰 ${dungeon.name}`)
            .setDescription(`${petDef.emoji} **${pet.name}** memasuki dungeon...\n\n> ⚔️ *Pertarungan sedang berlangsung...*`);
        await interaction.editReply({ embeds: [enterEmbed], components: [] });

        // Resolve after delay
        await new Promise(resolve => setTimeout(resolve, 3000));

        const result = simulateBattle(pet, petDef, enemies);
        let reward = 0, expGain = 0, lootText = '', relicText = '';
        if (result.alive) {
            reward = getRandomInt(dungeon.reward[0], dungeon.reward[1]);
            const comboMult = getComboMultiplier(guildId, userId);
            reward = applyLevelScaling(Math.floor(reward * comboMult), pet.level);
            expGain = dungeon.exp;
            db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(reward, guildId, userId);
            addPetExp(guildId, userId, expGain);
            incrementUserStat(guildId, userId, 'dungeon_clears');
            addIncome(guildId, userId, 'battle', reward);
            updateQuestProgress(guildId, userId, 'dungeon', 1);
            await checkAchievements(interaction.guild, userId, { type: 'dungeon_clear' });
            lootText = rollLoot(guildId, userId, dungeon.loot);
            relicText = rollRelicDrop(guildId, userId, dungeon.relicChance, dungeon.relicRareBonus);
        } else {
            const freshData = getOrCreateUser(guildId, userId);
            const penalty = computePenalty(dungeon, freshData.balance);
            if (penalty > 0) db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(penalty, guildId, userId);
            db.prepare('UPDATE pets SET happiness = MAX(0, happiness - 20) WHERE id = ?').run(pet.id);
            addPetExp(guildId, userId, Math.floor(dungeon.exp * 0.3));
            reward = -penalty;
        }
        const lootBlock = (lootText || relicText) ? `\n${[lootText, relicText.replace(/^\n/, '')].filter(Boolean).join('\n')}` : '';
        const statusText = result.alive
            ? `🏆 **CLEAR!**\n> 🪙 +${reward.toLocaleString('id-ID')} Money\n> ✨ +${expGain} Pet EXP\n> ❤️ HP sisa: ${result.remainingHp}${lootBlock}`
            : `💀 **FAILED!**\n> 🪙 -${Math.abs(reward).toLocaleString('id-ID')} Money\n> ❤️ Happiness -20`;
        const embed = new EmbedBuilder().setColor(result.alive ? '#2ECC71' : '#E74C3C').setTitle(`🏰 ${dungeon.name}`)
            .setDescription(`${result.log.join('\n')}\n\n━━━━━━ **RESULT** ━━━━━━\n${statusText}`)
            .setFooter({ text: `Pet: ${pet.name} Lv.${pet.level} | CD: ${Math.round((dungeon.cooldown||300000)/60000)} menit` });
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_dungeon_${userId}`).setLabel('🏰 Dungeon Lagi').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        await interaction.editReply({ embeds: [embed], components: [backRow] }).catch(() => {});
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
            BOSS_LIST.forEach(b => { desc += `${b.name} ${ELEMENT_EMOJI[b.element] || ''}\n> Level: **${b.minLevel}+** | HP: **${b.hp.toLocaleString()}** | ATK: ${b.atk} | DEF: ${b.def}\n> Reward: 🪙 ${b.reward[0].toLocaleString()}-${b.reward[1].toLocaleString()} + ${b.exp} Pet EXP\n\n`; });
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
                    .setDescription(`${canFight ? '✅' : '🔒'} ${ELEMENT_EMOJI[b.element] || ''} HP: ${b.hp.toLocaleString()} | Reward: 🪙${b.reward[0]}-${b.reward[1]}`));
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
        const result = simulateBattle(pet, petDef, [{ hp: boss.hp, atk: boss.atk, def: boss.def, element: boss.element }]);

        let reward = 0, expGain = 0, lootText = '', relicText = '';
        if (result.alive) {
            reward = applyLevelScaling(getRandomInt(boss.reward[0], boss.reward[1]), pet.level);
            expGain = boss.exp;
            db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(reward, guildId, userId);
            addPetExp(guildId, userId, expGain);
            incrementUserStat(guildId, userId, 'boss_kills');
            addIncome(guildId, userId, 'battle', reward);
            updateQuestProgress(guildId, userId, 'boss', 1);
            await checkAchievements(interaction.guild, userId, { type: 'boss_kill' });
            relicText = rollRelicDrop(guildId, userId, boss.relicChance, boss.relicRareBonus);
            lootText = rollLoot(guildId, userId, boss.loot);
        } else {
            const freshData = getOrCreateUser(guildId, userId);
            const penalty = computePenalty(boss, freshData.balance);
            if (penalty > 0) db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(penalty, guildId, userId);
            db.prepare('UPDATE pets SET happiness = MAX(0, happiness - 10) WHERE id = ?').run(pet.id);
            addPetExp(guildId, userId, Math.floor(boss.exp * 0.3));
            reward = -penalty;
        }

        const lootBlock = (lootText || relicText) ? `\n${[lootText, relicText.replace(/^\n/, '')].filter(Boolean).join('\n')}` : '';
        const statusText = result.alive
            ? `🏆 **BOSS DEFEATED!**\n> 🪙 +${reward.toLocaleString('id-ID')} Money\n> ✨ +${expGain} Pet EXP${lootBlock}`
            : `💀 **FAILED!**\n> 🪙 -${Math.abs(reward).toLocaleString('id-ID')} Money\n> ❤️ Happiness -10`;
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

    // === RELIC EQUIP SELECT ===
    if (customId.startsWith('pet_relicequip_select_')) {
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
        const relicId = parseInt(interaction.values[0], 10);
        const res = equipRelic(userId, pet.id, relicId);
        if (!res.success) return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
        return interaction.update(buildRelicPanel(guildId, userId));
    }

    // === DROP RATES SELECT (switch category) ===
    if (customId.startsWith('pet_droprates_select_')) {
        return interaction.update(buildDropRatesPanel(userId, interaction.values[0]));
    }

    // === RELIC MELT SELECT ===
    if (customId.startsWith('pet_relicmelt_select_')) {
        const ids = interaction.values.map(v => parseInt(v, 10));
        let totalStones = 0, melted = 0;
        const names = [];
        for (const id of ids) {
            const res = meltRelic(guildId, userId, id);
            if (res.success) { totalStones += res.stones; melted++; names.push(res.relic.name); }
        }
        if (melted === 0) return interaction.reply({ content: '❌ Tidak ada relic yang dilebur.', ephemeral: true });
        await interaction.update(buildRelicPanel(guildId, userId)).catch(() => {});
        try { const { checkAchievements } = require("./achievements"); await checkAchievements(interaction.guild, userId, { type: "relic_melt" }); } catch (_) {}
        return interaction.followUp({ content: `🔥 Melebur **${melted} relic** → 🪨 **${totalStones} Refine Stone**!\n-# ${names.slice(0, 8).join(', ')}${names.length > 8 ? '…' : ''}`, ephemeral: true }).catch(() => {});
    }

    // === REFINE SELECT ===
    if (customId.startsWith('pet_refine_select_')) {
        const slot = interaction.values[0];
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
        const relic = db.prepare('SELECT * FROM relics WHERE userId = ? AND slot = ? AND equipped_pet_id = ?').get(userId, slot, pet.id);
        if (!relic) {
            // Check unequipped relics
            const unequipped = db.prepare('SELECT * FROM relics WHERE userId = ? AND slot = ?').get(userId, slot);
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
        updateQuestProgress(guildId, userId, 'refine', 1);
        await checkAchievements(interaction.guild, userId, { type: 'refine_success', maxRefine: (lvl + 1) >= 20 });
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('✨ Refine Success!')
            .setDescription(`**${relic.name}** berhasil di-upgrade!\n\n> ${slotEmoji} **${relic.name}** +${lvl} → **+${lvl+1}**\n> Stats: +${Math.floor(relic.stat_value * (1 + (lvl+1)*0.05))} ${relic.stat_type}\n> Rate was: ${rate}%`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_refine_${userId}`).setLabel('📿 Refine Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    } else {
        // Protection Stone: if owned, consume one and the relic does NOT drop a level.
        if (getItemCount(guildId, userId, 'protection_stone') > 0) {
            removeItem(guildId, userId, 'protection_stone');
            const remaining = getItemCount(guildId, userId, 'protection_stone');
            const pEmbed = new EmbedBuilder().setColor('#F1C40F').setTitle('🛡️ Refine Failed — Dilindungi!')
                .setDescription(`**${relic.name}** gagal, tapi **🛡️ Protection Stone** melindungi!\n\n> ${slotEmoji} **${relic.name}** tetap **+${lvl}** (tidak turun)\n> Rate was: ${rate}%\n> 🛡️ Protection Stone tersisa: **${remaining}**`);
            const pRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_refine_${userId}`).setLabel('📿 Refine Lagi').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [pEmbed], components: [pRow] });
        }
        const newLvl = Math.max(0, lvl - 1);
        db.prepare('UPDATE relics SET refine_level = ? WHERE id = ?').run(newLvl, relic.id);
        const embed = new EmbedBuilder().setColor('#E74C3C').setTitle('💔 Refine Failed!')
            .setDescription(`**${relic.name}** gagal di-upgrade...\n\n> ${slotEmoji} **${relic.name}** +${lvl} → **+${newLvl}**\n> Rate was: ${rate}%\n\n> 😢 Level turun 1! (bawa 🛡️ Protection Stone biar tidak turun)`);
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
    buildMainPanel,
    buildRelicPanel,
    buildDropRatesPanel
};
