// systems/miningPanel.js — Mining System Panel (Phase 1 MVP)
// Loop: Dig (kelola stamina) -> kumpul Ore -> Descend lebih dalam -> jual / upgrade pickaxe.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { db, getOrCreateUser, incrementUserStat, getUserStat, addIncome, addItem } = require('../database');
const { getRandomInt } = require('../utils');
const ui = require('./ui');
const { getPetData, simulateBattle, ELEMENT_EMOJI } = require('./pets');
const { hasAbility } = require('./petAbilities');
const { checkAchievements } = require('./achievements');
const { updateQuestProgress } = require('./quests');
const { PET_DATA } = require('../data/pets');
const {
    PICKAXE_TYPES, ORE_TIERS, MINE_LAYERS, BARS, SMELT_RECIPES, SMITH_RECIPES, FUEL_ORE,
    SUPPLIES, HAZARD_WEIGHTS, getMonsterStats,
    GEMS, GEM_WEIGHTS, GEM_DROP_BASE, STAR_CONTRIB, socketSlots,
    CORE_DEPTH, CORE_STAMINA, ARTIFACT_BONUS, PRESTIGE_BONUS, getCoreBoss, CORE_RECIPES,
    STAMINA_REGEN_MS, staminaRefillCostPerPoint, STAMINA_BASE, STAMINA_PER_LEVEL, DESCEND_STEP, MAX_MINING_LEVEL,
    getMiningExpNeeded, staminaRegenPerMin, getLayerForDepth, getPickaxe, getOreDef, getMaterialDef,
} = require('../data/mining');

// ==================== DB ====================
db.exec(`CREATE TABLE IF NOT EXISTS mining_data (
    guildId TEXT, userId TEXT,
    level INTEGER DEFAULT 1, exp INTEGER DEFAULT 0,
    pickaxe TEXT DEFAULT 'wood',
    depth INTEGER DEFAULT 0,
    stamina INTEGER DEFAULT 100,
    staminaTs INTEGER DEFAULT 0,
    prestige INTEGER DEFAULT 0,
    totalDigs INTEGER DEFAULT 0,
    PRIMARY KEY(guildId, userId)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS ore_inventory (
    guildId TEXT, userId TEXT, oreId TEXT, quantity INTEGER DEFAULT 0,
    PRIMARY KEY(guildId, userId, oreId)
)`);
// Migrasi kolom baru (aman untuk DB lama)
try { db.exec(`ALTER TABLE mining_data ADD COLUMN sockets TEXT DEFAULT '[]'`); } catch (e) {}
try { db.exec(`ALTER TABLE mining_data ADD COLUMN artifact INTEGER DEFAULT 0`); } catch (e) {}

// ==================== HELPERS ====================
function maxStamina(level) { return STAMINA_BASE + (level - 1) * STAMINA_PER_LEVEL; }

// Hitung regen stamina berbasis waktu, mutasi objek row (belum disimpan ke DB).
function syncStamina(row) {
    const max = maxStamina(row.level);
    const now = Date.now();
    if (!row.staminaTs) row.staminaTs = now;
    if (row.stamina >= max) { row.stamina = max; row.staminaTs = now; return row; }
    const perMin = staminaRegenPerMin(row.level);
    const minutes = Math.floor((now - row.staminaTs) / STAMINA_REGEN_MS);
    if (minutes > 0) {
        const regen = minutes * perMin;
        row.stamina = Math.min(max, row.stamina + regen);
        row.staminaTs = row.stamina >= max ? now : row.staminaTs + minutes * STAMINA_REGEN_MS;
    }
    return row;
}

function getMiningData(guildId, userId) {
    let row = db.prepare('SELECT * FROM mining_data WHERE guildId = ? AND userId = ?').get(guildId, userId);
    if (!row) {
        db.prepare('INSERT INTO mining_data (guildId, userId, level, exp, pickaxe, depth, stamina, staminaTs) VALUES (?, ?, 1, 0, ?, 0, ?, ?)')
            .run(guildId, userId, 'wood', STAMINA_BASE, Date.now());
        row = db.prepare('SELECT * FROM mining_data WHERE guildId = ? AND userId = ?').get(guildId, userId);
    }
    syncStamina(row);
    return row;
}

function saveMiningData(guildId, userId, row) {
    db.prepare('UPDATE mining_data SET level = ?, exp = ?, pickaxe = ?, depth = ?, stamina = ?, staminaTs = ?, prestige = ?, totalDigs = ? WHERE guildId = ? AND userId = ?')
        .run(row.level, row.exp, row.pickaxe, row.depth, row.stamina, row.staminaTs, row.prestige, row.totalDigs, guildId, userId);
}

function addOre(guildId, userId, oreId, qty) {
    // Pola get-then-update (hindari ON CONFLICT yang gagal match saat guildId NULL di global mode)
    const existing = db.prepare('SELECT quantity FROM ore_inventory WHERE guildId = ? AND userId = ? AND oreId = ?').get(guildId, userId, oreId);
    if (existing) {
        db.prepare('UPDATE ore_inventory SET quantity = quantity + ? WHERE guildId = ? AND userId = ? AND oreId = ?').run(qty, guildId, userId, oreId);
    } else {
        db.prepare('INSERT INTO ore_inventory (guildId, userId, oreId, quantity) VALUES (?, ?, ?, ?)').run(guildId, userId, oreId, qty);
    }
}

function getOres(guildId, userId) {
    return db.prepare('SELECT * FROM ore_inventory WHERE guildId = ? AND userId = ? AND quantity > 0').all(guildId, userId);
}

function getMatCount(guildId, userId, id) {
    const r = db.prepare('SELECT quantity FROM ore_inventory WHERE guildId = ? AND userId = ? AND oreId = ?').get(guildId, userId, id);
    return r ? r.quantity : 0;
}

function removeMat(guildId, userId, id, qty) {
    db.prepare('UPDATE ore_inventory SET quantity = quantity - ? WHERE guildId = ? AND userId = ? AND oreId = ?').run(qty, guildId, userId, id);
    db.prepare('DELETE FROM ore_inventory WHERE guildId = ? AND userId = ? AND oreId = ? AND quantity <= 0').run(guildId, userId, id);
}

const ORE_IDS = new Set(ORE_TIERS.map(o => o.id));
const BAR_IDS = new Set(BARS.map(b => b.id));
const GEM_IDS = new Set(GEMS.map(g => g.id));

function getSockets(row) {
    try { return JSON.parse(row.sockets || '[]'); } catch (e) { return []; }
}
function saveSockets(guildId, userId, arr) {
    db.prepare('UPDATE mining_data SET sockets = ? WHERE guildId = ? AND userId = ?').run(JSON.stringify(arr), guildId, userId);
}
// Total bonus dari gem ter-socket untuk stat tertentu (Star Gem 'all' ikut menyumbang)
function socketBonus(sockets, stat) {
    let total = 0;
    for (const id of sockets) {
        const g = GEMS.find(x => x.id === id);
        if (!g) continue;
        if (g.stat === stat) total += g.power;
        else if (g.stat === 'all') total += (STAR_CONTRIB[stat] || 0);
    }
    return total;
}
function pickGem() {
    const total = Object.values(GEM_WEIGHTS).reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (const [id, w] of Object.entries(GEM_WEIGHTS)) { if ((r -= w) < 0) return id; }
    return 'gem_ruby';
}

function pickOre(layer) {
    const total = layer.ores.reduce((s, o) => s + o.w, 0);
    let r = Math.random() * total;
    for (const o of layer.ores) { if ((r -= o.w) < 0) return o.ore; }
    return layer.ores[0].ore;
}

// Tambah mining exp + handle level up. Return { leveledUp, newLevel }.
function addMiningExp(row, amount) {
    let leveledUp = false;
    if (row.level >= MAX_MINING_LEVEL) { row.exp = 0; return { leveledUp, newLevel: row.level }; }
    row.exp += amount;
    let need = getMiningExpNeeded(row.level);
    while (row.exp >= need && row.level < MAX_MINING_LEVEL) {
        row.exp -= need;
        row.level++;
        leveledUp = true;
        need = getMiningExpNeeded(row.level);
    }
    if (row.level >= MAX_MINING_LEVEL) row.exp = 0;
    return { leveledUp, newLevel: row.level };
}

function bar(pct, len = 10) {
    const filled = Math.max(0, Math.min(len, Math.round((pct / 100) * len)));
    return '▰'.repeat(filled) + '░'.repeat(len - filled);
}

function staminaETA(row) {
    const max = maxStamina(row.level);
    if (row.stamina >= max) return null;
    const msLeft = STAMINA_REGEN_MS - ((Date.now() - row.staminaTs) % STAMINA_REGEN_MS);
    return Math.ceil(msLeft / 1000);
}

// ==================== BUILD MAIN PANEL ====================
function buildMiningPanel(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);
    const row = getMiningData(guildId, userId);
    saveMiningData(guildId, userId, row); // persist regen
    const pickaxe = getPickaxe(row.pickaxe);
    const layer = getLayerForDepth(row.depth);
    const max = maxStamina(row.level);
    const expNeed = getMiningExpNeeded(row.level);
    const staPct = Math.floor((row.stamina / max) * 100);
    const expPct = row.level >= MAX_MINING_LEVEL ? 100 : Math.floor((row.exp / expNeed) * 100);

    const orePreview = layer.ores.map(o => getOreDef(o.ore).emoji).join(' ');
    const atMaxDepth = row.depth + DESCEND_STEP > pickaxe.maxDepth;
    const hazardPct = Math.round((layer.hazard || 0) * 100);
    const beams = getMatCount(guildId, userId, 'beam');
    const masks = getMatCount(guildId, userId, 'gasmask');
    const slots = socketSlots(pickaxe.tier);
    const socketed = getSockets(row);
    const socketStr = slots > 0 ? socketed.map(id => (GEMS.find(g => g.id === id) || {}).emoji || '◻️').concat(Array(Math.max(0, slots - socketed.length)).fill('▫️')).join('') : '';

    const embed = new EmbedBuilder()
        .setColor(ui.COLORS && ui.COLORS.economy ? ui.COLORS.economy : '#C9A227')
        .setTitle(`⛏️ TAMBANG — ${username}`)
        .setDescription(
            `${pickaxe.emoji} **${pickaxe.name}** · Tier ${pickaxe.tier}${row.prestige > 0 ? ` · ⭐ Prestige ${row.prestige}` : ''}${row.artifact ? ' · 🏺' : ''}\n` +
            (slots > 0 ? `> 💎 Socket: ${socketStr || '—'}\n` : '') +
            `\n**⚒️ Mining Lv.${row.level}**  ${row.level >= MAX_MINING_LEVEL ? '🏆 MAX' : ''}\n` +
            `> \`${bar(expPct)}\` ${row.level >= MAX_MINING_LEVEL ? '' : `${row.exp}/${expNeed} EXP`}\n` +
            `**⚡ Stamina ${row.stamina}/${max}**\n` +
            `> \`${bar(staPct)}\` ${row.stamina < max ? `+${staminaRegenPerMin(row.level)}/menit` : '🔋 penuh!'}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📍 **Kedalaman ${row.depth}m** — ${layer.name}\n` +
            `> ⛰️ Ore di sini: ${orePreview}\n` +
            `> ⛏️ Sekali gali: **${pickaxe.staminaCost}** stamina\n` +
            (hazardPct > 0 ? `> ☠️ Bahaya: **${hazardPct}%** (🪨/🟢/👹${ELEMENT_EMOJI[layer.mElement] || ''}) · bekal 🪵${beams} 😷${masks}\n` : `> ✅ Aman dari bahaya\n`) +
            `> 🕳️ Batas pickaxe: **${pickaxe.maxDepth}m**${atMaxDepth ? ' ⚠️ *upgrade dulu*' : ''}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `> ${ui.money(userData.balance)}`
        )
        .setFooter({ text: '⛏️ Dig = gali (pakai stamina) · ⬇️ Descend = makin dalam, ore makin langka' });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mine_dig_${userId}`).setLabel('⛏️ Dig').setStyle(ButtonStyle.Success).setDisabled(row.stamina < pickaxe.staminaCost),
        new ButtonBuilder().setCustomId(`mine_descend_${userId}`).setLabel('⬇️ Descend').setStyle(ButtonStyle.Primary).setDisabled(atMaxDepth),
        new ButtonBuilder().setCustomId(`mine_surface_${userId}`).setLabel('⬆️ Surface').setStyle(ButtonStyle.Secondary).setDisabled(row.depth === 0),
        new ButtonBuilder().setCustomId(`mine_refresh_${userId}`).setLabel('🔄').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mine_ores_${userId}`).setLabel('🎒 Ores').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`mine_smelt_${userId}`).setLabel('🔥 Smelt').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`mine_smith_${userId}`).setLabel('🔨 Smith').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`mine_gems_${userId}`).setLabel('💎 Gems').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`mine_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mine_leaderboard_${userId}`).setLabel('🏆 Top Miners').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`mine_core_${userId}`).setLabel('👑 The Core').setStyle(ButtonStyle.Danger).setDisabled(row.depth < CORE_DEPTH || row.stamina < CORE_STAMINA),
        new ButtonBuilder().setCustomId(`mine_prestige_${userId}`).setLabel('⭐ Prestige').setStyle(ButtonStyle.Success).setDisabled(row.level < MAX_MINING_LEVEL)
    );
    return { embeds: [embed], components: [row1, row2, row3] };
}

// ==================== BUILD ORES (inventory) ====================
function buildOresPanel(guildId, userId, username) {
    const all = getOres(guildId, userId);
    const ores = all.filter(o => ORE_IDS.has(o.oreId)).sort((a, b) => getMaterialDef(b.oreId).value - getMaterialDef(a.oreId).value);
    const bars = all.filter(o => BAR_IDS.has(o.oreId)).sort((a, b) => getMaterialDef(b.oreId).value - getMaterialDef(a.oreId).value);
    const supplies = all.filter(o => !ORE_IDS.has(o.oreId) && !BAR_IDS.has(o.oreId) && !GEM_IDS.has(o.oreId));
    let oreValue = 0, oreQty = 0;
    let desc = '**🪨 Ore Mentah:**\n';
    if (ores.length === 0) desc += '> *kosong — gali dulu!*\n';
    else ores.forEach(o => {
        const def = getMaterialDef(o.oreId);
        const val = def.value * o.quantity;
        oreValue += val; oreQty += o.quantity;
        desc += `> ${def.emoji} **${def.name}** ×${o.quantity} — 🪙 ${val.toLocaleString('id-ID')}\n`;
    });
    desc += `\n**🔩 Batangan (Bar):**\n`;
    if (bars.length === 0) desc += '> *belum ada — lebur ore di 🔥 Smelt*\n';
    else bars.forEach(b => {
        const def = getMaterialDef(b.oreId);
        desc += `> ${def.emoji} **${def.name}** ×${b.quantity}\n`;
    });
    if (supplies.length > 0) {
        desc += `\n**🧰 Perlengkapan:**\n`;
        supplies.forEach(s => {
            const def = getMaterialDef(s.oreId);
            desc += `> ${def.emoji} **${def.name}** ×${s.quantity}\n`;
        });
    }
    desc += `\n━━━━━━━━━━━━━━━━━━━━━━\n> 💰 Nilai ore mentah: 🪙 **${oreValue.toLocaleString('id-ID')}** (${oreQty} ore)\n> ℹ️ *Jual hanya menjual ore mentah — bar & perlengkapan aman.*`;

    const embed = new EmbedBuilder().setColor('#C9A227').setTitle(`🎒 Kantong Material — ${username}`).setDescription(desc)
        .setFooter({ text: 'Ore mentah → jual atau lebur jadi bar di 🔥 Smelt' });
    const r = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mine_sellores_${userId}`).setLabel('💰 Jual Ore Mentah').setStyle(ButtonStyle.Danger).setDisabled(ores.length === 0),
        new ButtonBuilder().setCustomId(`mine_smelt_${userId}`).setLabel('🔥 Smelt').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [r] };
}

// ==================== BUILD SMELT (furnace) ====================
function buildSmeltPanel(guildId, userId, username) {
    const fuel = getMatCount(guildId, userId, FUEL_ORE);
    const fuelDef = getMaterialDef(FUEL_ORE);
    let desc = `🔥 Lebur ore jadi **batangan** (butuh bahan bakar **${fuelDef.emoji} ${fuelDef.name}**).\n> 🪵 Fuel kamu: **${fuel}** ${fuelDef.emoji}\n\n**Resep:**\n`;
    SMELT_RECIPES.forEach(r => {
        const ore = getMaterialDef(r.ore);
        const bar = getMaterialDef(r.bar);
        const haveOre = getMatCount(guildId, userId, r.ore);
        const possible = Math.min(Math.floor(haveOre / r.oreQty), Math.floor(fuel / r.fuel));
        desc += `> ${bar.emoji} **${bar.name}** ⟵ ${r.oreQty}× ${ore.emoji} + ${r.fuel}× ${fuelDef.emoji} *(bisa: ${possible})*\n`;
    });

    const menu = new StringSelectMenuBuilder().setCustomId(`mine_smelt_select_${userId}`).setPlaceholder('🔥 Pilih bar untuk dilebur (max sekaligus)...').setMinValues(1).setMaxValues(1);
    SMELT_RECIPES.forEach(r => {
        const ore = getMaterialDef(r.ore);
        const bar = getMaterialDef(r.bar);
        menu.addOptions(new StringSelectMenuOptionBuilder()
            .setLabel(`${bar.name} — ${r.oreQty}x ${ore.name} + ${r.fuel} fuel`)
            .setValue(r.bar)
            .setDescription(`Lebur semua yang bisa (max 50/klik)`));
    });
    const embed = new EmbedBuilder().setColor('#E67E22').setTitle(`🔥 Tungku Peleburan — ${username}`).setDescription(desc)
        .setFooter({ text: 'Pilih bar → dilebur sebanyak mungkin sekaligus (max 50/klik)' });
    return { embeds: [embed], components: [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary))
    ] };
}

// ==================== BUILD SMITH (craft items) ====================
function buildSmithPanel(guildId, userId, username) {
    const DIV = '━━━━━━━━━━━━━━━━━━━━';
    const cats = [
        { key: 'Material', title: '⚒️ Material — buat Pet & Fishing' },
        { key: 'Perlengkapan', title: '🧰 Perlengkapan Tambang' },
        { key: 'Konsumabel', title: '✨ Konsumabel' },
    ];
    let desc = `🔨 Tempa **batangan (bar)** jadi barang berguna.\n*Lebur ore dulu di 🔥 Smelt untuk dapat bar.*\n`;

    for (const c of cats) {
        const recs = SMITH_RECIPES.filter(r => r.cat === c.key);
        if (!recs.length) continue;
        desc += `\n${DIV}\n**${c.title}**\n`;
        recs.forEach(rc => {
            const inputStr = rc.inputs.map(i => { const m = getMaterialDef(i.mat); return `${i.qty}× ${m.emoji}`; }).join(' + ');
            const canMake = rc.inputs.every(i => getMatCount(guildId, userId, i.mat) >= i.qty);
            desc += `> ${canMake ? '✅' : '▫️'} ${rc.emoji} **${rc.name}**  ⟵  ${inputStr}\n> ┗ *${rc.desc}*\n`;
        });
    }

    const fragCount = getMatCount(guildId, userId, 'artifact_fragment');
    const showCore = fragCount > 0;
    if (showCore) {
        desc += `\n${DIV}\n**👑 Core Forge** — 🔱 Fragment: **${fragCount}**\n`;
        CORE_RECIPES.forEach(rc => {
            const inputStr = rc.inputs.map(i => `${i.qty}× ${getMaterialDef(i.mat).emoji}`).join(' + ');
            const canMake = rc.inputs.every(i => getMatCount(guildId, userId, i.mat) >= i.qty);
            desc += `> ${canMake ? '✅' : '▫️'} ${rc.emoji} **${rc.name}**  ⟵  ${inputStr}\n> ┗ *${rc.desc}*\n`;
        });
    }
    desc += `\n${DIV}\n> ✅ = bahan cukup • ▫️ = bahan kurang`;

    const menu = new StringSelectMenuBuilder().setCustomId(`mine_smith_select_${userId}`).setPlaceholder('🔨 Pilih barang untuk ditempa...').setMinValues(1).setMaxValues(1);
    SMITH_RECIPES.forEach(rc => {
        const canMake = rc.inputs.every(i => getMatCount(guildId, userId, i.mat) >= i.qty);
        const inputStr = rc.inputs.map(i => `${i.qty}x ${getMaterialDef(i.mat).name}`).join(' + ');
        menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${rc.name}`).setValue(rc.id).setDescription(`${canMake ? '✅ ' : ''}${inputStr}`.slice(0, 100)));
    });
    if (showCore) {
        CORE_RECIPES.forEach(rc => {
            const inputStr = rc.inputs.map(i => `${i.qty}x ${getMaterialDef(i.mat).name}`).join(' + ');
            menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`👑 ${rc.name}`).setValue(`core_${rc.id}`).setDescription(inputStr.slice(0, 100)));
        });
    }
    const embed = new EmbedBuilder().setColor('#95A5A6').setTitle(`🔨 Pandai Besi — ${username}`).setDescription(desc)
        .setFooter({ text: 'Tempa material untuk upgrade pet/joran tanpa beli mahal di shop!' });
    return { embeds: [embed], components: [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary))
    ] };
}

// ==================== BUILD SHOP (pickaxe + perlengkapan + stamina) ====================
function buildShopPanel(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);
    const data = getMiningData(guildId, userId);
    const current = getPickaxe(data.pickaxe);
    const max = maxStamina(data.level);
    const missing = max - data.stamina;
    const perPoint = staminaRefillCostPerPoint(data.level);
    const refillCost = missing * perPoint;
    const DIV = '━━━━━━━━━━━━━━━━━━━━';

    let desc = `💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n`;
    desc += `⛏️ Pickaxe: ${current.emoji} **${current.name}** (Tier ${current.tier})\n`;
    desc += `⚡ Stamina: **${data.stamina}/${max}**\n`;

    // --- Pickaxe ---
    desc += `\n${DIV}\n**⛏️ Upgrade Pickaxe**\n`;
    const buyable = PICKAXE_TYPES.filter(p => p.tier > current.tier && !p.craftOnly);
    if (buyable.length === 0) {
        desc += `> 🏆 Sudah pickaxe tertinggi yang bisa dibeli!\n`;
    } else {
        buyable.forEach(p => {
            const afford = userData.balance >= p.price ? '✅' : '▫️';
            desc += `> ${afford} ${p.emoji} **${p.name}** (T${p.tier}) — 🪙 ${p.price.toLocaleString('id-ID')}\n`;
            desc += `> ┗ Stamina/gali: ${p.staminaCost} • Yield +${p.yieldBonus} • Max ${p.maxDepth}m\n`;
        });
    }

    // --- Perlengkapan ---
    desc += `\n${DIV}\n**🧰 Perlengkapan (anti-bahaya)**\n`;
    SUPPLIES.forEach(s => {
        const owned = getMatCount(guildId, userId, s.id);
        desc += `> ${s.emoji} **${s.name}** — 🪙 ${s.price} · punya: **${owned}**\n> ┗ *${s.desc}*\n`;
    });

    // --- Stamina ---
    desc += `\n${DIV}\n**⚡ Isi Ulang Stamina**\n`;
    if (missing <= 0) desc += `> 🔋 Stamina sudah penuh!\n`;
    else desc += `> Isi penuh **+${missing}** stamina → 🪙 **${refillCost.toLocaleString('id-ID')}** (🪙${perPoint}/poin)\n`;

    const components = [];
    if (buyable.length > 0) {
        const menu = new StringSelectMenuBuilder().setCustomId(`mine_shop_select_${userId}`).setPlaceholder('⛏️ Beli pickaxe...').setMinValues(1).setMaxValues(1);
        buyable.forEach(p => menu.addOptions(new StringSelectMenuOptionBuilder()
            .setLabel(`${p.name} (T${p.tier}) — 🪙${p.price.toLocaleString('id-ID')}`)
            .setValue(p.id)
            .setDescription(`Stamina ${p.staminaCost} | Yield +${p.yieldBonus} | Max ${p.maxDepth}m`)));
        components.push(new ActionRowBuilder().addComponents(menu));
    }
    components.push(new ActionRowBuilder().addComponents(
        ...SUPPLIES.map(s => new ButtonBuilder().setCustomId(`mine_buy${s.id}_${userId}`).setLabel(`${s.emoji} ${s.name} (🪙${s.price})`).setStyle(ButtonStyle.Primary))
    ));
    components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mine_refill_${userId}`).setLabel(missing <= 0 ? '🔋 Stamina Penuh' : `⚡ Isi Stamina (🪙${refillCost.toLocaleString('id-ID')})`).setStyle(ButtonStyle.Success).setDisabled(missing <= 0 || userData.balance < refillCost),
        new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    ));
    const embed = new EmbedBuilder().setColor('#27AE60').setTitle(`🛒 Toko Tambang — ${username}`).setDescription(desc)
        .setFooter({ text: '✅ = saldo cukup • Upgrade pickaxe untuk hemat stamina & gali lebih dalam' });
    return { embeds: [embed], components };
}

// ==================== BUILD GEMS & SOCKET ====================
function buildGemsPanel(guildId, userId, username) {
    const data = getMiningData(guildId, userId);
    const pickaxe = getPickaxe(data.pickaxe);
    const slots = socketSlots(pickaxe.tier);
    const socketed = getSockets(data);
    const ownedGems = getOres(guildId, userId).filter(o => GEM_IDS.has(o.oreId)).sort((a, b) => getMaterialDef(b.oreId).value - getMaterialDef(a.oreId).value);

    let desc = `${pickaxe.emoji} **${pickaxe.name}** — Socket terpakai: **${socketed.length}/${slots}**\n`;
    desc += `> ${socketed.length ? socketed.map(id => { const g = GEMS.find(x => x.id === id); return g ? `${g.emoji} ${g.name}` : id; }).join(', ') : '*kosong*'}\n\n`;
    desc += `**💎 Efek Gem (saat di-socket):**\n`;
    desc += `> 🔺 Ruby +1 ore/dig • 🔹 Sapphire −1 stamina • 🔶 Topaz +20% EXP\n`;
    desc += `> 🟩 Emerald +luck (ore langka & gem) • 💎 Diamond +15% jual • 🌟 Star all-in-one\n\n`;
    desc += `**Gem kamu:**\n`;
    if (ownedGems.length === 0) desc += '> *belum punya — gem drop langka saat ⛏️ Dig (makin dalam makin sering)*\n';
    else ownedGems.forEach(g => { const d = getMaterialDef(g.oreId); desc += `> ${d.emoji} **${d.name}** ×${g.quantity}\n`; });
    desc += `\n> 🔮 Fusion: 3× gem sama → 1× 🌟 Star Gem`;
    if (slots === 0) desc += `\n> ⚠️ Pickaxe ini belum punya slot socket — upgrade dulu!`;

    const components = [];
    if (slots > 0 && socketed.length < slots && ownedGems.length > 0) {
        const m = new StringSelectMenuBuilder().setCustomId(`mine_socket_select_${userId}`).setPlaceholder('💎 Socket gem ke pickaxe...').setMinValues(1).setMaxValues(1);
        ownedGems.forEach(g => { const d = getMaterialDef(g.oreId); m.addOptions(new StringSelectMenuOptionBuilder().setLabel(`Socket ${d.name} (punya ${g.quantity})`).setValue(g.oreId).setDescription(`${d.name}`)); });
        components.push(new ActionRowBuilder().addComponents(m));
    }
    const fusable = ownedGems.filter(g => g.quantity >= 3 && g.oreId !== 'gem_star');
    if (fusable.length > 0) {
        const fm = new StringSelectMenuBuilder().setCustomId(`mine_fuse_select_${userId}`).setPlaceholder('🔮 Fusion 3 gem → 1 Star Gem...').setMinValues(1).setMaxValues(1);
        fusable.forEach(g => { const d = getMaterialDef(g.oreId); fm.addOptions(new StringSelectMenuOptionBuilder().setLabel(`3× ${d.name} → 🌟 Star Gem`).setValue(g.oreId).setDescription(`Punya ${g.quantity}`)); });
        components.push(new ActionRowBuilder().addComponents(fm));
    }
    components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mine_unsocket_${userId}`).setLabel('🧹 Lepas Semua Gem').setStyle(ButtonStyle.Secondary).setDisabled(socketed.length === 0),
        new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    ));
    const embed = new EmbedBuilder().setColor('#8E44AD').setTitle(`💎 Gem & Socket — ${username}`).setDescription(desc)
        .setFooter({ text: 'Socket gem ke pickaxe untuk bonus permanen saat menambang' });
    return { embeds: [embed], components };
}

// ==================== COMMAND ====================
async function handleMiningCommand(interaction) {
    const guildId = interaction.guild.id;
    return interaction.reply(buildMiningPanel(guildId, interaction.user.id, interaction.user.username));
}

// ==================== BUTTON HANDLER ====================
async function handleMiningButton(interaction) {
    const guildId = interaction.guild.id;
    const parts = interaction.customId.split('_');
    const userId = parts[parts.length - 1];
    const action = parts[1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel tambang kamu! Ketik `/mine` untuk buka punyamu.', ephemeral: true });
    }

    if (action === 'refresh' || action === 'back') {
        return interaction.update(buildMiningPanel(guildId, userId, interaction.user.username));
    }

    if (action === 'ores') {
        return interaction.update(buildOresPanel(guildId, userId, interaction.user.username));
    }

    if (action === 'smelt') {
        return interaction.update(buildSmeltPanel(guildId, userId, interaction.user.username));
    }

    if (action === 'smith') {
        return interaction.update(buildSmithPanel(guildId, userId, interaction.user.username));
    }

    if (action === 'gems') {
        return interaction.update(buildGemsPanel(guildId, userId, interaction.user.username));
    }

    if (action === 'unsocket') {
        const data = getMiningData(guildId, userId);
        const socketed = getSockets(data);
        if (socketed.length === 0) return interaction.reply({ content: '❌ Tidak ada gem ter-socket.', ephemeral: true });
        for (const id of socketed) addOre(guildId, userId, id, 1);
        saveSockets(guildId, userId, []);
        return interaction.update(buildGemsPanel(guildId, userId, interaction.user.username));
    }

    if (action === 'shop') {
        return interaction.update(buildShopPanel(guildId, userId, interaction.user.username));
    }

    if (action === 'refill') {
        const row = getMiningData(guildId, userId);
        const max = maxStamina(row.level);
        const missing = max - row.stamina;
        if (missing <= 0) return interaction.reply({ content: '🔋 Stamina kamu sudah penuh!', ephemeral: true });
        const cost = missing * staminaRefillCostPerPoint(row.level);
        const userData = getOrCreateUser(guildId, userId);
        if (userData.balance < cost) return interaction.reply({ content: `❌ Saldo kurang! Isi penuh stamina butuh 🪙 **${cost.toLocaleString('id-ID')}**`, ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(cost, guildId, userId);
        row.stamina = max;
        row.staminaTs = Date.now();
        saveMiningData(guildId, userId, row);
        return interaction.update(buildShopPanel(guildId, userId, interaction.user.username));
    }

    if (action.startsWith('buy')) {
        const supId = action.slice(3);
        const sup = SUPPLIES.find(s => s.id === supId);
        if (!sup) return interaction.reply({ content: '❌ Item tidak ditemukan!', ephemeral: true });
        const userData = getOrCreateUser(guildId, userId);
        if (userData.balance < sup.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${sup.price}**`, ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(sup.price, guildId, userId);
        addOre(guildId, userId, sup.id, 1);
        return interaction.update(buildShopPanel(guildId, userId, interaction.user.username));
    }

    if (action === 'dig') {
        const row = getMiningData(guildId, userId);
        const pickaxe = getPickaxe(row.pickaxe);
        const sockets = getSockets(row);
        // Pet mining abilities
        const abOreFinder = hasAbility(guildId, userId, 'ore_finder');   // +1 ore/dig
        const abGemFinder = hasAbility(guildId, userId, 'gem_finder');   // +8% gem chance
        const abTough = hasAbility(guildId, userId, 'tough_miner');      // -1 stamina + 50% block cave-in/gas
        const staCost = Math.max(1, pickaxe.staminaCost - socketBonus(sockets, 'stamina') - (abTough ? 1 : 0));
        if (row.stamina < staCost) {
            const eta = staminaETA(row);
            return interaction.reply({ content: `❌ Stamina kurang! Butuh **${staCost}**, punya **${row.stamina}**.${eta ? ` (+1 dalam ${eta}s)` : ''}`, ephemeral: true });
        }
        row.stamina -= staCost;
        if (row.staminaTs === 0 || row.stamina === maxStamina(row.level) - staCost) row.staminaTs = Date.now();

        const layer = getLayerForDepth(row.depth);
        const max = maxStamina(row.level);
        const bYield = socketBonus(sockets, 'yield') + (abOreFinder ? 1 : 0);
        const bExp = socketBonus(sockets, 'exp');
        const bLuck = socketBonus(sockets, 'luck');
        const rareOreId = layer.ores.map(o => o.ore).sort((a, b) => getOreDef(b).value - getOreDef(a).value)[0];
        const digRow = () => new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mine_dig_${userId}`).setLabel('⛏️ Dig Lagi').setStyle(ButtonStyle.Success).setDisabled(row.stamina < staCost),
            new ButtonBuilder().setCustomId(`mine_ores_${userId}`).setLabel('🎒 Ores').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Panel').setStyle(ButtonStyle.Secondary)
        );
        const doMine = () => {
            const yieldCount = 1 + getRandomInt(0, pickaxe.yieldBonus) + bYield + Math.floor(row.level / 25);
            const gained = {}; let expGain = 0;
            for (let i = 0; i < yieldCount; i++) {
                const o = (bLuck > 0 && Math.random() < bLuck * 0.08) ? rareOreId : pickOre(layer);
                gained[o] = (gained[o] || 0) + 1; expGain += getOreDef(o).exp;
            }
            for (const [o, q] of Object.entries(gained)) addOre(guildId, userId, o, q);
            expGain = Math.floor(expGain * (1 + bExp / 100));
            // Gem drop (langka) — Gem Hunter ability +8%
            let gemId = null;
            const gemChance = GEM_DROP_BASE + row.depth * 0.00005 + bLuck * 0.01 + (abGemFinder ? 0.08 : 0);
            if (Math.random() < gemChance) { gemId = pickGem(); addOre(guildId, userId, gemId, 1); }
            // Quest + achievement (fire-and-forget, dipanggil tiap dig sukses)
            updateQuestProgress(guildId, userId, 'mine', 1);
            checkAchievements(interaction.guild, userId, { type: 'mining_dig' }).catch(() => {});
            if (gemId) checkAchievements(interaction.guild, userId, { type: 'mining_gem' }).catch(() => {});
            return { gained, expGain, gemId };
        };
        const gainedText = (gained, gemId) => {
            let t = Object.entries(gained).sort((a, b) => getOreDef(b[0]).value - getOreDef(a[0]).value).map(([id, q]) => `> ${getOreDef(id).emoji} **${getOreDef(id).name}** ×${q}`).join('\n');
            if (gemId) { const g = getMaterialDef(gemId); t += `\n> ${g.emoji} **${g.name}** ×1 💎 *(langka!)*`; }
            return t;
        };

        // Roll hazard
        let hazardType = null;
        if (layer.hazard > 0 && Math.random() < layer.hazard) {
            const tot = HAZARD_WEIGHTS.cavein + HAZARD_WEIGHTS.gas + HAZARD_WEIGHTS.monster;
            let rr = Math.random() * tot;
            hazardType = (rr -= HAZARD_WEIGHTS.cavein) < 0 ? 'cavein' : (rr -= HAZARD_WEIGHTS.gas) < 0 ? 'gas' : 'monster';
            // Tough Miner: 50% peluang menangkal cave-in & gas (bukan monster)
            if (abTough && (hazardType === 'cavein' || hazardType === 'gas') && Math.random() < 0.5) hazardType = null;
        }

        // No hazard -> normal dig
        if (!hazardType) {
            const { gained, expGain, gemId } = doMine();
            const lvl = addMiningExp(row, expGain);
            row.totalDigs++; saveMiningData(guildId, userId, row); incrementUserStat(guildId, userId, 'mining_digs');
            let d = `${pickaxe.emoji} *Crack!* Gali di **${row.depth}m** (${layer.name})\n\n${gainedText(gained, gemId)}\n\n> ✨ +${expGain} Mining EXP\n> ⚡ Stamina: **${row.stamina}/${max}**`;
            if (lvl.leveledUp) d += `\n> 🎉 **MINING LEVEL UP!** → Lv.${lvl.newLevel} (max stamina naik!)`;
            return interaction.update({ embeds: [new EmbedBuilder().setColor('#C9A227').setTitle('⛏️ Hasil Galian').setDescription(d)], components: [digRow()] });
        }

        // CAVE-IN
        if (hazardType === 'cavein') {
            if (getMatCount(guildId, userId, 'beam') > 0) {
                removeMat(guildId, userId, 'beam', 1);
                const { gained, expGain, gemId } = doMine();
                const lvl = addMiningExp(row, expGain);
                row.totalDigs++; saveMiningData(guildId, userId, row); incrementUserStat(guildId, userId, 'mining_digs');
                let d = `🪨 **CAVE-IN!** Tapi 🪵 Penyangga menyelamatkanmu — galian aman!\n\n${gainedText(gained, gemId)}\n\n> ✨ +${expGain} EXP • ⚡ ${row.stamina}/${max}\n> 🪵 Penyangga −1`;
                if (lvl.leveledUp) d += `\n> 🎉 LEVEL UP! → Lv.${lvl.newLevel}`;
                return interaction.update({ embeds: [new EmbedBuilder().setColor('#E67E22').setTitle('🪨 Cave-In Dicegah').setDescription(d)], components: [digRow()] });
            }
            const lostSta = Math.min(row.stamina, 15);
            row.stamina -= lostSta;
            row.depth = Math.max(0, row.depth - DESCEND_STEP * 2);
            saveMiningData(guildId, userId, row); incrementUserStat(guildId, userId, 'mining_hazards');
            const d = `🪨 **CAVE-IN!** Terowongan runtuh! Kamu terlempar ke atas.\n\n> ❌ Tidak dapat ore\n> ⚡ Stamina −${lostSta} (${row.stamina}/${max})\n> ⬆️ Kedalaman → **${row.depth}m**\n\n> 💡 Beli 🪵 **Penyangga** di Shop biar aman.`;
            return interaction.update({ embeds: [new EmbedBuilder().setColor('#E74C3C').setTitle('🪨 CAVE-IN!').setDescription(d)], components: [digRow()] });
        }

        // GAS
        if (hazardType === 'gas') {
            if (getMatCount(guildId, userId, 'gasmask') > 0) {
                removeMat(guildId, userId, 'gasmask', 1);
                const { gained, expGain, gemId } = doMine();
                const lvl = addMiningExp(row, expGain);
                row.totalDigs++; saveMiningData(guildId, userId, row); incrementUserStat(guildId, userId, 'mining_digs');
                let d = `🟢 **GAS BERACUN!** Tapi 😷 Masker Gas melindungimu — galian lanjut!\n\n${gainedText(gained, gemId)}\n\n> ✨ +${expGain} EXP • ⚡ ${row.stamina}/${max}\n> 😷 Masker −1`;
                if (lvl.leveledUp) d += `\n> 🎉 LEVEL UP! → Lv.${lvl.newLevel}`;
                return interaction.update({ embeds: [new EmbedBuilder().setColor('#27AE60').setTitle('🟢 Gas Dicegah').setDescription(d)], components: [digRow()] });
            }
            const lostSta = Math.min(row.stamina, 8);
            row.stamina -= lostSta;
            saveMiningData(guildId, userId, row); incrementUserStat(guildId, userId, 'mining_hazards');
            const d = `🟢 **GAS BERACUN!** Kamu mundur tergesa-gesa.\n\n> ❌ Tidak dapat ore\n> ⚡ Stamina −${lostSta} (${row.stamina}/${max})\n\n> 💡 Beli 😷 **Masker Gas** di Shop.`;
            return interaction.update({ embeds: [new EmbedBuilder().setColor('#27AE60').setTitle('🟢 GAS POCKET!').setDescription(d)], components: [digRow()] });
        }

        // MONSTER (battle pakai pet)
        if (hazardType === 'monster') {
            incrementUserStat(guildId, userId, 'mining_hazards');
            const pet = getPetData(guildId, userId);
            const elIcon = ELEMENT_EMOJI[layer.mElement] || '';
            if (!pet) {
                const lostSta = Math.min(row.stamina, 10);
                row.stamina -= lostSta; saveMiningData(guildId, userId, row);
                const d = `👹 **MONSTER BAWAH TANAH!** Kamu nggak punya pet aktif buat melawan — kabur!\n\n> ❌ Tidak dapat ore\n> ⚡ Stamina −${lostSta} (${row.stamina}/${max})\n\n> 💡 Aktifkan pet (\`/pet\`) biar bisa lawan & dapat loot!`;
                return interaction.update({ embeds: [new EmbedBuilder().setColor('#8E44AD').setTitle('👹 Monster!').setDescription(d)], components: [digRow()] });
            }
            const petDef = PET_DATA.find(p => p.id === pet.petId);
            const ms = getMonsterStats(row.depth);
            const result = simulateBattle(pet, petDef, [{ hp: ms.hp, atk: ms.atk, def: ms.def, element: layer.mElement }]);
            if (result.alive) {
                const { gained, expGain, gemId } = doMine();
                const rare = layer.ores.map(o => o.ore).sort((a, b) => getOreDef(b).value - getOreDef(a).value)[0];
                const bonus = getRandomInt(2, 4);
                addOre(guildId, userId, rare, bonus); gained[rare] = (gained[rare] || 0) + bonus;
                const lvl = addMiningExp(row, expGain + 20);
                row.totalDigs++; saveMiningData(guildId, userId, row);
                incrementUserStat(guildId, userId, 'mining_monsters_defeated');
                checkAchievements(interaction.guild, userId, { type: 'mining_monster' }).catch(() => {});
                let d = `👹${elIcon} **Monster dikalahkan ${petDef ? petDef.emoji : '🐾'} ${pet.name}!** Loot + bonus diamankan!\n\n${gainedText(gained, gemId)}\n\n> ✨ +${expGain + 20} EXP • ⚡ ${row.stamina}/${max}\n> ❤️ HP pet sisa: ${result.remainingHp}`;
                if (lvl.leveledUp) d += `\n> 🎉 LEVEL UP! → Lv.${lvl.newLevel}`;
                return interaction.update({ embeds: [new EmbedBuilder().setColor('#2ECC71').setTitle('👹 Monster Dikalahkan!').setDescription(d)], components: [digRow()] });
            } else {
                const lostSta = Math.min(row.stamina, 15);
                row.stamina -= lostSta;
                const ownedOres = getOres(guildId, userId).filter(o => ORE_IDS.has(o.oreId));
                let dropMsg = 'tidak ada ore hilang';
                if (ownedOres.length) {
                    const victim = ownedOres[Math.floor(Math.random() * ownedOres.length)];
                    const dropQty = Math.min(victim.quantity, getRandomInt(1, 3));
                    removeMat(guildId, userId, victim.oreId, dropQty);
                    dropMsg = `${getOreDef(victim.oreId).emoji} −${dropQty} ${getOreDef(victim.oreId).name}`;
                }
                db.prepare('UPDATE pets SET happiness = MAX(0, happiness - 10) WHERE id = ?').run(pet.id);
                saveMiningData(guildId, userId, row);
                const d = `👹${elIcon} **${pet.name} kalah lawan monster!**\n\n> ❌ Loot lenyap: ${dropMsg}\n> ⚡ Stamina −${lostSta} (${row.stamina}/${max})\n> 💔 Happiness pet −10\n\n> 💡 Level-up pet / bawa pet yang **counter** elemen ${elIcon} ${layer.mElement}.`;
                return interaction.update({ embeds: [new EmbedBuilder().setColor('#E74C3C').setTitle('👹 Kalah!').setDescription(d)], components: [digRow()] });
            }
        }
    }

    if (action === 'descend') {
        const row = getMiningData(guildId, userId);
        const pickaxe = getPickaxe(row.pickaxe);
        const next = row.depth + DESCEND_STEP;
        if (next > pickaxe.maxDepth) {
            return interaction.reply({ content: `❌ ${pickaxe.emoji} **${pickaxe.name}** cuma bisa sampai **${pickaxe.maxDepth}m**! Upgrade pickaxe di 🛒 Shop untuk turun lebih dalam.`, ephemeral: true });
        }
        row.depth = next;
        saveMiningData(guildId, userId, row);
        return interaction.update(buildMiningPanel(guildId, userId, interaction.user.username));
    }

    if (action === 'surface') {
        const row = getMiningData(guildId, userId);
        row.depth = 0;
        saveMiningData(guildId, userId, row);
        return interaction.update(buildMiningPanel(guildId, userId, interaction.user.username));
    }

    if (action === 'core') {
        const row = getMiningData(guildId, userId);
        if (row.depth < CORE_DEPTH) return interaction.reply({ content: `❌ Harus di kedalaman **${CORE_DEPTH}m+** untuk akses The Core!`, ephemeral: true });
        if (row.stamina < CORE_STAMINA) { const eta = staminaETA(row); return interaction.reply({ content: `❌ Butuh **${CORE_STAMINA}** stamina untuk lawan Core! Punya ${row.stamina}.${eta ? ` (+1/${eta}s)` : ''}`, ephemeral: true }); }
        const pet = getPetData(guildId, userId);
        if (!pet) return interaction.reply({ content: '❌ Butuh pet aktif untuk masuk The Core! (`/pet`)', ephemeral: true });
        row.stamina -= CORE_STAMINA;
        if (row.staminaTs === 0) row.staminaTs = Date.now();
        const petDef = PET_DATA.find(p => p.id === pet.petId);
        const boss = getCoreBoss(row.prestige || 0);
        const result = simulateBattle(pet, petDef, [{ hp: boss.hp, atk: boss.atk, def: boss.def, element: boss.element }]);
        incrementUserStat(guildId, userId, 'mining_core_runs');
        const coreRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mine_core_${userId}`).setLabel('👑 Lawan Lagi').setStyle(ButtonStyle.Danger).setDisabled(row.stamina < CORE_STAMINA),
            new ButtonBuilder().setCustomId(`mine_smith_${userId}`).setLabel('🔨 Smith').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Panel').setStyle(ButtonStyle.Secondary)
        );
        if (result.alive) {
            const frags = getRandomInt(1, 2);
            addOre(guildId, userId, 'artifact_fragment', frags);
            addOre(guildId, userId, 'void_crystal', getRandomInt(2, 3));
            const lvl = addMiningExp(row, 200); saveMiningData(guildId, userId, row);
            incrementUserStat(guildId, userId, 'mining_core_clears');
            checkAchievements(interaction.guild, userId, { type: 'mining_core' }).catch(() => {});
            let d = `👑🌑 **THE CORE DITAKLUKKAN!** ${petDef ? petDef.emoji : '🐾'} ${pet.name} menang!\n\n> 🔱 **Artifact Fragment** ×${frags}\n> 💠 Void Crystal ×2-3\n> ✨ +200 Mining EXP\n> ❤️ HP pet sisa: ${result.remainingHp}`;
            if (lvl.leveledUp) d += `\n> 🎉 LEVEL UP! → Lv.${lvl.newLevel}`;
            d += `\n\n> 🔨 Kumpulkan Fragment → tempa **Legendary Drill** / **Miner's Artifact** di Smith!`;
            return interaction.update({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle('👑 THE CORE').setDescription(d)], components: [coreRow] });
        } else {
            db.prepare('UPDATE pets SET happiness = MAX(0, happiness - 15) WHERE id = ?').run(pet.id);
            saveMiningData(guildId, userId, row);
            const d = `👑🌑 **${pet.name} kalah di The Core...**\n\n> ❌ Gagal dapat Artifact Fragment\n> ⚡ Stamina −${CORE_STAMINA}\n> 💔 Happiness pet −15\n\n> 💡 Awaken & level-up pet, bawa elemen counter 🌑 dark (✨ light).`;
            return interaction.update({ embeds: [new EmbedBuilder().setColor('#E74C3C').setTitle('👑 The Core — Kalah').setDescription(d)], components: [coreRow] });
        }
    }

    if (action === 'prestige') {
        const row = getMiningData(guildId, userId);
        if (row.level < MAX_MINING_LEVEL) return interaction.reply({ content: `❌ Harus Mining Lv.${MAX_MINING_LEVEL} dulu untuk Prestige!`, ephemeral: true });
        const nextPct = Math.round((row.prestige + 1) * PRESTIGE_BONUS * 100);
        const embed = new EmbedBuilder().setColor('#F1C40F').setTitle('⭐ Prestige Mining')
            .setDescription(`Prestige **reset Mining Level ke 1 & kedalaman ke 0**, tapi dapat **bonus PERMANEN +${PRESTIGE_BONUS * 100}% nilai jual ore**.\n\n> Prestige: **${row.prestige}** → **${row.prestige + 1}** (total +${nextPct}% jual ore)\n> ✅ Pickaxe, gem, bar, fragment, artifact **TETAP**\n> ⚠️ Level & EXP mining ulang dari 0\n\nLanjut?`);
        const r = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mine_prestigeyes_${userId}`).setLabel('⭐ Ya, Prestige!').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('❌ Batal').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [r] });
    }

    if (action === 'prestigeyes') {
        const row = getMiningData(guildId, userId);
        if (row.level < MAX_MINING_LEVEL) return interaction.reply({ content: '❌ Belum Level maksimal.', ephemeral: true });
        row.level = 1; row.exp = 0; row.depth = 0; row.prestige = (row.prestige || 0) + 1;
        saveMiningData(guildId, userId, row);
        incrementUserStat(guildId, userId, 'mining_prestige');
        checkAchievements(interaction.guild, userId, { type: 'mining_prestige' }).catch(() => {});
        const embed = new EmbedBuilder().setColor('#FFD700').setTitle('⭐ PRESTIGE!')
            .setDescription(`Kamu sekarang **Prestige ${row.prestige}**! 🎉\n\n> 📈 Mining Level reset ke 1\n> 💰 Bonus permanen: **+${Math.round(row.prestige * PRESTIGE_BONUS * 100)}%** nilai jual ore\n> ⛏️ Grind ulang, tapi cuan ore makin gede tiap prestige!`);
        const r = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Panel').setStyle(ButtonStyle.Secondary));
        return interaction.update({ embeds: [embed], components: [r] });
    }

    if (action === 'leaderboard') {
        const top = db.prepare('SELECT userId, level, prestige, totalDigs FROM mining_data ORDER BY prestige DESC, level DESC, totalDigs DESC LIMIT 10').all();
        let d = top.length ? '' : '*Belum ada penambang. Jadilah yang pertama!*';
        top.forEach((t, i) => { const medal = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`; d += `${medal} <@${t.userId}> — ${t.prestige > 0 ? `⭐${t.prestige} ` : ''}Lv.${t.level} (${t.totalDigs || 0} digs)\n`; });
        const embed = new EmbedBuilder().setColor('#FFD700').setTitle('🏆 Top Miners').setDescription(d);
        const r = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Panel').setStyle(ButtonStyle.Secondary));
        return interaction.update({ embeds: [embed], components: [r] });
    }

    if (action === 'sellores') {
        const ores = getOres(guildId, userId).filter(o => ORE_IDS.has(o.oreId));
        if (ores.length === 0) return interaction.reply({ content: '❌ Tidak ada ore mentah untuk dijual!', ephemeral: true });
        let total = 0, count = 0;
        ores.forEach(o => { total += getMaterialDef(o.oreId).value * o.quantity; count += o.quantity; });
        const mineRow = getMiningData(guildId, userId);
        const moneyBonus = socketBonus(getSockets(mineRow), 'money');
        if (moneyBonus > 0) total = Math.floor(total * (1 + moneyBonus / 100));
        // Multiplier endgame: prestige + Miner's Artifact
        const endMult = 1 + (mineRow.prestige || 0) * PRESTIGE_BONUS + (mineRow.artifact ? ARTIFACT_BONUS : 0);
        if (endMult > 1) total = Math.floor(total * endMult);
        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(total, guildId, userId);
        // Hapus hanya ore mentah (bar/gem/perlengkapan tetap aman)
        for (const o of ores) db.prepare('DELETE FROM ore_inventory WHERE guildId = ? AND userId = ? AND oreId = ?').run(guildId, userId, o.oreId);
        addIncome(guildId, userId, 'mining', total);
        incrementUserStat(guildId, userId, 'mining_ore_sold', count);
        const fresh = getOrCreateUser(guildId, userId);
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('💰 Ore Terjual!')
            .setDescription(`Menjual **${count}** ore mentah → 🪙 **${total.toLocaleString('id-ID')}**${moneyBonus > 0 ? ` (💎 +${moneyBonus}% gem)` : ''}\n\n> 💳 Saldo: 🪙 **${fresh.balance.toLocaleString('id-ID')}**\n> 🔩 Bar & gem kamu tetap aman.`);
        const r = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [r] });
    }
}

// ==================== SELECT HANDLER (buy pickaxe) ====================
async function handleMiningSelectMenu(interaction) {
    const guildId = interaction.guild.id;
    const parts = interaction.customId.split('_');
    const userId = parts[parts.length - 1];
    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel tambang kamu!', ephemeral: true });
    }

    if (interaction.customId.startsWith('mine_smelt_select_')) {
        const barId = interaction.values[0];
        const recipe = SMELT_RECIPES.find(r => r.bar === barId);
        if (!recipe) return interaction.reply({ content: '❌ Resep tidak ditemukan!', ephemeral: true });
        const haveOre = getMatCount(guildId, userId, recipe.ore);
        const haveFuel = getMatCount(guildId, userId, FUEL_ORE);
        const possible = Math.min(Math.floor(haveOre / recipe.oreQty), Math.floor(haveFuel / recipe.fuel), 50);
        const oreDef = getMaterialDef(recipe.ore);
        const barDef = getMaterialDef(recipe.bar);
        const fuelDef = getMaterialDef(FUEL_ORE);
        if (possible <= 0) {
            return interaction.reply({ content: `❌ Bahan kurang! Butuh ${recipe.oreQty}× ${oreDef.emoji} ${oreDef.name} + ${recipe.fuel}× ${fuelDef.emoji} per batang.`, ephemeral: true });
        }
        removeMat(guildId, userId, recipe.ore, recipe.oreQty * possible);
        removeMat(guildId, userId, FUEL_ORE, recipe.fuel * possible);
        addOre(guildId, userId, recipe.bar, possible);
        const row = getMiningData(guildId, userId);
        const lvl = addMiningExp(row, recipe.exp * possible);
        saveMiningData(guildId, userId, row);
        incrementUserStat(guildId, userId, 'mining_bars_smelted', possible);
        updateQuestProgress(guildId, userId, 'mine_smelt', possible);
        checkAchievements(interaction.guild, userId, { type: 'mining_smelt' }).catch(() => {});
        let d = `🔥 Melebur **${possible}× ${barDef.emoji} ${barDef.name}**!\n\n> 🪨 −${recipe.oreQty * possible}× ${oreDef.name}\n> 🪵 −${recipe.fuel * possible}× ${fuelDef.name}\n> ✨ +${recipe.exp * possible} Mining EXP`;
        if (lvl.leveledUp) d += `\n> 🎉 **LEVEL UP!** → Lv.${lvl.newLevel}`;
        const embed = new EmbedBuilder().setColor('#E67E22').setTitle('🔥 Peleburan Selesai').setDescription(d);
        const r = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mine_smelt_${userId}`).setLabel('🔥 Smelt Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`mine_smith_${userId}`).setLabel('🔨 Smith').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [r] });
    }

    if (interaction.customId.startsWith('mine_smith_select_')) {
        const val = interaction.values[0];
        // === Core Forge (Legendary Drill / Artifact) ===
        if (val.startsWith('core_')) {
            const recipe = CORE_RECIPES.find(r => r.id === val.slice(5));
            if (!recipe) return interaction.reply({ content: '❌ Resep tidak ditemukan!', ephemeral: true });
            const miss = recipe.inputs.find(i => getMatCount(guildId, userId, i.mat) < i.qty);
            if (miss) { const md = getMaterialDef(miss.mat); return interaction.reply({ content: `❌ Bahan kurang! Butuh ${miss.qty}× ${md.emoji} ${md.name} (punya ${getMatCount(guildId, userId, miss.mat)}).`, ephemeral: true }); }
            const data = getMiningData(guildId, userId);
            if (recipe.type === 'pickaxe' && data.pickaxe === recipe.id) return interaction.reply({ content: '❌ Kamu sudah punya pickaxe itu!', ephemeral: true });
            if (recipe.type === 'artifact' && data.artifact) return interaction.reply({ content: "❌ Kamu sudah punya Miner's Artifact!", ephemeral: true });
            for (const i of recipe.inputs) removeMat(guildId, userId, i.mat, i.qty);
            let extra = '';
            if (recipe.type === 'pickaxe') { data.pickaxe = recipe.id; extra = '> ⛏️ Pickaxe pamungkas siap dipakai!'; }
            else if (recipe.type === 'artifact') { db.prepare('UPDATE mining_data SET artifact = 1 WHERE guildId = ? AND userId = ?').run(guildId, userId); extra = `> 🏺 Bonus permanen +${ARTIFACT_BONUS * 100}% nilai jual ore AKTIF!`; }
            addMiningExp(data, recipe.exp); saveMiningData(guildId, userId, data);
            incrementUserStat(guildId, userId, 'mining_core_crafts');
            const embed = new EmbedBuilder().setColor('#FFD700').setTitle(`👑 ${recipe.name} Ditempa!`)
                .setDescription(`${recipe.emoji} **${recipe.name}** berhasil dibuat!\n\n${extra}\n> ✨ +${recipe.exp} Mining EXP`);
            const r = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Panel').setStyle(ButtonStyle.Secondary));
            return interaction.update({ embeds: [embed], components: [r] });
        }
        const itemId = val;
        const recipe = SMITH_RECIPES.find(r => r.id === itemId);
        if (!recipe) return interaction.reply({ content: '❌ Resep tidak ditemukan!', ephemeral: true });
        const missing = recipe.inputs.find(i => getMatCount(guildId, userId, i.mat) < i.qty);
        if (missing) {
            const md = getMaterialDef(missing.mat);
            return interaction.reply({ content: `❌ Bar kurang! Butuh ${missing.qty}× ${md.emoji} ${md.name} (punya ${getMatCount(guildId, userId, missing.mat)}).`, ephemeral: true });
        }
        for (const i of recipe.inputs) removeMat(guildId, userId, i.mat, i.qty);
        if (recipe.out === 'mine') addOre(guildId, userId, recipe.id, 1);
        else addItem(guildId, userId, recipe.id, 1);
        const row = getMiningData(guildId, userId);
        const lvl = addMiningExp(row, recipe.exp);
        saveMiningData(guildId, userId, row);
        incrementUserStat(guildId, userId, 'mining_items_smithed');
        checkAchievements(interaction.guild, userId, { type: 'mining_smith' }).catch(() => {});
        const usedStr = recipe.inputs.map(i => `${i.qty}× ${getMaterialDef(i.mat).emoji}`).join(' + ');
        const dest = recipe.out === 'mine' ? '⛏️ Masuk kantong tambang' : '📦 Masuk inventory';
        let d = `🔨 Berhasil menempa **${recipe.emoji} ${recipe.name}**!\n\n> 🔩 Pakai: ${usedStr}\n> ${dest} — *${recipe.desc}*\n> ✨ +${recipe.exp} Mining EXP`;
        if (lvl.leveledUp) d += `\n> 🎉 **LEVEL UP!** → Lv.${lvl.newLevel}`;
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('🔨 Tempa Selesai').setDescription(d);
        const r = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mine_smith_${userId}`).setLabel('🔨 Tempa Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [r] });
    }

    if (interaction.customId.startsWith('mine_socket_select_')) {
        const gemId = interaction.values[0];
        const data = getMiningData(guildId, userId);
        const pickaxe = getPickaxe(data.pickaxe);
        const slots = socketSlots(pickaxe.tier);
        const socketed = getSockets(data);
        if (slots === 0) return interaction.reply({ content: '❌ Pickaxe ini belum punya slot socket! Upgrade dulu.', ephemeral: true });
        if (socketed.length >= slots) return interaction.reply({ content: `❌ Socket penuh (${slots}/${slots})! Lepas gem dulu.`, ephemeral: true });
        if (getMatCount(guildId, userId, gemId) < 1) return interaction.reply({ content: '❌ Kamu tidak punya gem itu!', ephemeral: true });
        removeMat(guildId, userId, gemId, 1);
        socketed.push(gemId);
        saveSockets(guildId, userId, socketed);
        return interaction.update(buildGemsPanel(guildId, userId, interaction.user.username));
    }

    if (interaction.customId.startsWith('mine_fuse_select_')) {
        const gemId = interaction.values[0];
        if (getMatCount(guildId, userId, gemId) < 3) return interaction.reply({ content: '❌ Butuh minimal 3 gem sama untuk fusion!', ephemeral: true });
        removeMat(guildId, userId, gemId, 3);
        addOre(guildId, userId, 'gem_star', 1);
        incrementUserStat(guildId, userId, 'mining_gems_fused');
        const gd = getMaterialDef(gemId);
        const embed = new EmbedBuilder().setColor('#F1C40F').setTitle('🔮 Fusion Berhasil!')
            .setDescription(`3× ${gd.emoji} ${gd.name} → 1× 🌟 **Star Gem**!\n\n> Star Gem memberi bonus **semua stat** saat di-socket.`);
        const r = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mine_gems_${userId}`).setLabel('💎 Gems').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [r] });
    }

    if (interaction.customId.startsWith('mine_shop_select_')) {
        const pickId = interaction.values[0];
        const pick = getPickaxe(pickId);
        const data = getMiningData(guildId, userId);
        const current = getPickaxe(data.pickaxe);
        if (pick.tier <= current.tier) return interaction.reply({ content: '❌ Kamu sudah punya pickaxe setara/lebih bagus!', ephemeral: true });
        const userData = getOrCreateUser(guildId, userId);
        if (userData.balance < pick.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${pick.price.toLocaleString('id-ID')}**`, ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(pick.price, guildId, userId);
        data.pickaxe = pick.id;
        saveMiningData(guildId, userId, data);
        incrementUserStat(guildId, userId, 'mining_pickaxe_upgrades');
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('🛒 Pickaxe Dibeli!')
            .setDescription(`${pick.emoji} **${pick.name}** (Tier ${pick.tier}) siap dipakai!\n\n> ⛏️ Stamina/swing: ${pick.staminaCost}\n> 🪨 Yield bonus: +${pick.yieldBonus}\n> 🕳️ Bisa turun sampai: **${pick.maxDepth}m**`);
        const r = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mine_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [r] });
    }
}

// ==================== DETECTORS ====================
function isMiningButton(customId) { return customId.startsWith('mine_') && !customId.includes('_select_'); }
function isMiningSelectMenu(customId) { return customId.startsWith('mine_') && customId.includes('_select_'); }

module.exports = {
    buildMiningPanel, handleMiningCommand, handleMiningButton, handleMiningSelectMenu,
    isMiningButton, isMiningSelectMenu,
};
