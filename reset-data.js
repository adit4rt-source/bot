// =============================================================================
// reset-data.js — ONE-TIME DATA RESET (standalone). Wipes ALL data except the
// streak tables and server/admin config (see systems/dataReset.js PRESERVE).
// Always backs up first and REQUIRES confirmation.
//
// EASIEST WAY (recommended): don't use this file. Instead, in Pterodactyl just
// add a Startup variable  RESET_DATA=fresh-jun1  then restart once (bot.js will
// reset on boot), then remove the variable. See systems/dataReset.js.
//
// THIS STANDALONE WAY:
//   1. Stop server. Startup tab -> Main file = reset-data.js
//   2. Start. In Console type:  RESET   (or set env RESET_CONFIRM=RESET)
//   3. After "✅ Reset selesai", Stop. Startup tab -> Main file = bot.js. Start.
// =============================================================================

const readline = require('readline');
const { getResetPlan, backupDatabase, wipeAllExceptPreserved } = require('./systems/dataReset');

const { keep, wipe } = getResetPlan();
console.log('\n=== RENCANA RESET ===');
console.log('🔒 DIPERTAHANKAN : ' + (keep.join(', ') || '(tidak ada)'));
console.log('🗑️  DIHAPUS       : ' + (wipe.join(', ') || '(tidak ada)'));
console.log('\n⚠️  Menghapus data SEMUA server (global) & TIDAK bisa dibatalkan (kecuali restore backup).');

function run() {
    const backupPath = backupDatabase();
    console.log('💾 Backup dibuat: ' + backupPath);
    const summary = wipeAllExceptPreserved();
    console.log('\n=== SELESAI ===');
    let total = 0;
    summary.filter(s => s.deleted > 0).forEach(s => { total += s.deleted; console.log(`   ${s.table}: -${s.deleted} baris`); });
    const failed = summary.filter(s => !s.ok);
    if (failed.length) console.log('⚠️  Gagal: ' + failed.map(s => `${s.table} (${s.error})`).join(', '));
    console.log(`   (total ${total} baris dihapus)`);
    console.log('🔒 Dipertahankan: ' + keep.join(', '));
    console.log('\n✅ Reset selesai!');
    console.log('👉 JANGAN LUPA: kembalikan "Main file" ke bot.js sebelum start berikutnya.');
    process.exit(0);
}

if ((process.env.RESET_CONFIRM || '').toUpperCase() === 'RESET') {
    console.log('\n✅ Konfirmasi via env RESET_CONFIRM=RESET. Melanjutkan...');
    run();
} else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const timer = setTimeout(() => {
        console.log('\n⏳ Tidak ada konfirmasi dalam 60 detik. DIBATALKAN — tidak ada data yang dihapus.');
        rl.close(); process.exit(0);
    }, 60000);
    rl.question("\nKetik 'RESET' lalu Enter untuk konfirmasi (60 detik): ", (answer) => {
        clearTimeout(timer);
        rl.close();
        if ((answer || '').trim().toUpperCase() === 'RESET') run();
        else { console.log('❎ Dibatalkan (input bukan "RESET"). Tidak ada data yang dihapus.'); process.exit(0); }
    });
}
