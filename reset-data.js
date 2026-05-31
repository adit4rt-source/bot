// =============================================================================
// reset-data.js — ONE-TIME DATA RESET (for bot release / fresh start)
// =============================================================================
// Wipes ALL data from ALL tables EXCEPT the streak tables, GLOBALLY (every guild).
// It ALWAYS makes a timestamped backup first, and REQUIRES explicit confirmation.
//
// HOW TO RUN ON PTERODACTYL:
//   1. Stop the server.
//   2. Startup tab -> change "Main file" from `bot.js` to `reset-data.js`.
//   3. Start the server. In the Console, when prompted, type:  RESET   (then Enter)
//      (or set a Startup variable / env  RESET_CONFIRM=RESET  to skip the prompt)
//   4. After it prints "✅ Reset selesai", STOP the server.
//   5. Startup tab -> change "Main file" back to `bot.js`.
//   6. Start the server normally.
//
// Nothing is deleted unless you confirm. If you don't confirm within 60s it aborts.
// =============================================================================

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const Database = require('better-sqlite3');

const DB_PATH = path.join(process.cwd(), 'economy.sqlite');

// ---- Tables to KEEP (everything else gets wiped). Edit this list if needed. ----
const PRESERVE = [
    'streaks',          // streak counts (the thing we keep)
    'streak_history',   // needed so streak restore still works
    'streak_restores',  // monthly restore counters
    // --- If you ALSO want to keep server setup, uncomment lines below: ---
    // 'server_settings',   // notif channels, temp-voice category, custom role price, testimoni
    // 'config',            // XP rates / cooldowns
    // 'shop_items', 'shop_roles', 'vouchers',  // your shop inventory
    // 'rewards',           // level role rewards
    // 'economy_admins',    // bankers
];

function fail(msg) { console.error('❌ ' + msg); process.exit(1); }

if (!fs.existsSync(DB_PATH)) fail('economy.sqlite tidak ditemukan di: ' + DB_PATH);

// ---- 1) Always back up first ----
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupDir = path.join(process.cwd(), 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `economy_PRE-RESET_${ts}.sqlite`);
fs.copyFileSync(DB_PATH, backupPath);
console.log('💾 Backup dibuat: ' + backupPath);

const db = new Database(DB_PATH);
const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
const keep = PRESERVE.filter(t => allTables.includes(t));
const toWipe = allTables.filter(t => !PRESERVE.includes(t));

console.log('\n=== RENCANA RESET ===');
console.log('🔒 DIPERTAHANKAN : ' + (keep.join(', ') || '(tidak ada)'));
console.log('🗑️  DIHAPUS       : ' + toWipe.join(', '));
console.log('\n⚠️  Ini menghapus data SEMUA server (global) dan TIDAK bisa dibatalkan');
console.log('   (kecuali restore dari backup di atas).');

function performReset() {
    const summary = [];
    const wipe = db.transaction(() => {
        for (const t of toWipe) {
            const before = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
            db.prepare(`DELETE FROM "${t}"`).run();
            try { db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(t); } catch (e) { /* no autoincrement */ }
            summary.push({ table: t, deleted: before });
        }
    });
    wipe();
    try { db.exec('VACUUM'); } catch (e) { /* ignore */ }

    console.log('\n=== SELESAI ===');
    let total = 0;
    summary.filter(s => s.deleted > 0).forEach(s => { total += s.deleted; console.log(`   ${s.table}: -${s.deleted} baris`); });
    console.log(`   (total ${total} baris dihapus)`);
    console.log('🔒 Dipertahankan: ' + keep.map(t => `${t}=${db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c}`).join(', '));
    db.close();
    console.log('\n✅ Reset selesai!');
    console.log('👉 JANGAN LUPA: kembalikan "Main file" ke bot.js sebelum start berikutnya.');
    process.exit(0);
}

// ---- 2) Confirmation ----
if ((process.env.RESET_CONFIRM || '').toUpperCase() === 'RESET') {
    console.log('\n✅ Konfirmasi via env RESET_CONFIRM=RESET. Melanjutkan...');
    performReset();
} else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const timer = setTimeout(() => {
        console.log('\n⏳ Tidak ada konfirmasi dalam 60 detik. DIBATALKAN. Tidak ada data yang dihapus.');
        rl.close(); db.close(); process.exit(0);
    }, 60000);
    rl.question("\nKetik 'RESET' lalu Enter untuk konfirmasi (60 detik): ", (answer) => {
        clearTimeout(timer);
        rl.close();
        if ((answer || '').trim().toUpperCase() === 'RESET') {
            performReset();
        } else {
            console.log('❎ Dibatalkan (input bukan "RESET"). Tidak ada data yang dihapus.');
            db.close();
            process.exit(0);
        }
    });
}
