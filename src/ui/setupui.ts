// "Set up from the lore", on screen: the AI reads, you review (untick what is wrong, fix what each person is, pick a
// group's base), and only then is it applied.
import { game, notify, toast, esc, saveGame, type Save } from '../core/store.js';
import { getWorld, type WorldDef } from '../core/world.js';
import { readLore, readAgain, applyPlan, type Plan } from '../sim/setup.js';
import { emptyWhy, gaveUpText, thinkText, reading, stopReading, clock, limitText } from '../sim/reading.js';
import { actsOf } from '../sim/hostile.js';
import { templatesFor, templateById, setupOfGame, isEmptySetup, setupSummary, summary, saveInto, deleteTemplate, addTemplate, toPlan, exportText, importText } from '../sim/templates.js';
import { slug } from '../sim/creator.js';
import { pickFile } from './cropper.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';

export const SU = { open: false, busy: '', plan: null as Plan | null, done: '', view: 'read' as 'read' | 'tpl', tplName: '', confirmDel: '', openMore: false };
const ctxW = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };

export const setupButton = (label = 'Set up from the lore…') => `<span class="mu-su-btns"><button class="mu-su-btn" data-act="su-open">${icon('book')}<span>${esc(label)}</span></button><button class="mu-su-btn" data-act="su-tpls">${icon('save')}<span>Templates…</span></button></span>`;

/** Opens a template's setup for review in this game (from a new game started with it, or the Templates screen). */
export function openTemplateSetup(id: string) {
    const c = ctxW(); const t = templateById(id); if (!c || !t) return;
    Object.assign(SU, { open: true, view: 'read', plan: toPlan(c.g, c.w, t), done: '', busy: '' });
    notify();
}
/** The name a save from this game goes under: the template it was started from, or a new one. */
const defaultName = (g: Save, w: WorldDef) => SU.tplName || String((g as any).template ?? '') || `${w.name} setup`;
function saveRow(g: Save, w: WorldDef): string {
    const names = templatesFor(w.id).filter(t => t.world === w.id).map(t => t.name);
    return `<div class="mu-row mu-su-save"><input type="text" list="mu-tpl-names" data-input="su-tpl-name" value="${esc(defaultName(g, w))}" maxlength="60" aria-label="Template name"><datalist id="mu-tpl-names">${names.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
        <button class="mu-primary" data-act="su-tpl-save">${icon('save')}<span>Save as a template</span></button></div>
        <small class="mu-muted">With the name of a template you already have, this setup is added to it (its people and lorebooks stay as they are).</small>`;
}
function tplRow(w: WorldDef, t: ReturnType<typeof templatesFor>[number]): string {
    const date = new Date(t.created).toLocaleDateString();
    return `<div class="mu-su-tpl"><div class="mu-su-tpl-info"><b>${esc(t.name)}</b><small>${esc(summary(t) || 'Empty')} · ${esc(date)}${t.world !== w.id ? ` · made in “${esc(t.worldName || t.world)}”, so its places may not match` : ''}</small></div>
        <div class="mu-row">${!isEmptySetup(t.setup) ? `<button data-act="su-tpl-use" data-id="${esc(t.id)}">Use its setup…</button>` : ''}<button class="mu-ghost" data-act="su-tpl-export" data-id="${esc(t.id)}">${icon('download')}<span>Export</span></button>
        ${SU.confirmDel === t.id ? `<button class="mu-danger" data-act="su-tpl-del-yes" data-id="${esc(t.id)}">Delete it</button><button data-act="su-tpl-del-no">Keep</button>` : `<button class="mu-ghost" data-act="su-tpl-del" data-id="${esc(t.id)}">${icon('trash')}<span>Delete</span></button>`}</div></div>`;
}
function templatesHtml(g: Save, w: WorldDef): string {
    const mine = setupOfGame(g, w);
    const list = templatesFor(w.id);
    const here = list.filter(t => t.world === w.id), other = list.filter(t => t.world !== w.id);
    return `<p class="mu-muted">A template is how a game of a world starts. It holds the people, their lorebooks, the households and the difficulty, saved at a new game's last step, and the setup: the law, the laws, the groups and what each person is, saved here. A new game can start from one without the AI reading the lore again.</p>
        <section><h4>Save this game's setup</h4>${isEmptySetup(mine) ? '<p class="mu-muted">This game has no setup yet. Set it up from the lore first, or by hand (Rough stuff menu, ☰ → People in your story).</p>' : `<p class="mu-muted">${esc(setupSummary(mine))}</p>${saveRow(g, w)}`}</section>
        <section><h4>Templates of ${esc(w.name)}</h4>${here.length ? here.map(t => tplRow(w, t)).join('') : '<p class="mu-muted">None yet.</p>'}</section>
        ${other.length ? `<section><h4>Of other worlds</h4>${other.map(t => tplRow(w, t)).join('')}</section>` : ''}
        <div class="mu-row"><button data-act="su-tpl-import">${icon('upload')}<span>Import a template file…</span></button><button data-act="su-close">Close</button></div>`;
}

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
    SU.open = true; SU.view = 'read'; SU.plan = null; SU.done = ''; SU.busy = 'Starting…'; notify();
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
    return `${l.who.length ? l.who.join(' or ') : 'Anyone'} may ${acts} ${l.about.join(' or ')}${l.handTo ? `, and hand them to ${l.handTo}${l.reward ? ` (+${l.reward})` : ''}` : ''}${l.consent ? ', if they agree' : ''}${l.counts === 'minor' ? ' (a minor offense)' : ''}.${l.objectors?.length ? ` ${l.objectors.join(', ')} disapprove.` : ''}${l.note ? ` ${l.note}` : ''}`;
}
/** Which thinking the model read with, when it was not "none". */
function thinkHtml(p: Plan): string {
    const t = p.issues.think ?? 0; if (!t || p.issues.gaveUp) return '';
    return `<p class="mu-muted mu-su-think">${p.issues.stepped ? `This model would not read with its thinking turned off, so it read with ${esc(thinkText(t))} and more room to answer. Mundi remembers that for this model.` : `This model reads with ${esc(thinkText(t))} and more room to answer (remembered from an earlier reading).`}</p>`;
}
function issuesHtml(p: Plan, nothing = false): string {
    const i = p.issues;
    if (i.gaveUp) return `<p class="mu-su-warn">${icon('alert')}<span>${esc(gaveUpText(i.error))}</span></p>${skippedHtml(p)}`;
    const stop = i.stopped ? `<p class="mu-su-warn">${icon('pause')}<span>You stopped it after ${esc(i.stopped)}.${nothing ? '' : ' Below is what was read by then: apply it, or continue reading first.'}</span></p>` : '';
    if (!i.failed) return stop;
    return `${stop}<p class="mu-su-warn">${icon('alert')}<span>The AI gave nothing back for ${i.failed} of ${i.total} part${i.total === 1 ? '' : 's'}${i.failed < i.total ? `, so ${i.failed === 1 ? 'that one was' : 'those were'} skipped; the rest was read` : ''}. ${esc(emptyWhy)}${i.error && !/no message generated/i.test(i.error) ? ` (${esc(i.error.slice(0, 160))})` : ''}</span></p>${skippedHtml(p)}`;
}
/** The groups: the ones ticked (someone here is in them, or they have a base), then the rest of the lore's, folded away. */
function groupsHtml(p: Plan, places: WorldDef['places']): string {
    const row = (x: Plan['groups'][number], i: number) => `<div class="mu-su-row"><label class="mu-check"><input type="checkbox" data-input="su-keep" data-k="group" data-i="${i}" ${x.keep ? 'checked' : ''}><span><b>${esc(x.name)}</b>${x.baseText ? `<small>based: ${esc(x.baseText)}</small>` : ''}</span></label>
            <select data-input="su-base" data-i="${i}"><option value="">No base on the map</option>${places.map(pl => `<option value="${esc(pl.id)}" ${x.base === pl.id ? 'selected' : ''}>${esc(pl.name)}</option>`).join('')}</select></div>`;
    const on = p.groups.map((x, i) => [x, i] as const).filter(([x]) => x.keep), off = p.groups.map((x, i) => [x, i] as const).filter(([x]) => !x.keep);
    return `<section><h4>Groups</h4>${on.length ? on.map(([x, i]) => row(x, i)).join('') : '<p class="mu-muted">None in use here yet.</p>'}
        ${off.length ? `<details class="mu-su-more" ${SU.openMore ? 'open' : ''}><summary data-act="su-more">${off.length} more group${off.length === 1 ? '' : 's'} in the lore that nobody here belongs to (tick the ones you want)</summary>${off.map(([x, i]) => row(x, i)).join('')}</details>` : ''}</section>`;
}
function planHtml(g: Save, w: WorldDef, p: Plan): string {
    const places = w.places.filter(x => !x.link);
    const groupNames = p.groups.filter(x => x.keep).map(x => x.name);
    const nothing = !p.people.length && !p.groups.length && !p.laws.length && !p.police && !p.notPeople.length;
    if (nothing) return `${issuesHtml(p, true)}<p class="mu-muted">${p.issues.gaveUp ? 'Nothing was read.' : p.issues.stopped ? 'Nothing was found before you stopped it.' : p.issues.total && p.issues.failed === p.issues.total ? 'Nothing could be read.' : 'The AI found nothing to set up in the lore: no groups, laws or people it could classify.'}</p><div class="mu-row">${againButton(p, true) || '<button data-act="su-open">Try again</button>'}<button data-act="su-close">Close</button></div>`;
    return `${issuesHtml(p)}${thinkHtml(p)}
        ${p.police ? `<section><h4>The law</h4><label class="mu-check"><input type="checkbox" data-input="su-keep" data-k="police" ${p.police.keep ? 'checked' : ''}><span>${p.police.exists ? `There is law here: <b>${esc(p.police.name || 'yes')}</b>` : '<b>No law</b>: no police, nobody comes'}</span></label></section>` : ''}
        ${p.laws.length ? `<section><h4>Laws of this world</h4>${p.laws.map((l, i) => `<label class="mu-check"><input type="checkbox" data-input="su-keep" data-k="law" data-i="${i}" ${l.keep ? 'checked' : ''}><span><b>${esc(l.name)}</b><small>${esc(lawText(w, l))}</small></span></label>`).join('')}</section>` : ''}
        ${p.groups.length ? groupsHtml(p, places) : ''}
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
    const body = SU.view === 'tpl' ? templatesHtml(c.g, c.w)
        : SU.busy ? readingHtml(SU.busy, 'su-stop', 'One AI call per part of the lore, and one for every eight characters.')
        : SU.done ? `<p class="mu-su-done">${icon('check')}<span>Applied: ${esc(SU.done)}.</span></p><p class="mu-muted">Change anything later in the Rough stuff menu (laws, who you are) and in ☰ → People in your story (groups, what each person is).</p>
            <section><h4>Keep it for another game of ${esc(c.w.name)}</h4>${saveRow(c.g, c.w)}</section><div class="mu-row"><button data-act="su-close">Done</button></div>`
            : SU.plan ? planHtml(c.g, c.w, SU.plan) : '';
    return `<div class="mu-dlg-veil is-fixed" data-act="su-close"></div><div class="mu-panel mu-confirm mu-su" role="dialog" aria-label="Set up from the lore">
        <header class="mu-su-top"><h3>${icon(SU.view === 'tpl' ? 'save' : 'book')}<span>${SU.view === 'tpl' ? 'Templates' : SU.plan?.from ? `The template “${esc(SU.plan.from)}”` : 'Set up from the lore'}</span></h3><button class="mu-ibtn mu-ghost" data-act="su-close" aria-label="Close">${icon('x')}</button></header>
        ${SU.view === 'tpl' || SU.done ? '' : SU.plan?.from ? `<p class="mu-muted">Its setup, for this game. Untick what is wrong; nothing is changed until you apply it.${SU.plan.unmatched?.length ? ` Not in this game, so left out: ${esc(SU.plan.unmatched.join(', '))}.` : ''}</p>` : `<p class="mu-muted">${SU.busy ? 'The AI is reading this game\'s lorebooks and its characters\' cards. Nothing is changed until you have looked at what it found and applied it.' : 'The AI read this game\'s lorebooks and its characters\' cards. Untick what is wrong; nothing is changed until you apply it.'}</p>`}
        ${body}</div>`;
}

Object.assign(ACT, {
    'su-open': (el, e) => { (ACT['hx-close'] as any)?.(el, e); SU.view = 'read'; void runSetup(); },   // over the Rough stuff menu: that one closes
    'su-close': () => { if (SU.busy) return; SU.open = false; notify(); },
    'su-again': () => { void runAgain(); },
    'su-more': (el, e) => { e?.preventDefault?.(); SU.openMore = !SU.openMore; notify(); },
    'su-tpls': (el, e) => { (ACT['hx-close'] as any)?.(el, e); Object.assign(SU, { open: true, view: 'tpl', plan: null, done: '', busy: '', confirmDel: '' }); notify(); },
    'su-tpl-use': (el) => { openTemplateSetup(el.dataset.id!); },
    'su-tpl-save': () => {
        const c = ctxW(); if (!c) return;
        const setup = setupOfGame(c.g, c.w);
        if (isEmptySetup(setup)) { toast('This game has no setup to save yet.', 'info'); return; }
        const { t, isNew } = saveInto(c.w, defaultName(c.g, c.w), { setup });
        (c.g as any).template = t.name; saveGame();
        toast(isNew ? `Saved as the template “${t.name}”. A new game of ${c.w.name} can start from it.` : `The setup is saved into the template “${t.name}”.`, 'success', { ms: 7000 });
        SU.tplName = ''; notify();
    },
    'su-tpl-export': (el) => {
        const t = templateById(el.dataset.id!); if (!t) return;
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportText(t)], { type: 'application/json' })); a.download = `${slug(t.name)}.mundi-template.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },
    'su-tpl-import': async () => {
        const f = await pickFile('.json,application/json'); if (!f) return;
        try { const t = importText(await f.text()); const name = addTemplate(t); toast(`Imported the template “${name}”${ctxW() && t.world !== ctxW()!.w.id ? ` (made in “${t.worldName || t.world}”)` : ''}.`, 'success'); }
        catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        notify();
    },
    'su-tpl-del': (el) => { SU.confirmDel = el.dataset.id!; notify(); },
    'su-tpl-del-no': () => { SU.confirmDel = ''; notify(); },
    'su-tpl-del-yes': (el) => { deleteTemplate(el.dataset.id!); SU.confirmDel = ''; toast('Template deleted.', 'info'); notify(); },
    'su-stop': () => { stopReading(); SU.busy = 'Stopping…'; notify(); },
    'su-apply': () => {
        const c = ctxW(); if (!c || !SU.plan) return;
        SU.done = applyPlan(c.g, c.w, SU.plan) || 'nothing';
        void import('../sim/prompt.js').then(m => m.refreshPrompt());
        notify();
    },
});
Object.assign(INPUT, {
    'su-tpl-name': (el) => { SU.tplName = el.value; },
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
