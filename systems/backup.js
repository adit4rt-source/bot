// systems/backup.js - Database Auto-Backup System (every 6 hours + startup)
// Backs up locally AND uploads to a Discord channel for off-site safety.
const fs = require('fs');
const path = require('path');
const { log } = require('./logger');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const DB_PATH = path.join(__dirname, '..', 'economy.sqlite');
const BACKUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
const MAX_BACKUP_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Discord channel for off-site backup uploads
const BACKUP_CHANNEL_ID = '1513958525234319501';

// Ensure backups directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Reference to the Discord client (set by startBackupSchedule)
let _client = null;

/**
 * Get formatted date-time string for backup filename
 */
function getBackupTimestamp() {
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const time = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
    return `${date}_${time}`;
}

/**
 * Create a backup of the SQLite database (local + Discord upload)
 */
function createBackup() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            log('WARN', 'Backup skipped: economy.sqlite not found');
            return false;
        }

        const timestamp = getBackupTimestamp();
        const backupFile = path.join(BACKUP_DIR, `economy_${timestamp}.sqlite`);

        // Copy database file
        fs.copyFileSync(DB_PATH, backupFile);

        const stats = fs.statSync(backupFile);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        log('INFO', `💾 Backup created: economy_${timestamp}.sqlite (${sizeMB} MB)`);

        // Upload to Discord channel (off-site backup)
        uploadToDiscord(backupFile, timestamp, sizeMB).catch(err => {
            log('WARN', `☁️ Discord upload failed: ${err.message}`);
        });

        // Clean old backups after creating new one
        cleanOldBackups();

        return true;
    } catch (err) {
        log('ERROR', 'Backup failed', err);
        return false;
    }
}

/**
 * Upload backup file to Discord channel for off-site storage
 */
async function uploadToDiscord(filePath, timestamp, sizeMB) {
    if (!_client) {
        log('WARN', '☁️ Discord upload skipped: client not ready');
        return;
    }

    try {
        const channel = await _client.channels.fetch(BACKUP_CHANNEL_ID).catch(() => null);
        if (!channel) {
            log('WARN', `☁️ Backup channel not found: ${BACKUP_CHANNEL_ID}`);
            return;
        }

        const fileName = path.basename(filePath);
        const fileSize = fs.statSync(filePath).size;

        // Discord boost limit: 25MB per file (50MB with level 2, 100MB with level 3)
        // If file is too large, compress or warn
        if (fileSize > 25 * 1024 * 1024) {
            log('WARN', `☁️ Backup too large for Discord (${sizeMB} MB). Uploading info only.`);
            const embed = new EmbedBuilder()
                .setColor('#FF6600')
                .setTitle('⚠️ Backup Terlalu Besar')
                .setDescription(
                    `File backup **${sizeMB} MB** melebihi limit upload Discord.\n` +
                    `Backup lokal tetap tersimpan di server.`
                )
                .setTimestamp();
            await channel.send({ embeds: [embed] });
            return;
        }

        const attachment = new AttachmentBuilder(filePath, { name: fileName });
        const embed = new EmbedBuilder()
            .setColor('#00D166')
            .setTitle('💾 Auto-Backup Berhasil')
            .setDescription(
                `**File:** \`${fileName}\`\n` +
                `**Ukuran:** ${sizeMB} MB\n` +
                `**Waktu:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
                `> Backup ini aman di Discord. Jika server Pterodactyl mati,\n` +
                `> download file ini dan taruh sebagai \`economy.sqlite\` untuk restore.`
            )
            .setFooter({ text: 'Auto-backup setiap 6 jam | Simpan 7 hari terakhir' })
            .setTimestamp();

        await channel.send({ embeds: [embed], files: [attachment] });
        log('INFO', `☁️ Backup uploaded to Discord: ${fileName} (${sizeMB} MB)`);
    } catch (err) {
        log('WARN', `☁️ Discord upload error: ${err.message}`);
    }
}

/**
 * Remove backups older than 7 days
 */
function cleanOldBackups() {
    try {
        const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('economy_') && f.endsWith('.sqlite'));
        const cutoff = Date.now() - MAX_BACKUP_AGE;
        let removed = 0;

        for (const file of files) {
            const filePath = path.join(BACKUP_DIR, file);
            const stat = fs.statSync(filePath);
            if (stat.mtimeMs < cutoff) {
                fs.unlinkSync(filePath);
                removed++;
            }
        }

        if (removed > 0) {
            log('INFO', `🗑️ Cleaned ${removed} old backup(s) (>7 days)`);
        }
    } catch (err) {
        log('WARN', 'Failed to clean old backups', err);
    }
}

/**
 * Start the automatic backup schedule (every 6 hours)
 * @param {Client} client - Discord.js client instance
 */
function startBackupSchedule(client) {
    _client = client || null;

    // Delay startup backup by 10 seconds to ensure bot is fully connected
    setTimeout(() => {
        log('INFO', '💾 Creating startup backup...');
        createBackup();
    }, 10000);

    // Schedule recurring backups
    setInterval(() => {
        log('INFO', '💾 Running scheduled backup...');
        createBackup();
    }, BACKUP_INTERVAL);

    log('INFO', `💾 Auto-backup scheduled: setiap 6 jam → Discord #backup (${BACKUP_CHANNEL_ID})`);
}

/**
 * Get list of all backups with metadata
 */
function listBackups() {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('economy_') && f.endsWith('.sqlite'))
            .map(f => {
                const filePath = path.join(BACKUP_DIR, f);
                const stat = fs.statSync(filePath);
                return {
                    name: f,
                    size: stat.size,
                    sizeMB: (stat.size / (1024 * 1024)).toFixed(2),
                    created: stat.mtimeMs
                };
            })
            .sort((a, b) => b.created - a.created);
        return files;
    } catch (err) {
        return [];
    }
}

/**
 * Force an immediate backup + upload (for admin command use)
 */
function forceBackup() {
    return createBackup();
}

module.exports = { startBackupSchedule, createBackup, cleanOldBackups, listBackups, forceBackup };
