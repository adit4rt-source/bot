// systems/qrcode.js — QR Code Generator (local generation with logo overlay)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const QRCode = require('qrcode');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// Logo path (bot avatar / custom logo)
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'qr-logo.png');

// Validate URL format
function isValidUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

// Load fonts
try {
    GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'fonts', 'Poppins-Bold.ttf'), 'Poppins Bold');
    GlobalFonts.registerFromPath(path.join(__dirname, '..', 'assets', 'fonts', 'Poppins-SemiBold.ttf'), 'Poppins SemiBold');
} catch (_) {}

// Helper: draw rounded rectangle
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

// Generate QR code as PNG buffer with premium frame + logo
async function generateQrCode(url, size = 380) {
    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'H', // High error correction for logo overlay
        margin: 1,
        width: size,
        color: { dark: '#1A1A1A', light: '#FFFFFF' }
    });

    // Canvas dimensions
    const frameWidth = 18;
    const innerPad = 24;
    const headerHeight = 50;
    const footerHeight = 44;
    const totalWidth = size + (frameWidth + innerPad) * 2;
    const totalHeight = size + (frameWidth + innerPad) * 2 + headerHeight + footerHeight;

    const canvas = createCanvas(totalWidth, totalHeight);
    const ctx = canvas.getContext('2d');

    // === OUTER FRAME (black rounded rectangle) ===
    roundRect(ctx, 0, 0, totalWidth, totalHeight, 20);
    ctx.fillStyle = '#1A1A1A';
    ctx.fill();

    // === RED ACCENT BORDER (inner glow line) ===
    roundRect(ctx, frameWidth / 2, frameWidth / 2, totalWidth - frameWidth, totalHeight - frameWidth, 16);
    ctx.strokeStyle = '#E74C3C';
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

    // === HEADER (title area) ===
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '18px "Poppins Bold", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCAN QR CODE', totalWidth / 2, frameWidth + 6 + headerHeight / 2);

    // Red accent line under header
    const lineY = frameWidth + 6 + headerHeight - 4;
    ctx.beginPath();
    ctx.moveTo(frameWidth + 30, lineY);
    ctx.lineTo(totalWidth - frameWidth - 30, lineY);
    ctx.strokeStyle = '#E74C3C';
    ctx.lineWidth = 2;
    ctx.stroke();

    // === DRAW QR CODE ===
    const qrX = innerX + innerPad;
    const qrY = innerY + innerPad;
    const qrImage = await loadImage(Buffer.from(qrDataUrl.split(',')[1], 'base64'));
    ctx.drawImage(qrImage, qrX, qrY, size, size);

    // === RED CORNER ACCENTS on QR (scanning targets) ===
    const cornerLen = 28;
    const cornerThick = 4;
    const cOffset = qrX - 4;
    const cOffsetY = qrY - 4;
    const qrEnd = qrX + size + 4;
    const qrEndY = qrY + size + 4;
    ctx.fillStyle = '#E74C3C';
    // Top-left
    ctx.fillRect(cOffset, cOffsetY, cornerLen, cornerThick);
    ctx.fillRect(cOffset, cOffsetY, cornerThick, cornerLen);
    // Top-right
    ctx.fillRect(qrEnd - cornerLen, cOffsetY, cornerLen, cornerThick);
    ctx.fillRect(qrEnd - cornerThick, cOffsetY, cornerThick, cornerLen);
    // Bottom-left
    ctx.fillRect(cOffset, qrEndY - cornerThick, cornerLen, cornerThick);
    ctx.fillRect(cOffset, qrEndY - cornerLen, cornerThick, cornerLen);
    // Bottom-right
    ctx.fillRect(qrEnd - cornerLen, qrEndY - cornerThick, cornerLen, cornerThick);
    ctx.fillRect(qrEnd - cornerThick, qrEndY - cornerLen, cornerThick, cornerLen);

    // === LOGO IN CENTER ===
    try {
        const logo = await loadImage(LOGO_PATH);
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

        // Red ring border
        ctx.beginPath();
        ctx.arc(logoCenterX, logoCenterY, logoSize / 2 + 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#E74C3C';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Black inner ring
        ctx.beginPath();
        ctx.arc(logoCenterX, logoCenterY, logoSize / 2 + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#1A1A1A';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Clip logo to circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(logoCenterX, logoCenterY, logoSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
        ctx.restore();
    } catch (e) {
        // No logo — still works fine
    }

    // === FOOTER ===
    const footerY = innerY + innerH + 8;
    ctx.fillStyle = '#AAAAAA';
    ctx.font = '13px "Poppins SemiBold", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Scan untuk buka link', totalWidth / 2, footerY + footerHeight / 2 - 2);

    // Small red dot accents on footer sides
    ctx.fillStyle = '#E74C3C';
    ctx.beginPath();
    ctx.arc(frameWidth + 24, footerY + footerHeight / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(totalWidth - frameWidth - 24, footerY + footerHeight / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toBuffer('image/png');
}

// Handle /qr command
async function handleQrCommand(interaction) {
    const url = interaction.options.getString('url');

    if (!url || !isValidUrl(url)) {
        return interaction.reply({
            content: '❌ URL tidak valid! Pastikan diawali `http://` atau `https://`.\n> Contoh: `https://google.com`',
            ephemeral: true
        });
    }

    await interaction.deferReply();

    try {
        const buffer = await generateQrCode(url, 400);
        const attachment = new AttachmentBuilder(buffer, { name: 'qrcode.png' });

        const displayUrl = url.length > 80 ? url.substring(0, 77) + '...' : url;
        const embed = new EmbedBuilder()
            .setTitle('📱 QR Code Generator')
            .setColor('#2B2D31')
            .setDescription(
                `**🔗 URL:**\n> ${displayUrl}\n\n` +
                `> Scan QR code di bawah untuk membuka link!`
            )
            .setImage('attachment://qrcode.png')
            .setFooter({ text: `Diminta oleh ${interaction.user.username}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('🔗 Buka Link').setStyle(ButtonStyle.Link).setURL(url)
        );

        return interaction.editReply({ embeds: [embed], files: [attachment], components: [row] });
    } catch (e) {
        console.error('[qrcode] Error generating QR:', e.message);
        return interaction.editReply({ content: '❌ Gagal membuat QR code. Pastikan URL valid dan tidak terlalu panjang.' });
    }
}

// Handle QR size buttons (kept for compatibility but simplified)
async function handleQrButton(interaction) {
    return interaction.reply({ content: '📱 Gunakan `/qr <url>` untuk membuat QR code baru.', ephemeral: true });
}

// Detect if a button interaction belongs to this system
function isQrButton(customId) {
    return customId.startsWith('qr_small_') || customId.startsWith('qr_medium_') || customId.startsWith('qr_large_');
}

module.exports = { handleQrCommand, handleQrButton, isQrButton, generateQrCode, isValidUrl };
