// systems/panelRefresh.js — periodic auto-refresh for time-progress panels.
//
// A "panel" here is a Discord message that shows live progress (crops growing,
// livestock producing). While a panel is registered, a single background ticker
// re-renders it and edits the message in place, so the progress bars advance
// without the user having to click 🔄.
//
// Registration is keyed by messageId. Because a button click edits the SAME
// message in place, navigating that message to a non-progress view (hub, shop,
// stats, …) must un-register it — otherwise the ticker would clobber the new
// view. Callers therefore untrack() on every handler entry and track() again
// only when the message lands on a progress panel.

const REFRESH_MS = 30 * 1000;    // how often progress panels are re-rendered
const TTL_MS = 10 * 60 * 1000;   // stop auto-refreshing a panel 10 min after the last interaction
const MAX_PANELS = 300;          // safety cap so the registry can't grow unbounded

const registry = new Map();      // messageId -> { message, build, expiresAt }
let timer = null;

// Register (or refresh the TTL of) a panel message. `build` is a zero-arg closure
// that returns a fresh message payload ({ embeds, components }) for the panel.
function track(message, build) {
    if (!message || !message.id || typeof build !== 'function') return;
    if (registry.size >= MAX_PANELS && !registry.has(message.id)) {
        const oldest = registry.keys().next().value; // Map preserves insertion order
        if (oldest) registry.delete(oldest);
    }
    registry.set(message.id, { message, build, expiresAt: Date.now() + TTL_MS });
}

function untrack(messageId) {
    if (messageId) registry.delete(messageId);
}

async function tick() {
    const now = Date.now();
    for (const [id, entry] of registry) {
        if (now > entry.expiresAt) { registry.delete(id); continue; }
        let payload;
        try { payload = entry.build(); }
        catch (e) { registry.delete(id); continue; }       // builder broke — drop it
        try { await entry.message.edit(payload); }
        catch (e) { registry.delete(id); }                 // message deleted / not editable
    }
}

// Start the background ticker. Safe to call once at boot; repeated calls are no-ops.
function start() {
    if (timer) return timer;
    timer = setInterval(() => { tick().catch(() => {}); }, REFRESH_MS);
    if (timer.unref) timer.unref();                        // never keep the process alive on its own
    return timer;
}

module.exports = { track, untrack, start, tick, _registry: registry, REFRESH_MS, TTL_MS };
