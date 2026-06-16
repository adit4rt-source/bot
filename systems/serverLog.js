// systems/serverLog.js — Server event logging
//
// Logs member join/leave, message delete/edit, and role changes to a configured
// log channel. Channel set via server_settings key `serverlog_channel`.
// Toggle via `serverlog_enabled` ('1'/'0', default '0').

const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { db, getSetting } = require('../database');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

function isEnabled(guildId) {
    return getSetting(guildId, 'serverlog_enabled', '0') === '1';
}

function getLogChannel(guild) {
    if (!guild) return null;
    const id = getSetting(guild.id, 'serverlog_channel', '');
    if (!id) return null;
    return guild.channels.cache.get(id) || null;
}

async function send(guild, embed) {
    if (!isEnabled(guild.id)) return;
    const ch = getLogChannel(guild);
    if (!ch) return;
    ch.send({ embeds: [embed] }).catch(() => {});
}

// ==================== MEMBER JOIN ====================
async function logMemberJoin(member) {
    try {
        const created = member.user.createdTimestamp;
        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setAuthor({ name: `${member.user.tag} bergabung`, iconURL: member.user.displayAvatarURL() })
            .setDescription(`<@${member.id}> (\`${member.id}\`)`)
            .addFields(
                { name: 'Akun Dibuat', value: `<t:${Math.floor(created / 1000)}:R>`, inline: true },
                { name: 'Member ke', value: `#${member.guild.memberCount}`, inline: true },
            )
            .setFooter({ text: '📥 Member Join' })
            .setTimestamp();
        await send(member.guild, embed);
    } catch (e) { log('WARN', `[serverlog] join: ${e.message}`); }
}

// ==================== MEMBER LEAVE ====================
async function logMemberLeave(member) {
    try {
        const roles = member.roles?.cache?.filter(r => r.id !== member.guild.id).map(r => `<@&${r.id}>`).join(', ') || '*tidak ada*';
        const embed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setAuthor({ name: `${member.user.tag} keluar`, iconURL: member.user.displayAvatarURL() })
            .setDescription(`<@${member.id}> (\`${member.id}\`)`)
            .addFields({ name: 'Roles', value: roles.slice(0, 1000) })
            .setFooter({ text: '📤 Member Leave' })
            .setTimestamp();
        await send(member.guild, embed);
    } catch (e) { log('WARN', `[serverlog] leave: ${e.message}`); }
}

// ==================== MESSAGE DELETE ====================
async function logMessageDelete(message) {
    try {
        if (!message.guild || message.author?.bot) return;
        if (!message.content && !message.attachments?.size) return;
        const embed = new EmbedBuilder()
            .setColor('#E67E22')
            .setAuthor({ name: `${message.author?.tag || 'Unknown'}`, iconURL: message.author?.displayAvatarURL?.() })
            .setDescription(`🗑️ **Pesan dihapus** di <#${message.channel.id}>`)
            .setFooter({ text: `User ID: ${message.author?.id || '?'}` })
            .setTimestamp();
        if (message.content) embed.addFields({ name: 'Konten', value: message.content.slice(0, 1024) });
        if (message.attachments?.size) embed.addFields({ name: 'Lampiran', value: `${message.attachments.size} file` });
        await send(message.guild, embed);
    } catch (e) { log('WARN', `[serverlog] msgDelete: ${e.message}`); }
}

// ==================== MESSAGE EDIT ====================
async function logMessageUpdate(oldMessage, newMessage) {
    try {
        if (!newMessage.guild || newMessage.author?.bot) return;
        if (oldMessage.content === newMessage.content) return;
        if (!oldMessage.content && !newMessage.content) return;
        const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setAuthor({ name: `${newMessage.author?.tag || 'Unknown'}`, iconURL: newMessage.author?.displayAvatarURL?.() })
            .setDescription(`✏️ **Pesan diedit** di <#${newMessage.channel.id}> • [Lompat](${newMessage.url})`)
            .addFields(
                { name: 'Sebelum', value: (oldMessage.content || '*kosong*').slice(0, 1024) },
                { name: 'Sesudah', value: (newMessage.content || '*kosong*').slice(0, 1024) },
            )
            .setFooter({ text: `User ID: ${newMessage.author?.id || '?'}` })
            .setTimestamp();
        await send(newMessage.guild, embed);
    } catch (e) { log('WARN', `[serverlog] msgUpdate: ${e.message}`); }
}

// ==================== ROLE CHANGES ====================
async function logMemberUpdate(oldMember, newMember) {
    try {
        const guild = newMember.guild;
        if (!isEnabled(guild.id)) return;

        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;
        const added = newRoles.filter(r => !oldRoles.has(r.id));
        const removed = oldRoles.filter(r => !newRoles.has(r.id));

        if (added.size === 0 && removed.size === 0) return;

        const lines = [];
        if (added.size) lines.push(`➕ **Ditambah:** ${added.map(r => `<@&${r.id}>`).join(', ')}`);
        if (removed.size) lines.push(`➖ **Dihapus:** ${removed.map(r => `<@&${r.id}>`).join(', ')}`);

        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setAuthor({ name: `${newMember.user.tag}`, iconURL: newMember.user.displayAvatarURL() })
            .setDescription(`🎭 **Role berubah** untuk <@${newMember.id}>\n${lines.join('\n')}`)
            .setFooter({ text: `User ID: ${newMember.id}` })
            .setTimestamp();
        await send(guild, embed);
    } catch (e) { log('WARN', `[serverlog] memberUpdate: ${e.message}`); }
}

module.exports = {
    isEnabled,
    logMemberJoin,
    logMemberLeave,
    logMessageDelete,
    logMessageUpdate,
    logMemberUpdate,
};
