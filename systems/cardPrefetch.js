// systems/cardPrefetch.js — Background card cache downloader
// Runs in background during bot operation — does NOT block the bot
// Downloads Pokemon TCG + One Piece TCG cards into SQLite cache
const { db } = require('../database');

const POKEMON_API = 'https://api.pokemontcg.io/v2/cards';
const OP_SOURCE = 'https://raw.githubusercontent.com/nemesis312/OnePieceTCGEngCardList/master/CardDb3.json';
const PAGE_SIZE = 250;
const DELAY_PER_PAGE = 2000; // 2s between pages (gentle on API)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getPokemonHeaders() {
    const h = { Accept: 'application/json' };
    if (process.env.POKEMON_TCG_API_KEY) h['X-Api-Key'] = process.env.POKEMON_TCG_API_KEY;
    return h;
}

// ==================== ONE PIECE (instant) ====================
async function prefetchOnePiece() {
    try {
        // Always refresh OP cache to ensure clean images (no SAMPLE watermark)
        const existing = db.prepare('SELECT COUNT(*) as c FROM onepiece_card_cache').get().c;
        const hasBadUrls = existing > 0 && db.prepare("SELECT 1 FROM onepiece_card_cache WHERE imageUrl LIKE '%onepiece-cardgame.com%' LIMIT 1").get();

        if (existing >= 2400 && !hasBadUrls) {
            console.log(`🏴‍☠️ Card cache: One Piece sudah lengkap (${existing} cards)`);
            return;
        }

        if (hasBadUrls) console.log('🏴‍☠️ Card cache: Replacing SAMPLE watermark URLs...');
        else console.log('🏴‍☠️ Card cache: Downloading One Piece cards...');
        const res = await fetch(OP_SOURCE);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const cards = (json.Cards || []).filter(c => c.Name && c.CardNum);

        const stmt = db.prepare(`INSERT OR REPLACE INTO onepiece_card_cache
            (cardId, name, rarity, cardType, imageUrl, color, power, cost, attribute, cardSet, effect, cachedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const batch = db.transaction((items) => { for (const c of items) stmt.run(c.cardId, c.name, c.rarity, c.cardType, c.imageUrl, c.color, c.power, c.cost, c.attribute, c.cardSet, c.effect, Date.now()); });

        const parsed = cards.map(c => {
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
        batch(parsed);

        const total = db.prepare('SELECT COUNT(*) as c FROM onepiece_card_cache').get().c;
        console.log(`🏴‍☠️ Card cache: One Piece selesai! ${total} cards ✅`);
    } catch (e) {
        console.error('🏴‍☠️ Card cache One Piece error:', e.message);
    }
}

// ==================== POKEMON (background, slow) ====================
async function prefetchPokemon() {
    try {
        const existing = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
        if (existing >= 20000) {
            console.log(`🎴 Card cache: Pokemon sudah lengkap (${existing} cards)`);
            return;
        }

        console.log(`🎴 Card cache: Pokemon downloading... (${existing} cached, target ~20,000)`);

        const firstRes = await fetch(`${POKEMON_API}?pageSize=1&page=1`, { headers: getPokemonHeaders() });
        if (!firstRes.ok) { console.log('🎴 Card cache: Pokemon API unavailable, skip.'); return; }
        const firstJson = await firstRes.json();
        const totalCards = firstJson.totalCount || 0;
        const totalPages = Math.ceil(totalCards / PAGE_SIZE);

        const stmt = db.prepare(`INSERT OR REPLACE INTO pokemon_card_cache
            (cardApiId, name, setName, rarity, imageUrl, types, hp, artist, cachedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const batch = db.transaction((items) => { for (const c of items) stmt.run(c.cardApiId, c.name, c.setName, c.rarity, c.imageUrl, c.types, c.hp, c.artist, Date.now()); });

        let saved = 0;
        for (let page = 1; page <= totalPages; page++) {
            try {
                const res = await fetch(`${POKEMON_API}?pageSize=${PAGE_SIZE}&page=${page}`, { headers: getPokemonHeaders() });
                if (res.status === 429) {
                    console.log('🎴 Card cache: Rate limited, pause 60s...');
                    await sleep(60000);
                    page--; continue;
                }
                if (!res.ok) { await sleep(5000); page--; continue; }

                const json = await res.json();
                const cards = (json.data || []).filter(p => p.id && p.name).map(p => ({
                    cardApiId: p.id, name: p.name, setName: p.set?.name || 'Unknown',
                    rarity: p.rarity || 'Common', imageUrl: p.images?.large || p.images?.small || '',
                    types: (p.types || []).join('/'), hp: p.hp || '', artist: p.artist || '',
                }));
                batch(cards);
                saved += cards.length;

                // Log every 10 pages
                if (page % 10 === 0 || page === totalPages) {
                    const pct = Math.round((page / totalPages) * 100);
                    console.log(`🎴 Card cache: ${pct}% (${page}/${totalPages}) — ${saved.toLocaleString()} cards saved`);
                }

                await sleep(DELAY_PER_PAGE);
            } catch (e) {
                console.error(`🎴 Card cache page ${page} error:`, e.message);
                await sleep(10000);
                page--;
            }
        }

        const total = db.prepare('SELECT COUNT(*) as c FROM pokemon_card_cache').get().c;
        console.log(`🎴 Card cache: Pokemon selesai! ${total.toLocaleString()} cards ✅`);
    } catch (e) {
        console.error('🎴 Card cache Pokemon error:', e.message);
    }
}

// ==================== MAIN ====================
function startBackgroundPrefetch() {
    // Delay 10 seconds after bot start, then run in background
    setTimeout(async () => {
        console.log('🃏 Card cache: Background prefetch starting...');
        await prefetchOnePiece();
        await prefetchPokemon();
        console.log('🃏 Card cache: Background prefetch complete!');
    }, 10000);
}

module.exports = { startBackgroundPrefetch };
