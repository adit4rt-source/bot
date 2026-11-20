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

  // ---- Mutation Lab + Co-op Dungeon ----
  const mut = botRequire('systems/mutationLab.js');
  const coop = botRequire('systems/dungeonCoop.js');
  const petsData = botRequire('data/pets.js');
  function seedActivePet(g, u, level = 30) {
    db.getOrCreateUser(g, u);
    db.db.prepare('DELETE FROM pets WHERE guildId = ? AND userId = ?').run(g, u);
    const petDef = petsData.PET_DATA.find(p => p.tier === 'Rare') || petsData.PET_DATA[0];
    db.db.prepare(`INSERT INTO pets (guildId, userId, petId, name, level, active, adoptedAt, class, element, hp, atk, def, spd, crit)
      VALUES (?, ?, ?, ?, ?, 1, ?, 'warrior', 'fire', 300, 80, 45, 35, 10)`).run(g, u, petDef.id, petDef.name, level, Date.now());
  }
  test('mutationLab: active pet can gain a trait with materials', () => {
    const g = 'MUTLAB', u = 'MUTU';
    seedActivePet(g, u, 35);
    db.updateUserBalance(g, u, 1_000_000);
    db.addItem(g, u, 'dna_shard', 20);
    db.addItem(g, u, 'mutation_serum', 5);
    db.addItem(g, u, 'ancient_core', 2);
    const oldRandom = Math.random;
    Math.random = () => 0;
    try {
      const res = mut.executeMutation(g, u);
      if (!res.ok || !res.success) throw new Error('mutation did not succeed');
      const pet = db.db.prepare('SELECT * FROM pets WHERE guildId = ? AND userId = ? AND active = 1').get(g, u);
      if (!pet.mutation_trait || pet.mutation_power < 1) throw new Error('trait not saved');
      if (pet.atk < 80) throw new Error('stats regressed');
    } finally {
      Math.random = oldRandom;
    }
  });
  test('dungeonCoop: run resolves and awards mutation materials', () => {
    const g = 'COOPDNG', u = 'COOPU';
    seedActivePet(g, u, 50);
    const created = coop.createRun(g, u, 'crypt');
    if (!created.ok) throw new Error(created.error);
    const run = created.run;
    while (!run.finished) coop.resolveNextRoom(run);
    const before = db.getItemCount(g, u, 'dna_shard');
    const award = coop.awardRun(run);
    if (award.perMemberItems.dna_shard < 1) throw new Error('no DNA reward');
    if (db.getItemCount(g, u, 'dna_shard') <= before) throw new Error('DNA not credited');
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
    for (const dropOnly of ['refine_stone', 'protection_stone', 'rod_part', 'mythic_fragment', 'awakening_crystal', 'omega_core']) {
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
  test('relic: gem socketing verification and stats/combat integration', () => {
    const uid = 'RELIC_GEM_USER', PID = 99110;
    // 1. Create a relic (Legendary -> 2 sockets)
    const ins = db.db.prepare('INSERT INTO relics (guildId,userId,name,slot,rarity,stat_type,stat_value,refine_level,equipped_pet_id,gems) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const relicId = ins.run('g', uid, 'Aegis', 'armor', 'Legendary', 'def', 10, 0, PID, '[]').lastInsertRowid;

    // 2. Check getRelicBonus initially
    let bonus = pets.getRelicBonus(uid, PID);
    if (bonus.hp !== 0 || bonus.atk !== 0 || bonus.def !== 10) throw new Error('def should be 10, got ' + bonus.def);

    // 3. Socket a gem: dna_shard (+15 HP option)
    let gems = [ { gemId: 'dna_shard', stat: 'hp' }, null ];
    db.db.prepare('UPDATE relics SET gems = ? WHERE id = ?').run(JSON.stringify(gems), relicId);

    // 4. Verify bonus includes gem flat hp (+15 HP)
    bonus = pets.getRelicBonus(uid, PID);
    if (bonus.hp !== 15) throw new Error('hp should be 15, got ' + bonus.hp);

    // 5. Socket another gem: ancient_core (+5% ATK/DEF/SPD option)
    gems = [ { gemId: 'dna_shard', stat: 'hp' }, { gemId: 'ancient_core', stat: 'all' } ];
    db.db.prepare('UPDATE relics SET gems = ? WHERE id = ?').run(JSON.stringify(gems), relicId);

    // 6. Verify bonus includes percent stats (+5% ATK/DEF/SPD)
    bonus = pets.getRelicBonus(uid, PID);
    if (bonus.hp !== 15) throw new Error('hp should be 15');
    if (bonus.percent.atk !== 5 || bonus.percent.def !== 5 || bonus.percent.spd !== 5) throw new Error('percent bonus not applied correctly');

    // 7. Verify getEffectiveStats applies flat then percentage
    const basePet = { userId: uid, id: PID, hp: 100, atk: 100, def: 100, spd: 100, crit: 0 };
    const eff = pets.getEffectiveStats(basePet);
    // hp: (100 + 15) * 1.0 = 115 (no percent hp bonus)
    // def: (100 + 10) * 1.05 = 115
    // atk: (100 + 0) * 1.05 = 105
    // spd: (100 + 0) * 1.05 = 105
    if (eff.hp !== 115) throw new Error('effective hp should be 115, got ' + eff.hp);
    if (eff.def !== 115) throw new Error('effective def should be 115, got ' + eff.def);
    if (eff.atk !== 105) throw new Error('effective atk should be 105, got ' + eff.atk);
    if (eff.spd !== 105) throw new Error('effective spd should be 105, got ' + eff.spd);

    // 8. Verify combat simulation integrates the socketed gems
    const petDef = { emoji: '🐾' };
    const mk = (hp, atk, def, spd) => ({ userId: uid, id: PID, petId: 'x', hp, atk, def, spd, crit: 0, level: 1, element: null, skills: '[]' });
    
    // Enemy that can kill a pet with 100 HP + 10 DEF, but dies to a pet with 115 HP + 115 DEF
    const enemy = [{ hp: 10, atk: 110, def: 0, element: null }];
    
    // Simulate battle with equipped gemmed relic
    const outcome = pets.simulateBattle(mk(100, 100, 100, 100), petDef, enemy);
    if (!outcome.alive) throw new Error('gemmed relic pet should survive battle! log: ' + outcome.log.join('\n'));
  });
  test('relic: gem socketing interactive select menu flow', async () => {
    const pPanel = botRequire('systems/petPanel.js');
    const u = '99112', g = 'RELIC_INT_GUILD';
    
    // 1. Create user and active pet
    db.getOrCreateUser(g, u);
    db.db.prepare('INSERT INTO pets (guildId,userId,petId,name,active,level,hp,atk,def,spd,crit) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(g, u, '90001', 'TestPet', 1, 10, 100, 20, 10, 10, 5);
    const pet = pets.getPetData(g, u);

    // 2. Give the user a Legendary relic and some gems
    const relicId = db.db.prepare('INSERT INTO relics (guildId,userId,name,slot,rarity,stat_type,stat_value,refine_level,equipped_pet_id,gems) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(g, u, 'Aegis', 'armor', 'Legendary', 'def', 10, 0, pet.id, '[]').lastInsertRowid;

    db.addItem(g, u, 'dna_shard', 2);

    // 3. Click "Socket Gem" button: customId = pet_relicsocket_U
    const itButton = mockInteraction({ userId: u, guildId: g, customId: `pet_relicsocket_${u}` });
    let updateResult = await pPanel.handlePetButton(itButton);
    if (!updateResult || !updateResult.embeds || !updateResult.embeds[0].data.title.includes('Relic Gem Socketing')) {
      throw new Error('Expected socket relics panel');
    }

    // 4. Select relic: customId = pet_relicsocket_select_U, values = [relicId]
    const itRelicSelect = mockInteraction({ userId: u, guildId: g, customId: `pet_relicsocket_select_${u}`, values: [String(relicId)] });
    updateResult = await pPanel.handlePetSelectMenu(itRelicSelect);
    if (!updateResult || !updateResult.embeds || !updateResult.embeds[0].data.title.includes('Kelola Socket Relic')) {
      throw new Error('Expected slot management panel');
    }

    // 5. Select socket slot index 0: customId = pet_relicsocket_slot_select_relicId-U, values = ['0']
    const itSlotSelect = mockInteraction({ userId: u, guildId: g, customId: `pet_relicsocket_slot_select_${relicId}-${u}`, values: ['0'] });
    updateResult = await pPanel.handlePetSelectMenu(itSlotSelect);
    if (!updateResult || !updateResult.embeds || !updateResult.embeds[0].data.title.includes('Pilih Gem')) {
      throw new Error('Expected gem selection panel');
    }

    // 6. Select dna_shard gem: customId = pet_relicsocket_gem_select_relicId-0-U, values = ['dna_shard']
    const itGemSelect = mockInteraction({ userId: u, guildId: g, customId: `pet_relicsocket_gem_select_${relicId}-0-${u}`, values: ['dna_shard'] });
    updateResult = await pPanel.handlePetSelectMenu(itGemSelect);
    if (!updateResult || !updateResult.embeds || !updateResult.embeds[0].data.title.includes('Pilih Peningkatan Stat')) {
      throw new Error('Expected stat option selection panel');
    }

    // 7. Select hp stat: customId = pet_relicsocket_stat_select_relicId-0-dna_shard-U, values = ['hp']
    const itStatSelect = mockInteraction({ userId: u, guildId: g, customId: `pet_relicsocket_stat_select_${relicId}-0-dna_shard-${u}`, values: ['hp'] });
    updateResult = await pPanel.handlePetSelectMenu(itStatSelect);
    if (!updateResult || !updateResult.embeds || !updateResult.embeds[0].data.title.includes('Kelola Socket Relic')) {
      throw new Error('Expected back to slot panel');
    }
    // Verify item is deducted
    if (db.getItemCount(g, u, 'dna_shard') !== 1) throw new Error('Expected dna_shard count to be 1');
    // Verify relic gems inside DB
    const relicAfter = db.db.prepare('SELECT * FROM relics WHERE id = ?').get(relicId);
    let currentGems = JSON.parse(relicAfter.gems || '[]');
    if (currentGems[0].gemId !== 'dna_shard' || currentGems[0].stat !== 'hp') {
      throw new Error('relic gems not set correctly in database');
    }

    // 8. Go to gem select again to test replacement/refunding
    // Select socket slot 0
    updateResult = await pPanel.handlePetSelectMenu(mockInteraction({ userId: u, guildId: g, customId: `pet_relicsocket_slot_select_${relicId}-${u}`, values: ['0'] }));
    // User has 1 dna_shard left. They choose to socket dna_shard again but choose atk option this time.
    updateResult = await pPanel.handlePetSelectMenu(mockInteraction({ userId: u, guildId: g, customId: `pet_relicsocket_gem_select_${relicId}-0-${u}`, values: ['dna_shard'] }));
    // Select atk stat
    updateResult = await pPanel.handlePetSelectMenu(mockInteraction({ userId: u, guildId: g, customId: `pet_relicsocket_stat_select_${relicId}-0-dna_shard-${u}`, values: ['atk'] }));
    // Verify old gem is refunded, new gem is deducted. Total count of dna_shard should still be 1 (deducted 1, returned 1)
    if (db.getItemCount(g, u, 'dna_shard') !== 1) throw new Error('Expected dna_shard count to be 1 after replacement refund');
    // Verify slot 0 stat is now atk
    const relicAfter2 = db.db.prepare('SELECT * FROM relics WHERE id = ?').get(relicId);
    currentGems = JSON.parse(relicAfter2.gems || '[]');
    if (currentGems[0].stat !== 'atk') throw new Error('Expected socket 0 stat to be atk');

    // 9. Go to gem select again to test removal (cabut)
    updateResult = await pPanel.handlePetSelectMenu(mockInteraction({ userId: u, guildId: g, customId: `pet_relicsocket_slot_select_${relicId}-${u}`, values: ['0'] }));
    // Select cabut option
    updateResult = await pPanel.handlePetSelectMenu(mockInteraction({ userId: u, guildId: g, customId: `pet_relicsocket_gem_select_${relicId}-0-${u}`, values: ['cabut'] }));
    // Verify gem is refunded to inventory (1 + 1 = 2)
    if (db.getItemCount(g, u, 'dna_shard') !== 2) throw new Error('Expected dna_shard count to be 2 after cabut');
    // Verify slot 0 is now null
    const relicAfter3 = db.db.prepare('SELECT * FROM relics WHERE id = ?').get(relicId);
    currentGems = JSON.parse(relicAfter3.gems || '[]');
    if (currentGems[0] !== null) throw new Error('Expected socket 0 to be empty');
  });
  test('cooking: recipes and interactive panels validation', async () => {
    const pPanel = botRequire('systems/petPanel.js');
    const u = '88223', g = 'COOK_GUILD';

    // 1. Create user and active pet with depleted hunger/happiness
    db.getOrCreateUser(g, u);
    db.db.prepare('INSERT INTO pets (guildId,userId,petId,name,active,level,hp,atk,def,spd,crit,hunger,happiness) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(g, u, '90001', 'ChefPet', 1, 10, 100, 20, 10, 10, 5, 20, 30);
    const pet = pets.getPetData(g, u);

    // 2. Set up initial items: Gandum (2) and Susu Normal (1) in farm_storage, but missing Telur Normal (egg_normal)
    db.db.prepare('DELETE FROM farm_storage WHERE userId = ?').run(u);
    db.db.prepare('INSERT INTO farm_storage (guildId, userId, itemId, quantity) VALUES (?,?,?,?)').run(g, u, 'gandum', 2);
    db.db.prepare('INSERT INTO farm_storage (guildId, userId, itemId, quantity) VALUES (?,?,?,?)').run(g, u, 'milk_normal', 1);

    // Click "Cook" button
    const itCookBtn = mockInteraction({ userId: u, guildId: g, customId: `pet_cook_${u}` });
    let updateResult = await pPanel.handlePetButton(itCookBtn);
    if (!updateResult || !updateResult.embeds || !updateResult.embeds[0].data.title.includes('Cooking Hub')) {
      throw new Error('Expected cooking hub panel');
    }

    // Try to cook pancake (ingredients incomplete: missing egg)
    const itCookPancakeFail = mockInteraction({ userId: u, guildId: g, customId: `pet_docook_cooked_pancake-${u}` });
    let replyResult = await pPanel.handlePetButton(itCookPancakeFail);
    if (!replyResult || !replyResult.content || !replyResult.content.includes('Bahan kurang')) {
      throw new Error('Expected failure due to missing egg');
    }

    // Add missing egg_normal to storage
    db.db.prepare('INSERT INTO farm_storage (guildId, userId, itemId, quantity) VALUES (?,?,?,?)').run(g, u, 'egg_normal', 1);

    // Try cooking pancake again (should succeed)
    updateResult = await pPanel.handlePetButton(itCookPancakeFail);
    if (!updateResult || !updateResult.embeds || !updateResult.embeds[0].data.description.includes('Berhasil memasak')) {
      throw new Error('Expected cooking success for cooked_pancake');
    }

    // Verify ingredients consumed
    const { getStorageQty } = botRequire('systems/farming.js');
    if (getStorageQty(g, u, 'gandum') !== 0) throw new Error('Expected gandum to be consumed');
    if (getStorageQty(g, u, 'egg_normal') !== 0) throw new Error('Expected egg_normal to be consumed');
    if (getStorageQty(g, u, 'milk_normal') !== 0) throw new Error('Expected milk_normal to be consumed');

    // Verify pancake added to inventory
    if (db.getItemCount(g, u, 'cooked_pancake') !== 1) throw new Error('Expected 1 cooked_pancake in inventory');

    // Open Bag/Consumables Panel
    const itBagBtn = mockInteraction({ userId: u, guildId: g, customId: `pet_bag_${u}` });
    updateResult = await pPanel.handlePetButton(itBagBtn);
    if (!updateResult || !updateResult.embeds || !updateResult.embeds[0].data.title.includes('Tas Consumables')) {
      throw new Error('Expected bag consumables panel');
    }

    // Consume pancake
    const itUsePancake = mockInteraction({ userId: u, guildId: g, customId: `pet_use_cooked_pancake-${u}` });
    updateResult = await pPanel.handlePetButton(itUsePancake);
    if (!updateResult || !updateResult.embeds || !updateResult.embeds[0].data.description.includes('memakan Pancake')) {
      throw new Error('Expected pancake consumption success message');
    }

    // Verify pet stats fully restored
    const petAfter = pets.getPetData(g, u);
    if (petAfter.hunger !== 100 || petAfter.happiness !== 100) {
      throw new Error(`Expected hunger & happiness to be 100, got hunger=${petAfter.hunger}, happy=${petAfter.happiness}`);
    }
    if (db.getItemCount(g, u, 'cooked_pancake') !== 0) throw new Error('Expected pancake consumed from inventory');

    // 3. Test Spicy Fish Soup: Rare Fish + 2 Cabai + 2 Bawang Putih -> +10% ATK buff
    // Add ingredients
    db.db.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt) VALUES (?,?,?,?,?)')
      .run(g, u, 'arwana_silver', 2.5, Date.now()); // arwana_silver is Rare fish
    db.db.prepare('INSERT INTO farm_storage (guildId, userId, itemId, quantity) VALUES (?,?,?,?)').run(g, u, 'cabai', 2);
    db.db.prepare('INSERT INTO farm_storage (guildId, userId, itemId, quantity) VALUES (?,?,?,?)').run(g, u, 'bawang_putih', 2);

    // Cook spicy fish soup
    const itCookSoup = mockInteraction({ userId: u, guildId: g, customId: `pet_docook_spicy_fish_soup-${u}` });
    updateResult = await pPanel.handlePetButton(itCookSoup);
    if (!updateResult || !updateResult.embeds || !updateResult.embeds[0].data.description.includes('Berhasil memasak')) {
      throw new Error('Expected soup cooking success');
    }

    // Verify ingredients deducted
    const fishCount = db.db.prepare('SELECT COUNT(*) as c FROM fish_inventory WHERE userId = ?').get(u).c;
    if (fishCount !== 0) throw new Error('Expected rare fish to be consumed');
    const cabaiCount = db.db.prepare('SELECT quantity FROM farm_storage WHERE userId = ? AND itemId = ?').get(u, 'cabai')?.quantity || 0;
    const bawangPutihCount = db.db.prepare('SELECT quantity FROM farm_storage WHERE userId = ? AND itemId = ?').get(u, 'bawang_putih')?.quantity || 0;
    if (cabaiCount !== 0) throw new Error('Expected cabai to be consumed');
    if (bawangPutihCount !== 0) throw new Error('Expected bawang_putih to be consumed');

    // Verify soup added
    if (db.getItemCount(g, u, 'spicy_fish_soup') !== 1) throw new Error('Expected 1 spicy_fish_soup in inventory');

    // Consume soup
    const itUseSoup = mockInteraction({ userId: u, guildId: g, customId: `pet_use_spicy_fish_soup-${u}` });
    updateResult = await pPanel.handlePetButton(itUseSoup);
    if (!updateResult || !updateResult.embeds || !updateResult.embeds[0].data.description.includes('meminum Spicy Fish Soup')) {
      throw new Error('Expected soup consumption success');
    }

    // Verify ATK buff active (combat integration)
    const baseStats = pets.getEffectiveStats(petAfter);
    // Base ATK is 20, level 10 adds +18 (9*2) = 38, then 10% buff = Math.floor(38*1.10) = 41
    if (baseStats.atk !== 41) throw new Error('Expected effective ATK to be 41 (+10% buff on level-scaled 38), got ' + baseStats.atk);

    // 4. Test Veggie Salad: 3 Wortel + 2 Kentang -> 6 hours pest shield
    // Add ingredients
    db.db.prepare('INSERT INTO farm_storage (guildId, userId, itemId, quantity) VALUES (?,?,?,?)').run(g, u, 'wortel', 3);
    db.db.prepare('INSERT INTO farm_storage (guildId, userId, itemId, quantity) VALUES (?,?,?,?)').run(g, u, 'kentang', 2);

    // Cook veggie salad
    const itCookSalad = mockInteraction({ userId: u, guildId: g, customId: `pet_docook_veggie_salad-${u}` });
    updateResult = await pPanel.handlePetButton(itCookSalad);
    if (!updateResult || !updateResult.embeds || !updateResult.embeds[0].data.description.includes('Berhasil memasak')) {
      throw new Error('Expected salad cooking success');
    }

    // Verify salad added
    if (db.getItemCount(g, u, 'veggie_salad') !== 1) throw new Error('Expected veggie_salad in inventory');

    // Consume salad
    const itUseSalad = mockInteraction({ userId: u, guildId: g, customId: `pet_use_veggie_salad-${u}` });
    updateResult = await pPanel.handlePetButton(itUseSalad);
    if (!updateResult || !updateResult.embeds || !updateResult.embeds[0].data.description.includes('memakan Veggie Salad')) {
      throw new Error('Expected salad consumption success');
    }

    // Verify pest shield set in user stats
    const shieldUntil = db.getUserStat(g, u, 'pest_shield_until');
    if (shieldUntil < Date.now() + 5.9 * 3600 * 1000) {
      throw new Error('Expected pest shield to be set to ~6 hours');
    }

    // 5. Test Locked Fish catches: a locked Rare fish cannot be cooked
    db.db.prepare('DELETE FROM fish_inventory WHERE userId = ?').run(u);
    // Insert a locked Rare fish (locked = 1)
    db.db.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt, locked) VALUES (?,?,?,?,?,1)')
      .run(g, u, 'arwana_silver', 2.5, Date.now());
    // Give cabai and bawang putih
    db.db.prepare('INSERT INTO farm_storage (guildId, userId, itemId, quantity) VALUES (?,?,?,?)').run(g, u, 'cabai', 2);
    db.db.prepare('INSERT INTO farm_storage (guildId, userId, itemId, quantity) VALUES (?,?,?,?)').run(g, u, 'bawang_putih', 2);

    // Try cooking spicy fish soup (should fail because rare fish is locked)
    const itCookSoupLocked = mockInteraction({ userId: u, guildId: g, customId: `pet_docook_spicy_fish_soup-${u}` });
    const replyResult2 = await pPanel.handlePetButton(itCookSoupLocked);
    if (!replyResult2 || !replyResult2.content || !replyResult2.content.includes('Bahan kurang')) {
      throw new Error('Expected failure due to locked Rare Fish');
    }

    // 6. Test select menu and modal multi-quantity cooking flow
    // Clean up
    db.db.prepare('DELETE FROM fish_inventory WHERE userId = ?').run(u);
    db.db.prepare('DELETE FROM farm_storage WHERE userId = ?').run(u);
    
    // Seed ingredients for 2 grilled fish (Common Fish x4, Cabai x4, Bawang Merah x2)
    db.db.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt, locked) VALUES (?,?,?,?,?,0)')
      .run(g, u, 'nila', 1.0, Date.now());
    db.db.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt, locked) VALUES (?,?,?,?,?,0)')
      .run(g, u, 'nila', 1.1, Date.now());
    db.db.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt, locked) VALUES (?,?,?,?,?,0)')
      .run(g, u, 'mujair', 1.2, Date.now());
    db.db.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt, locked) VALUES (?,?,?,?,?,0)')
      .run(g, u, 'mujair', 1.3, Date.now());
    db.db.prepare('INSERT INTO farm_storage (guildId, userId, itemId, quantity) VALUES (?,?,?,?)').run(g, u, 'cabai', 4);
    db.db.prepare('INSERT INTO farm_storage (guildId, userId, itemId, quantity) VALUES (?,?,?,?)').run(g, u, 'bawang_merah', 2);

    // Select menu choice
    const itSelectCook = mockInteraction({
      userId: u, guildId: g,
      customId: `pet_cook_select_${u}`,
      values: ['grilled_fish']
    });
    const selectResult = await pPanel.handlePetSelectMenu(itSelectCook);
    if (!selectResult || selectResult.data?.custom_id !== `pet_cookqty_modal_grilled_fish_${u}`) {
      throw new Error('Expected select menu to prompt quantity modal');
    }

    // Modal submit: cook 2 grilled fish
    const itSubmitModal = mockInteraction({
      userId: u, guildId: g,
      customId: `pet_cookqty_modal_grilled_fish_${u}`,
      fields: { pet_cook_qty: '2' }
    });
    const modalResult = await pPanel.handlePetModal(itSubmitModal);
    if (!modalResult || !modalResult.embeds || !modalResult.embeds[0].data.description.includes('Berhasil memasak')) {
      throw new Error('Expected modal submit to successfully cook 2 grilled_fish');
    }

    // Verify ingredients consumed
    const remainingCommon = db.db.prepare('SELECT COUNT(*) as c FROM fish_inventory WHERE userId = ?').get(u).c;
    if (remainingCommon !== 0) throw new Error('Expected all 4 common fish to be consumed');
    const remainingCabai = db.db.prepare('SELECT quantity FROM farm_storage WHERE userId = ? AND itemId = ?').get(u, 'cabai')?.quantity || 0;
    if (remainingCabai !== 0) throw new Error('Expected all 4 cabai to be consumed');

    // Verify 2 grilled_fish added
    if (db.getItemCount(g, u, 'grilled_fish') !== 2) throw new Error('Expected 2 grilled_fish in inventory');

    // 7. Test using grilled_fish through select menu in Bag
    const itUseSelect = mockInteraction({
      userId: u, guildId: g,
      customId: `pet_bag_use_select_${u}`,
      values: ['grilled_fish']
    });
    const bagResult = await pPanel.handlePetSelectMenu(itUseSelect);
    if (!bagResult || !bagResult.embeds || !bagResult.embeds[0].data.description.includes('memakan Grilled Fish')) {
      throw new Error('Expected bag select use of grilled_fish to succeed');
    }

    // Verify 1 grilled_fish consumed and buff active
    if (db.getItemCount(g, u, 'grilled_fish') !== 1) throw new Error('Expected 1 grilled_fish consumed');
    const luckBuffUntil = db.getUserStat(g, u, 'fishing_luck_buff_until');
    if (luckBuffUntil < Date.now() + 0.9 * 3600 * 1000) {
      throw new Error('Expected luck buff until to be set');
    }
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
  test('achievement: syncAchievements self-heals stuck threshold badges', () => {
    const g = 'ACH_SYNC', u = 'ACHU_SYNC';
    db.getOrCreateUser(g, u);
    db.db.prepare('DELETE FROM achievements WHERE userId = ?').run(u);
    db.incrementUserStat(g, u, 'total_buys', 601); // far past first_buy(1) & buy_10(10) but never granted
    if (ach.hasAchievement(g, u, 'buy_10')) throw new Error('precondition: buy_10 should still be locked');
    const guild = { id: g, name: 'G', members: { fetch: async () => null, cache: new Map() }, channels: { cache: new Map() }, roles: { cache: new Map() } };
    return ach.syncAchievements(guild, u).then(() => {
      if (!ach.hasAchievement(g, u, 'first_buy')) throw new Error('first_buy not self-healed');
      if (!ach.hasAchievement(g, u, 'buy_10')) throw new Error('buy_10 not self-healed');
    });
  });
  test('achievement: new feature badges exist + sync grants them when condition met', () => {
    const ids = ['togel_first', 'togel_win_first', 'togel_win_10', 'togel_won_500k', 'world_boss_first', 'world_boss_slayer', 'relic_melt_first', 'expedition_first', 'expedition_25'];
    for (const id of ids) if (!ach.ACHIEVEMENTS.some(a => a.id === id)) throw new Error('missing new badge: ' + id);
    const g = 'ACH_NEW', u = 'ACHU_NEW';
    db.getOrCreateUser(g, u);
    db.db.prepare('DELETE FROM achievements WHERE userId = ?').run(u);
    db.incrementUserStat(g, u, 'togel_bets', 3);
    db.incrementUserStat(g, u, 'total_expeditions', 25);
    db.incrementUserStat(g, u, 'relic_melts', 1);
    const guild = { id: g, name: 'G', members: { fetch: async () => null, cache: new Map() }, channels: { cache: new Map() }, roles: { cache: new Map() } };
    return ach.syncAchievements(guild, u).then(() => {
      if (!ach.hasAchievement(g, u, 'togel_first')) throw new Error('togel_first not granted by sync');
      if (!ach.hasAchievement(g, u, 'relic_melt_first')) throw new Error('relic_melt_first not granted by sync');
      if (!ach.hasAchievement(g, u, 'expedition_first')) throw new Error('expedition_first not granted by sync');
      if (!ach.hasAchievement(g, u, 'expedition_25')) throw new Error('expedition_25 not granted by sync');
    });
  });

  // ---- Anti-spam message gate ----
  const mc = botRequire('events/messageCreate.js');
  test('antispam: blocks single-char, repeated-char, and rapid duplicates', () => {
    const g = 'AS_G', uid = 'AS_U';
    const mk = (c) => ({ content: c, author: { id: uid } });
    if (!mc.isSpamMessage(g, mk('k'))) throw new Error('single char should be spam');
    if (!mc.isSpamMessage(g, mk('kkkkk'))) throw new Error('repeated char should be spam');
    if (mc.isSpamMessage(g, mk('halo semua apa kabar'))) throw new Error('normal message should NOT be spam');
    if (!mc.isSpamMessage(g, mk('halo semua apa kabar'))) throw new Error('rapid duplicate should be spam');
    if (mc.isSpamMessage(g, mk('pesan yang berbeda lagi'))) throw new Error('different message should NOT be spam');
  });

  // ---- DM notifications (COMPLETELY DISABLED) ----
  const notif = botRequire('systems/notifications.js');
  test('notif: notifications are completely disabled', () => {
    const g = 'NOTIF_G', u = 'NOTIFU1';
    if (notif.canDM(g, u)) throw new Error('canDM must return false');
    notif.setDmConsent(g, u, true);
    if (notif.canDM(g, u)) throw new Error('canDM must stay false even after setDmConsent');
    if (notif.getDmConsent(g, u) !== 0) throw new Error('dm consent must be 0');
  });
  test('notif: sendNotification always returns false', () => {
    const g = 'NOTIF_G2', u = 'NOTIFU2';
    let sent = 0;
    const client = { users: { fetch: async () => ({ send: async () => { sent++; } }) } };
    return Promise.resolve(notif.sendNotification(client, g, u, 'daily', 'hi')).then(r1 => {
      if (r1 !== false || sent !== 0) throw new Error('must not DM');
    });
  });
  test('notif: dmUser respects consent and is disabled', () => {
    const g = 'NOTIF_G4', u = 'NOTIFU4';
    let sent = 0;
    const client = { users: { fetch: async () => ({ send: async () => { sent++; } }) } };
    return Promise.resolve(notif.dmUser(client, g, u, 'win')).then(r => {
      if (r !== false || sent !== 0) throw new Error('dmUser must return false');
    });
  });
  test('notif: wasDmAsked returns true to prevent prompting', () => {
    const g = 'NOTIF_G5', u = 'NOTIFU5';
    if (!notif.wasDmAsked(g, u)) throw new Error('should return true to prevent prompt');
  });
  test('notif: consent prompt + panel build with disabled info', () => {
    const p = notif.buildConsentPrompt('123');
    if (!p.embeds || p.embeds.length === 0) throw new Error('consent prompt embed missing');
    const panel = notif.buildNotifPanel('NOTIF_G3', '123');
    if (!panel.embeds || panel.embeds.length === 0) throw new Error('panel embed missing');
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

  // ---- Dungeon/Boss difficulty integrity (rewards must stay, stats valid) ----
  test('dungeon/boss: stats well-formed and rewards preserved', () => {
    const { DUNGEON_TIERS, BOSS_LIST } = botRequire('data/dungeons.js');
    for (const d of DUNGEON_TIERS) {
      if (d.monsterHp.length !== d.waves || d.monsterAtk.length !== d.waves) throw new Error(`${d.id}: hp/atk length != waves`);
      if (d.monsterHp.some(h => h <= 0) || d.monsterAtk.some(a => a <= 0)) throw new Error(`${d.id}: non-positive stat`);
      if (!(d.reward[1] > d.reward[0] && d.reward[0] > 0)) throw new Error(`${d.id}: bad reward range`);
    }
    for (const b of BOSS_LIST) {
      if (!(b.hp > 0 && b.atk > 0 && b.def > 0)) throw new Error(`${b.id}: non-positive stat`);
      if (!(b.reward[1] > b.reward[0] && b.reward[0] > 0)) throw new Error(`${b.id}: bad reward range`);
    }
    // Rewards intentionally unchanged by the difficulty buff.
    const void_ = DUNGEON_TIERS.find(d => d.id === 'void');
    if (void_.reward[0] !== 15000 || void_.reward[1] !== 32000) throw new Error('void reward changed!');
    const ancient = BOSS_LIST.find(b => b.id === 'ancient');
    if (ancient.reward[0] !== 70000 || ancient.reward[1] !== 150000) throw new Error('ancient reward changed!');
  });

  // ---- Localization & i18n System ----
  const i18n = botRequire('systems/i18n.js');
  test('i18n: defaults to id and translates correctly', () => {
    const g = 'I18N_G', u = 'I18NU1';
    db.getOrCreateUser(g, u);
    // Unset locale defaults to 'id'
    const locale = i18n.getLocale(g, u);
    if (locale !== 'id') throw new Error('Expected default locale to be id, got ' + locale);
    
    // Test simple translation in Indonesian
    const msg = i18n.t(g, u, 'language.success');
    if (!msg.includes('Bahasa berhasil diubah ke')) throw new Error('Expected Indonesian language.success string');
  });

  test('i18n: sets locale and translates with parameters', () => {
    const g = 'I18N_G', u = 'I18NU2';
    db.getOrCreateUser(g, u);
    
    // Set to english
    i18n.setLocale(g, u, 'en');
    const locale = i18n.getLocale(g, u);
    if (locale !== 'en') throw new Error('Expected locale to be en');
    
    // Test simple translation in English
    const msg = i18n.t(g, u, 'language.success');
    if (!msg.includes('Language successfully changed to')) throw new Error('Expected English language.success string');
    
    // Test parameterized translation
    const cookMsg = i18n.t(g, u, 'cooking.success', { qty: 3, item: 'Sushi' });
    if (cookMsg !== 'Successfully cooked 3x **Sushi**! 🍳') {
      throw new Error('Expected parsed English cooking success string, got: ' + cookMsg);
    }
  });

  test('i18n: fallback to default id locale when key is missing in en', () => {
    const g = 'I18N_G', u = 'I18NU3';
    db.getOrCreateUser(g, u);
    i18n.setLocale(g, u, 'en');
    
    // Insert a dummy key to locales.id but not locales.en
    i18n.locales.id.test_fallback = 'Ini fallback';
    // Remove if present in en
    if (i18n.locales.en) delete i18n.locales.en.test_fallback;
    
    const msg = i18n.t(g, u, 'test_fallback');
    if (msg !== 'Ini fallback') throw new Error('Expected fallback to Indonesian, got ' + msg);
  });

  // ---- Game Terms Consent Gating ----
  const consent = botRequire('systems/consent.js');
  test('consent: hasGameConsent defaults false and is updated by setGameConsent', () => {
    const g = 'CONSENT_G1', u = 'CONSENT_U1';
    db.getOrCreateUser(g, u);
    // 1. Initial consent must be false
    if (consent.hasGameConsent(g, u)) throw new Error('consent should default to false');

    // 2. Set to true
    consent.setGameConsent(g, u, true);
    if (!consent.hasGameConsent(g, u)) throw new Error('consent should be true after set');

    // 3. Set to false
    consent.setGameConsent(g, u, false);
    if (consent.hasGameConsent(g, u)) throw new Error('consent should be false after setting back');
  });

  test('consent: handles consent button interactions correctly', async () => {
    const handleInteractionCreate = botRequire('events/interactionCreate.js');
    const g = 'CONSENT_G2', u = 'CONSENT_U2';
    db.getOrCreateUser(g, u);
    notif.markDmAsked(g, u);
    
    // Test yes button
    const itYes = mockInteraction({
      userId: u, guildId: g,
      customId: `gameconsent_yes_${u}`
    });
    itYes.isButton = () => true;
    itYes.isChatInputCommand = () => false;
    
    await handleInteractionCreate(itYes);
    if (!consent.hasGameConsent(g, u)) throw new Error('yes button should grant consent');
    if (!itYes._cap.update || !itYes._cap.update.content.includes('Selamat bermain') && !itYes._cap.update.content.includes('Have fun')) {
      throw new Error('yes button should update with success message, got: ' + JSON.stringify(itYes._cap.update));
    }

    // Test no button
    const itNo = mockInteraction({
      userId: u, guildId: g,
      customId: `gameconsent_no_${u}`
    });
    itNo.isButton = () => true;
    itNo.isChatInputCommand = () => false;

    await handleInteractionCreate(itNo);
    if (consent.hasGameConsent(g, u)) throw new Error('no button should revoke consent');
    if (!itNo._cap.update || !itNo._cap.update.content.includes('terkunci') && !itNo._cap.update.content.includes('locked')) {
      throw new Error('no button should update with declined message');
    }
  });

  test('consent: command gating blocks gated commands and allows economy commands', async () => {
    const handleInteractionCreate = botRequire('events/interactionCreate.js');
    const g = 'CONSENT_G3', u = 'CONSENT_U3';
    db.getOrCreateUser(g, u);
    notif.markDmAsked(g, u);
    
    // Command that is gated (e.g. /casino)
    const itGated = mockInteraction({
      userId: u, guildId: g,
      customId: 'casino'
    });
    itGated.isButton = () => false;
    itGated.isChatInputCommand = () => true;
    itGated.commandName = 'casino';
    itGated.options = { getSubcommand: () => null, getSubcommandGroup: () => null };

    // Initially, user has no consent, so calling /fishing should prompt with consent embeds
    await handleInteractionCreate(itGated);
    if (!itGated._cap.reply || !itGated._cap.reply.embeds || !itGated._cap.reply.embeds[0].data.title.includes('Persetujuan') && !itGated._cap.reply.embeds[0].data.title.includes('Agreement')) {
      throw new Error('gated command should reply with consent prompt');
    }

    // Command that is NOT gated (e.g. /wallet)
    const itNonGated = mockInteraction({
      userId: u, guildId: g,
      customId: 'wallet'
    });
    itNonGated.isButton = () => false;
    itNonGated.isChatInputCommand = () => true;
    itNonGated.commandName = 'wallet';
    itNonGated.options = { getSubcommand: () => null, getSubcommandGroup: () => null };

    await handleInteractionCreate(itNonGated);
    // Should bypass gate and not reply with consent prompt
    if (itNonGated._cap.reply && itNonGated._cap.reply.embeds && itNonGated._cap.reply.embeds[0].data.title && (itNonGated._cap.reply.embeds[0].data.title.includes('Persetujuan') || itNonGated._cap.reply.embeds[0].data.title.includes('Agreement'))) {
      throw new Error('non-gated command should not be blocked');
    }
  });

  test('consent: interactive components are gated by consent', async () => {
    const handleInteractionCreate = botRequire('events/interactionCreate.js');
    const g = 'CONSENT_G4', u = 'CONSENT_U4';
    db.getOrCreateUser(g, u);
    notif.markDmAsked(g, u);
    
    // Interaction that is gated (e.g. clicking /fish_cast_ button)
    const itGatedBtn = mockInteraction({
      userId: u, guildId: g,
      customId: `fish_cast_${u}`
    });
    itGatedBtn.isButton = () => true;
    itGatedBtn.isChatInputCommand = () => false;

    await handleInteractionCreate(itGatedBtn);
    if (!itGatedBtn._cap.reply || !itGatedBtn._cap.reply.embeds || !itGatedBtn._cap.reply.embeds[0].data.title.includes('Persetujuan') && !itGatedBtn._cap.reply.embeds[0].data.title.includes('Agreement')) {
      throw new Error('gated interaction should reply with consent prompt');
    }

    // Grant consent
    consent.setGameConsent(g, u, true);

    // Call gated interaction again
    const itGatedBtnAfter = mockInteraction({
      userId: u, guildId: g,
      customId: `fish_cast_${u}`
    });
    itGatedBtnAfter.isButton = () => true;
    itGatedBtnAfter.isChatInputCommand = () => false;

    await handleInteractionCreate(itGatedBtnAfter);
    // Should bypass and be handled by normal fishing (e.g. cooldown/fail or cast success, but NOT consent prompt)
    if (itGatedBtnAfter._cap.reply && itGatedBtnAfter._cap.reply.embeds && itGatedBtnAfter._cap.reply.embeds[0].data.title && (itGatedBtnAfter._cap.reply.embeds[0].data.title.includes('Persetujuan') || itGatedBtnAfter._cap.reply.embeds[0].data.title.includes('Agreement'))) {
      throw new Error('gated interaction should proceed normally when consent is granted');
    }
  });

  test('achievement: single unlock is announced after delay as single embed', () => {
    const ach = botRequire('systems/achievements.js');
    const g = 'ACH_COAL_G1', u = 'ACH_COAL_U1', chId = '12345';
    db.getOrCreateUser(g, u);
    db.db.prepare("INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, 'achievement_channel', ?)").run(g, chId);
    db.db.prepare('DELETE FROM achievements WHERE guildId = ? AND userId = ?').run(g, u);

    let sentPayload = null;
    const mockChannel = {
      send: async (p) => { sentPayload = p; return p; }
    };
    const mockGuild = {
      id: g,
      channels: { cache: new Map([[chId, mockChannel]]) }
    };

    return ach.grantAchievement(mockGuild, u, 'first_chat').then(() => {
      // Should not send immediately
      if (sentPayload !== null) throw new Error('should not send immediately');

      // Wait 30ms (test timeout is 10ms)
      return new Promise(resolve => setTimeout(resolve, 30));
    }).then(() => {
      if (!sentPayload || !sentPayload.embeds || sentPayload.embeds[0].data.title !== '🏆 ACHIEVEMENT UNLOCKED!') {
        throw new Error('should send single achievement embed after delay');
      }
    });
  });

  test('achievement: multiple unlocks are coalesced into a single combined embed', () => {
    const ach = botRequire('systems/achievements.js');
    const g = 'ACH_COAL_G2', u = 'ACH_COAL_U2', chId = '12345';
    db.getOrCreateUser(g, u);
    db.db.prepare("INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, 'achievement_channel', ?)").run(g, chId);
    db.db.prepare('DELETE FROM achievements WHERE guildId = ? AND userId = ?').run(g, u);

    let sentPayloads = [];
    const mockChannel = {
      send: async (p) => { sentPayloads.push(p); return p; }
    };
    const mockGuild = {
      id: g,
      channels: { cache: new Map([[chId, mockChannel]]) }
    };

    // Trigger multiple achievements
    return Promise.all([
      ach.grantAchievement(mockGuild, u, 'first_chat'),
      ach.grantAchievement(mockGuild, u, 'first_buy')
    ]).then(() => {
      if (sentPayloads.length > 0) throw new Error('should not send immediately');
      
      // Wait for delay
      return new Promise(resolve => setTimeout(resolve, 30));
    }).then(() => {
      if (sentPayloads.length !== 1) {
        throw new Error('should only send ONE coalesced message: got ' + sentPayloads.length);
      }
      const p = sentPayloads[0];
      if (!p.embeds || p.embeds[0].data.title !== '🏆 MULTIPLE ACHIEVEMENTS UNLOCKED!') {
        throw new Error('should send multiple achievements coalesced title');
      }
      const desc = p.embeds[0].data.description;
      if (!desc.includes('Newbie') || !desc.includes('Shopaholic Pemula')) {
        throw new Error('description should list all unlocked achievements');
      }
    });
  });

  // ---- Welcome Card Cache ----
  test('welcomeCardCache: caching and validation flow', async () => {
    const { getCachedImage, failedUrls } = botRequire('systems/welcomeCardCache');
    const originalFetch = globalThis.fetch;

    // 1. Invalid input validation
    try {
      await getCachedImage('');
      throw new Error('Expected validation error for empty URL');
    } catch (e) {
      if (e.message !== 'Invalid URL') throw e;
    }

    // 2. Successful download and local cache test
    const testUrlSuccess = 'https://example.com/test-bg-image-success.png';
    const fs = require('fs');
    const hash = require('crypto').createHash('md5').update(testUrlSuccess).digest('hex');
    const cachePath = require('path').join(__dirname, '..', '..', 'assets', 'cache', `${hash}.png`);
    try { fs.unlinkSync(cachePath); } catch (_) {}

    let successFetchCount = 0;
    globalThis.fetch = async (url, init) => {
      if (typeof url === 'string' && url.includes('test-bg-image-success.png')) {
        successFetchCount++;
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => {
            return new Uint8Array([1, 2, 3, 4]).buffer;
          }
        };
      }
      return originalFetch(url, init);
    };

    try {
      const cachedPath = await getCachedImage(testUrlSuccess);
      if (!cachedPath.includes('cache')) throw new Error(`Expected path to include cache, got: ${cachedPath}`);
      
      const fs = require('fs');
      const content = fs.readFileSync(cachedPath);
      if (content.length !== 4) throw new Error(`Expected length of 4, got: ${content.length}`);
      if (successFetchCount !== 1) throw new Error(`Expected 1 fetch, got: ${successFetchCount}`);

      // Request again, should hit the disk cache and NOT fetch again
      const cachedPath2 = await getCachedImage(testUrlSuccess);
      if (cachedPath2 !== cachedPath) throw new Error('Expected identical cache path');
      if (successFetchCount !== 1) throw new Error(`Expected still 1 fetch (disk cache hit), got: ${successFetchCount}`);
    } finally {
      // Cleanup file if exists
      try {
        const fs = require('fs');
        const hash = require('crypto').createHash('md5').update(testUrlSuccess).digest('hex');
        const cachePath = require('path').join(__dirname, '..', '..', 'assets', 'cache', `${hash}.png`);
        fs.unlinkSync(cachePath);
      } catch (_) {}
    }

    // 3. Failure caching test
    const testUrlFail = 'https://example.com/failed-image-404.png';
    failedUrls.delete(testUrlFail);

    let failFetchCount = 0;
    globalThis.fetch = async (url, init) => {
      if (typeof url === 'string' && url.includes('failed-image-404.png')) {
        failFetchCount++;
        return {
          ok: false,
          status: 404,
          arrayBuffer: async () => new ArrayBuffer(0)
        };
      }
      return originalFetch(url, init);
    };

    try {
      try {
        await getCachedImage(testUrlFail);
        throw new Error('Expected 404 error');
      } catch (e) {
        if (!e.message.includes('status code 404')) throw e;
      }

      // Second attempt should be rejected instantly from memory cache without fetch
      try {
        await getCachedImage(testUrlFail);
        throw new Error('Expected memory cache rejection');
      } catch (e) {
        if (!e.message.includes('temporary failure cache')) throw e;
      }

      if (failFetchCount !== 1) {
        throw new Error(`Expected exactly 1 fetch attempt, got: ${failFetchCount}`);
      }
    } finally {
      globalThis.fetch = originalFetch;
      failedUrls.delete(testUrlFail);
    }
  });

  // ---- InviteTracker upgrades (anti-abuse & bonus in leaderboard) ----
  const itrack = botRequire('systems/inviteTracker.js');
  test('inviteTracker: leaderboard includes bonus invites and orders accurately', () => {
    const g = 'IT_GUILD';
    itrack.resetInvites(g);
    db.db.prepare('DELETE FROM invite_bonus WHERE guildId = ?').run(g);

    // Seed inviter A: 2 real invites
    db.db.prepare('INSERT INTO invites (guildId, inviterId, invitedId, code, joinedAt, fake) VALUES (?, ?, ?, ?, ?, 0)').run(g, 'u_inv_A', 'sub_1', 'codeA', Date.now());
    db.db.prepare('INSERT INTO invites (guildId, inviterId, invitedId, code, joinedAt, fake) VALUES (?, ?, ?, ?, ?, 0)').run(g, 'u_inv_A', 'sub_2', 'codeA', Date.now());

    // Seed inviter B: 1 real invite + 3 bonus invites = 4 total
    db.db.prepare('INSERT INTO invites (guildId, inviterId, invitedId, code, joinedAt, fake) VALUES (?, ?, ?, ?, ?, 0)').run(g, 'u_inv_B', 'sub_3', 'codeB', Date.now());
    itrack.addBonusInvites(g, 'u_inv_B', 3);

    const lb = itrack.getInviteLeaderboard(g, 10);
    if (lb.length < 2) throw new Error('expected at least 2 in leaderboard, got ' + lb.length);
    if (lb[0].userId !== 'u_inv_B' || lb[0].total !== 4) throw new Error(`expected u_inv_B top with 4, got ${lb[0].userId} with ${lb[0].total}`);
    if (lb[1].userId !== 'u_inv_A' || lb[1].total !== 2) throw new Error(`expected u_inv_A second with 2, got ${lb[1].userId} with ${lb[1].total}`);
  });

  test('inviteTracker: self-invite and bot invites marked as fake', async () => {
    const g = 'IT_GUILD_2';
    itrack.resetInvites(g);

    // Mock guild and members
    const fakeGuild = {
      id: g,
      memberCount: 50,
      invites: {
        fetch: async () => new Map([['c_self', { code: 'c_self', uses: 1, inviterId: 'self_user' }]])
      },
      channels: { cache: new Map() }
    };
    itrack.inviteCache.set(g, new Map([['c_self', 0]]));

    const selfMember = {
      id: 'self_user',
      guild: fakeGuild,
      user: { id: 'self_user', bot: false, createdTimestamp: Date.now() - 30 * 86400000 }
    };

    await itrack.handleMemberJoin(selfMember);
    const rec = itrack.getInvitedBy(g, 'self_user');
    if (!rec || rec.fake !== 1) throw new Error('self-invite should be recorded as fake (1)');
  });

  // ---- TempvoicePanel upgrades (controls & cleanup) ----
  const tvp = botRequire('systems/tempvoicePanel.js');
  test('tempvoicePanel: buildManagePanel renders status and cleanupMemberSpace removes record', async () => {
    const g = 'TV_GUILD', owner = 'u_tv_owner';
    db.db.prepare('DELETE FROM private_spaces WHERE guildId = ? AND ownerId = ?').run(g, owner);
    db.db.prepare('INSERT INTO private_spaces (guildId, ownerId, categoryId, textChannelId, voiceChannelId, hidden) VALUES (?, ?, ?, ?, ?, 0)')
      .run(g, owner, 'cat_1', 'txt_1', 'vc_1');

    const fakeGuild = {
      id: g,
      name: 'TV Guild',
      roles: { everyone: { id: 'role_everyone' } },
      channels: {
        cache: new Map([
          ['cat_1', { id: 'cat_1', delete: async () => {} }],
          ['txt_1', { id: 'txt_1', delete: async () => {} }],
          ['vc_1', { id: 'vc_1', userLimit: 5, permissionOverwrites: { cache: new Map() }, delete: async () => {} }]
        ])
      }
    };

    const pnl = tvp.buildManagePanel(fakeGuild, owner);
    if (!pnl.embeds || !pnl.embeds[0].data.description.includes('Voice Limit')) throw new Error('manage panel should show Voice Limit');

    await tvp.cleanupMemberSpace(fakeGuild, owner);
    const after = db.db.prepare('SELECT * FROM private_spaces WHERE guildId = ? AND ownerId = ?').get(g, owner);
    if (after) throw new Error('cleanupMemberSpace should remove record from database');
  });

  // ---- Streak Prestige & VVIP Lounge (Gaya A) ----
  const streakTier = botRequire('systems/streakTier.js');
  const dr = botRequire('systems/dailyReward.js');

  test('streakTier: tiers define aesthetic ranks, bonuses and lounge unlocks', () => {
    const t7 = streakTier.getStreakTier(7);
    if (t7.name !== '✦ Sparks' || t7.chatBonus !== 0.10) throw new Error('t7 wrong');

    const t100 = streakTier.getStreakTier(100);
    if (t100.name !== '✦ Sovereign' || !t100.lounge) throw new Error('t100 should unlock lounge');

    const t200 = streakTier.getStreakTier(215);
    if (t200.name !== '✦ Eternal' || t200.chatBonus !== 1.50) throw new Error('t200 should be Eternal with 1.50 bonus');

    const t365 = streakTier.getStreakTier(400);
    if (t365.name !== '✦ Mythos' || t365.chatBonus !== 2.00) throw new Error('t365 should be Mythos');
  });

  test('streakTier: claimLoungeCrate checks streak threshold and awards rewards', () => {
    const g = 'ST_G', u = 'ST_U';
    db.getOrCreateUser(g, u);
    // User with streak 50 should be rejected
    const rLow = streakTier.claimLoungeCrate(g, u, 50);
    if (rLow.ok) throw new Error('streak 50 should not claim lounge crate');

    // User with streak 200 should receive crate
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    db.db.prepare('DELETE FROM user_stats WHERE userId = ? AND stat_key = ?').run(u, `lounge_crate_${today}`);
    const rHigh = streakTier.claimLoungeCrate(g, u, 200);
    if (!rHigh.ok || rHigh.money < 100000) throw new Error('streak 200 crate failed');

    // Second claim same day blocked
    const rDup = streakTier.claimLoungeCrate(g, u, 200);
    if (rDup.ok) throw new Error('duplicate crate claim should be blocked');
  });

    test('streakTier: ensureAllStreakRoles and syncAllMemberStreakRoles work properly', async () => {
    const rolesCreated = [];
    const membersMap = new Map();

    const mockRole = (name, color) => ({ id: `role_${name}`, name, color });

    const fakeGuild = {
      id: 'ST_SYNC_GUILD',
      members: {
        me: { permissions: { has: () => true } },
        fetch: async () => membersMap,
        fetchMe: async () => fakeGuild.members.me,
        cache: membersMap
      },
      roles: {
        cache: new Map(),
        fetch: async () => fakeGuild.roles.cache,
        create: async (data) => {
          const r = mockRole(data.name, data.color);
          fakeGuild.roles.cache.set(r.id, r);
          rolesCreated.push(r);
          return r;
        }
      }
    };

    // 1. ensureAllStreakRoles creates 7 roles
    const createdMap = await streakTier.ensureAllStreakRoles(fakeGuild);
    if (Object.keys(createdMap).length !== 7) throw new Error('expected 7 streak roles created');

    // 2. Setup mock member with streak 224
    const addedRoles = [];
    const mockMember = {
      id: 'u_veteran_224',
      guild: fakeGuild,
      roles: {
        cache: new Map(),
        add: async (r) => { addedRoles.push(r.name); mockMember.roles.cache.set(r.id, r); },
        remove: async (r) => { mockMember.roles.cache.delete(r.id); }
      }
    };
    membersMap.set('u_veteran_224', mockMember);

    // Seed database streak
    db.db.prepare('DELETE FROM streaks WHERE userId = ?').run('u_veteran_224');
    db.db.prepare('INSERT INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, 224, ?)').run('ST_SYNC_GUILD', 'u_veteran_224', '2026-11-20');

    // 3. syncAllMemberStreakRoles should sync u_veteran_224 to ✦ Eternal
    const res = await streakTier.syncAllMemberStreakRoles(fakeGuild);
    if (!res.ok) throw new Error('syncAllMemberStreakRoles failed: ' + res.error);
    if (res.syncedCount < 1) throw new Error('expected at least 1 member synced');
    if (!addedRoles.includes('✦ Eternal')) throw new Error('member 224 days should be granted ✦ Eternal');
  });

  test('dailyReward: milestones extended to 200 and 365 days', () => {
    const r200 = dr.computeDailyReward(200);
    if (!r200.milestoneLabel || !r200.milestoneLabel.includes('200 HARI')) throw new Error('missing 200-day milestone');
    if (r200.money < 2500000) throw new Error('200-day money reward too low');

    const r365 = dr.computeDailyReward(365);
    if (!r365.milestoneLabel || !r365.milestoneLabel.includes('365 HARI')) throw new Error('missing 365-day milestone');
  });

  test('layoutCleanup: cleanServerLayout fixes typo, moves spam, fixes staff, preserves/restores voice settings', async () => {
    const { cleanServerLayout } = botRequire('systems/layoutCleanup.js');
    const channelsMap = new Map();
    let gipoweRenamed = null;
    let spamEdited = null;
    let testingRenamed = null;
    let createdChannels = [];

    const mockGuild = {
      id: 'CLEAN_LAYOUT_GUILD',
      members: {
        me: {
          permissions: { has: () => true }
        }
      },
      roles: {
        cache: new Map(),
        create: async () => ({ id: 'r_mock' }),
        setPositions: async () => true,
        everyone: { id: 'r_everyone' }
      },
      channels: {
        cache: channelsMap,
        fetch: async () => channelsMap,
        create: async (data) => {
          createdChannels.push(data.name);
          const ch = { id: 'c_new_' + data.name, ...data, lockPermissions: async () => {}, send: async () => {} };
          channelsMap.set(ch.id, ch);
          return ch;
        }
      }
    };

    // Add gipowe channel
    channelsMap.set('c_gipowe', {
      id: 'c_gipowe',
      name: '「🎁」gipowe',
      setName: async (n) => { gipoweRenamed = n; }
    });

    // Add main bot category
    channelsMap.set('cat_mainbot', {
      id: 'cat_mainbot',
      type: 4, // GuildCategory
      name: '🤖 ll ----- [MAIN BOT]'
    });

    // Add spam channel
    channelsMap.set('c_spam', {
      id: 'c_spam',
      name: '「❗」spam',
      edit: async (data) => { spamEdited = data; }
    });

    // Add staff testing-bot channel
    channelsMap.set('c_testing', {
      id: 'c_testing',
      name: 'testing-bot',
      setName: async (n) => { testingRenamed = n; }
    });

    // Add voice public category WITHOUT settings (should be restored)
    channelsMap.set('cat_voicepub', {
      id: 'cat_voicepub',
      type: 4,
      name: '🌐 ll ----- [VOICE PUBLIC]'
    });

    // Add gaming voice category WITHOUT settings (should be restored)
    channelsMap.set('cat_gamingvoice', {
      id: 'cat_gamingvoice',
      type: 4,
      name: '🎮 ll ---- [GAMING VOICE]'
    });

    // Seed GENDER menu in multi mode
    const sr = botRequire('systems/selfRoles.js');
    const mid = sr.createMenu('CLEAN_LAYOUT_GUILD', { title: 'GENDER', type: 'multi' });

    // Add invite-logs channel
    let invitePinned = false;
    channelsMap.set('c_invitelogs', {
      id: 'c_invitelogs',
      name: '「🤝」invite-logs',
      send: async () => ({ pin: async () => { invitePinned = true; } })
    });

    const res = await cleanServerLayout(mockGuild);
    if (!res.ok) throw new Error('cleanServerLayout failed: ' + res.error);
    if (gipoweRenamed !== '「🎁」giveaway') throw new Error('gipowe not renamed to giveaway');
    if (!spamEdited || spamEdited.name !== '「⚡」bot-spam' || spamEdited.parent !== 'cat_mainbot') throw new Error('spam not properly moved and renamed');
    if (testingRenamed !== '「🧪」bot-testing') throw new Error('testing-bot not formatted');
    if (!createdChannels.includes('「✨」settings')) throw new Error('missing voice public settings not restored');
    if (!createdChannels.includes('「🌸」settings')) throw new Error('missing gaming voice settings not restored');

    const gMenuAfter = sr.getMenu('CLEAN_LAYOUT_GUILD', mid);
    if (!gMenuAfter || gMenuAfter.type !== 'unique') throw new Error('gender menu not updated to unique');
    if (!invitePinned) throw new Error('invite milestone banner not pinned');
  });

  test('dailyRamalan: 365 dataset, getTodayRamalan, embed builder & auto-send check', async () => {
    const ramalan = botRequire('systems/dailyRamalan.js');
    const { RAMALAN_DATA } = botRequire('data/ramalan.js');

    if (RAMALAN_DATA.length !== 365) throw new Error(`expected 365 ramalan entries, got ${RAMALAN_DATA.length}`);

    // Check entry structure
    const sample = RAMALAN_DATA[0];
    if (!sample.id || !sample.title || !sample.forecast || !sample.advice || !sample.luckyNumber || !sample.luckyColor) {
      throw new Error('invalid ramalan entry structure');
    }

    const doy = ramalan.getDayOfYear(new Date());
    if (doy < 1 || doy > 365) throw new Error(`invalid day of year: ${doy}`);

    const todayR = ramalan.getTodayRamalan(new Date());
    if (!todayR || !todayR.title) throw new Error('failed to get today ramalan');

    const embed = ramalan.buildRamalanEmbed(todayR);
    if (!embed || !embed.data.title.includes('RAMALAN HARI INI')) {
      throw new Error('invalid ramalan embed generated');
    }

    // Mock client to test auto-send logic
    let sentMessage = null;
    const fakeClient = {
      guilds: {
        cache: new Map([
          ['G_RAMALAN', {
            id: 'G_RAMALAN',
            name: 'Ramalan Guild',
            members: { me: { permissions: { has: () => true } } },
            channels: {
              cache: new Map([
                ['C_CHAT', {
                  id: 'C_CHAT',
                  name: 'chat',
                  type: 0, // GuildText
                  permissionsFor: () => ({ has: () => true }),
                  send: async (payload) => { sentMessage = payload; return payload; }
                }]
              ])
            }
          }]
        ])
      }
    };

    // Clean previous date if any
    db.db.prepare("DELETE FROM server_settings WHERE guildId = 'G_RAMALAN' AND key LIKE 'ramalan_%'").run();

    await ramalan.checkAndSendDailyRamalan(fakeClient);
    // If running at >= 7 WIB, sentMessage will be populated
    const nowWib = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    if (nowWib.getHours() >= 7) {
      if (!sentMessage) throw new Error('expected daily ramalan to be sent during >= 7 WIB');
      const last = db.getSetting('G_RAMALAN', 'ramalan_last_date', null);
      if (!last) throw new Error('expected ramalan_last_date to be saved');
    }
  });

  test('activity: formatDisplayName formats PEKO 🔥226 - ⭐100 correctly', async () => {
    const { formatDisplayName, syncMemberNickname } = botRequire('systems/activity.js');
    const f1 = formatDisplayName('PEKO', 226, 100);
    if (f1 !== 'PEKO 🔥226 - ⭐100') throw new Error(`expected PEKO 🔥226 - ⭐100, got ${f1}`);

    const f2 = formatDisplayName('Rzkii 🔥 224 ❤️ 9', 224, 50);
    if (f2 !== 'Rzkii 🔥224 - ⭐50') throw new Error(`expected Rzkii 🔥224 - ⭐50, got ${f2}`);

    const f3 = formatDisplayName('SuperLongUsernameExceedingLimit12345', 226, 100);
    if (f3.length > 32) throw new Error(`nickname exceeded 32 chars: ${f3.length}`);
    if (!f3.endsWith('🔥226 - ⭐100')) throw new Error(`suffix missing: ${f3}`);

    const f4 = formatDisplayName('Newbie', 0, 5);
    if (f4 !== 'Newbie ⭐5') throw new Error(`expected Newbie ⭐5, got ${f4}`);

    let setNickCalled = null;
    const mockMember = {
      id: 'nick_user_1',
      guild: { id: 'G_NICK' },
      displayName: 'PEKO',
      manageable: true,
      setNickname: async (n) => { setNickCalled = n; }
    };
    db.getOrCreateUser('G_NICK', 'nick_user_1');
    db.db.prepare('INSERT OR REPLACE INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, ?, ?)').run('G_NICK', 'nick_user_1', 226, '2026-11-20');
    db.db.prepare('UPDATE users SET level = ? WHERE userId = ?').run(100, 'nick_user_1');

    await syncMemberNickname(mockMember);
    if (setNickCalled !== 'PEKO 🔥226 - ⭐100') throw new Error(`sync failed: ${setNickCalled}`);
  });
};
