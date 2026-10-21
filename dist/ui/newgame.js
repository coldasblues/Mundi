// New game: first a scenario (one character card, straight into a chat) or a world;
// a world goes: style and world → who lives in it → your character (the world's own sheet) → start.
import { state, notify, esc, toast } from '../core/store.js';
import { DIFFICULTIES } from '../sim/bills.js';
import { worlds, getWorld, worldFile, isCustom, exampleTag, styleOf, gameMode, GAME_MODES, worldLocked } from '../core/world.js';
import { openCreatorNew, openCreatorEdit, importWorldFile } from './creator.js';
import { setWorldDicts } from '../core/tr.js';
import { characters, thumb, personas, personaThumb, persona, openCharacter, usePersona, charLorebooks, charOf } from '../st/bridge.js';
import { startNewGame } from '../sim/game.js';
import { money } from '../sim/needs.js';
import { ACT, INPUT } from './reg.js';
import { styleName, inWorld, LOCKED_NOTE } from './styles.js';
import { pickAndCrop } from './cropper.js';
import { icon } from './icons.js';
import { stepHouseholds, yourHouseholdHtml, stepHome } from './ngfamily.js';
import { traitsHtml, toggleTrait } from './traits.js';
import { charPicker, shownChars, resetPick } from './charpick.js';
const STEPS = [['world', 'World'], ['cast', 'People'], ['homes', 'Households'], ['hero', 'Your character'], ['house', 'Home'], ['review', 'Start']];
const W = () => getWorld(state.wizard.world);
function freshHero(w) {
    return {
        name: '', age: w.sheet.age?.default ?? 24, appearance: {}, origin: w.catalogs.origins?.[0]?.id ?? '',
        traits: Object.fromEntries((w.sheet.traits ?? []).map(t => [t.id, []])), bio: '', portrait: null,
    };
}
export function startWizard() {
    resetPick('cast');
    resetPick('scen');
    const w = getWorld('modern') ?? worlds()[0];
    state.wizard = { mode: null, sq: '', pick: '', step: 'world', world: w.id, examples: false, setup: true, cast: [], q: '', hero: freshHero(w), portraitUrl: '' };
    setWorldDicts(w.id, w.i18n ?? {});
    state.view = 'newgame';
    notify();
}
function stepWorld() {
    const wz = state.wizard;
    const list = worlds();
    // Medieval and RPG worlds wait for the next update: shown, but locked
    const open = list.filter(w => !worldLocked(w)), locked = list.filter(w => worldLocked(w));
    if (worldLocked(getWorld(wz.world)))
        wz.world = open[0]?.id ?? wz.world;
    return `<h3>World</h3><div class="mu-cards">${[...open, ...locked].map(w => `
            <div class="mu-worldcard-wrap ${worldLocked(w) ? 'is-locked' : ''}"><button class="mu-worldcard ${wz.world === w.id ? 'is-on' : ''}" data-act="ng-world" data-id="${esc(w.id)}" ${worldLocked(w) ? `aria-disabled="true" title="${esc(LOCKED_NOTE)}"` : ''}>
                <span class="mu-worldart" style="${w.cover ? `background-image:url('${worldFile(w, w.cover)}')` : ''}"><em class="mu-style-tag is-${esc(styleOf(w))}">${esc(styleName(styleOf(w)))}</em>${worldLocked(w) ? `<span class="mu-lockbadge">${icon('pin')}<b>Next update</b><small>with the new RPG mode</small></span>` : ''}</span>
                <b data-notr>${esc(inWorld(w, w.name))}</b><small>${GAME_MODES.find(m => m.id === gameMode(w)).name}${isCustom(w.id) ? ' · Made by you' : ''}</small><p data-notr>${esc(inWorld(w, w.description))}</p>
            </button>${isCustom(w.id) ? `<button class="mu-ghost mu-ibtn mu-world-edit" data-act="ng-world-edit" data-id="${esc(w.id)}" title="Edit this world">${icon('edit')}</button>` : ''}</div>`).join('')}
            <button class="mu-worldcard is-new" data-act="ng-world-new"><span class="mu-worldart">${icon('plus')}</span><b>Create a world</b><small>With the world creator</small><p>Choose a style, start from a ready world or from nothing, and change everything.</p></button>
            <button class="mu-worldcard is-new is-import" data-act="ng-world-import"><span class="mu-worldart">${icon('upload')}</span><b>Import a world</b><small>A .mundi-world.json file</small><p>A world someone exported from Mundi.</p></button></div>`;
}
// The cast: your characters, with folders or without, by tag, by name or only favorites.
const castList = () => characters();
function stepCast() {
    const wz = state.wizard;
    return `
        <h3>Your characters</h3>
        <p class="mu-muted">Pick cards from your SillyTavern to live in this world. Mundi gives each one a home, a routine and a job; the cards themselves are not changed.</p>
        ${charPicker({ key: 'cast', list: castList(), selected: wz.cast, act: 'ng-cast', multi: true, selectAllAct: 'ng-cast-all', placeholder: 'Search your characters' })}`;
}
// Your character: one you already have (a SillyTavern persona) or a new one.
function stepHeroChoice() {
    return `<div class="mu-heropick is-modes">
        <button class="mu-herocard" data-act="ng-heromode" data-v="existing"><i>${icon('users')}</i><b>Use a ready character</b><p>Play with one of your personas. Its description stays as it is.</p></button>
        <button class="mu-herocard" data-act="ng-heromode" data-v="new"><i>${icon('plus')}</i><b>Create a new character</b><p>Made with this world's sheet and saved to your personas.</p></button>
    </div>`;
}
function stepHeroExisting() {
    const wz = state.wizard;
    const q = String(wz.pq ?? '').toLowerCase();
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
    if (!mode)
        return stepHeroChoice();
    // once you have a character: who lives with you
    if (mode === 'existing')
        return `${stepHeroExisting()}${state.wizard.persona ? yourHouseholdHtml() : ''}`;
    return `<div class="mu-row"><button class="mu-ghost" data-act="ng-heromode" data-v="">${icon('back')}<span>Back</span></button></div>${stepHeroNew()}${state.wizard.hero.name.trim() ? yourHouseholdHtml() : ''}`;
}
function stepHeroNew() {
    const w = W(), h = state.wizard.hero, sh = w.sheet;
    const origin = (w.catalogs.origins ?? []);
    return `<div class="mu-creator">
        <section class="mu-portrait">
            <div class="mu-portrait-img" style="${state.wizard.portraitUrl ? `background-image:url('${state.wizard.portraitUrl}')` : ''}">${state.wizard.portraitUrl ? '' : `<span>${esc((h.name || '?').slice(0, 2).toUpperCase())}</span>`}</div>
            <button data-act="ng-portrait">Choose an image</button>
            ${state.wizard.portraitUrl ? '<button class="mu-ghost" data-act="ng-portrait-clear">Use initials</button>' : '<small class="mu-muted">Without an image, your initials are used.</small>'}
        </section>
        <section class="mu-fields">
            <label class="mu-field"><span>Name</span><input data-input="ng-name" data-focus="ngname" maxlength="40" value="${esc(h.name)}" placeholder="What is your name?"></label>
            ${sh.age ? `<label class="mu-field"><span>Age · ${h.age}</span><input type="range" min="${sh.age.min}" max="${sh.age.max}" value="${h.age}" data-input="ng-age"></label>` : ''}
            ${(sh.appearance ?? []).map(a => {
        const v = h.appearance[a.id] ?? '', other = !!state.wizard.lookOther?.[a.id] || (!!v && !a.options.includes(v));
        return `<div class="mu-field"><span>${esc(a.label)}</span><div class="mu-chips">${a.options.map(o => `<button class="mu-chip ${v === o ? 'is-on' : ''}" data-act="ng-look" data-k="${esc(a.id)}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}<button class="mu-chip ${other ? 'is-on' : ''}" data-act="ng-look-other" data-k="${esc(a.id)}">${icon('edit')}<span>Other</span></button></div>
                ${other ? `<input class="mu-look-other" data-input="ng-look-txt" data-k="${esc(a.id)}" data-focus="ngo-${esc(a.id)}" maxlength="60" value="${esc(a.options.includes(v) ? '' : v)}" placeholder="Write your own (${esc(a.label.toLowerCase())})">` : ''}</div>`;
    }).join('')}
        </section>
        ${origin.length ? `<section class="mu-origins"><h3>Origin</h3><div class="mu-cards small">${origin.map(o => `
            <button class="mu-origin ${h.origin === o.id ? 'is-on' : ''}" data-act="ng-origin" data-id="${esc(o.id)}"><b>${esc(o.name)}</b><small>${money(w, o.money)}</small><p>${esc(o.desc ?? '')}</p></button>`).join('')}</div></section>` : ''}
        ${sh.traits?.length ? `<section class="mu-attrs">${traitsHtml(sh.traits, h.traits, 'ng-trait')}</section>` : ''}
        <section class="mu-bio"><label class="mu-field"><span>About you (optional)</span><textarea rows="4" data-input="ng-bio" data-focus="ngbio" placeholder="Personality, quirks, what drives you">${esc(h.bio)}</textarea></label></section>
    </div>`;
}
function stepReview() {
    const wz = state.wizard, w = W(), h = wz.hero;
    const origin = w.catalogs.origins?.find(o => o.id === h.origin);
    const people = (wz.examples ? w.cast.examples.length : 0) + wz.cast.length;
    return `<div class="mu-panel mu-review">
        ${wz.heroMode === 'existing'
        ? `<p><b data-notr>${esc(personas().find(p => p.file === wz.persona)?.name ?? '')}</b> · your persona</p>`
        : `<p><b>${esc(h.name)}</b>, ${h.age} · ${esc(origin?.name ?? '')}</p>`}
        <p>World: <b>${esc(w.name)}</b> · ${people} ${people === 1 ? 'person lives' : 'people live'} here.</p>
        <h4>Difficulty</h4>
        <div class="mu-heropick is-start mu-diff">${DIFFICULTIES.map(d => `<button class="mu-herocard ${(wz.difficulty ?? 'normal') === d.id ? 'is-on' : ''}" data-act="ng-diff" data-v="${d.id}"><b>${d.name}</b><p>${d.desc}</p></button>`).join('')}</div>
        <p class="mu-muted">Mundi will create in your SillyTavern:</p>
        ${charLoreHtml()}
        <ul class="mu-muted mu-review-list">${wz.examples ? '<li>the example characters\' cards</li>' : ''}${wz.heroMode === 'existing' ? '' : '<li>your persona</li>'}<li>the lorebook “Mundi - ${esc(w.name)}”</li><li>a group chat for this game (each save is a chat of that group)</li></ul>
        <label class="mu-check"><input type="checkbox" data-input="ng-setup" ${wz.setup ? 'checked' : ''}><span>Set up from the lore<small>Once the game starts, the AI reads its lorebooks and the characters' cards and proposes what each person is, who is the law, the groups and their bases, and the world's own laws. You review it before anything is applied. A few AI calls.</small></span></label>
    </div>`;
}
// Characters of this game with lorebooks of their own: keep each lorebook always on in this world, or not.
function gameCast() {
    const wz = state.wizard, w = W();
    const ex = wz.examples ? characters().filter(c => w.cast.examples.some(e => exampleTag(w, e) === c.data?.extensions?.mundi?.example)).map(c => c.avatar) : [];
    return [...new Set([...ex, ...wz.cast])];
}
function charLoreHtml() {
    const rows = gameCast().map(a => ({ a, books: charLorebooks(a) })).filter(r => r.books.length);
    if (!rows.length)
        return '';
    const off = state.wizard.loreOff ?? [];
    return `<section class="mu-charlore-pick"><h4>Characters' lorebooks</h4>
        <p class="mu-muted">Checked: always on in this world. Unchecked: SillyTavern still uses it when that character speaks.</p>
        ${rows.map(r => `<div class="mu-charlore-row"><img src="${esc(thumb(r.a))}" alt=""><b data-notr>${esc(charOf(r.a)?.name ?? '')}</b>
            <div class="mu-chips">${r.books.map(b => `<label class="mu-check"><input type="checkbox" data-act="ng-lore" data-name="${esc(b)}" ${off.includes(b) ? '' : 'checked'}><span data-notr>${esc(b)}</span></label>`).join('')}</div></div>`).join('')}</section>`;
}
const chosenLore = () => { const off = state.wizard.loreOff ?? []; return [...new Set(gameCast().flatMap(a => charLorebooks(a)))].filter(b => !off.includes(b)); };
function canGo(step) {
    const wz = state.wizard;
    if (step === 'cast' && !wz.examples && !wz.cast.length)
        return 'Choose at least one person to live in the world.';
    if (step === 'hero') {
        if (!wz.heroMode)
            return 'Choose how you want to play.';
        if (wz.heroMode === 'existing') {
            if (!wz.persona)
                return 'Choose one of your personas.';
        }
        else if (!wz.hero.name.trim())
            return 'Choose a name for your character.';
    }
    return '';
}
/* ---------- first: a scenario (one character, straight to the chat) or a world ---------- */
function modeHtml() {
    return `<div class="mu-wizard">
        <div class="mu-subhead"><button data-act="to-menu" data-sfx="back">← Menu</button><h2>New game</h2><span></span></div>
        <div class="mu-wizard-body"><div class="mu-heropick is-modes">
            <button class="mu-herocard" data-act="ng-mode" data-v="scenario"><i>${icon('chat')}</i><b>Scenario</b><p>Pick a character card and go straight into a chat with them, in Mundi's scene. No map, no clock: just the story.</p></button>
            <button class="mu-herocard" data-act="ng-mode" data-v="world"><i>${icon('globe')}</i><b>World</b><p>A living world: a map, time passing, people with routines, jobs, money and the style's own mechanics.</p></button>
        </div></div></div>`;
}
function scenarioHtml() {
    const wz = state.wizard;
    const me = wz.as || persona();
    const c = wz.pick && characters().find(x => x.avatar === wz.pick);
    return `<div class="mu-wizard">
        <div class="mu-subhead"><button data-act="ng-mode" data-v="" data-sfx="back">← Back</button><h2>Scenario</h2><span></span></div>
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
function personaPicker(me) {
    const wz = state.wizard;
    const q = String(wz.asq ?? '').toLowerCase();
    const list = personas().filter(p => !q || p.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="mu-dlg-veil" data-act="ng-as-close"></div><div class="mu-panel mu-scpick" role="dialog"><header><h3>You play as</h3><button class="mu-ibtn mu-ghost" data-act="ng-as-close" aria-label="Close">${icon('x')}</button></header>
        <input class="mu-search" type="search" data-input="ng-asq" data-focus="ngasq" placeholder="Search your personas" value="${esc(wz.asq ?? '')}">
        <div class="mu-scpick-grid" data-keep="aspick">${list.map(p => `<button class="${p.file === me ? 'is-on' : ''}" data-act="ng-as" data-file="${esc(p.file)}"><img src="${esc(personaThumb(p.file))}" alt="" loading="lazy"><span data-notr>${esc(p.name)}</span></button>`).join('') || '<p class="mu-muted">You have no personas yet.</p>'}</div></div>`;
}
export function newGameHtml() {
    const wz = state.wizard;
    if (!wz)
        return '';
    if (!wz.mode)
        return modeHtml();
    if (wz.mode === 'scenario')
        return scenarioHtml();
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
    'ng-world-new': () => openCreatorNew(styleOf(W())),
    'ng-world-edit': (el) => openCreatorEdit(el.dataset.id),
    'ng-world-import': async () => { const w = await importWorldFile(); if (w) {
        state.wizard.world = w.id;
        state.wizard.hero = freshHero(w);
        notify();
    } },
    'ng-diff': (el) => { state.wizard.difficulty = el.dataset.v; notify(); },
    'ng-heromode': (el) => { state.wizard.heroMode = el.dataset.v || null; notify(); },
    'ng-persona': (el) => { state.wizard.persona = el.dataset.file; notify(); },
    'ng-world': (el) => { if (worldLocked(getWorld(el.dataset.id))) {
        toast(LOCKED_NOTE, 'info');
        return;
    } state.wizard.world = el.dataset.id; state.wizard.hero = freshHero(W()); setWorldDicts(W().id, W().i18n ?? {}); notify(); },
    'ng-next': () => { const i = STEPS.findIndex(s => s[0] === state.wizard.step); if (canGo(state.wizard.step))
        return; state.wizard.step = STEPS[i + 1][0]; notify(); },
    'ng-back': () => { const i = STEPS.findIndex(s => s[0] === state.wizard.step); if (i <= 0)
        state.wizard.mode = null;
    else
        state.wizard.step = STEPS[i - 1][0]; notify(); },
    'ng-mode': (el) => { state.wizard.mode = el.dataset.v || null; notify(); },
    'ng-cast-all': () => {
        const wz = state.wizard;
        const ids = shownChars('cast', castList()).map(c => c.avatar);
        wz.cast = ids.every(a => wz.cast.includes(a)) ? wz.cast.filter((a) => !ids.includes(a)) : [...new Set([...wz.cast, ...ids])];
        notify();
    },
    'ng-lore': (el) => { const l = (state.wizard.loreOff ??= []); const n = el.dataset.name; const i = l.indexOf(n); i >= 0 ? l.splice(i, 1) : l.push(n); notify(); },
    'ng-as-open': () => { state.wizard.asOpen = true; state.wizard.asq = ''; notify(); },
    'ng-as-close': () => { state.wizard.asOpen = false; notify(); },
    'ng-as': (el) => { state.wizard.as = el.dataset.file; state.wizard.asOpen = false; notify(); },
    'ng-pick': (el) => { state.wizard.pick = el.dataset.avatar; notify(); },
    'ng-scenario': async (el) => {
        const wz = state.wizard;
        if (!wz.pick) {
            toast('Choose a character.', 'info');
            return;
        }
        state.busy = 'Opening the chat';
        notify();
        try {
            await openCharacter(wz.pick, el.dataset.fresh === '1');
            if (wz.as && wz.as !== persona())
                await usePersona(wz.as);
            state.wizard = null;
            state.view = 'chat';
        }
        catch (e) {
            toast(e?.message ?? 'Could not open the chat.', 'error');
        }
        finally {
            state.busy = '';
            notify();
        }
    },
    'ng-cast': (el) => { const a = el.dataset.avatar, l = state.wizard.cast; state.wizard.cast = l.includes(a) ? l.filter(x => x !== a) : [...l, a]; notify(); },
    'ng-look': (el) => { const h = state.wizard.hero; h.appearance[el.dataset.k] = h.appearance[el.dataset.k] === el.dataset.v ? '' : el.dataset.v; delete (state.wizard.lookOther ??= {})[el.dataset.k]; notify(); },
    // "Other": write your own instead of one of the options
    'ng-look-other': (el) => {
        const k = el.dataset.k, lo = (state.wizard.lookOther ??= {}), h = state.wizard.hero;
        const opts = W().sheet.appearance?.find(a => a.id === k)?.options ?? [];
        const on = lo[k] || (!!h.appearance[k] && !opts.includes(h.appearance[k]));
        if (on) {
            delete lo[k];
            if (!opts.includes(h.appearance[k]))
                h.appearance[k] = '';
        }
        else {
            lo[k] = true;
            h.appearance[k] = '';
            requestAnimationFrame(() => document.querySelector(`#mundi-root [data-focus="ngo-${CSS.escape(k)}"]`)?.focus());
        }
        notify();
    },
    'ng-origin': (el) => { state.wizard.hero.origin = el.dataset.id; notify(); },
    'ng-trait': (el) => { toggleTrait(W().sheet.traits ?? [], state.wizard.hero.traits, el.dataset.k, el.dataset.v); notify(); },
    'ng-portrait': async () => {
        const blob = await pickAndCrop();
        if (!blob)
            return;
        if (state.wizard.portraitUrl)
            URL.revokeObjectURL(state.wizard.portraitUrl);
        state.wizard.hero.portrait = blob;
        state.wizard.portraitUrl = URL.createObjectURL(blob);
        notify();
    },
    'ng-portrait-clear': () => { state.wizard.hero.portrait = null; state.wizard.portraitUrl = ''; notify(); },
    'ng-start': async () => {
        const wz = state.wizard;
        try {
            await startNewGame({ world: W(), cast: wz.cast, examples: wz.examples, hero: { ...wz.hero, name: wz.hero.name.trim() }, persona: wz.heroMode === 'existing' ? wz.persona : undefined, lore: chosenLore(),
                households: (wz.hh ?? []).filter((h) => h.members.length), family: wz.family ?? [], home: wz.home ?? undefined, difficulty: wz.difficulty ?? 'normal' });
            const setup = !!wz.setup;
            state.wizard = null;
            if (setup) {
                const { runSetup } = await import('./setupui.js');
                state.busy = '';
                notify();
                void runSetup();
            }
        }
        catch (e) {
            console.error('[Mundi] new game', e);
            toast(e?.message ?? 'Could not start the game.', 'error');
        }
        finally {
            state.busy = '';
            notify();
        }
    },
});
Object.assign(INPUT, {
    'ng-examples': (el) => { state.wizard.examples = el.checked; notify(); },
    'ng-setup': (el) => { state.wizard.setup = el.checked; },
    'ng-q': (el) => { state.wizard.q = el.value; notify(); },
    'ng-pq': (el) => { state.wizard.pq = el.value; notify(); },
    'ng-sq': (el) => { state.wizard.sq = el.value; notify(); },
    'ng-asq': (el) => { state.wizard.asq = el.value; notify(); },
    'ng-name': (el) => { state.wizard.hero.name = el.value; notify(); },
    'ng-look-txt': (el) => { state.wizard.hero.appearance[el.dataset.k] = el.value.trim() ? el.value : ''; }, // no re-render while you type
    'ng-age': (el) => { state.wizard.hero.age = Number(el.value); const s = el.previousElementSibling; if (s)
        s.textContent = `Age · ${el.value}`; },
    'ng-bio': (el) => { state.wizard.hero.bio = el.value; },
});
