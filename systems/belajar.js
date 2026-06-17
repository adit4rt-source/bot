// systems/belajar.js — Pusat Belajar (Duolingo-style, BAB → Topik → Part)
//
// /belajar → BAB 1 (aktif) berisi 10 topik. Tiap topik punya beberapa Part
// (lesson) berisi 10 soal. Part tertentu = "extra" (XP & Money 2x lipat).
// Latihan: pilihan ganda + susun kalimat (tap tiles). Sistem nyawa ❤️x5.
// Progress (part selesai + XP) tersimpan permanen. Unlock bertahap.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser, incrementUserStat, getUserStat } = require('../database');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

const TTS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const _ttsCache = new Map();
async function getTTS(text) {
    if (!text || typeof fetch !== 'function') return null;
    if (_ttsCache.has(text)) return _ttsCache.get(text);
    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(text)}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { headers: { 'User-Agent': TTS_UA, Referer: 'https://translate.google.com/' }, signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (_ttsCache.size > 200) {
            // LRU-style eviction: delete oldest 50 entries
            const keys = [..._ttsCache.keys()].slice(0, 50);
            keys.forEach(k => _ttsCache.delete(k));
        }
        _ttsCache.set(text, buf);
        return buf;
    } catch (_) { return null; }
}


// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS belajar_progress (guildId TEXT, userId TEXT, maxUnit INTEGER DEFAULT 0, xp INTEGER DEFAULT 0, PRIMARY KEY (guildId, userId))`);
db.exec(`CREATE TABLE IF NOT EXISTS belajar_done (guildId TEXT, userId TEXT, partKey TEXT, PRIMARY KEY (guildId, userId, partKey))`);
db.exec(`CREATE TABLE IF NOT EXISTS belajar_weak (guildId TEXT, userId TEXT, word TEXT, wrongCount INTEGER DEFAULT 1, PRIMARY KEY (guildId, userId, word))`);
try { db.exec("ALTER TABLE belajar_progress ADD COLUMN streak INTEGER DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE belajar_progress ADD COLUMN lastDay TEXT DEFAULT ''"); } catch (_) {}

function jakartaDate(offsetDays = 0) {
    return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

// Track which rows have been ensured this session to avoid repeated INSERTs
const _ensuredRows = new Set();
function ensureRow(guildId, userId) {
    const key = `${guildId}_${userId}`;
    if (_ensuredRows.has(key)) return;
    db.prepare("INSERT OR IGNORE INTO belajar_progress (guildId, userId, maxUnit, xp, streak, lastDay) VALUES (?, ?, 0, 0, 0, '')").run(guildId, userId);
    _ensuredRows.add(key);
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
    if (r.lastDay === today) return r.streak;
    const yesterday = jakartaDate(-1);
    const newStreak = (r.lastDay === yesterday) ? (r.streak || 0) + 1 : 1;
    db.prepare('UPDATE belajar_progress SET streak = ?, lastDay = ? WHERE guildId = ? AND userId = ?').run(newStreak, today, guildId, userId);
    return newStreak;
}


// ==================== WEAK WORDS SYSTEM ====================
function incrementWeakWord(guildId, userId, word) {
    db.prepare(`INSERT INTO belajar_weak (guildId, userId, word, wrongCount) VALUES (?, ?, ?, 1) ON CONFLICT(guildId, userId, word) DO UPDATE SET wrongCount = wrongCount + 1`).run(guildId, userId, word);
}
function getWeakWords(guildId, userId) {
    return db.prepare('SELECT word, wrongCount FROM belajar_weak WHERE guildId = ? AND userId = ? ORDER BY wrongCount DESC LIMIT 20').all(guildId, userId);
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
    return db.prepare("SELECT COUNT(*) AS c FROM belajar_done WHERE guildId = ? AND userId = ? AND partKey LIKE ?").get(guildId, userId, `${topicId}:%`).c;
}


// ==================== CONTENT: BAB 1 (10 topik) ====================
// Tiap topik: parts (jumlah lesson), extra (part bonus 2x), phrases (bank kalimat), tips (grammar tips in Indonesian)
const TOPICS = [
    { id: 't1', emoji: '🥤', title: 'Menawarkan & menerima minuman', parts: 5, extra: [3], tips: [
        "'Would you like...' digunakan untuk menawarkan sesuatu dengan sopan.",
        "'Please' di akhir kalimat Inggris = 'Tolong' di awal kalimat Indonesia.",
        "'Some' dipakai untuk menawarkan/meminta sesuatu yang tak tentu jumlahnya."
    ], phrases: [
        { en: 'Would you like a drink', id: 'Mau minum sesuatu' },
        { en: 'Yes please', id: 'Ya, mau' },
        { en: 'No thank you', id: 'Tidak, terima kasih' },
        { en: 'I would like some water', id: 'Aku mau air putih' },
        { en: 'Do you want coffee or tea', id: 'Kamu mau kopi atau teh' },
        { en: 'A cup of coffee please', id: 'Tolong secangkir kopi' },
        { en: 'I am thirsty', id: 'Aku haus' },
        { en: 'Here is your drink', id: 'Ini minumanmu' },
        { en: 'Can I have some tea', id: 'Boleh aku minta teh' },
        { en: 'Sure here you go', id: 'Tentu, silakan' },
        { en: 'Would you like some ice', id: 'Mau pakai es' },
        { en: 'A bottle of water please', id: 'Tolong sebotol air putih' },
        { en: 'I want a cold drink', id: 'Aku mau minuman dingin' },
        { en: 'Do you have orange juice', id: 'Kamu punya jus jeruk' },
        { en: 'I do not like soda', id: 'Aku tidak suka soda' },
        { en: 'She drinks warm milk', id: 'Dia minum susu hangat' },
        { en: 'We need more sugar', id: 'Kita butuh lebih banyak gula' },
        { en: 'Is the tea hot', id: 'Tehnya panas tidak' },
        { en: 'A glass of milk please', id: 'Tolong segelas susu' },
        { en: 'I prefer hot coffee', id: 'Aku lebih suka kopi panas' },
    ]},

    { id: 't2', emoji: '🌍', title: 'Menceritakan dari mana asalmu', parts: 5, extra: [3], tips: [
        "'Where are you from?' artinya 'Dari mana asalmu?' — jawab dengan 'I am from...'",
        "'Live' = tinggal (sekarang), 'Born' = lahir (dulu). Perhatikan konteks waktunya.",
        "Untuk negara/kota, gunakan 'in' setelah 'live': I live in Jakarta."
    ], phrases: [
        { en: 'Where are you from', id: 'Dari mana asalmu' },
        { en: 'I am from Indonesia', id: 'Aku dari Indonesia' },
        { en: 'She is from Japan', id: 'Dia dari Jepang' },
        { en: 'I live in Jakarta', id: 'Aku tinggal di Jakarta' },
        { en: 'I am Indonesian', id: 'Aku orang Indonesia' },
        { en: 'Where do you live', id: 'Kamu tinggal di mana' },
        { en: 'He comes from America', id: 'Dia berasal dari Amerika' },
        { en: 'My city is beautiful', id: 'Kotaku indah' },
        { en: 'I was born in Bandung', id: 'Aku lahir di Bandung' },
        { en: 'Which country are you from', id: 'Dari negara mana asalmu' },
        { en: 'We live in a village', id: 'Kami tinggal di desa' },
        { en: 'They are from England', id: 'Mereka dari Inggris' },
        { en: 'Is this your city', id: 'Ini kotamu' },
        { en: 'I love my country', id: 'Aku cinta negaraku' },
        { en: 'He was born in Bali', id: 'Dia lahir di Bali' },
        { en: 'Is Indonesia a big country', id: 'Indonesia negara besar tidak' },
        { en: 'I want to visit Japan', id: 'Aku mau berkunjung ke Jepang' },
        { en: 'They live in a beautiful town', id: 'Mereka tinggal di kota kecil yang indah' },
        { en: 'She travels to America', id: 'Dia bepergian ke Amerika' },
        { en: 'My capital city is big', id: 'Ibu kota negaraku besar' },
    ]},

    { id: 't3', emoji: '👨‍👩‍👧', title: 'Memperkenalkan diri dan keluarga', parts: 5, extra: [3], tips: [
        "'My name is...' = 'Namaku...' — cara paling umum memperkenalkan diri.",
        "'This is my...' dipakai untuk memperkenalkan orang lain: 'Ini... saya'.",
        "Kata ganti 'He/She' dalam bahasa Indonesia sama-sama 'Dia'."
    ], phrases: [
        { en: 'My name is Budi', id: 'Namaku Budi' },
        { en: 'Nice to meet you', id: 'Senang berkenalan denganmu' },
        { en: 'This is my mother', id: 'Ini ibuku' },
        { en: 'He is my father', id: 'Dia ayahku' },
        { en: 'I have two sisters', id: 'Aku punya dua saudara perempuan' },
        { en: 'What is your name', id: 'Siapa namamu' },
        { en: 'How old are you', id: 'Berapa umurmu' },
        { en: 'This is my family', id: 'Ini keluargaku' },
        { en: 'My brother is tall', id: 'Kakak laki-lakiku tinggi' },
        { en: 'She is my best friend', id: 'Dia sahabatku' },
        { en: 'I have a big family', id: 'Aku punya keluarga besar' },
        { en: 'This is my little sister', id: 'Ini adik perempuanku' },
        { en: 'Who is that man', id: 'Siapa pria itu' },
        { en: 'My parents are happy', id: 'Orang tuaku bahagia' },
        { en: 'He is my grandfather', id: 'Dia kakekku' },
        { en: 'Who is your grandmother', id: 'Siapa nenekmu' },
        { en: 'I have an older brother', id: 'Aku punya kakak laki-laki' },
        { en: 'My aunt lives in Jakarta', id: 'Bibiku tinggal di Jakarta' },
        { en: 'This is my uncle', id: 'Ini pamanku' },
        { en: 'We love our family', id: 'Kami menyayangi keluarga kami' },
    ]},

    { id: 't4', emoji: '✈️', title: 'Menjelajahi bandara', parts: 8, extra: [3, 6], tips: [
        "'Can I...' dipakai untuk minta izin. 'Could I...' lebih sopan lagi.",
        "'Where is...?' = 'Di mana...?' — untuk menanyakan lokasi.",
        "Kata 'Please' bisa di awal atau akhir kalimat. Di Indonesia jadi 'Tolong' di awal."
    ], phrases: [
        { en: 'Where is the airport', id: 'Di mana bandara' },
        { en: 'Here is my passport', id: 'Ini pasporku' },
        { en: 'What time is the flight', id: 'Jam berapa penerbangannya' },
        { en: 'I have one suitcase', id: 'Aku bawa satu koper' },
        { en: 'Where is the gate', id: 'Di mana pintu gerbangnya' },
        { en: 'The plane is late', id: 'Pesawatnya terlambat' },
        { en: 'I need a ticket', id: 'Aku butuh tiket' },
        { en: 'My flight is at noon', id: 'Penerbanganku tengah hari' },
        { en: 'Can I see your passport', id: 'Boleh aku lihat paspormu' },
        { en: 'Have a safe trip', id: 'Semoga perjalananmu aman' },
        { en: 'Where is the terminal', id: 'Di mana terminalnya' },
        { en: 'My luggage is heavy', id: 'Bagasiku berat' },
        { en: 'I want a window seat', id: 'Aku mau kursi dekat jendela' },
        { en: 'The flight is on time', id: 'Penerbangannya tepat waktu' },
        { en: 'We are boarding now', id: 'Kita naik pesawat sekarang' },
        { en: 'Do you have a ticket', id: 'Kamu punya tiket' },
        { en: 'I lost my suitcase', id: 'Aku kehilangan koperku' },
        { en: 'Where is the exit', id: 'Di mana jalan keluarnya' },
        { en: 'The pilot is ready', id: 'Pilotnya sudah siap' },
        { en: 'Please show your passport', id: 'Tolong tunjukkan paspormu' },
    ]},

    { id: 't5', emoji: '🎨', title: 'Deskripsi kata benda dengan kata sifat', parts: 8, extra: [3, 6], tips: [
        "Dalam bahasa Inggris, kata sifat SEBELUM kata benda: 'a red car'. Di Indonesia: 'mobil merah'.",
        "'Too' = terlalu (negatif), 'very' = sangat (netral). 'The coffee is too hot' = terlalu panas.",
        "'A/An' dipakai untuk benda tak tentu. 'The' untuk benda spesifik yang sudah diketahui."
    ], phrases: [
        { en: 'The house is big', id: 'Rumahnya besar' },
        { en: 'A red car', id: 'Sebuah mobil merah' },
        { en: 'The book is interesting', id: 'Bukunya menarik' },
        { en: 'She has a small dog', id: 'Dia punya anjing kecil' },
        { en: 'The weather is hot', id: 'Cuacanya panas' },
        { en: 'A beautiful flower', id: 'Sebuah bunga yang indah' },
        { en: 'The coffee is sweet', id: 'Kopinya manis' },
        { en: 'The water is cold', id: 'Airnya dingin' },
        { en: 'A tall man', id: 'Seorang pria tinggi' },
        { en: 'The room is clean', id: 'Kamarnya bersih' },
        { en: 'The new car is fast', id: 'Mobil baru itu cepat' },
        { en: 'This bag is expensive', id: 'Tas ini mahal' },
        { en: 'A dirty glass', id: 'Sebuah gelas kotor' },
        { en: 'The street is busy', id: 'Jalannya ramai' },
        { en: 'I have a blue shirt', id: 'Aku punya kemeja biru' },
        { en: 'The coffee is too hot', id: 'Kopinya terlalu panas' },
        { en: 'He has a cheap bicycle', id: 'Dia punya sepeda murah' },
        { en: 'My room is quiet', id: 'Kamarku tenang' },
        { en: 'This is an easy test', id: 'Ini ujian yang mudah' },
        { en: 'The water is clean', id: 'Airnya bersih' },
    ]},

    { id: 't6', emoji: '🍽️', title: 'Memesan makanan dan minuman', parts: 8, extra: [3, 6], tips: [
        "'I would like...' lebih sopan dari 'I want...' saat memesan di restoran.",
        "'Can I have...?' = 'Boleh aku minta...?' — cara kasual meminta sesuatu.",
        "'The bill please' = 'Tolong minta tagihannya' — frasa wajib di restoran."
    ], phrases: [
        { en: 'I would like to order', id: 'Aku mau pesan' },
        { en: 'Can I see the menu', id: 'Boleh aku lihat menunya' },
        { en: 'I want fried rice', id: 'Aku mau nasi goreng' },
        { en: 'One glass of orange juice', id: 'Satu gelas jus jeruk' },
        { en: 'The bill please', id: 'Tolong minta tagihannya' },
        { en: 'Is it spicy', id: 'Ini pedas tidak' },
        { en: 'This food is delicious', id: 'Makanan ini enak' },
        { en: 'I would like some soup', id: 'Aku mau sup' },
        { en: 'How much is it', id: 'Berapa harganya' },
        { en: 'No sugar please', id: 'Tolong jangan pakai gula' },
        { en: 'Where is the restaurant', id: 'Di mana restorannya' },
        { en: 'I want to order chicken', id: 'Aku mau pesan ayam' },
        { en: 'The food is too hot', id: 'Makanannya terlalu panas' },
        { en: 'Can I have a spoon', id: 'Boleh aku minta sendok' },
        { en: 'We want some dessert', id: 'Kami mau makanan penutup' },
        { en: 'Where is my fork', id: 'Di mana garpuku' },
        { en: 'I want a cup of tea', id: 'Aku mau secangkir teh' },
        { en: 'This restaurant is clean', id: 'Restoran ini bersih' },
        { en: 'Can we have some salt', id: 'Boleh kami minta garam' },
        { en: 'The chicken is delicious', id: 'Ayamnya enak' },
    ]},

    { id: 't7', emoji: '💼', title: 'Kata kerja sekarang untuk profesi', parts: 8, extra: [3, 6], tips: [
        "'He/She is a...' dipakai untuk menyebut profesi seseorang. Tambahkan 'a/an' sebelum profesi.",
        "Kata kerja orang ketiga (he/she/it) di present tense ditambah '-s': 'She teaches'.",
        "'Work at' = bekerja di tempat spesifik, 'Work as' = bekerja sebagai profesi."
    ], phrases: [
        { en: 'She is a doctor', id: 'Dia seorang dokter' },
        { en: 'He works in a bank', id: 'Dia bekerja di bank' },
        { en: 'I am a teacher', id: 'Aku seorang guru' },
        { en: 'They are engineers', id: 'Mereka insinyur' },
        { en: 'She teaches English', id: 'Dia mengajar bahasa Inggris' },
        { en: 'He drives a taxi', id: 'Dia menyetir taksi' },
        { en: 'What is your job', id: 'Apa pekerjaanmu' },
        { en: 'He is a police officer', id: 'Dia seorang polisi' },
        { en: 'I help people', id: 'Aku membantu orang' },
        { en: 'We work together', id: 'Kami bekerja bersama' },
        { en: 'My sister is a nurse', id: 'Kakakku seorang perawat' },
        { en: 'He writes interesting books', id: 'Dia menulis buku-buku menarik' },
        { en: 'They build big bridges', id: 'Mereka membangun jembatan besar' },
        { en: 'She works at a hospital', id: 'Dia bekerja di rumah sakit' },
        { en: 'A chef cooks delicious food', id: 'Seorang koki memasak makanan enak' },
        { en: 'He is a taxi driver', id: 'Dia seorang sopir taksi' },
        { en: 'The manager is in the office', id: 'Manajernya ada di kantor' },
        { en: 'She is a talented artist', id: 'Dia seniman berbakat' },
        { en: 'We want to be engineers', id: 'Kami ingin jadi insinyur' },
        { en: 'A doctor helps sick people', id: 'Seorang dokter membantu orang sakit' },
    ]},

    { id: 't8', emoji: '🏃', title: 'Menggunakan kata kerja sekarang', parts: 8, extra: [3, 6], tips: [
        "Present Simple untuk kebiasaan: 'I eat breakfast every morning' = tiap hari.",
        "Tambah 'do not' / 'does not' untuk kalimat negatif. 'I do not understand'.",
        "'Do you...?' di awal kalimat untuk membuat pertanyaan yes/no."
    ], phrases: [
        { en: 'I eat breakfast every morning', id: 'Aku sarapan setiap pagi' },
        { en: 'She reads books', id: 'Dia membaca buku' },
        { en: 'They play football', id: 'Mereka bermain sepak bola' },
        { en: 'He watches television', id: 'Dia menonton televisi' },
        { en: 'We go to school', id: 'Kami pergi ke sekolah' },
        { en: 'She walks to work', id: 'Dia berjalan kaki ke kantor' },
        { en: 'He studies at night', id: 'Dia belajar di malam hari' },
        { en: 'I do not understand', id: 'Aku tidak mengerti' },
        { en: 'Do you speak English', id: 'Kamu bisa bicara bahasa Inggris' },
        { en: 'She likes music', id: 'Dia suka musik' },
        { en: 'I listen to the radio', id: 'Aku mendengarkan radio' },
        { en: 'We speak Indonesian at home', id: 'Kami bicara bahasa Indonesia di rumah' },
        { en: 'They run in the park', id: 'Mereka berlari di taman' },
        { en: 'He writes a letter', id: 'Dia menulis surat' },
        { en: 'She drives a car', id: 'Dia mengendarai mobil' },
        { en: 'I swim in the pool', id: 'Aku berenang di kolam' },
        { en: 'They learn English together', id: 'Mereka belajar bahasa Inggris bersama' },
        { en: 'She sings a beautiful song', id: 'Dia menyanyikan lagu yang indah' },
        { en: 'He drinks water after running', id: 'Dia minum air putih setelah berlari' },
        { en: 'We sleep early at night', id: 'Kami tidur lebih awal' },
    ]},

    { id: 't9', emoji: '🌦️', title: 'Membicarakan tentang cuaca', parts: 8, extra: [3, 6], tips: [
        "'It is...' dipakai untuk cuaca. 'It is raining' = sedang hujan. Subjek 'It' wajib di Inggris.",
        "'Going to' menunjukkan prediksi/rencana: 'It is going to rain' = akan hujan.",
        "Kata sifat cuaca: sunny, cloudy, windy, rainy — tambahkan '-y' pada kata benda."
    ], phrases: [
        { en: 'It is sunny today', id: 'Hari ini cerah' },
        { en: 'It is raining', id: 'Sedang hujan' },
        { en: 'The weather is cold', id: 'Cuacanya dingin' },
        { en: 'It is very hot', id: 'Sangat panas' },
        { en: 'Is it going to rain', id: 'Mau hujan tidak' },
        { en: 'The sky is cloudy', id: 'Langitnya berawan' },
        { en: 'It is windy', id: 'Berangin' },
        { en: 'Take an umbrella', id: 'Bawa payung' },
        { en: 'What is the weather like', id: 'Cuacanya bagaimana' },
        { en: 'Tomorrow will be hot', id: 'Besok akan panas' },
        { en: 'I see a beautiful rainbow', id: 'Aku melihat pelangi yang indah' },
        { en: 'The storm is coming', id: 'Badai akan datang' },
        { en: 'It is warm outside', id: 'Di luar hangat' },
        { en: 'The snow is white', id: 'Saljunya putih' },
        { en: 'Why is the sky dark', id: 'Kenapa langitnya gelap' },
        { en: 'I like warm weather', id: 'Aku suka cuaca hangat' },
        { en: 'The wind is very strong', id: 'Anginnya sangat kencang' },
        { en: 'We walk in the rain', id: 'Kami berjalan di tengah hujan' },
        { en: 'It is cloudy today', id: 'Hari ini berawan' },
        { en: 'Take your jacket', id: 'Bawa jaketmu' },
    ]},

    { id: 't10', emoji: '🐶', title: 'Membicarakan tentang hewan peliharaan', parts: 8, extra: [3, 6], tips: [
        "'Do you have...?' untuk bertanya kepemilikan. Jawab: 'Yes, I have...' atau 'No, I do not'.",
        "'Can' = bisa/mampu. 'The bird can fly' = Burung itu bisa terbang.",
        "Plural (jamak) di Inggris pakai '-s': 'cats', 'dogs'. Di Indonesia tidak berubah atau diulang."
    ], phrases: [
        { en: 'I have a cat', id: 'Aku punya kucing' },
        { en: 'My dog is friendly', id: 'Anjingku ramah' },
        { en: 'Do you have a pet', id: 'Kamu punya hewan peliharaan' },
        { en: 'The cat is sleeping', id: 'Kucingnya sedang tidur' },
        { en: 'I love animals', id: 'Aku suka hewan' },
        { en: 'My rabbit is white', id: 'Kelinciku putih' },
        { en: 'The bird can fly', id: 'Burung itu bisa terbang' },
        { en: 'My dog likes to play', id: 'Anjingku suka bermain' },
        { en: 'I walk my dog every day', id: 'Aku jalan-jalan sama anjingku setiap hari' },
        { en: 'Cats are cute', id: 'Kucing itu lucu' },
        { en: 'The horse runs fast', id: 'Kuda itu berlari cepat' },
        { en: 'I feed my fish', id: 'Aku memberi makan ikanku' },
        { en: 'The puppy is playing', id: 'Anak anjing itu sedang bermain' },
        { en: 'Where does the monkey live', id: 'Monyet itu tinggal di mana' },
        { en: 'She has a beautiful bird', id: 'Dia punya burung yang indah' },
        { en: 'The mouse eats cheese', id: 'Tikus itu makan keju' },
        { en: 'My horse is black', id: 'Kudaku berwarna hitam' },
        { en: 'I have a little hamster', id: 'Aku punya hamster kecil' },
        { en: 'The dog barks loudly', id: 'Anjing itu menggonggong keras' },
        { en: 'They love their puppies', id: 'Mereka menyayangi anak anjing mereka' },
    ]},
];
const TOPIC_BY_ID = Object.fromEntries(TOPICS.map(t => [t.id, t]));


// Bank kata level-kata (untuk soal "pilih arti" 3 opsi + match pairs) — lebih mudah
const WORDS_BY_TOPIC = {
    t1: [['water','air'],['coffee','kopi'],['tea','teh'],['juice','jus'],['milk','susu'],['sugar','gula'],['drink','minum'],['glass','gelas'],['cup','cangkir'],['cold','dingin'],['ice','es'],['lemonade','limun'],['bottle','botol'],['soda','soda'],['orange','jeruk'],['honey','madu'],['warm','hangat'],['hot','panas'],['sweet','manis'],['teapot','teko']],
    t2: [['from','dari'],['country','negara'],['city','kota'],['live','tinggal'],['born','lahir'],['home','rumah'],['near','dekat'],['far','jauh'],['place','tempat'],['world','dunia'],['village','desa'],['england','inggris'],['capital','ibu kota'],['province','provinsi'],['town','kota kecil'],['visit','mengunjungi'],['travel','bepergian'],['border','perbatasan'],['flag','bendera'],['island','pulau']],
    t3: [['mother','ibu'],['father','ayah'],['sister','saudari'],['brother','saudara'],['family','keluarga'],['name','nama'],['friend','teman'],['child','anak'],['old','tua'],['young','muda'],['parents','orang tua'],['grandfather','kakek'],['grandmother','nenek'],['uncle','paman'],['aunt','bibi'],['cousin','sepupu'],['son','anak laki-laki'],['daughter','anak perempuan'],['husband','suami'],['wife','istri']],
    t4: [['airport','bandara'],['passport','paspor'],['ticket','tiket'],['flight','penerbangan'],['plane','pesawat'],['bag','tas'],['gate','gerbang'],['seat','kursi'],['luggage','koper'],['trip','perjalanan'],['terminal','terminal'],['heavy','berat'],['window','jendela'],['boarding','naik pesawat'],['arrival','kedatangan'],['exit','jalan keluar'],['pilot','pilot'],['customs','bea cukai'],['delay','penundaan'],['security','keamanan']],
    t5: [['big','besar'],['small','kecil'],['hot','panas'],['cold','dingin'],['beautiful','indah'],['new','baru'],['clean','bersih'],['expensive','mahal'],['sweet','manis'],['tall','tinggi'],['fast','cepat'],['dirty','kotor'],['busy','ramai'],['blue','biru'],['cheap','murah'],['quiet','tenang'],['easy','mudah'],['difficult','sulit'],['slow','lambat'],['soft','lembut']],
    t6: [['food','makanan'],['rice','nasi'],['soup','sup'],['menu','menu'],['spicy','pedas'],['bill','tagihan'],['eat','makan'],['order','pesan'],['delicious','enak'],['fork','garpu'],['chicken','ayam'],['spoon','sendok'],['dessert','makanan penutup'],['restaurant','restoran'],['salt','garam'],['napkin','serbet'],['knife','pisau'],['plate','piring'],['bowl','mangkuk'],['waiter','pelayan']],
    t7: [['doctor','dokter'],['teacher','guru'],['engineer','insinyur'],['police','polisi'],['driver','sopir'],['job','pekerjaan'],['work','bekerja'],['bank','bank'],['cook','memasak'],['help','membantu'],['nurse','perawat'],['hospital','rumah sakit'],['chef','koki'],['office','kantor'],['manager','manajer'],['artist','seniman'],['singer','penyanyi'],['soldier','tentara'],['farmer','petani'],['writer','penulis']],
    t8: [['eat','makan'],['drink','minum'],['read','membaca'],['write','menulis'],['play','bermain'],['walk','berjalan'],['run','berlari'],['study','belajar'],['sleep','tidur'],['watch','menonton'],['listen','mendengar'],['speak','berbicara'],['sing','bernyanyi'],['swim','berenang'],['learn','belajar'],['dance','menari'],['jump','melompat'],['drive','mengendarai'],['buy','membeli'],['sell','menjual']],
    t9: [['sunny','cerah'],['rain','hujan'],['cold','dingin'],['hot','panas'],['cloudy','berawan'],['windy','berangin'],['snow','salju'],['sky','langit'],['umbrella','payung'],['weather','cuaca'],['rainbow','pelangi'],['storm','badai'],['warm','hangat'],['dark','gelap'],['dry','kering'],['jacket','jaket'],['wind','angin'],['cloud','awan'],['season','musim'],['degree','derajat']],
    t10:[['cat','kucing'],['dog','anjing'],['bird','burung'],['fish','ikan'],['rabbit','kelinci'],['pet','peliharaan'],['animal','binatang'],['cute','lucu'],['friendly','ramah'],['tail','ekor'],['horse','kuda'],['feed','memberi makan'],['puppy','anak anjing'],['monkey','monyet'],['mouse','tikus'],['hamster','hamster'],['bark','menggonggong'],['cheese','keju'],['wild','liar'],['cage','kandang']],
};
for (const t of TOPICS) t.words = (WORDS_BY_TOPIC[t.id] || []).map(([en, id]) => ({ en, id }));

const EXTRA_WORDS = ['you', 'they', 'big', 'red', 'now', 'here', 'good', 'day', 'very', 'and', 'the', 'with', 'is', 'are', 'my'];
const HEARTS_MAX = 5;
const EX_PER_LESSON = 10;

const sessions = new Map();


// Shuffle utility — returns a new shuffled copy
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
    const correctIndex = opts.findIndex(p => p.en === correct.en);
    const prompt = enToId 
        ? `Apa arti kalimat ini?\n${tileText(correct.en)}` 
        : `Terjemahkan ke Inggris:\n${tileText(correct.id)}`;
    const options = enToId ? opts.map(p => p.id) : opts.map(p => p.en);
    return { type: 'mc', prompt, options, correctIndex, correctEn: correct.en, correctId: correct.id };
}
// MC kata tunggal (3 opsi) — mudah
function makeWord(words) {
    const correct = words[Math.floor(Math.random() * words.length)];
    const enToId = Math.random() < 0.5;
    const distract = shuffle(words.filter(w => w.en !== correct.en)).slice(0, 2);
    const opts = shuffle([correct, ...distract]);
    const correctIndex = opts.findIndex(w => w.en === correct.en);
    const prompt = enToId 
        ? `Pilih arti dari kata: \`${correct.en}\`` 
        : `Bahasa Inggris dari kata: \`${correct.id}\``;
    const options = enToId ? opts.map(w => w.id) : opts.map(w => w.en);
    return { type: 'mc', prompt, options, correctIndex, correctEn: correct.en, correctId: correct.id, _word: correct.en };
}
// MC kata tunggal from a specific word (for weak words)
function makeWordFromTarget(targetWord, allWords) {
    const enToId = Math.random() < 0.5;
    const distract = shuffle(allWords.filter(w => w.en !== targetWord.en)).slice(0, 2);
    const opts = shuffle([targetWord, ...distract]);
    const correctIndex = opts.findIndex(w => w.en === targetWord.en);
    const prompt = enToId 
        ? `Pilih arti dari kata: \`${targetWord.en}\`` 
        : `Bahasa Inggris dari kata: \`${targetWord.id}\``;
    const options = enToId ? opts.map(w => w.id) : opts.map(w => w.en);
    return { type: 'mc', prompt, options, correctIndex, correctEn: targetWord.en, correctId: targetWord.id, _word: targetWord.en };
}

// Susun kalimat (tap tiles)
function makeArrange(pool) {
    const phrase = pool[Math.floor(Math.random() * pool.length)];
    const correctWords = phrase.en.split(' ');
    const room = Math.max(1, Math.min(3, 9 - correctWords.length));
    const extras = shuffle(EXTRA_WORDS.filter(w => !correctWords.includes(w))).slice(0, room);
    const tiles = shuffle([...correctWords, ...extras]).map(w => ({ word: w, used: false }));
    return { type: 'arrange', promptId: phrase.id, correctWords, tiles, built: [], correctEn: phrase.en, correctId: phrase.id };
}
// Pasangkan (match pairs) — 4 pasang
function makeMatch(words) {
    const chosen = shuffle(words).slice(0, 4);
    const pairs = chosen.map(w => ({ en: w.en, id: w.id }));
    const left = shuffle(pairs.map((_, i) => i));
    const right = shuffle(pairs.map((_, i) => i));
    return { type: 'match', pairs, left, right, matched: [], sel: null };
}
// 🎧 Listening — dengar audio Inggris, pilih arti Indonesia (3 opsi)
function makeListen(words) {
    const correct = words[Math.floor(Math.random() * words.length)];
    const distract = shuffle(words.filter(w => w.en !== correct.en)).slice(0, 2);
    const opts = shuffle([correct, ...distract]);
    return { type: 'listen', audioText: correct.en, options: opts.map(w => w.id), correctIndex: opts.findIndex(w => w.en === correct.en), _word: correct.en };
}
// ✍️ Ketik — tampilkan kata Indonesia, user ketik Inggrisnya di chat
function makeType(words) {
    const correct = words[Math.floor(Math.random() * words.length)];
    return { type: 'type', promptId: correct.id, answer: correct.en.toLowerCase(), _word: correct.en };
}


// Kesulitan bertahap
function pickType(part, i) {
    if (i === 0) return 'word';
    if (i === 1) return Math.random() < 0.5 ? 'word' : 'listen';
    const prog = i / (EX_PER_LESSON - 1);
    const partF = (part - 1) / 7;
    const hard = prog * 0.6 + partF * 0.4;
    const weights = [
        ['word', (1 - hard) * 40 + 5],
        ['listen', 18 - hard * 6],
        ['match', 16 - hard * 6],
        ['type', hard * 20 + 4],
        ['mc', hard * 28 + 4],
        ['arrange', hard * 44],
    ];
    const total = weights.reduce((s, [, w]) => s + Math.max(0, w), 0);
    let r = Math.random() * total;
    for (const [t, w] of weights) { if ((r -= Math.max(0, w)) <= 0) return t; }
    return 'word';
}

function buildLesson(topic, part, guildId, userId) {
    const ex = [];
    // Weak words bias: 30% of word-level exercises use weak words if available
    let weakWords = [];
    if (guildId && userId) {
        const weakData = getWeakWords(guildId, userId);
        const topicWordEns = new Set(topic.words.map(w => w.en));
        weakWords = weakData
            .filter(wd => topicWordEns.has(wd.word))
            .map(wd => topic.words.find(w => w.en === wd.word))
            .filter(Boolean);
    }

    for (let i = 0; i < EX_PER_LESSON; i++) {
        const type = pickType(part, i);
        const useWeak = weakWords.length > 0 && (type === 'word' || type === 'listen' || type === 'type') && Math.random() < 0.3;
        if (useWeak) {
            const weakWord = weakWords[Math.floor(Math.random() * weakWords.length)];
            if (type === 'word') ex.push(makeWordFromTarget(weakWord, topic.words));
            else if (type === 'listen') {
                const distract = shuffle(topic.words.filter(w => w.en !== weakWord.en)).slice(0, 2);
                const opts = shuffle([weakWord, ...distract]);
                ex.push({ type: 'listen', audioText: weakWord.en, options: opts.map(w => w.id), correctIndex: opts.findIndex(w => w.en === weakWord.en), _word: weakWord.en });
            } else {
                ex.push({ type: 'type', promptId: weakWord.id, answer: weakWord.en.toLowerCase(), _word: weakWord.en });
            }
        } else if (type === 'word') ex.push(makeWord(topic.words));
        else if (type === 'listen') ex.push(makeListen(topic.words));
        else if (type === 'match') ex.push(makeMatch(topic.words));
        else if (type === 'type') ex.push(makeType(topic.words));
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
    const topic = session.topicId ? TOPIC_BY_ID[session.topicId] : null;
    const footerText = `${head}${topic ? `  •  Part ${session.part || '?'}` : ''}`;
    const noteLine = note ? `${note}\n\n` : '';

    if (ex.type === 'mc') {
        const embed = new EmbedBuilder().setColor('#1CB0F6')
            .setAuthor({ name: '🇬🇧 Bahasa Inggris' })
            .setTitle('Pilih jawaban yang benar')
            .setDescription(`${bar}\n\n${noteLine}${ex.prompt}\n\n` + ex.options.map((o, i) => `${LBL[i]}  **${o}**`).join('\n'))
            .setFooter({ text: footerText });
        const row = new ActionRowBuilder().addComponents(ex.options.map((_, i) => new ButtonBuilder().setCustomId(`belajar_ans_${i}_${userId}`).setLabel(LBL[i]).setStyle(ButtonStyle.Primary)));
        return { embeds: [embed], components: [row] };
    }

    if (ex.type === 'listen') {
        const embed = new EmbedBuilder().setColor('#FF9600')
            .setAuthor({ name: '🇬🇧 Bahasa Inggris' })
            .setTitle('🎧 Dengarkan dan pilih artinya')
            .setDescription(`${bar}\n\n${noteLine}🔊 Dengarkan audio lalu pilih **arti** yang benar:\n\n` + ex.options.map((o, i) => `${LBL[i]}  **${o}**`).join('\n'))
            .setFooter({ text: footerText });
        const row = new ActionRowBuilder().addComponents(ex.options.map((_, i) => new ButtonBuilder().setCustomId(`belajar_ans_${i}_${userId}`).setLabel(LBL[i]).setStyle(ButtonStyle.Primary)));
        const result = { embeds: [embed], components: [row] };
        result._ttsText = ex.audioText;
        return result;
    }


    if (ex.type === 'type') {
        const embed = new EmbedBuilder().setColor('#CE82FF')
            .setAuthor({ name: '🇬🇧 Bahasa Inggris' })
            .setTitle('✍️ Ketik jawabanmu')
            .setDescription(`${bar}\n\n${noteLine}Tulis dalam bahasa Inggris:\n\n**"${ex.promptId}"**\n\n-# Klik tombol di bawah untuk menjawab`)
            .setFooter({ text: footerText });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`belajar_typebtn_${userId}`).setLabel('✍️ Jawab').setStyle(ButtonStyle.Success)
        );
        return { embeds: [embed], components: [row] };
    }

    if (ex.type === 'arrange') {
        const builtWords = (ex.built || []).map(i => ex.tiles[i].word);
        const builtLine = builtWords.length ? builtWords.map(w => `\`${w}\``).join(' ') : '`___`';
        const embed = new EmbedBuilder().setColor('#CE82FF')
            .setAuthor({ name: '🇬🇧 Bahasa Inggris' })
            .setTitle('🧩 Susun kalimatnya')
            .setDescription(`${bar}\n\n${noteLine}Terjemahkan ke Inggris:\n**${ex.promptId}**\n\n📝 ${builtLine}`)
            .setFooter({ text: footerText });
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
        .setFooter({ text: footerText });
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

    // Hitung progress keseluruhan BAB 1
    const totalParts = TOPICS.reduce((s, t) => s + t.parts, 0);
    const donePartsTotal = TOPICS.reduce((s, t) => s + topicDoneCount(guildId, userId, t.id), 0);
    const doneTopics = TOPICS.filter((t, idx) => topicDoneCount(guildId, userId, t.id) >= t.parts).length;
    const pct = totalParts ? Math.round((donePartsTotal / totalParts) * 100) : 0;
    const filled = Math.round((pct / 100) * 12);
    const overallBar = '▰'.repeat(filled) + '▱'.repeat(12 - filled);

    const lines = TOPICS.map((t, idx) => {
        const done = topicDoneCount(guildId, userId, t.id);
        const unlocked = topicUnlocked(guildId, userId, idx);
        const status = done >= t.parts ? '✅' : unlocked ? '▶️' : '🔒';
        const num = `\`${String(idx + 1).padStart(2, ' ')}\``;
        return `${num} ${status} ${t.emoji} **${t.title}** *(${done}/${t.parts})*`;
    });

    const embed = new EmbedBuilder()
        .setColor('#1CB0F6')
        .setTitle('📘 BAB 1 — Bahasa Inggris Dasar')
        .setDescription(
            `📊 Level **${st.level}**  •  ⭐ **${st.xp}** XP  •  🔥 Streak **${st.streak}** hari\n` +
            `📈 Progress BAB 1: \`${overallBar}\` **${pct}%**  *(${doneTopics}/${TOPICS.length} topik)*\n\n` +
            `${lines.join('\n')}\n\n🔜 *BAB 2 — Coming Soon*`
        )
        .setFooter({ text: 'Klik nomor topik untuk mulai • Belajar tiap hari untuk jaga streak! 🔥' });

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
    const donePartCount = topicDoneCount(guildId, userId, topic.id);
    const pct = topic.parts ? Math.round((donePartCount / topic.parts) * 100) : 0;
    const filled = Math.round((pct / 100) * 12);
    const bar = '▰'.repeat(filled) + '▱'.repeat(12 - filled);

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
        .setDescription(
            `📈 Progress: \`${bar}\` **${pct}%**  *(${donePartCount}/${topic.parts} part)*\n\n` +
            `${lines.join('\n')}\n\n-# Tiap part = 10 soal. Part 🌟 kasih reward 2x lipat!`
        )
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
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    ensureRow(guildId, userId); // ensure once at session start
    return interaction.reply(buildChapterPanel(guildId, userId));
}

function buildFinishPayload(session, ownerId, guildId, success) {
    sessions.delete(`${guildId}_${ownerId}`);

    // ---- Speed Round finish ----
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

    // Track weak words: when wrong on word-level exercises (mc with _word, listen, type)
    if (!correct) {
        const ex = session.exercises[session.current];
        if (ex && ex._word) {
            try { incrementWeakWord(guildId, ownerId, ex._word); } catch (_) {}
        }
    }

    // Speed Round: lanjut instan
    if (session.speed) {
        session.current++;
        const payload = session.current >= session.exercises.length
            ? buildFinishPayload(session, ownerId, guildId, true)
            : renderExercise(session, ownerId);
        return sendExercise(interaction, session, payload, 'update');
    }

    const fbEmbed = correct
        ? new EmbedBuilder().setColor('#58CC02').setTitle('✅ Benar!').setDescription('Mantap! Lanjut...')
        : new EmbedBuilder().setColor('#FF4B4B').setTitle('❌ Kurang tepat').setDescription(`Jawaban: ${tileText(answerText)}`);
    await interaction.update({ embeds: [fbEmbed], components: [], files: [] });

    const isTest = process.env.NODE_ENV === 'test';
    const delay = isTest ? 0 : (correct ? 900 : 1800);

    const advanceFn = async () => {
        session.current++;
        const key = `${guildId}_${ownerId}`;
        let payload;
        if (session.hearts <= 0) payload = buildFinishPayload(session, ownerId, guildId, false);
        else if (session.current >= session.exercises.length) payload = buildFinishPayload(session, ownerId, guildId, true);
        else payload = renderExercise(session, ownerId);
        await sendExercise(interaction, session, payload, 'editReply');
        if (sessions.has(key)) {
            const nextEx = session.exercises[session.current];
            if (nextEx && nextEx.type === 'type') startTypeCollector(interaction, session, ownerId, guildId);
        }
    };

    if (isTest) await advanceFn();
    else setTimeout(advanceFn, delay);
}


// Send exercise — attach TTS audio for 'listen' type
async function sendExercise(interaction, session, payload, method) {
    const files = [];
    if (payload && payload._ttsText) {
        const buf = await getTTS(payload._ttsText);
        if (buf) files.push(new AttachmentBuilder(buf, { name: 'listen.mp3' }));
        delete payload._ttsText;
    }
    if (files.length) payload.files = files;
    try {
        if (method === 'update') return await interaction.update(payload);
        if (method === 'editReply') return await interaction.editReply(payload);
        return await interaction.reply(payload);
    } catch (e) { /* graceful */ }
}

// Type collector — listen for typed answers
const _typeCollectors = new Map();
function startTypeCollector(interaction, session, ownerId, guildId) {
    const key = `${guildId}_${ownerId}`;
    if (_typeCollectors.has(key)) { try { _typeCollectors.get(key).stop(); } catch(_){} }
    const ex = session.exercises[session.current];
    if (!ex || ex.type !== 'type') return;
    const channel = interaction.channel;
    if (!channel) return;

    const filter = m => m.author.id === ownerId && !m.author.bot;
    const collector = channel.createMessageCollector({ filter, time: 60000, max: 5 });
    collector.on('collect', async (msg) => {
        const s = sessions.get(key);
        if (!s) { collector.stop(); return; }
        const curEx = s.exercises[s.current];
        if (!curEx || curEx.type !== 'type') { collector.stop(); return; }
        const typed = msg.content.trim().toLowerCase();
        const correct = typed === curEx.answer;
        msg.delete().catch(() => {});
        collector.stop();
        return resolveAnswer(interaction, s, ownerId, guildId, correct, curEx.answer);
    });
    collector.on('end', () => { _typeCollectors.delete(key); });
    _typeCollectors.set(key, collector);
}


async function handleBelajarButton(interaction) {
    const customId = interaction.customId;
    const parts = customId.split('_');
    const ownerId = parts[parts.length - 1];
    const guildId = interaction.guild.id;

    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ Ini bukan sesi belajar kamu! Ketik `/belajar` sendiri ya.', ephemeral: true });
    }

    // Ensure row once per interaction session
    ensureRow(guildId, ownerId);

    if (customId.startsWith('belajar_home_')) {
        return interaction.update(buildChapterPanel(guildId, ownerId));
    }
    if (customId.startsWith('belajar_lb_')) {
        return interaction.update(buildLeaderboardPanel(guildId, ownerId, interaction.guild));
    }
    if (customId.startsWith('belajar_review_')) {
        const completed = TOPICS.filter(t => topicDoneCount(guildId, ownerId, t.id) > 0);
        if (!completed.length) {
            return interaction.reply({ content: '🔄 Selesaikan minimal 1 part dulu sebelum bisa Review!', ephemeral: true });
        }
        const topic = completed[Math.floor(Math.random() * completed.length)];
        const session = { topicId: topic.id, part: 0, review: true, extra: false, exercises: buildLesson(topic, 4, guildId, ownerId), current: 0, hearts: HEARTS_MAX, correct: 0 };
        sessions.set(`${guildId}_${ownerId}`, session);
        return interaction.update(renderExercise(session, ownerId));
    }
    if (customId.startsWith('belajar_speed_')) {
        const pool = [];
        TOPICS.forEach((t, idx) => { if (topicUnlocked(guildId, ownerId, idx)) pool.push(...t.words); });
        const words = pool.length ? pool : TOPICS[0].words;
        const exercises = [];
        const shuffledWords = shuffle(words);
        for (let i = 0; i < EX_PER_LESSON; i++) exercises.push(makeWord(shuffledWords.length >= 3 ? shuffledWords : words));
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
        const session = { topicId, part, extra: topic.extra.includes(part), exercises: buildLesson(topic, part, guildId, ownerId), current: 0, hearts: HEARTS_MAX, correct: 0 };
        sessions.set(`${guildId}_${ownerId}`, session);

        // Show grammar tip before starting (rotate based on part number)
        const tips = topic.tips || [];
        if (tips.length > 0) {
            const tipIdx = (part - 1) % tips.length;
            const tipEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('💡 Tips!')
                .setDescription(tips[tipIdx])
                .setFooter({ text: `${topic.emoji} ${topic.title} • Part ${part}` });
            await interaction.update({ embeds: [tipEmbed], components: [] });

            const isTest = process.env.NODE_ENV === 'test';
            const tipDelay = isTest ? 0 : 3000;

            const startLesson = async () => {
                const payload = renderExercise(session, ownerId);
                await sendExercise(interaction, session, payload, 'editReply');
                if (session.exercises[0] && session.exercises[0].type === 'type') startTypeCollector(interaction, session, ownerId, guildId);
            };

            if (isTest) await startLesson();
            else setTimeout(startLesson, tipDelay);
            return;
        }

        // No tips — start directly
        const payload = renderExercise(session, ownerId);
        await sendExercise(interaction, session, payload, 'update');
        if (session.exercises[0] && session.exercises[0].type === 'type') startTypeCollector(interaction, session, ownerId, guildId);
        return;
    }

    const session = sessions.get(`${guildId}_${ownerId}`);
    if (!session) return interaction.update({ content: '⚠️ Sesi sudah berakhir. Ketik `/belajar` untuk mulai lagi.', embeds: [], components: [] });
    const ex = session.exercises[session.current];


    if (customId.startsWith('belajar_ans_')) {
        const chosen = parseInt(parts[2]);
        const correct = chosen === ex.correctIndex;
        return resolveAnswer(interaction, session, ownerId, guildId, correct, ex.options[ex.correctIndex]);
    }
    if (customId.startsWith('belajar_typebtn_')) {
        if (ex.type !== 'type') return interaction.deferUpdate();
        const modal = new ModalBuilder().setCustomId(`belajar_typemodal_${ownerId}`).setTitle('✍️ Ketik Jawaban');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('answer').setLabel(`Bahasa Inggris dari "${ex.promptId}"`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ketik jawaban di sini...')
        ));
        return interaction.showModal(modal);
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
                return resolveAnswer(interaction, session, ownerId, guildId, true, 'Semua pasangan cocok!');
            }
            return interaction.update(renderExercise(session, ownerId, '✅ Cocok!'));
        }
        // Salah → kurangi nyawa
        session.hearts--;
        if (session.hearts <= 0) {
            return interaction.update(buildFinishPayload(session, ownerId, guildId, false));
        }
        return interaction.update(renderExercise(session, ownerId, '❌ Belum cocok! -1 ❤️'));
    }
}

function isBelajarButton(customId) { return typeof customId === 'string' && customId.startsWith('belajar_'); }
function isBelajarModal(customId) { return typeof customId === 'string' && customId.startsWith('belajar_typemodal_'); }

async function handleBelajarModal(interaction) {
    const parts = interaction.customId.split('_');
    const ownerId = parts[parts.length - 1];
    const guildId = interaction.guild.id;
    if (interaction.user.id !== ownerId) return interaction.reply({ content: '❌', ephemeral: true });

    const session = sessions.get(`${guildId}_${ownerId}`);
    if (!session) return interaction.reply({ content: '⚠️ Sesi sudah berakhir. Ketik `/belajar` untuk mulai lagi.', ephemeral: true });
    const ex = session.exercises[session.current];
    if (!ex || ex.type !== 'type') return interaction.reply({ content: '⚠️ Soal sudah berganti.', ephemeral: true });

    const typed = (interaction.fields.getTextInputValue('answer') || '').trim().toLowerCase();
    const correct = typed === ex.answer;

    // Modal sudah deferred otomatis setelah submit — langsung pakai editReply
    if (correct) session.correct++;
    else if (!session.speed) session.hearts--;

    // Track weak words
    if (!correct && ex._word) {
        try { incrementWeakWord(guildId, ownerId, ex._word); } catch (_) {}
    }

    const fbEmbed = correct
        ? new EmbedBuilder().setColor('#58CC02').setTitle('✅ Benar!').setDescription('Mantap! Lanjut...')
        : new EmbedBuilder().setColor('#FF4B4B').setTitle('❌ Kurang tepat').setDescription(`Jawaban: \`${ex.answer}\``);

    await interaction.update({ embeds: [fbEmbed], components: [], files: [] });

    const isTest = process.env.NODE_ENV === 'test';
    const delay = isTest ? 0 : (correct ? 900 : 1800);

    const advanceFn = async () => {
        session.current++;
        let payload;
        if (session.hearts <= 0) payload = buildFinishPayload(session, ownerId, guildId, false);
        else if (session.current >= session.exercises.length) payload = buildFinishPayload(session, ownerId, guildId, true);
        else payload = renderExercise(session, ownerId);
        await sendExercise(interaction, session, payload, 'editReply');
    };

    if (isTest) await advanceFn();
    else setTimeout(advanceFn, delay);
}

module.exports = { handleBelajarCommand, handleBelajarButton, isBelajarButton, isBelajarModal, handleBelajarModal, TOPICS, getStudyStats, sessions };
