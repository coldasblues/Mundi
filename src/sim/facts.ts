// Memory as atomic facts. Instead of long AI summaries running in the background (they drift and cost tokens),
// the engine writes short facts as things happen ("You met Bianca at the Café.") and keeps them in the save,
// each one pointing to the people and the place it is about. The AI only ever gets the facts of whoever is in
// the scene right now, and the Journal lists them all, in order, without asking the AI anything.
// A fact's text is an English template ("{u} met {0} at {1}."): {u} is the player (their name for the AI, "You" on
// screen), {0}, {1}… the names in it. It is translated on screen like the rest of Mundi.
import { nowAbs, type Save } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { placeOf, playerHomeId } from './places.js';
import { personaName } from '../st/bridge.js';
import { seenAs } from './hooks.js';
export { seenAs };

export interface Fact { id: string; at: number; place: string; who: string[]; t: string; a?: string[]; kind?: string; u?: string }   // u: who "{u}" was (the one being played then)

const MAX = 500;
export const facts = (g: Save): Fact[] => (((g as any).facts ??= []) as Fact[]);

// Writes a fact. `who`: the people it is about (their avatars); `place`: where it happened (by default, here).
export function note(g: Save, t: string, a: string[] = [], who: string[] = [], place = g.player.loc, kind = 'event'): Fact {
    const f: Fact = { id: `f${nowAbs(g)}_${facts(g).length}`, at: nowAbs(g), place, who: [...new Set(who)], t, a, kind, u: seenAs.map(f => f(g)).find(Boolean) || personaName() };
    const list = facts(g);
    // the same thing twice in a row (two clicks) is one fact
    const last = list.at(-1);
    if (last && last.t === f.t && JSON.stringify(last.a) === JSON.stringify(f.a) && f.at - last.at < 30) return last;
    list.push(f);
    if (list.length > MAX) list.splice(0, list.length - MAX);
    return f;
}

export const fill = (t: string, a: string[] = [], u = 'You') => t.replace(/\{u\}/g, u).replace(/\{(\d)\}/g, (_, n) => a[Number(n)] ?? '');
// someone else (an earlier character you played) did it: their name, not yours
export const factText = (f: Fact, u = 'You') => fill(f.t, f.a, f.u && f.u !== personaName() ? f.u : u);
export const placeName = (g: Save, w: WorldDef, id: string) => (id === playerHomeId ? 'home' : id === 'out' ? 'out of the house' : placeOf(g, w, id)?.name ?? id);

export const factsOf = (g: Save, avatar: string, n = 6) => facts(g).filter(f => f.who.includes(avatar)).slice(-n);
export const factsAt = (g: Save, place: string, n = 3) => facts(g).filter(f => f.place === place).slice(-n);

// For the AI: only the people in this scene, and this place (surgical injection).
export function memoryLines(g: Save, w: WorldDef, present: { avatar: string; name: string }[], me: string): string[] {
    const day = (f: Fact) => `day ${Math.floor(f.at / 1440)}`;
    const out: string[] = [];
    for (const r of present) {
        const list = factsOf(g, r.avatar);
        if (list.length) out.push(`What ${r.name} remembers: ${list.map(f => `(${day(f)}, ${placeName(g, w, f.place)}) ${factText(f, me)}`).join(' ')}`);
    }
    const shown = new Set(present.flatMap(r => factsOf(g, r.avatar).map(f => f.id)));
    const here = factsAt(g, g.player.loc).filter(f => !shown.has(f.id));
    if (here.length) out.push(`Earlier in this place: ${here.map(f => `(${day(f)}) ${factText(f, me)}`).join(' ')}`);
    return out;
}
