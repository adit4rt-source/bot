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

  // ---- Shop balance: Refine Stone is drop-only, no free buyables ----
  const { ITEMS } = botRequire('data/items.js');
  test('shop: refine_stone is not buyable (drop-only)', () => {
    const rs = ITEMS.find(i => i.id === 'refine_stone');
    if (!rs) throw new Error('refine_stone missing');
    if (rs.price !== 0) throw new Error('refine_stone should be price 0 (drop-only), got ' + rs.price);
  });
  test('shop: buyable list excludes drop-only materials', () => {
    const buyable = ITEMS.filter(i => i.price > 0).map(i => i.id);
    for (const dropOnly of ['refine_stone', 'protection_stone', 'rod_part', 'mythic_fragment', 'awakening_crystal']) {
      if (buyable.includes(dropOnly)) throw new Error(dropOnly + ' must not be buyable');
    }
    for (const it of ITEMS.filter(i => i.price > 0)) {
      if (!Number.isFinite(it.price) || it.price <= 0) throw new Error('bad price for ' + it.id);
    }
  });
  test('shop: golden_rod_ticket craft recipe is removed', () => {
    const { CRAFT_RECIPES } = botRequire('data/items.js');
    if (CRAFT_RECIPES.some(r => r.id === 'golden_rod_ticket')) throw new Error('golden_rod_ticket should be removed');
    // refine_stone may be a craft INGREDIENT (a sink); it just must not be buyable.
  });

  // ---- Relic equip/unequip/melt + bonus from EQUIPPED relics ----
  const pets = botRequire('systems/pets.js');
  test('relic: getRelicBonus sums EQUIPPED relics with refine scaling', () => {
    const uid = 'RELIC_EQ', PID = 90001;
    const ins = db.db.prepare('INSERT INTO relics (guildId,userId,name,slot,rarity,stat_type,stat_value,refine_level,equipped_pet_id) VALUES (?,?,?,?,?,?,?,?,?)');
    ins.run('g', uid, 'W1', 'weapon', 'Epic', 'atk', 30, 10, PID); // equipped: floor(30*1.5)=45
    ins.run('g', uid, 'A1', 'armor', 'Rare', 'def', 10, 20, PID);  // equipped: floor(10*2)=20
    ins.run('g', uid, 'W2', 'weapon', 'Legendary', 'atk', 99, 0, 0); // NOT equipped -> ignored
    const b = pets.getRelicBonus(uid, PID);
    if (b.atk !== 45) throw new Error('atk should be 45 (equipped only), got ' + b.atk);
    if (b.def !== 20) throw new Error('def should be 20, got ' + b.def);
    if (b.spd !== 0 || b.crit !== 0) throw new Error('spd/crit should be 0');
  });
  test('relic: equipRelic auto-unequips same slot (one per slot)', () => {
    const uid = 'RELIC_SWAP', PID = 90002;
    const ins = db.db.prepare('INSERT INTO relics (guildId,userId,name,slot,rarity,stat_type,stat_value,refine_level) VALUES (?,?,?,?,?,?,?,?)');
    const a = ins.run('g', uid, 'SwA', 'weapon', 'Rare', 'atk', 20, 0).lastInsertRowid;
    const bId = ins.run('g', uid, 'SwB', 'weapon', 'Legendary', 'atk', 60, 0).lastInsertRowid;
    pets.equipRelic(uid, PID, Number(a));
    if (pets.getRelicBonus(uid, PID).atk !== 20) throw new Error('A should give 20');
    pets.equipRelic(uid, PID, Number(bId)); // must auto-unequip A
    const eq = pets.getEquippedRelics(PID).filter(r => r.slot === 'weapon');
    if (eq.length !== 1) throw new Error('only 1 weapon may be equipped, got ' + eq.length);
    if (pets.getRelicBonus(uid, PID).atk !== 60) throw new Error('B should give 60, got ' + pets.getRelicBonus(uid, PID).atk);
  });
  test('relic: unequipRelic / unequipAll clear the bonus', () => {
    const uid = 'RELIC_UNEQ', PID = 90003;
    const id = db.db.prepare('INSERT INTO relics (guildId,userId,name,slot,rarity,stat_type,stat_value,refine_level,equipped_pet_id) VALUES (?,?,?,?,?,?,?,?,?)')
      .run('g', uid, 'X', 'accessory', 'Rare', 'spd', 30, 0, PID).lastInsertRowid;
    if (pets.getRelicBonus(uid, PID).spd !== 30) throw new Error('spd should be 30');
    pets.unequipRelic(uid, Number(id));
    if (pets.getRelicBonus(uid, PID).spd !== 0) throw new Error('spd should be 0 after unequip');
  });
  test('relic: meltRelic deletes it and yields refine stones', () => {
    const uid = 'RELIC_MELT';
    const id = db.db.prepare('INSERT INTO relics (guildId,userId,name,slot,rarity,stat_type,stat_value,refine_level) VALUES (?,?,?,?,?,?,?,?)')
      .run('g', uid, 'Junk', 'weapon', 'Legendary', 'atk', 50, 6).lastInsertRowid; // base 3 + floor(6/3)=2 => 5
    const before = db.getItemCount('g', uid, 'refine_stone');
    const res = pets.meltRelic('g', uid, Number(id));
    if (!res.success) throw new Error('melt failed');
    if (res.stones !== 5) throw new Error('expected 5 stones, got ' + res.stones);
    const gone = db.db.prepare('SELECT * FROM relics WHERE id = ?').get(Number(id));
    if (gone) throw new Error('relic should be deleted after melt');
    if (db.getItemCount('g', uid, 'refine_stone') !== before + 5) throw new Error('stones not granted');
  });
  test('relic: getEffectiveStats adds EQUIPPED relic bonus', () => {
    const uid = 'RELIC_EFF', PID = 90004;
    db.db.prepare('INSERT INTO relics (guildId,userId,name,slot,rarity,stat_type,stat_value,refine_level,equipped_pet_id) VALUES (?,?,?,?,?,?,?,?,?)')
      .run('g', uid, 'Sword', 'weapon', 'Legendary', 'atk', 50, 0, PID);
    const pet = { userId: uid, id: PID, hp: 200, atk: 80, def: 40, spd: 20, crit: 10 };
    const eff = pets.getEffectiveStats(pet);
    if (eff.atk !== 130) throw new Error('effective atk should be 130, got ' + eff.atk);
    if (eff.bonus.atk !== 50) throw new Error('bonus.atk should be 50');
  });
  test('relic: no equipped relic means zero bonus', () => {
    const b = pets.getRelicBonus('RELIC_NONE_USER', 99999);
    if (b.atk || b.def || b.spd || b.crit) throw new Error('expected zero bonus');
  });
  test('relic: equipped bonus actually changes battle outcome (not just visual)', () => {
    const PID = 90005;
    db.db.prepare('INSERT INTO relics (guildId,userId,name,slot,rarity,stat_type,stat_value,refine_level,equipped_pet_id) VALUES (?,?,?,?,?,?,?,?,?)')
      .run('g', 'RELIC_TANK', 'Aegis', 'armor', 'Legendary', 'def', 5000, 0, PID); // +5000 DEF equipped to PID
    const mk = (uid, id) => ({ userId: uid, id, petId: 'x', hp: 50, atk: 100, def: 10, spd: 10, crit: 0, level: 1, element: null, skills: '[]' });
    const petDef = { emoji: '🐾' };
    const enemy = [{ hp: 100000, atk: 1000, def: 0, element: null }];
    const tank = pets.simulateBattle(mk('RELIC_TANK', PID), petDef, enemy);      // equipped DEF relic
    const plain = pets.simulateBattle(mk('RELIC_PLAIN_NB', 90006), petDef, enemy); // no equipped relic
    if (!tank.alive) throw new Error('tank with equipped +5000 DEF relic should survive');
    if (plain.alive) throw new Error('plain pet should die — equipped relic bonus not applied in battle!');
  });

  // ---- Achievement pokedex progress ----
  const ach = botRequire('systems/achievements.js');
  test('achievement: progress reports current/target for countable badges', () => {
    const g = 'ACH_PROG', u = 'ACHU_PROG';
    db.getOrCreateUser(g, u);
    db.incrementUserStat(g, u, 'total_chats', 150);
    const p = ach.getAchievementProgress(g, u, 'chat_100');
    if (!p) throw new Error('expected progress for chat_100');
    if (p.target !== 100) throw new Error('wrong target');
    if (p.raw !== 150) throw new Error('wrong raw: ' + p.raw);
    if (p.current !== 100) throw new Error('current should clamp to target');
  });
  test('achievement: binary badges have no progress (null)', () => {
    if (ach.getAchievementProgress('g', 'u', 'fish_rare') !== null) throw new Error('binary badge should return null');
    if (ach.getAchievementProgress('g', 'u', 'custom_role') !== null) throw new Error('binary badge should return null');
  });

  // ---- DM notification consent (opt-in) ----
  const notif = botRequire('systems/notifications.js');
  test('notif: consent defaults OFF and gates canDM', () => {
    const g = 'NOTIF_G', u = 'NOTIFU1';
    if (notif.canDM(g, u)) throw new Error('should default to NO consent');
    notif.setDmConsent(g, u, true);
    if (!notif.canDM(g, u)) throw new Error('should be allowed after opt-in');
    notif.setDmConsent(g, u, false);
    if (notif.canDM(g, u)) throw new Error('should be off after opt-out');
  });
  test('notif: sendNotification only sends with consent', () => {
    const g = 'NOTIF_G2', u = 'NOTIFU2';
    let sent = 0;
    const client = { users: { fetch: async () => ({ send: async () => { sent++; } }) } };
    return Promise.resolve(notif.sendNotification(client, g, u, 'daily', 'hi')).then(r1 => {
      if (r1 !== false || sent !== 0) throw new Error('must not DM without consent');
      notif.setDmConsent(g, u, true);
      return notif.sendNotification(client, g, u, 'daily', 'hi');
    }).then(r2 => {
      if (r2 !== true || sent !== 1) throw new Error('should DM once with consent');
    });
  });
  test('notif: dmUser respects consent', () => {
    const g = 'NOTIF_G4', u = 'NOTIFU4';
    let sent = 0;
    const client = { users: { fetch: async () => ({ send: async () => { sent++; } }) } };
    return Promise.resolve(notif.dmUser(client, g, u, 'win')).then(r => {
      if (r !== false || sent !== 0) throw new Error('dmUser must respect consent');
    });
  });
  test('notif: dm_asked flips after marking', () => {
    const g = 'NOTIF_G5', u = 'NOTIFU5';
    if (notif.wasDmAsked(g, u)) throw new Error('should not be asked initially');
    notif.markDmAsked(g, u);
    if (!notif.wasDmAsked(g, u)) throw new Error('should be asked after mark');
  });
  test('notif: consent prompt + panel build correctly', () => {
    const p = notif.buildConsentPrompt('123');
    const ids = p.components[0].components.map(c => c.data.custom_id);
    if (!ids.includes('dmconsent_yes_123') || !ids.includes('dmconsent_no_123')) throw new Error('consent buttons missing');
    const panel = notif.buildNotifPanel('NOTIF_G3', '123');
    if (!String(panel.components[0].components[0].data.custom_id).startsWith('notif_toggle_master_')) throw new Error('master toggle missing');
  });

  // ---- Crafting recipes integrity ----
  test('craft: every recipe ingredient/result references a valid item', () => {
    const { ITEMS, CRAFT_RECIPES } = botRequire('data/items.js');
    const { BAIT_TYPES } = botRequire('data/fish.js');
    const itemIds = new Set(ITEMS.map(i => i.id));
    const baitIds = new Set((BAIT_TYPES || []).map(b => b.id));
    if (CRAFT_RECIPES.length < 10) throw new Error('expected many recipes, got ' + CRAFT_RECIPES.length);
    for (const r of CRAFT_RECIPES) {
      for (const ing of r.ingredients) {
        if (!itemIds.has(ing.id)) throw new Error(`recipe ${r.id}: bad ingredient ${ing.id}`);
        if (!(ing.qty > 0)) throw new Error(`recipe ${r.id}: bad ingredient qty`);
      }
      if (r.result.type === 'item') { if (!itemIds.has(r.result.id)) throw new Error(`recipe ${r.id}: bad result item ${r.result.id}`); }
      else if (r.result.type === 'bait') { if (!baitIds.has(r.result.id)) throw new Error(`recipe ${r.id}: bad bait ${r.result.id}`); }
      else if (r.result.type === 'money') { if (!(r.result.amount > 0)) throw new Error(`recipe ${r.id}: bad money amount`); }
      else throw new Error(`recipe ${r.id}: unknown result type ${r.result.type}`);
    }
  });
};
