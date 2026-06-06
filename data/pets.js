// data/pets.js - All pet-related data constants
const PET_DATA = [
    // COMMON (25 pets)
    { id: 'cat', name: 'Kucing', emoji: '🐱', tier: 'Common', price: 1000, bonus: { type: 'money_chat', value: 3 } },
    { id: 'dog', name: 'Anjing', emoji: '🐶', tier: 'Common', price: 1000, bonus: { type: 'xp_chat', value: 3 } },
    { id: 'hamster', name: 'Hamster', emoji: '🐹', tier: 'Common', price: 500, bonus: { type: 'farm_yield', value: 5 } },
    { id: 'bird', name: 'Burung', emoji: '🐦', tier: 'Common', price: 500, bonus: { type: 'farm_speed', value: 3 } },
    { id: 'fish_pet', name: 'Ikan Hias', emoji: '🐠', tier: 'Common', price: 800, bonus: { type: 'fish_luck', value: 2 } },
    { id: 'turtle', name: 'Kura-kura', emoji: '🐢', tier: 'Common', price: 600, bonus: { type: 'xp_all', value: 2 } },
    { id: 'duck', name: 'Bebek', emoji: '🦆', tier: 'Common', price: 700, bonus: { type: 'money_all', value: 2 } },
    { id: 'chick', name: 'Anak Ayam', emoji: '🐤', tier: 'Common', price: 400, bonus: { type: 'quest_reward', value: 3 } },
    { id: 'frog', name: 'Kodok', emoji: '🐸', tier: 'Common', price: 500, bonus: { type: 'event_luck', value: 3 } },
    { id: 'mouse', name: 'Tikus Putih', emoji: '🐭', tier: 'Common', price: 400, bonus: { type: 'money_chat', value: 2 } },
    { id: 'rabbit_small', name: 'Kelinci Kecil', emoji: '🐇', tier: 'Common', price: 800, bonus: { type: 'xp_chat', value: 2 } },
    { id: 'snail', name: 'Siput', emoji: '🐌', tier: 'Common', price: 300, bonus: { type: 'farm_yield', value: 3 } },
    { id: 'ladybug', name: 'Kumbang', emoji: '🐞', tier: 'Common', price: 300, bonus: { type: 'farm_speed', value: 2 } },
    { id: 'ant', name: 'Semut Pekerja', emoji: '🐜', tier: 'Common', price: 200, bonus: { type: 'xp_all', value: 1 } },
    { id: 'bee', name: 'Lebah', emoji: '🐝', tier: 'Common', price: 600, bonus: { type: 'farm_yield', value: 4 } },
    { id: 'butterfly_pet', name: 'Kupu-kupu', emoji: '🦋', tier: 'Common', price: 700, bonus: { type: 'quest_reward', value: 2 } },
    { id: 'hedgehog', name: 'Landak', emoji: '🦔', tier: 'Common', price: 800, bonus: { type: 'money_all', value: 2 } },
    { id: 'squirrel', name: 'Tupai', emoji: '🐿️', tier: 'Common', price: 600, bonus: { type: 'fish_luck', value: 2 } },
    { id: 'parrot', name: 'Burung Beo', emoji: '🦜', tier: 'Common', price: 900, bonus: { type: 'xp_chat', value: 3 } },
    { id: 'penguin_small', name: 'Penguin Kecil', emoji: '🐧', tier: 'Common', price: 800, bonus: { type: 'money_chat', value: 3 } },
    { id: 'koala', name: 'Koala', emoji: '🐨', tier: 'Common', price: 900, bonus: { type: 'xp_all', value: 2 } },
    { id: 'pig', name: 'Babi Mini', emoji: '🐷', tier: 'Common', price: 700, bonus: { type: 'money_all', value: 3 } },
    { id: 'sheep', name: 'Domba', emoji: '🐑', tier: 'Common', price: 600, bonus: { type: 'farm_yield', value: 3 } },
    { id: 'cow_mini', name: 'Sapi Mini', emoji: '🐄', tier: 'Common', price: 800, bonus: { type: 'farm_speed', value: 3 } },
    { id: 'monkey', name: 'Monyet', emoji: '🐒', tier: 'Common', price: 900, bonus: { type: 'event_luck', value: 3 } },
    // UNCOMMON (25 pets)
    { id: 'rabbit', name: 'Kelinci Anggora', emoji: '🐰', tier: 'Uncommon', price: 5000, bonus: { type: 'money_all', value: 5 } },
    { id: 'fox', name: 'Rubah', emoji: '🦊', tier: 'Uncommon', price: 8000, bonus: { type: 'xp_all', value: 5 } },
    { id: 'owl', name: 'Burung Hantu', emoji: '🦉', tier: 'Uncommon', price: 7000, bonus: { type: 'quest_reward', value: 8 } },
    { id: 'otter', name: 'Berang-berang', emoji: '🦦', tier: 'Uncommon', price: 6000, bonus: { type: 'fish_luck', value: 5 } },
    { id: 'deer', name: 'Rusa', emoji: '🦌', tier: 'Uncommon', price: 7000, bonus: { type: 'farm_speed', value: 7 } },
    { id: 'raccoon', name: 'Rakun', emoji: '🦝', tier: 'Uncommon', price: 6000, bonus: { type: 'money_chat', value: 6 } },
    { id: 'flamingo', name: 'Flamingo', emoji: '🦩', tier: 'Uncommon', price: 8000, bonus: { type: 'xp_chat', value: 6 } },
    { id: 'swan', name: 'Angsa', emoji: '🦢', tier: 'Uncommon', price: 7000, bonus: { type: 'money_all', value: 5 } },
    { id: 'peacock', name: 'Merak', emoji: '🦚', tier: 'Uncommon', price: 9000, bonus: { type: 'xp_all', value: 6 } },
    { id: 'dolphin', name: 'Lumba-lumba', emoji: '🐬', tier: 'Uncommon', price: 10000, bonus: { type: 'fish_luck', value: 7 } },
    { id: 'seal', name: 'Anjing Laut', emoji: '🦭', tier: 'Uncommon', price: 8000, bonus: { type: 'fish_luck', value: 6 } },
    { id: 'eagle', name: 'Elang', emoji: '🦅', tier: 'Uncommon', price: 9000, bonus: { type: 'event_luck', value: 7 } },
    { id: 'wolf_pup', name: 'Anak Serigala', emoji: '🐺', tier: 'Uncommon', price: 10000, bonus: { type: 'xp_all', value: 6 } },
    { id: 'panda_red', name: 'Panda Merah', emoji: '🐾', tier: 'Uncommon', price: 12000, bonus: { type: 'money_all', value: 6 } },
    { id: 'chameleon', name: 'Bunglon', emoji: '🦎', tier: 'Uncommon', price: 6000, bonus: { type: 'event_luck', value: 5 } },
    { id: 'axolotl', name: 'Axolotl', emoji: '🪷', tier: 'Uncommon', price: 10000, bonus: { type: 'fish_luck', value: 7 } },
    { id: 'jellyfish', name: 'Ubur-ubur', emoji: '🪼', tier: 'Uncommon', price: 7000, bonus: { type: 'fish_luck', value: 5 } },
    { id: 'bat', name: 'Kelelawar', emoji: '🦇', tier: 'Uncommon', price: 5000, bonus: { type: 'xp_chat', value: 5 } },
    { id: 'crane', name: 'Bangau', emoji: '🦩', tier: 'Uncommon', price: 8000, bonus: { type: 'farm_yield', value: 7 } },
    { id: 'husky', name: 'Husky', emoji: '🐕', tier: 'Uncommon', price: 9000, bonus: { type: 'xp_all', value: 5 } },
    { id: 'corgi', name: 'Corgi', emoji: '🐕', tier: 'Uncommon', price: 10000, bonus: { type: 'money_chat', value: 7 } },
    { id: 'cat_persian', name: 'Kucing Persia', emoji: '🐈', tier: 'Uncommon', price: 8000, bonus: { type: 'money_all', value: 5 } },
    { id: 'cat_siamese', name: 'Kucing Siam', emoji: '🐈‍⬛', tier: 'Uncommon', price: 9000, bonus: { type: 'xp_all', value: 5 } },
    { id: 'horse_mini', name: 'Kuda Poni', emoji: '🐴', tier: 'Uncommon', price: 11000, bonus: { type: 'farm_speed', value: 8 } },
    { id: 'goat', name: 'Kambing Gunung', emoji: '🐐', tier: 'Uncommon', price: 7000, bonus: { type: 'farm_yield', value: 6 } },

    // RARE (20 pets)
    { id: 'panda', name: 'Panda Giant', emoji: '<:PandaGiant:1512268123582234704>', tier: 'Rare', price: 20000, bonus: { type: 'money_xp', value: 8 } },
    { id: 'arctic_fox', name: 'Arctic Fox', emoji: '<:ArcticFox:1512268487744290876>', tier: 'Rare', price: 30000, bonus: { type: 'fish_luck', value: 10 } },
    { id: 'baby_dragon', name: 'Baby Dragon', emoji: '<:BabyDragon:1512267621511331881>', tier: 'Rare', price: 50000, bonus: { type: 'xp_all', value: 10 } },
    { id: 'unicorn', name: 'Unicorn', emoji: '<:Unicorn:1512267233231900802>', tier: 'Rare', price: 40000, bonus: { type: 'all_reward', value: 10 } },
    { id: 'snow_leopard', name: 'Snow Leopard', emoji: '<:SnowLeopard:1512267244638500290>', tier: 'Rare', price: 35000, bonus: { type: 'money_all', value: 10 } },
    { id: 'white_tiger', name: 'White Tiger', emoji: '<:WhiteTiger:1512268915475091536>', tier: 'Rare', price: 45000, bonus: { type: 'event_luck', value: 12 } },
    { id: 'golden_eagle', name: 'Golden Eagle', emoji: '<:GoldenEagle:1512269467250903230>', tier: 'Rare', price: 30000, bonus: { type: 'xp_all', value: 9 } },
    { id: 'crystal_deer', name: 'Crystal Deer', emoji: '<:CrystalDeer:1512269603106193468>', tier: 'Rare', price: 35000, bonus: { type: 'farm_yield', value: 12 } },
    { id: 'shadow_wolf', name: 'Shadow Wolf', emoji: '<:ShadowWolf:1512269804533321809>', tier: 'Rare', price: 40000, bonus: { type: 'money_all', value: 9 } },
    { id: 'moon_rabbit', name: 'Moon Rabbit', emoji: '<:MoonRabbit:1512270308541857973>', tier: 'Rare', price: 30000, bonus: { type: 'quest_reward', value: 12 } },
    { id: 'fire_fox', name: 'Fire Fox', emoji: '<:FireFox:1512271032726196334>', tier: 'Rare', price: 45000, bonus: { type: 'xp_all', value: 10 } },
    { id: 'spirit_owl', name: 'Spirit Owl', emoji: '<:SpiritOwl:1512271762451075112>', tier: 'Rare', price: 35000, bonus: { type: 'quest_reward', value: 10 } },
    { id: 'jade_turtle', name: 'Jade Turtle', emoji: '<:JadeTurtle:1512270966112260166>', tier: 'Rare', price: 25000, bonus: { type: 'farm_speed', value: 12 } },
    { id: 'storm_hawk', name: 'Storm Hawk', emoji: '<:StormHawk:1512271840188434520>', tier: 'Rare', price: 40000, bonus: { type: 'event_luck', value: 10 } },
    { id: 'ocean_horse', name: 'Kuda Laut Raksasa', emoji: '<:KudaLautRaksasa:1512271865958234240>', tier: 'Rare', price: 35000, bonus: { type: 'fish_luck', value: 12 } },
    { id: 'sakura_cat', name: 'Sakura Cat', emoji: '<:SakuraCat:1512271891077927013>', tier: 'Rare', price: 30000, bonus: { type: 'money_xp', value: 8 } },
    { id: 'thunder_hound', name: 'Thunder Hound', emoji: '<:ThunderHound:1512272355542437898>', tier: 'Rare', price: 40000, bonus: { type: 'xp_all', value: 10 } },
    { id: 'frost_bear', name: 'Frost Bear', emoji: '<:FrostBear:1512272960617058454>', tier: 'Rare', price: 45000, bonus: { type: 'money_all', value: 10 } },
    { id: 'vine_snake', name: 'Vine Snake', emoji: '<:VineSnake:1512272969982144808>', tier: 'Rare', price: 25000, bonus: { type: 'farm_yield', value: 10 } },
    { id: 'ember_cat', name: 'Ember Cat', emoji: '<:EmberCat:1512273262871318680>', tier: 'Rare', price: 35000, bonus: { type: 'money_chat', value: 10 } },
    // EPIC (15 pets)
    { id: 'phoenix', name: 'Phoenix', emoji: '🔥', tier: 'Epic', price: 100000, bonus: { type: 'xp_all', value: 12 } },
    { id: 'ice_wolf', name: 'Ice Wolf', emoji: '❄️', tier: 'Epic', price: 120000, bonus: { type: 'money_all', value: 12 } },
    { id: 'thunder_tiger', name: 'Thunder Tiger', emoji: '⚡', tier: 'Epic', price: 150000, bonus: { type: 'event_luck', value: 15 } },
    { id: 'spirit_deer', name: 'Spirit Deer', emoji: '🌸', tier: 'Epic', price: 100000, bonus: { type: 'farm_speed', value: 15 } },
    { id: 'shadow_panther', name: 'Shadow Panther', emoji: '🐆', tier: 'Epic', price: 130000, bonus: { type: 'money_all', value: 13 } },
    { id: 'celestial_crane', name: 'Celestial Crane', emoji: '🕊️', tier: 'Epic', price: 110000, bonus: { type: 'xp_all', value: 13 } },
    { id: 'lava_salamander', name: 'Lava Salamander', emoji: '🦎', tier: 'Epic', price: 120000, bonus: { type: 'farm_yield', value: 15 } },
    { id: 'ocean_leviathan', name: 'Ocean Leviathan', emoji: '🐋', tier: 'Epic', price: 140000, bonus: { type: 'fish_luck', value: 15 } },
    { id: 'storm_dragon', name: 'Storm Dragon', emoji: '🐲', tier: 'Epic', price: 180000, bonus: { type: 'all_reward', value: 12 } },
    { id: 'crystal_phoenix', name: 'Crystal Phoenix', emoji: '💎', tier: 'Epic', price: 160000, bonus: { type: 'xp_all', value: 15 } },
    { id: 'void_serpent', name: 'Void Serpent', emoji: '🐍', tier: 'Epic', price: 150000, bonus: { type: 'event_luck', value: 14 } },
    { id: 'aurora_wolf', name: 'Aurora Wolf', emoji: '🌌', tier: 'Epic', price: 140000, bonus: { type: 'money_all', value: 14 } },
    { id: 'golden_kirin', name: 'Golden Kirin', emoji: '🦄', tier: 'Epic', price: 170000, bonus: { type: 'all_reward', value: 13 } },
    { id: 'nightmare_horse', name: 'Nightmare Horse', emoji: '🐴', tier: 'Epic', price: 130000, bonus: { type: 'xp_all', value: 14 } },
    { id: 'ancient_tortoise', name: 'Ancient Tortoise', emoji: '🐢', tier: 'Epic', price: 100000, bonus: { type: 'farm_speed', value: 18 } },
    // LEGENDARY (10 pets - NOT sold, only from eggs)
    { id: 'golden_dragon', name: 'Golden Dragon', emoji: '🐲', tier: 'Legendary', price: 0, bonus: { type: 'all_reward', value: 20 } },
    { id: 'celestial_butterfly', name: 'Celestial Butterfly', emoji: '🦋', tier: 'Legendary', price: 0, bonus: { type: 'money_xp', value: 15 } },
    { id: 'void_cat', name: 'Void Cat', emoji: '🐈‍⬛', tier: 'Legendary', price: 0, bonus: { type: 'money_all', value: 18 } },
    { id: 'cosmic_whale', name: 'Cosmic Whale', emoji: '🐳', tier: 'Legendary', price: 0, bonus: { type: 'fish_luck', value: 20 } },
    { id: 'divine_phoenix', name: 'Divine Phoenix', emoji: '🔥', tier: 'Legendary', price: 0, bonus: { type: 'xp_all', value: 20 } },
    { id: 'nature_spirit', name: 'Nature Spirit', emoji: '🌿', tier: 'Legendary', price: 0, bonus: { type: 'farm_yield', value: 25 } },
    { id: 'thunder_god_bird', name: 'Thunder God Bird', emoji: '⚡', tier: 'Legendary', price: 0, bonus: { type: 'event_luck', value: 20 } },
    { id: 'diamond_wolf', name: 'Diamond Wolf', emoji: '💎', tier: 'Legendary', price: 0, bonus: { type: 'money_all', value: 20 } },
    { id: 'eternal_serpent', name: 'Eternal Serpent', emoji: '🐍', tier: 'Legendary', price: 0, bonus: { type: 'all_reward', value: 18 } },
    { id: 'galaxy_horse', name: 'Galaxy Horse', emoji: '🌌', tier: 'Legendary', price: 0, bonus: { type: 'xp_all', value: 18 } },
    // MYTHIC (8 pets - EXTREMELY rare from eggs only)
    { id: 'world_tree_spirit', name: 'World Tree Spirit', emoji: '🌳', tier: 'Mythic', price: 0, bonus: { type: 'all_reward', value: 25 } },
    { id: 'time_dragon', name: 'Time Dragon', emoji: '⌛', tier: 'Mythic', price: 0, bonus: { type: 'all_reward', value: 25 } },
    { id: 'god_cat', name: 'God Cat (Bastet)', emoji: '👑', tier: 'Mythic', price: 0, bonus: { type: 'money_all', value: 25 } },
    { id: 'fenrir', name: 'Fenrir', emoji: '🐺', tier: 'Mythic', price: 0, bonus: { type: 'xp_all', value: 25 } },
    { id: 'quetzalcoatl', name: 'Quetzalcoatl', emoji: '🐉', tier: 'Mythic', price: 0, bonus: { type: 'all_reward', value: 25 } },
    { id: 'nine_tails', name: 'Nine-Tailed Fox', emoji: '🦊', tier: 'Mythic', price: 0, bonus: { type: 'event_luck', value: 25 } },
    { id: 'cerberus', name: 'Cerberus', emoji: '🐕', tier: 'Mythic', price: 0, bonus: { type: 'money_all', value: 25 } },
    { id: 'leviathan_pet', name: 'Leviathan', emoji: '🐋', tier: 'Mythic', price: 0, bonus: { type: 'fish_luck', value: 30 } },
    // SECRET (5 pets — ultra rare, only from Mythic Egg jackpot)
    { id: 'shadow_monarch', name: 'Shadow Monarch', emoji: '👤', tier: 'Secret', price: 0, bonus: { type: 'all_reward', value: 35 } },
    { id: 'astral_serpent', name: 'Astral Serpent', emoji: '🌌', tier: 'Secret', price: 0, bonus: { type: 'all_reward', value: 35 } },
    { id: 'chrono_phoenix', name: 'Chrono Phoenix', emoji: '🦅', tier: 'Secret', price: 0, bonus: { type: 'xp_all', value: 40 } },
    { id: 'abyss_kraken', name: 'Abyss Kraken', emoji: '🦑', tier: 'Secret', price: 0, bonus: { type: 'fish_luck', value: 45 } },
    { id: 'prism_unicorn', name: 'Prism Unicorn', emoji: '🦄', tier: 'Secret', price: 0, bonus: { type: 'money_all', value: 40 } },
    // GOD (3 pets — the absolute rarest, near-impossible jackpot)
    { id: 'creator_dragon', name: 'Creator Dragon', emoji: '🐉', tier: 'God', price: 0, bonus: { type: 'all_reward', value: 60 } },
    { id: 'cosmic_deity', name: 'Cosmic Deity', emoji: '✨', tier: 'God', price: 0, bonus: { type: 'all_reward', value: 60 } },
    { id: 'omega_god', name: 'Omega (The All)', emoji: '🌠', tier: 'God', price: 0, bonus: { type: 'all_reward', value: 75 } }
];

const PET_FOODS = [
    { id: 'snack', name: 'Snack Biasa', emoji: '🍖', price: 30, hunger: 15, happiness: 5 },
    { id: 'premium_meat', name: 'Daging Premium', emoji: '🥩', price: 100, hunger: 30, happiness: 10 },
    { id: 'cake', name: 'Kue Spesial', emoji: '🎂', price: 200, hunger: 20, happiness: 25 },
    { id: 'feast', name: 'Feast Mewah', emoji: '🍗', price: 500, hunger: 50, happiness: 30 },
    { id: 'mythic_food', name: 'Makanan Mitik', emoji: '⭐', price: 1500, hunger: 100, happiness: 50 }
];

const PET_EGGS = [
    { id: 'common_egg', name: 'Common Egg', emoji: '🥚', price: 2000, rates: { Common: 60, Uncommon: 30, Rare: 10 } },
    { id: 'rare_egg', name: 'Rare Egg', emoji: '🥚', price: 10000, rates: { Uncommon: 35, Rare: 40, Epic: 20, Legendary: 5 } },
    { id: 'legendary_egg', name: 'Legendary Egg', emoji: '🥚', price: 50000, rates: { Rare: 25, Epic: 40, Legendary: 25, Mythic: 10 } },
    { id: 'mythic_egg', name: 'Mythic Egg', emoji: '🌟', price: 150000, rates: { Epic: 28, Legendary: 45, Mythic: 25, Secret: 2 } },
    { id: 'celestial_egg', name: 'Celestial Egg', emoji: '🌌', price: 500000, rates: { Legendary: 40, Mythic: 45, Secret: 14, God: 1 } }
];

const PET_CLASSES = ['warrior', 'tank', 'mage', 'ranger', 'healer'];
const PET_ELEMENTS = ['fire', 'water', 'nature', 'electric', 'dark', 'light'];
const ELEMENT_ADVANTAGE = { fire: 'nature', water: 'fire', nature: 'water', electric: 'water', dark: 'light', light: 'dark' };

const PET_EVOLUTIONS = [
    { from: 'cat', to: 'cat_persian', level: 20, name: 'Kucing → Kucing Persia' },
    { from: 'dog', to: 'husky', level: 20, name: 'Anjing → Husky' },
    { from: 'bird', to: 'eagle', level: 20, name: 'Burung → Elang' },
    { from: 'fish_pet', to: 'dolphin', level: 20, name: 'Ikan Hias → Lumba-lumba' },
    { from: 'rabbit_small', to: 'rabbit', level: 20, name: 'Kelinci Kecil → Kelinci Anggora' },
    { from: 'fox', to: 'arctic_fox', level: 20, name: 'Rubah → Arctic Fox' },
    { from: 'monkey', to: 'raccoon', level: 20, name: 'Monyet → Rakun' },
    { from: 'parrot', to: 'flamingo', level: 20, name: 'Burung Beo → Flamingo' },
    { from: 'wolf_pup', to: 'shadow_wolf', level: 50, name: 'Anak Serigala → Shadow Wolf' },
    { from: 'owl', to: 'spirit_owl', level: 50, name: 'Burung Hantu → Spirit Owl' },
    { from: 'otter', to: 'ocean_horse', level: 50, name: 'Berang-berang → Kuda Laut Raksasa' },
    { from: 'deer', to: 'crystal_deer', level: 50, name: 'Rusa → Crystal Deer' },
    { from: 'peacock', to: 'golden_eagle', level: 50, name: 'Merak → Golden Eagle' },
    { from: 'dolphin', to: 'arctic_fox', level: 50, name: 'Lumba-lumba → Arctic Fox' },
    { from: 'baby_dragon', to: 'storm_dragon', level: 100, name: 'Baby Dragon → Storm Dragon' },
    { from: 'unicorn', to: 'golden_kirin', level: 100, name: 'Unicorn → Golden Kirin' },
    { from: 'snow_leopard', to: 'shadow_panther', level: 100, name: 'Snow Leopard → Shadow Panther' },
    { from: 'fire_fox', to: 'phoenix', level: 100, name: 'Fire Fox → Phoenix' },
    { from: 'shadow_wolf', to: 'ice_wolf', level: 100, name: 'Shadow Wolf → Ice Wolf' },
    { from: 'frost_bear', to: 'aurora_wolf', level: 100, name: 'Frost Bear → Aurora Wolf' },
    { from: 'phoenix', to: 'divine_phoenix', level: 150, name: 'Phoenix → Divine Phoenix' },
    { from: 'storm_dragon', to: 'golden_dragon', level: 150, name: 'Storm Dragon → Golden Dragon' },
    { from: 'ice_wolf', to: 'diamond_wolf', level: 150, name: 'Ice Wolf → Diamond Wolf' },
    { from: 'ocean_leviathan', to: 'cosmic_whale', level: 150, name: 'Ocean Leviathan → Cosmic Whale' },
];

const PET_SKILL_MILESTONES = [
    { level: 20, skill: { type: 'money_all', value: 2, name: '+2% Money' } },
    { level: 50, skill: { type: 'xp_all', value: 2, name: '+2% XP' } },
    { level: 100, skill: { type: 'fish_luck', value: 3, name: '+3% Fish Luck' } },
    { level: 200, skill: { type: 'farm_yield', value: 5, name: '+5% Farm' } }
];

const PET_LEVEL_MULTIPLIERS = [1.0, 1.0, 1.0, 1.0, 1.0, 1.2, 1.2, 1.2, 1.2, 1.2, 1.5, 1.5, 1.5, 1.5, 1.5, 1.8, 1.8, 1.8, 1.8, 1.8, 2.0, 2.0, 2.0, 2.0, 2.0, 2.5, 2.5, 2.5, 2.5, 2.5, 3.0];

const RELIC_NAMES = {
    weapon: ['Rusty Sword', 'Iron Blade', 'Fire Sword', 'Crystal Dagger', 'Shadow Blade', 'Void Katana', 'Divine Axe', 'Thunder Lance'],
    armor: ['Leather Armor', 'Iron Shield', 'Crystal Armor', 'Shadow Cloak', 'Void Barrier', 'Divine Plate'],
    accessory: ['Speed Ring', 'Crit Necklace', 'Power Gem', 'Shadow Pendant', 'Void Orb', 'Divine Crown']
};

const PET_SKILLS = [
    // Tier 1 (unlocked at pet level 10)
    { id: 'power_strike', name: 'Power Strike', emoji: '⚔️', tier: 1, level: 10, type: 'attack', multiplier: 2.0, cooldown: 3, desc: 'Serangan 2x damage' },
    { id: 'shield_wall', name: 'Shield Wall', emoji: '🛡️', tier: 1, level: 10, type: 'defense', reduction: 0.5, cooldown: 4, desc: 'Kurangi damage 50% selama 1 turn' },
    { id: 'quick_heal', name: 'Quick Heal', emoji: '💚', tier: 1, level: 10, type: 'heal', amount: 0.2, cooldown: 5, desc: 'Heal 20% max HP' },

    // Tier 2 (unlocked at pet level 30)
    { id: 'critical_surge', name: 'Critical Surge', emoji: '🎯', tier: 2, level: 30, type: 'buff', critBonus: 30, duration: 3, cooldown: 5, desc: '+30% crit rate selama 3 turn' },
    { id: 'elemental_blast', name: 'Elemental Blast', emoji: '🌊', tier: 2, level: 30, type: 'attack', multiplier: 2.5, cooldown: 4, desc: 'Serangan elemen 2.5x (bonus jika advantage)' },
    { id: 'life_drain', name: 'Life Drain', emoji: '🧛', tier: 2, level: 30, type: 'drain', multiplier: 1.5, healRatio: 0.5, cooldown: 4, desc: 'Serang 1.5x + heal 50% dari damage' },

    // Tier 3 (unlocked at pet level 60)
    { id: 'berserk', name: 'Berserk', emoji: '😡', tier: 3, level: 60, type: 'buff', atkBonus: 50, defPenalty: 30, duration: 3, cooldown: 6, desc: '+50% ATK tapi -30% DEF (3 turn)' },
    { id: 'iron_fortress', name: 'Iron Fortress', emoji: '🏰', tier: 3, level: 60, type: 'defense', reduction: 0.8, duration: 2, cooldown: 7, desc: 'Hampir tak tertembus (80% reduction, 2 turn)' },
    { id: 'resurrection', name: 'Resurrection', emoji: '✨', tier: 3, level: 60, type: 'revive', hpRestore: 0.3, cooldown: 10, desc: 'Jika HP 0, bangkit dengan 30% HP (1x per battle)' },

    // Tier 4 (unlocked at pet level 100)
    { id: 'ultimate_strike', name: 'Ultimate Strike', emoji: '💥', tier: 4, level: 100, type: 'attack', multiplier: 4.0, cooldown: 8, desc: 'Serangan ULTIMATE 4x damage!' },
    { id: 'divine_shield', name: 'Divine Shield', emoji: '✝️', tier: 4, level: 100, type: 'immune', duration: 1, cooldown: 10, desc: 'Kebal damage selama 1 turn' },
    { id: 'omega_heal', name: 'Omega Heal', emoji: '💖', tier: 4, level: 100, type: 'heal', amount: 0.5, cooldown: 8, desc: 'Heal 50% max HP' },
];

module.exports = { PET_DATA, PET_FOODS, PET_EGGS, PET_CLASSES, PET_ELEMENTS, PET_EVOLUTIONS, ELEMENT_ADVANTAGE, PET_SKILL_MILESTONES, PET_LEVEL_MULTIPLIERS, RELIC_NAMES, PET_SKILLS };
