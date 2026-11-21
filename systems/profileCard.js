// systems/profileCard.js — Member Card Canvas Generator (1080x580)
// High-fidelity Discord Community Member Card with Avatar, Profile Info,
// Dynamic Winged Rank Shield, and Badges Showcase.
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
    if (key.includes('bronze')) return { primary: '#CD7F32', dark: '#8C501E', ribbon: '#B45309', label: 'BRONZE' };
    if (key.includes('gold')) return { primary: '#F59E0B', dark: '#B45309', ribbon: '#D97706', label: 'GOLD' };
    if (key.includes('platinum')) return { primary: '#38BDF8', dark: '#0284C7', ribbon: '#0284C7', label: 'PLATINUM' };
    if (key.includes('diamond')) return { primary: '#06B6D4', dark: '#0891B2', ribbon: '#0284C7', label: 'DIAMOND' };
    if (key.includes('master')) return { primary: '#A855F7', dark: '#7E22CE', ribbon: '#7E22CE', label: 'MASTER' };
    if (key.includes('grandmaster')) return { primary: '#F97316', dark: '#C2410C', ribbon: '#EA580C', label: 'GRANDMASTER' };
    if (key.includes('mythic')) return { primary: '#EC4899', dark: '#BE185D', ribbon: '#DB2777', label: 'MYTHIC' };
    if (key.includes('legend')) return { primary: '#EAB308', dark: '#A16207', ribbon: '#CA8A04', label: 'LEGEND' };
    if (key.includes('immortal')) return { primary: '#EF4444', dark: '#B91C1C', ribbon: '#DC2626', label: 'IMMORTAL' };
    return { primary: '#CBD5E1', dark: '#64748B', ribbon: '#2563EB', label: 'SILVER' };
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
    ctx.save();
    ctx.beginPath();
    ctx.arc(80, 58, 38, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(79, 70, 229, 0.2)';
    ctx.shadowBlur = 12;
    ctx.fill();

    const logoGrad = ctx.createLinearGradient(50, 30, 110, 90);
    logoGrad.addColorStop(0, '#6366F1');
    logoGrad.addColorStop(1, '#3B82F6');
    ctx.beginPath();
    ctx.arc(80, 58, 32, 0, Math.PI * 2);
    ctx.fillStyle = logoGrad;
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `28px ${BOLD}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎲', 80, 60);
    ctx.restore();

    // Header Text
    const sName = clean(o.footerTag) || 'ID Community';
    ctx.fillStyle = '#1E1B4B';
    ctx.font = `34px ${BOLD}`;
    ctx.textAlign = 'left';
    ctx.fillText(sName, 135, 52);

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

    // Mini Heart Sticker on top-right of avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(avCx + 54, avCy - 48, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(239, 68, 68, 0.25)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❤️', avCx + 54, avCy - 47);
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

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `14px ${BOLD}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('•  INFORMASI MEMBER  •', ribX + ribW / 2, ribY + ribH / 2);
    ctx.restore();

    const xpTarget = Math.max(1, Math.floor(o.xpNeeded || 100));
    const curXp = Math.floor(o.xp || 0);

    const infoRows = [
        { iconBg: '#60A5FA', icon: '👤', label: 'Join Discord', val: formatDate(o.createdDiscordAt) },
        { iconBg: '#818CF8', icon: '💬', label: 'Join Server', val: formatDate(o.joinedServerAt) },
        { iconBg: '#F87171', icon: '📅', label: 'Member Since', val: formatDuration(o.joinedServerAt) },
        { iconBg: '#34D399', icon: '⭐', label: 'Level & EXP', val: `Lv. ${o.level || 1} (${compact(curXp)}/${compact(xpTarget)})` },
        { iconBg: '#A78BFA', icon: '👑', label: 'Special Role', val: clean(o.specialRole) || 'Member', valColor: '#7C3AED' }
    ];

    const rowStartY = byB + 74;
    infoRows.forEach((r, idx) => {
        const curY = rowStartY + idx * 48;

        ctx.save();
        roundRect(ctx, bxB + 24, curY - 14, 30, 30, 8);
        ctx.fillStyle = r.iconBg;
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(r.icon, bxB + 39, curY + 1);
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

    // Winged Emblem
    ctx.save();
    ctx.fillStyle = '#E2E8F0';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;

    // Left Wing
    ctx.beginPath();
    ctx.moveTo(shCx - 38, shCy);
    ctx.bezierCurveTo(shCx - 75, shCy - 35, shCx - 105, shCy - 10, shCx - 95, shCy + 25);
    ctx.bezierCurveTo(shCx - 85, shCy + 45, shCx - 55, shCy + 30, shCx - 38, shCy + 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right Wing
    ctx.beginPath();
    ctx.moveTo(shCx + 38, shCy);
    ctx.bezierCurveTo(shCx + 75, shCy - 35, shCx + 105, shCy - 10, shCx + 95, shCy + 25);
    ctx.bezierCurveTo(shCx + 85, shCy + 45, shCx + 55, shCy + 30, shCx + 38, shCy + 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Shield Emblem with Dynamic Rank Color
    const rConfig = getRankColorConfig(o.rankTier || o.rankName || 'silver');
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

    const shGrad = ctx.createLinearGradient(shCx - sw, shCy - sh, shCx + sw, shCy + 72);
    shGrad.addColorStop(0, rConfig.primary);
    shGrad.addColorStop(1, rConfig.dark);
    ctx.fillStyle = shGrad;
    ctx.fill();
    ctx.strokeStyle = '#F8FAFC';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Star inside shield
    drawSparkle(ctx, shCx, shCy + 8, 20, '#FFFFFF');
    ctx.restore();

    // Rank Banner Ribbon below shield
    const rbnW = 160, rbnH = 34;
    const rbnX = shCx - rbnW / 2;
    const rbnY = shCy + 45;

    ctx.save();
    roundRect(ctx, rbnX, rbnY, rbnW, rbnH, 8);
    ctx.fillStyle = rConfig.ribbon;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 10;
    ctx.fill();

    const rankLabel = clean(o.rankName) || rConfig.label;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `18px ${BOLD}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rankLabel.toUpperCase().slice(0, 14), shCx, rbnY + rbnH / 2 + 1);
    ctx.restore();

    // Score / Streak Pill
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
    ctx.fillStyle = '#D97706';
    ctx.font = `17px ${BOLD}`;
    ctx.fillText(`⭐ ${scoreNum.toLocaleString('id-ID')} Pts`, scPillX + scPillW / 2, scPillY + 38);
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

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `16px ${BOLD}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏆  BADGES ✦', bLblX + bLblW / 2, bLblY + bLblH / 2);
    ctx.restore();

    const badgeIcons = [
        { bg: '#FEF3C7', border: '#F59E0B', icon: '👑' },
        { bg: '#E0E7FF', border: '#6366F1', icon: '💎' },
        { bg: '#CCFBF1', border: '#14B8A6', icon: '💬' },
        { bg: '#FFE4E6', border: '#F43F5E', icon: '💖' },
        { bg: '#DBEAFE', border: '#3B82F6', icon: '🛡️' },
        { bg: '#FEF9C3', border: '#EAB308', icon: '🏆' }
    ];

    const badgeStartX = bLblX + bLblW + 45;
    const badgeGap = (bwD - (badgeStartX - bxD) - 40) / badgeIcons.length;

    badgeIcons.forEach((b, i) => {
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

        ctx.font = '26px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.icon, cx, cy + 2);
        ctx.restore();
    });

    return canvas.toBuffer('image/png');
}

module.exports = { generateProfileCard };
