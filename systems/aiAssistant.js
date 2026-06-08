// systems/aiAssistant.js — AI Help Assistant (OpenAI-compatible API)
//
// A support chatbot that ONLY answers questions about THIS bot's features.
// Its knowledge is learned from the repo's own documentation (GUIDE.md,
// GUIDE-PET.md) + the live slash-command list — i.e. the same files that live
// on GitHub, read locally so it always matches the deployed code.
//
// Config (.env):
//   AI_API_KEY    -> your API key (required)
//   AI_BASE_URL   -> OpenAI-compatible base url (default https://ai.sumopod.com/v1)
//   AI_MODEL      -> model id (default gpt-4o-mini)
//   AI_MAX_TOKENS -> max answer tokens (default 500)
//
// Per-guild config (ai_settings table): enable + dedicated channel.

const fs = require('fs');
const path = require('path');
const { db } = require('../database');
let log;
try { ({ log } = require('./logger')); } catch (_) { log = (lvl, msg) => console.log(`[${lvl}] ${msg}`); }

// ==================== DATABASE ====================
db.exec(`CREATE TABLE IF NOT EXISTS ai_settings (guildId TEXT, key TEXT, value TEXT, PRIMARY KEY(guildId, key))`);

function getAiSetting(guildId, key, def = null) {
    const row = db.prepare('SELECT value FROM ai_settings WHERE guildId = ? AND key = ?').get(guildId, key);
    return row ? row.value : def;
}
function setAiSetting(guildId, key, value) {
    db.prepare('INSERT OR REPLACE INTO ai_settings (guildId, key, value) VALUES (?, ?, ?)').run(guildId, key, String(value));
}

// ==================== CONFIG ====================
function getConfig() {
    return {
        apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
        baseURL: (process.env.AI_BASE_URL || 'https://ai.sumopod.com/v1').replace(/\/$/, ''),
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        maxTokens: parseInt(process.env.AI_MAX_TOKENS || '500', 10),
    };
}
function isConfigured() { return !!getConfig().apiKey; }

// ==================== KNOWLEDGE (learned from the repo docs) ====================
const KNOWLEDGE_CAP = 16000; // keep token usage sane
let _knowledge = null;

function readDoc(rel) {
    try { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
    catch (_) { return ''; }
}

function readCommandList() {
    // Parse the slash-command registry so the AI always knows the real commands.
    const src = readDoc('commands/_register.js');
    if (!src) return '';
    const cmds = [];
    const re = /setName\(['"]([\w-]+)['"]\)\s*\.setDescription\(['"]([^'"]+)['"]\)/g;
    let m;
    while ((m = re.exec(src)) !== null) cmds.push(`- /${m[1]} — ${m[2]}`);
    return cmds.length ? `== DAFTAR SLASH COMMAND ==\n${cmds.join('\n')}\n` : '';
}

function buildKnowledge(force = false) {
    if (_knowledge && !force) return _knowledge;
    const guide = readDoc('GUIDE.md');
    const pet = readDoc('GUIDE-PET.md');
    const readme = readDoc('README.md');
    let combined = '';
    if (guide) combined += `== PANDUAN UMUM (GUIDE.md) ==\n${guide}\n\n`;
    if (pet) combined += `== PANDUAN PET (GUIDE-PET.md) ==\n${pet}\n\n`;
    if (readme) combined += `== README ==\n${readme.slice(0, 2000)}\n\n`;
    combined += readCommandList();
    if (combined.length > KNOWLEDGE_CAP) combined = combined.slice(0, KNOWLEDGE_CAP) + '\n...(dokumentasi dipotong)';
    _knowledge = combined.trim() || 'Dokumentasi tidak tersedia.';
    return _knowledge;
}
function refreshKnowledge() { return buildKnowledge(true); }

function buildSystemPrompt() {
    return [
        'Kamu adalah "ID Bot Assistant" — asisten bantuan KHUSUS untuk sebuah bot Discord.',
        '',
        'ATURAN WAJIB:',
        '1. Jawab HANYA pertanyaan seputar FITUR & CARA PAKAI bot ini, berdasarkan PENGETAHUAN di bawah.',
        '2. Jika pertanyaan di luar topik bot (mis. coding umum, kehidupan, berita), TOLAK dengan sopan: "Maaf, aku cuma bisa bantu soal fitur bot ini ya 🙂".',
        '3. JANGAN mengarang fitur atau command yang tidak ada di pengetahuan. Kalau tidak tahu, katakan tidak tahu dan sarankan /help.',
        '4. Jawab dalam Bahasa Indonesia, singkat, ramah, pakai emoji secukupnya.',
        '5. Kalau relevan, sebutkan slash command yang tepat (mis. `/fishing`, `/daily`).',
        '',
        '== PENGETAHUAN (dari dokumentasi repo bot) ==',
        buildKnowledge(),
    ].join('\n');
}

// ==================== ASK ====================
async function askAI(question, { history = [] } = {}) {
    const cfg = getConfig();
    if (!cfg.apiKey) return { error: 'API key AI belum diset. Tambahkan `AI_API_KEY` di file .env.' };
    if (!question || !question.trim()) return { error: 'Pertanyaannya kosong.' };

    const messages = [
        { role: 'system', content: buildSystemPrompt() },
        ...history,
        { role: 'user', content: question.trim().slice(0, 1000) },
    ];

    try {
        const res = await fetch(`${cfg.baseURL}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
            body: JSON.stringify({ model: cfg.model, messages, max_tokens: cfg.maxTokens, temperature: 0.4 }),
        });
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            return { error: `AI API error ${res.status}: ${txt.slice(0, 200)}` };
        }
        const data = await res.json();
        const answer = data.choices?.[0]?.message?.content?.trim();
        if (!answer) return { error: 'AI tidak memberikan jawaban.' };
        return { success: true, answer };
    } catch (e) {
        return { error: `Gagal terhubung ke AI: ${e.message}` };
    }
}

// ==================== PASSIVE TRIGGER (mention / dedicated channel) ====================
const _cooldown = new Map(); // userId -> timestamp
const COOLDOWN_MS = 8000;

// Returns true if the message was handled as an AI query (caller should stop).
async function maybeHandleAiMessage(message) {
    try {
        const guildId = message.guild.id;
        if (getAiSetting(guildId, 'ai_enabled', '0') !== '1') return false;

        const aiChannel = getAiSetting(guildId, 'ai_channel', '');
        const botUser = message.client.user;
        const mentioned = botUser && message.mentions.has(botUser.id);
        const inAiChannel = aiChannel && message.channel.id === aiChannel;
        if (!mentioned && !inAiChannel) return false;

        // Extract the question (strip the bot mention if present).
        let question = message.content || '';
        if (botUser) question = question.replace(new RegExp(`<@!?${botUser.id}>`, 'g'), '').trim();
        if (!question) {
            await message.reply({ content: '👋 Hai! Tanyakan apa saja tentang fitur bot ini, misalnya: *"Cara pakai fishing?"* atau *"Gimana cara daily?"*' }).catch(() => {});
            return true;
        }

        // Per-user cooldown.
        const now = Date.now();
        const last = _cooldown.get(message.author.id) || 0;
        if (now - last < COOLDOWN_MS) {
            await message.react('⏳').catch(() => {});
            return true;
        }
        _cooldown.set(message.author.id, now);

        await message.channel.sendTyping().catch(() => {});
        const result = await askAI(question);
        if (result.error) {
            await message.reply({ content: `⚠️ ${result.error}` }).catch(() => {});
            return true;
        }
        for (const chunk of chunkText(result.answer, 1900)) {
            await message.reply({ content: chunk, allowedMentions: { repliedUser: true } }).catch(() => {});
        }
        return true;
    } catch (e) {
        log('WARN', `[aiAssistant] maybeHandleAiMessage error: ${e.message}`);
        return false;
    }
}

function chunkText(text, size = 1900) {
    const out = [];
    for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
    return out.length ? out : [''];
}

module.exports = {
    getAiSetting, setAiSetting, getConfig, isConfigured,
    buildKnowledge, refreshKnowledge, buildSystemPrompt,
    askAI, maybeHandleAiMessage, chunkText,
};
