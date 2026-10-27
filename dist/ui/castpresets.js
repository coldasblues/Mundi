// Presets of people (Library → Presets): a group of cards with their households, their relations and how each one
// sees you, kept apart from any world. A new game in any world can start from one.
import { state, notify, esc, toast, settings, saveSettings } from '../core/store.js';
import { characters, charOf, thumb } from '../st/bridge.js';
import { charPicker } from './charpick.js';
import { stepHouseholds } from './ngfamily.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';
export const castPresets = () => (settings().castPresets ??= []);
const P = { sel: '' };
const clone = (x) => JSON.parse(JSON.stringify(x));
const nm = (a) => charOf(a)?.name ?? a;
// While a preset is open, the new-game editors (people, households, relations) work on a draft of it.
function edit(p) {
    state.wizard = { presetEdit: p.id, name: p.name, cast: [...p.cast], hh: clone(p.hh), rels: clone(p.rels), approval: { ...p.approval }, world: '' };
}
const draft = () => (state.wizard?.presetEdit ? state.wizard : null);
// How someone sees you at the start, as words (the engine keeps a number from −100 to 100).
const APPR = [[-80, 'Hates you'], [-45, 'Dislikes you'], [-15, 'Cold'], [0, 'Neutral'], [20, 'Friendly'], [45, 'Likes you'], [70, 'Fond of you'], [95, 'Adores you']];
function apprSelect(who, v) {
    const near = v == null ? null : APPR.reduce((b, x) => Math.abs(x[0] - v) < Math.abs(b[0] - v) ? x : b)[0];
    return `<select data-input="cp-appr" data-who="${esc(who)}"><option value="" ${near == null ? 'selected' : ''}>As their relation says</option>${APPR.map(([n, l]) => `<option value="${n}" ${near === n ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}
export function presetsTabHtml() {
    const list = castPresets();
    if (P.sel && !list.some(p => p.id === P.sel))
        P.sel = '';
    if (P.sel && draft()?.presetEdit !== P.sel)
        edit(list.find(p => p.id === P.sel));
    const d = draft();
    const people = (d?.cast ?? []);
    return `<div class="mu-lib-body mu-cp">
        <aside class="mu-lib-list mu-panel mu-cp-list"><button class="mu-primary" data-act="cp-new">${icon('plus')}<span>New preset</span></button>
            ${list.map(p => `<button class="mu-cp-row ${p.id === P.sel ? 'is-on' : ''}" data-act="cp-sel" data-id="${esc(p.id)}"><b>${esc(p.name)}</b><span class="mu-hh-faces">${p.cast.slice(0, 6).map(a => `<img src="${esc(thumb(a))}" alt="">`).join('')}</span><small>${p.cast.length} people · ${p.hh.filter(h => h.members.length > 1).length} households</small></button>`).join('') || '<p class="mu-muted">No presets yet. A preset is a group of your characters with their households and relations, ready for any world.</p>'}</aside>
        <section class="mu-lib-detail mu-panel" data-keep="lib-detail">${d ? `
            <div class="mu-row"><label class="mu-field mu-cp-name"><span>Name</span><input data-input="cp-name" data-focus="cpname" value="${esc(d.name)}" placeholder="My friends"></label>
                <button class="mu-primary" data-act="cp-save">${icon('save')}<span>Save</span></button><button class="mu-ghost" data-act="cp-del">${icon('trash')}<span>Delete</span></button></div>
            <p class="mu-muted">Nothing here depends on a world: when a new game starts from this preset, each world gives them homes, jobs and routines of its own.</p>
            <h3>People</h3>${charPicker({ key: 'cast', list: characters(), selected: people, act: 'ng-cast', multi: true, selectAllAct: 'ng-cast-all', placeholder: 'Search your characters' })}
            ${people.length ? stepHouseholds() : ''}
            ${people.length ? `<section class="mu-panel mu-cp-seen"><h3>How they see you</h3><p class="mu-muted">Where each one stands with you at the start ("As their relation says": from the relation you gave them, or neutral).</p>
                <div class="mu-cp-appr">${people.map(a => `<label class="mu-field"><span><img src="${esc(thumb(a))}" alt=""> ${esc(nm(a))}</span>${apprSelect(a, d.approval?.[a])}</label>`).join('')}</div></section>` : ''}`
        : '<p class="mu-muted mu-pad">Choose a preset, or make a new one.</p>'}</section></div>`;
}
// The new game: start from a preset (it fills the people, households, relations and how they see you).
export function presetChipsHtml() {
    const list = castPresets();
    if (!list.length)
        return '';
    return `<div class="mu-cp-pick"><b>Start from a preset</b>${list.map(p => `<button class="mu-chip ${(state.wizard?.presetsOn ?? []).includes(p.id) ? 'is-on' : ''}" data-act="cp-use" data-id="${esc(p.id)}" title="${(state.wizard?.presetsOn ?? []).includes(p.id) ? 'Click again to take them out' : 'Add these people'}">${esc(p.name)} <small>(${p.cast.length})</small></button>`).join('')}</div>${scenarioAskHtml()}`;
}
// A scenario is one place: a preset with households (separate homes) asks first. Everyone moves into the house, or
// you choose the households (and the people on their own) who come. Their ties stay as relations.
const groupsOf = (p) => {
    const inHh = new Set(p.hh.filter(h => h.members.length > 1).flatMap(h => h.members));
    return [...p.hh.filter(h => h.members.length > 1).map(h => h.members), ...p.cast.filter(a => !inHh.has(a)).map(a => [a])];
};
function scenarioAskHtml() {
    const wz = state.wizard, ask = wz?.cpAsk;
    if (!ask)
        return '';
    const p = castPresets().find(x => x.id === ask.id);
    if (!p)
        return '';
    const groups = groupsOf(p);
    return `<section class="mu-panel mu-cp-ask"><h4>${esc(p.name)}: a Home is one place</h4>
        <p class="mu-muted">This preset has ${p.hh.filter(h => h.members.length > 1).length} household${p.hh.filter(h => h.members.length > 1).length === 1 ? '' : 's'} (homes of their own). In a Home everyone lives in the same house: bring them all in, or choose who comes. Their relations are kept.</p>
        ${ask.pick ? `<div class="mu-cp-groups">${groups.map((m, i) => `<label class="mu-check mu-cp-group"><input type="checkbox" data-input="cp-ask-g" data-i="${i}" ${ask.on.includes(i) ? 'checked' : ''}><span><span class="mu-hh-faces">${m.slice(0, 6).map(a => `<img src="${esc(thumb(a))}" alt="">`).join('')}</span> <span data-notr>${esc(m.map(nm).join(', '))}</span><small>${m.length > 1 ? 'Household' : 'On their own'}</small></span></label>`).join('')}</div>` : ''}
        <div class="mu-row">${ask.pick
        ? `<button class="mu-primary" data-act="cp-ask-go" ${ask.on.length ? '' : 'aria-disabled="true"'}>Bring these into the house</button><button class="mu-ghost" data-act="cp-ask-mode" data-v="">Back</button>`
        : `<button class="mu-primary" data-act="cp-ask-all">Everyone into the house</button><button data-act="cp-ask-mode" data-v="1">Choose who comes</button>`}
            <button class="mu-ghost" data-act="cp-ask-cancel">Cancel</button></div></section>`;
}
// A preset chip toggles: clicked again, its people (and their households, relations and standing) leave the cast,
// except those another chosen preset also brings.
export function dropPreset(id) {
    const p = castPresets().find(x => x.id === id);
    const wz = state.wizard;
    if (!p || !wz)
        return;
    wz.presetsOn = (wz.presetsOn ?? []).filter((x) => x !== id);
    const still = new Set(castPresets().filter(x => wz.presetsOn.includes(x.id)).flatMap(x => x.cast));
    const out = new Set(p.cast.filter(a => !still.has(a)));
    wz.cast = (wz.cast ?? []).filter((a) => !out.has(a));
    wz.hh = (wz.hh ?? []).map((h) => ({ ...h, members: h.members.filter((a) => !out.has(a)), ties: (h.ties ?? []).filter((t) => !out.has(t.a) && !out.has(t.b)) })).filter((h) => h.members.length);
    wz.rels = (wz.rels ?? []).filter((t) => !out.has(t.a) && !out.has(t.b));
    wz.approval = Object.fromEntries(Object.entries(wz.approval ?? {}).filter(([a]) => !out.has(a)));
    wz.cpAsk = null;
    notify();
}
export function usePreset(id, only) {
    const p = castPresets().find(x => x.id === id);
    const wz = state.wizard;
    if (!p || !wz)
        return;
    if (!only && (wz.presetsOn ?? []).includes(id)) {
        dropPreset(id);
        return;
    }
    const scen = wz.mode === 'scenario';
    if (scen && !only && p.hh.some(h => h.members.length > 1)) {
        wz.cpAsk = { id, pick: false, on: groupsOf(p).map((_, i) => i) };
        notify();
        return;
    }
    wz.cpAsk = null;
    const have = new Set(characters().map(c => c.avatar));
    const keep = (a) => have.has(a) && (!only || only.includes(a));
    const cast = p.cast.filter(keep);
    wz.cast = [...new Set([...(wz.cast ?? []), ...cast])];
    const hh = clone(p.hh).map(h => ({ ...h, members: h.members.filter(keep) })).filter(h => h.members.length);
    const ok = (t) => (t.a === '__you' || keep(t.a)) && (t.b === '__you' || keep(t.b));
    const same = (r, t) => (r.a === t.a && r.b === t.b) || (r.a === t.b && r.b === t.a);
    wz.rels = [...(wz.rels ?? [])];
    for (const t of clone(p.rels).filter(ok))
        if (!wz.rels.some((r) => same(r, t)))
            wz.rels.push(t);
    if (scen) {
        wz.hh = [];
        for (const h of hh)
            for (const t of h.ties ?? [])
                if (ok(t) && !wz.rels.some((r) => same(r, t)))
                    wz.rels.push(t);
    } // one house: households become relations
    else {
        const taken = new Set(hh.flatMap(h => h.members));
        wz.hh = [...(wz.hh ?? []).map((h) => ({ ...h, members: h.members.filter((a) => !taken.has(a)) })).filter((h) => h.members.length), ...hh];
    }
    wz.approval = { ...(wz.approval ?? {}), ...Object.fromEntries(Object.entries(p.approval ?? {}).filter(([a]) => cast.includes(a))) };
    wz.presetsOn = [...new Set([...(wz.presetsOn ?? []), id])];
    const gone = p.cast.filter(a => !have.has(a)).length;
    if (gone)
        toast(`${gone} of its characters are not in your SillyTavern anymore.`, 'warn');
    notify();
}
// Saves the people, households and relations of the new game you are making as a preset.
export function saveWizardAsPreset() {
    const wz = state.wizard;
    if (!wz?.cast?.length)
        return;
    const p = { id: `cp${Date.now().toString(36)}`, name: `Preset ${castPresets().length + 1}`, cast: [...wz.cast], hh: clone(wz.hh ?? []).map((h) => ({ members: h.members, ties: h.ties })), rels: clone(wz.rels ?? []), approval: { ...(wz.approval ?? {}) } };
    castPresets().push(p);
    saveSettings();
    toast(`Saved as "${p.name}" (Library → Presets).`, 'success');
    notify();
}
Object.assign(ACT, {
    'cp-new': () => { const p = { id: `cp${Date.now().toString(36)}`, name: 'New preset', cast: [], hh: [], rels: [], approval: {} }; castPresets().push(p); saveSettings(); P.sel = p.id; edit(p); notify(); },
    'cp-sel': (el) => { P.sel = el.dataset.id; edit(castPresets().find(p => p.id === P.sel)); notify(); },
    'cp-save': () => {
        const d = draft();
        const p = castPresets().find(x => x.id === d?.presetEdit);
        if (!d || !p)
            return;
        p.name = String(d.name || 'Preset').trim();
        p.cast = [...d.cast];
        p.hh = clone(d.hh ?? []).map((h) => ({ members: h.members.filter((a) => d.cast.includes(a)), ties: h.ties })).filter((h) => h.members.length);
        p.rels = clone(d.rels ?? []);
        p.approval = Object.fromEntries(Object.entries(d.approval ?? {}).filter(([a, v]) => d.cast.includes(a) && v !== '' && v !== null && Number.isFinite(Number(v))).map(([a, v]) => [a, Math.max(-100, Math.min(100, Number(v)))]));
        saveSettings();
        toast('Preset saved.', 'success');
        notify();
    },
    'cp-del': () => { const i = castPresets().findIndex(p => p.id === P.sel); if (i < 0)
        return; castPresets().splice(i, 1); saveSettings(); P.sel = ''; state.wizard = null; notify(); },
    'cp-use': (el) => usePreset(el.dataset.id),
    'cp-ask-all': () => { const a = state.wizard?.cpAsk; const p = a && castPresets().find(x => x.id === a.id); if (p)
        usePreset(p.id, [...p.cast]); },
    'cp-ask-mode': (el) => { const a = state.wizard?.cpAsk; if (a) {
        a.pick = !!el.dataset.v;
        notify();
    } },
    'cp-ask-go': () => { const a = state.wizard?.cpAsk; const p = a && castPresets().find(x => x.id === a.id); if (!p)
        return; const g = groupsOf(p); usePreset(p.id, a.on.flatMap((i) => g[i] ?? [])); },
    'cp-ask-cancel': () => { state.wizard.cpAsk = null; notify(); },
    'cp-save-wizard': () => saveWizardAsPreset(),
});
Object.assign(INPUT, {
    'cp-name': (el) => { const d = draft(); if (d)
        d.name = el.value; },
    'cp-ask-g': (el) => { const a = state.wizard?.cpAsk; if (!a)
        return; const i = Number(el.dataset.i); a.on = el.checked ? [...new Set([...a.on, i])] : a.on.filter((x) => x !== i); notify(); },
    'cp-appr': (el) => { const d = draft(); if (!d)
        return; (d.approval ??= {})[el.dataset.who] = el.value === '' ? undefined : Number(el.value); },
});
