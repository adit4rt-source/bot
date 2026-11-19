// systems/streakTier.js — Aesthetic Prestige Streak Tiers & VVIP Lounge System
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField
} = require('discord.js');
const { db, getSetting, getUserStat, setUserStat, incrementUserStat, addItem } = require('../database');
const ui = require('./ui');

// ==================== TIER DEFINITIONS (Gaya A: Aesthetic Minimalis & Prestige) ====================
const STREAK_TIERS = [
    { days: 7,   name: '✦ Sparks',    emoji: '✨', color: '#B0BEC5', reward: 15000,   lounge: false, chatBonus: 0.10 },
    { days: 30,  name: '✦ Blazing',   emoji: '🔥', color: '#FBC02D', reward: 50000,   lounge: false, chatBonus: 0.25 },
    { days: 60,  name: '✦ Tempest',   emoji: '⚡', color: '#00E5FF', reward: 120000,  lounge: false, chatBonus: 0.50 },
    { days: 100, name: '✦ Sovereign', emoji: '👑', color: '#7C4DFF', reward: 300000,  lounge: true,  chatBonus: 0.75 },
    { days: 150, name: '✦ Luminary',  emoji: '💠', color: '#00B0FF', reward: 600000,  lounge: true,  chatBonus: 1.00 },
    { days: 200, name: '✦ Eternal',   emoji: '💎', color: '#FFD700', reward: 1200000, lounge: true,  chatBonus: 1.50 },
    { days: 365, name: '✦ Mythos',    emoji: '🌌', color: '#FF1744', reward: 3000000, lounge: true,  chatBonus: 2.00 }
];

function getStreakTier(days) {
    const d = Math.max(0, Number(days) || 0);
    const qualified = STREAK_TIERS.filter(t => d >= t.days);
    return qualified.length > 0 ? qualified[qualified.length - 1] : null;
}

function getNextStreakTier(days) {
    const d = Math.max(0, Number(days) || 0);
    return STREAK_TIERS.find(t => d < t.days) || null;
}

function getStreakEmoji(days) {
    const d = Math.max(0, Number(days) || 0);
    if (d >= 365) return '🌌';
    if (d >= 200) return '💎';
    if (d >= 150) return '💠';
    if (d >= 100) return '👑';
    if (d >= 60)  return '⚡';
    if (d >= 30)  return '🔥';
    if (d >= 7)   return '✨';
    return '🔥';
}

function getStreakChatBonus(days) {
    const tier = getStreakTier(days);
    return tier ? tier.chatBonus : 0;
}

// ==================== ROLE HELPERS (supports Discord.js Collection & Map) ====================
function findRoleByName(guild, name) {
    if (!guild || !guild.roles || !guild.roles.cache) return null;
    const cache = guild.roles.cache;
    if (typeof cache.find === 'function') {
        return cache.find(r => r && r.name === name);
    }
    for (const [, role] of cache) {
        if (role && role.name === name) return role;
    }
    return null;
}

function memberHasRole(member, roleId) {
    if (!member || !member.roles || !member.roles.cache) return false;
    const cache = member.roles.cache;
    if (typeof cache.has === 'function') {
        return cache.has(roleId);
    }
    for (const [id, role] of cache) {
        if (id === roleId || (role && role.id === roleId)) return true;
    }
    return false;
}

// ==================== AUTO-ROLE SYNC & CLEANUP ====================
async function ensureAllStreakRoles(guild) {
    if (!guild) return {};
    const me = guild.members?.me || (await guild.members.fetchMe().catch(() => null));
    if (!me || !me.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
        return {};
    }
    await guild.roles.fetch().catch(() => {});
    const roleMap = {};
    for (const tier of STREAK_TIERS) {
        let role = findRoleByName(guild, tier.name);
        if (!role) {
            try {
                role = await guild.roles.create({
                    name: tier.name,
                    color: tier.color,
                    hoist: true,
                    reason: `Auto-create streak prestige role: ${tier.name}`
                });
            } catch (err) {
                console.error(`[StreakTier] Gagal membuat role ${tier.name}:`, err.message);
            }
        }
        if (role) roleMap[tier.name] = role;
    }
    return roleMap;
}

async function syncMemberStreakRole(member, streakCount) {
    if (!member || !member.guild) return { highestTier: null, roleAdded: false, roleRemoved: false };
    const guild = member.guild;
    const streak = Math.max(0, Number(streakCount) || 0);
    const highestTier = getStreakTier(streak);

    const me = guild.members?.me || (await guild.members.fetchMe().catch(() => null));
    if (!me || !me.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
        return { highestTier, roleAdded: false, roleRemoved: false };
    }

    const tierNames = new Set(STREAK_TIERS.map(t => t.name));

    // Ensure roles cache is loaded
    if (!guild.roles.cache.size) {
        await guild.roles.fetch().catch(() => {});
    }

    // Find or create the highest tier role
    let highestRole = null;
    if (highestTier) {
        highestRole = findRoleByName(guild, highestTier.name);
        if (!highestRole) {
            try {
                highestRole = await guild.roles.create({
                    name: highestTier.name,
                    color: highestTier.color,
                    hoist: true,
                    reason: `Auto-create streak tier role: ${highestTier.name}`
                });
            } catch (err) {
                console.error(`[StreakTier] Error creating role ${highestTier.name}:`, err.message);
            }
        }
    }

    let roleAdded = false;
    let roleRemoved = false;

    // Clean up other streak tier roles from member
    if (member.roles?.cache) {
        for (const [, role] of member.roles.cache) {
            if (tierNames.has(role.name)) {
                if (!highestRole || role.id !== highestRole.id) {
                    try {
                        await member.roles.remove(role, 'Auto-cleanup previous streak tier');
                        roleRemoved = true;
                    } catch (_) {}
                }
            }
        }
    }

    // Assign highest role if member does not have it yet
    if (highestRole) {
        const hasIt = memberHasRole(member, highestRole.id);
        if (!hasIt) {
            try {
                await member.roles.add(highestRole, `Streak milestone reached: ${highestTier.days} days`);
                roleAdded = true;
            } catch (err) {
                console.error(`[StreakTier] Error adding role ${highestRole.name} to member ${member.id}:`, err.message);
            }
        }
    }

    return {
        highestTier,
        highestRole,
        roleAdded,
        roleRemoved
    };
}

async function syncAllMemberStreakRoles(guild) {
    if (!guild) return { ok: false, error: 'Guild tidak valid' };
    const me = guild.members?.me || (await guild.members.fetchMe().catch(() => null));
    if (!me || !me.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
        return { ok: false, error: 'Bot membutuhkan permission "Manage Roles"!' };
    }

    // 1. Ensure all 7 roles exist in server
    const roleMap = await ensureAllStreakRoles(guild);

    // 2. Fetch all guild members into cache
    await guild.members.fetch().catch(() => {});

    // 3. Query streaks from DB
    let rows = [];
    try {
        rows = db.prepare('SELECT userId, count FROM streaks WHERE guildId = ? AND count >= 7 ORDER BY count DESC').all(guild.id);
    } catch (_) {
        rows = db.prepare('SELECT userId, count FROM streaks WHERE count >= 7 ORDER BY count DESC').all();
    }

    let syncedCount = 0;
    const details = [];

    for (const r of rows) {
        const member = guild.members.cache.get(r.userId);
        if (!member) continue;

        const tier = getStreakTier(r.count);
        if (!tier) continue;

        const res = await syncMemberStreakRole(member, r.count);
        if (res.roleAdded || res.highestRole) {
            syncedCount++;
            if (details.length < 10) {
                details.push(`• <@${member.id}> (${r.count} hari) → ${tier.emoji} **${tier.name}**`);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    return {
        ok: true,
        syncedCount,
        totalEligible: rows.length,
        rolesCreated: Object.keys(roleMap).length,
        details
    };
}

// ==================== VVIP LOUNGE SETUP ====================
async function setupLounge(guild) {
    if (!guild) return { ok: false, error: 'Guild tidak valid' };
    const me = guild.members?.me;
    if (!me || !me.permissions?.has(PermissionsBitField.Flags.ManageChannels) || !me.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
        return { ok: false, error: 'Bot membutuhkan permission Manage Channels dan Manage Roles!' };
    }

    // Ensure 100+ tier roles exist
    const loungeTiers = STREAK_TIERS.filter(t => t.lounge);
    const loungeRoles = [];
    for (const t of loungeTiers) {
        let r = findRoleByName(guild, t.name);
        if (!r) {
            try {
                r = await guild.roles.create({
                    name: t.name,
                    color: t.color,
                    hoist: true,
                    reason: `Auto-create lounge tier role: ${t.name}`
                });
            } catch (_) {}
        }
        if (r) loungeRoles.push(r);
    }

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
        },
        ...loungeRoles.map(r => ({
            id: r.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak
            ]
        }))
    ];

    let catId = getSetting(guild.id, 'streak_lounge_category', null);
    let category = catId ? guild.channels.cache.get(catId) : null;
    if (!category) {
        category = await guild.channels.create({
            name: '🔒 ✦ VVIP LOUNGE ✦',
            type: ChannelType.GuildCategory,
            permissionOverwrites: overwrites,
            reason: 'VVIP Lounge Category for Streak 100+'
        });
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guild.id, 'streak_lounge_category', category.id);
    } else {
        for (const ow of overwrites) {
            await category.permissionOverwrites.edit(ow.id, ow.allow ? {
                ViewChannel: true, SendMessages: true, ReadMessageHistory: true, Connect: true, Speak: true
            } : {
                ViewChannel: false
            }).catch(() => {});
        }
    }

    let txtId = getSetting(guild.id, 'streak_lounge_text', null);
    let textChannel = txtId ? guild.channels.cache.get(txtId) : null;
    if (!textChannel) {
        textChannel = await guild.channels.create({
            name: '🏛️・high-table',
            type: ChannelType.GuildText,
            parent: category.id,
            reason: 'VVIP Lounge text channel'
        });
        await textChannel.lockPermissions().catch(() => {});
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guild.id, 'streak_lounge_text', textChannel.id);

        const welcomeEmbed = new EmbedBuilder()
            .setTitle('🏛️ Selamat Datang di VVIP High-Table Lounge')
            .setColor('#FFD700')
            .setDescription(
                'Selamat! Kamu adalah pilar paling loyal di server ini (Streak 100+ hari). 👑\n\n' +
                '> 💎 **Fasilitas Warga Lounge:**\n' +
                '> • Obrolan privat khusus para sesepuh server.\n' +
                '> • Akses klaim **Lounge Supply Crate** harian via `/streak lounge`.\n' +
                '> • Channel voice eksklusif bitrate tinggi.\n' +
                '> • Event & giveaway eksklusif antar warga VVIP.'
            )
            .setFooter({ text: '✦ High Table • Reserved for the Loyal' })
            .setTimestamp();
        textChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
    }

    let vcId = getSetting(guild.id, 'streak_lounge_voice', null);
    let voiceChannel = vcId ? guild.channels.cache.get(vcId) : null;
    if (!voiceChannel) {
        const maxBitrate = guild.maximumBitrate || 96000;
        voiceChannel = await guild.channels.create({
            name: '🔊・lounge-vc',
            type: ChannelType.GuildVoice,
            parent: category.id,
            bitrate: Math.min(384000, maxBitrate),
            reason: 'VVIP Lounge voice channel'
        });
        await voiceChannel.lockPermissions().catch(() => {});
        db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)').run(guild.id, 'streak_lounge_voice', voiceChannel.id);
    }

    return { ok: true, category, textChannel, voiceChannel };
}

// ==================== LOUNGE SUPPLY CRATE ====================
function claimLoungeCrate(guildId, userId, streakCount) {
    if (streakCount < 100) {
        return { ok: false, error: '❌ Hanya warga VVIP Lounge (streak 100+ hari) yang bisa klaim Supply Crate!' };
    }

    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const statKey = `lounge_crate_${today}`;
    const alreadyClaimed = getUserStat(guildId, userId, statKey);
    if (alreadyClaimed) {
        return { ok: false, error: '⏳ Kamu sudah klaim Lounge Supply Crate hari ini! Kembali lagi besok (00:00 WIB).' };
    }

    const money = 50000 + Math.floor(streakCount * 250);
    const items = [
        { id: 'mystery_box', qty: streakCount >= 200 ? 5 : 2 },
        { id: 'lucky_charm', qty: streakCount >= 200 ? 2 : 1 }
    ];
    if (streakCount >= 200) {
        items.push({ id: 'streak_shield', qty: 1 });
    }

    db.prepare('UPDATE users SET balance = balance + ? WHERE guildId = ? AND userId = ?').run(money, guildId, userId);
    for (const it of items) {
        addItem(guildId, userId, it.id, it.qty);
    }
    setUserStat(guildId, userId, statKey, 1);
    incrementUserStat(guildId, userId, 'total_lounge_crates_claimed', 1);

    return {
        ok: true,
        money,
        items
    };
}

// ==================== PANEL BUILDERS ====================
function buildStreakStatusPanel(guildId, userId, username, streakCount) {
    const currentTier = getStreakTier(streakCount);
    const nextTier = getNextStreakTier(streakCount);
    const chatBonus = getStreakChatBonus(streakCount);
    const emoji = getStreakEmoji(streakCount);

    let progressDesc = '';
    if (nextTier) {
        const prevDays = currentTier ? currentTier.days : 0;
        const range = nextTier.days - prevDays;
        const done = streakCount - prevDays;
        const pct = Math.min(100, Math.max(0, Math.floor((done / range) * 100)));
        const bar = '▰'.repeat(Math.floor(pct / 10)) + '▱'.repeat(10 - Math.floor(pct / 10));
        progressDesc = `> 🎯 **Next Tier:** ${nextTier.emoji} **${nextTier.name}** (${nextTier.days} hari)\n> \`${bar}\` ${pct}% (${streakCount}/${nextTier.days} hari)`;
    } else {
        progressDesc = `> 🏆 **MAX TIER ACHIEVED!** Kamu telah mencapai puncak keabadian streak!`;
    }

    const isLounge = streakCount >= 100;

    const embed = new EmbedBuilder()
        .setTitle(`🔥 Streak Prestige — ${username}`)
        .setColor(currentTier ? currentTier.color : '#FF4500')
        .setDescription(
            `Statistik keaktifan dan hierarki loyalitasmu di server.\n\n` +
            ui.statBlock([
                `🔥 Total Streak: **${streakCount} Hari**`,
                `👑 Rank Tier: ${currentTier ? `${currentTier.emoji} **${currentTier.name}**` : 'Belum Ada Tier (<7 Hari)'}`,
                `💬 Chat Bonus: **+${Math.round(chatBonus * 100)}%** Money & XP`,
                `🏛️ VVIP Lounge: **${isLounge ? '✅ Unlocked (Warga High-Table)' : '🔒 Locked (Butuh 100 Hari)'}**`,
            ]) + '\n\n' +
            progressDesc
        )
        .setFooter({ text: ui.footer('Chat setiap hari untuk pertahankan streak dan bonus!') })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`strk_tiers_${userId}`).setLabel('📜 Daftar Tier').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`strk_lounge_${userId}`).setLabel('🏛️ VVIP Lounge').setStyle(isLounge ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`strk_lb_${userId}`).setLabel('🏆 Hall of Fame').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

function buildStreakTiersPanel(userId) {
    let desc = 'Hierarki role prestise berdasarkan keaktifan chat berturut-turut:\n\n';
    for (const t of STREAK_TIERS) {
        desc += `### ${t.emoji} ${t.name} (${t.days}+ Hari)\n`;
        desc += `> 💬 Bonus Chat: **+${Math.round(t.chatBonus * 100)}%**\n`;
        desc += `> 🪙 Reward Milestone: **+${t.reward.toLocaleString('id-ID')}**\n`;
        desc += `> 🏛️ Hak Istimewa: **${t.lounge ? 'Akses VVIP High-Table Lounge' : 'Role Warna Server'}**\n\n`;
    }

    const embed = new EmbedBuilder()
        .setTitle('📜 Hierarki Streak Prestige')
        .setColor('#FFD700')
        .setDescription(desc)
        .setFooter({ text: ui.footer('Role otomatis diberikan dan diganti saat kamu naik tier!') });

    const row = ui.backRow(`strk_back_${userId}`);
    return { embeds: [embed], components: [row] };
}

function buildStreakLeaderboard(guildId, userId) {
    const rows = db.prepare('SELECT userId, count FROM streaks WHERE guildId = ? ORDER BY count DESC LIMIT 10').all(guildId);
    let desc = '';
    if (rows.length === 0) {
        desc = '*Belum ada streak tercatat di server ini.*';
    } else {
        rows.forEach((r, i) => {
            const tier = getStreakTier(r.count);
            const tierBadge = tier ? `${tier.emoji} ${tier.name}` : 'Novice';
            desc += `${ui.medal(i)} <@${r.userId}> — 🔥 **${r.count}** hari • *${tierBadge}*\n`;
        });
    }

    const embed = new EmbedBuilder()
        .setTitle(ui.title('🏆', 'STREAK HALL OF FAME'))
        .setColor(ui.COLORS.leaderboard)
        .setDescription(desc)
        .setFooter({ text: ui.footer('Top 10 Pejuang Streak Terpanjang Server') });

    const row = ui.backRow(`strk_back_${userId}`);
    return { embeds: [embed], components: [row] };
}

function buildLoungePanel(guildId, userId, streakCount) {
    const isLounge = streakCount >= 100;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const statKey = `lounge_crate_${today}`;
    const alreadyClaimed = Boolean(getUserStat(guildId, userId, statKey));

    const embed = new EmbedBuilder()
        .setTitle('🏛️ VVIP High-Table Lounge')
        .setColor(isLounge ? '#FFD700' : '#808080')
        .setDescription(
            `Kamar eksklusif untuk member paling setia dengan streak **100+ hari**.\n\n` +
            ui.statBlock([
                `Status: **${isLounge ? '✅ Terverifikasi Warga VVIP' : '🔒 Belum Memenuhi Syarat'}**`,
                `Streak Kamu: **${streakCount} Hari** ${isLounge ? '👑' : '(Kurang ' + (100 - streakCount) + ' hari lagi)'}`,
                `Lounge Supply Crate: **${alreadyClaimed ? '✅ Sudah Diklaim Hari Ini' : isLounge ? '🎁 Tersedia!' : '🔒 Terkunci'}**`,
            ]) + '\n\n' +
            (isLounge
                ? '> Klik tombol **🎁 Klaim Supply Crate** di bawah untuk ambil jatah harian warga VVIP!'
                : '> Pertahankan streak chat kamu sampai 100 hari untuk membuka akses ke channel rahasia dan hadiah harian ini.')
        )
        .setFooter({ text: ui.footer('VVIP Lounge • Dedicated to Server Veterans') });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`strk_crate_${userId}`)
            .setLabel('🎁 Klaim Supply Crate')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!isLounge || alreadyClaimed),
        new ButtonBuilder().setCustomId(`strk_back_${userId}`).setLabel('🔙 Back').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

// ==================== INTERACTION HANDLERS ====================
async function handleStreakButton(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const targetUserId = parts[parts.length - 1];

    if (userId !== targetUserId) {
        return interaction.reply({ content: '❌ Ini bukan panel streak kamu!', ephemeral: true });
    }

    const streakRow = db.prepare('SELECT count FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId);
    const streakCount = streakRow ? Number(streakRow.count) || 0 : 0;

    if (action === 'back') {
        return interaction.update(buildStreakStatusPanel(guildId, userId, interaction.user.username, streakCount));
    }
    if (action === 'tiers') {
        return interaction.update(buildStreakTiersPanel(userId));
    }
    if (action === 'lb') {
        return interaction.update(buildStreakLeaderboard(guildId, userId));
    }
    if (action === 'lounge') {
        return interaction.update(buildLoungePanel(guildId, userId, streakCount));
    }
    if (action === 'crate') {
        const res = claimLoungeCrate(guildId, userId, streakCount);
        if (!res.ok) {
            return interaction.reply({ content: res.error, ephemeral: true });
        }
        const itemText = res.items.map(it => `> • **${it.qty}x ${it.id}**`).join('\n');
        await interaction.update(buildLoungePanel(guildId, userId, streakCount));
        return interaction.followUp({
            content: `🎉 **Lounge Supply Crate Berhasil Diklaim!**\n> 🪙 **+${res.money.toLocaleString('id-ID')} Money**\n${itemText}`,
            ephemeral: true
        });
    }
}

function isStreakPanelButton(customId) {
    return customId.startsWith('strk_');
}

module.exports = {
    STREAK_TIERS,
    getStreakTier,
    getNextStreakTier,
    getStreakEmoji,
    getStreakChatBonus,
    ensureAllStreakRoles,
    syncMemberStreakRole,
    syncAllMemberStreakRoles,
    setupLounge,
    claimLoungeCrate,
    buildStreakStatusPanel,
    buildStreakTiersPanel,
    buildStreakLeaderboard,
    buildLoungePanel,
    handleStreakButton,
    isStreakPanelButton
};
