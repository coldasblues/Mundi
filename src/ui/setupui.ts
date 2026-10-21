// "Set up from the lore", on screen: the AI reads, you review (untick what is wrong, fix what each person is, pick a
// group's base), and only then is it applied.
import { game, notify, toast, esc, type Save } from '../core/store.js';
import { getWorld, type WorldDef } from '../core/world.js';
import { readLore, readAgain, applyPlan, type Plan } from '../sim/setup.js';
import { emptyWhy, gaveUpWhy, reading, stopReading, clock, limitText } from '../sim/reading.js';
import { actsOf } from '../sim/hostile.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';

export const SU = { open: false, busy: '', plan: null as Plan | null, done: '' };
const ctxW = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };

export const setupButton = (label = 'Set up from the lore…') => `<button class="mu-su-btn" data-act="su-open">${icon('book')}<span>${esc(label)}</span></button>`;

/** The running clocks on a reading in progress (this part, in all), updated in place once a second. */
let tick = 0;
export function readingClock(on: boolean) {
    clearInterval(tick);
    if (on) tick = window.setInterval(() => {
        for (const el of document.querySelectorAll<HTMLElement>('#mundi-root .mu-clock')) el.textContent = clock(Date.now() - (el.dataset.since === 'all' ? reading.started : reading.since));
    }, 1000);
}
/** While the AI reads: what it is on, how long it has taken, and a way to stop. */
export const readingHtml = (busy: string, stopAct: string, what: string) => `<p class="mu-su-busy"><span class="mu-spin" aria-hidden="true"></span><span>${esc(busy)}</span></p>
    <p class="mu-su-clock">This part: <b class="mu-clock" data-since="part">${clock(Date.now() - reading.since)}</b> · in all: <b class="mu-clock" data-since="all">${clock(Date.now() - reading.started)}</b></p>
    <p class="mu-muted">${esc(what)} A model that thinks first can take a minute or more per part. A part that takes longer than ${limitText()} is split in two, then skipped.</p>
    <div class="mu-row"><button data-act="${stopAct}" ${reading.stop ? 'disabled' : ''}>${icon('pause')}<span>${reading.stop ? 'Stopping…' : 'Stop, and keep what was read'}</span></button></div>`;

export async function runSetup() {
    const c = ctxW(); if (!c || SU.busy) return;
    SU.open = true; SU.plan = null; SU.done = ''; SU.busy = 'Starting…'; notify();
    readingClock(true);
    try { SU.plan = await readLore(c.g, c.w, (t) => { SU.busy = t; notify(); }); }
    catch (e: any) { toast(`The AI could not read the lore: ${String(e?.message ?? e)}`, 'error'); SU.open = false; }
    readingClock(false);
    SU.busy = ''; notify();
}
/** Reads the skipped parts again, and after Stop the ones not read yet; what is found joins the review. */
async function runAgain() {
    const c = ctxW(); const plan = SU.plan; if (!c || !plan || SU.busy) return;
    SU.busy = 'Reading again…'; notify();
    readingClock(true);
    try { await readAgain(c.g, c.w, plan, (t) => { SU.busy = t; notify(); }); }
    catch (e: any) { toast(`The AI could not read it: ${String(e?.message ?? e)}`, 'error'); }
    readingClock(false);
    SU.busy = ''; notify();
}
/** Which entries were skipped, by name. */
function skippedHtml(p: Plan): string {
    const titles = [...new Set(p.issues.skipped.flatMap(x => x.titles))];
    if (!titles.length) return '';
    const few = titles.slice(0, 6).join(', ');
    return `<details class="mu-su-skipped"><summary>Skipped: ${esc(few)}${titles.length > 6 ? ` and ${titles.length - 6} more` : ''}</summary><ul>${titles.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
}
/** The button that reads the skipped parts (and what Stop left) again. */
function againButton(p: Plan, primary = false): string {
    const { skipped, unread, gaveUp } = p.issues;
    if (!skipped.length && !unread.length) return '';
    const label = unread.length && !gaveUp ? `Continue reading (${unread.length} part${unread.length === 1 ? '' : 's'} left${skipped.length ? `, ${skipped.length} skipped` : ''})` : gaveUp ? 'Try again' : `Read the ${skipped.length === 1 ? 'skipped part' : `${skipped.length} skipped parts`} again`;
    return `<button ${primary ? 'class="mu-primary" ' : ''}data-act="su-again">${icon('redo')}<span>${esc(label)}</span></button>`;
}

function lawText(w: WorldDef, l: Plan['laws'][number]) {
    const acts = l.allows.map(a => actsOf(w).find(d => d.id === a)?.name.toLowerCase() ?? a).join(', ');
    return `${l.who.length ? l.who.join(' or ') : 'Anyone'} may ${acts} ${l.about.join(' or ')}${l.handTo ? `, and hand them to ${l.handTo}${l.reward ? ` (+${l.reward})` : ''}` : ''}${l.counts === 'minor' ? ' (a minor offense)' : ''}.${l.objectors?.length ? ` ${l.objectors.join(', ')} disapprove.` : ''}${l.note ? ` ${l.note}` : ''}`;
}
function issuesHtml(p: Plan, nothing = false): string {
    const i = p.issues;
    if (i.gaveUp) return `<p class="mu-su-warn">${icon('alert')}<span>${esc(gaveUpWhy)}${i.error && !/no message generated/i.test(i.error) ? ` (${esc(i.error.slice(0, 160))})` : ''}</span></p>${skippedHtml(p)}`;
    const stop = i.stopped ? `<p class="mu-su-warn">${icon('pause')}<span>You stopped it after ${esc(i.stopped)}.${nothing ? '' : ' Below is what was read by then: apply it, or continue reading first.'}</span></p>` : '';
    if (!i.failed) return stop;
    return `${stop}<p class="mu-su-warn">${icon('alert')}<span>The AI gave nothing back for ${i.failed} of ${i.total} part${i.total === 1 ? '' : 's'}${i.failed < i.total ? `, so ${i.failed === 1 ? 'that one was' : 'those were'} skipped; the rest was read` : ''}. ${esc(emptyWhy)}${i.error && !/no message generated/i.test(i.error) ? ` (${esc(i.error.slice(0, 160))})` : ''}</span></p>${skippedHtml(p)}`;
}
function planHtml(g: Save, w: WorldDef, p: Plan): string {
    const places = w.places.filter(x => !x.link);
    const groupNames = p.groups.filter(x => x.keep).map(x => x.name);
    const nothing = !p.people.length && !p.groups.length && !p.laws.length && !p.police && !p.notPeople.length;
    if (nothing) return `${issuesHtml(p, true)}<p class="mu-muted">${p.issues.gaveUp ? 'Nothing was read.' : p.issues.stopped ? 'Nothing was found before you stopped it.' : p.issues.total && p.issues.failed === p.issues.total ? 'Nothing could be read.' : 'The AI found nothing to set up in the lore: no groups, laws or people it could classify.'}</p><div class="mu-row">${againButton(p, true) || '<button data-act="su-open">Try again</button>'}<button data-act="su-close">Close</button></div>`;
    return `${issuesHtml(p)}
        ${p.police ? `<section><h4>The law</h4><label class="mu-check"><input type="checkbox" data-input="su-keep" data-k="police" ${p.police.keep ? 'checked' : ''}><span>${p.police.exists ? `There is law here: <b>${esc(p.police.name || 'yes')}</b>` : '<b>No law</b>: no police, nobody comes'}</span></label></section>` : ''}
        ${p.laws.length ? `<section><h4>Laws of this world</h4>${p.laws.map((l, i) => `<label class="mu-check"><input type="checkbox" data-input="su-keep" data-k="law" data-i="${i}" ${l.keep ? 'checked' : ''}><span><b>${esc(l.name)}</b><small>${esc(lawText(w, l))}</small></span></label>`).join('')}</section>` : ''}
        ${p.groups.length ? `<section><h4>Groups</h4>${p.groups.map((x, i) => `<div class="mu-su-row"><label class="mu-check"><input type="checkbox" data-input="su-keep" data-k="group" data-i="${i}" ${x.keep ? 'checked' : ''}><span><b>${esc(x.name)}</b>${x.baseText ? `<small>based: ${esc(x.baseText)}</small>` : ''}</span></label>
            <select data-input="su-base" data-i="${i}"><option value="">No base on the map</option>${places.map(pl => `<option value="${esc(pl.id)}" ${x.base === pl.id ? 'selected' : ''}>${esc(pl.name)}</option>`).join('')}</select></div>`).join('')}</section>` : ''}
        ${p.people.length ? `<section><h4>The people</h4>${p.people.map((x, i) => `<div class="mu-su-row is-person"><label class="mu-check"><input type="checkbox" data-input="su-keep" data-k="person" data-i="${i}" ${x.keep ? 'checked' : ''}><span><b data-notr>${esc(x.name)}</b></span></label>
            <input type="text" data-input="su-kind" data-i="${i}" maxlength="60" value="${esc(x.kind)}" placeholder="what they are">
            <label class="mu-su-law"><input type="checkbox" data-input="su-law" data-i="${i}" ${x.law ? 'checked' : ''}>the law</label>
            <select data-input="su-group" data-i="${i}"><option value="">No group</option>${groupNames.map(n => `<option ${x.group === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`).join('')}</section>` : ''}
        ${p.notPeople.length ? `<section><h4>Not people</h4>${p.notPeople.map((x, i) => `<label class="mu-check"><input type="checkbox" data-input="su-keep" data-k="np" data-i="${i}" ${x.keep ? 'checked' : ''}><span>${esc(x.word)}</span></label>`).join('')}</section>` : ''}
        <div class="mu-row"><button class="mu-primary" data-act="su-apply">${icon('check')}<span>Apply</span></button>${againButton(p)}<button data-act="su-close">Not now</button></div>`;
}
export function setupHtml(): string {
    if (!SU.open) return '';
    const c = ctxW(); if (!c) return '';
    const body = SU.busy ? readingHtml(SU.busy, 'su-stop', 'One AI call per part of the lore, and one for every eight characters.')
        : SU.done ? `<p class="mu-su-done">${icon('check')}<span>Applied: ${esc(SU.done)}.</span></p><p class="mu-muted">Change anything later in the Rough stuff menu (laws, who you are) and in ☰ → People in your story (groups, what each person is).</p><div class="mu-row"><button class="mu-primary" data-act="su-close">Done</button></div>`
            : SU.plan ? planHtml(c.g, c.w, SU.plan) : '';
    return `<div class="mu-dlg-veil is-fixed" data-act="su-close"></div><div class="mu-panel mu-confirm mu-su" role="dialog" aria-label="Set up from the lore">
        <header class="mu-su-top"><h3>${icon('book')}<span>Set up from the lore</span></h3><button class="mu-ibtn mu-ghost" data-act="su-close" aria-label="Close">${icon('x')}</button></header>
        <p class="mu-muted">${SU.busy ? 'The AI is reading this game\'s lorebooks and its characters\' cards. Nothing is changed until you have looked at what it found and applied it.' : 'The AI read this game\'s lorebooks and its characters\' cards. Untick what is wrong; nothing is changed until you apply it.'}</p>
        ${body}</div>`;
}

Object.assign(ACT, {
    'su-open': (el, e) => { (ACT['hx-close'] as any)?.(el, e); void runSetup(); },   // over the Rough stuff menu: that one closes
    'su-close': () => { if (SU.busy) return; SU.open = false; notify(); },
    'su-again': () => { void runAgain(); },
    'su-stop': () => { stopReading(); SU.busy = 'Stopping…'; notify(); },
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
