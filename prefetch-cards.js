#!/usr/bin/env node
// prefetch-cards.js — Download ALL Pokemon TCG cards into local SQLite cache
// Run once: node prefetch-cards.js
// After this, gacha works 100% offline from cache (0 API calls needed)
//
// pokemontcg.io has ~20,000 cards. This script fetches them all in batches.
// Takes ~10-15 minutes without API key, ~3-5 minutes with key.
//
// Usage:
//   node prefetch-cards.js              (tanpa key, slower)
//   POKEMON_TCG_API_KEY=xxx node prefetch-cards.js   (dengan key, faster)

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'economy.sqlite'));
db.pragma('journal_mode = WAL');

// Ensure cache table exists
db.exec(`CREATE TABLE IF NOT EXISTS pokemon_card_cache (
    cardApiId TEXT PRIMARY KEY, name TEXT, setName TEXT, rarity TEXT,
    imageUrl TEXT, types TEXT DEFAULT '', hp TEXT DEFAULT '', artist TEXT DEFAULT '', cachedAt INTEGER,
    marketPrice REAL DEFAULT 0
)`);
try { db.exec(`ALTER TABLE pokemon_card_cache ADD COLUMN marketPrice REAL DEFAULT 0`); } catch(_) {}

const API = 'https://api.pokemontcg.io/v2/cards';
const PAGE_SIZE = 250; // max allowed by API

function getHeaders() {
    const h = { Accept: 'application/json' };
    if (process.env.POKEMON_TCG_API_KEY) h['X-Api-Key'] = process.env.POKEMON_TCG_API_KEY;
    return h;
}

const insertStmt = db.prepare(`INSERT OR REPLACE INTO pokemon_card_cache
    (cardApiId, name, setName, rarity, imageUrl, types, hp, artist, cachedAt, marketPrice)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const insertMany = db.transaction((cards) => {
    for (const c of cards) {
        insertStmt.run(c.cardApiId, c.name, c.setName, c.rarity, c.imageUrl, c.types, c.hp, c.artist, Date.now(), c.marketPrice);
    }
});

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(page) {
    const url = `${API}?pageSize=${PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) {
        if (res.status === 429) {
            console.log('  ⏳ Rate limited! Waiting 60 seconds...');
            await sleep(60000);
            return fetchPage(page); // retry
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const json = await res.json();
    return { cards: json.data || [], totalCount: json.totalCount || 0 };
}

async function main() {
    console.log('🃏 Pokemon TCG Card Pre-Fetcher');
    console.log('================================');
    console.log(`API Key: ${process.env.POKEMON_TCG_API_KEY ? '✅ Set' : '❌ Not set (slower, may rate limit)'}`);
    console.log('');

    // Get total count
    const first = await fetchPage(1);
    const totalCards = first.totalCount;
    const totalPages = Math.ceil(totalCards / PAGE_SIZE);
    console.log(`📊 Total cards in API: ${totalCards.toLocaleString()}`);
    console.log(`📄 Total pages: ${totalPages} (${PAGE_SIZE}/page)`);
    console.log('');

    // Check existing cache
    const existing = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
    console.log(`💾 Already cached: ${existing.toLocaleString()} cards`);
    console.log('');

    let fetched = 0;
    let saved = 0;

    for (let page = 1; page <= totalPages; page++) {
        try {
            const { cards } = page === 1 ? first : await fetchPage(page);
            fetched += cards.length;

            const parsed = cards
                .filter(p => p.id && p.name)
                .map(p => {
                    // Extract market price: prefer tcgplayer USD, fallback to cardmarket EUR
                    let marketPrice = 0;
                    if (p.tcgplayer?.prices) {
                        const priceVariants = p.tcgplayer.prices;
                        // Try variants in order of preference
                        for (const variant of ['holofoil', 'reverseHolofoil', '1stEditionHolofoil', 'normal', '1stEditionNormal', 'unlimitedHolofoil']) {
                            if (priceVariants[variant]?.market) {
                                marketPrice = priceVariants[variant].market;
                                break;
                            }
                        }
                        // If no market price found, try mid price
                        if (!marketPrice) {
                            for (const variant of Object.keys(priceVariants)) {
                                if (priceVariants[variant]?.market) { marketPrice = priceVariants[variant].market; break; }
                                if (!marketPrice && priceVariants[variant]?.mid) { marketPrice = priceVariants[variant].mid; }
                            }
                        }
                    }
                    // Fallback to cardmarket average sell price (EUR → approximate USD)
                    if (!marketPrice && p.cardmarket?.prices?.averageSellPrice) {
                        marketPrice = Math.round(p.cardmarket.prices.averageSellPrice * 1.1 * 100) / 100; // ~EUR to USD
                    }

                    return {
                        cardApiId: p.id,
                        name: p.name,
                        setName: p.set?.name || 'Unknown',
                        rarity: p.rarity || 'Common',
                        imageUrl: p.images?.large || p.images?.small || '',
                        types: (p.types || []).join('/'),
                        hp: p.hp || '',
                        artist: p.artist || '',
                        marketPrice: marketPrice || 0,
                    };
                });

            insertMany(parsed);
            saved += parsed.length;

            const pct = Math.round((page / totalPages) * 100);
            process.stdout.write(`\r  [${pct}%] Page ${page}/${totalPages} — ${saved.toLocaleString()} cards saved`);

            // Rate limit protection: wait between requests
            if (!process.env.POKEMON_TCG_API_KEY) {
                await sleep(1500); // 1.5s tanpa key
            } else {
                await sleep(200); // 200ms dengan key
            }
        } catch (e) {
            console.log(`\n  ❌ Error on page ${page}: ${e.message}`);
            console.log('  Retrying in 10 seconds...');
            await sleep(10000);
            page--; // retry same page
        }
    }

    console.log('\n');

    // Final stats
    const finalCount = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
    const byRarity = db.prepare('SELECT rarity, COUNT(*) as c FROM pokemon_card_cache GROUP BY rarity ORDER BY c DESC').all();

    console.log('✅ Pre-fetch complete!');
    console.log(`💾 Total cached: ${finalCount.toLocaleString()} cards`);
    console.log('');
    console.log('📊 Breakdown by rarity:');
    for (const r of byRarity) {
        console.log(`   ${r.rarity}: ${r.c.toLocaleString()}`);
    }
    console.log('');
    console.log('🎉 Gacha sekarang bisa jalan 100% dari cache!');
    console.log('   Set POKEMON_TCG_CACHE_ONLY=1 di .env untuk disable API calls.');

    db.close();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
