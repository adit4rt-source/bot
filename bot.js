require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events, REST, Routes } = require('discord.js');

// ================= BOT VERSION =================
const BOT_VERSION = '3.4.0';
const BUILD_DATE = '2026-06-07';

// Load logger first (so everything else can use it)
const { log, wrapHandler } = require('./systems/logger');

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

// Load backup system
const { startBackupSchedule } = require('./systems/backup');

// Load auto-harvest notifier
const { startAutoHarvestSchedule } = require('./systems/autoHarvest');

// Load daily + pet reminders
const { startReminderSchedules } = require('./systems/reminders');

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

    // Set bot status / rich presence
    const { ActivityType } = require('discord.js');
    client.user.setPresence({
        activities: [{ name: `/help | ${c.guilds.cache.size} servers`, type: ActivityType.Playing }],
        status: 'online'
    });
    // Update presence every 10 minutes (server count may change)
    setInterval(() => {
        client.user.setPresence({
            activities: [{ name: `/help | ${client.guilds.cache.size} servers`, type: ActivityType.Playing }],
            status: 'online'
        });
    }, 10 * 60 * 1000);

    // One-time data reset (only if env RESET_DATA=<token> is set & not used before)
    try { maybeRunStartupReset(); } catch (e) { console.error('Startup reset error:', e); }

    // Start API server for dashboard
    setDiscordClient(client);
    startApiServer();

    // Start auto-backup schedule (every 6 hours + immediate backup)
    startBackupSchedule();
    console.log('💾 Auto-backup: setiap 6 jam');

    // Start auto-harvest notifier (DMs users with the Auto-Harvest Pass when crops are ready)
    startAutoHarvestSchedule(client);
    console.log('🌾 Auto-harvest notifier: cek setiap 2 menit');

    // Start daily-reward + hungry-pet reminders (automatic DMs)
    startReminderSchedules(client);
    console.log('🔔 Reminder: daily (1 jam) + pet lapar (10 menit)');

    // Start voice tick (periodic quest progress for users in VC)
    const { startVoiceTickInterval } = require('./events/voiceStateUpdate');
    startVoiceTickInterval();
    console.log('🎙️ Voice tick: quest progress setiap 1 menit');

    // Initialize seasonal leaderboard (snapshots baselines + handles monthly rollover)
    try {
        const { ensureSeason, getSeasonInfo } = require('./systems/season');
        ensureSeason();
        const info = getSeasonInfo();
        console.log(`🗓️ Seasonal leaderboard: season ${info.seasonId} (sisa ${info.daysLeft} hari)`);
    } catch (e) { console.error('Season init error:', e); }

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
            .setColor('#5865F2')
            .setTitle(`📦 Update — v${BOT_VERSION}`)
            .setDescription(
                `**Release v${BOT_VERSION}** — ${BUILD_DATE}\n\n` +
                `⛏️ **MINING / TAMBANG — MAJOR UPDATE!**\n` +
                `Pilar gathering ke-4, lengkap dari awal sampai endgame!\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
            )
            .setTimestamp(),

        new ChangelogEmbed()
            .setColor('#C9A227')
            .setTitle('⛏️ Sistem Tambang — NEW! (`/mine`)')
            .setDescription(
                `> 🪏 **Dig** — gali ore pakai sistem **Stamina** (regen otomatis tiap menit)\n` +
                `> ⬇️ **Kedalaman** — makin dalam, ore makin langka (Permukaan → The Void)\n` +
                `> ⛏️ **7 Pickaxe** — upgrade buat hemat stamina, yield lebih, gali lebih dalam\n` +
                `> 🔥 **Smelt** — lebur ore jadi batangan (bar)\n` +
                `> 🔨 **Smith** — tempa bar jadi item: Refine Stone, Rod Parts, Protection Stone, Mythic Fragment, Penyangga, Masker Gas, Mystery Box, Lucky Charm, Money Magnet!\n` +
                `> ☠️ **Bahaya bawah tanah** — cave-in, gas beracun, & MONSTER (lawan pakai pet + element!)\n` +
                `> ⚡ **Beli Stamina** di Toko Tambang (langsung penuh)`
            ),

        new ChangelogEmbed()
            .setColor('#8E44AD')
            .setTitle('💎👑 Endgame Tambang')
            .setDescription(
                `> 💎 **Gem & Socket** — pasang gem ke pickaxe buat bonus permanen (+ Fusion!)\n` +
                `> 👑 **THE CORE** — boss endgame di 1500m+, drop Artifact Fragment\n` +
                `> 🌀 **Legendary Drill** & 🏺 **Miner's Artifact** — craft endgame\n` +
                `> ⭐ **Prestige Mining** — reset level buat bonus permanen, ulang makin kuat\n` +
                `> 🏆 **Top Miners** leaderboard\n\n` +
                `**🐾 Integrasi:**\n` +
                `> • 3 Pet Ability baru (Ore Finder, Tough Miner, Gem Hunter)\n` +
                `> • 9 Achievement Mining baru\n` +
                `> • Quest baru: gali ore & lebur bar (daily/weekly)`
            ),

        new ChangelogEmbed()
            .setColor('#E74C3C')
            .setTitle('🛠️ Perbaikan & Balancing')
            .setDescription(
                `> 🐛 Fix: item langka kebeli GRATIS di /shop\n` +
                `> 🐛 Fix: Voucher redeem sekarang berfungsi!\n` +
                `> 🎟️ Voucher cuma bisa diredeem di server **ID Community** (anti-exploit multi-akun)\n` +
                `> 🐛 Fix: panel Fusion & Peternakan error\n` +
                `> ⚖️ Regen stamina mining skala level\n` +
                `> 🎨 UI panel mining dipercantik`
            ),

        new ChangelogEmbed()
            .setColor('#F1C40F')
            .setTitle('🎁 KODE REDEEM SPESIAL!')
            .setDescription(
                `Buruan klaim hadiahnya! 🤑\n\n` +
                `> 🎟️ Kode: **\`MANTAP\`**\n` +
                `> 📍 Cara klaim: ketik \`/wallet\` → klik **🎟️ Redeem** → masukkan kode\n` +
                `> ⚠️ Cuma bisa diredeem di server **ID Community** & 1x per orang!\n\n` +
                `💡 Ketik \`/mine\` buat mulai menambang & \`/guide\` buat panduan lengkap!`
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
});

client.on(Events.GuildMemberAdd, wrapHandler('guildMemberAdd', async (member) => {
    await handleInviteJoin(member);
    await handleWelcome(member);
}));

client.on(Events.GuildMemberRemove, wrapHandler('guildMemberRemove', async (member) => {
    const { handleMemberLeave } = require('./systems/inviteTracker');
    await handleMemberLeave(member);
    await handleGoodbye(member);
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
