// systems/profileCard.js — Member Card Canvas Generator (1080x580)
// High-fidelity Discord Community Member Card with Avatar, Profile Info,
// Feathered Winged Rank Shield, and 100% Vector-Rendered Badges & Icons (no emoji font dependency).
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
let FONTS_OK = false;
try {
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-Bold.ttf'), 'PoppinsBold');
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-SemiBold.ttf'), 'PoppinsSemiBold');
    FONTS_OK = true;
} catch (e) {
    // Fonts not available — fallback to sans-serif
}
const BOLD = FONTS_OK ? 'PoppinsBold, sans-serif' : 'sans-serif';
const SEMI = FONTS_OK ? 'PoppinsSemiBold, sans-serif' : 'sans-serif';

const W = 1080, H = 580;

function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
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
    if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.floor(n));
}

function formatDate(val) {
    if (!val) return '29/04/2024';
    try {
        const d = new Date(val);
        if (isNaN(d.getTime())) return '29/04/2024';
        const day = String(d.getDate()).padStart(2, '0');
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const yr = d.getFullYear();
        return `${day}/${mo}/${yr}`;
    } catch (_) {
        return '29/04/2024';
    }
}

function formatDuration(since) {
    if (!since) return '1 Tahun 1 Bulan';
    try {
        const d = new Date(since);
        if (isNaN(d.getTime())) return '1 Tahun 1 Bulan';
        const diffMs = Math.max(0, Date.now() - d.getTime());
        const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (totalDays >= 365) {
            const yrs = Math.floor(totalDays / 365);
            const mos = Math.floor((totalDays % 365) / 30);
            return mos > 0 ? `${yrs} Tahun ${mos} Bulan` : `${yrs} Tahun`;
        }
        if (totalDays >= 30) {
            const mos = Math.floor(totalDays / 30);
            const days = totalDays % 30;
            return days > 0 ? `${mos} Bulan ${days} Hari` : `${mos} Bulan`;
        }
        return `${Math.max(1, totalDays)} Hari`;
    } catch (_) {
        return '1 Tahun 1 Bulan';
    }
}

function drawSparkle(ctx, x, y, r, color = '#FFFFFF') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
}

function drawVectorStar(ctx, cx, cy, spikes = 5, outerR = 10, innerR = 5, color = '#F59E0B') {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerR;
        y = cy + Math.sin(rot) * outerR;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerR;
        y = cy + Math.sin(rot) * innerR;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
}

function drawFacetedStar(ctx, cx, cy, r, colorLight = '#FFFFFF', colorDark = '#CBD5E1') {
    const spikes = 5;
    const innerR = r * 0.42;
    const step = Math.PI / spikes;
    let angle = -Math.PI / 2;

    ctx.save();
    for (let i = 0; i < spikes; i++) {
        const outerAngle = angle;
        const innerAngle = angle + step;
        const nextOuter = angle + step * 2;

        const ox = cx + Math.cos(outerAngle) * r;
        const oy = cy + Math.sin(outerAngle) * r;
        const ix = cx + Math.cos(innerAngle) * innerR;
        const iy = cy + Math.sin(innerAngle) * innerR;

        // Left facet
        ctx.fillStyle = colorLight;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ox, oy);
        ctx.lineTo(ix, iy);
        ctx.closePath();
        ctx.fill();

        // Right facet
        ctx.fillStyle = colorDark;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ix, iy);
        const nox = cx + Math.cos(nextOuter) * r;
        const noy = cy + Math.sin(nextOuter) * r;
        ctx.lineTo(nox, noy);
        ctx.closePath();
        ctx.fill();

        angle += step * 2;
    }
    ctx.restore();
}

function drawVectorHeart(ctx, cx, cy, r, color = '#EF4444') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    const d = r * 1.15;
    ctx.moveTo(cx, cy + d * 0.45);
    ctx.bezierCurveTo(cx - d * 0.7, cy + d * 0.05, cx - d * 0.7, cy - d * 0.45, cx, cy - d * 0.2);
    ctx.bezierCurveTo(cx + d * 0.7, cy - d * 0.45, cx + d * 0.7, cy + d * 0.05, cx, cy + d * 0.45);
    ctx.fill();
    ctx.restore();
}

function drawVectorDice(ctx, cx, cy, r = 34) {
    ctx.save();
    // Circular gradient roundel
    const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    grad.addColorStop(0, '#4338CA');
    grad.addColorStop(1, '#3B82F6');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Subtle dashed accent ring
    ctx.beginPath();
    ctx.arc(cx, cy, r - 3.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([3, 3]);
    ctx.stroke();
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);

    // Die 1 (left, tilted, 5 pips)
    ctx.save();
    ctx.translate(cx - 7, cy + 3);
    ctx.rotate(-0.22);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 5;
    roundRect(ctx, -11, -11, 22, 22, 4);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#1E1B4B';
    const dots1 = [[0, 0], [-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]];
    for (const [dx, dy] of dots1) {
        ctx.beginPath();
        ctx.arc(dx, dy, 1.8, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // Die 2 (right, overlapping, 1 big red pip in center + 4 black corner pips)
    ctx.save();
    ctx.translate(cx + 8, cy - 4);
    ctx.rotate(0.32);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 6;
    roundRect(ctx, -10, -10, 20, 20, 4);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1E1B4B';
    const dots2 = [[-5, -5], [5, -5], [-5, 5], [5, 5]];
    for (const [dx, dy] of dots2) {
        ctx.beginPath();
        ctx.arc(dx, dy, 1.6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
    ctx.restore();
}

function drawInfoIcon(ctx, type, cx, cy) {
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (type) {
        case 'user': // Join Discord (User avatar silhouette)
            ctx.beginPath();
            ctx.arc(cx, cy - 4, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy + 9, 7.5, Math.PI * 1.2, Math.PI * 1.8);
            ctx.lineTo(cx + 6.5, cy + 7);
            ctx.lineTo(cx - 6.5, cy + 7);
            ctx.closePath();
            ctx.fill();
            break;

        case 'chat': // Join Server (Speech bubble with 3 dots)
            roundRect(ctx, cx - 8, cy - 7, 16, 12, 3);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(cx - 4, cy + 4);
            ctx.lineTo(cx - 7, cy + 8);
            ctx.lineTo(cx - 1, cy + 5);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#818CF8';
            ctx.beginPath();
            ctx.arc(cx - 4, cy - 1, 1.2, 0, Math.PI * 2);
            ctx.arc(cx, cy - 1, 1.2, 0, Math.PI * 2);
            ctx.arc(cx + 4, cy - 1, 1.2, 0, Math.PI * 2);
            ctx.fill();
            break;

        case 'calendar': // Member Since (Calendar page with grid)
            roundRect(ctx, cx - 7, cy - 6, 14, 13, 2);
            ctx.fill();
            ctx.fillStyle = '#DC2626';
            roundRect(ctx, cx - 7, cy - 6, 14, 4, 1);
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(cx - 4, cy - 8);
            ctx.lineTo(cx - 4, cy - 5);
            ctx.moveTo(cx + 4, cy - 8);
            ctx.lineTo(cx + 4, cy - 5);
            ctx.stroke();
            ctx.fillStyle = '#F87171';
            const gridPts = [[-3, 1], [0, 1], [3, 1], [-3, 4], [0, 4], [3, 4]];
            for (const [gx, gy] of gridPts) {
                ctx.beginPath();
                ctx.arc(cx + gx, cy + gy, 0.9, 0, Math.PI * 2);
                ctx.fill();
            }
            break;

        case 'level': // Level & EXP (Level star)
            drawVectorStar(ctx, cx, cy, 5, 7, 3.5, '#FFFFFF');
            break;

        case 'crown': // Special Role (Golden/white royal crown)
            roundRect(ctx, cx - 7, cy + 4, 14, 2, 0);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(cx - 7, cy + 3);
            ctx.lineTo(cx - 8, cy - 3);
            ctx.lineTo(cx - 3, cy);
            ctx.lineTo(cx, cy - 5);
            ctx.lineTo(cx + 3, cy);
            ctx.lineTo(cx + 8, cy - 3);
            ctx.lineTo(cx + 7, cy + 3);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx - 8, cy - 3.5, 1.2, 0, Math.PI * 2);
            ctx.arc(cx, cy - 5.5, 1.4, 0, Math.PI * 2);
            ctx.arc(cx + 8, cy - 3.5, 1.2, 0, Math.PI * 2);
            ctx.fill();
            break;
    }
    ctx.restore();
}

function drawVectorTrophy(ctx, cx, cy, size = 16, color = '#FFFFFF') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    // Cup body
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.45, cy - size * 0.45);
    ctx.lineTo(cx + size * 0.45, cy - size * 0.45);
    ctx.lineTo(cx + size * 0.38, cy + size * 0.05);
    ctx.bezierCurveTo(cx + size * 0.3, cy + size * 0.3, cx - size * 0.3, cy + size * 0.3, cx - size * 0.38, cy + size * 0.05);
    ctx.closePath();
    ctx.fill();

    // Stem & Base
    ctx.fillRect(cx - size * 0.08, cy + size * 0.25, size * 0.16, size * 0.2);
    roundRect(ctx, cx - size * 0.35, cy + size * 0.42, size * 0.7, size * 0.15, 2);
    ctx.fill();

    // Handles
    ctx.beginPath();
    ctx.arc(cx - size * 0.45, cy - size * 0.15, size * 0.2, Math.PI * 0.6, Math.PI * 1.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + size * 0.45, cy - size * 0.15, size * 0.2, -Math.PI * 0.6, Math.PI * 0.4);
    ctx.stroke();

    ctx.restore();
}

// ---------------- 6 Vector Badge Renderers (No Emojis) ----------------
function drawBadgeCrown(ctx, cx, cy) {
    ctx.save();
    ctx.fillStyle = '#F59E0B';
    roundRect(ctx, cx - 14, cy + 6, 28, 5, 2);
    ctx.fill();

    const grad = ctx.createLinearGradient(cx, cy - 12, cx, cy + 6);
    grad.addColorStop(0, '#FDE047');
    grad.addColorStop(1, '#F59E0B');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy + 5);
    ctx.lineTo(cx - 15, cy - 8);
    ctx.lineTo(cx - 7, cy - 1);
    ctx.lineTo(cx, cy - 13);
    ctx.lineTo(cx + 7, cy - 1);
    ctx.lineTo(cx + 15, cy - 8);
    ctx.lineTo(cx + 14, cy + 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx - 15, cy - 9, 2.5, 0, Math.PI * 2);
    ctx.arc(cx, cy - 14, 3, 0, Math.PI * 2);
    ctx.arc(cx + 15, cy - 9, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(cx, cy + 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawBadgeDiamond(ctx, cx, cy) {
    ctx.save();
    ctx.strokeStyle = '#818CF8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy + 3, 16, Math.PI * 0.2, Math.PI * 0.8, true);
    ctx.stroke();

    const w = 24;
    const topY = cy - 8, midY = cy - 1, botY = cy + 9;

    ctx.fillStyle = '#A5B4FC';
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + 3, topY);
    ctx.lineTo(cx + w / 2 - 3, topY);
    ctx.lineTo(cx + w / 2, midY);
    ctx.lineTo(cx - w / 2, midY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#E0E7FF';
    ctx.beginPath();
    ctx.moveTo(cx - 4, topY);
    ctx.lineTo(cx + 4, topY);
    ctx.lineTo(cx + 7, midY);
    ctx.lineTo(cx - 7, midY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#6366F1';
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, midY);
    ctx.lineTo(cx + w / 2, midY);
    ctx.lineTo(cx, botY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#818CF8';
    ctx.beginPath();
    ctx.moveTo(cx - 7, midY);
    ctx.lineTo(cx + 7, midY);
    ctx.lineTo(cx, botY);
    ctx.closePath();
    ctx.fill();

    drawSparkle(ctx, cx - 6, cy - 5, 3, '#FFFFFF');
    ctx.restore();
}

function drawBadgeChat(ctx, cx, cy) {
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 4;
    roundRect(ctx, cx - 13, cy - 10, 26, 18, 5);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx - 5, cy + 7);
    ctx.lineTo(cx - 10, cy + 13);
    ctx.lineTo(cx - 1, cy + 8);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.fillStyle = '#14B8A6';
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 1, 2, 0, Math.PI * 2);
    ctx.arc(cx, cy - 1, 2, 0, Math.PI * 2);
    ctx.arc(cx + 6, cy - 1, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawBadgeHeart(ctx, cx, cy) {
    ctx.save();
    const grad = ctx.createLinearGradient(cx, cy - 12, cx, cy + 14);
    grad.addColorStop(0, '#FB7185');
    grad.addColorStop(1, '#E11D48');
    drawVectorHeart(ctx, cx, cy, 14, grad);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 3, 5, Math.PI * 0.9, Math.PI * 1.5);
    ctx.stroke();
    ctx.restore();
}

function drawBadgeShield(ctx, cx, cy) {
    ctx.save();
    ctx.strokeStyle = '#60A5FA';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy + 3, 16, Math.PI * 0.2, Math.PI * 0.8, true);
    ctx.stroke();

    const sw = 10, sh = 12;
    ctx.beginPath();
    ctx.moveTo(cx, cy - sh);
    ctx.lineTo(cx + sw, cy - sh + 3);
    ctx.lineTo(cx + sw, cy + 2);
    ctx.bezierCurveTo(cx + sw, cy + 9, cx, cy + 13, cx, cy + 14);
    ctx.bezierCurveTo(cx, cy + 13, cx - sw, cy + 9, cx - sw, cy + 2);
    ctx.lineTo(cx - sw, cy - sh + 3);
    ctx.closePath();

    const shGrad = ctx.createLinearGradient(cx - sw, cy - sh, cx + sw, cy + 14);
    shGrad.addColorStop(0, '#93C5FD');
    shGrad.addColorStop(1, '#2563EB');
    ctx.fillStyle = shGrad;
    ctx.fill();
    ctx.strokeStyle = '#EFF6FF';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    drawVectorStar(ctx, cx, cy + 1, 5, 4.5, 2.2, '#FFFFFF');
    ctx.restore();
}

function drawBadgeTrophy(ctx, cx, cy) {
    ctx.save();
    const grad = ctx.createLinearGradient(cx - 12, cy - 12, cx + 12, cy + 12);
    grad.addColorStop(0, '#FDE047');
    grad.addColorStop(1, '#D97706');
    drawVectorTrophy(ctx, cx, cy, 22, grad);
    drawSparkle(ctx, cx + 8, cy - 8, 3.5, '#FFFFFF');
    ctx.restore();
}

function drawCardBox(ctx, x, y, w, h, r = 24) {
    ctx.save();
    ctx.shadowColor = 'rgba(79, 70, 229, 0.08)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = 'rgba(224, 231, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
}

function getRankColorConfig(rankTier = 'silver') {
    const key = String(rankTier || '').toLowerCase();
    if (key.includes('bronze')) {
        return { primary: '#CD7F32', dark: '#78350F', light: '#FED7AA', highlight: '#FDBA74', ribbon: '#92400E', wings: '#E2E8F0', label: 'BRONZE' };
    }
    if (key.includes('gold')) {
        return { primary: '#F59E0B', dark: '#B45309', light: '#FEF08A', highlight: '#FDE047', ribbon: '#D97706', wings: '#FEF3C7', label: 'GOLD' };
    }
    if (key.includes('platinum')) {
        return { primary: '#0284C7', dark: '#0369A1', light: '#E0F2FE', highlight: '#38BDF8', ribbon: '#0284C7', wings: '#BAE6FD', label: 'PLATINUM' };
    }
    if (key.includes('diamond')) {
        return { primary: '#06B6D4', dark: '#0E7490', light: '#CFFAFE', highlight: '#22D3EE', ribbon: '#0891B2', wings: '#CCFBF1', label: 'DIAMOND' };
    }
    if (key.includes('master')) {
        return { primary: '#A855F7', dark: '#6B21A8', light: '#F3E8FF', highlight: '#C084FC', ribbon: '#7E22CE', wings: '#F5D0FE', label: 'MASTER' };
    }
    if (key.includes('grandmaster')) {
        return { primary: '#F97316', dark: '#C2410C', light: '#FFEDD5', highlight: '#FB923C', ribbon: '#EA580C', wings: '#FED7AA', label: 'GRANDMASTER' };
    }
    if (key.includes('mythic')) {
        return { primary: '#EC4899', dark: '#9D174D', light: '#FCE7F3', highlight: '#F472B6', ribbon: '#DB2777', wings: '#FBCFE8', label: 'MYTHIC' };
    }
    if (key.includes('legend')) {
        return { primary: '#EAB308', dark: '#854D0E', light: '#FEF08A', highlight: '#FACC15', ribbon: '#CA8A04', wings: '#FEF08A', label: 'LEGEND' };
    }
    if (key.includes('immortal')) {
        return { primary: '#EF4444', dark: '#991B1B', light: '#FEE2E2', highlight: '#F87171', ribbon: '#DC2626', wings: '#FECACA', label: 'IMMORTAL' };
    }
    return { primary: '#64748B', dark: '#334155', light: '#F1F5F9', highlight: '#94A3B8', ribbon: '#2563EB', wings: '#E2E8F0', label: 'SILVER' };
}

function drawFeatheredWings(ctx, cx, cy, wingColor) {
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 1.5;

    // Left Wing (3 distinct layered feathers)
    const gradL = ctx.createLinearGradient(cx - 110, cy - 40, cx - 35, cy + 30);
    gradL.addColorStop(0, '#FFFFFF');
    gradL.addColorStop(0.5, wingColor);
    gradL.addColorStop(1, '#CBD5E1');

    ctx.fillStyle = gradL;

    // Feather 1 (top left, sweeping up and out)
    ctx.beginPath();
    ctx.moveTo(cx - 36, cy - 6);
    ctx.bezierCurveTo(cx - 55, cy - 45, cx - 100, cy - 35, cx - 112, cy - 12);
    ctx.bezierCurveTo(cx - 95, cy + 5, cx - 60, cy + 5, cx - 36, cy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Feather 2 (middle left)
    ctx.beginPath();
    ctx.moveTo(cx - 36, cy + 6);
    ctx.bezierCurveTo(cx - 65, cy, cx - 102, cy + 15, cx - 98, cy + 32);
    ctx.bezierCurveTo(cx - 80, cy + 45, cx - 55, cy + 35, cx - 36, cy + 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Feather 3 (bottom left)
    ctx.beginPath();
    ctx.moveTo(cx - 36, cy + 20);
    ctx.bezierCurveTo(cx - 55, cy + 24, cx - 80, cy + 38, cx - 72, cy + 50);
    ctx.bezierCurveTo(cx - 55, cy + 54, cx - 42, cy + 40, cx - 36, cy + 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right Wing (3 distinct layered feathers)
    const gradR = ctx.createLinearGradient(cx + 35, cy - 40, cx + 110, cy + 30);
    gradR.addColorStop(0, '#CBD5E1');
    gradR.addColorStop(0.5, wingColor);
    gradR.addColorStop(1, '#FFFFFF');

    ctx.fillStyle = gradR;

    // Feather 1 (top right)
    ctx.beginPath();
    ctx.moveTo(cx + 36, cy - 6);
    ctx.bezierCurveTo(cx + 55, cy - 45, cx + 100, cy - 35, cx + 112, cy - 12);
    ctx.bezierCurveTo(cx + 95, cy + 5, cx + 60, cy + 5, cx + 36, cy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Feather 2 (middle right)
    ctx.beginPath();
    ctx.moveTo(cx + 36, cy + 6);
    ctx.bezierCurveTo(cx + 65, cy, cx + 102, cy + 15, cx + 98, cy + 32);
    ctx.bezierCurveTo(cx + 80, cy + 45, cx + 55, cy + 35, cx + 36, cy + 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Feather 3 (bottom right)
    ctx.beginPath();
    ctx.moveTo(cx + 36, cy + 20);
    ctx.bezierCurveTo(cx + 55, cy + 24, cx + 80, cy + 38, cx + 72, cy + 50);
    ctx.bezierCurveTo(cx + 55, cy + 54, cx + 42, cy + 40, cx + 36, cy + 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

/**
 * Generate a Community Member Card PNG buffer (1080x580).
 */
async function generateProfileCard(o = {}) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // 1. Base Card Outline & Background
    roundRect(ctx, 0, 0, W, H, 32);
    ctx.clip();

    let customBg = null;
    if (o.bgURL) {
        try { customBg = await loadImage(o.bgURL); } catch (_) {}
    }

    if (customBg) {
        ctx.drawImage(customBg, 0, 0, W, H);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.40)';
        ctx.fillRect(0, 0, W, H);
    } else {
        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0, '#C2D9FC');
        bgGrad.addColorStop(0.3, '#DBE8FF');
        bgGrad.addColorStop(1, '#E8F0FE');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);
    }

    // Sparkles and Cloud Accents
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.50)';
    ctx.beginPath();
    ctx.arc(880, 50, 60, 0, Math.PI * 2);
    ctx.arc(960, 30, 80, 0, Math.PI * 2);
    ctx.arc(1040, 60, 70, 0, Math.PI * 2);
    ctx.fill();

    drawSparkle(ctx, 450, 45, 10, '#FFF59D');
    drawSparkle(ctx, 720, 30, 8, '#FFFFFF');
    drawSparkle(ctx, 780, 65, 12, '#FFFFFF');
    drawSparkle(ctx, 1030, 110, 9, '#FFFFFF');
    drawSparkle(ctx, 50, 240, 8, '#FBCFE8');
    drawSparkle(ctx, 290, 260, 7, '#FBCFE8');
    ctx.restore();

    // 2. Header: Server Logo & Member Card Subtitle
    let guildImg = null;
    if (o.guildIconURL) {
        try { guildImg = await loadImage(o.guildIconURL); } catch (_) {}
    }

    if (guildImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(80, 58, 38, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(79, 70, 229, 0.2)';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(80, 58, 34, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(guildImg, 46, 24, 68, 68);
        ctx.restore();
    } else {
        // High fidelity vector ID Community dice emblem
        drawVectorDice(ctx, 80, 58, 34);
    }

    // Header Text
    const sName = clean(o.footerTag) || 'ID COMMUNITY';
    ctx.fillStyle = '#1E1B4B';
    ctx.font = `34px ${BOLD}`;
    ctx.textAlign = 'left';
    ctx.fillText(sName.toUpperCase(), 135, 52);

    drawSparkle(ctx, 142, 78, 6, '#F59E0B');
    ctx.fillStyle = '#6366F1';
    ctx.font = `17px ${SEMI}`;
    ctx.fillText('Member Card', 158, 83);
    drawSparkle(ctx, 278, 78, 6, '#F59E0B');

    // ---------------- BOX A: Avatar & Username (Left) ----------------
    const bxA = 40, byA = 115, bwA = 260, bhA = 330;
    drawCardBox(ctx, bxA, byA, bwA, bhA);

    const avCx = bxA + bwA / 2;
    const avCy = byA + 105;
    const avR = 68;

    // Avatar Frame Halo
    ctx.save();
    ctx.beginPath();
    ctx.arc(avCx, avCy, avR + 6, 0, Math.PI * 2);
    ctx.fillStyle = '#EEF2FF';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(avCx, avCy, avR + 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#C7D2FE';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Avatar Image or Fallback
    let avatarImg = null;
    if (o.avatarURL) {
        try { avatarImg = await loadImage(o.avatarURL); } catch (_) {}
    }

    ctx.beginPath();
    ctx.arc(avCx, avCy, avR, 0, Math.PI * 2);
    ctx.clip();
    if (avatarImg) {
        ctx.drawImage(avatarImg, avCx - avR, avCy - avR, avR * 2, avR * 2);
    } else {
        const ph = ctx.createLinearGradient(avCx - avR, avCy - avR, avCx + avR, avCy + avR);
        ph.addColorStop(0, '#4F46E5');
        ph.addColorStop(1, '#6366F1');
        ctx.fillStyle = ph;
        ctx.fillRect(avCx - avR, avCy - avR, avR * 2, avR * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `56px ${BOLD}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((clean(o.username)[0] || '?').toUpperCase(), avCx, avCy);
    }
    ctx.restore();

    // Mini Heart Sticker on top-right of avatar (100% Vector)
    ctx.save();
    ctx.beginPath();
    ctx.arc(avCx + 54, avCy - 48, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(239, 68, 68, 0.25)';
    ctx.shadowBlur = 8;
    ctx.fill();
    drawVectorHeart(ctx, avCx + 54, avCy - 48, 9, '#EF4444');
    ctx.restore();

    // Username Pill
    const unPillW = 190, unPillH = 38;
    const unPillX = bxA + (bwA - unPillW) / 2;
    const unPillY = byA + 205;

    ctx.save();
    roundRect(ctx, unPillX, unPillY, unPillW, unPillH, 19);
    const unGrad = ctx.createLinearGradient(unPillX, 0, unPillX + unPillW, 0);
    unGrad.addColorStop(0, '#4F46E5');
    unGrad.addColorStop(1, '#6366F1');
    ctx.fillStyle = unGrad;
    ctx.fill();

    const uNameText = clean(o.username) || 'Player';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `18px ${BOLD}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(uNameText.slice(0, 13), unPillX + unPillW / 2 - 8, unPillY + unPillH / 2);

    // Online Green Dot
    ctx.beginPath();
    ctx.arc(unPillX + unPillW - 20, unPillY + unPillH / 2, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#22C55E';
    ctx.fill();
    ctx.restore();

    // User ID Pill
    const idPillW = 210, idPillH = 34;
    const idPillX = bxA + (bwA - idPillW) / 2;
    const idPillY = byA + 260;

    ctx.save();
    roundRect(ctx, idPillX, idPillY, idPillW, idPillH, 12);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    roundRect(ctx, idPillX, idPillY, idPillW, idPillH, 12);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.stroke();

    const uIdText = String(o.userId || '765898304345079820');
    ctx.fillStyle = '#64748B';
    ctx.font = `13px ${SEMI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`ID: ${uIdText.slice(0, 18)}`, idPillX + idPillW / 2, idPillY + idPillH / 2);
    ctx.restore();

    // ---------------- BOX B: Member Information (Center) ----------------
    const bxB = 325, byB = 115, bwB = 410, bhB = 330;
    drawCardBox(ctx, bxB, byB, bwB, bhB);

    // Ribbon Header Pill
    const ribW = 240, ribH = 32;
    const ribX = bxB + (bwB - ribW) / 2;
    const ribY = byB + 16;

    ctx.save();
    roundRect(ctx, ribX, ribY, ribW, ribH, 10);
    const ribGrad = ctx.createLinearGradient(ribX, 0, ribX + ribW, 0);
    ribGrad.addColorStop(0, '#4338CA');
    ribGrad.addColorStop(1, '#6366F1');
    ctx.fillStyle = ribGrad;
    ctx.fill();

    // Small white accent dots around title
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(ribX + 22, ribY + ribH / 2, 2.5, 0, Math.PI * 2);
    ctx.arc(ribX + ribW - 22, ribY + ribH / 2, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `14px ${BOLD}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('INFORMASI MEMBER', ribX + ribW / 2, ribY + ribH / 2);
    ctx.restore();

    const xpTarget = Math.max(1, Math.floor(o.xpNeeded || 100));
    const curXp = Math.floor(o.xp || 0);

    const infoRows = [
        { iconBg: '#60A5FA', iconType: 'user', label: 'Join Discord', val: formatDate(o.createdDiscordAt) },
        { iconBg: '#818CF8', iconType: 'chat', label: 'Join Server', val: formatDate(o.joinedServerAt) },
        { iconBg: '#F87171', iconType: 'calendar', label: 'Member Since', val: formatDuration(o.joinedServerAt) },
        { iconBg: '#34D399', iconType: 'level', label: 'Level & EXP', val: `Lv. ${o.level || 1} (${compact(curXp)}/${compact(xpTarget)})` },
        { iconBg: '#A78BFA', iconType: 'crown', label: 'Special Role', val: clean(o.specialRole) || 'Member', valColor: '#7C3AED' }
    ];

    const rowStartY = byB + 74;
    infoRows.forEach((r, idx) => {
        const curY = rowStartY + idx * 48;

        // Icon rounded container
        ctx.save();
        roundRect(ctx, bxB + 24, curY - 14, 30, 30, 8);
        ctx.fillStyle = r.iconBg;
        ctx.fill();

        // 100% Vector Icon (no emoji!)
        drawInfoIcon(ctx, r.iconType, bxB + 39, curY + 1);
        ctx.restore();

        ctx.fillStyle = '#1E293B';
        ctx.font = `14px ${BOLD}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(r.label, bxB + 66, curY + 1);

        ctx.fillStyle = '#94A3B8';
        ctx.fillText(':', bxB + 195, curY + 1);

        ctx.fillStyle = r.valColor || '#334155';
        ctx.font = `14px ${SEMI}`;
        ctx.fillText(r.val.slice(0, 20), bxB + 215, curY + 1);
    });

    // ---------------- BOX C: Rank Role (Right) ----------------
    const bxC = 755, byC = 115, bwC = 285, bhC = 330;
    drawCardBox(ctx, bxC, byC, bwC, bhC);

    ctx.fillStyle = '#D97706';
    ctx.font = `16px ${BOLD}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawSparkle(ctx, bxC + 60, byC + 28, 6, '#F59E0B');
    ctx.fillText('RANK ROLE', bxC + bwC / 2, byC + 28);
    drawSparkle(ctx, bxC + bwC - 60, byC + 28, 6, '#F59E0B');

    const shCx = bxC + bwC / 2;
    const shCy = byC + 125;

    const rConfig = getRankColorConfig(o.rankTier || o.rankName || 'silver');

    // 1. Layered Feathered Wings
    drawFeatheredWings(ctx, shCx, shCy, rConfig.wings);

    // 2. Shield Emblem with Metallic Bevel & Faceted Star
    const sw = 48, sh = 56;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(shCx, shCy - sh);
    ctx.lineTo(shCx + sw, shCy - sh + 15);
    ctx.lineTo(shCx + sw, shCy + 15);
    ctx.bezierCurveTo(shCx + sw, shCy + 45, shCx, shCy + 65, shCx, shCy + 72);
    ctx.bezierCurveTo(shCx, shCy + 65, shCx - sw, shCy + 45, shCx - sw, shCy + 15);
    ctx.lineTo(shCx - sw, shCy - sh + 15);
    ctx.closePath();

    // Metallic shield gradient
    const shGrad = ctx.createLinearGradient(shCx - sw, shCy - sh, shCx + sw, shCy + 72);
    shGrad.addColorStop(0, rConfig.highlight);
    shGrad.addColorStop(0.3, rConfig.primary);
    shGrad.addColorStop(1, rConfig.dark);
    ctx.fillStyle = shGrad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 3D Faceted Star inside shield
    drawFacetedStar(ctx, shCx, shCy + 8, 21, '#FFFFFF', rConfig.light);
    ctx.restore();

    // 3. Folded 3D Ribbon Banner below shield
    const rbnW = 160, rbnH = 34;
    const rbnX = shCx - rbnW / 2;
    const rbnY = shCy + 45;

    ctx.save();
    // Left ribbon folded tail (behind)
    ctx.fillStyle = rConfig.ribbon;
    ctx.beginPath();
    ctx.moveTo(rbnX + 8, rbnY + 6);
    ctx.lineTo(rbnX - 18, rbnY + 6);
    ctx.lineTo(rbnX - 10, rbnY + rbnH / 2 + 6);
    ctx.lineTo(rbnX - 18, rbnY + rbnH + 6);
    ctx.lineTo(rbnX + 8, rbnY + rbnH + 6);
    ctx.closePath();
    ctx.fill();

    // Left fold shadow
    ctx.fillStyle = rConfig.dark;
    ctx.beginPath();
    ctx.moveTo(rbnX, rbnY + 6);
    ctx.lineTo(rbnX + 10, rbnY + rbnH);
    ctx.lineTo(rbnX, rbnY + rbnH);
    ctx.closePath();
    ctx.fill();

    // Right ribbon folded tail (behind)
    ctx.fillStyle = rConfig.ribbon;
    ctx.beginPath();
    ctx.moveTo(rbnX + rbnW - 8, rbnY + 6);
    ctx.lineTo(rbnX + rbnW + 18, rbnY + 6);
    ctx.lineTo(rbnX + rbnW + 10, rbnY + rbnH / 2 + 6);
    ctx.lineTo(rbnX + rbnW + 18, rbnY + rbnH + 6);
    ctx.lineTo(rbnX + rbnW - 8, rbnY + rbnH + 6);
    ctx.closePath();
    ctx.fill();

    // Right fold shadow
    ctx.fillStyle = rConfig.dark;
    ctx.beginPath();
    ctx.moveTo(rbnX + rbnW, rbnY + 6);
    ctx.lineTo(rbnX + rbnW - 10, rbnY + rbnH);
    ctx.lineTo(rbnX + rbnW, rbnY + rbnH);
    ctx.closePath();
    ctx.fill();

    // Ribbon front body
    roundRect(ctx, rbnX, rbnY, rbnW, rbnH, 8);
    const rbnGrad = ctx.createLinearGradient(rbnX, rbnY, rbnX, rbnY + rbnH);
    rbnGrad.addColorStop(0, rConfig.ribbon);
    rbnGrad.addColorStop(1, rConfig.dark);
    ctx.fillStyle = rbnGrad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    const rankLabel = clean(o.rankName) || rConfig.label;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `18px ${BOLD}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rankLabel.toUpperCase().slice(0, 14), shCx, rbnY + rbnH / 2 + 1);
    ctx.restore();

    // 4. Overall Score Pill
    const scPillW = 230, scPillH = 50;
    const scPillX = bxC + (bwC - scPillW) / 2;
    const scPillY = byC + 250;

    ctx.save();
    roundRect(ctx, scPillX, scPillY, scPillW, scPillH, 14);
    ctx.fillStyle = '#FFFBEB';
    ctx.fill();
    roundRect(ctx, scPillX, scPillY, scPillW, scPillH, 14);
    ctx.strokeStyle = '#FDE68A';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#B45309';
    ctx.font = `12px ${BOLD}`;
    ctx.textAlign = 'center';
    ctx.fillText('OVERALL SCORE', scPillX + scPillW / 2, scPillY + 18);

    const scoreNum = Math.floor(o.score || o.balance || 0);
    const scoreText = `${scoreNum.toLocaleString('id-ID')} Pts`;

    ctx.font = `17px ${BOLD}`;
    const txtW = ctx.measureText(scoreText).width;
    const totalW = 18 + 8 + txtW;
    const scStartX = scPillX + (scPillW - totalW) / 2;

    // Draw vector star instead of emoji ⭐
    drawVectorStar(ctx, scStartX + 9, scPillY + 36, 5, 8, 4, '#F59E0B');

    ctx.fillStyle = '#D97706';
    ctx.textAlign = 'left';
    ctx.fillText(scoreText, scStartX + 26, scPillY + 41);
    ctx.restore();

    // ---------------- BOX D: Badges Row (Bottom Strip) ----------------
    const bxD = 40, byD = 465, bwD = 1000, bhD = 90;
    drawCardBox(ctx, bxD, byD, bwD, bhD, 20);

    const bLblW = 160, bLblH = 46;
    const bLblX = bxD + 20;
    const bLblY = byD + (bhD - bLblH) / 2;

    ctx.save();
    roundRect(ctx, bLblX, bLblY, bLblW, bLblH, 14);
    const bLblGrad = ctx.createLinearGradient(bLblX, 0, bLblX + bLblW, 0);
    bLblGrad.addColorStop(0, '#4F46E5');
    bLblGrad.addColorStop(1, '#6366F1');
    ctx.fillStyle = bLblGrad;
    ctx.fill();

    // Draw vector trophy icon inside label button (no emoji!)
    drawVectorTrophy(ctx, bLblX + 26, bLblY + bLblH / 2, 18, '#FDE047');

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `16px ${BOLD}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('BADGES', bLblX + 44, bLblY + bLblH / 2);
    drawSparkle(ctx, bLblX + bLblW - 20, bLblY + bLblH / 2, 5, '#FDE047');
    ctx.restore();

    // 6 Distinct Vector Badges
    const badgeSlots = [
        { bg: '#FEF3C7', border: '#F59E0B', render: drawBadgeCrown },
        { bg: '#E0E7FF', border: '#6366F1', render: drawBadgeDiamond },
        { bg: '#CCFBF1', border: '#14B8A6', render: drawBadgeChat },
        { bg: '#FFE4E6', border: '#F43F5E', render: drawBadgeHeart },
        { bg: '#DBEAFE', border: '#3B82F6', render: drawBadgeShield },
        { bg: '#FEF9C3', border: '#EAB308', render: drawBadgeTrophy }
    ];

    const badgeStartX = bLblX + bLblW + 45;
    const badgeGap = (bwD - (badgeStartX - bxD) - 40) / badgeSlots.length;

    badgeSlots.forEach((b, i) => {
        const cx = badgeStartX + i * badgeGap + 30;
        const cy = byD + bhD / 2;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 27, 0, Math.PI * 2);
        ctx.fillStyle = b.bg;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.06)';
        ctx.shadowBlur = 8;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, 27, 0, Math.PI * 2);
        ctx.strokeStyle = b.border;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Render vector badge graphic
        b.render(ctx, cx, cy);
        ctx.restore();
    });

    return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard };
