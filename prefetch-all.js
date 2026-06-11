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

// ==================== PROGRESS DISPLAY ====================
function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60) return `${m}m ${rs}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}

function showProgress(current, total, startTime, label) {
    const pct = Math.round((current / total) * 100);
    const barWidth = 25;
    const filled = Math.round((current / total) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);

    const elapsed = Date.now() - startTime;
    let eta = '---';
    if (current > 0) {
        const msPerItem = elapsed / current;
        const remaining = Math.round((total - current) * msPerItem);
        eta = formatTime(remaining);
    }

    const line = `   ${label} [${bar}] ${pct}% | ${current}/${total} | ${formatTime(elapsed)} elapsed | ETA: ${eta}`;
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(line);
}

// ==================== HELPERS ====================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
        if (res.status === 429) {
            console.log('\n   \u23F3 Rate limited! Menunggu 60 detik...');
            await sleep(60000);
            return fetchPokemonPage(page);
        }
        throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
}

async function prefetchPokemon() {
    console.log('');
    console.log('\u{1F3B4} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
    console.log('   POKEMON TCG');
    console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
    console.log(`   API Key: ${process.env.POKEMON_TCG_API_KEY ? '\u2705 Set (fast)' : '\u274C Not set (slow ~2-3 min)'}`);

    const existing = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
    console.log(`   \u{1F4BE} Sudah di cache: ${existing.toLocaleString()} cards`);

    console.log('   \u{1F4E1} Menghubungi API...');
    const first = await fetchPokemonPage(1);
    const total = first.totalCount;
    const pages = Math.ceil(total / PAGE_SIZE);
    console.log(`   \u{1F4CA} Total: ${total.toLocaleString()} cards (${pages} halaman)`);
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
            showProgress(page, pages, startTime, '\u{1F3B4}');
            await sleep(process.env.POKEMON_TCG_API_KEY ? 250 : 1500);
        } catch (e) {
            console.log(`\n   \u274C Error page ${page}: ${e.message}`);
            console.log('   \u{1F504} Retry dalam 10 detik...');
            await sleep(10000);
            page--;
        }
    }

    const finalCount = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
    console.log('');
    console.log(`   \u2705 Selesai! ${finalCount.toLocaleString()} cards | Waktu: ${formatTime(Date.now() - startTime)}`);
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
    console.log('\u{1F3F4}\u200D\u2620\uFE0F \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
    console.log('   ONE PIECE TCG');
    console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

    const existing = db.prepare('SELECT COUNT(*) as c FROM onepiece_card_cache').get().c;
    console.log(`   \u{1F4BE} Sudah di cache: ${existing.toLocaleString()} cards`);
    console.log('   \u{1F4E5} Download dari GitHub...');

    const startTime = Date.now();
    const res = await fetch(OP_SOURCE);
    if (!res.ok) throw new Error(`Failed: HTTP ${res.status}`);
    const json = await res.json();
    const parsed = (json.Cards || []).filter(c => c.Name && c.CardNum).map(c => {
        const cardId = c.CardNum.replace('#', '');
        const setCode = cardId.split('-')[0]; // OP01-001 → OP01
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

    console.log(`   \u{1F4CA} Ditemukan: ${cards.length} cards`);

    const batchSize = 50;
    const totalBatches = Math.ceil(cards.length / batchSize);
    for (let i = 0; i < totalBatches; i++) {
        const batch = cards.slice(i * batchSize, (i + 1) * batchSize);
        opBatch(batch);
        showProgress(i + 1, totalBatches, startTime, '\u{1F3F4}\u200D\u2620\uFE0F');
    }

    const finalCount = db.prepare('SELECT COUNT(*) as c FROM onepiece_card_cache').get().c;
    console.log('');
    console.log(`   \u2705 Selesai! ${finalCount.toLocaleString()} cards | Waktu: ${formatTime(Date.now() - startTime)}`);
}

// ==================== MAIN ====================
async function main() {
    console.clear();
    console.log('');
    console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
    console.log('\u2551                                          \u2551');
    console.log('\u2551   \u{1F0CF} CARD GACHA \u2014 PRE-FETCH ALL CARDS   \u2551');
    console.log('\u2551                                          \u2551');
    console.log('\u2551   Pokemon TCG + One Piece TCG            \u2551');
    console.log('\u2551                                          \u2551');
    console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');

    await prefetchOnePiece();
    await prefetchPokemon();

    // Final summary
    const pkm = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
    const op = db.prepare('SELECT COUNT(*) as c FROM onepiece_card_cache').get().c;

    console.log('');
    console.log('');
    console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
    console.log('\u2551           \u2705 SEMUA SELESAI!               \u2551');
    console.log('\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563');
    console.log(`\u2551  \u{1F3B4} Pokemon:   ${String(pkm.toLocaleString()).padEnd(10)} cards      \u2551`);
    console.log(`\u2551  \u{1F3F4}\u200D\u2620\uFE0F One Piece: ${String(op.toLocaleString()).padEnd(10)} cards      \u2551`);
    console.log(`\u2551  \u{1F4CA} TOTAL:     ${String((pkm + op).toLocaleString()).padEnd(10)} cards      \u2551`);
    console.log('\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563');
    console.log('\u2551  \u{1F4CB} Set POKEMON_TCG_CACHE_ONLY=1      \u2551');
    console.log('\u2551  \u{1F504} Restart bot                       \u2551');
    console.log('\u2551  \u{1F389} Gacha offline selamanya!           \u2551');
    console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');
    console.log('');

    // Rarity breakdown
    console.log('\u{1F4CA} Pokemon Rarity:');
    const pkmR = db.prepare('SELECT rarity, COUNT(*) as c FROM pokemon_card_cache GROUP BY rarity ORDER BY c DESC').all();
    for (const r of pkmR) console.log(`   ${(r.rarity || 'Unknown').padEnd(20)} ${r.c.toLocaleString()}`);

    console.log('');
    console.log('\u{1F4CA} One Piece Rarity:');
    const opR = db.prepare('SELECT rarity, COUNT(*) as c FROM onepiece_card_cache GROUP BY rarity ORDER BY c DESC').all();
    for (const r of opR) console.log(`   ${(r.rarity || 'Unknown').padEnd(20)} ${r.c.toLocaleString()}`);

    console.log('');
    db.close();
}

main().catch(e => { console.error('\n\u274C Fatal Error:', e.message); process.exit(1); });
