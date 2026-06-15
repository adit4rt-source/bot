// systems/selfRoles.js — Self-Roles (reaction roles, modern select-menu style)
//
// Members pick their own roles from a dropdown (like /shop), no emoji-reactions.
// Two pieces live here:
//   1. Data layer (CRUD) for self-role "menus" and their role "options".
//   2. The PUBLIC message: an embed + a StringSelectMenu, plus the handler that
//      grants/removes roles when a member uses the dropdown.
// The admin-facing management UI lives in systems/selfRolePanel.js.
//
// These tables are intentionally guild-scoped (NOT in the global-mode table set):
// roles only exist within a single guild, so a menu always belongs to one guild.

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { db } = require('../database');
const ui = require('./ui');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

// ==================== DATABASE SETUP ====================
db.exec(`
  CREATE TABLE IF NOT EXISTS selfrole_menus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    channelId TEXT,
    messageId TEXT,
    title TEXT,
    description TEXT,
    type TEXT DEFAULT 'multi',
    color TEXT,
    createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS selfrole_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menuId INTEGER,
    roleId TEXT,
    label TEXT,
    emoji TEXT,
    description TEXT,
    createdAt INTEGER
  );
`);
// Migration: per-menu cap on how many roles a member may hold from a "multi" menu
// (0 = unlimited). Wrapped in try/catch so it's a no-op once the column exists.
try { db.exec('ALTER TABLE selfrole_menus ADD COLUMN maxRoles INTEGER DEFAULT 0'); } catch (_) { /* already exists */ }

// ==================== EMOJI VALIDATION ====================
// Discord rejects multi-grapheme strings as emoji. Accept a single grapheme OR a
// custom emoji token <:name:id> / <a:name:id>. Returns the cleaned emoji or null.
function normalizeEmoji(raw) {
    if (!raw) return null;
    const v = String(raw).trim();
    if (!v) return null;
    if (/^<a?:\w+:\d+>$/.test(v)) return v; // custom emoji
    let n;
    try { n = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(v)].length; }
    catch (_) { n = Array.from(v).length; }
    return n === 1 ? v : null;
}

// ==================== CRUD: MENUS ====================
function createMenu(guildId, { title, description, type = 'multi', color = ui.COLORS.info, maxRoles = 0 }) {
    const res = db.prepare(
        'INSERT INTO selfrole_menus (guildId, title, description, type, color, maxRoles, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(guildId, title, description || '', type === 'unique' ? 'unique' : 'multi', color, Number(maxRoles) || 0, Date.now());
    return Number(res.lastInsertRowid);
}

function getMenu(guildId, menuId) {
    return db.prepare('SELECT * FROM selfrole_menus WHERE guildId = ? AND id = ?').get(guildId, menuId);
}

function getMenus(guildId) {
    return db.prepare('SELECT * FROM selfrole_menus WHERE guildId = ? ORDER BY id ASC').all(guildId);
}

function updateMenu(guildId, menuId, fields) {
    const allowed = ['title', 'description', 'type', 'color', 'channelId', 'messageId', 'maxRoles'];
    const sets = [], vals = [];
    for (const [k, v] of Object.entries(fields)) {
        if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
    }
    if (!sets.length) return;
    vals.push(guildId, menuId);
    db.prepare(`UPDATE selfrole_menus SET ${sets.join(', ')} WHERE guildId = ? AND id = ?`).run(...vals);
}

function deleteMenu(guildId, menuId) {
    db.prepare('DELETE FROM selfrole_options WHERE menuId = ?').run(menuId);
    db.prepare('DELETE FROM selfrole_menus WHERE guildId = ? AND id = ?').run(guildId, menuId);
}

// ==================== CRUD: OPTIONS ====================
function getOptions(menuId) {
    return db.prepare('SELECT * FROM selfrole_options WHERE menuId = ? ORDER BY id ASC').all(menuId);
}

function addOption(menuId, { roleId, label, emoji, description }) {
    // Avoid duplicate role within the same menu.
    const existing = db.prepare('SELECT id FROM selfrole_options WHERE menuId = ? AND roleId = ?').get(menuId, roleId);
    if (existing) return { ok: false, reason: 'duplicate' };
    if (getOptions(menuId).length >= 25) return { ok: false, reason: 'full' }; // Discord select limit
    db.prepare(
        'INSERT INTO selfrole_options (menuId, roleId, label, emoji, description, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(menuId, roleId, label || null, normalizeEmoji(emoji), description || null, Date.now());
    return { ok: true };
}

function removeOption(menuId, roleId) {
    db.prepare('DELETE FROM selfrole_options WHERE menuId = ? AND roleId = ?').run(menuId, roleId);
}

// ==================== PUBLIC MESSAGE BUILDER ====================
// Returns { embeds, components } for the member-facing self-role message.
function buildPublicMessage(menu, options, guild) {
    const isUnique = menu.type === 'unique';
    const limit = (!isUnique && menu.maxRoles > 0) ? Math.min(menu.maxRoles, options.length || 1) : null;
    const lines = options.map(o => {
        const role = guild?.roles?.cache?.get(o.roleId);
        const em = o.emoji ? `${o.emoji}` : '🔹';
        const desc = o.description ? ` — *${o.description}*` : '';
        const count = (role && role.members && role.members.size > 0) ? ` \`👥 ${role.members.size}\`` : '';
        return `${em} ➜ <@&${o.roleId}>${desc}${count}`;
    });

    const frameTop = '┏━━━━━━━━━ ✦ ━━━━━━━━━┓';
    const frameBot = '┗━━━━━━━━━ ✦ ━━━━━━━━━┛';

    let howto;
    if (!options.length) howto = '*Belum ada role di menu ini.*';
    else if (isUnique) howto = '🔘 Pilih **1 role** dari menu di bawah. Mau ganti? Tinggal pilih yang lain.';
    else if (limit) howto = `✅ Pilih sampai **${limit} role** dari menu di bawah. Mau lepas? Pilih lagi role yang sama.`;
    else howto = '✅ Pilih role sebanyak yang kamu mau. Mau lepas? Pilih lagi role yang sama.';

    const embed = new EmbedBuilder()
        .setColor(menu.color || ui.COLORS.info)
        .setTitle(menu.title || '🎭 Self Roles')
        .setThumbnail(guild?.iconURL?.({ size: 128 }) || null)
        .setDescription(
            (menu.description ? `${menu.description}\n\n` : '') +
            (options.length
                ? `${frameTop}\n${lines.join('\n')}\n${frameBot}\n\n${howto}`
                : howto)
        )
        .setFooter({ text: ui.footer(options.length ? `🎭 ${options.length} role tersedia • pilih di menu bawah` : 'Self Roles') });

    const components = [];
    if (options.length) {
        const select = new StringSelectMenuBuilder()
            .setCustomId(`srpick_${menu.id}`)
            .setPlaceholder(isUnique ? '🔘 Pilih satu role...' : '🎭 Pilih role kamu...')
            .setMinValues(0)
            .setMaxValues(isUnique ? 1 : (limit || options.length));
        for (const o of options) {
            const role = guild?.roles?.cache?.get(o.roleId);
            const opt = new StringSelectMenuOptionBuilder()
                .setLabel((o.label || (role ? role.name : 'Role')).slice(0, 100))
                .setValue(o.roleId);
            if (o.description) opt.setDescription(o.description.slice(0, 100));
            if (o.emoji) { try { opt.setEmoji(o.emoji); } catch (_) { /* skip invalid emoji */ } }
            select.addOptions(opt);
        }
        components.push(new ActionRowBuilder().addComponents(select));
    }
    return { embeds: [embed], components };
}

// ==================== PUBLIC PICK HANDLER ====================
// Any member can use this; it edits the invoking member's own roles only.
async function handleSelfRolePick(interaction) {
    const guildId = interaction.guild.id;
    const menuId = parseInt(interaction.customId.split('_')[1], 10);
    const menu = getMenu(guildId, menuId);
    if (!menu) {
        return interaction.reply({ content: '❌ Menu self-role ini sudah tidak tersedia.', ephemeral: true });
    }

    const options = getOptions(menuId);
    const menuRoleIds = options.map(o => o.roleId);
    const selected = Array.isArray(interaction.values) ? interaction.values : [];
    const member = interaction.member;

    const added = [], removed = [], failed = [];
    let limitHit = false;

    const tryAdd = async (roleId) => {
        if (member.roles.cache.has(roleId)) return;
        try { await member.roles.add(roleId, 'Self-role'); added.push(roleId); }
        catch (e) { failed.push(roleId); }
    };
    const tryRemove = async (roleId) => {
        if (!member.roles.cache.has(roleId)) return;
        try { await member.roles.remove(roleId, 'Self-role'); removed.push(roleId); }
        catch (e) { failed.push(roleId); }
    };

    if (menu.type === 'unique') {
        const pick = selected[0];
        // Selecting a role you already have toggles it off; otherwise switch to it.
        if (pick && member.roles.cache.has(pick)) {
            await tryRemove(pick);
        } else {
            for (const rid of menuRoleIds) {
                if (rid === pick) await tryAdd(rid);
                else await tryRemove(rid);
            }
        }
    } else {
        // Multi: toggle each selected role; leave unselected roles untouched.
        // Respect the optional per-menu cap (maxRoles, 0 = unlimited).
        const limit = menu.maxRoles && menu.maxRoles > 0 ? menu.maxRoles : null;
        let owned = menuRoleIds.filter(r => member.roles.cache.has(r)).length;
        for (const rid of selected) {
            if (member.roles.cache.has(rid)) {
                await tryRemove(rid);
                owned--;
            } else {
                if (limit && owned >= limit) { limitHit = true; continue; }
                await tryAdd(rid);
                owned++;
            }
        }
    }

    const fmt = (arr) => arr.map(r => `<@&${r}>`).join(', ');
    const parts = [];
    if (added.length) parts.push(`➕ Ditambahkan: ${fmt(added)}`);
    if (removed.length) parts.push(`➖ Dilepas: ${fmt(removed)}`);
    if (limitHit) parts.push(`⚠️ Maksimal **${menu.maxRoles} role** untuk menu ini — sebagian tidak ditambahkan.`);
    if (failed.length) parts.push(`⚠️ Gagal (cek posisi role bot / izin): ${fmt(failed)}`);
    if (!parts.length) parts.push('ℹ️ Tidak ada perubahan role.');

    return interaction.reply({ content: parts.join('\n'), ephemeral: true });
}

// ==================== LIVE MESSAGE REFRESH ====================
// After admins edit a menu, re-render the already-posted public message.
async function refreshPublicMessage(guild, menu) {
    if (!menu || !menu.channelId || !menu.messageId) return false;
    try {
        const channel = guild.channels.cache.get(menu.channelId) || await guild.channels.fetch(menu.channelId).catch(() => null);
        if (!channel) return false;
        const msg = await channel.messages.fetch(menu.messageId).catch(() => null);
        if (!msg) return false;
        const payload = buildPublicMessage(menu, getOptions(menu.id), guild);
        await msg.edit(payload);
        return true;
    } catch (e) {
        log('WARN', `[selfRoles] Gagal refresh pesan menu ${menu.id}: ${e.message}`);
        return false;
    }
}

// ==================== DETECTOR ====================
function isSelfRolePublicPick(customId) {
    return typeof customId === 'string' && customId.startsWith('srpick_');
}

module.exports = {
    normalizeEmoji,
    createMenu, getMenu, getMenus, updateMenu, deleteMenu,
    getOptions, addOption, removeOption,
    buildPublicMessage, handleSelfRolePick, refreshPublicMessage,
    isSelfRolePublicPick,
};
