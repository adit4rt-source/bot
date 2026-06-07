// systems/welcomeCard.js — Generate welcome/goodbye banner images (background + avatar + text)
// Uses @napi-rs/canvas (prebuilt binary, no system deps). Bundled fonts in assets/fonts/.
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// ---- Register bundled fonts once (so text renders even without system fonts) ----
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
let FONTS_OK = false;
try {
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-Bold.ttf'), 'PoppinsBold');
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-SemiBold.ttf'), 'PoppinsSemiBold');
    FONTS_OK = true;
} catch (e) {
    console.error('[welcomeCard] Gagal register font, pakai font sistem:', e.message);
}
const HEAD_FONT = FONTS_OK ? 'PoppinsBold' : 'sans-serif';
const SUB_FONT = FONTS_OK ? 'PoppinsSemiBold' : 'sans-serif';

const W = 1024;
const H = 450;

// Draw image to fully cover the canvas (preserve aspect, center-crop).
function drawCover(ctx, img, w, h) {
    const ir = img.width / img.height;
    const cr = w / h;
    let dw, dh, dx, dy;
    if (ir > cr) {
        dh = h; dw = h * ir; dx = (w - dw) / 2; dy = 0;
    } else {
        dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
}

// Shrink font until text fits maxWidth; truncate with ellipsis as last resort.
function fitText(ctx, text, baseFont, basePx, maxWidth, minPx = 20) {
    let px = basePx;
    while (px > minPx) {
        ctx.font = `${px}px ${baseFont}`;
        if (ctx.measureText(text).width <= maxWidth) return px;
        px -= 2;
    }
    ctx.font = `${minPx}px ${baseFont}`;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
    return { px: minPx, text: t + '…' };
}

/**
 * Generate a banner PNG buffer.
 * @param {Object} opts
 * @param {string} opts.headline  e.g. "WELCOME" / "GOODBYE"
 * @param {string} opts.username  display text under headline
 * @param {string} [opts.avatarURL] PNG avatar URL (optional)
 * @param {string} [opts.bgURL]   background image URL (optional; falls back to gradient)
 * @param {string} [opts.accent]  hex accent color for ring + username (default #FFFFFF)
 * @returns {Promise<Buffer>} PNG buffer
 */
async function generateCard({ headline, username, avatarURL, bgURL, accent = '#FFFFFF' }) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ---- Background ----
    let drewBg = false;
    if (bgURL && /^https?:\/\//i.test(bgURL)) {
        try {
            const bg = await loadImage(bgURL);
            drawCover(ctx, bg, W, H);
            drewBg = true;
        } catch (e) {
            // ignore -> fallback gradient
        }
    }
    if (!drewBg) {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#1e2030');
        g.addColorStop(1, '#0f1018');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    // ---- Dark overlay for text readability ----
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);

    // ---- Avatar (circle) with accent ring ----
    const size = 168;
    const cx = W / 2;
    const cy = 145;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 + 6, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();

    let avatar = null;
    if (avatarURL) {
        try { avatar = await loadImage(avatarURL); } catch (e) { /* skip avatar */ }
    }
    if (avatar) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, cx - size / 2, cy - size / 2, size, size);
        ctx.restore();
    } else {
        // placeholder circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = '#2b2d31';
        ctx.fill();
        ctx.restore();
    }

    // ---- Text ----
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;

    // Headline
    const head = String(headline || '').toUpperCase();
    const headFit = fitText(ctx, head, HEAD_FONT, 78, W - 100);
    ctx.font = `${typeof headFit === 'object' ? headFit.px : headFit}px ${HEAD_FONT}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(typeof headFit === 'object' ? headFit.text : head, cx, 318);

    // Username
    const name = String(username || '');
    const nameFit = fitText(ctx, name, SUB_FONT, 40, W - 120);
    ctx.font = `${typeof nameFit === 'object' ? nameFit.px : nameFit}px ${SUB_FONT}`;
    ctx.fillStyle = accent;
    ctx.fillText(typeof nameFit === 'object' ? nameFit.text : name, cx, 372);

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    return canvas.toBuffer('image/png');
}

module.exports = { generateCard };
