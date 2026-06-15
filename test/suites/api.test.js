// API suite: read-only dashboard endpoints for Achievements, Quests, Giveaways,
// Self Roles, Starboard, Titles, and World Boss. Exercises api.js end-to-end
// through a minimal express mock (see test/mocks/express.js).
'use strict';
const { botRequire, test } = require('../harness');

module.exports = function register() {
    const D = botRequire('database.js');
    const db = D.db;

    // Load feature systems first so their tables exist before we seed.
    const ach = botRequire('systems/achievements.js');
    botRequire('systems/quests.js');
    botRequire('systems/giveaway.js');
    botRequire('systems/selfRoles.js');
    botRequire('systems/starboard.js');
    const { TITLE_TIERS } = botRequire('systems/titles.js');
    const wb = botRequire('systems/worldBoss.js');

    // ---------------- seed data ----------------
    const now = Date.now();

    // Achievements
    db.prepare('INSERT OR IGNORE INTO achievements (guildId, userId, achievementId, unlockedAt) VALUES (?, ?, ?, ?)').run('global', 'u_ach', 'first_chat', now);
    db.prepare('INSERT OR IGNORE INTO achievements (guildId, userId, achievementId, unlockedAt) VALUES (?, ?, ?, ?)').run('global', 'u_ach', 'level_5', now);

    // Quests
    db.prepare('INSERT OR REPLACE INTO daily_quests (guildId, userId, date, data) VALUES (?, ?, ?, ?)')
        .run('gtest', 'u_q', '2030-01-01', JSON.stringify([{ type: 'fish', target: 3, progress: 1, claimed: false }]));

    // Giveaways
    db.prepare('INSERT INTO giveaways (guildId, channelId, messageId, prize, winners, hostId, endsAt, ended, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run('gtest', 'c1', 'm_gv', 'Nitro', 1, 'host1', now + 100000, 0, now);
    const gid = db.prepare('SELECT id FROM giveaways WHERE messageId = ?').get('m_gv').id;
    db.prepare('INSERT OR IGNORE INTO giveaway_entries (giveawayId, userId, createdAt) VALUES (?, ?, ?)').run(gid, 'e1', now);
    db.prepare('INSERT OR IGNORE INTO giveaway_entries (giveawayId, userId, createdAt) VALUES (?, ?, ?)').run(gid, 'e2', now);

    // Self Roles
    db.prepare('INSERT INTO selfrole_menus (guildId, channelId, messageId, title, description, type, color, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run('gtest', 'c1', 'm_sr', 'Pick Roles', 'Choose', 'multi', '#ffffff', now);
    const menuId = db.prepare('SELECT id FROM selfrole_menus WHERE messageId = ?').get('m_sr').id;
    db.prepare('INSERT INTO selfrole_options (menuId, roleId, label, emoji, description, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
        .run(menuId, 'role_red', 'Red', '🔴', 'Red team', now);

    // Starboard
    db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run('gtest', 'starboard_channel', 'chan_star');
    db.prepare('INSERT OR REPLACE INTO starboard (messageId, guildId, channelId, authorId, starboardMsgId, stars, content, attachment, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run('sm1', 'gtest', 'c1', 'author1', 'sb1', 12, 'hello world', null, now);

    // Titles (just needs a user to exist)
    D.getOrCreateUser(null, 'u_title');

    // World Boss — make this week's state deterministic (an earlier suite may
    // have already spawned a random boss for the current week).
    const week = wb.getWeekId();
    db.prepare('DELETE FROM world_boss WHERE weekId = ?').run(week);
    db.prepare('DELETE FROM world_boss_damage WHERE weekId = ?').run(week);
    db.prepare('INSERT INTO world_boss (bossId, bossName, maxHp, currentHp, weekId, status, startedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run('titan_golem', '🗿 Titan Golem', 100000, 40000, week, 'active', now);
    db.prepare('INSERT OR REPLACE INTO world_boss_damage (weekId, userId, username, totalDamage, attacks, lastAttack) VALUES (?, ?, ?, ?, ?, ?)')
        .run(week, 'wbu1', 'Hero', 5000, 3, now);

    // ---------------- dispatch helper ----------------
    botRequire('api.js'); // registers routes on the express mock
    const app = require('express').__app;
    const KEY = 'change-this-secret-key'; // default API_KEY when env unset
    const call = (url, withKey = true) => app.__dispatch('GET', url, { headers: withKey ? { 'x-api-key': KEY } : {} });

    // ---------------- auth ----------------
    test('api: rejects requests without an API key (401)', async () => {
        const r = await call('/api/titles', false);
        if (r.status !== 401) throw new Error('expected 401, got ' + r.status);
    });

    // ---------------- achievements ----------------
    test('api: GET /api/achievements returns catalog + unlock stats', async () => {
        const r = await call('/api/achievements');
        if (r.status !== 200) throw new Error('status ' + r.status);
        if (r.body.totalDefined !== ach.ACHIEVEMENTS.length) throw new Error('totalDefined mismatch');
        if (r.body.totalUnlocked < 2) throw new Error('expected >=2 unlocked, got ' + r.body.totalUnlocked);
        if (!Array.isArray(r.body.definitions) || !Array.isArray(r.body.mostUnlocked)) throw new Error('missing arrays');
    });
    test('api: GET /api/achievements/:userId returns unlocked + locked progress', async () => {
        const r = await call('/api/achievements/u_ach');
        if (r.status !== 200) throw new Error('status ' + r.status);
        if (r.body.unlockedCount !== 2) throw new Error('expected 2 unlocked, got ' + r.body.unlockedCount);
        if (!r.body.unlocked.find(a => a.id === 'first_chat')) throw new Error('missing first_chat');
        if (!Array.isArray(r.body.locked)) throw new Error('locked not an array');
    });

    // ---------------- quests ----------------
    test('api: GET /api/quests returns quest types + difficulties', async () => {
        const r = await call('/api/quests');
        if (r.status !== 200) throw new Error('status ' + r.status);
        if (!(r.body.totalQuestTypes > 0)) throw new Error('no quest types');
        if (r.body.usersWithDailyQuests < 1) throw new Error('expected >=1 daily-quest user');
    });
    test('api: GET /api/quests/:guildId/:userId returns parsed daily quests', async () => {
        const r = await call('/api/quests/gtest/u_q');
        if (r.status !== 200) throw new Error('status ' + r.status);
        if (!r.body.daily || !Array.isArray(r.body.daily.quests) || r.body.daily.quests.length !== 1) throw new Error('daily quests not parsed');
        if (r.body.daily.quests[0].type !== 'fish') throw new Error('wrong quest type');
    });

    // ---------------- giveaways ----------------
    test('api: GET /api/giveaways/:guildId lists giveaways with entry counts', async () => {
        const r = await call('/api/giveaways/gtest');
        if (r.status !== 200) throw new Error('status ' + r.status);
        if (r.body.total < 1 || r.body.active < 1) throw new Error('expected an active giveaway');
        const g = r.body.giveaways.find(x => x.prize === 'Nitro');
        if (!g || g.entries !== 2) throw new Error('expected 2 entries, got ' + (g && g.entries));
    });

    // ---------------- self roles ----------------
    test('api: GET /api/selfroles/:guildId returns menus with options', async () => {
        const r = await call('/api/selfroles/gtest');
        if (r.status !== 200) throw new Error('status ' + r.status);
        if (r.body.total < 1) throw new Error('expected a menu');
        const menu = r.body.menus.find(m => m.title === 'Pick Roles');
        if (!menu || menu.options.length !== 1 || menu.options[0].roleId !== 'role_red') throw new Error('options not returned');
    });

    // ---------------- starboard ----------------
    test('api: GET /api/starboard/:guildId returns settings + top messages', async () => {
        const r = await call('/api/starboard/gtest');
        if (r.status !== 200) throw new Error('status ' + r.status);
        if (!r.body.enabled || r.body.settings.channel !== 'chan_star') throw new Error('settings wrong');
        if (r.body.totalMessages < 1 || !r.body.topMessages.find(m => m.stars === 12)) throw new Error('top messages wrong');
    });

    // ---------------- titles ----------------
    test('api: GET /api/titles returns all title tiers', async () => {
        const r = await call('/api/titles');
        if (r.status !== 200) throw new Error('status ' + r.status);
        if (!Array.isArray(r.body.titles) || r.body.titles.length !== TITLE_TIERS.length) throw new Error('titles count mismatch');
    });
    test('api: GET /api/titles/:userId returns a valid tier + score', async () => {
        const r = await call('/api/titles/u_title');
        if (r.status !== 200) throw new Error('status ' + r.status);
        if (!r.body.title || typeof r.body.title.id !== 'string') throw new Error('no title');
        if (!TITLE_TIERS.some(t => t.id === r.body.title.id)) throw new Error('unknown title id: ' + r.body.title.id);
        if (typeof r.body.score !== 'number') throw new Error('score not a number');
    });

    // ---------------- world boss ----------------
    test('api: GET /api/worldboss returns current boss + damage leaderboard', async () => {
        const r = await call('/api/worldboss');
        if (r.status !== 200) throw new Error('status ' + r.status);
        if (!r.body.spawned || !r.body.boss) throw new Error('boss not spawned');
        if (r.body.boss.bossId !== 'titan_golem') throw new Error('wrong boss');
        if (r.body.boss.hpPercent !== 40) throw new Error('hpPercent wrong: ' + r.body.boss.hpPercent);
        if (r.body.participants !== 1) throw new Error('participants wrong: ' + r.body.participants);
        if (!r.body.damageLeaderboard.find(d => d.totalDamage === 5000)) throw new Error('damage leaderboard wrong');
    });

    // ---------------- pets: evolution / fusion / awakening ----------------
    test('api: GET /api/pets/evolutions returns evolution graph + fusion + awakening', async () => {
        const r = await call('/api/pets/evolutions');
        if (r.status !== 200) throw new Error('status ' + r.status);
        const { PET_DATA } = botRequire('data/pets.js');
        if (r.body.totalPets !== PET_DATA.length) throw new Error('totalPets mismatch');
        if (!Array.isArray(r.body.evolutions) || r.body.evolutions.length === 0) throw new Error('no evolutions');
        const ev = r.body.evolutions[0];
        if (!ev.from?.name || !ev.to?.name || typeof ev.level !== 'number') throw new Error('evolution row shape wrong');
        if (!Array.isArray(r.body.awakeningTiers) || r.body.awakeningTiers.length === 0) throw new Error('no awakening tiers');
        if (!r.body.fusion || !r.body.fusion.config || !r.body.fusion.config.Common) throw new Error('fusion config missing');
    });
};
