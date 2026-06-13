// systems/dungeonCoop.js — Short-lived roguelike co-op dungeon sessions.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, addItem, incrementUserStat, addIncome } = require('../database');
const { getRandomInt } = require('../utils');
const { getPetData, addPetExp, getEffectiveStats, ELEMENT_EMOJI } = require('./pets');
const { PET_DATA } = require('../data/pets');
const { checkAchievements } = require('./achievements');

const activeDungeonRuns = new Map();

const ROOM_TYPES = [
    { id: 'battle', name: 'Monster Ambush', emoji: '⚔️' },
    { id: 'chest', name: 'Cursed Chest', emoji: '🧰' },
    { id: 'shrine', name: 'Ancient Shrine', emoji: '🗿' },
    { id: 'trap', name: 'Rune Trap', emoji: '🪤' },
    { id: 'merchant', name: 'Lost Merchant', emoji: '🧙' },
];

const COOP_DUNGEONS = [
    { id: 'crypt', name: '🕯️ Forgotten Crypt', minLevel: 15, rooms: 4, boss: 'Crypt Warden', element: 'dark', power: 280, reward: [2500, 6500], exp: 18, cooldown: 3 * 60 * 1000 },
    { id: 'labyrinth', name: '🌀 Shifting Labyrinth', minLevel: 40, rooms: 5, boss: 'Maze Tyrant', element: 'nature', power: 620, reward: [7000, 16000], exp: 32, cooldown: 5 * 60 * 1000 },
    { id: 'abyss', name: '🌌 Abyss Gate', minLevel: 85, rooms: 6, boss: 'Abyss Herald', element: 'dark', power: 1250, reward: [18000, 42000], exp: 55, cooldown: 8 * 60 * 1000 },
];

function runKey(guildId, leaderId) {
    return `${guildId}_${leaderId}`;
}

function getActivePetLine(guildId, userId, leader = false) {
    const pet = getPetData(guildId, userId);
    if (!pet) return `${leader ? '👑 ' : ''}<@${userId}> — ❌ no active pet`;
    const def = PET_DATA.find(p => p.id === pet.petId);
    return `${leader ? '👑 ' : ''}<@${userId}> — ${def ? def.emoji : '🐾'} ${pet.name} Lv.${pet.level}`;
}

function petPower(pet) {
    if (!pet) return 0;
    const eff = getEffectiveStats(pet);
    return Math.floor((eff.hp || pet.hp || 0) / 4 + (eff.atk || pet.atk || 0) * 2.2 + (eff.def || pet.def || 0) * 1.4 + (eff.spd || pet.spd || 0) + (eff.crit || pet.crit || 0) * 2 + (pet.level || 1) * 4);
}

function partyPower(run) {
    return run.members.reduce((sum, userId) => sum + petPower(getPetData(run.guildId, userId)), 0);
}

function createRun(guildId, leaderId, dungeonId = 'crypt', channelId = null) {
    const dungeon = COOP_DUNGEONS.find(d => d.id === dungeonId) || COOP_DUNGEONS[0];
    const pet = getPetData(guildId, leaderId);
    if (!pet) return { ok: false, error: '❌ Kamu butuh pet aktif untuk buka co-op dungeon!' };
    if (pet.level < dungeon.minLevel) return { ok: false, error: `❌ Pet butuh minimal Lv.${dungeon.minLevel} untuk ${dungeon.name}.` };
    
    const cooldowns = require('./cooldowns');
    if (cooldowns.isOnCooldown('dngcoop', guildId, leaderId)) {
        const remaining = cooldowns.getRemainingSec('dngcoop', guildId, leaderId);
        return { ok: false, error: `❌ Kamu sedang cooldown Co-op Dungeon! Tunggu **${remaining} detik**.` };
    }

    const key = runKey(guildId, leaderId);
    if (activeDungeonRuns.has(key)) return { ok: false, error: '❌ Kamu sudah punya dungeon run aktif.' };
    const run = {
        guildId, leaderId, channelId,
        dungeonId: dungeon.id,
        members: [leaderId],
        room: 0,
        hp: 100,
        buffs: [],
        loot: { money: 0, dna_shard: 0, mutation_serum: 0, ancient_core: 0, trait_stabilizer: 0 },
        log: [`👑 <@${leaderId}> membuka portal ${dungeon.name}.`],
        createdAt: Date.now(),
    };
    activeDungeonRuns.set(key, run);
    setTimeout(() => activeDungeonRuns.delete(key), 10 * 60 * 1000);
    return { ok: true, run };
}

function joinRun(guildId, leaderId, userId) {
    const run = activeDungeonRuns.get(runKey(guildId, leaderId));
    if (!run) return { ok: false, error: '❌ Dungeon run sudah tidak aktif.' };
    if (run.room > 0) return { ok: false, error: '❌ Run sudah dimulai.' };
    if (run.members.includes(userId)) return { ok: false, error: '✅ Kamu sudah join party ini.' };
    if (run.members.length >= 4) return { ok: false, error: '❌ Party penuh. Maksimal 4 player.' };
    const dungeon = COOP_DUNGEONS.find(d => d.id === run.dungeonId);
    
    const cooldowns = require('./cooldowns');
    if (cooldowns.isOnCooldown('dngcoop', guildId, userId)) {
        const remaining = cooldowns.getRemainingSec('dngcoop', guildId, userId);
        return { ok: false, error: `❌ Kamu sedang cooldown Co-op Dungeon! Tunggu **${remaining} detik**.` };
    }

    const pet = getPetData(guildId, userId);
    if (!pet) return { ok: false, error: '❌ Kamu butuh pet aktif untuk join.' };
    if (pet.level < dungeon.minLevel) return { ok: false, error: `❌ Pet kamu butuh minimal Lv.${dungeon.minLevel}.` };
    run.members.push(userId);
    run.log.push(`➕ <@${userId}> masuk party.`);
    return { ok: true, run };
}

function rollMaterial(run, tierBoost = 0) {
    run.loot.dna_shard += getRandomInt(1 + tierBoost, 3 + tierBoost);
    if (Math.random() < 0.45 + tierBoost * 0.08) run.loot.mutation_serum += 1;
    if (Math.random() < 0.10 + tierBoost * 0.05) run.loot.ancient_core += 1;
    if (Math.random() < 0.08 + tierBoost * 0.04) run.loot.trait_stabilizer += 1;
}

function resolveNextRoom(run) {
    const dungeon = COOP_DUNGEONS.find(d => d.id === run.dungeonId) || COOP_DUNGEONS[0];
    if (run.finished) return run;
    run.room += 1;
    const isBoss = run.room >= dungeon.rooms;
    const power = partyPower(run);
    const buffMult = 1 + run.buffs.length * 0.08;
    const target = isBoss ? dungeon.power * (1 + run.room * 0.28) : dungeon.power * (0.55 + run.room * 0.16);
    const effectivePower = power * buffMult * (0.85 + Math.random() * 0.35);

    if (isBoss) {
        const won = effectivePower >= target || run.hp >= 70;
        if (won) {
            const money = getRandomInt(dungeon.reward[0], dungeon.reward[1]) * Math.max(1, run.members.length);
            run.loot.money += money;
            rollMaterial(run, dungeon.id === 'abyss' ? 2 : dungeon.id === 'labyrinth' ? 1 : 0);
            run.log.push(`👹 **${dungeon.boss}** tumbang! Party power ${Math.floor(effectivePower)} vs ${Math.floor(target)}.`);
            run.cleared = true;
        } else {
            run.hp = Math.max(0, run.hp - 45);
            run.log.push(`💀 **${dungeon.boss}** terlalu kuat. Party mundur dengan sisa loot.`);
            run.cleared = false;
        }
        run.finished = true;
        return run;
    }

    const room = ROOM_TYPES[Math.floor(Math.random() * ROOM_TYPES.length)];
    if (room.id === 'battle') {
        const won = effectivePower >= target;
        if (won) {
            const money = getRandomInt(700, 1800) * run.members.length;
            run.loot.money += money;
            rollMaterial(run, 0);
            run.log.push(`${room.emoji} Room ${run.room}: **${room.name}** clear. +🪙 ${money.toLocaleString('id-ID')}`);
        } else {
            run.hp = Math.max(1, run.hp - getRandomInt(16, 30));
            run.log.push(`${room.emoji} Room ${run.room}: menang tipis, party HP turun ke ${run.hp}%.`);
        }
    } else if (room.id === 'chest') {
        rollMaterial(run, 1);
        run.log.push(`${room.emoji} Room ${run.room}: chest dibuka, material mutation ditemukan.`);
    } else if (room.id === 'shrine') {
        run.buffs.push('shrine');
        run.hp = Math.min(100, run.hp + 18);
        run.log.push(`${room.emoji} Room ${run.room}: shrine memberi +8% power run dan heal party.`);
    } else if (room.id === 'trap') {
        run.hp = Math.max(1, run.hp - getRandomInt(10, 24));
        run.loot.dna_shard += 1;
        run.log.push(`${room.emoji} Room ${run.room}: trap aktif, tapi ada DNA Shard di reruntuhan.`);
    } else {
        run.loot.trait_stabilizer += Math.random() < 0.35 ? 1 : 0;
        run.loot.money += getRandomInt(500, 1600);
        run.log.push(`${room.emoji} Room ${run.room}: merchant memberi supply acak.`);
    }
    return run;
}

function awardRun(run) {
    if (run.awarded) return run.lastAward || { perMemberMoney: 0, perMemberItems: {} };
    const dungeon = COOP_DUNGEONS.find(d => d.id === run.dungeonId) || COOP_DUNGEONS[0];
    const memberCount = Math.max(1, run.members.length);
    const perMemberMoney = Math.floor((run.loot.money || 0) / memberCount);
    const perMemberItems = {
        dna_shard: (run.loot.dna_shard || 0) > 0 ? Math.max(1, Math.floor((run.loot.dna_shard || 0) / memberCount)) : 0,
        mutation_serum: Math.floor((run.loot.mutation_serum || 0) / memberCount),
        ancient_core: Math.floor((run.loot.ancient_core || 0) / memberCount),
        trait_stabilizer: Math.floor((run.loot.trait_stabilizer || 0) / memberCount),
    };
    const cooldowns = require('./cooldowns');
    const cdTime = dungeon.cooldown || 15 * 60 * 1000;
    for (const userId of run.members) {
        if (perMemberMoney > 0) {
            db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(perMemberMoney, run.guildId, userId);
            addIncome(run.guildId, userId, 'battle', perMemberMoney);
        }
        for (const [item, qty] of Object.entries(perMemberItems)) if (qty > 0) addItem(run.guildId, userId, item, qty);
        addPetExp(run.guildId, userId, run.cleared ? dungeon.exp : Math.floor(dungeon.exp * 0.35));
        incrementUserStat(run.guildId, userId, run.cleared ? 'coop_dungeon_clears' : 'coop_dungeon_runs');
        if (run.cleared) incrementUserStat(run.guildId, userId, 'dungeon_clears');
        
        // Set Co-op Dungeon cooldown for all participating members
        cooldowns.setCooldown('dngcoop', run.guildId, userId, cdTime);
    }
    run.awarded = true;
    run.lastAward = { perMemberMoney, perMemberItems };
    return run.lastAward;
}

function buildRunMessage(run) {
    const dungeon = COOP_DUNGEONS.find(d => d.id === run.dungeonId) || COOP_DUNGEONS[0];
    const members = run.members.map(id => `> ${getActivePetLine(run.guildId, id, id === run.leaderId)}`).join('\n');
    const lastLog = run.log.slice(-7).join('\n');
    const loot = `🪙 ${run.loot.money.toLocaleString('id-ID')} | 🧬 ${run.loot.dna_shard} | 🧪 ${run.loot.mutation_serum} | 🔮 ${run.loot.ancient_core} | 🧯 ${run.loot.trait_stabilizer}`;
    const embed = new EmbedBuilder()
        .setTitle(`${dungeon.name} — Co-op Roguelike`)
        .setColor(run.finished ? (run.cleared ? '#2ECC71' : '#E74C3C') : '#5865F2')
        .setDescription(
            `Room: **${Math.min(run.room, dungeon.rooms)}/${dungeon.rooms}** ${ELEMENT_EMOJI[dungeon.element] || ''} | Party HP: **${run.hp}%** | Buff: **${run.buffs.length}**\n\n` +
            `**Party (${run.members.length}/4)**\n${members}\n\n` +
            `**Loot Pool:** ${loot}\n\n` +
            `**Log**\n${lastLog}`
        )
        .setFooter({ text: run.room === 0 ? 'Klik Join, lalu leader Start.' : 'Leader menekan Explore untuk lanjut room.' });

    const row = new ActionRowBuilder();
    if (run.room === 0) {
        row.addComponents(
            new ButtonBuilder().setCustomId(`dngcoop_join_${run.leaderId}`).setLabel(`➕ Join (${run.members.length}/4)`).setStyle(ButtonStyle.Success).setDisabled(run.members.length >= 4),
            new ButtonBuilder().setCustomId(`dngcoop_start_${run.leaderId}`).setLabel('⚔️ Start Run').setStyle(ButtonStyle.Danger)
        );
    } else if (!run.finished) {
        row.addComponents(new ButtonBuilder().setCustomId(`dngcoop_next_${run.leaderId}`).setLabel('🚪 Explore Next Room').setStyle(ButtonStyle.Primary));
    } else {
        row.addComponents(new ButtonBuilder().setCustomId(`dngcoop_claim_${run.leaderId}`).setLabel(run.awarded ? '✅ Reward Claimed' : '🎁 Claim Party Reward').setStyle(ButtonStyle.Success).setDisabled(!!run.awarded));
    }
    row.addComponents(new ButtonBuilder().setCustomId(`pet_dungeon_${run.leaderId}`).setLabel('🏰 Dungeon Menu').setStyle(ButtonStyle.Secondary));
    return { embeds: [embed], components: [row] };
}

function buildCoopSelectPanel(guildId, userId) {
    const pet = getPetData(guildId, userId);
    const buttons = COOP_DUNGEONS.map(d => {
        const canEnter = pet && pet.level >= d.minLevel;
        return new ButtonBuilder().setCustomId(`dngcoop_make_${d.id}_${userId}`).setLabel(`${d.name} Lv.${d.minLevel}+`.slice(0, 80)).setStyle(canEnter ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canEnter);
    });
    const embed = new EmbedBuilder()
        .setTitle('🏰 Co-op Roguelike Dungeon')
        .setColor('#5865F2')
        .setDescription('Buat party 1–4 player, explore room random, kumpulkan material Mutation Lab, lalu kalahkan boss floor.\n\n> Reward utama: 🧬 DNA Shard, 🧪 Mutation Serum, 🔮 Ancient Core, 🧯 Stabilizer.');
    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(buttons),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`pet_dungeon_${userId}`).setLabel('🔙 Dungeon').setStyle(ButtonStyle.Secondary))
        ]
    };
}

async function handleDungeonCoopButton(interaction) {
    const guildId = interaction.guild.id;
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const userId = parts[parts.length - 1];

    if (action === 'panel') {
        if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Ini bukan panel dungeon kamu!', ephemeral: true });
        return interaction.update(buildCoopSelectPanel(guildId, userId));
    }

    if (action === 'make') {
        if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Ini bukan party kamu!', ephemeral: true });
        const dungeonId = parts[2];
        const created = createRun(guildId, userId, dungeonId, interaction.channelId);
        if (!created.ok) return interaction.reply({ content: created.error, ephemeral: true });
        const payload = buildRunMessage(created.run);
        if (interaction.channel && interaction.channel.send) {
            await interaction.update({ content: '✅ Portal co-op dibuat! Lihat pesan party baru.', embeds: [], components: [] });
            await interaction.channel.send(payload);
            return;
        }
        return interaction.update(payload);
    }

    const leaderId = userId;
    const run = activeDungeonRuns.get(runKey(guildId, leaderId));
    if (!run) return interaction.reply({ content: '❌ Dungeon run sudah tidak aktif.', ephemeral: true });

    if (action === 'join') {
        const joined = joinRun(guildId, leaderId, interaction.user.id);
        if (!joined.ok) return interaction.reply({ content: joined.error, ephemeral: true });
        return interaction.update(buildRunMessage(joined.run));
    }

    if (!run.members.includes(interaction.user.id)) return interaction.reply({ content: '❌ Kamu bukan anggota party ini.', ephemeral: true });
    if (interaction.user.id !== leaderId && (action === 'start' || action === 'next' || action === 'claim')) return interaction.reply({ content: '❌ Hanya leader yang bisa mengontrol run.', ephemeral: true });

    if (action === 'start' || action === 'next') {
        resolveNextRoom(run);
        return interaction.update(buildRunMessage(run));
    }

    if (action === 'claim') {
        if (!run.finished) return interaction.reply({ content: '❌ Run belum selesai.', ephemeral: true });
        if (!run.awarded) {
            awardRun(run);
            try {
                for (const id of run.members) if (run.cleared) await checkAchievements(interaction.guild, id, { type: 'dungeon_clear' });
            } catch (e) {}
        }
        activeDungeonRuns.delete(runKey(guildId, leaderId));
        return interaction.update(buildRunMessage(run));
    }
}

function isDungeonCoopButton(customId) {
    return customId.startsWith('dngcoop_');
}

module.exports = {
    COOP_DUNGEONS,
    activeDungeonRuns,
    buildCoopSelectPanel,
    createRun,
    joinRun,
    resolveNextRoom,
    awardRun,
    buildRunMessage,
    handleDungeonCoopButton,
    isDungeonCoopButton,
};
