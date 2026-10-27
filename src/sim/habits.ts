// Habits become traits: what you do often enough sticks ("Early riser", "Heavy drinker", "Devout"…) and fades when
// you stop. The world says which habits exist (actions, tags or hours that count, how many times in how many days).
// A habit is a trait like any other: jobs like it, the AI knows it; some also nudge your needs every morning.
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef, type HabitDef } from '../core/world.js';
import { onAction, onDay } from './hooks.js';
import { addStatus } from './needs.js';
import { note } from './facts.js';
import { placeOf } from './places.js';

interface Habits { log: Record<string, number[]>; has: string[] }
export const habitsOf = (g: Save): Habits => (((g as any).habits ??= { log: {}, has: [] }) as Habits);
const on = (w: WorldDef) => systemOn(w, 'habits') && !!w.habits?.length;
const traitList = (g: Save) => ((g.player.traits ??= {}) as Record<string, string[]>).habits ??= [];

export function matches(h: HabitDef, a: { id: string }, minutes: number, placeTags: string[] = []): boolean {
    const byAction = h.actions?.length ? h.actions.includes(a.id) : true;
    const byTag = h.tags?.length ? placeTags.some(t => h.tags!.includes(t)) : true;
    const hr = Math.floor(minutes / 60) % 24;
    const hours = h.hours && typeof h.hours[0] === 'number' && typeof h.hours[1] === 'number' ? h.hours : null;
    const byHour = !hours ? true : hours[0] <= hours[1] ? hr >= hours[0] && hr < hours[1] : hr >= hours[0] || hr < hours[1];
    return byAction && byTag && byHour && (!!h.actions?.length || !!h.tags?.length || !!hours);
}
onAction.push((g, w, a) => {
    if (!on(w)) return;
    const hs = habitsOf(g);
    const tags = placeOf(g, w, g.player.loc)?.tags ?? [];
    for (const h of w.habits!) if (matches(h, a, g.minutes, tags)) {
        const l = (hs.log[h.id] ??= []);
        if (l.filter(d => d === g.day).length < 2) l.push(g.day);   // at most twice a day counts
    }
});
// Each morning: habits that stuck, habits that faded, and what they do to you.
export function habitDay(g: Save, w: WorldDef): string[] {
    if (!on(w)) return [];
    const hs = habitsOf(g); const out: string[] = [];
    for (const h of w.habits!) {
        const l = (hs.log[h.id] ?? []).filter(d => g.day - d < Math.max(h.days, h.lose ?? h.days * 2));
        hs.log[h.id] = l;
        const recent = l.filter(d => g.day - d < h.days).length;
        const has = hs.has.includes(h.id);
        if (!has && recent >= h.count) {
            hs.has.push(h.id);
            if (!traitList(g).includes(h.trait)) traitList(g).push(h.trait);
            note(g, '{u} has become: {0}.', [h.trait.toLowerCase()], [], g.player.loc, 'skill');
            out.push(`New trait from a habit: ${h.trait}.`);
        } else if (has && !l.some(d => g.day - d < (h.lose ?? h.days * 2))) {
            hs.has = hs.has.filter(x => x !== h.id);
            (g.player.traits as any).habits = traitList(g).filter(t => t !== h.trait);
            note(g, '{u} is no longer {0}.', [h.trait.toLowerCase()], [], g.player.loc, 'skill');
            out.push(`A habit faded: you are no longer "${h.trait}".`);
        }
        if (hs.has.includes(h.id)) for (const [id, v] of Object.entries(h.daily ?? {})) addStatus(g, w, id, v);
    }
    return out;
}
onDay.push(habitDay);
export const habitTraits = (g: Save, w: WorldDef) => (on(w) ? habitsOf(g).has.map(id => w.habits!.find(h => h.id === id)?.trait).filter(Boolean) as string[] : []);
// How close you are to each habit (for the Reputation app).
export function habitProgress(g: Save, w: WorldDef) {
    if (!on(w)) return [];
    const hs = habitsOf(g);
    return w.habits!.map(h => ({ h, n: (hs.log[h.id] ?? []).filter(d => g.day - d < h.days).length, has: hs.has.includes(h.id) }));
}
export function habitLine(g: Save, w: WorldDef): string {
    const t = habitTraits(g, w);
    return t.length ? `Habits that became part of {{user}}: ${t.join(', ').toLowerCase()}.` : '';
}
