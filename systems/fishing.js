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

// ==================== SEA MONSTER ENCOUNTER ====================
/**
 * Roll for sea monster encounter at the current location
 * @returns {object|null} monster encounter result or null (safe cast)
 */
function rollSeaMonster(guildId, userId, location, rod) {
    if (!location.monsterChance || location.monsterChance <= 0) return null;

    // Rod tier reduces monster chance: each tier above requirement = -3% monster chance
    const rodBonus = Math.max(0, rod.tier - location.requiredRodTier);
    const effectiveChance = Math.max(5, location.monsterChance - (rodBonus * 3));

    if (Math.random() * 100 >= effectiveChance) return null;

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

    // Apply damage
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

    return { monster, damageResult };
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

    // Rod penalty
    const rodDeficit = location.requiredRodTier - rod.tier;
    let luckPenaltyApplied = 0;
    if (rodDeficit > 0) {
        luckPenaltyApplied = Math.min(location.luckPenalty, location.luckPenalty * (rodDeficit / Math.max(1, location.requiredRodTier)));
        rareBonus = Math.max(0, rareBonus - luckPenaltyApplied);
    }

    const hasBait = eq.bait !== 'none' && eq.bait_count > 0;

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
    const value = Math.floor(selectedTier.minValue + weightRatio * (selectedTier.maxValue - selectedTier.minValue));

    // Save to DB
    db.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt) VALUES (?, ?, ?, ?, ?)').run(guildId, userId, fish.id, weight, Date.now());
    db.prepare('INSERT OR IGNORE INTO fish_collection (guildId, userId, fishId) VALUES (?, ?, ?)').run(guildId, userId, fish.id);

    // Rod Part drop chance (8% base)
    let droppedPart = false;
    if (Math.random() * 100 < ROD_PART_DROP_CHANCE) {
        const { addItem } = require('../database');
        addItem(guildId, userId, 'rod_part', 1);
        droppedPart = true;
    }

    return { fish, tier: selectedTier, weight, value, location, luckPenalty: luckPenaltyApplied, droppedPart };
}

module.exports = { catchFish, getEquipment, getPlayerLocation, setPlayerLocation, rollSeaMonster };
