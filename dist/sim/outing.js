// Home: going out. The house is the stage, but you can step out: you say where (in your words), who comes with you,
// and pick a background; the scene is then a free one, like a chat. "Back home" brings you back where you were.
import { nowAbs } from '../core/store.js';
import { social } from './social.js';
import { note as remember } from './facts.js';
import { isOuting, outingId, outingName, playerHomeId } from './places.js';
export const outingOf = (g) => (g?.outing ?? null);
export const isOut = (g) => isOuting(g.player.loc);
const LONG = 24 * 60; // the people with you stay with you until you come back
export function startOuting(g, w, place, people, bg = '') {
    void w;
    const id = outingId(place);
    if (!place.trim())
        return '';
    const now = nowAbs(g);
    const s = social(g);
    const prev = outingOf(g);
    const from = prev?.from ?? (isOuting(g.player.loc) ? playerHomeId : g.player.loc);
    for (const a of people) {
        const c = s.with.find(x => x.avatar === a);
        if (c)
            c.until = Math.max(c.until, now + LONG);
        else
            s.with.push({ avatar: a, until: now + LONG });
    }
    g.outing = { place: outingName(id), bg: bg || prev?.bg || '', from, with: [...new Set([...(prev?.with ?? []), ...people])], at: prev?.at ?? now };
    g.player.loc = id;
    const names = people.map(a => g.cast[a]?.name).filter(Boolean);
    remember(g, names.length ? '{u} went out to {0} with {1}.' : '{u} went out to {0}.', [outingName(id), names.join(', ')], people);
    return id;
}
// Back home: to the room you left from; who went with you comes back and goes on with their day.
export function endOuting(g) {
    const o = outingOf(g);
    const s = social(g);
    if (o)
        s.with = s.with.filter(c => !o.with.includes(c.avatar));
    g.player.loc = o?.from && !isOuting(o.from) ? o.from : playerHomeId;
    delete g.outing;
    return g.player.loc;
}
