// systems/ticket.js — Ticket System (support tickets with setup, panel, and handlers)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getSetting } = require('../database');

// Database
db.exec(`CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    channelId TEXT,
    userId TEXT,
    subject TEXT,
    status TEXT DEFAULT 'open',
    claimedBy TEXT,
    createdAt INTEGER,
    closedAt INTEGER
)`);

// ==================== SETUP ====================
async function setupTicketSystem(interaction) {
    const guildId = interaction.guild.id;
    await interaction.deferUpdate();

    try {
        // Create category
        const category = await interaction.guild.channels.create({
            name: '🎫 TICKETS',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                { id: guildId, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        // Create ticket panel channel (visible to everyone)
        const panelChannel = await interaction.guild.channels.create({
            name: '🎫-open-ticket',
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
                { id: guildId, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] },
                { id: interaction.guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        // Create transcript channel (admin only)
        const transcriptChannel = await interaction.guild.channels.create({
            name: '📋-ticket-logs',
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
                { id: guildId, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        // Save settings
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'ticket_category', category.id);
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'ticket_panel_channel', panelChannel.id);
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'ticket_log_channel', transcriptChannel.id);

        // Send panel embed
        const panelEmbed = new EmbedBuilder()
            .setTitle('🎫 Support Ticket')
            .setColor('#5865F2')
            .setDescription(
                `Butuh bantuan? Buat ticket!\n\n` +
                `> 📝 Klik tombol di bawah untuk membuka ticket\n` +
                `> 💬 Tim staff akan membantu secepatnya\n` +
                `> ⚠️ Jangan spam buat ticket\n\n` +
                `**Waktu respons:** Biasanya < 15 menit`
            )
            .setFooter({ text: 'Ticket System' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_create').setLabel('📝 Buat Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
        );

        await panelChannel.send({ embeds: [panelEmbed], components: [row] });

        // Success message
        const embed = new EmbedBuilder().setTitle('✅ Ticket System Created!').setColor('#2ECC71')
            .setDescription(
                `📁 **${category.name}**\n` +
                `> 🎫 <#${panelChannel.id}> (panel)\n` +
                `> 📋 <#${transcriptChannel.id}> (logs)\n\n` +
                `Sistem ticket siap digunakan!`
            );
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admpnl_back').setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.editReply({ embeds: [embed], components: [backRow] });
    } catch (e) {
        console.error('[ticket] Setup failed:', e);
        return interaction.followUp({ content: '❌ Gagal setup ticket. Cek permission bot!', ephemeral: true });
    }
}

// ==================== CREATE TICKET ====================
async function handleTicketCreate(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    // Check if user already has open ticket
    const existing = db.prepare("SELECT * FROM tickets WHERE guildId = ? AND userId = ? AND status = 'open'").get(guildId, userId);
    if (existing) {
        return interaction.reply({ content: `❌ Kamu sudah punya ticket terbuka: <#${existing.channelId}>`, ephemeral: true });
    }

    // Show subject modal
    const modal = new ModalBuilder().setCustomId('ticket_modal_create').setTitle('📝 Buat Ticket');
    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('subject').setLabel('Subjek / Masalah').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Contoh: Bug di /daily').setMaxLength(100)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('description').setLabel('Jelaskan masalahmu').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Jelaskan detail masalah...').setMaxLength(1000)
        )
    );
    return interaction.showModal(modal);
}

// ==================== MODAL SUBMIT (create ticket channel) ====================
async function handleTicketModal(interaction) {
    if (interaction.customId !== 'ticket_modal_create') return false;

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const subject = interaction.fields.getTextInputValue('subject');
    const description = interaction.fields.getTextInputValue('description');

    const categoryId = getSetting(guildId, 'ticket_category', '');
    if (!categoryId) return interaction.reply({ content: '❌ Ticket system belum di-setup!', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    try {
        // Get ticket number
        const count = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guildId = ?").get(guildId)?.c || 0;
        const ticketNum = count + 1;

        // Create ticket channel
        const channel = await interaction.guild.channels.create({
            name: `ticket-${ticketNum}-${interaction.user.username}`.slice(0, 100),
            type: ChannelType.GuildText,
            parent: categoryId,
            permissionOverwrites: [
                { id: guildId, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] },
                { id: interaction.guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
            ]
        });

        // Save ticket to DB
        db.prepare('INSERT INTO tickets (guildId, channelId, userId, subject, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, channel.id, userId, subject, 'open', Date.now());

        // Send ticket embed in the channel
        const ticketEmbed = new EmbedBuilder()
            .setTitle(`🎫 Ticket #${ticketNum}`)
            .setColor('#5865F2')
            .setDescription(
                `**Dibuat oleh:** <@${userId}>\n` +
                `**Subjek:** ${subject}\n\n` +
                `**Deskripsi:**\n${description}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Staff akan merespons secepatnya.\n` +
                `Klik tombol di bawah untuk mengelola ticket.`
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_claim').setLabel('✋ Claim').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 Close').setStyle(ButtonStyle.Danger)
        );

        await channel.send({ content: `<@${userId}>`, embeds: [ticketEmbed], components: [row] });

        return interaction.editReply({ content: `✅ Ticket dibuat! <#${channel.id}>` });
    } catch (e) {
        console.error('[ticket] Create failed:', e);
        return interaction.editReply({ content: '❌ Gagal buat ticket!' });
    }
}

// ==================== BUTTON HANDLERS ====================
async function handleTicketButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;

    if (customId === 'ticket_create') {
        return handleTicketCreate(interaction);
    }

    if (customId === 'ticket_claim') {
        const ticket = db.prepare("SELECT * FROM tickets WHERE guildId = ? AND channelId = ? AND status = 'open'").get(guildId, interaction.channel.id);
        if (!ticket) return interaction.reply({ content: '❌ Ticket tidak ditemukan!', ephemeral: true });
        if (ticket.claimedBy) return interaction.reply({ content: `❌ Sudah di-claim oleh <@${ticket.claimedBy}>!`, ephemeral: true });

        db.prepare('UPDATE tickets SET claimedBy = ? WHERE id = ?').run(interaction.user.id, ticket.id);
        
        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setDescription(`✋ **Ticket di-claim oleh** <@${interaction.user.id}>\n\nStaff akan membantu kamu sekarang.`)
            .setTimestamp();
        return interaction.reply({ embeds: [embed] });
    }

    if (customId === 'ticket_close') {
        const ticket = db.prepare("SELECT * FROM tickets WHERE guildId = ? AND channelId = ?").get(guildId, interaction.channel.id);
        if (!ticket) return interaction.reply({ content: '❌ Ticket tidak ditemukan!', ephemeral: true });

        // Permission check: only ticket creator or members with ManageChannels can close
        const isCreator = interaction.user.id === ticket.userId;
        const hasManageChannels = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);
        if (!isCreator && !hasManageChannels) {
            return interaction.reply({ content: '❌ Hanya pembuat ticket atau staff yang bisa menutup ticket ini!', ephemeral: true });
        }

        // Confirm close
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_close_confirm').setLabel('✅ Ya, Tutup').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('ticket_close_cancel').setLabel('❌ Batal').setStyle(ButtonStyle.Secondary)
        );
        return interaction.reply({ content: '⚠️ Yakin mau tutup ticket ini?', components: [row] });
    }

    if (customId === 'ticket_close_confirm') {
        const ticket = db.prepare("SELECT * FROM tickets WHERE guildId = ? AND channelId = ?").get(guildId, interaction.channel.id);
        if (!ticket) return interaction.reply({ content: '❌ Ticket tidak ditemukan!', ephemeral: true });

        db.prepare("UPDATE tickets SET status = 'closed', closedAt = ? WHERE id = ?").run(Date.now(), ticket.id);

        // Log to transcript channel
        const logChannelId = getSetting(guildId, 'ticket_log_channel', '');
        if (logChannelId) {
            const logChannel = interaction.guild.channels.cache.get(logChannelId);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(`📋 Ticket #${ticket.id} Closed`)
                    .setColor('#E74C3C')
                    .setDescription(
                        `**User:** <@${ticket.userId}>\n` +
                        `**Subjek:** ${ticket.subject}\n` +
                        `**Ditutup oleh:** <@${interaction.user.id}>\n` +
                        `**Claimed by:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : '*Tidak ada*'}\n` +
                        `**Dibuat:** <t:${Math.floor(ticket.createdAt / 1000)}:R>\n` +
                        `**Ditutup:** <t:${Math.floor(Date.now() / 1000)}:R>`
                    )
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
            }
        }

        await interaction.reply({ content: '🔒 Ticket ditutup. Channel akan dihapus dalam 5 detik...' });
        setTimeout(async () => {
            await interaction.channel.delete().catch(() => {});
        }, 5000);
        return;
    }

    if (customId === 'ticket_close_cancel') {
        return interaction.reply({ content: '✅ Dibatalkan.', ephemeral: true });
    }

    return false;
}

// ==================== DETECTION ====================
function isTicketButton(customId) {
    return customId === 'ticket_create' || customId === 'ticket_claim' || customId === 'ticket_close' || customId === 'ticket_close_confirm' || customId === 'ticket_close_cancel';
}

function isTicketModal(customId) {
    return customId === 'ticket_modal_create';
}

module.exports = { setupTicketSystem, handleTicketButton, handleTicketModal, isTicketButton, isTicketModal };
