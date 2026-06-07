/**
 * AUDIT RARE ITEMS — Cek siapa saja yang punya item langka (drop-only) di inventory.
 *
 * Konteks: sebelum fix, /shop sempat menjual Mythic Fragment & Awakening Crystal
 * GRATIS (price 0). Script ini READ-ONLY: hanya menampilkan siapa yang memilikinya
 * & berapa banyak, supaya kamu bisa putuskan tindakan (biarkan / cleanup).
 *
 * JALANKAN DI SERVER (Pterodactyl), di folder bot:
 *   node audit-rare-items.js
 *   node audit-rare-items.js --threshold=5    # hanya tampilkan yang punya > 5 (curiga exploit)
 *   node audit-rare-items.js --item=awakening_crystal
 *
 * Tidak mengubah data apa pun.
 */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const RARE_ITEMS = [
    { id: 'mythic_fragment', emoji: '🌟', name: 'Mythic Fragment' },
    { id: 'awakening_crystal', emoji: '💫', name: 'Awakening Crystal' },
];

function arg(name, def = null) {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split('=').slice(1).join('=') : def;
}

const THRESHOLD = parseInt(arg('threshold', '1')) || 1;
const ONLY_ITEM = arg('item');
const DB_PATH = path.join(__dirname, 'economy.sqlite');

function main() {
    if (!fs.existsSync(DB_PATH)) { console.error('❌ economy.sqlite tidak ditemukan! Jalankan di folder bot.'); process.exit(1); }
    const db = new Database(DB_PATH, { readonly: true });

    const items = ONLY_ITEM ? RARE_ITEMS.filter(i => i.id === ONLY_ITEM) : RARE_ITEMS;
    if (items.length === 0) { console.error('❌ Item tidak dikenal. Pilihan: mythic_fragment, awakening_crystal'); process.exit(1); }

    console.log(`🔍 Audit item langka (threshold: punya >= ${THRESHOLD})\n`);

    for (const item of items) {
        let rows;
        try {
            rows = db.prepare('SELECT userId, SUM(quantity) AS qty FROM item_inventory WHERE itemId = ? AND quantity > 0 GROUP BY userId ORDER BY qty DESC').all(item.id);
        } catch (e) { console.error('Query gagal:', e.message); continue; }

        const flagged = rows.filter(r => r.qty >= THRESHOLD);
        const totalHolders = rows.length;
        const totalQty = rows.reduce((s, r) => s + r.qty, 0);

        console.log(`${item.emoji} ${item.name} (${item.id})`);
        console.log(`   Total: ${totalQty} unit tersebar di ${totalHolders} player`);
        if (flagged.length === 0) {
            console.log(`   (tidak ada yang punya >= ${THRESHOLD})\n`);
            continue;
        }
        flagged.forEach((r, i) => {
            console.log(`   ${String(i + 1).padStart(2)}. user ${r.userId} — ${r.qty}x`);
        });
        console.log('');
    }

    console.log('ℹ️  READ-ONLY: tidak ada data yang diubah.');
    console.log('💡 Tip: di Discord, klik kanan user > Copy User ID untuk cocokkan, atau mention <@USERID>.');
    db.close();
}

main();
