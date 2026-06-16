// systems/belajar.js — Pusat Belajar (Duolingo-style)
//
// /belajar → jalur belajar berunit (unlock bertahap). Tiap unit = 1 lesson
// berisi campuran latihan:
//   - Pilihan ganda (terjemah)
//   - Susun kalimat (tap word tiles) ← khas Duolingo
// Sistem nyawa (❤️x5). Selesai lesson → XP + Money + unlock unit berikutnya.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, incrementUserStat } = require('../database');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS belajar_progress (
    guildId TEXT, userId TEXT, maxUnit INTEGER DEFAULT 0, xp INTEGER DEFAULT 0,
    PRIMARY KEY (guildId, userId)
)`);
function getProgress(guildId, userId) {
    return db.prepare('SELECT * FROM belajar_progress WHERE guildId = ? AND userId = ?').get(guildId, userId) || { maxUnit: 0, xp: 0 };
}
function setProgress(guildId, userId, maxUnit, xp) {
    db.prepare('INSERT OR REPLACE INTO belajar_progress (guildId, userId, maxUnit, xp) VALUES (?, ?, ?, ?)').run(guildId, userId, maxUnit, xp);
}

// ==================== CONTENT (units → phrases) ====================
const UNITS = [
    { id: 1, emoji: '👋', title: 'Dasar 1', phrases: [
        { en: 'Good morning', id: 'Selamat pagi' },
        { en: 'Thank you', id: 'Terima kasih' },
        { en: 'How are you', id: 'Apa kabar' },
        { en: 'I am fine', id: 'Saya baik' },
        { en: 'See you later', id: 'Sampai jumpa' },
    ]},
    { id: 2, emoji: '👨‍👩‍👧', title: 'Keluarga', phrases: [
        { en: 'My mother is kind', id: 'Ibu saya baik' },
        { en: 'I love my family', id: 'Saya cinta keluarga saya' },
        { en: 'He is my brother', id: 'Dia saudara saya' },
        { en: 'We are happy', id: 'Kami senang' },
        { en: 'This is my father', id: 'Ini ayah saya' },
    ]},
    { id: 3, emoji: '🍜', title: 'Makanan', phrases: [
        { en: 'I want to eat', id: 'Saya mau makan' },
        { en: 'The food is delicious', id: 'Makanannya enak' },
        { en: 'I drink water', id: 'Saya minum air' },
        { en: 'I am hungry', id: 'Saya lapar' },
        { en: 'Rice is cheap', id: 'Nasi itu murah' },
    ]},
    { id: 4, emoji: '🏫', title: 'Sekolah', phrases: [
        { en: 'I go to school', id: 'Saya pergi ke sekolah' },
        { en: 'She is a teacher', id: 'Dia seorang guru' },
        { en: 'I read a book', id: 'Saya membaca buku' },
        { en: 'We study English', id: 'Kami belajar bahasa Inggris' },
        { en: 'The lesson is easy', id: 'Pelajarannya mudah' },
    ]},
    { id: 5, emoji: '🛒', title: 'Belanja', phrases: [
        { en: 'How much is this', id: 'Berapa harga ini' },
        { en: 'It is too expensive', id: 'Ini terlalu mahal' },
        { en: 'I want to buy it', id: 'Saya mau membelinya' },
        { en: 'Do you have money', id: 'Apakah kamu punya uang' },
        { en: 'The shop is open', id: 'Tokonya buka' },
    ]},
];

// Extra distractor words for sentence-building tiles
const EXTRA_WORDS = ['you', 'they', 'big', 'red', 'now', 'here', 'good', 'day', 'very', 'and', 'the', 'with'];

const HEARTS_MAX = 5;
const EX_PER_LESSON = 6;

const sessions = new Map(); // `${guildId}_${userId}` -> session

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

// ==================== EXERCISE GENERATION ====================
function makeMC(unit) {
    const correct = unit.phrases[Math.floor(Math.random() * unit.phrases.length)];
    const enToId = Math.random() < 0.5;
    const distract = shuffle(unit.phrases.filter(p => p.en !== correct.en)).slice(0, 3);
    const pool = shuffle([correct, ...distract]);
    if (enToId) {
        return { type: 'mc', prompt: `Apa arti dari:\n**"${correct.en}"**`, options: pool.map(p => p.id), correctIndex: pool.findIndex(p => p.en === correct.en) };
    }
    return { type: 'mc', prompt: `Terjemahkan ke Inggris:\n**"${correct.id}"**`, options: pool.map(p => p.en), correctIndex: pool.findIndex(p => p.en === correct.en) };
}

function makeArrange(unit) {
    const phrase = unit.phrases[Math.floor(Math.random() * unit.phrases.length)];
    const correctWords = phrase.en.split(' ');
    const extras = shuffle(EXTRA_WORDS).slice(0, Math.min(2, Math.max(1, 8 - correctWords.length)));
    const tiles = shuffle([...correctWords, ...extras]).map(w => ({ word: w, used: false }));
    return { type: 'arrange', promptId: phrase.id, correctWords, tiles, built: [] };
}

function buildLesson(unit) {
    const ex = [];
    for (let i = 0; i < EX_PER_LESSON; i++) {
        ex.push(Math.random() < 0.5 ? makeMC(unit) : makeArrange(unit));
    }
    return ex;
}

// ==================== RENDER ====================
const LBL = ['🇦', '🇧', '🇨', '🇩'];

function heartsBar(h) {
    return '❤️'.repeat(h) + '🤍'.repeat(HEARTS_MAX - h);
}

function renderExercise(session, userId, feedback = '') {
    const ex = session.exercises[session.current];
    const head = `${heartsBar(session.hearts)}  •  Soal ${session.current + 1}/${session.exercises.length}`;

    if (ex.type === 'mc') {
        const embed = new EmbedBuilder()
            .setColor('#58CC02')
            .setTitle('🇬🇧 Pilih Jawaban')
            .setDescription((feedback ? feedback + '\n━━━━━━━━━━\n' : '') + `${ex.prompt}\n\n` + ex.options.map((o, i) => `${LBL[i]} **${o}**`).join('\n'))
            .setFooter({ text: head });
        const row = new ActionRowBuilder().addComponents(
            ex.options.map((_, i) => new ButtonBuilder().setCustomId(`belajar_ans_${i}_${userId}`).setLabel(LBL[i]).setStyle(ButtonStyle.Primary))
        );
        return { embeds: [embed], components: [row] };
    }

    // arrange
    const builtWords = ex.built.map(i => ex.tiles[i].word);
    const builtLine = builtWords.length ? builtWords.join(' ') : '_( ketuk kata di bawah )_';
    const embed = new EmbedBuilder()
        .setColor('#58CC02')
        .setTitle('🧩 Susun Kalimat')
        .setDescription((feedback ? feedback + '\n━━━━━━━━━━\n' : '') + `Susun terjemahan Inggris dari:\n**"${ex.promptId}"**\n\n📝 **Jawabanmu:** ${builtLine}`)
        .setFooter({ text: head });

    const components = [];
    let row = new ActionRowBuilder();
    let count = 0;
    ex.tiles.forEach((t, i) => {
        if (t.used) return;
        if (count > 0 && count % 5 === 0) { components.push(row); row = new ActionRowBuilder(); }
        row.addComponents(new ButtonBuilder().setCustomId(`belajar_tile_${i}_${userId}`).setLabel(t.word).setStyle(ButtonStyle.Secondary));
        count++;
    });
    if (row.components.length) components.push(row);
    // control row
    components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`belajar_undo_${userId}`).setLabel('↩️ Hapus').setStyle(ButtonStyle.Danger).setDisabled(ex.built.length === 0),
        new ButtonBuilder().setCustomId(`belajar_check_${userId}`).setLabel('✅ Cek').setStyle(ButtonStyle.Success).setDisabled(ex.built.length === 0),
    ));
    return { embeds: [embed], components: components.slice(0, 5) };
}

// ==================== PANELS ====================
function buildPathPanel(guildId, userId) {
    const prog = getProgress(guildId, userId);
    const maxUnlocked = prog.maxUnit + 1; // next unit unlocked
    const lines = UNITS.map(u => {
        const done = u.id <= prog.maxUnit;
        const unlocked = u.id <= maxUnlocked;
        const status = done ? '✅' : unlocked ? '▶️' : '🔒';
        return `${status} **Unit ${u.id}** ${u.emoji} ${u.title}${done ? ' *(selesai)*' : unlocked ? '' : ' *(terkunci)*'}`;
    });
    const embed = new EmbedBuilder()
        .setColor('#1CB0F6')
        .setTitle('📚 Belajar Bahasa Inggris')
        .setDescription(`Total XP: ⭐ **${prog.xp}**\n\n${lines.join('\n')}\n\n-# Selesaikan unit untuk membuka unit berikutnya. Jawaban benar = XP + Money!`)
        .setFooter({ text: 'Pilih unit yang terbuka untuk mulai belajar' });

    const row = new ActionRowBuilder();
    let added = 0;
    for (const u of UNITS) {
        const unlocked = u.id <= maxUnlocked;
        if (added < 5) {
            row.addComponents(new ButtonBuilder()
                .setCustomId(`belajar_unit_${u.id}_${userId}`)
                .setLabel(`Unit ${u.id}`)
                .setEmoji(u.id <= prog.maxUnit ? '✅' : (unlocked ? '▶️' : '🔒'))
                .setStyle(unlocked ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setDisabled(!unlocked));
            added++;
        }
    }
    return { embeds: [embed], components: [row] };
}

// ==================== HANDLERS ====================
async function handleBelajarCommand(interaction) {
    return interaction.reply(buildPathPanel(interaction.guild.id, interaction.user.id));
}

function finishLesson(interaction, session, ownerId, guildId, success) {
    sessions.delete(`${guildId}_${ownerId}`);
    if (success) {
        const prog = getProgress(guildId, ownerId);
        const newMax = Math.max(prog.maxUnit, session.unitId);
        const xpGain = session.correct * 10;
        const moneyGain = session.correct * 100;
        setProgress(guildId, ownerId, newMax, prog.xp + xpGain);
        try {
            const u = getOrCreateUser(guildId, ownerId);
            u.balance += moneyGain;
            db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(u.balance, guildId, ownerId);
            incrementUserStat(guildId, ownerId, 'belajar_correct', session.correct);
        } catch (_) {}
        const unlocked = newMax + 1 <= UNITS.length && newMax === session.unitId && session.unitId > prog.maxUnit;
        const embed = new EmbedBuilder()
            .setColor('#58CC02')
            .setTitle('🎉 Lesson Selesai!')
            .setDescription(
                `Kamu menyelesaikan **Unit ${session.unitId}**!\n\n` +
                `✅ Benar: **${session.correct}/${session.exercises.length}**\n` +
                `⭐ XP: **+${xpGain}**  •  🪙 Money: **+${moneyGain.toLocaleString('id-ID')}**` +
                (unlocked ? `\n\n🔓 **Unit ${newMax + 1} terbuka!**` : '')
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`belajar_path_${ownerId}`).setLabel('📚 Jalur Belajar').setStyle(ButtonStyle.Primary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }
    // failed (out of hearts)
    const embed = new EmbedBuilder()
        .setColor('#FF4B4B')
        .setTitle('💔 Nyawa Habis!')
        .setDescription(`Kamu kehabisan nyawa di **Unit ${session.unitId}**.\nBenar: ${session.correct}/${session.exercises.length}\n\nCoba lagi ya, kamu pasti bisa! 💪`);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`belajar_unit_${session.unitId}_${ownerId}`).setLabel('🔁 Ulangi').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`belajar_path_${ownerId}`).setLabel('📚 Menu').setStyle(ButtonStyle.Secondary)
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

    // Back to path
    if (customId.startsWith('belajar_path_')) {
        return interaction.update(buildPathPanel(guildId, ownerId));
    }

    // Start unit lesson
    if (customId.startsWith('belajar_unit_')) {
        const unitId = parseInt(parts[2]);
        const unit = UNITS.find(u => u.id === unitId);
        if (!unit) return interaction.reply({ content: '❌ Unit tidak ditemukan.', ephemeral: true });
        const prog = getProgress(guildId, ownerId);
        if (unitId > prog.maxUnit + 1) return interaction.reply({ content: '🔒 Unit ini masih terkunci. Selesaikan unit sebelumnya dulu!', ephemeral: true });
        const session = { unitId, exercises: buildLesson(unit), current: 0, hearts: HEARTS_MAX, correct: 0 };
        sessions.set(`${guildId}_${ownerId}`, session);
        return interaction.update(renderExercise(session, ownerId));
    }

    const session = sessions.get(`${guildId}_${ownerId}`);
    if (!session) {
        return interaction.update({ content: '⚠️ Sesi sudah berakhir. Ketik `/belajar` untuk mulai lagi.', embeds: [], components: [] });
    }
    const ex = session.exercises[session.current];

    // MC answer
    if (customId.startsWith('belajar_ans_')) {
        const chosen = parseInt(parts[2]);
        const correct = chosen === ex.correctIndex;
        let fb;
        if (correct) { session.correct++; fb = `✅ **Benar!** ${ex.options[ex.correctIndex]}`; }
        else { session.hearts--; fb = `❌ **Salah!** Jawaban: **${ex.options[ex.correctIndex]}**`; }
        return advance(interaction, session, ownerId, guildId, fb);
    }

    // Arrange: tap tile
    if (customId.startsWith('belajar_tile_')) {
        const idx = parseInt(parts[2]);
        if (ex.type === 'arrange' && ex.tiles[idx] && !ex.tiles[idx].used) {
            ex.tiles[idx].used = true;
            ex.built.push(idx);
        }
        return interaction.update(renderExercise(session, ownerId));
    }
    // Arrange: undo
    if (customId.startsWith('belajar_undo_')) {
        if (ex.type === 'arrange' && ex.built.length) {
            const last = ex.built.pop();
            ex.tiles[last].used = false;
        }
        return interaction.update(renderExercise(session, ownerId));
    }
    // Arrange: check
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

function isBelajarButton(customId) {
    return typeof customId === 'string' && customId.startsWith('belajar_');
}

module.exports = { handleBelajarCommand, handleBelajarButton, isBelajarButton, UNITS };
