// "Set up from the lore": the AI reads the game's lorebooks and its characters' cards and proposes the settings the
// rough-stuff and people systems use: what each person is, who is the law, the groups (with members and a base), the
// world's own laws, whether there is police at all, and what is not a person. Nothing is applied until you review it.
import { game, saveGame } from '../core/store.js';
import { charOf, loadLore, chatLore } from '../st/bridge.js';
import { askPart, reading, startReading, endReading, titlesOf } from './reading.js';
import { hs, resolvePlace, actsOf } from './hostile.js';
import { stemWord } from './judge.js';
const clean = (t) => String(t ?? '').replace(/\r/g, '').trim();
const CHUNK = 10000;
const entryText = (e) => (clean(e.content) ? `### ${clean(e.comment) || (e.key ?? []).join(', ')}\n${clean(e.content)}` : '');
function chunks(blocks) {
    const out = [];
    let cur = '';
    for (const b of blocks.filter(Boolean)) {
        if (cur && cur.length + b.length > CHUNK) {
            out.push(cur);
            cur = '';
        }
        if (b.length > CHUNK) {
            for (let i = 0; i < b.length; i += CHUNK)
                out.push(b.slice(i, i + CHUNK));
            continue;
        }
        cur += (cur ? '\n\n' : '') + b;
    }
    if (cur)
        out.push(cur);
    return out;
}
/** The lorebooks of this game: the world's, this save's, and the ones linked to its characters. */
async function lore(g, w) {
    const names = new Set([...(w.lorebooks ?? []), chatLore()].filter(Boolean));
    for (const r of Object.values(g.cast)) {
        const lw = clean(charOf(r.avatar)?.data?.extensions?.world);
        if (lw)
            names.add(lw);
    }
    const blocks = [];
    for (const n of names) {
        try {
            blocks.push(...Object.values((await loadLore(n)).entries ?? {}).filter((e) => !e.disable).map(entryText));
        }
        catch { /* gone */ }
    }
    for (const r of Object.values(g.cast))
        for (const e of charOf(r.avatar)?.data?.character_book?.entries ?? [])
            blocks.push(entryText(e));
    return chunks([...new Set(blocks)]);
}
function jsonLines(out) {
    const list = [];
    for (const raw of out.split('\n')) {
        const t = raw.trim().replace(/^[-*\d.)\s]+(?=\{)/, '').replace(/,\s*$/, '');
        if (!t.startsWith('{'))
            continue;
        try {
            list.push(JSON.parse(t));
        }
        catch { /* broken line */ }
    }
    return list;
}
/**
 * Short names for kinds of people, from what a model writes: "K4 mouse kemonomimi (V-protein carriers), especially
 * R-Series" → ["k4 mouse kemonomimi", "r-series"]. Laws match people by these words.
 */
export function shortKinds(v) {
    const out = [];
    for (const raw of strs(v)) {
        const t = raw.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/["“”']/g, '').replace(/\b(especially|primarily|mainly|mostly|particularly|chiefly)\b/g, ' ');
        // each listed item, cut where a description starts ("… classified as pests and …"), then split on and/or
        for (const item of t.split(/[,;/]/))
            for (let part of item.split(/\b(?:classified|that|who|which|whom|including|such as|found|in|on|under|with|without|from|known|considered|deemed|designated|subject|when|if|whose)\b/)[0].split(/\band\b|\bor\b/)) {
                part = part.replace(/^\s*(the|a|an|all|any|some)\s+/, '').replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();
                const w = part.split(' ').filter(Boolean).slice(0, 3).join(' ');
                if (w && !/^(any(one|body)?|everyone|nobody)$/.test(w) && !/^\d/.test(w) && !out.includes(w))
                    out.push(w);
            }
    }
    return out.slice(0, 6);
}
/** A group's name as words to compare ("Underground Railroad networks" is "Underground Railroad"). */
const FILLER = new Set(['the', 'network', 'group', 'movement', 'organization', 'organisation', 'program', 'programme', 'federal', 'national', 'joint', 'official', 'of']);
const groupWords = (n) => n.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map(stemWord);
export function sameGroup(a, b) {
    const A = new Set(groupWords(a)), B = new Set(groupWords(b));
    const [small, big] = A.size <= B.size ? [A, B] : [B, A];
    if (!small.size || ![...small].every(w => big.has(w)))
        return false;
    return [...big].filter(w => !small.has(w)).every(w => FILLER.has(w));
}
const groupName = (n) => clean(n).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
const strs = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map(x => String(x).trim()).filter(Boolean);
const LORE_SYS = 'You list the factions and laws of a role-play world as JSON lines. You never invent anything.';
const CAST_SYS = 'You classify the characters of a role-play world as JSON lines. You never invent anything.';
const lorePrompt = (actIds, label) => (p) => [
    `Below is ${label} of the lore of a role-play world.`,
    'List what it says about these, one JSON object per line, nothing else:',
    '{"type": "group", "name": "", "base": "where they are based, or empty"}  (organized factions people in a story could belong to: agencies, companies, gangs, families, movements; the main ones only, each once)',
    `{"type": "law", "name": "", "about": ["the kind of people it is about, in one to three words each: mouse, rodent kemonomimi, outlaw"], "allows": [${actIds.map(a => `"${a}"`).join(', ')}] (only the acts it makes lawful), "who": ["who may: empty for anyone, or law, or a role"], "counts": "legal or minor", "handTo": "who they are handed over to, or empty", "reward": 0, "objectors": ["who disapproves"], "note": "one sentence"}  (laws or rules of this world that make some acts against some kind of people lawful, such as a bounty or a control order)`,
    '{"type": "police", "exists": true, "name": "what the law enforcement is called"}  (or "exists": false when the world has no police or law enforcement at all)',
    '{"type": "notperson", "word": ""}  (only mindless creatures that nobody in the story treats as a person, such as zombies or feral beasts; never a kind of people, even one the law calls property, pests or vermin)',
    'Use only what the text says. If it says nothing about these, answer NONE.',
    '"""', p, '"""',
].join('\n');
const castPrompt = (groups) => (p) => [
    'These are characters of a role-play world.',
    groups.length ? `The world's groups: ${groups.join('; ')}.` : '',
    'For each character, write one JSON object per line, nothing else:',
    '{"name": "", "kind": "what they are, in a few words (human, mouse kemonomimi, vampire…)", "law": false (true if they are police, a guard or other law enforcement), "group": "one of the groups above, or empty"}',
    'Use only what the cards say.',
    '"""', p, '"""',
].filter(Boolean).join('\n');
const cardsText = (batch) => batch.map(r => { const c = charOf(r.avatar); return `## ${r.name}\n${clean(c?.description).slice(0, 1400)}${clean(c?.personality) ? `\nPersonality: ${clean(c?.personality).slice(0, 300)}` : ''}`; }).join('\n\n');
function takeLore(g, w, plan, actIds, outs) {
    for (const o of outs.flatMap(jsonLines)) {
        if (o.type === 'group' && groupName(o.name)) {
            const have = plan.groups.find(x => sameGroup(x.name, String(o.name)));
            if (have) {
                if (!have.base && o.base) {
                    have.baseText = clean(o.base);
                    have.base = resolvePlace(g, w, String(o.base));
                }
            }
            else
                plan.groups.push({ name: groupName(o.name), baseText: clean(o.base), base: o.base ? resolvePlace(g, w, String(o.base)) : '', keep: true });
        }
        else if (o.type === 'law' && o.name && shortKinds(o.about).length && strs(o.allows).some(a => actIds.includes(a)) && !plan.laws.some(x => x.name.toLowerCase() === String(o.name).toLowerCase()))
            plan.laws.push({ id: `l${Date.now().toString(36)}${plan.laws.length}`, name: clean(o.name).slice(0, 60), about: shortKinds(o.about), allows: strs(o.allows).filter(a => actIds.includes(a)), who: shortKinds(o.who).slice(0, 4), counts: o.counts === 'minor' ? 'minor' : 'legal', ...(clean(o.handTo) ? { handTo: clean(o.handTo).slice(0, 60) } : {}), ...(Number(o.reward) > 0 ? { reward: Math.round(Number(o.reward)) } : {}), ...(shortKinds(o.objectors).length ? { objectors: shortKinds(o.objectors) } : {}), ...(clean(o.note) ? { note: clean(o.note).slice(0, 200) } : {}), keep: true });
        else if (o.type === 'police' && typeof o.exists === 'boolean' && !plan.police)
            plan.police = { exists: o.exists, name: clean(o.name).slice(0, 40), keep: true };
        else if (o.type === 'notperson' && o.word) {
            const wd = shortKinds(o.word)[0];
            if (wd && !plan.notPeople.some(x => x.word === wd))
                plan.notPeople.push({ word: wd, keep: true });
        }
    }
}
function takeCast(plan, batch, outs) {
    const groups = plan.groups.map(x => x.name);
    for (const o of outs.flatMap(jsonLines)) {
        const r = batch.find(x => x.name.toLowerCase() === String(o.name ?? '').toLowerCase()) ?? batch.find(x => x.name.toLowerCase().split(' ')[0] === String(o.name ?? '').toLowerCase().split(' ')[0]);
        if (!r || plan.people.some(p => p.avatar === r.avatar))
            continue;
        const grp = groups.find(x => x.toLowerCase() === String(o.group ?? '').toLowerCase()) ?? '';
        plan.people.push({ key: `cast:${r.avatar}`, avatar: r.avatar, name: r.name, kind: clean(o.kind).slice(0, 60), law: o.law === true, group: grp, keep: true });
    }
}
/**
 * The last word on what was found: nothing that is a kind of people stays among "not people" (a model may list a people
 * the law calls vermin), and a group is ticked only when someone here is in it or it has a base on the map; the rest are
 * offered unticked.
 */
function settle(g, plan, fromGroup = 0) {
    const peopleWords = new Set([...plan.people.map(p => p.kind), ...Object.values(hs(g).kinds), ...plan.laws.flatMap(l => l.about)]
        .flatMap(t => String(t).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)).filter(x => x.length >= 3).map(stemWord));
    plan.notPeople = plan.notPeople.filter(n => !n.word.split(/[\s-]+/).some(x => peopleWords.has(stemWord(x))));
    plan.groups.forEach((gr, i) => { if (i >= fromGroup)
        gr.keep = !!gr.base || plan.people.some(p => p.group === gr.name); });
}
const castPiece = (b) => ({ kind: 'cast', text: cardsText(b), titles: b.map(r => r.name), avatars: b.map(r => r.avatar) });
const note = (plan, kind, texts, avatars) => {
    for (const text of texts)
        plan.issues.skipped.push({ kind, text, titles: titlesOf(text), ...(avatars ? { avatars } : {}) });
    plan.issues.failed = plan.issues.skipped.length;
};
/** Reads it all with the AI. `progress(label)`. */
export async function readLore(g, w, progress = () => { }) {
    startReading();
    try {
        return await read(g, w, progress);
    }
    finally {
        endReading();
    }
}
async function read(g, w, progress) {
    const plan = { people: [], groups: [], laws: [], police: null, notPeople: [], issues: { failed: 0, total: 0, error: '', skipped: [], unread: [] } };
    const actIds = actsOf(w, g).filter(a => a.target).map(a => a.id);
    const parts = await lore(g, w);
    const cast = Object.values(g.cast);
    const batches = [];
    for (let i = 0; i < cast.length; i += 8)
        batches.push(cast.slice(i, i + 8));
    // 1. the world: its groups, its laws, its police, what is not a person
    for (const [i, part] of parts.entries()) {
        progress(`Reading the lore, part ${i + 1} of ${parts.length}…${plan.issues.failed ? ` (${plan.issues.failed} skipped so far)` : ''}`);
        const read = await askPart(part, lorePrompt(actIds, `part ${i + 1} of ${parts.length}`), 2500, LORE_SYS);
        plan.issues.total += read.pieces;
        if (read.error)
            plan.issues.error = read.error;
        note(plan, 'lore', read.skipped);
        takeLore(g, w, plan, actIds, read.outs);
        if (reading.stop) { // what Stop cut off, and the rest, are left to read later
            plan.issues.stopped = `${i + (read.cancelled.length ? 0 : 1)} of ${parts.length} parts of the lore`;
            plan.issues.unread.push(...[...read.cancelled, ...parts.slice(i + 1)].map(t => ({ kind: 'lore', text: t, titles: titlesOf(t) })), ...batches.map(castPiece));
            break;
        }
    }
    // 2. the people: what each one is, whether they are the law, their group
    for (const [j, batch] of batches.entries()) {
        if (plan.issues.stopped)
            break;
        progress(`Reading the characters, ${Math.min(cast.length, j * 8 + batch.length)} of ${cast.length}…`);
        const read = await askPart(cardsText(batch), castPrompt(plan.groups.map(x => x.name)), 1500, CAST_SYS);
        plan.issues.total += read.pieces;
        if (read.error)
            plan.issues.error = read.error;
        note(plan, 'cast', read.skipped, batch.map(r => r.avatar));
        takeCast(plan, batch, read.outs);
        if (reading.stop) {
            plan.issues.stopped = `the lore and ${Math.min(cast.length, j * 8 + (read.cancelled.length ? 0 : batch.length))} of ${cast.length} characters`;
            plan.issues.unread.push(...read.cancelled.map(t => ({ kind: 'cast', text: t, titles: titlesOf(t), avatars: batch.map(r => r.avatar) })), ...batches.slice(j + 1).map(castPiece));
            break;
        }
    }
    settle(g, plan);
    if (reading.gaveUp)
        plan.issues.gaveUp = true;
    Object.assign(plan.issues, { think: reading.think, stepped: reading.stepped });
    progress('');
    return plan;
}
/** Reads the skipped pieces again (and, after Stop, the ones not read yet), adding what is found to the plan. */
export async function readAgain(g, w, plan, progress = () => { }) {
    startReading();
    try {
        const actIds = actsOf(w, g).filter(a => a.target).map(a => a.id);
        const list = [...plan.issues.skipped, ...plan.issues.unread];
        const before = plan.groups.length;
        Object.assign(plan.issues, { skipped: [], unread: [], stopped: undefined, gaveUp: false, error: '' });
        for (const [i, pc] of list.entries()) {
            progress(`Reading again, part ${i + 1} of ${list.length}${pc.titles.length ? ` (${pc.titles.slice(0, 3).join(', ')}${pc.titles.length > 3 ? '…' : ''})` : ''}…`);
            const batch = (pc.avatars ?? []).map(a => Object.values(g.cast).find(r => r.avatar === a)).filter(Boolean);
            const read = await askPart(pc.text, pc.kind === 'lore' ? lorePrompt(actIds, 'a part') : castPrompt(plan.groups.map(x => x.name)), pc.kind === 'lore' ? 2500 : 1500, pc.kind === 'lore' ? LORE_SYS : CAST_SYS);
            plan.issues.total += Math.max(0, read.pieces - 1);
            if (read.error)
                plan.issues.error = read.error;
            note(plan, pc.kind, read.skipped, pc.avatars);
            if (pc.kind === 'lore')
                takeLore(g, w, plan, actIds, read.outs);
            else
                takeCast(plan, batch, read.outs);
            if (reading.stop) {
                plan.issues.stopped = `${i + (read.cancelled.length ? 0 : 1)} of ${list.length} parts`;
                plan.issues.unread.push(...read.cancelled.map(t => ({ ...pc, text: t, titles: titlesOf(t) })), ...list.slice(i + 1));
                break;
            }
        }
        plan.issues.failed = plan.issues.skipped.length;
        settle(g, plan, before);
        if (reading.gaveUp)
            plan.issues.gaveUp = true;
        Object.assign(plan.issues, { think: reading.think, stepped: plan.issues.stepped || reading.stepped });
        progress('');
    }
    finally {
        endReading();
    }
}
/** Applies what you kept. Returns a short summary. */
export function applyPlan(g, w, plan) {
    const st = hs(g);
    const done = [];
    // groups first (people are put in them)
    const ids = {};
    for (const gr of plan.groups.filter(x => x.keep)) {
        const have = Object.values(st.groups).find(x => x.name.toLowerCase() === gr.name.toLowerCase());
        const id = have?.id ?? `g${Date.now().toString(36)}${Object.keys(st.groups).length}`;
        st.groups[id] = { id, name: gr.name, members: have?.members ?? [], ...(gr.base ? { base: gr.base } : have?.base ? { base: have.base } : {}) };
        ids[gr.name.toLowerCase()] = id;
    }
    if (plan.groups.some(x => x.keep))
        done.push(`${plan.groups.filter(x => x.keep).length} groups`);
    let n = 0;
    for (const p of plan.people.filter(x => x.keep)) {
        if (p.kind)
            st.kinds[p.key] = p.kind;
        st.lawKeys = st.lawKeys.filter(k => k !== p.key);
        if (p.law)
            st.lawKeys.push(p.key);
        for (const x of Object.values(st.groups))
            x.members = x.members.filter(m => m !== p.key);
        const gid = p.group ? ids[p.group.toLowerCase()] ?? Object.values(st.groups).find(x => x.name.toLowerCase() === p.group.toLowerCase())?.id : '';
        if (gid)
            st.groups[gid].members.push(p.key);
        n++;
    }
    if (n)
        done.push(`${n} people`);
    for (const l of plan.laws.filter(x => x.keep)) {
        const { keep: _k, ...law } = l;
        void _k;
        st.laws = [...st.laws.filter(x => x.name.toLowerCase() !== law.name.toLowerCase()), law];
    }
    if (plan.laws.some(x => x.keep))
        done.push(`${plan.laws.filter(x => x.keep).length} laws`);
    if (plan.police?.keep) {
        st.law.mode = plan.police.exists ? 'on' : 'off';
        if (plan.police.exists && plan.police.name)
            st.law.name = plan.police.name;
        done.push(plan.police.exists ? `the law: ${plan.police.name || 'yes'}` : 'no law');
    }
    const np = plan.notPeople.filter(x => x.keep).map(x => x.word);
    if (np.length) {
        st.notPeople = [...new Set([...(st.notPeople ?? []), ...np])];
        done.push(`not people: ${np.join(', ')}`);
    }
    saveGame();
    return done.join(' · ');
}
export const setupGame = () => game();
