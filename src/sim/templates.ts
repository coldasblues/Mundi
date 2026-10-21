// Game templates: how a game of a world starts, saved under a name, to start another one the same way.
//  - the start: the people living there, which characters' lorebooks are on, the households, the difficulty (saved
//    from the new game's last step);
//  - the setup: the law, the world's laws, the groups and their bases, what each person is, who is the law, what is
//    not a person (saved from a game, after Set up from the lore or by hand), so a new game needn't read the lore again.
// Either half can be missing; saving under the same name fills in the other. Kept in Mundi's settings; a template can
// be exported to a file and imported (to share it with a world or a card pack). Using a setup opens the same review as
// Set up from the lore: nothing is changed until you apply it.
import { settings, saveSettings, type Save } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { hs, resolvePlace } from './hostile.js';
import type { StoryLaw } from './judge.js';
import type { Plan } from './setup.js';

/** How a new game starts (the new game's choices, except your own character). */
export interface StartChoices {
    cast: string[]; names: Record<string, string>; examples: boolean; loreOff: string[]; difficulty: string;
    households: { members: string[]; ties: any[] }[]; family: { avatar: string; type: string; tone: string }[];
}
export interface SetupPart {
    police: { exists: boolean; name: string } | null;
    laws: StoryLaw[];
    groups: { name: string; base: string; baseName: string }[];
    /** The people, by card: what they are, whether they are the law, their group (by name). */
    people: { avatar: string; name: string; kind: string; law: boolean; group: string }[];
    notPeople: string[];
}
export interface SetupTemplate {
    id: string; name: string;
    /** The world it was made in (its id and name): its groups' bases are places of that world. */
    world: string; worldName: string;
    created: number;
    start?: StartChoices;
    setup?: SetupPart;
}
const FILE_TAG = 'mundi-setup-template';
const store = (): SetupTemplate[] => { const s = settings() as any; return (s.setupTemplates ??= []); };
export const templates = (): SetupTemplate[] => store();
export const templateById = (id: string) => store().find(t => t.id === id);
/** This world's templates first, then the others. */
export const templatesFor = (worldId: string) => [...store()].sort((a, b) => Number(b.world === worldId) - Number(a.world === worldId) || b.created - a.created);
const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const placeLabel = (w: WorldDef, id: string) => w.places.find(p => p.id === id)?.name ?? '';

/** This game's setup (only the cast: walk-ons belong to one game). */
export function setupOfGame(g: Save, w: WorldDef): SetupPart {
    const st = hs(g);
    const groupOf = (key: string) => Object.values(st.groups).find(x => x.members.includes(key))?.name ?? '';
    const people = Object.values(g.cast).map(r => {
        const key = `cast:${r.avatar}`;
        return { avatar: r.avatar, name: r.name, kind: st.kinds[key] ?? '', law: st.lawKeys.includes(key), group: groupOf(key) };
    }).filter(p => p.kind || p.law || p.group);
    return {
        police: st.law.mode === 'auto' ? null : { exists: st.law.mode === 'on', name: st.law.name ?? '' },
        laws: st.laws.map(l => ({ ...l })),
        groups: Object.values(st.groups).map(x => ({ name: x.name, base: x.base ?? '', baseName: x.base ? placeLabel(w, x.base) : '' })),
        people,
        notPeople: [...((st as any).notPeople ?? [])],
    };
}
export const isEmptySetup = (s?: SetupPart) => !s || (!s.police && !s.laws.length && !s.groups.length && !s.people.length && !s.notPeople.length);
const find = (world: string, name: string) => store().find(x => x.world === world && x.name.toLowerCase() === name.trim().toLowerCase());
/**
 * Saves a start or a setup under a name: a template of this world with that name gets it (keeping its other half),
 * or a new one is made. Returns the template and whether it was new.
 */
export function saveInto(w: WorldDef, name: string, part: { start?: StartChoices; setup?: SetupPart }): { t: SetupTemplate; isNew: boolean } {
    const nm = name.trim().slice(0, 60) || `${w.name} start`;
    const have = find(w.id, nm);
    if (have) { Object.assign(have, part, { created: Date.now() }); saveSettings(); return { t: have, isNew: false }; }
    const t: SetupTemplate = { id: newId(), name: nm, world: w.id, worldName: w.name, created: Date.now(), ...part };
    store().push(t); saveSettings();
    return { t, isNew: true };
}
/** Adds an imported template (renamed if this world already has one by that name). */
export function addTemplate(t: SetupTemplate) {
    let name = t.name, n = 2;
    while (find(t.world, name)) name = `${t.name} (${n++})`;
    store().push({ ...t, name }); saveSettings();
    return name;
}
export function deleteTemplate(id: string) {
    const list = store(); const i = list.findIndex(t => t.id === id);
    if (i >= 0) { list.splice(i, 1); saveSettings(); }
}
export const setupSummary = (s?: SetupPart) => !s ? '' : [
    s.police ? (s.police.exists ? `law: ${s.police.name || 'yes'}` : 'no law') : '',
    s.laws.length ? `${s.laws.length} law${s.laws.length === 1 ? '' : 's'}` : '',
    s.groups.length ? `${s.groups.length} group${s.groups.length === 1 ? '' : 's'}` : '',
    s.people.length ? `${s.people.length} ${s.people.length === 1 ? 'person' : 'people'} described` : '',
    s.notPeople.length ? `not people: ${s.notPeople.join(', ')}` : '',
].filter(Boolean).join(' · ');
export const startSummary = (c?: StartChoices) => !c ? '' : [
    `${c.cast.length + (c.examples ? 1 : 0) ? `${c.cast.length} ${c.cast.length === 1 ? 'person' : 'people'}${c.examples ? ' + the examples' : ''}` : 'nobody yet'}`,
    c.loreOff.length ? `${c.loreOff.length} lorebook${c.loreOff.length === 1 ? '' : 's'} off` : '',
    c.households.length ? `${c.households.length} household${c.households.length === 1 ? '' : 's'}` : '',
    c.difficulty && c.difficulty !== 'normal' ? c.difficulty : '',
].filter(Boolean).join(' · ');
export const summary = (t: SetupTemplate) => [t.start ? `Start: ${startSummary(t.start)}` : '', !isEmptySetup(t.setup) ? `Setup: ${setupSummary(t.setup)}` : ''].filter(Boolean).join(' — ');

/** The template as a setup to review in this game: people are matched to this game's cast by card, then by name. */
export function toPlan(g: Save, w: WorldDef, tpl: SetupTemplate): Plan {
    const cast = Object.values(g.cast);
    const sameWorld = tpl.world === w.id;
    const t: SetupPart = tpl.setup ?? { police: null, laws: [], groups: [], people: [], notPeople: [] };
    const plan: Plan = {
        people: [], laws: t.laws.map(l => ({ ...l, id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, keep: true })),
        groups: t.groups.map(x => ({ name: x.name, baseText: x.baseName, base: sameWorld && w.places.some(p => p.id === x.base) ? x.base : x.baseName ? resolvePlace(g, w, x.baseName) : '', keep: true })),
        police: t.police ? { ...t.police, keep: true } : null,
        notPeople: t.notPeople.map(word => ({ word, keep: true })),
        issues: { failed: 0, total: 0, error: '', skipped: [], unread: [] },
        from: tpl.name, unmatched: [],
    };
    for (const p of t.people) {
        const r = cast.find(x => x.avatar === p.avatar) ?? cast.find(x => x.name.toLowerCase() === p.name.toLowerCase());
        if (!r) { plan.unmatched!.push(p.name); continue; }
        if (plan.people.some(x => x.avatar === r.avatar)) continue;
        plan.people.push({ key: `cast:${r.avatar}`, avatar: r.avatar, name: r.name, kind: p.kind, law: p.law, group: p.group, keep: true });
    }
    return plan;
}

/** For a file: the template, tagged so it can be recognized when imported. */
export const exportText = (t: SetupTemplate) => JSON.stringify({ [FILE_TAG]: 1, ...t }, null, 2);
/** A template from a file (it gets a new id). */
export function importText(text: string): SetupTemplate {
    let o: any; try { o = JSON.parse(text); } catch { throw new Error('That file is not a setup template (it is not JSON).'); }
    if (!o || !o[FILE_TAG]) throw new Error('That file is not a Mundi setup template.');
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    const str = (v: unknown, n = 200) => String(v ?? '').slice(0, n);
    const so = o.setup ?? (o.laws || o.groups || o.people ? o : null);     // (the first files kept the setup at the top)
    const setup = (o: any): SetupPart => ({
        police: o.police && typeof o.police.exists === 'boolean' ? { exists: o.police.exists, name: str(o.police.name, 40) } : null,
        laws: arr(o.laws).filter((l: any) => l?.name && Array.isArray(l.about) && Array.isArray(l.allows)).map((l: any) => ({
            id: str(l.id, 40) || newId(), name: str(l.name, 60), about: arr(l.about).map((x: any) => str(x, 40)), allows: arr(l.allows).map((x: any) => str(x, 30)), who: arr(l.who).map((x: any) => str(x, 40)),
            counts: l.counts === 'minor' ? 'minor' : 'legal', ...(l.handTo ? { handTo: str(l.handTo, 60) } : {}), ...(Number(l.reward) > 0 ? { reward: Math.round(Number(l.reward)) } : {}),
            ...(Array.isArray(l.objectors) ? { objectors: l.objectors.map((x: any) => str(x, 40)) } : {}), ...(l.note ? { note: str(l.note) } : {}),
        })),
        groups: arr(o.groups).filter((x: any) => x?.name).map((x: any) => ({ name: str(x.name, 60), base: str(x.base, 80), baseName: str(x.baseName, 80) })),
        people: arr(o.people).filter((x: any) => x?.name).map((x: any) => ({ avatar: str(x.avatar, 200), name: str(x.name, 80), kind: str(x.kind, 60), law: x.law === true, group: str(x.group, 60) })),
        notPeople: arr(o.notPeople).map((x: any) => str(x, 30)).filter(Boolean),
    });
    const sc = o.start;
    const start: StartChoices | undefined = sc && Array.isArray(sc.cast) ? {
        cast: arr(sc.cast).map((x: any) => str(x, 200)), names: Object.fromEntries(Object.entries(sc.names ?? {}).map(([k, v]) => [str(k, 200), str(v, 80)])),
        examples: sc.examples === true, loreOff: arr(sc.loreOff).map((x: any) => str(x, 120)), difficulty: str(sc.difficulty, 20) || 'normal',
        households: arr(sc.households).filter((h: any) => Array.isArray(h?.members)).map((h: any) => ({ members: h.members.map((x: any) => str(x, 200)), ties: arr(h.ties) })),
        family: arr(sc.family).filter((f: any) => f?.avatar).map((f: any) => ({ avatar: str(f.avatar, 200), type: str(f.type, 30), tone: str(f.tone, 30) })),
    } : undefined;
    const t: SetupTemplate = {
        id: newId(), name: str(o.name, 60) || 'Imported template', world: str(o.world, 80), worldName: str(o.worldName, 80), created: Number(o.created) || Date.now(),
        ...(start ? { start } : {}), ...(so ? { setup: setup(so) } : {}),
    };
    if (!t.start && isEmptySetup(t.setup)) throw new Error('That template is empty.');
    return t;
}
