// systems/layoutCleanup.js - Auto Server Layout Organizer
const { PermissionsBitField, ChannelType, EmbedBuilder } = require('discord.js');
const { setupLounge, reorderStreakRoles } = require('./streakTier');
const { db } = require('../database');
const { getMenu, updateMenu, refreshPublicMessage } = require('./selfRoles');
const { syncMemberNickname } = require('./activity');

async function cleanServerLayout(guild) {
    if (!guild) return { ok: false, error: 'Guild tidak ditemukan' };
    const me = guild.members?.me || (await guild.members.fetchMe?.().catch(() => null));
    if (me && me.permissions && !me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return { ok: false, error: 'Bot butuh permission Manage Channels untuk merapikan channel!' };
    }

    const log = [];
    if (guild.channels?.fetch) {
        await guild.channels.fetch().catch(() => { });
    }

    const channels = guild.channels?.cache || new Map();

    // Helper find channel
    const findChannel = (predicate) => {
        if (typeof channels.find === 'function') return channels.find(predicate);
        for (const [id, c] of channels) {
            if (predicate(c, id)) return c;
        }
        return null;
    };

    // 1. Perbaiki Typo 'gipowe' -> '「🎁」giveaway'
    const gipoweCh = findChannel(c => c.name && c.name.toLowerCase().includes('gipowe'));
    if (gipoweCh && typeof gipoweCh.setName === 'function') {
        try {
            await gipoweCh.setName('「🎁」giveaway');
            log.push('✅ Ganti nama typo `gipowe` ➔ `「🎁」giveaway`');
        } catch (_) { }
    }

    // 2. Pindahkan & rename 'spam' ke kategori [MAIN BOT] -> '「⚡」bot-spam'
    const spamCh = findChannel(c => {
        if (!c.name) return false;
        const n = c.name.toLowerCase();
        return (n.includes('spam') || n.includes('❗')) && !n.includes('bot-spam');
    });
    const mainBotCat = findChannel(c => c.type === ChannelType.GuildCategory && c.name && c.name.toLowerCase().includes('main bot'));
    if (spamCh && typeof spamCh.edit === 'function') {
        try {
            const editPayload = { name: '「⚡」bot-spam' };
            if (mainBotCat) editPayload.parent = mainBotCat.id;
            await spamCh.edit(editPayload);
            log.push('✅ Pindah & ganti nama `spam` ➔ `「⚡」bot-spam` (kategori `[MAIN BOT]`)');
        } catch (_) { }
    }

    // 3. Rapihkan format nama channel STAFF
    const testingCh = findChannel(c => c.name && c.name.toLowerCase() === 'testing-bot');
    if (testingCh && typeof testingCh.setName === 'function') {
        try {
            await testingCh.setName('「🧪」bot-testing');
            log.push('✅ Format nama channel staff `testing-bot` ➔ `「🧪」bot-testing`');
        } catch (_) { }
    }

    const botLogCh = findChannel(c => c.name && c.name.toLowerCase().includes('log-server-yang-pake-bot'));
    if (botLogCh && typeof botLogCh.setName === 'function') {
        try {
            await botLogCh.setName('「📋」bot-logs');
            log.push('✅ Format nama channel staff `log-server-yang-pake-bot` ➔ `「📋」bot-logs`');
        } catch (_) { }
    }

    const backupCh = findChannel(c => c.name && c.name.toLowerCase().startsWith('autobackup'));
    if (backupCh && typeof backupCh.setName === 'function') {
        try {
            await backupCh.setName('「💾」backup-db');
            log.push('✅ Format nama channel staff `autobackup` ➔ `「💾」backup-db`');
        } catch (_) { }
    }

    // 4. Pastikan channel settings TempVoice di setiap kategori voice ADA (JANGAN DIHAPUS)
    const voicePubCat = findChannel(c => c.type === ChannelType.GuildCategory && c.name && c.name.toLowerCase().includes('voice public'));
    if (voicePubCat) {
        const pubSettings = findChannel(c => c.parentId === voicePubCat.id && c.name && c.name.toLowerCase().includes('setting'));
        if (!pubSettings && typeof guild.channels?.create === 'function') {
            try {
                await guild.channels.create({
                    name: '「✨」settings',
                    type: ChannelType.GuildText,
                    parent: voicePubCat.id,
                    reason: 'Restore TempVoice settings channel'
                });
                log.push('✅ Buat ulang `「✨」settings` di `[VOICE PUBLIC]`');
            } catch (_) { }
        }
    }

    const gamingVoiceCat = findChannel(c => c.type === ChannelType.GuildCategory && c.name && c.name.toLowerCase().includes('gaming voice'));
    if (gamingVoiceCat) {
        const gamingSettings = findChannel(c => c.parentId === gamingVoiceCat.id && c.name && c.name.toLowerCase().includes('setting'));
        if (!gamingSettings && typeof guild.channels?.create === 'function') {
            try {
                await guild.channels.create({
                    name: '「🌸」settings',
                    type: ChannelType.GuildText,
                    parent: gamingVoiceCat.id,
                    reason: 'Restore TempVoice settings channel'
                });
                log.push('✅ Buat ulang `「🌸」settings` di `[GAMING VOICE]`');
            } catch (_) { }
        }
    }

    // 5. Setup VVIP Lounge (Category, Text, Voice)
    try {
        const loungeRes = await setupLounge(guild);
        if (loungeRes && loungeRes.ok) {
            log.push('🏛️ Setup kategori & channel privat `🏛️ HIGH TABLE (VVIP)`');
        }
    } catch (_) { }

    // 6. Urutkan hierarki 7 role streak
    try {
        const reorderRes = await reorderStreakRoles(guild);
        if (reorderRes) {
            log.push('🎭 Urutkan hierarki role streak (Mythos ➔ Sparks)');
        }
    } catch (_) { }

    // 7. Ubah menu self-role GENDER menjadi single-choice (unique) & refresh pesan publik
    try {
        const genderMenuRow = db.prepare("SELECT id, title, type FROM selfrole_menus WHERE guildId = ? AND UPPER(title) LIKE '%GENDER%'").get(guild.id);
        if (genderMenuRow) {
            updateMenu(guild.id, genderMenuRow.id, { type: 'unique', maxRoles: 1 });
            const updated = getMenu(guild.id, genderMenuRow.id);
            if (updated) await refreshPublicMessage(guild, updated);
            log.push('🔘 Ubah menu self-role GENDER menjadi single-choice (`unique`, tidak bisa dobel)');
        }
    } catch (_) { }

    // 8. Pin banner panduan hadiah invite di channel invite-logs
    const inviteLogCh = findChannel(c => c.name && c.name.toLowerCase().includes('invite-logs'));
    if (inviteLogCh && typeof inviteLogCh.send === 'function') {
        try {
            const pinnedMsgs = inviteLogCh.messages?.fetchPinned ? await inviteLogCh.messages.fetchPinned().catch(() => null) : null;
            const alreadyPinned = pinnedMsgs && pinnedMsgs.some(m => m.embeds && m.embeds.some(e => e.title && e.title.includes('HADIAH INVITE')));
            if (!alreadyPinned) {
                const inviteEmbed = new EmbedBuilder()
                    .setTitle('🤝 PANDUAN & REWARD INVITE — ID COMMUNITY')
                    .setColor('#FFD700')
                    .setDescription(
                        `Ajak teman bergabung ke **ID COMMUNITY** dan dapatkan reward Money + Booster eksklusif!\n\n` +
                        `**🏆 TIER REWARD UNDANGAN:**\n` +
                        `> 🥉 **3 Invite Valid:** 🪙 3.000 Money + 📦 2× Mystery Box\n` +
                        `> 🥈 **5 Invite Valid:** 🪙 6.000 Money + 🍀 1× Lucky Charm + 📅 1× Daily Doubler\n` +
                        `> 🥇 **10 Invite Valid:** 🪙 15.000 Money + ⚡ 2× XP Booster 2x\n` +
                        `> 👑 **25 Invite Valid:** 🪙 40.000 Money + 🛡️ 1× Streak Shield + 🍀 2× Lucky Charm\n` +
                        `> 💎 **50 Invite Valid:** 🪙 100.000 Money + 🧲 2× Money Magnet + ⚡ 1× XP Booster 3x\n\n` +
                        `💡 *Gunakan command \`/invite\` untuk melihat link invite dan progres tier kamu.*`
                    )
                    .setFooter({ text: 'Anti-Abuse: Akun fake / bot otomatis didiskualifikasi' })
                    .setTimestamp();
                const sentMsg = await inviteLogCh.send({ embeds: [inviteEmbed] });
                if (sentMsg && typeof sentMsg.pin === 'function') {
                    await sentMsg.pin().catch(() => { });
                    log.push('📌 Pasang pin banner reward di `「🤝」invite-logs`');
                }
            }
        } catch (_) { }
    }

    // 9. Format nickname member (PEKO 🔥226 - ⭐100) dan bersihkan sisa badge love
    try {
        let nickCleaned = 0;
        if (guild.members?.fetch) {
            await guild.members.fetch().catch(() => { });
        }
        const members = guild.members?.cache || [];
        for (const [, member] of members) {
            if (!member || member.user?.bot || !member.manageable) continue;
            const updated = await syncMemberNickname(member);
            if (updated) nickCleaned++;
        }
        if (nickCleaned > 0) {
            log.push(`✨ Sinkronkan format nickname member (${nickCleaned} member)`);
        }
    } catch (_) { }

    return {
        ok: true,
        actionsTaken: log.length,
        log
    };
}

module.exports = {
    cleanServerLayout
};
