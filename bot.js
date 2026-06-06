require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events, REST, Routes } = require('discord.js');

// ================= BOT VERSION =================
const BOT_VERSION = '3.3.0';
const BUILD_DATE = '2026-06-06';

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
                `🐔🐄 **FARMING & PETERNAKAN — MAJOR UPDATE!**\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
            )
            .setTimestamp(),

        new ChangelogEmbed()
            .setColor('#FFA500')
            .setTitle('🐔 Kandang Ayam — NEW!')
            .setDescription(
                `> • Beli ayam (🪙 3,000/ekor)\n` +
                `> • Collect telur otomatis (3-10 menit per cycle)\n` +
                `> • Quality telur: Normal → Premium → Superior → Excellent → Perfect\n` +
                `> • Evolution tier 0-10 (setiap 10 level)\n` +
                `> • Semakin tinggi tier = produksi cepat + quality bagus\n` +
                `> • Hunger system (turun 10%/jam, feed untuk reset)\n` +
                `> • Hewan punya umur rahasia 2-20 hari\n` +
                `> • Kandang level 1-7 (3-25 slot)\n\n` +
                `**Harga Jual Telur:**\n` +
                `> ⚪ Normal: 50 | 🟡 Premium: 100 | 🟠 Superior: 500\n` +
                `> 🔴 Excellent: 2,000 | 💎 Perfect: 10,000`
            ),

        new ChangelogEmbed()
            .setColor('#8B4513')
            .setTitle('🐄🐑 Peternakan — NEW!')
            .setDescription(
                `> • Sapi (🪙 10,000) → produce susu | Domba (🪙 8,000) → produce bulu\n` +
                `> • Sistem sama dengan ayam (evolution, hunger, quality)\n` +
                `> • 🎾 Play button — ajak hewan bermain (boost produksi 5 menit)\n` +
                `> • Shop pakai input jumlah (beli berapa saja)\n` +
                `> • Semua produk masuk Storage Hub\n\n` +
                `**Harga Susu:** Normal: 70 | Premium: 150 | Superior: 700 | Excellent: 3,000 | Perfect: 15,000\n` +
                `**Harga Bulu:** Normal: 60 | Premium: 120 | Superior: 600 | Excellent: 2,500 | Perfect: 12,000`
            ),

        new ChangelogEmbed()
            .setColor('#2ECC71')
            .setTitle('🌦️ Season System + Farm Hub')
            .setDescription(
                `> • Season berubah **setiap hari** (Spring → Summer → Autumn → Winter)\n` +
                `> • Efek ke tanaman: grow speed, yield, death chance\n` +
                `> • Efek ke hewan: produksi rate, sickness, feed consumption\n` +
                `> • Farm Hub baru: [Tanaman] [Kandang Ayam] [Peternakan] [Crafting] [Storage]\n` +
                `> • Storage Hub gabungkan semua item (panen + produk ternak)\n` +
                `> • Crafting ada di hub (36 resep tanaman)`
            ),

        new ChangelogEmbed()
            .setColor('#43B581')
            .setTitle('📨👋🎙️ Fitur Server Baru')
            .setDescription(
                `**📨 Invite Tracker** (/invite)\n` +
                `> • Track siapa invite siapa, leaderboard, fake detection\n\n` +
                `**👋 Welcomer** (/welcomer - Admin)\n` +
                `> • Welcome/Goodbye message, DM, Auto-role\n\n` +
                `**🎙️ Tempvoice** (/tempvoice)\n` +
                `> • Buat private voice channel, lock/hide/kick/block\n\n` +
                `**🔧 Lainnya:**\n` +
                `> • Voice quest fix (progress terupdate tiap 5 menit)\n` +
                `> • Streak/Level notif auto-delete 15 detik\n` +
                `> • Dashboard: semua ID diganti dropdown selector\n` +
                `> • Admin Panel: 11 tab super powerful`
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
