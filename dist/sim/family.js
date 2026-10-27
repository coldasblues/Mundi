// Having a family: trying for a baby with your partner (only while in a romance), a pregnancy that lasts some days,
// the birth (the child becomes a new person of the world, living with you), and growing up: once a week you can
// celebrate their birthday and they move on to the next stage of life. The engine owns all of it; the AI narrates.
import { nowAbs } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { onDay } from './hooks.js';
import { note } from './facts.js';
import { romOf } from './romance.js';
import { bump } from './social.js';
import { setTie, liveTogether, ties } from './living.js';
import { playerHomeId } from './places.js';
import { charOf } from '../st/bridge.js';
export const PREGNANCY_DAYS = 10;
export const BIRTHDAY_EVERY = 7;
export const STAGES = [
    { id: 'baby', name: 'Baby', age: 0, desc: 'a baby who cannot talk yet: cries, sleeps, smiles and babbles' },
    { id: 'toddler', name: 'Toddler', age: 2, desc: 'a toddler who says simple words, walks and wants attention' },
    { id: 'child', name: 'Child', age: 7, desc: 'a child who goes to school, plays and asks lots of questions' },
    { id: 'teen', name: 'Teen', age: 14, desc: 'a teenager with their own opinions, friends and moods' },
    { id: 'adult', name: 'Young adult', age: 19, desc: 'a young adult, independent and making their own choices' },
];
export const family = (g) => {
    const f = (g.family ??= {});
    f.kids ??= [];
    f.pregnancy ??= null;
    f.tries ??= {};
    return f;
};
export const kidOf = (g, avatar) => family(g).kids.find(k => k.avatar === avatar) ?? null;
export const stageOf = (k) => STAGES[Math.min(k.stage, STAGES.length - 1)];
// Children (anyone below the adult stage) are never part of any romance.
export const isMinor = (g, avatar) => {
    const k = kidOf(g, avatar);
    if (k)
        return stageOf(k).id !== 'adult';
    return !!charOf(avatar)?.data?.extensions?.mundi?.minor; // a card marked underage (characters taken out of a lorebook)
};
// No romance at all with your own children (at any age), your parents or siblings, or any minor.
export function romanceBlocked(g, avatar) {
    if (kidOf(g, avatar) || isMinor(g, avatar))
        return true;
    return ties(g).some(t => ((t.a === '__you' && t.b === avatar) || (t.b === '__you' && t.a === avatar)) && (t.type === 'parent' || t.type === 'child' || t.type === 'sibling'));
}
/* ---------- trying for a baby ---------- */
export const pregnancy = (g) => family(g).pregnancy;
export function canTryForBaby(g, avatar) {
    return romOf(g, avatar).status !== 'none' && !pregnancy(g) && !romanceBlocked(g, avatar);
}
// They said yes: whether it happens this time is up to chance (it can take a few tries).
export function conceive(g, avatar, name, rnd = Math.random) {
    const f = family(g);
    const tries = (f.tries[avatar] ?? 0) + 1;
    if (rnd() < Math.min(0.85, 0.45 + 0.15 * (tries - 1))) {
        f.tries[avatar] = 0;
        f.pregnancy = { partner: avatar, name, start: g.day, due: g.day + PREGNANCY_DAYS };
        note(g, '{u} and {0} are expecting a baby!', [name], [avatar], g.player.loc, 'family');
        return `You and ${name} are expecting a baby! It should arrive in about ${PREGNANCY_DAYS} days.`;
    }
    f.tries[avatar] = tries;
    note(g, '{u} and {0} are trying for a baby.', [name], [avatar], g.player.loc, 'family');
    return `You and ${name} are trying for a baby. Not this time, but you can try again.`;
}
export const daysLeft = (g) => { const p = pregnancy(g); return p ? Math.max(0, p.due - g.day) : 0; };
// The birth screen shows when the due day comes (the player names the baby there).
export const birthDue = (g) => { const p = pregnancy(g); return !!p && g.day >= p.due; };
// The baby is born: `avatar` is the new card (made by the screen); the engine makes them part of the world.
export function welcomeBaby(g, w, avatar, name, base) {
    const f = family(g);
    const p = f.pregnancy;
    if (!p)
        return;
    const kid = { avatar, name, parent: p.partner, born: g.day, stage: 0, lastBirthday: g.day };
    f.kids.push(kid);
    f.pregnancy = null;
    g.cast[avatar] = { ...base, avatar, name, occupation: null, leisure: [], met: true, routine: kidRoutine(w, kid) };
    liveTogether(g, '__you', avatar);
    setTie(g, { a: '__you', b: avatar, type: 'parent', tone: 'close' });
    if (g.cast[p.partner])
        setTie(g, { a: p.partner, b: avatar, type: 'parent', tone: 'close' });
    bump(g, avatar, 60);
    note(g, '{0} was born! {u} and {1} are parents now.', [name, p.name], [avatar, p.partner], playerHomeId, 'family');
}
/* ---------- growing up: a birthday, once a week ---------- */
export const canCelebrate = (g, k) => k.stage < STAGES.length - 1 && g.day - k.lastBirthday >= BIRTHDAY_EVERY;
export const daysToBirthday = (g, k) => Math.max(0, k.lastBirthday + BIRTHDAY_EVERY - g.day);
export function celebrate(g, w, k) {
    if (!canCelebrate(g, k))
        return '';
    k.stage++;
    k.lastBirthday = g.day;
    const r = g.cast[k.avatar];
    if (r)
        r.routine = kidRoutine(w, k);
    bump(g, k.avatar, 8);
    const st = stageOf(k);
    note(g, '{u} celebrated {0}\'s birthday. {0} is now a {1}.', [k.name, st.name.toLowerCase()], [k.avatar, k.parent], g.player.loc, 'family');
    return `${k.name} is now a ${st.name.toLowerCase()}!`;
}
// Where a child spends the day: babies and toddlers stay home; children and teens go to school on weekdays (when
// the world has a place for studying); a young adult gets an ordinary routine.
function kidRoutine(w, k) {
    const st = stageOf(k).id;
    const school = w.places.find(p => (p.tags ?? []).includes('study'))?.id;
    if ((st === 'child' || st === 'teen') && school)
        return { weekday: [[0, 'home'], [8, school], [st === 'teen' ? 16 : 15, 'home']], weekend: [[0, 'home']] };
    if (st === 'adult')
        return structuredClone(Object.values(w.cast.routineTemplates)[0]);
    return { weekday: [[0, 'home']], weekend: [[0, 'home']] };
}
/* ---------- for the AI ---------- */
export function familyLine(g, present) {
    const out = [];
    for (const r of present) {
        const k = kidOf(g, r.avatar);
        if (!k)
            continue;
        const st = stageOf(k);
        out.push(`${k.name} is {{user}}'s child, now ${st.desc} (about ${st.age} years old).${st.id !== 'adult' ? ` ${k.name} is a minor.` : ''} The bond between them is family only: never anything romantic or sexual involving ${k.name}.`);
    }
    const p = pregnancy(g);
    if (p && present.some(r => r.avatar === p.partner))
        out.push(`{{user}} and ${p.name} are expecting a baby (due in ${daysLeft(g)} days).`);
    return out.join(' ');
}
onDay.push((g, w) => {
    const p = pregnancy(g);
    if (p && systemOn(w, 'family') && g.day >= p.due && !p.born) {
        p.born = true;
        return [`It's time: the baby is coming!`];
    }
    return [];
});
void nowAbs;
