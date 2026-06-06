// systems/cache.js — Tiny in-memory TTL cache
//
// For read-heavy, compute-expensive results that are identical across viewers
// and tolerate brief staleness (e.g. leaderboards, seasonal standings).
//
// API:
//   getOrCompute(key, ttlMs, computeFn)  -> cached value, or compute+store
//   get(key)                              -> value | undefined (respects TTL)
//   set(key, value, ttlMs)               -> store with expiry
//   invalidate(key)                      -> drop one key
//   invalidatePrefix(prefix)             -> drop all keys starting with prefix
//   clear()                              -> drop everything
//   size()                               -> entry count

const _store = new Map(); // key -> { value, expiry }

function get(key) {
    const hit = _store.get(key);
    if (!hit) return undefined;
    if (hit.expiry <= Date.now()) {
        _store.delete(key);
        return undefined;
    }
    return hit.value;
}

function set(key, value, ttlMs) {
    _store.set(key, { value, expiry: Date.now() + ttlMs });
    return value;
}

function getOrCompute(key, ttlMs, computeFn) {
    const cached = get(key);
    if (cached !== undefined) return cached;
    const value = computeFn();
    // Don't cache undefined (treated as "miss"); null/0/'' are fine to cache.
    if (value !== undefined) set(key, value, ttlMs);
    return value;
}

function invalidate(key) {
    _store.delete(key);
}

function invalidatePrefix(prefix) {
    for (const key of _store.keys()) {
        if (key.startsWith(prefix)) _store.delete(key);
    }
}

function clear() {
    _store.clear();
}

function size() {
    return _store.size;
}

// Periodic sweep of expired entries (unref'd so it never blocks shutdown).
const _sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of _store) {
        if (entry.expiry <= now) _store.delete(key);
    }
}, 5 * 60 * 1000);
if (typeof _sweep.unref === 'function') _sweep.unref();

module.exports = { get, set, getOrCompute, invalidate, invalidatePrefix, clear, size };
