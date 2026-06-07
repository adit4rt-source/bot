# 🧯 Postmortem & Guardrail — Insiden Fitur Mining

Dokumen ini merangkum 2 masalah yang muncul dari fitur **Mining** dan **aturan wajib**
agar tidak terulang pada fitur ekonomi/gameplay berikutnya.

---

## 📉 Masalah 1 — Ekonomi Meledak (Money Faucet)

**Gejala:** Uang user melonjak drastis dalam semalam. Mining jadi sumber uang
terlalu deras (~10 juta per stamina penuh di endgame).

**Akar masalah:** Mining **tidak punya batas throughput uang**. Kombinasi:
- Harga jual ore terlalu tinggi (Void Crystal 6.000, Adamantite 2.500)
- Yield per dig tinggi (Adamantite +12, Legendary Drill +20)
- Stamina cuma 1–2 per gali di endgame → ribuan dig per sesi
- Tidak ada cap harian / diminishing return

**Pelajaran:** Fitur "gathering aktif" yang bisa diulang cepat = **faucet besar**
kalau output-nya uang langsung.

### ✅ ATURAN sebelum rilis fitur penghasil uang:
1. **Hitung income maksimal teoretis per jam** (per-aksi × aksi-per-menit × 60).
   Bandingkan dengan faucet existing (mancing/tani). Jangan > ~2x faucet terbesar.
2. **Selalu ada rem**: cooldown, stamina dengan cap, energy terbatas, ATAU cap harian.
3. **Fitur yang bisa di-spam → outputnya MATERIAL, bukan uang langsung.**
   Uang harus lewat langkah berisiko/terbatas (jual dengan limit, craft, dll).
4. **Endgame multiplier diaudit**: pastikan yield×harga×kecepatan di tier tertinggi
   tidak meledak.
5. **Test ekonomi**: tambahkan estimasi `income/jam` di komentar data fitur.

---

## 💥 Masalah 2 — Database Korup ("disk image is malformed")

**Gejala:** `SqliteError: database disk image is malformed` saat query user_stats,
bot crash di banyak command.

**Akar masalah:** Script restore menimpa `economy.sqlite` dengan file backup **tanpa
menghapus sidecar WAL/SHM** (`economy.sqlite-wal`, `-shm`). DB pakai **WAL mode**,
jadi SQLite menerapkan WAL basi (dari DB lama) ke DB baru → korup.

**Pelajaran:** Operasi file pada SQLite WAL **WAJIB** memperhitungkan sidecar.

### ✅ ATURAN untuk operasi file database:
1. **Sebelum menimpa/menyalin `economy.sqlite`**, hapus dulu `-wal`, `-shm`, `-journal`.
   Lakukan juga **setelah** menyalin (kalau backup ikut bawa sidecar).
2. **Jangan copy DB saat bot hidup** kalau bisa dihindari (WAL belum checkpoint).
   Gunakan backup yang dibuat lewat `systems/backup.js` (copy file utuh saat idle).
3. **Selalu uji `PRAGMA integrity_check`** pada file sebelum dipakai sebagai sumber restore.
4. **Auto-recovery** (sudah dipasang di `bot.js`): saat start, kalau `economy.sqlite`
   korup → simpan jadi `economy.corrupt-*`, lalu pulihkan dari backup terbaru yang
   LULUS integrity_check. Jangan dihapus.

---

## 🛡️ Guardrail yang Sudah Terpasang (jangan dihapus)

| Lokasi | Fungsi |
|---|---|
| `bot.js` (AUTO-RESTORE) | Hapus sidecar WAL/SHM sebelum & sesudah restore |
| `bot.js` (AUTO-RECOVERY) | Deteksi DB korup saat start → pulihkan dari backup sehat |
| `systems/maintenance.js` | Maintenance mode (`MAINTENANCE_MODE=1` ON / `=0` force OFF) |
| `systems/backup.js` | Auto-backup tiap 6 jam + startup (retensi 7 hari) |

### Script operasional (dry-run dulu, lalu `--execute`):
- `restore-full.js` — rollback total DB ke backup tertentu

> Script `audit-mining-income.js`, `clawback-mining-income.js`, dan
> `cleanup-mining-db.js` sudah **dihapus** — usang setelah rollback (DB
> sehat sudah tidak punya tabel/stat mining lagi). Riwayatnya tetap ada di
> git bila sewaktu-waktu dibutuhkan kembali.

> Catatan: env auto-restore via Pterodactyl — `LIST_BACKUPS=1` (lihat daftar),
> `RESTORE_BACKUP=<file>` (pulihkan). **Kosongkan lagi** setelah dipakai.

---

## 📋 Checklist Rilis Fitur Baru (ekonomi/gameplay)
- [ ] Hitung income/jam maksimal & bandingkan dengan faucet existing
- [ ] Ada rem (cooldown / cap / stamina) yang teruji
- [ ] Output spam-able = material, bukan uang langsung
- [ ] Tidak ada item drop-only yang bisa dibeli (cek `price > 0` di shop)
- [ ] Operasi DB memperhitungkan WAL sidecar
- [ ] `npm test` hijau + cek manual di endgame tier
- [ ] Punya cara mematikan cepat (maintenance mode) bila bermasalah
