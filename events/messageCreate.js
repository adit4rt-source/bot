// events/messageCreate.js - Message event handler
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getConf, getSetting, incrementUserStat } = require('../database');
const { FARM_CROPS, FARM_FERTILIZERS } = require('../data/farming');
const { checkAchievements } = require('../systems/achievements');
const { updateQuestProgress, checkAndUpdateStreak, addXpAndMoney } = require('../systems/quests');
const { addPetExp } = require('../systems/pets');
const { getRandomInt, shuffleString } = require('../utils');
const state = require('../state');

const MINI_EVENT_TARGET = 30;
const FISH_EVENT_TARGET = 100;
const poolAcakKata = ["DISCORD", "KOMPUTER", "INTERNET", "PROGRAMMER", "INDONESIA", "KEYBOARD", "LAPTOP", "MONITOR", "EKONOMI", "SERVER", "DATABASE", "JAVASCRIPT", "DEVELOPER", "APLIKASI", "INTERAKSI", "KOMUNITAS", "GAMER", "STREAMING", "MODERATOR", "ADMINISTRATOR", "HADIAH", "VOUCHER", "DOMPET", "SAHABAT", "KONTRIBUTOR"];

module.exports = async function handleMessageCreate(message) {
    if (message.author.bot || !message.guild) return;

    // === AUTOMOD CHECK (before anything else) ===
    const { processAutomod } = require('../systems/automod');
    const automodResult = await processAutomod(message);
    if (automodResult) return; // Message was deleted by automod, stop processing

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

    // === AI ASSISTANT (mention bot / dedicated AI channel) ===
    const { maybeHandleAiMessage } = require('../systems/aiAssistant');
    if (await maybeHandleAiMessage(message)) return; // handled as an AI query

    // Mini-event answer handling
    if (state.activeMiniEvents.has(guildId)) {
        const game = state.activeMiniEvents.get(guildId);
        if (message.channel.id === game.channelId) {
            let won = false, reward = 0, winText = "";
            if (game.type === 'word' && message.content.toUpperCase() === game.answer) { won = true; reward = getRandomInt(150, 400); winText = `🎉 **BENAR SEKALI!** <@${message.author.id}> menyusun kata **${game.answer}** dengan cepat!\n🎁 Mendapatkan 🪙 **${reward} Money**!`; }
            else if (game.type === 'math' && message.content === game.answer.toString()) { won = true; reward = getRandomInt(100, 300); winText = `🎉 **MATEMATIKA KILAT!** <@${message.author.id}> berhasil menjawab **${game.answer}**!\n🎁 Mendapatkan 🪙 **${reward} Money**!`; }
            else if (game.type === 'guess') {
                const guess = parseInt(message.content);
                if (!isNaN(guess)) {
                    if (guess === game.answer) { won = true; reward = getRandomInt(250, 500); winText = `🎯 **TEBAKAN TEPAT!** <@${message.author.id}> menebak angka **${game.answer}**!\n🎁 Mendapatkan 🪙 **${reward} Money**!`; }
                    else if (guess < game.answer) message.react('⬆️').catch(() => {}); else message.react('⬇️').catch(() => {});
                }
            }
            if (won) {
                clearTimeout(game.timer); state.activeMiniEvents.delete(guildId);
                const userData = getOrCreateUser(guildId, message.author.id); userData.balance += reward;
                db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(userData.balance, guildId, message.author.id);
                incrementUserStat(guildId, message.author.id, 'event_wins');
                await checkAchievements(message.guild, message.author.id, { type: 'event_win' });
                return message.reply(winText);
            }
        }
    }

    // Spawn mini-event
    if (!state.activeMiniEvents.has(guildId)) {
        let count = state.guildMessageCounters.get(guildId) || 0; count++;
        if (count >= MINI_EVENT_TARGET) {
            state.guildMessageCounters.set(guildId, 0);
            const eventTypes = ['word', 'math', 'guess', 'airdrop'], chosenEvent = eventTypes[Math.floor(Math.random() * eventTypes.length)];
            let embedEvent = new EmbedBuilder().setColor('#9B59B6'), eventData = { channelId: message.channel.id };
            if (chosenEvent === 'word') {
                const answer = poolAcakKata[Math.floor(Math.random() * poolAcakKata.length)]; let scrambledText = shuffleString(answer); while (scrambledText === answer) scrambledText = shuffleString(answer);
                embedEvent.setTitle('✨ KUIS ACAK KATA MUNCUL!').setDescription(`Siapa cepat dia dapat! Susun huruf ini menjadi sebuah kata:\n\n🔠 **\` ${scrambledText.split('').join(' - ')} \`**\n\n*Ketik jawabanmu langsung di chat ini! (60 Detik)*`); eventData.type = 'word'; eventData.answer = answer;
            } else if (chosenEvent === 'math') {
                const ops = ['+', '-', '*'], op = ops[Math.floor(Math.random() * ops.length)]; let a, b, answer;
                if (op === '+') { a = getRandomInt(10, 50); b = getRandomInt(10, 50); answer = a + b; } else if (op === '-') { a = getRandomInt(30, 80); b = getRandomInt(1, 29); answer = a - b; } else { a = getRandomInt(2, 10); b = getRandomInt(2, 10); answer = a * b; }
                embedEvent.setTitle('🧮 KUIS MATEMATIKA KILAT!').setDescription(`Ayo hitung cepat! Berapa hasil dari:\n\n🔢 **\` ${a} ${op} ${b} = ? \`**\n\n*Ketik angka jawabanmu langsung di chat ini! (60 Detik)*`); eventData.type = 'math'; eventData.answer = answer;
            } else if (chosenEvent === 'guess') {
                const answer = getRandomInt(1, 100); embedEvent.setTitle('🎯 KUIS TEBAK ANGKA!').setDescription(`Bot telah memikirkan sebuah angka dari **1 sampai 100**.\n\nTebak angkanya di chat ini!\n⬆️ Jika terlalu kecil\n⬇️ Jika terlalu besar\n\n*(Waktu: 60 Detik)*`); eventData.type = 'guess'; eventData.answer = answer;
            } else if (chosenEvent === 'airdrop') {
                embedEvent.setTitle('📦 AIR DROP JATUH!').setColor('#E67E22').setDescription(`Peti harta karun jatuh di channel ini!\nSiapa cepat dia dapat, segera klik tombol di bawah untuk klaim!`); eventData.type = 'airdrop';
            }
            const messageOptions = { embeds: [embedEvent] };
            if (chosenEvent === 'airdrop') { const claimBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('airdrop_claim').setLabel('🎁 Ambil Hadiah').setStyle(ButtonStyle.Success)); messageOptions.components = [claimBtn]; }
            message.channel.send(messageOptions).then(sentMsg => {
                eventData.timer = setTimeout(() => { if (state.activeMiniEvents.has(guildId)) { state.activeMiniEvents.delete(guildId); if (chosenEvent === 'airdrop') { const disabledBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('airdrop_expired').setLabel('Kedaluwarsa').setStyle(ButtonStyle.Secondary).setDisabled(true)); sentMsg.edit({ components: [disabledBtn] }).catch(()=>{}); } else sentMsg.channel.send(`⏰ **WAKTU HABIS!** Jawaban: **${eventData.answer}**.`); } }, 60000);
                state.activeMiniEvents.set(guildId, eventData);
            });
        } else state.guildMessageCounters.set(guildId, count);
    }

    // Fishing tournament spawn
    if (!state.activeFishEvents.has(guildId)) {
        let fishCount = state.guildFishEventCounters.get(guildId) || 0; fishCount++;
        if (fishCount >= FISH_EVENT_TARGET) {
            state.guildFishEventCounters.set(guildId, 0);
            const eventTypes = ['first_legendary', 'first_rare', 'heaviest', 'most_fish', 'first_trash'];
            const chosen = eventTypes[Math.floor(Math.random() * eventTypes.length)];
            let eventDesc = '', eventData = { channelId: message.channel.id, type: chosen, startTime: Date.now(), participants: {} };
            if (chosen === 'first_legendary') eventDesc = 'Siapa yang bisa menangkap ikan **Legendary** atau lebih tinggi pertama kali?';
            else if (chosen === 'first_rare') eventDesc = 'Siapa yang bisa menangkap ikan **Rare** atau lebih tinggi pertama kali?';
            else if (chosen === 'heaviest') eventDesc = 'Siapa yang bisa menangkap ikan **paling berat** dalam 5 menit?';
            else if (chosen === 'most_fish') eventDesc = 'Siapa yang bisa menangkap ikan **paling banyak** dalam 5 menit?';
            else if (chosen === 'first_trash') eventDesc = 'Siapa yang bisa menangkap **Sampah (Trash)** pertama kali? 🗑️';
            const reward = chosen === 'first_legendary' ? 3000 : (chosen === 'heaviest' ? 2000 : (chosen === 'most_fish' ? 2000 : 1000));
            eventData.reward = reward;
            const embed = new EmbedBuilder().setColor('#1ABC9C').setTitle('🎣🏆 FISHING TOURNAMENT!').setDescription(`**Kompetisi memancing dimulai!**\n\n> 🎯 **Tantangan:** ${eventDesc}\n> 🎁 **Hadiah:** 🪙 **${reward.toLocaleString('id-ID')} Money**\n> ⏱️ **Durasi:** 5 menit\n\n*Gunakan \`/fish\` untuk ikut!*`).setTimestamp();
            message.channel.send({ embeds: [embed] }).then(() => {
                state.activeFishEvents.set(guildId, eventData);
                setTimeout(() => {
                    if (state.activeFishEvents.has(guildId)) {
                        const ev = state.activeFishEvents.get(guildId); state.activeFishEvents.delete(guildId);
                        let winner = null, winnerValue = 0;
                        if (ev.type === 'heaviest') { for (const [uid, data] of Object.entries(ev.participants)) { if (data.heaviest > winnerValue) { winner = uid; winnerValue = data.heaviest; } } }
                        else if (ev.type === 'most_fish') { for (const [uid, data] of Object.entries(ev.participants)) { if (data.count > winnerValue) { winner = uid; winnerValue = data.count; } } }
                        if (winner) { const winnerData = getOrCreateUser(guildId, winner); winnerData.balance += ev.reward; db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(winnerData.balance, guildId, winner); const resultText = ev.type === 'heaviest' ? `ikan terberat: **${winnerValue} kg**` : `total tangkapan: **${winnerValue} ikan**`; const ch = message.guild.channels.cache.get(ev.channelId); if (ch) ch.send({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('🏆 TOURNAMENT SELESAI!').setDescription(`Pemenang: <@${winner}>\n> ${resultText}\n\n🎁 Hadiah: 🪙 **${ev.reward.toLocaleString('id-ID')} Money**`)] }); }
                        else { const ch = message.guild.channels.cache.get(ev.channelId); if (ch) ch.send({ embeds: [new EmbedBuilder().setColor('#95A5A6').setTitle('🏆 TOURNAMENT SELESAI').setDescription('Tidak ada pemenang.')] }); }
                    }
                }, 300000);
            });
        } else state.guildFishEventCounters.set(guildId, fishCount);
    }

    // Streak
    const streakActivated = await checkAndUpdateStreak(message);
    if (streakActivated) message.reply({ content: `🔥 **Berhasil!** Kamu telah mengaktifkan streak api hari ini!` }).then(msg => { setTimeout(() => msg.delete().catch(() => {}), 5000); }).catch(() => {});

    // Quest progress
    const chatText = message.content;
    updateQuestProgress(guildId, message.author.id, 'typing', 1, chatText);
    updateQuestProgress(guildId, message.author.id, 'tebak', 1, chatText);
    if (message.mentions.users.filter(u => !u.bot).size > 0) updateQuestProgress(guildId, message.author.id, 'tag', 1);

    incrementUserStat(guildId, message.author.id, 'total_chats');
    await checkAchievements(message.guild, message.author.id, { type: 'chat' });

    // Pet passive EXP
    const petExpKey = `pet_exp_${guildId}_${message.author.id}`;
    if (!state.fishCooldowns.has(petExpKey) || Date.now() > state.fishCooldowns.get(petExpKey)) {
        state.fishCooldowns.set(petExpKey, Date.now() + 120000);
        addPetExp(guildId, message.author.id, 2);
    }

    // Chat XP/Money cooldown
    const cdKey = `${guildId}_${message.author.id}`;
    if (!state.chatCooldowns.has(cdKey)) {
        await addXpAndMoney(message.member, 'chat');
        state.chatCooldowns.add(cdKey);
        setTimeout(() => state.chatCooldowns.delete(cdKey), getConf(guildId, 'chat_cooldown', 60) * 1000);
    }

    // Pet hunger/happy decay
    const petDecayKey = `pet_decay_${guildId}_${message.author.id}`;
    if (!state.fishCooldowns.has(petDecayKey) || Date.now() > state.fishCooldowns.get(petDecayKey)) {
        state.fishCooldowns.set(petDecayKey, Date.now() + 600000);
        const activePet = db.prepare('SELECT * FROM pets WHERE guildId = ? AND userId = ? AND active = 1').get(guildId, message.author.id);
        if (activePet && activePet.status !== 'dead') {
            const newHunger = Math.max(0, activePet.hunger - 3);
            const newHappy = Math.max(0, activePet.happiness - 2);
            let newStatus = activePet.status;
            if (newHunger <= 0 && activePet.status !== 'sick') newStatus = 'sick';
            db.prepare('UPDATE pets SET hunger = ?, happiness = ?, status = ? WHERE id = ?').run(newHunger, newHappy, newStatus, activePet.id);
            if (newHunger <= 20 && newHunger > 0) message.reply({ content: `🐾 Pet kamu **${activePet.name}** lapar! (🍖 ${newHunger}%) Kasih makan lewat \`/pet\` → 🍖 Feed!` }).then(msg => { setTimeout(() => msg.delete().catch(() => {}), 10000); }).catch(() => {});
            else if (newStatus === 'sick' && activePet.status !== 'sick') message.reply({ content: `🐾⚠️ Pet kamu **${activePet.name}** SAKIT! 🤒 Segera kasih makan!` }).then(msg => { setTimeout(() => msg.delete().catch(() => {}), 15000); }).catch(() => {});
        }
    }

    // Farm notification
    const farmNotifKey = `farm_notif_${guildId}_${message.author.id}`;
    if (!state.fishCooldowns.has(farmNotifKey) || Date.now() > state.fishCooldowns.get(farmNotifKey)) {
        state.fishCooldowns.set(farmNotifKey, Date.now() + 300000);
        const farmPlots = db.prepare('SELECT * FROM farm_plots WHERE guildId = ? AND userId = ?').all(guildId, message.author.id);
        if (farmPlots.length > 0) {
            let readyCount = 0, needWaterCount = 0, deadCount = 0;
            for (const plot of farmPlots) {
                const crop = FARM_CROPS.find(c => c.id === plot.cropId); if (!crop) continue;
                const fert = FARM_FERTILIZERS.find(f => f.id === plot.fertilizer) || FARM_FERTILIZERS[0];
                const growTime = crop.time * (1 - fert.speedBonus) * 60000;
                const elapsed = Date.now() - plot.plantedAt;
                const dryTime = Date.now() - plot.wateredAt;
                const deadThreshold = growTime * 2.5;
                if (plot.status === 'dead' || dryTime > deadThreshold) { deadCount++; if (plot.status !== 'dead') db.prepare('UPDATE farm_plots SET status = ? WHERE id = ?').run('dead', plot.id); }
                else if (elapsed >= growTime) readyCount++;
                else if (dryTime > growTime * 1.2) needWaterCount++;
            }
            let notifParts = [];
            if (readyCount > 0) notifParts.push(`✅ **${readyCount} tanaman** siap dipanen! (\`/farm\` → 🌾 Harvest)`);
            if (needWaterCount > 0) notifParts.push(`💧 **${needWaterCount} tanaman** butuh disiram! (\`/farm\` → 💧 Water)`);
            if (deadCount > 0) notifParts.push(`☠️ **${deadCount} tanaman** mati karena tidak disiram`);
            if (notifParts.length > 0) {
                // In-chat reminder for active players only. The Auto-Harvest Pass DM is sent
                // automatically (independent of chat) by the scheduler in systems/autoHarvest.js.
                message.reply({ content: `🌾 **Farm Reminder:**\n${notifParts.join('\n')}`, allowedMentions: { users: [message.author.id] } }).then(msg => { setTimeout(() => msg.delete().catch(() => {}), 15000); }).catch(() => {});
            }
        }
    }
};
