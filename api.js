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
    res.json({ status: 'ok', version: '3.2.0', uptime: process.uptime(), timestamp: Date.now() });
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

        res.json({
            users: totalUsers?.count || 0,
            guilds: totalGuilds?.count || 0,
            uptime: process.uptime(),
            version: '3.2.0',
            globalMode: checkGlobalMode(),
            stats: {
                totalFishCaught: totalFishCaught?.total || 0,
                totalFarmHarvests: totalFarmHarvests?.total || 0,
                totalPets: totalPets?.count || 0,
                totalAchievements: totalAchievements?.count || 0,
                totalMoney: totalMoney?.total || 0,
                totalCommands: totalCommands?.total || 0,
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
app.get('/api/leaderboard/:type', (req, res) => {
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
            default:
                return res.status(400).json({ error: 'Invalid leaderboard type' });
        }

        res.json({ type, leaderboard: rows });
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
            case 'all':
                db.prepare('DELETE FROM users WHERE userId = ?').run(userId);
                db.prepare('DELETE FROM user_stats WHERE userId = ?').run(userId);
                db.prepare('DELETE FROM achievements WHERE userId = ?').run(userId);
                db.prepare('DELETE FROM pets WHERE userId = ?').run(userId);
                db.prepare('DELETE FROM fish_inventory WHERE userId = ?').run(userId);
                db.prepare('DELETE FROM fish_collection WHERE userId = ?').run(userId);
                db.prepare('DELETE FROM item_inventory WHERE userId = ?').run(userId);
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

// ==================== START SERVER ====================
function startApiServer() {
    app.listen(API_PORT, '0.0.0.0', () => {
        console.log(`🌐 API Server running on port ${API_PORT}`);
        console.log(`🔑 API Key: ${API_KEY.substring(0, 4)}****`);
        console.log(`👑 Admin IDs: ${ADMIN_IDS.length > 0 ? ADMIN_IDS.join(', ') : 'NONE (set ADMIN_IDS in .env)'}`);
    });
}

module.exports = { startApiServer };
