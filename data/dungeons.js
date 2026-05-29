const DUNGEON_TIERS = [
    { id: 'forest', name: '🌿 Hutan Pemula', minLevel: 1, waves: 3, monsterHp: [50,70,100], monsterAtk: [8,10,15], reward: [30,100], exp: 5, cooldown: 60000 },
    { id: 'cave', name: '🏔️ Gua Batu', minLevel: 10, waves: 4, monsterHp: [100,130,160,200], monsterAtk: [15,18,22,28], reward: [80,250], exp: 10, cooldown: 90000 },
    { id: 'volcano', name: '🌋 Gunung Api', minLevel: 25, waves: 5, monsterHp: [200,250,300,350,450], monsterAtk: [25,30,35,40,50], reward: [150,450], exp: 18, cooldown: 120000 },
    { id: 'castle', name: '🏰 Kastil Gelap', minLevel: 50, waves: 6, monsterHp: [400,500,600,700,800,1000], monsterAtk: [40,50,55,60,70,85], reward: [300,800], exp: 28, cooldown: 180000 },
    { id: 'void', name: '🌌 Void Realm', minLevel: 100, waves: 7, monsterHp: [800,1000,1200,1400,1600,1800,2500], monsterAtk: [70,80,90,100,110,120,150], reward: [500,1500], exp: 40, cooldown: 300000 }
];

const BOSS_LIST = [
    { id: 'dragon', name: '🐲 Dragon Lord', minLevel: 20, hp: 8000, atk: 60, def: 30, reward: [800, 2000], exp: 50 },
    { id: 'demon', name: '👹 Demon King', minLevel: 50, hp: 15000, atk: 90, def: 50, reward: [1500, 3500], exp: 80 },
    { id: 'void_emp', name: '🌑 Void Emperor', minLevel: 100, hp: 30000, atk: 130, def: 70, reward: [3000, 6000], exp: 120 },
    { id: 'ancient', name: '☠️ Ancient God', minLevel: 150, hp: 50000, atk: 180, def: 100, reward: [5000, 10000], exp: 200 }
];

module.exports = { DUNGEON_TIERS, BOSS_LIST };
