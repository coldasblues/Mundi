// Hostile actions, the rules: what each one does, how loud it is, what crime it is, who sees it and who reports it.
// The engine (hostile.ts) rolls and applies them; the AI only tells the story of the result it is given.
// This file has no runtime imports, so it can be tested on its own.
import type { CrimeKind, Mobility } from './pstate.js';

export type Crime = 'none' | CrimeKind;
export const SEVERITY: Record<Crime, number> = { none: 0, minor: 1, theft: 2, assault: 3, kidnapping: 5, murder: 8 };
export const CRIME_WORD: Record<Crime, string> = { none: '', minor: 'causing a disturbance', theft: 'theft', assault: 'assault', kidnapping: 'kidnapping', murder: 'murder' };
/** The short label on the menu. */
export const CRIME_TAG: Record<Crime, string> = { none: '', minor: 'disturbance', theft: 'theft', assault: 'assault', kidnapping: 'kidnapping', murder: 'murder' };
export const worst = (list: Crime[]): Crime => list.reduce<Crime>((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a), 'none');

/** How a target must be for the action: knocked down (or out), or held by you (grabbed, tied up). */
export type Needs = 'down' | 'held';
export interface HitEffect {
    text: string;
    change?: 'injured' | 'dead';              // written into the roster at once
    down?: 'down' | 'out'; downMins?: number;   // knocked down (a few minutes) or out cold
    captive?: 'held' | 'restrained';           // now held by you: they come along when you go
    money?: boolean;                           // you get away with some money
    scare?: boolean;                           // they back off and leave the scene
    free?: boolean;                            // it gets you out of a fight or someone's grip
    fight?: boolean;                           // they are still up and it turns into a fight
    feed?: number;                             // you drink: your hunger goes up by this much
    take?: boolean;                            // you take the thing you named
}
export interface MissEffect { text: string; fight?: boolean; caught?: boolean; alarm?: boolean; change?: 'injured' }
export interface HostileDef {
    id: string; name: string; verb: string; icon: string; desc: string;
    /** {{user}}'s line in the chat ("*throws a punch at {t}*"). */
    line: string;
    target: boolean; needs?: Needs[];
    dc: number; traits: string[];
    /** 0 quiet (people right here may not notice), 1 low, 2 loud, 3 everyone notices. */
    noise: 0 | 1 | 2 | 3;
    crime: Crime; minutes: number;
    hit: HitEffect; miss: MissEffect;
    /** Only for this role (Feed: a vampire). */
    role?: string;
}

// {t}: the target; {u}: you. The texts are what the AI is told happened (and the toast).
export const DEFAULT_ACTS: HostileDef[] = [
    { id: 'punch', line: "*throws a punch at {t}*", name: 'Punch', verb: 'punch {t}', icon: '👊', desc: 'Hurts them. They will probably hit back.', target: true, dc: 11, traits: ['Strong', 'Athletic', 'Hot-headed'], noise: 2, crime: 'assault', minutes: 1,
        hit: { text: 'the punch lands: {t} is hurt', change: 'injured', fight: true }, miss: { text: '{t} blocks it and fights back', fight: true } },
    { id: 'kick', line: "*kicks {t}*", name: 'Kick', verb: 'kick {t}', icon: '🦵', desc: 'Hurts more, and puts them on the ground.', target: true, dc: 13, traits: ['Athletic', 'Strong'], noise: 2, crime: 'assault', minutes: 1,
        hit: { text: 'the kick lands hard: {t} goes down, hurt', change: 'injured', down: 'down', downMins: 10, free: true }, miss: { text: '{t} dodges the kick and comes back swinging', fight: true } },
    { id: 'shove', line: "*shoves {t} hard*", name: 'Shove', verb: 'shove {t}', icon: '✋', desc: 'Knocks them over without hurting them. Gets you out of their grip.', target: true, dc: 9, traits: ['Strong', 'Athletic'], noise: 1, crime: 'minor', minutes: 1,
        hit: { text: '{t} stumbles back and falls', down: 'down', downMins: 4, free: true }, miss: { text: '{t} doesn\'t budge and shoves back', fight: true } },
    { id: 'threaten', line: "*gets in {t}'s face and threatens them*", name: 'Threaten', verb: 'threaten {t}', icon: '😠', desc: 'Scares them off. If it fails they may call for help.', target: true, dc: 10, traits: ['Hot-headed', 'Serious', 'Outgoing', 'Strong'], noise: 1, crime: 'minor', minutes: 2,
        hit: { text: '{t} is scared and backs away', scare: true, free: true }, miss: { text: '{t} isn\'t scared, and may call for help', alarm: true } },
    { id: 'scene', line: "*starts shouting and making a scene*", name: 'Make a scene', verb: 'make a scene', icon: '📢', desc: 'Shout, smash things. Everyone here notices.', target: false, dc: 0, traits: [], noise: 3, crime: 'minor', minutes: 3,
        hit: { text: 'everyone stops and stares' }, miss: { text: '' } },
    { id: 'steal', line: "*tries to slip a hand into {t}'s pocket*", name: 'Steal', verb: 'steal from {t}', icon: '👛', desc: 'Quiet. If they catch you, you are held.', target: true, dc: 13, traits: ['Smart', 'Calm', 'Handy'], noise: 0, crime: 'theft', minutes: 2,
        hit: { text: 'the money comes away clean: {t} doesn\'t notice', money: true }, miss: { text: '{t} catches the hand in their pocket', caught: true, alarm: true } },
    { id: 'grab', line: "*grabs hold of {t}*", name: 'Grab', verb: 'grab {t}', icon: '🤼', desc: 'Holds on to them: they come with you when you go.', target: true, dc: 13, traits: ['Strong', 'Athletic'], noise: 2, crime: 'assault', minutes: 1,
        hit: { text: '{t} is caught in a firm grip and can\'t get away', captive: 'held' }, miss: { text: '{t} twists free and fights back', fight: true } },
    { id: 'restrain', line: "*ties {t} up*", name: 'Tie up', verb: 'tie up {t}', icon: '⛓️', desc: 'Only someone down or in your grip. Much harder for them to escape.', target: true, needs: ['down', 'held'], dc: 8, traits: ['Handy', 'Strong'], noise: 1, crime: 'kidnapping', minutes: 5,
        hit: { text: '{t} is tied up and can\'t move', captive: 'restrained' }, miss: { text: '{t} struggles too much to be tied up' } },
    { id: 'knockout', line: "*tries to knock {t} out*", name: 'Knock out', verb: 'knock {t} out', icon: '💤', desc: 'Out cold for a while. Then you can tie them up, take them, or worse.', target: true, dc: 14, traits: ['Strong', 'Athletic'], noise: 2, crime: 'assault', minutes: 1,
        hit: { text: '{t} is knocked out cold', change: 'injured', down: 'out', downMins: 45, free: true }, miss: { text: '{t} staggers but stays up and fights back', fight: true } },
    { id: 'take', line: "*takes {item}*", name: 'Take something', verb: 'take {item}', icon: '🫳', desc: 'Take something from here (name it below). Theft at a business; nothing at your own place.', target: false, dc: 12, traits: ['Smart', 'Calm', 'Handy'], noise: 0, crime: 'theft', minutes: 2,
        hit: { text: '{item} is taken without anyone stopping it', take: true }, miss: { text: '{t} notices {item} being taken', caught: true, alarm: true } },
    { id: 'feed', line: "*leans in close to {t}*", name: 'Feed', verb: 'feed on {t}', icon: '🩸', desc: 'Drink from them: your hunger is sated; they are left dazed and remember little. Quiet, but no mortal may see.', target: true, dc: 10, traits: ['Charming', 'Calm'], noise: 0, crime: 'assault', minutes: 6, role: 'kindred',
        hit: { text: 'the feeding is done: {t} is left dazed and remembers little', down: 'out', downMins: 15, feed: 40 }, miss: { text: '{t} pulls away before the bite', alarm: true } },
    { id: 'kill', line: "*goes to kill {t}*", name: 'Kill', verb: 'kill {t}', icon: '💀', desc: 'Only someone down or held. It is final.', target: true, needs: ['down', 'held'], dc: 6, traits: [], noise: 2, crime: 'murder', minutes: 2,
        hit: { text: '{t} is killed', change: 'dead', free: true }, miss: { text: '{t} survives it, badly hurt, and screams', change: 'injured', alarm: true } },
];

/* ---------- how a target is, and the odds ---------- */

export interface TargetState { down?: 'down' | 'out'; captive?: 'held' | 'restrained'; law?: boolean }
/** Can this action be used on this target? A reason when not. */
export function blockedFor(def: HostileDef, t: TargetState | null): string {
    if (def.target && !t) return 'Pick someone first.';
    if (def.needs?.length && t) {
        const ok = (def.needs.includes('down') && !!t.down) || (def.needs.includes('held') && !!t.captive);
        if (!ok) return 'They have to be down or in your grip first.';
    }
    if (def.id === 'grab' && t?.captive) return 'You already have hold of them.';
    if (def.id === 'restrain' && t?.captive === 'restrained') return 'They are already tied up.';
    if (def.id === 'steal' && t?.down === 'out') return '';
    return '';
}
/** The difficulty against this target: helpless people are easy, police officers fight back well. */
export function dcFor(def: HostileDef, t: TargetState | null, you: Mobility = 'free'): number {
    if (!def.dc) return 0;
    let dc = def.dc;
    if (t?.down === 'out' || t?.captive === 'restrained') dc -= 8;
    else if (t?.down === 'down' || t?.captive === 'held') dc -= 4;
    if (t?.law) dc += 2;
    if (you === 'held') dc += 2;
    return Math.max(2, dc);
}
export function chanceFor(dc: number, bonus: number): number {
    if (!dc) return 100;
    let ok = 0;
    for (let d = 1; d <= 20; d++) if (d === 20 || (d > 1 && d + bonus >= dc)) ok++;
    return ok * 5;
}

/* ---------- who sees it ---------- */

/**
 * How busy a place is right now: 0 nobody around (a home, a field at night), 1 a few people, 2 busy, 3 packed.
 * `explicit`: what the world says for that place (world.json → places[].crowd); otherwise its tags decide.
 */
export function crowdLevel(tags: string[], hour: number, isHome: boolean, explicit?: number): number {
    if (isHome) return explicit ?? 0;
    const has = (...t: string[]) => t.some(x => tags.includes(x));
    let c = explicit ?? (has('shop', 'food') ? 3 : has('service', 'study', 'sport', 'work') ? 2 : 1);
    const night = hour >= 23 || hour < 6, evening = hour >= 19 && hour < 23;
    if (night) c -= has('food', 'leisure') ? 1 : 2;
    else if (evening && has('shop', 'work', 'service', 'study')) c -= 1;
    return Math.max(0, Math.min(3, c));
}
/** The chance that someone in the crowd (not the people in the scene) sees it. */
export function crowdSees(crowd: number, noise: number): number {
    const c = [0, 0.3, 0.6, 0.85][Math.max(0, Math.min(3, crowd))];
    const n = [0.25, 0.6, 1, 1.25][Math.max(0, Math.min(3, noise))];
    return Math.min(0.98, c * n);
}
/** The chance that one person right here notices: only a quiet action can go unnoticed. */
export const noticeChance = (noise: number) => (noise <= 0 ? 0.35 : noise === 1 ? 0.85 : 1);
/** The chance a crime that was seen gets reported (a friend of yours keeps quiet more often). */
export function reportChance(crime: Crime, friend = false): number {
    const p = { none: 0, minor: 0.3, theft: 0.5, assault: 0.7, kidnapping: 0.9, murder: 0.95 }[crime];
    return friend ? p * 0.35 : p;
}
/** Minutes until the law arrives after a call (a city's police; slower in a world without phones). */
export const responseMinutes = (rnd: number, slow = false) => Math.round((slow ? 25 : 10) + rnd * (slow ? 50 : 20));

/* ---------- who the law is ---------- */

export const LAW_ROLES_MODERN = ['police', 'police officer', 'officer', 'cop', 'detective', 'deputy', 'sheriff', 'trooper', 'patrolman', 'patrolwoman', 'security guard', 'security', 'fbi agent', 'federal agent', 'special agent', 'constable', 'sergeant', 'inspector', 'lieutenant', 'marshal'];
/** For a world's jobs: only plainly police or guard work (a "Station agent" or a "Loan officer" is not the law). */
export const LAW_JOBS = ['police', 'police officer', 'policeman', 'policewoman', 'cop', 'detective', 'deputy', 'sheriff', 'trooper', 'security guard', 'guard', 'guardsman', 'watchman', 'city watch', 'constable', 'bailiff', 'marshal'];
export const LAW_ROLES_MEDIEVAL = ['guard', 'guardsman', 'watchman', 'the watch', 'city watch', 'soldier', 'knight', 'constable', 'sheriff', 'bailiff', 'reeve', 'sergeant', 'captain of the guard'];
/** A name like "Officer Diaz", "the police officer", "a security guard": is it the law? */
export function isLawName(name: string, roles: string[]): boolean {
    const n = ` ${String(name ?? '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()} `;
    return roles.some(r => r && n.includes(` ${r.toLowerCase()} `));
}

/* ---------- one roll, decided ---------- */

export type Grade = 'critical-fail' | 'fail' | 'success' | 'critical-success';
export interface Decided {
    ok: boolean; grade: Grade; text: string;
    change?: 'injured' | 'dead'; down?: 'down' | 'out'; downMins?: number; captive?: 'held' | 'restrained';
    money?: boolean; scare?: boolean; alarm?: boolean; feed?: number; take?: boolean;
    /** what it means for you: a fight holds you here, being caught holds you, or it frees you */
    you?: { mobility?: Mobility; free?: boolean; reason?: string };
}
export const fillIn = (t: string, target: string, user = '{{user}}') => t.replace(/\{t\}/g, target).replace(/\{u\}/g, user);
/** `holderIsTarget`: the one keeping you here (in a fight, holding you) is the target, so dealing with them frees you. */
export function decide(def: HostileDef, d20: number, bonus: number, dc: number, target: string, t: TargetState | null, you: Mobility = 'free', holderIsTarget = true): Decided {
    const grade: Grade = !dc ? 'success' : d20 === 1 ? 'critical-fail' : d20 === 20 ? 'critical-success' : d20 + bonus >= dc ? 'success' : 'fail';
    const ok = grade === 'success' || grade === 'critical-success';
    if (ok) {
        const h = def.hit;
        const out: Decided = { ok, grade, text: fillIn(h.text, target), change: h.change, down: h.down, downMins: h.downMins, captive: h.captive, money: h.money, scare: h.scare, feed: h.feed, take: h.take };
        // a great punch puts them down too
        if (grade === 'critical-success' && def.id === 'punch') { out.down = 'down'; out.downMins = 6; out.text += ', and down'; }
        const helpless = !!(out.down || out.captive || out.change === 'dead' || out.scare || t?.down || t?.captive?.length);
        if (h.free && holderIsTarget && (you === 'engaged' || you === 'held')) out.you = { free: true, reason: `got free of ${target}` };
        else if (h.fight && !helpless) out.you = { mobility: 'engaged', reason: `in a fight with ${target}` };
        return out;
    }
    const m = def.miss;
    const out: Decided = { ok, grade, text: fillIn(m.text, target), alarm: m.alarm, change: m.change };
    if (m.caught) out.you = { mobility: grade === 'critical-fail' ? 'restrained' : 'held', reason: `caught by ${target}` };
    else if (m.fight && !t?.down && !t?.captive) out.you = { mobility: grade === 'critical-fail' ? 'restrained' : 'held', reason: grade === 'critical-fail' ? `pinned down by ${target}` : `in a fight with ${target}` };
    return out;
}
