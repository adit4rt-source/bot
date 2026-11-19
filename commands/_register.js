// commands/_register.js - All slash command definitions
const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');

const commands = [
    // ================= PANEL COMMANDS (Player) =================
    new SlashCommandBuilder().setName('pet').setDescription('🐾 Pet Panel — Kelola semua fitur pet'),
    new SlashCommandBuilder().setName('fishing').setDescription('🎣 Fishing Panel — Kelola memancing'),
    new SlashCommandBuilder().setName('farm').setDescription('🌾 Farm Panel — Kelola kebun'),
    new SlashCommandBuilder().setName('casino').setDescription('🎰 Casino Panel — Coinflip, Slot, Roulette'),
    new SlashCommandBuilder().setName('wallet').setDescription('💰 Economy Panel — Saldo, Gift, Redeem, Leaderboard'),
    new SlashCommandBuilder().setName('profile').setDescription('📋 Profile Panel — Profil, Achievement, Inventory, Stats'),
    new SlashCommandBuilder().setName('levelpanel').setDescription('🌟 Level Panel — Rank, Leaderboard, Rewards'),

    // ================= QUICK ACTION COMMANDS =================
    new SlashCommandBuilder().setName('fish').setDescription('🎣 Lempar pancing (quick cast)'),
    new SlashCommandBuilder().setName('daily').setDescription('🎁 Klaim hadiah harian'),
    new SlashCommandBuilder().setName('battle').setDescription('⚔️ Battle PvP')
        .addUserOption(opt => opt.setName('lawan').setDescription('Siapa yang mau dilawan?').setRequired(true))
        .addIntegerOption(opt => opt.setName('taruhan').setDescription('Taruhan money (0 = tanpa)').setRequired(false)),
    new SlashCommandBuilder().setName('arena').setDescription('⚔️ Ranked Arena — Lawan pet pemain lain, naikkan MMR & rank'),
    new SlashCommandBuilder().setName('auction').setDescription('🏛️ Auction House — Lelang item/pet/relic, bid pakai money'),
    new SlashCommandBuilder().setName('shop').setDescription('🛒 Buka menu toko'),
    new SlashCommandBuilder().setName('gift').setDescription('🎁 Kirim money ke player lain')
        .addUserOption(opt => opt.setName('user').setDescription('Penerima gift').setRequired(true))
        .addIntegerOption(opt => opt.setName('jumlah').setDescription('Jumlah money (pajak 10%)').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('trade').setDescription('🔄 Trade Panel — Tukar item dengan player lain'),
    new SlashCommandBuilder().setName('market').setDescription('🏪 Market — Jual beli item antar player'),
    new SlashCommandBuilder().setName('expedition').setDescription('🌊 Expedition — Kirim pet ke ekspedisi untuk reward'),
    new SlashCommandBuilder().setName('worldboss').setDescription('🗺️ World Boss — Serang boss global bersama semua player'),
    new SlashCommandBuilder().setName('togel').setDescription('🎟️ Togel — Pasang angka 1-100 (5.000/angka), diundi tiap 1 jam')
        .addIntegerOption(opt => opt.setName('angka').setDescription('Pasang angka 1-100 (bayar 5.000)').setRequired(false).setMinValue(1).setMaxValue(100))
        .addIntegerOption(opt => opt.setName('setpot').setDescription('[Admin] Set pot awal / seed per ronde').setRequired(false).setMinValue(0)),
    new SlashCommandBuilder().setName('blackjack').setDescription('🃏 Blackjack — Main kartu 21')
        .addIntegerOption(opt => opt.setName('taruhan').setDescription('Jumlah taruhan (100-100000)').setRequired(true).setMinValue(100).setMaxValue(100000)),
    new SlashCommandBuilder().setName('stats').setDescription('📊 Statistics — Dashboard statistik lengkap'),
    new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Leaderboard — Ranking pemain')
        .addStringOption(opt => opt.setName('kategori').setDescription('Pilih kategori ranking').setRequired(false)
            .addChoices(
                { name: '⭐ Overall (Event)', value: 'overall' },
                { name: '📈 Level', value: 'level' },
                { name: '💰 Money', value: 'money' },
                { name: '🎣 Fishing', value: 'fish' },
                { name: '🌾 Farming', value: 'farm' },
                { name: '🐾 Pet', value: 'pet' },
                { name: '🔥 Streak', value: 'streak' },
                { name: '⚔️ Battle', value: 'battle' },
                { name: '🎰 Gambling', value: 'gambling' },
                { name: '🏆 Achievement', value: 'achievement' }
            )),

    // ================= SOCIAL / SERVER TOOLS =================
    new SlashCommandBuilder()
        .setName('streak')
        .setDescription('🔥 Streak Prestige — Cek rank keaktifan, bonus chat, & VVIP Lounge')
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('Lihat status streak, rank role, dan bonus chat kamu'))
        .addSubcommand(sub => sub
            .setName('leaderboard')
            .setDescription('🏆 Hall of Fame — Top 10 streak terpanjang server'))
        .addSubcommand(sub => sub
            .setName('lounge')
            .setDescription('🏛️ VVIP High-Table Lounge — Khusus member streak 100+ hari'))
        .addSubcommand(sub => sub
            .setName('setup_lounge')
            .setDescription('[Admin] Auto-setup category & channel VVIP Lounge')),
    new SlashCommandBuilder().setName('invite').setDescription('📨 Invite Panel — Lihat statistik invite kamu'),
    new SlashCommandBuilder()
        .setName('welcomer')
        .setDescription('👋 Welcomer Panel — Konfigurasi welcome & goodbye')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder()
        .setName('tempvoice')
        .setDescription('🔒 Private Space — Buat kategori, chat, dan voice privat')
        .addSubcommand(subcommand => subcommand
            .setName('open')
            .setDescription('Buka panel Private Space kamu'))
        .addSubcommand(subcommand => subcommand
            .setName('setup')
            .setDescription('[Admin] Kirim panel Create Private Space')
            .addChannelOption(option => option
                .setName('channel')
                .setDescription('Channel tempat panel dikirim')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText))),
    new SlashCommandBuilder()
        .setName('selfrole')
        .setDescription('🎭 Self-Roles Panel — Buat menu pilih role sendiri (dropdown)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('🎉 Giveaway Panel — Buat & kelola giveaway')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    // ================= UTILITY =================
    new SlashCommandBuilder().setName('menu').setDescription('📱 Buka panel navigasi utama'),
    new SlashCommandBuilder().setName('help').setDescription('📖 Panduan lengkap command'),
    new SlashCommandBuilder().setName('guide').setDescription('📚 Panduan mekanik fitur (Pet, dll) — interaktif di Discord'),
    new SlashCommandBuilder().setName('games').setDescription('🎮 Quiz Game — Jawab soal, dapet Money!')
        .addStringOption(opt => opt.setName('kategori').setDescription('Pilih kategori quiz').setRequired(false)
            .addChoices(
                { name: '🤔 Siapakah Aku', value: 'siapakahaku' },
                { name: '🧠 Asah Otak', value: 'asahotak' },
                { name: '🔤 Susun Kata', value: 'susunkata' },
                { name: '🖼️ Tebak Gambar', value: 'tebakgambar' },
                { name: '🗺️ Tebak Kabupaten', value: 'tebakkabupaten' },
                { name: '😂 Cak Lontong', value: 'caklontong' },
                { name: '📝 Tebak Kalimat', value: 'tebakkalimat' },
                { name: '💬 Tebak Kata', value: 'tebakkata' },
                { name: '⚗️ Tebak Kimia', value: 'tebakkimia' },
                { name: '🎵 Tebak Lagu', value: 'tebaklagu' },
                { name: '🎤 Tebak Lirik', value: 'tebaklirik' },
                { name: '❓ Tebak-Tebakan', value: 'tebaktebakan' },
                { name: '🧩 Teka-Teki', value: 'tekateki' },
                { name: '🤫 Truth', value: 'truth' },
            )),

    // ================= AFK =================
    new SlashCommandBuilder().setName('afk').setDescription('💤 Set status AFK — orang yang mention kamu akan diberi tahu')
        .addStringOption(opt => opt.setName('alasan').setDescription('Alasan AFK (opsional)').setRequired(false)),

    // ================= LANGUAGE / LOCALE =================
    new SlashCommandBuilder().setName('language').setDescription('🌐 Ganti bahasa bot / Change bot language')
        .addStringOption(opt => opt.setName('lang').setDescription('Pilih bahasa / Select language').setRequired(true)
            .addChoices(
                { name: 'Bahasa Indonesia 🇮🇩', value: 'id' },
                { name: 'English 🇬🇧', value: 'en' }
            )),

    // ================= ADMIN (satu command saja) =================
    new SlashCommandBuilder()
        .setName('admin')
        .setDescription('🛡️ Admin Panel — Kelola semua fitur admin')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
];

module.exports = { commands };
