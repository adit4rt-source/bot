// systems/belajar.js — Pusat Belajar (Duolingo-style, BAB → Topik → Part)
//
// /belajar → BAB 1 (aktif) berisi 10 topik. Tiap topik punya beberapa Part
// (lesson) berisi 10 soal. Part tertentu = "extra" (XP & Money 2x lipat).
// Latihan: pilihan ganda + susun kalimat (tap tiles). Sistem nyawa ❤️x5.
// Progress (part selesai + XP) tersimpan permanen. Unlock bertahap.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser, incrementUserStat, getUserStat, getItemCount, removeItem } = require('../database');
const i18n = require('./i18n');
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
const isGlobal = !db.prepare("PRAGMA table_info(users)").all().some(col => col.name === 'guildId');
if (isGlobal) {
    db.exec(`CREATE TABLE IF NOT EXISTS belajar_progress (userId TEXT PRIMARY KEY, maxUnit INTEGER DEFAULT 0, xp INTEGER DEFAULT 0, streak INTEGER DEFAULT 0, lastDay TEXT DEFAULT '')`);
    db.exec(`CREATE TABLE IF NOT EXISTS belajar_done (userId TEXT, partKey TEXT, PRIMARY KEY (userId, partKey))`);
    db.exec(`CREATE TABLE IF NOT EXISTS belajar_weak (userId TEXT, word TEXT, wrongCount INTEGER DEFAULT 1, PRIMARY KEY (userId, word))`);
} else {
    db.exec(`CREATE TABLE IF NOT EXISTS belajar_progress (guildId TEXT, userId TEXT, maxUnit INTEGER DEFAULT 0, xp INTEGER DEFAULT 0, PRIMARY KEY (guildId, userId))`);
    db.exec(`CREATE TABLE IF NOT EXISTS belajar_done (guildId TEXT, userId TEXT, partKey TEXT, PRIMARY KEY (guildId, userId, partKey))`);
    db.exec(`CREATE TABLE IF NOT EXISTS belajar_weak (guildId TEXT, userId TEXT, word TEXT, wrongCount INTEGER DEFAULT 1, PRIMARY KEY (guildId, userId, word))`);
    try { db.exec("ALTER TABLE belajar_progress ADD COLUMN streak INTEGER DEFAULT 0"); } catch (_) {}
    try { db.exec("ALTER TABLE belajar_progress ADD COLUMN lastDay TEXT DEFAULT ''"); } catch (_) {}
}

function jakartaDate(offsetDays = 0) {
    return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

// Track which rows have been ensured this session to avoid repeated INSERTs
const _ensuredRows = new Set();
function ensureRow(guildId, userId) {
    const key = `${guildId}_${userId}`;
    if (process.env.NODE_ENV !== 'test' && _ensuredRows.has(key)) return;
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
    const r = db.prepare('SELECT streak, lastDay FROM belajar_progress WHERE guildId = ? AND userId = ?').get(guildId, userId) || { streak: 0, lastDay: '' };
    if (r.lastDay === today) return { streak: r.streak || 0, shieldUsed: false };
    const yesterday = jakartaDate(-1);
    let newStreak;
    let shieldUsed = false;
    if (r.lastDay === yesterday || r.lastDay === '') {
        newStreak = (r.streak || 0) + 1;
    } else {
        const shieldCount = getItemCount(guildId, userId, 'streak_shield') || 0;
        if (shieldCount > 0) {
            removeItem(guildId, userId, 'streak_shield', 1);
            newStreak = (r.streak || 0) + 1;
            shieldUsed = true;
        } else {
            newStreak = 1;
        }
    }
    db.prepare('UPDATE belajar_progress SET streak = ?, lastDay = ? WHERE guildId = ? AND userId = ?').run(newStreak, today, guildId, userId);
    return { streak: newStreak, shieldUsed };
}


// ==================== WEAK WORDS SYSTEM ====================
function incrementWeakWord(guildId, userId, word) {
    db.prepare(`INSERT OR IGNORE INTO belajar_weak (guildId, userId, word, wrongCount) VALUES (?, ?, ?, 0)`).run(guildId, userId, word);
    db.prepare(`UPDATE belajar_weak SET wrongCount = wrongCount + 1 WHERE guildId = ? AND userId = ? AND word = ?`).run(guildId, userId, word);
}
function getWeakWords(guildId, userId) {
    return db.prepare('SELECT word, wrongCount FROM belajar_weak WHERE guildId = ? AND userId = ? ORDER BY wrongCount DESC LIMIT 20').all(guildId, userId);
}

// ==================== ACHIEVEMENTS ====================
function allTopicsDone(guildId, userId, chapter) {
    const chapterTopics = TOPICS.filter(t => t.chapter === chapter);
    if (chapterTopics.length === 0) return false;
    return chapterTopics.every(t => topicDoneCount(guildId, userId, t.id) >= t.parts);
}
async function checkAchievements(guildOrId, userId, ctx) {
    const achievements = require('./achievements');
    const unlocked = [];
    const guildId = typeof guildOrId === 'string' ? guildOrId : (guildOrId ? guildOrId.id : null);
    const guildObj = typeof guildOrId === 'string' ? { id: guildOrId } : guildOrId;

    const tryGrant = async (id, cond) => {
        if (cond && guildObj) {
            const ok = await achievements.grantAchievement(guildObj, userId, id);
            if (ok) {
                const a = achievements.ACHIEVEMENTS.find(x => x.id === id);
                if (a) unlocked.push(a);
            }
        }
    };
    const totalCorrect = getUserStat(guildId, userId, 'belajar_correct') || 0;
    await tryGrant('belajar_first', true);
    await tryGrant('belajar_perfect', ctx.perfect);
    await tryGrant('belajar_streak7', (ctx.streak || 0) >= 7);
    await tryGrant('belajar_streak30', (ctx.streak || 0) >= 30);
    await tryGrant('belajar_correct100', totalCorrect >= 100);
    await tryGrant('belajar_bab1', allTopicsDone(guildId, userId, 1));
    await tryGrant('belajar_bab2', allTopicsDone(guildId, userId, 2));
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


// ==================== CONTENT: BAB 1 & 2 ====================
// Tiap topik: chapter, parts (jumlah lesson), extra (part bonus 2x), phrases (bank kalimat), tips (grammar tips in Indonesian)
const TOPICS = [
    { id: 't1', chapter: 1, emoji: '🥤', title: 'Menawarkan & menerima minuman', parts: 5, extra: [3], tips: [
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

    { id: 't2', chapter: 1, emoji: '🌍', title: 'Menceritakan dari mana asalmu', parts: 5, extra: [3], tips: [
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
        { en: 'She lives in a small town', id: 'Dia tinggal di kota kecil' },
        { en: 'We visit the capital', id: 'Kami mengunjungi ibu kota' },
        { en: 'I want to travel the world', id: 'Aku ingin bepergian keliling dunia' },
        { en: 'My house is near the border', id: 'Rumahku dekat perbatasan' },
        { en: 'This island is large', id: 'Pulau ini besar' },
        { en: 'Show me your flag', id: 'Tunjukkan bendera kalian padaku' },
    ]},

    { id: 't3', chapter: 1, emoji: '👨‍👩‍👧‍👦', title: 'Memperkenalkan diri dan keluarga', parts: 5, extra: [3], tips: [
        "'My name is...' atau 'I am...' untuk nama. Untuk keluarga, gunakan Possessive (my, his, her).",
        "'Parents' = orang tua (ayah & ibu), 'Grandparents' = kakek & nenek.",
        "Gunakan 'is' untuk satu orang (He is my father) dan 'are' untuk lebih (They are my siblings)."
    ], phrases: [
        { en: 'Hello my name is Alex', id: 'Halo namaku Alex' },
        { en: 'This is my mother', id: 'Ini ibuku' },
        { en: 'He is my father', id: 'Dia ayahku' },
        { en: 'I have one sister', id: 'Aku punya satu saudara perempuan' },
        { en: 'She is my brother', id: 'Dia adalah saudara laki-lakiku' },
        { en: 'How old are you', id: 'Berapa usiamu' },
        { en: 'I am twenty years old', id: 'Aku berusia dua puluh tahun' },
        { en: 'We are a happy family', id: 'Kami adalah keluarga yang bahagia' },
        { en: 'He is my best friend', id: 'Dia adalah teman baikku' },
        { en: 'My parents love me', id: 'Orang tuaku menyayangiku' },
        { en: 'Do you have children', id: 'Apakah kamu punya anak' },
        { en: 'My grandfather is old', id: 'Kakekku sudah tua' },
        { en: 'She is my cousin', id: 'Dia sepupuku' },
        { en: 'I love my grandmother', id: 'Aku sayang nenekku' },
        { en: 'This is my uncle', id: 'Ini pamanku' },
        { en: 'My aunt is nice', id: 'Bibiku baik' },
        { en: 'He has two sons', id: 'Dia punya dua anak laki-laki' },
        { en: 'My daughter is young', id: 'Anak perempuanku masih muda' },
        { en: 'Is he your husband', id: 'Apakah dia suamimu' },
        { en: 'My wife is beautiful', id: 'Istriku cantik' },
    ]},

    { id: 't4', chapter: 1, emoji: '✈️', title: 'Menjelajahi bandara', parts: 8, extra: [3, 6], tips: [
        "Kosakata wajib bandara: 'gate' (gerbang), 'boarding' (naik pesawat), 'flight' (penerbangan).",
        "'Where is...?' sangat berguna di bandara. Contoh: Where is the exit?",
        "Gunakan 'please' untuk meminta tolong secara sopan kepada petugas bandara."
    ], phrases: [
        { en: 'Where is the airport', id: 'Di mana bandaranya' },
        { en: 'Please show your passport', id: 'Tolong tunjukkan paspormu' },
        { en: 'Here is my ticket', id: 'Ini tiket saya' },
        { en: 'Which gate is for our flight', id: 'Gerbang mana untuk penerbangan kita' },
        { en: 'The plane is big', id: 'Pesawatnya besar' },
        { en: 'I have two bags', id: 'Saya punya dua tas' },
        { en: 'Is my luggage heavy', id: 'Apakah koper saya berat' },
        { en: 'We need to board now', id: 'Kita harus naik pesawat sekarang' },
        { en: 'My seat is near the window', id: 'Kursi saya dekat jendela' },
        { en: 'Enjoy your trip', id: 'Nikmati perjalananmu' },
        { en: 'The flight is delayed', id: 'Penerbangannya ditunda' },
        { en: 'Where is the security check', id: 'Di mana pemeriksaan keamanan' },
        { en: 'Terminal one is busy', id: 'Terminal satu ramai' },
        { en: 'I lost my boarding pass', id: 'Boarding pass saya hilang' },
        { en: 'Which way is the exit', id: 'Ke arah mana jalan keluarnya' },
        { en: 'The pilot is ready', id: 'Pilotnya sudah siap' },
        { en: 'Where is customs', id: 'Di mana bea cukai' },
        { en: 'We arrived early', id: 'Kita tiba awal' },
        { en: 'Can I change my seat', id: 'Boleh saya ganti kursi' },
        { en: 'Welcome to our country', id: 'Selamat datang di negara kami' },
    ]},

    { id: 't5', chapter: 1, emoji: '👜', title: 'Deskripsi kata benda dengan kata sifat', parts: 8, extra: [3, 6], tips: [
        "Di Inggris, Kata Sifat ditulis SEBELUM Kata Benda. Contoh: 'a big dog' (anjing besar).",
        "Gunakan 'is' (tunggal) atau 'are' (jamak) untuk menghubungkan subjek dengan kata sifat.",
        "Beberapa kata sifat berlawanan: big-small, hot-cold, clean-dirty, expensive-cheap."
    ], phrases: [
        { en: 'This bag is expensive', id: 'Tas ini mahal' },
        { en: 'I want a small cup', id: 'Aku mau cangkir kecil' },
        { en: 'The water is cold', id: 'Airnya dingin' },
        { en: 'We live in a beautiful city', id: 'Kami tinggal di kota yang indah' },
        { en: 'He has a new car', id: 'Dia punya mobil baru' },
        { en: 'The room is clean', id: 'Kamarnya bersih' },
        { en: 'Is the tea sweet', id: 'Tehnya manis tidak' },
        { en: 'She is a tall girl', id: 'Dia gadis yang tinggi' },
        { en: 'The dog is fast', id: 'Anjing itu cepat' },
        { en: 'My shoes are dirty', id: 'Sepatuku kotor' },
        { en: 'This is an easy question', id: 'Ini pertanyaan yang mudah' },
        { en: 'English is not difficult', id: 'Bahasa Inggris tidak sulit' },
        { en: 'The street is dirty', id: 'Jalannya kotor' },
        { en: 'The restaurant is busy', id: 'Restorannya ramai' },
        { en: 'I like quiet places', id: 'Aku suka tempat yang tenang' },
        { en: 'The laptop is cheap', id: 'Laptopnya murah' },
        { en: 'He is a slow driver', id: 'Dia sopir yang lambat' },
        { en: 'The bed is soft', id: 'Tempat tidurnya empuk' },
        { en: 'They buy hot bread', id: 'Mereka membeli roti hangat' },
        { en: 'I have a blue shirt', id: 'Aku punya kemeja biru' },
    ]},

    { id: 't6', chapter: 1, emoji: '🍜', title: 'Memesan makanan dan minuman', parts: 8, extra: [3, 6], tips: [
        "'Can I order...?' atau 'I would like...' digunakan untuk memesan makanan dengan sopan.",
        "Minta tagihan pembayaran dengan ungkapan 'The bill please' di akhir makan.",
        "Untuk makanan pedas gunakan 'spicy', dan jika tidak mau gula gunakan 'no sugar please'."
    ], phrases: [
        { en: 'The bill please', id: 'Tolong minta tagihannya' },
        { en: 'No sugar please', id: 'Tolong jangan pakai gula' },
        { en: 'I want to order food', id: 'Aku mau pesan makanan' },
        { en: 'This soup is delicious', id: 'Sup ini enak' },
        { en: 'Do you want rice or bread', id: 'Kamu mau nasi atau roti' },
        { en: 'I like spicy chicken', id: 'Aku suka ayam pedas' },
        { en: 'Can I have a spoon', id: 'Boleh aku minta sendok' },
        { en: 'We need a fork and knife', id: 'Kami butuh garpu dan pisau' },
        { en: 'Where is the menu', id: 'Di mana menunya' },
        { en: 'I prefer this restaurant', id: 'Aku lebih suka restoran ini' },
        { en: 'A glass of cold juice please', id: 'Tolong segelas jus dingin' },
        { en: 'The waiter is friendly', id: 'Pelayannya ramah' },
        { en: 'Is there salt in the soup', id: 'Apakah ada garam di supnya' },
        { en: 'We need more napkins', id: 'Kita butuh lebih banyak serbet' },
        { en: 'I want a plate of rice', id: 'Aku mau sepiring nasi' },
        { en: 'He orders hot tea', id: 'Dia memesan teh panas' },
        { en: 'She wants a sweet dessert', id: 'Dia ingin makanan penutup yang manis' },
        { en: 'Here is your bowl of soup', id: 'Ini mangkuk supmu' },
        { en: 'We love eating here', id: 'Kami suka makan di sini' },
        { en: 'Is this food fresh', id: 'Apakah makanan ini segar' },
    ]},

    { id: 't7', chapter: 1, emoji: '👮', title: 'Kata kerja sekarang untuk profesi', parts: 8, extra: [3, 6], tips: [
        "Present Tense: tambahkan '-s' atau '-es' di kata kerja jika subjeknya He, She, atau It.",
        "Contoh: He works (dia bekerja), She teaches (dia mengajar). Subjek I/You/We/They tidak ditambah '-s'.",
        "Kosakata profesi: doctor (dokter), teacher (guru), writer (penulis), driver (sopir)."
    ], phrases: [
        { en: 'The doctor works in a hospital', id: 'Dokter itu bekerja di rumah sakit' },
        { en: 'My mother is a teacher', id: 'Ibuku adalah seorang guru' },
        { en: 'She teaches English', id: 'Dia mengajar bahasa Inggris' },
        { en: 'The police officer helps people', id: 'Polisi itu membantu orang-orang' },
        { en: 'He is a taxi driver', id: 'Dia adalah sopir taksi' },
        { en: 'Where does the manager work', id: 'Di mana manajer itu bekerja' },
        { en: 'The engineer builds bridges', id: 'Insinyur itu membangun jembatan' },
        { en: 'My brother works in a bank', id: 'Saudara laki-lakiku bekerja di bank' },
        { en: 'She is a talented singer', id: 'Dia adalah penyanyi yang berbakat' },
        { en: 'The chef cooks delicious food', id: 'Koki itu memasak makanan yang enak' },
        { en: 'I want to be an artist', id: 'Aku ingin menjadi seorang seniman' },
        { en: 'The nurse works today', id: 'Perawat itu bekerja hari ini' },
        { en: 'He writes interesting books', id: 'Dia menulis buku-buku yang menarik' },
        { en: 'The writer lives in Bali', id: 'Penulis itu tinggal di Bali' },
        { en: 'We respect the soldiers', id: 'Kami menghormati para tentara' },
        { en: 'My father is a farmer', id: 'Ayahku adalah seorang petani' },
        { en: 'The office is big', id: 'Kantornya besar' },
        { en: 'He loves his job', id: 'Dia menyukai pekerjaannya' },
        { en: 'She helps the doctor', id: 'Dia membantu dokter' },
        { en: 'They work every day', id: 'Mereka bekerja setiap hari' },
    ]},

    { id: 't8', chapter: 1, emoji: '🏃', title: 'Kata kerja aktivitas sehari-hari', parts: 8, extra: [3, 6], tips: [
        "Gunakan present tense untuk aktivitas rutin/sehari-hari.",
        "Contoh kata kerja dasar: read (membaca), sleep (tidur), run (berlari), study (belajar).",
        "Aturan He/She/It tetap berlaku: He reads a book, She sleeps early."
    ], phrases: [
        { en: 'I read a book every night', id: 'Aku membaca buku setiap malam' },
        { en: 'She sleeps early', id: 'Dia tidur awal' },
        { en: 'He runs in the park', id: 'Dia berlari di taman' },
        { en: 'We study English together', id: 'Kita belajar bahasa Inggris bersama' },
        { en: 'They play football on Sundays', id: 'Mereka bermain sepak bola pada hari Minggu' },
        { en: 'I write a letter', id: 'Aku menulis surat' },
        { en: 'Do you watch television', id: 'Apakah kamu menonton televisi' },
        { en: 'She listens to music', id: 'Dia mendengarkan musik' },
        { en: 'He speaks English well', id: 'Dia berbicara bahasa Inggris dengan baik' },
        { en: 'We walk to school', id: 'Kami berjalan kaki ke sekolah' },
        { en: 'They sing a beautiful song', id: 'Mereka menyanyikan lagu yang indah' },
        { en: 'I drink water in the morning', id: 'Aku minum air di pagi hari' },
        { en: 'She swims in the pool', id: 'Dia berenang di kolam renang' },
        { en: 'My mother cooks breakfast', id: 'Ibuku memasak sarapan' },
        { en: 'He drives a blue car', id: 'Dia mengendarai mobil biru' },
        { en: 'We learn new words', id: 'Kita belajar kata-kata baru' },
        { en: 'They buy fresh fruits', id: 'Mereka membeli buah-buahan segar' },
        { en: 'I sell ice cream', id: 'Aku menjual es krim' },
        { en: 'The boy jumps high', id: 'Anak laki-laki itu melompat tinggi' },
        { en: 'She walks with her friend', id: 'Dia berjalan dengan temannya' },
    ]},

    { id: 't9', chapter: 1, emoji: '🌦️', title: 'Membicarakan tentang cuaca', parts: 8, extra: [3, 6], tips: [
        "Gunakan 'It is...' untuk mendeskripsikan cuaca saat ini. Contoh: 'It is sunny'.",
        "Kosakata cuaca: rain (hujan), sunny (cerah), cloudy (berawan), wind (angin).",
        "Gunakan 'need' untuk kebutuhan, contoh: 'I need an umbrella' (saya butuh payung)."
    ], phrases: [
        { en: 'It is sunny today', id: 'Hari ini cerah' },
        { en: 'I need an umbrella', id: 'Aku butuh payung' },
        { en: 'It is raining outside', id: 'Di luar sedang hujan' },
        { en: 'The sky is blue', id: 'Langitnya berwarna biru' },
        { en: 'It is very cold', id: 'Sangat dingin' },
        { en: 'The wind is strong', id: 'Anginnya kencang' },
        { en: 'Is it hot in Jakarta', id: 'Apakah di Jakarta panas' },
        { en: 'Look at the beautiful rainbow', id: 'Lihatlah pelangi yang indah' },
        { en: 'The weather is warm', id: 'Cuacanya hangat' },
        { en: 'I like cloudy days', id: 'Aku suka hari yang berawan' },
        { en: 'We wear warm jackets', id: 'Kami memakai jaket hangat' },
        { en: 'The storm is coming', id: 'Badai akan datang' },
        { en: 'The night is dark', id: 'Malam ini gelap' },
        { en: 'The ground is dry', id: 'Tanahnya kering' },
        { en: 'It is snow in winter', id: 'Ada salju di musim dingin' },
        { en: 'The clouds are white', id: 'Awan-awannya berwarna putih' },
        { en: 'I love this season', id: 'Aku suka musim ini' },
        { en: 'What is the temperature', id: 'Berapa suhunya' },
        { en: 'It is thirty degrees', id: 'Suhunya tiga puluh derajat' },
        { en: 'We stay home when it rains', id: 'Kami tinggal di rumah saat hujan' },
    ]},

    { id: 't10', chapter: 1, emoji: '🐶', title: 'Membicarakan tentang hewan peliharaan', parts: 8, extra: [3, 6], tips: [
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

    { id: 't11', chapter: 2, emoji: '🛍️', title: 'Belanja & Tawar-menawar', parts: 5, extra: [3], tips: [
        "'How much does it cost?' digunakan untuk menanyakan harga barang secara spesifik.",
        "'Can I get a discount?' digunakan jika ingin meminta potongan harga secara sopan.",
        "'Receipt' (struk belanja) dibaca 'ri-sit', huruf 'p' tidak diucapkan."
    ], phrases: [
        { en: "How much does this shirt cost", id: "Berapa harga kemeja ini" },
        { en: "Is there a discount for this", id: "Apakah ada diskon untuk ini" },
        { en: "I would like to buy this bag", id: "Saya ingin membeli tas ini" },
        { en: "Where is the fitting room", id: "Di mana kamar pas" },
        { en: "Can I pay by credit card", id: "Boleh saya bayar pakai kartu kredit" },
        { en: "Please give me the receipt", id: "Tolong berikan struk belanjanya" },
        { en: "This price is too expensive", id: "Harga ini terlalu mahal" },
        { en: "Do you have a cheaper one", id: "Apakah kamu punya yang lebih murah" },
        { en: "I am just looking around", id: "Saya hanya sedang melihat-lihat" },
        { en: "I want to return this item", id: "Saya ingin mengembalikan barang ini" }
    ]},

    { id: 't12', chapter: 2, emoji: '🗺️', title: 'Menanyakan & Menunjukkan Arah', parts: 5, extra: [3], tips: [
        "'Turn left' = belok kiri, 'Turn right' = belok kanan, 'Go straight' = jalan terus.",
        "Gunakan 'excuse me' di awal kalimat sebelum bertanya kepada orang asing.",
        "'Next to' berarti di sebelah, sedangkan 'across from' berarti di seberang."
    ], phrases: [
        { en: "Excuse me where is the station", id: "Permisi di mana stasiunnya" },
        { en: "Go straight and turn left", id: "Jalan terus dan belok kiri" },
        { en: "The hotel is next to the bank", id: "Hotelnya di sebelah bank" },
        { en: "Is the museum far from here", id: "Apakah museumnya jauh dari sini" },
        { en: "You will see a post office", id: "Kamu akan melihat kantor pos" },
        { en: "Turn right at the traffic light", id: "Belok kanan di lampu merah" },
        { en: "The restaurant is across from school", id: "Restorannya di seberang sekolah" },
        { en: "How do I get to the airport", id: "Bagaimana cara ke bandara" },
        { en: "It is about ten minutes walk", id: "Jaraknya sekitar sepuluh menit jalan kaki" },
        { en: "Thank you for your help", id: "Terima kasih atas bantuanmu" }
    ]},

    { id: 't13', chapter: 2, emoji: '🏨', title: 'Perjalanan & Reservasi Hotel', parts: 5, extra: [3], tips: [
        "'Check-in' adalah proses mendaftar saat tiba, 'Check-out' saat keluar.",
        "'Double room' mempunyai satu kasur besar, 'Twin room' mempunyai dua kasur terpisah.",
        "'Reservation' = pemesanan tempat, 'Book' = memesan (kata kerja)."
    ], phrases: [
        { en: "I have a reservation under my name", id: "Saya punya reservasi atas nama saya" },
        { en: "What time is checkout", id: "Jam berapa waktu checkout" },
        { en: "Does the room have free wifi", id: "Apakah kamarnya ada wifi gratis" },
        { en: "I would like a double room", id: "Saya ingin kamar dengan satu kasur besar" },
        { en: "We need two room keys please", id: "Tolong kami butuh dua kunci kamar" },
        { en: "Is breakfast included in the price", id: "Apakah sarapan sudah termasuk dalam harga" },
        { en: "Can you wake me up at seven", id: "Bisa bangunkan saya jam tujuh" },
        { en: "Where can I leave my luggage", id: "Di mana saya bisa titip bagasi" },
        { en: "I want to book a taxi", id: "Saya ingin memesan taksi" },
        { en: "We enjoyed our stay here", id: "Kami menikmati masa tinggal kami di sini" }
    ]},

    { id: 't14', chapter: 2, emoji: '🩺', title: 'Kesehatan & Keluhan Medis', parts: 5, extra: [3], tips: [
        "Gunakan kata 'ache' untuk rasa sakit di bagian tubuh, contoh: 'headache' (sakit kepala), 'stomachache' (sakit perut).",
        "'Should' digunakan untuk memberikan saran medis atau umum.",
        "'Prescription' adalah resep obat dari dokter."
    ], phrases: [
        { en: "I have a terrible headache", id: "Saya sakit kepala parah" },
        { en: "You should see a doctor", id: "Kamu harus pergi ke dokter" },
        { en: "Where is the nearest pharmacy", id: "Di mana apotek terdekat" },
        { en: "I need some medicine for cold", id: "Saya butuh obat flu" },
        { en: "Does it hurt here", id: "Apakah sakit di bagian sini" },
        { en: "Take this pill after eating", id: "Minum pil ini setelah makan" },
        { en: "I feel dizzy and weak", id: "Saya merasa pusing dan lemas" },
        { en: "My throat is very sore", id: "Tenggorokan saya sangat sakit" },
        { en: "You need to rest today", id: "Kamu perlu istirahat hari ini" },
        { en: "I hope you feel better soon", id: "Semoga kamu lekas sembuh" }
    ]},

    { id: 't15', chapter: 2, emoji: '💼', title: 'Dunia Kerja & Karir', parts: 5, extra: [3], tips: [
        "'Apply for a job' = melamar pekerjaan, 'Hire' = mempekerjakan.",
        "'Resume' atau 'CV' adalah daftar riwayat hidup untuk melamar kerja.",
        "'Colleague' adalah rekan kerja, 'Boss' atau 'Manager' adalah atasan."
    ], phrases: [
        { en: "I have a job interview tomorrow", id: "Saya ada wawancara kerja besok" },
        { en: "She works in a big company", id: "Dia bekerja di perusahaan besar" },
        { en: "What is your current profession", id: "Apa pekerjaanmu saat ini" },
        { en: "We have a meeting at ten", id: "Kita ada rapat jam sepuluh" },
        { en: "He is my favorite colleague", id: "Dia adalah rekan kerja favorit saya" },
        { en: 'I need to send an email', id: 'Saya harus mengirim email' },
        { en: 'We are working on a project', id: 'Kami sedang mengerjakan sebuah proyek' },
        { en: 'She got promoted last week', id: 'Dia naik jabatan minggu lalu' },
        { en: 'I want to apply for this job', id: 'Saya ingin melamar pekerjaan ini' },
        { en: 'He has a lot of experience', id: 'Dia punya banyak pengalaman' }
    ]}
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
    t11:[['discount','diskon'],['expensive','mahal'],['cheap','murah'],['shirt','kemeja'],['bag','tas'],['price','harga'],['receipt','struk belanja'],['card','kartu kredit'],['fitting','kamar pas'],['buy','membeli'],['return','mengembalikan'],['shop','toko'],['market','pasar'],['cashier','kasir'],['sell','menjual'],['change','kembalian'],['customer','pelanggan'],['store','toko'],['wallet','dompet'],['coin','koin']],
    t12:[['left','kiri'],['right','kanan'],['straight','lurus'],['directions','arah'],['station','stasiun'],['hotel','hotel'],['bank','bank'],['museum','museum'],['airport','bandara'],['restaurant','restoran'],['school','sekolah'],['street','jalan'],['bridge','jembatan'],['corner','pojok'],['traffic','lampu merah'],['turn','belok'],['map','peta'],['walk','jalan kaki'],['minutes','menit'],['help','bantuan']],
    t13:[['reservation','reservasi'],['checkout','checkout'],['wifi','wifi'],['keys','kunci kamar'],['breakfast','sarapan'],['price','harga'],['luggage','bagasi'],['taxi','taksi'],['stay','tinggal'],['double','kasur besar'],['room','kamar'],['bed','tempat tidur'],['hotel','hotel'],['lobby','lobi'],['pillow','bantal'],['blanket','selimut'],['shower','pancuran mandi'],['towel','handuk'],['service','layanan'],['passport','paspor']],
    t14:[['headache','sakit kepala'],['doctor','dokter'],['medicine','obat'],['pharmacy','apotek'],['hurt','sakit'],['pill','pil'],['rest','istirahat'],['dizzy','pusing'],['weak','lemas'],['sore','sore (sakit/luka)'],['hospital','rumah sakit'],['nurse','perawat'],['clinic','klinik'],['pain','rasa sakit'],['fever','demam'],['cough','batuk'],['stomachache','sakit perut'],['health','kesehatan'],['sick','sakit'],['cold','pilek']],
    t15:[['interview','wawancara kerja'],['company','perusahaan'],['profession','pekerjaan'],['meeting','rapat'],['colleague','rekan kerja'],['email','email'],['project','proyek'],['promoted','naik jabatan'],['apply','melamar'],['experience','pengalaman'],['office','kantor'],['boss','atasan'],['manager','manajer'],['career','karir'],['resume','riwayat hidup'],['salary','gaji'],['business','bisnis'],['team','tim'],['client','klien'],['contract','kontrak']],
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
        ? `💬 **Apa arti kalimat ini?**\n> ➡️ ${tileText(correct.en)}` 
        : `💬 **Terjemahkan ke Inggris:**\n> ➡️ ${tileText(correct.id)}`;
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
        ? `🔍 **Pilih arti dari kata:**\n> 🔤 \`${correct.en}\`` 
        : `🔍 **Bahasa Inggris dari kata:**\n> 🔤 \`${correct.id}\``;
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
        ? `🔍 **Pilih arti dari kata:**\n> 🔤 \`${targetWord.en}\`` 
        : `🔍 **Bahasa Inggris dari kata:**\n> 🔤 \`${targetWord.id}\``;
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
    const filled = Math.round((cur / total) * 10);
    return '█'.repeat(filled) + '░'.repeat(Math.max(0, 10 - filled));
}

function renderExercise(session, userId, note = '') {
    const ex = session.exercises[session.current];
    const total = session.exercises.length;
    const bar = `**Soal ${session.current + 1}/${total}** • \`${progressBar(session.current, total)}\``;
    const head = `${heartsBar(session.hearts)}${session.extra ? '  •  ⭐ 2x' : ''}${session.review ? '  •  🔄 Review' : ''}${session.speed ? '  •  ⚡ Speed' : ''}`;
    const topic = session.topicId ? TOPIC_BY_ID[session.topicId] : null;
    const footerText = `${head}${topic ? `  •  Part ${session.part || '?'}` : ''}`;
    const noteLine = note ? `${note}\n\n` : '';

    if (ex.type === 'mc') {
        const embed = new EmbedBuilder().setColor('#1CB0F6')
            .setAuthor({ name: i18n.t(session.guildId, userId, 'belajar.mc_author') })
            .setTitle(i18n.t(session.guildId, userId, 'belajar.mc_title'))
            .setDescription(`${bar}\n\n${noteLine}${ex.prompt}\n\n` + ex.options.map((o, i) => `> ${LBL[i]}  **${o}**`).join('\n'))
            .setFooter({ text: footerText });
        const row = new ActionRowBuilder().addComponents(ex.options.map((_, i) => new ButtonBuilder().setCustomId(`belajar_ans_${i}_${userId}`).setLabel(LBL[i]).setStyle(ButtonStyle.Primary)));
        return { embeds: [embed], components: [row] };
    }

    if (ex.type === 'listen') {
        const promptText = i18n.t(session.guildId, userId, 'belajar.listen_prompt');
        const embed = new EmbedBuilder().setColor('#FF9600')
            .setAuthor({ name: i18n.t(session.guildId, userId, 'belajar.mc_author') })
            .setTitle(i18n.t(session.guildId, userId, 'belajar.listen_title'))
            .setDescription(`${bar}\n\n${noteLine}${promptText}\n\n` + ex.options.map((o, i) => `> ${LBL[i]}  **${o}**`).join('\n'))
            .setFooter({ text: footerText });
        const row = new ActionRowBuilder().addComponents(ex.options.map((_, i) => new ButtonBuilder().setCustomId(`belajar_ans_${i}_${userId}`).setLabel(LBL[i]).setStyle(ButtonStyle.Primary)));
        const result = { embeds: [embed], components: [row] };
        result._ttsText = ex.audioText;
        return result;
    }

    if (ex.type === 'type') {
        const promptText = i18n.t(session.guildId, userId, 'belajar.type_prompt');
        const btnClickText = i18n.t(session.guildId, userId, 'belajar.type_btn_click');
        const embed = new EmbedBuilder().setColor('#CE82FF')
            .setAuthor({ name: i18n.t(session.guildId, userId, 'belajar.mc_author') })
            .setTitle(i18n.t(session.guildId, userId, 'belajar.type_title'))
            .setDescription(`${bar}\n\n${noteLine}✍️ **${promptText}**\n> ➡️ **"${ex.promptId}"**\n\n${btnClickText}`)
            .setFooter({ text: footerText });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`belajar_typebtn_${userId}`).setLabel(i18n.t(session.guildId, userId, 'belajar.type_btn_label')).setStyle(ButtonStyle.Success)
        );
        return { embeds: [embed], components: [row] };
    }

    if (ex.type === 'arrange') {
        const builtWords = (ex.built || []).map(i => ex.tiles[i].word);
        const builtLine = builtWords.length ? builtWords.map(w => `\`${w}\``).join(' ') : '`___`';
        const promptText = i18n.t(session.guildId, userId, 'belajar.arrange_prompt');
        const embed = new EmbedBuilder().setColor('#CE82FF')
            .setAuthor({ name: i18n.t(session.guildId, userId, 'belajar.mc_author') })
            .setTitle(i18n.t(session.guildId, userId, 'belajar.arrange_title'))
            .setDescription(`${bar}\n\n${noteLine}🧩 **${promptText}**\n> ➡️ **${ex.promptId}**\n\n📝 ${builtLine}`)
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
            new ButtonBuilder().setCustomId(`belajar_undo_${userId}`).setLabel(i18n.t(session.guildId, userId, 'belajar.arrange_undo')).setStyle(ButtonStyle.Danger).setDisabled(ex.built.length === 0),
            new ButtonBuilder().setCustomId(`belajar_check_${userId}`).setLabel(i18n.t(session.guildId, userId, 'belajar.arrange_check')).setStyle(ButtonStyle.Success).setDisabled(ex.built.length === 0),
        ));
        return { embeds: [embed], components: components.slice(0, 5) };
    }

    // match
    const promptText = i18n.t(session.guildId, userId, 'belajar.match_prompt');
    const statusText = i18n.t(session.guildId, userId, 'belajar.match_status', { current: ex.matched.length, total: ex.pairs.length });
    const embed = new EmbedBuilder().setColor('#FF9600')
        .setAuthor({ name: i18n.t(session.guildId, userId, 'belajar.mc_author') })
        .setTitle(i18n.t(session.guildId, userId, 'belajar.match_title'))
        .setDescription(`${bar}\n\n${noteLine}🔗 **${promptText}**\n\n> 📈 ${statusText}`)
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

function buildChapterPanel(guildId, userId, chapter = 1) {
    const st = getStudyStats(guildId, userId);
    const chapterTopics = TOPICS.filter(t => t.chapter === chapter);

    // Hitung progress keseluruhan chapter
    const totalParts = chapterTopics.reduce((s, t) => s + t.parts, 0);
    const donePartsTotal = chapterTopics.reduce((s, t) => s + topicDoneCount(guildId, userId, t.id), 0);
    const doneTopics = chapterTopics.filter(t => topicDoneCount(guildId, userId, t.id) >= t.parts).length;
    const pct = totalParts ? Math.round((donePartsTotal / totalParts) * 100) : 0;
    const filled = Math.round((pct / 100) * 12);
    const overallBar = '█'.repeat(filled) + '░'.repeat(Math.max(0, 12 - filled));

    const lines = chapterTopics.map(t => {
        const idx = TOPICS.indexOf(t);
        const done = topicDoneCount(guildId, userId, t.id);
        const unlocked = topicUnlocked(guildId, userId, idx);
        const status = done >= t.parts ? '✅' : unlocked ? '▶️' : '🔒';
        const num = `\`${String(idx + 1).padStart(2, ' ')}\``;
        return `${num} ${status} ${t.emoji} **${t.title}** *(${done}/${t.parts})*`;
    });

    const embed = new EmbedBuilder()
        .setColor('#1CB0F6')
        .setTitle(i18n.t(guildId, userId, `belajar.chapter_title_${chapter}`))
        .setDescription(
            i18n.t(guildId, userId, 'belajar.chapter_stats', { level: st.level, xp: st.xp, streak: st.streak }) + '\n' +
            i18n.t(guildId, userId, `belajar.chapter_progress_${chapter}`, { bar: overallBar, pct: pct, done: doneTopics, total: chapterTopics.length }) + '\n\n' +
            `${lines.join('\n')}`
        )
        .setFooter({ text: i18n.t(guildId, userId, 'belajar.chapter_footer') });

    const rows = [];
    let row = new ActionRowBuilder();
    chapterTopics.forEach(t => {
        const idx = TOPICS.indexOf(t);
        if (row.components.length > 0 && row.components.length % 5 === 0) { rows.push(row); row = new ActionRowBuilder(); }
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
        const toggleBtn = chapter === 1 
            ? new ButtonBuilder().setCustomId(`belajar_page_2_${userId}`).setLabel(i18n.t(guildId, userId, 'belajar.btn_next_chapter')).setStyle(ButtonStyle.Primary)
            : new ButtonBuilder().setCustomId(`belajar_page_1_${userId}`).setLabel(i18n.t(guildId, userId, 'belajar.btn_prev_chapter')).setStyle(ButtonStyle.Primary);
        
        rows.push(new ActionRowBuilder().addComponents(
            toggleBtn,
            new ButtonBuilder().setCustomId(`belajar_review_${userId}`).setLabel(i18n.t(guildId, userId, 'belajar.btn_review')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`belajar_speed_${userId}`).setLabel(i18n.t(guildId, userId, 'belajar.btn_speed')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`belajar_lb_${userId}`).setLabel(i18n.t(guildId, userId, 'belajar.btn_leaderboard')).setStyle(ButtonStyle.Secondary),
        ));
    }
    return { embeds: [embed], components: rows.slice(0, 5) };
}


function buildLeaderboardPanel(guildId, userId, guild) {
    const rows = db.prepare('SELECT userId, xp FROM belajar_progress WHERE guildId = ? AND xp > 0 ORDER BY xp DESC LIMIT 10').all(guildId);
    const medals = ['🥇', '🥈', '🥉'];
    const lines = rows.length ? rows.map((r, i) => {
        const tag = medals[i] || `**${i + 1}.**`;
        const lv = studyLevel(r.xp);
        return `${tag} <@${r.userId}> — Lv.${lv} • ⭐ ${r.xp} XP`;
    }).join('\n') : i18n.t(guildId, userId, 'belajar.lb_empty');
    const myRank = db.prepare('SELECT COUNT(*) AS c FROM belajar_progress WHERE guildId = ? AND xp > (SELECT xp FROM belajar_progress WHERE guildId = ? AND userId = ?)').get(guildId, guildId, userId).c + 1;
    const myXp = getXP(guildId, userId);
    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(i18n.t(guildId, userId, 'belajar.lb_title'))
        .setDescription(`${lines}\n\n` + i18n.t(guildId, userId, 'belajar.lb_footer', { rank: myRank, xp: myXp }));
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`belajar_home_${userId}`).setLabel(i18n.t(guildId, userId, 'belajar.btn_back')).setStyle(ButtonStyle.Secondary));
    return { embeds: [embed], components: [row] };
}

function buildTopicPanel(guildId, userId, topic) {
    const idx = TOPICS.findIndex(t => t.id === topic.id);
    const donePartCount = topicDoneCount(guildId, userId, topic.id);
    const pct = topic.parts ? Math.round((donePartCount / topic.parts) * 100) : 0;
    const filled = Math.round((pct / 100) * 12);
    const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, 12 - filled));

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
            i18n.t(guildId, userId, 'belajar.topic_progress', { bar: bar, pct: pct, done: donePartCount, total: topic.parts }) + '\n\n' +
            `${lines.join('\n')}\n\n` + i18n.t(guildId, userId, 'belajar.topic_note')
        )
        .setFooter({ text: i18n.t(guildId, userId, 'belajar.topic_footer', { chapter: topic.chapter, current: idx + 1, total: TOPICS.length }) });

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
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`belajar_home_${topic.chapter}_${userId}`).setLabel(i18n.t(guildId, userId, 'belajar.btn_back_chapter', { chapter: topic.chapter })).setStyle(ButtonStyle.Secondary)));
    return { embeds: [embed], components: rows.slice(0, 5) };
}


// ==================== HANDLERS ====================
async function handleBelajarCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    ensureRow(guildId, userId); // ensure once at session start
    return interaction.reply(buildChapterPanel(guildId, userId));
}

async function buildFinishPayload(session, ownerId, guildId, success, guild) {
    if (success) {
        sessions.delete(`${guildId}_${ownerId}`);
    }

    const topic = TOPIC_BY_ID[session.topicId];
    const chapter = topic ? topic.chapter : 1;

    // ---- Speed Round finish ----
    if (session.speed) {
        sessions.delete(`${guildId}_${ownerId}`);
        const elapsed = Math.max(1, Math.round((Date.now() - session.startTime) / 1000));
        const { streak, shieldUsed } = updateStreak(guildId, ownerId);
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
        // Trigger quest progress: belajar
        try {
            const { updateQuestProgress } = require('./quests');
            updateQuestProgress(guildId, ownerId, 'belajar', 1);
        } catch (_) {}
        const speedBonusStr = speedBonus ? i18n.t(guildId, ownerId, 'belajar.speed_bonus_kilat') : '';
        const shieldStr = shieldUsed ? i18n.t(guildId, ownerId, 'belajar.streak_shield_used') : '';
        const embed = new EmbedBuilder().setColor('#FF9600').setTitle(i18n.t(guildId, ownerId, 'belajar.speed_finish_title'))
            .setDescription(
                i18n.t(guildId, ownerId, 'belajar.speed_finish_desc', {
                    correct: session.correct,
                    total: session.exercises.length,
                    time: elapsed,
                    xp: xpGain,
                    money: moneyGain.toLocaleString('id-ID'),
                    bonus: speedBonusStr,
                    streak: streak
                }) + shieldStr
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`belajar_speed_${ownerId}`).setLabel(i18n.t(guildId, ownerId, 'belajar.btn_speed')).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`belajar_home_1_${ownerId}`).setLabel(i18n.t(guildId, ownerId, 'belajar.btn_back_chapter', { chapter: 1 })).setStyle(ButtonStyle.Secondary),
        );
        return { embeds: [embed], components: [row] };
    }


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
        // Trigger quest progress: belajar
        try {
            const { updateQuestProgress } = require('./quests');
            updateQuestProgress(guildId, ownerId, 'belajar', 1);
        } catch (_) {}

        const { streak, shieldUsed } = updateStreak(guildId, ownerId);
        const perfect = !isReview && session.hearts === HEARTS_MAX && session.correct === session.exercises.length;
        const newAch = await checkAchievements(guild || { id: guildId }, ownerId, { streak, perfect });

        const nextPartUnlocked = !isReview && session.part < topic.parts;
        const topicDone = !isReview && topicDoneCount(guildId, ownerId, session.topicId) >= topic.parts;

        const subTitle = isReview ? i18n.t(guildId, ownerId, 'belajar.btn_review') : `Part ${session.part}${session.extra ? ' 🌟' : ''}`;
        const notesStr = (session.extra && !isReview ? '  *(2x Extra!)*' : '') + (isReview ? '  *(Review 0.5x)*' : '');
        const perfectStr = perfect ? i18n.t(guildId, ownerId, 'belajar.perfect_note') : '';
        const topicDoneStr = topicDone ? i18n.t(guildId, ownerId, 'belajar.topic_done_note') : '';
        const partUnlockedStr = nextPartUnlocked ? i18n.t(guildId, ownerId, 'belajar.part_unlocked_note', { part: session.part + 1 }) : '';
        let newAchStr = '';
        if (newAch.length) {
            newAchStr = i18n.t(guildId, ownerId, 'belajar.new_ach_note') + newAch.map(a => `${a.emoji} **${a.name}** (+🪙${a.reward} Money)`).join('\n');
        }
        const shieldStr = shieldUsed ? i18n.t(guildId, ownerId, 'belajar.streak_shield_used') : '';

        const desc = i18n.t(guildId, ownerId, 'belajar.part_finish_desc', {
            emoji: topic.emoji,
            title: topic.title,
            subtitle: subTitle,
            correct: session.correct,
            total: session.exercises.length,
            hearts: heartsBar(session.hearts),
            xp: xpGain,
            money: moneyGain.toLocaleString('id-ID'),
            notes: notesStr,
            streak: streak,
            perfect: perfectStr,
            topic_done: topicDoneStr,
            part_unlocked: partUnlockedStr,
            new_ach: newAchStr
        }) + shieldStr;

        const embed = new EmbedBuilder().setColor('#58CC02').setTitle(isReview ? i18n.t(guildId, ownerId, 'belajar.review_finish_title') : i18n.t(guildId, ownerId, 'belajar.part_finish_title')).setDescription(desc);
        const row = new ActionRowBuilder().addComponents(
            isReview
                ? new ButtonBuilder().setCustomId(`belajar_home_${chapter}_${ownerId}`).setLabel(i18n.t(guildId, ownerId, 'belajar.btn_back_chapter', { chapter })).setStyle(ButtonStyle.Primary)
                : new ButtonBuilder().setCustomId(`belajar_topic_${session.topicId}_${ownerId}`).setLabel(i18n.t(guildId, ownerId, 'belajar.btn_view_parts')).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`belajar_home_${chapter}_${ownerId}`).setLabel(i18n.t(guildId, ownerId, 'belajar.btn_back_chapter', { chapter })).setStyle(ButtonStyle.Secondary),
        );
        return { embeds: [embed], components: [row] };
    }
    const partSub = session.review ? ' (Review)' : ` Part ${session.part}`;
    const embed = new EmbedBuilder().setColor('#FF4B4B').setTitle(i18n.t(guildId, ownerId, 'belajar.hearts_depleted_title'))
        .setDescription(i18n.t(guildId, ownerId, 'belajar.hearts_depleted_desc', {
            title: topic.title,
            part: partSub,
            correct: session.correct,
            total: session.exercises.length
        }));
    const retryBtn = session.review
        ? new ButtonBuilder().setCustomId(`belajar_review_${ownerId}`).setLabel(i18n.t(guildId, ownerId, 'belajar.btn_review_retry')).setStyle(ButtonStyle.Success)
        : new ButtonBuilder().setCustomId(`belajar_part_${session.topicId}_${session.part}_${ownerId}`).setLabel(i18n.t(guildId, ownerId, 'belajar.btn_retry')).setStyle(ButtonStyle.Success);
    const buyHeartsBtn = new ButtonBuilder()
        .setCustomId(`belajar_buyhearts_${ownerId}`)
        .setLabel(i18n.t(guildId, ownerId, 'belajar.btn_buy_hearts'))
        .setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(
        retryBtn,
        buyHeartsBtn,
        new ButtonBuilder().setCustomId(`belajar_home_${chapter}_${ownerId}`).setLabel(i18n.t(guildId, ownerId, 'belajar.btn_back_chapter', { chapter })).setStyle(ButtonStyle.Secondary),
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
            ? await buildFinishPayload(session, ownerId, guildId, true, interaction.guild)
            : renderExercise(session, ownerId);
        return sendExercise(interaction, session, payload, 'update');
    }

    const fbEmbed = correct
        ? new EmbedBuilder().setColor('#58CC02').setTitle(i18n.t(guildId, ownerId, 'belajar.correct_feedback')).setDescription(i18n.t(guildId, ownerId, 'belajar.correct_feedback_desc'))
        : new EmbedBuilder().setColor('#FF4B4B').setTitle(i18n.t(guildId, ownerId, 'belajar.incorrect_feedback')).setDescription(i18n.t(guildId, ownerId, 'belajar.incorrect_feedback_desc', { answer: tileText(answerText) }));
    await interaction.update({ embeds: [fbEmbed], components: [], files: [] });

    const isTest = process.env.NODE_ENV === 'test';
    const delay = isTest ? 0 : (correct ? 900 : 1800);

    const advanceFn = async () => {
        session.current++;
        const key = `${guildId}_${ownerId}`;
        let payload;
        if (session.hearts <= 0) payload = await buildFinishPayload(session, ownerId, guildId, false, interaction.guild);
        else if (session.current >= session.exercises.length) payload = await buildFinishPayload(session, ownerId, guildId, true, interaction.guild);
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
        if (buf) {
            files.push(new AttachmentBuilder(buf, { name: 'listen.mp3' }));
        } else {
            const embed = payload.embeds && payload.embeds[0];
            if (embed) {
                const warningMsg = i18n.t(interaction.guildId, interaction.user.id, 'belajar.tts_failed_warning');
                const currentDesc = embed.data.description || '';
                embed.setDescription(`⚠️ **${warningMsg}**\n\n${currentDesc}`);
            }
        }
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
    if (!channel || typeof channel.createMessageCollector !== 'function') return;
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
        return interaction.reply({ content: i18n.t(guildId, interaction.user.id, 'belajar.not_your_session'), ephemeral: true });
    }

    // Ensure row once per interaction session
    ensureRow(guildId, ownerId);

    if (customId.startsWith('belajar_home_')) {
        sessions.delete(`${guildId}_${ownerId}`);
        const chapterNum = parseInt(parts[2], 10) || 1;
        return interaction.update(buildChapterPanel(guildId, ownerId, chapterNum));
    }
    if (customId.startsWith('belajar_page_')) {
        sessions.delete(`${guildId}_${ownerId}`);
        const chapterNum = parseInt(parts[2], 10) || 1;
        return interaction.update(buildChapterPanel(guildId, ownerId, chapterNum));
    }
    if (customId.startsWith('belajar_buyhearts_')) {
        const u = getOrCreateUser(guildId, ownerId);
        const cost = 1000;
        if (u.balance < cost) {
            return interaction.reply({ content: i18n.t(guildId, ownerId, 'belajar.money_insufficient', { cost: cost.toLocaleString('id-ID') }), ephemeral: true });
        }
        const session = sessions.get(`${guildId}_${ownerId}`);
        if (!session) {
            return interaction.reply({ content: i18n.t(guildId, ownerId, 'belajar.session_expired'), ephemeral: true });
        }
        
        // Deduct money
        u.balance -= cost;
        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(u.balance, guildId, ownerId);
        
        // Restore hearts
        session.hearts = 3;
        
        // Resume lesson
        const payload = renderExercise(session, ownerId);
        await interaction.update(payload);
        if (session.exercises[session.current] && session.exercises[session.current].type === 'type') {
            startTypeCollector(interaction, session, ownerId, guildId);
        }
        return;
    }
    if (customId.startsWith('belajar_lb_')) {
        sessions.delete(`${guildId}_${ownerId}`);
        return interaction.update(buildLeaderboardPanel(guildId, ownerId, interaction.guild));
    }
    if (customId.startsWith('belajar_review_')) {
        sessions.delete(`${guildId}_${ownerId}`);
        const completed = TOPICS.filter(t => topicDoneCount(guildId, ownerId, t.id) > 0);
        if (!completed.length) {
            return interaction.reply({ content: i18n.t(guildId, ownerId, 'belajar.review_locked'), ephemeral: true });
        }
        const topic = completed[Math.floor(Math.random() * completed.length)];
        const session = { topicId: topic.id, part: 0, review: true, extra: false, exercises: buildLesson(topic, 4, guildId, ownerId), current: 0, hearts: HEARTS_MAX, correct: 0, guildId };
        sessions.set(`${guildId}_${ownerId}`, session);
        return interaction.update(renderExercise(session, ownerId));
    }
    if (customId.startsWith('belajar_speed_')) {
        sessions.delete(`${guildId}_${ownerId}`);
        const pool = [];
        TOPICS.forEach((t, idx) => { if (topicUnlocked(guildId, ownerId, idx)) pool.push(...t.words); });
        const words = pool.length ? pool : TOPICS[0].words;
        const exercises = [];
        const shuffledWords = shuffle(words);
        for (let i = 0; i < EX_PER_LESSON; i++) exercises.push(makeWord(shuffledWords.length >= 3 ? shuffledWords : words));
        const session = { speed: true, topicId: null, exercises, current: 0, hearts: HEARTS_MAX, correct: 0, startTime: Date.now(), guildId };
        sessions.set(`${guildId}_${ownerId}`, session);
        return interaction.update(renderExercise(session, ownerId));
    }
    if (customId.startsWith('belajar_topic_')) {
        sessions.delete(`${guildId}_${ownerId}`);
        const topic = TOPIC_BY_ID[parts[2]];
        if (!topic) return interaction.reply({ content: '❌ Topik tidak ditemukan.', ephemeral: true });
        const idx = TOPICS.findIndex(t => t.id === topic.id);
        if (!topicUnlocked(guildId, ownerId, idx)) return interaction.reply({ content: i18n.t(guildId, ownerId, 'belajar.topic_locked'), ephemeral: true });
        return interaction.update(buildTopicPanel(guildId, ownerId, topic));
    }

    if (customId.startsWith('belajar_part_')) {
        sessions.delete(`${guildId}_${ownerId}`);
        const topicId = parts[2]; const part = parseInt(parts[3]);
        const topic = TOPIC_BY_ID[topicId];
        if (!topic) return interaction.reply({ content: '❌ Topik tidak ditemukan.', ephemeral: true });
        const unlocked = part === 1 || isPartDone(guildId, ownerId, topicId, part - 1);
        if (!unlocked) return interaction.reply({ content: i18n.t(guildId, ownerId, 'belajar.part_locked'), ephemeral: true });
        const session = { topicId, part, extra: topic.extra.includes(part), exercises: buildLesson(topic, part, guildId, ownerId), current: 0, hearts: HEARTS_MAX, correct: 0, guildId };
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
    if (!session) return interaction.update({ content: i18n.t(guildId, ownerId, 'belajar.session_ended'), embeds: [], components: [] });
    const ex = session.exercises[session.current];


    if (customId.startsWith('belajar_ans_')) {
        if (!ex || !ex.options) return interaction.deferUpdate();
        const chosen = parseInt(parts[2]);
        const correct = chosen === ex.correctIndex;
        return resolveAnswer(interaction, session, ownerId, guildId, correct, ex.options[ex.correctIndex]);
    }
    if (customId.startsWith('belajar_typebtn_')) {
        if (ex.type !== 'type') return interaction.deferUpdate();
        const modal = new ModalBuilder().setCustomId(`belajar_typemodal_${ownerId}`).setTitle(i18n.t(guildId, ownerId, 'belajar.type_modal_title'));
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('answer').setLabel(i18n.t(guildId, ownerId, 'belajar.type_modal_label', { prompt: ex.promptId })).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(i18n.t(guildId, ownerId, 'belajar.type_modal_placeholder'))
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
                return resolveAnswer(interaction, session, ownerId, guildId, true, i18n.t(guildId, ownerId, 'belajar.match_success'));
            }
            return interaction.update(renderExercise(session, ownerId, '✅ Cocok!'));
        }
        // Salah → kurangi nyawa
        session.hearts--;
        if (session.hearts <= 0) {
            return interaction.update(await buildFinishPayload(session, ownerId, guildId, false, interaction.guild));
        }
        return interaction.update(renderExercise(session, ownerId, i18n.t(guildId, ownerId, 'belajar.match_fail_heart')));
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
    if (!session) return interaction.reply({ content: i18n.t(guildId, ownerId, 'belajar.session_ended'), ephemeral: true });
    const ex = session.exercises[session.current];
    if (!ex || ex.type !== 'type') return interaction.reply({ content: i18n.t(guildId, ownerId, 'belajar.question_stale'), ephemeral: true });

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
        ? new EmbedBuilder().setColor('#58CC02').setTitle(i18n.t(guildId, ownerId, 'belajar.correct_feedback')).setDescription(i18n.t(guildId, ownerId, 'belajar.correct_feedback_desc'))
        : new EmbedBuilder().setColor('#FF4B4B').setTitle(i18n.t(guildId, ownerId, 'belajar.incorrect_feedback')).setDescription(i18n.t(guildId, ownerId, 'belajar.incorrect_feedback_desc', { answer: `\`${ex.answer}\`` }));

    await interaction.update({ embeds: [fbEmbed], components: [], files: [] });

    const isTest = process.env.NODE_ENV === 'test';
    const delay = isTest ? 0 : (correct ? 900 : 1800);

    const advanceFn = async () => {
        session.current++;
        let payload;
        if (session.hearts <= 0) payload = await buildFinishPayload(session, ownerId, guildId, false, interaction.guild);
        else if (session.current >= session.exercises.length) payload = await buildFinishPayload(session, ownerId, guildId, true, interaction.guild);
        else payload = renderExercise(session, ownerId);
        await sendExercise(interaction, session, payload, 'editReply');
    };

    if (isTest) await advanceFn();
    else setTimeout(advanceFn, delay);
}

module.exports = { handleBelajarCommand, handleBelajarButton, isBelajarButton, isBelajarModal, handleBelajarModal, TOPICS, getStudyStats, updateStreak, sessions };
