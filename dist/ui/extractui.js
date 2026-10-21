// "Find the characters in it": a lorebook or a card with several people in it becomes one card per person. The AI
// reads it (or, for a lorebook, a quick look without AI), you tick who to keep and fix names, Mundi makes the cards.
import { notify, toast, esc } from '../core/store.js';
import { cardSource, lorebookSource, extract, guessPeople, makeCards, lastRead } from '../sim/extract.js';
import { emptyWhy } from '../sim/reading.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';
export const EX = {
    open: false, kind: 'card', id: '',
    src: null, found: [], busy: '', open1: -1,
    linkLore: true, sourcePicture: false, done: [],
};
/** The button on a card or a lorebook in the Library. */
export const extractButton = (kind, id) => `<button class="mu-ex-btn" data-act="ex-open" data-kind="${kind}" data-id="${esc(id)}">${icon('users')}<span>${kind === 'card' ? 'Split into characters…' : 'Find the characters in it…'}</span></button>`;
async function load() {
    EX.busy = 'Opening…';
    notify();
    try {
        EX.src = EX.kind === 'card' ? await cardSource(EX.id) : await lorebookSource(EX.id);
    }
    catch (e) {
        toast(String(e?.message ?? e), 'error');
        EX.open = false;
    }
    EX.busy = '';
    notify();
}
async function read(ai) {
    const src = EX.src;
    if (!src || EX.busy)
        return;
    if (!src.parts.length) {
        toast('There is nothing to read in it.', 'info');
        return;
    }
    if (!ai) {
        EX.found = guessPeople(src);
        if (!EX.found.length)
            toast('No entry looks like a person. Try reading it with the AI.', 'info');
        notify();
        return;
    }
    EX.busy = 'Reading…';
    notify();
    try {
        EX.found = await extract(src, (i, n) => { EX.busy = i < n ? `Reading part ${i + 1} of ${n}…` : 'Done.'; notify(); });
        if (lastRead.failed)
            toast(`The AI gave nothing back for ${lastRead.failed} of ${lastRead.total} part${lastRead.total === 1 ? '' : 's'}${lastRead.failed < lastRead.total ? ' (skipped; the rest was read)' : ''}. ${emptyWhy}`, 'warn', { ms: 12000 });
        else if (!EX.found.length)
            toast('The AI found nobody in it.', 'info');
    }
    catch (e) {
        toast(`The AI could not read it: ${String(e?.message ?? e)}`, 'error');
    }
    EX.busy = '';
    notify();
}
async function make() {
    const src = EX.src;
    if (!src || EX.busy)
        return;
    const n = EX.found.filter(f => f.keep).length;
    if (!n) {
        toast('Tick at least one person.', 'info');
        return;
    }
    EX.busy = 'Making the cards…';
    notify();
    try {
        EX.done = await makeCards(src, EX.found, { linkLore: EX.linkLore, sourcePicture: EX.sourcePicture }, (i, total) => { EX.busy = i < total ? `Making card ${i + 1} of ${total}…` : 'Done.'; notify(); });
        toast(`Made ${EX.done.length} card${EX.done.length === 1 ? '' : 's'}, in the folder “${src.title}”. Pick them in a new game's cast step, or give them a picture in the Library.`, 'success', { ms: 9000 });
        EX.found = EX.found.filter(f => !f.keep);
    }
    catch (e) {
        toast(String(e?.message ?? e), 'error');
    }
    EX.busy = '';
    notify();
}
function row(f, i) {
    const tags = [f.exists ? 'you already have a card with this name' : '', f.minor ? 'underage: kept out of romance' : ''].filter(Boolean);
    const sum = [f.kind, f.age && `Age ${f.age}`, f.appearance, f.personality].filter(Boolean).join(' · ');
    const open = EX.open1 === i;
    return `<li class="mu-ex-p ${f.keep ? 'is-on' : ''}">
        <label class="mu-ex-head"><input type="checkbox" data-input="ex-keep" data-i="${i}" ${f.keep ? 'checked' : ''}>
            <input type="text" class="mu-ex-name" data-input="ex-name" data-i="${i}" value="${esc(f.name)}" maxlength="60" aria-label="Name"></label>
        <button class="mu-ghost mu-ex-more" data-act="ex-more" data-i="${i}">${open ? 'Less' : 'More'}</button>
        ${tags.length ? `<small class="mu-ex-tags">${tags.map(t => `<em>${esc(t)}</em>`).join('')}</small>` : ''}
        <p class="mu-ex-sum">${esc(sum.slice(0, 220)) || '<span class="mu-muted">No details.</span>'}</p>
        ${open ? `<dl class="mu-ex-dl">${[['Also called', f.aliases.join(', ')], ['What they are', f.kind], ['Appearance', f.appearance], ['Personality', f.personality], ['Background', f.background], ['Relationships', f.relationships], ['How they talk', f.speech], ['Greeting', f.greeting]].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
    </li>`;
}
export function extractHtml() {
    if (!EX.open)
        return '';
    const src = EX.src;
    const kept = EX.found.filter(f => f.keep).length;
    const body = !src ? `<p class="mu-muted">${esc(EX.busy || 'Opening…')}</p>` : `
        <p class="mu-muted">${src.kind === 'card' ? `The card “${esc(src.title)}”` : `The lorebook “${esc(src.title)}”`}: ${src.parts.length} part${src.parts.length === 1 ? '' : 's'} to read${src.lorebook && src.kind === 'card' ? `, with its lorebook “${esc(src.lorebook)}”` : ''}. Nothing in it is changed.</p>
        ${EX.found.length ? `<ul class="mu-ex-list" data-keep="ex">${EX.found.map(row).join('')}</ul>
            <label class="mu-check"><input type="checkbox" data-input="ex-lore" ${EX.linkLore ? 'checked' : ''} ${src.lorebook ? '' : 'disabled'}><span>Link the lorebook to each card<small>${src.lorebook ? `“${esc(src.lorebook)}” goes with them, so they keep their world's lore.` : 'There is no lorebook to link.'}</small></span></label>
            ${src.avatar ? `<label class="mu-check"><input type="checkbox" data-input="ex-pic" ${EX.sourcePicture ? 'checked' : ''}><span>Use the card's picture for all of them<small>Otherwise each gets a picture with their initials; make portraits later (Library → Expressions).</small></span></label>` : ''}
            <div class="mu-row"><button class="mu-primary" data-act="ex-make" ${EX.busy || !kept ? 'disabled' : ''}>${icon('plus')}<span>${EX.busy && EX.busy.startsWith('Making') ? esc(EX.busy) : `Make ${kept} card${kept === 1 ? '' : 's'}`}</span></button>
                <button data-act="ex-read" data-v="ai" ${EX.busy ? 'disabled' : ''}>Read it again</button></div>`
        : `<div class="mu-row"><button class="mu-primary" data-act="ex-read" data-v="ai" ${EX.busy ? 'disabled' : ''}>${icon('search')}<span>${EX.busy ? esc(EX.busy) : 'Read it with the AI'}</span></button>
            ${src.kind === 'lorebook' ? `<button data-act="ex-read" data-v="quick" ${EX.busy ? 'disabled' : ''}>Quick look (no AI)</button>` : ''}</div>
            <small class="mu-muted">One AI call per part. It lists the people in it (not places or lore) with their look, personality, background and how they talk.</small>`}
        ${EX.done.length ? `<p class="mu-ex-done">${icon('check')}<span>${EX.done.length} card${EX.done.length === 1 ? '' : 's'} made, in the folder “${esc(src.title)}”.</span></p>` : ''}`;
    return `<div class="mu-dlg-veil is-fixed" data-act="ex-close"></div><div class="mu-panel mu-confirm mu-ex" role="dialog" aria-label="Find the characters">
        <header class="mu-ex-top"><h3>${icon('users')}<span>Find the characters</span></h3><button class="mu-ibtn mu-ghost" data-act="ex-close" aria-label="Close">${icon('x')}</button></header>
        ${body}</div>`;
}
Object.assign(ACT, {
    'ex-open': (el) => { Object.assign(EX, { open: true, kind: el.dataset.kind, id: el.dataset.id, src: null, found: [], busy: '', open1: -1, done: [], linkLore: true, sourcePicture: false }); notify(); void load(); },
    'ex-close': () => { if (EX.busy && !EX.busy.startsWith('Done'))
        return; EX.open = false; notify(); },
    'ex-read': (el) => { void read(el.dataset.v === 'ai'); },
    'ex-make': () => { void make(); },
    'ex-more': (el) => { const i = Number(el.dataset.i); EX.open1 = EX.open1 === i ? -1 : i; notify(); },
});
Object.assign(INPUT, {
    'ex-keep': (el) => { const f = EX.found[Number(el.dataset.i)]; if (f) {
        f.keep = el.checked;
        notify();
    } },
    'ex-name': (el) => { const f = EX.found[Number(el.dataset.i)]; if (f)
        f.name = el.value; },
    'ex-lore': (el) => { EX.linkLore = el.checked; },
    'ex-pic': (el) => { EX.sourcePicture = el.checked; },
});
