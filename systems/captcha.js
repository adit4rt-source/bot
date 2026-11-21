// systems/captcha.js - Anti-abuse captcha system
// Every 15 minutes of active command usage, user gets a captcha challenge.
// Fail/ignore = 5 minute block from ALL commands. Pass = reset timer.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// In-memory tracking (resets on restart — intentional, non-punitive)
const activityTimers = new Map();   // `${guildId}_${userId}` -> lastCaptchaPass timestamp
const blockedUsers = new Map();     // `${guildId}_${userId}` -> unblockAt timestamp
const pendingCaptchas = new Map();  // `${guildId}_${userId}` -> { code, expires, messageId }

const CAPTCHA_INTERVAL_MS = 15 * 60 * 1000;  // trigger captcha every 15 min of activity
const CAPTCHA_TIMEOUT_MS = 30 * 1000;        // 30 seconds to answer
const BLOCK_DURATION_MS = 5 * 60 * 1000;     // 5 min block on fail

// Generate random alphanumeric code (5 chars, no ambiguous chars)
function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// Check if user is currently blocked
function isBlocked(guildId, userId) {
    const key = `${guildId}_${userId}`;
    const until = blockedUsers.get(key);
    if (!until) return false;
    if (Date.now() >= until) { blockedUsers.delete(key); return false; }
    return true;
}

// Get remaining block time in seconds
function getBlockRemaining(guildId, userId) {
    const key = `${guildId}_${userId}`;
    const until = blockedUsers.get(key);
    if (!until || Date.now() >= until) return 0;
    return Math.ceil((until - Date.now()) / 1000);
}

// Check if user has a pending captcha that they haven't answered yet
function hasPendingCaptcha(guildId, userId) {
    const key = `${guildId}_${userId}`;
    const pending = pendingCaptchas.get(key);
    if (!pending) return false;
    if (Date.now() > pending.expires) {
        // Expired without answering — block them
        pendingCaptchas.delete(key);
        blockedUsers.set(key, Date.now() + BLOCK_DURATION_MS);
        return false; // not pending anymore, they're blocked now
    }
    return true;
}

// Should we trigger a captcha? (called on every command)
// Returns true if captcha should be shown NOW.
function shouldTriggerCaptcha(guildId, userId) {
    const key = `${guildId}_${userId}`;
    
    // Don't trigger if already pending or blocked
    if (pendingCaptchas.has(key)) return false;
    if (isBlocked(guildId, userId)) return false;
    
    const lastPass = activityTimers.get(key) || 0;
    if (Date.now() - lastPass >= CAPTCHA_INTERVAL_MS) {
        // First command ever or 15 min since last pass — give them a free pass on the first one
        if (lastPass === 0) { activityTimers.set(key, Date.now()); return false; }
        return true;
    }
    return false;
}

// Send captcha challenge. Returns the interaction reply (ephemeral).
async function sendCaptcha(interaction) {
    const key = `${interaction.guild.id}_${interaction.user.id}`;
    const code = generateCode();
    
    pendingCaptchas.set(key, {
        code,
        expires: Date.now() + CAPTCHA_TIMEOUT_MS,
    });
    
    const embed = new EmbedBuilder()
        .setColor('#FF9800')
        .setTitle('🔒 Verifikasi — Anti Bot')
        .setDescription(
            `Untuk melanjutkan, ketik kode berikut di chat:\n\n` +
            `## \`${code}\`\n\n` +
            `⏱️ Waktu: **30 detik**\n` +
            `❌ Gagal/timeout = block 5 menit`
        )
        .setFooter({ text: 'Sistem anti-macro | Ketik kode di chat ini' });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    
    // Set up auto-block on timeout
    setTimeout(() => {
        const pending = pendingCaptchas.get(key);
        if (pending && pending.code === code) {
            pendingCaptchas.delete(key);
            blockedUsers.set(key, Date.now() + BLOCK_DURATION_MS);
        }
    }, CAPTCHA_TIMEOUT_MS);
}

// Verify a chat message as captcha answer. Call from messageCreate.
// Returns true if the message was a captcha answer (consumed).
function verifyCaptchaMessage(message) {
    const key = `${message.guild.id}_${message.author.id}`;
    const pending = pendingCaptchas.get(key);
    if (!pending) return false;
    
    const input = message.content.trim().toUpperCase();
    if (input === pending.code) {
        // PASS
        pendingCaptchas.delete(key);
        activityTimers.set(key, Date.now());
        message.reply({ content: '✅ Verifikasi berhasil! Lanjutkan bermain. 🎮' }).then(msg => {
            setTimeout(() => msg.delete().catch(() => {}), 5000);
        }).catch(() => {});
        try { message.delete().catch(() => {}); } catch (e) {}
        return true;
    } else if (input.length >= 4 && input.length <= 6) {
        // Wrong code attempt (looks like they tried)
        message.reply({ content: `❌ Kode salah! Coba lagi — ketik kode yang ada di gambar. (${Math.ceil((pending.expires - Date.now()) / 1000)}s tersisa)` }).then(msg => {
            setTimeout(() => msg.delete().catch(() => {}), 5000);
        }).catch(() => {});
        try { message.delete().catch(() => {}); } catch (e) {}
        return true;
    }
    
    return false; // Not a captcha attempt, process normally
}

module.exports = {
    isBlocked,
    getBlockRemaining,
    hasPendingCaptcha,
    shouldTriggerCaptcha,
    sendCaptcha,
    verifyCaptchaMessage,
    CAPTCHA_INTERVAL_MS,
    CAPTCHA_TIMEOUT_MS,
    BLOCK_DURATION_MS
};
