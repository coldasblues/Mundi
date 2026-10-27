// A day in people's lives, beyond their routine, and what places remember.
// · Routines get interrupted: someone is home sick, runs errands, visits a friend, works late, or stays in while
//   the town is tense. These come from the day itself (worked out, not stored), so every look gives the same answer.
// · Places remember you: how often you come (a regular, a first time), who works there and who comes often, and
//   where each person last saw you.
import { nowAbs } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { onHour } from './hooks.js';
import { isWeekend } from './time.js';
import { isHome, placeOf, playerHomeId } from './places.js';
import { regionOf, regionState } from './worldstate.js';
import { presentAt } from './people.js';
import { isOpen } from './daynight.js';
import { overhear } from './living.js';
import { lex } from '../core/lexicon.js';
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
const homeOf = (r) => (r.homeWith === '__you' ? playerHomeId : r.homeWith ? `home:${r.homeWith}` : `home:${r.avatar}`);
const isKid = (g, a) => (g.family?.kids ?? []).some((k) => k.avatar === a);
// What interrupts her routine on a given day (none most days). Same world, day and person: same answer.
const memo = new WeakMap(); // asked often (where is everyone?): worked out once
export function breakOf(g, w, r, day) {
    if (!systemOn(w, 'living') || isKid(g, r.avatar))
        return null;
    const tense = regionState(g, w, regionOf(g, w, homeOf(r))).tension >= 60;
    const key = `${w.id}|${day}|${r.avatar}|${homeOf(r)}|${r.occupation}|${tense}`;
    let m = memo.get(g);
    if (!m)
        memo.set(g, m = new Map());
    if (m.has(key))
        return m.get(key);
    const b = work(g, w, r, day, tense);
    if (m.size > 5000)
        m.clear();
    m.set(key, b);
    return b;
}
function work(g, w, r, day, tense) {
    const k = `${g.world}|${day}|${r.avatar}`;
    const roll = H(`${k}|brk`), at = (h) => day * 1440 + h * 60;
    const home = homeOf(r);
    if (roll < 0.03)
        return { kind: 'sick', from: at(0), to: at(24), place: home, why: 'is home sick today' };
    if (roll < 0.15) {
        const spots = w.places.filter(p => !p.link && (p.tags ?? []).some(t => t === 'shop' || t === 'service') && p.map === regionOf(g, w, home));
        const list = spots.length ? spots : w.places.filter(p => !p.link && (p.tags ?? []).some(t => t === 'shop' || t === 'service'));
        const h = 9 + Math.floor(H(`${k}|when`) * 8);
        const open = list.filter(p => isOpen(w, p.id, h * 60)); // somewhere open at that hour
        if (open.length) {
            const p = open[Math.floor(H(`${k}|where`) * open.length)];
            return { kind: 'errand', from: at(h), to: at(h) + 60 + Math.floor(H(`${k}|long`) * 2) * 30, place: p.id, why: 'is running errands' };
        }
    }
    if (roll < 0.21) {
        const pairs = g.living?.pairs ?? [];
        const ties = g.living?.ties ?? [];
        const close = [...pairs.filter(p => p.includes(r.avatar)).flat(), ...ties.filter(t => (t.a === r.avatar || t.b === r.avatar) && t.type !== 'rival' && t.type !== 'ex').flatMap(t => [t.a, t.b])]
            .filter(a => a !== r.avatar && a !== '__you' && g.cast[a] && homeOf(g.cast[a]) !== home);
        const pool = close.length ? close : Object.keys(g.cast).filter(a => a !== r.avatar && homeOf(g.cast[a]) !== home && !isKid(g, a));
        if (pool.length) {
            const o = g.cast[pool[Math.floor(H(`${k}|whom`) * pool.length)]], h = 18 + Math.floor(H(`${k}|when`) * 3);
            return { kind: 'visit', from: at(h), to: at(h) + 120, place: homeOf(o), why: `is visiting ${o.name}` };
        }
    }
    const job = systemOn(w, 'jobs') ? w.occupations.find(o => o.id === r.occupation) : null;
    if (roll < 0.29 && job && !isWeekend(day) && job.hours && job.hours[1] < 22 && job.hours[1] > job.hours[0]) {
        return { kind: 'late', from: at(job.hours[1]), to: at(job.hours[1] + 2), place: job.place, why: 'is working late' };
    }
    // a tense town keeps people in at night
    if (tense && H(`${k}|in`) < 0.5)
        return { kind: 'in', from: at(19), to: at(24), place: home, why: 'is staying in (the town is tense)' };
    return null;
}
// The interruption going on right now, if any.
export function breakNow(g, w, r, at = nowAbs(g)) {
    const b = breakOf(g, w, r, Math.floor(at / 1440));
    return b && at >= b.from && at < b.to ? b : null;
}
const mem = (g) => { const l = (g.living ??= {}); l.visits ??= {}; l.seen ??= {}; return l; };
export const visitsTo = (g, place) => mem(g).visits[place] ?? null;
export const lastSeen = (g, avatar) => mem(g).seen[avatar] ?? null;
// Each hour: a new place you came to counts as a visit, and everyone here sees you.
export function notice(g, w, present) {
    if (!systemOn(w, 'living'))
        return;
    const m = mem(g), now = nowAbs(g), loc = g.player.loc;
    if (m.at !== loc) {
        m.at = loc;
        if (!isHome(loc)) {
            const v = (m.visits[loc] ??= { n: 0, first: now, last: now });
            v.n += 1;
            v.last = now;
        }
    }
    for (const r of present)
        if (r.met)
            m.seen[r.avatar] = { place: loc, at: now };
}
onHour.push((g, w) => {
    if (g.asleep)
        return [];
    const here = presentAt(g, w, g.player.loc);
    notice(g, w, here);
    return overhear(g, w, here).map(r => lex(w, 'overheard', r.text)); // a rumor you overhear goes into your journal
});
// For the AI: what this place and the people here remember.
export function placeMemoryLines(g, w, present) {
    if (!systemOn(w, 'living'))
        return [];
    const loc = g.player.loc, out = [];
    if (!isHome(loc)) {
        const v = visitsTo(g, loc);
        if (!v || v.n <= 1)
            out.push(`It is {{user}}'s first time here.`);
        else if (v.n >= 8)
            out.push(`{{user}} is a regular here (${v.n} visits); the staff and regulars know {{user}}'s face.`);
        else if (v.n >= 3)
            out.push(`{{user}} has been here a few times before.`);
    }
    const job = (r) => systemOn(w, 'jobs') ? w.occupations.find(o => o.id === r.occupation) : null;
    const works = present.filter(r => job(r)?.place === loc).map(r => r.name);
    const often = present.filter(r => job(r)?.place !== loc && r.leisure.includes(loc)).map(r => r.name);
    if (works.length)
        out.push(`${works.join(', ')} ${works.length > 1 ? 'work' : 'works'} here.`);
    if (often.length)
        out.push(`${often.join(', ')} ${often.length > 1 ? 'come' : 'comes'} here often.`);
    const now = nowAbs(g);
    for (const r of present.filter(x => x.met)) {
        const s = lastSeen(g, r.avatar);
        if (!s || s.place === loc || now - s.at > 7 * 1440 || now - s.at < 60)
            continue;
        const days = Math.floor(now / 1440) - Math.floor(s.at / 1440);
        out.push(`${r.name} last saw {{user}} at ${placeOf(g, w, s.place)?.name ?? 'another place'}, ${days <= 0 ? 'earlier today' : days === 1 ? 'yesterday' : `${days} days ago`}.`);
    }
    return out;
}
// For the AI: why the people here are here, when it is not their routine.
export function whyHereLines(g, w, present) {
    return present.map(r => { const b = breakNow(g, w, r); return b ? `${r.name} ${b.why}.` : ''; }).filter(Boolean);
}
