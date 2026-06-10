// database.js - Database initialization, migrations, and helper functions
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const _rawDb = new Database('economy.sqlite');

// ================= PRAGMA TUNING =================
// WAL lets reads and writes proceed concurrently (readers don't block the writer
// and vice versa), which suits a bot doing many small interleaved queries.
// NORMAL sync is the safe+fast pairing with WAL. The rest reduce disk round-trips.
try {
    _rawDb.pragma('journal_mode = WAL');
    _rawDb.pragma('synchronous = NORMAL');
    _rawDb.pragma('foreign_keys = ON');
    _rawDb.pragma('busy_timeout = 5000');   // wait up to 5s on a locked DB instead of throwing
    _rawDb.pragma('cache_size = -16000');   // ~16MB page cache (negative = KiB)
    _rawDb.pragma('temp_store = MEMORY');
} catch (e) {
    console.error('PRAGMA tuning failed (continuing with defaults):', e.message);
}

// ================= GLOBAL-MODE DB PROXY =================
const GLOBAL_TABLES = new Set([
    'users', 'user_stats', 'achievements', 'pets', 'relics',
    'item_inventory', 'pet_food_inventory', 'seed_inventory', 'fertilizer_inventory',
    'fish_inventory', 'fish_collection', 'fish_equipment',
    'farm_plots', 'farm_storage', 'farm_data', 'farm_decorations',
    'auto_harvest', 'combo_tracker', 'trades', 'market_listings',
    'command_summary', 'pet_evolution_history',
    'giant_fish_encounters', 'giant_fish_active', 'secret_locations_unlocked', 'fishing_combo'
]);

function isGlobalTable(sql) {
    const m = sql.match(/(?:FROM|INTO|UPDATE|JOIN)\s+(\w+)/i);
    return m ? GLOBAL_TABLES.has(m[1]) : false;
}

// Split a VALUES expression by top-level commas (ignores commas inside nested parens)
function splitTopLevel(str) {
    const parts = [];
    let depth = 0, start = 0;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '(') depth++;
        else if (str[i] === ')') depth--;
        else if (str[i] === ',' && depth === 0) {
            parts.push(str.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(str.slice(start).trim());
    return parts;
}

// Strip guildId = ? from inside a single VALUES token (e.g. a COALESCE subquery)
function stripGuildIdFromToken(token) {
    let t = token;
    t = t.replace(/\bguildId\s*=\s*\?\s*AND\s+/gi, '');
    t = t.replace(/\s+AND\s+guildId\s*=\s*\?/gi, '');
    t = t.replace(/\bWHERE\s+guildId\s*=\s*\?/gi, 'WHERE 1=1');
    t = t.replace(/WHERE\s+1=1\s+AND\s+/gi, 'WHERE ');
    t = t.replace(/WHERE\s+1=1\s*(?=\))/gi, '');
    return t;
}

function rewriteQuery(sql) {
    if (!isGlobalTable(sql)) return sql;
    let q = sql;

    // --- INSERT with column list: strip guildId column AND its VALUES slot ---
    // Uses paren-depth tracking so COALESCE(...) subqueries inside VALUES are handled correctly.
    const insertHeadRe = /(INSERT\s+(?:OR\s+\w+\s+)?INTO\s+\w+\s*\()([^)]+)(\)\s*VALUES\s*\()/i;
    const headMatch = q.match(insertHeadRe);
    if (headMatch) {
        const colArr = headMatch[2].split(',').map(c => c.trim());
        const dropIdx = colArr.findIndex(c => c.toLowerCase() === 'guildid');
        if (dropIdx !== -1) {
            const valuesStart = headMatch.index + headMatch[0].length;
            let depth = 1, pos = valuesStart;
            while (pos < q.length && depth > 0) {
                if (q[pos] === '(') depth++;
                else if (q[pos] === ')') depth--;
                pos++;
            }
            const valuesContent = q.slice(valuesStart, pos - 1);
            const valArr = splitTopLevel(valuesContent);
            const newCols = colArr.filter((_, i) => i !== dropIdx).join(', ');
            const newVals = valArr
                .filter((_, i) => i !== dropIdx)
                .map(stripGuildIdFromToken)
                .join(', ');
            q = q.slice(0, headMatch.index)
                + headMatch[1] + newCols + ') VALUES (' + newVals + ')'
                + q.slice(pos);
        }
    }

    // --- WHERE / SET guildId = ? anywhere not already handled ---
    q = q.replace(/\bguildId\s*=\s*\?\s*AND\s+/gi, '');
    q = q.replace(/\s+AND\s+guildId\s*=\s*\?/gi, '');
    q = q.replace(/\bWHERE\s+guildId\s*=\s*\?/gi, 'WHERE 1=1');
    q = q.replace(/\bSET\s+guildId\s*=\s*\?,\s*/gi, 'SET ');
    q = q.replace(/WHERE\s+1=1\s+AND\s+/gi, 'WHERE ');
    q = q.replace(/WHERE\s+1=1\s*(?=\))/gi, '');
    q = q.replace(/WHERE\s+1=1\s*$/gi, '');

    return q;
}

/**
 * Given the ORIGINAL sql, find ALL param indices that are guildId values —
 * both the column-list position in INSERT and any WHERE guildId = ? occurrences
 * (including those inside subqueries within VALUES/COALESCE).
 */
function findGuildIdParamPositions(sql) {
    const sqlLower = sql.toLowerCase();
    const positions = [];

    // Part 1: INSERT column list — positional index of guildId column
    const insertMatch = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+\w+\s*\(([^)]+)\)/i);
    if (insertMatch) {
        const cols = insertMatch[1].split(',').map(c => c.trim().toLowerCase());
        cols.forEach((col, i) => { if (col === 'guildid') positions.push(i); });
    }

    // Part 2: ALL guildId = ? anywhere in the SQL (main WHERE + subqueries in VALUES)
    const pattern = /\bguildid\s*=\s*\?/gi;
    let match;
    while ((match = pattern.exec(sqlLower)) !== null) {
        const qMarkPos = sqlLower.indexOf('?', match.index);
        if (qMarkPos === -1) continue;
        const precedingQMarks = sqlLower.slice(0, qMarkPos).split('?').length - 1;
        positions.push(precedingQMarks);
    }

    return [...new Set(positions)].sort((a, b) => a - b);
}

function rewriteParams(sql, params) {
    if (!params || params.length === 0 || !isGlobalTable(sql)) return params;
    const positions = findGuildIdParamPositions(sql);
    if (!positions.length) return params;
    const result = Array.isArray(params) ? [...params] : [...params];
    // Remove from highest index to lowest so earlier indices stay valid
    for (const pos of positions.slice().reverse()) {
        if (pos < result.length) result.splice(pos, 1);
    }
    return result;
}

function createGlobalProxy(rawDb) {
    return new Proxy(rawDb, {
        get(target, prop) {
            if (prop === 'prepare') {
                return function(sql) {
                    const rewrittenSql = rewriteQuery(sql);
                    let stmt;
                    try {
                        stmt = target.prepare(rewrittenSql);
                    } catch (e) {
                        console.error('[DB PROXY] Failed to prepare rewritten SQL:');
                        console.error('  Original :', sql);
                        console.error('  Rewritten:', rewrittenSql);
                        throw e;
                    }
                    return new Proxy(stmt, {
                        get(stmtTarget, stmtProp) {
                            if (stmtProp === 'get' || stmtProp === 'all' || stmtProp === 'run') {
                                return function(...args) {
                                    const newArgs = rewriteParams(sql, args);
                                    try {
                                        return stmtTarget[stmtProp](...newArgs);
                                    } catch (e) {
                                        console.error('[DB PROXY] Query execution failed:');
                                        console.error('  Original SQL :', sql);
                                        console.error('  Rewritten SQL:', rewrittenSql);
                                        console.error('  Original params:', JSON.stringify(args));
                                        console.error('  Rewritten params:', JSON.stringify(newArgs));
                                        throw e;
                                    }
                                };
                            }
                            return stmtTarget[stmtProp];
                        }
                    });
                };
            }
            return target[prop];
        }
    });
}

// ================= HELPER: checkGlobalMode (needs _rawDb, defined early) =================
let isGlobalMode = null;
function checkGlobalMode() {
    if (isGlobalMode === null) {
        try {
            const userTable = _rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
            if (!userTable) return false;
            const columns = _rawDb.pragma('table_info(users)');
            isGlobalMode = !columns.some(col => col.name === 'guildId');
        } catch (e) {
            isGlobalMode = false;
        }
    }
    return isGlobalMode;
}

// ================= ACTIVATE PROXY =================
// Must be declared BEFORE any usage of `db`
const db = checkGlobalMode() ? createGlobalProxy(_rawDb) : _rawDb;
if (checkGlobalMode()) {
    console.log('🌐 Database running in GLOBAL mode (guildId proxy active)');
}

// ================= BACKUP SYSTEM =================
function createBackup() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(path.dirname('economy.sqlite'), `economy.backup-${timestamp}.sqlite`);
        fs.copyFileSync('economy.sqlite', backupPath);
        console.log(`✅ Database backed up: ${backupPath}`);
        const backupDir = path.dirname('economy.sqlite');
        const backupFiles = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('economy.backup-') && f.endsWith('.sqlite'))
            .sort()
            .reverse();
        if (backupFiles.length > 5) {
            backupFiles.slice(5).forEach(f => {
                fs.unlinkSync(path.join(backupDir, f));
                console.log(`🗑️ Removed old backup: ${f}`);
            });
        }
    } catch (e) {
        console.error('❌ Backup failed:', e.message);
    }
}

// Now db is defined, safe to use it
const isMigrationNeeded = !_rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users_global'").get();
if (isMigrationNeeded) {
    console.log('📦 Creating backup before migration...');
    createBackup();
}

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

db.exec(`CREATE TABLE IF NOT EXISTS farm_plots (id INTEGER PRIMARY KEY AUTOINCREMENT, guildId TEXT, userId TEXT, cropId TEXT, plantedAt INTEGER, wateredAt INTEGER, fertilizer TEXT DEFAULT 'none', status TEXT DEFAULT 'growing', greenhouse INTEGER DEFAULT 0)`);
db.exec(`CREATE TABLE IF NOT EXISTS farm_storage (guildId TEXT, userId TEXT, itemId TEXT, quantity INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId, itemId))`);
db.exec(`CREATE TABLE IF NOT EXISTS farm_data (guildId TEXT, userId TEXT, farm_level INTEGER DEFAULT 1, PRIMARY KEY(guildId, userId))`);
try { db.exec(`ALTER TABLE farm_plots ADD COLUMN notified INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE farm_plots ADD COLUMN greenhouse INTEGER DEFAULT 0`); } catch(e) {}

db.exec(`CREATE TABLE IF NOT EXISTS greenhouse (userId TEXT PRIMARY KEY, level INTEGER DEFAULT 0, purchasedAt INTEGER)`);
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

db.exec(`CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY AUTOINCREMENT, guildId TEXT, senderId TEXT, receiverId TEXT, status TEXT DEFAULT 'pending', createdAt INTEGER, senderOffer TEXT, receiverOffer TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS command_summary (guildId TEXT, command TEXT, count INTEGER DEFAULT 0, lastUsed INTEGER, PRIMARY KEY(guildId, command))`);

try { db.exec(`ALTER TABLE pets ADD COLUMN evolved INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE pets ADD COLUMN evoStage INTEGER DEFAULT 0`); } catch(e) {}

db.exec(`CREATE TABLE IF NOT EXISTS auto_harvest (guildId TEXT, userId TEXT, enabled INTEGER DEFAULT 0, purchased INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId))`);
db.exec(`CREATE TABLE IF NOT EXISTS combo_tracker (guildId TEXT, userId TEXT, features TEXT DEFAULT '[]', lastAction INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId))`);
db.exec(`CREATE TABLE IF NOT EXISTS weekly_quests (guildId TEXT, userId TEXT, week TEXT, data TEXT, PRIMARY KEY(guildId, userId, week))`);
db.exec(`CREATE TABLE IF NOT EXISTS login_calendar (guildId TEXT, userId TEXT, month TEXT, days TEXT DEFAULT '[]', claimed TEXT DEFAULT '[]', PRIMARY KEY(guildId, userId, month))`);
db.exec(`CREATE TABLE IF NOT EXISTS fish_contest (guildId TEXT, oderId TEXT, odent TEXT, weight REAL DEFAULT 0, fishId TEXT, startedAt INTEGER, PRIMARY KEY(guildId, oderId))`);
db.exec(`CREATE TABLE IF NOT EXISTS fish_contest_state (guildId TEXT PRIMARY KEY, active INTEGER DEFAULT 0, startedAt INTEGER, endsAt INTEGER, channelId TEXT)`);
try { db.exec(`ALTER TABLE fish_equipment ADD COLUMN location TEXT DEFAULT 'river'`); } catch(e) {}
db.exec(`CREATE TABLE IF NOT EXISTS farm_decorations (guildId TEXT, userId TEXT, decoId TEXT, purchasedAt INTEGER, PRIMARY KEY(guildId, userId, decoId))`);

// ================= RUN GLOBAL PROGRESSION MIGRATION =================
try {
    const { runGlobalMigration } = require('./systems/migration-global');
    runGlobalMigration(db);
} catch (e) {
    console.error('⚠️  Migration warning:', e.message);
}

// ================= POST-MIGRATION: Fish Pokédex columns =================
// These run AFTER global migration so they apply to the final fish_collection table
try { db.exec(`ALTER TABLE fish_collection ADD COLUMN caughtAt INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE fish_collection ADD COLUMN catch_count INTEGER DEFAULT 1`); } catch(e) {}
try { db.exec(`ALTER TABLE fish_collection ADD COLUMN heaviest_weight REAL DEFAULT 0`); } catch(e) {}
// Backfill: sync any fish_inventory entries into fish_collection for missing discoveries
try {
    db.exec(`INSERT OR IGNORE INTO fish_collection (userId, fishId, caughtAt, catch_count, heaviest_weight)
        SELECT userId, fishId, MIN(caughtAt), COUNT(*), MAX(weight)
        FROM fish_inventory GROUP BY userId, fishId`);
    // Update heaviest_weight/catch_count for existing entries that are still at defaults
    db.exec(`UPDATE fish_collection SET
        heaviest_weight = COALESCE((SELECT MAX(weight) FROM fish_inventory fi WHERE fi.userId = fish_collection.userId AND fi.fishId = fish_collection.fishId), heaviest_weight),
        catch_count = COALESCE((SELECT COUNT(*) FROM fish_inventory fi WHERE fi.userId = fish_collection.userId AND fi.fishId = fish_collection.fishId), catch_count)
        WHERE heaviest_weight = 0 OR catch_count <= 1`);
} catch(e) { /* first run or no fish_inventory data yet — safe to ignore */ }

// ================= HELPER FUNCTIONS =================

function getOrCreateUser(guildId, userId) {
    if (checkGlobalMode()) {
        let user = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);
        if (!user) {
            db.prepare('INSERT INTO users (userId) VALUES (?)').run(userId);
            user = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);
        }
        return user;
    }
    let user = db.prepare('SELECT * FROM users WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!user) {
        db.prepare('INSERT INTO users (guildId, userId) VALUES (?, ?)').run(guildId, userId);
        user = db.prepare('SELECT * FROM users WHERE guildId = ? AND userId = ?').get(guildId, userId);
    }
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

function setSetting(guildId, key, value) {
    db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, key, String(value));
    return value;
}

function getUserStat(guildId, userId, key) {
    if (checkGlobalMode()) {
        const row = db.prepare('SELECT stat_value FROM user_stats WHERE userId = ? AND stat_key = ?').get(userId, key);
        return row ? row.stat_value : 0;
    }
    const row = db.prepare('SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = ?').get(guildId, userId, key);
    return row ? row.stat_value : 0;
}

function incrementUserStat(guildId, userId, key, amount = 1) {
    const current = getUserStat(guildId, userId, key);
    if (checkGlobalMode()) {
        db.prepare('INSERT OR REPLACE INTO user_stats (userId, stat_key, stat_value) VALUES (?, ?, ?)').run(userId, key, current + amount);
    } else {
        db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, key, current + amount);
    }
    return current + amount;
}

function setUserStat(guildId, userId, key, value) {
    const val = Math.round(Number(value) || 0);
    if (checkGlobalMode()) {
        db.prepare('INSERT OR REPLACE INTO user_stats (userId, stat_key, stat_value) VALUES (?, ?, ?)').run(userId, key, val);
    } else {
        db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, key, val);
    }
}

function setUserStatMax(guildId, userId, key, value) {
    value = Math.round(Number(value) || 0);
    if (value <= getUserStat(guildId, userId, key)) return;
    setUserStat(guildId, userId, key, value);
}

function addIncome(guildId, userId, source, amount) {
    amount = Math.round(Number(amount) || 0);
    if (amount <= 0) return;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    incrementUserStat(guildId, userId, `income_${source}`, amount);
    incrementUserStat(guildId, userId, `income_${today}`, amount);
    incrementUserStat(guildId, userId, 'total_earned', amount);
}

function addSpending(guildId, userId, category, amount) {
    amount = Math.round(Number(amount) || 0);
    if (amount <= 0) return;
    incrementUserStat(guildId, userId, `total_spent_${category}`, amount);
    incrementUserStat(guildId, userId, 'total_spent', amount);
}

function getItemCount(guildId, userId, itemId) {
    if (checkGlobalMode()) {
        const row = db.prepare('SELECT quantity FROM item_inventory WHERE userId = ? AND itemId = ?').get(userId, itemId);
        return row ? row.quantity : 0;
    }
    const row = db.prepare('SELECT quantity FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, itemId);
    return row ? row.quantity : 0;
}

function addItem(guildId, userId, itemId, qty = 1) {
    const current = getItemCount(guildId, userId, itemId);
    if (checkGlobalMode()) {
        db.prepare('INSERT OR REPLACE INTO item_inventory (userId, itemId, quantity) VALUES (?, ?, ?)').run(userId, itemId, current + qty);
    } else {
        db.prepare('INSERT OR REPLACE INTO item_inventory (guildId, userId, itemId, quantity) VALUES (?, ?, ?, ?)').run(guildId, userId, itemId, current + qty);
    }
}

function removeItem(guildId, userId, itemId, qty = 1) {
    const current = getItemCount(guildId, userId, itemId);
    if (current < qty) return false;
    if (checkGlobalMode()) {
        if (current - qty <= 0) db.prepare('DELETE FROM item_inventory WHERE userId = ? AND itemId = ?').run(userId, itemId);
        else db.prepare('UPDATE item_inventory SET quantity = ? WHERE userId = ? AND itemId = ?').run(current - qty, userId, itemId);
    } else {
        if (current - qty <= 0) db.prepare('DELETE FROM item_inventory WHERE guildId = ? AND userId = ? AND itemId = ?').run(guildId, userId, itemId);
        else db.prepare('UPDATE item_inventory SET quantity = ? WHERE guildId = ? AND userId = ? AND itemId = ?').run(current - qty, guildId, userId, itemId);
    }
    return true;
}

// ================= PET FOOD INVENTORY =================
function getPetFoodCount(guildId, userId, foodId) {
    if (checkGlobalMode()) {
        const row = db.prepare('SELECT quantity FROM pet_food_inventory WHERE userId = ? AND foodId = ?').get(userId, foodId);
        return row ? row.quantity : 0;
    }
    const row = db.prepare('SELECT quantity FROM pet_food_inventory WHERE guildId = ? AND userId = ? AND foodId = ?').get(guildId, userId, foodId);
    return row ? row.quantity : 0;
}

function addPetFood(guildId, userId, foodId, qty = 1) {
    const current = getPetFoodCount(guildId, userId, foodId);
    if (checkGlobalMode()) {
        db.prepare('INSERT OR REPLACE INTO pet_food_inventory (userId, foodId, quantity) VALUES (?, ?, ?)').run(userId, foodId, current + qty);
    } else {
        db.prepare('INSERT OR REPLACE INTO pet_food_inventory (guildId, userId, foodId, quantity) VALUES (?, ?, ?, ?)').run(guildId, userId, foodId, current + qty);
    }
}

function removePetFood(guildId, userId, foodId, qty = 1) {
    const current = getPetFoodCount(guildId, userId, foodId);
    if (current < qty) return false;
    if (checkGlobalMode()) {
        if (current - qty <= 0) db.prepare('DELETE FROM pet_food_inventory WHERE userId = ? AND foodId = ?').run(userId, foodId);
        else db.prepare('UPDATE pet_food_inventory SET quantity = ? WHERE userId = ? AND foodId = ?').run(current - qty, userId, foodId);
    } else {
        if (current - qty <= 0) db.prepare('DELETE FROM pet_food_inventory WHERE guildId = ? AND userId = ? AND foodId = ?').run(guildId, userId, foodId);
        else db.prepare('UPDATE pet_food_inventory SET quantity = ? WHERE guildId = ? AND userId = ? AND foodId = ?').run(current - qty, guildId, userId, foodId);
    }
    return true;
}

function getAllPetFood(guildId, userId) {
    if (checkGlobalMode()) {
        return db.prepare('SELECT * FROM pet_food_inventory WHERE userId = ? AND quantity > 0').all(userId);
    }
    return db.prepare('SELECT * FROM pet_food_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, userId);
}

// ================= SEED INVENTORY =================
function getSeedCount(guildId, userId, cropId) {
    if (checkGlobalMode()) {
        const row = db.prepare('SELECT quantity FROM seed_inventory WHERE userId = ? AND cropId = ?').get(userId, cropId);
        return row ? row.quantity : 0;
    }
    const row = db.prepare('SELECT quantity FROM seed_inventory WHERE guildId = ? AND userId = ? AND cropId = ?').get(guildId, userId, cropId);
    return row ? row.quantity : 0;
}

function addSeed(guildId, userId, cropId, qty = 1) {
    const current = getSeedCount(guildId, userId, cropId);
    if (checkGlobalMode()) {
        db.prepare('INSERT OR REPLACE INTO seed_inventory (userId, cropId, quantity) VALUES (?, ?, ?)').run(userId, cropId, current + qty);
    } else {
        db.prepare('INSERT OR REPLACE INTO seed_inventory (guildId, userId, cropId, quantity) VALUES (?, ?, ?, ?)').run(guildId, userId, cropId, current + qty);
    }
}

function removeSeed(guildId, userId, cropId, qty = 1) {
    const current = getSeedCount(guildId, userId, cropId);
    if (current < qty) return false;
    if (checkGlobalMode()) {
        if (current - qty <= 0) db.prepare('DELETE FROM seed_inventory WHERE userId = ? AND cropId = ?').run(userId, cropId);
        else db.prepare('UPDATE seed_inventory SET quantity = ? WHERE userId = ? AND cropId = ?').run(current - qty, userId, cropId);
    } else {
        if (current - qty <= 0) db.prepare('DELETE FROM seed_inventory WHERE guildId = ? AND userId = ? AND cropId = ?').run(guildId, userId, cropId);
        else db.prepare('UPDATE seed_inventory SET quantity = ? WHERE guildId = ? AND userId = ? AND cropId = ?').run(current - qty, guildId, userId, cropId);
    }
    return true;
}

function getAllSeeds(guildId, userId) {
    if (checkGlobalMode()) {
        return db.prepare('SELECT * FROM seed_inventory WHERE userId = ? AND quantity > 0').all(userId);
    }
    return db.prepare('SELECT * FROM seed_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, userId);
}

// ================= FERTILIZER INVENTORY =================
function getFertCount(guildId, userId, fertId) {
    if (checkGlobalMode()) {
        const row = db.prepare('SELECT quantity FROM fertilizer_inventory WHERE userId = ? AND fertId = ?').get(userId, fertId);
        return row ? row.quantity : 0;
    }
    const row = db.prepare('SELECT quantity FROM fertilizer_inventory WHERE guildId = ? AND userId = ? AND fertId = ?').get(guildId, userId, fertId);
    return row ? row.quantity : 0;
}

function addFert(guildId, userId, fertId, qty = 1) {
    const current = getFertCount(guildId, userId, fertId);
    if (checkGlobalMode()) {
        db.prepare('INSERT OR REPLACE INTO fertilizer_inventory (userId, fertId, quantity) VALUES (?, ?, ?)').run(userId, fertId, current + qty);
    } else {
        db.prepare('INSERT OR REPLACE INTO fertilizer_inventory (guildId, userId, fertId, quantity) VALUES (?, ?, ?, ?)').run(guildId, userId, fertId, current + qty);
    }
}

function removeFert(guildId, userId, fertId, qty = 1) {
    const current = getFertCount(guildId, userId, fertId);
    if (current < qty) return false;
    if (checkGlobalMode()) {
        if (current - qty <= 0) db.prepare('DELETE FROM fertilizer_inventory WHERE userId = ? AND fertId = ?').run(userId, fertId);
        else db.prepare('UPDATE fertilizer_inventory SET quantity = ? WHERE userId = ? AND fertId = ?').run(current - qty, userId, fertId);
    } else {
        if (current - qty <= 0) db.prepare('DELETE FROM fertilizer_inventory WHERE guildId = ? AND userId = ? AND fertId = ?').run(guildId, userId, fertId);
        else db.prepare('UPDATE fertilizer_inventory SET quantity = ? WHERE guildId = ? AND userId = ? AND fertId = ?').run(current - qty, guildId, userId, fertId);
    }
    return true;
}

function getAllFerts(guildId, userId) {
    if (checkGlobalMode()) {
        return db.prepare('SELECT * FROM fertilizer_inventory WHERE userId = ? AND quantity > 0').all(userId);
    }
    return db.prepare('SELECT * FROM fertilizer_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, userId);
}

// ================= GLOBAL-MODE-AWARE DB HELPERS =================

function getUsersForDailyReminder(today, cutoff) {
    if (checkGlobalMode()) {
        return _rawDb.prepare('SELECT userId FROM users WHERE lastDaily IS NOT NULL AND lastDaily < ? AND lastDaily >= ?').all(today, cutoff)
            .map(r => ({ guildId: null, userId: r.userId }));
    }
    return _rawDb.prepare('SELECT guildId, userId FROM users WHERE lastDaily IS NOT NULL AND lastDaily < ? AND lastDaily >= ?').all(today, cutoff);
}

function updateUserBalance(guildId, userId, newBalance) {
    if (checkGlobalMode()) {
        db.prepare('UPDATE users SET balance = ? WHERE userId = ?').run(newBalance, userId);
    } else {
        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(newBalance, guildId, userId);
    }
}

function addUserBalance(guildId, userId, amount) {
    if (checkGlobalMode()) {
        db.prepare('UPDATE users SET balance = balance + ? WHERE userId = ?').run(amount, userId);
    } else {
        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(amount, guildId, userId);
    }
}

function subtractUserBalance(guildId, userId, amount) {
    if (checkGlobalMode()) {
        db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?').run(amount, userId);
    } else {
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(amount, guildId, userId);
    }
}

function getActivePetsHungry(hungerThreshold) {
    if (checkGlobalMode()) {
        return _rawDb.prepare("SELECT userId, name, hunger, status FROM pets WHERE active = 1 AND status != 'dead' AND (hunger <= ? OR status = 'sick')").all(hungerThreshold)
            .map(r => ({ ...r, guildId: null }));
    }
    return _rawDb.prepare("SELECT guildId, userId, name, hunger, status FROM pets WHERE active = 1 AND status != 'dead' AND (hunger <= ? OR status = 'sick')").all(hungerThreshold);
}

function getFarmDecorations(guildId, userId) {
    if (checkGlobalMode()) {
        return db.prepare('SELECT decoId FROM farm_decorations WHERE userId = ?').all(userId);
    }
    return db.prepare('SELECT decoId FROM farm_decorations WHERE guildId = ? AND userId = ?').all(guildId, userId);
}

function hasFarmDecoration(guildId, userId, decoId) {
    if (checkGlobalMode()) {
        return !!db.prepare('SELECT 1 FROM farm_decorations WHERE userId = ? AND decoId = ?').get(userId, decoId);
    }
    return !!db.prepare('SELECT 1 FROM farm_decorations WHERE guildId = ? AND userId = ? AND decoId = ?').get(guildId, userId, decoId);
}

function addFarmDecoration(guildId, userId, decoId) {
    if (checkGlobalMode()) {
        db.prepare('INSERT INTO farm_decorations (userId, decoId, purchasedAt) VALUES (?, ?, ?)').run(userId, decoId, Date.now());
    } else {
        db.prepare('INSERT INTO farm_decorations (guildId, userId, decoId, purchasedAt) VALUES (?, ?, ?, ?)').run(guildId, userId, decoId, Date.now());
    }
}

function getFarmPlot(guildId, userId, plotId) {
    if (checkGlobalMode()) {
        return db.prepare('SELECT * FROM farm_plots WHERE id = ? AND userId = ?').get(plotId, userId);
    }
    return db.prepare('SELECT * FROM farm_plots WHERE id = ? AND guildId = ? AND userId = ?').get(plotId, guildId, userId);
}

function insertFarmPlot(guildId, userId, cropId, plantedAt, wateredAt) {
    if (checkGlobalMode()) {
        db.prepare('INSERT INTO farm_plots (userId, cropId, plantedAt, wateredAt) VALUES (?, ?, ?, ?)').run(userId, cropId, plantedAt, wateredAt);
    } else {
        db.prepare('INSERT INTO farm_plots (guildId, userId, cropId, plantedAt, wateredAt) VALUES (?, ?, ?, ?, ?)').run(guildId, userId, cropId, plantedAt, wateredAt);
    }
}

function deleteDeadFarmPlots(guildId, userId) {
    if (checkGlobalMode()) {
        db.prepare("DELETE FROM farm_plots WHERE userId = ? AND status = 'dead'").run(userId);
    } else {
        db.prepare("DELETE FROM farm_plots WHERE guildId = ? AND userId = ? AND status = 'dead'").run(guildId, userId);
    }
}

function clearFarmStorage(guildId, userId) {
    if (checkGlobalMode()) {
        db.prepare('DELETE FROM farm_storage WHERE userId = ?').run(userId);
    } else {
        db.prepare('DELETE FROM farm_storage WHERE guildId = ? AND userId = ?').run(guildId, userId);
    }
}

function upgradeFarmLevel(guildId, userId, newLevel) {
    if (checkGlobalMode()) {
        db.prepare('UPDATE farm_data SET farm_level = ? WHERE userId = ?').run(newLevel, userId);
    } else {
        db.prepare('UPDATE farm_data SET farm_level = ? WHERE guildId = ? AND userId = ?').run(newLevel, guildId, userId);
    }
}

// ================= PERFORMANCE INDEXES =================
// Speeds up the hot read paths: leaderboards (ORDER BY / GROUP BY over large
// tables), per-user inventory lookups, and time-ranged log scans. Each index is
// created independently and wrapped in try/catch so a missing table/column (e.g.
// guildId in GLOBAL mode, or a table created lazily by another module) never
// blocks startup. CREATE INDEX is not rewritten by the global proxy, so we list
// guildId-composite indexes only when NOT in global mode.
(function createPerformanceIndexes() {
    const globalMode = checkGlobalMode();

    // Indexes valid in BOTH modes (columns always present).
    const commonIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_users_balance ON users(balance DESC)',
        'CREATE INDEX IF NOT EXISTS idx_users_level_xp ON users(level DESC, xp DESC)',
        'CREATE INDEX IF NOT EXISTS idx_user_stats_key_value ON user_stats(stat_key, stat_value DESC)',
        'CREATE INDEX IF NOT EXISTS idx_user_stats_user_key ON user_stats(userId, stat_key)',
        'CREATE INDEX IF NOT EXISTS idx_pets_active_level ON pets(active, level DESC)',
        'CREATE INDEX IF NOT EXISTS idx_pets_user ON pets(userId, level DESC)',
        'CREATE INDEX IF NOT EXISTS idx_streaks_count ON streaks(count DESC)',
        'CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(userId)',
        'CREATE INDEX IF NOT EXISTS idx_fish_inventory_user ON fish_inventory(userId)',
        'CREATE INDEX IF NOT EXISTS idx_farm_plots_user ON farm_plots(userId)',
        'CREATE INDEX IF NOT EXISTS idx_relics_user ON relics(userId)',
        'CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(time DESC)',
        'CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(status)',
    ];

    // Indexes that reference guildId — only valid in per-guild (non-global) mode.
    const perGuildIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_users_guild_balance ON users(guildId, balance DESC)',
        'CREATE INDEX IF NOT EXISTS idx_user_stats_guild_key ON user_stats(guildId, stat_key, stat_value DESC)',
        'CREATE INDEX IF NOT EXISTS idx_fish_inventory_guild_user ON fish_inventory(guildId, userId)',
        'CREATE INDEX IF NOT EXISTS idx_farm_plots_guild_user ON farm_plots(guildId, userId)',
        'CREATE INDEX IF NOT EXISTS idx_logs_guild_time ON logs(guildId, time DESC)',
    ];

    const indexes = globalMode ? commonIndexes : commonIndexes.concat(perGuildIndexes);
    let created = 0;
    for (const stmt of indexes) {
        try { _rawDb.exec(stmt); created++; } catch (e) { /* table/column may not exist yet */ }
    }
    if (created > 0) console.log(`⚡ Performance indexes ready (${created}/${indexes.length})`);
})();

// ================= EXPORTS (always at the very bottom) =================
module.exports = {
    db, checkGlobalMode,
    getOrCreateUser, getConf, getSetting, setSetting,
    getUserStat, incrementUserStat, setUserStat, setUserStatMax,
    addIncome, addSpending,
    getItemCount, addItem, removeItem,
    getPetFoodCount, addPetFood, removePetFood, getAllPetFood,
    getSeedCount, addSeed, removeSeed, getAllSeeds,
    getFertCount, addFert, removeFert, getAllFerts,
    getUsersForDailyReminder,
    updateUserBalance, addUserBalance, subtractUserBalance,
    getActivePetsHungry,
    getFarmDecorations, hasFarmDecoration, addFarmDecoration,
    getFarmPlot, insertFarmPlot, deleteDeadFarmPlots,
    clearFarmStorage, upgradeFarmLevel,
};
