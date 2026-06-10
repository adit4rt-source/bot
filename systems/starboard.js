// systems/starboard.js — Starboard System
// Messages with enough star reactions get reposted to a starboard channel
const { EmbedBuilder } = require('discord.js');
const { db, getSetting } = require('../database');

// ==================== DB TABLE ====================
db.exec(`CREATE TABLE IF NOT EXISTS starboard (
    messageId TEXT PRIMARY KEY,
    guildId TEXT,
    channelId TEXT,
    authorId TEXT,
    starboardMsgId TEXT,
    stars INTEGER DEFAULT 0,
    content TEXT,
    attachment TEXT,
    createdAt INTEGER
)`);

// ==================== SETTINGS ====================
// Server settings (via /starboard setup):
//   starboard_channel  — channel ID where starred messages are reposted
//   starboard_threshold — minimum stars needed (default: 3)
//   starboard_emoji — emoji to use (default: ⭐)
//   starboard_self_star — '1' to allow self-starring (default: '0')

function getStarboardChannel(guildId) {
    return getSetting(guildId, 'starboard_channel', null);
}

function getThreshold(guildId) {
    const v = parseInt(getSetting(guildId, 'starboard_threshold', '3'), 10);
    return Number.isFinite(v) && v > 0 ? v : 3;
}

function getStarEmoji(guildId) {
    return getSetting(guildId, 'starboard_emoji', '⭐');
}

function allowSelfStar(guildId) {
    return getSetting(guildId, 'starboard_self_star', '0') === '1';
}

// ==================== STAR DISPLAY ====================
function getStarDisplay(count) {
    if (count >= 20) return '🌠';
    if (count >= 15) return '✨';
    if (count >= 10) return '💫';
    if (count >= 5) return '🌟';
    return '⭐';
}

// ==================== CORE: Handle Reaction ====================
async function handleStarReaction(reaction, user) {
    if (!reaction.message.guild) return;
    const guildId = reaction.message.guild.id;

    // Check if starboard is configured
    const channelId = getStarboardChannel(guildId);
    if (!channelId) return;

    // Check emoji
    const starEmoji = getStarEmoji(guildId);
    const emojiName = reaction.emoji.name;
    if (emojiName !== starEmoji) return;

    // Check self-star
    if (!allowSelfStar(guildId) && user.id === reaction.message.author?.id) return;

    // Fetch full message if partial
    let msg = reaction.message;
    if (msg.partial) msg = await msg.fetch().catch(() => null);
    if (!msg) return;

    // Count stars (excluding bot if possible)
    const starReaction = msg.reactions.cache.find(r => r.emoji.name === starEmoji);
    let starCount = starReaction ? starReaction.count : 0;

    // Remove self-star from count if not allowed
    if (!allowSelfStar(guildId) && starReaction) {
        const users = await starReaction.users.fetch().catch(() => null);
        if (users && users.has(msg.author.id)) starCount--;
    }

    const threshold = getThreshold(guildId);
    if (starCount < threshold) return;

    // Check if already on starboard
    const existing = db.prepare('SELECT * FROM starboard WHERE messageId = ?').get(msg.id);
    const starboardChannel = msg.guild.channels.cache.get(channelId);
    if (!starboardChannel) return;

    const starDisplay = getStarDisplay(starCount);
    const header = `${starDisplay} **${starCount}** | <#${msg.channel.id}>`;

    // Build embed
    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setAuthor({ name: msg.author.username, iconURL: msg.author.displayAvatarURL({ size: 64 }) })
        .setTimestamp(msg.createdAt)
        .setFooter({ text: `ID: ${msg.id}` });

    if (msg.content) embed.setDescription(msg.content.substring(0, 4000));

    // Attachment (image)
    const imgAttach = msg.attachments.find(a => a.contentType && a.contentType.startsWith('image/'));
    if (imgAttach) embed.setImage(imgAttach.url);
    else if (msg.embeds.length > 0 && msg.embeds[0].image) embed.setImage(msg.embeds[0].image.url);

    // Add jump-to-message link
    embed.addFields({ name: '\u200b', value: `[Jump to message](${msg.url})`, inline: false });

    if (existing) {
        // Update existing starboard message
        try {
            const starMsg = await starboardChannel.messages.fetch(existing.starboardMsgId).catch(() => null);
            if (starMsg) {
                await starMsg.edit({ content: header, embeds: [embed] });
            }
            db.prepare('UPDATE starboard SET stars = ? WHERE messageId = ?').run(starCount, msg.id);
        } catch (_) {}
    } else {
        // Post new starboard entry
        try {
            const sent = await starboardChannel.send({ content: header, embeds: [embed] });
            db.prepare('INSERT INTO starboard (messageId, guildId, channelId, authorId, starboardMsgId, stars, content, attachment, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
                msg.id, guildId, msg.channel.id, msg.author.id, sent.id, starCount,
                (msg.content || '').substring(0, 500), imgAttach ? imgAttach.url : '', Date.now()
            );
        } catch (_) {}
    }
}

// ==================== SLASH COMMAND HANDLER ====================
async function handleStarboardCommand(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'setup') {
        const channel = interaction.options.getChannel('channel');
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'starboard_channel', channel.id);
        return interaction.reply({ content: `⭐ Starboard channel diset ke <#${channel.id}>!`, ephemeral: true });
    }

    if (sub === 'threshold') {
        const count = interaction.options.getInteger('jumlah');
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'starboard_threshold', String(count));
        return interaction.reply({ content: `⭐ Threshold starboard diset ke **${count}** star!`, ephemeral: true });
    }

    if (sub === 'emoji') {
        const emoji = interaction.options.getString('emoji');
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'starboard_emoji', emoji);
        return interaction.reply({ content: `⭐ Emoji starboard diset ke **${emoji}**!`, ephemeral: true });
    }

    if (sub === 'selfstar') {
        const allow = interaction.options.getString('allow');
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, 'starboard_self_star', allow);
        return interaction.reply({ content: `⭐ Self-star: **${allow === '1' ? 'Dibolehkan' : 'Tidak boleh'}**`, ephemeral: true });
    }

    if (sub === 'disable') {
        db.prepare('DELETE FROM server_settings WHERE guildId = ? AND key = ?').run(guildId, 'starboard_channel');
        return interaction.reply({ content: '⭐ Starboard dinonaktifkan.', ephemeral: true });
    }

    if (sub === 'status') {
        const ch = getStarboardChannel(guildId);
        const threshold = getThreshold(guildId);
        const emoji = getStarEmoji(guildId);
        const selfStar = allowSelfStar(guildId);
        const totalStarred = db.prepare('SELECT COUNT(*) as c FROM starboard WHERE guildId = ?').get(guildId);

        const embed = new EmbedBuilder()
            .setTitle('⭐ Starboard Status')
            .setColor('#FFD700')
            .setDescription(
                `**Channel:** ${ch ? `<#${ch}>` : '*Belum diset*'}\n` +
                `**Threshold:** ${threshold} ${emoji}\n` +
                `**Emoji:** ${emoji}\n` +
                `**Self-star:** ${selfStar ? 'Ya' : 'Tidak'}\n` +
                `**Total starred:** ${totalStarred.c} pesan`
            );
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

module.exports = { handleStarReaction, handleStarboardCommand, getStarboardChannel };
