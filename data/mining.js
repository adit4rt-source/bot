// data/mining.js — Mining system data (Phase 1 MVP)
// Pickaxe tiers, ore tiers, and mine depth layers.

// ==================== PICKAXE TIERS ====================
// staminaCost: stamina per swing | yieldBonus: max extra ore per dig | maxDepth: how deep you can descend (meters)
const PICKAXE_TYPES = [
    { id: 'wood',       name: 'Beliung Kayu',      emoji: '🪵', tier: 0, price: 0,      staminaCost: 5, yieldBonus: 0,  maxDepth: 50 },
    { id: 'stone',      name: 'Beliung Batu',      emoji: '⛏️', tier: 1, price: 2000,   staminaCost: 5, yieldBonus: 1,  maxDepth: 120 },
    { id: 'copper',     name: 'Beliung Tembaga',   emoji: '⛏️', tier: 2, price: 8000,   staminaCost: 4, yieldBonus: 2,  maxDepth: 250 },
    { id: 'iron',       name: 'Beliung Besi',      emoji: '⚒️', tier: 3, price: 25000,  staminaCost: 4, yieldBonus: 3,  maxDepth: 450 },
    { id: 'gold',       name: 'Beliung Emas',      emoji: '⚒️', tier: 4, price: 70000,  staminaCost: 3, yieldBonus: 5,  maxDepth: 700 },
    { id: 'mithril',    name: 'Bor Mithril',       emoji: '🛠️', tier: 5, price: 150000, staminaCost: 3, yieldBonus: 8,  maxDepth: 1000 },
    { id: 'adamantite', name: 'Bor Adamantite',    emoji: '🛠️', tier: 6, price: 400000, staminaCost: 2, yieldBonus: 12, maxDepth: 1500 },
];

// ==================== ORE TIERS ====================
// value: harga jual per unit | exp: mining exp saat digali
const ORE_TIERS = [
    { id: 'stone',        name: 'Batu',          emoji: '🪨', rarity: 'Trash',     value: 2,    exp: 1 },
    { id: 'copper',       name: 'Bijih Tembaga', emoji: '🟤', rarity: 'Common',    value: 15,   exp: 2 },
    { id: 'iron',         name: 'Bijih Besi',    emoji: '⚪', rarity: 'Uncommon',  value: 40,   exp: 4 },
    { id: 'gold',         name: 'Bijih Emas',    emoji: '🟡', rarity: 'Rare',      value: 120,  exp: 8 },
    { id: 'titanium',     name: 'Titanium',      emoji: '🔷', rarity: 'Epic',      value: 350,  exp: 15 },
    { id: 'mithril',      name: 'Mithril',       emoji: '🟣', rarity: 'Legendary', value: 900,  exp: 30 },
    { id: 'adamantite',   name: 'Adamantite',    emoji: '🌈', rarity: 'Mythic',    value: 2500, exp: 60 },
    { id: 'void_crystal', name: 'Void Crystal',  emoji: '💠', rarity: 'Secret',    value: 6000, exp: 120 },
];

// ==================== MINE LAYERS (depth zones) ====================
// reqTier: pickaxe tier minimum agar bisa turun ke layer ini
// ores: weighted pool (w = bobot kemunculan)
const MINE_LAYERS = [
    { id: 'surface', name: '🌱 Permukaan',   min: 0,    max: 50,    reqTier: 0,
      ores: [ { ore: 'stone', w: 40 }, { ore: 'copper', w: 45 }, { ore: 'iron', w: 15 } ] },
    { id: 'shallow', name: '🪨 Gua Dangkal', min: 50,   max: 200,   reqTier: 2,
      ores: [ { ore: 'stone', w: 20 }, { ore: 'copper', w: 30 }, { ore: 'iron', w: 35 }, { ore: 'gold', w: 15 } ] },
    { id: 'magma',   name: '🔥 Zona Magma',  min: 200,  max: 500,   reqTier: 4,
      ores: [ { ore: 'iron', w: 20 }, { ore: 'gold', w: 35 }, { ore: 'titanium', w: 35 }, { ore: 'mithril', w: 10 } ] },
    { id: 'frozen',  name: '❄️ Gua Beku',    min: 500,  max: 1000,  reqTier: 5,
      ores: [ { ore: 'gold', w: 12 }, { ore: 'titanium', w: 30 }, { ore: 'mithril', w: 38 }, { ore: 'adamantite', w: 20 } ] },
    { id: 'void',    name: '🌌 The Void',    min: 1000, max: 99999, reqTier: 6,
      ores: [ { ore: 'mithril', w: 22 }, { ore: 'adamantite', w: 48 }, { ore: 'void_crystal', w: 30 } ] },
];

const STAMINA_REGEN_MS = 60000;   // +1 stamina / menit
const STAMINA_BASE = 100;         // max = STAMINA_BASE + level * STAMINA_PER_LEVEL
const STAMINA_PER_LEVEL = 5;
const DESCEND_STEP = 25;          // meter per turun
const MAX_MINING_LEVEL = 100;

function getMiningExpNeeded(level) {
    return 60 + level * 30;
}

function getLayerForDepth(depth) {
    return MINE_LAYERS.find(l => depth >= l.min && depth < l.max) || MINE_LAYERS[0];
}

function getPickaxe(id) {
    return PICKAXE_TYPES.find(p => p.id === id) || PICKAXE_TYPES[0];
}

function getOreDef(id) {
    return ORE_TIERS.find(o => o.id === id) || ORE_TIERS[0];
}

module.exports = {
    PICKAXE_TYPES, ORE_TIERS, MINE_LAYERS,
    STAMINA_REGEN_MS, STAMINA_BASE, STAMINA_PER_LEVEL, DESCEND_STEP, MAX_MINING_LEVEL,
    getMiningExpNeeded, getLayerForDepth, getPickaxe, getOreDef,
};
