// Hobbies that level up: guitar, painting, working out, cooking… The world says which actions train each one.
// Practice gives experience (more when it goes well); each level adds to that hobby's rolls (+1 every 2 levels),
// raises what it pays (busking tips, a painting's price) and can open jobs that ask for it (a bar musician needs
// Guitar 4). The AI is told how good you are, and a new level is remembered like anything else you do.
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef, type HobbyDef, type ActionDef, type Occupation } from '../core/world.js';
import { note } from './facts.js';

// Experience needed for each level (level 10 is the top).
export const LEVELS = [0, 20, 50, 100, 170, 260, 380, 530, 720, 950, 1250];
export const MAX_LEVEL = LEVELS.length - 1;
const TITLES = ['New to it', 'Beginner', 'Beginner', 'Getting there', 'Decent', 'Good', 'Good', 'Very good', 'Very good', 'Excellent', 'A master'];

const on = (w: WorldDef | null | undefined) => !!w && systemOn(w, 'hobbies') && !!w.hobbies?.length;
export const hobbiesOf = (w: WorldDef | null | undefined): HobbyDef[] => (on(w) ? w!.hobbies! : []);
// What the save keeps: experience per hobby. Old saves start from what they already did (meals, workouts, paintings).
export function hobbyXp(g: Save): Record<string, number> {
    const p = g.player as any;
    if (!p.hobbies) {
        const c = p.learning?.count ?? {};
        p.hobbies = {};
        const seed: Record<string, number> = { cooking: (c.meals ?? 0) * 6, fitness: (c.workouts ?? 0) * 8, painting: (c.paintings ?? 0) * 10 };
        for (const [k, v] of Object.entries(seed)) if (v > 0) p.hobbies[k] = Math.min(LEVELS[5], v);
    }
    return p.hobbies;
}
export const levelFor = (xp: number) => { let l = 0; while (l < MAX_LEVEL && xp >= LEVELS[l + 1]) l++; return l; };
export const levelOf = (g: Save, id: string) => levelFor(hobbyXp(g)[id] ?? 0);
export const titleOf = (level: number) => TITLES[Math.max(0, Math.min(MAX_LEVEL, level))];
export function progressOf(g: Save, id: string) {
    const xp = hobbyXp(g)[id] ?? 0, l = levelFor(xp);
    if (l >= MAX_LEVEL) return { level: l, xp, next: 0, pct: 100 };
    return { level: l, xp, next: LEVELS[l + 1], pct: Math.round(((xp - LEVELS[l]) / (LEVELS[l + 1] - LEVELS[l])) * 100) };
}
// The hobby an action trains (from the world's list, or set on the action itself).
export const hobbyFor = (w: WorldDef | null | undefined, a: { id: string; hobby?: string }): HobbyDef | null =>
    hobbiesOf(w).find(h => h.id === a.hobby || h.actions.includes(a.id)) ?? null;
// On its roll: +1 every 2 levels.
export const hobbyBonus = (g: Save, w: WorldDef | null | undefined, a: ActionDef) => { const h = hobbyFor(w, a); return h ? Math.floor(levelOf(g, h.id) / 2) : 0; };
// On what it pays: +12% a level (or the hobby's own rate).
export const hobbyPay = (g: Save, w: WorldDef | null | undefined, a: ActionDef) => { const h = hobbyFor(w, a); return h ? 1 + (levelOf(g, h.id) * (h.pay ?? 12)) / 100 : 1; };

// After you do it: experience (10 when it goes well, 4 when not, 15 on a great day; actions without a roll give 6).
export function practice(g: Save, w: WorldDef, a: ActionDef, success: boolean | null, great = false): string[] {
    const h = hobbyFor(w, a); if (!h) return [];
    const xp = hobbyXp(g);
    const before = levelFor(xp[h.id] ?? 0);
    xp[h.id] = (xp[h.id] ?? 0) + (success === null ? 6 : great ? 15 : success ? 10 : 4);
    const after = levelFor(xp[h.id]);
    if (after <= before) return [];
    note(g, '{u} got better at {0} (level {1}).', [h.name.toLowerCase(), String(after)], [], g.player.loc, 'skill');
    const jobs = w.occupations.filter(o => o.hobby?.id === h.id && o.hobby.level === after).map(o => o.name);
    return [`${h.icon ?? '⭐'} ${h.name}: level ${after} (${titleOf(after).toLowerCase()}).${jobs.length ? ` New job you can apply for: ${jobs.join(', ')}.` : ''}`];
}

// Jobs: the hobby level they ask for.
export const hobbyFits = (g: Save, w: WorldDef | null | undefined, o: Occupation) => !on(w) || !o.hobby?.id || levelOf(g, o.hobby.id) >= (o.hobby.level ?? 0);
export function hobbyNeed(g: Save, w: WorldDef | null | undefined, o: Occupation): string {
    if (!on(w) || !o.hobby?.id) return '';
    const h = hobbiesOf(w).find(x => x.id === o.hobby!.id);
    return h ? `${h.name} level ${o.hobby.level} (you: ${levelOf(g, h.id)})` : '';
}

// For the AI: what you are good at (level 3 and up).
export function hobbyLine(g: Save, w: WorldDef): string {
    const list = hobbiesOf(w).map(h => [h, levelOf(g, h.id)] as const).filter(([, l]) => l >= 3);
    return list.length ? `{{user}}'s hobbies: ${list.map(([h, l]) => `${h.name.toLowerCase()} (${titleOf(l).toLowerCase()}, level ${l} of ${MAX_LEVEL})`).join(', ')}.` : '';
}
