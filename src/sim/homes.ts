// Homes: who lives where. Kept apart from the rest of the game so anything can use it without import cycles.
import type { Save, Resident } from '../core/store.js';
import type { WorldDef } from '../core/world.js';

const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
// Where people live: `${zone}:${x},${y}` (and `#unit` for a second flat at the same address).
export const spotKey = (zone: string, x: number, y: number, unit?: number) => `${zone}:${x},${y}${unit ? `#${unit}` : ''}`;
export const takenHomes = (g: Save, except?: Resident) => new Set([g.player.home, ...Object.values(g.cast).filter(r => r !== except).map(r => r.home)].map(h => spotKey(h.zone, h.x, h.y, (h as any).unit)));
// A free home in a zone (else a free one in another zone). Nobody is put in someone else's home by chance: only a
// household shares one. When every home is taken, a new flat opens at an address in the zone (House 3B…), never `avoid`'s.
export function homeSpot(w: WorldDef, zoneId: string, taken: Set<string>, avoid?: { zone: string; x: number; y: number }) {
    const zone = w.homes.zones.find(z => z.id === zoneId) ?? w.homes.zones[0];
    const ok = (z: typeof zone, s: number[]) => !avoid || avoid.zone !== z.id || avoid.x !== s[0] || avoid.y !== s[1];
    const free = (z: typeof zone) => z.spots.filter(s => ok(z, s) && !taken.has(spotKey(z.id, s[0], s[1]))).map(s => [z, s] as const);
    const others = w.homes.zones.filter(z => z.id !== zone.id);
    const choice = [free(zone), others.flatMap(z => free(z))].find(l => l.length);
    if (choice) {
        const [z, s] = pick(choice);
        taken.add(spotKey(z.id, s[0], s[1]));
        return { zone: z.id, x: s[0], y: s[1], n: z.spots.indexOf(s) + 1 };   // homes are numbered: House 1, House 2…
    }
    const z = zone.spots.some(s => ok(zone, s)) ? zone : w.homes.zones.find(x => x.spots.some(s => ok(x, s))) ?? zone;
    const s = pick(z.spots.filter(s => ok(z, s)).length ? z.spots.filter(s => ok(z, s)) : z.spots);
    let unit = 1; while (taken.has(spotKey(z.id, s[0], s[1], unit))) unit++;
    taken.add(spotKey(z.id, s[0], s[1], unit));
    return { zone: z.id, x: s[0], y: s[1], n: z.spots.indexOf(s) + 1, unit };
}


// Households: everyone at the same address shares one home. With the player there, it is the player's home;
// otherwise the first person who lived there is the "head" whose home the others share (`homeWith`).
export const homeKey = (h: { zone: string; x: number; y: number; unit?: number }) => `${h.zone}:${h.x},${h.y}${h.unit ? `#${h.unit}` : ''}`;
export function normalizeHomes(g: Save) {
    const groups = new Map<string, string[]>();
    for (const r of Object.values(g.cast)) { const k = homeKey(r.home); groups.set(k, [...(groups.get(k) ?? []), r.avatar]); }
    const mine = homeKey(g.player.home);
    for (const [k, list] of groups) {
        if (k === mine) { for (const a of list) (g.cast[a] as any).homeWith = '__you'; continue; }
        // keep the current head when there is one
        const head = list.find(a => !(g.cast[a] as any).homeWith || !list.includes((g.cast[a] as any).homeWith)) ?? list[0];
        for (const a of list) { if (a === head) delete (g.cast[a] as any).homeWith; else (g.cast[a] as any).homeWith = head; }
    }
}
