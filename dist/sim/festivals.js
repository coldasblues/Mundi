import { systemOn } from '../core/world.js';
import { seasonDays, SEASONS } from './time.js';
import { addStatus } from './needs.js';
import { note } from './facts.js';
const on = (w) => systemOn(w, 'festivals') && !!w.festivals?.length;
const seasonAt = (g, day) => SEASONS[Math.floor((Math.max(1, day) - 1) / seasonDays(g)) % 4].id;
const daySeason = (g, day) => ((Math.max(1, day) - 1) % seasonDays(g)) + 1;
// The festivals of a day (several towns can celebrate on the same day).
export function festivalsOn(g, w, day = g.day) {
    if (!on(w))
        return [];
    const s = seasonAt(g, day), d = daySeason(g, day);
    return w.festivals.filter(f => f.season === s && d >= Math.min(f.day, seasonDays(g)) && d < Math.min(f.day, seasonDays(g)) + Math.max(1, f.days ?? 1));
}
// A festival belongs to the town of its place: the maps of the same city (the same "area"), or its own map. One
// without a place is for everyone.
const mapOfPlace = (g, w, id) => {
    if (id === 'home:player')
        return w.homes.zones.find(z => z.id === g.player.home?.zone)?.map;
    if (id.startsWith('home:')) {
        const r = g.cast[id.slice(5)];
        const h = r?.homeWith === '__you' ? g.player.home : r?.home;
        return w.homes.zones.find(z => z.id === h?.zone)?.map;
    }
    return w.places.find(p => p.id === id)?.map;
};
const townOf = (w, mapId) => { const m = w.maps.find(x => x.id === mapId); return m ? m.area ?? m.id : ''; };
// The festival of a day for someone at a place (the player's place by default), or on a map (`{ map }`).
export function festivalOn(g, w, day = g.day, place = g.player.loc) {
    const list = festivalsOn(g, w, day);
    if (!list.length)
        return null;
    const here = townOf(w, typeof place === 'string' ? mapOfPlace(g, w, place) : place.map);
    return list.find(f => !f.place || w.maps.length < 2 || townOf(w, mapOfPlace(g, w, f.place)) === here) ?? null;
}
// Where people gather (afternoon and evening, from noon to 22h): the festival of their own town.
export function festivalSpot(g, w, at, home) {
    const f = festivalOn(g, w, Math.floor(at / 1440), home ?? g.player.loc);
    const h = Math.floor((at % 1440) / 60);
    return f?.place && h >= 12 && h < 22 && w.places.some(p => p.id === f.place) ? f.place : null;
}
export const festivalPrice = (g, w, place = g.player.loc) => festivalOn(g, w, g.day, place)?.prices ?? 1;
// The next festivals (for the calendar).
export function upcoming(g, w, days = 28) {
    if (!on(w))
        return [];
    const out = [];
    for (let d = g.day; d < g.day + days; d++)
        for (const f of festivalsOn(g, w, d))
            if (!out.some(x => x.f.id === f.id && d - x.day < (f.days ?? 1)))
                out.push({ f, day: d });
    return out;
}
export function canCelebrate(g, w) {
    const f = festivalOn(g, w);
    if (!f || g.celebrated === `${f.id}|${g.day}`)
        return null;
    return !f.place || g.player.loc === f.place ? f : null;
}
export function celebrate(g, w, addRep) {
    const f = canCelebrate(g, w);
    if (!f)
        return '';
    g.celebrated = `${f.id}|${g.day}`;
    addStatus(g, w, 'mood', f.mood ?? 15);
    addStatus(g, w, 'energy', -8);
    addRep(1);
    note(g, '{u} celebrated the {0}.', [f.name], [], g.player.loc, 'social');
    return `You join the ${f.name}!`;
}
export function festivalLine(g, w) {
    const f = festivalOn(g, w);
    if (!f)
        return '';
    const place = w.places.find(p => p.id === f.place)?.name;
    return `Today is the ${f.name}${f.desc ? `: ${f.desc}` : ''}.${place ? ` People gather at ${place} in the afternoon and evening.` : ''}`;
}
