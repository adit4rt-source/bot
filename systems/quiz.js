// systems/quiz.js — Quiz/Puzzle Game System (pitucode.com Puzzle API)
//
// Provides /games command: fetch a random puzzle from pitucode API, user must
// answer correctly within time limit to win money reward.
//
// API: GET https://api.pitucode.com/puzzle/<category>?apikey=<key>
// Response varies per category but generally: { soal, jawaban } or similar.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, incrementUserStat } = require('../database');
const { getRandomInt } = require('../utils');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

// ==================== CONFIG ====================
const API_BASE = 'https://api.pitucode.com/puzzle';
const API_KEY = process.env.PITUCODE_API_KEY || '';

const ANSWER_TIMEOUT = 60_000; // 60 seconds to answer
const REWARD_MIN = 500;
const REWARD_MAX = 2000;

// ==================== CATEGORIES ====================
const CATEGORIES = {
    siapakahaku:      { name: 'Siapakah Aku',    emoji: '🤔', desc: 'Tebak siapa dari deskripsi' },
    asahotak:         { name: 'Asah Otak',       emoji: '🧠', desc: 'Pertanyaan asah otak' },
    susunkata:        { name: 'Susun Kata',      emoji: '🔤', desc: 'Susun huruf jadi kata yang benar' },
    tebakgambar:      { name: 'Tebak Gambar',    emoji: '🖼️', desc: 'Tebak dari gambar/emoji' },
    tebakkabupaten:   { name: 'Tebak Kabupaten', emoji: '🗺️', desc: 'Tebak kabupaten Indonesia' },
    caklontong:       { name: 'Cak Lontong',     emoji: '😂', desc: 'Pertanyaan humor ala Cak Lontong' },
    tebakkalimat:     { name: 'Tebak Kalimat',   emoji: '📝', desc: 'Lengkapi kalimat yang hilang' },
    tebakkata:        { name: 'Tebak Kata',      emoji: '💬', desc: 'Tebak kata dari petunjuk' },
    tebakkimia:       { name: 'Tebak Kimia',     emoji: '⚗️', desc: 'Tebak unsur/senyawa kimia' },
    tebaklagu:        { name: 'Tebak Lagu',      emoji: '🎵', desc: 'Tebak judul lagu dari lirik' },
    tebaklirik:       { name: 'Tebak Lirik',     emoji: '🎤', desc: 'Lanjutkan lirik lagu' },
    tebaktebakan:     { name: 'Tebak-Tebakan',   emoji: '❓', desc: 'Tebak-tebakan lucu' },
    tekateki:         { name: 'Teka-Teki',       emoji: '🧩', desc: 'Teka-teki logika' },
    truth:            { name: 'Truth',           emoji: '🤫', desc: 'Pertanyaan truth (game)' },
};

// Active games per channel (channelId → game data)
const _activeGames = new Map();

// ==================== API FETCHER ====================
async function fetchPuzzle(category) {
    if (!API_KEY) {
        log('WARN', '[quiz] PITUCODE_API_KEY belum diset di env!');
        return null;
    }

    const url = `${API_BASE}/${category}?apikey=${encodeURIComponent(API_KEY)}`;

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(url, {
            headers: { 'User-Agent': UA, Accept: 'application/json' },
            signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
            log('WARN', `[quiz] API HTTP ${res.status} untuk kategori "${category}"`);
            return null;
        }

        const raw = await res.text();
        let json;
        try { json = JSON.parse(raw); } catch (_) {
            log('WARN', `[quiz] Response bukan JSON: ${raw.slice(0, 200)}`);
            return null;
        }

        // Parse puzzle data — pitucode returns various formats
        // Common patterns: { result: { soal, jawaban } } or { result: "string" (truth) }
        const data = json.result || json.data || json;

        // Handle truth/dare where result is just a string (no soal/jawaban)
        if (typeof data === 'string') {
            // Truth/dare — no answer needed, just display
            return { question: data, answer: null, image: null, noAnswer: true };
        }

        let question = data.soal || data.pertanyaan || data.question || data.deskripsi || data.clue || null;
        let answer = data.jawaban || data.answer || data.jawab || null;
        let image = data.gambar || data.image || data.img || null;
        let hint = data.tipe || data.hint || null;

        if (!question && !image) {
            log('WARN', `[quiz] Tidak bisa extract soal dari: ${JSON.stringify(json).slice(0, 300)}`);
            return null;
        }
        if (!answer) {
            log('WARN', `[quiz] Tidak ada jawaban di response: ${JSON.stringify(json).slice(0, 300)}`);
            return null;
        }

        return {
            question: question ? String(question).trim() : null,
            answer: String(answer).trim(),
            image: image || null,
            hint: hint || null,
        };
    } catch (e) {
        log('WARN', `[quiz] fetchPuzzle error: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
        return null;
    }
}

// ==================== GAME LOGIC ====================
function buildQuizEmbed(puzzle, category, reward) {
    const cat = CATEGORIES[category] || { name: category, emoji: '🎮' };
    const embed = new EmbedBuilder()
        .setTitle(`${cat.emoji} ${cat.name}`)
        .setColor('#5865F2')
        .setTimestamp();

    // Truth: no answer needed, just display the prompt
    if (puzzle.noAnswer) {
        embed.setDescription(`**${puzzle.question}**`);
        embed.setFooter({ text: 'Truth — tidak perlu dijawab' });
        return embed;
    }

    let desc = '';
    if (puzzle.question) desc += `**${puzzle.question}**\n`;
    if (puzzle.hint) desc += `\n💡 Hint: *${puzzle.hint}*\n`;
    desc += `\n🪙 **Hadiah: ${reward.toLocaleString('id-ID')} Money**`;
    desc += `\n⏱️ Waktu: **60 detik**`;
    desc += `\n\n-# Ketik jawabanmu langsung di chat!`;

    embed.setDescription(desc);
    if (puzzle.image) embed.setImage(puzzle.image);
    embed.setFooter({ text: `${cat.name} • Siapa cepat dia dapat!` });

    return embed;
}

// ==================== COMMAND HANDLER ====================
async function handleGamesCommand(interaction) {
    const category = interaction.options?.getString('kategori') || 'tekateki';
    const channelId = interaction.channelId;
    const guildId = interaction.guild.id;

    if (!API_KEY) {
        return interaction.reply({
            content: '⚠️ Game belum dikonfigurasi (admin perlu set `PITUCODE_API_KEY` di .env).',
            ephemeral: true,
        });
    }

    if (!CATEGORIES[category]) {
        return interaction.reply({
            content: `❌ Kategori tidak valid! Pilih salah satu:\n${Object.entries(CATEGORIES).map(([k, v]) => `${v.emoji} \`${k}\` — ${v.desc}`).join('\n')}`,
            ephemeral: true,
        });
    }

    // Check if there's already an active game in this channel
    if (_activeGames.has(channelId)) {
        return interaction.reply({
            content: '⚠️ Masih ada quiz aktif di channel ini! Jawab dulu atau tunggu timeout.',
            ephemeral: true,
        });
    }

    await interaction.deferReply();

    const puzzle = await fetchPuzzle(category);
    if (!puzzle) {
        return interaction.editReply({
            content: '⚠️ Gagal mengambil soal. Coba lagi nanti!',
        });
    }

    const reward = getRandomInt(REWARD_MIN, REWARD_MAX);
    const embed = buildQuizEmbed(puzzle, category, reward);

    // Truth: just display, no game timer needed
    if (puzzle.noAnswer) {
        return interaction.editReply({ embeds: [embed] });
    }

    await interaction.editReply({ embeds: [embed] });

    // Register the active game
    const game = {
        category,
        answer: puzzle.answer.toLowerCase(),
        reward,
        guildId,
        channelId,
        startedBy: interaction.user.id,
        startedAt: Date.now(),
        timer: null,
    };

    // Timeout — auto-end if nobody answers
    game.timer = setTimeout(() => {
        if (_activeGames.has(channelId)) {
            _activeGames.delete(channelId);
            const timeoutEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('⏰ Waktu Habis!')
                .setDescription(`Tidak ada yang menjawab!\n\n**Jawaban:** \`${puzzle.answer}\``)
                .setFooter({ text: 'Gunakan /games untuk main lagi!' });
            interaction.channel.send({ embeds: [timeoutEmbed] }).catch(() => {});
        }
    }, ANSWER_TIMEOUT);

    _activeGames.set(channelId, game);
}

// ==================== MESSAGE HANDLER (check answers) ====================
// Called from messageCreate event for every message in guild channels.
function checkQuizAnswer(message) {
    const channelId = message.channel.id;
    const game = _activeGames.get(channelId);
    if (!game) return false;

    const content = (message.content || '').trim().toLowerCase();
    if (!content) return false;

    // Check if the answer matches (case-insensitive, trimmed)
    // Support partial match for longer answers (contains check)
    const isCorrect = content === game.answer ||
        (game.answer.length > 3 && content.includes(game.answer)) ||
        (game.answer.length > 3 && game.answer.includes(content) && content.length >= game.answer.length * 0.7);

    if (!isCorrect) return false;

    // Correct answer!
    clearTimeout(game.timer);
    _activeGames.delete(channelId);

    const guildId = game.guildId;
    const userId = message.author.id;

    // Give reward
    const userData = getOrCreateUser(guildId, userId);
    userData.balance += game.reward;
    db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?')
        .run(userData.balance, guildId, userId);
    incrementUserStat(guildId, userId, 'quiz_wins');

    const cat = CATEGORIES[game.category] || { emoji: '🎮', name: game.category };
    const winEmbed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`${cat.emoji} Benar!`)
        .setDescription(
            `🎉 <@${userId}> menjawab dengan benar!\n\n` +
            `**Jawaban:** \`${game.answer}\`\n` +
            `**Hadiah:** 🪙 **${game.reward.toLocaleString('id-ID')} Money**`
        )
        .setFooter({ text: 'Gunakan /games untuk main lagi!' })
        .setTimestamp();

    message.channel.send({ embeds: [winEmbed] }).catch(() => {});
    return true;
}

// ==================== BUTTON HANDLER (categories) ====================
async function handleGamesButton(interaction) {
    const customId = interaction.customId;

    if (customId === 'games_categories') {
        const list = Object.entries(CATEGORIES)
            .map(([key, cat]) => `${cat.emoji} **${cat.name}** — \`/games ${key}\`\n> ${cat.desc}`)
            .join('\n\n');

        const embed = new EmbedBuilder()
            .setTitle('🎮 Kategori Quiz')
            .setColor('#5865F2')
            .setDescription(list + '\n\n-# Jawab benar = dapet 🪙 1.500 - 4.000 Money!')
            .setFooter({ text: 'Ketik /games <kategori> untuk mulai' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

function isGamesButton(customId) {
    return typeof customId === 'string' && customId.startsWith('games_');
}

// ==================== EXPORTS ====================
module.exports = {
    CATEGORIES,
    fetchPuzzle,
    handleGamesCommand,
    handleGamesButton,
    isGamesButton,
    checkQuizAnswer,
    _activeGames,
};
