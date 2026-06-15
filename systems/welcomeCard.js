// systems/welcomeCard.js — Generate welcome/goodbye banner images (background + avatar + text)
// Uses @napi-rs/canvas (prebuilt binary, no system deps). Bundled fonts in assets/fonts/.
// Kythia-inspired polish: large avatar, glow ring, blurred background, vignette,
// rounded corners, accent bar, letter-spaced headline and a subtitle line.
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
const CORNER_RADIUS = 32;

// ---- Small geometry helpers ----
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

// Convert a hex color to an rgba() string with the given alpha.
function hexToRgba(hex, alpha) {
    let h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(255,255,255,${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// Draw image to fully cover the canvas (preserve aspect, center-crop).
// `overscan` slightly enlarges the draw so a blur filter doesn't reveal edges.
function drawCover(ctx, img, w, h, overscan = 1) {
    const ir = img.width / img.height;
    const cr = w / h;
    let dw, dh;
    if (ir > cr) {
        dh = h; dw = h * ir;
    } else {
        dw = w; dh = w / ir;
    }
    dw *= overscan; dh *= overscan;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
}

// Shrink font until text fits maxWidth; truncate with ellipsis as last resort.
// Accounts for optional letter spacing applied between characters.
function fitText(ctx, text, baseFont, basePx, maxWidth, minPx = 20, spacing = 0) {
    const measure = (str) => {
        const base = ctx.measureText(str).width;
        return base + (spacing > 0 ? Math.max(0, [...str].length - 1) * spacing : 0);
    };
    let px = basePx;
    while (px > minPx) {
        ctx.font = `${px}px ${baseFont}`;
        if (measure(text) <= maxWidth) return { px, text };
        px -= 2;
    }
    ctx.font = `${minPx}px ${baseFont}`;
    let t = text;
    while (t.length > 1 && measure(t + '…') > maxWidth) t = t.slice(0, -1);
    return { px: minPx, text: t + '…' };
}

// Draw horizontally-centered text with manual letter spacing.
function drawSpacedText(ctx, text, cx, y, spacing) {
    const chars = [...text];
    if (!spacing) { ctx.fillText(text, cx, y); return; }
    let total = -spacing;
    for (const ch of chars) total += ctx.measureText(ch).width + spacing;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    let x = cx - total / 2;
    for (const ch of chars) {
        ctx.fillText(ch, x, y);
        x += ctx.measureText(ch).width + spacing;
    }
    ctx.textAlign = prevAlign;
}

/**
 * Shared overlay used by the custom-image welcomer (static PNG + animated GIF):
 * an upper-centered circular avatar with a clean BLACK aesthetic ring (+ a thin
 * white hairline for crispness), and the username on a dark rounded "pill" so it
 * stays readable on any background and never clashes with text baked into the
 * source image (the avatar sits in the upper third, text right beneath it).
 *
 * Draws directly onto the provided 2D context. Returns nothing.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} opts
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {string} [opts.avatarURL]
 * @param {string} [opts.username]
 * @param {Object} [opts.avatar]   pre-loaded image (skips the fetch)
 */
async function drawAvatarOverlay(ctx, { width, height, avatarURL, username, avatar = null }) {
    const RING_COLOR = '#0c0c0c';          // aesthetic black border
    const min = Math.min(width, height);
    const size = Math.round(min * 0.36);   // a touch smaller so it breathes
    const radius = size / 2;
    const ringW = Math.max(5, Math.round(size * 0.075));
    const cx = width / 2;
    const name = String(username || '').trim();
    // Sit in the upper third when there's a username, so we clear any "WELCOME"
    // text that's usually baked into the lower part of the source image.
    const cy = name ? Math.round(height * 0.30) : Math.round(height * 0.46);

    // ---- Black ring with a soft drop shadow for separation ----
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.50)';
    ctx.shadowBlur = ringW * 3;
    ctx.shadowOffsetY = Math.round(ringW * 0.5);
    ctx.beginPath();
    ctx.arc(cx, cy, radius + ringW, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = RING_COLOR;
    ctx.fill();
    ctx.restore();

    // ---- Thin white hairline at the ring edge (crisp, aesthetic) ----
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + Math.round(ringW * 0.5), 0, Math.PI * 2);
    ctx.closePath();
    ctx.lineWidth = Math.max(1, Math.round(ringW * 0.22));
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
    ctx.restore();

    // ---- Avatar (circular) ----
    if (avatarURL && !avatar) {
        try { avatar = await loadImage(avatarURL); } catch (e) {
            console.error('[welcomeCard] drawAvatarOverlay gagal load avatar:', e.message);
        }
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (avatar) {
        ctx.drawImage(avatar, cx - radius, cy - radius, size, size);
    } else {
        ctx.fillStyle = '#2b2d31';
        ctx.fillRect(cx - radius, cy - radius, size, size);
    }
    ctx.restore();

    // ---- Username on a dark pill (aesthetic, always legible) ----
    if (name) {
        const baseFontPx = Math.max(18, Math.round(height * 0.092));
        const spacing = Math.max(1, Math.round(baseFontPx * 0.06));
        const fit = fitText(ctx, name, HEAD_FONT, baseFontPx, width * 0.82, 14, spacing);
        ctx.font = `${fit.px}px ${HEAD_FONT}`;

        // Measure rendered width (incl. letter spacing) for the pill.
        const chars = [...fit.text];
        let textW = -spacing;
        for (const ch of chars) textW += ctx.measureText(ch).width + spacing;

        const padX = Math.round(fit.px * 0.55);
        const padY = Math.round(fit.px * 0.30);
        const pillH = fit.px + padY * 2;
        const pillW = textW + padX * 2;
        const pillX = cx - pillW / 2;
        const pillY = cy + radius + ringW + Math.round(fit.px * 0.5);

        ctx.save();
        roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = Math.max(4, Math.round(fit.px * 0.16));
        ctx.shadowOffsetY = 1;
        drawSpacedText(ctx, fit.text, cx, pillY + pillH / 2, spacing);
        ctx.restore();
    }
}

/**
 * Generate a banner PNG buffer.
 * @param {Object} opts
 * @param {string} opts.headline  e.g. "WELCOME" / "GOODBYE"
 * @param {string} opts.username  display text under headline
 * @param {string} [opts.subtitle] small line under the username (optional)
 * @param {string} [opts.avatarURL] PNG avatar URL (optional)
 * @param {string} [opts.bgURL]   background image URL (optional; falls back to gradient)
 * @param {string} [opts.accent]  hex accent color for ring + username (default #FFFFFF)
 * @returns {Promise<Buffer>} PNG buffer
 */
async function generateCard({ headline, username, subtitle, avatarURL, bgURL, accent = '#FFFFFF' }) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ---- Rounded-corner clip for the whole card ----
    roundRectPath(ctx, 0, 0, W, H, CORNER_RADIUS);
    ctx.clip();

    // ---- Background (blurred) ----
    let drewBg = false;
    if (bgURL && /^https?:\/\//i.test(bgURL)) {
        try {
            const bg = await loadImage(bgURL);
            ctx.save();
            try { ctx.filter = 'blur(9px)'; } catch (_) { /* filter unsupported */ }
            drawCover(ctx, bg, W, H, 1.12); // overscan hides blurred edges
            ctx.restore();
            drewBg = true;
        } catch (e) {
            // ignore -> fallback gradient
        }
    }
    if (!drewBg) {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#252a40');
        g.addColorStop(0.55, '#1a1c2b');
        g.addColorStop(1, '#0e0f18');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    // ---- Dark overlay for text readability ----
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(0, 0, W, H);

    // ---- Vignette (darken edges, focus center) ----
    const vg = ctx.createRadialGradient(W / 2, H * 0.46, H * 0.18, W / 2, H * 0.5, W * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // ---- Subtle inner border for the rounded card ----
    ctx.save();
    roundRectPath(ctx, 4, 4, W - 8, H - 8, CORNER_RADIUS - 4);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.stroke();
    ctx.restore();

    // ---- Avatar (large, centered) with glow ring ----
    const size = 210;            // bigger avatar (Kythia style)
    const radius = size / 2;
    const cx = W / 2;
    const cy = 155;            // vertically centered (upper portion, text below)

    // Glow halo behind the avatar
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 40;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 7, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();

    // Accent ring base (solid, under the avatar)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 7, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.restore();

    // Thin dark gap between ring and avatar for definition
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.restore();

    let avatar = null;
    if (avatarURL) {
        try { avatar = await loadImage(avatarURL); } catch (e) { /* skip avatar */ }
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (avatar) {
        ctx.drawImage(avatar, cx - radius, cy - radius, size, size);
    } else {
        ctx.fillStyle = '#2b2d31';
        ctx.fillRect(cx - radius, cy - radius, size, size);
    }
    ctx.restore();

    // ---- Text block ----
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;

    // Headline (letter-spaced) — skip if empty
    const head = String(headline || '').toUpperCase();
    let headY = 312;
    let barY = headY + 16; // default fallback position
    if (head) {
        const HEAD_SPACING = 8;
        const headFit = fitText(ctx, head, HEAD_FONT, 72, W - 140, 28, HEAD_SPACING);
        ctx.font = `${headFit.px}px ${HEAD_FONT}`;
        ctx.fillStyle = '#FFFFFF';
        drawSpacedText(ctx, headFit.text, cx, headY, HEAD_SPACING);

        // Accent bar under the headline
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        const barW = 92;
        const barH = 6;
        barY = headY + 16;
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 14;
        roundRectPath(ctx, cx - barW / 2, barY, barW, barH, barH / 2);
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.restore();
    } else {
        // No headline — move username up
        headY = 280;
        barY = headY;
    }

    // Username
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    const name = String(username || '');
    const nameFit = fitText(ctx, name, SUB_FONT, 38, W - 160, 18);
    ctx.font = `${nameFit.px}px ${SUB_FONT}`;
    ctx.fillStyle = accent;
    ctx.fillText(nameFit.text, cx, barY + 56);

    // Subtitle line (optional)
    const sub = String(subtitle || '').trim();
    if (sub) {
        const subFit = fitText(ctx, sub, SUB_FONT, 24, W - 200, 14);
        ctx.font = `${subFit.px}px ${SUB_FONT}`;
        ctx.fillStyle = 'rgba(235,238,245,0.82)';
        ctx.fillText(subFit.text, cx, barY + 92);
    }

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    return canvas.toBuffer('image/png');
}

/**
 * Generate a minimal "avatar banner" PNG buffer: the provided image as a
 * full-cover background, a circular avatar centered on top, and the username
 * underneath. Used by the custom-image welcomer so the member avatar always
 * shows in the middle of the chosen background.
 *
 * Intentionally simpler than generateCard() — no headline, no blur, no heavy
 * effects — so it is robust on the server and unlikely to throw.
 *
 * @param {Object} opts
 * @param {string} [opts.bgURL]     background image URL (falls back to gradient)
 * @param {string} [opts.avatarURL] PNG avatar URL (optional)
 * @param {string} [opts.username]  text drawn under the avatar (optional)
 * @param {string} [opts.accent]    hex accent for the ring + username (default #FFFFFF)
 * @returns {Promise<Buffer>} PNG buffer
 */
async function generateAvatarBanner({ bgURL, avatarURL, username, accent = '#FFFFFF' }) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ---- Rounded-corner clip for the whole card ----
    roundRectPath(ctx, 0, 0, W, H, CORNER_RADIUS);
    ctx.clip();

    // ---- Background (full cover, no blur for reliability) ----
    let drewBg = false;
    if (bgURL && /^https?:\/\//i.test(bgURL)) {
        try {
            const bg = await loadImage(bgURL);
            drawCover(ctx, bg, W, H, 1);
            drewBg = true;
        } catch (e) {
            console.error('[welcomeCard] generateAvatarBanner gagal load background:', e.message);
        }
    }
    if (!drewBg) {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#252a40');
        g.addColorStop(0.55, '#1a1c2b');
        g.addColorStop(1, '#0e0f18');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    // ---- Soft dark overlay so the avatar + text stay readable ----
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(0, 0, W, H);

    // ---- Avatar + username overlay (black aesthetic ring, upper-centered) ----
    await drawAvatarOverlay(ctx, { width: W, height: H, avatarURL, username });

    return canvas.toBuffer('image/png');
}

/**
 * Generate an ANIMATED welcome GIF: keeps the source GIF moving and layers a
 * static circular avatar + username on top of every frame.
 *
 * Uses `sharp` (libvips) to decode/recompose the GIF reliably, and the existing
 * canvas stack to render the overlay once. Returns null (so the caller can fall
 * back to a static banner) when:
 *   - `sharp` is not installed,
 *   - the buffer isn't a usable animated image, or
 *   - the encoded result exceeds `maxBytes` (Discord upload limit safety).
 *
 * @param {Object} opts
 * @param {Buffer} opts.gifBuffer  raw GIF bytes
 * @param {string} [opts.avatarURL] PNG avatar URL (optional)
 * @param {string} [opts.username]  text drawn under the avatar (optional)
 * @param {string} [opts.accent]    hex accent for the ring + username (default #FFFFFF)
 * @param {number} [opts.maxBytes]  max output size in bytes (default ~8MB)
 * @returns {Promise<Buffer|null>} animated GIF buffer, or null to signal fallback
 */
async function generateAvatarBannerGif({ gifBuffer, avatarURL, username, accent = '#FFFFFF', maxBytes = 8 * 1024 * 1024 }) {
    let sharp;
    try {
        sharp = require('sharp');
    } catch (e) {
        console.error('[welcomeCard] modul "sharp" belum terpasang — jalankan `npm install sharp` untuk welcomer GIF animasi. Sementara pakai banner statis.');
        return null;
    }
    if (!gifBuffer || !gifBuffer.length) return null;

    try {
        // Inspect the animated image: dimensions + number of frames (pages).
        const meta = await sharp(gifBuffer, { animated: true }).metadata();
        const width = meta.width;
        const pageHeight = meta.pageHeight || meta.height;
        const pages = meta.pages || 1;
        if (!width || !pageHeight) return null;

        // ---- Render the static overlay once (transparent bg) ----
        const canvas = createCanvas(width, pageHeight);
        const ctx = canvas.getContext('2d');
        await drawAvatarOverlay(ctx, { width, height: pageHeight, avatarURL, username });
        const overlayPng = canvas.toBuffer('image/png');

        // ---- Layer the overlay onto every frame of the filmstrip ----
        // sharp lays an animated image out as a vertical strip of `pages` frames,
        // each `pageHeight` tall. Compositing the overlay at each page offset
        // stamps it on every frame while preserving the original animation/timing.
        const composites = [];
        for (let i = 0; i < pages; i++) {
            composites.push({ input: overlayPng, top: i * pageHeight, left: 0 });
        }

        const out = await sharp(gifBuffer, { animated: true })
            .composite(composites)
            .gif()
            .toBuffer();

        if (maxBytes && out.length > maxBytes) {
            console.error(`[welcomeCard] GIF welcomer ${(out.length / 1048576).toFixed(2)}MB melebihi batas ${(maxBytes / 1048576).toFixed(0)}MB — pakai banner statis.`);
            return null;
        }
        return out;
    } catch (e) {
        // sharp present but failed (corrupt binary, bad GIF, etc.) — signal the
        // caller to fall back to the static banner (which still shows the avatar).
        console.error('[welcomeCard] generateAvatarBannerGif gagal memproses GIF, pakai banner statis:', e.message);
        return null;
    }
}

module.exports = { generateCard, generateAvatarBanner, generateAvatarBannerGif };
