// The roster: everyone the story has touched (the world's cast and the people it brought in), what became of them
// (around, left, injured, captured, missing, dead), where you met them and saw them last, and a short summary of
// what happened between you. It lives in the save, so every save and branch has its own.
// What the replies of the current visit say ("changes:" in the state block) counts at once but is only written into
// the roster when you leave: swiping or editing a reply before that changes nothing for good.
import { game, settings, saveGame, TUT } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { chat, personaName, quiet } from '../st/bridge.js';
import { visitLines, psOn } from './pstate-live.js';
import { visitStart } from './visits.js';
import { placeName, note } from './facts.js';
/** Other systems plug in here (the hostile actions engine: someone you hold captive is with you, not "captured"). */
export const rosterHooks = { isCaptive: (_key) => false };
export const STATUS_WORD = { around: 'around', left: 'left', injured: 'injured', captured: 'captured', missing: 'missing', dead: 'dead' };
export const roster = (g) => (g.roster ??= {});
export function rosterPrefs() { const s = settings(); s.roster ??= {}; s.roster.summaries ??= true; return s.roster; }
/** Dead is for good; the rest move as the story says. */
export function applyChange(st, c) {
    if (st === 'dead')
        return 'dead';
    switch (c) {
        case 'dead': return 'dead';
        case 'captured': return 'captured';
        case 'missing': return 'missing';
        case 'injured': return st === 'captured' || st === 'missing' ? st : 'injured';
        case 'left': return st === 'around' || st === 'injured' ? 'left' : st;
        case 'freed': return st === 'captured' ? 'around' : st;
        case 'returned': return st === 'missing' || st === 'left' || st === 'captured' ? 'around' : st;
        case 'recovered': return st === 'injured' ? 'around' : st;
        case 'arrived': return st === 'left' || st === 'missing' ? 'around' : st;
    }
}
export const gone = (st) => st === 'dead' || st === 'captured' || st === 'missing';
/* ---------- names → people ---------- */
const norm = (n) => String(n ?? '').toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/\s+/g, ' ').trim();
/** The roster key for a name: a cast member (full or first name), someone already known, or someone new. */
export function keyFor(g, name) {
    const n = norm(name);
    const first = n.split(' ')[0];
    for (const r of Object.values(g.cast)) {
        const rn = norm(r.name);
        if (rn === n || rn.split(' ')[0] === n || (first.length > 2 && rn === first))
            return { key: `cast:${r.avatar}`, kind: 'cast', avatar: r.avatar, name: r.name };
    }
    const ro = roster(g);
    // walk-ons often have a role for a name ("police officer"): one who died in an earlier visit is not the next one
    // (one who died in this very visit is still the one meant: "the clerk" lying there)
    const vs = visitStart(g);
    const alive = (p) => p.status !== 'dead' || p.diedVisit === vs;
    const named = (p) => norm(p.name) === n || (norm(p.name).split(' ')[0] === n && n.length > 2);
    const hits = Object.values(ro).filter(p => p.kind === 'walkon' && alive(p) && named(p));
    const hit = hits.find(p => p.status === 'dead') ?? hits[0];
    if (hit)
        return { key: hit.key, kind: 'walkon', name: hit.name };
    let key = `w:${n}`, k = 1;
    while (ro[key]?.status === 'dead')
        key = `w:${n}#${++k}`;
    return { key, kind: 'walkon', name: name.trim() };
}
let memo = { sig: '', list: [] };
function signature(g) {
    const list = chat();
    const last = list[list.length - 1];
    return `${visitStart(g)}|${list.length}|${last?.swipe_id ?? ''}|${String(last?.mes ?? '').length}|${JSON.stringify(last?.extra?.mundi_ps?.h ?? '')}${last?.extra?.mundi_ps?.src ?? ''}|${last?.extra?.mundi_outcome_dismissed ?? ''}`;
}
export function pendingChanges(g) {
    if (TUT.save || !psOn())
        return [];
    const sig = signature(g);
    if (memo.sig === sig)
        return memo.list;
    const out = [];
    for (const { line } of visitLines(g)) {
        if (line.kind !== 'ai' || line.dismissed || !line.rep?.changes)
            continue;
        for (const c of line.rep.changes)
            out.push({ ...keyFor(g, c.name), change: c.change });
    }
    memo = { sig, list: out };
    return out;
}
/** Someone's status now: the roster's, with what happened in this visit on top. */
export function statusOf(g, key) {
    let st = roster(g)[key]?.status ?? 'around';
    for (const p of pendingChanges(g))
        if (p.key === key)
            st = applyChange(st, p.change);
    return st;
}
/** A cast member who cannot be anywhere right now: dead, captured or missing (or who just left this scene). */
export function castGone(g, avatar, here = false) {
    if (rosterHooks.isCaptive(`cast:${avatar}`))
        return false; // your captive is with you
    const st = statusOf(g, `cast:${avatar}`);
    return gone(st) || (here && st === 'left' && pendingChanges(g).some(p => p.key === `cast:${avatar}` && p.change === 'left'));
}
/** A name from a "present" list that the roster says is not there (dead, gone, or left this scene). */
export function nameGone(g, name) {
    const k = keyFor(g, name);
    if (rosterHooks.isCaptive(k.key))
        return false;
    const st = statusOf(g, k.key);
    // someone who left in an earlier visit may well be back: only leaving in this one counts
    return gone(st) || (st === 'left' && pendingChanges(g).some(p => p.key === k.key && p.change === 'left'));
}
/* ---------- leaving a place: the visit is written into the roster ---------- */
const stamp = (g, w) => ({ day: g.day, min: g.minutes, place: placeName(g, w, g.player.loc) });
function entry(g, w, k) {
    const ro = roster(g);
    return (ro[k.key] ??= { key: k.key, name: k.name, kind: k.kind, avatar: k.avatar, status: 'around', first: stamp(g, w), last: stamp(g, w), summary: '', log: [] });
}
/**
 * Called as the visit ends (before its lines are hidden). Returns who was part of it and the visit's lines as text,
 * for the summaries.
 */
export function commitVisit(g, w, who, walkons) {
    if (TUT.save || !psOn())
        return { people: [], transcript: '' };
    const at = stamp(g, w);
    const touched = new Map();
    // people who were part of it
    for (const r of who) {
        const p = entry(g, w, keyFor(g, r.name));
        p.last = at;
        touched.set(p.key, p);
    }
    for (const n of walkons) {
        const p = entry(g, w, keyFor(g, n));
        p.last = at;
        touched.set(p.key, p);
    }
    // what happened to them
    for (const c of pendingChanges(g)) {
        const p = entry(g, w, c);
        const was = p.status;
        p.status = applyChange(p.status, c.change);
        p.log = [...p.log, { at, change: c.change }].slice(-12);
        touched.set(p.key, p);
        // a death is a fact the story remembers (the Journal, and what the people here know)
        if (p.status === 'dead' && was !== 'dead') {
            p.diedVisit = visitStart(g);
            note(g, '{0} died at {1}.', [p.name, at.place], p.avatar ? [p.avatar] : [], g.player.loc, 'event');
        }
    }
    // the cast go back to their routines once you leave (walk-ons who left stay "left")
    for (const p of touched.values())
        if (p.kind === 'cast' && p.status === 'left')
            p.status = 'around';
    memo = { sig: '', list: [] };
    const me = personaName();
    const list = chat().slice(visitStart(g));
    const transcript = list.filter((m) => !m.is_system || m.extra?.mundi_narrator).map((m) => `${m.is_user ? me : m.extra?.mundi_narrator ? 'Narrator' : m.name}: ${String(m.mes ?? '').replace(/<\s*state\s*>[\s\S]*$/i, '').replace(/\s+/g, ' ').trim().slice(0, 360)}`).filter(l => !/:\s*$/.test(l)).slice(-40).join('\n');
    return { people: [...touched.values()], transcript };
}
/**
 * Something the engine decided (a roll: the clerk is knocked out, killed): written into the roster at once, not when
 * you leave. The roll is final, the way getting away is; only loading a save takes it back.
 */
export function applyNow(g, w, name, change, why = '') {
    const k = keyFor(g, name);
    const p = entry(g, w, k);
    const was = p.status;
    const at = stamp(g, w);
    p.status = applyChange(p.status, change);
    p.last = at;
    p.log = [...p.log, { at, change }].slice(-12);
    if (p.status === 'dead' && was !== 'dead') {
        p.diedVisit = visitStart(g);
        note(g, why ? '{0} died at {1} ({2}).' : '{0} died at {1}.', [p.name, at.place, why], p.avatar ? [p.avatar] : [], g.player.loc, 'event');
    }
    memo = { sig: '', list: [] };
    return p;
}
/** One short AI call: everyone who was part of the visit gets their summary brought up to date. */
export async function summarize(g, w, people, transcript) {
    if (!rosterPrefs().summaries || !people.length || !transcript.trim())
        return 0;
    const me = personaName();
    const where = placeName(g, w, g.player.loc);
    const prompt = [
        `${me} was at ${where}. This is what happened there:`, '"""', transcript, '"""', '',
        `For each person below, write what ${me} knows about them now in 1 or 2 short sentences: who they are to ${me} and what happened between them, the latest first. Keep what still matters from the old notes. If someone died, say how. Answer with one line per person, exactly "Name: notes", nothing else.`, '',
        ...people.map(p => `${p.name} (${STATUS_WORD[p.status]}). Old notes: ${p.summary || 'none yet'}`),
    ].join('\n');
    const out = await quiet(prompt, 500, 'You keep short notes about the people in a story. You never invent events.');
    let n = 0;
    for (const raw of out.split('\n')) {
        const m = raw.replace(/^[\s*•-]+/, '').replace(/\*\*/g, '').match(/^([^:]{1,60}):\s*(.+)$/);
        if (!m)
            continue;
        const k = keyFor(g, m[1]);
        const p = people.find(x => x.key === k.key) ?? people.find(x => norm(x.name) === norm(m[1]));
        if (p) {
            p.summary = m[2].trim().slice(0, 400);
            n++;
        }
    }
    return n;
}
/** The end of a visit, all of it: commit now, summaries in the background (the next scene does not wait). */
export function endVisitRoster(g, w, who, walkons) {
    const { people, transcript } = commitVisit(g, w, who, walkons);
    saveGame();
    if (people.length && transcript) {
        void summarize(g, w, people, transcript).then(n => { if (n && game() === g)
            saveGame(); }).catch(e => console.warn('[Mundi] roster summaries', e));
    }
}
/* ---------- for the prompt, the screens and the save slots ---------- */
/** What the story should keep in mind about the people here, and who is gone for good. */
export function rosterLines(g, presentNames) {
    if (TUT.save || !psOn())
        return [];
    const ro = roster(g);
    const here = presentNames.map(n => ro[keyFor(g, n).key]).filter((p) => !!p && !!p.summary);
    // the dead: written in the roster, and the ones who died in this visit (written in when you leave)
    // with where and when: a walk-on's name is often a role ("police officer"), and the next one is someone else
    const died = (p) => { const d = [...p.log].reverse().find(l => l.change === 'dead')?.at; return d ? `${p.name} (died at ${d.place}, day ${d.day})` : p.name; };
    const byKey = new Map();
    for (const p of Object.values(ro))
        if (p.status === 'dead')
            byKey.set(p.key, died(p));
    for (const p of pendingChanges(g))
        if (p.change === 'dead' && !byKey.has(p.key))
            byKey.set(p.key, `${p.name} (died just now)`);
    // two officers who died at the same place on the same day read as "2 × police officer (…)"
    const counts = new Map();
    for (const t of byKey.values())
        counts.set(t, (counts.get(t) ?? 0) + 1);
    const dead = [...counts].map(([t, n]) => n > 1 ? `${n} × ${t}` : t);
    const hurt = presentNames.filter(n => statusOf(g, keyFor(g, n).key) === 'injured');
    return [
        here.length ? `What {{user}} and the people here have been through: ${here.map(p => `${p.name}: ${p.summary}`).join(' ')}` : '',
        hurt.length ? `Injured right now: ${hurt.join(', ')}.` : '',
        dead.length ? `Dead (gone for good: they never appear or speak again): ${dead.slice(-12).join(', ')}.` : '',
    ].filter(Boolean);
}
/** Everyone, for the People screen: the roster, plus cast members you met who never had a scene with a change. */
export function everyone(g, w) {
    const ro = roster(g);
    const list = Object.values(ro).map(p => ({ ...p, status: statusOf(g, p.key) }));
    // people with a change in this visit who are not written in yet
    for (const c of pendingChanges(g))
        if (!ro[c.key] && !list.some(p => p.key === c.key))
            list.push({ key: c.key, name: c.name, kind: c.kind, avatar: c.avatar, status: statusOf(g, c.key), first: stamp(g, w), last: stamp(g, w), summary: '', log: [] });
    for (const r of Object.values(g.cast))
        if (r.met && !list.some(p => p.key === `cast:${r.avatar}`))
            list.push({ key: `cast:${r.avatar}`, name: r.name, kind: 'cast', avatar: r.avatar, status: statusOf(g, `cast:${r.avatar}`), first: { day: 0, min: 0, place: '' }, last: { day: 0, min: 0, place: '' }, summary: '', log: [] });
    const order = { around: 0, injured: 1, left: 2, captured: 3, missing: 4, dead: 5 };
    return list.sort((a, b) => order[a.status] - order[b.status] || (b.last.day * 1440 + b.last.min) - (a.last.day * 1440 + a.last.min));
}
/** A save in one line: "Day 4 · Home · 6 people · Diaz dead". */
export function snapshotLine(g) {
    const w = getWorld(g.world);
    const people = w ? everyone(g, w) : [];
    const deadN = new Map();
    for (const p of people)
        if (p.status === 'dead')
            deadN.set(p.name, (deadN.get(p.name) ?? 0) + 1);
    const dead = [...deadN].map(([n, k]) => k > 1 ? `${k} × ${n}` : n);
    const gonep = people.filter(p => p.status === 'captured' || p.status === 'missing').map(p => `${p.name} ${p.status}`);
    const where = w ? placeName(g, w, g.player.loc) : '';
    return [`Day ${g.day}`, where.charAt(0).toUpperCase() + where.slice(1), people.length ? `${people.length} ${people.length === 1 ? 'person' : 'people'}` : '', ...dead.slice(0, 3).map(n => `${n} dead`), ...gonep.slice(0, 2)].filter(Boolean).join(' · ');
}
