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

  // ---- UI helpers ----
  const ui = botRequire('systems/ui.js');
  test('ui: helpers produce expected output', () => {
    if (ui.progressLine(6,10).indexOf('60%') < 0) throw new Error('progressLine');
    if (ui.money(1000) !== '🪙 1.000') throw new Error('money: ' + ui.money(1000));
  });
};
