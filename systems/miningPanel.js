// systems/miningPanel.js — Mining System Panel (Phase 1 MVP)
// Loop: Dig (kelola stamina) -> kumpul Ore -> Descend lebih dalam -> jual / upgrade pickaxe.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { db, getOrCreateUser, incrementUserStat, getUserStat, addIncome } = require('../database');
const { getRandomInt } = require('../utils');
const ui = require('./ui');
const {
    PICKAXE_TYPES, ORE_TIERS, MINE_LAYERS,
    STAMINA_REGEN_MS, STAMINA_BASE, STAMINA_PER_LEVEL, DESCEND_STEP, MAX_MINING_LEVEL,
    getMiningExpNeeded, getLayerForDepth, getPickaxe, getOreDef,
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

// ==================== HELPERS ====================
function maxStamina(level) { return STAMINA_BASE + (level - 1) * STAMINA_PER_LEVEL; }

// Hitung regen stamina berbasis waktu, mutasi objek row (belum disimpan ke DB).
function syncStamina(row) {
    const max = maxStamina(row.level);
    const now = Date.now();
    if (!row.staminaTs) row.staminaTs = now;
    if (row.stamina >= max) { row.stamina = max; row.staminaTs = now; return row; }
    const regen = Math.floor((now - row.staminaTs) / STAMINA_REGEN_MS);
    if (regen > 0) {
        row.stamina = Math.min(max, row.stamina + regen);
        row.staminaTs = row.stamina >= max ? now : row.staminaTs + regen * STAMINA_REGEN_MS;
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

    const embed = new EmbedBuilder()
        .setColor(ui.COLORS && ui.COLORS.economy ? ui.COLORS.economy : '#C9A227')
        .setTitle(`⛏️ TAMBANG — ${username}`)
        .setDescription(
            `${pickaxe.emoji} **${pickaxe.name}** (Tier ${pickaxe.tier})${row.prestige > 0 ? ` • ⭐ Prestige ${row.prestige}` : ''}\n` +
            `> ⚒️ Mining Lv.**${row.level}** \`${bar(expPct)}\` ${row.level >= MAX_MINING_LEVEL ? 'MAX' : `${row.exp}/${expNeed}`}\n` +
            `> ⚡ Stamina: \`${bar(staPct)}\` **${row.stamina}/${max}**${row.stamina < max ? ` (+1 / menit)` : ''}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📍 Kedalaman: **${row.depth}m** — ${layer.name}\n` +
            `> 🪨 Ore di sini: ${orePreview}\n` +
            `> ⛏️ Biaya gali: **${pickaxe.staminaCost}** stamina/swing\n` +
            `> 🕳️ Batas pickaxe: **${pickaxe.maxDepth}m**${atMaxDepth ? ' ⚠️ *(upgrade untuk lebih dalam)*' : ''}\n` +
            `> ${ui.money(userData.balance)}`
        )
        .setFooter({ text: 'Dig pakai stamina • Descend untuk ore lebih langka • Smelt/Smith menyusul!' });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mine_dig_${userId}`).setLabel('⛏️ Dig').setStyle(ButtonStyle.Success).setDisabled(row.stamina < pickaxe.staminaCost),
        new ButtonBuilder().setCustomId(`mine_descend_${userId}`).setLabel('⬇️ Descend').setStyle(ButtonStyle.Primary).setDisabled(atMaxDepth),
        new ButtonBuilder().setCustomId(`mine_surface_${userId}`).setLabel('⬆️ Surface').setStyle(ButtonStyle.Secondary).setDisabled(row.depth === 0),
        new ButtonBuilder().setCustomId(`mine_refresh_${userId}`).setLabel('🔄').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mine_ores_${userId}`).setLabel('🎒 Ores').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`mine_shop_${userId}`).setLabel('🛒 Pickaxe Shop').setStyle(ButtonStyle.Success)
    );
    return { embeds: [embed], components: [row1, row2] };
}

// ==================== BUILD ORES (inventory) ====================
function buildOresPanel(guildId, userId, username) {
    const ores = getOres(guildId, userId).sort((a, b) => getOreDef(b.oreId).value - getOreDef(a.oreId).value);
    let totalValue = 0, totalQty = 0;
    let desc = '';
    if (ores.length === 0) {
        desc = '🎒 Kantong ore kosong! Gali dulu di tambang.';
    } else {
        ores.forEach(o => {
            const def = getOreDef(o.oreId);
            const val = def.value * o.quantity;
            totalValue += val; totalQty += o.quantity;
            desc += `> ${def.emoji} **${def.name}** ×${o.quantity} — 🪙 ${val.toLocaleString('id-ID')}\n`;
        });
        desc += `\n━━━━━━━━━━━━━━━━━━━━━━\n> 📦 Total: **${totalQty}** ore • 🪙 **${totalValue.toLocaleString('id-ID')}**`;
    }
    const embed = new EmbedBuilder().setColor('#C9A227').setTitle('🎒 Kantong Ore').setDescription(desc);
    const r = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mine_sellores_${userId}`).setLabel('💰 Jual Semua Ore').setStyle(ButtonStyle.Danger).setDisabled(ores.length === 0),
        new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [r] };
}

// ==================== BUILD PICKAXE SHOP ====================
function buildShopPanel(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);
    const data = getMiningData(guildId, userId);
    const current = getPickaxe(data.pickaxe);

    let desc = `${current.emoji} Pickaxe sekarang: **${current.name}** (Tier ${current.tier})\n> 💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**\n\n**Daftar Pickaxe:**\n`;
    PICKAXE_TYPES.forEach(p => {
        const owned = p.tier <= current.tier;
        const tag = p.tier === current.tier ? ' ✅ dipakai' : owned ? ' (terlewati)' : '';
        desc += `> ${p.emoji} **${p.name}** (T${p.tier}) — ${p.price === 0 ? 'gratis' : `🪙 ${p.price.toLocaleString('id-ID')}`}${tag}\n`;
        desc += `> ┗ Stamina/swing: ${p.staminaCost} • Yield +${p.yieldBonus} • Max ${p.maxDepth}m\n`;
    });

    const buyable = PICKAXE_TYPES.filter(p => p.tier > current.tier);
    const components = [];
    if (buyable.length > 0) {
        const menu = new StringSelectMenuBuilder().setCustomId(`mine_shop_select_${userId}`).setPlaceholder('🛒 Beli pickaxe...').setMinValues(1).setMaxValues(1);
        buyable.forEach(p => {
            menu.addOptions(new StringSelectMenuOptionBuilder()
                .setLabel(`${p.name} (T${p.tier}) — 🪙${p.price.toLocaleString('id-ID')}`)
                .setValue(p.id)
                .setDescription(`Stamina ${p.staminaCost} | Yield +${p.yieldBonus} | Max ${p.maxDepth}m`));
        });
        components.push(new ActionRowBuilder().addComponents(menu));
    }
    components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
    ));
    const embed = new EmbedBuilder().setColor('#27AE60').setTitle('🛒 Pickaxe Shop').setDescription(desc);
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

    if (action === 'shop') {
        return interaction.update(buildShopPanel(guildId, userId, interaction.user.username));
    }

    if (action === 'dig') {
        const row = getMiningData(guildId, userId);
        const pickaxe = getPickaxe(row.pickaxe);
        if (row.stamina < pickaxe.staminaCost) {
            const eta = staminaETA(row);
            return interaction.reply({ content: `❌ Stamina kurang! Butuh **${pickaxe.staminaCost}**, punya **${row.stamina}**.${eta ? ` (+1 dalam ${eta}s)` : ''}`, ephemeral: true });
        }
        row.stamina -= pickaxe.staminaCost;
        if (row.staminaTs === 0 || row.stamina === maxStamina(row.level) - pickaxe.staminaCost) row.staminaTs = Date.now();

        const layer = getLayerForDepth(row.depth);
        const yieldCount = 1 + getRandomInt(0, pickaxe.yieldBonus) + Math.floor(row.level / 25);
        const gained = {};
        let expGain = 0;
        for (let i = 0; i < yieldCount; i++) {
            const oreId = pickOre(layer);
            gained[oreId] = (gained[oreId] || 0) + 1;
            expGain += getOreDef(oreId).exp;
        }
        for (const [oreId, qty] of Object.entries(gained)) addOre(guildId, userId, oreId, qty);

        const lvl = addMiningExp(row, expGain);
        row.totalDigs++;
        saveMiningData(guildId, userId, row);
        incrementUserStat(guildId, userId, 'mining_digs');

        const max = maxStamina(row.level);
        const gainedText = Object.entries(gained)
            .sort((a, b) => getOreDef(b[0]).value - getOreDef(a[0]).value)
            .map(([id, q]) => `> ${getOreDef(id).emoji} **${getOreDef(id).name}** ×${q}`).join('\n');
        let resultDesc = `${pickaxe.emoji} *Crack!* Kamu menggali di **${row.depth}m** (${layer.name})\n\n${gainedText}\n\n> ✨ +${expGain} Mining EXP\n> ⚡ Stamina: **${row.stamina}/${max}**`;
        if (lvl.leveledUp) resultDesc += `\n> 🎉 **MINING LEVEL UP!** → Lv.${lvl.newLevel} (max stamina naik!)`;

        const embed = new EmbedBuilder().setColor('#C9A227').setTitle('⛏️ Hasil Galian').setDescription(resultDesc);
        const r = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mine_dig_${userId}`).setLabel('⛏️ Dig Lagi').setStyle(ButtonStyle.Success).setDisabled(row.stamina < pickaxe.staminaCost),
            new ButtonBuilder().setCustomId(`mine_ores_${userId}`).setLabel('🎒 Ores').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`mine_back_${userId}`).setLabel('🔙 Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [r] });
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

    if (action === 'sellores') {
        const ores = getOres(guildId, userId);
        if (ores.length === 0) return interaction.reply({ content: '❌ Tidak ada ore untuk dijual!', ephemeral: true });
        let total = 0, count = 0;
        ores.forEach(o => { total += getOreDef(o.oreId).value * o.quantity; count += o.quantity; });
        db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(total, guildId, userId);
        db.prepare('DELETE FROM ore_inventory WHERE guildId = ? AND userId = ?').run(guildId, userId);
        addIncome(guildId, userId, 'mining', total);
        incrementUserStat(guildId, userId, 'mining_ore_sold', count);
        const fresh = getOrCreateUser(guildId, userId);
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('💰 Ore Terjual!')
            .setDescription(`Menjual **${count}** ore → 🪙 **${total.toLocaleString('id-ID')}**\n\n> 💳 Saldo: 🪙 **${fresh.balance.toLocaleString('id-ID')}**`);
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
