// events/voiceStateUpdate.js
const { db, getConf, getSetting } = require('../database');
const { incrementUserStat } = require('../database');
const { checkAchievements } = require('../systems/achievements');
const { updateQuestProgress, addXpAndMoney } = require('../systems/quests');
const state = require('../state');

async function handleVoiceStateUpdate(oldState, newState) {
    if (newState.member.user.bot) return;
    const { isMaintenance } = require('../systems/maintenance');
    if (isMaintenance()) return; // voice XP/reward & tempvoice dimatikan sementara
    const guildId = newState.guild.id;

    // Temp voice cleanup
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        const tempVoiceData = db.prepare('SELECT * FROM temp_voices WHERE channelId = ?').get(oldState.channelId);
        if (tempVoiceData) { const oldChannel = oldState.channel; if (oldChannel && oldChannel.members.size === 0) { db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(oldState.channelId); await oldChannel.delete().catch(() => {}); } }
    }

    // === JOIN-TO-CREATE (JTC) ===
    // When user joins the JTC channel → auto-create their own temp channel & move them
    if (newState.channelId && (!oldState.channelId || oldState.channelId !== newState.channelId)) {
        const jtcChannelId = getSetting(guildId, 'jtc_channel', '');
        if (jtcChannelId && newState.channelId === jtcChannelId) {
            const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const existingTv = db.prepare('SELECT * FROM temp_voices WHERE guildId = ? AND ownerId = ?').get(guildId, newState.member.id);
            
            if (existingTv) {
                // User already has a channel — move them there
                const existingCh = newState.guild.channels.cache.get(existingTv.channelId);
                if (existingCh) {
                    await newState.member.voice.setChannel(existingCh).catch(() => {});
                    return;
                } else {
                    db.prepare('DELETE FROM temp_voices WHERE channelId = ?').run(existingTv.channelId);
                }
            }

            const categoryId = getSetting(guildId, 'jtc_category', '');
            const defaultName = getSetting(guildId, 'tv_default_name', "{user.name}'s Channel")
                .replace(/{user\.name}/g, newState.member.user.username)
                .replace(/{user\.id}/g, newState.member.id);

            try {
                const newChannel = await newState.guild.channels.create({
                    name: defaultName,
                    type: ChannelType.GuildVoice,
                    parent: categoryId || undefined,
                    permissionOverwrites: [
                        { id: newState.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect] },
                        { id: newState.member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.MoveMembers] }
                    ]
                });

                db.prepare('INSERT INTO temp_voices (channelId, guildId, ownerId) VALUES (?, ?, ?)').run(newChannel.id, guildId, newState.member.id);
                await newState.member.voice.setChannel(newChannel).catch(() => {});

                // Send control panel embed to the new channel
                const controlEmbed = new EmbedBuilder()
                    .setTitle('🎙️ TempVoice Control Panel')
                    .setColor('#2B2D31')
                    .setDescription(
                        `Selamat datang di channel pribadimu!\n\n` +
                        `**✨ CARA MENGATUR CHANNEL:**\n` +
                        `Gunakan tombol di bawah untuk mengatur privasi, nama, limit, atau menendang member nakal.\n\n` +
                        `**⚙️ KONTROL:**\n` +
                        `> ✏️ **Name** — Ubah nama channel\n` +
                        `> 👥 **Limit** — Atur batas member\n` +
                        `> 🔒 **Lock/Unlock** — Kunci channel\n` +
                        `> 👻 **Hide/Unhide** — Sembunyikan channel\n` +
                        `> 👢 **Kick** — Tendang user\n` +
                        `> 🚫 **Block** — Block user masuk\n` +
                        `> 🟢 **Unblock** — Buka block\n` +
                        `> 👑 **Claim Owner** — Ambil ownership\n` +
                        `> 🔄 **Transfer** — Pindah ownership\n` +
                        `> 🗑️ **Delete** — Hapus channel`
                    )
                    .setFooter({ text: 'Channel otomatis dihapus saat kosong' });

                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('tv_name').setLabel('✏️ Name').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('tv_limit').setLabel('👥 Limit').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('tv_privacy').setLabel('🔒 Lock/Unlock').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('tv_hide').setLabel('👻 Hide/Unhide').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('tv_claim').setLabel('👑 Claim Owner').setStyle(ButtonStyle.Secondary)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('tv_transfer').setLabel('🔄 Transfer').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('tv_unblock').setLabel('🟢 Unblock').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('tv_kick').setLabel('👢 Kick').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('tv_block').setLabel('🚫 Block').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('tv_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger)
                );

                await newChannel.send({ embeds: [controlEmbed], components: [row1, row2] }).catch(() => {});
            } catch (e) {
                console.error('[tempvoice] JTC create failed:', e?.message || e);
            }
            return;
        }
    }

    const cdKey = `${guildId}_${newState.member.id}`;

    // === JOIN VC → start session ===
    if (!oldState.channelId && newState.channelId) {
        if (!newState.selfDeaf) {
            state.voiceSessions.set(cdKey, Date.now());
        }
    }

    // === LEAVE VC → end session, give XP (quest handled by tick) ===
    else if (oldState.channelId && !newState.channelId) {
        if (state.voiceSessions.has(cdKey)) {
            const durationMins = Math.floor((Date.now() - state.voiceSessions.get(cdKey)) / 60000);
            if (durationMins >= 1) {
                const voiceCd = parseInt(getSetting(guildId, 'voice_xp_cooldown', '') || getConf(guildId, 'voice_cooldown', 5)) || 5;
                const multiplier = Math.floor(durationMins / voiceCd);
                if (multiplier > 0) await addXpAndMoney(newState.member, 'voice', multiplier);
                updateQuestProgress(guildId, newState.member.id, 'voice', durationMins);
                incrementUserStat(guildId, newState.member.id, 'total_voice_mins', durationMins);
                await checkAchievements(newState.guild, newState.member.id, { type: 'voice' });
            }
            state.voiceSessions.delete(cdKey);
        }
    }

    // === DEAFEN → pause (end session) ===
    else if (oldState.channelId && newState.channelId && !oldState.selfDeaf && newState.selfDeaf) {
        if (state.voiceSessions.has(cdKey)) {
            const durationMins = Math.floor((Date.now() - state.voiceSessions.get(cdKey)) / 60000);
            if (durationMins >= 1) {
                updateQuestProgress(guildId, newState.member.id, 'voice', durationMins);
                incrementUserStat(guildId, newState.member.id, 'total_voice_mins', durationMins);
            }
            state.voiceSessions.delete(cdKey);
        }
    }

    // === UNDEAFEN → resume (start session) ===
    else if (oldState.channelId && newState.channelId && oldState.selfDeaf && !newState.selfDeaf) {
        state.voiceSessions.set(cdKey, Date.now());
    }

    // === SWITCH CHANNEL → keep session running ===
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        if (!state.voiceSessions.has(cdKey) && !newState.selfDeaf) {
            state.voiceSessions.set(cdKey, Date.now());
        }
    }
}

// === PERIODIC VOICE TICK ===
// Every 1 minute, update quest progress for users currently in VC
// This ensures quest updates even if user stays in VC without leaving
function startVoiceTickInterval() {
    setInterval(() => {
        const now = Date.now();
        for (const [cdKey, startTime] of state.voiceSessions.entries()) {
            const durationMins = Math.floor((now - startTime) / 60000);
            if (durationMins >= 1) {
                const idx = cdKey.indexOf('_');
                const guildId = cdKey.substring(0, idx);
                const userId = cdKey.substring(idx + 1);
                updateQuestProgress(guildId, userId, 'voice', durationMins);
                incrementUserStat(guildId, userId, 'total_voice_mins', durationMins);
                // Reset start time so we don't double-count
                state.voiceSessions.set(cdKey, now);
            }
        }
    }, 60 * 1000); // every 1 minute
}

module.exports = handleVoiceStateUpdate;
module.exports.startVoiceTickInterval = startVoiceTickInterval;
