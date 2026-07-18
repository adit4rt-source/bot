// systems/pets.js
const { db } = require('../database');
const { PET_DATA, PET_SKILL_MILESTONES, PET_LEVEL_MULTIPLIERS, PET_EVOLUTIONS, PET_SKILLS, ELEMENT_ADVANTAGE } = require('../data/pets');
const { getRandomInt } = require('../utils');

// ============ ELEMENT MATCHUP (PvE & PvP) ============
const ELEMENT_EMOJI = { fire: '🔥', water: '💧', nature: '🌿', electric: '⚡', dark: '🌑', light: '✨' };
// Multiplier damage berdasarkan elemen penyerang vs bertahan.
// Advantage: +25% (atau +50% jika amplified/elemental skill). Disadvantage: -20% (atau -10% jika amplified).
function elementMultiplier(attackerEl, defenderEl, amplified) {
    if (!attackerEl || !defenderEl) return 1.0;
    if (ELEMENT_ADVANTAGE[attackerEl] === defenderEl) return amplified ? 1.5 : 1.25;
    if (ELEMENT_ADVANTAGE[defenderEl] === attackerEl) return amplified ? 0.9 : 0.8;
    return 1.0;
}
function elementNote(attackerEl, defenderEl) {
    if (!attackerEl || !defenderEl) return '';
    if (ELEMENT_ADVANTAGE[attackerEl] === defenderEl) return ' — ⚡ **Super Effective!** (+25%)';
    if (ELEMENT_ADVANTAGE[defenderEl] === attackerEl) return ' — 🛡️ *Not Very Effective* (-20%)';
    return '';
}

function generatePetStats(tier) {
    const ranges = { Common:[60,100,10,25,5,15,5,12,3,8], Uncommon:[80,130,15,30,8,18,7,15,4,10], Rare:[100,160,20,40,10,25,10,20,5,12], Epic:[130,200,30,55,15,35,12,25,7,15], Legendary:[160,250,40,70,20,45,15,30,8,18], Mythic:[200,300,50,85,25,55,18,35,10,20], Secret:[280,400,70,110,35,70,25,45,15,28], God:[400,550,100,150,50,90,35,60,22,38] };
    const r = ranges[tier] || ranges['Common'];
    return { hp: getRandomInt(r[0],r[1]), atk: getRandomInt(r[2],r[3]), def: getRandomInt(r[4],r[5]), spd: getRandomInt(r[6],r[7]), crit: getRandomInt(r[8],r[9]) };
}

// ============ RELIC SYSTEM ============
// A relic boosts the pet it's EQUIPPED to (equipped_pet_id). Each pet can equip
// one relic per slot (weapon/armor/accessory). Refining scales its power:
//   effective bonus = stat_value * (1 + refine_level * 0.05)
const RELIC_SLOTS = ['weapon', 'armor', 'accessory'];

const GEM_STATS = {
    dna_shard: {
        name: 'DNA Shard',
        emoji: '🧬',
        options: [
            { id: 'hp', display: '+15 HP', stats: { hp: 15 } },
            { id: 'atk', display: '+3 ATK', stats: { atk: 3 } }
        ]
    },
    mutation_serum: {
        name: 'Mutation Serum',
        emoji: '🧪',
        options: [
            { id: 'def', display: '+4 DEF', stats: { def: 4 } },
            { id: 'spd', display: '+3 SPD', stats: { spd: 3 } }
        ]
    },
    ancient_core: {
        name: 'Ancient Core',
        emoji: '🔮',
        options: [
            { id: 'crit', display: '+3% CRIT', percentStats: { crit: 3 } },
            { id: 'all', display: '+5% ATK/DEF/SPD', percentStats: { atk: 5, def: 5, spd: 5 } }
        ]
    },
    mythic_fragment: {
        name: 'Mythic Fragment',
        emoji: '✨',
        options: [
            { id: 'hp', display: '+8% HP', percentStats: { hp: 8 } },
            { id: 'atk', display: '+8% ATK', percentStats: { atk: 8 } }
        ]
    }
};

function relicEffective(relic) {
    const base = (relic.stat_value || 0) * (1 + (relic.refine_level || 0) * 0.05);
    return Math.floor(base);
}

// For Mythic/God relics, the bonus is percentage-based (applied differently in battle)
function isPercentRelic(relic) {
    return relic && (relic.rarity === 'Mythic' || relic.rarity === 'God');
}

function getUserRelics(userId) {
    if (!userId) return [];
    try { return db.prepare('SELECT * FROM relics WHERE userId = ? ORDER BY equipped_pet_id DESC, stat_value DESC').all(userId); }
    catch (_) { return []; }
}

function getEquippedRelics(petId) {
    if (!petId) return [];
    try { return db.prepare('SELECT * FROM relics WHERE equipped_pet_id = ?').all(petId); }
    catch (_) { return []; }
}

// Sum of EQUIPPED relic bonuses for a pet (per stat type).
function getRelicBonus(userId, petId) {
    const bonus = { hp: 0, atk: 0, def: 0, spd: 0, crit: 0 };
    const percentBonus = { hp: 0, atk: 0, def: 0, spd: 0, crit: 0 };
    if (!petId) return { ...bonus, percent: percentBonus };
    for (const r of getEquippedRelics(petId)) {
        if (r.stat_type in bonus) {
            if (isPercentRelic(r)) {
                percentBonus[r.stat_type] += relicEffective(r);
            } else {
                bonus[r.stat_type] += relicEffective(r);
            }
        }
        // Parse socketed gems
        let gems = [];
        try { gems = JSON.parse(r.gems || '[]'); } catch(e) { gems = []; }
        for (const gem of gems) {
            if (!gem) continue;
            const gemDef = GEM_STATS[gem.gemId];
            if (!gemDef) continue;
            const option = gemDef.options.find(o => o.id === gem.stat);
            if (!option) continue;
            if (option.stats) {
                for (const [sKey, val] of Object.entries(option.stats)) {
                    if (sKey in bonus) bonus[sKey] += val;
                }
            }
            if (option.percentStats) {
                for (const [sKey, val] of Object.entries(option.percentStats)) {
                    if (sKey in percentBonus) percentBonus[sKey] += val;
                }
            }
        }
    }
    return { ...bonus, percent: percentBonus };
}

// Equip a relic to a pet, auto-unequipping any relic in the same slot.
function equipRelic(userId, petId, relicId) {
    const relic = db.prepare('SELECT * FROM relics WHERE id = ? AND userId = ?').get(relicId, userId);
    if (!relic) return { success: false, error: 'Relic tidak ditemukan.' };
    if (!petId) return { success: false, error: 'Pet tidak ditemukan.' };
    db.prepare('UPDATE relics SET equipped_pet_id = 0 WHERE userId = ? AND equipped_pet_id = ? AND slot = ?').run(userId, petId, relic.slot);
    db.prepare('UPDATE relics SET equipped_pet_id = ? WHERE id = ?').run(petId, relicId);
    return { success: true, relic };
}

function unequipRelic(userId, relicId) {
    const relic = db.prepare('SELECT * FROM relics WHERE id = ? AND userId = ?').get(relicId, userId);
    if (!relic) return { success: false, error: 'Relic tidak ditemukan.' };
    db.prepare('UPDATE relics SET equipped_pet_id = 0 WHERE id = ?').run(relicId);
    return { success: true, relic };
}

function unequipAll(userId, petId) {
    const n = db.prepare('UPDATE relics SET equipped_pet_id = 0 WHERE userId = ? AND equipped_pet_id = ?').run(userId, petId);
    return { success: true, count: n.changes || 0 };
}

// Melt (salvage) a relic into Refine Stones. Better rarity / more refines = more stones.
function meltRelic(guildId, userId, relicId) {
    const relic = db.prepare('SELECT * FROM relics WHERE id = ? AND userId = ?').get(relicId, userId);
    if (!relic) return { success: false, error: 'Relic tidak ditemukan.' };
    const rarity = relic.rarity;
    const base = rarity === 'God' ? 10 : rarity === 'Mythic' ? 6 : rarity === 'Legendary' ? 3 : rarity === 'Epic' ? 2 : 1;
    const stones = base + Math.floor((relic.refine_level || 0) / 3);
    db.prepare('DELETE FROM relics WHERE id = ?').run(relicId);
    const { addItem } = require('../database');
    addItem(guildId, userId, 'refine_stone', stones);
    try { require('../database').incrementUserStat(guildId, userId, 'relic_melts', 1); } catch (_) { /* stat tracking must never block melt */ }
    return { success: true, relic, stones };
}

// Base pet stats + EQUIPPED relic bonuses (used for display and battle).
function getEffectiveStats(pet) {
    const b = getRelicBonus(pet && pet.userId, pet && pet.id);
    const lvl = pet && pet.level ? pet.level : 1;
    const levelBonus = Math.max(0, lvl - 1);

    const lvlHp = levelBonus * 5;
    const lvlAtk = levelBonus * 2;
    const lvlDef = levelBonus * 1;
    const lvlSpd = Math.floor(levelBonus * 0.2);
    const lvlCrit = Math.floor(levelBonus * 0.1);

    let hp = (pet.hp || 0) + lvlHp + b.hp;
    let atk = (pet.atk || 0) + lvlAtk + b.atk;
    let def = (pet.def || 0) + lvlDef + b.def;
    let spd = (pet.spd || 0) + lvlSpd + b.spd;
    let crit = (pet.crit || 0) + lvlCrit + b.crit;

    if (b.percent) {
        hp = Math.floor(hp * (1 + (b.percent.hp || 0) / 100));
        atk = Math.floor(atk * (1 + (b.percent.atk || 0) / 100));
        def = Math.floor(def * (1 + (b.percent.def || 0) / 100));
        spd = Math.floor(spd * (1 + (b.percent.spd || 0) / 100));
        crit = Math.floor(crit * (1 + (b.percent.crit || 0) / 100));
    }
    // Apply Spicy Fish Soup +10% ATK buff if active
    if (pet && pet.userId) {
        try {
            const { getUserStat } = require('../database');
            const buffUntil = getUserStat(null, pet.userId, 'pet_atk_buff_until') || 0;
            if (Date.now() < buffUntil) {
                atk = Math.floor(atk * 1.10);
            }
            // Apply Sushi Roll ATK/DEF buff (+15%)
            const sushiBuffUntil = getUserStat(null, pet.userId, 'pet_atk_def_buff_until') || 0;
            if (Date.now() < sushiBuffUntil) {
                atk = Math.floor(atk * 1.15);
                def = Math.floor(def * 1.15);
            }
            // Crit Master ability (+10% crit)
            try {
                const { hasAbility } = require('./petAbilities');
                if (hasAbility(pet.guildId || null, pet.userId, 'crit_master')) {
                    crit += 10;
                }
            } catch (_) {}
        } catch (_) {}
    }
    return { hp, atk, def, spd, crit, bonus: b };
}

// Returns a shallow copy of the pet row with relic bonuses folded into the
// stat fields, leaving the caller's object untouched.
function withRelics(pet) {
    if (!pet) return pet;
    const eff = getEffectiveStats(pet);
    return { ...pet, hp: eff.hp, atk: eff.atk, def: eff.def, spd: eff.spd, crit: eff.crit };
}

function simulateBattle(pet, petDef, enemies) {
    pet = withRelics(pet); // fold equipped/owned relic bonuses and level scaling into stats
    let petHp = pet.hp;
    const maxPetHp = petHp;
    const petAtk = pet.atk;
    const petDef2 = pet.def;
    const petCrit = pet.crit;
    const petEl = pet.element;
    let log = [], wave = 0, alive = true;

    // Load pet skills
    const petSkills = getPetSkills(pet);
    const skillCooldowns = {};
    petSkills.forEach(s => { skillCooldowns[s.id] = 0; });
    let hasResurrected = false;
    let buffState = {
        critBonus: 0, critDuration: 0, atkBonus: 0, defPenalty: 0, defBonus: 0, buffDuration: 0,
        shieldReduction: 0, shieldDuration: 0, immuneDuration: 0, absorbHp: 0, enemySkip: 0,
    };
    // Optional battle modifiers (nightmare): { noHeal, elementSeal, enemyAtkMult, petDefMult }
    const mods = (typeof enemies._mods === 'object' && enemies._mods) || pet._battleMods || {};

    for (const enemy of enemies) {
        if (!enemy || typeof enemy.hp !== 'number') continue;
        wave++;
        let enemyHp = enemy.hp;
        let round = 0;
        const enemyEl = mods.elementSeal ? null : enemy.element;
        const petElEff = mods.elementSeal ? null : petEl;
        const atkMult = elementMultiplier(petElEff, enemyEl);          // pet → enemy
        const atkMultAmp = elementMultiplier(petElEff, enemyEl, true);  // elemental skill
        const defMult = elementMultiplier(enemyEl, petElEff);          // enemy → pet
        const elIcon = enemy.element ? ` ${ELEMENT_EMOJI[enemy.element] || ''}` : '';
        log.push(`**━━ Wave ${wave} ━━** (Monster HP: ${enemyHp})${elIcon}${elementNote(petElEff, enemyEl)}`);
        while (petHp > 0 && enemyHp > 0 && round < 20) {
            round++;
            // Decrement cooldowns
            for (const sId of Object.keys(skillCooldowns)) { if (skillCooldowns[sId] > 0) skillCooldowns[sId]--; }
            // Decrement buffs
            if (buffState.critDuration > 0) buffState.critDuration--;
            else buffState.critBonus = 0;
            if (buffState.buffDuration > 0) buffState.buffDuration--;
            else { buffState.atkBonus = 0; buffState.defPenalty = 0; buffState.defBonus = 0; }
            if (buffState.shieldDuration > 0) buffState.shieldDuration--;
            else buffState.shieldReduction = 0;
            if (buffState.immuneDuration > 0) buffState.immuneDuration--;

            // Try to use a skill (20% chance per turn if off cooldown)
            let skillUsed = false;
            if (petSkills.length > 0 && Math.random() < 0.20) {
                let availableSkills = petSkills.filter(s => skillCooldowns[s.id] === 0);
                // Filter conditional skills that can't fire this turn
                availableSkills = availableSkills.filter(s => {
                    if (s.minHpPercent != null && (petHp / maxPetHp) >= s.minHpPercent) return false;
                    if (s.requireAdvantage && atkMult <= 1.0) return false;
                    if (mods.noHeal && (s.type === 'heal' || s.type === 'drain' || s.type === 'genesis')) return false;
                    return true;
                });
                if (availableSkills.length > 0) {
                    const skill = availableSkills[Math.floor(Math.random() * availableSkills.length)];
                    skillCooldowns[skill.id] = skill.cooldown;
                    skillUsed = true;
                    const curAtk = petAtk + Math.floor(petAtk * buffState.atkBonus / 100);

                    if (skill.type === 'attack') {
                        const eMult = (skill.id === 'elemental_blast' || skill.id === 'elemental_catastrophe') ? atkMultAmp : atkMult;
                        let enemyDef = Math.floor(enemy.def || 0);
                        if (skill.ignoreDef) enemyDef = Math.floor(enemyDef * (1 - skill.ignoreDef));
                        let sDmg = Math.max(1, Math.floor((curAtk * skill.multiplier * eMult) - enemyDef));
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
                        log.push(`> 🐾 ${pet.name} uses **${skill.name}**! ${skill.emoji} → +${skill.atkBonus}% ATK, -${skill.defPenalty || 0}% DEF`);
                    } else if (skill.type === 'drain') {
                        let sDmg = Math.max(1, Math.floor((curAtk * skill.multiplier * atkMult) - Math.floor(enemy.def || 0)));
                        enemyHp -= sDmg;
                        const healAmt = Math.floor(sDmg * skill.healRatio);
                        petHp = Math.min(maxPetHp, petHp + healAmt);
                        log.push(`> 🐾 ${pet.name} uses **${skill.name}**! ${skill.emoji} → Monster: -${sDmg}, Heal +${healAmt}`);
                    } else if (skill.type === 'immune') {
                        buffState.immuneDuration = skill.duration;
                        log.push(`> 🐾 ${pet.name} uses **${skill.name}**! ${skill.emoji} → Immune for ${skill.duration} turn!`);
                    } else if (skill.type === 'control') {
                        buffState.enemySkip = Math.max(buffState.enemySkip, skill.skipTurns || 1);
                        log.push(`> 🐾 ${pet.name} uses **${skill.name}**! ${skill.emoji} → Monster SKIP ${skill.skipTurns || 1} turn!`);
                    } else if (skill.type === 'blood_pact') {
                        const cost = Math.floor(maxPetHp * (skill.selfHpCost || 0.2));
                        petHp = Math.max(1, petHp - cost);
                        buffState.atkBonus = Math.max(buffState.atkBonus, skill.atkBonus || 80);
                        buffState.buffDuration = skill.duration || 2;
                        log.push(`> 🐾 ${pet.name} uses **${skill.name}**! ${skill.emoji} → −${cost} HP, +${skill.atkBonus || 80}% ATK`);
                    } else if (skill.type === 'absorb') {
                        buffState.absorbHp = Math.floor(maxPetHp * (skill.amount || 0.4));
                        log.push(`> 🐾 ${pet.name} uses **${skill.name}**! ${skill.emoji} → Shield ${buffState.absorbHp} HP`);
                    } else if (skill.type === 'genesis') {
                        const healAmt = Math.floor(maxPetHp * (skill.heal || 0.35));
                        petHp = Math.min(maxPetHp, petHp + healAmt);
                        buffState.atkBonus = Math.max(buffState.atkBonus, skill.atkBonus || 15);
                        buffState.defBonus = Math.max(buffState.defBonus, skill.defBonus || 15);
                        buffState.buffDuration = skill.duration || 2;
                        log.push(`> 🐾 ${pet.name} uses **${skill.name}**! ${skill.emoji} → +${healAmt} HP, +${skill.atkBonus || 15}% ATK/DEF`);
                    } else {
                        skillUsed = false;
                        skillCooldowns[skill.id] = 0; // refund CD if skill type unknown
                    }
                }
            }

            // Normal attack if no skill used
            if (!skillUsed) {
                let dmg = Math.max(1, Math.floor(((petAtk + Math.floor(petAtk * buffState.atkBonus / 100)) - Math.floor(enemy.def || 0)) * atkMult));
                const effectiveCrit = petCrit + buffState.critBonus;
                if (Math.random() * 100 < effectiveCrit) { dmg = Math.floor(dmg * 2); log.push(`> ${petDef.emoji} **CRIT!** → Monster: -${dmg} HP`); }
                else log.push(`> ${petDef.emoji} ATK → Monster: -${dmg} HP`);
                enemyHp -= dmg;
            }

            if (enemyHp <= 0) { log.push(`> ✅ Monster defeated!`); break; }

            // Enemy attacks (may be skipped by Time Stop)
            if (buffState.enemySkip > 0) {
                buffState.enemySkip--;
                log.push(`> 👹 Monster is frozen (Time Stop)!`);
            } else if (buffState.immuneDuration > 0) {
                log.push(`> 👹 Monster ATK → ✝️ IMMUNE! (0 damage)`);
            } else {
                let petDefEff = petDef2 - Math.floor(petDef2 * buffState.defPenalty / 100) + Math.floor(petDef2 * (buffState.defBonus || 0) / 100);
                if (mods.petDefMult) petDefEff = Math.floor(petDefEff * mods.petDefMult);
                let enemyAtk = enemy.atk;
                if (mods.enemyAtkMult) enemyAtk = Math.floor(enemyAtk * mods.enemyAtkMult);
                let eDmg = Math.max(1, Math.floor((enemyAtk - petDefEff) * defMult));
                if (buffState.shieldReduction > 0) eDmg = Math.max(1, Math.floor(eDmg * (1 - buffState.shieldReduction)));
                if (buffState.absorbHp > 0) {
                    const absorbed = Math.min(buffState.absorbHp, eDmg);
                    buffState.absorbHp -= absorbed;
                    eDmg -= absorbed;
                    if (absorbed > 0) log.push(`> 🛡️ Aegis menyerap ${absorbed} dmg (sisa shield: ${buffState.absorbHp})`);
                }
                if (eDmg > 0) {
                    petHp -= eDmg;
                    log.push(`> 👹 Monster ATK → ${pet.name}: -${eDmg} HP (${Math.max(0, petHp)} left)`);
                }
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
    return { alive, remainingHp: Math.max(0, petHp), log: log.slice(-18) };
}

function simulatePvP(pet1, pet1Def, pet2, pet2Def) {
    pet1 = withRelics(pet1); pet2 = withRelics(pet2); // fold relic bonuses and level scaling into both
    let hp1 = pet1.hp, hp2 = pet2.hp;
    const maxHp1 = hp1, maxHp2 = hp2;
    const atk1 = pet1.atk, atk2 = pet2.atk;
    const def1 = pet1.def, def2 = pet2.def;
    let log = [], round = 0;
    const first = pet1.spd >= pet2.spd ? 1 : 2;
    const el1 = pet1.element, el2 = pet2.element;
    const mult1 = elementMultiplier(el1, el2);      // pet1 → pet2
    const mult1Amp = elementMultiplier(el1, el2, true);
    const mult2 = elementMultiplier(el2, el1);      // pet2 → pet1
    const mult2Amp = elementMultiplier(el2, el1, true);
    if (el1 && el2 && (mult1 !== 1.0)) {
        log.push(`${ELEMENT_EMOJI[el1] || ''} **${pet1.name}** vs ${ELEMENT_EMOJI[el2] || ''} **${pet2.name}**${elementNote(el1, el2)}`);
    }

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
                    let dmg = Math.max(1, Math.floor(atk1 * skill.multiplier * (skill.id === 'elemental_blast' ? mult1Amp : mult1)) - def2);
                    hp2 -= dmg;
                    log.push(`> 🐾 ${pet1.name} uses **${skill.name}**! ${skill.emoji} → ${pet2.name}: -${dmg}`);
                    skillUsed = true;
                }
            }
            if (!skillUsed) {
                let dmg = Math.max(1, Math.floor((atk1 - def2) * mult1));
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
                let dmg2 = Math.max(1, Math.floor(atk2 * skill.multiplier * (skill.id === 'elemental_blast' ? mult2Amp : mult2)) - def1);
                hp1 -= dmg2;
                log.push(`> 🐾 ${pet2.name} uses **${skill.name}**! ${skill.emoji} → ${pet1.name}: -${dmg2}`);
                skillUsed2 = true;
            }
        }
        if (!skillUsed2) {
            let dmg2 = Math.max(1, Math.floor((atk2 - def1) * mult2));
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

    // Apply Pet XP Booster (2x)
    try {
        const { getUserStat } = require('../database');
        const petXpBoostUntil = getUserStat(guildId, userId, 'pet_xp_boost_2x_until') || 0;
        if (Date.now() < petXpBoostUntil) {
            amount *= 2;
        }
    } catch (_) {}

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
        const skillThresholds = [10, 30, 60, 100, 150];
        for (const threshold of skillThresholds) {
            if (newLevel >= threshold && pet.level < threshold) {
                assignPetSkillForTier(pet.id, threshold);
            }
        }
        // Catch-up for pets that crossed tiers offline / before T5 existed
        ensurePetBattleSkills(pet.id, newLevel);
    }
    return { leveledUp, newLevel, newExp, newSkill, petName: pet.name };
}

const SKILL_LEVEL_TO_TIER = { 10: 1, 30: 2, 60: 3, 100: 4, 150: 5 };
const SKILL_TIER_TO_LEVEL = { 1: 10, 2: 30, 3: 60, 4: 100, 5: 150 };
const MAX_BATTLE_SKILLS = 5;

function assignPetSkillForTier(petId, threshold) {
    const tier = SKILL_LEVEL_TO_TIER[threshold];
    if (!tier) return null;

    const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(petId);
    if (!pet) return null;

    // Parse existing skills
    let currentSkills = [];
    try { currentSkills = JSON.parse(pet.skills || '[]'); } catch (e) { currentSkills = []; }

    // Check if already has a skill for this tier
    const tierSkills = PET_SKILLS.filter(s => s.tier === tier);
    if (tierSkills.length === 0) return null;
    const hasSkillForTier = currentSkills.some(sId => {
        const skillDef = PET_SKILLS.find(s => s.id === sId);
        return skillDef && skillDef.tier === tier;
    });
    if (hasSkillForTier) return null;

    // Randomly assign one skill from this tier
    const randomSkill = tierSkills[Math.floor(Math.random() * tierSkills.length)];
    currentSkills.push(randomSkill.id);

    // Max 5 skills (1 per tier including Ascendant T5)
    if (currentSkills.length > MAX_BATTLE_SKILLS) currentSkills = currentSkills.slice(0, MAX_BATTLE_SKILLS);

    db.prepare('UPDATE pets SET skills = ? WHERE id = ?').run(JSON.stringify(currentSkills), petId);
    return randomSkill;
}

/** Backfill missing battle skills for pets already past unlock levels. */
function ensurePetBattleSkills(petId, level) {
    if (!petId || !level) return [];
    const unlocked = [];
    for (const [lvl, tier] of Object.entries(SKILL_LEVEL_TO_TIER)) {
        if (level >= Number(lvl)) {
            const got = assignPetSkillForTier(petId, Number(lvl));
            if (got) unlocked.push(got);
        }
    }
    return unlocked;
}

/**
 * Reroll one battle skill of a given tier using a Skill Tome.
 * @returns {{ success, skill?, oldSkill?, error? }}
 */
function rerollPetSkill(petId, tier) {
    const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(petId);
    if (!pet) return { success: false, error: 'Pet tidak ditemukan.' };
    const unlockLevel = SKILL_TIER_TO_LEVEL[tier];
    if (!unlockLevel || pet.level < unlockLevel) {
        return { success: false, error: `Pet butuh Lv.${unlockLevel}+ untuk skill Tier ${tier}.` };
    }

    let currentSkills = [];
    try { currentSkills = JSON.parse(pet.skills || '[]'); } catch (e) { currentSkills = []; }

    const tierSkillDefs = PET_SKILLS.filter(s => s.tier === tier);
    if (tierSkillDefs.length < 2) return { success: false, error: 'Tidak ada skill alternatif di tier ini.' };

    const idx = currentSkills.findIndex(sId => {
        const def = PET_SKILLS.find(s => s.id === sId);
        return def && def.tier === tier;
    });
    if (idx === -1) {
        // No skill for this tier yet — assign fresh
        const pick = tierSkillDefs[Math.floor(Math.random() * tierSkillDefs.length)];
        currentSkills.push(pick.id);
        if (currentSkills.length > MAX_BATTLE_SKILLS) currentSkills = currentSkills.slice(0, MAX_BATTLE_SKILLS);
        db.prepare('UPDATE pets SET skills = ? WHERE id = ?').run(JSON.stringify(currentSkills), petId);
        return { success: true, skill: pick, oldSkill: null };
    }

    const oldId = currentSkills[idx];
    const oldSkill = PET_SKILLS.find(s => s.id === oldId);
    const alternatives = tierSkillDefs.filter(s => s.id !== oldId);
    const pick = alternatives[Math.floor(Math.random() * alternatives.length)];
    currentSkills[idx] = pick.id;
    db.prepare('UPDATE pets SET skills = ? WHERE id = ?').run(JSON.stringify(currentSkills), petId);
    return { success: true, skill: pick, oldSkill };
}

function getPetSkills(pet) {
    if (!pet) return [];
    let skillIds = [];
    try { skillIds = JSON.parse(pet.skills || '[]'); } catch (e) { skillIds = []; }
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

module.exports = {
    generatePetStats, simulateBattle, simulatePvP, getPetData, getAllPets, addPetExp, getPetBonus, getPetSkillBonus,
    getExpNeeded, checkPetEvolution, evolvePet, getPetSkills, assignPetSkillForTier, ensurePetBattleSkills, rerollPetSkill,
    SKILL_TIER_TO_LEVEL, MAX_BATTLE_SKILLS,
    elementMultiplier, elementNote, ELEMENT_EMOJI, getRelicBonus, getEffectiveStats, RELIC_SLOTS, relicEffective,
    getUserRelics, getEquippedRelics, equipRelic, unequipRelic, unequipAll, meltRelic, isPercentRelic, GEM_STATS,
};
