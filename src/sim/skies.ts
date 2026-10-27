// The skies and the wild:
//   Celestial events (the world's list): a mana storm refills focus each morning; a blood moon makes the roads
//   twice as dangerous and shuts the shops in fear; an omen (an eclipse) darkens moods. Each comes back every so many
//   days, for a day or two.
//   Extreme weather by climate (blizzards in the cold, sandstorms and heatwaves in the heat, storms on the coast):
//   needs drop faster, a night at camp gives no rest without camping gear, and some shut the town.
//   Living ecology: each region has predators and prey. Win fights against wild beasts and the predators thin out;
//   the next weeks the prey grows (meat and furs get cheaper, the roads safer); leave them be and the wolves return.
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef, type GoodDef, type HazardDef, type CelestialDef } from '../core/world.js';
import { onDay, decayMods } from './hooks.js';
import { regionOf } from './worldstate.js';
import { seasonOf } from './time.js';
import { isRpg, sheetOf, focusMax } from './rpg.js';
import { addStatus } from './needs.js';
import { afterFight, closedByEvents } from './hooks.js';

const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const skiesOn = (w: WorldDef) => systemOn(w, 'skies');

/* ---------- celestial events ---------- */

export function celestialOn(g: Save, w: WorldDef, day = g.day): CelestialDef | null {
    if (!skiesOn(w)) return null;
    return (w.skies?.events ?? []).find(e => { const off = Math.floor(H(`${g.world}|${e.id}`) * e.every); return ((day + off) % Math.max(2, e.every)) < Math.max(1, e.days); }) ?? null;
}
export const bloodMoon = (g: Save, w: WorldDef) => celestialOn(g, w)?.effect === 'monsters';
onDay.push((g, w) => {
    const e = celestialOn(g, w); if (!e) return [];
    const out = [`${e.name}${e.desc ? `: ${e.desc}` : ''}.`];
    if (e.effect === 'mana') { const s = isRpg(w) ? sheetOf(g) : null; if (s) s.focus = focusMax(w, s); }
    if (e.effect === 'omen') addStatus(g, w, 'mood', -(e.amount ?? 5));
    return out;
});

/* ---------- extreme weather ---------- */

const climateOf = (w: WorldDef, region: string): string => { let m = w.maps.find(x => x.id === region); for (let i = 0; m && i < 5; i++) { if (m.climate) return m.climate; m = w.maps.find(x => x.id === m!.parent); } return 'temperate'; };
export function hazardIn(g: Save, w: WorldDef, region: string, day = g.day): HazardDef | null {
    if (!skiesOn(w)) return null;
    const c = climateOf(w, region); const season = seasonOf(g).id;
    return (w.skies?.hazards ?? []).find(h => h.climate === c && (!h.season || h.season === season) && H(`${g.world}|${region}|${h.id}|${day}`) < h.chance) ?? null;
}
export const hazardHere = (g: Save, w: WorldDef) => hazardIn(g, w, regionOf(g, w, g.player.loc));
decayMods.push((g, w, status) => hazardHere(g, w)?.drain?.[status] ?? 1);
export const hasCampGear = (g: Save) => ((g as any).bag?.items?.camping_gear ?? 0) > 0 || ((g as any).owned ?? []).includes?.('gear');
export const campBlocked = (g: Save, w: WorldDef) => !!hazardHere(g, w)?.blocksCamp && !hasCampGear(g);
export const shutByFear = (g: Save, w: WorldDef) => bloodMoon(g, w) || !!hazardHere(g, w)?.closes;

/* ---------- living ecology ---------- */

interface Eco { predators: number; prey: number }
const ecoOf = (g: Save): Record<string, Eco> => ((g as any).ecology ??= {});
const ecoOn = (w: WorldDef) => systemOn(w, 'ecology');
export const ecoIn = (g: Save, region: string): Eco => (ecoOf(g)[region] ??= { predators: 50, prey: 50 });
// Fights won against wild beasts thin out the predators of the region.
afterFight.push((g, w, c) => {
    if (!ecoOn(w) || c.over !== 'won') return [];
    const wild = c.list.filter(f => f.side === 'them' && (f.tags ?? []).includes('wild')).length;
    if (wild) { const e = ecoIn(g, regionOf(g, w, c.where)); e.predators = Math.max(0, e.predators - 8 * wild); }
    return [];
});
// Every week the balance moves: prey grows where predators are few, predators come back where prey is plenty.
onDay.push((g, w) => {
    if (!ecoOn(w) || g.day % 7 !== 0) return [];
    for (const e of Object.values(ecoOf(g))) {
        const prey = e.prey + (100 - e.prey) * 0.2 - e.predators * 0.15;
        const pred = e.predators + e.prey * 0.08 - 4;
        e.prey = Math.round(Math.max(5, Math.min(100, prey))); e.predators = Math.round(Math.max(0, Math.min(100, pred)));
    }
    return [];
});
// Meat and furs are cheaper where prey abounds; the roads are safer where predators are few.
export function ecoPrice(g: Save, w: WorldDef, good: GoodDef, region: string): number {
    if (!ecoOn(w) || !(good.kind === 'meat' || good.kind === 'fur')) return 1;
    const e = ecoOf(g)[region]; if (!e) return 1;
    return 1.2 - e.prey / 250;
}
export const ambushOdds = (g: Save, w: WorldDef, region: string) => (ecoOn(w) && ecoOf(g)[region] ? 0.5 + ecoOf(g)[region].predators / 100 : 1) * (bloodMoon(g, w) ? 2 : 1);

export function skiesLine(g: Save, w: WorldDef): string {
    const out: string[] = [];
    const e = celestialOn(g, w); if (e) out.push(`In the sky: ${e.name}${e.desc ? ` (${e.desc})` : ''}.`);
    const h = hazardHere(g, w); if (h) out.push(`Extreme weather here: ${h.name}${h.desc ? ` (${h.desc})` : ''}.`);
    if (ecoOn(w)) { const eco = ecoOf(g)[regionOf(g, w, g.player.loc)]; if (eco && eco.predators < 25) out.push('Wolves and wild beasts are scarce around here lately; game is plentiful.'); else if (eco && eco.predators > 75) out.push('Wild beasts are bold around here lately; travelers go armed.'); }
    return out.join(' ');
}
closedByEvents.push((g, w, id) => shutByFear(g, w) && (w.places.find(p => p.id === id)?.tags ?? []).includes('shop'));
