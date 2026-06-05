// systems/welcomer.js — Welcome & Goodbye Message System
// Sends customizable embed messages when members join/leave.
const { EmbedBuilder } = require('discord.js');
const { db } = require('../database');

// ==================== DATABASE SETUP ====================
db.exec(`CREATE TABLE IF NOT EXISTS welcomer_settings (guildId TEXT, key TEXT, value TEXT, PRIMARY KEY(guildId, key))`);

// ==================== SETTINGS HELPERS ====================
function getWelcomerSetting(guildId, key, defaultVal = null) {
    const row = db.prepare('SELECT value FROM welcomer_settings WHERE guildId = ? AND key = ?').get(guildId, key);
    return row ? row.value : defaultVal;
}

function setWelcomerSetting(guildId, key, value) {
    db.prepare('INSERT OR REPLACE INTO welcomer_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, key, String(value));
}

function getAllWelcomerSettings(guildId) {
    const keys = [
        'welcome_enabled', 'welcome_channel', 'welcome_message', 'welcome_embed_color',
        'welcome_embed_title', 'welcome_embed_thumbnail', 'welcome_embed_image',
        'welcome_dm_enabled', 'welcome_dm_message',
        'welcome_autorole', 'welcome_autorole_delay',
        'goodbye_enabled', 'goodbye_channel', 'goodbye_message', 'goodbye_embed_color',
    ];
    const defaults = {
        welcome_enabled: '0',
        welcome_channel: '',
        welcome_message: 'Selamat datang {user.mention} di **{server.name}**! Kamu member ke-**{server.memberCount}** 🎉',
        welcome_embed_color: '#5865F2',
        welcome_embed_title: '👋 Welcome!',
        welcome_embed_thumbnail: '{user.avatar}',
        welcome_embed_image: '',
        welcome_dm_enabled: '0',
        welcome_dm_message: 'Hai {user.name}! Selamat datang di **{server.name}**. Enjoy your stay! 🎉',
        welcome_autorole: '',
        welcome_autorole_delay: '0',
        goodbye_enabled: '0',
        goodbye_channel: '',
        goodbye_message: '👋 **{user.name}** telah meninggalkan server. (Member: **{server.memberCount}**)',
        goodbye_embed_color: '#FF6B6B',
    };
    const settings = {};
    for (const key of keys) {
        settings[key] = getWelcomerSetting(guildId, key, defaults[key]);
    }
    return settings;
}

// ==================== VARIABLE REPLACEMENT ====================
function replaceVariables(text, member) {
    const guild = member.guild;
    return text
        .replace(/{user\.mention}/g, `<@${member.id}>`)
        .replace(/{user\.name}/g, member.user.username)
        .replace(/{user\.displayName}/g, member.displayName || member.user.username)
        .replace(/{user\.tag}/g, member.user.tag || member.user.username)
        .replace(/{user\.id}/g, member.id)
        .replace(/{user\.avatar}/g, member.user.displayAvatarURL({ size: 256 }) || '')
        .replace(/{user\.createdAt}/g, `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`)
        .replace(/{server\.name}/g, guild.name)
        .replace(/{server\.memberCount}/g, String(guild.memberCount))
        .replace(/{server\.icon}/g, guild.iconURL({ size: 256 }) || '');
}

// ==================== WELCOME HANDLER ====================
async function handleWelcome(member) {
    if (member.user.bot) return;
    const guildId = member.guild.id;

    const enabled = getWelcomerSetting(guildId, 'welcome_enabled', '0');
    if (enabled !== '1') return;

    // Send welcome message to channel
    const channelId = getWelcomerSetting(guildId, 'welcome_channel', '');
    if (channelId) {
        const channel = member.guild.channels.cache.get(channelId);
        if (channel) {
            const message = replaceVariables(getWelcomerSetting(guildId, 'welcome_message', 'Welcome {user.mention}!'), member);
            const color = getWelcomerSetting(guildId, 'welcome_embed_color', '#5865F2');
            const title = replaceVariables(getWelcomerSetting(guildId, 'welcome_embed_title', '👋 Welcome!'), member);
            const thumbnail = replaceVariables(getWelcomerSetting(guildId, 'welcome_embed_thumbnail', '{user.avatar}'), member);
            const image = getWelcomerSetting(guildId, 'welcome_embed_image', '');

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(message)
                .setTimestamp();

            if (thumbnail && thumbnail.startsWith('http')) embed.setThumbnail(thumbnail);
            if (image && image.startsWith('http')) embed.setImage(image);

            channel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(() => {});
        }
    }

    // Send DM if enabled
    const dmEnabled = getWelcomerSetting(guildId, 'welcome_dm_enabled', '0');
    if (dmEnabled === '1') {
        const dmMessage = replaceVariables(getWelcomerSetting(guildId, 'welcome_dm_message', 'Welcome to {server.name}!'), member);
        member.send(dmMessage).catch(() => {});
    }

    // Auto-role
    const autorole = getWelcomerSetting(guildId, 'welcome_autorole', '');
    if (autorole) {
        const roleIds = autorole.split(',').map(r => r.trim()).filter(Boolean);
        const delay = parseInt(getWelcomerSetting(guildId, 'welcome_autorole_delay', '0')) || 0;

        const applyRoles = async () => {
            for (const roleId of roleIds) {
                const role = member.guild.roles.cache.get(roleId);
                if (role) {
                    await member.roles.add(role).catch(() => {});
                }
            }
        };

        if (delay > 0) {
            setTimeout(applyRoles, delay * 1000);
        } else {
            await applyRoles();
        }
    }
}

// ==================== GOODBYE HANDLER ====================
async function handleGoodbye(member) {
    if (member.user.bot) return;
    const guildId = member.guild.id;

    const enabled = getWelcomerSetting(guildId, 'goodbye_enabled', '0');
    if (enabled !== '1') return;

    const channelId = getWelcomerSetting(guildId, 'goodbye_channel', '');
    if (!channelId) return;

    const channel = member.guild.channels.cache.get(channelId);
    if (!channel) return;

    const message = replaceVariables(getWelcomerSetting(guildId, 'goodbye_message', '👋 {user.name} left.'), member);
    const color = getWelcomerSetting(guildId, 'goodbye_embed_color', '#FF6B6B');

    const embed = new EmbedBuilder()
        .setColor(color)
        .setDescription(message)
        .setTimestamp();

    channel.send({ embeds: [embed] }).catch(() => {});
}

// ==================== TEST FUNCTION (for dashboard) ====================
async function testWelcomer(member) {
    // Temporarily force-send a welcome message regardless of settings
    const guildId = member.guild.id;
    const channelId = getWelcomerSetting(guildId, 'welcome_channel', '');
    if (!channelId) throw new Error('No welcome channel set');

    const channel = member.guild.channels.cache.get(channelId);
    if (!channel) throw new Error('Channel not found');

    const message = replaceVariables(getWelcomerSetting(guildId, 'welcome_message', 'Welcome {user.mention}!'), member);
    const color = getWelcomerSetting(guildId, 'welcome_embed_color', '#5865F2');
    const title = replaceVariables(getWelcomerSetting(guildId, 'welcome_embed_title', '👋 Welcome!'), member);
    const thumbnail = replaceVariables(getWelcomerSetting(guildId, 'welcome_embed_thumbnail', ''), member);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`[TEST] ${title}`)
        .setDescription(message)
        .setFooter({ text: '⚠️ This is a test message from dashboard' })
        .setTimestamp();

    if (thumbnail && thumbnail.startsWith('http')) embed.setThumbnail(thumbnail);

    await channel.send({ embeds: [embed] });
}

module.exports = {
    handleWelcome,
    handleGoodbye,
    testWelcomer,
    getAllWelcomerSettings,
    getWelcomerSetting,
    setWelcomerSetting,
};
