// Save safety. A player's save is hours of their life: no update may break it.
//
//  - `v: 1` marks a chat as a Mundi save and never changes (changing it would hide every existing save).
//  - `schema` is the save's format. Each update that changes the format adds a migration below; migrations run in
//    order, once, on saves older than SCHEMA, and must be safe to run again (idempotent).
//  - Before a save is changed by a migration or a repair, a copy is kept in the chat (`mundi_backups`, the last 3),
//    and can be restored from Settings → Game → This save.
//  - Links from the save to its world (job, rank, home, place, plans, course…) that the world no longer has are
//    repaired to something safe, with a notice, instead of breaking the game.
//  - A save made by a newer Mundi (schema above SCHEMA) is played as a detached copy and never written.
import { SAVE, toast, type Save } from './store.js';
import { ctx } from '../st/bridge.js';
import { getWorld, career, type WorldDef } from './world.js';

/** The save format this version of Mundi writes. Raise it together with a new migration. */
export const SCHEMA = 1;

interface Migration { to: number; what: string; run: (g: any) => void }
// In order. `run` gets a save at schema `to - 1` and leaves it at `to`.
const MIGRATIONS: Migration[] = [
    // 1 (Mundi 0.1.x): the first versioned format. Saves from before only get the stamp; every system already fills
    // in what an older save lacks when it reads it.
    { to: 1, what: 'version stamp', run: () => { /* nothing to change */ } },
];

export const schemaOf = (g: Save) => Number((g as any).schema ?? 0);

/* ---------- backups ---------- */

export interface Backup { at: number; schema: number; reason: string; data: Save }
const KEEP = 3;
export const backups = (): Backup[] => (Array.isArray(ctx().chatMetadata?.mundi_backups) ? ctx().chatMetadata.mundi_backups : []);
export function backup(g: Save, reason: string) {
    const m = ctx().chatMetadata; if (!m) return;
    const list = backups().slice(-(KEEP - 1));
    list.push({ at: Date.now(), schema: schemaOf(g), reason, data: structuredClone(g) });
    m.mundi_backups = list;
}
// Puts a backup back as the save (the current state is backed up first, so this can be undone too).
export function restoreBackup(i: number): boolean {
    const m = ctx().chatMetadata; const b = backups()[i];
    if (!m || !b || !m.mundi) return false;
    backup(m.mundi as Save, 'before restoring a backup');
    m.mundi = structuredClone(b.data);
    ctx().saveMetadataDebounced();
    return true;
}

/* ---------- migrations ---------- */

// Brings a save to the current format. Returns what was done ('' if nothing).
export function migrate(g: Save): string {
    const from = schemaOf(g);
    if (from >= SCHEMA) return '';
    backup(g, `before the update (save format ${from} → ${SCHEMA})`);
    const done: string[] = [];
    for (const m of MIGRATIONS) if (m.to > from && m.to <= SCHEMA) { m.run(g); (g as any).schema = m.to; done.push(m.what); }
    (g as any).schema = SCHEMA;
    return done.join(', ');
}

/* ---------- links to the world ---------- */

const HOME = 'home:player';
const isPlace = (g: Save, w: WorldDef, id: string) => id === HOME || (id.startsWith('home:') && !!g.cast[id.slice(5)]) || w.places.some(p => p.id === id && !p.link);
const firstSpot = (w: WorldDef, zoneId: string) => { const z = w.homes.zones.find(x => x.id === zoneId); const s = z?.spots?.[0]; return { x: s?.[0] ?? 0, y: s?.[1] ?? 0, n: 1 }; };

// Repairs what in the save points to things the world no longer has. Safe to run on every load.
export function repair(g: Save, w: WorldDef): string[] {
    const notes: string[] = [];
    const p = g.player;
    const zones = w.homes?.zones ?? [];
    // your home
    if (zones.length && !zones.some(z => z.id === p.home?.zone)) {
        const z = zones.find(x => x.kind === p.home?.kind) ?? zones[0];
        p.home = { ...(p.home ?? {}), zone: z.id, kind: z.kind, ...firstSpot(w, z.id) };
        notes.push(`Your old neighborhood is not in this world anymore: you now live in ${z.name}.`);
    }
    if (p.home && !w.homes.kinds[p.home.kind]) { const z = zones.find(x => x.id === p.home.zone); if (z) p.home.kind = z.kind; }
    // where you are
    if (p.loc && !isPlace(g, w, p.loc)) { p.loc = HOME; notes.push('The place you were in is not in this world anymore: you are back home.'); }
    // your job and rank
    if (p.job) {
        const o = w.occupations.find(x => x.id === p.job!.id);
        if (!o) { notes.push(`Your job (${p.job.id}) is not in this world anymore: you are free to look for a new one.`); p.job = null; }
        else if (!o.ranks?.length) p.job = null;
        else {
            // the career as it is now (a path the world no longer has is dropped, from there on)
            const keep: string[] = [];
            for (const id of p.job.path ?? []) { const c = career(o, keep); if (c.open?.options.some(x => x.id === id)) keep.push(id); else break; }
            if ((p.job.path ?? []).length !== keep.length) { p.job.path = keep; notes.push(`A career path at ${o.name} is not in this world anymore: choose again when you get there.`); }
            const ranks = career(o, keep).ranks;
            if (p.job.rank >= ranks.length || p.job.rank < 0) { p.job.rank = Math.max(0, Math.min(p.job.rank, ranks.length - 1)); notes.push(`Your rank at ${o.name} changed: you are now ${ranks[p.job.rank].name}.`); }
        }
    }
    // needs the world added since the save was made start at their usual value
    p.stats ??= {};
    for (const s of w.statuses ?? []) if (typeof p.stats[s.id] !== 'number') p.stats[s.id] = s.start;
    // the course you are taking
    const l = (p as any).learning;
    const courses = ((w.catalogs as any).courses ?? []) as { id: string }[];
    if (l?.current && !courses.some(c => c.id === l.current)) { l.current = ''; notes.push('The course you were taking is not offered anymore.'); }
    // the people
    for (const r of Object.values(g.cast)) {
        if (r.occupation && !w.occupations.some(o => o.id === r.occupation)) r.occupation = null;
        if (zones.length && !zones.some(z => z.id === r.home?.zone)) r.home = { zone: zones[0].id, ...firstSpot(w, zones[0].id) };
        if (Array.isArray(r.leisure)) r.leisure = r.leisure.filter(id => isPlace(g, w, id));
    }
    // maps the world retired: what saves kept per region moves to the map that took its place
    for (const [from, to] of Object.entries(w.retired?.maps ?? {})) {
        if (w.maps.some(m => m.id === from) || !w.maps.some(m => m.id === to)) continue;
        for (const key of ['regions', 'bounty', 'rep']) { const box = (g as any)[key]; if (box && box[from] !== undefined) { if (box[to] === undefined) box[to] = box[from]; delete box[from]; } }
    }
    // homes whose spot moved (the world's map of homes was redrawn): each old address moves to the home with its
    // number, or the next free one; people who shared an address keep sharing it
    {
        const all = [p.home, ...Object.values(g.cast).map(r => r.home)].filter(Boolean) as { zone: string; x: number; y: number; n?: number }[];
        const onSpot = (h: { zone: string; x: number; y: number }) => !!zones.find(z => z.id === h.zone)?.spots.some(s => s[0] === h.x && s[1] === h.y);
        const used = new Set(all.filter(onSpot).map(h => `${h.zone}:${h.x},${h.y}`));
        const moved = new Map<string, [number, number, number]>();
        for (const h of all) {
            if (onSpot(h)) continue;
            const z = zones.find(x => x.id === h.zone); if (!z?.spots.length) continue;
            const key = `${h.zone}:${h.x},${h.y}`;
            if (!moved.has(key)) {
                const free = (i: number) => !used.has(`${z.id}:${z.spots[i][0]},${z.spots[i][1]}`);
                let i = (h.n ?? 1) - 1; if (i < 0 || i >= z.spots.length || !free(i)) i = z.spots.findIndex((_s, k) => free(k)); if (i < 0) i = Math.max(0, Math.min(z.spots.length - 1, (h.n ?? 1) - 1));
                used.add(`${z.id}:${z.spots[i][0]},${z.spots[i][1]}`); moved.set(key, [z.spots[i][0], z.spots[i][1], i + 1]);
            }
            const [x, y, n] = moved.get(key)!; h.x = x; h.y = y; h.n = n;
        }
        if (moved.size) notes.push('The map of homes was redrawn: everyone keeps their home, at its new place on the map.');
    }
    // plans at places that are gone are called off
    const appts = (g as any).social?.appts as { place: string; state: string }[] | undefined;
    for (const a of appts ?? []) if ((a.state === 'set' || a.state === 'met') && !isPlace(g, w, a.place)) { a.state = 'cancelled'; notes.push('A plan at a place that is gone was called off.'); }
    return notes;
}

/* ---------- the check when a save is opened ---------- */

const later = (f: () => void) => setTimeout(f, 300);
export function checkSave(g: Save) {
    // made by a newer Mundi: play a copy, never write
    if (schemaOf(g) > SCHEMA) {
        SAVE.readOnly = true;
        SAVE.shadow.set(g, structuredClone(g));
        later(() => toast(`This save was made with a newer version of Mundi (save format ${schemaOf(g)}; this version knows up to ${SCHEMA}). It opens read-only: nothing you do now is saved. Update Mundi to keep playing it.`, 'warn'));
        return;
    }
    let changed = false;
    const did = migrate(g);
    if (did) changed = true;
    const w = getWorld(g.world);
    if (w) {
        const probe = structuredClone(g);
        const notes = repair(probe, w);   // first on a copy: back up only if something will change
        if (JSON.stringify(probe) !== JSON.stringify(g)) {
            if (!did) backup(g, 'before repairing links to the world');
            repair(g, w);
            changed = true;
            if (notes.length) later(() => toast(`This world changed since your last visit. ${notes.join(' ')} A backup of the save was kept (Settings → Game → This save).`, 'info'));
        }
    }
    if (changed) ctx().saveMetadataDebounced();
}
SAVE.hooks.push(checkSave);
