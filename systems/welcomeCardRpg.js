// systems/welcomeCardRpg.js — RPG "adventurer profile card" style welcome/goodbye banner.
// Hexagonal gold-framed portrait, nameplate, HP/MP/EXP stat bars, level badge,
// and a fantasy panel frame. Uses @napi-rs/canvas with bundled Poppins fonts.
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { getCachedImage } = require('./welcomeCardCache');

// ---- Register bundled fonts once ----
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
let FONTS_OK = false;
try {
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-Bold.ttf'), 'PoppinsBold');
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-SemiBold.ttf'), 'PoppinsSemiBold');
    FONTS_OK = true;
} catch (e) {
    console.error('[welcomeCardRpg] Gagal register font, pakai font sistem:', e.message);
}
const HEAD = FONTS_OK ? 'PoppinsBold' : 'sans-serif';
const SUB = FONTS_OK ? 'PoppinsSemiBold' : 'sans-serif';

const W = 1024;
const H = 450;

// Palette
const GOLD = '#E9C97A';
const GOLD_DARK = '#9c7a35';
const HP_A = '#7a1f2b', HP_B = '#e8556b';
const MP_A = '#1f4d7a', MP_B = '#4aa3e0';

const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

// ---- geometry helpers ----
function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

// Pointy-top hexagon centred at (cx,cy) with circumradius r.
function hexPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (-90 + i * 60) * Math.PI / 180;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

function diamond(ctx, cx, cy, s, fill) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx + s, cy);
    ctx.lineTo(cx, cy + s);
    ctx.lineTo(cx - s, cy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
}

function drawCover(ctx, img, w, h, overscan = 1) {
    const ir = img.width / img.height, cr = w / h;
    let dw, dh;
    if (ir > cr) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
    dw *= overscan; dh *= overscan;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function fitText(ctx, text, font, basePx, maxWidth, minPx = 16) {
    let px = basePx;
    while (px > minPx) {
        ctx.font = `${px}px ${font}`;
        if (ctx.measureText(text).width <= maxWidth) return px;
        px -= 2;
    }
    ctx.font = `${minPx}px ${font}`;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
    return { px: minPx, text: t + '…' };
}

function drawSpaced(ctx, text, cx, y, spacing) {
    const chars = [...text];
    let total = -spacing;
    for (const ch of chars) total += ctx.measureText(ch).width + spacing;
    let x = cx - total / 2;
    const prev = ctx.textAlign;
    ctx.textAlign = 'left';
    for (const ch of chars) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + spacing; }
    ctx.textAlign = prev;
    return total;
}

function statBar(ctx, x, y, w, h, pct, colA, colB, label) {
    ctx.font = `bold 18px ${HEAD}`;
    ctx.fillStyle = GOLD;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + h / 2);

    const bx = x + 58, bw = w - 58;
    roundRectPath(ctx, bx, y, bw, h, h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();

    const fw = Math.max(h, bw * clamp(pct));
    ctx.save();
    roundRectPath(ctx, bx, y, fw, h, h / 2);
    ctx.clip();
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, colA);
    g.addColorStop(1, colB);
    ctx.fillStyle = g;
    ctx.fillRect(bx, y, bw, h);
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fillRect(bx, y, bw, h * 0.42);
    ctx.restore();

    roundRectPath(ctx, bx, y, bw, h, h / 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = GOLD_DARK;
    ctx.stroke();

    ctx.font = `bold 13px ${SUB}`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    ctx.fillText(`${Math.round(clamp(pct) * 100)}%`, bx + bw - 12, y + h / 2 + 1);
    ctx.shadowBlur = 0;
}

/**
 * Generate an RPG profile-card banner PNG.
 * @param {Object} o
 * @param {string} o.headline   ribbon title (e.g. "NEW ADVENTURER")
 * @param {string} o.username
 * @param {string} [o.className] class/role line (e.g. "Petualang Baru")
 * @param {string} [o.subtitle]  bottom line (party / server)
 * @param {number|string} [o.level] level badge value
 * @param {number} [o.hpPct] 0..1
 * @param {number} [o.mpPct] 0..1
 * @param {number} [o.expPct] 0..1
 * @param {string} [o.avatarURL]
 * @param {string} [o.bgURL]
 * @param {string} [o.accent] hex accent for EXP bar + title glow
 * @returns {Promise<Buffer>}
 */
async function generateRpgCard(o) {
    const {
        headline = 'NEW ADVENTURER', username = 'Player', className = 'Petualang Baru',
        subtitle = '', level = 1, hpPct = 1, mpPct = 1, expPct = 0.08,
        avatarURL, bgURL, accent = '#5865F2',
    } = o || {};

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // rounded clip for whole card
    roundRectPath(ctx, 0, 0, W, H, 28);
    ctx.clip();

    // background
    let drewBg = false;
    if (bgURL && /^https?:\/\//i.test(bgURL)) {
        try {
            const cachedPath = await getCachedImage(bgURL);
            const bg = await loadImage(cachedPath);
            ctx.save();
            try { ctx.filter = 'blur(8px)'; } catch (_) {}
            drawCover(ctx, bg, W, H, 1.12);
            ctx.restore();
            drewBg = true;
        } catch (_) {}
    }
    if (!drewBg) {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#2b2342');
        g.addColorStop(0.55, '#1a152b');
        g.addColorStop(1, '#100c1a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
    // dark overlay + vignette for readability
    ctx.fillStyle = 'rgba(8,6,14,0.55)';
    ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // ---- panel frame (double gold border) ----
    const px = 22, py = 22, pw = W - 44, ph = H - 44;
    roundRectPath(ctx, px, py, pw, ph, 20);
    ctx.lineWidth = 3;
    ctx.strokeStyle = GOLD;
    ctx.shadowColor = 'rgba(233,201,122,0.4)';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    roundRectPath(ctx, px + 6, py + 6, pw - 12, ph - 12, 15);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = GOLD_DARK;
    ctx.stroke();

    // corner brackets
    const cb = 26;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    const corner = (cx, cy, dx, dy) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy + dy * cb);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + dx * cb, cy);
        ctx.stroke();
    };
    corner(px + 14, py + 14, 1, 1);
    corner(px + pw - 14, py + 14, -1, 1);
    corner(px + 14, py + ph - 14, 1, -1);
    corner(px + pw - 14, py + ph - 14, -1, -1);

    // ---- title ribbon ----
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    const head = String(headline || '').toUpperCase();
    const headPx = fitText(ctx, head, HEAD, 40, pw - 220, 22);
    ctx.font = `${typeof headPx === 'number' ? headPx : headPx.px}px ${HEAD}`;
    ctx.fillStyle = GOLD;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 16;
    const titleY = 70;
    const tw = drawSpaced(ctx, typeof headPx === 'number' ? head : headPx.text, W / 2, titleY, 6);
    ctx.shadowBlur = 0;
    diamond(ctx, W / 2 - tw / 2 - 22, titleY - 9, 6, GOLD);
    diamond(ctx, W / 2 + tw / 2 + 22, titleY - 9, 6, GOLD);

    // ---- hexagon portrait (left) ----
    const hx = 200, hy = 252, hr = 112;
    // glow
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 32;
    hexPath(ctx, hx, hy, hr + 2);
    ctx.fillStyle = GOLD;
    ctx.fill();
    ctx.restore();
    // gold ring
    hexPath(ctx, hx, hy, hr);
    ctx.fillStyle = GOLD;
    ctx.fill();
    hexPath(ctx, hx, hy, hr - 7);
    ctx.fillStyle = '#0e0b16';
    ctx.fill();
    // avatar clipped
    let avatar = null;
    if (avatarURL) { try { avatar = await loadImage(avatarURL); } catch (_) {} }
    ctx.save();
    hexPath(ctx, hx, hy, hr - 10);
    ctx.clip();
    if (avatar) {
        const s = (hr - 10) * 2;
        ctx.drawImage(avatar, hx - (hr - 10), hy - (hr - 10), s, s);
    } else {
        ctx.fillStyle = '#241d33';
        ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2);
        ctx.fillStyle = GOLD;
        ctx.font = `bold 90px ${HEAD}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', hx, hy + 4);
    }
    ctx.restore();
    // inner ring outline
    hexPath(ctx, hx, hy, hr - 8);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke();

    // level badge (bottom of hex)
    const bw = 92, bh = 34, bxp = hx - bw / 2, byp = hy + hr - 20;
    roundRectPath(ctx, bxp, byp, bw, bh, bh / 2);
    ctx.fillStyle = '#0e0b16';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = GOLD;
    ctx.stroke();
    ctx.font = `bold 17px ${HEAD}`;
    ctx.fillStyle = GOLD;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`LV ${level}`, hx, byp + bh / 2 + 1);

    // ---- right content ----
    const rx = 360, rw = (px + pw - 24) - rx;

    // nameplate
    const npY = 120, npH = 56;
    roundRectPath(ctx, rx, npY, rw, npH, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = GOLD_DARK;
    ctx.stroke();
    // small gold notch on left of nameplate
    diamond(ctx, rx + 16, npY + npH / 2, 7, GOLD);

    const name = String(username || '');
    const nameFit = fitText(ctx, name, HEAD, 32, rw - 60, 16);
    ctx.font = `${typeof nameFit === 'number' ? nameFit : nameFit.px}px ${HEAD}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    ctx.fillText(typeof nameFit === 'number' ? name : nameFit.text, rx + 34, npY + npH / 2 + 1);
    ctx.shadowBlur = 0;

    // class line
    const clsY = npY + npH + 26;
    ctx.font = `18px ${SUB}`;
    ctx.fillStyle = accent;
    ctx.textAlign = 'left';
    const cls = String(className || '');
    ctx.fillText(cls, rx + 18, clsY);
    const clsW = ctx.measureText(cls).width;
    diamond(ctx, rx + 6, clsY - 6, 5, GOLD);
    diamond(ctx, rx + 18 + clsW + 12, clsY - 6, 5, GOLD);

    // stat bars
    const barX = rx, barW = rw, barH = 22;
    let by = clsY + 22;
    statBar(ctx, barX, by, barW, barH, hpPct, HP_A, HP_B, 'HP'); by += 38;
    statBar(ctx, barX, by, barW, barH, mpPct, MP_A, MP_B, 'MP'); by += 38;
    statBar(ctx, barX, by, barW, barH, expPct, GOLD_DARK, accent, 'EXP');

    // bottom subtitle
    const sub = String(subtitle || '').trim();
    if (sub) {
        ctx.font = `15px ${SUB}`;
        ctx.fillStyle = 'rgba(233,201,122,0.85)';
        ctx.textAlign = 'center';
        const subFit = fitText(ctx, sub, SUB, 16, pw - 80, 11);
        ctx.font = `${typeof subFit === 'number' ? subFit : subFit.px}px ${SUB}`;
        ctx.fillText(typeof subFit === 'number' ? sub : subFit.text, W / 2, py + ph - 18);
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateRpgCard };
