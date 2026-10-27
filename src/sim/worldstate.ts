// The state of the world, region by region (a region is a map: a city, a town, the kingdom around them):
// how busy a place is right now, the public mood, the tension in the air, the weather and what things cost.
// All of it is the engine's (deterministic, no AI): the AI is only told what it is like around here.
// The save keeps one small record per region (save.regions), made the first time it is needed, so old saves and
// new maps need nothing special. With the "living world" system off, nothing here runs or is shown.
import { festivalPrice } from './festivals.js';
import { weatherOverride } from './elements.js';
import { tradeMul } from './realm.js';
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef, type MapDef } from '../core/world.js';
import { onDay, onHour } from './hooks.js';
import { placeOf, isHome, playerHomeId } from './places.js';
import { presentAt } from './people.js';
import { isWeekend } from './time.js';
import { partOf, openNow, periodPrice, partMood } from './daynight.js';
import { weatherOn } from './weather.js';
import { facts } from './facts.js';
import { lex } from '../core/lexicon.js';

export interface Region { mood: number; tension: number; price: number }
// What a map can say about its region (all optional): its usual public mood (-100..100), tension (0..100),
// prices (×, 1 = as listed), how busy its places get (×), and whether it has a weather of its own.
export type RegionDef = MapDef;

const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const rnd = (g: Save, salt: string) => H(`${g.world}|${g.day}|${salt}`);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const on = (w: WorldDef | null | undefined) => systemOn(w, 'living');

export const regionDef = (w: WorldDef, id: string) => w.maps.find(m => m.id === id) as RegionDef | undefined;
const base = (d?: RegionDef): Region => ({ mood: clamp(d?.mood ?? 15, -100, 100), tension: clamp(d?.tension ?? 10, 0, 100), price: clamp(d?.prices ?? 1, 0.2, 5) });
// The region a place is in: the map its pin is on (your home: the map of its area).
export const regionOf = (g: Save, w: WorldDef, place: string) => placeOf(g, w, place)?.map ?? w.maps[0]?.id ?? '';
export function regionState(g: Save, w: WorldDef, id: string): Region {
    const all = ((g as any).regions ??= {}) as Record<string, Region>;
    return (all[id] ??= base(regionDef(w, id)));
}

/* ---------- weather ---------- */

// The weather of a region: the world's own, unless the map has a weather of its own (a far island, the mountains).
export function weatherAt(g: Save, w: WorldDef | null | undefined, place: string, day = g.day) {
    const forced = weatherOverride(g, w, place, day); if (forced) return forced;   // a spell called rain or cleared the sky
    const map = w && place ? regionDef(w, regionOf(g, w, place)) : undefined;
    return weatherOn(map?.ownWeather ? `${g.world}:${map.id}` : g.world, day);
}

// The weather where you are now (a moon at night when it is clear), for the HUD and the AI.
export function weatherHere(g: Save, w: WorldDef | null | undefined) {
    const wx = weatherAt(g, w, g.player.loc);
    const night = g.minutes < 330 || g.minutes >= 1170;
    return { ...wx, icon: night && !wx.rain ? '🌙' : wx.icon };
}

/* ---------- how busy a place is, right now ---------- */

export const CROWD = ['empty', 'quiet', 'a few people', 'busy', 'packed'] as const;
// When each kind of place fills up, by part of the day (0..1); a place with several tags takes the busiest.
const RHYTHM: Record<string, Record<string, number>> = {
    food: { dawn: .1, morning: .5, afternoon: .8, evening: 1, night: .3 },
    leisure: { dawn: .05, morning: .4, afternoon: .7, evening: 1, night: .5 },
    shop: { dawn: 0, morning: .5, afternoon: 1, evening: .6, night: 0 },
    service: { dawn: 0, morning: .9, afternoon: .7, evening: .2, night: 0 },
    work: { dawn: .1, morning: 1, afternoon: .9, evening: .3, night: .05 },
    study: { dawn: 0, morning: 1, afternoon: .8, evening: .3, night: 0 },
    sport: { dawn: .3, morning: .8, afternoon: .5, evening: 1, night: .1 },
};
const DEFAULT_RHYTHM = { dawn: .1, morning: .6, afternoon: .7, evening: .7, night: .2 };
// 0 (empty) .. 4 (packed). The people of the world who are there count, plus the passers-by of a place like it.
export function crowdLevel(g: Save, w: WorldDef, place: string): number {
    if (isHome(place)) return Math.min(1, presentAt(g, w, place).length);
    const p = w.places.find(x => x.id === place);
    if (!p) return 0;
    if (!openNow(g, w, place)) return Math.min(1, presentAt(g, w, place).length);   // closed: only whoever is still there
    const part = partOf(w, g.minutes);
    const tags = p.tags?.length ? p.tags : [''];
    let rhythm = Math.max(...tags.map(t => (RHYTHM[t] ?? DEFAULT_RHYTHM)[part as keyof typeof DEFAULT_RHYTHM] ?? 0));
    const weekend = isWeekend(g.day);
    if (weekend) rhythm *= tags.some(t => t === 'leisure' || t === 'shop' || t === 'food') ? 1.3 : tags.some(t => t === 'work' || t === 'study' || t === 'service') ? 0.4 : 1;
    const outdoors = tags.includes('leisure') && !tags.some(t => ['food', 'shop', 'service', 'work', 'study'].includes(t));
    if (outdoors && weatherAt(g, w, place).rain) rhythm *= 0.25;
    const r = regionDef(w, p.map);
    const mood = moodNow(g, w, p.map);
    const own = p.crowd;   // a place can be quieter (0.5) or busier (1.5) than its kind
    const score = rhythm * (r?.crowd ?? 1) * (own ?? 1) * (1 + mood / 400) * 3 + presentAt(g, w, place).length * 0.6;
    return clamp(Math.round(score), 0, 4);
}
export const crowdWord = (n: number) => CROWD[clamp(n, 0, 4)];

/* ---------- in words ---------- */

export const moodWord = (v: number) => (v >= 50 ? 'festive' : v >= 20 ? 'upbeat' : v > -20 ? 'calm' : v > -50 ? 'gloomy' : 'grim');
export const tensionWord = (v: number) => (v >= 75 ? 'on the edge of trouble' : v >= 50 ? 'tense' : v >= 25 ? 'a little uneasy' : 'relaxed');
export const priceWord = (v: number, b = 1) => { const r = v / b; return r >= 1.12 ? 'high' : r <= 0.92 ? 'low' : 'usual'; };

// The public mood right now: the region's, a little lower at dawn and higher in the evening.
export const moodNow = (g: Save, w: WorldDef, id: string) => clamp(regionState(g, w, id).mood + partMood(w, g.minutes), -100, 100);
// What the price of something is where you are: the region's prices, and out and about, the part of the day's
// (late at night costs more). 1 when the system is off.
export const priceHere = (g: Save, w: WorldDef | null | undefined, place = g.player.loc) => (w && on(w) ? regionState(g, w, regionOf(g, w, place)).price * (isHome(place) ? 1 : periodPrice(w, g.minutes)) : 1) * (w && !isHome(place) ? festivalPrice(g, w, place) * tradeMul(w) : 1);

// For the AI: what it is like around here.
export function worldLine(g: Save, w: WorldDef): string {
    if (!on(w)) return '';
    const id = regionOf(g, w, g.player.loc), r = regionState(g, w, id), d = regionDef(w, id);
    const bits = [...(isHome(g.player.loc) ? [] : [`${crowdWord(crowdLevel(g, w, g.player.loc))} here right now`]), `the public mood is ${moodWord(moodNow(g, w, id))}`, `people are ${tensionWord(r.tension)}`];
    const pw = priceWord(r.price, base(d).price);
    if (pw !== 'usual') bits.push(`prices are ${pw} lately`);
    return `Around ${d?.name ?? 'here'}: ${bits.join('; ')}.`;
}

/* ---------- day by day ---------- */

const GOOD = ['party', 'love', 'goal', 'meet'];
const BAD = ['fight'];
function dayInRegion(g: Save, w: WorldDef, id: string): string[] {
    const r = regionState(g, w, id), b = base(regionDef(w, id));
    const yesterday = (g.day - 1) * 1440;
    const here = facts(g).filter(f => f.at >= yesterday && f.at < g.day * 1440 && !isHome(f.place) && regionOf(g, w, f.place) === id);
    const good = here.filter(f => GOOD.includes(f.kind ?? '')).length, bad = here.filter(f => BAD.includes(f.kind ?? '')).length;
    const wx = weatherOn(regionDef(w, id)?.ownWeather ? `${g.world}:${id}` : g.world, g.day);
    const out: string[] = [];
    const name = regionDef(w, id)?.name ?? id;
    // tension: back toward the usual, up with trouble; now and then something stirs people up
    const t0 = r.tension;
    r.tension += (b.tension - r.tension) * 0.15 + bad * 4 + (rnd(g, `t|${id}`) - 0.5) * 8;
    if (rnd(g, `incident|${id}`) < 0.04) r.tension += 25 + rnd(g, `incident+|${id}`) * 20;   // a brawl, a scandal, a strike
    r.tension = clamp(Math.round(r.tension), 0, 100);
    if (t0 < 50 && r.tension >= 50) out.push(lex(w, 'tensionUp', name));
    if (t0 >= 50 && r.tension < 50) out.push(lex(w, 'tensionDown', name));
    // public mood: back toward the usual, lifted by sun, weekends and good times, pulled down by rain and tension
    r.mood += (b.mood - r.mood) * 0.2 + (wx.rain ? -8 : wx.name === 'Sunny' ? 4 : 0) + (isWeekend(g.day) ? 5 : 0) + good * 2 - bad * 3 - r.tension / 12 + (rnd(g, `m|${id}`) - 0.5) * 12;
    r.mood = clamp(Math.round(r.mood), -100, 100);
    // prices drift a little each day around the region's usual, a bit up when times are good
    const p0 = r.price;
    r.price += (b.price - r.price) * 0.1 + (rnd(g, `p|${id}`) - 0.5) * 0.05 * b.price + (rnd(g, `shock|${id}`) < 0.03 ? (rnd(g, `shock+|${id}`) < 0.6 ? 0.14 : -0.1) * b.price : 0) + (r.mood > 40 ? 0.01 : r.mood < -40 ? -0.01 : 0) * b.price;
    r.price = clamp(Math.round(r.price * 1000) / 1000, b.price * 0.85, b.price * 1.3);
    if (priceWord(p0, b.price) !== 'high' && priceWord(r.price, b.price) === 'high') out.push(lex(w, 'pricesUp', name));
    if (priceWord(p0, b.price) !== 'low' && priceWord(r.price, b.price) === 'low') out.push(lex(w, 'pricesDown', name));
    return out;
}
// Every region lives on; you hear the news of where you live and where you are.
onDay.push((g, w) => {
    if (!on(w)) return [];
    const near = new Set([regionOf(g, w, playerHomeId), regionOf(g, w, g.player.loc)]);
    return w.maps.flatMap(m => { const news = dayInRegion(g, w, m.id); return near.has(m.id) ? news : []; });
});

// The public mood rubs off on you a little while you are out (an hour in a festive town lifts your mood).
onHour.push((g, w) => {
    if (!on(w) || g.asleep || isHome(g.player.loc) || !w.statuses.some(s => s.id === 'mood' && systemOn(w, 'needs') && !s.off)) return [];
    const m = moodNow(g, w, regionOf(g, w, g.player.loc));
    const d = m >= 40 ? 1 : m <= -40 ? -1 : 0;
    if (d) { const s = w.statuses.find(x => x.id === 'mood')!; g.player.stats.mood = clamp((g.player.stats.mood ?? s.start) + d, 0, s.max); }
    return [];
});
