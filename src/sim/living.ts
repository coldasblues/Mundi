// The living world: approval (what people think of how you behave), lore that switches on with the state of
// the world, people's own lives moving on over the weeks, and rumors that travel between people.
import { personaName } from '../st/bridge.js';
import { nowAbs, type Save, type Resident } from '../core/store.js';
import { systemOn, type WorldDef, type LoreEntry } from '../core/world.js';
import { onDay } from './hooks.js';
import { residents, whereNow } from './people.js';
import { weatherAt, regionOf, regionState } from './worldstate.js';
import { period, isWeekend, seasonOf } from './time.js';
import { note, facts, factText } from './facts.js';
import { homeSpot, takenHomes } from './homes.js';
import { lifeMoment } from './happenings.js';

const rnd = (g: Save, salt: string) => { let h = 2166136261; const s = `${g.world}|${g.day}|${salt}`; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const L = (g: Save) => { const x = ((g as any).living ??= {}); x.approval ??= {}; x.rumors ??= []; x.pairs ??= []; return x as { approval: Record<string, number>; rumors: Rumor[]; pairs: [string, string][] }; };

/* ---------- approval (55): what people think of the way you act, -100..100 ---------- */

export const approvalOf = (g: Save, avatar: string) => L(g).approval[avatar] ?? 0;
export function approve(g: Save, avatar: string, delta: number) { const a = L(g).approval; a[avatar] = Math.max(-100, Math.min(100, (a[avatar] ?? 0) + delta)); }
// Everyone who hears about it reacts a little (kind acts raise it, broken promises lower it).
export function approveAll(g: Save, delta: number, except: string[] = []) { for (const r of residents(g)) if (r.met && !except.includes(r.avatar)) approve(g, r.avatar, delta); }
export const approvalWord = (v: number) => (v >= 50 ? 'Admires you' : v >= 15 ? 'Approves of you' : v > -15 ? 'Neutral' : v > -50 ? 'Disapproves' : 'Despises your ways');
export function approvalLine(g: Save, present: Resident[]) {
    const p = present.filter(r => Math.abs(approvalOf(g, r.avatar)) >= 15);
    return p.length ? `What they think of how {{user}} behaves: ${p.map(r => `${r.name} — ${approvalWord(approvalOf(g, r.avatar)).toLowerCase()}`).join('; ')}.` : '';
}

/* ---------- lore that switches on with the world (75) ---------- */

// A world's lore entry can have `when`: the weather, the part of the day, a place or a region, weekends, a season,
// the public mood or tension of the region, a range of days, or a chance each day. `rumor: true` makes it a rumor
// that goes around instead (people mention it; see the rumor pool below).
export interface LoreWhen {
    weather?: string; period?: string; place?: string; weekend?: boolean;
    region?: string; season?: string; tensionAbove?: number; moodAbove?: number; moodBelow?: number;
    fromDay?: number; toDay?: number; chance?: number;
}
type WhenLore = LoreEntry & { when?: LoreWhen; rumor?: boolean };
// The day-wide conditions (no place or hour): also what decides when a world rumor starts going around.
function dayHolds(g: Save, w: WorldDef, c: LoreWhen, key: string, place = g.player.loc): boolean {
    if (c.weather && !weatherAt(g, w, place).name.toLowerCase().includes(c.weather.toLowerCase())) return false;
    if (c.weekend !== undefined && c.weekend !== isWeekend(g.day)) return false;
    if (c.season && c.season !== seasonOf(g).id) return false;
    if (c.fromDay && g.day < c.fromDay) return false;
    if (c.toDay && g.day > c.toDay) return false;
    const reg = c.region ?? regionOf(g, w, place);
    if (c.tensionAbove !== undefined || c.moodAbove !== undefined || c.moodBelow !== undefined) {
        if (!systemOn(w, 'living')) return false;
        const r = regionState(g, w, reg);
        if (c.tensionAbove !== undefined && r.tension <= c.tensionAbove) return false;
        if (c.moodAbove !== undefined && r.mood <= c.moodAbove) return false;
        if (c.moodBelow !== undefined && r.mood >= c.moodBelow) return false;
    }
    if (c.chance !== undefined && c.chance < 1 && rnd(g, `lore|${key}`) >= c.chance) return false;
    return true;
}
export function activeWorldLore(g: Save, w: WorldDef): string[] {
    const per = period(w, g.minutes).name.toLowerCase();
    return (w.lore as WhenLore[]).filter((e, i) => {
        const c = e.when; if (!c || !e.content || e.rumor) return false;
        if (c.period && c.period.toLowerCase() !== per) return false;
        if (c.place && c.place !== g.player.loc) return false;
        if (c.region && c.region !== regionOf(g, w, g.player.loc)) return false;
        return dayHolds(g, w, c, String(i));
    }).map(e => e.content);
}

/* ---------- people's own lives (76) ---------- */

export const couples = (g: Save) => L(g).pairs.filter(([a, b]) => g.cast[a] && g.cast[b]);
function lifeGoesOn(g: Save, w: WorldDef): string[] {
    const out: string[] = [];
    const people = residents(g);
    if (!people.length) return out;
    // about once a week someone's life changes: a new job, a new home, or a new relationship
    if (rnd(g, 'life') > 0.15) return out;
    const r = people[Math.floor(rnd(g, 'who') * people.length)];
    const kind = rnd(g, 'kind');
    const tell = (t: string, a: string[]) => { if (r.met) out.push(a.reduce((s, x, i) => s.replace(`{${i}}`, x), t)); };
    if (kind < 0.35 && w.occupations.length) {
        const o = w.occupations[Math.floor(rnd(g, 'job') * w.occupations.length)];
        if (o.id !== r.occupation && systemOn(w, 'jobs')) {
            r.occupation = o.id; delete ((g as any).living?.ranks ?? {})[r.avatar];
            note(g, '{0} started a new job: {1}.', [r.name, o.name], [r.avatar], o.place, 'life'); tell('{0} started a new job: {1}.', [r.name, o.name]);
            lifeMoment(g, w, r.avatar, `${r.name} started a new job: ${o.name}.`, 'good');
        }
    } else if (kind < 0.6) {
        const z = w.homes.zones[Math.floor(rnd(g, 'zone') * w.homes.zones.length)];
        // the whole household moves together (someone who lives with you stays)
        if (homeKey(r.home) !== homeKey(g.player.home)) {
            const taken = takenHomes(g);
            const house = people.filter(x => homeKey(x.home) === homeKey(r.home));
            const spot = homeSpot(w, z.id, taken, g.player.home);
            for (const x of house) x.home = { ...spot };
            normalizeHomes(g);
            note(g, '{0} moved to {1}.', [r.name, z.name], [r.avatar], `home:${r.avatar}`, 'life'); tell('{0} moved to {1}.', [r.name, z.name]);
        }
    } else {
        const single = people.filter(x => x !== r && !L(g).pairs.some(p => p.includes(x.avatar)) && !L(g).pairs.some(p => p.includes(r.avatar)) && !(g as any).social?.partner?.includes(x.avatar));
        if (single.length && !(g as any).social?.partner?.includes(r.avatar) && systemOn(w, 'romance')) {
            const o = single[Math.floor(rnd(g, 'pair') * single.length)];
            L(g).pairs.push([r.avatar, o.avatar]);
            note(g, '{0} and {1} started dating.', [r.name, o.name], [r.avatar, o.avatar], r.leisure[0] ?? g.player.loc, 'life');
            if (o.met) out.push(`${r.name} and ${o.name} started dating.`); else tell('{0} and {1} started dating.', [r.name, o.name]);
        }
    }
    return out;
}
export function couplesLine(g: Save, present: Resident[]) {
    const here = new Set(present.map(r => r.avatar));
    const c = couples(g).filter(([a, b]) => here.has(a) || here.has(b));
    const stage = (a: string, b: string) => ((g as any).living?.pairInfo?.[[a, b].sort().join('|')]?.stage ?? 'dating') as string;
    const word: Record<string, string> = { dating: 'are dating', engaged: 'are engaged', married: 'are married' };
    return c.length ? `Relationships between people: ${c.map(([a, b]) => `${g.cast[a].name} and ${g.cast[b].name} ${word[stage(a, b)] ?? 'are dating'}`).join('; ')}.` : '';
}

/* ---------- rumors (77) ---------- */

// The rumor pool: what goes around. A rumor starts from something juicy that happened (to you or to anyone), or
// from the world's own lore marked as a rumor; it spreads between people who spend time at the same places
// (faster where the town is tense), cools down day by day, and gets garbled as it passes from mouth to mouth.
// `hops`: how many mouths it went through to reach each person (0: they saw it). '__you' in knownBy: you heard it.
export interface Rumor { id: string; text: string; at: number; knownBy: string[]; heat?: number; hops?: Record<string, number>; world?: boolean; heard?: number }
const GOSSIP = ['love', 'party', 'plan', 'life', 'goal', 'work', 'crisis'];
export const YOU = '__you';
export const rumorPool = (g: Save): Rumor[] => L(g).rumors;
const heatOf = (g: Save, r: Rumor) => r.heat ?? Math.max(0, 100 - 8 * Math.floor((nowAbs(g) - r.at) / 1440));
function spreadRumors(g: Save, w: WorldDef): string[] {
    if (!systemOn(w, 'rumors')) return [];
    const st = L(g);
    const yesterday = nowAbs(g) - 1440;
    for (const f of facts(g).filter(f => f.at >= yesterday && f.who.length && GOSSIP.includes(f.kind ?? '') && !st.rumors.some(r => r.id === f.id))) {   // somebody has to have seen it
        st.rumors.push({ id: f.id, text: factText(f, personaName()), at: f.at, knownBy: [...f.who], heat: 100, hops: Object.fromEntries(f.who.map(a => [a, 0])) });
    }
    seedWorldRumors(g, w);
    const people = residents(g);
    const spots = (r: Resident) => new Set([...r.leisure, w.occupations.find(o => o.id === r.occupation)?.place ?? '', whereNow(g, w, r)].filter(Boolean));
    for (const rumor of st.rumors) {
        const heat = heatOf(g, rumor);
        const tension = systemOn(w, 'living') ? regionState(g, w, regionOf(g, w, rumor.knownBy.find(a => g.cast[a]) ? `home:${rumor.knownBy.find(a => g.cast[a])}` : g.player.loc)).tension : 0;
        const chance = Math.min(0.9, 0.4 * Math.min(1.2, heat / 100 + 0.2) * (1 + tension / 100));
        rumor.hops ??= {};
        for (const knower of people.filter(p => rumor.knownBy.includes(p.avatar))) {
            const ks = spots(knower);
            for (const other of people) {
                if (rumor.knownBy.includes(other.avatar)) continue;
                if ([...spots(other)].some(s => ks.has(s)) && rnd(g, `${rumor.id}|${other.avatar}`) < chance) {
                    rumor.knownBy.push(other.avatar);
                    rumor.hops[other.avatar] = (rumor.hops[knower.avatar] ?? 1) + 1;
                }
            }
        }
        rumor.heat = Math.max(0, heat - 8);
    }
    // at most 40 going around: the hottest stay
    const live = st.rumors.filter(r => nowAbs(g) - r.at < 14 * 1440 && heatOf(g, r) > 0);
    const keep = new Set([...live].sort((a, b) => heatOf(g, b) - heatOf(g, a) || b.at - a.at).slice(0, 40));
    st.rumors = live.filter(r => keep.has(r));
    return [];
}
// The world's lore marked as a rumor starts going around when its conditions hold (two people start it, in its
// region if it has one); once it has died out it can start again another day.
function seedWorldRumors(g: Save, w: WorldDef) {
    const st = L(g);
    (w.lore as WhenLore[]).forEach((e, i) => {
        if (!e.rumor || !e.content) return;
        const id = `lore:${i}`;
        if (st.rumors.some(r => r.id === id)) return;
        const c = e.when ?? {};
        if (!dayHolds(g, w, { ...c, chance: c.chance ?? 0.25 }, `rumor|${i}`, c.place ?? g.player.loc)) return;
        const pool = residents(g).filter(r => !c.region || regionOf(g, w, `home:${r.avatar}`) === c.region || regionOf(g, w, w.occupations.find(o => o.id === r.occupation)?.place ?? '') === c.region);
        if (!pool.length) return;
        const first = [...pool].sort((a, b) => rnd(g, `${id}|${a.avatar}`) - rnd(g, `${id}|${b.avatar}`)).slice(0, 2);
        st.rumors.push({ id, text: e.content, at: nowAbs(g), knownBy: first.map(r => r.avatar), heat: 100, hops: Object.fromEntries(first.map(r => [r.avatar, 1])), world: true });
    });
}
// How a rumor sounds after passing through some mouths.
const garble = (hops: number) => (hops >= 4 ? ' (heard it fourth- or fifth-hand: details may be wrong or exaggerated)' : hops >= 2 ? ' (secondhand)' : '');
export function rumorLines(g: Save, present: Resident[]) {
    const out: string[] = [];
    for (const r of present) {
        const heard = L(g).rumors.filter(x => x.knownBy.includes(r.avatar) && !facts(g).find(f => f.id === x.id)?.who.includes(r.avatar)).slice(-2);
        if (heard.length) out.push(`${r.name} has heard around town: ${heard.map(h => `${h.text}${garble(h.hops?.[r.avatar] ?? 1)}`).join(' ')}`);
    }
    return out;
}
// You overhear what the people around you talk about (in public places, now and then).
export function overhear(g: Save, w: WorldDef, present: Resident[]): Rumor[] {
    if (!systemOn(w, 'rumors') || g.player.loc.startsWith('home:')) return [];
    const got: Rumor[] = [];
    for (const rumor of L(g).rumors) {
        if (rumor.knownBy.includes(YOU)) continue;
        const teller = present.find(r => rumor.knownBy.includes(r.avatar));
        if (!teller || rnd(g, `hear|${rumor.id}|${g.minutes}`) > 0.3) continue;
        rumor.knownBy.push(YOU); rumor.hops ??= {}; rumor.hops[YOU] = (rumor.hops[teller.avatar] ?? 1) + 1; rumor.heard = nowAbs(g);
        got.push(rumor);
        break;   // one at a time
    }
    return got;
}
// What you have heard (newest first), for the Journal.
export const heardRumors = (g: Save) => L(g).rumors.filter(r => r.knownBy.includes(YOU)).sort((a, b) => (b.heard ?? b.at) - (a.heard ?? a.at));
export const rumorSource = (r: Rumor) => garble(r.hops?.[YOU] ?? 1).replace(/^ \(|\)$/g, '');

onDay.push((g, w) => [...lifeGoesOn(g, w), ...spreadRumors(g, w)]);

/* ---------- families and ties between people (like The Sims: who is whose mother, and how they get along) ---------- */

export type TieType = 'parent' | 'child' | 'sibling' | 'spouse' | 'partner' | 'dating' | 'cousin' | 'roommate' | 'friend' | 'bestfriend' | 'ally' | 'colleague' | 'rival' | 'enemy' | 'ex' | 'mentor' | 'apprentice';
export type TieTone = 'close' | 'good' | 'neutral' | 'tense' | 'hostile';
export interface Tie { a: string; b: string; type: TieType; tone: TieTone }   // `a` is the <type> of `b`; '__you' is the player
export const TIE_TYPES: [TieType, string][] = [['parent', 'parent of'], ['child', 'child of'], ['sibling', 'sibling of'], ['spouse', 'married to'], ['partner', 'partner of'], ['cousin', 'cousin of'], ['roommate', 'roommate of'], ['friend', 'friend of'], ['bestfriend', 'best friend of'], ['ally', 'ally of'], ['colleague', 'colleague of'], ['dating', 'dating'], ['rival', 'rival of'], ['enemy', 'enemy of'], ['ex', 'ex of'], ['mentor', 'mentor of'], ['apprentice', 'apprentice of']];
export const TIE_TONES: [TieTone, string][] = [['close', 'Close'], ['good', 'Good'], ['neutral', 'Neutral'], ['tense', 'Tense'], ['hostile', 'Hostile']];
export const ties = (g: Save): Tie[] => ((L(g) as any).ties ??= []);
export const tiesOf = (g: Save, avatar: string) => ties(g).filter(t => t.a === avatar || t.b === avatar);
export function setTie(g: Save, t: Tie) {
    const list = ties(g); const i = list.findIndex(x => (x.a === t.a && x.b === t.b) || (x.a === t.b && x.b === t.a));
    if (i >= 0) list.splice(i, 1, t); else list.push(t);
}
export function removeTie(g: Save, a: string, b: string) { const list = ties(g); const i = list.findIndex(x => (x.a === a && x.b === b) || (x.a === b && x.b === a)); if (i >= 0) list.splice(i, 1); }
// Living together: the second person moves into the first one's home (the player's home for '__you').
export function liveTogether(g: Save, host: string, guest: string) {
    const r = g.cast[guest]; if (!r) return;
    r.home = host === '__you' ? { ...g.player.home } : { ...g.cast[host].home };
    (r as any).homeWith = host;
    normalizeHomes(g);
}
// Households: everyone at the same address shares one home. With the player there, it is the player's home;
// otherwise the first person who lived there is the "head" whose home the others share (`homeWith`).
export { homeKey, normalizeHomes } from './homes.js';
import { homeKey, normalizeHomes } from './homes.js';
const nameOfId = (g: Save, id: string) => (id === '__you' ? '{{user}}' : g.cast[id]?.name ?? id);
const INVERSE: Partial<Record<TieType, string>> = { parent: 'child of', child: 'parent of' };
// For the AI: the ties of the people in this scene (only those, like the memories).
export function tiesLine(g: Save, present: Resident[]) {
    const here = new Set(present.map(r => r.avatar));
    const list = ties(g).filter(t => here.has(t.a) || here.has(t.b));
    if (!list.length) return '';
    return `Family and ties: ${list.map(t => `${nameOfId(g, t.a)} is ${TIE_TYPES.find(x => x[0] === t.type)?.[1] ?? t.type} ${nameOfId(g, t.b)}${t.tone !== 'neutral' ? ` (${t.tone} relationship)` : ''}`).join('; ')}.`;
}
void INVERSE;
// A tie to {{user}} set at the start also sets where you stand with them (friends start close, enemies far apart).
export function startingStand(type: TieType): { bond: number; approval: number } {
    const m: Partial<Record<TieType, [number, number]>> = { bestfriend: [70, 30], friend: [45, 15], ally: [40, 20], colleague: [25, 5], dating: [70, 25], partner: [70, 25], spouse: [80, 30], parent: [60, 20], child: [60, 20], sibling: [55, 15], cousin: [35, 10], roommate: [35, 5], rival: [15, -20], enemy: [5, -50], ex: [20, -10], mentor: [55, 25], apprentice: [55, 25] };
    const [bond, approval] = m[type] ?? [20, 0];
    return { bond, approval };
}
