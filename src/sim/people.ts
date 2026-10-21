// The people of the world: where each one is right now, following their routine (unless she is with you,
// or has plans with you).
import { lockedHere } from './life.js';
import { castGone } from './roster.js';
import { nowAbs, type Save, type Resident } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { isWeekend } from './time.js';
import { appointmentNow, isWith } from './social.js';
import { weatherOn } from './weather.js';

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// Outdoor places are the ones only for leisure (a park, a beach); a café or a mall has a roof.
const outdoors = (w: WorldDef, id: string) => { const t = w.places.find(p => p.id === id)?.tags ?? []; return t.includes('leisure') && !t.some(x => ['food', 'shop', 'service', 'work', 'study'].includes(x)); };
function leisureSpot(g: Save, w: WorldDef, r: Resident, day: number, stepHour: number) {
    let list = r.leisure.length ? r.leisure : w.places.filter(p => p.tags?.includes('leisure')).map(p => p.id);
    // rain changes plans: outdoor spots are skipped for somewhere with a roof (or home)
    if (weatherOn(g.world, day).rain) {
        const dry = list.filter(id => !outdoors(w, id));
        list = dry.length ? dry : w.places.filter(p => (p.tags ?? []).some(t => t === 'food' || t === 'shop')).map(p => p.id);
        if (!list.length || hash(`${r.avatar}|rain|${day}`) % 3 === 0) return `home:${r.avatar}`;
    }
    return list[hash(`${r.avatar}|${day}|${stepHour}`) % list.length] ?? `home:${r.avatar}`;
}

// The step of her routine at a given moment (absolute minutes): [start hour, 'home' | 'work' | 'leisure' | place id].
export function routineStep(r: Resident, at: number): [number, string] {
    const day = Math.floor(at / 1440), h = Math.floor((at % 1440) / 60);
    const steps = isWeekend(day) ? r.routine.weekend : r.routine.weekday;
    let cur = steps[0];
    for (const s of steps) if (s[0] <= h) cur = s;
    return cur as [number, string];
}

// Where her routine puts her at a given moment (plans and company left aside).
export function routineAt(g: Save, w: WorldDef, r: Resident, at: number): string {
    const [start, target] = routineStep(r, at);
    const day = Math.floor(at / 1440);
    // someone who lives with you (or with someone else) is at that home
    const homeId = (r as any).homeWith === '__you' ? 'home:player' : (r as any).homeWith ? `home:${(r as any).homeWith}` : `home:${r.avatar}`;
    if (target === 'home') return homeId;
    if (target === 'work') {
        const job = w.features?.jobs !== false ? w.occupations.find(o => o.id === r.occupation) : null;
        return job ? job.place : leisureSpot(g, w, r, day, start);
    }
    if (target === 'leisure') return leisureSpot(g, w, r, day, start);
    return w.places.some(p => p.id === target) ? target : homeId;
}

/** Other systems plug in here without being imported (the hostile actions engine: your captive, someone knocked out). */
export const peopleHooks = { at: (_g: Save, _avatar: string): string => '' };
export function whereNow(g: Save, w: WorldDef, r: Resident): string {
    const forced = peopleHooks.at(g, r.avatar);        // held by you (with you), or lying where they were knocked out
    if (forced) return forced;
    if (isWith(g, r.avatar)) return g.player.loc;      // she came along with you
    const locked = lockedHere(g, r.avatar);            // in the middle of a conversation with you
    if (locked) return locked;
    const appt = appointmentNow(g, r.avatar);          // plans with you win over the routine
    if (appt) return appt.place;
    const left = (g as any).swap?.left?.[r.avatar];    // the one you played until now stays where you left them for a while
    if (left && nowAbs(g) < left.until) return left.loc;
    return routineAt(g, w, r, nowAbs(g));
}

export const residents = (g: Save) => Object.values(g.cast);
// (someone you are playing as is not "here": you are them)
const selfOf = (g: Save) => { const s = (g as any).swap; return s ? (s.avatar || s.origCard || '') : ''; };
// (the roster: someone dead, captured or missing is nowhere; someone who just walked out of your scene is not in it)
export const presentAt = (g: Save, w: WorldDef, loc: string) => residents(g).filter(r => r.avatar !== selfOf(g) && whereNow(g, w, r) === loc && !castGone(g, r.avatar, loc === g.player.loc));
