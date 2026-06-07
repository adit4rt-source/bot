// Economy correctness: gift flow (dropdown), money math, admin target resolver.
'use strict';
const { botRequire, test, assert, mockInteraction } = require('../harness');

module.exports = function register() {
  const db = botRequire('database.js');
  const eco = botRequire('systems/economyPanel.js');
  const G = 'g1', SENDER = '200000000000000001', TARGET = '200000000000000002';
  db.getOrCreateUser(G, SENDER); db.getOrCreateUser(G, TARGET);

  // helper interaction that can resolve target member
  function mk(opts) {
    const it = mockInteraction(opts);
    it.guild.members.fetch = async (id) => ({ id, user: { id, bot: false, username: 'U'+id } });
    return it;
  }

  test('gift: button shows user-select dropdown', () => {
    const it = mk({ userId: SENDER, guildId: G, customId: `ecopnl_gift_${SENDER}` });
    return Promise.resolve(eco.handleEconomyButton(it)).then(() => {
      const comps = (it._cap.update && it._cap.update.components) || [];
      const hasPicker = comps.some(r => (r.components||[]).some(c => c.data && c.data.custom_id === `ecopnl_giftpick_${SENDER}`));
      if (!hasPicker) throw new Error('no gift user-picker');
    });
  });

  test('gift: detectors route correctly', () => {
    if (eco.isEconomyPanelSelect(`ecopnl_giftpick_${SENDER}`) !== true) throw new Error('giftpick not a select');
    if (eco.isEconomyPanelButton(`ecopnl_giftpick_${SENDER}`) !== false) throw new Error('giftpick wrongly a button');
    if (eco.isEconomyPanelModal(`ecopnl_modal_giftamount_${TARGET}_${SENDER}`) !== true) throw new Error('giftamount not modal');
  });

  test('gift: pick recipient opens amount modal', () => {
    const it = mk({ userId: SENDER, guildId: G, customId: `ecopnl_giftpick_${SENDER}`, values: [TARGET] });
    return Promise.resolve(eco.handleEconomySelect(it)).then(() => {
      if (!it._cap.modal || it._cap.modal.data.custom_id !== `ecopnl_modal_giftamount_${TARGET}_${SENDER}`) throw new Error('no amount modal');
    });
  });

  test('gift: cannot send to self', () => {
    const it = mk({ userId: SENDER, guildId: G, customId: `ecopnl_giftpick_${SENDER}`, values: [SENDER] });
    return Promise.resolve(eco.handleEconomySelect(it)).then(() => {
      if (!it._cap.reply || !/diri sendiri/i.test(it._cap.reply.content)) throw new Error('self-gift not rejected');
    });
  });

  test('gift: money transfer (recipient +net after tax; sender debited)', () => {
    // Use a fresh isolated pair so other suites/tests can't perturb balances or
    // trigger tax-free vouchers / daily receive caps.
    const S2 = '200000000000000011', T2 = '200000000000000012';
    db.getOrCreateUser(G, S2); db.getOrCreateUser(G, T2);
    db.db.prepare('UPDATE users SET balance=50000 WHERE userId=?').run(S2);
    db.db.prepare('UPDATE users SET balance=0 WHERE userId=?').run(T2);
    try { db.db.prepare("DELETE FROM user_stats WHERE userId IN (?,?)").run(S2, T2); } catch(e){}
    try { db.db.prepare("DELETE FROM item_inventory WHERE userId=?").run(S2); } catch(e){}
    const it = mk({ userId: S2, guildId: G, customId: `ecopnl_modal_giftamount_${T2}_${S2}`, fields: { gift_amount: '1000' } });
    return Promise.resolve(eco.handleEconomyModal(it)).then(() => {
      const s = db.getOrCreateUser(G, S2).balance;
      const t = db.getOrCreateUser(G, T2).balance;
      // Recipient nets amount - 10% tax = 900, plus possible first-gift achievement
      // bonuses (+small). So 900 <= t <= 1100, and t must be at least 900.
      if (t < 900 || t > 1100) throw new Error('target balance out of range: ' + t);
      // Sender debited full 1000; first-time gift/balance achievements may add a
      // little back. So 49000 <= s <= 49600 (never more than starting balance).
      if (s > 49000 + 600 || s < 48500) throw new Error('sender balance out of range: ' + s);
      if (s >= 50000) throw new Error('sender was not debited at all: ' + s);
    });
  });

  // Admin flexible target resolver (mention / id / username) via streak modal
  const admin = botRequire('systems/adminPanel.js');
  function adminStreakModal(rawTarget) {
    const it = mockInteraction({ userId: 'admin1', guildId: G, customId: 'admpnl_modal_streak_set', admin: true,
      fields: { target_user_id: rawTarget, streak_amount: '5' } });
    const member = { id: TARGET, user: { id: TARGET, username: 'budi', globalName: 'Budi', bot: false }, nickname: null };
    const knownNames = ['budi'];
    it.guild.members.cache = { find: (fn) => [member].find(fn) };
    it.guild.members.fetch = async (opt) => {
      // Username query: only return a match if the query actually matches a known member.
      if (opt && opt.query) {
        const q = String(opt.query).toLowerCase();
        const m = new Map();
        if (knownNames.includes(q)) m.set(TARGET, member);
        m.first = () => (m.size ? member : undefined);
        m.find = (fn) => [...m.values()].find(fn);
        return m;
      }
      // Direct id fetch: only succeed for the known id.
      if (opt === TARGET) return member;
      throw new Error('Unknown Member');
    };
    return it;
  }
  test('admin: resolve target by mention', () => {
    db.db.prepare('DELETE FROM streaks WHERE userId=?').run(TARGET);
    const it = adminStreakModal(`<@${TARGET}>`);
    return Promise.resolve(admin.handleAdminModal(it)).then(() => {
      const row = db.db.prepare('SELECT * FROM streaks WHERE userId=?').get(TARGET);
      if (!row || row.count !== 5) throw new Error('mention not resolved');
    });
  });
  test('admin: resolve target by username', () => {
    db.db.prepare('DELETE FROM streaks WHERE userId=?').run(TARGET);
    const it = adminStreakModal('budi');
    return Promise.resolve(admin.handleAdminModal(it)).then(() => {
      const row = db.db.prepare('SELECT * FROM streaks WHERE userId=?').get(TARGET);
      if (!row || row.count !== 5) throw new Error('username not resolved');
    });
  });
  test('admin: unknown target rejected', () => {
    const it = adminStreakModal('orang_ga_ada_xyz');
    return Promise.resolve(admin.handleAdminModal(it)).then(() => {
      if (!it._cap.reply || !/tidak ketemu/i.test(it._cap.reply.content)) throw new Error('unknown not rejected');
    });
  });
};
