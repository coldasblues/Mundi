// Letters from afar: friends who live in another town or kingdom write now and then (the AI writes the letter in their
// voice), with news or asking for help. Writing back keeps the friendship warm; distance cools it otherwise (two weeks
// without a word, then a point every three days, never below 30). A plea for help can be answered with coins.
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef } from '../core/world.js';
import { onDay } from './hooks.js';
import { social, bondOf, bump, textFrom } from './social.js';
import { regionOf } from './worldstate.js';
import { book } from './ledger.js';
import { note } from './facts.js';
import { lex } from '../core/lexicon.js';
import { personaName } from '../st/bridge.js';

export interface Letter { avatar: string; kind: 'news' | 'help'; ask?: number; day: number; sent?: boolean; answered?: boolean }
interface Post { queue: Letter[]; contact: Record<string, number> }
export const postOf = (g: Save): Post => ((g as any).post ??= { queue: [], contact: {} });
const on = (w: WorldDef) => systemOn(w, 'letters');
const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

// Far away: their home is in another town than yours (or another kingdom).
export function farAway(g: Save, w: WorldDef, avatar: string): boolean {
    const r = g.cast[avatar]; if (!r) return false;
    const theirs = regionOf(g, w, `home:${avatar}`), mine = regionOf(g, w, 'home:player');
    return !!theirs && theirs !== mine && (r as any).homeWith !== '__you';
}
export const distantFriends = (g: Save, w: WorldDef) => Object.values(g.cast).filter(r => r.met && bondOf(g, r.avatar) >= 35 && farAway(g, w, r.avatar));
export function wroteTo(g: Save, avatar: string) { postOf(g).contact[avatar] = g.day; }

onDay.push((g, w) => {
    if (!on(w)) return [];
    const p = postOf(g);
    p.queue = p.queue.filter(l => g.day - l.day < 10);
    const far = distantFriends(g, w);
    // distance cools a friendship you do not keep up
    for (const r of far) {
        const last = Math.max(p.contact[r.avatar] ?? 0, (g as any).social?.threads?.[r.avatar]?.filter((t: any) => t.me).at(-1) ? Math.floor(((g as any).social.threads[r.avatar].filter((t: any) => t.me).at(-1).at) / 1440) : 0);
        if (g.day - last > 14 && (g.day - last) % 3 === 0 && bondOf(g, r.avatar) > 30) bump(g, r.avatar, -1);
    }
    // a letter now and then (at most one waiting)
    if (!far.length || p.queue.some(l => !l.sent) || H(`${g.world}|${g.day}|letter`) > 0.2) return [];
    const r = far[Math.floor(H(`${g.world}|${g.day}|who`) * far.length)];
    const help = H(`${g.world}|${g.day}|help`) < 0.35;
    p.queue.push({ avatar: r.avatar, kind: help ? 'help' : 'news', ...(help ? { ask: 10 + Math.floor(H(`${g.day}|ask`) * 30) } : {}), day: g.day });
    return [];
});
// Sends the waiting letter (the AI writes it); called by the screen now and then.
export async function deliverLetter(g: Save, w: WorldDef): Promise<string> {
    const l = postOf(g).queue.find(x => !x.sent); const r = l && g.cast[l.avatar];
    if (!l || !r) return '';
    l.sent = true;
    const town = w.maps.find(m => m.id === regionOf(g, w, `home:${l.avatar}`))?.name ?? 'far away';
    const what = l.kind === 'help' ? `${r.name} is in a bit of trouble and asks ${personaName()} for help: about ${l.ask} coins would make all the difference. They explain why, in their own words.` : `${r.name} shares news of their life and asks how ${personaName()} is doing.`;
    await textFrom(g, w, l.avatar, `${r.name} lives in ${town}, far from ${personaName()}, and writes a ${lex(w, 'letter')}. ${what} Warm, personal, a few sentences.`, l.kind === 'help' ? `I hate to ask, but could you spare ${l.ask}? Things are hard here.` : 'I think of you often. How are you?');
    const s = social(g); s.unread[l.avatar] = (s.unread[l.avatar] ?? 0) + 1;
    return r.name;
}
export const helpAsked = (g: Save, avatar: string) => postOf(g).queue.find(l => l.avatar === avatar && l.kind === 'help' && l.sent && !l.answered);
export function sendHelp(g: Save, w: WorldDef, avatar: string): string {
    const l = helpAsked(g, avatar); const r = g.cast[avatar];
    if (!l || !r) return '';
    if (g.player.money < (l.ask ?? 0)) return 'Not enough money.';
    g.player.money -= l.ask ?? 0; book(g, `Sent to ${r.name}`, -(l.ask ?? 0));
    l.answered = true; wroteTo(g, avatar); bump(g, avatar, 6);
    note(g, '{u} sent {0} coins to {1}, who had asked for help.', [String(l.ask), r.name], [avatar], g.player.loc, 'social');
    return `You sent ${l.ask} to ${r.name}.`;
}
