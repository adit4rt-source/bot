// systems/cooldowns.js — Centralized cooldown manager
//
// Replaces the ad-hoc pattern of reusing the shared `fishCooldowns` Map for every
// cooldown type (fishing, slot, roulette, pet play, dungeon, battle, passive timers…).
// That Map was never pruned, so it grew unbounded for the life of the process.
//
// This module provides a single, self-cleaning store with a small typed API.
// Keys are namespaced as `${type}:${guildId}:${userId}` so different features never
// collide, and expired entries are swept periodically to bound memory.
//
// API:
//   isOnCooldown(type, guildId, userId)        -> boolean
//   getRemaining(type, guildId, userId)        -> ms remaining (0 if none)
//   getRemainingSec(type, guildId, userId)     -> seconds remaining, rounded up
//   setCooldown(type, guildId, userId, ms)     -> sets expiry now+ms
//   check(type, guildId, userId, ms)           -> if free: set & return {ok:true};
//                                                 else return {ok:false, remainingMs, remainingSec}
//   clear(type, guildId, userId)               -> remove a single cooldown
//   clearAllForUser(guildId, userId)           -> remove all cooldowns for a user
//   size()                                     -> current number of tracked entries
//
// `guildId` may be null (e.g. GLOBAL mode); it is only used to build the key.

const _store = new Map(); // key -> expiryTimestampMs

function _key(type, guildId, userId) {
    return `${type}:${guildId || 'g'}:${userId}`;
}

function getRemaining(type, guildId, userId) {
    const expiry = _store.get(_key(type, guildId, userId));
    if (!expiry) return 0;
    const remaining = expiry - Date.now();
    if (remaining <= 0) {
        _store.delete(_key(type, guildId, userId)); // opportunistic cleanup
        return 0;
    }
    return remaining;
}

function getRemainingSec(type, guildId, userId) {
    return Math.ceil(getRemaining(type, guildId, userId) / 1000);
}

function isOnCooldown(type, guildId, userId) {
    return getRemaining(type, guildId, userId) > 0;
}

function setCooldown(type, guildId, userId, ms) {
    _store.set(_key(type, guildId, userId), Date.now() + ms);
}

/**
 * Atomic "check-and-set". If the user is free, sets the cooldown and returns
 * { ok: true }. Otherwise returns { ok: false, remainingMs, remainingSec }.
 * This is the recommended entry point for command/button handlers.
 */
function check(type, guildId, userId, ms) {
    const remainingMs = getRemaining(type, guildId, userId);
    if (remainingMs > 0) {
        return { ok: false, remainingMs, remainingSec: Math.ceil(remainingMs / 1000) };
    }
    setCooldown(type, guildId, userId, ms);
    return { ok: true };
}

function clear(type, guildId, userId) {
    _store.delete(_key(type, guildId, userId));
}

function clearAllForUser(guildId, userId) {
    const suffix = `:${guildId || 'g'}:${userId}`;
    for (const key of _store.keys()) {
        if (key.endsWith(suffix)) _store.delete(key);
    }
}

function size() {
    return _store.size;
}

// ==================== AUTO-CLEANUP ====================
// Periodically sweep expired entries so the store never grows unbounded.
// Runs every 5 minutes; unref() so it never keeps the process alive on shutdown.
function sweepExpired() {
    const now = Date.now();
    let removed = 0;
    for (const [key, expiry] of _store) {
        if (expiry <= now) { _store.delete(key); removed++; }
    }
    // Also sweep the legacy shared `fishCooldowns` Map. Many features still write
    // timestamp entries there and never delete them, so without this it grows for
    // the life of the process. Safe: entries are `key -> expiryMs`.
    try {
        const state = require('../state');
        if (state && state.fishCooldowns instanceof Map) {
            for (const [key, expiry] of state.fishCooldowns) {
                if (typeof expiry === 'number' && expiry <= now) {
                    state.fishCooldowns.delete(key);
                    removed++;
                }
            }
        }
    } catch (e) { /* state not loadable — ignore */ }
    return removed;
}

const _sweepTimer = setInterval(sweepExpired, 5 * 60 * 1000);
if (typeof _sweepTimer.unref === 'function') _sweepTimer.unref();

module.exports = {
    isOnCooldown,
    getRemaining,
    getRemainingSec,
    setCooldown,
    check,
    clear,
    clearAllForUser,
    size,
    sweepExpired,
};
