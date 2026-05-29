// systems/slots.js
const { getUserStat, incrementUserStat } = require('../database');

const SLOT_SYMBOLS = [
    { id: 'cherry', emoji: '🍒', name: 'Cherry', weight: 25 },
    { id: 'lemon', emoji: '🍋', name: 'Lemon', weight: 20 },
    { id: 'orange', emoji: '🍊', name: 'Orange', weight: 18 },
    { id: 'grape', emoji: '🍇', name: 'Grape', weight: 15 },
    { id: 'bell', emoji: '🔔', name: 'Bell', weight: 10 },
    { id: 'star', emoji: '⭐', name: 'Star', weight: 7 },
    { id: 'diamond', emoji: '💎', name: 'Diamond', weight: 4 },
    { id: 'seven', emoji: '7️⃣', name: 'Seven', weight: 1 }
];

const SLOT_PAYOUTS = {
    'cherry': 2, 'lemon': 3, 'orange': 4, 'grape': 5,
    'bell': 8, 'star': 12, 'diamond': 18, 'seven': 25
};

function spinSlot() {
    const totalWeight = SLOT_SYMBOLS.reduce((s, sym) => s + sym.weight, 0);
    const spin = () => {
        let roll = Math.random() * totalWeight, cumulative = 0;
        for (const sym of SLOT_SYMBOLS) { cumulative += sym.weight; if (roll <= cumulative) return sym; }
        return SLOT_SYMBOLS[0];
    };
    return [spin(), spin(), spin()];
}

function getSlotResult(reels, bet) {
    const [r1, r2, r3] = reels;
    if (r1.id === r2.id && r2.id === r3.id) {
        const multiplier = SLOT_PAYOUTS[r1.id];
        return { win: true, jackpot: true, multiplier, payout: bet * multiplier, desc: `🎰 **JACKPOT!!!** 3x ${r1.emoji} ${r1.name}! (${multiplier}x)` };
    }
    if (r1.id === r2.id || r2.id === r3.id || r1.id === r3.id) {
        const matchSym = r1.id === r2.id ? r1 : (r2.id === r3.id ? r2 : r1);
        const multiplier = Math.max(1, Math.floor(SLOT_PAYOUTS[matchSym.id] / 3));
        return { win: true, jackpot: false, multiplier, payout: bet * multiplier, desc: `✨ **2x Match!** ${matchSym.emoji} ${matchSym.name} (${multiplier}x)` };
    }
    return { win: false, jackpot: false, multiplier: 0, payout: 0, desc: '💀 Tidak ada yang cocok...' };
}

// Gift constants
const GIFT_TAX_RATE = 0.10;
const GIFT_MAX_PER_TRANSACTION = 10000;
const GIFT_RECEIVE_LIMIT_PER_DAY = 10000;

function getGiftReceivedToday(guildId, userId) {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    return getUserStat(guildId, userId, `gift_received_${today}`);
}

function addGiftReceivedToday(guildId, userId, amount) {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    incrementUserStat(guildId, userId, `gift_received_${today}`, amount);
}

module.exports = { SLOT_SYMBOLS, SLOT_PAYOUTS, spinSlot, getSlotResult, GIFT_TAX_RATE, GIFT_MAX_PER_TRANSACTION, GIFT_RECEIVE_LIMIT_PER_DAY, getGiftReceivedToday, addGiftReceivedToday };
