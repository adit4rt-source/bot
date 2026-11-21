// One-shot: post full changelog to Discord update channel
// Usage: node scripts/post-changelog.js
// Loads token from ENV_FILE or DISCORD_TOKEN env

require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const CHANNEL_ID = '1510705567944151150';
const VERSION = '3.12.0';
const BUILD_DATE = '2026-07-18';

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
    console.error('Missing DISCORD_TOKEN');
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function post() {
    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel) throw new Error('Channel not found: ' + CHANNEL_ID);

        const embeds = [
            new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`🎉 COMMUNITY UPDATE — v${VERSION}`)
                .setDescription(
                    `**Release v${VERSION}** — ${BUILD_DATE}\n\n` +
                    `Update besar fokus komunitas: **Pure Economy & Community**!\n` +
                    `Semua fitur RPG/Pet/Fishing/Farming lama telah dibersihkan total.\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
                )
                .setTimestamp(),

            new EmbedBuilder()
                .setColor('#E67E22')
                .setTitle('🔥 STREAK PRESTIGE & VVIP LOUNGE')
                .setDescription(
                    `> 🔥 **Streak Role Sync** otomatis tiap aktif chat\n` +
                    `> 🏛️ **VVIP Lounge** eksklusif member streak 100+ hari\n` +
                    `> 🏆 **Streak Leaderboard** & Hall of Fame`
                )
                .setTimestamp(),

            new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle('💰 EKONOMI & COMMUNITY SHOP')
                .setDescription(
                    `> 💳 \`/wallet\` — Panel saldo, gift & voucher\n` +
                    `> 🛒 \`/shop\` — Role eksklusif, color role & booster\n` +
                    `> 🎰 \`/casino\` & \`/blackjack\` — Mini-games hiburan seru`
                )
                .setTimestamp(),

            new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🎮 QUIZ 14 KATEGORI & RAMALAN 365')
                .setDescription(
                    `> 🎮 \`/games\` — Quiz asah otak, tebak gambar & kata\n` +
                    `> 🔮 \`/ramalan\` — Ramalan harian, angka & warna hoki\n` +
                    `> 🎙️ \`/tempvoice\` — Private Space otomatis`
                )
                .setFooter({ text: `idcommunity Bot v${VERSION} — Economy & Community | discord.gg/idcommunity` })
                .setTimestamp(),
        ];

        // Discord allows max 10 embeds per message; we have 5
        const msg = await channel.send({ embeds });
        console.log('Posted changelog to', CHANNEL_ID, 'msg=', msg.id);
    } catch (e) {
        console.error('Failed:', e);
        process.exitCode = 1;
    } finally {
        client.destroy();
        process.exit(process.exitCode || 0);
    }
}

client.once('clientReady', post);
client.once('ready', post);

client.login(TOKEN).catch(e => {
    console.error('Login failed:', e.message);
    process.exit(1);
});
