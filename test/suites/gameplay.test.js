// Gameplay data + RNG balance: mutations, pet tiers/eggs, fish tiers, trade dropdown.
'use strict';
const { botRequire, test, assert, mockInteraction } = require('../harness');

module.exports = function register() {
  const db = botRequire('database.js');
  const G = 'g1', U = '300000000000000001';
  db.getOrCreateUser(G, U);

  // ---- Mutations ----
  const mut = botRequire('systems/farmMutation.js');
  test('mutation: forced roll returns valid object', () => {
    const orig = Math.random;
    try {
      Math.random = () => 0;
      const m = mut.rollMutation(G, U, 0);
      if (!m || !m.id || typeof m.multiplier !== 'number') throw new Error('invalid mutation');
    } finally { Math.random = orig; }
  });
  test('mutation: no-mutation roll returns null', () => {
    const orig = Math.random;
    try {
      Math.random = () => 0.999;
      const m = mut.rollMutation(G, U, 0);
      if (m !== null) throw new Error('expected null');
    } finally { Math.random = orig; }
  });
  test('mutation: base rate ~2% (1.2-2.8% over 300k)', () => {
    const orig = Math.random;
    try {
      let hits = 0; const N = 300000;
      for (let i=0;i<N;i++) if (mut.rollMutation(G, U, 0)) hits++;
      const pct = hits/N*100;
      if (pct < 1.2 || pct > 2.8) throw new Error('rate out of range: ' + pct.toFixed(2) + '%');
    } finally { Math.random = orig; }
  });
  test('mutation: yield is positive integer', () => {
    const y = mut.calculateHarvestYield({ minYield:2, maxYield:4, sellPrice:12 }, { fertYieldBonus:0.5, seedLevel:2, rotationBonus:0.1, petFarmBonus:20 });
    if (!Number.isInteger(y) || y < 1) throw new Error('bad yield: ' + y);
  });

  // ---- Pet tiers / eggs ----
  const { PET_DATA, PET_EGGS } = botRequire('data/pets.js');
  const pets = botRequire('systems/pets.js');
  assert('pets: Secret tier has >=3 pets', PET_DATA.filter(p=>p.tier==='Secret').length >= 3);
  assert('pets: GOD tier has >=3 pets', PET_DATA.filter(p=>p.tier==='God').length >= 3);
  test('pets: Secret/GOD generate strong stats', () => {
    const s = pets.generatePetStats('Secret'), g = pets.generatePetStats('God'), m = pets.generatePetStats('Mythic');
    if (!(s.hp>0 && g.hp>0)) throw new Error('zero stats');
    if (!(g.hp >= 400 && m.hp <= 300)) throw new Error('GOD not stronger than Mythic');
  });
  test('pets: every egg rate sums ~100 and tiers have pets', () => {
    for (const egg of PET_EGGS) {
      const sum = Object.values(egg.rates).reduce((a,b)=>a+b,0);
      if (sum < 99 || sum > 101) throw new Error(`${egg.id} sums ${sum}`);
      for (const t of Object.keys(egg.rates)) if (!PET_DATA.some(p=>p.tier===t)) throw new Error(`${egg.id} tier ${t} has no pets`);
    }
  });
  test('pets: 30k Celestial Egg opens never produce undefined; GOD <2%', () => {
    const egg = PET_EGGS.find(e=>e.id==='celestial_egg');
    if (!egg) throw new Error('no celestial_egg');
    let god=0;
    for (let i=0;i<30000;i++){
      let roll=Math.random()*100, cum=0, sel=Object.keys(egg.rates)[0];
      for (const [t,r] of Object.entries(egg.rates)){ cum+=r; if(roll<=cum){sel=t;break;} }
      let tp = PET_DATA.filter(p=>p.tier===sel); if(!tp.length) tp = PET_DATA.filter(p=>p.tier===Object.keys(egg.rates)[0]);
      const won = tp[Math.floor(Math.random()*tp.length)];
      if (!won) throw new Error('undefined pet at tier ' + sel);
      if (sel==='God') god++;
    }
    if (god/30000 >= 0.02) throw new Error('GOD too common: ' + (god/30000*100).toFixed(2) + '%');
  });

  // ---- Fish tiers ----
  const { FISH_DATA, FISH_TIERS, FISHING_LOCATIONS } = botRequire('data/fish.js');
  const fishing = botRequire('systems/fishing.js');
  assert('fish: FISH_TIERS includes Secret & God', FISH_TIERS.some(t=>t.tier==='Secret') && FISH_TIERS.some(t=>t.tier==='God'));
  assert('fish: Secret fish exist', FISH_DATA.filter(f=>f.tier==='Secret').length >= 5);
  assert('fish: God fish exist', FISH_DATA.filter(f=>f.tier==='God').length >= 5);
  test('fish: no location/tier gaps', () => {
    const gaps = [];
    for (const loc of FISHING_LOCATIONS) for (const t of loc.tiers)
      if (!FISH_DATA.some(f=>f.location===loc.id && f.tier===t)) gaps.push(`${loc.id}:${t}`);
    if (gaps.length) throw new Error('gaps: ' + gaps.join(', '));
  });
  test('fish: God catchable but rare (<5%) at god_realm max gear; none at river basic', () => {
    db.getOrCreateUser(G, U);
    db.db.prepare("INSERT INTO fish_equipment (userId, rod, bait, bait_count, location) VALUES (?, 'omega_rod', 'god_lure', 1000000, 'god_realm') ON CONFLICT(userId) DO UPDATE SET rod='omega_rod', bait='god_lure', bait_count=1000000, location='god_realm'").run(U);
    let god=0, secret=0; const N=40000;
    for (let i=0;i<N;i++){ const r=fishing.catchFish(G,U); if(r.tier.tier==='God')god++; if(r.tier.tier==='Secret')secret++; }
    if (god===0) throw new Error('God never caught with max gear');
    if (god/N >= 0.05) throw new Error('God too common: ' + (god/N*100).toFixed(2) + '%');
    db.db.prepare("UPDATE fish_equipment SET rod='basic', bait='none', bait_count=0, location='river' WHERE userId=?").run(U);
    let bad=0; for (let i=0;i<10000;i++){ const r=fishing.catchFish(G,U); if(r.tier.tier==='God'||r.tier.tier==='Secret')bad++; }
    if (bad>0) throw new Error('Secret/God caught at river basic: ' + bad);
  });

  // ---- Trade dropdown flow ----
  const trade = botRequire('systems/tradePanel.js');
  assert('trade: targetpick routes to user-select', trade.isTradePanelUserSelect('trade_targetpick_x') === true);
  assert('trade: targetpick not a button', trade.isTradePanelButton('trade_targetpick_x') === false);
  assert('trade: targetpick not a string-select', trade.isTradePanelSelectMenu('trade_targetpick_x') === false);

  // ---- Cooldowns ----
  const cd = botRequire('systems/cooldowns.js');
  test('cooldowns: check sets then blocks', () => {
    const r1 = cd.check('t', G, U, 1000); if (!r1.ok) throw new Error('first should pass');
    const r2 = cd.check('t', G, U, 1000); if (r2.ok) throw new Error('second should block');
  });

  // ---- Seasonal leaderboard ----
  const season = botRequire('systems/season.js');
  test('season: leaderboard + info do not throw', () => { season.getSeasonalLeaderboard(10); season.getSeasonInfo(); });

  // ---- Pet collection achievements ----
  const ach = botRequire('systems/achievements.js');
  assert('ach: pet collection/tier achievements defined',
    ['pet_first','pet_collect_10','pet_collect_50','pet_legendary','pet_mythic','pet_secret','pet_god']
      .every(id => ach.ACHIEVEMENTS.some(a => a.id === id)));
  assert('ach: Completionist milestone matches total achievement count',
    ach.ACHIEVEMENT_MILESTONES.some(m => m.count === ach.ACHIEVEMENTS.length));
  test('ach: obtaining a Secret pet grants pet_secret + pet_first', () => {
    const U2 = '300000000000000009';
    db.getOrCreateUser(G, U2);
    db.db.prepare('DELETE FROM achievements WHERE userId = ?').run(U2);
    const guild = { id: G, name: 'G', members: { fetch: async()=>null, cache: new Map() }, channels: { cache: new Map() }, roles: { cache: new Map() } };
    return ach.checkAchievements(guild, U2, { type: 'pet_obtain', tier: 'Secret', distinctPets: 1 }).then(() => {
      if (!ach.hasAchievement(G, U2, 'pet_first')) throw new Error('pet_first not granted');
      if (!ach.hasAchievement(G, U2, 'pet_secret')) throw new Error('pet_secret not granted');
    });
  });
  test('ach: obtaining 50 distinct pets grants pet_collect_50', () => {
    const U3 = '300000000000000010';
    db.getOrCreateUser(G, U3);
    db.db.prepare('DELETE FROM achievements WHERE userId = ?').run(U3);
    const guild = { id: G, name: 'G', members: { fetch: async()=>null, cache: new Map() }, channels: { cache: new Map() }, roles: { cache: new Map() } };
    return ach.checkAchievements(guild, U3, { type: 'pet_obtain', tier: 'God', distinctPets: 50 }).then(() => {
      if (!ach.hasAchievement(G, U3, 'pet_collect_50')) throw new Error('pet_collect_50 not granted');
      if (!ach.hasAchievement(G, U3, 'pet_god')) throw new Error('pet_god not granted');
    });
  });

  // ---- Quest system (new types + progress wiring) ----
  const quests = botRequire('systems/quests.js');
  assert('quest: new quest types defined in pool',
    ['boss','gift','togel','expedition','refine','daily','worldboss']
      .every(t => quests.QUEST_POOL.some(q => q.type === t)));
  test('quest: every generated daily quest has desc + valid target/reward', () => {
    for (let i = 0; i < 50; i++) {
      const qs = quests.generateDailyQuests();
      if (qs.length !== 3) throw new Error('expected 3 daily quests');
      for (const q of qs) {
        if (typeof q.desc !== 'string' || !q.desc) throw new Error('quest missing desc: ' + q.type);
        if (!(q.target >= 1) || !(q.reward >= 1)) throw new Error('bad target/reward for ' + q.type);
      }
    }
  });
  test('quest: weekly quests generate with desc for new types too', () => {
    for (let i = 0; i < 50; i++) {
      const qs = quests.generateWeeklyQuests();
      for (const q of qs) { if (typeof q.desc !== 'string' || !q.desc) throw new Error('weekly quest missing desc: ' + q.type); }
    }
  });
  test('quest: updateQuestProgress advances a new-type (boss) daily quest', () => {
    const QU = '300000000000000044';
    db.getOrCreateUser(G, QU);
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const crafted = [{ type: 'boss', target: 2, reward: 500, progress: 0, claimed: false, difficulty: 'medium', desc: '👹 Kalahkan 2 boss' }];
    db.db.prepare('INSERT OR REPLACE INTO daily_quests (guildId, userId, date, data) VALUES (?, ?, ?, ?)').run(G, QU, today, JSON.stringify(crafted));
    quests.updateQuestProgress(G, QU, 'boss', 1);
    const row = db.db.prepare('SELECT data FROM daily_quests WHERE guildId = ? AND userId = ?').get(G, QU);
    const q = JSON.parse(row.data)[0];
    if (q.progress !== 1) throw new Error('boss quest progress not advanced: ' + q.progress);
  });

  // ---- Leveling formula (XP no longer stuck) ----
  test('level: XP threshold is (level+1)*100 and grants a level', () => {
    const LU = '300000000000000061';
    db.getOrCreateUser(G, LU);
    const setS = (k, v) => db.db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(G, k, v);
    setS('msg_xp_min', '1'); setS('msg_xp_max', '1'); setS('levelup_announce_enabled', '0');
    db.db.prepare('UPDATE users SET level = 0, xp = 99 WHERE guildId = ? AND userId = ?').run(G, LU);
    const member = { id: LU, user: { username: 'lvl' }, voice: {}, roles: { cache: new Map() }, guild: { id: G, members: { fetch: async () => null, cache: new Map() }, channels: { cache: new Map() }, roles: { cache: new Map() }, systemChannel: null } };
    return Promise.resolve(quests.addXpAndMoney(member, 'message')).then(() => {
      const u = db.getOrCreateUser(G, LU);
      if (u.level !== 1) throw new Error('expected level 1, got ' + u.level);
      if (u.xp !== 0) throw new Error('expected xp 0 after exact level up, got ' + u.xp);
    });
  });
  test('level: over-accumulated XP catches up across multiple levels (unstuck)', () => {
    const LU = '300000000000000062';
    db.getOrCreateUser(G, LU);
    const setS = (k, v) => db.db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(G, k, v);
    setS('msg_xp_min', '1'); setS('msg_xp_max', '1'); setS('levelup_announce_enabled', '0');
    db.db.prepare('UPDATE users SET level = 12, xp = 2892 WHERE guildId = ? AND userId = ?').run(G, LU);
    const member = { id: LU, user: { username: 'lvl' }, voice: {}, roles: { cache: new Map() }, guild: { id: G, members: { fetch: async () => null, cache: new Map() }, channels: { cache: new Map() }, roles: { cache: new Map() }, systemChannel: null } };
    // 2892 + 1 = 2893 -> L13 (-1300 => 1593) -> L14 (-1400 => 193) -> stop (<1500)
    return Promise.resolve(quests.addXpAndMoney(member, 'message')).then(() => {
      const u = db.getOrCreateUser(G, LU);
      if (u.level !== 14) throw new Error('expected level 14 after catch-up, got ' + u.level);
      if (u.xp !== 193) throw new Error('expected leftover xp 193, got ' + u.xp);
    });
  });

  // ---- Farm tool (craftable gear) yield bonus ----
  const farming = botRequire('systems/farming.js');
  const farmMut = botRequire('systems/farmMutation.js');
  test('farm tool: yield bonus scales with level and boosts harvest', () => {
    const g = 'FT_G', u = 'FT_U';
    db.getOrCreateUser(g, u);
    db.db.prepare('DELETE FROM user_stats WHERE userId = ?').run(u);
    if (farming.getFarmToolYieldBonus(g, u) !== 0) throw new Error('level 0 should give 0 bonus');
    db.setUserStat(g, u, 'farm_tool_level', 3);
    const b = farming.getFarmToolYieldBonus(g, u);
    if (Math.abs(b - 0.24) > 1e-9) throw new Error('level 3 should be +0.24 (0.08*3), got ' + b);
    const crop = { minYield: 2, maxYield: 2, time: 1 };
    const y = farmMut.calculateHarvestYield(crop, { toolBonus: 1.0 }); // base 2 * (1+1.0) = 4
    if (y !== 4) throw new Error('expected yield 4 with +100% tool bonus, got ' + y);
  });
  test('farm yield: additive bonuses are capped at +100% (weather stays separate)', () => {
    const crop = { minYield: 2, maxYield: 2, time: 1 };
    // bonusSum = fert 0.5 + seedLevel3 (1.0) = 1.5 -> capped to 1.0 -> base 2 * (1+1.0) = 4 (NOT 5)
    const y = farmMut.calculateHarvestYield(crop, { fertYieldBonus: 0.5, seedLevel: 3 });
    if (y !== 4) throw new Error('expected capped yield 4 (bonusSum 1.5 -> 1.0), got ' + y);
    // weather multiplies OUTSIDE the cap: 4 * 1.5 = 6
    const yw = farmMut.calculateHarvestYield(crop, { fertYieldBonus: 0.5, seedLevel: 3, weatherYieldMult: 1.5 });
    if (yw !== 6) throw new Error('expected 6 with weather x1.5 applied outside cap, got ' + yw);
  });
  test('seed upgrade: seedLevel raises yield (0/+25%/+100%)', () => {
    const crop = { minYield: 4, maxYield: 4, time: 1 };
    if (farmMut.calculateHarvestYield(crop, { seedLevel: 0 }) !== 4) throw new Error('lvl0 should be 4');
    if (farmMut.calculateHarvestYield(crop, { seedLevel: 1 }) !== 5) throw new Error('lvl1 (+25%) should be 5');
    if (farmMut.calculateHarvestYield(crop, { seedLevel: 3 }) !== 8) throw new Error('lvl3 (+100%) should be 8');
  });
  test('prestige crop sells for its sellPrice (regression: used to sell for 🪙0)', () => {
    const { addStorage } = botRequire('systems/farming.js');
    const farm = botRequire('systems/farmPanel.js');
    const g = 'PFG', u = '300000000000000077';
    db.getOrCreateUser(g, u);
    db.db.prepare('UPDATE users SET balance = 0 WHERE guildId = ? AND userId = ?').run(g, u);
    addStorage(g, u, 'time_blossom', 2); // prestige crop, sellPrice 120000 each
    const it = mockInteraction({ userId: u, guildId: g, customId: `farm_sellall_${u}` });
    return Promise.resolve(farm.handleFarmButton(it)).then(() => {
      const bal = db.getOrCreateUser(g, u).balance;
      if (bal !== 240000) throw new Error('expected 240000 from 2x time_blossom, got ' + bal);
    });
  });

  // ---- Profile card image ----
  test('profile card: generates a PNG buffer', () => {
    const pc = botRequire('systems/profileCard.js');
    return pc.generateProfileCard({ username: 'Test 🔥', level: 5, xp: 120, xpNeeded: 600, balance: 99999, rankName: '🌟 Elite', badges: 10, streak: 7, rankPosition: 2 }).then(buf => {
      if (!Buffer.isBuffer(buf) || buf.length < 1000) throw new Error('expected a PNG buffer');
    });
  });

  // ---- Pet PvP ranked arena (ELO) ----
  const arena = botRequire('systems/arena.js');
  test('arena: rating defaults to 1000 and tiers map correctly', () => {
    if (arena.getRating('AR_G', 'AR_NEW') !== 1000) throw new Error('default rating should be 1000');
    if (arena.getTier(1000).name !== 'Bronze') throw new Error('1000 should be Bronze');
    if (arena.getTier(1900).name !== 'Master') throw new Error('1900 should be Master');
  });
  test('arena: a fight updates rating and W/L record', () => {
    const g = 'AR_G', a = 'AR_A', b = 'AR_B';
    db.getOrCreateUser(g, a); db.getOrCreateUser(g, b);
    db.db.prepare('DELETE FROM pets WHERE userId IN (?, ?)').run(a, b);
    const ins = db.db.prepare("INSERT INTO pets (guildId,userId,petId,name,level,active,hp,atk,def,spd,crit,element,skills) VALUES (?,?,?,?,?,1,?,?,?,?,?,?, '[]')");
    ins.run(g, a, 'p1', 'Alpha', 5, 120, 30, 10, 12, 5, 'fire');
    ins.run(g, b, 'p2', 'Beta', 5, 100, 25, 12, 10, 5, 'water');
    const before = arena.getArenaStats(g, a);
    const res = arena.doArenaFight(g, a);
    if (res.error) throw new Error('fight should run, got ' + res.error);
    const after = arena.getArenaStats(g, a);
    if ((after.wins + after.losses) !== (before.wins + before.losses) + 1) throw new Error('W/L should increment by 1');
    if (after.rating < 100) throw new Error('rating must respect floor');
    if (after.rating === before.rating) throw new Error('rating should change after a fight');
  });

  // ---- Auction house ----
  const auction = botRequire('systems/auction.js');
  test('auction: full lifecycle (list item, bid, outbid refund, settle)', () => {
    const g = 'AUC_G', seller = 'AUC_S', b1 = 'AUC_B1', b2 = 'AUC_B2';
    db.getOrCreateUser(g, seller); db.getOrCreateUser(g, b1); db.getOrCreateUser(g, b2);
    db.db.prepare('UPDATE users SET balance = 0 WHERE userId = ?').run(seller);
    db.db.prepare('UPDATE users SET balance = 100000 WHERE userId = ?').run(b1);
    db.db.prepare('UPDATE users SET balance = 100000 WHERE userId = ?').run(b2);
    db.addItem(g, seller, 'mystery_box', 1);
    const c = auction.createAuction(g, seller, 'Seller', 'item', 'mystery_box', 1000, 6);
    if (!c.ok) throw new Error('create failed: ' + c.error);
    if (db.getItemCount(g, seller, 'mystery_box') !== 0) throw new Error('item should be escrowed');
    const r1 = auction.placeBid(g, c.id, b1, 1000);
    if (!r1.ok) throw new Error('bid1 failed: ' + r1.error);
    if (db.getOrCreateUser(g, b1).balance !== 99000) throw new Error('b1 should be debited 1000');
    const r2 = auction.placeBid(g, c.id, b2, 1500);
    if (!r2.ok) throw new Error('bid2 failed: ' + r2.error);
    if (db.getOrCreateUser(g, b1).balance !== 100000) throw new Error('b1 should be refunded on outbid');
    if (db.getOrCreateUser(g, b2).balance !== 98500) throw new Error('b2 should be debited 1500');
    const s = auction.settleAuction(c.id);
    if (!s.ok || !s.sold) throw new Error('settle should sell');
    if (db.getItemCount(g, b2, 'mystery_box') !== 1) throw new Error('winner should receive item');
    if (db.getOrCreateUser(g, seller).balance !== 1500) throw new Error('seller should receive gold');
  });
  test('auction: cancel with no bids returns the item', () => {
    const g = 'AUC_G2', seller = 'AUC_S2';
    db.getOrCreateUser(g, seller);
    db.addItem(g, seller, 'lucky_charm', 1);
    const c = auction.createAuction(g, seller, 'S', 'item', 'lucky_charm', 500, 6);
    if (!c.ok) throw new Error('create failed: ' + c.error);
    if (db.getItemCount(g, seller, 'lucky_charm') !== 0) throw new Error('item should be escrowed');
    const x = auction.cancelAuction(c.id, seller);
    if (!x.ok) throw new Error('cancel failed: ' + x.error);
    if (db.getItemCount(g, seller, 'lucky_charm') !== 1) throw new Error('item should be returned');
  });

  // ---- Rank score rebalance (Option A: prestige) ----
  const titles = botRequire('systems/titles.js');
  test('rank score: money is capped so wealth alone cannot reach Immortal', () => {
    const g = 'RANK_G', u = 'RANK_WHALE';
    db.getOrCreateUser(g, u);
    db.db.prepare('UPDATE users SET level = 1, balance = 1000000000 WHERE userId = ?').run(u);
    db.db.prepare('DELETE FROM user_stats WHERE userId = ?').run(u);
    db.db.prepare('DELETE FROM achievements WHERE userId = ?').run(u);
    const score = titles.calculateOverallScore(g, u);
    if (score !== 25150) throw new Error('expected capped score 25150 (150 lvl + 25000 money cap), got ' + score);
    if (titles.getUserTitle(g, u).id === 'immortal') throw new Error('a pure whale must NOT be Immortal anymore');
  });
  test('rank score: comprehensive formula covers all major systems', () => {
    // Each new component must contribute its documented weight.
    const r = titles.computeScore({ worldBossKills: 1, godFish: 1, awakenings: 1, secretLocs: 1, expeditions: 1, trades: 1, weeklyQuests: 1 });
    // worldBossKills100 + expeditions10 (Battle/Pet Mastery) ... assert a few key high-prestige weights:
    if (r.breakdown['Battle'] !== 100) throw new Error('worldBossKills should add 100 to Battle, got ' + r.breakdown['Battle']);
    if (r.breakdown['Fishing'] !== 350) throw new Error('godFish(150)+secretLocs(200)=350 Fishing, got ' + r.breakdown['Fishing']);
    if (r.breakdown['Pet Mastery'] !== 70) throw new Error('expeditions(10)+awakenings(60)=70, got ' + r.breakdown['Pet Mastery']);
    if (r.breakdown['Quest'] !== 40) throw new Error('weeklyQuests=40, got ' + r.breakdown['Quest']);
    if (r.breakdown['Sosial'] !== 20) throw new Error('trades=20, got ' + r.breakdown['Sosial']);
  });
  test('rank score: afk/spam stats are down-weighted and capped', () => {
    const r = titles.computeScore({ chats: 999999, reactions: 999999, voice: 999999 });
    // caps: chats 2000 + reactions 500 + voice 5000 = 7500
    if (r.breakdown['Sosial'] !== 7500) throw new Error('afk/spam should cap at 7500, got ' + r.breakdown['Sosial']);
  });

  // ---- UI helpers ----
  const ui = botRequire('systems/ui.js');
  test('ui: helpers produce expected output', () => {
    if (ui.progressLine(6,10).indexOf('60%') < 0) throw new Error('progressLine');
    if (ui.money(1000) !== '🪙 1.000') throw new Error('money: ' + ui.money(1000));
  });
};
