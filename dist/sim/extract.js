// Characters out of a lorebook or a card that holds several (a world card, an ensemble, a narrator card): the AI
// reads it in parts and lists the people in it; you choose who to keep; each becomes a SillyTavern card of its own,
// tagged (a folder) with where it came from and, when there is one, with the lorebook linked so they keep their lore.
// The source is never changed.
import { characters, charOf, createCharacter, loadLore, newFolder, putInFolder, avatarUrl } from '../st/bridge.js';
import { askPart, reading, startReading, endReading } from './reading.js';
import { initialsAvatar } from './game.js';
const clean = (t) => String(t ?? '').replace(/\r/g, '').trim();
const CHUNK = 11000;
/* ---------- what is read ---------- */
function entryText(e) {
    const keys = (e.key ?? e.keys ?? []).filter(Boolean).join(', ');
    const title = clean(e.comment) || keys;
    return clean(e.content) ? `### ${title}${keys && keys !== title ? ` (keys: ${keys})` : ''}\n${clean(e.content)}` : '';
}
function chunked(blocks) {
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
/** A card: its fields and its own lorebook (the card's book and the one linked to it). */
export async function cardSource(avatar) {
    const c = charOf(avatar);
    if (!c)
        throw new Error('That character no longer exists.');
    const d = c.data ?? {};
    const fields = [['Description', c.description], ['Personality', c.personality], ['Scenario', c.scenario], ['First message', c.first_mes], ['Example dialogue', c.mes_example]]
        .map(([k, v]) => (clean(v) ? `## ${k}\n${clean(v)}` : '')).filter(Boolean);
    const book = (d.character_book?.entries ?? []).map(entryText);
    const linked = clean(d.extensions?.world);
    let linkedBlocks = [];
    if (linked) {
        try {
            linkedBlocks = Object.values((await loadLore(linked)).entries ?? {}).map(entryText);
        }
        catch { /* no such lorebook */ }
    }
    return { kind: 'card', id: avatar, title: String(c.name ?? 'the card'), parts: chunked([fields.join('\n\n'), ...book, ...linkedBlocks]), lorebook: linked, scenario: clean(c.scenario), avatar };
}
export async function lorebookSource(name) {
    const lore = await loadLore(name);
    const list = Object.values(lore.entries ?? {}).filter((e) => !e.disable);
    return { kind: 'lorebook', id: name, title: name, parts: chunked(list.map(entryText)), lorebook: name, scenario: '', avatar: '' };
}
/* ---------- the AI reads it ---------- */
const KEYS = ['name', 'aliases', 'age', 'kind', 'appearance', 'personality', 'background', 'speech', 'relationships', 'greeting'];
function promptFor(src, part, i, n) {
    return [
        `Below is part ${i + 1} of ${n} of a SillyTavern ${src.kind === 'card' ? 'character card' : 'lorebook'} called "${src.title}".`,
        'List every distinct PERSON it describes: characters with a name who could speak in a story. Not places, items, groups, factions, species or rules. Not {{user}} or the player. Not a narrator.',
        'For each person, write ONE line of JSON, exactly with these keys:',
        '{"name": "", "aliases": [], "age": "", "kind": "", "appearance": "", "personality": "", "background": "", "speech": "", "relationships": "", "greeting": ""}',
        'kind: what they are, in a few words (human, mouse kemonomimi, vampire, android…), as the text says. age: as the text says (a number, or words like "young adult", "elderly"), or "" when it does not say. appearance, personality, background, relationships: a few sentences each, from the text only. speech: how they talk, with one sample line. greeting: one short line they might say on meeting someone new, in their voice.',
        'Use only what the text says; leave a field "" when it does not say. If there is nobody, answer NONE. Answer with the JSON lines only.',
        '"""', part, '"""',
    ].join('\n');
}
function parseLines(out) {
    const list = [];
    for (const raw of out.split('\n')) {
        const t = raw.trim().replace(/^[-*\d.)\s]+(?=\{)/, '').replace(/,\s*$/, '');
        if (!t.startsWith('{'))
            continue;
        try {
            const o = JSON.parse(t);
            if (!o?.name || typeof o.name !== 'string')
                continue;
            const f = {};
            for (const k of KEYS)
                f[k] = k === 'aliases' ? (Array.isArray(o.aliases) ? o.aliases.map(String).filter(Boolean).slice(0, 6) : []) : clean(o[k]);
            list.push(f);
        }
        catch { /* a broken line */ }
    }
    // a model that wraps everything in a JSON array
    if (!list.length) {
        try {
            const arr = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
            if (Array.isArray(arr))
                for (const o of arr)
                    if (o?.name)
                        list.push({ ...o, aliases: Array.isArray(o.aliases) ? o.aliases : [] });
        }
        catch { /* */ }
    }
    return list;
}
const norm = (n) => n.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const sameAs = (a, b) => {
    const A = [a.name ?? '', ...(a.aliases ?? [])].map(norm).filter(Boolean), B = [b.name ?? '', ...(b.aliases ?? [])].map(norm).filter(Boolean);
    return A.some(x => B.includes(x)) || norm(a.name ?? '').split(' ')[0] === norm(b.name ?? '') || norm(b.name ?? '').split(' ')[0] === norm(a.name ?? '');
};
// "17", "a 16-year-old", "teenager", "child": not an adult (kept out of romance, and not ticked)
export function minorFrom(age, text = '') {
    const a = String(age ?? '').toLowerCase();
    const n = a.match(/\b(\d{1,2})\b/);
    if (n && Number(n[1]) < 18)
        return true;
    if (/\b(child|kid|teen|teenager|minor|toddler|baby|infant|adolescent|schoolgirl|schoolboy|preteen|underage)\b/.test(a))
        return true;
    const y = String(text ?? '').toLowerCase().match(/\b(\d{1,2})[- ]years?[- ]old\b/);
    return !!y && Number(y[1]) < 18;
}
function merge(into, add) {
    for (const k of KEYS) {
        if (k === 'name')
            continue;
        if (k === 'aliases') {
            into.aliases = [...new Set([...into.aliases, ...(add.aliases ?? [])])].filter(x => norm(x) !== norm(into.name)).slice(0, 8);
            continue;
        }
        const v = clean(add[k]);
        if (!v)
            continue;
        const cur = clean(into[k]);
        into[k] = !cur ? v : cur.includes(v) || v.length < 12 ? cur : `${cur} ${v}`.slice(0, 1800);
    }
    // the longer name is usually the full one ("Lilith" + "Lilith Morningstar")
    if (add.name && add.name.length > into.name.length && norm(add.name).includes(norm(into.name)))
        into.name = add.name;
}
/** Parts the AI gave nothing for in the last reading (skipped), out of all it was asked (a split part counts as two), and why. */
export const lastRead = { failed: 0, total: 0, error: '', stopped: '', gaveUp: false };
/** Reads the source with the AI, part by part. `progress` gets (part done, parts). */
export async function extract(src, progress = () => { }) {
    startReading();
    try {
        return await readAll(src, progress);
    }
    finally {
        endReading();
    }
}
async function readAll(src, progress) {
    const found = [];
    const n = src.parts.length;
    Object.assign(lastRead, { failed: 0, total: 0, error: '', stopped: '', gaveUp: false });
    for (let i = 0; i < n; i++) {
        progress(i, n);
        // an empty answer is retried as two halves, then skipped (the rest is still read)
        const read = await askPart(src.parts[i], (p) => promptFor(src, p, i, n), 2500, 'You list the characters in role-play material as JSON lines. You never invent details.');
        if (reading.stop) {
            lastRead.stopped = `${i} of ${n} part${n === 1 ? '' : 's'}`;
            lastRead.gaveUp = reading.gaveUp;
            break;
        } // the part in progress was cancelled
        lastRead.total += read.pieces;
        lastRead.failed += read.failed;
        if (read.error)
            lastRead.error = read.error;
        for (const f of read.outs.filter(o => !/^\s*NONE\s*$/i.test(o)).flatMap(parseLines)) {
            const hit = found.find(x => sameAs(x, f));
            if (hit) {
                merge(hit, f);
                continue;
            }
            const one = { name: clean(f.name), aliases: f.aliases ?? [], age: '', kind: '', appearance: '', personality: '', background: '', speech: '', relationships: '', greeting: '', keep: true, minor: false, exists: '' };
            merge(one, f);
            found.push(one);
        }
    }
    lastRead.gaveUp = reading.gaveUp;
    progress(n, n);
    const own = norm(src.kind === 'card' ? src.title : '');
    for (const f of found) {
        f.minor = minorFrom(f.age, `${f.appearance} ${f.background}`);
        f.exists = characters().find(c => norm(String(c.name ?? '')) === norm(f.name))?.avatar ?? '';
        f.keep = !f.minor && !f.exists && norm(f.name) !== own;
    }
    return found;
}
/* ---------- without the AI: a lorebook's entries that look like people ---------- */
const PERSON = /\b(he|she|his|her|him|they are|years old|year-old|age[sd]?|personality|appearance|wears|hair|eyes|born|speaks|voice)\b/i;
export function guessPeople(src) {
    const out = [];
    for (const part of src.parts)
        for (const block of part.split(/\n\n(?=### )/)) {
            const m = block.match(/^### (.+?)(?: \(keys: (.+?)\))?\n([\s\S]*)$/);
            if (!m)
                continue;
            const title = m[1].trim(), body = m[3].trim();
            const first = title.split(/[,/|]/)[0].trim();
            if (!/^[A-Z][\w'’-]*(?: [A-Z][\w'’-]*){0,3}$/.test(first) || !PERSON.test(body))
                continue;
            if (out.some(f => norm(f.name) === norm(first)))
                continue;
            out.push({ name: first, aliases: (m[2] ?? '').split(',').map(s => s.trim()).filter(s => s && norm(s) !== norm(first)).slice(0, 6), age: '', kind: '', appearance: '', personality: '', background: body.slice(0, 1800), speech: '', relationships: '', greeting: '', keep: true, minor: minorFrom('', body), exists: '' });
        }
    for (const f of out) {
        f.exists = characters().find(c => norm(String(c.name ?? '')) === norm(f.name))?.avatar ?? '';
        f.keep = !f.minor && !f.exists;
    }
    return out;
}
const COLORS = [['#7b5cff', '#2bd2ff'], ['#ff5f8f', '#ffb86b'], ['#16b3a5', '#7be495'], ['#f0ad13', '#ff6a3d'], ['#5aa0e6', '#a66bff'], ['#e7489a', '#6b3dff']];
function descriptionOf(f, src) {
    return [
        f.appearance,
        f.age && !/^\s*$/.test(f.age) ? `Age: ${f.age}.` : '',
        f.background,
        f.relationships ? `Relationships: ${f.relationships}` : '',
        f.aliases.length ? `Also called: ${f.aliases.join(', ')}.` : '',
        `(From ${src.kind === 'card' ? 'the card' : 'the lorebook'} "${src.title}".)`,
    ].filter(Boolean).join('\n\n');
}
/** Makes a card for each kept person. Returns the new cards' avatars. */
export async function makeCards(src, list, opts, progress = () => { }) {
    const keep = list.filter(f => f.keep && f.name.trim());
    const made = [];
    let pic;
    if (opts.sourcePicture && src.avatar) {
        try {
            pic = await (await fetch(avatarUrl(src.avatar))).blob();
        }
        catch {
            pic = undefined;
        }
    }
    for (const [i, f] of keep.entries()) {
        progress(i, keep.length);
        const avatar = pic ?? await initialsAvatar(f.name, COLORS[i % COLORS.length]);
        const file = await createCharacter({
            name: f.name.trim(),
            description: descriptionOf(f, src),
            personality: f.personality,
            scenario: src.scenario,
            first_mes: f.greeting,
            mes_example: f.speech ? `<START>\n{{char}}: ${f.speech.replace(/^["“]|["”]$/g, '')}` : '',
            tags: [src.title],
            extensions: { mundi: { extractedFrom: { kind: src.kind, title: src.title }, ...(f.kind ? { kind: f.kind } : {}), ...(f.minor ? { minor: true } : {}) }, ...(opts.linkLore && src.lorebook ? { world: src.lorebook } : {}) },
        }, avatar);
        made.push(file);
    }
    progress(keep.length, keep.length);
    // a folder named after the source: the new game's cast step can pick them all at once
    if (made.length) {
        const f = newFolder(src.title);
        putInFolder(f.id, made, true);
    }
    return made;
}
