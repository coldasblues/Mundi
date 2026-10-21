// Love between the characters, and you as the matchmaker. Each adult may carry a secret crush on someone else (feelings
// go one way: A can like B while B barely notices A). You find out by asking (once you are friends), and you can
// introduce two people: the engine decides how it goes (does B like A back? is B seeing someone? how charming are
// you, and does B trust you?), the AI plays the meeting. A pair who hit it off may start dating over the next days,
// thanking you for it, or, on a good night out, leave together.
// Never: anyone underage, or two people of the same family.
import { nowAbs, saveGame, type Save, type Resident } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { residents, peopleHooks } from './people.js';
import { couples, ties, approve } from './living.js';
import { isMinor } from './family.js';
import { romOf } from './romance.js';
import { bondOf } from './social.js';
import { traitsOf } from './work.js';
import { note, placeName } from './facts.js';
import { feel } from './life.js';
import { placeOf } from './places.js';
import { onDay } from './hooks.js';

export interface Feeling { romance: number; known: boolean }
export interface Spark { a: string; b: string; day: number; how: Result }   // an introduction (a < b by key)
export interface Away { loc: string; until: number }
export interface MatchState { seeded: boolean; feel: Record<string, Feeling>; intros: Spark[]; away: Record<string, Away> }
const M = (g: Save): MatchState => { const x = ((g as any).match ??= {}); x.feel ??= {}; x.intros ??= []; x.away ??= {}; x.seeded ??= false; return x; };
const edge = (a: string, b: string) => `${a}>${b}`;
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

/* ---------- who can be matched ---------- */

const family = (g: Save, a: string, b: string) => ties(g).some(t => ((t.a === a && t.b === b) || (t.a === b && t.b === a)) && (t.type === 'parent' || t.type === 'child' || t.type === 'sibling' || t.type === 'cousin'));
export const datingOf = (g: Save, avatar: string) => couples(g).find(p => p.includes(avatar))?.find(x => x !== avatar) ?? '';
const withPlayer = (g: Save, avatar: string) => romOf(g, avatar).status !== 'none';
/** Can these two be a couple at all? '' when they can, otherwise why not. */
export function cannotMatch(g: Save, a: string, b: string): string {
    if (a === b || !g.cast[a] || !g.cast[b]) return 'Pick two different people.';
    if (isMinor(g, a) || isMinor(g, b)) return 'Not with someone underage.';
    if (family(g, a, b)) return 'They are family.';
    const d = datingOf(g, a);
    if (d === b) return 'They are already together.';
    return '';
}

/* ---------- the feelings ---------- */

/**
 * Once per game: each adult gets a feeling toward a few others. About half carry a real crush (40–80) on someone;
 * many others feel a little interest (10–35). It is fixed by the game (the same save always has the same sparks).
 */
function seed(g: Save) {
    const st = M(g); if (st.seeded) return;
    st.seeded = true;
    const people = residents(g).filter(r => !isMinor(g, r.avatar));
    for (const r of people) {
        const others = people.filter(o => o !== r && !family(g, r.avatar, o.avatar));
        if (!others.length) continue;
        // people with something in common (the same leisure spots) are likelier
        const score = (o: Resident) => hash(`${g.world}|${r.avatar}|${o.avatar}|spark`) + (o.leisure.some(l => r.leisure.includes(l)) ? 0.25 : 0);
        const ranked = [...others].sort((x, y) => score(y) - score(x));
        const p = hash(`${g.world}|${r.avatar}|crush`);
        if (p < 0.5 && !withPlayer(g, r.avatar)) st.feel[edge(r.avatar, ranked[0].avatar)] = { romance: 40 + Math.round(hash(`${r.avatar}|v`) * 40), known: false };
        for (const o of ranked.slice(p < 0.5 ? 1 : 0, 3)) if (hash(`${r.avatar}|${o.avatar}|i`) < 0.5) st.feel[edge(r.avatar, o.avatar)] ??= { romance: 10 + Math.round(hash(`${o.avatar}|${r.avatar}|w`) * 25), known: false };
    }
    // the couples the world already has like each other
    for (const [a, b] of couples(g)) { st.feel[edge(a, b)] = { romance: 75, known: true }; st.feel[edge(b, a)] = { romance: 75, known: true }; }
}
export function feeling(g: Save, a: string, b: string): Feeling { seed(g); return M(g).feel[edge(a, b)] ?? { romance: 0, known: false }; }
function setFeeling(g: Save, a: string, b: string, romance: number, known?: boolean) {
    seed(g);
    const f = M(g).feel[edge(a, b)] ??= { romance: 0, known: false };
    f.romance = Math.max(0, Math.min(100, Math.round(romance)));
    if (known !== undefined) f.known = known || f.known;
}
/** Who they like most (a crush is 40 or more). */
export function crushOf(g: Save, a: string): { avatar: string; romance: number; known: boolean } | null {
    seed(g);
    let best: { avatar: string; romance: number; known: boolean } | null = null;
    for (const [k, f] of Object.entries(M(g).feel)) {
        const [x, y] = k.split('>');
        if (x !== a || !g.cast[y] || f.romance < 40 || family(g, a, y) || isMinor(g, y)) continue;
        if (!best || f.romance > best.romance) best = { avatar: y, romance: f.romance, known: f.known };
    }
    return best;
}
/** What you know about someone's love life (for their card). */
export function knownLove(g: Save, a: string): string {
    const d = datingOf(g, a);
    if (d) return `Seeing ${g.cast[d]?.name ?? 'someone'}`;
    const c = crushOf(g, a);
    if (c?.known) return `Has a crush on ${g.cast[c.avatar]?.name ?? 'someone'}`;
    return '';
}

/* ---------- asking about it ---------- */

export const CONFIDE_BOND = 30;
/** "Who do you like?": they tell you, if they know you well enough. The directive is for the AI. */
export function askLove(g: Save, a: string): { ok: boolean; text: string; directive: string; line: string } {
    const r = g.cast[a];
    const line = `*asks ${r?.name.split(' ')[0] ?? 'them'} about their love life* "So… is there anyone you like?"`;
    if (!r) return { ok: false, text: '', directive: '', line };
    if (isMinor(g, a)) return { ok: false, text: 'Not a question for a kid.', directive: '', line };
    if (bondOf(g, a) < CONFIDE_BOND) return { ok: false, text: `${r.name} doesn't know you well enough to tell you that (${bondOf(g, a)}/${CONFIDE_BOND}).`, directive: `[${r.name} doesn't know {{user}} well enough to share their love life: they dodge the question, politely.]`, line };
    const d = datingOf(g, a);
    if (d) return { ok: true, text: `${r.name} is seeing ${g.cast[d].name}.`, directive: `[${r.name} tells {{user}} they are seeing ${g.cast[d].name}.]`, line };
    const c = crushOf(g, a);
    if (!c) return { ok: true, text: `${r.name} isn't into anyone right now.`, directive: `[${r.name} isn't into anyone right now, and says so (maybe a little wistfully).]`, line };
    setFeeling(g, a, c.avatar, c.romance, true);
    note(g, '{0} told {u} they have a crush on {1}.', [r.name, g.cast[c.avatar].name], [a], g.player.loc, 'love');
    saveGame();
    const b = g.cast[c.avatar].name;
    return { ok: true, text: `${r.name} has a crush on ${b}.`, directive: `[${r.name} confides in {{user}}: they have a crush on ${b}${c.romance >= 65 ? ', a big one' : ''}. ${b} doesn't know. ${r.name} may ask {{user}} to keep it secret, or to help.]`, line };
}

/* ---------- introducing two people ---------- */

export type Result = 'spark' | 'polite' | 'awkward';
export interface Intro { result: Result; together: boolean; text: string; directive: string; line: string; chance: number }
/** The chance B is into A, as the introduction stands (for the card, and for the roll). */
export function introChance(g: Save, w: WorldDef, a: string, b: string): number {
    const toA = feeling(g, b, a).romance;
    let p = 0.12 + (toA / 100) * 0.7;
    if (feeling(g, a, b).romance >= 40) p += 0.05;                 // A is keen: it shows
    const mine = traitsOf(g);
    p += ['Charming', 'Outgoing'].filter(t => mine.includes(t)).length * 0.06;
    if (bondOf(g, b) >= 55) p += 0.08;                              // B trusts your judgment
    if (datingOf(g, b) || withPlayer(g, b)) p -= 0.35;               // B is seeing someone
    const tags = placeOf(g, w, g.player.loc)?.tags ?? [];
    const h = Math.floor(g.minutes / 60);
    if ((tags.includes('leisure') || tags.includes('food')) && (h >= 19 || h < 2)) p += 0.05;   // a good night out
    return Math.max(0.03, Math.min(0.92, p));
}
export function introduce(g: Save, w: WorldDef, a: string, b: string, rnd = Math.random): Intro | string {
    const why = cannotMatch(g, a, b); if (why) return why;
    const A = g.cast[a], B = g.cast[b];
    const chance = introChance(g, w, a, b);
    const r = rnd();
    const result: Result = r < chance ? 'spark' : r < chance + (1 - chance) * 0.75 ? 'polite' : 'awkward';
    const st = M(g);
    const ab = feeling(g, a, b).romance, ba = feeling(g, b, a).romance;
    const h = Math.floor(g.minutes / 60);
    const tags = placeOf(g, w, g.player.loc)?.tags ?? [];
    let together = false;
    if (result === 'spark') {
        setFeeling(g, a, b, Math.max(ab, 30) + 20, true); setFeeling(g, b, a, Math.max(ba, 30) + 20, true);
        approve(g, a, 10); approve(g, b, 4);
        // a great match on a night out: they leave together
        together = feeling(g, a, b).romance >= 60 && feeling(g, b, a).romance >= 60 && (h >= 20 || h < 3) && (tags.includes('leisure') || tags.includes('food')) && rnd() < 0.6;

    } else if (result === 'polite') {
        setFeeling(g, b, a, ba + 3);
        feel(g, a, 'a little let down: you introduced them to someone who was not interested', 1);
    } else {
        setFeeling(g, b, a, ba - 10);
        feel(g, a, 'embarrassed: the introduction you set up went badly', 2);
        approve(g, a, -6);
    }
    st.intros = [...st.intros.filter(x => pairKey(x.a, x.b) !== pairKey(a, b)), { a: a < b ? a : b, b: a < b ? b : a, day: g.day, how: result }].slice(-40);
    const at = placeName(g, w, g.player.loc);
    note(g, result === 'spark' ? (together ? '{u} introduced {0} to {1}, and they left {2} together.' : '{u} introduced {0} to {1}: they hit it off.') : result === 'polite' ? '{u} introduced {0} to {1}; {1} was polite, not interested.' : '{u} introduced {0} to {1}, and it was awkward.', [A.name, B.name, at], [a, b], g.player.loc, 'love');
    saveGame();
    const verdict = { spark: 'THEY HIT IT OFF', polite: 'POLITE, NOT INTERESTED', awkward: 'AWKWARD' }[result];
    const text = result === 'spark' ? (together ? `${A.name} and ${B.name} hit it off, and leave together.` : `${A.name} and ${B.name} hit it off.`) : result === 'polite' ? `${B.name} is friendly, but not interested.` : `It's awkward. ${A.name} won't thank you for this one.`;
    const directive = `[{{user}} introduces ${A.name} to ${B.name}${ab >= 40 ? ` (${A.name} has a crush on ${B.name})` : ''}. The game decided: ${verdict}. ` + (result === 'spark'
        ? `${B.name} is interested too: they click, talk, flirt${together ? ', and before long decide to leave together, for ' + A.name.split(' ')[0] + '\'s place' : ', and swap numbers'}. {{user}} can step back and watch.`
        : result === 'polite' ? `${B.name} is friendly with ${A.name} but plainly not interested in more; ${A.name} takes it with a brave face.`
            : `${B.name} is put off (or there is history between them); it gets uncomfortable, and ${A.name} is embarrassed.`) + ` Play ${A.name} and ${B.name} meeting, both of them speaking.${together ? ` In the state block: changes: ${A.name} = left; ${B.name} = left.` : ''}]`;
    return { result, together, text, directive, line: `*introduces ${A.name.split(' ')[0]} to ${B.name.split(' ')[0]}* "${A.name.split(' ')[0]}, have you met ${B.name.split(' ')[0]}? You two should talk."`, chance };
}

/** They leave together (after the reply that tells it): the night at one of their homes, until the morning. */
export function leaveTogether(g: Save, a: string, b: string) {
    const A = g.cast[a]; if (!A || !g.cast[b]) return;
    const h = Math.floor(g.minutes / 60);
    const until = (g.day + (h < 3 ? 0 : 1)) * 1440 + 9 * 60;
    const home = (A as any).homeWith === '__you' ? 'home:player' : (A as any).homeWith ? `home:${(A as any).homeWith}` : `home:${A.avatar}`;
    const st = M(g);
    st.away[a] = { loc: home, until }; st.away[b] = { loc: home, until };
    saveGame();
}

/* ---------- days go by ---------- */

function daily(g: Save): string[] {
    const st = M(g); const out: string[] = [];
    if (!st.seeded) return out;
    for (const s of st.intros) {
        if (s.how !== 'spark' || g.day - s.day > 10 || couples(g).some(p => p.includes(s.a) || p.includes(s.b))) continue;
        if (!g.cast[s.a] || !g.cast[s.b] || cannotMatch(g, s.a, s.b)) continue;
        const both = Math.min(feeling(g, s.a, s.b).romance, feeling(g, s.b, s.a).romance);
        if (both >= 55 && hash(`${g.day}|${s.a}|${s.b}|date`) < 0.4) {
            (((g as any).living ??= {}).pairs ??= []).push([s.a, s.b]);
            note(g, '{0} and {1} started dating, thanks to {u}.', [g.cast[s.a].name, g.cast[s.b].name], [s.a, s.b], g.player.loc, 'love');
            approve(g, s.a, 12); approve(g, s.b, 12);
            out.push(`${g.cast[s.a].name} and ${g.cast[s.b].name} are dating now, thanks to you.`);
        } else if (both < 55) { setFeeling(g, s.a, s.b, feeling(g, s.a, s.b).romance - 1); setFeeling(g, s.b, s.a, feeling(g, s.b, s.a).romance - 1); }
    }
    for (const k of Object.keys(st.away)) if (st.away[k].until <= nowAbs(g)) delete st.away[k];
    return out;
}

/* ---------- for the prompt ---------- */

/** Feelings between the people here: crushes (the secret ones too, so the story can play them), sparks, couples. */
export function loveLines(g: Save, present: Resident[]): string[] {
    seed(g);
    const here = new Set(present.map(r => r.avatar));
    const out: string[] = [];
    for (const r of present) {
        if (isMinor(g, r.avatar) || datingOf(g, r.avatar)) continue;
        const c = crushOf(g, r.avatar);
        if (!c) continue;
        const b = g.cast[c.avatar];
        const back = feeling(g, c.avatar, r.avatar).romance;
        out.push(`${r.name} has a crush on ${b.name}${here.has(b.avatar) ? ' (here now)' : ''}${c.known ? '' : `, a secret: ${b.name} doesn't know`}${here.has(b.avatar) ? (back >= 40 ? `; ${b.name} is drawn to ${r.name} too` : back >= 15 ? `; ${b.name} is a little curious about ${r.name}` : `; ${b.name} hasn't really noticed ${r.name}`) : ''}.`);
    }
    for (const s of M(g).intros) if (s.how === 'spark' && (here.has(s.a) || here.has(s.b)) && g.day - s.day <= 7 && g.cast[s.a] && g.cast[s.b] && !couples(g).some(p => p.includes(s.a) && p.includes(s.b))) out.push(`${g.cast[s.a].name} and ${g.cast[s.b].name} hit it off when {{user}} introduced them (day ${s.day}); there is something between them.`);
    return out.slice(0, 6);
}

/* ---------- hooked in at start ---------- */

let wired = false;
export function initMatch() {
    if (wired) return; wired = true;
    const prev = peopleHooks.at;
    // a pair who left together spend the night at one of their homes
    peopleHooks.at = (g: Save, avatar: string) => prev(g, avatar) || (((g as any).match?.away?.[avatar] && (g as any).match.away[avatar].until > nowAbs(g)) ? (g as any).match.away[avatar].loc : '');
    onDay.push((g) => daily(g));
}
