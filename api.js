// api.js — REST API Server for Dashboard (Express on port 25922)
// Runs alongside the bot. Provides read/write access to bot database.
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { db, getOrCreateUser, getUserStat, incrementUserStat, setUserStat, getSetting, getItemCount, addItem, removeItem, updateUserBalance, checkGlobalMode } = require('./database');

const app = express();
const API_PORT = process.env.API_PORT || 25922;
const API_KEY = process.env.API_KEY || 'change-this-secret-key';
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').filter(Boolean);

// Discord client reference (set by bot.js)
let discordClient = null;
function setDiscordClient(client) { discordClient = client; }

// ==================== DISCORD USER RESOLVER ====================
const userCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 min

async function resolveUser(userId) {
    const cached = userCache.get(userId);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL) return cached;

    if (discordClient) {
        try {
            const user = await discordClient.users.fetch(userId).catch(() => null);
            if (user) {
                const data = { userId, username: user.username, displayName: user.globalName || user.username, avatar: user.displayAvatarURL({ size: 64 }), cachedAt: Date.now() };
                userCache.set(userId, data);
                return data;
            }
        } catch (e) { /* silent */ }
    }
    return { userId, username: userId, displayName: userId, avatar: null, cachedAt: Date.now() };
}

async function enrichLeaderboard(rows, userIdField = 'userId') {
    if (!rows || rows.length === 0) return rows;
    const ids = [...new Set(rows.map(r => r[userIdField]).filter(Boolean))];
    const users = {};
    await Promise.all(ids.map(async id => { users[id] = await resolveUser(id); }));
    return rows.map(r => ({ ...r, _user: users[r[userIdField]] || { username: r[userIdField], displayName: r[userIdField], avatar: null } }));
}

// Middleware
app.use(cors());
app.use(express.json());

// ==================== AUTH MIDDLEWARE ====================
function authMiddleware(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.apikey;
    if (!key || key !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing API key' });
    }
    next();
}

// Admin check (Discord user ID must be in ADMIN_IDS)
function adminCheck(req, res, next) {
    const userId = req.headers['x-user-id'];
    if (!userId || !ADMIN_IDS.includes(userId)) {
        return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }
    next();
}

// Apply auth to all routes
app.use(authMiddleware);

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '3.4.0', uptime: process.uptime(), timestamp: Date.now() });
});

// ==================== BOT STATS ====================
app.get('/api/stats', (req, res) => {
    try {
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
        const totalGuilds = db.prepare("SELECT COUNT(DISTINCT value) as count FROM server_settings WHERE key = 'welcome_shown'").get();
        const totalFishCaught = db.prepare('SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = ?').get('total_fish_caught');
        const totalFarmHarvests = db.prepare('SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = ?').get('total_harvests');
        const totalPets = db.prepare('SELECT COUNT(*) as count FROM pets').get();
        const totalAchievements = db.prepare('SELECT COUNT(*) as count FROM achievements').get();
        const totalMoney = db.prepare('SELECT SUM(balance) as total FROM users').get();
        const totalCommands = db.prepare('SELECT SUM(count) as total FROM command_summary').get();
        const totalMiningDigs = db.prepare('SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = ?').get('mining_digs');
        let totalMiners = { count: 0 };
        try { totalMiners = db.prepare('SELECT COUNT(*) as count FROM mining_data').get() || { count: 0 }; } catch (e) { /* table may not exist yet */ }

        res.json({
            users: totalUsers?.count || 0,
            guilds: totalGuilds?.count || 0,
            uptime: process.uptime(),
            version: '3.4.0',
            globalMode: checkGlobalMode(),
            stats: {
                totalFishCaught: totalFishCaught?.total || 0,
                totalFarmHarvests: totalFarmHarvests?.total || 0,
                totalPets: totalPets?.count || 0,
                totalAchievements: totalAchievements?.count || 0,
                totalMoney: totalMoney?.total || 0,
                totalCommands: totalCommands?.total || 0,
                totalMiningDigs: totalMiningDigs?.total || 0,
                totalMiners: totalMiners?.count || 0,
            }
        });
    } catch (e) {
        res.status(500).json({ error: 'Database error', message: e.message });
    }
});

// ==================== TOP COMMANDS ====================
app.get('/api/stats/commands', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const commands = db.prepare('SELECT command, SUM(count) as total FROM command_summary GROUP BY command ORDER BY total DESC LIMIT ?').all(limit);
        res.json({ commands });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== LEADERBOARD ====================
app.get('/api/leaderboard/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const limit = parseInt(req.query.limit) || 10;
        let rows = [];

        switch (type) {
            case 'money':
                rows = db.prepare('SELECT userId, balance, level FROM users ORDER BY balance DESC LIMIT ?').all(limit);
                break;
            case 'level':
                rows = db.prepare('SELECT userId, level, xp, balance FROM users ORDER BY level DESC, xp DESC LIMIT ?').all(limit);
                break;
            case 'fish':
                rows = db.prepare("SELECT userId, stat_value as total FROM user_stats WHERE stat_key = 'total_fish_caught' ORDER BY stat_value DESC LIMIT ?").all(limit);
                break;
            case 'farm':
                rows = db.prepare("SELECT userId, stat_value as total FROM user_stats WHERE stat_key = 'total_harvests' ORDER BY stat_value DESC LIMIT ?").all(limit);
                break;
            case 'achievement':
                rows = db.prepare('SELECT userId, COUNT(*) as total FROM achievements GROUP BY userId ORDER BY total DESC LIMIT ?').all(limit);
                break;
            case 'pet':
                rows = db.prepare('SELECT userId, MAX(level) as maxLevel, COUNT(*) as petCount FROM pets GROUP BY userId ORDER BY maxLevel DESC LIMIT ?').all(limit);
                break;
            case 'mining':
                try {
                    rows = db.prepare('SELECT userId, level, prestige, totalDigs FROM mining_data ORDER BY prestige DESC, level DESC, totalDigs DESC LIMIT ?').all(limit);
                } catch (e) { rows = []; }
                break;
            default:
                return res.status(400).json({ error: 'Invalid leaderboard type' });
        }

        res.json({ type, leaderboard: await enrichLeaderboard(rows) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== USER LOOKUP ====================
app.get('/api/users/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const user = checkGlobalMode()
            ? db.prepare('SELECT * FROM users WHERE userId = ?').get(userId)
            : db.prepare('SELECT * FROM users WHERE userId = ? LIMIT 1').get(userId);

        if (!user) return res.status(404).json({ error: 'User not found' });

        const achievements = db.prepare('SELECT achievementId, unlockedAt FROM achievements WHERE userId = ?').all(userId);
        const pets = db.prepare('SELECT petId, name, level, active, class, element FROM pets WHERE userId = ?').all(userId);
        const fishCount = getUserStat(null, userId, 'total_fish_caught');
        const farmCount = getUserStat(null, userId, 'total_harvests');

        res.json({
            user,
            achievements: achievements.length,
            achievementList: achievements,
            pets,
            stats: { fishCount, farmCount }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== USER SEARCH ====================
app.get('/api/users', (req, res) => {
    try {
        const { search, limit: lim } = req.query;
        const limit = parseInt(lim) || 20;

        let users;
        if (search) {
            users = db.prepare('SELECT userId, level, balance FROM users WHERE userId LIKE ? ORDER BY level DESC LIMIT ?').all(`%${search}%`, limit);
        } else {
            users = db.prepare('SELECT userId, level, balance FROM users ORDER BY level DESC LIMIT ?').all(limit);
        }

        res.json({ users, total: users.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ADMIN: MANAGE USER BALANCE ====================
app.post('/api/admin/balance', adminCheck, (req, res) => {
    try {
        const { userId, action, amount } = req.body;
        if (!userId || !action || !amount) return res.status(400).json({ error: 'Missing userId, action, or amount' });

        const user = getOrCreateUser(null, userId);
        let newBalance = user.balance;

        if (action === 'add') newBalance += parseInt(amount);
        else if (action === 'remove') newBalance = Math.max(0, newBalance - parseInt(amount));
        else if (action === 'set') newBalance = parseInt(amount);
        else return res.status(400).json({ error: 'Invalid action (add/remove/set)' });

        updateUserBalance(null, userId, newBalance);
        res.json({ success: true, userId, oldBalance: user.balance, newBalance });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ADMIN: MANAGE USER LEVEL ====================
app.post('/api/admin/level', adminCheck, (req, res) => {
    try {
        const { userId, level } = req.body;
        if (!userId || level === undefined) return res.status(400).json({ error: 'Missing userId or level' });

        db.prepare('UPDATE users SET level = ? WHERE userId = ?').run(parseInt(level), userId);
        res.json({ success: true, userId, newLevel: parseInt(level) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ADMIN: GIVE/REMOVE ITEMS ====================
app.post('/api/admin/items', adminCheck, (req, res) => {
    try {
        const { userId, itemId, action, quantity } = req.body;
        if (!userId || !itemId || !action) return res.status(400).json({ error: 'Missing fields' });

        const qty = parseInt(quantity) || 1;
        if (action === 'give') {
            addItem(null, userId, itemId, qty);
        } else if (action === 'remove') {
            removeItem(null, userId, itemId, qty);
        } else {
            return res.status(400).json({ error: 'Invalid action (give/remove)' });
        }

        const current = getItemCount(null, userId, itemId);
        res.json({ success: true, userId, itemId, action, quantity: qty, currentCount: current });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ADMIN: PETS ====================
app.post('/api/admin/pets/give', adminCheck, (req, res) => {
    try {
        const { userId, petId, name, level } = req.body;
        if (!userId || !petId) return res.status(400).json({ error: 'Missing userId or petId' });
        const { PET_DATA } = require('./data/pets');
        const { generatePetStats } = require('./systems/pets');
        const petDef = PET_DATA.find(p => p.id === petId);
        if (!petDef) return res.status(400).json({ error: 'Invalid petId' });

        const petName = name || petDef.name;
        const petLevel = parseInt(level) || 1;
        const stats = generatePetStats(petDef.tier);
        const classes = ['warrior','mage','assassin','tank','support'];
        const elements = ['fire','water','earth','wind','light','dark'];
        const cls = classes[Math.floor(Math.random() * classes.length)];
        const elem = elements[Math.floor(Math.random() * elements.length)];

        // Deactivate existing active pet
        db.prepare('UPDATE pets SET active = 0 WHERE userId = ? AND active = 1').run(userId);
        db.prepare('INSERT INTO pets (userId, petId, name, level, exp, hp, atk, def, spd, crit, happiness, hunger, status, active, class, element) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 100, 100, ?, 1, ?, ?)').run(userId, petId, petName, petLevel, stats.hp, stats.atk, stats.def, stats.spd, stats.crit, 'healthy', cls, elem);
        res.json({ success: true, userId, petId, name: petName, level: petLevel, stats });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/pets/setlevel', adminCheck, (req, res) => {
    try {
        const { userId, level } = req.body;
        if (!userId || !level) return res.status(400).json({ error: 'Missing fields' });
        const pet = db.prepare('SELECT * FROM pets WHERE userId = ? AND active = 1').get(userId);
        if (!pet) return res.status(404).json({ error: 'No active pet' });
        db.prepare('UPDATE pets SET level = ?, exp = 0 WHERE id = ?').run(parseInt(level), pet.id);
        res.json({ success: true, userId, petName: pet.name, newLevel: parseInt(level) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/pets/setstats', adminCheck, (req, res) => {
    try {
        const { userId, hp, atk, def, spd, crit } = req.body;
        if (!userId) return res.status(400).json({ error: 'Missing userId' });
        const pet = db.prepare('SELECT * FROM pets WHERE userId = ? AND active = 1').get(userId);
        if (!pet) return res.status(404).json({ error: 'No active pet' });
        if (hp) db.prepare('UPDATE pets SET hp = ? WHERE id = ?').run(parseInt(hp), pet.id);
        if (atk) db.prepare('UPDATE pets SET atk = ? WHERE id = ?').run(parseInt(atk), pet.id);
        if (def) db.prepare('UPDATE pets SET def = ? WHERE id = ?').run(parseInt(def), pet.id);
        if (spd) db.prepare('UPDATE pets SET spd = ? WHERE id = ?').run(parseInt(spd), pet.id);
        if (crit) db.prepare('UPDATE pets SET crit = ? WHERE id = ?').run(parseInt(crit), pet.id);
        res.json({ success: true, userId, petName: pet.name, updated: { hp, atk, def, spd, crit } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/pets/delete', adminCheck, (req, res) => {
    try {
        const { userId, petDbId } = req.body;
        if (!userId) return res.status(400).json({ error: 'Missing userId' });
        if (petDbId) {
            db.prepare('DELETE FROM pets WHERE id = ? AND userId = ?').run(parseInt(petDbId), userId);
        } else {
            db.prepare('DELETE FROM pets WHERE userId = ? AND active = 1').run(userId);
        }
        res.json({ success: true, userId, deleted: petDbId || 'active' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/pets/list/:userId', adminCheck, (req, res) => {
    try {
        const { userId } = req.params;
        const pets = db.prepare('SELECT * FROM pets WHERE userId = ?').all(userId);
        res.json({ pets });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ADMIN: FISHING ====================
app.post('/api/admin/fish/equipment', adminCheck, (req, res) => {
    try {
        const { userId, rod, bait, bait_count, location } = req.body;
        if (!userId) return res.status(400).json({ error: 'Missing userId' });
        const eq = db.prepare('SELECT * FROM fish_equipment WHERE userId = ?').get(userId);
        if (!eq) { db.prepare('INSERT INTO fish_equipment (userId) VALUES (?)').run(userId); }
        if (rod) db.prepare('UPDATE fish_equipment SET rod = ? WHERE userId = ?').run(rod, userId);
        if (bait) db.prepare('UPDATE fish_equipment SET bait = ? WHERE userId = ?').run(bait, userId);
        if (bait_count !== undefined) db.prepare('UPDATE fish_equipment SET bait_count = ? WHERE userId = ?').run(parseInt(bait_count), userId);
        if (location) db.prepare('UPDATE fish_equipment SET location = ? WHERE userId = ?').run(location, userId);
        const updated = db.prepare('SELECT * FROM fish_equipment WHERE userId = ?').get(userId);
        res.json({ success: true, userId, equipment: updated });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/fish/collection', adminCheck, (req, res) => {
    try {
        const { userId, fishId, action } = req.body;
        if (!userId || !fishId) return res.status(400).json({ error: 'Missing fields' });
        if (action === 'add') {
            db.prepare('INSERT OR IGNORE INTO fish_collection (guildId, userId, fishId, caughtAt) VALUES (?, ?, ?, ?)').run('global', userId, fishId, Date.now());
        } else {
            db.prepare('DELETE FROM fish_collection WHERE userId = ? AND fishId = ?').run(userId, fishId);
        }
        const count = db.prepare('SELECT COUNT(*) as c FROM fish_collection WHERE userId = ?').get(userId);
        res.json({ success: true, userId, fishId, action, totalCollection: count.c });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ADMIN: FARMING ====================
app.post('/api/admin/farm/level', adminCheck, (req, res) => {
    try {
        const { userId, farmLevel } = req.body;
        if (!userId || !farmLevel) return res.status(400).json({ error: 'Missing fields' });
        db.prepare('INSERT OR REPLACE INTO farm_data (guildId, userId, farm_level) VALUES (?, ?, ?)').run('global', userId, parseInt(farmLevel));
        res.json({ success: true, userId, newFarmLevel: parseInt(farmLevel) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/farm/seeds', adminCheck, (req, res) => {
    try {
        const { userId, seedId, action, quantity } = req.body;
        if (!userId || !seedId || !action) return res.status(400).json({ error: 'Missing fields' });
        const qty = parseInt(quantity) || 1;
        const { addSeed, removeSeed, getSeedCount } = require('./database');
        if (action === 'give') addSeed(null, userId, seedId, qty);
        else if (action === 'remove') removeSeed(null, userId, seedId, qty);
        const current = getSeedCount(null, userId, seedId);
        res.json({ success: true, userId, seedId, action, quantity: qty, currentCount: current });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/farm/fertilizer', adminCheck, (req, res) => {
    try {
        const { userId, fertId, action, quantity } = req.body;
        if (!userId || !fertId || !action) return res.status(400).json({ error: 'Missing fields' });
        const qty = parseInt(quantity) || 1;
        const { addFert, removeFert, getFertCount } = require('./database');
        if (action === 'give') addFert(null, userId, fertId, qty);
        else if (action === 'remove') removeFert(null, userId, fertId, qty);
        const current = getFertCount(null, userId, fertId);
        res.json({ success: true, userId, fertId, action, quantity: qty, currentCount: current });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ADMIN: STREAK ====================
app.post('/api/admin/streak', adminCheck, (req, res) => {
    try {
        const { userId, action, value } = req.body;
        if (!userId || !action) return res.status(400).json({ error: 'Missing fields' });
        if (action === 'set') {
            const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
            db.prepare('INSERT OR REPLACE INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, ?, ?)').run('global', userId, parseInt(value), today);
            res.json({ success: true, userId, newStreak: parseInt(value) });
        } else if (action === 'reset') {
            db.prepare('DELETE FROM streaks WHERE userId = ?').run(userId);
            res.json({ success: true, userId, streak: 0 });
        } else {
            return res.status(400).json({ error: 'Invalid action (set/reset)' });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ADMIN: XP ====================
app.post('/api/admin/xp', adminCheck, (req, res) => {
    try {
        const { userId, xp } = req.body;
        if (!userId || xp === undefined) return res.status(400).json({ error: 'Missing fields' });
        db.prepare('UPDATE users SET xp = ? WHERE userId = ?').run(parseInt(xp), userId);
        res.json({ success: true, userId, newXp: parseInt(xp) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ADMIN: STATS ====================
app.post('/api/admin/stat', adminCheck, (req, res) => {
    try {
        const { userId, key, value } = req.body;
        if (!userId || !key || value === undefined) return res.status(400).json({ error: 'Missing fields' });
        setUserStat(null, userId, key, parseInt(value));
        res.json({ success: true, userId, key, value: parseInt(value) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ADMIN: ACHIEVEMENTS ====================
app.post('/api/admin/achievement', adminCheck, (req, res) => {
    try {
        const { userId, achievementId, action } = req.body;
        if (!userId || !achievementId || !action) return res.status(400).json({ error: 'Missing fields' });
        if (action === 'give') {
            db.prepare('INSERT OR IGNORE INTO achievements (guildId, userId, achievementId, unlockedAt) VALUES (?, ?, ?, ?)').run('global', userId, achievementId, Date.now());
        } else if (action === 'remove') {
            db.prepare('DELETE FROM achievements WHERE userId = ? AND achievementId = ?').run(userId, achievementId);
        }
        const total = db.prepare('SELECT COUNT(*) as c FROM achievements WHERE userId = ?').get(userId);
        res.json({ success: true, userId, achievementId, action, totalAchievements: total.c });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ADMIN: DATA CATALOG (for dashboard dropdowns) ====================
app.get('/api/admin/catalog', adminCheck, (req, res) => {
    try {
        const { ITEMS } = require('./data/items');
        const { PET_DATA } = require('./data/pets');
        const { FARM_CROPS, FARM_FERTILIZERS, FARM_DECORATIONS } = require('./data/farming');
        const { ROD_TYPES, BAIT_TYPES, FISHING_LOCATIONS } = require('./data/fish');
        const { ACHIEVEMENTS: ACH_LIST } = require('./systems/achievements');
        let mining = { pickaxes: [], ores: [], bars: [], gems: [] };
        try {
            const M = require('./data/mining');
            mining = {
                pickaxes: M.PICKAXE_TYPES.map(p => ({ id: p.id, name: p.name, tier: p.tier, maxDepth: p.maxDepth })),
                ores: M.ORE_TIERS.map(o => ({ id: o.id, name: o.name, emoji: o.emoji, rarity: o.rarity, value: o.value })),
                bars: (M.BARS || []).map(b => ({ id: b.id, name: b.name, emoji: b.emoji, value: b.value })),
                gems: (M.GEMS || []).map(g => ({ id: g.id, name: g.name, emoji: g.emoji, stat: g.stat })),
            };
        } catch (e) { /* mining data optional */ }
        res.json({
            items: ITEMS.map(i => ({ id: i.id, name: i.name, emoji: i.menuEmoji || i.emoji, category: i.category, price: i.price })),
            pets: PET_DATA.map(p => ({ id: p.id, name: p.name, emoji: p.emoji, tier: p.tier })),
            crops: FARM_CROPS.map(c => ({ id: c.id, name: c.name, emoji: c.emoji, tier: c.tier })),
            fertilizers: FARM_FERTILIZERS.map(f => ({ id: f.id, name: f.name, emoji: f.emoji })),
            decorations: FARM_DECORATIONS.map(d => ({ id: d.id, name: d.name, emoji: d.emoji })),
            rods: ROD_TYPES.map(r => ({ id: r.id, name: r.name, tier: r.tier })),
            baits: BAIT_TYPES.map(b => ({ id: b.id, name: b.name, price: b.price })),
            locations: FISHING_LOCATIONS.map(l => ({ id: l.id, name: l.name })),
            achievements: ACH_LIST ? ACH_LIST.map(a => ({ id: a.id, name: a.name, emoji: a.emoji, category: a.category })) : [],
            mining,
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== ADMIN: SERVER SETTINGS ====================
app.get('/api/admin/settings', adminCheck, (req, res) => {
    try {
        const settings = db.prepare('SELECT * FROM server_settings').all();
        res.json({ settings });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/settings', adminCheck, (req, res) => {
    try {
        const { guildId, key, value } = req.body;
        if (!key) return res.status(400).json({ error: 'Missing key' });

        const gid = guildId || 'global';
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(gid, key, value);
        res.json({ success: true, guildId: gid, key, value });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ADMIN: RESET USER ====================
app.post('/api/admin/reset-user', adminCheck, (req, res) => {
    try {
        const { userId, resetType } = req.body;
        if (!userId || !resetType) return res.status(400).json({ error: 'Missing userId or resetType' });

        switch (resetType) {
            case 'balance':
                db.prepare('UPDATE users SET balance = 0 WHERE userId = ?').run(userId);
                break;
            case 'level':
                db.prepare('UPDATE users SET level = 0, xp = 0 WHERE userId = ?').run(userId);
                break;
            case 'fish':
                db.prepare('DELETE FROM fish_inventory WHERE userId = ?').run(userId);
                db.prepare('DELETE FROM fish_collection WHERE userId = ?').run(userId);
                break;
            case 'pets':
                db.prepare('DELETE FROM pets WHERE userId = ?').run(userId);
                break;
            case 'mining':
                try {
                    db.prepare('DELETE FROM mining_data WHERE userId = ?').run(userId);
                    db.prepare('DELETE FROM ore_inventory WHERE userId = ?').run(userId);
                } catch (e) { /* tables optional */ }
                break;
            case 'all':
                db.prepare('DELETE FROM users WHERE userId = ?').run(userId);
                db.prepare('DELETE FROM user_stats WHERE userId = ?').run(userId);
                db.prepare('DELETE FROM achievements WHERE userId = ?').run(userId);
                db.prepare('DELETE FROM pets WHERE userId = ?').run(userId);
                db.prepare('DELETE FROM fish_inventory WHERE userId = ?').run(userId);
                db.prepare('DELETE FROM fish_collection WHERE userId = ?').run(userId);
                db.prepare('DELETE FROM item_inventory WHERE userId = ?').run(userId);
                try {
                    db.prepare('DELETE FROM mining_data WHERE userId = ?').run(userId);
                    db.prepare('DELETE FROM ore_inventory WHERE userId = ?').run(userId);
                } catch (e) { /* mining tables optional */ }
                break;
            default:
                return res.status(400).json({ error: 'Invalid resetType' });
        }

        res.json({ success: true, userId, resetType });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ADMIN: RAW QUERY (careful!) ====================
app.post('/api/admin/query', adminCheck, (req, res) => {
    try {
        const { sql, params } = req.body;
        if (!sql) return res.status(400).json({ error: 'Missing sql' });

        // Safety: only allow SELECT
        if (!sql.trim().toUpperCase().startsWith('SELECT')) {
            return res.status(403).json({ error: 'Only SELECT queries allowed via this endpoint' });
        }

        const result = db.prepare(sql).all(...(params || []));
        res.json({ rows: result, count: result.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== FISHING WEATHER ====================
app.get('/api/fishing/weather', (req, res) => {
    try {
        const { getFishingWeather } = require('./systems/fishing');
        const weather = getFishingWeather();
        res.json(weather);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== USER GUILDS (for dashboard server picker) ====================
app.get('/api/user/guilds', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) return res.status(400).json({ error: 'Missing x-user-id header' });

        if (!discordClient) return res.json({ guilds: [] });

        const userGuilds = [];
        for (const [, guild] of discordClient.guilds.cache) {
            try {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member && member.permissions.has('Administrator')) {
                    userGuilds.push({
                        id: guild.id,
                        name: guild.name,
                        icon: guild.iconURL({ size: 64 }) || null,
                        memberCount: guild.memberCount,
                    });
                }
            } catch (e) { /* skip */ }
        }

        res.json({ guilds: userGuilds });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== GUILD DATA (for dashboard selectors) ====================
app.get('/api/guild/:guildId/channels', async (req, res) => {
    try {
        const { guildId } = req.params;
        if (!discordClient) return res.json({ channels: [] });
        const guild = discordClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        const channels = guild.channels.cache
            .filter(ch => ch.type !== undefined)
            .map(ch => ({
                id: ch.id,
                name: ch.name,
                type: ch.type, // 0=text, 2=voice, 4=category, 5=announcement, 13=stage, 15=forum
                parentId: ch.parentId || null,
                position: ch.position,
            }))
            .sort((a, b) => a.position - b.position);

        res.json({ channels });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/guild/:guildId/roles', async (req, res) => {
    try {
        const { guildId } = req.params;
        if (!discordClient) return res.json({ roles: [] });
        const guild = discordClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        const roles = guild.roles.cache
            .filter(r => r.id !== guildId) // exclude @everyone
            .map(r => ({
                id: r.id,
                name: r.name,
                color: r.hexColor,
                position: r.position,
                managed: r.managed, // bot roles
                icon: r.iconURL({ size: 32 }) || null,
            }))
            .sort((a, b) => b.position - a.position);

        res.json({ roles });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/guild/:guildId/members', async (req, res) => {
    try {
        const { guildId } = req.params;
        const limit = parseInt(req.query.limit) || 100;
        const search = req.query.search || '';
        if (!discordClient) return res.json({ members: [] });
        const guild = discordClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });

        let members;
        if (search) {
            members = await guild.members.search({ query: search, limit });
        } else {
            await guild.members.fetch({ limit });
            members = guild.members.cache;
        }

        const result = members
            .filter(m => !m.user.bot)
            .map(m => ({
                id: m.id,
                username: m.user.username,
                displayName: m.displayName,
                avatar: m.user.displayAvatarURL({ size: 32 }),
            }));

        res.json({ members: Array.from(result.values()).slice(0, limit) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== AUTOMOD ====================
app.get('/api/automod/:guildId', async (req, res) => {
    try {
        const { AUTOMOD_MODULES, getAllModuleStates, getAutomodSetting, getBlockedWords, getWhitelist, getIgnoredChannels } = require('./systems/automod');
        const { guildId } = req.params;
        res.json({
            modules: AUTOMOD_MODULES,
            states: getAllModuleStates(guildId),
            settings: {
                mod_log_channel: getAutomodSetting(guildId, 'mod_log_channel'),
                audit_log_channel: getAutomodSetting(guildId, 'audit_log_channel'),
            },
            blockedWords: getBlockedWords(guildId),
            whitelist: getWhitelist(guildId),
            ignoredChannels: getIgnoredChannels(guildId),
            recentLogs: db.prepare('SELECT * FROM automod_logs WHERE guildId = ? ORDER BY timestamp DESC LIMIT 20').all(guildId),
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automod/:guildId/toggle', adminCheck, (req, res) => {
    try {
        const { setModuleEnabled, isModuleEnabled } = require('./systems/automod');
        const { guildId } = req.params;
        const { moduleId, enabled } = req.body;
        if (!moduleId) return res.status(400).json({ error: 'Missing moduleId' });
        setModuleEnabled(guildId, moduleId, enabled !== undefined ? enabled : !isModuleEnabled(guildId, moduleId));
        res.json({ success: true, moduleId, enabled: isModuleEnabled(guildId, moduleId) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automod/:guildId/settings', adminCheck, (req, res) => {
    try {
        const { setAutomodSetting } = require('./systems/automod');
        const { guildId } = req.params;
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ error: 'Missing key' });
        setAutomodSetting(guildId, key, value || '');
        res.json({ success: true, key, value });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automod/:guildId/words', adminCheck, (req, res) => {
    try {
        const { addBlockedWord, removeBlockedWord, getBlockedWords } = require('./systems/automod');
        const { guildId } = req.params;
        const { action, word } = req.body;
        if (!word) return res.status(400).json({ error: 'Missing word' });
        if (action === 'add') addBlockedWord(guildId, word);
        else if (action === 'remove') removeBlockedWord(guildId, word);
        res.json({ success: true, blockedWords: getBlockedWords(guildId) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automod/:guildId/whitelist', adminCheck, (req, res) => {
    try {
        const { addWhitelist, removeWhitelist, getWhitelist } = require('./systems/automod');
        const { guildId } = req.params;
        const { action, targetId, type } = req.body;
        if (!targetId) return res.status(400).json({ error: 'Missing targetId' });
        if (action === 'add') addWhitelist(guildId, targetId, type || 'user');
        else if (action === 'remove') removeWhitelist(guildId, targetId);
        res.json({ success: true, whitelist: getWhitelist(guildId) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automod/:guildId/channels', adminCheck, (req, res) => {
    try {
        const { addIgnoredChannel, removeIgnoredChannel, getIgnoredChannels } = require('./systems/automod');
        const { guildId } = req.params;
        const { action, channelId } = req.body;
        if (!channelId) return res.status(400).json({ error: 'Missing channelId' });
        if (action === 'add') addIgnoredChannel(guildId, channelId);
        else if (action === 'remove') removeIgnoredChannel(guildId, channelId);
        res.json({ success: true, ignoredChannels: getIgnoredChannels(guildId) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== STREAK SETTINGS ====================
app.get('/api/streak/settings/:guildId', (req, res) => {
    try {
        const { guildId } = req.params;
        const keys = ['streak_enabled', 'streak_emoji', 'streak_min_days', 'streak_monthly_restore', 'streak_timezone', 'streak_auto_nickname', 'streak_reward_7', 'streak_reward_14', 'streak_reward_30', 'streak_reward_60', 'streak_reward_100', 'streak_role_7', 'streak_role_14', 'streak_role_30', 'streak_role_60', 'streak_role_100', 'streak_announce_channel', 'streak_announce_message'];
        const settings = {};
        for (const key of keys) {
            const row = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, key);
            settings[key] = row ? row.value : null;
        }
        const defaults = { streak_enabled: '1', streak_emoji: '🔥', streak_min_days: '3', streak_monthly_restore: '5', streak_timezone: 'Asia/Jakarta', streak_auto_nickname: '0', streak_reward_7: '1000', streak_reward_14: '2500', streak_reward_30: '5000', streak_reward_60: '10000', streak_reward_100: '25000', streak_role_7: '', streak_role_14: '', streak_role_30: '', streak_role_60: '', streak_role_100: '', streak_announce_channel: '', streak_announce_message: '{user.mention} mencapai streak **{streak}** hari! 🔥' };
        const merged = {};
        for (const key of keys) merged[key] = settings[key] !== null ? settings[key] : defaults[key];
        res.json({ settings: merged });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/streak/settings/:guildId', adminCheck, (req, res) => {
    try {
        const { guildId } = req.params;
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'Missing settings' });
        for (const [key, value] of Object.entries(settings)) {
            db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, key, String(value));
        }
        res.json({ success: true, saved: Object.keys(settings).length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== STREAK ====================
app.get('/api/streak/leaderboard', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';
        const sort = req.query.sort || 'current'; // current or highest

        let rows;
        if (search) {
            rows = db.prepare('SELECT userId, count, last_date FROM streaks WHERE userId LIKE ? ORDER BY count DESC LIMIT ?').all(`%${search}%`, limit);
        } else {
            rows = db.prepare('SELECT userId, count, last_date FROM streaks ORDER BY count DESC LIMIT ?').all(limit);
        }

        // Get highest streak from streak_history
        const highestStreaks = {};
        const historyRows = db.prepare('SELECT userId, lost_count FROM streak_history').all();
        for (const h of historyRows) { highestStreaks[h.userId] = Math.max(highestStreaks[h.userId] || 0, h.lost_count); }
        // Also compare with current streak
        for (const r of rows) { highestStreaks[r.userId] = Math.max(highestStreaks[r.userId] || 0, r.count); }

        // Get freezes (streak_shield items)
        const freezeData = {};
        try {
            const shields = db.prepare("SELECT userId, quantity FROM item_inventory WHERE itemId = 'streak_shield' AND quantity > 0").all();
            for (const s of shields) freezeData[s.userId] = s.quantity;
        } catch(e) {}

        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

        const enriched = await enrichLeaderboard(rows);
        const withExtras = enriched.map(r => ({
            ...r,
            highest: highestStreaks[r.userId] || r.count,
            freezes: freezeData[r.userId] || 0,
            claimedToday: r.last_date === today,
        }));

        // Sort
        if (sort === 'highest') withExtras.sort((a, b) => b.highest - a.highest);

        const totalMembers = db.prepare('SELECT COUNT(*) as count FROM streaks WHERE count > 0').get();
        const topStreak = db.prepare('SELECT MAX(count) as max FROM streaks').get();

        res.json({
            totalMembers: totalMembers?.count || 0,
            topCurrentStreak: topStreak?.max || 0,
            claimedToday: withExtras.filter(r => r.claimedToday).length,
            leaderboard: withExtras,
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== LEVELING SETTINGS ====================
app.get('/api/leveling/settings/:guildId', (req, res) => {
    try {
        const { guildId } = req.params;
        const keys = ['leveling_enabled', 'msg_xp_enabled', 'voice_xp_enabled', 'reaction_xp_enabled', 'levelup_announce_enabled', 'levelup_channel', 'levelup_message', 'msg_xp_min', 'msg_xp_max', 'msg_xp_cooldown', 'voice_xp_min', 'voice_xp_max', 'voice_xp_cooldown', 'reaction_xp_min', 'reaction_xp_max', 'reaction_xp_cooldown', 'xp_multiplier', 'max_level', 'no_xp_channels', 'no_xp_roles', 'role_rewards'];
        const settings = {};
        for (const key of keys) {
            const row = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, key);
            settings[key] = row ? row.value : null;
        }
        const defaults = { leveling_enabled: '1', msg_xp_enabled: '1', voice_xp_enabled: '1', reaction_xp_enabled: '1', levelup_announce_enabled: '1', levelup_channel: '', levelup_message: 'Selamat {user.mention}! Kamu naik ke **Level {user.level}**! 🎉', msg_xp_min: '5', msg_xp_max: '15', msg_xp_cooldown: '60', voice_xp_min: '3', voice_xp_max: '8', voice_xp_cooldown: '60', reaction_xp_min: '1', reaction_xp_max: '5', reaction_xp_cooldown: '30', xp_multiplier: '1', max_level: '200', no_xp_channels: '[]', no_xp_roles: '[]', role_rewards: '[]' };
        const merged = {};
        for (const key of keys) merged[key] = settings[key] !== null ? settings[key] : defaults[key];
        res.json({ settings: merged });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/leveling/settings/:guildId', adminCheck, (req, res) => {
    try {
        const { guildId } = req.params;
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'Missing settings object' });
        for (const [key, value] of Object.entries(settings)) {
            db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, key, String(value));
        }
        res.json({ success: true, saved: Object.keys(settings).length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== LEVELING ====================
app.get('/api/leveling/leaderboard', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';
        let rows;
        if (search) {
            rows = db.prepare('SELECT userId, level, xp FROM users WHERE userId LIKE ? ORDER BY level DESC, xp DESC LIMIT ?').all(`%${search}%`, limit);
        } else {
            rows = db.prepare('SELECT userId, level, xp FROM users ORDER BY level DESC, xp DESC LIMIT ?').all(limit);
        }
        const totalMembers = db.prepare('SELECT COUNT(*) as count FROM users').get();
        const topLevel = db.prepare('SELECT MAX(level) as max FROM users').get();
        const topXp = db.prepare('SELECT MAX(xp) as max FROM users').get();

        // Calculate XP to next level for each user
        const enriched = await enrichLeaderboard(rows);
        const withXpCalc = enriched.map(r => {
            const xpToNext = (r.level + 1) * (r.level + 1) * 100; // formula: level^2 * 100
            return { ...r, xpToNext };
        });

        res.json({
            totalMembers: totalMembers?.count || 0,
            topLevel: topLevel?.max || 0,
            topXp: topXp?.max || 0,
            leaderboard: withXpCalc,
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== FISHING STATS ====================
app.get('/api/fishing/stats', async (req, res) => {
    try {
        const totalCaught = db.prepare("SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = 'total_fish_caught'").get();
        const totalSold = db.prepare("SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = 'total_fish_sold_value'").get();
        const totalGiantDefeated = db.prepare("SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = 'giant_fish_defeated'").get();
        const totalMonsters = db.prepare("SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = 'sea_monster_encounters'").get();
        const topFishers = db.prepare("SELECT userId, stat_value as total FROM user_stats WHERE stat_key = 'total_fish_caught' ORDER BY stat_value DESC LIMIT 10").all();
        const collectionStats = db.prepare("SELECT userId, COUNT(*) as collected FROM fish_collection GROUP BY userId ORDER BY collected DESC LIMIT 10").all();
        const { FISH_DATA, FISH_TIERS, FISHING_LOCATIONS } = require('./data/fish');

        res.json({
            totalCaught: totalCaught?.total || 0,
            totalSoldValue: totalSold?.total || 0,
            totalGiantDefeated: totalGiantDefeated?.total || 0,
            totalMonsterEncounters: totalMonsters?.total || 0,
            totalFishSpecies: FISH_DATA.length,
            totalLocations: FISHING_LOCATIONS.length,
            tiers: FISH_TIERS.map(t => t.tier),
            topFishers: await enrichLeaderboard(topFishers),
            topCollectors: await enrichLeaderboard(collectionStats),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/fishing/collection', (req, res) => {
    try {
        const { FISH_DATA, FISH_TIERS, FISHING_LOCATIONS } = require('./data/fish');
        const fishByLocation = {};
        for (const loc of FISHING_LOCATIONS) {
            fishByLocation[loc.id] = { name: loc.name, desc: loc.desc, fish: FISH_DATA.filter(f => f.location === loc.id).map(f => ({ id: f.id, name: f.name, tier: f.tier, emoji: f.emoji })) };
        }
        res.json({ totalFish: FISH_DATA.length, tiers: FISH_TIERS, locations: FISHING_LOCATIONS.map(l => ({ id: l.id, name: l.name, desc: l.desc, tiers: l.tiers, monsterChance: l.monsterChance || 0 })), fishByLocation });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== FARMING STATS ====================
app.get('/api/farming/stats', async (req, res) => {
    try {
        const totalHarvests = db.prepare("SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = 'total_harvests'").get();
        const totalCrafts = db.prepare("SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = 'total_crafts'").get();
        const totalMutations = db.prepare("SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = 'total_mutations'").get();
        const activePlots = db.prepare("SELECT COUNT(*) as count FROM farm_plots WHERE status = 'growing'").get();
        const topFarmers = db.prepare("SELECT userId, stat_value as total FROM user_stats WHERE stat_key = 'total_harvests' ORDER BY stat_value DESC LIMIT 10").all();
        const { FARM_CROPS } = require('./data/farming');

        res.json({
            totalHarvests: totalHarvests?.total || 0,
            totalCrafts: totalCrafts?.total || 0,
            totalMutations: totalMutations?.total || 0,
            activePlots: activePlots?.count || 0,
            totalCropTypes: FARM_CROPS.length,
            topFarmers: await enrichLeaderboard(topFarmers),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== PET STATS ====================
app.get('/api/pets/stats', async (req, res) => {
    try {
        const totalPets = db.prepare("SELECT COUNT(*) as count FROM pets").get();
        const totalEvolved = db.prepare("SELECT COUNT(*) as count FROM pets WHERE evolved = 1").get();
        const avgLevel = db.prepare("SELECT AVG(level) as avg FROM pets").get();
        const maxLevel = db.prepare("SELECT MAX(level) as max FROM pets").get();
        const topPets = db.prepare("SELECT userId, name, petId, level, class, element, active FROM pets ORDER BY level DESC LIMIT 10").all();
        const petsByTier = db.prepare("SELECT petId, COUNT(*) as count FROM pets GROUP BY petId ORDER BY count DESC LIMIT 15").all();
        const dungeonClears = db.prepare("SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = 'dungeon_clears'").get();
        const bossKills = db.prepare("SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = 'boss_kills'").get();
        const pvpWins = db.prepare("SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = 'pvp_wins'").get();

        res.json({
            totalPets: totalPets?.count || 0,
            totalEvolved: totalEvolved?.count || 0,
            avgLevel: Math.round(avgLevel?.avg || 0),
            maxLevel: maxLevel?.max || 0,
            dungeonClears: dungeonClears?.total || 0,
            bossKills: bossKills?.total || 0,
            pvpWins: pvpWins?.total || 0,
            topPets: await enrichLeaderboard(topPets),
            popularPets: petsByTier,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== MINING STATS ====================
app.get('/api/mining/stats', async (req, res) => {
    try {
        const stat = (k) => { const r = db.prepare('SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = ?').get(k); return r?.total || 0; };
        let totalMiners = 0, topByLevel = [], topByPrestige = [], maxDepth = 0;
        try {
            totalMiners = db.prepare('SELECT COUNT(*) as c FROM mining_data').get()?.c || 0;
            topByLevel = db.prepare('SELECT userId, level, prestige, totalDigs, depth FROM mining_data ORDER BY prestige DESC, level DESC, totalDigs DESC LIMIT 10').all();
            topByPrestige = db.prepare('SELECT userId, prestige, level FROM mining_data WHERE prestige > 0 ORDER BY prestige DESC LIMIT 10').all();
            maxDepth = db.prepare('SELECT MAX(depth) as max FROM mining_data').get()?.max || 0;
        } catch (e) { /* mining tables not created yet */ }

        let layers = [], pickaxes = [], ores = [];
        try {
            const M = require('./data/mining');
            layers = M.MINE_LAYERS.map(l => ({ id: l.id, name: l.name, min: l.min, max: l.max, hazard: l.hazard || 0 }));
            pickaxes = M.PICKAXE_TYPES.map(p => ({ id: p.id, name: p.name, tier: p.tier, maxDepth: p.maxDepth }));
            ores = M.ORE_TIERS.map(o => ({ id: o.id, name: o.name, rarity: o.rarity, value: o.value }));
        } catch (e) { /* optional */ }

        res.json({
            totalMiners,
            maxDepthReached: maxDepth,
            totalDigs: stat('mining_digs'),
            totalOreSold: stat('mining_ore_sold'),
            totalBarsSmelted: stat('mining_bars_smelted'),
            totalItemsSmithed: stat('mining_items_smithed'),
            totalHazards: stat('mining_hazards'),
            totalMonstersDefeated: stat('mining_monsters_defeated'),
            totalGemsFused: stat('mining_gems_fused'),
            totalCoreClears: stat('mining_core_clears'),
            totalPrestige: stat('mining_prestige'),
            totalLayers: layers.length,
            totalPickaxes: pickaxes.length,
            totalOreTypes: ores.length,
            layers, pickaxes, ores,
            topMiners: await enrichLeaderboard(topByLevel),
            topPrestige: await enrichLeaderboard(topByPrestige),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ADMIN: MINING ====================
app.get('/api/admin/mining/:userId', adminCheck, (req, res) => {
    try {
        const { userId } = req.params;
        let data = null, ores = [];
        try {
            data = db.prepare('SELECT * FROM mining_data WHERE userId = ?').get(userId) || null;
            ores = db.prepare('SELECT oreId, quantity FROM ore_inventory WHERE userId = ? AND quantity > 0').all(userId);
        } catch (e) { /* tables optional */ }
        res.json({ userId, mining: data, ores });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/mining', adminCheck, (req, res) => {
    try {
        const { userId, level, prestige, depth, stamina, pickaxe } = req.body;
        if (!userId) return res.status(400).json({ error: 'Missing userId' });
        // Ensure row exists
        let row = db.prepare('SELECT * FROM mining_data WHERE userId = ?').get(userId);
        if (!row) {
            db.prepare('INSERT INTO mining_data (guildId, userId, level, exp, pickaxe, depth, stamina, staminaTs) VALUES (?, ?, 1, 0, ?, 0, 100, ?)').run('global', userId, 'wood', Date.now());
        }
        if (level !== undefined) db.prepare('UPDATE mining_data SET level = ? WHERE userId = ?').run(parseInt(level), userId);
        if (prestige !== undefined) db.prepare('UPDATE mining_data SET prestige = ? WHERE userId = ?').run(parseInt(prestige), userId);
        if (depth !== undefined) db.prepare('UPDATE mining_data SET depth = ? WHERE userId = ?').run(parseInt(depth), userId);
        if (stamina !== undefined) db.prepare('UPDATE mining_data SET stamina = ?, staminaTs = ? WHERE userId = ?').run(parseInt(stamina), Date.now(), userId);
        if (pickaxe) db.prepare('UPDATE mining_data SET pickaxe = ? WHERE userId = ?').run(pickaxe, userId);
        const updated = db.prepare('SELECT * FROM mining_data WHERE userId = ?').get(userId);
        res.json({ success: true, userId, mining: updated });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/mining/ore', adminCheck, (req, res) => {
    try {
        const { userId, oreId, action, quantity } = req.body;
        if (!userId || !oreId || !action) return res.status(400).json({ error: 'Missing fields' });
        const qty = parseInt(quantity) || 1;
        const existing = db.prepare('SELECT quantity FROM ore_inventory WHERE userId = ? AND oreId = ?').get(userId, oreId);
        if (action === 'give') {
            if (existing) db.prepare('UPDATE ore_inventory SET quantity = quantity + ? WHERE userId = ? AND oreId = ?').run(qty, userId, oreId);
            else db.prepare('INSERT INTO ore_inventory (guildId, userId, oreId, quantity) VALUES (?, ?, ?, ?)').run('global', userId, oreId, qty);
        } else if (action === 'remove') {
            if (existing) {
                db.prepare('UPDATE ore_inventory SET quantity = MAX(0, quantity - ?) WHERE userId = ? AND oreId = ?').run(qty, userId, oreId);
                db.prepare('DELETE FROM ore_inventory WHERE userId = ? AND oreId = ? AND quantity <= 0').run(userId, oreId);
            }
        } else return res.status(400).json({ error: 'Invalid action (give/remove)' });
        const current = db.prepare('SELECT quantity FROM ore_inventory WHERE userId = ? AND oreId = ?').get(userId, oreId);
        res.json({ success: true, userId, oreId, action, currentCount: current?.quantity || 0 });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== CASINO STATS ====================
app.get('/api/casino/stats', async (req, res) => {
    try {
        const coinflipWins = db.prepare("SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = 'coinflip_wins'").get();
        const slotWins = db.prepare("SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = 'slot_wins'").get();
        const slotTotal = db.prepare("SELECT SUM(stat_value) as total FROM user_stats WHERE stat_key = 'slot_total_winnings'").get();
        const topGamblers = db.prepare("SELECT userId, stat_value as total FROM user_stats WHERE stat_key = 'slot_total_winnings' ORDER BY stat_value DESC LIMIT 10").all();
        const topCoinflip = db.prepare("SELECT userId, stat_value as wins FROM user_stats WHERE stat_key = 'coinflip_wins' ORDER BY stat_value DESC LIMIT 10").all();

        res.json({
            coinflipWins: coinflipWins?.total || 0,
            slotWins: slotWins?.total || 0,
            slotTotalWinnings: slotTotal?.total || 0,
            topGamblers: await enrichLeaderboard(topGamblers),
            topCoinflip: await enrichLeaderboard(topCoinflip),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== INVITE TRACKER ====================
app.get('/api/invite/settings/:guildId', (req, res) => {
    try {
        const { guildId } = req.params;
        const { getAllInviteSettings } = require('./systems/inviteTracker');
        res.json({ settings: getAllInviteSettings(guildId) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/invite/settings/:guildId', adminCheck, (req, res) => {
    try {
        const { guildId } = req.params;
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'Missing settings' });
        const { setInviteSetting } = require('./systems/inviteTracker');
        for (const [key, value] of Object.entries(settings)) {
            setInviteSetting(guildId, key, String(value));
        }
        res.json({ success: true, saved: Object.keys(settings).length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/invite/leaderboard/:guildId', async (req, res) => {
    try {
        const { guildId } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        const { getInviteLeaderboard } = require('./systems/inviteTracker');
        const rows = getInviteLeaderboard(guildId, limit);
        res.json({ leaderboard: await enrichLeaderboard(rows) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/invite/user/:guildId/:userId', async (req, res) => {
    try {
        const { guildId, userId } = req.params;
        const { getInviterStats, getInvitedList } = require('./systems/inviteTracker');
        const stats = getInviterStats(guildId, userId);
        const invited = getInvitedList(guildId, userId);
        res.json({ stats, invited: await enrichLeaderboard(invited, 'invitedId') });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/invite/reset/:guildId', adminCheck, (req, res) => {
    try {
        const { guildId } = req.params;
        const { userId } = req.body;
        const { resetInvites } = require('./systems/inviteTracker');
        resetInvites(guildId, userId || null);
        res.json({ success: true, reset: userId || 'all' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== WELCOMER ====================
app.get('/api/welcomer/settings/:guildId', (req, res) => {
    try {
        const { guildId } = req.params;
        const { getAllWelcomerSettings } = require('./systems/welcomer');
        res.json({ settings: getAllWelcomerSettings(guildId) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/welcomer/settings/:guildId', adminCheck, (req, res) => {
    try {
        const { guildId } = req.params;
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'Missing settings' });
        const { setWelcomerSetting } = require('./systems/welcomer');
        for (const [key, value] of Object.entries(settings)) {
            setWelcomerSetting(guildId, key, String(value));
        }
        res.json({ success: true, saved: Object.keys(settings).length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/welcomer/test/:guildId', adminCheck, async (req, res) => {
    try {
        const { guildId } = req.params;
        const { testWelcomer } = require('./systems/welcomer');
        if (!discordClient) return res.status(500).json({ error: 'Bot not connected' });
        const guild = discordClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });
        const userId = req.headers['x-user-id'];
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return res.status(404).json({ error: 'Member not found in guild' });
        await testWelcomer(member);
        res.json({ success: true, message: 'Test message sent' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== TEMPVOICE SETTINGS ====================
app.get('/api/tempvoice/settings/:guildId', (req, res) => {
    try {
        const { guildId } = req.params;
        const keys = ['jtc_category', 'jtc_channel', 'tv_default_name', 'tv_default_limit', 'tv_allow_custom_name', 'tv_allow_lock', 'tv_allow_hide', 'tv_allow_limit', 'tv_allow_kick', 'tv_allow_block', 'tv_enabled'];
        const defaults = { jtc_category: '', jtc_channel: '', tv_default_name: '{user.name}\'s Channel', tv_default_limit: '0', tv_allow_custom_name: '1', tv_allow_lock: '1', tv_allow_hide: '1', tv_allow_limit: '1', tv_allow_kick: '1', tv_allow_block: '1', tv_enabled: '1' };
        const settings = {};
        for (const key of keys) {
            const row = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, key);
            settings[key] = row ? row.value : defaults[key];
        }
        // Get active temp voices count
        const activeCount = db.prepare('SELECT COUNT(*) as count FROM temp_voices WHERE guildId = ?').get(guildId)?.count || 0;
        res.json({ settings, activeVoices: activeCount });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tempvoice/settings/:guildId', adminCheck, (req, res) => {
    try {
        const { guildId } = req.params;
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') return res.status(400).json({ error: 'Missing settings' });
        for (const [key, value] of Object.entries(settings)) {
            db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, key, String(value));
        }
        res.json({ success: true, saved: Object.keys(settings).length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== START SERVER ====================
function startApiServer() {
    app.listen(API_PORT, '0.0.0.0', () => {
        console.log(`🌐 API Server running on port ${API_PORT}`);
        console.log(`🔑 API Key: ${API_KEY.substring(0, 4)}****`);
        console.log(`👑 Admin IDs: ${ADMIN_IDS.length > 0 ? ADMIN_IDS.join(', ') : 'NONE (set ADMIN_IDS in .env)'}`);
    });
}

module.exports = { startApiServer, setDiscordClient };
