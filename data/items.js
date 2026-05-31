const ITEMS = [
    { id: 'xp_booster_2x', name: 'XP Booster 2x', emoji: '⚡', desc: 'Double XP sementara (1 jam)', price: 3000, category: 'Booster' },
    { id: 'xp_booster_3x', name: 'XP Booster 3x', emoji: '⚡', desc: 'Triple XP sementara (1 jam)', price: 7000, category: 'Booster' },
    { id: 'streak_shield', name: 'Streak Shield', emoji: '🛡️', desc: 'OTOMATIS lindungi streak jika skip 1 hari', price: 5000, category: 'Proteksi' },
    { id: 'lucky_charm', name: 'Lucky Charm', emoji: '🍀', desc: '+15% chance menang semua game', price: 8000, category: 'Luck' },
    { id: 'money_magnet', name: 'Money Magnet', emoji: '🧲', desc: '+50% money dari semua sumber (1 jam)', price: 6000, category: 'Booster' },
    { id: 'daily_doubler', name: 'Daily Doubler', emoji: '📅', desc: 'Gandakan /daily reward (sekali pakai)', price: 2000, category: 'Economy' },
    { id: 'tax_free_voucher', name: 'Tax-Free Voucher', emoji: '🧾', desc: 'Gift tanpa pajak (sekali pakai)', price: 1500, category: 'Economy' },
    { id: 'lucky_spin_token', name: 'Lucky Spin Token', emoji: '🎫', desc: 'Jamin 2 simbol sama di slot (sekali pakai)', price: 4000, category: 'Luck' },
    { id: 'mystery_box', name: 'Mystery Box', emoji: '📦', desc: 'Random 50-2000 money', price: 1000, category: 'Special' },
    { id: 'refine_stone', name: 'Refine Stone', emoji: '🪨', desc: 'Material untuk upgrade relic (+1)', price: 3000, category: 'Battle' },
    { id: 'protection_stone', name: 'Protection Stone', emoji: '🛡️', desc: 'Refine gagal tidak turun level', price: 8000, category: 'Battle' },
    { id: 'auto_harvest_pass', name: 'Auto-Harvest Pass', emoji: '🔔', desc: 'Aktifkan notifikasi panen otomatis (permanen)', price: 5000, category: 'Special' },
    { id: 'rod_part', name: 'Rod Parts', emoji: '🔧', desc: 'Material upgrade joran (dari mancing/shop)', price: 5000, category: 'Fishing' },
];

const CRAFT_RECIPES = [
    { id: 'super_bait', name: 'Super Bait', emoji: '🎣', ingredients: [{id: 'mystery_box', qty: 2}], result: {type: 'bait', id: 'mythic_bait', qty: 5}, desc: '2 Mystery Box → 5 Umpan Mitik' },
    { id: 'mega_booster', name: 'Mega Booster', emoji: '⚡', ingredients: [{id: 'xp_booster_2x', qty: 3}], result: {type: 'item', id: 'xp_booster_3x', qty: 1}, desc: '3 XP Booster 2x → 1 XP Booster 3x' },
    { id: 'golden_rod_ticket', name: 'Golden Rod Upgrade', emoji: '🎫', ingredients: [{id: 'refine_stone', qty: 10}], result: {type: 'money', amount: 25000}, desc: '10 Refine Stone → 🪙 25,000' },
    { id: 'protection_bundle', name: 'Protection Bundle', emoji: '🛡️', ingredients: [{id: 'protection_stone', qty: 2}, {id: 'streak_shield', qty: 1}], result: {type: 'item', id: 'protection_stone', qty: 5}, desc: '2 Protection + 1 Shield → 5 Protection Stone' },
    { id: 'lucky_potion', name: 'Lucky Potion', emoji: '🍀', ingredients: [{id: 'lucky_charm', qty: 2}, {id: 'mystery_box', qty: 1}], result: {type: 'item', id: 'lucky_spin_token', qty: 3}, desc: '2 Lucky Charm + 1 Mystery → 3 Lucky Spin' },
];

module.exports = { ITEMS, CRAFT_RECIPES };
