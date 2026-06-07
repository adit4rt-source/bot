// systems/welcomeCardGlitch.js — "webcore / glitch directory" style welcome card.
// Dark scanline background, rounded panel, small thumbnail + text block on the left,
// large glitch-overlaid portrait on the right, pixel-style button, divider, italic
// tagline, and a decorative hanging telephone. Uses @napi-rs/canvas + bundled fonts.
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
let FONTS_OK = false;
try {
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-Bold.ttf'), 'PoppinsBold');
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-SemiBold.ttf'), 'PoppinsSemiBold');
    FONTS_OK = true;
} catch (e) {
    console.error('[welcomeCardGlitch] Gagal register font:', e.message);
}
const HEAD = FONTS_OK ? 'PoppinsBold' : 'sans-serif';
const SUB = FONTS_OK ? 'PoppinsSemiBold' : 'sans-serif';

const SCALE = 2;   // render resolution multiplier (crisper + appears larger in Discord)
const W = 1200;    // logical width (wider than before)
const H = 470;     // logical height (a bit taller)

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

function drawCover(ctx, img, dx, dy, dw, dh) {
    const ir = img.width / img.height, cr = dw / dh;
    let w, h;
    if (ir > cr) { h = dh; w = dh * ir; } else { w = dw; h = dw / ir; }
    ctx.drawImage(img, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
}

// horizontal scanlines over a region
function scanlines(ctx, x, y, w, h, gap, alpha) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let yy = y; yy < y + h; yy += gap) ctx.fillRect(x, yy, w, 1);
    ctx.restore();
}

function fitText(ctx, text, font, basePx, maxWidth, minPx = 12) {
    let px = basePx;
    while (px > minPx) {
        ctx.font = `${px}px ${font}`;
        if (ctx.measureText(text).width <= maxWidth) return { px, text };
        px -= 1;
    }
    ctx.font = `${minPx}px ${font}`;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
    return { px: minPx, text: t + '…' };
}

// faux-italic text via horizontal shear
function italicText(ctx, text, x, y, font, color) {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.transform(1, 0, -0.22, 1, 0, 0);
    ctx.fillText(text, x + 0.22 * y, y);
    ctx.restore();
}

// word-wrap into max width, return lines
function wrapLines(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
        else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
}

// decorative hanging telephone handset with coiled cord on the left edge
function drawPhone(ctx, x, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    // coiled cord
    ctx.beginPath();
    let cy = H * 0.5;
    for (let i = 0; i < 10; i++) {
        ctx.ellipse(x, cy, 9, 6, 0, 0, Math.PI * 2);
        cy += 11;
    }
    ctx.stroke();
    // handset (rounded bar + two earpieces)
    const hx = x, hy = cy + 26;
    ctx.translate(hx, hy);
    ctx.rotate(0.35);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-34, 0);
    ctx.lineTo(34, 0);
    ctx.stroke();
    for (const ex of [-40, 40]) {
        ctx.beginPath();
        ctx.ellipse(ex, 0, 12, 16, 0, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }
    ctx.restore();
}

/**
 * @param {Object} o
 * @param {string} [o.label]    top-left header label (e.g. ". co / welcome")
 * @param {string} o.username
 * @param {string} [o.line2]    e.g. "member #1,204"
 * @param {string} [o.line3]    e.g. "joined just now"
 * @param {string} [o.acLabel]  e.g. "AC"
 * @param {string} [o.acText]   e.g. "komunitas santai"
 * @param {string} [o.caution]  small wrapped paragraph
 * @param {string} [o.tagline]  italic line
 * @param {string} [o.button]   pixel button text (e.g. "GO TO MAIN")
 * @param {string} [o.avatarURL]
 * @param {string} [o.bgURL]
 * @param {string} [o.accent]
 */
async function generateGlitchCard(o) {
    const {
        label = '. co / welcome', username = 'Player', line2 = '', line3 = '',
        acLabel = 'AC', acText = '', caution = 'Please read the rules and be kind to everyone.',
        tagline = 'take my whole life too', button = 'GO TO MAIN',
        avatarURL, bgURL, accent = '#c9b8a8',
    } = o || {};

    const canvas = createCanvas(W * SCALE, H * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE); // draw in logical coords, output at higher resolution

    // ---- background ----
    ctx.fillStyle = '#0b0c0f';
    ctx.fillRect(0, 0, W, H);
    if (bgURL && /^https?:\/\//i.test(bgURL)) {
        try {
            const bg = await loadImage(bgURL);
            ctx.save();
            try { ctx.filter = 'blur(10px)'; } catch (_) {}
            drawCover(ctx, bg, -20, -20, W + 40, H + 40);
            ctx.restore();
            ctx.fillStyle = 'rgba(8,9,12,0.7)';
            ctx.fillRect(0, 0, W, H);
        } catch (_) {}
    }
    scanlines(ctx, 0, 0, W, H, 3, 0.35);

    // ---- card panel ----
    const px = 26, py = 26, pw = W - 52, ph = H - 52;
    roundRectPath(ctx, px, py, pw, ph, 18);
    ctx.fillStyle = 'rgba(24,25,30,0.66)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.stroke();

    // ---- right portrait ----
    const portX = 600, portY = py + 8, portW = pw + px - portX - 16, portH = ph - 16;
    ctx.save();
    roundRectPath(ctx, portX, portY, portW, portH, 12);
    ctx.clip();
    let avatar = null;
    if (avatarURL) { try { avatar = await loadImage(avatarURL); } catch (_) {} }
    if (avatar) {
        drawCover(ctx, avatar, portX, portY, portW, portH);
        // darken + accent duotone
        ctx.fillStyle = 'rgba(10,10,14,0.45)';
        ctx.fillRect(portX, portY, portW, portH);
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.22;
        ctx.fillRect(portX, portY, portW, portH);
        ctx.restore();
        // glitch slices
        for (const gy of [portY + portH * 0.25, portY + portH * 0.55, portY + portH * 0.78]) {
            const sh = 10 + Math.random() * 14;
            const off = (Math.random() * 18 - 9);
            // source coords are in physical pixels (canvas is scaled), dest in logical
            ctx.drawImage(canvas, portX * SCALE, gy * SCALE, portW * SCALE, sh * SCALE, portX + off, gy, portW, sh);
        }
    } else {
        const g = ctx.createLinearGradient(portX, portY, portX, portY + portH);
        g.addColorStop(0, '#23242b'); g.addColorStop(1, '#121317');
        ctx.fillStyle = g; ctx.fillRect(portX, portY, portW, portH);
    }
    scanlines(ctx, portX, portY, portW, portH, 3, 0.28);
    // left fade so portrait melts into the panel
    const fade = ctx.createLinearGradient(portX, 0, portX + 90, 0);
    fade.addColorStop(0, 'rgba(24,25,30,0.95)');
    fade.addColorStop(1, 'rgba(24,25,30,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(portX, portY, 90, portH);
    ctx.restore();

    // pixel-style button (bottom-right over the portrait)
    const btn = String(button || '').toUpperCase();
    ctx.font = `20px ${HEAD}`;
    const btnTextW = ctx.measureText(btn).width + (btn.length - 1) * 6;
    const bw = Math.min(btnTextW + 48, portW - 20), bh = 46;
    const bx = portX + portW - bw - 8, by = portY + portH - bh - 8;
    roundRectPath(ctx, bx, by, bw, bh, 6);
    ctx.fillStyle = 'rgba(12,12,16,0.82)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
    ctx.fillStyle = '#ede7df';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let cxp = bx + (bw - btnTextW) / 2;
    for (const ch of btn) { ctx.fillText(ch, cxp, by + bh / 2 + 1); cxp += ctx.measureText(ch).width + 6; }

    // ---- left column ----
    const lx = 60, lRight = portX - 36;
    ctx.textBaseline = 'alphabetic';

    // header label + rule
    ctx.font = `22px ${HEAD}`;
    ctx.fillStyle = '#e7e2d8';
    ctx.textAlign = 'left';
    ctx.fillText(label, lx, 78);
    const lblW = ctx.measureText(label).width;
    ctx.strokeStyle = 'rgba(231,226,216,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx + lblW + 16, 72);
    ctx.lineTo(lRight, 72);
    ctx.stroke();

    // thumbnail
    const tSize = 104, tx = lx, ty = 96;
    if (avatar) {
        ctx.save();
        roundRectPath(ctx, tx, ty, tSize, tSize, 6);
        ctx.clip();
        drawCover(ctx, avatar, tx, ty, tSize, tSize);
        ctx.fillStyle = 'rgba(10,10,14,0.25)';
        ctx.fillRect(tx, ty, tSize, tSize);
        scanlines(ctx, tx, ty, tSize, tSize, 3, 0.28);
        ctx.restore();
    } else {
        roundRectPath(ctx, tx, ty, tSize, tSize, 6);
        ctx.fillStyle = '#1d1e24';
        ctx.fill();
    }
    roundRectPath(ctx, tx, ty, tSize, tSize, 6);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.stroke();

    // text block beside thumbnail
    const bxText = tx + tSize + 22;
    const nameFit = fitText(ctx, username, HEAD, 28, lRight - bxText, 16);
    ctx.font = `${nameFit.px}px ${HEAD}`;
    ctx.fillStyle = '#f3efe7';
    ctx.fillText(nameFit.text, bxText, ty + 30);
    ctx.font = `16px ${SUB}`;
    ctx.fillStyle = 'rgba(201,184,168,0.9)';
    if (line2) ctx.fillText(line2, bxText, ty + 58);
    ctx.fillStyle = 'rgba(180,176,168,0.7)';
    if (line3) ctx.fillText(line3, bxText, ty + 82);

    // divider
    const divY = ty + tSize + 26;
    ctx.strokeStyle = 'rgba(231,226,216,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx, divY);
    ctx.lineTo(lRight, divY);
    ctx.stroke();

    // AC line
    let yy = divY + 30;
    ctx.textAlign = 'left';
    ctx.font = `18px ${HEAD}`;
    ctx.fillStyle = '#e7e2d8';
    ctx.fillText(`${acLabel}:`, lx, yy);
    const acLblW = ctx.measureText(`${acLabel}:`).width;
    if (acText) {
        ctx.font = `17px ${SUB}`;
        ctx.fillStyle = accent;
        ctx.fillText(acText, lx + acLblW + 10, yy);
    }

    // caution (wrapped)
    yy += 26;
    ctx.font = `15px ${SUB}`;
    ctx.fillStyle = 'rgba(214,210,202,0.85)';
    const lines = wrapLines(ctx, caution, lRight - lx).slice(0, 2);
    for (const ln of lines) { ctx.fillText(ln, lx, yy); yy += 21; }

    // italic tagline near bottom
    italicText(ctx, tagline, lx, ph + py - 28, `19px ${SUB}`, 'rgba(201,184,168,0.92)');

    // decorative phone on the far left edge
    drawPhone(ctx, 18, 'rgba(120,120,128,0.9)');

    // subtle outer scanline pass for cohesion
    scanlines(ctx, px, py, pw, ph, 4, 0.06);

    return canvas.toBuffer('image/png');
}

module.exports = { generateGlitchCard };
