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

const W = 1024, H = 400, CORNER = 32;

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
 * @returns {Promise<Buffer>}
 */
async function generateProfileCard(o = {}) {
    const accent = /^#?[0-9a-fA-F]{6}$/.test(String(o.accent || '').replace('#', '')) ? (o.accent[0] === '#' ? o.accent : '#' + o.accent) : '#5865F2';
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Rounded clip
    roundRectPath(ctx, 0, 0, W, H, CORNER);
    ctx.clip();

    // Background gradient
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#2b3050');
    g.addColorStop(0.55, '#1a1c2b');
    g.addColorStop(1, '#0e0f18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Accent glow blob (top-left)
    const blob = ctx.createRadialGradient(150, 200, 20, 150, 200, 380);
    blob.addColorStop(0, accent + '55');
    blob.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = blob;
    ctx.fillRect(0, 0, W, H);

    // Inner border
    ctx.save();
    roundRectPath(ctx, 4, 4, W - 8, H - 8, CORNER - 4);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.stroke();
    ctx.restore();


    // ---- Avatar with accent ring (left) ----
    const aCx = 165, aCy = 175, aR = 110;
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 35;
    ctx.beginPath();
    ctx.arc(aCx, aCy, aR + 8, 0, Math.PI * 2);
    ctx.fillStyle = accent;
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
    else { ctx.fillStyle = '#2b2d31'; ctx.fillRect(aCx - aR, aCy - aR, aR * 2, aR * 2); }
    ctx.restore();

    // Level pill under avatar
    const pillW = 150, pillH = 44, pillX = aCx - pillW / 2, pillY = aCy + aR + 18;
    ctx.save();
    roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = `26px ${BOLD}`;
    ctx.fillText(`LEVEL ${Math.floor(o.level || 0)}`, aCx, pillY + 30);
    ctx.restore();


    // ---- Right text block ----
    const LX = 320;            // left edge of text block
    const RX = W - 50;         // right edge
    const blockW = RX - LX;
    ctx.textAlign = 'left';

    // Username
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    const uname = clean(o.username) || 'Player';
    const upx = fitText(ctx, uname, BOLD, 54, blockW, 26);
    ctx.font = `${upx}px ${BOLD}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(uname, LX, 95);

    // Rank title line
    const rankName = clean(o.rankName);
    if (rankName) {
        const rpx = fitText(ctx, rankName, SEMI, 28, blockW, 16);
        ctx.font = `${rpx}px ${SEMI}`;
        ctx.fillStyle = accent;
        ctx.fillText(rankName, LX, 135);
    }
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // XP progress bar
    const xpNeeded = Math.max(1, Math.floor(o.xpNeeded || 1));
    const xp = Math.max(0, Math.floor(o.xp || 0));
    const ratio = Math.max(0, Math.min(1, xp / xpNeeded));
    const barX = LX, barY = 170, barW = blockW, barH = 30;
    ctx.save();
    roundRectPath(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.restore();
    if (ratio > 0) {
        ctx.save();
        roundRectPath(ctx, barX, barY, Math.max(barH, barW * ratio), barH, barH / 2);
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.restore();
    }
    ctx.font = `16px ${SEMI}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(`${xp.toLocaleString('en-US')} / ${xpNeeded.toLocaleString('en-US')} XP`, barX + barW / 2, barY + 21);


    // ---- Stats row (4 columns): COINS | BADGES | STREAK | RANK ----
    const stats = [
        { label: 'COINS', value: compact(o.balance) },
        { label: 'BADGES', value: String(Math.floor(o.badges || 0)) },
        { label: 'STREAK', value: `${Math.floor(o.streak || 0)}d` },
        { label: 'RANK', value: o.rankPosition ? `#${o.rankPosition}` : '-' },
    ];
    const colW = blockW / 4;
    const rowY = 255;
    const cardH = 95;
    for (let i = 0; i < stats.length; i++) {
        const colX = LX + i * colW;
        // mini panel
        ctx.save();
        roundRectPath(ctx, colX + 6, rowY, colW - 12, cardH, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fill();
        ctx.restore();
        const midX = colX + colW / 2;
        ctx.textAlign = 'center';
        const vpx = fitText(ctx, stats[i].value, BOLD, 32, colW - 22, 16);
        ctx.font = `${vpx}px ${BOLD}`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(stats[i].value, midX, rowY + 46);
        ctx.font = `15px ${SEMI}`;
        ctx.fillStyle = 'rgba(220,224,235,0.65)';
        ctx.fillText(stats[i].label, midX, rowY + 74);
    }

    return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard };
