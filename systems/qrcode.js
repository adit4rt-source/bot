// systems/qrcode.js — QR Code Generator using qrtag.net API
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// QRtag.net API — free, no auth needed, 1000 req/10min limit
const QRTAG_BASE = 'https://www.qrtag.net/api';

// Validate URL format
function isValidUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

// Generate QR code embed from a URL
function buildQrEmbed(url, userId, size = 8) {
    const encodedUrl = encodeURIComponent(url);
    const qrImageUrl = `${QRTAG_BASE}/qr_${size}.png?url=${encodedUrl}`;

    const displayUrl = url.length > 80 ? url.substring(0, 77) + '...' : url;

    const embed = new EmbedBuilder()
        .setTitle('📱 QR Code Generator')
        .setColor('#2B2D31')
        .setDescription(
            `**🔗 URL:**\n> ${displayUrl}\n\n` +
            `**📐 Size:** ${size} module\n\n` +
            `> Scan QR code di bawah untuk membuka link!`
        )
        .setImage(qrImageUrl)
        .setFooter({ text: `Dibuat oleh • QRtag.net API | Diminta oleh user ${userId}` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('🔗 Buka Link').setStyle(ButtonStyle.Link).setURL(url),
        new ButtonBuilder().setCustomId(`qr_small_${userId}`).setLabel('📐 Kecil').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`qr_medium_${userId}`).setLabel('📐 Sedang').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`qr_large_${userId}`).setLabel('📐 Besar').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row], qrUrl: qrImageUrl };
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

    const panel = buildQrEmbed(url, interaction.user.id, 8);
    return interaction.reply(panel);
}

// Handle QR size buttons
async function handleQrButton(interaction) {
    const customId = interaction.customId;
    const parts = customId.split('_');
    const sizeKey = parts[1]; // small, medium, large
    const userId = parts[2];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan QR code kamu!', ephemeral: true });
    }

    // Extract URL from the existing embed
    const existingEmbed = interaction.message.embeds[0];
    if (!existingEmbed) {
        return interaction.reply({ content: '❌ Tidak bisa menemukan data QR code.', ephemeral: true });
    }

    // Extract URL from image — decode it back
    const imageUrl = existingEmbed.image?.url || existingEmbed.data?.image?.url || '';
    const urlMatch = imageUrl.match(/[?&]url=([^&]+)/);
    if (!urlMatch) {
        return interaction.reply({ content: '❌ Tidak bisa mengekstrak URL dari QR code.', ephemeral: true });
    }

    const originalUrl = decodeURIComponent(urlMatch[1]);
    const sizeMap = { small: 5, medium: 8, large: 12 };
    const size = sizeMap[sizeKey] || 8;

    const panel = buildQrEmbed(originalUrl, userId, size);
    return interaction.update(panel);
}

// Detect if a button interaction belongs to this system
function isQrButton(customId) {
    return customId.startsWith('qr_small_') || customId.startsWith('qr_medium_') || customId.startsWith('qr_large_');
}

module.exports = { handleQrCommand, handleQrButton, isQrButton, buildQrEmbed, isValidUrl };
