// systems/tiktok.js — Auto TikTok embedder (no-watermark)
//
// When a user posts a TikTok link in ANY channel, the bot fetches the raw
// video WITHOUT the TikTok watermark and re-uploads it to Discord so it plays
// inline and can be downloaded directly. Photo (slideshow) posts are handled
// too by re-posting the images.
//
// Resolver: tikwm.com public API (free, no API key required).
//   GET https://www.tikwm.com/api/?hd=1&url=<encoded tiktok url>
//   -> { code: 0, data: { play, hdplay, wmplay, images, title, author, ... } }
//
// Per-guild toggle: server_settings key `tiktok_convert` ('1' = on (default), '0' = off).

const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getSetting } = require('../database');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

// Matches tiktok.com, www/m/vm/vt subdomains, and the short link forms.
const TIKTOK_URL_RE = /https?:\/\/(?:www\.|m\.|vm\.|vt\.)?tiktok\.com\/[^\s<>()]+/i;

const API_BASE = 'https://www.tikwm.com/api/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// Per-channel cooldown so a wall of links doesn't hammer the API.
const _cooldown = new Map(); // channelId -> timestamp
const COOLDOWN_MS = 4000;

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

// Resolve a TikTok URL to its no-watermark media via tikwm.
async function resolveTikTok(url) {
    const api = `${API_BASE}?hd=1&url=${encodeURIComponent(url)}`;
    const res = await fetch(api, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`resolver HTTP ${res.status}`);
    const json = await res.json();
    if (!json || json.code !== 0 || !json.data) {
        throw new Error((json && json.msg) ? json.msg : 'tidak ada data');
    }
    const d = json.data;
    return {
        videoUrl: d.hdplay || d.play || d.wmplay || null,
        images: Array.isArray(d.images) && d.images.length ? d.images : null,
        title: d.title || '',
        author: d.author ? (d.author.nickname || d.author.unique_id || '') : '',
        cover: d.cover || d.origin_cover || null,
    };
}

// Discord upload size cap (MB) by server boost tier. We still wrap the upload in
// try/catch and fall back to a download link if Discord rejects it as too large.
function uploadLimitMB(guild) {
    const tier = guild ? (guild.premiumTier || 0) : 0;
    if (tier >= 3) return 100;
    if (tier >= 2) return 50;
    return 25;
}

function buildCaption(info) {
    const parts = [];
    let head = '🎬 **TikTok**';
    if (info.author) head += ` — ${info.author}`;
    parts.push(head);
    if (info.title) parts.push(`> ${info.title.replace(/\n+/g, ' ').slice(0, 280)}`);
    parts.push('-# ✅ Tanpa watermark');
    return parts.join('\n');
}

function linkRow(videoUrl) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('⬇️ Download (No Watermark)').setStyle(ButtonStyle.Link).setURL(videoUrl)
    );
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

        const status = await message.channel.send({ content: '🎬 Mengambil video TikTok (tanpa watermark)…' }).catch(() => null);

        let info;
        try {
            info = await resolveTikTok(url);
        } catch (e) {
            log('WARN', `[tiktok] resolve failed: ${e.message}`);
            const fail = `⚠️ Gagal mengambil video TikTok (${e.message}). Coba lagi nanti ya.`;
            if (status) status.edit({ content: fail }).then(m => setTimeout(() => m.delete().catch(() => {}), 8000)).catch(() => {});
            else message.reply({ content: fail }).catch(() => {});
            return true;
        }

        // Suppress the ugly default TikTok embed on the original message.
        message.suppressEmbeds(true).catch(() => {});

        // Photo / slideshow post.
        if (info.images) {
            const embeds = info.images.slice(0, 4).map((img, i) =>
                new EmbedBuilder().setColor('#010101').setImage(img)
                    .setURL('https://www.tiktok.com')
                    .setAuthor(i === 0 ? { name: `🖼️ TikTok Photo${info.author ? ' — ' + info.author : ''}` } : null)
            );
            const caption = `🖼️ **TikTok Photo**${info.author ? ` — ${info.author}` : ''}` + (info.title ? `\n> ${info.title.slice(0, 280)}` : '');
            if (status) await status.edit({ content: caption, embeds }).catch(() => {});
            else await message.channel.send({ content: caption, embeds }).catch(() => {});
            return true;
        }

        if (!info.videoUrl) {
            const fail = '⚠️ Tidak menemukan media yang bisa diambil dari link itu.';
            if (status) status.edit({ content: fail }).then(m => setTimeout(() => m.delete().catch(() => {}), 8000)).catch(() => {});
            return true;
        }

        const caption = buildCaption(info);

        // Download the video so we can re-upload it (this strips the watermark
        // because the resolver already returns the no-watermark file).
        let buffer = null;
        try {
            const vres = await fetch(info.videoUrl, { headers: { 'User-Agent': UA } });
            if (vres.ok) buffer = Buffer.from(await vres.arrayBuffer());
        } catch (e) {
            log('WARN', `[tiktok] download failed: ${e.message}`);
        }

        const limitBytes = uploadLimitMB(message.guild) * 1024 * 1024;

        if (buffer && buffer.length <= limitBytes) {
            const file = new AttachmentBuilder(buffer, { name: 'tiktok.mp4' });
            try {
                if (status) await status.edit({ content: caption, files: [file] });
                else await message.channel.send({ content: caption, files: [file] });
                return true;
            } catch (e) {
                // Most likely "Request entity too large" — fall back to a link.
                log('WARN', `[tiktok] upload rejected, sending link: ${e.message}`);
            }
        }

        // Fallback: too large (or download failed) → post a direct no-watermark link.
        const content = `${caption}\n-# Video terlalu besar untuk diupload — klik tombol di bawah untuk download.`;
        if (status) await status.edit({ content, components: [linkRow(info.videoUrl)] }).catch(() => {});
        else await message.channel.send({ content, components: [linkRow(info.videoUrl)] }).catch(() => {});
        return true;
    } catch (e) {
        log('WARN', `[tiktok] maybeHandleTikTok error: ${e.message}`);
        return false;
    }
}

module.exports = {
    TIKTOK_URL_RE,
    extractTikTokUrl,
    resolveTikTok,
    isEnabled,
    setEnabled,
    maybeHandleTikTok,
};
