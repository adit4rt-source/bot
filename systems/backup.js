// systems/backup.js - Database Auto-Backup System (every 6 hours + startup)
const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const DB_PATH = path.join(__dirname, '..', 'economy.sqlite');
const BACKUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
const MAX_BACKUP_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Ensure backups directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

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
 * Create a backup of the SQLite database
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

        // Clean old backups after creating new one
        cleanOldBackups();

        return true;
    } catch (err) {
        log('ERROR', 'Backup failed', err);
        return false;
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
 */
function startBackupSchedule() {
    // Immediate backup on startup (crash recovery)
    log('INFO', '💾 Creating startup backup...');
    createBackup();

    // Schedule recurring backups
    setInterval(() => {
        log('INFO', '💾 Running scheduled backup...');
        createBackup();
    }, BACKUP_INTERVAL);

    log('INFO', '💾 Auto-backup scheduled: setiap 6 jam');
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

module.exports = { startBackupSchedule, createBackup, cleanOldBackups, listBackups };
