// City events: what happens in town each week (a festival on the beach, a show or a match at the stadium, a fair at
// the mall, an open mic at the bar). The world says the weekday, how often, where and when. They are in the calendar;
// you go if you want ("I'll go" sets a reminder). While one lasts, people with free time gather there, the AI knows,
// and there is something to do: enjoy it (a ticket, mood), and perform there if your hobby is good enough.
// An outdoor one is called off when it rains.
import { nowAbs } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { weatherOn } from './weather.js';
import { note } from './facts.js';
import { onHour, onDay } from './hooks.js';
import { levelOf } from './hobbies.js';
const on = (w) => !!w && systemOn(w, 'events') && !!w.cityEvents?.length;
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return h >>> 0; };
const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const cityOf = (g) => { const c = (g.city ??= {}); c.going ??= []; c.went ??= []; c.told ??= []; return c; };
// The events of a day (day 1 is a Monday).
export function eventsOn(g, w, day) {
    if (!on(w) || day < 1)
        return [];
    const wd = (day - 1) % 7, week = Math.floor((day - 1) / 7);
    return w.cityEvents.filter(e => e.weekday === wd && w.places.some(p => p.id === e.place) && week % Math.max(1, e.every ?? 1) === (e.week ?? 0) % Math.max(1, e.every ?? 1))
        .map(e => { const from = day * 1440 + Math.round((e.from ?? 18) * 60); return { key: `${e.id}@${day}`, ev: e, day, from, to: from + Math.round((e.hours ?? 3) * 60), off: !!e.outdoor && weatherOn(g.world, day).rain }; });
}
// What is on right now (or at `at`), anywhere or at one place.
export function liveEvents(g, w, at = nowAbs(g)) {
    const d = Math.floor(at / 1440);
    return [...eventsOn(g, w, d - 1), ...eventsOn(g, w, d)].filter(x => x.from <= at && at < x.to && !x.off);
}
export const eventHere = (g, w, place = g.player.loc, at = nowAbs(g)) => liveEvents(g, w, at).find(x => x.ev.place === place) ?? null;
// The next ones (for the calendar): from now to `days` ahead, the ones still to come or going on.
export function comingEvents(g, w, days = 7) {
    const now = nowAbs(g);
    const out = [];
    for (let d = g.day - 1; d <= g.day + days; d++)
        out.push(...eventsOn(g, w, d).filter(x => x.to > now && x.from < now + days * 1440));
    return out.sort((a, b) => a.from - b.from);
}
export const isGoing = (g, key) => cityOf(g).going.includes(key);
export function toggleGoing(g, key) {
    const c = cityOf(g);
    if (c.going.includes(key)) {
        c.going = c.going.filter(k => k !== key);
        return false;
    }
    c.going.push(key);
    return true;
}
// Where someone with free time goes while an event is on (about half of them; `crowd` in 100).
export function eventSpot(g, w, avatar, at) {
    if (!on(w))
        return null;
    for (const x of liveEvents(g, w, at))
        if (hash(`${avatar}|${x.key}`) % 100 < (x.ev.crowd ?? 50))
            return x.ev.place;
    return null;
}
// What there is to do at an event that is on here.
export function eventActions(g, w) {
    const x = on(w) ? eventHere(g, w) : null;
    if (!x)
        return [];
    const e = x.ev;
    const out = [];
    if (!cityOf(g).went.includes(x.key))
        out.push({ id: `x-ev-${e.id}`, name: e.name, label: e.action || `Enjoy the ${e.name}`, icon: e.icon ?? '🎉', cost: e.price ?? 0, minutes: e.minutes ?? 120, anywhere: true,
            effects: { mood: e.mood ?? 12, energy: -10 } });
    const st = e.stage;
    if (st && levelOf(g, st.hobby) >= st.level && !cityOf(g).went.includes(`${x.key}#stage`))
        out.push({ id: `x-evs-${e.id}`, name: st.label, label: st.label, icon: '🎤', cost: 0, minutes: 60, anywhere: true, hobby: st.hobby,
            effects: { energy: -10 }, roll: { dc: 12, traits: [], success: { text: 'The crowd loved it.', money: st.pay, effects: { mood: 10 } }, fail: { text: 'A rough set; only a few people clapped.', effects: { mood: -4 } } } });
    return out;
}
// After one of those: you were there (once per event), and it is remembered.
export function afterEvent(g, w, a) {
    const x = eventHere(g, w);
    if (!x)
        return [];
    const c = cityOf(g);
    if (a.id === `x-ev-${x.ev.id}`) {
        c.went.push(x.key);
        const s = g.player.learning;
        if (s?.count)
            s.count.events = (s.count.events ?? 0) + 1;
        note(g, '{u} went to the {0}.', [x.ev.name], [], g.player.loc, 'social');
    }
    if (a.id === `x-evs-${x.ev.id}`) {
        c.went.push(`${x.key}#stage`);
        note(g, '{u} performed at the {0}.', [x.ev.name], [], g.player.loc, 'social');
    }
    return [];
}
// For the AI: what is going on here.
export function eventLine(g, w) {
    const x = on(w) ? eventHere(g, w) : null;
    if (!x)
        return '';
    return `Happening here now: the ${x.ev.name}${x.ev.desc ? ` (${x.ev.desc})` : ''}, until ${hm(x.to % 1440)}. The place is crowded and lively; people in the crowd are only background.`;
}
export const placeName = (w, id) => w.places.find(p => p.id === id)?.name ?? id;
// Reminders for the events you said you would go to (an hour before), and outdoor ones called off by the rain.
onHour.push((g, w) => {
    if (!on(w))
        return [];
    const now = nowAbs(g);
    const c = cityOf(g);
    const out = [];
    for (const x of comingEvents(g, w, 1)) {
        if (!c.going.includes(x.key) || c.told.includes(x.key))
            continue;
        if (x.off && x.from - now <= 180) {
            c.told.push(x.key);
            out.push(`${x.ev.icon ?? '🎉'} The ${x.ev.name} was called off because of the rain.`);
        }
        else if (!x.off && x.from - now <= 60 && x.to > now) {
            c.told.push(x.key);
            out.push(`${x.ev.icon ?? '🎉'} ${x.from > now ? `The ${x.ev.name} starts at ${hm(x.from % 1440)}` : `The ${x.ev.name} is on now`} at ${placeName(w, x.ev.place)}.`);
        }
    }
    return out;
});
// Old keys are forgotten after two weeks.
onDay.push((g) => {
    const c = g.city;
    if (!c)
        return [];
    const keep = (k) => g.day - Number(k.split('@')[1]?.split('#')[0] ?? g.day) < 14;
    c.going = c.going.filter(keep);
    c.went = c.went.filter(keep);
    c.told = c.told.filter(keep);
    return [];
});
