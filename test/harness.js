// test/harness.js — shared test utilities.
// - Redirects 'discord.js' and 'better-sqlite3' requires to local mocks.
// - Loads the REAL bot modules so tests exercise real logic.
// - Provides a tiny assertion/suite framework and a mock interaction factory.
//
// IMPORTANT: tests must run from a temp working dir so the bot's
// `new Database('economy.sqlite')` creates a throwaway DB, never the real data.
'use strict';
const path = require('path');
const Module = require('module');

const MOCKS = path.join(__dirname, 'mocks');
const BOT_ROOT = path.join(__dirname, '..');

// Redirect external deps to our mocks.
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'discord.js') return path.join(MOCKS, 'discord.js');
  if (request === 'better-sqlite3') return path.join(MOCKS, 'better-sqlite3.js');
  if (request === '@napi-rs/canvas') return path.join(MOCKS, 'napi-canvas.js');
  if (request === 'express') return path.join(MOCKS, 'express.js');
  if (request === 'cors') return path.join(MOCKS, 'cors.js');
  return origResolve.call(this, request, parent, isMain, options);
};

function botRequire(rel) { return require(path.join(BOT_ROOT, rel)); }

// ---- assertion / suite framework ----
const _state = { results: [], pending: [] };
function test(name, fn) {
  try {
    const out = fn();
    if (out && typeof out.then === 'function') {
      _state.pending.push(out.then(
        () => _state.results.push({ name, ok: true }),
        (e) => _state.results.push({ name, ok: false, err: errStr(e) })
      ));
      return;
    }
    _state.results.push({ name, ok: true });
  } catch (e) {
    _state.results.push({ name, ok: false, err: errStr(e) });
  }
}
function assert(name, cond, extra) {
  _state.results.push({ name, ok: !!cond, err: cond ? '' : ('assertion failed' + (extra ? ' → ' + extra : '')) });
}
function errStr(e) { return e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e); }

async function finish(suiteName) {
  await Promise.all(_state.pending);
  const results = _state.results;
  const pass = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok);
  console.log(`\n===== ${suiteName} =====`);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '\n        → ' + r.err}`);
  console.log(`\n${pass}/${results.length} passed, ${fail.length} failed`);
  return { pass, total: results.length, fail: fail.length };
}

// ---- mock interaction ----
function mockInteraction(opts = {}) {
  const cap = {};
  const member = {
    id: opts.userId || 'u1',
    user: { id: opts.userId || 'u1', username: opts.username || 'Tester', bot: false },
    permissions: { has: () => opts.admin !== false },
    nickname: null,
    roles: { cache: new Map(), add: async()=>{}, remove: async()=>{} },
    displayAvatarURL: () => '',
    voice: { channel: null },
  };
  const it = {
    customId: opts.customId,
    values: opts.values,
    user: member.user,
    member,
    guild: {
      id: opts.guildId || 'g1',
      name: 'TestGuild',
      members: { cache: new Map(), fetch: async (q) => (typeof q === 'object' ? new Map() : member) },
      channels: { cache: new Map() },
      roles: { cache: new Map(), create: async () => ({ id: 'role1' }) },
    },
    client: {
      user: {
        displayAvatarURL: () => ''
      }
    },
    channelId: 'chan1',
    channel: {
      send: async (p) => { cap.channelSend = p; return p; }
    },
    message: { edit: async (p) => { cap.messageEdit = p; return p; }, delete: async () => {} },
    fields: { getTextInputValue: (k) => (opts.fields && opts.fields[k]) || '' },
    replied: false, deferred: false,
    showModal: async (m) => { cap.modal = m; return m; },
    update: async (p) => { it.replied = true; cap.update = p; return p; },
    reply: async (p) => { it.replied = true; cap.reply = p; return Object.assign({ delete: async () => {}, edit: async () => {} }, p && typeof p === 'object' ? p : {}); },
    followUp: async (p) => { cap.followUp = p; return Object.assign({ delete: async () => {}, edit: async () => {} }, p && typeof p === 'object' ? p : {}); },
    deferReply: async () => { it.deferred = true; cap.deferred = true; },
    deferUpdate: async () => { it.deferred = true; cap.deferred = true; },
    editReply: async (p) => { cap.editReply = p; return p; },
    isButton: () => true, isAnySelectMenu: () => false, isUserSelectMenu: () => false,
    isStringSelectMenu: () => false, isModalSubmit: () => false,
    isChatInputCommand: () => false, isAutocomplete: () => false,
    _cap: cap,
  };
  return it;
}

module.exports = { botRequire, test, assert, finish, mockInteraction, _state };
