// systems/videoDownloader.js — Multi-platform video downloader
//
// Detects video links from YouTube, Instagram, Twitter/X, Facebook, Reddit,
// and other platforms. Downloads the video and re-uploads to Discord for
// inline playback. Works alongside the existing TikTok system (tiktok.js).
//
// Resolution strategy (in priority order):
//   1. Cobalt self-hosted instance (supports 20+ platforms, configurable via
//      env COBALT_API_URL or server_settings key `cobalt_api_url`)
//   2. Per-platform fallback resolvers (no external dependency for basic cases)
//
// Per-guild toggle: server_settings key `video_convert` ('1' = on, '0' = off (default OFF)).
// Individual platforms can be toggled: `video_convert_youtube`, `video_convert_instagram`, etc.

const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getSetting } = require('../database');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36';

// ==================== URL PATTERNS ====================
const PLATFORM_PATTERNS = {
    youtube: /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)[^\s<>()]+/i,
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/[^\s<>()]+/i,
    twitter: /https?:\/\/(?:(?:www\.|mobile\.)?(?:twitter|x)\.com)\/[^\s<>()]+\/status\/\d+[^\s<>()]*/i,
    facebook: /https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch)\/[^\s<>()]+/i,
    reddit: /https?:\/\/(?:www\.|old\.|new\.)?reddit\.com\/r\/[^\s<>()]+/i,
    pinterest: /https?:\/\/(?:www\.|pin\.)?(?:pinterest\.com|pin\.it)\/[^\s<>()]+/i,
    bluesky: /https?:\/\/bsky\.app\/profile\/[^\s<>()]+\/post\/[^\s<>()]+/i,
    threads: /https?:\/\/(?:www\.)?threads\.net\/@[^\s<>()]+\/post\/[^\s<>()]+/i,
};

// Platforms where the existing tiktok.js handles it — skip here.
const SKIP_PLATFORMS = ['tiktok'];

// ==================== SETTINGS ====================
function isEnabled(guildId) {
    return getSetting(guildId, 'video_convert', '0') === '1';
}

function isPlatformEnabled(guildId, platform) {
    // Default: all platforms ON once master toggle is on
    return getSetting(guildId, `video_convert_${platform}`, '1') === '1';
}

function setEnabled(guildId, on) {
    db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)')
        .run(guildId, 'video_convert', on ? '1' : '0');
}

function getCobaltUrl(guildId) {
    // Priority: guild-specific > env > default public (may be rate-limited)
    const guildUrl = getSetting(guildId, 'cobalt_api_url', '');
    if (guildUrl && guildUrl.startsWith('http')) return guildUrl.replace(/\/+$/, '');
    if (process.env.COBALT_API_URL) return process.env.COBALT_API_URL.replace(/\/+$/, '');
    return null; // No cobalt instance configured
}

// ==================== DETECTION ====================
function detectVideoUrl(content) {
    if (!content) return null;
    const text = String(content);
    for (const [platform, regex] of Object.entries(PLATFORM_PATTERNS)) {
        const m = text.match(regex);
        if (m) return { platform, url: m[0] };
    }
    return null;
}

// ==================== COBALT RESOLVER ====================
// Cobalt API v7+: POST / with JSON { url, videoQuality, filenameStyle }
// Response: { status: "tunnel"|"redirect", url: "..." } or { status: "error", ... }
async function resolveCobalt(cobaltBase, videoUrl) {
    const endpoint = `${cobaltBase}/`;
    const body = JSON.stringify({
        url: videoUrl,
        videoQuality: '720',
        filenameStyle: 'basic',
    });
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': UA,
        },
        body,
    });
    if (!res.ok) throw new Error(`Cobalt HTTP ${res.status}`);
    const json = await res.json();

    if (json.status === 'error') {
        throw new Error(json.error?.code || json.text || 'cobalt error');
    }

    // status: "tunnel" or "redirect" — both give a downloadable URL
    if (json.status === 'tunnel' || json.status === 'redirect' || json.status === 'stream') {
        return { videoUrl: json.url, filename: json.filename || null };
    }

    // Picker (multiple items, e.g. Instagram carousel)
    if (json.status === 'picker' && Array.isArray(json.picker)) {
        // Return first video item
        const vid = json.picker.find(p => p.type === 'video') || json.picker[0];
        if (vid && vid.url) return { videoUrl: vid.url, filename: vid.filename || null };
    }

    throw new Error('unexpected cobalt response');
}

// ==================== FALLBACK RESOLVERS ====================
// These work without Cobalt for common platforms.

// Twitter/X: use fxtwitter.com API (public, no key)
async function resolveTwitter(url) {
    // Extract tweet URL and convert to fxtwitter API
    const match = url.match(/(?:twitter|x)\.com\/([^/]+)\/status\/(\d+)/i);
    if (!match) return null;
    const apiUrl = `https://api.fxtwitter.com/${match[1]}/status/${match[2]}`;
    const res = await fetch(apiUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const json = await res.json();
    const tweet = json.tweet;
    if (!tweet || !tweet.media || !tweet.media.videos || !tweet.media.videos.length) return null;
    // Get best quality video variant
    const video = tweet.media.videos[0];
    const videoUrl = video.url || (video.variants && video.variants.length ? video.variants[video.variants.length - 1].url : null);
    if (!videoUrl) return null;
    return {
        videoUrl,
        title: (tweet.text || '').slice(0, 200),
        author: tweet.author ? (tweet.author.name || tweet.author.screen_name || '') : '',
    };
}

// Instagram: use ddinstagram.com (public embed fix API)
async function resolveInstagram(url) {
    // Convert to ddinstagram API
    const ddUrl = url.replace(/instagram\.com/i, 'ddinstagram.com');
    const res = await fetch(ddUrl, {
        headers: { 'User-Agent': UA },
        redirect: 'manual',
    });
    // ddinstagram redirects to the video URL or returns HTML with video tag
    const location = res.headers.get('location');
    if (location && /\.(mp4|webm)/i.test(location)) {
        return { videoUrl: location, title: '', author: '' };
    }
    // Try alternate approach: use igram.world
    return null;
}

// ==================== DISCORD HELPERS ====================
function uploadLimitMB(guild) {
    const tier = guild ? (guild.premiumTier || 0) : 0;
    if (tier >= 3) return 100;
    if (tier >= 2) return 50;
    return 25;
}

const PLATFORM_EMOJI = {
    youtube: '▶️',
    instagram: '📸',
    twitter: '🐦',
    facebook: '📘',
    reddit: '🤖',
    pinterest: '📌',
    bluesky: '🦋',
    threads: '🧵',
};

const PLATFORM_NAME = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    twitter: 'Twitter/X',
    facebook: 'Facebook',
    reddit: 'Reddit',
    pinterest: 'Pinterest',
    bluesky: 'Bluesky',
    threads: 'Threads',
};

function buildCaption(platform, info = {}) {
    const emoji = PLATFORM_EMOJI[platform] || '🎬';
    const name = PLATFORM_NAME[platform] || platform;
    const parts = [];
    let head = `${emoji} **${name}**`;
    if (info.author) head += ` — ${info.author}`;
    parts.push(head);
    if (info.title) parts.push(`> ${info.title.replace(/\n+/g, ' ').slice(0, 280)}`);
    parts.push('-# ✅ Auto-converted for inline playback');
    return parts.join('\n');
}

function linkRow(videoUrl, platform) {
    const name = PLATFORM_NAME[platform] || 'Video';
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel(`⬇️ Download ${name}`).setStyle(ButtonStyle.Link).setURL(videoUrl)
    );
}

// ==================== COOLDOWN ====================
const _cooldown = new Map();
const COOLDOWN_MS = 5000;

// ==================== MAIN HANDLER ====================
async function maybeHandleVideo(message) {
    try {
        if (!message.guild) return false;
        if (!isEnabled(message.guild.id)) return false;

        const detected = detectVideoUrl(message.content);
        if (!detected) return false;

        const { platform, url } = detected;
        if (!isPlatformEnabled(message.guild.id, platform)) return false;

        // Cooldown per channel
        const now = Date.now();
        const key = `${message.channel.id}_${platform}`;
        const last = _cooldown.get(key) || 0;
        if (now - last < COOLDOWN_MS) return false;
        _cooldown.set(key, now);

        const guildId = message.guild.id;
        const emoji = PLATFORM_EMOJI[platform] || '🎬';
        const pname = PLATFORM_NAME[platform] || platform;

        const status = await message.channel.send({
            content: `${emoji} Mengambil video dari ${pname}...`
        }).catch(() => null);

        let resolved = null;

        // Try Cobalt first (if configured)
        const cobaltUrl = getCobaltUrl(guildId);
        if (cobaltUrl) {
            try {
                resolved = await resolveCobalt(cobaltUrl, url);
            } catch (e) {
                log('WARN', `[videoDownloader] Cobalt gagal untuk ${platform}: ${e.message}`);
            }
        }

        // Fallback per-platform resolvers
        if (!resolved) {
            try {
                if (platform === 'twitter') {
                    resolved = await resolveTwitter(url);
                } else if (platform === 'instagram') {
                    resolved = await resolveInstagram(url);
                }
            } catch (e) {
                log('WARN', `[videoDownloader] fallback resolver gagal untuk ${platform}: ${e.message}`);
            }
        }

        if (!resolved || !resolved.videoUrl) {
            const fail = `⚠️ Gagal mengambil video dari ${pname}. `;
            const hint = cobaltUrl
                ? 'Coba lagi nanti.'
                : 'Hint: set Cobalt instance URL via `COBALT_API_URL` env atau admin panel untuk support lebih banyak platform.';
            if (status) {
                status.edit({ content: fail + hint })
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 10000))
                    .catch(() => {});
            }
            return true;
        }

        // Suppress original embed
        message.suppressEmbeds(true).catch(() => {});

        const caption = buildCaption(platform, resolved);

        // Download video
        let buffer = null;
        try {
            const vres = await fetch(resolved.videoUrl, {
                headers: { 'User-Agent': UA },
            });
            if (vres.ok) buffer = Buffer.from(await vres.arrayBuffer());
        } catch (e) {
            log('WARN', `[videoDownloader] download video gagal: ${e.message}`);
        }

        const limitBytes = uploadLimitMB(message.guild) * 1024 * 1024;
        const ext = (resolved.filename && resolved.filename.includes('.'))
            ? resolved.filename.split('.').pop()
            : 'mp4';

        if (buffer && buffer.length <= limitBytes) {
            const file = new AttachmentBuilder(buffer, { name: `${platform}.${ext}` });
            try {
                if (status) await status.edit({ content: caption, files: [file] });
                else await message.channel.send({ content: caption, files: [file] });
                return true;
            } catch (e) {
                log('WARN', `[videoDownloader] upload rejected: ${e.message}`);
            }
        }

        // Too large or download failed — send direct link
        const content = `${caption}\n-# Video terlalu besar untuk diupload — klik tombol di bawah untuk download.`;
        if (status) await status.edit({ content, components: [linkRow(resolved.videoUrl, platform)] }).catch(() => {});
        else await message.channel.send({ content, components: [linkRow(resolved.videoUrl, platform)] }).catch(() => {});
        return true;
    } catch (e) {
        log('WARN', `[videoDownloader] maybeHandleVideo error: ${e.message}`);
        return false;
    }
}

module.exports = {
    PLATFORM_PATTERNS,
    detectVideoUrl,
    isEnabled,
    setEnabled,
    isPlatformEnabled,
    maybeHandleVideo,
    resolveCobalt,
    resolveTwitter,
    resolveInstagram,
    getCobaltUrl,
};
