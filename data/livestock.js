// data/livestock.js — Livestock System Data (Kandang Ayam, Sapi, Domba)

// ==================== KANDANG LEVELS ====================
const COOP_LEVELS = [
    { level: 1, name: '🏚️ Kandang Sederhana', slots: 3, cost: 0 },
    { level: 2, name: '🪵 Kandang Kayu', slots: 5, cost: 8000 },
    { level: 3, name: '🧱 Kandang Bata', slots: 8, cost: 25000 },
    { level: 4, name: '🏠 Kandang Modern', slots: 12, cost: 80000 },
    { level: 5, name: '🏢 Kandang Premium', slots: 16, cost: 250000 },
    { level: 6, name: '👑 Kandang Emas', slots: 20, cost: 750000 },
    { level: 7, name: '💎 Kandang Diamond', slots: 25, cost: 1500000 },
];

const BARN_LEVELS = [
    { level: 1, name: '🏚️ Kandang Sederhana', slots: 3, cost: 0 },
    { level: 2, name: '🪵 Kandang Kayu', slots: 5, cost: 12000 },
    { level: 3, name: '🧱 Kandang Bata', slots: 8, cost: 40000 },
    { level: 4, name: '🏠 Kandang Modern', slots: 12, cost: 120000 },
    { level: 5, name: '🏢 Kandang Premium', slots: 16, cost: 350000 },
    { level: 6, name: '👑 Kandang Emas', slots: 20, cost: 900000 },
    { level: 7, name: '💎 Kandang Diamond', slots: 25, cost: 1500000 },
];

// ==================== ANIMAL TYPES ====================
// produceTime dihitung dynamic berdasarkan level + tier:
// actualTime = baseTime * (1 - (level * 0.007) - (tier * 0.06))
// Semakin tinggi level/tier, semakin cepat produksi
// Hasil random per collect (1-3 base, tier tinggi bisa 1-5)
const ANIMALS = {
    chicken: {
        id: 'chicken', name: 'Ayam', emoji: '🐔',
        price: 3000,
        product: { id: 'egg', name: 'Telur', emoji: '🥚' },
        baseProduceTime: 10 * 60 * 1000, // 10 menit base (lv1 tier0)
        minProduceTime: 3 * 60 * 1000,   // min 3 menit (lv100 tier10)
        baseYield: [2, 6],  // tier 0: 2-6 telur (normal only → 100-300/collect)
        maxYield: [3, 8],   // tier 10: 3-8 telur (mostly excellent/perfect → huge value)
        expPerCollect: 5,
        feedItem: 'chicken_feed', feedName: 'Pakan Ayam',
        medicineItem: 'chicken_medicine', medicineName: 'Obat Ayam',
        daysToSick: 5, daysTodie: 3, // 5 days no food → sick, 3 more days → dead (8 total)
    },
    cow: {
        id: 'cow', name: 'Sapi', emoji: '🐄',
        price: 10000,
        product: { id: 'milk', name: 'Susu', emoji: '🥛' },
        baseProduceTime: 15 * 60 * 1000, // 15 menit base
        minProduceTime: 5 * 60 * 1000,   // min 5 menit
        baseYield: [1, 4],  // tier 0: 1-4 susu
        maxYield: [3, 7],   // tier 10: 3-7 susu
        expPerCollect: 8,
        feedItem: 'cow_feed', feedName: 'Pakan Sapi',
        medicineItem: 'cow_medicine', medicineName: 'Obat Sapi',
        daysToSick: 5, daysTodie: 3,
    },
    sheep: {
        id: 'sheep', name: 'Domba', emoji: '🐑',
        price: 8000,
        product: { id: 'wool', name: 'Bulu', emoji: '🧶' },
        baseProduceTime: 20 * 60 * 1000, // 20 menit base
        minProduceTime: 7 * 60 * 1000,   // min 7 menit
        baseYield: [1, 4],  // tier 0: 1-4 bulu
        maxYield: [2, 6],   // tier 10: 2-6 bulu
        expPerCollect: 6,
        feedItem: 'sheep_feed', feedName: 'Pakan Domba',
        medicineItem: 'sheep_medicine', medicineName: 'Obat Domba',
        daysToSick: 5, daysTodie: 3,
    },
};

// Helper: hitung actual produce time berdasarkan level + tier
function getProduceTime(animalType, level, tier) {
    const def = ANIMALS[animalType];
    if (!def) return 10 * 60 * 1000;
    // Reduce time by level (0.7% per level) + tier (6% per tier)
    const reduction = Math.min(0.85, (level * 0.007) + (tier * 0.06));
    const time = Math.max(def.minProduceTime, def.baseProduceTime * (1 - reduction));
    return Math.floor(time);
}

// Helper: hitung random yield berdasarkan tier
function getYieldRange(animalType, tier) {
    const def = ANIMALS[animalType];
    if (!def) return [1, 2];
    const progress = Math.min(1, tier / 10); // 0 to 1
    const minY = Math.round(def.baseYield[0] + (def.maxYield[0] - def.baseYield[0]) * progress);
    const maxY = Math.round(def.baseYield[1] + (def.maxYield[1] - def.baseYield[1]) * progress);
    return [minY, maxY];
}

// ==================== EVOLUTION TIERS (max 10) ====================
// Every 10 levels = 1 evolution tier
const EVOLUTION_TIERS = [
    { tier: 0, name: 'Normal', emoji: '', levelReq: 0, cost: 0, feedPremiumReq: 0 },
    { tier: 1, name: 'Enhanced', emoji: '⭐', levelReq: 10, cost: 3000, feedPremiumReq: 2 },
    { tier: 2, name: 'Superior', emoji: '⭐⭐', levelReq: 20, cost: 6000, feedPremiumReq: 4 },
    { tier: 3, name: 'Excellent', emoji: '⭐⭐⭐', levelReq: 30, cost: 12000, feedPremiumReq: 6 },
    { tier: 4, name: 'Refined', emoji: '🌟', levelReq: 40, cost: 20000, feedPremiumReq: 8 },
    { tier: 5, name: 'Premium', emoji: '🌟🌟', levelReq: 50, cost: 35000, feedPremiumReq: 10 },
    { tier: 6, name: 'Elite', emoji: '🌟🌟🌟', levelReq: 60, cost: 55000, feedPremiumReq: 13 },
    { tier: 7, name: 'Master', emoji: '💫', levelReq: 70, cost: 80000, feedPremiumReq: 16 },
    { tier: 8, name: 'Grand Master', emoji: '💫💫', levelReq: 80, cost: 120000, feedPremiumReq: 20 },
    { tier: 9, name: 'Legendary', emoji: '👑', levelReq: 90, cost: 180000, feedPremiumReq: 25 },
    { tier: 10, name: 'Divine', emoji: '👑💎', levelReq: 100, cost: 300000, feedPremiumReq: 30 },
];

// ==================== PRODUCT QUALITY ====================
// Tier determines which qualities are UNLOCKED + chance
// Tier 0: only normal (yield banyak → total 100-3000/collect)
// Tier 1: normal + premium (total 3000-8000/collect)
// Tier 2: normal + premium + superior (total 5000-15000)
// Tier 3-4: up to excellent (total 10000-40000)
// Tier 5+: up to perfect (total 20000-100000+)
function getQualityChance(tier) {
    if (tier <= 0) return [
        { quality: 'normal', chance: 100 },
    ];
    if (tier === 1) return [
        { quality: 'normal', chance: 70 },
        { quality: 'premium', chance: 30 },
    ];
    if (tier === 2) return [
        { quality: 'normal', chance: 50 },
        { quality: 'premium', chance: 35 },
        { quality: 'superior', chance: 15 },
    ];
    if (tier === 3) return [
        { quality: 'normal', chance: 30 },
        { quality: 'premium', chance: 35 },
        { quality: 'superior', chance: 25 },
        { quality: 'excellent', chance: 10 },
    ];
    if (tier === 4) return [
        { quality: 'normal', chance: 20 },
        { quality: 'premium', chance: 30 },
        { quality: 'superior', chance: 30 },
        { quality: 'excellent', chance: 18 },
        { quality: 'perfect', chance: 2 },
    ];
    if (tier === 5) return [
        { quality: 'normal', chance: 10 },
        { quality: 'premium', chance: 25 },
        { quality: 'superior', chance: 30 },
        { quality: 'excellent', chance: 25 },
        { quality: 'perfect', chance: 10 },
    ];
    if (tier === 6) return [
        { quality: 'normal', chance: 5 },
        { quality: 'premium', chance: 15 },
        { quality: 'superior', chance: 30 },
        { quality: 'excellent', chance: 35 },
        { quality: 'perfect', chance: 15 },
    ];
    if (tier === 7) return [
        { quality: 'normal', chance: 3 },
        { quality: 'premium', chance: 10 },
        { quality: 'superior', chance: 25 },
        { quality: 'excellent', chance: 40 },
        { quality: 'perfect', chance: 22 },
    ];
    if (tier === 8) return [
        { quality: 'normal', chance: 2 },
        { quality: 'premium', chance: 8 },
        { quality: 'superior', chance: 20 },
        { quality: 'excellent', chance: 40 },
        { quality: 'perfect', chance: 30 },
    ];
    if (tier === 9) return [
        { quality: 'normal', chance: 1 },
        { quality: 'premium', chance: 5 },
        { quality: 'superior', chance: 15 },
        { quality: 'excellent', chance: 40 },
        { quality: 'perfect', chance: 39 },
    ];
    // tier 10
    return [
        { quality: 'normal', chance: 0 },
        { quality: 'premium', chance: 3 },
        { quality: 'superior', chance: 12 },
        { quality: 'excellent', chance: 40 },
        { quality: 'perfect', chance: 45 },
    ];
}

const PRODUCT_QUALITY = {
    egg: [
        { quality: 'normal', name: '⚪ Telur Normal', price: 50 },
        { quality: 'premium', name: '🟡 Telur Premium', price: 100 },
        { quality: 'superior', name: '🟠 Telur Superior', price: 500 },
        { quality: 'excellent', name: '🔴 Telur Excellent', price: 2000 },
        { quality: 'perfect', name: '💎 Telur Perfect', price: 10000 },
    ],
    milk: [
        { quality: 'normal', name: '⚪ Susu Normal', price: 70 },
        { quality: 'premium', name: '🟡 Susu Premium', price: 150 },
        { quality: 'superior', name: '🟠 Susu Superior', price: 700 },
        { quality: 'excellent', name: '🔴 Susu Excellent', price: 3000 },
        { quality: 'perfect', name: '💎 Susu Perfect', price: 15000 },
    ],
    wool: [
        { quality: 'normal', name: '⚪ Bulu Normal', price: 60 },
        { quality: 'premium', name: '🟡 Bulu Premium', price: 120 },
        { quality: 'superior', name: '🟠 Bulu Superior', price: 600 },
        { quality: 'excellent', name: '🔴 Bulu Excellent', price: 2500 },
        { quality: 'perfect', name: '💎 Bulu Perfect', price: 12000 },
    ],
};

// ==================== SHOP ITEMS ====================
const COOP_SHOP = [
    { id: 'chicken', name: '🐔 Ayam', price: 3000, desc: 'Beli ayam baru', type: 'animal' },
    { id: 'chicken_feed', name: '🌾 Pakan Ayam (x10)', price: 600, qty: 10, desc: '1 pack = 1 hari/ayam', type: 'feed' },
    { id: 'chicken_feed_bulk', name: '🌾 Pakan Ayam (x50)', price: 2500, qty: 50, desc: 'Bulk discount', type: 'feed' },
    { id: 'chicken_medicine', name: '💊 Obat Ayam', price: 250, qty: 1, desc: 'Menyembuhkan 1 ayam sakit', type: 'medicine' },
    { id: 'premium_feed', name: '⭐ Pakan Premium', price: 1200, qty: 1, desc: 'Material evolution hewan', type: 'evolution' },
    { id: 'chicken_vitamin', name: '💉 Vitamin Ayam', price: 800, qty: 1, desc: '+20% produksi 24 jam', type: 'booster' },
];

const BARN_SHOP = [
    { id: 'cow', name: '🐄 Sapi', price: 10000, desc: 'Beli sapi baru', type: 'animal' },
    { id: 'sheep', name: '🐑 Domba', price: 8000, desc: 'Beli domba baru', type: 'animal' },
    { id: 'cow_feed', name: '🌾 Pakan Sapi (x10)', price: 900, qty: 10, desc: '1 pack = 1 hari/sapi', type: 'feed' },
    { id: 'cow_feed_bulk', name: '🌾 Pakan Sapi (x50)', price: 3800, qty: 50, desc: 'Bulk discount', type: 'feed' },
    { id: 'sheep_feed', name: '🌾 Pakan Domba (x10)', price: 700, qty: 10, desc: '1 pack = 1 hari/domba', type: 'feed' },
    { id: 'sheep_feed_bulk', name: '🌾 Pakan Domba (x50)', price: 3000, qty: 50, desc: 'Bulk discount', type: 'feed' },
    { id: 'cow_medicine', name: '💊 Obat Sapi', price: 400, qty: 1, desc: 'Menyembuhkan 1 sapi sakit', type: 'medicine' },
    { id: 'sheep_medicine', name: '💊 Obat Domba', price: 350, qty: 1, desc: 'Menyembuhkan 1 domba sakit', type: 'medicine' },
    { id: 'premium_feed', name: '⭐ Pakan Premium', price: 1200, qty: 1, desc: 'Material evolution hewan', type: 'evolution' },
    { id: 'barn_vitamin', name: '💉 Vitamin Ternak', price: 1500, qty: 1, desc: '+20% produksi semua 24 jam', type: 'booster' },
];

// ==================== LIVESTOCK CRAFTING RECIPES ====================
const LIVESTOCK_RECIPES = [
    // Telur recipes
    { id: 'roti_telur', name: 'Roti Telur', emoji: '🍳', ingredients: [{ id: 'gandum', qty: 3, source: 'farm' }, { id: 'egg_normal', qty: 3, source: 'livestock' }], sellPrice: 250 },
    { id: 'kue_telur', name: 'Kue Telur Premium', emoji: '🧁', ingredients: [{ id: 'gandum', qty: 4, source: 'farm' }, { id: 'egg_premium', qty: 2, source: 'livestock' }, { id: 'strawberry', qty: 2, source: 'farm' }], sellPrice: 600 },
    { id: 'omelette', name: 'Omelette Spesial', emoji: '🍳', ingredients: [{ id: 'egg_superior', qty: 2, source: 'livestock' }, { id: 'tomat', qty: 2, source: 'farm' }, { id: 'bawang_merah', qty: 2, source: 'farm' }], sellPrice: 900 },
    { id: 'royal_cake', name: 'Royal Cake', emoji: '🎂', ingredients: [{ id: 'egg_excellent', qty: 3, source: 'livestock' }, { id: 'gandum', qty: 5, source: 'farm' }, { id: 'madu', qty: 2, source: 'farm' }], sellPrice: 3500 },

    // Susu recipes
    { id: 'cokelat_susu', name: 'Cokelat Susu', emoji: '🍫', ingredients: [{ id: 'kakao', qty: 3, source: 'farm' }, { id: 'milk_normal', qty: 3, source: 'livestock' }], sellPrice: 400 },
    { id: 'keju', name: 'Keju Artisan', emoji: '🧀', ingredients: [{ id: 'milk_premium', qty: 5, source: 'livestock' }], sellPrice: 800 },
    { id: 'ice_cream', name: 'Ice Cream Mewah', emoji: '🍨', ingredients: [{ id: 'milk_superior', qty: 3, source: 'livestock' }, { id: 'strawberry', qty: 3, source: 'farm' }, { id: 'madu', qty: 1, source: 'farm' }], sellPrice: 1500 },
    { id: 'yogurt_premium', name: 'Yogurt Premium', emoji: '🥛', ingredients: [{ id: 'milk_excellent', qty: 2, source: 'livestock' }, { id: 'blueberry', qty: 3, source: 'farm' }], sellPrice: 2800 },

    // Bulu recipes
    { id: 'benang', name: 'Benang Halus', emoji: '🧵', ingredients: [{ id: 'wool_normal', qty: 5, source: 'livestock' }], sellPrice: 300 },
    { id: 'kain_premium', name: 'Kain Premium', emoji: '🧣', ingredients: [{ id: 'wool_premium', qty: 4, source: 'livestock' }], sellPrice: 650 },
    { id: 'sweater', name: 'Sweater Handmade', emoji: '🧥', ingredients: [{ id: 'wool_superior', qty: 5, source: 'livestock' }, { id: 'wool_premium', qty: 3, source: 'livestock' }], sellPrice: 2000 },
    { id: 'royal_carpet', name: 'Karpet Kerajaan', emoji: '🪄', ingredients: [{ id: 'wool_excellent', qty: 4, source: 'livestock' }, { id: 'mawar', qty: 2, source: 'farm' }], sellPrice: 4000 },

    // Cross-product recipes (high value)
    { id: 'breakfast_deluxe', name: 'Breakfast Deluxe', emoji: '🍽️', ingredients: [{ id: 'egg_premium', qty: 3, source: 'livestock' }, { id: 'milk_premium', qty: 2, source: 'livestock' }, { id: 'gandum', qty: 3, source: 'farm' }], sellPrice: 1200 },
    { id: 'golden_feast', name: 'Golden Feast', emoji: '👑', ingredients: [{ id: 'egg_excellent', qty: 2, source: 'livestock' }, { id: 'milk_excellent', qty: 2, source: 'livestock' }, { id: 'wool_excellent', qty: 1, source: 'livestock' }, { id: 'kopi', qty: 2, source: 'farm' }], sellPrice: 8000 },
    { id: 'divine_elixir', name: 'Divine Farm Elixir', emoji: '✨', ingredients: [{ id: 'egg_perfect', qty: 1, source: 'livestock' }, { id: 'milk_perfect', qty: 1, source: 'livestock' }, { id: 'mystic_herb', qty: 1, source: 'farm' }], sellPrice: 20000 },
];

// ==================== SEASON SYSTEM ====================
// Rotates daily at 00:00 WIB, cycle = 4 days
const SEASONS = [
    {
        id: 'spring', name: 'Musim Semi', emoji: '🌸',
        desc: 'Cuaca cerah dan subur — ideal untuk bertani!',
        effects: {
            farmGrow: 1.2, farmYield: 1.1, farmDeath: 0.8,
            chickenProd: 1.0, cowProd: 1.0, sheepProd: 1.0,
            sickChance: 0.02, pestChance: 0.05,
        }
    },
    {
        id: 'summer', name: 'Kemarau', emoji: '☀️',
        desc: 'Panas terik — hewan butuh pakan ekstra, tanaman cepat tumbuh.',
        effects: {
            farmGrow: 1.1, farmYield: 1.0, farmDeath: 1.1,
            chickenProd: 0.8, cowProd: 0.85, sheepProd: 0.9,
            sickChance: 0.04, pestChance: 0.10, // hama lebih sering
            feedMultiplier: 2, // butuh 2x pakan
        }
    },
    {
        id: 'autumn', name: 'Musim Gugur', emoji: '🍂',
        desc: 'Musim panen — produksi hewan meningkat.',
        effects: {
            farmGrow: 1.0, farmYield: 1.15, farmDeath: 0.9,
            chickenProd: 1.1, cowProd: 1.2, sheepProd: 1.25,
            sickChance: 0.02, pestChance: 0.03,
            mutationBonus: 0.15, // +15% chance mutation tanaman
        }
    },
    {
        id: 'winter', name: 'Musim Dingin', emoji: '❄️',
        desc: 'Dingin menusuk — produksi turun drastis, hewan mudah sakit.',
        effects: {
            farmGrow: 0.7, farmYield: 0.85, farmDeath: 1.15,
            chickenProd: 0.6, cowProd: 0.7, sheepProd: 0.75,
            sickChance: 0.12, pestChance: 0.02, // hama sedikit tapi penyakit banyak
            wabahChance: 0.05, // 5% chance wabah menyerang seluruh kandang
        }
    },
];

// ==================== PEST/DISEASE for LIVESTOCK ====================
const LIVESTOCK_DISEASES = [
    { id: 'flu', name: 'Flu Burung', emoji: '🤧', affects: ['chicken'], severity: 'mild', prodReduction: 0.5 },
    { id: 'parasite', name: 'Parasit', emoji: '🪱', affects: ['chicken', 'cow', 'sheep'], severity: 'mild', prodReduction: 0.3 },
    { id: 'fever', name: 'Demam', emoji: '🤒', affects: ['cow', 'sheep'], severity: 'mild', prodReduction: 0.4 },
    { id: 'wabah', name: 'Wabah', emoji: '☠️', affects: ['chicken', 'cow', 'sheep'], severity: 'severe', prodReduction: 0.8 },
    { id: 'heatstroke', name: 'Heat Stroke', emoji: '🥵', affects: ['cow', 'sheep'], severity: 'mild', prodReduction: 0.5, season: 'summer' },
    { id: 'frostbite', name: 'Frostbite', emoji: '🥶', affects: ['chicken'], severity: 'mild', prodReduction: 0.6, season: 'winter' },
];

const LIVESTOCK_PESTS = [
    { id: 'rat', name: 'Tikus', emoji: '🐀', affects: ['chicken'], damage: 'steal_product', desc: 'Mencuri telur!' },
    { id: 'fox_pest', name: 'Rubah Liar', emoji: '🦊', affects: ['chicken'], damage: 'kill_animal', desc: 'Menyerang ayam! (bisa dicegah dengan kandang level 3+)' },
    { id: 'wolf_pest', name: 'Serigala', emoji: '🐺', affects: ['sheep'], damage: 'kill_animal', desc: 'Menyerang domba! (bisa dicegah dengan kandang level 4+)' },
    { id: 'insect', name: 'Kutu', emoji: '🪳', affects: ['cow', 'sheep'], damage: 'reduce_quality', desc: 'Menurunkan quality produk' },
];

module.exports = {
    COOP_LEVELS, BARN_LEVELS, ANIMALS, EVOLUTION_TIERS,
    getQualityChance, PRODUCT_QUALITY, getProduceTime, getYieldRange,
    COOP_SHOP, BARN_SHOP, LIVESTOCK_RECIPES,
    SEASONS, LIVESTOCK_DISEASES, LIVESTOCK_PESTS,
};
