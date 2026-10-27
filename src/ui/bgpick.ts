// Every background picker (Go out, a chat's background, a place in the World creator): two sources, side by side
// with the search. "My backgrounds": SillyTavern's own. "Mundi": the pictures that come with Mundi's worlds (their
// places and rooms). A Mundi picture is kept as its path ("/scripts/…/worlds/house/kitchen-day.jpg"); one of yours
// as its file name, as SillyTavern does.
import { notify, esc } from '../core/store.js';
import { getWorld, worldFile, BUILT_IN, worldLocked, type WorldDef } from '../core/world.js';
import { bgList, bgThumb } from '../st/bridge.js';
import { ACT } from './reg.js';

export const BG = { src: 'mine' as 'mine' | 'mundi', mine: null as string[] | null };
export const isPath = (f: string) => f.includes('/');
// What to put in CSS's url(): a path as it is, a file name from SillyTavern's backgrounds folder.
export const bgHref = (f: string) => (isPath(f) ? f : `/backgrounds/${encodeURIComponent(f)}`);
const pathOf = (u: string) => { try { return new URL(u, location.href).pathname; } catch { return u; } };

interface MundiBg { file: string; name: string; group: string }
let cache: MundiBg[] | null = null;
// The built-in worlds' place and room pictures (the day ones), world by world; the same picture only once.
export function mundiBgs(): MundiBg[] {
    if (cache) return cache;
    const seen = new Set<string>(); const out: MundiBg[] = [];
    const add = (w: WorldDef, file: string | undefined, name: string) => {
        if (!file) return; const p = pathOf(worldFile(w, file)); if (seen.has(p)) return; seen.add(p); out.push({ file: p, name, group: w.name });
    };
    for (const id of ['house', 'manor', ...BUILT_IN.filter(x => !['urban', 'house', 'manor'].includes(x))]) {
        const w = getWorld(id); if (!w || worldLocked(w)) continue;
        w.places.filter(p => !p.link).forEach(p => add(w, p.bg, p.name));
        Object.values(w.homes.kinds ?? {}).forEach((k: any) => add(w, k.image, k.name));
    }
    if (out.length) cache = out;
    return out;
}

// The search box and the two sources, in one row.
export function bgHead(input: string, focus: string, q: string): string {
    return `<div class="mu-bgsrc-row"><input class="mu-search" type="search" data-input="${input}" data-focus="${focus}" placeholder="Search backgrounds" value="${esc(q)}">
        <div class="mu-seg mu-bgsrc">${(['mine', 'mundi'] as const).map(s => `<button class="${BG.src === s ? 'is-on' : ''}" data-act="bg-src" data-v="${s}">${s === 'mine' ? 'My backgrounds' : 'Mundi'}</button>`).join('')}</div></div>`;
}
// The pictures of the source shown, as buttons (`act` with data-file); `none`: a first "None" button.
export function bgGrid(o: { act: string; q: string; keep: string; sel?: string; none?: string; extra?: string }): string {
    const q = o.q.toLowerCase();
    const on = (f: string) => (o.sel !== undefined && o.sel === f ? 'is-on' : '');
    const none = o.none !== undefined ? `<button class="${o.sel ? '' : 'is-on'}" data-act="${o.act}" data-file="">${o.none}<span>None</span></button>` : '';
    let body: string;
    if (BG.src === 'mundi') {
        const list = mundiBgs().filter(b => !q || `${b.name} ${b.group}`.toLowerCase().includes(q));
        const groups = [...new Set(list.map(b => b.group))];
        body = groups.map(gname => `<h5 class="mu-bg-group" data-notr>${esc(gname)}</h5>${list.filter(b => b.group === gname).map(b => `<button class="${on(b.file)}" data-act="${o.act}" data-file="${esc(b.file)}" title="${esc(b.name)}"><img src="${esc(b.file)}" alt="" loading="lazy"><span data-notr>${esc(b.name)}</span></button>`).join('')}`).join('') || '<p class="mu-muted">Nothing found.</p>';
    } else {
        if (!BG.mine) { BG.mine = []; bgList().then(b => { BG.mine = b.images; notify(); }).catch(() => { BG.mine = []; }); }
        const list = BG.mine.filter(f => !q || f.toLowerCase().includes(q));
        body = list.map(f => `<button class="${on(f)}" data-act="${o.act}" data-file="${esc(f)}" title="${esc(f)}"><img src="${esc(bgThumb(f))}" alt="" loading="lazy"><span data-notr>${esc(f.replace(/\.[a-z0-9]+$/i, ''))}</span></button>`).join('') || '<p class="mu-muted">Loading…</p>';
    }
    return `<div class="mu-scpick-grid is-bg ${o.extra ?? ''}" data-keep="${o.keep}">${none}${body}</div>`;
}

Object.assign(ACT, {
    'bg-src': (el) => { BG.src = (el.dataset.v as any) === 'mundi' ? 'mundi' : 'mine'; notify(); },
});
