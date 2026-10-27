// New game: first a scenario (one character card, straight into a chat) or a world;
// a world goes: style and world → who lives in it → your character (the world's own sheet) → start.
import { rpgOf } from '../core/rpgdef.js';
import { defaultAttrs, pointsUsed, POINTS, POINT_COST, mod } from '../sim/rpg.js';
import { listSaves, type SaveRow } from '../sim/game.js';
import { castLevel, NEIGHBORS_MIN } from '../sim/happenings.js';
import { state, notify, esc, toast, game, saveGame } from '../core/store.js';
import { templates, templateById, saveInto, isEmptySetup, setupSummary, startSummary, type StartChoices } from '../sim/templates.js';
import { roomsOn } from '../sim/places.js';
import { refreshPrompt } from '../sim/prompt.js';
import { syncScene } from '../sim/game.js';
import { DIFFICULTIES } from '../sim/bills.js';
import { slidesHtml, toneTag } from './slides.js';
import { presetChipsHtml } from './castpresets.js';
import { isScenario, SCENARIO_STARTS } from '../core/world.js';
import { lorebooks, loadLore, quiet } from '../st/bridge.js';
import { worlds, getWorld, shortDesc, worldFile, bgOf, isCustom, exampleTag, styleOf, GAME_MODES, worldLocked, lockedFor, hasTag, type WorldDef } from '../core/world.js';
import { openCreatorNew, openCreatorEdit, importWorldFile } from './creator.js';
import { setWorldDicts } from '../core/tr.js';
import { characters, thumb, personas, personaThumb, persona, openCharacter, usePersona, charLorebooks, charOf, personaSheet } from '../st/bridge.js';
import { startNewGame, type Hero } from '../sim/game.js';
import { money } from '../sim/needs.js';
import { ACT, INPUT } from './reg.js';
import { styleName, inWorld, LOCKED_NOTE } from './styles.js';
import { pickAndCrop, pickFile } from './cropper.js';
import { uploadWorldPicture } from '../sim/creator.js';
import { icon } from './icons.js';
import { stepHouseholds, yourHouseholdHtml, stepHome } from './ngfamily.js';
import { traitsHtml, toggleTrait } from './traits.js';
import { charPicker, shownChars, resetPick } from './charpick.js';

type Step = 'world' | 'cast' | 'homes' | 'hero' | 'house' | 'review';
const STEPS_ALL: [Step, string][] = [['world', 'World'], ['cast', 'People'], ['homes', 'Households'], ['hero', 'Your character'], ['house', 'Home'], ['review', 'Start']];
// A scenario: the same steps, named for a house (everyone lives under one roof; your room instead of a home).
const STEPS_SCEN: [Step, string][] = [['world', 'Home'], ['cast', 'People'], ['homes', 'Relations'], ['hero', 'Your character'], ['house', 'Your room'], ['review', 'Start']];
let STEPS = STEPS_ALL;
const W = (): WorldDef => getWorld(state.wizard.world)!;

function freshHero(w: WorldDef): Hero {
    return {
        name: '', age: w.sheet.age?.default ?? 24, appearance: {}, origin: w.catalogs.origins?.[0]?.id ?? '',
        traits: Object.fromEntries((w.sheet.traits ?? []).map(t => [t.id, [] as string[]])), bio: '', portrait: null,
    };
}

export function startWizard() {
    resetPick('cast'); resetPick('scen');
    const w = getWorld('modern') ?? worlds()[0];
    state.wizard = { mode: null as null | 'scenario' | 'world', sq: '', pick: '', step: 'world' as Step, world: w.id, examples: false, setup: true, cast: [] as string[], q: '', hero: freshHero(w), portraitUrl: '' };
    setWorldDicts(w.id, w.i18n ?? {});
    state.view = 'newgame';
    notify();
}


function stepWorld() {
    const wz = state.wizard;
    const scen = wz.mode === 'scenario';
    const list = worlds().filter(w => isScenario(w) === scen);   // the Scenario mode lists scenarios; the World mode, worlds
    // Medieval and RPG worlds wait for the next update: shown, but locked
    const open = list.filter(w => !worldLocked(w)), locked = list.filter(w => worldLocked(w));
    if (worldLocked(getWorld(wz.world)) || isScenario(getWorld(wz.world)) !== scen) { wz.world = open[0]?.id ?? wz.world; wz.hero = freshHero(W()); }
    const play = scen ? (HT = 'wizard', roomsPickHtml()) : playModeHtml();
    return `<div class="mu-ng-world ${play ? 'has-play' : ''} ${scen ? 'is-scen' : ''}"><div class="mu-ng-worlds">${templatePickHtml(scen)}<h3>${scen ? 'Home' : 'World'}</h3><div class="mu-cards mu-worldgrid">${[...open, ...locked].map(w => `
            <div class="mu-worldcard-wrap ${worldLocked(w) ? 'is-locked' : ''}"><button class="mu-worldcard ${wz.world === w.id ? 'is-on' : ''}" data-act="ng-world" data-id="${esc(w.id)}" ${worldLocked(w) ? `aria-disabled="true" title="${esc(LOCKED_NOTE)}"` : ''}>
                <span class="mu-worldart" style="${esc(bgOf(w, w.cover))}">${slidesHtml(w)}<span class="mu-style-tags"><em class="mu-style-tag is-${esc(styleOf(w))}">${esc(styleName(styleOf(w)))}</em>${toneTag(w)}</span>${worldLocked(w) ? `<span class="mu-lockbadge">${icon('pin')}<b>Soon</b><small>${lockedFor(w)}</small></span>` : ''}</span>
                <b data-notr>${esc(inWorld(w, w.name))}</b><small>${isCustom(w.id) ? 'Made by you' : 'Ready world'}</small><p data-notr>${esc(shortDesc(inWorld(w, w.description)))}</p>
            </button>${isCustom(w.id) ? `<button class="mu-ghost mu-ibtn mu-world-edit" data-act="ng-world-edit" data-id="${esc(w.id)}" title="Edit this world">${icon('edit')}</button>` : ''}</div>`).join('')}
            </div><div class="mu-worldnew">
            <button class="mu-worldcard is-new" data-act="ng-world-new"><span class="mu-worldart">${icon('plus')}</span><b>Create a ${scen ? 'Home' : 'world'}</b><small>With the world creator</small><p>Choose a style, start from a ready world or from nothing, and change everything.</p></button>
            <button class="mu-worldcard is-new is-import" data-act="ng-world-import"><span class="mu-worldart">${icon('upload')}</span><b>Import a world</b><small>A .mundi-world.json file</small><p>A world someone exported from Mundi.</p></button></div></div>${play ? `<aside class="mu-ng-play">${play}</aside>` : ''}</div>`;
}

// A scenario: which rooms the house has in this game (the bedrooms are always there). The same picker works in a
// new game (the wizard) and in a game already going (This Home › The house, kept in the save's settings).
let HT: 'wizard' | 'game' = 'wizard';
const HG = { roomEdit: '', roomForm: null as any };
const store = (): any => (HT === 'game' ? ((game() as any).cfg ??= {}) : state.wizard);
const ui = (): any => (HT === 'game' ? HG : state.wizard);
const WW = (): WorldDef => (HT === 'game' ? getWorld(game()!.world)! : W());
// after a change in a game going on: save, tell the AI, and redraw the scene
const changed = () => { if (HT === 'game') { saveGame(); refreshPrompt(); void syncScene(); } notify(); };
const roomsOf = (): string[] => {
    const wz = store(), w = WW();
    if (HT === 'game') { if (!wz.rooms) { wz.rooms = roomsOn(game(), w).filter(id => w.places.some(p => p.id === id)); wz.roomsSeen = w.places.filter(p => !p.link).map(p => p.id); } return wz.rooms; }
    if (wz.roomsFor !== w.id) { wz.roomsFor = w.id; wz.rooms = w.places.filter(p => !p.scenarioOff && !p.link).map(p => p.id); } return wz.rooms as string[];
};
const ROOM_TAGS: [string, string][] = [['leisure', 'Free time'], ['outdoor', 'Outdoors'], ['food', 'Food'], ['sport', 'Sport'], ['service', 'Chores'], ['study', 'Study']];
const extraOf = () => (store().extraRooms ??= []) as { id: string; name: string; desc: string; tags: string[]; bg?: string }[];
// The actions a room offers by default (its tags, or actions made for it); `anywhere` ones are everywhere anyway.
const roomActsDefault = (w: WorldDef, p: { id: string; tags?: string[] }) => w.actions.filter(a => !a.home && !a.anywhere && ((a.place && a.place === p.id) || (!a.place && (a.tags ?? []).some(t => (p.tags ?? []).includes(t)) && !(a.notTags ?? []).some(t => (p.tags ?? []).includes(t))))).map(a => a.id);
const roomActs = (w: WorldDef, p: { id: string; tags?: string[] }): string[] => (store().roomActs ?? {})[p.id] ?? roomActsDefault(w, p);
// Which one a click is about: inside This Home (.mu-house-rooms) it is the game going on.
const at = (el: HTMLElement) => { HT = el.closest('.mu-house-rooms') ? 'game' : 'wizard'; };
// This Home › The house: the same picker for the game going on.
export function houseRoomsHtml(): string { HT = 'game'; try { return roomsPickHtml(); } finally { HT = 'wizard'; } }
function roomsPickHtml(): string {
    const w = WW(); if (!isScenario(w)) return '';
    const on = roomsOf(), extra = extraOf();
    // Clicking a room opens what can be done in it; only its round button adds or removes it.
    const tile = (p: { id: string; name: string; desc?: string; bg?: string }, isOn: boolean, extraRoom: boolean) => `<div class="mu-ng-room-w"><button class="mu-ng-room ${isOn ? 'is-on' : ''} ${ui().roomEdit === p.id ? 'is-edit' : ''}" data-act="ng-room-edit" data-id="${esc(p.id)}" title="${esc(p.desc ? `${p.desc} · ` : '')}Click: what can be done here">
            <i style="${p.bg ? `background-image:url('${esc(extraRoom ? p.bg : worldFile(w, p.bg))}')` : ''}">${p.bg ? '' : icon('home')}</i><b data-notr>${esc(p.name)}</b></button>
            <button class="mu-ng-room-tick ${isOn ? 'is-on' : ''} ${extraRoom ? 'is-x' : ''}" data-act="${extraRoom ? 'ng-room-x' : 'ng-room'}" data-id="${esc(p.id)}" title="${extraRoom ? 'Remove this room' : isOn ? 'Take this room out of the house' : 'Put this room in the house'}" aria-pressed="${isOn}">${extraRoom ? '×' : isOn ? '✓' : ''}</button></div>`;
    const edit = roomEditHtml(w);
    return `<h3>Rooms</h3><p class="mu-muted">Which rooms this house has (the bedrooms are always there). The round button adds or removes a room; click a room to choose what can be done in it.</p>
        <div class="mu-ng-rooms">${w.places.filter(p => !p.link).map(p => tile(p, on.includes(p.id), false)).join('')}${extra.map(r => tile(r, true, true)).join('')}
            <button class="mu-ng-room is-add" data-act="ng-room-add"><i>${icon('plus')}</i><b>Add a room</b></button></div>
        ${ui().roomForm ? roomFormHtml() : ''}${edit}`;
}
function roomFormHtml(): string {
    const f = ui().roomForm;
    return `<section class="mu-panel mu-ng-roomform"><h4>A new room</h4>
        <div class="mu-row"><span class="mu-ng-roompic" style="${f.bg ? `background-image:url('${esc(f.bg)}')` : ''}">${f.bg ? '' : icon('image')}</span><button data-act="ng-room-pic">${icon('upload')}<span>${f.bg ? 'Change picture' : 'Picture (optional)'}</span></button></div>
        <label class="mu-field"><span>Name</span><input data-input="ng-room-f" data-k="name" data-focus="ngroomname" maxlength="60" value="${esc(f.name)}" placeholder="Home cinema"></label>
        <label class="mu-field"><span>What it is like (the AI reads this)</span><textarea rows="2" data-input="ng-room-f" data-k="desc" data-focus="ngroomdesc" placeholder="a dark room with a projector and big beanbags">${esc(f.desc)}</textarea></label>
        <div class="mu-field"><span>What it is for</span><div class="mu-chips">${ROOM_TAGS.map(([t, l]) => `<button class="mu-chip ${f.tags.includes(t) ? 'is-on' : ''}" data-act="ng-room-tag" data-v="${t}">${l}</button>`).join('')}</div></div>
        <div class="mu-row"><button class="mu-primary" data-act="ng-room-save" ${f.name.trim() ? '' : 'aria-disabled="true"'}>Add the room</button><button class="mu-ghost" data-act="ng-room-cancel">Cancel</button></div></section>`;
}
function roomEditHtml(w: WorldDef): string {
    const id = ui().roomEdit; if (!id) return '';
    const p = w.places.find(x => x.id === id) ?? extraOf().find(x => x.id === id); if (!p) return '';
    const mine = roomActs(w, p);
    const list = w.actions.filter(a => !a.home && !a.anywhere);
    const anyw = w.actions.filter(a => a.anywhere);
    return `<section class="mu-panel mu-ng-roomacts"><header class="mu-row"><h4 data-notr>${esc(p.name)}: what can be done here</h4><button class="mu-ghost mu-right" data-act="ng-room-acts-reset">Default</button><button class="mu-ibtn mu-ghost" data-act="ng-room-edit" data-id="${esc(id)}" title="Close">${icon('x')}</button></header>
        <div class="mu-ng-roomacts-grid">${list.map(a => `<label class="mu-check"><input type="checkbox" data-input="ng-room-act" data-a="${esc(a.id)}" ${mine.includes(a.id) ? 'checked' : ''}><span>${a.icon ?? ''} ${esc(a.label || a.name)}</span></label>`).join('')}</div>
        ${anyw.length ? `<small class="mu-muted">Always possible anywhere: ${esc(anyw.map(a => a.label || a.name).join(', '))}.</small>` : ''}</section>`;
}

// The cast: your characters, with folders or without, by tag, by name or only favorites.
const castList = () => characters();
function stepCast() {
    const wz = state.wizard;
    return `
        <h3>Your characters</h3>
        <p class="mu-muted">Pick cards from your SillyTavern to live in this world. Mundi gives each one a home, a routine and a job; the cards themselves are not changed.</p>
        ${presetChipsHtml()}
        ${castMeter()}
        ${charPicker({ key: 'cast', list: castList(), selected: wz.cast, act: 'ng-cast', multi: true, selectAllAct: 'ng-cast-all', placeholder: 'Search your characters' })}`;
}

// How this game will be played: a world with an RPG can be played as Life-Sim or as RPG.
// The ways this world can be played (its tags: Life-Sim, RPG).
const playable = (w: WorldDef) => GAME_MODES.filter(x => x.id !== 'custom' && (x.id === 'rpg' ? hasTag(w, 'rpg') && !!rpgOf(w) : hasTag(w, 'lifesim')));
const playMode = () => { const w = W(); const ok = playable(w).map(x => x.id); const m = state.wizard.play ?? w.mode ?? 'lifesim'; return w.mode === 'custom' && !state.wizard.play ? m : ok.includes(m as any) ? m : ok[0] ?? 'lifesim'; };
function playModeHtml() {
    const w = W(); if (playable(w).length < 2) return '';
    const m = playMode();
    return `<h3>How do you want to play?</h3><div class="mu-heropick is-start">${playable(w).map(x => `<button class="mu-herocard ${m === x.id ? 'is-on' : ''}" data-act="ng-play" data-v="${x.id}"><b>${esc(x.name)}</b><p>${esc(x.desc)}</p></button>`).join('')}</div>`;
}

// RPG: class, attributes (point buy) and two trained skills. The background (origin) adds its skills and +1s.
function rpgState() {
    const wz = state.wizard, w = W(), r = rpgOf(w);
    if (!r || playMode() !== 'rpg') return null;
    if (!wz.rpg || !r.classes.some(c => c.id === wz.rpg.cls)) { const c = r.classes[0]; wz.rpg = { cls: c.id, attrs: defaultAttrs(r, c), skills: c.skills.slice(0, 2) }; }
    return { wz, w, r, s: wz.rpg as { cls: string; attrs: Record<string, number>; skills: string[] } };
}
function rpgHtml() {
    const x = rpgState(); if (!x) return '';
    const { w, r, s } = x;
    const c = r.classes.find(k => k.id === s.cls)!;
    const left = POINTS - pointsUsed(s.attrs);
    const origin = w.catalogs.origins?.find(o => o.id === state.wizard.hero.origin);
    const sk = (id: string) => r.skills.find(k => k.id === id)?.name ?? id;
    return `<section class="mu-rpgmake"><h3>Your class</h3>
        <div class="mu-cards small">${r.classes.map(k => `<button class="mu-origin ${k.id === s.cls ? 'is-on' : ''}" data-act="ng-cls" data-id="${esc(k.id)}"><b>${esc(k.name)}</b><small>d${k.hit} hit points · ${esc(r.attributes.find(a => a.id === k.key)?.short ?? '')}${k.schools?.length ? ' · spells' : ''}</small><p>${esc(k.desc ?? '')}</p></button>`).join('')}</div>
        <p class="mu-muted">Subclass at level ${c.subAt}: ${c.subclasses.map(x => esc(x.name)).join(', ')}.</p>
        <h3>Attributes <small class="mu-muted">${left} of ${POINTS} points left · 8 to 15 each</small></h3>
        <div class="mu-sheet-attrs is-make">${r.attributes.map(a => { const v = s.attrs[a.id] ?? 8, bonus = origin?.attributes?.[a.id] ?? 0; return `<div title="${esc(a.desc ?? '')}"><small>${esc(a.short)}</small><b>${v + bonus}</b><em>${mod(v + bonus) >= 0 ? '+' : ''}${mod(v + bonus)}</em>
            <span><button class="mu-ibtn" data-act="ng-attr" data-id="${esc(a.id)}" data-d="-1" ${v <= 8 ? 'disabled' : ''}>−</button><button class="mu-ibtn" data-act="ng-attr" data-id="${esc(a.id)}" data-d="1" ${v >= 15 || (POINT_COST[v + 1] ?? 99) - (POINT_COST[v] ?? 0) > left ? 'disabled' : ''}>+</button></span>${bonus ? `<i>+${bonus} ${esc(origin!.name)}</i>` : ''}</div>`; }).join('')}</div>
        <h3>Skills <small class="mu-muted">pick 2${origin?.skills?.length ? ` · ${esc(origin.name)} adds ${origin.skills.map(sk).join(', ')}` : ''}</small></h3>
        <div class="mu-chips">${c.skills.map(id => `<button class="mu-chip ${s.skills.includes(id) ? 'is-on' : ''}" data-act="ng-skill" data-id="${esc(id)}">${esc(sk(id))}</button>`).join('')}</div>
        ${origin?.feature ? `<p class="mu-muted">${esc(origin.feature)}</p>` : ''}</section>`;
}

// Memories from another life: a save of another game with some of the same people (only memories come along).
function memoriesHtml() {
    const wz = state.wizard;
    if (!wz.saves) { wz.saves = []; listSaves().then(l => { wz.saves = l.filter(r => r.kind === 'world'); notify(); }).catch(() => { wz.saves = []; }); }
    const list = (wz.saves as SaveRow[]);
    if (!list.length) return '';
    return `<h4>Memories from another life (optional)</h4><p class="mu-muted">The people of this game who were also in that one remember what happened there, as from another life. Nothing else comes along: not money, jobs or levels.</p>
        <select data-input="ng-mem"><option value="">(start fresh)</option>${list.map(r => `<option value="${esc(r.chatId)}" ${wz.memories === r.chatId ? 'selected' : ''}>${esc(r.title)} · ${esc(new Date(r.last).toLocaleDateString())}</option>`).join('')}</select>`;
}

// How many people the world will have, and how alive that feels (neighbors and the rest need real cards).
function castMeter() {
    const wz = state.wizard, w = W();
    const n = (wz.examples ? w.cast.examples.length : 0) + wz.cast.length;
    if (isScenario(w)) {   // one house: a few people are enough, and there are no neighbors
        const lv = n < 2 ? ['too few', 'is-too', 'At least 2 people to share the house.'] : n <= 8 ? ['good', 'is-lively', 'A full house.'] : ['crowded', 'is-works', `More people than bedrooms is fine, but scenes get busy.`];
        return `<div class="mu-castmeter"><b class="${lv[1]}">${n} ${n === 1 ? 'person' : 'people'} in the house · ${lv[0]}</b><small class="mu-muted">${lv[2]}</small></div>`;
    }
    const c = castLevel(n, playMode());
    const cls = c.level === 'too few' ? 'is-too' : `is-${c.level}`;
    return `<div class="mu-castmeter"><b class="${cls}">${n} ${n === 1 ? 'person' : 'people'} · ${esc(c.level)}</b><small class="mu-muted">${esc(c.tip)} Neighbors need ${NEIGHBORS_MIN} people living in your area.</small></div>`;
}

// Your character: one you already have (a SillyTavern persona) or a new one.
function stepHeroChoice() {
    return `<div class="mu-heropick is-modes">
        <button class="mu-herocard" data-act="ng-heromode" data-v="existing"><i>${icon('users')}</i><b>Use a ready character</b><p>Play with one of your personas. Its description stays as it is.</p></button>
        <button class="mu-herocard" data-act="ng-heromode" data-v="new"><i>${icon('plus')}</i><b>Create a new character</b><p>Made with this world's sheet and saved to your personas.</p></button>
    </div>`;
}
function stepHeroExisting() {
    const wz = state.wizard; const q = String(wz.pq ?? '').toLowerCase();
    const list = personas().filter(p => !q || p.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="mu-row"><button class="mu-ghost" data-act="ng-heromode" data-v="">${icon('back')}<span>Back</span></button>
            <input class="mu-search" type="search" data-input="ng-pq" data-focus="ngpq" placeholder="Search your personas" value="${esc(wz.pq ?? '')}"></div>
        <div class="mu-castgrid" data-keep="personas">${list.length ? list.map(p => `
            <button class="mu-castcard ${wz.persona === p.file ? 'is-on' : ''}" data-act="ng-persona" data-file="${esc(p.file)}" title="${esc(p.name)}">
                <img src="${esc(personaThumb(p.file))}" alt="" loading="lazy"><span data-notr>${esc(p.name)}</span><i>✓</i></button>`).join('') : '<p class="mu-muted">You have no personas yet.</p>'}</div>
        ${wz.persona ? `<p class="mu-muted mu-persona-desc" data-notr>${esc(personas().find(p => p.file === wz.persona)?.description.slice(0, 400) ?? '')}</p>` : ''}`;
}

function stepHero() {
    const mode = state.wizard.heroMode;
    if (!mode) return stepHeroChoice();
    // once you have a character: who lives with you
    if (mode === 'existing') return `${stepHeroExisting()}${state.wizard.persona ? `<div class="mu-creator is-persona">${heroSheetHtml(true)}</div>` : ''}${rpgHtml()}${state.wizard.persona ? yourHouseholdHtml() : ''}`;
    return `<div class="mu-row"><button class="mu-ghost" data-act="ng-heromode" data-v="">${icon('back')}<span>Back</span></button></div>${stepHeroNew()}${rpgHtml()}${state.wizard.hero.name.trim() ? yourHouseholdHtml() : ''}`;
}

function stepHeroNew() {
    const h: Hero = state.wizard.hero, sh = W().sheet;
    return `<div class="mu-creator ${asks(W(), 'portrait') ? '' : 'no-portrait'}">
        <section class="mu-portrait" ${asks(W(), 'portrait') ? '' : 'hidden'}>
            <div class="mu-portrait-img" style="${state.wizard.portraitUrl ? `background-image:url('${state.wizard.portraitUrl}')` : ''}">${state.wizard.portraitUrl ? '' : `<span>${esc((h.name || '?').slice(0, 2).toUpperCase())}</span>`}</div>
            <button data-act="ng-portrait">Choose an image</button>
            ${state.wizard.portraitUrl ? '<button class="mu-ghost" data-act="ng-portrait-clear">Use initials</button>' : '<small class="mu-muted">Without an image, your initials are used.</small>'}
        </section>
        <section class="mu-fields">
            <label class="mu-field"><span>Name</span><input data-input="ng-name" data-focus="ngname" maxlength="40" value="${esc(h.name)}" placeholder="What is your name?"></label>
            ${sh.age && asks(W(), 'age') ? `<label class="mu-field"><span>Age · ${h.age}</span><input type="range" min="${sh.age.min}" max="${sh.age.max}" value="${h.age}" data-input="ng-age"></label>` : ''}
            ${(asks(W(), 'appearance') ? sh.appearance ?? [] : []).map(a => { const v = h.appearance[a.id] ?? '', other = !!(state.wizard as any).lookOther?.[a.id] || (!!v && !a.options.includes(v));
                return `<div class="mu-field"><span>${esc(a.label)}</span><div class="mu-chips">${a.options.map(o => `<button class="mu-chip ${v === o ? 'is-on' : ''}" data-act="ng-look" data-k="${esc(a.id)}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}<button class="mu-chip ${other ? 'is-on' : ''}" data-act="ng-look-other" data-k="${esc(a.id)}">${icon('edit')}<span>Other</span></button></div>
                ${other ? `<input class="mu-look-other" data-input="ng-look-txt" data-k="${esc(a.id)}" data-focus="ngo-${esc(a.id)}" maxlength="60" value="${esc(a.options.includes(v) ? '' : v)}" placeholder="Write your own (${esc(a.label.toLowerCase())})">` : ''}</div>`; }).join('')}
        </section>
        ${heroSheetHtml(false)}
    </div>`;
}
// Origin, traits and a few words about you: for a new character, and for a persona too (its description stays as it
// is; the words here are about you in this world).
const asks = (w: WorldDef, k: 'portrait' | 'age' | 'appearance' | 'origin' | 'traits' | 'bio') => w.sheet.ask?.[k] !== false;
function heroSheetHtml(persona: boolean) {
    const w = W(), h: Hero = state.wizard.hero, sh = w.sheet;
    const origin = asks(w, 'origin') && !isScenario(w) ? (w.catalogs.origins ?? []) : [];
    return `${isScenario(w) ? situationHtml() : ''}${origin.length ? `<section class="mu-origins"><h3>Origin</h3><div class="mu-cards small">${origin.map(o => `
            <button class="mu-origin ${h.origin === o.id ? 'is-on' : ''}" data-act="ng-origin" data-id="${esc(o.id)}"><b>${esc(o.name)}</b><small>${money(w, o.money)}</small><p>${esc(o.desc ?? '')}</p></button>`).join('')}</div></section>` : ''}
        ${sh.traits?.length && asks(w, 'traits') ? `<section class="mu-attrs">${traitsHtml(sh.traits, h.traits, 'ng-trait')}</section>` : ''}
        ${asks(w, 'bio') ? `<section class="mu-bio"><label class="mu-field"><span>${persona ? 'About you in this world (optional; your persona\'s description is not changed)' : 'About you (optional)'}</span><textarea rows="4" data-input="ng-bio" data-focus="ngbio" placeholder="${persona ? 'What you do here, what people know about you' : 'Personality, quirks, what drives you'}">${esc(h.bio)}</textarea></label></section>` : ''}`;
}

// A scenario: how you fit in the house, instead of an origin. Custom: your own premise, written by you, or by your
// AI from one or more lorebooks (adapted to a Mundi scenario: one house, its people, you).
const startOf = () => (state.wizard.start ??= { id: 'moved', text: '', books: [] as string[], busy: false, bq: '' });
function situationHtml(): string {
    const st = startOf(), w = W();
    const books = lorebooks().filter(b => !st.bq || b.toLowerCase().includes(String(st.bq).toLowerCase())).sort((a, b) => a.localeCompare(b));
    return `<section class="mu-origins mu-situation"><h3>Your situation</h3><p class="mu-muted">How you fit in ${esc(w.name)}.</p><div class="mu-cards small">${SCENARIO_STARTS.map(s => `
            <button class="mu-origin ${st.id === s.id ? 'is-on' : ''}" data-act="ng-situation" data-id="${s.id}"><b>${esc(s.name)}</b><p>${esc(s.desc)}</p></button>`).join('')}</div>
        ${st.id === 'custom' ? `<div class="mu-panel mu-situation-custom">
            <label class="mu-field"><span>Premise (how the story starts; the AI is told this instead of the Home's own)</span><textarea rows="6" data-input="ng-start-text" data-focus="ngstart" placeholder="${esc(w.scenario?.premise ?? 'Who you are in this house, and how it all begins')}">${esc(st.text)}</textarea></label>
            <h4>Or let your AI write it from lorebooks</h4>
            <p class="mu-muted">Pick one or more lorebooks: your AI reads them and writes a premise for this house and its people. You can change it afterwards.</p>
            <input class="mu-search" type="search" data-input="ng-start-bq" data-focus="ngstartbq" placeholder="Search lorebooks" value="${esc(st.bq)}">
            <div class="mu-chips mu-situation-books">${books.slice(0, 60).map(b => `<button class="mu-chip ${st.books.includes(b) ? 'is-on' : ''}" data-act="ng-start-book" data-name="${esc(b)}" data-notr>${esc(b)}</button>`).join('') || '<span class="mu-muted">No lorebooks.</span>'}</div>
            <div class="mu-row"><button class="mu-primary" data-act="ng-start-gen" ${st.books.length && !st.busy ? '' : 'aria-disabled="true"'}>${icon('sparkles')}<span>${st.busy ? 'Writing…' : st.text.trim() ? 'Write it again' : 'Write the premise'}</span></button>
                <small class="mu-muted">${st.books.length} chosen</small></div></div>` : `<blockquote class="mu-premise" data-notr>${esc([w.scenario?.premise ?? '', SCENARIO_STARTS.find(s => s.id === st.id)?.you ?? ''].filter(Boolean).join(' '))}</blockquote>`}</section>`;
}
// The lorebooks' text, short enough for one request.
async function loreText(names: string[], max = 9000): Promise<string> {
    const out: string[] = [];
    for (const n of names) {
        const data = await loadLore(n);
        for (const e of Object.values<any>(data?.entries ?? {})) if (!e?.disable && e?.content) out.push(`- ${(e.comment || (e.key ?? [])[0] || '').toString().slice(0, 60)}: ${String(e.content).replace(/\s+/g, ' ').trim()}`);
    }
    return out.join('\n').slice(0, max);
}

function stepReview() {
    const wz = state.wizard, w = W(), h: Hero = wz.hero;
    const origin = w.catalogs.origins?.find(o => o.id === h.origin);
    const people = (wz.examples ? w.cast.examples.length : 0) + wz.cast.length;
    const home = isScenario(w);
    return `<div class="mu-review-wrap"><div class="mu-panel mu-review">
        <h4>Your game</h4>
        ${wz.heroMode === 'existing'
            ? `<p><b data-notr>${esc(personas().find(p => p.file === wz.persona)?.name ?? '')}</b> · your persona</p>`
            : `<p><b>${esc(h.name)}</b>, ${h.age} · ${esc(origin?.name ?? '')}</p>`}
        <p>${home ? 'Home' : 'World'}: <b>${esc(w.name)}</b> · ${people} ${people === 1 ? 'person lives' : 'people live'} here.</p>
        ${home ? (() => { const st = startOf(); const s = SCENARIO_STARTS.find(x => x.id === st.id); const t = st.id === 'custom' && st.text.trim() ? st.text.trim() : [w.scenario?.premise ?? '', s?.id === 'custom' ? '' : s?.you ?? ''].filter(Boolean).join(' ');
            return `<p>Your situation: <b>${esc(s?.name ?? '')}</b></p>${t ? `<blockquote class="mu-premise" data-notr>${esc(t)}</blockquote>` : ''}`; })() : ''}
        ${castMeter()}
        <p class="mu-muted">Mundi will create in your SillyTavern:</p>
        ${charLoreHtml()}
        <ul class="mu-muted mu-review-list">${wz.examples ? '<li>the example characters\' cards</li>' : ''}${wz.heroMode === 'existing' ? '' : '<li>your persona</li>'}<li>the lorebook “Mundi - ${esc(w.name)}”</li><li>a group chat for this game (each save is a chat of that group)</li></ul>
    </div><div class="mu-panel mu-review">
        <h4>Difficulty</h4>
        <div class="mu-heropick is-start mu-diff">${DIFFICULTIES.map(d => `<button class="mu-herocard ${(wz.difficulty ?? 'normal') === d.id ? 'is-on' : ''}" data-act="ng-diff" data-v="${d.id}"><b>${d.name}</b><p>${home ? d.homeDesc : d.desc}</p></button>`).join('')}</div>
        ${memoriesHtml()}
        ${tplSetupHtml()}
        <label class="mu-check"><input type="checkbox" data-input="ng-setup" ${wz.setup && !usingTplSetup() ? 'checked' : ''}><span>Set up from the lore<small>Once the game starts, the AI reads its lorebooks and the characters' cards and proposes what each person is, who is the law, the groups and their bases, and the world's own laws. You review it before anything is applied. A few AI calls.</small></span></label>
        ${tplSaveHtml()}
    </div></div>`;
}

/* ---------- templates: start the way an earlier game started ---------- */
const tplStartOf = (): StartChoices => {
    const wz = state.wizard;
    return {
        cast: [...wz.cast], names: Object.fromEntries(wz.cast.map((a: string) => [a, String(charOf(a)?.name ?? '')])), examples: !!wz.examples,
        loreOff: [...(wz.loreOff ?? [])], difficulty: wz.difficulty ?? 'normal',
        households: (wz.hh ?? []).filter((h: any) => h.members.length).map((h: any) => ({ members: [...h.members], ties: (h.ties ?? []).map((t: any) => ({ ...t })) })),
        family: (wz.family ?? []).map((f: any) => ({ ...f })),
    };
};
const usingTplSetup = () => { const t = state.wizard.tpl && templateById(state.wizard.tpl); return !!t && t.world === W().id && !isEmptySetup(t.setup) && state.wizard.tplSetup !== false; };
/** At the first step: the templates that hold a start, to load. */
function templatePickHtml(scen = false): string {
    const list = templates().filter(t => t.start && getWorld(t.world) && isScenario(getWorld(t.world)) === scen);
    if (!list.length) return '';
    return `<section class="mu-tpl-pick"><h3>Start from a template</h3><div class="mu-chips">${list.map(t => `<button class="mu-chip ${state.wizard.tpl === t.id ? 'is-on' : ''}" data-act="ng-tpl-load" data-id="${esc(t.id)}" title="${esc(`${getWorld(t.world)?.name ?? ''} · ${startSummary(t.start)}${!isEmptySetup(t.setup) ? ` · with a setup (${setupSummary(t.setup)})` : ''}`)}">${icon('save')}<span>${esc(t.name)}</span><small>${esc(getWorld(t.world)?.name ?? '')}</small></button>`).join('')}</div>
        <p class="mu-muted">It sets the world, the people, their lorebooks, the households and the difficulty; you choose your character. Go back to change anything.</p></section>`;
}
/** At the last step: use the template's setup (no AI reading). */
function tplSetupHtml(): string {
    const t = state.wizard.tpl && templateById(state.wizard.tpl);
    if (!t || t.world !== W().id || isEmptySetup(t.setup)) return '';
    return `<label class="mu-check"><input type="checkbox" data-input="ng-tpl-setup" ${usingTplSetup() ? 'checked' : ''}><span>Use the setup of “${esc(t.name)}”<small>${esc(setupSummary(t.setup))}. You review it once the game starts; no AI calls.</small></span></label>`;
}
/** At the last step: save these choices. */
function tplSaveHtml(): string {
    const w = W(), wz = state.wizard;
    const names = templates().filter(t => t.world === w.id).map(t => t.name);
    const loaded = wz.tpl && templateById(wz.tpl);
    const value = wz.tplName ?? (loaded && loaded.world === w.id ? loaded.name : `${w.name} start`);
    return `<section class="mu-tpl-save"><h4>Save as a template</h4>
        <p class="mu-muted">Keeps these choices: the people, their lorebooks, the households and the difficulty, to start another game of ${esc(w.name)} the same way. Your character is not saved. Once the game is set up, save its setup into the same template (Rough stuff → Templates).</p>
        <div class="mu-row"><input type="text" list="mu-ng-tpl-names" data-input="ng-tpl-name" value="${esc(value)}" maxlength="60" aria-label="Template name"><datalist id="mu-ng-tpl-names">${names.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
            <button data-act="ng-tpl-save">${icon('save')}<span>Save</span></button></div></section>`;
}

// Characters of this game with lorebooks of their own: keep each lorebook always on in this world, or not.
function gameCast(): string[] {
    const wz = state.wizard, w = W();
    const ex = wz.examples ? characters().filter(c => w.cast.examples.some(e => exampleTag(w, e) === c.data?.extensions?.mundi?.example)).map(c => c.avatar) : [];
    return [...new Set([...ex, ...wz.cast])];
}
function charLoreHtml() {
    const rows = gameCast().map(a => ({ a, books: charLorebooks(a) })).filter(r => r.books.length);
    if (!rows.length) return '';
    const off: string[] = state.wizard.loreOff ?? [];
    return `<section class="mu-charlore-pick"><h4>Characters' lorebooks</h4>
        <p class="mu-muted">Checked: always on in this world. Unchecked: SillyTavern still uses it when that character speaks.</p>
        ${rows.map(r => `<div class="mu-charlore-row"><img src="${esc(thumb(r.a))}" alt=""><b data-notr>${esc(charOf(r.a)?.name ?? '')}</b>
            <div class="mu-chips">${r.books.map(b => `<label class="mu-check"><input type="checkbox" data-act="ng-lore" data-name="${esc(b)}" ${off.includes(b) ? '' : 'checked'}><span data-notr>${esc(b)}</span></label>`).join('')}</div></div>`).join('')}</section>`;
}
const chosenLore = () => { const off: string[] = state.wizard.loreOff ?? []; return [...new Set(gameCast().flatMap(a => charLorebooks(a)))].filter(b => !off.includes(b)); };

function canGo(step: Step): string {
    const wz = state.wizard;
    if (step === 'cast' && !wz.examples && !wz.cast.length) return 'Choose at least one person to live in the world.';
    if (step === 'hero') {
        if (!wz.heroMode) return 'Choose how you want to play.';
        if (wz.heroMode === 'existing') { if (!wz.persona) return 'Choose one of your personas.'; }
        else if (!wz.hero.name.trim()) return 'Choose a name for your character.';
        const x = rpgState(); if (x && x.s.skills.length < 2) return 'Pick 2 skills for your class.';
    }
    return '';
}

/* ---------- first: a scenario (one character, straight to the chat) or a world ---------- */

function modeHtml() {
    return `<div class="mu-wizard">
        <div class="mu-subhead"><button data-act="to-menu" data-sfx="back">← Menu</button><h2>New game</h2><span></span></div>
        <div class="mu-wizard-body"><div class="mu-heropick is-modes">
            <button class="mu-herocard" data-act="ng-mode" data-v="chat"><i>${icon('chat')}</i><b>Chat</b><p>Pick a character card and go straight into a chat with them, in Mundi's scene. No map, no clock: just the story.</p></button>
            <button class="mu-herocard" data-act="ng-mode" data-v="scenario"><i>${icon('home')}</i><b>Home</b><p>One place (a house, a mansion) and the people who live there: a premise, their routines, your relations. Life outside happens off-screen.</p></button>
            <button class="mu-herocard" data-act="ng-mode" data-v="world"><i>${icon('globe')}</i><b>World</b><p>A living world: maps and towns, time passing, people with routines, jobs, money and the style's own mechanics.</p></button>
        </div></div></div>`;
}

function scenarioHtml() {
    const wz = state.wizard;
    const me = wz.as || persona();
    const c = wz.pick && characters().find(x => x.avatar === wz.pick);
    return `<div class="mu-wizard">
        <div class="mu-subhead"><button data-act="ng-mode" data-v="" data-sfx="back">← Back</button><h2>Chat</h2><span></span></div>
        <div class="mu-wizard-body" data-keep="wizard">
            <p class="mu-muted">Choose who you want to talk to. The chat is a normal SillyTavern chat with that card.</p>
            ${charPicker({ key: 'scen', list: characters(), selected: wz.pick ? [wz.pick] : [], act: 'ng-pick', placeholder: 'Search your characters' })}
        </div>
        ${wz.asOpen ? personaPicker(me) : ''}
        <div class="mu-wizard-foot">
            <div class="mu-field mu-as"><span>You play as</span><button class="mu-as-btn" data-act="ng-as-open">${me ? `<img src="${esc(personaThumb(me))}" alt="">` : ''}<b data-notr>${esc(personas().find(p => p.file === me)?.name ?? '—')}</b>${icon('down')}</button></div>
            <span class="mu-row">
                <button data-act="ng-scenario" data-fresh="0" ${c ? '' : 'aria-disabled="true"'}>Continue the last chat</button>
                <button class="mu-primary mu-big" data-act="ng-scenario" data-fresh="1" ${c ? '' : 'aria-disabled="true"'}>New chat ▶</button></span>
        </div>
    </div>`;
}

// "You play as": your personas in a grid, with search.
function personaPicker(me: string) {
    const wz = state.wizard; const q = String(wz.asq ?? '').toLowerCase();
    const list = personas().filter(p => !q || p.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="mu-dlg-veil" data-act="ng-as-close"></div><div class="mu-panel mu-scpick" role="dialog"><header><h3>You play as</h3><button class="mu-ibtn mu-ghost" data-act="ng-as-close" aria-label="Close">${icon('x')}</button></header>
        <input class="mu-search" type="search" data-input="ng-asq" data-focus="ngasq" placeholder="Search your personas" value="${esc(wz.asq ?? '')}">
        <div class="mu-scpick-grid" data-keep="aspick">${list.map(p => `<button class="${p.file === me ? 'is-on' : ''}" data-act="ng-as" data-file="${esc(p.file)}"><img src="${esc(personaThumb(p.file))}" alt="" loading="lazy"><span data-notr>${esc(p.name)}</span></button>`).join('') || '<p class="mu-muted">You have no personas yet.</p>'}</div></div>`;
}

export function newGameHtml() {
    const wz = state.wizard;
    if (!wz) return '';
    STEPS = wz.mode === 'scenario' ? STEPS_SCEN : STEPS_ALL;
    if (!wz.mode) return modeHtml();
    if (wz.mode === 'chat') return scenarioHtml();
    const i = STEPS.findIndex(s => s[0] === wz.step);
    const body = wz.step === 'world' ? stepWorld() : wz.step === 'cast' ? stepCast() : wz.step === 'homes' ? stepHouseholds() : wz.step === 'hero' ? stepHero() : wz.step === 'house' ? stepHome() : stepReview();
    const block = canGo(wz.step);
    return `<div class="mu-wizard">
        <div class="mu-subhead"><button data-act="ng-back" data-sfx="back">← Back</button><h2>New game</h2>
            <ol class="mu-steps">${STEPS.map(([id, name], k) => `<li class="${k === i ? 'is-on' : k < i ? 'is-done' : ''}">${name}</li>`).join('')}</ol></div>
        <div class="mu-wizard-body" data-keep="wizard">${body}</div>
        <div class="mu-wizard-foot">${block ? `<span class="mu-muted">${esc(block)}</span>` : '<span></span>'}
            ${wz.step === 'review' ? '<button class="mu-primary mu-big" data-act="ng-start" data-sfx="success">Start the game ▶</button>' : `<button class="mu-primary mu-big" data-act="ng-next" ${block ? 'aria-disabled="true"' : ''}>Next ▶</button>`}</div>
    </div>`;
}

Object.assign(ACT, {
    'ng-world-new': () => openCreatorNew(styleOf(W()), state.wizard.mode === 'scenario'),
    'ng-world-edit': (el) => openCreatorEdit(el.dataset.id!),
    'ng-world-import': async () => { const w = await importWorldFile(); if (w) { state.wizard.world = w.id; state.wizard.hero = freshHero(w); notify(); } },
    'ng-diff': (el) => { state.wizard.difficulty = el.dataset.v; notify(); },
    'ng-tpl-load': (el) => {
        const wz = state.wizard, t = templateById(el.dataset.id!); if (!t?.start) return;
        const w = getWorld(t.world);
        if (!w) { toast(`Its world (“${t.worldName}”) is not installed.`, 'error'); return; }
        if (worldLocked(w)) { toast(LOCKED_NOTE, 'info'); return; }
        if (wz.world !== w.id) { wz.world = w.id; wz.hero = freshHero(w); setWorldDicts(w.id, w.i18n ?? {}); }
        // the people, by card (or, for a card made again, by name)
        const chars = characters();
        const find = (a: string) => chars.find(c => c.avatar === a)?.avatar ?? chars.find(c => String(c.name ?? '').toLowerCase() === (t.start!.names[a] ?? '').toLowerCase())?.avatar ?? '';
        const map = new Map(t.start.cast.map(a => [a, find(a)]));
        const missing = t.start.cast.filter(a => !map.get(a)).map(a => t.start!.names[a] || a);
        const has = (a: string) => map.get(a) || chars.find(c => c.avatar === a)?.avatar || '';
        Object.assign(wz, {
            tpl: t.id, tplName: undefined, tplSetup: undefined,
            cast: t.start.cast.map(a => map.get(a)).filter(Boolean), examples: t.start.examples,
            loreOff: [...t.start.loreOff], difficulty: t.start.difficulty,
            hh: t.start.households.map(h => ({ members: h.members.map(has).filter(Boolean), ties: h.ties.map(x => ({ ...x, a: has(x.a) || x.a, b: has(x.b) || x.b })) })).filter(h => h.members.length),
            family: t.start.family.map(f => ({ ...f, avatar: has(f.avatar) })).filter(f => f.avatar),
            setup: isEmptySetup(t.setup) ? wz.setup : false,
            step: 'hero',
        });
        toast(`Loaded “${t.name}”: the world, the people, their lorebooks, the households and the difficulty are set.${missing.length ? ` Not in your SillyTavern any more: ${missing.join(', ')}.` : ''} Choose your character.`, missing.length ? 'warn' : 'success', { ms: 8000 });
        notify();
    },
    'ng-tpl-save': () => {
        const wz = state.wizard, w = W();
        const loaded = wz.tpl && templateById(wz.tpl);
        const name = (wz.tplName ?? (loaded && loaded.world === w.id ? loaded.name : `${w.name} start`)).trim();
        if (!name) { toast('Give the template a name.', 'info'); return; }
        const { t, isNew } = saveInto(w, name, { start: tplStartOf() });
        wz.tpl = t.id; wz.tplName = undefined;
        toast(isNew ? `Saved as the template “${t.name}”. Start another game of ${w.name} from it at the first step.` : `The template “${t.name}” is updated${isEmptySetup(t.setup) ? '' : ' (its setup is kept)'}.`, 'success', { ms: 7000 });
        notify();
    },
    'ng-heromode': (el) => { state.wizard.heroMode = el.dataset.v || null; notify(); },
    'ng-persona': (el) => {
        const wz = state.wizard; wz.persona = el.dataset.file;
        const sheet = personaSheet(wz.persona!); const w = W();
        if (sheet && sheet.world === w.id) { wz.hero.traits = JSON.parse(JSON.stringify(sheet.traits ?? {})); if (w.catalogs.origins?.some(o => o.id === sheet.origin)) wz.hero.origin = sheet.origin; wz.hero.bio = sheet.bio ?? ''; }
        notify();
    },
    'ng-world': (el) => { if (worldLocked(getWorld(el.dataset.id!))) { toast(LOCKED_NOTE, 'info'); return; } state.wizard.world = el.dataset.id; state.wizard.hero = freshHero(W()); setWorldDicts(W().id, W().i18n ?? {}); notify(); },
    'ng-next': () => { const i = STEPS.findIndex(s => s[0] === state.wizard.step); if (canGo(state.wizard.step)) return; state.wizard.step = STEPS[i + 1][0]; notify(); },
    'ng-back': () => { const i = STEPS.findIndex(s => s[0] === state.wizard.step); if (i <= 0) state.wizard.mode = null; else state.wizard.step = STEPS[i - 1][0]; notify(); },
    'ng-mode': (el) => { state.wizard.mode = el.dataset.v || null; notify(); },
    'ng-cast-all': () => {
        const wz = state.wizard; const ids = shownChars('cast', castList()).map(c => c.avatar);
        wz.cast = ids.every(a => wz.cast.includes(a)) ? wz.cast.filter((a: string) => !ids.includes(a)) : [...new Set([...wz.cast, ...ids])]; notify();
    },
    'ng-lore': (el) => { const l: string[] = (state.wizard.loreOff ??= []); const n = el.dataset.name!; const i = l.indexOf(n); i >= 0 ? l.splice(i, 1) : l.push(n); notify(); },
    'ng-as-open': () => { state.wizard.asOpen = true; state.wizard.asq = ''; notify(); },
    'ng-as-close': () => { state.wizard.asOpen = false; notify(); },
    'ng-as': (el) => { state.wizard.as = el.dataset.file; state.wizard.asOpen = false; notify(); },
    'ng-pick': (el) => { state.wizard.pick = el.dataset.avatar; notify(); },
    'ng-scenario': async (el) => {
        const wz = state.wizard;
        if (!wz.pick) { toast('Choose a character.', 'info'); return; }
        state.busy = 'Opening the chat'; notify();
        try {
            await openCharacter(wz.pick, el.dataset.fresh === '1');
            if (wz.as && wz.as !== persona()) await usePersona(wz.as);
            state.wizard = null; state.view = 'chat';
        } catch (e: any) { toast(e?.message ?? 'Could not open the chat.', 'error'); }
        finally { state.busy = ''; notify(); }
    },
    'ng-cast': (el) => { const a = el.dataset.avatar!, l: string[] = state.wizard.cast; state.wizard.cast = l.includes(a) ? l.filter(x => x !== a) : [...l, a]; notify(); },
    'ng-look': (el) => { const h = state.wizard.hero; h.appearance[el.dataset.k!] = h.appearance[el.dataset.k!] === el.dataset.v ? '' : el.dataset.v; delete ((state.wizard as any).lookOther ??= {})[el.dataset.k!]; notify(); },
    // "Other": write your own instead of one of the options
    'ng-look-other': (el) => {
        const k = el.dataset.k!, lo = ((state.wizard as any).lookOther ??= {}), h = state.wizard.hero;
        const opts = W().sheet.appearance?.find(a => a.id === k)?.options ?? [];
        const on = lo[k] || (!!h.appearance[k] && !opts.includes(h.appearance[k]));
        if (on) { delete lo[k]; if (!opts.includes(h.appearance[k])) h.appearance[k] = ''; }
        else { lo[k] = true; h.appearance[k] = ''; requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`#mundi-root [data-focus="ngo-${CSS.escape(k)}"]`)?.focus()); }
        notify();
    },
    'ng-room-edit': (el) => { at(el); const id = el.dataset.id!; ui().roomEdit = ui().roomEdit === id ? '' : id; notify(); },
    'ng-room-acts-reset': (el) => { at(el); const wz = store(); if (wz.roomActs) delete wz.roomActs[ui().roomEdit]; changed(); },
    'ng-room-add': (el) => { at(el); ui().roomForm = { name: '', desc: '', tags: ['leisure'], bg: '' }; notify(); },
    'ng-room-cancel': (el) => { at(el); ui().roomForm = null; notify(); },
    'ng-room-tag': (el) => { at(el); const f = ui().roomForm; if (!f) return; const t = el.dataset.v!; f.tags = f.tags.includes(t) ? f.tags.filter((x: string) => x !== t) : [...f.tags, t]; notify(); },
    'ng-room-pic': async (el) => {
        at(el); const f = ui().roomForm; if (!f) return; const w = WW(); const file = await pickFile(); if (!file) return;
        try { f.bg = await uploadWorldPicture(w, file, `room-${f.name || 'new'}`); } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        notify();
    },
    'ng-room-save': (el) => {
        at(el); const f = ui().roomForm; if (!f?.name.trim()) return;
        extraOf().push({ id: `x-${Date.now().toString(36)}`, name: f.name.trim(), desc: f.desc.trim(), tags: f.tags.length ? f.tags : ['leisure'], ...(f.bg ? { bg: f.bg } : {}) });
        ui().roomForm = null; changed();
    },
    'ng-room-x': (el) => {
        at(el); const id = el.dataset.id!;
        if (HT === 'game' && game()?.player.loc === id) { toast('You are in that room: go somewhere else first.', 'info'); return; }
        store().extraRooms = extraOf().filter(r => r.id !== id); if (ui().roomEdit === id) ui().roomEdit = ''; changed();
    },
    'ng-room': (el) => {
        at(el); const on = roomsOf(); const id = el.dataset.id!;
        if (HT === 'game' && on.includes(id) && game()?.player.loc === id) { toast('You are in that room: go somewhere else first.', 'info'); return; }
        store().rooms = on.includes(id) ? on.filter(x => x !== id) : [...on, id]; changed();
    },
    'ng-situation': (el) => { startOf().id = el.dataset.id!; notify(); },
    'ng-start-book': (el) => { const st = startOf(), n = el.dataset.name!; st.books = st.books.includes(n) ? st.books.filter((b: string) => b !== n) : [...st.books, n]; notify(); },
    'ng-start-gen': async () => {
        const st = startOf(), w = W(); if (!st.books.length || st.busy) return;
        st.busy = true; notify();
        try {
            const lore = await loreText(st.books);
            const people = [...(state.wizard.examples ? w.cast.examples.map(e => e.name) : []), ...state.wizard.cast.map((a: string) => charOf(a)?.name ?? '')].filter(Boolean);
            const prompt = `You are setting up a "scenario" for an interactive story game: one house (or mansion) is the whole stage, a few people live there, and the player ({{user}}) lives there too. Work, errands and nights out happen off-screen.\n\nThe house: ${w.name}. ${w.setting}\nThe people who live there: ${people.join(', ') || '(not chosen yet)'}.\n\nLorebook notes to adapt (use what fits; move it all into this house):\n${lore}\n\nWrite the premise: 3 to 6 sentences, present tense, plain prose, no lists or headings. Say why these people share the house, how {{user}} fits in, and the tension or situation the story starts with. Write {{user}} for the player. Reply with the premise only.`;
            const out = (await quiet(prompt, 500)).replace(/^\s*(premise\s*:)?\s*/i, '').trim();
            if (out) st.text = out.slice(0, 4000); else toast('Your AI sent nothing back. Try again.', 'error');
        } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        st.busy = false; notify();
    },
    'ng-origin': (el) => { state.wizard.hero.origin = el.dataset.id; notify(); },
    'ng-play': (el) => { state.wizard.play = el.dataset.v; notify(); },
    'ng-cls': (el) => { const x = rpgState(); if (!x) return; const c = x.r.classes.find(k => k.id === el.dataset.id); if (!c) return; x.wz.rpg = { cls: c.id, attrs: defaultAttrs(x.r, c), skills: c.skills.slice(0, 2) }; notify(); },
    'ng-attr': (el) => {
        const x = rpgState(); if (!x) return; const id = el.dataset.id!, d = Number(el.dataset.d);
        const v = (x.s.attrs[id] ?? 8) + d; if (v < 8 || v > 15) return;
        const next = { ...x.s.attrs, [id]: v }; if (pointsUsed(next) > POINTS) return;
        x.s.attrs = next; notify();
    },
    'ng-skill': (el) => { const x = rpgState(); if (!x) return; const id = el.dataset.id!; const l = x.s.skills; x.s.skills = l.includes(id) ? l.filter(k => k !== id) : [...l, id].slice(-2); notify(); },
    'ng-trait': (el) => { toggleTrait(W().sheet.traits ?? [], state.wizard.hero.traits, el.dataset.k!, el.dataset.v!); notify(); },
    'ng-portrait': async () => {
        const blob = await pickAndCrop();
        if (!blob) return;
        if (state.wizard.portraitUrl) URL.revokeObjectURL(state.wizard.portraitUrl);
        state.wizard.hero.portrait = blob; state.wizard.portraitUrl = URL.createObjectURL(blob); notify();
    },
    'ng-portrait-clear': () => { state.wizard.hero.portrait = null; state.wizard.portraitUrl = ''; notify(); },
    'ng-start': async () => {
        const wz = state.wizard;
        try {
            await startNewGame({ world: W(), cast: wz.cast, examples: wz.examples, hero: { ...wz.hero, name: wz.hero.name.trim() }, persona: wz.heroMode === 'existing' ? wz.persona : undefined, lore: chosenLore(),
                households: (wz.hh ?? []).filter((h: any) => h.members.length), family: wz.family ?? [], home: wz.home ?? undefined, difficulty: wz.difficulty ?? 'normal',
                approval: wz.approval ?? undefined, ties: (wz.rels ?? []).filter((t: any) => t.a !== t.b), mode: rpgOf(W()) ? playMode() as any : undefined, rpg: rpgState()?.s, memoriesFrom: wz.memories || undefined, jobs: wz.jobs ?? undefined, rooms: isScenario(W()) ? roomsOf() : undefined, extraRooms: isScenario(W()) ? extraOf() : undefined, roomActs: isScenario(W()) ? wz.roomActs : undefined, start: isScenario(W()) ? { id: startOf().id, text: startOf().text } : undefined });
            const setup = !!wz.setup, tplSetup = usingTplSetup() ? wz.tpl as string : '';
            const tplName = wz.tpl && templateById(wz.tpl)?.world === W().id ? templateById(wz.tpl)!.name : '';
            state.wizard = null;
            const g = game(); if (g && tplName) { (g as any).template = tplName; saveGame(); }
            if (tplSetup) { const { openTemplateSetup } = await import('./setupui.js'); state.busy = ''; notify(); openTemplateSetup(tplSetup); }
            else if (setup) { const { runSetup } = await import('./setupui.js'); state.busy = ''; notify(); void runSetup(); }
        } catch (e: any) {
            console.error('[Mundi] new game', e);
            toast(e?.message ?? 'Could not start the game.', 'error');
        } finally { state.busy = ''; notify(); }
    },
});

Object.assign(INPUT, {
    'ng-examples': (el) => { state.wizard.examples = el.checked; notify(); },
    'ng-setup': (el) => { state.wizard.setup = el.checked; if (el.checked && usingTplSetup()) { state.wizard.tplSetup = false; notify(); } },
    'ng-tpl-setup': (el) => { state.wizard.tplSetup = el.checked; if (el.checked) state.wizard.setup = false; notify(); },
    'ng-tpl-name': (el) => { state.wizard.tplName = el.value; },
    'ng-mem': (el) => { state.wizard.memories = el.value; },
    'ng-q': (el) => { state.wizard.q = el.value; notify(); },
    'ng-pq': (el) => { state.wizard.pq = el.value; notify(); },
    'ng-sq': (el) => { state.wizard.sq = el.value; notify(); },
    'ng-asq': (el) => { state.wizard.asq = el.value; notify(); },
    'ng-name': (el) => { state.wizard.hero.name = el.value; notify(); },
    'ng-look-txt': (el) => { state.wizard.hero.appearance[el.dataset.k!] = el.value.trim() ? el.value : ''; },   // no re-render while you type
    'ng-age': (el) => { state.wizard.hero.age = Number(el.value); const s = el.previousElementSibling; if (s) s.textContent = `Age · ${el.value}`; },
    'ng-bio': (el) => { state.wizard.hero.bio = el.value; },
    'ng-room-f': (el) => { at(el); const f = ui().roomForm; if (!f) return; f[el.dataset.k!] = el.value; if (el.dataset.k === 'name') { const b = document.querySelector('[data-act="ng-room-save"]'); b?.toggleAttribute('aria-disabled', !el.value.trim()); } },
    'ng-room-act': (el) => {
        at(el); const wz = store(), w = WW(); const p = w.places.find(x => x.id === ui().roomEdit) ?? extraOf().find(x => x.id === ui().roomEdit); if (!p) return;
        const cur = new Set(roomActs(w, p)); const a = el.dataset.a!;
        if ((el as HTMLInputElement).checked) cur.add(a); else cur.delete(a);
        (wz.roomActs ??= {})[p.id] = [...cur];
        if (HT === 'game') { saveGame(); refreshPrompt(); }
    },
    'ng-start-text': (el) => { startOf().text = el.value; },
    'ng-start-bq': (el) => { startOf().bq = el.value; notify(); },
});
