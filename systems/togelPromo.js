// systems/togelPromo.js — ambient Togel promo drops.
//
// Goal: make the Togel mini-lotere more visible WITHOUT looking like spam.
// It surfaces an eye-catching promo card in whichever channel is currently
// active — exactly like the chat mini-events — but is gated by BOTH:
//   1) an active-message threshold (only after real conversation), and
//   2) a per-guild cooldown (a busy server still gets at most one drop / gap).
// The card also auto-deletes after a few minutes so it never clutters a channel.
//
// Admin controls (server_settings):
//   togel_promo_enabled  '1' (default) | '0' to turn it off
//   togel_promo_gap_min  minutes between drops per guild (default 60)

const state = require('../state');
const { getSetting } = require('../database');
const { buildTogelPromo } = require('./lottery');

const MESSAGES_PER_PROMO = 30;        // ~non-spam messages between candidate drops (was 140)
const DEFAULT_GAP_MIN = 15;           // minimum minutes between drops per guild (was 60)
const AUTO_DELETE_MS = 3 * 60 * 1000; // remove the card after 3 minutes (was 5)

function isEnabled(guildId) {
    return getSetting(guildId, 'togel_promo_enabled', '1') !== '0';
}

function gapMs(guildId) {
    const v = parseInt(getSetting(guildId, 'togel_promo_gap_min', String(DEFAULT_GAP_MIN)), 10);
    return (Number.isFinite(v) && v > 0 ? v : DEFAULT_GAP_MIN) * 60 * 1000;
}

// Called from messageCreate for every (non-bot, in-guild) message. `spam` is the
// anti-spam verdict already computed there, so low-effort/duplicate chatter never
// counts toward — or triggers — a promo. Fire-and-forget; never throws.
async function maybeDropTogelPromo(message, spam) {
    try {
        if (spam || message.author.bot || !message.guild) return;
        const guildId = message.guild.id;
        if (!isEnabled(guildId)) return;
        // Don't stack on top of an active chat mini-event in this guild.
        if (state.activeMiniEvents.has(guildId)) return;

        const count = (state.togelPromoCounters.get(guildId) || 0) + 1;
        if (count < MESSAGES_PER_PROMO) { state.togelPromoCounters.set(guildId, count); return; }

        // Threshold reached — hold here until the per-guild cooldown elapses.
        const until = state.togelPromoCooldown.get(guildId) || 0;
        if (Date.now() < until) { state.togelPromoCounters.set(guildId, MESSAGES_PER_PROMO); return; }

        // Arm cooldown + reset counter BEFORE the async send so concurrent messages
        // can't double-fire a drop.
        state.togelPromoCounters.set(guildId, 0);
        state.togelPromoCooldown.set(guildId, Date.now() + gapMs(guildId));

        const payload = buildTogelPromo(guildId);
        const sent = await message.channel.send(payload).catch(() => null);
        if (sent) setTimeout(() => { sent.delete().catch(() => {}); }, AUTO_DELETE_MS);
    } catch (_) { /* must never break message handling */ }
}

module.exports = { maybeDropTogelPromo, isEnabled, MESSAGES_PER_PROMO, DEFAULT_GAP_MIN, AUTO_DELETE_MS };
