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
    formatWeatherEmbed
};
