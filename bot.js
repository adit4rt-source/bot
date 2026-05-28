const { Client, GatewayIntentBits, Partials, Events, PermissionsBitField, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, Collection, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } = require('discord.js');
const Database = require('better-sqlite3');

// ================= INISIALISASI DATABASE =================
const db = new Database('economy.sqlite');
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

// ================= MIGRASI DATABASE (tambah kolom baru ke tabel lama) =================
try { db.exec(`ALTER TABLE fish_inventory ADD COLUMN locked INTEGER DEFAULT 0`); } catch(e) { /* kolom sudah ada */ }
try { db.exec(`CREATE TABLE IF NOT EXISTS fish_collection (guildId TEXT, userId TEXT, fishId TEXT, PRIMARY KEY(guildId, userId, fishId))`); } catch(e) { /* tabel sudah ada */ }

// ================= MIGRASI: TABEL ITEM INVENTORY =================
db.exec(`CREATE TABLE IF NOT EXISTS item_inventory (guildId TEXT, userId TEXT, itemId TEXT, quantity INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId, itemId))`);


function getOrCreateUser(guildId, userId) { let user = db.prepare('SELECT * FROM users WHERE guildId = ? AND userId = ?').get(guildId, userId); if (!user) { db.prepare('INSERT INTO users (guildId, userId) VALUES (?, ?)').run(guildId, userId); user = db.prepare('SELECT * FROM users WHERE guildId = ? AND userId = ?').get(guildId, userId); } return user; }
function getConf(guildId, key, defaultVal) { const row = db.prepare('SELECT value FROM config WHERE guildId = ? AND key = ?').get(guildId, key); return row ? row.value : defaultVal; }
function getSetting(guildId, key, defaultVal) { const row = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, key); return row ? row.value : defaultVal; }

// ================= SISTEM STATISTIK USER =================
function getUserStat(guildId, userId, key) {
    const row = db.prepare('SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = ?').get(guildId, userId, key);
    return row ? row.stat_value : 0;
}
function incrementUserStat(guildId, userId, key, amount = 1) {
    const current = getUserStat(guildId, userId, key);
    db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, key, current + amount);
    return current + amount;
}

// ================= SISTEM FISHING =================
const FISH_TIERS = [
    { tier: 'Trash', emoji: '🗑️', chance: 18, minWeight: 0.01, maxWeight: 0.5, minValue: 1, maxValue: 2 },
    { tier: 'Common', emoji: '🐟', chance: 32, minWeight: 0.1, maxWeight: 5, minValue: 2, maxValue: 15 },
    { tier: 'Uncommon', emoji: '🐠', chance: 23, minWeight: 0.5, maxWeight: 15, minValue: 8, maxValue: 50 },
    { tier: 'Rare', emoji: '🐡', chance: 14, minWeight: 1, maxWeight: 50, minValue: 30, maxValue: 180 },
    { tier: 'Epic', emoji: '🦈', chance: 8, minWeight: 5, maxWeight: 200, minValue: 80, maxValue: 500 },
    { tier: 'Legendary', emoji: '🐉', chance: 3.5, minWeight: 50, maxWeight: 1000, minValue: 300, maxValue: 1500 },
    { tier: 'Mythic', emoji: '🌈', chance: 1.2, minWeight: 100, maxWeight: 5000, minValue: 800, maxValue: 2500 },
    { tier: 'Secret', emoji: '🔮', chance: 0.3, minWeight: 500, maxWeight: 9999, minValue: 3000, maxValue: 6000 }
];

const FISH_DATA = [
    // TRASH (10)
    { id: 'boot', name: 'Sepatu Bekas', tier: 'Trash', emoji: '👢' },
    { id: 'can', name: 'Kaleng Berkarat', tier: 'Trash', emoji: '🥫' },
    { id: 'tire', name: 'Ban Bocor', tier: 'Trash', emoji: '⭕' },
    { id: 'bottle', name: 'Botol Plastik', tier: 'Trash', emoji: '🍶' },
    { id: 'seaweed', name: 'Rumput Laut Busuk', tier: 'Trash', emoji: '🌿' },
    { id: 'plastic_bag', name: 'Kantong Plastik', tier: 'Trash', emoji: '🛍️' },
    { id: 'broken_rod', name: 'Pancing Patah', tier: 'Trash', emoji: '🪝' },
    { id: 'old_shoe', name: 'Sandal Jepit', tier: 'Trash', emoji: '🩴' },
    { id: 'newspaper', name: 'Koran Basah', tier: 'Trash', emoji: '📰' },
    { id: 'rusty_anchor', name: 'Jangkar Karatan', tier: 'Trash', emoji: '⚓' },
    // COMMON (15)
    { id: 'sardine', name: 'Ikan Sarden', tier: 'Common', emoji: '🐟' },
    { id: 'anchovy', name: 'Ikan Teri', tier: 'Common', emoji: '🐟' },
    { id: 'tilapia', name: 'Ikan Nila', tier: 'Common', emoji: '🐟' },
    { id: 'catfish', name: 'Ikan Lele', tier: 'Common', emoji: '🐟' },
    { id: 'carp', name: 'Ikan Mas', tier: 'Common', emoji: '🐟' },
    { id: 'guppy', name: 'Ikan Guppy', tier: 'Common', emoji: '🐟' },
    { id: 'mujair', name: 'Ikan Mujair', tier: 'Common', emoji: '🐟' },
    { id: 'gurami_kecil', name: 'Gurami Kecil', tier: 'Common', emoji: '🐟' },
    { id: 'bandeng', name: 'Ikan Bandeng', tier: 'Common', emoji: '🐟' },
    { id: 'patin', name: 'Ikan Patin', tier: 'Common', emoji: '🐟' },
    { id: 'belanak', name: 'Ikan Belanak', tier: 'Common', emoji: '🐟' },
    { id: 'kembung', name: 'Ikan Kembung', tier: 'Common', emoji: '🐟' },
    { id: 'sepat', name: 'Ikan Sepat', tier: 'Common', emoji: '🐟' },
    { id: 'betok', name: 'Ikan Betok', tier: 'Common', emoji: '🐟' },
    { id: 'wader', name: 'Ikan Wader', tier: 'Common', emoji: '🐟' },
    // UNCOMMON (15)
    { id: 'trout', name: 'Ikan Trout', tier: 'Uncommon', emoji: '🐠' },
    { id: 'bass', name: 'Ikan Bass', tier: 'Uncommon', emoji: '🐠' },
    { id: 'snapper', name: 'Ikan Kakap', tier: 'Uncommon', emoji: '🐠' },
    { id: 'mackerel', name: 'Ikan Tenggiri', tier: 'Uncommon', emoji: '🐠' },
    { id: 'bawal', name: 'Ikan Bawal', tier: 'Uncommon', emoji: '🐠' },
    { id: 'gurami', name: 'Ikan Gurami Besar', tier: 'Uncommon', emoji: '🐠' },
    { id: 'tongkol', name: 'Ikan Tongkol', tier: 'Uncommon', emoji: '🐠' },
    { id: 'kerapu', name: 'Ikan Kerapu', tier: 'Uncommon', emoji: '🐠' },
    { id: 'gabus', name: 'Ikan Gabus', tier: 'Uncommon', emoji: '🐠' },
    { id: 'pari_kecil', name: 'Ikan Pari Kecil', tier: 'Uncommon', emoji: '🐠' },
    { id: 'baronang', name: 'Ikan Baronang', tier: 'Uncommon', emoji: '🐠' },
    { id: 'tuna_kecil', name: 'Tuna Sirip Kuning', tier: 'Uncommon', emoji: '🐠' },
    { id: 'selar', name: 'Ikan Selar', tier: 'Uncommon', emoji: '🐠' },
    { id: 'kurisi', name: 'Ikan Kurisi', tier: 'Uncommon', emoji: '🐠' },
    { id: 'layang', name: 'Ikan Layang', tier: 'Uncommon', emoji: '🐠' },
    // RARE (12)
    { id: 'salmon', name: 'Ikan Salmon', tier: 'Rare', emoji: '🐡' },
    { id: 'tuna', name: 'Ikan Tuna Besar', tier: 'Rare', emoji: '🐡' },
    { id: 'swordfish', name: 'Ikan Pedang', tier: 'Rare', emoji: '🐡' },
    { id: 'barramundi', name: 'Ikan Barramundi', tier: 'Rare', emoji: '🐡' },
    { id: 'arwana_silver', name: 'Arwana Silver', tier: 'Rare', emoji: '🐡' },
    { id: 'marlin_kecil', name: 'Marlin Kecil', tier: 'Rare', emoji: '🐡' },
    { id: 'napoleon', name: 'Ikan Napoleon', tier: 'Rare', emoji: '🐡' },
    { id: 'giant_catfish', name: 'Lele Raksasa', tier: 'Rare', emoji: '🐡' },
    { id: 'piranha', name: 'Piranha', tier: 'Rare', emoji: '🐡' },
    { id: 'electric_eel', name: 'Belut Listrik', tier: 'Rare', emoji: '🐡' },
    { id: 'sturgeon', name: 'Ikan Sturgeon', tier: 'Rare', emoji: '🐡' },
    { id: 'red_snapper', name: 'Kakap Merah Jumbo', tier: 'Rare', emoji: '🐡' },
    // EPIC (11)
    { id: 'shark', name: 'Hiu Putih', tier: 'Epic', emoji: '🦈' },
    { id: 'manta_ray', name: 'Pari Manta', tier: 'Epic', emoji: '🦈' },
    { id: 'giant_tuna', name: 'Tuna Raksasa', tier: 'Epic', emoji: '🦈' },
    { id: 'marlin', name: 'Blue Marlin', tier: 'Epic', emoji: '🦈' },
    { id: 'arwana_gold', name: 'Arwana Emas', tier: 'Epic', emoji: '🦈' },
    { id: 'whale_shark', name: 'Hiu Paus', tier: 'Epic', emoji: '🦈' },
    { id: 'giant_grouper', name: 'Kerapu Raksasa', tier: 'Epic', emoji: '🦈' },
    { id: 'hammerhead', name: 'Hiu Martil', tier: 'Epic', emoji: '🦈' },
    { id: 'stingray', name: 'Pari Beracun', tier: 'Epic', emoji: '🦈' },
    { id: 'oarfish', name: 'Oarfish', tier: 'Epic', emoji: '🦈' },
    { id: 'giant_squid', name: 'Cumi Raksasa', tier: 'Epic', emoji: '🦈' },
    // LEGENDARY (11)
    { id: 'megalodon', name: 'Megalodon', tier: 'Legendary', emoji: '🐉' },
    { id: 'leviathan', name: 'Leviathan', tier: 'Legendary', emoji: '🐉' },
    { id: 'golden_koi', name: 'Koi Emas Legendaris', tier: 'Legendary', emoji: '🐉' },
    { id: 'ancient_coelacanth', name: 'Coelacanth Purba', tier: 'Legendary', emoji: '🐉' },
    { id: 'dragon_fish', name: 'Naga Laut', tier: 'Legendary', emoji: '🐉' },
    { id: 'king_salmon', name: 'Raja Salmon', tier: 'Legendary', emoji: '🐉' },
    { id: 'ghost_shark', name: 'Hiu Hantu', tier: 'Legendary', emoji: '🐉' },
    { id: 'abyssal_angler', name: 'Angler Abyssal', tier: 'Legendary', emoji: '🐉' },
    { id: 'thunder_eel', name: 'Belut Petir', tier: 'Legendary', emoji: '🐉' },
    { id: 'crystal_jellyfish', name: 'Ubur-ubur Kristal', tier: 'Legendary', emoji: '🐉' },
    { id: 'phoenix_fish', name: 'Ikan Phoenix', tier: 'Legendary', emoji: '🐉' },
    // MYTHIC (8)
    { id: 'poseidon_trident_fish', name: 'Ikan Trisula Poseidon', tier: 'Mythic', emoji: '🌈' },
    { id: 'kraken_baby', name: 'Bayi Kraken', tier: 'Mythic', emoji: '🌈' },
    { id: 'celestial_whale', name: 'Paus Langit', tier: 'Mythic', emoji: '🌈' },
    { id: 'rainbow_serpent', name: 'Naga Pelangi', tier: 'Mythic', emoji: '🌈' },
    { id: 'void_leviathan', name: 'Leviathan Kegelapan', tier: 'Mythic', emoji: '🌈' },
    { id: 'golden_dragon', name: 'Naga Emas Samudra', tier: 'Mythic', emoji: '🌈' },
    { id: 'time_fish', name: 'Ikan Waktu', tier: 'Mythic', emoji: '🌈' },
    { id: 'world_serpent', name: 'Jormungandr', tier: 'Mythic', emoji: '🌈' },
    // SECRET (4)
    { id: 'god_fish', name: 'Ikan Dewa', tier: 'Secret', emoji: '🔮' },
    { id: 'time_eater', name: 'Pemakan Waktu', tier: 'Secret', emoji: '🔮' },
    { id: 'universe_whale', name: 'Paus Alam Semesta', tier: 'Secret', emoji: '🔮' },
    { id: 'null_entity', name: '???', tier: 'Secret', emoji: '🔮' }
];

const BAIT_TYPES = [
    { id: 'none', name: 'Tanpa Umpan', emoji: '❌', price: 0, rareBonus: 0 },
    { id: 'cacing', name: 'Cacing Tanah', emoji: '🪱', price: 50, rareBonus: 0 },
    { id: 'jangkrik', name: 'Jangkrik', emoji: '🦗', price: 100, rareBonus: 3 },
    { id: 'udang', name: 'Udang Segar', emoji: '🦐', price: 150, rareBonus: 5 },
    { id: 'ikan_kecil', name: 'Ikan Kecil (Live Bait)', emoji: '🐟', price: 300, rareBonus: 8 },
    { id: 'emas', name: 'Umpan Emas', emoji: '✨', price: 500, rareBonus: 12 },
    { id: 'berlian', name: 'Umpan Berlian', emoji: '💎', price: 1500, rareBonus: 20 },
    { id: 'mythic_bait', name: 'Umpan Mitik', emoji: '🌟', price: 5000, rareBonus: 30 }
];

const ROD_TYPES = [
    { id: 'basic', name: 'Joran Bambu', emoji: '🎋', price: 0, cooldown: 30, rareBonus: 0 },
    { id: 'fiber', name: 'Joran Fiber', emoji: '🎣', price: 2000, cooldown: 25, rareBonus: 3 },
    { id: 'carbon', name: 'Joran Carbon', emoji: '⚡', price: 8000, cooldown: 20, rareBonus: 7 },
    { id: 'pro', name: 'Joran Pro Titanium', emoji: '🏆', price: 25000, cooldown: 15, rareBonus: 12 },
    { id: 'mythic_rod', name: 'Joran Mitik', emoji: '🔱', price: 80000, cooldown: 10, rareBonus: 18 },
    { id: 'divine_rod', name: 'Joran Dewa', emoji: '👑', price: 200000, cooldown: 7, rareBonus: 25 }
];

// ================= SISTEM ITEM INVENTORY =================
const ITEMS = [
    { id: 'xp_booster_2x', name: 'XP Booster 2x', emoji: '⚡', desc: 'Double XP sementara (1 jam)', price: 3000, category: 'Booster' },
    { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡', desc: 'Triple XP sementara (1 jam)', price: 7000, category: 'Booster' },
    { id: 'streak_shield', name: 'Streak Shield', emoji: '🛡️', desc: 'OTOMATIS lindungi streak jika skip 1 hari', price: 5000, category: 'Proteksi' },
    { id: 'lucky_charm', name: 'Lucky Charm', emoji: '🍀', desc: '+15% chance menang semua game', price: 8000, category: 'Luck' },
    { id: 'money_magnet', name: 'Money Magnet', emoji: '🧲', desc: '+50% money dari semua sumber (1 jam)', price: 6000, category: 'Booster' },
    { id: 'daily_doubler', name: 'Daily Doubler', emoji: '📅', desc: 'Gandakan /money daily (sekali pakai)', price: 2000, category: 'Economy' },
    { id: 'tax_free_voucher', name: 'Tax-Free Voucher', emoji: '🧾', desc: 'Gift tanpa pajak (sekali pakai)', price: 1500, category: 'Economy' },
    { id: 'lucky_spin_token', name: 'Lucky Spin Token', emoji: '🎫', desc: 'Jamin 2 simbol sama di slot (sekali pakai)', price: 4000, category: 'Luck' },
    { id: 'mystery_box', name: 'Mystery Box', emoji: '📦', desc: 'Random 50-2000 money', price: 1000, category: 'Special' }
];

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

const fishCooldowns = new Map();

function getEquipment(guildId, userId) {
    let eq = db.prepare('SELECT * FROM fish_equipment WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!eq) { db.prepare('INSERT INTO fish_equipment (guildId, userId) VALUES (?, ?)').run(guildId, userId); eq = { rod: 'basic', bait: 'none', bait_count: 0 }; }
    return eq;
}

function catchFish(guildId, userId) {
    const eq = getEquipment(guildId, userId);
    const rod = ROD_TYPES.find(r => r.id === eq.rod) || ROD_TYPES[0];
    const bait = BAIT_TYPES.find(b => b.id === eq.bait) || BAIT_TYPES[0];
    const rareBonus = rod.rareBonus + bait.rareBonus;

    // Consume bait
    if (eq.bait !== 'none' && eq.bait_count > 0) {
        const newCount = eq.bait_count - 1;
        if (newCount <= 0) db.prepare('UPDATE fish_equipment SET bait = ?, bait_count = 0 WHERE guildId = ? AND userId = ?').run('none', guildId, userId);
        else db.prepare('UPDATE fish_equipment SET bait_count = ? WHERE guildId = ? AND userId = ?').run(newCount, guildId, userId);
    }

    // Determine tier with bonus
    let roll = Math.random() * 100;
    let selectedTier = FISH_TIERS[0];
    // Shift probability: reduce trash/common chance, increase rare+ chance
    let adjustedTiers = FISH_TIERS.map(t => {
        let adj = t.chance;
        if (t.tier === 'Trash') adj = Math.max(2, t.chance - rareBonus);
        else if (t.tier === 'Common') adj = Math.max(8, t.chance - rareBonus * 0.5);
        else if (t.tier === 'Rare') adj = t.chance + rareBonus * 0.8;
        else if (t.tier === 'Epic') adj = t.chance + rareBonus * 0.6;
        else if (t.tier === 'Legendary') adj = Math.min(6, t.chance + rareBonus * 0.3);
        else if (t.tier === 'Mythic') adj = Math.min(2.5, t.chance + rareBonus * 0.15);
        else if (t.tier === 'Secret') adj = Math.min(0.8, t.chance + rareBonus * 0.05);
        else adj = t.chance + rareBonus * 0.5;
        return { ...t, chance: adj };
    });
    // Normalize
    const totalChance = adjustedTiers.reduce((s, t) => s + t.chance, 0);
    let cumulative = 0;
    const normalized = adjustedTiers.map(t => { cumulative += (t.chance / totalChance) * 100; return { ...t, cumChance: cumulative }; });
    for (const t of normalized) { if (roll <= t.cumChance) { selectedTier = t; break; } }

    // Pick random fish from tier
    const tierFish = FISH_DATA.filter(f => f.tier === selectedTier.tier);
    const fish = tierFish[Math.floor(Math.random() * tierFish.length)];

    // Generate weight
    const weight = parseFloat((Math.random() * (selectedTier.maxWeight - selectedTier.minWeight) + selectedTier.minWeight).toFixed(2));

    // Calculate sell value based on weight ratio
    const weightRatio = (weight - selectedTier.minWeight) / (selectedTier.maxWeight - selectedTier.minWeight);
    const value = Math.floor(selectedTier.minValue + weightRatio * (selectedTier.maxValue - selectedTier.minValue));

    // Save to inventory + collection
    db.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt) VALUES (?, ?, ?, ?, ?)').run(guildId, userId, fish.id, weight, Date.now());
    db.prepare('INSERT OR IGNORE INTO fish_collection (guildId, userId, fishId) VALUES (?, ?, ?)').run(guildId, userId, fish.id);

    return { fish, tier: selectedTier, weight, value };
}

// ================= SISTEM SLOT MACHINE =================
const SLOT_SYMBOLS = [
    { id: 'cherry', emoji: '🍒', name: 'Cherry', weight: 25 },
    { id: 'lemon', emoji: '🍋', name: 'Lemon', weight: 20 },
    { id: 'orange', emoji: '🍊', name: 'Orange', weight: 18 },
    { id: 'grape', emoji: '🍇', name: 'Grape', weight: 15 },
    { id: 'bell', emoji: '🔔', name: 'Bell', weight: 10 },
    { id: 'star', emoji: '⭐', name: 'Star', weight: 7 },
    { id: 'diamond', emoji: '💎', name: 'Diamond', weight: 4 },
    { id: 'seven', emoji: '7️⃣', name: 'Seven', weight: 1 }
];

const SLOT_PAYOUTS = {
    'cherry': 2, 'lemon': 3, 'orange': 4, 'grape': 5,
    'bell': 8, 'star': 12, 'diamond': 18, 'seven': 25
};

function spinSlot() {
    const totalWeight = SLOT_SYMBOLS.reduce((s, sym) => s + sym.weight, 0);
    const spin = () => {
        let roll = Math.random() * totalWeight, cumulative = 0;
        for (const sym of SLOT_SYMBOLS) { cumulative += sym.weight; if (roll <= cumulative) return sym; }
        return SLOT_SYMBOLS[0];
    };
    return [spin(), spin(), spin()];
}

function getSlotResult(reels, bet) {
    const [r1, r2, r3] = reels;
    // JACKPOT: 3x sama
    if (r1.id === r2.id && r2.id === r3.id) {
        const multiplier = SLOT_PAYOUTS[r1.id];
        return { win: true, jackpot: true, multiplier, payout: bet * multiplier, desc: `🎰 **JACKPOT!!!** 3x ${r1.emoji} ${r1.name}! (${multiplier}x)` };
    }
    // 2x sama
    if (r1.id === r2.id || r2.id === r3.id || r1.id === r3.id) {
        const matchSym = r1.id === r2.id ? r1 : (r2.id === r3.id ? r2 : r1);
        const multiplier = Math.max(1, Math.floor(SLOT_PAYOUTS[matchSym.id] / 3));
        return { win: true, jackpot: false, multiplier, payout: bet * multiplier, desc: `✨ **2x Match!** ${matchSym.emoji} ${matchSym.name} (${multiplier}x)` };
    }
    // Kalah
    return { win: false, jackpot: false, multiplier: 0, payout: 0, desc: '💀 Tidak ada yang cocok...' };
}

// ================= SISTEM GIFT / TRANSFER =================
const GIFT_TAX_RATE = 0.10; // 10% pajak
const GIFT_MAX_PER_TRANSACTION = 10000;
const GIFT_RECEIVE_LIMIT_PER_DAY = 10000;

function getGiftReceivedToday(guildId, userId) {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    return getUserStat(guildId, userId, `gift_received_${today}`);
}

function addGiftReceivedToday(guildId, userId, amount) {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    incrementUserStat(guildId, userId, `gift_received_${today}`, amount);
}

// ================= SISTEM ACHIEVEMENT / BADGE =================
const ACHIEVEMENTS = [
    // --- CHAT & SOCIAL ---
    { id: 'first_chat', name: 'Newbie', emoji: '👋', desc: 'Pertama kali chat di server', category: 'Social', reward: 100 },
    { id: 'chat_100', name: 'Tukang Ngobrol', emoji: '💬', desc: 'Kirim 100 pesan chat', category: 'Social', reward: 300 },
    { id: 'chat_500', name: 'Mulut Emas', emoji: '🗣️', desc: 'Kirim 500 pesan chat', category: 'Social', reward: 500 },
    { id: 'chat_1000', name: 'Legend of Chat', emoji: '👑', desc: 'Kirim 1.000 pesan chat', category: 'Social', reward: 1000 },
    { id: 'chat_5000', name: 'Chat Machine', emoji: '🤖', desc: 'Kirim 5.000 pesan chat', category: 'Social', reward: 2500 },
    { id: 'react_50', name: 'Expressive', emoji: '😄', desc: 'Berikan 50 reaction', category: 'Social', reward: 200 },
    { id: 'react_200', name: 'Reaction King', emoji: '🤩', desc: 'Berikan 200 reaction', category: 'Social', reward: 500 },
    // --- ECONOMY ---
    { id: 'balance_10k', name: 'Kaya Raya', emoji: '💰', desc: 'Balance mencapai 10.000', category: 'Economy', reward: 200 },
    { id: 'balance_100k', name: 'Sultan', emoji: '💎', desc: 'Balance mencapai 100.000', category: 'Economy', reward: 500 },
    { id: 'balance_1m', name: 'Jutawan', emoji: '💸', desc: 'Balance mencapai 1.000.000', category: 'Economy', reward: 1500 },
    { id: 'first_buy', name: 'Shopaholic Pemula', emoji: '🛍️', desc: 'Pertama kali beli barang di shop', category: 'Economy', reward: 100 },
    { id: 'buy_10', name: 'Shopaholic', emoji: '🛒', desc: 'Beli 10 item dari shop', category: 'Economy', reward: 500 },
    { id: 'daily_7', name: 'Rajin Klaim', emoji: '📅', desc: 'Klaim /money daily 7 hari', category: 'Economy', reward: 300 },
    { id: 'daily_30', name: 'Daily Warrior', emoji: '🗓️', desc: 'Klaim /money daily 30 hari', category: 'Economy', reward: 1000 },
    // --- LEVEL ---
    { id: 'level_5', name: 'Rising Star', emoji: '⭐', desc: 'Mencapai Level 5', category: 'Level', reward: 200 },
    { id: 'level_10', name: 'Veteran', emoji: '🌟', desc: 'Mencapai Level 10', category: 'Level', reward: 500 },
    { id: 'level_25', name: 'Elite Member', emoji: '💫', desc: 'Mencapai Level 25', category: 'Level', reward: 1000 },
    { id: 'level_50', name: 'Grandmaster', emoji: '🏆', desc: 'Mencapai Level 50', category: 'Level', reward: 2500 },
    { id: 'level_100', name: 'Immortal Legend', emoji: '🔱', desc: 'Mencapai Level 100', category: 'Level', reward: 5000 },
    // --- STREAK ---
    { id: 'streak_7', name: 'On Fire', emoji: '🔥', desc: 'Streak 7 hari berturut-turut', category: 'Streak', reward: 300 },
    { id: 'streak_14', name: 'Flame Keeper', emoji: '🕯️', desc: 'Streak 14 hari berturut-turut', category: 'Streak', reward: 500 },
    { id: 'streak_30', name: 'Streak Master', emoji: '🏅', desc: 'Streak 30 hari berturut-turut', category: 'Streak', reward: 1500 },
    { id: 'streak_60', name: 'Undying Flame', emoji: '☀️', desc: 'Streak 60 hari berturut-turut', category: 'Streak', reward: 3000 },
    { id: 'streak_100', name: 'Eternal Blaze', emoji: '🌋', desc: 'Streak 100 hari berturut-turut', category: 'Streak', reward: 5000 },
    // --- GAMBLING ---
    { id: 'coinflip_first', name: 'Gambler Pemula', emoji: '🪙', desc: 'Pertama kali main coinflip', category: 'Gambling', reward: 50 },
    { id: 'coinflip_win_5', name: 'Lucky Streak', emoji: '🍀', desc: 'Menang coinflip 5 kali', category: 'Gambling', reward: 300 },
    { id: 'coinflip_win_20', name: 'Penjudi Beruntung', emoji: '🎰', desc: 'Menang coinflip 20 kali', category: 'Gambling', reward: 800 },
    { id: 'coinflip_win_50', name: 'Casino Royale', emoji: '♠️', desc: 'Menang coinflip 50 kali', category: 'Gambling', reward: 2000 },
    // --- MINI EVENTS ---
    { id: 'event_first', name: 'Event Hunter', emoji: '🎯', desc: 'Pertama kali menang mini-event', category: 'Events', reward: 100 },
    { id: 'event_10', name: 'Event Pro', emoji: '🏹', desc: 'Menang 10 mini-event', category: 'Events', reward: 500 },
    { id: 'event_50', name: 'Event Legend', emoji: '⚡', desc: 'Menang 50 mini-event', category: 'Events', reward: 2000 },
    // --- VOICE ---
    { id: 'voice_1h', name: 'Voice Newbie', emoji: '🎙️', desc: 'Total 1 jam di voice chat', category: 'Voice', reward: 100 },
    { id: 'voice_10h', name: 'Voice Addict', emoji: '🎧', desc: 'Total 10 jam di voice chat', category: 'Voice', reward: 500 },
    { id: 'voice_50h', name: 'Voice Legend', emoji: '🎶', desc: 'Total 50 jam di voice chat', category: 'Voice', reward: 1500 },
    { id: 'voice_100h', name: 'Living in VC', emoji: '🏠', desc: 'Total 100 jam di voice chat', category: 'Voice', reward: 3000 },
    // --- QUEST ---
    { id: 'quest_first', name: 'Misi Pertama', emoji: '📜', desc: 'Selesaikan quest pertama', category: 'Quest', reward: 100 },
    { id: 'quest_10', name: 'Quest Warrior', emoji: '⚔️', desc: 'Selesaikan 10 quest', category: 'Quest', reward: 400 },
    { id: 'quest_50', name: 'Quest Master', emoji: '🎖️', desc: 'Selesaikan 50 quest', category: 'Quest', reward: 1500 },
    { id: 'quest_100', name: 'Quiz Champion', emoji: '🧠', desc: 'Selesaikan 100 quest', category: 'Quest', reward: 3000 },
    // --- SPECIAL ---
    { id: 'redeem_first', name: 'Voucher Hunter', emoji: '🎟️', desc: 'Pertama kali redeem voucher', category: 'Special', reward: 50 },
    { id: 'custom_role', name: 'Fashionista', emoji: '🎨', desc: 'Membuat Custom Role', category: 'Special', reward: 200 },
    { id: 'all_quest_day', name: 'Perfect Day', emoji: '✨', desc: 'Selesaikan semua quest dalam 1 hari', category: 'Special', reward: 500 },
    // --- FISHING ---
    { id: 'fish_first', name: 'Pemancing Pemula', emoji: '🎣', desc: 'Pertama kali memancing', category: 'Fishing', reward: 50 },
    { id: 'fish_10', name: 'Nelayan', emoji: '🚣', desc: 'Tangkap 10 ikan', category: 'Fishing', reward: 200 },
    { id: 'fish_50', name: 'Kapten Laut', emoji: '⚓', desc: 'Tangkap 50 ikan', category: 'Fishing', reward: 500 },
    { id: 'fish_100', name: 'Master Angler', emoji: '🏅', desc: 'Tangkap 100 ikan', category: 'Fishing', reward: 1000 },
    { id: 'fish_500', name: 'Fishing Legend', emoji: '🐋', desc: 'Tangkap 500 ikan', category: 'Fishing', reward: 3000 },
    { id: 'fish_rare', name: 'Rare Catch', emoji: '🐡', desc: 'Tangkap ikan Rare pertama', category: 'Fishing', reward: 300 },
    { id: 'fish_epic', name: 'Epic Fisher', emoji: '🦈', desc: 'Tangkap ikan Epic pertama', category: 'Fishing', reward: 800 },
    { id: 'fish_legendary', name: 'Legendary Catch', emoji: '🐉', desc: 'Tangkap ikan Legendary pertama', category: 'Fishing', reward: 2000 },
    { id: 'fish_mythic', name: 'Mythic Hunter', emoji: '🌈', desc: 'Tangkap ikan Mythic pertama', category: 'Fishing', reward: 5000 },
    { id: 'fish_sell_10k', name: 'Fish Merchant', emoji: '💰', desc: 'Total jual ikan senilai 10.000', category: 'Fishing', reward: 500 },
    { id: 'fish_sell_100k', name: 'Fish Tycoon', emoji: '🤑', desc: 'Total jual ikan senilai 100.000', category: 'Fishing', reward: 2000 },
    { id: 'fish_heavy', name: 'Monster Fish!', emoji: '🐳', desc: 'Tangkap ikan berat > 500 kg', category: 'Fishing', reward: 1500 },
    { id: 'fish_rod_pro', name: 'Pro Equipment', emoji: '🏆', desc: 'Beli Joran Pro Titanium', category: 'Fishing', reward: 500 },
    { id: 'fish_rod_mythic', name: 'Ultimate Gear', emoji: '🔱', desc: 'Beli Joran Mitik', category: 'Fishing', reward: 2000 },
    { id: 'fish_secret', name: 'Secret Finder', emoji: '🔮', desc: 'Tangkap ikan Secret pertama', category: 'Fishing', reward: 10000 },
    // --- SLOT MACHINE ---
    { id: 'slot_first', name: 'Slot Beginner', emoji: '🎰', desc: 'Pertama kali main slot', category: 'Gambling', reward: 50 },
    { id: 'slot_jackpot', name: 'JACKPOT!', emoji: '💰', desc: 'Dapat jackpot pertama (3x sama)', category: 'Gambling', reward: 1000 },
    { id: 'slot_jackpot_7', name: 'Lucky Seven', emoji: '7️⃣', desc: 'Jackpot 7️⃣7️⃣7️⃣ (25x payout)', category: 'Gambling', reward: 5000 },
    { id: 'slot_win_10', name: 'Slot Addict', emoji: '🎲', desc: 'Menang slot 10 kali', category: 'Gambling', reward: 300 },
    { id: 'slot_win_50', name: 'Slot Master', emoji: '🃏', desc: 'Menang slot 50 kali', category: 'Gambling', reward: 1500 },
    { id: 'slot_total_100k', name: 'High Roller', emoji: '💵', desc: 'Total menang slot 100.000 money', category: 'Gambling', reward: 2000 },
    // --- GIFT / TRANSFER ---
    { id: 'gift_first', name: 'Dermawan', emoji: '🎁', desc: 'Pertama kali kirim gift ke orang lain', category: 'Social', reward: 100 },
    { id: 'gift_10', name: 'Generous Soul', emoji: '💝', desc: 'Kirim gift 10 kali', category: 'Social', reward: 500 },
    { id: 'gift_50', name: 'Philanthropist', emoji: '🏛️', desc: 'Kirim gift 50 kali', category: 'Social', reward: 2000 },
    { id: 'gift_total_50k', name: 'Big Spender', emoji: '💸', desc: 'Total kirim 50.000 money', category: 'Social', reward: 1000 },
    { id: 'gift_received_first', name: 'Dicintai', emoji: '❤️', desc: 'Pertama kali menerima gift', category: 'Social', reward: 50 },
];


function hasAchievement(guildId, userId, achievementId) {
    return !!db.prepare('SELECT 1 FROM achievements WHERE guildId = ? AND userId = ? AND achievementId = ?').get(guildId, userId, achievementId);
}

async function grantAchievement(guild, userId, achievementId) {
    const guildId = guild.id;
    if (hasAchievement(guildId, userId, achievementId)) return false;
    const achDef = ACHIEVEMENTS.find(a => a.id === achievementId);
    if (!achDef) return false;

    db.prepare('INSERT OR IGNORE INTO achievements (guildId, userId, achievementId, unlockedAt) VALUES (?, ?, ?, ?)').run(guildId, userId, achievementId, Date.now());
    
    // Berikan reward uang
    const user = getOrCreateUser(guildId, userId);
    user.balance += achDef.reward;
    db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(user.balance, guildId, userId);

    // Kirim notifikasi ke channel achievement
    const achChannelId = getSetting(guildId, 'achievement_channel', null);
    if (achChannelId) {
        const channel = guild.channels.cache.get(achChannelId);
        if (channel) {
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🏆 ACHIEVEMENT UNLOCKED!')
                .setDescription(`<@${userId}> mendapatkan badge baru!\n\n${achDef.emoji} **${achDef.name}**\n> *${achDef.desc}*\n\n🎁 Hadiah: 🪙 **${achDef.reward.toLocaleString('id-ID')} Money**`)
                .setFooter({ text: `Kategori: ${achDef.category}` })
                .setTimestamp();
            channel.send({ embeds: [embed] }).catch(() => {});
        }
    }
    return true;
}

async function checkAchievements(guild, userId, context = {}) {
    const guildId = guild.id;
    const user = getOrCreateUser(guildId, userId);
    const checks = [];

    // --- CHAT ---
    if (context.type === 'chat') {
        const chatCount = getUserStat(guildId, userId, 'total_chats');
        if (chatCount >= 1) checks.push('first_chat');
        if (chatCount >= 100) checks.push('chat_100');
        if (chatCount >= 500) checks.push('chat_500');
        if (chatCount >= 1000) checks.push('chat_1000');
        if (chatCount >= 5000) checks.push('chat_5000');
    }
    // --- REACTION ---
    if (context.type === 'reaction') {
        const reactCount = getUserStat(guildId, userId, 'total_reactions');
        if (reactCount >= 50) checks.push('react_50');
        if (reactCount >= 200) checks.push('react_200');
    }
    // --- ECONOMY (Balance) ---
    if (user.balance >= 10000) checks.push('balance_10k');
    if (user.balance >= 100000) checks.push('balance_100k');
    if (user.balance >= 1000000) checks.push('balance_1m');
    // --- ECONOMY (Buy) ---
    if (context.type === 'buy') {
        const buyCount = getUserStat(guildId, userId, 'total_buys');
        if (buyCount >= 1) checks.push('first_buy');
        if (buyCount >= 10) checks.push('buy_10');
    }
    // --- DAILY ---
    if (context.type === 'daily') {
        const dailyCount = getUserStat(guildId, userId, 'total_dailies');
        if (dailyCount >= 7) checks.push('daily_7');
        if (dailyCount >= 30) checks.push('daily_30');
    }
    // --- LEVEL ---
    if (user.level >= 5) checks.push('level_5');
    if (user.level >= 10) checks.push('level_10');
    if (user.level >= 25) checks.push('level_25');
    if (user.level >= 50) checks.push('level_50');
    if (user.level >= 100) checks.push('level_100');
    // --- STREAK ---
    if (context.type === 'streak') {
        const streakData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId);
        const count = streakData ? streakData.count : 0;
        if (count >= 7) checks.push('streak_7');
        if (count >= 14) checks.push('streak_14');
        if (count >= 30) checks.push('streak_30');
        if (count >= 60) checks.push('streak_60');
        if (count >= 100) checks.push('streak_100');
    }
    // --- GAMBLING ---
    if (context.type === 'coinflip') {
        const cfCount = getUserStat(guildId, userId, 'total_coinflips');
        const cfWins = getUserStat(guildId, userId, 'coinflip_wins');
        if (cfCount >= 1) checks.push('coinflip_first');
        if (cfWins >= 5) checks.push('coinflip_win_5');
        if (cfWins >= 20) checks.push('coinflip_win_20');
        if (cfWins >= 50) checks.push('coinflip_win_50');
    }
    // --- MINI EVENTS ---
    if (context.type === 'event_win') {
        const eventWins = getUserStat(guildId, userId, 'event_wins');
        if (eventWins >= 1) checks.push('event_first');
        if (eventWins >= 10) checks.push('event_10');
        if (eventWins >= 50) checks.push('event_50');
    }
    // --- VOICE ---
    if (context.type === 'voice') {
        const voiceMins = getUserStat(guildId, userId, 'total_voice_mins');
        if (voiceMins >= 60) checks.push('voice_1h');
        if (voiceMins >= 600) checks.push('voice_10h');
        if (voiceMins >= 3000) checks.push('voice_50h');
        if (voiceMins >= 6000) checks.push('voice_100h');
    }
    // --- QUEST ---
    if (context.type === 'quest') {
        const questCount = getUserStat(guildId, userId, 'total_quests_done');
        if (questCount >= 1) checks.push('quest_first');
        if (questCount >= 10) checks.push('quest_10');
        if (questCount >= 50) checks.push('quest_50');
        if (questCount >= 100) checks.push('quest_100');
    }
    // --- SPECIAL ---
    if (context.type === 'redeem') checks.push('redeem_first');
    if (context.type === 'custom_role') checks.push('custom_role');
    if (context.type === 'all_quest_day') checks.push('all_quest_day');
    // --- FISHING ---
    if (context.type === 'fishing') {
        const fishCount = getUserStat(guildId, userId, 'total_fish_caught');
        if (fishCount >= 1) checks.push('fish_first');
        if (fishCount >= 10) checks.push('fish_10');
        if (fishCount >= 50) checks.push('fish_50');
        if (fishCount >= 100) checks.push('fish_100');
        if (fishCount >= 500) checks.push('fish_500');
        if (context.tier === 'Rare') checks.push('fish_rare');
        if (context.tier === 'Epic') checks.push('fish_epic');
        if (context.tier === 'Legendary') checks.push('fish_legendary');
        if (context.tier === 'Mythic') checks.push('fish_mythic');
        if (context.tier === 'Secret') checks.push('fish_secret');
        if (context.weight > 500) checks.push('fish_heavy');
    }
    if (context.type === 'fish_sell') {
        const totalSold = getUserStat(guildId, userId, 'total_fish_sold_value');
        if (totalSold >= 10000) checks.push('fish_sell_10k');
        if (totalSold >= 100000) checks.push('fish_sell_100k');
    }
    if (context.type === 'fish_rod') {
        if (context.rod === 'pro') checks.push('fish_rod_pro');
        if (context.rod === 'mythic_rod') checks.push('fish_rod_mythic');
    }
    // --- SLOT ---
    if (context.type === 'slot') {
        const slotWins = getUserStat(guildId, userId, 'slot_wins');
        const slotTotal = getUserStat(guildId, userId, 'slot_total_winnings');
        checks.push('slot_first');
        if (context.jackpot) checks.push('slot_jackpot');
        if (context.jackpot7) checks.push('slot_jackpot_7');
        if (slotWins >= 10) checks.push('slot_win_10');
        if (slotWins >= 50) checks.push('slot_win_50');
        if (slotTotal >= 100000) checks.push('slot_total_100k');
    }
    // --- GIFT ---
    if (context.type === 'gift_send') {
        const giftCount = getUserStat(guildId, userId, 'total_gifts_sent');
        const giftTotal = getUserStat(guildId, userId, 'total_gift_amount');
        if (giftCount >= 1) checks.push('gift_first');
        if (giftCount >= 10) checks.push('gift_10');
        if (giftCount >= 50) checks.push('gift_50');
        if (giftTotal >= 50000) checks.push('gift_total_50k');
    }
    if (context.type === 'gift_receive') checks.push('gift_received_first');

    for (const achId of checks) {
        await grantAchievement(guild, userId, achId);
    }
}


// ================= LOGIKA MINI EVENTS =================
const activeMiniEvents = new Map(); const guildMessageCounters = new Map(); const MINI_EVENT_TARGET = 30; 
const FISH_EVENT_TARGET = 100;
const guildFishEventCounters = new Map();
const activeFishEvents = new Map();

const FISH_TOURNAMENT_TYPES = [
    { type: 'first_catch', desc: 'tangkap ikan **{tier}** pertama', tierTarget: null },
    { type: 'heaviest', desc: 'tangkap ikan **terberat** dalam 5 menit' },
    { type: 'most_fish', desc: 'tangkap ikan **terbanyak** dalam 5 menit' },
    { type: 'specific_tier', desc: 'tangkap ikan **{tier}** pertama', tierTarget: null }
];
const poolAcakKata = ["DISCORD", "KOMPUTER", "INTERNET", "PROGRAMMER", "INDONESIA", "KEYBOARD", "LAPTOP", "MONITOR", "EKONOMI", "SERVER", "DATABASE", "JAVASCRIPT", "DEVELOPER", "APLIKASI", "INTERAKSI", "KOMUNITAS", "GAMER", "STREAMING", "MODERATOR", "ADMINISTRATOR", "HADIAH", "VOUCHER", "DOMPET", "SAHABAT", "KONTRIBUTOR"];
function shuffleString(str) { let arr = str.split(''); for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr.join(''); }
function getRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ================= LOGIKA DAILY QUEST & STREAK =================
const poolKata = ["kopi hitam", "bot super", "hari ini cerah", "push rank bang", "mabar yuk", "ikan terbang", "nasi padang", "sate madura", "es campur", "bakso urat"];
const poolTebakan = [{q: "Benda apa yang kalau ditutup jadi tongkat, kalau dibuka jadi tenda?", a: "payung"}, {q: "Hewan apa yang bersaudara?", a: "katak beradik"}];

function generateDailyQuests() {
    const types = ['tag', 'typing', 'voice', 'reaction', 'tebak'].sort(() => 0.5 - Math.random()).slice(0, 3); const quests = [];
    types.forEach(type => {
        if (type === 'tag') quests.push({ type: 'tag', target: 1, reward: getRandomInt(50, 100), desc: '🏷️ Tag/Mention seseorang di channel chat', progress: 0, claimed: false });
        else if (type === 'typing') { const kata = poolKata[Math.floor(Math.random() * poolKata.length)]; quests.push({ type: 'typing', target: 1, text: kata, reward: getRandomInt(50, 100), desc: `⌨️ Ketik kalimat ini di chat: **"${kata}"**`, progress: 0, claimed: false }); } 
        else if (type === 'voice') quests.push({ type: 'voice', target: getRandomInt(5, 10), reward: getRandomInt(50, 100), desc: `🎙️ Join voice channel selama ${getRandomInt(5, 10)} menit`, progress: 0, claimed: false });
        else if (type === 'reaction') quests.push({ type: 'reaction', target: getRandomInt(5, 10), reward: getRandomInt(50, 100), desc: `👍 Berikan ${getRandomInt(5, 10)} reaction ke pesan orang`, progress: 0, claimed: false });
        else if (type === 'tebak') { const t = poolTebakan[Math.floor(Math.random() * poolTebakan.length)]; quests.push({ type: 'tebak', target: 1, question: t.q, answer: t.a, reward: getRandomInt(100, 200), desc: `🧠 Jawab tebakan ini di chat:\n*"${t.q}"*`, progress: 0, claimed: false }); }
    });
    return quests;
}

function updateQuestProgress(guildId, userId, questType, amount = 1, payload = null) {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); let row = db.prepare('SELECT * FROM daily_quests WHERE guildId = ? AND userId = ?').get(guildId, userId); let quests = (!row || row.date !== today) ? generateDailyQuests() : JSON.parse(row.data);
    if (!row || row.date !== today) db.prepare('INSERT OR REPLACE INTO daily_quests (guildId, userId, date, data) VALUES (?, ?, ?, ?)').run(guildId, userId, today, JSON.stringify(quests));
    let updated = false;
    for (let q of quests) {
        if (q.type === questType && q.progress < q.target && !q.claimed) {
            let valid = true; if (questType === 'typing' && (!payload || !payload.toLowerCase().includes(q.text.toLowerCase()))) valid = false; if (questType === 'tebak' && (!payload || !payload.toLowerCase().includes(q.answer.toLowerCase()))) valid = false;
            if (valid) { q.progress += amount; if (q.progress > q.target) q.progress = q.target; updated = true; }
        }
    }
    if (updated) db.prepare('UPDATE daily_quests SET data = ? WHERE guildId = ? AND userId = ?').run(JSON.stringify(quests), guildId, userId);
}


async function checkAndUpdateStreak(message) {
    const member = message.member; if (member.user.bot || getSetting(member.guild.id, 'streak_enabled', 'true') === 'false') return false; 
    const guildId = member.guild.id, userId = member.id, today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); let streakData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId), streakActivatedToday = false;

    if (!streakData) { db.prepare('INSERT INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, 1, ?)').run(guildId, userId, today); streakData = { count: 1, last_date: today }; streakActivatedToday = true; } 
    else if (streakData.last_date !== today) {
        const diffDays = Math.floor((new Date(today) - new Date(streakData.last_date)) / 86400000);
        if (diffDays === 1) streakData.count += 1; else { if (streakData.count > 1) db.prepare('INSERT OR REPLACE INTO streak_history (guildId, userId, lost_count) VALUES (?, ?, ?)').run(guildId, userId, streakData.count); streakData.count = 1; }
        db.prepare('UPDATE streaks SET count = ?, last_date = ? WHERE guildId = ? AND userId = ?').run(streakData.count, today, guildId, userId); streakActivatedToday = true;
    }
    if (getSetting(guildId, 'streak_auto_nick', 'true') === 'true' && member.manageable) {
        const minStreak = parseInt(getSetting(guildId, 'streak_min', '3')), emoji = getSetting(guildId, 'streak_emoji', '🔥'), baseNick = (member.nickname || member.user.username).split(` ${emoji} `)[0], newNick = streakData.count >= minStreak ? `${baseNick} ${emoji} ${streakData.count}` : baseNick;
        if ((member.nickname || member.user.username) !== newNick && newNick.length <= 32) await member.setNickname(newNick).catch(() => {});
    }
    // Check streak achievements & send notification
    if (streakActivatedToday) {
        await checkAchievements(member.guild, userId, { type: 'streak' });
        const streakChannelId = getSetting(guildId, 'streak_channel', null);
        if (streakChannelId && streakData.count > 1) {
            const streakCh = member.guild.channels.cache.get(streakChannelId);
            if (streakCh) {
                const streakEmoji = getSetting(guildId, 'streak_emoji', '🔥');
                streakCh.send({ embeds: [new EmbedBuilder().setColor('#FF4500').setDescription(`${streakEmoji} <@${userId}> mengaktifkan streak hari ke-**${streakData.count}**!`).setTimestamp()] }).catch(() => {});
            }
        }
    }
    return streakActivatedToday;
}


// ================= LOGIKA XP & LEVEL =================
async function addXpAndMoney(member, type, multiplier = 1) {
    const guildId = member.guild.id, user = getOrCreateUser(guildId, member.id);
    let defaultMin = 15, defaultMax = 25; if (type === 'voice') { defaultMin = 60; defaultMax = 120; } if (type === 'reaction') { defaultMin = 50; defaultMax = 100; }
    const gainedXp = (Math.floor(Math.random() * (getConf(guildId, `${type}_max_xp`, defaultMax) - getConf(guildId, `${type}_min_xp`, defaultMin) + 1)) + getConf(guildId, `${type}_min_xp`, defaultMin)) * multiplier;
    user.xp += gainedXp; user.balance += Math.floor(gainedXp / 2); 
    
    if (user.xp >= (user.level + 1) * 100) { 
        user.level += 1; user.xp = 0; const reward = db.prepare('SELECT * FROM rewards WHERE guildId = ? AND level = ?').get(guildId, user.level); let teksHadiah = "";
        if (reward) {
            let dapatRole = false, dapatUang = false;
            if (reward.roleId) { const role = member.guild.roles.cache.get(reward.roleId); if (role) { await member.roles.add(role).catch(() => {}); teksHadiah += ` Role <@&${reward.roleId}>`; dapatRole = true; } }
            if (reward.money > 0) { user.balance += reward.money; teksHadiah += `${dapatRole ? ' dan' : ''} 🪙 **${reward.money.toLocaleString('id-ID')} Money**`; dapatUang = true; }
            if (dapatRole || dapatUang) teksHadiah = `\n🎁 **Hadiah Bonus:** Kamu mendapatkan${teksHadiah}!`;
        }
        db.prepare('UPDATE users SET xp = ?, level = ?, balance = ?, lastDaily = ? WHERE guildId = ? AND userId = ?').run(user.xp, user.level, user.balance, user.lastDaily, guildId, member.id);
        const levelChannelId = getSetting(guildId, 'level_channel', null), channel = levelChannelId ? member.guild.channels.cache.get(levelChannelId) : (member.guild.systemChannel || member.guild.channels.cache.filter(c => c.isTextBased()).first());
        if (channel) channel.send(`🎉 **LEVEL UP!** <@${member.id}> telah mencapai **Level ${user.level}**!${teksHadiah}`);
        await checkAchievements(member.guild, member.id, { type: 'level' });
    } else {
        db.prepare('UPDATE users SET xp = ?, level = ?, balance = ?, lastDaily = ? WHERE guildId = ? AND userId = ?').run(user.xp, user.level, user.balance, user.lastDaily, guildId, member.id);
    }
    await checkAchievements(member.guild, member.id, { type: 'balance' });
}

// ================= SETUP BOT =================
const TOKEN = process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN_HERE'; 
const CLIENT_ID = process.env.CLIENT_ID || '1058955900389445672'; 

const chatCooldowns = new Set(), reactionCooldowns = new Set(), voiceSessions = new Map(), activeCoinflips = new Set(), slashCooldowns = new Collection(); 

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMembers], partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember] });


// ================= DAFTAR SLASH COMMANDS =================
const commands = [
    new SlashCommandBuilder().setName('help').setDescription('Lihat daftar lengkap command dan panduan bot ini'),
    new SlashCommandBuilder()
        .setName('setting')
        .setDescription('Pengaturan Fitur Server (Khusus Admin)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub.setName('quest_channel').setDescription('Atur channel khusus untuk buka /quest').addChannelOption(opt => opt.setName('channel').setDescription('Pilih channel').setRequired(true)))
        .addSubcommand(sub => sub.setName('level_channel').setDescription('Atur channel khusus notifikasi Level Up').addChannelOption(opt => opt.setName('channel').setDescription('Pilih channel').setRequired(true)))
        .addSubcommand(sub => sub.setName('achievement_channel').setDescription('Atur channel notifikasi Achievement').addChannelOption(opt => opt.setName('channel').setDescription('Pilih channel').setRequired(true)))
        .addSubcommand(sub => sub.setName('streak_channel').setDescription('Atur channel notifikasi Streak').addChannelOption(opt => opt.setName('channel').setDescription('Pilih channel').setRequired(true)))
        .addSubcommand(sub => sub.setName('setup_notifications').setDescription('Auto-create kategori Notification + semua channel notifikasi')),
    new SlashCommandBuilder()
        .setName('tempvoice')
        .setDescription('Sistem Auto Voice Channel')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub.setName('setup').setDescription('Auto-Create kategori dan text channel Control Panel Private Voice!')),
    new SlashCommandBuilder()
        .setName('level')
        .setDescription('Sistem Leveling & XP')
        .addSubcommand(sub => sub.setName('rank').setDescription('Cek rank kamu').addUserOption(opt => opt.setName('user').setDescription('Pilih user')))
        .addSubcommand(sub => sub.setName('leaderboard').setDescription('Top global level'))
        .addSubcommandGroup(group => group
            .setName('setting')
            .setDescription('Pengaturan Admin')
            .addSubcommand(sub => sub.setName('rolereward').setDescription('Atur hadiah level').addStringOption(opt => opt.setName('action').setDescription('Aksi').setRequired(true).addChoices({name: 'Add', value: 'add'}, {name: 'Remove', value: 'remove'}, {name: 'List', value: 'list'})).addIntegerOption(opt => opt.setName('level').setDescription('Level')).addRoleOption(opt => opt.setName('role').setDescription('Role')).addIntegerOption(opt => opt.setName('money').setDescription('Money')))
            .addSubcommand(sub => sub.setName('xp').setDescription('Atur Min, Max, dan Cooldown XP').addStringOption(opt => opt.setName('tipe').setDescription('Sumber XP').setRequired(true).addChoices({name: '💬 Chat Message', value: 'chat'}, {name: '🎙️ Voice Chat', value: 'voice'}, {name: '😀 Reaction', value: 'reaction'})).addIntegerOption(opt => opt.setName('min_xp').setDescription('Minimal XP').setRequired(true)).addIntegerOption(opt => opt.setName('max_xp').setDescription('Maksimal XP').setRequired(true)).addIntegerOption(opt => opt.setName('cooldown').setDescription('Cooldown').setRequired(true)).addStringOption(opt => opt.setName('award_to').setDescription('(Khusus Reaction)').setRequired(false).addChoices({name: 'Both Users', value: 'both'}, {name: 'Message Author', value: 'author'}, {name: 'Reactor', value: 'reactor'}, {name: 'None', value: 'none'})))
        ),
    new SlashCommandBuilder()
        .setName('money')
        .setDescription('Sistem Ekonomi Server')
        .addSubcommand(sub => sub.setName('balance').setDescription('Cek dompet'))
        .addSubcommand(sub => sub.setName('daily').setDescription('Ambil money harian'))
        .addSubcommand(sub => sub.setName('leaderboard').setDescription('Orang terkaya'))
        .addSubcommandGroup(group => group
            .setName('manage')
            .setDescription('Keamanan Tinggi: Sistem Kasir')
            .addSubcommand(sub => sub.setName('atur').setDescription('(Banker) Atur uang user').addStringOption(opt => opt.setName('action').setDescription('Aksi').setRequired(true).addChoices({name: 'Add', value: 'add'}, {name: 'Take', value: 'take'}, {name: 'Set', value: 'set'})).addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('jumlah').setDescription('Jumlah').setRequired(true)))
            .addSubcommand(sub => sub.setName('add_admin').setDescription('(OWNER) Beri izin mengelola uang').addUserOption(opt => opt.setName('user').setDescription('User yang diizinkan')).addRoleOption(opt => opt.setName('role').setDescription('Role yang diizinkan')))
            .addSubcommand(sub => sub.setName('remove_admin').setDescription('(OWNER) Cabut izin mengelola uang').addUserOption(opt => opt.setName('user').setDescription('User yang dicabut')).addRoleOption(opt => opt.setName('role').setDescription('Role yang dicabut')))
            .addSubcommand(sub => sub.setName('list_admin').setDescription('(OWNER) Lihat list banker aktif'))
        ),
    new SlashCommandBuilder().setName('shop').setDescription('Buka menu toko'),
    new SlashCommandBuilder().setName('redeem').setDescription('Klaim kode promo').addStringOption(opt => opt.setName('kode').setDescription('Masukkan kode voucher').setRequired(true)),
    new SlashCommandBuilder().setName('quest').setDescription('Cek Misi Harian untuk dapat hadiah uang!'),
    new SlashCommandBuilder().setName('coinflip').setDescription('Lempar koin (50/50)!').addIntegerOption(opt => opt.setName('taruhan').setDescription('Jumlah uang (Max: 500)').setRequired(true).setMinValue(10).setMaxValue(500)),
    new SlashCommandBuilder().setName('slot').setDescription('🎰 Slot Machine! 8 simbol, payout hingga 25x!').addIntegerOption(opt => opt.setName('taruhan').setDescription('Jumlah taruhan (10-1000)').setRequired(true).setMinValue(10).setMaxValue(1000)),
    new SlashCommandBuilder().setName('gift').setDescription('🎁 Kirim money ke player lain').addUserOption(opt => opt.setName('user').setDescription('Siapa yang mau dikasih?').setRequired(true)).addIntegerOption(opt => opt.setName('jumlah').setDescription('Jumlah money (Max: 10.000)').setRequired(true).setMinValue(1).setMaxValue(10000)),
    new SlashCommandBuilder()
        .setName('admin_shop')
        .setDescription('Manajemen Toko (Khusus Admin)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub.setName('add_role').setDescription('Jual Role').addRoleOption(opt => opt.setName('role').setDescription('Role').setRequired(true)).addIntegerOption(opt => opt.setName('harga').setDescription('Harga').setRequired(true)))
        .addSubcommand(sub => sub.setName('add_item').setDescription('Jual Barang Virtual').addStringOption(opt => opt.setName('nama').setDescription('Nama Barang').setRequired(true)).addIntegerOption(opt => opt.setName('harga').setDescription('Harga').setRequired(true)).addStringOption(opt => opt.setName('isi').setDescription('Isi text ke DM').setRequired(true)).addIntegerOption(opt => opt.setName('jumlah').setDescription('Jumlah Stok').setRequired(false)))
        .addSubcommand(sub => sub.setName('voucher_add').setDescription('Buat kode promo').addStringOption(opt => opt.setName('kode').setDescription('Ketik kode').setRequired(true)).addIntegerOption(opt => opt.setName('reward').setDescription('Hadiah money').setRequired(true)).addIntegerOption(opt => opt.setName('limit').setDescription('Batas klaim').setRequired(true)))
        .addSubcommand(sub => sub.setName('set_testimoni').setDescription('Atur channel testimoni').addChannelOption(opt => opt.setName('channel').setDescription('Pilih channel').setRequired(true)))
        .addSubcommand(sub => sub.setName('history').setDescription('Lihat log transaksi').addIntegerOption(opt => opt.setName('jumlah').setDescription('Jumlah history').setRequired(false)))
        .addSubcommand(sub => sub.setName('set_custom_role').setDescription('Atur harga tiket Custom Role').addIntegerOption(opt => opt.setName('harga').setDescription('Harga (Ketik 0 untuk mematikan)').setRequired(true))), 
    new SlashCommandBuilder().setName('profile').setDescription('Lihat kartu informasi lengkap akun member').addUserOption(opt => opt.setName('user').setDescription('Pilih user').setRequired(false)),
    new SlashCommandBuilder().setName('achievement').setDescription('Lihat koleksi badge/achievement kamu').addUserOption(opt => opt.setName('user').setDescription('Pilih user').setRequired(false)),
    new SlashCommandBuilder().setName('inventory').setDescription('🎒 Lihat item yang kamu punya'),
    new SlashCommandBuilder().setName('use').setDescription('Gunakan item dari inventory').addStringOption(opt => opt.setName('item').setDescription('Nama item yang mau dipakai').setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder().setName('fish').setDescription('Lempar pancing dan tangkap ikan!'),
    new SlashCommandBuilder()
        .setName('fishing')
        .setDescription('Sistem Memancing')
        .addSubcommand(sub => sub.setName('inventory').setDescription('Lihat ikan yang kamu punya').addIntegerOption(opt => opt.setName('page').setDescription('Halaman (default: 1)').setRequired(false)))
        .addSubcommand(sub => sub.setName('shop').setDescription('Beli joran dan umpan'))
        .addSubcommand(sub => sub.setName('stats').setDescription('Statistik memancingmu'))
        .addSubcommand(sub => sub.setName('equip').setDescription('Lihat perlengkapan saat ini'))
        .addSubcommand(sub => sub.setName('sell').setDescription('Jual semua ikan (kecuali yang di-lock)'))
        .addSubcommand(sub => sub.setName('collection').setDescription('Lihat Fish Collection / Pokedex ikanmu'))
        .addSubcommand(sub => sub.setName('lock').setDescription('Lock ikan agar tidak terjual').addIntegerOption(opt => opt.setName('id').setDescription('ID ikan dari inventory').setRequired(true)))
        .addSubcommand(sub => sub.setName('unlock').setDescription('Unlock ikan yang di-lock').addIntegerOption(opt => opt.setName('id').setDescription('ID ikan dari inventory').setRequired(true))),
    new SlashCommandBuilder()
        .setName('streak')
        .setDescription('Sistem Api Harian (Daily Streak)')
        .addSubcommand(sub => sub.setName('cek').setDescription('Cek informasi streak kamu saat ini'))
        .addSubcommand(sub => sub.setName('restore').setDescription('Pulihkan streak yang putus (Max 3x sebulan)'))
        .addSubcommand(sub => sub.setName('setting').setDescription('(Khusus Admin) Atur fitur streak').addStringOption(opt => opt.setName('status').setDescription('Nyalakan/Matikan sistem?').setRequired(true).addChoices({name: 'Nyala (Enable)', value: 'true'}, {name: 'Mati (Disable)', value: 'false'})).addStringOption(opt => opt.setName('autonick').setDescription('Auto ganti nickname ada apinya?').setRequired(true).addChoices({name: 'Ya', value: 'true'}, {name: 'Tidak', value: 'false'})).addIntegerOption(opt => opt.setName('min_hari').setDescription('Butuh berapa hari berturut-turut untuk dapat emoji?').setRequired(true)).addStringOption(opt => opt.setName('emoji').setDescription('Emoji yang ditampilkan (Default: 🔥)').setRequired(false)))
        .addSubcommand(sub => sub.setName('admin_set').setDescription('(Khusus Admin) Atur jumlah streak user').addUserOption(opt => opt.setName('user').setDescription('Pilih user').setRequired(true)).addIntegerOption(opt => opt.setName('jumlah').setDescription('Jumlah streak baru').setRequired(true)))
        .addSubcommand(sub => sub.setName('admin_reset').setDescription('(Khusus Admin) Hapus/Reset streak user ke 0').addUserOption(opt => opt.setName('user').setDescription('Pilih user').setRequired(true)))
        .addSubcommand(sub => sub.setName('admin_restore').setDescription('(Khusus Admin) Pulihkan streak user tanpa batasan').addUserOption(opt => opt.setName('user').setDescription('Pilih user').setRequired(true)))
];

client.once(Events.ClientReady, async c => { console.log(`🚀 Bot siap! Login sebagai ${c.user.tag}`); const rest = new REST({ version: '10' }).setToken(TOKEN); try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); } catch (error) { console.error(error); } });


// ================= EVENT CHAT & MINI-EVENTS =================
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;
    const guildId = message.guild.id;

    if (activeMiniEvents.has(guildId)) {
        const game = activeMiniEvents.get(guildId);
        if (message.channel.id === game.channelId) {
            let won = false, reward = 0, winText = "";
            if (game.type === 'word' && message.content.toUpperCase() === game.answer) { won = true; reward = Math.floor(Math.random() * (400 - 150 + 1)) + 150; winText = `🎉 **BENAR SEKALI!** <@${message.author.id}> menyusun kata **${game.answer}** dengan cepat!\n🎁 Mendapatkan 🪙 **${reward} Money**!`; } 
            else if (game.type === 'math' && message.content === game.answer.toString()) { won = true; reward = Math.floor(Math.random() * (300 - 100 + 1)) + 100; winText = `🎉 **MATEMATIKA KILAT!** <@${message.author.id}> berhasil menjawab **${game.answer}**!\n🎁 Mendapatkan 🪙 **${reward} Money**!`; } 
            else if (game.type === 'guess') {
                const guess = parseInt(message.content);
                if (!isNaN(guess)) {
                    if (guess === game.answer) { won = true; reward = Math.floor(Math.random() * (500 - 250 + 1)) + 250; winText = `🎯 **TEBAKAN TEPAT!** <@${message.author.id}> menebak angka **${game.answer}**!\n🎁 Mendapatkan 🪙 **${reward} Money**!`; } 
                    else if (guess < game.answer) message.react('⬆️').catch(() => {}); else message.react('⬇️').catch(() => {});
                }
            }
            if (won) {
                clearTimeout(game.timer); activeMiniEvents.delete(guildId); const userData = getOrCreateUser(guildId, message.author.id); userData.balance += reward;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, message.author.id);
                incrementUserStat(guildId, message.author.id, 'event_wins');
                await checkAchievements(message.guild, message.author.id, { type: 'event_win' });
                return message.reply(winText);
            }
        }
    }

    if (!activeMiniEvents.has(guildId)) {
        let count = guildMessageCounters.get(guildId) || 0; count++;
        if (count >= MINI_EVENT_TARGET) {
            guildMessageCounters.set(guildId, 0); const eventTypes = ['word', 'math', 'guess', 'airdrop'], chosenEvent = eventTypes[Math.floor(Math.random() * eventTypes.length)];
            let embedEvent = new EmbedBuilder().setColor('#9B59B6'), eventData = { channelId: message.channel.id };
            if (chosenEvent === 'word') {
                const answer = poolAcakKata[Math.floor(Math.random() * poolAcakKata.length)]; let scrambledText = shuffleString(answer); while (scrambledText === answer) scrambledText = shuffleString(answer); 
                embedEvent.setTitle('✨ KUIS ACAK KATA MUNCUL!').setDescription(`Siapa cepat dia dapat! Susun huruf ini menjadi sebuah kata:\n\n🔠 **\` ${scrambledText.split('').join(' - ')} \`**\n\n*Ketik jawabanmu langsung di chat ini! (60 Detik)*`); eventData.type = 'word'; eventData.answer = answer;
            } else if (chosenEvent === 'math') {
                const ops = ['+', '-', '*'], op = ops[Math.floor(Math.random() * ops.length)]; let a, b, answer;
                if (op === '+') { a = getRandomInt(10, 50); b = getRandomInt(10, 50); answer = a + b; } else if (op === '-') { a = getRandomInt(30, 80); b = getRandomInt(1, 29); answer = a - b; } else { a = getRandomInt(2, 10); b = getRandomInt(2, 10); answer = a * b; }
                embedEvent.setTitle('🧮 KUIS MATEMATIKA KILAT!').setDescription(`Ayo hitung cepat! Berapa hasil dari:\n\n🔢 **\` ${a} ${op} ${b} = ? \`**\n\n*Ketik angka jawabanmu langsung di chat ini! (60 Detik)*`); eventData.type = 'math'; eventData.answer = answer;
            } else if (chosenEvent === 'guess') {
                const answer = getRandomInt(1, 100); embedEvent.setTitle('🎯 KUIS TEBAK ANGKA!').setDescription(`Bot telah memikirkan sebuah angka dari **1 sampai 100**.\n\nTebak angkanya di chat ini! Bot akan memberi tanda:\n⬆️ Jika angkamu terlalu kecil\n⬇️ Jika angkamu terlalu besar\n\n*(Waktu: 60 Detik)*`); eventData.type = 'guess'; eventData.answer = answer;
            } else if (chosenEvent === 'airdrop') {
                embedEvent.setTitle('📦 AIR DROP JATUH!').setColor('#E67E22').setDescription(`Peti harta karun jatuh di channel ini!\nSiapa cepat dia dapat, segera klik tombol di bawah untuk klaim!`); eventData.type = 'airdrop'; 
            }
            const messageOptions = { embeds: [embedEvent] };
            if (chosenEvent === 'airdrop') { const claimBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('airdrop_claim').setLabel('🎁 Ambil Hadiah').setStyle(ButtonStyle.Success)); messageOptions.components = [claimBtn]; }
            message.channel.send(messageOptions).then(sentMsg => {
                eventData.timer = setTimeout(() => {
                    if (activeMiniEvents.has(guildId)) { activeMiniEvents.delete(guildId); if (chosenEvent === 'airdrop') { const disabledBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('airdrop_expired').setLabel('Kedaluwarsa').setStyle(ButtonStyle.Secondary).setDisabled(true)); sentMsg.edit({ components: [disabledBtn] }).catch(()=>{}); } else sentMsg.channel.send(`⏰ **WAKTU HABIS!** Tidak ada yang berhasil menjawab. Jawaban yang benar: **${eventData.answer}**.`); }
                }, 60000); activeMiniEvents.set(guildId, eventData);
            });
        } else guildMessageCounters.set(guildId, count); 
    }

    // --- FISHING TOURNAMENT EVENT ---
    if (!activeFishEvents.has(guildId)) {
        let fishCount = guildFishEventCounters.get(guildId) || 0; fishCount++;
        if (fishCount >= FISH_EVENT_TARGET) {
            guildFishEventCounters.set(guildId, 0);
            const eventTypes = ['first_legendary', 'first_rare', 'heaviest', 'most_fish', 'first_trash'];
            const chosen = eventTypes[Math.floor(Math.random() * eventTypes.length)];
            let eventDesc = '', eventData = { channelId: message.channel.id, type: chosen, startTime: Date.now(), participants: {} };
            
            if (chosen === 'first_legendary') eventDesc = 'Siapa yang bisa menangkap ikan **Legendary** atau lebih tinggi pertama kali?';
            else if (chosen === 'first_rare') eventDesc = 'Siapa yang bisa menangkap ikan **Rare** atau lebih tinggi pertama kali?';
            else if (chosen === 'heaviest') eventDesc = 'Siapa yang bisa menangkap ikan **paling berat** dalam 5 menit?';
            else if (chosen === 'most_fish') eventDesc = 'Siapa yang bisa menangkap ikan **paling banyak** dalam 5 menit?';
            else if (chosen === 'first_trash') eventDesc = 'Siapa yang bisa menangkap **Sampah (Trash)** pertama kali? 🗑️';
            
            const reward = chosen === 'first_legendary' ? 3000 : (chosen === 'heaviest' ? 2000 : (chosen === 'most_fish' ? 2000 : 1000));
            eventData.reward = reward;
            
            const embed = new EmbedBuilder()
                .setColor('#1ABC9C')
                .setTitle('🎣🏆 FISHING TOURNAMENT!')
                .setDescription(`**Kompetisi memancing dimulai!**\n\n> 🎯 **Tantangan:** ${eventDesc}\n> 🎁 **Hadiah:** 🪙 **${reward.toLocaleString('id-ID')} Money**\n> ⏱️ **Durasi:** 5 menit\n\n*Gunakan \`/fish\` untuk ikut berpartisipasi!*`)
                .setFooter({ text: 'Tournament berakhir dalam 5 menit' })
                .setTimestamp();
            
            message.channel.send({ embeds: [embed] }).then(() => {
                activeFishEvents.set(guildId, eventData);
                // Auto-end after 5 minutes
                setTimeout(() => {
                    if (activeFishEvents.has(guildId)) {
                        const ev = activeFishEvents.get(guildId);
                        activeFishEvents.delete(guildId);
                        let winner = null, winnerValue = 0;
                        
                        if (ev.type === 'heaviest') {
                            for (const [uid, data] of Object.entries(ev.participants)) {
                                if (data.heaviest > winnerValue) { winner = uid; winnerValue = data.heaviest; }
                            }
                        } else if (ev.type === 'most_fish') {
                            for (const [uid, data] of Object.entries(ev.participants)) {
                                if (data.count > winnerValue) { winner = uid; winnerValue = data.count; }
                            }
                        }
                        // first_legendary, first_rare, first_trash are instant-win (handled in /fish)
                        
                        if (winner) {
                            const winnerData = getOrCreateUser(guildId, winner);
                            winnerData.balance += ev.reward;
                            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(winnerData.balance, guildId, winner);
                            const resultText = ev.type === 'heaviest' ? `ikan terberat: **${winnerValue} kg**` : `total tangkapan: **${winnerValue} ikan**`;
                            const ch = message.guild.channels.cache.get(ev.channelId);
                            if (ch) ch.send({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('🏆 TOURNAMENT SELESAI!').setDescription(`Pemenang: <@${winner}>\n> ${resultText}\n\n🎁 Hadiah: 🪙 **${ev.reward.toLocaleString('id-ID')} Money**`)] });
                        } else {
                            const ch = message.guild.channels.cache.get(ev.channelId);
                            if (ch) ch.send({ embeds: [new EmbedBuilder().setColor('#95A5A6').setTitle('🏆 TOURNAMENT SELESAI').setDescription('Tidak ada pemenang. Tidak ada yang berpartisipasi!')] });
                        }
                    }
                }, 300000); // 5 minutes
            });
        } else guildFishEventCounters.set(guildId, fishCount);
    }

    const streakActivated = await checkAndUpdateStreak(message);
    if (streakActivated) message.reply({ content: `🔥 **Berhasil!** Kamu telah mengaktifkan streak api hari ini!` }).then(msg => { setTimeout(() => msg.delete().catch(() => {}), 5000); }).catch(() => {});
    
    const chatText = message.content;
    updateQuestProgress(guildId, message.author.id, 'typing', 1, chatText); updateQuestProgress(guildId, message.author.id, 'tebak', 1, chatText); 
    if (message.mentions.users.filter(u => !u.bot).size > 0) updateQuestProgress(guildId, message.author.id, 'tag', 1);

    incrementUserStat(guildId, message.author.id, 'total_chats');
    await checkAchievements(message.guild, message.author.id, { type: 'chat' });

    const cdKey = `${guildId}_${message.author.id}`;
    if (!chatCooldowns.has(cdKey)) { await addXpAndMoney(message.member, 'chat'); chatCooldowns.add(cdKey); setTimeout(() => chatCooldowns.delete(cdKey), getConf(guildId, 'chat_cooldown', 60) * 1000); }
});


// ================= EVENT VOICE =================
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (newState.member.user.bot) return;
    const guildId = newState.guild.id;

    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        const tempVoiceData = db.prepare('SELECT * FROM temp_voices WHERE channelId = ?').get(oldState.channelId);
        if (tempVoiceData) { const oldChannel = oldState.channel; if (oldChannel && oldChannel.members.size === 0) { db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(oldState.channelId); await oldChannel.delete().catch(() => {}); } }
    }

    const cdKey = `${guildId}_${newState.member.id}`;
    if (!oldState.channelId && newState.channelId && !newState.selfMute && !newState.selfDeaf) voiceSessions.set(cdKey, Date.now());
    if ((oldState.channelId && !newState.channelId) || newState.selfMute || newState.selfDeaf) {
        if (voiceSessions.has(cdKey)) {
            const durationMins = Math.floor((Date.now() - voiceSessions.get(cdKey)) / 60000), multiplier = Math.floor(durationMins / getConf(guildId, 'voice_cooldown', 10));
            if (multiplier > 0) await addXpAndMoney(newState.member, 'voice', multiplier);
            updateQuestProgress(guildId, newState.member.id, 'voice', durationMins);
            incrementUserStat(guildId, newState.member.id, 'total_voice_mins', durationMins);
            await checkAchievements(newState.guild, newState.member.id, { type: 'voice' });
            voiceSessions.delete(cdKey); 
        }
    }
    if (oldState.channelId && newState.channelId && oldState.selfMute && !newState.selfMute && !newState.selfDeaf) voiceSessions.set(cdKey, Date.now());
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot || !reaction.message.guild) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});
    const guildId = reaction.message.guild.id, awardSetting = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, 'reaction_award_to'), awardTo = awardSetting ? awardSetting.value : 'both';
    if (awardTo === 'none') return; 
    
    const reactorId = user.id, authorId = reaction.message.author.id, isAuthorBot = reaction.message.author.bot, cdTime = getConf(guildId, 'reaction_cooldown', 10) * 1000;
    const processReactionXp = async (targetId) => {
        updateQuestProgress(guildId, targetId, 'reaction', 1);
        const cdKey = `${guildId}_${targetId}_react`;
        if (!reactionCooldowns.has(cdKey)) { const member = await reaction.message.guild.members.fetch(targetId).catch(() => null); if (member) { await addXpAndMoney(member, 'reaction'); reactionCooldowns.add(cdKey); setTimeout(() => reactionCooldowns.delete(cdKey), cdTime); } }
    };
    incrementUserStat(guildId, reactorId, 'total_reactions');
    await checkAchievements(reaction.message.guild, reactorId, { type: 'reaction' });
    if (awardTo === 'both' || awardTo === 'reactor') await processReactionXp(reactorId);
    if ((awardTo === 'both' || awardTo === 'author') && !isAuthorBot && reactorId !== authorId) await processReactionXp(authorId);
});


// ================= INTERACTION HANDLER =================
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.guild) return interaction.reply({content: 'Hanya di Server!', ephemeral: true});
    const guildId = interaction.guild.id;

    // Block command usage in restricted channels
    const blockedChannels = ['1347190409402650736'];
    if (interaction.isChatInputCommand() && blockedChannels.includes(interaction.channelId)) {
        return interaction.reply({ content: '❌ Command bot tidak bisa digunakan di channel ini! Gunakan di channel lain.', ephemeral: true });
    }

    // Autocomplete handler for /use
    if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'use') {
            const ownedItems = db.prepare('SELECT * FROM item_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, interaction.user.id);
            const choices = ownedItems.map(inv => {
                const def = ITEMS.find(i => i.id === inv.itemId);
                if (!def) return null;
                return { name: `${def.emoji} ${def.name} (x${inv.quantity})`, value: def.id };
            }).filter(Boolean).slice(0, 25); // Discord max 25 choices
            return interaction.respond(choices);
        }
        return;
    }

    if (interaction.isChatInputCommand()) {
        const command = interaction.commandName, subCmd = interaction.options.getSubcommand(false), group = interaction.options.getSubcommandGroup(false);
        const cdKey = `${interaction.user.id}_${command}`;
        if (slashCooldowns.has(cdKey) && Date.now() < slashCooldowns.get(cdKey)) return interaction.reply({ content: `⏳ Sabar... Tunggu sebentar sebelum memakai perintah ini lagi.`, ephemeral: true });
        slashCooldowns.set(cdKey, Date.now() + 3000);
        const userData = getOrCreateUser(guildId, interaction.user.id);
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        if (command === 'help') {
            const helpEmbed = new EmbedBuilder().setTitle('📖 Panduan Lengkap Bot').setColor('#5865F2').setDescription('Berikut adalah daftar command yang bisa kamu gunakan di server ini:').addFields(
                    { name: '💰 Ekonomi & Permainan', value: `> \`/money balance\` - Cek uangmu.\n> \`/money daily\` - Ambil hadiah harian.\n> \`/money leaderboard\` - Top 10 orang terkaya.\n> \`/shop\` - Beli barang atau role.\n> \`/redeem\` - Tukar kode voucher.\n> \`/quest\` - Buka papan misi harian.\n> \`/coinflip\` - Taruhan lempar koin.\n> \`/slot\` - Main slot machine.\n> \`/gift\` - Kirim money ke player lain.`, inline: false },
                    { name: '🎣 Fishing', value: `> \`/fish\` - Lempar pancing!\n> \`/fishing inventory\` - Lihat ikan.\n> \`/fishing sell\` - Jual semua ikan.\n> \`/fishing collection\` - Pokedex ikan.\n> \`/fishing lock/unlock <id>\` - Kunci ikan.\n> \`/fishing shop\` - Beli joran/umpan.\n> \`/fishing stats\` - Statistik.`, inline: false },
                    { name: '🎒 Inventory & Items', value: `> \`/inventory\` - Lihat item kamu.\n> \`/use <item>\` - Gunakan item.`, inline: false },
                    { name: '📈 Level & Profil', value: `> \`/profile\` - Cek kartu profil.\n> \`/level rank\` - Cek progres XP.\n> \`/level leaderboard\` - Top 10 level.\n> \`/achievement\` - Lihat koleksi badge.`, inline: false },
                    { name: '🔥 Streak Harian', value: `> \`/streak cek\` - Lihat info apimu.\n> \`/streak restore\` - Pulihkan streak yang putus.`, inline: false },
                    { name: '🏆 Achievement', value: `> Badge otomatis unlock saat mencapai milestone.\n> Setiap badge memberi bonus money.\n> Gunakan \`/achievement\` untuk lihat koleksimu.`, inline: false },
                    { name: '🎮 Mini-Event Server', value: `> **Word Scramble, Math Flash, Air Drop, & Tebak Angka** muncul setiap 30 pesan.`, inline: false },
                    { name: '🎶 Temp Voice', value: `> Pergi ke channel Interface dan tekan "Create" untuk membuat Voice privatmu!`, inline: false }
                );
            if (isAdmin) helpEmbed.addFields({ name: '🛡️ Admin', value: `> \`/tempvoice setup\`, \`/admin_shop\`, \`/setting\`, \`/money manage\`\n> \`/level setting\`, \`/streak admin_...\`\n> \`/setting setup_notifications\` - Auto buat kategori notifikasi`, inline: false });
            helpEmbed.setFooter({ text: 'Gunakan command dengan mengetik /', iconURL: interaction.client.user.displayAvatarURL() }).setTimestamp();
            return interaction.reply({ embeds: [helpEmbed] });
        }

        if (command === 'setting') {
            if (!isAdmin) return interaction.reply({content: '❌ Hanya Admin!', ephemeral: true});
            if (subCmd === 'quest_channel') { const ch = interaction.options.getChannel('channel'); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'quest_channel', ch.id); return interaction.reply(`✅ \`/quest\` hanya bisa di <#${ch.id}>.`); }
            if (subCmd === 'level_channel') { const ch = interaction.options.getChannel('channel'); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'level_channel', ch.id); return interaction.reply(`✅ Level Up notif ke <#${ch.id}>.`); }
            if (subCmd === 'achievement_channel') { const ch = interaction.options.getChannel('channel'); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'achievement_channel', ch.id); return interaction.reply(`✅ Achievement notif ke <#${ch.id}>.`); }
            if (subCmd === 'streak_channel') { const ch = interaction.options.getChannel('channel'); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_channel', ch.id); return interaction.reply(`✅ Streak notif ke <#${ch.id}>.`); }
            if (subCmd === 'setup_notifications') {
                await interaction.deferReply();
                try {
                    const category = await interaction.guild.channels.create({ name: '📢 NOTIFICATIONS', type: ChannelType.GuildCategory });
                    const achChannel = await interaction.guild.channels.create({ name: '🏆-achievement', type: ChannelType.GuildText, parent: category.id });
                    const lvlChannel = await interaction.guild.channels.create({ name: '📈-level-up', type: ChannelType.GuildText, parent: category.id });
                    const streakChannel = await interaction.guild.channels.create({ name: '🔥-streak', type: ChannelType.GuildText, parent: category.id });
                    db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'achievement_channel', achChannel.id);
                    db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'level_channel', lvlChannel.id);
                    db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_channel', streakChannel.id);
                    return interaction.editReply(`✅ **Kategori Notification Dibuat!**\n\n📁 **${category.name}**\n> 🏆 Achievement: <#${achChannel.id}>\n> 📈 Level Up: <#${lvlChannel.id}>\n> 🔥 Streak: <#${streakChannel.id}>`);
                } catch (err) { console.error(err); return interaction.editReply('❌ Gagal membuat channel.'); }
            }
        }

        if (command === 'tempvoice') {
            if (!isAdmin) return interaction.reply({content: '❌ Hanya Admin!', ephemeral: true});
            if (subCmd === 'setup') {
                await interaction.deferReply();
                try {
                    const category = await interaction.guild.channels.create({ name: '💬 PRIVATE ROOMS', type: ChannelType.GuildCategory });
                    const interfaceChannel = await interaction.guild.channels.create({ name: '⚙️-interface', type: ChannelType.GuildText, parent: category.id });
                    db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'jtc_category', category.id);
                    const tvEmbed = new EmbedBuilder().setTitle('🔊 TEMP VOICE CONTROL PANEL').setColor('#2B2D31').setDescription('Selamat datang di sistem Private Voice!\n\n**✨ CARA MEMBUAT CHANNEL:**\nKlik tombol biru untuk membuat channel. Waktu **60 detik** untuk bergabung.\n\n**⚙️ CARA MENGATUR:**\nGunakan tombol abu-abu/merah untuk mengatur.').setImage('https://i.imgur.com/K1LWeqW.png').setFooter({ text: 'TempVoice System' });
                    const rowCreate = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tv_create_private').setLabel('Private 🔒').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('tv_create_duo').setLabel('Duo 👥 (2)').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('tv_create_squad').setLabel('Squad 👥 (4)').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('tv_create_custom').setLabel('Custom 🎛️').setStyle(ButtonStyle.Success));
                    const rowManage1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tv_name').setLabel('✏️ Name').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tv_limit').setLabel('👥 Limit').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tv_privacy').setLabel('🔒 Lock/Unlock').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tv_hide').setLabel('👁️ Hide/Unhide').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tv_claim').setLabel('👑 Claim Owner').setStyle(ButtonStyle.Secondary));
                    const rowManage2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tv_transfer').setLabel('🔄 Transfer').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tv_unblock').setLabel('🟢 Unblock').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('tv_kick').setLabel('👢 Kick').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('tv_block').setLabel('🚫 Block').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('tv_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger));
                    await interfaceChannel.send({ embeds: [tvEmbed], components: [rowCreate, rowManage1, rowManage2] });
                    return interaction.editReply(`✅ **Temp Voice Dibuat!** Kategori **${category.name}** + <#${interfaceChannel.id}>`);
                } catch (err) { console.error(err); return interaction.editReply('❌ Gagal. Cek permission bot.'); }
            }
        }


        if (command === 'achievement') {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const userAchs = db.prepare('SELECT * FROM achievements WHERE guildId = ? AND userId = ?').all(guildId, targetUser.id);
            const unlockedIds = userAchs.map(a => a.achievementId);
            const categories = [...new Set(ACHIEVEMENTS.map(a => a.category))];
            const totalUnlocked = unlockedIds.length, totalAll = ACHIEVEMENTS.length;
            const percentComplete = Math.floor((totalUnlocked / totalAll) * 100);

            let desc = `> 🏆 **${totalUnlocked}** / **${totalAll}** badge terkumpul (**${percentComplete}%**)\n\n`;

            for (const cat of categories) {
                const catAchs = ACHIEVEMENTS.filter(a => a.category === cat);
                const catUnlocked = catAchs.filter(a => unlockedIds.includes(a.id)).length;
                const catIcon = { Social: '💬', Economy: '💰', Level: '📈', Streak: '🔥', Gambling: '🎰', Events: '🎮', Voice: '🎙️', Quest: '📜', Special: '✨', Fishing: '🎣' }[cat] || '📁';
                desc += `${catIcon} **${cat}** (${catUnlocked}/${catAchs.length})\n`;
                catAchs.forEach(a => {
                    if (unlockedIds.includes(a.id)) {
                        desc += `> ${a.emoji} ${a.name}\n`;
                    } else {
                        desc += `> ▪️ ???\n`;
                    }
                });
                desc += '\n';
            }

            // Discord embed 4096 char limit
            if (desc.length > 4000) desc = desc.substring(0, 3990) + '\n\n*...dan lainnya*';

            const embed = new EmbedBuilder()
                .setAuthor({ name: `Achievement Collection | ${targetUser.username}`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
                .setColor('#FFD700')
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
                .setDescription(desc)
                .setFooter({ text: 'Pilih kategori di bawah untuk melihat detail + reward' })
                .setTimestamp();
            const selectMenu = new StringSelectMenuBuilder().setCustomId(`ach_detail_${targetUser.id}`).setPlaceholder('📂 Lihat detail per kategori...').addOptions(categories.map(cat => {
                const catIcon = { Social: '💬', Economy: '💰', Level: '📈', Streak: '🔥', Gambling: '🎰', Events: '🎮', Voice: '🎙️', Quest: '📜', Special: '✨', Fishing: '🎣' }[cat] || '📁';
                const catAchs = ACHIEVEMENTS.filter(a => a.category === cat);
                const catUnlocked = catAchs.filter(a => unlockedIds.includes(a.id)).length;
                return new StringSelectMenuOptionBuilder().setLabel(`${cat} (${catUnlocked}/${catAchs.length})`).setValue(cat).setDescription(`Lihat detail achievement ${cat}`);
            }));
            return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
        }

        if (command === 'profile') {
            const targetUser = interaction.options.getUser('user') || interaction.user, targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!targetMember) return interaction.reply({content: 'User tidak ditemukan.', ephemeral: true});
            const tData = getOrCreateUser(guildId, targetUser.id), targetXp = (tData.level + 1) * 100, percent = Math.min(100, Math.max(0, Math.floor((tData.xp / targetXp) * 100))), progressBar = '▰'.repeat(Math.floor(percent / 10)) + '▱'.repeat(10 - Math.floor(percent / 10)), roles = targetMember.roles.cache.filter(r => r.name !== '@everyone').sort((a, b) => b.position - a.position).map(r => `<@&${r.id}>`);
            let displayRoles = roles.length > 0 ? roles.slice(0, 10).join(' • ') : '*Tidak ada role*'; if (roles.length > 10) displayRoles += ` *+${roles.length - 10} lainnya*`;
            const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, targetUser.id), streakCount = sData ? sData.count : 0, streakEmoji = getSetting(guildId, 'streak_emoji', '🔥');
            const userAchs = db.prepare('SELECT * FROM achievements WHERE guildId = ? AND userId = ? ORDER BY unlockedAt DESC').all(guildId, targetUser.id);
            const totalBadges = db.prepare('SELECT COUNT(*) as cnt FROM achievements WHERE guildId = ? AND userId = ?').get(guildId, targetUser.id).cnt;
            let badgeDisplay = '';
            if (userAchs.length > 0) {
                badgeDisplay = userAchs.map(a => { const def = ACHIEVEMENTS.find(d => d.id === a.achievementId); return def ? `> ${def.emoji} **${def.name}** — *${def.desc}*` : ''; }).filter(Boolean).join('\n');
            } else {
                badgeDisplay = '> *Belum ada badge. Mulai beraktivitas!*';
            }
            const fishCaught = getUserStat(guildId, targetUser.id, 'total_fish_caught');
            const slotWins = getUserStat(guildId, targetUser.id, 'slot_wins');
            const cfWins = getUserStat(guildId, targetUser.id, 'coinflip_wins');

            const profileEmbed = new EmbedBuilder()
                .setAuthor({ name: `Kartu Profil | ${targetUser.username}`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
                .setColor('#2B2D31')
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
                .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
                .addFields(
                    { name: '📊 STATISTIK UTAMA', value: `> 🏅 **Level** \`${tData.level}\` — 💰 **Saldo** \`${tData.balance.toLocaleString('id-ID')}\` — ${streakEmoji} **Streak** \`${streakCount} Hari\`\n> \n> ✨ **Progress EXP**\n> \`${progressBar}\` **${percent}%** (\`${tData.xp.toLocaleString('id-ID')}/${targetXp.toLocaleString('id-ID')}\`)`, inline: false },
                    { name: `🏆 BADGE COLLECTION (${totalBadges}/${ACHIEVEMENTS.length})`, value: badgeDisplay, inline: false },
                    { name: '🎮 AKTIVITAS', value: `> 🎣 Ikan Ditangkap: **${fishCaught}** — 🎰 Slot Wins: **${slotWins}** — 🪙 Coinflip Wins: **${cfWins}**`, inline: false },
                    { name: '📅 INFO AKUN', value: `> 📥 Bergabung: <t:${Math.floor(targetMember.joinedTimestamp / 1000)}:D> — 📆 Dibuat: <t:${Math.floor(targetUser.createdTimestamp / 1000)}:D>`, inline: false },
                    { name: `🎭 Role [${roles.length}]`, value: displayRoles, inline: false }
                )
                .setFooter({ text: `ID: ${targetUser.id} | /achievement untuk detail badge`, iconURL: interaction.guild.iconURL() })
                .setTimestamp();
            return interaction.reply({ embeds: [profileEmbed] });
        }

        if (command === 'level') {
            if (subCmd === 'rank') { const target = interaction.options.getUser('user') || interaction.user, tData = getOrCreateUser(guildId, target.id), targetXp = (tData.level + 1) * 100, percent = Math.min(100, Math.max(0, Math.floor((tData.xp / targetXp) * 100))); const embed = new EmbedBuilder().setAuthor({ name: target.username, iconURL: target.displayAvatarURL({ dynamic: true }) }).setTitle('🌟 Statistik Level').setColor('#2B2D31').setThumbnail(target.displayAvatarURL({ dynamic: true, size: 512 })).addFields({ name: 'Level', value: `\`${tData.level}\``, inline: true }, { name: 'EXP', value: `\`${tData.xp.toLocaleString('id-ID')} / ${targetXp.toLocaleString('id-ID')}\``, inline: true }, { name: 'Progress', value: `${'▰'.repeat(Math.floor(percent / 10)) + '▱'.repeat(10 - Math.floor(percent / 10))} **${percent}%**`, inline: false }); return interaction.reply({ embeds: [embed] }); }
            if (subCmd === 'leaderboard') { const data = db.prepare('SELECT * FROM users WHERE guildId = ? ORDER BY level DESC, xp DESC LIMIT 10').all(guildId); const embed = new EmbedBuilder().setTitle('🏆 Level Leaderboard').setColor('#2B2D31'); let desc = data.length ? '' : 'Belum ada data.'; data.forEach((u, i) => desc += `**${i+1}.** <@${u.userId}> — Level **${u.level}** (${u.xp}/${(u.level + 1) * 100} XP)\n`); embed.setDescription(desc); return interaction.reply({ embeds: [embed] }); }
            if (group === 'setting') {
                if (!isAdmin) return interaction.reply({content: '❌ Hanya Admin!', ephemeral: true});
                if (subCmd === 'rolereward') { const action = interaction.options.getString('action'); if (action === 'add') { db.prepare('INSERT OR REPLACE INTO rewards (guildId, level, roleId, money) VALUES (?, ?, ?, ?)').run(guildId, interaction.options.getInteger('level'), interaction.options.getRole('role')?.id || null, interaction.options.getInteger('money') || 0); return interaction.reply(`✅ Diatur.`); } if (action === 'remove') { db.prepare('DELETE FROM rewards WHERE guildId = ? AND level = ?').run(guildId, interaction.options.getInteger('level')); return interaction.reply(`🗑️ Dihapus.`); } if (action === 'list') { const req = db.prepare('SELECT * FROM rewards WHERE guildId = ? ORDER BY level ASC').all(guildId); let msg = '🎁 **DAFTAR REWARD**\n'; req.forEach(r => msg += `Level ${r.level} ➔ Role: ${r.roleId ? `<@&${r.roleId}>` : '-'} | Money: ${r.money.toLocaleString('id-ID')}\n`); return interaction.reply({ content: msg || 'Kosong.', allowedMentions: { roles: [] } }); } }
                if (subCmd === 'xp') { const tipe = interaction.options.getString('tipe'), min = interaction.options.getInteger('min_xp'), max = interaction.options.getInteger('max_xp'), cd = interaction.options.getInteger('cooldown'); if (min > max) return interaction.reply({content: '❌ Min > Max!', ephemeral: true}); db.prepare('INSERT OR REPLACE INTO config (guildId, key, value) VALUES (?, ?, ?)').run(guildId, `${tipe}_min_xp`, min); db.prepare('INSERT OR REPLACE INTO config (guildId, key, value) VALUES (?, ?, ?)').run(guildId, `${tipe}_max_xp`, max); db.prepare('INSERT OR REPLACE INTO config (guildId, key, value) VALUES (?, ?, ?)').run(guildId, `${tipe}_cooldown`, cd); let extraMsg = ''; if (tipe === 'reaction') { const awardTo = interaction.options.getString('award_to') || 'both'; db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'reaction_award_to', awardTo); extraMsg = `\n> Award To: **${awardTo.toUpperCase()}**`; } return interaction.reply(`⚙️ **Diperbarui!**\n> XP: **${min} - ${max}**\n> CD: **${cd}**${extraMsg}`); }
            }
        }


        if (command === 'money') {
            if (subCmd === 'balance') return interaction.reply(`💰 Money: **${userData.balance.toLocaleString('id-ID')}**`);
            if (subCmd === 'daily') { const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); if (userData.lastDaily === today) return interaction.reply({ content: '⏳ Sudah klaim hari ini!', ephemeral: true }); userData.balance += 500; db.prepare('UPDATE users SET balance = ?, lastDaily = ? WHERE guildId = ? AND userId = ?').run(userData.balance, today, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'total_dailies'); await checkAchievements(interaction.guild, interaction.user.id, { type: 'daily' }); return interaction.reply('🎁 Kamu mendapatkan **500 money** dari klaim harian.'); }
            if (subCmd === 'leaderboard') { const data = db.prepare('SELECT * FROM users WHERE guildId = ? ORDER BY balance DESC LIMIT 10').all(guildId); const embed = new EmbedBuilder().setTitle('💰 Top Orang Terkaya 💰').setColor('#F1C40F'); let desc = data.length ? '' : 'Belum ada data.'; data.forEach((u, i) => desc += `**${i+1}.** <@${u.userId}> - **${u.balance.toLocaleString('id-ID')} money**\n`); embed.setDescription(desc); return interaction.reply({ embeds: [embed] }); }
            if (group === 'manage') {
                const isOwner = interaction.user.id === interaction.guild.ownerId;
                if (subCmd === 'add_admin' || subCmd === 'remove_admin' || subCmd === 'list_admin') {
                    if (!isOwner) return interaction.reply({content: '🛑 Owner Only', ephemeral: true});
                    if (subCmd === 'add_admin') { const tUser = interaction.options.getUser('user'), tRole = interaction.options.getRole('role'); if (tUser) db.prepare('INSERT OR REPLACE INTO economy_admins (guildId, adminId, type) VALUES (?, ?, ?)').run(guildId, tUser.id, 'user'); if (tRole) db.prepare('INSERT OR REPLACE INTO economy_admins (guildId, adminId, type) VALUES (?, ?, ?)').run(guildId, tRole.id, 'role'); return interaction.reply(`✅ Banker ditambah.`); }
                    if (subCmd === 'remove_admin') { const tUser = interaction.options.getUser('user'), tRole = interaction.options.getRole('role'); if (tUser) db.prepare('DELETE FROM economy_admins WHERE guildId = ? AND adminId = ? AND type = ?').run(guildId, tUser.id, 'user'); if (tRole) db.prepare('DELETE FROM economy_admins WHERE guildId = ? AND adminId = ? AND type = ?').run(guildId, tRole.id, 'role'); return interaction.reply(`🗑️ Banker dihapus.`); }
                    if (subCmd === 'list_admin') { const list = db.prepare('SELECT * FROM economy_admins WHERE guildId = ?').all(guildId); let txt = '🛡️ **DAFTAR BANKER:**\n'; list.forEach(adm => txt += `• ${adm.type}: <@${adm.type === 'role' ? '&' : ''}${adm.adminId}>\n`); return interaction.reply({content: txt, allowedMentions: {users: [], roles: []}}); }
                }
                if (subCmd === 'atur') { let authorized = isOwner; if (!authorized) { const admins = db.prepare('SELECT * FROM economy_admins WHERE guildId = ?').all(guildId); for (const admin of admins) { if (admin.type === 'user' && interaction.user.id === admin.adminId) { authorized = true; break; } if (admin.type === 'role' && interaction.member.roles.cache.has(admin.adminId)) { authorized = true; break; } } } if (!authorized) return interaction.reply({content: '🛑 Akses Ditolak', ephemeral: true}); const amt = interaction.options.getInteger('jumlah'), target = interaction.options.getUser('user'), action = interaction.options.getString('action'), tData = getOrCreateUser(guildId, target.id); if (action === 'add') tData.balance += amt; if (action === 'take') tData.balance = Math.max(0, tData.balance - amt); if (action === 'set') tData.balance = amt; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(tData.balance, guildId, target.id); return interaction.reply(`✅ Saldo <@${target.id}> = **${tData.balance.toLocaleString('id-ID')}**.`); }
            }
        }

        if (command === 'redeem') { const code = interaction.options.getString('kode').toUpperCase(); const voucher = db.prepare('SELECT * FROM vouchers WHERE guildId = ? AND code = ?').get(guildId, code); if (!voucher) return interaction.reply({ content: '❌ Kode tidak valid!', ephemeral: true }); if (voucher.current_uses >= voucher.max_uses) return interaction.reply({ content: '❌ Kuota habis!', ephemeral: true }); if (db.prepare('SELECT * FROM voucher_claims WHERE guildId = ? AND userId = ? AND code = ?').get(guildId, interaction.user.id, code)) return interaction.reply({ content: '❌ Sudah pernah ditukar!', ephemeral: true }); db.prepare('INSERT INTO voucher_claims (guildId, userId, code) VALUES (?, ?, ?)').run(guildId, interaction.user.id, code); db.prepare('UPDATE vouchers SET current_uses = current_uses + 1 WHERE guildId = ? AND code = ?').run(guildId, code); userData.balance += voucher.reward; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); await checkAchievements(interaction.guild, interaction.user.id, { type: 'redeem' }); return interaction.reply(`🎉 **BERHASIL!** Dapat **${voucher.reward.toLocaleString('id-ID')} money** gratis!`); }

        if (command === 'quest') { const questChannelSetting = getSetting(guildId, 'quest_channel', null); if (questChannelSetting && interaction.channelId !== questChannelSetting) return interaction.reply({ content: `❌ Buka misi hanya di <#${questChannelSetting}>.`, ephemeral: true }); updateQuestProgress(guildId, interaction.user.id, 'dummy', 0); const row = db.prepare('SELECT * FROM daily_quests WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id), quests = JSON.parse(row.data); const embed = new EmbedBuilder().setTitle('📜 Papan Misi Harian').setColor('#2B2D31').setDescription('Selesaikan misi berikut!\n*(Reset 00:00 WIB)*'); const buttons = new ActionRowBuilder(); quests.forEach((q, i) => { const percent = Math.min(100, Math.floor((q.progress / q.target) * 100)), bar = '▰'.repeat(Math.floor(percent / 10)) + '▱'.repeat(10 - Math.floor(percent / 10)), status = q.claimed ? '✅ **SELESAI**' : `**${q.progress} / ${q.target}**`; embed.addFields({ name: `Misi ${i+1}`, value: `${q.desc}\n> 🪙 **${q.reward} Money**\n> \`${bar}\` ${status}`, inline: false }); const btn = new ButtonBuilder().setCustomId(`claim_quest_${i}`).setLabel(`Klaim ${i+1}`).setStyle(ButtonStyle.Success); if (q.progress < q.target || q.claimed) btn.setDisabled(true); buttons.addComponents(btn); }); return interaction.reply({ embeds: [embed], components: [buttons] }); }

        if (command === 'coinflip') { if (activeCoinflips.has(interaction.user.id)) return interaction.reply({ content: '⏳ Tunggu koinmu mendarat!', ephemeral: true }); const taruhan = interaction.options.getInteger('taruhan'); if (userData.balance < taruhan) return interaction.reply({ content: `❌ Saldo kurang! 🪙 **${userData.balance.toLocaleString('id-ID')}**`, ephemeral: true }); activeCoinflips.add(interaction.user.id); userData.balance -= taruhan; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'total_coinflips'); await interaction.reply({ embeds: [new EmbedBuilder().setColor('#F1C40F').setDescription(`🪙 **Melempar koin...**\n> Taruhan: 🪙 **${taruhan.toLocaleString('id-ID')}**`)] }); setTimeout(async () => { activeCoinflips.delete(interaction.user.id); let freshData = getOrCreateUser(guildId, interaction.user.id); if (Math.random() < 0.5) { freshData.balance += (taruhan * 2); db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(freshData.balance, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'coinflip_wins'); await checkAchievements(interaction.guild, interaction.user.id, { type: 'coinflip' }); interaction.editReply({ embeds: [new EmbedBuilder().setColor('#2ECC71').setTitle('🎉 MENANG!').setDescription(`Dapat 🪙 **${taruhan.toLocaleString('id-ID')}**\n> Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**`)] }).catch(()=>{}); } else { await checkAchievements(interaction.guild, interaction.user.id, { type: 'coinflip' }); interaction.editReply({ embeds: [new EmbedBuilder().setColor('#E74C3C').setTitle('💀 KALAH!').setDescription(`Hilang 🪙 **${taruhan.toLocaleString('id-ID')}**\n> Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**`)] }).catch(()=>{}); } }, 7000); return; }

        // ================= SLOT MACHINE =================
        if (command === 'slot') {
            const slotCdKey = `slot_${guildId}_${interaction.user.id}`;
            if (fishCooldowns.has(slotCdKey) && Date.now() < fishCooldowns.get(slotCdKey)) { const remaining = Math.ceil((fishCooldowns.get(slotCdKey) - Date.now()) / 1000); return interaction.reply({ content: `⏳ Mesin slot masih panas! Tunggu **${remaining} detik**.`, ephemeral: true }); }
            fishCooldowns.set(slotCdKey, Date.now() + 7000);
            const bet = interaction.options.getInteger('taruhan');
            if (userData.balance < bet) return interaction.reply({ content: `❌ Saldo kurang! Kamu punya 🪙 **${userData.balance.toLocaleString('id-ID')}**`, ephemeral: true });
            userData.balance -= bet;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
            incrementUserStat(guildId, interaction.user.id, 'total_slot_spins');
            const reels = spinSlot();
            const result = getSlotResult(reels, bet);
            const slotDisplay = `> 🎰 **Slot Machine**\n>\n> ┌─────────────────┐\n> │  ${reels[0].emoji}  ┃  ${reels[1].emoji}  ┃  ${reels[2].emoji}  │\n> └─────────────────┘`;
            let embed;
            if (result.jackpot && reels[0].id === 'seven') {
                embed = new EmbedBuilder().setColor('#FFD700').setTitle('🎰💰 MEGA JACKPOT!!! 💰🎰').setDescription(`${slotDisplay}\n\n> ${result.desc}\n\n> Taruhan: 🪙 ${bet.toLocaleString('id-ID')}\n> Menang: 🪙 **+${result.payout.toLocaleString('id-ID')}** 🎉🎉🎉`);
                incrementUserStat(guildId, interaction.user.id, 'slot_jackpot_7_count');
            } else if (result.jackpot) {
                embed = new EmbedBuilder().setColor('#FF6B00').setTitle('🎰✨ JACKPOT! ✨🎰').setDescription(`${slotDisplay}\n\n> ${result.desc}\n\n> Taruhan: 🪙 ${bet.toLocaleString('id-ID')}\n> Menang: 🪙 **+${result.payout.toLocaleString('id-ID')}** 🎉`);
            } else if (result.win) {
                embed = new EmbedBuilder().setColor('#2ECC71').setTitle('🎰 MENANG!').setDescription(`${slotDisplay}\n\n> ${result.desc}\n\n> Taruhan: 🪙 ${bet.toLocaleString('id-ID')}\n> Menang: 🪙 **+${result.payout.toLocaleString('id-ID')}**`);
            } else {
                embed = new EmbedBuilder().setColor('#E74C3C').setTitle('🎰 Slot Machine').setDescription(`${slotDisplay}\n\n> 😔 Tidak ada yang cocok...\n\n> Taruhan: 🪙 ${bet.toLocaleString('id-ID')}\n> Kalah: 🪙 **-${bet.toLocaleString('id-ID')}**`);
            }
            if (result.win) {
                userData.balance += result.payout;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                incrementUserStat(guildId, interaction.user.id, 'slot_wins');
                incrementUserStat(guildId, interaction.user.id, 'slot_total_winnings', result.payout);
                await checkAchievements(interaction.guild, interaction.user.id, { type: 'slot', jackpot: result.jackpot, jackpot7: result.jackpot && reels[0].id === 'seven' });
            }
            embed.setFooter({ text: `Saldo: ${userData.balance.toLocaleString('id-ID')} money` });
            return interaction.reply({ embeds: [embed] });
        }

        // ================= GIFT / TRANSFER =================
        if (command === 'gift') {
            const giftCdKey = `gift_${guildId}_${interaction.user.id}`;
            if (fishCooldowns.has(giftCdKey) && Date.now() < fishCooldowns.get(giftCdKey)) { const remaining = Math.ceil((fishCooldowns.get(giftCdKey) - Date.now()) / 1000); return interaction.reply({ content: `⏳ Tunggu **${remaining} detik** sebelum kirim gift lagi.`, ephemeral: true }); }
            fishCooldowns.set(giftCdKey, Date.now() + 10000);
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('jumlah');
            if (targetUser.id === interaction.user.id) return interaction.reply({ content: '❌ Tidak bisa kirim ke diri sendiri!', ephemeral: true });
            if (targetUser.bot) return interaction.reply({ content: '❌ Tidak bisa kirim ke bot!', ephemeral: true });
            if (userData.balance < amount) return interaction.reply({ content: `❌ Saldo kurang! Kamu punya 🪙 **${userData.balance.toLocaleString('id-ID')}**`, ephemeral: true });
            // Cek limit harian penerima
            const receivedToday = getGiftReceivedToday(guildId, targetUser.id);
            if (receivedToday + amount > GIFT_RECEIVE_LIMIT_PER_DAY) return interaction.reply({ content: `❌ <@${targetUser.id}> sudah mencapai batas terima harian (🪙 ${GIFT_RECEIVE_LIMIT_PER_DAY.toLocaleString('id-ID')}/hari). Sisa kuota: 🪙 ${(GIFT_RECEIVE_LIMIT_PER_DAY - receivedToday).toLocaleString('id-ID')}`, ephemeral: true });
            // Cek tax-free voucher (stat 'tax_free_voucher' > 0)
            const hasTaxFree = getUserStat(guildId, interaction.user.id, 'tax_free_voucher') > 0;
            const taxAmount = hasTaxFree ? 0 : Math.floor(amount * GIFT_TAX_RATE);
            const netAmount = amount - taxAmount;
            if (hasTaxFree) incrementUserStat(guildId, interaction.user.id, 'tax_free_voucher', -1);
            // Transfer
            userData.balance -= amount;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
            const targetData = getOrCreateUser(guildId, targetUser.id);
            targetData.balance += netAmount;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(targetData.balance, guildId, targetUser.id);
            addGiftReceivedToday(guildId, targetUser.id, netAmount);
            incrementUserStat(guildId, interaction.user.id, 'total_gifts_sent');
            incrementUserStat(guildId, interaction.user.id, 'total_gift_amount', amount);
            await checkAchievements(interaction.guild, interaction.user.id, { type: 'gift_send' });
            await checkAchievements(interaction.guild, targetUser.id, { type: 'gift_receive' });
            const embed = new EmbedBuilder().setColor('#FF69B4').setTitle('🎁 Gift Terkirim!')
                .setDescription(`<@${interaction.user.id}> ➜ <@${targetUser.id}>\n\n> 💰 **Jumlah:** 🪙 ${amount.toLocaleString('id-ID')}\n> 📊 **Pajak (${hasTaxFree ? 'FREE!' : '10%'}):** 🪙 ${taxAmount.toLocaleString('id-ID')}${hasTaxFree ? ' *(Tax-Free Voucher)*' : ''}\n> ✅ **Diterima:** 🪙 ${netAmount.toLocaleString('id-ID')}`)
                .setFooter({ text: `Saldo pengirim: ${userData.balance.toLocaleString('id-ID')} | Limit harian: ${(receivedToday + netAmount).toLocaleString('id-ID')}/${GIFT_RECEIVE_LIMIT_PER_DAY.toLocaleString('id-ID')}` })
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        // ================= FISHING COMMANDS =================
        if (command === 'fish') {
            const cdKey = `fish_${guildId}_${interaction.user.id}`;
            const eq = getEquipment(guildId, interaction.user.id);
            const rod = ROD_TYPES.find(r => r.id === eq.rod) || ROD_TYPES[0];
            if (fishCooldowns.has(cdKey) && Date.now() < fishCooldowns.get(cdKey)) { const remaining = Math.ceil((fishCooldowns.get(cdKey) - Date.now()) / 1000); return interaction.reply({ content: `⏳ Pancingmu masih basah! Tunggu **${remaining} detik** lagi.`, ephemeral: true }); }
            fishCooldowns.set(cdKey, Date.now() + rod.cooldown * 1000);
            const result = catchFish(guildId, interaction.user.id);
            incrementUserStat(guildId, interaction.user.id, 'total_fish_caught');
            const tierColors = { 'Trash': '#808080', 'Common': '#FFFFFF', 'Uncommon': '#2ECC71', 'Rare': '#3498DB', 'Epic': '#9B59B6', 'Legendary': '#F1C40F', 'Mythic': '#FF6B6B', 'Secret': '#8B00FF' };
            const embed = new EmbedBuilder()
                .setColor(tierColors[result.tier.tier] || '#2B2D31')
                .setTitle(`🎣 ${result.tier.tier === 'Trash' ? 'Kamu menangkap sampah...' : 'IKAN TERTANGKAP!'}`)
                .setDescription(`${result.tier.emoji} **${result.fish.name}**\n\n> 📊 **Tier:** ${result.tier.tier}\n> ⚖️ **Berat:** ${result.weight.toLocaleString('id-ID')} kg\n> 💰 **Nilai Jual:** 🪙 ${result.value.toLocaleString('id-ID')}\n\n> 🎋 Joran: **${rod.name}**\n> 🪱 Umpan: **${(BAIT_TYPES.find(b => b.id === eq.bait) || BAIT_TYPES[0]).name}** ${eq.bait !== 'none' ? `(${eq.bait_count > 0 ? eq.bait_count - 1 : 0} sisa)` : ''}`)
                .setFooter({ text: `Cooldown: ${rod.cooldown}s | /sell untuk jual | /fishing inventory` });
            if (result.tier.tier === 'Secret') embed.setTitle('🔮💫 SECRET CATCH!!! 💫🔮');
            else if (result.tier.tier === 'Mythic') embed.setTitle('🌈✨ MYTHIC CATCH!! ✨🌈');
            else if (result.tier.tier === 'Legendary') embed.setTitle('🐉⚡ LEGENDARY CATCH! ⚡🐉');
            await interaction.reply({ embeds: [embed] });
            await checkAchievements(interaction.guild, interaction.user.id, { type: 'fishing', tier: result.tier.tier, weight: result.weight });
            // --- FISHING TOURNAMENT PARTICIPATION ---
            if (activeFishEvents.has(guildId)) {
                const ev = activeFishEvents.get(guildId);
                if (!ev.participants[interaction.user.id]) ev.participants[interaction.user.id] = { count: 0, heaviest: 0 };
                ev.participants[interaction.user.id].count++;
                if (result.weight > ev.participants[interaction.user.id].heaviest) ev.participants[interaction.user.id].heaviest = result.weight;
                
                // Instant-win events
                let tournamentWin = false;
                if (ev.type === 'first_legendary' && ['Legendary', 'Mythic', 'Secret'].includes(result.tier.tier)) tournamentWin = true;
                if (ev.type === 'first_rare' && ['Rare', 'Epic', 'Legendary', 'Mythic', 'Secret'].includes(result.tier.tier)) tournamentWin = true;
                if (ev.type === 'first_trash' && result.tier.tier === 'Trash') tournamentWin = true;
                
                if (tournamentWin) {
                    activeFishEvents.delete(guildId);
                    userData.balance += ev.reward;
                    db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                    const ch = interaction.guild.channels.cache.get(ev.channelId);
                    if (ch) ch.send({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('🏆 TOURNAMENT WINNER!').setDescription(`<@${interaction.user.id}> memenangkan tournament!\n> Tangkapan: ${result.tier.emoji} **${result.fish.name}** (${result.weight} kg)\n\n🎁 Hadiah: 🪙 **${ev.reward.toLocaleString('id-ID')} Money**`)] });
                }
            }
            return;
        }

        if (command === 'sell') {
            return interaction.reply({ content: '❌ Command `/sell` sudah dihapus! Gunakan `/fishing sell` untuk menjual ikan.', ephemeral: true });
        }

        if (command === 'inventory') {
            const items = db.prepare('SELECT * FROM item_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, interaction.user.id);
            if (items.length === 0) return interaction.reply({ content: '🎒 Inventory kosong! Beli item di `/shop` kategori Items.', ephemeral: true });
            let desc = '';
            for (const inv of items) {
                const def = ITEMS.find(i => i.id === inv.itemId);
                if (def) desc += `${def.emoji} **${def.name}** x${inv.quantity}\n> *${def.desc}*\n\n`;
            }
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎒 Item Inventory').setColor('#2B2D31').setDescription(desc).setFooter({ text: '/use <item> untuk memakai item' })] });
        }

        if (command === 'use') {
            const useCdKey = `use_${guildId}_${interaction.user.id}`;
            if (fishCooldowns.has(useCdKey) && Date.now() < fishCooldowns.get(useCdKey)) { return interaction.reply({ content: '⏳ Tunggu sebentar sebelum menggunakan item lagi.', ephemeral: true }); }
            fishCooldowns.set(useCdKey, Date.now() + 3000);

            const itemId = interaction.options.getString('item');
            const itemDef = ITEMS.find(i => i.id === itemId);
            if (!itemDef) return interaction.reply({ content: '❌ Item tidak ditemukan!', ephemeral: true });
            if (getItemCount(guildId, interaction.user.id, itemId) <= 0) return interaction.reply({ content: '❌ Kamu tidak punya item ini! Beli di `/shop`.', ephemeral: true });
            
            if (itemId === 'mystery_box') {
                const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
                const usedToday = getUserStat(guildId, interaction.user.id, `mbox_${today}`);
                if (usedToday >= 5) return interaction.reply({ content: '❌ Kamu sudah membuka 5 Mystery Box hari ini! Tunggu besok.', ephemeral: true });
                removeItem(guildId, interaction.user.id, itemId);
                incrementUserStat(guildId, interaction.user.id, `mbox_${today}`);
                let reward;
                const roll = Math.random();
                if (roll < 0.50) reward = getRandomInt(50, 200);
                else if (roll < 0.80) reward = getRandomInt(200, 500);
                else if (roll < 0.95) reward = getRandomInt(500, 1000);
                else reward = getRandomInt(1000, 2000);
                userData.balance += reward;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#9B59B6').setTitle('📦 Mystery Box Dibuka!').setDescription(`Kamu mendapatkan 🪙 **${reward.toLocaleString('id-ID')} Money**!\n\n> Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**`)] });
            }
            if (itemId === 'daily_doubler') {
                removeItem(guildId, interaction.user.id, itemId);
                incrementUserStat(guildId, interaction.user.id, 'daily_doubler_active', 1);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **${itemDef.name}** diaktifkan! /money daily berikutnya akan x2.`, ephemeral: false });
            }
            if (itemId === 'lucky_spin_token') {
                removeItem(guildId, interaction.user.id, itemId);
                incrementUserStat(guildId, interaction.user.id, 'lucky_spin_active', 1);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **${itemDef.name}** diaktifkan! Slot berikutnya dijamin 2 simbol sama.`, ephemeral: false });
            }
            if (itemId === 'xp_booster_2x') {
                removeItem(guildId, interaction.user.id, itemId);
                const expiry = Date.now() + 3600000; // 1 hour
                db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, interaction.user.id, 'xp_boost_2x_until', expiry);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **XP Booster 2x** aktif selama **1 jam**! Semua XP yang kamu dapat akan x2.`, ephemeral: false });
            }
            if (itemId === 'xp_booster_3x') {
                removeItem(guildId, interaction.user.id, itemId);
                const expiry = Date.now() + 3600000; // 1 hour
                db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, interaction.user.id, 'xp_boost_3x_until', expiry);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **XP Booster 3x** aktif selama **1 jam**! Semua XP yang kamu dapat akan x3.`, ephemeral: false });
            }
            if (itemId === 'streak_shield') {
                removeItem(guildId, interaction.user.id, itemId);
                incrementUserStat(guildId, interaction.user.id, 'streak_shield_count', 1);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **Streak Shield** diaktifkan! Jika kamu lupa chat 1 hari, streak akan otomatis terlindungi.`, ephemeral: false });
            }
            if (itemId === 'lucky_charm') {
                removeItem(guildId, interaction.user.id, itemId);
                const expiry = Date.now() + 3600000; // 1 hour
                db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, interaction.user.id, 'lucky_charm_until', expiry);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **Lucky Charm** aktif selama **1 jam**! +15% chance menang di semua game.`, ephemeral: false });
            }
            if (itemId === 'money_magnet') {
                removeItem(guildId, interaction.user.id, itemId);
                const expiry = Date.now() + 3600000; // 1 hour
                db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, interaction.user.id, 'money_magnet_until', expiry);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **Money Magnet** aktif selama **1 jam**! +50% money dari semua sumber.`, ephemeral: false });
            }
            if (itemId === 'tax_free_voucher') {
                removeItem(guildId, interaction.user.id, itemId);
                incrementUserStat(guildId, interaction.user.id, 'tax_free_voucher', 1);
                return interaction.reply({ content: `✅ ${itemDef.emoji} **Tax-Free Voucher** diaktifkan! Gift berikutnya tanpa pajak 10%.`, ephemeral: false });
            }
            return interaction.reply({ content: '❌ Item tidak bisa digunakan langsung.', ephemeral: true });
        }

        if (command === 'fishing') {
            if (subCmd === 'inventory') {
                const tierOrder = { 'Secret': 0, 'Mythic': 1, 'Legendary': 2, 'Epic': 3, 'Rare': 4, 'Uncommon': 5, 'Common': 6, 'Trash': 7 };
                const allInventory = db.prepare('SELECT * FROM fish_inventory WHERE guildId = ? AND userId = ?').all(guildId, interaction.user.id);
                const totalCount = allInventory.length;
                const lockedCount = allInventory.filter(i => i.locked === 1).length;
                if (totalCount === 0) return interaction.reply({ content: '🎒 Inventory kosong! Gunakan `/fish` untuk memancing.', ephemeral: true });
                
                const sorted = allInventory.sort((a, b) => {
                    const fishA = FISH_DATA.find(f => f.id === a.fishId);
                    const fishB = FISH_DATA.find(f => f.id === b.fishId);
                    const tierA = fishA ? (tierOrder[fishA.tier] ?? 99) : 99;
                    const tierB = fishB ? (tierOrder[fishB.tier] ?? 99) : 99;
                    if (tierA !== tierB) return tierA - tierB;
                    return b.weight - a.weight;
                });
                
                const page = interaction.options.getInteger('page') || 1;
                const perPage = 20;
                const totalPages = Math.ceil(totalCount / perPage);
                const currentPage = Math.min(Math.max(1, page), totalPages);
                const start = (currentPage - 1) * perPage;
                const pageItems = sorted.slice(start, start + perPage);
                
                let desc = `🎒 **Total: ${totalCount} ikan** (🔒 Locked: ${lockedCount})\n\n`;
                pageItems.forEach((item) => {
                    const fd = FISH_DATA.find(f => f.id === item.fishId);
                    const tier = fd ? FISH_TIERS.find(t => t.tier === fd.tier) : null;
                    const lockIcon = item.locked ? '🔒 ' : '';
                    const tierTag = fd ? `**(${fd.tier})**` : '';
                    desc += `**ID #${item.id}** ${lockIcon}${tier ? tier.emoji : '🐟'} **${fd ? fd.name : '?'}** — ${item.weight} kg ${tierTag}\n`;
                });
                desc += `\n━━━━━━━━━━━━━━━━━━━━━━\n> 📄 Halaman **${currentPage}** / **${totalPages}**`;
                
                const navRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`finv_prev_${currentPage}`).setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(currentPage <= 1),
                    new ButtonBuilder().setCustomId(`finv_next_${currentPage}`).setLabel('▶ Next').setStyle(ButtonStyle.Secondary).setDisabled(currentPage >= totalPages)
                );
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎣 Fishing Inventory').setColor('#2B2D31').setDescription(desc)], components: [navRow] });
            }
            if (subCmd === 'equip') {
                const eq = getEquipment(guildId, interaction.user.id);
                const rod = ROD_TYPES.find(r => r.id === eq.rod) || ROD_TYPES[0];
                const bait = BAIT_TYPES.find(b => b.id === eq.bait) || BAIT_TYPES[0];
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚙️ Perlengkapan Mancing').setColor('#2B2D31').setDescription(`> 🎋 **Joran:** ${rod.emoji} ${rod.name}\n> ⏱️ Cooldown: ${rod.cooldown}s | Rare+: +${rod.rareBonus}%\n\n> 🪱 **Umpan:** ${bait.emoji} ${bait.name}\n> Sisa: **${eq.bait !== 'none' ? eq.bait_count : 0}** | Rare+: +${bait.rareBonus}%`)] });
            }
            if (subCmd === 'stats') {
                const totalCaught = getUserStat(guildId, interaction.user.id, 'total_fish_caught');
                const totalSoldValue = getUserStat(guildId, interaction.user.id, 'total_fish_sold_value');
                const totalSoldCount = getUserStat(guildId, interaction.user.id, 'total_fish_sold_count');
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📊 Statistik Memancing').setColor('#2B2D31').setDescription(`> 🎣 **Total Tangkapan:** ${totalCaught}\n> 💰 **Total Penjualan:** 🪙 ${totalSoldValue.toLocaleString('id-ID')}\n> 📦 **Ikan Dijual:** ${totalSoldCount}\n> 🐟 **Di Inventory:** ${db.prepare('SELECT COUNT(*) as c FROM fish_inventory WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id).c}`)] });
            }
            if (subCmd === 'shop') {
                let desc = '**🎋 JORAN (Beli Sekali, Pakai Selamanya)**\n\n';
                const eq = getEquipment(guildId, interaction.user.id);
                ROD_TYPES.forEach(r => { const owned = eq.rod === r.id || r.id === 'basic'; desc += `${r.emoji} **${r.name}** ${owned ? '✅ *(Dimiliki)*' : `— 🪙 ${r.price.toLocaleString('id-ID')}`}\n> CD: ${r.cooldown}s | Rare+: +${r.rareBonus}%\n\n`; });
                desc += '━━━━━━━━━━━━━━━━━━━━━━\n\n**🪱 UMPAN (Habis Pakai, per 10 buah)**\n\n';
                BAIT_TYPES.filter(b => b.id !== 'none').forEach(b => { desc += `${b.emoji} **${b.name}** — 🪙 ${(b.price * 10).toLocaleString('id-ID')} /10pcs\n> Rare+: +${b.rareBonus}%\n\n`; });
                const componentsShop = [];
                const availableRods = ROD_TYPES.filter(r => r.id !== 'basic' && r.id !== eq.rod);
                if (availableRods.length > 0) {
                    const rodMenu = new StringSelectMenuBuilder().setCustomId('fishing_buy_rod').setPlaceholder('🎋 Beli Joran...').addOptions(
                        ...availableRods.map(r => new StringSelectMenuOptionBuilder().setLabel(`${r.name} (🪙 ${r.price.toLocaleString('id-ID')})`).setValue(`rod_${r.id}`).setEmoji(r.emoji).setDescription(`CD: ${r.cooldown}s | Rare+${r.rareBonus}%`))
                    );
                    componentsShop.push(new ActionRowBuilder().addComponents(rodMenu));
                }
                const baitMenu = new StringSelectMenuBuilder().setCustomId('fishing_buy_bait').setPlaceholder('🪱 Beli Umpan (x10)...').addOptions(
                    ...BAIT_TYPES.filter(b => b.id !== 'none').map(b => new StringSelectMenuOptionBuilder().setLabel(`${b.name} x10 (🪙 ${(b.price * 10).toLocaleString('id-ID')})`).setValue(`bait_${b.id}`).setEmoji(b.emoji).setDescription(`Rare+${b.rareBonus}%`))
                );
                componentsShop.push(new ActionRowBuilder().addComponents(baitMenu));
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎣 Fishing Shop').setColor('#2B2D31').setDescription(desc).setFooter({ text: `Saldo: ${userData.balance.toLocaleString('id-ID')} money` })], components: componentsShop });
            }
            if (subCmd === 'sell') {
                const sellCdKey = `sell_${guildId}_${interaction.user.id}`;
                if (fishCooldowns.has(sellCdKey) && Date.now() < fishCooldowns.get(sellCdKey)) { return interaction.reply({ content: `⏳ Tunggu sebentar sebelum menjual lagi.`, ephemeral: true }); }
                fishCooldowns.set(sellCdKey, Date.now() + 10000);
                const inventory = db.prepare('SELECT * FROM fish_inventory WHERE guildId = ? AND userId = ? AND locked = 0').all(guildId, interaction.user.id);
                if (inventory.length === 0) return interaction.reply({ content: '❌ Tidak ada ikan yang bisa dijual! (Ikan yang di-lock tidak terjual)', ephemeral: true });
                let totalValue = 0, countByTier = {};
                for (const item of inventory) {
                    const fishDef = FISH_DATA.find(f => f.id === item.fishId);
                    const tierDef = fishDef ? FISH_TIERS.find(t => t.tier === fishDef.tier) : FISH_TIERS[0];
                    const weightRatio = tierDef ? (item.weight - tierDef.minWeight) / (tierDef.maxWeight - tierDef.minWeight) : 0;
                    const value = tierDef ? Math.floor(tierDef.minValue + Math.min(1, Math.max(0, weightRatio)) * (tierDef.maxValue - tierDef.minValue)) : 1;
                    totalValue += value;
                    const tier = fishDef ? fishDef.tier : 'Trash';
                    countByTier[tier] = (countByTier[tier] || 0) + 1;
                }
                const freshData = getOrCreateUser(guildId, interaction.user.id);
                freshData.balance += totalValue;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(freshData.balance, guildId, interaction.user.id);
                db.prepare('DELETE FROM fish_inventory WHERE guildId = ? AND userId = ? AND locked = 0').run(guildId, interaction.user.id);
                incrementUserStat(guildId, interaction.user.id, 'total_fish_sold_value', totalValue);
                incrementUserStat(guildId, interaction.user.id, 'total_fish_sold_count', inventory.length);
                const lockedCount = db.prepare('SELECT COUNT(*) as c FROM fish_inventory WHERE guildId = ? AND userId = ? AND locked = 1').get(guildId, interaction.user.id).c;
                let breakdown = Object.entries(countByTier).map(([t, c]) => `> ${(FISH_TIERS.find(ft => ft.tier === t) || {emoji:'🐟'}).emoji} ${t}: **${c}**`).join('\n');
                const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('💰 IKAN TERJUAL!')
                    .setDescription(`Kamu menjual **${inventory.length} ikan** dan mendapatkan:\n\n🪙 **${totalValue.toLocaleString('id-ID')} Money**\n\n${breakdown}\n\n> 💳 Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**${lockedCount > 0 ? `\n> 🔒 Ikan di-lock (tidak dijual): **${lockedCount}**` : ''}`);
                await interaction.reply({ embeds: [embed] });
                await checkAchievements(interaction.guild, interaction.user.id, { type: 'fish_sell' });
                return;
            }
            if (subCmd === 'collection') {
                const collected = db.prepare('SELECT * FROM fish_collection WHERE guildId = ? AND userId = ?').all(guildId, interaction.user.id);
                const collectedIds = collected.map(c => c.fishId);
                const totalFish = FISH_DATA.length;
                const totalCollected = collectedIds.length;
                const percentDex = Math.floor((totalCollected / totalFish) * 100);
                const tiers = [...new Set(FISH_DATA.map(f => f.tier))];
                let desc = `📖 **Fish Collection / Pokedex**\n> 🐟 **${totalCollected}** / ${totalFish} spesies ditemukan (${percentDex}%)\n\n`;
                for (const tier of tiers) {
                    const tierFish = FISH_DATA.filter(f => f.tier === tier);
                    const tierEmoji = (FISH_TIERS.find(t => t.tier === tier) || {emoji:'🐟'}).emoji;
                    const tierCollected = tierFish.filter(f => collectedIds.includes(f.id)).length;
                    desc += `${tierEmoji} **${tier}** (${tierCollected}/${tierFish.length})\n`;
                    tierFish.forEach(f => {
                        if (collectedIds.includes(f.id)) {
                            desc += `> ${f.emoji} ${f.name}\n`;
                        } else {
                            desc += `> ▪️ ???\n`;
                        }
                    });
                    desc += '\n';
                }
                // Discord embed has 4096 char limit - if too long, truncate
                if (desc.length > 4000) desc = desc.substring(0, 3990) + '\n\n*...dan lainnya*';
                desc += `\n> *Tangkap semua spesies untuk melengkapi koleksi!*`;
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📖 Fish Collection').setColor('#3498DB').setDescription(desc).setFooter({ text: `/fish untuk memancing | ${totalCollected}/${totalFish} ditemukan` })] });
            }
            if (subCmd === 'lock') {
                const fishDbId = interaction.options.getInteger('id');
                const item = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(fishDbId, guildId, interaction.user.id);
                if (!item) return interaction.reply({ content: '❌ Ikan tidak ditemukan! Cek ID di `/fishing inventory`.', ephemeral: true });
                if (item.locked === 1) return interaction.reply({ content: '❌ Ikan ini sudah di-lock!', ephemeral: true });
                db.prepare('UPDATE fish_inventory SET locked = 1 WHERE id = ?').run(fishDbId);
                const fishDef = FISH_DATA.find(f => f.id === item.fishId);
                return interaction.reply({ content: `🔒 **${fishDef ? fishDef.name : 'Ikan'}** (${item.weight} kg) berhasil di-lock! Ikan ini tidak akan terjual saat /fishing sell.` });
            }
            if (subCmd === 'unlock') {
                const fishDbId = interaction.options.getInteger('id');
                const item = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(fishDbId, guildId, interaction.user.id);
                if (!item) return interaction.reply({ content: '❌ Ikan tidak ditemukan!', ephemeral: true });
                if (item.locked === 0) return interaction.reply({ content: '❌ Ikan ini tidak di-lock!', ephemeral: true });
                db.prepare('UPDATE fish_inventory SET locked = 0 WHERE id = ?').run(fishDbId);
                const fishDef = FISH_DATA.find(f => f.id === item.fishId);
                return interaction.reply({ content: `🔓 **${fishDef ? fishDef.name : 'Ikan'}** berhasil di-unlock.` });
            }
        }

        if (command === 'admin_shop') { if (!isAdmin) return interaction.reply({content: '❌ Admin Only', ephemeral: true}); if (subCmd === 'add_item') { const nama = interaction.options.getString('nama'), harga = interaction.options.getInteger('harga'), isi = interaction.options.getString('isi').replace(/\\n/g, '\n'), jumlah = interaction.options.getInteger('jumlah') || 1; const stmt = db.prepare('INSERT INTO shop_items (guildId, name, price, content) VALUES (?, ?, ?, ?)'); for (let i = 0; i < jumlah; i++) stmt.run(guildId, nama, harga, isi); return interaction.reply(`✅ **${jumlah} stok** barang **${nama}** ditambah.`); } if (subCmd === 'add_role') { db.prepare('INSERT OR REPLACE INTO shop_roles (guildId, roleId, price) VALUES (?, ?, ?)').run(guildId, interaction.options.getRole('role').id, interaction.options.getInteger('harga')); return interaction.reply(`✅ Role ditambah.`); } if (subCmd === 'set_custom_role') { const harga = interaction.options.getInteger('harga'); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'custom_role_price', harga.toString()); if (harga <= 0) return interaction.reply('🛑 Custom Role dimatikan.'); return interaction.reply(`✅ Harga Custom Role: 🪙 **${harga.toLocaleString('id-ID')}**.`); } if (subCmd === 'voucher_add') { const code = interaction.options.getString('kode').toUpperCase(), reward = interaction.options.getInteger('reward'), limit = interaction.options.getInteger('limit'); db.prepare('INSERT OR REPLACE INTO vouchers (guildId, code, reward, max_uses, current_uses) VALUES (?, ?, ?, ?, 0)').run(guildId, code, reward, limit); return interaction.reply(`🎟️ Voucher \`${code}\` dibuat!`); } if (subCmd === 'set_testimoni') { db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'testimoni_channel', interaction.options.getChannel('channel').id); return interaction.reply(`✅ Testimoni diatur!`); } if (subCmd === 'history') { const logs = db.prepare('SELECT * FROM logs WHERE guildId = ? ORDER BY time DESC LIMIT ?').all(guildId, Math.min(interaction.options.getInteger('jumlah') || 10, 50)); if (logs.length === 0) return interaction.reply('Kosong.'); let logTxt = '📜 **RIWAYAT TRANSAKSI**\n\n'; logs.forEach(l => { logTxt += `\`[${new Date(l.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' })}]\` <@${l.userId}> beli **${l.item}** (🪙 ${l.price.toLocaleString('id-ID')})\n`; }); return interaction.reply({ embeds: [new EmbedBuilder().setDescription(logTxt).setColor('#2B2D31')], allowedMentions: {users: []} }); } }

        if (command === 'shop') {
            const roles = db.prepare('SELECT * FROM shop_roles WHERE guildId = ?').all(guildId);
            const items = db.prepare('SELECT name, price, COUNT(*) as stock FROM shop_items WHERE guildId = ? GROUP BY name, price').all(guildId);
            const crPrice = parseInt(getSetting(guildId, 'custom_role_price', '0'));
            if (roles.length === 0 && items.length === 0 && crPrice <= 0 && ITEMS.length === 0) return interaction.reply({ content: 'Toko kosong!', ephemeral: true });
            
            let shopDesc = '';
            const componentsRows = [];

            // ROLE section
            if (roles.length > 0) {
                shopDesc += '🎭 **ROLE EKSKLUSIF**\n';
                roles.forEach((r, idx) => { const roleObj = interaction.guild.roles.cache.get(r.roleId); shopDesc += `> ${roleObj ? roleObj.name : '?'} — 🪙 **${r.price.toLocaleString('id-ID')}**\n`; });
                shopDesc += '\n';
                const roleMenu = new StringSelectMenuBuilder().setCustomId('shop_buy_role').setPlaceholder('🎭 Beli Role Eksklusif...').setMinValues(1).setMaxValues(1);
                roles.forEach((r, idx) => { const roleObj = interaction.guild.roles.cache.get(r.roleId); roleMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${roleObj ? roleObj.name : '?'}`).setDescription(`🪙 ${r.price.toLocaleString('id-ID')}`).setValue(`role_${r.roleId}`)); });
                componentsRows.push(new ActionRowBuilder().addComponents(roleMenu));
            }

            // CUSTOM ROLE section
            if (crPrice > 0) {
                shopDesc += '🎨 **CUSTOM ROLE**\n> Buat role sendiri (nama + warna) — 🪙 **' + crPrice.toLocaleString('id-ID') + '**\n\n';
                const crMenu = new StringSelectMenuBuilder().setCustomId('shop_buy_custom_role').setPlaceholder('🎨 Beli Custom Role...').setMinValues(1).setMaxValues(1).addOptions(new StringSelectMenuOptionBuilder().setLabel('Beli Tiket Custom Role').setDescription(`🪙 ${crPrice.toLocaleString('id-ID')}`).setValue('init_cr'));
                if (componentsRows.length < 5) componentsRows.push(new ActionRowBuilder().addComponents(crMenu));
            }

            // BARANG VIRTUAL section
            if (items.length > 0) {
                shopDesc += '📦 **BARANG VIRTUAL**\n';
                items.forEach((i, idx) => { shopDesc += `> ${i.name} — 🪙 **${i.price.toLocaleString('id-ID')}** (Stok: ${i.stock})\n`; });
                shopDesc += '\n';
                const itemMenu = new StringSelectMenuBuilder().setCustomId('shop_buy_item').setPlaceholder('📦 Beli Barang Virtual...').setMinValues(1).setMaxValues(1);
                const addedValues = new Set();
                items.forEach((i, idx) => { const val = `item_${i.name}_${i.price}`; if (!addedValues.has(val)) { addedValues.add(val); itemMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${i.name}`).setDescription(`🪙 ${i.price.toLocaleString('id-ID')} | Stok: ${i.stock}`).setValue(val)); } });
                if (componentsRows.length < 5) componentsRows.push(new ActionRowBuilder().addComponents(itemMenu));
            }

            // ITEMS section
            if (ITEMS.length > 0 && componentsRows.length < 5) {
                shopDesc += '🎒 **ITEMS**\n';
                ITEMS.forEach(item => { shopDesc += `> ${item.emoji} ${item.name} — 🪙 **${item.price.toLocaleString('id-ID')}**\n`; });
                shopDesc += '\n';
                const gameItemMenu = new StringSelectMenuBuilder().setCustomId('shop_buy_game_item').setPlaceholder('🎒 Beli Item...').setMinValues(1).setMaxValues(1);
                ITEMS.forEach(item => { gameItemMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${item.name}`).setDescription(`🪙 ${item.price.toLocaleString('id-ID')} | ${item.desc.substring(0, 40)}`).setValue(item.id)); });
                if (componentsRows.length < 5) componentsRows.push(new ActionRowBuilder().addComponents(gameItemMenu));
            }

            return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🛒 ${interaction.guild.name.toUpperCase()} STORE`).setColor('#2B2D31').setDescription(shopDesc).setFooter({ text: 'Pilih dari menu di bawah untuk membeli' })], components: componentsRows });
        }


        if (command === 'streak') {
            if (subCmd === 'cek') { const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id), emoji = getSetting(guildId, 'streak_emoji', '🔥'), count = sData ? sData.count : 0; return interaction.reply({content: `${emoji} **Streak:** \`${count} Hari\` berturut-turut!`}); }
            if (subCmd === 'restore') { const currentMonth = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).substring(0, 7); let restoreData = db.prepare('SELECT * FROM streak_restores WHERE guildId = ? AND userId = ? AND month = ?').get(guildId, interaction.user.id, currentMonth); const restoreCount = restoreData ? restoreData.count : 0; if (restoreCount >= 3) return interaction.reply({ content: '❌ Batas restore (3x) bulan ini habis!', ephemeral: true }); const history = db.prepare('SELECT * FROM streak_history WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id); if (!history || history.lost_count <= 1) return interaction.reply({ content: '❌ Tidak ada streak terputus.', ephemeral: true }); const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id), currentCount = sData ? sData.count : 0, newCount = history.lost_count + currentCount; db.prepare('UPDATE streaks SET count = ? WHERE guildId = ? AND userId = ?').run(newCount, guildId, interaction.user.id); db.prepare('DELETE FROM streak_history WHERE guildId = ? AND userId = ?').run(guildId, interaction.user.id); if (restoreData) db.prepare('UPDATE streak_restores SET count = count + 1 WHERE guildId = ? AND userId = ? AND month = ?').run(guildId, interaction.user.id, currentMonth); else db.prepare('INSERT INTO streak_restores (guildId, userId, month, count) VALUES (?, ?, ?, 1)').run(guildId, interaction.user.id, currentMonth); return interaction.reply({ content: `✅ Streak dipulihkan! Total: **${newCount} Hari**. (Sisa: ${2 - restoreCount}x)`, ephemeral: true }); }
            if (subCmd === 'setting') { if (!isAdmin) return interaction.reply({content: '❌ Admin!', ephemeral: true}); const status = interaction.options.getString('status'), autoNick = interaction.options.getString('autonick'), minHari = interaction.options.getInteger('min_hari'), emoji = interaction.options.getString('emoji') || '🔥'; db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_enabled', status); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_auto_nick', autoNick); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_min', minHari.toString()); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_emoji', emoji); return interaction.reply(`✅ Streak: ${status === 'true' ? 'ON' : 'OFF'} | Nick: ${autoNick === 'true' ? 'Ya' : 'Tidak'} | Min: ${minHari} | Emoji: ${emoji}`); }
            if (subCmd === 'admin_set') { if (!isAdmin) return interaction.reply({content: '❌', ephemeral: true}); const target = interaction.options.getUser('user'), amount = interaction.options.getInteger('jumlah'), today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); db.prepare('INSERT OR REPLACE INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, ?, ?)').run(guildId, target.id, amount, today); return interaction.reply(`✅ Streak <@${target.id}> = **${amount}**.`); }
            if (subCmd === 'admin_reset') { if (!isAdmin) return interaction.reply({content: '❌', ephemeral: true}); const target = interaction.options.getUser('user'); db.prepare('DELETE FROM streaks WHERE guildId = ? AND userId = ?').run(guildId, target.id); db.prepare('DELETE FROM streak_history WHERE guildId = ? AND userId = ?').run(guildId, target.id); return interaction.reply(`🗑️ Streak <@${target.id}> reset ke 0.`); }
            if (subCmd === 'admin_restore') { if (!isAdmin) return interaction.reply({content: '❌', ephemeral: true}); const target = interaction.options.getUser('user'), history = db.prepare('SELECT * FROM streak_history WHERE guildId = ? AND userId = ?').get(guildId, target.id); if (!history || history.lost_count <= 1) return interaction.reply({ content: '❌ Tidak ada streak terputus.', ephemeral: true }); const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, target.id), currentCount = sData ? sData.count : 0, newCount = history.lost_count + currentCount, today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); db.prepare('INSERT OR REPLACE INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, ?, ?)').run(guildId, target.id, newCount, sData ? sData.last_date : today); db.prepare('DELETE FROM streak_history WHERE guildId = ? AND userId = ?').run(guildId, target.id); return interaction.reply(`✅ Streak <@${target.id}> dipulihkan: **${newCount}**.`); }
        }
    }


    // ================= SELECT MENU HANDLERS =================
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('ach_detail_')) { const targetUserId = interaction.customId.replace('ach_detail_', ''), selectedCat = interaction.values[0], catAchs = ACHIEVEMENTS.filter(a => a.category === selectedCat), userAchs = db.prepare('SELECT * FROM achievements WHERE guildId = ? AND userId = ?').all(guildId, targetUserId), unlockedIds = userAchs.map(a => a.achievementId); const catUnlocked = catAchs.filter(a => unlockedIds.includes(a.id)).length; const catIcon = { Social: '💬', Economy: '💰', Level: '📈', Streak: '🔥', Gambling: '🎰', Events: '🎮', Voice: '🎙️', Quest: '📜', Special: '✨', Fishing: '🎣' }[selectedCat] || '📁'; let desc = `${catIcon} **${selectedCat}** — ${catUnlocked}/${catAchs.length} unlocked\n━━━━━━━━━━━━━━━━━━━━━━\n\n`; for (const ach of catAchs) { const unlocked = unlockedIds.includes(ach.id); const status = unlocked ? '✅' : '🔒'; const nameStyle = unlocked ? `**${ach.name}**` : `~~${ach.name}~~`; desc += `${status} ${ach.emoji} ${nameStyle}\n> *${ach.desc}*\n> Hadiah: 🪙 ${ach.reward.toLocaleString('id-ID')} Money${unlocked ? ' ✓ Diklaim' : ''}\n\n`; } return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${catIcon} Achievement: ${selectedCat}`).setColor(catUnlocked === catAchs.length ? '#FFD700' : '#2B2D31').setDescription(desc).setFooter({ text: catUnlocked === catAchs.length ? '🎉 Kategori ini sudah COMPLETE!' : `${catAchs.length - catUnlocked} badge tersisa` })], ephemeral: true }); }
        if (interaction.customId === 'shop_buy_custom_role') { const crPrice = parseInt(getSetting(guildId, 'custom_role_price', '0')), userData = getOrCreateUser(guildId, interaction.user.id); if (userData.balance < crPrice) return interaction.reply({ content: '❌ Uang kurang!', ephemeral: true }); const colorMenu = new StringSelectMenuBuilder().setCustomId('cr_select_color').setPlaceholder('🎨 Pilih Warna...').addOptions(new StringSelectMenuOptionBuilder().setLabel('🔴 Merah').setValue('FF0000'), new StringSelectMenuOptionBuilder().setLabel('🔵 Biru').setValue('0000FF'), new StringSelectMenuOptionBuilder().setLabel('🟢 Hijau').setValue('00FF00'), new StringSelectMenuOptionBuilder().setLabel('🟡 Kuning').setValue('FFFF00'), new StringSelectMenuOptionBuilder().setLabel('🟣 Ungu').setValue('800080'), new StringSelectMenuOptionBuilder().setLabel('🌸 Pink').setValue('FFC0CB'), new StringSelectMenuOptionBuilder().setLabel('⚫ Hitam').setValue('010101'), new StringSelectMenuOptionBuilder().setLabel('⚪ Putih').setValue('FFFFFF'), new StringSelectMenuOptionBuilder().setLabel('⚙️ Hex Sendiri').setValue('custom')); return interaction.reply({ content: 'Pilih warna:', components: [new ActionRowBuilder().addComponents(colorMenu)], ephemeral: true }); }
        if (interaction.customId === 'cr_select_color') { const selectedColor = interaction.values[0], modal = new ModalBuilder().setCustomId(`submit_cr_${selectedColor}`).setTitle('Custom Role 🎨'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cr_name').setLabel('Nama Role (Max 32)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32))); if (selectedColor === 'custom') modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cr_color').setLabel('Hex (#FF0000)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(7).setMaxLength(7).setPlaceholder('#FFFFFF'))); return interaction.showModal(modal); }
        // --- FISHING SHOP BUY ---
        if (interaction.customId === 'fishing_buy_rod' || interaction.customId === 'fishing_buy_bait') {
            const selected = interaction.values[0], userData = getOrCreateUser(guildId, interaction.user.id);
            if (selected.startsWith('rod_')) {
                const rodId = selected.substring(4), rodDef = ROD_TYPES.find(r => r.id === rodId);
                if (!rodDef) return interaction.reply({ content: '❌ Joran tidak ditemukan!', ephemeral: true });
                if (userData.balance < rodDef.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${rodDef.price.toLocaleString('id-ID')}**`, ephemeral: true });
                userData.balance -= rodDef.price;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                db.prepare('UPDATE fish_equipment SET rod = ? WHERE guildId = ? AND userId = ?').run(rodId, guildId, interaction.user.id);
                await checkAchievements(interaction.guild, interaction.user.id, { type: 'fish_rod', rod: rodId });
                return interaction.reply({ content: `✅ Berhasil membeli ${rodDef.emoji} **${rodDef.name}**! Joran langsung terpasang.\n> Cooldown: ${rodDef.cooldown}s | Rare Bonus: +${rodDef.rareBonus}%` });
            }
            if (selected.startsWith('bait_')) {
                const baitId = selected.substring(5), baitDef = BAIT_TYPES.find(b => b.id === baitId);
                if (!baitDef) return interaction.reply({ content: '❌ Umpan tidak ditemukan!', ephemeral: true });
                const totalPrice = baitDef.price * 10;
                if (userData.balance < totalPrice) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${totalPrice.toLocaleString('id-ID')}**`, ephemeral: true });
                userData.balance -= totalPrice;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                const eq = getEquipment(guildId, interaction.user.id);
                const newCount = (eq.bait === baitId ? eq.bait_count : 0) + 10;
                db.prepare('UPDATE fish_equipment SET bait = ?, bait_count = ? WHERE guildId = ? AND userId = ?').run(baitId, newCount, guildId, interaction.user.id);
                return interaction.reply({ content: `✅ Membeli ${baitDef.emoji} **${baitDef.name}** x10! Total umpan: **${newCount}**` });
            }
        }
        if (interaction.customId === 'shop_buy_game_item') {
            const itemId = interaction.values[0], userData = getOrCreateUser(guildId, interaction.user.id);
            const itemDef = ITEMS.find(i => i.id === itemId);
            if (!itemDef) return interaction.reply({ content: '❌ Item tidak ditemukan!', ephemeral: true });
            if (userData.balance < itemDef.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${itemDef.price.toLocaleString('id-ID')}**`, ephemeral: true });
            userData.balance -= itemDef.price;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
            addItem(guildId, interaction.user.id, itemId);
            return interaction.reply({ content: `✅ Berhasil membeli ${itemDef.emoji} **${itemDef.name}**!\n> Cek di \`/inventory\` — Gunakan dengan \`/use\`` });
        }
        if (interaction.customId === 'shop_buy_item' || interaction.customId === 'shop_buy_role') { const selected = interaction.values[0]; let itemName = '', price = 0; if (selected.startsWith('item_')) { const parts = selected.substring(5).split('_'); price = parseInt(parts.pop()); itemName = parts.join('_'); const itemInfo = db.prepare('SELECT price FROM shop_items WHERE guildId = ? AND name = ? AND price = ? LIMIT 1').get(guildId, itemName, price); if (!itemInfo) return interaction.reply({ content: '❌ Habis!', ephemeral: true }); price = itemInfo.price; } else if (selected.startsWith('role_')) { const roleId = selected.substring(5), roleInfo = db.prepare('SELECT price FROM shop_roles WHERE guildId = ? AND roleId = ?').get(guildId, roleId); if (!roleInfo) return interaction.reply({ content: '❌ Tidak dijual!', ephemeral: true }); const roleObj = interaction.guild.roles.cache.get(roleId); itemName = roleObj ? `Role: ${roleObj.name}` : 'Role'; price = roleInfo.price; } const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`confirm_${selected}`).setLabel('✅ Beli').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('cancel_buy').setLabel('❌ Batal').setStyle(ButtonStyle.Danger)); return interaction.reply({ content: `🧾 **${itemName}** — 🪙 **${price.toLocaleString('id-ID')}**\n\nLanjutkan pembelian?`, components: [row], ephemeral: true }); }
    }


    // ================= BUTTON HANDLERS =================
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('tv_create_')) { const tempVoiceData = db.prepare('SELECT * FROM temp_voices WHERE ownerId = ? AND guildId = ?').get(interaction.user.id, guildId); if (tempVoiceData) return interaction.reply({ content: `❌ Sudah punya channel (<#${tempVoiceData.channelId}>)!`, ephemeral: true }); const jtcCategoryId = getSetting(guildId, 'jtc_category', null); if (!jtcCategoryId) return interaction.reply({ content: '❌ Belum setup!', ephemeral: true }); if (interaction.customId === 'tv_create_custom') { const modal = new ModalBuilder().setCustomId('tv_modal_custom_create').setTitle('Buat Channel'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_custom_name').setLabel('Nama:').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50))); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_custom_limit').setLabel('Limit (0=bebas):').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setPlaceholder('0'))); return interaction.showModal(modal); } let limit = 0, isPrivate = false, vcName = `🔊 ${interaction.user.username}'s Room`; if (interaction.customId === 'tv_create_duo') { limit = 2; vcName = `👥 ${interaction.user.username}'s Duo`; } if (interaction.customId === 'tv_create_squad') { limit = 4; vcName = `👥 ${interaction.user.username}'s Squad`; } if (interaction.customId === 'tv_create_private') { isPrivate = true; vcName = `🔒 ${interaction.user.username}'s Private`; } await interaction.deferReply({ ephemeral: true }); try { const newVc = await interaction.guild.channels.create({ name: vcName, type: ChannelType.GuildVoice, parent: jtcCategoryId, userLimit: limit, permissionOverwrites: [{ id: guildId, allow: isPrivate ? [] : [PermissionsBitField.Flags.ViewChannel], deny: isPrivate ? [PermissionsBitField.Flags.Connect] : [] }, { id: interaction.user.id, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.Connect] }] }); db.prepare('INSERT INTO temp_voices (channelId, guildId, ownerId) VALUES (?, ?, ?)').run(newVc.id, guildId, interaction.user.id); interaction.editReply(`✅ Dibuat! <#${newVc.id}> (60 detik)`); setTimeout(async () => { const ch = interaction.guild.channels.cache.get(newVc.id); if (ch && ch.members.size === 0) { await ch.delete().catch(()=>{}); db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(newVc.id); } }, 60000); } catch(e) { interaction.editReply('❌ Gagal.'); } return; }

        if (interaction.customId.startsWith('tv_') && !interaction.customId.startsWith('tv_create_')) { const voiceChannel = interaction.member.voice.channel; if (!voiceChannel) return interaction.reply({ content: '❌ Masuk VC dulu!', ephemeral: true }); const channelId = voiceChannel.id, tempVoice = db.prepare('SELECT * FROM temp_voices WHERE channelId = ? AND guildId = ?').get(channelId, guildId); if (!tempVoice) return interaction.reply({ content: '❌ Bukan temp voice.', ephemeral: true }); if (interaction.customId === 'tv_claim') { if (tempVoice.ownerId === interaction.user.id) return interaction.reply({content: '❌ Sudah owner!', ephemeral: true}); if (voiceChannel.members.has(tempVoice.ownerId)) return interaction.reply({content: '❌ Owner masih ada!', ephemeral: true}); db.prepare('UPDATE temp_voices SET ownerId = ? WHERE channelId = ?').run(interaction.user.id, channelId); await voiceChannel.permissionOverwrites.edit(tempVoice.ownerId, { ManageChannels: null, ManageRoles: null }).catch(()=>{}); await voiceChannel.permissionOverwrites.edit(interaction.user.id, { ManageChannels: true, ManageRoles: true }).catch(()=>{}); return interaction.reply({content: '👑 Kamu owner sekarang!', ephemeral: true}); } if (tempVoice.ownerId !== interaction.user.id) return interaction.reply({content: '❌ Owner only.', ephemeral: true}); if (interaction.customId === 'tv_name') { const m = new ModalBuilder().setCustomId(`tv_modal_name_${channelId}`).setTitle('Ubah Nama'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_name').setLabel('Nama:').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50))); return interaction.showModal(m); } if (interaction.customId === 'tv_limit') { const m = new ModalBuilder().setCustomId(`tv_modal_limit_${channelId}`).setTitle('Ubah Limit'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_limit').setLabel('Limit (0=unlimited):').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2))); return interaction.showModal(m); } if (interaction.customId === 'tv_privacy') { const p = voiceChannel.permissionOverwrites.cache.get(guildId), locked = p && p.deny.has(PermissionsBitField.Flags.Connect); if (locked) { await voiceChannel.permissionOverwrites.edit(guildId, { Connect: null }).catch(()=>{}); return interaction.reply({content: '🔓 Terbuka.', ephemeral: true}); } else { await voiceChannel.permissionOverwrites.edit(guildId, { Connect: false }).catch(()=>{}); return interaction.reply({content: '🔒 Dikunci.', ephemeral: true}); } } if (interaction.customId === 'tv_hide') { const p = voiceChannel.permissionOverwrites.cache.get(guildId), hidden = p && p.deny.has(PermissionsBitField.Flags.ViewChannel); if (hidden) { await voiceChannel.permissionOverwrites.edit(guildId, { ViewChannel: null }).catch(()=>{}); return interaction.reply({content: '👁️ Terlihat.', ephemeral: true}); } else { await voiceChannel.permissionOverwrites.edit(guildId, { ViewChannel: false }).catch(()=>{}); return interaction.reply({content: '👻 Tersembunyi.', ephemeral: true}); } } if (interaction.customId === 'tv_kick') { const m = new ModalBuilder().setCustomId(`tv_modal_kick_${channelId}`).setTitle('Kick'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_kick').setLabel('User ID:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_block') { const m = new ModalBuilder().setCustomId(`tv_modal_block_${channelId}`).setTitle('Block'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_block').setLabel('User ID:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_unblock') { const m = new ModalBuilder().setCustomId(`tv_modal_unblock_${channelId}`).setTitle('Unblock'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_unblock').setLabel('User ID:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_transfer') { const m = new ModalBuilder().setCustomId(`tv_modal_transfer_${channelId}`).setTitle('Transfer'); m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tv_input_transfer').setLabel('User ID baru:').setStyle(TextInputStyle.Short).setRequired(true))); return interaction.showModal(m); } if (interaction.customId === 'tv_delete') { await voiceChannel.delete().catch(()=>{}); db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(channelId); return interaction.reply({content: '🗑️ Dihapus.', ephemeral: true}); } }

        // --- FISHING INVENTORY PAGINATION ---
        if (interaction.customId.startsWith('finv_prev_') || interaction.customId.startsWith('finv_next_')) {
            const currentPage = parseInt(interaction.customId.split('_')[2]);
            const newPage = interaction.customId.startsWith('finv_prev_') ? currentPage - 1 : currentPage + 1;
            const tierOrder = { 'Secret': 0, 'Mythic': 1, 'Legendary': 2, 'Epic': 3, 'Rare': 4, 'Uncommon': 5, 'Common': 6, 'Trash': 7 };
            const allInventory = db.prepare('SELECT * FROM fish_inventory WHERE guildId = ? AND userId = ?').all(guildId, interaction.user.id);
            const totalCount = allInventory.length;
            const lockedCount = allInventory.filter(i => i.locked === 1).length;
            if (totalCount === 0) return interaction.update({ content: '🎒 Kosong!', embeds: [], components: [] });
            const sorted = allInventory.sort((a, b) => {
                const fishA = FISH_DATA.find(f => f.id === a.fishId); const fishB = FISH_DATA.find(f => f.id === b.fishId);
                const tierA = fishA ? (tierOrder[fishA.tier] ?? 99) : 99; const tierB = fishB ? (tierOrder[fishB.tier] ?? 99) : 99;
                if (tierA !== tierB) return tierA - tierB; return b.weight - a.weight;
            });
            const perPage = 20; const totalPages = Math.ceil(totalCount / perPage);
            const page = Math.min(Math.max(1, newPage), totalPages);
            const start = (page - 1) * perPage; const pageItems = sorted.slice(start, start + perPage);
            let desc = `🎒 **Total: ${totalCount} ikan** (🔒 Locked: ${lockedCount})\n\n`;
            pageItems.forEach((item) => { const fd = FISH_DATA.find(f => f.id === item.fishId); const tier = fd ? FISH_TIERS.find(t => t.tier === fd.tier) : null; const lockIcon = item.locked ? '🔒 ' : ''; const tierTag = fd ? `**(${fd.tier})**` : ''; desc += `**ID #${item.id}** ${lockIcon}${tier ? tier.emoji : '🐟'} **${fd ? fd.name : '?'}** — ${item.weight} kg ${tierTag}\n`; });
            desc += `\n━━━━━━━━━━━━━━━━━━━━━━\n> 📄 Halaman **${page}** / **${totalPages}**`;
            const navRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`finv_prev_${page}`).setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
                new ButtonBuilder().setCustomId(`finv_next_${page}`).setLabel('▶ Next').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
            );
            return interaction.update({ embeds: [new EmbedBuilder().setTitle('🎣 Fishing Inventory').setColor('#2B2D31').setDescription(desc)], components: [navRow] });
        }

        if (interaction.customId === 'airdrop_claim') { if (activeMiniEvents.has(guildId)) activeMiniEvents.delete(guildId); const reward = getRandomInt(300, 600); let ud = getOrCreateUser(guildId, interaction.user.id); ud.balance += reward; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(ud.balance, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'event_wins'); await checkAchievements(interaction.guild, interaction.user.id, { type: 'event_win' }); return interaction.update({ content: `🎉 <@${interaction.user.id}> klaim Air Drop! 🪙 **${reward}**`, embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('x').setLabel(`Diklaim ${interaction.user.username}`).setStyle(ButtonStyle.Secondary).setDisabled(true))] }); }
        if (interaction.customId.startsWith('claim_quest_')) { const qi = parseInt(interaction.customId.replace('claim_quest_', '')), today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); let row = db.prepare('SELECT * FROM daily_quests WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id); if (!row || row.date !== today) return interaction.update({ content: '❌ Expired.', embeds: [], components: [] }); let quests = JSON.parse(row.data), tq = quests[qi]; if (tq.progress < tq.target || tq.claimed) return interaction.reply({content: '❌ Belum selesai!', ephemeral: true}); tq.claimed = true; db.prepare('UPDATE daily_quests SET data = ? WHERE guildId = ? AND userId = ?').run(JSON.stringify(quests), guildId, interaction.user.id); let ud = getOrCreateUser(guildId, interaction.user.id); ud.balance += tq.reward; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(ud.balance, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'total_quests_done'); await checkAchievements(interaction.guild, interaction.user.id, { type: 'quest' }); if (quests.every(q => q.claimed)) await checkAchievements(interaction.guild, interaction.user.id, { type: 'all_quest_day' }); return interaction.reply(`✅ Dapat 🪙 **${tq.reward}**!`); }
        if (interaction.customId === 'cancel_buy') return interaction.update({ content: '❌ Dibatalkan.', components: [] });
        if (interaction.customId.startsWith('confirm_')) { const selected = interaction.customId.substring(8), userData = getOrCreateUser(guildId, interaction.user.id); let finalItemName = '', finalPrice = 0; if (selected.startsWith('item_')) { const parts = selected.substring(5).split('_'); const itemPrice = parseInt(parts.pop()); const itemName = parts.join('_'); const item = db.prepare('SELECT * FROM shop_items WHERE guildId = ? AND name = ? AND price = ? LIMIT 1').get(guildId, itemName, itemPrice); if (!item) return interaction.update({content: '❌ Habis!', components: []}); if (userData.balance < item.price) return interaction.update({content: '❌ Saldo kurang!', components: []}); try { await interaction.user.send(`🛍️ **${item.name}**:\n\`\`\`\n${item.content}\n\`\`\``); } catch(e) { return interaction.update({content: '❌ DM tertutup!', components: []}); } userData.balance -= item.price; finalItemName = item.name; finalPrice = item.price; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); db.prepare('DELETE FROM shop_items WHERE id = ?').run(item.id); } if (selected.startsWith('role_')) { const roleId = selected.substring(5), sr = db.prepare('SELECT * FROM shop_roles WHERE guildId = ? AND roleId = ?').get(guildId, roleId); if (!sr) return interaction.update({content: '❌ Tidak dijual.', components: []}); if (userData.balance < sr.price) return interaction.update({content: '❌ Saldo kurang!', components: []}); if (interaction.member.roles.cache.has(roleId)) return interaction.update({content: '❌ Sudah punya!', components: []}); userData.balance -= sr.price; const role = interaction.guild.roles.cache.get(roleId); finalItemName = role ? `Role ${role.name}` : 'Role'; finalPrice = sr.price; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); if (role) await interaction.member.roles.add(role).catch(()=>{}); } incrementUserStat(guildId, interaction.user.id, 'total_buys'); await checkAchievements(interaction.guild, interaction.user.id, { type: 'buy' }); db.prepare('INSERT INTO logs (guildId, time, userId, action, item, price) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, Date.now(), interaction.user.id, 'BUY', finalItemName, finalPrice); const ts = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, 'testimoni_channel'); if (ts) { const tc = interaction.guild.channels.cache.get(ts.value); if (tc) tc.send({ embeds: [new EmbedBuilder().setColor('#2B2D31').setDescription(`<@${interaction.user.id}> beli **${finalItemName}** (🪙 ${finalPrice.toLocaleString('id-ID')})`).setTimestamp()] }).catch(()=>{}); } return interaction.update({content: `✅ Berhasil beli **${finalItemName}**!`, components: []}); }
    }


    // ================= MODAL HANDLERS =================
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'tv_modal_custom_create') { const vcName = interaction.fields.getTextInputValue('tv_input_custom_name'); let limit = parseInt(interaction.fields.getTextInputValue('tv_input_custom_limit')); if (isNaN(limit)) limit = 0; const jtcCategoryId = getSetting(guildId, 'jtc_category', null); if (!jtcCategoryId) return interaction.reply({content: '❌ Belum setup!', ephemeral: true}); await interaction.deferReply({ephemeral: true}); try { const newVc = await interaction.guild.channels.create({ name: vcName, type: ChannelType.GuildVoice, parent: jtcCategoryId, userLimit: limit, permissionOverwrites: [{id: guildId, allow: [PermissionsBitField.Flags.ViewChannel]}, {id: interaction.user.id, allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.Connect]}] }); db.prepare('INSERT INTO temp_voices (channelId, guildId, ownerId) VALUES (?, ?, ?)').run(newVc.id, guildId, interaction.user.id); interaction.editReply(`✅ <#${newVc.id}> (60 detik)`); setTimeout(async()=>{const ch=interaction.guild.channels.cache.get(newVc.id);if(ch&&ch.members.size===0){await ch.delete().catch(()=>{});db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(newVc.id);}},60000); } catch(e) { interaction.editReply('❌ Gagal.'); } return; }

        if (interaction.customId.startsWith('tv_modal_')) { const parts = interaction.customId.split('_'), actionType = parts[2], channelId = parts.slice(3).join('_'), voiceChannel = interaction.guild.channels.cache.get(channelId); if (!voiceChannel) return interaction.reply({content: '❌ Channel hilang.', ephemeral: true}); const tempVoice = db.prepare('SELECT * FROM temp_voices WHERE channelId = ? AND guildId = ?').get(channelId, guildId); if (!tempVoice || tempVoice.ownerId !== interaction.user.id) return interaction.reply({content: '❌ Bukan owner!', ephemeral: true}); if (actionType === 'name') { await voiceChannel.setName(interaction.fields.getTextInputValue('tv_input_name')).catch(()=>{}); return interaction.reply({content: '✅ Diubah.', ephemeral: true}); } if (actionType === 'limit') { let l = parseInt(interaction.fields.getTextInputValue('tv_input_limit')); if (isNaN(l)) l = 0; await voiceChannel.setUserLimit(l).catch(()=>{}); return interaction.reply({content: `✅ Limit: ${l||'unlimited'}`, ephemeral: true}); } if (actionType === 'kick') { const tid = interaction.fields.getTextInputValue('tv_input_kick'), m = voiceChannel.members.get(tid); if (!m) return interaction.reply({content: '❌ Tidak ada.', ephemeral: true}); await m.voice.disconnect().catch(()=>{}); return interaction.reply({content: `👢 Kicked.`, ephemeral: true}); } if (actionType === 'block') { const tid = interaction.fields.getTextInputValue('tv_input_block'); await voiceChannel.permissionOverwrites.edit(tid, {Connect: false, ViewChannel: false}).catch(()=>{}); const m = voiceChannel.members.get(tid); if (m) await m.voice.disconnect().catch(()=>{}); return interaction.reply({content: '🚫 Blocked.', ephemeral: true}); } if (actionType === 'unblock') { const tid = interaction.fields.getTextInputValue('tv_input_unblock'); await voiceChannel.permissionOverwrites.edit(tid, {Connect: null, ViewChannel: null}).catch(()=>{}); return interaction.reply({content: '🟢 Unblocked.', ephemeral: true}); } if (actionType === 'transfer') { const tid = interaction.fields.getTextInputValue('tv_input_transfer'), m = voiceChannel.members.get(tid); if (!m) return interaction.reply({content: '❌ User harus di VC.', ephemeral: true}); db.prepare('UPDATE temp_voices SET ownerId = ? WHERE channelId = ?').run(tid, channelId); await voiceChannel.permissionOverwrites.edit(interaction.user.id, {ManageChannels: null, ManageRoles: null}).catch(()=>{}); await voiceChannel.permissionOverwrites.edit(tid, {ManageChannels: true, ManageRoles: true}).catch(()=>{}); return interaction.reply({content: `🔄 Transferred.`, ephemeral: true}); } }

        if (interaction.customId.startsWith('submit_cr_')) { const colorData = interaction.customId.replace('submit_cr_', ''), crPrice = parseInt(getSetting(guildId, 'custom_role_price', '0')), userData = getOrCreateUser(guildId, interaction.user.id); if (userData.balance < crPrice) return interaction.reply({content: '❌ Saldo kurang!', ephemeral: true}); const roleName = interaction.fields.getTextInputValue('cr_name'); let roleColor = colorData === 'custom' ? interaction.fields.getTextInputValue('cr_color') : `#${colorData}`; if (!/^#[0-9A-F]{6}$/i.test(roleColor)) return interaction.reply({content: '❌ Format hex salah!', ephemeral: true}); await interaction.deferReply(); try { userData.balance -= crPrice; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); const targetRoleId = '1062034108433301515', targetRole = interaction.guild.roles.cache.get(targetRoleId); let targetPos = targetRole ? Math.max(1, targetRole.position - 1) : Math.max(1, (interaction.guild.members.me.roles.highest.position || 1) - 1); const newRole = await interaction.guild.roles.create({ name: roleName, color: roleColor, hoist: true, position: targetPos, reason: `Custom Role: ${interaction.user.username}` }); await interaction.member.roles.add(newRole); db.prepare('INSERT INTO logs (guildId, time, userId, action, item, price) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, Date.now(), interaction.user.id, 'BUY', `Custom Role: ${roleName}`, crPrice); incrementUserStat(guildId, interaction.user.id, 'total_buys'); await checkAchievements(interaction.guild, interaction.user.id, { type: 'custom_role' }); await checkAchievements(interaction.guild, interaction.user.id, { type: 'buy' }); const ts = db.prepare('SELECT value FROM server_settings WHERE guildId = ? AND key = ?').get(guildId, 'testimoni_channel'); if (ts) { const tc = interaction.guild.channels.cache.get(ts.value); if (tc) tc.send({ embeds: [new EmbedBuilder().setColor(roleColor).setDescription(`<@${interaction.user.id}> buat **${roleName}** (🪙 ${crPrice.toLocaleString('id-ID')})`).setTimestamp()] }).catch(()=>{}); } return interaction.editReply(`🎉 Custom Role <@&${newRole.id}> dibuat! 🪙 **${crPrice.toLocaleString('id-ID')}**`); } catch(e) { userData.balance += crPrice; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); console.error(e); return interaction.editReply('❌ Gagal. Uang dikembalikan.'); } }
    }
});

client.login(TOKEN);
