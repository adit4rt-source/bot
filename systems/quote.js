// systems/quote.js — Random Quote System (pitucode.com API)
//
// Provides /quote command with multiple categories (galau, motivasi, bucin, dll).
// Also supports auto-quote: scheduled random quotes to a channel.
//
// API: GET https://api.pitucode.com/random/<category>?apikey=<key>
// Key set via env PITUCODE_API_KEY or .env

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getSetting } = require('../database');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

// ==================== CONFIG ====================
const API_BASE = 'https://api.pitucode.com/random';
const API_KEY = process.env.PITUCODE_API_KEY || '';

// Available categories (endpoint name → display info)
const CATEGORIES = {
    galauquote:   { name: 'Galau',       emoji: '💔', color: '#8B5CF6', desc: 'Kata-kata galau yang menyentuh hati' },
    motivasi:     { name: 'Motivasi',    emoji: '🔥', color: '#F59E0B', desc: 'Kata-kata motivasi penyemangat' },
    bucin:        { name: 'Bucin',       emoji: '💕', color: '#EC4899', desc: 'Kata-kata bucin yang bikin baper' },
    bijak:        { name: 'Bijak',       emoji: '🧠', color: '#3B82F6', desc: 'Kata-kata bijak penuh makna' },
    islami:       { name: 'Islami',      emoji: '🕌', color: '#10B981', desc: 'Kata-kata islami yang menenangkan' },
    anime:        { name: 'Anime',       emoji: '🎌', color: '#EF4444', desc: 'Quote dari anime populer' },
    programming:  { name: 'Programming', emoji: '💻', color: '#6366F1', desc: 'Quote untuk para programmer' },
    truth:        { name: 'Truth',       emoji: '🤔', color: '#14B8A6', desc: 'Pertanyaan truth untuk game' },
    dare:         { name: 'Dare',        emoji: '🎯', color: '#F97316', desc: 'Tantangan dare yang seru' },
};

// Fallback category if invalid
const DEFAULT_CATEGORY = 'galauquote';

// ==================== API FETCHER ====================
async function fetchQuote(category = DEFAULT_CATEGORY) {
    const key = API_KEY;
    if (!key) {
        log('WARN', '[quote] PITUCODE_API_KEY belum diset di env!');
        return null;
    }

    const url = `${API_BASE}/${category}?apikey=${encodeURIComponent(key)}`;

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(url, {
            headers: { 'User-Agent': UA, Accept: 'application/json' },
            signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
            log('WARN', `[quote] API HTTP ${res.status} untuk kategori "${category}"`);
            return null;
        }

        const json = await res.json();

        // pitucode API biasanya return { status, result/data/quote }
        // Flexible parsing — ambil teks quote dari berbagai kemungkinan format
        let text = null;
        if (typeof json === 'string') text = json;
        else if (json.result) text = typeof json.result === 'string' ? json.result : (json.result.quote || json.result.text || json.result.content || JSON.stringify(json.result));
        else if (json.data) text = typeof json.data === 'string' ? json.data : (json.data.quote || json.data.text || json.data.content || JSON.stringify(json.data));
        else if (json.quote) text = json.quote;
        else if (json.text) text = json.text;
        else if (json.content) text = json.content;
        else if (json.message) text = json.message;

        if (!text) {
            log('WARN', `[quote] Format response tidak dikenali: ${JSON.stringify(json).slice(0, 200)}`);
            return null;
        }

        return {
            text: String(text).trim(),
            author: json.author || json.result?.author || json.data?.author || null,
            source: json.source || json.result?.source || json.data?.source || json.result?.anime || null,
        };
    } catch (e) {
        log('WARN', `[quote] fetchQuote error: ${e.message}`);
        return null;
    }
}

// ==================== EMBED BUILDER ====================
function buildQuoteEmbed(quote, category) {
    const cat = CATEGORIES[category] || CATEGORIES[DEFAULT_CATEGORY];
    const embed = new EmbedBuilder()
        .setColor(cat.color)
        .setDescription(`${cat.emoji} *"${quote.text}"*`)
        .setFooter({ text: `${cat.name} Quote` })
        .setTimestamp();

    if (quote.author) embed.setAuthor({ name: `— ${quote.author}` });
    if (quote.source) embed.setFooter({ text: `${cat.name} Quote • ${quote.source}` });

    return embed;
}

// ==================== COMMAND HANDLER ====================
// Handles /quote <category> or button interactions
async function handleQuoteCommand(interaction) {
    const category = interaction.options?.getString('kategori') || DEFAULT_CATEGORY;

    if (!CATEGORIES[category]) {
        return interaction.reply({
            content: `❌ Kategori tidak valid. Pilih salah satu: ${Object.keys(CATEGORIES).join(', ')}`,
            ephemeral: true,
        });
    }

    await interaction.deferReply();

    const quote = await fetchQuote(category);

    if (!quote) {
        return interaction.editReply({
            content: '⚠️ Gagal mengambil quote. Coba lagi nanti ya!',
        });
    }

    const embed = buildQuoteEmbed(quote, category);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`quote_refresh_${category}`)
            .setLabel('🔄 Quote Lain')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('quote_categories')
            .setLabel('📋 Kategori')
            .setStyle(ButtonStyle.Primary),
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
}

// ==================== BUTTON HANDLER ====================
async function handleQuoteButton(interaction) {
    const customId = interaction.customId;

    // Refresh button: get new quote from same category
    if (customId.startsWith('quote_refresh_')) {
        const category = customId.replace('quote_refresh_', '');
        await interaction.deferUpdate();

        const quote = await fetchQuote(category);
        if (!quote) {
            return interaction.followUp({ content: '⚠️ Gagal mengambil quote.', ephemeral: true });
        }

        const embed = buildQuoteEmbed(quote, category);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`quote_refresh_${category}`)
                .setLabel('🔄 Quote Lain')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('quote_categories')
                .setLabel('📋 Kategori')
                .setStyle(ButtonStyle.Primary),
        );

        return interaction.editReply({ embeds: [embed], components: [row] });
    }

    // Categories button: show all available categories
    if (customId === 'quote_categories') {
        const list = Object.entries(CATEGORIES)
            .map(([key, cat]) => `${cat.emoji} **${cat.name}** — \`/quote ${key}\`\n> ${cat.desc}`)
            .join('\n\n');

        const embed = new EmbedBuilder()
            .setTitle('📋 Kategori Quote')
            .setColor('#5865F2')
            .setDescription(list)
            .setFooter({ text: 'Gunakan /quote <kategori> untuk mendapatkan quote' });

        // Build category shortcut buttons (max 5 per row)
        const catKeys = Object.keys(CATEGORIES);
        const rows = [];
        for (let i = 0; i < catKeys.length; i += 5) {
            const slice = catKeys.slice(i, i + 5);
            const row = new ActionRowBuilder().addComponents(
                slice.map(key => {
                    const cat = CATEGORIES[key];
                    return new ButtonBuilder()
                        .setCustomId(`quote_refresh_${key}`)
                        .setLabel(`${cat.emoji} ${cat.name}`)
                        .setStyle(ButtonStyle.Secondary);
                })
            );
            rows.push(row);
        }

        return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
}

function isQuoteButton(customId) {
    return typeof customId === 'string' && customId.startsWith('quote_');
}

// ==================== AUTO-QUOTE (scheduled) ====================
// Send a random quote to a configured channel every X hours.
// Settings: quote_auto_channel, quote_auto_interval (hours), quote_auto_category
let _autoInterval = null;

function startAutoQuote(client) {
    if (_autoInterval) clearInterval(_autoInterval);

    // Check every 30 minutes which guilds have auto-quote enabled
    _autoInterval = setInterval(async () => {
        try {
            const guilds = db.prepare(
                "SELECT DISTINCT guildId FROM server_settings WHERE key = 'quote_auto_channel' AND value != ''"
            ).all();

            for (const { guildId } of guilds) {
                const channelId = getSetting(guildId, 'quote_auto_channel', '');
                if (!channelId) continue;

                const intervalHours = parseInt(getSetting(guildId, 'quote_auto_interval', '6')) || 6;
                const lastSent = parseInt(getSetting(guildId, 'quote_auto_last', '0')) || 0;
                const now = Date.now();

                if (now - lastSent < intervalHours * 3600 * 1000) continue;

                const category = getSetting(guildId, 'quote_auto_category', 'motivasi');
                const quote = await fetchQuote(category);
                if (!quote) continue;

                const guild = client.guilds.cache.get(guildId);
                if (!guild) continue;
                const channel = guild.channels.cache.get(channelId);
                if (!channel) continue;

                const embed = buildQuoteEmbed(quote, category);
                embed.setTitle(`${CATEGORIES[category]?.emoji || '💬'} Quote of the Day`);

                await channel.send({ embeds: [embed] }).catch(() => {});
                db.prepare('INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)')
                    .run(guildId, 'quote_auto_last', String(now));
            }
        } catch (e) {
            log('WARN', `[quote] autoQuote error: ${e.message}`);
        }
    }, 30 * 60 * 1000); // Check every 30 min
}

// ==================== SLASH COMMAND DEFINITION ====================
const COMMAND_DEF = {
    name: 'quote',
    description: 'Random quote dari berbagai kategori (galau, motivasi, bucin, dll)',
    options: [
        {
            name: 'kategori',
            description: 'Pilih kategori quote',
            type: 3, // STRING
            required: false,
            choices: Object.entries(CATEGORIES).map(([key, cat]) => ({
                name: `${cat.emoji} ${cat.name}`,
                value: key,
            })),
        },
    ],
};

module.exports = {
    CATEGORIES,
    fetchQuote,
    buildQuoteEmbed,
    handleQuoteCommand,
    handleQuoteButton,
    isQuoteButton,
    startAutoQuote,
    COMMAND_DEF,
};
