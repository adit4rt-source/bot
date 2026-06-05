// commands/_register.js - All slash command definitions
const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

const commands = [
    // ================= PANEL COMMANDS (Player) =================
    new SlashCommandBuilder().setName('pet').setDescription('🐾 Pet Panel — Kelola semua fitur pet'),
    new SlashCommandBuilder().setName('fishing').setDescription('🎣 Fishing Panel — Kelola memancing'),
    new SlashCommandBuilder().setName('farm').setDescription('🌾 Farm Panel — Kelola kebun'),
    new SlashCommandBuilder().setName('quest').setDescription('📜 Quest Panel — Misi Harian & Mingguan'),
    new SlashCommandBuilder().setName('casino').setDescription('🎰 Casino Panel — Coinflip, Slot, Roulette'),
    new SlashCommandBuilder().setName('wallet').setDescription('💰 Economy Panel — Saldo, Gift, Redeem, Leaderboard'),
    new SlashCommandBuilder().setName('profile').setDescription('📋 Profile Panel — Profil, Achievement, Inventory, Stats'),
    new SlashCommandBuilder().setName('levelpanel').setDescription('🌟 Level Panel — Rank, Leaderboard, Rewards'),

    // ================= QUICK ACTION COMMANDS =================
    new SlashCommandBuilder().setName('fish').setDescription('🎣 Lempar pancing (quick cast)'),
    new SlashCommandBuilder().setName('daily').setDescription('🎁 Klaim hadiah harian'),
    new SlashCommandBuilder().setName('calendar').setDescription('📅 Daily Login Calendar'),
    new SlashCommandBuilder().setName('battle').setDescription('⚔️ Battle PvP')
        .addUserOption(opt => opt.setName('lawan').setDescription('Siapa yang mau dilawan?').setRequired(true))
        .addIntegerOption(opt => opt.setName('taruhan').setDescription('Taruhan money (0 = tanpa)').setRequired(false)),
    new SlashCommandBuilder().setName('shop').setDescription('🛒 Buka menu toko'),
    new SlashCommandBuilder().setName('gift').setDescription('🎁 Kirim money ke player lain')
        .addUserOption(opt => opt.setName('user').setDescription('Penerima gift').setRequired(true))
        .addIntegerOption(opt => opt.setName('jumlah').setDescription('Jumlah money (pajak 10%)').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('trade').setDescription('🔄 Trade Panel — Tukar item dengan player lain'),
    new SlashCommandBuilder().setName('market').setDescription('🏪 Market — Jual beli item antar player'),
    new SlashCommandBuilder().setName('globalmarket').setDescription('🌍 Global Market — Jual beli item lintas server'),
    new SlashCommandBuilder().setName('expedition').setDescription('🌊 Expedition — Kirim pet ke ekspedisi untuk reward'),
    new SlashCommandBuilder().setName('worldboss').setDescription('🗺️ World Boss — Serang boss global bersama semua player'),
    new SlashCommandBuilder().setName('blackjack').setDescription('🃏 Blackjack — Main kartu 21')
        .addIntegerOption(opt => opt.setName('taruhan').setDescription('Jumlah taruhan (100-5000)').setRequired(true).setMinValue(100).setMaxValue(5000)),
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
    new SlashCommandBuilder().setName('invite').setDescription('📨 Invite Panel — Lihat statistik invite kamu'),
    new SlashCommandBuilder()
        .setName('welcomer')
        .setDescription('👋 Welcomer Panel — Konfigurasi welcome & goodbye')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName('tempvoice').setDescription('🎙️ Tempvoice Panel — Buat & kelola private voice channel'),

    // ================= UTILITY =================
    new SlashCommandBuilder().setName('menu').setDescription('📱 Buka panel navigasi utama'),
    new SlashCommandBuilder().setName('help').setDescription('📖 Panduan lengkap command'),

    // ================= ADMIN (satu command saja) =================
    new SlashCommandBuilder()
        .setName('admin')
        .setDescription('🛡️ Admin Panel — Kelola semua fitur admin')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
];

module.exports = { commands };
