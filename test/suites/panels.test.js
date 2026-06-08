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
  const arena = botRequire('systems/arena.js');
  panel('arena.buildArenaPanel', () => arena.buildArenaPanel(G, U, NAME));
  panel('arena.buildArenaLeaderboard', () => arena.buildArenaLeaderboard(G, U, NAME));
  const auction = botRequire('systems/auction.js');
  panel('auction.buildAuctionPanel', () => auction.buildAuctionPanel(G, U, NAME));
  panel('auction.buildBrowse', () => auction.buildBrowse(G, U, NAME));
  panel('auction.buildSellMenu', () => auction.buildSellMenu(G, U, NAME));
  panel('auction.buildMyListings', () => auction.buildMyListings(G, U, NAME));
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
  h('quest:reroll', quest, 'handleQuestButton', `quest_reroll_0_${U}`);
  h('arena:lb', arena, 'handleArenaButton', `arena_lb_${U}`);
  h('arena:fight', arena, 'handleArenaButton', `arena_fight_${U}`);
  h('auction:browse', auction, 'handleAuctionButton', `auc_browse_${U}`);
  h('auction:sell', auction, 'handleAuctionButton', `auc_sell_${U}`);
  h('auction:mine', auction, 'handleAuctionButton', `auc_mine_${U}`);
  const farm2 = botRequire('systems/farmPanel.js');
  h('farm:tool', farm2, 'handleFarmButton', `farm_tool_${U}`);
  h('level:rank', lvl, 'handleLevelButton', `lvlpnl_rank_${U}`);
  h('level:leaderboard', lvl, 'handleLevelButton', `lvlpnl_leaderboard_${U}`);
  h('level:rewards', lvl, 'handleLevelButton', `lvlpnl_rewards_${U}`);
  h('eco:balance', eco, 'handleEconomyButton', `ecopnl_balance_${U}`);
  h('eco:daily', eco, 'handleEconomyButton', `ecopnl_daily_${U}`);
  h('eco:leaderboard', eco, 'handleEconomyButton', `ecopnl_leaderboard_${U}`);
  h('eco:shop', eco, 'handleEconomyButton', `ecopnl_shop_${U}`);
  h('profile:achievement', botRequire('systems/profilePanel.js'), 'handleProfileButton', `profpnl_achievement_${U}`);
  h('profile:card', botRequire('systems/profilePanel.js'), 'handleProfileButton', `profpnl_card_${U}`);
  h('profile:inventory', botRequire('systems/profilePanel.js'), 'handleProfileButton', `profpnl_inventory_${U}`);
  h('casino:coinflip', casino, 'handleCasinoButton', `casino_coinflip_${U}`);
  h('casino:slot', casino, 'handleCasinoButton', `casino_slot_${U}`);

  // ===== SELF ROLES =====
  const selfRoles = botRequire('systems/selfRoles.js');
  const srPanel = botRequire('systems/selfRolePanel.js');

  panel('selfRolePanel.buildAdminPanel', () => srPanel.buildAdminPanel(G, U, { name: 'TestGuild' }));

  test('selfrole: create menu + add option + public message', () => {
    const menuId = selfRoles.createMenu(G, { title: 'Notif Roles', description: 'pilih', type: 'multi' });
    const add = selfRoles.addOption(menuId, { roleId: 'role_news', label: 'News', emoji: '📰', description: 'berita' });
    if (!add.ok) throw new Error('option not added');
    const dup = selfRoles.addOption(menuId, { roleId: 'role_news' });
    if (dup.ok) throw new Error('duplicate role should be rejected');
    const menu = selfRoles.getMenu(G, menuId);
    const msg = selfRoles.buildPublicMessage(menu, selfRoles.getOptions(menuId), { roles: { cache: new Map() } });
    if (!msg.embeds[0].data.title) throw new Error('public message missing title');
    if (!msg.components.length) throw new Error('public message missing select component');
    if (msg.components[0].components[0].data.custom_id !== `srpick_${menuId}`) throw new Error('wrong select customId');
  });

  test('selfrole: normalizeEmoji rejects multi-grapheme, keeps single + custom', () => {
    if (selfRoles.normalizeEmoji('📰') !== '📰') throw new Error('single emoji should pass');
    if (selfRoles.normalizeEmoji('<:foo:123>') !== '<:foo:123>') throw new Error('custom emoji should pass');
    if (selfRoles.normalizeEmoji('ab') !== null) throw new Error('multi-char should be null');
  });

  test('selfrole: public pick toggles role (acknowledges)', () => {
    const menuId = selfRoles.createMenu(G, { title: 'Pick', type: 'multi' });
    selfRoles.addOption(menuId, { roleId: 'role_abc' });
    const it = mockInteraction({ userId: U, guildId: G, customId: `srpick_${menuId}`, values: ['role_abc'] });
    return Promise.resolve(selfRoles.handleSelfRolePick(it)).then(() => {
      if (!it._cap.reply) throw new Error('did not acknowledge');
    });
  });

  test('selfrole: create modal submit creates a menu (acknowledges)', () => {
    const it = mockInteraction({ userId: U, guildId: G, customId: `srmod_create_${U}`, fields: { sr_title: 'From Modal XYZ', sr_desc: '' } });
    it.isModalSubmit = () => true;
    return Promise.resolve(srPanel.handleSelfRoleModal(it)).then(() => {
      if (!it._cap.reply) throw new Error('did not acknowledge');
      if (!selfRoles.getMenus(G).some(m => m.title === 'From Modal XYZ')) throw new Error('menu not created');
    });
  });

  h('selfrole: addrole button shows role select', srPanel, 'handleSelfRoleButton', `sradm_addrole_1_${U}`);

  test('selfrole: maxRoles cap blocks extra roles (multi)', () => {
    const menuId = selfRoles.createMenu(G, { title: 'Capped', type: 'multi', maxRoles: 1 });
    selfRoles.addOption(menuId, { roleId: 'cap_a' });
    selfRoles.addOption(menuId, { roleId: 'cap_b' });
    const it = mockInteraction({ userId: U, guildId: G, customId: `srpick_${menuId}`, values: ['cap_a', 'cap_b'] });
    return Promise.resolve(selfRoles.handleSelfRolePick(it)).then(() => {
      const out = it._cap.reply;
      if (!out) throw new Error('did not acknowledge');
      const content = typeof out === 'string' ? out : out.content;
      if (!/Maksimal/i.test(content || '')) throw new Error('cap warning not shown');
    });
  });

  test('selfrole: edit modal updates title', () => {
    const menuId = selfRoles.createMenu(G, { title: 'Lama', type: 'multi' });
    const it = mockInteraction({ userId: U, guildId: G, customId: `srmod_edit_${menuId}_${U}`, fields: { sr_title: 'Judul Baru', sr_desc: 'ket' } });
    it.isModalSubmit = () => true;
    return Promise.resolve(srPanel.handleSelfRoleModal(it)).then(() => {
      if (selfRoles.getMenu(G, menuId).title !== 'Judul Baru') throw new Error('title not updated');
    });
  });

  test('selfrole: maxroles modal sets the cap', () => {
    const menuId = selfRoles.createMenu(G, { title: 'SetCap', type: 'multi' });
    const it = mockInteraction({ userId: U, guildId: G, customId: `srmod_max_${menuId}_${U}`, fields: { sr_max: '3' } });
    it.isModalSubmit = () => true;
    return Promise.resolve(srPanel.handleSelfRoleModal(it)).then(() => {
      if (selfRoles.getMenu(G, menuId).maxRoles !== 3) throw new Error('maxRoles not set');
    });
  });

  test('selfrole: color select changes embed color', () => {
    const menuId = selfRoles.createMenu(G, { title: 'Warna', type: 'multi' });
    const it = mockInteraction({ userId: U, guildId: G, customId: `srsel_color_${menuId}_${U}`, values: ['#57F287'] });
    return Promise.resolve(srPanel.handleSelfRoleSelect(it)).then(() => {
      if (selfRoles.getMenu(G, menuId).color !== '#57F287') throw new Error('color not updated');
    });
  });

  // ===== GIVEAWAY =====
  const giveaway = botRequire('systems/giveaway.js');
  const gwPanel = botRequire('systems/giveawayPanel.js');

  panel('giveawayPanel.buildAdminPanel', () => gwPanel.buildAdminPanel(G, U, { name: 'TestGuild' }));

  test('giveaway: parseDuration handles units + bare minutes', () => {
    if (giveaway.parseDuration('2h') !== 7200000) throw new Error('2h wrong');
    if (giveaway.parseDuration('30m') !== 1800000) throw new Error('30m wrong');
    if (giveaway.parseDuration('1d') !== 86400000) throw new Error('1d wrong');
    if (giveaway.parseDuration('5') !== 300000) throw new Error('bare minutes wrong');
    if (giveaway.parseDuration('xyz') !== null) throw new Error('invalid should be null');
  });

  test('giveaway: pickWinners returns N and respects exclude', () => {
    const w = giveaway.pickWinners(['a', 'b', 'c', 'd'], 2);
    if (w.length !== 2) throw new Error('should pick 2');
    const w2 = giveaway.pickWinners(['a', 'b'], 5, ['a']);
    if (w2.includes('a') || w2[0] !== 'b') throw new Error('exclude failed');
  });

  test('giveaway: create + join + public message', () => {
    const id = giveaway.createGiveaway(G, { prize: 'Nitro', winners: 1, hostId: U, durationMs: 60000 });
    giveaway.addEntry(id, 'a'); giveaway.addEntry(id, 'b'); giveaway.addEntry(id, 'a'); // dup ignored
    if (giveaway.countEntries(id) !== 2) throw new Error('entry count wrong');
    const msg = giveaway.buildGiveawayMessage(giveaway.getGiveaway(id), giveaway.countEntries(id));
    if (!msg.embeds[0].data.title) throw new Error('missing title');
    if (msg.components[0].components[0].data.custom_id !== `gwjoin_${id}`) throw new Error('wrong join button id');
  });

  test('giveaway: join button toggles entry (acknowledges)', () => {
    const id = giveaway.createGiveaway(G, { prize: 'Toggle', winners: 1, hostId: U, durationMs: 60000 });
    const it = mockInteraction({ userId: 'joiner1', guildId: G, customId: `gwjoin_${id}` });
    it.message = { edit: async () => {} };
    return Promise.resolve(giveaway.handleGiveawayJoin(it)).then(() => {
      if (!it._cap.reply) throw new Error('did not acknowledge');
      if (!giveaway.hasEntry(id, 'joiner1')) throw new Error('entry not added');
    });
  });

  test('giveaway: create modal creates a giveaway + asks channel', () => {
    const it = mockInteraction({ userId: U, guildId: G, customId: `gwmod_create_${U}`, fields: { gw_prize: 'ModalPrize', gw_duration: '1h', gw_winners: '2' } });
    it.isModalSubmit = () => true;
    return Promise.resolve(gwPanel.handleGiveawayModal(it)).then(() => {
      if (!it._cap.reply) throw new Error('did not acknowledge');
      if (!giveaway.getGuildGiveaways(G).some(g => g.prize === 'ModalPrize')) throw new Error('giveaway not created');
    });
  });

  test('giveaway: pickWeightedWinners unique + respects exclude', () => {
    const entries = [{ userId: 'a', weight: 5 }, { userId: 'b', weight: 1 }, { userId: 'c', weight: 1 }];
    const w = giveaway.pickWeightedWinners(entries, 2);
    if (w.length !== 2) throw new Error('should pick 2');
    if (new Set(w).size !== 2) throw new Error('winners must be unique');
    const w2 = giveaway.pickWeightedWinners(entries, 3, ['a']);
    if (w2.includes('a')) throw new Error('exclude failed');
  });

  test('giveaway: endGiveaway picks winners + marks ended', () => {
    const notif = botRequire('systems/notifications.js');
    notif.setDmConsent(G, 'wA', true); notif.setDmConsent(G, 'wB', true); // opt-in so winner DM is sent
    const id = giveaway.createGiveaway(G, { prize: 'End', winners: 1, hostId: U, durationMs: 1000 });
    giveaway.addEntry(id, 'wA'); giveaway.addEntry(id, 'wB');
    giveaway.updateGiveaway(id, { channelId: 'c1', messageId: 'm1' });
    const fakeMsg = { edit: async () => {}, url: 'https://discord.com/x' };
    const fakeChannel = { messages: { fetch: async () => fakeMsg }, send: async () => ({}) };
    let dmCount = 0;
    const client = {
      channels: { cache: new Map([['c1', fakeChannel]]) },
      users: { fetch: async () => ({ send: async () => { dmCount++; } }) },
    };
    return Promise.resolve(giveaway.endGiveaway(client, giveaway.getGiveaway(id))).then((winners) => {
      if (!winners.length) throw new Error('no winners picked');
      if (giveaway.getGiveaway(id).ended !== 1) throw new Error('not marked ended');
      if (dmCount !== winners.length) throw new Error('winners not DMed');
    });
  });

  // ===== AI ASSISTANT =====
  const aiA = botRequire('systems/aiAssistant.js');
  const aiPanel = botRequire('systems/aiBotPanel.js');

  test('ai: knowledge is built from repo docs (non-empty)', () => {
    const k = aiA.buildKnowledge(true);
    if (!k || k.length < 100) throw new Error('knowledge too small');
    if (!/command|fitur|fishing|GUIDE|pet/i.test(k)) throw new Error('knowledge missing expected content');
  });

  test('ai: askAI without API key returns a friendly error', () => {
    const savedA = process.env.AI_API_KEY, savedO = process.env.OPENAI_API_KEY;
    delete process.env.AI_API_KEY; delete process.env.OPENAI_API_KEY;
    return Promise.resolve(aiA.askAI('apa itu fishing?')).then((r) => {
      if (savedA !== undefined) process.env.AI_API_KEY = savedA;
      if (savedO !== undefined) process.env.OPENAI_API_KEY = savedO;
      if (!r.error || !/API key/i.test(r.error)) throw new Error('expected API key error');
    });
  });

  panel('aiBotPanel.buildPanel', () => aiPanel.buildPanel(G, U));

  test('ai: detectors match the right customIds', () => {
    if (!aiPanel.isAiBotButton(`aibot_toggle_${U}`)) throw new Error('button detector failed');
    if (!aiPanel.isAiBotChannelSelect(`aichan_set_${U}`)) throw new Error('channel detector failed');
    if (aiPanel.isAiBotButton('gwadm_x')) throw new Error('false positive');
  });

  test('ai: /tanya without key replies with config notice', () => {
    const savedA = process.env.AI_API_KEY; delete process.env.AI_API_KEY;
    const it = mockInteraction({ userId: U, guildId: G, customId: 'tanya' });
    it.options = { getString: () => 'gimana cara daily?' };
    return Promise.resolve(aiPanel.handleTanyaCommand(it)).then(() => {
      if (savedA !== undefined) process.env.AI_API_KEY = savedA;
      if (!it._cap.reply) throw new Error('did not acknowledge');
    });
  });

  test('ai: maybeHandleAiMessage is silent when disabled', () => {
    const msg = { guild: { id: G }, client: { user: { id: 'bot1' } }, mentions: { has: () => false }, channel: { id: 'cX' }, content: 'halo' };
    return Promise.resolve(aiA.maybeHandleAiMessage(msg)).then((handled) => {
      if (handled !== false) throw new Error('should not handle when disabled');
    });
  });
};
