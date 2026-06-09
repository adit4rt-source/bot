// systems/onboarding.js — New-member onboarding DM.
// Many active bots lose new members because they don't know where to start. When
// someone joins, we DM a short, friendly "getting started" guide pointing at the
// headline commands (/fish, /daily, etc.). Configurable + best-effort (DMs may be
// closed), so it never blocks the join flow.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getSetting } = require('../database');

// Quick-start commands shown to every newcomer. Kept short on purpose — the goal is
// to get them to type ONE command, not to read a manual.
const QUICK_START = [
    { cmd: '/daily',   emoji: '🎁', desc: 'Klaim hadiah harian — login tiap hari, reward makin gede!' },
    { cmd: '/fish',    emoji: '🎣', desc: 'Mulai mancing, kumpulkan 86+ ikan & koin' },
    { cmd: '/farm',    emoji: '🌾', desc: 'Tanam, siram, panen — bangun kebunmu' },
    { cmd: '/pet',     emoji: '🐾', desc: 'Adopsi & rawat pet, lalu battle' },
    { cmd: '/profile', emoji: '🏆', desc: 'Lihat level, badge, & kartu profil kerenmu' },
    { cmd: '/help',    emoji: '❓', desc: 'Daftar lengkap semua fitur' },
];

function buildOnboardingEmbed(member, guildName) {
    const name = guildName || (member && member.guild && member.guild.name) || 'server ini';
    const lines = QUICK_START.map(q => `> ${q.emoji} \`${q.cmd}\` — ${q.desc}`).join('\n');

    return new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`👋 Selamat datang di ${name}!`)
        .setDescription(
            `Hai${member && member.user ? ` **${member.user.username}**` : ''}! Senang kamu gabung 🎉\n\n` +
            `Bingung mulai dari mana? Coba salah satu perintah ini di server:\n\n` +
            lines +
            `\n\n💡 **Tips:** mulai dari \`/daily\` lalu \`/fish\` — paling gampang buat dapat koin pertama!`
        )
        .setFooter({ text: `Ketik perintah di channel mana pun di ${name}. Selamat bermain! 🚀` })
        .setTimestamp();
}

// Send the onboarding DM. Returns true if a DM was attempted/sent, false if skipped.
async function handleOnboarding(member) {
    try {
        if (!member || !member.user || member.user.bot) return false;
        const guildId = member.guild.id;
        // Enabled by default; admins can disable via server_settings 'onboarding_enabled'.
        if (getSetting(guildId, 'onboarding_enabled', '1') !== '1') return false;

        const embed = buildOnboardingEmbed(member, member.guild.name);

        // Optional jump button if a "start here" channel is configured.
        const components = [];
        const startChannelId = getSetting(guildId, 'onboarding_channel', '');
        if (startChannelId) {
            const url = `https://discord.com/channels/${guildId}/${startChannelId}`;
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('🚀 Mulai di sini').setStyle(ButtonStyle.Link).setURL(url)
            ));
        }

        await member.send({ embeds: [embed], components }).catch(() => {});
        return true;
    } catch (_) {
        return false;
    }
}

module.exports = { buildOnboardingEmbed, handleOnboarding, QUICK_START };
