#!/usr/bin/env node
// backfill-prices.js — Fetch market prices for cards already in cache
// Safe to run while bot is running (uses WAL mode, no locks)
//
// This does NOT re-download all 20k cards. It only fetches price data
// for cards that already exist in pokemon_card_cache but have marketPrice=0.
//
// Usage:
//   node backfill-prices.js                          (tanpa key, slower ~10-15 min)
//   POKEMON_TCG_API_KEY=xxx node backfill-prices.js  (dengan key, ~3-5 min)

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'economy.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// Ensure marketPrice column exists
try { db.exec(`ALTER TABLE pokemon_card_cache ADD COLUMN marketPrice REAL DEFAULT 0`); } catch(_) {}
try { db.exec(`ALTER TABLE pokemon_cards ADD COLUMN marketPrice REAL DEFAULT 0`); } catch(_) {}

const API = 'https://api.pokemontcg.io/v2/cards';
const PAGE_SIZE = 250;

function getHeaders() {
    const h = { Accept: 'application/json' };
    if (process.env.POKEMON_TCG_API_KEY) h['X-Api-Key'] = process.env.POKEMON_TCG_API_KEY;
    return h;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractPrice(card) {
    let price = 0;
    if (card.tcgplayer?.prices) {
        const pv = card.tcgplayer.prices;
        for (const v of ['holofoil', 'reverseHolofoil', '1stEditionHolofoil', 'normal', '1stEditionNormal', 'unlimitedHolofoil']) {
            if (pv[v]?.market) { price = pv[v].market; break; }
        }
        if (!price) {
            for (const v of Object.keys(pv)) {
                if (pv[v]?.market) { price = pv[v].market; break; }
                if (!price && pv[v]?.mid) { price = pv[v].mid; }
            }
        }
    }
    if (!price && card.cardmarket?.prices?.averageSellPrice) {
        price = Math.round(card.cardmarket.prices.averageSellPrice * 1.1 * 100) / 100;
    }
    return price;
}

async function fetchPage(page) {
    const url = `${API}?pageSize=${PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) {
        if (res.status === 429) {
            console.log('  \u23f3 Rate limited! Waiting 60s...');
            await sleep(60000);
            return fetchPage(page);
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const json = await res.json();
    return { cards: json.data || [], totalCount: json.totalCount || 0 };
}

const updateCache = db.prepare('UPDATE pokemon_card_cache SET marketPrice=? WHERE cardApiId=?');
const updateCards = db.prepare('UPDATE pokemon_cards SET marketPrice=? WHERE cardApiId=? AND marketPrice=0');

const updateBatch = db.transaction((updates) => {
    for (const { cardApiId, price } of updates) {
        updateCache.run(price, cardApiId);
        updateCards.run(price, cardApiId);
    }
});

async function main() {
    console.log('\ud83d\udcb0 Pokemon TCG Market Price Backfill');
    console.log('====================================');
    console.log(`API Key: ${process.env.POKEMON_TCG_API_KEY ? '\u2705 Set' : '\u274c Not set (slower)'}`);
    console.log('');

    const totalCached = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
    const needsPrice = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache WHERE marketPrice=0 OR marketPrice IS NULL').get().c;
    console.log(`\ud83d\udcbe Cards in cache: ${totalCached.toLocaleString()}`);
    console.log(`\ud83c\udfaf Need price update: ${needsPrice.toLocaleString()}`);

    if (needsPrice === 0) {
        console.log('\n\u2705 All cards already have prices! Nothing to do.');
        const playerCards = db.prepare('SELECT COUNT(*) as c FROM pokemon_cards WHERE marketPrice=0').get().c;
        if (playerCards > 0) {
            console.log(`\ud83d\udd04 Syncing ${playerCards} player cards from cache...`);
            db.exec(`UPDATE pokemon_cards SET marketPrice = (
                SELECT pokemon_card_cache.marketPrice FROM pokemon_card_cache
                WHERE pokemon_card_cache.cardApiId = pokemon_cards.cardApiId AND pokemon_card_cache.marketPrice > 0
            ) WHERE marketPrice = 0 AND cardApiId IN (SELECT cardApiId FROM pokemon_card_cache WHERE marketPrice > 0)`);
            const remaining = db.prepare('SELECT COUNT(*) as c FROM pokemon_cards WHERE marketPrice=0').get().c;
            console.log(`\u2705 Done! ${playerCards - remaining} player cards updated.`);
        }
        db.close();
        return;
    }

    console.log('');
    console.log('\ud83d\ude80 Fetching prices from API (bot tetap jalan, ini aman)...');
    console.log('');

    // Fetch ALL pages from API (same as prefetch) but only update marketPrice
    const first = await fetchPage(1);
    const totalCards = first.totalCount;
    const totalPages = Math.ceil(totalCards / PAGE_SIZE);

    let updated = 0;
    let processed = 0;

    for (let page = 1; page <= totalPages; page++) {
        try {
            const { cards } = page === 1 ? first : await fetchPage(page);
            processed += cards.length;

            const updates = [];
            for (const card of cards) {
                if (!card.id) continue;
                const price = extractPrice(card);
                if (price > 0) {
                    updates.push({ cardApiId: card.id, price });
                }
            }

            if (updates.length > 0) {
                updateBatch(updates);
                updated += updates.length;
            }

            const pct = Math.round((page / totalPages) * 100);
            process.stdout.write(`\r  [${pct}%] Page ${page}/${totalPages} \u2014 ${updated.toLocaleString()} prices updated`);

            // Rate limit: wait between requests
            if (!process.env.POKEMON_TCG_API_KEY) {
                await sleep(1500);
            } else {
                await sleep(200);
            }
        } catch (e) {
            console.log(`\n  \u274c Error on page ${page}: ${e.message}`);
            console.log('  Retrying in 10s...');
            await sleep(10000);
            page--; // retry
        }
    }

    console.log('\n');

    // Sync to player cards
    console.log('\ud83d\udd04 Syncing prices to player cards...');
    const before = db.prepare('SELECT COUNT(*) as c FROM pokemon_cards WHERE marketPrice=0').get().c;
    db.exec(`UPDATE pokemon_cards SET marketPrice = (
        SELECT pokemon_card_cache.marketPrice FROM pokemon_card_cache
        WHERE pokemon_card_cache.cardApiId = pokemon_cards.cardApiId AND pokemon_card_cache.marketPrice > 0
    ) WHERE marketPrice = 0 AND cardApiId IN (SELECT cardApiId FROM pokemon_card_cache WHERE marketPrice > 0)`);
    const after = db.prepare('SELECT COUNT(*) as c FROM pokemon_cards WHERE marketPrice=0').get().c;

    console.log('');
    console.log('\u2705 Backfill complete!');
    console.log(`\ud83d\udcb0 Cache prices updated: ${updated.toLocaleString()}`);
    console.log(`\ud83c\udccf Player cards synced: ${(before - after).toLocaleString()}`);
    console.log(`\u26a0\ufe0f  Cards without price (no data in API): ${after}`);
    console.log('');
    console.log('\ud83c\udf89 /cardview sekarang tampilkan Market Value!');

    db.close();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
