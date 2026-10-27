// A scenario's floor plan (optional): floors, and where each room of the house is on them. A plan room is a place
// of the world, or a bedroom spot (`spot:<area>:<n>`) that belongs to whoever lives there in this game.
import type { Save } from '../core/store.js';
import { isScenario, type WorldDef, type PlanRoom, type HousePlan } from '../core/world.js';
import { pins, playerHomeId } from './places.js';

export const spotId = (zone: string, k: number) => `spot:${zone}:${k}`;
// The plan is drawn only with a picture of it (a blueprint) on a floor; floors without one still sort the rooms
// (the room pictures, floor by floor). Off: the room pictures, as always.
const hasRooms = (w: WorldDef) => !!w.plan?.floors?.length && !!w.plan.rooms?.some(r => w.plan!.floors.some(f => f.id === r.floor));
export const planOn = (w: WorldDef | null | undefined): w is WorldDef & { plan: HousePlan } =>
    !!w && isScenario(w) && !!w.plan?.on && hasRooms(w) && w.plan!.floors.some(f => !!f.image);
export const floorsOn = (w: WorldDef | null | undefined): w is WorldDef & { plan: HousePlan } => !!w && isScenario(w) && !!w.plan?.on && hasRooms(w);

// The spot a home stands on ('' when it is not one of the area's spots).
export function spotOf(w: WorldDef, h: { zone: string; x: number; y: number } | undefined | null): string {
    if (!h) return '';
    const z = w.homes.zones.find(x => x.id === h.zone);
    const k = z ? z.spots.findIndex(s => s[0] === h.x && s[1] === h.y) : -1;
    return z && k >= 0 ? spotId(z.id, k) : '';
}
// Every room the plan can hold: the world's rooms, then each bedroom spot (with its area's name).
export function planSlots(w: WorldDef): { id: string; name: string; bedroom: boolean }[] {
    const rooms = w.places.filter(p => !p.link).map(p => ({ id: p.id, name: p.name, bedroom: false }));
    const beds = w.homes.zones.flatMap(z => z.spots.map((_, k) => ({ id: spotId(z.id, k), name: z.spots.length > 1 ? `${z.name} ${k + 1}` : z.name, bedroom: true })));
    return [...rooms, ...beds];
}

// What a plan room is in this game: the place to go to, or the bedroom of whoever lives at that spot (you first).
// null: the room is not in this house (turned off for this game), or nobody lives in that bedroom.
export function planTarget(g: Save, w: WorldDef, r: PlanRoom): { loc: string; owner?: string; known: boolean } | null {
    if (!r.id.startsWith('spot:')) return pins(g, w).some(p => p.id === r.id) ? { loc: r.id, known: true } : null;
    if (spotOf(w, g.player.home) === r.id) return { loc: playerHomeId, known: true };
    const there = Object.values(g.cast).filter(c => spotOf(w, c.home) === r.id && !(c as any).homeWith);
    const who = there.find(c => c.met) ?? there[0];
    return who ? { loc: `home:${who.avatar}`, owner: who.avatar, known: !!who.met } : null;
}
// The rooms of this game that are on no floor of the plan (they show with a red "!").
export function unplaced(g: Save, w: WorldDef) {
    const plan = w.plan; if (!plan) return [];
    const placed = new Set(plan.rooms.filter(r => plan.floors.some(f => f.id === r.floor)).map(r => planTarget(g, w, r)?.loc).filter(Boolean) as string[]);
    return pins(g, w).filter(p => !p.link && !placed.has(p.id));
}
// The floor a room of the game is on ('' when it is not on the plan).
export function floorOf(g: Save, w: WorldDef, loc: string): string {
    const plan = w.plan; if (!plan) return '';
    return plan.rooms.find(r => plan.floors.some(f => f.id === r.floor) && planTarget(g, w, r)?.loc === loc)?.floor ?? '';
}
