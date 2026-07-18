# Changelog

## v3.10.3 — 18 Juli 2026 — Fishing Ascendant Wave

### Konten
- **Lokasi baru:** 🌌 Astral Trench (rod tier 8+, monster + God fish)
- **~30 spesies ikan baru** (mid-zone fillers + Astral Trench + endgame extras)
- **Umpan baru:** Prism Lure, Omega Bait, Trophy Chum (berat condong trophy)
- **Giant fish** di Astral / Celestial / Primordial / God Realm

### Mekanik
- **Trophy Catch** — berat ≥90% max tier → +50% nilai (cast & sell)
- **Double Catch** ability pet benar-benar double-insert inventory
- **Collection milestones** 10/25/50/75/100% Pokédex → money + items
- Treasure chance naik dari pet `drop_luck`; drop treasure baru (Trophy Chum, Prism, Omega Bait)
- Rod part drop + pet drop_luck

---

## v3.10.2 — 18 Juli 2026 — Expanded Pet Bonus System

### Engine
- Multi-bonus support (`bonuses[]`) — pet bisa 2–5 efek sekaligus
- 15+ tipe bonus baru: battle/hunt/expedition reward, gamble, daily, sell, voice_xp, pet_exp, drop/dungeon luck, shop discount, livestock, card, boss_damage
- Efektivitas dinaikkan (dampen 0.4 → 0.55), di-wire ke chat/voice, fishing, farm, quest, daily, dungeon/boss, hunt, expedition, sell fish, mini-event, coinflip, egg shop
- UI panel menampilkan semua baris bonus

### Data
- 49 pet Epic–God mendapat multi-bonus endgame (Omega, Aether Sovereign, Void Empress, dll.)

---

## v3.10.1 — 18 Juli 2026 — New Pets + Skill Pool Expand

### Pet baru (14)
- **Rare:** Neon Lynx, Coral Serpent, Storm Meerkat
- **Epic:** Blight Moth, Glacier Hydra, Solar Griffin
- **Legendary:** Obsidian Tiger, Aurora Kitsune, Tide Sovereign
- **Mythic:** Eclipse Wyrm, Starforge Golem
- **Secret:** Void Empress, Singularity Wolf
- **God:** Aether Sovereign (+70% all_reward)
- Jalur evolusi baru (Rare→Epic→Legendary)

### Skill battle baru (14)
- T1: Double Slash, Fortify
- T2: Poison Fang, Battle Focus
- T3: Whirlwind, Stone Skin
- T4: Meteor Strike, Guardian Aura
- T5: Astral Barrage, Death Defiance, Nova Flare, Chrono Mend

---

## v3.10.0 — 18 Juli 2026 — Ascendant (Pet Endgame)

### Skill Tier 5 (Lv.150)
- 8 skill battle baru: Elemental Catastrophe, Time Stop, Blood Pact, Aegis of Gods, Soul Link, Omega Burst, Void Rend, Genesis Light
- Max battle skills: 5 (1 per tier)
- Backfill otomatis untuk pet yang sudah Lv.150+

### Ability Tier 4 + Slot 4
- Slot 4 unlock: **Lv.150 + Awakening ★2+**
- Boss Scavenger, Arena Veteran, Egg Whisperer, Relic Polish, Nightmare Runner

### Nightmare Dungeon
- Daily entry (3 base, +1 Nightmare Runner), min pet Lv.100
- Scaled dungeon + random modifiers
- Nightmare Token currency + shop (Skill Tome, materials, money cache)

### Skill Reroll
- Item **Skill Tome** (bukan shop biasa — hanya Nightmare Shop)
- Reroll 1 skill battle per tier lewat panel `/pet`

### Docs
- `GUIDE-PET.md` disinkronkan (T5, T4, Nightmare, Awakening ★6)

---

## v3.5.0 — 17 Juni 2026

### Fitur Baru
- `/belajar` — Sistem belajar Bahasa Inggris ala Duolingo (10 topik, 6 tipe soal, streak, XP, achievement)
- `/ship` `/marry` `/divorce` — Social commands dengan canvas
- `/tarot` — Ramalan tarot Bahasa Indonesia (78 kartu)
- `/games` — Quiz interaktif 14 kategori (reward money)
- `/quote` — Random quotes dari pitucode API
- `/roblox` — Lihat avatar & item Roblox dengan canvas
- Video Downloader — Auto-download dari YouTube/IG/Twitter/FB/Reddit

### Perbaikan
- Welcomer GIF animasi (avatar overlay tetap bergerak)
- AI Assistant pakai DeepSeek (hemat token)
- Server logging (join/leave/edit/delete/role changes)
- Auto-mute setelah 3x pelanggaran automod
- Blocked channels configurable via admin panel

### UI
- Ship canvas: gradient romantis, glow hearts, progress bar
- Roblox canvas: landscape card, item grid, watermark
- Belajar: grammar tips, weak words, TTS audio

---

## v3.4.0 — 10 Juni 2026

- Achievement system
- Invite tracker frame
- Custom embed builder
- Welcomer editor + custom image
