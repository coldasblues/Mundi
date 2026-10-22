// Hostile actions in a running game: punching, grabbing, stealing, killing… The engine rolls; the result is written
// at once (it is final, like a roll to get away); the AI is told exactly what happened and tells it.
// What comes after depends on the world, not on fixed rules:
//   - a world with law (police, the city watch): a crime someone sees may be reported; the law comes, or finds you
//     later; an officer who sees it steps in on the spot. You can try to get away, or give yourself up.
//   - a world without law (The Walking Dead): nobody comes; the victim's group holds a grudge and comes for you.
//   - always: the people who saw it remember it (and the town talks), and it changes how they feel about you.
// The same goes for the AI's characters: a crime the story reports ("crimes:" in the state block) is followed up too.
import { game, settings, saveGame, nowAbs, TUT, state, type Save, type Resident } from '../core/store.js';
import { getWorld, styleOf, type WorldDef } from '../core/world.js';
import { chat, ctx, narratorLine, personaName, saveChat } from '../st/bridge.js';
import { presentAt, peopleHooks } from './people.js';
import { placeOf, playerHomeId, isHome } from './places.js';
import { traitsOf } from './work.js';
import { note, placeName } from './facts.js';
import { feel } from './life.js';
import { loseBond, bondOf, isPartner } from './social.js';
import { onStep, onHour, onDay } from './hooks.js';
import { keyFor, applyNow, rosterHooks, statusOf, pendingChanges } from './roster.js';
import { currentState, walkOns, psOn, psHooks, visitLines, keepNarration, refreshPState, seenWalkOns } from './pstate-live.js';
import { payOf } from './bills.js';
import type { Mobility } from './pstate.js';
import { judge, isNotPerson, ATTACK_WORDS, ROLES, CODES, outsiders, enforcerOf, kindMatches, lawsAbout, type Who, type Verdict, type StoryLaw } from './judge.js';
import { charOf } from '../st/bridge.js';
import { money as moneyText } from './needs.js';
import { addStatus } from './needs.js';
import {
    DEFAULT_ACTS, SEVERITY, CRIME_WORD, worst, blockedFor, dcFor, chanceFor, crowdLevel, crowdSees, noticeChance, reportChance,
    responseMinutes, LAW_ROLES_MODERN, LAW_ROLES_MEDIEVAL, LAW_JOBS, isLawName, decide, fillIn,
    type Crime, type HostileDef, type TargetState, type Decided,
} from './hostile-rules.js';

/* ---------- what the save keeps ---------- */

export interface Captive { key: string; name: string; kind: 'cast' | 'walkon'; avatar?: string; how: 'held' | 'restrained'; since: number; custody?: boolean; lawful?: string }
/** A code broken where someone outside it saw (the Masquerade). */
export interface Breach { code: string; at: number; place: string; seen: string[] }
export interface Down { key: string; name: string; avatar?: string; how: 'down' | 'out'; until: number; loc: string }
export interface Incident {
    id: string; at: number; place: string;
    by: string;                        // 'you', or the name of the one who did it
    act: string; crime: Crime; target?: string; targetKey?: string;
    seen: string[];                    // the people who saw it (names); `crowd`: people nearby saw it too
    crowd: boolean; lawSaw: boolean; reported: boolean; eta?: number;
    state: 'open' | 'wanted' | 'closed';
}
/** `base`: where they take a prisoner (a camp, a hideout); without one, a member's own home. */
export interface Group { id: string; name: string; members: string[]; base?: string }   // members: roster keys
export type HEvent = { text: string; present: string[]; mobility?: Mobility; reason?: string; captor?: string; directive: string };
/** Someone took {{user}} prisoner: they stay at your side wherever you go (or are taken) until you are free. */
export interface Captor { key: string; avatar?: string; name: string; kind: 'cast' | 'walkon'; since: number; moving?: boolean; moves?: number }
/** People the story brought in who came along with you (they asked you to come with them). */
export interface Follower { key: string; name: string; until: number }
export interface HState {
    captives: Record<string, Captive>; down: Record<string, Down>; incidents: Incident[];
    groups: Record<string, Group>; grudge: Record<string, number>;
    law: { mode: 'auto' | 'on' | 'off'; name?: string }; lawKeys: string[];
    jail: Record<string, { name: string; until: number; at?: number }>;   // `at`: the arrest is still to come
    queue: HEvent[];
    captor: Captor | null;
    followers: Follower[];
    /** Who you are (roles: civilian, law, kindred…), and how you'd put it in your own words, for the story. */
    roles: string[]; roleText: string;
    breaches: Breach[];
    /** This game's own laws, and what each person is ("mouse kemonomimi"), by roster key. */
    laws: StoryLaw[]; kinds: Record<string, string>;
    /** Words for what is not a person in this game (besides the world's). */
    notPeople: string[];
}
export function hs(g: Save): HState {
    const x = ((g as any).hostile ??= {}) as HState;
    x.captives ??= {}; x.down ??= {}; x.incidents ??= []; x.groups ??= {}; x.grudge ??= {};
    x.law ??= { mode: 'auto' }; x.lawKeys ??= []; x.jail ??= {}; x.queue ??= []; x.captor ??= null; x.followers ??= []; x.roles ??= []; x.roleText ??= ''; x.breaches ??= []; x.laws ??= []; x.kinds ??= {}; x.notPeople ??= [];
    return x;
}
export interface HxPrefs { on: boolean }
export function hxPrefs(): HxPrefs { const s = settings() as any; s.hostile ??= {}; s.hostile.on ??= true; return s.hostile; }
export const hxOn = () => !TUT.save && psOn() && hxPrefs().on;

/* ---------- the world's law ---------- */

export interface Law { exists: boolean; name: string; roles: string[]; occupations: string[]; slow: boolean; walkOn: string }
/** World.json can set it ("law": { "exists": false } for a world without any); each game can override it. */
/** `worldOnly`: what the world says, without this game's own choice. */
export function lawOf(g: Save, w: WorldDef, worldOnly = false): Law {
    const wl = ((w as any).law ?? {}) as Partial<Law>;
    const medieval = styleOf(w) === 'medieval';
    const roles = wl.roles ?? (medieval ? LAW_ROLES_MEDIEVAL : LAW_ROLES_MODERN);
    const law: Law = {
        exists: wl.exists ?? true,
        name: wl.name ?? (medieval ? 'the city watch' : 'the police'),
        roles,
        // the world's police or guard jobs, by whole words ("Lifeguard" is not the law)
        occupations: wl.occupations ?? w.occupations.filter(o => isLawName(o.name, LAW_JOBS) || o.id.toLowerCase().split(/[^a-z]+/).some(x => LAW_JOB_WORDS.includes(x))).map(o => o.id),
        slow: wl.slow ?? medieval,
        walkOn: wl.walkOn ?? (medieval ? 'a town guard' : 'a police officer'),
    };
    if (worldOnly) return law;
    const own = hs(g).law;
    if (own.mode === 'off') law.exists = false;
    else if (own.mode === 'on') law.exists = true;
    if (own.name?.trim()) law.name = own.name.trim();
    return law;
}
const isLawCast = (g: Save, law: Law, r: Resident) => hs(g).lawKeys.includes(`cast:${r.avatar}`) || (!!r.occupation && law.occupations.includes(r.occupation));
export const isLawKey = (g: Save, w: WorldDef, key: string, name: string) => {
    const law = lawOf(g, w);
    if (hs(g).lawKeys.includes(key)) return true;
    if (key.startsWith('cast:')) { const r = g.cast[key.slice(5)]; return !!r && isLawCast(g, law, r); }
    return isLawName(name, law.roles);
};

const LAW_JOB_WORDS = ['police', 'policeman', 'policewoman', 'cop', 'guard', 'guardsman', 'watch', 'watchman', 'sheriff', 'deputy', 'security', 'constable', 'bailiff', 'marshal', 'detective'];

/* ---------- who is here ---------- */

export interface HerePerson { key: string; name: string; kind: 'cast' | 'walkon'; avatar?: string; met: boolean; law: boolean; down?: 'down' | 'out'; captive?: 'held' | 'restrained'; group?: string }
export function groupOf(g: Save, key: string): Group | undefined { return Object.values(hs(g).groups).find(x => x.members.includes(key)); }
export function peopleHere(g: Save, w: WorldDef): HerePerson[] {
    const st = hs(g); const now = nowAbs(g);
    const out: HerePerson[] = [];
    const add = (p: Omit<HerePerson, 'down' | 'captive' | 'law' | 'group'>) => {
        if (out.some(x => x.key === p.key)) return;
        const d = st.down[p.key]; const c = st.captives[p.key];
        out.push({ ...p, law: isLawKey(g, w, p.key, p.name), down: d && d.until > now && d.loc === g.player.loc ? d.how : undefined, captive: c?.how, group: groupOf(g, p.key)?.name });
    };
    for (const r of presentAt(g, w, g.player.loc)) add({ key: `cast:${r.avatar}`, name: r.met ? r.name : r.name, kind: 'cast', avatar: r.avatar, met: r.met });
    for (const n of walkOns(g, w)) { const k = keyFor(g, n); add({ key: k.key, name: n, kind: 'walkon', met: true }); }
    return out;
}
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const targetState = (p: HerePerson | undefined): TargetState | null => (p ? { down: p.down, captive: p.captive, law: p.law } : null);
const display = (p: HerePerson) => (p.kind === 'cast' && !p.met ? 'someone' : p.name);

/** How busy this place is right now (0–3). */
export function crowdHere(g: Save, w: WorldDef, loc = g.player.loc): number {
    const p = placeOf(g, w, loc);
    return crowdLevel(p?.tags ?? [], Math.floor(g.minutes / 60), isHome(loc), (p as any)?.crowd);
}
export const CROWD_WORD = ['nobody else around', 'a few people around', 'busy', 'packed'];

/* ---------- the menu: what you can do, and the odds ---------- */

export const actsOf = (w: WorldDef, g: Save | null = game()): HostileDef[] => {
    const own = (w as any).hostileActions as HostileDef[] | undefined;   // a world (or a genre pack) adds or replaces some
    const all = own?.length ? [...DEFAULT_ACTS.filter(d => !own.some(o => o.id === d.id)), ...own] : DEFAULT_ACTS;
    const roles = g ? rolesOf(g, w) : [];
    return all.filter(d => !d.role || roles.includes(d.role));   // Feed only for a vampire
};

/* ---------- the decision engine's facts: who you are, who they are ---------- */

/** Your roles: what you chose for this story, and the law when your job is police or guard work. */
export function rolesOf(g: Save, w: WorldDef): string[] {
    const own = hs(g).roles.filter(r => ROLES.some(x => x.id === r));
    const job = g.player.job?.id;
    if (job && lawOf(g, w, true).occupations.includes(job) && !own.includes('law')) own.push('law');
    return own.length ? own : ['civilian'];
}
/** What they are wanted for, if anything: a crime the story reported in this visit, or one still open. */
const ACT_WORDS: Record<string, string> = { grab: 'grab', restrain: 'tie up', knockout: 'knock out', kill: 'kill', punch: 'hit', kick: 'kick', shove: 'shove', threaten: 'threaten', steal: 'take from', feed: 'feed on', scene: 'shout at' };
/** "the mugger", "a mugger" and "Mugger" are the same person. */
const bareName = (n: string) => String(n ?? '').toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/\s+/g, ' ').trim();
export function wantedFor(g: Save, name: string): Crime | '' {
    const n = bareName(name);
    let worstC: Crime = 'none';
    for (const { line } of visitLines(g)) if (line.kind === 'ai' && !line.dismissed) for (const c of line.rep?.crimes ?? []) if (bareName(c.name) === n && SEVERITY[c.crime] > SEVERITY[worstC]) worstC = c.crime;
    for (const i of hs(g).incidents) if (i.by !== 'you' && bareName(i.by) === n && i.state !== 'closed' && SEVERITY[i.crime] > SEVERITY[worstC]) worstC = i.crime;
    return worstC === 'none' ? '' : worstC;
}
/** Are they attacking you (or holding you) right now? From your situation, and from the story's crimes against you. */
export function isAttacker(g: Save, name: string): boolean {
    const s = currentState(g);
    const first = bareName(name).split(' ')[0];
    if (s.captor && s.captor.toLowerCase().includes(first)) return true;
    if (s.mobility !== 'free' && s.reason.toLowerCase().includes(first) && ATTACK_WORDS.test(s.reason)) return true;
    for (const { line } of visitLines(g)) if (line.kind === 'ai' && !line.dismissed) for (const c of line.rep?.crimes ?? []) if (c.name.toLowerCase().includes(first) && c.target === '{{user}}' && c.crime !== 'theft') return true;
    return false;
}
/** The story's laws: the world's (world.json → "laws") and this game's. */
export const lawsOf = (g: Save, w: WorldDef): StoryLaw[] => [...(((w as any).laws ?? []) as StoryLaw[]), ...hs(g).laws];
/** What someone is, as words: what you wrote on the People screen, what their card says, their name, their group. */
export function kindsOf(g: Save, key: string, name: string, avatar?: string): string[] {
    const c = avatar ? charOf(avatar) : null;
    return [hs(g).kinds[key] ?? '', String(c?.data?.extensions?.mundi?.kind ?? ''), ...((c?.tags ?? c?.data?.tags ?? []) as string[]), name, groupOf(g, key)?.name ?? ''].filter(Boolean);
}
export function whoIs(g: Save, w: WorldDef, p: HerePerson): Who {
    const grp = groupOf(g, p.key);
    return {
        kinds: kindsOf(g, p.key, p.name, p.avatar),
        law: p.law, wanted: wantedFor(g, p.name), attacker: isAttacker(g, p.name),
        notPerson: isNotPerson(`${p.name} ${hs(g).kinds[p.key] ?? ''}`, [...(((w as any).notPeople ?? []) as string[]), ...hs(g).notPeople]),
        insider: [grp?.name ?? '', p.name].filter(Boolean),
        willing: !!p.avatar && (bondOf(g, p.avatar) >= 55 || isPartner(g, p.avatar)),
    };
}
/** The verdict for doing this to them, here. */
export function verdictFor(g: Save, w: WorldDef, def: HostileDef, p: HerePerson | undefined): Verdict {
    const atHome = g.player.loc === playerHomeId;
    const base: Crime = def.id === 'take' && atHome ? 'none' : def.crime;
    const s = currentState(g);
    return judge(def, base, rolesOf(g, w), p ? whoIs(g, w, p) : null, s.mobility === 'held' || s.mobility === 'restrained', lawsOf(g, w), hs(g).roleText);
}
export function bonusOf(g: Save, def: HostileDef): number {
    const mine = traitsOf(g);
    let b = def.traits.filter(t => mine.includes(t)).length * 2;
    if ((g.player.stats.energy ?? 100) <= 20) b -= 2;
    if ((g.player.stats.life ?? g.player.stats.health ?? 100) <= 30) b -= 2;
    return b;
}
export interface Option { def: HostileDef; chance: number; blocked: string; dc: number; verdict: Verdict }
export function optionsFor(g: Save, w: WorldDef, targetKey: string): Option[] {
    const p = peopleHere(g, w).find(x => x.key === targetKey);
    const you = currentState(g).mobility;
    return actsOf(w, g).map(def => {
        const t = def.target ? targetState(p) : null;
        const blocked = def.target && !p ? 'Pick someone first.' : blockedFor(def, t);
        const dc = dcFor(def, t, you);
        return { def, dc, blocked, chance: chanceFor(dc, bonusOf(g, def)), verdict: verdictFor(g, w, def, def.target ? p : undefined) };
    });
}
/** Why no hostile action is possible right now ('' when it is). */
export function cannotAct(g: Save): string {
    const s = currentState(g);
    if (s.outcome !== 'none') return 'The story has ended.';
    if (s.mobility === 'restrained') return `You're restrained${s.reason ? ` (${s.reason})` : ''}.`;
    if (s.mobility === 'incapacitated') return 'You can\'t move.';
    return '';
}

/* ---------- doing it ---------- */

export interface ActResult {
    def: HostileDef; target?: HerePerson; d20: number; bonus: number; dc: number; decided: Decided;
    seen: string[]; crowdSaw: boolean; lawHere: string; reported: boolean; noLaw: boolean; cash: number;
    act: { mobility?: Mobility; reason?: string; free?: boolean };   // for {{user}}'s line: what the engine decided for you
    directive: string; line: string; summary: string;
}
const rnd = () => Math.random();
const money = (g: Save, w: WorldDef) => {
    const costs = w.actions.map(a => a.cost).filter(c => c > 0).sort((a, b) => a - b);
    const base = costs.length ? costs[Math.floor(costs.length / 2)] : 10;
    return payOf(g, Math.max(1, Math.round(base * (1.5 + rnd() * 4.5))));
};

export function resolveAct(g: Save, w: WorldDef, id: string, targetKey: string, item = 'something'): ActResult | string {
    const def0 = actsOf(w, g).find(d => d.id === id);
    if (!def0) return 'That action does not exist here.';
    // "take {item}": the thing you named
    const what = String(item ?? '').trim() || 'something';
    const def: HostileDef = def0.id === 'take' ? JSON.parse(JSON.stringify(def0).replace(/\{item\}/g, what.replace(/["\\]/g, ''))) : def0;
    if (!def) return 'That action does not exist here.';
    const why = cannotAct(g); if (why) return why;
    const here = peopleHere(g, w);
    const target = def.target ? here.find(x => x.key === targetKey) : undefined;
    if (def.target && !target) return 'They are not here anymore.';
    const t = targetState(target);
    const blocked = blockedFor(def, t); if (blocked) return blocked;
    const s = currentState(g);
    const staff = (placeOf(g, w, g.player.loc)?.tags ?? []).some(x => ['work', 'shop', 'service', 'food'].includes(x)) ? 'the staff' : 'someone';
    const tName = target ? display(target) : def.id === 'take' ? staff : '';
    const verdict = verdictFor(g, w, def, target);
    const holderIsTarget = !!target && (!s.reason || s.reason.toLowerCase().includes(target.name.toLowerCase().replace(/^(the|a|an)\s+/, '')) || here.filter(x => x.key !== target.key && !x.captive && !x.down).length === 0);
    const dc = dcFor(def, t, s.mobility);
    const bonus = bonusOf(g, def);
    const d20 = 1 + Math.floor(rnd() * 20);
    const decided = decide(def, d20, bonus, dc, tName, t, s.mobility, holderIsTarget);
    const st = hs(g); const now = nowAbs(g); const law = lawOf(g, w);
    const where = placeName(g, w, g.player.loc);
    let cash = 0;

    // what it does to them (written at once)
    if (target) {
        if (decided.change) applyNow(g, w, target.name, decided.change, decided.change === 'dead' ? `killed by ${personaName()}` : '');
        if (decided.change === 'dead') { delete st.captives[target.key]; delete st.down[target.key]; }
        if (decided.down) st.down[target.key] = { key: target.key, name: target.name, avatar: target.avatar, how: decided.down, until: now + (decided.downMins ?? 10), loc: g.player.loc };
        if (decided.captive) st.captives[target.key] = { key: target.key, name: target.name, kind: target.kind, avatar: target.avatar, how: decided.captive, since: now };
        if (decided.scare) applyNow(g, w, target.name, 'left');
        if (decided.money) { cash = money(g, w); g.player.money += cash; }
        if (decided.captive && verdict.kind === 'arrest') st.captives[target.key].custody = true;   // under arrest
        if (decided.captive && verdict.law) st.captives[target.key].lawful = verdict.law.id;          // caught under the story's law
        if (target.avatar && verdict.kind === 'crime') {
            loseBond(g, target.avatar, SEVERITY[def.crime] * (decided.ok ? 6 : 3));
            feel(g, target.avatar, decided.change === 'dead' ? '' : `afraid of and angry at you: you tried to ${fillIn(def.verb, 'them', 'you')}`, 3 + SEVERITY[def.crime]);
        }
    }
    // feeding, or taking blood as a vampire: your hunger is sated
    const roles = rolesOf(g, w);
    if (decided.feed) addStatus(g, w, 'hunger', decided.feed);
    if (decided.take && roles.includes('kindred') && /blood/i.test(what)) addStatus(g, w, 'hunger', 30);
    // the verdict decides what the law sees: an arrest, self-defense or a walker is no crime
    const crime: Crime = verdict.crime;

    // who saw it: the people right here (a quiet action may go unnoticed), and the crowd
    const others = here.filter(x => x.key !== target?.key && !x.captive && x.down !== 'out');
    const seenBy = others.filter(() => rnd() < noticeChance(def.noise));
    const crowd = crowdHere(g, w);
    const crowdSaw = rnd() < crowdSees(crowd, def.noise);
    const victimSaw = !!target && decided.change !== 'dead' && target.down !== 'out' && (def.id !== 'steal' || !decided.ok);
    // an officer steps in on a crime only (not on an arrest, or self-defense)
    const lawP = crime === 'none' ? undefined : seenBy.find(x => x.law) ?? (target?.law && victimSaw && !decided.down && !decided.captive ? target : undefined);
    const known = seenBy.length > 0 || crowdSaw || victimSaw;

    // the law: steps in at once, or someone calls it
    let reported = false, eta: number | undefined;
    if (law.exists && crime !== 'none' && known && !lawP) {
        const ps = [...seenBy.map(x => reportChance(crime, !!x.avatar && (bondOf(g, x.avatar) >= 55 || isPartner(g, x.avatar)))), crowdSaw ? reportChance(crime) : 0, victimSaw ? reportChance(crime) * 0.8 : 0];
        reported = rnd() < 1 - ps.reduce((a, p) => a * (1 - p), 1);
        if (reported) eta = now + responseMinutes(rnd(), law.slow);
    }
    const inc: Incident = { id: `i${now}_${st.incidents.length}`, at: now, place: g.player.loc, by: 'you', act: def.id, crime, target: target?.name, targetKey: target?.key, seen: seenBy.map(display), crowd: crowdSaw, lawSaw: !!lawP && law.exists, reported, eta, state: crime === 'none' ? 'closed' : 'open' };
    if (crime !== 'none' && (known || decided.change === 'dead')) st.incidents.push(inc);
    st.incidents = st.incidents.slice(-60);

    // the people who saw it remember it (and the town will talk); it changes how they feel about you
    const verbPast = fillIn(def.verb, target?.name ?? '', '{u}');
    if (known) {
        const who = [...seenBy.filter(x => x.avatar).map(x => x.avatar!), ...(target?.avatar && victimSaw ? [target.avatar] : [])];
        note(g, decided.ok ? `{u} managed to ${verbPast.replace(/^\{u\} /, '')} at {0}.` : `{u} tried to ${verbPast.replace(/^\{u\} /, '')} at {0}.`, [where], who, g.player.loc, 'life');
        for (const x of seenBy) if (x.avatar && crime !== 'none') { loseBond(g, x.avatar, SEVERITY[crime]); feel(g, x.avatar, `shaken: saw you ${fillIn(def.verb, x.name === target?.name ? 'them' : (target?.name ?? ''), 'you').replace(/^you /, '')}`, 2); }
    }
    // the victim's group: no law needed for this
    const grp = target ? groupOf(g, target.key) : undefined;
    if (grp && crime !== 'none' && (victimSaw || seenBy.some(x => grp.members.includes(x.key)) || decided.change === 'dead')) st.grudge[grp.id] = (st.grudge[grp.id] ?? 0) + SEVERITY[crime];

    // the ones a law of the story leaves uneasy (people of the same kind): they won't report it, but they remember
    if (verdict.law?.objectors?.length) for (const x of seenBy) if (x.avatar && kindMatches(kindsOf(g, x.key, x.name, x.avatar), verdict.law.objectors)) {
        loseBond(g, x.avatar, 8);
        feel(g, x.avatar, `sick at heart: watched you ${fillIn(def.verb, target?.name ?? 'someone', 'you').replace(/^you /, '')}, as the ${verdict.law.name} allows`, 4);
    }
    // codes besides the law (the Masquerade): broken if someone outside it saw
    const broke: string[] = [];
    for (const code of verdict.codes) {
        const witnesses = [...seenBy.map(x => ({ name: display(x), insider: whoIs(g, w, x).insider })), ...(crowdSaw ? [{ name: 'people nearby', insider: [] }] : []), ...(target && victimSaw && def.id !== 'feed' ? [{ name: display(target), insider: whoIs(g, w, target).insider }] : [])];
        const out = outsiders(code, witnesses);
        if (!out.length) continue;
        const c = CODES.find(x => x.id === code)!;
        broke.push(`${c.name} (${out.join(', ')} saw)`);
        st.breaches.push({ code, at: now, place: g.player.loc, seen: out });
        st.breaches = st.breaches.slice(-20);
        const enf = enforcerOf(code, Object.values(st.groups));
        if (enf) st.grudge[enf.id] = (st.grudge[enf.id] ?? 0) + c.severity;
        note(g, '{u} broke {1} at {0}.', [where, c.name], seenBy.filter(x => x.avatar).map(x => x.avatar!), g.player.loc, 'life');
    }

    // what it means for you
    const act: ActResult['act'] = { ...(decided.you ?? {}) };
    if (lawP && law.exists && crime !== 'none') {
        const heavy = SEVERITY[crime] >= SEVERITY.kidnapping;
        act.free = false; act.mobility = heavy ? 'restrained' : 'held'; act.reason = `${display(lawP)} saw it and is arresting ${personaName()}`;
    }
    saveGame();

    // what the AI is told
    const grade = { 'critical-fail': 'CRITICAL FAILURE', fail: 'FAILURE', success: 'SUCCESS', 'critical-success': 'CRITICAL SUCCESS' }[decided.grade];
    const tw = tName || 'them';
    const parts = [
        `[The game rolled for {{user}}'s attempt to ${fillIn(def.verb, tw, '{{user}}')}: ${grade}. What happens: ${decided.text}.`,
        decided.change === 'dead' ? `${tw} is dead.` : decided.change === 'injured' ? `${tw} is hurt.` : '',
        decided.down === 'out' ? `${tw} is unconscious.` : decided.down === 'down' ? `${tw} is on the ground.` : '',
        decided.captive === 'held' ? `${tw} is in {{user}}'s grip and cannot get away.` : decided.captive === 'restrained' ? `${tw} is tied up and cannot move.` : '',
        decided.scare ? `${tw} backs off and leaves.` : '',
        cash ? `{{user}} gets away with some money.` : '',
        seenBy.length ? `${seenBy.map(display).join(', ')} saw it.` : 'Nobody in the scene noticed.',
        crowdSaw ? 'People nearby saw it too.' : '',
        lawP && law.exists && crime !== 'none' ? `${display(lawP)} saw it and moves in to arrest {{user}} right away.` : reported ? `Someone is calling ${law.name}.` : '',
        verdict.why ? `How it stands: ${verdict.why}.` : '',
        broke.length ? `This breaks ${broke.join('; ')}.` : '',
        `Write exactly this outcome and how the people here react; do not change it.`,
        `In the state block: mobility: ${act.free ? 'free' : act.mobility ?? (s.mobility === 'free' ? 'free (or engaged)' : s.mobility)}${decided.change === 'dead' ? `; changes: ${tw} = dead` : ''}.]`,
    ];
    const directive = parts.filter(Boolean).join(' ');
    const line = fillIn(def.line, def.id === 'take' ? '' : tw, '');
    const told = cap(decided.text.replace(/\{\{user\}\}('s)?/g, (_, s) => (s ? 'your' : 'you')));
    const summary = `🎲 ${dc ? `${d20}${bonus ? ` ${bonus > 0 ? '+' : '−'} ${Math.abs(bonus)}` : ''} vs ${dc} · ` : ''}${def.name}: ${told}.${seenBy.length ? ` Seen by ${seenBy.map(display).join(', ')}.` : crowdSaw ? ' People nearby saw it.' : ' Nobody saw it.'}${lawP && law.exists && crime !== 'none' ? ` ${cap(display(lawP))} is arresting you!` : reported ? ` Someone called ${law.name}.` : ''}${verdict.kind === 'arrest' || verdict.kind === 'self-defense' ? ` (${verdict.label}: no crime)` : verdict.kind === 'nothing' ? ' (not a person: no crime)' : ''}${broke.length ? ` You broke ${broke.join('; ')}!` : ''}`;
    return { def, target, d20, bonus, dc, decided, seen: seenBy.map(display), crowdSaw, lawHere: lawP ? display(lawP) : '', reported, noLaw: !law.exists, cash, act, directive, line, summary };
}

/* ---------- captives ---------- */

export const captives = (g: Save) => Object.values(hs(g).captives);
export function letGo(g: Save, w: WorldDef, key: string): string {
    const st = hs(g); const c = st.captives[key]; if (!c) return '';
    delete st.captives[key];
    applyNow(g, w, c.name, 'freed');
    victimReports(g, w, c.name, key, 'kidnapping', 0.6);
    note(g, '{u} let {0} go.', [c.name], c.avatar ? [c.avatar] : [], g.player.loc, 'life');
    saveGame();
    return c.name;
}
/** A victim who got away (or was let go) goes to the law, with some chance. */
function victimReports(g: Save, w: WorldDef, name: string, key: string, crime: Crime, p: number) {
    const law = lawOf(g, w); if (!law.exists || rnd() >= p) return;
    const now = nowAbs(g);
    hs(g).incidents.push({ id: `i${now}_v${hs(g).incidents.length}`, at: now, place: g.player.loc, by: 'you', act: 'report', crime, target: name, targetKey: key, seen: [name], crowd: false, lawSaw: false, reported: true, eta: now + 60 + Math.round(rnd() * 120), state: 'open' });
}

/* ---------- the law's side: taking someone in ---------- */

const closeCrimesOf = (g: Save, name: string) => { for (const i of hs(g).incidents) if (i.by !== 'you' && bareName(i.by) === bareName(name)) i.state = 'closed'; };
/** You are the law and hold them (under arrest, wanted, or attacking you): can you take them in? */
export function canTakeIn(g: Save, w: WorldDef, key: string): boolean {
    const c = hs(g).captives[key]; if (!c || !rolesOf(g, w).includes('law')) return false;
    return !!c.custody || !!wantedFor(g, c.name) || isAttacker(g, c.name);
}
/** To the station (or the cells): they are jailed for a while, their crimes closed. */
export function takeIn(g: Save, w: WorldDef, key: string): { name: string; days: number; directive: string } | null {
    if (!canTakeIn(g, w, key)) return null;
    const st = hs(g); const c = st.captives[key];
    const crime = wantedFor(g, c.name);
    const days = { '': 1, none: 1, minor: 1, theft: 2, assault: 3, kidnapping: 30, murder: 9999 }[crime] ?? 1;
    delete st.captives[key];
    st.jail[key] = { name: c.name, until: nowAbs(g) + days * 1440 };
    applyNow(g, w, c.name, 'captured');
    closeCrimesOf(g, c.name);
    note(g, crime ? '{u} arrested {0} for {1}.' : '{u} arrested {0}.', [c.name, CRIME_WORD[crime || 'none']], c.avatar ? [c.avatar] : [], g.player.loc, 'life');
    saveGame();
    const law = lawOf(g, w);
    return { name: c.name, days, directive: `[{{user}} hands ${c.name} over to ${law.name}${crime ? ` for ${CRIME_WORD[crime]}` : ''}: ${c.name} is taken away to a cell and is gone from the scene. In the state block: changes: ${c.name} = captured.]` };
}

/* ---------- handing someone over, under the story's law ---------- */

export function turnInOf(g: Save, w: WorldDef, key: string): StoryLaw | undefined {
    const c = hs(g).captives[key];
    const l = c?.lawful ? lawsOf(g, w).find(x => x.id === c.lawful) : undefined;
    return l?.handTo ? l : undefined;
}
export function turnIn(g: Save, w: WorldDef, key: string): { name: string; to: string; reward: number; directive: string } | null {
    const l = turnInOf(g, w, key); if (!l) return null;
    const st = hs(g); const c = st.captives[key];
    delete st.captives[key];
    const reward = l.reward ? payOf(g, l.reward) : 0;
    if (reward) g.player.money += reward;
    applyNow(g, w, c.name, 'captured');
    note(g, '{u} turned {0} in to {1}.', [c.name, l.handTo!], c.avatar ? [c.avatar] : [], g.player.loc, 'life');
    saveGame();
    return { name: c.name, to: l.handTo!, reward, directive: `[{{user}} hands ${c.name} over to ${l.handTo}${reward ? `, and is paid ${moneyText(w, reward)}` : ''}, under the ${l.name}. ${c.name} is taken away and is gone from the scene. In the state block: changes: ${c.name} = captured.]` };
}

/* ---------- giving yourself up ---------- */

export interface Surrender { crime: Crime; fine: number; jail: boolean; ending: boolean; directive: string; line: string; act: { free?: boolean; mobility?: Mobility; reason?: string; outcome?: 'captured'; outcomeReason?: string } }
export const openCrimes = (g: Save) => hs(g).incidents.filter(i => i.by === 'you' && i.state !== 'closed');
/** The ones the law knows about (reported, seen by an officer, or looking for you): what giving up is about. */
export const knownCrimes = (g: Save) => openCrimes(g).filter(i => i.reported || i.lawSaw || i.state === 'wanted');
/** The law is right here, holding you (someone who is the law is in the scene and you are held). */
export function lawHolding(g: Save, w: WorldDef): string {
    if (!hxOn() || !lawOf(g, w).exists) return '';
    const s = currentState(g);
    if (s.mobility !== 'held' && s.mobility !== 'restrained') return '';
    const cop = peopleHere(g, w).find(x => x.law && !x.down && !x.captive);
    return cop && (knownCrimes(g).length || /arrest|police|officer|guard|cuff/i.test(s.reason)) ? display(cop) : '';
}
export function surrender(g: Save, w: WorldDef): Surrender {
    const list = knownCrimes(g);
    const crime = worst(list.map(i => i.crime));
    const law = lawOf(g, w);
    for (const i of list) i.state = 'closed';
    const fine = payOf(g, [0, 40, 120, 250, 0, 0, 0, 0, 0][SEVERITY[crime]] ?? 0);
    const ending = SEVERITY[crime] >= SEVERITY.kidnapping;
    const jail = !ending && SEVERITY[crime] >= SEVERITY.theft;
    if (fine) g.player.money = Math.max(0, g.player.money - fine);
    note(g, ending ? '{u} was arrested for {0}.' : jail ? '{u} was arrested for {0} and spent the night in a cell.' : '{u} gave up to {1} and got off with a fine.', [CRIME_WORD[crime] || 'it', law.name], [], g.player.loc, 'life');
    saveGame();
    const word = CRIME_WORD[crime] || 'what happened';
    return {
        crime, fine, jail, ending, line: '*gives up and lets them make the arrest*',
        act: ending ? { outcome: 'captured', outcomeReason: `arrested for ${word}`, mobility: 'restrained', reason: `arrested for ${word}` } : jail ? { mobility: 'restrained', reason: `arrested for ${word}` } : { free: true, reason: 'let off with a fine' },
        directive: ending
            ? `[{{user}} gives up to ${law.name} and is arrested for ${word}. This is the end of {{user}}'s story: they are taken away and will not be free again. In the state block: mobility: restrained; outcome: captured.]`
            : jail ? `[{{user}} gives up to ${law.name} and is arrested for ${word}: handcuffed and taken to a cell for the night. In the state block: mobility: restrained.]`
                : `[{{user}} gives up. ${law.name} let {{user}} off with a warning and a fine. In the state block: mobility: free.]`,
    };
}

/* ---------- time: people come to, captives slip away, the law arrives ---------- */

const here = (g: Save) => g.player.loc;
function lawEvent(g: Save, w: WorldDef, i: Incident, found: boolean): HEvent {
    const law = lawOf(g, w);
    const word = CRIME_WORD[i.crime] || 'trouble';
    const knows = i.seen.length > 0 || !!i.target;
    const cop = law.walkOn.replace(/^(a|an) /, '');
    const text = found
        ? `${law.walkOn.charAt(0).toUpperCase()}${law.walkOn.slice(1)} turns up and heads straight for you: it's about the ${word} at ${placeName(g, w, i.place)}.`
        : `${law.name.charAt(0).toUpperCase()}${law.name.slice(1)} ${law.name.startsWith('the') ? 'arrive' : 'arrives'}, answering a call about the ${word}.${knows ? ' Someone points at you.' : ' They look around and ask questions.'}`;
    return {
        text, present: [cop],
        mobility: found || knows ? 'held' : undefined,
        reason: found || knows ? `${cop} questioning {{user}} about the ${word}` : '',
        directive: `[${found ? `${law.name} found {{user}}` : `${law.name} just arrived`}: ${cop} is here about the ${word}${i.target ? ` (${i.target})` : ''} at ${placeName(g, w, i.place)}.${found || knows ? ` ${cop} keeps {{user}} here and questions them; {{user}} may talk their way out, try to get away, or give up.` : ' They have not picked anyone out yet.'} In the state block, list ${cop} under present${found || knows ? ' and mobility: held' : ''}.]`,
    };
}
function step(g: Save, w: WorldDef): string[] {
    if (!hxOn() && !Object.keys(hs(g).captives).length) return [];
    const st = hs(g); const now = nowAbs(g); const out: string[] = [];
    for (const d of Object.values(st.down)) if (d.until <= now) {
        delete st.down[d.key];
        if (d.how === 'out' && d.loc === here(g) && statusOf(g, d.key) !== 'dead') st.queue.push({ text: `${d.name} comes to, groggy.`, present: [d.name], directive: `[${d.name} has just come to and can move again.]` });
    }
    const law = lawOf(g, w);
    for (const i of st.incidents) {
        if (i.state !== 'open' || !i.reported || i.eta === undefined || i.eta > now) continue;
        if (!law.exists) { i.state = 'closed'; continue; }
        if (i.by !== 'you') { i.state = 'closed'; continue; }
        if (i.place === here(g)) { st.queue.push(lawEvent(g, w, i, false)); i.state = 'wanted'; i.lawSaw = true; }
        else i.state = 'wanted';
    }
    for (const [key, j] of Object.entries(st.jail)) {
        if (j.at !== undefined && j.at <= now) { delete j.at; applyNow(g, w, j.name, 'captured'); closeCrimesOf(g, j.name); note(g, '{0} was arrested.', [j.name], [], g.player.loc, 'life'); out.push(`${j.name} was arrested.`); }
        else if (j.at === undefined && j.until <= now) { delete st.jail[key]; applyNow(g, w, j.name, 'freed'); note(g, '{0} was let out of jail.', [j.name], [], g.player.loc, 'life'); }
    }
    return out;
}
function hourly(g: Save, w: WorldDef): string[] {
    const st = hs(g); const out: string[] = [];
    for (const c of Object.values(st.captives)) {
        const p = c.how === 'restrained' ? (g.asleep ? 0.15 : 0.05) : (g.asleep ? 0.9 : 0.3);
        if (Math.random() >= p) continue;
        delete st.captives[c.key];
        applyNow(g, w, c.name, 'left');
        note(g, '{0} got away from {u}.', [c.name], c.avatar ? [c.avatar] : [], g.player.loc, 'life');
        victimReports(g, w, c.name, c.key, 'kidnapping', 0.9);
        st.queue.push({ text: `${c.name} slips free and gets away.`, present: [], directive: `[${c.name} just got free and ran off: they are gone from the scene.]` });
        out.push(`${c.name} got away from you.`);
    }
    return out;
}
function daily(g: Save): string[] {
    const keep: Record<Crime, number> = { none: 0, minor: 2, theft: 4, assault: 6, kidnapping: 14, murder: 9999 };
    const now = nowAbs(g);
    for (const i of hs(g).incidents) if (i.state !== 'closed' && now - i.at > keep[i.crime] * 1440) i.state = 'closed';
    for (const k of Object.keys(hs(g).grudge)) hs(g).grudge[k] = Math.max(0, hs(g).grudge[k] - 0.5);
    return [];
}

/** You arrived somewhere: your captives come along (and people may see them), the law may find you, a group may be waiting. */
export function onArrive(g: Save, w: WorldDef) {
    if (!hxOn()) return;
    const st = hs(g); const law = lawOf(g, w); const now = nowAbs(g);
    const crowd = crowdHere(g, w);
    const caps = captives(g);
    if (caps.length && crowd >= 2 && rnd() < crowdSees(crowd, 2)) {
        const c = caps[0];
        const reported = law.exists && rnd() < reportChance('kidnapping');
        st.incidents.push({ id: `i${now}_c`, at: now, place: g.player.loc, by: 'you', act: 'kidnap', crime: 'kidnapping', target: c.name, targetKey: c.key, seen: [], crowd: true, lawSaw: false, reported, eta: reported ? now + responseMinutes(rnd(), law.slow) : undefined, state: 'open' });
    }
    // wanted: the law may find you here (at home, much more likely: they know where you live)
    const wanted = st.incidents.filter(i => i.by === 'you' && i.state === 'wanted');
    if (law.exists && wanted.length && !st.queue.length) {
        const top = wanted.reduce((a, b) => (SEVERITY[b.crime] > SEVERITY[a.crime] ? b : a));
        const knownYou = top.seen.length > 0 || !!top.target;
        const p = (g.player.loc === playerHomeId ? (knownYou ? 0.5 : 0.2) : 0.1) * (SEVERITY[top.crime] >= SEVERITY.kidnapping ? 1.5 : 1);
        if (rnd() < p) st.queue.push(lawEvent(g, w, top, true));
    }
    // a group you wronged
    if (!st.queue.length) {
        const hereNow = peopleHere(g, w);
        for (const grp of Object.values(st.groups)) {
            const grudge = st.grudge[grp.id] ?? 0;
            if (grudge < 3) continue;
            const members = hereNow.filter(x => grp.members.includes(x.key) && !x.captive && !x.down);
            if (members.length) {
                st.grudge[grp.id] = Math.max(0, grudge - 3);
                st.queue.push({ text: `${members.map(display).join(' and ')} ${members.length > 1 ? 'see' : 'sees'} you, and ${members.length > 1 ? 'they remember' : 'remembers'} what you did.`, present: members.map(x => x.name), mobility: 'held', reason: `${grp.name} want payback`, directive: `[${members.map(x => x.name).join(', ')} (${grp.name}) know what {{user}} did to one of them, and confront {{user}} now: they block the way. In the state block: mobility: held.]` });
                break;
            }
            if (grudge >= 6 && rnd() < 0.15 + grudge * 0.02) {
                st.grudge[grp.id] = Math.max(0, grudge - 4);
                const who = `some of ${grp.name}`;
                st.queue.push({ text: `A few of ${grp.name} turn up. They've been looking for you.`, present: [who], mobility: 'held', reason: `${grp.name} came for {{user}}`, directive: `[${who} have tracked {{user}} down to get even. They surround {{user}}. In the state block: list them under present; mobility: held.]` });
                break;
            }
        }
    }
    saveGame();
}

/** What is waiting to happen is told now: a short line in the scene, and the state the engine decided. */
let flushing = false;
export async function flushEvents() {
    const g = game(); if (!g || flushing || !hs(g).queue.length || !psOn()) return;
    // not in the middle of someone's reply: once they are done
    if (state.generating) { setTimeout(() => { void flushEvents(); }, 1500); return; }
    flushing = true;
    try {
        const list = hs(g).queue.splice(0); saveGame();
        for (const ev of list) {
            await narratorLine(ev.text);
            const i = chat().length - 1;
            // a line that changes your situation (the police arrive) carries it; a plain one (someone left) is just said
            if (ev.present.length || ev.mobility || ev.captor) keepNarration(i, { present: ev.present.length ? [...new Set([...currentState(g).present, ...ev.present])] : undefined, ...(ev.mobility ? { mobility: ev.mobility, reason: ev.reason?.replace(/\{\{user\}\}/g, personaName()) } : {}), ...(ev.captor ? { captor: ev.captor } : {}) });
            pushDirective(ev.directive);
        }
    } catch (e) { console.warn('[Mundi] hostile events', e); }
    flushing = false;
}

/* ---------- one-shot orders for the next reply ---------- */

export const HX_KEY = 'mundi_hx';
let orders: string[] = [];
let armedAt = 0;
export function pushDirective(text: string) {
    if (!text) return;
    orders.push(text); armedAt = Date.now();
    ctx().setExtensionPrompt(HX_KEY, orders.join('\n'), 1, 0, false, 0);
}
export function clearDirectives() { if (!orders.length) return; orders = []; armedAt = 0; ctx().setExtensionPrompt(HX_KEY, '', 1, 0, false, 0); }
setInterval(() => { if (armedAt && Date.now() - armedAt > 180000) clearDirectives(); }, 30000);

/** The act waiting for {{user}}'s line (it is marked with what the engine decided, so the player state follows). */
let pendingAct: Record<string, unknown> | null = null;
export const armAct = (a: Record<string, unknown>) => { pendingAct = a; };
export function markSent(id: number) {
    if (!pendingAct) return;
    const m = chat()[id]; if (!m?.is_user) return;
    m.extra = { ...(m.extra ?? {}), mundi_act: pendingAct };
    pendingAct = null;
    saveChat(); refreshPState();
}

/* ---------- the end of a visit: crimes the story reported ---------- */

export function endVisitHostile(g: Save, w: WorldDef) {
    if (!hxOn()) return;
    const st = hs(g); const law = lawOf(g, w); const now = nowAbs(g);
    const seen = seenWalkOns(g, w);
    const lawWasHere = seen.some(n => isLawName(n, law.roles)) || presentAt(g, w, g.player.loc).some(r => isLawCast(g, law, r));
    const jailDays: Record<Crime, number> = { none: 0, minor: 1, theft: 2, assault: 3, kidnapping: 30, murder: 9999 };
    for (const { line } of visitLines(g)) {
        if (line.kind !== 'ai' || line.dismissed) continue;
        for (const c of line.rep?.crimes ?? []) {
            const k = keyFor(g, c.name);
            if (statusOf(g, k.key) === 'dead' || st.jail[k.key]) continue;
            st.incidents.push({ id: `i${now}_n${st.incidents.length}`, at: now, place: g.player.loc, by: c.name, act: 'story', crime: c.crime, target: c.target, seen: [personaName()], crowd: false, lawSaw: lawWasHere, reported: false, state: lawWasHere && law.exists ? 'closed' : 'open' });
            note(g, '{0} committed {1} at {2}.', [c.name, CRIME_WORD[c.crime], placeName(g, w, g.player.loc)], k.avatar ? [k.avatar] : [], g.player.loc, 'life');
            if (!law.exists) continue;
            // a law officer was there: arrested on the spot (the story told it); otherwise maybe later
            const p = lawWasHere ? 1 : reportChance(c.crime) * 0.7;
            if (rnd() < p) st.jail[k.key] = { name: c.name, until: now + jailDays[c.crime] * 1440, ...(lawWasHere ? {} : { at: now + 120 + Math.round(rnd() * 600) }) };
            if (lawWasHere) { applyNow(g, w, c.name, 'captured'); note(g, '{0} was arrested.', [c.name], [], g.player.loc, 'life'); }
        }
    }
    // the story freed or let go of one of your captives
    for (const p of pendingChanges(g)) if (st.captives[p.key] && (p.change === 'freed' || p.change === 'left' || p.change === 'missing')) delete st.captives[p.key];
    // the people down here stay here; the visit's walk-on police leave with the visit
    st.incidents = st.incidents.slice(-60);
}

/* ---------- being taken somewhere: a prisoner moved, or an invitation to come along ---------- */

/** Where someone lives (the same rule as their routine: with you, with someone else, or their own home). */
export function homeOf(r: Resident): string {
    const hw = (r as any).homeWith;
    return hw === '__you' ? playerHomeId : hw ? `home:${hw}` : `home:${r.avatar}`;
}
const bare = (t: string) => String(t ?? '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
/**
 * The place a reply names ("the docks", "her place", "Zack's apartment", "the Waterfront bar") as one of the map's.
 * `leaderKey`: who is taking you ("her place" is theirs). '' when the map has no such place.
 */
export function resolvePlace(g: Save, w: WorldDef, text: string, leaderKey = ''): string {
    const t = bare(text);
    if (!t) return '';
    const me = bare(personaName()).split(' ')[0];
    const homeWord = /\b(place|home|house|flat|apartment|room|crib|pad|condo|cabin|cottage|loft|basement)\b/;
    const leader = leaderKey.startsWith('cast:') ? g.cast[leaderKey.slice(5)] : undefined;
    if (homeWord.test(t) || /^home$/.test(t)) {
        if (/\b(your|you're|youre|users?)\b/.test(t) || (me && new RegExp(`\\b${me}'?s?\\b`).test(t))) return playerHomeId;
        for (const r of Object.values(g.cast)) {
            const first = bare(r.name).split(' ')[0];
            if (first && new RegExp(`\\b${first}'?s?\\b`).test(t)) return homeOf(r);
        }
        if (leader && (/\b(her|his|their|own)\b/.test(t) || /^home$/.test(t))) return homeOf(leader);
    }
    // a place on the map, by its name (either way round: "the docks" / "Port & Fish Market docks")
    let best = '', score = 0;
    for (const p of w.places) {
        if (p.link) continue;
        const n = bare(p.name), id = bare(p.id);
        const sc = n === t || id === t ? 100 : n.includes(t) || t.includes(n) ? 50 + Math.min(n.length, t.length) : t.split(' ').filter(x => x.length > 3 && (n.split(' ').includes(x) || id === x)).length * 10;
        if (sc > score) { score = sc; best = p.id; }
    }
    return score >= 10 ? best : '';
}
export interface Lead { name: string; key: string; avatar?: string; kind: 'cast' | 'walkon'; to: string; text: string; forced: boolean; line: string }
/**
 * The newest reply says someone is taking {{user}} somewhere ("going:"). Forced when {{user}} is their prisoner (or
 * held or restrained by them); otherwise it is an invitation the player answers. Each reply is asked only once.
 */
export function newLead(g: Save, w: WorldDef): Lead | null {
    if (!hxOn()) return null;
    const lines = visitLines(g);
    const last = [...lines].reverse().find(x => x.line.kind === 'ai');
    const go = last && !last.line.dismissed ? last.line.rep?.going : null;
    if (!go) return null;
    const m = chat()[last!.i];
    const sig = `${last!.i}:${String(m?.mes ?? '').length}`;
    const st = hs(g);
    if ((st as any).leadSeen === sig) return null;
    (st as any).leadSeen = sig;
    const s = currentState(g);
    if (s.outcome !== 'none') return null;
    const k = keyFor(g, go.name);
    const to = resolvePlace(g, w, go.place, k.key);
    const captor = st.captor?.key === k.key || (s.captor && keyFor(g, s.captor).key === k.key);
    const forced = !!captor || ((s.mobility === 'held' || s.mobility === 'restrained' || s.mobility === 'incapacitated') && (!s.reason || s.reason.toLowerCase().includes(bare(go.name).split(' ')[0])));
    const lead: Lead = { name: k.kind === 'cast' ? k.name : go.name, key: k.key, avatar: k.avatar, kind: k.kind, to, text: go.place, forced, line: sig };
    saveGame();
    return lead;
}
/**
 * A hard capture, the first move: the story says someone has taken {{user}} prisoner ("captor:", and {{user}}
 * restrained or unable to move) without saying where to. A cast member takes you to their home; a group with a base,
 * to the base. Someone the story brought in, with no home on the map, keeps you where you are (and follows you).
 */
export function hardCapture(g: Save, w: WorldDef): Lead | null {
    if (!hxOn()) return null;
    const s = currentState(g);
    if (!s.captor || (s.mobility !== 'restrained' && s.mobility !== 'incapacitated') || s.outcome !== 'none') return null;
    const st = hs(g);
    const k = keyFor(g, s.captor);
    if (st.captor?.key === k.key) return null;   // already their prisoner: they move you with "going:"
    const grp = Object.values(st.groups).find(x => x.name.toLowerCase() === s.captor.toLowerCase() || x.members.includes(k.key));
    let to = grp?.base && placeOf(g, w, grp.base) ? grp.base : '';
    if (!to && k.kind === 'cast' && k.avatar && g.cast[k.avatar]) to = homeOf(g.cast[k.avatar]);
    return { name: k.kind === 'cast' ? k.name : s.captor, key: k.key, avatar: k.avatar, kind: k.kind, to: to === g.player.loc ? '' : to, text: '', forced: true, line: '' };
}
/** You are their prisoner from now on: they go wherever you go (and you go wherever they take you). */
export function takePrisoner(g: Save, c: Lead) {
    const st = hs(g);
    const again = st.captor?.key === c.key;
    st.captor = { key: c.key, avatar: c.avatar, name: c.name, kind: c.kind, since: again ? st.captor!.since : nowAbs(g), moving: true, moves: again ? st.captor!.moves ?? 0 : 0 };
    if (c.avatar && g.cast[c.avatar]) g.cast[c.avatar].met = true;   // you know who did it
    // taken: the people who came along with you do not come along now (your captor does)
    const soc = (g as any).social; if (soc?.with) soc.with = soc.with.filter((x: any) => x.avatar === c.avatar);
    st.followers = [];
    saveGame();
}
/** Called once you are there (or right away, when they keep you where you are): the scene goes on, you still held. */
export function arrivedCaptive(g: Save, w: WorldDef, c: Lead, how: Mobility, moved: boolean) {
    const st = hs(g);
    if (st.captor) st.captor.moving = false;
    const place = placeName(g, w, g.player.loc);
    const there = g.player.loc === playerHomeId ? 'your own home' : c.avatar && g.player.loc === homeOf(g.cast[c.avatar]) ? 'their place' : place;
    const first = !st.captor?.moves;
    if (st.captor && moved) st.captor.moves = (st.captor.moves ?? 0) + 1;
    if (!first && moved) note(g, '{0} took {u} to {1}, still a prisoner.', [c.name, place], c.avatar ? [c.avatar] : [], g.player.loc, 'life');
    else if (moved) note(g, '{0} took {u} prisoner and brought {u} to {1}.', [c.name, place], c.avatar ? [c.avatar] : [], g.player.loc, 'life');
    else note(g, '{0} took {u} prisoner.', [c.name], c.avatar ? [c.avatar] : [], g.player.loc, 'life');
    st.queue.push({
        text: moved ? `${c.name} brings you to ${there}. You're still ${how === 'incapacitated' ? 'out of it' : 'tied up'}.` : `You're ${c.name}'s prisoner now.`,
        present: [c.name], mobility: how, reason: `held prisoner by ${c.name}${moved ? ` at ${place}` : ''}`, captor: c.name,
        directive: `[${c.name} has taken {{user}} prisoner${moved ? ` and brought them to ${place}` : ''}. {{user}} is ${how === 'incapacitated' ? 'barely conscious' : 'restrained'} and cannot leave; ${c.name} stays with {{user}}. Go on with the scene here. In the state block: mobility: ${how}; captor: ${c.name}.]`,
    });
    saveGame();
}
/** Free again: the captor goes back to their life (not while they are moving you). */
export function releaseCaptor(g: Save) {
    const st = hs(g); if (!st.captor || st.captor.moving) return;
    const s = currentState(g);
    if (s.mobility === 'free' || s.mobility === 'engaged') st.captor = null;
}
/** Going along with someone (they asked you to come): they come with you for a while. */
export function followLeader(g: Save, l: Lead, hours = 3) {
    const st = hs(g); const until = nowAbs(g) + hours * 60;
    if (l.kind === 'cast' && l.avatar) {
        const soc = (g as any).social ??= {}; soc.with ??= [];
        soc.with = soc.with.filter((c: any) => c.avatar !== l.avatar);
        soc.with.push({ avatar: l.avatar, until });
        if (g.cast[l.avatar]) g.cast[l.avatar].met = true;
    } else {
        st.followers = st.followers.filter(f => f.key !== l.key);
        st.followers.push({ key: l.key, name: l.name, until });
    }
    saveGame();
}
export const followers = (g: Save) => hs(g).followers.filter(f => f.until > nowAbs(g));

/* ---------- for the prompt ---------- */

export function hostileLines(g: Save, w: WorldDef): string[] {
    if (!hxOn()) return [];
    const st = hs(g); const law = lawOf(g, w); const now = nowAbs(g);
    const caps = captives(g);
    const down = Object.values(st.down).filter(d => d.until > now && d.loc === g.player.loc);
    const wanted = openCrimes(g).filter(i => i.state === 'wanted' || i.lawSaw);
    const hereNow = peopleHere(g, w);
    const grudges = Object.values(st.groups).filter(x => (st.grudge[x.id] ?? 0) >= 3 && hereNow.some(p => x.members.includes(p.key)));
    const lawNames = hereNow.filter(x => x.law).map(display);
    const roles = rolesOf(g, w).filter(r => r !== 'civilian').map(r => ROLES.find(x => x.id === r)!);
    const codeNames = [...new Set(roles.flatMap(r => r.codes ?? []))].map(id => CODES.find(c => c.id === id)!.name);
    const recent = st.breaches.filter(b => now - b.at < 7 * 1440);
    return [
        ...lawsOf(g, w).map(l => `A law of this world, the ${l.name}: ${l.who.length ? l.who.join(' or ') : 'anyone'} may ${l.allows.map(a => ACT_WORDS[a] ?? a).join(', ')} ${l.about.join(' or ')}${l.handTo ? `, and hand them over to ${l.handTo}${l.reward ? ` for a reward of ${moneyText(w, payOf(g, l.reward))}` : ''}` : ''}${l.consent ? ', only when they agree to it' : ''}${l.counts === 'minor' ? ' (a minor offense at most)' : ' (it is legal)'}.${l.note ? ` ${l.note}` : ''}`),
        ...hereNow.flatMap(p => lawsAbout(lawsOf(g, w), kindsOf(g, p.key, p.name, p.avatar)).length ? [`${display(p)} is covered by the ${lawsAbout(lawsOf(g, w), kindsOf(g, p.key, p.name, p.avatar)).map(l => l.name).join(' and ')}.`] : []).slice(0, 4),
        roles.length || st.roleText.trim() ? `Who {{user}} is: ${[...roles.map(r => r.name.toLowerCase()), st.roleText.trim()].filter(Boolean).join('; ')}.${roles.some(r => r.authority) ? ' {{user}} may lawfully arrest people who are wanted or who attack them.' : ''}${codeNames.length ? ` {{user}} lives under ${codeNames.join(' and ')}.` : ''}` : '',
        recent.length ? `{{user}} broke ${[...new Set(recent.map(b => CODES.find(c => c.id === b.code)?.name ?? b.code))].join(', ')} recently (seen by ${[...new Set(recent.flatMap(b => b.seen))].slice(0, 4).join(', ')}).` : '',
        law.exists ? `The law here: ${law.name}. A crime people see can be reported, and ${law.name} come${law.name.startsWith('the') ? '' : 's'} for whoever did it.${lawNames.length ? ` Here right now: ${lawNames.join(', ')}.` : ''}` : 'There is no law here: no police, nobody comes to stop or arrest anyone. People deal with trouble themselves.',
        caps.length ? `With {{user}}, held against their will: ${caps.map(c => `${c.name} (${c.how === 'restrained' ? 'tied up' : 'in {{user}}\'s grip'})`).join(', ')}. They stay with {{user}} until the game says they get away.` : '',
        down.length ? `On the ground here: ${down.map(d => `${d.name} (${d.how === 'out' ? 'unconscious' : 'knocked down'})`).join(', ')}.` : '',
        wanted.length ? `{{user}} is wanted by ${law.name} for ${[...new Set(wanted.map(i => CRIME_WORD[i.crime]))].join(', ')}.` : '',
        grudges.length ? `${grudges.map(x => x.name).join(', ')} want payback from {{user}}.` : '',
        st.captor ? `{{user}} is ${st.captor.name}'s prisoner: ${st.captor.name} stays with {{user}} and takes them wherever they go ("going:" in the block).` : '',
        followers(g).length ? `Came along with {{user}}: ${followers(g).map(f => f.name).join(', ')}.` : '',
    ].filter(Boolean);
}

/* ---------- hooked in at start ---------- */

let wired = false;
export function initHostile() {
    if (wired) return; wired = true;
    psHooks.crimes = () => hxOn();
    psHooks.directives.push(() => orders.join('\n'));
    // the people the engine knows are with you: walk-ons you hold, a walk-on holding you, the ones who came along
    psHooks.present = () => {
        const g = game(); if (!g || !hxOn()) return [];
        const st = hs(g);
        return [...captives(g).filter(c => c.kind === 'walkon').map(c => c.name), ...(st.captor?.kind === 'walkon' ? [st.captor.name] : []), ...followers(g).map(f => f.name)];
    };
    rosterHooks.isCaptive = (key: string) => { const g = game(); return !!g && !!hs(g).captives[key]; };
    peopleHooks.at = (g: Save, avatar: string) => {
        const st = (g as any).hostile as HState | undefined; if (!st) return '';
        const key = `cast:${avatar}`;
        if (st.captives?.[key]) return g.player.loc;
        if (st.captor?.avatar === avatar) return g.player.loc;   // your captor never leaves your side
        const d = st.down?.[key]; if (d && d.until > nowAbs(g)) return d.loc;
        return '';
    };
    onStep.push((g, w) => step(g, w));
    onHour.push((g, w) => hourly(g, w));
    onDay.push((g) => daily(g));
}
export const hostileWorld = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
