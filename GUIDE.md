# 🤖 ID Community Bot — Panduan Lengkap

> Bot ekonomi, leveling, fishing, dan mini-games untuk server Discord kamu!

---

## 📚 PANDUAN DETAIL PER FITUR

Panduan mendalam untuk fitur kompleks ada di file terpisah:

| Fitur | File | Isi |
|---|---|---|
| 🐾 **Pet System** | [GUIDE-PET.md](GUIDE-PET.md) | Bonus pasif, battle, element, dungeon, expedition, fusion, evolution, abilities, awakening |

> Dokumen di bawah ini adalah ringkasan umum semua fitur.

---

## 📋 DAFTAR ISI

1. [Ekonomi & Money](#-ekonomi--money)
2. [Level & XP](#-level--xp)
3. [Daily Streak](#-daily-streak)
4. [Fishing System](#-fishing-system)
5. [Mini-Games](#-mini-games)
6. [Achievement & Badge](#-achievement--badge)
7. [Daily Quest](#-daily-quest)
8. [Item & Inventory](#-item--inventory)
9. [Gift / Transfer](#-gift--transfer)
10. [Shop & Toko](#-shop--toko)
11. [Temp Voice](#-temp-voice)
12. [Mini-Events Otomatis](#-mini-events-otomatis)
13. [Fishing Tournament](#-fishing-tournament)
14. [Command Admin](#-command-admin)

---

## 💰 EKONOMI & MONEY

Money adalah mata uang utama di server ini. Kamu bisa mendapatkannya dari berbagai aktivitas!

| Command | Fungsi |
|---------|--------|
| `/money balance` | Cek saldo money kamu |
| `/money daily` | Klaim 500 money gratis setiap hari (reset 00:00 WIB) |
| `/money leaderboard` | Lihat top 10 orang terkaya di server |

### Cara Dapat Money:
- 💬 Chat di server (otomatis)
- 🎙️ Bergabung di voice chat
- 😀 Berikan reaction ke pesan orang
- 🎣 Mancing dan jual ikan
- 🎰 Menang di slot machine / coinflip
- 📜 Selesaikan daily quest
- 🏆 Unlock achievement
- 📦 Buka Mystery Box

---

## 📈 LEVEL & XP

Setiap aktivitas memberikan XP. Saat XP penuh, kamu naik level!

| Command | Fungsi |
|---------|--------|
| `/level rank` | Cek level & progress XP kamu |
| `/level leaderboard` | Top 10 level tertinggi |
| `/profile` | Kartu profil lengkap (level, money, badge, dll) |

### Sumber XP:
| Sumber | XP per Aksi | Cooldown |
|--------|-------------|----------|
| 💬 Chat | 15-25 XP | 60 detik |
| 🎙️ Voice | 60-120 XP | per 10 menit |
| 😀 Reaction | 50-100 XP | 10 detik |

### Formula Level Up:
> XP yang dibutuhkan = `(Level + 1) × 100`
> 
> Contoh: Level 5 → butuh 600 XP untuk naik ke Level 6

### Role Reward:
Admin bisa mengatur hadiah otomatis saat mencapai level tertentu (role + bonus money).

---

## 🔥 DAILY STREAK

Kirim pesan setiap hari untuk menjaga api streak kamu menyala!

| Command | Fungsi |
|---------|--------|
| `/streak cek` | Lihat jumlah streak hari ini |
| `/streak restore` | Pulihkan streak yang putus (max 3x/bulan) |

### Cara Kerja:
- Kirim **minimal 1 pesan** per hari untuk aktivasi streak
- Jika **skip 1 hari**, streak reset ke 0 (tapi bisa di-restore)
- Semakin tinggi streak, emoji api ditambahkan ke nickname kamu
- Notifikasi streak dikirim ke channel khusus (jika diatur admin)

### Streak Shield (Item):
> Beli di `/shop` → Otomatis melindungi streak jika kamu lupa chat 1 hari!

---

## 🎣 FISHING SYSTEM

Sistem memancing kompleks dengan 86 spesies ikan di 8 tier rarity!

| Command | Fungsi |
|---------|--------|
| `/fish` | Lempar pancing! |
| `/fishing inventory` | Lihat ikan yang kamu punya (dengan tombol ◀ ▶) |
| `/fishing sell` | Jual semua ikan (kecuali yang di-lock) |
| `/fishing collection` | Pokedex — lihat semua spesies yang pernah ditangkap |
| `/fishing shop` | Beli joran & umpan |
| `/fishing stats` | Statistik memancing |
| `/fishing equip` | Lihat perlengkapan terpasang |
| `/fishing lock <id>` | Kunci ikan agar tidak terjual |
| `/fishing unlock <id>` | Buka kunci ikan |

### 8 Tier Rarity:

| Tier | Emoji | Chance | Berat | Nilai Jual |
|------|-------|--------|-------|------------|
| 🗑️ Trash | Sampah | 18% | 0.01-0.5 kg | 1-2 |
| 🐟 Common | Biasa | 32% | 0.1-5 kg | 2-15 |
| 🐠 Uncommon | Tidak biasa | 23% | 0.5-15 kg | 8-50 |
| 🐡 Rare | Langka | 14% | 1-50 kg | 30-180 |
| 🦈 Epic | Epik | 8% | 5-200 kg | 80-500 |
| 🐉 Legendary | Legendaris | 3.5% | 50-1000 kg | 300-1500 |
| 🌈 Mythic | Mitik | 1.2% | 100-5000 kg | 800-2500 |
| 🔮 Secret | Rahasia | 0.3% | 500-9999 kg | 3000-6000 |

### Joran (Pancing):

| Joran | Harga | Cooldown | Rare Bonus |
|-------|-------|----------|------------|
| 🎋 Joran Bambu | Gratis | 30 detik | +0% |
| 🎣 Joran Fiber | 2.000 | 25 detik | +3% |
| ⚡ Joran Carbon | 8.000 | 20 detik | +7% |
| 🏆 Joran Pro Titanium | 25.000 | 15 detik | +12% |
| 🔱 Joran Mitik | 80.000 | 10 detik | +18% |
| 👑 Joran Dewa | 200.000 | 7 detik | +25% |

### Umpan (Habis Pakai, per 10 buah):

| Umpan | Harga/10pcs | Rare Bonus |
|-------|-------------|------------|
| 🪱 Cacing Tanah | 500 | +0% |
| 🦗 Jangkrik | 1.000 | +3% |
| 🦐 Udang Segar | 1.500 | +5% |
| 🐟 Ikan Kecil | 3.000 | +8% |
| ✨ Umpan Emas | 5.000 | +12% |
| 💎 Umpan Berlian | 15.000 | +20% |
| 🌟 Umpan Mitik | 50.000 | +30% |

> ⚠️ **Catatan:** Walaupun menggunakan gear terbaik, Mythic tetap MAX 2.5% dan Secret MAX 0.8%!

### Lock & Collection:
- Gunakan `/fishing lock <ID>` untuk mengunci ikan langka agar tidak terjual
- `/fishing collection` menampilkan Pokedex — kumpulkan semua 86 spesies!
- Ikan yang belum pernah ditangkap ditampilkan sebagai `▪️ ???`

---

## 🎮 MINI-GAMES

### 🎰 Slot Machine (`/slot`)
- 8 simbol: 🍒 🍋 🍊 🍇 🔔 ⭐ 💎 7️⃣
- **2x Match** = payout kecil (1x-6x)
- **3x Match (JACKPOT)** = payout besar (2x-25x)
- **7️⃣ 7️⃣ 7️⃣ = MEGA JACKPOT!** (25x taruhan)
- Taruhan: 10-1.000 money
- Cooldown: 7 detik

### 🪙 Coinflip (`/coinflip`)
- Peluang 50/50 menang atau kalah
- Taruhan: 10-500 money
- Menang = taruhan x2
- Cooldown: 7 detik

---

## 🏆 ACHIEVEMENT & BADGE

Unlock badge otomatis saat mencapai milestone! Setiap badge memberi **bonus money**.

| Command | Fungsi |
|---------|--------|
| `/achievement` | Lihat semua badge (page-style seperti Pokedex) |

### Kategori Badge (68 total):

| Kategori | Jumlah | Contoh |
|----------|--------|--------|
| 💬 Social | 12 | Newbie, Tukang Ngobrol, Dermawan |
| 💰 Economy | 7 | Kaya Raya, Sultan, Jutawan |
| 📈 Level | 5 | Rising Star, Grandmaster |
| 🔥 Streak | 5 | On Fire, Streak Master |
| 🎰 Gambling | 10 | JACKPOT!, Casino Royale, Lucky Seven |
| 🎮 Events | 3 | Event Hunter, Event Legend |
| 🎙️ Voice | 4 | Voice Newbie, Living in VC |
| 📜 Quest | 4 | Misi Pertama, Quiz Champion |
| ✨ Special | 3 | Perfect Day, Fashionista |
| 🎣 Fishing | 15 | Mythic Hunter, Secret Finder |

---

## 📜 DAILY QUEST

Setiap hari kamu mendapatkan 3 misi acak. Selesaikan untuk dapat bonus money!

| Command | Fungsi |
|---------|--------|
| `/quest` | Lihat papan misi harian |

### Jenis Misi:
- 🏷️ **Tag** — Mention seseorang di chat
- ⌨️ **Typing** — Ketik kalimat tertentu di chat
- 🎙️ **Voice** — Join voice channel selama X menit
- 👍 **Reaction** — Berikan X reaction ke pesan orang
- 🧠 **Tebakan** — Jawab tebak-tebakan di chat

> Misi reset setiap **00:00 WIB**. Progres berjalan di semua channel!

---

## 🎒 ITEM & INVENTORY

Beli item di `/shop` dan gunakan untuk keuntungan!

| Command | Fungsi |
|---------|--------|
| `/inventory` | Lihat item yang kamu punya |
| `/use <item>` | Gunakan item |

### Daftar Item:

| Item | Harga | Efek |
|------|-------|------|
| ⚡ XP Booster 2x | 3.000 | Double XP sementara (1 jam) |
| ⚡ XP Booster 3x | 7.000 | Triple XP sementara (1 jam) |
| 🛡️ Streak Shield | 5.000 | OTOMATIS lindungi streak jika skip 1 hari |
| 🍀 Lucky Charm | 8.000 | +15% chance menang semua game |
| 🧲 Money Magnet | 6.000 | +50% money dari semua sumber (1 jam) |
| 📅 Daily Doubler | 2.000 | Gandakan /money daily (sekali pakai) |
| 🧾 Tax-Free Voucher | 1.500 | Gift tanpa pajak (sekali pakai) |
| 🎫 Lucky Spin Token | 4.000 | Jamin 2 simbol sama di slot (sekali pakai) |
| 📦 Mystery Box | 1.000 | Random 50-2000 money (max 5x/hari) |

---

## 🎁 GIFT / TRANSFER

Kirim money ke player lain!

| Command | Fungsi |
|---------|--------|
| `/gift @user <jumlah>` | Kirim money (max 10.000/transaksi) |

### Ketentuan:
- 📊 **Pajak:** 10% dari jumlah (dipotong otomatis)
- 🧾 **Tax-Free Voucher:** Bypass pajak (beli di shop)
- 📅 **Limit harian penerima:** Max terima 10.000/hari
- ⏱️ **Cooldown:** 10 detik antar gift

---

## 🛒 SHOP & TOKO

| Command | Fungsi |
|---------|--------|
| `/shop` | Buka toko server |

### Kategori di Shop:
1. **🎭 Role Eksklusif** — Beli role permanen
2. **🎨 Custom Role** — Buat role sendiri (nama + warna pilihan)
3. **📦 Barang Virtual** — Item yang dikirim ke DM (kode, akun, dll)
4. **🎒 Items** — Booster, shield, voucher, mystery box

---

## 🎶 TEMP VOICE

Buat voice channel pribadi yang otomatis terhapus!

| Tombol | Fungsi |
|--------|--------|
| 🔒 Private | Hanya yang diizinkan bisa masuk |
| 👥 Duo (2) | Limit 2 orang |
| 👥 Squad (4) | Limit 4 orang |
| 🎛️ Custom | Pilih nama & limit sendiri |

### Kontrol Channel (saat di dalam VC):
| Tombol | Fungsi |
|--------|--------|
| ✏️ Name | Ubah nama channel |
| 👥 Limit | Ubah batas user |
| 🔒 Lock/Unlock | Kunci/buka akses |
| 👁️ Hide/Unhide | Sembunyikan channel |
| 👑 Claim Owner | Ambil alih jika owner pergi |
| 🔄 Transfer | Pindah kepemilikan |
| 👢 Kick | Tendang user |
| 🚫 Block | Block user |
| 🟢 Unblock | Unblock user |
| 🗑️ Delete | Hapus channel |

---

## 🎮 MINI-EVENTS OTOMATIS

Setiap **30 pesan** chat, event random muncul otomatis!

| Event | Cara Menang | Hadiah |
|-------|-------------|--------|
| ✨ Word Scramble | Susun huruf acak jadi kata | 150-400 |
| 🧮 Math Flash | Hitung cepat (+, -, ×) | 100-300 |
| 🎯 Tebak Angka | Tebak 1-100 (hint ⬆️/⬇️) | 250-500 |
| 📦 Air Drop | Klik tombol pertama | 300-600 |

> Waktu: 60 detik. Siapa cepat dia dapat!

---

## 🎣🏆 FISHING TOURNAMENT

Setiap **100 pesan** chat, tournament mancing otomatis dimulai! Durasi: **5 menit**.

| Jenis Tournament | Tantangan | Hadiah |
|------------------|-----------|--------|
| First Legendary | Tangkap Legendary/Mythic/Secret pertama | 3.000 |
| First Rare | Tangkap Rare+ pertama | 1.000 |
| Heaviest | Ikan terberat dalam 5 menit | 2.000 |
| Most Fish | Tangkap terbanyak dalam 5 menit | 2.000 |
| First Trash | Tangkap sampah pertama 🗑️ | 1.000 |

> Gunakan `/fish` untuk berpartisipasi saat tournament aktif!

---

## 🛡️ COMMAND ADMIN

| Command | Fungsi |
|---------|--------|
| `/setting quest_channel` | Batasi /quest ke channel tertentu |
| `/setting level_channel` | Atur channel notif level up |
| `/setting achievement_channel` | Atur channel notif achievement |
| `/setting streak_channel` | Atur channel notif streak |
| `/setting setup_notifications` | Auto-buat kategori + semua channel notifikasi |
| `/tempvoice setup` | Setup sistem Private Voice |
| `/admin_shop add_role` | Jual role di shop |
| `/admin_shop add_item` | Jual barang virtual |
| `/admin_shop set_custom_role` | Atur harga custom role |
| `/admin_shop voucher_add` | Buat kode voucher promo |
| `/admin_shop set_testimoni` | Atur channel testimoni pembelian |
| `/admin_shop history` | Lihat log transaksi |
| `/level setting rolereward` | Atur hadiah per level |
| `/level setting xp` | Atur min/max XP + cooldown |
| `/money manage atur` | Add/Take/Set uang user (Banker) |
| `/money manage add_admin` | Beri izin banker (Owner only) |
| `/streak setting` | Atur fitur streak |
| `/streak admin_set` | Set streak user |
| `/streak admin_reset` | Reset streak user |

---

## 📌 TIPS & INFO

- 🕐 **Semua reset harian** berdasarkan waktu **WIB (Asia/Jakarta)**
- 🎣 **Investasi di joran** sangat worth it — cooldown lebih cepat = lebih banyak ikan
- 🛡️ **Streak Shield** otomatis dipakai, tidak perlu command
- 🔒 **Lock ikan langka** sebelum `/fishing sell` agar tidak hilang
- 📖 **Kumpulkan Fish Collection** — ada 86 spesies untuk ditemukan
- 🏆 **Achievement** memberi bonus money setiap kali unlock
- 💡 Gunakan `/help` di server untuk panduan singkat

---

*Bot ini dibuat untuk ID Community. Enjoy! 🎮*
