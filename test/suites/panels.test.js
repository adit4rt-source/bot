// Smoke tests: every main panel build function + key sub-view handlers must run
// without throwing and produce a titled embed / acknowledge the interaction.
'use strict';
const { botRequire, test, assert, mockInteraction } = require('../harness');

module.exports = function register() {
  const db = botRequire('database.js');
  const G = 'g1', U = '100000000000000001', NAME = 'Tester';
  db.getOrCreateUser(G, U);
  try { db.db.prepare('UPDATE users SET balance=123456, level=12, xp=340 WHERE userId=?').run(U); } catch (e) {}
  const stats = { total_fish_caught:87,total_harvests:40,total_crafts:12,dungeon_clears:9,boss_kills:3,pvp_wins:14,slot_wins:22,coinflip_wins:31,roulette_wins:7,total_earned:500000,total_buys:18,total_quests_done:25,total_dailies:19 };
  for (const [k,v] of Object.entries(stats)) { try { db.setUserStat(G,U,k,v); } catch(e){} }

  const panel = (name, fn) => test(name, () => {
    const out = fn();
    if (out && out.embeds) { const e = out.embeds[0]; if (!e || !e.data || !e.data.title) throw new Error('embed without title'); }
    return out;
  });

  const lvl = botRequire('systems/levelPanel.js');
  panel('levelPanel.buildLevelPanel', () => lvl.buildLevelPanel(G, U, NAME));
  const eco = botRequire('systems/economyPanel.js');
  panel('economyPanel.buildEconomyPanel', () => eco.buildEconomyPanel(G, U, NAME));
  const quest = botRequire('systems/questPanel.js');
  panel('questPanel.buildQuestPanel', () => quest.buildQuestPanel(G, U, NAME));
  const sp = botRequire('systems/statsPanel.js');
  panel('statsPanel.buildStatsPanel', () => sp.buildStatsPanel(G, U, NAME));
  const casino = botRequire('systems/casinoPanel.js');
  panel('casinoPanel.buildCasinoPanel', () => casino.buildCasinoPanel(G, U, NAME));
  const fish = botRequire('systems/fishPanel.js');
  panel('fishPanel.buildFishingPanel', () => fish.buildFishingPanel(G, U, NAME));
  const farm = botRequire('systems/farmPanel.js');
  panel('farmPanel.buildFarmPanel', () => farm.buildFarmPanel(G, U, NAME));
  const pet = botRequire('systems/petPanel.js');
  panel('petPanel.buildMainPanel', () => pet.buildMainPanel(G, U, NAME));
  const live = botRequire('systems/livestockPanel.js');
  panel('livestockPanel.buildCoopPanel', () => live.buildCoopPanel(U, NAME));
  panel('livestockPanel.buildBarnPanel', () => live.buildBarnPanel(U, NAME));
  const trade = botRequire('systems/tradePanel.js');
  panel('tradePanel.buildTradePanel', () => trade.buildTradePanel(G, U, NAME));
  const market = botRequire('systems/marketPanel.js');
  panel('marketPanel.buildMarketPanel', () => market.buildMarketPanel(G, U, NAME));
  const invite = botRequire('systems/invitePanel.js');
  panel('invitePanel.buildInvitePanel', () => invite.buildInvitePanel(G, U, NAME, { name: 'TestGuild' }));
  const tv = botRequire('systems/tempvoicePanel.js');
  panel('tempvoicePanel.buildTempvoicePanel', () => tv.buildTempvoicePanel(G, U, { name: 'TestGuild' }));
  const wel = botRequire('systems/welcomerPanel.js');
  panel('welcomerPanel.buildWelcomerPanel', () => wel.buildWelcomerPanel(G, U, { name: 'TestGuild' }));

  // Sub-view handlers via mock interaction (must acknowledge)
  const h = (name, mod, fn, customId) => test(name, () => {
    const it = mockInteraction({ userId: U, guildId: G, customId });
    return Promise.resolve(mod[fn](it)).then(() => {
      const c = it._cap;
      if (!c.update && !c.reply && !c.followUp && !c.modal && !c.editReply) throw new Error('did not acknowledge');
    });
  });
  h('stats:income', sp, 'handleStatsButton', `stats_income_${U}`);
  h('stats:activity', sp, 'handleStatsButton', `stats_activity_${U}`);
  h('stats:battle', sp, 'handleStatsButton', `stats_battle_${U}`);
  h('stats:gambling', sp, 'handleStatsButton', `stats_gambling_${U}`);
  h('quest:daily', quest, 'handleQuestButton', `quest_daily_${U}`);
  h('quest:weekly', quest, 'handleQuestButton', `quest_weekly_${U}`);
  h('level:rank', lvl, 'handleLevelButton', `lvlpnl_rank_${U}`);
  h('level:leaderboard', lvl, 'handleLevelButton', `lvlpnl_leaderboard_${U}`);
  h('level:rewards', lvl, 'handleLevelButton', `lvlpnl_rewards_${U}`);
  h('eco:balance', eco, 'handleEconomyButton', `ecopnl_balance_${U}`);
  h('eco:daily', eco, 'handleEconomyButton', `ecopnl_daily_${U}`);
  h('eco:leaderboard', eco, 'handleEconomyButton', `ecopnl_leaderboard_${U}`);
  h('eco:shop', eco, 'handleEconomyButton', `ecopnl_shop_${U}`);
  h('profile:achievement', botRequire('systems/profilePanel.js'), 'handleProfileButton', `profpnl_achievement_${U}`);
  h('profile:inventory', botRequire('systems/profilePanel.js'), 'handleProfileButton', `profpnl_inventory_${U}`);
  h('casino:coinflip', casino, 'handleCasinoButton', `casino_coinflip_${U}`);
  h('casino:slot', casino, 'handleCasinoButton', `casino_slot_${U}`);
};
