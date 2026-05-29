// systems/combo.js
const { db } = require('../database');

function getComboTracker(guildId, userId) {
    let row = db.prepare('SELECT * FROM combo_tracker WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!row) { db.prepare('INSERT INTO combo_tracker (guildId, userId) VALUES (?, ?)').run(guildId, userId); row = { features: '[]', lastAction: 0 }; }
    return row;
}

function addComboFeature(guildId, userId, feature) {
    const tracker = getComboTracker(guildId, userId);
    let features = JSON.parse(tracker.features || '[]');
    const now = Date.now();
    if (now - tracker.lastAction > 600000) features = [];
    if (!features.includes(feature)) features.push(feature);
    db.prepare('UPDATE combo_tracker SET features = ?, lastAction = ? WHERE guildId = ? AND userId = ?')
        .run(JSON.stringify(features), now, guildId, userId);
    return features.length;
}

function getComboMultiplier(guildId, userId) {
    const tracker = getComboTracker(guildId, userId);
    const features = JSON.parse(tracker.features || '[]');
    if (Date.now() - tracker.lastAction > 600000) return 1.0;
    if (features.length >= 5) return 2.0;
    if (features.length >= 3) return 1.5;
    return 1.0;
}

module.exports = { getComboTracker, addComboFeature, getComboMultiplier };
