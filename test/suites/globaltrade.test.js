// Global Trade (cross-server barter) tests: post, accept (money + item-for-item),
// cancel/escrow return, ownership conservation, and detector routing.
'use strict';
const { botRequire, test, assert } = require('../harness');

module.exports = function register() {
  const db = botRequire('database.js');
  const gt = botRequire('systems/globalTrade.js');
  const G = 'g1';
  const POSTER = '500000000000000001';
  const ACCEPTER = '500000000000000002';
  db.getOrCreateUser(G, POSTER);
  db.getOrCreateUser(G, ACCEPTER);

  // Seed inventories. Give POSTER a relic to offer; ACCEPTER money + a Mythic pet.
  function freshRelic(userId, rarity) {
    db.db.prepare("INSERT INTO relics (guildId, userId, name, slot, rarity, stat_type, stat_value, refine_level, equipped_pet_id) VALUES (?,?,?,?,?,?,?,0,0)")
      .run(G, userId, 'TestRelic', 'weapon', rarity, 'atk', 40);
    return db.db.prepare('SELECT id FROM relics WHERE userId = ? ORDER BY id DESC LIMIT 1').get(userId).id;
  }
  function freshPet(userId, petId) {
    db.db.prepare("INSERT INTO pets (guildId, userId, petId, name, level, active, adoptedAt, hp, atk, def, spd, crit) VALUES (?,?,?,?,?,0,?,100,20,10,10,5)")
      .run(G, userId, petId, 'TP', 10, Date.now());
    return db.db.prepare('SELECT id FROM pets WHERE userId = ? ORDER BY id DESC LIMIT 1').get(userId).id;
  }

  // ---- detectors ----
  assert('gt: button detector', gt.isGlobalTradeButton('gt_main_1') === true);
  assert('gt: select detector (offer)', gt.isGlobalTradeSelect('gt_offer_1') === true);
  assert('gt: select detector (want)', gt.isGlobalTradeSelect('gt_want_relic_5_1') === true);
  assert('gt: button is not select', gt.isGlobalTradeButton('gt_offer_1') === false);

  // ---- POST a money-want trade (offer relic, want 10k) ----
  test('gt: post money-want trade escrows the relic', () => {
    const relicId = freshRelic(POSTER, 'Epic');
    const res = gt.createTrade(G, POSTER, 'Poster', 'relic', relicId, 'money_10k');
    if (!res.ok) throw new Error(res.error);
    const owner = db.db.prepare('SELECT userId FROM relics WHERE id = ?').get(relicId).userId;
    if (owner !== 'GLOBAL_TRADE') throw new Error('relic not escrowed, owner=' + owner);
    const row = db.db.prepare("SELECT * FROM global_trades WHERE posterId = ? AND status='active' ORDER BY id DESC LIMIT 1").get(POSTER);
    if (!row || row.wantType !== 'money' || row.wantAmount !== 10000) throw new Error('trade row wrong');
  });

  // ---- ACCEPT money-want: accepter pays, gets relic; poster gets money ----
  test('gt: accept money-want transfers item + money correctly (conservation)', () => {
    const relicId = freshRelic(POSTER, 'Legendary');
    db.db.prepare('UPDATE users SET balance = 0 WHERE userId = ?').run(POSTER);
    db.db.prepare('UPDATE users SET balance = 60000 WHERE userId = ?').run(ACCEPTER);
    const post = gt.createTrade(G, POSTER, 'Poster', 'relic', relicId, 'money_50k');
    if (!post.ok) throw new Error(post.error);
    const tradeId = db.db.prepare("SELECT id FROM global_trades WHERE posterId=? AND status='active' ORDER BY id DESC LIMIT 1").get(POSTER).id;

    const accBefore = db.getOrCreateUser(G, ACCEPTER).balance;
    const posBefore = db.getOrCreateUser(G, POSTER).balance;
    const res = gt.acceptTrade(G, ACCEPTER, tradeId, null);
    if (!res.ok) throw new Error(res.error);
    const accAfter = db.getOrCreateUser(G, ACCEPTER).balance;
    const posAfter = db.getOrCreateUser(G, POSTER).balance;
    // money conservation: accepter -50000, poster +50000 (no tax on trades)
    if (accBefore - accAfter !== 50000) throw new Error('accepter not debited 50k: ' + (accBefore - accAfter));
    if (posAfter - posBefore !== 50000) throw new Error('poster not credited 50k: ' + (posAfter - posBefore));
    // item goes to accepter
    const owner = db.db.prepare('SELECT userId FROM relics WHERE id = ?').get(relicId).userId;
    if (owner !== ACCEPTER) throw new Error('relic not delivered to accepter, owner=' + owner);
    // trade marked completed
    const st = db.db.prepare('SELECT status FROM global_trades WHERE id = ?').get(tradeId).status;
    if (st !== 'completed') throw new Error('trade not completed: ' + st);
  });

  test('gt: accept money-want fails when accepter cannot afford', () => {
    const relicId = freshRelic(POSTER, 'Epic');
    db.db.prepare('UPDATE users SET balance = 5000 WHERE userId = ?').run(ACCEPTER);
    gt.createTrade(G, POSTER, 'Poster', 'relic', relicId, 'money_100k');
    const tradeId = db.db.prepare("SELECT id FROM global_trades WHERE posterId=? AND status='active' ORDER BY id DESC LIMIT 1").get(POSTER).id;
    const res = gt.acceptTrade(G, ACCEPTER, tradeId, null);
    if (res.ok) throw new Error('should have failed (insufficient funds)');
    // item must still be escrowed (not lost)
    const owner = db.db.prepare('SELECT userId FROM relics WHERE id = ?').get(relicId).userId;
    if (owner !== 'GLOBAL_TRADE') throw new Error('relic should remain escrowed, owner=' + owner);
    gt.cancelTrade(POSTER, tradeId); // cleanup
  });

  // ---- ITEM-FOR-ITEM: offer relic, want Mythic pet ----
  test('gt: item-for-item barter swaps both items, no duplication', () => {
    const offerRelic = freshRelic(POSTER, 'Epic');
    // ACCEPTER owns a Mythic pet (cerberus is Mythic in PET_DATA)
    const givePet = freshPet(ACCEPTER, 'cerberus');
    const post = gt.createTrade(G, POSTER, 'Poster', 'relic', offerRelic, 'pet_mythic');
    if (!post.ok) throw new Error(post.error);
    const tradeId = db.db.prepare("SELECT id FROM global_trades WHERE posterId=? AND status='active' ORDER BY id DESC LIMIT 1").get(POSTER).id;

    const res = gt.acceptTrade(G, ACCEPTER, tradeId, String(givePet));
    if (!res.ok) throw new Error(res.error);
    // offered relic -> accepter; wanted pet -> poster
    const relicOwner = db.db.prepare('SELECT userId FROM relics WHERE id = ?').get(offerRelic).userId;
    const petOwner = db.db.prepare('SELECT userId FROM pets WHERE id = ?').get(givePet).userId;
    if (relicOwner !== ACCEPTER) throw new Error('relic not delivered to accepter');
    if (petOwner !== POSTER) throw new Error('pet not delivered to poster');
    // No GLOBAL_TRADE escrow left for these
    const escRelic = db.db.prepare("SELECT COUNT(*) c FROM relics WHERE userId='GLOBAL_TRADE' AND id = ?").get(offerRelic).c;
    if (escRelic !== 0) throw new Error('relic still escrowed');
  });

  test('gt: item-for-item rejects a non-matching give item (wrong tier)', () => {
    const offerRelic = freshRelic(POSTER, 'Epic');
    const commonPet = freshPet(ACCEPTER, 'cat'); // Common, not Mythic
    gt.createTrade(G, POSTER, 'Poster', 'relic', offerRelic, 'pet_mythic');
    const tradeId = db.db.prepare("SELECT id FROM global_trades WHERE posterId=? AND status='active' ORDER BY id DESC LIMIT 1").get(POSTER).id;
    const res = gt.acceptTrade(G, ACCEPTER, tradeId, String(commonPet));
    if (res.ok) throw new Error('should reject non-matching tier');
    gt.cancelTrade(POSTER, tradeId); // cleanup (returns relic)
  });

  // ---- CANCEL returns escrow ----
  test('gt: cancel returns escrowed item to poster', () => {
    const relicId = freshRelic(POSTER, 'Rare');
    gt.createTrade(G, POSTER, 'Poster', 'relic', relicId, 'money_10k');
    const tradeId = db.db.prepare("SELECT id FROM global_trades WHERE posterId=? AND status='active' ORDER BY id DESC LIMIT 1").get(POSTER).id;
    const res = gt.cancelTrade(POSTER, tradeId);
    if (!res.ok) throw new Error(res.error);
    const owner = db.db.prepare('SELECT userId FROM relics WHERE id = ?').get(relicId).userId;
    if (owner !== POSTER) throw new Error('relic not returned, owner=' + owner);
  });

  test('gt: cannot accept own trade', () => {
    const relicId = freshRelic(POSTER, 'Rare');
    gt.createTrade(G, POSTER, 'Poster', 'relic', relicId, 'money_10k');
    const tradeId = db.db.prepare("SELECT id FROM global_trades WHERE posterId=? AND status='active' ORDER BY id DESC LIMIT 1").get(POSTER).id;
    const res = gt.acceptTrade(G, POSTER, tradeId, null);
    if (res.ok) throw new Error('should not accept own trade');
    gt.cancelTrade(POSTER, tradeId);
  });

  // ---- MAX_TRADES enforced ----
  test('gt: enforces max active trades per user', () => {
    // cleanup existing
    db.db.prepare("UPDATE global_trades SET status='cancelled' WHERE posterId=? AND status='active'").run(POSTER);
    // return any escrow by cancel already; now post 3 fresh
    for (let i = 0; i < 3; i++) {
      const rid = freshRelic(POSTER, 'Rare');
      const r = gt.createTrade(G, POSTER, 'Poster', 'relic', rid, 'money_10k');
      if (!r.ok) throw new Error('post ' + i + ' failed: ' + r.error);
    }
    const rid = freshRelic(POSTER, 'Rare');
    const over = gt.createTrade(G, POSTER, 'Poster', 'relic', rid, 'money_10k');
    if (over.ok) throw new Error('4th trade should be rejected by MAX_TRADES');
  });

  // ---- panels build ----
  test('gt: panels build without crash', () => {
    if (!gt.buildGlobalTradePanel(G, POSTER, 'Poster').embeds[0].data.title) throw new Error('main panel');
    if (!gt.buildTradeBrowse(G, ACCEPTER, 0).embeds[0].data.title) throw new Error('browse');
    if (!gt.buildPostOfferMenu(G, ACCEPTER).embeds[0].data.title) throw new Error('post offer');
    if (!gt.buildMyTrades(POSTER).embeds[0].data.title) throw new Error('my trades');
  });
};
