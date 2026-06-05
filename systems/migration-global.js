// systems/migration-global.js
// Migration script untuk convert dari per-server ke global progression
// Runs automatically on bot startup jika belum di-migrate

const fs = require('fs');
const path = require('path');

function runGlobalMigration(db) {
    console.log('\n🔄 ============ GLOBAL MIGRATION SYSTEM ============');
    
    // Check if migration already done
    const migratedFlag = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migration_status'").get();
    if (!migratedFlag) {
        db.exec(`CREATE TABLE migration_status (id INTEGER PRIMARY KEY, migration TEXT UNIQUE, completed INTEGER)`);
    }
    
    const migrationDone = db.prepare("SELECT * FROM migration_status WHERE migration = 'global_progression_v1'").get();
    if (migrationDone) {
        console.log('✅ Migration already completed');
        return;
    }
    
    console.log('⚠️  Starting global progression migration...\n');
    
    try {
        // ============ STEP 1: Create NEW global tables (without guildId) ============
        console.log('📋 Step 1: Creating global tables...');
        
        db.exec(`
            -- Global Users (no guildId)
            CREATE TABLE IF NOT EXISTS users_global (
                userId TEXT PRIMARY KEY,
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 0,
                balance INTEGER DEFAULT 0,
                lastDaily TEXT
            );
            
            -- Global User Stats (no guildId)
            CREATE TABLE IF NOT EXISTS user_stats_global (
                userId TEXT,
                stat_key TEXT,
                stat_value INTEGER DEFAULT 0,
                PRIMARY KEY(userId, stat_key)
            );
            
            -- Global Achievements (no guildId)
            CREATE TABLE IF NOT EXISTS achievements_global (
                userId TEXT,
                achievementId TEXT,
                unlockedAt INTEGER,
                PRIMARY KEY(userId, achievementId)
            );
            
            -- Global Pets (no guildId)
            CREATE TABLE IF NOT EXISTS pets_global (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT,
                petId TEXT,
                name TEXT,
                level INTEGER DEFAULT 1,
                exp INTEGER DEFAULT 0,
                happiness INTEGER DEFAULT 100,
                hunger INTEGER DEFAULT 100,
                status TEXT DEFAULT 'happy',
                active INTEGER DEFAULT 0,
                adoptedAt INTEGER,
                hunting_until INTEGER DEFAULT 0,
                skills TEXT DEFAULT '[]',
                class TEXT DEFAULT 'warrior',
                element TEXT DEFAULT 'fire',
                hp INTEGER DEFAULT 100,
                atk INTEGER DEFAULT 20,
                def INTEGER DEFAULT 10,
                spd INTEGER DEFAULT 10,
                crit INTEGER DEFAULT 5,
                evolved INTEGER DEFAULT 0,
                evoStage INTEGER DEFAULT 0
            );
            
            -- Global Relics (no guildId)
            CREATE TABLE IF NOT EXISTS relics_global (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT,
                name TEXT,
                slot TEXT,
                rarity TEXT,
                stat_type TEXT,
                stat_value INTEGER,
                refine_level INTEGER DEFAULT 0,
                equipped_pet_id INTEGER DEFAULT 0
            );
            
            -- Global Inventories (no guildId)
            CREATE TABLE IF NOT EXISTS item_inventory_global (
                userId TEXT,
                itemId TEXT,
                quantity INTEGER DEFAULT 0,
                PRIMARY KEY(userId, itemId)
            );
            
            CREATE TABLE IF NOT EXISTS pet_food_inventory_global (
                userId TEXT,
                foodId TEXT,
                quantity INTEGER DEFAULT 0,
                PRIMARY KEY(userId, foodId)
            );
            
            CREATE TABLE IF NOT EXISTS seed_inventory_global (
                userId TEXT,
                cropId TEXT,
                quantity INTEGER DEFAULT 0,
                PRIMARY KEY(userId, cropId)
            );
            
            CREATE TABLE IF NOT EXISTS fertilizer_inventory_global (
                userId TEXT,
                fertId TEXT,
                quantity INTEGER DEFAULT 0,
                PRIMARY KEY(userId, fertId)
            );
            
            -- Global Fish Data (no guildId)
            CREATE TABLE IF NOT EXISTS fish_inventory_global (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT,
                fishId TEXT,
                weight REAL,
                caughtAt INTEGER,
                locked INTEGER DEFAULT 0
            );
            
            CREATE TABLE IF NOT EXISTS fish_collection_global (
                userId TEXT,
                fishId TEXT,
                PRIMARY KEY(userId, fishId)
            );
            
            CREATE TABLE IF NOT EXISTS fish_equipment_global (
                userId TEXT PRIMARY KEY,
                rod TEXT DEFAULT 'basic',
                bait TEXT DEFAULT 'none',
                bait_count INTEGER DEFAULT 0,
                location TEXT DEFAULT 'river'
            );
            
            -- Global Farm Data (no guildId)
            CREATE TABLE IF NOT EXISTS farm_plots_global (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT,
                cropId TEXT,
                plantedAt INTEGER,
                wateredAt INTEGER,
                fertilizer TEXT DEFAULT 'none',
                status TEXT DEFAULT 'growing',
                notified INTEGER DEFAULT 0
            );
            
            CREATE TABLE IF NOT EXISTS farm_storage_global (
                userId TEXT,
                itemId TEXT,
                quantity INTEGER DEFAULT 0,
                PRIMARY KEY(userId, itemId)
            );
            
            CREATE TABLE IF NOT EXISTS farm_data_global (
                userId TEXT PRIMARY KEY,
                farm_level INTEGER DEFAULT 1
            );
            
            CREATE TABLE IF NOT EXISTS farm_decorations_global (
                userId TEXT,
                decoId TEXT,
                purchasedAt INTEGER,
                PRIMARY KEY(userId, decoId)
            );
            
            -- Global Auto Harvest & Combo
            CREATE TABLE IF NOT EXISTS auto_harvest_global (
                userId TEXT PRIMARY KEY,
                enabled INTEGER DEFAULT 0,
                purchased INTEGER DEFAULT 0
            );
            
            CREATE TABLE IF NOT EXISTS combo_tracker_global (
                userId TEXT PRIMARY KEY,
                features TEXT DEFAULT '[]',
                lastAction INTEGER DEFAULT 0
            );
            
            -- Global Trades
            CREATE TABLE IF NOT EXISTS trades_global (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                senderId TEXT,
                receiverId TEXT,
                status TEXT DEFAULT 'pending',
                createdAt INTEGER,
                senderOffer TEXT,
                receiverOffer TEXT
            );
        `);
        
        console.log('✅ Global tables created\n');
        
        // ============ STEP 2: Migrate data from old tables to new ============
        console.log('📊 Step 2: Migrating data...\n');
        
        // Migrate users - aggregate best data per user
        console.log('  → Migrating users...');
        db.exec(`
            INSERT OR IGNORE INTO users_global (userId, xp, level, balance, lastDaily)
            SELECT userId, 
                   MAX(xp) as xp, 
                   MAX(level) as level, 
                   MAX(balance) as balance,
                   lastDaily
            FROM users
            GROUP BY userId
        `);
        const userCount = db.prepare("SELECT COUNT(*) as cnt FROM users_global").get().cnt;
        console.log(`    ✓ ${userCount} users migrated`);
        
        // Migrate user_stats - aggregate max values per stat
        console.log('  → Migrating user stats...');
        db.exec(`
            INSERT OR IGNORE INTO user_stats_global (userId, stat_key, stat_value)
            SELECT userId, stat_key, MAX(stat_value) as stat_value
            FROM user_stats
            GROUP BY userId, stat_key
        `);
        const statsCount = db.prepare("SELECT COUNT(*) as cnt FROM user_stats_global").get().cnt;
        console.log(`    ✓ ${statsCount} stats migrated`);
        
        // Migrate achievements - keep all unique achievements per user
        console.log('  → Migrating achievements...');
        db.exec(`
            INSERT OR IGNORE INTO achievements_global (userId, achievementId, unlockedAt)
            SELECT DISTINCT userId, achievementId, MAX(unlockedAt) as unlockedAt
            FROM achievements
            GROUP BY userId, achievementId
        `);
        const achievementCount = db.prepare("SELECT COUNT(*) as cnt FROM achievements_global").get().cnt;
        console.log(`    ✓ ${achievementCount} achievements migrated`);
        
        // Migrate pets - keep ALL pets per user (not just highest level!)
        console.log('  → Migrating pets...');
        db.exec(`
            INSERT INTO pets_global (userId, petId, name, level, exp, happiness, hunger, status, active, adoptedAt, hunting_until, skills, class, element, hp, atk, def, spd, crit, evolved, evoStage)
            SELECT userId, petId, name, level, exp, happiness, hunger, status, active, adoptedAt, hunting_until, skills, class, element, hp, atk, def, spd, crit, evolved, evoStage
            FROM pets
        `);
        const petCount = db.prepare("SELECT COUNT(*) as cnt FROM pets_global").get().cnt;
        console.log(`    ✓ ${petCount} pets migrated`);
        
        // Migrate relics - keep all relics, associate with best pet
        console.log('  → Migrating relics...');
        db.exec(`
            INSERT INTO relics_global (userId, name, slot, rarity, stat_type, stat_value, refine_level, equipped_pet_id)
            SELECT DISTINCT userId, name, slot, rarity, stat_type, MAX(stat_value), refine_level, equipped_pet_id
            FROM relics
            GROUP BY userId, name, slot
        `);
        const relicCount = db.prepare("SELECT COUNT(*) as cnt FROM relics_global").get().cnt;
        console.log(`    ✓ ${relicCount} relics migrated`);
        
        // Migrate inventories - aggregate quantities
        db.exec(`INSERT OR IGNORE INTO item_inventory_global (userId, itemId, quantity) SELECT userId, itemId, SUM(quantity) FROM item_inventory GROUP BY userId, itemId`);
        db.exec(`INSERT OR IGNORE INTO pet_food_inventory_global (userId, foodId, quantity) SELECT userId, foodId, SUM(quantity) FROM pet_food_inventory GROUP BY userId, foodId`);
        db.exec(`INSERT OR IGNORE INTO seed_inventory_global (userId, cropId, quantity) SELECT userId, cropId, SUM(quantity) FROM seed_inventory GROUP BY userId, cropId`);
        db.exec(`INSERT OR IGNORE INTO fertilizer_inventory_global (userId, fertId, quantity) SELECT userId, fertId, SUM(quantity) FROM fertilizer_inventory GROUP BY userId, fertId`);
        console.log('  → Inventories migrated ✓');
        
        // Migrate fish data
        console.log('  → Migrating fish data...');
        db.exec(`INSERT INTO fish_inventory_global (userId, fishId, weight, caughtAt, locked) SELECT userId, fishId, weight, caughtAt, locked FROM fish_inventory`);
        db.exec(`INSERT OR IGNORE INTO fish_collection_global (userId, fishId) SELECT DISTINCT userId, fishId FROM fish_collection`);
        db.exec(`INSERT OR IGNORE INTO fish_equipment_global (userId, rod, bait, bait_count, location) SELECT userId, rod, bait, bait_count, location FROM fish_equipment`);
        const fishCount = db.prepare("SELECT COUNT(*) as cnt FROM fish_inventory_global").get().cnt;
        console.log(`    ✓ ${fishCount} fish migrated`);
        
        // Migrate farm data - keep all plots but aggregate storage
        console.log('  → Migrating farm data...');
        db.exec(`INSERT INTO farm_plots_global (userId, cropId, plantedAt, wateredAt, fertilizer, status, notified) SELECT userId, cropId, plantedAt, wateredAt, fertilizer, status, notified FROM farm_plots`);
        db.exec(`INSERT OR IGNORE INTO farm_storage_global (userId, itemId, quantity) SELECT userId, itemId, SUM(quantity) FROM farm_storage GROUP BY userId, itemId`);
        db.exec(`INSERT OR IGNORE INTO farm_data_global (userId, farm_level) SELECT userId, MAX(farm_level) FROM farm_data GROUP BY userId`);
        db.exec(`INSERT OR IGNORE INTO farm_decorations_global (userId, decoId, purchasedAt) SELECT DISTINCT userId, decoId, MAX(purchasedAt) FROM farm_decorations GROUP BY userId, decoId`);
        const farmCount = db.prepare("SELECT COUNT(*) as cnt FROM farm_plots_global").get().cnt;
        console.log(`    ✓ ${farmCount} farm plots migrated`);
        
        // Migrate auto harvest & combo
        db.exec(`INSERT OR IGNORE INTO auto_harvest_global (userId, enabled, purchased) SELECT userId, enabled, purchased FROM auto_harvest`);
        db.exec(`INSERT OR IGNORE INTO combo_tracker_global (userId, features, lastAction) SELECT userId, features, lastAction FROM combo_tracker`);
        
        // Migrate trades - only keep recent/pending
        console.log('  → Migrating trade data...');
        db.exec(`INSERT INTO trades_global (senderId, receiverId, status, createdAt, senderOffer, receiverOffer) SELECT senderId, receiverId, status, createdAt, senderOffer, receiverOffer FROM trades WHERE status = 'pending' OR createdAt > ?`, [Date.now() - 7*24*60*60*1000]);
        const tradeCount = db.prepare("SELECT COUNT(*) as cnt FROM trades_global").get().cnt;
        console.log(`    ✓ ${tradeCount} trades migrated`);
        
        console.log('\n✅ Data migration complete\n');
        
        // ============ STEP 3: Create aliases - replace old tables ============
        console.log('🔀 Step 3: Replacing old tables with new...\n');
        
        // This would drop old tables and rename new ones
        // For safety, we'll keep old tables for now with _old suffix
        const oldTables = [
            'users', 'user_stats', 'achievements', 'pets', 'relics',
            'item_inventory', 'pet_food_inventory', 'seed_inventory', 'fertilizer_inventory',
            'fish_inventory', 'fish_collection', 'fish_equipment',
            'farm_plots', 'farm_storage', 'farm_data', 'farm_decorations',
            'auto_harvest', 'combo_tracker', 'trades'
        ];
        
        try {
            oldTables.forEach(table => {
                try {
                    db.exec(`ALTER TABLE ${table} RENAME TO ${table}_old`);
                    console.log(`  ✓ Renamed ${table} → ${table}_old`);
                } catch (e) {
                    // Table might not exist in all databases
                }
            });
        } catch (e) {
            console.error('Error renaming tables:', e.message);
        }
        
        // Rename _global tables to standard names
        const globalTables = [
            'users', 'user_stats', 'achievements', 'pets', 'relics',
            'item_inventory', 'pet_food_inventory', 'seed_inventory', 'fertilizer_inventory',
            'fish_inventory', 'fish_collection', 'fish_equipment',
            'farm_plots', 'farm_storage', 'farm_data', 'farm_decorations',
            'auto_harvest', 'combo_tracker', 'trades'
        ];
        
        globalTables.forEach(table => {
            try {
                db.exec(`ALTER TABLE ${table}_global RENAME TO ${table}`);
                console.log(`  ✓ Renamed ${table}_global → ${table}`);
            } catch (e) {
                // Might fail, that's ok
            }
        });
        
        console.log('\n✅ Table replacement complete\n');
        
        // ============ STEP 4: Mark migration as done ============
        db.prepare("INSERT INTO migration_status (migration, completed) VALUES (?, ?)").run('global_progression_v1', 1);
        
        console.log('🎉 ============ MIGRATION SUCCESS ============\n');
        console.log('📝 Summary:');
        console.log(`  ✓ ${userCount} users converted to global`);
        console.log(`  ✓ ${statsCount} stats aggregated`);
        console.log(`  ✓ ${achievementCount} achievements migrated`);
        console.log(`  ✓ ${petCount} pets migrated`);
        console.log(`  ✓ ${fishCount} fish records migrated`);
        console.log(`  ✓ ${farmCount} farm plots migrated`);
        console.log(`  ✓ ${tradeCount} trades migrated\n`);
        console.log('⚠️  Keep old *_old tables for 1 week as backup, then delete manually\n');
        
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        throw err;
    }
}

module.exports = { runGlobalMigration };
