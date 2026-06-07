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
};

const SECTION_ORDER = ['overview', 'care', 'battle', 'activity', 'progress'];

// ==================== BUILD PANEL ====================
function buildGuidePanel(userId, section = 'overview') {
    const key = SECTIONS[section] ? section : 'overview';
    const sec = SECTIONS[key];

    const embed = new EmbedBuilder()
        .setColor(ui.COLORS.pet)
        .setTitle(sec.title)
        .setDescription(sec.body)
        .setFooter({ text: 'Panduan Pet • Klik tombol di bawah untuk pindah bagian' });

    // Navigation buttons (active section highlighted)
    const row = new ActionRowBuilder().addComponents(
        SECTION_ORDER.map(s =>
            new ButtonBuilder()
                .setCustomId(`guide_${s}_${userId}`)
                .setLabel(SECTIONS[s].label)
                .setStyle(s === key ? ButtonStyle.Primary : ButtonStyle.Secondary)
        )
    );

    return { embeds: [embed], components: [row] };
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
