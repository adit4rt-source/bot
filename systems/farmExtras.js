// systems/farmExtras.js — Contracts, Soil Affix, Showcase, Season Event, Co-op Contest, Deco bonuses
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { db, getOrCreateUser, getUserStat, setUserStat, incrementUserStat, addItem, removeItem, getItemCount, addIncome, hasFarmDecoration } = require('../database');
const { getRandomInt } = require('../utils');
const { FARM_CROPS, FARM_DECORATIONS } = require('../data/farming');
const { PRESTIGE_CROPS } = require('./farmMutation');

// ==================== DB ====================
db.exec(`CREATE TABLE IF NOT EXISTS farm_contracts (
    userId TEXT, date TEXT, data TEXT, PRIMARY KEY(userId, date)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS farm_soil (
    userId TEXT, plotIndex INTEGER, affix TEXT, PRIMARY KEY(userId, plotIndex)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS farm_showcase (
    userId TEXT, slot INTEGER, cropId TEXT, mutationType TEXT, qty INTEGER, placedAt INTEGER,
    PRIMARY KEY(userId, slot)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS farm_season_event (
    id INTEGER PRIMARY KEY DEFAULT 1,
    seasonId TEXT, cropId TEXT, startedAt INTEGER
)`);
db.exec(`CREATE TABLE IF NOT EXISTS farm_contest (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT, channelId TEXT, hostId TEXT,
    goal INTEGER, progress INTEGER DEFAULT 0,
    startedAt INTEGER, expiresAt INTEGER, status TEXT DEFAULT 'active'
)`);
db.exec(`CREATE TABLE IF NOT EXISTS farm_contest_contrib (
    contestId INTEGER, userId TEXT, amount INTEGER DEFAULT 0,
    PRIMARY KEY(contestId, userId)
)`);

function todayKey() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}
function monthKey() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
}

// ==================== CONTRACTS ====================
const CONTRACT_POOL = [
    { id: 'harvest_n', type: 'harvest', target: 8, desc: 'Panen **8 plot**', reward: { money: 10000, item: 'mystery_box', qty: 2 } },
    { id: 'plant_n', type: 'plant', target: 10, desc: 'Tanam **10 bibit**', reward: { money: 8000, item: 'pupuk_biasa', qty: 10 } },
    { id: 'craft_n', type: 'craft', target: 3, desc: 'Craft **3** produk', reward: { money: 15000, item: 'refine_stone', qty: 3 } },
    { id: 'water_n', type: 'water', target: 5, desc: 'Siram **5** kali (aksi water)', reward: { money: 5000, item: 'pupuk_premium', qty: 3 } },
    { id: 'feed_live', type: 'feed', target: 1, desc: 'Feed ternak **1** batch', reward: { money: 12000, item: 'chicken_feed', qty: 10 } },
    { id: 'collect_live', type: 'collect', target: 1, desc: 'Collect produk ternak **1** batch', reward: { money: 12000, item: 'cow_feed', qty: 5 } },
    { id: 'mutate', type: 'mutate', target: 1, desc: 'Dapat **1 mutasi** panen', reward: { money: 25000, item: 'lucky_charm', qty: 1 } },
    { id: 'sell_storage', type: 'sell', target: 20, desc: 'Jual **20** item storage', reward: { money: 10000, item: 'pupuk_ajaib', qty: 2 } },
];

function getContracts(userId) {
    const day = todayKey();
    let row = db.prepare('SELECT * FROM farm_contracts WHERE userId = ? AND date = ?').get(userId, day);
    if (!row) {
        const shuffled = [...CONTRACT_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
        const data = shuffled.map(c => ({
            id: c.id, type: c.type, target: c.target, desc: c.desc,
            reward: c.reward, progress: 0, claimed: false,
        }));
        db.prepare('INSERT INTO farm_contracts (userId, date, data) VALUES (?, ?, ?)').run(userId, day, JSON.stringify(data));
        return data;
    }
    return JSON.parse(row.data);
}

function saveContracts(userId, data) {
    db.prepare('UPDATE farm_contracts SET data = ? WHERE userId = ? AND date = ?').run(JSON.stringify(data), userId, todayKey());
}

function bumpContract(userId, event) {
    try {
        const list = getContracts(userId);
        let changed = false;
        for (const c of list) {
            if (c.claimed || c.progress >= c.target) continue;
            if (c.type === event.type) {
                c.progress += event.amount || 1;
                if (c.progress > c.target) c.progress = c.target;
                changed = true;
            }
        }
        if (changed) saveContracts(userId, list);
    } catch (_) {}
}

function claimContract(guildId, userId, index) {
    const list = getContracts(userId);
    const c = list[index];
    if (!c) return { ok: false, msg: 'Tidak ada.' };
    if (c.claimed) return { ok: false, msg: 'Sudah diklaim.' };
    if (c.progress < c.target) return { ok: false, msg: 'Belum selesai.' };
    c.claimed = true;
    saveContracts(userId, list);
    const r = c.reward;
    if (r.money) {
        const u = getOrCreateUser(guildId, userId);
        u.balance += r.money;
        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(u.balance, guildId, userId);
        addIncome(guildId, userId, 'farming', r.money);
    }
    if (r.item) {
        // pupuk goes to fert inventory if applicable
        try {
            const { addFert } = require('../database');
            if (String(r.item).startsWith('pupuk_')) addFert(guildId, userId, r.item, r.qty || 1);
            else addItem(guildId, userId, r.item, r.qty || 1);
        } catch (_) {
            addItem(guildId, userId, r.item, r.qty || 1);
        }
    }
    return { ok: true, contract: c };
}

function buildContractsPanel(guildId, userId) {
    const list = getContracts(userId);
    let desc = `📅 **Daily Farm Contracts** (00:00 WIB)\n\n`;
    list.forEach((c, i) => {
        const done = c.progress >= c.target;
        const st = c.claimed ? '✅' : done ? '🎁 SIAP' : `${c.progress}/${c.target}`;
        desc += `**${i + 1}.** ${c.desc}\n> ${st} · 🪙 ${(c.reward.money || 0).toLocaleString('id-ID')}`;
        if (c.reward.item) desc += ` + ${c.reward.item}×${c.reward.qty || 1}`;
        desc += `\n\n`;
    });
    const row = new ActionRowBuilder();
    list.forEach((c, i) => {
        row.addComponents(
            new ButtonBuilder().setCustomId(`farm_fclaim${i}_${userId}`)
                .setLabel(`Klaim #${i + 1}`).setStyle(ButtonStyle.Success)
                .setDisabled(c.claimed || c.progress < c.target)
        );
    });
    return {
        embeds: [new EmbedBuilder().setTitle('📋 Farm Contracts').setColor('#E67E22').setDescription(desc)],
        components: [row, new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_fmore_${userId}`).setLabel('🔙 More').setStyle(ButtonStyle.Secondary)
        )],
    };
}

// ==================== SOIL AFFIX ====================
const SOIL_AFFIXES = [
    { id: 'fertile', name: 'Fertile Soil', emoji: '🌱', desc: '+10% yield plot', cost: { money: 25000, pupuk_premium: 5 } },
    { id: 'swift', name: 'Swift Soil', emoji: '⚡', desc: '−12% grow time plot', cost: { money: 30000, pupuk_ajaib: 3 } },
    { id: 'mutable', name: 'Mutable Soil', emoji: '🧬', desc: '+4% mutation plot', cost: { money: 50000, mystic_herb: 2 } },
    { id: 'hardy', name: 'Hardy Soil', emoji: '🛡️', desc: '−50% pest/death chance plot', cost: { money: 40000, pesticide: 5 } },
    { id: 'golden', name: 'Golden Soil', emoji: '✨', desc: '+15% sell price crop from plot', cost: { money: 80000, crystal_flower: 1 } },
];

function getSoilAffix(userId, plotIndex) {
    const row = db.prepare('SELECT affix FROM farm_soil WHERE userId = ? AND plotIndex = ?').get(userId, plotIndex);
    return row ? row.affix : null;
}

function getSoilEffects(userId, plotIndex) {
    const id = getSoilAffix(userId, plotIndex);
    const fx = { yield: 0, grow: 0, mut: 0, hardy: 0, sell: 0 };
    if (id === 'fertile') fx.yield = 0.10;
    if (id === 'swift') fx.grow = 0.12;
    if (id === 'mutable') fx.mut = 0.04;
    if (id === 'hardy') fx.hardy = 0.5;
    if (id === 'golden') fx.sell = 0.15;
    return fx;
}

function setSoilAffix(guildId, userId, plotIndex, affixId) {
    const a = SOIL_AFFIXES.find(x => x.id === affixId);
    if (!a) return { ok: false, msg: 'Affix invalid' };
    const u = getOrCreateUser(guildId, userId);
    if (a.cost.money && u.balance < a.cost.money) return { ok: false, msg: 'Money kurang' };
    for (const [k, v] of Object.entries(a.cost)) {
        if (k === 'money') continue;
        if (k.startsWith('pupuk_')) {
            const { getFertCount, removeFert } = require('../database');
            if (getFertCount(guildId, userId, k) < v) return { ok: false, msg: `Butuh ${k}×${v}` };
        } else {
            // check storage or items
            const { getStorageQty } = require('./farming');
            const have = getStorageQty(guildId, userId, k) || getItemCount(guildId, userId, k);
            if (have < v) return { ok: false, msg: `Butuh ${k}×${v}` };
        }
    }
    if (a.cost.money) {
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(a.cost.money, guildId, userId);
    }
    for (const [k, v] of Object.entries(a.cost)) {
        if (k === 'money') continue;
        if (k.startsWith('pupuk_')) {
            require('../database').removeFert(guildId, userId, k, v);
        } else {
            const { removeStorage } = require('./farming');
            if (!removeStorage(guildId, userId, k, v)) removeItem(guildId, userId, k, v);
        }
    }
    db.prepare(`INSERT INTO farm_soil (userId, plotIndex, affix) VALUES (?, ?, ?)
        ON CONFLICT(userId, plotIndex) DO UPDATE SET affix = ?`).run(userId, plotIndex, affixId, affixId);
    return { ok: true, affix: a };
}

function buildSoilPanel(guildId, userId) {
    const { getFarmSlots } = require('./farming');
    const slots = getFarmSlots(guildId, userId);
    let desc = `🌍 **Soil Affix** — enchant per plot index (0-based display 1..${slots})\n\n`;
    for (let i = 0; i < Math.min(slots, 12); i++) {
        const id = getSoilAffix(userId, i);
        const a = SOIL_AFFIXES.find(x => x.id === id);
        desc += `> Plot **${i + 1}:** ${a ? a.emoji + ' ' + a.name : '*kosong*'}\n`;
    }
    desc += `\n**Affix:**\n`;
    for (const a of SOIL_AFFIXES) {
        const cost = Object.entries(a.cost).map(([k, v]) => k === 'money' ? `🪙${v.toLocaleString('id-ID')}` : `${k}×${v}`).join(', ');
        desc += `> ${a.emoji} **${a.name}** — ${a.desc}\n> -# ${cost}\n`;
    }
    const plotMenu = new StringSelectMenuBuilder().setCustomId(`farm_soilplot_${userId}`).setPlaceholder('Pilih plot...').setMinValues(1).setMaxValues(1);
    for (let i = 0; i < Math.min(slots, 25); i++) {
        plotMenu.addOptions({ label: `Plot ${i + 1}`, value: String(i) });
    }
    // store pending plot in user stat when selecting plot then affix
    return {
        embeds: [new EmbedBuilder().setTitle('🌍 Soil Affix').setColor('#8B4513').setDescription(desc)],
        components: [
            new ActionRowBuilder().addComponents(plotMenu),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`farm_fmore_${userId}`).setLabel('🔙 More').setStyle(ButtonStyle.Secondary)
            ),
        ],
    };
}

// ==================== SHOWCASE ====================
const SHOWCASE_SLOTS = 4;
function getShowcase(userId) {
    return db.prepare('SELECT * FROM farm_showcase WHERE userId = ? ORDER BY slot').all(userId);
}

function getShowcaseBonuses(userId) {
    const rows = getShowcase(userId);
    let yieldB = 0, mutB = 0, chat = 0;
    for (const r of rows) {
        yieldB += 0.5;
        if (r.mutationType) { yieldB += 1; mutB += 0.005; }
        chat += 0.3;
    }
    return {
        yieldBonus: Math.min(8, yieldB),
        mutBonus: Math.min(0.03, mutB),
        moneyChat: Math.min(3, chat),
    };
}

function placeShowcase(userId, slot, cropId, mutationType, qty) {
    if (slot < 0 || slot >= SHOWCASE_SLOTS) return { ok: false, msg: 'Slot invalid' };
    db.prepare(`INSERT OR REPLACE INTO farm_showcase (userId, slot, cropId, mutationType, qty, placedAt)
        VALUES (?, ?, ?, ?, ?, ?)`).run(userId, slot, cropId, mutationType || null, qty || 1, Date.now());
    return { ok: true };
}

function buildShowcasePanel(userId) {
    const rows = getShowcase(userId);
    const by = {};
    rows.forEach(r => { by[r.slot] = r; });
    const b = getShowcaseBonuses(userId);
    let desc = `🖼️ **Garden Showcase** (max ${SHOWCASE_SLOTS}) — flex + small passive\n\n`;
    for (let i = 0; i < SHOWCASE_SLOTS; i++) {
        const r = by[i];
        if (!r) { desc += `> Slot ${i + 1}: *kosong*\n`; continue; }
        const c = FARM_CROPS.find(x => x.id === r.cropId) || PRESTIGE_CROPS.find(x => x.id === r.cropId);
        desc += `> Slot ${i + 1}: ${c ? c.emoji : '🌱'} **${c ? c.name : r.cropId}**${r.mutationType ? ` ✨${r.mutationType}` : ''}\n`;
    }
    desc += `\n**Bonus:** yield +${b.yieldBonus.toFixed(1)}% · mut +${(b.mutBonus * 100).toFixed(2)}% · chat money +${b.moneyChat.toFixed(1)}%\n`;
    desc += `-# Pajang lewat tombol (mengambil 1 item dari storage).`;
    return {
        embeds: [new EmbedBuilder().setTitle('🖼️ Garden Showcase').setColor('#9B59B6').setDescription(desc)],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`farm_showadd_${userId}`).setLabel('➕ Pajang').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`farm_showclr_${userId}`).setLabel('🗑️ Clear').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`farm_fmore_${userId}`).setLabel('🔙 More').setStyle(ButtonStyle.Secondary),
            ),
        ],
    };
}

// ==================== SEASON EVENT (monthly featured crop) ====================
const SEASON_CROPS = ['gandum', 'strawberry', 'anggur', 'sakura', 'crystal_flower', 'lotus', 'golden_lotus', 'phoenix_flower'];

function getFarmSeasonEvent() {
    const month = monthKey();
    let row = db.prepare('SELECT * FROM farm_season_event WHERE id = 1').get();
    if (!row || row.seasonId !== month) {
        let h = 0;
        for (let i = 0; i < month.length; i++) h = (h * 31 + month.charCodeAt(i)) >>> 0;
        const cropId = SEASON_CROPS[h % SEASON_CROPS.length];
        db.prepare('INSERT OR REPLACE INTO farm_season_event (id, seasonId, cropId, startedAt) VALUES (1, ?, ?, ?)').run(month, cropId, Date.now());
        row = { seasonId: month, cropId, startedAt: Date.now() };
    }
    const crop = FARM_CROPS.find(c => c.id === row.cropId) || PRESTIGE_CROPS.find(c => c.id === row.cropId);
    return { ...row, crop };
}

function trackSeasonHarvest(userId, cropId, qty) {
    const s = getFarmSeasonEvent();
    if (s.cropId !== cropId) return;
    incrementUserStat(null, userId, `farm_season_${s.seasonId}_qty`, qty);
}

function buildSeasonEventPanel(userId) {
    const s = getFarmSeasonEvent();
    const qty = getUserStat(null, userId, `farm_season_${s.seasonId}_qty`) || 0;
    const desc =
        `🗓️ **Farm Season Event** \`${s.seasonId}\`\n\n` +
        `🎯 Featured: ${s.crop ? s.crop.emoji + ' **' + s.crop.name + '**' : s.cropId}\n` +
        `> Panen crop ini: **+20% yield** & **+3% mutasi**\n` +
        `> Progress kamu: **${qty}** item dipanen\n\n` +
        `-# Reset tiap bulan. Kejar leaderboard qty (stat tersimpan).`;
    return {
        embeds: [new EmbedBuilder().setTitle('🗓️ Farm Season').setColor('#F39C12').setDescription(desc)],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`farm_fmore_${userId}`).setLabel('🔙 More').setStyle(ButtonStyle.Secondary)
        )],
    };
}

// ==================== CO-OP HARVEST CONTEST ====================
function startContest(guildId, channelId, hostId) {
    const goal = 50;
    const info = db.prepare(`INSERT INTO farm_contest (guildId, channelId, hostId, goal, progress, startedAt, expiresAt, status)
        VALUES (?, ?, ?, ?, 0, ?, ?, 'active')`).run(guildId, channelId, hostId, goal, Date.now(), Date.now() + 30 * 60 * 1000);
    return info.lastInsertRowid;
}

function getActiveContest(channelId) {
    return db.prepare(`SELECT * FROM farm_contest WHERE channelId = ? AND status = 'active' AND expiresAt > ? ORDER BY id DESC LIMIT 1`)
        .get(channelId, Date.now());
}

function contribContest(contestId, userId, amount) {
    const c = db.prepare('SELECT * FROM farm_contest WHERE id = ?').get(contestId);
    if (!c || c.status !== 'active') return { ok: false };
    db.prepare(`INSERT INTO farm_contest_contrib (contestId, userId, amount) VALUES (?, ?, ?)
        ON CONFLICT(contestId, userId) DO UPDATE SET amount = amount + ?`).run(contestId, userId, amount, amount);
    const newProg = c.progress + amount;
    db.prepare('UPDATE farm_contest SET progress = ? WHERE id = ?').run(newProg, contestId);
    if (newProg >= c.goal) {
        db.prepare(`UPDATE farm_contest SET status = 'done' WHERE id = ?`).run(contestId);
        return { ok: true, done: true, progress: newProg, goal: c.goal };
    }
    return { ok: true, done: false, progress: newProg, goal: c.goal };
}

function rewardContest(guildId, contestId) {
    const rows = db.prepare('SELECT * FROM farm_contest_contrib WHERE contestId = ? ORDER BY amount DESC').all(contestId);
    const total = rows.reduce((s, r) => s + r.amount, 0) || 1;
    const results = [];
    for (const r of rows) {
        const share = r.amount / total;
        const money = Math.floor(50000 * share) + 5000;
        const u = getOrCreateUser(guildId, r.userId);
        u.balance += money;
        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(u.balance, guildId, r.userId);
        addIncome(guildId, r.userId, 'farming', money);
        if (r.amount >= 10) addItem(guildId, r.userId, 'mystery_box', 2);
        results.push({ userId: r.userId, amount: r.amount, money });
    }
    return results;
}

function buildContestEmbed(contest) {
    const barLen = 12;
    const filled = Math.min(barLen, Math.floor((contest.progress / contest.goal) * barLen));
    const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
    return new EmbedBuilder()
        .setTitle('🏆 Farm Co-op Harvest Contest')
        .setColor('#E74C3C')
        .setDescription(
            `Target panen bersama: **${contest.goal}** plot!\n` +
            `Progress: \`${bar}\` **${contest.progress}/${contest.goal}**\n` +
            `Host: <@${contest.hostId}>\n` +
            `⏳ <t:${Math.floor(contest.expiresAt / 1000)}:R>\n\n` +
            `Setiap **Harvest** di channel ini menambah progress. Loot split by contribution!`
        );
}

// ==================== DECO REAL EFFECTS ====================
function getDecorationBonuses(guildId, userId) {
    const fx = { pestResist: 0, yield: 0, grow: 0, mut: 0, bee: 0 };
    try {
        if (hasFarmDecoration(guildId, userId, 'scarecrow')) fx.pestResist += 0.25;
        if (hasFarmDecoration(guildId, userId, 'bee_hive')) { fx.yield += 0.05; fx.bee = 1; }
        if (hasFarmDecoration(guildId, userId, 'fountain')) fx.grow += 0.05;
        if (hasFarmDecoration(guildId, userId, 'windmill')) fx.grow += 0.03;
        if (hasFarmDecoration(guildId, userId, 'flower_bed')) fx.mut += 0.02;
        if (hasFarmDecoration(guildId, userId, 'pond')) fx.yield += 0.03;
        if (hasFarmDecoration(guildId, userId, 'greenhouse')) fx.grow += 0.05; // deco greenhouse, not GH plots
        if (hasFarmDecoration(guildId, userId, 'golden_statue')) { fx.yield += 0.08; fx.mut += 0.02; }
    } catch (_) {}
    return fx;
}

// ==================== MORE HUB ====================
function buildFarmMoreHub(guildId, userId, username) {
    const { getMastery, getMasteryBonuses } = require('./farmMastery');
    const m = getMastery(userId);
    const b = getMasteryBonuses(userId);
    const s = getFarmSeasonEvent();
    const sc = getShowcaseBonuses(userId);
    const embed = new EmbedBuilder()
        .setTitle(`🌾 Farm More — ${username}`)
        .setColor('#27AE60')
        .setDescription(
            `🏅 Mastery **Rank ${m.rank}** ${b.title || ''}\n` +
            `🗓️ Season crop: ${s.crop ? s.crop.emoji + ' ' + s.crop.name : s.cropId}\n` +
            `🖼️ Showcase yield +${sc.yieldBonus.toFixed(1)}%\n\n` +
            `Pilih fitur lanjutan:`
        );
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_fmaster_${userId}`).setLabel('Mastery').setEmoji('🏅').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_fcontracts_${userId}`).setLabel('Contracts').setEmoji('📋').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`farm_fsoil_${userId}`).setLabel('Soil').setEmoji('🌍').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`farm_fshow_${userId}`).setLabel('Showcase').setEmoji('🖼️').setStyle(ButtonStyle.Success),
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`farm_fseason_${userId}`).setLabel('Season').setEmoji('🗓️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`farm_fcontest_${userId}`).setLabel('Co-op Contest').setEmoji('🏆').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`farm_hub_${userId}`).setLabel('Main Hub').setEmoji('🌾').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row1, row2] };
}

module.exports = {
    getContracts, bumpContract, claimContract, buildContractsPanel,
    SOIL_AFFIXES, getSoilAffix, getSoilEffects, setSoilAffix, buildSoilPanel,
    SHOWCASE_SLOTS, getShowcase, getShowcaseBonuses, placeShowcase, buildShowcasePanel,
    getFarmSeasonEvent, trackSeasonHarvest, buildSeasonEventPanel,
    startContest, getActiveContest, contribContest, rewardContest, buildContestEmbed,
    getDecorationBonuses,
    buildFarmMoreHub,
};
