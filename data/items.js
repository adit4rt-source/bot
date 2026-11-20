const ITEMS = [
    // === KATEGORI A: PROTEKSI & KOSMETIK PROFIL ===
    { id: 'streak_shield', name: 'Streak Shield', emoji: '🛡️', menuEmoji: '🛡️', desc: 'Lindungi streak jika bolos chat 1 hari', price: 15000, category: 'Proteksi' },
    { id: 'streak_freeze', name: 'Streak Freeze', emoji: '🧊', menuEmoji: '🧊', desc: 'Bekukan streak selama 3 hari (liburan)', price: 40000, category: 'Proteksi' },
    { id: 'color_role', name: 'Custom Color Role', emoji: '🎨', menuEmoji: '🎨', desc: 'Pilih warna HEX nama custom kamu sendiri', price: 75000, category: 'Kosmetik' },
    { id: 'custom_title', name: 'Custom Title Tag', emoji: '📛', menuEmoji: '📛', desc: 'Pasang gelar kustom di kartu /profile', price: 35000, category: 'Kosmetik' },
    { id: 'custom_banner', name: 'Custom Profile Banner', emoji: '🖼️', menuEmoji: '🖼️', desc: 'Pasang gambar background kartu /profile', price: 50000, category: 'Kosmetik' },

    // === KATEGORI B: FITUR SOSIAL ===
    { id: 'server_megaphone', name: 'Server Megaphone', emoji: '📢', menuEmoji: '📢', desc: 'Broadcast pesan berbingkai emas ke chat', price: 20000, category: 'Sosial' },
    { id: 'menfess_token', name: 'Menfess Token', emoji: '🤫', menuEmoji: '🤫', desc: 'Kirim pesan rahasia anonim via bot', price: 8000, category: 'Sosial' },

    // === KATEGORI C: BOOSTER & HIBURAN ===
    { id: 'xp_booster_2x', name: 'XP Booster 2x', emoji: '⚡', menuEmoji: '⚡', desc: 'Double XP chat & voice (2 jam)', price: 8000, category: 'Booster' },
    { id: 'money_magnet', name: 'Money Magnet', emoji: '🧲', menuEmoji: '🧲', desc: '+50% perolehan money chat (1 jam)', price: 12000, category: 'Booster' },
    { id: 'tax_free_voucher', name: 'Tax-Free Voucher', emoji: '🎫', menuEmoji: '🎫', desc: 'Kirim /gift bebas potongan pajak (1x)', price: 4000, category: 'Economy' },
    { id: 'lucky_slot_charm', name: 'Lucky Slot Charm', emoji: '🎰', menuEmoji: '🎰', desc: 'Jamin 2 simbol sama di slot casino', price: 10000, category: 'Luck' },
    { id: 'mystery_box', name: 'Mystery Gacha Box', emoji: '📦', menuEmoji: '📦', desc: 'Buka gacha acak berhadiah 1.000–30.000 money', price: 6000, category: 'Special' },

    // ===== Non-buyable / Drop-only / Legacy items (price 0, not in shop) =====
    { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', menuEmoji: '🪨', desc: 'Material upgrade relic (+1) — HANYA dari drop', price: 0, category: 'Battle' },
    { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', menuEmoji: '🛡️', desc: 'Refine gagal tidak turun level — HANYA dari drop', price: 0, category: 'Battle' },
    { id: 'rod_part', name: 'Rod Parts', emoji: '🔧', menuEmoji: '🔧', desc: 'Material upgrade joran — HANYA dari drop', price: 0, category: 'Fishing' },
    { id: 'monster_repellent', name: 'Monster Repellent', emoji: '🧪', menuEmoji: '🧪', desc: 'Kurangi monster chance', price: 0, category: 'Fishing' },
    { id: 'shield_charm', name: 'Shield Charm', emoji: '🛡️', menuEmoji: '🛡️', desc: 'Block 1 serangan monster', price: 0, category: 'Fishing' },
    { id: 'thunder_coating', name: 'Thunder Rod Coating', emoji: '⚡', menuEmoji: '⚡', desc: 'Monster langsung kabur', price: 0, category: 'Fishing' },
    { id: 'pesticide', name: 'Pestisida', emoji: '🧴', menuEmoji: '🧴', desc: 'Basmi 1 hama di plot', price: 0, category: 'Farming' },
    { id: 'premium_feed', name: 'Pakan Premium', emoji: '⭐', menuEmoji: '⭐', desc: 'Material evolve ternak', price: 0, category: 'Farming' },
    { id: 'pesticide_shield', name: 'Pestisida Shield', emoji: '🌿', menuEmoji: '🌿', desc: 'Lindungi farm dari hama', price: 0, category: 'Farming' },
    { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '🌟', menuEmoji: '🌟', desc: 'Material langka Awakening', price: 0, category: 'Special' },
    { id: 'awakening_crystal', name: 'Awakening Crystal', emoji: '💫', menuEmoji: '💫', desc: 'Material ultra-langka Awakening', price: 0, category: 'Special' },
    { id: 'omega_core', name: 'Omega Core', emoji: '🔱', menuEmoji: '🔱', desc: 'Material legendaris', price: 0, category: 'Special' },
    { id: 'auto_harvest_pass', name: 'Auto-Harvest Pass', emoji: '🔔', menuEmoji: '🔔', desc: 'Notifikasi panen otomatis', price: 0, category: 'Special' },
    { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡', menuEmoji: '⚡', desc: 'Triple XP sementara (1 jam)', price: 0, category: 'Booster' },
    { id: 'lucky_charm', name: 'Lucky Charm', emoji: '🍀', menuEmoji: '🍀', desc: '+15% chance menang game', price: 0, category: 'Luck' },
    { id: 'daily_doubler', name: 'Daily Doubler', emoji: '📅', menuEmoji: '📅', desc: 'Gandakan /daily reward', price: 0, category: 'Economy' },
    { id: 'lucky_spin_token', name: 'Lucky Spin Token', emoji: '🎰', menuEmoji: '🎰', desc: 'Spin token slot', price: 0, category: 'Luck' },
];

const CRAFT_RECIPES = [
    // ===== Booster conversions =====
    { id: 'xp_upgrade_3x', name: 'XP Booster 3x', emoji: '⚡', ingredients: [{id: 'xp_booster_2x', qty: 2}, {id: 'mystery_box', qty: 1}], result: {type: 'item', id: 'xp_booster_3x', qty: 1}, desc: '2 XP Booster 2x + 1 Mystery Box → 1 XP Booster 3x' },
    { id: 'magnet_upgrade', name: 'Money Magnet', emoji: '🧲', ingredients: [{id: 'lucky_charm', qty: 3}], result: {type: 'item', id: 'money_magnet', qty: 1}, desc: '3 Lucky Charm → 1 Money Magnet' },

    // ===== Relic materials (sink for the clutter you collect) =====
    { id: 'stone_shield', name: 'Reinforced Stone', emoji: '🛡️', ingredients: [{id: 'refine_stone', qty: 6}], result: {type: 'item', id: 'protection_stone', qty: 1}, desc: '6 Refine Stone → 1 Protection Stone' },
    { id: 'protection_bundle', name: 'Protection Bundle', emoji: '🛡️', ingredients: [{id: 'protection_stone', qty: 2}, {id: 'streak_shield', qty: 1}], result: {type: 'item', id: 'protection_stone', qty: 5}, desc: '2 Protection + 1 Shield → 5 Protection Stone' },
    { id: 'mythic_craft', name: 'Mythic Fragment', emoji: '🌟', ingredients: [{id: 'refine_stone', qty: 10}, {id: 'mystery_box', qty: 3}], result: {type: 'item', id: 'mythic_fragment', qty: 1}, desc: '10 Refine Stone + 3 Mystery → 1 Mythic Fragment' },
    { id: 'awakening_forge', name: 'Awakening Forge', emoji: '💫', ingredients: [{id: 'mythic_fragment', qty: 5}], result: {type: 'item', id: 'awakening_crystal', qty: 1}, desc: '5 Mythic Fragment → 1 Awakening Crystal' },

    // ===== Mystery Box conversions (sink) =====
    { id: 'daily_pack', name: 'Daily Pack', emoji: '📅', ingredients: [{id: 'mystery_box', qty: 2}], result: {type: 'item', id: 'daily_doubler', qty: 1}, desc: '2 Mystery Box → 1 Daily Doubler' },
    { id: 'voucher_pack', name: 'Voucher Pack', emoji: '🎫', ingredients: [{id: 'mystery_box', qty: 3}], result: {type: 'item', id: 'tax_free_voucher', qty: 2}, desc: '3 Mystery Box → 2 Tax-Free Voucher' },
    { id: 'streak_craft', name: 'Streak Shield Craft', emoji: '🛡️', ingredients: [{id: 'mystery_box', qty: 3}], result: {type: 'item', id: 'streak_shield', qty: 1}, desc: '3 Mystery Box → 1 Streak Shield' },
    { id: 'spin_bundle', name: 'Spin Bundle', emoji: '🎰', ingredients: [{id: 'mystery_box', qty: 4}], result: {type: 'item', id: 'lucky_spin_token', qty: 2}, desc: '4 Mystery Box → 2 Lucky Spin Token' },
    { id: 'money_press', name: 'Money Press', emoji: '🪙', ingredients: [{id: 'mystery_box', qty: 5}], result: {type: 'money', amount: 8000}, desc: '5 Mystery Box → 🪙 8.000' },

    // ===== Fishing anti-monster =====
    { id: 'monster_combo', name: 'Thunder Coating (Repel)', emoji: '⚡', ingredients: [{id: 'monster_repellent', qty: 2}], result: {type: 'item', id: 'thunder_coating', qty: 1}, desc: '2 Monster Repellent → 1 Thunder Coating' },
    { id: 'shield_combo', name: 'Thunder Coating (Shield)', emoji: '⚡', ingredients: [{id: 'shield_charm', qty: 3}], result: {type: 'item', id: 'thunder_coating', qty: 1}, desc: '3 Shield Charm → 1 Thunder Coating' },
    { id: 'rod_salvage', name: 'Rod Salvage', emoji: '🔧', ingredients: [{id: 'rod_part', qty: 5}], result: {type: 'money', amount: 6000}, desc: '5 Rod Parts → 🪙 6.000' },

    // ===== Farming =====
    { id: 'pest_shield_craft', name: 'Pestisida Shield Craft', emoji: '🌿', ingredients: [{id: 'pesticide', qty: 3}], result: {type: 'item', id: 'pesticide_shield', qty: 1}, desc: '3 Pestisida → 1 Pestisida Shield' },
];

const COOKING_RECIPES = [
    { id: 'cooked_pancake', name: 'Cooked Pancake', emoji: '🥞', ingredients: [{id: 'gandum', qty: 2}, {id: 'egg_normal', qty: 1}, {id: 'milk_normal', qty: 1}], desc: 'Pulihkan 100% laper & seneng pet' },
    { id: 'spicy_fish_soup', name: 'Spicy Fish Soup', emoji: '🍜', ingredients: [{id: 'rare_fish', qty: 1}, {id: 'cabai', qty: 2}, {id: 'bawang_putih', qty: 2}], desc: 'Buff pet ATK +10% selama 1 jam' },
    { id: 'veggie_salad', name: 'Veggie Salad', emoji: '🥗', ingredients: [{id: 'wortel', qty: 3}, {id: 'kentang', qty: 2}], desc: 'Lindungi farm dari hama selama 6 jam' },
    { id: 'grilled_fish', name: 'Grilled Fish', emoji: '🐟', ingredients: [{id: 'common_fish', qty: 2}, {id: 'cabai', qty: 2}, {id: 'bawang_merah', qty: 1}], desc: 'Buff mancing: +15% Rare Fish chance (1 jam)' },
    { id: 'sushi_roll', name: 'Sushi Roll', emoji: '🍣', ingredients: [{id: 'tuna', qty: 1}, {id: 'gandum', qty: 3}, {id: 'madu', qty: 1}], desc: 'Buff pet: ATK & DEF +15% (1 jam)' },
    { id: 'seafood_paella', name: 'Seafood Paella', emoji: '🍛', ingredients: [{id: 'rare_fish', qty: 1}, {id: 'gandum', qty: 3}, {id: 'tomat', qty: 2}, {id: 'egg_normal', qty: 1}], desc: 'Buff booster: +50% money magnet (1 jam)' },
    { id: 'abyssal_stew', name: 'Abyssal Stew', emoji: '🥣', ingredients: [{id: 'abyss_angler', qty: 1}, {id: 'mystic_herb', qty: 1}, {id: 'crystal_flower', qty: 1}], desc: 'Booster: Double Player & Pet XP (1 jam)' },
    { id: 'fisherman_feast', name: 'Fisherman\'s Feast', emoji: '🍤', ingredients: [{id: 'belut', qty: 2}, {id: 'kentang', qty: 3}, {id: 'bawang_putih', qty: 2}], desc: 'Buff mancing: Cooldown -3s (1 jam)' }
];

module.exports = { ITEMS, CRAFT_RECIPES, COOKING_RECIPES };
