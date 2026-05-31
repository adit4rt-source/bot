const { Collection } = require('discord.js');
const fishCooldowns = new Map();
const chatCooldowns = new Set();
const reactionCooldowns = new Set();
const voiceSessions = new Map();
const activeCoinflips = new Set();
const slashCooldowns = new Collection();
const activeMiniEvents = new Map();
const guildMessageCounters = new Map();
const activeFishEvents = new Map();
const guildFishEventCounters = new Map();
const activeBossParties = new Map();
// Short-lived selections between a select-menu pick and the follow-up modal.
// Keyed by `${guildId}_${userId}`.
const pendingMarketSell = new Map(); // => { itemType, itemId, itemName }
const pendingTradeGive = new Map();  // => { type, id, display }
module.exports = { fishCooldowns, chatCooldowns, reactionCooldowns, voiceSessions, activeCoinflips, slashCooldowns, activeMiniEvents, guildMessageCounters, activeFishEvents, guildFishEventCounters, activeBossParties, pendingMarketSell, pendingTradeGive };
