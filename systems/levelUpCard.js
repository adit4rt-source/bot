// systems/levelUpCard.js — Generate a celebratory Level-Up PNG Card (avatar + level transition + perks).
// Uses @napi-rs/canvas with Poppins font family. Text sanitized to prevent missing glyphs.
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
let FONTS_OK = false;
try {
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-Bold.ttf'), 'PoppinsBold');
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-SemiBold.ttf'), 'PoppinsSemiBold');
    FONTS_OK = true;
} catch (e) {
    // Fonts not available — fall back to sans-serif
}
const BOLD = FONTS_OK ? 'PoppinsBold' : 'sans-serif';
const SEMI = FONTS_OK ? 'PoppinsSemiBold' : 'sans-serif';

const W = 960, H = 340, CORNER = 28;

function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y + w, y, rr);
    ctx.closePath();
}

function clean(str) {
    return String(str || '')
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{20E3}\u{2122}\u{2139}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function compact(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.floor(n));
}

function fitText(ctx, text, font, basePx, maxWidth, minPx = 14) {
    let px = basePx;
    while (px > minPx) {
        ctx.font = `${px}px ${font}`;
        if (ctx.measureText(text).width <= maxWidth) return px;
        px -= 2;
    }
    ctx.font = `${minPx}px ${font}`;
    return minPx;
}

function hexToRgb(hex) {
    const m = String(hex || '').replace('#', '').match(/^([0-9a-fA-F]{6})$/);
    if (!m) return { r: 46, g: 204, b: 113 }; // default emerald green
    const int = parseInt(m[1], 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgba({ r, g, b }, a) { return `rgba(${r},${g},${b},${a})`; }
function darken({ r, g, b }, f) {
    return { r: Math.round(r * (1 - f)), g: Math.round(g * (1 - f)), b: Math.round(b * (1 - f)) };
}

/**
 * Generate a celebratory Level-Up PNG Card.
 * @param {Object} o
 * @param {string} o.username
 * @param {string} [o.avatarURL]
 * @param {number} o.level new level
 * @param {number} [o.oldLevel] previous level (defaults to level - 1)
 * @param {number} [o.streak] user's chat streak
 * @param {number} [o.rewardMoney] bonus money granted on level up
 * @param {string} [o.rewardRole] role reward name granted on level up
 * @param {string} [o.accent] hex color (defaults to emerald '#2ECC71')
 * @param {string} [o.serverName] server watermark
 * @returns {Promise<Buffer>}
 */
async function generateLevelUpCard(o = {}) {
    const accentHex = /^#?[0-9a-fA-F]{6}$/.test(String(o.accent || '').replace('#', ''))
        ? (o.accent[0] === '#' ? o.accent : '#' + o.accent)
        : '#2ECC71';
    const acc = hexToRgb(accentHex);
    const accDark = darken(acc, 0.5);

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Rounded clip for the card
    roundRectPath(ctx, 0, 0, W, H, CORNER);
    ctx.clip();

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0c0e18');
    bg.addColorStop(0.5, '#121526');
    bg.addColorStop(1, '#0a0b12');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle diagonal stripes
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let x = -H; x < W; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + H, H);
        ctx.stroke();
    }
    ctx.restore();

    // Glow blob behind avatar & header
    const blob1 = ctx.createRadialGradient(150, 170, 20, 150, 170, 320);
    blob1.addColorStop(0, rgba(acc, 0.45));
    blob1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = blob1;
    ctx.fillRect(0, 0, W, H);

    const blob2 = ctx.createRadialGradient(W - 120, 80, 10, W - 120, 80, 260);
    blob2.addColorStop(0, rgba(accDark, 0.35));
    blob2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = blob2;
    ctx.fillRect(0, 0, W, H);

    // Accent top bar
    ctx.save();
    const topBar = ctx.createLinearGradient(0, 0, W, 0);
    topBar.addColorStop(0, rgba(acc, 0.1));
    topBar.addColorStop(0.5, rgba(acc, 0.95));
    topBar.addColorStop(1, rgba(acc, 0.1));
    ctx.fillStyle = topBar;
    ctx.fillRect(0, 0, W, 6);
    ctx.restore();

    // Outer border
    ctx.save();
    roundRectPath(ctx, 4, 4, W - 8, H - 8, CORNER - 4);
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(acc, 0.35);
    ctx.stroke();
    ctx.restore();

    // ---- Avatar (Left) ----
    const aCx = 145, aCy = 170, aR = 85;
    ctx.save();
    ctx.shadowColor = rgba(acc, 0.85);
    ctx.shadowBlur = 32;
    const ring = ctx.createLinearGradient(aCx - aR, aCy - aR, aCx + aR, aCy + aR);
    ring.addColorStop(0, accentHex);
    ring.addColorStop(1, `rgb(${accDark.r},${accDark.g},${accDark.b})`);
    ctx.beginPath();
    ctx.arc(aCx, aCy, aR + 8, 0, Math.PI * 2);
    ctx.fillStyle = ring;
    ctx.fill();
    ctx.restore();

    // Dark gap
    ctx.save();
    ctx.beginPath();
    ctx.arc(aCx, aCy, aR + 3, 0, Math.PI * 2);
    ctx.fillStyle = '#0c0e18';
    ctx.fill();
    ctx.restore();

    let avatar = null;
    if (o.avatarURL) {
        try { avatar = await loadImage(o.avatarURL); } catch (_) {}
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(aCx, aCy, aR, 0, Math.PI * 2);
    ctx.clip();
    if (avatar) {
        ctx.drawImage(avatar, aCx - aR, aCy - aR, aR * 2, aR * 2);
    } else {
        ctx.fillStyle = '#222536';
        ctx.fillRect(aCx - aR, aCy - aR, aR * 2, aR * 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = `${aR}px ${BOLD}`;
        ctx.textAlign = 'center';
        ctx.fillText((clean(o.username)[0] || '?').toUpperCase(), aCx, aCy + aR * 0.35);
    }
    ctx.restore();

    // Star icon tag on bottom of avatar
    ctx.save();
    const tagW = 90, tagH = 28, tagX = aCx - tagW / 2, tagY = aCy + aR - 10;
    roundRectPath(ctx, tagX, tagY, tagW, tagH, tagH / 2);
    ctx.fillStyle = accentHex;
    ctx.shadowColor = rgba(acc, 0.6);
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.font = `14px ${BOLD}`;
    ctx.textAlign = 'center';
    ctx.fillText('STAR RANK', aCx, tagY + 19);

    // ---- Content Block (Right) ----
    const LX = 275;
    const RX = W - 45;
    const contentW = RX - LX;

    // Headline Pill: "LEVEL UP!"
    const pillW = 140, pillH = 34, pillY = 38;
    ctx.save();
    roundRectPath(ctx, LX, pillY, pillW, pillH, 8);
    ctx.fillStyle = rgba(acc, 0.2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(acc, 0.85);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = accentHex;
    ctx.font = `16px ${BOLD}`;
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL UP!', LX + pillW / 2, pillY + 23);

    // Username (Right next to pill)
    const uname = clean(o.username) || 'Player';
    ctx.textAlign = 'left';
    const upx = fitText(ctx, uname, BOLD, 28, contentW - pillW - 20, 18);
    ctx.font = `${upx}px ${BOLD}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(uname, LX + pillW + 18, pillY + 25);

    // Big Level Transition Banner Box
    const boxY = 92;
    const boxH = 95;
    ctx.save();
    roundRectPath(ctx, LX, boxY, contentW, boxH, 16);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();
    ctx.restore();

    // Box Accent Glow on left edge
    ctx.save();
    roundRectPath(ctx, LX, boxY, 6, boxH, 3);
    ctx.fillStyle = accentHex;
    ctx.fill();
    ctx.restore();

    const oldLv = o.oldLevel !== undefined ? Number(o.oldLevel) : Math.max(0, Number(o.level || 1) - 1);
    const newLv = Number(o.level || 1);

    // Old Level (Left inside box)
    ctx.textAlign = 'left';
    ctx.font = `16px ${SEMI}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText('PREVIOUS', LX + 28, boxY + 34);

    ctx.font = `32px ${BOLD}`;
    ctx.fillStyle = '#8e92a8';
    ctx.fillText(`LV. ${oldLv}`, LX + 28, boxY + 72);

    // Arrow (Center inside box)
    ctx.textAlign = 'center';
    ctx.font = `36px ${BOLD}`;
    ctx.fillStyle = accentHex;
    ctx.fillText('➔', LX + 240, boxY + 62);

    // New Level (Right inside box)
    ctx.textAlign = 'left';
    ctx.font = `16px ${SEMI}`;
    ctx.fillStyle = accentHex;
    ctx.fillText('NEW LEVEL', LX + 310, boxY + 34);

    ctx.font = `38px ${BOLD}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`LV. ${newLv}`, LX + 310, boxY + 73);

    // Perks / Rewards Badges (Bottom row)
    const pills = [];
    if (o.rewardMoney && o.rewardMoney > 0) {
        pills.push({ icon: '🪙', label: `+${compact(o.rewardMoney)} COINS` });
    }
    if (o.rewardRole) {
        pills.push({ icon: '🎭', label: clean(o.rewardRole).toUpperCase().slice(0, 20) });
    }
    if (o.streak && o.streak > 0) {
        pills.push({ icon: '🔥', label: `${o.streak} DAYS STREAK` });
    }
    if (pills.length === 0) {
        pills.push({ icon: '✨', label: 'COMMUNITY ACTIVE MEMBER' });
    }

    let pX = LX;
    const pY = 210;
    const pHeight = 44;
    for (const pill of pills) {
        ctx.font = `15px ${BOLD}`;
        const textWidth = ctx.measureText(pill.label).width;
        const pWidth = Math.min(220, textWidth + 48);

        ctx.save();
        roundRectPath(ctx, pX, pY, pWidth, pHeight, 12);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(acc, 0.4);
        ctx.stroke();
        ctx.restore();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = `15px ${BOLD}`;
        ctx.fillText(pill.label, pX + pWidth / 2, pY + 28);

        pX += pWidth + 14;
        if (pX > RX - 100) break;
    }

    // Watermark (Bottom right)
    const serverTag = clean(o.serverName) || 'ID COMMUNITY';
    ctx.textAlign = 'right';
    ctx.font = `13px ${SEMI}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillText(`${serverTag.toUpperCase()} • LEVEL PROGRESSION`, RX, H - 24);

    return canvas.toBuffer('image/png');
}

module.exports = { generateLevelUpCard };
