// systems/pets.js
const { db } = require('../database');
const { PET_DATA, PET_SKILL_MILESTONES, PET_LEVEL_MULTIPLIERS, PET_EVOLUTIONS } = require('../data/pets');
const { getRandomInt } = require('../utils');

function generatePetStats(tier) {
    const ranges = { Common:[60,100,10,25,5,15,5,12,3,8], Uncommon:[80,130,15,30,8,18,7,15,4,10], Rare:[100,160,20,40,10,25,10,20,5,12], Epic:[130,200,30,55,15,35,12,25,7,15], Legendary:[160,250,40,70,20,45,15,30,8,18], Mythic:[200,300,50,85,25,55,18,35,10,20] };
    const r = ranges[tier] || ranges['Common'];
    return { hp: getRandomInt(r[0],r[1]), atk: getRandomInt(r[2],r[3]), def: getRandomInt(r[4],r[5]), spd: getRandomInt(r[6],r[7]), crit: getRandomInt(r[8],r[9]) };
}

function simulateBattle(pet, petDef, enemies) {
    let petHp = pet.hp + (pet.level * 3);
    const petAtk = pet.atk + (pet.level * 1);
    const petDef2 = pet.def + Math.floor(pet.level * 0.5);
    const petCrit = pet.crit;
    let log = [], wave = 0, alive = true;
    for (const enemy of enemies) {
        wave++;
        let enemyHp = enemy.hp;
        let round = 0;
        log.push(`**━━ Wave ${wave} ━━** (Monster HP: ${enemyHp})`);
        while (petHp > 0 && enemyHp > 0 && round < 20) {
            round++;
            let dmg = Math.max(1, petAtk - Math.floor(enemy.def || 0));
            if (Math.random() * 100 < petCrit) { dmg = Math.floor(dmg * 2); log.push(`> ${petDef.emoji} **CRIT!** → Monster: -${dmg} HP`); }
            else log.push(`> ${petDef.emoji} ATK → Monster: -${dmg} HP`);
            enemyHp -= dmg;
            if (enemyHp <= 0) { log.push(`> ✅ Monster defeated!`); break; }
            let eDmg = Math.max(1, enemy.atk - petDef2);
            petHp -= eDmg;
            log.push(`> 👹 Monster ATK → ${pet.name}: -${eDmg} HP (${Math.max(0,petHp)} left)`);
        }
        if (petHp <= 0) { alive = false; log.push(`> 💀 **${pet.name} kalah!**`); break; }
    }
    return { alive, remainingHp: Math.max(0, petHp), log: log.slice(-15) };
}

function simulatePvP(pet1, pet1Def, pet2, pet2Def) {
    let hp1 = pet1.hp + (pet1.level * 3), hp2 = pet2.hp + (pet2.level * 3);
    const atk1 = pet1.atk + pet1.level, atk2 = pet2.atk + pet2.level;
    const def1 = pet1.def + Math.floor(pet1.level*0.5), def2 = pet2.def + Math.floor(pet2.level*0.5);
    let log = [], round = 0;
    const first = pet1.spd >= pet2.spd ? 1 : 2;
    while (hp1 > 0 && hp2 > 0 && round < 30) {
        round++;
        if (first === 1 || round > 1) {
            let dmg = Math.max(1, atk1 - def2);
            if (Math.random()*100 < pet1.crit) { dmg *= 2; log.push(`> ${pet1Def.emoji} **CRIT!** → ${pet2.name}: -${dmg}`); } else log.push(`> ${pet1Def.emoji} ATK → ${pet2.name}: -${dmg}`);
            hp2 -= dmg;
            if (hp2 <= 0) break;
        }
        let dmg2 = Math.max(1, atk2 - def1);
        if (Math.random()*100 < pet2.crit) { dmg2 *= 2; log.push(`> ${pet2Def.emoji} **CRIT!** → ${pet1.name}: -${dmg2}`); } else log.push(`> ${pet2Def.emoji} ATK → ${pet1.name}: -${dmg2}`);
        hp1 -= dmg2;
    }
    return { winner: hp1 > 0 ? 1 : 2, hp1: Math.max(0,hp1), hp2: Math.max(0,hp2), log: log.slice(-12) };
}

function getPetData(guildId, userId) {
    return db.prepare('SELECT * FROM pets WHERE guildId = ? AND userId = ? AND active = 1').get(guildId, userId);
}

function getAllPets(guildId, userId) {
    return db.prepare('SELECT * FROM pets WHERE guildId = ? AND userId = ?').all(guildId, userId);
}

function getExpNeeded(level) {
    if (level <= 20) return 80;
    if (level <= 50) return 150;
    if (level <= 100) return 300;
    return 500;
}

function addPetExp(guildId, userId, amount) {
    const pet = getPetData(guildId, userId);
    if (!pet) return null;
    if (pet.level >= 200) return { leveledUp: false, newLevel: 200, newExp: 0, newSkill: null, petName: pet.name };
    let newExp = pet.exp + amount;
    let newLevel = pet.level;
    let leveledUp = false;
    let expNeeded = getExpNeeded(newLevel);
    while (newExp >= expNeeded && newLevel < 200) {
        newExp -= expNeeded;
        newLevel++;
        leveledUp = true;
        expNeeded = getExpNeeded(newLevel);
    }
    if (newLevel >= 200) { newLevel = 200; newExp = 0; }
    db.prepare('UPDATE pets SET exp = ?, level = ? WHERE id = ?').run(newExp, newLevel, pet.id);
    let newSkill = null;
    if (leveledUp) {
        for (const ms of PET_SKILL_MILESTONES) {
            if (newLevel >= ms.level && pet.level < ms.level) { newSkill = ms; break; }
        }
    }
    return { leveledUp, newLevel, newExp, newSkill, petName: pet.name };
}

function getPetBonus(guildId, userId, bonusType) {
    const pet = getPetData(guildId, userId);
    if (!pet) return 0;
    if (pet.hunting_until && pet.hunting_until > Date.now()) return 0;
    const petDef = PET_DATA.find(p => p.id === pet.petId);
    if (!petDef) return 0;
    if (pet.happiness < 30 || pet.hunger < 10 || pet.status === 'sick') return 0;
    if (petDef.bonus.type !== bonusType && petDef.bonus.type !== 'all_reward' && petDef.bonus.type !== 'money_xp') return 0;
    const lvlMult = PET_LEVEL_MULTIPLIERS[Math.min(pet.level, 30)] || 1.0;
    let baseValue = petDef.bonus.value;
    if (petDef.bonus.type === 'all_reward' || petDef.bonus.type === 'money_xp') {
        if (bonusType === petDef.bonus.type || bonusType === 'money_all' || bonusType === 'xp_all') baseValue = petDef.bonus.value;
        else baseValue = Math.floor(petDef.bonus.value * 0.7);
    }
    return Math.floor(baseValue * lvlMult * 0.4);
}

function getPetSkillBonus(guildId, userId, bonusType) {
    const pet = getPetData(guildId, userId);
    if (!pet || pet.hunting_until > Date.now()) return 0;
    let total = 0;
    for (const ms of PET_SKILL_MILESTONES) {
        if (pet.level >= ms.level && (ms.skill.type === bonusType || ms.skill.type === 'all_reward')) {
            total += ms.skill.value;
        }
    }
    return total;
}

function checkPetEvolution(guildId, userId) {
    const pet = getPetData(guildId, userId);
    if (!pet) return null;
    const evo = PET_EVOLUTIONS.find(e => e.from === pet.petId && pet.level >= e.level && !pet.evolved);
    return evo || null;
}

function evolvePet(guildId, userId) {
    const pet = getPetData(guildId, userId);
    if (!pet) return null;
    const evo = PET_EVOLUTIONS.find(e => e.from === pet.petId && pet.level >= e.level && !pet.evolved);
    if (!evo) return null;
    const newPetDef = PET_DATA.find(p => p.id === evo.to);
    if (!newPetDef) return null;
    const newStats = generatePetStats(newPetDef.tier);
    db.prepare('UPDATE pets SET petId = ?, evolved = 1, hp = ?, atk = ?, def = ?, spd = ?, crit = ? WHERE id = ?')
        .run(evo.to, newStats.hp, newStats.atk, newStats.def, newStats.spd, newStats.crit, pet.id);
    return { evo, newPetDef, newStats };
}

module.exports = { generatePetStats, simulateBattle, simulatePvP, getPetData, getAllPets, addPetExp, getPetBonus, getPetSkillBonus, getExpNeeded, checkPetEvolution, evolvePet };
