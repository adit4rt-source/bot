// systems/belajar.js — Pusat Belajar (Duolingo-style, BAB → Topik → Part)
//
// /belajar → BAB 1 (aktif) berisi 10 topik. Tiap topik punya beberapa Part
// (lesson) berisi 10 soal. Part tertentu = "extra" (XP & Money 2x lipat).
// Latihan: pilihan ganda + susun kalimat (tap tiles). Sistem nyawa ❤️x5.
// Progress (part selesai + XP) tersimpan permanen. Unlock bertahap.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, incrementUserStat, getUserStat } = require('../database');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS belajar_progress (guildId TEXT, userId TEXT, maxUnit INTEGER DEFAULT 0, xp INTEGER DEFAULT 0, PRIMARY KEY (guildId, userId))`);
db.exec(`CREATE TABLE IF NOT EXISTS belajar_done (guildId TEXT, userId TEXT, partKey TEXT, PRIMARY KEY (guildId, userId, partKey))`);
try { db.exec("ALTER TABLE belajar_progress ADD COLUMN streak INTEGER DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE belajar_progress ADD COLUMN lastDay TEXT DEFAULT ''"); } catch (_) {}

function jakartaDate(offsetDays = 0) {
    return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}
function ensureRow(guildId, userId) {
    db.prepare("INSERT OR IGNORE INTO belajar_progress (guildId, userId, maxUnit, xp, streak, lastDay) VALUES (?, ?, 0, 0, 0, '')").run(guildId, userId);
}
function getXP(guildId, userId) {
    const r = db.prepare('SELECT xp FROM belajar_progress WHERE guildId = ? AND userId = ?').get(guildId, userId);
    return r ? r.xp : 0;
}
function addXP(guildId, userId, amount) {
    ensureRow(guildId, userId);
    db.prepare('UPDATE belajar_progress SET xp = xp + ? WHERE guildId = ? AND userId = ?').run(amount, guildId, userId);
}
function studyLevel(xp) { return Math.floor((xp || 0) / 500) + 1; }
function getStudyStats(guildId, userId) {
    ensureRow(guildId, userId);
    const r = db.prepare('SELECT xp, streak, lastDay FROM belajar_progress WHERE guildId = ? AND userId = ?').get(guildId, userId) || { xp: 0, streak: 0, lastDay: '' };
    return { xp: r.xp || 0, streak: r.streak || 0, lastDay: r.lastDay || '', level: studyLevel(r.xp) };
}
function updateStreak(guildId, userId) {
    ensureRow(guildId, userId);
    const today = jakartaDate();
    const r = db.prepare('SELECT streak, lastDay FROM belajar_progress WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (r.lastDay === today) return r.streak; // sudah belajar hari ini
    const yesterday = jakartaDate(-1);
    const newStreak = (r.lastDay === yesterday) ? (r.streak || 0) + 1 : 1;
    db.prepare('UPDATE belajar_progress SET streak = ?, lastDay = ? WHERE guildId = ? AND userId = ?').run(newStreak, today, guildId, userId);
    return newStreak;
}

// ==================== ACHIEVEMENTS ====================
const ACHIEVEMENTS = [
    { id: 'first', emoji: '🌱', name: 'Langkah Pertama', xp: 20, desc: 'Selesaikan 1 part' },
    { id: 'perfect', emoji: '💯', name: 'Sempurna!', xp: 30, desc: 'Selesai part tanpa salah (nyawa penuh)' },
    { id: 'streak7', emoji: '🔥', name: 'Rajin 7 Hari', xp: 70, desc: 'Streak belajar 7 hari' },
    { id: 'streak30', emoji: '🏆', name: 'Master 30 Hari', xp: 300, desc: 'Streak belajar 30 hari' },
    { id: 'correct100', emoji: '🎯', name: '100 Jawaban Benar', xp: 100, desc: 'Total 100 jawaban benar' },
    { id: 'bab1', emoji: '🎓', name: 'Tamat BAB 1', xp: 500, desc: 'Selesaikan semua topik BAB 1' },
];
const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

function hasAch(guildId, userId, achId) {
    return !!db.prepare('SELECT 1 FROM belajar_done WHERE guildId = ? AND userId = ? AND partKey = ?').get(guildId, userId, `ach:${achId}`);
}
function grantAch(guildId, userId, achId) {
    db.prepare('INSERT OR IGNORE INTO belajar_done (guildId, userId, partKey) VALUES (?, ?, ?)').run(guildId, userId, `ach:${achId}`);
}
function allTopicsDone(guildId, userId) {
    return TOPICS.every(t => topicDoneCount(guildId, userId, t.id) >= t.parts);
}
// Cek achievement baru; return array {emoji,name,xp}
function checkAchievements(guildId, userId, ctx) {
    const unlocked = [];
    const tryGrant = (id, cond) => {
        if (cond && !hasAch(guildId, userId, id)) {
            grantAch(guildId, userId, id);
            const a = ACH_BY_ID[id];
            addXP(guildId, userId, a.xp);
            unlocked.push(a);
        }
    };
    const totalCorrect = getUserStat(guildId, userId, 'belajar_correct') || 0;
    tryGrant('first', true);
    tryGrant('perfect', ctx.perfect);
    tryGrant('streak7', (ctx.streak || 0) >= 7);
    tryGrant('streak30', (ctx.streak || 0) >= 30);
    tryGrant('correct100', totalCorrect >= 100);
    tryGrant('bab1', allTopicsDone(guildId, userId));
    return unlocked;
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
        { en: 'Would you like a drink', id: 'Mau minum sesuatu' },
        { en: 'Yes please', id: 'Ya mau' },
        { en: 'No thank you', id: 'Tidak terima kasih' },
        { en: 'I would like some water', id: 'Saya mau air putih' },
        { en: 'Do you want coffee or tea', id: 'Kamu mau kopi atau teh' },
        { en: 'A cup of coffee please', id: 'Tolong secangkir kopi' },
        { en: 'I am thirsty', id: 'Saya haus' },
        { en: 'Here is your drink', id: 'Ini minumanmu' },
        { en: 'Can I have some tea', id: 'Boleh minta teh' },
        { en: 'Sure here you go', id: 'Tentu silakan' },
    ]},
    { id: 't2', emoji: '🌍', title: 'Menceritakan dari mana asalmu', parts: 5, extra: [3], phrases: [
        { en: 'Where are you from', id: 'Kamu berasal dari mana' },
        { en: 'I am from Indonesia', id: 'Saya berasal dari Indonesia' },
        { en: 'She is from Japan', id: 'Dia berasal dari Jepang' },
        { en: 'I live in Jakarta', id: 'Saya tinggal di Jakarta' },
        { en: 'I am Indonesian', id: 'Saya orang Indonesia' },
        { en: 'Where do you live', id: 'Kamu tinggal di mana' },
        { en: 'He comes from America', id: 'Dia datang dari Amerika' },
        { en: 'My city is beautiful', id: 'Kota saya indah' },
        { en: 'I was born in Bandung', id: 'Saya lahir di Bandung' },
        { en: 'Which country are you from', id: 'Kamu dari negara mana' },
    ]},
    { id: 't3', emoji: '👨‍👩‍👧', title: 'Memperkenalkan diri dan keluarga', parts: 5, extra: [3], phrases: [
        { en: 'My name is Budi', id: 'Nama saya Budi' },
        { en: 'Nice to meet you', id: 'Senang berkenalan denganmu' },
        { en: 'This is my mother', id: 'Ini ibu saya' },
        { en: 'He is my father', id: 'Dia ayah saya' },
        { en: 'I have two sisters', id: 'Saya punya dua kakak perempuan' },
        { en: 'What is your name', id: 'Siapa namamu' },
        { en: 'How old are you', id: 'Berapa umurmu' },
        { en: 'This is my family', id: 'Ini keluarga saya' },
        { en: 'My brother is tall', id: 'Kakak laki-laki saya tinggi' },
        { en: 'She is my best friend', id: 'Dia sahabat saya' },
    ]},
    { id: 't4', emoji: '✈️', title: 'Menjelajahi bandara', parts: 8, extra: [3, 6], phrases: [
        { en: 'Where is the airport', id: 'Di mana bandaranya' },
        { en: 'Here is my passport', id: 'Ini paspor saya' },
        { en: 'What time is the flight', id: 'Jam berapa penerbangannya' },
        { en: 'I have one suitcase', id: 'Saya bawa satu koper' },
        { en: 'Where is the gate', id: 'Di mana gerbangnya' },
        { en: 'The plane is late', id: 'Pesawatnya terlambat' },
        { en: 'I need a ticket', id: 'Saya butuh tiket' },
        { en: 'My flight is at noon', id: 'Penerbangan saya jam dua belas siang' },
        { en: 'Can I see your passport', id: 'Boleh saya lihat paspor Anda' },
        { en: 'Have a safe trip', id: 'Semoga perjalanannya aman' },
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
        { en: 'I would like to order', id: 'Saya ingin memesan' },
        { en: 'Can I see the menu', id: 'Boleh saya lihat menunya' },
        { en: 'I want fried rice', id: 'Saya mau nasi goreng' },
        { en: 'One glass of orange juice', id: 'Satu gelas jus jeruk' },
        { en: 'The bill please', id: 'Minta tagihannya' },
        { en: 'Is it spicy', id: 'Apakah ini pedas' },
        { en: 'This food is delicious', id: 'Makanan ini enak' },
        { en: 'I would like some soup', id: 'Saya mau sup' },
        { en: 'How much is it', id: 'Berapa harganya' },
        { en: 'No sugar please', id: 'Tanpa gula ya' },
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
        { en: 'She walks to work', id: 'Dia berjalan kaki ke kantor' },
        { en: 'He studies at night', id: 'Dia belajar pada malam hari' },
        { en: 'I do not understand', id: 'Saya tidak mengerti' },
        { en: 'Do you speak English', id: 'Apakah kamu bisa berbahasa Inggris' },
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
        { en: 'I love animals', id: 'Saya sayang binatang' },
        { en: 'My rabbit is white', id: 'Kelinci saya berwarna putih' },
        { en: 'The bird can fly', id: 'Burung itu bisa terbang' },
        { en: 'My dog likes to play', id: 'Anjing saya suka bermain' },
        { en: 'I walk my dog every day', id: 'Saya mengajak anjing jalan setiap hari' },
        { en: 'Cats are cute', id: 'Kucing itu lucu' },
    ]},
];
const TOPIC_BY_ID = Object.fromEntries(TOPICS.map(t => [t.id, t]));

// Bank kata level-kata (untuk soal "pilih arti" 3 opsi + match pairs) — lebih mudah
const WORDS_BY_TOPIC = {
    t1: [['water','air'],['coffee','kopi'],['tea','teh'],['juice','jus'],['milk','susu'],['sugar','gula'],['drink','minum'],['glass','gelas'],['cup','cangkir'],['cold','dingin']],
    t2: [['from','dari'],['country','negara'],['city','kota'],['live','tinggal'],['born','lahir'],['home','rumah'],['near','dekat'],['far','jauh'],['place','tempat'],['world','dunia']],
    t3: [['mother','ibu'],['father','ayah'],['sister','saudari'],['brother','saudara'],['family','keluarga'],['name','nama'],['friend','teman'],['child','anak'],['old','tua'],['young','muda']],
    t4: [['airport','bandara'],['passport','paspor'],['ticket','tiket'],['flight','penerbangan'],['plane','pesawat'],['bag','tas'],['gate','gerbang'],['seat','kursi'],['luggage','koper'],['trip','perjalanan']],
    t5: [['big','besar'],['small','kecil'],['hot','panas'],['cold','dingin'],['beautiful','indah'],['new','baru'],['clean','bersih'],['expensive','mahal'],['sweet','manis'],['tall','tinggi']],
    t6: [['food','makanan'],['rice','nasi'],['soup','sup'],['menu','menu'],['spicy','pedas'],['bill','tagihan'],['eat','makan'],['order','pesan'],['delicious','enak'],['fork','garpu']],
    t7: [['doctor','dokter'],['teacher','guru'],['engineer','insinyur'],['police','polisi'],['driver','sopir'],['job','pekerjaan'],['work','bekerja'],['bank','bank'],['cook','memasak'],['help','membantu']],
    t8: [['eat','makan'],['drink','minum'],['read','membaca'],['write','menulis'],['play','bermain'],['walk','berjalan'],['run','berlari'],['study','belajar'],['sleep','tidur'],['watch','menonton']],
    t9: [['sunny','cerah'],['rain','hujan'],['cold','dingin'],['hot','panas'],['cloudy','berawan'],['windy','berangin'],['snow','salju'],['sky','langit'],['umbrella','payung'],['weather','cuaca']],
    t10:[['cat','kucing'],['dog','anjing'],['bird','burung'],['fish','ikan'],['rabbit','kelinci'],['pet','peliharaan'],['animal','binatang'],['cute','lucu'],['friendly','ramah'],['tail','ekor']],
};
for (const t of TOPICS) t.words = (WORDS_BY_TOPIC[t.id] || []).map(([en, id]) => ({ en, id }));

const EXTRA_WORDS = ['you', 'they', 'big', 'red', 'now', 'here', 'good', 'day', 'very', 'and', 'the', 'with', 'is', 'are', 'my'];
const HEARTS_MAX = 5;
const EX_PER_LESSON = 10;

const sessions = new Map();

function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Tampilkan kalimat sebagai tile per-kata: `A` `cup` `of` `coffee`
function tileText(s) { return String(s).trim().split(/\s+/).map(w => `\`${w}\``).join(' '); }

// ==================== EXERCISE GEN ====================
// MC kalimat (4 opsi) — agak sulit
function makeMC(pool) {
    const correct = pool[Math.floor(Math.random() * pool.length)];
    const enToId = Math.random() < 0.5;
    const distract = shuffle(pool.filter(p => p.en !== correct.en)).slice(0, 3);
    const opts = shuffle([correct, ...distract]);
    if (enToId) return { type: 'mc', prompt: `Apa arti kalimat ini?\n${tileText(correct.en)}`, options: opts.map(p => p.id), correctIndex: opts.findIndex(p => p.en === correct.en) };
    return { type: 'mc', prompt: `Terjemahkan ke Inggris:\n${tileText(correct.id)}`, options: opts.map(p => p.en), correctIndex: opts.findIndex(p => p.en === correct.en) };
}
// MC kata tunggal (3 opsi) — mudah
function makeWord(words) {
    const correct = words[Math.floor(Math.random() * words.length)];
    const enToId = Math.random() < 0.5;
    const distract = shuffle(words.filter(w => w.en !== correct.en)).slice(0, 2);
    const opts = shuffle([correct, ...distract]);
    if (enToId) return { type: 'mc', prompt: `Pilih arti dari kata: \`${correct.en}\``, options: opts.map(w => w.id), correctIndex: opts.findIndex(w => w.en === correct.en) };
    return { type: 'mc', prompt: `Bahasa Inggris dari kata: \`${correct.id}\``, options: opts.map(w => w.en), correctIndex: opts.findIndex(w => w.en === correct.en) };
}
// Susun kalimat (tap tiles)
function makeArrange(pool) {
    const phrase = pool[Math.floor(Math.random() * pool.length)];
    const correctWords = phrase.en.split(' ');
    const room = Math.max(1, Math.min(3, 9 - correctWords.length));
    const extras = shuffle(EXTRA_WORDS.filter(w => !correctWords.includes(w))).slice(0, room);
    const tiles = shuffle([...correctWords, ...extras]).map(w => ({ word: w, used: false }));
    return { type: 'arrange', promptId: phrase.id, correctWords, tiles, built: [] };
}
// Pasangkan (match pairs) — 4 pasang
function makeMatch(words) {
    const chosen = shuffle(words).slice(0, 4);
    const pairs = chosen.map(w => ({ en: w.en, id: w.id }));
    const left = shuffle(pairs.map((_, i) => i));   // ID column order
    const right = shuffle(pairs.map((_, i) => i));  // EN column order
    return { type: 'match', pairs, left, right, matched: [], sel: null };
}

// Kesulitan bertahap: berdasarkan part DAN posisi soal dalam lesson.
// Soal awal selalu gampang (warmup), makin akhir & makin tinggi part makin sulit.
function pickType(part, i) {
    if (i === 0) return 'word';            // soal 1 selalu kata (paling mudah)
    if (i === 1) return Math.random() < 0.5 ? 'word' : 'match';
    const prog = i / (EX_PER_LESSON - 1);  // 0..1 posisi dalam lesson
    const partF = (part - 1) / 7;          // 0..1 antar part
    const hard = prog * 0.6 + partF * 0.4; // 0..1 tingkat kesulitan
    const weights = [
        ['word', (1 - hard) * 55 + 8],
        ['match', 22 - hard * 8],
        ['mc', hard * 32 + 6],
        ['arrange', hard * 48],
    ];
    const total = weights.reduce((s, [, w]) => s + Math.max(0, w), 0);
    let r = Math.random() * total;
    for (const [t, w] of weights) { if ((r -= Math.max(0, w)) <= 0) return t; }
    return 'word';
}

function buildLesson(topic, part) {
    const ex = [];
    for (let i = 0; i < EX_PER_LESSON; i++) {
        const type = pickType(part, i);
        if (type === 'word') ex.push(makeWord(topic.words));
        else if (type === 'match') ex.push(makeMatch(topic.words));
        else if (type === 'arrange') ex.push(makeArrange(topic.phrases));
        else ex.push(makeMC(topic.phrases));
    }
    return ex;
}

// ==================== RENDER ====================
const LBL = ['🇦', '🇧', '🇨', '🇩'];
function heartsBar(h) { return '❤️'.repeat(h) + '🤍'.repeat(HEARTS_MAX - h); }
function progressBar(cur, total) {
    const filled = Math.round((cur / total) * 12);
    return '▰'.repeat(filled) + '▱'.repeat(12 - filled);
}

function renderExercise(session, userId, note = '') {
    const ex = session.exercises[session.current];
    const total = session.exercises.length;
    const bar = `**Soal ${session.current + 1}/${total}**  ${progressBar(session.current, total)}`;
    const head = `${heartsBar(session.hearts)}${session.extra ? '  •  ⭐ 2x' : ''}${session.review ? '  •  🔄 Review' : ''}${session.speed ? '  •  ⚡ Speed' : ''}`;
    const noteLine = note ? `${note}\n\n` : '';

    if (ex.type === 'mc') {
        const embed = new EmbedBuilder().setColor('#1CB0F6')
            .setAuthor({ name: '🇬🇧 Bahasa Inggris' })
            .setTitle('Pilih jawaban yang benar')
            .setDescription(`${bar}\n\n${noteLine}${ex.prompt}\n\n` + ex.options.map((o, i) => `${LBL[i]}  ${o}`).join('\n'))
            .setFooter({ text: head });
        const row = new ActionRowBuilder().addComponents(ex.options.map((_, i) => new ButtonBuilder().setCustomId(`belajar_ans_${i}_${userId}`).setLabel(LBL[i]).setStyle(ButtonStyle.Primary)));
        return { embeds: [embed], components: [row] };
    }

    if (ex.type === 'arrange') {
        const builtWords = (ex.built || []).map(i => ex.tiles[i].word);
        const builtLine = builtWords.length ? builtWords.map(w => `\`${w}\``).join(' ') : '`___`';
        const embed = new EmbedBuilder().setColor('#CE82FF')
            .setAuthor({ name: '🇬🇧 Bahasa Inggris' })
            .setTitle('🧩 Susun kalimatnya')
            .setDescription(`${bar}\n\n${noteLine}Terjemahkan ke Inggris:\n**${ex.promptId}**\n\n📝 ${builtLine}`)
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
            new ButtonBuilder().setCustomId(`belajar_check_${userId}`).setLabel('✅ Cek Jawaban').setStyle(ButtonStyle.Success).setDisabled(ex.built.length === 0),
        ));
        return { embeds: [embed], components: components.slice(0, 5) };
    }

    // match
    const embed = new EmbedBuilder().setColor('#FF9600')
        .setAuthor({ name: '🇬🇧 Bahasa Inggris' })
        .setTitle('🔗 Pasangkan kata yang cocok')
        .setDescription(`${bar}\n\n${noteLine}Ketuk kata Indonesia lalu pasangan Inggrisnya.\n\n✅ Cocok: **${ex.matched.length}/${ex.pairs.length}**`)
        .setFooter({ text: head });
    const leftRow = new ActionRowBuilder();
    ex.left.forEach((pairIdx, slot) => {
        const done = ex.matched.includes(pairIdx);
        const selected = ex.sel && ex.sel.side === 'L' && ex.sel.slot === slot;
        leftRow.addComponents(new ButtonBuilder()
            .setCustomId(`belajar_mt_L_${slot}_${userId}`)
            .setLabel(ex.pairs[pairIdx].id)
            .setStyle(done ? ButtonStyle.Success : selected ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(done));
    });
    const rightRow = new ActionRowBuilder();
    ex.right.forEach((pairIdx, slot) => {
        const done = ex.matched.includes(pairIdx);
        const selected = ex.sel && ex.sel.side === 'R' && ex.sel.slot === slot;
        rightRow.addComponents(new ButtonBuilder()
            .setCustomId(`belajar_mt_R_${slot}_${userId}`)
            .setLabel(ex.pairs[pairIdx].en)
            .setStyle(done ? ButtonStyle.Success : selected ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(done));
    });
    return { embeds: [embed], components: [leftRow, rightRow] };
}

// ==================== PANELS ====================
function topicUnlocked(guildId, userId, index) {
    if (index === 0) return true;
    const prev = TOPICS[index - 1];
    return topicDoneCount(guildId, userId, prev.id) >= prev.parts;
}

function buildChapterPanel(guildId, userId) {
    const st = getStudyStats(guildId, userId);
    const lines = TOPICS.map((t, idx) => {
        const done = topicDoneCount(guildId, userId, t.id);
        const unlocked = topicUnlocked(guildId, userId, idx);
        const status = done >= t.parts ? '✅' : unlocked ? '▶️' : '🔒';
        return `${status} ${t.emoji} **${t.title}** *(${done}/${t.parts})*`;
    });
    const embed = new EmbedBuilder()
        .setColor('#1CB0F6')
        .setTitle('📘 BAB 1 — Bahasa Inggris Dasar')
        .setDescription(
            `📊 Level **${st.level}**  •  ⭐ **${st.xp}** XP  •  🔥 Streak **${st.streak}** hari\n\n` +
            `${lines.join('\n')}\n\n🔜 *BAB 2 — Coming Soon*\n-# Pilih topik terbuka, atau Review/Speed/Peringkat di bawah.`
        )
        .setFooter({ text: 'Belajar tiap hari untuk menjaga streak! 🔥' });

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
    // Extra actions row (max 5 component rows total)
    if (rows.length < 5) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`belajar_review_${userId}`).setLabel('🔄 Review').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`belajar_speed_${userId}`).setLabel('⚡ Speed Round').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`belajar_lb_${userId}`).setLabel('🏆 Peringkat').setStyle(ButtonStyle.Secondary),
        ));
    }
    return { embeds: [embed], components: rows.slice(0, 5) };
}

function buildLeaderboardPanel(guildId, userId, guild) {
    const rows = db.prepare('SELECT userId, xp FROM belajar_progress WHERE guildId = ? AND xp > 0 ORDER BY xp DESC LIMIT 10').all(guildId);
    const medals = ['🥇', '🥈', '🥉'];
    const lines = rows.length ? rows.map((r, i) => {
        const tag = medals[i] || `**${i + 1}.**`;
        const name = guild?.members?.cache?.get(r.userId)?.user?.username || `User`;
        const lv = studyLevel(r.xp);
        return `${tag} <@${r.userId}> — Lv.${lv} • ⭐ ${r.xp} XP`;
    }).join('\n') : '*Belum ada yang belajar. Jadilah yang pertama!*';
    const myRank = db.prepare('SELECT COUNT(*) AS c FROM belajar_progress WHERE guildId = ? AND xp > (SELECT xp FROM belajar_progress WHERE guildId = ? AND userId = ?)').get(guildId, guildId, userId).c + 1;
    const myXp = getXP(guildId, userId);
    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏆 Peringkat XP Belajar')
        .setDescription(`${lines}\n\n-# Peringkat kamu: **#${myRank}** (⭐ ${myXp} XP)`);
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`belajar_home_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary));
    return { embeds: [embed], components: [row] };
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

function buildFinishPayload(session, ownerId, guildId, success) {
    sessions.delete(`${guildId}_${ownerId}`);

    // ---- Speed Round finish (lag-tolerant: ukur waktu di server, tanpa countdown) ----
    if (session.speed) {
        const elapsed = Math.max(1, Math.round((Date.now() - session.startTime) / 1000));
        const streak = updateStreak(guildId, ownerId);
        const base = session.correct * 50;
        const speedBonus = session.correct === session.exercises.length && elapsed < 60 ? 500 : 0;
        const moneyGain = base + speedBonus;
        const xpGain = session.correct * 5;
        addXP(guildId, ownerId, xpGain);
        try {
            const u = getOrCreateUser(guildId, ownerId);
            u.balance += moneyGain;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(u.balance, guildId, ownerId);
            incrementUserStat(guildId, ownerId, 'belajar_correct', session.correct);
        } catch (_) {}
        const embed = new EmbedBuilder().setColor('#FF9600').setTitle('⚡ Speed Round Selesai!')
            .setDescription(
                `✅ Benar: **${session.correct}/${session.exercises.length}**\n` +
                `⏱️ Waktu: **${elapsed} detik**\n` +
                `⭐ XP: **+${xpGain}**  •  🪙 Money: **+${moneyGain.toLocaleString('id-ID')}**` +
                (speedBonus ? `\n🔥 **BONUS KILAT +500** (sempurna & cepat!)` : '') +
                `\n🔥 Streak belajar: **${streak} hari**`
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`belajar_speed_${ownerId}`).setLabel('⚡ Lagi').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`belajar_home_${ownerId}`).setLabel('📘 BAB 1').setStyle(ButtonStyle.Secondary),
        );
        return { embeds: [embed], components: [row] };
    }

    const topic = TOPIC_BY_ID[session.topicId];
    if (success) {
        const isReview = !!session.review;
        if (!isReview) markPartDone(guildId, ownerId, session.topicId, session.part);
        const mult = (session.extra ? 2 : 1) * (isReview ? 0.5 : 1);
        const xpGain = Math.round(session.correct * 10 * mult);
        const moneyGain = Math.round(session.correct * 100 * mult);
        addXP(guildId, ownerId, xpGain);
        try {
            const u = getOrCreateUser(guildId, ownerId);
            u.balance += moneyGain;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(u.balance, guildId, ownerId);
            incrementUserStat(guildId, ownerId, 'belajar_correct', session.correct);
        } catch (_) {}

        // Streak harian + achievements
        const streak = updateStreak(guildId, ownerId);
        const perfect = !isReview && session.hearts === HEARTS_MAX && session.correct === session.exercises.length;
        const newAch = checkAchievements(guildId, ownerId, { streak, perfect });

        const nextPartUnlocked = !isReview && session.part < topic.parts;
        const topicDone = !isReview && topicDoneCount(guildId, ownerId, session.topicId) >= topic.parts;
        let desc =
            `${topic.emoji} **${topic.title}** — ${isReview ? '🔄 Review' : `Part ${session.part}${session.extra ? ' 🌟' : ''}`}\n\n` +
            `✅ Benar: **${session.correct}/${session.exercises.length}**  ${heartsBar(session.hearts)}\n` +
            `⭐ XP: **+${xpGain}**  •  🪙 Money: **+${moneyGain.toLocaleString('id-ID')}**${session.extra && !isReview ? '  *(2x Extra!)*' : ''}${isReview ? '  *(Review 0.5x)*' : ''}\n` +
            `🔥 Streak belajar: **${streak} hari**`;
        if (perfect) desc += `\n💯 **PERFECT!** Tanpa salah!`;
        if (topicDone) desc += `\n\n🏆 **Topik selesai!** Topik berikutnya terbuka!`;
        else if (nextPartUnlocked) desc += `\n\n🔓 **Part ${session.part + 1} terbuka!**`;
        if (newAch.length) desc += `\n\n🎖️ **Achievement baru:**\n` + newAch.map(a => `${a.emoji} **${a.name}** (+${a.xp} XP)`).join('\n');

        const embed = new EmbedBuilder().setColor('#58CC02').setTitle(isReview ? '🔄 Review Selesai!' : '🎉 Part Selesai!').setDescription(desc);
        const row = new ActionRowBuilder().addComponents(
            isReview
                ? new ButtonBuilder().setCustomId(`belajar_home_${ownerId}`).setLabel('📘 BAB 1').setStyle(ButtonStyle.Primary)
                : new ButtonBuilder().setCustomId(`belajar_topic_${session.topicId}_${ownerId}`).setLabel('📋 Lihat Part').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`belajar_home_${ownerId}`).setLabel('📘 BAB 1').setStyle(ButtonStyle.Secondary),
        );
        return { embeds: [embed], components: [row] };
    }
    const embed = new EmbedBuilder().setColor('#FF4B4B').setTitle('💔 Nyawa Habis!')
        .setDescription(`Kamu kehabisan nyawa di **${topic.title}**${session.review ? ' (Review)' : ` Part ${session.part}`}.\n✅ Benar: ${session.correct}/${session.exercises.length}\n\nCoba lagi ya, kamu pasti bisa! 💪`);
    const retryBtn = session.review
        ? new ButtonBuilder().setCustomId(`belajar_review_${ownerId}`).setLabel('🔁 Review Lagi').setStyle(ButtonStyle.Success)
        : new ButtonBuilder().setCustomId(`belajar_part_${session.topicId}_${session.part}_${ownerId}`).setLabel('🔁 Ulangi').setStyle(ButtonStyle.Success);
    const row = new ActionRowBuilder().addComponents(
        retryBtn,
        new ButtonBuilder().setCustomId(`belajar_home_${ownerId}`).setLabel('📘 BAB 1').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row] };
}

// Tampilkan layar feedback singkat (✅/❌) lalu lanjut ke soal berikutnya.
async function resolveAnswer(interaction, session, ownerId, guildId, correct, answerText) {
    if (correct) session.correct++;
    else if (!session.speed) session.hearts--;

    // Speed Round: lanjut instan tanpa layar feedback (biar waktu adil)
    if (session.speed) {
        session.current++;
        const payload = session.current >= session.exercises.length
            ? buildFinishPayload(session, ownerId, guildId, true)
            : renderExercise(session, ownerId);
        return interaction.update(payload);
    }

    const fbEmbed = correct
        ? new EmbedBuilder().setColor('#58CC02').setTitle('✅ Benar!').setDescription('Mantap! Lanjut ke soal berikutnya...')
        : new EmbedBuilder().setColor('#FF4B4B').setTitle('❌ Kurang tepat').setDescription(`Jawaban yang benar:\n${tileText(answerText)}`);
    await interaction.update({ embeds: [fbEmbed], components: [] });

    const delay = correct ? 900 : 1800;
    setTimeout(() => {
        session.current++;
        let payload;
        if (session.hearts <= 0) payload = buildFinishPayload(session, ownerId, guildId, false);
        else if (session.current >= session.exercises.length) payload = buildFinishPayload(session, ownerId, guildId, true);
        else payload = renderExercise(session, ownerId);
        interaction.editReply(payload).catch(() => {});
    }, delay);
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
    if (customId.startsWith('belajar_lb_')) {
        return interaction.update(buildLeaderboardPanel(guildId, ownerId, interaction.guild));
    }
    if (customId.startsWith('belajar_review_')) {
        // Pilih topik acak yang sudah ada progress untuk review
        const completed = TOPICS.filter(t => topicDoneCount(guildId, ownerId, t.id) > 0);
        if (!completed.length) {
            return interaction.reply({ content: '🔄 Selesaikan minimal 1 part dulu sebelum bisa Review!', ephemeral: true });
        }
        const topic = completed[Math.floor(Math.random() * completed.length)];
        const session = { topicId: topic.id, part: 0, review: true, extra: false, exercises: buildLesson(topic, 4), current: 0, hearts: HEARTS_MAX, correct: 0 };
        sessions.set(`${guildId}_${ownerId}`, session);
        return interaction.update(renderExercise(session, ownerId));
    }
    if (customId.startsWith('belajar_speed_')) {
        // Speed Round: 10 soal kata dari semua topik yang sudah dibuka
        const pool = [];
        TOPICS.forEach((t, idx) => { if (topicUnlocked(guildId, ownerId, idx)) pool.push(...t.words); });
        const words = pool.length ? pool : TOPICS[0].words;
        const exercises = [];
        for (let i = 0; i < EX_PER_LESSON; i++) exercises.push(makeWord(words));
        const session = { speed: true, topicId: null, exercises, current: 0, hearts: HEARTS_MAX, correct: 0, startTime: Date.now() };
        sessions.set(`${guildId}_${ownerId}`, session);
        return interaction.update(renderExercise(session, ownerId));
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
        const session = { topicId, part, extra: topic.extra.includes(part), exercises: buildLesson(topic, part), current: 0, hearts: HEARTS_MAX, correct: 0 };
        sessions.set(`${guildId}_${ownerId}`, session);
        return interaction.update(renderExercise(session, ownerId));
    }

    const session = sessions.get(`${guildId}_${ownerId}`);
    if (!session) return interaction.update({ content: '⚠️ Sesi sudah berakhir. Ketik `/belajar` untuk mulai lagi.', embeds: [], components: [] });
    const ex = session.exercises[session.current];

    if (customId.startsWith('belajar_ans_')) {
        const chosen = parseInt(parts[2]);
        const correct = chosen === ex.correctIndex;
        return resolveAnswer(interaction, session, ownerId, guildId, correct, ex.options[ex.correctIndex]);
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
        return resolveAnswer(interaction, session, ownerId, guildId, correct, ex.correctWords.join(' '));
    }

    // Match pairs: tap a tile (L/R)
    if (customId.startsWith('belajar_mt_')) {
        if (ex.type !== 'match') return interaction.deferUpdate();
        const side = parts[2];
        const slot = parseInt(parts[3]);
        const pairIdx = (side === 'L' ? ex.left : ex.right)[slot];
        if (ex.matched.includes(pairIdx)) return interaction.deferUpdate();

        if (!ex.sel) { ex.sel = { side, slot, pairIdx }; return interaction.update(renderExercise(session, ownerId)); }
        if (ex.sel.side === side) { ex.sel = { side, slot, pairIdx }; return interaction.update(renderExercise(session, ownerId)); }

        const isMatch = ex.sel.pairIdx === pairIdx;
        ex.sel = null;
        if (isMatch) {
            ex.matched.push(pairIdx);
            if (ex.matched.length >= ex.pairs.length) {
                // Selesai semua pasangan → benar → layar feedback lalu lanjut
                return resolveAnswer(interaction, session, ownerId, guildId, true, 'Semua pasangan cocok!');
            }
            return interaction.update(renderExercise(session, ownerId, '✅ Cocok!'));
        }
        // Salah → kurangi nyawa (konsisten)
        session.hearts--;
        if (session.hearts <= 0) {
            return interaction.update(buildFinishPayload(session, ownerId, guildId, false));
        }
        return interaction.update(renderExercise(session, ownerId, '❌ Belum cocok! -1 ❤️'));
    }
}

function isBelajarButton(customId) { return typeof customId === 'string' && customId.startsWith('belajar_'); }

module.exports = { handleBelajarCommand, handleBelajarButton, isBelajarButton, TOPICS, getStudyStats };
