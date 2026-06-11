#!/usr/bin/env node
// prefetch-all.js — Download SEMUA kartu (Pokemon + One Piece) ke SQLite cache
// Jalankan 1x: node prefetch-all.js
// Setelah selesai, gacha 100% offline (0 API calls)

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'economy.sqlite'));
db.pragma('journal_mode = WAL');

// ==================== SETUP TABLES ====================
db.exec(`CREATE TABLE IF NOT EXISTS pokemon_card_cache (
    cardApiId TEXT PRIMARY KEY, name TEXT, setName TEXT, rarity TEXT,
    imageUrl TEXT, types TEXT DEFAULT '', hp TEXT DEFAULT '', artist TEXT DEFAULT '', cachedAt INTEGER
)`);

db.exec(`CREATE TABLE IF NOT EXISTS onepiece_card_cache (
    cardId TEXT PRIMARY KEY, name TEXT NOT NULL, rarity TEXT DEFAULT 'C',
    cardType TEXT DEFAULT 'CHARACTER', imageUrl TEXT DEFAULT '',
    color TEXT DEFAULT '', power TEXT DEFAULT '', cost TEXT DEFAULT '',
    attribute TEXT DEFAULT '', cardSet TEXT DEFAULT '', effect TEXT DEFAULT '', cachedAt INTEGER
)`);

// ==================== PROGRESS BAR ====================
function formatTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60) return `${m}m ${rs}s`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
}

function progressBar(current, total, startTime, width = 30) {
    const pct = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    const elapsed = Date.now() - startTime;
    const speed = current > 0 ? elapsed / current : 0;
    const remaining = (total - current) * speed;
    const eta = current > 0 ? formatTime(remaining) : '...';
    const elapsedStr = formatTime(elapsed);

    return `   [${bar}] ${pct}% (${current}/${total}) | ⏱️ ${elapsedStr} | ETA: ${eta}`;
}

// ==================== HELPERS ====================
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ==================== POKEMON TCG ====================
const POKEMON_API = 'https://api.pokemontcg.io/v2/cards';
const PAGE_SIZE = 250;

function getPokemonHeaders() {
    const h = { Accept: 'application/json' };
    if (process.env.POKEMON_TCG_API_KEY) h['X-Api-Key'] = process.env.POKEMON_TCG_API_KEY;
    return h;
}

const pokemonInsert = db.prepare(`INSERT OR REPLACE INTO pokemon_card_cache
    (cardApiId, name, setName, rarity, imageUrl, types, hp, artist, cachedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const pokemonBatch = db.transaction((cards) => {
    for (const c of cards) pokemonInsert.run(c.cardApiId, c.name, c.setName, c.rarity, c.imageUrl, c.types, c.hp, c.artist, Date.now());
});

async function fetchPokemonPage(page) {
    const url = `${POKEMON_API}?pageSize=${PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, { headers: getPokemonHeaders() });
    if (!res.ok) {
        if (res.status === 429) { console.log('\n   ⏳ Rate limited! Waiting 60s...'); await sleep(60000); return fetchPokemonPage(page); }
        throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
}

async function prefetchPokemon() {
    console.log('');
    console.log('🎴 ═══════════════════════════════════');
    console.log('   POKEMON TCG — Downloading...');
    console.log('═══════════════════════════════════════');
    console.log(`   API Key: ${process.env.POKEMON_TCG_API_KEY ? '✅ Set (fast mode)' : '❌ Not set (slow mode ~2-3 min)'}`);

    const existing = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
    console.log(`   💾 Already in cache: ${existing.toLocaleString()} cards`);

    const first = await fetchPokemonPage(1);
    const total = first.totalCount;
    const pages = Math.ceil(total / PAGE_SIZE);
    console.log(`   📊 Total available: ${total.toLocaleString()} cards (${pages} pages)`);
    console.log('');

    let saved = 0;
    const startTime = Date.now();

    for (let page = 1; page <= pages; page++) {
        try {
            const data = page === 1 ? first : await fetchPokemonPage(page);
            const cards = (data.data || []).filter(p => p.id && p.name).map(p => ({
                cardApiId: p.id, name: p.name, setName: p.set?.name || 'Unknown',
                rarity: p.rarity || 'Common', imageUrl: p.images?.large || p.images?.small || '',
                types: (p.types || []).join('/'), hp: p.hp || '', artist: p.artist || '',
            }));
            pokemonBatch(cards);
            saved += cards.length;

            process.stdout.write(`\r${progressBar(page, pages, startTime)}`);

            await sleep(process.env.POKEMON_TCG_API_KEY ? 200 : 1500);
        } catch (e) {
            console.log(`\n   ❌ Error page ${page}: ${e.message}. Retry in 10s...`);
            await sleep(10000);
            page--;
        }
    }

    const finalCount = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
    const elapsed = formatTime(Date.now() - startTime);
    console.log('');
    console.log(`   ✅ DONE! ${finalCount.toLocaleString()} cards | Waktu: ${elapsed}`);
    console.log('');
}

// ==================== ONE PIECE TCG ====================
const OP_SOURCE = 'https://raw.githubusercontent.com/nemesis312/OnePieceTCGEngCardList/master/CardDb3.json';

const opInsert = db.prepare(`INSERT OR REPLACE INTO onepiece_card_cache
    (cardId, name, rarity, cardType, imageUrl, color, power, cost, attribute, cardSet, effect, cachedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const opBatch = db.transaction((cards) => {
    for (const c of cards) opInsert.run(c.cardId, c.name, c.rarity, c.cardType, c.imageUrl, c.color, c.power, c.cost, c.attribute, c.cardSet, c.effect, Date.now());
});

async function prefetchOnePiece() {
    console.log('');
    console.log('🏴‍☠️ ═══════════════════════════════════');
    console.log('   ONE PIECE TCG — Downloading...');
    console.log('═══════════════════════════════════════');

    const existing = db.prepare('SELECT COUNT(*) as c FROM onepiece_card_cache').get().c;
    console.log(`   💾 Already in cache: ${existing.toLocaleString()} cards`);
    console.log('   📥 Fetching from GitHub (instant)...');

    const startTime = Date.now();
    const res = await fetch(OP_SOURCE);
    if (!res.ok) throw new Error(`Failed: HTTP ${res.status}`);
    const json = await res.json();
    const cards = (json.Cards || []).filter(c => c.Name && c.CardNum).map(c => ({
        cardId: c.CardNum.replace('#', ''), name: c.Name, rarity: c.Rarity || 'C',
        cardType: c.CardType || 'CHARACTER', imageUrl: c.Img || (c.Images?.[0]) || '',
        color: c.Color || '', power: c.Power || '', cost: c.Cost || '',
        attribute: c.Attribute || '', cardSet: (c.CardSets || '').replace('Card Set(s)', '').trim(),
        effect: (c.Effect || '').substring(0, 500),
    }));

    // Batch insert with progress
    const batchSize = 100;
    for (let i = 0; i < cards.length; i += batchSize) {
        const batch = cards.slice(i, i + batchSize);
        opBatch(batch);
        process.stdout.write(`\r${progressBar(Math.min(i + batchSize, cards.length), cards.length, startTime)}`);
    }

    const finalCount = db.prepare('SELECT COUNT(*) as c FROM onepiece_card_cache').get().c;
    const elapsed = formatTime(Date.now() - startTime);
    console.log('');
    console.log(`   ✅ DONE! ${finalCount.toLocaleString()} cards | Waktu: ${elapsed}`);
    console.log('');
}

// ==================== MAIN ====================
async function main() {
    console.clear();
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║                                          ║');
    console.log('║   🃏 CARD GACHA — PRE-FETCH ALL CARDS   ║');
    console.log('║                                          ║');
    console.log('║   Pokemon TCG + One Piece TCG            ║');
    console.log('║                                          ║');
    console.log('╚══════════════════════════════════════════╝');

    // One Piece first (instant)
    await prefetchOnePiece();

    // Pokemon (takes longer)
    await prefetchPokemon();

    // Final summary
    const pkm = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
    const op = db.prepare('SELECT COUNT(*) as c FROM onepiece_card_cache').get().c;

    // Rarity breakdown
    const pkmRarity = db.prepare('SELECT rarity, COUNT(*) as c FROM pokemon_card_cache GROUP BY rarity ORDER BY c DESC LIMIT 8').all();
    const opRarity = db.prepare('SELECT rarity, COUNT(*) as c FROM onepiece_card_cache GROUP BY rarity ORDER BY c DESC LIMIT 8').all();

    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║            ✅ ALL COMPLETE!              ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  🎴 Pokemon TCG:   ${String(pkm.toLocaleString()).padEnd(8)} cards       ║`);
    console.log(`║  🏴‍☠️ One Piece TCG: ${String(op.toLocaleString()).padEnd(8)} cards       ║`);
    console.log(`║  📊 TOTAL:         ${String((pkm + op).toLocaleString()).padEnd(8)} cards       ║`);
    console.log('╠══════════════════════════════════════════╣');
    console.log('║                                          ║');
    console.log('║  📋 Next steps:                          ║');
    console.log('║  1. Set POKEMON_TCG_CACHE_ONLY=1         ║');
    console.log('║  2. Restart bot                          ║');
    console.log('║  3. Gacha 100% offline selamanya! 🎉     ║');
    console.log('║                                          ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
    console.log('📊 Pokemon Rarity Breakdown:');
    for (const r of pkmRarity) console.log(`   ${r.rarity.padEnd(20)} ${r.c.toLocaleString()}`);
    console.log('');
    console.log('📊 One Piece Rarity Breakdown:');
    for (const r of opRarity) console.log(`   ${r.rarity.padEnd(20)} ${r.c.toLocaleString()}`);

    db.close();
}

main().catch(e => { console.error('\n❌ Fatal Error:', e.message); process.exit(1); });
