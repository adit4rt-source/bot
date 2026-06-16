// commands/_register.js - All slash command definitions
const { SlashCommandBuilder, PermissionsBitField, ChannelType } = require('discord.js');

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
    new SlashCommandBuilder().setName('arena').setDescription('⚔️ Ranked Arena — Lawan pet pemain lain, naikkan MMR & rank'),
    new SlashCommandBuilder().setName('auction').setDescription('🏛️ Auction House — Lelang item/pet/relic, bid pakai money'),
    new SlashCommandBuilder().setName('shop').setDescription('🛒 Buka menu toko'),
    new SlashCommandBuilder().setName('gift').setDescription('🎁 Kirim money ke player lain')
        .addUserOption(opt => opt.setName('user').setDescription('Penerima gift').setRequired(true))
        .addIntegerOption(opt => opt.setName('jumlah').setDescription('Jumlah money (pajak 10%)').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('trade').setDescription('🔄 Trade Panel — Tukar item dengan player lain'),
    new SlashCommandBuilder().setName('market').setDescription('🏪 Market — Jual beli item antar player'),
    new SlashCommandBuilder().setName('globalmarket').setDescription('🌍 Global Market — Jual beli item lintas server'),
    new SlashCommandBuilder().setName('globaltrade').setDescription('🔄 Global Trade — Barter item lintas server'),
    new SlashCommandBuilder().setName('expedition').setDescription('🌊 Expedition — Kirim pet ke ekspedisi untuk reward'),
    new SlashCommandBuilder().setName('worldboss').setDescription('🗺️ World Boss — Serang boss global bersama semua player'),
    new SlashCommandBuilder().setName('togel').setDescription('🎟️ Togel — Pasang angka 1-100 (5.000/angka), diundi tiap 1 jam')
        .addIntegerOption(opt => opt.setName('angka').setDescription('Pasang angka 1-100 (bayar 5.000)').setRequired(false).setMinValue(1).setMaxValue(100))
        .addIntegerOption(opt => opt.setName('setpot').setDescription('[Admin] Set pot awal / seed per ronde').setRequired(false).setMinValue(0))
        .addStringOption(opt => opt.setName('promo').setDescription('[Admin] Promo togel otomatis di channel ramai').setRequired(false)
            .addChoices({ name: 'Aktifkan', value: 'on' }, { name: 'Nonaktifkan', value: 'off' })),
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
    new SlashCommandBuilder().setName('invite').setDescription('📨 Invite Panel — Lihat statistik invite kamu'),
    new SlashCommandBuilder().setName('love').setDescription('❤️ Love — Lihat berapa orang yang menyukaimu (react ❤️ di chat orang untuk kasih love)')
        .addUserOption(opt => opt.setName('user').setDescription('Lihat love milik user lain').setRequired(false))
        .addChannelOption(opt => opt.setName('channel').setDescription('[Admin] Set channel notifikasi saat ada yang memberi love').setRequired(false).addChannelTypes(ChannelType.GuildText))
        .addStringOption(opt => opt.setName('admin').setDescription('[Admin] Atur fitur love').setRequired(false)
            .addChoices(
                { name: 'Aktifkan Fitur', value: 'on' },
                { name: 'Nonaktifkan Fitur', value: 'off' },
                { name: 'Matikan Notifikasi Channel', value: 'notif_off' },
            )),
    new SlashCommandBuilder()
        .setName('welcomer')
        .setDescription('👋 Welcomer Panel — Konfigurasi welcome & goodbye')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder().setName('tempvoice').setDescription('🎙️ Tempvoice Panel — Buat & kelola private voice channel'),
    new SlashCommandBuilder()
        .setName('selfrole')
        .setDescription('🎭 Self-Roles Panel — Buat menu pilih role sendiri (dropdown)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('🎉 Giveaway Panel — Buat & kelola giveaway')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),
    new SlashCommandBuilder()
        .setName('tanya')
        .setDescription('🤖 Tanya AI seputar fitur bot ini')
        .addStringOption(o => o.setName('pertanyaan').setDescription('Pertanyaanmu tentang fitur bot').setRequired(true)),
    new SlashCommandBuilder()
        .setName('aibot')
        .setDescription('🤖 AI Assistant Panel — Atur AI bantuan bot')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    // ================= UTILITY =================
    new SlashCommandBuilder().setName('menu').setDescription('📱 Buka panel navigasi utama'),
    new SlashCommandBuilder().setName('help').setDescription('📖 Panduan lengkap command'),
    new SlashCommandBuilder().setName('guide').setDescription('📚 Panduan mekanik fitur (Pet, dll) — interaktif di Discord'),
    new SlashCommandBuilder().setName('quote').setDescription('💬 Random Quote — Galau, Bucin, Jawa, Dilan, Random')
        .addStringOption(opt => opt.setName('kategori').setDescription('Pilih kategori quote').setRequired(false)
            .addChoices(
                { name: '💔 Galau', value: 'galauquote' },
                { name: '💕 Bucin', value: 'bucinquote' },
                { name: '🎲 Random', value: 'randomquote' },
                { name: '🏝️ Jawa', value: 'jawaquote' },
                { name: '📖 Dilan', value: 'dilanquote' },
            )),
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
    new SlashCommandBuilder().setName('roblox').setDescription('🎮 Roblox Profile — Lihat avatar & item yang dipakai')
        .addStringOption(opt => opt.setName('username').setDescription('Username Roblox').setRequired(true)),
    new SlashCommandBuilder().setName('ship').setDescription('💘 Love Calculator — Hitung kecocokan 2 orang')
        .addUserOption(opt => opt.setName('user1').setDescription('Orang pertama').setRequired(true))
        .addUserOption(opt => opt.setName('user2').setDescription('Orang kedua (kosong = kamu)').setRequired(false)),
    new SlashCommandBuilder().setName('marry').setDescription('💍 Lamar seseorang untuk menikah')
        .addUserOption(opt => opt.setName('user').setDescription('Yang mau dilamar').setRequired(true)),
    new SlashCommandBuilder().setName('divorce').setDescription('💔 Cerai dari pasangan saat ini'),
    new SlashCommandBuilder().setName('tarot').setDescription('🔮 Ramalan Tarot — Tarik 3 kartu (Bahasa Indonesia)')
        .addStringOption(opt => opt.setName('pertanyaan').setDescription('Pertanyaan/niat (opsional)').setRequired(false)),
    new SlashCommandBuilder().setName('belajar').setDescription('📚 Pusat Belajar — Kuis Bahasa Inggris interaktif (dapat Money!)'),
    new SlashCommandBuilder().setName('qr').setDescription('📱 QR Code Generator — Generate, Track, Invite')
        .addSubcommand(sub => sub.setName('generate').setDescription('📱 Generate QR Code dari link')
            .addStringOption(opt => opt.setName('url').setDescription('Link yang mau dijadikan QR code').setRequired(true))
            .addStringOption(opt => opt.setName('warna').setDescription('Tema warna QR code').setRequired(false)
                .addChoices(
                    { name: '🔴 Merah', value: 'red' },
                    { name: '🔵 Biru', value: 'blue' },
                    { name: '🟢 Hijau', value: 'green' },
                    { name: '🟣 Ungu', value: 'purple' },
                    { name: '🟡 Emas', value: 'gold' },
                    { name: '⚫ Hitam', value: 'black' },
                    { name: '🩷 Pink', value: 'pink' },
                ))
            .addAttachmentOption(opt => opt.setName('logo').setDescription('Upload logo custom untuk ditaruh di tengah QR').setRequired(false)))
        .addSubcommand(sub => sub.setName('invite').setDescription('📨 Generate QR Code untuk invite server'))
        .addSubcommand(sub => sub.setName('stats').setDescription('📊 Lihat statistik scan QR code kamu')
            .addStringOption(opt => opt.setName('id').setDescription('ID QR code (opsional, kosongkan untuk lihat semua)').setRequired(false))),

    // ================= POKEMON TCG CARDS =================
    new SlashCommandBuilder().setName('card').setDescription('🃏 Pokemon TCG Panel — Kelola koleksi kartu Pokemon'),
    new SlashCommandBuilder().setName('drop').setDescription('🃏 Drop Basic Pack — Beli dan buka Basic Pack kartu Pokemon (💰15k)'),
    new SlashCommandBuilder().setName('cardview').setDescription('🔍 Lihat detail kartu Pokemon')
        .addIntegerOption(opt => opt.setName('id').setDescription('ID kartu (dari koleksi)').setRequired(true)),
    new SlashCommandBuilder().setName('cards').setDescription('📖 Koleksi kartu Pokemon')
        .addUserOption(opt => opt.setName('user').setDescription('Lihat koleksi user lain').setRequired(false)),
    new SlashCommandBuilder().setName('cardlb').setDescription('📊 Card Leaderboard — Top collectors')
        .addStringOption(opt => opt.setName('tipe').setDescription('Tipe leaderboard').setRequired(false)
            .addChoices(
                { name: '🃏 Total Cards', value: 'total' },
                { name: '🎴 Unique Cards', value: 'unique' },
                { name: '👑 Rare+ Cards', value: 'rare' },
                { name: '💰 Most Valuable', value: 'value' },
            )),

    // ================= AFK =================
    new SlashCommandBuilder().setName('afk').setDescription('💤 Set status AFK — orang yang mention kamu akan diberi tahu')
        .addStringOption(opt => opt.setName('alasan').setDescription('Alasan AFK (opsional)').setRequired(false)),

    // ================= STARBOARD =================
    new SlashCommandBuilder()
        .setName('starboard')
        .setDescription('⭐ Starboard — Pesan populer di-highlight otomatis')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(sub => sub.setName('setup').setDescription('⭐ Set channel starboard')
            .addChannelOption(opt => opt.setName('channel').setDescription('Channel untuk starboard').setRequired(true).addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(sub => sub.setName('threshold').setDescription('⭐ Set minimum star untuk masuk starboard')
            .addIntegerOption(opt => opt.setName('jumlah').setDescription('Minimum jumlah star (default: 3)').setRequired(true).setMinValue(1).setMaxValue(50)))
        .addSubcommand(sub => sub.setName('emoji').setDescription('⭐ Ganti emoji starboard')
            .addStringOption(opt => opt.setName('emoji').setDescription('Emoji yang dipakai (default: ⭐)').setRequired(true)))
        .addSubcommand(sub => sub.setName('selfstar').setDescription('⭐ Bolehkan star pesan sendiri?')
            .addStringOption(opt => opt.setName('allow').setDescription('Bolehkan?').setRequired(true)
                .addChoices({ name: 'Ya', value: '1' }, { name: 'Tidak', value: '0' })))
        .addSubcommand(sub => sub.setName('disable').setDescription('⭐ Nonaktifkan starboard'))
        .addSubcommand(sub => sub.setName('status').setDescription('⭐ Lihat status starboard saat ini')),

    // ================= LANGUAGE / LOCALE =================
    new SlashCommandBuilder().setName('language').setDescription('🌐 Ganti bahasa bot / Change bot language')
        .addStringOption(opt => opt.setName('lang').setDescription('Pilih bahasa / Select language').setRequired(true)
            .addChoices(
                { name: 'Bahasa Indonesia 🇮🇩', value: 'id' },
                { name: 'English 🇬🇧', value: 'en' }
            )),

    // ================= NEW MINI-GAMES =================
    new SlashCommandBuilder().setName('rps').setDescription('🤝 Rock-Paper-Scissors (RPS) PvP Betting — Duel koin dengan pemain lain')
        .addUserOption(opt => opt.setName('lawan').setDescription('Siapa yang ingin Anda tantang?').setRequired(true))
        .addIntegerOption(opt => opt.setName('taruhan').setDescription('Jumlah taruhan koin').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder().setName('horserace').setDescription('🐎 Balapan Kuda — Buka taruhan event balap kuda live server')
        .addIntegerOption(opt => opt.setName('taruhan').setDescription('Jumlah taruhan awal').setRequired(true).setMinValue(100))
        .addStringOption(opt => opt.setName('kuda').setDescription('Kuda pilihan Anda').setRequired(true)
            .addChoices(
                { name: '🔴 Merah', value: 'red' },
                { name: '🔵 Biru', value: 'blue' },
                { name: '🟢 Hijau', value: 'green' },
                { name: '🟡 Kuning', value: 'yellow' },
                { name: '🟣 Ungu', value: 'purple' }
            )),

    // ================= ADMIN (satu command saja) =================
    new SlashCommandBuilder()
        .setName('admin')
        .setDescription('🛡️ Admin Panel — Kelola semua fitur admin')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
];

module.exports = { commands };
