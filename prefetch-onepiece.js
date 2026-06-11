#!/usr/bin/env node
// prefetch-onepiece.js — Download One Piece TCG cards into local SQLite cache
// Source: GitHub (nemesis312/OnePieceTCGEngCardList) — FREE, no API key needed
// Images: en.onepiece-cardgame.com CDN (Bandai official, free public access)
//
// Run once: node prefetch-onepiece.js
// After this, One Piece gacha works 100% offline.

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'economy.sqlite'));
db.pragma('journal_mode = WAL');

// Ensure cache table exists
db.exec(`CREATE TABLE IF NOT EXISTS onepiece_card_cache (
    cardId TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    rarity TEXT DEFAULT 'C',
    cardType TEXT DEFAULT 'CHARACTER',
    imageUrl TEXT DEFAULT '',
    color TEXT DEFAULT '',
    power TEXT DEFAULT '',
    cost TEXT DEFAULT '',
    attribute TEXT DEFAULT '',
    cardSet TEXT DEFAULT '',
    effect TEXT DEFAULT '',
    cachedAt INTEGER
)`);

const SOURCE_URL = 'https://raw.githubusercontent.com/nemesis312/OnePieceTCGEngCardList/master/CardDb3.json';

const insertStmt = db.prepare(`INSERT OR REPLACE INTO onepiece_card_cache
    (cardId, name, rarity, cardType, imageUrl, color, power, cost, attribute, cardSet, effect, cachedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const insertMany = db.transaction((cards) => {
    for (const c of cards) {
        insertStmt.run(c.cardId, c.name, c.rarity, c.cardType, c.imageUrl, c.color, c.power, c.cost, c.attribute, c.cardSet, c.effect, Date.now());
    }
});

async function main() {
    console.log('🏴‍☠️ One Piece TCG Card Pre-Fetcher');
    console.log('====================================');
    console.log('Source: GitHub (free, no API key)');
    console.log('');

    // Check existing
    const existing = db.prepare('SELECT COUNT(*) as c FROM onepiece_card_cache').get().c;
    console.log(`💾 Already cached: ${existing} cards`);

    console.log('📥 Downloading card database from GitHub...');
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`Failed to fetch: HTTP ${res.status}`);
    const json = await res.json();
    const cards = json.Cards || [];
    console.log(`📊 Found: ${cards.length} cards`);

    // Parse and insert
    const parsed = cards.filter(c => c.Name && c.CardNum).map(c => {
        const cardId = c.CardNum.replace('#', '');
        const setCode = cardId.split('-')[0];
        // Use limitlesstcg CDN (clean HD images, no SAMPLE watermark)
        const cleanImageUrl = `https://limitlesstcg.nyc3.digitaloceanspaces.com/one-piece/${setCode}/${cardId}_EN.webp`;
        return {
            cardId, name: c.Name, rarity: c.Rarity || 'C',
            cardType: c.CardType || 'CHARACTER', imageUrl: cleanImageUrl,
            color: c.Color || '', power: c.Power || '', cost: c.Cost || '',
            attribute: c.Attribute || '', cardSet: (c.CardSets || '').replace('Card Set(s)', '').trim(),
            effect: (c.Effect || '').substring(0, 500),
        };
    });

    console.log(`✅ Valid cards: ${parsed.length}`);
    console.log('💾 Saving to database...');
    insertMany(parsed);

    // Final stats
    const finalCount = db.prepare('SELECT COUNT(*) as c FROM onepiece_card_cache').get().c;
    const byRarity = db.prepare('SELECT rarity, COUNT(*) as c FROM onepiece_card_cache GROUP BY rarity ORDER BY c DESC').all();

    console.log('');
    console.log('✅ Pre-fetch complete!');
    console.log(`💾 Total cached: ${finalCount} cards`);
    console.log('');
    console.log('📊 Breakdown by rarity:');
    for (const r of byRarity) {
        console.log(`   ${r.rarity}: ${r.c}`);
    }
    console.log('');
    console.log('🎉 One Piece gacha ready! 100% offline.');

    db.close();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
