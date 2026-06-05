require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events, REST, Routes } = require('discord.js');

// ================= BOT VERSION =================
const BOT_VERSION = '3.2.0';
const BUILD_DATE = '2026-06-05';

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

    // Start auto-backup schedule (every 6 hours + immediate backup)
    startBackupSchedule();
    console.log('💾 Auto-backup: setiap 6 jam');

    // Start auto-harvest notifier (DMs users with the Auto-Harvest Pass when crops are ready)
    startAutoHarvestSchedule(client);
    console.log('🌾 Auto-harvest notifier: cek setiap 2 menit');

    // Start daily-reward + hungry-pet reminders (automatic DMs)
    startReminderSchedules(client);
    console.log('🔔 Reminder: daily (1 jam) + pet lapar (10 menit)');

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
    await postUpdateLog(client, BOT_VERSION, 
        `**Release v${BOT_VERSION}** — ${BUILD_DATE}\n\n` +
        `**✨ Fitur Baru:**\n` +
        `• 🐋 **Giant Fish (Boss Fish)** — 1% chance muncul di Deep Sea+! Butuh 3-5 cast dalam 60 detik. Reward: 5K-20K money + exclusive badge\n` +
        `• 🏝️ **Secret Location: The Abyss** — Unlock setelah 50 ikan di Void Rift ATAU 5 Secret tier fish. 11 ikan eksklusif!\n` +
        `• 🏆 **7 Achievement Baru** — Giant Slayer, Boss Hunter, Titan Slayer, Void Conqueror, Abyss Explorer, Abyss Fisher, Universe Catcher\n` +
        `• 🎣 **Fishing Combo System** — Cast berturut = multiplier naik (1x → 3x max!)\n` +
        `• 📦 **Treasure Drops** — 5% chance dapat item random saat mancing\n` +
        `• 📊 **Giant Fish Stats** — Tracking defeats, encounters, success rate di Stats panel\n` +
        `• 🗺️ **Location Panel Update** — Progress bar unlock + secret location info\n\n` +
        `**🐛 Bug Fixes:**\n` +
        `• Fix \`/fish\` quick-cast tidak track lokasi & Giant Fish\n` +
        `• Fix Global Mode compatibility untuk tabel baru\n` +
        `• Update \`/help\` dengan info fitur baru\n` +
        `• Fix achievement milestone count (89 → 96)\n\n` +
        `**🧹 Cleanup:**\n` +
        `• Sinkronisasi fitur \`/fish\` dan \`/fishing\` panel\n` +
        `• Update semua deskripsi panel\n`
    );
});

// ================= EVENT HANDLERS (wrapped with error catching) =================
client.on(Events.MessageCreate, wrapHandler('messageCreate', handleMessageCreate));
client.on(Events.VoiceStateUpdate, wrapHandler('voiceStateUpdate', handleVoiceStateUpdate));
client.on(Events.MessageReactionAdd, wrapHandler('reactionAdd', handleReactionAdd));
client.on(Events.InteractionCreate, wrapHandler('interactionCreate', handleInteractionCreate));

// Guild join/leave logging
client.on(Events.GuildCreate, (guild) => onGuildCreate(client, guild));
client.on(Events.GuildDelete, (guild) => onGuildDelete(client, guild));

client.login(TOKEN);
