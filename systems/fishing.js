// systems/fishing.js — Catch logic (v3.1.0 Location-Based Overhaul)
// All locations accessible to all players. Rod determines luck penalty.
const { db } = require('../database');
const { FISH_DATA, FISH_TIERS, BAIT_TYPES, ROD_TYPES, FISHING_LOCATIONS } = require('../data/fish');

function getEquipment(guildId, userId) {
    let eq = db.prepare('SELECT * FROM fish_equipment WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!eq) { db.prepare('INSERT INTO fish_equipment (guildId, userId) VALUES (?, ?)').run(guildId, userId); eq = { rod: 'basic', bait: 'none', bait_count: 0, location: 'river' }; }
    if (!eq.location) eq.location = 'river';
    return eq;
}

function getPlayerLocation(guildId, userId) {
    const eq = getEquipment(guildId, userId);
    return FISHING_LOCATIONS.find(l => l.id === eq.location) || FISHING_LOCATIONS[0];
}

function setPlayerLocation(guildId, userId, locationId) {
    db.prepare('UPDATE fish_equipment SET location = ? WHERE guildId = ? AND userId = ?').run(locationId, guildId, userId);
}

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
    // Base rare bonus from rod + bait + location
    let rareBonus = rod.rareBonus + bait.rareBonus + location.bonusRare;

    // Rod penalty: if rod.tier < location.requiredRodTier, reduce rareBonus
    const rodDeficit = location.requiredRodTier - rod.tier;
    let luckPenaltyApplied = 0;
    if (rodDeficit > 0) {
        // Penalty scales with deficit: each tier below = location.luckPenalty * (deficit / requiredRodTier)
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
            if (!hasBait && rod.tier < 3) adj = Math.max(0.1, t.chance * 0.2); // very low without decent rod+bait
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
        else adj = t.chance + rareBonus * 0.5;
        return { ...t, chance: Math.max(0, adj) };
    });

    // Normalize
    const totalChance = adjustedTiers.reduce((s, t) => s + t.chance, 0);
    if (totalChance <= 0) {
        // Fallback: lowest allowed tier at 100%
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
    // Fallback: if somehow no fish for this tier+location (shouldn't happen), use any fish of that tier
    if (tierFish.length === 0) tierFish = FISH_DATA.filter(f => f.tier === selectedTier.tier);
    if (tierFish.length === 0) tierFish = FISH_DATA.filter(f => f.location === location.id);
    if (tierFish.length === 0) tierFish = [FISH_DATA[0]]; // absolute fallback

    const fish = tierFish[Math.floor(Math.random() * tierFish.length)];
    const weight = parseFloat((Math.random() * (selectedTier.maxWeight - selectedTier.minWeight) + selectedTier.minWeight).toFixed(2));
    const weightRatio = (weight - selectedTier.minWeight) / (selectedTier.maxWeight - selectedTier.minWeight || 1);
    const value = Math.floor(selectedTier.minValue + weightRatio * (selectedTier.maxValue - selectedTier.minValue));

    // Save to DB
    db.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt) VALUES (?, ?, ?, ?, ?)').run(guildId, userId, fish.id, weight, Date.now());
    db.prepare('INSERT OR IGNORE INTO fish_collection (guildId, userId, fishId) VALUES (?, ?, ?)').run(guildId, userId, fish.id);

    return { fish, tier: selectedTier, weight, value, location, luckPenalty: luckPenaltyApplied };
}

module.exports = { catchFish, getEquipment, getPlayerLocation, setPlayerLocation };
