// The world creator: everything a world is made of, editable (Porto Alto itself could be built with it).
// A world starts from a base (a copy of Porto Alto, or the Modern rules with an empty map) and is saved as a
// JSON file in SillyTavern's user files. Inputs bind to the draft by path: data-path="statuses.2.name".
import { state, notify, esc, toast, busy } from '../core/store.js';
import { getWorld, bgOf, worlds, styleOf, isCustom, gameMode, GAME_MODES } from '../core/world.js';
import { STYLES, inWorld } from './styles.js';
import { SKINS } from './skins.js';
import { tr, setWorldDicts } from '../core/tr.js';
import { lorebooks } from '../st/bridge.js';
import { hm, WEEKDAYS } from '../sim/time.js';
import { newWorldFrom, saveWorld, deleteWorld, exportWorld, importWorld, uploadWorldPicture, appsOf, slug, newId } from '../sim/creator.js';
import { mapEditorHtml, ME } from './mapedit.js';
import { pickFile } from './cropper.js';
import { icon, ICON_NAMES } from './icons.js';
import { ACT, INPUT } from './reg.js';
const TABS = [['general', 'General'], ['features', 'Features'], ['needs', 'Needs'], ['maps', 'Maps & places'], ['homes', 'Homes & rent'],
    ['actions', 'Things to do'], ['jobs', 'Jobs'], ['character', 'Your character'], ['people', 'Routines'], ['lore', 'Lore'], ['books', 'Lorebooks & notes']];
export const CW = {
    w: null, tab: 'general', dirty: false, saving: false, confirmDel: false,
    sel: { needs: 0, actions: 0, jobs: 0, zones: 0, kinds: '', traits: 0, origins: 0, people: 0, routine: '', lore: 0 },
    start: null,
};
export const W = () => CW.w;
/* ---------- binding by path ---------- */
export function getPath(path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), CW.w); }
export function setPath(path, v) {
    const keys = path.split('.');
    const last = keys.pop();
    let o = CW.w;
    for (const k of keys) {
        o[k] ??= /^\d+$/.test(last) ? [] : {};
        o = o[k];
    }
    if (v === undefined)
        delete o[last];
    else
        o[last] = v;
    CW.dirty = true;
}
const val = (p) => esc(getPath(p) ?? '');
export const txt = (label, p, ph = '') => `<label class="mu-field"><span>${label}</span><input data-input="cw" data-path="${p}" data-focus="${p}" value="${val(p)}" placeholder="${esc(ph)}"></label>`;
export const area = (label, p, rows = 3, ph = '') => `<label class="mu-field"><span>${label}</span><textarea rows="${rows}" data-input="cw" data-path="${p}" data-focus="${p}" placeholder="${esc(ph)}">${val(p)}</textarea></label>`;
export const num = (label, p, min = 0, step = 1) => `<label class="mu-field"><span>${label}</span><input type="number" min="${min}" step="${step}" data-input="cw" data-type="num" data-path="${p}" data-focus="${p}" value="${val(p)}"></label>`;
export const chk = (label, p, hint = '', inverse = false) => `<label class="mu-check"><input type="checkbox" data-input="cw" data-type="${inverse ? 'nbool' : 'bool'}" data-path="${p}" ${(inverse ? getPath(p) !== false : !!getPath(p)) ? 'checked' : ''}><span>${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`;
export const sel = (label, p, opts, type = '') => `<label class="mu-field"><span>${label}</span><select data-input="cw" data-path="${p}" ${type ? `data-type="${type}"` : ''}>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(getPath(p) ?? '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const time = (label, p) => `<label class="mu-field"><span>${label}</span><input type="time" data-input="cw" data-type="time" data-path="${p}" value="${hm(Number(getPath(p) ?? 0))}"></label>`;
const csv = (label, p, hint = '') => `<label class="mu-field"><span>${label}</span><input data-input="cw" data-type="csv" data-path="${p}" data-focus="${p}" value="${esc((getPath(p) ?? []).join(', '))}">${hint ? `<small class="mu-muted">${hint}</small>` : ''}</label>`;
const color = (label, p) => `<label class="mu-field mu-cw-color"><span>${label}</span><input type="color" data-input="cw" data-path="${p}" value="${val(p) || '#888888'}"></label>`;
const chips = (list, p) => { const on = getPath(p) ?? []; return `<div class="mu-chips">${list.map(x => `<button class="mu-chip ${on.includes(x) ? 'is-on' : ''}" data-act="cw-chip" data-path="${p}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`; };
// A list on the left (pick, add, remove) and the picked item's form on the right.
function master(key, path, label, form, add, empty = 'Nothing here yet.') {
    const list = getPath(path) ?? [];
    const i = Math.min(CW.sel[key] ?? 0, Math.max(0, list.length - 1));
    CW.sel[key] = i;
    return `<div class="mu-cw-master">
        <aside class="mu-cw-list" data-keep="cw-${key}">${list.map((x, k) => `<button class="mu-cw-row ${k === i ? 'is-on' : ''}" data-act="cw-pick" data-k="${key}" data-i="${k}">${label(x, k)}</button>`).join('') || `<p class="mu-muted">${empty}</p>`}
            <button class="mu-primary" data-act="cw-add" data-what="${add}">${icon('plus')}<span>Add</span></button></aside>
        <section class="mu-cw-form">${list.length ? `${form(i)}<button class="mu-danger mu-cw-del" data-act="cw-del" data-path="${path}.${i}">${icon('trash')}<span>Remove</span></button>` : ''}</section></div>`;
}
const placeOpts = (w, none = '') => [...(none ? [['', none]] : []), ...w.places.filter(p => !p.link).map(p => [p.id, p.name])];
const statusOpts = (w) => w.statuses.map(s => [s.id, `${s.icon} ${s.name}`]);
const zoneOpts = (w, none = '') => [...(none ? [['', none]] : []), ...w.homes.zones.map(z => [z.id, z.name])];
const traitOptions = (w) => (w.sheet.traits ?? []).flatMap(t => t.options);
/* ---------- tabs ---------- */
function tabGeneral(w) {
    return `<div class="mu-cw-grid">
        <section class="mu-cw-sec">${txt('Name', 'name')}${area('Short description (shown when choosing a world)', 'description', 3)}
            ${area('Setting (what the AI always knows about this world)', 'setting', 5)}</section>
        <section class="mu-cw-sec"><h4>Cover</h4><div class="mu-cw-cover" style="${esc(bgOf(w, w.cover))}">${w.cover ? '' : '<span>No cover</span>'}</div>
            <div class="mu-row"><button data-act="cw-cover">${icon('upload')}<span>Choose a picture</span></button>${w.maps[0] ? `<button class="mu-ghost" data-act="cw-cover-map">Use the first map</button>` : ''}</div></section>
        <section class="mu-cw-sec"><h4>Look: style and skin</h4>
            ${sel('Style (the words of the game and the device)', 'style', STYLES.filter(x => x.ready).map(x => [x.id, x.name]))}
            ${sel('Skin (colors of the HUD)', 'skin', (SKINS[styleOf(w)] ?? []).map(k => [k.id, k.name]))}
            <small class="mu-muted">Mix them as you like: the rules and the people stay the same. Players can still pick another skin in their settings.</small></section>
        <section class="mu-cw-sec"><h4>Money</h4><div class="mu-row2">${txt('Currency name', 'currency.name', 'Real')}${txt('Symbol', 'currency.symbol', 'R$')}</div></section>
        <section class="mu-cw-sec"><h4>Time</h4><div class="mu-row2">
            ${sel('The game starts on', 'time.startDay', WEEKDAYS.map((d, k) => [String(k + 1), d]), 'num')}${time('at', 'time.startMinutes')}</div>
            ${sel('Clock speed', 'time.speed', [['0', 'Paused'], ['30', '×0.5'], ['60', '×1 (1 real second = 1 game minute)'], ['120', '×2']], 'num')}
            <div class="mu-row2">${time('Sleeping ends at', 'sleep.until')}<p class="mu-muted">Travel: 30 minutes inside a town, 2 hours between towns.</p></div>
            ${chk('Sleep only at home', 'sleep.homeOnly')}
            <h4>Periods of the day</h4>
            ${w.time.periods.map((_p, k) => `<div class="mu-row mu-cw-inline">${txt('Name', `time.periods.${k}.name`)}${time('From', `time.periods.${k}.from`)}<button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="time.periods.${k}" title="Remove">${icon('x')}</button></div>`).join('')}
            <button class="mu-ghost" data-act="cw-add" data-what="period">${icon('plus')}<span>Add a period</span></button></section>
    </div>`;
}
function tabFeatures(w) {
    const apps = appsOf(w);
    w.features ??= {};
    w.features.apps = apps;
    return `<div class="mu-cw-grid">
        <section class="mu-cw-sec mu-cw-wide"><h4>Game mode</h4>${modeCards(gameMode(w), 'cw-mode')}
            ${gameMode(w) === 'custom' ? '<small class="mu-muted">Custom: turn each need on or off in the Needs tab, and the systems below here.</small>' : ''}</section>
        <section class="mu-cw-sec"><h4>Phone</h4>${chk('The player has a phone', 'features.phone')}${txt('What it is called', 'features.device', 'Phone')}
            <div class="mu-cw-apps">${apps.map((a, k) => `<div class="mu-cw-app ${a.on ? '' : 'is-off'}"><i style="--c:${esc(a.color)}">${icon(a.icon)}</i>
                <input type="checkbox" data-input="cw" data-type="bool" data-path="features.apps.${k}.on" ${a.on ? 'checked' : ''} title="On">
                <input data-input="cw" data-path="features.apps.${k}.name" data-focus="app${k}" value="${esc(a.name)}">
                <select data-input="cw" data-path="features.apps.${k}.icon">${ICON_NAMES().map(n => `<option ${n === a.icon ? 'selected' : ''}>${n}</option>`).join('')}</select>
                <input type="color" data-input="cw" data-path="features.apps.${k}.color" value="${esc(a.color)}"></div>`).join('')}</div>
            <small class="mu-muted">Rename an app, change its icon and color, or turn it off.</small></section>
        <section class="mu-cw-sec"><h4>Systems</h4>
            ${chk('Jobs and promotions', 'features.jobs', 'Off: nobody (not even you) works; no jobs on the map or the phone.', true)}
            ${chk('Plans: meet-ups, dates, "come with me"', 'features.plans', '', true)}
            ${chk('Rent', 'rent', 'Off: homes are free.')}
            ${w.rent ? `<div class="mu-row2">${num('Rent is paid every … days', 'rent.everyDays', 1)}${txt('Message when it is paid', 'rent.text')}</div>` : ''}</section>
    </div>`;
}
function tabNeeds(w) {
    return master('needs', 'statuses', s => `<b>${esc(s.icon)} ${esc(s.name)}</b><small>${s.hud ? 'On the HUD' : ''}</small>`, i => {
        const p = `statuses.${i}`;
        const s = w.statuses[i];
        return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Icon (an emoji)', `${p}.icon`)}</div>
            <div class="mu-row2">${color('Color', `${p}.color`)}${chk('Show on the HUD', `${p}.hud`)}</div>
            <div class="mu-row2">${chk('Only in the RPG mode', `${p}.rpg`, 'Like health: out of Life-Sim worlds.')}${gameMode(w) === 'custom' ? chk('Turned off in this world', `${p}.off`) : ''}</div>
            <div class="mu-row2">${num('Starts at', `${p}.start`)}${num('Maximum', `${p}.max`, 1)}</div>
            <h4>Drops over time</h4>${chk('It drops by itself', `${p}.decay`)}
            ${s.decay ? `<div class="mu-row2">${num('By', `${p}.decay.amount`, 0, 0.5)}${num('Every … game minutes', `${p}.decay.everyMinutes`, 1)}</div>${chk('Only while awake', `${p}.decay.awakeOnly`)}` : ''}
            ${num('Sleeping restores', `sleep.restore.${s.id}`)}
            <h4>At zero</h4>${chk('Something happens at zero', `${p}.zero`)}
            ${s.zero ? `${area('Message', `${p}.zero.text`, 2, 'You pass out… The bill is {cost}.')}
                <div class="mu-row2">${sel('You wake up at', `${p}.zero.place`, [['', '(stay where you are)'], ['home', 'Your home'], ...placeOpts(w)])}${num('It costs', `${p}.zero.cost`)}</div>
                <div class="mu-row2">${num('Comes back to', `${p}.zero.restore`)}${sel('While at zero, it drains', `${p}.zero.drain.status`, [['', '(nothing)'], ...statusOpts(w)])}</div>
                ${s.zero.drain?.status ? `<div class="mu-row2">${num('By', `${p}.zero.drain.amount`)}${num('Every … minutes', `${p}.zero.drain.everyMinutes`, 1)}</div>` : ''}` : ''}`;
    }, 'need');
}
const WHERE = [['tags', 'At places with a tag'], ['place', 'At one place'], ['home', 'At home'], ['anywhere', 'Anywhere']];
function tabActions(w) {
    const tags = [...new Set(w.places.flatMap(p => p.tags ?? []))];
    return master('actions', 'actions', a => `<b>${esc(a.icon ?? '')} ${esc(a.label || a.name)}</b><small>${a.cost ? `${esc(w.currency.symbol)}${a.cost} · ` : ''}${a.minutes} min</small>`, i => {
        const p = `actions.${i}`;
        const a = w.actions[i];
        const where = a.anywhere ? 'anywhere' : a.home ? 'home' : a.place ? 'place' : 'tags';
        return `<div class="mu-row2">${txt('Button text', `${p}.label`, 'Have a coffee')}${txt('Short name', `${p}.name`, 'Coffee')}</div>
            <div class="mu-row2">${txt('Icon (an emoji)', `${p}.icon`)}${num('Takes … minutes', `${p}.minutes`, 0)}</div>
            ${num(`Costs (${esc(w.currency.symbol)})`, `${p}.cost`)}
            <label class="mu-field"><span>Where</span><select data-act-input="cw-where" data-input="cw-where" data-i="${i}">${WHERE.map(([v, l]) => `<option value="${v}" ${where === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            ${where === 'tags' ? chips(tags, `${p}.tags`) : where === 'place' ? sel('Place', `${p}.place`, placeOpts(w)) : ''}
            <h4>Effects</h4><div class="mu-cw-effects">${w.statuses.map(s => num(`${s.icon} ${s.name}`, `${p}.effects.${s.id}`, -1000)).join('')}</div>`;
    }, 'action');
}
function tabJobs(w) {
    return master('jobs', 'occupations', o => `<b>${esc(o.name)}</b><small>${esc(w.places.find(p => p.id === o.place)?.name ?? '—')}</small>`, i => {
        const p = `occupations.${i}`;
        const o = w.occupations[i];
        return `${txt('Name', `${p}.name`)}<button class="mu-ghost" data-act="cw-rnd-job" data-i="${i}">${icon('redo')}<span>Randomize hours, pay and promotions</span></button>
            ${sel('Works at', `${p}.place`, placeOpts(w, '(choose a place)'))}
            <div class="mu-row2">${num('Shift length (hours)', `${p}.shift`, 1)}${num('Energy per shift', `${p}.cost.energy`)}</div>
            <div class="mu-row2">${num('Opens at (hour)', `${p}.hours.0`, 0)}${num('Closes at (hour)', `${p}.hours.1`, 0)}</div>
            <h4>Ranks and pay per hour</h4>
            ${o.ranks.map((_r, k) => `<div class="mu-row mu-cw-inline">${txt('Rank', `${p}.ranks.${k}.name`)}${num(`Pay (${esc(w.currency.symbol)}/h)`, `${p}.ranks.${k}.pay`)}
                ${k < o.ranks.length - 1 ? num('Shifts to be promoted', `${p}.promote.${k}`, 1) : '<span class="mu-cw-spacer"></span>'}
                <button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="${p}.ranks.${k}" title="Remove">${icon('x')}</button></div>`).join('')}
            <button class="mu-ghost" data-act="cw-add" data-what="rank" data-path="${p}.ranks">${icon('plus')}<span>Add a rank</span></button>
            <h4>Traits that help (faster promotions)</h4>${chips(traitOptions(w), `${p}.likes`)}
            <h4>Required traits (one of them)</h4>${chips(traitOptions(w), `${p}.needs`)}`;
    }, 'job');
}
function tabHomes(w) {
    const kinds = Object.entries(w.homes.kinds);
    return `<div class="mu-cw-grid">
        <section class="mu-cw-sec"><h4>Housing areas</h4>
            ${master('zones', 'homes.zones', z => `<b>${esc(z.name)}</b><small>${z.spots.length} homes · ${esc(w.currency.symbol)}${z.rent}</small>`, i => {
        const p = `homes.zones.${i}`;
        const z = w.homes.zones[i];
        return `${txt('Name', `${p}.name`)}${area('Description', `${p}.desc`, 2)}
                    <div class="mu-row2">${sel('Kind of home', `${p}.kind`, kinds.map(([id, k]) => [id, k.name]))}${num(`Rent (${esc(w.currency.symbol)})`, `${p}.rent`)}</div>
                    ${sel('On the map', `${p}.map`, w.maps.map(m => [m.id, m.name]))}
                    <p class="mu-muted">${z.spots.length} homes placed. They are numbered (House 1, House 2…).</p>
                    <button data-act="cw-homes-map" data-i="${i}">${icon('map')}<span>Place the homes on the map</span></button>`;
    }, 'zone', 'No housing areas yet.')}</section>
        <section class="mu-cw-sec"><h4>Kinds of home</h4>
            ${kinds.map(([id, k]) => `<div class="mu-cw-kind"><div class="mu-cw-cover is-small" style="${esc(bgOf(w, k.image))}"></div>
                <div>${txt('Name', `homes.kinds.${id}.name`)}${area('Description', `homes.kinds.${id}.desc`, 2)}
                <div class="mu-row"><button class="mu-ghost" data-act="cw-kind-img" data-id="${esc(id)}">${icon('image')}<span>Inside picture (scene)</span></button>
                ${kinds.length > 1 ? `<button class="mu-ghost" data-act="cw-del" data-path="homes.kinds.${id}">${icon('trash')}</button>` : ''}</div></div></div>`).join('')}
            <button class="mu-ghost" data-act="cw-add" data-what="kind">${icon('plus')}<span>Add a kind of home</span></button></section>
    </div>`;
}
function tabCharacter(w) {
    const s = w.sheet;
    return `<div class="mu-cw-grid">
        <section class="mu-cw-sec"><h4>Age</h4><div class="mu-row2">${num('From', 'sheet.age.min', 1)}${num('To', 'sheet.age.max', 1)}</div>${num('Default', 'sheet.age.default', 1)}
            <h4>Appearance</h4>
            ${(s.appearance ?? []).map((_a, k) => `<div class="mu-row mu-cw-inline">${txt('Trait', `sheet.appearance.${k}.label`)}${csv('Options (comma separated)', `sheet.appearance.${k}.options`)}<button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="sheet.appearance.${k}">${icon('x')}</button></div>`).join('')}
            <button class="mu-ghost" data-act="cw-add" data-what="look">${icon('plus')}<span>Add</span></button></section>
        <section class="mu-cw-sec"><h4>Traits the player picks</h4>
            ${(s.traits ?? []).map((_t, k) => `<div class="mu-cw-trait"><div class="mu-row2">${txt('Group', `sheet.traits.${k}.label`)}${num('Pick up to', `sheet.traits.${k}.max`, 1)}</div>${csv('Options (comma separated)', `sheet.traits.${k}.options`)}<button class="mu-ghost" data-act="cw-del" data-path="sheet.traits.${k}">${icon('trash')}<span>Remove</span></button></div>`).join('')}
            <button class="mu-ghost" data-act="cw-add" data-what="trait">${icon('plus')}<span>Add a group</span></button></section>
        <section class="mu-cw-sec mu-cw-wide"><h4>Origins (how you start)</h4>
            ${master('origins', 'catalogs.origins', o => `<b>${esc(o.name)}</b><small>${esc(w.currency.symbol)}${o.money}</small>`, i => {
        const p = `catalogs.origins.${i}`;
        return `${txt('Name', `${p}.name`)}${area('Description', `${p}.desc`, 2)}
                    <div class="mu-row2">${num(`Money (${esc(w.currency.symbol)})`, `${p}.money`)}${num('People you already know', `${p}.knows`)}</div>
                    ${sel('You live in', `${p}.home`, zoneOpts(w, '(first area)'))}`;
    }, 'origin')}</section>
    </div>`;
}
const TARGETS = (w) => [['home', 'Home'], ['work', 'Work'], ['leisure', 'Free time'], ...placeOpts(w)];
function routineEditor(w) {
    const ids = Object.keys(w.cast.routineTemplates);
    if (!ids.includes(CW.sel.routine))
        CW.sel.routine = ids[0] ?? '';
    const id = CW.sel.routine;
    const r = w.cast.routineTemplates[id];
    const days = (k, label) => `<h4>${label}</h4>${r[k].map((_s, j) => `<div class="mu-row mu-cw-inline">
        ${num('From hour', `cast.routineTemplates.${id}.${k}.${j}.0`, 0)}${sel('Goes to', `cast.routineTemplates.${id}.${k}.${j}.1`, TARGETS(w))}
        <button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="cast.routineTemplates.${id}.${k}.${j}">${icon('x')}</button></div>`).join('')}
        <button class="mu-ghost" data-act="cw-add" data-what="step" data-path="cast.routineTemplates.${id}.${k}">${icon('plus')}<span>Add a step</span></button>`;
    return `<section class="mu-cw-sec"><h4>Routines</h4><div class="mu-chips">${ids.map(x => `<button class="mu-chip ${x === id ? 'is-on' : ''}" data-act="cw-routine" data-id="${esc(x)}">${esc(x)}</button>`).join('')}
            <button class="mu-chip" data-act="cw-add" data-what="routine" title="New routine">${icon('plus')}</button><button class="mu-chip" data-act="cw-rnd-routine" title="New random routine">${icon('redo')}</button></div>
        ${r ? `${days('weekday', 'Weekdays')}${days('weekend', 'Weekends')}${ids.length > 1 ? `<button class="mu-ghost" data-act="cw-del" data-path="cast.routineTemplates.${id}">${icon('trash')}<span>Remove this routine</span></button>` : ''}` : ''}</section>`;
}
function tabPeople(w) {
    return `<div class="mu-cw-grid">
        ${routineEditor(w)}
    </div>`;
}
function tabLore(w) {
    return master('lore', 'lore', (l, k) => `<b>${esc((l.keys ?? []).join(', ') || `#${k + 1}`)}</b><small>${l.constant ? 'Always on' : ''}</small>`, i => {
        const p = `lore.${i}`;
        return `${csv('Keywords (comma separated)', `${p}.keys`, 'The entry is used when one of these comes up in the chat.')}${chk('Always on', `${p}.constant`)}
            <h4>Only when… (optional: the entry switches on by itself when the world is like this)</h4>
            <div class="mu-row2">${sel('Weather', `${p}.when.weather`, [['', 'Any'], ['Sunny', 'Sunny'], ['Fair', 'Fair'], ['Partly cloudy', 'Partly cloudy'], ['Cloudy', 'Cloudy'], ['Rain', 'Rain']])}${sel('Part of the day', `${p}.when.period`, [['', 'Any'], ...w.time.periods.map(x => [x.name, x.name])])}</div>
            <div class="mu-row2">${sel('Place', `${p}.when.place`, [['', 'Anywhere'], ...placeOpts(w)])}${sel('Days', `${p}.when.weekend`, [['', 'Any day'], ['true', 'Weekends'], ['false', 'Weekdays']], 'tri')}</div>
            ${area('Content', `${p}.content`, 8)}`;
    }, 'lore', 'No entries yet.') + `<p class="mu-muted">These entries, the setting and every place become the world's lorebook when a game starts.</p>`;
}
const AN_POS = [['1', 'In the chat, at a depth'], ['0', 'After the story string'], ['2', 'Before the story string']];
function tabBooks(w) {
    const on = w.lorebooks ?? [];
    const books = lorebooks().sort((a, b) => Number(on.includes(b)) - Number(on.includes(a)) || a.localeCompare(b));
    return `<div class="mu-cw-grid">
        <section class="mu-cw-sec"><h4>Lorebooks of this world · ${on.length}</h4>
            <p class="mu-muted">SillyTavern lorebooks this world uses, like lorebooks linked to the game's group: they are switched on while you play one of its games (besides the lorebook Mundi writes from the Lore tab).</p>
            <div class="mu-wc-books">${books.map(n => `<label class="mu-check mu-wc-book ${on.includes(n) ? 'is-on' : ''}"><input type="checkbox" data-act="cw-book" data-name="${esc(n)}" ${on.includes(n) ? 'checked' : ''}><span data-notr>${esc(n)}</span></label>`).join('') || '<p class="mu-muted">You have no lorebooks yet.</p>'}</div></section>
        <section class="mu-cw-sec"><h4>Author's Note</h4>
            ${area('Every new game of this world starts with this note (you can change it in each save later, in the globe).', 'note.text', 6, 'Tone, pacing, what to focus on.')}
            <div class="mu-row2">${num('Every how many messages', 'note.interval', 0)}${num('Depth', 'note.depth', 0)}</div>
            ${sel('Position', 'note.position', AN_POS, 'num')}</section>
    </div>`;
}
/* ---------- random fill (jobs, routines, where people live and work) ---------- */
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (l) => l[Math.floor(Math.random() * l.length)];
function randomRoutine(w) {
    const id = `random${Object.keys(w.cast.routineTemplates).length + 1}`;
    const start = rnd(6, 11), end = Math.min(20, start + rnd(6, 9)), night = rnd(21, 23);
    w.cast.routineTemplates[id] = {
        weekday: [[0, 'home'], [start, 'work'], [end, 'leisure'], [night, 'home']],
        weekend: [[0, 'home'], [rnd(9, 12), 'leisure'], [rnd(15, 18), 'leisure'], [rnd(21, 23), 'home']],
    };
    return id;
}
function randomizeJob(w, o) {
    const hours = pick([[7, 19], [8, 18], [9, 17], [10, 22], [6, 14], [14, 23]]);
    o.hours = hours;
    o.shift = rnd(4, 8);
    const work = w.places.filter(p => !p.link && (p.tags ?? []).includes('work'));
    if (!o.place && work.length)
        o.place = pick(work).id;
    let pay = rnd(12, 30);
    o.ranks = o.ranks.map(r => { const x = { ...r, pay }; pay += rnd(4, 10); return x; });
    o.promote = o.ranks.slice(0, -1).map((_r, k) => rnd(3, 6) * (k + 1));
    const opts = traitOptions(w);
    o.likes = [...new Set([pick(opts), pick(opts)].filter(Boolean))];
}
function randomizePerson(w, e) {
    e.occupation = Math.random() < 0.85 ? pick(w.occupations)?.id ?? null : null;
    e.home = pick(w.homes.zones)?.id ?? e.home;
    const tpls = Object.keys(w.cast.routineTemplates);
    e.routine = pick(tpls) ?? randomRoutine(w);
    const leisure = w.places.filter(p => !p.link && (p.tags ?? []).some(t => ['leisure', 'food', 'shop'].includes(t))).map(p => p.id);
    e.leisure = [...new Set([pick(leisure), pick(leisure), pick(leisure)].filter(Boolean))];
}
/* ---------- the screen ---------- */
// A new world: its style (what the game is like), then where it starts from: a ready world (a preset) to change, or nothing.
// Life-Sim / RPG / Custom, as three cards.
const modeCards = (on, act) => `<div class="mu-heropick is-start mu-modes">${GAME_MODES.map(m => `<button class="mu-herocard ${m.id === on ? 'is-on' : ''} ${m.soon ? 'is-soon' : ''}" data-act="${act}" data-v="${m.id}" ${m.soon ? 'aria-disabled="true"' : ''}><b>${m.name}${m.soon ? ' <em class="mu-soon-tag">Next update</em>' : ''}</b><p>${m.desc}</p></button>`).join('')}</div>`;
const presetsOf = (style) => worlds().filter(w => styleOf(w) === style).sort((a, b) => Number(isCustom(a.id)) - Number(isCustom(b.id)));
function startPage() {
    const s = CW.start;
    const st = STYLES.find(x => x.id === s.style) ?? STYLES[0];
    const presets = presetsOf(st.id);
    const base = getWorld(s.base);
    return `<div class="mu-settings mu-cw-new">
        <div class="mu-subhead"><button data-act="cw-start-cancel" data-sfx="back">← Back</button><h2>New world</h2></div>
        <div class="mu-cw-new-body mu-panel">
            <label class="mu-field mu-cw-new-name"><span>Name of your world</span><input data-input="cw-start-name" data-focus="cwname" value="${esc(s.name)}" placeholder="My world"></label>
            <h3>Style</h3>
            <p class="mu-muted">Every style has the same parts (needs, a device to talk to people, trades, homes, people with routines), dressed for its time. The style decides how they look and what they are called.</p>
            <div class="mu-styles">${STYLES.map(x => `<button class="mu-style ${x.id === st.id ? 'is-on' : ''} ${x.ready ? '' : 'is-soon'}" data-act="cw-start-style" data-id="${x.id}" ${x.ready ? '' : 'aria-disabled="true"'}>
                <b>${x.name}</b><small>${x.ready ? x.tagline : x.soon ?? 'Coming later.'}</small></button>`).join('')}</div>
            <section class="mu-panel mu-style-info"><h4>What this style brings</h4><ul>${st.changes.map(c => `<li>${c}</li>`).join('')}</ul></section>
            <h3>Game mode</h3>
            <p class="mu-muted">What the game is about. Any style works with any mode.</p>
            ${modeCards(s.game, 'cw-start-game')}
            <h3>Start from</h3>
            <p class="mu-muted">A preset is a ready world: you get a copy of it to change as you like (the original stays as it is).</p>
            <div class="mu-cards">${presets.map(w => `<button class="mu-worldcard ${s.mode === 'copy' && s.base === w.id ? 'is-on' : ''}" data-act="cw-start-preset" data-id="${esc(w.id)}">
                    <span class="mu-worldart" style="${esc(bgOf(w, w.cover))}"><em class="mu-style-tag is-${esc(st.id)}">Preset</em></span>
                    <b data-notr>${esc(inWorld(w, w.name))}</b><small>${isCustom(w.id) ? 'Made by you' : 'Ready world'}</small><p data-notr>${esc(inWorld(w, w.description))}</p></button>`).join('')}
                <button class="mu-worldcard is-new ${s.mode === 'empty' ? 'is-on' : ''}" data-act="cw-start-empty"><span class="mu-worldart">${icon('map')}</span><b>Start from nothing</b><small>Only the ${esc(st.name)} rules</small><p>Needs, things to do, the device and the character sheet of this style; you draw the maps, places and people.</p></button>
                <button class="mu-worldcard is-new is-later" aria-disabled="true"><span class="mu-worldart">${icon('book')}</span><b>From lorebooks</b><small>Coming soon</small><p>Your AI reads lorebooks you choose and builds the world from them.</p></button></div>
            <div class="mu-row mu-cw-new-go"><span class="mu-muted">${s.mode === 'copy' ? `A copy of ${esc(base?.name ?? '')}` : `An empty ${esc(st.name)} world`}</span>
                <button class="mu-primary mu-big" data-act="cw-start-go" ${s.name.trim() && base ? '' : 'aria-disabled="true"'}>Create the world ▶</button></div>
        </div></div>`;
}
export function creatorHtml() {
    if (CW.start && !CW.w)
        return startPage();
    const w = CW.w;
    if (!w)
        return '';
    const body = CW.tab === 'general' ? tabGeneral(w) : CW.tab === 'features' ? tabFeatures(w) : CW.tab === 'needs' ? tabNeeds(w) : CW.tab === 'maps' ? mapEditorHtml(w)
        : CW.tab === 'homes' ? tabHomes(w) : CW.tab === 'actions' ? tabActions(w) : CW.tab === 'jobs' ? tabJobs(w) : CW.tab === 'character' ? tabCharacter(w)
            : CW.tab === 'people' ? tabPeople(w) : CW.tab === 'books' ? tabBooks(w) : tabLore(w);
    return `<div class="mu-settings mu-creator-ed">
        <div class="mu-subhead"><button data-act="cw-close" data-sfx="back">← Back</button><h2>World creator</h2><small data-notr>${esc(w.name)}${CW.dirty ? ' •' : ''}</small>
            <span class="mu-row mu-cw-top">
                ${CW.confirmDel ? `<span class="mu-warn">Delete this world?</span><button class="mu-danger" data-act="cw-delete-yes">Delete</button><button data-act="cw-delete-no">Cancel</button>`
        : `<button class="mu-ghost" data-act="cw-export" title="Export to a file">${icon('upload')}<span>Export</span></button>
                       <button class="mu-ghost" data-act="cw-delete" title="Delete this world">${icon('trash')}</button>
                       <button class="mu-primary" data-act="cw-save" ${CW.saving ? 'disabled' : ''}>${icon('save')}<span>${CW.saving ? 'Saving…' : 'Save'}</span></button>`}</span></div>
        <div class="mu-settings-layout mu-cw-layout">
            <nav class="mu-tabs">${TABS.map(([id, l]) => `<button class="${CW.tab === id ? 'is-on' : ''}" data-act="cw-tab" data-tab="${id}">${l}</button>`).join('')}</nav>
            <div class="mu-settings-body mu-panel ${CW.tab === 'maps' ? 'is-maps' : ''}" data-keep="cw-body">${body}</div>
        </div></div>`;
}
/* ---------- opening ---------- */
let backTo = 'newgame';
export function openCreatorNew(style = 'modern') {
    if (!STYLES.find(x => x.id === style)?.ready)
        style = 'modern';
    backTo = state.view;
    CW.w = null;
    CW.start = { name: '', style, base: presetsOf(style)[0]?.id ?? 'modern', mode: 'copy', game: 'lifesim' };
    state.view = 'creator';
    notify();
}
export function openCreatorEdit(id) {
    const w = getWorld(id);
    if (!w)
        return;
    backTo = state.view;
    CW.w = structuredClone(w);
    CW.w.base = w.base;
    CW.tab = 'general';
    CW.dirty = false;
    CW.confirmDel = false;
    CW.start = null;
    state.view = 'creator';
    notify();
}
function close() { CW.w = null; CW.start = null; state.view = (backTo === 'creator' ? 'newgame' : backTo); notify(); }
const NEW = {
    need: () => ['statuses', { id: newId('need'), name: 'New need', icon: '⭐', color: '#4fb0ff', start: 80, max: 100, hud: true, decay: { amount: 1, everyMinutes: 60, awakeOnly: true } }],
    action: () => ['actions', { id: newId('act'), name: 'Thing', label: 'Do something', icon: '✨', cost: 0, minutes: 30, tags: ['leisure'], effects: {} }],
    job: () => ['occupations', { id: newId('job'), name: 'New job', place: W().places.find(p => !p.link)?.id ?? '', shift: 6, hours: [8, 18], cost: { energy: 25 }, ranks: [{ name: 'Junior', pay: 15 }, { name: 'Senior', pay: 22 }], promote: [6], likes: [], needs: [] }],
    zone: () => ['homes.zones', { id: newId('zone'), name: 'New area', map: W().maps[0]?.id ?? '', kind: Object.keys(W().homes.kinds)[0] ?? 'apartment', rent: 300, desc: '', spots: [] }],
    origin: () => ['catalogs.origins', { id: newId('origin'), name: 'New origin', desc: '', money: 1000, knows: 0 }],
    person: () => ['cast.examples', { name: 'New person', age: 25, occupation: null, home: W().homes.zones[0]?.id ?? '', routine: Object.keys(W().cast.routineTemplates)[0] ?? '', leisure: [], description: '', first_mes: '', personality: '' }],
    lore: () => ['lore', { keys: [], content: '', constant: false }],
    period: () => ['time.periods', { id: newId('p'), name: 'New period', from: 720 }],
    look: () => ['sheet.appearance', { id: newId('look'), label: 'New trait', options: [] }],
    trait: () => ['sheet.traits', { id: newId('trait'), label: 'New group', max: 2, options: [] }],
};
const listKey = { statuses: 'needs', actions: 'actions', occupations: 'jobs', 'homes.zones': 'zones', 'catalogs.origins': 'origins', 'cast.examples': 'people', lore: 'lore' };
Object.assign(ACT, {
    'cw-start-style': (el) => {
        const st = STYLES.find(x => x.id === el.dataset.id);
        if (!st?.ready || !CW.start)
            return;
        const p = presetsOf(st.id)[0];
        if (!p)
            return;
        Object.assign(CW.start, { style: st.id, base: p.id, mode: 'copy' });
        setWorldDicts(p.id, p.i18n ?? {});
        notify();
    },
    'cw-start-preset': (el) => { const w = getWorld(el.dataset.id); if (!w || !CW.start)
        return; Object.assign(CW.start, { base: w.id, mode: 'copy' }); setWorldDicts(w.id, w.i18n ?? {}); notify(); },
    'cw-start-game': (el) => { if (!CW.start || GAME_MODES.find(m => m.id === el.dataset.v)?.soon)
        return; CW.start.game = el.dataset.v; notify(); },
    'cw-mode': (el) => { const w = CW.w; if (!w || GAME_MODES.find(m => m.id === el.dataset.v)?.soon)
        return; w.mode = el.dataset.v; CW.dirty = true; notify(); },
    'cw-start-empty': () => { if (!CW.start)
        return; CW.start.mode = 'empty'; CW.start.base = presetsOf(CW.start.style).find(w => !isCustom(w.id))?.id ?? CW.start.base; notify(); },
    'cw-start-cancel': () => close(),
    'cw-start-go': async () => {
        const s = CW.start;
        if (!s.name.trim())
            return;
        try {
            CW.w = await busy('Creating the world', () => newWorldFrom(s.base, s.mode, s.name));
            CW.w.mode = s.game;
            CW.start = null;
            CW.tab = 'general';
            CW.dirty = true;
            await saveDraft();
        }
        catch (e) {
            toast(String(e?.message ?? e), 'error');
        }
        notify();
    },
    'cw-close': () => { if (CW.dirty)
        toast('Not saved: your changes were kept until you leave Mundi. Press Save.', 'warn'); close(); },
    'cw-tab': (el) => { CW.tab = el.dataset.tab; notify(); },
    'cw-pick': (el) => { CW.sel[el.dataset.k] = Number(el.dataset.i); notify(); },
    'cw-routine': (el) => { CW.sel.routine = el.dataset.id; notify(); },
    'cw-add': (el) => {
        const what = el.dataset.what;
        const w = W();
        if (what === 'rank') {
            getPath(el.dataset.path).push({ name: 'New rank', pay: 20 });
            CW.dirty = true;
            notify();
            return;
        }
        if (what === 'step') {
            getPath(el.dataset.path).push([12, 'leisure']);
            CW.dirty = true;
            notify();
            return;
        }
        if (what === 'routine') {
            const id = `routine${Object.keys(w.cast.routineTemplates).length + 1}`;
            w.cast.routineTemplates[id] = { weekday: [[0, 'home'], [9, 'work'], [18, 'leisure'], [22, 'home']], weekend: [[0, 'home'], [11, 'leisure'], [22, 'home']] };
            CW.sel.routine = id;
            CW.dirty = true;
            notify();
            return;
        }
        if (what === 'kind') {
            w.homes.kinds[newId('kind')] = { name: 'New kind', desc: '' };
            CW.dirty = true;
            notify();
            return;
        }
        const [path, item] = NEW[what]();
        const list = (getPath(path) ?? (setPath(path, []), getPath(path)));
        list.push(item);
        if (listKey[path])
            CW.sel[listKey[path]] = list.length - 1;
        CW.dirty = true;
        notify();
    },
    'cw-del': (el) => {
        const path = el.dataset.path;
        const keys = path.split('.');
        const last = keys.pop();
        const parent = getPath(keys.join('.'));
        if (Array.isArray(parent))
            parent.splice(Number(last), 1);
        else if (parent)
            delete parent[last];
        CW.dirty = true;
        notify();
    },
    'cw-chip': (el) => {
        const l = getPath(el.dataset.path) ?? [];
        const v = el.dataset.v;
        const i = l.indexOf(v);
        i >= 0 ? l.splice(i, 1) : l.push(v);
        setPath(el.dataset.path, l);
        notify();
    },
    'cw-cover': async () => { const f = await pickFile('image/*'); if (!f)
        return; try {
        W().cover = await uploadWorldPicture(W(), f, 'cover');
        CW.dirty = true;
    }
    catch (e) {
        toast(String(e?.message ?? e), 'error');
    } notify(); },
    'cw-cover-map': () => { W().cover = W().maps[0]?.image; CW.dirty = true; notify(); },
    'cw-kind-img': async (el) => { const f = await pickFile('image/*'); if (!f)
        return; try {
        W().homes.kinds[el.dataset.id].image = await uploadWorldPicture(W(), f, `home-${el.dataset.id}`);
        CW.dirty = true;
    }
    catch (e) {
        toast(String(e?.message ?? e), 'error');
    } notify(); },
    'cw-homes-map': (el) => { const z = W().homes.zones[Number(el.dataset.i)]; if (!z)
        return; CW.tab = 'maps'; ME.map = z.map || W().maps[0]?.id || ''; ME.mode = 'homes'; ME.zone = z.id; notify(); },
    'cw-rnd-all': () => { const w = W(); w.cast.examples.forEach(e => randomizePerson(w, e)); CW.dirty = true; toast('Everyone got a new job, home and routine.', 'success'); notify(); },
    'cw-rnd-person': (el) => { const w = W(); const e = w.cast.examples[Number(el.dataset.i)]; if (e)
        randomizePerson(w, e); CW.dirty = true; notify(); },
    'cw-rnd-routine': () => { CW.sel.routine = randomRoutine(W()); CW.dirty = true; notify(); },
    'cw-rnd-job': (el) => { const w = W(); const o = w.occupations[Number(el.dataset.i)]; if (o)
        randomizeJob(w, o); CW.dirty = true; notify(); },
    'cw-book': (el) => { const w = W(); const l = (w.lorebooks ??= []); const n = el.dataset.name; const i = l.indexOf(n); i >= 0 ? l.splice(i, 1) : l.push(n); CW.dirty = true; notify(); },
    'cw-save': () => saveDraft(),
    'cw-export': async () => {
        const w = W();
        try {
            const blob = await busy('Exporting', () => exportWorld(w));
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${slug(w.name)}.mundi-world.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        }
        catch (e) {
            toast(String(e?.message ?? e), 'error');
        }
    },
    'cw-delete': () => { CW.confirmDel = true; notify(); },
    'cw-delete-no': () => { CW.confirmDel = false; notify(); },
    'cw-delete-yes': async () => { const id = W().id; await busy('Deleting', () => deleteWorld(id)); toast('World deleted. Games made with it can no longer be opened.', 'info'); CW.dirty = false; close(); },
});
async function saveDraft() {
    const w = CW.w;
    if (!w || CW.saving)
        return;
    CW.saving = true;
    notify();
    try {
        await saveWorld(w);
        CW.dirty = false;
        toast('World saved.', 'success');
    }
    catch (e) {
        toast(String(e?.message ?? e), 'error');
    }
    CW.saving = false;
    notify();
}
// Import: a world exported from Mundi (pictures included).
export async function importWorldFile() {
    const f = await pickFile('.json,application/json');
    if (!f)
        return null;
    try {
        const w = await busy('Importing the world', async () => importWorld(await f.text()));
        toast(`“${w.name}” imported.`, 'success');
        return w;
    }
    catch (e) {
        toast(String(e?.message ?? e), 'error');
        return null;
    }
}
Object.assign(INPUT, {
    cw: (el) => {
        const t = el.dataset.type;
        const p = el.dataset.path;
        let v = el.value;
        if (t === 'num')
            v = el.value === '' ? undefined : Number(el.value);
        else if (t === 'bool')
            v = el.checked;
        else if (t === 'nbool')
            v = el.checked ? undefined : false;
        else if (t === 'tri')
            v = el.value === '' ? undefined : el.value === 'true';
        else if (p.includes('.when.') && el.value === '')
            v = undefined;
        else if (t === 'time') {
            const [h, m] = el.value.split(':').map(Number);
            v = (h || 0) * 60 + (m || 0);
        }
        else if (t === 'csv')
            v = el.value.split(',').map((x) => x.trim()).filter(Boolean);
        // switching a block on or off (decay, zero, rent)
        if (t === 'bool' && /(\.decay|\.zero|^rent)$/.test(p))
            v = el.checked ? (p === 'rent' ? { everyDays: 7, text: 'Rent: {cost}.' } : p.endsWith('decay') ? { amount: 1, everyMinutes: 60, awakeOnly: true } : { text: '', restore: 30 }) : undefined;
        setPath(p, v);
        if (el.tagName !== 'INPUT' || ['checkbox', 'color', 'time'].includes(el.type))
            notify();
        else {
            const top = document.querySelector('.mu-creator-ed .mu-subhead small');
            if (top && !top.textContent?.endsWith('•'))
                top.textContent = `${W().name} •`;
        }
    },
    'cw-where': (el) => {
        const a = W().actions[Number(el.dataset.i)];
        if (!a)
            return;
        delete a.anywhere;
        delete a.home;
        delete a.place;
        if (el.value === 'anywhere') {
            a.anywhere = true;
            a.tags = [];
        }
        else if (el.value === 'home') {
            a.home = true;
            a.tags = [];
        }
        else if (el.value === 'place') {
            a.place = W().places.find(p => !p.link)?.id;
            a.tags = [];
        }
        else
            a.tags ??= [];
        CW.dirty = true;
        notify();
    },
    'cw-start-name': (el) => { CW.start.name = el.value; const b = document.querySelector('[data-act="cw-start-go"]'); if (b)
        b.toggleAttribute('aria-disabled', !el.value.trim()); },
});
export const _tr = tr;
