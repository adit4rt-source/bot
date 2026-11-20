// systems/vault.js — Closed-Loop Server Vault & Economic Circulation
const { db, getOrCreateUser } = require('../database');

// Ensure server_vault schema
db.exec(`
    CREATE TABLE IF NOT EXISTS server_vault (
        guildId TEXT PRIMARY KEY,
        balance INTEGER DEFAULT 0,
        total_tax_in INTEGER DEFAULT 0,
        total_payout INTEGER DEFAULT 0,
        last_weekly_tax INTEGER DEFAULT 0
    );
`);

/**
 * Get current vault balance for a guild
 * @param {string} guildId
 * @returns {number}
 */
function getVaultBalance(guildId) {
    const row = db.prepare('SELECT balance FROM server_vault WHERE guildId = ?').get(guildId);
    return row ? Number(row.balance) || 0 : 0;
}

/**
 * Add funds into the guild vault (from taxes, casino losses, wealth tax)
 * @param {string} guildId
 * @param {number} amount
 */
function addToVault(guildId, amount) {
    amount = Math.max(0, Math.floor(Number(amount) || 0));
    if (amount <= 0) return 0;

    db.prepare(`
        INSERT INTO server_vault (guildId, balance, total_tax_in)
        VALUES (?, ?, ?)
        ON CONFLICT(guildId) DO UPDATE SET
            balance = balance + excluded.balance,
            total_tax_in = total_tax_in + excluded.total_tax_in
    `).run(guildId, amount, amount);

    return getVaultBalance(guildId);
}

/**
 * Withdraw/payout from vault (for giveaways, jackpots, events)
 * @param {string} guildId
 * @param {number} amount
 * @returns {boolean} true if successful
 */
function withdrawFromVault(guildId, amount) {
    amount = Math.max(0, Math.floor(Number(amount) || 0));
    if (amount <= 0) return false;

    const current = getVaultBalance(guildId);
    if (current < amount) return false;

    db.prepare(`
        UPDATE server_vault
        SET balance = balance - ?, total_payout = total_payout + ?
        WHERE guildId = ? AND balance >= ?
    `).run(amount, amount, guildId, amount);

    return true;
}

/**
 * Closed-Loop Gift Tax Collector:
 * 50% of the 10% gift tax enters the server vault, 50% burned
 * @param {string} guildId
 * @param {number} taxAmount
 */
function collectGiftTax(guildId, taxAmount) {
    const vaultShare = Math.floor(taxAmount * 0.5);
    if (vaultShare > 0) {
        addToVault(guildId, vaultShare);
    }
    return vaultShare;
}

/**
 * Closed-Loop Casino Loss Collector:
 * 50% of house winnings goes to server vault for community distribution
 * @param {string} guildId
 * @param {number} lossAmount
 */
function collectCasinoLoss(guildId, lossAmount) {
    const vaultShare = Math.floor(lossAmount * 0.5);
    if (vaultShare > 0) {
        addToVault(guildId, vaultShare);
    }
    return vaultShare;
}

/**
 * Wealth Tax (Pajak Konglomerat):
 * Deducts 2% weekly from users with balance >= 500,000 who were inactive
 * Returns summary { affectedUsers, totalTaxCollected }
 * @param {string} guildId
 */
function runWealthTax(guildId = 'GLOBAL') {
    const WEALTH_THRESHOLD = 500000;
    const TAX_RATE = 0.02; // 2%

    const wealthyUsers = db.prepare(`
        SELECT userId, balance FROM users
        WHERE balance >= ?
    `).all(WEALTH_THRESHOLD);

    let affectedUsers = 0;
    let totalTaxCollected = 0;

    for (const u of wealthyUsers) {
        const tax = Math.floor(u.balance * TAX_RATE);
        if (tax > 0) {
            db.prepare('UPDATE users SET balance = balance - ? WHERE userId = ? AND balance >= ?').run(tax, u.userId, tax);
            totalTaxCollected += tax;
            affectedUsers++;
        }
    }

    if (totalTaxCollected > 0) {
        addToVault(guildId, totalTaxCollected);
    }

    return { affectedUsers, totalTaxCollected };
}

module.exports = {
    getVaultBalance,
    addToVault,
    withdrawFromVault,
    collectGiftTax,
    collectCasinoLoss,
    runWealthTax,
};
