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
                .setColor('#FF6B35')
                .setTitle(`🎉 MEGA UPDATE — v${VERSION}`)
                .setDescription(
                    `**Release v${VERSION}** — ${BUILD_DATE}\n\n` +
                    `Update besar endgame untuk **Pet**, **Fishing**, dan **Farming**!\n` +
                    `Semua fitur baru sudah live di branch terbaru.\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
                )
                .setTimestamp(),

            new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle('🐾 PET — Ascendant Endgame')
                .setDescription(
                    `**Skill & Ability**\n` +
                    `> ⚔️ **Skill Tier 5** (Lv.150) — 12 skill Ascendant (Time Stop, Omega Burst, Aegis, dll.)\n` +
                    `> 🧪 **Ability Tier 4 + Slot 4** (Lv.150 + Awakening ★2)\n` +
                    `> 🦴 Boss Scavenger · ⚔️ Arena Veteran · 🥚 Egg Whisperer · ✨ Relic Polish · 🌑 Nightmare Runner\n\n` +
                    `**Nightmare Dungeon**\n` +
                    `> 🌑 Daily entry (3/hari, +1 Nightmare Runner)\n` +
                    `> Stats ×1.5 + modifier acak · reward **Nightmare Token**\n` +
                    `> Shop: 📖 **Skill Tome** (reroll skill), refine pack, mythic fragment, dll.\n\n` +
                    `**Konten**\n` +
                    `> 14 pet baru (Rare→God) + multi-bonus endgame\n` +
                    `> 14 skill battle baru (T1–T5 pool lebih luas)\n` +
                    `> 15+ tipe bonus pasif di-wire ke gameplay (chat, fish, farm, battle, daily…)`
                )
                .setTimestamp(),

            new EmbedBuilder()
                .setColor('#1ABC9C')
                .setTitle('🎣 FISHING — Full Hub')
                .setDescription(
                    `Akses: \`/fishing\` → **🧭 Hub**\n\n` +
                    `**Konten**\n` +
                    `> 🌌 Lokasi **Astral Trench** + ~30 spesies ikan baru (total 152+)\n` +
                    `> Umpan: Prism Lure, Omega Bait, Trophy Chum\n` +
                    `> Giant fish endgame (Astral / Celestial / Primordial / God)\n\n` +
                    `**Mekanik**\n` +
                    `> 🏆 **Trophy Catch** (≥90% berat) = +50% nilai jualan\n` +
                    `> 📖 Collection milestone 10/25/50/75/100%\n` +
                    `> 🐟 Double Catch ability pet benar-benar double\n\n` +
                    `**Hub lengkap**\n` +
                    `> 🏅 Mastery Rank 0–50 + location mastery + soft pity\n` +
                    `> 📋 Daily contracts\n` +
                    `> ⚡ Rod Enchant (2 affix) · 🧪 Bait Craft\n` +
                    `> 🐠 Aquarium · 🗓️ Season · 🐉 Co-op Giant\n` +
                    `> 📕 Bestiary · 🌤️ Forecast · 🎯 Perfect Cast`
                )
                .setTimestamp(),

            new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle('🌾 FARMING — Full Hub')
                .setDescription(
                    `Akses: \`/farm\` → **🧭 More** (atau Mastery / Contracts di hub)\n\n` +
                    `**Mastery & Contracts**\n` +
                    `> 🏅 Farm Mastery Rank 0–50 + crop mastery\n` +
                    `> 📋 Daily contracts (panen, tanam, craft, feed, mutasi…)\n\n` +
                    `**Build & Flex**\n` +
                    `> 🌍 **Soil Affix** per plot (Fertile / Swift / Mutable / Hardy / Golden)\n` +
                    `> 🖼️ **Garden Showcase** (4 slot) — bonus pasif\n` +
                    `> 🗓️ Monthly season crop (+20% yield / +mutasi)\n\n` +
                    `**Social & QoL**\n` +
                    `> 🏆 Co-op Harvest Contest (channel, loot by contribution)\n` +
                    `> Dekorasi sekarang kasih **efek nyata** (scarecrow, bee hive, statue…)\n` +
                    `> Pet **livestock_yield** + mastery ke collect ternak`
                )
                .setTimestamp(),

            new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('📌 Cara Coba Fitur Baru')
                .setDescription(
                    `**Pet**\n` +
                    `> \`/pet\` → ⬆️ More → Nightmare / Skill Reroll / Abilities / Awakening\n` +
                    `> Lv.150 unlock Skill T5 · ★2 unlock Ability Slot 4\n\n` +
                    `**Fishing**\n` +
                    `> \`/fishing\` → 🧭 **Hub** · Location → Astral Trench\n` +
                    `> Perfect Cast → HIT NOW → Cast dalam 30 detik\n\n` +
                    `**Farming**\n` +
                    `> \`/farm\` → 🧭 **More** · Mastery · Contracts · Soil · Showcase · Contest\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `*Restart bot di server agar update ter-load.*\n` +
                    `*Enjoy! — idcommunity Bot v${VERSION}*`
                )
                .setFooter({ text: `idcommunity Bot v${VERSION} — Global Economy & RPG | discord.gg/idcommunity` })
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
