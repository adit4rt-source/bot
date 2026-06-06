// systems/season.js — Seasonal (monthly) leaderboard
//
// Most player stats (total_fish_caught, dungeon_clears, total_earned…) are
// CUMULATIVE counters that only ever grow. To rank "this month's" activity we
// snapshot each counter at the start of a season (baseline), then a player's
// seasonal value for a stat = current_total − baseline (floored at 0).
//
// Seasons are bot-wide (global) and keyed by userId, identified by 'YYYY-MM' in
// Asia/Jakarta time. Rollover is lazy: ensureSeason() is called on access and,
// when the month changes, it archives the old top players and re-snapshots
// baselines for the new season.
//
// The seasonal score mirrors the overall-score weights but uses ONLY cumulative
// counters (level/balance/badges/streak are point-in-time, not deltas, so they
// are excluded).

const { db } = require('../database');

// Stat keys that contribute to the seasonal score, with their weights.
// `divide: true` means the delta is divided by the weight (used for money).
const SEASON_STAT_WEIGHTS = [
    { key: 'total_fish_caught', weight: 3 },
    { key: 'total_harvests',    weight: 4 },
    { key: 'total_crafts',      weight: 8 },
    { key: 'dungeon_clears',    weight: 6 },
    { key: 'boss_kills',        weight: 15 },
    { key: 'pvp_wins',          weight: 10 },
    { key: 'slot_wins',         weight: 2 },
    { key: 'coinflip_wins',     weight: 2 },
    { key: 'roulette_wins',     weight: 2 },
    { key: 'total_earned',      weight: 20, divide: true }, // money earned this season / 20
];
const SEASON_STAT_KEYS = SEASON_STAT_WEIGHTS.map(s => s.key);

// ==================== TABLES ====================
// These tables are NOT in the DB proxy's GLOBAL_TABLES set, so queries against
// them pass through unchanged in both global and per-guild mode.
db.exec(`CREATE TABLE IF NOT EXISTS season_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    seasonId TEXT,
    startedAt INTEGER
)`);
db.exec(`CREATE TABLE IF NOT EXISTS season_baselines (
    seasonId TEXT,
    userId TEXT,
    statKey TEXT,
    baseline INTEGER DEFAULT 0,
    PRIMARY KEY (seasonId, userId, statKey)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS season_history (
    seasonId TEXT,
    rank INTEGER,
    userId TEXT,
    score INTEGER,
    PRIMARY KEY (seasonId, rank)
)`);

// ==================== HELPERS ====================
function getCurrentSeasonId() {
    // 'YYYY-MM' in Asia/Jakarta (sv-SE gives ISO-like formatting).
    const ym = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
    return ym.slice(0, 7);
}

// Aggregate a cumulative counter across all guilds, grouped by userId.
// In global mode there is one row per (userId, statKey); in per-guild mode this
// sums the user's progress across servers. We avoid filtering by guildId so the
// DB proxy leaves the query untouched.
function getCurrentTotals(statKey) {
    const rows = db.prepare(
        'SELECT userId, SUM(stat_value) AS total FROM user_stats WHERE stat_key = ? GROUP BY userId'
    ).all(statKey);
    const map = new Map();
    for (const r of rows) map.set(r.userId, r.total || 0);
    return map;
}

// Snapshot baselines for the given season from the current cumulative totals.
// Called at season start so the new season's deltas begin at 0.
function snapshotBaselines(seasonId) {
    const insert = db.prepare(
        'INSERT OR REPLACE INTO season_baselines (seasonId, userId, statKey, baseline) VALUES (?, ?, ?, ?)'
    );
    const tx = db.transaction(() => {
        for (const { key } of SEASON_STAT_WEIGHTS) {
            const totals = getCurrentTotals(key);
            for (const [userId, total] of totals) {
                insert.run(seasonId, userId, key, total);
            }
        }
    });
    tx();
}

// Compute and archive the final top standings of a season before it rolls over.
function archiveSeason(seasonId, limit = 10) {
    const standings = computeSeasonalScores(seasonId).slice(0, limit);
    const insert = db.prepare(
        'INSERT OR REPLACE INTO season_history (seasonId, rank, userId, score) VALUES (?, ?, ?, ?)'
    );
    const tx = db.transaction(() => {
        standings.forEach((s, i) => insert.run(seasonId, i + 1, s.userId, s.score));
    });
    tx();
}

// ==================== ROLLOVER ====================
// Lazily ensure season_meta reflects the current month. On first run it seeds
// baselines (so pre-existing progress is NOT counted). On month change it
// archives the old season's top players, clears old baselines, and re-snapshots.
function ensureSeason() {
    const currentId = getCurrentSeasonId();
    const meta = db.prepare('SELECT * FROM season_meta WHERE id = 1').get();

    if (!meta) {
        // First ever season: baseline = current totals so history doesn't dump in.
        snapshotBaselines(currentId);
        db.prepare('INSERT OR REPLACE INTO season_meta (id, seasonId, startedAt) VALUES (1, ?, ?)')
            .run(currentId, Date.now());
        return currentId;
    }

    if (meta.seasonId !== currentId) {
        // Roll over: archive old, reset baselines for the new season.
        try { archiveSeason(meta.seasonId); } catch (e) { /* archiving must not block rollover */ }
        db.prepare('DELETE FROM season_baselines WHERE seasonId = ?').run(meta.seasonId);
        snapshotBaselines(currentId);
        db.prepare('UPDATE season_meta SET seasonId = ?, startedAt = ? WHERE id = 1')
            .run(currentId, Date.now());
    }
    return currentId;
}

// ==================== SCORING ====================
// Returns [{ userId, score, breakdown }], sorted desc, for the given season.
function computeSeasonalScores(seasonId) {
    // Pull baselines into a nested map: userId -> { statKey -> baseline }.
    const baselineRows = db.prepare(
        'SELECT userId, statKey, baseline FROM season_baselines WHERE seasonId = ?'
    ).all(seasonId);
    const baselines = new Map();
    for (const r of baselineRows) {
        if (!baselines.has(r.userId)) baselines.set(r.userId, {});
        baselines.get(r.userId)[r.statKey] = r.baseline;
    }

    // Accumulate per-user score from each weighted stat delta.
    const scores = new Map(); // userId -> { score, breakdown }
    for (const { key, weight, divide } of SEASON_STAT_WEIGHTS) {
        const totals = getCurrentTotals(key);
        for (const [userId, total] of totals) {
            const base = (baselines.get(userId) || {})[key] || 0;
            const delta = Math.max(0, total - base);
            if (delta <= 0) continue;
            const points = divide ? Math.floor(delta / weight) : delta * weight;
            if (points <= 0) continue;
            if (!scores.has(userId)) scores.set(userId, { score: 0, breakdown: {} });
            const entry = scores.get(userId);
            entry.score += points;
            entry.breakdown[key] = delta;
        }
    }

    return Array.from(scores.entries())
        .map(([userId, v]) => ({ userId, score: v.score, breakdown: v.breakdown }))
        .sort((a, b) => b.score - a.score);
}

function getSeasonalLeaderboard(limit = 10) {
    const seasonId = ensureSeason();
    const cache = require('./cache');
    // The 10 GROUP-BY scans are identical for all viewers; cache the full sorted
    // standings for 45s. Slicing per-call is cheap.
    const all = cache.getOrCompute(`season:scores:${seasonId}`, 45 * 1000, () =>
        computeSeasonalScores(seasonId)
    );
    return { seasonId, entries: all.slice(0, limit) };
}

function getUserSeasonalScore(userId) {
    const seasonId = ensureSeason();
    const cache = require('./cache');
    const all = cache.getOrCompute(`season:scores:${seasonId}`, 45 * 1000, () =>
        computeSeasonalScores(seasonId)
    );
    const idx = all.findIndex(e => e.userId === userId);
    if (idx === -1) return { seasonId, score: 0, rank: null, total: all.length };
    return { seasonId, score: all[idx].score, rank: idx + 1, total: all.length };
}

function getSeasonInfo() {
    const seasonId = ensureSeason();
    const meta = db.prepare('SELECT * FROM season_meta WHERE id = 1').get();
    // Days remaining until the 1st of next month (Asia/Jakarta).
    const now = new Date();
    const jakartaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const nextMonth = new Date(jakartaNow.getFullYear(), jakartaNow.getMonth() + 1, 1);
    const daysLeft = Math.ceil((nextMonth - jakartaNow) / (24 * 60 * 60 * 1000));
    return { seasonId, startedAt: meta ? meta.startedAt : Date.now(), daysLeft };
}

function getLastSeasonWinners(limit = 3) {
    // Most recent archived season (lexicographically max seasonId that isn't current).
    const current = getCurrentSeasonId();
    const row = db.prepare(
        'SELECT seasonId FROM season_history WHERE seasonId != ? ORDER BY seasonId DESC LIMIT 1'
    ).get(current);
    if (!row) return { seasonId: null, winners: [] };
    const winners = db.prepare(
        'SELECT rank, userId, score FROM season_history WHERE seasonId = ? ORDER BY rank ASC LIMIT ?'
    ).all(row.seasonId, limit);
    return { seasonId: row.seasonId, winners };
}

module.exports = {
    SEASON_STAT_WEIGHTS,
    SEASON_STAT_KEYS,
    ensureSeason,
    getCurrentSeasonId,
    getSeasonalLeaderboard,
    getUserSeasonalScore,
    getSeasonInfo,
    getLastSeasonWinners,
    computeSeasonalScores,
};
