// systems/afk.js — AFK System
// Set AFK status, auto-reply when mentioned, record mentions while away, remove on message
const { EmbedBuilder } = require('discord.js');
const { db, incrementUserStat } = require('../database');

// ==================== DB TABLE ====================
db.exec(`CREATE TABLE IF NOT EXISTS afk_status (
    userId TEXT PRIMARY KEY,
    reason TEXT DEFAULT 'AFK',
    setAt INTEGER DEFAULT 0,
    mentions TEXT DEFAULT '[]'
)`);

// ==================== CORE FUNCTIONS ====================
function setAfk(userId, reason = 'AFK') {
    db.prepare('INSERT OR REPLACE INTO afk_status (userId, reason, setAt, mentions) VALUES (?, ?, ?, ?)').run(userId, reason || 'AFK', Date.now(), '[]');
}

function getAfk(userId) {
    return db.prepare('SELECT * FROM afk_status WHERE userId = ?').get(userId);
}

function removeAfk(userId) {
    const afk = getAfk(userId);
    db.prepare('DELETE FROM afk_status WHERE userId = ?').run(userId);
    return afk;
}

function isAfk(userId) {
    return !!db.prepare('SELECT 1 FROM afk_status WHERE userId = ?').get(userId);
}

function addMention(userId, mentionerId, channelId, messageContent) {
    const afk = getAfk(userId);
    if (!afk) return;
    let mentions = [];
    try { mentions = JSON.parse(afk.mentions || '[]'); } catch (_) {}
    // Keep last 20 mentions max
    mentions.push({ by: mentionerId, ch: channelId, msg: (messageContent || '').substring(0, 100), at: Date.now() });
    if (mentions.length > 20) mentions = mentions.slice(-20);
    db.prepare('UPDATE afk_status SET mentions = ? WHERE userId = ?').run(JSON.stringify(mentions), userId);
}

function getMentions(userId) {
    const afk = getAfk(userId);
    if (!afk) return [];
    try { return JSON.parse(afk.mentions || '[]'); } catch (_) { return []; }
}

// ==================== MESSAGE HANDLER ====================
// Called from messageCreate for every non-bot message
async function handleAfkMessage(message) {
    if (message.author.bot || !message.guild) return;
    const userId = message.author.id;
    const guildId = message.guild.id;

    // === If the sender is AFK, remove their AFK status ===
    if (isAfk(userId)) {
        const afkData = removeAfk(userId);
        if (afkData) {
            const mentions = getMentionsFromData(afkData);
            const duration = formatDuration(Date.now() - afkData.setAt);
            let content = `👋 **Selamat datang kembali**, <@${userId}>! AFK kamu dihapus.\n> ⏱️ Kamu AFK selama **${duration}**`;
            if (mentions.length > 0) {
                content += `\n> 📬 **${mentions.length} mention** saat kamu pergi:`;
                const shown = mentions.slice(-5);
                for (const m of shown) {
                    content += `\n> • <@${m.by}> di <#${m.ch}> — *"${m.msg}"*`;
                }
                if (mentions.length > 5) content += `\n> ...dan ${mentions.length - 5} lainnya`;
            }
            try {
                const reply = await message.reply({ content, allowedMentions: { users: [] } });
                setTimeout(() => reply.delete().catch(() => {}), 15000);
            } catch (_) {}
        }
    }

    // === Check if message mentions someone who is AFK ===
    if (message.mentions.users.size > 0) {
        for (const [mentionedId, mentionedUser] of message.mentions.users) {
            if (mentionedId === userId) continue; // skip self-mention
            if (mentionedUser.bot) continue;
            const afk = getAfk(mentionedId);
            if (afk) {
                const duration = formatDuration(Date.now() - afk.setAt);
                try {
                    const reply = await message.reply({
                        content: `💤 **${mentionedUser.username}** sedang AFK: *${afk.reason}*\n> ⏱️ Sejak ${duration} yang lalu`,
                        allowedMentions: { users: [] }
                    });
                    setTimeout(() => reply.delete().catch(() => {}), 10000);
                } catch (_) {}
                // Record this mention for when they come back
                addMention(mentionedId, userId, message.channel.id, message.content);
            }
        }
    }
}

// ==================== SLASH COMMAND HANDLER ====================
async function handleAfkCommand(interaction) {
    const reason = interaction.options.getString('alasan') || 'AFK';
    const userId = interaction.user.id;

    setAfk(userId, reason);

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('💤 AFK Diaktifkan')
        .setDescription(
            `**${interaction.user.username}** sekarang AFK.\n\n` +
            `> 💬 Pesan: *${reason}*\n\n` +
            `Siapa saja yang mention kamu akan diberi tahu.\n` +
            `Ketik pesan apa saja di chat untuk menghapus status AFK.`
        )
        .setFooter({ text: 'AFK otomatis hilang saat kamu chat lagi' })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

// ==================== HELPERS ====================
function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s} detik`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} menit`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} jam ${m % 60} menit`;
    const d = Math.floor(h / 24);
    return `${d} hari ${h % 24} jam`;
}

function getMentionsFromData(afkData) {
    try { return JSON.parse(afkData.mentions || '[]'); } catch (_) { return []; }
}

module.exports = { setAfk, getAfk, removeAfk, isAfk, addMention, getMentions, handleAfkMessage, handleAfkCommand };
