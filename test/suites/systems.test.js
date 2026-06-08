// Audit-regression tests for previously-untested systems:
// worldBoss, awakening, petAbilities, secretLocation.
'use strict';
const { botRequire, test, assert, mockInteraction } = require('../harness');

module.exports = function register() {
  const db = botRequire('database.js');
  const G = 'g1', U = '400000000000000001', NAME = 'Tester';
  db.getOrCreateUser(G, U);

  // ---- World Boss ----
  const wb = botRequire('systems/worldBoss.js');
  test('worldBoss: panel builds with a titled embed', () => {
    const p = wb.buildWorldBossPanel(G, U, NAME);
    if (!p.embeds || !p.embeds[0].data.title) throw new Error('no title');
  });
  test('worldBoss: claim uses a direct lookup, not getCurrentBoss (no spawn side-effect)', () => {
    // Static guarantee independent of shared DB state / test ordering:
    // claimWorldBossRewards must NOT call getCurrentBoss() (which spawns a boss).
    // We assert this at the source level to avoid races with concurrent async tests.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'systems', 'worldBoss.js'), 'utf8');
    const fnStart = src.indexOf('function claimWorldBossRewards');
    if (fnStart < 0) throw new Error('claimWorldBossRewards not found');
    // Grab the function body up to the next top-level "function " or section marker.
    const after = src.slice(fnStart);
    const body = after.slice(0, after.indexOf('// ====================', 10));
    // Strip line comments so a mention of getCurrentBoss in a comment doesn't false-positive.
    const code = body.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    if (/=\s*getCurrentBoss\s*\(/.test(code)) throw new Error('claim still calls getCurrentBoss (would spawn a boss)');
    if (!/SELECT \* FROM world_boss WHERE weekId/.test(code)) throw new Error('claim should look up boss directly by weekId');
  });
  test('worldBoss: attack handler acknowledges (no pet -> ephemeral error)', () => {
    const it = mockInteraction({ userId: U, guildId: G, customId: `wb_attack_${U}` });
    return Promise.resolve(wb.handleWorldBossButton(it)).then(() => {
      if (!it._cap.reply && !it._cap.update) throw new Error('attack did not acknowledge');
    });
  });
  test('worldBoss: leaderboard & rewards views acknowledge', () => {
    const it1 = mockInteraction({ userId: U, guildId: G, customId: `wb_leaderboard_${U}` });
    const it2 = mockInteraction({ userId: U, guildId: G, customId: `wb_rewards_${U}` });
    return Promise.all([wb.handleWorldBossButton(it1), wb.handleWorldBossButton(it2)]).then(() => {
      if (!it1._cap.update) throw new Error('leaderboard no update');
      if (!it2._cap.update) throw new Error('rewards no update');
    });
  });

  // ---- Awakening ----
  const awak = botRequire('systems/awakening.js');
  assert('awakening: exports handler + detector', typeof awak.handleAwakeningButton === 'function' && typeof awak.isAwakeningButton === 'function');
  test('awakening: main panel button acknowledges', () => {
    const it = mockInteraction({ userId: U, guildId: G, customId: `awaken_main_${U}` });
    return Promise.resolve(awak.handleAwakeningButton(it)).then(() => {
      if (!it._cap.update && !it._cap.reply) throw new Error('awakening did not acknowledge');
    });
  });

  // ---- Pet Abilities ----
  const pa = botRequire('systems/petAbilities.js');
  assert('petAbilities: exports tick + handlers', typeof pa.runAbilityTick === 'function' && typeof pa.handleAbilityButton === 'function');
  test('petAbilities: runAbilityTick is safe with no pet/abilities', () => {
    // Should simply no-op (no active pet) without throwing.
    pa.runAbilityTick({ /* fake client */ }, G, U);
  });
  test('petAbilities: panel button acknowledges', () => {
    const it = mockInteraction({ userId: U, guildId: G, customId: `ability_main_${U}` });
    return Promise.resolve(pa.handleAbilityButton(it)).then(() => {
      if (!it._cap.update && !it._cap.reply) throw new Error('ability did not acknowledge');
    });
  });

  // ---- Secret Location ----
  const sl = botRequire('systems/secretLocation.js');
  test('secretLocation: progress embed builds before unlock', () => {
    const U2 = '400000000000000002';
    db.getOrCreateUser(G, U2);
    const r = sl.buildSecretLocationProgressEmbed(G, U2);
    if (typeof r.text !== 'string' || r.unlocked !== false) throw new Error('bad progress');
  });
  test('secretLocation: unlock via Secret-tier catches (5) then hasSecretLocation true', () => {
    const U3 = '400000000000000003';
    db.getOrCreateUser(G, U3);
    db.db.prepare('DELETE FROM secret_locations_unlocked WHERE userId = ?').run(U3);
    try { db.db.prepare("DELETE FROM user_stats WHERE userId = ? AND stat_key LIKE 'fish_caught_%'").run(U3); } catch(e){}
    for (let i = 0; i < 5; i++) sl.trackLocationCatch(G, U3, 'deep_sea', 'Secret');
    const unlocked = sl.tryUnlockSecretLocation(G, U3);
    if (unlocked !== 'secret_tier_5') throw new Error('did not unlock via secret tier: ' + unlocked);
    if (!sl.hasSecretLocation(G, U3)) throw new Error('hasSecretLocation false after unlock');
  });
  test('secretLocation: unlock embed builds without crash', () => {
    const r = sl.buildSecretLocationUnlockEmbed('secret_tier_5', U);
    if (!r.embeds || !r.embeds[0].data.title) throw new Error('no unlock embed');
  });

  // ---- AI Assistant: channel token-saving filter ----
  const ai = botRequire('systems/aiAssistant.js');
  assert('aiAssistant: exports shouldAnswerInChannel', typeof ai.shouldAnswerInChannel === 'function');
  test('aiAssistant: answers bot-related questions in channel', () => {
    const yes = [
      'gimana cara fishing?',
      'apa itu daily reward',
      'cara pakai pet gimana',
      'tolong jelasin command casino',
      '/menu',
      'help dong',
      'berapa harga di shop?',
    ];
    for (const q of yes) {
      if (!ai.shouldAnswerInChannel(q)) throw new Error('expected TRUE for: ' + q);
    }
  });
  test('aiAssistant: ignores casual/off-topic chatter in channel', () => {
    const no = [
      'wkwkwk',
      'halo semua apa kabar',
      'ok sip',
      'gg',
      'lagi ngapain nih',
      '',
      '   ',
      'mantap banget tadi',
    ];
    for (const q of no) {
      if (ai.shouldAnswerInChannel(q)) throw new Error('expected FALSE for: ' + q);
    }
  });

  // ---- TikTok auto-convert: URL detection ----
  const tk = botRequire('systems/tiktok.js');
  assert('tiktok: exports extractTikTokUrl', typeof tk.extractTikTokUrl === 'function');
  test('tiktok: detects tiktok links in a message', () => {
    const cases = [
      'check this https://www.tiktok.com/@user/video/7647407680209964296 lol',
      'https://vm.tiktok.com/ZMabc123/',
      'eh lihat vt.tiktok.com style? no — https://vt.tiktok.com/ZSabcd/',
      'https://m.tiktok.com/v/123456.html',
    ];
    for (const c of cases) {
      const u = tk.extractTikTokUrl(c);
      if (!u || !/tiktok\.com/i.test(u)) throw new Error('failed to extract from: ' + c);
    }
  });
  test('tiktok: ignores messages without a tiktok link', () => {
    const none = ['hello world', 'https://youtube.com/watch?v=abc', 'just chatting', ''];
    for (const c of none) {
      if (tk.extractTikTokUrl(c)) throw new Error('false positive for: ' + c);
    }
  });

  // ---- Lottery / Togel ----
  const lot = botRequire('systems/lottery.js');
  const TP = lot.TICKET_PRICE;

  test('lottery: buying tickets charges money and grows jackpot 70%', () => {
    const g = 'LOT_BUY', u = 'LOTU_BUY';
    db.getOrCreateUser(g, u);
    db.updateUserBalance(g, u, 100000);
    const r = lot.buyTickets(g, u, 'Buyer', 10);
    if (!r.success) throw new Error('buy failed: ' + r.error);
    if (r.cost !== 10 * TP) throw new Error('wrong cost ' + r.cost);
    if (r.ownedTickets !== 10) throw new Error('wrong owned ' + r.ownedTickets);
    // jackpot = SEED(5000) + floor(cost*0.70)
    const expected = lot.SEED_JACKPOT + Math.floor(10 * TP * lot.JACKPOT_CONTRIB);
    if (r.jackpot !== expected) throw new Error(`jackpot ${r.jackpot} != ${expected}`);
    if (db.getOrCreateUser(g, u).balance !== 100000 - 10 * TP) throw new Error('balance not deducted');
  });

  test('lottery: rejects exceeding max tickets per user', () => {
    const g = 'LOT_CAP', u = 'LOTU_CAP';
    db.getOrCreateUser(g, u);
    db.updateUserBalance(g, u, 10_000_000);
    const ok = lot.buyTickets(g, u, 'Cap', lot.MAX_TICKETS_PER_USER);
    if (!ok.success) throw new Error('should reach cap');
    const over = lot.buyTickets(g, u, 'Cap', 1);
    if (over.success) throw new Error('should reject over cap');
  });

  test('lottery: rejects when balance is insufficient', () => {
    const g = 'LOT_POOR', u = 'LOTU_POOR';
    db.getOrCreateUser(g, u);
    db.updateUserBalance(g, u, 100);
    const r = lot.buyTickets(g, u, 'Poor', 1);
    if (r.success) throw new Error('should reject (insufficient)');
  });

  test('lottery: draw picks a winner and pays the jackpot', () => {
    const g = 'LOT_DRAW', u = 'LOTU_DRAW';
    db.getOrCreateUser(g, u);
    db.updateUserBalance(g, u, 100000);
    const buy = lot.buyTickets(g, u, 'Winner', 4);
    const balAfterBuy = db.getOrCreateUser(g, u).balance;
    const res = lot.drawRound(g);
    if (!res.success || !res.winner) throw new Error('draw produced no winner');
    if (res.winner.userId !== u) throw new Error('wrong winner');
    if (res.payout !== buy.jackpot) throw new Error('payout != jackpot');
    if (db.getOrCreateUser(g, u).balance !== balAfterBuy + res.payout) throw new Error('jackpot not credited');
    const again = lot.drawRound(g);
    if (again.success) throw new Error('round should not be drawable twice');
  });

  test('lottery: weighted winner pick stays within participants', () => {
    const entries = [{ userId: 'a', tickets: 1 }, { userId: 'b', tickets: 50 }, { userId: 'c', tickets: 3 }];
    for (let i = 0; i < 50; i++) {
      const w = lot.pickWeightedWinner(entries);
      if (!entries.includes(w)) throw new Error('winner not among entries');
    }
    if (lot.pickWeightedWinner([]) !== null) throw new Error('empty should be null');
  });

  test('lottery: unclaimed jackpot carries over to a new round', () => {
    const g = 'LOT_CARRY';
    const wk = lot.getWeekId();
    // Simulate a previous week that was drawn with no winner and a leftover jackpot.
    db.db.prepare("INSERT OR REPLACE INTO lottery_rounds (guildId, weekId, jackpot, status, winnerId, createdAt) VALUES (?, ?, ?, 'drawn', NULL, ?)")
      .run(g, '2000-W01', 9999, Date.now());
    const round = lot.getCurrentRound(g);
    if (round.weekId !== wk) throw new Error('current round week mismatch');
    if (round.carriedOver !== 9999) throw new Error('carryover not applied: ' + round.carriedOver);
    if (round.jackpot !== lot.SEED_JACKPOT + 9999) throw new Error('jackpot seed+carry wrong: ' + round.jackpot);
  });
};
