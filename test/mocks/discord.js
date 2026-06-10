// test/mocks/discord.js — lightweight stand-in for discord.js builders used in tests.
// Importantly, setEmoji() validates like @sapphire/shapeshift (one unicode grapheme
// or <:name:id>), so tests catch the "two-emoji" class of bug.
function validateEmoji(v) {
  if (typeof v !== 'string' || v.length === 0) throw new Error('UnionValidator: invalid emoji (empty)');
  if (/^<a?:\w+:\d+>$/.test(v)) return; // custom emoji format
  if (/^\d{15,22}$/.test(v)) return; // custom emoji ID only (for .setEmoji)
  let n;
  try { n = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(v)].length; }
  catch (e) { n = Array.from(v).length; }
  if (n !== 1) throw new Error('Received one or more errors'); // mimic shapeshift UnionValidator
}
class EmbedBuilder {
  constructor(){ this.data = { fields: [] }; }
  setTitle(t){ this.data.title = t; return this; }
  setDescription(d){ this.data.description = d; return this; }
  setColor(c){ this.data.color = c; return this; }
  setFooter(f){ this.data.footer = f; return this; }
  setThumbnail(t){ this.data.thumbnail = t; return this; }
  setTimestamp(){ this.data.ts = Date.now(); return this; }
  setImage(i){ this.data.image = i; return this; }
  setAuthor(a){ this.data.author = a; return this; }
  addFields(...f){ this.data.fields.push(...f.flat()); return this; }
}
class ActionRowBuilder { constructor(){ this.components = []; } addComponents(...c){ this.components.push(...c.flat()); return this; } }
class ButtonBuilder {
  constructor(){ this.data = {}; }
  setCustomId(id){ this.data.custom_id = id; return this; }
  setLabel(l){ this.data.label = l; return this; }
  setStyle(s){ this.data.style = s; return this; }
  setDisabled(d){ this.data.disabled = d; return this; }
  setEmoji(e){ validateEmoji(e); this.data.emoji = e; return this; }
  setURL(u){ this.data.url = u; return this; }
}
class StringSelectMenuBuilder {
  constructor(){ this.data = {}; this.options = []; }
  setCustomId(id){ this.data.custom_id = id; return this; }
  setPlaceholder(p){ this.data.placeholder = p; return this; }
  setMinValues(n){ this.data.min = n; return this; }
  setMaxValues(n){ this.data.max = n; return this; }
  addOptions(...o){ this.options.push(...o.flat()); return this; }
}
class UserSelectMenuBuilder {
  constructor(){ this.data = {}; }
  setCustomId(id){ this.data.custom_id = id; return this; }
  setPlaceholder(p){ this.data.placeholder = p; return this; }
  setMinValues(n){ this.data.min = n; return this; }
  setMaxValues(n){ this.data.max = n; return this; }
}
class RoleSelectMenuBuilder {
  constructor(){ this.data = {}; }
  setCustomId(id){ this.data.custom_id = id; return this; }
  setPlaceholder(p){ this.data.placeholder = p; return this; }
  setMinValues(n){ this.data.min = n; return this; }
  setMaxValues(n){ this.data.max = n; return this; }
}
class ChannelSelectMenuBuilder {
  constructor(){ this.data = {}; }
  setCustomId(id){ this.data.custom_id = id; return this; }
  setPlaceholder(p){ this.data.placeholder = p; return this; }
  setChannelTypes(...t){ this.data.channel_types = t.flat(); return this; }
  setMinValues(n){ this.data.min = n; return this; }
  setMaxValues(n){ this.data.max = n; return this; }
}
class StringSelectMenuOptionBuilder {
  constructor(){ this.data = {}; }
  setLabel(l){ this.data.label = l; return this; }
  setValue(v){ this.data.value = v; return this; }
  setDescription(d){ this.data.description = d; return this; }
  setEmoji(e){ validateEmoji(e); this.data.emoji = e; return this; }
  setDefault(b){ this.data.default = b; return this; }
}
class ModalBuilder { constructor(){ this.data={}; } setCustomId(i){this.data.custom_id=i;return this;} setTitle(t){this.data.title=t;return this;} addComponents(){return this;} }
class TextInputBuilder { constructor(){ this.data={}; } setCustomId(i){this.data.custom_id=i;return this;} setLabel(){return this;} setStyle(){return this;} setPlaceholder(){return this;} setRequired(){return this;} setValue(){return this;} setMaxLength(){return this;} setMinLength(){return this;} }
const ButtonStyle = { Primary:1, Secondary:2, Success:3, Danger:4, Link:5 };
const TextInputStyle = { Short:1, Paragraph:2 };
const ChannelType = { GuildText:0, GuildVoice:2, GuildCategory:4 };
const PermissionsBitField = { Flags: new Proxy({}, { get: () => 1n }) };
class Collection extends Map {}
class AttachmentBuilder { constructor(data, opts){ this.attachment = data; this.name = opts && opts.name; } }
module.exports = {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  StringSelectMenuBuilder, UserSelectMenuBuilder, StringSelectMenuOptionBuilder,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonStyle, ChannelType, PermissionsBitField, Collection, AttachmentBuilder,
};
