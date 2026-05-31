// database.js - Database initialization, migrations, and helper functions
const Database = require('better-sqlite3');
const db = new Database('economy.sqlite');

// ================= TABLE CREATION =================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (guildId TEXT, userId TEXT, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 0, balance INTEGER DEFAULT 0, lastDaily TEXT, PRIMARY KEY(guildId, userId));
  CREATE TABLE IF NOT EXISTS config (guildId TEXT, key TEXT, value INTEGER, PRIMARY KEY(guildId, key));
  CREATE TABLE IF NOT EXISTS rewards (guildId TEXT, level INTEGER, roleId TEXT, money INTEGER DEFAULT 0, PRIMARY KEY(guildId, level));
  CREATE TABLE IF NOT EXISTS shop_roles (guildId TEXT, roleId TEXT, price INTEGER, PRIMARY KEY(guildId, roleId));
  CREATE TABLE IF NOT EXISTS shop_items (id INTEGER PRIMARY KEY AUTOINCREMENT, guildId TEXT, name TEXT, price INTEGER, content TEXT);
  CREATE TABLE IF NOT EXISTS vouchers (guildId TEXT, code TEXT, reward INTEGER, max_uses INTEGER DEFAULT 1, current_uses INTEGER DEFAULT 0, PRIMARY KEY(guildId, code));
  CREATE TABLE IF NOT EXISTS voucher_claims (guildId TEXT, userId TEXT, code TEXT, PRIMARY KEY(guildId, userId, code));
  CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, guildId TEXT, time INTEGER, userId TEXT, action TEXT, item TEXT, price INTEGER);
  CREATE TABLE IF NOT EXISTS server_settings (guildId TEXT, key TEXT, value TEXT, PRIMARY KEY(guildId, key));
  CREATE TABLE IF NOT EXISTS economy_admins (guildId TEXT, adminId TEXT, type TEXT, PRIMARY KEY(guildId, adminId));
  CREATE TABLE IF NOT EXISTS streaks (guildId TEXT, userId TEXT, count INTEGER DEFAULT 0, last_date TEXT, PRIMARY KEY(guildId, userId));
  CREATE TABLE IF NOT EXISTS streak_restores (guildId TEXT, userId TEXT, month TEXT, count INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId, month));
  CREATE TABLE IF NOT EXISTS streak_history (guildId TEXT, userId TEXT, lost_count INTEGER, PRIMARY KEY(guildId, userId));
  CREATE TABLE IF NOT EXISTS daily_quests (guildId TEXT, userId TEXT, date TEXT, data TEXT, PRIMARY KEY(guildId, userId));
  CREATE TABLE IF NOT EXISTS temp_voices (channelId TEXT PRIMARY KEY, guildId TEXT, ownerId TEXT);
  CREATE TABLE IF NOT EXISTS achievements (guildId TEXT, userId TEXT, achievementId TEXT, unlockedAt INTEGER, PRIMARY KEY(guildId, userId, achievementId));
  CREATE TABLE IF NOT EXISTS user_stats (guildId TEXT, userId TEXT, stat_key TEXT, stat_value INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId, stat_key));
  CREATE TABLE IF NOT EXISTS fish_inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, guildId TEXT, userId TEXT, fishId TEXT, weight REAL, caughtAt INTEGER, locked INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS fish_collection (guildId TEXT, userId TEXT, fishId TEXT, PRIMARY KEY(guildId, userId, fishId));
  CREATE TABLE IF NOT EXISTS fish_equipment (guildId TEXT, userId TEXT, rod TEXT DEFAULT 'basic', bait TEXT DEFAULT 'none', bait_count INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId));
`);

// ================= MIGRATIONS =================
try { db.exec(`ALTER TABLE fish_inventory ADD COLUMN locked INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS fish_collection (guildId TEXT, userId TEXT, fishId TEXT, PRIMARY KEY(guildId, userId, fishId))`); } catch(e) {}

db.exec(`CREATE TABLE IF NOT EXISTS item_inventory (guildId TEXT, userId TEXT, itemId TEXT, quantity INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId, itemId))`);
db.exec(`CREATE TABLE IF NOT EXISTS pet_food_inventory (guildId TEXT, userId TEXT, foodId TEXT, quantity INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId, foodId))`);
db.exec(`CREATE TABLE IF NOT EXISTS seed_inventory (guildId TEXT, userId TEXT, cropId TEXT, quantity INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId, cropId))`);
db.exec(`CREATE TABLE IF NOT EXISTS fertilizer_inventory (guildId TEXT, userId TEXT, fertId TEXT, quantity INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId, fertId))`);

// Farming
db.exec(`CREATE TABLE IF NOT EXISTS farm_plots (id INTEGER PRIMARY KEY AUTOINCREMENT, guildId TEXT, userId TEXT, cropId TEXT, plantedAt INTEGER, wateredAt INTEGER, fertilizer TEXT DEFAULT 'none', status TEXT DEFAULT 'growing')`);
db.exec(`CREATE TABLE IF NOT EXISTS farm_storage (guildId TEXT, userId TEXT, itemId TEXT, quantity INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId, itemId))`);
db.exec(`CREATE TABLE IF NOT EXISTS farm_data (guildId TEXT, userId TEXT, farm_level INTEGER DEFAULT 1, PRIMARY KEY(guildId, userId))`);
// Auto-harvest notifier dedup flag (1 = user already notified that this plot is ready)
try { db.exec(`ALTER TABLE farm_plots ADD COLUMN notified INTEGER DEFAULT 0`); } catch(e) {}

// Pets
db.exec(`CREATE TABLE IF NOT EXISTS pets (id INTEGER PRIMARY KEY AUTOINCREMENT, guildId TEXT, userId TEXT, petId TEXT, name TEXT, level INTEGER DEFAULT 1, exp INTEGER DEFAULT 0, happiness INTEGER DEFAULT 100, hunger INTEGER DEFAULT 100, status TEXT DEFAULT 'happy', active INTEGER DEFAULT 0, adoptedAt INTEGER)`);
try { db.exec(`ALTER TABLE pets ADD COLUMN hunting_until INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE pets ADD COLUMN skills TEXT DEFAULT '[]'`); } catch(e) {}
try { db.exec(`ALTER TABLE pets ADD COLUMN class TEXT DEFAULT 'warrior'`); } catch(e) {}
try { db.exec(`ALTER TABLE pets ADD COLUMN element TEXT DEFAULT 'fire'`); } catch(e) {}
try { db.exec(`ALTER TABLE pets ADD COLUMN hp INTEGER DEFAULT 100`); } catch(e) {}
try { db.exec(`ALTER TABLE pets ADD COLUMN atk INTEGER DEFAULT 20`); } catch(e) {}
try { db.exec(`ALTER TABLE pets ADD COLUMN def INTEGER DEFAULT 10`); } catch(e) {}
try { db.exec(`ALTER TABLE pets ADD COLUMN spd INTEGER DEFAULT 10`); } catch(e) {}
try { db.exec(`ALTER TABLE pets ADD COLUMN crit INTEGER DEFAULT 5`); } catch(e) {}
db.exec(`CREATE TABLE IF NOT EXISTS relics (id INTEGER PRIMARY KEY AUTOINCREMENT, guildId TEXT, userId TEXT, name TEXT, slot TEXT, rarity TEXT, stat_type TEXT, stat_value INTEGER, refine_level INTEGER DEFAULT 0, equipped_pet_id INTEGER DEFAULT 0)`);

// Trading
db.exec(`CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY AUTOINCREMENT, guildId TEXT, senderId TEXT, receiverId TEXT, status TEXT DEFAULT 'pending', createdAt INTEGER, senderOffer TEXT, receiverOffer TEXT)`);

// Command Analytics
db.exec(`CREATE TABLE IF NOT EXISTS command_summary (guildId TEXT, command TEXT, count INTEGER DEFAULT 0, lastUsed INTEGER, PRIMARY KEY(guildId, command))`);

// Pet Evolution
try { db.exec(`ALTER TABLE pets ADD COLUMN evolved INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE pets ADD COLUMN evoStage INTEGER DEFAULT 0`); } catch(e) {}

// Auto-Harvest
db.exec(`CREATE TABLE IF NOT EXISTS auto_harvest (guildId TEXT, userId TEXT, enabled INTEGER DEFAULT 0, purchased INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId))`);

// Combo
db.exec(`CREATE TABLE IF NOT EXISTS combo_tracker (guildId TEXT, userId TEXT, features TEXT DEFAULT '[]', lastAction INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId))`);

// Weekly Quests
db.exec(`CREATE TABLE IF NOT EXISTS weekly_quests (guildId TEXT, userId TEXT, week TEXT, data TEXT, PRIMARY KEY(guildId, userId, week))`);

// Calendar
db.exec(`CREATE TABLE IF NOT EXISTS login_calendar (guildId TEXT, userId TEXT, month TEXT, days TEXT DEFAULT '[]', claimed TEXT DEFAULT '[]', PRIMARY KEY(guildId, userId, month))`);

// Fishing Contest
db.exec(`CREATE TABLE IF NOT EXISTS fish_contest (guildId TEXT, oderId TEXT, odent TEXT, weight REAL DEFAULT 0, fishId TEXT, startedAt INTEGER, PRIMARY KEY(guildId, oderId))`);
db.exec(`CREATE TABLE IF NOT EXISTS fish_contest_state (guildId TEXT PRIMARY KEY, active INTEGER DEFAULT 0, startedAt INTEGER, endsAt INTEGER, channelId TEXT)`);

// Fishing Location
try { db.exec(`ALTER TABLE fish_equipment ADD COLUMN location TEXT DEFAULT 'river'`); } catch(e) {}

// Farm Decorations
db.exec(`CREATE TABLE IF NOT EXISTS farm_decorations (guildId TEXT, userId TEXT, decoId TEXT, purchasedAt INTEGER, PRIMARY KEY(guildId, userId, decoId))`);

// ================= HELPER FUNCTIONS =================
function getOrCreateUser(guildId, userId) {
    let user = db.prepare('SELECT * FROM users WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!user) { db.prepare('INSERT INTO users (guildId, userId) VALUES (?, ?)').run(guildId, userId); user = db.prepare('SELECT * FROM users WHERE guildId = ? AND userId = ?').get(guildId, userId); }
    return user;
}

function getConf(guildId, key, defaultVal) {
    const row = db.prepare('SELECT value FROM config WHERE guildId = ? AND key = ?').get(guildId, key);
    return row ? row.value : defaultVal;
}

function getSetting(guildId, key, defaultVal) {
    const row = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, key);
    return row ? row.value : defaultVal;
}

function getUserStat(guildId, userId, key) {
    const row = db.prepare('SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = ?').get(guildId, userId, key);
    return row ? row.stat_value : 0;
}

function incrementUserStat(guildId, userId, key, amount = 1) {
    const current = getUserStat(guildId, userId, key);
    db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, key, current + amount);
    return current + amount;
}

function setUserStat(guildId, userId, key, value) {
    db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, key, Math.round(Number(value) || 0));
}

function setUserStatMax(guildId, userId, key, value) {
    // Stores `value` only if it is greater than the current stored value (for "biggest" records).
    value = Math.round(Number(value) || 0);
    if (value <= getUserStat(guildId, userId, key)) return;
    db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, key, value);
}

// Tracks earned money for the /stats dashboard: per-source total, per-day total, and all-time total.
// `source` is one of: fishing, farming, gambling, quest, daily, battle, trade, ...
function addIncome(guildId, userId, source, amount) {
    amount = Math.round(Number(amount) || 0);
    if (amount <= 0) return;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    incrementUserStat(guildId, userId, `income_${source}`, amount);
    incrementUserStat(guildId, userId, `income_${today}`, amount);
    incrementUserStat(guildId, userId, 'total_earned', amount);
}

// Tracks spent money for the /stats dashboard: per-category total + all-time total.
function addSpending(guildId, userId, category, amount) {
    amount = Math.round(Number(amount) || 0);
    if (amount <= 0) return;
    incrementUserStat(guildId, userId, `total_spent_${category}`, amount);
    incrementUserStat(guildId, userId, 'total_spent', amount);
}

function getItemCount(guildId, userId, itemId) {
    const row = db.prepare('SELECT quantity FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, itemId);
    return row ? row.quantity : 0;
}

function addItem(guildId, userId, itemId, qty = 1) {
    const current = getItemCount(guildId, userId, itemId);
    db.prepare('INSERT OR REPLACE INTO item_inventory (guildId, userId, itemId, quantity) VALUES (?, ?, ?, ?)').run(guildId, userId, itemId, current + qty);
}

function removeItem(guildId, userId, itemId, qty = 1) {
    const current = getItemCount(guildId, userId, itemId);
    if (current < qty) return false;
    if (current - qty <= 0) db.prepare('DELETE FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').run(guildId, userId, itemId);
    else db.prepare('UPDATE item_inventory SET quantity = ? WHERE guildId = ? AND userId = ? AND itemId = ?').run(current - qty, guildId, userId, itemId);
    return true;
}

// ================= PET FOOD INVENTORY =================
function getPetFoodCount(guildId, userId, foodId) {
    const row = db.prepare('SELECT quantity FROM pet_food_inventory WHERE guildId = ? AND userId = ? AND foodId = ?').get(guildId, userId, foodId);
    return row ? row.quantity : 0;
}

function addPetFood(guildId, userId, foodId, qty = 1) {
    const current = getPetFoodCount(guildId, userId, foodId);
    db.prepare('INSERT OR REPLACE INTO pet_food_inventory (guildId, userId, foodId, quantity) VALUES (?, ?, ?, ?)').run(guildId, userId, foodId, current + qty);
}

function removePetFood(guildId, userId, foodId, qty = 1) {
    const current = getPetFoodCount(guildId, userId, foodId);
    if (current < qty) return false;
    if (current - qty <= 0) db.prepare('DELETE FROM pet_food_inventory WHERE guildId = ? AND userId = ? AND foodId = ?').run(guildId, userId, foodId);
    else db.prepare('UPDATE pet_food_inventory SET quantity = ? WHERE guildId = ? AND userId = ? AND foodId = ?').run(current - qty, guildId, userId, foodId);
    return true;
}

function getAllPetFood(guildId, userId) {
    return db.prepare('SELECT * FROM pet_food_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, userId);
}

// ================= SEED INVENTORY =================
function getSeedCount(guildId, userId, cropId) {
    const row = db.prepare('SELECT quantity FROM seed_inventory WHERE guildId = ? AND userId = ? AND cropId = ?').get(guildId, userId, cropId);
    return row ? row.quantity : 0;
}

function addSeed(guildId, userId, cropId, qty = 1) {
    const current = getSeedCount(guildId, userId, cropId);
    db.prepare('INSERT OR REPLACE INTO seed_inventory (guildId, userId, cropId, quantity) VALUES (?, ?, ?, ?)').run(guildId, userId, cropId, current + qty);
}

function removeSeed(guildId, userId, cropId, qty = 1) {
    const current = getSeedCount(guildId, userId, cropId);
    if (current < qty) return false;
    if (current - qty <= 0) db.prepare('DELETE FROM seed_inventory WHERE guildId = ? AND userId = ? AND cropId = ?').run(guildId, userId, cropId);
    else db.prepare('UPDATE seed_inventory SET quantity = ? WHERE guildId = ? AND userId = ? AND cropId = ?').run(current - qty, guildId, userId, cropId);
    return true;
}

function getAllSeeds(guildId, userId) {
    return db.prepare('SELECT * FROM seed_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, userId);
}

// ================= FERTILIZER INVENTORY =================
function getFertCount(guildId, userId, fertId) {
    const row = db.prepare('SELECT quantity FROM fertilizer_inventory WHERE guildId = ? AND userId = ? AND fertId = ?').get(guildId, userId, fertId);
    return row ? row.quantity : 0;
}

function addFert(guildId, userId, fertId, qty = 1) {
    const current = getFertCount(guildId, userId, fertId);
    db.prepare('INSERT OR REPLACE INTO fertilizer_inventory (guildId, userId, fertId, quantity) VALUES (?, ?, ?, ?)').run(guildId, userId, fertId, current + qty);
}

function removeFert(guildId, userId, fertId, qty = 1) {
    const current = getFertCount(guildId, userId, fertId);
    if (current < qty) return false;
    if (current - qty <= 0) db.prepare('DELETE FROM fertilizer_inventory WHERE guildId = ? AND userId = ? AND fertId = ?').run(guildId, userId, fertId);
    else db.prepare('UPDATE fertilizer_inventory SET quantity = ? WHERE guildId = ? AND userId = ? AND fertId = ?').run(current - qty, guildId, userId, fertId);
    return true;
}

function getAllFerts(guildId, userId) {
    return db.prepare('SELECT * FROM fertilizer_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, userId);
}

module.exports = { db, getOrCreateUser, getConf, getSetting, getUserStat, incrementUserStat, setUserStat, setUserStatMax, addIncome, addSpending, getItemCount, addItem, removeItem, getPetFoodCount, addPetFood, removePetFood, getAllPetFood, getSeedCount, addSeed, removeSeed, getAllSeeds, getFertCount, addFert, removeFert, getAllFerts };
