// A scenario's house party: no plans or dates out (one house), but you can throw a party at home. While it lasts the
// housemates leave their routines (and their bedrooms) and spread over the common rooms: living room, kitchen, pool…
import { nowAbs } from '../core/store.js';
import { isScenario } from '../core/world.js';
import { roomsOn, extraRooms } from './places.js';
import { note } from './facts.js';
export const PARTY_HOURS = 4;
export const houseParty = (g) => g.houseParty ?? null;
export const partyNow = (g, w, at = nowAbs(g)) => { const p = houseParty(g); return !!p && isScenario(w) && at >= p.from && at < p.until; };
// The rooms where a party happens: the ones of this game for free time or food (not chores, not the bedrooms).
export function partyRooms(g, w) {
    const on = new Set(roomsOn(g, w));
    const fun = (p) => (p.tags ?? []).some(t => t === 'leisure' || t === 'food');
    return [...w.places.filter(p => on.has(p.id) && !p.link && fun(p)).map(p => p.id), ...extraRooms(g).filter(fun).map(p => p.id)];
}
// Where a housemate is during the party: one of the party rooms, changing every hour.
export function partySpot(g, w, avatar, at = nowAbs(g)) {
    if (!partyNow(g, w, at))
        return null;
    const rooms = partyRooms(g, w);
    if (!rooms.length)
        return null;
    let h = Math.floor(at / 60) * 31;
    for (const c of avatar)
        h = (h * 33 + c.charCodeAt(0)) >>> 0;
    return rooms[h % rooms.length];
}
export function throwHouseParty(g, w, from, title = '') {
    if (!isScenario(w))
        return 'Parties at home are for scenarios.';
    const cur = houseParty(g);
    if (cur && cur.until > nowAbs(g))
        return 'A party is already planned.';
    g.houseParty = { from, until: from + PARTY_HOURS * 60, ...(title.trim() ? { title: title.trim().slice(0, 80) } : {}) };
    note(g, title.trim() ? '{u} is throwing a house party: "{0}".' : '{u} is throwing a house party.', [title.trim()], [], g.player.loc, 'event');
    return '';
}
export const cancelHouseParty = (g) => { delete g.houseParty; };
export function partyLine(g, w) {
    const p = houseParty(g);
    if (!p || !isScenario(w))
        return '';
    const now = nowAbs(g);
    if (now >= p.from && now < p.until)
        return `A house party is going on${p.title ? ` ("${p.title}")` : ''}: the housemates are out of their rooms, all over the living spaces, music on, drinks out.`;
    if (now < p.from && p.from - now < 1440)
        return `{{user}} is throwing a house party later today${p.title ? ` ("${p.title}")` : ''}; everyone in the house knows.`;
    return '';
}
