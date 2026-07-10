// systems/casinoPanel.js - Casino Panel UI System (Button-based gambling)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { db, getOrCreateUser, getUserStat, incrementUserStat, setUserStatMax, addIncome, subtractUserBalance, addUserBalance } = require('../database');
const { getRandomInt } = require('../utils');
const { spinSlot, getSlotResult } = require('./slots');
const { checkAchievements } = require('./achievements');
const { addComboFeature } = require('./combo');
const { updateQuestProgress } = require('./quests');
const state = require('../state');
const { fishCooldowns, activeCoinflips } = state;
const ui = require('./ui');

// Roulette constants
const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];


// ============ HELPER: Build main casino panel ============
function buildCasinoPanel(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);
    const cfWins = getUserStat(guildId, userId, 'coinflip_wins') || 0;
    const slotWins = getUserStat(guildId, userId, 'slot_wins') || 0;
    const rouletteWins = getUserStat(guildId, userId, 'roulette_wins') || 0;
    const totalWins = cfWins + slotWins + rouletteWins;
    const jackpots = getUserStat(guildId, userId, 'slot_jackpot_7_count') || 0;

    const embed = new EmbedBuilder()
        .setTitle(ui.title('🎰', 'CASINO', username))
        .setColor(ui.COLORS.casino)
        .setDescription(
            `Selamat datang di meja judi! Pasang taruhan, semoga hoki. 🍀\n` +
            ui.statBlock([
                `${ui.money(userData.balance)}`,
                `🎲 Total Menang: **${totalWins}**  •  🏆 Jackpot: **${jackpots}**`,
            ]) +
            `\n**Pilih permainanmu:**\n` +
            ui.menuList([
                { emoji: '🪙', label: 'Coinflip', desc: 'Tebak kepala/ekor — tebakan benar, uang jadi 2x' },
                { emoji: '🎰', label: 'Slot', desc: 'Tarik tuas, samakan simbol — hadiah hingga 25x' },
                { emoji: '🎯', label: 'Roulette', desc: 'Pasang di warna/angka — hadiah hingga 14x' },
                { emoji: '🃏', label: 'Blackjack', desc: 'Kartu 21 — hit, stand, double. Pair = bonus!' },
            ]) +
            `\n\n> ⚠️ *Ingat: ini hiburan, bukan cara cari uang. Main secukupnya ya!*`
        )
        .setFooter({ text: ui.footer('Klik salah satu game untuk mulai bertaruh') })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`casino_coinflip_${userId}`).setLabel('🪙 Coinflip').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`casino_slot_${userId}`).setLabel('🎰 Slot').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`casino_roulette_${userId}`).setLabel('🎯 Roulette').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`casino_blackjack_${userId}`).setLabel('🃏 Blackjack').setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [row] };
}


// ============ BUILD: Coinflip bet panel ============
function buildCoinflipBetPanel(guildId, userId) {
    const userData = getOrCreateUser(guildId, userId);
    const embed = new EmbedBuilder()
        .setTitle('\ud83e\ude99 COINFLIP \u2014 Masukkan taruhan!')
        .setColor('#F1C40F')
        .setDescription(
            `\ud83d\udcb0 Saldo: \ud83e\ude99 **${userData.balance.toLocaleString('id-ID')}**\n\n` +
            `Pilih jumlah taruhan:\n` +
            `> Win = **2x** taruhan\n` +
            `> Max taruhan: \ud83e\ude99 **2,000**`
        )
        .setFooter({ text: 'Pilih nominal taruhan di bawah' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`casino_cf_bet_100_${userId}`).setLabel('100').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`casino_cf_bet_500_${userId}`).setLabel('500').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`casino_cf_bet_1000_${userId}`).setLabel('1000').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`casino_cf_bet_2000_${userId}`).setLabel('2000').setStyle(ButtonStyle.Secondary)
    );
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`casino_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row, navRow] };
}


// ============ BUILD: Coinflip choice panel (Head/Tail) ============
function buildCoinflipChoicePanel(guildId, userId, bet) {
    const embed = new EmbedBuilder()
        .setTitle('\ud83e\ude99 COINFLIP \u2014 Pilih Sisi!')
        .setColor('#F1C40F')
        .setDescription(
            `> \ud83d\udcb0 Taruhan: \ud83e\ude99 **${bet.toLocaleString('id-ID')}**\n\n` +
            `Pilih **Head** atau **Tail**!`
        )
        .setFooter({ text: 'Pilih dalam 30 detik atau taruhan dikembalikan' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`casino_cf_head_${bet}_${userId}`).setLabel('\ud83e\ude99 Head').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`casino_cf_tail_${bet}_${userId}`).setLabel('\ud83e\udda5 Tail').setStyle(ButtonStyle.Danger)
    );
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`casino_coinflip_${userId}`).setLabel('\ud83d\udd19 Ganti Bet').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row, navRow] };
}


// ============ BUILD: Slot bet panel ============
function buildSlotBetPanel(guildId, userId) {
    const userData = getOrCreateUser(guildId, userId);
    const embed = new EmbedBuilder()
        .setTitle('\ud83c\udfb0 SLOT MACHINE \u2014 Masukkan taruhan!')
        .setColor('#FF6B00')
        .setDescription(
            `\ud83d\udcb0 Saldo: \ud83e\ude99 **${userData.balance.toLocaleString('id-ID')}**\n\n` +
            `Pilih jumlah taruhan:\n` +
            `> \ud83c\udf52 2x | \ud83c\udf4b 3x | \ud83c\udf4a 4x | \ud83c\udf47 5x\n` +
            `> \ud83d\udd14 8x | \u2b50 12x | \ud83d\udc8e 18x | 7\ufe0f\u20e3 **25x**\n` +
            `> Max taruhan: \ud83e\ude99 **1,000**`
        )
        .setFooter({ text: '3 simbol sama = JACKPOT!' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`casino_slot_bet_100_${userId}`).setLabel('100').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`casino_slot_bet_500_${userId}`).setLabel('500').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`casino_slot_bet_1000_${userId}`).setLabel('1000').setStyle(ButtonStyle.Secondary)
    );
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`casino_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row, navRow] };
}


// ============ BUILD: Roulette panel (bet + choice) ============
function buildRouletteBetPanel(guildId, userId) {
    const userData = getOrCreateUser(guildId, userId);
    const embed = new EmbedBuilder()
        .setTitle('\ud83c\udfaf ROULETTE \u2014 Pilih taruhan & tebakan!')
        .setColor('#8B0000')
        .setDescription(
            `\ud83d\udcb0 Saldo: \ud83e\ude99 **${userData.balance.toLocaleString('id-ID')}**\n\n` +
            `**Langkah 1:** Pilih tebakan di menu bawah\n` +
            `**Langkah 2:** Pilih jumlah taruhan\n\n` +
            `> \ud83d\udd34 Merah / \u26ab Hitam = **2x**\n` +
            `> \ud83d\udcca Ganjil / Genap = **2x**\n` +
            `> \ud83d\udfe2 Hijau (0) = **14x**\n` +
            `> Max taruhan: \ud83e\ude99 **2,000**`
        )
        .setFooter({ text: 'Pilih tebakan dulu, lalu pilih taruhan' });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`casino_roulette_choice_${userId}`)
        .setPlaceholder('\ud83c\udfaf Pilih tebakan...')
        .setMinValues(1).setMaxValues(1)
        .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('Merah (2x)').setValue('merah').setEmoji('\ud83d\udd34'),
            new StringSelectMenuOptionBuilder().setLabel('Hitam (2x)').setValue('hitam').setEmoji('\u26ab'),
            new StringSelectMenuOptionBuilder().setLabel('Hijau / 0 (14x)').setValue('hijau').setEmoji('\ud83d\udfe2'),
            new StringSelectMenuOptionBuilder().setLabel('Ganjil (2x)').setValue('ganjil').setEmoji('\ud83d\udcca'),
            new StringSelectMenuOptionBuilder().setLabel('Genap (2x)').setValue('genap').setEmoji('\ud83d\udcca')
        );

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`casino_back_${userId}`).setLabel('\ud83d\udd19 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [selectRow, navRow] };
}


// ============ BUILD: Roulette bet buttons after choice ============
function buildRouletteBetButtons(guildId, userId, choice) {
    const userData = getOrCreateUser(guildId, userId);
    const choiceDisplay = choice.charAt(0).toUpperCase() + choice.slice(1);
    const embed = new EmbedBuilder()
        .setTitle(`\ud83c\udfaf ROULETTE \u2014 ${choiceDisplay}`)
        .setColor('#8B0000')
        .setDescription(
            `\ud83d\udcb0 Saldo: \ud83e\ude99 **${userData.balance.toLocaleString('id-ID')}**\n\n` +
            `\ud83c\udfaf Tebakan: **${choiceDisplay}**\n\n` +
            `Pilih jumlah taruhan:`
        )
        .setFooter({ text: 'Klik untuk langsung spin!' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`casino_rl_spin_${choice}_100_${userId}`).setLabel('100').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`casino_rl_spin_${choice}_500_${userId}`).setLabel('500').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`casino_rl_spin_${choice}_1000_${userId}`).setLabel('1000').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`casino_rl_spin_${choice}_2000_${userId}`).setLabel('2000').setStyle(ButtonStyle.Secondary)
    );
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`casino_roulette_${userId}`).setLabel('\ud83d\udd19 Ganti Pilihan').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`casino_back_${userId}`).setLabel('\ud83c\udfb0 Menu Casino').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row, navRow] };
}


// ============ BUILD: Blackjack bet panel ============
function buildBlackjackBetPanel(guildId, userId) {
    const userData = getOrCreateUser(guildId, userId);
    const embed = new EmbedBuilder()
        .setTitle('🃏 BLACKJACK — Masukkan taruhan!')
        .setColor('#3498DB')
        .setDescription(
            `💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n\n` +
            `Pilih jumlah taruhan:\n` +
            `> Hit 21 = **2.5x** | Win = **2x** | Pair = **bonus!**\n` +
            `> Max taruhan: 🪙 **100,000**`
        )
        .setFooter({ text: 'Pilih nominal taruhan di bawah' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`casino_blackjack_bet_1000_${userId}`).setLabel('1K').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`casino_blackjack_bet_5000_${userId}`).setLabel('5K').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`casino_blackjack_bet_10000_${userId}`).setLabel('10K').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`casino_blackjack_bet_25000_${userId}`).setLabel('25K').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`casino_blackjack_bet_50000_${userId}`).setLabel('50K').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`casino_blackjack_bet_100000_${userId}`).setLabel('100K').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`casino_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row, row2] };
}


// ============ HANDLER: /casino command ============
async function handleCasinoCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const panel = buildCasinoPanel(guildId, userId, interaction.user.username);
    return interaction.reply(panel);
}

// ============ HANDLER: Casino button clicks ============
async function handleCasinoButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    // Validate ownership
    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '\u274c Ini bukan panel casino kamu!', ephemeral: true });
    }

    const action = parts[1]; // coinflip, slot, roulette, back, cf, rl

    // === BACK TO MAIN CASINO ===
    if (action === 'back') {
        const panel = buildCasinoPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    // === COINFLIP BET PANEL ===
    // Guard against `casino_cf_bet_X` (action 'cf') — only catch the plain panel button.
    if (action === 'coinflip' && parts[2] !== 'bet') {
        const panel = buildCoinflipBetPanel(guildId, userId);
        return interaction.update(panel);
    }

    // === SLOT BET PANEL ===
    // IMPORTANT: `casino_slot_${userId}` (panel) and `casino_slot_bet_X_${userId}` (execute)
    // both have parts[1] === 'slot'. Without this guard the panel branch intercepts the bet
    // click and just re-renders the bet panel instead of spinning. Guard on parts[2] !== 'bet'
    // so bet selections fall through to the execution branch below.
    if (action === 'slot' && parts[2] !== 'bet') {
        const panel = buildSlotBetPanel(guildId, userId);
        return interaction.update(panel);
    }

    // === ROULETTE CHOICE PANEL ===
    // Guard against `casino_rl_spin_*` (action 'rl') — only catch the plain panel button.
    if (action === 'roulette' && parts[2] !== 'bet') {
        const panel = buildRouletteBetPanel(guildId, userId);
        return interaction.update(panel);
    }

    // === BLACKJACK BET PANEL ===
    if (action === 'blackjack' && parts[2] !== 'bet') {
        const panel = buildBlackjackBetPanel(guildId, userId);
        return interaction.update(panel);
    }

    // === BLACKJACK BET SELECTION (start game) ===
    if (action === 'blackjack' && parts[2] === 'bet') {
        const bet = parseInt(parts[3]);
        const { startBlackjack } = require('./blackjack');
        const result = startBlackjack(guildId, userId, bet);
        if (!result.success) {
            return interaction.reply({ content: result.error, ephemeral: true });
        }

        const { buildGameEmbed, buildGameButtons } = require('./blackjack');
        if (result.immediate) {
            const embed = buildGameEmbed(result.game, true, result.result);
            const row = buildGameButtons(userId, result.game, true);
            return interaction.update({ embeds: [embed], components: [row] });
        }

        const embed = buildGameEmbed(result.game);
        const row = buildGameButtons(userId, result.game);
        return interaction.update({ embeds: [embed], components: [row] });
    }


    // === COINFLIP BET SELECTION ===
    if (action === 'cf' && parts[2] === 'bet') {
        const bet = parseInt(parts[3]);
        const userData = getOrCreateUser(guildId, userId);
        if (userData.balance < bet) {
            return interaction.reply({ content: `\u274c Saldo kurang! Kamu punya \ud83e\ude99 **${userData.balance.toLocaleString('id-ID')}**`, ephemeral: true });
        }
        const panel = buildCoinflipChoicePanel(guildId, userId, bet);
        return interaction.update(panel);
    }

    // === COINFLIP HEAD/TAIL CHOICE (execute game) ===
    if (action === 'cf' && (parts[2] === 'head' || parts[2] === 'tail')) {
        const choice = parts[2];
        const bet = parseInt(parts[3]);
        const userData = getOrCreateUser(guildId, userId);
        if (userData.balance < bet || !Number.isFinite(bet) || bet <= 0) {
            return interaction.reply({ content: `\u274c Saldo kurang! Kamu punya \ud83e\ude99 **${userData.balance.toLocaleString('id-ID')}**`, ephemeral: true });
        }

        // Atomic debit — never go negative even under double-click
        if (!subtractUserBalance(guildId, userId, bet)) {
            const bal = getOrCreateUser(guildId, userId).balance;
            return interaction.reply({ content: `\u274c Saldo kurang! Kamu punya \ud83e\ude99 **${bal.toLocaleString('id-ID')}**`, ephemeral: true });
        }
        addComboFeature(guildId, userId, 'gambling');
        incrementUserStat(guildId, userId, 'total_coinflips');
        incrementUserStat(guildId, userId, 'total_bets', bet);
        updateQuestProgress(guildId, userId, 'coinflip', 1);

        // Show animation
        const animEmbed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle('\ud83e\ude99 Coinflip \u2014 Melempar...')
            .setDescription(`> \ud83e\ude99 *Koin melayang...*\n> \ud83d\udcb0 Taruhan: \ud83e\ude99 **${bet.toLocaleString('id-ID')}**\n> \ud83c\udfaf Pilihan: **${choice === 'head' ? '\ud83e\ude99 Head' : '\ud83e\udda5 Tail'}**`);
        await interaction.update({ embeds: [animEmbed], components: [] });


        // Result after delay
        setTimeout(async () => {
            const coinResult = Math.random() < 0.5 ? 'head' : 'tail';
            const won = choice === coinResult;
            const resultEmoji = coinResult === 'head' ? '\ud83e\ude99' : '\ud83e\udda5';
            const resultName = coinResult === 'head' ? 'HEAD' : 'TAIL';

            if (won) {
                addUserBalance(guildId, userId, bet * 2);
                incrementUserStat(guildId, userId, 'coinflip_wins');
                incrementUserStat(guildId, userId, 'total_gambling_wins', bet);
                addIncome(guildId, userId, 'gambling', bet);
                setUserStatMax(guildId, userId, 'biggest_win', bet);
                await checkAchievements(interaction.guild, userId, { type: 'coinflip' });
            } else {
                incrementUserStat(guildId, userId, 'coinflip_losses');
                incrementUserStat(guildId, userId, 'total_gambling_lost', bet);
                await checkAchievements(interaction.guild, userId, { type: 'coinflip' });
            }

            const freshData = getOrCreateUser(guildId, userId);
            const embed = new EmbedBuilder()
                .setColor(won ? '#2ECC71' : '#E74C3C')
                .setTitle(`${resultEmoji} ${resultName} \u2014 ${won ? 'MENANG! \ud83c\udf89' : 'KALAH! \ud83d\udc80'}`)
                .setDescription(
                    `> Koin mendarat: ${resultEmoji} **${resultName}**\n` +
                    `> Pilihan kamu: **${choice === 'head' ? '\ud83e\ude99 Head' : '\ud83e\udda5 Tail'}** ${won ? '\u2705' : '\u274c'}\n\n` +
                    `> ${won ? '\ud83d\udcb0 Dapat' : '\ud83d\udcb8 Hilang'}: \ud83e\ude99 **${won ? '+' : '-'}${bet.toLocaleString('id-ID')}**\n` +
                    `> \ud83d\udcb3 Saldo: \ud83e\ude99 **${freshData.balance.toLocaleString('id-ID')}**`
                )
                .setFooter({ text: interaction.user.username });

            const playAgainRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`casino_coinflip_${userId}`).setLabel('\ud83d\udd04 Main Lagi').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`casino_back_${userId}`).setLabel('\ud83c\udfb0 Menu Casino').setStyle(ButtonStyle.Secondary)
            );
            interaction.editReply({ embeds: [embed], components: [playAgainRow] }).catch(() => {});
        }, 2000);
        return;
    }


    // === SLOT BET SELECTION (execute game) ===
    if (action === 'slot' && parts[2] === 'bet') {
        const bet = parseInt(parts[3]);
        const userData = getOrCreateUser(guildId, userId);
        if (userData.balance < bet) {
            return interaction.reply({ content: `\u274c Saldo kurang! Kamu punya \ud83e\ude99 **${userData.balance.toLocaleString('id-ID')}**`, ephemeral: true });
        }

        // Cooldown check
        const slotCdKey = `slot_${guildId}_${userId}`;
        if (fishCooldowns.has(slotCdKey) && Date.now() < fishCooldowns.get(slotCdKey)) {
            const remaining = Math.ceil((fishCooldowns.get(slotCdKey) - Date.now()) / 1000);
            return interaction.reply({ content: `\u23f3 Mesin slot masih panas! Tunggu **${remaining} detik**.`, ephemeral: true });
        }
        fishCooldowns.set(slotCdKey, Date.now() + 5000);

        if (!subtractUserBalance(guildId, userId, bet)) {
            const bal = getOrCreateUser(guildId, userId).balance;
            return interaction.reply({ content: `\u274c Saldo kurang! Kamu punya \ud83e\ude99 **${bal.toLocaleString('id-ID')}**`, ephemeral: true });
        }
        addComboFeature(guildId, userId, 'gambling');
        incrementUserStat(guildId, userId, 'total_slot_spins');
        incrementUserStat(guildId, userId, 'total_bets', bet);
        updateQuestProgress(guildId, userId, 'slot', 1);

        // Show spinning
        const spinEmbed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle('\ud83c\udfb0 Slot Machine \u2014 Spinning...')
            .setDescription(`> \ud83c\udfb0 **SLOT MACHINE**\n>\n> \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\n> \u2551   \u2753  \u2503  \u2753  \u2503  \u2753   \u2551\n> \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d\n>\n> \ud83d\udcb0 Taruhan: \ud83e\ude99 **${bet.toLocaleString('id-ID')}**`);
        await interaction.update({ embeds: [spinEmbed], components: [] });


        // Generate result after delay
        setTimeout(async () => {
            let reels = spinSlot();
            const luckySpinActive = getUserStat(guildId, userId, 'lucky_spin_active');
            if (luckySpinActive > 0) {
                reels[1] = reels[0];
                incrementUserStat(guildId, userId, 'lucky_spin_active', -1);
            }
            const result = getSlotResult(reels, bet);
            const slotDisplay = `> \ud83c\udfb0 **SLOT MACHINE**\n>\n> \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\n> \u2551   ${reels[0].emoji}  \u2503  ${reels[1].emoji}  \u2503  ${reels[2].emoji}   \u2551\n> \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d`;

            let embed;
            if (result.jackpot && reels[0].id === 'seven') {
                embed = new EmbedBuilder().setColor('#FFD700').setTitle('\ud83c\udfb0\ud83d\udcb0 MEGA JACKPOT!!! \ud83d\udcb0\ud83c\udfb0').setDescription(`${slotDisplay}\n\n> ${result.desc}\n\n> \ud83d\udcb0 Taruhan: \ud83e\ude99 ${bet.toLocaleString('id-ID')}\n> \ud83c\udf89 Menang: \ud83e\ude99 **+${result.payout.toLocaleString('id-ID')}** \ud83c\udf89\ud83c\udf89\ud83c\udf89`);
                incrementUserStat(guildId, userId, 'slot_jackpot_7_count');
            } else if (result.jackpot) {
                embed = new EmbedBuilder().setColor('#FF6B00').setTitle('\ud83c\udfb0\u2728 JACKPOT! \u2728\ud83c\udfb0').setDescription(`${slotDisplay}\n\n> ${result.desc}\n\n> \ud83d\udcb0 Taruhan: \ud83e\ude99 ${bet.toLocaleString('id-ID')}\n> \ud83c\udf89 Menang: \ud83e\ude99 **+${result.payout.toLocaleString('id-ID')}** \ud83c\udf89`);
            } else if (result.win) {
                embed = new EmbedBuilder().setColor('#2ECC71').setTitle('\ud83c\udfb0 MENANG!').setDescription(`${slotDisplay}\n\n> ${result.desc}\n\n> \ud83d\udcb0 Taruhan: \ud83e\ude99 ${bet.toLocaleString('id-ID')}\n> \u2705 Menang: \ud83e\ude99 **+${result.payout.toLocaleString('id-ID')}**`);
            } else {
                embed = new EmbedBuilder().setColor('#E74C3C').setTitle('\ud83c\udfb0 Slot Machine').setDescription(`${slotDisplay}\n\n> \ud83d\ude14 Tidak ada yang cocok...\n\n> \ud83d\udcb0 Taruhan: \ud83e\ude99 ${bet.toLocaleString('id-ID')}\n> \u274c Kalah: \ud83e\ude99 **-${bet.toLocaleString('id-ID')}**`);
            }

            if (result.win) {
                addUserBalance(guildId, userId, result.payout);
                incrementUserStat(guildId, userId, 'slot_wins');
                incrementUserStat(guildId, userId, 'slot_total_winnings', result.payout);
                const slotProfit = Math.max(0, result.payout - bet);
                incrementUserStat(guildId, userId, 'total_gambling_wins', slotProfit);
                addIncome(guildId, userId, 'gambling', slotProfit);
                setUserStatMax(guildId, userId, 'biggest_win', slotProfit);
                await checkAchievements(interaction.guild, userId, { type: 'slot', jackpot: result.jackpot, jackpot7: result.jackpot && reels[0].id === 'seven' });
            } else {
                incrementUserStat(guildId, userId, 'slot_losses');
                incrementUserStat(guildId, userId, 'total_gambling_lost', bet);
            }

            const freshData = getOrCreateUser(guildId, userId);
            embed.setFooter({ text: `Saldo: ${freshData.balance.toLocaleString('id-ID')} | ${interaction.user.username}` });

            const playAgainRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`casino_slot_${userId}`).setLabel('\ud83d\udd04 Spin Lagi').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`casino_back_${userId}`).setLabel('\ud83c\udfb0 Menu Casino').setStyle(ButtonStyle.Secondary)
            );
            interaction.editReply({ embeds: [embed], components: [playAgainRow] }).catch(() => {});
        }, 2000);
        return;
    }


    // === ROULETTE SPIN (execute game) ===
    if (action === 'rl' && parts[2] === 'spin') {
        const choice = parts[3]; // merah, hitam, hijau, ganjil, genap
        const bet = parseInt(parts[4]);
        const userData = getOrCreateUser(guildId, userId);
        if (userData.balance < bet) {
            return interaction.reply({ content: `\u274c Saldo kurang! Kamu punya \ud83e\ude99 **${userData.balance.toLocaleString('id-ID')}**`, ephemeral: true });
        }

        // Cooldown check
        const rlCdKey = `roulette_${guildId}_${userId}`;
        if (fishCooldowns.has(rlCdKey) && Date.now() < fishCooldowns.get(rlCdKey)) {
            const remaining = Math.ceil((fishCooldowns.get(rlCdKey) - Date.now()) / 1000);
            return interaction.reply({ content: `\u23f3 Meja roulette masih berputar! Tunggu **${remaining} detik**.`, ephemeral: true });
        }
        fishCooldowns.set(rlCdKey, Date.now() + 5000);

        if (!subtractUserBalance(guildId, userId, bet)) {
            const bal = getOrCreateUser(guildId, userId).balance;
            return interaction.reply({ content: `\u274c Saldo kurang! Kamu punya \ud83e\ude99 **${bal.toLocaleString('id-ID')}**`, ephemeral: true });
        }
        addComboFeature(guildId, userId, 'gambling');
        incrementUserStat(guildId, userId, 'total_roulette_spins');
        incrementUserStat(guildId, userId, 'total_bets', bet);

        // Show spinning
        const spinEmbed = new EmbedBuilder()
            .setColor('#8B0000')
            .setTitle('\ud83c\udfaf Roulette \u2014 Spinning...')
            .setDescription(`> \ud83c\udfa1 *Bola berputar...*\n>\n> \ud83d\udcb0 Taruhan: \ud83e\ude99 **${bet.toLocaleString('id-ID')}**\n> \ud83c\udfaf Pilihan: **${choice.charAt(0).toUpperCase() + choice.slice(1)}**`);
        await interaction.update({ embeds: [spinEmbed], components: [] });


        // Result after delay
        setTimeout(async () => {
            const resultNumber = Math.floor(Math.random() * 37);
            let resultColor, colorEmoji, colorName;
            if (resultNumber === 0) { resultColor = 'hijau'; colorEmoji = '\ud83d\udfe2'; colorName = 'Hijau'; }
            else if (RED_NUMBERS.includes(resultNumber)) { resultColor = 'merah'; colorEmoji = '\ud83d\udd34'; colorName = 'Merah'; }
            else { resultColor = 'hitam'; colorEmoji = '\u26ab'; colorName = 'Hitam'; }

            const isOdd = resultNumber > 0 && resultNumber % 2 !== 0;
            const isEven = resultNumber > 0 && resultNumber % 2 === 0;

            let won = false, multiplier = 0;
            if (choice === 'merah' && resultColor === 'merah') { won = true; multiplier = 2; }
            else if (choice === 'hitam' && resultColor === 'hitam') { won = true; multiplier = 2; }
            else if (choice === 'hijau' && resultColor === 'hijau') { won = true; multiplier = 14; }
            else if (choice === 'ganjil' && isOdd) { won = true; multiplier = 2; }
            else if (choice === 'genap' && isEven) { won = true; multiplier = 2; }

            const payout = won ? bet * multiplier : 0;

            if (won) {
                addUserBalance(guildId, userId, payout);
                incrementUserStat(guildId, userId, 'roulette_wins');
                incrementUserStat(guildId, userId, 'roulette_total_winnings', payout);
                const rlProfit = Math.max(0, payout - bet);
                incrementUserStat(guildId, userId, 'total_gambling_wins', rlProfit);
                addIncome(guildId, userId, 'gambling', rlProfit);
                setUserStatMax(guildId, userId, 'biggest_win', rlProfit);
                await checkAchievements(interaction.guild, userId, { type: 'roulette' });
            } else {
                incrementUserStat(guildId, userId, 'roulette_losses');
                incrementUserStat(guildId, userId, 'total_gambling_lost', bet);
                await checkAchievements(interaction.guild, userId, { type: 'roulette' });
            }

            const freshData = getOrCreateUser(guildId, userId);
            const choiceDisplay = choice.charAt(0).toUpperCase() + choice.slice(1);
            const embed = new EmbedBuilder()
                .setColor(won ? '#2ECC71' : '#E74C3C')
                .setTitle(`\ud83c\udfaf Roulette \u2014 ${won ? 'MENANG! \ud83c\udf89' : 'Kalah!'}`)
                .setDescription(
                    `> \ud83c\udfa1 **ROULETTE TABLE**\n>\n> \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n> \u2502  ${colorEmoji} **${resultNumber}**  \u2502\n> \u2502  ${colorName}  \u2502\n> \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n\n` +
                    `> \ud83c\udfaf Pilihan: **${choiceDisplay}** ${won ? '\u2705' : '\u274c'}\n` +
                    `> \ud83d\udcb0 Taruhan: \ud83e\ude99 ${bet.toLocaleString('id-ID')}\n` +
                    `> ${won ? `\ud83c\udf89 Menang: \ud83e\ude99 **+${payout.toLocaleString('id-ID')}** (${multiplier}x)` : `\ud83d\ude14 Kalah: \ud83e\ude99 **-${bet.toLocaleString('id-ID')}**`}`
                )
                .setFooter({ text: `Saldo: ${freshData.balance.toLocaleString('id-ID')} | ${interaction.user.username}` });

            const playAgainRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`casino_roulette_${userId}`).setLabel('\ud83d\udd04 Main Lagi').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`casino_back_${userId}`).setLabel('\ud83c\udfb0 Menu Casino').setStyle(ButtonStyle.Secondary)
            );
            interaction.editReply({ embeds: [embed], components: [playAgainRow] }).catch(() => {});
        }, 2500);
        return;
    }
}


// ============ HANDLER: Casino select menu (roulette choice) ============
async function handleCasinoSelectMenu(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '\u274c Ini bukan panel casino kamu!', ephemeral: true });
    }

    // casino_roulette_choice_userId
    if (parts[1] === 'roulette' && parts[2] === 'choice') {
        const choice = interaction.values[0]; // merah, hitam, hijau, ganjil, genap
        const panel = buildRouletteBetButtons(guildId, userId, choice);
        return interaction.update(panel);
    }
}

// ============ UTILITY: Detection helpers ============
function isCasinoPanelButton(customId) {
    return customId.startsWith('casino_') && !customId.startsWith('casino_roulette_choice_');
}

function isCasinoPanelSelectMenu(customId) {
    return customId.startsWith('casino_roulette_choice_');
}

module.exports = {
    buildCasinoPanel,
    handleCasinoCommand,
    handleCasinoButton,
    handleCasinoSelectMenu,
    isCasinoPanelButton,
    isCasinoPanelSelectMenu
};
