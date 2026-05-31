// systems/dataReset.js - Shared data-reset logic (used by reset-data.js and the
// optional one-time startup reset in bot.js).
//
// Wipes ALL tables EXCEPT the PRESERVE list, globally. Always resilient
// (one bad table never blocks the rest) and resets kept-voucher counters.
const fs = require('fs');
const path = require('path');
const { db } = require('../database');

// Single source of truth for what survives a reset.
const PRESERVE = [
    // --- Streak (always kept) ---
    'streaks',
    'streak_history',
    'streak_restores',
    // --- Server / admin config (Option B: keep setup, wipe player data) ---
    'server_settings',
    'config',
    'shop_items',
    'shop_roles',
    'vouchers',
    'rewards',
    'economy_admins',
];

const DB_PATH = path.join(process.cwd(), 'economy.sqlite');

function listTables() {
    return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
}

function getResetPlan() {
    const all = listTables();
    return {
        keep: PRESERVE.filter(t => all.includes(t)),
        wipe: all.filter(t => !PRESERVE.includes(t)),
    };
}

// Creates a consistent snapshot of the live DB (safe on an open connection).
function backupDatabase() {
    const backupDir = path.join(process.cwd(), 'backups');
    try { fs.mkdirSync(backupDir, { recursive: true }); } catch (e) { /* exists */ }
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(backupDir, `economy_PRE-RESET_${ts}.sqlite`);
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    return dest;
}

// Wipes every non-preserved table. Returns a per-table summary. Resilient:
// a failure on one table is recorded but does NOT prevent wiping the others.
function wipeAllExceptPreserved() {
    const { wipe } = getResetPlan();
    const summary = [];
    for (const t of wipe) {
        try {
            const before = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
            db.prepare(`DELETE FROM "${t}"`).run();
            try { db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(t); } catch (e) { /* no autoincrement */ }
            summary.push({ table: t, deleted: before, ok: true });
        } catch (e) {
            summary.push({ table: t, deleted: 0, ok: false, error: e.message });
        }
    }
    // Kept vouchers become fresh again since their claim records were wiped.
    if (PRESERVE.includes('vouchers') && wipe.includes('voucher_claims')) {
        try { db.prepare('UPDATE vouchers SET current_uses = 0').run(); } catch (e) { /* ignore */ }
    }
    try { db.exec('VACUUM'); } catch (e) { /* ignore */ }
    return summary;
}

// Optional one-time reset on boot, gated by env RESET_DATA=<token>.
// Runs only ONCE per token value (token recorded in backups/.reset_token), so
// leaving the env var set will NOT re-wipe data on later restarts.
function maybeRunStartupReset() {
    const token = (process.env.RESET_DATA || '').trim();
    if (!token) return false;

    const tokenFile = path.join(process.cwd(), 'backups', '.reset_token');
    let last = '';
    try { last = fs.readFileSync(tokenFile, 'utf8').trim(); } catch (e) { /* none yet */ }
    if (token === last) {
        console.log('ℹ️  RESET_DATA token sudah pernah dipakai — reset dilewati. (Hapus var ini, atau ganti nilainya untuk reset lagi.)');
        return false;
    }

    console.log('\n⚠️ ====== RESET_DATA TERDETEKSI — MENJALANKAN RESET (SEKALI) ====== ⚠️');
    try {
        const backupPath = backupDatabase();
        console.log('💾 Backup dibuat: ' + backupPath);
    } catch (e) {
        console.error('❌ Backup gagal, reset DIBATALKAN demi keamanan: ' + e.message);
        return false;
    }
    const summary = wipeAllExceptPreserved();
    try { fs.mkdirSync(path.dirname(tokenFile), { recursive: true }); fs.writeFileSync(tokenFile, token); } catch (e) { /* ignore */ }

    const wiped = summary.filter(s => s.deleted > 0);
    const failed = summary.filter(s => !s.ok);
    console.log('🗑️  Dihapus: ' + (wiped.map(s => `${s.table}(-${s.deleted})`).join(', ') || '(semua sudah kosong)'));
    if (failed.length) console.log('⚠️  Tabel gagal di-reset: ' + failed.map(s => `${s.table} (${s.error})`).join(', '));
    console.log('✅ Reset selesai. Data player kosong, streak & setup server tetap.');
    console.log('👉 Saran: HAPUS variable RESET_DATA di Startup (token sudah dicatat, tidak akan mengulang).');
    console.log('⚠️ ================================================================ ⚠️\n');
    return true;
}

module.exports = { PRESERVE, DB_PATH, getResetPlan, backupDatabase, wipeAllExceptPreserved, maybeRunStartupReset };
