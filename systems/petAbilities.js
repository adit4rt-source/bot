// systems/petAbilities.js — Pet Abilities (Passive in World)
// Pets Lv.30+ unlock ability slots that provide passive benefits outside of battle.
// Abilities work automatically while pet is active, happy, and fed.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { db, getOrCreateUser, getUserStat, setUserStat, incrementUserStat, addIncome, addItem } = require('../database');
const { getRandomInt } = require('../utils');
const { getPetData, getAllPets } = require('./pets');
const { PET_DATA } = require('../data/pets');

// ==================== ABILITY DATA ====================
const PET_ABILITIES = {
    // TIER 1 (Lv.30)
    tier1: [
        { id: 'auto_fish', name: 'Auto-Fish', emoji: '🎣', tier: 1, level: 30,
          desc: 'Otomatis mancing 1-5 ikan setiap 7-10 menit',
          detail: 'Pet memancing otomatis. Ikan masuk inventory (max Epic tier). Jumlah scaling dengan pet level.' },
        { id: 'auto_water', name: 'Auto-Water', emoji: '💧', tier: 1, level: 30,
          desc: 'Otomatis siram tanaman yang hampir layu',
          detail: 'Cek setiap 5 menit. Siram plot yang wateredAt > 80% dryTime. Tanaman tidak akan mati.' },
        { id: 'passive_income', name: 'Passive Income', emoji: '🪙', tier: 1, level: 30,
          desc: '+100-5000 money per 30 menit (scaling pet level)',
          detail: 'Formula: 100 + (petLevel × 25). Credited setiap 30 menit. Max 5000/tick.' },
        { id: 'xp_passive', name: 'Passive XP', emoji: '✨', tier: 1, level: 30,
          desc: '+5-50 XP per 30 menit untuk player (AFK leveling)',
          detail: 'Formula: 5 + (petLevel × 0.2). Credited setiap 30 menit otomatis.' },
        { id: 'hunger_slow', name: 'Slow Hunger', emoji: '🍖', tier: 1, level: 30,
          desc: 'Pet hunger turun 50% lebih lambat',
          detail: 'Hunger decay rate dikurangi setengah. Pet bisa bertahan 2x lebih lama tanpa makan.' },
    ],
    // TIER 2 (Lv.50)
    tier2: [
        { id: 'market_bonus', name: 'Market Mastery', emoji: '🏪', tier: 2, level: 50,
          desc: '+15% harga jual di market/sell fish',
          detail: 'Semua penjualan (fish sell, market listing) mendapat +15% bonus harga.' },
        { id: 'daily_boost', name: 'Daily Fortune', emoji: '🎁', tier: 2, level: 50,
          desc: '/daily reward +30% money',
          detail: 'Setiap klaim /daily, reward money ditambah 30%. Stack dengan Daily Doubler.' },
        { id: 'streak_guard', name: 'Streak Guardian', emoji: '🛡️', tier: 2, level: 50,
          desc: 'Grace period streak +1 hari (total 2 hari boleh skip)',
          detail: 'Streak tidak putus walau skip 1 hari tambahan. Efektif 2 hari grace total.' },
        { id: 'quest_doubler', name: 'Quest Ace', emoji: '📜', tier: 2, level: 50,
          desc: '20% chance quest selesai otomatis saat generate',
          detail: 'Saat daily quest di-generate, 20% chance 1 quest langsung complete.' },
        { id: 'shop_discount', name: 'Bargain Hunter', emoji: '🏷️', tier: 2, level: 50,
          desc: '-15% harga semua pembelian di shop',
          detail: 'Semua pembelian di shop (item, rod, bait, pet food, egg) diskon 15%.' },
    ],
    // TIER 3 (Lv.100)
    tier3: [
        { id: 'double_fish', name: 'Double Catch', emoji: '🐟', tier: 3, level: 100,
          desc: '20% chance dapat 2 ikan sekaligus saat mancing',
          detail: 'Setiap kali mancing, 20% chance ikan di-duplicate (2 ikan sama masuk inventory).' },
        { id: 'instant_grow', name: 'Green Thumb', emoji: '🌱', tier: 3, level: 100,
          desc: '15% chance tanaman langsung matang saat tanam',
          detail: 'Saat menanam, 15% chance growTime = 0 (langsung bisa harvest).' },
        { id: 'relic_finder', name: 'Relic Hunter', emoji: '💎', tier: 3, level: 100,
          desc: '+15% chance dapat relic dari dungeon/boss',
          detail: 'Tambah 15% ke relic drop rate di semua dungeon dan boss battle.' },
        { id: 'crit_master', name: 'Crit Master', emoji: '⚡', tier: 3, level: 100,
          desc: '+10% crit rate permanent di semua battle',
          detail: 'Pet crit rate ditambah 10% di PvP, Dungeon, Boss, dan World Boss.' },
        { id: 'expedition_rush', name: 'Swift Explorer', emoji: '🚀', tier: 3, level: 100,
          desc: 'Expedition time -25%',
          detail: 'Semua expedition duration dikurangi 25%. 8 jam → 6 jam, 2 jam → 1.5 jam.' },
    ],
    // TIER 4 — ASCENDANT (Lv.150 + Awakening ★2+ for slot 4)
    tier4: [
        { id: 'boss_scavenger', name: 'Boss Scavenger', emoji: '🦴', tier: 4, level: 150,
          desc: '+10% quantity loot dari boss',
          detail: 'Semua drop item dari solo/party boss mendapat +10% quantity (min +1 jika qty≥1).' },
        { id: 'arena_veteran', name: 'Arena Veteran', emoji: '⚔️', tier: 4, level: 150,
          desc: '+5% AP arena & −10% cooldown fight',
          detail: 'Arena Points +5% per fight, cooldown antar fight dikurangi 10%.' },
        { id: 'egg_whisperer', name: 'Egg Whisperer', emoji: '🥚', tier: 4, level: 150,
          desc: '+2% peluang tier lebih tinggi saat buka egg',
          detail: 'Saat hatch egg, roll di-boost ~2% ke arah tier yang lebih tinggi (soft).' },
        { id: 'relic_polish', name: 'Relic Polish', emoji: '✨', tier: 4, level: 150,
          desc: '+8% success rate refine (terutama +10 ke atas)',
          detail: 'Semua refine mendapat +8% flat success rate (cap 100%).' },
        { id: 'nightmare_runner', name: 'Nightmare Runner', emoji: '🌑', tier: 4, level: 150,
          desc: '+1 entry Nightmare Dungeon per hari',
          detail: 'Daily Nightmare entry base 3 → 4. Stack tidak dengan item lain.' },
    ],
};

// Flatten for easy lookup
const ALL_ABILITIES = [...PET_ABILITIES.tier1, ...PET_ABILITIES.tier2, ...PET_ABILITIES.tier3, ...PET_ABILITIES.tier4];

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS pet_abilities (
    guildId TEXT,
    userId TEXT,
    slot1 TEXT DEFAULT NULL,
    slot2 TEXT DEFAULT NULL,
    slot3 TEXT DEFAULT NULL,
    slot4 TEXT DEFAULT NULL,
    lastSwap1 INTEGER DEFAULT 0,
    lastSwap2 INTEGER DEFAULT 0,
    lastSwap3 INTEGER DEFAULT 0,
    lastSwap4 INTEGER DEFAULT 0,
    PRIMARY KEY(guildId, userId)
)`);

// Migrate older DBs missing slot4 columns
try { db.exec('ALTER TABLE pet_abilities ADD COLUMN slot4 TEXT DEFAULT NULL'); } catch (_) {}
try { db.exec('ALTER TABLE pet_abilities ADD COLUMN lastSwap4 INTEGER DEFAULT 0'); } catch (_) {}

db.exec(`CREATE TABLE IF NOT EXISTS pet_ability_log (
    guildId TEXT,
    userId TEXT,
    abilityId TEXT,
    lastTick INTEGER DEFAULT 0,
    totalEarned INTEGER DEFAULT 0,
    PRIMARY KEY(guildId, userId, abilityId)
)`);

// ==================== HELPERS ====================
const SWAP_COOLDOWN = 24 * 60 * 60 * 1000; // 24 jam

function getAbilitySlots(guildId, userId) {
    let row = db.prepare('SELECT * FROM pet_abilities WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!row) {
        db.prepare('INSERT INTO pet_abilities (guildId, userId) VALUES (?, ?)').run(guildId, userId);
        row = { guildId, userId, slot1: null, slot2: null, slot3: null, slot4: null, lastSwap1: 0, lastSwap2: 0, lastSwap3: 0, lastSwap4: 0 };
    }
    if (row.slot4 === undefined) row.slot4 = null;
    if (row.lastSwap4 === undefined) row.lastSwap4 = 0;
    return row;
}

function getAbilityById(id) {
    return ALL_ABILITIES.find(a => a.id === id) || null;
}

function getAbilityLog(guildId, userId, abilityId) {
    let row = db.prepare('SELECT * FROM pet_ability_log WHERE guildId = ? AND userId = ? AND abilityId = ?').get(guildId, userId, abilityId);
    if (!row) row = { lastTick: 0, totalEarned: 0 };
    return row;
}

function updateAbilityLog(guildId, userId, abilityId, earned) {
    db.prepare(`INSERT OR REPLACE INTO pet_ability_log (guildId, userId, abilityId, lastTick, totalEarned) 
        VALUES (?, ?, ?, ?, COALESCE((SELECT totalEarned FROM pet_ability_log WHERE guildId = ? AND userId = ? AND abilityId = ?), 0) + ?)`
    ).run(guildId, userId, abilityId, Date.now(), guildId, userId, abilityId, earned);
}

function isPetEligibleForAbilities(pet) {
    return pet && pet.happiness >= 30 && pet.hunger >= 10 && pet.status !== 'sick';
}

function getAwakeningLevelForPet(pet) {
    if (!pet || !pet.id) return 0;
    try {
        const { getAwakeningData } = require('./awakening');
        return getAwakeningData(pet.id).awakeningLevel || 0;
    } catch (_) { return 0; }
}

/** Slot 4 requires Lv.150+ AND Awakening ≥ ★2 (Transcendent). */
function canUseSlot4(pet) {
    return pet && pet.level >= 150 && getAwakeningLevelForPet(pet) >= 2;
}

function getUnlockedSlots(petLevel, pet) {
    let slots = 0;
    if (petLevel >= 30) slots = 1;
    if (petLevel >= 50) slots = 2;
    if (petLevel >= 100) slots = 3;
    if (pet && canUseSlot4(pet)) slots = 4;
    else if (petLevel >= 150) slots = Math.max(slots, 3); // T4 abilities exist but need ★2 for slot
    return slots;
}

function getAvailableAbilities(petLevel, slotNum, pet) {
    if (slotNum === 1) return PET_ABILITIES.tier1.filter(a => petLevel >= a.level);
    if (slotNum === 2) return PET_ABILITIES.tier2.filter(a => petLevel >= a.level);
    if (slotNum === 3) return PET_ABILITIES.tier3.filter(a => petLevel >= a.level);
    if (slotNum === 4) {
        if (pet && !canUseSlot4(pet)) return [];
        return PET_ABILITIES.tier4.filter(a => petLevel >= a.level);
    }
    return [];
}

// ==================== CHECK IF ABILITY IS ACTIVE ====================
function hasAbility(guildId, userId, abilityId) {
    const pet = getPetData(guildId, userId);
    if (!pet || !isPetEligibleForAbilities(pet)) return false;
    const slots = getAbilitySlots(guildId, userId);
    return slots.slot1 === abilityId || slots.slot2 === abilityId || slots.slot3 === abilityId || slots.slot4 === abilityId;
}

// ==================== GET ACTIVE ABILITIES ====================
function getActiveAbilities(guildId, userId) {
    const pet = getPetData(guildId, userId);
    if (!pet || !isPetEligibleForAbilities(pet)) return [];
    const slots = getAbilitySlots(guildId, userId);
    const active = [];
    if (slots.slot1) { const a = getAbilityById(slots.slot1); if (a && pet.level >= a.level) active.push(a); }
    if (slots.slot2) { const a = getAbilityById(slots.slot2); if (a && pet.level >= a.level) active.push(a); }
    if (slots.slot3) { const a = getAbilityById(slots.slot3); if (a && pet.level >= a.level) active.push(a); }
    if (slots.slot4 && canUseSlot4(pet)) { const a = getAbilityById(slots.slot4); if (a && pet.level >= a.level) active.push(a); }
    return active;
}

// ==================== BACKGROUND TICK (called by reminder system) ====================
function runAbilityTick(client, guildId, userId) {
    const pet = getPetData(guildId, userId);
    if (!pet || !isPetEligibleForAbilities(pet)) return;

    const slots = getAbilitySlots(guildId, userId);
    const now = Date.now();
    const TICK_INTERVAL = 30 * 60 * 1000; // 30 menit

    // Process each active ability
    const activeSlots = [slots.slot1, slots.slot2, slots.slot3, slots.slot4].filter(Boolean);

    for (const abilityId of activeSlots) {
        const ability = getAbilityById(abilityId);
        if (!ability) continue;

        const log = getAbilityLog(guildId, userId, abilityId);
        if (now - log.lastTick < TICK_INTERVAL) continue; // Belum waktunya

        switch (abilityId) {
            case 'passive_income': {
                const income = Math.min(5000, 100 + (pet.level * 25));
                db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(income, guildId, userId);
                addIncome(guildId, userId, 'pet_ability', income);
                updateAbilityLog(guildId, userId, abilityId, income);
                break;
            }
            case 'xp_passive': {
                const xp = Math.min(50, Math.floor(5 + (pet.level * 0.2)));
                db.prepare('UPDATE users SET xp = xp + ? WHERE guildId = ? AND userId = ?').run(xp, guildId, userId);
                updateAbilityLog(guildId, userId, abilityId, xp);
                break;
            }
            case 'auto_fish': {
                // Mancing 1-5 ikan (scaling level), max Epic tier
                const fishCount = Math.min(5, 1 + Math.floor(pet.level / 40));
                const { FISH_DATA, FISH_TIERS } = require('../data/fish');
                const allowedTiers = ['Trash', 'Common', 'Uncommon', 'Rare', 'Epic'];
                
                for (let i = 0; i < fishCount; i++) {
                    // Simple random fish from allowed tiers
                    const tierRoll = Math.random() * 100;
                    let selectedTier;
                    if (tierRoll < 30) selectedTier = 'Common';
                    else if (tierRoll < 55) selectedTier = 'Uncommon';
                    else if (tierRoll < 80) selectedTier = 'Rare';
                    else if (tierRoll < 95) selectedTier = 'Epic';
                    else selectedTier = 'Common';
                    
                    const tierFish = FISH_DATA.filter(f => f.tier === selectedTier);
                    if (tierFish.length === 0) continue;
                    const fish = tierFish[Math.floor(Math.random() * tierFish.length)];
                    const tierData = FISH_TIERS.find(t => t.tier === selectedTier);
                    const weight = parseFloat((tierData.minWeight + Math.random() * (tierData.maxWeight - tierData.minWeight)).toFixed(2));
                    
                    db.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt) VALUES (?, ?, ?, ?, ?)').run(guildId, userId, fish.id, weight, Date.now());
                    incrementUserStat(guildId, userId, 'total_fish_caught');
                }
                updateAbilityLog(guildId, userId, abilityId, fishCount);
                break;
            }
            case 'auto_water': {
                // Siram tanaman yang hampir layu
                const { FARM_CROPS, FARM_FERTILIZERS } = require('../data/farming');
                const plots = db.prepare("SELECT * FROM farm_plots WHERE guildId = ? AND userId = ? AND status = 'growing'").all(guildId, userId);
                let watered = 0;
                
                for (const plot of plots) {
                    const crop = FARM_CROPS.find(c => c.id === plot.cropId);
                    if (!crop) continue;
                    const fert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer);
                    const speedBonus = fert ? (fert.speedBonus || 0) : 0;
                    const growTimeMs = crop.time * (1 - speedBonus) * 60 * 1000;
                    const dryThreshold = growTimeMs * 0.8;
                    const dryTime = now - (plot.wateredAt || plot.plantedAt);
                    
                    if (dryTime > dryThreshold) {
                        db.prepare('UPDATE farm_plots SET wateredAt = ? WHERE id = ?').run(now, plot.id);
                        watered++;
                    }
                }
                updateAbilityLog(guildId, userId, abilityId, watered);
                break;
            }
            // hunger_slow is passive (checked elsewhere), no tick needed
            default:
                updateAbilityLog(guildId, userId, abilityId, 0);
                break;
        }
    }
}

// ==================== BUILD: Abilities Panel ====================
function buildAbilitiesPanel(guildId, userId, username) {
    const pet = getPetData(guildId, userId);
    if (!pet) {
        const embed = new EmbedBuilder().setTitle('🧪 Pet Abilities').setColor('#9B59B6')
            .setDescription('❌ Kamu belum punya pet aktif!');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return { embeds: [embed], components: [row] };
    }

    const petDef = PET_DATA.find(p => p.id === pet.petId);
    const slots = getAbilitySlots(guildId, userId);
    const unlockedSlots = getUnlockedSlots(pet.level, pet);
    const eligible = isPetEligibleForAbilities(pet);
    const now = Date.now();
    const awakLvl = getAwakeningLevelForPet(pet);

    let desc = `${petDef ? petDef.emoji : '🐾'} **${pet.name}** (Lv.${pet.level}${awakLvl > 0 ? ` ★${awakLvl}` : ''})\n`;
    desc += `> Status: ${eligible ? '✅ Abilities AKTIF' : '❌ Abilities MATI (happiness/hunger rendah)'}\n\n`;
    desc += `\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n\n`;

    // Slot 1
    const s1 = slots.slot1 ? getAbilityById(slots.slot1) : null;
    const s1Swap = (now - (slots.lastSwap1 || 0)) < SWAP_COOLDOWN;
    if (pet.level >= 30) {
        desc += `**Slot 1** (Tier 1 — Lv.30) ${s1 ? '✅' : '⚪'}\n`;
        if (s1) {
            const log1 = getAbilityLog(guildId, userId, s1.id);
            desc += `> ${s1.emoji} **${s1.name}** — ${s1.desc}\n`;
            desc += `> 📊 Total earned: **${log1.totalEarned.toLocaleString('id-ID')}**\n`;
        } else {
            desc += `> *Belum dipasang* — Klik tombol untuk pilih\n`;
        }
    } else {
        desc += `**Slot 1** 🔒 Unlock di **Lv.30** (sekarang: Lv.${pet.level})\n`;
    }
    desc += `\n`;

    // Slot 2
    const s2 = slots.slot2 ? getAbilityById(slots.slot2) : null;
    const s2Swap = (now - (slots.lastSwap2 || 0)) < SWAP_COOLDOWN;
    if (pet.level >= 50) {
        desc += `**Slot 2** (Tier 2 — Lv.50) ${s2 ? '✅' : '⚪'}\n`;
        if (s2) {
            const log2 = getAbilityLog(guildId, userId, s2.id);
            desc += `> ${s2.emoji} **${s2.name}** — ${s2.desc}\n`;
            desc += `> 📊 Total earned: **${log2.totalEarned.toLocaleString('id-ID')}**\n`;
        } else {
            desc += `> *Belum dipasang* — Klik tombol untuk pilih\n`;
        }
    } else {
        desc += `**Slot 2** 🔒 Unlock di **Lv.50** (sekarang: Lv.${pet.level})\n`;
    }
    desc += `\n`;

    // Slot 3
    const s3 = slots.slot3 ? getAbilityById(slots.slot3) : null;
    const s3Swap = (now - (slots.lastSwap3 || 0)) < SWAP_COOLDOWN;
    if (pet.level >= 100) {
        desc += `**Slot 3** (Tier 3 — Lv.100) ${s3 ? '✅' : '⚪'}\n`;
        if (s3) {
            const log3 = getAbilityLog(guildId, userId, s3.id);
            desc += `> ${s3.emoji} **${s3.name}** — ${s3.desc}\n`;
            desc += `> 📊 Total earned: **${log3.totalEarned.toLocaleString('id-ID')}**\n`;
        } else {
            desc += `> *Belum dipasang* — Klik tombol untuk pilih\n`;
        }
    } else {
        desc += `**Slot 3** 🔒 Unlock di **Lv.100** (sekarang: Lv.${pet.level})\n`;
    }
    desc += `\n`;

    // Slot 4 (Ascendant)
    const s4 = slots.slot4 ? getAbilityById(slots.slot4) : null;
    const s4Swap = (now - (slots.lastSwap4 || 0)) < SWAP_COOLDOWN;
    const slot4Ok = canUseSlot4(pet);
    if (slot4Ok) {
        desc += `**Slot 4** (Tier 4 Ascendant — Lv.150 + ★2) ${s4 ? '✅' : '⚪'}\n`;
        if (s4) {
            const log4 = getAbilityLog(guildId, userId, s4.id);
            desc += `> ${s4.emoji} **${s4.name}** — ${s4.desc}\n`;
            desc += `> 📊 Total earned: **${log4.totalEarned.toLocaleString('id-ID')}**\n`;
        } else {
            desc += `> *Belum dipasang* — Klik tombol untuk pilih\n`;
        }
    } else if (pet.level >= 150) {
        desc += `**Slot 4** 🔒 Butuh **Awakening ★2+** (sekarang: ★${awakLvl})\n`;
    } else {
        desc += `**Slot 4** 🔒 Unlock di **Lv.150 + Awakening ★2** (sekarang: Lv.${pet.level})\n`;
    }

    desc += `\n\`━━━━━━━━━━━━━━━━━━━━━━━━\`\n`;
    desc += `> ⏱️ Swap cooldown: 24 jam per slot\n`;
    desc += `> 🌑 Tier 4 = endgame Ascendant abilities\n`;
    desc += `> 💡 Abilities aktif selama pet happy ≥30% & hunger ≥10%`;

    const embed = new EmbedBuilder()
        .setTitle(`🧪 PET ABILITIES — ${pet.name}`)
        .setColor(eligible ? '#9B59B6' : '#E74C3C')
        .setDescription(desc)
        .setFooter({ text: `Tick setiap 30 menit | Pet Level: ${pet.level} | Slots: ${unlockedSlots}/4` });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ability_set_1_${userId}`).setLabel(`${s1 ? '🔄' : '➕'} Slot 1`).setStyle(ButtonStyle.Primary).setDisabled(pet.level < 30 || s1Swap),
        new ButtonBuilder().setCustomId(`ability_set_2_${userId}`).setLabel(`${s2 ? '🔄' : '➕'} Slot 2`).setStyle(ButtonStyle.Primary).setDisabled(pet.level < 50 || s2Swap),
        new ButtonBuilder().setCustomId(`ability_set_3_${userId}`).setLabel(`${s3 ? '🔄' : '➕'} Slot 3`).setStyle(ButtonStyle.Primary).setDisabled(pet.level < 100 || s3Swap),
        new ButtonBuilder().setCustomId(`ability_set_4_${userId}`).setLabel(`${s4 ? '🔄' : '➕'} Slot 4`).setStyle(ButtonStyle.Danger).setDisabled(!slot4Ok || s4Swap),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row1, row2] };
}

// ==================== HANDLER: Ability Buttons ====================
async function handleAbilityButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    const action = parts[1]; // 'set' or 'main'

    // === MAIN PANEL ===
    if (action === 'main') {
        return interaction.update(buildAbilitiesPanel(guildId, userId, interaction.user.username));
    }

    // === SET SLOT (show ability select menu) ===
    if (action === 'set') {
        const slotNum = parseInt(parts[2]);
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });

        if (slotNum === 4 && !canUseSlot4(pet)) {
            return interaction.reply({ content: '❌ Slot 4 butuh **Lv.150+** dan **Awakening ★2+** (Transcendent)!', ephemeral: true });
        }
        const available = getAvailableAbilities(pet.level, slotNum, pet);
        if (available.length === 0) {
            return interaction.reply({ content: '❌ Tidak ada ability yang tersedia untuk slot ini!', ephemeral: true });
        }

        // Check cooldown
        const slots = getAbilitySlots(guildId, userId);
        const lastSwapKey = `lastSwap${slotNum}`;
        if (Date.now() - slots[lastSwapKey] < SWAP_COOLDOWN) {
            const remaining = Math.ceil((SWAP_COOLDOWN - (Date.now() - slots[lastSwapKey])) / 3600000);
            return interaction.reply({ content: `⏱️ Cooldown! Tunggu **${remaining} jam** lagi untuk ganti slot ${slotNum}.`, ephemeral: true });
        }

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`ability_select_${slotNum}_${userId}`)
            .setPlaceholder(`🧪 Pilih ability untuk Slot ${slotNum}...`)
            .setMinValues(1).setMaxValues(1);

        available.forEach(a => {
            menu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(a.name)
                .setValue(a.id)
                .setDescription(a.desc.substring(0, 100))
                .setEmoji(a.emoji));
        });

        const embed = new EmbedBuilder()
            .setTitle(`🧪 Pilih Ability — Slot ${slotNum}`)
            .setColor('#9B59B6')
            .setDescription(available.map(a => `> ${a.emoji} **${a.name}**\n> *${a.detail}*`).join('\n\n'));

        const row1 = new ActionRowBuilder().addComponents(menu);
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ability_main_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row1, row2] });
    }
}

// ==================== HANDLER: Ability Select Menu ====================
async function handleAbilitySelectMenu(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    // ability_select_SLOT_USERID
    const parts = customId.split('_');
    const slotNum = parseInt(parts[2]);
    const userId = parts[3];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu!', ephemeral: true });
    }

    const abilityId = interaction.values[0];
    const ability = getAbilityById(abilityId);
    if (!ability) return interaction.reply({ content: '❌ Ability tidak ditemukan!', ephemeral: true });

    const pet = getPetData(guildId, userId);
    if (!pet || pet.level < ability.level) {
        return interaction.reply({ content: `❌ Pet level kurang! Butuh Lv.${ability.level}+`, ephemeral: true });
    }

    // Set ability to slot
    const slotKey = `slot${slotNum}`;
    const swapKey = `lastSwap${slotNum}`;
    db.prepare(`UPDATE pet_abilities SET ${slotKey} = ?, ${swapKey} = ? WHERE guildId = ? AND userId = ?`).run(abilityId, Date.now(), guildId, userId);

    const embed = new EmbedBuilder()
        .setTitle('✅ Ability Dipasang!')
        .setColor('#2ECC71')
        .setDescription(
            `${ability.emoji} **${ability.name}** dipasang di **Slot ${slotNum}**!\n\n` +
            `> ${ability.detail}\n\n` +
            `⏱️ Cooldown swap: 24 jam\n` +
            `💡 Ability langsung aktif selama pet happy & kenyang.`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ability_main_${userId}`).setLabel('🧪 Abilities').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Pet Panel').setStyle(ButtonStyle.Secondary)
    );
    return interaction.update({ embeds: [embed], components: [row] });
}

// ==================== DETECTORS ====================
function isAbilityButton(customId) {
    return customId.startsWith('ability_') && !customId.startsWith('ability_select_');
}

function isAbilitySelectMenu(customId) {
    return customId.startsWith('ability_select_');
}

// ==================== EXPORTS ====================
module.exports = {
    PET_ABILITIES,
    ALL_ABILITIES,
    buildAbilitiesPanel,
    handleAbilityButton,
    handleAbilitySelectMenu,
    isAbilityButton,
    isAbilitySelectMenu,
    hasAbility,
    getActiveAbilities,
    runAbilityTick,
    isPetEligibleForAbilities,
    getAbilitySlots,
    getAbilityById,
    canUseSlot4,
    getUnlockedSlots,
};
