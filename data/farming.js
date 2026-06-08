const FARM_LEVELS = [
    { level: 1, name: '🌱 Pemula', slots: 3, cost: 0 },
    { level: 2, name: '🌿 Petani', slots: 5, cost: 5000 },
    { level: 3, name: '🌳 Farmer Pro', slots: 8, cost: 15000 },
    { level: 4, name: '🏡 Tuan Tanah', slots: 12, cost: 40000 },
    { level: 5, name: '🏰 Juragan', slots: 16, cost: 100000 },
    { level: 6, name: '👑 Raja Pertanian', slots: 20, cost: 250000 }
];

const FARM_CROPS = [
    { id: 'gandum', name: 'Gandum', emoji: '🌾', tier: 'Common', cost: 20, time: 2, minYield: 2, maxYield: 4, sellPrice: 12 },
    { id: 'wortel', name: 'Wortel', emoji: '🥕', tier: 'Common', cost: 30, time: 3, minYield: 2, maxYield: 3, sellPrice: 15 },
    { id: 'bayam', name: 'Bayam', emoji: '🥬', tier: 'Common', cost: 20, time: 2, minYield: 3, maxYield: 5, sellPrice: 10 },
    { id: 'jagung', name: 'Jagung', emoji: '🌽', tier: 'Common', cost: 35, time: 4, minYield: 2, maxYield: 4, sellPrice: 15 },
    { id: 'kentang', name: 'Kentang', emoji: '🥔', tier: 'Common', cost: 25, time: 3, minYield: 2, maxYield: 4, sellPrice: 12 },
    { id: 'bawang_putih', name: 'Bawang Putih', emoji: '🧄', tier: 'Common', cost: 30, time: 4, minYield: 2, maxYield: 3, sellPrice: 15 },
    { id: 'tomat', name: 'Tomat', emoji: '🍅', tier: 'Uncommon', cost: 70, time: 8, minYield: 2, maxYield: 4, sellPrice: 25 },
    { id: 'cabai', name: 'Cabai', emoji: '🌶️', tier: 'Uncommon', cost: 60, time: 8, minYield: 3, maxYield: 5, sellPrice: 20 },
    { id: 'paprika', name: 'Paprika', emoji: '🫑', tier: 'Uncommon', cost: 80, time: 12, minYield: 2, maxYield: 3, sellPrice: 35 },
    { id: 'strawberry', name: 'Strawberry', emoji: '🍓', tier: 'Uncommon', cost: 100, time: 18, minYield: 2, maxYield: 4, sellPrice: 40 },
    { id: 'bawang_merah', name: 'Bawang Merah', emoji: '🧅', tier: 'Uncommon', cost: 60, time: 10, minYield: 3, maxYield: 5, sellPrice: 20 },
    { id: 'terong', name: 'Terong', emoji: '🍆', tier: 'Uncommon', cost: 75, time: 12, minYield: 2, maxYield: 3, sellPrice: 30 },
    { id: 'anggur', name: 'Anggur', emoji: '🍇', tier: 'Rare', cost: 200, time: 20, minYield: 2, maxYield: 4, sellPrice: 55 },
    { id: 'semangka', name: 'Semangka', emoji: '🍉', tier: 'Rare', cost: 250, time: 30, minYield: 1, maxYield: 2, sellPrice: 130 },
    { id: 'kopi', name: 'Kopi', emoji: '☕', tier: 'Rare', cost: 280, time: 30, minYield: 2, maxYield: 3, sellPrice: 80 },
    { id: 'kakao', name: 'Kakao', emoji: '🍫', tier: 'Rare', cost: 250, time: 35, minYield: 2, maxYield: 3, sellPrice: 70 },
    { id: 'blueberry', name: 'Blueberry', emoji: '🫐', tier: 'Rare', cost: 200, time: 20, minYield: 2, maxYield: 4, sellPrice: 60 },
    { id: 'mawar', name: 'Mawar', emoji: '🌹', tier: 'Rare', cost: 350, time: 35, minYield: 1, maxYield: 3, sellPrice: 130 },
    { id: 'bunga_matahari', name: 'Bunga Matahari', emoji: '🌻', tier: 'Epic', cost: 600, time: 50, minYield: 2, maxYield: 4, sellPrice: 130 },
    { id: 'jeruk', name: 'Jeruk', emoji: '🍊', tier: 'Epic', cost: 700, time: 70, minYield: 2, maxYield: 3, sellPrice: 200 },
    { id: 'zaitun', name: 'Zaitun', emoji: '🫒', tier: 'Epic', cost: 900, time: 90, minYield: 1, maxYield: 3, sellPrice: 350 },
    { id: 'sakura', name: 'Sakura', emoji: '🌸', tier: 'Epic', cost: 1100, time: 70, minYield: 1, maxYield: 2, sellPrice: 400 },
    { id: 'madu', name: 'Madu', emoji: '🍯', tier: 'Epic', cost: 700, time: 50, minYield: 2, maxYield: 3, sellPrice: 230 },
    { id: 'hibiscus', name: 'Hibiscus', emoji: '🌺', tier: 'Epic', cost: 650, time: 50, minYield: 2, maxYield: 3, sellPrice: 170 },
    { id: 'crystal_flower', name: 'Crystal Flower', emoji: '💎', tier: 'Legendary', cost: 3500, time: 150, minYield: 1, maxYield: 2, sellPrice: 1400 },
    { id: 'star_fruit', name: 'Star Fruit', emoji: '🌟', tier: 'Legendary', cost: 3000, time: 150, minYield: 1, maxYield: 2, sellPrice: 1100 },
    { id: 'mystic_herb', name: 'Mystic Herb', emoji: '🔮', tier: 'Legendary', cost: 4500, time: 180, minYield: 1, maxYield: 1, sellPrice: 1800 },
    { id: 'dragon_fruit_crop', name: 'Dragon Fruit', emoji: '🐉', tier: 'Legendary', cost: 3500, time: 165, minYield: 1, maxYield: 2, sellPrice: 1400 },
    { id: 'lotus', name: 'Lotus Suci', emoji: '🪷', tier: 'Legendary', cost: 5000, time: 210, minYield: 1, maxYield: 1, sellPrice: 2200 },
    { id: 'ice_berry', name: 'Ice Berry', emoji: '❄️', tier: 'Legendary', cost: 3200, time: 150, minYield: 1, maxYield: 2, sellPrice: 1300 }
];

const FARM_RECIPES = [
    // === COMMON RECIPES (bahan mudah, profit rendah) ===
    { id: 'roti', name: 'Roti', emoji: '🍞', ingredients: [{id:'gandum',qty:3}], sellPrice: 150 },
    { id: 'salad', name: 'Salad', emoji: '🥗', ingredients: [{id:'bayam',qty:2},{id:'tomat',qty:1}], sellPrice: 260 },
    { id: 'kentang_goreng', name: 'Kentang Goreng', emoji: '🍟', ingredients: [{id:'kentang',qty:3}], sellPrice: 180 },
    { id: 'popcorn', name: 'Popcorn', emoji: '🍿', ingredients: [{id:'jagung',qty:4}], sellPrice: 300 },
    { id: 'sup', name: 'Sup Sayur', emoji: '🫕', ingredients: [{id:'wortel',qty:2},{id:'kentang',qty:2},{id:'bawang_putih',qty:1}], sellPrice: 380 },
    { id: 'nasi_goreng', name: 'Nasi Goreng', emoji: '🍳', ingredients: [{id:'gandum',qty:2},{id:'bawang_merah',qty:2},{id:'cabai',qty:1}], sellPrice: 350 },
    { id: 'tumis_sayur', name: 'Tumis Sayur', emoji: '🥬', ingredients: [{id:'bayam',qty:3},{id:'bawang_putih',qty:2}], sellPrice: 220 },
    { id: 'jagung_bakar', name: 'Jagung Bakar', emoji: '🌽', ingredients: [{id:'jagung',qty:3},{id:'bawang_putih',qty:1}], sellPrice: 250 },

    // === UNCOMMON RECIPES (bahan medium, profit medium) ===
    { id: 'kue', name: 'Kue Strawberry', emoji: '🍰', ingredients: [{id:'gandum',qty:2},{id:'strawberry',qty:2}], sellPrice: 520 },
    { id: 'sambal', name: 'Sambal', emoji: '🌶️', ingredients: [{id:'cabai',qty:4},{id:'bawang_merah',qty:2}], sellPrice: 600 },
    { id: 'pizza', name: 'Pizza', emoji: '🍕', ingredients: [{id:'gandum',qty:3},{id:'tomat',qty:2},{id:'paprika',qty:1}], sellPrice: 700 },
    { id: 'pasta', name: 'Pasta Bolognese', emoji: '🍝', ingredients: [{id:'gandum',qty:3},{id:'tomat',qty:3},{id:'bawang_putih',qty:2}], sellPrice: 650 },
    { id: 'smoothie', name: 'Berry Smoothie', emoji: '🥤', ingredients: [{id:'strawberry',qty:2},{id:'blueberry',qty:2}], sellPrice: 750 },
    { id: 'pie', name: 'Apple Pie', emoji: '🥧', ingredients: [{id:'gandum',qty:3},{id:'strawberry',qty:3},{id:'madu',qty:1}], sellPrice: 900 },
    { id: 'sate', name: 'Sate Spesial', emoji: '🍢', ingredients: [{id:'bawang_merah',qty:3},{id:'bawang_putih',qty:2},{id:'cabai',qty:2}], sellPrice: 550 },

    // === RARE RECIPES (bahan langka, profit tinggi) ===
    { id: 'wine', name: 'Wine', emoji: '🍷', ingredients: [{id:'anggur',qty:5}], sellPrice: 1800 },
    { id: 'kopi_premium', name: 'Kopi Premium', emoji: '☕', ingredients: [{id:'kopi',qty:3},{id:'madu',qty:1}], sellPrice: 2200 },
    { id: 'cokelat', name: 'Cokelat Mewah', emoji: '🍫', ingredients: [{id:'kakao',qty:3},{id:'strawberry',qty:2}], sellPrice: 1600 },
    { id: 'buket', name: 'Buket Bunga', emoji: '💐', ingredients: [{id:'mawar',qty:2},{id:'sakura',qty:1},{id:'hibiscus',qty:1}], sellPrice: 3300 },
    { id: 'parfum', name: 'Parfum Sakura', emoji: '🧴', ingredients: [{id:'sakura',qty:2},{id:'mawar',qty:2}], sellPrice: 4500 },
    { id: 'minyak_zaitun', name: 'Minyak Zaitun', emoji: '🫒', ingredients: [{id:'zaitun',qty:3}], sellPrice: 4000 },
    { id: 'kue_cokelat', name: 'Chocolate Cake', emoji: '🎂', ingredients: [{id:'gandum',qty:3},{id:'kakao',qty:3},{id:'strawberry',qty:2}], sellPrice: 3000 },
    { id: 'wine_premium', name: 'Wine Premium', emoji: '🍾', ingredients: [{id:'anggur',qty:8},{id:'blueberry',qty:3}], sellPrice: 4200 },
    { id: 'teh_herbal', name: 'Teh Herbal', emoji: '🍵', ingredients: [{id:'kopi',qty:2},{id:'madu',qty:2},{id:'blueberry',qty:2}], sellPrice: 3500 },

    // === EPIC RECIPES (bahan sangat langka, profit besar) ===
    { id: 'ramuan', name: 'Ramuan Ajaib', emoji: '🧪', ingredients: [{id:'mystic_herb',qty:1},{id:'crystal_flower',qty:1}], sellPrice: 10000 },
    { id: 'essence_naga', name: 'Essence Naga', emoji: '🐉', ingredients: [{id:'dragon_fruit_crop',qty:2},{id:'ice_berry',qty:1}], sellPrice: 13000 },
    { id: 'elixir', name: 'Elixir of Life', emoji: '✨', ingredients: [{id:'mystic_herb',qty:1},{id:'lotus',qty:1},{id:'ice_berry',qty:1}], sellPrice: 16000 },
    { id: 'golden_jam', name: 'Golden Jam', emoji: '🫙', ingredients: [{id:'bunga_matahari',qty:3},{id:'madu',qty:2},{id:'strawberry',qty:3}], sellPrice: 5500 },
    { id: 'royal_soup', name: 'Royal Soup', emoji: '🍲', ingredients: [{id:'semangka',qty:1},{id:'wortel',qty:3},{id:'kentang',qty:3},{id:'bawang_putih',qty:2}], sellPrice: 6000 },
    { id: 'crystal_tea', name: 'Crystal Tea', emoji: '🫖', ingredients: [{id:'crystal_flower',qty:1},{id:'kopi',qty:2},{id:'madu',qty:2}], sellPrice: 9000 },
    { id: 'dragon_wine', name: 'Dragon Wine', emoji: '🐲', ingredients: [{id:'dragon_fruit_crop',qty:2},{id:'anggur',qty:5},{id:'madu',qty:2}], sellPrice: 15000 },

    // === LEGENDARY RECIPES (prestige crops, profit sangat besar) ===
    { id: 'phoenix_elixir', name: 'Phoenix Elixir', emoji: '🔥', ingredients: [{id:'phoenix_flower',qty:1},{id:'mystic_herb',qty:1},{id:'ice_berry',qty:1}], sellPrice: 35000 },
    { id: 'void_essence', name: 'Void Essence', emoji: '🌑', ingredients: [{id:'void_rose',qty:1},{id:'crystal_flower',qty:2}], sellPrice: 45000 },
    { id: 'celestial_potion', name: 'Celestial Potion', emoji: '⭐', ingredients: [{id:'celestial_tree',qty:1},{id:'lotus',qty:2},{id:'madu',qty:3}], sellPrice: 60000 },
    { id: 'time_essence', name: 'Time Essence', emoji: '⌛', ingredients: [{id:'time_blossom',qty:1},{id:'mystic_herb',qty:2},{id:'dragon_fruit_crop',qty:1}], sellPrice: 100000 },
    { id: 'lotus_perfume', name: 'Golden Lotus Perfume', emoji: '🪷', ingredients: [{id:'golden_lotus',qty:1},{id:'sakura',qty:3},{id:'mawar',qty:3}], sellPrice: 30000 },
];

const FARM_FERTILIZERS = [
    { id: 'none', name: 'Tanpa Pupuk', emoji: '❌', cost: 0, speedBonus: 0, yieldBonus: 0 },
    { id: 'pupuk_biasa', name: 'Pupuk Biasa', emoji: '💩', cost: 50, speedBonus: 0.20, yieldBonus: 0 },
    { id: 'pupuk_premium', name: 'Pupuk Premium', emoji: '✨', cost: 200, speedBonus: 0.40, yieldBonus: 0.20 },
    { id: 'pupuk_ajaib', name: 'Pupuk Ajaib', emoji: '🧪', cost: 500, speedBonus: 0.60, yieldBonus: 0.30 },
    { id: 'pupuk_legenda', name: 'Pupuk Legenda', emoji: '🌟', cost: 1500, speedBonus: 0.50, yieldBonus: 0.50 }
];

const FARM_DECORATIONS = [
    { id: 'scarecrow', name: 'Orang-orangan Sawah', emoji: '🧑‍🌾', price: 5000, desc: 'Melindungi tanaman dari hama' },
    { id: 'fountain', name: 'Air Mancur', emoji: '⛲', price: 10000, desc: 'Dekorasi mewah' },
    { id: 'windmill', name: 'Kincir Angin', emoji: '🏗️', price: 15000, desc: 'Menambah estetika kebun' },
    { id: 'flower_bed', name: 'Taman Bunga', emoji: '🌷', price: 8000, desc: 'Taman bunga cantik' },
    { id: 'bee_hive', name: 'Sarang Lebah', emoji: '🐝', price: 12000, desc: 'Menarik lebah penyerbuk' },
    { id: 'pond', name: 'Kolam Ikan', emoji: '🐟', price: 20000, desc: 'Kolam mini di kebun' },
    { id: 'greenhouse', name: 'Rumah Kaca', emoji: '🏠', price: 50000, desc: 'Rumah kaca premium' },
    { id: 'golden_statue', name: 'Patung Emas', emoji: '🗽', price: 100000, desc: 'Simbol kemewahan!' },
];

// ==================== FARM TOOLS (craftable gear) ====================
// One upgradeable tool (🛠️ Alat Tani). Each level adds a permanent harvest-yield
// bonus. Upgrades are crafted from crops in Storage + money (like a craft recipe).
const FARM_TOOLS = {
    name: 'Alat Tani',
    emoji: '🛠️',
    maxLevel: 5,
    yieldPerLevel: 0.08, // +8% harvest yield per level (max +40%)
    upgrades: [
        { to: 1, cost: 20000,   items: [{ id: 'gandum', qty: 40 }, { id: 'wortel', qty: 30 }] },
        { to: 2, cost: 80000,   items: [{ id: 'jagung', qty: 50 }, { id: 'tomat', qty: 30 }, { id: 'strawberry', qty: 20 }] },
        { to: 3, cost: 300000,  items: [{ id: 'anggur', qty: 40 }, { id: 'kopi', qty: 30 }, { id: 'madu', qty: 20 }] },
        { to: 4, cost: 900000,  items: [{ id: 'sakura', qty: 25 }, { id: 'zaitun', qty: 20 }, { id: 'crystal_flower', qty: 8 }] },
        { to: 5, cost: 2500000, items: [{ id: 'crystal_flower', qty: 20 }, { id: 'mystic_herb', qty: 15 }, { id: 'lotus', qty: 10 }] },
    ],
};

module.exports = { FARM_LEVELS, FARM_CROPS, FARM_RECIPES, FARM_FERTILIZERS, FARM_DECORATIONS, FARM_TOOLS };
