// events/messageCreate.js - Message event handler
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getConf, getSetting, incrementUserStat, addItem } = require('../database');
const { FARM_CROPS, FARM_FERTILIZERS } = require('../data/farming');
const { checkAchievements } = require('../systems/achievements');
const { checkAndUpdateStreak, addXpAndMoney } = require('../systems/activity');
const { addPetExp } = require('../systems/pets');
const { getRandomInt, shuffleString } = require('../utils');
const state = require('../state');

const MINI_EVENT_TARGET = 30;
const FISH_EVENT_TARGET = 100;
const ANTISPAM_DUP_WINDOW = 60000; // ms — an identical message repeated within this window earns nothing
const poolAcakKata = ["DISCORD", "KOMPUTER", "INTERNET", "PROGRAMMER", "INDONESIA", "KEYBOARD", "LAPTOP", "MONITOR", "EKONOMI", "SERVER", "DATABASE", "JAVASCRIPT", "DEVELOPER", "APLIKASI", "INTERAKSI", "KOMUNITAS", "GAMER", "STREAMING", "MODERATOR", "ADMINISTRATOR", "HADIAH", "VOUCHER", "DOMPET", "SAHABAT", "KONTRIBUTOR"];
const poolTrivia = [
    { q: 'Ibu kota Indonesia?', a: 'jakarta' },
    { q: 'Planet terdekat dengan Matahari?', a: 'merkurius' },
    { q: 'Hewan tercepat di darat?', a: 'cheetah' },
    { q: 'Berapa jumlah benua di dunia?', a: '7' },
    { q: 'Gas yang dihirup manusia untuk bernapas?', a: 'oksigen' },
    { q: 'Hewan berkantung khas Australia?', a: 'kanguru' },
    { q: 'Satuan mata uang Jepang?', a: 'yen' },
    { q: 'Berapa sisi pada bangun segitiga?', a: '3' },
    { q: 'Planet terbesar di tata surya?', a: 'jupiter' },
    { q: 'Laut terluas di dunia? (Samudra ...)', a: 'pasifik' },
    { q: 'Logam apa yang cair pada suhu ruang?', a: 'merkuri' },
    { q: 'Berapa hasil 12 x 12?', a: '144' },
];
const poolRiddle = [
    { q: 'Aku punya kota tapi tanpa rumah, punya gunung tanpa pohon, punya air tanpa ikan. Apakah aku?', a: 'peta' },
    { q: 'Semakin banyak diambil, semakin besar aku. Apakah aku?', a: 'lubang' },
    { q: 'Aku selalu datang tapi tak pernah tiba. Apakah aku?', a: 'besok' },
    { q: 'Punya leher tapi tak punya kepala. Apakah aku?', a: 'botol' },
    { q: 'Apa yang basah justru saat mengeringkan?', a: 'handuk' },
    { q: 'Makin dipotong makin panjang. Apakah aku?', a: 'celana' },
];
const poolFastType = [
    'siapa cepat dia dapat',
    'rajin pangkal pandai',
    'bersatu kita teguh bercerai kita runtuh',
    'semangat pagi semuanya',
    'jangan lupa bahagia hari ini',
    'gas terus jangan kasih kendor',
];

// Returns true if a message should NOT earn rewards (XP/money/quest/chat-count/
// mini-event progress). Blocks single-char spam, repeated-character spam ("kkkkk"),
// and rapid exact duplicates. Notifications & streak are unaffected.
function isSpamMessage(guildId, message) {
    const raw = (message.content || '').trim();
    if (raw.length < 2) return true;
    const compact = raw.replace(/\s+/g, '');
    if (compact.length >= 4 && /^(.)\1+$/.test(compact)) return true; // "aaaa", "kkkkk", "...."
    const key = `${guildId}_${message.author.id}`;
    const norm = raw.toLowerCase();
    const now = Date.now();
    const prev = state.lastChatMessages.get(key);
    state.lastChatMessages.set(key, { content: norm, ts: now });
    if (prev && prev.content === norm && (now - prev.ts) < ANTISPAM_DUP_WINDOW) return true;
    return false;
}

module.exports = async function handleMessageCreate(message) {
    if (message.author.bot || !message.guild) return;

    // Single-Guild Lockdown: Bot hanya aktif di server utama ID COMMUNITY
    if (process.env.NODE_ENV !== 'test') {
        const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID || '1056412836433240074';
        const isMainGuild = message.guild.id === MAIN_GUILD_ID || (message.guild.name && message.guild.name.toUpperCase().includes('ID COMMUNITY'));
        if (!isMainGuild) {
            if (typeof message.guild.leave === 'function') {
                message.guild.leave().catch(() => {});
            }
            return;
        }
    }

    // Anti-abuse captcha: check if this message is a captcha answer
    const { verifyCaptchaMessage } = require('../systems/captcha');
    if (verifyCaptchaMessage(message)) return; // consumed as captcha answer, don't process further
    const guildId = message.guild.id;

    // === MAINTENANCE MODE === hanya Streak yang jalan; fitur chat lain dimatikan sementara.
    const { isMaintenance } = require('../systems/maintenance');
    if (isMaintenance()) {
        const streakActivated = await checkAndUpdateStreak(message);
        if (streakActivated) message.reply({ content: `🔥 **Berhasil!** Kamu telah mengaktifkan streak api hari ini!\n*(Bot sedang perbaikan — fitur lain sementara nonaktif)*` }).then(msg => { setTimeout(() => msg.delete().catch(() => {}), 6000); }).catch(() => {});
        return;
    }

    // === QUIZ ANSWER CHECK ===
    // Check if message is an answer to an active /games quiz in this channel.
    const { checkQuizAnswer } = require('../systems/quiz');
    if (checkQuizAnswer(message)) return; // answered correctly, stop further processing

    // Mini-event answer handling
    if (state.activeMiniEvents.has(guildId)) {
        const game = state.activeMiniEvents.get(guildId);
        if (message.channel.id === game.channelId && game.type !== 'airdrop') {
            let won = false;
            const content = (message.content || '').trim();
            if (game.type === 'guess') {
                const guess = parseInt(content);
                if (!isNaN(guess)) {
                    if (guess === game.answer) won = true;
                    else if (guess < game.answer) message.react('⬆️').catch(() => {});
                    else message.react('⬇️').catch(() => {});
                }
            } else if (game.match === 'num') { if (content === String(game.answer)) won = true; }
            else if (game.match === 'upper') { if (content && content.toUpperCase() === String(game.answer).toUpperCase()) won = true; }
            else if (game.match === 'exact') { if (content && content.toLowerCase() === String(game.answer).toLowerCase()) won = true; }
            else if (game.match === 'includes') { if (content && content.toLowerCase().includes(String(game.answer).toLowerCase())) won = true; }
            if (won) {
                clearTimeout(game.timer); state.activeMiniEvents.delete(guildId);
                const reward = getRandomInt(game.rewardMin, game.rewardMax);
                const userData = getOrCreateUser(guildId, message.author.id); userData.balance += reward;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, message.author.id);
                incrementUserStat(guildId, message.author.id, 'event_wins');
                await checkAchievements(message.guild, message.author.id, { type: 'event_win' });
                return message.reply(`${game.winPrefix} <@${message.author.id}> ${game.winVerb} **${game.display}**!\n🎁 Mendapatkan 🪙 **${reward.toLocaleString('id-ID')} Money**!`);
            }
        }
    }

    // Anti-spam gate: low-effort/duplicate messages earn nothing (XP, quests, chat
    // count, mini-event progress). Computed once; notifications & streak still run.
    const spam = isSpamMessage(guildId, message);


    // Spawn mini-event
    if (!spam && !state.activeMiniEvents.has(guildId)) {
        let count = state.guildMessageCounters.get(guildId) || 0; count++;
        if (count >= MINI_EVENT_TARGET) {
            state.guildMessageCounters.set(guildId, 0);
            const eventTypes = ['word', 'math', 'guess', 'airdrop', 'trivia', 'reverse', 'fasttype', 'riddle', 'sequence'], chosenEvent = eventTypes[Math.floor(Math.random() * eventTypes.length)];
            let embedEvent = new EmbedBuilder().setColor('#9B59B6'), eventData = { channelId: message.channel.id };
            if (chosenEvent === 'word') {
                const answer = poolAcakKata[Math.floor(Math.random() * poolAcakKata.length)]; let scrambledText = shuffleString(answer); while (scrambledText === answer) scrambledText = shuffleString(answer);
                embedEvent.setTitle('✨ KUIS ACAK KATA MUNCUL!').setDescription(`Siapa cepat dia dapat! Susun huruf ini menjadi sebuah kata:\n\n🔠 **\` ${scrambledText.split('').join(' - ')} \`**\n\n*Ketik jawabanmu langsung di chat ini! (60 Detik)*`); eventData = { ...eventData, type: 'word', answer, match: 'upper', rewardMin: 1500, rewardMax: 3000, winPrefix: '🎉 **BENAR SEKALI!**', winVerb: 'menyusun kata', display: answer };
            } else if (chosenEvent === 'math') {
                const ops = ['+', '-', '*'], op = ops[Math.floor(Math.random() * ops.length)]; let a, b, answer;
                if (op === '+') { a = getRandomInt(10, 60); b = getRandomInt(10, 60); answer = a + b; } else if (op === '-') { a = getRandomInt(30, 90); b = getRandomInt(1, 29); answer = a - b; } else { a = getRandomInt(2, 12); b = getRandomInt(2, 12); answer = a * b; }
                embedEvent.setTitle('🧮 KUIS MATEMATIKA KILAT!').setDescription(`Ayo hitung cepat! Berapa hasil dari:\n\n🔢 **\` ${a} ${op} ${b} = ? \`**\n\n*Ketik angka jawabanmu langsung di chat ini! (60 Detik)*`); eventData = { ...eventData, type: 'math', answer, match: 'num', rewardMin: 1200, rewardMax: 2500, winPrefix: '🎉 **MATEMATIKA KILAT!**', winVerb: 'menjawab', display: answer };
            } else if (chosenEvent === 'guess') {
                const answer = getRandomInt(1, 100); embedEvent.setTitle('🎯 KUIS TEBAK ANGKA!').setDescription(`Bot telah memikirkan sebuah angka dari **1 sampai 100**.\n\nTebak angkanya di chat ini!\n⬆️ Jika terlalu kecil\n⬇️ Jika terlalu besar\n\n*(Waktu: 60 Detik)*`); eventData = { ...eventData, type: 'guess', answer, rewardMin: 2000, rewardMax: 4000, winPrefix: '🎯 **TEBAKAN TEPAT!**', winVerb: 'menebak angka', display: answer };
            } else if (chosenEvent === 'trivia') {
                const t = poolTrivia[Math.floor(Math.random() * poolTrivia.length)];
                embedEvent.setColor('#3498DB').setTitle('🧠 KUIS TRIVIA!').setDescription(`Jawab pertanyaan ini secepatnya:\n\n❓ **${t.q}**\n\n*Ketik jawabanmu langsung di chat ini! (60 Detik)*`); eventData = { ...eventData, type: 'trivia', answer: t.a, match: 'includes', rewardMin: 1800, rewardMax: 3500, winPrefix: '🧠 **JENIUS!**', winVerb: 'menjawab', display: t.a };
            } else if (chosenEvent === 'reverse') {
                const w = poolAcakKata[Math.floor(Math.random() * poolAcakKata.length)]; const rev = w.split('').reverse().join('');
                embedEvent.setColor('#1ABC9C').setTitle('🔁 KUIS BALIK KATA!').setDescription(`Ketik kata ini secara **TERBALIK**:\n\n🔠 **\` ${w} \`**\n\n*Contoh: ABC → CBA. Ketik jawabanmu di chat! (60 Detik)*`); eventData = { ...eventData, type: 'reverse', answer: rev, match: 'upper', rewardMin: 1500, rewardMax: 3000, winPrefix: '🔁 **TEPAT!**', winVerb: 'membalik kata jadi', display: rev };
            } else if (chosenEvent === 'fasttype') {
                const phrase = poolFastType[Math.floor(Math.random() * poolFastType.length)];
                embedEvent.setColor('#E91E63').setTitle('⌨️ KETIK CEPAT!').setDescription(`Orang **pertama** yang mengetik kalimat ini **PERSIS** menang:\n\n💬 **${phrase}**\n\n*Ketik langsung di chat ini! (60 Detik)*`); eventData = { ...eventData, type: 'fasttype', answer: phrase, match: 'exact', rewardMin: 1500, rewardMax: 3000, winPrefix: '⌨️ **SUPER CEPAT!**', winVerb: 'mengetik', display: phrase };
            } else if (chosenEvent === 'riddle') {
                const r = poolRiddle[Math.floor(Math.random() * poolRiddle.length)];
                embedEvent.setColor('#8E44AD').setTitle('🤔 TEKA-TEKI!').setDescription(`Pecahkan teka-teki berikut:\n\n❓ *${r.q}*\n\n*Ketik jawabanmu langsung di chat ini! (60 Detik)*`); eventData = { ...eventData, type: 'riddle', answer: r.a, match: 'includes', rewardMin: 2000, rewardMax: 3800, winPrefix: '🤔 **CERDAS!**', winVerb: 'memecahkan teka-teki', display: r.a };
            } else if (chosenEvent === 'sequence') {
                const start = getRandomInt(1, 9), step = getRandomInt(2, 9); const seq = [start, start + step, start + 2 * step, start + 3 * step]; const answer = start + 4 * step;
                embedEvent.setColor('#F39C12').setTitle('🔢 LANJUTKAN DERET ANGKA!').setDescription(`Tentukan angka berikutnya dalam deret ini:\n\n🔢 **\` ${seq.join(', ')}, ... ? \`**\n\n*Ketik angka jawabanmu langsung di chat ini! (60 Detik)*`); eventData = { ...eventData, type: 'sequence', answer, match: 'num', rewardMin: 1800, rewardMax: 3500, winPrefix: '🔢 **TEPAT!**', winVerb: 'melanjutkan deret ke', display: answer };
            } else if (chosenEvent === 'airdrop') {
                embedEvent.setTitle('📦 AIR DROP JATUH!').setColor('#E67E22').setDescription(`Peti harta karun jatuh di channel ini!\nSiapa cepat dia dapat, segera klik tombol di bawah untuk klaim!`); eventData.type = 'airdrop';
            }
            const messageOptions = { embeds: [embedEvent] };
            if (chosenEvent === 'airdrop') { const claimBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('airdrop_claim').setLabel('🎁 Ambil Hadiah').setStyle(ButtonStyle.Success)); messageOptions.components = [claimBtn]; }
            message.channel.send(messageOptions).then(sentMsg => {
                eventData.timer = setTimeout(() => { if (state.activeMiniEvents.has(guildId)) { state.activeMiniEvents.delete(guildId); if (chosenEvent === 'airdrop') { const disabledBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('airdrop_expired').setLabel('Kedaluwarsa').setStyle(ButtonStyle.Secondary).setDisabled(true)); sentMsg.edit({ components: [disabledBtn] }).catch(()=>{}); } else sentMsg.channel.send(`⏰ **WAKTU HABIS!** Jawaban: **${eventData.display}**.`); } }, 60000);
                state.activeMiniEvents.set(guildId, eventData);
            });
        } else state.guildMessageCounters.set(guildId, count);
    }

    // === AFK SYSTEM (check mentions + remove on chat) ===
    try {
        const { handleAfkMessage } = require('../systems/afk');
        await handleAfkMessage(message);
    } catch (_) {}

    // Streak
    const streakActivated = await checkAndUpdateStreak(message);
    if (streakActivated) message.reply({ content: `🔥 **Berhasil!** Kamu telah mengaktifkan streak api hari ini!` }).then(msg => { setTimeout(() => msg.delete().catch(() => {}), 5000); }).catch(() => {});

    // Chat rewards — skipped entirely for spam messages
    if (!spam) {
        incrementUserStat(guildId, message.author.id, 'total_chats');
        await checkAchievements(message.guild, message.author.id, { type: 'chat' });

        // Chat XP/Money cooldown
        const cdKey = `${guildId}_${message.author.id}`;
        if (!state.chatCooldowns.has(cdKey)) {
            await addXpAndMoney(message.member, 'chat');
            state.chatCooldowns.add(cdKey);
            setTimeout(() => state.chatCooldowns.delete(cdKey), getConf(guildId, 'chat_cooldown', 60) * 1000);
        }
    }
};


// Exposed for unit tests (anti-spam guard).
module.exports.isSpamMessage = isSpamMessage;
