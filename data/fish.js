// data/fish.js — Fishing system data (v3.2.0 — God Tier + Sea Monsters)
// Each location has unique fish. Rod determines luck penalty at higher locations.

// ==================== ROD TYPES ====================
const ROD_TYPES = [
    { id: 'basic', name: 'Joran Bambu', emoji: '<:JoranBambu:1510791122820268093>', price: 0, cooldown: 12, rareBonus: 0, tier: 0 },
    { id: 'fiber', name: 'Joran Fiber', emoji: '<:JoranFiber:1510791121180168293>', price: 1500, cooldown: 10, rareBonus: 3, tier: 1 },
    { id: 'carbon', name: 'Joran Carbon', emoji: '<:JoranCarbon:1510791119611494431>', price: 5000, cooldown: 9, rareBonus: 6, tier: 2 },
    { id: 'titanium', name: 'Joran Titanium', emoji: '<:JoranTitanium:1510791117317341276>', price: 15000, cooldown: 8, rareBonus: 9, tier: 3 },
    { id: 'pro', name: 'Joran Pro', emoji: '<:JoranPro:1510791115765321819>', price: 40000, cooldown: 7, rareBonus: 12, tier: 4 },
    { id: 'enchanted', name: 'Joran Enchanted', emoji: '<:JoranEnchanted:1510791113932406975>', price: 80000, cooldown: 6, rareBonus: 16, tier: 5 },
    { id: 'mythic_rod', name: 'Joran Mythic', emoji: '<:JoranMythic:1510791109360488548>', price: 150000, cooldown: 5, rareBonus: 20, tier: 6 },
    { id: 'celestial', name: 'Joran Celestial', emoji: '<:JoranCelestial:1510791105694793818>', price: 300000, cooldown: 4, rareBonus: 24, tier: 7 },
    { id: 'divine_rod', name: 'Joran Divine', emoji: '<:JoranDivine:1510791103987843203>', price: 500000, cooldown: 3, rareBonus: 28, tier: 8 },
    { id: 'void_rod', name: 'Joran Void', emoji: '<:JoranVoid:1510791102075109446>', price: 1000000, cooldown: 3, rareBonus: 32, tier: 9 },
    // === NEW HIGH-TIER RODS ===
    { id: 'astral_rod', name: 'Joran Astral', emoji: '🌟', price: 2000000, cooldown: 2, rareBonus: 38, tier: 10 },
    { id: 'godslayer_rod', name: 'Joran Godslayer', emoji: '⚡', price: 5000000, cooldown: 2, rareBonus: 45, tier: 11 },
    { id: 'omega_rod', name: 'Joran Omega', emoji: '🔱', price: 10000000, cooldown: 1, rareBonus: 55, tier: 12 },
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
    // === NEW HIGH-TIER BAITS ===
    { id: 'celestial_bait', name: 'Celestial Bait', emoji: '🌙', price: 50000, rareBonus: 38 },
    { id: 'divine_essence', name: 'Divine Essence', emoji: '✝️', price: 100000, rareBonus: 45 },
    { id: 'god_lure', name: 'God Lure', emoji: '👁️‍🗨️', price: 250000, rareBonus: 55 },
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
    { tier: 'God', emoji: '👑', chance: 0.02, minWeight: 2000, maxWeight: 50000, minValue: 5000, maxValue: 25000 },
];

// ==================== SEA MONSTERS ====================
// Monsters that can interrupt fishing at advanced locations
// chance = % chance per cast to encounter monster instead of fish
const SEA_MONSTERS = [
    // ===== CELESTIAL OCEAN (🌟) — 8 monsters =====
    { id: 'storm_serpent', name: 'Storm Serpent', emoji: '🐍⚡', location: 'celestial_ocean', chance: 12, damage: 'bait', desc: 'Ular badai menyambar umpanmu!' },
    { id: 'light_kraken', name: 'Light Kraken', emoji: '🦑✨', location: 'celestial_ocean', chance: 8, damage: 'bait', desc: 'Kraken cahaya merebut umpanmu!' },
    { id: 'celestial_shark', name: 'Celestial Shark', emoji: '🦈🌟', location: 'celestial_ocean', chance: 5, damage: 'rod_break', desc: 'Hiu celestial menyerang joranmu! Rod Part -1' },
    { id: 'thunder_jellyfish', name: 'Thunder Jellyfish', emoji: '🪼⚡', location: 'celestial_ocean', chance: 10, damage: 'bait', desc: 'Ubur-ubur petir menyetrum umpanmu!' },
    { id: 'comet_whale', name: 'Comet Whale', emoji: '🐋☄️', location: 'celestial_ocean', chance: 6, damage: 'bait_all', desc: 'Paus komet menabrak perahu! Umpan -5!' },
    { id: 'starfall_piranha', name: 'Starfall Piranha', emoji: '🐟💫', location: 'celestial_ocean', chance: 14, damage: 'bait', desc: 'Swarm piranha bintang memakan umpanmu!' },
    { id: 'nebula_squid', name: 'Nebula Squid', emoji: '🦑🌌', location: 'celestial_ocean', chance: 4, damage: 'money', desc: 'Cumi nebula menyemprotkan tinta — money -3000!' },
    { id: 'solar_flare_eel', name: 'Solar Flare Eel', emoji: '🐍☀️', location: 'celestial_ocean', chance: 3, damage: 'cooldown', desc: 'Belut solar flare membakar waktumu! CD +20 detik' },

    // ===== PRIMORDIAL DEPTHS (💀) — 10 monsters =====
    { id: 'ancient_hydra', name: 'Ancient Hydra', emoji: '🐲💀', location: 'primordial_depths', chance: 15, damage: 'bait', desc: 'Hydra purba memakan umpanmu!' },
    { id: 'abyss_titan', name: 'Abyss Titan', emoji: '👹🌊', location: 'primordial_depths', chance: 10, damage: 'bait_all', desc: 'Titan abyss menghancurkan semua umpan (5)!' },
    { id: 'death_leviathan', name: 'Death Leviathan', emoji: '💀🐋', location: 'primordial_depths', chance: 5, damage: 'rod_break', desc: 'Leviathan kematian merusak joranmu! Rod Part -2' },
    { id: 'soul_eater', name: 'Soul Eater', emoji: '👻⚫', location: 'primordial_depths', chance: 3, damage: 'money', desc: 'Soul Eater mencuri uangmu! -5000 money' },
    { id: 'bone_crusher', name: 'Bone Crusher', emoji: '🦴💥', location: 'primordial_depths', chance: 12, damage: 'bait', desc: 'Bone Crusher menghancurkan umpanmu dengan rahangnya!' },
    { id: 'plague_octopus', name: 'Plague Octopus', emoji: '🐙☠️', location: 'primordial_depths', chance: 8, damage: 'bait', desc: 'Gurita wabah meracuni umpanmu!' },
    { id: 'fossil_golem', name: 'Fossil Golem', emoji: '🪨🦕', location: 'primordial_depths', chance: 6, damage: 'rod_break', desc: 'Golem fosil memukul joranmu! Rod Part -1' },
    { id: 'blood_shark', name: 'Blood Shark', emoji: '🦈🩸', location: 'primordial_depths', chance: 9, damage: 'bait_all', desc: 'Hiu darah mencium umpanmu — semua umpan habis (5)!' },
    { id: 'phantom_angler', name: 'Phantom Angler', emoji: '👤🎣', location: 'primordial_depths', chance: 4, damage: 'money', desc: 'Pemancing hantu mencuri hasilmu! -7000 money' },
    { id: 'gravity_worm', name: 'Gravity Worm', emoji: '🪱🌀', location: 'primordial_depths', chance: 3, damage: 'cooldown', desc: 'Cacing gravitasi melambatkan waktu! CD +25 detik' },

    // ===== GOD REALM (👑) — 12 monsters =====
    { id: 'chaos_dragon', name: 'Chaos Dragon', emoji: '🐉🔥', location: 'god_realm', chance: 18, damage: 'bait', desc: 'Naga Chaos membakar umpanmu!' },
    { id: 'void_emperor_monster', name: 'Void Emperor', emoji: '🕳️👑', location: 'god_realm', chance: 12, damage: 'bait_all', desc: 'Void Emperor menghancurkan 5 umpan!' },
    { id: 'god_guardian', name: 'God Guardian', emoji: '⚔️👁️', location: 'god_realm', chance: 8, damage: 'rod_break', desc: 'Penjaga Dewa menyerang joranmu! Rod Part -3' },
    { id: 'reality_destroyer', name: 'Reality Destroyer', emoji: '💥🌀', location: 'god_realm', chance: 5, damage: 'money', desc: 'Penghancur Realitas mencuri uangmu! -10000 money' },
    { id: 'time_devourer', name: 'Time Devourer', emoji: '⏳👾', location: 'god_realm', chance: 3, damage: 'cooldown', desc: 'Pemakan Waktu memperlambatmu! Cooldown +30 detik' },
    { id: 'divine_wrath', name: 'Divine Wrath', emoji: '⚡👼', location: 'god_realm', chance: 10, damage: 'bait_all', desc: 'Murka Ilahi menyambar! Semua umpan musnah!' },
    { id: 'apocalypse_serpent', name: 'Apocalypse Serpent', emoji: '🐍🔥', location: 'god_realm', chance: 7, damage: 'rod_break', desc: 'Ular Kiamat melilit joranmu! Rod Part -2' },
    { id: 'judgement_whale', name: 'Judgement Whale', emoji: '🐋⚖️', location: 'god_realm', chance: 6, damage: 'money', desc: 'Paus Penghakiman menghukummu! -15000 money' },
    { id: 'entropy_swarm', name: 'Entropy Swarm', emoji: '🐝🌑', location: 'god_realm', chance: 14, damage: 'bait', desc: 'Swarm entropy memakan habis umpanmu!' },
    { id: 'dimensional_rift', name: 'Dimensional Rift', emoji: '🌀💀', location: 'god_realm', chance: 4, damage: 'money', desc: 'Lubang dimensi menyedot moneymu! -8000 money' },
    { id: 'celestial_hydra', name: 'Celestial Hydra', emoji: '🐲✨', location: 'god_realm', chance: 9, damage: 'bait', desc: 'Hydra celestial menyerang dari segala arah!' },
    { id: 'omega_beast', name: 'Omega Beast', emoji: '🔱💀', location: 'god_realm', chance: 2, damage: 'rod_break', desc: 'Omega Beast menghancurkan segalanya! Rod Part -5!' },
];

// ==================== FISHING LOCATIONS ====================
const FISHING_LOCATIONS = [
    { id: 'river', name: '🏞️ Sungai', desc: 'Sungai kecil yang tenang — cocok untuk pemula', requiredRodTier: 0, luckPenalty: 0, bonusRare: 0, tiers: ['Trash','Common','Uncommon','Rare'], monsterChance: 0 },
    { id: 'swamp', name: '🌿 Rawa', desc: 'Air berlumpur penuh makhluk aneh', requiredRodTier: 0, luckPenalty: 0, bonusRare: 2, tiers: ['Trash','Common','Uncommon','Rare'], monsterChance: 0 },
    { id: 'lake', name: '🌊 Danau', desc: 'Danau besar dengan ikan berkualitas', requiredRodTier: 1, luckPenalty: 15, bonusRare: 5, tiers: ['Common','Uncommon','Rare','Epic'], monsterChance: 0 },
    { id: 'coast', name: '🏖️ Laut Pesisir', desc: 'Laut dangkal dengan ikan beragam', requiredRodTier: 2, luckPenalty: 20, bonusRare: 7, tiers: ['Common','Uncommon','Rare','Epic'], monsterChance: 0 },
    { id: 'deep_sea', name: '🌊 Laut Dalam', desc: 'Laut tengah penuh ikan monster', requiredRodTier: 3, luckPenalty: 25, bonusRare: 10, tiers: ['Uncommon','Rare','Epic','Legendary'], monsterChance: 0 },
    { id: 'ice_cave', name: '❄️ Gua Es', desc: 'Air dingin tersembunyi di pegunungan', requiredRodTier: 4, luckPenalty: 20, bonusRare: 12, tiers: ['Rare','Epic','Legendary'], monsterChance: 0 },
    { id: 'volcano', name: '🌋 Lahar', desc: 'Sungai lava dengan makhluk tahan panas', requiredRodTier: 5, luckPenalty: 25, bonusRare: 15, tiers: ['Rare','Epic','Legendary','Mythic'], monsterChance: 0 },
    { id: 'void_rift', name: '🕳️ Void Rift', desc: 'Dimensi lain — penuh monster langka', requiredRodTier: 6, luckPenalty: 30, bonusRare: 20, tiers: ['Epic','Legendary','Mythic','Secret'], monsterChance: 0 },
    { id: 'abyss', name: '👁️ The Abyss', desc: 'Dimensi tersembunyi di bawah Void Rift — hanya pemancing elite', requiredRodTier: 7, luckPenalty: 35, bonusRare: 25, tiers: ['Epic','Legendary','Mythic','Secret'], isSecret: true, monsterChance: 0 },
    // === NEW ADVANCED LOCATIONS (with Sea Monsters!) ===
    { id: 'celestial_ocean', name: '🌟 Celestial Ocean', desc: 'Lautan bintang — ikan dewa tapi penuh monster laut!', requiredRodTier: 9, luckPenalty: 40, bonusRare: 30, tiers: ['Legendary','Mythic','Secret','God'], monsterChance: 25 },
    { id: 'primordial_depths', name: '💀 Primordial Depths', desc: 'Kedalaman purba — monster mematikan mengintai setiap cast!', requiredRodTier: 10, luckPenalty: 45, bonusRare: 35, tiers: ['Mythic','Secret','God'], monsterChance: 33 },
    { id: 'god_realm', name: '👑 God Realm', desc: 'Dimensi para dewa — hanya yang paling kuat yang bertahan!', requiredRodTier: 11, luckPenalty: 50, bonusRare: 45, tiers: ['Secret','God'], monsterChance: 45 },
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

    // ===== THE ABYSS (👁️) — SECRET LOCATION =====
    { id: 'abyss_angler', name: 'Abyssal Angler', tier: 'Epic', emoji: '🔦', location: 'abyss' },
    { id: 'shadow_leviathan', name: 'Shadow Leviathan', tier: 'Epic', emoji: '🐲', location: 'abyss' },
    { id: 'depth_crawler', name: 'Depth Crawler', tier: 'Epic', emoji: '🕷️', location: 'abyss' },
    { id: 'eternal_jellyfish', name: 'Eternal Jellyfish', tier: 'Legendary', emoji: '🪼', location: 'abyss' },
    { id: 'abyssal_whale_king', name: 'Abyssal Whale King', tier: 'Legendary', emoji: '🐋', location: 'abyss' },
    { id: 'void_emperor', name: 'Void Emperor', tier: 'Legendary', emoji: '👑', location: 'abyss' },
    { id: 'primordial_serpent', name: 'Primordial Serpent', tier: 'Mythic', emoji: '🐍', location: 'abyss' },
    { id: 'soul_devourer', name: 'Soul Devourer', tier: 'Mythic', emoji: '👻', location: 'abyss' },
    { id: 'abyss_guardian', name: 'Abyss Guardian', tier: 'Mythic', emoji: '🛡️', location: 'abyss' },
    { id: 'the_forgotten_one', name: 'The Forgotten One', tier: 'Secret', emoji: '👁️', location: 'abyss' },
    { id: 'universe_fish', name: 'Universe Fish', tier: 'Secret', emoji: '🌠', location: 'abyss' },

    // ===== CELESTIAL OCEAN (🌟) — MONSTER LOCATION =====
    { id: 'starlight_ray', name: 'Starlight Ray', tier: 'Legendary', emoji: '⭐', location: 'celestial_ocean' },
    { id: 'nebula_whale', name: 'Nebula Whale', tier: 'Legendary', emoji: '🐋', location: 'celestial_ocean' },
    { id: 'constellation_fish', name: 'Constellation Fish', tier: 'Legendary', emoji: '✨', location: 'celestial_ocean' },
    { id: 'aurora_serpent', name: 'Aurora Serpent', tier: 'Legendary', emoji: '🌈', location: 'celestial_ocean' },
    { id: 'moonlight_koi', name: 'Moonlight Koi', tier: 'Mythic', emoji: '🌙', location: 'celestial_ocean' },
    { id: 'solar_dragon', name: 'Solar Dragon', tier: 'Mythic', emoji: '☀️', location: 'celestial_ocean' },
    { id: 'galaxy_jellyfish', name: 'Galaxy Jellyfish', tier: 'Mythic', emoji: '🪼', location: 'celestial_ocean' },
    { id: 'celestial_phoenix', name: 'Celestial Phoenix', tier: 'Secret', emoji: '🦅', location: 'celestial_ocean' },
    { id: 'star_eater', name: 'Star Eater', tier: 'Secret', emoji: '🌟', location: 'celestial_ocean' },
    { id: 'astral_leviathan', name: 'Astral Leviathan', tier: 'God', emoji: '🐉', location: 'celestial_ocean' },
    { id: 'heaven_whale', name: 'Heaven Whale', tier: 'God', emoji: '🐋', location: 'celestial_ocean' },

    // ===== PRIMORDIAL DEPTHS (💀) — HEAVY MONSTER LOCATION =====
    { id: 'ancient_titan_fish', name: 'Ancient Titan Fish', tier: 'Mythic', emoji: '🦕', location: 'primordial_depths' },
    { id: 'primeval_shark', name: 'Primeval Shark', tier: 'Mythic', emoji: '🦈', location: 'primordial_depths' },
    { id: 'chaos_eel', name: 'Chaos Eel', tier: 'Mythic', emoji: '⚡', location: 'primordial_depths' },
    { id: 'bone_leviathan', name: 'Bone Leviathan', tier: 'Mythic', emoji: '💀', location: 'primordial_depths' },
    { id: 'time_fish', name: 'Time Fish', tier: 'Secret', emoji: '⏳', location: 'primordial_depths' },
    { id: 'entropy_serpent', name: 'Entropy Serpent', tier: 'Secret', emoji: '🌀', location: 'primordial_depths' },
    { id: 'genesis_whale', name: 'Genesis Whale', tier: 'Secret', emoji: '🌊', location: 'primordial_depths' },
    { id: 'creator_fish', name: 'Creator Fish', tier: 'God', emoji: '✝️', location: 'primordial_depths' },
    { id: 'destroyer_of_worlds', name: 'Destroyer of Worlds', tier: 'God', emoji: '💥', location: 'primordial_depths' },
    { id: 'primordial_god', name: 'Primordial God', tier: 'God', emoji: '🔱', location: 'primordial_depths' },

    // ===== GOD REALM (👑) — EXTREME MONSTER LOCATION =====
    { id: 'divine_koi', name: 'Divine Koi', tier: 'Secret', emoji: '🐟', location: 'god_realm' },
    { id: 'holy_dragon_fish', name: 'Holy Dragon Fish', tier: 'Secret', emoji: '🐉', location: 'god_realm' },
    { id: 'archangel_ray', name: 'Archangel Ray', tier: 'Secret', emoji: '👼', location: 'god_realm' },
    { id: 'supreme_deity', name: 'Supreme Deity', tier: 'God', emoji: '👑', location: 'god_realm' },
    { id: 'omega_fish', name: 'Omega Fish', tier: 'God', emoji: '🔱', location: 'god_realm' },
    { id: 'alpha_leviathan', name: 'Alpha Leviathan', tier: 'God', emoji: '⚡', location: 'god_realm' },
    { id: 'eternal_one', name: 'The Eternal One', tier: 'God', emoji: '♾️', location: 'god_realm' },
    { id: 'origin_fish', name: 'Origin Fish', tier: 'God', emoji: '🌌', location: 'god_realm' },
];

// ==================== ROD UPGRADE REQUIREMENTS ====================
const ROD_UPGRADES = [
    { from: 0, to: 1, parts: 3, cost: 1000, successRate: 100 },
    { from: 1, to: 2, parts: 5, cost: 3000, successRate: 100 },
    { from: 2, to: 3, parts: 8, cost: 8000, successRate: 100 },
    { from: 3, to: 4, parts: 12, cost: 20000, successRate: 90 },
    { from: 4, to: 5, parts: 18, cost: 50000, successRate: 80 },
    { from: 5, to: 6, parts: 25, cost: 100000, successRate: 70 },
    { from: 6, to: 7, parts: 35, cost: 200000, successRate: 60 },
    { from: 7, to: 8, parts: 50, cost: 350000, successRate: 50 },
    { from: 8, to: 9, parts: 75, cost: 500000, successRate: 40 },
    { from: 9, to: 10, parts: 100, cost: 1000000, successRate: 35 },
    { from: 10, to: 11, parts: 150, cost: 2500000, successRate: 25 },
    { from: 11, to: 12, parts: 200, cost: 5000000, successRate: 15 },
];

// Drop chance for rod_part when fishing (base %, before bonuses)
const ROD_PART_DROP_CHANCE = 8; // 8% per cast

module.exports = { FISH_DATA, FISH_TIERS, BAIT_TYPES, ROD_TYPES, FISHING_LOCATIONS, ROD_UPGRADES, ROD_PART_DROP_CHANCE, SEA_MONSTERS };
