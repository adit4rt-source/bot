// Engagement features: escalating daily streak, tiered invite rewards, onboarding DM.
'use strict';
const { botRequire, test } = require('../harness');

module.exports = function register() {
  const D = botRequire('database.js');
  const dr = botRequire('systems/dailyReward.js');
  const ir = botRequire('systems/inviteRewards.js');
  const invitePanel = botRequire('systems/invitePanel.js');
  const ob = botRequire('systems/onboarding.js');
  const { mockInteraction } = require('../harness');

  // ============ DAILY: pure streak progression ============
  test('daily streak: first claim starts at 1', () => {
    const r = dr.computeDailyStreak(0, null, '2030-06-01', false);
    if (r.streak !== 1 || !r.reset) throw new Error('expected fresh streak 1');
  });
  test('daily streak: consecutive day increments', () => {
    const r = dr.computeDailyStreak(5, '2030-05-31', '2030-06-01', false);
    if (r.streak !== 6 || r.alreadyClaimed) throw new Error('expected 6, got ' + r.streak);
  });
  test('daily streak: same day = alreadyClaimed', () => {
    const r = dr.computeDailyStreak(5, '2030-06-01', '2030-06-01', false);
    if (!r.alreadyClaimed) throw new Error('should be alreadyClaimed');
  });
  test('daily streak: gap of 2 days resets without shield', () => {
    const r = dr.computeDailyStreak(5, '2030-05-30', '2030-06-01', false);
    if (r.streak !== 1 || !r.reset) throw new Error('should reset to 1');
  });
  test('daily streak: streak_shield forgives a single missed day', () => {
    const r = dr.computeDailyStreak(5, '2030-05-30', '2030-06-01', true);
    if (r.streak !== 6 || !r.shieldUsed) throw new Error('shield should save streak → 6');
  });

  // ============ DAILY: pure reward curve ============
  test('daily reward: day 1 pays the base 500', () => {
    const r = dr.computeDailyReward(1, {});
    if (r.money !== 500 || r.baseMoney !== 500) throw new Error('day1 should be 500, got ' + r.money);
  });
  test('daily reward: escalates +100/day', () => {
    const r = dr.computeDailyReward(10, {});
    if (r.money !== 1400) throw new Error('day10 base should be 1400, got ' + r.money);
  });
  test('daily reward: weekly bonus on day 7 (money + mystery box)', () => {
    const r = dr.computeDailyReward(7, {});
    if (!r.isWeeklyBonus) throw new Error('day7 should be weekly bonus');
    if (r.money !== 1100 + 1000) throw new Error('day7 money wrong: ' + r.money);
    if (!r.items.some(i => i.id === 'mystery_box')) throw new Error('weekly bonus should grant mystery_box');
  });
  test('daily reward: milestone day 30 jackpot + label', () => {
    const r = dr.computeDailyReward(30, {});
    if (!r.milestoneLabel) throw new Error('day30 should have a milestone label');
    if (r.money !== 3400 + 5000) throw new Error('day30 money wrong: ' + r.money);
  });
  test('daily reward: doubler doubles total money', () => {
    const r = dr.computeDailyReward(1, { hasDoubler: true });
    if (r.money !== 1000) throw new Error('doubler day1 should be 1000, got ' + r.money);
  });

  // ============ DAILY: full claim (DB, uses chat streak) ============
  test('daily claim: uses chat streak, sets lastDaily, credits balance', () => {
    const G = 'engG_daily', U = '910000000000000001';
    D.getOrCreateUser(G, U);
    D.db.prepare('UPDATE users SET lastDaily = ? WHERE userId = ?').run('2030-05-31', U);
    // Seed chat streak in the streaks table (same one used for 🔥 nickname)
    try { D.db.prepare('INSERT OR REPLACE INTO streaks (guildId, userId, count, last_date) VALUES (?, ?, 10, ?)').run(G, U, '2030-06-01'); } catch(_){}
    const before = D.getOrCreateUser(G, U).balance;
    const r = dr.claimDaily(G, U, { today: '2030-06-01' });
    if (r.alreadyClaimed) throw new Error('should not be alreadyClaimed');
    if (r.streak !== 10) throw new Error('streak should be 10 (from chat streak), got ' + r.streak);
    const after = D.getOrCreateUser(G, U);
    if (after.lastDaily !== '2030-06-01') throw new Error('lastDaily not updated');
    if (after.balance < before + 1400) throw new Error('balance should grow by >= base for streak 10 (1400)');
  });
  test('daily claim: blocks a second claim the same day', () => {
    const G = 'engG_daily2', U = '910000000000000002';
    D.getOrCreateUser(G, U);
    dr.claimDaily(G, U, { today: '2030-06-02' });
    const r2 = dr.claimDaily(G, U, { today: '2030-06-02' });
    if (!r2.alreadyClaimed) throw new Error('second same-day claim should be blocked');
  });

  // ============ INVITE REWARDS ============
  test('invite rewards: granting tier 1 credits money + item, once only', () => {
    const guild = { id: 'engG_inv1', members: { cache: new Map() }, roles: { cache: new Map() } };
    const U = '910000000000000010';
    D.getOrCreateUser(guild.id, U);
    const before = D.getOrCreateUser(guild.id, U).balance;
    const granted = ir.grantTierRewards(guild, U, 1);
    if (granted.length !== 1 || granted[0].invites !== 1) throw new Error('expected exactly tier 1');
    if (D.getOrCreateUser(guild.id, U).balance < before + 1000) throw new Error('tier1 money not credited');
    if (D.getItemCount(guild.id, U, 'mystery_box') < 1) throw new Error('tier1 item not granted');
    // Idempotent: re-running at the same count grants nothing.
    const again = ir.grantTierRewards(guild, U, 1);
    if (again.length !== 0) throw new Error('tiers should not be granted twice');
  });
  test('invite rewards: jumping to 5 grants all unclaimed tiers up to 5', () => {
    const guild = { id: 'engG_inv2', members: { cache: new Map() }, roles: { cache: new Map() } };
    const U = '910000000000000011';
    D.getOrCreateUser(guild.id, U);
    const granted = ir.grantTierRewards(guild, U, 5);
    const reached = granted.map(t => t.invites).sort((a, b) => a - b);
    if (reached.join(',') !== '1,3,5') throw new Error('expected tiers 1,3,5 got ' + reached.join(','));
    if (!ir.getClaimedTiers(guild.id, U).includes(5)) throw new Error('tier 5 not recorded as claimed');
  });
  test('invite rewards: buildRewardEmbed includes the tier label', () => {
    const tier = ir.getTiers()[0];
    const embed = ir.buildRewardEmbed('123', tier, 1);
    if (!embed.data.title || !embed.data.title.includes(tier.label)) throw new Error('reward embed missing label');
  });

  // ============ INVITE PANEL: rewards view ============
  test('invite panel: rewards button renders a tier list', () => {
    const U = '910000000000000020';
    const it = mockInteraction({ userId: U, guildId: 'engG_invp', customId: `invpnl_rewards_${U}` });
    return Promise.resolve(invitePanel.handleInviteButton(it)).then(() => {
      const up = it._cap.update;
      if (!up || !up.embeds || !up.embeds[0]) throw new Error('no embed rendered');
      const desc = up.embeds[0].data.description || '';
      if (!/undangan/i.test(desc)) throw new Error('rewards view missing tier text');
    });
  });

  // ============ ONBOARDING ============
  test('onboarding: embed guides newcomers to /daily and /fish', () => {
    const embed = ob.buildOnboardingEmbed({ user: { username: 'Newbie' }, guild: { name: 'EngageGuild' } }, 'EngageGuild');
    const d = embed.data.description || '';
    if (!d.includes('/daily') || !d.includes('/fish')) throw new Error('onboarding should mention /daily and /fish');
    if (!/Selamat datang/i.test(embed.data.title || '')) throw new Error('missing welcome title');
  });
  test('onboarding: sends a DM when enabled (default)', () => {
    const sent = [];
    const member = { user: { username: 'Newbie', bot: false }, guild: { id: 'engG_ob1', name: 'EngageGuild' }, send: async (p) => { sent.push(p); } };
    return Promise.resolve(ob.handleOnboarding(member)).then((ok) => {
      if (!ok || sent.length !== 1 || !sent[0].embeds) throw new Error('expected one onboarding DM');
    });
  });
  test('onboarding: respects the disabled setting', () => {
    D.setSetting('engG_ob2', 'onboarding_enabled', '0');
    const sent = [];
    const member = { user: { username: 'Newbie', bot: false }, guild: { id: 'engG_ob2', name: 'EngageGuild' }, send: async (p) => { sent.push(p); } };
    return Promise.resolve(ob.handleOnboarding(member)).then((ok) => {
      if (ok || sent.length !== 0) throw new Error('disabled onboarding should not DM');
    });
  });
};
