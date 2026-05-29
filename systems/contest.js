// systems/contest.js
const { db } = require('../database');

const activeContests = new Map();

function getContestState(guildId) {
    return db.prepare('SELECT * FROM fish_contest_state WHERE guildId = ?').get(guildId);
}

function startFishContest(guildId, channelId, durationMin = 60) {
    const now = Date.now();
    const endsAt = now + (durationMin * 60000);
    db.prepare('INSERT OR REPLACE INTO fish_contest_state (guildId, active, startedAt, endsAt, channelId) VALUES (?, 1, ?, ?, ?)').run(guildId, now, endsAt, channelId);
    db.prepare('DELETE FROM fish_contest WHERE guildId = ?').run(guildId);
    return endsAt;
}

function addContestEntry(guildId, userId, fishId, weight) {
    const state = getContestState(guildId);
    if (!state || !state.active || Date.now() > state.endsAt) return false;
    const existing = db.prepare('SELECT * FROM fish_contest WHERE guildId = ? AND oderId = ?').get(guildId, userId);
    if (!existing || weight > existing.weight) {
        db.prepare('INSERT OR REPLACE INTO fish_contest (guildId, oderId, odent, weight, fishId, startedAt) VALUES (?, ?, ?, ?, ?, ?)').run(guildId, userId, 'entry', weight, fishId, Date.now());
    }
    return true;
}

function getContestLeaderboard(guildId, limit = 10) {
    return db.prepare('SELECT * FROM fish_contest WHERE guildId = ? ORDER BY weight DESC LIMIT ?').all(guildId, limit);
}

module.exports = { activeContests, getContestState, startFishContest, addContestEntry, getContestLeaderboard };
