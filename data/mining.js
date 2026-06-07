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
    { id: 'legendary_drill', name: 'Legendary Drill', emoji: '🌀', tier: 7, price: 0, staminaCost: 1, yieldBonus: 20, maxDepth: 99999, craftOnly: true },
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
// reqTier: pickaxe tier minimum | hazard: peluang bahaya per swing | mElement: elemen monster
const MINE_LAYERS = [
    { id: 'surface', name: '🌱 Permukaan',   min: 0,    max: 50,    reqTier: 0, hazard: 0,    mElement: 'nature',
      ores: [ { ore: 'stone', w: 40 }, { ore: 'copper', w: 45 }, { ore: 'iron', w: 15 } ] },
    { id: 'shallow', name: '🪨 Gua Dangkal', min: 50,   max: 200,   reqTier: 2, hazard: 0.06, mElement: 'nature',
      ores: [ { ore: 'stone', w: 20 }, { ore: 'copper', w: 30 }, { ore: 'iron', w: 35 }, { ore: 'gold', w: 15 } ] },
    { id: 'magma',   name: '🔥 Zona Magma',  min: 200,  max: 500,   reqTier: 4, hazard: 0.14, mElement: 'fire',
      ores: [ { ore: 'iron', w: 20 }, { ore: 'gold', w: 35 }, { ore: 'titanium', w: 35 }, { ore: 'mithril', w: 10 } ] },
    { id: 'frozen',  name: '❄️ Gua Beku',    min: 500,  max: 1000,  reqTier: 5, hazard: 0.20, mElement: 'water',
      ores: [ { ore: 'gold', w: 12 }, { ore: 'titanium', w: 30 }, { ore: 'mithril', w: 38 }, { ore: 'adamantite', w: 20 } ] },
    { id: 'void',    name: '🌌 The Void',    min: 1000, max: 99999, reqTier: 6, hazard: 0.28, mElement: 'dark',
      ores: [ { ore: 'mithril', w: 22 }, { ore: 'adamantite', w: 48 }, { ore: 'void_crystal', w: 30 } ] },
];

// ==================== SUPPLIES (safety gear, anti-hazard) ====================
const SUPPLIES = [
    { id: 'beam',    name: 'Penyangga',  emoji: '🪵', price: 200, desc: 'Cegah cave-in (sekali pakai)' },
    { id: 'gasmask', name: 'Masker Gas', emoji: '😷', price: 300, desc: 'Cegah gas beracun (sekali pakai)' },
];

// Bobot jenis hazard saat bahaya terpicu
const HAZARD_WEIGHTS = { cavein: 35, gas: 30, monster: 35 };

// Stats monster bawah tanah, skala dengan kedalaman
function getMonsterStats(depth) {
    return {
        hp: Math.floor(80 + depth * 1.4),
        atk: Math.floor(10 + depth * 0.06),
        def: Math.floor(depth * 0.02),
    };
}

// ==================== BARS (hasil smelting) ====================
const BARS = [
    { id: 'bar_copper',     name: 'Batangan Tembaga',    emoji: '🟫', value: 60 },
    { id: 'bar_iron',       name: 'Batangan Besi',       emoji: '⬜', value: 150 },
    { id: 'bar_gold',       name: 'Batangan Emas',       emoji: '🟨', value: 450 },
    { id: 'bar_titanium',   name: 'Batangan Titanium',   emoji: '🟦', value: 1200 },
    { id: 'bar_mithril',    name: 'Batangan Mithril',    emoji: '🟪', value: 3000 },
    { id: 'bar_adamantite', name: 'Batangan Adamantite', emoji: '🟥', value: 8000 },
];

// ==================== SMELTING (ore + fuel -> bar) ====================
const FUEL_ORE = 'stone'; // Batu jadi bahan bakar tungku
const SMELT_RECIPES = [
    { bar: 'bar_copper',     ore: 'copper',     oreQty: 3, fuel: 2, exp: 5 },
    { bar: 'bar_iron',       ore: 'iron',       oreQty: 3, fuel: 3, exp: 10 },
    { bar: 'bar_gold',       ore: 'gold',       oreQty: 3, fuel: 4, exp: 18 },
    { bar: 'bar_titanium',   ore: 'titanium',   oreQty: 4, fuel: 5, exp: 30 },
    { bar: 'bar_mithril',    ore: 'mithril',    oreQty: 4, fuel: 6, exp: 50 },
    { bar: 'bar_adamantite', ore: 'adamantite', oreQty: 5, fuel: 8, exp: 90 },
];

// ==================== SMITHING (bars -> item berguna) ====================
// out: 'item' (default, ke inventory) | 'mine' (ke kantong tambang, mis. perlengkapan)
// cat: kategori untuk tampilan panel
const SMITH_RECIPES = [
    // -- Material (Pet & Fishing) --
    { id: 'refine_stone',     name: 'Refine Stone',     emoji: '🪨', cat: 'Material', inputs: [{ mat: 'bar_copper', qty: 2 }], exp: 15, desc: 'Upgrade relic pet' },
    { id: 'rod_part',         name: 'Rod Parts',        emoji: '🔧', cat: 'Material', inputs: [{ mat: 'bar_iron', qty: 2 }], exp: 25, desc: 'Upgrade joran mancing' },
    { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', cat: 'Material', inputs: [{ mat: 'bar_gold', qty: 2 }, { mat: 'bar_titanium', qty: 1 }], exp: 50, desc: 'Cegah relic turun saat refine' },
    { id: 'mythic_fragment',  name: 'Mythic Fragment',  emoji: '🌟', cat: 'Material', inputs: [{ mat: 'bar_mithril', qty: 3 }, { mat: 'bar_adamantite', qty: 1 }], exp: 120, desc: 'Material langka Awakening pet' },
    // -- Perlengkapan Tambang (anti-hazard, ke kantong tambang) --
    { id: 'beam',    name: 'Penyangga',  emoji: '🪵', cat: 'Perlengkapan', out: 'mine', inputs: [{ mat: 'bar_iron', qty: 1 }], exp: 8, desc: 'Cegah cave-in (sekali pakai)' },
    { id: 'gasmask', name: 'Masker Gas', emoji: '😷', cat: 'Perlengkapan', out: 'mine', inputs: [{ mat: 'bar_copper', qty: 2 }], exp: 8, desc: 'Cegah gas beracun (sekali pakai)' },
    // -- Konsumabel (ke inventory) --
    { id: 'mystery_box',  name: 'Mystery Box',  emoji: '📦', cat: 'Konsumabel', inputs: [{ mat: 'bar_gold', qty: 1 }], exp: 20, desc: 'Kotak misteri (random 50-2000)' },
    { id: 'lucky_charm',  name: 'Lucky Charm',  emoji: '🍀', cat: 'Konsumabel', inputs: [{ mat: 'bar_titanium', qty: 2 }], exp: 60, desc: '+15% chance menang game' },
    { id: 'money_magnet', name: 'Money Magnet', emoji: '🧲', cat: 'Konsumabel', inputs: [{ mat: 'bar_titanium', qty: 1 }, { mat: 'bar_gold', qty: 2 }], exp: 70, desc: '+50% money semua sumber (1 jam)' },
];

// ==================== GEMS (drop langka, socket ke pickaxe) ====================
// stat: bonus saat di-socket | power: besar bonus | sell: harga jual
const GEMS = [
    { id: 'gem_ruby',     name: 'Ruby',     emoji: '🔺', stat: 'yield',   power: 1,  sell: 800 },
    { id: 'gem_sapphire', name: 'Sapphire', emoji: '🔹', stat: 'stamina', power: 1,  sell: 800 },
    { id: 'gem_topaz',    name: 'Topaz',    emoji: '🔶', stat: 'exp',     power: 20, sell: 800 },
    { id: 'gem_emerald',  name: 'Emerald',  emoji: '🟩', stat: 'luck',    power: 1,  sell: 800 },
    { id: 'gem_diamond',  name: 'Diamond',  emoji: '💎', stat: 'money',   power: 15, sell: 2500 },
    { id: 'gem_star',     name: 'Star Gem', emoji: '🌟', stat: 'all',     power: 1,  sell: 8000 },
];
// Bobot drop gem (star sangat langka)
const GEM_WEIGHTS = { gem_ruby: 25, gem_sapphire: 25, gem_topaz: 20, gem_emerald: 20, gem_diamond: 8, gem_star: 2 };
const GEM_DROP_BASE = 0.03; // 3% per dig + scaling kedalaman
// Kontribusi Star Gem (stat 'all') ke tiap stat
const STAR_CONTRIB = { yield: 1, stamina: 1, exp: 15, money: 10, luck: 1 };

// Jumlah slot socket berdasarkan tier pickaxe
function socketSlots(tier) {
    if (tier <= 0) return 0;
    if (tier <= 2) return 1;
    if (tier <= 4) return 2;
    return 3;
}

// ==================== ENDGAME (Phase 5) ====================
const CORE_DEPTH = 1500;        // kedalaman untuk akses The Core
const CORE_STAMINA = 40;        // biaya stamina lawan Core boss
const ARTIFACT_BONUS = 0.25;    // +25% nilai jual ore (permanen) jika punya Miner's Artifact
const PRESTIGE_BONUS = 0.10;    // +10% nilai jual ore per prestige

// Boss The Core — skala dengan prestige
function getCoreBoss(prestige) {
    return {
        hp: 8000 + prestige * 4000,
        atk: 200 + prestige * 60,
        def: 60 + prestige * 15,
        element: 'dark',
    };
}

// Resep endgame (ditempa di Smith, butuh Artifact Fragment dari The Core)
// type: 'pickaxe' (set pickaxe) | 'artifact' (buff permanen)
const CORE_RECIPES = [
    { id: 'legendary_drill', type: 'pickaxe', name: 'Legendary Drill', emoji: '🌀',
      inputs: [{ mat: 'bar_adamantite', qty: 10 }, { mat: 'artifact_fragment', qty: 8 }], exp: 500,
      desc: 'Bor pamungkas: stamina 1, yield +20, kedalaman tak terbatas' },
    { id: 'artifact', type: 'artifact', name: "Miner's Artifact", emoji: '🏺',
      inputs: [{ mat: 'artifact_fragment', qty: 15 }], exp: 1000,
      desc: '+25% nilai jual ore permanen (akun)' },
];

const STAMINA_REGEN_MS = 60000;   // +1 stamina / menit (skala level via staminaRegenPerMin)
const STAMINA_REFILL_COST_PER = 8; // harga isi ulang per 1 stamina yang hilang (money)
const STAMINA_BASE = 100;         // max = STAMINA_BASE + level * STAMINA_PER_LEVEL
const STAMINA_PER_LEVEL = 5;
const DESCEND_STEP = 25;          // meter per turun
const MAX_MINING_LEVEL = 100;

function getMiningExpNeeded(level) {
    return 60 + level * 30;
}

// Regen stamina per menit, skala dengan level mining (biar endgame tidak nunggu ~10 jam).
// Lv1 = +1/mnt, Lv20 = +2, Lv40 = +3, ... Lv100 = +6/mnt.
function staminaRegenPerMin(level) {
    return 1 + Math.floor((level || 1) / 20);
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

// Material = ore ATAU bar ATAU supply. Return { id, name, emoji, value, kind }.
function getMaterialDef(id) {
    const ore = ORE_TIERS.find(o => o.id === id);
    if (ore) return { ...ore, kind: 'ore' };
    const bar = BARS.find(b => b.id === id);
    if (bar) return { ...bar, kind: 'bar' };
    const sup = SUPPLIES.find(s => s.id === id);
    if (sup) return { ...sup, value: 0, kind: 'supply' };
    const gem = GEMS.find(g => g.id === id);
    if (gem) return { ...gem, value: gem.sell, kind: 'gem' };
    if (id === 'artifact_fragment') return { id, name: 'Artifact Fragment', emoji: '🔱', value: 0, kind: 'misc' };
    return { id, name: id, emoji: '📦', value: 0, kind: 'unknown' };
}

module.exports = {
    PICKAXE_TYPES, ORE_TIERS, MINE_LAYERS, BARS, SMELT_RECIPES, SMITH_RECIPES, FUEL_ORE,
    SUPPLIES, HAZARD_WEIGHTS, getMonsterStats,
    GEMS, GEM_WEIGHTS, GEM_DROP_BASE, STAR_CONTRIB, socketSlots,
    CORE_DEPTH, CORE_STAMINA, ARTIFACT_BONUS, PRESTIGE_BONUS, getCoreBoss, CORE_RECIPES,
    STAMINA_REGEN_MS, STAMINA_REFILL_COST_PER, STAMINA_BASE, STAMINA_PER_LEVEL, DESCEND_STEP, MAX_MINING_LEVEL,
    getMiningExpNeeded, staminaRegenPerMin, getLayerForDepth, getPickaxe, getOreDef, getMaterialDef,
};
