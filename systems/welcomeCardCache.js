// systems/welcomeCardCache.js — Caching utility for remote image backgrounds and assets
// Prevents duplicate concurrent HTTP fetches, avoids 429 rate limits, and buffers 404/500 failures.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// In-memory cache for failed URLs to avoid hammer on dead links
// TTL is 1 hour
const failedUrls = new Map();
const FAIL_CACHE_TTL = 60 * 60 * 1000;

// Disk cache TTL is 24 hours
const SUCCESS_CACHE_TTL = 24 * 60 * 60 * 1000;

// Track active/pending downloads to prevent duplicate concurrent downloads of the same URL
const pendingDownloads = new Map();

/**
 * Downloads a remote image and saves it to assets/cache/.
 * Returns the absolute path of the cached file.
 * 
 * @param {string} url - Remote image URL
 * @returns {Promise<string>} - Absolute path to cached image file
 */
async function getCachedImage(url) {
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        throw new Error('Invalid URL');
    }

    const now = Date.now();

    // 1. Check in-memory failure cache
    if (failedUrls.has(url)) {
        const failTime = failedUrls.get(url);
        if (now - failTime < FAIL_CACHE_TTL) {
            throw new Error(`URL is in temporary failure cache (recently failed)`);
        } else {
            failedUrls.delete(url);
        }
    }

    // 2. Prepare paths
    const cacheDir = path.join(__dirname, '..', 'assets', 'cache');
    try {
        await fs.promises.mkdir(cacheDir, { recursive: true });
    } catch (_) {}

    const hash = crypto.createHash('md5').update(url).digest('hex');
    const extMatch = url.match(/\.(png|jpg|jpeg|gif|webp|svg)/i);
    const ext = extMatch ? extMatch[0] : '.png';
    const cachePath = path.join(cacheDir, `${hash}${ext}`);

    // 3. Check if cached file exists on disk and is still fresh
    try {
        const stats = await fs.promises.stat(cachePath);
        if (now - stats.mtimeMs < SUCCESS_CACHE_TTL && stats.size > 0) {
            return cachePath;
        }
    } catch (_) {
        // File doesn't exist or is invalid, proceed to download
    }

    // 4. Check if there is already an active download for this URL to avoid concurrent duplicate requests
    if (pendingDownloads.has(url)) {
        return pendingDownloads.get(url);
    }

    // Define the download function
    const downloadPromise = (async () => {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000); // 15s timeout
            const res = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
                }
            });
            clearTimeout(timer);

            if (!res.ok) {
                throw new Error(`remote source rejected with status code ${res.status}`);
            }

            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            if (buffer.length === 0) {
                throw new Error('Downloaded buffer is empty');
            }

            // Write atomically to a temporary file, then rename to destination
            const tmpPath = path.join(cacheDir, `${hash}.tmp.${Math.random().toString(36).substring(2)}`);
            await fs.promises.writeFile(tmpPath, buffer);

            try {
                await fs.promises.rename(tmpPath, cachePath);
            } catch (renameErr) {
                // On Windows, rename fails if destination already exists.
                // In that case, check if the existing file has content, delete the temp file, and use it.
                try {
                    await fs.promises.unlink(tmpPath);
                } catch (_) {}

                const stats = await fs.promises.stat(cachePath);
                if (stats.size === 0) {
                    throw renameErr;
                }
            }

            return cachePath;
        } catch (err) {
            failedUrls.set(url, Date.now());
            console.error(`[welcomeCardCache] Gagal download background ${url}:`, err.message);
            throw err;
        } finally {
            pendingDownloads.delete(url);
        }
    })();

    pendingDownloads.set(url, downloadPromise);
    return downloadPromise;
}

module.exports = {
    getCachedImage,
    failedUrls,
    pendingDownloads,
    FAIL_CACHE_TTL,
    SUCCESS_CACHE_TTL
};
