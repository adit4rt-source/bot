// systems/fishing.js
const { db } = require('../database');
const { FISH_DATA, FISH_TIERS, BAIT_TYPES, ROD_TYPES } = require('../data/fish');

function getEquipment(guildId, userId) {
    let eq = db.prepare('SELECT * FROM fish_equipment WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!eq) { db.prepare('INSERT INTO fish_equipment (guildId, userId) VALUES (?, ?)').run(guildId, userId); eq = { rod: 'basic', bait: 'none', bait_count: 0 }; }
    return eq;
}

function catchFish(guildId, userId) {
    const eq = getEquipment(guildId, userId);
    const rod = ROD_TYPES.find(r => r.id === eq.rod) || ROD_TYPES[0];
    const bait = BAIT_TYPES.find(b => b.id === eq.bait) || BAIT_TYPES[0];
    const rareBonus = rod.rareBonus + bait.rareBonus;

    if (eq.bait !== 'none' && eq.bait_count > 0) {
        const newCount = eq.bait_count - 1;
        if (newCount <= 0) db.prepare('UPDATE fish_equipment SET bait = ?, bait_count = 0 WHERE guildId = ? AND userId = ?').run('none', guildId, userId);
        else db.prepare('UPDATE fish_equipment SET bait_count = ? WHERE guildId = ? AND userId = ?').run(newCount, guildId, userId);
    }

    let roll = Math.random() * 100;
    let selectedTier = FISH_TIERS[0];
    const rodTier = ['basic', 'fiber', 'carbon', 'titanium', 'pro', 'enchanted', 'mythic_rod', 'celestial', 'divine_rod', 'void_rod'].indexOf(rod.id);
    const hasBait = eq.bait !== 'none' && eq.bait_count > 0;

    let adjustedTiers = FISH_TIERS.map(t => {
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
    let cumulative = 0;
    const normalized = adjustedTiers.map(t => { cumulative += (t.chance / totalChance) * 100; return { ...t, cumChance: cumulative }; });
    for (const t of normalized) { if (roll <= t.cumChance) { selectedTier = t; break; } }

    const tierFish = FISH_DATA.filter(f => f.tier === selectedTier.tier);
    const fish = tierFish[Math.floor(Math.random() * tierFish.length)];
    const weight = parseFloat((Math.random() * (selectedTier.maxWeight - selectedTier.minWeight) + selectedTier.minWeight).toFixed(2));
    const weightRatio = (weight - selectedTier.minWeight) / (selectedTier.maxWeight - selectedTier.minWeight);
    const value = Math.floor(selectedTier.minValue + weightRatio * (selectedTier.maxValue - selectedTier.minValue));

    db.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt) VALUES (?, ?, ?, ?, ?)').run(guildId, userId, fish.id, weight, Date.now());
    db.prepare('INSERT OR IGNORE INTO fish_collection (guildId, userId, fishId) VALUES (?, ?, ?)').run(guildId, userId, fish.id);

    return { fish, tier: selectedTier, weight, value };
}

module.exports = { catchFish, getEquipment };
