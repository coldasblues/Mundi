// "Set up from the lore": the AI reads the game's lorebooks and its characters' cards and proposes the settings the
// rough-stuff and people systems use: what each person is, who is the law, the groups (with members and a base), the
// world's own laws, whether there is police at all, and what is not a person. Nothing is applied until you review it.
import { game, saveGame, type Save } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { charOf, loadLore, chatLore, quiet } from '../st/bridge.js';
import { hs, resolvePlace, actsOf } from './hostile.js';
import type { StoryLaw } from './judge.js';

export interface PlanPerson { key: string; avatar: string; name: string; kind: string; law: boolean; group: string; keep: boolean }
export interface PlanGroup { name: string; base: string; baseText: string; keep: boolean }
export interface PlanLaw extends StoryLaw { keep: boolean }
export interface Plan {
    people: PlanPerson[]; groups: PlanGroup[]; laws: PlanLaw[];
    police: { exists: boolean; name: string; keep: boolean } | null;
    notPeople: { word: string; keep: boolean }[];
}

const clean = (t: unknown) => String(t ?? '').replace(/\r/g, '').trim();
const CHUNK = 10000;
const entryText = (e: any) => (clean(e.content) ? `### ${clean(e.comment) || (e.key ?? []).join(', ')}\n${clean(e.content)}` : '');
function chunks(blocks: string[]): string[] {
    const out: string[] = []; let cur = '';
    for (const b of blocks.filter(Boolean)) {
        if (cur && cur.length + b.length > CHUNK) { out.push(cur); cur = ''; }
        if (b.length > CHUNK) { for (let i = 0; i < b.length; i += CHUNK) out.push(b.slice(i, i + CHUNK)); continue; }
        cur += (cur ? '\n\n' : '') + b;
    }
    if (cur) out.push(cur);
    return out;
}
/** The lorebooks of this game: the world's, this save's, and the ones linked to its characters. */
async function lore(g: Save, w: WorldDef): Promise<string[]> {
    const names = new Set<string>([...(w.lorebooks ?? []), chatLore()].filter(Boolean));
    for (const r of Object.values(g.cast)) { const lw = clean(charOf(r.avatar)?.data?.extensions?.world); if (lw) names.add(lw); }
    const blocks: string[] = [];
    for (const n of names) { try { blocks.push(...Object.values((await loadLore(n)).entries ?? {}).filter((e: any) => !e.disable).map(entryText)); } catch { /* gone */ } }
    for (const r of Object.values(g.cast)) for (const e of charOf(r.avatar)?.data?.character_book?.entries ?? []) blocks.push(entryText(e));
    return chunks([...new Set(blocks)]);
}
function jsonLines(out: string): any[] {
    const list: any[] = [];
    for (const raw of out.split('\n')) {
        const t = raw.trim().replace(/^[-*\d.)\s]+(?=\{)/, '').replace(/,\s*$/, '');
        if (!t.startsWith('{')) continue;
        try { list.push(JSON.parse(t)); } catch { /* broken line */ }
    }
    return list;
}
const strs = (v: unknown) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map(x => String(x).trim()).filter(Boolean);

/** Reads it all with the AI. `progress(label)`. */
export async function readLore(g: Save, w: WorldDef, progress: (t: string) => void = () => {}): Promise<Plan> {
    const plan: Plan = { people: [], groups: [], laws: [], police: null, notPeople: [] };
    const actIds = actsOf(w, g).filter(a => a.target).map(a => a.id);
    const parts = await lore(g, w);
    // 1. the world: its groups, its laws, its police, what is not a person
    for (const [i, part] of parts.entries()) {
        progress(`Reading the lore, part ${i + 1} of ${parts.length}…`);
        const out = await quiet([
            `Below is part ${i + 1} of ${parts.length} of the lore of a role-play world.`,
            'List what it says about these, one JSON object per line, nothing else:',
            '{"type": "group", "name": "", "base": "where they are based, or empty"}  (factions, organizations, gangs, families, agencies)',
            `{"type": "law", "name": "", "about": ["what kind of people it is about"], "allows": [${actIds.map(a => `"${a}"`).join(', ')}] (only the acts it makes lawful), "who": ["who may: empty for anyone, or law, or a role"], "counts": "legal or minor", "handTo": "who they are handed over to, or empty", "reward": 0, "objectors": ["who disapproves"], "note": "one sentence"}  (laws or rules of this world that make some acts against some kind of people lawful, such as a bounty or a control order)`,
            '{"type": "police", "exists": true, "name": "what the law enforcement is called"}  (or "exists": false when the world has no police or law enforcement at all)',
            '{"type": "notperson", "word": ""}  (creatures the world does not treat as people at all, such as zombies)',
            'Use only what the text says. If it says nothing about these, answer NONE.',
            '"""', part, '"""',
        ].join('\n'), 1500, 'You read role-play lore and list its factions and laws as JSON lines. You never invent anything.');
        for (const o of jsonLines(out)) {
            if (o.type === 'group' && o.name && !plan.groups.some(x => x.name.toLowerCase() === String(o.name).toLowerCase())) plan.groups.push({ name: clean(o.name).slice(0, 60), baseText: clean(o.base), base: o.base ? resolvePlace(g, w, String(o.base)) : '', keep: true });
            else if (o.type === 'law' && o.name && strs(o.about).length && strs(o.allows).some(a => actIds.includes(a)) && !plan.laws.some(x => x.name.toLowerCase() === String(o.name).toLowerCase()))
                plan.laws.push({ id: `l${Date.now().toString(36)}${plan.laws.length}`, name: clean(o.name).slice(0, 60), about: strs(o.about).slice(0, 6), allows: strs(o.allows).filter(a => actIds.includes(a)), who: strs(o.who).filter(x => !/^any(one|body)?$/i.test(x)).slice(0, 4), counts: o.counts === 'minor' ? 'minor' : 'legal', ...(clean(o.handTo) ? { handTo: clean(o.handTo).slice(0, 60) } : {}), ...(Number(o.reward) > 0 ? { reward: Math.round(Number(o.reward)) } : {}), ...(strs(o.objectors).length ? { objectors: strs(o.objectors).slice(0, 6) } : {}), ...(clean(o.note) ? { note: clean(o.note).slice(0, 200) } : {}), keep: true });
            else if (o.type === 'police' && typeof o.exists === 'boolean' && !plan.police) plan.police = { exists: o.exists, name: clean(o.name).slice(0, 40), keep: true };
            else if (o.type === 'notperson' && o.word && !plan.notPeople.some(x => x.word === String(o.word).toLowerCase())) plan.notPeople.push({ word: clean(o.word).toLowerCase().slice(0, 30), keep: true });
        }
    }
    // 2. the people: what each one is, whether they are the law, their group
    const cast = Object.values(g.cast);
    const groups = plan.groups.map(x => x.name);
    for (let i = 0; i < cast.length; i += 8) {
        const batch = cast.slice(i, i + 8);
        progress(`Reading the characters, ${Math.min(cast.length, i + batch.length)} of ${cast.length}…`);
        const cards = batch.map(r => { const c = charOf(r.avatar); return `## ${r.name}\n${clean(c?.description).slice(0, 1400)}${clean(c?.personality) ? `\nPersonality: ${clean(c?.personality).slice(0, 300)}` : ''}`; }).join('\n\n');
        const out = await quiet([
            'These are characters of a role-play world.',
            groups.length ? `The world's groups: ${groups.join('; ')}.` : '',
            'For each character, write one JSON object per line, nothing else:',
            '{"name": "", "kind": "what they are, in a few words (human, mouse kemonomimi, vampire…)", "law": false (true if they are police, a guard or other law enforcement), "group": "one of the groups above, or empty"}',
            'Use only what the cards say.',
            '"""', cards, '"""',
        ].filter(Boolean).join('\n'), 900, 'You read character cards and classify the characters as JSON lines. You never invent anything.');
        for (const o of jsonLines(out)) {
            const r = batch.find(x => x.name.toLowerCase() === String(o.name ?? '').toLowerCase()) ?? batch.find(x => x.name.toLowerCase().split(' ')[0] === String(o.name ?? '').toLowerCase().split(' ')[0]);
            if (!r || plan.people.some(p => p.avatar === r.avatar)) continue;
            const grp = groups.find(x => x.toLowerCase() === String(o.group ?? '').toLowerCase()) ?? '';
            plan.people.push({ key: `cast:${r.avatar}`, avatar: r.avatar, name: r.name, kind: clean(o.kind).slice(0, 60), law: o.law === true, group: grp, keep: true });
        }
    }
    progress('');
    return plan;
}

/** Applies what you kept. Returns a short summary. */
export function applyPlan(g: Save, w: WorldDef, plan: Plan): string {
    const st = hs(g);
    const done: string[] = [];
    // groups first (people are put in them)
    const ids: Record<string, string> = {};
    for (const gr of plan.groups.filter(x => x.keep)) {
        const have = Object.values(st.groups).find(x => x.name.toLowerCase() === gr.name.toLowerCase());
        const id = have?.id ?? `g${Date.now().toString(36)}${Object.keys(st.groups).length}`;
        st.groups[id] = { id, name: gr.name, members: have?.members ?? [], ...(gr.base ? { base: gr.base } : have?.base ? { base: have.base } : {}) };
        ids[gr.name.toLowerCase()] = id;
    }
    if (plan.groups.some(x => x.keep)) done.push(`${plan.groups.filter(x => x.keep).length} groups`);
    let n = 0;
    for (const p of plan.people.filter(x => x.keep)) {
        if (p.kind) st.kinds[p.key] = p.kind;
        st.lawKeys = st.lawKeys.filter(k => k !== p.key); if (p.law) st.lawKeys.push(p.key);
        for (const x of Object.values(st.groups)) x.members = x.members.filter(m => m !== p.key);
        const gid = p.group ? ids[p.group.toLowerCase()] ?? Object.values(st.groups).find(x => x.name.toLowerCase() === p.group.toLowerCase())?.id : '';
        if (gid) st.groups[gid].members.push(p.key);
        n++;
    }
    if (n) done.push(`${n} people`);
    for (const l of plan.laws.filter(x => x.keep)) {
        const { keep: _k, ...law } = l; void _k;
        st.laws = [...st.laws.filter(x => x.name.toLowerCase() !== law.name.toLowerCase()), law];
    }
    if (plan.laws.some(x => x.keep)) done.push(`${plan.laws.filter(x => x.keep).length} laws`);
    if (plan.police?.keep) { st.law.mode = plan.police.exists ? 'on' : 'off'; if (plan.police.exists && plan.police.name) st.law.name = plan.police.name; done.push(plan.police.exists ? `the law: ${plan.police.name || 'yes'}` : 'no law'); }
    const np = plan.notPeople.filter(x => x.keep).map(x => x.word);
    if (np.length) { (st as any).notPeople = [...new Set([...((st as any).notPeople ?? []), ...np])]; done.push(`not people: ${np.join(', ')}`); }
    saveGame();
    return done.join(' · ');
}
export const setupGame = () => game();
