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
    new SlashCommandBuilder().setName('trade').setDescription('🔄 Trade Panel — Tukar item dengan player lain'),
    new SlashCommandBuilder().setName('market').setDescription('🏪 Market — Jual beli item antar player'),
    new SlashCommandBuilder().setName('stats').setDescription('📊 Statistics — Dashboard statistik lengkap'),

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
