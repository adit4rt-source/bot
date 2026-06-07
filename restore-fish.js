/**
 * RESTORE FISH — Mengembalikan ikan langka (Secret/God) yang hilang dari backup.
 *
 * Kasus: player tidak sengaja klik "Sell All" sebelum fix auto-protect, sehingga
 * ikan Secret/God ikut terjual & terhapus. Script ini membandingkan DB sekarang
 * dengan file backup, lalu menyisipkan kembali ikan yang HILANG untuk user tertentu.
 *
 * JALANKAN DI SERVER (Pterodactyl) — di situ economy.sqlite & folder backups/ berada.
 * Pakai better-sqlite3 (dependency bot, sudah pasti terinstall).
 *
 * Cara pakai:
 *   node restore-fish.js --user=<USER_ID> --dry-run        # preview (WAJIB coba dulu)
 *   node restore-fish.js --user=<USER_ID>                  # apply (Secret & God saja)
 *   node restore-fish.js --user=<USER_ID> --backup=economy_2026-06-07_06-00-00.sqlite
 *   node restore-fish.js --user=<USER_ID> --tiers=Secret,God,Mythic
 *   node restore-fish.js --user=<USER_ID> --all-tiers      # kembalikan SEMUA ikan hilang
 *   node restore-fish.js --list-backups                    # lihat daftar backup
 *
 * Ikan yang di-restore otomatis di-LOCK (locked=1) supaya tidak hilang lagi.
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { FISH_DATA } = require('./data/fish');

function arg(name, def = null) {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split('=').slice(1).join('=') : def;
}
const HAS = (name) => process.argv.includes(`--${name}`);

const DRY_RUN = HAS('dry-run');
const USER_ID = arg('user');
const ALL_TIERS = HAS('all-tiers');
const TIERS = (arg('tiers', 'Secret,God') || '').split(',').map(s => s.trim()).filter(Boolean);
const BACKUP_DIR = path.join(__dirname, 'backups');
const CURRENT_PATH = path.join(__dirname, 'economy.sqlite');

function tierOfFish(fishId) {
    const def = FISH_DATA.find(f => f.id === fishId);
    return def ? def.tier : 'Trash';
}

function listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('economy_') && f.endsWith('.sqlite'))
        .sort(); // timestamp di nama tersusun lexicographic => terakhir = terbaru
}

function main() {
    const backups = listBackups();

    if (HAS('list-backups')) {
        console.log('📂 Daftar backup (lama → baru):');
        backups.forEach(b => console.log('  ' + b));
        if (!backups.length) console.log('  (kosong)');
        return;
    }

    if (!USER_ID) {
        console.error('❌ Wajib isi --user=<USER_ID>.');
        console.error('   Contoh: node restore-fish.js --user=123456789 --dry-run');
        console.error('   Lihat backup: node restore-fish.js --list-backups');
        process.exit(1);
    }
    if (!fs.existsSync(CURRENT_PATH)) { console.error('❌ economy.sqlite tidak ditemukan!'); process.exit(1); }

    const backupName = arg('backup') || backups[backups.length - 1];
    if (!backupName) { console.error('❌ Tidak ada file backup di folder backups/'); process.exit(1); }
    const backupPath = path.join(BACKUP_DIR, backupName);
    if (!fs.existsSync(backupPath)) { console.error(`❌ Backup tidak ditemukan: ${backupName}`); process.exit(1); }

    console.log(`📂 DB sekarang : economy.sqlite`);
    console.log(`📂 Backup      : ${backupName}`);
    console.log(`👤 User        : ${USER_ID}`);
    console.log(`🎯 Tier        : ${ALL_TIERS ? 'SEMUA' : TIERS.join(', ')}\n`);

    const cur = new Database(CURRENT_PATH);
    const bk = new Database(backupPath, { readonly: true });

    // Key per ikan: fishId|caughtAt (caughtAt = timestamp tangkapan, unik per ikan)
    const curRows = cur.prepare('SELECT fishId, caughtAt FROM fish_inventory WHERE userId = ?').all(USER_ID);
    const curSet = new Set(curRows.map(r => `${r.fishId}|${r.caughtAt}`));
    console.log(`Ikan user di DB sekarang: ${curSet.size}`);

    const bkRows = bk.prepare('SELECT * FROM fish_inventory WHERE userId = ?').all(USER_ID);
    if (!bkRows.length) { console.log('⚠️ User tidak punya ikan di backup ini. Coba --backup= lain (--list-backups).'); return; }

    const missing = bkRows.filter(r => {
        if (curSet.has(`${r.fishId}|${r.caughtAt}`)) return false; // masih ada
        const tier = tierOfFish(r.fishId);
        return ALL_TIERS || TIERS.includes(tier);
    });

    console.log(`Ikan HILANG yang cocok kriteria: ${missing.length}\n`);
    if (missing.length === 0) { console.log('✅ Tidak ada yang perlu di-restore.'); return; }

    missing.forEach((f, i) => {
        const def = FISH_DATA.find(d => d.id === f.fishId);
        console.log(`${i + 1}. ${tierOfFish(f.fishId).padEnd(10)} ${def ? def.name : f.fishId} — ${f.weight}kg (caughtAt ${f.caughtAt})`);
    });
    console.log('');

    if (DRY_RUN) { console.log('[DRY RUN] Tidak ada perubahan. Hapus --dry-run untuk apply.'); return; }

    // Safety backup DB sekarang dulu
    const safety = `economy.pre-fishrestore-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
    fs.copyFileSync(CURRENT_PATH, path.join(__dirname, safety));
    console.log(`🛟 Safety backup DB sekarang: ${safety}`);

    // Insert (locked = 1 supaya aman dari Sell All). guildId disamakan dengan baris backup.
    const insert = cur.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt, locked) VALUES (?, ?, ?, ?, ?, 1)');
    const tx = cur.transaction(rows => {
        let n = 0;
        for (const f of rows) { insert.run(f.guildId ?? '', f.userId, f.fishId, f.weight, f.caughtAt); n++; }
        return n;
    });
    const restored = tx(missing);

    console.log(`\n✅ Restore selesai: ${restored}/${missing.length} ikan (semua di-LOCK 🔒).`);
    console.log('💡 Restart bot kalau perlu agar perubahan kebaca.');

    cur.close();
    bk.close();
}

main();
