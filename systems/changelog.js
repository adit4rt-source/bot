// systems/changelog.js — Auto-post changelog ke channel saat bot start
//
// Admin set channel via server_settings key `changelog_channel`.
// Bot baca CHANGELOG.md dari root → post versi terbaru ke channel (sekali).
// Bisa juga manual: /changelog post

const { EmbedBuilder } = require('discord.js');
const { db, getSetting } = require('../database');
const fs = require('fs');
const path = require('path');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md');
const LAST_KEY = 'changelog_last_hash';

function getChangelogChannel(guild) {
    const id = getSetting(guild.id, 'changelog_channel', '');
    return id ? guild.channels.cache.get(id) : null;
}

function readChangelog() {
    try { return fs.readFileSync(CHANGELOG_PATH, 'utf8'); } catch (_) { return ''; }
}

// Parse latest version block from CHANGELOG.md
function getLatestEntry(md) {
    if (!md) return null;
    const lines = md.split('\n');
    let title = '', body = [];
    let found = false;
    for (const line of lines) {
        if (line.startsWith('## ') || line.startsWith('# ')) {
            if (found) break; // hit next version → stop
            title = line.replace(/^#+\s*/, '').trim();
            found = true;
            continue;
        }
        if (found) body.push(line);
    }
    if (!title) return null;
    return { title, body: body.join('\n').trim() };
}

function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return String(h);
}

// Post latest changelog to configured channel (if not already posted)
async function postChangelog(guild, force = false) {
    const ch = getChangelogChannel(guild);
    if (!ch) return;
    const md = readChangelog();
    const entry = getLatestEntry(md);
    if (!entry) return;

    const hash = simpleHash(entry.title + entry.body.slice(0, 200));
    const lastHash = getSetting(guild.id, LAST_KEY, '');
    if (!force && lastHash === hash) return; // already posted

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`📋 Update: ${entry.title}`)
        .setDescription(entry.body.slice(0, 4000) || '*Tidak ada detail.*')
        .setFooter({ text: 'Bot Changelog • Auto-posted on restart' })
        .setTimestamp();

    try {
        await ch.send({ embeds: [embed] });
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guild.id, LAST_KEY, hash);
    } catch (e) {
        log('WARN', `[changelog] gagal post ke ${ch.name}: ${e.message}`);
    }
}

// Called on bot ready — post to all guilds that have changelog_channel set
async function autoPostChangelog(client) {
    for (const guild of client.guilds.cache.values()) {
        await postChangelog(guild).catch(() => {});
    }
}

module.exports = { postChangelog, autoPostChangelog, getLatestEntry, readChangelog };
