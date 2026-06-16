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

function buildDeck() {
    const deck = [];
    for (const m of MAJOR) deck.push({ name: m, nameId: MAJOR_ID[m], arcana: 'major' });
    for (const s of SUITS) {
        for (const r of RANKS) {
            deck.push({ name: `${r.en} of ${s.en}`, nameId: `${r.id} ${s.id}`, arcana: 'minor' });
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

// ==================== AI READING (Bahasa Indonesia) ====================
function aiConfig() {
    return {
        apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
        baseURL: (process.env.AI_BASE_URL || 'https://ai.sumopod.com/v1').replace(/\/$/, ''),
        model: process.env.AI_MODEL || 'deepseek-v4-flash',
    };
}

async function generateReading(cards, question) {
    const cfg = aiConfig();
    const cardList = cards.map((c, i) => `${POSITIONS[i]}: ${c.nameId} (${c.name})${c.reversed ? ' - Terbalik' : ' - Tegak'}`).join('\n');

    if (!cfg.apiKey) {
        // Fallback: simple Indonesian template (no AI)
        return cards.map((c, i) =>
            `**${POSITIONS[i]} — ${c.nameId}** ${c.reversed ? '🔄' : ''}\n` +
            `Kartu ini ${c.reversed ? 'terbalik, menandakan tantangan atau energi yang terhambat' : 'tegak, membawa energi positif'}. ` +
            `Renungkan maknanya untuk ${question || 'perjalananmu'}.`
        ).join('\n\n');
    }

    const system = [
        'Kamu adalah peramal tarot berpengalaman yang ramah dan bijak. Jawab SELALU dalam Bahasa Indonesia.',
        'Berikan interpretasi tarot untuk 3 kartu (Masa Lalu, Saat Ini, Masa Depan).',
        'Untuk tiap kartu: 1-2 kalimat makna terkait posisinya. Lalu tutup dengan 1 paragraf "Kesimpulan" singkat.',
        'Gaya santai, mistis, dan menyemangati. JANGAN terlalu panjang (maks ~180 kata total).',
        'Format: pakai **tebal** untuk nama posisi+kartu. Jangan pakai heading markdown (#).',
    ].join('\n');

    const user = `Pertanyaan/niat: ${question || '(umum, tidak spesifik)'}\n\nKartu yang tertarik:\n${cardList}`;

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        const res = await fetch(`${cfg.baseURL}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
            body: JSON.stringify({
                model: cfg.model,
                messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                max_tokens: 500,
                temperature: 0.8,
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const answer = data.choices?.[0]?.message?.content?.trim();
        return answer || null;
    } catch (e) {
        log('WARN', `[tarot] AI reading gagal: ${e.message}`);
        return null;
    }
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

    const reading = await generateReading(cards, question);

    const cardSummary = cards.map((c, i) => `**${POSITIONS[i]}:** ${c.nameId}${c.reversed ? ' 🔄' : ''}`).join('  •  ');

    const embed = new EmbedBuilder()
        .setColor('#7b2ff7')
        .setTitle('🔮 Ramalan Tarot')
        .setDescription(
            (question ? `*"${question}"*\n\n` : '') +
            `${cardSummary}\n\n` +
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

module.exports = { handleTarotCommand, drawCards, generateReading, generateTarotCanvas, DECK };
