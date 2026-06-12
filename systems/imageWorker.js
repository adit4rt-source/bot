// systems/imageWorker.js — Worker thread for offloading canvas rendering
// Runs in a separate thread so the main event loop stays responsive.
// Receives { type, params } messages and returns PNG Buffer results.
const { parentPort, workerData } = require('worker_threads');
const path = require('path');

// ---- Register fonts once per worker ----
const { GlobalFonts } = require('@napi-rs/canvas');
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
let FONTS_OK = false;
try {
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-Bold.ttf'), 'PoppinsBold');
    GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Poppins-SemiBold.ttf'), 'PoppinsSemiBold');
    FONTS_OK = true;
} catch (e) {
    // Fonts not available — renderers will fall back to sans-serif
}

// ---- Lazy-load renderer modules (each knows how to render its card type) ----
// We require them here so all canvas work happens inside the worker thread.
const renderers = {};
function getRenderer(type) {
    if (!renderers[type]) {
        switch (type) {
            case 'welcome':
                renderers[type] = require('./welcomeCard');
                break;
            case 'welcomeGlitch':
                renderers[type] = require('./welcomeCardGlitch');
                break;
            case 'welcomeRpg':
                renderers[type] = require('./welcomeCardRpg');
                break;
            case 'profile':
                renderers[type] = require('./profileCard');
                break;
            case 'gacha':
            case 'gallery':
                renderers[type] = require('./cardGame');
                break;
            default:
                throw new Error(`Unknown render type: ${type}`);
        }
    }
    return renderers[type];
}

// ---- Map type → function name ----
const TYPE_TO_FN = {
    welcome:       'generateCard',
    welcomeGlitch: 'generateGlitchCard',
    welcomeRpg:    'generateRpgCard',
    profile:       'generateProfileCard',
    gacha:         'generateCardImage',   // alias for generateGachaImage
    gallery:       'generateGalleryImage',
};

// ---- Message handler ----
parentPort.on('message', async (msg) => {
    const { id, type, params } = msg;
    try {
        const renderer = getRenderer(type);
        const fnName = TYPE_TO_FN[type];
        if (!renderer[fnName]) {
            throw new Error(`Renderer function "${fnName}" not found for type "${type}"`);
        }
        const buffer = await renderer[fnName](params);
        parentPort.postMessage({ id, buffer, error: null }, [buffer.buffer]);
    } catch (e) {
        parentPort.postMessage({ id, buffer: null, error: e.message });
    }
});

// Signal ready
parentPort.postMessage({ ready: true });
