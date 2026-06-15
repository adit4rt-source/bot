// systems/welcomer.js — Welcome & Goodbye Message System
// Sends customizable embed messages when members join/leave.
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { db } = require('../database');
const { generateCard, generateRpgCard, generateGlitchCard } = require('./imageRenderer');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

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

// Download a remote image into a Buffer (used to sniff GIF vs static and to
// feed the GIF processor). Returns null on any failure so callers can fall back.
async function fetchImageBuffer(url, { timeoutMs = 10000, maxBytes = 25 * 1024 * 1024 } = {}) {
    if (!url || typeof fetch !== 'function') return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (maxBytes && buf.length > maxBytes) return null;
        return buf;
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function getAllWelcomerSettings(guildId) {
    const keys = [
        'welcome_enabled', 'welcome_channel', 'welcome_message', 'welcome_embed_color',
        'welcome_embed_title', 'welcome_embed_thumbnail', 'welcome_embed_image',
        'welcome_dm_enabled', 'welcome_dm_message',
        'welcome_autorole', 'welcome_autorole_delay',
        'welcome_banner_enabled', 'welcome_banner_bg', 'welcome_banner_text', 'welcome_banner_style',
        'goodbye_enabled', 'goodbye_channel', 'goodbye_message', 'goodbye_embed_color',
        'goodbye_banner_enabled', 'goodbye_banner_bg', 'goodbye_banner_text', 'goodbye_banner_style',
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
        welcome_banner_enabled: '0',
        welcome_banner_bg: '',
        welcome_banner_text: 'WELCOME',
        welcome_banner_style: 'glitch',
        goodbye_enabled: '0',
        goodbye_channel: '',
        goodbye_message: '👋 **{user.name}** telah meninggalkan server. (Member: **{server.memberCount}**)',
        goodbye_embed_color: '#FF6B6B',
        goodbye_banner_enabled: '0',
        goodbye_banner_bg: '',
        goodbye_banner_text: 'GOODBYE',
        goodbye_banner_style: 'glitch',
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

// ==================== BANNER HELPER ====================
// Generate a banner attachment for welcome/goodbye if enabled. Returns null on
// failure or when disabled, so callers can safely fall back to the plain embed.
async function buildBannerAttachment(member, type) {
    const guildId = member.guild.id;
    const prefix = type === 'goodbye' ? 'goodbye' : 'welcome';

    if (getWelcomerSetting(guildId, `${prefix}_banner_enabled`, '0') !== '1') return null;

    try {
        const bgURL = getWelcomerSetting(guildId, `${prefix}_banner_bg`, '');
        const style = getWelcomerSetting(guildId, `${prefix}_banner_style`, 'glitch');
        const accent = getWelcomerSetting(guildId, `${prefix}_embed_color`, type === 'goodbye' ? '#FF6B6B' : '#5865F2');
        const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
        const memberCount = member.guild.memberCount;
        const username = member.displayName || member.user.username;

        let buffer;
        if (style === 'glitch') {
            // Webcore / glitch directory card.
            const tagline = getWelcomerSetting(guildId, `${prefix}_banner_text`, type === 'goodbye' ? 'until next time' : 'take my whole life too');
            buffer = await generateGlitchCard({
                label: type === 'goodbye' ? '. co / goodbye' : '. co / welcome',
                username,
                line2: type === 'goodbye' ? `member left` : `member #${memberCount}`,
                line3: type === 'goodbye' ? 'just left' : 'just joined',
                acLabel: 'SERVER',
                acText: member.guild.name,
                caution: type === 'goodbye'
                    ? 'Take care out there. The door is always open.'
                    : 'Please read the rules and be kind to everyone here.',
                tagline: replaceVariables(tagline, member),
                button: type === 'goodbye' ? 'FAREWELL' : 'GO TO MAIN',
                avatarURL,
                bgURL,
                accent,
            });
        } else if (style === 'rpg') {
            // RPG adventurer profile card.
            const defaultHead = type === 'goodbye' ? 'FAREWELL ADVENTURER' : 'NEW ADVENTURER';
            const headline = getWelcomerSetting(guildId, `${prefix}_banner_text`, defaultHead);
            buffer = await generateRpgCard({
                headline: replaceVariables(headline, member),
                username,
                className: type === 'goodbye' ? 'Telah Pergi' : 'Petualang Baru',
                subtitle: type === 'goodbye'
                    ? `Party • ${memberCount} petualang tersisa • ${member.guild.name}`
                    : `Party • Petualang ke-${memberCount} • ${member.guild.name}`,
                level: type === 'goodbye' ? '—' : 1,
                hpPct: type === 'goodbye' ? 0 : 1,
                mpPct: type === 'goodbye' ? 0 : 1,
                expPct: type === 'goodbye' ? 1 : 0.08,
                avatarURL,
                bgURL,
                accent,
            });
        } else {
            // Classic polished banner.
            const headline = getWelcomerSetting(guildId, `${prefix}_banner_text`, type === 'goodbye' ? 'GOODBYE' : 'WELCOME');
            const subtitle = type === 'goodbye'
                ? `Sekarang ada ${memberCount} anggota • ${member.guild.name}`
                : `Anggota ke-${memberCount} • ${member.guild.name}`;
            buffer = await generateCard({
                headline: replaceVariables(headline, member),
                username,
                subtitle,
                avatarURL,
                bgURL,
                accent,
            });
        }
        return new AttachmentBuilder(buffer, { name: `${prefix}.png` });
    } catch (e) {
        console.error(`[welcomer] Gagal generate ${prefix} banner:`, e.message);
        return null;
    }
}

// ==================== WELCOME HANDLER ====================
async function handleWelcome(member) {
    if (member.user.bot) return;
    const guildId = member.guild.id;

    const enabled = getWelcomerSetting(guildId, 'welcome_enabled', '0');
    if (enabled !== '1') {
        log('INFO', `[welcomer] Join ${member.user.tag} di ${guildId} diabaikan: welcome_enabled != 1 (nilai="${enabled}"). Aktifkan via Dashboard/DB.`);
        return;
    }

    // Send welcome message to channel
    const channelId = getWelcomerSetting(guildId, 'welcome_channel', '');
    if (channelId) {
        const channel = member.guild.channels.cache.get(channelId);
        if (channel) {
            const message = replaceVariables(getWelcomerSetting(guildId, 'welcome_message', 'Welcome {user.mention}!'), member);
            const banner = await buildBannerAttachment(member, 'welcome');
            const customImage = getWelcomerSetting(guildId, 'welcome_embed_image', '');
            const onErr = (e) => log('ERROR', `[welcomer] Gagal kirim welcome ke #${channel.name} (${channelId}): ${e.message}. Cek izin bot: View Channel, Send Messages, Embed Links, Attach Files.`);

            if (customImage && customImage.startsWith('http')) {
                // Custom image as canvas background — overlay member avatar in the
                // center + username. If the image is an animated GIF we keep the
                // animation and layer the avatar on every frame; otherwise we
                // render a static PNG banner. Both fall back gracefully.
                const { generateAvatarBanner, generateAvatarBannerGif } = require('./welcomeCard');
                const accent = getWelcomerSetting(guildId, 'welcome_embed_color', '#5865F2');
                const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
                const username = member.user.username;
                try {
                    // Download the source once so we can sniff its type (GIF vs static).
                    const srcBuffer = await fetchImageBuffer(customImage);
                    const isGif = !!srcBuffer && srcBuffer.length > 6 &&
                        srcBuffer.toString('ascii', 0, 4) === 'GIF8';

                    let card = null;
                    if (isGif) {
                        // Animated path: layer avatar onto each frame, keep it a GIF.
                        const gifOut = await generateAvatarBannerGif({ gifBuffer: srcBuffer, avatarURL, username, accent });
                        if (gifOut) {
                            card = new AttachmentBuilder(gifOut, { name: 'welcome.gif' });
                        } else {
                            // sharp missing / GIF too large / processing failed —
                            // fall back to a static banner (first frame + avatar).
                            log('WARN', `[welcomer] GIF welcomer di guild ${guildId} jatuh ke banner statis (sharp belum terpasang atau GIF terlalu besar). Jalankan \`npm install sharp\` di server untuk hasil animasi.`);
                            const png = await generateAvatarBanner({ bgURL: customImage, avatarURL, username, accent });
                            if (png) card = new AttachmentBuilder(png, { name: 'welcome.png' });
                        }
                    } else {
                        const png = await generateAvatarBanner({ bgURL: customImage, avatarURL, username, accent });
                        if (png) card = new AttachmentBuilder(png, { name: 'welcome.png' });
                    }

                    if (card) {
                        channel.send({ content: message, files: [card], allowedMentions: { users: [member.id] } }).catch(onErr);
                    } else {
                        const embed = new EmbedBuilder().setColor(accent).setDescription(message).setImage(customImage).setTimestamp();
                        channel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(onErr);
                    }
                } catch (e) {
                    log('ERROR', `[welcomer] gagal render custom image welcomer di guild ${guildId}: ${e.message}. Fallback ke embed gambar mentah (avatar tidak muncul).`);
                    const embed = new EmbedBuilder().setColor(accent).setDescription(message).setImage(customImage).setTimestamp();
                    channel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(onErr);
                }
            } else if (banner) {
                // Kythia-style single block: greeting line as plain text, then the
                // large card image directly below it. No embed (keeps it as one
                // visual block and lets the card render at full media width).
                channel.send({
                    content: message,
                    files: [banner],
                    allowedMentions: { users: [member.id] },
                }).catch(onErr);
            } else {
                // No generated card -> fall back to a text embed.
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
                channel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(onErr);
            }
        } else {
            log('WARN', `[welcomer] welcome_channel="${channelId}" tidak ditemukan di guild ${guildId} (channel dihapus / bot tidak melihatnya).`);
        }
    } else {
        log('WARN', `[welcomer] welcome aktif tapi welcome_channel belum diset di guild ${guildId}.`);
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
    const banner = await buildBannerAttachment(member, 'goodbye');

    if (banner) {
        // Single block: goodbye line + large card image, no embed.
        channel.send({ content: message, files: [banner], allowedMentions: { parse: [] } }).catch(() => {});
    } else {
        const color = getWelcomerSetting(guildId, 'goodbye_embed_color', '#FF6B6B');
        const embed = new EmbedBuilder()
            .setColor(color)
            .setDescription(message)
            .setTimestamp();
        channel.send({ embeds: [embed] }).catch(() => {});
    }
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
    const banner = await buildBannerAttachment(member, 'welcome');

    if (banner) {
        // Single block (matches real welcome): greeting text + large card image.
        await channel.send({ content: `🧪 [TEST] ${message}`, files: [banner], allowedMentions: { parse: [] } });
    } else {
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
}

module.exports = {
    handleWelcome,
    handleGoodbye,
    testWelcomer,
    buildBannerAttachment,
    getAllWelcomerSettings,
    getWelcomerSetting,
    setWelcomerSetting,
};
