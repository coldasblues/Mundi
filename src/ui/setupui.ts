// "Set up from the lore", on screen: the AI reads, you review (untick what is wrong, fix what each person is, pick a
// group's base), and only then is it applied.
import { game, notify, toast, esc, type Save } from '../core/store.js';
import { getWorld, type WorldDef } from '../core/world.js';
import { readLore, applyPlan, type Plan } from '../sim/setup.js';
import { actsOf } from '../sim/hostile.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';

export const SU = { open: false, busy: '', plan: null as Plan | null, done: '' };
const ctxW = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };

export const setupButton = (label = 'Set up from the lore…') => `<button class="mu-su-btn" data-act="su-open">${icon('book')}<span>${esc(label)}</span></button>`;

export async function runSetup() {
    const c = ctxW(); if (!c || SU.busy) return;
    SU.open = true; SU.plan = null; SU.done = ''; SU.busy = 'Starting…'; notify();
    try { SU.plan = await readLore(c.g, c.w, (t) => { SU.busy = t; notify(); }); }
    catch (e: any) { toast(`The AI could not read the lore: ${String(e?.message ?? e)}`, 'error'); SU.open = false; }
    SU.busy = ''; notify();
}

function lawText(w: WorldDef, l: Plan['laws'][number]) {
    const acts = l.allows.map(a => actsOf(w).find(d => d.id === a)?.name.toLowerCase() ?? a).join(', ');
    return `${l.who.length ? l.who.join(' or ') : 'Anyone'} may ${acts} ${l.about.join(' or ')}${l.handTo ? `, and hand them to ${l.handTo}${l.reward ? ` (+${l.reward})` : ''}` : ''}${l.counts === 'minor' ? ' (a minor offense)' : ''}.${l.objectors?.length ? ` ${l.objectors.join(', ')} disapprove.` : ''}${l.note ? ` ${l.note}` : ''}`;
}
function planHtml(g: Save, w: WorldDef, p: Plan): string {
    const places = w.places.filter(x => !x.link);
    const groupNames = p.groups.filter(x => x.keep).map(x => x.name);
    const nothing = !p.people.length && !p.groups.length && !p.laws.length && !p.police && !p.notPeople.length;
    if (nothing) return '<p class="mu-muted">The AI found nothing to set up in the lore: no groups, laws or people it could classify.</p>';
    return `
        ${p.police ? `<section><h4>The law</h4><label class="mu-check"><input type="checkbox" data-input="su-keep" data-k="police" ${p.police.keep ? 'checked' : ''}><span>${p.police.exists ? `There is law here: <b>${esc(p.police.name || 'yes')}</b>` : '<b>No law</b>: no police, nobody comes'}</span></label></section>` : ''}
        ${p.laws.length ? `<section><h4>Laws of this world</h4>${p.laws.map((l, i) => `<label class="mu-check"><input type="checkbox" data-input="su-keep" data-k="law" data-i="${i}" ${l.keep ? 'checked' : ''}><span><b>${esc(l.name)}</b><small>${esc(lawText(w, l))}</small></span></label>`).join('')}</section>` : ''}
        ${p.groups.length ? `<section><h4>Groups</h4>${p.groups.map((x, i) => `<div class="mu-su-row"><label class="mu-check"><input type="checkbox" data-input="su-keep" data-k="group" data-i="${i}" ${x.keep ? 'checked' : ''}><span><b>${esc(x.name)}</b>${x.baseText ? `<small>based: ${esc(x.baseText)}</small>` : ''}</span></label>
            <select data-input="su-base" data-i="${i}"><option value="">No base on the map</option>${places.map(pl => `<option value="${esc(pl.id)}" ${x.base === pl.id ? 'selected' : ''}>${esc(pl.name)}</option>`).join('')}</select></div>`).join('')}</section>` : ''}
        ${p.people.length ? `<section><h4>The people</h4>${p.people.map((x, i) => `<div class="mu-su-row is-person"><label class="mu-check"><input type="checkbox" data-input="su-keep" data-k="person" data-i="${i}" ${x.keep ? 'checked' : ''}><span><b data-notr>${esc(x.name)}</b></span></label>
            <input type="text" data-input="su-kind" data-i="${i}" maxlength="60" value="${esc(x.kind)}" placeholder="what they are">
            <label class="mu-su-law"><input type="checkbox" data-input="su-law" data-i="${i}" ${x.law ? 'checked' : ''}>the law</label>
            <select data-input="su-group" data-i="${i}"><option value="">No group</option>${groupNames.map(n => `<option ${x.group === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`).join('')}</section>` : ''}
        ${p.notPeople.length ? `<section><h4>Not people</h4>${p.notPeople.map((x, i) => `<label class="mu-check"><input type="checkbox" data-input="su-keep" data-k="np" data-i="${i}" ${x.keep ? 'checked' : ''}><span>${esc(x.word)}</span></label>`).join('')}</section>` : ''}
        <div class="mu-row"><button class="mu-primary" data-act="su-apply">${icon('check')}<span>Apply</span></button><button data-act="su-close">Not now</button></div>`;
}
export function setupHtml(): string {
    if (!SU.open) return '';
    const c = ctxW(); if (!c) return '';
    const body = SU.busy ? `<p class="mu-muted">${esc(SU.busy)}</p><p class="mu-muted">One AI call per part of the lore, and one for every eight characters.</p>`
        : SU.done ? `<p class="mu-su-done">${icon('check')}<span>Applied: ${esc(SU.done)}.</span></p><p class="mu-muted">Change anything later in the Rough stuff menu (laws, who you are) and in ☰ → People in your story (groups, what each person is).</p><div class="mu-row"><button class="mu-primary" data-act="su-close">Done</button></div>`
            : SU.plan ? planHtml(c.g, c.w, SU.plan) : '';
    return `<div class="mu-dlg-veil is-fixed" data-act="su-close"></div><div class="mu-panel mu-confirm mu-su" role="dialog" aria-label="Set up from the lore">
        <header class="mu-su-top"><h3>${icon('book')}<span>Set up from the lore</span></h3><button class="mu-ibtn mu-ghost" data-act="su-close" aria-label="Close">${icon('x')}</button></header>
        <p class="mu-muted">The AI read this game's lorebooks and its characters' cards. Untick what is wrong; nothing is changed until you apply it.</p>
        ${body}</div>`;
}

Object.assign(ACT, {
    'su-open': (el, e) => { (ACT['hx-close'] as any)?.(el, e); void runSetup(); },   // over the Rough stuff menu: that one closes
    'su-close': () => { if (SU.busy) return; SU.open = false; notify(); },
    'su-apply': () => {
        const c = ctxW(); if (!c || !SU.plan) return;
        SU.done = applyPlan(c.g, c.w, SU.plan) || 'nothing';
        void import('../sim/prompt.js').then(m => m.refreshPrompt());
        notify();
    },
});
Object.assign(INPUT, {
    'su-keep': (el) => {
        const p = SU.plan; if (!p) return; const i = Number(el.dataset.i);
        const k = el.dataset.k;
        if (k === 'police' && p.police) p.police.keep = el.checked;
        if (k === 'law' && p.laws[i]) p.laws[i].keep = el.checked;
        if (k === 'group' && p.groups[i]) p.groups[i].keep = el.checked;
        if (k === 'person' && p.people[i]) p.people[i].keep = el.checked;
        if (k === 'np' && p.notPeople[i]) p.notPeople[i].keep = el.checked;
        notify();
    },
    'su-kind': (el) => { const x = SU.plan?.people[Number(el.dataset.i)]; if (x) x.kind = el.value; },
    'su-law': (el) => { const x = SU.plan?.people[Number(el.dataset.i)]; if (x) x.law = el.checked; },
    'su-group': (el) => { const x = SU.plan?.people[Number(el.dataset.i)]; if (x) x.group = el.value; },
    'su-base': (el) => { const x = SU.plan?.groups[Number(el.dataset.i)]; if (x) x.base = el.value; },
});
