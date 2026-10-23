// The world creator's maps: upload a map picture, then click on it to add places, links to other maps (a city on
// the region map) or homes. Pins can be dragged. A place gets a name, a description, tags and a background
// (one of SillyTavern's backgrounds, or a picture you upload).
import { notify, esc, toast, ROOT_ID } from '../core/store.js';
import { worldFile, bgOf, num, cssUrl, type WorldDef, type Place, type MapDef } from '../core/world.js';
import { bgList, bgThumb } from '../st/bridge.js';
import { uploadWorldPicture, imageRatio, newId } from '../sim/creator.js';
import { pickFile } from './cropper.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';
import { CW, W, txt, area, sel } from './creator.js';

export const ME = { map: '', mode: 'move' as 'move' | 'place' | 'link' | 'homes', zone: '', pin: '', zoom: 1, bgPick: false, bgq: '', bgs: null as string[] | null };
const TAGS = ['leisure', 'food', 'shop', 'work', 'study', 'service', 'health'];
const TAG_NAMES: Record<string, string> = { leisure: 'Leisure', food: 'Food', shop: 'Shopping', work: 'Work', study: 'Study', service: 'Services', health: 'Health' };

const curMap = (w: WorldDef): MapDef | undefined => w.maps.find(m => m.id === ME.map) ?? w.maps[0];
const placeIdx = (w: WorldDef, id: string) => w.places.findIndex(p => p.id === id);

function pinHtml(w: WorldDef, p: Place) {
    const target = p.link ? w.maps.find(m => m.id === p.link) : null;
    return `<div class="mu-me-pin ${p.link ? 'is-link' : ''} ${ME.pin === p.id ? 'is-sel' : ''}" data-pin="${esc(p.id)}" style="left:${p.x}%;top:${p.y}%">
        <span class="dot">${p.link ? icon('map') : ''}</span><span class="label">${esc(p.name)}${target ? ` → ${esc(target.name)}` : ''}</span></div>`;
}
function homesHtml(w: WorldDef, m: MapDef) {
    return w.homes.zones.filter(z => z.map === m.id).map(z => z.spots.map((s, k) => `<div class="mu-me-home ${ME.mode === 'homes' && z.id === ME.zone ? 'is-zone' : ''}" data-zone="${esc(z.id)}" data-k="${k}" style="left:${s[0]}%;top:${s[1]}%" title="${esc(z.name)} · ${k + 1}">${k + 1}</div>`).join('')).join('');
}

function placeForm(w: WorldDef): string {
    const i = placeIdx(w, ME.pin);
    if (i < 0) return `<p class="mu-muted">${ME.mode === 'place' ? 'Click on the map to add a place.' : ME.mode === 'link' ? 'Click on the map where the other map is (a city on the region map, say).' : ME.mode === 'homes' ? 'Click on the map to add a home to the chosen area; click a home to remove it.' : 'Click a pin to edit it. Drag pins to move them.'}</p>`;
    const p = w.places[i]; const path = `places.${i}`;
    if (p.link) {
        return `<h4>Link to another map</h4>${txt('Name', `${path}.name`)}
            ${sel('Opens the map', `${path}.link`, w.maps.filter(m => m.id !== p.map).map(m => [m.id, m.name] as [string, string]))}
            <p class="mu-muted">In the game, clicking it opens that map.</p>
            <button class="mu-danger" data-act="me-del-pin">${icon('trash')}<span>Remove</span></button>`;
    }
    const bg = p.bg ? worldFile(w, p.bg) : '';
    return `<h4>Place</h4><div class="mu-me-pf"><div class="mu-me-pfcol">${txt('Name', `${path}.name`)}${area('What it is (the AI and the map card use it)', `${path}.desc`, 3)}${txt('What is going on there (optional)', `${path}.event`, 'Always busy at lunch.')}</div>
        <div class="mu-me-pfcol"><div class="mu-field"><span>Tags</span><div class="mu-chips">${TAGS.map(t => `<button class="mu-chip ${(p.tags ?? []).includes(t) ? 'is-on' : ''}" data-act="cw-chip" data-path="${path}.tags" data-v="${t}">${TAG_NAMES[t]}</button>`).join('')}</div>
            <small class="mu-muted">Leisure: people spend free time here. Food and Shopping: what can be bought. Work: jobs can be here.</small></div></div>
        <div class="mu-me-pfcol"><div class="mu-field"><span>Background of the scene</span>
            <div class="mu-cw-cover is-small" style="${bg ? esc(`background-image:${cssUrl(bg)}`) : ''}">${bg ? '' : '<span>The map around it</span>'}</div>
            <div class="mu-row"><button data-act="me-bg-pick">${icon('image')}<span>From Backgrounds</span></button><button class="mu-ghost" data-act="me-bg-upload">${icon('upload')}<span>Upload</span></button>${bg ? `<button class="mu-ghost" data-act="me-bg-clear">${icon('x')}</button>` : ''}</div></div>
        <button class="mu-danger" data-act="me-del-pin">${icon('trash')}<span>Remove this place</span></button></div></div>`;
}

function bgPicker(): string {
    if (!ME.bgPick) return '';
    if (!ME.bgs) { ME.bgs = []; bgList().then(b => { ME.bgs = b.images; notify(); }).catch(() => { ME.bgs = []; }); }
    const q = ME.bgq.toLowerCase();
    const list = ME.bgs.filter(f => !q || f.toLowerCase().includes(q));
    return `<div class="mu-dlg-veil" data-act="me-bg-close"></div><div class="mu-panel mu-scpick" role="dialog"><header><h3>Background</h3><button class="mu-ibtn mu-ghost" data-act="me-bg-close" aria-label="Close">${icon('x')}</button></header>
        <input class="mu-search" type="search" data-input="me-bgq" data-focus="mebgq" placeholder="Search" value="${esc(ME.bgq)}">
        <div class="mu-scpick-grid is-bg" data-keep="mebg">${list.map(f => `<button data-act="me-bg" data-file="${esc(f)}"><img src="${esc(bgThumb(f))}" alt="" loading="lazy"><span data-notr>${esc(f.replace(/\.[a-z0-9]+$/i, ''))}</span></button>`).join('') || '<p class="mu-muted">Loading…</p>'}</div></div>`;
}

export function mapEditorHtml(w: WorldDef): string {
    const m = curMap(w);
    if (m) ME.map = m.id;
    if (ME.mode === 'homes' && !w.homes.zones.some(z => z.id === ME.zone)) ME.zone = w.homes.zones.find(z => z.map === m?.id)?.id ?? '';
    const mi = m ? w.maps.indexOf(m) : -1;
    const maps = `<aside class="mu-me-maps">
        <h4>Maps</h4>${w.maps.map(x => `<button class="mu-cw-row ${x.id === m?.id ? 'is-on' : ''}" data-act="me-map" data-id="${esc(x.id)}"><b>${esc(x.name)}</b><small>${x.parent ? `in ${esc(w.maps.find(y => y.id === x.parent)?.name ?? '')}` : 'Top map'}</small></button>`).join('')}
        <button class="mu-primary" data-act="me-add-map">${icon('plus')}<span>Add a map</span></button>
        ${m ? `<div class="mu-me-mapform">${txt('Name', `maps.${mi}.name`)}
            ${sel('It is inside', `maps.${mi}.parent`, [['', '(nothing: a top map)'], ...w.maps.filter(x => x.id !== m.id).map(x => [x.id, x.name] as [string, string])])}
            <div class="mu-row"><button class="mu-ghost" data-act="me-map-img">${icon('image')}<span>Change picture</span></button><button class="mu-ghost" data-act="me-del-map">${icon('trash')}</button></div></div>` : ''}
        <p class="mu-muted">One map per city or area. On a bigger map (a region, a kingdom), add a link where each city is: in the game it opens that city's map.</p></aside>`;
    if (!m) return `<div class="mu-me">${maps}<div class="mu-me-empty"><p>Add a map: a picture of your city, region or kingdom.</p></div></div>`;
    const zones = w.homes.zones.filter(z => z.map === m.id);
    const tools = `<div class="mu-me-tools">
        ${([['move', 'Select / move', 'select'], ['place', 'Add a place', 'pin'], ['link', 'Link to a map', 'map'], ['homes', 'Homes', 'home']] as const).map(([id, l, ic]) => `<button class="${ME.mode === id ? 'is-on' : ''}" data-act="me-mode" data-v="${id}">${icon(ic)}<span>${l}</span></button>`).join('')}
        ${ME.mode === 'homes' ? `<select data-input="me-zone">${zones.map(z => `<option value="${esc(z.id)}" ${z.id === ME.zone ? 'selected' : ''}>${esc(z.name)} (${z.spots.length})</option>`).join('') || '<option value="">(no area on this map)</option>'}</select><button class="mu-ghost" data-act="me-new-zone">${icon('plus')}<span>New area</span></button>` : ''}
        <span class="mu-me-zoom"><button data-act="me-zoom" data-d="-1">−</button><button data-act="me-zoom" data-d="1">+</button></span></div>`;
    return `<div class="mu-me">${maps}
        <div class="mu-me-center">${tools}
            <div class="mu-me-stage is-${ME.mode}" data-keep="me-stage"><div class="mu-me-img" data-me-img style="${esc(`width:${num(ME.zoom, 1) * 100}%;aspect-ratio:${num(m.ratio, 1.7914)};${bgOf(w, m.image)}`)}">
                ${homesHtml(w, m)}${w.places.filter(p => p.map === m.id).map(p => pinHtml(w, p)).join('')}</div></div></div>
        <aside class="mu-me-side" data-keep="me-side">${placeForm(w)}</aside></div>${bgPicker()}`;
}

/* ---------- pointer: add, select and drag pins ---------- */

let drag: { id: string; el: HTMLElement; sx: number; sy: number; moved: boolean; home?: { zone: string; k: number } } | null = null;
const pct = (e: PointerEvent, img: HTMLElement) => { const r = img.getBoundingClientRect(); return [+(((e.clientX - r.left) / r.width) * 100).toFixed(2), +(((e.clientY - r.top) / r.height) * 100).toFixed(2)] as [number, number]; };
const clamp = (v: number) => Math.max(0, Math.min(100, v));

// Scrolling over the map zooms it, around the mouse.
document.addEventListener('wheel', (e) => {
    const stage = (e.target as HTMLElement).closest?.(`#${ROOT_ID} .mu-me-stage`) as HTMLElement | null;
    if (!stage) return;
    const img = stage.querySelector<HTMLElement>('[data-me-img]'); if (!img) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const fx = (stage.scrollLeft + e.clientX - r.left) / img.offsetWidth, fy = (stage.scrollTop + e.clientY - r.top) / img.offsetHeight;
    ME.zoom = Math.max(0.5, Math.min(4, ME.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    img.style.width = `${ME.zoom * 100}%`;
    stage.scrollLeft = fx * img.offsetWidth - (e.clientX - r.left);
    stage.scrollTop = fy * img.offsetHeight - (e.clientY - r.top);
}, { passive: false });

document.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (!t.closest?.(`#${ROOT_ID} .mu-me-stage`) || !CW.w) return;
    const pin = t.closest<HTMLElement>('.mu-me-pin');
    const home = t.closest<HTMLElement>('.mu-me-home');
    if (pin) drag = { id: pin.dataset.pin!, el: pin, sx: e.clientX, sy: e.clientY, moved: false };
    else if (home && ME.mode !== 'homes') drag = { id: '', el: home, sx: e.clientX, sy: e.clientY, moved: false, home: { zone: home.dataset.zone!, k: Number(home.dataset.k) } };
    else return;
    e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
    drag.moved = true;
    const img = drag.el.closest<HTMLElement>('[data-me-img]'); if (!img) return;
    const [x, y] = pct(e, img);
    drag.el.style.left = `${clamp(x)}%`; drag.el.style.top = `${clamp(y)}%`;
});
document.addEventListener('pointerup', (e) => {
    const t = e.target as HTMLElement;
    if (drag) {
        const d = drag; drag = null;
        const w = CW.w; if (!w) return;
        if (d.moved) {
            const x = clamp(parseFloat(d.el.style.left)), y = clamp(parseFloat(d.el.style.top));
            if (d.home) { const z = w.homes.zones.find(z => z.id === d.home!.zone); if (z) z.spots[d.home.k] = [x, y]; }
            else { const p = w.places.find(p => p.id === d.id); if (p) { p.x = x; p.y = y; } }
            CW.dirty = true; notify(); return;
        }
        if (!d.home) { ME.pin = d.id; notify(); }
        return;
    }
    const img = t.closest?.<HTMLElement>(`#${ROOT_ID} [data-me-img]`);
    const w = CW.w; if (!img || !w) return;
    const [x, y] = pct(e, img);
    const m = curMap(w); if (!m) return;
    const homeEl = t.closest<HTMLElement>('.mu-me-home');
    if (ME.mode === 'homes') {
        const z = w.homes.zones.find(z => z.id === ME.zone);
        if (!z) { toast('Create a housing area first (New area).', 'info'); return; }
        if (homeEl && homeEl.dataset.zone === z.id) z.spots.splice(Number(homeEl.dataset.k), 1);
        else z.spots.push([x, y]);
        CW.dirty = true; notify(); return;
    }
    if (ME.mode === 'place') {
        const p: Place = { id: newId('place'), name: 'New place', map: m.id, x, y, tags: ['leisure'], desc: '' };
        w.places.push(p); ME.pin = p.id; ME.mode = 'move'; CW.dirty = true; notify();
        setTimeout(() => document.querySelector<HTMLInputElement>(`#${ROOT_ID} .mu-me-side input`)?.select(), 50);
        return;
    }
    if (ME.mode === 'link') {
        const other = w.maps.find(x2 => x2.id !== m.id);
        if (!other) { toast('Add the other map first (Add a map).', 'info'); return; }
        const p: Place = { id: newId('link'), name: other.name, map: m.id, x, y, link: other.id };
        if (!other.parent) other.parent = m.id;
        w.places.push(p); ME.pin = p.id; ME.mode = 'move'; CW.dirty = true; notify();
        return;
    }
    if (!t.closest('.mu-me-pin')) { ME.pin = ''; notify(); }
});

/* ---------- actions ---------- */

async function addMapPicture(): Promise<{ image: string; ratio: number } | null> {
    const f = await pickFile('image/*'); if (!f) return null;
    try {
        const image = await uploadWorldPicture(W(), f, 'map');
        return { image, ratio: await imageRatio(image) };
    } catch (e: any) { toast(String(e?.message ?? e), 'error'); return null; }
}

Object.assign(ACT, {
    'me-map': (el) => { ME.map = el.dataset.id!; ME.pin = ''; notify(); },
    'me-mode': (el) => { ME.mode = el.dataset.v as any; notify(); },
    'me-zoom': (el) => { ME.zoom = Math.max(0.5, Math.min(4, ME.zoom * (el.dataset.d === '1' ? 1.25 : 0.8))); notify(); },
    'me-add-map': async () => {
        const pic = await addMapPicture(); if (!pic) return;
        const w = W();
        const m: MapDef = { id: newId('map'), name: w.maps.length ? 'New map' : w.name, ...pic };
        w.maps.push(m); ME.map = m.id; ME.pin = ''; CW.dirty = true; notify();
    },
    'me-map-img': async () => { const m = curMap(W()); const pic = await addMapPicture(); if (!m || !pic) return; Object.assign(m, pic); CW.dirty = true; notify(); },
    'me-del-map': () => {
        const w = W(); const m = curMap(w); if (!m) return;
        const n = w.places.filter(p => p.map === m.id && !p.link).length;
        if (n && !confirmTwice(`del-map-${m.id}`, `This map has ${n} places. Click again to remove the map and its places.`)) return;
        w.places = w.places.filter(p => p.map !== m.id && p.link !== m.id);
        w.homes.zones.forEach(z => { if (z.map === m.id) z.spots = []; });
        w.maps = w.maps.filter(x => x.id !== m.id);
        w.maps.forEach(x => { if (x.parent === m.id) delete x.parent; });
        ME.map = w.maps[0]?.id ?? ''; ME.pin = ''; CW.dirty = true; notify();
    },
    'me-del-pin': () => {
        const w = W(); const i = placeIdx(w, ME.pin); if (i < 0) return;
        const used = w.occupations.filter(o => o.place === ME.pin).map(o => o.name);
        if (used.length && !confirmTwice(`del-${ME.pin}`, `Jobs are here (${used.join(', ')}). Click again to remove it anyway.`)) return;
        w.places.splice(i, 1); ME.pin = ''; CW.dirty = true; notify();
    },
    'me-new-zone': () => {
        const w = W(); const m = curMap(w); if (!m) return;
        const z = { id: newId('zone'), name: `Area ${w.homes.zones.length + 1}`, map: m.id, kind: Object.keys(w.homes.kinds)[0] ?? 'apartment', rent: 300, desc: '', spots: [] as [number, number][] };
        w.homes.zones.push(z); ME.zone = z.id; CW.dirty = true; notify();
    },
    'me-bg-pick': () => { ME.bgPick = true; ME.bgq = ''; ME.bgs = null; notify(); },
    'me-bg-close': () => { ME.bgPick = false; notify(); },
    'me-bg': (el) => { const p = W().places.find(p => p.id === ME.pin); if (p) { p.bg = `/backgrounds/${encodeURIComponent(el.dataset.file!)}`; CW.dirty = true; } ME.bgPick = false; notify(); },
    'me-bg-upload': async () => {
        const p = W().places.find(p => p.id === ME.pin); if (!p) return;
        const f = await pickFile('image/*'); if (!f) return;
        try { p.bg = await uploadWorldPicture(W(), f, `place-${p.name}`); CW.dirty = true; } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        notify();
    },
    'me-bg-clear': () => { const p = W().places.find(p => p.id === ME.pin); if (p) { delete p.bg; CW.dirty = true; } notify(); },
});
Object.assign(INPUT, {
    'me-zone': (el) => { ME.zone = el.value; notify(); },
    'me-bgq': (el) => { ME.bgq = el.value; notify(); },
});

const asked = new Map<string, number>();
function confirmTwice(key: string, msg: string) {
    const t = asked.get(key) ?? 0;
    if (Date.now() - t < 5000) { asked.delete(key); return true; }
    asked.set(key, Date.now()); toast(msg, 'warn'); return false;
}
