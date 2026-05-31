// =============================================================================
// reset-data.js — LANGSUNG RESET (tanpa konfirmasi).
// Hapus SEMUA DATA kecuali streak. Backup otomatis dibuat dulu.
//
// CARA PAKAI:
//   1. Stop server.
//   2. Startup tab -> Main file = reset-data.js
//   3. Start server. Reset langsung jalan. Tunggu "SELESAI" di console.
//   4. Stop server.
//   5. Startup tab -> Main file = bot.js
//   6. Start. Beres.
// =============================================================================
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(process.cwd(), 'economy.sqlite');
if (!fs.existsSync(DB_PATH)) { console.log('❌ economy.sqlite tidak ditemukan!'); process.exit(1); }

// Backup dulu
const backupDir = path.join(process.cwd(), 'backups');
try { fs.mkdirSync(backupDir, { recursive: true }); } catch(e) {}
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = path.join(backupDir, `economy_PRE-RESET_${ts}.sqlite`);
fs.copyFileSync(DB_PATH, backupPath);
console.log('💾 Backup: ' + backupPath);

const db = new Database(DB_PATH);

// HANYA INI YANG DIPERTAHANKAN:
const KEEP = ['streaks', 'streak_history', 'streak_restores'];

// Ambil semua tabel
const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
const toWipe = allTables.filter(t => !KEEP.includes(t));

console.log('\n🔒 DIPERTAHANKAN: ' + KEEP.filter(t => allTables.includes(t)).join(', '));
console.log('🗑️  DIHAPUS: ' + toWipe.join(', '));
console.log('\n--- MENGHAPUS ---');

let total = 0;
for (const t of toWipe) {
    try {
        const count = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
        db.prepare(`DELETE FROM "${t}"`).run();
        try { db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(t); } catch(e) {}
        if (count > 0) { console.log(`   ✓ ${t}: ${count} baris dihapus`); total += count; }
    } catch(e) {
        console.log(`   ⚠️ ${t}: ERROR - ${e.message}`);
    }
}

// Verifikasi streak masih ada
const streakCount = db.prepare('SELECT COUNT(*) AS c FROM streaks').get().c;
console.log(`\n🔒 Streak tersisa: ${streakCount} baris (AMAN)`);
console.log(`🗑️  Total dihapus: ${total} baris dari ${toWipe.length} tabel`);

// Verifikasi users kosong
try {
    const usersLeft = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    console.log(`📊 users (level/exp/money): ${usersLeft} baris (harus 0)`);
} catch(e) {}

try { db.exec('VACUUM'); } catch(e) {}
db.close();

console.log('\n✅ ===== RESET SELESAI =====');
console.log('👉 STOP server → Main file = bot.js → START');
console.log('   Level, EXP, Money, Pet, Fish, Farm, Quest, Achievement → SEMUA kosong');
console.log('   Streak → TETAP AMAN');

// Keep process alive briefly so Pterodactyl shows the output
setTimeout(() => process.exit(0), 5000);
