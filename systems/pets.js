// systems/pets.js
const { db } = require('../database');
const { PET_DATA, PET_SKILL_MILESTONES, PET_LEVEL_MULTIPLIERS, PET_EVOLUTIONS, PET_SKILLS } = require('../data/pets');
const { getRandomInt } = require('../utils');

function generatePetStats(tier) {
    const ranges = { Common:[60,100,10,25,5,15,5,12,3,8], Uncommon:[80,130,15,30,8,18,7,15,4,10], Rare:[100,160,20,40,10,25,10,20,5,12], Epic:[130,200,30,55,15,35,12,25,7,15], Legendary:[160,250,40,70,20,45,15,30,8,18], Mythic:[200,300,50,85,25,55,18,35,10,20], Secret:[280,400,70,110,35,70,25,45,15,28], God:[400,550,100,150,50,90,35,60,22,38] };
    const r = ranges[tier] || ranges['Common'];
    return { hp: getRandomInt(r[0],r[1]), atk: getRandomInt(r[2],r[3]), def: getRandomInt(r[4],r[5]), spd: getRandomInt(r[6],r[7]), crit: getRandomInt(r[8],r[9]) };
}

function simulateBattle(pet, petDef, enemies) {
    let petHp = pet.hp + (pet.level * 3);
    const maxPetHp = petHp;
    const petAtk = pet.atk + (pet.level * 1);
    const petDef2 = pet.def + Math.floor(pet.level * 0.5);
    const petCrit = pet.crit;
    let log = [], wave = 0, alive = true;

    // Load pet skills
    const petSkills = getPetSkills(pet);
    const skillCooldowns = {};
    petSkills.forEach(s => { skillCooldowns[s.id] = 0; });
    let hasResurrected = false;
    let buffState = { critBonus: 0, critDuration: 0, atkBonus: 0, defPenalty: 0, buffDuration: 0, shieldReduction: 0, shieldDuration: 0, immuneDuration: 0 };

    for (const enemy of enemies) {
        wave++;
        let enemyHp = enemy.hp;
        let round = 0;
        log.push(`**━━ Wave ${wave} ━━** (Monster HP: ${enemyHp})`);
        while (petHp > 0 && enemyHp > 0 && round < 20) {
            round++;
            // Decrement cooldowns
            for (const sId of Object.keys(skillCooldowns)) { if (skillCooldowns[sId] > 0) skillCooldowns[sId]--; }
            // Decrement buffs
            if (buffState.critDuration > 0) buffState.critDuration--;
            else buffState.critBonus = 0;
            if (buffState.buffDuration > 0) buffState.buffDuration--;
            else { buffState.atkBonus = 0; buffState.defPenalty = 0; }
            if (buffState.shieldDuration > 0) buffState.shieldDuration--;
            else buffState.shieldReduction = 0;
            if (buffState.immuneDuration > 0) buffState.immuneDuration--;

            // Try to use a skill (20% chance per turn if off cooldown)
            let skillUsed = false;
            if (petSkills.length > 0 && Math.random() < 0.20) {
                const availableSkills = petSkills.filter(s => skillCooldowns[s.id] === 0);
                if (availableSkills.length > 0) {
                    const skill = availableSkills[Math.floor(Math.random() * availableSkills.length)];
                    skillCooldowns[skill.id] = skill.cooldown;
                    skillUsed = true;

                    if (skill.type === 'attack') {
                        let sDmg = Math.max(1, Math.floor((petAtk + Math.floor(petAtk * buffState.atkBonus / 100)) * skill.multiplier) - Math.floor(enemy.def || 0));
                        enemyHp -= sDmg;
                        log.push(`> 🐾 ${pet.name} uses **${skill.name}**! ${skill.emoji} → Monster: -${sDmg} HP`);
                    } else if (skill.type === 'heal') {
                        const healAmt = Math.floor(maxPetHp * skill.amount);
                        petHp = Math.min(maxPetHp, petHp + healAmt);
                        log.push(`> 🐾 ${pet.name} uses **${skill.name}**! ${skill.emoji} → +${healAmt} HP (${petHp})`);
                    } else if (skill.type === 'defense') {
                        buffState.shieldReduction = skill.reduction;
                        buffState.shieldDuration = skill.duration || 1;
                        log.push(`> 🐾 ${pet.name} uses **${skill.name}**! ${skill.emoji} → ${Math.floor(skill.reduction * 100)}% damage reduction`);
                    } else if (skill.type === 'buff' && skill.critBonus) {
                        buffState.critBonus = skill.critBonus;
                        buffState.critDuration = skill.duration;
                        log.push(`> 🐾 ${pet.name} uses **${skill.name}**! ${skill.emoji} → +${skill.critBonus}% crit (${skill.duration} turns)`);
                    } else if (skill.type === 'buff' && skill.atkBonus) {
                        buffState.atkBonus = skill.atkBonus;
                        buffState.defPenalty = skill.defPenalty || 0;
                        buffState.buffDuration = skill.duration;
                        log.push(`> 🐾 ${pet.name} uses **${skill.name}**! ${skill.emoji} → +${skill.atkBonus}% ATK, -${skill.defPenalty}% DEF`);
                    } else if (skill.type === 'drain') {
                        let sDmg = Math.max(1, Math.floor((petAtk + Math.floor(petAtk * buffState.atkBonus / 100)) * skill.multiplier) - Math.floor(enemy.def || 0));
                        enemyHp -= sDmg;
                        const healAmt = Math.floor(sDmg * skill.healRatio);
                        petHp = Math.min(maxPetHp, petHp + healAmt);
                        log.push(`> 🐾 ${pet.name} uses **${skill.name}**! ${skill.emoji} → Monster: -${sDmg}, Heal +${healAmt}`);
                    } else if (skill.type === 'immune') {
                        buffState.immuneDuration = skill.duration;
                        log.push(`> 🐾 ${pet.name} uses **${skill.name}**! ${skill.emoji} → Immune for ${skill.duration} turn!`);
                    } else {
                        skillUsed = false;
                    }
                }
            }

            // Normal attack if no skill used
            if (!skillUsed) {
                let dmg = Math.max(1, (petAtk + Math.floor(petAtk * buffState.atkBonus / 100)) - Math.floor(enemy.def || 0));
                const effectiveCrit = petCrit + buffState.critBonus;
                if (Math.random() * 100 < effectiveCrit) { dmg = Math.floor(dmg * 2); log.push(`> ${petDef.emoji} **CRIT!** → Monster: -${dmg} HP`); }
                else log.push(`> ${petDef.emoji} ATK → Monster: -${dmg} HP`);
                enemyHp -= dmg;
            }

            if (enemyHp <= 0) { log.push(`> ✅ Monster defeated!`); break; }

            // Enemy attacks
            if (buffState.immuneDuration > 0) {
                log.push(`> 👹 Monster ATK → ✝️ IMMUNE! (0 damage)`);
            } else {
                let eDmg = Math.max(1, enemy.atk - (petDef2 - Math.floor(petDef2 * buffState.defPenalty / 100)));
                if (buffState.shieldReduction > 0) eDmg = Math.max(1, Math.floor(eDmg * (1 - buffState.shieldReduction)));
                petHp -= eDmg;
                log.push(`> 👹 Monster ATK → ${pet.name}: -${eDmg} HP (${Math.max(0,petHp)} left)`);
            }

            // Check resurrection
            if (petHp <= 0 && !hasResurrected) {
                const resSkill = petSkills.find(s => s.type === 'revive');
                if (resSkill) {
                    hasResurrected = true;
                    petHp = Math.floor(maxPetHp * resSkill.hpRestore);
                    log.push(`> ✨ **${resSkill.name}!** ${pet.name} bangkit dengan ${petHp} HP!`);
                }
            }
        }
        if (petHp <= 0) { alive = false; log.push(`> 💀 **${pet.name} kalah!**`); break; }
    }
    return { alive, remainingHp: Math.max(0, petHp), log: log.slice(-15) };
}

function simulatePvP(pet1, pet1Def, pet2, pet2Def) {
    let hp1 = pet1.hp + (pet1.level * 3), hp2 = pet2.hp + (pet2.level * 3);
    const maxHp1 = hp1, maxHp2 = hp2;
    const atk1 = pet1.atk + pet1.level, atk2 = pet2.atk + pet2.level;
    const def1 = pet1.def + Math.floor(pet1.level*0.5), def2 = pet2.def + Math.floor(pet2.level*0.5);
    let log = [], round = 0;
    const first = pet1.spd >= pet2.spd ? 1 : 2;

    // Load skills for both pets
    const skills1 = getPetSkills(pet1);
    const skills2 = getPetSkills(pet2);
    const cd1 = {}, cd2 = {};
    skills1.forEach(s => { cd1[s.id] = 0; });
    skills2.forEach(s => { cd2[s.id] = 0; });
    let res1 = false, res2 = false;

    while (hp1 > 0 && hp2 > 0 && round < 30) {
        round++;
        // Decrement cooldowns
        for (const sId of Object.keys(cd1)) { if (cd1[sId] > 0) cd1[sId]--; }
        for (const sId of Object.keys(cd2)) { if (cd2[sId] > 0) cd2[sId]--; }

        if (first === 1 || round > 1) {
            // Pet 1 attack with possible skill
            let skillUsed = false;
            if (skills1.length > 0 && Math.random() < 0.20) {
                const avail = skills1.filter(s => cd1[s.id] === 0 && s.type === 'attack');
                if (avail.length > 0) {
                    const skill = avail[Math.floor(Math.random() * avail.length)];
                    cd1[skill.id] = skill.cooldown;
                    let dmg = Math.max(1, Math.floor(atk1 * skill.multiplier) - def2);
                    hp2 -= dmg;
                    log.push(`> 🐾 ${pet1.name} uses **${skill.name}**! ${skill.emoji} → ${pet2.name}: -${dmg}`);
                    skillUsed = true;
                }
            }
            if (!skillUsed) {
                let dmg = Math.max(1, atk1 - def2);
                if (Math.random()*100 < pet1.crit) { dmg *= 2; log.push(`> ${pet1Def.emoji} **CRIT!** → ${pet2.name}: -${dmg}`); } else log.push(`> ${pet1Def.emoji} ATK → ${pet2.name}: -${dmg}`);
                hp2 -= dmg;
            }
            if (hp2 <= 0) {
                if (!res2) {
                    const resSkill = skills2.find(s => s.type === 'revive');
                    if (resSkill) { res2 = true; hp2 = Math.floor(maxHp2 * resSkill.hpRestore); log.push(`> ✨ ${pet2.name} **Resurrection!** (${hp2} HP)`); }
                }
                if (hp2 <= 0) break;
            }
        }

        // Pet 2 attack with possible skill
        let skillUsed2 = false;
        if (skills2.length > 0 && Math.random() < 0.20) {
            const avail = skills2.filter(s => cd2[s.id] === 0 && s.type === 'attack');
            if (avail.length > 0) {
                const skill = avail[Math.floor(Math.random() * avail.length)];
                cd2[skill.id] = skill.cooldown;
                let dmg2 = Math.max(1, Math.floor(atk2 * skill.multiplier) - def1);
                hp1 -= dmg2;
                log.push(`> 🐾 ${pet2.name} uses **${skill.name}**! ${skill.emoji} → ${pet1.name}: -${dmg2}`);
                skillUsed2 = true;
            }
        }
        if (!skillUsed2) {
            let dmg2 = Math.max(1, atk2 - def1);
            if (Math.random()*100 < pet2.crit) { dmg2 *= 2; log.push(`> ${pet2Def.emoji} **CRIT!** → ${pet1.name}: -${dmg2}`); } else log.push(`> ${pet2Def.emoji} ATK → ${pet1.name}: -${dmg2}`);
            hp1 -= dmg2;
        }
        if (hp1 <= 0) {
            if (!res1) {
                const resSkill = skills1.find(s => s.type === 'revive');
                if (resSkill) { res1 = true; hp1 = Math.floor(maxHp1 * resSkill.hpRestore); log.push(`> ✨ ${pet1.name} **Resurrection!** (${hp1} HP)`); }
            }
        }
    }
    return { winner: hp1 > 0 ? 1 : 2, hp1: Math.max(0,hp1), hp2: Math.max(0,hp2), log: log.slice(-12) };
}

function getPetData(guildId, userId) {
    return db.prepare('SELECT * FROM pets WHERE userId = ? AND active = 1').get(userId);
}

function getAllPets(guildId, userId) {
    return db.prepare('SELECT * FROM pets WHERE userId = ?').all(userId);
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
        // Check pet skill tier thresholds and assign active battle skills
        const skillThresholds = [10, 30, 60, 100];
        for (const threshold of skillThresholds) {
            if (newLevel >= threshold && pet.level < threshold) {
                assignPetSkillForTier(pet.id, threshold);
            }
        }
    }
    return { leveledUp, newLevel, newExp, newSkill, petName: pet.name };
}

function assignPetSkillForTier(petId, threshold) {
    const tierMap = { 10: 1, 30: 2, 60: 3, 100: 4 };
    const tier = tierMap[threshold];
    if (!tier) return null;

    const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(petId);
    if (!pet) return null;

    // Parse existing skills
    let currentSkills = [];
    try { currentSkills = JSON.parse(pet.skills || '[]'); } catch(e) { currentSkills = []; }

    // Check if already has a skill for this tier
    const tierSkills = PET_SKILLS.filter(s => s.tier === tier);
    const hasSkillForTier = currentSkills.some(sId => {
        const skillDef = PET_SKILLS.find(s => s.id === sId);
        return skillDef && skillDef.tier === tier;
    });
    if (hasSkillForTier) return null;

    // Randomly assign one skill from this tier
    const randomSkill = tierSkills[Math.floor(Math.random() * tierSkills.length)];
    currentSkills.push(randomSkill.id);

    // Max 4 skills (1 per tier)
    if (currentSkills.length > 4) currentSkills = currentSkills.slice(0, 4);

    db.prepare('UPDATE pets SET skills = ? WHERE id = ?').run(JSON.stringify(currentSkills), petId);
    return randomSkill;
}

function getPetSkills(pet) {
    if (!pet) return [];
    let skillIds = [];
    try { skillIds = JSON.parse(pet.skills || '[]'); } catch(e) { skillIds = []; }
    return skillIds.map(id => PET_SKILLS.find(s => s.id === id)).filter(Boolean);
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
    const evo = PET_EVOLUTIONS.find(e => e.from === pet.petId && pet.level >= e.level);
    return evo || null;
}

function evolvePet(guildId, userId) {
    const pet = getPetData(guildId, userId);
    if (!pet) return null;
    const evo = PET_EVOLUTIONS.find(e => e.from === pet.petId && pet.level >= e.level);
    if (!evo) return null;
    const newPetDef = PET_DATA.find(p => p.id === evo.to);
    if (!newPetDef) return null;
    const newStats = generatePetStats(newPetDef.tier);
    db.prepare('UPDATE pets SET petId = ?, evolved = 1, hp = ?, atk = ?, def = ?, spd = ?, crit = ? WHERE id = ?')
        .run(evo.to, newStats.hp, newStats.atk, newStats.def, newStats.spd, newStats.crit, pet.id);
    return { evo, newPetDef, newStats };
}

module.exports = { generatePetStats, simulateBattle, simulatePvP, getPetData, getAllPets, addPetExp, getPetBonus, getPetSkillBonus, getExpNeeded, checkPetEvolution, evolvePet, getPetSkills, assignPetSkillForTier };
