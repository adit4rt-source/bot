// systems/rps.js - Rock-Paper-Scissors PvP Betting System
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, updateUserBalance, addIncome } = require('../database');
const { checkAchievements } = require('./achievements');

// Active games cache in memory
// Key: `${challengerId}_${opponentId}`, Value: { challengerId, opponentId, bet, challengerChoice, opponentChoice, messageId }
const activeGames = new Map();

function createRpsChallenge(interaction, challengerId, opponentId, bet) {
    const guildId = interaction.guild.id;
    
    // Validations
    if (challengerId === opponentId) {
        return { error: '❌ Kamu tidak bisa menantang diri sendiri!' };
    }
    
    const challenger = getOrCreateUser(guildId, challengerId);
    const opponent = getOrCreateUser(guildId, opponentId);
    
    if (challenger.balance < bet) {
        return { error: `❌ Saldo kamu kurang! Kamu butuh 🪙 **${bet.toLocaleString('id-ID')}** koin.` };
    }
    if (opponent.balance < bet) {
        return { error: `❌ Saldo lawan kurang! <@${opponentId}> butuh 🪙 **${bet.toLocaleString('id-ID')}** koin.` };
    }

    const embed = new EmbedBuilder()
        .setColor('#F39C12')
        .setTitle('🤝 TANTANGAN DUEL ROCK-PAPER-SCISSORS!')
        .setDescription(
            `<@${challengerId}> menantang <@${opponentId}> untuk duel **Gunting-Batu-Kertas**!\n\n` +
            `💰 **Taruhan:** 🪙 **${bet.toLocaleString('id-ID')}** koin dari masing-masing pemain (Total Pot: 🪙 **${(bet * 2).toLocaleString('id-ID')}**)\n\n` +
            `*Klik tombol di bawah untuk Menerima atau Menolak.*`
        )
        .setFooter({ text: 'Tantangan ini akan otomatis kadaluwarsa dalam 60 detik.' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rps_accept_${challengerId}_${opponentId}_${bet}`).setLabel('✅ Terima').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`rps_decline_${challengerId}_${opponentId}_${bet}`).setLabel('❌ Tolak').setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row] };
}

async function acceptRpsChallenge(interaction, challengerId, opponentId, bet) {
    const guildId = interaction.guild.id;
    
    if (interaction.user.id !== opponentId) {
        return interaction.reply({ content: '❌ Hanya orang yang ditantang yang bisa menerima ini!', ephemeral: true });
    }

    // Re-verify balances
    const challenger = getOrCreateUser(guildId, challengerId);
    const opponent = getOrCreateUser(guildId, opponentId);
    
    if (challenger.balance < bet) {
        return interaction.reply({ content: `❌ Duel batal. Saldo pencentang (<@${challengerId}>) sekarang tidak cukup!`, ephemeral: true });
    }
    if (opponent.balance < bet) {
        return interaction.reply({ content: `❌ Saldo kamu kurang! Kamu butuh 🪙 **${bet.toLocaleString('id-ID')}** koin.`, ephemeral: true });
    }

    // Deduct balances immediately to escrow
    challenger.balance -= bet;
    opponent.balance -= bet;
    updateUserBalance(guildId, challengerId, challenger.balance);
    updateUserBalance(guildId, opponentId, opponent.balance);

    const gameKey = `${challengerId}_${opponentId}`;
    activeGames.set(gameKey, {
        challengerId,
        opponentId,
        bet,
        challengerChoice: null,
        opponentChoice: null,
        messageId: interaction.message.id
    });

    const embed = new EmbedBuilder()
        .setColor('#2980B9')
        .setTitle('⚔️ DUEL R-P-S SEDANG BERLANGSUNG!')
        .setDescription(
            `Duel antara <@${challengerId}> dan <@${opponentId}> telah dimulai!\n\n` +
            `💰 **Taruhan:** 🪙 **${bet.toLocaleString('id-ID')}** koin\n\n` +
            `🔵 **<@${challengerId}>**: ⏳ Menunggu pilihan...\n` +
            `🔴 **<@${opponentId}>**: ⏳ Menunggu pilihan...\n\n` +
            `*Pilih move kamu secara rahasia menggunakan tombol di bawah!*`
        )
        .setFooter({ text: 'Pilihan Anda tidak akan terlihat oleh lawan.' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rps_play_rock_${challengerId}_${opponentId}_${bet}`).setLabel('🪨 Batu').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rps_play_paper_${challengerId}_${opponentId}_${bet}`).setLabel('📄 Kertas').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rps_play_scissors_${challengerId}_${opponentId}_${bet}`).setLabel('✂️ Gunting').setStyle(ButtonStyle.Primary)
    );

    await interaction.update({ embeds: [embed], components: [row] });
}

async function declineRpsChallenge(interaction, challengerId, opponentId) {
    if (interaction.user.id !== opponentId && interaction.user.id !== challengerId) {
        return interaction.reply({ content: '❌ Kamu tidak terlibat dalam tantangan ini!', ephemeral: true });
    }

    const cancelMsg = interaction.user.id === opponentId 
        ? `❌ <@${opponentId}> menolak tantangan duel.` 
        : `❌ <@${challengerId}> membatalkan tantangan duel.`;

    await interaction.update({ content: cancelMsg, embeds: [], components: [] });
}

async function playRpsMove(interaction, move, challengerId, opponentId, bet) {
    const userId = interaction.user.id;
    if (userId !== challengerId && userId !== opponentId) {
        return interaction.reply({ content: '❌ Kamu tidak ikut dalam duel ini!', ephemeral: true });
    }

    const gameKey = `${challengerId}_${opponentId}`;
    const game = activeGames.get(gameKey);
    if (!game) {
        return interaction.reply({ content: '❌ Permainan tidak ditemukan atau sudah berakhir.', ephemeral: true });
    }

    if (userId === challengerId) {
        if (game.challengerChoice) return interaction.reply({ content: '❌ Kamu sudah memilih!', ephemeral: true });
        game.challengerChoice = move;
    } else {
        if (game.opponentChoice) return interaction.reply({ content: '❌ Kamu sudah memilih!', ephemeral: true });
        game.opponentChoice = move;
    }

    // Acknowledge the player ephemerally
    const emojis = { rock: '🪨 Batu', paper: '📄 Kertas', scissors: '✂️ Gunting' };
    await interaction.reply({ content: `✅ Kamu memilih **${emojis[move]}**!`, ephemeral: true });

    // Update the main message to show ready status
    const cStatus = game.challengerChoice ? '✅ READY' : '⏳ Menunggu pilihan...';
    const oStatus = game.opponentChoice ? '✅ READY' : '⏳ Menunggu pilihan...';

    const embed = new EmbedBuilder()
        .setColor('#2980B9')
        .setTitle('⚔️ DUEL R-P-S SEDANG BERLANGSUNG!')
        .setDescription(
            `Duel antara <@${challengerId}> dan <@${opponentId}> sedang berlangsung!\n\n` +
            `💰 **Taruhan:** 🪙 **${bet.toLocaleString('id-ID')}** koin\n\n` +
            `🔵 **<@${challengerId}>**: ${cStatus}\n` +
            `🔴 **<@${opponentId}>**: ${oStatus}\n\n` +
            `*Pilih move kamu secara rahasia menggunakan tombol di bawah!*`
        )
        .setFooter({ text: 'Pilihan Anda tidak akan terlihat oleh lawan.' });

    // Check if both players have chosen
    if (game.challengerChoice && game.opponentChoice) {
        activeGames.delete(gameKey);
        await resolveRpsGame(interaction, game);
    } else {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rps_play_rock_${challengerId}_${opponentId}_${bet}`).setLabel('🪨 Batu').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rps_play_paper_${challengerId}_${opponentId}_${bet}`).setLabel('📄 Kertas').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`rps_play_scissors_${challengerId}_${opponentId}_${bet}`).setLabel('✂️ Gunting').setStyle(ButtonStyle.Primary)
        );
        await interaction.message.edit({ embeds: [embed], components: [row] }).catch(() => {});
    }
}

async function resolveRpsGame(interaction, game) {
    const guildId = interaction.guild.id;
    const { challengerId, opponentId, bet, challengerChoice, opponentChoice } = game;

    const emojis = { rock: '🪨 Batu', paper: '📄 Kertas', scissors: '✂️ Gunting' };
    const cLabel = emojis[challengerChoice];
    const oLabel = emojis[opponentChoice];

    let resultText = '';
    let winnerId = null;
    let draw = false;

    if (challengerChoice === opponentChoice) {
        draw = true;
    } else if (
        (challengerChoice === 'rock' && opponentChoice === 'scissors') ||
        (challengerChoice === 'scissors' && opponentChoice === 'paper') ||
        (challengerChoice === 'paper' && opponentChoice === 'rock')
    ) {
        winnerId = challengerId;
    } else {
        winnerId = opponentId;
    }

    if (draw) {
        resultText = '🤝 **HASIL SERI!** Pilihan sama.';
        // Refund both players
        const challenger = getOrCreateUser(guildId, challengerId);
        const opponent = getOrCreateUser(guildId, opponentId);
        challenger.balance += bet;
        opponent.balance += bet;
        updateUserBalance(guildId, challengerId, challenger.balance);
        updateUserBalance(guildId, opponentId, opponent.balance);
    } else {
        const winner = winnerId === challengerId ? challengerId : opponentId;
        const loser = winnerId === challengerId ? opponentId : challengerId;
        
        resultText = `🏆 <@${winner}> **MENANG DUEL!**`;
        
        // Award the double bet (pot) to the winner
        const winReward = bet * 2;
        const wUser = getOrCreateUser(guildId, winner);
        wUser.balance += winReward;
        updateUserBalance(guildId, winner, wUser.balance);
        addIncome(guildId, winner, 'gambling', bet); // Profit is bet

        // Check achievements for winner
        try {
            await checkAchievements(interaction.guild, winner, { type: 'coinflip' });
        } catch (_) {}
    }

    const embed = new EmbedBuilder()
        .setColor(draw ? '#95A5A6' : '#2ECC71')
        .setTitle('🏆 DUEL R-P-S SELESAI!')
        .setDescription(
            `Pertarungan sengit telah berakhir!\n\n` +
            `🔵 <@${challengerId}> memilih: **${cLabel}**\n` +
            `🔴 <@${opponentId}> memilih: **${oLabel}**\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `${resultText}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            (draw 
                ? `💰 Taruhan 🪙 **${bet.toLocaleString('id-ID')}** koin telah dikembalikan ke masing-masing saldo.`
                : `💰 Pemenang membawa pulang 🪙 **${(bet * 2).toLocaleString('id-ID')}** koin! 🎉`
            )
        )
        .setTimestamp();

    await interaction.message.edit({ embeds: [embed], components: [] }).catch(() => {});
}

module.exports = {
    createRpsChallenge,
    acceptRpsChallenge,
    declineRpsChallenge,
    playRpsMove
};
