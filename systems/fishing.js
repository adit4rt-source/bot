// systems/fishing.js — Catch logic (v3.2.0 — God Tier + Sea Monsters)
// All locations accessible to all players. Rod determines luck penalty.
const { db } = require('../database');
const { FISH_DATA, FISH_TIERS, BAIT_TYPES, ROD_TYPES, FISHING_LOCATIONS, ROD_UPGRADES, ROD_PART_DROP_CHANCE, SEA_MONSTERS } = require('../data/fish');

function getEquipment(guildId, userId) {
    let eq = db.prepare('SELECT * FROM fish_equipment WHERE userId = ?').get(userId);
    if (!eq) { db.prepare('INSERT INTO fish_equipment (userId) VALUES (?)').run(userId); eq = { rod: 'basic', bait: 'none', bait_count: 0, location: 'river' }; }
    if (!eq.location) eq.location = 'river';
    return eq;
}

function getPlayerLocation(guildId, userId) {
    const eq = getEquipment(guildId, userId);
    return FISHING_LOCATIONS.find(l => l.id === eq.location) || FISHING_LOCATIONS[0];
}

function setPlayerLocation(guildId, userId, locationId) {
    db.prepare('UPDATE fish_equipment SET location = ? WHERE userId = ?').run(locationId, userId);
}

function getOwnedRods(userId) {
    try {
        const rows = db.prepare('SELECT rodId FROM rod_inventory WHERE userId=?').all(userId);
        const ids = rows.map(r => r.rodId);
        if (!ids.includes('basic')) ids.unshift('basic'); // everyone owns basic
        return ids;
    } catch(_) { return ['basic']; }
}

function ownsRod(userId, rodId) {
    if (rodId === 'basic') return true;
    try {
        return !!db.prepare('SELECT 1 FROM rod_inventory WHERE userId=? AND rodId=?').get(userId, rodId);
    } catch(_) { return false; }
}

function addRodToInventory(userId, rodId) {
    try { db.prepare('INSERT OR IGNORE INTO rod_inventory (userId, rodId) VALUES (?, ?)').run(userId, rodId); } catch(_) {}
}

function equipRod(userId, rodId) {
    db.prepare('UPDATE fish_equipment SET rod=? WHERE userId=?').run(rodId, userId);
}

// ==================== MONSTER LOOT DROPS ====================
// Monsters have a chance to drop loot when encountered
const MONSTER_LOOT = [
    // Common drops (45%)
    { id: 'rod_part', name: 'Rod Parts', emoji: '🔧', chance: 20, qty: [1, 3] },
    { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', chance: 15, qty: [1, 2] },
    { id: 'mystery_box', name: 'Mystery Box', emoji: '📦', chance: 10, qty: [1, 1] },
    // Uncommon drops (30%)
    { id: 'monster_scale', name: 'Monster Scale', emoji: '🐉', chance: 12, qty: [1, 2] },
    { id: 'monster_fang', name: 'Monster Fang', emoji: '🦷', chance: 10, qty: [1, 1] },
    { id: 'lucky_charm', name: 'Lucky Charm', emoji: '🍀', chance: 8, qty: [1, 1] },
    // Rare drops (20%)
    { id: 'monster_heart', name: 'Monster Heart', emoji: '💜', chance: 8, qty: [1, 1] },
    { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', chance: 5, qty: [1, 1] },
    { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡', chance: 4, qty: [1, 1] },
    { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', chance: 3, qty: [1, 1] },
    // Ultra rare (5%)
    { id: 'omega_fragment', name: 'Omega Fragment', emoji: '🔱', chance: 2, qty: [1, 1] },
    { id: 'god_lure', name: 'God Lure', emoji: '👁️‍🗨️', chance: 1.5, qty: [1, 1] },
    { id: 'awakening_crystal', name: 'Awakening Crystal', emoji: '💫', chance: 0.5, qty: [1, 1] },
];

// Base 10% chance to get loot from monster, thunder_coating = guaranteed
function rollMonsterLoot(hasThunderCoating) {
    const lootChance = hasThunderCoating ? 1.0 : 0.10; // 100% with coating, 10% base
    if (Math.random() > lootChance) return null;

    const totalWeight = MONSTER_LOOT.reduce((s, l) => s + l.chance, 0);
    let roll = Math.random() * totalWeight;
    for (const loot of MONSTER_LOOT) {
        roll -= loot.chance;
        if (roll <= 0) {
            const qty = loot.qty[0] + Math.floor(Math.random() * (loot.qty[1] - loot.qty[0] + 1));
            return { ...loot, quantity: qty };
        }
    }
    return { ...MONSTER_LOOT[0], quantity: 1 };
}

// ==================== ANTI-MONSTER ITEM CHECKS ====================
/**
 * Check and consume anti-monster items. Returns action to take.
 * @returns {{ action: 'block'|'repel'|'thunder'|'none', itemUsed: string|null }}
 */
function checkAntiMonsterItems(guildId, userId) {
    const { getItemCount, removeItem, getUserStat, incrementUserStat, setUserStat } = require('../database');

    // 1. Shield Charm — block 1 attack completely
    const shieldCount = getItemCount(guildId, userId, 'shield_charm');
    if (shieldCount > 0) {
        removeItem(guildId, userId, 'shield_charm', 1);
        return { action: 'block', itemUsed: 'shield_charm' };
    }

    // 2. Thunder Coating — monster drops loot + flee (3 cast duration tracked via stat)
    const thunderCharges = getUserStat(guildId, userId, 'thunder_coating_charges');
    if (thunderCharges > 0) {
        setUserStat(guildId, userId, 'thunder_coating_charges', thunderCharges - 1);
        return { action: 'thunder', itemUsed: 'thunder_coating' };
    }

    // 3. Monster Repellent — already handled in rollSeaMonster chance reduction (5 cast stat)
    // No action here, it modifies the chance roll itself

    return { action: 'none', itemUsed: null };
}

/**
 * Get effective monster repellent status (reduces chance by 50%)
 */
function hasMonsterRepellent(guildId, userId) {
    const { getUserStat } = require('../database');
    const charges = getUserStat(guildId, userId, 'monster_repellent_charges');
    return charges > 0;
}

/**
 * Consume 1 charge of monster repellent
 */
function consumeRepellentCharge(guildId, userId) {
    const { getUserStat, setUserStat } = require('../database');
    const charges = getUserStat(guildId, userId, 'monster_repellent_charges');
    if (charges > 0) setUserStat(guildId, userId, 'monster_repellent_charges', charges - 1);
}

// ==================== FISHING WEATHER EVENTS ====================
// Random weather events for advanced locations (celestial_ocean, primordial_depths, god_realm)
// Changes every 2 hours. Affects monster chance and fish value.
const FISHING_WEATHER = [
    { id: 'calm', name: 'Calm Waters', emoji: '🌊', color: '#3498DB', chance: 25,
      effects: { monsterMult: 0.5, valueMult: 0.8, rareMult: 0.8 },
      desc: 'Perairan tenang — monster -50% tapi ikan langka juga -20%' },
    { id: 'normal', name: 'Normal', emoji: '🌤️', color: '#95A5A6', chance: 30,
      effects: { monsterMult: 1.0, valueMult: 1.0, rareMult: 1.0 },
      desc: 'Kondisi normal — tidak ada bonus atau penalty' },
    { id: 'storm', name: 'Storm Surge', emoji: '⛈️', color: '#9B59B6', chance: 18,
      effects: { monsterMult: 2.0, valueMult: 2.0, rareMult: 1.5 },
      desc: 'BADAI! Monster 2x tapi fish value juga 2x + rare +50%!' },
    { id: 'blood_moon', name: 'Blood Moon', emoji: '🌑🩸', color: '#E74C3C', chance: 8,
      effects: { monsterMult: 2.5, valueMult: 3.0, rareMult: 2.0 },
      desc: 'BLOOD MOON! Monster ganas 2.5x tapi reward 3x + rare 2x!!' },
    { id: 'divine_blessing', name: 'Divine Blessing', emoji: '✨🙏', color: '#FFD700', chance: 5,
      effects: { monsterMult: 0.0, valueMult: 1.5, rareMult: 1.3 },
      desc: 'BERKAH DEWA! Monster 0% + value +50% + rare +30%! (sangat langka)' },
    { id: 'void_tide', name: 'Void Tide', emoji: '🌀🕳️', color: '#2C2F33', chance: 10,
      effects: { monsterMult: 1.5, valueMult: 1.0, rareMult: 2.5 },
      desc: 'Void Tide — monster +50% tapi God tier chance 2.5x!!' },
    { id: 'aurora', name: 'Aurora Borealis', emoji: '🌌💜', color: '#8B00FF', chance: 4,
      effects: { monsterMult: 0.3, valueMult: 2.0, rareMult: 1.8 },
      desc: 'AURORA! Monster hampir hilang + value 2x + rare +80%! (sangat langka)' },
];

db.exec(`CREATE TABLE IF NOT EXISTS fishing_weather (
    id INTEGER PRIMARY KEY DEFAULT 1,
    weatherId TEXT DEFAULT 'normal',
    changedAt INTEGER DEFAULT 0
)`);

// Initialize if empty
try {
    const row = db.prepare('SELECT * FROM fishing_weather WHERE id = 1').get();
    if (!row) db.prepare('INSERT INTO fishing_weather (id, weatherId, changedAt) VALUES (1, ?, ?)').run('normal', Date.now());
} catch (e) { /* ignore */ }

/**
 * Get current fishing weather. Auto-rotates every 2 hours.
 */
function getFishingWeather() {
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    let row = db.prepare('SELECT * FROM fishing_weather WHERE id = 1').get();

    if (!row || (Date.now() - row.changedAt) >= TWO_HOURS) {
        // Time to change weather!
        const newWeather = rollFishingWeather();
        const now = Date.now();
        db.prepare('INSERT OR REPLACE INTO fishing_weather (id, weatherId, changedAt) VALUES (1, ?, ?)').run(newWeather.id, now);
        return { weather: newWeather, changedAt: now, nextChange: now + TWO_HOURS };
    }

    const weather = FISHING_WEATHER.find(w => w.id === row.weatherId) || FISHING_WEATHER[1];
    return { weather, changedAt: row.changedAt, nextChange: row.changedAt + TWO_HOURS };
}

function rollFishingWeather() {
    const totalWeight = FISHING_WEATHER.reduce((s, w) => s + w.chance, 0);
    let roll = Math.random() * totalWeight;
    for (const w of FISHING_WEATHER) {
        roll -= w.chance;
        if (roll <= 0) return w;
    }
    return FISHING_WEATHER[1]; // fallback: normal
}

/**
 * Roll for sea monster encounter at the current location
 * @returns {object|null} monster encounter result or null (safe cast)
 */
function rollSeaMonster(guildId, userId, location, rod) {
    if (!location.monsterChance || location.monsterChance <= 0) return null;

    // Rod tier reduces monster chance: each tier above requirement = -3% monster chance
    const rodBonus = Math.max(0, rod.tier - location.requiredRodTier);
    let effectiveChance = Math.max(5, location.monsterChance - (rodBonus * 3));

    // Apply fishing weather multiplier to monster chance
    const { weather } = getFishingWeather();
    effectiveChance = Math.max(0, effectiveChance * weather.effects.monsterMult);

    // Apply daily global weather multiplier
    try {
        const { getTodayWeather } = require('./farmWeather');
        const dailyWeather = getTodayWeather();
        if (dailyWeather && dailyWeather.id === 'stormy') {
            effectiveChance *= 2.0; // 2x monster rate on stormy days
        }
    } catch (e) {}

    // Monster Repellent: -50% chance
    if (hasMonsterRepellent(guildId, userId)) {
        effectiveChance = Math.max(2, effectiveChance * 0.5);
        consumeRepellentCharge(guildId, userId);
    }

    if (effectiveChance <= 0 || Math.random() * 100 >= effectiveChance) return null;

    // Monster triggered! Check anti-monster items first
    const antiResult = checkAntiMonsterItems(guildId, userId);

    // Pick a random monster for this location
    const locationMonsters = SEA_MONSTERS.filter(m => m.location === location.id);
    if (locationMonsters.length === 0) return null;

    // Weighted roll by individual monster chance
    const totalWeight = locationMonsters.reduce((s, m) => s + m.chance, 0);
    let roll = Math.random() * totalWeight;
    let monster = locationMonsters[0];
    for (const m of locationMonsters) {
        roll -= m.chance;
        if (roll <= 0) { monster = m; break; }
    }

    // Shield Charm: block completely
    if (antiResult.action === 'block') {
        return { monster, damageResult: { type: 'blocked', amount: 0, detail: '🛡️✨ Shield Charm melindungimu!' }, blocked: true, loot: null };
    }

    // Thunder Coating: monster flees + drops loot
    if (antiResult.action === 'thunder') {
        const loot = rollMonsterLoot(true); // guaranteed loot
        const { addItem } = require('../database');
        if (loot) addItem(guildId, userId, loot.id, loot.quantity);
        return { monster, damageResult: { type: 'thunder', amount: 0, detail: '⚡ Thunder Coating! Monster kabur + DROP loot!' }, blocked: true, loot };
    }

    // Normal encounter — apply damage
    const eq = getEquipment(guildId, userId);
    let damageResult = { type: monster.damage, amount: 0, detail: '' };

    switch (monster.damage) {
        case 'bait':
            // Lose 1 bait
            if (eq.bait !== 'none' && eq.bait_count > 0) {
                const newCount = eq.bait_count - 1;
                if (newCount <= 0) db.prepare('UPDATE fish_equipment SET bait = ?, bait_count = 0 WHERE guildId = ? AND userId = ?').run('none', guildId, userId);
                else db.prepare('UPDATE fish_equipment SET bait_count = ? WHERE guildId = ? AND userId = ?').run(newCount, guildId, userId);
                damageResult.amount = 1;
                damageResult.detail = 'Umpan -1';
            } else {
                damageResult.detail = 'Tidak ada umpan untuk diambil';
            }
            break;

        case 'bait_all':
            // Lose 5 bait
            if (eq.bait !== 'none' && eq.bait_count > 0) {
                const loss = Math.min(5, eq.bait_count);
                const newCount = eq.bait_count - loss;
                if (newCount <= 0) db.prepare('UPDATE fish_equipment SET bait = ?, bait_count = 0 WHERE guildId = ? AND userId = ?').run('none', guildId, userId);
                else db.prepare('UPDATE fish_equipment SET bait_count = ? WHERE guildId = ? AND userId = ?').run(newCount, guildId, userId);
                damageResult.amount = loss;
                damageResult.detail = `Umpan -${loss}`;
            } else {
                damageResult.detail = 'Tidak ada umpan untuk dihancurkan';
            }
            break;

        case 'rod_break':
            // Lose rod_part items (1-5 depending on monster)
            const partLoss = monster.id === 'omega_beast' ? 5 : monster.id === 'god_guardian' ? 3 : monster.id === 'death_leviathan' || monster.id === 'apocalypse_serpent' ? 2 : 1;
            const { getItemCount, removeItem } = require('../database');
            const currentParts = getItemCount(guildId, userId, 'rod_part');
            const actualLoss = Math.min(partLoss, currentParts);
            if (actualLoss > 0) removeItem(guildId, userId, 'rod_part', actualLoss);
            damageResult.amount = actualLoss;
            damageResult.detail = actualLoss > 0 ? `Rod Part -${actualLoss}` : 'Tidak ada Rod Part untuk dirusak';
            break;

        case 'money':
            // Lose money (varies by monster)
            const moneyLossMap = { 'judgement_whale': 15000, 'reality_destroyer': 10000, 'dimensional_rift': 8000, 'phantom_angler': 7000, 'soul_eater': 5000, 'nebula_squid': 3000 };
            const moneyLoss = moneyLossMap[monster.id] || 5000;
            const { getOrCreateUser } = require('../database');
            const user = getOrCreateUser(guildId, userId);
            const actualMoneyLoss = Math.min(moneyLoss, user.balance);
            if (actualMoneyLoss > 0) {
                db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(actualMoneyLoss, guildId, userId);
            }
            damageResult.amount = actualMoneyLoss;
            damageResult.detail = actualMoneyLoss > 0 ? `Money -${actualMoneyLoss.toLocaleString('id-ID')}` : 'Tidak ada money untuk dicuri';
            break;

        case 'cooldown':
            // Extra cooldown penalty (handled by caller)
            const cdPenalty = monster.id === 'time_devourer' ? 30 : monster.id === 'gravity_worm' ? 25 : 20;
            damageResult.amount = cdPenalty;
            damageResult.detail = `Cooldown +${cdPenalty} detik`;
            break;
    }

    // Roll for monster loot (10% base chance)
    const loot = rollMonsterLoot(false);
    if (loot) {
        const { addItem: addLootItem } = require('../database');
        addLootItem(guildId, userId, loot.id, loot.quantity);
    }

    return { monster, damageResult, blocked: false, loot };
}

// ==================== MAIN CATCH FUNCTION ====================
function catchFish(guildId, userId) {
    const eq = getEquipment(guildId, userId);
    const rod = ROD_TYPES.find(r => r.id === eq.rod) || ROD_TYPES[0];
    const bait = BAIT_TYPES.find(b => b.id === eq.bait) || BAIT_TYPES[0];
    const location = FISHING_LOCATIONS.find(l => l.id === (eq.location || 'river')) || FISHING_LOCATIONS[0];

    // Consume bait
    if (eq.bait !== 'none' && eq.bait_count > 0) {
        const newCount = eq.bait_count - 1;
        if (newCount <= 0) db.prepare('UPDATE fish_equipment SET bait = ?, bait_count = 0 WHERE guildId = ? AND userId = ?').run('none', guildId, userId);
        else db.prepare('UPDATE fish_equipment SET bait_count = ? WHERE guildId = ? AND userId = ?').run(newCount, guildId, userId);
    }

    // === LUCK CALCULATION ===
    let rareBonus = rod.rareBonus + bait.rareBonus + location.bonusRare;

    // Rare Fish Luck Buff (+15%)
    try {
        const { getUserStat } = require('../database');
        const luckBuffUntil = getUserStat(guildId, userId, 'fishing_luck_buff_until') || 0;
        if (Date.now() < luckBuffUntil) {
            rareBonus += 15;
        }
    } catch (e) {}

    // Rod penalty
    const rodDeficit = location.requiredRodTier - rod.tier;
    let luckPenaltyApplied = 0;
    if (rodDeficit > 0) {
        luckPenaltyApplied = Math.min(location.luckPenalty, location.luckPenalty * (rodDeficit / Math.max(1, location.requiredRodTier)));
        rareBonus = Math.max(0, rareBonus - luckPenaltyApplied);
    }

    const hasBait = eq.bait !== 'none' && eq.bait_count > 0;

    // Apply fishing weather rare multiplier (only for advanced locations)
    if (location.monsterChance && location.monsterChance > 0) {
        const weatherData = getFishingWeather();
        rareBonus = Math.floor(rareBonus * weatherData.weather.effects.rareMult);
    }

    // === TIER SELECTION ===
    const allowedTiers = location.tiers;
    let adjustedTiers = FISH_TIERS.map(t => {
        if (!allowedTiers.includes(t.tier)) return { ...t, chance: 0 };

        let adj = t.chance;
        if (t.tier === 'Trash') adj = Math.max(2, t.chance - rareBonus);
        else if (t.tier === 'Common') adj = Math.max(5, t.chance - rareBonus * 0.4);
        else if (t.tier === 'Uncommon') adj = t.chance + rareBonus * 0.5;
        else if (t.tier === 'Rare') adj = t.chance + rareBonus * 0.8;
        else if (t.tier === 'Epic') adj = t.chance + rareBonus * 0.6;
        else if (t.tier === 'Legendary') {
            if (!hasBait && rod.tier < 3) adj = Math.max(0.1, t.chance * 0.2);
            else adj = Math.min(6, t.chance + rareBonus * 0.3);
        }
        else if (t.tier === 'Mythic') {
            if (!hasBait || rod.tier < 5) adj = Math.max(0.05, t.chance * 0.1);
            else adj = Math.min(2.5, t.chance + rareBonus * 0.15);
        }
        else if (t.tier === 'Secret') {
            if (!hasBait || rod.tier < 6) adj = 0;
            else adj = Math.min(0.8, t.chance + rareBonus * 0.05);
        }
        else if (t.tier === 'God') {
            // God tier: requires rod tier 10+ AND high-tier bait
            if (!hasBait || rod.tier < 10) adj = 0;
            else adj = Math.min(0.3, t.chance + rareBonus * 0.02);
        }
        else adj = t.chance + rareBonus * 0.5;
        return { ...t, chance: Math.max(0, adj) };
    });

    // Normalize
    const totalChance = adjustedTiers.reduce((s, t) => s + t.chance, 0);
    if (totalChance <= 0) {
        const fallbackTier = allowedTiers[0] || 'Common';
        adjustedTiers = FISH_TIERS.map(t => ({ ...t, chance: t.tier === fallbackTier ? 100 : 0 }));
    }
    const finalTotal = adjustedTiers.reduce((s, t) => s + t.chance, 0);
    let cumulative = 0;
    const normalized = adjustedTiers.map(t => { cumulative += (t.chance / finalTotal) * 100; return { ...t, cumChance: cumulative }; });

    const roll = Math.random() * 100;
    let selectedTier = normalized[0];
    for (const t of normalized) { if (roll <= t.cumChance) { selectedTier = t; break; } }

    // === FISH SELECTION (location-specific) ===
    let tierFish = FISH_DATA.filter(f => f.tier === selectedTier.tier && f.location === location.id);
    if (tierFish.length === 0) tierFish = FISH_DATA.filter(f => f.tier === selectedTier.tier);
    if (tierFish.length === 0) tierFish = FISH_DATA.filter(f => f.location === location.id);
    if (tierFish.length === 0) tierFish = [FISH_DATA[0]];

    const fish = tierFish[Math.floor(Math.random() * tierFish.length)];
    const weight = parseFloat((Math.random() * (selectedTier.maxWeight - selectedTier.minWeight) + selectedTier.minWeight).toFixed(2));
    const weightRatio = (weight - selectedTier.minWeight) / (selectedTier.maxWeight - selectedTier.minWeight || 1);
    let value = Math.floor(selectedTier.minValue + weightRatio * (selectedTier.maxValue - selectedTier.minValue));

    // Apply fishing weather value multiplier (only for advanced locations)
    let activeWeather = null;
    if (location.monsterChance && location.monsterChance > 0) {
        const weatherData = getFishingWeather();
        activeWeather = weatherData.weather;
        value = Math.floor(value * activeWeather.effects.valueMult);
    }

    // Save to DB
    db.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt) VALUES (?, ?, ?, ?, ?)').run(guildId, userId, fish.id, weight, Date.now());
    // Persistent pokedex: register discovery (never deleted on sell)
    db.prepare('INSERT OR IGNORE INTO fish_collection (guildId, userId, fishId, caughtAt, catch_count, heaviest_weight) VALUES (?, ?, ?, ?, 0, 0)').run(guildId, userId, fish.id, Date.now());
    db.prepare('UPDATE fish_collection SET catch_count = catch_count + 1, heaviest_weight = MAX(heaviest_weight, ?) WHERE guildId = ? AND userId = ? AND fishId = ?').run(weight, guildId, userId, fish.id);

    // Rod Part drop chance (8% base)
    let droppedPart = false;
    if (Math.random() * 100 < ROD_PART_DROP_CHANCE) {
        const { addItem } = require('../database');
        addItem(guildId, userId, 'rod_part', 1);
        droppedPart = true;
    }

    return { fish, tier: selectedTier, weight, value, location, luckPenalty: luckPenaltyApplied, droppedPart, activeWeather };
}

function getFishingCooldown(userId, rod) {
    try {
        const { getTodayWeather } = require('./farmWeather');
        const todayWeather = getTodayWeather();
        let cooldown = rod.cooldown;
        if (todayWeather && (todayWeather.id === 'rainy' || todayWeather.id === 'stormy')) {
            cooldown = Math.max(1, Math.round(cooldown * 0.85)); // 15% reduction
        }
        // Fishing Cooldown Buff (-3s)
        const { getUserStat, checkGlobalMode } = require('../database');
        let guildId = null;
        if (!checkGlobalMode()) {
            const userRow = db.prepare('SELECT guildId FROM users WHERE userId = ? LIMIT 1').get(userId);
            if (userRow) guildId = userRow.guildId;
        }
        const cdBuffUntil = getUserStat(guildId, userId, 'fishing_cd_buff_until') || 0;
        if (Date.now() < cdBuffUntil) {
            cooldown = Math.max(1, cooldown - 3);
        }
        return cooldown;
    } catch (e) {
        return rod.cooldown;
    }
}

module.exports = { catchFish, getEquipment, getPlayerLocation, setPlayerLocation, getOwnedRods, ownsRod, addRodToInventory, equipRod, rollSeaMonster, MONSTER_LOOT, hasMonsterRepellent, getFishingWeather, FISHING_WEATHER, getFishingCooldown };
