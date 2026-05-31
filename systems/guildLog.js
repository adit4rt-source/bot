// systems/guildLog.js - Logs guild join/leave events to a specific channel in YOUR server.
// Also provides a utility to post update/changelog entries.
const { EmbedBuilder } = require('discord.js');

// Channel IDs (in YOUR official server)
const GUILD_LOG_CHANNEL = '1510707330767913100';   // Log: server mana aja yang pakai bot
const UPDATE_LOG_CHANNEL = '1510705567944151150';  // Log: update/fix/changelog

// ================= GUILD JOIN/LEAVE LOGGER =================

async function onGuildCreate(client, guild) {
    try {
        const channel = await client.channels.fetch(GUILD_LOG_CHANNEL).catch(() => null);
        if (!channel) return;

        const owner = await guild.fetchOwner().catch(() => null);
        const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('📥 Bot Ditambahkan ke Server Baru!')
            .setThumbnail(guild.iconURL({ size: 128 }) || '')
            .addFields(
                { name: '🏠 Server', value: `**${guild.name}**`, inline: true },
                { name: '🆔 ID', value: `\`${guild.id}\``, inline: true },
                { name: '👥 Members', value: `${guild.memberCount}`, inline: true },
                { name: '👑 Owner', value: owner ? `${owner.user.tag} (\`${owner.id}\`)` : 'Unknown', inline: false },
                { name: '📅 Server Dibuat', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
                { name: '📊 Total Servers', value: `**${client.guilds.cache.size}**`, inline: true }
            )
            .setFooter({ text: `Bot sekarang di ${client.guilds.cache.size} server` })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (e) { /* silent */ }
}

async function onGuildDelete(client, guild) {
    try {
        const channel = await client.channels.fetch(GUILD_LOG_CHANNEL).catch(() => null);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('📤 Bot Dikeluarkan dari Server')
            .setThumbnail(guild.iconURL({ size: 128 }) || '')
            .addFields(
                { name: '🏠 Server', value: `**${guild.name}**`, inline: true },
                { name: '🆔 ID', value: `\`${guild.id}\``, inline: true },
                { name: '👥 Members', value: `${guild.memberCount || '?'}`, inline: true },
                { name: '📊 Total Servers', value: `**${client.guilds.cache.size}**`, inline: true }
            )
            .setFooter({ text: `Bot sekarang di ${client.guilds.cache.size} server` })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (e) { /* silent */ }
}

// ================= UPDATE/CHANGELOG POSTER =================
// Posts a changelog embed to the update channel. Checks last 5 messages to avoid
// duplicating the same version announcement on every restart.

async function postUpdateLog(client, version, changes) {
    try {
        const channel = await client.channels.fetch(UPDATE_LOG_CHANNEL).catch(() => null);
        if (!channel) return;

        // Dedup: skip if this version was already posted
        const recent = await channel.messages.fetch({ limit: 5 }).catch(() => null);
        if (recent && recent.some(m => m.embeds.length > 0 && m.embeds[0].title && m.embeds[0].title.includes(version))) {
            return; // Already posted
        }

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`📦 Update — v${version}`)
            .setDescription(changes)
            .setFooter({ text: 'idcommunity Bot — Changelog' })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (e) { /* silent */ }
}

module.exports = { onGuildCreate, onGuildDelete, postUpdateLog, GUILD_LOG_CHANNEL, UPDATE_LOG_CHANNEL };
