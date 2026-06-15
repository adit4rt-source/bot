// systems/videoDownloader.js — Multi-platform video downloader
//
// Detects video links from YouTube, Instagram, Twitter/X, Facebook, Reddit,
// Pinterest, and other platforms. Downloads the video and re-uploads to Discord.
// Works alongside the existing TikTok system (tiktok.js).
//
// NO SETUP REQUIRED — uses free public resolver APIs (same pattern as tikwm for TikTok).
// Admin just enables the toggle (video_convert = 1) and it works.
//
// Per-guild toggle: server_settings key `video_convert` ('1' = on, '0' = off — default OFF).

const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getSetting } = require('../database');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

// ==================== URL PATTERNS ====================
const PLATFORM_PATTERNS = {
    youtube: /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)[^\s<>()]+/i,
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/[^\s<>()]+/i,
    twitter: /https?:\/\/(?:(?:www\.|mobile\.)?(?:twitter|x)\.com)\/[^\s<>()]+\/status\/\d+[^\s<>()]*/i,
    facebook: /https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch)\/[^\s<>()]+/i,
    reddit: /https?:\/\/(?:www\.|old\.|new\.)?reddit\.com\/r\/[^\s<>()]+/i,
    pinterest: /https?:\/\/(?:www\.|pin\.)?(?:pinterest\.com|pin\.it)\/[^\s<>()]+/i,
};

// ==================== SETTINGS ====================
function isEnabled(guildId) {
    return getSetting(guildId, 'video_convert', '0') === '1';
}

function setEnabled(guildId, on) {
    db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)')
        .run(guildId, 'video_convert', on ? '1' : '0');
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

// ==================== RESOLVERS (free public APIs, no key needed) ====================

// --- Twitter/X: fxtwitter.com API (public, reliable) ---
async function resolveTwitter(url) {
    const match = url.match(/(?:twitter|x)\.com\/([^/]+)\/status\/(\d+)/i);
    if (!match) return null;
    const apiUrl = `https://api.fxtwitter.com/${match[1]}/status/${match[2]}`;
    const res = await fetch(apiUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const json = await res.json();
    const tweet = json.tweet;
    if (!tweet) return null;
    // Video from media
    if (tweet.media && tweet.media.videos && tweet.media.videos.length) {
        const video = tweet.media.videos[0];
        return {
            videoUrl: video.url || null,
            title: (tweet.text || '').slice(0, 200),
            author: tweet.author ? (tweet.author.name || '') : '',
        };
    }
    return null;
}

// --- Instagram: use public ddinstagram / saveig APIs ---
async function resolveInstagram(url) {
    // Method 1: igdownloader.app API
    try {
        const apiUrl = `https://v3.igdownloader.app/api/v1/instagram/reels?url=${encodeURIComponent(url)}`;
        const res = await fetch(apiUrl, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
        if (res.ok) {
            const json = await res.json();
            if (json && json.items && json.items.length) {
                const item = json.items.find(i => i.url) || json.items[0];
                if (item && item.url) return { videoUrl: item.url, title: '', author: '' };
            }
        }
    } catch (_) {}

    // Method 2: saveig.app style
    try {
        const res = await fetch('https://api.saveig.app/api/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
            body: `url=${encodeURIComponent(url)}`,
        });
        if (res.ok) {
            const json = await res.json();
            if (json && json.url && Array.isArray(json.url) && json.url.length) {
                const vid = json.url.find(u => u.type === 'video') || json.url[0];
                if (vid && vid.url) return { videoUrl: vid.url, title: '', author: '' };
            }
        }
    } catch (_) {}

    return null;
}

// --- YouTube: cobalt-style free API (tikwm equivalent for YT) ---
async function resolveYouTube(url) {
    // Method 1: Use a public all-in-one downloader API
    try {
        const apiUrl = `https://api.vevioz.com/api/button/videos?url=${encodeURIComponent(url)}`;
        const res = await fetch(apiUrl, { headers: { 'User-Agent': UA } });
        if (res.ok) {
            const html = await res.text();
            // Parse download link from response (returns HTML with download buttons)
            const match720 = html.match(/href="(https?:\/\/[^"]+)"[^>]*>720p/i);
            const match480 = html.match(/href="(https?:\/\/[^"]+)"[^>]*>480p/i);
            const match360 = html.match(/href="(https?:\/\/[^"]+)"[^>]*>360p/i);
            const matchAny = html.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i);
            const downloadUrl = (match720 && match720[1]) || (match480 && match480[1]) || (match360 && match360[1]) || (matchAny && matchAny[1]);
            if (downloadUrl) {
                const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
                return { videoUrl: downloadUrl, title: titleMatch ? titleMatch[1].slice(0, 100) : '', author: '' };
            }
        }
    } catch (_) {}

    // Method 2: y2mate-style API
    try {
        const res = await fetch('https://api.mp4youtube.com/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
            body: JSON.stringify({ url }),
        });
        if (res.ok) {
            const json = await res.json();
            if (json && json.url) return { videoUrl: json.url, title: json.title || '', author: '' };
        }
    } catch (_) {}

    // Method 3: Cobalt instance (if env is set)
    if (process.env.COBALT_API_URL) {
        try {
            const cobaltUrl = process.env.COBALT_API_URL.replace(/\/+$/, '');
            const res = await fetch(`${cobaltUrl}/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
                body: JSON.stringify({ url, videoQuality: '720', filenameStyle: 'basic' }),
            });
            if (res.ok) {
                const json = await res.json();
                if ((json.status === 'tunnel' || json.status === 'redirect' || json.status === 'stream') && json.url) {
                    return { videoUrl: json.url, title: '', author: '' };
                }
            }
        } catch (_) {}
    }

    return null;
}

// --- Facebook: use a public API ---
async function resolveFacebook(url) {
    try {
        const apiUrl = `https://api.fbdownloader.app/api/convert?url=${encodeURIComponent(url)}`;
        const res = await fetch(apiUrl, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
        if (res.ok) {
            const json = await res.json();
            if (json && (json.hd || json.sd)) {
                return { videoUrl: json.hd || json.sd, title: json.title || '', author: '' };
            }
        }
    } catch (_) {}
    return null;
}

// --- Reddit: use reddit's own JSON endpoint ---
async function resolveReddit(url) {
    try {
        // Append .json to get post data
        const jsonUrl = url.replace(/\/?(\?.*)?$/, '.json$1');
        const res = await fetch(jsonUrl, { headers: { 'User-Agent': UA } });
        if (!res.ok) return null;
        const data = await res.json();
        const post = data?.[0]?.data?.children?.[0]?.data;
        if (!post) return null;
        // Reddit-hosted video
        if (post.is_video && post.media && post.media.reddit_video) {
            const vidUrl = post.media.reddit_video.fallback_url || post.media.reddit_video.dash_url;
            if (vidUrl) return { videoUrl: vidUrl.split('?')[0], title: (post.title || '').slice(0, 200), author: post.author || '' };
        }
        return null;
    } catch (_) {}
    return null;
}

// ==================== RESOLVER ROUTER ====================
async function resolveVideo(platform, url) {
    switch (platform) {
        case 'twitter': return resolveTwitter(url);
        case 'instagram': return resolveInstagram(url);
        case 'youtube': return resolveYouTube(url);
        case 'facebook': return resolveFacebook(url);
        case 'reddit': return resolveReddit(url);
        default: return null;
    }
}

// ==================== DISCORD HELPERS ====================
function uploadLimitMB(guild) {
    const tier = guild ? (guild.premiumTier || 0) : 0;
    if (tier >= 3) return 100;
    if (tier >= 2) return 50;
    return 25;
}

const PLATFORM_EMOJI = { youtube: '▶️', instagram: '📸', twitter: '🐦', facebook: '📘', reddit: '🤖', pinterest: '📌' };
const PLATFORM_NAME = { youtube: 'YouTube', instagram: 'Instagram', twitter: 'Twitter/X', facebook: 'Facebook', reddit: 'Reddit', pinterest: 'Pinterest' };

function buildCaption(platform, info = {}) {
    const emoji = PLATFORM_EMOJI[platform] || '🎬';
    const name = PLATFORM_NAME[platform] || platform;
    const parts = [];
    let head = `${emoji} **${name}**`;
    if (info.author) head += ` — ${info.author}`;
    parts.push(head);
    if (info.title) parts.push(`> ${info.title.replace(/\n+/g, ' ').slice(0, 280)}`);
    parts.push('-# ✅ Auto-download');
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

        // Cooldown per channel+platform
        const now = Date.now();
        const key = `${message.channel.id}_${platform}`;
        const last = _cooldown.get(key) || 0;
        if (now - last < COOLDOWN_MS) return false;
        _cooldown.set(key, now);

        const emoji = PLATFORM_EMOJI[platform] || '🎬';
        const pname = PLATFORM_NAME[platform] || platform;

        const status = await message.channel.send({
            content: `${emoji} Mengambil video dari ${pname}...`
        }).catch(() => null);

        let resolved = null;
        try {
            resolved = await resolveVideo(platform, url);
        } catch (e) {
            log('WARN', `[videoDownloader] resolve gagal untuk ${platform}: ${e.message}`);
        }

        if (!resolved || !resolved.videoUrl) {
            const fail = `⚠️ Gagal mengambil video dari ${pname}. Video mungkin private atau platform tidak support.`;
            if (status) {
                status.edit({ content: fail })
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 10000))
                    .catch(() => {});
            }
            return true;
        }

        // Suppress original embed
        message.suppressEmbeds(true).catch(() => {});

        const caption = buildCaption(platform, resolved);

        // Download video buffer
        let buffer = null;
        try {
            const vres = await fetch(resolved.videoUrl, { headers: { 'User-Agent': UA } });
            if (vres.ok) buffer = Buffer.from(await vres.arrayBuffer());
        } catch (e) {
            log('WARN', `[videoDownloader] download video gagal: ${e.message}`);
        }

        const limitBytes = uploadLimitMB(message.guild) * 1024 * 1024;

        if (buffer && buffer.length <= limitBytes) {
            const file = new AttachmentBuilder(buffer, { name: `${platform}.mp4` });
            try {
                if (status) await status.edit({ content: caption, files: [file] });
                else await message.channel.send({ content: caption, files: [file] });
                return true;
            } catch (e) {
                log('WARN', `[videoDownloader] upload rejected: ${e.message}`);
            }
        }

        // Too large or download failed — send direct link
        const content = `${caption}\n-# Video terlalu besar untuk diupload — klik tombol di bawah.`;
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
    maybeHandleVideo,
    resolveTwitter,
    resolveInstagram,
    resolveYouTube,
    resolveFacebook,
    resolveReddit,
};
