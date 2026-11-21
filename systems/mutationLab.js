// systems/mutationLab.js — Endgame pet mutation layer built on top of Fusion.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser, getItemCount, removeItem, incrementUserStat } = require('../database');
const { getPetData } = require('./pets');
const { PET_DATA } = require('../data/pets');

db.exec(`CREATE TABLE IF NOT EXISTS pet_mutation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    userId TEXT,
    petDbId INTEGER,
    traitId TEXT,
    success INTEGER DEFAULT 0,
    cost INTEGER DEFAULT 0,
    createdAt INTEGER
)`);
try { db.exec(`ALTER TABLE pets ADD COLUMN mutation_trait TEXT DEFAULT NULL`); } catch (e) {}
try { db.exec(`ALTER TABLE pets ADD COLUMN mutation_power INTEGER DEFAULT 0`); } catch (e) {}

const MUTATION_TRAITS = [
    { id: 'feral_instinct', name: 'Feral Instinct', emoji: '🩸', desc: '+ATK & CRIT — cocok buat boss/dungeon', weights: { atk: 0.10, crit: 3 } },
    { id: 'iron_guardian', name: 'Iron Guardian', emoji: '🛡️', desc: '+HP & DEF — pet lebih tahan lama', weights: { hp: 0.10, def: 0.10 } },
    { id: 'storm_runner', name: 'Storm Runner', emoji: '⚡', desc: '+SPD & ATK kecil — tempo battle lebih cepat', weights: { spd: 0.14, atk: 0.04 } },
    { id: 'lucky_hunter', name: 'Lucky Hunter', emoji: '🍀', desc: '+balanced stats — material hunter', weights: { hp: 0.05, atk: 0.05, def: 0.05, spd: 0.05, crit: 1 } },
    { id: 'ancient_bloodline', name: 'Ancient Bloodline', emoji: '🧬', desc: '+semua stat besar — ultra rare feel', weights: { hp: 0.08, atk: 0.08, def: 0.08, spd: 0.08, crit: 2 } },
];

const TIER_COST = {
    Common: { money: 15000, dna: 2, serum: 1, core: 0, rate: 72 },
    Uncommon: { money: 25000, dna: 3, serum: 1, core: 0, rate: 68 },
    Rare: { money: 50000, dna: 5, serum: 1, core: 0, rate: 62 },
    Epic: { money: 90000, dna: 7, serum: 1, core: 0, rate: 55 },
    Legendary: { money: 180000, dna: 10, serum: 2, core: 0, rate: 48 },
    Mythic: { money: 350000, dna: 14, serum: 2, core: 1, rate: 40 },
    Secret: { money: 750000, dna: 20, serum: 3, core: 1, rate: 32 },
    God: { money: 1500000, dna: 30, serum: 5, core: 2, rate: 25 },
};

function getTrait(id) {
    return MUTATION_TRAITS.find(t => t.id === id) || null;
}

function getPetTier(pet) {
    const def = pet ? PET_DATA.find(p => p.id === pet.petId) : null;
    return def ? def.tier : 'Common';
}

function getMutationCost(pet) {
    const tier = getPetTier(pet);
    const base = TIER_COST[tier] || TIER_COST.Common;
    const power = Math.max(0, pet?.mutation_power || 0);
    return {
        ...base,
        tier,
        money: Math.floor(base.money * (1 + power * 0.55)),
        dna: base.dna + power * 2,
        serum: base.serum + Math.floor(power / 2),
        core: base.core + (power >= 3 ? 1 : 0),
        rate: Math.max(12, base.rate - power * 7),
        power,
    };
}

function formatTrait(pet) {
    const trait = getTrait(pet?.mutation_trait);
    if (!trait) return 'Belum ada trait';
    return `${trait.emoji} **${trait.name}** +${pet.mutation_power || 1}`;
}

function buildMutationLabPanel(guildId, userId, username) {
    const pet = getPetData(guildId, userId);
    const userData = getOrCreateUser(guildId, userId);
    const dna = getItemCount(guildId, userId, 'dna_shard');
    const serum = getItemCount(guildId, userId, 'mutation_serum');
    const core = getItemCount(guildId, userId, 'ancient_core');
    const stabilizer = getItemCount(guildId, userId, 'trait_stabilizer');

    if (!pet) {
        const embed = new EmbedBuilder()
            .setTitle('🧪 Mutation Lab')
            .setColor('#9B59B6')
            .setDescription('❌ Kamu belum punya pet aktif. Aktifkan pet dulu dari `/pet`.');
        return { embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fusion_main_${userId}`).setLabel('🔙 Fusion').setStyle(ButtonStyle.Secondary))] };
    }

    const def = PET_DATA.find(p => p.id === pet.petId);
    const cost = getMutationCost(pet);
    const successRate = Math.min(95, cost.rate + (stabilizer > 0 ? 15 : 0));
    const canAfford = userData.balance >= cost.money && dna >= cost.dna && serum >= cost.serum && core >= cost.core && (pet.mutation_power || 0) < 5;

    const desc =
        `${def ? def.emoji : '🐾'} **${pet.name}** — *${cost.tier}* (Lv.${pet.level})\n` +
        `> Trait: ${formatTrait(pet)}\n` +
        `> Limit: **${pet.mutation_power || 0}/5** mutation stack\n\n` +
        `**🧬 Material Kamu**\n` +
        `> 🧬 DNA Shard: **${dna}** / ${cost.dna}\n` +
        `> 🧪 Mutation Serum: **${serum}** / ${cost.serum}\n` +
        `> 🔮 Ancient Core: **${core}** / ${cost.core}\n` +
        `> 🧯 Stabilizer: **${stabilizer}** ${stabilizer > 0 ? '(+15% rate, otomatis dipakai)' : ''}\n` +
        `> 🪙 Money: **${userData.balance.toLocaleString('id-ID')}** / ${cost.money.toLocaleString('id-ID')}\n\n` +
        `**Rate:** ${successRate}% | gagal hanya membakar material, pet tetap aman.\n` +
        `Material drop utama: **Dungeon Co-op**, dungeon, boss, expedition.`;

    const embed = new EmbedBuilder()
        .setTitle(`🧪 MUTATION LAB — ${username}`)
        .setColor(canAfford ? '#8E44AD' : '#E67E22')
        .setDescription(desc)
        .setFooter({ text: 'Mutation memberi trait + stat permanen untuk pet aktif.' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mutation_roll_${userId}`).setLabel('🧬 Mutate Active Pet').setStyle(ButtonStyle.Success).setDisabled(!canAfford),
        new ButtonBuilder().setCustomId(`mutation_history_${userId}`).setLabel('📜 History').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`fusion_main_${userId}`).setLabel('🔙 Fusion').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
}

function applyTraitStats(pet, trait) {
    const w = trait.weights || {};
    return {
        hp: Math.max(1, Math.floor((pet.hp || 100) * (1 + (w.hp || 0)))),
        atk: Math.max(1, Math.floor((pet.atk || 20) * (1 + (w.atk || 0)))),
        def: Math.max(1, Math.floor((pet.def || 10) * (1 + (w.def || 0)))),
        spd: Math.max(1, Math.floor((pet.spd || 10) * (1 + (w.spd || 0)))),
        crit: Math.min(40, Math.max(0, Math.floor((pet.crit || 5) + (w.crit || 0)))),
    };
}

function executeMutation(guildId, userId) {
    const pet = getPetData(guildId, userId);
    if (!pet) return { ok: false, error: '❌ Kamu belum punya pet aktif!' };
    if ((pet.mutation_power || 0) >= 5) return { ok: false, error: '✅ Pet ini sudah mencapai mutation stack maksimal!' };

    const userData = getOrCreateUser(guildId, userId);
    const cost = getMutationCost(pet);
    const hasStabilizer = getItemCount(guildId, userId, 'trait_stabilizer') > 0;
    if (userData.balance < cost.money) return { ok: false, error: `❌ Money kurang! Butuh 🪙 ${cost.money.toLocaleString('id-ID')}` };
    if (getItemCount(guildId, userId, 'dna_shard') < cost.dna) return { ok: false, error: `❌ DNA Shard kurang! Butuh ${cost.dna}` };
    if (getItemCount(guildId, userId, 'mutation_serum') < cost.serum) return { ok: false, error: `❌ Mutation Serum kurang! Butuh ${cost.serum}` };
    if (getItemCount(guildId, userId, 'ancient_core') < cost.core) return { ok: false, error: `❌ Ancient Core kurang! Butuh ${cost.core}` };

    db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(cost.money, guildId, userId);
    removeItem(guildId, userId, 'dna_shard', cost.dna);
    removeItem(guildId, userId, 'mutation_serum', cost.serum);
    if (cost.core > 0) removeItem(guildId, userId, 'ancient_core', cost.core);
    if (hasStabilizer) removeItem(guildId, userId, 'trait_stabilizer', 1);

    const rate = Math.min(95, cost.rate + (hasStabilizer ? 15 : 0));
    const success = Math.random() * 100 < rate;
    if (!success) {
        db.prepare('INSERT INTO pet_mutation_history (guildId, userId, petDbId, success, cost, createdAt) VALUES (?, ?, ?, 0, ?, ?)').run(guildId, userId, pet.id, cost.money, Date.now());
        incrementUserStat(guildId, userId, 'mutation_lab_fails');
        return { ok: true, success: false, rate, cost, pet };
    }

    const trait = MUTATION_TRAITS[Math.floor(Math.random() * MUTATION_TRAITS.length)];
    const stats = applyTraitStats(pet, trait);
    const nextPower = (pet.mutation_power || 0) + 1;
    db.prepare(`UPDATE pets SET mutation_trait = ?, mutation_power = ?, hp = ?, atk = ?, def = ?, spd = ?, crit = ? WHERE id = ? AND guildId = ? AND userId = ?`)
        .run(trait.id, nextPower, stats.hp, stats.atk, stats.def, stats.spd, stats.crit, pet.id, guildId, userId);
    db.prepare('INSERT INTO pet_mutation_history (guildId, userId, petDbId, traitId, success, cost, createdAt) VALUES (?, ?, ?, ?, 1, ?, ?)').run(guildId, userId, pet.id, trait.id, cost.money, Date.now());
    incrementUserStat(guildId, userId, 'mutation_lab_success');
    incrementUserStat(guildId, userId, 'mutation_lab_total');

    return { ok: true, success: true, rate, cost, pet, trait, stats, power: nextPower };
}

async function handleMutationButton(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.customId.split('_').pop();
    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Ini bukan lab kamu!', ephemeral: true });

    if (interaction.customId.startsWith('mutation_lab_')) {
        return interaction.update(buildMutationLabPanel(guildId, userId, interaction.user.username));
    }

    if (interaction.customId.startsWith('mutation_history_')) {
        const rows = db.prepare('SELECT * FROM pet_mutation_history WHERE guildId = ? AND userId = ? ORDER BY createdAt DESC LIMIT 10').all(guildId, userId);
        let desc = rows.length ? '' : '*Belum ada eksperimen mutation.*';
        for (const r of rows) {
            const trait = getTrait(r.traitId);
            desc += `${r.success ? '✅' : '❌'} ${trait ? `${trait.emoji} **${trait.name}**` : 'Mutation gagal'} — <t:${Math.floor(r.createdAt / 1000)}:R>\n`;
        }
        const embed = new EmbedBuilder().setTitle('📜 Mutation History').setColor('#8E44AD').setDescription(desc);
        return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mutation_lab_${userId}`).setLabel('🧪 Mutation Lab').setStyle(ButtonStyle.Primary))] });
    }

    if (interaction.customId.startsWith('mutation_roll_')) {
        const result = executeMutation(guildId, userId);
        if (!result.ok) return interaction.reply({ content: result.error, ephemeral: true });
        const embed = result.success
            ? new EmbedBuilder().setTitle('🧬✨ MUTATION BERHASIL!').setColor('#FFD700').setDescription(
                `${result.trait.emoji} **${result.pet.name}** mendapatkan trait **${result.trait.name} +${result.power}**!\n\n` +
                `> ${result.trait.desc}\n` +
                `> ❤️ HP ${result.pet.hp} → **${result.stats.hp}**\n` +
                `> ⚔️ ATK ${result.pet.atk} → **${result.stats.atk}**\n` +
                `> 🛡️ DEF ${result.pet.def} → **${result.stats.def}**\n` +
                `> 💨 SPD ${result.pet.spd} → **${result.stats.spd}**\n` +
                `> 🎯 CRIT ${result.pet.crit}% → **${result.stats.crit}%**\n\n` +
                `Rate roll: ${result.rate}%`
            )
            : new EmbedBuilder().setTitle('🧪 Mutation Gagal Stabil').setColor('#E74C3C').setDescription(
                `Eksperimen gagal, tapi pet **tetap aman**.\n\n> Material & money terpakai.\n> Rate roll: ${result.rate}%\n> Coba lagi dengan Stabilizer untuk peluang lebih tinggi.`
            );
        return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mutation_lab_${userId}`).setLabel('🧪 Mutation Lab').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pet_back_${userId}`).setLabel('🔙 Pet Panel').setStyle(ButtonStyle.Secondary)
        )] });
    }
}

function isMutationButton(customId) {
    return customId.startsWith('mutation_');
}

module.exports = {
    MUTATION_TRAITS,
    buildMutationLabPanel,
    executeMutation,
    handleMutationButton,
    isMutationButton,
    getTrait,
    formatTrait,
};
