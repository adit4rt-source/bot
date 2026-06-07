// systems/maintenance.js — Maintenance Mode toggle
// Saat AKTIF: semua fitur bot dimatikan SEMENTARA (command, tombol, menu, modal,
// mini-event, quest, XP/money chat, pet, farm notif) KECUALI:
//   - Streak (tetap jalan dari chat)
//   - Automod & Captcha (proteksi server tetap aktif)
//   - Owner bot (boleh tetap pakai command untuk administrasi)
//
// Cara mengaktifkan (pilih salah satu):
//   1. Env: MAINTENANCE_MODE=1  (set di Pterodactyl Startup, lalu restart)
//   2. File penanda: buat file kosong bernama `.maintenance` di folder bot
//
// Cara mematikan: set env MAINTENANCE_MODE=0 (paling gampang, override file penanda)
// ATAU hapus file .maintenance, lalu restart bot. Tidak ada kode fitur yang dihapus —
// semua balik normal.

const fs = require('fs');
const path = require('path');

const FLAG_FILE = path.join(__dirname, '..', '.maintenance');

// Owner yang tetap boleh pakai command saat maintenance (untuk administrasi).
const OWNER_IDS = (process.env.BOT_OWNER_IDS || process.env.ADMIN_IDS || '515920253910253569')
    .split(',').map(s => s.trim()).filter(Boolean);

function isMaintenance() {
    const env = String(process.env.MAINTENANCE_MODE || '').trim();
    if (env === '0' || env.toLowerCase() === 'false' || env.toLowerCase() === 'off') return false; // force OFF (override file)
    if (env === '1') return true;
    try { if (fs.existsSync(FLAG_FILE)) return true; } catch (e) { /* ignore */ }
    return false;
}

function isOwner(userId) {
    return OWNER_IDS.includes(String(userId));
}

module.exports = { isMaintenance, isOwner };
