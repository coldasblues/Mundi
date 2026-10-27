// Elements and the weather: in the rain fire is weaker (×0.5) and water and lightning stronger (×1.5); under a clear
// sun, fire burns brighter (×1.25). Spells can call rain or clear the sky over a region for the day. In a fight, a foe
// soaked by water this round and then struck by lightning (by another member of the party) takes double and the
// lightning arcs to every other foe for half: an elemental combo.
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef } from '../core/world.js';
import type { Element } from '../core/rpgdef.js';
import { regionOf } from './worldstate.js';

const on = (w: WorldDef) => systemOn(w, 'elements');
const setOf = (g: Save): Record<string, { day: number; to: 'rain' | 'clear' }> => ((g as any).weatherSet ??= {});
export function setWeather(g: Save, w: WorldDef, to: 'rain' | 'clear', place = g.player.loc) { setOf(g)[regionOf(g, w, place)] = { day: g.day, to }; }
// The weather a spell set for today (if any): the world's weather function asks this first.
export function weatherOverride(g: Save, w: WorldDef | null | undefined, place: string, day = g.day): { icon: string; name: string; rain: boolean } | null {
    if (!w) return null;
    const o = (g as any).weatherSet?.[regionOf(g, w, place)];
    if (!o || o.day !== day) return null;
    return o.to === 'rain' ? { icon: '🌧️', name: 'Rain', rain: true } : { icon: '☀️', name: 'Sunny', rain: false };
}
export function elementMul(w: WorldDef, el: Element | undefined, weather: { rain: boolean; name: string }): number {
    if (!on(w) || !el) return 1;
    if (weather.rain) return el === 'fire' ? 0.5 : el === 'water' || el === 'lightning' ? 1.5 : 1;
    if (weather.name === 'Sunny' && el === 'fire') return 1.25;
    return 1;
}
export const elementsOn = on;
