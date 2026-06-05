/**
 * RESTORE PETS - Mengembalikan pet yang hilang dari backup ke database utama
 * 
 * Masalah: Migrasi global mode hanya menyimpan 1 pet per user (karena conflict handling)
 * Solusi: Insert kembali pet yang hilang dari backup 2026-06-04_19-05-14
 * 
 * CATATAN: Jalankan dengan --dry-run untuk preview dulu, tanpa --dry-run untuk apply
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
    const SQL = await initSqlJs();
    
    // Load current DB
    const currentBuf = fs.readFileSync(path.join(__dirname, 'economy.sqlite'));
    const currentDb = new SQL.Database(currentBuf);
    
    // Load backup
    const backupBuf = fs.readFileSync(path.join(__dirname, 'backups', 'economy_2026-06-04_19-05-14.sqlite'));
    const backupDb = new SQL.Database(backupBuf);
    
    // Get current pets (by their unique identifiers)
    const currentPets = currentDb.exec('SELECT id, userId, petId, name, adoptedAt FROM pets');
    const currentSet = new Set();
    if (currentPets.length > 0) {
        currentPets[0].values.forEach(row => {
            // Use combination of userId + petId + adoptedAt as unique key
            currentSet.add(row[1] + '|' + row[2] + '|' + row[4]);
        });
    }
    console.log('Current pets in DB:', currentSet.size);
    
    // Get backup pets
    const backupResult = backupDb.exec('SELECT * FROM pets ORDER BY id');
    if (backupResult.length === 0) {
        console.log('No pets in backup!');
        return;
    }
    
    const backupCols = backupResult[0].columns;
    const backupPets = backupResult[0].values;
    
    // Find missing pets
    const missing = [];
    backupPets.forEach(row => {
        const obj = {};
        backupCols.forEach((col, i) => obj[col] = row[i]);
        
        const key = obj.userId + '|' + obj.petId + '|' + obj.adoptedAt;
        if (!currentSet.has(key)) {
            missing.push(obj);
        }
    });
    
    console.log('Missing pets to restore:', missing.length);
    console.log('');
    
    if (missing.length === 0) {
        console.log('Nothing to restore!');
        return;
    }
    
    // Show what will be restored
    missing.forEach((pet, i) => {
        console.log((i + 1) + '. "' + pet.name + '" (' + pet.petId + ') - user ' + pet.userId + ' | lvl ' + pet.level + ' | active=' + pet.active);
    });
    console.log('');
    
    if (DRY_RUN) {
        console.log('[DRY RUN] No changes applied. Remove --dry-run to apply.');
        currentDb.close();
        backupDb.close();
        return;
    }
    
    // Insert missing pets (without guildId since current schema doesn't have it)
    const insertCols = ['userId', 'petId', 'name', 'level', 'exp', 'happiness', 'hunger', 
                        'status', 'active', 'adoptedAt', 'hunting_until', 'skills', 
                        'class', 'element', 'hp', 'atk', 'def', 'spd', 'crit', 
                        'evolved', 'evoStage'];
    
    const placeholders = insertCols.map(() => '?').join(', ');
    const insertSQL = 'INSERT INTO pets (' + insertCols.join(', ') + ') VALUES (' + placeholders + ')';
    
    let restored = 0;
    missing.forEach(pet => {
        const values = insertCols.map(col => pet[col] !== undefined ? pet[col] : null);
        try {
            currentDb.run(insertSQL, values);
            restored++;
            console.log('[RESTORED] "' + pet.name + '" for user ' + pet.userId);
        } catch(e) {
            console.log('[ERROR] Failed to restore "' + pet.name + '": ' + e.message);
        }
    });
    
    console.log('\nTotal restored: ' + restored + '/' + missing.length);
    
    // Save database
    const data = currentDb.export();
    const buffer = Buffer.from(data);
    
    // Create backup of current state first
    const backupName = 'economy.pre-restore-' + new Date().toISOString().replace(/[:.]/g, '-') + '.sqlite';
    fs.copyFileSync(path.join(__dirname, 'economy.sqlite'), path.join(__dirname, backupName));
    console.log('\nBackup of current DB saved as: ' + backupName);
    
    // Write restored DB
    fs.writeFileSync(path.join(__dirname, 'economy.sqlite'), buffer);
    console.log('Database updated successfully!');
    
    // Verify
    const verifyDb = new SQL.Database(fs.readFileSync(path.join(__dirname, 'economy.sqlite')));
    const verifyResult = verifyDb.exec('SELECT COUNT(*) FROM pets');
    console.log('\nVerification - Total pets now:', verifyResult[0].values[0][0]);
    
    const byUser = verifyDb.exec('SELECT userId, COUNT(*) as cnt FROM pets GROUP BY userId');
    if (byUser.length > 0) {
        console.log('Pets per user:');
        byUser[0].values.forEach(row => {
            console.log('  user ' + row[0] + ': ' + row[1] + ' pets');
        });
    }
    verifyDb.close();
    
    currentDb.close();
    backupDb.close();
}

main().catch(console.error);
