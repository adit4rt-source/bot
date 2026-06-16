// systems/tarot.js — Ramalan Tarot (Bahasa Indonesia)
//
// /tarot [pertanyaan] → tarik 3 kartu (Masa Lalu / Saat Ini / Masa Depan),
// render canvas kartu mistis, lalu interpretasi Bahasa Indonesia via AI.
// AI pakai env yang sama dengan aiAssistant (AI_API_KEY/AI_BASE_URL/AI_MODEL).
// Kalau AI belum diset → fallback ke makna ringkas built-in.

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

// ---- Fonts ----
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
let FONTS_OK = false;
try {
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-Bold.ttf'), 'PoppinsBold');
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-SemiBold.ttf'), 'PoppinsSemiBold');
    FONTS_OK = true;
} catch (_) {}
const HEAD_FONT = FONTS_OK ? 'PoppinsBold' : 'sans-serif';
const SUB_FONT = FONTS_OK ? 'PoppinsSemiBold' : 'sans-serif';

// ==================== DECK (78 kartu RWS) ====================
const MAJOR = [
    'The Fool', 'The Magician', 'The High Priestess', 'The Empress', 'The Emperor',
    'The Hierophant', 'The Lovers', 'The Chariot', 'Strength', 'The Hermit',
    'Wheel of Fortune', 'Justice', 'The Hanged Man', 'Death', 'Temperance',
    'The Devil', 'The Tower', 'The Star', 'The Moon', 'The Sun',
    'Judgement', 'The World',
];
const MAJOR_ID = {
    'The Fool': 'Si Pengembara', 'The Magician': 'Sang Pesulap', 'The High Priestess': 'Pendeta Agung',
    'The Empress': 'Sang Permaisuri', 'The Emperor': 'Sang Kaisar', 'The Hierophant': 'Sang Paus',
    'The Lovers': 'Sepasang Kekasih', 'The Chariot': 'Kereta Perang', 'Strength': 'Kekuatan',
    'The Hermit': 'Sang Pertapa', 'Wheel of Fortune': 'Roda Keberuntungan', 'Justice': 'Keadilan',
    'The Hanged Man': 'Orang Tergantung', 'Death': 'Kematian', 'Temperance': 'Kesederhanaan',
    'The Devil': 'Sang Iblis', 'The Tower': 'Menara', 'The Star': 'Bintang',
    'The Moon': 'Bulan', 'The Sun': 'Matahari', 'Judgement': 'Penghakiman', 'The World': 'Dunia',
};
const SUITS = [
    { en: 'Wands', id: 'Tongkat' },
    { en: 'Cups', id: 'Piala' },
    { en: 'Swords', id: 'Pedang' },
    { en: 'Pentacles', id: 'Koin' },
];
const RANKS = [
    { en: 'Ace', id: 'As' }, { en: 'Two', id: '2' }, { en: 'Three', id: '3' }, { en: 'Four', id: '4' },
    { en: 'Five', id: '5' }, { en: 'Six', id: '6' }, { en: 'Seven', id: '7' }, { en: 'Eight', id: '8' },
    { en: 'Nine', id: '9' }, { en: 'Ten', id: '10' }, { en: 'Page', id: 'Pelayan' },
    { en: 'Knight', id: 'Ksatria' }, { en: 'Queen', id: 'Ratu' }, { en: 'King', id: 'Raja' },
];

// ==================== MAKNA (Bahasa Indonesia, built-in, tanpa AI) ====================
const MAJOR_MEANINGS = {
    'The Fool': ['Awal baru, kebebasan, spontanitas, berani melangkah.', 'Ceroboh, ragu-ragu, mengambil risiko tanpa pikir panjang.'],
    'The Magician': ['Kemampuan, tekad, percaya diri, mewujudkan keinginan.', 'Bakat tak terpakai, manipulasi, kurang fokus.'],
    'The High Priestess': ['Intuisi, kebijaksanaan batin, rahasia, ketenangan.', 'Mengabaikan kata hati, rahasia terbongkar.'],
    'The Empress': ['Kelimpahan, kasih sayang, kesuburan, kenyamanan.', 'Kurang perhatian pada diri, ketergantungan.'],
    'The Emperor': ['Kepemimpinan, kestabilan, struktur, kewibawaan.', 'Terlalu mengontrol, kaku, keras kepala.'],
    'The Hierophant': ['Tradisi, bimbingan, nilai, kepercayaan.', 'Memberontak, melawan aturan, mencari jalan sendiri.'],
    'The Lovers': ['Cinta, keharmonisan, pilihan dari hati, hubungan.', 'Ketidakcocokan, konflik, pilihan yang sulit.'],
    'The Chariot': ['Tekad, kemenangan, kendali diri, fokus.', 'Kehilangan arah, kurang kendali, ragu.'],
    'Strength': ['Keberanian, kesabaran, kekuatan dari dalam.', 'Ragu pada diri, emosi sulit dikendalikan.'],
    'The Hermit': ['Perenungan, mencari jati diri, ketenangan.', 'Kesepian, terlalu menarik diri.'],
    'Wheel of Fortune': ['Keberuntungan, perubahan, siklus, takdir baik.', 'Nasib kurang baik sementara, menolak perubahan.'],
    'Justice': ['Keadilan, kejujuran, keseimbangan, kebenaran.', 'Ketidakadilan, menghindari tanggung jawab.'],
    'The Hanged Man': ['Melepaskan, sudut pandang baru, kesabaran.', 'Terjebak, menunda, pengorbanan sia-sia.'],
    'Death': ['Akhir sebuah fase, transformasi, awal yang baru.', 'Menolak perubahan, stagnan, takut melepaskan.'],
    'Temperance': ['Keseimbangan, kesabaran, keselarasan.', 'Berlebihan, tidak sabar, kurang seimbang.'],
    'The Devil': ['Godaan, keterikatan, materialisme, kebiasaan buruk.', 'Lepas dari belenggu, sadar, merdeka.'],
    'The Tower': ['Kejutan, perubahan mendadak, kebenaran terungkap.', 'Menghindari bencana, perubahan yang tertunda.'],
    'The Star': ['Harapan, inspirasi, penyembuhan, ketenangan.', 'Putus asa, lelah, kehilangan keyakinan.'],
    'The Moon': ['Ilusi, kebingungan, intuisi, ketakutan tersembunyi.', 'Kebingungan mereda, kebenaran mulai jelas.'],
    'The Sun': ['Kebahagiaan, kesuksesan, kehangatan, semangat.', 'Kebahagiaan tertunda, kurang bersemangat.'],
    'Judgement': ['Kebangkitan, refleksi, panggilan, pembaruan diri.', 'Keraguan diri, menolak panggilan, terlalu mengkritik diri.'],
    'The World': ['Pencapaian, penyelesaian, kesempurnaan, perjalanan usai.', 'Tujuan tertunda, ada yang belum selesai.'],
};
// Minor: keyed by `${rank.en} of ${suit.en}`
const MINOR_MEANINGS = {
    // Wands
    'Ace of Wands': ['Inspirasi baru, potensi, semangat membara.', 'Ide tertunda, kurang motivasi.'],
    'Two of Wands': ['Perencanaan, keputusan, visi masa depan.', 'Takut perubahan, kurang perencanaan.'],
    'Three of Wands': ['Ekspansi, kemajuan, melihat peluang.', 'Hambatan, rencana tertunda.'],
    'Four of Wands': ['Perayaan, keharmonisan, rumah, kebahagiaan.', 'Ketegangan, perayaan tertunda.'],
    'Five of Wands': ['Persaingan, perselisihan kecil, dinamika.', 'Menghindari konflik, mencari damai.'],
    'Six of Wands': ['Kemenangan, pengakuan, kesuksesan.', 'Ego, kemenangan tertunda.'],
    'Seven of Wands': ['Mempertahankan posisi, keberanian, gigih.', 'Kewalahan, ingin menyerah.'],
    'Eight of Wands': ['Gerak cepat, kabar baik, kemajuan pesat.', 'Penundaan, frustrasi.'],
    'Nine of Wands': ['Ketahanan, gigih, hampir sampai tujuan.', 'Lelah, menyerah terlalu cepat.'],
    'Ten of Wands': ['Beban berat, tanggung jawab, kerja keras.', 'Melepas beban, belajar mendelegasikan.'],
    'Page of Wands': ['Antusiasme, ide segar, semangat eksplorasi.', 'Kurang arah, ide masih mentah.'],
    'Knight of Wands': ['Energi, petualangan, penuh gairah.', 'Terburu-buru, tidak konsisten.'],
    'Queen of Wands': ['Percaya diri, hangat, mandiri, menarik.', 'Kurang percaya diri, cemburu.'],
    'King of Wands': ['Pemimpin visioner, berani, karismatik.', 'Otoriter, terburu nafsu.'],
    // Cups
    'Ace of Cups': ['Cinta baru, emosi positif, kebahagiaan.', 'Emosi tertahan, kekecewaan.'],
    'Two of Cups': ['Hubungan, kemitraan, cinta saling.', 'Ketidakharmonisan, hubungan renggang.'],
    'Three of Cups': ['Persahabatan, perayaan, kebersamaan.', 'Berlebihan, drama, gosip.'],
    'Four of Cups': ['Perenungan, bosan, peluang terlewat.', 'Kesadaran baru, menerima peluang.'],
    'Five of Cups': ['Kesedihan, kehilangan, penyesalan.', 'Penerimaan, mulai move on, pemulihan.'],
    'Six of Cups': ['Nostalgia, kenangan indah, kepolosan.', 'Terlalu terjebak masa lalu.'],
    'Seven of Cups': ['Banyak pilihan, khayalan, peluang.', 'Kejelasan, fokus pada satu tujuan.'],
    'Eight of Cups': ['Meninggalkan yang tak bermakna, mencari arti.', 'Takut berubah, terjebak situasi.'],
    'Nine of Cups': ['Kepuasan, harapan terkabul, syukur.', 'Keinginan dangkal, kurang puas.'],
    'Ten of Cups': ['Kebahagiaan keluarga, keharmonisan.', 'Keluarga renggang, nilai tak selaras.'],
    'Page of Cups': ['Pesan manis, kreativitas, kepekaan hati.', 'Emosi labil, kabar mengecewakan.'],
    'Knight of Cups': ['Romantis, penuh pesona, mengikuti hati.', 'Plin-plan, terlalu melankolis.'],
    'Queen of Cups': ['Empati, kasih sayang, intuisi, perhatian.', 'Terlalu sensitif, emosi kurang stabil.'],
    'King of Cups': ['Dewasa secara emosi, tenang, bijaksana.', 'Memendam emosi, manipulatif.'],
    // Swords
    'Ace of Swords': ['Kejelasan, kebenaran, ide yang tajam.', 'Kebingungan, salah paham.'],
    'Two of Swords': ['Kebimbangan, jalan buntu, keputusan sulit.', 'Kebuntuan terurai, mulai memilih.'],
    'Three of Swords': ['Patah hati, kesedihan, luka.', 'Pemulihan, mulai melepaskan rasa sakit.'],
    'Four of Swords': ['Istirahat, pemulihan, jeda sejenak.', 'Gelisah, sangat butuh istirahat.'],
    'Five of Swords': ['Konflik, ego, kemenangan yang pahit.', 'Rekonsiliasi, melepas dendam.'],
    'Six of Swords': ['Transisi, pindah ke tempat lebih baik.', 'Sulit melangkah maju, tertahan.'],
    'Seven of Swords': ['Strategi, kehati-hatian, akal-akalan.', 'Pengakuan, berhenti menipu.'],
    'Eight of Swords': ['Merasa terjebak, terbatas, ragu.', 'Bebas, menemukan jalan keluar.'],
    'Nine of Swords': ['Kecemasan, khawatir, pikiran berat.', 'Kecemasan mereda, harapan muncul.'],
    'Ten of Swords': ['Akhir yang berat, titik terendah.', 'Bangkit kembali, pemulihan.'],
    'Page of Swords': ['Rasa ingin tahu, waspada, ide baru.', 'Terburu bicara, gosip.'],
    'Knight of Swords': ['Ambisi, tegas, bertindak cepat.', 'Gegabah, agresif.'],
    'Queen of Swords': ['Jernih, jujur, mandiri, tegas.', 'Dingin, terlalu mengkritik.'],
    'King of Swords': ['Logika, kebenaran, adil, berwibawa.', 'Kaku, manipulatif.'],
    // Pentacles
    'Ace of Pentacles': ['Peluang baru, kemakmuran, rezeki.', 'Peluang terlewat, rencana keuangan gagal.'],
    'Two of Pentacles': ['Keseimbangan, adaptasi, mengatur banyak hal.', 'Kewalahan, kurang teratur.'],
    'Three of Pentacles': ['Kerja tim, keahlian, kolaborasi.', 'Kurang kerjasama, kerja asal-asalan.'],
    'Four of Pentacles': ['Stabilitas, hemat, rasa aman.', 'Pelit, terlalu posesif pada materi.'],
    'Five of Pentacles': ['Kesulitan, kekurangan, masa sulit.', 'Pemulihan, bantuan datang.'],
    'Six of Pentacles': ['Kedermawanan, berbagi, keseimbangan rezeki.', 'Ketimpangan, utang, pamrih.'],
    'Seven of Pentacles': ['Kesabaran, investasi, hasil jangka panjang.', 'Tidak sabar, hasil mengecewakan.'],
    'Eight of Pentacles': ['Ketekunan, mengasah keahlian, kerja keras.', 'Kurang fokus, kualitas menurun.'],
    'Nine of Pentacles': ['Kemandirian, kenyamanan, hasil kerja.', 'Boros, terlalu bergantung pada orang.'],
    'Ten of Pentacles': ['Kekayaan, keluarga makmur, warisan.', 'Masalah keuangan keluarga.'],
    'Page of Pentacles': ['Peluang belajar, ambisi, rencana baru.', 'Menunda-nunda, kurang komitmen.'],
    'Knight of Pentacles': ['Kerja keras, dapat diandalkan, konsisten.', 'Stagnan, terlalu kaku.'],
    'Queen of Pentacles': ['Praktis, mapan, pengasuh, nyaman.', 'Lupa merawat diri, terlalu sibuk kerja.'],
    'King of Pentacles': ['Kesuksesan, kemapanan, pemimpin yang andal.', 'Materialistis, serakah.'],
};

function buildDeck() {
    const deck = [];
    for (const m of MAJOR) {
        const mn = MAJOR_MEANINGS[m] || ['', ''];
        deck.push({ name: m, nameId: MAJOR_ID[m], arcana: 'major', meaningUp: mn[0], meaningRev: mn[1] });
    }
    for (const s of SUITS) {
        for (const r of RANKS) {
            const key = `${r.en} of ${s.en}`;
            const mn = MINOR_MEANINGS[key] || ['', ''];
            deck.push({ name: key, nameId: `${r.id} ${s.id}`, arcana: 'minor', meaningUp: mn[0], meaningRev: mn[1] });
        }
    }
    return deck;
}
const DECK = buildDeck();

function drawCards(n = 3) {
    const pool = [...DECK];
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        const card = pool.splice(idx, 1)[0];
        out.push({ ...card, reversed: Math.random() < 0.4 });
    }
    return out;
}

const POSITIONS = ['Masa Lalu', 'Saat Ini', 'Masa Depan'];

// ==================== READING (built-in, tanpa AI) ====================
function buildReading(cards, question) {
    const lines = cards.map((c, i) => {
        const m = c.reversed ? c.meaningRev : c.meaningUp;
        const ori = c.reversed ? '🔄 Terbalik' : '⬆️ Tegak';
        return `**${POSITIONS[i]} — ${c.nameId}** ${ori}\n${m}`;
    });
    return lines.join('\n\n');
}

// ==================== CANVAS ====================
function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

function drawStar(ctx, cx, cy, spikes, outerR, innerR) {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
        ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR); rot += step;
        ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR); rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
}

function wrap(ctx, text, maxW) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
        if (ctx.measureText(line + ' ' + w).width > maxW && line) { lines.push(line); line = w; }
        else line = line ? line + ' ' + w : w;
    }
    if (line) lines.push(line);
    return lines;
}

function generateTarotCanvas(cards) {
    const CW = 250, CH = 400, GAP = 30, PADX = 40, TOP = 90;
    const W = PADX * 2 + CW * 3 + GAP * 2;
    const H = TOP + CH + 50;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Mystical gradient background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0b0420');
    bg.addColorStop(0.5, '#1d0a3a');
    bg.addColorStop(1, '#2a0d4a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Stars in bg
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 60; i++) {
        const x = Math.random() * W, y = Math.random() * H, s = Math.random() * 1.8;
        ctx.globalAlpha = Math.random() * 0.6 + 0.2;
        ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;

    // Title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5d76e';
    ctx.font = `bold 36px ${HEAD_FONT}`;
    ctx.fillText('RAMALAN TAROT', W / 2, 50);

    cards.forEach((card, i) => {
        const x = PADX + i * (CW + GAP);
        const y = TOP;

        // Position label
        ctx.fillStyle = 'rgba(245,215,110,0.9)';
        ctx.font = `bold 18px ${SUB_FONT}`;
        ctx.fillText((POSITIONS[i] || '').toUpperCase(), x + CW / 2, y - 14);

        // Card body
        const cardGrad = ctx.createLinearGradient(x, y, x, y + CH);
        cardGrad.addColorStop(0, '#3a1a6e');
        cardGrad.addColorStop(1, '#1a0a3a');
        ctx.fillStyle = cardGrad;
        roundRect(ctx, x, y, CW, CH, 16);
        ctx.fill();

        // Gold border
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#f5d76e';
        roundRect(ctx, x + 5, y + 5, CW - 10, CH - 10, 12);
        ctx.stroke();

        // Center emblem (star/sun)
        ctx.save();
        if (card.reversed) ctx.translate(x + CW, y + CH), ctx.rotate(Math.PI), ctx.translate(-x, -y);
        ctx.fillStyle = 'rgba(245,215,110,0.92)';
        drawStar(ctx, x + CW / 2, y + CH / 2 - 20, card.arcana === 'major' ? 12 : 6, 55, 24);
        ctx.fill();
        // small inner circle
        ctx.fillStyle = '#2a0d4a';
        ctx.beginPath();
        ctx.arc(x + CW / 2, y + CH / 2 - 20, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Card name (wrapped)
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold 20px ${SUB_FONT}`;
        const lines = wrap(ctx, card.nameId, CW - 30);
        let ty = y + CH - 70 - (lines.length - 1) * 12;
        for (const ln of lines) { ctx.fillText(ln, x + CW / 2, ty); ty += 24; }

        // Orientation badge
        ctx.font = `13px ${SUB_FONT}`;
        ctx.fillStyle = card.reversed ? '#ff8fa3' : '#9be39b';
        ctx.fillText(card.reversed ? '🔄 TERBALIK' : '⬆ TEGAK', x + CW / 2, y + CH - 24);
    });

    return canvas.toBuffer('image/png');
}

// ==================== HANDLER ====================
async function handleTarotCommand(interaction) {
    const question = interaction.options?.getString('pertanyaan') || '';
    await interaction.deferReply();

    const cards = drawCards(3);

    let buffer = null;
    try { buffer = generateTarotCanvas(cards); } catch (e) { log('WARN', `[tarot] canvas: ${e.message}`); }

    const reading = buildReading(cards, question);

    const embed = new EmbedBuilder()
        .setColor('#7b2ff7')
        .setTitle('🔮 Ramalan Tarot')
        .setDescription(
            (question ? `*"${question}"*\n\n` : '') +
            (reading || '✨ Renungkan kartu-kartu di atas untuk menemukan jawabanmu.')
        )
        .setFooter({ text: `Ditanya oleh ${interaction.user.username} • Tarot hanya untuk hiburan 🔮` })
        .setTimestamp();

    const files = [];
    if (buffer) {
        files.push(new AttachmentBuilder(buffer, { name: 'tarot.png' }));
        embed.setImage('attachment://tarot.png');
    }

    return interaction.editReply({ embeds: [embed], files });
}

module.exports = { handleTarotCommand, drawCards, buildReading, generateTarotCanvas, DECK };
