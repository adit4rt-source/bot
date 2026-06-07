/**
 * RESTORE FULL — Kembalikan SELURUH database ke kondisi backup tertentu (rollback total).
 *
 * ⚠️ PERINGATAN: Ini mengganti economy.sqlite dengan file backup. SEMUA perubahan
 * setelah backup itu HILANG (termasuk progres non-mining: mancing, tani, pet, daily, dll).
 * Gunakan kalau kamu memang ingin "kembali total ke sebelum fitur mining dibuat".
 *
 * DEFAULT = list backup saja (tidak mengubah apa pun).
 *
 * JALANKAN DI SERVER (Pterodactyl), di folder bot:
 *   node restore-full.js                          # tampilkan daftar semua backup + waktunya
 *   node restore-full.js --file=NAMA_BACKUP       # DRY-RUN: konfirmasi file yang dipilih
 *   node restore-full.js --file=NAMA_BACKUP --execute   # APPLY restore (backup kondisi skrg dulu)
 *
 * Tips memilih: pilih backup dengan waktu PALING DEKAT SEBELUM mining mulai dimainkan.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DB_PATH = path.join(ROOT, 'economy.sqlite');
const BACKUP_DIR = path.join(ROOT, 'backups');

function arg(name, def = null) {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split('=').slice(1).join('=') : def;
}
const EXECUTE = process.argv.includes('--execute');
const FILE = arg('file');

// Kumpulkan semua kandidat backup: backups/economy_*.sqlite + root economy.backup-*.sqlite
function listBackups() {
    const out = [];
    try {
        for (const f of fs.readdirSync(BACKUP_DIR)) {
            if (f.startsWith('economy_') && f.endsWith('.sqlite')) {
                const p = path.join(BACKUP_DIR, f);
                out.push({ name: f, full: p, rel: `backups/${f}`, mtime: fs.statSync(p).mtimeMs, size: fs.statSync(p).size });
            }
        }
    } catch (e) {}
    try {
        for (const f of fs.readdirSync(ROOT)) {
            if (f.startsWith('economy.backup-') && f.endsWith('.sqlite')) {
                const p = path.join(ROOT, f);
                out.push({ name: f, full: p, rel: f, mtime: fs.statSync(p).mtimeMs, size: fs.statSync(p).size });
            }
        }
    } catch (e) {}
    return out.sort((a, b) => b.mtime - a.mtime);
}

function fmtSize(b) { return (b / (1024 * 1024)).toFixed(2) + ' MB'; }
function fmtTime(ms) { return new Date(ms).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'; }

function main() {
    if (!fs.existsSync(DB_PATH)) { console.error('❌ economy.sqlite tidak ditemukan! Jalankan di folder bot.'); process.exit(1); }
    const backups = listBackups();

    if (!FILE) {
        console.log('💾 DAFTAR BACKUP (terbaru → terlama):\n');
        if (!backups.length) { console.log('  (kosong — tidak ada backup ditemukan)'); return; }
        backups.forEach((b, i) => {
            console.log(`  ${String(i + 1).padStart(2)}. ${b.rel}`);
            console.log(`      🕒 ${fmtTime(b.mtime)}  •  ${fmtSize(b.size)}`);
        });
        console.log('\n👉 Pilih backup PALING DEKAT SEBELUM mining dimainkan, lalu:');
        console.log('   node restore-full.js --file=<nama_file>            (dry-run)');
        console.log('   node restore-full.js --file=<nama_file> --execute  (apply)');
        return;
    }

    // Cari file yang dipilih (cocokkan nama persis atau path relatif)
    const chosen = backups.find(b => b.name === FILE || b.rel === FILE || b.rel === `backups/${FILE}`);
    if (!chosen) {
        console.error(`❌ Backup "${FILE}" tidak ditemukan. Jalankan tanpa --file untuk lihat daftar.`);
        process.exit(1);
    }

    console.log(`📦 Backup dipilih : ${chosen.rel}`);
    console.log(`🕒 Dibuat        : ${fmtTime(chosen.mtime)}`);
    console.log(`📏 Ukuran        : ${fmtSize(chosen.size)}\n`);

    if (!EXECUTE) {
        console.log('🔍 DRY-RUN — belum ada yang diubah.');
        console.log('⚠️  Saat --execute: economy.sqlite akan DIGANTI dengan backup ini.');
        console.log('    SEMUA progres setelah waktu backup di atas akan HILANG (semua fitur, bukan cuma mining).');
        console.log('\n👉 Kalau yakin: node restore-full.js --file=' + chosen.name + ' --execute');
        return;
    }

    // Safety: backup kondisi sekarang dulu
    const safety = `economy.pre-restore-full-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
    fs.copyFileSync(DB_PATH, path.join(ROOT, safety));
    console.log(`🛟 Kondisi DB sekarang di-backup ke: ${safety}`);

    // Restore
    fs.copyFileSync(chosen.full, DB_PATH);
    console.log(`\n✅ RESTORE SELESAI: economy.sqlite sekarang = ${chosen.rel}`);
    console.log('💡 WAJIB restart bot agar memuat database yang sudah di-restore.');
    console.log('   Kalau ternyata salah pilih, restore balik dari file: ' + safety);
}

main();
