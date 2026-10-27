import { settings, game } from './store.js';
import { upgradeWorld, presetOf, PRESETS } from './presets.js';
// Roles a place can have. A place with its own list uses only that list; one without is guessed from its name, so
// older worlds keep working and any world can set them in the map editor.
export const PLACE_ROLES = [
    { id: 'healer', name: 'Healer or hospital', re: /heal|hospital|infirm|mending|balm|apothec|doctor/i },
    { id: 'shrine', name: 'Shrine or temple (prayers, rituals)', re: /temple|chapel|church|shrine|cathedral|monaster|altar|circle/i },
    { id: 'tavern', name: 'Tavern or bar (rumors and clues)', re: /tavern|inn|mead|mug|goose|dog|plough|lantern|camel|mermaid|torch|pickaxe|caf[eé]|\bbar\b|pub|club/i },
    { id: 'hire', name: 'Companions for hire', re: /tavern|inn|barrack|guild|plough|saltdog|fort|\bbar\b|pub|club/i },
    { id: 'contracts', name: 'Contracts board', re: /guild|lodge|hunter|board/i },
    { id: 'guarded', name: 'Guarded (wanted people are stopped)', re: /guard|barrack|police|customs|fort|station|gate|castle|palace|civic|jarl|watch|square|market|bazaar/i },
    { id: 'jail', name: 'Jail', re: /barrack|fort|castle|jarl|palace|civic|police|guard/i },
    { id: 'blackmarket', name: 'Black market (night auctions)', re: /dock|bazaar|warehouse|black|underground|industrial/i },
];
export const guessRoles = (p) => PLACE_ROLES.filter(r => r.re.test(`${p.id} ${p.name}`) || (p.tags ?? []).includes(r.id)).map(r => r.id);
export const placeIs = (p, role) => !!p && (p.roles ? p.roles.includes(role) : guessRoles(p).includes(role));
export function career(o, path = []) {
    const branches = [...(o.branches ?? [])].filter(b => b.at > 0 && b.options?.length).sort((a, b) => a.at - b.at);
    const first = branches[0];
    const ranks = first ? o.ranks.slice(0, first.at) : [...o.ranks];
    const promote = (o.promote ?? []).slice(0, Math.max(0, ranks.length - 1));
    const likesOf = [...(o.likes ?? [])];
    const pad = () => { while (promote.length < ranks.length - 1)
        promote.push((promote.at(-1) ?? 4) + 3); };
    pad();
    let i = 0;
    for (const b of branches) {
        if (ranks.length < b.at)
            break; // not reached (the job has fewer ranks than this branch)
        ranks.length = b.at;
        promote.length = Math.min(promote.length, b.at - 1);
        pad();
        const offered = b.options.filter(x => !x.after?.length || x.after.some(a => path.includes(a)));
        const pick = offered.find(x => x.id === path[i]);
        if (!pick)
            return { ranks, promote, likes: likesOf, open: offered.length ? { ...b, options: offered } : null, options: offered };
        for (const [k, r] of pick.ranks.entries()) {
            ranks.push(r);
            promote.push(pick.promote?.[k] ?? (promote.at(-1) ?? 4) + 3);
        }
        likesOf.push(...(pick.likes ?? []));
        i++;
    }
    return { ranks, promote, likes: likesOf, open: null, options: [] };
}
export const exampleTag = (w, ex) => `${ex.from ?? w.id}:${ex.name}`;
// The phone's apps, as the Modern style has them (a world can rename them, change icons or turn them off).
export const DEFAULT_APPS = [
    { id: 'messages', name: 'Messages', icon: 'chat', color: '#34c759', on: true },
    { id: 'people', name: 'People', icon: 'users', color: '#ff9f0a', on: true },
    { id: 'jobs', name: 'Jobs', icon: 'briefcase', color: '#0a84ff', on: true },
    { id: 'bank', name: 'Bank', icon: 'wallet', color: '#5e5ce6', on: true },
    { id: 'homes', name: 'Homes', icon: 'home', color: '#ff375f', on: true },
    { id: 'social', name: 'Chirp', icon: 'at', color: '#1d9bf0', on: true },
    { id: 'dating', name: 'Spark', icon: 'flame', color: '#ff4f6d', on: true },
    { id: 'plans', name: 'Calendar', icon: 'calendar', color: '#ff9500', on: true },
    { id: 'journal', name: 'Journal', icon: 'book', color: '#8e6cf0', on: true },
    { id: 'shop', name: 'Shop', icon: 'wallet', color: '#16c79a', on: true },
    { id: 'goals', name: 'Goals', icon: 'star', color: '#ffb02e', on: true },
    { id: 'sheet', name: 'Character', icon: 'user', color: '#e0533f', on: true, rpg: true },
    { id: 'quests', name: 'Quests', icon: 'map', color: '#c08a2e', on: true, rpg: true },
    { id: 'grimoire', name: 'Grimoire', icon: 'sparkles', color: '#7b5cff', on: true, rpg: true },
    { id: 'party', name: 'Party', icon: 'users', color: '#b5562b', on: true, rpg: true },
    { id: 'standing', name: 'Reputation', icon: 'crown', color: '#c9a227', on: true },
    { id: 'pets', name: 'Animals', icon: 'heart', color: '#e58a4e', on: true },
    { id: 'factions', name: 'Factions', icon: 'crown', color: '#6b4fd8', on: true },
    { id: 'assets', name: 'Holdings', icon: 'wallet', color: '#2f9e6b', on: true },
    { id: 'tower', name: 'Tower', icon: 'up', color: '#7a3db8', on: true, rpg: true },
    { id: 'contracts', name: 'Contracts', icon: 'pin', color: '#a8452c', on: true, rpg: true },
    { id: 'workshop', name: 'Recipes', icon: 'gear', color: '#8a6d3b', on: true },
    { id: 'trophies', name: 'Trophies', icon: 'star', color: '#d4a017', on: true, rpg: true },
    { id: 'blade', name: 'Weapon', icon: 'bolt', color: '#4a6fa5', on: true, rpg: true },
    { id: 'soulbond', name: 'Soul bond', icon: 'sparkles', color: '#9b59b6', on: true },
    { id: 'health', name: 'Health', icon: 'pulse', color: '#d64550', on: true },
];
export const appsOf = (w) => {
    const own = w.features?.apps ?? [];
    return DEFAULT_APPS.map(d => ({ ...d, ...(own.find(a => a.id === d.id) ?? {}) }));
};
// The apps the player sees: on in the world, and their system on too.
// A scenario's phone is smaller: one house, so no moving, holdings, factions or reputation per region.
export const SCENARIO_APPS_OFF = ['homes', 'assets', 'factions', 'standing', 'social', 'dating', 'workshop', 'jobs', 'bank', 'shop', 'goals'];
/** Systems a scenario never has: no neighbors (everyone lives in the house), no social network, no crafting. */
// Home (a scenario): a simpler world made for role-play with your characters in one house. Work, money, courses,
// the economy and the like are gone; what is left is the house, the people, love and plans.
export const SCENARIO_SYSTEMS_OFF = ['neighbors', 'social', 'crafting', 'events', 'jobs', 'courses', 'shop', 'consults', 'rumors', 'goals', 'habits',
    'trade', 'farming', 'dice', 'factions', 'institutions', 'property', 'banks', 'auctions', 'taxes', 'ecology', 'mounts', 'prison', 'trophies', 'identity',
    'mentors', 'letters', 'legends', 'festivals', 'hobbies', 'reputation', 'bills', 'breakdowns', 'living'];
// Life-Sim keeps to daily life: no groups to join, property to run or recipes to craft (those come with the RPG mode).
export const LIFESIM_APPS_OFF = ['factions', 'assets', 'workshop'];
export const appsShown = (w) => appsOf(w).filter(a => a.on && !(isScenario(w) && SCENARIO_APPS_OFF.includes(a.id)) && !(gameMode(w) === 'lifesim' && LIFESIM_APPS_OFF.includes(a.id)) && (!appSystem(a.id) || systemOn(w, appSystem(a.id))) && (!DEFAULT_APPS.find(d => d.id === a.id)?.rpg || (gameMode(w) === 'rpg' && !!w.rpg?.classes?.length)));
const registry = new Map();
export const BUILT_IN = ['modern', 'urban', 'medieval', 'house', 'manor'];
// The RPG mode waits for a later update: while this is on, nothing of it can be chosen, made or played. Worlds made
// for it are shown locked, any other world plays as Life-Sim, and its systems stay off. Turn it off to bring it back.
export const RPG_LOCKED = !globalThis.__MUNDI_RPG; // the tests turn it on (tests/env.mjs)
export const RPG_NOTE = 'The RPG mode comes in a later update.';
// The medieval style is locked for this release too: its worlds show "Soon" and it cannot be picked in the creator.
export const MEDIEVAL_LOCKED = !globalThis.__MUNDI_MEDIEVAL; // the tests turn it on (tests/env.mjs)
export const GAME_MODES = [
    { id: 'lifesim', name: 'Life-Sim', desc: 'Daily life: work, home and bills, friends and love. Needs: energy, hunger, thirst, mood and hygiene.' },
    { id: 'rpg', soon: RPG_LOCKED, name: 'RPG', desc: 'Life-Sim plus a character sheet: level, hit points, focus, attributes, a class and subclass, d20 checks, quests, titles, magic and long journeys. Needs the world\'s RPG (RPG tab).' },
    { id: 'custom', name: 'Custom', desc: 'You choose each system: which needs exist, the phone, jobs, plans.' },
];
// The game mode: the open game's own (a world with an RPG can be played as Life-Sim or RPG), else the world's.
export const gameMode = (w) => {
    const g = w ? game() : null;
    const own = g && g.world === w.id ? g.cfg?.mode : undefined;
    if (isScenario(w))
        return 'lifesim'; // a scenario is always Life-Sim (realistic or fantasy)
    const m = own ?? w?.mode ?? 'lifesim';
    return RPG_LOCKED && m === 'rpg' ? 'lifesim' : m;
};
// The needs in play: RPG-only ones (health) stay out of Life-Sim; a Custom world can turn any of them off, and with
// the needs system off only the RPG ones (health) are left.
export const activeStatuses = (w) => w.statuses.filter(s => !s.off && !(s.rpg && gameMode(w) === 'lifesim') && (s.rpg || systemOn(w, 'needs')));
export const WORLD_TAGS = [
    { id: 'lifesim', name: 'Life-Sim', desc: 'can be played as a life: needs, work, home, people.' },
    { id: 'rpg', name: 'RPG', desc: 'can be played as an adventure: a class, checks, fights and quests.' },
    { id: 'realistic', name: 'Realistic', desc: 'no magic or gods: martial arts, technology, the street.' },
    { id: 'fantasy', name: 'Fantasy', desc: 'magic, gods, familiars and weapons with a soul.' },
];
// A world's tags; a world from before tags gets them from what it has (its RPG, its gods, its style).
export const worldTags = (w) => (RPG_LOCKED ? allTags(w).filter(t => t !== 'rpg') : allTags(w));
export const allTags = (w) => {
    if (!w)
        return [];
    if (w.tags?.length)
        return isScenario(w) ? w.tags.filter(t => t !== 'rpg') : w.tags;
    const t = [];
    if (w.mode !== 'rpg')
        t.push('lifesim');
    if (w.mode === 'rpg' || w.rpg?.classes?.length)
        t.push('rpg');
    t.push(styleOf(w) === 'modern' && !w.realm?.pantheon?.length ? 'realistic' : 'fantasy');
    return t;
};
export const madeFor = (w) => w.madeFor ?? (w.mode === 'rpg' ? 'rpg' : 'lifesim');
export const hasTag = (w, t) => worldTags(w).includes(t);
export const SYSTEMS = [
    { id: 'living', name: 'Living world', desc: 'places are never busier or emptier, and no region changes its mood, tension or prices.', apps: [], blocks: ['world'] },
    { id: 'needs', name: 'Needs', desc: 'no hunger, energy, thirst, mood or hygiene to look after (health, in RPG, stays).', apps: [], blocks: ['needs'] },
    { id: 'jobs', name: 'Jobs and promotions', desc: 'nobody works, not even you; no jobs anywhere.', apps: ['jobs'], blocks: [] },
    { id: 'bills', name: 'Rent and bills', desc: 'homes are free and nothing is ever cut off.', apps: [], blocks: [] },
    { id: 'courses', name: 'Courses', desc: 'no courses to take; jobs do not ask for any.', apps: [], blocks: [] },
    { id: 'shop', name: 'Shop', desc: 'nothing to buy for your home.', apps: ['shop'], blocks: [] },
    { id: 'breakdowns', name: 'Things break at home', desc: 'nothing at home ever breaks.', apps: [], blocks: [] },
    { id: 'plans', name: 'Plans', desc: 'no meet-ups, dates, "come with me" or invitations.', apps: ['plans'], blocks: ['plans'] },
    { id: 'romance', name: 'Romance', desc: 'only friendship: no dating, love, engagement or marriage.', apps: ['dating'], blocks: ['couples'] },
    { id: 'family', name: 'Children', desc: 'no babies (children already born stay).', apps: [], blocks: [], needs: 'romance' },
    { id: 'social', name: 'Social network', desc: 'no posts, likes or notices.', apps: ['social'], blocks: [] },
    { id: 'neighbors', name: 'Neighbors', desc: 'nobody from your area knocks at your door. (Needs at least 2 of the world\'s people living in your area.)', apps: [], blocks: [] },
    { id: 'consults', name: 'Advice and life events', desc: 'friends do not ask your advice, and you do not hear of birthdays, promotions or weddings.', apps: [], blocks: [] },
    { id: 'rumors', name: 'Rumors', desc: 'people do not gossip about what you do.', apps: [], blocks: ['rumors'] },
    { id: 'diary', name: 'Diary', desc: 'no diary written when you sleep, and none sent to the AI (the notes of each day stay).', apps: [], blocks: ['diary'] },
    { id: 'goals', name: 'Life goals', desc: 'no life goal to chase.', apps: ['goals'], blocks: [] },
    { id: 'habits', name: 'Habits become traits', desc: 'what you do often never becomes part of who you are.', apps: [], blocks: [] },
    { id: 'reputation', name: 'Reputation', desc: 'no reputation per region (and it never fades).', apps: ['standing'], blocks: [] },
    { id: 'identity', name: 'Secret identity', desc: 'no alter ego or disguise.', apps: [], blocks: [] },
    { id: 'pets', name: 'Pets and familiars', desc: 'no animals to keep.', apps: ['pets'], blocks: [] },
    { id: 'mentors', name: 'Apprentices', desc: 'you cannot take an apprentice.', apps: [], blocks: [] },
    { id: 'letters', name: 'Letters from afar', desc: 'friends in other towns never write, and distance never cools a friendship.', apps: [], blocks: [] },
    { id: 'festivals', name: 'Festivals', desc: 'no festivals in the calendar.', apps: [], blocks: [] },
    { id: 'events', name: 'City events', desc: 'no shows, matches or fairs in the city calendar.', apps: [], blocks: [] },
    { id: 'hobbies', name: 'Hobbies', desc: 'practice never levels up a hobby (guitar, painting…), and no job asks for one.', apps: [], blocks: [] },
    { id: 'factions', name: 'Factions and guilds', desc: 'no guilds, orders, gangs or kingdoms to join or lead.', apps: ['factions'], blocks: [] },
    { id: 'legends', name: 'Legends', desc: 'your deeds never become tales that travel and grow.', apps: [], blocks: [] },
    { id: 'talents', name: 'Talent trees', desc: 'no talents to choose when you level up (RPG).', apps: [], blocks: [], tag: 'rpg' },
    { id: 'institutions', name: 'Schools and academies', desc: 'no schools to enroll in, no exams or clubs.', apps: [], blocks: [] },
    { id: 'trade', name: 'Trade and smuggling', desc: 'no goods to buy and sell between towns, no contraband.', apps: [], blocks: [] },
    { id: 'property', name: 'Property and businesses', desc: 'you cannot buy houses to rent out or open a business.', apps: ['assets'], blocks: [] },
    { id: 'banks', name: 'Banks and moneylenders', desc: 'nobody lends money.', apps: [], blocks: [] },
    { id: 'farming', name: 'Growing things', desc: 'nothing to plant at home.', apps: [], blocks: [] },
    { id: 'auctions', name: 'Black market auctions', desc: 'no auctions of rare things.', apps: [], blocks: [] },
    { id: 'taxes', name: 'Taxes', desc: 'nobody collects taxes.', apps: [], blocks: [] },
    { id: 'skies', name: 'Celestial events and extreme weather', desc: 'no eclipses, storms of mana, blizzards or heatwaves.', apps: [], blocks: [] },
    { id: 'ecology', name: 'Living ecology', desc: 'hunting never changes the animals of a region.', apps: [], blocks: [] },
    { id: 'debuffs', name: 'Debuffs', desc: 'no poisons, curses, blindness or silence.', apps: [], blocks: [], tag: 'rpg' },
    { id: 'injuries', name: 'Long-term injuries', desc: 'no broken bones or deep wounds after a defeat.', apps: ['health'], blocks: [], tag: 'rpg' },
    { id: 'fatigue', name: 'Arcane fatigue', desc: 'spells never strain you.', apps: [], blocks: [], tag: 'fantasy' },
    { id: 'elements', name: 'Elements and weather', desc: 'fire, water and lightning are all the same, rain or shine.', apps: [], blocks: [] },
    { id: 'mounts', name: 'Mounts', desc: 'no horses or other mounts to ride.', apps: [], blocks: [] },
    { id: 'prison', name: 'Crime and prison', desc: 'no stealing, arrests or prison.', apps: [], blocks: [] },
    { id: 'towers', name: 'Towers', desc: 'no endless towers to climb.', apps: ['tower'], blocks: [], tag: 'rpg' },
    { id: 'sentient', name: 'Sentient weapons', desc: 'no weapons with a will of their own.', apps: ['blade'], blocks: [], tag: 'fantasy' },
    { id: 'crafting', name: 'Crafting and gems', desc: 'nothing to craft, no gems to set.', apps: ['workshop'], blocks: [] },
    { id: 'trophies', name: 'Trophies', desc: 'no trophies from great foes.', apps: ['trophies'], blocks: [] },
    { id: 'contracts', name: 'Hunting contracts', desc: 'no contracts to hunt monsters and outlaws.', apps: ['contracts'], blocks: [], tag: 'rpg' },
    { id: 'soulbound', name: 'Soul bond', desc: 'you cannot bind your soul to a companion creature, mount or weapon.', apps: ['soulbond'], blocks: [], tag: 'fantasy' },
    { id: 'dice', name: '3D dice', desc: 'checks show no rolling die.', apps: [], blocks: [] },
    { id: 'pins', name: 'Pin a memory', desc: 'no button to turn a reply into a memory.', apps: [], blocks: [] },
    { id: 'faith', name: 'Divine favor', desc: 'no devotion or miracles, even with gods in the realm.', apps: [], blocks: [], tag: 'fantasy' },
];
export const systemOn = (w, id) => {
    if (!w)
        return true;
    if (w.features?.[id] === false)
        return false;
    if (isScenario(w) && SCENARIO_SYSTEMS_OFF.includes(id))
        return false;
    const d = SYSTEMS.find(x => x.id === id);
    // a system made for another kind of world starts off, but the world can turn it on (anything can be in any world)
    if (RPG_LOCKED && d?.tag === 'rpg')
        return false;
    if (d?.tag && !hasTag(w, d.tag) && w.features?.[id] !== true)
        return false;
    return !d?.needs || systemOn(w, d.needs);
};
// The system that owns an app or a prompt block (none: always there).
export const appSystem = (app) => SYSTEMS.find(x => x.apps.includes(app))?.id;
export const blockSystem = (block) => SYSTEMS.find(x => x.blocks.includes(block))?.id;
export const styleOf = (w) => (w?.style ?? ((w?.kind || '').toLowerCase().includes('modern') ? 'modern' : (w?.kind || 'modern').toLowerCase()));
export const customWorlds = () => (settings().customWorlds ??= []);
export const isCustom = (id) => customWorlds().some(c => c.id === id);
export const builtInIds = () => BUILT_IN;
export function registerWorld(w) { registry.set(w.id, upgradeWorld(w)); }
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
        registry.set(id, upgradeWorld(w));
        return w;
    }
    const base = new URL(`../../worlds/${id}/`, import.meta.url).href;
    const res = await fetch(`${base}world.json`);
    if (!res.ok)
        throw new Error(`World "${id}" could not be loaded.`);
    const w = (await res.json());
    w.base = base;
    w.i18n = {};
    registry.set(id, upgradeWorld(w));
    return w;
}
export const worlds = () => [...registry.values()];
export const SCENARIO_STARTS = [
    { id: 'moved', name: 'You just moved in', desc: 'You needed a room and took the last free one. Nobody here knows you yet.', premise: '{{user}} has just moved in, renting the last free room; nobody in the house knows {{user}} yet.', you: 'You have just moved in, renting the last free room; nobody in the house knows you yet.' },
    { id: 'host', name: 'Your house, your guests', desc: 'The house is yours, and these people are staying with you.', premise: 'The house belongs to {{user}}; the others are staying there as {{user}}\'s guests, under {{user}}\'s roof and rules.', you: 'The house is yours; the others are staying as your guests, under your roof and rules.', met: true, bond: 30, approval: 20 },
    { id: 'longtime', name: 'Together for a long time', desc: 'You have shared this house with them for years: everyone knows you, for better or worse.', premise: '{{user}} has lived in this house with the others for a long time; they all know {{user}} well, habits, history and all.', you: 'You have lived in this house with the others for a long time; they all know you well, habits, history and all.', met: true, bond: 45, approval: 30 },
    { id: 'custom', name: 'Custom', desc: 'Write your own premise, or let your AI write it from one or more lorebooks.', premise: '' },
];
/** In a scenario every job happens off-screen: you leave the house for the shift and come back. */
export const offScreenWork = (w) => isScenario(w);
export const isScenario = (w) => !!w?.scenario;
export const loadAllWorlds = () => Promise.all([...BUILT_IN, ...customWorlds().map(c => c.id)].map(id => loadWorld(id).catch(e => console.warn('[Mundi] world', id, e))));
export const getWorld = (id) => registry.get(id) ?? null;
// A world's short description is only for choosing it (it is never sent to the AI): kept short so the cards line up.
export const WORLD_DESC_MAX = 160;
export const shortDesc = (s) => { const t = String(s ?? '').trim(); return t.length <= WORLD_DESC_MAX ? t : `${t.slice(0, WORLD_DESC_MAX - 1).trimEnd()}…`; };
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
// How this world's device, social app and messages work, and how its people write (from the world; its style's
// preset fills them in when missing, see core/presets.ts).
const kinds = (w) => (w ? presetOf(w) : PRESETS.modern).kinds;
export const deviceLook = (w) => (w?.features?.deviceLook ?? kinds(w).deviceLook);
export const socialKind = (w) => (w?.features?.socialKind ?? kinds(w).socialKind);
export const messageKind = (w) => (w?.features?.messageKind ?? kinds(w).messageKind);
export const aiVoice = (w) => String(w?.ai?.voice ?? kinds(w).voice);
// A world that cannot be played yet (RPG worlds wait for the next update).
export const worldLocked = (w) => !!w && ((MEDIEVAL_LOCKED && styleOf(w) === 'medieval')
    || (((w.mode ?? 'lifesim') === 'rpg' || (RPG_LOCKED && w.madeFor === 'rpg')) && (RPG_LOCKED || !w.rpg?.classes?.length))); // an RPG world without its RPG, or a style coming later
// What a locked world is waiting for (its "Soon" badge).
export const lockedFor = (w) => (MEDIEVAL_LOCKED && styleOf(w) === 'medieval' ? 'Medieval' : 'RPG mode');
