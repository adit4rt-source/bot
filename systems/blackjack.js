// systems/blackjack.js — Blackjack Mini-game (21)
// Classic card game. Hit/Stand/Double Down. Bet money, try to beat the dealer.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getUserStat, incrementUserStat, addIncome, addSpending } = require('../database');
const { getRandomInt } = require('../utils');
const { checkAchievements } = require('./achievements');
const { addComboFeature } = require('./combo');
const { updateQuestProgress } = require('./quests');

// ==================== CARD DATA ====================
const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// ==================== ACTIVE GAMES (in-memory) ====================
const activeBlackjackGames = new Map();

// ==================== HELPERS ====================
function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ suit, rank });
        }
    }
    // Shuffle (Fisher-Yates)
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function getCardValue(card) {
    if (['J', 'Q', 'K'].includes(card.rank)) return 10;
    if (card.rank === 'A') return 11; // Will be adjusted in handValue
    return parseInt(card.rank);
}

function handValue(hand) {
    let total = 0;
    let aces = 0;
    for (const card of hand) {
        const val = getCardValue(card);
        total += val;
        if (card.rank === 'A') aces++;
    }
    // Adjust aces: if over 21, convert A from 11 to 1
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    return total;
}

function formatCard(card) {
    return `\`${card.rank}${card.suit}\``;
}

function formatHand(hand) {
    return hand.map(formatCard).join(' ');
}

function isBust(hand) {
    return handValue(hand) > 21;
}

function isBlackjack(hand) {
    return hand.length === 2 && handValue(hand) === 21;
}

// ==================== GAME STATE ====================
function createGame(guildId, userId, bet) {
    const deck = createDeck();
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];

    const game = {
        guildId,
        userId,
        bet,
        deck,
        playerHand,
        dealerHand,
        status: 'playing', // playing, stand, bust, blackjack, done
        doubled: false,
        startedAt: Date.now()
    };

    // Side bet: Perfect Pair check
    game.sideBet = null;
    game.sideBetPayout = 0;
    if (playerHand[0].rank === playerHand[1].rank) {
        if (playerHand[0].suit === playerHand[1].suit) {
            game.sideBet = { type: 'suited_pair', mult: 25, label: '🎯 SUITED PAIR! (25x side bet)' };
        } else if ((SUITS.indexOf(playerHand[0].suit) % 2) === (SUITS.indexOf(playerHand[1].suit) % 2)) {
            game.sideBet = { type: 'colored_pair', mult: 12, label: '🎨 COLORED PAIR! (12x side bet)' };
        } else {
            game.sideBet = { type: 'perfect_pair', mult: 5, label: '✨ PERFECT PAIR! (5x side bet)' };
        }
        game.sideBetPayout = Math.floor(bet * game.sideBet.mult * 0.1); // 10% of bet as side-bet stake
    }

    // Check for natural blackjack
    if (isBlackjack(playerHand)) {
        game.status = 'blackjack';
    }

    activeBlackjackGames.set(`${guildId}_${userId}`, game);
    return game;
}

function getGame(guildId, userId) {
    return activeBlackjackGames.get(`${guildId}_${userId}`);
}

function endGame(guildId, userId) {
    activeBlackjackGames.delete(`${guildId}_${userId}`);
}

// ==================== DEALER AI ====================
function dealerPlay(game) {
    // Dealer hits until 17+
    while (handValue(game.dealerHand) < 17) {
        game.dealerHand.push(game.deck.pop());
    }
}

// ==================== DETERMINE WINNER ====================
function determineResult(game) {
    const playerVal = handValue(game.playerHand);
    const dealerVal = handValue(game.dealerHand);
    const playerBJ = isBlackjack(game.playerHand);
    const dealerBJ = isBlackjack(game.dealerHand);

    if (playerBJ && dealerBJ) return { result: 'push', payout: game.bet, label: '🤝 Push (Tie)' };
    if (playerBJ) return { result: 'blackjack', payout: Math.floor(game.bet * 2.5), label: '🃏 BLACKJACK! (2.5x)' };
    if (playerVal > 21) return { result: 'bust', payout: 0, label: '💥 Bust!' };
    if (dealerVal > 21) return { result: 'win', payout: game.bet * 2, label: '🎉 Dealer Bust! Kamu Menang!' };
    if (playerVal > dealerVal) return { result: 'win', payout: game.bet * 2, label: '🎉 Kamu Menang!' };
    if (playerVal < dealerVal) return { result: 'lose', payout: 0, label: '😢 Dealer Menang!' };
    return { result: 'push', payout: game.bet, label: '🤝 Push (Tie)' };
}

// ==================== BUILD: Game Embed ====================
function buildGameEmbed(game, showDealer = false, result = null) {
    const playerVal = handValue(game.playerHand);
    const dealerVal = showDealer ? handValue(game.dealerHand) : getCardValue(game.dealerHand[0]);

    let dealerDisplay;
    if (showDealer) {
        dealerDisplay = `${formatHand(game.dealerHand)} = **${handValue(game.dealerHand)}**`;
    } else {
        dealerDisplay = `${formatCard(game.dealerHand[0])} \`??\` = **${getCardValue(game.dealerHand[0])}+?**`;
    }

    let color = '#3498DB';
    let title = '🃏 Blackjack';
    if (result) {
        if (result.result === 'blackjack' || result.result === 'win') { color = '#2ECC71'; title = '🃏 Blackjack — Menang!'; }
        else if (result.result === 'bust' || result.result === 'lose') { color = '#E74C3C'; title = '🃏 Blackjack — Kalah!'; }
        else { color = '#F1C40F'; title = '🃏 Blackjack — Seri!'; }
    }

    let desc = `━━━━━━━━━━━━━━━━━━━━━━\n`;
    desc += `**🎰 Taruhan:** 🪙 ${game.bet.toLocaleString('id-ID')}${game.doubled ? ' (DOUBLED!)' : ''}\n\n`;
    desc += `**🃏 Dealer:**\n> ${dealerDisplay}\n\n`;
    desc += `**🧑 Kamu:**\n> ${formatHand(game.playerHand)} = **${playerVal}**\n`;

    if (playerVal === 21 && !result) desc += `> ⭐ **21!**\n`;

    if (result) {
        desc += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
        desc += `**${result.label}**\n`;
        if (game.sideBet) {
            desc += `> ${game.sideBet.label}\n`;
            desc += `> 🪙 Side Bet Bonus: **+${game.sideBetPayout.toLocaleString('id-ID')}**\n`;
        }
        if (result.payout > 0 && result.result !== 'push') {
            desc += `> 🪙 Menang: **+${result.payout.toLocaleString('id-ID')}**\n`;
        } else if (result.result === 'push') {
            desc += `> 🪙 Taruhan dikembalikan: **${result.payout.toLocaleString('id-ID')}**\n`;
        } else {
            desc += `> 🪙 Kalah: **-${game.bet.toLocaleString('id-ID')}**\n`;
        }
    }

    desc += `━━━━━━━━━━━━━━━━━━━━━━`;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription(desc)
        .setFooter({ text: result ? 'Game selesai!' : 'Hit = ambil kartu | Stand = berhenti | Double = 2x taruhan + 1 kartu' });

    return embed;
}

// ==================== BUILD: Game Buttons ====================
function buildGameButtons(userId, game, gameOver = false) {
    if (gameOver) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bj_newgame_${userId}`).setLabel('🃏 Main Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`bj_stats_${userId}`).setLabel('📊 Stats').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`bj_quit_${userId}`).setLabel('🚪 Selesai').setStyle(ButtonStyle.Secondary)
        );
    }

    const canDouble = game.playerHand.length === 2 && !game.doubled;
    const userData = getOrCreateUser(game.guildId, userId);
    const canAffordDouble = userData.balance >= game.bet;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bj_hit_${userId}`).setLabel('🃏 Hit').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`bj_stand_${userId}`).setLabel('✋ Stand').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`bj_double_${userId}`).setLabel('💰 Double').setStyle(ButtonStyle.Danger).setDisabled(!canDouble || !canAffordDouble)
    );
}

// ==================== START GAME ====================
function startBlackjack(guildId, userId, bet) {
    const userData = getOrCreateUser(guildId, userId);
    if (userData.balance < bet) {
        return { success: false, error: `❌ Saldo kurang! Punya 🪙 ${userData.balance.toLocaleString('id-ID')}` };
    }
    if (bet < 100) return { success: false, error: '❌ Minimal taruhan 🪙 100!' };
    if (bet > 100000) return { success: false, error: '❌ Maksimal taruhan 🪙 100.000!' };

    // Check if already in a game
    const existing = getGame(guildId, userId);
    if (existing) {
        return { success: false, error: '❌ Kamu masih dalam game! Selesaikan dulu.' };
    }

    // Deduct bet
    db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(bet, guildId, userId);
    addSpending(guildId, userId, 'gambling', bet);

    const game = createGame(guildId, userId, bet);
    addComboFeature(guildId, userId, 'gambling');

    // Check for immediate blackjack
    if (game.status === 'blackjack') {
        dealerPlay(game);
        const result = determineResult(game);
        // Pay out
        let totalPayout = result.payout;
        if (game.sideBetPayout > 0) {
            totalPayout += game.sideBetPayout;
            incrementUserStat(guildId, userId, 'blackjack_pairs');
        }
        if (totalPayout > 0) {
            db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(totalPayout, guildId, userId);
            if (result.result === 'blackjack' || result.result === 'win') {
                addIncome(guildId, userId, 'gambling', totalPayout - bet);
                incrementUserStat(guildId, userId, 'blackjack_wins');
                incrementUserStat(guildId, userId, 'total_gambling_wins', totalPayout - bet);
            }
        }
        endGame(guildId, userId);
        incrementUserStat(guildId, userId, 'blackjack_games');
        return { success: true, game, result, immediate: true };
    }

    return { success: true, game, result: null, immediate: false };
}

// ==================== HANDLER: Button Clicks ====================
async function handleBlackjackButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan game kamu!', ephemeral: true });
    }

    const action = parts[1];

    // === NEW GAME (replay with same bet) ===
    if (action === 'newgame') {
        // Get last bet from stats or default
        const lastBet = activeBlackjackGames.get(`${guildId}_${userId}_lastbet`) || 500;
        const result = startBlackjack(guildId, userId, lastBet);
        if (!result.success) {
            return interaction.reply({ content: result.error, ephemeral: true });
        }

        if (result.immediate) {
            const embed = buildGameEmbed(result.game, true, result.result);
            const row = buildGameButtons(userId, result.game, true);
            return interaction.update({ embeds: [embed], components: [row] });
        }

        const embed = buildGameEmbed(result.game);
        const row = buildGameButtons(userId, result.game);
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === QUIT ===
    if (action === 'quit') {
        endGame(guildId, userId);
        const embed = new EmbedBuilder()
            .setTitle('🃏 Blackjack')
            .setColor('#95A5A6')
            .setDescription('Terima kasih sudah bermain! 🎉\n\nGunakan `/blackjack <taruhan>` untuk main lagi.')
            .setFooter({ text: 'Blackjack — Hit 21 to win!' });
        return interaction.update({ embeds: [embed], components: [] });
    }

    // === STATS ===
    if (action === 'stats') {
        const games = getUserStat(guildId, userId, 'blackjack_games') || 0;
        const wins = getUserStat(guildId, userId, 'blackjack_wins') || 0;
        const losses = getUserStat(guildId, userId, 'blackjack_losses') || 0;
        const doubles = getUserStat(guildId, userId, 'blackjack_doubles') || 0;
        const totalWon = getUserStat(guildId, userId, 'total_gambling_wins') || 0;
        const pairs = getUserStat(guildId, userId, 'blackjack_pairs') || 0;
        const wr = games > 0 ? Math.round((wins / games) * 100) : 0;
        const embed = new EmbedBuilder()
            .setTitle('📊 Blackjack Stats')
            .setColor('#9B59B6')
            .setDescription(
                `**🃏 Total Games:** ${games}\n` +
                `**✅ Wins:** ${wins} | **❌ Losses:** ${losses}\n` +
                `**📊 Winrate:** ${wr}%\n` +
                `**💰 Doubles:** ${doubles}\n` +
                `**🪙 Total Won:** ${totalWon.toLocaleString('id-ID')}\n` +
                `**🎯 Perfect Pairs:** ${pairs}\n`
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bj_newgame_${userId}`).setLabel('🃏 Main Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`bj_quit_${userId}`).setLabel('🚪 Selesai').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // Get active game
    const game = getGame(guildId, userId);
    if (!game) {
        return interaction.reply({ content: '❌ Tidak ada game aktif! Gunakan `/blackjack <taruhan>` untuk mulai.', ephemeral: true });
    }

    // Timeout check: auto-stand games older than 5 minutes
    if (game && game.startedAt && Date.now() - game.startedAt > 300000) {
        dealerPlay(game);
        const result = determineResult(game);
        let totalPayout = result.payout;
        if (game.sideBetPayout > 0) {
            totalPayout += game.sideBetPayout;
            incrementUserStat(guildId, userId, 'blackjack_pairs');
        }
        if (totalPayout > 0) {
            db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(totalPayout, guildId, userId);
        }
        endGame(guildId, userId);
        incrementUserStat(guildId, userId, 'blackjack_games');
        if (result.result === 'win') incrementUserStat(guildId, userId, 'blackjack_wins');
        if (result.result === 'lose' || result.result === 'bust') incrementUserStat(guildId, userId, 'blackjack_losses');
        return interaction.update({ embeds: [buildGameEmbed(game, true, result)], components: [buildGameButtons(userId, game, true)] });
    }

    // === HIT ===
    if (action === 'hit') {
        game.playerHand.push(game.deck.pop());

        if (isBust(game.playerHand)) {
            // Player busts
            game.status = 'bust';
            dealerPlay(game);
            const result = determineResult(game);
            // Side bet still pays even on bust
            if (game.sideBetPayout > 0) {
                db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(game.sideBetPayout, guildId, userId);
                incrementUserStat(guildId, userId, 'blackjack_pairs');
            }
            endGame(guildId, userId);
            incrementUserStat(guildId, userId, 'blackjack_games');
            incrementUserStat(guildId, userId, 'blackjack_losses');

            const embed = buildGameEmbed(game, true, result);
            const row = buildGameButtons(userId, game, true);
            return interaction.update({ embeds: [embed], components: [row] });
        }

        // Auto-stand at 21
        if (handValue(game.playerHand) === 21) {
            dealerPlay(game);
            const result = determineResult(game);
            let totalPayout = result.payout;
            if (game.sideBetPayout > 0) {
                totalPayout += game.sideBetPayout;
                incrementUserStat(guildId, userId, 'blackjack_pairs');
            }
            if (totalPayout > 0) {
                db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(totalPayout, guildId, userId);
                if (result.result === 'win') {
                    addIncome(guildId, userId, 'gambling', totalPayout - game.bet);
                    incrementUserStat(guildId, userId, 'blackjack_wins');
                    incrementUserStat(guildId, userId, 'total_gambling_wins', totalPayout - game.bet);
                }
            }
            endGame(guildId, userId);
            incrementUserStat(guildId, userId, 'blackjack_games');
            if (result.result === 'lose') incrementUserStat(guildId, userId, 'blackjack_losses');

            const embed = buildGameEmbed(game, true, result);
            const row = buildGameButtons(userId, game, true);
            checkAchievements(interaction.guild, userId, {});
            return interaction.update({ embeds: [embed], components: [row] });
        }

        const embed = buildGameEmbed(game);
        const row = buildGameButtons(userId, game);
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === STAND ===
    if (action === 'stand') {
        dealerPlay(game);
        const result = determineResult(game);

        let totalPayout = result.payout;
        if (game.sideBetPayout > 0) {
            totalPayout += game.sideBetPayout;
            incrementUserStat(guildId, userId, 'blackjack_pairs');
        }
        if (totalPayout > 0) {
            db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(totalPayout, guildId, userId);
            if (result.result === 'win') {
                addIncome(guildId, userId, 'gambling', totalPayout - game.bet);
                incrementUserStat(guildId, userId, 'blackjack_wins');
                incrementUserStat(guildId, userId, 'total_gambling_wins', totalPayout - game.bet);
            }
        }
        if (result.result === 'lose') incrementUserStat(guildId, userId, 'blackjack_losses');
        endGame(guildId, userId);
        incrementUserStat(guildId, userId, 'blackjack_games');
        updateQuestProgress(guildId, userId, 'blackjack', 1); // counts as gambling activity

        const embed = buildGameEmbed(game, true, result);
        const row = buildGameButtons(userId, game, true);
        activeBlackjackGames.set(`${guildId}_${userId}_lastbet`, game.bet);
        checkAchievements(interaction.guild, userId, {});
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === DOUBLE DOWN ===
    if (action === 'double') {
        if (game.playerHand.length !== 2 || game.doubled) {
            return interaction.reply({ content: '❌ Double hanya bisa di awal (2 kartu)!', ephemeral: true });
        }

        const userData = getOrCreateUser(guildId, userId);
        if (userData.balance < game.bet) {
            return interaction.reply({ content: '❌ Saldo kurang untuk double!', ephemeral: true });
        }

        // Deduct additional bet
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(game.bet, guildId, userId);
        addSpending(guildId, userId, 'gambling', game.bet);
        game.bet *= 2;
        game.doubled = true;

        // Draw exactly 1 card then auto-stand
        game.playerHand.push(game.deck.pop());

        if (isBust(game.playerHand)) {
            game.status = 'bust';
            dealerPlay(game);
            const result = determineResult(game);
            // Side bet still pays even on bust
            if (game.sideBetPayout > 0) {
                db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(game.sideBetPayout, guildId, userId);
                incrementUserStat(guildId, userId, 'blackjack_pairs');
            }
            endGame(guildId, userId);
            incrementUserStat(guildId, userId, 'blackjack_games');
            incrementUserStat(guildId, userId, 'blackjack_losses');

            const embed = buildGameEmbed(game, true, result);
            const row = buildGameButtons(userId, game, true);
            return interaction.update({ embeds: [embed], components: [row] });
        }

        // Auto-stand after double
        dealerPlay(game);
        const result = determineResult(game);

        let totalPayout = result.payout;
        if (game.sideBetPayout > 0) {
            totalPayout += game.sideBetPayout;
            incrementUserStat(guildId, userId, 'blackjack_pairs');
        }
        if (totalPayout > 0) {
            db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(totalPayout, guildId, userId);
            if (result.result === 'win') {
                addIncome(guildId, userId, 'gambling', totalPayout - game.bet);
                incrementUserStat(guildId, userId, 'blackjack_wins');
                incrementUserStat(guildId, userId, 'total_gambling_wins', totalPayout - game.bet);
            }
        }
        if (result.result === 'lose') incrementUserStat(guildId, userId, 'blackjack_losses');
        endGame(guildId, userId);
        incrementUserStat(guildId, userId, 'blackjack_games');
        incrementUserStat(guildId, userId, 'blackjack_doubles');

        const embed = buildGameEmbed(game, true, result);
        const row = buildGameButtons(userId, game, true);
        activeBlackjackGames.set(`${guildId}_${userId}_lastbet`, game.bet / 2);
        checkAchievements(interaction.guild, userId, {});
        return interaction.update({ embeds: [embed], components: [row] });
    }
}

// ==================== DETECTORS ====================
function isBlackjackButton(customId) {
    return customId.startsWith('bj_');
}

// ==================== EXPORTS ====================
module.exports = {
    startBlackjack,
    handleBlackjackButton,
    isBlackjackButton,
    activeBlackjackGames,
    handValue,
    getCardValue,
    buildGameEmbed,
    buildGameButtons
};
