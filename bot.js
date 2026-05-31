require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events, REST, Routes } = require('discord.js');

// ================= BOT VERSION =================
const BOT_VERSION = '3.0.1';
const BUILD_DATE = '2026-05-31';

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

    // Start auto-backup schedule (every 6 hours + immediate backup)
    startBackupSchedule();
    console.log('💾 Auto-backup: setiap 6 jam');

    // Start auto-harvest notifier (DMs users with the Auto-Harvest Pass when crops are ready)
    startAutoHarvestSchedule(client);
    console.log('🌾 Auto-harvest notifier: cek setiap 5 menit');

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
});

// ================= EVENT HANDLERS (wrapped with error catching) =================
client.on(Events.MessageCreate, wrapHandler('messageCreate', handleMessageCreate));
client.on(Events.VoiceStateUpdate, wrapHandler('voiceStateUpdate', handleVoiceStateUpdate));
client.on(Events.MessageReactionAdd, wrapHandler('reactionAdd', handleReactionAdd));
client.on(Events.InteractionCreate, wrapHandler('interactionCreate', handleInteractionCreate));

client.login(TOKEN);
