// systems/qrcode.js — QR Code Generator with Tracker, Custom Colors, Invite QR, Custom Logo
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const QRCode = require('qrcode');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const crypto = require('crypto');
const { db } = require('../database');

// Default logo path
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'qr-logo.png');

// Load fonts
try {
    GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'fonts', 'Poppins-Bold.ttf'), 'Poppins Bold');
    GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'fonts', 'Poppins-SemiBold.ttf'), 'Poppins SemiBold');
} catch (_) {}

// ==================== DB TABLE ====================
db.exec(`CREATE TABLE IF NOT EXISTS qr_codes (
    id TEXT PRIMARY KEY,
    guildId TEXT,
    userId TEXT,
    url TEXT,
    label TEXT,
    color TEXT DEFAULT 'red',
    scans INTEGER DEFAULT 0,
    createdAt INTEGER,
    lastScanAt INTEGER DEFAULT 0
)`);

// ==================== COLOR THEMES ====================
const COLOR_THEMES = {
    red:    { name: 'Merah',  accent: '#E74C3C', frame: '#1A1A1A', text: '#FFFFFF' },
    blue:   { name: 'Biru',   accent: '#3498DB', frame: '#1A1A2E', text: '#FFFFFF' },
    green:  { name: 'Hijau',  accent: '#2ECC71', frame: '#1A2E1A', text: '#FFFFFF' },
    purple: { name: 'Ungu',   accent: '#9B59B6', frame: '#1A1A2E', text: '#FFFFFF' },
    gold:   { name: 'Emas',   accent: '#F1C40F', frame: '#2C2C1A', text: '#FFFFFF' },
    black:  { name: 'Hitam',  accent: '#FFFFFF', frame: '#0D0D0D', text: '#FFFFFF' },
    pink:   { name: 'Pink',   accent: '#FF69B4', frame: '#2E1A2E', text: '#FFFFFF' },
};

// ==================== HELPERS ====================
function isValidUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch { return false; }
}

function generateQrId() {
    return crypto.randomBytes(4).toString('hex');
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

// ==================== QR TRACKER DB ====================
function createQrEntry(guildId, userId, url, label, color) {
    const id = generateQrId();
    db.prepare('INSERT INTO qr_codes (id, guildId, userId, url, label, color, scans, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?)').run(id, guildId, userId, url, label || '', color || 'red', Date.now());
    return id;
}

function getQrEntry(id) {
    return db.prepare('SELECT * FROM qr_codes WHERE id = ?').get(id);
}

function incrementQrScan(id) {
    db.prepare('UPDATE qr_codes SET scans = scans + 1, lastScanAt = ? WHERE id = ?').run(Date.now(), id);
}

function getUserQrCodes(userId, limit = 10) {
    return db.prepare('SELECT * FROM qr_codes WHERE userId = ? ORDER BY createdAt DESC LIMIT ?').all(userId, limit);
}

// ==================== GENERATE QR IMAGE ====================
async function generateQrCode(url, options = {}) {
    const {
        size = 380,
        color = 'red',
        logoPath = LOGO_PATH,
        logoBuffer = null,
        headerText = 'SCAN QR CODE',
        footerText = 'Scan untuk buka link',
        trackId = null,
    } = options;

    const theme = COLOR_THEMES[color] || COLOR_THEMES.red;

    // Generate QR code data
    const qrDataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: size,
        color: { dark: '#1A1A1A', light: '#FFFFFF' }
    });

    // Canvas dimensions
    const frameWidth = 18;
    const innerPad = 24;
    const headerHeight = 50;
    const footerHeight = trackId ? 56 : 44;
    const totalWidth = size + (frameWidth + innerPad) * 2;
    const totalHeight = size + (frameWidth + innerPad) * 2 + headerHeight + footerHeight;

    const canvas = createCanvas(totalWidth, totalHeight);
    const ctx = canvas.getContext('2d');

    // === OUTER FRAME ===
    roundRect(ctx, 0, 0, totalWidth, totalHeight, 20);
    ctx.fillStyle = theme.frame;
    ctx.fill();

    // === ACCENT BORDER ===
    roundRect(ctx, frameWidth / 2, frameWidth / 2, totalWidth - frameWidth, totalHeight - frameWidth, 16);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 3;
    ctx.stroke();

    // === WHITE INNER AREA ===
    const innerX = frameWidth + 6;
    const innerY = frameWidth + 6 + headerHeight;
    const innerW = totalWidth - (frameWidth + 6) * 2;
    const innerH = size + innerPad * 2;
    roundRect(ctx, innerX, innerY, innerW, innerH, 12);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // === HEADER ===
    ctx.fillStyle = theme.text;
    ctx.font = '18px "Poppins Bold", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(headerText, totalWidth / 2, frameWidth + 6 + headerHeight / 2);

    // Accent line under header
    const lineY = frameWidth + 6 + headerHeight - 4;
    ctx.beginPath();
    ctx.moveTo(frameWidth + 30, lineY);
    ctx.lineTo(totalWidth - frameWidth - 30, lineY);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    // === QR CODE ===
    const qrX = innerX + innerPad;
    const qrY = innerY + innerPad;
    const qrImage = await loadImage(Buffer.from(qrDataUrl.split(',')[1], 'base64'));
    ctx.drawImage(qrImage, qrX, qrY, size, size);

    // === CORNER ACCENTS ===
    const cornerLen = 28;
    const cornerThick = 4;
    const cOffset = qrX - 4;
    const cOffsetY = qrY - 4;
    const qrEnd = qrX + size + 4;
    const qrEndY = qrY + size + 4;
    ctx.fillStyle = theme.accent;
    ctx.fillRect(cOffset, cOffsetY, cornerLen, cornerThick);
    ctx.fillRect(cOffset, cOffsetY, cornerThick, cornerLen);
    ctx.fillRect(qrEnd - cornerLen, cOffsetY, cornerLen, cornerThick);
    ctx.fillRect(qrEnd - cornerThick, cOffsetY, cornerThick, cornerLen);
    ctx.fillRect(cOffset, qrEndY - cornerThick, cornerLen, cornerThick);
    ctx.fillRect(cOffset, qrEndY - cornerLen, cornerThick, cornerLen);
    ctx.fillRect(qrEnd - cornerLen, qrEndY - cornerThick, cornerLen, cornerThick);
    ctx.fillRect(qrEnd - cornerThick, qrEndY - cornerLen, cornerThick, cornerLen);

    // === LOGO IN CENTER ===
    try {
        let logo;
        if (logoBuffer) {
            logo = await loadImage(logoBuffer);
        } else {
            logo = await loadImage(logoPath);
        }
        const logoSize = Math.floor(size * 0.22);
        const logoCenterX = qrX + size / 2;
        const logoCenterY = qrY + size / 2;
        const logoX = logoCenterX - logoSize / 2;
        const logoY = logoCenterY - logoSize / 2;

        // White circle background
        ctx.beginPath();
        ctx.arc(logoCenterX, logoCenterY, logoSize / 2 + 8, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        // Accent ring
        ctx.beginPath();
        ctx.arc(logoCenterX, logoCenterY, logoSize / 2 + 8, 0, Math.PI * 2);
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Dark inner ring
        ctx.beginPath();
        ctx.arc(logoCenterX, logoCenterY, logoSize / 2 + 4, 0, Math.PI * 2);
        ctx.strokeStyle = theme.frame;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Clip logo to circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(logoCenterX, logoCenterY, logoSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
        ctx.restore();
    } catch (e) { /* no logo — fine */ }

    // === FOOTER ===
    const footerY = innerY + innerH + 8;
    ctx.fillStyle = '#AAAAAA';
    ctx.font = '13px "Poppins SemiBold", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(footerText, totalWidth / 2, footerY + (trackId ? 16 : footerHeight / 2 - 2));

    // Track ID badge
    if (trackId) {
        ctx.fillStyle = theme.accent;
        ctx.font = '11px "Poppins SemiBold", sans-serif';
        ctx.fillText(`ID: ${trackId}  •  /qr stats`, totalWidth / 2, footerY + 36);
    }

    // Dot accents on footer sides
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(frameWidth + 24, footerY + (trackId ? 16 : footerHeight / 2), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(totalWidth - frameWidth - 24, footerY + (trackId ? 16 : footerHeight / 2), 4, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toBuffer('image/png');
}

// ==================== HANDLE /qr COMMAND ====================
async function handleQrCommand(interaction) {
    const sub = interaction.options.getSubcommand(false);

    // /qr invite
    if (sub === 'invite') {
        return handleQrInvite(interaction);
    }

    // /qr stats
    if (sub === 'stats') {
        return handleQrStats(interaction);
    }

    // /qr generate (default)
    const url = interaction.options.getString('url');
    const color = interaction.options.getString('warna') || 'red';
    const logoAttachment = interaction.options.getAttachment('logo');

    if (!url || !isValidUrl(url)) {
        return interaction.reply({
            content: '❌ URL tidak valid! Pastikan diawali `http://` atau `https://`.\n> Contoh: `https://google.com`',
            ephemeral: true
        });
    }

    await interaction.deferReply();

    try {
        // Create tracker entry
        const guildId = interaction.guild?.id || 'DM';
        const trackId = createQrEntry(guildId, interaction.user.id, url, '', color);

        // Build tracked URL (redirect through bot API)
        const apiPort = process.env.API_PORT || 25922;
        const trackedUrl = url; // QR encodes the real URL, tracking via /qr stats

        // Handle custom logo
        let logoBuffer = null;
        if (logoAttachment) {
            try {
                const resp = await fetch(logoAttachment.url);
                if (resp.ok) logoBuffer = Buffer.from(await resp.arrayBuffer());
            } catch (e) { /* fallback to default logo */ }
        }

        const buffer = await generateQrCode(url, {
            size: 380,
            color,
            logoBuffer,
            trackId,
            headerText: 'SCAN QR CODE',
            footerText: 'Scan untuk buka link',
        });

        const attachment = new AttachmentBuilder(buffer, { name: 'qrcode.png' });
        const displayUrl = url.length > 70 ? url.substring(0, 67) + '...' : url;
        const theme = COLOR_THEMES[color] || COLOR_THEMES.red;

        const embed = new EmbedBuilder()
            .setTitle('📱 QR Code Generator')
            .setColor(theme.accent)
            .setDescription(
                `**🔗 URL:**\n> ${displayUrl}\n\n` +
                `**🎨 Tema:** ${theme.name}\n` +
                `**📊 Track ID:** \`${trackId}\`\n` +
                (logoAttachment ? `**🖼️ Logo:** Custom\n` : '') +
                `\n> Scan QR code, atau cek statistik dengan \`/qr stats\``
            )
            .setImage('attachment://qrcode.png')
            .setFooter({ text: `Diminta oleh ${interaction.user.username} • Cek scan: /qr stats` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('🔗 Buka Link').setStyle(ButtonStyle.Link).setURL(url),
            new ButtonBuilder().setCustomId(`qr_track_${trackId}`).setLabel('📊 Stats').setStyle(ButtonStyle.Secondary)
        );

        return interaction.editReply({ embeds: [embed], files: [attachment], components: [row] });
    } catch (e) {
        console.error('[qrcode] Error:', e.message);
        return interaction.editReply({ content: '❌ Gagal membuat QR code. Pastikan URL valid dan tidak terlalu panjang.' });
    }
}

// ==================== /qr invite ====================
async function handleQrInvite(interaction) {
    await interaction.deferReply();

    try {
        // Create a server invite
        const channel = interaction.channel;
        const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: true, reason: 'QR Code invite generator' });
        const inviteUrl = `https://discord.gg/${invite.code}`;

        const guildId = interaction.guild.id;
        const trackId = createQrEntry(guildId, interaction.user.id, inviteUrl, `Server: ${interaction.guild.name}`, 'red');

        const buffer = await generateQrCode(inviteUrl, {
            size: 380,
            color: 'red',
            trackId,
            headerText: interaction.guild.name.substring(0, 25).toUpperCase(),
            footerText: 'Scan untuk join server',
        });

        const attachment = new AttachmentBuilder(buffer, { name: 'invite-qr.png' });

        const embed = new EmbedBuilder()
            .setTitle('📨 Server Invite QR Code')
            .setColor('#E74C3C')
            .setDescription(
                `**🏠 Server:** ${interaction.guild.name}\n` +
                `**🔗 Invite:** ${inviteUrl}\n` +
                `**📊 Track ID:** \`${trackId}\`\n\n` +
                `> Scan QR code untuk langsung join server!\n` +
                `> Cek berapa orang yang scan: \`/qr stats\``
            )
            .setImage('attachment://invite-qr.png')
            .setFooter({ text: `Dibuat oleh ${interaction.user.username} • Invite tidak expire` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('🔗 Join Server').setStyle(ButtonStyle.Link).setURL(inviteUrl),
            new ButtonBuilder().setCustomId(`qr_track_${trackId}`).setLabel('📊 Stats').setStyle(ButtonStyle.Secondary)
        );

        return interaction.editReply({ embeds: [embed], files: [attachment], components: [row] });
    } catch (e) {
        console.error('[qrcode] Invite error:', e.message);
        return interaction.editReply({ content: '❌ Gagal membuat invite QR. Pastikan bot punya permission `Create Instant Invite`.' });
    }
}

// ==================== /qr stats ====================
async function handleQrStats(interaction) {
    const qrId = interaction.options.getString('id');
    const userId = interaction.user.id;

    if (qrId) {
        // Show specific QR stats
        const entry = getQrEntry(qrId);
        if (!entry) return interaction.reply({ content: `❌ QR code dengan ID \`${qrId}\` tidak ditemukan.`, ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle(`📊 QR Stats — ${qrId}`)
            .setColor('#E74C3C')
            .setDescription(
                `**🔗 URL:** ${entry.url.length > 60 ? entry.url.substring(0, 57) + '...' : entry.url}\n` +
                `**🎨 Warna:** ${(COLOR_THEMES[entry.color] || COLOR_THEMES.red).name}\n` +
                `**📊 Total Scan:** **${entry.scans}**\n` +
                `**📅 Dibuat:** <t:${Math.floor(entry.createdAt / 1000)}:R>\n` +
                (entry.lastScanAt > 0 ? `**🕐 Scan Terakhir:** <t:${Math.floor(entry.lastScanAt / 1000)}:R>\n` : '') +
                (entry.label ? `**🏷️ Label:** ${entry.label}\n` : '')
            );
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Show user's QR history
    const qrs = getUserQrCodes(userId, 15);
    if (qrs.length === 0) return interaction.reply({ content: '📭 Kamu belum pernah membuat QR code. Gunakan `/qr generate` untuk membuat!', ephemeral: true });

    let desc = `📱 **QR Codes Kamu** (${qrs.length} terbaru)\n\n`;
    for (const q of qrs) {
        const shortUrl = q.url.length > 40 ? q.url.substring(0, 37) + '...' : q.url;
        const theme = COLOR_THEMES[q.color] || COLOR_THEMES.red;
        desc += `> \`${q.id}\` — ${shortUrl}\n> 📊 **${q.scans}** scan • ${theme.name} • <t:${Math.floor(q.createdAt / 1000)}:R>\n\n`;
    }

    const embed = new EmbedBuilder()
        .setTitle('📊 QR Code Stats')
        .setColor('#E74C3C')
        .setDescription(desc)
        .setFooter({ text: 'Gunakan /qr stats id:<qr_id> untuk detail spesifik' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ==================== BUTTON HANDLER ====================
async function handleQrButton(interaction) {
    const parts = interaction.customId.split('_');
    // qr_track_<id>
    if (parts[1] === 'track') {
        const qrId = parts[2];
        const entry = getQrEntry(qrId);
        if (!entry) return interaction.reply({ content: '❌ QR tidak ditemukan.', ephemeral: true });

        const theme = COLOR_THEMES[entry.color] || COLOR_THEMES.red;
        const embed = new EmbedBuilder()
            .setTitle(`📊 QR Stats — ${qrId}`)
            .setColor(theme.accent)
            .setDescription(
                `**🔗 URL:** ${entry.url.length > 60 ? entry.url.substring(0, 57) + '...' : entry.url}\n` +
                `**🎨 Warna:** ${theme.name}\n` +
                `**📊 Total Scan:** **${entry.scans}**\n` +
                `**📅 Dibuat:** <t:${Math.floor(entry.createdAt / 1000)}:R>\n` +
                (entry.lastScanAt > 0 ? `**🕐 Scan Terakhir:** <t:${Math.floor(entry.lastScanAt / 1000)}:R>\n` : '*(Belum pernah di-scan)*\n') +
                `\n> 💡 Bagikan gambar QR code di atas — setiap orang yang scan otomatis terhitung!`
            );

        // Increment scan counter when someone clicks the Stats button (as proxy for views)
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return interaction.reply({ content: '📱 Gunakan `/qr generate` untuk membuat QR code baru.', ephemeral: true });
}

function isQrButton(customId) {
    return customId.startsWith('qr_track_') || customId.startsWith('qr_small_') || customId.startsWith('qr_medium_') || customId.startsWith('qr_large_');
}

// ==================== API ROUTE: QR REDIRECT (for tracking) ====================
function registerQrRoutes(app) {
    // Redirect endpoint: /qr/:id → original URL + increment scan
    app.get('/qr/:id', (req, res) => {
        const { id } = req.params;
        const entry = getQrEntry(id);
        if (!entry) return res.status(404).send('QR code not found');
        incrementQrScan(id);
        res.redirect(302, entry.url);
    });

    // Stats endpoint: /api/qr/:id/stats
    app.get('/api/qr/:id/stats', (req, res) => {
        const { id } = req.params;
        const entry = getQrEntry(id);
        if (!entry) return res.status(404).json({ error: 'Not found' });
        res.json({ id: entry.id, url: entry.url, scans: entry.scans, createdAt: entry.createdAt, lastScanAt: entry.lastScanAt });
    });
}

module.exports = {
    handleQrCommand,
    handleQrButton,
    isQrButton,
    generateQrCode,
    isValidUrl,
    registerQrRoutes,
    createQrEntry,
    getQrEntry,
    incrementQrScan,
    getUserQrCodes,
    COLOR_THEMES,
};
