/**
 * AUDIT MINING INCOME — READ ONLY (tidak mengubah data apa pun).
 *
 * Melaporkan berapa banyak uang yang dihasilkan tiap user dari MENJUAL ORE tambang
 * (stat key: income_mining), plus ringkasan total. Berguna untuk menilai dampak
 * ekonomi fitur Mining sebelum memutuskan menarik/rollback uang.
 *
 * JALANKAN DI SERVER (Pterodactyl), di folder bot:
 *   node audit-mining-income.js
 *   node audit-mining-income.js --min=100000     # hanya tampilkan yang dapat >= 100rb
 *   node audit-mining-income.js --limit=50        # batasi jumlah baris (default 100)
 *
 * Catatan: income_mining = akumulasi hasil JUAL ore. Uang dari hasil tambang yang
 * masih berupa ore/bar (belum dijual) TIDAK terhitung di sini.
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function arg(name, def = null) {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split('=').slice(1).join('=') : def;
}
const MIN = parseInt(arg('min', '1')) || 1;
const LIMIT = parseInt(arg('limit', '100')) || 100;
const DB_PATH = path.join(__dirname, 'economy.sqlite');

function fmt(n) { return Number(n || 0).toLocaleString('id-ID'); }

function main() {
    if (!fs.existsSync(DB_PATH)) { console.error('❌ economy.sqlite tidak ditemukan! Jalankan di folder bot.'); process.exit(1); }
    const db = new Database(DB_PATH, { readonly: true });

    // Semua user yang punya income dari mining
    let rows = [];
    try {
        rows = db.prepare("SELECT userId, stat_value AS earned FROM user_stats WHERE stat_key = 'income_mining' AND stat_value > 0 ORDER BY stat_value DESC").all();
    } catch (e) { console.error('Query gagal:', e.message); process.exit(1); }

    const flagged = rows.filter(r => r.earned >= MIN);
    const grandTotal = rows.reduce((s, r) => s + r.earned, 0);

    console.log('💰 AUDIT MINING INCOME (READ-ONLY)\n');
    console.log(`Total uang dari jual ore (semua user): 🪙 ${fmt(grandTotal)}`);
    console.log(`Jumlah user yang dapat income mining : ${rows.length}`);
    console.log(`Filter: tampil yang >= 🪙 ${fmt(MIN)} (max ${LIMIT} baris)\n`);
    console.log('No  | UserID               | Income Mining       | Saldo Sekarang');
    console.log('----+----------------------+---------------------+----------------');

    flagged.slice(0, LIMIT).forEach((r, i) => {
        let bal = 0;
        try { bal = db.prepare('SELECT balance FROM users WHERE userId = ?').get(r.userId)?.balance || 0; } catch (e) {}
        console.log(
            `${String(i + 1).padStart(3)} | ${String(r.userId).padEnd(20)} | ${('🪙 ' + fmt(r.earned)).padEnd(19)} | 🪙 ${fmt(bal)}`
        );
    });

    if (flagged.length > LIMIT) console.log(`\n... dan ${flagged.length - LIMIT} user lain (naikkan --limit untuk lihat semua).`);

    // Ringkasan tambahan: stat aktivitas mining global
    const sumStat = (k) => { try { return db.prepare('SELECT SUM(stat_value) AS t FROM user_stats WHERE stat_key = ?').get(k)?.t || 0; } catch (e) { return 0; } };
    console.log('\n📊 Aktivitas Mining global:');
    console.log(`   Total digs        : ${fmt(sumStat('mining_digs'))}`);
    console.log(`   Total ore terjual : ${fmt(sumStat('mining_ore_sold'))}`);

    console.log('\nℹ️  READ-ONLY: tidak ada data yang diubah.');
    console.log('💡 Untuk MENARIK uang ini nanti, beri tahu aku — aku buatkan script terpisah (potong income_mining dari balance, dengan dry-run & backup otomatis).');
    db.close();
}

main();
