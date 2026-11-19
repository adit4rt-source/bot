// systems/layoutCleanup.js - Auto Server Layout Organizer
const { PermissionsBitField, ChannelType } = require('discord.js');
const { setupLounge, reorderStreakRoles } = require('./streakTier');

async function cleanServerLayout(guild) {
    if (!guild) return { ok: false, error: 'Guild tidak ditemukan' };
    const me = guild.members?.me || (await guild.members.fetchMe?.().catch(() => null));
    if (me && me.permissions && !me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return { ok: false, error: 'Bot butuh permission Manage Channels untuk merapikan channel!' };
    }

    const log = [];
    if (guild.channels?.fetch) {
        await guild.channels.fetch().catch(() => {});
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
        } catch (_) {}
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
        } catch (_) {}
    }

    // 3. Rapihkan format nama channel STAFF
    const testingCh = findChannel(c => c.name && c.name.toLowerCase() === 'testing-bot');
    if (testingCh && typeof testingCh.setName === 'function') {
        try {
            await testingCh.setName('「🧪」bot-testing');
            log.push('✅ Format nama channel staff `testing-bot` ➔ `「🧪」bot-testing`');
        } catch (_) {}
    }

    const botLogCh = findChannel(c => c.name && c.name.toLowerCase().includes('log-server-yang-pake-bot'));
    if (botLogCh && typeof botLogCh.setName === 'function') {
        try {
            await botLogCh.setName('「📋」bot-logs');
            log.push('✅ Format nama channel staff `log-server-yang-pake-bot` ➔ `「📋」bot-logs`');
        } catch (_) {}
    }

    const backupCh = findChannel(c => c.name && c.name.toLowerCase().startsWith('autobackup'));
    if (backupCh && typeof backupCh.setName === 'function') {
        try {
            await backupCh.setName('「💾」backup-db');
            log.push('✅ Format nama channel staff `autobackup` ➔ `「💾」backup-db`');
        } catch (_) {}
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
            } catch (_) {}
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
            } catch (_) {}
        }
    }

    // 5. Setup VVIP Lounge (Category, Text, Voice)
    try {
        const loungeRes = await setupLounge(guild);
        if (loungeRes && loungeRes.ok) {
            log.push('🏛️ Setup kategori & channel privat `🏛️ HIGH TABLE (VVIP)`');
        }
    } catch (_) {}

    // 6. Urutkan hierarki 7 role streak
    try {
        const reorderRes = await reorderStreakRoles(guild);
        if (reorderRes) {
            log.push('🎭 Urutkan hierarki role streak (Mythos ➔ Sparks)');
        }
    } catch (_) {}

    return {
        ok: true,
        actionsTaken: log.length,
        log
    };
}

module.exports = {
    cleanServerLayout
};
