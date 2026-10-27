// Places: the world's public places plus homes (the player's and each resident's). Distances and travel time.
import { travelFactor } from './life.js';
import { cfg, type Save } from '../core/store.js';
import { isScenario, type WorldDef, type Place } from '../core/world.js';

export const playerHomeId = 'home:player';
export const isHome = (id: string) => id.startsWith('home:');
// "North Suburbs, House 4": every home spot of the map has a fixed number.
// The kind of home is named by the world (Apartment, House / Cottage, Manor…).
export const homeKindName = (w: WorldDef, kind: string) => w.homes.kinds[kind]?.name ?? (kind === 'house' ? 'House' : 'Apartment');
export function homeAddress(w: WorldDef, h: { zone: string; x: number; y: number; n?: number; kind?: string; unit?: number }) {
    const zone = w.homes.zones.find(z => z.id === h.zone);
    if (!zone) return '';
    const n = h.n ?? (zone.spots.findIndex(s => s[0] === h.x && s[1] === h.y) + 1);
    return `${zone.name}, ${homeKindName(w, h.kind ?? zone.kind)} ${n || 1}${h.unit ? String.fromCharCode(65 + h.unit) : ''}`;
}

export function placeOf(g: Save, w: WorldDef, id: string): (Place & { home?: boolean; owner?: string }) | null {
    if (id === playerHomeId) {
        const h = g.player.home, kind = w.homes.kinds[h.kind];
        const zone = w.homes.zones.find(z => z.id === h.zone);
        return { id, name: 'My home', map: zone?.map ?? w.maps[0].id, x: h.x, y: h.y, tags: ['home'], desc: `${homeAddress(w, h)}: ${kind?.desc ?? ''}`, home: true };
    }
    if (isHome(id)) {
        const r = g.cast[id.slice(5)];
        if (!r) return null;
        // someone who lives with another person is at that person's home (or yours)
        const w2 = (r as any).homeWith as string | undefined;
        if (w2 === '__you') return placeOf(g, w, playerHomeId);
        if (w2 && w2 !== r.avatar && g.cast[w2]) return placeOf(g, w, `home:${w2}`);
        const zone = w.homes.zones.find(z => z.id === r.home.zone);
        const mates = Object.values(g.cast).filter(x => x.home.zone === r.home.zone && x.home.x === r.home.x && x.home.y === r.home.y && (x.home.unit ?? 0) === (r.home.unit ?? 0) && (x.met || x === r)).map(x => x.name);
        const label = mates.length <= 1 ? r.name : mates.length === 2 ? `${mates[0]} & ${mates[1]}` : `${r.name} & family`;
        return { id, name: `${label}'s home`, map: zone?.map ?? w.maps[0].id, x: r.home.x, y: r.home.y, tags: ['home'], desc: `${homeAddress(w, r.home)}: ${zone?.desc ?? ''}`, home: true, owner: r.avatar };
    }
    if (isOuting(id)) return { id, name: outingName(id), map: w.maps[0]?.id ?? '', x: 50, y: 50, tags: ['outing'], desc: `out of the house: ${outingName(id)}` };
    return w.places.find(p => p.id === id) ?? extraRooms(g).find(p => p.id === id) ?? null;
}
/** Home: a place out of the house, named by the player ("out:the beach"). Going out, or a plan made somewhere out. */
export const OUTING = 'out:';
export const isOuting = (id: string | null | undefined) => !!id && id.startsWith(OUTING);
export const outingName = (id: string) => id.slice(OUTING.length);
export const outingId = (name: string) => `${OUTING}${name.trim().replace(/\s+/g, ' ').slice(0, 80)}`;
/** A scenario: rooms the player added for this game (a name, a picture, what it is for). */
export const extraRooms = (g: Save | null | undefined): Place[] => ((g as any)?.cfg?.extraRooms ?? []) as Place[];

// Every point on the map: public places, your home, and the homes of people you know.
// A scenario's rooms are chosen per game (cfg.rooms); without a choice, every room but those off by default.
// A room the Home got after the game began (an update of the world) is on, unless it is off by default.
export const roomsOn = (g: Save | null | undefined, w: WorldDef): string[] => {
    const own = (g as any)?.cfg?.rooms as string[] | undefined;
    const seen = (g as any)?.cfg?.roomsSeen as string[] | undefined;
    const fresh = own && seen ? w.places.filter(p => !p.scenarioOff && !p.link && !seen.includes(p.id) && !own.includes(p.id)).map(p => p.id) : [];
    return [...(own ?? w.places.filter(p => !p.scenarioOff && !p.link).map(p => p.id)), ...fresh, ...extraRooms(g).map(p => p.id)];
};
export const placeOn = (g: Save | null | undefined, w: WorldDef, id: string) => !isScenario(w) || !w.places.some(p => p.id === id) || roomsOn(g, w).includes(id);
export function pins(g: Save, w: WorldDef) {
    const out: (Place & { home?: boolean; owner?: string })[] = [...w.places.filter(p => placeOn(g, w, p.id)), ...(isScenario(w) ? extraRooms(g) : [])];
    const mine = placeOf(g, w, playerHomeId);
    if (mine) out.push(mine);
    for (const r of Object.values(g.cast)) if (r.met) { const p = placeOf(g, w, `home:${r.avatar}`); if (p && !out.some(x => x.id === p.id)) out.push(p); }
    return out;
}

// Travel time, rounded to the world's steps (15, 20, 30…), so the clock stays readable. Between maps (two cities
// on a region map), the trip goes through the link pins on the bigger map.
// Travel takes a fixed time: 30 minutes inside a town (a local map), 2 hours between towns or across a region map
// (a map that other maps hang from), 10 hours between realms (in a world of realms: a top map whose maps have towns
// of their own, like the Three Crowns). The world's "travel" rule (advanced settings) scales them all.
export const LOCAL_TRIP = 30, GLOBAL_TRIP = 120, REALM_TRIP = 600;
// The realm a map belongs to: the map right under the top one, when it has maps of its own ('' otherwise).
export function realmOf(w: WorldDef, mapId?: string): string {
    let m = w.maps.find(x => x.id === mapId);
    for (let i = 0; m && m.parent && i < 10; i++) {
        const up = w.maps.find(x => x.id === m!.parent);
        if (!up) break;
        if (!up.parent) return w.maps.some(x => x.parent === m!.id) ? m.id : '';
        m = up;
    }
    return '';
}
export function travelMinutes(g: Save, w: WorldDef, from: string, to: string): number {
    if (from === to) return 0;
    if (isScenario(w)) return 0;   // Home: from one room to another takes no time
    const a = placeOf(g, w, from), b = placeOf(g, w, to);
    const isRegion = (mapId?: string) => !!mapId && w.maps.some(m => m.parent === mapId) && !w.maps.find(m => m.id === mapId)?.town;
    const local = !!a && !!b && a.map === b.map && !isRegion(a.map);
    // districts and nearby villages: their own trip time to the town they hang from (siblings: the longer of the two)
    if (a && b && a.map !== b.map) {
        const ma = w.maps.find(m => m.id === a.map), mb = w.maps.find(m => m.id === b.map);
        const near = ma && mb && (ma.parent === mb.id || mb.parent === ma.id || (!!ma.parent && ma.parent === mb.parent));
        const t = near ? Math.max(ma.parent === mb.id || ma.parent === mb.parent ? ma.trip ?? 0 : 0, mb.parent === ma.id || ma.parent === mb.parent ? mb.trip ?? 0 : 0) : 0;
        if (t) return Math.max(5, Math.round(t * (cfg(g).travel ?? 1) * travelFactor(g, w) / 5) * 5);
    }
    const ra = realmOf(w, a?.map), rb = realmOf(w, b?.map);
    if (ra && rb && ra !== rb) return Math.max(5, Math.round(REALM_TRIP * (cfg(g).travel ?? 1) * travelFactor(g, w) / 5) * 5);
    return Math.max(5, Math.round((local ? LOCAL_TRIP : GLOBAL_TRIP) * (cfg(g).travel ?? 1) * travelFactor(g, w) / 5) * 5);
}
