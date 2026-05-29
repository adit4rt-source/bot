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

// ================= MIGRASI: FARMING SYSTEM =================
db.exec(`CREATE TABLE IF NOT EXISTS farm_plots (id INTEGER PRIMARY KEY AUTOINCREMENT, guildId TEXT, userId TEXT, cropId TEXT, plantedAt INTEGER, wateredAt INTEGER, fertilizer TEXT DEFAULT 'none', status TEXT DEFAULT 'growing')`);
db.exec(`CREATE TABLE IF NOT EXISTS farm_storage (guildId TEXT, userId TEXT, itemId TEXT, quantity INTEGER DEFAULT 0, PRIMARY KEY(guildId, userId, itemId))`);
db.exec(`CREATE TABLE IF NOT EXISTS farm_data (guildId TEXT, userId TEXT, farm_level INTEGER DEFAULT 1, PRIMARY KEY(guildId, userId))`);

// ================= MIGRASI: PET SYSTEM =================
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
db.exec(`CREATE TABLE IF NOT EXISTS battle_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, guildId TEXT, oderId TEXT, result TEXT, reward INTEGER, timestamp INTEGER)`);

// ================= AUTO-MIGRASI STREAK DARI KYTHIA (SEKALI JALAN) =================
const MIGRATION_GUILD = '1056412836433240074';
const migrationDone = db.prepare("SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = ?").get(MIGRATION_GUILD, 'SYSTEM', 'kythia_migration_done');
if (!migrationDone) {
    console.log('🔄 Migrasi streak dari Kythia...');
    const kythiaData = [
        ['1388079155391893587',52],['751757086517493781',52],['1051116479912882316',51],['1183391735703945279',51],['757586932430667908',39],['1499773045840023611',28],['883240418555330600',29],['720913780183269437',16],['1491038433081032785',15],['1471703965296099490',19],['438310703300870144',23],['955048168939196446',20],['1382707281862463498',11],['515920253910253569',31],['1060794481458298992',25],['349874541784334337',8],['1241341465091772499',3],['1388566247590985728',32],['991559015144357929',2],['1080093365321871463',2],['1201894211884945418',30],['331477989315444736',29],['929800132105494608',18],['1111152686843314249',14],['1101833915808886784',10],['1330455728544157788',10],['981071097699139604',8],['1201452476889571328',7],['764119790738079764',6],['726779204116676648',6],['555944261208768526',5],['454654837989048331',4],['1360246183712260157',3],['1371753890328088686',2],['1250808742530781204',2],['1477693445727326360',2],['1320946574565572692',2],['1126123745224962229',2],['1396827530513879130',2],['1352878799813087324',2]
    ];
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    let count = 0;
    for (const [userId, streak] of kythiaData) {
        const existing = db.prepare('SELECT count FROM streaks WHERE guildId = ? AND userId = ?').get(MIGRATION_GUILD, userId);
        if (!existing || existing.count < streak) {
            db.prepare('INSERT OR REPLACE INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, ?, ?)').run(MIGRATION_GUILD, userId, streak, today);
            const userExists = db.prepare('SELECT 1 FROM users WHERE guildId = ? AND userId = ?').get(MIGRATION_GUILD, userId);
            if (!userExists) db.prepare('INSERT INTO users (guildId, userId) VALUES (?, ?)').run(MIGRATION_GUILD, userId);
            count++;
        }
    }
    db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(MIGRATION_GUILD, 'SYSTEM', 'kythia_migration_done', 1);
    console.log(`✅ Migrasi selesai! ${count} user streak diupdate.`);
}

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
    { id: 'cacing', name: 'Cacing Tanah', emoji: '🪱', price: 30, rareBonus: 0 },
    { id: 'jangkrik', name: 'Jangkrik', emoji: '🦗', price: 60, rareBonus: 2 },
    { id: 'udang', name: 'Udang Segar', emoji: '🦐', price: 100, rareBonus: 4 },
    { id: 'ikan_kecil', name: 'Ikan Kecil (Live)', emoji: '🐟', price: 200, rareBonus: 6 },
    { id: 'cumi', name: 'Cumi-cumi', emoji: '🦑', price: 350, rareBonus: 9 },
    { id: 'emas', name: 'Umpan Emas', emoji: '✨', price: 500, rareBonus: 12 },
    { id: 'mutiara', name: 'Umpan Mutiara', emoji: '🫧', price: 800, rareBonus: 16 },
    { id: 'berlian', name: 'Umpan Berlian', emoji: '💎', price: 1500, rareBonus: 20 },
    { id: 'blood_worm', name: 'Blood Worm', emoji: '🩸', price: 3000, rareBonus: 25 },
    { id: 'mythic_bait', name: 'Umpan Mitik', emoji: '🌟', price: 5000, rareBonus: 30 },
    { id: 'void_bait', name: 'Umpan Void', emoji: '🕳️', price: 10000, rareBonus: 35 }
];

const ROD_TYPES = [
    { id: 'basic', name: 'Joran Bambu', emoji: '🎋', price: 0, cooldown: 15, rareBonus: 0 },
    { id: 'fiber', name: 'Joran Fiber', emoji: '🎣', price: 2000, cooldown: 13, rareBonus: 3 },
    { id: 'carbon', name: 'Joran Carbon', emoji: '⚡', price: 8000, cooldown: 11, rareBonus: 7 },
    { id: 'titanium', name: 'Joran Titanium', emoji: '🔩', price: 18000, cooldown: 10, rareBonus: 9 },
    { id: 'pro', name: 'Joran Pro', emoji: '🏆', price: 35000, cooldown: 8, rareBonus: 12 },
    { id: 'enchanted', name: 'Joran Enchanted', emoji: '✨', price: 60000, cooldown: 7, rareBonus: 15 },
    { id: 'mythic_rod', name: 'Joran Mitik', emoji: '🔱', price: 100000, cooldown: 6, rareBonus: 18 },
    { id: 'celestial', name: 'Joran Celestial', emoji: '🌟', price: 150000, cooldown: 5, rareBonus: 21 },
    { id: 'divine_rod', name: 'Joran Dewa', emoji: '👑', price: 250000, cooldown: 4, rareBonus: 25 },
    { id: 'void_rod', name: 'Joran Void', emoji: '🕳️', price: 500000, cooldown: 3, rareBonus: 30 }
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
    { id: 'mystery_box', name: 'Mystery Box', emoji: '📦', desc: 'Random 50-2000 money', price: 1000, category: 'Special' },
    { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', desc: 'Material untuk upgrade relic (+1)', price: 3000, category: 'Battle' },
    { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', desc: 'Refine gagal tidak turun level', price: 8000, category: 'Battle' }
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

// ================= SISTEM FARMING =================
const FARM_LEVELS = [
    { level: 1, name: '🌱 Pemula', slots: 3, cost: 0 },
    { level: 2, name: '🌿 Petani', slots: 5, cost: 5000 },
    { level: 3, name: '🌳 Farmer Pro', slots: 8, cost: 15000 },
    { level: 4, name: '🏡 Tuan Tanah', slots: 12, cost: 40000 },
    { level: 5, name: '🏰 Juragan', slots: 16, cost: 100000 },
    { level: 6, name: '👑 Raja Pertanian', slots: 20, cost: 250000 }
];

const FARM_CROPS = [
    // COMMON (2-4 menit)
    { id: 'gandum', name: 'Gandum', emoji: '🌾', tier: 'Common', cost: 20, time: 2, minYield: 2, maxYield: 4, sellPrice: 12 },
    { id: 'wortel', name: 'Wortel', emoji: '🥕', tier: 'Common', cost: 30, time: 3, minYield: 2, maxYield: 3, sellPrice: 15 },
    { id: 'bayam', name: 'Bayam', emoji: '🥬', tier: 'Common', cost: 20, time: 2, minYield: 3, maxYield: 5, sellPrice: 10 },
    { id: 'jagung', name: 'Jagung', emoji: '🌽', tier: 'Common', cost: 35, time: 4, minYield: 2, maxYield: 4, sellPrice: 15 },
    { id: 'kentang', name: 'Kentang', emoji: '🥔', tier: 'Common', cost: 25, time: 3, minYield: 2, maxYield: 4, sellPrice: 12 },
    { id: 'bawang_putih', name: 'Bawang Putih', emoji: '🧄', tier: 'Common', cost: 30, time: 4, minYield: 2, maxYield: 3, sellPrice: 15 },
    // UNCOMMON (8-18 menit)
    { id: 'tomat', name: 'Tomat', emoji: '🍅', tier: 'Uncommon', cost: 70, time: 8, minYield: 2, maxYield: 4, sellPrice: 25 },
    { id: 'cabai', name: 'Cabai', emoji: '🌶️', tier: 'Uncommon', cost: 60, time: 8, minYield: 3, maxYield: 5, sellPrice: 20 },
    { id: 'paprika', name: 'Paprika', emoji: '🫑', tier: 'Uncommon', cost: 80, time: 12, minYield: 2, maxYield: 3, sellPrice: 35 },
    { id: 'strawberry', name: 'Strawberry', emoji: '🍓', tier: 'Uncommon', cost: 100, time: 18, minYield: 2, maxYield: 4, sellPrice: 40 },
    { id: 'bawang_merah', name: 'Bawang Merah', emoji: '🧅', tier: 'Uncommon', cost: 60, time: 10, minYield: 3, maxYield: 5, sellPrice: 20 },
    { id: 'terong', name: 'Terong', emoji: '🍆', tier: 'Uncommon', cost: 75, time: 12, minYield: 2, maxYield: 3, sellPrice: 30 },
    // RARE (20-35 menit)
    { id: 'anggur', name: 'Anggur', emoji: '🍇', tier: 'Rare', cost: 200, time: 20, minYield: 2, maxYield: 4, sellPrice: 55 },
    { id: 'semangka', name: 'Semangka', emoji: '🍉', tier: 'Rare', cost: 250, time: 30, minYield: 1, maxYield: 2, sellPrice: 130 },
    { id: 'kopi', name: 'Kopi', emoji: '☕', tier: 'Rare', cost: 280, time: 30, minYield: 2, maxYield: 3, sellPrice: 80 },
    { id: 'kakao', name: 'Kakao', emoji: '🍫', tier: 'Rare', cost: 250, time: 35, minYield: 2, maxYield: 3, sellPrice: 70 },
    { id: 'blueberry', name: 'Blueberry', emoji: '🫐', tier: 'Rare', cost: 200, time: 20, minYield: 2, maxYield: 4, sellPrice: 60 },
    { id: 'mawar', name: 'Mawar', emoji: '🌹', tier: 'Rare', cost: 350, time: 35, minYield: 1, maxYield: 3, sellPrice: 130 },
    // EPIC (50-90 menit = ~1-1.5 jam)
    { id: 'bunga_matahari', name: 'Bunga Matahari', emoji: '🌻', tier: 'Epic', cost: 600, time: 50, minYield: 2, maxYield: 4, sellPrice: 130 },
    { id: 'jeruk', name: 'Jeruk', emoji: '🍊', tier: 'Epic', cost: 700, time: 70, minYield: 2, maxYield: 3, sellPrice: 200 },
    { id: 'zaitun', name: 'Zaitun', emoji: '🫒', tier: 'Epic', cost: 900, time: 90, minYield: 1, maxYield: 3, sellPrice: 350 },
    { id: 'sakura', name: 'Sakura', emoji: '🌸', tier: 'Epic', cost: 1100, time: 70, minYield: 1, maxYield: 2, sellPrice: 400 },
    { id: 'madu', name: 'Madu', emoji: '🍯', tier: 'Epic', cost: 700, time: 50, minYield: 2, maxYield: 3, sellPrice: 230 },
    { id: 'hibiscus', name: 'Hibiscus', emoji: '🌺', tier: 'Epic', cost: 650, time: 50, minYield: 2, maxYield: 3, sellPrice: 170 },
    // LEGENDARY (150-210 menit = 2.5-3.5 jam)
    { id: 'crystal_flower', name: 'Crystal Flower', emoji: '💎', tier: 'Legendary', cost: 3500, time: 150, minYield: 1, maxYield: 2, sellPrice: 1400 },
    { id: 'star_fruit', name: 'Star Fruit', emoji: '🌟', tier: 'Legendary', cost: 3000, time: 150, minYield: 1, maxYield: 2, sellPrice: 1100 },
    { id: 'mystic_herb', name: 'Mystic Herb', emoji: '🔮', tier: 'Legendary', cost: 4500, time: 180, minYield: 1, maxYield: 1, sellPrice: 1800 },
    { id: 'dragon_fruit_crop', name: 'Dragon Fruit', emoji: '🐉', tier: 'Legendary', cost: 3500, time: 165, minYield: 1, maxYield: 2, sellPrice: 1400 },
    { id: 'lotus', name: 'Lotus Suci', emoji: '🪷', tier: 'Legendary', cost: 5000, time: 210, minYield: 1, maxYield: 1, sellPrice: 2200 },
    { id: 'ice_berry', name: 'Ice Berry', emoji: '❄️', tier: 'Legendary', cost: 3200, time: 150, minYield: 1, maxYield: 2, sellPrice: 1300 }
];

const FARM_RECIPES = [
    { id: 'roti', name: 'Roti', emoji: '🍞', ingredients: [{id:'gandum',qty:3}], sellPrice: 150 },
    { id: 'salad', name: 'Salad', emoji: '🥗', ingredients: [{id:'bayam',qty:2},{id:'tomat',qty:1}], sellPrice: 260 },
    { id: 'kentang_goreng', name: 'Kentang Goreng', emoji: '🍟', ingredients: [{id:'kentang',qty:3}], sellPrice: 180 },
    { id: 'popcorn', name: 'Popcorn', emoji: '🍿', ingredients: [{id:'jagung',qty:4}], sellPrice: 300 },
    { id: 'kue', name: 'Kue Strawberry', emoji: '🍰', ingredients: [{id:'gandum',qty:2},{id:'strawberry',qty:2}], sellPrice: 520 },
    { id: 'sup', name: 'Sup Sayur', emoji: '🫕', ingredients: [{id:'wortel',qty:2},{id:'kentang',qty:2},{id:'bawang_putih',qty:1}], sellPrice: 380 },
    { id: 'sambal', name: 'Sambal', emoji: '🌶️', ingredients: [{id:'cabai',qty:4},{id:'bawang_merah',qty:2}], sellPrice: 600 },
    { id: 'wine', name: 'Wine', emoji: '🍷', ingredients: [{id:'anggur',qty:5}], sellPrice: 1800 },
    { id: 'kopi_premium', name: 'Kopi Premium', emoji: '☕', ingredients: [{id:'kopi',qty:3},{id:'madu',qty:1}], sellPrice: 2200 },
    { id: 'cokelat', name: 'Cokelat Mewah', emoji: '🍫', ingredients: [{id:'kakao',qty:3},{id:'strawberry',qty:2}], sellPrice: 1600 },
    { id: 'buket', name: 'Buket Bunga', emoji: '💐', ingredients: [{id:'mawar',qty:2},{id:'sakura',qty:1},{id:'hibiscus',qty:1}], sellPrice: 3300 },
    { id: 'parfum', name: 'Parfum Sakura', emoji: '🧴', ingredients: [{id:'sakura',qty:2},{id:'mawar',qty:2}], sellPrice: 4500 },
    { id: 'minyak_zaitun', name: 'Minyak Zaitun', emoji: '🫒', ingredients: [{id:'zaitun',qty:3}], sellPrice: 4000 },
    { id: 'ramuan', name: 'Ramuan Ajaib', emoji: '🧪', ingredients: [{id:'mystic_herb',qty:1},{id:'crystal_flower',qty:1}], sellPrice: 10000 },
    { id: 'essence_naga', name: 'Essence Naga', emoji: '🐉', ingredients: [{id:'dragon_fruit_crop',qty:2},{id:'ice_berry',qty:1}], sellPrice: 13000 },
    { id: 'elixir', name: 'Elixir of Life', emoji: '✨', ingredients: [{id:'mystic_herb',qty:1},{id:'lotus',qty:1},{id:'ice_berry',qty:1}], sellPrice: 16000 }
];

const FARM_FERTILIZERS = [
    { id: 'none', name: 'Tanpa Pupuk', emoji: '❌', cost: 0, speedBonus: 0, yieldBonus: 0 },
    { id: 'pupuk_biasa', name: 'Pupuk Biasa', emoji: '💩', cost: 50, speedBonus: 0.20, yieldBonus: 0 },
    { id: 'pupuk_premium', name: 'Pupuk Premium', emoji: '✨', cost: 200, speedBonus: 0.40, yieldBonus: 0.20 },
    { id: 'pupuk_ajaib', name: 'Pupuk Ajaib', emoji: '🧪', cost: 500, speedBonus: 0.60, yieldBonus: 0.30 },
    { id: 'pupuk_legenda', name: 'Pupuk Legenda', emoji: '🌟', cost: 1500, speedBonus: 0.50, yieldBonus: 0.50 }
];

function getFarmData(guildId, userId) {
    let data = db.prepare('SELECT * FROM farm_data WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!data) { db.prepare('INSERT INTO farm_data (guildId, userId) VALUES (?, ?)').run(guildId, userId); data = { farm_level: 1 }; }
    return data;
}
function getFarmSlots(guildId, userId) { const data = getFarmData(guildId, userId); return FARM_LEVELS.find(l => l.level === data.farm_level)?.slots || 3; }
function getPlots(guildId, userId) { return db.prepare('SELECT * FROM farm_plots WHERE guildId = ? AND userId = ?').all(guildId, userId); }
function getStorage(guildId, userId) { return db.prepare('SELECT * FROM farm_storage WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, userId); }
function addStorage(guildId, userId, itemId, qty) { const current = db.prepare('SELECT quantity FROM farm_storage WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, itemId); if (current) db.prepare('UPDATE farm_storage SET quantity = quantity + ? WHERE guildId = ? AND userId = ? AND itemId = ?').run(qty, guildId, userId, itemId); else db.prepare('INSERT INTO farm_storage (guildId, userId, itemId, quantity) VALUES (?, ?, ?, ?)').run(guildId, userId, itemId, qty); }
function removeStorage(guildId, userId, itemId, qty) { const current = db.prepare('SELECT quantity FROM farm_storage WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, itemId); if (!current || current.quantity < qty) return false; if (current.quantity - qty <= 0) db.prepare('DELETE FROM farm_storage WHERE guildId = ? AND userId = ? AND itemId = ?').run(guildId, userId, itemId); else db.prepare('UPDATE farm_storage SET quantity = quantity - ? WHERE guildId = ? AND userId = ? AND itemId = ?').run(qty, guildId, userId, itemId); return true; }
function getStorageQty(guildId, userId, itemId) { const r = db.prepare('SELECT quantity FROM farm_storage WHERE guildId = ? AND userId = ? AND itemId = ?').get(guildId, userId, itemId); return r ? r.quantity : 0; }

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
    // Equipment requirements for top tiers
    const rodTier = ['basic', 'fiber', 'carbon', 'titanium', 'pro', 'enchanted', 'mythic_rod', 'celestial', 'divine_rod', 'void_rod'].indexOf(rod.id);
    const hasBait = eq.bait !== 'none' && eq.bait_count > 0;
    
    let adjustedTiers = FISH_TIERS.map(t => {
        let adj = t.chance;
        if (t.tier === 'Trash') adj = Math.max(2, t.chance - rareBonus);
        else if (t.tier === 'Common') adj = Math.max(8, t.chance - rareBonus * 0.5);
        else if (t.tier === 'Rare') adj = t.chance + rareBonus * 0.8;
        else if (t.tier === 'Epic') adj = t.chance + rareBonus * 0.6;
        else if (t.tier === 'Legendary') {
            // Butuh minimal Joran Fiber (index 1) + Bait
            if (rodTier < 1 || !hasBait) adj = 0;
            else adj = Math.min(6, t.chance + rareBonus * 0.3);
        }
        else if (t.tier === 'Mythic') {
            // Butuh minimal Joran Carbon (index 2) + Bait
            if (rodTier < 2 || !hasBait) adj = 0;
            else adj = Math.min(2.5, t.chance + rareBonus * 0.15);
        }
        else if (t.tier === 'Secret') {
            // Butuh minimal Joran Pro (index 4) + Umpan premium (emas+)
            if (rodTier < 4 || !hasBait) adj = 0;
            else if (['cacing', 'jangkrik', 'udang', 'ikan_kecil', 'cumi'].includes(eq.bait)) adj = 0; // Umpan biasa tidak cukup
            else adj = Math.min(0.8, t.chance + rareBonus * 0.05);
        }
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

// ================= SISTEM PET / COMPANION =================
const PET_DATA = [
    // COMMON (25 pets)
    { id: 'cat', name: 'Kucing', emoji: '🐱', tier: 'Common', price: 1000, bonus: { type: 'money_chat', value: 3 } },
    { id: 'dog', name: 'Anjing', emoji: '🐶', tier: 'Common', price: 1000, bonus: { type: 'xp_chat', value: 3 } },
    { id: 'hamster', name: 'Hamster', emoji: '🐹', tier: 'Common', price: 500, bonus: { type: 'farm_yield', value: 5 } },
    { id: 'bird', name: 'Burung', emoji: '🐦', tier: 'Common', price: 500, bonus: { type: 'farm_speed', value: 3 } },
    { id: 'fish_pet', name: 'Ikan Hias', emoji: '🐠', tier: 'Common', price: 800, bonus: { type: 'fish_luck', value: 2 } },
    { id: 'turtle', name: 'Kura-kura', emoji: '🐢', tier: 'Common', price: 600, bonus: { type: 'xp_all', value: 2 } },
    { id: 'duck', name: 'Bebek', emoji: '🦆', tier: 'Common', price: 700, bonus: { type: 'money_all', value: 2 } },
    { id: 'chick', name: 'Anak Ayam', emoji: '🐤', tier: 'Common', price: 400, bonus: { type: 'quest_reward', value: 3 } },
    { id: 'frog', name: 'Kodok', emoji: '🐸', tier: 'Common', price: 500, bonus: { type: 'event_luck', value: 3 } },
    { id: 'mouse', name: 'Tikus Putih', emoji: '🐭', tier: 'Common', price: 400, bonus: { type: 'money_chat', value: 2 } },
    { id: 'rabbit_small', name: 'Kelinci Kecil', emoji: '🐇', tier: 'Common', price: 800, bonus: { type: 'xp_chat', value: 2 } },
    { id: 'snail', name: 'Siput', emoji: '🐌', tier: 'Common', price: 300, bonus: { type: 'farm_yield', value: 3 } },
    { id: 'ladybug', name: 'Kumbang', emoji: '🐞', tier: 'Common', price: 300, bonus: { type: 'farm_speed', value: 2 } },
    { id: 'ant', name: 'Semut Pekerja', emoji: '🐜', tier: 'Common', price: 200, bonus: { type: 'xp_all', value: 1 } },
    { id: 'bee', name: 'Lebah', emoji: '🐝', tier: 'Common', price: 600, bonus: { type: 'farm_yield', value: 4 } },
    { id: 'butterfly_pet', name: 'Kupu-kupu', emoji: '🦋', tier: 'Common', price: 700, bonus: { type: 'quest_reward', value: 2 } },
    { id: 'hedgehog', name: 'Landak', emoji: '🦔', tier: 'Common', price: 800, bonus: { type: 'money_all', value: 2 } },
    { id: 'squirrel', name: 'Tupai', emoji: '🐿️', tier: 'Common', price: 600, bonus: { type: 'fish_luck', value: 2 } },
    { id: 'parrot', name: 'Burung Beo', emoji: '🦜', tier: 'Common', price: 900, bonus: { type: 'xp_chat', value: 3 } },
    { id: 'penguin_small', name: 'Penguin Kecil', emoji: '🐧', tier: 'Common', price: 800, bonus: { type: 'money_chat', value: 3 } },
    { id: 'koala', name: 'Koala', emoji: '🐨', tier: 'Common', price: 900, bonus: { type: 'xp_all', value: 2 } },
    { id: 'pig', name: 'Babi Mini', emoji: '🐷', tier: 'Common', price: 700, bonus: { type: 'money_all', value: 3 } },
    { id: 'sheep', name: 'Domba', emoji: '🐑', tier: 'Common', price: 600, bonus: { type: 'farm_yield', value: 3 } },
    { id: 'cow_mini', name: 'Sapi Mini', emoji: '🐄', tier: 'Common', price: 800, bonus: { type: 'farm_speed', value: 3 } },
    { id: 'monkey', name: 'Monyet', emoji: '🐒', tier: 'Common', price: 900, bonus: { type: 'event_luck', value: 3 } },
    // UNCOMMON (25 pets)
    { id: 'rabbit', name: 'Kelinci Anggora', emoji: '🐰', tier: 'Uncommon', price: 5000, bonus: { type: 'money_all', value: 5 } },
    { id: 'fox', name: 'Rubah', emoji: '🦊', tier: 'Uncommon', price: 8000, bonus: { type: 'xp_all', value: 5 } },
    { id: 'owl', name: 'Burung Hantu', emoji: '🦉', tier: 'Uncommon', price: 7000, bonus: { type: 'quest_reward', value: 8 } },
    { id: 'otter', name: 'Berang-berang', emoji: '🦦', tier: 'Uncommon', price: 6000, bonus: { type: 'fish_luck', value: 5 } },
    { id: 'deer', name: 'Rusa', emoji: '🦌', tier: 'Uncommon', price: 7000, bonus: { type: 'farm_speed', value: 7 } },
    { id: 'raccoon', name: 'Rakun', emoji: '🦝', tier: 'Uncommon', price: 6000, bonus: { type: 'money_chat', value: 6 } },
    { id: 'flamingo', name: 'Flamingo', emoji: '🦩', tier: 'Uncommon', price: 8000, bonus: { type: 'xp_chat', value: 6 } },
    { id: 'swan', name: 'Angsa', emoji: '🦢', tier: 'Uncommon', price: 7000, bonus: { type: 'money_all', value: 5 } },
    { id: 'peacock', name: 'Merak', emoji: '🦚', tier: 'Uncommon', price: 9000, bonus: { type: 'xp_all', value: 6 } },
    { id: 'dolphin', name: 'Lumba-lumba', emoji: '🐬', tier: 'Uncommon', price: 10000, bonus: { type: 'fish_luck', value: 7 } },
    { id: 'seal', name: 'Anjing Laut', emoji: '🦭', tier: 'Uncommon', price: 8000, bonus: { type: 'fish_luck', value: 6 } },
    { id: 'eagle', name: 'Elang', emoji: '🦅', tier: 'Uncommon', price: 9000, bonus: { type: 'event_luck', value: 7 } },
    { id: 'wolf_pup', name: 'Anak Serigala', emoji: '🐺', tier: 'Uncommon', price: 10000, bonus: { type: 'xp_all', value: 6 } },
    { id: 'panda_red', name: 'Panda Merah', emoji: '🐾', tier: 'Uncommon', price: 12000, bonus: { type: 'money_all', value: 6 } },
    { id: 'chameleon', name: 'Bunglon', emoji: '🦎', tier: 'Uncommon', price: 6000, bonus: { type: 'event_luck', value: 5 } },
    { id: 'axolotl', name: 'Axolotl', emoji: '🪷', tier: 'Uncommon', price: 10000, bonus: { type: 'fish_luck', value: 7 } },
    { id: 'jellyfish', name: 'Ubur-ubur', emoji: '🪼', tier: 'Uncommon', price: 7000, bonus: { type: 'fish_luck', value: 5 } },
    { id: 'bat', name: 'Kelelawar', emoji: '🦇', tier: 'Uncommon', price: 5000, bonus: { type: 'xp_chat', value: 5 } },
    { id: 'crane', name: 'Bangau', emoji: '🦩', tier: 'Uncommon', price: 8000, bonus: { type: 'farm_yield', value: 7 } },
    { id: 'husky', name: 'Husky', emoji: '🐕', tier: 'Uncommon', price: 9000, bonus: { type: 'xp_all', value: 5 } },
    { id: 'corgi', name: 'Corgi', emoji: '🐕', tier: 'Uncommon', price: 10000, bonus: { type: 'money_chat', value: 7 } },
    { id: 'cat_persian', name: 'Kucing Persia', emoji: '🐈', tier: 'Uncommon', price: 8000, bonus: { type: 'money_all', value: 5 } },
    { id: 'cat_siamese', name: 'Kucing Siam', emoji: '🐈‍⬛', tier: 'Uncommon', price: 9000, bonus: { type: 'xp_all', value: 5 } },
    { id: 'horse_mini', name: 'Kuda Poni', emoji: '🐴', tier: 'Uncommon', price: 11000, bonus: { type: 'farm_speed', value: 8 } },
    { id: 'goat', name: 'Kambing Gunung', emoji: '🐐', tier: 'Uncommon', price: 7000, bonus: { type: 'farm_yield', value: 6 } },
    // RARE (20 pets)
    { id: 'panda', name: 'Panda Giant', emoji: '🐼', tier: 'Rare', price: 20000, bonus: { type: 'money_xp', value: 8 } },
    { id: 'arctic_fox', name: 'Arctic Fox', emoji: '🦊', tier: 'Rare', price: 30000, bonus: { type: 'fish_luck', value: 10 } },
    { id: 'baby_dragon', name: 'Baby Dragon', emoji: '🐉', tier: 'Rare', price: 50000, bonus: { type: 'xp_all', value: 10 } },
    { id: 'unicorn', name: 'Unicorn', emoji: '🦄', tier: 'Rare', price: 40000, bonus: { type: 'all_reward', value: 10 } },
    { id: 'snow_leopard', name: 'Snow Leopard', emoji: '🐆', tier: 'Rare', price: 35000, bonus: { type: 'money_all', value: 10 } },
    { id: 'white_tiger', name: 'White Tiger', emoji: '🐯', tier: 'Rare', price: 45000, bonus: { type: 'event_luck', value: 12 } },
    { id: 'golden_eagle', name: 'Golden Eagle', emoji: '🦅', tier: 'Rare', price: 30000, bonus: { type: 'xp_all', value: 9 } },
    { id: 'crystal_deer', name: 'Crystal Deer', emoji: '🦌', tier: 'Rare', price: 35000, bonus: { type: 'farm_yield', value: 12 } },
    { id: 'shadow_wolf', name: 'Shadow Wolf', emoji: '🐺', tier: 'Rare', price: 40000, bonus: { type: 'money_all', value: 9 } },
    { id: 'moon_rabbit', name: 'Moon Rabbit', emoji: '🐇', tier: 'Rare', price: 30000, bonus: { type: 'quest_reward', value: 12 } },
    { id: 'fire_fox', name: 'Fire Fox', emoji: '🦊', tier: 'Rare', price: 45000, bonus: { type: 'xp_all', value: 10 } },
    { id: 'spirit_owl', name: 'Spirit Owl', emoji: '🦉', tier: 'Rare', price: 35000, bonus: { type: 'quest_reward', value: 10 } },
    { id: 'jade_turtle', name: 'Jade Turtle', emoji: '🐢', tier: 'Rare', price: 25000, bonus: { type: 'farm_speed', value: 12 } },
    { id: 'storm_hawk', name: 'Storm Hawk', emoji: '🦅', tier: 'Rare', price: 40000, bonus: { type: 'event_luck', value: 10 } },
    { id: 'ocean_horse', name: 'Kuda Laut Raksasa', emoji: '🐴', tier: 'Rare', price: 35000, bonus: { type: 'fish_luck', value: 12 } },
    { id: 'sakura_cat', name: 'Sakura Cat', emoji: '🐱', tier: 'Rare', price: 30000, bonus: { type: 'money_xp', value: 8 } },
    { id: 'thunder_hound', name: 'Thunder Hound', emoji: '🐶', tier: 'Rare', price: 40000, bonus: { type: 'xp_all', value: 10 } },
    { id: 'frost_bear', name: 'Frost Bear', emoji: '🐻‍❄️', tier: 'Rare', price: 45000, bonus: { type: 'money_all', value: 10 } },
    { id: 'vine_snake', name: 'Vine Snake', emoji: '🐍', tier: 'Rare', price: 25000, bonus: { type: 'farm_yield', value: 10 } },
    { id: 'ember_cat', name: 'Ember Cat', emoji: '🐈‍⬛', tier: 'Rare', price: 35000, bonus: { type: 'money_chat', value: 10 } },
    // EPIC (15 pets)
    { id: 'phoenix', name: 'Phoenix', emoji: '🔥', tier: 'Epic', price: 100000, bonus: { type: 'xp_all', value: 12 } },
    { id: 'ice_wolf', name: 'Ice Wolf', emoji: '❄️', tier: 'Epic', price: 120000, bonus: { type: 'money_all', value: 12 } },
    { id: 'thunder_tiger', name: 'Thunder Tiger', emoji: '⚡', tier: 'Epic', price: 150000, bonus: { type: 'event_luck', value: 15 } },
    { id: 'spirit_deer', name: 'Spirit Deer', emoji: '🌸', tier: 'Epic', price: 100000, bonus: { type: 'farm_speed', value: 15 } },
    { id: 'shadow_panther', name: 'Shadow Panther', emoji: '🐆', tier: 'Epic', price: 130000, bonus: { type: 'money_all', value: 13 } },
    { id: 'celestial_crane', name: 'Celestial Crane', emoji: '🕊️', tier: 'Epic', price: 110000, bonus: { type: 'xp_all', value: 13 } },
    { id: 'lava_salamander', name: 'Lava Salamander', emoji: '🦎', tier: 'Epic', price: 120000, bonus: { type: 'farm_yield', value: 15 } },
    { id: 'ocean_leviathan', name: 'Ocean Leviathan', emoji: '🐋', tier: 'Epic', price: 140000, bonus: { type: 'fish_luck', value: 15 } },
    { id: 'storm_dragon', name: 'Storm Dragon', emoji: '🐲', tier: 'Epic', price: 180000, bonus: { type: 'all_reward', value: 12 } },
    { id: 'crystal_phoenix', name: 'Crystal Phoenix', emoji: '💎', tier: 'Epic', price: 160000, bonus: { type: 'xp_all', value: 15 } },
    { id: 'void_serpent', name: 'Void Serpent', emoji: '🐍', tier: 'Epic', price: 150000, bonus: { type: 'event_luck', value: 14 } },
    { id: 'aurora_wolf', name: 'Aurora Wolf', emoji: '🌌', tier: 'Epic', price: 140000, bonus: { type: 'money_all', value: 14 } },
    { id: 'golden_kirin', name: 'Golden Kirin', emoji: '🦄', tier: 'Epic', price: 170000, bonus: { type: 'all_reward', value: 13 } },
    { id: 'nightmare_horse', name: 'Nightmare Horse', emoji: '🐴', tier: 'Epic', price: 130000, bonus: { type: 'xp_all', value: 14 } },
    { id: 'ancient_tortoise', name: 'Ancient Tortoise', emoji: '🐢', tier: 'Epic', price: 100000, bonus: { type: 'farm_speed', value: 18 } },
    // LEGENDARY (10 pets - NOT sold, only from eggs)
    { id: 'golden_dragon', name: 'Golden Dragon', emoji: '🐲', tier: 'Legendary', price: 0, bonus: { type: 'all_reward', value: 20 } },
    { id: 'celestial_butterfly', name: 'Celestial Butterfly', emoji: '🦋', tier: 'Legendary', price: 0, bonus: { type: 'money_xp', value: 15 } },
    { id: 'void_cat', name: 'Void Cat', emoji: '🐈‍⬛', tier: 'Legendary', price: 0, bonus: { type: 'money_all', value: 18 } },
    { id: 'cosmic_whale', name: 'Cosmic Whale', emoji: '🐳', tier: 'Legendary', price: 0, bonus: { type: 'fish_luck', value: 20 } },
    { id: 'divine_phoenix', name: 'Divine Phoenix', emoji: '🔥', tier: 'Legendary', price: 0, bonus: { type: 'xp_all', value: 20 } },
    { id: 'nature_spirit', name: 'Nature Spirit', emoji: '🌿', tier: 'Legendary', price: 0, bonus: { type: 'farm_yield', value: 25 } },
    { id: 'thunder_god_bird', name: 'Thunder God Bird', emoji: '⚡', tier: 'Legendary', price: 0, bonus: { type: 'event_luck', value: 20 } },
    { id: 'diamond_wolf', name: 'Diamond Wolf', emoji: '💎', tier: 'Legendary', price: 0, bonus: { type: 'money_all', value: 20 } },
    { id: 'eternal_serpent', name: 'Eternal Serpent', emoji: '🐍', tier: 'Legendary', price: 0, bonus: { type: 'all_reward', value: 18 } },
    { id: 'galaxy_horse', name: 'Galaxy Horse', emoji: '🌌', tier: 'Legendary', price: 0, bonus: { type: 'xp_all', value: 18 } },
    // MYTHIC (8 pets - EXTREMELY rare from eggs only)
    { id: 'world_tree_spirit', name: 'World Tree Spirit', emoji: '🌳', tier: 'Mythic', price: 0, bonus: { type: 'all_reward', value: 25 } },
    { id: 'time_dragon', name: 'Time Dragon', emoji: '⌛', tier: 'Mythic', price: 0, bonus: { type: 'all_reward', value: 25 } },
    { id: 'god_cat', name: 'God Cat (Bastet)', emoji: '👑', tier: 'Mythic', price: 0, bonus: { type: 'money_all', value: 25 } },
    { id: 'fenrir', name: 'Fenrir', emoji: '🐺', tier: 'Mythic', price: 0, bonus: { type: 'xp_all', value: 25 } },
    { id: 'quetzalcoatl', name: 'Quetzalcoatl', emoji: '🐉', tier: 'Mythic', price: 0, bonus: { type: 'all_reward', value: 25 } },
    { id: 'nine_tails', name: 'Nine-Tailed Fox', emoji: '🦊', tier: 'Mythic', price: 0, bonus: { type: 'event_luck', value: 25 } },
    { id: 'cerberus', name: 'Cerberus', emoji: '🐕', tier: 'Mythic', price: 0, bonus: { type: 'money_all', value: 25 } },
    { id: 'leviathan_pet', name: 'Leviathan', emoji: '🐋', tier: 'Mythic', price: 0, bonus: { type: 'fish_luck', value: 30 } }
];

const PET_FOODS = [
    { id: 'snack', name: 'Snack Biasa', emoji: '🍖', price: 30, hunger: 15, happiness: 5 },
    { id: 'premium_meat', name: 'Daging Premium', emoji: '🥩', price: 100, hunger: 30, happiness: 10 },
    { id: 'cake', name: 'Kue Spesial', emoji: '🎂', price: 200, hunger: 20, happiness: 25 },
    { id: 'feast', name: 'Feast Mewah', emoji: '🍗', price: 500, hunger: 50, happiness: 30 },
    { id: 'mythic_food', name: 'Makanan Mitik', emoji: '⭐', price: 1500, hunger: 100, happiness: 50 }
];

const PET_EGGS = [
    { id: 'common_egg', name: 'Common Egg', emoji: '🥚', price: 2000, rates: { Common: 60, Uncommon: 30, Rare: 10 } },
    { id: 'rare_egg', name: 'Rare Egg', emoji: '🥚', price: 10000, rates: { Uncommon: 35, Rare: 40, Epic: 20, Legendary: 5 } },
    { id: 'legendary_egg', name: 'Legendary Egg', emoji: '🥚', price: 50000, rates: { Rare: 25, Epic: 40, Legendary: 25, Mythic: 10 } },
    { id: 'mythic_egg', name: 'Mythic Egg', emoji: '🌟', price: 150000, rates: { Epic: 30, Legendary: 45, Mythic: 25 } }
];

const PET_CLASSES = ['warrior', 'tank', 'mage', 'ranger', 'healer'];
const PET_ELEMENTS = ['fire', 'water', 'nature', 'electric', 'dark', 'light'];
const ELEMENT_ADVANTAGE = { fire: 'nature', water: 'fire', nature: 'water', electric: 'water', dark: 'light', light: 'dark' };

const DUNGEON_TIERS = [
    { id: 'forest', name: '🌿 Hutan Pemula', minLevel: 1, waves: 3, monsterHp: [50,70,100], monsterAtk: [8,10,15], reward: [30,100], exp: 5, cooldown: 60000 },
    { id: 'cave', name: '🏔️ Gua Batu', minLevel: 10, waves: 4, monsterHp: [100,130,160,200], monsterAtk: [15,18,22,28], reward: [80,250], exp: 10, cooldown: 90000 },
    { id: 'volcano', name: '🌋 Gunung Api', minLevel: 25, waves: 5, monsterHp: [200,250,300,350,450], monsterAtk: [25,30,35,40,50], reward: [150,450], exp: 18, cooldown: 120000 },
    { id: 'castle', name: '🏰 Kastil Gelap', minLevel: 50, waves: 6, monsterHp: [400,500,600,700,800,1000], monsterAtk: [40,50,55,60,70,85], reward: [300,800], exp: 28, cooldown: 180000 },
    { id: 'void', name: '🌌 Void Realm', minLevel: 100, waves: 7, monsterHp: [800,1000,1200,1400,1600,1800,2500], monsterAtk: [70,80,90,100,110,120,150], reward: [500,1500], exp: 40, cooldown: 300000 }
];

const BOSS_LIST = [
    { id: 'dragon', name: '🐲 Dragon Lord', minLevel: 20, hp: 8000, atk: 60, def: 30, reward: [800, 2000], exp: 50 },
    { id: 'demon', name: '👹 Demon King', minLevel: 50, hp: 15000, atk: 90, def: 50, reward: [1500, 3500], exp: 80 },
    { id: 'void_emp', name: '🌑 Void Emperor', minLevel: 100, hp: 30000, atk: 130, def: 70, reward: [3000, 6000], exp: 120 },
    { id: 'ancient', name: '☠️ Ancient God', minLevel: 150, hp: 50000, atk: 180, def: 100, reward: [5000, 10000], exp: 200 }
];

const RELIC_NAMES = {
    weapon: ['Rusty Sword', 'Iron Blade', 'Fire Sword', 'Crystal Dagger', 'Shadow Blade', 'Void Katana', 'Divine Axe', 'Thunder Lance'],
    armor: ['Leather Armor', 'Iron Shield', 'Crystal Armor', 'Shadow Cloak', 'Void Barrier', 'Divine Plate'],
    accessory: ['Speed Ring', 'Crit Necklace', 'Power Gem', 'Shadow Pendant', 'Void Orb', 'Divine Crown']
};

function generatePetStats(tier) {
    const ranges = { Common:[60,100,10,25,5,15,5,12,3,8], Uncommon:[80,130,15,30,8,18,7,15,4,10], Rare:[100,160,20,40,10,25,10,20,5,12], Epic:[130,200,30,55,15,35,12,25,7,15], Legendary:[160,250,40,70,20,45,15,30,8,18], Mythic:[200,300,50,85,25,55,18,35,10,20] };
    const r = ranges[tier] || ranges['Common'];
    return { hp: getRandomInt(r[0],r[1]), atk: getRandomInt(r[2],r[3]), def: getRandomInt(r[4],r[5]), spd: getRandomInt(r[6],r[7]), crit: getRandomInt(r[8],r[9]) };
}

function simulateBattle(pet, petDef, enemies) {
    let petHp = pet.hp + (pet.level * 3);
    const petAtk = pet.atk + (pet.level * 1);
    const petDef2 = pet.def + Math.floor(pet.level * 0.5);
    const petSpd = pet.spd;
    const petCrit = pet.crit;
    let log = [], wave = 0, alive = true;
    
    for (const enemy of enemies) {
        wave++;
        let enemyHp = enemy.hp;
        let round = 0;
        log.push(`**━━ Wave ${wave} ━━** (Monster HP: ${enemyHp})`);
        while (petHp > 0 && enemyHp > 0 && round < 20) {
            round++;
            // Pet attacks
            let dmg = Math.max(1, petAtk - Math.floor(enemy.def || 0));
            if (Math.random() * 100 < petCrit) { dmg = Math.floor(dmg * 2); log.push(`> ${petDef.emoji} **CRIT!** → Monster: -${dmg} HP`); }
            else log.push(`> ${petDef.emoji} ATK → Monster: -${dmg} HP`);
            enemyHp -= dmg;
            if (enemyHp <= 0) { log.push(`> ✅ Monster defeated!`); break; }
            // Monster attacks
            let eDmg = Math.max(1, enemy.atk - petDef2);
            petHp -= eDmg;
            log.push(`> 👹 Monster ATK → ${pet.name}: -${eDmg} HP (${Math.max(0,petHp)} left)`);
        }
        if (petHp <= 0) { alive = false; log.push(`> 💀 **${pet.name} kalah!**`); break; }
    }
    return { alive, remainingHp: Math.max(0, petHp), log: log.slice(-15) }; // Last 15 lines
}

function simulatePvP(pet1, pet1Def, pet2, pet2Def) {
    let hp1 = pet1.hp + (pet1.level * 3), hp2 = pet2.hp + (pet2.level * 3);
    const atk1 = pet1.atk + pet1.level, atk2 = pet2.atk + pet2.level;
    const def1 = pet1.def + Math.floor(pet1.level*0.5), def2 = pet2.def + Math.floor(pet2.level*0.5);
    let log = [], round = 0;
    // SPD determines who goes first
    const first = pet1.spd >= pet2.spd ? 1 : 2;
    while (hp1 > 0 && hp2 > 0 && round < 30) {
        round++;
        if (first === 1 || round > 1) {
            let dmg = Math.max(1, atk1 - def2);
            if (Math.random()*100 < pet1.crit) { dmg *= 2; log.push(`> ${pet1Def.emoji} **CRIT!** → ${pet2.name}: -${dmg}`); } else log.push(`> ${pet1Def.emoji} ATK → ${pet2.name}: -${dmg}`);
            hp2 -= dmg;
            if (hp2 <= 0) break;
        }
        let dmg2 = Math.max(1, atk2 - def1);
        if (Math.random()*100 < pet2.crit) { dmg2 *= 2; log.push(`> ${pet2Def.emoji} **CRIT!** → ${pet1.name}: -${dmg2}`); } else log.push(`> ${pet2Def.emoji} ATK → ${pet1.name}: -${dmg2}`);
        hp1 -= dmg2;
    }
    return { winner: hp1 > 0 ? 1 : 2, hp1: Math.max(0,hp1), hp2: Math.max(0,hp2), log: log.slice(-12) };
}

const PET_LEVEL_MULTIPLIERS = [1.0, 1.0, 1.0, 1.0, 1.0, 1.2, 1.2, 1.2, 1.2, 1.2, 1.5, 1.5, 1.5, 1.5, 1.5, 1.8, 1.8, 1.8, 1.8, 1.8, 2.0, 2.0, 2.0, 2.0, 2.0, 2.5, 2.5, 2.5, 2.5, 2.5, 3.0];

function getPetData(guildId, userId) {
    return db.prepare('SELECT * FROM pets WHERE guildId = ? AND userId = ? AND active = 1').get(guildId, userId);
}
function getAllPets(guildId, userId) {
    return db.prepare('SELECT * FROM pets WHERE guildId = ? AND userId = ?').all(guildId, userId);
}
const PET_SKILL_MILESTONES = [
    { level: 20, skill: { type: 'money_all', value: 2, name: '+2% Money' } },
    { level: 50, skill: { type: 'xp_all', value: 2, name: '+2% XP' } },
    { level: 100, skill: { type: 'fish_luck', value: 3, name: '+3% Fish Luck' } },
    { level: 200, skill: { type: 'farm_yield', value: 5, name: '+5% Farm' } }
];

function getPetSkillBonus(guildId, userId, bonusType) {
    const pet = getPetData(guildId, userId);
    if (!pet || pet.hunting_until > Date.now()) return 0; // No bonus during hunt
    let total = 0;
    for (const ms of PET_SKILL_MILESTONES) {
        if (pet.level >= ms.level && (ms.skill.type === bonusType || ms.skill.type === 'all_reward')) {
            total += ms.skill.value;
        }
    }
    return total;
}

function getExpNeeded(level) {
    if (level <= 20) return 80;
    if (level <= 50) return 150;
    if (level <= 100) return 300;
    return 500;
}

function addPetExp(guildId, userId, amount) {
    const pet = getPetData(guildId, userId);
    if (!pet) return null;
    if (pet.level >= 200) return { leveledUp: false, newLevel: 200, newExp: 0, newSkill: null, petName: pet.name };
    let newExp = pet.exp + amount;
    let newLevel = pet.level;
    let leveledUp = false;
    let expNeeded = getExpNeeded(newLevel);
    while (newExp >= expNeeded && newLevel < 200) {
        newExp -= expNeeded;
        newLevel++;
        leveledUp = true;
        expNeeded = getExpNeeded(newLevel); // recalculate for new level
    }
    if (newLevel >= 200) { newLevel = 200; newExp = 0; }
    db.prepare('UPDATE pets SET exp = ?, level = ? WHERE id = ?').run(newExp, newLevel, pet.id);
    // Check if hit a skill milestone
    let newSkill = null;
    if (leveledUp) {
        for (const ms of PET_SKILL_MILESTONES) {
            if (newLevel >= ms.level && pet.level < ms.level) { newSkill = ms; break; }
        }
    }
    return { leveledUp, newLevel, newExp, newSkill, petName: pet.name };
}

function getPetBonus(guildId, userId, bonusType) {
    const pet = getPetData(guildId, userId);
    if (!pet) return 0;
    if (pet.hunting_until && pet.hunting_until > Date.now()) return 0; // No bonus during hunt
    const petDef = PET_DATA.find(p => p.id === pet.petId);
    if (!petDef) return 0;
    if (pet.happiness < 30 || pet.hunger < 10 || pet.status === 'sick') return 0;
    if (petDef.bonus.type !== bonusType && petDef.bonus.type !== 'all_reward' && petDef.bonus.type !== 'money_xp') return 0;
    const lvlMult = PET_LEVEL_MULTIPLIERS[Math.min(pet.level, 30)] || 1.0;
    let baseValue = petDef.bonus.value;
    if (petDef.bonus.type === 'all_reward' || petDef.bonus.type === 'money_xp') {
        if (bonusType === petDef.bonus.type || bonusType === 'money_all' || bonusType === 'xp_all') baseValue = petDef.bonus.value;
        else baseValue = Math.floor(petDef.bonus.value * 0.7);
    }
    return Math.floor(baseValue * lvlMult * 0.4);
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
    // --- FARMING ---
    { id: 'farm_first', name: 'Petani Baru', emoji: '🌱', desc: 'Panen pertama kali', category: 'Farming', reward: 100 },
    { id: 'farm_50', name: 'Green Thumb', emoji: '🌿', desc: 'Panen 50 kali', category: 'Farming', reward: 500 },
    { id: 'farm_200', name: 'Farmer Pro', emoji: '🌳', desc: 'Panen 200 kali', category: 'Farming', reward: 1500 },
    { id: 'farm_500', name: 'Agriculture King', emoji: '👑', desc: 'Panen 500 kali', category: 'Farming', reward: 5000 },
    { id: 'farm_craft_10', name: 'Home Cook', emoji: '🍳', desc: 'Craft 10 produk', category: 'Farming', reward: 300 },
    { id: 'farm_craft_50', name: 'Master Chef', emoji: '👨‍🍳', desc: 'Craft 50 produk', category: 'Farming', reward: 1500 },
    { id: 'farm_upgrade_max', name: 'Tuan Tanah', emoji: '🏰', desc: 'Upgrade lahan ke level 6 (max)', category: 'Farming', reward: 5000 },
    { id: 'farm_legendary', name: 'Crystal Grower', emoji: '💎', desc: 'Panen tanaman Legendary pertama', category: 'Farming', reward: 3000 },
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
    // --- BATTLE ---
    { id: 'dungeon_first', name: 'Dungeon Explorer', emoji: '🏰', desc: 'Clear dungeon pertama kali', category: 'Battle', reward: 200 },
    { id: 'dungeon_10', name: 'Dungeon Crawler', emoji: '🗡️', desc: 'Clear dungeon 10 kali', category: 'Battle', reward: 500 },
    { id: 'dungeon_50', name: 'Dungeon Master', emoji: '⚔️', desc: 'Clear dungeon 50 kali', category: 'Battle', reward: 2000 },
    { id: 'dungeon_100', name: 'Dungeon Lord', emoji: '👑', desc: 'Clear dungeon 100 kali', category: 'Battle', reward: 5000 },
    { id: 'boss_first', name: 'Boss Slayer', emoji: '👹', desc: 'Kalahkan boss pertama kali', category: 'Battle', reward: 300 },
    { id: 'boss_10', name: 'Boss Hunter', emoji: '🏹', desc: 'Kalahkan boss 10 kali', category: 'Battle', reward: 1000 },
    { id: 'boss_50', name: 'Boss Destroyer', emoji: '💀', desc: 'Kalahkan boss 50 kali', category: 'Battle', reward: 3000 },
    { id: 'pvp_first', name: 'First Blood', emoji: '🩸', desc: 'Menang PvP pertama kali', category: 'Battle', reward: 150 },
    { id: 'pvp_10', name: 'Fighter', emoji: '🥊', desc: 'Menang PvP 10 kali', category: 'Battle', reward: 500 },
    { id: 'pvp_50', name: 'Champion', emoji: '🏆', desc: 'Menang PvP 50 kali', category: 'Battle', reward: 2000 },
    { id: 'pvp_100', name: 'Warlord', emoji: '⚡', desc: 'Menang PvP 100 kali', category: 'Battle', reward: 5000 },
    { id: 'refine_10', name: 'Blacksmith', emoji: '🔨', desc: 'Refine relic 10 kali (sukses)', category: 'Battle', reward: 500 },
    { id: 'refine_max', name: 'Master Refiner', emoji: '✨', desc: 'Refine relic ke +20 (MAX)', category: 'Battle', reward: 5000 },
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
    // --- FARMING ---
    if (context.type === 'farm_harvest') {
        const harvests = getUserStat(guildId, userId, 'total_harvests');
        if (harvests >= 1) checks.push('farm_first');
        if (harvests >= 50) checks.push('farm_50');
        if (harvests >= 200) checks.push('farm_200');
        if (harvests >= 500) checks.push('farm_500');
        if (context.legendary) checks.push('farm_legendary');
    }
    if (context.type === 'farm_craft') {
        const crafts = getUserStat(guildId, userId, 'total_crafts');
        if (crafts >= 10) checks.push('farm_craft_10');
        if (crafts >= 50) checks.push('farm_craft_50');
    }
    if (context.type === 'farm_upgrade_max') checks.push('farm_upgrade_max');
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

    // --- BATTLE (Dungeon Clear) ---
    if (context.type === 'dungeon_clear') {
        const dungeonClears = getUserStat(guildId, userId, 'dungeon_clears');
        if (dungeonClears >= 1) checks.push('dungeon_first');
        if (dungeonClears >= 10) checks.push('dungeon_10');
        if (dungeonClears >= 50) checks.push('dungeon_50');
        if (dungeonClears >= 100) checks.push('dungeon_100');
    }
    // --- BATTLE (Boss Kill) ---
    if (context.type === 'boss_kill') {
        const bossKills = getUserStat(guildId, userId, 'boss_kills');
        if (bossKills >= 1) checks.push('boss_first');
        if (bossKills >= 10) checks.push('boss_10');
        if (bossKills >= 50) checks.push('boss_50');
    }
    // --- BATTLE (PvP Wins) ---
    if (context.type === 'pvp_win') {
        const pvpWins = getUserStat(guildId, userId, 'pvp_wins');
        if (pvpWins >= 1) checks.push('pvp_first');
        if (pvpWins >= 10) checks.push('pvp_10');
        if (pvpWins >= 50) checks.push('pvp_50');
        if (pvpWins >= 100) checks.push('pvp_100');
    }
    // --- BATTLE (Refine) ---
    if (context.type === 'refine_success') {
        const refineCount = getUserStat(guildId, userId, 'refine_successes');
        if (refineCount >= 10) checks.push('refine_10');
        if (context.maxRefine) checks.push('refine_max');
    }

    for (const achId of checks) {
        await grantAchievement(guild, userId, achId);
    }
}


// ================= LOGIKA MINI EVENTS =================
const activeMiniEvents = new Map(); const guildMessageCounters = new Map(); const MINI_EVENT_TARGET = 30; 
const FISH_EVENT_TARGET = 100;
const guildFishEventCounters = new Map();
const activeFishEvents = new Map();
const activeBossParties = new Map();

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
        .setDescription('Sistem Ekonomi (Admin/Banker)')
        .addSubcommandGroup(group => group
            .setName('manage')
            .setDescription('Keamanan Tinggi: Sistem Kasir')
            .addSubcommand(sub => sub.setName('atur').setDescription('(Banker) Atur uang user').addStringOption(opt => opt.setName('action').setDescription('Aksi').setRequired(true).addChoices({name: 'Add', value: 'add'}, {name: 'Take', value: 'take'}, {name: 'Set', value: 'set'})).addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addIntegerOption(opt => opt.setName('jumlah').setDescription('Jumlah').setRequired(true)))
            .addSubcommand(sub => sub.setName('add_admin').setDescription('(OWNER) Beri izin mengelola uang').addUserOption(opt => opt.setName('user').setDescription('User yang diizinkan')).addRoleOption(opt => opt.setName('role').setDescription('Role yang diizinkan')))
            .addSubcommand(sub => sub.setName('remove_admin').setDescription('(OWNER) Cabut izin mengelola uang').addUserOption(opt => opt.setName('user').setDescription('User yang dicabut')).addRoleOption(opt => opt.setName('role').setDescription('Role yang dicabut')))
            .addSubcommand(sub => sub.setName('list_admin').setDescription('(OWNER) Lihat list banker aktif'))
        ),
    new SlashCommandBuilder().setName('shop').setDescription('Buka menu toko'),
    new SlashCommandBuilder().setName('daily').setDescription('🎁 Klaim hadiah harian (money + EXP + random item)'),
    new SlashCommandBuilder()
        .setName('economy')
        .setDescription('💰 Ekonomi & Games')
        .addSubcommand(sub => sub.setName('balance').setDescription('Cek saldo'))
        .addSubcommand(sub => sub.setName('coinflip').setDescription('Lempar koin (50/50)!').addIntegerOption(opt => opt.setName('taruhan').setDescription('Jumlah uang (Max: 500)').setRequired(true).setMinValue(10).setMaxValue(500)))
        .addSubcommand(sub => sub.setName('slot').setDescription('🎰 Slot Machine (max 25x!)').addIntegerOption(opt => opt.setName('taruhan').setDescription('Jumlah taruhan (10-1000)').setRequired(true).setMinValue(10).setMaxValue(1000)))
        .addSubcommand(sub => sub.setName('gift').setDescription('🎁 Kirim money ke player lain').addUserOption(opt => opt.setName('user').setDescription('Siapa yang mau dikasih?').setRequired(true)).addIntegerOption(opt => opt.setName('jumlah').setDescription('Jumlah money (Max: 10.000)').setRequired(true).setMinValue(1).setMaxValue(10000)))
        .addSubcommand(sub => sub.setName('redeem').setDescription('Klaim kode promo').addStringOption(opt => opt.setName('kode').setDescription('Masukkan kode voucher').setRequired(true)))
        .addSubcommand(sub => sub.setName('leaderboard').setDescription('🏆 Leaderboard Global').addStringOption(opt => opt.setName('kategori').setDescription('Pilih kategori').setRequired(false).addChoices({name:'💰 Money', value:'money'},{name:'📈 Level', value:'level'},{name:'🎣 Fishing', value:'fish'},{name:'🎣 Ikan Terberat', value:'fish_weight'},{name:'🌾 Farming', value:'farm'},{name:'🐾 Pet Level', value:'pet'},{name:'🔥 Streak', value:'streak'},{name:'🏆 Overall', value:'overall'}))),
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
    new SlashCommandBuilder()
        .setName('me')
        .setDescription('📋 Profil, Achievement, Inventory & Quest')
        .addSubcommand(sub => sub.setName('profile').setDescription('Lihat kartu profil').addUserOption(opt => opt.setName('user').setDescription('Pilih user').setRequired(false)))
        .addSubcommand(sub => sub.setName('achievement').setDescription('Lihat koleksi badge').addUserOption(opt => opt.setName('user').setDescription('Pilih user').setRequired(false)))
        .addSubcommand(sub => sub.setName('inventory').setDescription('🎒 Lihat item yang kamu punya'))
        .addSubcommand(sub => sub.setName('use').setDescription('Gunakan item dari inventory').addStringOption(opt => opt.setName('item').setDescription('Nama item yang mau dipakai').setRequired(true).setAutocomplete(true)))
        .addSubcommand(sub => sub.setName('quest').setDescription('Cek Misi Harian'))
        .addSubcommand(sub => sub.setName('streak').setDescription('Cek info streak'))
        .addSubcommand(sub => sub.setName('restore').setDescription('Pulihkan streak yang putus (Max 3x sebulan)')),
    new SlashCommandBuilder()
        .setName('farm')
        .setDescription('🌾 Sistem Farming / Kebun')
        .addSubcommand(sub => sub.setName('status').setDescription('Lihat status kebun'))
        .addSubcommand(sub => sub.setName('plant').setDescription('Tanam bibit').addStringOption(opt => opt.setName('bibit').setDescription('Pilih bibit').setRequired(true).setAutocomplete(true)))
        .addSubcommand(sub => sub.setName('water').setDescription('Siram semua tanaman'))
        .addSubcommand(sub => sub.setName('harvest').setDescription('Panen semua yang sudah matang'))
        .addSubcommand(sub => sub.setName('shop').setDescription('Beli bibit & pupuk'))
        .addSubcommand(sub => sub.setName('sell').setDescription('Jual semua hasil panen di storage'))
        .addSubcommand(sub => sub.setName('upgrade').setDescription('Upgrade lahan (tambah slot)'))
        .addSubcommand(sub => sub.setName('craft').setDescription('Craft resep dari hasil panen').addStringOption(opt => opt.setName('resep').setDescription('Pilih resep').setRequired(true).setAutocomplete(true)))
        .addSubcommand(sub => sub.setName('storage').setDescription('Lihat gudang hasil panen'))
.addSubcommand(sub => sub.setName('pupuk').setDescription('Berikan pupuk ke tanaman').addStringOption(opt => opt.setName('jenis').setDescription('Pilih jenis pupuk').setRequired(true).setAutocomplete(true)).addIntegerOption(opt => opt.setName('slot').setDescription('Nomor slot tanaman (dari /farm status)').setRequired(true))),
    new SlashCommandBuilder()
        .setName('pet')
        .setDescription('🐾 Sistem Pet / Companion')
        .addSubcommand(sub => sub.setName('info').setDescription('Lihat info pet aktif'))
        .addSubcommand(sub => sub.setName('adopt').setDescription('Adopt pet baru').addStringOption(opt => opt.setName('pet').setDescription('Pilih pet').setRequired(true).setAutocomplete(true)))
        .addSubcommand(sub => sub.setName('feed').setDescription('Kasih makan pet').addStringOption(opt => opt.setName('food').setDescription('Pilih makanan').setRequired(true).setAutocomplete(true)))
        .addSubcommand(sub => sub.setName('play').setDescription('Bermain dengan pet'))
        .addSubcommand(sub => sub.setName('shop').setDescription('Pet Shop - food, eggs'))
        .addSubcommand(sub => sub.setName('egg').setDescription('Buka Pet Egg').addStringOption(opt => opt.setName('tipe').setDescription('Jenis egg').setRequired(true).setAutocomplete(true)))
        .addSubcommand(sub => sub.setName('collection').setDescription('Lihat semua pet yang dimiliki'))
        .addSubcommand(sub => sub.setName('swap').setDescription('Ganti pet aktif').addIntegerOption(opt => opt.setName('id').setDescription('ID pet (dari /pet collection)').setRequired(true)))
        .addSubcommand(sub => sub.setName('rename').setDescription('Ganti nama pet (max 10 char)').addStringOption(opt => opt.setName('nama').setDescription('Nama baru (max 10)').setRequired(true).setMaxLength(10)))
        .addSubcommand(sub => sub.setName('hunt').setDescription('Kirim pet berburu (30-60 menit, buff mati saat hunt)'))
        .addSubcommand(sub => sub.setName('release').setDescription('Lepaskan pet (tidak bisa undo!)').addIntegerOption(opt => opt.setName('id').setDescription('ID pet').setRequired(true)))
        .addSubcommand(sub => sub.setName('refine').setDescription('📿 Refine relic (+1 upgrade)').addStringOption(opt => opt.setName('slot').setDescription('Slot relic').setRequired(true).addChoices({name:'⚔️ Weapon', value:'weapon'},{name:'🛡️ Armor', value:'armor'},{name:'💍 Accessory', value:'accessory'})))
        .addSubcommand(sub => sub.setName('dungeon').setDescription('🏰 Dungeon - Lawan monster NPC').addStringOption(opt => opt.setName('tier').setDescription('Pilih dungeon').setRequired(true).setAutocomplete(true)))
        .addSubcommandGroup(group => group
            .setName('boss')
            .setDescription('👹 Boss Battle (Party/Solo)')
            .addSubcommand(sub => sub.setName('create').setDescription('Buat party untuk lawan boss').addStringOption(opt => opt.setName('boss').setDescription('Pilih boss').setRequired(true).setAutocomplete(true)))
            .addSubcommand(sub => sub.setName('start').setDescription('Mulai battle (party leader only)'))
            .addSubcommand(sub => sub.setName('solo').setDescription('Solo lawan boss').addStringOption(opt => opt.setName('boss').setDescription('Pilih boss').setRequired(true).setAutocomplete(true)))
            .addSubcommand(sub => sub.setName('list').setDescription('Lihat daftar boss'))
        ),
    new SlashCommandBuilder().setName('battle').setDescription('⚔️ Battle PvP - Lawan pet player lain').addUserOption(opt => opt.setName('lawan').setDescription('Siapa yang mau dilawan?').setRequired(true)).addIntegerOption(opt => opt.setName('taruhan').setDescription('Taruhan money (0 = tanpa taruhan)').setRequired(false)),
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
        .setDescription('Sistem Api Harian (Admin)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub.setName('setting').setDescription('(Khusus Admin) Atur fitur streak').addStringOption(opt => opt.setName('status').setDescription('Nyalakan/Matikan sistem?').setRequired(true).addChoices({name: 'Nyala (Enable)', value: 'true'}, {name: 'Mati (Disable)', value: 'false'})).addStringOption(opt => opt.setName('autonick').setDescription('Auto ganti nickname ada apinya?').setRequired(true).addChoices({name: 'Ya', value: 'true'}, {name: 'Tidak', value: 'false'})).addIntegerOption(opt => opt.setName('min_hari').setDescription('Butuh berapa hari berturut-turut untuk dapat emoji?').setRequired(true)).addStringOption(opt => opt.setName('emoji').setDescription('Emoji yang ditampilkan (Default: 🔥)').setRequired(false)))
        .addSubcommand(sub => sub.setName('admin_set').setDescription('(Khusus Admin) Atur jumlah streak user').addUserOption(opt => opt.setName('user').setDescription('Pilih user').setRequired(true)).addIntegerOption(opt => opt.setName('jumlah').setDescription('Jumlah streak baru').setRequired(true)))
        .addSubcommand(sub => sub.setName('admin_reset').setDescription('(Khusus Admin) Hapus/Reset streak user ke 0').addUserOption(opt => opt.setName('user').setDescription('Pilih user').setRequired(true)))
        .addSubcommand(sub => sub.setName('admin_restore').setDescription('(Khusus Admin) Pulihkan streak user tanpa batasan').addUserOption(opt => opt.setName('user').setDescription('Pilih user').setRequired(true))),
    new SlashCommandBuilder().setName('menu').setDescription('📱 Buka panel navigasi utama bot')
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

    // Pet passive EXP from chatting (every 5 min)
    const petExpKey = `pet_exp_${guildId}_${message.author.id}`;
    if (!fishCooldowns.has(petExpKey) || Date.now() > fishCooldowns.get(petExpKey)) {
        fishCooldowns.set(petExpKey, Date.now() + 120000);
        addPetExp(guildId, message.author.id, 2);
    }

    const cdKey = `${guildId}_${message.author.id}`;
    if (!chatCooldowns.has(cdKey)) { await addXpAndMoney(message.member, 'chat'); chatCooldowns.add(cdKey); setTimeout(() => chatCooldowns.delete(cdKey), getConf(guildId, 'chat_cooldown', 60) * 1000); }

    // --- PET HUNGER/HAPPY DECAY (setiap 10 menit per user) ---
    const petDecayKey = `pet_decay_${guildId}_${message.author.id}`;
    if (!fishCooldowns.has(petDecayKey) || Date.now() > fishCooldowns.get(petDecayKey)) {
        fishCooldowns.set(petDecayKey, Date.now() + 600000); // 10 menit
        const activePet = db.prepare('SELECT * FROM pets WHERE guildId = ? AND userId = ? AND active = 1').get(guildId, message.author.id);
        if (activePet && activePet.status !== 'dead') {
            const newHunger = Math.max(0, activePet.hunger - 3);
            const newHappy = Math.max(0, activePet.happiness - 2);
            let newStatus = activePet.status;
            if (newHunger <= 0 && activePet.status !== 'sick') newStatus = 'sick';
            db.prepare('UPDATE pets SET hunger = ?, happiness = ?, status = ? WHERE id = ?').run(newHunger, newHappy, newStatus, activePet.id);
            // Notify if pet is hungry or sick
            if (newHunger <= 20 && newHunger > 0) {
                message.reply({ content: `🐾 <@${message.author.id}> Pet kamu **${activePet.name}** lapar! (🍖 ${newHunger}%) Kasih makan dengan \`/pet feed\`!` }).then(msg => { setTimeout(() => msg.delete().catch(() => {}), 10000); }).catch(() => {});
            } else if (newStatus === 'sick' && activePet.status !== 'sick') {
                message.reply({ content: `🐾⚠️ <@${message.author.id}> Pet kamu **${activePet.name}** SAKIT! 🤒 Segera kasih makan!` }).then(msg => { setTimeout(() => msg.delete().catch(() => {}), 15000); }).catch(() => {});
            }
        }
    }

    // --- FARM NOTIFICATION (setiap 5 menit per user) ---
    const farmNotifKey = `farm_notif_${guildId}_${message.author.id}`;
    if (!fishCooldowns.has(farmNotifKey) || Date.now() > fishCooldowns.get(farmNotifKey)) {
        fishCooldowns.set(farmNotifKey, Date.now() + 300000); // 5 menit cooldown
        const farmPlots = db.prepare('SELECT * FROM farm_plots WHERE guildId = ? AND userId = ?').all(guildId, message.author.id);
        if (farmPlots.length > 0) {
            let readyCount = 0, needWaterCount = 0, deadCount = 0;
            for (const plot of farmPlots) {
                const crop = FARM_CROPS.find(c => c.id === plot.cropId);
                if (!crop) continue;
                const fert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer) || FARM_FERTILIZERS[0];
                const growTime = crop.time * (1 - fert.speedBonus) * 60000;
                const elapsed = Date.now() - plot.plantedAt;
                const dryTime = Date.now() - plot.wateredAt;
                const deadThreshold = growTime * 2.5;
                
                if (plot.status === 'dead' || dryTime > deadThreshold) { deadCount++; if (plot.status !== 'dead') db.prepare('UPDATE farm_plots SET status = ? WHERE id = ?').run('dead', plot.id); }
                else if (elapsed >= growTime) readyCount++;
                else if (dryTime > growTime * 1.2) needWaterCount++;
            }
            
            let notifParts = [];
            if (readyCount > 0) notifParts.push(`✅ **${readyCount} tanaman** siap dipanen! (\`/farm harvest\`)`);
            if (needWaterCount > 0) notifParts.push(`💧 **${needWaterCount} tanaman** butuh disiram! (\`/farm water\`)`);
            if (deadCount > 0) notifParts.push(`☠️ **${deadCount} tanaman** mati karena tidak disiram`);
            
            if (notifParts.length > 0) {
                message.reply({ content: `🌾 <@${message.author.id}> **Farm Reminder:**\n${notifParts.join('\n')}`, allowedMentions: { users: [message.author.id] } }).then(msg => { setTimeout(() => msg.delete().catch(() => {}), 15000); }).catch(() => {});
            }
        }
    }
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

    // Autocomplete handler for /use and /farm
    if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'use' || (interaction.commandName === 'me' && interaction.options.getSubcommand(false) === 'use')) {
            const ownedItems = db.prepare('SELECT * FROM item_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, interaction.user.id);
            const choices = ownedItems.map(inv => {
                const def = ITEMS.find(i => i.id === inv.itemId);
                if (!def) return null;
                return { name: `${def.emoji} ${def.name} (x${inv.quantity})`, value: def.id };
            }).filter(Boolean).slice(0, 25);
            return interaction.respond(choices);
        }
        if (interaction.commandName === 'farm') {
            const focused = interaction.options.getFocused(true);
            if (focused.name === 'bibit') {
                const choices = FARM_CROPS.map(c => ({ name: `${c.emoji} ${c.name} (${c.tier}) — 🪙${c.cost} | ${c.time}m`, value: c.id })).filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
                return interaction.respond(choices);
            }
            if (focused.name === 'resep') {
                const choices = FARM_RECIPES.map(r => ({ name: `${r.emoji} ${r.name} — Jual: 🪙${r.sellPrice}`, value: r.id })).filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
                return interaction.respond(choices);
            }
            if (focused.name === 'jenis') {
                const choices = FARM_FERTILIZERS.filter(f => f.id !== 'none').map(f => ({ name: `${f.emoji} ${f.name} — 🪙${f.cost} | -${Math.round(f.speedBonus*100)}% waktu`, value: f.id })).filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
                return interaction.respond(choices);
            }
        }
        if (interaction.commandName === 'pet') {
            const focused = interaction.options.getFocused(true);
            if (focused.name === 'pet') {
                const choices = PET_DATA.filter(p => p.price > 0).map(p => ({ name: `${p.emoji} ${p.name} (${p.tier}) — 🪙${p.price.toLocaleString('id-ID')}`, value: p.id })).filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
                return interaction.respond(choices);
            }
            if (focused.name === 'food') {
                const choices = PET_FOODS.map(f => ({ name: `${f.emoji} ${f.name} — 🪙${f.price} | +${f.hunger} hunger +${f.happiness} happy`, value: f.id })).filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
                return interaction.respond(choices);
            }
            if (focused.name === 'tipe') {
                const choices = PET_EGGS.map(e => ({ name: `${e.emoji} ${e.name} — 🪙${e.price.toLocaleString('id-ID')}`, value: e.id })).filter(c => c.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
                return interaction.respond(choices);
            }
            if (focused.name === 'tier') {
                const choices = DUNGEON_TIERS.map(d => ({ name: `${d.name} (Lv.${d.minLevel}+, ${d.waves} waves)`, value: d.id }));
                return interaction.respond(choices);
            }
            if (focused.name === 'boss') {
                const choices = BOSS_LIST.map(b => ({ name: `${b.name} (Lv.${b.minLevel}+, HP: ${b.hp.toLocaleString()})`, value: b.id }));
                return interaction.respond(choices);
            }
            return interaction.respond([]);
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
            const helpEmbed = new EmbedBuilder().setTitle('📖 Panduan Lengkap Bot').setColor('#5865F2').setDescription('Gunakan `/menu` untuk navigasi cepat dengan tombol!\n\n**Daftar Command:**').addFields(
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '💰 **EKONOMI** (`/economy`)', inline: false },
                { name: '\u200b', value: `> \`/economy balance\` — Cek saldo\n> \`/economy coinflip <taruhan>\` — Lempar koin 50/50\n> \`/economy slot <taruhan>\` — Slot machine (max 25x!)\n> \`/economy gift @user <jumlah>\` — Kirim money\n> \`/economy redeem <kode>\` — Tukar voucher\n> \`/economy leaderboard\` — Ranking global\n> \`/daily\` — Klaim hadiah harian\n> \`/shop\` — Toko lengkap`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🎣 **FISHING** (`/fish` + `/fishing`)', inline: false },
                { name: '\u200b', value: `> \`/fish\` — Lempar pancing\n> \`/fishing sell\` — Jual ikan\n> \`/fishing inventory\` — Lihat ikan\n> \`/fishing collection\` — Pokedex ikan\n> \`/fishing shop\` — Beli joran & umpan\n> \`/fishing stats\` — Statistik`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🌾 **FARMING** (`/farm`)', inline: false },
                { name: '\u200b', value: `> \`/farm status\` — Lihat kebun\n> \`/farm plant\` — Tanam bibit\n> \`/farm water\` — Siram\n> \`/farm harvest\` — Panen\n> \`/farm craft\` — Craft resep\n> \`/farm shop\` — Bibit & pupuk\n> \`/farm upgrade\` — Upgrade lahan`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🐾 **PET & BATTLE** (`/pet` + `/battle`)', inline: false },
                { name: '\u200b', value: `> \`/pet adopt/info/feed/play/hunt\` — Kelola pet\n> \`/pet egg <tipe>\` — Gacha pet\n> \`/pet dungeon <tier>\` — Lawan monster\n> \`/pet boss create/solo/list\` — Raid boss\n> \`/pet refine <slot>\` — Upgrade relic\n> \`/battle @user\` — PvP auto-battle`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '📋 **PROFIL & QUEST** (`/me`)', inline: false },
                { name: '\u200b', value: `> \`/me profile\` — Kartu profil\n> \`/me achievement\` — Koleksi badge\n> \`/me inventory\` — Lihat item\n> \`/me use <item>\` — Gunakan item\n> \`/me quest\` — Misi harian\n> \`/me streak\` — Info streak\n> \`/me restore\` — Pulihkan streak\n> \`/level rank\` — Cek XP & level`, inline: false },
                { name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🎮 **EVENTS & VOICE**', inline: false },
                { name: '\u200b', value: `> 🎮 **Mini-Event** muncul setiap 30 pesan\n> 🎣 **Fishing Tournament** setiap 100 pesan\n> 🎶 **Temp Voice** — Buat voice privat`, inline: false }
            );
            if (isAdmin) helpEmbed.addFields({ name: '━━━━━━━━━━━━━━━━━━━━━━', value: '🛡️ **ADMIN**', inline: false }, { name: '\u200b', value: `> \`/setting\` — Atur channels notifikasi\n> \`/admin_shop\` — Kelola toko\n> \`/tempvoice setup\` — Setup voice\n> \`/level setting\` — Atur XP\n> \`/money manage\` — Kelola uang user\n> \`/streak\` — Kelola streak user`, inline: false });
            helpEmbed.setFooter({ text: '💡 Tip: Gunakan /menu untuk navigasi dengan tombol!', iconURL: interaction.client.user.displayAvatarURL() }).setTimestamp();
            return interaction.reply({ embeds: [helpEmbed] });
        }

        // ================= MENU HUB =================
        if (command === 'menu') {
            const menuEmbed = new EmbedBuilder()
                .setTitle('📱 Menu Utama')
                .setColor('#5865F2')
                .setDescription(`Halo **${interaction.user.username}**! Pilih kategori di bawah:\n\n💰 **Economy** — Balance, Coinflip, Slot, Gift, Redeem\n🎣 **Fishing** — Mancing, Jual, Koleksi\n🌾 **Farming** — Tanam, Panen, Craft\n🐾 **Pet & Battle** — Pet, Dungeon, Boss, PvP\n📋 **Profil** — Profile, Achievement, Quest, Streak\n🛒 **Shop** — Beli item, rod, bibit, pet\n\n*Gunakan tombol di bawah untuk akses cepat!*`)
                .setFooter({ text: `💰 Saldo: ${userData.balance.toLocaleString('id-ID')} | Lv.${userData.level}` })
                .setTimestamp();
            
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('menu_economy').setLabel('💰 Economy').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('menu_fishing').setLabel('🎣 Fishing').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('menu_farming').setLabel('🌾 Farming').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('menu_pet').setLabel('🐾 Pet & Battle').setStyle(ButtonStyle.Primary)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('menu_profile').setLabel('📋 Profil').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('menu_shop').setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('menu_daily').setLabel('🎁 Daily').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('menu_quest').setLabel('📜 Quest').setStyle(ButtonStyle.Secondary)
            );
            return interaction.reply({ embeds: [menuEmbed], components: [row1, row2] });
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


        if (command === 'me' && subCmd === 'achievement') {
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
                const catIcon = { Social: '💬', Economy: '💰', Level: '📈', Streak: '🔥', Gambling: '🎰', Events: '🎮', Voice: '🎙️', Quest: '📜', Special: '✨', Fishing: '🎣', Farming: '🌾', Battle: '⚔️' }[cat] || '📁';
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
                const catIcon = { Social: '💬', Economy: '💰', Level: '📈', Streak: '🔥', Gambling: '🎰', Events: '🎮', Voice: '🎙️', Quest: '📜', Special: '✨', Fishing: '🎣', Farming: '🌾', Battle: '⚔️' }[cat] || '📁';
                const catAchs = ACHIEVEMENTS.filter(a => a.category === cat);
                const catUnlocked = catAchs.filter(a => unlockedIds.includes(a.id)).length;
                return new StringSelectMenuOptionBuilder().setLabel(`${cat} (${catUnlocked}/${catAchs.length})`).setValue(cat).setDescription(`Lihat detail achievement ${cat}`);
            }));
            return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
        }

        if (command === 'me' && subCmd === 'profile') {
            // VIEW (default)
            const targetUser = interaction.options.getUser('user') || interaction.user, targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!targetMember) return interaction.reply({content: 'User tidak ditemukan.', ephemeral: true});
            const tData = getOrCreateUser(guildId, targetUser.id), targetXp = (tData.level + 1) * 100, percent = Math.min(100, Math.max(0, Math.floor((tData.xp / targetXp) * 100))), progressBar = '▰'.repeat(Math.floor(percent / 10)) + '▱'.repeat(10 - Math.floor(percent / 10)), roles = targetMember.roles.cache.filter(r => r.name !== '@everyone').sort((a, b) => b.position - a.position).map(r => `<@&${r.id}>`);
            let displayRoles = roles.length > 0 ? roles.slice(0, 10).join(' • ') : '*Tidak ada role*'; if (roles.length > 10) displayRoles += ` *+${roles.length - 10} lainnya*`;
            const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, targetUser.id), streakCount = sData ? sData.count : 0, streakEmoji = getSetting(guildId, 'streak_emoji', '🔥');
            const userAchs = db.prepare('SELECT * FROM achievements WHERE guildId = ? AND userId = ? ORDER BY unlockedAt DESC').all(guildId, targetUser.id);
            const totalBadges = userAchs.length;
            let badgeDisplay = '';
            if (userAchs.length > 0) {
                badgeDisplay = userAchs.slice(0, 5).map(a => { const def = ACHIEVEMENTS.find(d => d.id === a.achievementId); return def ? `> ${def.emoji} **${def.name}** — *${def.desc}*` : ''; }).filter(Boolean).join('\n');
                if (totalBadges > 5) badgeDisplay += `\n> *...+${totalBadges - 5} badge lainnya*`;
            } else { badgeDisplay = '> *Belum ada badge.*'; }
            const fishCaught = getUserStat(guildId, targetUser.id, 'total_fish_caught');
            const slotWins = getUserStat(guildId, targetUser.id, 'slot_wins');
            const cfWins = getUserStat(guildId, targetUser.id, 'coinflip_wins');
            const harvests = getUserStat(guildId, targetUser.id, 'total_harvests');

            // Pet info for profile
            const activePet = getPetData(guildId, targetUser.id);
            const petInfo = activePet ? (() => { const pd = PET_DATA.find(p => p.id === activePet.petId); return pd ? `${pd.emoji} **${activePet.name}** (Lv.${activePet.level}) — *${pd.tier}*` : ''; })() : '*Belum punya pet*';

            const profileEmbed = new EmbedBuilder()
                .setAuthor({ name: `Kartu Profil | ${targetUser.username}`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
                .setColor('#2B2D31')
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
                .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
                .addFields(
                    { name: '📊 STATISTIK UTAMA', value: `> 🏅 **Level** \`${tData.level}\` — 💰 **Saldo** \`${tData.balance.toLocaleString('id-ID')}\` — ${streakEmoji} **Streak** \`${streakCount} Hari\`\n> \n> ✨ **Progress EXP**\n> \`${progressBar}\` **${percent}%** (\`${tData.xp.toLocaleString('id-ID')}/${targetXp.toLocaleString('id-ID')}\`)`, inline: false },
                    { name: `🏆 BADGE COLLECTION (${totalBadges}/${ACHIEVEMENTS.length})`, value: badgeDisplay, inline: false },
                    { name: '🎮 AKTIVITAS', value: `> 🎣 Ikan: **${fishCaught}** — 🎰 Slot: **${slotWins}** — 🪙 CF: **${cfWins}** — 🌾 Panen: **${harvests}**`, inline: false },
                    { name: '🐾 PET', value: `> ${petInfo}`, inline: false },
                    { name: '📅 INFO AKUN', value: `> 📥 Bergabung: <t:${Math.floor(targetMember.joinedTimestamp / 1000)}:D> — 📆 Dibuat: <t:${Math.floor(targetUser.createdTimestamp / 1000)}:D>`, inline: false },
                    { name: `🎭 Role [${roles.length}]`, value: displayRoles, inline: false }
                )
                .setFooter({ text: `ID: ${targetUser.id} | /achievement untuk badge | /pet info untuk pet`, iconURL: interaction.guild.iconURL() })
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


        if (command === 'economy' && subCmd === 'balance') return interaction.reply(`💰 Money: **${userData.balance.toLocaleString('id-ID')}**`);

        if (command === 'money') {
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

        if (command === 'economy' && subCmd === 'redeem') { const code = interaction.options.getString('kode').toUpperCase(); const voucher = db.prepare('SELECT * FROM vouchers WHERE guildId = ? AND code = ?').get(guildId, code); if (!voucher) return interaction.reply({ content: '❌ Kode tidak valid!', ephemeral: true }); if (voucher.current_uses >= voucher.max_uses) return interaction.reply({ content: '❌ Kuota habis!', ephemeral: true }); if (db.prepare('SELECT * FROM voucher_claims WHERE guildId = ? AND userId = ? AND code = ?').get(guildId, interaction.user.id, code)) return interaction.reply({ content: '❌ Sudah pernah ditukar!', ephemeral: true }); db.prepare('INSERT INTO voucher_claims (guildId, userId, code) VALUES (?, ?, ?)').run(guildId, interaction.user.id, code); db.prepare('UPDATE vouchers SET current_uses = current_uses + 1 WHERE guildId = ? AND code = ?').run(guildId, code); userData.balance += voucher.reward; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id); await checkAchievements(interaction.guild, interaction.user.id, { type: 'redeem' }); return interaction.reply(`🎉 **BERHASIL!** Dapat **${voucher.reward.toLocaleString('id-ID')} money** gratis!`); }

        if (command === 'me' && subCmd === 'quest') { const questChannelSetting = getSetting(guildId, 'quest_channel', null); if (questChannelSetting && interaction.channelId !== questChannelSetting) return interaction.reply({ content: `❌ Buka misi hanya di <#${questChannelSetting}>.`, ephemeral: true }); updateQuestProgress(guildId, interaction.user.id, 'dummy', 0); const row = db.prepare('SELECT * FROM daily_quests WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id), quests = JSON.parse(row.data); const embed = new EmbedBuilder().setTitle('📜 Papan Misi Harian').setColor('#2B2D31').setDescription('Selesaikan misi berikut!\n*(Reset 00:00 WIB)*'); const buttons = new ActionRowBuilder(); quests.forEach((q, i) => { const percent = Math.min(100, Math.floor((q.progress / q.target) * 100)), bar = '▰'.repeat(Math.floor(percent / 10)) + '▱'.repeat(10 - Math.floor(percent / 10)), status = q.claimed ? '✅ **SELESAI**' : `**${q.progress} / ${q.target}**`; embed.addFields({ name: `Misi ${i+1}`, value: `${q.desc}\n> 🪙 **${q.reward} Money**\n> \`${bar}\` ${status}`, inline: false }); const btn = new ButtonBuilder().setCustomId(`claim_quest_${i}`).setLabel(`Klaim ${i+1}`).setStyle(ButtonStyle.Success); if (q.progress < q.target || q.claimed) btn.setDisabled(true); buttons.addComponents(btn); }); return interaction.reply({ embeds: [embed], components: [buttons] }); }

        if (command === 'economy' && subCmd === 'leaderboard') {
            const kategori = interaction.options.getString('kategori') || 'overall';
            let data, title, desc = '';
            
            if (kategori === 'money') {
                title = '💰 Top Money';
                data = db.prepare('SELECT * FROM users WHERE guildId = ? ORDER BY balance DESC LIMIT 10').all(guildId);
                data.forEach((u, i) => { desc += `**${i+1}.** <@${u.userId}> — 🪙 **${u.balance.toLocaleString('id-ID')}**\n`; });
            } else if (kategori === 'level') {
                title = '📈 Top Level';
                data = db.prepare('SELECT * FROM users WHERE guildId = ? ORDER BY level DESC, xp DESC LIMIT 10').all(guildId);
                data.forEach((u, i) => { desc += `**${i+1}.** <@${u.userId}> — Lv.**${u.level}** (${u.xp} XP)\n`; });
            } else if (kategori === 'fish') {
                title = '🎣 Top Fisher';
                data = db.prepare("SELECT userId, stat_value FROM user_stats WHERE guildId = ? AND stat_key = 'total_fish_caught' ORDER BY stat_value DESC LIMIT 10").all(guildId);
                data.forEach((u, i) => { desc += `**${i+1}.** <@${u.userId}> — 🐟 **${u.stat_value}** ikan\n`; });
            } else if (kategori === 'fish_weight') {
                title = '🎣 Ikan Terberat';
                data = db.prepare('SELECT fi.*, fd.fishId FROM fish_inventory fi WHERE fi.guildId = ? ORDER BY fi.weight DESC LIMIT 10').all(guildId);
                data.forEach((u, i) => { const fishDef = FISH_DATA.find(f => f.id === u.fishId); desc += `**${i+1}.** <@${u.userId}> — ${fishDef ? fishDef.emoji : '🐟'} **${fishDef ? fishDef.name : '?'}** (${u.weight} kg) *${fishDef ? fishDef.tier : ''}*\n`; });
            } else if (kategori === 'farm') {
                title = '🌾 Top Farmer';
                data = db.prepare("SELECT userId, stat_value FROM user_stats WHERE guildId = ? AND stat_key = 'total_harvests' ORDER BY stat_value DESC LIMIT 10").all(guildId);
                data.forEach((u, i) => { desc += `**${i+1}.** <@${u.userId}> — 🌾 **${u.stat_value}** panen\n`; });
            } else if (kategori === 'pet') {
                title = '🐾 Top Pet Level';
                data = db.prepare('SELECT * FROM pets WHERE guildId = ? ORDER BY level DESC, exp DESC LIMIT 10').all(guildId);
                data.forEach((u, i) => { const petDef = PET_DATA.find(p => p.id === u.petId); desc += `**${i+1}.** <@${u.userId}> — ${petDef ? petDef.emoji : '🐾'} **${u.name}** Lv.**${u.level}** *(${petDef ? petDef.tier : '?'})*\n`; });
            } else if (kategori === 'streak') {
                title = '🔥 Top Streak';
                data = db.prepare('SELECT * FROM streaks WHERE guildId = ? ORDER BY count DESC LIMIT 10').all(guildId);
                data.forEach((u, i) => { desc += `**${i+1}.** <@${u.userId}> — 🔥 **${u.count}** hari\n`; });
            } else {
                title = '🏆 Overall Leaderboard';
                const users = db.prepare('SELECT * FROM users WHERE guildId = ?').all(guildId);
                const scored = users.map(u => {
                    const fishStat = db.prepare("SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = 'total_fish_caught'").get(guildId, u.userId);
                    const farmStat = db.prepare("SELECT stat_value FROM user_stats WHERE guildId = ? AND userId = ? AND stat_key = 'total_harvests'").get(guildId, u.userId);
                    const streakData = db.prepare('SELECT count FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, u.userId);
                    const score = (u.level * 100) + Math.floor(u.balance / 10) + ((fishStat ? fishStat.stat_value : 0) * 5) + ((farmStat ? farmStat.stat_value : 0) * 3) + ((streakData ? streakData.count : 0) * 10);
                    return { ...u, score, fish: fishStat ? fishStat.stat_value : 0, farm: farmStat ? farmStat.stat_value : 0, streak: streakData ? streakData.count : 0 };
                }).sort((a, b) => b.score - a.score).slice(0, 10);
                scored.forEach((u, i) => { desc += `**${i+1}.** <@${u.userId}> — ⭐ **${u.score.toLocaleString('id-ID')}** pts\n> Lv.${u.level} | 🪙${u.balance.toLocaleString('id-ID')} | 🐟${u.fish} | 🌾${u.farm} | 🔥${u.streak}\n`; });
            }
            if (!desc) desc = '*Belum ada data.*';
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle(title).setColor('#FFD700').setDescription(desc).setFooter({ text: '/leaderboard <kategori> untuk filter | Overall = combined score' }).setTimestamp()] });
        }

        if (command === 'daily') {
            const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
            if (userData.lastDaily === today) return interaction.reply({ content: '⏳ Sudah klaim hari ini! Tunggu besok (00:00 WIB).', ephemeral: true });
            
            // Base reward
            let moneyReward = 500;
            let petExpReward = 10;
            let bonusDesc = '';
            
            // Check Daily Doubler item
            const hasDoubler = getUserStat(guildId, interaction.user.id, 'daily_doubler_active') > 0;
            if (hasDoubler) { moneyReward *= 2; incrementUserStat(guildId, interaction.user.id, 'daily_doubler_active', -1); bonusDesc += '> 📅 **Daily Doubler** aktif! Money x2!\n'; }
            
            // Random bonus reward (30% chance item, 20% chance extra money, 50% normal)
            const roll = Math.random();
            let randomReward = '';
            if (roll < 0.15) {
                // Random item reward
                const possibleItems = ['mystery_box', 'lucky_charm', 'xp_booster_2x'];
                const wonItem = possibleItems[Math.floor(Math.random() * possibleItems.length)];
                const itemDef = ITEMS.find(i => i.id === wonItem);
                addItem(guildId, interaction.user.id, wonItem);
                randomReward = `\n> 🎁 **Bonus Item:** ${itemDef.emoji} ${itemDef.name}!`;
            } else if (roll < 0.35) {
                // Extra money
                const extra = getRandomInt(100, 500);
                moneyReward += extra;
                randomReward = `\n> 💰 **Bonus Money:** +${extra} extra!`;
            } else if (roll < 0.50) {
                // Extra pet EXP
                petExpReward += 15;
                randomReward = `\n> 🐾 **Bonus Pet EXP:** +15 extra!`;
            }
            
            userData.balance += moneyReward;
            db.prepare('UPDATE users SET balance = ?, lastDaily = ? WHERE guildId = ? AND userId = ?').run(userData.balance, today, guildId, interaction.user.id);
            incrementUserStat(guildId, interaction.user.id, 'total_dailies');
            addPetExp(guildId, interaction.user.id, petExpReward);
            await checkAchievements(interaction.guild, interaction.user.id, { type: 'daily' });
            
            const embed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle('🎁 Daily Reward!')
                .setDescription(`${bonusDesc}> 🪙 **Money:** +${moneyReward.toLocaleString('id-ID')}\n> 🐾 **Pet EXP:** +${petExpReward}\n> ✨ **XP Bonus:** +15${randomReward}\n\n> 💳 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**`)
                .setFooter({ text: 'Kembali lagi besok! | Streak aktif = bonus lebih besar' })
                .setTimestamp();
            
            // Bonus XP from daily
            const user = getOrCreateUser(guildId, interaction.user.id);
            user.xp += 15;
            db.prepare('UPDATE users SET xp = ? WHERE guildId = ? AND userId = ?').run(user.xp, guildId, interaction.user.id);
            
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'economy' && subCmd === 'coinflip') { if (activeCoinflips.has(interaction.user.id)) return interaction.reply({ content: '⏳ Tunggu koinmu mendarat!', ephemeral: true }); const taruhan = interaction.options.getInteger('taruhan'); if (userData.balance < taruhan) return interaction.reply({ content: `❌ Saldo kurang! 🪙 **${userData.balance.toLocaleString('id-ID')}**`, ephemeral: true }); activeCoinflips.add(interaction.user.id); db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(taruhan, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'total_coinflips'); await interaction.reply({ embeds: [new EmbedBuilder().setColor('#F1C40F').setDescription(`🪙 **Melempar koin...**\n> Taruhan: 🪙 **${taruhan.toLocaleString('id-ID')}**`)] }); setTimeout(async () => { activeCoinflips.delete(interaction.user.id); if (Math.random() < 0.5) { db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(taruhan * 2, guildId, interaction.user.id); incrementUserStat(guildId, interaction.user.id, 'coinflip_wins'); await checkAchievements(interaction.guild, interaction.user.id, { type: 'coinflip' }); const freshData = getOrCreateUser(guildId, interaction.user.id); interaction.editReply({ embeds: [new EmbedBuilder().setColor('#2ECC71').setTitle('🎉 MENANG!').setDescription(`Dapat 🪙 **${taruhan.toLocaleString('id-ID')}**\n> Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**`)] }).catch(()=>{}); } else { await checkAchievements(interaction.guild, interaction.user.id, { type: 'coinflip' }); const freshData = getOrCreateUser(guildId, interaction.user.id); interaction.editReply({ embeds: [new EmbedBuilder().setColor('#E74C3C').setTitle('💀 KALAH!').setDescription(`Hilang 🪙 **${taruhan.toLocaleString('id-ID')}**\n> Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**`)] }).catch(()=>{}); } }, 7000); return; }

        // ================= SLOT MACHINE =================
        if (command === 'economy' && subCmd === 'slot') {
            const slotCdKey = `slot_${guildId}_${interaction.user.id}`;
            if (fishCooldowns.has(slotCdKey) && Date.now() < fishCooldowns.get(slotCdKey)) { const remaining = Math.ceil((fishCooldowns.get(slotCdKey) - Date.now()) / 1000); return interaction.reply({ content: `⏳ Mesin slot masih panas! Tunggu **${remaining} detik**.`, ephemeral: true }); }
            fishCooldowns.set(slotCdKey, Date.now() + 5000);
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
        if (command === 'economy' && subCmd === 'gift') {
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
            addPetExp(guildId, interaction.user.id, 5);
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

        if (command === 'me' && subCmd === 'inventory') {
            const items = db.prepare('SELECT * FROM item_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, interaction.user.id);
            if (items.length === 0) return interaction.reply({ content: '🎒 Inventory kosong! Beli item di `/shop` kategori Items.', ephemeral: true });
            let desc = '';
            for (const inv of items) {
                const def = ITEMS.find(i => i.id === inv.itemId);
                if (def) desc += `${def.emoji} **${def.name}** x${inv.quantity}\n> *${def.desc}*\n\n`;
            }
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎒 Item Inventory').setColor('#2B2D31').setDescription(desc).setFooter({ text: '/use <item> untuk memakai item' })] });
        }

        if (command === 'me' && subCmd === 'use') {
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

        // ================= FARMING COMMANDS =================
        if (command === 'farm') {
            const farmData = getFarmData(guildId, interaction.user.id);
            const maxSlots = getFarmSlots(guildId, interaction.user.id);
            const plots = getPlots(guildId, interaction.user.id);

            if (subCmd === 'status') {
                const levelInfo = FARM_LEVELS.find(l => l.level === farmData.farm_level);
                let desc = `${levelInfo.name} — Lahan **${plots.length}/${maxSlots}** terpakai\n\n`;
                if (plots.length === 0) { desc += '*Kebun kosong! Gunakan `/farm plant` untuk menanam.*'; }
                else {
                    plots.forEach((plot, i) => {
                        const crop = FARM_CROPS.find(c => c.id === plot.cropId);
                        if (!crop) return;
                        const fert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer) || FARM_FERTILIZERS[0];
                        const growTime = crop.time * (1 - fert.speedBonus) * 60000;
                        const elapsed = Date.now() - plot.plantedAt;
                        const needWater = (Date.now() - plot.wateredAt) > growTime * 0.6;
                        let status = '';
                        const dryTime = Date.now() - plot.wateredAt;
                        const wiltThreshold = growTime * 1.5;
                        const deadThreshold = growTime * 2.5;
                        if (plot.status === 'dead' || dryTime > deadThreshold) { status = '☠️ Mati'; if (plot.status !== 'dead') db.prepare('UPDATE farm_plots SET status = ? WHERE id = ?').run('dead', plot.id); }
                        else if (elapsed >= growTime) status = '✅ Siap Panen!';
                        else if (dryTime > wiltThreshold) status = '🥀 Layu! (Siram segera!)';
                        else if (needWater) status = '💧 Butuh Siram!';
                        else { const pct = Math.min(100, Math.floor((elapsed / growTime) * 100)); status = `🌱 ${pct}%`; }
                        desc += `**[${i+1}]** ${crop.emoji} ${crop.name} — ${status}${fert.id !== 'none' ? ` | ${fert.emoji}` : ''}\n`;
                    });
                }
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🌾 Kebun Kamu').setColor('#2ECC71').setDescription(desc).setFooter({ text: `/farm plant — tanam | /farm water — siram | /farm harvest — panen` })] });
            }

            if (subCmd === 'plant') {
                if (plots.length >= maxSlots) return interaction.reply({ content: `❌ Lahan penuh! (${plots.length}/${maxSlots}) Upgrade lahan atau panen dulu.`, ephemeral: true });
                const cropId = interaction.options.getString('bibit');
                const crop = FARM_CROPS.find(c => c.id === cropId);
                if (!crop) return interaction.reply({ content: '❌ Bibit tidak ditemukan!', ephemeral: true });
                if (userData.balance < crop.cost) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${crop.cost}**`, ephemeral: true });
                userData.balance -= crop.cost;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                db.prepare('INSERT INTO farm_plots (guildId, userId, cropId, plantedAt, wateredAt) VALUES (?, ?, ?, ?, ?)').run(guildId, interaction.user.id, cropId, Date.now(), Date.now());
                return interaction.reply({ content: `🌱 **${crop.emoji} ${crop.name}** ditanam! Siap panen dalam **${crop.time} menit**.\n> Jangan lupa siram dengan \`/farm water\`!` });
            }

            if (subCmd === 'water') {
                if (plots.length === 0) return interaction.reply({ content: '❌ Tidak ada tanaman untuk disiram!', ephemeral: true });
                let watered = 0;
                for (const plot of plots) { if (plot.status !== 'dead') { db.prepare('UPDATE farm_plots SET wateredAt = ? WHERE id = ?').run(Date.now(), plot.id); watered++; } }
                return interaction.reply({ content: `💧 Berhasil menyiram **${watered} tanaman**! Tanaman kamu tumbuh dengan baik.` });
            }

            if (subCmd === 'harvest') {
                if (plots.length === 0) return interaction.reply({ content: '❌ Tidak ada tanaman!', ephemeral: true });
                let harvested = 0, totalItems = 0, harvestDesc = '';
                for (const plot of plots) {
                    const crop = FARM_CROPS.find(c => c.id === plot.cropId);
                    if (!crop) continue;
                    const fert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer) || FARM_FERTILIZERS[0];
                    const growTime = crop.time * (1 - fert.speedBonus) * 60000;
                    if (Date.now() - plot.plantedAt >= growTime && plot.status !== 'dead') {
                        let qty = getRandomInt(crop.minYield, crop.maxYield);
                        if (Math.random() < fert.yieldBonus) qty += getRandomInt(1, 2);
                        addStorage(guildId, interaction.user.id, crop.id, qty);
                        harvestDesc += `> ${crop.emoji} ${crop.name} x${qty}\n`;
                        harvested++; totalItems += qty;
                        db.prepare('DELETE FROM farm_plots WHERE id = ?').run(plot.id);
                    }
                }
                // Auto-remove dead plants during harvest
                const deadPlots = plots.filter(p => p.status === 'dead');
                let deadMsg = '';
                if (deadPlots.length > 0) {
                    db.prepare("DELETE FROM farm_plots WHERE guildId = ? AND userId = ? AND status = 'dead'").run(guildId, interaction.user.id);
                    deadMsg = `\n\n🗑️ **${deadPlots.length} tanaman mati** otomatis dihapus.`;
                }
                if (harvested === 0 && deadPlots.length > 0) return interaction.reply({ content: `🗑️ **${deadPlots.length} tanaman mati** dihapus dari kebun! Slot sekarang tersedia untuk tanam baru.\n\n> Tidak ada tanaman yang siap dipanen.`, ephemeral: false });
                if (harvested === 0) return interaction.reply({ content: '❌ Belum ada tanaman yang siap dipanen! Cek `/farm status`.', ephemeral: true });
                incrementUserStat(guildId, interaction.user.id, 'total_harvests', harvested);
                addPetExp(guildId, interaction.user.id, 5);
                await checkAchievements(interaction.guild, interaction.user.id, { type: 'farm_harvest', legendary: harvestDesc.includes('Legendary') });
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ECC71').setTitle('🌾 Panen Berhasil!').setDescription(`Memanen **${harvested} tanaman** (${totalItems} item):\n\n${harvestDesc}\n> Hasil masuk ke \`/farm storage\`.\n> Gunakan \`/farm craft\` atau \`/farm sell\` untuk menjual.${deadMsg}`)] });
            }

            if (subCmd === 'storage') {
                const storage = getStorage(guildId, interaction.user.id);
                if (storage.length === 0) return interaction.reply({ content: '📦 Gudang kosong! Panen dulu dengan `/farm harvest`.', ephemeral: true });
                let desc = '';
                storage.forEach(s => { const crop = FARM_CROPS.find(c => c.id === s.itemId); desc += `> ${crop ? crop.emoji : '📦'} **${crop ? crop.name : s.itemId}** x${s.quantity}\n`; });
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Farm Storage').setColor('#2B2D31').setDescription(desc).setFooter({ text: '/farm sell — jual semua | /farm craft — buat resep' })] });
            }

            if (subCmd === 'sell') {
                const storage = getStorage(guildId, interaction.user.id);
                if (storage.length === 0) return interaction.reply({ content: '❌ Gudang kosong!', ephemeral: true });
                let totalMoney = 0, sellDesc = '';
                for (const s of storage) { const crop = FARM_CROPS.find(c => c.id === s.itemId); const price = crop ? crop.sellPrice * s.quantity : 0; totalMoney += price; sellDesc += `> ${crop ? crop.emoji : '📦'} ${crop ? crop.name : '?'} x${s.quantity} = 🪙 ${price}\n`; }
                userData.balance += totalMoney;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                db.prepare('DELETE FROM farm_storage WHERE guildId = ? AND userId = ?').run(guildId, interaction.user.id);
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#F1C40F').setTitle('💰 Hasil Panen Terjual!').setDescription(`${sellDesc}\n**Total: 🪙 ${totalMoney.toLocaleString('id-ID')}**\n> Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**`)] });
            }

            if (subCmd === 'upgrade') {
                const nextLevel = FARM_LEVELS.find(l => l.level === farmData.farm_level + 1);
                if (!nextLevel) return interaction.reply({ content: '👑 Lahan kamu sudah level maksimal!', ephemeral: true });
                if (userData.balance < nextLevel.cost) return interaction.reply({ content: `❌ Butuh 🪙 **${nextLevel.cost.toLocaleString('id-ID')}** untuk upgrade ke ${nextLevel.name} (${nextLevel.slots} slot)`, ephemeral: true });
                userData.balance -= nextLevel.cost;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                db.prepare('UPDATE farm_data SET farm_level = ? WHERE guildId = ? AND userId = ?').run(nextLevel.level, guildId, interaction.user.id);
                if (nextLevel.level === 6) await checkAchievements(interaction.guild, interaction.user.id, { type: 'farm_upgrade_max' });
                return interaction.reply({ content: `🎉 **Lahan di-upgrade!**\n> ${nextLevel.name} — Sekarang punya **${nextLevel.slots} slot** tanam!` });
            }

            if (subCmd === 'craft') {
                const recipeId = interaction.options.getString('resep');
                const recipe = FARM_RECIPES.find(r => r.id === recipeId);
                if (!recipe) return interaction.reply({ content: '❌ Resep tidak ditemukan!', ephemeral: true });
                // Check bahan
                for (const ing of recipe.ingredients) {
                    const have = getStorageQty(guildId, interaction.user.id, ing.id);
                    if (have < ing.qty) { const crop = FARM_CROPS.find(c => c.id === ing.id); return interaction.reply({ content: `❌ Bahan kurang! Butuh **${crop ? crop.emoji : ''} ${crop ? crop.name : ing.id}** x${ing.qty} (punya: ${have})`, ephemeral: true }); }
                }
                // Consume bahan
                for (const ing of recipe.ingredients) { removeStorage(guildId, interaction.user.id, ing.id, ing.qty); }
                // Tambah uang langsung (craft = jual produk)
                userData.balance += recipe.sellPrice;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                incrementUserStat(guildId, interaction.user.id, 'total_crafts');
                await checkAchievements(interaction.guild, interaction.user.id, { type: 'farm_craft' });
                const ingredients = recipe.ingredients.map(ing => { const c = FARM_CROPS.find(cr => cr.id === ing.id); return `${c ? c.emoji : '📦'} ${c ? c.name : ing.id} x${ing.qty}`; }).join(' + ');
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#9B59B6').setTitle(`${recipe.emoji} ${recipe.name} di-Craft!`).setDescription(`> Bahan: ${ingredients}\n> \n> 💰 **Dijual seharga 🪙 ${recipe.sellPrice.toLocaleString('id-ID')}**\n> Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**`)] });
            }

            if (subCmd === 'pupuk') {
                const fertId = interaction.options.getString('jenis');
                const slotNum = interaction.options.getInteger('slot');
                const fert = FARM_FERTILIZERS.find(f => f.id === fertId);
                if (!fert || fert.id === 'none') return interaction.reply({ content: '❌ Pupuk tidak valid!', ephemeral: true });
                if (userData.balance < fert.cost) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${fert.cost.toLocaleString('id-ID')}**`, ephemeral: true });
                
                const plots = getPlots(guildId, interaction.user.id);
                if (plots.length === 0) return interaction.reply({ content: '❌ Tidak ada tanaman! Tanam dulu dengan `/farm plant`.', ephemeral: true });
                if (slotNum < 1 || slotNum > plots.length) return interaction.reply({ content: `❌ Slot tidak valid! Kamu punya ${plots.length} tanaman (slot 1-${plots.length}). Cek di \`/farm status\`.`, ephemeral: true });
                
                const plot = plots[slotNum - 1];
                if (plot.status === 'dead') return interaction.reply({ content: '❌ Tanaman ini sudah mati! Tidak bisa dipupuk.', ephemeral: true });
                if (plot.fertilizer !== 'none') {
                    const existingFert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer);
                    return interaction.reply({ content: `❌ Tanaman ini sudah diberi pupuk **${existingFert ? existingFert.emoji + ' ' + existingFert.name : ''}**! Satu tanaman hanya bisa dipupuk sekali.`, ephemeral: true });
                }
                
                userData.balance -= fert.cost;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                db.prepare('UPDATE farm_plots SET fertilizer = ? WHERE id = ?').run(fertId, plot.id);
                
                const crop = FARM_CROPS.find(c => c.id === plot.cropId);
                const newTime = Math.round(crop.time * (1 - fert.speedBonus));
                return interaction.reply({ content: `✅ ${fert.emoji} **${fert.name}** diberikan ke **[Slot ${slotNum}] ${crop ? crop.emoji + ' ' + crop.name : 'tanaman'}**!\n\n> ⏩ Waktu tumbuh: ~~${crop.time}m~~ → **${newTime}m**${fert.yieldBonus > 0 ? `\n> 📈 Bonus hasil: **+${Math.round(fert.yieldBonus*100)}%**` : ''}\n> 💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**` });
            }

            if (subCmd === 'shop') {
                const tiers = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
                let desc = '**🌱 BIBIT TANAMAN**\n\n';
                for (const tier of tiers) {
                    const crops = FARM_CROPS.filter(c => c.tier === tier);
                    desc += `**${tier}** (${tier === 'Common' ? '2-4m' : tier === 'Uncommon' ? '8-18m' : tier === 'Rare' ? '20-35m' : tier === 'Epic' ? '50-90m' : '2.5-3.5h'})\n`;
                    crops.forEach(c => { desc += `> ${c.emoji} ${c.name} — 🪙 ${c.cost} | ${c.time}m\n`; });
                    desc += '\n';
                }
                desc += '━━━━━━━━━━━━━━━━━━━━━━\n**🧪 PUPUK**\n\n';
                FARM_FERTILIZERS.filter(f => f.id !== 'none').forEach(f => { desc += `> ${f.emoji} ${f.name} — 🪙 ${f.cost} | ⏩ -${Math.round(f.speedBonus*100)}% waktu${f.yieldBonus > 0 ? ` | 📈 +${Math.round(f.yieldBonus*100)}% hasil` : ''}\n`; });
                if (desc.length > 4000) desc = desc.substring(0, 3990) + '...';
                const components = [];
                const fertMenu = new StringSelectMenuBuilder().setCustomId('farm_buy_fertilizer').setPlaceholder('🧪 Beli Pupuk...').addOptions(
                    ...FARM_FERTILIZERS.filter(f => f.id !== 'none').map(f => new StringSelectMenuOptionBuilder().setLabel(`${f.name} (🪙 ${f.cost})`).setValue(f.id).setDescription(`-${Math.round(f.speedBonus*100)}% waktu${f.yieldBonus > 0 ? `, +${Math.round(f.yieldBonus*100)}% hasil` : ''}`))
                );
                components.push(new ActionRowBuilder().addComponents(fertMenu));
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🌾 Farm Shop').setColor('#2B2D31').setDescription(desc).setFooter({ text: 'Pupuk: beli di menu bawah | Bibit: /farm plant <nama>' })], components });
            }
        }

        // ================= PET COMMANDS =================
        if (command === 'pet') {
            if (subCmd === 'info') {
                const pet = getPetData(guildId, interaction.user.id);
                if (!pet) return interaction.reply({ content: '❌ Kamu belum punya pet! Gunakan `/pet adopt` atau `/pet egg`.', ephemeral: true });
                const petDef = PET_DATA.find(p => p.id === pet.petId);
                const expNeeded = pet.level <= 5 ? 50 : pet.level <= 10 ? 100 : pet.level <= 15 ? 200 : pet.level <= 20 ? 400 : pet.level <= 25 ? 600 : 1000;
                const happyBar = '▰'.repeat(Math.floor(pet.happiness / 10)) + '▱'.repeat(10 - Math.floor(pet.happiness / 10));
                const hungerBar = '▰'.repeat(Math.floor(pet.hunger / 10)) + '▱'.repeat(10 - Math.floor(pet.hunger / 10));
                const expBar = '▰'.repeat(Math.min(10, Math.floor((pet.exp / expNeeded) * 10))) + '▱'.repeat(10 - Math.min(10, Math.floor((pet.exp / expNeeded) * 10)));
                const statusEmoji = pet.status === 'sick' ? '🤒 Sakit!' : pet.happiness >= 70 ? '😊 Bahagia!' : pet.happiness >= 30 ? '😐 Biasa' : '😢 Sedih';
                const bonusActive = pet.happiness >= 30 && pet.hunger >= 10 && pet.status !== 'sick';
                const lvlMult = PET_LEVEL_MULTIPLIERS[Math.min(pet.level, 30)] || 1.0;
                const bonusValue = bonusActive ? Math.floor(petDef.bonus.value * lvlMult) : 0;
                const embed = new EmbedBuilder()
                    .setTitle(`${petDef.emoji} ${pet.name} (Level ${pet.level})`)
                    .setColor(bonusActive ? '#2ECC71' : '#E74C3C')
                    .setDescription(`**${petDef.name}** — *${petDef.tier}*\n\n> ❤️ Happiness: \`${happyBar}\` **${pet.happiness}%**\n> 🍖 Hunger: \`${hungerBar}\` **${pet.hunger}%**\n> ✨ EXP: \`${expBar}\` **${pet.exp}/${expNeeded}**\n> 💪 Status: ${statusEmoji}\n\n🎁 **Passive Bonus** ${bonusActive ? '(AKTIF ✅)' : '(MATI ❌)'}:\n> +**${bonusValue}%** ${petDef.bonus.type.replace(/_/g, ' ')}${!bonusActive ? '\n> ⚠️ *Happiness/Hunger terlalu rendah atau pet sakit!*' : ''}\n\n⚔️ **Battle Stats:**\n> Class: **${pet.class || 'warrior'}** | Element: **${pet.element || 'fire'}**\n> HP: \`${pet.hp || 100}\` | ATK: \`${pet.atk || 20}\` | DEF: \`${pet.def || 10}\`\n> SPD: \`${pet.spd || 10}\` | CRIT: \`${pet.crit || 5}%\``)
                    .setFooter({ text: '/pet feed — makan | /pet play — main | /pet hunt — berburu' });
                const isHunting = pet.hunting_until && pet.hunting_until > Date.now();
                let skillDesc = '';
                for (const ms of PET_SKILL_MILESTONES) {
                    if (pet.level >= ms.level) skillDesc += `> ✅ Lv.${ms.level}: **${ms.skill.name}**\n`;
                    else skillDesc += `> 🔒 Lv.${ms.level}: ${ms.skill.name}\n`;
                }
                if (isHunting) embed.addFields({ name: '🏹 HUNTING', value: `> Kembali dalam **${Math.ceil((pet.hunting_until - Date.now()) / 60000)} menit**\n> ⚠️ Buff MATI selama hunt`, inline: false });
                embed.addFields({ name: '🌟 Skill Buffs (Stack per Level)', value: skillDesc, inline: false });
                return interaction.reply({ embeds: [embed] });
            }

            if (subCmd === 'adopt') {
                const petId = interaction.options.getString('pet');
                const petDef = PET_DATA.find(p => p.id === petId);
                if (!petDef) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
                if (petDef.price <= 0) return interaction.reply({ content: '❌ Pet ini tidak bisa dibeli! Hanya dari Pet Egg.', ephemeral: true });
                if (userData.balance < petDef.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${petDef.price.toLocaleString('id-ID')}**`, ephemeral: true });
                const allPets = getAllPets(guildId, interaction.user.id);
                if (allPets.length >= 10) return interaction.reply({ content: '❌ Kamu sudah punya 10 pet (max)! Lepaskan salah satu dengan `/pet release`.', ephemeral: true });
                userData.balance -= petDef.price;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                const isFirst = allPets.length === 0 ? 1 : 0;
                const stats = generatePetStats(petDef.tier);
                const pClass = PET_CLASSES[Math.floor(Math.random() * PET_CLASSES.length)];
                const pElement = PET_ELEMENTS[Math.floor(Math.random() * PET_ELEMENTS.length)];
                db.prepare('INSERT INTO pets (guildId, userId, petId, name, active, adoptedAt, class, element, hp, atk, def, spd, crit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(guildId, interaction.user.id, petId, petDef.name, isFirst, Date.now(), pClass, pElement, stats.hp, stats.atk, stats.def, stats.spd, stats.crit);
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ECC71').setTitle('🐾 Pet Adopted!').setDescription(`Kamu mengadopsi ${petDef.emoji} **${petDef.name}**!\n\n> Tier: **${petDef.tier}**\n> Bonus: +${petDef.bonus.value}% ${petDef.bonus.type.replace(/_/g, ' ')}\n\n${isFirst ? '✅ Pet ini langsung menjadi pet aktifmu!' : 'Gunakan `/pet swap` untuk mengaktifkan.'}`)] });
            }

            if (subCmd === 'feed') {
                const pet = getPetData(guildId, interaction.user.id);
                if (!pet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
                const foodId = interaction.options.getString('food');
                const food = PET_FOODS.find(f => f.id === foodId);
                if (!food) return interaction.reply({ content: '❌ Makanan tidak ditemukan!', ephemeral: true });
                if (userData.balance < food.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${food.price}**`, ephemeral: true });
                userData.balance -= food.price;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                const newHunger = Math.min(100, pet.hunger + food.hunger);
                const newHappy = Math.min(100, pet.happiness + food.happiness);
                const newExp = pet.exp + 5;
                const newStatus = pet.status === 'sick' && newHunger > 50 ? 'happy' : pet.status;
                db.prepare('UPDATE pets SET hunger = ?, happiness = ?, exp = ?, status = ? WHERE id = ?').run(newHunger, newHappy, newExp, newStatus, pet.id);
                const petDef = PET_DATA.find(p => p.id === pet.petId);
                return interaction.reply({ content: `${food.emoji} **${pet.name}** makan ${food.name}!\n\n> 🍖 Hunger: ${pet.hunger}% → **${newHunger}%**\n> ❤️ Happy: ${pet.happiness}% → **${newHappy}%**\n> ✨ +5 EXP` });
            }

            if (subCmd === 'play') {
                const pet = getPetData(guildId, interaction.user.id);
                if (!pet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
                const playCdKey = `pet_play_${guildId}_${interaction.user.id}`;
                if (fishCooldowns.has(playCdKey) && Date.now() < fishCooldowns.get(playCdKey)) { const remSec = Math.ceil((fishCooldowns.get(playCdKey) - Date.now()) / 1000); return interaction.reply({ content: `⏳ ${pet.name} masih capek! Tunggu **${remSec > 60 ? Math.ceil(remSec/60) + ' menit' : remSec + ' detik'}** lagi.`, ephemeral: true }); }
                fishCooldowns.set(playCdKey, Date.now() + 180000); // 3 menit
                const newHappy = Math.min(100, pet.happiness + 10);
                const newHunger = Math.max(0, pet.hunger - 3);
                db.prepare('UPDATE pets SET happiness = ?, hunger = ? WHERE id = ?').run(newHappy, newHunger, pet.id);
                const expResult = addPetExp(guildId, interaction.user.id, 8);
                let lvlUpMsg = '';
                if (expResult && expResult.leveledUp) lvlUpMsg = `\n\n🎉 **LEVEL UP!** ${expResult.petName} → Lv.${expResult.newLevel}!`;
                if (expResult && expResult.newSkill) lvlUpMsg += `\n> 🌟 **SKILL UNLOCKED:** ${expResult.newSkill.skill.name}!`;
                const activities = ['bermain kejar-kejaran', 'bermain bola', 'bermain petak umpet', 'berguling-guling', 'melompat-lompat'];
                const activity = activities[Math.floor(Math.random() * activities.length)];
                return interaction.reply({ content: `🎾 ${pet.name} ${activity}!\n\n> ❤️ Happy: +10 → **${newHappy}%**\n> 🍖 Hunger: -3 → **${newHunger}%**\n> ✨ +8 EXP${lvlUpMsg}` });
            }

            if (subCmd === 'shop') {
                let desc = '**🍖 MAKANAN PET**\n\n';
                PET_FOODS.forEach(f => { desc += `> ${f.emoji} **${f.name}** — 🪙 ${f.price}\n> Hunger +${f.hunger} | Happy +${f.happiness}\n\n`; });
                desc += '━━━━━━━━━━━━━━━━━━━━━━\n**🥚 PET EGGS (Gacha)**\n\n';
                PET_EGGS.forEach(e => { const rates = Object.entries(e.rates).map(([t, r]) => `${t}: ${r}%`).join(', '); desc += `> ${e.emoji} **${e.name}** — 🪙 ${e.price.toLocaleString('id-ID')}\n> Rates: ${rates}\n\n`; });
                if (desc.length > 4000) desc = desc.substring(0, 3990) + '...';
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🐾 Pet Shop').setColor('#FF69B4').setDescription(desc).setFooter({ text: '/pet feed <food> — beri makan | /pet egg <tipe> — buka egg | /pet adopt <pet> — beli pet' })] });
            }

            if (subCmd === 'egg') {
                const eggId = interaction.options.getString('tipe');
                const egg = PET_EGGS.find(e => e.id === eggId);
                if (!egg) return interaction.reply({ content: '❌ Egg tidak ditemukan!', ephemeral: true });
                if (userData.balance < egg.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${egg.price.toLocaleString('id-ID')}**`, ephemeral: true });
                const allPets = getAllPets(guildId, interaction.user.id);
                if (allPets.length >= 10) return interaction.reply({ content: '❌ Slot pet penuh (max 10)! Lepaskan salah satu.', ephemeral: true });
                userData.balance -= egg.price;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                // Roll tier
                let roll = Math.random() * 100, cumulative = 0, selectedTier = 'Common';
                for (const [tier, rate] of Object.entries(egg.rates)) { cumulative += rate; if (roll <= cumulative) { selectedTier = tier; break; } }
                // Pick random pet from tier
                const tierPets = PET_DATA.filter(p => p.tier === selectedTier);
                const wonPet = tierPets[Math.floor(Math.random() * tierPets.length)];
                const isFirst = allPets.length === 0 ? 1 : 0;
                const stats = generatePetStats(selectedTier);
                const pClass = PET_CLASSES[Math.floor(Math.random() * PET_CLASSES.length)];
                const pElement = PET_ELEMENTS[Math.floor(Math.random() * PET_ELEMENTS.length)];
                db.prepare('INSERT INTO pets (guildId, userId, petId, name, active, adoptedAt, class, element, hp, atk, def, spd, crit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(guildId, interaction.user.id, wonPet.id, wonPet.name, isFirst, Date.now(), pClass, pElement, stats.hp, stats.atk, stats.def, stats.spd, stats.crit);
                const tierColors = { Common: '#AAAAAA', Uncommon: '#2ECC71', Rare: '#3498DB', Epic: '#9B59B6', Legendary: '#FFD700', Mythic: '#FF6B6B' };
                let title = `${egg.emoji} Egg Hatched!`;
                if (selectedTier === 'Mythic') title = '🌟✨ MYTHIC PET!!! ✨🌟';
                else if (selectedTier === 'Legendary') title = '⭐ LEGENDARY PET! ⭐';
                else if (selectedTier === 'Epic') title = '💜 EPIC PET! 💜';
                return interaction.reply({ embeds: [new EmbedBuilder().setColor(tierColors[selectedTier] || '#2B2D31').setTitle(title).setDescription(`Kamu mendapatkan:\n\n${wonPet.emoji} **${wonPet.name}**\n> Tier: **${selectedTier}**\n> Bonus: +${wonPet.bonus.value}% ${wonPet.bonus.type.replace(/_/g, ' ')}\n\n${isFirst ? '✅ Langsung aktif!' : 'Gunakan `/pet swap` untuk mengaktifkan.'}`)] });
            }

            if (subCmd === 'collection') {
                const allPets = getAllPets(guildId, interaction.user.id);
                if (allPets.length === 0) return interaction.reply({ content: '🐾 Kamu belum punya pet! `/pet adopt` atau `/pet egg` untuk mulai.', ephemeral: true });
                let desc = `🐾 **Pet Collection** (${allPets.length}/10 slot)\n\n`;
                const tierOrder = ['Mythic', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'];
                const sorted = allPets.sort((a, b) => { const ta = tierOrder.indexOf(PET_DATA.find(p => p.id === a.petId)?.tier || 'Common'); const tb = tierOrder.indexOf(PET_DATA.find(p => p.id === b.petId)?.tier || 'Common'); return ta - tb; });
                sorted.forEach(pet => { const def = PET_DATA.find(p => p.id === pet.petId); const bonusText = def ? `+${def.bonus.value}% ${def.bonus.type.replace(/_/g, ' ')}` : ''; desc += `${pet.active ? '⭐' : '▪️'} **#${pet.id}** ${def ? def.emoji : '🐾'} **${pet.name}** (Lv.${pet.level}) — **(${def ? def.tier : '?'})**\n> ${bonusText}\n`; });
                desc += `\n> ⭐ = Pet Aktif | /pet swap <id> untuk ganti`;
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🐾 Pet Collection').setColor('#FF69B4').setDescription(desc)] });
            }

            if (subCmd === 'swap') {
                const petDbId = interaction.options.getInteger('id');
                const targetPet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(petDbId, guildId, interaction.user.id);
                if (!targetPet) return interaction.reply({ content: '❌ Pet tidak ditemukan! Cek ID di `/pet collection`.', ephemeral: true });
                db.prepare('UPDATE pets SET active = 0 WHERE guildId = ? AND userId = ?').run(guildId, interaction.user.id);
                db.prepare('UPDATE pets SET active = 1 WHERE id = ?').run(petDbId);
                const def = PET_DATA.find(p => p.id === targetPet.petId);
                return interaction.reply({ content: `✅ Pet aktif diganti ke ${def ? def.emoji : '🐾'} **${targetPet.name}**!` });
            }

            if (subCmd === 'hunt') {
                const pet = getPetData(guildId, interaction.user.id);
                if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
                if (pet.happiness < 50) return interaction.reply({ content: '❌ Pet terlalu sedih untuk berburu! (Happiness harus > 50)', ephemeral: true });
                if (pet.hunting_until && pet.hunting_until > 0 && pet.hunting_until <= Date.now()) {
                    // Hunt finished! Collect rewards
                    db.prepare('UPDATE pets SET hunting_until = 0 WHERE id = ?').run(pet.id);
                    const success = Math.random() > 0.2; // 80% success
                    if (success) {
                        const reward = getRandomInt(30, 150);
                        userData.balance += reward;
                        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                        const expResult = addPetExp(guildId, interaction.user.id, 20);
                        let lvlMsg = '';
                        if (expResult && expResult.leveledUp) lvlMsg = `\n> 🎉 **LEVEL UP!** ${expResult.petName} → Lv.${expResult.newLevel}!`;
                        if (expResult && expResult.newSkill) lvlMsg += `\n> 🌟 **SKILL UNLOCKED:** ${expResult.newSkill.skill.name}!`;
                        const petDef = PET_DATA.find(p => p.id === pet.petId);
                        return interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ECC71').setTitle('🐾 Hunt Complete!').setDescription(`${petDef ? petDef.emoji : '🐾'} **${pet.name}** kembali dari berburu!\n\n> ✅ Hasil: 🪙 **${reward} Money**\n> ✨ Pet EXP: +20${lvlMsg}\n\n*Buff pet kembali aktif!*`)] });
                    } else {
                        addPetExp(guildId, interaction.user.id, 8);
                        const petDef = PET_DATA.find(p => p.id === pet.petId);
                        return interaction.reply({ embeds: [new EmbedBuilder().setColor('#E74C3C').setTitle('🐾 Hunt Gagal...').setDescription(`${petDef ? petDef.emoji : '🐾'} **${pet.name}** pulang tanpa hasil.\n\n> ❌ Tidak menemukan apa-apa\n> ✨ Pet EXP: +8\n\n*Buff pet kembali aktif!*`)] });
                    }
                }
                if (pet.hunting_until && pet.hunting_until > Date.now()) { const remaining = Math.ceil((pet.hunting_until - Date.now()) / 60000); return interaction.reply({ content: `⏳ ${pet.name} masih berburu! Kembali dalam **${remaining} menit**.`, ephemeral: true }); }
                const huntDuration = getRandomInt(10, 20) * 60000; // 10-20 menit
                const huntEnd = Date.now() + huntDuration;
                db.prepare('UPDATE pets SET hunting_until = ?, hunger = MAX(0, hunger - 20) WHERE id = ?').run(huntEnd, pet.id);
                const durationMin = Math.round(huntDuration / 60000);
                const petDef = PET_DATA.find(p => p.id === pet.petId);
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#F39C12').setTitle('🐾 Pet Hunt Started!').setDescription(`${petDef ? petDef.emoji : '🐾'} **${pet.name}** pergi berburu!\n\n> ⏱️ Durasi: **${durationMin} menit**\n> ⚠️ Semua buff pet **MATI** selama hunt\n> 🍖 Hunger: -20\n\nGunakan \`/pet hunt\` lagi nanti untuk mengambil hasil.`).setFooter({ text: 'Pet akan kembali otomatis. Buff aktif kembali setelah hunt selesai.' })] });
            }

            if (subCmd === 'rename') {
                const pet = getPetData(guildId, interaction.user.id);
                if (!pet) return interaction.reply({ content: '❌ Belum punya pet aktif!', ephemeral: true });
                const newName = interaction.options.getString('nama');
                db.prepare('UPDATE pets SET name = ? WHERE id = ?').run(newName, pet.id);
                return interaction.reply({ content: `✅ Nama pet diubah menjadi **${newName}**!` });
            }

            if (subCmd === 'release') {
                const petDbId = interaction.options.getInteger('id');
                const targetPet = db.prepare('SELECT * FROM pets WHERE id = ? AND guildId = ? AND userId = ?').get(petDbId, guildId, interaction.user.id);
                if (!targetPet) return interaction.reply({ content: '❌ Pet tidak ditemukan!', ephemeral: true });
                db.prepare('DELETE FROM pets WHERE id = ?').run(petDbId);
                const def = PET_DATA.find(p => p.id === targetPet.petId);
                return interaction.reply({ content: `👋 ${def ? def.emoji : '🐾'} **${targetPet.name}** telah dilepaskan... Selamat tinggal! 😢` });
            }
        }

        // ================= BATTLE PVP =================
        if (command === 'battle') {
            const battleCd = `battle_${guildId}_${interaction.user.id}`;
            if (fishCooldowns.has(battleCd) && Date.now() < fishCooldowns.get(battleCd)) { return interaction.reply({ content: '⏳ Tunggu 5 menit sebelum battle lagi.', ephemeral: true }); }
            const myPet = getPetData(guildId, interaction.user.id);
            if (!myPet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
            const target = interaction.options.getUser('lawan');
            if (target.id === interaction.user.id) return interaction.reply({ content: '❌ Tidak bisa lawan diri sendiri!', ephemeral: true });
            if (target.bot) return interaction.reply({ content: '❌ Tidak bisa lawan bot!', ephemeral: true });
            const enemyPet = getPetData(guildId, target.id);
            if (!enemyPet) return interaction.reply({ content: `❌ <@${target.id}> belum punya pet aktif!`, ephemeral: true });
            const taruhan = Math.min(interaction.options.getInteger('taruhan') || 0, 5000);
            if (taruhan > 0) {
                if (userData.balance < taruhan) return interaction.reply({ content: '❌ Saldo kamu kurang untuk taruhan!', ephemeral: true });
                const enemyData = getOrCreateUser(guildId, target.id);
                if (enemyData.balance < taruhan) return interaction.reply({ content: `❌ <@${target.id}> saldo kurang untuk taruhan! (Butuh 🪙 ${taruhan.toLocaleString('id-ID')})`, ephemeral: true });
            }
            fishCooldowns.set(battleCd, Date.now() + 120000);
            const myPetDef = PET_DATA.find(p => p.id === myPet.petId);
            const enemyPetDef = PET_DATA.find(p => p.id === enemyPet.petId);
            
            await interaction.reply({ embeds: [new EmbedBuilder().setColor('#F39C12').setTitle('⚔️ BATTLE!').setDescription(`${myPetDef.emoji} **${myPet.name}** vs ${enemyPetDef.emoji} **${enemyPet.name}**${taruhan > 0 ? `\n> 💰 Taruhan: 🪙 **${taruhan.toLocaleString('id-ID')}**` : ''}\n\n> ⚔️ *Pertarungan sedang berlangsung...*`).setFooter({ text: 'Menunggu hasil...' })] });
            
            setTimeout(async () => {
                const result = simulatePvP(myPet, myPetDef, enemyPet, enemyPetDef);
                const winner = result.winner === 1 ? interaction.user : target;
                const loser = result.winner === 1 ? target : interaction.user;
                if (taruhan > 0) {
                    // Atomic transfer - re-check loser balance
                    const loserCheck = getOrCreateUser(guildId, loser.id);
                    if (loserCheck.balance >= taruhan) {
                        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(taruhan, guildId, loser.id);
                        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(taruhan, guildId, winner.id);
                    }
                }
                addPetExp(guildId, winner.id, 15);
                addPetExp(guildId, loser.id, 5);
                incrementUserStat(guildId, winner.id, 'pvp_wins');
                await checkAchievements(interaction.guild, winner.id, { type: 'pvp_win' });
                const embed = new EmbedBuilder().setColor('#FF6B00').setTitle(`⚔️ BATTLE RESULT`).setDescription(`${result.log.join('\n')}\n\n━━━━━━ **RESULT** ━━━━━━\n🏆 Winner: ${result.winner === 1 ? myPetDef.emoji : enemyPetDef.emoji} **${result.winner === 1 ? myPet.name : enemyPet.name}** (<@${winner.id}>)\n💀 Loser: ${result.winner === 1 ? enemyPetDef.emoji : myPetDef.emoji} **${result.winner === 1 ? enemyPet.name : myPet.name}**${taruhan > 0 ? `\n\n💰 Taruhan: 🪙 **${taruhan.toLocaleString('id-ID')}** → <@${winner.id}>` : ''}`).setFooter({ text: 'Winner +15 EXP | Loser +5 EXP' });
                interaction.editReply({ embeds: [embed] }).catch(() => {});
            }, 3000);
            return;
        }

        // ================= DUNGEON (now under /pet dungeon) =================
        if (command === 'pet' && subCmd === 'dungeon') {
            const dungeonCd = `dungeon_${guildId}_${interaction.user.id}`;
            if (fishCooldowns.has(dungeonCd) && Date.now() < fishCooldowns.get(dungeonCd)) { const rem = Math.ceil((fishCooldowns.get(dungeonCd) - Date.now()) / 60000); return interaction.reply({ content: `⏳ Dungeon cooldown! Tunggu **${rem} menit**.`, ephemeral: true }); }
            const myPet = getPetData(guildId, interaction.user.id);
            if (!myPet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
            const tierId = interaction.options.getString('tier');
            const dungeon = DUNGEON_TIERS.find(d => d.id === tierId);
            if (!dungeon) return interaction.reply({ content: '❌ Dungeon tidak ditemukan!', ephemeral: true });
            if (myPet.level < dungeon.minLevel) return interaction.reply({ content: `❌ Pet kamu butuh minimal **Level ${dungeon.minLevel}** untuk dungeon ini! (Sekarang: Lv.${myPet.level})`, ephemeral: true });
            fishCooldowns.set(dungeonCd, Date.now() + (dungeon.cooldown || 300000));
            const myPetDef = PET_DATA.find(p => p.id === myPet.petId);
            const enemies = dungeon.monsterHp.map((hp, i) => ({ hp, atk: dungeon.monsterAtk[i], def: Math.floor(dungeon.monsterAtk[i] * 0.3) }));
            
            await interaction.reply({ embeds: [new EmbedBuilder().setColor('#F39C12').setTitle(`🏰 ${dungeon.name}`).setDescription(`${myPetDef.emoji} **${myPet.name}** memasuki dungeon...\n\n> ⚔️ *Pertarungan sedang berlangsung...*\n> 🐾 Pet Lv.${myPet.level} vs ${dungeon.waves} Wave Monster`).setFooter({ text: 'Menunggu hasil...' })] });
            
            setTimeout(async () => {
                const result = simulateBattle(myPet, myPetDef, enemies);
                let reward = 0, expGain = 0;
                if (result.alive) {
                    reward = getRandomInt(dungeon.reward[0], dungeon.reward[1]);
                    expGain = dungeon.exp;
                    const freshData = getOrCreateUser(guildId, interaction.user.id);
                    freshData.balance += reward;
                    db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(freshData.balance, guildId, interaction.user.id);
                    addPetExp(guildId, interaction.user.id, expGain);
                    incrementUserStat(guildId, interaction.user.id, 'dungeon_clears');
                    await checkAchievements(interaction.guild, interaction.user.id, { type: 'dungeon_clear' });
                } else {
                    const freshData = getOrCreateUser(guildId, interaction.user.id);
                    const penalty = Math.floor(freshData.balance * 0.1);
                    freshData.balance -= penalty;
                    db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(freshData.balance, guildId, interaction.user.id);
                    db.prepare('UPDATE pets SET happiness = MAX(0, happiness - 20) WHERE id = ?').run(myPet.id);
                    addPetExp(guildId, interaction.user.id, Math.floor(dungeon.exp * 0.3));
                    reward = -penalty;
                }
                const statusText = result.alive ? `🏆 **CLEAR!**\n> 🪙 +${reward.toLocaleString('id-ID')} Money\n> ✨ +${expGain} Pet EXP\n> ❤️ HP sisa: ${result.remainingHp}` : `💀 **FAILED!**\n> 🪙 -${Math.abs(reward).toLocaleString('id-ID')} Money (10%)\n> ❤️ Happiness -20\n> ✨ +${Math.floor(dungeon.exp*0.3)} EXP`;
                const embed = new EmbedBuilder().setColor(result.alive ? '#2ECC71' : '#E74C3C').setTitle(`🏰 ${dungeon.name}`).setDescription(`${result.log.join('\n')}\n\n━━━━━━ **RESULT** ━━━━━━\n${statusText}`).setFooter({ text: `Pet: ${myPet.name} Lv.${myPet.level} | CD: ${Math.round((dungeon.cooldown||300000)/60000)} menit` });
                interaction.editReply({ embeds: [embed] }).catch(() => {});
            }, 3000);
            return;
        }

        // ================= REFINE (now under /pet refine) =================
        if (command === 'pet' && subCmd === 'refine') {
            const slot = interaction.options.getString('slot');
            const myPet = getPetData(guildId, interaction.user.id);
            if (!myPet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
            const relic = db.prepare('SELECT * FROM relics WHERE guildId = ? AND userId = ? AND slot = ? AND equipped_pet_id = ?').get(guildId, interaction.user.id, slot, myPet.id);
            if (!relic) return interaction.reply({ content: `❌ Pet kamu tidak punya relic di slot **${slot}**! Dapatkan relic dari dungeon/boss.`, ephemeral: true });
            // Check refine stone
            const hasStone = getItemCount(guildId, interaction.user.id, 'refine_stone');
            if (hasStone <= 0) return interaction.reply({ content: '❌ Kamu butuh **🪨 Refine Stone** untuk upgrade! Dapatkan dari dungeon/boss.', ephemeral: true });
            if (relic.refine_level >= 20) return interaction.reply({ content: '✅ Relic ini sudah **+20** (MAX)!', ephemeral: true });
            removeItem(guildId, interaction.user.id, 'refine_stone');
            // Success rate
            const lvl = relic.refine_level;
            const rate = lvl < 10 ? 100 : lvl < 15 ? 70 : lvl < 18 ? 50 : 30;
            const success = Math.random() * 100 < rate;
            if (success) {
                db.prepare('UPDATE relics SET refine_level = refine_level + 1 WHERE id = ?').run(relic.id);
                incrementUserStat(guildId, interaction.user.id, 'refine_successes');
                await checkAchievements(interaction.guild, interaction.user.id, { type: 'refine_success', maxRefine: (lvl + 1) >= 20 });
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ECC71').setTitle('✨ Refine Success!').setDescription(`**${relic.name}** berhasil di-upgrade!\n\n> ${slot === 'weapon' ? '⚔️' : slot === 'armor' ? '🛡️' : '💍'} **${relic.name}** +${lvl} → **+${lvl+1}**\n> Stats: +${Math.floor(relic.stat_value * (1 + (lvl+1)*0.05))} ${relic.stat_type}\n\n> Rate: ${rate}%`)] });
            } else {
                const newLvl = Math.max(0, lvl - 1);
                db.prepare('UPDATE relics SET refine_level = ? WHERE id = ?').run(newLvl, relic.id);
                return interaction.reply({ embeds: [new EmbedBuilder().setColor('#E74C3C').setTitle('💔 Refine Failed!').setDescription(`**${relic.name}** gagal di-upgrade...\n\n> ${slot === 'weapon' ? '⚔️' : slot === 'armor' ? '🛡️' : '💍'} **${relic.name}** +${lvl} → **+${newLvl}** (-1)\n\n> Rate was: ${rate}%\n> 💡 *Tip: Gunakan Protection Stone untuk mencegah turun level*`)] });
            }
        }

        // ================= BOSS BATTLE (now under /pet boss) =================
        if (command === 'pet' && group === 'boss') {
            if (subCmd === 'list') {
                let desc = '👹 **DAFTAR BOSS**\n\n';
                BOSS_LIST.forEach(b => { desc += `${b.name}\n> Level: **${b.minLevel}+** | HP: **${b.hp.toLocaleString()}** | ATK: ${b.atk} | DEF: ${b.def}\n> Reward: 🪙 ${b.reward[0].toLocaleString()}-${b.reward[1].toLocaleString()} + ${b.exp} Pet EXP\n\n`; });
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle('👹 Boss List').setColor('#E74C3C').setDescription(desc).setFooter({ text: '/boss create <boss> — buat party | /boss solo <boss> — solo' })] });
            }

            if (subCmd === 'create') {
                const myPet = getPetData(guildId, interaction.user.id);
                if (!myPet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
                const bossId = interaction.options.getString('boss');
                const boss = BOSS_LIST.find(b => b.id === bossId);
                if (!boss) return interaction.reply({ content: '❌ Boss tidak ditemukan!', ephemeral: true });
                if (myPet.level < boss.minLevel) return interaction.reply({ content: `❌ Pet butuh minimal **Lv.${boss.minLevel}**! (Sekarang: Lv.${myPet.level})`, ephemeral: true });
                if (activeBossParties.has(`${guildId}_${interaction.user.id}`)) return interaction.reply({ content: '❌ Kamu sudah punya party aktif! Gunakan `/boss start` untuk mulai.', ephemeral: true });
                
                const partyId = `${guildId}_${interaction.user.id}`;
                activeBossParties.set(partyId, { leader: interaction.user.id, bossId, members: [interaction.user.id], channelId: interaction.channelId, createdAt: Date.now() });
                
                const joinBtn = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`boss_join_${interaction.user.id}`).setLabel(`🎮 Join Party (1/10)`).setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`boss_start_${interaction.user.id}`).setLabel('⚔️ Start Battle').setStyle(ButtonStyle.Danger)
                );
                
                const embed = new EmbedBuilder()
                    .setColor('#E74C3C')
                    .setTitle(`👹 BOSS RAID: ${boss.name}`)
                    .setDescription(`<@${interaction.user.id}> membuat party untuk melawan **${boss.name}**!\n\n> 👹 **Boss:** ${boss.name}\n> ❤️ **HP:** ${boss.hp.toLocaleString()}\n> ⚔️ **ATK:** ${boss.atk} | 🛡️ **DEF:** ${boss.def}\n> 🎁 **Reward:** 🪙 ${boss.reward[0].toLocaleString()}-${boss.reward[1].toLocaleString()}/member\n> 🎯 **Min Level:** ${boss.minLevel}\n\n**Party Members (1/10):**\n> 👑 <@${interaction.user.id}> (Leader)\n\n*Klik tombol Join untuk bergabung!*`)
                    .setFooter({ text: 'Party auto-expire dalam 5 menit | Leader klik Start untuk mulai' });
                
                await interaction.reply({ embeds: [embed], components: [joinBtn] });
                
                // Auto-expire after 5 min
                setTimeout(() => { if (activeBossParties.has(partyId)) { activeBossParties.delete(partyId); } }, 300000);
                return;
            }

            if (subCmd === 'solo') {
                const bossCd = `boss_${guildId}_${interaction.user.id}`;
                if (fishCooldowns.has(bossCd) && Date.now() < fishCooldowns.get(bossCd)) { const rem = Math.ceil((fishCooldowns.get(bossCd) - Date.now()) / 60000); return interaction.reply({ content: `⏳ Boss cooldown! Tunggu **${rem} menit**.`, ephemeral: true }); }
                const myPet = getPetData(guildId, interaction.user.id);
                if (!myPet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
                const bossId = interaction.options.getString('boss');
                const boss = BOSS_LIST.find(b => b.id === bossId);
                if (!boss) return interaction.reply({ content: '❌ Boss tidak ditemukan!', ephemeral: true });
                if (myPet.level < boss.minLevel) return interaction.reply({ content: `❌ Pet butuh minimal **Lv.${boss.minLevel}**!`, ephemeral: true });
                fishCooldowns.set(bossCd, Date.now() + 600000); // 10 min cooldown solo
                
                const myPetDef = PET_DATA.find(p => p.id === myPet.petId);
                const result = simulateBattle(myPet, myPetDef, [{ hp: boss.hp, atk: boss.atk, def: boss.def }]);
                
                let reward = 0, expGain = 0;
                if (result.alive) {
                    reward = getRandomInt(boss.reward[0], boss.reward[1]);
                    expGain = boss.exp;
                    userData.balance += reward;
                    db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                    addPetExp(guildId, interaction.user.id, expGain);
                    incrementUserStat(guildId, interaction.user.id, 'boss_kills');
                    await checkAchievements(interaction.guild, interaction.user.id, { type: 'boss_kill' });
                    // Chance drop relic
                    if (Math.random() < 0.3) {
                        const slot = ['weapon', 'armor', 'accessory'][Math.floor(Math.random() * 3)];
                        const rarity = Math.random() < 0.1 ? 'Legendary' : Math.random() < 0.3 ? 'Epic' : 'Rare';
                        const names = RELIC_NAMES[slot];
                        const name = names[Math.floor(Math.random() * names.length)];
                        const statType = slot === 'weapon' ? 'atk' : slot === 'armor' ? 'def' : (Math.random() < 0.5 ? 'spd' : 'crit');
                        const statVal = rarity === 'Legendary' ? getRandomInt(50,80) : rarity === 'Epic' ? getRandomInt(35,50) : getRandomInt(20,35);
                        db.prepare('INSERT INTO relics (guildId, userId, name, slot, rarity, stat_type, stat_value) VALUES (?, ?, ?, ?, ?, ?, ?)').run(guildId, interaction.user.id, name, slot, rarity, statType, statVal);
                        reward = `${reward} + 📿 **${name}** (${rarity})`;
                    }
                    // Drop refine stone
                    addItem(guildId, interaction.user.id, 'refine_stone', getRandomInt(1, 3));
                } else {
                    const penalty = Math.floor(userData.balance * 0.05);
                    userData.balance -= penalty;
                    db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                    db.prepare('UPDATE pets SET happiness = MAX(0, happiness - 10) WHERE id = ?').run(myPet.id);
                    addPetExp(guildId, interaction.user.id, Math.floor(boss.exp * 0.3));
                    reward = -penalty;
                }
                
                const statusText = result.alive ? `🏆 **BOSS DEFEATED!**\n> 🪙 Reward: ${typeof reward === 'string' ? reward : '+' + reward.toLocaleString('id-ID')}\n> ✨ +${expGain} Pet EXP\n> 🪨 +1-3 Refine Stone` : `💀 **FAILED!**\n> 🪙 -${Math.abs(reward).toLocaleString('id-ID')} (5% penalty)\n> ❤️ Happiness -10`;
                const embed = new EmbedBuilder().setColor(result.alive ? '#FFD700' : '#E74C3C').setTitle(`👹 Solo Boss: ${boss.name}`).setDescription(`${result.log.join('\n')}\n\n━━━━━━ **RESULT** ━━━━━━\n${statusText}`).setFooter({ text: 'Cooldown: 10 menit (solo)' });
                return interaction.reply({ embeds: [embed] });
            }

            if (subCmd === 'start') {
                const partyId = `${guildId}_${interaction.user.id}`;
                const party = activeBossParties.get(partyId);
                if (!party) return interaction.reply({ content: '❌ Kamu tidak punya party aktif! Gunakan `/boss create` dulu.', ephemeral: true });
                if (party.leader !== interaction.user.id) return interaction.reply({ content: '❌ Hanya leader yang bisa start!', ephemeral: true });
                activeBossParties.delete(partyId);
                
                const boss = BOSS_LIST.find(b => b.id === party.bossId);
                // All members attack boss together
                let totalDmg = 0, bossHp = boss.hp, log = [`👹 **${boss.name}** — HP: ${boss.hp.toLocaleString()}\n`];
                for (const memberId of party.members) {
                    const mPet = getPetData(guildId, memberId);
                    if (!mPet) continue;
                    const mPetDef = PET_DATA.find(p => p.id === mPet.petId);
                    const dmg = (mPet.atk + mPet.level) * getRandomInt(3, 6);
                    totalDmg += dmg;
                    log.push(`> ${mPetDef ? mPetDef.emoji : '🐾'} **${mPet.name}** (Lv.${mPet.level}) dealt **${dmg}** dmg`);
                }
                
                const won = totalDmg >= boss.hp;
                log.push(`\n> 💥 Total Damage: **${totalDmg.toLocaleString()}** / ${boss.hp.toLocaleString()} HP`);
                
                if (won) {
                    log.push(`\n🏆 **BOSS DEFEATED!**`);
                    for (const memberId of party.members) {
                        const reward = getRandomInt(boss.reward[0], boss.reward[1]);
                        const memberData = getOrCreateUser(guildId, memberId);
                        memberData.balance += reward;
                        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(memberData.balance, guildId, memberId);
                        addPetExp(guildId, memberId, boss.exp);
                        addItem(guildId, memberId, 'refine_stone', getRandomInt(1, 2));
                        incrementUserStat(guildId, memberId, 'boss_kills');
                        await checkAchievements(interaction.guild, memberId, { type: 'boss_kill' });
                        // 20% chance relic per member
                        if (Math.random() < 0.2) {
                            const slot = ['weapon', 'armor', 'accessory'][Math.floor(Math.random() * 3)];
                            const rarity = Math.random() < 0.1 ? 'Legendary' : Math.random() < 0.3 ? 'Epic' : 'Rare';
                            const names = RELIC_NAMES[slot]; const name = names[Math.floor(Math.random() * names.length)];
                            const statType = slot === 'weapon' ? 'atk' : slot === 'armor' ? 'def' : (Math.random() < 0.5 ? 'spd' : 'crit');
                            const statVal = rarity === 'Legendary' ? getRandomInt(50,80) : rarity === 'Epic' ? getRandomInt(35,50) : getRandomInt(20,35);
                            db.prepare('INSERT INTO relics (guildId, userId, name, slot, rarity, stat_type, stat_value) VALUES (?, ?, ?, ?, ?, ?, ?)').run(guildId, memberId, name, slot, rarity, statType, statVal);
                        }
                    }
                    log.push(`> 🎁 Reward dibagikan ke ${party.members.length} member!`);
                } else {
                    log.push(`\n💀 **FAILED!** Damage tidak cukup.`);
                    for (const memberId of party.members) {
                        const memberData = getOrCreateUser(guildId, memberId);
                        const penalty = Math.floor(memberData.balance * 0.05);
                        memberData.balance -= penalty;
                        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(memberData.balance, guildId, memberId);
                    }
                    log.push(`> 🪙 Semua member kehilangan 5% money`);
                }
                
                const embed = new EmbedBuilder().setColor(won ? '#FFD700' : '#E74C3C').setTitle(`👹 BOSS RAID: ${boss.name}`).setDescription(log.join('\n')).setFooter({ text: `Party: ${party.members.length} members` });
                return interaction.reply({ embeds: [embed] });
            }
        }

        if (command === 'admin_shop') { if (!isAdmin) return interaction.reply({content: '❌ Admin Only', ephemeral: true}); if (subCmd === 'add_item') { const nama = interaction.options.getString('nama'), harga = interaction.options.getInteger('harga'), isi = interaction.options.getString('isi').replace(/\\n/g, '\n'), jumlah = interaction.options.getInteger('jumlah') || 1; const stmt = db.prepare('INSERT INTO shop_items (guildId, name, price, content) VALUES (?, ?, ?, ?)'); for (let i = 0; i < jumlah; i++) stmt.run(guildId, nama, harga, isi); return interaction.reply(`✅ **${jumlah} stok** barang **${nama}** ditambah.`); } if (subCmd === 'add_role') { db.prepare('INSERT OR REPLACE INTO shop_roles (guildId, roleId, price) VALUES (?, ?, ?)').run(guildId, interaction.options.getRole('role').id, interaction.options.getInteger('harga')); return interaction.reply(`✅ Role ditambah.`); } if (subCmd === 'set_custom_role') { const harga = interaction.options.getInteger('harga'); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'custom_role_price', harga.toString()); if (harga <= 0) return interaction.reply('🛑 Custom Role dimatikan.'); return interaction.reply(`✅ Harga Custom Role: 🪙 **${harga.toLocaleString('id-ID')}**.`); } if (subCmd === 'voucher_add') { const code = interaction.options.getString('kode').toUpperCase(), reward = interaction.options.getInteger('reward'), limit = interaction.options.getInteger('limit'); db.prepare('INSERT OR REPLACE INTO vouchers (guildId, code, reward, max_uses, current_uses) VALUES (?, ?, ?, ?, 0)').run(guildId, code, reward, limit); return interaction.reply(`🎟️ Voucher \`${code}\` dibuat!`); } if (subCmd === 'set_testimoni') { db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'testimoni_channel', interaction.options.getChannel('channel').id); return interaction.reply(`✅ Testimoni diatur!`); } if (subCmd === 'history') { const logs = db.prepare('SELECT * FROM logs WHERE guildId = ? ORDER BY time DESC LIMIT ?').all(guildId, Math.min(interaction.options.getInteger('jumlah') || 10, 50)); if (logs.length === 0) return interaction.reply('Kosong.'); let logTxt = '📜 **RIWAYAT TRANSAKSI**\n\n'; logs.forEach(l => { logTxt += `\`[${new Date(l.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'short', timeStyle: 'short' })}]\` <@${l.userId}> beli **${l.item}** (🪙 ${l.price.toLocaleString('id-ID')})\n`; }); return interaction.reply({ embeds: [new EmbedBuilder().setDescription(logTxt).setColor('#2B2D31')], allowedMentions: {users: []} }); } }

        if (command === 'shop') {
            const roles = db.prepare('SELECT * FROM shop_roles WHERE guildId = ?').all(guildId);
            const items = db.prepare('SELECT name, price, COUNT(*) as stock FROM shop_items WHERE guildId = ? GROUP BY name, price').all(guildId);
            const crPrice = parseInt(getSetting(guildId, 'custom_role_price', '0'));
            
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

            // 🎣 FISHING section (Joran + Umpan)
            if (componentsRows.length < 5) {
                shopDesc += '🎣 **FISHING**\n';
                ROD_TYPES.filter(r => r.price > 0).forEach(r => { shopDesc += `> ${r.emoji} ${r.name} — 🪙 **${r.price.toLocaleString('id-ID')}** | CD: ${r.cooldown}s\n`; });
                BAIT_TYPES.filter(b => b.price > 0).forEach(b => { shopDesc += `> ${b.emoji} ${b.name} — 🪙 **${b.price.toLocaleString('id-ID')}** | +${b.rareBonus}% Rare\n`; });
                shopDesc += '\n';
                const fishingMenu = new StringSelectMenuBuilder().setCustomId('shop_buy_fishing').setPlaceholder('🎣 Beli Joran / Umpan...').setMinValues(1).setMaxValues(1);
                ROD_TYPES.filter(r => r.price > 0).forEach(r => { fishingMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${r.name} (🪙 ${r.price.toLocaleString('id-ID')})`).setValue(`rod_${r.id}`).setDescription(`CD: ${r.cooldown}s | +${r.rareBonus}% Rare`)); });
                BAIT_TYPES.filter(b => b.price > 0).slice(0, 15).forEach(b => { fishingMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${b.name} (🪙 ${b.price.toLocaleString('id-ID')})`).setValue(`bait_${b.id}`).setDescription(`+${b.rareBonus}% chance ikan langka`)); });
                if (componentsRows.length < 5) componentsRows.push(new ActionRowBuilder().addComponents(fishingMenu));
            }

            // 🌾 FARMING section (Bibit + Pupuk)
            if (componentsRows.length < 5) {
                shopDesc += '🌾 **FARMING**\n';
                FARM_CROPS.slice(0, 6).forEach(c => { shopDesc += `> ${c.emoji} ${c.name} — 🪙 **${c.cost}** | ${c.time}m\n`; });
                shopDesc += `> *...dan ${FARM_CROPS.length - 6} bibit lainnya*\n`;
                FARM_FERTILIZERS.filter(f => f.cost > 0).forEach(f => { shopDesc += `> ${f.emoji} ${f.name} — 🪙 **${f.cost}** | -${Math.round(f.speedBonus*100)}% waktu\n`; });
                shopDesc += '\n';
                const farmMenu = new StringSelectMenuBuilder().setCustomId('shop_buy_farming').setPlaceholder('🌾 Beli Bibit / Pupuk...').setMinValues(1).setMaxValues(1);
                FARM_CROPS.slice(0, 20).forEach(c => { farmMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${c.name} (🪙 ${c.cost})`).setValue(`crop_${c.id}`).setDescription(`${c.tier} | ${c.time}m | Jual: 🪙${c.sellPrice}`)); });
                FARM_FERTILIZERS.filter(f => f.cost > 0).forEach(f => { farmMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${f.name} (🪙 ${f.cost})`).setValue(`fert_${f.id}`).setDescription(`-${Math.round(f.speedBonus*100)}% waktu | +${Math.round(f.yieldBonus*100)}% hasil`)); });
                if (componentsRows.length < 5) componentsRows.push(new ActionRowBuilder().addComponents(farmMenu));
            }

            // 🐾 PET section (Food + Eggs)
            if (componentsRows.length < 5) {
                shopDesc += '🐾 **PET**\n';
                PET_FOODS.forEach(f => { shopDesc += `> ${f.emoji} ${f.name} — 🪙 **${f.price}** | +${f.hunger} Hunger +${f.happiness} Happy\n`; });
                PET_EGGS.forEach(e => { shopDesc += `> ${e.emoji} ${e.name} — 🪙 **${e.price.toLocaleString('id-ID')}**\n`; });
                shopDesc += '\n';
                const petShopMenu = new StringSelectMenuBuilder().setCustomId('shop_buy_pet').setPlaceholder('🐾 Beli Pet Food / Egg...').setMinValues(1).setMaxValues(1);
                PET_FOODS.forEach(f => { petShopMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${f.name} (🪙 ${f.price})`).setValue(`food_${f.id}`).setDescription(`Hunger +${f.hunger} | Happy +${f.happiness}`)); });
                PET_EGGS.forEach(e => { petShopMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${e.name} (🪙 ${e.price.toLocaleString('id-ID')})`).setValue(`egg_${e.id}`).setDescription(`Gacha Pet Egg`)); });
                if (componentsRows.length < 5) componentsRows.push(new ActionRowBuilder().addComponents(petShopMenu));
            }

            // 📿 BATTLE section (Refine Stone + Protection Stone)
            const battleItems = ITEMS.filter(i => i.category === 'Battle');
            if (battleItems.length > 0) {
                shopDesc += '📿 **BATTLE**\n';
                battleItems.forEach(item => { shopDesc += `> ${item.emoji} ${item.name} — 🪙 **${item.price.toLocaleString('id-ID')}** | ${item.desc}\n`; });
                shopDesc += '\n';
            }

            // Truncate desc if too long
            if (shopDesc.length > 4000) shopDesc = shopDesc.substring(0, 3990) + '\n\n*...lihat /fishing shop & /farm shop untuk detail*';

            return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🛒 ${interaction.guild.name.toUpperCase()} STORE`).setColor('#2B2D31').setDescription(shopDesc).setFooter({ text: `💰 Saldo: ${userData.balance.toLocaleString('id-ID')} | Pilih dari menu di bawah` })], components: componentsRows });
        }


        // ================= STREAK (user: via /me, admin: via /streak) =================
        if (command === 'me' && subCmd === 'streak') { const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id), emoji = getSetting(guildId, 'streak_emoji', '🔥'), count = sData ? sData.count : 0; return interaction.reply({content: `${emoji} **Streak:** \`${count} Hari\` berturut-turut!`}); }
        if (command === 'me' && subCmd === 'restore') { const currentMonth = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).substring(0, 7); let restoreData = db.prepare('SELECT * FROM streak_restores WHERE guildId = ? AND userId = ? AND month = ?').get(guildId, interaction.user.id, currentMonth); const restoreCount = restoreData ? restoreData.count : 0; if (restoreCount >= 3) return interaction.reply({ content: '❌ Batas restore (3x) bulan ini habis!', ephemeral: true }); const history = db.prepare('SELECT * FROM streak_history WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id); if (!history || history.lost_count <= 1) return interaction.reply({ content: '❌ Tidak ada streak terputus.', ephemeral: true }); const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, interaction.user.id), currentCount = sData ? sData.count : 0, newCount = history.lost_count + currentCount; db.prepare('UPDATE streaks SET count = ? WHERE guildId = ? AND userId = ?').run(newCount, guildId, interaction.user.id); db.prepare('DELETE FROM streak_history WHERE guildId = ? AND userId = ?').run(guildId, interaction.user.id); if (restoreData) db.prepare('UPDATE streak_restores SET count = count + 1 WHERE guildId = ? AND userId = ? AND month = ?').run(guildId, interaction.user.id, currentMonth); else db.prepare('INSERT INTO streak_restores (guildId, userId, month, count) VALUES (?, ?, ?, 1)').run(guildId, interaction.user.id, currentMonth); return interaction.reply({ content: `✅ Streak dipulihkan! Total: **${newCount} Hari**. (Sisa: ${2 - restoreCount}x)`, ephemeral: true }); }

        if (command === 'streak') {
            if (!isAdmin) return interaction.reply({content: '❌ Hanya Admin!', ephemeral: true});
            if (subCmd === 'setting') { const status = interaction.options.getString('status'), autoNick = interaction.options.getString('autonick'), minHari = interaction.options.getInteger('min_hari'), emoji = interaction.options.getString('emoji') || '🔥'; db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_enabled', status); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_auto_nick', autoNick); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_min', minHari.toString()); db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'streak_emoji', emoji); return interaction.reply(`✅ Streak: ${status === 'true' ? 'ON' : 'OFF'} | Nick: ${autoNick === 'true' ? 'Ya' : 'Tidak'} | Min: ${minHari} | Emoji: ${emoji}`); }
            if (subCmd === 'admin_set') { const target = interaction.options.getUser('user'), amount = interaction.options.getInteger('jumlah'), today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); db.prepare('INSERT OR REPLACE INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, ?, ?)').run(guildId, target.id, amount, today); return interaction.reply(`✅ Streak <@${target.id}> = **${amount}**.`); }
            if (subCmd === 'admin_reset') { const target = interaction.options.getUser('user'); db.prepare('DELETE FROM streaks WHERE guildId = ? AND userId = ?').run(guildId, target.id); db.prepare('DELETE FROM streak_history WHERE guildId = ? AND userId = ?').run(guildId, target.id); return interaction.reply(`🗑️ Streak <@${target.id}> reset ke 0.`); }
            if (subCmd === 'admin_restore') { const target = interaction.options.getUser('user'), history = db.prepare('SELECT * FROM streak_history WHERE guildId = ? AND userId = ?').get(guildId, target.id); if (!history || history.lost_count <= 1) return interaction.reply({ content: '❌ Tidak ada streak terputus.', ephemeral: true }); const sData = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, target.id), currentCount = sData ? sData.count : 0, newCount = history.lost_count + currentCount, today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); db.prepare('INSERT OR REPLACE INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, ?, ?)').run(guildId, target.id, newCount, sData ? sData.last_date : today); db.prepare('DELETE FROM streak_history WHERE guildId = ? AND userId = ?').run(guildId, target.id); return interaction.reply(`✅ Streak <@${target.id}> dipulihkan: **${newCount}**.`); }
        }
    }


    // ================= SELECT MENU HANDLERS =================
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('ach_detail_')) { const targetUserId = interaction.customId.replace('ach_detail_', ''), selectedCat = interaction.values[0], catAchs = ACHIEVEMENTS.filter(a => a.category === selectedCat), userAchs = db.prepare('SELECT * FROM achievements WHERE guildId = ? AND userId = ?').all(guildId, targetUserId), unlockedIds = userAchs.map(a => a.achievementId); const catUnlocked = catAchs.filter(a => unlockedIds.includes(a.id)).length; const catIcon = { Social: '💬', Economy: '💰', Level: '📈', Streak: '🔥', Gambling: '🎰', Events: '🎮', Voice: '🎙️', Quest: '📜', Special: '✨', Fishing: '🎣', Farming: '🌾' }[selectedCat] || '📁'; let desc = `${catIcon} **${selectedCat}** — ${catUnlocked}/${catAchs.length} unlocked\n━━━━━━━━━━━━━━━━━━━━━━\n\n`; for (const ach of catAchs) { const unlocked = unlockedIds.includes(ach.id); const status = unlocked ? '✅' : '🔒'; const nameStyle = unlocked ? `**${ach.name}**` : `~~${ach.name}~~`; desc += `${status} ${ach.emoji} ${nameStyle}\n> *${ach.desc}*\n> Hadiah: 🪙 ${ach.reward.toLocaleString('id-ID')} Money${unlocked ? ' ✓ Diklaim' : ''}\n\n`; } return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${catIcon} Achievement: ${selectedCat}`).setColor(catUnlocked === catAchs.length ? '#FFD700' : '#2B2D31').setDescription(desc).setFooter({ text: catUnlocked === catAchs.length ? '🎉 Kategori ini sudah COMPLETE!' : `${catAchs.length - catUnlocked} badge tersisa` })], ephemeral: true }); }
        if (interaction.customId === 'shop_buy_custom_role') { const crPrice = parseInt(getSetting(guildId, 'custom_role_price', '0')), userData = getOrCreateUser(guildId, interaction.user.id); if (userData.balance < crPrice) return interaction.reply({ content: '❌ Uang kurang!', ephemeral: true }); const colorMenu = new StringSelectMenuBuilder().setCustomId('cr_select_color').setPlaceholder('🎨 Pilih Warna...').addOptions(new StringSelectMenuOptionBuilder().setLabel('🔴 Merah').setValue('FF0000'), new StringSelectMenuOptionBuilder().setLabel('🔵 Biru').setValue('0000FF'), new StringSelectMenuOptionBuilder().setLabel('🟢 Hijau').setValue('00FF00'), new StringSelectMenuOptionBuilder().setLabel('🟡 Kuning').setValue('FFFF00'), new StringSelectMenuOptionBuilder().setLabel('🟣 Ungu').setValue('800080'), new StringSelectMenuOptionBuilder().setLabel('🌸 Pink').setValue('FFC0CB'), new StringSelectMenuOptionBuilder().setLabel('⚫ Hitam').setValue('010101'), new StringSelectMenuOptionBuilder().setLabel('⚪ Putih').setValue('FFFFFF'), new StringSelectMenuOptionBuilder().setLabel('⚙️ Hex Sendiri').setValue('custom')); return interaction.reply({ content: 'Pilih warna:', components: [new ActionRowBuilder().addComponents(colorMenu)], ephemeral: true }); }
        if (interaction.customId === 'cr_select_color') { const selectedColor = interaction.values[0], modal = new ModalBuilder().setCustomId(`submit_cr_${selectedColor}`).setTitle('Custom Role 🎨'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cr_name').setLabel('Nama Role (Max 32)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32))); if (selectedColor === 'custom') modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cr_color').setLabel('Hex (#FF0000)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(7).setMaxLength(7).setPlaceholder('#FFFFFF'))); return interaction.showModal(modal); }
        // --- FISHING SHOP BUY ---
        if (interaction.customId === 'fishing_buy_rod' || interaction.customId === 'fishing_buy_bait' || interaction.customId === 'shop_buy_fishing') {
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
        if (interaction.customId === 'farm_buy_fertilizer') {
            const fertId = interaction.values[0], userData = getOrCreateUser(guildId, interaction.user.id);
            const fert = FARM_FERTILIZERS.find(f => f.id === fertId);
            if (!fert) return interaction.reply({ content: '❌ Pupuk tidak ditemukan!', ephemeral: true });
            if (userData.balance < fert.cost) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${fert.cost}**`, ephemeral: true });
            // Check if there's any unfertilized plot
            const plot = db.prepare("SELECT * FROM farm_plots WHERE guildId = ? AND userId = ? AND fertilizer = 'none' AND status != 'dead' ORDER BY plantedAt ASC LIMIT 1").get(guildId, interaction.user.id);
            if (!plot) return interaction.reply({ content: '❌ Tidak ada tanaman yang bisa dipupuk! Semua sudah dipupuk atau tidak ada tanaman.\n> Gunakan `/farm pupuk` untuk pilih tanaman spesifik.', ephemeral: true });
            userData.balance -= fert.cost;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
            db.prepare('UPDATE farm_plots SET fertilizer = ? WHERE id = ?').run(fertId, plot.id);
            const crop = FARM_CROPS.find(c => c.id === plot.cropId);
            return interaction.reply({ content: `✅ ${fert.emoji} **${fert.name}** → [Slot] ${crop ? crop.emoji + ' ' + crop.name : 'tanaman'}!\n> ⏩ -${Math.round(fert.speedBonus*100)}% waktu${fert.yieldBonus > 0 ? ` | 📈 +${Math.round(fert.yieldBonus*100)}% hasil` : ''}\n\n💡 *Tip: Gunakan \`/farm pupuk\` untuk memilih tanaman spesifik!*` });
        }
        if (interaction.customId === 'shop_buy_farming') {
            const selected = interaction.values[0], userData = getOrCreateUser(guildId, interaction.user.id);
            if (selected.startsWith('crop_')) {
                const cropId = selected.substring(5);
                const crop = FARM_CROPS.find(c => c.id === cropId);
                if (!crop) return interaction.reply({ content: '❌ Bibit tidak ditemukan!', ephemeral: true });
                if (userData.balance < crop.cost) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${crop.cost}**`, ephemeral: true });
                const maxSlots = getFarmSlots(guildId, interaction.user.id);
                const currentPlots = getPlots(guildId, interaction.user.id);
                if (currentPlots.length >= maxSlots) return interaction.reply({ content: `❌ Lahan penuh! (${currentPlots.length}/${maxSlots}) — Panen dulu atau upgrade lahan.`, ephemeral: true });
                userData.balance -= crop.cost;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                db.prepare('INSERT INTO farm_plots (guildId, userId, cropId, plantedAt, wateredAt) VALUES (?, ?, ?, ?, ?)').run(guildId, interaction.user.id, cropId, Date.now(), 0);
                return interaction.reply({ content: `✅ ${crop.emoji} **${crop.name}** ditanam!\n> ⏰ Waktu panen: ${crop.time} menit\n> 💡 Siram dengan \`/farm water\` untuk percepat!` });
            }
            if (selected.startsWith('fert_')) {
                const fertId = selected.substring(5);
                const fert = FARM_FERTILIZERS.find(f => f.id === fertId);
                if (!fert) return interaction.reply({ content: '❌ Pupuk tidak ditemukan!', ephemeral: true });
                if (userData.balance < fert.cost) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${fert.cost}**`, ephemeral: true });
                const plot = db.prepare("SELECT * FROM farm_plots WHERE guildId = ? AND userId = ? AND fertilizer = 'none' AND status != 'dead' ORDER BY plantedAt ASC LIMIT 1").get(guildId, interaction.user.id);
                if (!plot) return interaction.reply({ content: '❌ Tidak ada tanaman yang bisa dipupuk!\n> Gunakan `/farm pupuk` untuk pilih tanaman spesifik.', ephemeral: true });
                userData.balance -= fert.cost;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                db.prepare('UPDATE farm_plots SET fertilizer = ? WHERE id = ?').run(fertId, plot.id);
                const crop = FARM_CROPS.find(c => c.id === plot.cropId);
                return interaction.reply({ content: `✅ ${fert.emoji} **${fert.name}** → ${crop ? crop.emoji + ' ' + crop.name : 'tanaman'}!\n> ⏩ -${Math.round(fert.speedBonus*100)}% waktu${fert.yieldBonus > 0 ? ` | 📈 +${Math.round(fert.yieldBonus*100)}% hasil` : ''}` });
            }
        }
        if (interaction.customId === 'shop_buy_pet') {
            const selected = interaction.values[0], userData = getOrCreateUser(guildId, interaction.user.id);
            if (selected.startsWith('food_')) {
                const foodId = selected.substring(5);
                const food = PET_FOODS.find(f => f.id === foodId);
                if (!food) return interaction.reply({ content: '❌ Food tidak ditemukan!', ephemeral: true });
                if (userData.balance < food.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${food.price}**`, ephemeral: true });
                const pet = getPetData(guildId, interaction.user.id);
                if (!pet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif! Adopt dulu dengan `/pet adopt`.', ephemeral: true });
                userData.balance -= food.price;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                const newHunger = Math.min(100, pet.hunger + food.hunger);
                const newHappy = Math.min(100, pet.happiness + food.happiness);
                db.prepare('UPDATE pets SET hunger = ?, happiness = ?, exp = exp + 5 WHERE id = ?').run(newHunger, newHappy, pet.id);
                return interaction.reply({ content: `${food.emoji} **${pet.name}** makan ${food.name}!\n> 🍖 Hunger: **${newHunger}%** | ❤️ Happy: **${newHappy}%** | ✨ +5 EXP` });
            }
            if (selected.startsWith('egg_')) {
                const eggId = selected.substring(4);
                const egg = PET_EGGS.find(e => e.id === eggId);
                if (!egg) return interaction.reply({ content: '❌ Egg tidak ditemukan!', ephemeral: true });
                if (userData.balance < egg.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${egg.price.toLocaleString('id-ID')}**`, ephemeral: true });
                const allPets = getAllPets(guildId, interaction.user.id);
                if (allPets.length >= 10) return interaction.reply({ content: '❌ Slot pet penuh (max 10)!', ephemeral: true });
                userData.balance -= egg.price;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, interaction.user.id);
                let roll = Math.random() * 100, cumulative = 0, selectedTier = 'Common';
                for (const [tier, rate] of Object.entries(egg.rates)) { cumulative += rate; if (roll <= cumulative) { selectedTier = tier; break; } }
                const tierPets = PET_DATA.filter(p => p.tier === selectedTier);
                const wonPet = tierPets[Math.floor(Math.random() * tierPets.length)];
                const isFirst = allPets.length === 0 ? 1 : 0;
                const stats = generatePetStats(selectedTier);
                const pClass = PET_CLASSES[Math.floor(Math.random() * PET_CLASSES.length)];
                const pElement = PET_ELEMENTS[Math.floor(Math.random() * PET_ELEMENTS.length)];
                db.prepare('INSERT INTO pets (guildId, userId, petId, name, active, adoptedAt, class, element, hp, atk, def, spd, crit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(guildId, interaction.user.id, wonPet.id, wonPet.name, isFirst, Date.now(), pClass, pElement, stats.hp, stats.atk, stats.def, stats.spd, stats.crit);
                const tierColors = { Common: '#AAAAAA', Uncommon: '#2ECC71', Rare: '#3498DB', Epic: '#9B59B6', Legendary: '#FFD700', Mythic: '#FF6B6B' };
                let title = '🥚 Egg Hatched!';
                if (selectedTier === 'Mythic') title = '🌟✨ MYTHIC PET!!! ✨🌟';
                else if (selectedTier === 'Legendary') title = '⭐ LEGENDARY PET! ⭐';
                return interaction.reply({ embeds: [new EmbedBuilder().setColor(tierColors[selectedTier] || '#2B2D31').setTitle(title).setDescription(`${wonPet.emoji} **${wonPet.name}**\n> Tier: **${selectedTier}**\n> Bonus: +${wonPet.bonus.value}% ${wonPet.bonus.type.replace(/_/g, ' ')}`)] });
            }
        }
        if (interaction.customId === 'shop_buy_item' || interaction.customId === 'shop_buy_role') { const selected = interaction.values[0]; let itemName = '', price = 0; if (selected.startsWith('item_')) { const parts = selected.substring(5).split('_'); price = parseInt(parts.pop()); itemName = parts.join('_'); const itemInfo = db.prepare('SELECT price FROM shop_items WHERE guildId = ? AND name = ? AND price = ? LIMIT 1').get(guildId, itemName, price); if (!itemInfo) return interaction.reply({ content: '❌ Habis!', ephemeral: true }); price = itemInfo.price; } else if (selected.startsWith('role_')) { const roleId = selected.substring(5), roleInfo = db.prepare('SELECT price FROM shop_roles WHERE guildId = ? AND roleId = ?').get(guildId, roleId); if (!roleInfo) return interaction.reply({ content: '❌ Tidak dijual!', ephemeral: true }); const roleObj = interaction.guild.roles.cache.get(roleId); itemName = roleObj ? `Role: ${roleObj.name}` : 'Role'; price = roleInfo.price; } const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`confirm_${selected}`).setLabel('✅ Beli').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('cancel_buy').setLabel('❌ Batal').setStyle(ButtonStyle.Danger)); return interaction.reply({ content: `🧾 **${itemName}** — 🪙 **${price.toLocaleString('id-ID')}**\n\nLanjutkan pembelian?`, components: [row], ephemeral: true }); }
    }


    // ================= BUTTON HANDLERS =================
    if (interaction.isButton()) {
        // --- MENU HUB BUTTONS ---
        if (interaction.customId.startsWith('menu_')) {
            const cat = interaction.customId.replace('menu_', '');
            let content = '';
            if (cat === 'economy') content = '💰 **Economy Commands:**\n\n> `/economy balance` — Cek saldo\n> `/economy coinflip <taruhan>` — Lempar koin 50/50\n> `/economy slot <taruhan>` — Slot machine\n> `/economy gift @user <jumlah>` — Kirim money\n> `/economy redeem <kode>` — Tukar voucher\n> `/economy leaderboard` — Ranking global\n> `/daily` — Klaim hadiah harian';
            else if (cat === 'fishing') content = '🎣 **Fishing Commands:**\n\n> `/fish` — Lempar pancing\n> `/fishing sell` — Jual ikan\n> `/fishing inventory` — Lihat ikan\n> `/fishing collection` — Pokedex ikan\n> `/fishing shop` — Beli joran & umpan\n> `/fishing stats` — Statistik\n> `/fishing lock/unlock <id>` — Kunci ikan';
            else if (cat === 'farming') content = '🌾 **Farming Commands:**\n\n> `/farm status` — Lihat kebun\n> `/farm plant <bibit>` — Tanam\n> `/farm water` — Siram semua\n> `/farm harvest` — Panen\n> `/farm sell` — Jual hasil\n> `/farm craft <resep>` — Craft produk\n> `/farm shop` — Beli bibit & pupuk\n> `/farm upgrade` — Upgrade lahan';
            else if (cat === 'pet') content = '🐾 **Pet & Battle Commands:**\n\n> `/pet adopt/info/feed/play/hunt` — Kelola pet\n> `/pet egg <tipe>` — Gacha pet\n> `/pet dungeon <tier>` — Lawan monster\n> `/pet boss create/solo/list` — Raid boss\n> `/pet refine <slot>` — Upgrade relic\n> `/battle @user` — PvP auto-battle';
            else if (cat === 'profile') content = '📋 **Profil Commands:**\n\n> `/me profile` — Kartu profil\n> `/me achievement` — Koleksi badge\n> `/me inventory` — Lihat item\n> `/me use <item>` — Gunakan item\n> `/me quest` — Misi harian\n> `/me streak` — Info streak\n> `/me restore` — Pulihkan streak';
            else if (cat === 'shop') content = '🛒 **Shop:**\n\n> `/shop` — Buka toko lengkap\n> Kategori: 🎣 Fishing, 🌾 Farming, 🐾 Pet, 📿 Battle, 🎭 Role';
            else if (cat === 'daily') content = '🎁 **Daily Reward:**\n\n> `/daily` — Klaim hadiah harian\n> Dapat: Money + Pet EXP + Random Item\n> Bonus streak = hadiah lebih besar!';
            else if (cat === 'quest') content = '📜 **Quest:**\n\n> `/me quest` — Lihat misi harian (3 misi/hari)\n> Selesaikan untuk dapat money bonus!\n> Reset setiap 00:00 WIB';
            return interaction.reply({ content, ephemeral: true });
        }

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

        // --- BOSS PARTY BUTTONS ---
        if (interaction.customId.startsWith('boss_join_')) {
            const leaderId = interaction.customId.replace('boss_join_', '');
            const partyId = `${guildId}_${leaderId}`;
            const party = activeBossParties.get(partyId);
            if (!party) return interaction.reply({ content: '❌ Party sudah expire atau sudah dimulai!', ephemeral: true });
            if (party.members.includes(interaction.user.id)) return interaction.reply({ content: '❌ Kamu sudah di party ini!', ephemeral: true });
            const myPet = getPetData(guildId, interaction.user.id);
            if (!myPet) return interaction.reply({ content: '❌ Kamu belum punya pet aktif!', ephemeral: true });
            const boss = BOSS_LIST.find(b => b.id === party.bossId);
            if (myPet.level < boss.minLevel) return interaction.reply({ content: `❌ Pet kamu butuh minimal **Lv.${boss.minLevel}**!`, ephemeral: true });
            if (party.members.length >= 10) return interaction.reply({ content: '❌ Party sudah penuh (10/10)!', ephemeral: true });
            party.members.push(interaction.user.id);
            
            // Update embed
            const memberList = party.members.map((m, i) => `> ${i === 0 ? '👑' : '⚔️'} <@${m}>${i === 0 ? ' (Leader)' : ''}`).join('\n');
            const joinBtn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`boss_join_${leaderId}`).setLabel(`🎮 Join Party (${party.members.length}/10)`).setStyle(ButtonStyle.Success).setDisabled(party.members.length >= 10),
                new ButtonBuilder().setCustomId(`boss_start_${leaderId}`).setLabel('⚔️ Start Battle').setStyle(ButtonStyle.Danger)
            );
            const embed = new EmbedBuilder().setColor('#E74C3C').setTitle(`👹 BOSS RAID: ${boss.name}`).setDescription(`Party untuk melawan **${boss.name}**!\n\n> ❤️ HP: **${boss.hp.toLocaleString()}** | ⚔️ ATK: ${boss.atk}\n> 🎁 Reward: 🪙 ${boss.reward[0].toLocaleString()}-${boss.reward[1].toLocaleString()}/member\n\n**Party Members (${party.members.length}/10):**\n${memberList}\n\n*Leader klik Start untuk mulai!*`).setFooter({ text: 'Party expire dalam 5 menit' });
            await interaction.update({ embeds: [embed], components: [joinBtn] });
            return;
        }
        if (interaction.customId.startsWith('boss_start_')) {
            const leaderId = interaction.customId.replace('boss_start_', '');
            if (interaction.user.id !== leaderId) return interaction.reply({ content: '❌ Hanya leader yang bisa start!', ephemeral: true });
            const partyId = `${guildId}_${leaderId}`;
            const party = activeBossParties.get(partyId);
            if (!party) return interaction.reply({ content: '❌ Party tidak ditemukan!', ephemeral: true });
            activeBossParties.delete(partyId);
            
            const boss = BOSS_LIST.find(b => b.id === party.bossId);
            let totalDmg = 0, log = [`👹 **${boss.name}** — HP: ${boss.hp.toLocaleString()}\n`];
            for (const memberId of party.members) {
                const mPet = getPetData(guildId, memberId);
                if (!mPet) continue;
                const mPetDef = PET_DATA.find(p => p.id === mPet.petId);
                const dmg = (mPet.atk + mPet.level) * getRandomInt(3, 6);
                totalDmg += dmg;
                log.push(`> ${mPetDef ? mPetDef.emoji : '🐾'} **${mPet.name}** (Lv.${mPet.level}) → **${dmg}** dmg`);
            }
            const won = totalDmg >= boss.hp;
            log.push(`\n> 💥 Total: **${totalDmg.toLocaleString()}** / ${boss.hp.toLocaleString()}`);
            
            if (won) {
                log.push(`\n🏆 **BOSS DEFEATED!**`);
                for (const memberId of party.members) {
                    const reward = getRandomInt(boss.reward[0], boss.reward[1]);
                    const md = getOrCreateUser(guildId, memberId); md.balance += reward;
                    db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(md.balance, guildId, memberId);
                    addPetExp(guildId, memberId, boss.exp);
                    addItem(guildId, memberId, 'refine_stone', getRandomInt(1, 2));
                    incrementUserStat(guildId, memberId, 'boss_kills');
                    await checkAchievements(interaction.guild, memberId, { type: 'boss_kill' });
                    if (Math.random() < 0.2) { const slot = ['weapon','armor','accessory'][Math.floor(Math.random()*3)]; const rarity = Math.random()<0.1?'Legendary':Math.random()<0.3?'Epic':'Rare'; const names = RELIC_NAMES[slot]; const name = names[Math.floor(Math.random()*names.length)]; const st = slot==='weapon'?'atk':slot==='armor'?'def':(Math.random()<0.5?'spd':'crit'); const sv = rarity==='Legendary'?getRandomInt(50,80):rarity==='Epic'?getRandomInt(35,50):getRandomInt(20,35); db.prepare('INSERT INTO relics (guildId, userId, name, slot, rarity, stat_type, stat_value) VALUES (?, ?, ?, ?, ?, ?, ?)').run(guildId, memberId, name, slot, rarity, st, sv); }
                }
                log.push(`> 🎁 Reward → ${party.members.length} members!`);
            } else {
                log.push(`\n💀 **FAILED!**`);
                for (const memberId of party.members) { const md = getOrCreateUser(guildId, memberId); const p = Math.floor(md.balance*0.05); md.balance -= p; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(md.balance, guildId, memberId); }
                log.push(`> 🪙 -5% money semua member`);
            }
            const embed = new EmbedBuilder().setColor(won ? '#FFD700' : '#E74C3C').setTitle(`👹 ${boss.name}`).setDescription(log.join('\n')).setFooter({ text: `${party.members.length} members` });
            await interaction.update({ embeds: [embed], components: [] });
            return;
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
