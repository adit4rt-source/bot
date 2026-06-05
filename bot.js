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
    const { EmbedBuilder: ChangelogEmbed } = require('discord.js');
    await postUpdateLog(client, BOT_VERSION, [
        // === EMBED 1: Main Header ===
        new ChangelogEmbed()
            .setColor('#5865F2')
            .setTitle(`📦 Update — v${BOT_VERSION}`)
            .setDescription(
                `**Release v${BOT_VERSION}** — ${BUILD_DATE}\n\n` +
                `🌐 **BOT SEKARANG GLOBAL!**\n` +
                `> Semua data player (balance, pet, fish, farm, achievement, inventory) sekarang **SHARED lintas server**!\n` +
                `> ✅ Main di server A = progress sama di server B\n` +
                `> ✅ Pet, balance, streak, level — semuanya 1 akun\n` +
                `> ✅ Tidak perlu ulang dari awal di server baru\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
            )
            .setTimestamp(),

        // === EMBED 2: Fishing Features ===
        new ChangelogEmbed()
            .setColor('#3498DB')
            .setTitle('🎣 FISHING — Update Lengkap')
            .setDescription(
                `**🐋 Giant Fish (Boss Fish) — NEW!**\n` +
                `> • 1% chance muncul saat mancing di lokasi **Deep Sea+**\n` +
                `> • Butuh **3-5 cast berturut dalam 60 detik** untuk ditangkap\n` +
                `> • Reward: 🪙 **5.000-20.000 money** + exclusive badge!\n` +
                `> • 9 Boss variants: Megalodon, Kraken, Frost Whale, Magma Wyrm, dll\n` +
                `> • HP bar UI + timer countdown\n` +
                `> • Stats tracking di panel (defeated, encounters, success rate)\n\n` +
                `**🏝️ Secret Location: The Abyss — NEW!**\n` +
                `> • Unlock setelah: 🎣 50 ikan di Void Rift **ATAU** 🔮 5 Secret tier fish\n` +
                `> • **11 ikan EKSKLUSIF** yang tidak ada di lokasi lain:\n` +
                `>   • 3 Epic: Abyssal Angler, Shadow Leviathan, Depth Crawler\n` +
                `>   • 3 Legendary: Eternal Jellyfish, Abyssal Whale King, Void Emperor\n` +
                `>   • 3 Mythic: Primordial Serpent, Soul Devourer, Abyss Guardian\n` +
                `>   • 2 Secret: The Forgotten One 👁️, Universe Fish 🌠\n` +
                `> • Requires Joran Celestial (Tier 7+), +25% rare bonus\n` +
                `> • Progress bar & info di Location panel\n\n` +
                `**🔥 Fishing Combo System**\n` +
                `> • Cast berturut tanpa jeda >2 menit = combo naik\n` +
                `> • Multiplier: x1.2 (3 combo) → x3.0 (20 combo!)\n` +
                `> • Combo multiplier apply ke nilai jual ikan\n\n` +
                `**📦 Treasure Drops**\n` +
                `> • 5% base chance dapat item saat mancing\n` +
                `> • Combo tinggi = chance treasure lebih besar\n` +
                `> • Drops: Mystery Box, Rod Parts, Lucky Charm, XP Booster, dll\n\n` +
                `**📍 8+1 Lokasi Fishing:**\n` +
                `> 🏞️ Sungai → 🌿 Rawa → 🌊 Danau → 🏖️ Pesisir → 🌊 Laut Dalam → ❄️ Gua Es → 🌋 Lahar → 🕳️ Void Rift → 👁️ The Abyss (Secret!)`
            ),

        // === EMBED 3: Pet & Battle Features ===
        new ChangelogEmbed()
            .setColor('#9B59B6')
            .setTitle('🐾 PET & BATTLE — Fitur Lengkap')
            .setDescription(
                `**🐾 Pet System:**\n` +
                `> • Gacha Egg (Common → Mythic tier)\n` +
                `> • Feed, Play, Hunt — status management\n` +
                `> • Level up + stat growth (HP, ATK, DEF, SPD, CRIT)\n` +
                `> • Class & Element system\n` +
                `> • Evolution system (stage 1-3)\n` +
                `> • Skill milestones setiap level tertentu\n` +
                `> • Max 10 pet per player, swap aktif\n\n` +
                `**⚔️ Battle System:**\n` +
                `> • PvP auto-battle (\`/battle @user\`)\n` +
                `> • Taruhan money (opsional)\n` +
                `> • Dungeon (5 tier difficulty)\n` +
                `> • Boss Raid (party max 10 orang)\n` +
                `> • Relic drops (weapon/armor/accessory)\n` +
                `> • Refine relic (+0 → +20)\n\n` +
                `**🌊 Expedition:**\n` +
                `> • Kirim pet ke ekspedisi untuk reward pasif\n` +
                `> • Durasi & reward tergantung level pet\n\n` +
                `**🗺️ World Boss:**\n` +
                `> • Boss global — semua player serang bersama\n` +
                `> • Reward berdasarkan damage kontribusi\n\n` +
                `**🔮 Pet Fusion & Awakening:**\n` +
                `> • Fuse 2 pet → pet baru tier lebih tinggi\n` +
                `> • Awakening crystal untuk boost permanent`
            ),

        // === EMBED 4: Farm Features ===
        new ChangelogEmbed()
            .setColor('#2ECC71')
            .setTitle('🌾 FARMING — Fitur Lengkap')
            .setDescription(
                `**🌱 Farm System:**\n` +
                `> • Plant, Water, Harvest — full cycle\n` +
                `> • 20+ jenis bibit (Common → Legendary)\n` +
                `> • Upgrade lahan (Level 1-6), lebih banyak slot\n` +
                `> • Pupuk: speedup + yield bonus\n` +
                `> • Auto-Harvest Pass (DM otomatis saat siap panen)\n` +
                `> • Farm Mutations (tanaman bisa mutasi jadi rare!)\n` +
                `> • Weather system (bonus/penalty per hari)\n\n` +
                `**🍳 Craft & Storage:**\n` +
                `> • Craft hasil panen → produk jual tinggi\n` +
                `> • Storage inventory per-player\n` +
                `> • Resep craft unlock dari farming level\n\n` +
                `**🎨 Farm Decorations:**\n` +
                `> • Beli dekorasi di shop\n` +
                `> • Bonus passive dari dekorasi tertentu`
            ),

        // === EMBED 5: Economy & Social Features ===
        new ChangelogEmbed()
            .setColor('#F1C40F')
            .setTitle('💰 ECONOMY & SOCIAL — Fitur Lengkap')
            .setDescription(
                `**💰 Economy:**\n` +
                `> • \`/daily\` — Reward harian + streak bonus\n` +
                `> • \`/calendar\` — Login calendar 30 hari\n` +
                `> • \`/gift @user\` — Kirim money (pajak 10%)\n` +
                `> • \`/shop\` — Toko lengkap (fishing, farm, pet, battle, role)\n` +
                `> • \`/trade\` — Tukar item antar player\n` +
                `> • \`/market\` — Marketplace jual/beli item\n` +
                `> • \`/globalmarket\` — Marketplace lintas server\n\n` +
                `**🎰 Casino:**\n` +
                `> • Coinflip (animasi 3 stage)\n` +
                `> • Slot Machine (jackpot 7️⃣7️⃣7️⃣ = 25x!)\n` +
                `> • Blackjack (hit/stand/double)\n\n` +
                `**📜 Quest System:**\n` +
                `> • 3 Daily Quest (reset 00:00 WIB)\n` +
                `> • 3 Weekly Quest\n` +
                `> • Perfect Day bonus + 7-day streak\n\n` +
                `**🏆 Achievement System:**\n` +
                `> • **96 badge** di 10+ kategori\n` +
                `> • Milestone rewards (10/25/50/75/96 badge)\n` +
                `> • Auto-role berdasarkan jumlah badge\n` +
                `> • Achievement channel notification`
            ),

        // === EMBED 6: Infrastructure + How to Play ===
        new ChangelogEmbed()
            .setColor('#E74C3C')
            .setTitle('⚙️ INFRASTRUKTUR & CARA MAIN')
            .setDescription(
                `**🌐 Global Mode (AKTIF!):**\n` +
                `> • Semua data **1 akun global** — lintas server!\n` +
                `> • Balance, pet, fish, farm, achievement = shared\n` +
                `> • Pindah server? Progress tetap aman 100%\n` +
                `> • Market & Trade bisa lintas server\n\n` +
                `**🔒 Anti-Abuse:**\n` +
                `> • Captcha random setiap 15 menit\n` +
                `> • Block sementara jika gagal verifikasi\n` +
                `> • Cooldown per-command\n\n` +
                `**💾 Data Safety:**\n` +
                `> • Auto-backup setiap 6 jam\n` +
                `> • Database SQLite + WAL mode\n` +
                `> • Crash recovery otomatis\n\n` +
                `**📱 Cara Mulai:**\n` +
                `> 1. \`/menu\` — Navigasi utama\n` +
                `> 2. \`/daily\` — Klaim reward harian\n` +
                `> 3. \`/fish\` atau \`/fishing\` — Mulai mancing\n` +
                `> 4. \`/farm\` — Mulai berkebun\n` +
                `> 5. \`/pet\` — Gacha & kelola pet\n` +
                `> 6. \`/quest\` — Misi harian & mingguan\n` +
                `> 7. \`/help\` — Panduan lengkap`
            )
            .setFooter({ text: 'idcommunity Bot v3.2.0 — Global Economy & RPG | discord.gg/idcommunity' })
            .setTimestamp()
    ]);
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
