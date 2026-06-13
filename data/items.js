const ITEMS = [
    { id: 'xp_booster_2x', name: 'XP Booster 2x', emoji: '<:XPBooster2x:1510785824512413716>', menuEmoji: '⚡', desc: 'Double XP sementara (1 jam)', price: 6000, category: 'Booster' },
    { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '<:XPBooster3x:1510785750134816878>', menuEmoji: '⚡', desc: 'Triple XP sementara (1 jam)', price: 15000, category: 'Booster' },
    { id: 'streak_shield', name: 'Streak Shield', emoji: '<:streak_shield:1514052705662795878>', menuEmoji: '🛡️', desc: 'OTOMATIS lindungi streak jika skip 1 hari', price: 12000, category: 'Proteksi' },
    { id: 'lucky_charm', name: 'Lucky Charm', emoji: '<:LuckyCharm:1510785822713184376>', menuEmoji: '🍀', desc: '+15% chance menang semua game', price: 25000, category: 'Luck' },
    { id: 'money_magnet', name: 'Money Magnet', emoji: '<:MoneyMagnet:1510785821123281079>', menuEmoji: '🧲', desc: '+50% money dari semua sumber (1 jam)', price: 20000, category: 'Booster' },
    { id: 'daily_doubler', name: 'Daily Doubler', emoji: '<:daily_doubler:1514053228008833024>', menuEmoji: '📅', desc: 'Gandakan /daily reward (sekali pakai)', price: 5000, category: 'Economy' },
    { id: 'tax_free_voucher', name: 'Tax-Free Voucher', emoji: '<:TaxFreeVoucher:1510785819030454343>', menuEmoji: '🎫', desc: 'Gift tanpa pajak (sekali pakai)', price: 4000, category: 'Economy' },
    { id: 'lucky_spin_token', name: 'Lucky Spin Token', emoji: '<:lucky_spin_token:1514053618242686986>', menuEmoji: '🎰', desc: 'Jamin 2 simbol sama di slot (sekali pakai)', price: 10000, category: 'Luck' },
    { id: 'mystery_box', name: 'Mystery Box', emoji: '<:MysteryBox:1510785713984110657>', menuEmoji: '📦', desc: 'Random 50-2000 money', price: 2000, category: 'Special' },
    // Refine Stone is NOT buyable (price 0) — drop-only: dungeon/boss (loot) & expedition/hunt (random).
    { id: 'refine_stone', name: 'Refine Stone', emoji: '<:RefineStone:1510785817688412170>', menuEmoji: '🪨', desc: 'Material upgrade relic (+1) — HANYA dari dungeon/boss/expedition/hunt', price: 0, category: 'Battle' },
    // Protection Stone is NOT buyable (price 0) — drop-only: dungeon/boss & expedition.
    { id: 'protection_stone', name: 'Protection Stone', emoji: '<:protection_stone:1514052909946372188>', menuEmoji: '🛡️', desc: 'Refine gagal tidak turun level — HANYA dari dungeon/boss/expedition', price: 0, category: 'Battle' },
    { id: 'auto_harvest_pass', name: 'Auto-Harvest Pass', emoji: '<:AutoHarvestPass:1510785815889055775>', menuEmoji: '🔔', desc: 'Aktifkan notifikasi panen otomatis (permanen)', price: 15000, category: 'Special' },
    // Rod Parts is NOT buyable (price 0) — drop-only: mancing/monster/combo, expedition & pet hunt.
    { id: 'rod_part', name: 'Rod Parts', emoji: '<:RodParts:1510785813741441126>', menuEmoji: '🔧', desc: 'Material upgrade joran — HANYA dari mancing/expedition/hunt', price: 0, category: 'Fishing' },
    // Anti-Monster Items (Fishing)
    { id: 'monster_repellent', name: 'Monster Repellent', emoji: '🧪', menuEmoji: '🧪', desc: 'Kurangi monster chance -50% selama 5 cast', price: 20000, category: 'Fishing' },
    { id: 'shield_charm', name: 'Shield Charm', emoji: '<:shield_charm:1514054147975151676>', menuEmoji: '🛡️', desc: 'Block 1 serangan monster (otomatis, habis pakai)', price: 12000, category: 'Fishing' },
    { id: 'thunder_coating', name: 'Thunder Rod Coating', emoji: '<:thunder_coating:1514055302322983132>', menuEmoji: '⚡', desc: 'Monster langsung kabur + DROP loot! (3 cast)', price: 50000, category: 'Fishing' },
    // Farming - Pesticide items (1 per use, player pilih plot mana)
    { id: 'pesticide', name: 'Pestisida', emoji: '<:pesticide:1514055310208401469>', menuEmoji: '🧴', desc: 'Basmi 1 hama di 1 plot — pilih yang mau diselamatkan (sekali pakai)', price: 2000, category: 'Farming' },
    { id: 'premium_feed', name: 'Pakan Premium', emoji: '⭐', menuEmoji: '⭐', desc: 'Material untuk evolve hewan ternak', price: 1200, category: 'Farming' },
    { id: 'pesticide_shield', name: 'Pestisida Shield', emoji: '<:pesticide_shield:1514055510058602618>', menuEmoji: '🌿', desc: 'Preventif — lindungi farm dari hama selama 6 jam (sekali pakai)', price: 8000, category: 'Farming' },
    // Awakening materials (not buyable)
    { id: 'mythic_fragment', name: 'Mythic Fragment', emoji: '<:mythic_fragment:1514055768733909064>', menuEmoji: '🌟', desc: 'Material langka Awakening (World Boss/Expedition)', price: 0, category: 'Special' },
    { id: 'awakening_crystal', name: 'Awakening Crystal', emoji: '💫', menuEmoji: '💫', desc: 'Material ultra-langka Awakening (World Boss #1)', price: 0, category: 'Special' },
    // Pet Mutation Lab materials (drop-only)
    { id: 'dna_shard', name: 'DNA Shard', emoji: '🧬', menuEmoji: '🧬', desc: 'Material dasar Mutation Lab — drop dari dungeon/boss/co-op', price: 0, category: 'Pet' },
    { id: 'mutation_serum', name: 'Mutation Serum', emoji: '🧪', menuEmoji: '🧪', desc: 'Katalis mutation pet — drop dari dungeon co-op dan boss', price: 0, category: 'Pet' },
    { id: 'ancient_core', name: 'Ancient Core', emoji: '🔮', menuEmoji: '🔮', desc: 'Material langka untuk mutasi pet tier tinggi', price: 0, category: 'Pet' },
    { id: 'trait_stabilizer', name: 'Trait Stabilizer', emoji: '🧯', menuEmoji: '🧯', desc: '+15% peluang Mutation Lab sekali pakai', price: 0, category: 'Pet' },
];

const CRAFT_RECIPES = [
    // ===== Fishing / Booster =====
    { id: 'super_bait', name: 'Super Bait', emoji: '🎣', ingredients: [{id: 'mystery_box', qty: 2}], result: {type: 'bait', id: 'mystic_bait', qty: 5}, desc: '2 Mystery Box → 5 Mystic Bait' },
    { id: 'mega_booster', name: 'Mega Booster', emoji: '<:XPBooster3x:1510785750134816878>', ingredients: [{id: 'xp_booster_2x', qty: 3}], result: {type: 'item', id: 'xp_booster_3x', qty: 1}, desc: '3 XP Booster 2x → 1 XP Booster 3x' },
    { id: 'lucky_potion', name: 'Lucky Potion', emoji: '<:LuckyCharm:1510785822713184376>', ingredients: [{id: 'lucky_charm', qty: 2}, {id: 'mystery_box', qty: 1}], result: {type: 'item', id: 'lucky_spin_token', qty: 3}, desc: '2 Lucky Charm + 1 Mystery → 3 Lucky Spin' },
    { id: 'golden_magnet', name: 'Golden Magnet', emoji: '🧲', ingredients: [{id: 'lucky_charm', qty: 3}], result: {type: 'item', id: 'money_magnet', qty: 1}, desc: '3 Lucky Charm → 1 Money Magnet' },

    // ===== Relic materials (sink for the clutter you collect) =====
    { id: 'stone_shield', name: 'Reinforced Stone', emoji: '🛡️', ingredients: [{id: 'refine_stone', qty: 6}], result: {type: 'item', id: 'protection_stone', qty: 1}, desc: '6 Refine Stone → 1 Protection Stone' },
    { id: 'protection_bundle', name: 'Protection Bundle', emoji: '🛡️', ingredients: [{id: 'protection_stone', qty: 2}, {id: 'streak_shield', qty: 1}], result: {type: 'item', id: 'protection_stone', qty: 5}, desc: '2 Protection + 1 Shield → 5 Protection Stone' },
    { id: 'mythic_craft', name: 'Mythic Fragment', emoji: '🌟', ingredients: [{id: 'refine_stone', qty: 10}, {id: 'mystery_box', qty: 3}], result: {type: 'item', id: 'mythic_fragment', qty: 1}, desc: '10 Refine Stone + 3 Mystery → 1 Mythic Fragment' },
    { id: 'awakening_forge', name: 'Awakening Forge', emoji: '💫', ingredients: [{id: 'mythic_fragment', qty: 5}], result: {type: 'item', id: 'awakening_crystal', qty: 1}, desc: '5 Mythic Fragment → 1 Awakening Crystal' },

    // ===== Mystery Box conversions (sink) =====
    { id: 'daily_pack', name: 'Daily Pack', emoji: '<:daily_doubler:1514053228008833024>', ingredients: [{id: 'mystery_box', qty: 2}], result: {type: 'item', id: 'daily_doubler', qty: 1}, desc: '2 Mystery Box → 1 Daily Doubler' },
    { id: 'voucher_pack', name: 'Voucher Pack', emoji: '🎫', ingredients: [{id: 'mystery_box', qty: 3}], result: {type: 'item', id: 'tax_free_voucher', qty: 2}, desc: '3 Mystery Box → 2 Tax-Free Voucher' },
    { id: 'streak_craft', name: 'Streak Shield Craft', emoji: '🛡️', ingredients: [{id: 'mystery_box', qty: 3}], result: {type: 'item', id: 'streak_shield', qty: 1}, desc: '3 Mystery Box → 1 Streak Shield' },
    { id: 'spin_bundle', name: 'Spin Bundle', emoji: '<:lucky_spin_token:1514053618242686986>', ingredients: [{id: 'mystery_box', qty: 4}], result: {type: 'item', id: 'lucky_spin_token', qty: 2}, desc: '4 Mystery Box → 2 Lucky Spin Token' },
    { id: 'money_press', name: 'Money Press', emoji: '🪙', ingredients: [{id: 'mystery_box', qty: 5}], result: {type: 'money', amount: 8000}, desc: '5 Mystery Box → 🪙 8.000' },

    // ===== Fishing anti-monster =====
    { id: 'monster_combo', name: 'Thunder Coating (Repel)', emoji: '⚡', ingredients: [{id: 'monster_repellent', qty: 2}], result: {type: 'item', id: 'thunder_coating', qty: 1}, desc: '2 Monster Repellent → 1 Thunder Coating' },
    { id: 'shield_combo', name: 'Thunder Coating (Shield)', emoji: '⚡', ingredients: [{id: 'shield_charm', qty: 3}], result: {type: 'item', id: 'thunder_coating', qty: 1}, desc: '3 Shield Charm → 1 Thunder Coating' },
    { id: 'rod_salvage', name: 'Rod Salvage', emoji: '🔧', ingredients: [{id: 'rod_part', qty: 5}], result: {type: 'money', amount: 6000}, desc: '5 Rod Parts → 🪙 6.000' },

    // ===== Farming =====
    { id: 'pest_shield_craft', name: 'Pestisida Shield Craft', emoji: '<:pesticide_shield:1514055510058602618>', ingredients: [{id: 'pesticide', qty: 3}], result: {type: 'item', id: 'pesticide_shield', qty: 1}, desc: '3 Pestisida → 1 Pestisida Shield' },
];

module.exports = { ITEMS, CRAFT_RECIPES };
