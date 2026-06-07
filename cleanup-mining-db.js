/**
 * CLEANUP MINING DB — Hapus jejak fitur Mining dari database (setelah rollback kode).
 *
 * DEFAULT = DRY-RUN (AMAN): hanya MENAMPILKAN apa yang akan dihapus, TIDAK mengubah data.
 * Tambah --execute untuk benar-benar menghapus (otomatis backup DB dulu).
 *
 * Yang dihapus saat --execute:
 *   - Tabel: mining_data, ore_inventory (DROP)
 *   - user_stats dengan key mining_* (mining_digs, mining_ore_sold, dst)
 *
 * CATATAN PENTING soal "rollback DATABASE ke sebelum mining":
 *   - Mengembalikan SELURUH database ke kondisi sebelum mining = restore file backup
 *     (mis. backups/economy_2026-06-07_*.sqlite yang dibuat SEBELUM player main mining).
 *     Tapi itu juga akan MENGHAPUS progres NON-mining yang dibuat setelahnya
 *     (mancing, tani, pet, dll selama periode itu). Biasanya TIDAK diinginkan.
 *   - Script ini pendekatan SURGICAL: buang data mining + (opsional) tarik uang hasil
 *     jual ore, tanpa menghapus progres fitur lain. Untuk tarik uang gunakan
 *     clawback-mining-income.js (jalankan ITU sebelum cleanup ini, karena cleanup
 *     menghapus stat income_mining juga).
 *
 * JALANKAN DI SERVER (Pterodactyl), di folder bot:
 *   node cleanup-mining-db.js              # DRY-RUN (lihat ringkasan)
 *   node cleanup-mining-db.js --execute    # APPLY (backup dulu, lalu hapus)
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const EXECUTE = process.argv.includes('--execute');
const DB_PATH = path.join(__dirname, 'economy.sqlite');

function fmt(n) { return Number(n || 0).toLocaleString('id-ID'); }
function tableExists(db, name) {
    return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}

function main() {
    if (!fs.existsSync(DB_PATH)) { console.error('❌ economy.sqlite tidak ditemukan! Jalankan di folder bot.'); process.exit(1); }

    console.log(`🧹 CLEANUP MINING DB — ${EXECUTE ? '⚠️  MODE EKSEKUSI' : '🔍 DRY-RUN (tidak mengubah apa pun)'}\n`);

    if (EXECUTE) {
        const safety = `economy.pre-mining-cleanup-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
        fs.copyFileSync(DB_PATH, path.join(__dirname, safety));
        console.log(`🛟 Backup DB dibuat: ${safety}\n`);
    }

    const db = new Database(DB_PATH, EXECUTE ? {} : { readonly: true });

    const hasMiningData = tableExists(db, 'mining_data');
    const hasOreInv = tableExists(db, 'ore_inventory');
    const minerCount = hasMiningData ? (db.prepare('SELECT COUNT(*) c FROM mining_data').get()?.c || 0) : 0;
    const oreRows = hasOreInv ? (db.prepare('SELECT COUNT(*) c FROM ore_inventory').get()?.c || 0) : 0;
    const statRows = db.prepare("SELECT COUNT(*) c FROM user_stats WHERE stat_key LIKE 'mining_%'").get()?.c || 0;
    const incomeMiningTotal = db.prepare("SELECT SUM(stat_value) t FROM user_stats WHERE stat_key = 'income_mining'").get()?.t || 0;

    console.log('Akan dihapus:');
    console.log(`  • Tabel mining_data : ${hasMiningData ? `ADA (${minerCount} miner)` : 'tidak ada'}`);
    console.log(`  • Tabel ore_inventory : ${hasOreInv ? `ADA (${oreRows} baris)` : 'tidak ada'}`);
    console.log(`  • user_stats 'mining_*' : ${statRows} baris`);
    console.log(`\n⚠️  Catatan: total income_mining tercatat = 🪙 ${fmt(incomeMiningTotal)}`);
    console.log(`   Kalau mau TARIK uang itu dari saldo player, jalankan dulu:`);
    console.log(`   node clawback-mining-income.js --execute   (SEBELUM cleanup ini)\n`);

    if (!EXECUTE) {
        console.log('🔍 INI DRY-RUN — tidak ada yang diubah.');
        console.log('👉 Untuk eksekusi: node cleanup-mining-db.js --execute');
        db.close();
        return;
    }

    const tx = db.transaction(() => {
        if (hasMiningData) db.exec('DROP TABLE IF EXISTS mining_data');
        if (hasOreInv) db.exec('DROP TABLE IF EXISTS ore_inventory');
        db.prepare("DELETE FROM user_stats WHERE stat_key LIKE 'mining_%'").run();
    });
    tx();
    try { db.exec('VACUUM'); } catch (e) { /* ignore */ }

    console.log('✅ SELESAI: tabel & stat mining dihapus dari database.');
    console.log('💡 Restart bot disarankan.');
    db.close();
}

main();
