// systems/fishing.js
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
    const rareBonus = rod.rareBonus + bait.rareBonus + location.bonusRare;

    if (eq.bait !== 'none' && eq.bait_count > 0) {
        const newCount = eq.bait_count - 1;
        if (newCount <= 0) db.prepare('UPDATE fish_equipment SET bait = ?, bait_count = 0 WHERE guildId = ? AND userId = ?').run('none', guildId, userId);
        else db.prepare('UPDATE fish_equipment SET bait_count = ? WHERE guildId = ? AND userId = ?').run(newCount, guildId, userId);
    }

    let roll = Math.random() * 100;
    let selectedTier = FISH_TIERS[0];
    const rodTier = ['basic', 'fiber', 'carbon', 'titanium', 'pro', 'enchanted', 'mythic_rod', 'celestial', 'divine_rod', 'void_rod'].indexOf(rod.id);
    const hasBait = eq.bait !== 'none' && eq.bait_count > 0;

    // Filter tiers by location
    const allowedTiers = location.tiers;

    let adjustedTiers = FISH_TIERS.map(t => {
        // If this tier is not allowed in the current location, set chance to 0
        if (!allowedTiers.includes(t.tier)) {
            return { ...t, chance: 0 };
        }

        let adj = t.chance;
        if (t.tier === 'Trash') adj = Math.max(2, t.chance - rareBonus);
        else if (t.tier === 'Common') adj = Math.max(8, t.chance - rareBonus * 0.5);
        else if (t.tier === 'Rare') adj = t.chance + rareBonus * 0.8;
        else if (t.tier === 'Epic') adj = t.chance + rareBonus * 0.6;
        else if (t.tier === 'Legendary') {
            if (rodTier < 1 || !hasBait) adj = 0;
            else adj = Math.min(6, t.chance + rareBonus * 0.3);
        }
        else if (t.tier === 'Mythic') {
            if (rodTier < 2 || !hasBait) adj = 0;
            else adj = Math.min(2.5, t.chance + rareBonus * 0.15);
        }
        else if (t.tier === 'Secret') {
            if (rodTier < 4 || !hasBait) adj = 0;
            else if (['cacing', 'jangkrik', 'udang', 'ikan_kecil', 'cumi'].includes(eq.bait)) adj = 0;
            else adj = Math.min(0.8, t.chance + rareBonus * 0.05);
        }
        else adj = t.chance + rareBonus * 0.5;
        return { ...t, chance: adj };
    });

    const totalChance = adjustedTiers.reduce((s, t) => s + t.chance, 0);
    if (totalChance <= 0) {
        // Fallback: if no valid tiers, use Common
        adjustedTiers = FISH_TIERS.map(t => ({ ...t, chance: t.tier === 'Common' ? 100 : 0 }));
    }
    const finalTotal = adjustedTiers.reduce((s, t) => s + t.chance, 0);
    let cumulative = 0;
    const normalized = adjustedTiers.map(t => { cumulative += (t.chance / finalTotal) * 100; return { ...t, cumChance: cumulative }; });
    for (const t of normalized) { if (roll <= t.cumChance) { selectedTier = t; break; } }

    // Filter fish by the selected tier AND location.
    // - Fish with no exclusiveLocation can appear anywhere their tier is allowed.
    // - Fish with an exclusiveLocation ONLY appear when fishing at that exact location.
    let tierFish = FISH_DATA.filter(f =>
        f.tier === selectedTier.tier &&
        (!f.exclusiveLocation || f.exclusiveLocation === location.id)
    );
    // Safety fallback: if filtering left nothing (shouldn't happen), use all fish of the tier.
    if (tierFish.length === 0) {
        tierFish = FISH_DATA.filter(f => f.tier === selectedTier.tier);
    }
    const fish = tierFish[Math.floor(Math.random() * tierFish.length)];
    const weight = parseFloat((Math.random() * (selectedTier.maxWeight - selectedTier.minWeight) + selectedTier.minWeight).toFixed(2));
    const weightRatio = (weight - selectedTier.minWeight) / (selectedTier.maxWeight - selectedTier.minWeight);
    const value = Math.floor(selectedTier.minValue + weightRatio * (selectedTier.maxValue - selectedTier.minValue));

    db.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt) VALUES (?, ?, ?, ?, ?)').run(guildId, userId, fish.id, weight, Date.now());
    db.prepare('INSERT OR IGNORE INTO fish_collection (guildId, userId, fishId) VALUES (?, ?, ?)').run(guildId, userId, fish.id);

    return { fish, tier: selectedTier, weight, value, location };
}

module.exports = { catchFish, getEquipment, getPlayerLocation, setPlayerLocation };
