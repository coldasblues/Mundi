// The world creator's data side: a new world starts as a copy of a base world (Porto Alto for Modern) or as
// that style's rules with an empty map; it is saved as a JSON file in SillyTavern's user files; it can be
// exported (with its pictures inside) and imported back.
import { settings, saveSettings } from '../core/store.js';
import { loadWorld, getWorld, worldFile, customWorlds, registerWorld, forgetWorld, appsOf, systemOn, type WorldDef, type SystemId } from '../core/world.js';
import { uploadUserFile, deleteUserFile } from '../st/bridge.js';
import { uiLang } from '../core/i18n.js';

// The phone's apps live in core/world.ts (the Lexicon names them too); re-exported here for the creator.
export { DEFAULT_APPS, appsOf } from '../core/world.js';
export const featureOn = (w: WorldDef, f: SystemId) => systemOn(w, f);

// Fields whose text is shown to people (translated when a world is copied in another language).
const TEXT = new Set(['name', 'label', 'desc', 'description', 'setting', 'text', 'event', 'content']);
const LISTS = new Set(['options', 'likes', 'needs', 'keys']);
function translateDeep(v: any, dict: Record<string, string>, key = ''): any {
    if (typeof v === 'string') return TEXT.has(key) || LISTS.has(key) ? dict[v] ?? v : v;
    if (Array.isArray(v)) return v.map(x => translateDeep(x, dict, LISTS.has(key) ? key : ''));
    if (v && typeof v === 'object') { const o: any = {}; for (const [k, x] of Object.entries(v)) o[k] = translateDeep(x, dict, k); return o; }
    return v;
}
// A built-in world's pictures and music become absolute URLs, so the copy still finds them.
function absolutize(w: WorldDef, src: WorldDef) {
    const abs = (f?: string) => (f ? worldFile(src, f) : f);
    w.cover = abs(w.cover);
    if (w.music) for (const k of Object.keys(w.music)) w.music[k] = abs(w.music[k])!;
    const absAll = (o?: Record<string, string>) => { if (o) for (const k of Object.keys(o)) o[k] = abs(o[k])!; };
    for (const m of w.maps) { m.image = abs(m.image)!; absAll(m.images); }
    for (const k of Object.values(w.homes.kinds)) { if (k.image) k.image = abs(k.image); absAll(k.images); }
    for (const p of w.places) { if (p.bg) p.bg = abs(p.bg); absAll(p.bgs); }
    for (const f of w.plan?.floors ?? []) { if (f.image) f.image = abs(f.image); absAll(f.images); }
}

export const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'world';
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// A new world: a full copy of the base (map, places, people, jobs…) or its rules only (empty map).
export async function newWorldFrom(baseId: string, mode: 'copy' | 'empty', name: string): Promise<WorldDef> {
    const src = await loadWorld(baseId);
    const dict = src.i18n?.[uiLang()] ?? {};
    const raw = structuredClone({ ...src, base: undefined, i18n: undefined }) as WorldDef;
    const w = (uiLang() === 'en' ? raw : translateDeep(raw, dict)) as WorldDef;
    absolutize(w, src);
    w.id = newId(`w_${slug(name)}`);
    w.name = name.trim() || 'New world';
    w.version = '1';
    for (const ex of w.cast.examples) ex.from ??= src.id;   // the copy reuses the original's character cards
    w.features = { ...(w.features ?? {}), apps: appsOf(w).map(a => ({ ...a, name: dict[a.name] ?? a.name })) };
    if (mode === 'empty') {
        w.description = ''; w.setting = '';
        w.maps = []; w.places = []; w.homes.zones = [];
        w.occupations = []; w.cast.examples = []; w.lore = [];
        for (const o of w.catalogs.origins ?? []) delete o.home;
        for (const s of w.statuses) if (s.zero?.place) delete s.zero.place;
        w.cover = '';
    }
    w.base = new URL('/', location.href).href;
    w.i18n = {};
    return w;
}

// Saves the world (a new version of its file) and lists it in Mundi's settings.
export async function saveWorld(w: WorldDef): Promise<void> {
    const list = customWorlds();
    const old = list.find(c => c.id === w.id);
    const data = JSON.stringify({ ...w, base: undefined, i18n: undefined }, null, 1);
    const file = await uploadUserFile(`mundi-world-${w.id}.json`, data);
    const entry = { id: w.id, name: w.name, kind: w.kind, file, updated: Date.now() };
    if (old) Object.assign(old, entry); else list.push(entry);
    saveSettings();
    w.base = new URL('/', location.href).href; w.i18n = {};
    registerWorld(structuredClone(w));
}

export async function deleteWorld(id: string) {
    const list = customWorlds();
    const c = list.find(x => x.id === id);
    if (!c) return;
    const w = getWorld(id);
    // its own pictures go too (only files Mundi uploaded for it)
    const files = w ? assetsOf(w).filter(f => f.startsWith(`/user/files/mundi-${id}`)) : [];
    for (const f of [c.file, ...files.map(f => f.slice(1))]) await deleteUserFile(f);
    (settings() as any).customWorlds = list.filter(x => x.id !== id);
    saveSettings();
    forgetWorld(id);
}

// A picture for a world (map, cover, home): saved in user files, named after the world.
export async function uploadWorldPicture(w: WorldDef, file: Blob, what: string): Promise<string> {
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
    const path = await uploadUserFile(`mundi-${w.id}-${slug(what)}-${Date.now().toString(36)}.${ext}`, file);
    return `/${path}`;
}
export const imageRatio = (url: string) => new Promise<number>(ok => { const i = new Image(); i.onload = () => ok(+(i.naturalWidth / i.naturalHeight).toFixed(4) || 1.6); i.onerror = () => ok(1.6); i.src = url; });

function assetsOf(w: WorldDef): string[] {
    const parts = (o?: Record<string, string>) => Object.values(o ?? {});   // the pictures for each part of the day
    return [w.cover, ...Object.values(w.music ?? {}), ...w.maps.flatMap(m => [m.image, ...parts(m.images)]), ...Object.values(w.homes.kinds).flatMap(k => [k.image, ...parts(k.images)]), ...w.places.flatMap(p => [p.bg, ...parts(p.bgs)]), ...(w.plan?.floors ?? []).flatMap(f => [f.image, ...parts(f.images)])].filter((x): x is string => !!x);
}

/* ---------- export and import ---------- */

const toDataUrl = async (url: string) => {
    const b = await (await fetch(url)).blob();
    return await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(b); });
};
// One JSON file with everything inside: the world's own pictures are embedded (built-in ones stay as links).
export async function exportWorld(w: WorldDef): Promise<Blob> {
    const out = structuredClone({ ...w, base: undefined, i18n: undefined }) as any;
    const files: Record<string, string> = {};
    for (const f of assetsOf(w)) if (f.startsWith('/user/files/') && !files[f]) { try { files[f] = await toDataUrl(f); } catch { /* missing picture */ } }
    out.mundiFiles = files;
    return new Blob([JSON.stringify(out)], { type: 'application/json' });
}
export async function importWorld(text: string): Promise<WorldDef> {
    const data = JSON.parse(text);
    if (data?.format !== 1 || !Array.isArray(data.maps) || !data.time) throw new Error('This file is not a Mundi world.');
    const files: Record<string, string> = data.mundiFiles ?? {};
    delete data.mundiFiles;
    const w = data as WorldDef;
    const oldId = w.id;
    w.id = newId(`w_${slug(w.name)}`);
    let json = JSON.stringify(w);
    for (const [path, url] of Object.entries(files)) {
        // only the pictures and sounds an export carries inside it: a shared file must not make the browser fetch
        // addresses of its choosing (on the internet or your own network)
        if (typeof url !== 'string' || !/^data:(image|audio)\/[a-z0-9.+-]+(;[a-z0-9=.+-]+)*(;base64)?,/i.test(url)) continue;
        const blob = await (await fetch(url)).blob();
        const name = path.split('/').pop()!.replace(`mundi-${oldId}`, `mundi-${w.id}`);
        const saved = `/${await uploadUserFile(name, blob)}`;
        json = json.split(JSON.stringify(path).slice(1, -1)).join(saved);
    }
    const out = JSON.parse(json) as WorldDef;
    await saveWorld(out);
    return out;
}
