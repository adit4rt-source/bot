// systems/imageRenderer.js — Drop-in replacement for direct canvas calls
// Wraps all image generation behind the worker pool (imagePool.js).
// Callers import this module instead of the individual card modules.
//
// Usage:
//   const { generateCard, generateProfileCard, ... } = require('./imageRenderer');
//   // Works exactly like before, but runs in a worker thread!

const { renderImage } = require('./imagePool');

// ---- Welcome Cards ----
async function generateCard(opts) {
    return renderImage('welcome', opts);
}

async function generateGlitchCard(opts) {
    return renderImage('welcomeGlitch', opts);
}

async function generateRpgCard(opts) {
    return renderImage('welcomeRpg', opts);
}

// ---- Profile Card ----
async function generateProfileCard(opts) {
    return renderImage('profile', opts);
}

// ---- Card Game Images ----
async function generateCardImage(cards) {
    return renderImage('gacha', cards);
}

async function generateGalleryImage(cards) {
    return renderImage('gallery', cards);
}

module.exports = {
    generateCard,
    generateGlitchCard,
    generateRpgCard,
    generateProfileCard,
    generateCardImage,
    generateGalleryImage,
    // Re-export pool utilities
    ...require('./imagePool'),
};
