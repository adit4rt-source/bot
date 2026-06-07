/**
 * CLAWBACK MINING INCOME — Tarik kembali uang hasil jual ore tambang (income_mining).
 *
 * DEFAULT = DRY-RUN (AMAN): cuma MENAMPILKAN siapa saja & berapa yang akan dipotong,
 * TIDAK mengubah data. Baru benar-benar memotong kalau diberi flag --execute.
 *
 * JALANKAN DI SERVER (Pterodactyl), di folder bot:
 *   node clawback-mining-income.js                 # DRY-RUN: lihat daftar & jumlah (tidak mengubah apa pun)
 *   node clawback-mining-income.js --min=100000    # DRY-RUN, hanya yang income_mining >= 100rb
 *   node clawback-mining-income.js --execute       # APPLY: potong saldo (otomatis backup dulu)
 *   node clawback-mining-income.js --execute --keep-stat   # APPLY tapi JANGAN reset stat income_mining
 *
 * Aturan potong (aman):
 *   potong = min(income_mining, saldo)  -> saldo tidak akan minus.
 *   Setelah dipotong, stat income_mining di-reset ke 0 (kecuali --keep-stat) supaya
 *   tidak ke-clawback dobel kalau script dijalankan lagi.
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function arg(name, def = null) {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split('=').slice(1).join('=') : def;
}
const HAS = (n) => process.argv.includes(`--${n}`);

const EXECUTE = HAS('execute');
const KEEP_STAT = HAS('keep-stat');
const MIN = parseInt(arg('min', '1')) || 1;
const LIMIT = parseInt(arg('limit', '500')) || 500;
const DB_PATH = path.join(__dirname, 'economy.sqlite');

function fmt(n) { return Number(n || 0).toLocaleString('id-ID'); }

function main() {
    if (!fs.existsSync(DB_PATH)) { console.error('❌ economy.sqlite tidak ditemukan! Jalankan di folder bot.'); process.exit(1); }

    console.log(`💰 CLAWBACK MINING INCOME — ${EXECUTE ? '⚠️  MODE EKSEKUSI (akan memotong saldo)' : '🔍 DRY-RUN (tidak mengubah apa pun)'}\n`);

    // Backup dulu kalau mau eksekusi
    if (EXECUTE) {
        const safety = `economy.pre-clawback-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
        fs.copyFileSync(DB_PATH, path.join(__dirname, safety));
        console.log(`🛟 Backup DB dibuat: ${safety}\n`);
    }

    const db = new Database(DB_PATH, EXECUTE ? {} : { readonly: true });

    const rows = db.prepare("SELECT userId, stat_value AS earned FROM user_stats WHERE stat_key = 'income_mining' AND stat_value > 0 ORDER BY stat_value DESC").all();
    const targets = rows.filter(r => r.earned >= MIN);

    if (targets.length === 0) { console.log('✅ Tidak ada user dengan income_mining yang cocok kriteria.'); db.close(); return; }

    console.log('No  | UserID               | Income Mining       | Saldo Skrg          | Dipotong            | Saldo Baru');
    console.log('----+----------------------+---------------------+---------------------+---------------------+-------------------');

    let totalClaw = 0;
    const txRows = [];
    targets.slice(0, LIMIT).forEach((r, i) => {
        const bal = db.prepare('SELECT balance FROM users WHERE userId = ?').get(r.userId)?.balance || 0;
        const deduct = Math.min(r.earned, bal); // jangan sampai minus
        const newBal = bal - deduct;
        totalClaw += deduct;
        txRows.push({ userId: r.userId, earned: r.earned, deduct, newBal });
        console.log(
            `${String(i + 1).padStart(3)} | ${String(r.userId).padEnd(20)} | ${fmt(r.earned).padStart(19)} | ${fmt(bal).padStart(19)} | ${fmt(deduct).padStart(19)} | ${fmt(newBal)}`
        );
    });

    console.log('\n────────────────────────────────────────────');
    console.log(`👥 User terdampak : ${txRows.length}`);
    console.log(`💸 Total income_mining : 🪙 ${fmt(targets.reduce((s, r) => s + r.earned, 0))}`);
    console.log(`🧹 Total akan dipotong : 🪙 ${fmt(totalClaw)} (dibatasi agar saldo tidak minus)`);

    if (!EXECUTE) {
        console.log('\n🔍 INI DRY-RUN — tidak ada yang diubah.');
        console.log('👉 Kalau daftar di atas sudah benar, jalankan ulang dengan: node clawback-mining-income.js --execute');
        db.close();
        return;
    }

    // EKSEKUSI
    const applyTx = db.transaction((list) => {
        const upBal = db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ?');
        const zeroStat = db.prepare("UPDATE user_stats SET stat_value = 0 WHERE userId = ? AND stat_key = 'income_mining'");
        for (const t of list) {
            if (t.deduct > 0) upBal.run(t.deduct, t.userId);
            if (!KEEP_STAT) zeroStat.run(t.userId);
        }
    });
    applyTx(txRows);

    console.log(`\n✅ SELESAI: dipotong total 🪙 ${fmt(totalClaw)} dari ${txRows.length} user.`);
    console.log(KEEP_STAT ? '   (stat income_mining DIPERTAHANKAN — hati-hati clawback dobel)' : '   (stat income_mining di-reset ke 0 agar tidak ke-clawback dobel)');
    console.log('💡 Restart bot disarankan agar cache user segar.');
    db.close();
}

main();
