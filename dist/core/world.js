import { settings } from './store.js';
export const exampleTag = (w, ex) => `${ex.from ?? w.id}:${ex.name}`;
const registry = new Map();
export const BUILT_IN = ['modern', 'medieval'];
export const GAME_MODES = [
    { id: 'lifesim', name: 'Life-Sim', desc: 'Daily life: work, home and bills, friends and love. Needs: energy, hunger, thirst, mood and hygiene.' },
    { id: 'rpg', name: 'RPG', desc: 'Health, factions, missions, items and fights, on top of Life-Sim. Coming in the next update.', soon: true },
    { id: 'custom', name: 'Custom', desc: 'You choose each system: which needs exist, the phone, jobs, plans.' },
];
export const gameMode = (w) => w?.mode ?? 'lifesim';
// The needs in play: RPG-only ones (health) stay out of Life-Sim; a Custom world can turn any of them off.
export const activeStatuses = (w) => w.statuses.filter(s => !s.off && !(s.rpg && gameMode(w) === 'lifesim'));
export const styleOf = (w) => (w?.style ?? ((w?.kind || '').toLowerCase().includes('modern') ? 'modern' : (w?.kind || 'modern').toLowerCase()));
export const customWorlds = () => (settings().customWorlds ??= []);
export const isCustom = (id) => customWorlds().some(c => c.id === id);
export const builtInIds = () => BUILT_IN;
export function registerWorld(w) { registry.set(w.id, w); }
export function forgetWorld(id) { registry.delete(id); }
// Loads a world: a bundled one (worlds/<id>/world.json, next to the extension) or one made with the creator.
export async function loadWorld(id) {
    const hit = registry.get(id);
    if (hit)
        return hit;
    const custom = customWorlds().find(c => c.id === id);
    if (custom) {
        const res = await fetch(`/${custom.file}?t=${custom.updated}`, { cache: 'no-cache' });
        if (!res.ok)
            throw new Error(`World "${custom.name}" could not be loaded.`);
        const w = (await res.json());
        w.base = new URL('/', location.href).href;
        w.i18n = {};
        registry.set(id, w);
        return w;
    }
    const base = new URL(`../../worlds/${id}/`, import.meta.url).href;
    const res = await fetch(`${base}world.json`);
    if (!res.ok)
        throw new Error(`World "${id}" could not be loaded.`);
    const w = (await res.json());
    w.base = base;
    w.i18n = {};
    registry.set(id, w);
    return w;
}
export const worlds = () => [...registry.values()];
export const loadAllWorlds = () => Promise.all([...BUILT_IN, ...customWorlds().map(c => c.id)].map(id => loadWorld(id).catch(e => console.warn('[Mundi] world', id, e))));
export const getWorld = (id) => registry.get(id) ?? null;
export const worldFile = (w, file) => { try {
    return file ? new URL(String(file), w.base).href : '';
}
catch {
    return '';
} };
/* ---------- values from a world file, made safe for the page ---------- */
// A world file can come from anyone (Import a world). Its pictures and its numbers end up in style attributes, so a
// picture address must not be able to end the url() or the attribute, and a coordinate must be a number.
/** A number from a world file ("x": "50", or something worse): finite, or the fallback. */
export const num = (v, fallback = 0) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : fallback; };
/**
 * A picture address as a CSS url(): only http(s), blob:, data:image and paths are allowed, and every character that
 * could end the url() or break out of an attribute is percent-encoded. '' for anything else.
 */
export function cssUrl(u) {
    const s = String(u ?? '').trim();
    if (!s)
        return '';
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s)?.[1]?.toLowerCase();
    if (scheme && !['http', 'https', 'blob', 'data'].includes(scheme))
        return '';
    if (scheme === 'data' && !/^data:image\/[a-z0-9.+-]+[;,]/i.test(s))
        return '';
    return `url("${s.replace(/["'()\\<>\s]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)}")`;
}
/** "background-image:url(…)" for one of a world's pictures, or ''. */
export const bgOf = (w, file) => { const u = cssUrl(worldFile(w, file)); return u ? `background-image:${u}` : ''; };
// A world that cannot be played yet (Medieval and RPG worlds wait for the next update).
export const worldLocked = (w) => !!w && (styleOf(w) === 'medieval' || gameMode(w) === 'rpg');
