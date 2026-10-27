// Afflictions that outlast a fight, and the cost of magic:
//   Debuffs (poison, curse, blindness, silence…): picked up in fights (a foe's bite, a cultist's hex). Poison drains
//   your health each day, a curse weighs on every check (−2), blindness on sight-based ones; they wear off in days or
//   are purified (a healer, a Purify spell, a potion).
//   Long-term injuries: knocked down in a fight, you may break something (a fracture: −2 on bodily checks and −1 to
//   hit) or take a deep wound (−2 hit points of maximum… felt as −1 to hit) for days. Rest at home heals them faster;
//   a healer can set them for coin.
//   Arcane fatigue: strong spells add stress. Above 50, spells may fail; at 100 you cannot cast at all. A long rest
//   eases it, a cleansing ritual at a shrine clears it, a mana storm washes it away.
import { lex } from '../core/lexicon.js';
import { systemOn, placeIs } from '../core/world.js';
import { onDay, checkMods } from './hooks.js';
import { addStatus } from './needs.js';
import { note } from './facts.js';
import { book } from './ledger.js';
import { isRpg, sheetOf, changeHp, hpMax } from './rpg.js';
import { bagOf, addGood, goodDef } from './economy.js';
import { placeOf } from './places.js';
export const ailOf = (g) => (g.ail ??= { debuffs: [], injuries: [], stress: 0 });
const BODY = ['athletics', 'acrobatics', 'stealth', 'sleight'];
const SIGHT = ['perception', 'investigation', 'survival'];
export const DEBUFF_WORD = { poison: 'poisoned', burn: 'burned', curse: 'cursed', blind: 'half-blind', silence: 'voiceless', slow: 'sluggish' };
// After a fight: afflictions that stick (a day per two turns left, at least one).
export function carryDebuff(g, w, kind, turns) {
    if (!systemOn(w, 'debuffs') || kind === 'burn' || kind === 'slow')
        return;
    const a = ailOf(g);
    const until = g.day + Math.max(1, Math.ceil(turns / 2));
    const d = a.debuffs.find(x => x.kind === kind);
    if (d)
        d.until = Math.max(d.until, until);
    else
        a.debuffs.push({ kind, until });
}
export const hasDebuff = (g, kind) => ailOf(g).debuffs.some(d => d.kind === kind);
export function injure(g, w, place = g.player.loc) {
    if (!systemOn(w, 'injuries'))
        return '';
    const kind = Math.random() < 0.5 ? 'fracture' : 'wound';
    const days = kind === 'fracture' ? 6 : 4;
    ailOf(g).injuries.push({ kind, until: g.day + days, where: kind === 'fracture' ? ['arm', 'leg', 'ribs'][Math.floor(Math.random() * 3)] : 'side' });
    note(g, '{u} was badly hurt: {0}.', [kind === 'fracture' ? 'a broken bone' : 'a deep wound'], [], place, 'event');
    return kind === 'fracture' ? `You broke a bone. It will take about ${days} days to heal (rest at home helps; a healer can set it).` : `A deep wound. About ${days} days to heal.`;
}
export const injuryPenalty = (g, w) => (systemOn(w, 'injuries') ? ailOf(g).injuries.filter(i => i.until > g.day).length : 0);
checkMods.push((g, w, skill) => {
    let m = 0;
    const a = ailOf(g);
    if (systemOn(w, 'debuffs')) {
        if (hasDebuff(g, 'curse'))
            m -= 2;
        if (hasDebuff(g, 'blind') && SIGHT.includes(skill))
            m -= 3;
        if (hasDebuff(g, 'silence') && ['persuasion', 'deception', 'performance', 'intimidation'].includes(skill))
            m -= 3;
    }
    if (systemOn(w, 'injuries') && a.injuries.some(i => i.kind === 'fracture' && i.until > g.day) && BODY.includes(skill))
        m -= 2;
    return m;
});
// Purified: a spell, a potion, a healer.
export function cleanse(g) { const a = ailOf(g); const gone = a.debuffs.map(d => DEBUFF_WORD[d.kind] ?? d.kind); a.debuffs = []; return gone; }
export const HEALER_COST = 25;
export const atHealer = (g, w) => { const p = placeOf(g, w, g.player.loc); return placeIs(p, 'healer'); };
export function treat(g, w) {
    const a = ailOf(g);
    if (!atHealer(g, w))
        return lex(w, 'healerOnly');
    if (!a.debuffs.length && !a.injuries.some(i => i.until > g.day))
        return 'You are in good health.';
    if (g.player.money < HEALER_COST)
        return lex(w, 'healerAsks', String(HEALER_COST));
    g.player.money -= HEALER_COST;
    book(g, 'Treatment at the healer', -HEALER_COST);
    cleanse(g);
    for (const i of a.injuries)
        i.until = Math.min(i.until, g.day + 1);
    return lex(w, 'healerDone');
}
// Each day: poison drains, injuries mend (faster after a night at home), afflictions run out, stress eases.
onDay.push((g, w) => {
    const a = ailOf(g);
    const out = [];
    if (systemOn(w, 'debuffs') && hasDebuff(g, 'poison')) {
        addStatus(g, w, 'life', -8);
        addStatus(g, w, 'health', -8);
        out.push('The poison in your blood saps your strength.');
    }
    if (g.player.loc === 'home:player')
        for (const i of a.injuries)
            i.until--;
    const healed = a.injuries.filter(i => i.until <= g.day);
    if (healed.length)
        out.push(`Your ${healed.map(i => (i.kind === 'fracture' ? `broken ${i.where}` : 'wound')).join(' and ')} healed.`);
    a.injuries = a.injuries.filter(i => i.until > g.day);
    const before = a.debuffs.length;
    a.debuffs = a.debuffs.filter(d => d.until > g.day);
    if (a.debuffs.length < before)
        out.push('An affliction wore off.');
    a.stress = Math.max(0, a.stress - 10);
    return out;
});
/* ---------- arcane fatigue ---------- */
const fatigueOn = (w) => systemOn(w, 'fatigue') && isRpg(w);
export function addStress(g, w, cost) { if (fatigueOn(w) && cost >= 2)
    ailOf(g).stress = Math.min(100, ailOf(g).stress + cost * 6); }
// Will the spell work? Above 50 stress, it may fizzle; at 100, nothing comes.
export function spellFails(g, w) {
    if (!fatigueOn(w))
        return '';
    const s = ailOf(g).stress;
    if (s >= 100)
        return 'Your mind is too frayed to cast anything (arcane fatigue). Rest, or cleanse yourself at a shrine.';
    if (s > 50 && Math.random() < (s - 40) / 100)
        return 'The spell fizzles: arcane fatigue.';
    return '';
}
export function ritual(g, w) {
    const p = placeOf(g, w, g.player.loc);
    if (!placeIs(p, 'shrine'))
        return 'A cleansing ritual needs a shrine or a temple.';
    if (g.player.money < 10)
        return 'The ritual needs 10 for candles and incense.';
    g.player.money -= 10;
    book(g, 'Cleansing ritual', -10);
    ailOf(g).stress = 0;
    cleanse(g);
    return 'The ritual washes the strain of magic out of you.';
}
export function afflictionLine(g, w) {
    const a = ailOf(g);
    const out = [];
    const d = a.debuffs.map(x => DEBUFF_WORD[x.kind] ?? x.kind);
    if (d.length && systemOn(w, 'debuffs'))
        out.push(`{{user}} is ${d.join(', ')}.`);
    const i = a.injuries.filter(x => x.until > g.day);
    if (i.length && systemOn(w, 'injuries'))
        out.push(`{{user}} is injured: ${i.map(x => (x.kind === 'fracture' ? `a broken ${x.where}` : 'a deep wound')).join(', ')}.`);
    if (fatigueOn(w) && a.stress >= 50)
        out.push('{{user}} is strained by too much magic (arcane fatigue).');
    void sheetOf;
    return out.join(' ');
}
// Things you carry that you can use: a potion or a first aid kit heals; one that cures also clears afflictions.
export const usable = (g, w) => Object.entries(bagOf(g).items).filter(([id, n]) => n > 0 && (goodDef(w, id)?.kind === 'potion' || goodDef(w, id)?.cures)).map(([id, n]) => ({ def: goodDef(w, id), n }));
export function useGood(g, w, id) {
    const d = goodDef(w, id);
    if (!d || (bagOf(g).items[id] ?? 0) < 1 || !(d.kind === 'potion' || d.cures))
        return '';
    addGood(g, id, -1);
    const out = [];
    if (d.kind === 'potion') {
        const s = sheetOf(g);
        if (isRpg(w) && s) {
            changeHp(g, w, Math.round(hpMax(w, s) * 0.3));
            out.push('you feel your strength come back');
        }
        else {
            addStatus(g, w, 'health', 20);
            addStatus(g, w, 'energy', 10);
            out.push('you feel better');
        }
    }
    if (d.cures) {
        const gone = cleanse(g);
        if (gone.length)
            out.push(`no more ${gone.join(', ').toLowerCase()}`);
    }
    return `${d.name}: ${out.join('; ') || 'nothing happens'}.`;
}
