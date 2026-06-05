// systems/farmWeather.js — Farm Weather System
// Random weather changes daily at 00:00 WIB. Affects all farm operations globally.

const { db } = require('../database');

// ==================== WEATHER TYPES ====================
const WEATHER_TYPES = [
    { id: 'sunny', name: 'Cerah', emoji: '☀️', color: '#F1C40F',
      effects: { yieldBonus: 0.10, growSpeed: 0, waterDecay: 1.2, deathChance: 0 },
      desc: '+10% hasil panen. Tanaman butuh lebih sering disiram.' },
    { id: 'rainy', name: 'Hujan', emoji: '🌧️', color: '#3498DB',
      effects: { yieldBonus: 0, growSpeed: 0.10, waterDecay: 0, deathChance: 0, autoWater: true },
      desc: 'Tanaman otomatis tersiram! +10% grow speed.' },
    { id: 'cloudy', name: 'Berawan', emoji: '☁️', color: '#95A5A6',
      effects: { yieldBonus: 0, growSpeed: 0, waterDecay: 0.8, deathChance: 0 },
      desc: 'Cuaca normal. Tanaman aman, water decay -20%.' },
    { id: 'stormy', name: 'Badai', emoji: '⛈️', color: '#8E44AD',
      effects: { yieldBonus: -0.10, growSpeed: -0.15, waterDecay: 0.5, deathChance: 0.08 },
      desc: '8% chance tanaman mati! -10% yield. Tapi water decay sangat rendah.' },
    { id: 'drought', name: 'Kemarau', emoji: '🏜️', color: '#E74C3C',
      effects: { yieldBonus: -0.05, growSpeed: -0.10, waterDecay: 2.0, deathChance: 0.03 },
      desc: 'Tanaman layu 2x lebih cepat! Siram lebih sering atau kehilangan tanaman.' },
    { id: 'windy', name: 'Berangin', emoji: '💨', color: '#1ABC9C',
      effects: { yieldBonus: 0.05, growSpeed: 0.05, waterDecay: 1.3, deathChance: 0 },
      desc: '+5% yield & grow speed. Water decay sedikit lebih cepat.' },
    { id: 'foggy', name: 'Berkabut', emoji: '🌫️', color: '#BDC3C7',
      effects: { yieldBonus: 0, growSpeed: -0.05, waterDecay: 0.6, deathChance: 0, mutationBonus: 0.05 },
      desc: 'Grow sedikit lambat. Tapi +5% mutation chance! Water decay rendah.' },
    { id: 'rainbow', name: 'Pelangi', emoji: '🌈', color: '#FF69B4',
      effects: { yieldBonus: 0.25, growSpeed: 0.15, waterDecay: 0.7, deathChance: 0, mutationBonus: 0.10 },
      desc: 'LANGKA! +25% yield, +15% grow speed, +10% mutation chance!' },
];

// Weather weights (rainbow is very rare)
const WEATHER_WEIGHTS = {
    sunny: 20,
    rainy: 20,
    cloudy: 25,
    stormy: 8,
    drought: 8,
    windy: 12,
    foggy: 5,
    rainbow: 2,  // 2% chance!
};

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS farm_weather (
    date TEXT PRIMARY KEY,
    weatherId TEXT,
    setAt INTEGER
)`);

db.exec(`CREATE TABLE IF NOT EXISTS farm_pests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    userId TEXT,
    plotId INTEGER,
    pestId TEXT,
    appliedAt INTEGER,
    resolved INTEGER DEFAULT 0
)`);

// ==================== GET TODAY'S WEATHER ====================
function getTodayWeather() {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    let row = db.prepare('SELECT * FROM farm_weather WHERE date = ?').get(today);

    if (!row) {
        // Generate new weather for today
        const weatherId = rollWeather();
        db.prepare('INSERT OR REPLACE INTO farm_weather (date, weatherId, setAt) VALUES (?, ?, ?)').run(today, weatherId, Date.now());
        row = { date: today, weatherId, setAt: Date.now() };
    }

    const weather = WEATHER_TYPES.find(w => w.id === row.weatherId) || WEATHER_TYPES[2]; // default cloudy
    return { ...weather, date: row.date };
}

// ==================== ROLL RANDOM WEATHER ====================
function rollWeather() {
    const totalWeight = Object.values(WEATHER_WEIGHTS).reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalWeight;

    for (const [id, weight] of Object.entries(WEATHER_WEIGHTS)) {
        roll -= weight;
        if (roll <= 0) return id;
    }
    return 'cloudy'; // fallback
}

// ==================== GET WEATHER EFFECTS ====================
function getWeatherEffects() {
    const weather = getTodayWeather();
    return weather.effects;
}

// ==================== GET WEATHER YIELD MULTIPLIER ====================
function getWeatherYieldMultiplier() {
    const effects = getWeatherEffects();
    return 1 + (effects.yieldBonus || 0);
}

// ==================== GET WEATHER GROW SPEED MULTIPLIER ====================
function getWeatherGrowMultiplier() {
    const effects = getWeatherEffects();
    return 1 - (effects.growSpeed || 0); // negative = faster (less time needed)
}

// ==================== GET WEATHER WATER DECAY MULTIPLIER ====================
function getWeatherWaterDecay() {
    const effects = getWeatherEffects();
    return effects.waterDecay || 1.0;
}

// ==================== GET WEATHER DEATH CHANCE ====================
function getWeatherDeathChance() {
    const effects = getWeatherEffects();
    return effects.deathChance || 0;
}

// ==================== GET WEATHER MUTATION BONUS ====================
function getWeatherMutationBonus() {
    const effects = getWeatherEffects();
    return effects.mutationBonus || 0;
}

// ==================== IS AUTO WATER (rainy) ====================
function isAutoWaterWeather() {
    const effects = getWeatherEffects();
    return effects.autoWater || false;
}

// ==================== GET WEATHER FORECAST (next 3 days - pre-generate) ====================
function getWeatherForecast() {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const forecast = [getTodayWeather()];

    // Tomorrow and day after (pre-generate if not exists)
    for (let i = 1; i <= 2; i++) {
        const date = new Date(Date.now() + i * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
        let row = db.prepare('SELECT * FROM farm_weather WHERE date = ?').get(date);
        if (!row) {
            const weatherId = rollWeather();
            db.prepare('INSERT OR REPLACE INTO farm_weather (date, weatherId, setAt) VALUES (?, ?, ?)').run(date, weatherId, Date.now());
            row = { date, weatherId };
        }
        const weather = WEATHER_TYPES.find(w => w.id === row.weatherId) || WEATHER_TYPES[2];
        forecast.push({ ...weather, date });
    }

    return forecast;
}

// ==================== FORMAT WEATHER DISPLAY ====================
function formatWeatherEmbed() {
    const weather = getTodayWeather();
    const forecast = getWeatherForecast();

    let desc = `${weather.emoji} **${weather.name}**\n`;
    desc += `> ${weather.desc}\n\n`;
    desc += `**📅 Forecast:**\n`;
    forecast.forEach((w, i) => {
        const label = i === 0 ? 'Hari ini' : i === 1 ? 'Besok' : 'Lusa';
        desc += `> ${w.emoji} **${label}:** ${w.name}\n`;
    });

    return { weather, desc };
}

// ==================== EXPORTS ====================
module.exports = {
    WEATHER_TYPES,
    getTodayWeather,
    getWeatherEffects,
    getWeatherYieldMultiplier,
    getWeatherGrowMultiplier,
    getWeatherWaterDecay,
    getWeatherDeathChance,
    getWeatherMutationBonus,
    isAutoWaterWeather,
    getWeatherForecast,
    formatWeatherEmbed,
    PEST_TYPES,
    WEATHER_PEST_MODIFIER,
    PEST_PROTECTION,
    rollPestAttack,
    getActivePests,
    applyPest,
    resolvePest,
    resolveAllPests,
    getPestHarvestEffect
};



// ==================== PEST/HAMA SYSTEM ====================
// Pests can attack crops randomly. Checked every tick (by reminder system).
// Some weather increases pest chance, some decreases it.

const PEST_TYPES = [
    { id: 'ulat', name: 'Ulat', emoji: '🐛', damage: 'yield', reduction: 0.30,
      chance: 0.08, desc: 'Memakan daun — yield -30% jika tidak ditangani' },
    { id: 'belalang', name: 'Belalang', emoji: '🦗', damage: 'yield', reduction: 0.50,
      chance: 0.05, desc: 'Menyerang gerombolan — yield -50%!' },
    { id: 'tikus', name: 'Tikus Sawah', emoji: '🐀', damage: 'death', reduction: 0,
      chance: 0.04, desc: 'Memakan akar — tanaman langsung MATI jika tidak ditangani' },
    { id: 'kutu', name: 'Kutu Daun', emoji: '🪲', damage: 'speed', reduction: 0.25,
      chance: 0.07, desc: 'Menghambat pertumbuhan — grow speed -25%' },
    { id: 'jamur', name: 'Jamur Parasit', emoji: '🍄', damage: 'spread', reduction: 0.20,
      chance: 0.03, desc: 'Menyebar ke tanaman sebelah — yield -20% semua plot!' },
    { id: 'burung', name: 'Burung Pemakan', emoji: '🐦', damage: 'steal', reduction: 0,
      chance: 0.06, desc: 'Mencuri hasil panen — kehilangan 1-3 item saat harvest' },
];

// Weather pest modifiers
const WEATHER_PEST_MODIFIER = {
    sunny: 1.0,       // normal
    rainy: 1.3,       // humid = more pests
    cloudy: 0.9,      // slightly less
    stormy: 0.5,      // storm scares pests away
    drought: 1.5,     // drought attracts desperate pests!
    windy: 0.7,       // wind blows pests away
    foggy: 1.2,       // foggy = pests hide easily
    rainbow: 0.3,     // rainbow = almost no pests
};

// Protection factors
const PEST_PROTECTION = {
    scarecrow: 0.50,     // scarecrow decoration = -50% pest chance
    bee_hive: 0.30,      // bee hive = -30% pest chance (bees protect)
    greenhouse: 0.80,    // greenhouse = -80% pest chance (almost immune!)
    pet_guard: 0.25,     // pet with event_luck bonus = -25% pest chance
};

// ==================== CHECK FOR PEST ATTACK ====================
function rollPestAttack(guildId, userId, plotId) {
    const weather = getTodayWeather();
    const weatherMod = WEATHER_PEST_MODIFIER[weather.id] || 1.0;

    // Check protections
    let protectionReduction = 0;
    try {
        const { getFarmDecorations } = require('../database');
        const decos = getFarmDecorations(guildId, userId);
        if (decos.some(d => d.decoId === 'scarecrow')) protectionReduction += PEST_PROTECTION.scarecrow;
        if (decos.some(d => d.decoId === 'bee_hive')) protectionReduction += PEST_PROTECTION.bee_hive;
        if (decos.some(d => d.decoId === 'greenhouse')) protectionReduction += PEST_PROTECTION.greenhouse;
    } catch(e) {}

    // Pet guard bonus
    try {
        const { getPetData } = require('./pets');
        const { PET_DATA } = require('../data/pets');
        const pet = getPetData(guildId, userId);
        if (pet) {
            const petDef = PET_DATA.find(p => p.id === pet.petId);
            if (petDef && petDef.bonus.type === 'event_luck') {
                protectionReduction += PEST_PROTECTION.pet_guard;
            }
        }
    } catch(e) {}

    // Cap protection at 90%
    protectionReduction = Math.min(0.90, protectionReduction);

    // Roll for each pest type
    for (const pest of PEST_TYPES) {
        const adjustedChance = pest.chance * weatherMod * (1 - protectionReduction);
        if (Math.random() < adjustedChance) {
            return pest; // This pest attacks!
        }
    }
    return null; // No pest
}

// ==================== GET ACTIVE PESTS ON PLOTS ====================
function getActivePests(guildId, userId) {
    try {
        return db.prepare('SELECT * FROM farm_pests WHERE guildId = ? AND userId = ? AND resolved = 0').all(guildId, userId);
    } catch(e) { return []; }
}

// ==================== APPLY PEST TO PLOT ====================
function applyPest(guildId, userId, plotId, pestId) {
    try {
        db.prepare('INSERT INTO farm_pests (guildId, userId, plotId, pestId, appliedAt) VALUES (?, ?, ?, ?, ?)').run(guildId, userId, plotId, pestId, Date.now());
    } catch(e) {}
}

// ==================== RESOLVE PEST (player handles it) ====================
function resolvePest(guildId, userId, pestRecordId) {
    try {
        db.prepare('UPDATE farm_pests SET resolved = 1 WHERE id = ? AND guildId = ? AND userId = ?').run(pestRecordId, guildId, userId);
        return true;
    } catch(e) { return false; }
}

// ==================== RESOLVE ALL PESTS ====================
function resolveAllPests(guildId, userId) {
    try {
        db.prepare('UPDATE farm_pests SET resolved = 1 WHERE guildId = ? AND userId = ? AND resolved = 0').run(guildId, userId);
        return true;
    } catch(e) { return false; }
}

// ==================== GET PEST EFFECT ON HARVEST ====================
// Returns modifier object: { yieldMult, stolenItems, deadPlots }
function getPestHarvestEffect(guildId, userId, plotId) {
    const pests = getActivePests(guildId, userId);
    const plotPests = pests.filter(p => p.plotId === plotId);
    
    let yieldMult = 1.0;
    let stolenItems = 0;
    let isDead = false;
    let spreadReduction = 0;

    for (const record of plotPests) {
        const pest = PEST_TYPES.find(p => p.id === record.pestId);
        if (!pest) continue;

        switch (pest.damage) {
            case 'yield':
                yieldMult -= pest.reduction;
                break;
            case 'death':
                isDead = true;
                break;
            case 'speed':
                // Already slowed during growth, no harvest effect
                break;
            case 'steal':
                stolenItems += Math.floor(Math.random() * 3) + 1;
                break;
            case 'spread':
                spreadReduction = pest.reduction;
                break;
        }
    }

    // Check for spread pests (affects ALL plots)
    const allPests = pests.filter(p => {
        const pest = PEST_TYPES.find(pt => pt.id === p.pestId);
        return pest && pest.damage === 'spread';
    });
    if (allPests.length > 0) {
        yieldMult -= spreadReduction;
    }

    return { yieldMult: Math.max(0.1, yieldMult), stolenItems, isDead };
}

// (exports already defined above with all pest functions included)
