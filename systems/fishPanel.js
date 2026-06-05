// systems/fishPanel.js - Fishing Panel UI System (Button-based navigation)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db, getOrCreateUser, getUserStat, incrementUserStat, addIncome, getItemCount, addItem, removeItem, getSeedCount, addSeed, removeSeed, getAllSeeds } = require('../database');
const { getRandomInt } = require('../utils');
const { catchFish, getEquipment, getPlayerLocation, setPlayerLocation, rollSeaMonster } = require('./fishing');
const { updateQuestProgress } = require('./quests');
const { checkAchievements } = require('./achievements');
const { addComboFeature, getComboMultiplier, getComboTracker } = require('./combo');
const { getContestState, addContestEntry, getContestLeaderboard } = require('./contest');
const { addPetExp } = require('../systems/pets');
const { FISH_DATA, FISH_TIERS, BAIT_TYPES, ROD_TYPES, FISHING_LOCATIONS, ROD_UPGRADES, ROD_PART_DROP_CHANCE, SEA_MONSTERS } = require('../data/fish');
const { checkGiantFishSpawn, getActiveGiantFish, startGiantFishEncounter, hitGiantFish, getGiantFishStats, buildGiantFishSpawnEmbed, buildGiantFishHitEmbed, buildGiantFishDefeatedEmbed, buildGiantFishEscapedEmbed, GIANT_FISH } = require('./giantFish');
const { hasSecretLocation, tryUnlockSecretLocation, trackLocationCatch, buildSecretLocationUnlockEmbed, buildSecretLocationProgressEmbed, SECRET_LOCATION } = require('./secretLocation');
const state = require('../state');
const { fishCooldowns, activeFishEvents } = state;


// ============ HELPER: Build main fishing panel embed + buttons ============
function buildFishingPanel(guildId, userId, username) {
    const userData = getOrCreateUser(guildId, userId);
    const eq = getEquipment(guildId, userId);
    const rod = ROD_TYPES.find(r => r.id === eq.rod) || ROD_TYPES[0];
    const bait = BAIT_TYPES.find(b => b.id === eq.bait) || BAIT_TYPES[0];
    const location = FISHING_LOCATIONS.find(l => l.id === (eq.location || 'river')) || FISHING_LOCATIONS[0];
    const totalCaught = getUserStat(guildId, userId, 'total_fish_caught');
    const collected = db.prepare('SELECT COUNT(*) as c FROM fish_collection WHERE guildId = ? AND userId = ?').get(guildId, userId);
    const totalFish = FISH_DATA.length;

    const embed = new EmbedBuilder()
        .setTitle(`🎣 FISHING PANEL — ${username}`)
        .setColor('#3498DB')
        .setDescription(
            `📍 Lokasi: **${location.name}** — *${location.desc}*\n` +
            `🎋 Rod: **${rod.emoji} ${rod.name}** | 🪱 Bait: **${bait.emoji} ${bait.name}** (x${eq.bait !== 'none' ? eq.bait_count : 0})\n` +
            `🐟 Total Caught: **${totalCaught}** | 📖 Collection: **${collected.c}**/${totalFish}\n\n` +
            `> ⏱️ Cooldown: ${rod.cooldown}s | Rare+: +${rod.rareBonus + bait.rareBonus + location.bonusRare}%\n` +
            `> 💰 Saldo: 🪙 **${userData.balance.toLocaleString('id-ID')}**`
        )
        .setFooter({ text: 'Pilih aksi di bawah!' });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fish_cast_${userId}`).setLabel('🎣 Cast').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fish_inv_${userId}`).setLabel('📦 Inventory').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`fish_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`fish_location_${userId}`).setLabel('📍 Location').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`fish_contest_${userId}`).setLabel('🏆 Contest').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fish_collection_${userId}`).setLabel('📖 Collection').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`fish_lock_${userId}`).setLabel('🔒 Lock').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`fish_unlock_${userId}`).setLabel('🔓 Unlock').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`fish_stats_${userId}`).setLabel('📊 Stats').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`fish_sellall_${userId}`).setLabel('💰 Sell All').setStyle(ButtonStyle.Danger)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`fish_upgrade_${userId}`).setLabel('🔧 Upgrade Rod').setStyle(ButtonStyle.Success)
    );
    return { embeds: [embed], components: [row1, row2, row3] };
}


// ============ HANDLER: /fishing command (show main panel) ============
async function handleFishingCommand(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const panel = buildFishingPanel(guildId, userId, interaction.user.username);
    return interaction.reply(panel);
}

// ============ HANDLER: Fishing panel button clicks ============
async function handleFishingButton(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel fishing kamu!', ephemeral: true });
    }

    const action = parts[1];
    const userData = getOrCreateUser(guildId, userId);

    // === BACK TO MAIN PANEL ===
    if (action === 'back') {
        const panel = buildFishingPanel(guildId, userId, interaction.user.username);
        return interaction.update(panel);
    }

    // === CONTEST STATUS + LEADERBOARD ===
    if (action === 'contest') {
        const contestState = getContestState(guildId);
        const isActive = contestState && contestState.active && Date.now() < contestState.endsAt;
        const top = getContestLeaderboard(guildId, 10);
        let desc;
        if (!isActive && top.length === 0) {
            desc = '📭 **Tidak ada kontes yang sedang berjalan.**\n\n> Kontes memancing dimulai oleh Admin (via `/admin`).\n> Setiap ikan yang kamu tangkap saat kontes aktif otomatis masuk ke ranking ikan **terberat**!';
        } else {
            let board = '';
            top.forEach((e, i) => {
                const medal = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
                const fishDef = FISH_DATA.find(f => f.id === e.fishId);
                board += `${medal} <@${e.oderId}> — ${fishDef ? fishDef.emoji : '🐟'} ${fishDef ? fishDef.name : '?'} (**${e.weight} kg**)\n`;
            });
            if (!board) board = '*Belum ada peserta! Jadilah yang pertama dengan Cast.*';
            const timeLine = isActive
                ? `⏱️ Sisa waktu: **${Math.ceil((contestState.endsAt - Date.now()) / 60000)} menit**`
                : '🏁 Kontes sudah selesai.';
            desc = `🎯 Target: tangkap ikan **TERBERAT**!\n${timeLine}\n\n**🏆 Leaderboard:**\n${board}`;
        }
        const embed = new EmbedBuilder()
            .setTitle('🏆 Fishing Contest')
            .setColor(isActive ? '#F1C40F' : '#95A5A6')
            .setDescription(desc)
            .setFooter({ text: isActive ? 'Cast terus untuk naik ranking!' : 'Pantau pengumuman untuk kontes berikutnya' });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_cast_${userId}`).setLabel('🎣 Cast').setStyle(ButtonStyle.Primary).setDisabled(!isActive),
            new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === LOCATION ===
    if (action === 'location') {
        const eq = getEquipment(guildId, userId);
        const rod = ROD_TYPES.find(r => r.id === eq.rod) || ROD_TYPES[0];
        const currentLoc = FISHING_LOCATIONS.find(l => l.id === (eq.location || 'river')) || FISHING_LOCATIONS[0];

        let desc = `📍 **Lokasi Saat Ini:** ${currentLoc.name}\n> *${currentLoc.desc}*\n> Bonus Rare: +${currentLoc.bonusRare}% | Tier: ${currentLoc.tiers.join(', ')}\n\n`;
        desc += `🎋 **Joran:** ${rod.emoji} ${rod.name} (Tier ${rod.tier})\n\n`;
        desc += `🗺️ **Semua Lokasi:**\n`;
        for (const loc of FISHING_LOCATIONS.filter(l => !l.isSecret)) {
            const isCurrent = loc.id === currentLoc.id;
            const reqRod = ROD_TYPES.find(r => r.tier === loc.requiredRodTier);
            const hasReqRod = rod.tier >= loc.requiredRodTier;
            const statusIcon = isCurrent ? '📍' : (hasReqRod ? '✅' : '⚠️');
            desc += `${statusIcon} **${loc.name}**\n`;
            desc += `> *${loc.desc}*\n`;
            if (loc.requiredRodTier > 0) {
                desc += `> Joran: ${reqRod ? reqRod.emoji + ' ' + reqRod.name : 'Tier ' + loc.requiredRodTier}+ ${hasReqRod ? '✅' : `| ⚠️ -${loc.luckPenalty}% luck`}\n`;
            } else {
                desc += `> Joran: Bebas (tidak ada penalty)\n`;
            }
            desc += `> Tier Ikan: ${loc.tiers.join(', ')} | +${loc.bonusRare}% rare\n\n`;
        }

        // Show secret location progress/status
        const secretProgress = buildSecretLocationProgressEmbed(guildId, userId);
        desc += `\n🔮 **Secret Location:**\n${secretProgress.text}\n`;

        if (desc.length > 3900) desc = desc.substring(0, 3890) + '\n...';

        const embed = new EmbedBuilder()
            .setTitle(`📍 Fishing Locations — ${interaction.user.username}`)
            .setColor('#1ABC9C')
            .setDescription(desc)
            .setFooter({ text: rod.tier < currentLoc.requiredRodTier ? `⚠️ Joran di bawah rekomendasi! Luck -${currentLoc.luckPenalty}%` : '✅ Joran cukup untuk lokasi ini!' });

        const components = [];
        // Build location select menu (include secret location if unlocked)
        const availableLocs = FISHING_LOCATIONS.filter(l => {
            if (l.id === currentLoc.id) return false;
            if (l.isSecret && !hasSecretLocation(guildId, userId)) return false;
            return true;
        });
        if (availableLocs.length > 0) {
            const locMenu = new StringSelectMenuBuilder()
                .setCustomId(`fish_setloc_${userId}`)
                .setPlaceholder('📍 Pindah lokasi...')
                .setMinValues(1).setMaxValues(1);
            availableLocs.forEach(loc => {
                const hasReq = rod.tier >= loc.requiredRodTier;
                const suffix = !hasReq ? ` | -${loc.luckPenalty}% luck` : '';
                const label = loc.isSecret ? `👁️ ${loc.name.replace(/[^\w\s]/g, '').trim()}` : loc.name.replace(/[^\w\s]/g, '').trim();
                locMenu.addOptions({ label: label.substring(0, 25), value: loc.id, description: `${loc.desc.substring(0, 45)}${suffix}` });
            });
            components.push(new ActionRowBuilder().addComponents(locMenu));
        }
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        ));

        return interaction.update({ embeds: [embed], components });
    }

    // === CAST (fish) ===
    if (action === 'cast') {
        const cdKey = `fish_${guildId}_${userId}`;
        const eq = getEquipment(guildId, userId);
        const rod = ROD_TYPES.find(r => r.id === eq.rod) || ROD_TYPES[0];
        if (fishCooldowns.has(cdKey) && Date.now() < fishCooldowns.get(cdKey)) {
            const remaining = Math.ceil((fishCooldowns.get(cdKey) - Date.now()) / 1000);
            return interaction.reply({ content: `⏳ Pancingmu masih basah! Tunggu **${remaining} detik** lagi.`, ephemeral: true });
        }
        fishCooldowns.set(cdKey, Date.now() + rod.cooldown * 1000);

        // === CHECK ACTIVE GIANT FISH ENCOUNTER ===
        const activeGiant = getActiveGiantFish(guildId, userId);
        if (activeGiant) {
            const hitResult = hitGiantFish(guildId, userId);
            if (hitResult && hitResult.defeated) {
                // Giant fish defeated!
                const defeatEmbed = buildGiantFishDefeatedEmbed(hitResult, userId);
                await interaction.update(defeatEmbed);
                await checkAchievements(interaction.guild, userId, { type: 'giant_fish', giantFishId: hitResult.giantFish.id });
                return;
            } else if (hitResult) {
                // Hit but not yet defeated
                const hitEmbed = buildGiantFishHitEmbed(hitResult, userId);
                return interaction.update(hitEmbed);
            }
        }

        // === SEA MONSTER CHECK (before normal fishing) ===
        const eq2 = getEquipment(guildId, userId);
        const rod2 = ROD_TYPES.find(r => r.id === eq2.rod) || ROD_TYPES[0];
        const loc2 = FISHING_LOCATIONS.find(l => l.id === (eq2.location || 'river')) || FISHING_LOCATIONS[0];
        const monsterEncounter = rollSeaMonster(guildId, userId, loc2, rod2);
        if (monsterEncounter) {
            const { monster, damageResult } = monsterEncounter;
            incrementUserStat(guildId, userId, 'sea_monster_encounters');

            // Extra cooldown if monster type is cooldown
            if (damageResult.type === 'cooldown') {
                const cdKey2 = `fish_${guildId}_${userId}`;
                fishCooldowns.set(cdKey2, Date.now() + (rod.cooldown + damageResult.amount) * 1000);
            }

            const monsterEmbed = new EmbedBuilder()
                .setColor('#E74C3C')
                .setTitle(`${monster.emoji} MONSTER LAUT MENYERANG!`)
                .setDescription(
                    `**${monster.name}** muncul dari kedalaman!\n\n` +
                    `> 💬 *${monster.desc}*\n\n` +
                    `⚠️ **Damage:** ${damageResult.detail}\n` +
                    `> 📍 Lokasi: **${loc2.name}**\n` +
                    `> 🎋 Rod: **${rod2.name}** (Tier ${rod2.tier})\n\n` +
                    `💡 *Tip: Rod tier lebih tinggi = monster chance berkurang!*`
                )
                .setFooter({ text: `Monster chance di ${loc2.name}: ${loc2.monsterChance}% (rod bonus: -${Math.max(0, rod2.tier - loc2.requiredRodTier) * 3}%)` });

            const monsterRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`fish_cast_${userId}`).setLabel('🎣 Coba Lagi').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('📋 Panel').setStyle(ButtonStyle.Secondary)
            );

            await interaction.update({ embeds: [monsterEmbed], components: [monsterRow] });
            await checkAchievements(interaction.guild, userId, { type: 'sea_monster' });
            return;
        }

        // === NORMAL FISHING ===
        const result = catchFish(guildId, userId);
        incrementUserStat(guildId, userId, 'total_fish_caught');
        updateQuestProgress(guildId, userId, 'fish', 1);
        addPetExp(guildId, userId, 5);
        addComboFeature(guildId, userId, 'fishing');

        // Track location catch for secret location unlock
        const currentLocation = FISHING_LOCATIONS.find(l => l.id === (eq.location || 'river')) || FISHING_LOCATIONS[0];
        trackLocationCatch(guildId, userId, currentLocation.id, result.tier.tier);

        // Track abyss catches specifically
        if (currentLocation.id === 'abyss') {
            incrementUserStat(guildId, userId, 'fish_caught_abyss');
        }

        const contestState = getContestState(guildId);
        let contestMsg = '';
        if (contestState && contestState.active && Date.now() < contestState.endsAt) {
            addContestEntry(guildId, userId, result.fish.id, result.weight);
            contestMsg = '\n> 🏆 *Otomatis masuk kontes!*';
        }
        const comboMult = getComboMultiplier(guildId, userId);
        let comboMsg = comboMult > 1 ? `\n> 🔥 **Combo x${comboMult}!**` : '';

        // === CHECK GIANT FISH SPAWN (1% chance, Deep Sea+ only) ===
        const giantFishSpawn = checkGiantFishSpawn(currentLocation.id);
        if (giantFishSpawn) {
            const encounter = startGiantFishEncounter(guildId, userId, giantFishSpawn);
            const spawnEmbed = buildGiantFishSpawnEmbed(giantFishSpawn, encounter.hitsRequired, userId);
            return interaction.update(spawnEmbed);
        }

        // === CHECK SECRET LOCATION UNLOCK ===
        const unlockResult = tryUnlockSecretLocation(guildId, userId);
        let secretUnlockMsg = '';
        if (unlockResult) {
            // Will show a special notification after the catch
            secretUnlockMsg = '\n\n> 👁️🌀 **SECRET LOCATION UNLOCKED!** Cek 📍 Location!';
        }

        const tierColors = { 'Trash': '#808080', 'Common': '#FFFFFF', 'Uncommon': '#2ECC71', 'Rare': '#3498DB', 'Epic': '#9B59B6', 'Legendary': '#F1C40F', 'Mythic': '#FF6B6B', 'Secret': '#8B00FF', 'God': '#FFD700' };
        let title = `🎣 ${result.tier.tier === 'Trash' ? 'Kamu menangkap sampah...' : 'IKAN TERTANGKAP!'}`;
        if (result.tier.tier === 'God') title = '👑⚡ GOD TIER CATCH!!! ⚡👑';
        else if (result.tier.tier === 'Secret') title = '🔮💫 SECRET CATCH!!! 💫🔮';
        else if (result.tier.tier === 'Mythic') title = '🌈✨ MYTHIC CATCH!! ✨🌈';
        else if (result.tier.tier === 'Legendary') title = '🐉⚡ LEGENDARY CATCH! ⚡🐉';

        const embed = new EmbedBuilder()
            .setColor(tierColors[result.tier.tier] || '#2B2D31')
            .setTitle(title)
            .setDescription(
                `${result.tier.emoji} **${result.fish.name}**\n\n` +
                `> 📊 **Tier:** ${result.tier.tier}\n` +
                `> ⚖️ **Berat:** ${result.weight.toLocaleString('id-ID')} kg\n` +
                `> 💰 **Nilai Jual:** 🪙 ${result.value.toLocaleString('id-ID')}\n\n` +
                `> 🎋 Joran: **${rod.name}**\n` +
                `> 🪱 Umpan: **${(BAIT_TYPES.find(b => b.id === eq.bait) || BAIT_TYPES[0]).name}** ${eq.bait !== 'none' ? `(${Math.max(0, eq.bait_count - 1)} sisa)` : ''}\n` +
                `> 📍 Lokasi: **${result.location.name}**` +
                (result.droppedPart ? '\n\n> 🔧 **+1 Rod Part!** *(material upgrade joran)*' : '') +
                contestMsg + comboMsg + secretUnlockMsg
            );

        const afterCatchRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_cast_${userId}`).setLabel('🎣 Lagi').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('📋 Panel').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [embed], components: [afterCatchRow] });
        await checkAchievements(interaction.guild, userId, { type: 'fishing', tier: result.tier.tier, weight: result.weight, fishId: result.fish.id });

        // Track God tier catches
        if (result.tier.tier === 'God') {
            incrementUserStat(guildId, userId, 'fish_caught_god_tier');
        }

        // Abyss-specific achievements
        if (currentLocation.id === 'abyss') {
            await checkAchievements(interaction.guild, userId, { type: 'fishing_abyss', fishId: result.fish.id });
        }

        // Secret location unlock achievement
        if (unlockResult) {
            await checkAchievements(interaction.guild, userId, { type: 'secret_location_unlock' });
        }

        // Tournament participation
        if (activeFishEvents.has(guildId)) {
            const ev = activeFishEvents.get(guildId);
            if (!ev.participants[userId]) ev.participants[userId] = { count: 0, heaviest: 0 };
            ev.participants[userId].count++;
            if (result.weight > ev.participants[userId].heaviest) ev.participants[userId].heaviest = result.weight;
        }
        return;
    }


    // === INVENTORY ===
    if (action === 'inv') {
        const tierOrder = { 'Secret': 0, 'Mythic': 1, 'Legendary': 2, 'Epic': 3, 'Rare': 4, 'Uncommon': 5, 'Common': 6, 'Trash': 7 };
        const allInventory = db.prepare('SELECT * FROM fish_inventory WHERE guildId = ? AND userId = ?').all(guildId, userId);
        const totalCount = allInventory.length;
        const lockedCount = allInventory.filter(i => i.locked === 1).length;
        if (totalCount === 0) {
            const embed = new EmbedBuilder().setTitle('🎣 Fishing Inventory').setColor('#2B2D31')
                .setDescription('🎒 Inventory kosong! Gunakan 🎣 Cast untuk memancing.');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`fish_cast_${userId}`).setLabel('🎣 Cast').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
            );
            return interaction.update({ embeds: [embed], components: [row] });
        }
        const sorted = allInventory.sort((a, b) => {
            const fishA = FISH_DATA.find(f => f.id === a.fishId); const fishB = FISH_DATA.find(f => f.id === b.fishId);
            const tierA = fishA ? (tierOrder[fishA.tier] ?? 99) : 99; const tierB = fishB ? (tierOrder[fishB.tier] ?? 99) : 99;
            if (tierA !== tierB) return tierA - tierB; return b.weight - a.weight;
        });
        const page = 0, perPage = 15;
        const totalPages = Math.ceil(totalCount / perPage);
        const pageItems = sorted.slice(0, perPage);
        let desc = `🎒 **Total: ${totalCount} ikan** (🔒 Locked: ${lockedCount})\n\n`;
        pageItems.forEach((item) => {
            const fd = FISH_DATA.find(f => f.id === item.fishId);
            const tier = fd ? FISH_TIERS.find(t => t.tier === fd.tier) : null;
            const lockIcon = item.locked ? '🔒 ' : '';
            desc += `**#${item.id}** ${lockIcon}${tier ? tier.emoji : '🐟'} **${fd ? fd.name : '?'}** — ${item.weight}kg *${fd ? fd.tier : ''}*\n`;
        });
        desc += `\n> 📄 Hal **1** / **${totalPages}**`;
        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_invp_${userId}_0`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId(`fish_invn_${userId}_0`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1),
            new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [new EmbedBuilder().setTitle('🎣 Fishing Inventory').setColor('#2B2D31').setDescription(desc)], components: [navRow] });
    }


    // === INVENTORY PAGINATION ===
    if (action === 'invp' || action === 'invn') {
        const currentPage = parseInt(parts[2]);
        const newPage = action === 'invp' ? currentPage - 1 : currentPage + 1;
        const tierOrder = { 'Secret': 0, 'Mythic': 1, 'Legendary': 2, 'Epic': 3, 'Rare': 4, 'Uncommon': 5, 'Common': 6, 'Trash': 7 };
        const allInventory = db.prepare('SELECT * FROM fish_inventory WHERE guildId = ? AND userId = ?').all(guildId, userId);
        const totalCount = allInventory.length;
        const lockedCount = allInventory.filter(i => i.locked === 1).length;
        if (totalCount === 0) return interaction.update(buildFishingPanel(guildId, userId, interaction.user.username));
        const sorted = allInventory.sort((a, b) => {
            const fishA = FISH_DATA.find(f => f.id === a.fishId); const fishB = FISH_DATA.find(f => f.id === b.fishId);
            const tierA = fishA ? (tierOrder[fishA.tier] ?? 99) : 99; const tierB = fishB ? (tierOrder[fishB.tier] ?? 99) : 99;
            if (tierA !== tierB) return tierA - tierB; return b.weight - a.weight;
        });
        const perPage = 15, totalPages = Math.ceil(totalCount / perPage);
        const page = Math.min(Math.max(0, newPage), totalPages - 1);
        const start = page * perPage;
        const pageItems = sorted.slice(start, start + perPage);
        let desc = `🎒 **Total: ${totalCount} ikan** (🔒 Locked: ${lockedCount})\n\n`;
        pageItems.forEach((item) => {
            const fd = FISH_DATA.find(f => f.id === item.fishId);
            const tier = fd ? FISH_TIERS.find(t => t.tier === fd.tier) : null;
            const lockIcon = item.locked ? '🔒 ' : '';
            desc += `**#${item.id}** ${lockIcon}${tier ? tier.emoji : '🐟'} **${fd ? fd.name : '?'}** — ${item.weight}kg *${fd ? fd.tier : ''}*\n`;
        });
        desc += `\n> 📄 Hal **${page + 1}** / **${totalPages}**`;
        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_invp_${userId}_${page}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
            new ButtonBuilder().setCustomId(`fish_invn_${userId}_${page}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
            new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [new EmbedBuilder().setTitle('🎣 Fishing Inventory').setColor('#2B2D31').setDescription(desc)], components: [navRow] });
    }


    // === SHOP ===
    if (action === 'shop') {
        const eq = getEquipment(guildId, userId);
        let desc = '**🎋 JORAN**\n';
        ROD_TYPES.forEach(r => {
            const owned = eq.rod === r.id || r.id === 'basic';
            desc += `> ${r.emoji} **${r.name}** ${owned ? '✅' : `🪙 ${r.price.toLocaleString('id-ID')}`} | CD:${r.cooldown}s +${r.rareBonus}%\n`;
        });
        desc += '\n**🪱 UMPAN (x10)**\n';
        BAIT_TYPES.filter(b => b.id !== 'none').forEach(b => {
            desc += `> ${b.emoji} **${b.name}** 🪙 ${(b.price * 10).toLocaleString('id-ID')} | +${b.rareBonus}%\n`;
        });
        if (desc.length > 4000) desc = desc.substring(0, 3990) + '...';

        const rodMenu = new StringSelectMenuBuilder().setCustomId(`fish_shoprod_${userId}`).setPlaceholder('🎋 Beli Joran...').setMinValues(1).setMaxValues(1);
        ROD_TYPES.filter(r => r.id !== 'basic' && r.id !== eq.rod).forEach(r => {
            rodMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${r.name} (🪙${r.price.toLocaleString('id-ID')})`).setValue(r.id).setDescription(`CD:${r.cooldown}s | +${r.rareBonus}% rare`));
        });
        const baitMenu = new StringSelectMenuBuilder().setCustomId(`fish_shopbait_${userId}`).setPlaceholder('🪱 Beli Umpan x10...').setMinValues(1).setMaxValues(1);
        BAIT_TYPES.filter(b => b.id !== 'none').forEach(b => {
            baitMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(`${b.name} x10 (🪙${(b.price*10).toLocaleString('id-ID')})`).setValue(b.id).setDescription(`+${b.rareBonus}% rare`));
        });

        const embed = new EmbedBuilder().setTitle('🛒 Fishing Shop').setColor('#2B2D31').setDescription(desc)
            .setFooter({ text: `💰 Saldo: ${userData.balance.toLocaleString('id-ID')}` });
        const components = [];
        if (ROD_TYPES.filter(r => r.id !== 'basic' && r.id !== eq.rod).length > 0) components.push(new ActionRowBuilder().addComponents(rodMenu));
        components.push(new ActionRowBuilder().addComponents(baitMenu));
        components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)));
        return interaction.update({ embeds: [embed], components });
    }


    // === STATS ===
    if (action === 'stats') {
        const totalCaught = getUserStat(guildId, userId, 'total_fish_caught');
        const totalSoldValue = getUserStat(guildId, userId, 'total_fish_sold_value');
        const totalSoldCount = getUserStat(guildId, userId, 'total_fish_sold_count');
        const invCount = db.prepare('SELECT COUNT(*) as c FROM fish_inventory WHERE guildId = ? AND userId = ?').get(guildId, userId).c;
        const giantStats = getGiantFishStats(guildId, userId);
        const embed = new EmbedBuilder().setTitle('📊 Statistik Memancing').setColor('#2B2D31')
            .setDescription(
                `> 🎣 **Total Tangkapan:** ${totalCaught}\n` +
                `> 💰 **Total Penjualan:** 🪙 ${totalSoldValue.toLocaleString('id-ID')}\n` +
                `> 📦 **Ikan Dijual:** ${totalSoldCount}\n` +
                `> 🐟 **Di Inventory:** ${invCount}\n\n` +
                `🐋 **Giant Fish:**\n` +
                `> ⚔️ Defeated: **${giantStats.defeated}**\n` +
                `> 🎯 Encounters: **${giantStats.totalEncounters}**\n` +
                `> 📊 Success Rate: **${giantStats.successRate}%**\n` +
                `> 💰 Total Reward: 🪙 **${giantStats.totalReward.toLocaleString('id-ID')}**`
            );
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    // === COLLECTION ===
    if (action === 'collection') {
        const collected = db.prepare('SELECT * FROM fish_collection WHERE guildId = ? AND userId = ?').all(guildId, userId);
        const collectedIds = collected.map(c => c.fishId);
        const totalFish = FISH_DATA.length;
        const totalCollected = collectedIds.length;
        const percentDex = Math.floor((totalCollected / totalFish) * 100);
        const tiers = ['Trash', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret'];
        let desc = `📖 **Fish Collection**\n> 🐟 **${totalCollected}** / **${totalFish}** (**${percentDex}%**)\n\n`;
        for (const tier of tiers) {
            const tierFish = FISH_DATA.filter(f => f.tier === tier);
            const tierEmoji = (FISH_TIERS.find(t => t.tier === tier) || { emoji: '🐟' }).emoji;
            const tierCollected = tierFish.filter(f => collectedIds.includes(f.id)).length;
            const progress = tierFish.length > 0 ? Math.floor((tierCollected / tierFish.length) * 10) : 0;
            desc += `${tierEmoji} **${tier}** — ${tierCollected}/${tierFish.length} \`${'▰'.repeat(progress)}${'▱'.repeat(10 - progress)}\`\n`;
        }
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fcol_Trash_${userId}_0`).setLabel('🗑️ Trash').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`fcol_Common_${userId}_0`).setLabel('🐟 Common').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`fcol_Uncommon_${userId}_0`).setLabel('🐠 Uncommon').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`fcol_Rare_${userId}_0`).setLabel('🐡 Rare').setStyle(ButtonStyle.Primary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fcol_Epic_${userId}_0`).setLabel('🦈 Epic').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`fcol_Legendary_${userId}_0`).setLabel('🐉 Legend').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`fcol_Mythic_${userId}_0`).setLabel('🌈 Mythic').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`fcol_Secret_${userId}_0`).setLabel('🔮 Secret').setStyle(ButtonStyle.Danger)
        );
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [new EmbedBuilder().setTitle('📖 Fish Collection').setColor('#3498DB').setDescription(desc)], components: [row1, row2, row3] });
    }


    // === LOCK (show modal) ===
    if (action === 'lock') {
        const modal = new ModalBuilder().setCustomId(`fish_lock_modal_${userId}`).setTitle('🔒 Lock Ikan');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('fish_lock_id').setLabel('ID Ikan (dari Inventory)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setPlaceholder('Contoh: 42')
        ));
        return interaction.showModal(modal);
    }

    // === UNLOCK (show modal) ===
    if (action === 'unlock') {
        const modal = new ModalBuilder().setCustomId(`fish_unlock_modal_${userId}`).setTitle('🔓 Unlock Ikan');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('fish_unlock_id').setLabel('ID Ikan (dari Inventory)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setPlaceholder('Contoh: 42')
        ));
        return interaction.showModal(modal);
    }

    // === SELL ALL ===
    if (action === 'sellall') {
        const sellCdKey = `sell_${guildId}_${userId}`;
        if (fishCooldowns.has(sellCdKey) && Date.now() < fishCooldowns.get(sellCdKey)) {
            return interaction.reply({ content: '⏳ Tunggu sebentar sebelum menjual lagi.', ephemeral: true });
        }
        fishCooldowns.set(sellCdKey, Date.now() + 10000);
        const inventory = db.prepare('SELECT * FROM fish_inventory WHERE guildId = ? AND userId = ? AND locked = 0').all(guildId, userId);
        if (inventory.length === 0) {
            return interaction.reply({ content: '❌ Tidak ada ikan yang bisa dijual! (Ikan yang di-lock tidak terjual)', ephemeral: true });
        }
        let totalValue = 0, countByTier = {};
        for (const item of inventory) {
            const fishDef = FISH_DATA.find(f => f.id === item.fishId);
            const tierDef = fishDef ? FISH_TIERS.find(t => t.tier === fishDef.tier) : FISH_TIERS[0];
            const weightRatio = tierDef ? (item.weight - tierDef.minWeight) / (tierDef.maxWeight - tierDef.minWeight) : 0;
            const value = tierDef ? Math.floor(tierDef.minValue + Math.min(1, Math.max(0, weightRatio)) * (tierDef.maxValue - tierDef.minValue)) : 1;
            totalValue += value;
            const tier = fishDef ? fishDef.tier : 'Trash';
            countByTier[tier] = (countByTier[tier] || 0) + 1;
        }
        const freshData = getOrCreateUser(guildId, userId);
        freshData.balance += totalValue;
        db.prepare('UPDATE users SET balance = ? WHERE guildId = ? AND userId = ?').run(freshData.balance, guildId, userId);
        db.prepare('DELETE FROM fish_inventory WHERE guildId = ? AND userId = ? AND locked = 0').run(guildId, userId);
        incrementUserStat(guildId, userId, 'total_fish_sold_value', totalValue);
        incrementUserStat(guildId, userId, 'total_fish_sold_count', inventory.length);
        addIncome(guildId, userId, 'fishing', totalValue);
        const lockedCount = db.prepare('SELECT COUNT(*) as c FROM fish_inventory WHERE guildId = ? AND userId = ? AND locked = 1').get(guildId, userId).c;
        let breakdown = Object.entries(countByTier).map(([t, c]) => `> ${(FISH_TIERS.find(ft => ft.tier === t) || { emoji: '🐟' }).emoji} ${t}: **${c}**`).join('\n');
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('💰 IKAN TERJUAL!')
            .setDescription(`**${inventory.length} ikan** dijual:\n\n🪙 **${totalValue.toLocaleString('id-ID')} Money**\n\n${breakdown}\n\n> 💳 Saldo: 🪙 **${freshData.balance.toLocaleString('id-ID')}**${lockedCount > 0 ? `\n> 🔒 Locked: **${lockedCount}**` : ''}`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        await interaction.update({ embeds: [embed], components: [backRow] });
        await checkAchievements(interaction.guild, userId, { type: 'fish_sell' });
        return;
    }

    // === UPGRADE ROD ===
    if (action === 'upgrade') {
        const eq = getEquipment(guildId, userId);
        const currentRod = ROD_TYPES.find(r => r.id === eq.rod) || ROD_TYPES[0];
        const upgrade = ROD_UPGRADES.find(u => u.from === currentRod.tier);
        const nextRod = ROD_TYPES.find(r => r.tier === (currentRod.tier + 1));
        const partsOwned = getItemCount(guildId, userId, 'rod_part');

        if (!upgrade || !nextRod) {
            const embed = new EmbedBuilder().setColor('#FFD700').setTitle('🔧 Upgrade Rod — MAX!')
                .setDescription(`${currentRod.emoji} **${currentRod.name}** (Tier ${currentRod.tier})\n\n> 👑 Joran kamu sudah **MAX TIER**! Tidak bisa di-upgrade lagi.\n> 🔧 Rod Parts: **${partsOwned}**`);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary));
            return interaction.update({ embeds: [embed], components: [row] });
        }

        const canAfford = userData.balance >= upgrade.cost;
        const hasParts = partsOwned >= upgrade.parts;

        let desc = `**Joran Saat Ini:**\n> ${currentRod.emoji} **${currentRod.name}** (Tier ${currentRod.tier})\n> CD: ${currentRod.cooldown}s | Rare+: ${currentRod.rareBonus}%\n\n`;
        desc += `**⬆️ Upgrade ke:**\n> ${nextRod.emoji} **${nextRod.name}** (Tier ${nextRod.tier})\n> CD: ${nextRod.cooldown}s | Rare+: ${nextRod.rareBonus}%\n\n`;
        desc += `**📋 Syarat:**\n`;
        desc += `> 🔧 Rod Parts: **${partsOwned}** / **${upgrade.parts}** ${hasParts ? '✅' : '❌'}\n`;
        desc += `> 🪙 Money: **${userData.balance.toLocaleString('id-ID')}** / **${upgrade.cost.toLocaleString('id-ID')}** ${canAfford ? '✅' : '❌'}\n`;
        desc += `> 🎯 Success Rate: **${upgrade.successRate}%**${upgrade.successRate < 100 ? ' ⚠️' : ''}\n`;
        if (upgrade.successRate < 100) desc += `> ⚠️ *Gagal = material hilang, rod TETAP (tidak turun)*`;

        const embed = new EmbedBuilder().setColor(canAfford && hasParts ? '#2ECC71' : '#E74C3C').setTitle('🔧 Upgrade Rod').setDescription(desc);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_doupgrade_${userId}`).setLabel(`🔧 Upgrade! (${upgrade.successRate}%)`).setStyle(ButtonStyle.Success).setDisabled(!canAfford || !hasParts),
            new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    // === DO UPGRADE (execute) ===
    if (action === 'doupgrade') {
        const eq = getEquipment(guildId, userId);
        const currentRod = ROD_TYPES.find(r => r.id === eq.rod) || ROD_TYPES[0];
        const upgrade = ROD_UPGRADES.find(u => u.from === currentRod.tier);
        const nextRod = ROD_TYPES.find(r => r.tier === (currentRod.tier + 1));
        if (!upgrade || !nextRod) return interaction.reply({ content: '❌ Sudah MAX!', ephemeral: true });

        const partsOwned = getItemCount(guildId, userId, 'rod_part');
        if (partsOwned < upgrade.parts) return interaction.reply({ content: `❌ Rod Parts kurang! (${partsOwned}/${upgrade.parts})`, ephemeral: true });
        if (userData.balance < upgrade.cost) return interaction.reply({ content: `❌ Money kurang! (🪙 ${userData.balance.toLocaleString('id-ID')}/${upgrade.cost.toLocaleString('id-ID')})`, ephemeral: true });

        // Consume materials
        removeItem(guildId, userId, 'rod_part', upgrade.parts);
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(upgrade.cost, guildId, userId);

        // Roll success
        const roll = Math.random() * 100;
        const success = roll < upgrade.successRate;

        let embed;
        if (success) {
            db.prepare('UPDATE fish_equipment SET rod = ? WHERE guildId = ? AND userId = ?').run(nextRod.id, guildId, userId);
            embed = new EmbedBuilder().setColor('#FFD700').setTitle('🎉 UPGRADE BERHASIL!')
                .setDescription(
                    `${currentRod.emoji} ${currentRod.name} → ${nextRod.emoji} **${nextRod.name}**\n\n` +
                    `> ✅ Tier: **${currentRod.tier}** → **${nextRod.tier}**\n` +
                    `> ⏱️ Cooldown: ${currentRod.cooldown}s → **${nextRod.cooldown}s**\n` +
                    `> 🎯 Rare Bonus: ${currentRod.rareBonus}% → **${nextRod.rareBonus}%**\n\n` +
                    `> 🔧 Parts: -${upgrade.parts} | 🪙 Money: -${upgrade.cost.toLocaleString('id-ID')}`
                );
            await checkAchievements(interaction.guild, userId, { type: 'fish_rod', rod: nextRod.id });
        } else {
            embed = new EmbedBuilder().setColor('#E74C3C').setTitle('❌ UPGRADE GAGAL!')
                .setDescription(
                    `${currentRod.emoji} **${currentRod.name}** tidak berubah.\n\n` +
                    `> ❌ Roll: ${roll.toFixed(1)}% (butuh < ${upgrade.successRate}%)\n` +
                    `> 🔧 Parts: -${upgrade.parts} (hilang)\n` +
                    `> 🪙 Money: -${upgrade.cost.toLocaleString('id-ID')} (hilang)\n` +
                    `> 🎋 Rod: **AMAN** (tidak turun tier)\n\n` +
                    `*Coba lagi! Kumpulkan Rod Parts dari mancing.*`
                );
        }
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_upgrade_${userId}`).setLabel('🔧 Upgrade Lagi').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Panel').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
    }

    return null;
}


// ============ HANDLER: Fishing panel select menus ============
async function handleFishingSelectMenu(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;
    const parts = customId.split('_');
    const userId = parts[parts.length - 1];

    if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ini bukan panel fishing kamu!', ephemeral: true });
    }

    const userData = getOrCreateUser(guildId, userId);

    // === SET LOCATION ===
    if (customId.startsWith('fish_setloc_')) {
        const locId = interaction.values[0];
        const loc = FISHING_LOCATIONS.find(l => l.id === locId);
        if (!loc) return interaction.reply({ content: '❌ Lokasi tidak ditemukan!', ephemeral: true });
        // Block secret location if not unlocked
        if (loc.isSecret && !hasSecretLocation(guildId, userId)) {
            return interaction.reply({ content: '🔒 Lokasi **The Abyss** masih terkunci! Selesaikan misi untuk membukanya.', ephemeral: true });
        }
        if (userData.level < loc.unlockLevel) {
            return interaction.reply({ content: `🔒 Lokasi **${loc.name}** butuh Level **${loc.unlockLevel}**! (Level kamu: ${userData.level})`, ephemeral: true });
        }
        setPlayerLocation(guildId, userId, locId);
        const embed = new EmbedBuilder()
            .setColor(loc.isSecret ? '#8B00FF' : '#1ABC9C')
            .setTitle(`📍 Pindah ke ${loc.name}!`)
            .setDescription(`> *${loc.desc}*\n> Bonus Rare: +${loc.bonusRare}%\n> Tier: ${loc.tiers.join(', ')}${loc.isSecret ? '\n\n> 👁️ *Lokasi rahasia — ikan eksklusif menunggumu!*' : ''}`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    // === SHOP ROD ===
    if (customId.startsWith('fish_shoprod_')) {
        const rodId = interaction.values[0];
        const rodDef = ROD_TYPES.find(r => r.id === rodId);
        if (!rodDef) return interaction.reply({ content: '❌ Joran tidak ditemukan!', ephemeral: true });
        if (userData.balance < rodDef.price) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${rodDef.price.toLocaleString('id-ID')}**`, ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(rodDef.price, guildId, userId);
        db.prepare('UPDATE fish_equipment SET rod = ? WHERE guildId = ? AND userId = ?').run(rodId, guildId, userId);
        await checkAchievements(interaction.guild, userId, { type: 'fish_rod', rod: rodId });
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('✅ Joran Dibeli!')
            .setDescription(`${rodDef.emoji} **${rodDef.name}** terpasang!\n> CD: ${rodDef.cooldown}s | Rare+: +${rodDef.rareBonus}%\n> 💰 Saldo: 🪙 **${(userData.balance - rodDef.price).toLocaleString('id-ID')}**`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_shop_${userId}`).setLabel('🛒 Shop Lagi').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    // === SHOP BAIT ===
    if (customId.startsWith('fish_shopbait_')) {
        const baitId = interaction.values[0];
        const baitDef = BAIT_TYPES.find(b => b.id === baitId);
        if (!baitDef) return interaction.reply({ content: '❌ Umpan tidak ditemukan!', ephemeral: true });
        const totalPrice = baitDef.price * 10;
        if (userData.balance < totalPrice) return interaction.reply({ content: `❌ Saldo kurang! Butuh 🪙 **${totalPrice.toLocaleString('id-ID')}**`, ephemeral: true });
        db.prepare('UPDATE users SET balance = balance - ? WHERE guildId = ? AND userId = ?').run(totalPrice, guildId, userId);
        const eq = getEquipment(guildId, userId);
        const newCount = (eq.bait === baitId ? eq.bait_count : 0) + 10;
        db.prepare('UPDATE fish_equipment SET bait = ?, bait_count = ? WHERE guildId = ? AND userId = ?').run(baitId, newCount, guildId, userId);
        const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('✅ Umpan Dibeli!')
            .setDescription(`${baitDef.emoji} **${baitDef.name}** x10!\n> Total: **${newCount}** | +${baitDef.rareBonus}% rare\n> 💰 Saldo: 🪙 **${(userData.balance - totalPrice).toLocaleString('id-ID')}**`);
        const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fish_shop_${userId}`).setLabel('🛒 Shop Lagi').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`fish_back_${userId}`).setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [backRow] });
    }

    return null;
}


// ============ HANDLER: Fishing panel modals ============
async function handleFishingModal(interaction) {
    const guildId = interaction.guild.id;
    const customId = interaction.customId;

    if (customId.startsWith('fish_lock_modal_')) {
        const userId = customId.replace('fish_lock_modal_', '');
        if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan milikmu!', ephemeral: true });
        const fishDbId = parseInt(interaction.fields.getTextInputValue('fish_lock_id'));
        if (isNaN(fishDbId)) return interaction.reply({ content: '❌ ID harus angka!', ephemeral: true });
        const item = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(fishDbId, guildId, userId);
        if (!item) return interaction.reply({ content: '❌ Ikan tidak ditemukan! Cek ID di Inventory.', ephemeral: true });
        if (item.locked === 1) return interaction.reply({ content: '❌ Ikan ini sudah di-lock!', ephemeral: true });
        db.prepare('UPDATE fish_inventory SET locked = 1 WHERE id = ?').run(fishDbId);
        const fishDef = FISH_DATA.find(f => f.id === item.fishId);
        const panel = buildFishingPanel(guildId, userId, interaction.user.username);
        return interaction.update({ ...panel, content: null });
    }

    if (customId.startsWith('fish_unlock_modal_')) {
        const userId = customId.replace('fish_unlock_modal_', '');
        if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Bukan milikmu!', ephemeral: true });
        const fishDbId = parseInt(interaction.fields.getTextInputValue('fish_unlock_id'));
        if (isNaN(fishDbId)) return interaction.reply({ content: '❌ ID harus angka!', ephemeral: true });
        const item = db.prepare('SELECT * FROM fish_inventory WHERE id = ? AND guildId = ? AND userId = ?').get(fishDbId, guildId, userId);
        if (!item) return interaction.reply({ content: '❌ Ikan tidak ditemukan!', ephemeral: true });
        if (item.locked === 0) return interaction.reply({ content: '❌ Ikan ini tidak di-lock!', ephemeral: true });
        db.prepare('UPDATE fish_inventory SET locked = 0 WHERE id = ?').run(fishDbId);
        const panel = buildFishingPanel(guildId, userId, interaction.user.username);
        return interaction.update({ ...panel, content: null });
    }

    return null;
}

// ============ UTILITY: Detection helpers ============
function isFishingPanelButton(customId) {
    return customId.startsWith('fish_') && !customId.startsWith('fishing_');
}

function isFishingPanelSelectMenu(customId) {
    return customId.startsWith('fish_shop') || customId.startsWith('fish_setloc_');
}

function isFishingPanelModal(customId) {
    return customId.startsWith('fish_lock_modal_') || customId.startsWith('fish_unlock_modal_');
}

module.exports = {
    buildFishingPanel,
    handleFishingCommand,
    handleFishingButton,
    handleFishingSelectMenu,
    handleFishingModal,
    isFishingPanelButton,
    isFishingPanelSelectMenu,
    isFishingPanelModal
};
