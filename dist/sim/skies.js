import { systemOn } from '../core/world.js';
import { onDay, decayMods } from './hooks.js';
import { regionOf } from './worldstate.js';
import { seasonOf } from './time.js';
import { isRpg, sheetOf, focusMax } from './rpg.js';
import { addStatus } from './needs.js';
import { afterFight, closedByEvents } from './hooks.js';
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
const skiesOn = (w) => systemOn(w, 'skies');
/* ---------- celestial events ---------- */
export function celestialOn(g, w, day = g.day) {
    if (!skiesOn(w))
        return null;
    return (w.skies?.events ?? []).find(e => { const off = Math.floor(H(`${g.world}|${e.id}`) * e.every); return ((day + off) % Math.max(2, e.every)) < Math.max(1, e.days); }) ?? null;
}
export const bloodMoon = (g, w) => celestialOn(g, w)?.effect === 'monsters';
onDay.push((g, w) => {
    const e = celestialOn(g, w);
    if (!e)
        return [];
    const out = [`${e.name}${e.desc ? `: ${e.desc}` : ''}.`];
    if (e.effect === 'mana') {
        const s = isRpg(w) ? sheetOf(g) : null;
        if (s)
            s.focus = focusMax(w, s);
    }
    if (e.effect === 'omen')
        addStatus(g, w, 'mood', -(e.amount ?? 5));
    return out;
});
/* ---------- extreme weather ---------- */
const climateOf = (w, region) => { let m = w.maps.find(x => x.id === region); for (let i = 0; m && i < 5; i++) {
    if (m.climate)
        return m.climate;
    m = w.maps.find(x => x.id === m.parent);
} return 'temperate'; };
export function hazardIn(g, w, region, day = g.day) {
    if (!skiesOn(w))
        return null;
    const c = climateOf(w, region);
    const season = seasonOf(g).id;
    return (w.skies?.hazards ?? []).find(h => h.climate === c && (!h.season || h.season === season) && H(`${g.world}|${region}|${h.id}|${day}`) < h.chance) ?? null;
}
export const hazardHere = (g, w) => hazardIn(g, w, regionOf(g, w, g.player.loc));
decayMods.push((g, w, status) => hazardHere(g, w)?.drain?.[status] ?? 1);
export const hasCampGear = (g) => (g.bag?.items?.camping_gear ?? 0) > 0 || (g.owned ?? []).includes?.('gear');
export const campBlocked = (g, w) => !!hazardHere(g, w)?.blocksCamp && !hasCampGear(g);
export const shutByFear = (g, w) => bloodMoon(g, w) || !!hazardHere(g, w)?.closes;
const ecoOf = (g) => (g.ecology ??= {});
const ecoOn = (w) => systemOn(w, 'ecology');
export const ecoIn = (g, region) => (ecoOf(g)[region] ??= { predators: 50, prey: 50 });
// Fights won against wild beasts thin out the predators of the region.
afterFight.push((g, w, c) => {
    if (!ecoOn(w) || c.over !== 'won')
        return [];
    const wild = c.list.filter(f => f.side === 'them' && (f.tags ?? []).includes('wild')).length;
    if (wild) {
        const e = ecoIn(g, regionOf(g, w, c.where));
        e.predators = Math.max(0, e.predators - 8 * wild);
    }
    return [];
});
// Every week the balance moves: prey grows where predators are few, predators come back where prey is plenty.
onDay.push((g, w) => {
    if (!ecoOn(w) || g.day % 7 !== 0)
        return [];
    for (const e of Object.values(ecoOf(g))) {
        const prey = e.prey + (100 - e.prey) * 0.2 - e.predators * 0.15;
        const pred = e.predators + e.prey * 0.08 - 4;
        e.prey = Math.round(Math.max(5, Math.min(100, prey)));
        e.predators = Math.round(Math.max(0, Math.min(100, pred)));
    }
    return [];
});
// Meat and furs are cheaper where prey abounds; the roads are safer where predators are few.
export function ecoPrice(g, w, good, region) {
    if (!ecoOn(w) || !(good.kind === 'meat' || good.kind === 'fur'))
        return 1;
    const e = ecoOf(g)[region];
    if (!e)
        return 1;
    return 1.2 - e.prey / 250;
}
export const ambushOdds = (g, w, region) => (ecoOn(w) && ecoOf(g)[region] ? 0.5 + ecoOf(g)[region].predators / 100 : 1) * (bloodMoon(g, w) ? 2 : 1);
export function skiesLine(g, w) {
    const out = [];
    const e = celestialOn(g, w);
    if (e)
        out.push(`In the sky: ${e.name}${e.desc ? ` (${e.desc})` : ''}.`);
    const h = hazardHere(g, w);
    if (h)
        out.push(`Extreme weather here: ${h.name}${h.desc ? ` (${h.desc})` : ''}.`);
    if (ecoOn(w)) {
        const eco = ecoOf(g)[regionOf(g, w, g.player.loc)];
        if (eco && eco.predators < 25)
            out.push('Wolves and wild beasts are scarce around here lately; game is plentiful.');
        else if (eco && eco.predators > 75)
            out.push('Wild beasts are bold around here lately; travelers go armed.');
    }
    return out.join(' ');
}
closedByEvents.push((g, w, id) => shutByFear(g, w) && (w.places.find(p => p.id === id)?.tags ?? []).includes('shop'));
