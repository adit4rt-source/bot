// systems/logger.js - Error Logging System with file rotation and Discord channel support
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Get today's date string for log file naming
 */
function getDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Get formatted timestamp for log entries
 */
function getTimestamp() {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0];
    return `${date} ${time}`;
}

/**
 * Write log message to daily log file
 */
function logToFile(message) {
    try {
        const logFile = path.join(LOG_DIR, `${getDateString()}.log`);
        fs.appendFileSync(logFile, message + '\n', 'utf8');
    } catch (err) {
        console.error('[LOGGER] Failed to write to log file:', err.message);
    }
}

/**
 * Send log message to a Discord admin channel if configured
 */
async function logToChannel(guild, message) {
    if (!guild) return;
    try {
        const { getSetting } = require('../database');
        const logChannelId = getSetting(guild.id, 'log_channel', null);
        if (!logChannelId) return;

        const channel = guild.channels.cache.get(logChannelId);
        if (!channel) return;

        // Truncate message if too long for Discord
        const truncated = message.length > 1900 ? message.substring(0, 1900) + '\n...(truncated)' : message;
        await channel.send({ content: `\`\`\`\n${truncated}\n\`\`\`` }).catch(() => {});
    } catch (err) {
        // Silently fail - don't recurse logging
    }
}

/**
 * Main log function
 * @param {string} level - INFO, WARN, ERROR, CRITICAL
 * @param {string} message - Log message
 * @param {Error|object|null} error - Optional error object
 * @param {object|null} context - Optional context (guild, user, command)
 */
function log(level, message, error = null, context = {}) {
    const timestamp = getTimestamp();
    const levelStr = level.toUpperCase().padEnd(8);

    let logEntry = `[${timestamp}] [${levelStr}] ${message}`;

    if (error && error.stack) {
        logEntry += `\n  Stack: ${error.stack.split('\n').slice(0, 3).join('\n  ')}`;
    } else if (error && typeof error === 'string') {
        logEntry += `\n  Detail: ${error}`;
    } else if (error) {
        logEntry += `\n  Detail: ${JSON.stringify(error).substring(0, 500)}`;
    }

    if (context.guildId) logEntry += `\n  Guild: ${context.guildId}`;
    if (context.userId) logEntry += `\n  User: ${context.userId}`;
    if (context.command) logEntry += `\n  Command: ${context.command}`;

    // Console output with color
    const colors = {
        INFO: '\x1b[36m',     // Cyan
        WARN: '\x1b[33m',     // Yellow
        ERROR: '\x1b[31m',    // Red
        CRITICAL: '\x1b[35m'  // Magenta
    };
    const reset = '\x1b[0m';
    const color = colors[level.toUpperCase()] || '';
    console.log(`${color}${logEntry}${reset}`);

    // Write to file
    logToFile(logEntry);

    // Send critical/error to Discord channel
    if (context.guild && (level === 'ERROR' || level === 'CRITICAL')) {
        logToChannel(context.guild, logEntry);
    }
}

/**
 * Rotate old logs - keep only last 30 days
 */
function rotateLogs() {
    try {
        const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

        for (const file of files) {
            const filePath = path.join(LOG_DIR, file);
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs < thirtyDaysAgo) {
                fs.unlinkSync(filePath);
                log('INFO', `Rotated old log file: ${file}`);
            }
        }
    } catch (err) {
        console.error('[LOGGER] Failed to rotate logs:', err.message);
    }
}

/**
 * Wrap an async event handler with error catching
 */
function wrapHandler(handlerName, handler) {
    return async (...args) => {
        try {
            await handler(...args);
        } catch (err) {
            const context = {};
            // Try to extract context from interaction/message
            const firstArg = args[0];
            if (firstArg) {
                if (firstArg.guild) context.guild = firstArg.guild;
                if (firstArg.guild?.id) context.guildId = firstArg.guild.id;
                if (firstArg.user?.id) context.userId = firstArg.user.id;
                else if (firstArg.author?.id) context.userId = firstArg.author.id;
                if (firstArg.commandName) context.command = `/${firstArg.commandName}`;
                else if (firstArg.customId) context.command = firstArg.customId;
            }
            log('ERROR', `${handlerName}: ${err.message}`, err, context);

            // Try to respond to user if it's an interaction
            if (firstArg && firstArg.reply) {
                try {
                    if (!firstArg.replied && !firstArg.deferred) {
                        await firstArg.reply({ content: '❌ Terjadi error. Silakan coba lagi.', ephemeral: true });
                    } else if (firstArg.deferred && !firstArg.replied) {
                        await firstArg.editReply({ content: '❌ Terjadi error. Silakan coba lagi.' });
                    }
                } catch (replyErr) {
                    // Can't reply - already replied or expired
                }
            }
        }
    };
}

// Run rotation on startup
rotateLogs();

module.exports = { log, logToFile, logToChannel, rotateLogs, wrapHandler };
