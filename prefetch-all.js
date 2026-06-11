#!/usr/bin/env node
// prefetch-all.js — Download SEMUA kartu (Pokemon + One Piece) ke SQLite cache
// Jalankan 1x: node prefetch-all.js
// Setelah selesai, gacha 100% offline (0 API calls)
//
// Pokemon: ~20,000 kartu dari pokemontcg.io (masih gratis)
// One Piece: ~2,500 kartu dari GitHub JSON + Bandai CDN (gratis)

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
        if (res.status === 429) { console.log('  ⏳ Rate limit! Waiting 60s...'); await sleep(60000); return fetchPokemonPage(page); }
        throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
}

async function prefetchPokemon() {
    console.log('🎴 ═══ POKEMON TCG ═══');
    console.log(`   API Key: ${process.env.POKEMON_TCG_API_KEY ? '✅' : '❌ (slower)'}`);

    const existing = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
    console.log(`   💾 Already cached: ${existing}`);

    const first = await fetchPokemonPage(1);
    const total = first.totalCount;
    const pages = Math.ceil(total / PAGE_SIZE);
    console.log(`   📊 Total: ${total.toLocaleString()} cards (${pages} pages)`);

    let saved = 0;
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
            const pct = Math.round((page / pages) * 100);
            process.stdout.write(`\r   [${pct}%] Page ${page}/${pages} — ${saved.toLocaleString()} saved`);
            await sleep(process.env.POKEMON_TCG_API_KEY ? 200 : 1500);
        } catch (e) {
            console.log(`\n   ❌ Error page ${page}: ${e.message}. Retrying...`);
            await sleep(10000);
            page--;
        }
    }
    const finalCount = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
    console.log(`\n   ✅ Pokemon done! ${finalCount.toLocaleString()} cards cached\n`);
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
    console.log('🏴‍☠️ ═══ ONE PIECE TCG ═══');
    const existing = db.prepare('SELECT COUNT(*) as c FROM onepiece_card_cache').get().c;
    console.log(`   💾 Already cached: ${existing}`);
    console.log('   📥 Downloading from GitHub...');

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

    opBatch(cards);
    const finalCount = db.prepare('SELECT COUNT(*) as c FROM onepiece_card_cache').get().c;
    console.log(`   ✅ One Piece done! ${finalCount.toLocaleString()} cards cached\n`);
}

// ==================== MAIN ====================
async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════╗');
    console.log('║  🃏 CARD GACHA — PRE-FETCH ALL      ║');
    console.log('║  Download Pokemon + One Piece cards  ║');
    console.log('╚══════════════════════════════════════╝');
    console.log('');

    // One Piece first (instant)
    await prefetchOnePiece();

    // Pokemon (takes longer)
    await prefetchPokemon();

    // Final summary
    const pkm = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
    const op = db.prepare('SELECT COUNT(*) as c FROM onepiece_card_cache').get().c;
    console.log('╔══════════════════════════════════════╗');
    console.log('║  ✅ ALL DONE!                        ║');
    console.log(`║  🎴 Pokemon: ${String(pkm).padEnd(6)} cards            ║`);
    console.log(`║  🏴‍☠️ One Piece: ${String(op).padEnd(5)} cards            ║`);
    console.log(`║  📊 Total: ${String(pkm + op).padEnd(7)} cards            ║`);
    console.log('║                                      ║');
    console.log('║  Set POKEMON_TCG_CACHE_ONLY=1        ║');
    console.log('║  di .env untuk full offline mode!    ║');
    console.log('╚══════════════════════════════════════╝');

    db.close();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
