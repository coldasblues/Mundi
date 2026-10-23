// Games and saves. A new game creates native SillyTavern objects: the cast's cards (when the world's example
// cast is used), the player's persona, the world's lorebook and a group chat. The save lives in that chat.
import { worldFile, cssUrl } from '../core/world.js';
import { DIFFICULTIES, type Difficulty } from './bills.js';
import { placeOf as placeOf2 } from './places.js';
import { TUT, settings as settings2 } from '../core/store.js';
import { note, placeName } from './facts.js';
import {
    settings, saveSettings, state, game, setGame, saveGame, notify, toast, type Save, type Resident, type GameEntry,
} from '../core/store.js';
import { loadWorld, getWorld, exampleTag, type WorldDef, type Origin } from '../core/world.js';
import { setWorldDicts } from '../core/tr.js';
import { lang } from '../core/i18n.js';
import {
    characters, charOf, createCharacter, createPersona, usePersona, createGroup, openGame, groupOf, clearGreetings,
    writeLorebook, bindChatLore, setPresent, saveMeta, chat, currentChatId, selectedGroup, pastChats,
    deleteChat, deleteGroup, setPersonaSheet, personaSheet, personaName, recentChats, ctx, deleteScenarioChat,
    saveName, copyGroupChat, groupChatId,
} from '../st/bridge.js';
import { playerHomeId } from './places.js';
import { presentAt } from './people.js';
import { sceneText, refreshPrompt } from './prompt.js';
import { liveTogether, setTie, normalizeHomes, type TieType, type TieTone } from './living.js';
import { applyGameLore } from './lore.js';

const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

// A square portrait with initials on a gradient (used when no image is chosen).
export function initialsAvatar(name: string, colors: [string, string]): Promise<Blob> {
    const c = document.createElement('canvas'); c.width = c.height = 400;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 400, 400); grad.addColorStop(0, colors[0]); grad.addColorStop(1, colors[1]);
    g.fillStyle = grad; g.fillRect(0, 0, 400, 400);
    g.fillStyle = 'rgba(255,255,255,.92)'; g.font = '700 170px "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase(), 200, 215);
    return new Promise(res => c.toBlob(b => res(b!), 'image/png'));
}
const PALETTE: [string, string][] = [['#ff7a9a', '#7a2e8f'], ['#3b82f6', '#6d28d9'], ['#f59e0b', '#b45309'], ['#10b981', '#065f46'], ['#ef4444', '#7f1d1d'], ['#8b5cf6', '#312e81'], ['#06b6d4', '#164e63'], ['#ec4899', '#831843']];

/* ---------- the player's character ---------- */

export interface Hero {
    name: string; age: number; appearance: Record<string, string>; origin: string;
    traits: Record<string, string[]>; bio: string; portrait: Blob | null;
}

export function heroDescription(w: WorldDef, h: Hero): string {
    const origin = w.catalogs.origins?.find(o => o.id === h.origin);
    const look = (w.sheet.appearance ?? []).map(a => h.appearance[a.id] ? `${a.label.toLowerCase()}: ${h.appearance[a.id].toLowerCase()}` : '').filter(Boolean).join(', ');
    const traits = (w.sheet.traits ?? []).map(t => (h.traits?.[t.id]?.length ? `${t.label}: ${h.traits[t.id].map(x => x.toLowerCase()).join(', ')}.` : '')).filter(Boolean);
    return [
        `{{user}} is ${h.name}, ${h.age}.`,
        look ? `Appearance: ${look}.` : '',
        origin ? `Background: ${origin.name} — ${origin.desc ?? ''}` : '',
        ...traits,
        h.bio.trim(),
    ].filter(Boolean).join('\n');
}

// What the persona was made from, kept inside the persona itself so the Library can show and edit it.
export interface PersonaSheet { world: string; name: string; age: number; appearance: Record<string, string>; origin: string; traits: Record<string, string[]>; bio: string }
export const sheetOf = (w: WorldDef, h: Hero): PersonaSheet => ({ world: w.id, name: h.name, age: h.age, appearance: { ...h.appearance }, origin: h.origin, traits: JSON.parse(JSON.stringify(h.traits ?? {})), bio: h.bio });

/* ---------- the cast ---------- */

// The world's example characters become real cards (created once, reused by later games).
async function exampleCards(w: WorldDef): Promise<string[]> {
    const out: string[] = [];
    let i = 0;
    for (const ex of w.cast.examples) {
        const tag = exampleTag(w, ex);
        const slugName = ex.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const byFile = new RegExp(`^mundi_(?:${[ex.from, w.id].filter(Boolean).map(x => String(x).replace(/[^a-z0-9_-]/gi, '')).join('|')})_${slugName}(?:_?\\d+)?\\.png$`, 'i');
        const found = characters().find(c => c.data?.extensions?.mundi?.example === tag) ?? characters().find(c => byFile.test(String(c.avatar ?? '')));
        if (found) { out.push(found.avatar); i++; continue; }
        const file = `mundi_${w.id}_${ex.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        const avatar = await createCharacter({
            name: ex.name, description: ex.description, first_mes: ex.first_mes ?? '', personality: ex.personality ?? '',
            scenario: w.setting, tags: ['Mundi', w.name], file,
            extensions: { mundi: { example: tag, world: w.id, occupation: ex.occupation, home: ex.home, routine: ex.routine, leisure: ex.leisure ?? [] } },
        }, await initialsAvatar(ex.name, PALETTE[i++ % PALETTE.length]));
        out.push(avatar);
    }
    return out;
}

export function homeSpot(w: WorldDef, zoneId: string, taken: Set<string>) {
    const zone = w.homes.zones.find(z => z.id === zoneId) ?? w.homes.zones[0];
    const free = zone.spots.filter(s => !taken.has(`${s[0]},${s[1]}`));
    const s = free.length ? pick(free) : pick(zone.spots);
    taken.add(`${s[0]},${s[1]}`);
    return { zone: zone.id, x: s[0], y: s[1], n: zone.spots.indexOf(s) + 1 };   // homes are numbered: House 1, House 2…
}

export function resident(w: WorldDef, avatar: string, taken: Set<string>): Resident {
    const ch = charOf(avatar);
    const card = ch?.data?.extensions?.mundi ?? {};
    // one of this world's own people: her job, home and routine come from the world (also in copied worlds)
    const ex = w.cast.examples.find(e => exampleTag(w, e) === card.example);
    const meta = ex ? { world: w.id, occupation: ex.occupation, home: ex.home, routine: ex.routine, leisure: ex.leisure ?? [] } : card;
    const occupation = meta.world === w.id ? meta.occupation ?? null : pick([...w.occupations.map(o => o.id), null]);
    const templateId = meta.world === w.id && meta.routine ? meta.routine : (occupation ? pick(['office', 'early']) : pick(Object.keys(w.cast.routineTemplates)));
    const routine = structuredClone(w.cast.routineTemplates[templateId] ?? Object.values(w.cast.routineTemplates)[0]);
    const zone = meta.world === w.id && meta.home ? meta.home : pick(w.homes.zones).id;
    return { avatar, name: ch?.name ?? avatar, occupation, home: homeSpot(w, zone, taken), routine, leisure: meta.world === w.id ? meta.leisure ?? [] : [], met: false };
}

/* ---------- new game ---------- */

export interface NewGame {
    world: WorldDef; cast: string[]; examples: boolean; hero: Hero; persona?: string; lore?: string[];
    /** households made at the start (people who share a home, and their ties), your household, and your chosen home */
    households?: { members: string[]; ties: { a: string; b: string; type: TieType; tone: TieTone }[] }[];
    family?: { avatar: string; type: TieType; tone: TieTone }[];
    home?: { zone: string; x: number; y: number; n: number };
    difficulty?: Difficulty;
}

export async function startNewGame(o: NewGame) {
    const w = o.world;
    state.busy = 'Creating the cast'; notify();
    const cast = [...new Set([...(o.examples ? await exampleCards(w) : []), ...o.cast])];
    if (!cast.length) throw new Error('Choose at least one person to live in the world.');

    // your character: a persona you already have, or a new one saved to your personas
    let personaFile = o.persona ?? '';
    if (personaFile) {
        o.hero.name = personaName(personaFile);
        const sheet = personaSheet(personaFile);
        if (sheet?.traits) o.hero.traits = sheet.traits;
    } else {
        state.busy = 'Creating your character'; notify();
        const portrait = o.hero.portrait ?? await initialsAvatar(o.hero.name, ['#22d3ee', '#4f46e5']);
        personaFile = await createPersona(o.hero.name, heroDescription(w, o.hero), portrait);
        setPersonaSheet(personaFile, sheetOf(w, o.hero));
    }

    state.busy = 'Writing the world\'s lorebook'; notify();
    const loreName = `Mundi - ${w.name}`;
    await writeLorebook(loreName, [
        { keys: [w.name], content: w.setting, constant: true, comment: 'Setting' },
        ...w.lore.map(l => ({ keys: l.keys, content: l.content, constant: !!l.constant })),
        ...w.places.map(p => ({ keys: [p.name], content: `${p.name}: ${p.desc ?? ''}`, comment: `Place: ${p.name}` })),
    ]);

    state.busy = 'Creating the world\'s group chat'; notify();
    const groupId = await createGroup(`Mundi · ${w.name} · ${o.hero.name}`, cast);
    await openGame(groupId);
    clearGreetings();

    const taken = new Set<string>();
    const origin: Origin | undefined = w.catalogs.origins?.find(x => x.id === o.hero.origin) ?? w.catalogs.origins?.[0];
    const picked = o.home && w.homes.zones.find(z => z.id === o.home!.zone);
    if (picked) taken.add(`${o.home!.x},${o.home!.y}`);
    const home = picked ? { zone: o.home!.zone, x: o.home!.x, y: o.home!.y, n: o.home!.n } : homeSpot(w, origin?.home ?? w.homes.zones[0].id, taken);
    const zone = w.homes.zones.find(z => z.id === home.zone)!;
    const save: Save = {
        v: 1, world: w.id, lang: lang(), day: w.time.startDay, minutes: w.time.startMinutes, speed: w.time.speed,
        player: {
            loc: playerHomeId, home: { ...home, kind: zone.kind },
            stats: Object.fromEntries(w.statuses.map(s => [s.id, s.start])),
            money: Math.round((origin?.money ?? 0) * (DIFFICULTIES.find(d => d.id === (o.difficulty ?? 'normal'))?.start ?? 1)), traits: JSON.parse(JSON.stringify(o.hero.traits ?? {})), origin: origin?.id ?? '', job: null, rentPaidDay: w.time.startDay,
        },
        cast: {}, tick: {}, log: [],
        ...({ cfg: { difficulty: o.difficulty ?? 'normal' } } as any),
    };
    for (const a of cast) save.cast[a] = resident(w, a, taken);
    // your household moves in with you; each other household shares the home of its first member
    for (const f of o.family ?? []) {
        if (!save.cast[f.avatar]) continue;
        save.cast[f.avatar].met = true;
        liveTogether(save, '__you', f.avatar);
        setTie(save, { a: f.avatar, b: '__you', type: f.type, tone: f.tone });
    }
    for (const h of o.households ?? []) {
        const [head, ...rest] = h.members.filter(a => save.cast[a]);
        if (!head) continue;
        for (const a of rest) liveTogether(save, head, a);
        for (const t of h.ties) if (save.cast[t.a] && save.cast[t.b]) setTie(save, t);
    }
    normalizeHomes(save);
    // the world's lorebooks and the characters' lorebooks chosen to stay on in this world
    const books = [...new Set([...(w.lorebooks ?? []), ...(o.lore ?? [])])];
    if (books.length) (save as any).cfg = { lore: books };
    Object.values(save.cast).slice(0, origin?.knows ?? 0).forEach(r => { r.met = true; });
    setGame(save);
    await bindChatLore(loreName);
    if (w.note?.text) {   // the world's Author's Note, the same one SillyTavern uses
        const m = ctx().chatMetadata;
        m.note_prompt = w.note.text; m.note_interval = w.note.interval ?? 1; m.note_depth = w.note.depth ?? 4; m.note_position = w.note.position ?? 1;
    }
    await usePersona(personaFile);
    await saveMeta();

    const entry: GameEntry = { groupId, world: w.id, title: `${w.name} · ${o.hero.name}`, persona: personaFile, created: Date.now(), last: Date.now() };
    settings().games.unshift(entry);
    settings().lastGame = groupId;
    settings().last = { kind: 'world', group: groupId, chatId: currentChatId() };
    saveSettings();
    await applyGameLore();
    await afterEnter();
}

/* ---------- entering and leaving ---------- */

export const gameEntry = (groupId: string | null) => settings().games.find(e => e.groupId === groupId) ?? null;
export const currentEntry = () => gameEntry(selectedGroup());

// `quiet`: no note about the save's size (a save slot opens on the way to its copy, which then gets the note)
export async function enterGame(groupId: string, chatId?: string, quiet = false) {
    const entry = gameEntry(groupId);
    if (!entry || !groupOf(groupId)) { toast('This game no longer exists in SillyTavern.', 'error'); return; }
    await loadWorld(entry.world);
    await openGame(groupId, chatId);
    if (!game()) { toast('This chat has no Mundi save.', 'error'); return; }
    entry.last = Date.now();
    if (!quiet) tokenNote();
    settings().lastGame = groupId;
    settings().last = { kind: 'world', group: groupId, chatId: currentChatId() };
    saveSettings();
    await usePersona(entry.persona);
    await afterEnter();
}

// When a save loads: how big its chat is, and how much of it actually goes to the AI (only the current scene's lines
// are sent; older ones are hidden and live on as facts and the diary).
function tokenNote() {
    const list = chat(); const g = game(); if (!g) return;
    const est = (t: string) => Math.ceil(t.length / 3.6);
    const all = list.reduce((n, m) => n + est(String(m.mes ?? '')), 0);
    const sent = list.filter(m => !m.is_system).reduce((n, m) => n + est(String(m.mes ?? '')), 0);
    const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
    toast(`This save: ${list.length} messages (≈ ${k(all)} tokens in all). Sent to the AI now: ≈ ${k(sent)} from the chat + ≈ ${k(est(sceneText()))} from Mundi, plus your preset and the cards of who is in the scene.`, 'info', { ms: 9000 });
}

async function afterEnter() {
    const g = game();
    const w = g && getWorld(g.world);
    if (w) setWorldDicts(w.id, w.i18n ?? {});
    state.view = 'map';
    state.sel = null;
    await syncScene();
    notify();
}

// A branch: a copy of this save as it is now (story, diary, state), saved next to it. You stay where you are;
// the branch shows up in Load.
export async function branchSave() {
    const g = game(); const gid = selectedGroup();
    if (!g || !gid) return;
    saveGame(); await saveMeta();
    const id = saveName(' (branch)');
    await copyGroupChat(gid, id, structuredClone(ctx().chatMetadata ?? {}), structuredClone(chat()));
    toast('Branch saved. You are still in this save; the branch is in Load.', 'success');
}

/* ---------- the scene follows the player ---------- */

let syncing: Promise<void> = Promise.resolve();
// Who is here: present residents are unmuted in the group, everyone else is muted. Then the prompt is refreshed.
// Someone you did not know becomes someone you know: only through an interaction (they answered you in the scene,
// you stopped to talk or said hi, you introduced yourself…), never just by being in the same place.
export function markMet(g: Save, avatar: string): boolean {
    const r = g.cast[avatar]; const w = getWorld(g.world);
    if (!r || r.met || !w) return false;
    r.met = true;
    note(g, '{u} met {0} for the first time, at {1}.', [r.name, placeName(g, w, g.player.loc)], [r.avatar], g.player.loc, 'meet');
    return true;
}
export function syncScene(): Promise<void> {
    syncing = syncing.then(async () => {
        const g = game(); const gid = selectedGroup();
        if (!g || !gid || TUT.save) return;   // the tutorial's world is not a group chat
        const w = getWorld(g.world);
        if (!w) return;
        const here = presentAt(g, w, g.player.loc);
        // talking with only one person: the others stay in the scene but keep quiet
        // the people you talk with who left: the conversation goes on without them (everyone again, when nobody is left)
        const { talkSet, setTalk } = await import('./social.js');
        const was = talkSet(g);
        const still = was.filter(a => here.some(r => r.avatar === a));
        if (still.length !== was.length) setTalk(g, still);
        // someone on the side who cuts in speaks this once
        const { guestOf } = await import('./social.js');
        const guest = guestOf(g);
        const talking = still.length ? [...still, ...(guest && here.some(r => r.avatar === guest) && !still.includes(guest) ? [guest] : [])] : here.map(r => r.avatar);
        // someone left or walked in while you were here: the narrator says so (the story then knows who is here)
        const { presenceLine } = await import('./presence.js');
        const said = presenceLine(g, w, here);
        if (said) { const { hs } = await import('./hostile.js'); hs(g).queue.push({ text: said, present: [], directive: '' }); }
        await setPresent(gid, Object.keys(g.cast), talking);
        followBackground(g, w);
        refreshPrompt();
        saveGame();
        void import('./hostile.js').then(h => h.flushEvents());   // the police arriving, someone coming to…
    }).catch(e => console.warn('[Mundi] scene sync', e));
    return syncing;
}

/* ---------- saves list ---------- */

// A row of "Load": a world save (a chat of a game's group) or a scenario (any other SillyTavern chat).
export interface SaveRow { kind: 'world' | 'chat'; groupId: string; avatar?: string; chatId: string; title: string; world: string; last: number; count: number; current: boolean; preview?: string }
export async function listSaves(): Promise<SaveRow[]> {
    const rows: SaveRow[] = [];
    for (const e of settings().games) {
        const g = groupOf(e.groupId);
        if (!g) continue;
        for (const c of await pastChats(e.groupId)) {
            const id = groupChatId(e.groupId, String(c.file_name ?? '').replace(/\.jsonl$/, ''));
            rows.push({ kind: 'world', groupId: e.groupId, chatId: id, title: e.title, world: e.world, last: Date.parse(c.last_mes) || Number(c.last_mes) || 0, count: Number(c.chat_items ?? 0), current: id === currentChatId() });
        }
    }
    // every other SillyTavern chat is a scenario
    const games = new Set(settings().games.map(e => e.groupId));
    try {
        for (const c of await recentChats()) {
            if (c.group && games.has(c.group)) continue;
            // a chat nobody played (only the greeting, or empty: SillyTavern opens one by itself) is not a save
            if (c.count <= 1) continue;
            rows.push({ kind: 'chat', groupId: c.group ?? '', avatar: c.avatar, chatId: c.chatId, title: c.avatar ? charOf(c.avatar)?.name ?? '' : groupOf(c.group!)?.name ?? '', world: '', last: c.last, count: c.count, current: c.chatId === currentChatId(), preview: c.preview });
        }
    } catch (e) { console.warn('[Mundi] recent chats', e); }
    return rows.sort((a, b) => b.last - a.last);
}

export async function deleteSave(r: SaveRow) {
    if (r.kind === 'chat') { await deleteScenarioChat({ avatar: r.avatar, group: r.groupId || undefined, chatId: r.chatId }); return; }
    const g = groupOf(r.groupId);
    if (!g) return;
    if ((g.chats ?? []).length <= 1) {   // the last save of a game: the whole game goes
        await deleteGroup(r.groupId);
        settings().games = settings().games.filter(e => e.groupId !== r.groupId);
        if (settings().lastGame === r.groupId) settings().lastGame = null;
        if (settings().last?.group === r.groupId) settings().last = null;
        saveSettings();
    } else await deleteChat(r.groupId, r.chatId);
}

// 35: SillyTavern's own chat background can follow the place you are in (Settings → Game).
function followBackground(g: Save, w: WorldDef) {
    if ((settings2() as any).bgFollow !== 'chat') return;
    const p = placeOf2(g, w, g.player.loc);
    if (!p) return;
    let img = p.bg ?? '';
    if (!img && p.home) img = w.homes.kinds[p.id === 'home:player' ? g.player.home.kind : (w.homes.zones.find(z => z.id === g.cast[p.id.slice(5)]?.home.zone)?.kind ?? '')]?.image ?? '';
    if (!img) return;
    const url = cssUrl(worldFile(w, img)); if (!url) return;
    const m = ctx().chatMetadata;
    if (m.custom_background === url) return;
    m.custom_background = url; ctx().saveMetadataDebounced();
    const el = document.getElementById('bg1'); if (el) el.style.backgroundImage = url;
}
