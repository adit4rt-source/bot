// Dungeon & Boss data.
// reward: [min, max] base money (sebelum combo & level scaling)
// penaltyCap: batas maksimum money hilang saat kalah (lihat petPanel penalty logic)
// relicChance: peluang drop relic equipment saat menang
// relicRareBonus: true => peluang rarity tinggi (Epic/Legendary) lebih besar
// loot: daftar drop item { item, chance, min, max } (chance 1 = selalu)
const DUNGEON_TIERS = [
    { id: 'forest', name: '🌿 Hutan Pemula', minLevel: 1, waves: 3, monsterHp: [50,70,100], monsterAtk: [8,10,15], reward: [150,400], exp: 5, cooldown: 60000,
      element: 'nature',
      penaltyCap: 300, relicChance: 0,
      loot: [ { item: 'mystery_box', chance: 0.15, min: 1, max: 1 } ] },
    { id: 'cave', name: '🏔️ Gua Batu', minLevel: 10, waves: 4, monsterHp: [100,130,160,200], monsterAtk: [15,18,22,28], reward: [500,1200], exp: 10, cooldown: 90000,
      element: 'water',
      penaltyCap: 800, relicChance: 0.05,
      loot: [ { item: 'refine_stone', chance: 0.40, min: 1, max: 2 }, { item: 'mystery_box', chance: 0.15, min: 1, max: 1 } ] },
    { id: 'volcano', name: '🌋 Gunung Api', minLevel: 25, waves: 5, monsterHp: [200,250,300,350,450], monsterAtk: [25,30,35,40,50], reward: [1500,3500], exp: 18, cooldown: 120000,
      element: 'fire',
      penaltyCap: 1500, relicChance: 0.10,
      loot: [ { item: 'refine_stone', chance: 0.50, min: 1, max: 3 }, { item: 'mystery_box', chance: 0.20, min: 1, max: 1 }, { item: 'protection_stone', chance: 0.12, min: 1, max: 1 } ] },
    { id: 'castle', name: '🏰 Kastil Gelap', minLevel: 50, waves: 6, monsterHp: [400,500,600,700,800,1000], monsterAtk: [40,50,55,60,70,85], reward: [5000,11000], exp: 28, cooldown: 180000,
      element: 'dark',
      penaltyCap: 2500, relicChance: 0.18,
      loot: [ { item: 'refine_stone', chance: 0.60, min: 2, max: 3 }, { item: 'protection_stone', chance: 0.25, min: 1, max: 1 }, { item: 'mystery_box', chance: 0.20, min: 1, max: 1 }, { item: 'lucky_charm', chance: 0.10, min: 1, max: 1 } ] },
    { id: 'void', name: '🌌 Void Realm', minLevel: 100, waves: 7, monsterHp: [800,1000,1200,1400,1600,1800,2500], monsterAtk: [70,80,90,100,110,120,150], reward: [15000,32000], exp: 40, cooldown: 300000,
      element: 'dark',
      penaltyCap: 3000, relicChance: 0.28,
      loot: [ { item: 'refine_stone', chance: 0.70, min: 2, max: 4 }, { item: 'protection_stone', chance: 0.35, min: 1, max: 2 }, { item: 'lucky_charm', chance: 0.15, min: 1, max: 1 }, { item: 'money_magnet', chance: 0.10, min: 1, max: 1 }, { item: 'mythic_fragment', chance: 0.12, min: 1, max: 1 } ] }
];

const BOSS_LIST = [
    { id: 'slime_king', name: '🟢 Slime King', minLevel: 5, hp: 2000, atk: 25, def: 10, reward: [1200, 2500], exp: 30,
      element: 'nature',
      penaltyCap: 1000, relicChance: 0.30,
      loot: [ { item: 'refine_stone', chance: 1, min: 1, max: 3 }, { item: 'mystery_box', chance: 0.20, min: 1, max: 1 } ] },
    { id: 'wolf_alpha', name: '🐺 Wolf Alpha', minLevel: 10, hp: 4000, atk: 40, def: 20, reward: [2500, 5000], exp: 50,
      element: 'electric',
      penaltyCap: 1500, relicChance: 0.30,
      loot: [ { item: 'refine_stone', chance: 1, min: 1, max: 3 }, { item: 'mystery_box', chance: 0.25, min: 1, max: 1 } ] },
    { id: 'dragon', name: '🐲 Dragon Lord', minLevel: 20, hp: 8000, atk: 60, def: 30, reward: [6000, 12000], exp: 100,
      element: 'fire',
      penaltyCap: 2500, relicChance: 0.30,
      loot: [ { item: 'refine_stone', chance: 1, min: 2, max: 3 }, { item: 'protection_stone', chance: 0.20, min: 1, max: 1 }, { item: 'lucky_charm', chance: 0.15, min: 1, max: 1 } ] },
    { id: 'demon', name: '👹 Demon King', minLevel: 50, hp: 15000, atk: 90, def: 50, reward: [15000, 30000], exp: 160,
      element: 'dark',
      penaltyCap: 4000, relicChance: 0.35,
      loot: [ { item: 'refine_stone', chance: 1, min: 2, max: 4 }, { item: 'protection_stone', chance: 0.30, min: 1, max: 2 }, { item: 'mythic_fragment', chance: 0.20, min: 1, max: 1 }, { item: 'lucky_charm', chance: 0.20, min: 1, max: 1 } ] },
    { id: 'void_emp', name: '🌑 Void Emperor', minLevel: 100, hp: 30000, atk: 130, def: 70, reward: [35000, 75000], exp: 240,
      element: 'dark',
      penaltyCap: 5000, relicChance: 0.40, relicRareBonus: true,
      loot: [ { item: 'refine_stone', chance: 1, min: 3, max: 5 }, { item: 'protection_stone', chance: 0.40, min: 1, max: 2 }, { item: 'mythic_fragment', chance: 0.25, min: 1, max: 2 }, { item: 'money_magnet', chance: 0.15, min: 1, max: 1 }, { item: 'awakening_crystal', chance: 0.03, min: 1, max: 1 } ] },
    { id: 'ancient', name: '☠️ Ancient God', minLevel: 150, hp: 50000, atk: 180, def: 100, reward: [70000, 150000], exp: 400,
      element: 'light',
      penaltyCap: 5000, relicChance: 0.50, relicRareBonus: true,
      loot: [ { item: 'refine_stone', chance: 1, min: 3, max: 6 }, { item: 'protection_stone', chance: 0.50, min: 1, max: 2 }, { item: 'mythic_fragment', chance: 0.35, min: 1, max: 2 }, { item: 'lucky_charm', chance: 0.25, min: 1, max: 1 }, { item: 'awakening_crystal', chance: 0.10, min: 1, max: 1 } ] }
];

module.exports = { DUNGEON_TIERS, BOSS_LIST };
