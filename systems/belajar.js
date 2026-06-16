// systems/belajar.js — Pusat Belajar (Duolingo-style, BAB → Topik → Part)
//
// /belajar → BAB 1 (aktif) berisi 10 topik. Tiap topik punya beberapa Part
// (lesson) berisi 10 soal. Part tertentu = "extra" (XP & Money 2x lipat).
// Latihan: pilihan ganda + susun kalimat (tap tiles). Sistem nyawa ❤️x5.
// Progress (part selesai + XP) tersimpan permanen. Unlock bertahap.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, incrementUserStat } = require('../database');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS belajar_progress (guildId TEXT, userId TEXT, maxUnit INTEGER DEFAULT 0, xp INTEGER DEFAULT 0, PRIMARY KEY (guildId, userId))`);
db.exec(`CREATE TABLE IF NOT EXISTS belajar_done (guildId TEXT, userId TEXT, partKey TEXT, PRIMARY KEY (guildId, userId, partKey))`);

function getXP(guildId, userId) {
    const r = db.prepare('SELECT xp FROM belajar_progress WHERE guildId = ? AND userId = ?').get(guildId, userId);
    return r ? r.xp : 0;
}
function addXP(guildId, userId, amount) {
    const cur = getXP(guildId, userId);
    db.prepare('INSERT OR REPLACE INTO belajar_progress (guildId, userId, maxUnit, xp) VALUES (?, ?, 0, ?)').run(guildId, userId, cur + amount);
}
function isPartDone(guildId, userId, topicId, part) {
    return !!db.prepare('SELECT 1 FROM belajar_done WHERE guildId = ? AND userId = ? AND partKey = ?').get(guildId, userId, `${topicId}:${part}`);
}
function markPartDone(guildId, userId, topicId, part) {
    db.prepare('INSERT OR IGNORE INTO belajar_done (guildId, userId, partKey) VALUES (?, ?, ?)').run(guildId, userId, `${topicId}:${part}`);
}
function topicDoneCount(guildId, userId, topicId) {
    // ':' separator is LIKE-safe ('_' would be a single-char wildcard)
    return db.prepare("SELECT COUNT(*) AS c FROM belajar_done WHERE guildId = ? AND userId = ? AND partKey LIKE ?").get(guildId, userId, `${topicId}:%`).c;
}

// ==================== CONTENT: BAB 1 (10 topik) ====================
// Tiap topik: parts (jumlah lesson), extra (part bonus 2x), phrases (bank kalimat)
const TOPICS = [
    { id: 't1', emoji: '🥤', title: 'Menawarkan & menerima minuman', parts: 5, extra: [3], phrases: [
        { en: 'Would you like a drink', id: 'Apakah kamu mau minum' },
        { en: 'Yes please', id: 'Ya boleh' },
        { en: 'No thank you', id: 'Tidak terima kasih' },
        { en: 'I would like some water', id: 'Saya mau air' },
        { en: 'Do you want coffee or tea', id: 'Kamu mau kopi atau teh' },
        { en: 'A cup of coffee please', id: 'Secangkir kopi tolong' },
        { en: 'I am thirsty', id: 'Saya haus' },
        { en: 'Here is your drink', id: 'Ini minumanmu' },
        { en: 'Can I have some tea', id: 'Bisa saya minta teh' },
        { en: 'Sure here you go', id: 'Tentu ini dia' },
    ]},
    { id: 't2', emoji: '🌍', title: 'Menceritakan dari mana asalmu', parts: 5, extra: [3], phrases: [
        { en: 'Where are you from', id: 'Dari mana asalmu' },
        { en: 'I am from Indonesia', id: 'Saya dari Indonesia' },
        { en: 'She is from Japan', id: 'Dia dari Jepang' },
        { en: 'I live in Jakarta', id: 'Saya tinggal di Jakarta' },
        { en: 'I am Indonesian', id: 'Saya orang Indonesia' },
        { en: 'Where do you live', id: 'Di mana kamu tinggal' },
        { en: 'He comes from America', id: 'Dia berasal dari Amerika' },
        { en: 'My city is beautiful', id: 'Kotaku indah' },
        { en: 'I was born in Bandung', id: 'Saya lahir di Bandung' },
        { en: 'Which country are you from', id: 'Kamu dari negara mana' },
    ]},
    { id: 't3', emoji: '👨‍👩‍👧', title: 'Memperkenalkan diri dan keluarga', parts: 5, extra: [3], phrases: [
        { en: 'My name is Budi', id: 'Nama saya Budi' },
        { en: 'Nice to meet you', id: 'Senang bertemu denganmu' },
        { en: 'This is my mother', id: 'Ini ibu saya' },
        { en: 'He is my father', id: 'Dia ayah saya' },
        { en: 'I have two sisters', id: 'Saya punya dua saudari' },
        { en: 'What is your name', id: 'Siapa namamu' },
        { en: 'How old are you', id: 'Berapa umurmu' },
        { en: 'This is my family', id: 'Ini keluarga saya' },
        { en: 'My brother is tall', id: 'Saudara saya tinggi' },
        { en: 'She is my best friend', id: 'Dia teman baik saya' },
    ]},
    { id: 't4', emoji: '✈️', title: 'Menjelajahi bandara', parts: 8, extra: [3, 6], phrases: [
        { en: 'Where is the airport', id: 'Di mana bandara' },
        { en: 'Here is my passport', id: 'Ini paspor saya' },
        { en: 'What time is the flight', id: 'Jam berapa penerbangannya' },
        { en: 'I have one suitcase', id: 'Saya punya satu koper' },
        { en: 'Where is the gate', id: 'Di mana gerbangnya' },
        { en: 'The plane is late', id: 'Pesawatnya terlambat' },
        { en: 'I need a ticket', id: 'Saya butuh tiket' },
        { en: 'My flight is at noon', id: 'Penerbangan saya siang hari' },
        { en: 'Can I see your passport', id: 'Boleh lihat paspormu' },
        { en: 'Have a safe trip', id: 'Selamat jalan' },
    ]},
    { id: 't5', emoji: '🎨', title: 'Deskripsi kata benda dengan kata sifat', parts: 8, extra: [3, 6], phrases: [
        { en: 'The house is big', id: 'Rumahnya besar' },
        { en: 'A red car', id: 'Mobil merah' },
        { en: 'The book is interesting', id: 'Bukunya menarik' },
        { en: 'She has a small dog', id: 'Dia punya anjing kecil' },
        { en: 'The weather is hot', id: 'Cuacanya panas' },
        { en: 'A beautiful flower', id: 'Bunga yang indah' },
        { en: 'The coffee is sweet', id: 'Kopinya manis' },
        { en: 'The water is cold', id: 'Airnya dingin' },
        { en: 'A tall man', id: 'Pria yang tinggi' },
        { en: 'The room is clean', id: 'Kamarnya bersih' },
    ]},
    { id: 't6', emoji: '🍽️', title: 'Memesan makanan dan minuman', parts: 8, extra: [3, 6], phrases: [
        { en: 'I would like to order', id: 'Saya mau memesan' },
        { en: 'Can I see the menu', id: 'Boleh lihat menunya' },
        { en: 'I want fried rice', id: 'Saya mau nasi goreng' },
        { en: 'One glass of orange juice', id: 'Satu gelas jus jeruk' },
        { en: 'The bill please', id: 'Tolong tagihannya' },
        { en: 'Is it spicy', id: 'Apakah ini pedas' },
        { en: 'This food is delicious', id: 'Makanan ini enak' },
        { en: 'I would like some soup', id: 'Saya mau sup' },
        { en: 'How much is it', id: 'Berapa harganya' },
        { en: 'No sugar please', id: 'Tanpa gula tolong' },
    ]},
    { id: 't7', emoji: '💼', title: 'Kata kerja sekarang untuk profesi', parts: 8, extra: [3, 6], phrases: [
        { en: 'She is a doctor', id: 'Dia seorang dokter' },
        { en: 'He works in a bank', id: 'Dia bekerja di bank' },
        { en: 'I am a teacher', id: 'Saya seorang guru' },
        { en: 'They are engineers', id: 'Mereka insinyur' },
        { en: 'She teaches English', id: 'Dia mengajar bahasa Inggris' },
        { en: 'He drives a taxi', id: 'Dia mengemudi taksi' },
        { en: 'What is your job', id: 'Apa pekerjaanmu' },
        { en: 'He is a police officer', id: 'Dia seorang polisi' },
        { en: 'I help people', id: 'Saya membantu orang' },
        { en: 'We work together', id: 'Kami bekerja bersama' },
    ]},
    { id: 't8', emoji: '🏃', title: 'Menggunakan kata kerja sekarang', parts: 8, extra: [3, 6], phrases: [
        { en: 'I eat breakfast every morning', id: 'Saya sarapan setiap pagi' },
        { en: 'She reads books', id: 'Dia membaca buku' },
        { en: 'They play football', id: 'Mereka bermain sepak bola' },
        { en: 'He watches television', id: 'Dia menonton televisi' },
        { en: 'We go to school', id: 'Kami pergi ke sekolah' },
        { en: 'She walks to work', id: 'Dia berjalan ke kantor' },
        { en: 'He studies at night', id: 'Dia belajar di malam hari' },
        { en: 'I do not understand', id: 'Saya tidak mengerti' },
        { en: 'Do you speak English', id: 'Apakah kamu bisa bahasa Inggris' },
        { en: 'She likes music', id: 'Dia suka musik' },
    ]},
    { id: 't9', emoji: '🌦️', title: 'Membicarakan tentang cuaca', parts: 8, extra: [3, 6], phrases: [
        { en: 'It is sunny today', id: 'Hari ini cerah' },
        { en: 'It is raining', id: 'Sedang hujan' },
        { en: 'The weather is cold', id: 'Cuacanya dingin' },
        { en: 'It is very hot', id: 'Sangat panas' },
        { en: 'Is it going to rain', id: 'Apakah akan hujan' },
        { en: 'The sky is cloudy', id: 'Langitnya berawan' },
        { en: 'It is windy', id: 'Berangin' },
        { en: 'Take an umbrella', id: 'Bawa payung' },
        { en: 'What is the weather like', id: 'Bagaimana cuacanya' },
        { en: 'Tomorrow will be hot', id: 'Besok akan panas' },
    ]},
    { id: 't10', emoji: '🐶', title: 'Membicarakan tentang hewan peliharaan', parts: 8, extra: [3, 6], phrases: [
        { en: 'I have a cat', id: 'Saya punya kucing' },
        { en: 'My dog is friendly', id: 'Anjing saya ramah' },
        { en: 'Do you have a pet', id: 'Apakah kamu punya hewan peliharaan' },
        { en: 'The cat is sleeping', id: 'Kucingnya sedang tidur' },
        { en: 'I love animals', id: 'Saya suka binatang' },
        { en: 'My rabbit is white', id: 'Kelinci saya putih' },
        { en: 'The bird can fly', id: 'Burung itu bisa terbang' },
        { en: 'My dog likes to play', id: 'Anjing saya suka bermain' },
        { en: 'I walk my dog', id: 'Saya mengajak anjing jalan' },
        { en: 'Cats are cute', id: 'Kucing itu lucu' },
    ]},
];
const TOPIC_BY_ID = Object.fromEntries(TOPICS.map(t => [t.id, t]));

const EXTRA_WORDS = ['you', 'they', 'big', 'red', 'now', 'here', 'good', 'day', 'very', 'and', 'the', 'with', 'is', 'are', 'my'];
const HEARTS_MAX = 5;
const EX_PER_LESSON = 10;

const sessions = new Map();

function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ==================== EXERCISE GEN ====================
function makeMC(pool) {
    const correct = pool[Math.floor(Math.random() * pool.length)];
    const enToId = Math.random() < 0.5;
    const distract = shuffle(pool.filter(p => p.en !== correct.en)).slice(0, 3);
    const opts = shuffle([correct, ...distract]);
    if (enToId) return { type: 'mc', prompt: `Apa arti dari:\n**"${correct.en}"**`, options: opts.map(p => p.id), correctIndex: opts.findIndex(p => p.en === correct.en) };
    return { type: 'mc', prompt: `Terjemahkan ke Inggris:\n**"${correct.id}"**`, options: opts.map(p => p.en), correctIndex: opts.findIndex(p => p.en === correct.en) };
}
function makeArrange(pool) {
    const phrase = pool[Math.floor(Math.random() * pool.length)];
    const correctWords = phrase.en.split(' ');
    const room = Math.max(1, Math.min(3, 9 - correctWords.length));
    const extras = shuffle(EXTRA_WORDS.filter(w => !correctWords.includes(w))).slice(0, room);
    const tiles = shuffle([...correctWords, ...extras]).map(w => ({ word: w, used: false }));
    return { type: 'arrange', promptId: phrase.id, correctWords, tiles, built: [] };
}
function buildLesson(topic) {
    const ex = [];
    for (let i = 0; i < EX_PER_LESSON; i++) ex.push(Math.random() < 0.5 ? makeMC(topic.phrases) : makeArrange(topic.phrases));
    return ex;
}

// ==================== RENDER ====================
const LBL = ['🇦', '🇧', '🇨', '🇩'];
function heartsBar(h) { return '❤️'.repeat(h) + '🤍'.repeat(HEARTS_MAX - h); }

function renderExercise(session, userId, feedback = '') {
    const ex = session.exercises[session.current];
    const head = `${heartsBar(session.hearts)}  •  Soal ${session.current + 1}/${session.exercises.length}${session.extra ? '  •  ⭐2x' : ''}`;
    if (ex.type === 'mc') {
        const embed = new EmbedBuilder().setColor('#58CC02').setTitle('🇬🇧 Pilih Jawaban')
            .setDescription((feedback ? feedback + '\n━━━━━━━━━━\n' : '') + `${ex.prompt}\n\n` + ex.options.map((o, i) => `${LBL[i]} **${o}**`).join('\n'))
            .setFooter({ text: head });
        const row = new ActionRowBuilder().addComponents(ex.options.map((_, i) => new ButtonBuilder().setCustomId(`belajar_ans_${i}_${userId}`).setLabel(LBL[i]).setStyle(ButtonStyle.Primary)));
        return { embeds: [embed], components: [row] };
    }
    const builtWords = ex.built.map(i => ex.tiles[i].word);
    const builtLine = builtWords.length ? builtWords.join(' ') : '_( ketuk kata di bawah )_';
    const embed = new EmbedBuilder().setColor('#58CC02').setTitle('🧩 Susun Kalimat')
        .setDescription((feedback ? feedback + '\n━━━━━━━━━━\n' : '') + `Susun terjemahan Inggris dari:\n**"${ex.promptId}"**\n\n📝 **Jawabanmu:** ${builtLine}`)
        .setFooter({ text: head });
    const components = [];
    let row = new ActionRowBuilder(); let count = 0;
    ex.tiles.forEach((t, i) => {
        if (t.used) return;
        if (count > 0 && count % 5 === 0) { components.push(row); row = new ActionRowBuilder(); }
        row.addComponents(new ButtonBuilder().setCustomId(`belajar_tile_${i}_${userId}`).setLabel(t.word).setStyle(ButtonStyle.Secondary));
        count++;
    });
    if (row.components.length) components.push(row);
    components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`belajar_undo_${userId}`).setLabel('↩️ Hapus').setStyle(ButtonStyle.Danger).setDisabled(ex.built.length === 0),
        new ButtonBuilder().setCustomId(`belajar_check_${userId}`).setLabel('✅ Cek').setStyle(ButtonStyle.Success).setDisabled(ex.built.length === 0),
    ));
    return { embeds: [embed], components: components.slice(0, 5) };
}

// ==================== PANELS ====================
function topicUnlocked(guildId, userId, index) {
    if (index === 0) return true;
    const prev = TOPICS[index - 1];
    return topicDoneCount(guildId, userId, prev.id) >= prev.parts;
}

function buildChapterPanel(guildId, userId) {
    const xp = getXP(guildId, userId);
    const lines = TOPICS.map((t, idx) => {
        const done = topicDoneCount(guildId, userId, t.id);
        const unlocked = topicUnlocked(guildId, userId, idx);
        const status = done >= t.parts ? '✅' : unlocked ? '▶️' : '🔒';
        return `${status} ${t.emoji} **${t.title}** *(${done}/${t.parts})*`;
    });
    const embed = new EmbedBuilder()
        .setColor('#1CB0F6')
        .setTitle('📘 BAB 1 — Bahasa Inggris Dasar')
        .setDescription(`Total XP Belajar: ⭐ **${xp}**\n\n${lines.join('\n')}\n\n🔜 *BAB 2 — Coming Soon*\n-# Pilih topik yang terbuka untuk lihat part-nya.`)
        .setFooter({ text: 'Selesaikan semua part untuk membuka topik berikutnya' });

    const rows = [];
    let row = new ActionRowBuilder();
    TOPICS.forEach((t, idx) => {
        if (idx > 0 && idx % 5 === 0) { rows.push(row); row = new ActionRowBuilder(); }
        const unlocked = topicUnlocked(guildId, userId, idx);
        const done = topicDoneCount(guildId, userId, t.id) >= t.parts;
        row.addComponents(new ButtonBuilder()
            .setCustomId(`belajar_topic_${t.id}_${userId}`)
            .setLabel(`${idx + 1}`)
            .setEmoji(done ? '✅' : unlocked ? t.emoji : '🔒')
            .setStyle(unlocked ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!unlocked));
    });
    if (row.components.length) rows.push(row);
    return { embeds: [embed], components: rows.slice(0, 5) };
}

function buildTopicPanel(guildId, userId, topic) {
    const idx = TOPICS.findIndex(t => t.id === topic.id);
    const lines = [];
    for (let p = 1; p <= topic.parts; p++) {
        const done = isPartDone(guildId, userId, topic.id, p);
        const unlocked = p === 1 || isPartDone(guildId, userId, topic.id, p - 1);
        const isExtra = topic.extra.includes(p);
        const status = done ? '✅' : unlocked ? '▶️' : '🔒';
        lines.push(`${status} **Part ${p}**${isExtra ? ' 🌟 *(Extra: XP & Money 2x)*' : ''}`);
    }
    const embed = new EmbedBuilder()
        .setColor('#58CC02')
        .setTitle(`${topic.emoji} ${topic.title}`)
        .setDescription(`${lines.join('\n')}\n\n-# Tiap part = 10 soal. Part 🌟 kasih reward 2x lipat!`)
        .setFooter({ text: `BAB 1 • Topik ${idx + 1}/${TOPICS.length}` });

    const rows = [];
    let row = new ActionRowBuilder();
    let cnt = 0;
    for (let p = 1; p <= topic.parts; p++) {
        if (cnt > 0 && cnt % 5 === 0) { rows.push(row); row = new ActionRowBuilder(); }
        const done = isPartDone(guildId, userId, topic.id, p);
        const unlocked = p === 1 || isPartDone(guildId, userId, topic.id, p - 1);
        const isExtra = topic.extra.includes(p);
        row.addComponents(new ButtonBuilder()
            .setCustomId(`belajar_part_${topic.id}_${p}_${userId}`)
            .setLabel(`Part ${p}`)
            .setEmoji(done ? '✅' : isExtra ? '🌟' : (unlocked ? '▶️' : '🔒'))
            .setStyle(unlocked ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(!unlocked));
        cnt++;
    }
    if (row.components.length) rows.push(row);
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`belajar_home_${userId}`).setLabel('🔙 Kembali ke BAB 1').setStyle(ButtonStyle.Secondary)));
    return { embeds: [embed], components: rows.slice(0, 5) };
}

// ==================== HANDLERS ====================
async function handleBelajarCommand(interaction) {
    return interaction.reply(buildChapterPanel(interaction.guild.id, interaction.user.id));
}

function finishLesson(interaction, session, ownerId, guildId, success) {
    sessions.delete(`${guildId}_${ownerId}`);
    const topic = TOPIC_BY_ID[session.topicId];
    if (success) {
        markPartDone(guildId, ownerId, session.topicId, session.part);
        const mult = session.extra ? 2 : 1;
        const xpGain = session.correct * 10 * mult;
        const moneyGain = session.correct * 100 * mult;
        addXP(guildId, ownerId, xpGain);
        try {
            const u = getOrCreateUser(guildId, ownerId);
            u.balance += moneyGain;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(u.balance, guildId, ownerId);
            incrementUserStat(guildId, ownerId, 'belajar_correct', session.correct);
        } catch (_) {}
        const nextPartUnlocked = session.part < topic.parts;
        const topicDone = topicDoneCount(guildId, ownerId, session.topicId) >= topic.parts;
        const embed = new EmbedBuilder()
            .setColor('#58CC02')
            .setTitle('🎉 Part Selesai!')
            .setDescription(
                `${topic.emoji} **${topic.title}** — Part ${session.part}${session.extra ? ' 🌟' : ''}\n\n` +
                `✅ Benar: **${session.correct}/${session.exercises.length}**\n` +
                `⭐ XP: **+${xpGain}**  •  🪙 Money: **+${moneyGain.toLocaleString('id-ID')}**${session.extra ? '  *(2x Extra!)*' : ''}` +
                (topicDone ? `\n\n🏆 **Topik selesai!** Topik berikutnya terbuka!` : nextPartUnlocked ? `\n\n🔓 **Part ${session.part + 1} terbuka!**` : '')
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`belajar_topic_${session.topicId}_${ownerId}`).setLabel('📋 Lihat Part').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`belajar_home_${ownerId}`).setLabel('📘 BAB 1').setStyle(ButtonStyle.Secondary),
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
    const embed = new EmbedBuilder().setColor('#FF4B4B').setTitle('💔 Nyawa Habis!')
        .setDescription(`Kamu kehabisan nyawa di **${topic.title}** Part ${session.part}.\nBenar: ${session.correct}/${session.exercises.length}\n\nCoba lagi ya! 💪`);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`belajar_part_${session.topicId}_${session.part}_${ownerId}`).setLabel('🔁 Ulangi').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`belajar_topic_${session.topicId}_${ownerId}`).setLabel('📋 Part').setStyle(ButtonStyle.Secondary),
    );
    return interaction.update({ embeds: [embed], components: [row] });
}

function advance(interaction, session, ownerId, guildId, feedback) {
    session.current++;
    if (session.hearts <= 0) return finishLesson(interaction, session, ownerId, guildId, false);
    if (session.current >= session.exercises.length) return finishLesson(interaction, session, ownerId, guildId, true);
    return interaction.update(renderExercise(session, ownerId, feedback));
}

async function handleBelajarButton(interaction) {
    const customId = interaction.customId;
    const parts = customId.split('_');
    const ownerId = parts[parts.length - 1];
    const guildId = interaction.guild.id;

    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ Ini bukan sesi belajar kamu! Ketik `/belajar` sendiri ya.', ephemeral: true });
    }

    if (customId.startsWith('belajar_home_')) {
        return interaction.update(buildChapterPanel(guildId, ownerId));
    }
    if (customId.startsWith('belajar_topic_')) {
        const topic = TOPIC_BY_ID[parts[2]];
        if (!topic) return interaction.reply({ content: '❌ Topik tidak ditemukan.', ephemeral: true });
        const idx = TOPICS.findIndex(t => t.id === topic.id);
        if (!topicUnlocked(guildId, ownerId, idx)) return interaction.reply({ content: '🔒 Topik ini masih terkunci.', ephemeral: true });
        return interaction.update(buildTopicPanel(guildId, ownerId, topic));
    }
    if (customId.startsWith('belajar_part_')) {
        const topicId = parts[2]; const part = parseInt(parts[3]);
        const topic = TOPIC_BY_ID[topicId];
        if (!topic) return interaction.reply({ content: '❌ Topik tidak ditemukan.', ephemeral: true });
        const unlocked = part === 1 || isPartDone(guildId, ownerId, topicId, part - 1);
        if (!unlocked) return interaction.reply({ content: '🔒 Part ini masih terkunci. Selesaikan part sebelumnya!', ephemeral: true });
        const session = { topicId, part, extra: topic.extra.includes(part), exercises: buildLesson(topic), current: 0, hearts: HEARTS_MAX, correct: 0 };
        sessions.set(`${guildId}_${ownerId}`, session);
        return interaction.update(renderExercise(session, ownerId));
    }

    const session = sessions.get(`${guildId}_${ownerId}`);
    if (!session) return interaction.update({ content: '⚠️ Sesi sudah berakhir. Ketik `/belajar` untuk mulai lagi.', embeds: [], components: [] });
    const ex = session.exercises[session.current];

    if (customId.startsWith('belajar_ans_')) {
        const chosen = parseInt(parts[2]);
        const correct = chosen === ex.correctIndex;
        let fb;
        if (correct) { session.correct++; fb = `✅ **Benar!** ${ex.options[ex.correctIndex]}`; }
        else { session.hearts--; fb = `❌ **Salah!** Jawaban: **${ex.options[ex.correctIndex]}**`; }
        return advance(interaction, session, ownerId, guildId, fb);
    }
    if (customId.startsWith('belajar_tile_')) {
        const idx = parseInt(parts[2]);
        if (ex.type === 'arrange' && ex.tiles[idx] && !ex.tiles[idx].used) { ex.tiles[idx].used = true; ex.built.push(idx); }
        return interaction.update(renderExercise(session, ownerId));
    }
    if (customId.startsWith('belajar_undo_')) {
        if (ex.type === 'arrange' && ex.built.length) { const last = ex.built.pop(); ex.tiles[last].used = false; }
        return interaction.update(renderExercise(session, ownerId));
    }
    if (customId.startsWith('belajar_check_')) {
        if (ex.type !== 'arrange') return interaction.deferUpdate();
        const answer = ex.built.map(i => ex.tiles[i].word).join(' ').toLowerCase().trim();
        const correctSentence = ex.correctWords.join(' ').toLowerCase().trim();
        const correct = answer === correctSentence;
        let fb;
        if (correct) { session.correct++; fb = `✅ **Benar!** "${ex.correctWords.join(' ')}"`; }
        else { session.hearts--; fb = `❌ **Salah!** Jawaban: **"${ex.correctWords.join(' ')}"**`; }
        return advance(interaction, session, ownerId, guildId, fb);
    }
}

function isBelajarButton(customId) { return typeof customId === 'string' && customId.startsWith('belajar_'); }

module.exports = { handleBelajarCommand, handleBelajarButton, isBelajarButton, TOPICS };
