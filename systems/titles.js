// systems/titles.js — Title/Rank System based on Overall Score
// Titles are displayed on profile and leaderboard. They auto-update based on player score.

const { db, getUserStat } = require('../database');

// ==================== TITLE TIERS ====================
const TITLE_TIERS = [
    { id: 'unranked', name: 'Unranked', emoji: '⚪', minScore: 0, color: '#95A5A6' },
    { id: 'bronze', name: 'Bronze', emoji: '🥉', minScore: 500, color: '#CD7F32' },
    { id: 'silver', name: 'Silver', emoji: '🥈', minScore: 1500, color: '#C0C0C0' },
    { id: 'gold', name: 'Gold', emoji: '🥇', minScore: 4000, color: '#FFD700' },
    { id: 'platinum', name: 'Platinum', emoji: '💠', minScore: 8000, color: '#E5E4E2' },
    { id: 'diamond', name: 'Diamond', emoji: '💎', minScore: 15000, color: '#B9F2FF' },
    { id: 'master', name: 'Master', emoji: '🔮', minScore: 25000, color: '#9B59B6' },
    { id: 'grandmaster', name: 'Grandmaster', emoji: '👑', minScore: 40000, color: '#FF6B00' },
    { id: 'mythic', name: 'Mythic Champion', emoji: '🌟', minScore: 60000, color: '#FF1493' },
    { id: 'legend', name: 'Legendary', emoji: '⚡', minScore: 100000, color: '#FFD700' },
    { id: 'immortal', name: 'Immortal', emoji: '🏆', minScore: 150000, color: '#FF0000' },
];

// ==================== CALCULATE OVERALL SCORE ====================
// Same formula as leaderboard (server mode with streak)
function calculateOverallScore(guildId, userId) {
    const user = db.prepare('SELECT * FROM users WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!user) return 0;

    const fish = getUserStat(guildId, userId, 'total_fish_caught') || 0;
    const farm = getUserStat(guildId, userId, 'total_harvests') || 0;
    const craft = getUserStat(guildId, userId, 'total_crafts') || 0;

    const streakRow = db.prepare('SELECT count FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId);
    const streak = streakRow ? streakRow.count : 0;

    const petRow = db.prepare('SELECT level FROM pets WHERE guildId = ? AND userId = ? ORDER BY level DESC LIMIT 1').get(guildId, userId);
    const petLv = petRow ? petRow.level : 0;

    const dungeon = getUserStat(guildId, userId, 'dungeon_clears') || 0;
    const boss = getUserStat(guildId, userId, 'boss_kills') || 0;
    const pvp = getUserStat(guildId, userId, 'pvp_wins') || 0;

    const badges = db.prepare('SELECT COUNT(*) as c FROM achievements WHERE guildId = ? AND userId = ?').get(guildId, userId).c;

    const slot = getUserStat(guildId, userId, 'slot_wins') || 0;
    const coin = getUserStat(guildId, userId, 'coinflip_wins') || 0;
    const roulette = getUserStat(guildId, userId, 'roulette_wins') || 0;
    const gambling = slot + coin + roulette;

    // Wealth is capped so raw money can't dominate the score (a whale used to hit
    // tens of millions of points off Money/20 alone). Activity now drives rank.
    const score = (user.level * 150)
        + Math.min(Math.floor(user.balance / 500), 25000)
        + (fish * 3)
        + (farm * 4)
        + (craft * 8)
        + (streak * 20)
        + (petLv * 8)
        + (dungeon * 8)
        + (boss * 20)
        + (pvp * 15)
        + (badges * 50)
        + (gambling * 1);

    return score;
}

// ==================== GET TITLE FROM SCORE ====================
function getTitleFromScore(score) {
    let title = TITLE_TIERS[0];
    for (const tier of TITLE_TIERS) {
        if (score >= tier.minScore) title = tier;
    }
    return title;
}

// ==================== GET USER TITLE ====================
function getUserTitle(guildId, userId) {
    const score = calculateOverallScore(guildId, userId);
    return getTitleFromScore(score);
}

// ==================== GET TITLE PROGRESS ====================
// Returns current title, next title, and progress percentage
function getTitleProgress(guildId, userId) {
    const score = calculateOverallScore(guildId, userId);
    const current = getTitleFromScore(score);
    const currentIdx = TITLE_TIERS.findIndex(t => t.id === current.id);
    const next = TITLE_TIERS[currentIdx + 1] || null;

    let progress = 100;
    let remaining = 0;
    if (next) {
        const rangeTotal = next.minScore - current.minScore;
        const rangeProgress = score - current.minScore;
        progress = Math.min(100, Math.floor((rangeProgress / rangeTotal) * 100));
        remaining = next.minScore - score;
    }

    return {
        score,
        current,
        next,
        progress,
        remaining,
        currentIdx,
        totalTiers: TITLE_TIERS.length
    };
}

// ==================== FORMAT TITLE DISPLAY ====================
function formatTitle(title) {
    return `${title.emoji} ${title.name}`;
}

// ==================== FORMAT PROGRESS BAR ====================
function formatProgressBar(progress) {
    const filled = Math.floor(progress / 10);
    const empty = 10 - filled;
    return '▰'.repeat(filled) + '▱'.repeat(empty);
}

// ==================== GET ALL TITLES (for display) ====================
function getAllTitles() {
    return TITLE_TIERS;
}

module.exports = {
    TITLE_TIERS,
    calculateOverallScore,
    getTitleFromScore,
    getUserTitle,
    getTitleProgress,
    formatTitle,
    formatProgressBar,
    getAllTitles
};
