// systems/livestock.js — Livestock Logic (Kandang Ayam, Sapi, Domba)
const { db, getOrCreateUser, getItemCount, removeItem } = require('../database');
const { ANIMALS, COOP_LEVELS, BARN_LEVELS, EVOLUTION_TIERS, getQualityChance, PRODUCT_QUALITY, LIVESTOCK_PESTS } = require('../data/livestock');
const { getSeasonProductionMultiplier, getSeasonSickChance, getSeasonPestChance, getSeasonFeedMultiplier } = require('./farmSeason');

// ==================== DATABASE SETUP ====================
db.exec(`CREATE TABLE IF NOT EXISTS livestock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    animalType TEXT,
    level INTEGER DEFAULT 1,
    exp INTEGER DEFAULT 0,
    tier INTEGER DEFAULT 0,
    status TEXT DEFAULT 'healthy',
    lastFed TEXT,
    lastCollect INTEGER,
    sickSince INTEGER,
    createdAt INTEGER,
    diesAt INTEGER
)`);

// Migrations
try { db.exec(`ALTER TABLE livestock ADD COLUMN diesAt INTEGER`); } catch(e) {}
try { db.exec(`ALTER TABLE livestock ADD COLUMN name TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE livestock ADD COLUMN rarity TEXT DEFAULT 'normal'`); } catch(e) {}

db.exec(`CREATE TABLE IF NOT EXISTS livestock_data (
    userId TEXT,
    key TEXT,
    value TEXT,
    PRIMARY KEY(userId, key)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS livestock_products (
    userId TEXT,
    productId TEXT,
    quality TEXT,
    quantity INTEGER DEFAULT 0,
    PRIMARY KEY(userId, productId, quality)
)`);

// ==================== DATA HELPERS ====================
function getLivestockData(userId, key, defaultVal = null) {
    const row = db.prepare('SELECT value FROM livestock_data WHERE userId = ? AND key = ?').get(userId, key);
    return row ? row.value : defaultVal;
}

function setLivestockData(userId, key, value) {
    db.prepare('INSERT OR REPLACE INTO livestock_data (userId, key, value) VALUES (?, ?, ?)').run(userId, key, String(value));
}

function getCoopLevel(userId) {
    return parseInt(getLivestockData(userId, 'coop_level', '1')) || 1;
}

function getBarnLevel(userId) {
    return parseInt(getLivestockData(userId, 'barn_level', '1')) || 1;
}

function getCoopSlots(userId) {
    const level = getCoopLevel(userId);
    return COOP_LEVELS.find(l => l.level === level)?.slots || 3;
}

function getBarnSlots(userId) {
    const level = getBarnLevel(userId);
    return BARN_LEVELS.find(l => l.level === level)?.slots || 3;
}

// ==================== ANIMAL MANAGEMENT ====================
function getAnimals(userId, type) {
    const animals = db.prepare('SELECT * FROM livestock WHERE userId = ? AND animalType = ?').all(userId, type);
    // Check lifespan — auto-kill expired animals
    const now = Date.now();
    for (const animal of animals) {
        if (animal.diesAt && animal.status !== 'dead' && now >= animal.diesAt) {
            db.prepare('UPDATE livestock SET status = ? WHERE id = ?').run('dead', animal.id);
            animal.status = 'dead';
        }
    }
    return animals;
}

function getAllAnimals(userId) {
    const animals = db.prepare('SELECT * FROM livestock WHERE userId = ?').all(userId);
    const now = Date.now();
    for (const animal of animals) {
        if (animal.diesAt && animal.status !== 'dead' && now >= animal.diesAt) {
            db.prepare('UPDATE livestock SET status = ? WHERE id = ?').run('dead', animal.id);
            animal.status = 'dead';
        }
    }
    return animals;
}

function buyAnimal(userId, type) {
    const animal = ANIMALS[type];
    if (!animal) return { error: 'Invalid animal type' };

    const user = getOrCreateUser(null, userId);
    if (user.balance < animal.price) return { error: `Saldo kurang! Butuh 🪙 ${animal.price.toLocaleString('id-ID')}` };

    // Check slot
    const current = getAnimals(userId, type);
    let maxSlots;
    if (type === 'chicken') {
        maxSlots = getCoopSlots(userId);
        if (current.length >= maxSlots) return { error: `Kandang penuh! (${current.length}/${maxSlots}) Upgrade kandang dulu.` };
    } else {
        maxSlots = getBarnSlots(userId);
        const barnAnimals = db.prepare("SELECT * FROM livestock WHERE userId = ? AND animalType IN ('cow', 'sheep')").all(userId);
        if (barnAnimals.length >= maxSlots) return { error: `Kandang penuh! (${barnAnimals.length}/${maxSlots}) Upgrade kandang dulu.` };
    }

    // Deduct money
    db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?').run(animal.price, userId);

    // Create animal with random lifespan (2-20 days, secret — player doesn't know)
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const lifespanDays = Math.floor(Math.random() * 19) + 2; // 2-20 days
    const diesAt = Date.now() + (lifespanDays * 24 * 60 * 60 * 1000);

    // 5% chance Golden, 1% chance Diamond (rare animals produce faster)
    const rarityRoll = Math.random() * 100;
    let rarity = 'normal';
    if (rarityRoll < 1) rarity = 'diamond';
    else if (rarityRoll < 6) rarity = 'golden';

    db.prepare('INSERT INTO livestock (userId, animalType, level, exp, tier, status, lastFed, lastCollect, createdAt, diesAt, rarity) VALUES (?, ?, 1, 0, 0, ?, ?, ?, ?, ?, ?)').run(userId, type, 'healthy', String(Date.now()), Date.now(), Date.now(), diesAt, rarity);

    const rarityMsg = rarity === 'diamond' ? ' 💎 **DIAMOND!** (3x produksi!)' : rarity === 'golden' ? ' ✨ **GOLDEN!** (2x produksi!)' : '';
    return { success: true, type, price: animal.price, rarity, rarityMsg };
}

function upgradeCoopLevel(userId) {
    const currentLevel = getCoopLevel(userId);
    const nextLevel = COOP_LEVELS.find(l => l.level === currentLevel + 1);
    if (!nextLevel) return { error: 'Kandang sudah level maximum!' };

    const user = getOrCreateUser(null, userId);
    if (user.balance < nextLevel.cost) return { error: `Saldo kurang! Butuh 🪙 ${nextLevel.cost.toLocaleString('id-ID')}` };

    db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?').run(nextLevel.cost, userId);
    setLivestockData(userId, 'coop_level', String(currentLevel + 1));
    return { success: true, newLevel: currentLevel + 1, name: nextLevel.name, slots: nextLevel.slots };
}

function upgradeBarnLevel(userId) {
    const currentLevel = getBarnLevel(userId);
    const nextLevel = BARN_LEVELS.find(l => l.level === currentLevel + 1);
    if (!nextLevel) return { error: 'Kandang sudah level maximum!' };

    const user = getOrCreateUser(null, userId);
    if (user.balance < nextLevel.cost) return { error: `Saldo kurang! Butuh 🪙 ${nextLevel.cost.toLocaleString('id-ID')}` };

    db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?').run(nextLevel.cost, userId);
    setLivestockData(userId, 'barn_level', String(currentLevel + 1));
    return { success: true, newLevel: currentLevel + 1, name: nextLevel.name, slots: nextLevel.slots };
}

// ==================== PRODUCTION ====================
function collectProducts(userId, animalType) {
    const animals = getAnimals(userId, animalType).filter(a => a.status !== 'dead');
    if (animals.length === 0) return { error: 'Tidak ada hewan yang bisa di-collect!' };

    const animalDef = ANIMALS[animalType];
    const { getProduceTime, getYieldRange, getQualityChance } = require('../data/livestock');
    const seasonMult = getSeasonProductionMultiplier(animalType);
    const now = Date.now();
    let totalCollected = 0;
    let totalExp = 0;
    const products = {};

    for (const animal of animals) {
        if (animal.status === 'sick') continue;
        // Skip hungry animals (hunger 0% = no production)
        const hunger = getHungerPercent(animal);
        if (hunger <= 0) continue;

        // Calculate produce time based on level + tier
        const produceTime = getProduceTime(animalType, animal.level, animal.tier) / seasonMult;
        const elapsed = now - (animal.lastCollect || animal.createdAt);

        // Check if enough time has passed for at least 1 produce cycle
        if (elapsed < produceTime) continue;

        // Random yield based on tier (like tanaman)
        const [minY, maxY] = getYieldRange(animalType, animal.tier);
        let yieldCount = Math.floor(Math.random() * (maxY - minY + 1)) + minY;

        // Rarity bonus: Golden = 2x, Diamond = 3x yield
        if (animal.rarity === 'golden') yieldCount *= 2;
        else if (animal.rarity === 'diamond') yieldCount *= 3;

        // Roll quality for each product
        const qualityChances = getQualityChance(animal.tier);
        for (let i = 0; i < yieldCount; i++) {
            const roll = Math.random() * 100;
            let cumulative = 0;
            let quality = 'normal';
            for (const qc of qualityChances) {
                cumulative += qc.chance;
                if (roll <= cumulative) { quality = qc.quality; break; }
            }
            const productKey = `${animalDef.product.id}_${quality}`;
            products[productKey] = (products[productKey] || 0) + 1;
            totalCollected++;
        }

        // Add EXP (faster leveling: level * 10 EXP needed)
        const expGain = animalDef.expPerCollect * yieldCount;
        const newExp = animal.exp + expGain;
        const expNeeded = animal.level * 10;
        let newLevel = animal.level;
        let remainExp = newExp;

        while (remainExp >= newLevel * 10 && newLevel < 100) {
            remainExp -= newLevel * 10;
            newLevel++;
        }

        totalExp += expGain;
        db.prepare('UPDATE livestock SET lastCollect = ?, exp = ?, level = ? WHERE id = ?').run(now, remainExp, newLevel, animal.id);
    }

    // Store products in farm_storage (same table as tanaman harvest)
    // farm_storage uses column 'itemId' not 'cropId'
    for (const [key, qty] of Object.entries(products)) {
        const existing = db.prepare('SELECT quantity FROM farm_storage WHERE userId = ? AND itemId = ?').get(userId, key);
        if (existing) {
            db.prepare('UPDATE farm_storage SET quantity = quantity + ? WHERE userId = ? AND itemId = ?').run(qty, userId, key);
        } else {
            db.prepare('INSERT INTO farm_storage (userId, itemId, quantity) VALUES (?, ?, ?)').run(userId, key, qty);
        }
    }

    // Track stat for leaderboard
    if (totalCollected > 0) {
        const { incrementUserStat } = require('../database');
        const statKey = animalType === 'chicken' ? 'total_eggs_collected' : animalType === 'cow' ? 'total_milk_collected' : 'total_wool_collected';
        incrementUserStat(null, userId, statKey, totalCollected);
    }

    return { success: true, totalCollected, totalExp, products };
}

// Livestock products are stored in farm_storage (keys like 'egg_premium'), the same
// place collectProducts writes them. The legacy livestock_products table is unused.
function getStorageProducts(userId) {
    return db.prepare("SELECT itemId, quantity FROM farm_storage WHERE userId = ? AND quantity > 0 AND (itemId LIKE 'egg_%' OR itemId LIKE 'milk_%' OR itemId LIKE 'wool_%')").all(userId);
}

function sellAllProducts(userId) {
    const rows = getStorageProducts(userId);
    if (rows.length === 0) return { error: 'Tidak ada produk untuk dijual!' };

    let totalPrice = 0;
    for (const r of rows) {
        const lastU = r.itemId.lastIndexOf('_');
        const productId = r.itemId.substring(0, lastU);
        const quality = r.itemId.substring(lastU + 1);
        const qualityData = PRODUCT_QUALITY[productId]?.find(q => q.quality === quality);
        if (qualityData) totalPrice += qualityData.price * r.quantity;
    }

    db.prepare("DELETE FROM farm_storage WHERE userId = ? AND (itemId LIKE 'egg_%' OR itemId LIKE 'milk_%' OR itemId LIKE 'wool_%')").run(userId);
    db.prepare('UPDATE users SET balance = balance + ? WHERE userId = ?').run(totalPrice, userId);

    return { success: true, totalPrice, itemsSold: rows.length };
}

// ==================== FEEDING ====================
// Hunger system: setiap ayam punya hunger% yang turun seiring waktu
// lastFed = timestamp terakhir dikasih makan
// Hunger turun ~10% per jam (full → 0% dalam 10 jam)
// Feed mengembalikan hunger ke 100%
// Jika hunger 0% selama 3 hari → sakit

function getHungerPercent(animal) {
    if (!animal.lastFed) return 0;
    const lastFedTime = typeof animal.lastFed === 'string' 
        ? (isNaN(Number(animal.lastFed)) ? new Date(animal.lastFed).getTime() : parseInt(animal.lastFed))
        : parseInt(animal.lastFed);
    if (isNaN(lastFedTime)) return 0;
    const elapsed = Date.now() - lastFedTime;
    const hoursElapsed = elapsed / (1000 * 60 * 60);
    // Turun 5% per jam (full → 0% dalam 20 jam) — lebih forgiving
    const hunger = Math.max(0, Math.floor(100 - (hoursElapsed * 5)));
    return hunger;
}

// Fungsi untuk kubur hewan mati (hapus dari DB, bebaskan slot)
function buryAllDead(userId) {
    const dead = db.prepare("SELECT * FROM livestock WHERE userId = ? AND status = 'dead'").all(userId);
    if (dead.length === 0) return { error: 'Tidak ada hewan mati!' };
    db.prepare("DELETE FROM livestock WHERE userId = ? AND status = 'dead'").run(userId);
    return { success: true, count: dead.length };
}

function feedAnimals(userId, animalType) {
    const animals = getAnimals(userId, animalType).filter(a => a.status !== 'dead');
    if (animals.length === 0) return { error: 'Tidak ada hewan untuk diberi makan!' };

    const animalDef = ANIMALS[animalType];
    const feedMultiplier = getSeasonFeedMultiplier();
    const feedNeeded = Math.ceil(animals.length * feedMultiplier);
    const feedCount = getItemCount(null, userId, animalDef.feedItem);

    if (feedCount < feedNeeded) return { error: `Pakan kurang! Butuh ${feedNeeded}, punya ${feedCount}. (Season: x${feedMultiplier} pakan)` };

    removeItem(null, userId, animalDef.feedItem, feedNeeded);
    const nowTimestamp = String(Date.now());

    for (const animal of animals) {
        db.prepare('UPDATE livestock SET lastFed = ? WHERE id = ?').run(nowTimestamp, animal.id);
    }

    return { success: true, fed: animals.length, feedUsed: feedNeeded };
}

// ==================== HEALING ====================
function healAll(userId, animalType) {
    const sickAnimals = getAnimals(userId, animalType).filter(a => a.status === 'sick');
    if (sickAnimals.length === 0) return { error: 'Tidak ada hewan yang sakit!' };

    const animalDef = ANIMALS[animalType];
    const medCount = getItemCount(null, userId, animalDef.medicineItem);
    if (medCount < sickAnimals.length) return { error: `Butuh ${sickAnimals.length} ${animalDef.medicineName}, punya ${medCount}` };

    removeItem(null, userId, animalDef.medicineItem, sickAnimals.length);
    for (const animal of sickAnimals) {
        db.prepare('UPDATE livestock SET status = ?, sickSince = NULL WHERE id = ?').run('healthy', animal.id);
    }

    return { success: true, healed: sickAnimals.length };
}

// ==================== EVOLUTION ====================
function evolveAnimal(userId, animalId) {
    const animal = db.prepare('SELECT * FROM livestock WHERE id = ? AND userId = ?').get(animalId, userId);
    if (!animal) return { error: 'Hewan tidak ditemukan!' };

    const nextTier = EVOLUTION_TIERS.find(t => t.tier === animal.tier + 1);
    if (!nextTier) return { error: 'Sudah tier maximum! (Tier 10)' };
    if (animal.level < nextTier.levelReq) return { error: `Butuh level ${nextTier.levelReq}! (Sekarang: Lv.${animal.level})` };

    const user = getOrCreateUser(null, userId);
    if (user.balance < nextTier.cost) return { error: `Saldo kurang! Butuh 🪙 ${nextTier.cost.toLocaleString('id-ID')}` };

    const premiumFeedCount = getItemCount(null, userId, 'premium_feed');
    if (premiumFeedCount < nextTier.feedPremiumReq) return { error: `Butuh ⭐ Pakan Premium x${nextTier.feedPremiumReq}! (Punya: ${premiumFeedCount})` };

    // Deduct
    db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?').run(nextTier.cost, userId);
    removeItem(null, userId, 'premium_feed', nextTier.feedPremiumReq);
    db.prepare('UPDATE livestock SET tier = ? WHERE id = ?').run(nextTier.tier, animalId);

    return { success: true, animalId, newTier: nextTier.tier, tierName: nextTier.name, tierEmoji: nextTier.emoji };
}

// Parse a stored timestamp that may be a ms-epoch string ("1700000000000"),
// a numeric epoch, or a date string. Returns ms epoch or null.
function parseLastFed(lastFed) {
    if (!lastFed) return null;
    if (typeof lastFed === 'number') return lastFed;
    const n = Number(lastFed);
    if (!isNaN(n)) return n;            // ms-epoch string (how feed/buy stores it)
    const t = new Date(lastFed).getTime();
    return isNaN(t) ? null : t;
}

// ==================== DAILY TICK (called once per day) ====================
function processDailyLivestock(userId) {
    const animals = getAllAnimals(userId).filter(a => a.status !== 'dead');
    const sickChance = getSeasonSickChance();
    const results = { sick: 0, died: 0, pests: [] };

    for (const animal of animals) {
        const animalDef = ANIMALS[animal.animalType];
        if (!animalDef) continue;

        // Days since last fed. lastFed is stored as a ms-epoch string, so it MUST be
        // parsed numerically — `new Date("1700000000000")` is Invalid Date and used to
        // silently break this whole starvation check.
        const lastFedMs = parseLastFed(animal.lastFed);
        const daysSinceLastFed = lastFedMs ? Math.floor((Date.now() - lastFedMs) / (1000 * 60 * 60 * 24)) : 999;

        if (animal.status === 'healthy') {
            // Not fed for daysToSick → becomes sick
            if (daysSinceLastFed >= animalDef.daysToSick) {
                db.prepare('UPDATE livestock SET status = ?, sickSince = ? WHERE id = ?').run('sick', Date.now(), animal.id);
                results.sick++;
            }
            // Random season sickness
            else if (Math.random() < sickChance) {
                db.prepare('UPDATE livestock SET status = ?, sickSince = ? WHERE id = ?').run('sick', Date.now(), animal.id);
                results.sick++;
            }
        } else if (animal.status === 'sick') {
            // Sick for daysTodie → dies
            const daysSick = animal.sickSince ? Math.floor((Date.now() - animal.sickSince) / (1000 * 60 * 60 * 24)) : 0;
            if (daysSick >= animalDef.daysTodie) {
                db.prepare('UPDATE livestock SET status = ? WHERE id = ?').run('dead', animal.id);
                results.died++;
            }
        }
    }

    // Pest check
    const pestChance = getSeasonPestChance();
    if (Math.random() < pestChance) {
        const possiblePests = LIVESTOCK_PESTS.filter(p => {
            const userAnimals = animals.map(a => a.animalType);
            return p.affects.some(t => userAnimals.includes(t));
        });
        if (possiblePests.length > 0) {
            const pest = possiblePests[Math.floor(Math.random() * possiblePests.length)];
            results.pests.push(pest);
            // Apply pest damage
            if (pest.damage === 'steal_product') {
                // Steal collected normal eggs (products live in farm_storage)
                db.prepare("DELETE FROM farm_storage WHERE userId = ? AND itemId = 'egg_normal' AND quantity > 0").run(userId);
            }
        }
    }

    return results;
}

// ==================== PRODUCT INVENTORY ====================
function getProductInventory(userId) {
    return getStorageProducts(userId).map(r => {
        const lastU = r.itemId.lastIndexOf('_');
        return { productId: r.itemId.substring(0, lastU), quality: r.itemId.substring(lastU + 1), quantity: r.quantity };
    });
}

function getProductCount(userId, productId, quality) {
    const row = db.prepare('SELECT quantity FROM farm_storage WHERE userId = ? AND itemId = ?').get(userId, `${productId}_${quality}`);
    return row ? row.quantity : 0;
}

// ==================== DAILY SCHEDULER ====================
// Runs the daily tick (sickness from neglect, seasonal illness, pests, death) once
// per WIB day for every owner of livestock. A sentinel row in livestock_data tracks
// the last run date so restarts within the same day don't double-process.
function runDailyTickForAll() {
    const rows = db.prepare('SELECT DISTINCT userId FROM livestock').all();
    const summary = { users: 0, sick: 0, died: 0 };
    for (const { userId } of rows) {
        try {
            const r = processDailyLivestock(userId);
            summary.users++;
            summary.sick += r.sick;
            summary.died += r.died;
        } catch (e) { /* never let one user break the batch */ }
    }
    return summary;
}

const LIVESTOCK_DAILY_KEY = 'livestock_daily_lastrun';
const LIVESTOCK_DAILY_SENTINEL = '__global__';

function startLivestockDailySchedule() {
    const todayWIB = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const tick = () => {
        try {
            const today = todayWIB();
            const last = db.prepare('SELECT value FROM livestock_data WHERE userId = ? AND key = ?')
                .get(LIVESTOCK_DAILY_SENTINEL, LIVESTOCK_DAILY_KEY)?.value;
            if (last === today) return;
            runDailyTickForAll();
            db.prepare('INSERT OR REPLACE INTO livestock_data (userId, key, value) VALUES (?, ?, ?)')
                .run(LIVESTOCK_DAILY_SENTINEL, LIVESTOCK_DAILY_KEY, today);
        } catch (e) { /* swallow: scheduler must not crash the bot */ }
    };
    setTimeout(tick, 30 * 1000);                 // shortly after boot (catch a missed day)
    return setInterval(tick, 30 * 60 * 1000);    // re-check every 30 minutes
}

module.exports = {
    getLivestockData, setLivestockData,
    getCoopLevel, getBarnLevel, getCoopSlots, getBarnSlots,
    getAnimals, getAllAnimals, buyAnimal,
    upgradeCoopLevel, upgradeBarnLevel,
    collectProducts, sellAllProducts,
    feedAnimals, getHungerPercent, healAll,
    evolveAnimal, processDailyLivestock,
    getProductInventory, getProductCount,
    buryAllDead,
    runDailyTickForAll, startLivestockDailySchedule,
};
