// systems/fishingExtras.js — Contracts, Aquarium, Season, Rod Enchant, Bait Craft, Bestiary, Forecast, Co-op Giant, Perfect Cast
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { db, getOrCreateUser, getUserStat, setUserStat, incrementUserStat, addItem, removeItem, getItemCount, addIncome } = require('../database');
const { getRandomInt } = require('../utils');
const { FISH_DATA, FISH_TIERS, BAIT_TYPES, ROD_TYPES, FISHING_LOCATIONS, SEA_MONSTERS } = require('../data/fish');
const { getFishingWeather, FISHING_WEATHER } = require('./fishing');

// ==================== DB ====================
db.exec(`CREATE TABLE IF NOT EXISTS fishing_contracts (
    userId TEXT, date TEXT, data TEXT, PRIMARY KEY(userId, date)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS fishing_aquarium (
    userId TEXT, slot INTEGER, fishId TEXT, weight REAL, placedAt INTEGER,
    PRIMARY KEY(userId, slot)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS rod_enchants (
    userId TEXT, rodId TEXT, affix1 TEXT, affix2 TEXT, PRIMARY KEY(userId, rodId)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS fishing_season (
    id INTEGER PRIMARY KEY DEFAULT 1,
    seasonId TEXT, fishId TEXT, locationId TEXT, startedAt INTEGER
)`);
db.exec(`CREATE TABLE IF NOT EXISTS giant_coop (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giantFishId TEXT, locationId TEXT, hp INTEGER, maxHp INTEGER,
    hostId TEXT, channelId TEXT, guildId TEXT,
    startedAt INTEGER, expiresAt INTEGER, status TEXT DEFAULT 'active'
)`);
db.exec(`CREATE TABLE IF NOT EXISTS giant_coop_hits (
    coopId INTEGER, userId TEXT, hits INTEGER DEFAULT 0, PRIMARY KEY(coopId, userId)
)`);

// ==================== CONTRACTS ====================
const CONTRACT_POOL = [
    { id: 'catch_n', type: 'catch', target: 15, desc: 'Tangkap **15 ikan** (any)', reward: { money: 8000, bait: 'cacing', baitQty: 20 } },
    { id: 'catch_rare', type: 'tier', tier: 'Rare', target: 3, desc: 'Tangkap **3 Rare+**', reward: { money: 15000, item: 'rod_part', qty: 5 } },
    { id: 'trophy', type: 'trophy', target: 2, desc: 'Dapat **2 Trophy Catch**', reward: { money: 20000, bait: 'trophy_chum', baitQty: 5 } },
    { id: 'sell_n', type: 'sell', target: 25, desc: 'Jual **25 ikan**', reward: { money: 10000, item: 'mystery_box', qty: 2 } },
    { id: 'loc_cast', type: 'location', target: 20, desc: 'Cast **20x** di 1 lokasi (pilih sendiri)', reward: { money: 12000, item: 'refine_stone', qty: 3 } },
    { id: 'monster', type: 'monster', target: 3, desc: 'Hadapi **3 Sea Monster**', reward: { money: 18000, item: 'monster_repellent', qty: 1 } },
    { id: 'epic', type: 'tier', tier: 'Epic', target: 1, desc: 'Tangkap **1 Epic+**', reward: { money: 25000, bait: 'golden_worm', baitQty: 10 } },
    { id: 'combo', type: 'combo', target: 10, desc: 'Capai **combo 10**', reward: { money: 15000, item: 'lucky_charm', qty: 1 } },
];

function todayKey() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

function getContracts(userId) {
    const day = todayKey();
    let row = db.prepare('SELECT * FROM fishing_contracts WHERE userId = ? AND date = ?').get(userId, day);
    if (!row) {
        // Pick 3 unique contracts
        const shuffled = [...CONTRACT_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
        const data = shuffled.map(c => ({
            id: c.id, type: c.type, tier: c.tier || null, target: c.target,
            desc: c.desc, reward: c.reward, progress: 0, claimed: false,
        }));
        db.prepare('INSERT INTO fishing_contracts (userId, date, data) VALUES (?, ?, ?)').run(userId, day, JSON.stringify(data));
        return data;
    }
    return JSON.parse(row.data);
}

function saveContracts(userId, data) {
    db.prepare('UPDATE fishing_contracts SET data = ? WHERE userId = ? AND date = ?').run(JSON.stringify(data), userId, todayKey());
}

function bumpContract(userId, event) {
    // event: { type, tier?, locationId?, combo?, isTrophy?, sold? }
    try {
        const list = getContracts(userId);
        let changed = false;
        for (const c of list) {
            if (c.claimed || c.progress >= c.target) continue;
            if (c.type === 'catch' && event.type === 'catch') { c.progress++; changed = true; }
            else if (c.type === 'tier' && event.type === 'catch' && event.tier) {
                const order = ['Trash','Common','Uncommon','Rare','Epic','Legendary','Mythic','Secret','God'];
                if (order.indexOf(event.tier) >= order.indexOf(c.tier)) { c.progress++; changed = true; }
            }
            else if (c.type === 'trophy' && event.isTrophy) { c.progress++; changed = true; }
            else if (c.type === 'sell' && event.type === 'sell') { c.progress += event.sold || 1; changed = true; }
            else if (c.type === 'location' && event.type === 'catch') { c.progress++; changed = true; }
            else if (c.type === 'monster' && event.type === 'monster') { c.progress++; changed = true; }
            else if (c.type === 'combo' && event.combo && event.combo >= c.target && c.progress < c.target) {
                c.progress = c.target; changed = true;
            }
            if (c.progress > c.target) c.progress = c.target;
        }
        if (changed) saveContracts(userId, list);
    } catch (_) {}
}

function claimContract(guildId, userId, index) {
    const list = getContracts(userId);
    const c = list[index];
    if (!c) return { ok: false, msg: 'Contract tidak ada.' };
    if (c.claimed) return { ok: false, msg: 'Sudah diklaim.' };
    if (c.progress < c.target) return { ok: false, msg: 'Belum selesai.' };
    c.claimed = true;
    saveContracts(userId, list);
    const r = c.reward;
    if (r.money) {
        const u = getOrCreateUser(guildId, userId);
        u.balance += r.money;
        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(u.balance, guildId, userId);
        addIncome(guildId, userId, 'fishing', r.money);
    }
    if (r.item) addItem(guildId, userId, r.item, r.qty || 1);
    if (r.bait) {
        // add as bait count via inventory item if exists, else item
        addItem(guildId, userId, r.bait, r.baitQty || 1);
    }
    return { ok: true, contract: c };
}

function buildContractsPanel(guildId, userId) {
    const list = getContracts(userId);
    let desc = `📅 **Daily Fishing Contracts** (reset 00:00 WIB)\n\n`;
    list.forEach((c, i) => {
        const done = c.progress >= c.target;
        const status = c.claimed ? '✅ CLAIMED' : done ? '🎁 SIAP KLAIM' : `${c.progress}/${c.target}`;
        desc += `**${i + 1}.** ${c.desc}\n> Progress: **${status}**\n`;
        const rw = c.reward;
        desc += `> Reward: 🪙 ${(rw.money || 0).toLocaleString('id-ID')}`;
        if (rw.item) desc += ` + ${rw.item}×${rw.qty || 1}`;
        if (rw.bait) desc += ` + ${rw.bait}×${rw.baitQty || 1}`;
        desc += `\n\n`;
    });
    const embed = new EmbedBuilder().setTitle('📋 Fishing Contracts').setColor('#E67E22').setDescription(desc);
    const row = new ActionRowBuilder();
    list.forEach((c, i) => {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`fish_claim${i}_${userId}`)
                .setLabel(`Klaim #${i + 1}`)
                .setStyle(ButtonStyle.Success)
                .setDisabled(c.claimed || c.progress < c.target)
        );
    });
    const back = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fish_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row, back] };
}

// ==================== AQUARIUM ====================
const AQUA_SLOTS = 6;
const AQUA_BONUS = {
    Common: { fish_luck: 0.3 },
    Uncommon: { fish_luck: 0.5, money_chat: 0.2 },
    Rare: { fish_luck: 1, money_chat: 0.5 },
    Epic: { fish_luck: 1.5, sell_bonus: 0.5 },
    Legendary: { fish_luck: 2, sell_bonus: 1 },
    Mythic: { fish_luck: 3, drop_luck: 1 },
    Secret: { fish_luck: 4, drop_luck: 1.5 },
    God: { fish_luck: 5, all_reward: 1 },
};

function getAquarium(userId) {
    return db.prepare('SELECT * FROM fishing_aquarium WHERE userId = ? ORDER BY slot').all(userId);
}

function getAquariumBonuses(userId) {
    const rows = getAquarium(userId);
    const totals = { fish_luck: 0, money_chat: 0, sell_bonus: 0, drop_luck: 0, all_reward: 0 };
    for (const r of rows) {
        const def = FISH_DATA.find(f => f.id === r.fishId);
        if (!def) continue;
        const b = AQUA_BONUS[def.tier] || {};
        for (const [k, v] of Object.entries(b)) totals[k] = (totals[k] || 0) + v;
        // Trophy weight display fish get +50% of their bonus
        const tier = FISH_TIERS.find(t => t.tier === def.tier);
        if (tier && r.weight >= tier.minWeight + 0.9 * (tier.maxWeight - tier.minWeight)) {
            for (const [k, v] of Object.entries(b)) totals[k] = (totals[k] || 0) + v * 0.5;
        }
    }
    // Soft caps
    totals.fish_luck = Math.min(15, totals.fish_luck);
    totals.sell_bonus = Math.min(10, totals.sell_bonus);
    totals.drop_luck = Math.min(8, totals.drop_luck);
    totals.money_chat = Math.min(5, totals.money_chat);
    totals.all_reward = Math.min(3, totals.all_reward);
    return totals;
}

function placeAquarium(userId, slot, invId, guildId) {
    if (slot < 0 || slot >= AQUA_SLOTS) return { ok: false, msg: 'Slot invalid.' };
    const fish = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND userId = ?').get(invId, userId);
    if (!fish) return { ok: false, msg: 'Ikan tidak ada di inventory.' };
    // Remove from inventory (display only)
    db.prepare('DELETE FROM fish_inventory WHERE id = ?').run(invId);
    db.prepare('INSERT OR REPLACE INTO fishing_aquarium (userId, slot, fishId, weight, placedAt) VALUES (?, ?, ?, ?, ?)').run(
        userId, slot, fish.fishId, fish.weight, Date.now()
    );
    return { ok: true, fish };
}

function removeAquarium(userId, slot, guildId) {
    const row = db.prepare('SELECT * FROM fishing_aquarium WHERE userId = ? AND slot = ?').get(userId, slot);
    if (!row) return { ok: false, msg: 'Slot kosong.' };
    db.prepare('INSERT INTO fish_inventory (guildId, userId, fishId, weight, caughtAt, locked) VALUES (?, ?, ?, ?, ?, 1)')
        .run(guildId || 'global', userId, row.fishId, row.weight, Date.now());
    db.prepare('DELETE FROM fishing_aquarium WHERE userId = ? AND slot = ?').run(userId, slot);
    return { ok: true, row };
}

function buildAquariumPanel(guildId, userId) {
    const rows = getAquarium(userId);
    const bySlot = {};
    rows.forEach(r => { bySlot[r.slot] = r; });
    const bonuses = getAquariumBonuses(userId);
    let desc = `🐠 **Aquarium** — display max ${AQUA_SLOTS} ikan (tidak bisa dijual saat dipajang)\n\n`;
    for (let i = 0; i < AQUA_SLOTS; i++) {
        const r = bySlot[i];
        if (!r) { desc += `> **Slot ${i + 1}:** *kosong*\n`; continue; }
        const def = FISH_DATA.find(f => f.id === r.fishId);
        desc += `> **Slot ${i + 1}:** ${def ? def.emoji : '🐟'} **${def ? def.name : r.fishId}** (${r.weight}kg) *${def ? def.tier : '?'}*\n`;
    }
    desc += `\n**Bonus pasif aquarium:**\n`;
    desc += `> 🍀 fish_luck +**${bonuses.fish_luck.toFixed(1)}%**\n`;
    desc += `> 💰 sell_bonus +**${bonuses.sell_bonus.toFixed(1)}%**\n`;
    desc += `> 📦 drop_luck +**${bonuses.drop_luck.toFixed(1)}%**\n`;
    desc += `> 💬 money_chat +**${bonuses.money_chat.toFixed(1)}%**\n`;
    if (bonuses.all_reward) desc += `> ✨ all_reward +**${bonuses.all_reward.toFixed(1)}%**\n`;
    desc += `\n-# Isi: inventory → pilih ID ikan. Kosongkan: tombol Remove.`;

    const embed = new EmbedBuilder().setTitle('🐠 Aquarium').setColor('#3498DB').setDescription(desc);
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fish_aquaadd_${userId}`).setLabel('➕ Taruh Ikan').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`fish_aquarem_${userId}`).setLabel('➖ Ambil').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`fish_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row1] };
}

// ==================== SEASON ====================
const SEASON_POOL = [
    { fishId: 'orbit_koi', locationId: 'celestial_ocean', name: 'Orbit Koi Season' },
    { fishId: 'singularity_koi', locationId: 'astral_trench', name: 'Singularity Season' },
    { fishId: 'quasar_marlin', locationId: 'celestial_ocean', name: 'Quasar Hunt' },
    { fishId: 'abyss_pearl_fish', locationId: 'abyss', name: 'Pearl Festival' },
    { fishId: 'halo_tuna', locationId: 'god_realm', name: 'Halo Tide' },
    { fishId: 'ember_trout', locationId: 'volcano', name: 'Ember Run' },
    { fishId: 'crystal_smelt', locationId: 'ice_cave', name: 'Crystal Frost' },
];

function getMonthId() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

function getFishingSeason() {
    const month = getMonthId();
    let row = db.prepare('SELECT * FROM fishing_season WHERE id = 1').get();
    if (!row || row.seasonId !== month) {
        // Pick deterministic by month string hash
        let h = 0;
        for (let i = 0; i < month.length; i++) h = (h * 31 + month.charCodeAt(i)) >>> 0;
        const pick = SEASON_POOL[h % SEASON_POOL.length];
        db.prepare('INSERT OR REPLACE INTO fishing_season (id, seasonId, fishId, locationId, startedAt) VALUES (1, ?, ?, ?, ?)').run(
            month, pick.fishId, pick.locationId, Date.now()
        );
        row = { seasonId: month, fishId: pick.fishId, locationId: pick.locationId, startedAt: Date.now() };
    }
    const fish = FISH_DATA.find(f => f.id === row.fishId);
    const loc = FISHING_LOCATIONS.find(l => l.id === row.locationId);
    const name = SEASON_POOL.find(s => s.fishId === row.fishId)?.name || 'Fishing Season';
    return { ...row, fish, loc, name };
}

/** Season fish get +weight tilt and tracked for LB */
function applySeasonCatch(userId, fishId, weight) {
    const s = getFishingSeason();
    if (s.fishId !== fishId) return;
    const key = `fish_season_${s.seasonId}_heaviest`;
    const prev = getUserStat(null, userId, key) || 0;
    if (weight > prev) setUserStat(null, userId, key, Math.floor(weight * 1000) / 1000);
    incrementUserStat(null, userId, `fish_season_${s.seasonId}_count`);
}

function buildSeasonPanel(userId) {
    const s = getFishingSeason();
    const count = getUserStat(null, userId, `fish_season_${s.seasonId}_count`) || 0;
    const heavy = getUserStat(null, userId, `fish_season_${s.seasonId}_heaviest`) || 0;
    const embed = new EmbedBuilder()
        .setTitle(`🗓️ ${s.name}`)
        .setColor('#9B59B6')
        .setDescription(
            `**Musim:** \`${s.seasonId}\` (reset tiap bulan)\n\n` +
            `🎯 Target fish: ${s.fish ? s.fish.emoji + ' **' + s.fish.name + '**' : s.fishId} (*${s.fish ? s.fish.tier : '?'}*)\n` +
            `📍 Zona bonus: ${s.loc ? s.loc.name : s.locationId}\n` +
            `> Di zona ini: **+8% rare**, season fish **+weight tilt**\n\n` +
            `**Progress kamu:**\n` +
            `> Catch season fish: **${count}**\n` +
            `> Heaviest: **${heavy} kg**\n\n` +
            `-# Leaderboard heaviest diumumkan end of month (stat tersimpan).`
        );
    return {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary)
        )],
    };
}

// ==================== ROD ENCHANT ====================
const AFFIXES = [
    { id: 'trophy_hook', name: 'Trophy Hook', emoji: '🏆', desc: '+6% trophy tilt', cost: { refine_stone: 15, money: 50000 } },
    { id: 'monster_ward', name: 'Monster Ward', emoji: '🛡️', desc: '−8% monster chance', cost: { monster_scale: 5, money: 40000 } },
    { id: 'treasure_sense', name: 'Treasure Sense', emoji: '📦', desc: '+3% treasure chance', cost: { mystery_box: 5, money: 35000 } },
    { id: 'god_whisper', name: 'God Whisper', emoji: '👑', desc: 'Soft +God weight (rareBonus +4)', cost: { mythic_fragment: 1, money: 200000 } },
    { id: 'swift_line', name: 'Swift Line', emoji: '⚡', desc: 'CD −1s (min 1s)', cost: { rod_part: 20, money: 60000 } },
    { id: 'double_string', name: 'Double String', emoji: '🐟', desc: '+5% double catch chance', cost: { protection_stone: 3, money: 80000 } },
];

function getRodEnchants(userId, rodId) {
    if (!userId || !rodId) return { affix1: null, affix2: null };
    let row = db.prepare('SELECT * FROM rod_enchants WHERE userId = ? AND rodId = ?').get(userId, rodId);
    if (!row) return { affix1: null, affix2: null };
    return row;
}

function getEnchantEffects(userId, rodId) {
    const e = getRodEnchants(userId, rodId);
    const ids = [e.affix1, e.affix2].filter(Boolean);
    const fx = { trophy: 0, monster: 0, treasure: 0, rareBonus: 0, cdReduce: 0, doubleChance: 0 };
    for (const id of ids) {
        if (id === 'trophy_hook') fx.trophy += 6;
        if (id === 'monster_ward') fx.monster += 0.08;
        if (id === 'treasure_sense') fx.treasure += 0.03;
        if (id === 'god_whisper') fx.rareBonus += 4;
        if (id === 'swift_line') fx.cdReduce += 1;
        if (id === 'double_string') fx.doubleChance += 0.05;
    }
    return fx;
}

function setRodAffix(guildId, userId, rodId, slot, affixId) {
    const affix = AFFIXES.find(a => a.id === affixId);
    if (!affix) return { ok: false, msg: 'Affix invalid.' };
    // cost check
    for (const [item, qty] of Object.entries(affix.cost)) {
        if (item === 'money') {
            const u = getOrCreateUser(guildId, userId);
            if (u.balance < qty) return { ok: false, msg: `Butuh 🪙 ${qty.toLocaleString('id-ID')}` };
        } else if (getItemCount(guildId, userId, item) < qty) {
            return { ok: false, msg: `Butuh ${item} ×${qty}` };
        }
    }
    // pay
    for (const [item, qty] of Object.entries(affix.cost)) {
        if (item === 'money') {
            db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(qty, guildId, userId);
        } else removeItem(guildId, userId, item, qty);
    }
    const cur = getRodEnchants(userId, rodId);
    const col = slot === 2 ? 'affix2' : 'affix1';
    db.prepare(`INSERT INTO rod_enchants (userId, rodId, affix1, affix2) VALUES (?, ?, ?, ?)
        ON CONFLICT(userId, rodId) DO UPDATE SET ${col} = ?`).run(
        userId, rodId, slot === 1 ? affixId : (cur.affix1 || null), slot === 2 ? affixId : (cur.affix2 || null), affixId
    );
    return { ok: true, affix };
}

function buildEnchantPanel(guildId, userId) {
    const { getEquipment } = require('./fishing');
    const eq = getEquipment(guildId, userId);
    const rod = ROD_TYPES.find(r => r.id === eq.rod) || ROD_TYPES[0];
    const enc = getRodEnchants(userId, rod.id);
    const a1 = AFFIXES.find(a => a.id === enc.affix1);
    const a2 = AFFIXES.find(a => a.id === enc.affix2);
    let desc = `${rod.emoji} **${rod.name}**\n`;
    desc += `> Slot 1: ${a1 ? a1.emoji + ' **' + a1.name + '** — ' + a1.desc : '*kosong*'}\n`;
    desc += `> Slot 2: ${a2 ? a2.emoji + ' **' + a2.name + '** — ' + a2.desc : '*kosong*'}\n\n`;
    desc += `**Affix tersedia:**\n`;
    for (const a of AFFIXES) {
        const cost = Object.entries(a.cost).map(([k, v]) => k === 'money' ? `🪙${v.toLocaleString('id-ID')}` : `${k}×${v}`).join(', ');
        desc += `> ${a.emoji} **${a.name}** — ${a.desc}\n> -# Cost: ${cost}\n`;
    }
    const menu1 = new StringSelectMenuBuilder().setCustomId(`fish_ench1_${userId}`).setPlaceholder('⚡ Affix slot 1...').setMinValues(1).setMaxValues(1);
    const menu2 = new StringSelectMenuBuilder().setCustomId(`fish_ench2_${userId}`).setPlaceholder('⚡ Affix slot 2...').setMinValues(1).setMaxValues(1);
    AFFIXES.forEach(a => {
        menu1.addOptions({ label: a.name, value: a.id, description: a.desc.slice(0, 100), emoji: a.emoji });
        menu2.addOptions({ label: a.name, value: a.id, description: a.desc.slice(0, 100), emoji: a.emoji });
    });
    return {
        embeds: [new EmbedBuilder().setTitle('⚡ Rod Enchant').setColor('#F39C12').setDescription(desc)],
        components: [
            new ActionRowBuilder().addComponents(menu1),
            new ActionRowBuilder().addComponents(menu2),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fish_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary)),
        ],
    };
}

// ==================== BAIT CRAFT ====================
const BAIT_RECIPES = [
    { id: 'craft_cacing', name: 'Cacing ×10', result: 'cacing', qty: 10, cost: { money: 800 } },
    { id: 'craft_golden', name: 'Golden Worm ×5', result: 'golden_worm', qty: 5, ingredients: { mystery_box: 1 }, cost: { money: 10000 } },
    { id: 'craft_trophy', name: 'Trophy Chum ×3', result: 'trophy_chum', qty: 3, ingredients: { rod_part: 5, refine_stone: 3 }, cost: { money: 25000 } },
    { id: 'craft_prism', name: 'Prism Lure ×1', result: 'prism_lure', qty: 1, ingredients: { mythic_fragment: 1, protection_stone: 2 }, cost: { money: 80000 } },
    { id: 'craft_mystic', name: 'Mystic Bait ×5', result: 'mystic_bait', qty: 5, ingredients: { lucky_charm: 1 }, cost: { money: 30000 } },
    { id: 'craft_omega', name: 'Omega Bait ×1', result: 'omega_bait', qty: 1, ingredients: { awakening_crystal: 1, mythic_fragment: 2 }, cost: { money: 250000 } },
];

function craftBait(guildId, userId, recipeId) {
    const rec = BAIT_RECIPES.find(r => r.id === recipeId);
    if (!rec) return { ok: false, msg: 'Recipe invalid.' };
    const u = getOrCreateUser(guildId, userId);
    if (rec.cost?.money && u.balance < rec.cost.money) return { ok: false, msg: 'Money kurang.' };
    if (rec.ingredients) {
        for (const [item, qty] of Object.entries(rec.ingredients)) {
            if (getItemCount(guildId, userId, item) < qty) return { ok: false, msg: `Butuh ${item} ×${qty}` };
        }
    }
    if (rec.cost?.money) {
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(rec.cost.money, guildId, userId);
    }
    if (rec.ingredients) {
        for (const [item, qty] of Object.entries(rec.ingredients)) removeItem(guildId, userId, item, qty);
    }
    addItem(guildId, userId, rec.result, rec.qty);
    return { ok: true, rec };
}

function buildCraftPanel(userId) {
    let desc = `🧪 **Bait Crafting** — sink trash & material jadi umpan\n\n`;
    for (const r of BAIT_RECIPES) {
        const cost = [];
        if (r.cost?.money) cost.push(`🪙${r.cost.money.toLocaleString('id-ID')}`);
        if (r.ingredients) for (const [k, v] of Object.entries(r.ingredients)) cost.push(`${k}×${v}`);
        desc += `> **${r.name}** → \`${r.result}\` ×${r.qty}\n> -# ${cost.join(' + ')}\n`;
    }
    const menu = new StringSelectMenuBuilder().setCustomId(`fish_craft_select_${userId}`).setPlaceholder('🧪 Pilih recipe...').setMinValues(1).setMaxValues(1);
    BAIT_RECIPES.forEach(r => menu.addOptions({ label: r.name, value: r.id, description: `→ ${r.result} ×${r.qty}` }));
    return {
        embeds: [new EmbedBuilder().setTitle('🧪 Bait Craft').setColor('#1ABC9C').setDescription(desc)],
        components: [
            new ActionRowBuilder().addComponents(menu),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fish_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary)),
        ],
    };
}

// ==================== BESTIARY ====================
function buildBestiaryPanel(userId, page = 0) {
    const per = 8;
    const list = SEA_MONSTERS;
    const totalPages = Math.ceil(list.length / per) || 1;
    page = Math.max(0, Math.min(page, totalPages - 1));
    const slice = list.slice(page * per, page * per + per);
    let desc = `📕 **Sea Monster Bestiary** (hal ${page + 1}/${totalPages})\n\n`;
    for (const m of slice) {
        const kills = getUserStat(null, userId, `monster_kill_${m.id}`) || 0;
        const seen = getUserStat(null, userId, `monster_seen_${m.id}`) || 0;
        desc += `> ${m.emoji} **${m.name}** — \`${m.location}\`\n`;
        desc += `> -# Chance ${m.chance}% · ${m.damage} · Seen ${seen} · Survived/Fought ${kills}\n`;
        desc += `> -# *${m.desc}*\n\n`;
    }
    const totalSeen = list.filter(m => (getUserStat(null, userId, `monster_seen_${m.id}`) || 0) > 0).length;
    desc += `Progress: **${totalSeen}/${list.length}** monster dikenal\n`;
    if (totalSeen >= list.length) desc += `> 🏅 **Bestiary Complete!** (+title flex)`;

    const embed = new EmbedBuilder().setTitle('📕 Monster Bestiary').setColor('#8e44ad').setDescription(desc);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fish_bestp_${userId}_${page}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
        new ButtonBuilder().setCustomId(`fish_bestn_${userId}_${page}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
        new ButtonBuilder().setCustomId(`fish_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row] };
}

// ==================== WEATHER FORECAST ====================
function buildForecastPanel(userId) {
    const { weather, nextChange } = getFishingWeather();
    const mins = Math.max(0, Math.ceil((nextChange - Date.now()) / 60000));
    // Peek next weather (deterministic-ish from current + time) — not free full knowledge: show top 3 weights
    const sorted = [...FISHING_WEATHER].sort((a, b) => b.chance - a.chance).slice(0, 4);
    let desc = `**Cuaca sekarang (advanced loc):**\n`;
    desc += `> ${weather.emoji} **${weather.name}**\n> *${weather.desc}*\n> ⏳ Ganti dalam **${mins} menit**\n\n`;
    desc += `**Rotasi pool (bobot):**\n`;
    for (const w of sorted) {
        desc += `> ${w.emoji} ${w.name} — weight ${w.chance}\n`;
    }
    desc += `\n-# Cuaca mempengaruhi monster / rare / value di Celestial+ & Astral.`;
    return {
        embeds: [new EmbedBuilder().setTitle('🌤️ Fishing Forecast').setColor('#3498DB').setDescription(desc)],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_hub_${userId}`).setLabel('🔙 Hub').setStyle(ButtonStyle.Secondary)
        )],
    };
}

// ==================== PERFECT CAST (state) ====================
const perfectCastPending = new Map(); // userId -> { expires, bonus }

function startPerfectCast(userId) {
    // 2.5s window — player must click Perfect within window after cast prep
    const windowMs = 2500;
    const ideal = 0.45 + Math.random() * 0.2; // not used for timing precision — simplified: random success if click in window
    perfectCastPending.set(userId, { expires: Date.now() + windowMs, ideal });
    return windowMs;
}

function resolvePerfectCast(userId) {
    const p = perfectCastPending.get(userId);
    perfectCastPending.delete(userId);
    if (!p || Date.now() > p.expires) return { ok: false, bonus: 0 };
    // Success if clicked in window
    return { ok: true, bonus: 8 + getRandomInt(0, 7) }; // +8-15 rare tilt for this cast
}

function peekPerfectBonus(userId) {
    const p = perfectCastPending.get(userId);
    if (!p) return 0;
    return 0; // only applied when resolved mid-cast flow
}

// ==================== CO-OP GIANT ====================
const { GIANT_FISH } = require('./giantFish');

function startCoopGiant(guildId, channelId, hostId, locationId) {
    const pool = GIANT_FISH.filter(g => g.location === locationId);
    const giant = pool.length ? pool[Math.floor(Math.random() * pool.length)] : GIANT_FISH[Math.floor(Math.random() * GIANT_FISH.length)];
    const maxHp = 20 + (giant.hp || 3) * 8;
    const info = db.prepare(`INSERT INTO giant_coop (giantFishId, locationId, hp, maxHp, hostId, channelId, guildId, startedAt, expiresAt, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`).run(
        giant.id, giant.location, maxHp, maxHp, hostId, channelId, guildId, Date.now(), Date.now() + 5 * 60 * 1000
    );
    const coopId = info.lastInsertRowid;
    db.prepare('INSERT INTO giant_coop_hits (coopId, userId, hits) VALUES (?, ?, 0)').run(coopId, hostId);
    return { coopId, giant, maxHp };
}

function getActiveCoop(channelId) {
    return db.prepare(`SELECT * FROM giant_coop WHERE channelId = ? AND status = 'active' AND expiresAt > ? ORDER BY id DESC LIMIT 1`)
        .get(channelId, Date.now());
}

function hitCoopGiant(coopId, userId) {
    const coop = db.prepare('SELECT * FROM giant_coop WHERE id = ?').get(coopId);
    if (!coop || coop.status !== 'active') return { ok: false, msg: 'Co-op sudah selesai.' };
    if (Date.now() > coop.expiresAt) {
        db.prepare(`UPDATE giant_coop SET status = 'expired' WHERE id = ?`).run(coopId);
        return { ok: false, msg: 'Waktu habis.' };
    }
    db.prepare(`INSERT INTO giant_coop_hits (coopId, userId, hits) VALUES (?, ?, 1)
        ON CONFLICT(coopId, userId) DO UPDATE SET hits = hits + 1`).run(coopId, userId);
    const dmg = getRandomInt(1, 3);
    const newHp = Math.max(0, coop.hp - dmg);
    db.prepare('UPDATE giant_coop SET hp = ? WHERE id = ?').run(newHp, coopId);
    if (newHp <= 0) {
        db.prepare(`UPDATE giant_coop SET status = 'defeated' WHERE id = ?`).run(coopId);
        return { ok: true, defeated: true, dmg, giantId: coop.giantFishId, coop };
    }
    return { ok: true, defeated: false, dmg, hp: newHp, maxHp: coop.maxHp, giantId: coop.giantFishId };
}

function rewardCoop(guildId, coopId) {
    const hits = db.prepare('SELECT * FROM giant_coop_hits WHERE coopId = ? ORDER BY hits DESC').all(coopId);
    const coop = db.prepare('SELECT * FROM giant_coop WHERE id = ?').get(coopId);
    const giant = GIANT_FISH.find(g => g.id === coop.giantFishId);
    const results = [];
    for (const h of hits) {
        const share = Math.max(0.15, h.hits / Math.max(1, hits.reduce((s, x) => s + x.hits, 0)));
        const money = Math.floor(getRandomInt(giant?.minReward || 10000, giant?.maxReward || 20000) * share * 1.2);
        const u = getOrCreateUser(guildId, h.userId);
        u.balance += money;
        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(u.balance, guildId, h.userId);
        addIncome(guildId, h.userId, 'fishing', money);
        if (h.hits >= 3) addItem(guildId, h.userId, 'rod_part', 2);
        results.push({ userId: h.userId, hits: h.hits, money });
    }
    return results;
}

function buildCoopEmbed(coop, giant) {
    const barLen = 12;
    const filled = Math.ceil((coop.hp / coop.maxHp) * barLen);
    const bar = '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, barLen - filled));
    return new EmbedBuilder()
        .setTitle(`🐉 CO-OP GIANT — ${giant?.name || coop.giantFishId}`)
        .setColor('#E74C3C')
        .setDescription(
            `${giant?.emoji || '🐉'} *${giant?.desc || ''}*\n\n` +
            `HP: \`${bar}\` **${coop.hp}/${coop.maxHp}**\n` +
            `Lokasi: \`${coop.locationId}\`\n` +
            `Host: <@${coop.hostId}>\n` +
            `⏳ Berakhir <t:${Math.floor(coop.expiresAt / 1000)}:R>\n\n` +
            `Tekan **HIT** untuk serang! Loot split by contribution.`
        );
}

// ==================== HUB ====================
function buildFishingHub(guildId, userId, username) {
    const { getMastery, getMasteryBonuses, xpForRank } = require('./fishingMastery');
    const m = getMastery(userId);
    const b = getMasteryBonuses(userId);
    const s = getFishingSeason();
    const aqua = getAquariumBonuses(userId);
    const embed = new EmbedBuilder()
        .setTitle(`🎣 Fishing Hub — ${username}`)
        .setColor('#1ABC9C')
        .setDescription(
            `**Mastery Rank ${m.rank}** ${b.title || ''} · XP ${m.xp}/${xpForRank(m.rank)}\n` +
            `🗓️ Season: **${s.name}** (${s.fish ? s.fish.name : '?'})\n` +
            `🐠 Aquarium fish_luck +**${aqua.fish_luck.toFixed(1)}%**\n\n` +
            `Pilih fitur di bawah:`
        );
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fish_mastery_${userId}`).setLabel('Mastery').setEmoji('🏅').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fish_contracts_${userId}`).setLabel('Contracts').setEmoji('📋').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fish_aqua_${userId}`).setLabel('Aquarium').setEmoji('🐠').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`fish_season_${userId}`).setLabel('Season').setEmoji('🗓️').setStyle(ButtonStyle.Success),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fish_enchant_${userId}`).setLabel('Rod Enchant').setEmoji('⚡').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`fish_craft_${userId}`).setLabel('Bait Craft').setEmoji('🧪').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`fish_bestiary_${userId}`).setLabel('Bestiary').setEmoji('📕').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`fish_forecast_${userId}`).setLabel('Forecast').setEmoji('🌤️').setStyle(ButtonStyle.Secondary),
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fish_coop_${userId}`).setLabel('Co-op Giant').setEmoji('🐉').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`fish_pcast_${userId}`).setLabel('Perfect Cast').setEmoji('🎯').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('Panel').setEmoji('🎣').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = {
    // contracts
    getContracts, bumpContract, claimContract, buildContractsPanel,
    // aquarium
    AQUA_SLOTS, getAquarium, getAquariumBonuses, placeAquarium, removeAquarium, buildAquariumPanel,
    // season
    getFishingSeason, applySeasonCatch, buildSeasonPanel,
    // enchant
    AFFIXES, getRodEnchants, getEnchantEffects, setRodAffix, buildEnchantPanel,
    // craft
    BAIT_RECIPES, craftBait, buildCraftPanel,
    // bestiary / forecast
    buildBestiaryPanel, buildForecastPanel,
    // perfect cast
    startPerfectCast, resolvePerfectCast, perfectCastPending,
    // coop
    startCoopGiant, getActiveCoop, hitCoopGiant, rewardCoop, buildCoopEmbed,
    // hub
    buildFishingHub,
};
