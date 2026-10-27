// Day and night: the parts of the day the world named (Dawn, Morning… or its own) change what is open, what things
// cost, the mood of the streets, and how places and maps look.
// · Opening hours: a place is closed in some parts of the day (place.closed: the ids of those parts). A place
//   without a list closes like places of its kind do (shops at night, offices at dawn…); parks never close.
// · Prices: each part of the day can make things cost more or less (time.periods[].prices, × as listed).
// · Pictures: a place, a home and a map can have a picture for each part of the day (bgs / images: { partId: url });
//   without one, the usual picture is used.
import { closedByEvents } from './hooks.js';
export { closedByEvents };
import type { Save } from '../core/store.js';
import type { WorldDef, Place } from '../core/world.js';
import { period } from './time.js';

// The standard part of the day a world's period stands for (a "Vigil" from 0:00 counts as dawn…).
export function partOf(w: WorldDef, minutes: number): 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night' {
    const p = period(w, minutes);
    if (['dawn', 'morning', 'afternoon', 'evening', 'night'].includes(p.id)) return p.id as any;
    const h = (p.from ?? minutes) / 60;
    return h < 6 ? 'dawn' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : h < 22 ? 'evening' : 'night';
}
export const periodId = (w: WorldDef, minutes: number) => period(w, minutes).id;

/* ---------- opening hours ---------- */

// When places of each kind are closed (standard parts). A place is closed only when all its kinds are.
const CLOSED_BY_TAG: Record<string, string[]> = {
    food: ['dawn'], shop: ['dawn', 'night'], service: ['dawn', 'evening', 'night'], study: ['dawn', 'night'],
    work: ['dawn', 'night'], sport: ['dawn'], leisure: [], health: [],
};
// The parts of the day (the world's own period ids) a place is closed in.
export function closedOf(w: WorldDef, p: Place): string[] {
    if (Array.isArray(p.closed)) return p.closed;
    // tags that say nothing about hours (contracts, a tower…) do not count
    const kinds = (p.tags ?? []).filter(t => t in CLOSED_BY_TAG);
    const tags = kinds.length ? kinds : ['leisure'];
    return w.time.periods.filter(per => {
        const part = partOf(w, per.from);
        return tags.every(t => (CLOSED_BY_TAG[t] ?? []).includes(part));
    }).map(per => per.id);
}
export function isOpen(w: WorldDef, placeId: string, minutes: number): boolean {
    const p = w.places.find(x => x.id === placeId);
    if (!p || p.link) return true;   // homes and anything not a public place are always "open"
    return !closedOf(w, p).includes(periodId(w, minutes));
}
// (a blood moon or a storm that shuts the town: shops stay closed)
export const openNow = (g: Save, w: WorldDef, placeId: string) => isOpen(w, placeId, g.minutes) && !closedByEvents.some(f => f(g, w, placeId));

/* ---------- prices ---------- */

export const periodPrice = (w: WorldDef, minutes: number) => { const v = Number((period(w, minutes) as any).prices); return v > 0 ? v : 1; };

/* ---------- the mood of the streets ---------- */

const PART_MOOD: Record<string, number> = { dawn: -8, morning: -2, afternoon: 0, evening: 8, night: 3 };
export const partMood = (w: WorldDef, minutes: number) => PART_MOOD[partOf(w, minutes)] ?? 0;

/* ---------- pictures for each part of the day ---------- */

// Pictures by time of day: three for every world, whatever its periods are called. Day 5:00–12:00, afternoon
// 12:00–18:00, night 18:00–5:00. (Pictures saved under a period's id, before, still work.)
export const TIME_SLOTS = [{ id: 'day', name: 'Day' }, { id: 'afternoon', name: 'Afternoon' }, { id: 'night', name: 'Night' }];
export const slotAt = (minutes: number) => { const h = Math.floor((((minutes % 1440) + 1440) % 1440) / 60); return h >= 5 && h < 12 ? 'day' : h >= 12 && h < 18 ? 'afternoon' : 'night'; };
export const pictureAt = (w: WorldDef, minutes: number, base: string | undefined, byPart?: Record<string, string>) => byPart?.[slotAt(minutes)] || byPart?.[periodId(w, minutes)] || base;
