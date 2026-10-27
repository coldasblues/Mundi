// Reputation and secret identities.
//   Reputation: how each region (a town, a kingdom map) sees you, from −100 to 100. Deeds move it (quests, festivals,
//   promotions, crimes…); left alone it fades back toward nothing (a week of quiet, then a point every two days).
//   Secret identity: an alter ego with its own name and its own reputation. In disguise, what you do is told about
//   that name (facts, and so rumors). People who know you well may see through it: a suspicion bar (0–100) grows
//   when they are around; at 100 you are unmasked (the two reputations meet, and the town talks).
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef } from '../core/world.js';
import { onDay, onHour } from './hooks.js';
import { note } from './facts.js';
import { seenAs } from './hooks.js';
import { regionOf } from './worldstate.js';
import { presentAt } from './people.js';
import { bondOf } from './social.js';
import { isRpg, sheetOf, rollCheck, checkWon } from './rpg.js';
import { isHome } from './places.js';

interface Rep { v: number; at: number }
interface Identity { alias: string; on: boolean; suspicion: number; rep: Record<string, Rep>; unmasked?: string[] }
const repOf = (g: Save): Record<string, Rep> => ((g as any).rep ??= {});
export const identityOf = (g: Save): Identity => ((g as any).identity ??= { alias: '', on: false, suspicion: 0, rep: {} });
export const disguised = (g: Save, w: WorldDef) => systemOn(w, 'identity') && identityOf(g).on && !!identityOf(g).alias;
const clamp = (v: number) => Math.max(-100, Math.min(100, v));
export const REP_WORDS: [number, string][] = [[60, 'renowned'], [30, 'respected'], [10, 'known'], [-10, 'unknown'], [-30, 'disliked'], [-60, 'mistrusted'], [-101, 'infamous']];
export const repWord = (v: number) => REP_WORDS.find(([min]) => v >= min)?.[1] ?? 'unknown';

// The region a reputation belongs to: the town (map) of the place.
export const repRegion = (g: Save, w: WorldDef, place = g.player.loc) => regionOf(g, w, place);
export function repIn(g: Save, w: WorldDef, region: string, alias = false): number { return ((alias ? identityOf(g).rep : repOf(g))[region]?.v) ?? 0; }
// A deed: moves the reputation of the region (or of your alter ego, in disguise).
export function addRep(g: Save, w: WorldDef, delta: number, why: string, place = g.player.loc): string {
    if (!systemOn(w, 'reputation') || !delta) return '';
    const region = repRegion(g, w, place);
    const book = disguised(g, w) ? identityOf(g).rep : repOf(g);
    const r = (book[region] ??= { v: 0, at: g.day });
    const before = repWord(r.v);
    r.v = clamp(r.v + delta); r.at = g.day;
    const name = w.maps.find(m => m.id === region)?.name ?? region;
    void why;
    return repWord(r.v) !== before ? `${disguised(g, w) ? identityOf(g).alias : 'You'}: ${repWord(r.v)} in ${name}.` : '';
}
// Fading: after a week without news, a point every two days back toward 0.
onDay.push((g, w) => {
    if (!systemOn(w, 'reputation')) return [];
    for (const book of [repOf(g), identityOf(g).rep]) for (const r of Object.values(book)) {
        if (g.day - r.at > 7 && (g.day - r.at) % 2 === 0 && r.v !== 0) r.v += r.v > 0 ? -1 : 1;
    }
    // suspicion cools down while you are yourself
    const id = identityOf(g);
    if (!id.on && id.suspicion > 0) id.suspicion = Math.max(0, id.suspicion - 5);
    return [];
});

/* ---------- the alter ego ---------- */

export function setAlias(g: Save, alias: string): string {
    const id = identityOf(g); const a = alias.trim().slice(0, 40);
    if (!a) return 'Choose a name.';
    if ((id.unmasked ?? []).includes(a.toLowerCase())) return 'Everyone knows that name is you now. Choose another.';
    if (id.on) return 'Take off the disguise first.';
    if (id.alias && id.alias !== a) { id.rep = {}; id.suspicion = 0; }   // a new name starts from nothing
    id.alias = a;
    return '';
}
export function toggleDisguise(g: Save, w: WorldDef): string {
    const id = identityOf(g);
    if (!systemOn(w, 'identity')) return '';
    if (!id.alias) return 'Choose a name for your alter ego first.';
    if (!id.on && !isHome(g.player.loc) && presentAt(g, w, g.player.loc).some(r => r.met)) return 'Not in front of people who know you: change somewhere private.';
    id.on = !id.on;
    return id.on ? `You are ${id.alias} now.` : 'You are yourself again.';
}
seenAs.push(g => ((g as any).identity?.on && (g as any).identity?.alias ? (g as any).identity.alias : ''));

// Each hour in disguise near people who know you well: they may notice something familiar.
export function suspicionTick(g: Save, w: WorldDef): string[] {
    if (!disguised(g, w)) return [];
    const close = presentAt(g, w, g.player.loc).filter(r => r.met && bondOf(g, r.avatar) >= 40);
    if (!close.length) return [];
    let up = close.length * 2;
    if (isRpg(w) && sheetOf(g) && !checkWon(rollCheck(g, w, 'deception', 10 + 2 * close.length))) up += 3;
    return raiseSuspicion(g, w, up, close.map(r => r.avatar));
}
onHour.push(suspicionTick);
export function raiseSuspicion(g: Save, w: WorldDef, n: number, who: string[] = []): string[] {
    const id = identityOf(g); if (!disguised(g, w)) return [];
    id.suspicion = Math.min(100, id.suspicion + n);
    if (id.suspicion < 100) return id.suspicion >= 75 && id.suspicion - n < 75 ? ['People are starting to look at you strangely… (suspicion high)'] : [];
    // unmasked: the alter ego's reputation is yours now (half of it), and the town talks about it
    const alias = id.alias;
    for (const [region, r] of Object.entries(id.rep)) { const mine = (repOf(g)[region] ??= { v: 0, at: g.day }); mine.v = clamp(mine.v + Math.round(r.v / 2)); mine.at = g.day; }
    id.on = false; id.rep = {}; id.suspicion = 0; (id.unmasked ??= []).push(alias.toLowerCase()); id.alias = '';
    note(g, '{u} was unmasked: {u} is {0}!', [alias], who, g.player.loc, 'event');
    return [`Unmasked! Everyone now knows you are ${alias}.`];
}

/* ---------- for the AI ---------- */

export function standingLine(g: Save, w: WorldDef): string {
    const out: string[] = [];
    const region = repRegion(g, w); const name = w.maps.find(m => m.id === region)?.name ?? '';
    if (disguised(g, w)) {
        const id = identityOf(g);
        out.push(`{{user}} is in disguise as "${id.alias}": people here take them for ${id.alias}, not for {{user}}${id.suspicion >= 50 ? ' (though some find them oddly familiar)' : ''}. ${id.alias} is ${repWord(repIn(g, w, region, true))} in ${name}.`);
    } else if (systemOn(w, 'reputation')) {
        const v = repIn(g, w, region);
        if (Math.abs(v) >= 10) out.push(`In ${name}, {{user}} is ${repWord(v)} (reputation ${v}).`);
    }
    return out.join(' ');
}
export const reputationList = (g: Save, w: WorldDef, alias = false) => Object.entries(alias ? identityOf(g).rep : repOf(g)).filter(([, r]) => r.v !== 0).map(([id, r]) => ({ id, name: w.maps.find(m => m.id === id)?.name ?? id, v: r.v })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
