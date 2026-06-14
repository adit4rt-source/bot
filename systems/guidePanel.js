// systems/guidePanel.js — In-bot interactive guide (/guide)
// Menampilkan panduan fitur langsung di Discord lewat panel + tombol navigasi.
// Saat ini fokus ke PET. Tambah topik lain dengan menambah section baru.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('./ui');

const DIV = '━━━━━━━━━━━━━━━━━━━━';

// ==================== SECTIONS ====================
// Tiap section punya konten ringkas-tapi-lengkap. Dibatasi < 4096 char (limit embed).
const SECTIONS = {
    overview: {
        label: '🏠 Dasar',
        title: '🐾 Pet — Dasar & Cara Dapat',
        body:
            `Pet punya **2 peran**: kasih **bonus pasif** (income/XP/luck otomatis) dan bisa diajak **bertarung & beraktivitas**.\n` +
            `Kamu bisa punya banyak pet, tapi **cuma 1 aktif** — ganti via **🔄 Swap**.\n\n` +
            `${DIV}\n**🥚 Cara Dapat Pet**\n` +
            `> 🛒 **Shop** — beli langsung (Common–Epic)\n` +
            `> 🥚 **Egg/Gacha** — satu-satunya cara Legendary ke atas\n\n` +
            `> 🥚 Common (2rb): Common 60/Uncommon 30/Rare 10\n` +
            `> 🥚 Rare (10rb): Uncommon 35/Rare 40/Epic 20/Legendary 5\n` +
            `> 🥚 Legendary (50rb): Rare 25/Epic 40/Legendary 25/Mythic 10\n` +
            `> 🌟 Mythic (150rb): Epic 28/Legendary 45/Mythic 25/**Secret 2**\n` +
            `> 🌌 Celestial (500rb): Legendary 40/Mythic 45/**Secret 14/GOD 1**\n\n` +
            `${DIV}\n**🏆 Tier (rendah → tinggi)**\n` +
            `> ⚪ Common · 🟢 Uncommon · 🔵 Rare · 🟣 Epic\n` +
            `> 🟡 Legendary · 🔴 Mythic · 🟪 Secret · 👑 GOD\n` +
            `> Makin tinggi tier = bonus pasif & stats makin besar.\n` +
            `> Lihat semua pet di **📖 Pet Dex** (tombol di panel \`/pet\`).`
    },
    care: {
        label: '❤️ Rawat & Bonus',
        title: '❤️ Perawatan & Bonus Pasif',
        body:
            `Bonus pasif **MATI total** kalau: 😢 Happiness < 30, 🍖 Hunger < 10, pet **sakit**, atau lagi **Hunting**.\n` +
            `Jaga pet dengan **🍖 Feed** & **🎾 Play**.\n\n` +
            `${DIV}\n**🍖 Makanan**\n` +
            `> Snack (30) +15 hunger\n` +
            `> Daging Premium (100) +30 hunger\n` +
            `> Kue Spesial (200) +25 happy\n` +
            `> Feast Mewah (500) +50 hunger +30 happy\n` +
            `> Makanan Mitik (1.500) +100 hunger +50 happy\n\n` +
            `${DIV}\n**📈 Bonus naik per level pet** (mentok Lv.30)\n` +
            `> Lv.0–4 ×1.0 · Lv.5–9 ×1.2 · Lv.10–14 ×1.5\n` +
            `> Lv.15–19 ×1.8 · Lv.20–24 ×2.0 · Lv.25–29 ×2.5 · **Lv.30+ ×3.0**\n\n` +
            `${DIV}\n**🎁 Tipe bonus**\n` +
            `> money/xp dari chat, money_all, xp_all, fish_luck, farm_yield/speed,\n` +
            `> quest_reward, event_luck, dan **all_reward** (paling fleksibel).\n` +
            `> ⚙️ Angka di panel = potensi maksimal (ada penyeimbang internal).`
    },
    battle: {
        label: '⚔️ Battle & Element',
        title: '⚔️ Battle, Skill & Element',
        body:
            `**📊 Stats:** HP, ATK, DEF, SPD, CRIT (acak sesuai tier).\n` +
            `**🏷️ Class** (warrior/tank/dll) = **kosmetik**, tidak pengaruh battle.\n` +
            `**🔥 Element** = sangat berpengaruh!\n\n` +
            `${DIV}\n**🌟 Skill (1 acak per tier, otomatis dipakai)**\n` +
            `> **Lv.10** Power Strike 2x · Shield Wall -50% dmg · Quick Heal +20% HP\n` +
            `> **Lv.30** Critical Surge +30% crit · Elemental Blast 2.5x · Life Drain 1.5x+heal\n` +
            `> **Lv.60** Berserk +50% ATK · Iron Fortress -80% dmg · **Resurrection** (bangkit 1x)\n` +
            `> **Lv.100** Ultimate Strike **4x** · Divine Shield (kebal 1 turn) · Omega Heal +50%\n\n` +
            `${DIV}\n**🔥 Element Matchup**\n` +
            `> 🔥 Fire → 🌿 Nature → 💧 Water → 🔥 Fire\n` +
            `> ⚡ Electric → 💧 Water · 🌑 Dark ↔ ✨ Light\n\n` +
            `> Unggul: **+25% dmg** · Lemah: **-20%** · Elemental Blast unggul: **+50%**\n` +
            `> Berlaku di Dungeon, Boss, PvP, World Boss.`
    },
    activity: {
        label: '🗺️ Aktivitas',
        title: '🗺️ Hunt · Dungeon · Boss · Expedition',
        body:
            `**🏹 Hunt** — berburu 10–20 menit. 80% sukses → 100–400 money + EXP + 25% material. Buff mati selama hunt.\n\n` +
            `${DIV}\n**🏰 Dungeon** — *aktif, cepat, COUNTER elemen*\n` +
            `> Instan (CD beberapa menit). **Lawan** elemen musuh → +25% dmg.\n` +
            `> Sumber utama **relic & material gear**.\n` +
            `> ⚠️ Kalah = hilang money kecil (ada cap per tier, BUKAN % total saldo).\n\n` +
            `${DIV}\n**👹 Boss**\n` +
            `> Solo (CD 10 mnt): money besar + refine + relic. Boss endgame drop Mythic Fragment / Awakening Crystal.\n` +
            `> Party Raid (1–10 player): damage tiap member di-scale elemen vs boss.\n\n` +
            `${DIV}\n**🌊 Expedition** — *pasif AFK, SYNERGY elemen*\n` +
            `> Kirim pet 2–8 jam (pet terkunci, tanpa risiko).\n` +
            `> Bawa pet **se-elemen** tema zona → **+25% money, +20% EXP, +15% drop**.\n` +
            `> Fokus **EXP massal + booster/consumable**.\n` +
            `> Zona: 🌲nature 🏔️electric 🏛️light 🌊water 🌑dark 🗼fire\n\n` +
            `> 🎯 **Beda kunci:** Dungeon = *lawan* elemen musuh · Expedition = *samakan* elemen zona.`
    },
    card: {
        label: '🃏 Card TCG',
        title: '🃏 Pokemon Card TCG — Panduan Gacha',
        body:
            `Kumpulkan kartu Pokemon asli dari **pokemontcg.io**! Beli pack, kumpulkan koleksi, burn duplikat jadi Stardust.\n\n` +
            `${DIV}\n**🎴 Gacha Pack**\n` +
            `> 🟢 **Basic** (15rb) — 3 kartu: Common/Uncommon/Rare. CD 5 mnt\n` +
            `> 🔵 **Premium** (75rb) — 3 kartu: Rare–Holo V. CD 15 mnt\n` +
            `> 🟣 **Ultra** (200rb) — 3 kartu: Rare Holo–Secret. CD 30 mnt\n` +
            `> 💎 **Master** (750rb) — 10 kartu + 1 Ultra guaranteed! CD 60 mnt\n\n` +
            `${DIV}\n**⭐ Rarity (rendah → tinggi)**\n` +
            `> ⚪ Common · 🟢 Uncommon · 🔵 Rare · 🟣 Rare Holo\n` +
            `> 🟡 Rare Holo EX/GX/V · 🔴 Rare Ultra · 🌈 Rare Rainbow\n` +
            `> 👑 Rare Secret · 🎨 Illustration Rare · 💎 Special Art Rare\n\n` +
            `${DIV}\n**✨ Stardust & Burn**\n` +
            `> Burn duplikat → dapat ✨ Stardust sesuai rarity.\n` +
            `> Stardust bisa dipakai untuk fitur khusus di masa depan.\n\n` +
            `${DIV}\n**❤️ Wishlist & Fitur Lain**\n` +
            `> \`/wishlist add [nama]\` — otomatis di-ping saat kartu muncul\n` +
            `> 🏆 **Leaderboard** — top collector berdasar total koleksi\n` +
            `> 🎨 **Dye** — warnai kartu favoritmu\n\n` +
            `> -# *Fan-made • Not affiliated with Nintendo/The Pokemon Company*`
    },
    arena: {
        label: '🏟️ Arena',
        title: '🏟️ Ranked Arena — Panduan PvP',
        body:
            `Adu kekuatan pet di **Ranked Arena** dengan sistem **ELO matchmaking**!\n\n` +
            `${DIV}\n**⚔️ Cara Main**\n` +
            `> Ketik \`/arena\` → klik ⚔️ **Cari Lawan**.\n` +
            `> Bot otomatis cari lawan rating serupa (ELO ±range).\n` +
            `> Cooldown: 45 detik antar fight. Max 50 fight/hari.\n\n` +
            `${DIV}\n**🏆 Tier System**\n` +
            `> 🥉 Bronze (0+) · 🥈 Silver (1100+) · 🥇 Gold (1250+)\n` +
            `> 💠 Platinum (1400+) · 💎 Diamond (1600+) · 👑 Master (1850+)\n` +
            `> Naik tier = bonus money + AP + item!\n\n` +
            `${DIV}\n**🔥 Win Streak Bonus**\n` +
            `> 3 streak: ×1.5 · 5: ×2 · 7: ×2.5 · 10: ×3 reward!\n\n` +
            `${DIV}\n**🎖️ Arena Points (AP) & Shop**\n` +
            `> Menang → AP. AP bisa beli item eksklusif di Arena Shop:\n` +
            `> 🗡️ Arena Relic Box · 🥚 Arena Egg (Epic-Mythic)\n` +
            `> dan booster lainnya.\n\n` +
            `${DIV}\n**📅 Monthly Season**\n` +
            `> Tiap bulan, rating di soft-reset.\n` +
            `> Top 10 dapat bonus besar + title eksklusif!`
    },
    progress: {
        label: '📈 Kembang',
        title: '📈 Evolution · Fusion · Relic · Abilities · Awakening',
        body:
            `**⬆️ Evolution** — pet tertentu evolusi otomatis di Lv.20/50/100/150 jadi lebih kuat.\n\n` +
            `${DIV}\n**🧬 Fusion** — gabung 2 pet tier sama (non-aktif) → tier lebih tinggi:\n` +
            `> Common 3rb/90% · Uncommon 10rb/75% · Rare 30rb/60%\n` +
            `> Epic 80rb/45% · Legendary 200rb/30%\n` +
            `> ⚠️ Gagal = kehilangan 1 pet acak (biaya tetap kepotong).\n\n` +
            `${DIV}\n**♻️ Release Pet** — lepas pet non-aktif dari 📦 Collection → dapat refund money sesuai tier (wajib konfirmasi; pet aktif/hunting/ekspedisi tidak bisa dilepas).\n\n` +
            `${DIV}\n**📿 Relic & Refine** — relic (Weapon/Armor/Accessory) drop dari Dungeon/Boss, kasih +stats.\n` +
            `> Upgrade pakai 🪨 Refine Stone; 🛡️ Protection Stone cegah turun level saat gagal.\n\n` +
            `${DIV}\n**💎 Abilities** (pasif, 3 slot, swap CD 24 jam)\n` +
            `> Lv.30: Auto-Fish, Auto-Water, Passive Income/XP, Slow Hunger\n` +
            `> Lv.50: +15% jual, /daily +30%, -15% shop, Quest Ace, Streak Guard\n` +
            `> Lv.100: Double Catch, Green Thumb, +15% relic, +10% crit, -25% expedition\n\n` +
            `${DIV}\n**⚡ Awakening** (Lv.200) — reset Lv.1 tapi stats base naik permanen:\n` +
            `> ★ +15% · ★★ +30% · ★★★ +50% · ★★★★ +75% · ★★★★★ **+100%**\n` +
            `> Skill & ability tetap. Butuh money + material langka.`
    },
    farming: {
        label: '🌾 Tani & Cuaca',
        title: '🌾 Pertanian, Cuaca & Musim',
        body:
            `**🌦️ Cuaca & Musim** berpengaruh besar ke pertanian dan pancingan!\n\n` +
            `${DIV}\n**📈 Fluktuasi Harga Pasar**\n` +
            `> Harga benih & tanaman naik-turun berdasarkan musim/cuaca hari itu.\n` +
            `> Contoh: Musim Dingin (Winter) meningkatkan harga tanaman pangan +30%.\n` +
            `> Kekeringan (Drought) atau Badai meningkatkan harga +20%.\n` +
            `> Gunakan fluktuasi ini untuk menjual hasil panen di harga puncak!\n\n` +
            `${DIV}\n**🌧️ Efek Cuaca pada Pancing**\n` +
            `> 🌧️ Hujan / Badai: Cooldown memancing dipotong **15%**.\n` +
            `> 🌩️ Badai (Stormy): Kemunculan Sea Monster meningkat **2x lipat**.\n\n` +
            `${DIV}\n**🛡️ Proteksi Hama (Pest Shield)**\n` +
            `> Hama bisa menyerang lahan dan mengurangi hasil panen.\n` +
            `> Konsumsi 🥗 **Veggie Salad** untuk melindungi lahan selama **6 jam**.`
    },
    cooking: {
        label: '🍳 Masak & Gem',
        title: '🍳 Cooking Hub & Relic Socketing',
        body:
            `Manfaatkan bahan mentah dan sisa material untuk memperkuat pet aktifmu!\n\n` +
            `${DIV}\n**🍳 Cooking Hub (Menu Masak)**\n` +
            `> Akses melalui \`/pet\` → tombol 🍳 **Cook**.\n` +
            `> Masak bahan makanan dari storage menjadi hidangan berguna:\n` +
            `> 🥞 **Pancake** (2 Gandum + 1 Telur + 1 Susu) → 100% pulihkan lapar & senang pet.\n` +
            `> 🍜 **Spicy Fish Soup** (1 Rare Fish + 2 Pestisida) → +10% ATK pet (1 jam).\n` +
            `> 🥗 **Veggie Salad** (3 Wortel + 2 Kentang) → Kebal hama pertanian (6 jam).\n\n` +
            `${DIV}\n**🧬 Relic Gem Socketing**\n` +
            `> Relic tier Epic ke atas memiliki slot untuk dipasang permata:\n` +
            `> 🟣 **Epic**: 1 Slot | 🟡 **Legendary**: 2 Slot | 🔴 **Mythic/God**: 3 Slot.\n` +
            `> Pasang permata (\`dna_shard\`, \`mutation_serum\`, dll) untuk stat HP/ATK/DEF/SPD/CRIT.\n` +
            `> Cabut permata kapan saja tanpa biaya untuk mengembalikannya ke tas.`
    },
};

const SECTION_ORDER = ['overview', 'care', 'battle', 'activity', 'progress', 'card', 'arena', 'farming', 'cooking'];

// ==================== BUILD PANEL ====================
function buildGuidePanel(userId, section = 'overview') {
    const key = SECTIONS[section] ? section : 'overview';
    const sec = SECTIONS[key];

    const embed = new EmbedBuilder()
        .setColor(ui.COLORS.pet)
        .setTitle(sec.title)
        .setDescription(sec.body)
        .setFooter({ text: 'Panduan Bot • Klik tombol di bawah untuk pindah bagian' });

    // Navigation buttons (active section highlighted) — max 5 per row
    const allButtons = SECTION_ORDER.map(s =>
        new ButtonBuilder()
            .setCustomId(`guide_${s}_${userId}`)
            .setLabel(SECTIONS[s].label)
            .setStyle(s === key ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
    const row1 = new ActionRowBuilder().addComponents(allButtons.slice(0, 5));
    const components = [row1];
    if (allButtons.length > 5) {
        const row2 = new ActionRowBuilder().addComponents(allButtons.slice(5));
        components.push(row2);
    }

    return { embeds: [embed], components };
}

// ==================== HANDLER ====================
async function handleGuideButton(interaction) {
    const parts = interaction.customId.split('_');
    const userId = parts[parts.length - 1];
    const section = parts[1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel kamu! Ketik `/guide` untuk buka punyamu sendiri.', ephemeral: true });
    }

    return interaction.update(buildGuidePanel(userId, section));
}

function isGuideButton(customId) {
    return customId.startsWith('guide_');
}

module.exports = { buildGuidePanel, handleGuideButton, isGuideButton, SECTIONS };
