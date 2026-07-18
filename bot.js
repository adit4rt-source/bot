require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events, REST, Routes } = require('discord.js');

// Ensure Git identity is configured locally for Pterodactyl auto-update
try {
    const fs = require('fs');
    if (fs.existsSync('.git')) {
        const { execSync } = require('child_process');
        execSync('git config user.name "adit4rt-source"');
        execSync('git config user.email "adit4rt@icloud.com"');
    }
} catch (e) {
    // Silently ignore
}

// ================= BOT VERSION =================
const BOT_VERSION = '3.11.0';
const BUILD_DATE = '2026-07-18';

// Load logger first (so everything else can use it)
const { log, wrapHandler } = require('./systems/logger');

// ================= AUTO-RESTORE (env-gated, runs BEFORE database loads) =================
// Set RESTORE_BACKUP=<nama_file_backup> di env Pterodactyl untuk memulihkan DB saat start.
// Contoh: RESTORE_BACKUP=economy_2026-06-07_10-41-50.sqlite
// Bot akan: backup DB sekarang -> timpa economy.sqlite dengan backup itu -> lanjut start.
// Setelah berhasil, KOSONGKAN/HAPUS env RESTORE_BACKUP supaya tidak restore berulang tiap restart.
(function maybeAutoRestore() {
    const target = (process.env.RESTORE_BACKUP || '').trim();

    // Mode list: set LIST_BACKUPS=1 untuk cetak daftar backup ke console saat start.
    if (String(process.env.LIST_BACKUPS || '').trim() === '1') {
        try {
            const fs = require('fs');
            const path = require('path');
            const ROOT = __dirname;
            const out = [];
            const bdir = path.join(ROOT, 'backups');
            if (fs.existsSync(bdir)) for (const f of fs.readdirSync(bdir)) if (f.startsWith('economy_') && f.endsWith('.sqlite')) { const p = path.join(bdir, f); out.push({ f, m: fs.statSync(p).mtimeMs }); }
            for (const f of fs.readdirSync(ROOT)) if (f.startsWith('economy.backup-') && f.endsWith('.sqlite')) { const p = path.join(ROOT, f); out.push({ f, m: fs.statSync(p).mtimeMs }); }
            out.sort((a, b) => b.m - a.m);
            log('INFO', '===== DAFTAR BACKUP (terbaru -> terlama) =====');
            if (!out.length) log('INFO', '(kosong)');
            out.forEach((b, i) => log('INFO', `${i + 1}. ${b.f}  |  ${new Date(b.m).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`));
            log('INFO', '===== Set RESTORE_BACKUP=<nama_file> untuk memulihkan, lalu restart =====');
        } catch (e) { log('ERROR', `[LIST_BACKUPS] ${e.message}`); }
    }

    if (!target) return;
    try {
        const fs = require('fs');
        const path = require('path');
        const ROOT = __dirname;
        const DB_PATH = path.join(ROOT, 'economy.sqlite');
        // Cari file backup di backups/ atau di root
        const candidates = [
            path.join(ROOT, 'backups', target),
            path.join(ROOT, target),
        ];
        const src = candidates.find(p => fs.existsSync(p));
        if (!src) {
            log('ERROR', `[AUTO-RESTORE] Backup "${target}" tidak ditemukan (cek backups/ atau root). Start normal tanpa restore.`);
            return;
        }
        if (fs.existsSync(DB_PATH)) {
            const safety = `economy.pre-restore-full-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
            fs.copyFileSync(DB_PATH, path.join(ROOT, safety));
            log('WARN', `[AUTO-RESTORE] Backup kondisi DB sekarang -> ${safety}`);
        }
        // PENTING: hapus sidecar WAL/SHM lama sebelum menimpa DB. Kalau tidak, SQLite
        // akan menerapkan WAL basi (dari DB lama) ke DB baru -> "disk image is malformed".
        for (const ext of ['-wal', '-shm', '-journal']) {
            try { if (fs.existsSync(DB_PATH + ext)) fs.unlinkSync(DB_PATH + ext); } catch (e) {}
        }
        fs.copyFileSync(src, DB_PATH);
        // Pastikan sidecar dari file backup (jika ikut) juga bersih.
        for (const ext of ['-wal', '-shm', '-journal']) {
            try { if (fs.existsSync(DB_PATH + ext)) fs.unlinkSync(DB_PATH + ext); } catch (e) {}
        }
        log('INFO', `[AUTO-RESTORE] economy.sqlite dipulihkan dari: ${path.relative(ROOT, src)}`);
        log('WARN', `[AUTO-RESTORE] KOSONGKAN env RESTORE_BACKUP sekarang agar tidak restore lagi tiap restart!`);
    } catch (e) {
        log('ERROR', `[AUTO-RESTORE] Gagal: ${e.message}. Start normal tanpa restore.`);
    }
})();

// ================= AUTO-RECOVERY (DB korup -> pakai backup sehat terbaru) =================
// Cek integritas economy.sqlite. Kalau "malformed"/korup, cari backup economy_* yang
// LULUS PRAGMA integrity_check (terbaru dulu) lalu pakai itu. Sidecar WAL/SHM dibersihkan.
(function autoRecoverCorruptDb() {
    const fs = require('fs');
    const path = require('path');
    const ROOT = __dirname;
    const DB_PATH = path.join(ROOT, 'economy.sqlite');
    const Database = require('better-sqlite3');

    function isHealthy(file) {
        let d;
        try {
            d = new Database(file, { readonly: true });
            const r = d.pragma('integrity_check', { simple: true });
            d.close();
            return r === 'ok';
        } catch (e) { try { if (d) d.close(); } catch (_) {} return false; }
    }

    function cleanSidecar(p) { for (const ext of ['-wal', '-shm', '-journal']) { try { if (fs.existsSync(p + ext)) fs.unlinkSync(p + ext); } catch (e) {} } }

    try {
        if (!fs.existsSync(DB_PATH)) return;
        if (isHealthy(DB_PATH)) return; // DB sehat, tidak perlu recovery

        log('ERROR', '[AUTO-RECOVERY] economy.sqlite KORUP! Mencari backup sehat...');
        // Kumpulkan kandidat backup (terbaru -> terlama)
        const cands = [];
        const bdir = path.join(ROOT, 'backups');
        try { if (fs.existsSync(bdir)) for (const f of fs.readdirSync(bdir)) if (f.startsWith('economy_') && f.endsWith('.sqlite')) cands.push({ p: path.join(bdir, f), m: fs.statSync(path.join(bdir, f)).mtimeMs, rel: `backups/${f}` }); } catch (e) {}
        try { for (const f of fs.readdirSync(ROOT)) if (f.startsWith('economy.backup-') && f.endsWith('.sqlite')) cands.push({ p: path.join(ROOT, f), m: fs.statSync(path.join(ROOT, f)).mtimeMs, rel: f }); } catch (e) {}
        cands.sort((a, b) => b.m - a.m);

        const healthy = cands.find(c => isHealthy(c.p));
        if (!healthy) { log('ERROR', '[AUTO-RECOVERY] Tidak ada backup sehat ditemukan! Bot mungkin gagal start.'); return; }

        // Simpan DB korup untuk forensik, lalu pulihkan dari backup sehat
        try { fs.copyFileSync(DB_PATH, path.join(ROOT, `economy.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`)); } catch (e) {}
        cleanSidecar(DB_PATH);
        fs.copyFileSync(healthy.p, DB_PATH);
        cleanSidecar(DB_PATH);
        log('INFO', `[AUTO-RECOVERY] ✅ Dipulihkan dari backup sehat: ${healthy.rel} (${new Date(healthy.m).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB)`);
    } catch (e) {
        log('ERROR', `[AUTO-RECOVERY] Gagal: ${e.message}`);
    }
})();

// Load database (runs migrations on require)
require('./database');

// Load command definitions
const { commands } = require('./commands/_register');

// Load event handlers
const handleMessageCreate = require('./events/messageCreate');
const handleVoiceStateUpdate = require('./events/voiceStateUpdate');
const handleReactionAdd = require('./events/reactionAdd');
const handleInteractionCreate = require('./events/interactionCreate');

// Load API server (Dashboard)
const { startApiServer, setDiscordClient } = require('./api');

// Load centralized scheduler (manages all recurring jobs)
const scheduler = require('./systems/scheduler');

// One-time data reset hook (env-gated)
const { maybeRunStartupReset } = require('./systems/dataReset');

// Guild join/leave logger + update log
const { onGuildCreate, onGuildDelete, postUpdateLog } = require('./systems/guildLog');

// ================= SETUP BOT =================
const TOKEN = process.env.DISCORD_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const CLIENT_ID = process.env.CLIENT_ID || '1058955900389445672';

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMembers],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember]
});

// ================= GLOBAL ERROR HANDLERS =================
process.on('uncaughtException', (err) => {
    log('CRITICAL', 'Uncaught Exception', err);
});

process.on('unhandledRejection', (err) => {
    log('CRITICAL', 'Unhandled Rejection', err);
});

// ================= RATE LIMIT HANDLING =================
client.rest.on('rateLimited', (info) => {
    log('WARN', `Rate limited: ${info.route} | Retry after: ${info.retryAfter}ms | Method: ${info.method}`);
});

// ================= BOT READY =================
client.once(Events.ClientReady, async c => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀 Bot siap! Login sebagai ${c.user.tag}`);
    console.log(`📦 Version: v${BOT_VERSION} | Build: ${BUILD_DATE}`);
    console.log(`⚙️ Commands: ${commands.length} registered`);
    console.log(`🏠 Servers: ${c.guilds.cache.size}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    log('INFO', `Bot started: v${BOT_VERSION} | ${c.guilds.cache.size} servers | ${commands.length} commands`);

    // Set initial bot status
    const { ActivityType } = require('discord.js');
    client.user.setPresence({
        activities: [{ name: `/help | ${c.guilds.cache.size} servers`, type: ActivityType.Playing }],
        status: 'online'
    });

    // One-time data reset (only if env RESET_DATA=<token> is set & not used before)
    try { maybeRunStartupReset(); } catch (e) { console.error('Startup reset error:', e); }

    // ================= CENTRALIZED SCHEDULER =================
    // Start all recurring jobs (reminders, auto-harvest, backup, panel refresh,
    // voice tick, giveaway, lottery, livestock, presence update)
    setDiscordClient(client);
    startApiServer();
    scheduler.start(client);

    // Send update announcement (once per version)
    const { sendUpdateAnnouncement } = require('./systems/updateAnnounce');
    sendUpdateAnnouncement(client);

    // Initialize seasonal leaderboard (snapshots baselines + handles monthly rollover)
    try {
        const { ensureSeason, getSeasonInfo } = require('./systems/season');
        ensureSeason();
        const info = getSeasonInfo();
        console.log(`🗓️ Seasonal leaderboard: season ${info.seasonId} (sisa ${info.daysLeft} hari)`);
    } catch (e) { console.error('Season init error:', e); }

    // Background card prefetch (downloads Pokemon cards while bot runs)
    try {
        const { db } = require('./database');
        const count = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
        console.log(`🎴 TCG Cache: ${count.toLocaleString('id-ID')} cards currently cached`);

        const { startBackgroundPrefetch } = require('./systems/cardPrefetch');
        startBackgroundPrefetch();
    } catch (e) { console.error('Card prefetch error:', e.message); }

    // Sync slash commands
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log(`✅ Slash commands synced (${commands.length} commands)`);
        log('INFO', `Slash commands synced: ${commands.length} commands`);
    } catch (error) {
        console.error('❌ Failed to sync commands:', error);
        log('ERROR', 'Failed to sync slash commands', error);
    }

    // Post update changelog (only once per version, deduped)
    const { EmbedBuilder: ChangelogEmbed } = require('discord.js');
    await postUpdateLog(client, BOT_VERSION, [
        new ChangelogEmbed()
            .setColor('#8e44ad')
            .setTitle(`🌑 ASCENDANT UPDATE — v${BOT_VERSION}`)
            .setDescription(
                `**Release v${BOT_VERSION}** — ${BUILD_DATE}\n\n` +
                `Paket endgame **Ascendant**: Skill T5, Ability T4, Nightmare Dungeon & Skill Reroll!\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
            )
            .setTimestamp(),

        new ChangelogEmbed()
            .setColor('#E74C3C')
            .setTitle('⚔️ Skill Tier 5 (Lv.150) + Ability Slot 4')
            .setDescription(
                `**8 skill battle baru (Ascendant):**\n` +
                `> ☄️ Elemental Catastrophe · ⏸️ Time Stop · 🩸 Blood Pact\n` +
                `> 🛡️ Aegis of Gods · 🔗 Soul Link · 💥 Omega Burst\n` +
                `> 🕳️ Void Rend · ✨ Genesis Light\n\n` +
                `**Ability Tier 4** (Slot 4 — butuh Lv.150 + Awakening ★2):\n` +
                `> 🦴 Boss Scavenger · ⚔️ Arena Veteran · 🥚 Egg Whisperer\n` +
                `> ✨ Relic Polish · 🌑 Nightmare Runner`
            )
            .setTimestamp(),

        new ChangelogEmbed()
            .setColor('#1a1a2e')
            .setTitle('🌑 Nightmare Dungeon + Skill Reroll')
            .setDescription(
                `**Daily endgame loop** — akses dari \`/pet\` → Dungeon / More:\n` +
                `> • 3 entry/hari (4 dengan Nightmare Runner)\n` +
                `> • Stats musuh ×1.5 + modifier acak\n` +
                `> • Reward: 🌑 **Nightmare Token** + loot\n` +
                `> • Shop: 📖 Skill Tome, refine pack, mythic fragment, dll.\n\n` +
                `**📖 Skill Tome** — reroll 1 battle skill per tier (build crafting!)`
            )
            .setFooter({ text: `idcommunity Bot v${BOT_VERSION} — Global Economy & RPG | discord.gg/idcommunity` })
            .setTimestamp()
    ]);
});

// ================= EVENT HANDLERS (wrapped with error catching) =================
client.on(Events.MessageCreate, wrapHandler('messageCreate', handleMessageCreate));
client.on(Events.VoiceStateUpdate, wrapHandler('voiceStateUpdate', handleVoiceStateUpdate));
client.on(Events.MessageReactionAdd, wrapHandler('reactionAdd', handleReactionAdd));
client.on(Events.InteractionCreate, wrapHandler('interactionCreate', handleInteractionCreate));

// Invite Tracker + Welcomer
const { cacheAllGuildInvites, cacheGuildInvites, handleMemberJoin: handleInviteJoin } = require('./systems/inviteTracker');
const { handleWelcome, handleGoodbye } = require('./systems/welcomer');

client.once(Events.ClientReady, async () => {
    await cacheAllGuildInvites(client);
    console.log('📨 Invite cache loaded for all guilds');

    // Start auto-quote scheduler
    try {
        const { startAutoQuote } = require('./systems/quote');
        startAutoQuote(client);
        console.log('💬 Auto-quote scheduler started');
    } catch (_) {}

    // Auto-post changelog
    try {
        const { autoPostChangelog } = require('./systems/changelog');
        autoPostChangelog(client);
    } catch (_) {}
});

client.on(Events.GuildMemberAdd, wrapHandler('guildMemberAdd', async (member) => {
    log('INFO', `[event] GuildMemberAdd: ${member.user.tag} bergabung ke ${member.guild?.name} (${member.guild?.id})`);
    await handleInviteJoin(member);
    await handleWelcome(member);
    try { require('./systems/serverLog').logMemberJoin(member); } catch (_) {}
    try {
        const { handleOnboarding } = require('./systems/onboarding');
        await handleOnboarding(member);
    } catch (e) { log('WARN', `[onboarding] gagal kirim DM ke ${member.user?.tag}: ${e.message}`); }
}));

client.on(Events.GuildMemberRemove, wrapHandler('guildMemberRemove', async (member) => {
    const { handleMemberLeave } = require('./systems/inviteTracker');
    await handleMemberLeave(member);
    await handleGoodbye(member);
    try { require('./systems/serverLog').logMemberLeave(member); } catch (_) {}
}));

// Server logging: message delete/edit + role changes
client.on(Events.MessageDelete, wrapHandler('messageDelete', async (message) => {
    try { require('./systems/serverLog').logMessageDelete(message); } catch (_) {}
}));
client.on(Events.MessageUpdate, wrapHandler('messageUpdate', async (oldMessage, newMessage) => {
    try { require('./systems/serverLog').logMessageUpdate(oldMessage, newMessage); } catch (_) {}
}));
client.on(Events.GuildMemberUpdate, wrapHandler('guildMemberUpdate', async (oldMember, newMember) => {
    try { require('./systems/serverLog').logMemberUpdate(oldMember, newMember); } catch (_) {}
}));

client.on(Events.InviteCreate, async (invite) => {
    await cacheGuildInvites(invite.guild);
});

client.on(Events.InviteDelete, async (invite) => {
    if (invite.guild) await cacheGuildInvites(invite.guild);
});

// Guild join/leave logging
client.on(Events.GuildCreate, (guild) => { onGuildCreate(client, guild); cacheGuildInvites(guild); });
client.on(Events.GuildDelete, (guild) => onGuildDelete(client, guild));

client.login(TOKEN);
