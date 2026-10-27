import { systemOn } from '../core/world.js';
import { regionOf } from './worldstate.js';
const on = (w) => systemOn(w, 'elements');
const setOf = (g) => (g.weatherSet ??= {});
export function setWeather(g, w, to, place = g.player.loc) { setOf(g)[regionOf(g, w, place)] = { day: g.day, to }; }
// The weather a spell set for today (if any): the world's weather function asks this first.
export function weatherOverride(g, w, place, day = g.day) {
    if (!w)
        return null;
    const o = g.weatherSet?.[regionOf(g, w, place)];
    if (!o || o.day !== day)
        return null;
    return o.to === 'rain' ? { icon: '🌧️', name: 'Rain', rain: true } : { icon: '☀️', name: 'Sunny', rain: false };
}
export function elementMul(w, el, weather) {
    if (!on(w) || !el)
        return 1;
    if (weather.rain)
        return el === 'fire' ? 0.5 : el === 'water' || el === 'lightning' ? 1.5 : 1;
    if (weather.name === 'Sunny' && el === 'fire')
        return 1.25;
    return 1;
}
export const elementsOn = on;
