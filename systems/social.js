// systems/social.js — Fun social commands: /ship, /marry, /divorce
//
// /ship @a [@b]  → canvas card with 2 avatars + love %, deterministic per pair
// /marry @user   → propose marriage (accept/decline buttons)
// /divorce       → end current marriage
//
// Marriage stored in `marriages` table (per guild).

const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { db } = require('../database');
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

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS marriages (
    guildId TEXT,
    user1 TEXT,
    user2 TEXT,
    since INTEGER,
    PRIMARY KEY (guildId, user1, user2)
)`);

function getMarriage(guildId, userId) {
    return db.prepare('SELECT * FROM marriages WHERE guildId = ? AND (user1 = ? OR user2 = ?)').get(guildId, userId, userId);
}
function createMarriage(guildId, a, b) {
    db.prepare('INSERT OR REPLACE INTO marriages (guildId, user1, user2, since) VALUES (?, ?, ?, ?)').run(guildId, a, b, Date.now());
}
function removeMarriage(guildId, userId) {
    db.prepare('DELETE FROM marriages WHERE guildId = ? AND (user1 = ? OR user2 = ?)').run(guildId, userId, userId);
}

// ==================== LOVE % (deterministic per pair) ====================
function loveScore(idA, idB) {
    const pair = [String(idA), String(idB)].sort().join('-');
    let hash = 0;
    for (let i = 0; i < pair.length; i++) {
        hash = (hash * 31 + pair.charCodeAt(i)) >>> 0;
    }
    return hash % 101; // 0..100
}

function loveComment(pct) {
    if (pct >= 90) return '💞 Soulmate! Jodoh dunia akhirat!';
    if (pct >= 75) return '💖 Cinta sejati, lanjutkan!';
    if (pct >= 50) return '💗 Ada potensi nih, usaha dikit lagi!';
    if (pct >= 30) return '💛 Hmm, masih ragu-ragu...';
    if (pct >= 10) return '💔 Kayaknya cuma temenan deh.';
    return '🥶 Zonk! Mending cari yang lain.';
}

// Combine two names into a "ship name"
function shipName(a, b) {
    const x = a.slice(0, Math.ceil(a.length / 2));
    const y = b.slice(Math.floor(b.length / 2));
    return (x + y).replace(/\s+/g, '');
}

// ==================== CANVAS: SHIP CARD ====================
async function drawCircleAvatar(ctx, url, cx, cy, r, ringColor = '#ff5e8a') {
    // Outer glow
    ctx.save();
    ctx.shadowColor = ringColor;
    ctx.shadowBlur = 35;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = ringColor;
    ctx.fill();
    ctx.restore();

    // Pink ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.closePath();
    const ringGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    ringGrad.addColorStop(0, '#ff8fb0');
    ringGrad.addColorStop(1, '#ff2d6f');
    ctx.fillStyle = ringGrad;
    ctx.fill();
    ctx.restore();

    // White gap
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.restore();

    // Avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    try {
        const img = await loadImage(url);
        ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    } catch (_) {
        ctx.fillStyle = '#2b2d31';
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
}

// Scatter decorative hearts in the background
function drawBgHearts(ctx, W, H) {
    const spots = [
        [80, 60, 16, 0.06], [W - 90, 80, 22, 0.07], [W / 2 - 200, 70, 12, 0.05],
        [60, H - 90, 18, 0.06], [W - 70, H - 70, 14, 0.05], [W / 2 + 220, H - 100, 20, 0.06],
        [W / 2, 40, 10, 0.05], [120, H / 2 + 60, 12, 0.04], [W - 130, H / 2, 16, 0.05],
    ];
    for (const [x, y, s, a] of spots) {
        ctx.globalAlpha = a;
        drawHeart(ctx, x, y, s, '#ffffff');
    }
    ctx.globalAlpha = 1;
}

async function generateShipCard({ nameA, avatarA, nameB, avatarB, pct, theme = 'dark' }) {
    const W = 860, H = 460;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Theme colors
    const THEMES = {
        dark: { bg: ['#1a0420', '#5c1242', '#8e1538'], glow: 'rgba(255, 90, 138, 0.40)', bar: ['#ffc2d6', '#ff5e8a', '#ff2d6f'], text: '#FFFFFF', heart: '#ff2d6f' },
        pink: { bg: ['#ffe0ec', '#ffb3d1', '#ff85b5'], glow: 'rgba(255, 60, 100, 0.25)', bar: ['#ff6b9d', '#ff3b7a', '#e91e63'], text: '#4a0e2b', heart: '#e91e63' },
        light: { bg: ['#f8f9fa', '#e9ecef', '#dee2e6'], glow: 'rgba(255, 80, 120, 0.20)', bar: ['#ff8fa3', '#ff5577', '#e63946'], text: '#212529', heart: '#e63946' },
    };
    const t = THEMES[theme] || THEMES.dark;

    // Romantic gradient background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, t.bg[0]);
    bg.addColorStop(0.5, t.bg[1]);
    bg.addColorStop(1, t.bg[2]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Decorative scattered hearts
    drawBgHearts(ctx, W, H);

    // Center radial glow
    const glow = ctx.createRadialGradient(W / 2, 175, 0, W / 2, 175, 260);
    glow.addColorStop(0, t.glow);
    glow.addColorStop(1, 'rgba(255, 90, 138, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.textAlign = 'center';
    ctx.fillStyle = theme === 'dark' ? 'rgba(255,255,255,0.92)' : t.text;
    ctx.font = `bold 30px ${HEAD_FONT}`;
    ctx.fillText('LOVE CALCULATOR', W / 2, 52);

    // Avatars
    const r = 100;
    const ay = 185;
    await drawCircleAvatar(ctx, avatarA, 175, ay, r);
    await drawCircleAvatar(ctx, avatarB, W - 175, ay, r);

    // Heart in center (sized slightly by score) with strong glow
    const heartSize = 60 + Math.round(pct / 100 * 20);
    drawHeart(ctx, W / 2, ay - 5, heartSize, t.heart);

    // Names in pills under avatars
    drawNamePill(ctx, truncate(nameA, 14), 175, ay + r + 40);
    drawNamePill(ctx, truncate(nameB, 14), W - 175, ay + r + 40);

    // Percentage (big, glowing)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255, 45, 111, 0.8)';
    ctx.shadowBlur = 25;
    ctx.fillStyle = t.text;
    ctx.font = `bold 72px ${HEAD_FONT}`;
    ctx.fillText(`${pct}%`, W / 2, 360);
    ctx.restore();

    // Progress bar
    const barW = 660, barH = 30, barX = (W - barW) / 2, barY = 380;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, barX, barY, barW, barH, 15);
    ctx.fill();
    const fillW = Math.max(barH, (barW * pct) / 100);
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, t.bar[0]);
    grad.addColorStop(0.5, t.bar[1]);
    grad.addColorStop(1, t.bar[2]);
    ctx.save();
    ctx.shadowColor = 'rgba(255, 45, 111, 0.6)';
    ctx.shadowBlur = 15;
    ctx.fillStyle = grad;
    roundRect(ctx, barX, barY, fillW, barH, 15);
    ctx.fill();
    ctx.restore();

    // Comment
    ctx.textAlign = 'center';
    ctx.font = `22px ${SUB_FONT}`;
    ctx.fillStyle = theme === 'dark' ? 'rgba(255,255,255,0.95)' : t.text;
    ctx.fillText(sanitize(loveComment(pct)), W / 2, 440);

    return canvas.toBuffer('image/png');
}

// Name pill under avatar
function drawNamePill(ctx, name, cx, y) {
    ctx.font = `bold 22px ${SUB_FONT}`;
    const tw = ctx.measureText(name).width;
    const padX = 18, h = 38, w = tw + padX * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, cx - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, cx, y);
    ctx.textBaseline = 'alphabetic';
}

function drawHeart(ctx, cx, cy, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    const s = size / 16;
    ctx.moveTo(cx, cy + 4 * s);
    ctx.bezierCurveTo(cx, cy + 1 * s, cx - 2 * s, cy - 5 * s, cx - 8 * s, cy - 5 * s);
    ctx.bezierCurveTo(cx - 16 * s, cy - 5 * s, cx - 16 * s, cy + 5 * s, cx - 16 * s, cy + 5 * s);
    ctx.bezierCurveTo(cx - 16 * s, cy + 11 * s, cx - 8 * s, cy + 16 * s, cx, cy + 22 * s);
    ctx.bezierCurveTo(cx + 8 * s, cy + 16 * s, cx + 16 * s, cy + 11 * s, cx + 16 * s, cy + 5 * s);
    ctx.bezierCurveTo(cx + 16 * s, cy + 5 * s, cx + 16 * s, cy - 5 * s, cx + 8 * s, cy - 5 * s);
    ctx.bezierCurveTo(cx + 2 * s, cy - 5 * s, cx, cy + 1 * s, cx, cy + 4 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

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
function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function sanitize(s) { return String(s || '').replace(/[^\x20-\x7E\u00A0-\u024F]/g, '').trim() || ''; }

// ==================== /ship HANDLER ====================
async function handleShipCommand(interaction) {
    const userA = interaction.options.getUser('user1', true);
    const userB = interaction.options.getUser('user2') || interaction.user;
    const theme = interaction.options.getString('tema') || 'dark';

    if (userA.id === userB.id) {
        return interaction.reply({ content: '❌ Gak bisa ship orang yang sama! Pilih 2 orang berbeda.', ephemeral: true });
    }

    await interaction.deferReply();

    const pct = loveScore(userA.id, userB.id);
    const nameA = userA.username;
    const nameB = userB.username;

    let buffer = null;
    try {
        buffer = await generateShipCard({
            nameA, avatarA: userA.displayAvatarURL({ extension: 'png', size: 256 }),
            nameB, avatarB: userB.displayAvatarURL({ extension: 'png', size: 256 }),
            pct, theme,
        });
    } catch (e) {
        log('WARN', `[social] ship canvas failed: ${e.message}`);
    }

    const ship = shipName(nameA, nameB);
    const embed = new EmbedBuilder()
        .setColor('#ff3b6b')
        .setTitle('💘 Love Calculator')
        .setDescription(`**${nameA}** 💕 **${nameB}**\n\n🚢 Ship name: **${ship}**\n${loveComment(pct)}`)
        .setTimestamp();

    const files = [];
    if (buffer) {
        files.push(new AttachmentBuilder(buffer, { name: 'ship.png' }));
        embed.setImage('attachment://ship.png');
    }

    return interaction.editReply({ embeds: [embed], files });
}

// ==================== /marry HANDLER ====================
async function handleMarryCommand(interaction) {
    const guildId = interaction.guild.id;
    const proposer = interaction.user;
    const target = interaction.options.getUser('user', true);

    if (target.id === proposer.id) return interaction.reply({ content: '❌ Gak bisa nikah sama diri sendiri! 😅', ephemeral: true });
    if (target.bot) return interaction.reply({ content: '❌ Gak bisa nikah sama bot! 🤖', ephemeral: true });

    const proposerMarriage = getMarriage(guildId, proposer.id);
    if (proposerMarriage) {
        const partner = proposerMarriage.user1 === proposer.id ? proposerMarriage.user2 : proposerMarriage.user1;
        return interaction.reply({ content: `❌ Kamu sudah menikah dengan <@${partner}>! Pakai \`/divorce\` dulu.`, ephemeral: true });
    }
    const targetMarriage = getMarriage(guildId, target.id);
    if (targetMarriage) return interaction.reply({ content: `❌ <@${target.id}> sudah menikah dengan orang lain.`, ephemeral: true });

    const embed = new EmbedBuilder()
        .setColor('#ff3b6b')
        .setTitle('💍 Lamaran Pernikahan!')
        .setDescription(`<@${target.id}>, **${proposer.username}** melamarmu! 💖\n\nApakah kamu menerima? (60 detik)`)
        .setThumbnail(proposer.displayAvatarURL({ size: 128 }))
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`marry_accept_${proposer.id}_${target.id}`).setLabel('💍 Terima').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`marry_decline_${proposer.id}_${target.id}`).setLabel('💔 Tolak').setStyle(ButtonStyle.Danger),
    );

    return interaction.reply({ content: `<@${target.id}>`, embeds: [embed], components: [row] });
}

async function handleMarryButton(interaction) {
    const parts = interaction.customId.split('_'); // marry_accept_<proposer>_<target>
    const action = parts[1];
    const proposerId = parts[2];
    const targetId = parts[3];
    const guildId = interaction.guild.id;

    // Only the target can respond
    if (interaction.user.id !== targetId) {
        return interaction.reply({ content: '❌ Lamaran ini bukan untukmu!', ephemeral: true });
    }

    if (action === 'decline') {
        const embed = new EmbedBuilder().setColor('#95A5A6').setTitle('💔 Lamaran Ditolak')
            .setDescription(`<@${targetId}> menolak lamaran dari <@${proposerId}>. 😢`);
        return interaction.update({ content: '', embeds: [embed], components: [] });
    }

    // accept — re-check both still single
    if (getMarriage(guildId, proposerId) || getMarriage(guildId, targetId)) {
        return interaction.update({ content: '❌ Salah satu sudah menikah sebelum lamaran diterima.', embeds: [], components: [] });
    }

    createMarriage(guildId, proposerId, targetId);
    const embed = new EmbedBuilder()
        .setColor('#ff3b6b')
        .setTitle('💞 Selamat! Kalian Resmi Menikah!')
        .setDescription(`<@${proposerId}> 💍 <@${targetId}>\n\nSemoga langgeng selamanya! 🎉💕`)
        .setTimestamp();
    return interaction.update({ content: '', embeds: [embed], components: [] });
}

// ==================== /divorce HANDLER ====================
async function handleDivorceCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const marriage = getMarriage(guildId, userId);
    if (!marriage) return interaction.reply({ content: '❌ Kamu belum menikah dengan siapa pun.', ephemeral: true });

    const partner = marriage.user1 === userId ? marriage.user2 : marriage.user1;
    removeMarriage(guildId, userId);
    const embed = new EmbedBuilder()
        .setColor('#95A5A6')
        .setTitle('💔 Perceraian')
        .setDescription(`<@${userId}> dan <@${partner}> telah bercerai. 😔\n\nSemoga menemukan yang lebih baik.`)
        .setTimestamp();
    return interaction.reply({ embeds: [embed] });
}

function isMarryButton(customId) {
    return typeof customId === 'string' && customId.startsWith('marry_');
}

module.exports = {
    handleShipCommand,
    handleMarryCommand,
    handleMarryButton,
    handleDivorceCommand,
    isMarryButton,
    getMarriage,
    loveScore,
};
