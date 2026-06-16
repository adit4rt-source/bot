// systems/aiAssistant.js — AI Help Assistant (OpenAI-compatible API)
//
// A support chatbot that ONLY answers questions about THIS bot's features.
// Its knowledge is learned from the whole repo — the docs (GUIDE.md,
// GUIDE-PET.md, ...), every feature module, the live slash-command list, and
// the in-game data catalogs (pets, fish, items, ...). To keep answers detailed
// without huge token cost, we index everything into sections and send only the
// slices most relevant to each question (lightweight retrieval).
//
// Config (.env):
//   AI_API_KEY      -> your API key (required)
//   AI_BASE_URL     -> OpenAI-compatible base url (default https://ai.sumopod.com/v1)
//   AI_MODEL        -> model id (default gpt-4o-mini)
//   AI_MAX_TOKENS   -> max answer tokens (default 800)
//   AI_CONTEXT_CHARS-> max knowledge chars per request (default 22000)
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
        model: process.env.AI_MODEL || 'deepseek-v4-flash',
        maxTokens: parseInt(process.env.AI_MAX_TOKENS || '800', 10),
        contextChars: parseInt(process.env.AI_CONTEXT_CHARS || '22000', 10),
    };
}
function isConfigured() { return !!getConfig().apiKey; }

// ==================== KNOWLEDGE (learned from the whole repo) ====================
let _sections = null;   // [{ title, body }]
let _commandList = null;
let _moduleIndex = null;

function readDoc(rel) {
    try { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
    catch (_) { return ''; }
}
function listFiles(dir) {
    try { return fs.readdirSync(path.join(__dirname, '..', dir)); }
    catch (_) { return []; }
}

// Parse the slash-command registry so the AI always knows the real commands.
function readCommandList() {
    if (_commandList) return _commandList;
    const src = readDoc('commands/_register.js');
    const cmds = [];
    if (src) {
        const re = /setName\(['"]([\w-]+)['"]\)\s*\.setDescription\(['"]([^'"]+)['"]\)/g;
        let m;
        while ((m = re.exec(src)) !== null) cmds.push(`- /${m[1]} — ${m[2]}`);
    }
    _commandList = cmds.join('\n');
    return _commandList;
}

// One-line description of every feature module (from each file's header comment).
function buildModuleIndex() {
    if (_moduleIndex) return _moduleIndex;
    const lines = [];
    for (const f of listFiles('systems').filter(x => x.endsWith('.js'))) {
        const head = readDoc(`systems/${f}`).split('\n').slice(0, 3).join(' ');
        const m = head.match(/\/\/\s*systems\/[\w.]+\s*[—-]\s*(.+)/);
        const desc = m ? m[1].trim().replace(/\s+/g, ' ').slice(0, 110) : '';
        if (desc) lines.push(`- ${f.replace('.js', '')}: ${desc}`);
    }
    _moduleIndex = lines.join('\n');
    return _moduleIndex;
}

// Split a markdown doc into sections by headings.
function splitMarkdown(text, source) {
    const sections = [];
    let cur = { title: source, body: [] };
    for (const line of text.split('\n')) {
        const h = line.match(/^#{1,4}\s+(.*)/);
        if (h) {
            if (cur.body.join('').trim()) sections.push({ title: `${source} › ${cur.title}`, body: cur.body.join('\n').trim() });
            cur = { title: h[1].trim(), body: [] };
        } else cur.body.push(line);
    }
    if (cur.body.join('').trim()) sections.push({ title: `${source} › ${cur.title}`, body: cur.body.join('\n').trim() });
    return sections;
}

// Catalogs of in-game content (pets, fish, items, crops, ...) from data/*.js.
function buildDataCatalogs() {
    const out = [];
    for (const f of listFiles('data').filter(x => x.endsWith('.js'))) {
        let mod;
        try { mod = require(path.join(__dirname, '..', 'data', f)); } catch (_) { continue; }
        for (const [key, val] of Object.entries(mod)) {
            if (Array.isArray(val) && val.length) {
                const names = val.map(x => x && (x.name || x.id)).filter(Boolean);
                if (names.length) out.push({ title: `Katalog data ${f.replace('.js', '')} — ${key}`, body: `(${names.length} item) ${names.join(', ')}` });
            }
        }
    }
    return out;
}

function buildSections(force = false) {
    if (_sections && !force) return _sections;
    const secs = [];
    for (const doc of ['GUIDE.md', 'GUIDE-PET.md', 'POSTMORTEM-MINING.md', 'README.md']) {
        const t = readDoc(doc);
        if (t) secs.push(...splitMarkdown(t, doc));
    }
    secs.push(...buildDataCatalogs());
    _sections = secs.filter(s => s.body && s.body.length > 5);
    return _sections;
}

// Full knowledge dump (used by tests + the "refresh" preview).
function buildKnowledge(force = false) {
    const base = `== DAFTAR SLASH COMMAND ==\n${readCommandList()}\n\n== INDEKS MODUL FITUR ==\n${buildModuleIndex()}\n`;
    const body = buildSections(force).map(s => `## ${s.title}\n${s.body}`).join('\n\n');
    return `${base}\n${body}`.trim() || 'Dokumentasi tidak tersedia.';
}

function refreshKnowledge() {
    _sections = null; _commandList = null; _moduleIndex = null;
    return buildKnowledge(true);
}

// Lightweight keyword retrieval: pin the command list + module index, then add
// the doc/catalog sections most relevant to the question until the budget fills.
function retrieveContext(question, budget) {
    budget = budget || getConfig().contextChars;
    const base = `== DAFTAR SLASH COMMAND ==\n${readCommandList()}\n\n== INDEKS MODUL FITUR ==\n${buildModuleIndex()}\n`;
    const secs = buildSections();
    const words = [...new Set((String(question).toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2))];

    const scored = secs.map(s => {
        const title = s.title.toLowerCase();
        const hay = (s.title + ' ' + s.body).toLowerCase();
        let score = 0;
        for (const w of words) {
            if (title.includes(w)) score += 4;
            const c = hay.split(w).length - 1;
            score += Math.min(c, 6);
        }
        return { s, score };
    }).sort((a, b) => b.score - a.score);

    let ctx = base;
    for (const { s, score } of scored) {
        if (score <= 0) break;
        const block = `\n## ${s.title}\n${s.body}\n`;
        if (ctx.length + block.length > budget) continue;
        ctx += block;
    }
    // Fallback: nothing matched -> include the first few doc sections as overview.
    if (ctx.length === base.length) {
        for (const s of secs.slice(0, 5)) {
            const block = `\n## ${s.title}\n${s.body}\n`;
            if (ctx.length + block.length > budget) break;
            ctx += block;
        }
    }
    return ctx;
}

function buildSystemPrompt(question = '') {
    return [
        'Kamu adalah "ID Bot Assistant" — asisten bantuan resmi untuk sebuah bot Discord Indonesia.',
        '',
        'TUGAS: Jelaskan fitur & cara pakai bot ini selengkap dan sejelas mungkin, berdasarkan PENGETAHUAN di bawah (diambil dari kode & dokumentasi repo bot).',
        '',
        'CARA MENJAWAB (biar pintar & membantu):',
        '- Jawab Bahasa Indonesia yang santai tapi jelas.',
        '- Beri penjelasan LENGKAP & runtut: kalau soal "cara", buat langkah bernomor; kalau soal daftar, pakai poin-poin.',
        '- Sebutkan slash command / tombol / panel yang tepat (mis. `/fishing`, `/daily`, tombol di panel).',
        '- Beri contoh konkret bila membantu. Boleh rangkum info dari beberapa bagian pengetahuan.',
        '- Kalau pertanyaan ambigu, jawab kemungkinan paling relevan + tawarkan detail lanjutan.',
        '',
        'ATURAN:',
        '- Fokus HANYA pada bot ini. Kalau pertanyaan jelas di luar topik bot (coding umum, kehidupan, berita), tolak sopan: "Maaf, aku cuma bisa bantu soal fitur bot ini ya 🙂".',
        '- JANGAN mengarang command/fitur yang tidak ada di pengetahuan. Kalau detailnya tak ada, katakan dengan jujur dan arahkan ke `/help` atau `/menu`.',
        '',
        '== PENGETAHUAN (relevan dengan pertanyaan) ==',
        retrieveContext(question),
    ].join('\n');
}

// ==================== ASK ====================
async function askAI(question, { history = [] } = {}) {
    const cfg = getConfig();
    if (!cfg.apiKey) return { error: 'API key AI belum diset. Tambahkan `AI_API_KEY` di file .env.' };
    if (!question || !question.trim()) return { error: 'Pertanyaannya kosong.' };

    const messages = [
        { role: 'system', content: buildSystemPrompt(question) },
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

// Token-saving filter for the dedicated AI channel.
// In that channel people also chit-chat; we don't want to burn API tokens on
// every message. So (when NOT directly mentioned) we only answer messages that
// read like a question about THIS bot. Direct mentions bypass this entirely.
const _QUESTION_WORDS = [
    'apa', 'apakah', 'gimana', 'gmn', 'gmna', 'bagaimana', 'cara', 'caranya',
    'kenapa', 'mengapa', 'kapan', 'dimana', 'di mana', 'berapa', 'siapa',
    'bisakah', 'bolehkah', 'jelasin', 'jelaskan', 'maksud', 'fungsi', 'kegunaan',
];
const _BOT_TOPIC_WORDS = [
    'bot', 'command', 'commands', 'perintah', 'slash', 'fitur', 'menu', 'help',
    'fishing', 'mancing', 'ikan', 'pancing', 'farm', 'kebun', 'tanam', 'panen', 'farming',
    'pet', 'hewan', 'peliharaan', 'daily', 'harian', 'balance', 'saldo', 'money', 'koin', 'duit',
    'casino', 'judi', 'blackjack', 'slot', 'roulette', 'quest', 'misi', 'achievement', 'pencapaian',
    'level', 'xp', 'exp', 'shop', 'toko', 'beli', 'jual', 'inventory', 'inventaris', 'tas',
    'expedition', 'ekspedisi', 'dungeon', 'giveaway', 'event', 'leaderboard', 'rank', 'ranking',
    'profile', 'profil', 'marry', 'nikah', 'clan', 'guild', 'awakening', 'boss', 'combo', 'streak',
    'livestock', 'ternak', 'crafting', 'craft', 'trade', 'trading', 'transfer', 'bank', 'voucher',
];

// Returns true if a channel message (no direct mention) is worth answering.
function shouldAnswerInChannel(text) {
    const t = String(text || '').trim().toLowerCase();
    if (t.length < 2) return false;

    const words = t.match(/[a-z0-9]+/g) || [];
    const wordSet = new Set(words);

    // Explicit help request or a slash-command reference is always relevant.
    if (['help', 'bantu', 'bantuin', 'tolong', 'tanya', 'nanya'].some(w => wordSet.has(w))) return true;
    if (/(^|\s)\/[a-z]/.test(t)) return true;

    const hasQuestionMark = t.includes('?');
    const hasQuestionWord = _QUESTION_WORDS.some(w => (w.includes(' ') ? t.includes(w) : wordSet.has(w)));
    const hasBotTopic = _BOT_TOPIC_WORDS.some(w => wordSet.has(w));

    // Otherwise: must read like a question AND mention something about the bot.
    return (hasQuestionMark || hasQuestionWord) && hasBotTopic;
}

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

        // In the dedicated channel (without a direct mention) only spend tokens on
        // messages that actually look like a question about this bot. This keeps
        // casual channel chatter from hitting the API. Mentions always pass through.
        if (inAiChannel && !mentioned && !shouldAnswerInChannel(question)) return false;

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
    buildKnowledge, refreshKnowledge, buildSystemPrompt, retrieveContext, buildSections,
    askAI, maybeHandleAiMessage, chunkText, shouldAnswerInChannel,
};
