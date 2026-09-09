// systems/togelPromo.js — ambient Togel promo drops (DISABLED)
//
// Ambient promo drops are permanently disabled per user configuration.

const state = require('../state');
const { getSetting } = require('../database');
const { buildTogelPromo } = require('./lottery');

const MESSAGES_PER_PROMO = 30;
const DEFAULT_GAP_MIN = 15;
const AUTO_DELETE_MS = 3 * 60 * 1000;

function isEnabled(guildId) {
    return false; // Permanently disabled
}

function gapMs(guildId) {
    return DEFAULT_GAP_MIN * 60 * 1000;
}

async function maybeDropTogelPromo(message, spam) {
    // Disabled: never drop promos into chat channels
    return;
}

module.exports = { maybeDropTogelPromo, isEnabled, MESSAGES_PER_PROMO, DEFAULT_GAP_MIN, AUTO_DELETE_MS };
