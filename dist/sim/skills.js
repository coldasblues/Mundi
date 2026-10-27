// Skills: courses you take (at home, online, or at the university) that teach you traits; the job interview, a
// roll where the traits a job looks for are your bonus; and the counters some life goals are measured with.
// The traits you have are what the d20 rolls use (each matching trait is +2), so learning one helps everywhere.
import { nowAbs } from '../core/store.js';
import { systemOn, isScenario } from '../core/world.js';
import { note } from './facts.js';
import { book } from './ledger.js';
import { priceOf } from './bills.js';
import { playerHomeId, placeOf } from './places.js';
export const coursesOf = (w) => (systemOn(w, 'courses') ? w.catalogs.courses ?? [] : []);
export function learning(g) {
    const p = g.player;
    const s = (p.learning ??= {});
    s.progress ??= {};
    s.lastDay ??= {};
    s.done ??= [];
    s.count ??= {};
    s.interviews ??= {};
    s.earned ??= [];
    return s;
}
// Counters for life goals (meals cooked, workouts, shifts…).
export const countUp = (g, key, n = 1) => { const c = learning(g).count; c[key] = (c[key] ?? 0) + n; };
export const countOf = (g, key) => learning(g).count[key] ?? 0;
/* ---------- traits you gain ---------- */
// A trait learned in a course or earned with a life goal: kept apart from the ones you chose, so the profile can say where it came from.
export function gainTrait(g, trait, from) {
    const t = (g.player.traits ??= {});
    const key = from === 'course' ? 'learned' : 'earned';
    if (Object.values(t).flat().includes(trait))
        return false;
    (t[key] ??= []).push(trait);
    return true;
}
/* ---------- courses ---------- */
export const courseOf = (w, id) => coursesOf(w).find(c => c.id === id);
export const hasCourse = (g, id) => learning(g).done.includes(id);
export const canStudyHere = (g, w) => isScenario(w) || g.player.loc === playerHomeId || (placeOf(g, w, g.player.loc)?.tags ?? []).includes('study');
export const studiedToday = (g, id) => learning(g).lastDay[id] === g.day;
export function enroll(g, w, id) {
    const c = courseOf(w, id);
    if (!c)
        return '';
    const l = learning(g);
    if (l.current)
        return 'Finish the course you are taking first.';
    if (l.done.includes(id))
        return 'You already finished this course.';
    const price = priceOf(g, c.cost);
    if (g.player.money < price)
        return 'Not enough money.';
    g.player.money -= price;
    book(g, `Course: ${c.name}`, -price);
    l.current = id;
    l.progress[id] ??= 0;
    note(g, '{u} enrolled in a course: {0}.', [c.name], [], g.player.loc, 'study');
    return '';
}
export function dropCourse(g) { learning(g).current = undefined; }
// One study session (once a day): a day of the course. The last one finishes it and teaches its traits.
export function studySession(g, w) {
    const l = learning(g);
    const c = courseOf(w, l.current);
    if (!c)
        return [];
    if (studiedToday(g, c.id))
        return ['You already studied today. Come back tomorrow.'];
    l.lastDay[c.id] = g.day;
    l.progress[c.id] = (l.progress[c.id] ?? 0) + 1;
    if (l.progress[c.id] < c.days)
        return [`${c.name}: day ${l.progress[c.id]} of ${c.days} done.`];
    l.done.push(c.id);
    l.current = undefined;
    const got = c.grants.filter(t => gainTrait(g, t, 'course'));
    note(g, '{u} finished the course "{0}".', [c.name], [], g.player.loc, 'study');
    return [`You finished ${c.name}!${got.length ? ` You are now ${got.join(' and ')}.` : ''}`];
}
/* ---------- the job interview ---------- */
// (a course the world no longer offers is not asked for: the job would be out of reach forever)
export const missingCourses = (g, w, o) => (o.courses ?? []).filter((id) => !!courseOf(w, id) && !hasCourse(g, id)).map((id) => courseOf(w, id)?.name ?? id);
export function interviewDc(o) { const top = o.ranks.at(-1)?.pay ?? 0; return 9 + (o.needs?.length ? 3 : 0) + (top >= 50 ? 2 : 0); }
export function interviewBonus(g, o, traits) {
    let b = 0;
    if ((o.needs ?? []).some(t => traits.includes(t)))
        b += 4;
    b += Math.min(6, (o.likes ?? []).filter(t => traits.includes(t)).length * 2);
    if ((o.courses ?? []).length)
        b += 2; // you have the course they ask for
    const s = g.player.stats;
    if ((s.hygiene ?? 100) < 30)
        b -= 3; // nobody hires someone who smells
    if ((s.energy ?? 100) < 25)
        b -= 2;
    if ((s.mood ?? 100) < 25)
        b -= 2;
    return b;
}
export const interviewChance = (g, o, traits) => { const b = interviewBonus(g, o, traits), dc = interviewDc(o); let ok = 0; for (let d = 1; d <= 20; d++)
    if (d === 20 || (d > 1 && d + b >= dc))
        ok++; return ok * 5; };
export const triedToday = (g, id) => learning(g).interviews[id] === g.day;
export function interview(g, o, traits, rnd = Math.random) {
    learning(g).interviews[o.id] = g.day;
    const d20 = 1 + Math.floor(rnd() * 20), bonus = interviewBonus(g, o, traits), dc = interviewDc(o);
    const ok = d20 === 20 || (d20 > 1 && d20 + bonus >= dc);
    const crit = d20 === 20;
    void nowAbs;
    return { ok, crit, text: ok ? (crit ? 'They loved you: you start with a head start toward your first promotion.' : 'The interview went well.')
            : d20 === 1 ? 'The interview was a disaster.' : 'They chose someone else this time. Try again tomorrow.' };
}
