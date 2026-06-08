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

// ==================== OVERALL SCORE (single source of truth) ====================
// `computeScore(parts)` is the ONE place weights live — both the rank system and the
// leaderboard call it, so they can never drift. Scores are grouped into categories
// so the panel can show a player's breakdown instead of a giant formula string.
//
// Philosophy ("prestige"): raw wealth is capped, and afk/spam-able stats (chat, voice,
// reactions) are heavily down-weighted + capped, so rank reflects real mastery across
// every system (battle, fishing, pets, quests, social), not just being rich or chatty.
function computeScore(p = {}) {
    const n = (v) => Number(v) || 0;
    const b = {};
    b['Level'] = n(p.level) * 150;
    b['Kekayaan'] = Math.min(Math.floor(n(p.balance) / 500), 25000);            // capped
    b['Badge'] = n(p.badges) * 50;
    b['Streak'] = n(p.streak) * 20;
    b['Pet'] = n(p.petLv) * 8;
    b['Fishing'] = n(p.fish) * 2 + n(p.giantFish) * 40 + n(p.seaMonsters) * 8
        + n(p.godFish) * 150 + n(p.secretFish) * 80 + n(p.voidFish) * 30
        + n(p.abyssFish) * 15 + n(p.secretLocs) * 200 + n(p.treasures) * 20;
    b['Farming'] = n(p.farm) * 3 + n(p.craft) * 6;
    b['Battle'] = n(p.dungeon) * 8 + n(p.boss) * 20 + n(p.pvp) * 15
        + n(p.worldBossHits) * 5 + n(p.worldBossKills) * 100;
    b['Pet Mastery'] = n(p.expeditions) * 10 + n(p.refines) * 8 + n(p.relicMelts) * 3
        + n(p.fusions) * 15 + n(p.awakenings) * 60;
    b['Quest'] = n(p.quests) * 10 + n(p.weeklyQuests) * 40;
    b['Sosial'] = n(p.gifts) * 15 + n(p.trades) * 20
        + Math.min(Math.floor(n(p.chats) / 10), 2000)
        + Math.min(Math.floor(n(p.reactions) / 5), 500)
        + Math.min(Math.floor(n(p.voice) / 2), 5000);                            // afk-capped
    b['Gambling'] = n(p.gambling) * 1 + n(p.togelWins) * 5;
    let score = 0;
    for (const k in b) score += b[k];
    return { score, breakdown: b };
}

// Gather every score-relevant stat for a user (rank system / profile use this).
function gatherScoreParts(guildId, userId) {
    const user = db.prepare('SELECT * FROM users WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!user) return null;
    const s = (k) => getUserStat(guildId, userId, k) || 0;
    const streakRow = db.prepare('SELECT count FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId);
    const petRow = db.prepare('SELECT level FROM pets WHERE guildId = ? AND userId = ? ORDER BY level DESC LIMIT 1').get(guildId, userId);
    const badges = db.prepare('SELECT COUNT(*) as c FROM achievements WHERE guildId = ? AND userId = ?').get(guildId, userId).c;
    return {
        level: user.level, balance: user.balance, badges,
        streak: streakRow ? streakRow.count : 0,
        petLv: petRow ? petRow.level : 0,
        fish: s('total_fish_caught'), giantFish: s('giant_fish_defeated'), seaMonsters: s('sea_monster_encounters'),
        godFish: s('fish_caught_god_tier'), secretFish: s('fish_caught_secret_tier'), voidFish: s('fish_caught_void_rift'),
        abyssFish: s('fish_caught_abyss'), secretLocs: s('secret_locations_unlocked'), treasures: s('fishing_treasures_found'),
        farm: s('total_harvests'), craft: s('total_crafts'),
        dungeon: s('dungeon_clears'), boss: s('boss_kills'), pvp: s('pvp_wins'),
        worldBossHits: s('world_boss_attacks'), worldBossKills: s('world_boss_last_hit'),
        expeditions: s('total_expeditions'), refines: s('refine_successes'), relicMelts: s('relic_melts'),
        fusions: s('fusion_success'), awakenings: s('total_awakenings'),
        quests: s('total_quests_done'), weeklyQuests: s('total_weekly_quests_done'),
        gifts: s('total_gifts_sent'), trades: s('trades_completed'),
        chats: s('total_chats'), reactions: s('total_reactions'), voice: s('total_voice_mins'),
        gambling: s('slot_wins') + s('coinflip_wins') + s('roulette_wins'), togelWins: s('togel_wins'),
    };
}

function calculateOverallScore(guildId, userId) {
    const parts = gatherScoreParts(guildId, userId);
    if (!parts) return 0;
    return computeScore(parts).score;
}

// Top contributing categories for a player (for the rank panel breakdown).
function getScoreBreakdown(guildId, userId) {
    const parts = gatherScoreParts(guildId, userId);
    if (!parts) return [];
    const { breakdown } = computeScore(parts);
    return Object.entries(breakdown)
        .filter(([, v]) => v > 0)
        .map(([label, points]) => ({ label, points }))
        .sort((a, b) => b.points - a.points);
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
    computeScore,
    gatherScoreParts,
    calculateOverallScore,
    getScoreBreakdown,
    getTitleFromScore,
    getUserTitle,
    getTitleProgress,
    formatTitle,
    formatProgressBar,
    getAllTitles
};
