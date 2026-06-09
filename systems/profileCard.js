// systems/profileCard.js — Generate a profile card PNG (avatar + level + XP bar + stats).
// Uses @napi-rs/canvas with the same bundled Poppins fonts as welcomeCard.
// NOTE: Poppins has no emoji glyphs, so all on-canvas text is sanitized (emoji stripped).
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
let FONTS_OK = false;
try {
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-Bold.ttf'), 'PoppinsBold');
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-SemiBold.ttf'), 'PoppinsSemiBold');
    FONTS_OK = true;
} catch (e) {
    console.error('[profileCard] Gagal register font, pakai font sistem:', e.message);
}
const BOLD = FONTS_OK ? 'PoppinsBold' : 'sans-serif';
const SEMI = FONTS_OK ? 'PoppinsSemiBold' : 'sans-serif';

const W = 1024, H = 420, CORNER = 34;

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

// Remove emoji / symbol characters that Poppins cannot render.
function clean(str) {
    return String(str || '')
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{20E3}\u{2122}\u{2139}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Compact number formatter: 1234 -> "1.2K", 3_400_000 -> "3.4M".
function compact(n) {
    n = Number(n) || 0;
    if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.floor(n));
}

function fitText(ctx, text, font, basePx, maxWidth, minPx = 16) {
    let px = basePx;
    while (px > minPx) {
        ctx.font = `${px}px ${font}`;
        if (ctx.measureText(text).width <= maxWidth) return px;
        px -= 2;
    }
    ctx.font = `${minPx}px ${font}`;
    return minPx;
}

// Parse "#rrggbb" -> {r,g,b}; falls back to blurple.
function hexToRgb(hex) {
    const m = String(hex || '').replace('#', '').match(/^([0-9a-fA-F]{6})$/);
    if (!m) return { r: 88, g: 101, b: 242 };
    const int = parseInt(m[1], 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}
function rgba({ r, g, b }, a) { return `rgba(${r},${g},${b},${a})`; }
// Mix a color toward black by `f` (0..1).
function darken({ r, g, b }, f) {
    return { r: Math.round(r * (1 - f)), g: Math.round(g * (1 - f)), b: Math.round(b * (1 - f)) };
}

/**
 * Generate a profile card PNG buffer.
 * @param {Object} o
 * @param {string} o.username
 * @param {string} [o.avatarURL]
 * @param {number} o.level
 * @param {number} o.xp
 * @param {number} o.xpNeeded
 * @param {number} o.balance
 * @param {string} [o.rankName]
 * @param {number} [o.badges]
 * @param {number} [o.streak]
 * @param {number} [o.rankPosition]
 * @param {string} [o.accent] hex accent color
 * @param {string} [o.footerTag] small watermark line (e.g. server name) for shareable flex
 * @returns {Promise<Buffer>}
 */
async function generateProfileCard(o = {}) {
    const accentHex = /^#?[0-9a-fA-F]{6}$/.test(String(o.accent || '').replace('#', '')) ? (o.accent[0] === '#' ? o.accent : '#' + o.accent) : '#5865F2';
    const acc = hexToRgb(accentHex);
    const accDark = darken(acc, 0.45);
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Rounded clip for the whole card
    roundRectPath(ctx, 0, 0, W, H, CORNER);
    ctx.clip();

    // ---- Background: deep gradient tinted toward the accent ----
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, `rgb(${Math.round(20 + acc.r * 0.10)},${Math.round(22 + acc.g * 0.10)},${Math.round(38 + acc.b * 0.12)})`);
    g.addColorStop(0.55, '#16182a');
    g.addColorStop(1, '#0c0d16');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Subtle diagonal stripe texture
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let x = -H; x < W; x += 26) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + H, H);
        ctx.stroke();
    }
    ctx.restore();

    // Accent glow blobs
    const blob = ctx.createRadialGradient(170, 210, 20, 170, 210, 420);
    blob.addColorStop(0, rgba(acc, 0.38));
    blob.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = blob;
    ctx.fillRect(0, 0, W, H);
    const blob2 = ctx.createRadialGradient(W - 60, H, 10, W - 60, H, 360);
    blob2.addColorStop(0, rgba(accDark, 0.30));
    blob2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = blob2;
    ctx.fillRect(0, 0, W, H);

    // Accent top bar
    ctx.save();
    const topbar = ctx.createLinearGradient(0, 0, W, 0);
    topbar.addColorStop(0, rgba(acc, 0.0));
    topbar.addColorStop(0.5, rgba(acc, 0.9));
    topbar.addColorStop(1, rgba(acc, 0.0));
    ctx.fillStyle = topbar;
    ctx.fillRect(0, 0, W, 6);
    ctx.restore();

    // Outer border
    ctx.save();
    roundRectPath(ctx, 5, 5, W - 10, H - 10, CORNER - 5);
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(acc, 0.35);
    ctx.stroke();
    ctx.restore();

    // ---- Avatar with gradient accent ring (left) ----
    const aCx = 170, aCy = 180, aR = 108;
    ctx.save();
    ctx.shadowColor = rgba(acc, 0.9);
    ctx.shadowBlur = 38;
    const ring = ctx.createLinearGradient(aCx - aR, aCy - aR, aCx + aR, aCy + aR);
    ring.addColorStop(0, accentHex);
    ring.addColorStop(1, `rgb(${accDark.r},${accDark.g},${accDark.b})`);
    ctx.beginPath();
    ctx.arc(aCx, aCy, aR + 9, 0, Math.PI * 2);
    ctx.fillStyle = ring;
    ctx.fill();
    ctx.restore();
    // dark gap
    ctx.save();
    ctx.beginPath();
    ctx.arc(aCx, aCy, aR + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.restore();

    let avatar = null;
    if (o.avatarURL) { try { avatar = await loadImage(o.avatarURL); } catch (_) { /* skip */ } }
    ctx.save();
    ctx.beginPath();
    ctx.arc(aCx, aCy, aR, 0, Math.PI * 2);
    ctx.clip();
    if (avatar) ctx.drawImage(avatar, aCx - aR, aCy - aR, aR * 2, aR * 2);
    else {
        const ph = ctx.createLinearGradient(aCx - aR, aCy - aR, aCx + aR, aCy + aR);
        ph.addColorStop(0, '#3a3d52'); ph.addColorStop(1, '#22242f');
        ctx.fillStyle = ph; ctx.fillRect(aCx - aR, aCy - aR, aR * 2, aR * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `${aR}px ${BOLD}`; ctx.textAlign = 'center';
        ctx.fillText((clean(o.username)[0] || '?').toUpperCase(), aCx, aCy + aR * 0.36);
    }
    ctx.restore();

    // Level pill under avatar
    const pillW = 168, pillH = 46, pillX = aCx - pillW / 2, pillY = aCy + aR + 16;
    ctx.save();
    ctx.shadowColor = rgba(acc, 0.6); ctx.shadowBlur = 16; ctx.shadowOffsetY = 3;
    roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    const pillG = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0);
    pillG.addColorStop(0, accentHex);
    pillG.addColorStop(1, `rgb(${accDark.r},${accDark.g},${accDark.b})`);
    ctx.fillStyle = pillG;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = `27px ${BOLD}`;
    ctx.fillText(`LEVEL ${Math.floor(o.level || 0)}`, aCx, pillY + 31);

    // ---- Right text block ----
    const LX = 326;            // left edge of text block
    const RX = W - 50;         // right edge
    const blockW = RX - LX;
    ctx.textAlign = 'left';

    // Rank position chip (top-right)
    if (o.rankPosition) {
        const chip = `#${o.rankPosition}`;
        ctx.font = `24px ${BOLD}`;
        const cw = ctx.measureText(chip).width + 34;
        const chX = RX - cw, chY = 40, chH = 40;
        ctx.save();
        roundRectPath(ctx, chX, chY, cw, chH, chH / 2);
        ctx.fillStyle = rgba(acc, 0.18);
        ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(acc, 0.7); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(chip, chX + cw / 2, chY + 28);
        ctx.textAlign = 'left';
    }

    // Username
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    const uname = clean(o.username) || 'Player';
    const unameMax = blockW - (o.rankPosition ? 90 : 0);
    const upx = fitText(ctx, uname, BOLD, 56, unameMax, 26);
    ctx.font = `${upx}px ${BOLD}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(uname, LX, 92);

    // Rank title line
    const rankName = clean(o.rankName);
    if (rankName) {
        const rpx = fitText(ctx, rankName, SEMI, 28, blockW, 16);
        ctx.font = `${rpx}px ${SEMI}`;
        ctx.fillStyle = `rgb(${Math.min(255, acc.r + 60)},${Math.min(255, acc.g + 60)},${Math.min(255, acc.b + 60)})`;
        ctx.fillText(rankName, LX, 130);
    }
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // XP progress bar
    const xpNeeded = Math.max(1, Math.floor(o.xpNeeded || 1));
    const xp = Math.max(0, Math.floor(o.xp || 0));
    const ratio = Math.max(0, Math.min(1, xp / xpNeeded));
    const barX = LX, barY = 166, barW = blockW, barH = 32;
    ctx.save();
    roundRectPath(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.restore();
    if (ratio > 0) {
        ctx.save();
        roundRectPath(ctx, barX, barY, Math.max(barH, barW * ratio), barH, barH / 2);
        const bg = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        bg.addColorStop(0, `rgb(${accDark.r},${accDark.g},${accDark.b})`);
        bg.addColorStop(1, accentHex);
        ctx.fillStyle = bg;
        ctx.fill();
        // glossy highlight
        ctx.globalAlpha = 0.25;
        roundRectPath(ctx, barX, barY, Math.max(barH, barW * ratio), barH / 2, barH / 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
    }
    ctx.font = `16px ${SEMI}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(`${xp.toLocaleString('en-US')} / ${xpNeeded.toLocaleString('en-US')} XP  •  ${Math.round(ratio * 100)}%`, barX + barW / 2, barY + 22);

    // ---- Stats row (4 columns): COINS | BADGES | STREAK | RANK ----
    const stats = [
        { label: 'COINS', value: compact(o.balance) },
        { label: 'BADGES', value: String(Math.floor(o.badges || 0)) },
        { label: 'STREAK', value: `${Math.floor(o.streak || 0)}d` },
        { label: 'RANK', value: o.rankPosition ? `#${o.rankPosition}` : '-' },
    ];
    const colW = blockW / 4;
    const rowY = 250;
    const cardH = 96;
    for (let i = 0; i < stats.length; i++) {
        const colX = LX + i * colW;
        // mini panel
        ctx.save();
        roundRectPath(ctx, colX + 6, rowY, colW - 12, cardH, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.stroke();
        ctx.restore();
        // accent top border
        ctx.save();
        roundRectPath(ctx, colX + 6, rowY, colW - 12, 5, 3);
        ctx.fillStyle = rgba(acc, 0.85);
        ctx.fill();
        ctx.restore();
        const midX = colX + colW / 2;
        ctx.textAlign = 'center';
        const vpx = fitText(ctx, stats[i].value, BOLD, 33, colW - 24, 16);
        ctx.font = `${vpx}px ${BOLD}`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(stats[i].value, midX, rowY + 50);
        ctx.font = `15px ${SEMI}`;
        ctx.fillStyle = 'rgba(220,224,235,0.6)';
        ctx.fillText(stats[i].label, midX, rowY + 76);
    }

    // ---- Footer watermark (shareable flex) ----
    const tag = clean(o.footerTag);
    if (tag) {
        ctx.textAlign = 'left';
        ctx.font = `15px ${SEMI}`;
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        ctx.fillText(tag.toUpperCase().slice(0, 60), LX, H - 22);
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard };
