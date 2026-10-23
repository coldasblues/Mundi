import { settings } from './store.js';
// The world format. A world is pure data (worlds/<id>/world.json); Mundi's systems read it.
// Everything a world can configure is declared here, so this file is also the format's documentation.

export interface Period { id: string; name: string; from: number }
/** A map. `parent`: the bigger map it sits in (a city inside a region); `minutesPerUnit`: travel speed on it. */
export interface MapDef { id: string; name: string; image: string; ratio: number; parent?: string; minutesPerUnit?: number }
export interface Place {
    id: string; name: string; map: string; x: number; y: number;
    tags?: string[]; desc?: string; event?: string; bg?: string;
    /** A pin that opens another map (a city on the region map) instead of being a place. */
    link?: string;
}
export interface HomeZone {
    id: string; name: string; map: string; kind: string; rent: number; desc?: string;
    spots: [number, number][];
}
export interface StatusDef {
    id: string; name: string; icon: string; color: string; start: number; max: number; hud?: boolean;
    /** `rpg`: only in the RPG game mode (health…); `off`: turned off in a Custom world. */
    rpg?: boolean; off?: boolean;
    decay?: { amount: number; everyMinutes: number; awakeOnly?: boolean };
    zero?: {
        text?: string; place?: string; cost?: number; restore?: number;
        drain?: { status: string; amount: number; everyMinutes: number };
    };
}
export interface ActionDef {
    id: string; name: string; label: string; icon?: string; cost: number; minutes: number;
    tags?: string[]; place?: string; home?: boolean; anywhere?: boolean;
    effects: Record<string, number>;
    /** A one-click skill action (fishing, fixing something): an invisible d20 roll + trait bonuses against `dc`.
     *  Time and the base effects always apply; then `success` or `fail` adds its own effects and money. */
    roll?: { dc: number; traits?: string[]; success: RollOutcome; fail: RollOutcome };
}
export interface RollOutcome { text: string; money?: number; effects?: Record<string, number> }
export interface Attribute { id: string; name: string; desc?: string }
export interface TraitGroup { id: string; label: string; max: number; options: string[] }
export interface Origin {
    id: string; name: string; desc?: string; money: number; home?: string; knows?: number;
    attributes?: Record<string, number>;
}
export interface Rank { name: string; pay: number }
export interface Occupation {
    id: string; name: string; place: string; ranks: Rank[]; shift: number;
    cost?: Record<string, number>; requires?: Record<string, number>;
    /** Traits that make promotions faster; `needs`: one of these traits is required to be hired. */
    likes?: string[]; needs?: string[];
    /** Opening hours [from, to) and shifts needed at each rank before the next. */
    hours?: [number, number]; promote?: number[];
}
export type RoutineStep = [number, string];   // [hour, 'home' | 'work' | 'leisure' | placeId]
export interface Routine { weekday: RoutineStep[]; weekend: RoutineStep[] }
export interface ExampleCharacter {
    name: string; age: number; occupation: string | null; home: string; routine: string; leisure?: string[];
    description: string; first_mes?: string; personality?: string;
    /** The world whose card this is (a copied world reuses the original's cards instead of making new ones). */
    from?: string;
}
export const exampleTag = (w: WorldDef, ex: ExampleCharacter) => `${ex.from ?? w.id}:${ex.name}`;
/** A phone app: which one (`id`), and how it is called and looks in this world. */
export interface AppDef { id: string; name: string; icon: string; color: string; on: boolean }
export interface LoreEntry { keys: string[]; content: string; constant?: boolean }

export interface WorldDef {
    format: 1;
    id: string; name: string; kind: string; version: string; description: string; setting: string;
    cover?: string;
    music?: Record<string, string>;
    /** `tiers`: coins of several metals (1 gold = 10 silver = 100 copper); amounts are counted in the smallest. */
    currency: { name: string; symbol: string; tiers?: { symbol: string; value: number }[] };
    /** The style it is built on (modern, medieval…): the look of the game and the base the world creator copies. */
    style?: string;
    /** The game mode: Life-Sim (daily life, the base), RPG (adds health, and later factions, missions and fights)
     *  or Custom (each system turned on or off in the creator). The style only sets the look and the words. */
    mode?: GameMode;
    time: { startDay: number; startMinutes: number; speed: number; periods: Period[] };
    travel: { minutesPerUnit: number; round: number[]; sameMap: number };
    maps: MapDef[];
    places: Place[];
    /** `bills`: water, power… charged with the rent (each kind of home its own amounts). */
    homes: { zones: HomeZone[]; kinds: Record<string, { name: string; desc: string; image?: string; bills?: Record<string, number> }> };
    statuses: StatusDef[];
    actions: ActionDef[];
    sleep: { until: number; restore: Record<string, number>; homeOnly?: boolean };
    rent?: { everyDays: number; text?: string };
    sheet: {
        fields: string[];
        age?: { min: number; max: number; default: number };
        appearance?: { id: string; label: string; options: string[] }[];
        attributes?: { points: number; min: number; max: number; list: Attribute[] };
        /** Ready-made descriptions the player picks (e.g. Proficiency: strong, smart), up to `max` each. */
        traits?: TraitGroup[];
    };
    catalogs: { origins?: Origin[]; [name: string]: unknown };
    occupations: Occupation[];
    cast: { routineTemplates: Record<string, Routine>; examples: ExampleCharacter[] };
    lore: LoreEntry[];
    /** SillyTavern lorebooks this world uses (switched on while one of its games is open). */
    lorebooks?: string[];
    /** The Author's Note every new game of this world starts with. */
    note?: { text: string; depth?: number; interval?: number; position?: number };
    /** What the world has: a phone (modern), a journal (medieval)… and which systems are on. */
    features?: { phone?: boolean; device?: string; apps?: AppDef[]; jobs?: boolean; plans?: boolean };
    /** Set by the loader: the folder URL the world's files live in. */
    base?: string;
    /** Set by the loader: the world's own interface translations (worlds/<id>/lang/<lang>.json). */
    i18n?: Record<string, Record<string, string>>;
}

const registry = new Map<string, WorldDef>();
export const BUILT_IN = ['modern', 'medieval'];
export type GameMode = 'lifesim' | 'rpg' | 'custom';
export const GAME_MODES: { id: GameMode; name: string; desc: string; soon?: boolean }[] = [
    { id: 'lifesim', name: 'Life-Sim', desc: 'Daily life: work, home and bills, friends and love. Needs: energy, hunger, thirst, mood and hygiene.' },
    { id: 'rpg', name: 'RPG', desc: 'Health, factions, missions, items and fights, on top of Life-Sim. Coming in the next update.', soon: true },
    { id: 'custom', name: 'Custom', desc: 'You choose each system: which needs exist, the phone, jobs, plans.' },
];
export const gameMode = (w: WorldDef | null | undefined): GameMode => w?.mode ?? 'lifesim';
// The needs in play: RPG-only ones (health) stay out of Life-Sim; a Custom world can turn any of them off.
export const activeStatuses = (w: WorldDef) => w.statuses.filter(s => !s.off && !(s.rpg && gameMode(w) === 'lifesim'));
export const styleOf = (w: WorldDef | null | undefined) => (w?.style ?? ((w?.kind || '').toLowerCase().includes('modern') ? 'modern' : (w?.kind || 'modern').toLowerCase()));

// Worlds made with the world creator: saved as a JSON file in SillyTavern's user files (user/files/), listed in
// Mundi's settings. Their pictures are files there too; built-in pictures they reuse are absolute URLs.
export interface CustomWorld { id: string; name: string; kind: string; file: string; updated: number }
export const customWorlds = (): CustomWorld[] => ((settings() as any).customWorlds ??= []);
export const isCustom = (id: string) => customWorlds().some(c => c.id === id);
export const builtInIds = () => BUILT_IN;
export function registerWorld(w: WorldDef) { registry.set(w.id, w); }
export function forgetWorld(id: string) { registry.delete(id); }

// Loads a world: a bundled one (worlds/<id>/world.json, next to the extension) or one made with the creator.
export async function loadWorld(id: string): Promise<WorldDef> {
    const hit = registry.get(id);
    if (hit) return hit;
    const custom = customWorlds().find(c => c.id === id);
    if (custom) {
        const res = await fetch(`/${custom.file}?t=${custom.updated}`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`World "${custom.name}" could not be loaded.`);
        const w = (await res.json()) as WorldDef;
        w.base = new URL('/', location.href).href;
        w.i18n = {};
        registry.set(id, w);
        return w;
    }
    const base = new URL(`../../worlds/${id}/`, import.meta.url).href;
    const res = await fetch(`${base}world.json`);
    if (!res.ok) throw new Error(`World "${id}" could not be loaded.`);
    const w = (await res.json()) as WorldDef;
    w.base = base;
    w.i18n = {};
    registry.set(id, w);
    return w;
}

export const worlds = () => [...registry.values()];
export const loadAllWorlds = () => Promise.all([...BUILT_IN, ...customWorlds().map(c => c.id)].map(id => loadWorld(id).catch(e => console.warn('[Mundi] world', id, e))));
export const getWorld = (id: string) => registry.get(id) ?? null;
export const worldFile = (w: WorldDef, file?: string) => { try { return file ? new URL(String(file), w.base).href : ''; } catch { return ''; } };

/* ---------- values from a world file, made safe for the page ---------- */
// A world file can come from anyone (Import a world). Its pictures and its numbers end up in style attributes, so a
// picture address must not be able to end the url() or the attribute, and a coordinate must be a number.

/** A number from a world file ("x": "50", or something worse): finite, or the fallback. */
export const num = (v: unknown, fallback = 0): number => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : fallback; };
/**
 * A picture address as a CSS url(): only http(s), blob:, data:image and paths are allowed, and every character that
 * could end the url() or break out of an attribute is percent-encoded. '' for anything else.
 */
export function cssUrl(u: unknown): string {
    const s = String(u ?? '').trim();
    if (!s) return '';
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s)?.[1]?.toLowerCase();
    if (scheme && !['http', 'https', 'blob', 'data'].includes(scheme)) return '';
    if (scheme === 'data' && !/^data:image\/[a-z0-9.+-]+[;,]/i.test(s)) return '';
    return `url("${s.replace(/["'()\\<>\s]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)}")`;
}
/** "background-image:url(…)" for one of a world's pictures, or ''. */
export const bgOf = (w: WorldDef, file?: string) => { const u = cssUrl(worldFile(w, file)); return u ? `background-image:${u}` : ''; };

// A world that cannot be played yet (Medieval and RPG worlds wait for the next update).
export const worldLocked = (w: WorldDef | null | undefined) => !!w && (styleOf(w) === 'medieval' || gameMode(w) === 'rpg');
