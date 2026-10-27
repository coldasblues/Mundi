// Statuses (life, energy, hunger…) and the actions that change them. Everything comes from the world's data:
// which statuses exist, how fast they drop, what happens at zero and what each action costs and gives.
import { eventActions } from './cityevents.js';
import { onAction, decayMods } from './hooks.js';
import { nowAbs, cfg, type Save } from '../core/store.js';
import { billNews, cutReason, priceOf } from './bills.js';
import { priceHere } from './worldstate.js';
import { openNow } from './daynight.js';
import { sheetOf, isRpg, changeHp, hpMax } from './rpg.js';
import { activeStatuses, systemOn, type WorldDef, type ActionDef, type StatusDef, isScenario } from '../core/world.js';
import { presentAt } from './people.js';
import { approve } from './living.js';
import { note } from './facts.js';
import { placeOf, playerHomeId } from './places.js';
import { book } from './ledger.js';
import { extraActions, isBlocked, brokenThings, hasItem } from './life.js';

const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));
export const statusDef = (w: WorldDef, id: string) => w.statuses.find(s => s.id === id);
// One currency per world: "$120", "40 g", "300 Berries". (Coins of several metals were dropped: an old world that still
// lists `tiers` just shows its smallest coin, which is what amounts were always counted in.)
export function money(w: WorldDef, v: number): string {
    const n = Math.round(v).toLocaleString('en-US'), sym = w.currency.symbol ?? '';
    return w.currency.after ? `${n}${sym ? ` ${sym}` : ''}` : `${sym}${n}`;
}
// How cheap this world's economy is: the usual pay of a first job, for prices the engine sets itself (a party…).
export const usualPay = (w: WorldDef) => { const p = w.occupations.map(o => o.ranks?.[0]?.pay ?? 0).filter(x => x > 0).sort((a, b) => a - b); return p.length ? p[Math.floor(p.length / 2)] : 16; };

export function addStatus(g: Save, w: WorldDef, id: string, delta: number) {
    const d = statusDef(w, id);
    if (!d) return;
    // in the RPG, "life" is your hit points (the need shows the share left): a change goes to the hit points
    if ((id === 'life' || id === 'health') && sheetOf(g) && isRpg(w)) { changeHp(g, w, (delta / d.max) * hpMax(w, sheetOf(g)!)); return; }
    g.player.stats[id] = clamp((g.player.stats[id] ?? d.start) + delta, d.max);
}

// How many whole periods of `every` minutes passed since the rule last ran (and moves its mark forward).
function periods(g: Save, key: string, every: number): number {
    const now = nowAbs(g);
    const last = g.tick[key] ?? now;
    if (g.tick[key] === undefined) { g.tick[key] = now; return 0; }
    const n = Math.floor((now - last) / every);
    if (n > 0) g.tick[key] = last + n * every;
    return n;
}

// Runs after every slice of time: decay, damage at zero, passing out, rent.
export function applyTimedRules(g: Save, w: WorldDef): string[] {
    const out: string[] = [];
    for (const s of activeStatuses(w)) {
        if (s.decay) {
            const n = periods(g, `decay:${s.id}`, s.decay.everyMinutes);
            // (walking the map costs no energy)
            if (n > 0 && !(s.decay.awakeOnly && g.asleep) && !(s.id === 'energy' && (g as any).traveling)) addStatus(g, w, s.id, -s.decay.amount * n * (cfg(g).decay ?? 1) * decayMods.reduce((m, f) => m * f(g, w, s.id), 1));
        }
        const v = g.player.stats[s.id] ?? s.start;
        if (v > 0 || !s.zero) { delete g.tick[`zero:${s.id}`]; delete g.tick[`crisis0:${s.id}`]; continue; }
        out.push(...crisisCheck(g, w, s));
        if (s.zero.drain) {
            const n = periods(g, `drain:${s.id}`, s.zero.drain.everyMinutes);
            if (n > 0) addStatus(g, w, s.zero.drain.status, -s.zero.drain.amount * n);
        }
        if ((s.zero.place || s.zero.text) && g.tick[`zero:${s.id}`] === undefined) {
            g.tick[`zero:${s.id}`] = nowAbs(g);
            const cost = s.zero.cost ?? 0;
            if (cost) g.player.money = Math.max(0, g.player.money - cost);
            if (s.zero.place) g.player.loc = s.zero.place === 'home' ? playerHomeId : s.zero.place;
            if (s.zero.restore) addStatus(g, w, s.id, s.zero.restore);
            if (s.zero.text) out.push(s.zero.text.replace('{cost}', money(w, cost)));
        }
    }
    // the bills of your home (rent, water, power): due each week, paid in the Homes app, cut off after a week
    out.push(...billNews(g, w));
    return out;
}

// A need left at zero long enough becomes a crisis, once per time it hits zero: you faint, people see it, it costs.
// The people who saw it remember it (and may gossip); for a few hours the AI knows it just happened.
function crisisCheck(g: Save, w: WorldDef, s: StatusDef): string[] {
    const c = s.zero?.crisis;
    if (!c) return [];
    const now = nowAbs(g);
    const start = (g.tick[`crisis0:${s.id}`] ??= now);
    if (now - start < (c.after ?? 0) || g.tick[`crisisDone:${s.id}`] === start || g.tick[`crisisDay:${s.id}`] === g.day) return [];   // once a time, and once a day
    const where = g.player.loc;
    const placeName = placeOf(g, w, where)?.name ?? 'home';
    const saw = presentAt(g, w, where).filter(r => r.met);
    if (c.shame && !saw.length) return [];   // a crisis about what people think (the smell) needs someone to see it
    g.tick[`crisisDone:${s.id}`] = start; g.tick[`crisisDay:${s.id}`] = g.day;
    const cost = priceOf(g, c.cost ?? 0);
    if (cost) { g.player.money = Math.max(0, g.player.money - cost); book(g, s.name, -cost); }
    if (c.restore) addStatus(g, w, s.id, c.restore);
    if (c.mood && s.id !== 'mood') addStatus(g, w, 'mood', c.mood);
    for (const r of saw) if (c.shame) approve(g, r.avatar, -c.shame);
    if (c.seen) note(g, c.seen, [placeName], saw.map(r => r.avatar), where, 'crisis');
    if (c.place) g.player.loc = c.place === 'home' ? playerHomeId : c.place;
    (g as any).lastCrisis = { need: s.id, at: now, text: (c.seen ?? '').replace('{u}', '{{user}}').replace('{0}', placeName) };
    return c.text ? [c.text.replace('{cost}', money(w, cost)).replace('{place}', placeName)] : [];
}
// For the AI, for a few hours after a crisis: what just happened.
export function crisisLine(g: Save): string {
    const c = (g as any).lastCrisis;
    return c && c.text && nowAbs(g) - c.at < 180 ? `Just now: ${c.text} {{user}} is still shaken.` : '';
}

// Actions available where the player is (a café sells coffee; at home you can cook).
export function actionsHere(g: Save, w: WorldDef): ActionDef[] {
    const atHome = g.player.loc === playerHomeId;
    const tags = placeOf(g, w, g.player.loc)?.tags ?? [];
    const on = new Set(activeStatuses(w).map(s => s.id));
    // an action only about needs that are not in play (seeing a doctor in Life-Sim) is left out
    // (a scenario keeps them all: in one house, what you do is part of the scene even with needs off)
    const useful = (a: ActionDef) => { const ids = Object.keys(a.effects ?? {}); return !!a.outing || isScenario(w) || !ids.length || ids.some(id => on.has(id)); };
    const broken = brokenThings(g, w).length > 0;
    const closed = !atHome && systemOn(w, 'living') && !openNow(g, w, g.player.loc);   // a closed place: only what can be done anywhere
    // a scenario: the actions chosen for this room when the game started (instead of those its tags bring)
    const chosen: string[] | undefined = isScenario(w) ? (g as any).cfg?.roomActs?.[g.player.loc] : undefined;
    // Home: no money, so nothing to earn or pay, and going out has its own button (Go out)
    const homeMode = isScenario(w);
    const earns = (a: ActionDef) => a.cost < 0 || ((a.roll as any)?.success?.money ?? 0) > 0 || !!a.outing;
    const base = w.actions.filter(useful).filter(a => !homeMode || !earns(a)).filter(a => !isBlocked(g, a, w)).filter(a => a.id !== 'fix' || broken)
        .filter(a => homeMode || !a.needsItem || hasItem(g, a.needsItem)).filter(a => chosen || !(a.notTags ?? []).some(t => tags.includes(t))).filter(a => chosen ? (a.anywhere || chosen.includes(a.id)) : (a.home && atHome)
        || (a.place && a.place === g.player.loc)
        || (!a.home && !a.place && (a.anywhere || (a.tags ?? []).some(t => tags.includes(t))))).filter(a => !closed || a.anywhere);
    // prices after the difficulty; at home, what a cut-off service stops is left out
    // out and about, what you buy costs what it costs in this region now (the living world)
    const here = atHome ? 1 : priceHere(g, w);
    const all = [...base, ...(closed ? [] : extraActions(g, w)), ...eventActions(g, w)].filter(a => !atHome || !cutReason(g, a.id, w));
    // Home: a bathroom or a shower room is not where you grab a snack (what can be done anywhere stays out of it,
    // unless it was chosen for that room)
    const pl = placeOf(g, w, g.player.loc);
    const wet = homeMode && !!pl && /bath|shower|wash|toilet|restroom/i.test(`${pl.id} ${pl.name}`);
    if (homeMode) return all.filter(a => !earns(a)).filter(a => !wet || !a.anywhere || !!chosen?.includes(a.id)).map(a => (a.cost ? { ...a, cost: 0 } : a));
    return all.map(a => (a.cost ? { ...a, cost: a.cost > 0 ? Math.round(priceOf(g, a.cost) * here) : priceOf(g, a.cost) } : a));
}

// Water, power… of a kind of home, paid with the rent.
export const billsOf = (w: WorldDef, kind: string) => Object.values(w.homes.kinds[kind]?.bills ?? {}).reduce((a, b) => a + b, 0);

export function canAfford(g: Save, a: ActionDef) { return g.player.money >= a.cost; }

export function applyAction(g: Save, w: WorldDef, a: ActionDef) {
    g.player.money -= a.cost;
    if (a.cost) book(g, a.name, -a.cost);
    for (const [id, v] of Object.entries(a.effects)) addStatus(g, w, id, v);
    for (const f of onAction) f(g, w, a);
}

// A short line for the AI about how the player feels (only what stands out).
export function feelings(g: Save, w: WorldDef): string {
    const low = activeStatuses(w).filter(s => (g.player.stats[s.id] ?? s.start) <= 25).map(s => `${s.name.toLowerCase()} is low (${g.player.stats[s.id]}/${s.max})`);
    return [low.length ? `How {{user}} feels: ${low.join(', ')}.` : '', crisisLine(g)].filter(Boolean).join('\n');
}

// Is there enough energy for this? `drain` is how much each need goes down (positive numbers). Returns the reason
// it cannot be done, or '' when it can. Only energy stops you; the other needs simply drop.
export function tooTired(g: Save, w: WorldDef, drain: Record<string, number>, what: string): string {
    const s = activeStatuses(w).find(x => x.id === 'energy');
    const need = s ? drain[s.id] ?? 0 : 0;
    if (!s || need <= 0) return '';
    const have = Math.round(g.player.stats[s.id] ?? s.start);
    return have < need ? `Not enough ${s.name.toLowerCase()} to ${what} (it takes ${Math.round(need)}, you have ${have}). Sleep or rest first.` : '';
}
