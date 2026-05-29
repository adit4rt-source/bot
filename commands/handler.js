// commands/handler.js - Main command handler that delegates to the original bot.js logic
// This file re-exports all needed dependencies for command handling
// The actual command logic remains in bot.js's interaction handler for now
// Individual command files can be split out later as needed

const { db, getOrCreateUser, getConf, getSetting, getUserStat, incrementUserStat, getItemCount, addItem, removeItem } = require('../database');
const { ITEMS } = require('../data/items');
const { FARM_LEVELS, FARM_CROPS, FARM_RECIPES, FARM_FERTILIZERS } = require('../data/farming');
const { PET_DATA, PET_FOODS, PET_EGGS, PET_CLASSES, PET_ELEMENTS, PET_EVOLUTIONS, ELEMENT_ADVANTAGE, PET_SKILL_MILESTONES, PET_LEVEL_MULTIPLIERS, RELIC_NAMES } = require('../data/pets');
const { DUNGEON_TIERS, BOSS_LIST } = require('../data/dungeons');
const { FISH_DATA, FISH_TIERS, BAIT_TYPES, ROD_TYPES } = require('../data/fish');
const { ACHIEVEMENTS, hasAchievement, grantAchievement, checkAchievements } = require('../systems/achievements');
const { getComboTracker, addComboFeature, getComboMultiplier } = require('../systems/combo');
const { activeContests, getContestState, startFishContest, addContestEntry, getContestLeaderboard } = require('../systems/contest');
const { generatePetStats, simulateBattle, simulatePvP, getPetData, getAllPets, addPetExp, getPetBonus, getPetSkillBonus, getExpNeeded, checkPetEvolution, evolvePet } = require('../systems/pets');
const { catchFish, getEquipment } = require('../systems/fishing');
const { getFarmData, getFarmSlots, getPlots, getStorage, addStorage, removeStorage, getStorageQty } = require('../systems/farming');
const { updateQuestProgress, generateDailyQuests, checkAndUpdateStreak, addXpAndMoney } = require('../systems/quests');
const { CALENDAR_REWARDS, getLoginCalendar } = require('../systems/calendar');
const { SLOT_SYMBOLS, SLOT_PAYOUTS, spinSlot, getSlotResult, GIFT_TAX_RATE, GIFT_MAX_PER_TRANSACTION, GIFT_RECEIVE_LIMIT_PER_DAY, getGiftReceivedToday, addGiftReceivedToday } = require('../systems/slots');
const { getRandomInt, shuffleString } = require('../utils');
const state = require('../state');

module.exports = {
    db, getOrCreateUser, getConf, getSetting, getUserStat, incrementUserStat, getItemCount, addItem, removeItem,
    ITEMS, FARM_LEVELS, FARM_CROPS, FARM_RECIPES, FARM_FERTILIZERS,
    PET_DATA, PET_FOODS, PET_EGGS, PET_CLASSES, PET_ELEMENTS, PET_EVOLUTIONS, ELEMENT_ADVANTAGE, PET_SKILL_MILESTONES, PET_LEVEL_MULTIPLIERS, RELIC_NAMES,
    DUNGEON_TIERS, BOSS_LIST, FISH_DATA, FISH_TIERS, BAIT_TYPES, ROD_TYPES,
    ACHIEVEMENTS, hasAchievement, grantAchievement, checkAchievements,
    getComboTracker, addComboFeature, getComboMultiplier,
    activeContests, getContestState, startFishContest, addContestEntry, getContestLeaderboard,
    generatePetStats, simulateBattle, simulatePvP, getPetData, getAllPets, addPetExp, getPetBonus, getPetSkillBonus, getExpNeeded, checkPetEvolution, evolvePet,
    catchFish, getEquipment,
    getFarmData, getFarmSlots, getPlots, getStorage, addStorage, removeStorage, getStorageQty,
    updateQuestProgress, generateDailyQuests, checkAndUpdateStreak, addXpAndMoney,
    CALENDAR_REWARDS, getLoginCalendar,
    SLOT_SYMBOLS, SLOT_PAYOUTS, spinSlot, getSlotResult, GIFT_TAX_RATE, GIFT_MAX_PER_TRANSACTION, GIFT_RECEIVE_LIMIT_PER_DAY, getGiftReceivedToday, addGiftReceivedToday,
    getRandomInt, shuffleString,
    state
};
