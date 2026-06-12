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
// Anti-spam: last chat message per user => `${guildId}_${userId}` => { content, ts }
const lastChatMessages = new Map();
// Pending auction sell selection between the select-menu pick and the modal.
const pendingAuctionSell = new Map(); // `${guildId}_${userId}` => { type, id }
// Ambient Togel promo: per-guild active-message counter + per-guild cooldown ts.
const togelPromoCounters = new Map();  // guildId => count of non-spam messages since last drop
const togelPromoCooldown = new Map();  // guildId => epoch ms until which no promo may drop

// Daily reminder tracking: tracks users who have received a daily reminder today.
// Keyed by `${userId}_${today}`.
const dailyRemindedUsers = new Set();

module.exports = { fishCooldowns, chatCooldowns, reactionCooldowns, voiceSessions, activeCoinflips, slashCooldowns, activeMiniEvents, guildMessageCounters, activeFishEvents, guildFishEventCounters, activeBossParties, pendingMarketSell, pendingTradeGive, lastChatMessages, pendingAuctionSell, togelPromoCounters, togelPromoCooldown, dailyRemindedUsers };

