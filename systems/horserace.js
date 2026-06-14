// systems/horserace.js - Horse Racing Server Event Live
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, updateUserBalance, addIncome } = require('../database');
const { checkAchievements } = require('./achievements');

// Active races in memory
// Key: guildId, Value: { creatorId, betAmount, status, players: [], positions: {}, timer }
const activeRaces = new Map();

const HORSES = {
    red: { name: 'Kuda Merah', emoji: '🔴' },
    blue: { name: 'Kuda Biru', emoji: '🔵' },
    green: { name: 'Kuda Hijau', emoji: '🟢' },
    yellow: { name: 'Kuda Kuning', emoji: '🟡' },
    purple: { name: 'Kuda Ungu', emoji: '🟣' }
};

function createHorseRace(interaction, betAmount, creatorHorse) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    if (activeRaces.has(guildId)) {
        return { error: '❌ Ada balapan kuda yang sedang berjalan di server ini. Tunggu hingga selesai!' };
    }

    const creator = getOrCreateUser(guildId, userId);
    if (creator.balance < betAmount) {
        return { error: `❌ Saldo kamu kurang! Kamu butuh 🪙 **${betAmount.toLocaleString('id-ID')}** koin untuk membuka taruhan.` };
    }

    // Deduct creator's bet immediately
    creator.balance -= betAmount;
    updateUserBalance(guildId, userId, creator.balance);

    const race = {
        creatorId: userId,
        betAmount,
        status: 'lobby',
        players: [{ userId, username: interaction.user.username, chosenHorse: creatorHorse, betAmount }],
        positions: { red: 0, blue: 0, green: 0, yellow: 0, purple: 0 },
        timer: null
    };

    activeRaces.set(guildId, race);

    const embed = buildLobbyEmbed(race);
    const rows = buildLobbyButtons(userId);

    // Auto-start race after 45 seconds (or 10ms in tests)
    race.timer = setTimeout(() => {
        startRace(interaction.client, guildId, interaction.channel).catch(() => {});
    }, process.env.NODE_ENV === 'test' ? 10 : 45000);

    return { embeds: [embed], components: rows };
}

function buildLobbyEmbed(race) {
    let playersList = '';
    const counts = { red: 0, blue: 0, green: 0, yellow: 0, purple: 0 };
    
    race.players.forEach(p => {
        counts[p.chosenHorse]++;
    });

    Object.entries(HORSES).forEach(([key, val]) => {
        const list = race.players.filter(p => p.chosenHorse === key).map(p => p.username).join(', ');
        playersList += `${val.emoji} **${val.name}** (${counts[key]} bet): ${list || '*Belum ada*'} \n`;
    });

    const totalPot = race.players.length * race.betAmount;

    return new EmbedBuilder()
        .setColor('#8E44AD')
        .setTitle('🐎 PENDAFTARAN BALAPAN KUDA DIBUKA!')
        .setDescription(
            `Sebuah event balap kuda live telah dibuka! Siapkan koin taruhan Anda dan dukung kuda andalan Anda!\n\n` +
            `💰 **Biaya Taruhan:** 🪙 **${race.betAmount.toLocaleString('id-ID')}** koin per orang\n` +
            `💸 **Total Pot Saat Ini:** 🪙 **${totalPot.toLocaleString('id-ID')}** koin\n\n` +
            `**Daftar Dukungan Kuda:**\n${playersList}\n` +
            `*Balapan akan dimulai secara otomatis dalam 45 detik.*`
        )
        .setFooter({ text: 'Klik tombol di bawah untuk ikut memasang taruhan!' })
        .setTimestamp();
}

function buildLobbyButtons(creatorId) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hr_bet_red_${creatorId}`).setLabel('🔴 Merah').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`hr_bet_blue_${creatorId}`).setLabel('🔵 Biru').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`hr_bet_green_${creatorId}`).setLabel('🟢 Hijau').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hr_bet_yellow_${creatorId}`).setLabel('🟡 Kuning').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`hr_bet_purple_${creatorId}`).setLabel('🟣 Ungu').setStyle(ButtonStyle.Primary)
    );
    return [row1, row2];
}

async function joinHorseRace(interaction, chosenHorse, creatorId) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    const race = activeRaces.get(guildId);
    if (!race || race.status !== 'lobby') {
        return interaction.reply({ content: '❌ Tidak ada pendaftaran balapan yang aktif saat ini.', ephemeral: true });
    }

    if (race.players.some(p => p.userId === userId)) {
        return interaction.reply({ content: '❌ Kamu sudah memasang taruhan dalam balapan ini!', ephemeral: true });
    }

    const player = getOrCreateUser(guildId, userId);
    if (player.balance < race.betAmount) {
        return interaction.reply({ content: `❌ Saldo kamu kurang! Kamu butuh 🪙 **${race.betAmount.toLocaleString('id-ID')}** koin untuk ikut taruhan.`, ephemeral: true });
    }

    // Deduct player's bet immediately
    player.balance -= race.betAmount;
    updateUserBalance(guildId, userId, player.balance);

    race.players.push({
        userId,
        username: interaction.user.username,
        chosenHorse,
        betAmount: race.betAmount
    });

    await interaction.reply({ content: `✅ Berhasil memasang taruhan 🪙 **${race.betAmount.toLocaleString('id-ID')}** pada **${HORSES[chosenHorse].name}**!`, ephemeral: true });

    // Update lobby embed
    const embed = buildLobbyEmbed(race);
    const rows = buildLobbyButtons(creatorId);
    await interaction.message.edit({ embeds: [embed], components: rows }).catch(() => {});
}

async function startRace(client, guildId, channel) {
    const race = activeRaces.get(guildId);
    if (!race || race.status !== 'lobby') return;

    race.status = 'running';
    if (race.timer) clearTimeout(race.timer);

    const embed = buildRaceEmbed(race);
    const msg = await channel.send({ embeds: [embed] }).catch(() => null);
    if (!msg) {
        // Rollback bets if send fails
        activeRaces.delete(guildId);
        race.players.forEach(p => {
            const u = getOrCreateUser(guildId, p.userId);
            u.balance += p.betAmount;
            updateUserBalance(guildId, p.userId, u.balance);
        });
        return;
    }

    // Run the race loop
    const trackLength = 10;
    const interval = setInterval(async () => {
        let finished = false;
        let winners = [];

        // Advance 1-3 random horses in each step
        const keys = Object.keys(HORSES);
        const countToAdvance = Math.floor(Math.random() * 3) + 1; // 1 to 3 horses
        for (let i = 0; i < countToAdvance; i++) {
            const chosen = keys[Math.floor(Math.random() * keys.length)];
            race.positions[chosen] += Math.floor(Math.random() * 2) + 1; // 1 or 2 steps
            if (race.positions[chosen] >= trackLength) {
                finished = true;
            }
        }

        if (finished) {
            clearInterval(interval);
            
            // Determine winner horse
            let maxPos = -1;
            let winningHorse = null;
            Object.entries(race.positions).forEach(([key, pos]) => {
                if (pos > maxPos) {
                    maxPos = pos;
                    winningHorse = key;
                }
            });

            // End race and handle rewards
            activeRaces.delete(guildId);
            await resolveRace(msg, race, winningHorse);
        } else {
            const currentEmbed = buildRaceEmbed(race);
            await msg.edit({ embeds: [currentEmbed] }).catch(() => {});
        }
    }, process.env.NODE_ENV === 'test' ? 10 : 1500);
}

function buildRaceEmbed(race) {
    let tracks = '';
    const trackLength = 10;

    Object.entries(HORSES).forEach(([key, val]) => {
        const pos = Math.min(race.positions[key], trackLength);
        const before = '─'.repeat(pos);
        const after = '─'.repeat(trackLength - pos);
        tracks += `🏁 ${before}${val.emoji}${after} 🚩 **[${val.name}]**\n`;
    });

    const totalPot = race.players.length * race.betAmount;

    return new EmbedBuilder()
        .setColor('#8E44AD')
        .setTitle('🐎 BALAPAN KUDA SEDANG BERLANGSUNG!')
        .setDescription(
            `Kuda-kuda sedang berpacu kencang menuju garis finis! 🐎💨\n\n` +
            `${tracks}\n` +
            `💰 **Total Pot Taruhan:** 🪙 **${totalPot.toLocaleString('id-ID')}** koin\n\n` +
            `*Harap tunggu hingga balapan selesai...*`
        );
}

async function resolveRace(msg, race, winningHorse) {
    const guildId = msg.guild.id;
    const winnerHorseData = HORSES[winningHorse];
    const winners = race.players.filter(p => p.chosenHorse === winningHorse);
    const totalPot = race.players.length * race.betAmount;

    let resultText = '';
    if (winners.length > 0) {
        const splitAmount = Math.floor(totalPot / winners.length);
        resultText = `🏆 **PEMENANG BALAPAN: ${winnerHorseData.emoji} ${winnerHorseData.name}!** 🏆\n\n`;
        resultText += `🎉 Selamat kepada para pendukung **${winnerHorseData.name}**!\n`;
        
        // Distribute pot
        for (const w of winners) {
            const user = getOrCreateUser(guildId, w.userId);
            user.balance += splitAmount;
            updateUserBalance(guildId, w.userId, user.balance);
            addIncome(guildId, w.userId, 'gambling', splitAmount - race.betAmount); // net profit
            resultText += `> • <@${w.userId}> membawa pulang 🪙 **${splitAmount.toLocaleString('id-ID')}** koin!\n`;

            try {
                await checkAchievements(msg.guild, w.userId, { type: 'coinflip' });
            } catch (_) {}
        }
    } else {
        resultText = `🏆 **PEMENANG BALAPAN: ${winnerHorseData.emoji} ${winnerHorseData.name}!** 🏆\n\n`;
        resultText += `😢 Sayang sekali, tidak ada satu pun pemain yang bertaruh pada **${winnerHorseData.name}**.\n\n`;
        resultText += `💰 Semua koin taruhan sebesar 🪙 **${totalPot.toLocaleString('id-ID')}** masuk ke kas bandar server!`;
    }

    let tracks = '';
    const trackLength = 10;
    Object.entries(HORSES).forEach(([key, val]) => {
        const pos = key === winningHorse ? trackLength : Math.min(race.positions[key], trackLength - 1);
        const before = '─'.repeat(pos);
        const after = '─'.repeat(trackLength - pos);
        tracks += `🏁 ${before}${val.emoji}${after} 🚩 **[${val.name}]**\n`;
    });

    const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('🏁 BALAPAN KUDA SELESAI!')
        .setDescription(
            `Balapan telah usai dan pemenang telah ditentukan!\n\n` +
            `${tracks}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `${resultText}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setTimestamp();

    await msg.edit({ embeds: [embed] }).catch(() => {});
}

module.exports = {
    createHorseRace,
    joinHorseRace,
    startRace
};
