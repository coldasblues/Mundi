// Updates the screen in place instead of rebuilding it: only what changed is touched, so animations do not replay,
// scroll positions, open menus, the phone and pictures already loaded stay as they are.
// SillyTavern's own panels shown inside Mundi ([data-native] hosts) are left alone.

import { translateTree, settle } from '../core/tr.js';

const SKIP_CHILDREN = (el: Element) => el.hasAttribute('data-native') || el.hasAttribute('data-morph-skip');

function sameNode(a: Node, b: Node): boolean {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType !== 1) return true;
    const x = a as Element, y = b as Element;
    if (x.tagName !== y.tagName) return false;
    // elements with an identity must keep it: the same line, id, scroll area or SillyTavern panel host
    const key = (e: Element) => `${e.getAttribute('data-i') ?? ''}|${e.id}|${e.getAttribute('data-keep') ?? ''}|${e.getAttribute('data-native') ?? ''}`;
    if (key(x) !== key(y)) return false;
    // a host of SillyTavern's panels is never reused for something else
    if (x.className !== y.className && (x.hasAttribute('data-native') || x.querySelector('[data-native]'))) return false;
    return true;
}

function syncAttrs(from: Element, to: Element) {
    for (const { name } of [...from.attributes]) if (!to.hasAttribute(name)) from.removeAttribute(name);
    for (const { name, value } of [...to.attributes]) if (from.getAttribute(name) !== value) from.setAttribute(name, value);
}

// message boxes the screen empties after sending
const CLEARABLE = (el: Element) => /^(composer|ph-draft|look-name)$/.test((el as HTMLElement).dataset?.focus ?? '');

function syncFormState(from: Element, to: Element) {
    if (from instanceof HTMLInputElement && to instanceof HTMLInputElement) {
        if (from.type === 'checkbox' || from.type === 'radio') { const c = to.hasAttribute('checked'); if (from.checked !== c) from.checked = c; }
        // a field you are typing in is left alone, unless the screen empties it (a message just sent)
        else { const v = to.getAttribute('value') ?? ''; if (from.value !== v && (document.activeElement !== from || (v === '' && CLEARABLE(from)))) from.value = v; }
    } else if (from instanceof HTMLTextAreaElement && to instanceof HTMLTextAreaElement) {
        if (from.value !== to.value && (document.activeElement !== from || (to.value === '' && CLEARABLE(from)))) from.value = to.value;
    } else if (from instanceof HTMLSelectElement && to instanceof HTMLSelectElement) {
        const sel = [...to.options].find(o => o.hasAttribute('selected'))?.value ?? to.options[0]?.value ?? '';
        queueMicrotask(() => { if (from.value !== sel) from.value = sel; });
    }
}

function morphNode(from: Node, to: Node) {
    if (from.nodeType === 3 || from.nodeType === 8) { if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue; return; }
    const f = from as Element, t = to as Element;
    syncAttrs(f, t);
    if (SKIP_CHILDREN(f)) return;
    // a text box: only its value matters (moving its text node would empty the new one and lose what you typed)
    if (f.tagName === 'TEXTAREA') { syncFormState(f, t); return; }
    morphChildren(f, t);
    syncFormState(f, t);
}

export function morphChildren(from: Element, to: Element) {
    const want = [...to.childNodes];
    let cur = from.firstChild;
    for (const n of want) {
        if (cur && sameNode(cur, n)) { const next = cur.nextSibling; morphNode(cur, n); cur = next; continue; }
        // look a little ahead for a matching element (an item was removed before it)
        let probe = cur?.nextSibling ?? null, found: Node | null = null;
        for (let k = 0; probe && k < 4; k++, probe = probe.nextSibling) if (sameNode(probe, n) && (n.nodeType !== 1 || (probe as Element).className === (n as Element).className)) { found = probe; break; }
        if (found) {
            while (cur && cur !== found) { const next = cur.nextSibling; from.removeChild(cur); cur = next; }
            const next = found.nextSibling; morphNode(found, n); cur = next; continue;
        }
        from.insertBefore(n, cur);   // a new node
    }
    while (cur) { const next = cur.nextSibling; from.removeChild(cur); cur = next; }
}

// Draws `html` into `host`, changing only what differs.
export function morph(host: Element, html: string) {
    const t = document.createElement('template');
    t.innerHTML = html;
    const wrap = document.createElement('div');
    wrap.appendChild(t.content);
    translateTree(wrap);   // the interface in the chosen language, before it reaches the screen
    morphChildren(host, wrap);
    settle();
}
