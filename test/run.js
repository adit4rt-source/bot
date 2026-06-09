#!/usr/bin/env node
// test/run.js — runs all test suites with mocked discord.js / better-sqlite3.
// Run via: npm test   (package.json sets --experimental-sqlite)
//
// Tests run in a throwaway temp working directory so the bot's
// `new Database('economy.sqlite')` never touches real player data.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

// Switch CWD to a throwaway temp dir BEFORE loading any bot module (database.js
// opens the DB at require-time using a relative path).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-test-'));
process.chdir(tmp);

// Pre-create a DB already in GLOBAL mode so database.js picks the guildId proxy
// at load time (matches production, where migration ran long ago). Without this,
// a brand-new DB races: db is bound to the raw handle before migration drops
// guildId, leaving guildId=? queries broken — a test-only artifact.
(function seedGlobalModeDb() {
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(path.join(tmp, 'economy.sqlite'));
  // Minimal global-schema users + the marker table checkGlobalMode/migration look for.
  d.exec(`CREATE TABLE IF NOT EXISTS users (userId TEXT PRIMARY KEY, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 0, balance INTEGER DEFAULT 0, lastDaily TEXT);`);
  d.exec(`CREATE TABLE IF NOT EXISTS users_global (userId TEXT PRIMARY KEY, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 0, balance INTEGER DEFAULT 0, lastDaily TEXT);`);
  d.close();
})();


// Silence the bot's startup console noise; keep test output clean.
const realLog = console.log, realErr = console.error;
console.log = () => {}; console.error = () => {};

const harness = require(path.join(__dirname, 'harness'));

const suiteFiles = [
  'suites/panels.test.js',
  'suites/economy.test.js',
  'suites/gameplay.test.js',
  'suites/systems.test.js',
  'suites/globaltrade.test.js',
  'suites/engagement.test.js',
];

(async () => {
  for (const f of suiteFiles) {
    const register = require(path.join(__dirname, f));
    register();
  }
  console.log = realLog; console.error = realErr;
  const summary = await harness.finish('BOT TEST SUITE');
  // Cleanup temp dir
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  process.exit(summary.fail ? 1 : 0);
})().catch(e => {
  console.log = realLog; console.error = realErr;
  console.error('Test runner crashed:', e);
  process.exit(1);
});
