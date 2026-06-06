// systems/ui.js — Shared UI helpers for consistent panel design across the bot.
//
// Goal: every panel should look and feel the same — same colors per category,
// same divider, same "back/home" buttons, same footer hint style, same progress
// bars. This module is PURELY presentational. It must never touch the database,
// customIds' routing meaning, or handler logic.
//
// Usage:
//   const ui = require('./ui');
//   const embed = new EmbedBuilder()
//       .setColor(ui.COLORS.economy)
//       .setTitle(ui.title('💰', 'ECONOMY', username))
//       .setDescription(ui.statBlock([...]) + ui.menuList([...]))
//       .setFooter({ text: ui.footer('Tips...') });

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ==================== COLORS (per feature category) ====================
// Consistent palette so users learn "blue = fishing, green = farming", etc.
const COLORS = {
    economy:     '#F1C40F', // gold
    casino:      '#9B59B6', // purple
    fishing:     '#3498DB', // blue
    farming:     '#2ECC71', // green
    pet:         '#E67E22', // orange
    battle:      '#E74C3C', // red
    profile:     '#5865F2', // blurple
    level:       '#5865F2', // blurple
    quest:       '#1ABC9C', // teal
    leaderboard: '#FFD700', // bright gold
    trade:       '#16A085', // dark teal
    market:      '#27AE60', // market green
    season:      '#E67E22', // seasonal orange
    admin:       '#34495E', // slate
    info:        '#5865F2', // neutral blurple
    success:     '#2ECC71',
    warning:     '#F39C12',
    danger:      '#E74C3C',
    neutral:     '#95A5A6',
};

// ==================== DIVIDERS ====================
// One canonical divider length used everywhere (was inconsistent: 18-24 chars).
const DIVIDER = '━━━━━━━━━━━━━━━━━━━━';        // heavy, for embed bodies
const DIVIDER_THIN = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄'; // light, for sub-sections

// ==================== TITLE ====================
// Standard title format: "<emoji> NAME — <suffix>" (suffix optional, e.g. username).
function title(emoji, name, suffix) {
    const base = `${emoji} ${name}`;
    return suffix ? `${base} — ${suffix}` : base;
}

// ==================== FOOTER ====================
// Consistent footer hint. Pass a short tip; we prefix a lightbulb for uniformity.
function footer(tip) {
    if (!tip) return 'idcommunity Bot';
    return `💡 ${tip}`;
}

// ==================== STAT BLOCK ====================
// Renders a header stat block wrapped in dividers:
//   ━━━━━━━━━
//   line 1
//   line 2
//   ━━━━━━━━━
// `lines` is an array of pre-formatted strings.
function statBlock(lines) {
    const body = (Array.isArray(lines) ? lines : [lines]).join('\n');
    return `${DIVIDER}\n${body}\n${DIVIDER}\n`;
}

// ==================== MENU LIST ====================
// Renders a quoted bullet list of options. Each item: { emoji, label, desc }.
//   > 💳 **Balance** — Cek saldo detail
function menuList(items) {
    return items.map(it => {
        const label = it.label ? `**${it.label}**` : '';
        const dash = it.desc ? ` — ${it.desc}` : '';
        return `> ${it.emoji ? it.emoji + ' ' : ''}${label}${dash}`;
    }).join('\n');
}

// ==================== PROGRESS BAR ====================
// Consistent 10-segment bar. style: 'block' (█/░) or 'arrow' (▰/▱).
function progressBar(value, max, length = 10, style = 'block') {
    const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
    const filled = Math.round(ratio * length);
    const chars = style === 'arrow' ? ['▰', '▱'] : ['█', '░'];
    return chars[0].repeat(filled) + chars[1].repeat(Math.max(0, length - filled));
}

// Percentage helper paired with a bar: "`██████░░░░` 60%"
function progressLine(value, max, length = 10, style = 'block') {
    const pct = max > 0 ? Math.min(100, Math.floor((value / max) * 100)) : 0;
    return `\`${progressBar(value, max, length, style)}\` **${pct}%**`;
}

// ==================== MEDAL ====================
// Rank medal for leaderboards (0-indexed): 🥇🥈🥉 then "#4".
function medal(index) {
    return ['🥇', '🥈', '🥉'][index] || `\`#${index + 1}\``;
}

// ==================== BUTTONS ====================
// Standard "Back" button. customId is caller-supplied so routing is preserved.
function backButton(customId, label = '🔙 Kembali') {
    return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Secondary);
}

// A single-button row containing the Back button (very common pattern).
function backRow(customId, label = '🔙 Kembali') {
    return new ActionRowBuilder().addComponents(backButton(customId, label));
}

// Generic styled button builder shorthand.
//   ui.button('id', '🎣 Cast', 'primary', { disabled: false })
const STYLE_MAP = {
    primary: ButtonStyle.Primary,
    secondary: ButtonStyle.Secondary,
    success: ButtonStyle.Success,
    danger: ButtonStyle.Danger,
};
function button(customId, label, style = 'secondary', opts = {}) {
    const b = new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(STYLE_MAP[style] || ButtonStyle.Secondary);
    if (opts.disabled) b.setDisabled(true);
    if (opts.emoji) b.setEmoji(opts.emoji);
    return b;
}

// ==================== MONEY FORMATTING ====================
// Consistent currency rendering: "🪙 1.234".
function money(n) {
    return `🪙 ${Number(n || 0).toLocaleString('id-ID')}`;
}

// Compact number for tight spaces: 1.2K / 3.4M.
function shortNum(n) {
    n = Number(n || 0);
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
}

module.exports = {
    COLORS,
    DIVIDER,
    DIVIDER_THIN,
    title,
    footer,
    statBlock,
    menuList,
    progressBar,
    progressLine,
    medal,
    backButton,
    backRow,
    button,
    money,
    shortNum,
};
