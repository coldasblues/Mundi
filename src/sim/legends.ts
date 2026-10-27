// Legends: your great deeds (finished quests, won fights, titles, an unmasking…) become tales that travel from town
// to town on their own and grow in the telling. Each day a legend may reach another town and get more exaggerated;
// told often enough, some start crediting the deed to someone else. The AI tells the tale as the town knows it:
// bigger, and partly wrong. When you arrive somewhere your legend has grown, your name opens doors (reputation).
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef } from '../core/world.js';
import { onDay, onHour } from './hooks.js';
import { facts, fill } from './facts.js';
import { regionOf } from './worldstate.js';
import { addRep } from './standing.js';
import { personaName } from '../st/bridge.js';

export interface Legend { id: string; deed: string; at: number; level: number; regions: string[]; credit?: string; greeted?: string[] }
const on = (w: WorldDef) => systemOn(w, 'legends');
export const legendsOf = (g: Save): Legend[] => ((g as any).legends ??= []);
const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
// The deeds that become legends: quests finished, fights won, titles, levels gained, unmaskings, factions founded.
const LEGENDARY = /finished a quest|won a fight|was unmasked|founded|rose to|reached level|became a|miracle/;
export const LEVELS = ['as it happened', 'a little embellished', 'greatly exaggerated', 'grown into a wild legend'];

onDay.push((g, w) => {
    if (!on(w)) return [];
    const list = legendsOf(g);
    // new legends from yesterday's great deeds
    const since = (g.day - 1) * 1440;
    for (const f of facts(g).filter(f => f.at >= since && LEGENDARY.test(f.t) && !list.some(l => l.id === f.id))) {
        list.push({ id: f.id, deed: fill(f.t, f.a ?? [], f.u || personaName()), at: f.at, level: 0, regions: [regionOf(g, w, f.place)] });
    }
    // they travel and grow
    const towns = w.maps.filter(m => !w.maps.some(x => x.parent === m.id)).map(m => m.id);
    for (const l of list) {
        if (l.at >= since) continue;   // a new tale needs a day before it travels
        const r = H(`${l.id}|${g.day}`);
        if (r < 0.35 && towns.length > l.regions.length) { const next = towns.find(t => !l.regions.includes(t) && H(`${l.id}|${t}`) > 0.2) ?? towns.find(t => !l.regions.includes(t)); if (next) l.regions.push(next); }
        if (H(`${l.id}|grow|${g.day}`) < 0.25 && l.level < 3) l.level++;
        if (l.level >= 3 && !l.credit && H(`${l.id}|credit`) < 0.3) {
            const others = Object.values(g.cast); if (others.length) l.credit = others[Math.floor(H(`${l.id}|who`) * others.length)].name;
        }
    }
    (g as any).legends = list.filter(l => g.day * 1440 - l.at < 60 * 1440).slice(-20);
    return [];
});
// Arriving where your legend has grown: your name opens doors, once per legend and town.
export function legendWelcome(g: Save, w: WorldDef): string[] {
    if (!on(w)) return [];
    const here = regionOf(g, w, g.player.loc); const out: string[] = [];
    for (const l of legendsOf(g)) if (l.level >= 2 && !l.credit && l.regions.includes(here) && !(l.greeted ?? []).includes(here)) {
        (l.greeted ??= []).push(here);
        const m = addRep(g, w, 4, 'legend'); out.push(`Your legend precedes you here.${m ? ` ${m}` : ''}`);
    }
    return out;
}
export function legendLines(g: Save, w: WorldDef): string[] {
    if (!on(w)) return [];
    const here = regionOf(g, w, g.player.loc);
    return legendsOf(g).filter(l => l.regions.includes(here) && l.level > 0).slice(-2).map(l =>
        `A tale told around here: "${l.deed}" — but folk tell it ${LEVELS[l.level]}${l.credit ? `, and some swear it was ${l.credit} who did it, not {{user}}` : ''}. If it comes up, tell it that way (bigger, partly wrong).`);
}
onHour.push(legendWelcome);
