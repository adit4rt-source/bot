// systems/tiktok.js — Auto TikTok embedder (no-watermark)
//
// When a user posts a TikTok link in ANY channel, the bot fetches the raw
// video WITHOUT the TikTok watermark and re-uploads it to Discord so it plays
// inline. It shows a clean card with a 💾 Save (download) button and an
// ℹ️ Info button (views/likes/comments/etc). Photo (slideshow) posts are
// handled too by re-posting the images.
//
// Resolver: tikwm.com public API (free, no API key required).
//   GET https://www.tikwm.com/api/?url=<encoded tiktok url>&hd=1
//   -> { code: 0, data: { play, hdplay, wmplay, images, title, author,
//                          play_count, digg_count, comment_count, ... } }
//
// Per-guild toggle: server_settings key `tiktok_convert` ('1' = on (default)).

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getSetting } = require('../database');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

// Matches tiktok.com, www/m/vm/vt subdomains, and the short link forms.
const TIKTOK_URL_RE = /https?:\/\/(?:www\.|m\.|vm\.|vt\.)?tiktok\.com\/[^\s<>()]+/i;

const API_BASE = 'https://www.tikwm.com/api/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const TIKTOK_COLOR = 0xFE2C55; // TikTok red/pink

// Per-channel cooldown so a wall of links doesn't hammer the API.
const _cooldown = new Map(); // channelId -> timestamp
const COOLDOWN_MS = 3000;

// Short-lived cache so the Info button can show stats without re-resolving.
const _infoCache = new Map(); // messageId -> { info, ts }
const INFO_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function cacheInfo(messageId, info) {
    _infoCache.set(messageId, { info, ts: Date.now() });
    if (_infoCache.size > 500) {
        const cutoff = Date.now() - INFO_TTL_MS;
        for (const [k, v] of _infoCache) if (v.ts < cutoff) _infoCache.delete(k);
    }
}

function isEnabled(guildId) {
    return getSetting(guildId, 'tiktok_convert', '1') === '1';
}

function setEnabled(guildId, on) {
    db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)')
        .run(guildId, 'tiktok_convert', on ? '1' : '0');
}

function extractTikTokUrl(content) {
    if (!content) return null;
    const m = String(content).match(TIKTOK_URL_RE);
    return m ? m[0] : null;
}

function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
}

// Resolve a TikTok URL to its no-watermark media + stats via tikwm.
async function resolveTikTok(url) {
    const api = `${API_BASE}?hd=1&url=${encodeURIComponent(url)}`;
    const res = await fetch(api, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`resolver HTTP ${res.status}`);
    const json = await res.json();
    if (!json || json.code !== 0 || !json.data) {
        throw new Error((json && json.msg) ? json.msg : 'tidak ada data');
    }
    const d = json.data;
    const author = d.author || {};
    const music = d.music_info || {};
    return {
        originalUrl: url,
        videoSD: d.play || d.wmplay || null,       // lighter -> faster inline upload
        videoHD: d.hdplay || d.play || d.wmplay || null, // best quality -> download button
        images: Array.isArray(d.images) && d.images.length ? d.images : null,
        title: d.title || '',
        cover: d.cover || d.origin_cover || null,
        duration: d.duration || 0,
        createTime: d.create_time || 0,
        author: {
            nickname: author.nickname || '',
            unique: author.unique_id || '',
            avatar: author.avatar || null,
        },
        music: { title: music.title || '', author: music.author || '' },
        stats: {
            views: d.play_count || 0,
            likes: d.digg_count || 0,
            comments: d.comment_count || 0,
            shares: d.share_count || 0,
            saves: d.collect_count || 0,
            downloads: d.download_count || 0,
        },
    };
}

// Discord renders an inline video player when a raw direct .mp4 URL appears in
// the message content. We post the no-watermark URL directly (no download /
// re-upload) so the conversion shows up fast.

function authorLine(info) {
    const a = info.author;
    if (a.nickname && a.unique) return `${a.nickname} (@${a.unique})`;
    return a.nickname || (a.unique ? `@${a.unique}` : 'TikTok');
}

// Compact caption shown above the video (clean, QuickVids-style).
function buildContent(info) {
    let s = `🎬 **${authorLine(info)}**`;
    if (info.title) s += `\n${info.title.replace(/\n+/g, ' ').slice(0, 180)}`;
    return s;
}

// Button row: Save (download link) + Info (interactive stats).
function buildButtons(info) {
    const row = new ActionRowBuilder();
    if (info.videoHD) {
        row.addComponents(new ButtonBuilder().setLabel('Save').setEmoji('💾').setStyle(ButtonStyle.Link).setURL(info.videoHD));
    }
    row.addComponents(new ButtonBuilder().setCustomId('tt_info').setLabel('Info').setEmoji('ℹ️').setStyle(ButtonStyle.Secondary));
    if (info.originalUrl) {
        row.addComponents(new ButtonBuilder().setLabel('TikTok').setEmoji('🔗').setStyle(ButtonStyle.Link).setURL(info.originalUrl));
    }
    return row;
}

// Detailed info embed (shown by the Info button).
function buildInfoEmbed(info) {
    const e = new EmbedBuilder()
        .setColor(TIKTOK_COLOR)
        .setTitle('ℹ️ Info Video TikTok')
        .setAuthor({ name: authorLine(info), iconURL: info.author.avatar || undefined });
    if (info.title) e.setDescription(info.title.slice(0, 500));
    if (info.cover) e.setThumbnail(info.cover);
    e.addFields(
        { name: '👁️ Views', value: fmtNum(info.stats.views), inline: true },
        { name: '❤️ Likes', value: fmtNum(info.stats.likes), inline: true },
        { name: '💬 Comments', value: fmtNum(info.stats.comments), inline: true },
        { name: '🔁 Shares', value: fmtNum(info.stats.shares), inline: true },
        { name: '🔖 Saves', value: fmtNum(info.stats.saves), inline: true },
        { name: '⏱️ Durasi', value: `${info.duration || 0}s`, inline: true },
    );
    if (info.music.title) e.addFields({ name: '🎵 Sound', value: `${info.music.title}${info.music.author ? ' — ' + info.music.author : ''}`.slice(0, 256) });
    if (info.createTime) e.setFooter({ text: 'Diposting' }).setTimestamp(new Date(info.createTime * 1000));
    return e;
}

// Main entry. Returns true if a TikTok link was detected & handled.
async function maybeHandleTikTok(message) {
    try {
        if (!message.guild) return false;
        if (!isEnabled(message.guild.id)) return false;

        const url = extractTikTokUrl(message.content);
        if (!url) return false;

        // Channel cooldown.
        const now = Date.now();
        const last = _cooldown.get(message.channel.id) || 0;
        if (now - last < COOLDOWN_MS) return false;
        _cooldown.set(message.channel.id, now);

        // Instant feedback without an extra throwaway message; runs in parallel.
        message.channel.sendTyping().catch(() => {});

        let info;
        try {
            info = await resolveTikTok(url);
        } catch (e) {
            log('WARN', `[tiktok] resolve failed: ${e.message}`);
            return true;
        }

        // Suppress the ugly default TikTok embed on the original message.
        message.suppressEmbeds(true).catch(() => {});

        // Photo / slideshow post.
        if (info.images) {
            const embeds = info.images.slice(0, 4).map((img, i) =>
                new EmbedBuilder().setColor(TIKTOK_COLOR).setImage(img).setURL(info.originalUrl)
                    .setAuthor(i === 0 ? { name: `🖼️ ${authorLine(info)}`, iconURL: info.author.avatar || undefined } : null)
            );
            const sent = await message.channel.send({
                content: buildContent(info),
                embeds,
                components: [buildButtons(info)],
            }).catch(() => null);
            if (sent) cacheInfo(sent.id, info);
            return true;
        }

        if (!info.videoSD && !info.videoHD) return true;

        // Fast path: post the no-watermark URL directly and let Discord build
        // the inline video player. No download / re-upload, so it shows up fast.
        // Use the lighter SD stream for the embedded player (Discord fetches it
        // quicker); the HD file stays behind the Save button.
        const playUrl = info.videoSD || info.videoHD;
        const sent = await message.channel.send({
            content: `${buildContent(info)}\n${playUrl}`,
            components: [buildButtons(info)],
        }).catch(() => null);
        if (sent) cacheInfo(sent.id, info);
        return true;
    } catch (e) {
        log('WARN', `[tiktok] maybeHandleTikTok error: ${e.message}`);
        return false;
    }
}

// ==================== BUTTON HANDLER (Info) ====================
function isTikTokButton(customId) {
    return customId === 'tt_info';
}

async function handleTikTokButton(interaction) {
    const cached = _infoCache.get(interaction.message.id);
    if (!cached) {
        return interaction.reply({ content: 'ℹ️ Info untuk video ini sudah tidak tersedia (kedaluwarsa). Kirim ulang link-nya ya.', ephemeral: true }).catch(() => {});
    }
    return interaction.reply({ embeds: [buildInfoEmbed(cached.info)], ephemeral: true }).catch(() => {});
}

module.exports = {
    TIKTOK_URL_RE,
    extractTikTokUrl,
    resolveTikTok,
    isEnabled,
    setEnabled,
    maybeHandleTikTok,
    isTikTokButton,
    handleTikTokButton,
};
