// systems/belajar.js — Pusat Belajar (interactive learning panel)
//
// /belajar → kategori (Bahasa Inggris dulu) → mode kuis → 5 soal klik-klik.
// Built-in question bank (no external API), Duolingo-style. Reward money per
// jawaban benar. Mudah ditambah bahasa/kategori lain di masa depan.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, incrementUserStat } = require('../database');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

// ==================== WORD BANK (EN <-> ID) ====================
const WORDS = [
    { en: 'apple', id: 'apel' }, { en: 'book', id: 'buku' }, { en: 'water', id: 'air' },
    { en: 'house', id: 'rumah' }, { en: 'friend', id: 'teman' }, { en: 'school', id: 'sekolah' },
    { en: 'car', id: 'mobil' }, { en: 'cat', id: 'kucing' }, { en: 'dog', id: 'anjing' },
    { en: 'food', id: 'makanan' }, { en: 'rice', id: 'nasi' }, { en: 'fish', id: 'ikan' },
    { en: 'morning', id: 'pagi' }, { en: 'night', id: 'malam' }, { en: 'day', id: 'hari' },
    { en: 'love', id: 'cinta' }, { en: 'happy', id: 'senang' }, { en: 'sad', id: 'sedih' },
    { en: 'angry', id: 'marah' }, { en: 'tired', id: 'lelah' }, { en: 'big', id: 'besar' },
    { en: 'small', id: 'kecil' }, { en: 'fast', id: 'cepat' }, { en: 'slow', id: 'lambat' },
    { en: 'hot', id: 'panas' }, { en: 'cold', id: 'dingin' }, { en: 'beautiful', id: 'cantik' },
    { en: 'expensive', id: 'mahal' }, { en: 'cheap', id: 'murah' }, { en: 'open', id: 'buka' },
    { en: 'close', id: 'tutup' }, { en: 'run', id: 'lari' }, { en: 'walk', id: 'jalan' },
    { en: 'eat', id: 'makan' }, { en: 'drink', id: 'minum' }, { en: 'sleep', id: 'tidur' },
    { en: 'read', id: 'membaca' }, { en: 'write', id: 'menulis' }, { en: 'buy', id: 'membeli' },
    { en: 'sell', id: 'menjual' }, { en: 'work', id: 'bekerja' }, { en: 'play', id: 'bermain' },
    { en: 'study', id: 'belajar' }, { en: 'teacher', id: 'guru' }, { en: 'student', id: 'murid' },
    { en: 'doctor', id: 'dokter' }, { en: 'money', id: 'uang' }, { en: 'time', id: 'waktu' },
    { en: 'year', id: 'tahun' }, { en: 'month', id: 'bulan' }, { en: 'week', id: 'minggu' },
    { en: 'red', id: 'merah' }, { en: 'blue', id: 'biru' }, { en: 'green', id: 'hijau' },
    { en: 'black', id: 'hitam' }, { en: 'white', id: 'putih' }, { en: 'sun', id: 'matahari' },
    { en: 'moon', id: 'bulan (langit)' }, { en: 'star', id: 'bintang' }, { en: 'sky', id: 'langit' },
    { en: 'rain', id: 'hujan' }, { en: 'tree', id: 'pohon' }, { en: 'flower', id: 'bunga' },
    { en: 'door', id: 'pintu' }, { en: 'window', id: 'jendela' }, { en: 'table', id: 'meja' },
    { en: 'chair', id: 'kursi' }, { en: 'hand', id: 'tangan' }, { en: 'eye', id: 'mata' },
    { en: 'head', id: 'kepala' }, { en: 'heart', id: 'hati/jantung' }, { en: 'city', id: 'kota' },
];

const REWARD_PER_CORRECT = 100;
const QUESTIONS_PER_QUIZ = 5;

// Active sessions: `${guildId}_${userId}` -> session
const sessions = new Map();

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Build a single question for the given mode.
// mode: 'vocab' (EN->ID), 'translate' (ID->EN), 'mix'
function buildQuestion(mode) {
    const effectiveMode = mode === 'mix' ? (Math.random() < 0.5 ? 'vocab' : 'translate') : mode;
    const correct = WORDS[Math.floor(Math.random() * WORDS.length)];
    const distractors = shuffle(WORDS.filter(w => w.en !== correct.en)).slice(0, 3);
    const pool = shuffle([correct, ...distractors]);

    if (effectiveMode === 'vocab') {
        // Show EN, choose ID
        return {
            prompt: `Apa arti dari kata **"${correct.en}"**?`,
            options: pool.map(w => w.id),
            correctIndex: pool.findIndex(w => w.en === correct.en),
        };
    }
    // translate: show ID, choose EN
    return {
        prompt: `Bahasa Inggris dari **"${correct.id}"** adalah?`,
        options: pool.map(w => w.en),
        correctIndex: pool.findIndex(w => w.en === correct.en),
    };
}

function startSession(guildId, userId, mode) {
    const questions = [];
    for (let i = 0; i < QUESTIONS_PER_QUIZ; i++) questions.push(buildQuestion(mode));
    const session = { mode, questions, current: 0, score: 0 };
    sessions.set(`${guildId}_${userId}`, session);
    return session;
}

const OPTION_LABELS = ['🇦', '🇧', '🇨', '🇩'];

function buildQuestionMessage(session, userId) {
    const q = session.questions[session.current];
    const embed = new EmbedBuilder()
        .setColor('#58CC02') // Duolingo green
        .setTitle(`🇬🇧 Belajar Bahasa Inggris — Soal ${session.current + 1}/${session.questions.length}`)
        .setDescription(`${q.prompt}\n\n` + q.options.map((o, i) => `${OPTION_LABELS[i]} **${o}**`).join('\n'))
        .setFooter({ text: `Skor: ${session.score} • Klik jawaban di bawah` });

    const row = new ActionRowBuilder().addComponents(
        q.options.map((_, i) =>
            new ButtonBuilder().setCustomId(`belajar_ans_${i}_${userId}`).setLabel(OPTION_LABELS[i]).setStyle(ButtonStyle.Secondary)
        )
    );
    return { embeds: [embed], components: [row] };
}

// ==================== PANELS ====================
function buildCategoryPanel(userId) {
    const embed = new EmbedBuilder()
        .setColor('#1CB0F6')
        .setTitle('📚 Pusat Belajar')
        .setDescription(
            'Pilih kategori yang mau kamu pelajari:\n\n' +
            '🇬🇧 **Bahasa Inggris** — Kosakata & terjemahan\n' +
            '🔜 Jepang, Korea, Arab *(segera hadir)*\n\n' +
            '-# Jawab benar = dapat 🪙 Money!'
        );
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`belajar_cat_en_${userId}`).setLabel('🇬🇧 Bahasa Inggris').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('belajar_soon').setLabel('🔜 Lainnya').setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    return { embeds: [embed], components: [row] };
}

function buildModePanel(userId) {
    const embed = new EmbedBuilder()
        .setColor('#58CC02')
        .setTitle('🇬🇧 Bahasa Inggris — Pilih Mode')
        .setDescription(
            '📖 **Kosakata** — Tebak arti kata Inggris (EN → ID)\n' +
            '✍️ **Terjemahan** — Tebak kata Inggrisnya (ID → EN)\n' +
            '🎲 **Campur** — Campuran keduanya\n\n' +
            `Tiap kuis berisi **${QUESTIONS_PER_QUIZ} soal**.`
        );
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`belajar_mode_vocab_${userId}`).setLabel('📖 Kosakata').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`belajar_mode_translate_${userId}`).setLabel('✍️ Terjemahan').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`belajar_mode_mix_${userId}`).setLabel('🎲 Campur').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`belajar_back_${userId}`).setLabel('🔙').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
}

// ==================== HANDLERS ====================
async function handleBelajarCommand(interaction) {
    return interaction.reply(buildCategoryPanel(interaction.user.id));
}

async function handleBelajarButton(interaction) {
    const customId = interaction.customId;
    const parts = customId.split('_');
    const ownerId = parts[parts.length - 1];
    const guildId = interaction.guild.id;

    // Ownership (except disabled soon button)
    if (customId !== 'belajar_soon' && interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ Ini bukan sesi belajar kamu! Ketik `/belajar` sendiri ya.', ephemeral: true });
    }

    // Back to category
    if (customId.startsWith('belajar_back_')) {
        return interaction.update(buildCategoryPanel(ownerId));
    }

    // Category: English -> mode panel
    if (customId.startsWith('belajar_cat_en_')) {
        return interaction.update(buildModePanel(ownerId));
    }

    // Start a mode
    if (customId.startsWith('belajar_mode_')) {
        const mode = parts[2]; // vocab/translate/mix
        const session = startSession(guildId, ownerId, mode);
        return interaction.update(buildQuestionMessage(session, ownerId));
    }

    // Answer
    if (customId.startsWith('belajar_ans_')) {
        const chosen = parseInt(parts[2]);
        const session = sessions.get(`${guildId}_${ownerId}`);
        if (!session) {
            return interaction.update({ content: '⚠️ Sesi sudah berakhir. Ketik `/belajar` untuk mulai lagi.', embeds: [], components: [] });
        }
        const q = session.questions[session.current];
        const correct = chosen === q.correctIndex;
        if (correct) session.score++;

        session.current++;

        // Feedback line
        const feedback = correct
            ? `✅ **Benar!** ${OPTION_LABELS[q.correctIndex]} ${q.options[q.correctIndex]}`
            : `❌ **Salah!** Jawaban: ${OPTION_LABELS[q.correctIndex]} **${q.options[q.correctIndex]}**`;

        // More questions?
        if (session.current < session.questions.length) {
            const next = buildQuestionMessage(session, ownerId);
            next.embeds[0].setDescription(`${feedback}\n\n━━━━━━━━━━\n${next.embeds[0].data.description}`);
            return interaction.update(next);
        }

        // Finished -> reward + summary
        sessions.delete(`${guildId}_${ownerId}`);
        const reward = session.score * REWARD_PER_CORRECT;
        if (reward > 0) {
            try {
                const u = getOrCreateUser(guildId, ownerId);
                u.balance += reward;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(u.balance, guildId, ownerId);
                incrementUserStat(guildId, ownerId, 'belajar_correct', session.score);
            } catch (_) {}
        }

        const pct = Math.round((session.score / session.questions.length) * 100);
        const stars = pct >= 80 ? '🌟🌟🌟' : pct >= 50 ? '🌟🌟' : pct >= 20 ? '🌟' : '💪';
        const embed = new EmbedBuilder()
            .setColor('#58CC02')
            .setTitle('🎓 Kuis Selesai!')
            .setDescription(
                `${feedback}\n\n━━━━━━━━━━\n` +
                `**Skor:** ${session.score}/${session.questions.length} (${pct}%) ${stars}\n` +
                `**Reward:** 🪙 **${reward.toLocaleString('id-ID')} Money**\n\n` +
                `Mau coba lagi?`
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`belajar_mode_${session.mode}_${ownerId}`).setLabel('🔁 Main Lagi').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`belajar_back_${ownerId}`).setLabel('📚 Menu').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    if (customId === 'belajar_soon') {
        return interaction.reply({ content: '🔜 Bahasa lain segera hadir! Sementara fokus Bahasa Inggris dulu ya. 😉', ephemeral: true });
    }
}

function isBelajarButton(customId) {
    return typeof customId === 'string' && customId.startsWith('belajar_');
}

module.exports = { handleBelajarCommand, handleBelajarButton, isBelajarButton, WORDS };
