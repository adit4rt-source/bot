// systems/achievements.js
const { EmbedBuilder } = require('discord.js');
const { db, getOrCreateUser, getSetting, getUserStat, addItem, incrementUserStat, updateUserBalance, addUserBalance } = require('../database');

const ACHIEVEMENT_MILESTONES = [
    { count: 10, reward: { money: 5000, item: 'mystery_box', title: '🎖️ Collector' }, desc: '10 Badge' },
    { count: 25, reward: { money: 15000, item: 'lucky_charm', title: '🏅 Veteran' }, desc: '25 Badge' },
    { count: 50, reward: { money: 50000, item: 'xp_booster_3x', title: '🎗️ Elite' }, desc: '50 Badge' },
    { count: 75, reward: { money: 100000, item: 'streak_shield', title: '🎪 Master' }, desc: '75 Badge' },
    { count: 132, reward: { money: 250000, item: null, title: '👑 Completionist' }, desc: 'ALL Badge' },
];

const ACHIEVEMENTS = [
    // --- CHAT & SOCIAL ---
    { id: 'first_chat', name: 'Newbie', emoji: '👋', desc: 'Pertama kali chat di server', category: 'Social', reward: 100 },
    { id: 'chat_100', name: 'Tukang Ngobrol', emoji: '💬', desc: 'Kirim 100 pesan chat', category: 'Social', reward: 300 },
    { id: 'chat_500', name: 'Mulut Emas', emoji: '🗣️', desc: 'Kirim 500 pesan chat', category: 'Social', reward: 500 },
    { id: 'chat_1000', name: 'Legend of Chat', emoji: '👑', desc: 'Kirim 1.000 pesan chat', category: 'Social', reward: 1000 },
    { id: 'chat_5000', name: 'Chat Machine', emoji: '🤖', desc: 'Kirim 5.000 pesan chat', category: 'Social', reward: 2500 },
    { id: 'react_50', name: 'Expressive', emoji: '😄', desc: 'Berikan 50 reaction', category: 'Social', reward: 200 },
    { id: 'react_200', name: 'Reaction King', emoji: '🤩', desc: 'Berikan 200 reaction', category: 'Social', reward: 500 },
    // --- ECONOMY ---
    { id: 'balance_10k', name: 'Kaya Raya', emoji: '💰', desc: 'Balance mencapai 10.000', category: 'Economy', reward: 200 },
    { id: 'balance_100k', name: 'Sultan', emoji: '💎', desc: 'Balance mencapai 100.000', category: 'Economy', reward: 500 },
    { id: 'balance_1m', name: 'Jutawan', emoji: '💸', desc: 'Balance mencapai 1.000.000', category: 'Economy', reward: 1500 },
    { id: 'first_buy', name: 'Shopaholic Pemula', emoji: '🛍️', desc: 'Pertama kali beli barang di shop', category: 'Economy', reward: 100 },
    { id: 'buy_10', name: 'Shopaholic', emoji: '🛒', desc: 'Beli 10 item dari shop', category: 'Economy', reward: 500 },
    { id: 'daily_7', name: 'Rajin Klaim', emoji: '📅', desc: 'Klaim /daily 7 hari', category: 'Economy', reward: 300 },
    { id: 'daily_30', name: 'Daily Warrior', emoji: '🗓️', desc: 'Klaim /daily 30 hari', category: 'Economy', reward: 1000 },
    // --- LEVEL ---
    { id: 'level_5', name: 'Rising Star', emoji: '⭐', desc: 'Mencapai Level 5', category: 'Level', reward: 200 },
    { id: 'level_10', name: 'Veteran', emoji: '🌟', desc: 'Mencapai Level 10', category: 'Level', reward: 500 },
    { id: 'level_25', name: 'Elite Member', emoji: '💫', desc: 'Mencapai Level 25', category: 'Level', reward: 1000 },
    { id: 'level_50', name: 'Grandmaster', emoji: '🏆', desc: 'Mencapai Level 50', category: 'Level', reward: 2500 },
    { id: 'level_100', name: 'Immortal Legend', emoji: '🔱', desc: 'Mencapai Level 100', category: 'Level', reward: 5000 },
    // --- STREAK ---
    { id: 'streak_7', name: 'On Fire', emoji: '🔥', desc: 'Streak 7 hari berturut-turut', category: 'Streak', reward: 300 },
    { id: 'streak_14', name: 'Flame Keeper', emoji: '🕯️', desc: 'Streak 14 hari berturut-turut', category: 'Streak', reward: 500 },
    { id: 'streak_30', name: 'Streak Master', emoji: '🏅', desc: 'Streak 30 hari berturut-turut', category: 'Streak', reward: 1500 },
    { id: 'streak_60', name: 'Undying Flame', emoji: '☀️', desc: 'Streak 60 hari berturut-turut', category: 'Streak', reward: 3000 },
    { id: 'streak_100', name: 'Eternal Blaze', emoji: '🌋', desc: 'Streak 100 hari berturut-turut', category: 'Streak', reward: 5000 },
    // --- GAMBLING ---
    { id: 'coinflip_first', name: 'Gambler Pemula', emoji: '🪙', desc: 'Pertama kali main coinflip', category: 'Gambling', reward: 50 },
    { id: 'coinflip_win_5', name: 'Lucky Streak', emoji: '🍀', desc: 'Menang coinflip 5 kali', category: 'Gambling', reward: 300 },
    { id: 'coinflip_win_20', name: 'Penjudi Beruntung', emoji: '🎰', desc: 'Menang coinflip 20 kali', category: 'Gambling', reward: 800 },
    { id: 'coinflip_win_50', name: 'Casino Royale', emoji: '♠️', desc: 'Menang coinflip 50 kali', category: 'Gambling', reward: 2000 },
    // --- MINI EVENTS ---
    { id: 'event_first', name: 'Event Hunter', emoji: '🎯', desc: 'Pertama kali menang mini-event', category: 'Events', reward: 100 },
    { id: 'event_10', name: 'Event Pro', emoji: '🏹', desc: 'Menang 10 mini-event', category: 'Events', reward: 500 },
    { id: 'event_50', name: 'Event Legend', emoji: '⚡', desc: 'Menang 50 mini-event', category: 'Events', reward: 2000 },
    // --- VOICE ---
    { id: 'voice_1h', name: 'Voice Newbie', emoji: '🎙️', desc: 'Total 1 jam di voice chat', category: 'Voice', reward: 100 },
    { id: 'voice_10h', name: 'Voice Addict', emoji: '🎧', desc: 'Total 10 jam di voice chat', category: 'Voice', reward: 500 },
    { id: 'voice_50h', name: 'Voice Legend', emoji: '🎶', desc: 'Total 50 jam di voice chat', category: 'Voice', reward: 1500 },
    { id: 'voice_100h', name: 'Living in VC', emoji: '🏠', desc: 'Total 100 jam di voice chat', category: 'Voice', reward: 3000 },
    // --- QUEST ---
    { id: 'quest_first', name: 'Misi Pertama', emoji: '📜', desc: 'Selesaikan quest pertama', category: 'Quest', reward: 100 },
    { id: 'quest_10', name: 'Quest Warrior', emoji: '⚔️', desc: 'Selesaikan 10 quest', category: 'Quest', reward: 400 },
    { id: 'quest_50', name: 'Quest Master', emoji: '🎖️', desc: 'Selesaikan 50 quest', category: 'Quest', reward: 1500 },
    { id: 'quest_100', name: 'Quiz Champion', emoji: '🧠', desc: 'Selesaikan 100 quest', category: 'Quest', reward: 3000 },
    // --- SPECIAL ---
    { id: 'redeem_first', name: 'Voucher Hunter', emoji: '🎟️', desc: 'Pertama kali redeem voucher', category: 'Special', reward: 50 },
    { id: 'custom_role', name: 'Fashionista', emoji: '🎨', desc: 'Membuat Custom Role', category: 'Special', reward: 200 },
    { id: 'all_quest_day', name: 'Perfect Day', emoji: '✨', desc: 'Selesaikan semua quest dalam 1 hari', category: 'Special', reward: 500 },
    // --- FISHING ---
    { id: 'fish_first', name: 'Pemancing Pemula', emoji: '🎣', desc: 'Pertama kali memancing', category: 'Fishing', reward: 50 },
    { id: 'fish_10', name: 'Nelayan', emoji: '🚣', desc: 'Tangkap 10 ikan', category: 'Fishing', reward: 200 },
    { id: 'fish_50', name: 'Kapten Laut', emoji: '⚓', desc: 'Tangkap 50 ikan', category: 'Fishing', reward: 500 },
    { id: 'fish_100', name: 'Master Angler', emoji: '🏅', desc: 'Tangkap 100 ikan', category: 'Fishing', reward: 1000 },
    { id: 'fish_500', name: 'Fishing Legend', emoji: '🐋', desc: 'Tangkap 500 ikan', category: 'Fishing', reward: 3000 },
    { id: 'fish_rare', name: 'Rare Catch', emoji: '🐡', desc: 'Tangkap ikan Rare pertama', category: 'Fishing', reward: 300 },
    { id: 'fish_epic', name: 'Epic Fisher', emoji: '🦈', desc: 'Tangkap ikan Epic pertama', category: 'Fishing', reward: 800 },
    { id: 'fish_legendary', name: 'Legendary Catch', emoji: '🐉', desc: 'Tangkap ikan Legendary pertama', category: 'Fishing', reward: 2000 },
    { id: 'fish_mythic', name: 'Mythic Hunter', emoji: '🌈', desc: 'Tangkap ikan Mythic pertama', category: 'Fishing', reward: 5000 },
    { id: 'fish_sell_10k', name: 'Fish Merchant', emoji: '💰', desc: 'Total jual ikan senilai 10.000', category: 'Fishing', reward: 500 },
    { id: 'fish_sell_100k', name: 'Fish Tycoon', emoji: '🤑', desc: 'Total jual ikan senilai 100.000', category: 'Fishing', reward: 2000 },
    { id: 'fish_heavy', name: 'Monster Fish!', emoji: '🐳', desc: 'Tangkap ikan berat > 500 kg', category: 'Fishing', reward: 1500 },
    { id: 'fish_rod_pro', name: 'Pro Equipment', emoji: '🏆', desc: 'Beli Joran Pro Titanium', category: 'Fishing', reward: 500 },
    { id: 'fish_rod_mythic', name: 'Ultimate Gear', emoji: '🔱', desc: 'Beli Joran Mitik', category: 'Fishing', reward: 2000 },
    { id: 'fish_secret', name: 'Secret Finder', emoji: '🔮', desc: 'Tangkap ikan Secret pertama', category: 'Fishing', reward: 10000 },
    // --- GIANT FISH ---
    { id: 'giant_fish_first', name: 'Giant Slayer', emoji: '🐋', desc: 'Kalahkan Giant Fish pertama', category: 'Fishing', reward: 3000 },
    { id: 'giant_fish_5', name: 'Boss Hunter', emoji: '⚔️', desc: 'Kalahkan 5 Giant Fish', category: 'Fishing', reward: 8000 },
    { id: 'giant_fish_15', name: 'Titan Slayer', emoji: '🏆', desc: 'Kalahkan 15 Giant Fish', category: 'Fishing', reward: 20000 },
    { id: 'giant_fish_void_titan', name: 'Void Conqueror', emoji: '🌀', desc: 'Kalahkan Void Titan', category: 'Fishing', reward: 15000 },
    // --- SECRET LOCATION ---
    { id: 'secret_location_unlock', name: 'Abyss Explorer', emoji: '👁️', desc: 'Unlock The Abyss (Secret Location)', category: 'Fishing', reward: 5000 },
    { id: 'fish_abyss_10', name: 'Abyss Fisher', emoji: '🌊', desc: 'Tangkap 10 ikan di The Abyss', category: 'Fishing', reward: 5000 },
    { id: 'fish_universe', name: 'Universe Catcher', emoji: '🌠', desc: 'Tangkap Universe Fish (Abyss Secret)', category: 'Fishing', reward: 25000 },
    // --- GOD TIER ---
    { id: 'fish_god', name: 'God Fisher', emoji: '👑', desc: 'Tangkap ikan God tier pertama', category: 'Fishing', reward: 50000 },
    { id: 'fish_god_5', name: 'Deity Hunter', emoji: '⚡', desc: 'Tangkap 5 ikan God tier', category: 'Fishing', reward: 100000 },
    { id: 'fish_omega', name: 'Omega Catcher', emoji: '🔱', desc: 'Tangkap Omega Fish', category: 'Fishing', reward: 75000 },
    { id: 'fish_eternal', name: 'Eternal Angler', emoji: '♾️', desc: 'Tangkap The Eternal One', category: 'Fishing', reward: 100000 },
    // --- SEA MONSTERS ---
    { id: 'monster_survive_10', name: 'Monster Survivor', emoji: '🐲', desc: 'Selamatkan diri dari 10 Sea Monster', category: 'Fishing', reward: 3000 },
    { id: 'monster_survive_50', name: 'Monster Slayer', emoji: '⚔️', desc: 'Selamatkan diri dari 50 Sea Monster', category: 'Fishing', reward: 10000 },
    // --- FARMING ---
    { id: 'farm_first', name: 'Petani Baru', emoji: '🌱', desc: 'Panen pertama kali', category: 'Farming', reward: 100 },
    { id: 'farm_50', name: 'Green Thumb', emoji: '🌿', desc: 'Panen 50 kali', category: 'Farming', reward: 500 },
    { id: 'farm_200', name: 'Farmer Pro', emoji: '🌳', desc: 'Panen 200 kali', category: 'Farming', reward: 1500 },
    { id: 'farm_500', name: 'Agriculture King', emoji: '👑', desc: 'Panen 500 kali', category: 'Farming', reward: 5000 },
    { id: 'farm_craft_10', name: 'Home Cook', emoji: '🍳', desc: 'Craft 10 produk', category: 'Farming', reward: 300 },
    { id: 'farm_craft_50', name: 'Master Chef', emoji: '👨‍🍳', desc: 'Craft 50 produk', category: 'Farming', reward: 1500 },
    { id: 'farm_upgrade_max', name: 'Tuan Tanah', emoji: '🏰', desc: 'Upgrade lahan ke level 6 (max)', category: 'Farming', reward: 5000 },
    { id: 'farm_legendary', name: 'Crystal Grower', emoji: '💎', desc: 'Panen tanaman Legendary pertama', category: 'Farming', reward: 3000 },
    // --- SLOT MACHINE ---
    { id: 'slot_first', name: 'Slot Beginner', emoji: '🎰', desc: 'Pertama kali main slot', category: 'Gambling', reward: 50 },
    { id: 'slot_jackpot', name: 'JACKPOT!', emoji: '💰', desc: 'Dapat jackpot pertama (3x sama)', category: 'Gambling', reward: 1000 },
    { id: 'slot_jackpot_7', name: 'Lucky Seven', emoji: '7️⃣', desc: 'Jackpot 7️⃣7️⃣7️⃣ (25x payout)', category: 'Gambling', reward: 5000 },
    { id: 'slot_win_10', name: 'Slot Addict', emoji: '🎲', desc: 'Menang slot 10 kali', category: 'Gambling', reward: 300 },
    { id: 'slot_win_50', name: 'Slot Master', emoji: '🃏', desc: 'Menang slot 50 kali', category: 'Gambling', reward: 1500 },
    { id: 'slot_total_100k', name: 'High Roller', emoji: '💵', desc: 'Total menang slot 100.000 money', category: 'Gambling', reward: 2000 },
    // --- GIFT ---
    { id: 'gift_first', name: 'Dermawan', emoji: '🎁', desc: 'Pertama kali kirim gift ke orang lain', category: 'Social', reward: 100 },
    { id: 'gift_10', name: 'Generous Soul', emoji: '💝', desc: 'Kirim gift 10 kali', category: 'Social', reward: 500 },
    { id: 'gift_50', name: 'Philanthropist', emoji: '🏛️', desc: 'Kirim gift 50 kali', category: 'Social', reward: 2000 },
    { id: 'gift_total_50k', name: 'Big Spender', emoji: '💸', desc: 'Total kirim 50.000 money', category: 'Social', reward: 1000 },
    { id: 'gift_received_first', name: 'Dicintai', emoji: '❤️', desc: 'Pertama kali menerima gift', category: 'Social', reward: 50 },
    // --- BATTLE ---
    { id: 'dungeon_first', name: 'Dungeon Explorer', emoji: '🏰', desc: 'Clear dungeon pertama kali', category: 'Battle', reward: 200 },
    { id: 'dungeon_10', name: 'Dungeon Crawler', emoji: '🗡️', desc: 'Clear dungeon 10 kali', category: 'Battle', reward: 500 },
    { id: 'dungeon_50', name: 'Dungeon Master', emoji: '⚔️', desc: 'Clear dungeon 50 kali', category: 'Battle', reward: 2000 },
    { id: 'dungeon_100', name: 'Dungeon Lord', emoji: '👑', desc: 'Clear dungeon 100 kali', category: 'Battle', reward: 5000 },
    { id: 'boss_first', name: 'Boss Slayer', emoji: '👹', desc: 'Kalahkan boss pertama kali', category: 'Battle', reward: 300 },
    { id: 'boss_10', name: 'Boss Hunter', emoji: '🏹', desc: 'Kalahkan boss 10 kali', category: 'Battle', reward: 1000 },
    { id: 'boss_50', name: 'Boss Destroyer', emoji: '💀', desc: 'Kalahkan boss 50 kali', category: 'Battle', reward: 3000 },
    { id: 'pvp_first', name: 'First Blood', emoji: '🩸', desc: 'Menang PvP pertama kali', category: 'Battle', reward: 150 },
    { id: 'pvp_10', name: 'Fighter', emoji: '🥊', desc: 'Menang PvP 10 kali', category: 'Battle', reward: 500 },
    { id: 'pvp_50', name: 'Champion', emoji: '🏆', desc: 'Menang PvP 50 kali', category: 'Battle', reward: 2000 },
    { id: 'pvp_100', name: 'Warlord', emoji: '⚡', desc: 'Menang PvP 100 kali', category: 'Battle', reward: 5000 },
    { id: 'refine_10', name: 'Blacksmith', emoji: '🔨', desc: 'Refine relic 10 kali (sukses)', category: 'Battle', reward: 500 },
    { id: 'refine_max', name: 'Master Refiner', emoji: '✨', desc: 'Refine relic ke +20 (MAX)', category: 'Battle', reward: 5000 },
    // --- PET COLLECTION ---
    { id: 'pet_first', name: 'Pet Owner', emoji: '🐾', desc: 'Adopsi/tetaskan pet pertama', category: 'Pet', reward: 100 },
    { id: 'pet_collect_10', name: 'Pet Collector', emoji: '🧺', desc: 'Kumpulkan 10 jenis pet berbeda', category: 'Pet', reward: 1000 },
    { id: 'pet_collect_25', name: 'Pet Hoarder', emoji: '📦', desc: 'Kumpulkan 25 jenis pet berbeda', category: 'Pet', reward: 3000 },
    { id: 'pet_collect_50', name: 'Beast Master', emoji: '🏅', desc: 'Kumpulkan 50 jenis pet berbeda', category: 'Pet', reward: 10000 },
    { id: 'pet_legendary', name: 'Legendary Tamer', emoji: '🟡', desc: 'Dapatkan pet Legendary pertama', category: 'Pet', reward: 2000 },
    { id: 'pet_mythic', name: 'Mythic Tamer', emoji: '🔴', desc: 'Dapatkan pet Mythic pertama', category: 'Pet', reward: 8000 },
    { id: 'pet_secret', name: 'Secret Keeper', emoji: '🟪', desc: 'Dapatkan pet Secret pertama', category: 'Pet', reward: 25000 },
    { id: 'pet_god', name: 'Divine Tamer', emoji: '👑', desc: 'Dapatkan pet GOD tier pertama', category: 'Pet', reward: 100000 },
    // --- LOTTERY / TOGEL ---
    { id: 'togel_first', name: 'Pemain Togel', emoji: '🎟️', desc: 'Pasang angka togel pertama kali', category: 'Gambling', reward: 100 },
    { id: 'togel_win_first', name: 'Hoki Pertama', emoji: '🍀', desc: 'Menang togel pertama kali', category: 'Gambling', reward: 500 },
    { id: 'togel_win_10', name: 'Raja Togel', emoji: '🎱', desc: 'Menang togel 10 kali', category: 'Gambling', reward: 2500 },
    { id: 'togel_won_500k', name: 'Jackpot Hunter', emoji: '💰', desc: 'Total menang togel 500.000', category: 'Gambling', reward: 3000 },
    // --- WORLD BOSS ---
    { id: 'world_boss_first', name: 'Penantang Boss', emoji: '🗡️', desc: 'Serang World Boss pertama kali', category: 'Battle', reward: 300 },
    { id: 'world_boss_slayer', name: 'World Boss Slayer', emoji: '🐉', desc: 'Pukulan terakhir mengalahkan World Boss', category: 'Battle', reward: 10000 },
    // --- RELIC MELT ---
    { id: 'relic_melt_first', name: 'Relic Smelter', emoji: '🔥', desc: 'Lebur relic pertama kali jadi Refine Stone', category: 'Battle', reward: 200 },
    // --- EXPEDITION ---
    { id: 'expedition_first', name: 'Penjelajah', emoji: '🧭', desc: 'Selesaikan ekspedisi pertama', category: 'Pet', reward: 150 },
    { id: 'expedition_25', name: 'Master Ekspedisi', emoji: '🗺️', desc: 'Selesaikan 25 ekspedisi', category: 'Pet', reward: 2000 },
    // --- AWAKENING ---
    { id: 'awakening_first', name: 'Awakened', emoji: '⚡', desc: 'Awakening pertama kali', category: 'Pet', reward: 5000 },
    // --- CARD COLLECTION ---
    { id: 'card_first', name: 'Card Collector', emoji: '🃏', desc: 'Buka gacha kartu pertama kali', category: 'Card', reward: 100 },
    { id: 'card_25', name: 'Card Enthusiast', emoji: '📚', desc: 'Kumpulkan 25 kartu', category: 'Card', reward: 500 },
    { id: 'card_100', name: 'Card Master', emoji: '🏆', desc: 'Kumpulkan 100 kartu', category: 'Card', reward: 2000 },
    { id: 'card_rare_holo', name: 'Rare Pull', emoji: '⭐', desc: 'Dapatkan kartu Rare Holo pertama', category: 'Card', reward: 300 },
    { id: 'card_ultra', name: 'Ultra Pull', emoji: '💎', desc: 'Dapatkan kartu Rare Ultra pertama', category: 'Card', reward: 1000 },
    // --- ARENA ---
    { id: 'arena_first', name: 'Arena Debut', emoji: '🏟️', desc: 'Pertama kali bertarung di Arena', category: 'Battle', reward: 200 },
    { id: 'arena_win_10', name: 'Arena Fighter', emoji: '⚔️', desc: 'Menang 10 pertarungan Arena', category: 'Battle', reward: 1000 },
    { id: 'arena_win_50', name: 'Arena Champion', emoji: '🏆', desc: 'Menang 50 pertarungan Arena', category: 'Battle', reward: 3000 },
    // --- LIVESTOCK ---
    { id: 'livestock_first', name: 'Peternak Pemula', emoji: '🐄', desc: 'Punya ternak pertama', category: 'Farming', reward: 100 },
    // --- COOKING & RELIC SOCKET ---
    { id: 'cook_first', name: 'Asisten Dapur', emoji: '🍳', desc: 'Pertama kali memasak hidangan di Cooking Hub', category: 'Farming', reward: 200 },
    { id: 'cook_10', name: 'Kopi & Roti', emoji: '👨‍🍳', desc: 'Masak 10 hidangan di Cooking Hub', category: 'Farming', reward: 1000 },
    { id: 'relic_socket_first', name: 'Relic Artificer', emoji: '💠', desc: 'Soket permata pertama ke Relic', category: 'Battle', reward: 500 },

];

function hasAchievement(guildId, userId, achievementId) {
    return !!db.prepare('SELECT 1 FROM achievements WHERE guildId = ? AND userId = ? AND achievementId = ?').get(guildId, userId, achievementId);
}

const pendingNotifications = new Map();
const coalesceDelay = process.env.NODE_ENV === 'test' ? 10 : 4000;

function queueNotification(guild, userId, achChannelId, item) {
    const key = `${guild.id}_${userId}`;
    if (!pendingNotifications.has(key)) {
        pendingNotifications.set(key, {
            guild,
            userId,
            achChannelId,
            items: [],
            timer: null
        });
    }
    const record = pendingNotifications.get(key);
    
    // Avoid duplicate achievements in the same batch
    if (item.type === 'achievement' && record.items.some(x => x.type === 'achievement' && x.id === item.id)) {
        return;
    }
    
    record.items.push(item);

    if (record.timer) {
        clearTimeout(record.timer);
    }

    record.timer = setTimeout(() => {
        dispatchNotifications(key).catch(() => {});
    }, coalesceDelay);
}

async function dispatchNotifications(key) {
    const record = pendingNotifications.get(key);
    if (!record) return;
    pendingNotifications.delete(key);

    const { guild, userId, achChannelId, items } = record;
    const channel = guild.channels.cache.get(achChannelId);
    if (!channel) return;

    const achievements = items.filter(i => i.type === 'achievement');
    const milestones = items.filter(i => i.type === 'milestone');

    if (achievements.length === 0 && milestones.length === 0) return;

    if (achievements.length === 1 && milestones.length === 0) {
        const ach = achievements[0];
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🏆 ACHIEVEMENT UNLOCKED!')
            .setDescription(`<@${userId}> mendapatkan badge baru!\n\n${ach.emoji} **${ach.name}**\n> *${ach.desc}*\n\n🎁 Hadiah: 🪙 **${ach.reward.toLocaleString('id-ID')} Money**`)
            .setFooter({ text: `Kategori: ${ach.category}` })
            .setTimestamp();
        channel.send({ embeds: [embed] }).catch(() => {});
        return;
    }

    if (milestones.length === 1 && achievements.length === 0) {
        const m = milestones[0];
        const embed = new EmbedBuilder()
            .setColor('#FF69B4')
            .setTitle('🌟 MILESTONE REWARD!')
            .setDescription(
                `<@${userId}> mencapai **${m.desc}** milestone!\n\n` +
                `🏆 Title: **${m.title}**\n` +
                `💰 Money: **+${m.money.toLocaleString('id-ID')}**\n` +
                (m.item ? `🎁 Item: **${m.item}**\n` : '') +
                `\n*Selamat! Terus kumpulkan badge!*`
            )
            .setTimestamp();
        channel.send({ embeds: [embed] }).catch(() => {});
        return;
    }

    // Coalesced / Batched message for multiple achievements/milestones
    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏆 MULTIPLE ACHIEVEMENTS UNLOCKED!')
        .setTimestamp();

    let descriptionText = `<@${userId}> telah membuka beberapa pencapaian baru secara bersamaan! 🎉\n\n`;
    let totalMoneyReward = 0;
    const itemsGained = [];
    const titlesGained = [];

    achievements.forEach((ach, index) => {
        descriptionText += `**${index + 1}. ${ach.emoji} ${ach.name}**\n> *${ach.desc}*\n`;
        totalMoneyReward += ach.reward;
    });

    if (milestones.length > 0) {
        descriptionText += `\n🌟 **Milestone Tercapai:**\n`;
        milestones.forEach(m => {
            descriptionText += `> • **${m.desc}**\n`;
            totalMoneyReward += m.money;
            if (m.item) itemsGained.push(m.item);
            if (m.title) titlesGained.push(m.title);
        });
    }

    descriptionText += `\n🎁 **Total Hadiah Akumulatif:**\n> 💰 Money: **🪙 ${totalMoneyReward.toLocaleString('id-ID')}**`;
    if (itemsGained.length > 0) {
        descriptionText += `\n> 📦 Item: **${itemsGained.join(', ')}**`;
    }
    if (titlesGained.length > 0) {
        descriptionText += `\n> 👑 Gelar/Title: **${titlesGained.join(', ')}**`;
    }

    embed.setDescription(descriptionText);
    channel.send({ embeds: [embed] }).catch(() => {});
}

async function grantAchievement(guild, userId, achievementId) {
    const guildId = guild.id;
    if (hasAchievement(guildId, userId, achievementId)) return false;
    const achDef = ACHIEVEMENTS.find(a => a.id === achievementId);
    if (!achDef) return false;
    db.prepare('INSERT OR IGNORE INTO achievements (guildId, userId, achievementId, unlockedAt) VALUES (?, ?, ?, ?)').run(guildId, userId, achievementId, Date.now());
    const user = getOrCreateUser(guildId, userId);
    user.balance += achDef.reward;
    updateUserBalance(guildId, userId, user.balance);
    
    const achChannelId = getSetting(guildId, 'achievement_channel', null);
    if (achChannelId) {
        queueNotification(guild, userId, achChannelId, {
            type: 'achievement',
            id: achievementId,
            emoji: achDef.emoji,
            name: achDef.name,
            desc: achDef.desc,
            reward: achDef.reward,
            category: achDef.category
        });
    }

    // Check milestone rewards
    await checkMilestoneRewards(guild, userId);

    return true;
}

async function checkMilestoneRewards(guild, userId) {
    const guildId = guild.id;
    const totalAchs = db.prepare('SELECT COUNT(*) as cnt FROM achievements WHERE userId = ?').get(userId);
    const totalCount = totalAchs ? totalAchs.cnt : 0;

    for (const milestone of ACHIEVEMENT_MILESTONES) {
        if (totalCount >= milestone.count) {
            const milestoneKey = `milestone_${milestone.count}_claimed`;
            const alreadyClaimed = getUserStat(guildId, userId, milestoneKey);
            if (alreadyClaimed) continue;

            // Grant milestone reward
            addUserBalance(guildId, userId, milestone.reward.money);
            if (milestone.reward.item) {
                addItem(guildId, userId, milestone.reward.item, 1);
            }
            // Store title
            db.prepare('INSERT OR REPLACE INTO user_stats (guildId, userId, stat_key, stat_value) VALUES (?, ?, ?, ?)').run(guildId, userId, 'achievement_title', milestone.reward.title);
            // Mark as claimed
            incrementUserStat(guildId, userId, milestoneKey, 1);

            // Send notification
            const achChannelId = getSetting(guildId, 'achievement_channel', null);
            if (achChannelId) {
                queueNotification(guild, userId, achChannelId, {
                    type: 'milestone',
                    desc: milestone.desc,
                    title: milestone.reward.title,
                    money: milestone.reward.money,
                    item: milestone.reward.item
                });
            }
        }
    }

    // Update achievement-based progression role
    await updateAchievementRole(guild, userId, totalCount);
}

// ==================== ACHIEVEMENT-BASED PROGRESSION ROLES ====================
// Roles are auto-created per server on first need. Replace mode: only highest role active.
const ACHIEVEMENT_ROLES = [
    { minBadges: 5,  name: '🌱 Pemula', color: '#7ED321' },
    { minBadges: 15, name: '⭐ Explorer', color: '#4A90D9' },
    { minBadges: 30, name: '💎 Veteran', color: '#9B59B6' },
    { minBadges: 50, name: '🔥 Elite', color: '#E74C3C' },
    { minBadges: 70, name: '👑 Master', color: '#F1C40F' },
    { minBadges: 119, name: '🏆 Completionist', color: '#FFFFFF' },
];

async function updateAchievementRole(guild, userId, badgeCount) {
    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return;

        // Determine which role tier the user qualifies for (highest)
        let qualifiedTier = null;
        for (let i = ACHIEVEMENT_ROLES.length - 1; i >= 0; i--) {
            if (badgeCount >= ACHIEVEMENT_ROLES[i].minBadges) { qualifiedTier = ACHIEVEMENT_ROLES[i]; break; }
        }

        // Get or create all achievement roles for this server
        const roleIds = await getOrCreateAchievementRoles(guild);

        // Remove all achievement roles from the user, then add the qualified one
        const allRoleIds = Object.values(roleIds);
        const currentAchRoles = member.roles.cache.filter(r => allRoleIds.includes(r.id));
        for (const [, role] of currentAchRoles) {
            await member.roles.remove(role).catch(() => {});
        }

        if (qualifiedTier) {
            const roleId = roleIds[qualifiedTier.minBadges];
            if (roleId) {
                const role = guild.roles.cache.get(roleId);
                if (role) await member.roles.add(role).catch(() => {});
            }
        }
    } catch (e) { /* silent — role assignment should never break the bot */ }
}

async function getOrCreateAchievementRoles(guild) {
    const guildId = guild.id;
    // Check if we already have cached role IDs for this server
    const cached = db.prepare("SELECT value FROM server_settings WHERE guildId = ? AND key = 'achievement_roles'").get(guildId);
    if (cached) {
        try {
            const parsed = JSON.parse(cached.value);
            // Verify all roles still exist
            let allExist = true;
            for (const [, roleId] of Object.entries(parsed)) {
                if (!guild.roles.cache.has(roleId)) { allExist = false; break; }
            }
            if (allExist) return parsed;
        } catch (e) { /* re-create */ }
    }

    // Create roles (lowest to highest)
    const roleIds = {};
    for (const tier of ACHIEVEMENT_ROLES) {
        let existingRole = guild.roles.cache.find(r => r.name === tier.name);
        if (!existingRole) {
            try {
                existingRole = await guild.roles.create({
                    name: tier.name,
                    color: tier.color,
                    hoist: true,
                    reason: `Achievement Role: ${tier.minBadges}+ badges`
                });
            } catch (e) { continue; }
        }
        roleIds[tier.minBadges] = existingRole.id;
    }

    db.prepare("INSERT OR REPLACE INTO server_settings (guildId, key, value) VALUES (?, ?, ?)").run(guildId, 'achievement_roles', JSON.stringify(roleIds));
    return roleIds;
}

async function checkAchievements(guild, userId, context = {}) {
    const guildId = guild.id;
    const user = getOrCreateUser(guildId, userId);
    const checks = [];
    if (context.type === 'chat') { const c = getUserStat(guildId, userId, 'total_chats'); if (c >= 1) checks.push('first_chat'); if (c >= 100) checks.push('chat_100'); if (c >= 500) checks.push('chat_500'); if (c >= 1000) checks.push('chat_1000'); if (c >= 5000) checks.push('chat_5000'); }
    if (context.type === 'reaction') { const c = getUserStat(guildId, userId, 'total_reactions'); if (c >= 50) checks.push('react_50'); if (c >= 200) checks.push('react_200'); }
    if (user.balance >= 10000) checks.push('balance_10k'); if (user.balance >= 100000) checks.push('balance_100k'); if (user.balance >= 1000000) checks.push('balance_1m');
    if (context.type === 'buy') { const c = getUserStat(guildId, userId, 'total_buys'); if (c >= 1) checks.push('first_buy'); if (c >= 10) checks.push('buy_10'); }
    if (context.type === 'daily') { const c = getUserStat(guildId, userId, 'total_dailies'); if (c >= 7) checks.push('daily_7'); if (c >= 30) checks.push('daily_30'); }
    if (user.level >= 5) checks.push('level_5'); if (user.level >= 10) checks.push('level_10'); if (user.level >= 25) checks.push('level_25'); if (user.level >= 50) checks.push('level_50'); if (user.level >= 100) checks.push('level_100');
    if (context.type === 'streak') { const s = db.prepare('SELECT * FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId); const c = s ? s.count : 0; if (c >= 7) checks.push('streak_7'); if (c >= 14) checks.push('streak_14'); if (c >= 30) checks.push('streak_30'); if (c >= 60) checks.push('streak_60'); if (c >= 100) checks.push('streak_100'); }
    if (context.type === 'coinflip') { const t = getUserStat(guildId, userId, 'total_coinflips'); const w = getUserStat(guildId, userId, 'coinflip_wins'); if (t >= 1) checks.push('coinflip_first'); if (w >= 5) checks.push('coinflip_win_5'); if (w >= 20) checks.push('coinflip_win_20'); if (w >= 50) checks.push('coinflip_win_50'); }
    if (context.type === 'event_win') { const c = getUserStat(guildId, userId, 'event_wins'); if (c >= 1) checks.push('event_first'); if (c >= 10) checks.push('event_10'); if (c >= 50) checks.push('event_50'); }
    if (context.type === 'voice') { const c = getUserStat(guildId, userId, 'total_voice_mins'); if (c >= 60) checks.push('voice_1h'); if (c >= 600) checks.push('voice_10h'); if (c >= 3000) checks.push('voice_50h'); if (c >= 6000) checks.push('voice_100h'); }
    if (context.type === 'quest') { const c = getUserStat(guildId, userId, 'total_quests_done'); if (c >= 1) checks.push('quest_first'); if (c >= 10) checks.push('quest_10'); if (c >= 50) checks.push('quest_50'); if (c >= 100) checks.push('quest_100'); }
    if (context.type === 'redeem') checks.push('redeem_first'); if (context.type === 'custom_role') checks.push('custom_role'); if (context.type === 'all_quest_day') checks.push('all_quest_day');
    if (context.type === 'fishing') { const c = getUserStat(guildId, userId, 'total_fish_caught'); if (c >= 1) checks.push('fish_first'); if (c >= 10) checks.push('fish_10'); if (c >= 50) checks.push('fish_50'); if (c >= 100) checks.push('fish_100'); if (c >= 500) checks.push('fish_500'); if (context.tier === 'Rare') checks.push('fish_rare'); if (context.tier === 'Epic') checks.push('fish_epic'); if (context.tier === 'Legendary') checks.push('fish_legendary'); if (context.tier === 'Mythic') checks.push('fish_mythic'); if (context.tier === 'Secret') checks.push('fish_secret'); if (context.tier === 'God') checks.push('fish_god'); if (context.weight > 500) checks.push('fish_heavy'); const godCount = getUserStat(guildId, userId, 'fish_caught_god_tier'); if (godCount >= 5) checks.push('fish_god_5'); if (context.fishId === 'omega_fish') checks.push('fish_omega'); if (context.fishId === 'eternal_one') checks.push('fish_eternal'); }
    if (context.type === 'giant_fish') { const c = getUserStat(guildId, userId, 'giant_fish_defeated'); if (c >= 1) checks.push('giant_fish_first'); if (c >= 5) checks.push('giant_fish_5'); if (c >= 15) checks.push('giant_fish_15'); if (context.giantFishId === 'giant_void_titan') checks.push('giant_fish_void_titan'); }
    if (context.type === 'secret_location_unlock') { checks.push('secret_location_unlock'); }
    if (context.type === 'fishing_abyss') { const c = getUserStat(guildId, userId, 'fish_caught_abyss'); if (c >= 10) checks.push('fish_abyss_10'); if (context.fishId === 'universe_fish') checks.push('fish_universe'); }
    if (context.type === 'sea_monster') { const c = getUserStat(guildId, userId, 'sea_monster_encounters'); if (c >= 10) checks.push('monster_survive_10'); if (c >= 50) checks.push('monster_survive_50'); }
    if (context.type === 'fish_sell') { const c = getUserStat(guildId, userId, 'total_fish_sold_value'); if (c >= 10000) checks.push('fish_sell_10k'); if (c >= 100000) checks.push('fish_sell_100k'); }
    if (context.type === 'fish_rod') { if (context.rod === 'pro') checks.push('fish_rod_pro'); if (context.rod === 'mythic_rod') checks.push('fish_rod_mythic'); }
    if (context.type === 'farm_harvest') { const c = getUserStat(guildId, userId, 'total_harvests'); if (c >= 1) checks.push('farm_first'); if (c >= 50) checks.push('farm_50'); if (c >= 200) checks.push('farm_200'); if (c >= 500) checks.push('farm_500'); if (context.legendary) checks.push('farm_legendary'); }
    if (context.type === 'farm_craft') { const c = getUserStat(guildId, userId, 'total_crafts'); if (c >= 10) checks.push('farm_craft_10'); if (c >= 50) checks.push('farm_craft_50'); }
    if (context.type === 'farm_upgrade_max') checks.push('farm_upgrade_max');
    if (context.type === 'slot') { const w = getUserStat(guildId, userId, 'slot_wins'); const t = getUserStat(guildId, userId, 'slot_total_winnings'); checks.push('slot_first'); if (context.jackpot) checks.push('slot_jackpot'); if (context.jackpot7) checks.push('slot_jackpot_7'); if (w >= 10) checks.push('slot_win_10'); if (w >= 50) checks.push('slot_win_50'); if (t >= 100000) checks.push('slot_total_100k'); }
    if (context.type === 'gift_send') { const c = getUserStat(guildId, userId, 'total_gifts_sent'); const t = getUserStat(guildId, userId, 'total_gift_amount'); if (c >= 1) checks.push('gift_first'); if (c >= 10) checks.push('gift_10'); if (c >= 50) checks.push('gift_50'); if (t >= 50000) checks.push('gift_total_50k'); }
    if (context.type === 'gift_receive') checks.push('gift_received_first');
    if (context.type === 'dungeon_clear') { const c = getUserStat(guildId, userId, 'dungeon_clears'); if (c >= 1) checks.push('dungeon_first'); if (c >= 10) checks.push('dungeon_10'); if (c >= 50) checks.push('dungeon_50'); if (c >= 100) checks.push('dungeon_100'); }
    if (context.type === 'boss_kill') { const c = getUserStat(guildId, userId, 'boss_kills'); if (c >= 1) checks.push('boss_first'); if (c >= 10) checks.push('boss_10'); if (c >= 50) checks.push('boss_50'); }
    if (context.type === 'pvp_win') { const c = getUserStat(guildId, userId, 'pvp_wins'); if (c >= 1) checks.push('pvp_first'); if (c >= 10) checks.push('pvp_10'); if (c >= 50) checks.push('pvp_50'); if (c >= 100) checks.push('pvp_100'); }
    if (context.type === 'refine_success') { const c = getUserStat(guildId, userId, 'refine_successes'); if (c >= 10) checks.push('refine_10'); if (context.maxRefine) checks.push('refine_max'); }
    if (context.type === 'pet_obtain') {
        // distinctPets = number of distinct petId owned (passed in by caller to avoid a query here)
        const distinct = context.distinctPets || 0;
        checks.push('pet_first');
        if (distinct >= 10) checks.push('pet_collect_10');
        if (distinct >= 25) checks.push('pet_collect_25');
        if (distinct >= 50) checks.push('pet_collect_50');
        if (context.tier === 'Legendary') checks.push('pet_legendary');
        if (context.tier === 'Mythic') checks.push('pet_mythic');
        if (context.tier === 'Secret') checks.push('pet_secret');
        if (context.tier === 'God') checks.push('pet_god');
    }
    // --- LOTTERY / TOGEL ---
    if (context.type === 'togel_bet') { const c = getUserStat(guildId, userId, 'togel_bets'); if (c >= 1) checks.push('togel_first'); }
    if (context.type === 'togel_win') { const w = getUserStat(guildId, userId, 'togel_wins'); const t = getUserStat(guildId, userId, 'togel_won_total'); if (w >= 1) checks.push('togel_win_first'); if (w >= 10) checks.push('togel_win_10'); if (t >= 500000) checks.push('togel_won_500k'); }
    // --- WORLD BOSS ---
    if (context.type === 'world_boss') { const a = getUserStat(guildId, userId, 'world_boss_attacks'); const l = getUserStat(guildId, userId, 'world_boss_last_hit'); if (a >= 1) checks.push('world_boss_first'); if (l >= 1) checks.push('world_boss_slayer'); }
    // --- RELIC MELT ---
    if (context.type === 'relic_melt') { const c = getUserStat(guildId, userId, 'relic_melts'); if (c >= 1) checks.push('relic_melt_first'); }
    // --- EXPEDITION ---
    if (context.type === 'expedition') { const c = getUserStat(guildId, userId, 'total_expeditions'); if (c >= 1) checks.push('expedition_first'); if (c >= 25) checks.push('expedition_25'); }
    // --- AWAKENING ---
    if (context.type === 'awakening') { const c = getUserStat(guildId, userId, 'total_awakenings'); if (c >= 1) checks.push('awakening_first'); }
    // --- CARD COLLECTION ---
    if (context.type === 'card_gacha') { const c = getUserStat(guildId, userId, 'cards_grabbed'); if (c >= 1) checks.push('card_first'); const total = context.totalCards || 0; if (total >= 25) checks.push('card_25'); if (total >= 100) checks.push('card_100'); if (context.hasRareHolo) checks.push('card_rare_holo'); if (context.hasUltra) checks.push('card_ultra'); }
    // --- ARENA ---
    if (context.type === 'arena') { const w = getUserStat(guildId, userId, 'arena_wins'); const t = (getUserStat(guildId, userId, 'arena_wins') || 0) + (getUserStat(guildId, userId, 'arena_losses') || 0); if (t >= 1) checks.push('arena_first'); if (w >= 10) checks.push('arena_win_10'); if (w >= 50) checks.push('arena_win_50'); }
    // --- LIVESTOCK ---
    if (context.type === 'livestock') { checks.push('livestock_first'); }
    // --- COOKING ---
    if (context.type === 'cook') {
        const c = getUserStat(guildId, userId, 'total_cooked');
        if (c >= 1) checks.push('cook_first');
        if (c >= 10) checks.push('cook_10');
    }
    // --- RELIC SOCKET ---
    if (context.type === 'relic_socket') {
        const c = getUserStat(guildId, userId, 'relic_gems_socketed');
        if (c >= 1) checks.push('relic_socket_first');
    }
    for (const achId of checks) { await grantAchievement(guild, userId, achId); }
}

// ==================== POKEDEX-STYLE PROGRESS ====================
// Maps countable achievements to a measurable stat + target so the panel can
// show "how far you are". Binary/one-shot badges (e.g. "catch first Rare fish")
// are intentionally omitted — they just show locked/unlocked.
const ACH_PROGRESS = {
    first_chat: { stat: 'total_chats', target: 1 }, chat_100: { stat: 'total_chats', target: 100 }, chat_500: { stat: 'total_chats', target: 500 }, chat_1000: { stat: 'total_chats', target: 1000 }, chat_5000: { stat: 'total_chats', target: 5000 },
    react_50: { stat: 'total_reactions', target: 50 }, react_200: { stat: 'total_reactions', target: 200 },
    first_buy: { stat: 'total_buys', target: 1 }, buy_10: { stat: 'total_buys', target: 10 },
    daily_7: { stat: 'total_dailies', target: 7 }, daily_30: { stat: 'total_dailies', target: 30 },
    coinflip_first: { stat: 'total_coinflips', target: 1 }, coinflip_win_5: { stat: 'coinflip_wins', target: 5 }, coinflip_win_20: { stat: 'coinflip_wins', target: 20 }, coinflip_win_50: { stat: 'coinflip_wins', target: 50 },
    event_first: { stat: 'event_wins', target: 1 }, event_10: { stat: 'event_wins', target: 10 }, event_50: { stat: 'event_wins', target: 50 },
    voice_1h: { stat: 'total_voice_mins', target: 60 }, voice_10h: { stat: 'total_voice_mins', target: 600 }, voice_50h: { stat: 'total_voice_mins', target: 3000 }, voice_100h: { stat: 'total_voice_mins', target: 6000 },
    quest_first: { stat: 'total_quests_done', target: 1 }, quest_10: { stat: 'total_quests_done', target: 10 }, quest_50: { stat: 'total_quests_done', target: 50 }, quest_100: { stat: 'total_quests_done', target: 100 },
    fish_first: { stat: 'total_fish_caught', target: 1 }, fish_10: { stat: 'total_fish_caught', target: 10 }, fish_50: { stat: 'total_fish_caught', target: 50 }, fish_100: { stat: 'total_fish_caught', target: 100 }, fish_500: { stat: 'total_fish_caught', target: 500 },
    fish_god_5: { stat: 'fish_caught_god_tier', target: 5 },
    giant_fish_first: { stat: 'giant_fish_defeated', target: 1 }, giant_fish_5: { stat: 'giant_fish_defeated', target: 5 }, giant_fish_15: { stat: 'giant_fish_defeated', target: 15 },
    fish_abyss_10: { stat: 'fish_caught_abyss', target: 10 },
    monster_survive_10: { stat: 'sea_monster_encounters', target: 10 }, monster_survive_50: { stat: 'sea_monster_encounters', target: 50 },
    fish_sell_10k: { stat: 'total_fish_sold_value', target: 10000 }, fish_sell_100k: { stat: 'total_fish_sold_value', target: 100000 },
    farm_first: { stat: 'total_harvests', target: 1 }, farm_50: { stat: 'total_harvests', target: 50 }, farm_200: { stat: 'total_harvests', target: 200 }, farm_500: { stat: 'total_harvests', target: 500 },
    farm_craft_10: { stat: 'total_crafts', target: 10 }, farm_craft_50: { stat: 'total_crafts', target: 50 },
    slot_win_10: { stat: 'slot_wins', target: 10 }, slot_win_50: { stat: 'slot_wins', target: 50 }, slot_total_100k: { stat: 'slot_total_winnings', target: 100000 },
    gift_first: { stat: 'total_gifts_sent', target: 1 }, gift_10: { stat: 'total_gifts_sent', target: 10 }, gift_50: { stat: 'total_gifts_sent', target: 50 }, gift_total_50k: { stat: 'total_gift_amount', target: 50000 },
    dungeon_first: { stat: 'dungeon_clears', target: 1 }, dungeon_10: { stat: 'dungeon_clears', target: 10 }, dungeon_50: { stat: 'dungeon_clears', target: 50 }, dungeon_100: { stat: 'dungeon_clears', target: 100 },
    boss_first: { stat: 'boss_kills', target: 1 }, boss_10: { stat: 'boss_kills', target: 10 }, boss_50: { stat: 'boss_kills', target: 50 },
    pvp_first: { stat: 'pvp_wins', target: 1 }, pvp_10: { stat: 'pvp_wins', target: 10 }, pvp_50: { stat: 'pvp_wins', target: 50 }, pvp_100: { stat: 'pvp_wins', target: 100 },
    refine_10: { stat: 'refine_successes', target: 10 },
    balance_10k: { special: 'balance', target: 10000 }, balance_100k: { special: 'balance', target: 100000 }, balance_1m: { special: 'balance', target: 1000000 },
    level_5: { special: 'level', target: 5 }, level_10: { special: 'level', target: 10 }, level_25: { special: 'level', target: 25 }, level_50: { special: 'level', target: 50 }, level_100: { special: 'level', target: 100 },
    streak_7: { special: 'streak', target: 7 }, streak_14: { special: 'streak', target: 14 }, streak_30: { special: 'streak', target: 30 }, streak_60: { special: 'streak', target: 60 }, streak_100: { special: 'streak', target: 100 },
    pet_collect_10: { special: 'distinctPets', target: 10 }, pet_collect_25: { special: 'distinctPets', target: 25 }, pet_collect_50: { special: 'distinctPets', target: 50 },
    togel_first: { stat: 'togel_bets', target: 1 }, togel_win_first: { stat: 'togel_wins', target: 1 }, togel_win_10: { stat: 'togel_wins', target: 10 }, togel_won_500k: { stat: 'togel_won_total', target: 500000 },
    world_boss_first: { stat: 'world_boss_attacks', target: 1 }, world_boss_slayer: { stat: 'world_boss_last_hit', target: 1 },
    relic_melt_first: { stat: 'relic_melts', target: 1 },
    expedition_first: { stat: 'total_expeditions', target: 1 }, expedition_25: { stat: 'total_expeditions', target: 25 },
    awakening_first: { stat: 'total_awakenings', target: 1 },
    card_first: { stat: 'cards_grabbed', target: 1 }, card_25: { special: 'totalCards', target: 25 }, card_100: { special: 'totalCards', target: 100 },
    arena_first: { special: 'arenaFights', target: 1 }, arena_win_10: { stat: 'arena_wins', target: 10 }, arena_win_50: { stat: 'arena_wins', target: 50 },
    livestock_first: { special: 'livestock', target: 1 },
    cook_first: { stat: 'total_cooked', target: 1 }, cook_10: { stat: 'total_cooked', target: 10 },
    relic_socket_first: { stat: 'relic_gems_socketed', target: 1 },
};

// Returns { raw, current, target } for a countable achievement, or null.
function getAchievementProgress(guildId, userId, achId) {
    const p = ACH_PROGRESS[achId];
    if (!p) return null;
    let current = 0;
    try {
        if (p.special === 'balance') current = getOrCreateUser(guildId, userId).balance;
        else if (p.special === 'level') current = getOrCreateUser(guildId, userId).level;
        else if (p.special === 'streak') { const s = db.prepare('SELECT count FROM streaks WHERE guildId = ? AND userId = ?').get(guildId, userId); current = s ? s.count : 0; }
        else if (p.special === 'distinctPets') { const r = db.prepare('SELECT COUNT(*) AS c FROM pet_discovery WHERE userId = ?').get(userId); current = r ? r.c : 0; }
        else if (p.special === 'totalCards') { const r = db.prepare('SELECT COUNT(*) AS c FROM pokemon_cards WHERE userId = ?').get(userId); current = r ? r.c : 0; }
        else if (p.special === 'arenaFights') { current = (getUserStat(guildId, userId, 'arena_wins') || 0) + (getUserStat(guildId, userId, 'arena_losses') || 0); }
        else if (p.special === 'livestock') { try { const r = db.prepare('SELECT COUNT(*) AS c FROM livestock WHERE userId = ?').get(userId); current = r ? r.c : 0; } catch (_) { current = 0; } }
        else current = getUserStat(guildId, userId, p.stat) || 0;
    } catch (_) { current = 0; }
    return { raw: current, current: Math.min(current, p.target), target: p.target };
}

// ==================== SELF-HEALING SYNC ====================
// Grants any threshold/countable badge whose condition is ALREADY satisfied but
// never got awarded — e.g. the stat was incremented before the badge existed, or
// a checkAchievements() call was missed somewhere. This fixes "stuck" badges that
// show progress like 601/1 but stay locked. Only badges listed in ACH_PROGRESS
// (i.e. with a measurable stat/special) participate; binary one-shot badges are
// left untouched because there is no stat to verify them against.
// Returns the number of badges newly granted.
async function syncAchievements(guild, userId) {
    const guildId = guild.id;
    let granted = 0;
    for (const achId of Object.keys(ACH_PROGRESS)) {
        if (hasAchievement(guildId, userId, achId)) continue;
        const prog = getAchievementProgress(guildId, userId, achId);
        if (prog && prog.raw >= prog.target) {
            const ok = await grantAchievement(guild, userId, achId);
            if (ok) granted++;
        }
    }
    return granted;
}

module.exports = { ACHIEVEMENTS, ACHIEVEMENT_MILESTONES, hasAchievement, grantAchievement, checkAchievements, checkMilestoneRewards, getAchievementProgress, syncAchievements };
