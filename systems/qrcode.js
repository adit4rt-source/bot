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

// Generate QR code as PNG buffer with optional logo in center
async function generateQrCode(url, size = 400) {
    // Generate QR code as data URL then draw on canvas
    const qrDataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'H', // High error correction (needed for logo overlay)
        margin: 2,
        width: size,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    });

    // Create canvas
    const padding = 40;
    const totalSize = size + padding * 2;
    const canvas = createCanvas(totalSize, totalSize);
    const ctx = canvas.getContext('2d');

    // White background with rounded corners
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, totalSize, totalSize);

    // Draw QR code
    const qrImage = await loadImage(Buffer.from(qrDataUrl.split(',')[1], 'base64'));
    ctx.drawImage(qrImage, padding, padding, size, size);

    // Draw logo in center (if exists)
    try {
        const logo = await loadImage(LOGO_PATH);
        const logoSize = Math.floor(size * 0.22); // 22% of QR size
        const logoX = padding + (size - logoSize) / 2;
        const logoY = padding + (size - logoSize) / 2;

        // White background circle behind logo
        const circleRadius = logoSize / 2 + 6;
        ctx.beginPath();
        ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, circleRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        // Draw logo
        ctx.save();
        ctx.beginPath();
        ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
        ctx.restore();

        // Logo border
        ctx.beginPath();
        ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#E74C3C';
        ctx.lineWidth = 3;
        ctx.stroke();
    } catch (e) {
        // No logo file — QR code still works fine without it
    }

    // Bottom text
    ctx.fillStyle = '#666666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Scan untuk buka link', totalSize / 2, totalSize - 12);

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
