// data/fish.js — Fishing system data (v3.1.0 Location-Based Overhaul)
// Each location has unique fish. Rod determines luck penalty at higher locations.

// ==================== ROD TYPES ====================
const ROD_TYPES = [
    { id: 'basic', name: 'Joran Bambu', emoji: '🎋', price: 0, cooldown: 12, rareBonus: 0, tier: 0 },
    { id: 'fiber', name: 'Joran Fiber', emoji: '🎣', price: 1500, cooldown: 10, rareBonus: 3, tier: 1 },
    { id: 'carbon', name: 'Joran Carbon', emoji: '🏹', price: 5000, cooldown: 9, rareBonus: 6, tier: 2 },
    { id: 'titanium', name: 'Joran Titanium', emoji: '⚙️', price: 15000, cooldown: 8, rareBonus: 9, tier: 3 },
    { id: 'pro', name: 'Joran Pro', emoji: '🏆', price: 40000, cooldown: 7, rareBonus: 12, tier: 4 },
    { id: 'enchanted', name: 'Joran Enchanted', emoji: '✨', price: 80000, cooldown: 6, rareBonus: 16, tier: 5 },
    { id: 'mythic_rod', name: 'Joran Mythic', emoji: '🔱', price: 150000, cooldown: 5, rareBonus: 20, tier: 6 },
    { id: 'celestial', name: 'Joran Celestial', emoji: '🌟', price: 300000, cooldown: 4, rareBonus: 24, tier: 7 },
    { id: 'divine_rod', name: 'Joran Divine', emoji: '👑', price: 500000, cooldown: 3, rareBonus: 28, tier: 8 },
    { id: 'void_rod', name: 'Joran Void', emoji: '🕳️', price: 1000000, cooldown: 3, rareBonus: 32, tier: 9 },
];

// ==================== BAIT TYPES ====================
const BAIT_TYPES = [
    { id: 'none', name: 'Tanpa Umpan', emoji: '❌', price: 0, rareBonus: 0 },
    { id: 'cacing', name: 'Cacing', emoji: '🪱', price: 100, rareBonus: 2 },
    { id: 'jangkrik', name: 'Jangkrik', emoji: '🦗', price: 200, rareBonus: 4 },
    { id: 'udang', name: 'Udang Kecil', emoji: '🦐', price: 500, rareBonus: 6 },
    { id: 'ikan_kecil', name: 'Ikan Kecil', emoji: '🐟', price: 800, rareBonus: 8 },
    { id: 'cumi', name: 'Cumi', emoji: '🦑', price: 1200, rareBonus: 10 },
    { id: 'golden_worm', name: 'Golden Worm', emoji: '✨', price: 3000, rareBonus: 15 },
    { id: 'mystic_bait', name: 'Mystic Bait', emoji: '🔮', price: 8000, rareBonus: 22 },
    { id: 'void_lure', name: 'Void Lure', emoji: '🕳️', price: 20000, rareBonus: 30 },
];

// ==================== FISH TIERS ====================
const FISH_TIERS = [
    { tier: 'Trash', emoji: '🗑️', chance: 25, minWeight: 0.01, maxWeight: 0.5, minValue: 1, maxValue: 5 },
    { tier: 'Common', emoji: '🐟', chance: 35, minWeight: 0.1, maxWeight: 5, minValue: 3, maxValue: 15 },
    { tier: 'Uncommon', emoji: '🐠', chance: 22, minWeight: 0.5, maxWeight: 15, minValue: 8, maxValue: 35 },
    { tier: 'Rare', emoji: '🐡', chance: 12, minWeight: 1, maxWeight: 50, minValue: 25, maxValue: 80 },
    { tier: 'Epic', emoji: '🦈', chance: 4, minWeight: 5, maxWeight: 200, minValue: 60, maxValue: 200 },
    { tier: 'Legendary', emoji: '🐉', chance: 1.5, minWeight: 50, maxWeight: 1000, minValue: 150, maxValue: 600 },
    { tier: 'Mythic', emoji: '🌈', chance: 0.4, minWeight: 100, maxWeight: 5000, minValue: 400, maxValue: 1500 },
    { tier: 'Secret', emoji: '🔮', chance: 0.1, minWeight: 500, maxWeight: 9999, minValue: 1000, maxValue: 5000 },
];

// ==================== FISHING LOCATIONS ====================
// requiredRodTier: rod.tier minimum untuk rate "normal". Di bawah = luck penalty.
// 0 = no requirement (any rod ok), 1 = fiber+, 2 = carbon+, etc.
const FISHING_LOCATIONS = [
    { id: 'river', name: '🏞️ Sungai', desc: 'Sungai kecil yang tenang — cocok untuk pemula', requiredRodTier: 0, luckPenalty: 0, bonusRare: 0, tiers: ['Trash','Common','Uncommon','Rare'] },
    { id: 'swamp', name: '🌿 Rawa', desc: 'Air berlumpur penuh makhluk aneh', requiredRodTier: 0, luckPenalty: 0, bonusRare: 2, tiers: ['Trash','Common','Uncommon','Rare'] },
    { id: 'lake', name: '🌊 Danau', desc: 'Danau besar dengan ikan berkualitas', requiredRodTier: 1, luckPenalty: 15, bonusRare: 5, tiers: ['Common','Uncommon','Rare','Epic'] },
    { id: 'coast', name: '🏖️ Laut Pesisir', desc: 'Laut dangkal dengan ikan beragam', requiredRodTier: 2, luckPenalty: 20, bonusRare: 7, tiers: ['Common','Uncommon','Rare','Epic'] },
    { id: 'deep_sea', name: '🌊 Laut Dalam', desc: 'Laut tengah penuh ikan monster', requiredRodTier: 3, luckPenalty: 25, bonusRare: 10, tiers: ['Uncommon','Rare','Epic','Legendary'] },
    { id: 'ice_cave', name: '❄️ Gua Es', desc: 'Air dingin tersembunyi di pegunungan', requiredRodTier: 4, luckPenalty: 20, bonusRare: 12, tiers: ['Rare','Epic','Legendary'] },
    { id: 'volcano', name: '🌋 Lahar', desc: 'Sungai lava dengan makhluk tahan panas', requiredRodTier: 5, luckPenalty: 25, bonusRare: 15, tiers: ['Rare','Epic','Legendary','Mythic'] },
    { id: 'void_rift', name: '🕳️ Void Rift', desc: 'Dimensi lain — penuh monster langka', requiredRodTier: 6, luckPenalty: 30, bonusRare: 20, tiers: ['Epic','Legendary','Mythic','Secret'] },
];

// ==================== FISH DATA (Location-Based) ====================
const FISH_DATA = [
    // ===== SUNGAI (🏞️) =====
    { id: 'boot', name: 'Sepatu Bekas', tier: 'Trash', emoji: '👢', location: 'river' },
    { id: 'can', name: 'Kaleng Bekas', tier: 'Trash', emoji: '🥫', location: 'river' },
    { id: 'plastic', name: 'Plastik', tier: 'Trash', emoji: '🛍️', location: 'river' },
    { id: 'tire', name: 'Ban Bekas', tier: 'Trash', emoji: '⭕', location: 'river' },
    { id: 'lele', name: 'Lele', tier: 'Common', emoji: '🐱', location: 'river' },
    { id: 'nila', name: 'Nila', tier: 'Common', emoji: '🐟', location: 'river' },
    { id: 'mujair', name: 'Mujair', tier: 'Common', emoji: '🐠', location: 'river' },
    { id: 'gurami', name: 'Gurami', tier: 'Common', emoji: '🐡', location: 'river' },
    { id: 'mas', name: 'Ikan Mas', tier: 'Uncommon', emoji: '✨', location: 'river' },
    { id: 'patin_river', name: 'Patin Sungai', tier: 'Uncommon', emoji: '🐟', location: 'river' },
    { id: 'gabus_river', name: 'Gabus', tier: 'Uncommon', emoji: '🐍', location: 'river' },
    { id: 'bawal_river', name: 'Bawal Air Tawar', tier: 'Rare', emoji: '💎', location: 'river' },
    { id: 'arwana_silver', name: 'Arwana Silver', tier: 'Rare', emoji: '🥈', location: 'river' },

    // ===== RAWA (🌿) =====
    { id: 'lumpur', name: 'Gumpalan Lumpur', tier: 'Trash', emoji: '💩', location: 'swamp' },
    { id: 'tulang', name: 'Tulang Misterius', tier: 'Trash', emoji: '🦴', location: 'swamp' },
    { id: 'belut', name: 'Belut', tier: 'Common', emoji: '🐍', location: 'swamp' },
    { id: 'gabus_rawa', name: 'Gabus Rawa', tier: 'Common', emoji: '🐊', location: 'swamp' },
    { id: 'betok', name: 'Betok', tier: 'Common', emoji: '🐸', location: 'swamp' },
    { id: 'toman', name: 'Toman', tier: 'Uncommon', emoji: '🐲', location: 'swamp' },
    { id: 'piranha', name: 'Piranha', tier: 'Uncommon', emoji: '😈', location: 'swamp' },
    { id: 'buaya_kecil', name: 'Buaya Kecil', tier: 'Rare', emoji: '🐊', location: 'swamp' },
    { id: 'anaconda_muda', name: 'Anaconda Muda', tier: 'Rare', emoji: '🐍', location: 'swamp' },

    // ===== DANAU (🌊) =====
    { id: 'bass', name: 'Bass', tier: 'Common', emoji: '🐟', location: 'lake' },
    { id: 'trout', name: 'Trout', tier: 'Common', emoji: '🐠', location: 'lake' },
    { id: 'karper', name: 'Karper', tier: 'Common', emoji: '🐡', location: 'lake' },
    { id: 'patin_lake', name: 'Patin Danau', tier: 'Uncommon', emoji: '🐟', location: 'lake' },
    { id: 'pike', name: 'Pike', tier: 'Uncommon', emoji: '🗡️', location: 'lake' },
    { id: 'catfish_giant', name: 'Catfish Raksasa', tier: 'Uncommon', emoji: '🐱', location: 'lake' },
    { id: 'arwana_gold', name: 'Arwana Emas', tier: 'Rare', emoji: '🥇', location: 'lake' },
    { id: 'sturgeon_lake', name: 'Sturgeon Danau', tier: 'Rare', emoji: '🐋', location: 'lake' },
    { id: 'arapaima', name: 'Arapaima', tier: 'Epic', emoji: '🦕', location: 'lake' },
    { id: 'nessie', name: 'Nessie Jr.', tier: 'Epic', emoji: '🦎', location: 'lake' },

    // ===== LAUT PESISIR (🏖️) =====
    { id: 'ubur', name: 'Ubur-ubur', tier: 'Common', emoji: '🪼', location: 'coast' },
    { id: 'kakap', name: 'Kakap Merah', tier: 'Common', emoji: '🐟', location: 'coast' },
    { id: 'tongkol', name: 'Tongkol', tier: 'Common', emoji: '🐠', location: 'coast' },
    { id: 'kerapu', name: 'Kerapu', tier: 'Uncommon', emoji: '🐡', location: 'coast' },
    { id: 'barakuda', name: 'Barakuda', tier: 'Uncommon', emoji: '⚡', location: 'coast' },
    { id: 'cakalang', name: 'Cakalang', tier: 'Uncommon', emoji: '🏃', location: 'coast' },
    { id: 'marlin_kecil', name: 'Marlin Kecil', tier: 'Rare', emoji: '🗡️', location: 'coast' },
    { id: 'hiu_karang', name: 'Hiu Karang', tier: 'Rare', emoji: '🦈', location: 'coast' },
    { id: 'pari_manta', name: 'Pari Manta', tier: 'Epic', emoji: '🦅', location: 'coast' },
    { id: 'napoleon', name: 'Napoleon Wrasse', tier: 'Epic', emoji: '👑', location: 'coast' },

    // ===== LAUT DALAM (🌊) =====
    { id: 'tuna', name: 'Tuna Sirip Biru', tier: 'Uncommon', emoji: '🐟', location: 'deep_sea' },
    { id: 'swordfish', name: 'Swordfish', tier: 'Uncommon', emoji: '⚔️', location: 'deep_sea' },
    { id: 'hiu_putih', name: 'Hiu Putih', tier: 'Rare', emoji: '🦈', location: 'deep_sea' },
    { id: 'marlin_besar', name: 'Marlin Raksasa', tier: 'Rare', emoji: '🏆', location: 'deep_sea' },
    { id: 'oarfish', name: 'Oarfish', tier: 'Rare', emoji: '🐍', location: 'deep_sea' },
    { id: 'paus_orca', name: 'Orca', tier: 'Epic', emoji: '🐋', location: 'deep_sea' },
    { id: 'giant_squid', name: 'Giant Squid', tier: 'Epic', emoji: '🦑', location: 'deep_sea' },
    { id: 'megalodon', name: 'Megalodon', tier: 'Legendary', emoji: '🦷', location: 'deep_sea' },
    { id: 'leviathan', name: 'Leviathan Jr.', tier: 'Legendary', emoji: '🐉', location: 'deep_sea' },

    // ===== GUA ES (❄️) =====
    { id: 'trout_es', name: 'Trout Es', tier: 'Rare', emoji: '❄️', location: 'ice_cave' },
    { id: 'sturgeon_purba', name: 'Sturgeon Purba', tier: 'Rare', emoji: '🧊', location: 'ice_cave' },
    { id: 'narwhal', name: 'Narwhal', tier: 'Rare', emoji: '🦄', location: 'ice_cave' },
    { id: 'ice_dragon_fish', name: 'Ice Dragon Fish', tier: 'Epic', emoji: '🐲', location: 'ice_cave' },
    { id: 'frost_whale', name: 'Frost Whale', tier: 'Epic', emoji: '🐳', location: 'ice_cave' },
    { id: 'crystal_koi', name: 'Crystal Koi', tier: 'Legendary', emoji: '💎', location: 'ice_cave' },
    { id: 'ancient_coelacanth', name: 'Ancient Coelacanth', tier: 'Legendary', emoji: '🦴', location: 'ice_cave' },

    // ===== LAHAR / VULKANIK (🌋) =====
    { id: 'magma_eel', name: 'Magma Eel', tier: 'Rare', emoji: '🔥', location: 'volcano' },
    { id: 'lava_crab', name: 'Lava Crab', tier: 'Rare', emoji: '🦀', location: 'volcano' },
    { id: 'volcanic_catfish', name: 'Volcanic Catfish', tier: 'Rare', emoji: '🌋', location: 'volcano' },
    { id: 'fire_serpent', name: 'Fire Serpent', tier: 'Epic', emoji: '🐍', location: 'volcano' },
    { id: 'phoenix_fish', name: 'Phoenix Fish', tier: 'Epic', emoji: '🔥', location: 'volcano' },
    { id: 'inferno_dragon', name: 'Inferno Dragon', tier: 'Legendary', emoji: '🐉', location: 'volcano' },
    { id: 'molten_leviathan', name: 'Molten Leviathan', tier: 'Legendary', emoji: '🌋', location: 'volcano' },
    { id: 'primal_ifrit', name: 'Primal Ifrit', tier: 'Mythic', emoji: '👹', location: 'volcano' },

    // ===== VOID RIFT (🕳️) =====
    { id: 'void_jelly', name: 'Void Jellyfish', tier: 'Epic', emoji: '👾', location: 'void_rift' },
    { id: 'shadow_ray', name: 'Shadow Ray', tier: 'Epic', emoji: '🦇', location: 'void_rift' },
    { id: 'eldritch_eel', name: 'Eldritch Eel', tier: 'Epic', emoji: '🐙', location: 'void_rift' },
    { id: 'abyssal_kraken', name: 'Abyssal Kraken', tier: 'Legendary', emoji: '🦑', location: 'void_rift' },
    { id: 'void_serpent', name: 'Void Serpent', tier: 'Legendary', emoji: '🐍', location: 'void_rift' },
    { id: 'dimensional_whale', name: 'Dimensional Whale', tier: 'Legendary', emoji: '🐋', location: 'void_rift' },
    { id: 'cosmic_dragon', name: 'Cosmic Dragon', tier: 'Mythic', emoji: '🌌', location: 'void_rift' },
    { id: 'world_eater', name: 'World Eater', tier: 'Mythic', emoji: '🌀', location: 'void_rift' },
    { id: 'god_fish', name: 'The God Fish', tier: 'Secret', emoji: '🔮', location: 'void_rift' },
    { id: 'reality_breaker', name: 'Reality Breaker', tier: 'Secret', emoji: '💫', location: 'void_rift' },
];

module.exports = { FISH_DATA, FISH_TIERS, BAIT_TYPES, ROD_TYPES, FISHING_LOCATIONS };
