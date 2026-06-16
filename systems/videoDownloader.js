// systems/videoDownloader.js — Multi-platform video downloader via Cobalt API
//
// Detects video links from YouTube, Instagram, Twitter/X, Facebook, Reddit,
// Pinterest, etc. Uses Cobalt API (same principle as tikwm.com for TikTok):
// just hit the API with a URL and get a download link back. No setup needed.
//
// Cobalt supports 20+ platforms from a single endpoint:
//   POST / with { url } → { status: "tunnel"|"redirect", url: "..." }
//
// Multiple public instances are tried in order (fallback chain).
// Per-guild toggle: server_settings key `video_convert` ('1' = on, '0' = off — default OFF).

const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getSetting } = require('../database');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

// ==================== COBALT INSTANCES (public, no auth) ====================
// Tried in order. If one fails/blocks, move to next. Same concept as tikwm.
// Updated from cobalt.directory and community reports.
const COBALT_INSTANCES = [
    'https://cobalt-api.meowing.de',
    'https://cobalt.ollayor.uz',
    'https://cobalt-api.ayo.tf',
    'https://co.eepy.today',
    'https://cobalt.api.timelessnesses.me',
    'https://api.co.tskau.team',
];

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

// ==================== COBALT RESOLVER ====================
// Try each instance until one works. Same reliability pattern as tikwm.
async function resolveCobalt(videoUrl) {
    // Custom instance from env takes priority
    const envUrl = process.env.COBALT_API_URL;
    const envKey = process.env.COBALT_API_KEY || '';
    const instances = envUrl
        ? [envUrl.replace(/\/+$/, ''), ...COBALT_INSTANCES]
        : COBALT_INSTANCES;

    const body = JSON.stringify({
        url: videoUrl,
        videoQuality: '720',
        filenameStyle: 'basic',
    });

    for (const instance of instances) {
        // Try both endpoints: "/" (v10+) and "/api/json" (older versions)
        const endpoints = [`${instance}/`, `${instance}/api/json`];

        for (const endpoint of endpoints) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 15000);

                const headers = {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'User-Agent': UA,
                };
                // Auth: use COBALT_API_KEY as Bearer token for the env instance,
                // or for ALL instances if no specific COBALT_API_URL is set
                const isEnvInstance = envUrl && instance === envUrl.replace(/\/+$/, '');
                if (envKey && (isEnvInstance || !envUrl)) {
                    headers['Authorization'] = `Bearer ${envKey}`;
                }

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body,
                    signal: controller.signal,
                });
                clearTimeout(timer);

                if (!res.ok) {
                    log('INFO', `[videoDownloader] ${instance} → HTTP ${res.status} (skip)`);
                    continue;
                }
                const json = await res.json();

                // Success responses (v10+)
                if ((json.status === 'tunnel' || json.status === 'redirect' || json.status === 'stream') && json.url) {
                    log('INFO', `[videoDownloader] ✅ ${instance} berhasil resolve video`);
                    return { videoUrl: json.url, filename: json.filename || null };
                }

                // Picker (carousel — e.g. Instagram multi-photo/video)
                if (json.status === 'picker' && Array.isArray(json.picker)) {
                    const vid = json.picker.find(p => p.type === 'video') || json.picker[0];
                    if (vid && vid.url) {
                        log('INFO', `[videoDownloader] ✅ ${instance} berhasil resolve (picker)`);
                        return { videoUrl: vid.url, filename: vid.filename || null };
                    }
                }

                // Older API format (v7/v8): { status: "stream"/"redirect", url: "..." }
                if (json.url && !json.status) {
                    log('INFO', `[videoDownloader] ✅ ${instance} berhasil (legacy format)`);
                    return { videoUrl: json.url, filename: null };
                }

                // Error response — log and try next
                const errMsg = json.error?.code || json.text || json.status || 'unknown';
                log('INFO', `[videoDownloader] ${instance} → error: ${errMsg}`);
            } catch (e) {
                log('INFO', `[videoDownloader] ${instance} → ${e.name === 'AbortError' ? 'timeout' : e.message}`);
                continue;
            }
        }
    }

    return null; // All instances failed
}

// ==================== DISCORD HELPERS ====================
function uploadLimitMB(guild) {
    const tier = guild ? (guild.premiumTier || 0) : 0;
    if (tier >= 3) return 100;
    if (tier >= 2) return 50;
    return 25;
}

const PLATFORM_EMOJI = { youtube: '▶️', instagram: '📸', twitter: '🐦', facebook: '📘', reddit: '🤖', pinterest: '📌', bluesky: '🦋', threads: '🧵' };
const PLATFORM_NAME = { youtube: 'YouTube', instagram: 'Instagram', twitter: 'Twitter/X', facebook: 'Facebook', reddit: 'Reddit', pinterest: 'Pinterest', bluesky: 'Bluesky', threads: 'Threads' };

function buildCaption(platform) {
    const emoji = PLATFORM_EMOJI[platform] || '🎬';
    const name = PLATFORM_NAME[platform] || platform;
    return `${emoji} **${name}**\n-# ✅ Auto-download`;
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

        // Resolve via Cobalt (tries multiple instances)
        let resolved = null;
        try {
            resolved = await resolveCobalt(url);
        } catch (e) {
            log('WARN', `[videoDownloader] resolve gagal untuk ${platform}: ${e.message}`);
        }

        if (!resolved || !resolved.videoUrl) {
            log('WARN', `[videoDownloader] Semua Cobalt instances gagal untuk URL: ${url.slice(0, 80)}...`);
            const fail = `⚠️ Gagal mengambil video dari ${pname}. Video mungkin private/tidak didukung.`;
            if (status) {
                status.edit({ content: fail })
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 10000))
                    .catch(() => {});
            }
            return true;
        }

        // Suppress original embed
        message.suppressEmbeds(true).catch(() => {});

        const caption = buildCaption(platform);

        // Download video buffer
        let buffer = null;
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 30000);
            const vres = await fetch(resolved.videoUrl, {
                headers: { 'User-Agent': UA },
                signal: controller.signal,
            });
            clearTimeout(timer);
            if (vres.ok) buffer = Buffer.from(await vres.arrayBuffer());
        } catch (e) {
            log('WARN', `[videoDownloader] download video gagal: ${e.message}`);
        }

        const limitBytes = uploadLimitMB(message.guild) * 1024 * 1024;
        const ext = (resolved.filename && resolved.filename.includes('.'))
            ? resolved.filename.split('.').pop().slice(0, 4)
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
    COBALT_INSTANCES,
    detectVideoUrl,
    isEnabled,
    setEnabled,
    resolveCobalt,
    maybeHandleVideo,
};
