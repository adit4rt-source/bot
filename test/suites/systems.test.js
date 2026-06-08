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

  // ---- Lottery / Togel (number betting 1-100) ----
  const lot = botRequire('systems/lottery.js');
  const BP = lot.BET_PRICE;

  test('lottery: placing a bet charges 5k and adds to the pot', () => {
    const g = 'LOT_BET', u = 'LOTU_BET';
    db.getOrCreateUser(g, u);
    db.updateUserBalance(g, u, 100000);
    const r0 = lot.getCurrentRound(g);
    const potBefore = r0.pot;
    const r = lot.placeBet(g, u, 'Better', 19);
    if (!r.success) throw new Error('bet failed: ' + r.error);
    if (r.cost !== BP) throw new Error('wrong cost ' + r.cost);
    if (r.number !== 19) throw new Error('wrong number');
    if (r.pot !== potBefore + BP) throw new Error(`pot ${r.pot} != ${potBefore + BP}`);
    if (db.getOrCreateUser(g, u).balance !== 100000 - BP) throw new Error('balance not deducted');
  });

  test('lottery: rejects invalid numbers and duplicates, caps at 2 per round', () => {
    const g = 'LOT_RULES', u = 'LOTU_RULES';
    db.getOrCreateUser(g, u);
    db.updateUserBalance(g, u, 1_000_000);
    if (lot.placeBet(g, u, 'X', 0).success) throw new Error('should reject 0');
    if (lot.placeBet(g, u, 'X', 101).success) throw new Error('should reject 101');
    if (!lot.placeBet(g, u, 'X', 7).success) throw new Error('7 should work');
    if (lot.placeBet(g, u, 'X', 7).success) throw new Error('duplicate 7 should reject');
    if (!lot.placeBet(g, u, 'X', 8).success) throw new Error('8 should work (2nd)');
    if (lot.placeBet(g, u, 'X', 9).success) throw new Error('3rd number should reject (cap 2)');
  });

  test('lottery: rejects bet when balance is insufficient', () => {
    const g = 'LOT_POOR2', u = 'LOTU_POOR2';
    db.getOrCreateUser(g, u);
    db.updateUserBalance(g, u, 100);
    if (lot.placeBet(g, u, 'Poor', 50).success) throw new Error('should reject (insufficient)');
  });

  test('lottery: draw pays winners who matched the drawn number', () => {
    const g = 'LOT_WIN', u = 'LOTU_WIN';
    db.getOrCreateUser(g, u);
    db.updateUserBalance(g, u, 100000);
    const bet = lot.placeBet(g, u, 'Winner', 42);
    const balAfter = db.getOrCreateUser(g, u).balance;
    const res = lot.drawRound(g, bet.roundId, 42); // force draw 42
    if (!res.success) throw new Error('draw failed');
    if (res.winnersCount !== 1) throw new Error('expected 1 winner');
    if (res.payoutEach !== res.pot) throw new Error('single winner should take whole pot');
    if (db.getOrCreateUser(g, u).balance !== balAfter + res.payoutEach) throw new Error('payout not credited');
    if (lot.drawRound(g, bet.roundId, 42).success) throw new Error('round should not draw twice');
  });

  test('lottery: pot carries over when nobody matches', () => {
    const g = 'LOT_CARRY2', u = 'LOTU_CARRY2';
    db.getOrCreateUser(g, u);
    db.updateUserBalance(g, u, 100000);
    const bet = lot.placeBet(g, u, 'NoLuck', 5);
    const potNow = lot.getRoundRow(g, bet.roundId).pot;
    const res = lot.drawRound(g, bet.roundId, 77); // 5 != 77 => no winner
    if (res.winnersCount !== 0) throw new Error('expected no winner');
    if (res.nextPot !== potNow) throw new Error(`carryover pot ${res.nextPot} != ${potNow}`);
    const next = lot.getCurrentRound(g);
    if (next.carriedOver !== potNow) throw new Error('next round carriedOver mismatch');
  });

  test('lottery: pot keeps growing across many no-winner rounds (never shrinks)', () => {
    const g = 'LOT_ACCUM', u = 'LOTU_ACCUM';
    db.getOrCreateUser(g, u);
    db.updateUserBalance(g, u, 1_000_000);
    let prevPot = lot.getCurrentRound(g).pot;
    for (let i = 0; i < 8; i++) {
      const r = lot.getCurrentRound(g);
      const startPot = r.pot;
      if (startPot < prevPot) throw new Error('pot shrank between rounds!');
      lot.placeBet(g, u, 'Accum', 50);
      const potWithBet = lot.getRoundRow(g, r.roundId).pot;
      if (potWithBet !== startPot + BP) throw new Error('bet did not add to pot');
      const res = lot.drawRound(g, r.roundId, 77); // 50 != 77 -> no winner
      if (res.winnersCount !== 0) throw new Error('expected no winner');
      if (res.nextPot !== potWithBet) throw new Error('carryover must equal full pot (no shrink)');
      prevPot = res.nextPot;
    }
    // 8 rounds, 1 bet each, all carried over -> pot grew by 8 * BET_PRICE over the seed.
    const finalPot = lot.getCurrentRound(g).pot;
    if (finalPot < 8 * BP) throw new Error('pot did not accumulate across rounds: ' + finalPot);
  });

  test('lottery: admin setPot seeds the pot', () => {
    const g = 'LOT_SEED';
    const r = lot.setPot(g, 500000);
    if (r.pot < 500000) throw new Error('pot not seeded');
    if (lot.getSeed(g) !== 500000) throw new Error('seed not stored');
    const round = lot.getCurrentRound(g);
    if (round.pot < 500000) throw new Error('current round not topped up');
  });
};
