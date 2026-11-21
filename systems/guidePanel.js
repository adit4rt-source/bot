// systems/guidePanel.js — In-bot interactive guide (/guide)
// Menampilkan panduan fitur komunitas langsung di Discord lewat panel + tombol navigasi.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('./ui');

const DIV = '━━━━━━━━━━━━━━━━━━━━';

// ==================== SECTIONS ====================
const SECTIONS = {
    overview: {
        label: '🏠 Dasar',
        title: '🏠 Panduan Dasar & Panel Komunitas',
        body:
            `Selamat datang di bot resmi **ID COMMUNITY**!\n` +
            `Bot ini dirancang khusus untuk meningkatkan keaktifan chat, voice, dan interaksi sesama member.\n\n` +
            `${DIV}\n**📱 Panel Navigasi Utama**\n` +
            `> \`/menu\` — Hub navigasi utama semua fitur bot\n` +
            `> \`/profile\` — Cek profil, EXP, badge, inventory, & kartu profil PNG\n` +
            `> \`/wallet\` — Saldo, transfer gift, & leaderboard ekonomi\n` +
            `> \`/levelpanel\` — Cek progress level obrolan & hadiah level\n` +
            `> \`/stats\` — Rangkuman statistik chat, voice, & kemenangan game\n\n` +
            `${DIV}\n**✨ Cara Cepat Naik Level & Dapet Koin**\n` +
            `> 💬 Aktif mengobrol di channel chat (+XP & Money berkala)\n` +
            `> 🎙️ Nongkrong di voice channel / private space (+XP voice)\n` +
            `> 🎁 Klaim \`/daily\` setiap hari untuk bonus koin berlipat!`
    },
    streak: {
        label: '🔥 Streak',
        title: '🔥 Sistem Streak Prestige & VVIP Lounge',
        body:
            `Jaga api keaktifanmu menyala setiap hari dengan mengetik minimal 1 pesan di server!\n\n` +
            `${DIV}\n**👑 Hierarki Role Streak (Gaya A)**\n` +
            `> 🕯️ **Penyala Api** (7–13 hari) — Multiplier Chat: 1.1x\n` +
            `> 🔥 **Penjaga Api** (14–29 hari) — Multiplier Chat: 1.2x\n` +
            `> ⚡ **Kobaran Api** (30–59 hari) — Multiplier Chat: 1.3x\n` +
            `> ☀️ **Api Abadi** (60–99 hari) — Multiplier Chat: 1.5x\n` +
            `> 🏛️ **VVIP Lounge Veteran** (100+ hari) — Multiplier Chat: 2.0x!\n\n` +
            `${DIV}\n**🏛️ Akses VVIP High-Table Lounge**\n` +
            `> Khusus member dengan streak **100 hari berturut-turut**.\n` +
            `> Kategori & voice channel eksklusif dengan bitrate maksimal (128kbps).\n` +
            `> Command: \`/streak status\` & \`/streak lounge\`.\n\n` +
            `${DIV}\n**🧊 Proteksi Streak**\n` +
            `> Streak Freeze otomatis melindungi streakmu jika berhalangan online.`
    },
    shop: {
        label: '🛒 Shop & Vault',
        title: '🛒 Toko Komunitas & Sirkulasi Vault',
        body:
            `Tukarkan koin hasil obrolanmu dengan berbagai item eksklusif di \`/shop\`!\n\n` +
            `${DIV}\n**🛡️ Proteksi & Kosmetik Profil**\n` +
            `> 🛡️ **Streak Shield** — Lindungi streak jika bolos chat 1 hari\n` +
            `> 🧊 **Streak Freeze** — Bekukan streak selama 3 hari\n` +
            `> 🎨 **Custom Color Role** — Buat role custom dengan warna HEX pilihanmu\n` +
            `> 📛 **Custom Title Tag** — Pasang gelar kustom di profil\n` +
            `> 🖼️ **Custom Profile Banner** — Pasang gambar background kartu profil\n\n` +
            `${DIV}\n**💬 Utilitas Sosial & Booster**\n` +
            `> 📢 **Server Megaphone** — Siarkan broadcast berbingkai emas ke chat\n` +
            `> 🤫 **Menfess Token** — Kirim pesan rahasia anonim via bot\n` +
            `> ⚡ **XP Booster 2x** — Double perolehan XP chat & voice\n` +
            `> 🧲 **Money Magnet** — +50% perolehan koin obrolan\n` +
            `> 📦 **Mystery Gacha Box** — Gacha berhadiah hingga 30.000 money!`
    },
    casino: {
        label: '🎰 Casino',
        title: '🎰 Mini-Games Casino & Taruhan Ringan',
        body:
            `Adu keberuntungan dengan mini-games santai bersama teman-teman server!\n\n` +
            `${DIV}\n**🎲 Permainan yang Tersedia**\n` +
            `> 🪙 **Coinflip** — Tebak Head / Tail dengan animasi seru\n` +
            `> 🎰 **Slot Machine** — Spin 3 reel, raih Jackpot 777 payout 25x\n` +
            `> 🎯 **Roulette** — Tebak angka merah, hitam, atau nomor spesifik\n` +
            `> 🃏 **/blackjack** — Main kartu 21 melawan dealer bot\n` +
            `> 🎟️ **/togel** — Pasang angka 1-100, pot akumulasi diundi tiap jam!\n\n` +
            `${DIV}\n**💡 Tips**\n` +
            `> Buka panel utama lewat \`/casino\` untuk navigasi instan.`
    },
    tempvoice: {
        label: '🎙️ TempVoice',
        title: '🎙️ Private Space (TempVoice & Private Chat)',
        body:
            `Buat ruang nongkrong privat sendiri dengan kontrol penuh!\n\n` +
            `${DIV}\n**✨ Cara Menggunakan**\n` +
            `> Klik channel join **➕ Buat Private Space**.\n` +
            `> Bot otomatis membuat kategori baru berisi:\n` +
            `>  🔊 Voice Channel privat kamu\n` +
            `>  💬 Text Chat privat khusus member di dalam voice\n\n` +
            `${DIV}\n**🎛️ Kontrol Private Space**\n` +
            `> Gunakan \`/tempvoice open\` atau panel kontrol untuk:\n` +
            `> ✏️ Ganti nama channel & atur batas user limit\n` +
            `> 🔒 Kunci / Buka akses publik\n` +
            `> 👢 Kick / Ban member yang mengganggu\n` +
            `> 👑 Transfer kepemilikan ruangan ke teman`
    },
    ramalan: {
        label: '🔮 Ramalan',
        title: '🔮 Ramalan Harian & Angka Hoki',
        body:
            `Cek aura dan keberuntungan harianmu setiap hari!\n\n` +
            `${DIV}\n**✨ Fitur Ramalan**\n` +
            `> \`/ramalan hari_ini\` — Lihat ramalan, pesan refleksi, & energi hari ini\n` +
            `> 🍀 Angka & warna hoki harian\n` +
            `> ⏰ Bot otomatis membagikan ramalan harian ke channel khusus tiap **07:00 WIB**\n\n` +
            `${DIV}\n**🎯 Konsistensi**\n` +
            `> Ramalan hari ini sama untuk seluruh server, tapi angka & interpretasi bisa kamu diskusikan bareng member lain!`
    },
    quiz: {
        label: '🎮 Quiz Game',
        title: '🎮 Kuis & Tebak Kata (/games)',
        body:
            `Uji wawasan dan kecepatan berpikir bersama member lain!\n\n` +
            `${DIV}\n**📚 14 Kategori Kuis Seru**\n` +
            `> 🤔 Siapakah Aku · 🧠 Asah Otak · 🔤 Susun Kata\n` +
            `> 🖼️ Tebak Gambar · 🗺️ Tebak Kabupaten · 😂 Cak Lontong\n` +
            `> 📝 Tebak Kalimat · 💬 Tebak Kata · ⚗️ Tebak Kimia\n` +
            `> 🎵 Tebak Lagu · 🎤 Tebak Lirik · ❓ Tebak-Tebakan\n` +
            `> 🧩 Teka-Teki · 🤫 Truth or Dare\n\n` +
            `${DIV}\n**🎁 Hadiah**\n` +
            `> Menjawab benar memberi koin money langsung ke akunmu!\n` +
            `> Akses langsung via command \`/games\`.`
    }
};

const SECTION_ORDER = ['overview', 'streak', 'shop', 'casino', 'tempvoice', 'ramalan', 'quiz'];

// ==================== BUILD PANEL ====================
function buildGuidePanel(userId, section = 'overview') {
    const key = SECTIONS[section] ? section : 'overview';
    const sec = SECTIONS[key];

    const embed = new EmbedBuilder()
        .setColor(ui.COLORS.info || '#3498DB')
        .setTitle(sec.title)
        .setDescription(sec.body)
        .setFooter({ text: 'Panduan Komunitas ID COMMUNITY • Klik tombol di bawah untuk ganti topik' });

    // Navigation buttons (active section highlighted) — max 5 per row
    const allButtons = SECTION_ORDER.map(s =>
        new ButtonBuilder()
            .setCustomId(`guide_${s}_${userId}`)
            .setLabel(SECTIONS[s].label)
            .setStyle(s === key ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
    const row1 = new ActionRowBuilder().addComponents(allButtons.slice(0, 4));
    const row2 = new ActionRowBuilder().addComponents(allButtons.slice(4));

    return { embeds: [embed], components: [row1, row2] };
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
