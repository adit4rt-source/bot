// systems/nightmare.js — Nightmare Dungeon (endgame daily) + Nightmare Shop + Skill Reroll UI
// Daily limited entries of scaled dungeons with random modifiers. Rewards Nightmare Tokens.
// Shop sells Skill Tomes and endgame materials.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { db, getOrCreateUser, getItemCount, addItem, removeItem, getUserStat, setUserStat, incrementUserStat, addIncome } = require('../database');
const { getRandomInt } = require('../utils');
const { simulateBattle, getPetData, getPetSkills, ensurePetBattleSkills, rerollPetSkill, ELEMENT_EMOJI } = require('./pets');
const { PET_DATA, PET_SKILLS } = require('../data/pets');
const { DUNGEON_TIERS } = require('../data/dungeons');
const { ITEMS } = require('../data/items');
const { hasAbility } = require('./petAbilities');
const { getComboMultiplier, addComboFeature } = require('./combo');
const { updateQuestProgress } = require('./quests');
const { checkAchievements } = require('./achievements');
const state = require('../state');
const { fishCooldowns } = state;

const BASE_DAILY_ENTRIES = 3;
const MIN_PET_LEVEL = 100;
const STAT_SCALE = 1.5;
const REWARD_SCALE = 1.35;

const NIGHTMARE_MODIFIERS = [
    { id: 'no_heal', name: '🩸 Blood Curse', desc: 'Heal / drain / genesis dinonaktifkan', mods: { noHeal: true } },
    { id: 'element_seal', name: '🔇 Element Seal', desc: 'Tidak ada advantage elemen', mods: { elementSeal: true } },
    { id: 'frenzy', name: '💢 Frenzy', desc: 'Musuh +30% ATK', mods: { enemyAtkMult: 1.3 } },
    { id: 'shattered', name: '🪞 Shattered Guard', desc: 'DEF pet −25%', mods: { petDefMult: 0.75 } },
    { id: 'endurance', name: '🗿 Endurance', desc: 'Musuh +40% HP (via wave HP)', mods: { hpMult: 1.4 } },
    { id: 'standard', name: '⚖️ Standard Nightmare', desc: 'Tanpa modifier ekstra (stats ×1.5 saja)', mods: {} },
];

const NIGHTMARE_SHOP = [
    { id: 'skill_tome', name: 'Skill Tome', emoji: '📖', cost: 8, qty: 1, type: 'item', desc: 'Reroll 1 battle skill (pilih tier)' },
    { id: 'refine_pack', name: 'Refine Pack', emoji: '🪨', cost: 3, qty: 5, itemId: 'refine_stone', type: 'item', desc: '5× Refine Stone' },
    { id: 'protect_pack', name: 'Protection Pack', emoji: '🛡️', cost: 5, qty: 2, itemId: 'protection_stone', type: 'item', desc: '2× Protection Stone' },
    { id: 'mystery_pack', name: 'Mystery Pack', emoji: '📦', cost: 2, qty: 3, itemId: 'mystery_box', type: 'item', desc: '3× Mystery Box' },
    { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', cost: 15, qty: 1, itemId: 'mythic_fragment', type: 'item', desc: '1× Mythic Fragment' },
    { id: 'money_cache', name: 'Money Cache', emoji: '🪙', cost: 10, money: 50000, type: 'money', desc: '🪙 50.000' },
    { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡', cost: 6, qty: 1, itemId: 'xp_booster_3x', type: 'item', desc: 'Triple XP 1 jam' },
];

function todayKey() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

function getDailyEntriesUsed(guildId, userId) {
    return getUserStat(guildId, userId, `nightmare_entries_${todayKey()}`) || 0;
}

function getMaxDailyEntries(guildId, userId) {
    let max = BASE_DAILY_ENTRIES;
    if (hasAbility(guildId, userId, 'nightmare_runner')) max += 1;
    return max;
}

function getEntriesLeft(guildId, userId) {
    return Math.max(0, getMaxDailyEntries(guildId, userId) - getDailyEntriesUsed(guildId, userId));
}

function consumeEntry(guildId, userId) {
    const key = `nightmare_entries_${todayKey()}`;
    const used = getUserStat(guildId, userId, key) || 0;
    setUserStat(guildId, userId, key, used + 1);
}

function pickModifier() {
    return NIGHTMARE_MODIFIERS[Math.floor(Math.random() * NIGHTMARE_MODIFIERS.length)];
}

function buildNightmareDungeon(base) {
    const hpMult = STAT_SCALE;
    return {
        ...base,
        id: `nm_${base.id}`,
        baseId: base.id,
        name: `🌑 ${base.name.replace(/^[^\s]+\s/, '')} (Nightmare)`,
        minLevel: Math.max(MIN_PET_LEVEL, base.minLevel),
        monsterHp: base.monsterHp.map(h => Math.floor(h * hpMult)),
        monsterAtk: base.monsterAtk.map(a => Math.floor(a * STAT_SCALE)),
        reward: [Math.floor(base.reward[0] * REWARD_SCALE), Math.floor(base.reward[1] * REWARD_SCALE)],
        exp: Math.floor(base.exp * 1.4),
        cooldown: Math.floor((base.cooldown || 120000) * 0.75),
        penaltyCap: Math.floor((base.penaltyCap || 2000) * 1.2),
        relicChance: Math.min(0.55, (base.relicChance || 0) + 0.08),
        loot: (base.loot || []).map(l => ({ ...l, chance: Math.min(0.95, (l.chance || 0) + 0.05) })),
        nightmare: true,
    };
}

function tokenRewardForDungeon(base, won) {
    if (!won) return 1; // consolation
    const idx = DUNGEON_TIERS.findIndex(d => d.id === base.baseId || d.id === base.id);
    const tierBonus = Math.max(0, idx) + 1; // 1..5
    return getRandomInt(1 + tierBonus, 2 + tierBonus + 1); // ~2-8
}

function applyLevelScaling(reward, level) {
    return Math.floor(reward * (1 + (level || 1) / 200));
}

function computePenalty(entry, balance) {
    const maxReward = (entry.reward && entry.reward[1]) || 0;
    const cap = entry.penaltyCap || 2000;
    return Math.max(0, Math.min(Math.floor(maxReward * 0.3), cap, Math.max(0, balance)));
}

function rollLoot(guildId, userId, lootTable) {
    if (!Array.isArray(lootTable) || lootTable.length === 0) return '';
    const lines = [];
    for (const entry of lootTable) {
        if (Math.random() < (entry.chance ?? 1)) {
            let qty = getRandomInt(entry.min || 1, entry.max || 1);
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

function rollRelicDrop(guildId, userId, chance, rareBonus) {
    if (!chance || Math.random() >= chance) return '';
    try {
        const { RELIC_NAMES, RELIC_MYTHIC_NAMES, RELIC_GOD_NAMES } = require('../data/pets');
        const slot = ['weapon', 'armor', 'accessory'][Math.floor(Math.random() * 3)];
        const r = Math.random();
        let rarity;
        if (rareBonus) rarity = r < 0.002 ? 'God' : r < 0.02 ? 'Mythic' : r < 0.25 ? 'Legendary' : r < 0.6 ? 'Epic' : 'Rare';
        else rarity = r < 0.008 ? 'Mythic' : r < 0.12 ? 'Legendary' : r < 0.35 ? 'Epic' : 'Rare';
        let nameList;
        if (rarity === 'God') nameList = RELIC_GOD_NAMES[slot];
        else if (rarity === 'Mythic') nameList = RELIC_MYTHIC_NAMES[slot];
        else nameList = RELIC_NAMES[slot];
        const name = nameList[Math.floor(Math.random() * nameList.length)];
        const statType = slot === 'weapon' ? 'atk' : slot === 'armor' ? 'def' : (Math.random() < 0.5 ? 'spd' : 'crit');
        const statVal = rarity === 'God' ? getRandomInt(25, 50) : rarity === 'Mythic' ? getRandomInt(15, 30) : rarity === 'Legendary' ? getRandomInt(50, 80) : rarity === 'Epic' ? getRandomInt(35, 50) : getRandomInt(20, 35);
        db.prepare('INSERT INTO relics (guildId, userId, name, slot, rarity, stat_type, stat_value) VALUES (?, ?, ?, ?, ?, ?, ?)').run(guildId, userId, name, slot, rarity, statType, statVal);
        return `\n> 📿 **RELIC DROP:** ${name} (${rarity})`;
    } catch (_) { return ''; }
}

// ==================== PANELS ====================
function buildNightmarePanel(guildId, userId, username) {
    const pet = getPetData(guildId, userId);
    const left = getEntriesLeft(guildId, userId);
    const max = getMaxDailyEntries(guildId, userId);
    const tokens = getItemCount(guildId, userId, 'nightmare_token');
    const tomes = getItemCount(guildId, userId, 'skill_tome');

    let desc = `**Nightmare Dungeon** — endgame daily loop\n\n`;
    desc += `> 🌑 Entry hari ini: **${left}/${max}** tersisa\n`;
    desc += `> 🌑 Nightmare Token: **${tokens}**\n`;
    desc += `> 📖 Skill Tome: **${tomes}**\n`;
    desc += `> 🐾 Min pet level: **${MIN_PET_LEVEL}**\n\n`;
    desc += `**Aturan:**\n`;
    desc += `> • Stats musuh ×${STAT_SCALE}, reward ×${REWARD_SCALE}\n`;
    desc += `> • 1 modifier acak tiap run\n`;
    desc += `> • Menang → Nightmare Tokens + loot boosted\n`;
    desc += `> • Kalah → 1 token + penalty money (cap)\n\n`;
    if (!pet) desc += `❌ Belum punya pet aktif!\n`;
    else if (pet.level < MIN_PET_LEVEL) desc += `🔒 Pet **${pet.name}** Lv.${pet.level} — butuh Lv.${MIN_PET_LEVEL}+\n`;
    else desc += `✅ **${pet.name}** Lv.${pet.level} siap masuk\n`;

    const embed = new EmbedBuilder()
        .setTitle('🌑 Nightmare Dungeon')
        .setColor('#1a1a2e')
        .setDescription(desc)
        .setFooter({ text: `Reset entry: 00:00 WIB | ${username}` });

    const canEnter = pet && pet.level >= MIN_PET_LEVEL && left > 0;
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pet_nmrun_${userId}`).setLabel('⚔️ Pilih Dungeon').setStyle(ButtonStyle.Danger).setDisabled(!canEnter),
        new ButtonBuilder().setCustomId(`pet_nmshop_${userId}`).setLabel('🛒 Nightmare Shop').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`pet_skillreroll_${userId}`).setLabel('📖 Skill Reroll').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row1] };
}

function buildNightmareSelect(guildId, userId) {
    const pet = getPetData(guildId, userId);
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`pet_nm_select_${userId}`)
        .setPlaceholder('🌑 Pilih Nightmare dungeon...')
        .setMinValues(1).setMaxValues(1);

    for (const d of DUNGEON_TIERS) {
        const nm = buildNightmareDungeon(d);
        const can = pet && pet.level >= nm.minLevel;
        menu.addOptions(new StringSelectMenuOptionBuilder()
            .setLabel(`${nm.name} (Lv.${nm.minLevel}+)`)
            .setValue(d.id)
            .setDescription(`${can ? '✅' : '🔒'} ${d.waves} waves | 🪙${nm.reward[0]}-${nm.reward[1]} | Token++`.slice(0, 100)));
    }

    const embed = new EmbedBuilder()
        .setTitle('🌑 Pilih Nightmare Dungeon')
        .setColor('#1a1a2e')
        .setDescription(`Entry tersisa: **${getEntriesLeft(guildId, userId)}**\nModifier di-roll **setelah** masuk.`);

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(menu),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_nightmare_${userId}`).setLabel('🔙 Nightmare').setStyle(ButtonStyle.Secondary),
            ),
        ],
    };
}

function buildNightmareShop(guildId, userId) {
    const tokens = getItemCount(guildId, userId, 'nightmare_token');
    let desc = `🌑 **Token kamu:** ${tokens}\n\n`;
    for (const item of NIGHTMARE_SHOP) {
        const can = tokens >= item.cost;
        desc += `> ${item.emoji} **${item.name}** — 🌑 ${item.cost} ${can ? '✅' : '🔒'}\n>   *${item.desc}*\n`;
    }

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`pet_nmshop_select_${userId}`)
        .setPlaceholder('🛒 Beli dengan Nightmare Token...')
        .setMinValues(1).setMaxValues(1);

    for (const item of NIGHTMARE_SHOP) {
        menu.addOptions(new StringSelectMenuOptionBuilder()
            .setLabel(`${item.name} (${item.cost} token)`)
            .setValue(item.id)
            .setDescription(item.desc.slice(0, 100))
            .setEmoji(item.emoji));
    }

    const embed = new EmbedBuilder()
        .setTitle('🛒 Nightmare Shop')
        .setColor('#9B59B6')
        .setDescription(desc);

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(menu),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_nightmare_${userId}`).setLabel('🔙 Nightmare').setStyle(ButtonStyle.Secondary),
            ),
        ],
    };
}

function buildSkillRerollPanel(guildId, userId) {
    const pet = getPetData(guildId, userId);
    const tomes = getItemCount(guildId, userId, 'skill_tome');
    if (!pet) {
        return {
            embeds: [new EmbedBuilder().setTitle('📖 Skill Reroll').setColor('#E74C3C').setDescription('❌ Tidak ada pet aktif!')],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_nightmare_${userId}`).setLabel('🔙 Nightmare').setStyle(ButtonStyle.Secondary),
            )],
        };
    }

    ensurePetBattleSkills(pet.id, pet.level);
    const fresh = getPetData(guildId, userId);
    const skills = getPetSkills(fresh);

    let desc = `${PET_DATA.find(p => p.id === pet.petId)?.emoji || '🐾'} **${pet.name}** Lv.${pet.level}\n`;
    desc += `> 📖 Skill Tome: **${tomes}**\n\n`;
    desc += `**Battle Skills saat ini:**\n`;
    if (skills.length === 0) desc += `> *Belum ada skill*\n`;
    else skills.forEach(s => { desc += `> ${s.emoji} **T${s.tier}** ${s.name} — ${s.desc}\n`; });
    desc += `\nPilih **tier** yang mau di-reroll (1 tome / reroll).\n`;
    desc += `Skill diganti acak di tier yang sama (tidak bisa dapat skill yang sama).`;

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`pet_skillreroll_select_${userId}`)
        .setPlaceholder('📖 Pilih tier skill untuk reroll...')
        .setMinValues(1).setMaxValues(1);

    for (let tier = 1; tier <= 5; tier++) {
        const unlock = { 1: 10, 2: 30, 3: 60, 4: 100, 5: 150 }[tier];
        const has = skills.some(s => s.tier === tier);
        const can = pet.level >= unlock && tomes > 0;
        menu.addOptions(new StringSelectMenuOptionBuilder()
            .setLabel(`Tier ${tier} (unlock Lv.${unlock})`)
            .setValue(String(tier))
            .setDescription(`${has ? 'Punya skill' : 'Belum punya (akan assign)'} ${can ? '✅' : '🔒'}`.slice(0, 100)));
    }

    const embed = new EmbedBuilder()
        .setTitle('📖 Skill Reroll')
        .setColor('#3498DB')
        .setDescription(desc);

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(menu),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_nightmare_${userId}`).setLabel('🔙 Nightmare').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🏠 Pet Panel').setStyle(ButtonStyle.Secondary),
            ),
        ],
    };
}

// ==================== RUN ====================
async function runNightmare(interaction, guildId, userId, baseDungeonId) {
    const pet = getPetData(guildId, userId);
    if (!pet) return interaction.reply({ content: '❌ Tidak ada pet aktif!', ephemeral: true });
    if (pet.level < MIN_PET_LEVEL) return interaction.reply({ content: `❌ Butuh pet Lv.${MIN_PET_LEVEL}+!`, ephemeral: true });

    const left = getEntriesLeft(guildId, userId);
    if (left <= 0) return interaction.reply({ content: '❌ Entry Nightmare hari ini habis! Reset 00:00 WIB.', ephemeral: true });

    const base = DUNGEON_TIERS.find(d => d.id === baseDungeonId);
    if (!base) return interaction.reply({ content: '❌ Dungeon tidak ditemukan!', ephemeral: true });
    const dungeon = buildNightmareDungeon(base);
    if (pet.level < dungeon.minLevel) {
        return interaction.reply({ content: `❌ Pet butuh Lv.${dungeon.minLevel}+ untuk nightmare ini!`, ephemeral: true });
    }

    const cdKey = `nightmare_${guildId}_${userId}`;
    if (fishCooldowns.has(cdKey) && Date.now() < fishCooldowns.get(cdKey)) {
        const rem = Math.ceil((fishCooldowns.get(cdKey) - Date.now()) / 60000);
        return interaction.reply({ content: `⏳ Nightmare cooldown! Tunggu **${rem} menit**.`, ephemeral: true });
    }

    consumeEntry(guildId, userId);
    fishCooldowns.set(cdKey, Date.now() + (dungeon.cooldown || 120000));
    addComboFeature(guildId, userId, 'dungeon');

    const modifier = pickModifier();
    const hpMult = modifier.mods.hpMult || 1;
    const enemies = dungeon.monsterHp.map((hp, i) => ({
        hp: Math.floor(hp * hpMult),
        atk: dungeon.monsterAtk[i],
        def: Math.floor(dungeon.monsterAtk[i] * 0.3),
        element: dungeon.element,
    }));

    const petDef = PET_DATA.find(p => p.id === pet.petId);
    const battlePet = { ...pet, _battleMods: modifier.mods };

    await interaction.deferUpdate();
    const enterEmbed = new EmbedBuilder().setColor('#8e44ad').setTitle(`🌑 ${dungeon.name}`)
        .setDescription(
            `${petDef?.emoji || '🐾'} **${pet.name}** memasuki Nightmare...\n\n` +
            `> Modifier: **${modifier.name}**\n> ${modifier.desc}\n\n` +
            `> ⚔️ *Pertarungan sedang berlangsung...*`
        );
    await interaction.editReply({ embeds: [enterEmbed], components: [] });
    await new Promise(r => setTimeout(r, 3000));

    const result = simulateBattle(battlePet, petDef, enemies);
    let reward = 0, expGain = 0, lootText = '', relicText = '', tokenGain = 0;

    if (result.alive) {
        reward = getRandomInt(dungeon.reward[0], dungeon.reward[1]);
        const comboMult = getComboMultiplier(guildId, userId);
        reward = applyLevelScaling(Math.floor(reward * comboMult), pet.level);
        expGain = dungeon.exp;
        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(reward, guildId, userId);
        const { addPetExp } = require('./pets');
        addPetExp(guildId, userId, expGain);
        incrementUserStat(guildId, userId, 'nightmare_clears');
        incrementUserStat(guildId, userId, 'dungeon_clears');
        addIncome(guildId, userId, 'battle', reward);
        updateQuestProgress(guildId, userId, 'dungeon', 1);
        try { await checkAchievements(interaction.guild, userId, { type: 'dungeon_clear' }); } catch (_) {}
        lootText = rollLoot(guildId, userId, dungeon.loot);
        let relicChance = dungeon.relicChance || 0;
        if (hasAbility(guildId, userId, 'relic_finder')) relicChance += 0.15;
        relicText = rollRelicDrop(guildId, userId, relicChance, dungeon.relicRareBonus);
        tokenGain = tokenRewardForDungeon(dungeon, true);
        addItem(guildId, userId, 'nightmare_token', tokenGain);
    } else {
        const freshData = getOrCreateUser(guildId, userId);
        const penalty = computePenalty(dungeon, freshData.balance);
        if (penalty > 0) db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(penalty, guildId, userId);
        db.prepare('UPDATE pets SET happiness = MAX(0, happiness - 25) WHERE id = ?').run(pet.id);
        const { addPetExp } = require('./pets');
        addPetExp(guildId, userId, Math.floor(dungeon.exp * 0.25));
        reward = -penalty;
        tokenGain = 1;
        addItem(guildId, userId, 'nightmare_token', tokenGain);
    }

    const lootBlock = (lootText || relicText) ? `\n${[lootText, relicText.replace(/^\n/, '')].filter(Boolean).join('\n')}` : '';
    const statusText = result.alive
        ? `🏆 **NIGHTMARE CLEAR!**\n> 🪙 +${reward.toLocaleString('id-ID')} Money\n> ✨ +${expGain} Pet EXP\n> 🌑 +${tokenGain} Nightmare Token\n> ❤️ HP sisa: ${result.remainingHp}${lootBlock}`
        : `💀 **NIGHTMARE FAILED!**\n> 🪙 -${Math.abs(reward).toLocaleString('id-ID')} Money\n> 🌑 +${tokenGain} Token (consolation)\n> ❤️ Happiness -25`;

    const embed = new EmbedBuilder()
        .setColor(result.alive ? '#2ECC71' : '#E74C3C')
        .setTitle(`🌑 ${dungeon.name}`)
        .setDescription(
            `> Modifier: **${modifier.name}** — ${modifier.desc}\n\n` +
            `${result.log.join('\n')}\n\n━━━━━━ **RESULT** ━━━━━━\n${statusText}\n\n` +
            `> Entry sisa: **${getEntriesLeft(guildId, userId)}**`
        )
        .setFooter({ text: `Pet: ${pet.name} Lv.${pet.level}` });

    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pet_nmrun_${userId}`).setLabel('⚔️ Nightmare Lagi').setStyle(ButtonStyle.Danger).setDisabled(getEntriesLeft(guildId, userId) <= 0),
        new ButtonBuilder().setCustomId(`pet_nmshop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`pet_nightmare_${userId}`).setLabel('🔙 Nightmare').setStyle(ButtonStyle.Secondary),
    );
    await interaction.editReply({ embeds: [embed], components: [backRow] }).catch(() => {});
}

async function buyNightmareShop(interaction, guildId, userId, shopId) {
    const item = NIGHTMARE_SHOP.find(i => i.id === shopId);
    if (!item) return interaction.reply({ content: '❌ Item tidak ditemukan!', ephemeral: true });
    const tokens = getItemCount(guildId, userId, 'nightmare_token');
    if (tokens < item.cost) {
        return interaction.reply({ content: `❌ Token kurang! Butuh 🌑 **${item.cost}** (punya ${tokens}).`, ephemeral: true });
    }
    removeItem(guildId, userId, 'nightmare_token', item.cost);
    let gained = '';
    if (item.type === 'money') {
        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(item.money, guildId, userId);
        addIncome(guildId, userId, 'shop', item.money);
        gained = `🪙 **${item.money.toLocaleString('id-ID')}**`;
    } else {
        const itemId = item.itemId || item.id;
        const qty = item.qty || 1;
        addItem(guildId, userId, itemId, qty);
        gained = `${item.emoji} **${item.name}** ×${qty}`;
    }
    incrementUserStat(guildId, userId, 'nightmare_shop_buys');

    const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('✅ Pembelian Berhasil')
        .setDescription(`Kamu membeli ${gained}\n> 🌑 −${item.cost} Token\n> Sisa token: **${getItemCount(guildId, userId, 'nightmare_token')}**`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pet_nmshop_${userId}`).setLabel('🛒 Shop Lagi').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`pet_skillreroll_${userId}`).setLabel('📖 Skill Reroll').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`pet_nightmare_${userId}`).setLabel('🔙 Nightmare').setStyle(ButtonStyle.Secondary),
    );
    return interaction.update({ embeds: [embed], components: [row] });
}

async function doSkillReroll(interaction, guildId, userId, tier) {
    const pet = getPetData(guildId, userId);
    if (!pet) return interaction.reply({ content: '❌ Tidak ada pet aktif!', ephemeral: true });
    const tomes = getItemCount(guildId, userId, 'skill_tome');
    if (tomes <= 0) return interaction.reply({ content: '❌ Butuh **📖 Skill Tome**! Beli di Nightmare Shop.', ephemeral: true });

    ensurePetBattleSkills(pet.id, pet.level);
    const result = rerollPetSkill(pet.id, tier);
    if (!result.success) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });

    removeItem(guildId, userId, 'skill_tome', 1);
    incrementUserStat(guildId, userId, 'skill_rerolls');

    const oldName = result.oldSkill ? `${result.oldSkill.emoji} ${result.oldSkill.name}` : '*(baru)*';
    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('📖 Skill Reroll!')
        .setDescription(
            `${PET_DATA.find(p => p.id === pet.petId)?.emoji || '🐾'} **${pet.name}** — Tier **${tier}**\n\n` +
            `> ${oldName}\n> ⬇️\n> ${result.skill.emoji} **${result.skill.name}**\n> *${result.skill.desc}*\n\n` +
            `> 📖 Skill Tome sisa: **${getItemCount(guildId, userId, 'skill_tome')}**`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pet_skillreroll_${userId}`).setLabel('📖 Reroll Lagi').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`pet_info_${userId}`).setLabel('📋 Pet Info').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Pet Panel').setStyle(ButtonStyle.Secondary),
    );
    return interaction.update({ embeds: [embed], components: [row] });
}

module.exports = {
    BASE_DAILY_ENTRIES,
    MIN_PET_LEVEL,
    NIGHTMARE_SHOP,
    NIGHTMARE_MODIFIERS,
    buildNightmarePanel,
    buildNightmareSelect,
    buildNightmareShop,
    buildSkillRerollPanel,
    runNightmare,
    buyNightmareShop,
    doSkillReroll,
    getEntriesLeft,
    getMaxDailyEntries,
};
