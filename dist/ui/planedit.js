// The world creator's house map for a scenario: the rooms (pins on the house map, as before) or an optional floor
// plan. The plan has floors (each with a picture of the plan, optional); every room of the house and every bedroom
// is drawn as a box on a floor: drag it to move it, drag its corner to resize it. A room on no floor shows a red "!".
import { notify, esc, toast, ROOT_ID } from '../core/store.js';
import { worldFile, bgOf, bgUrl, num } from '../core/world.js';
import { planSlots } from '../sim/plan.js';
import { uploadWorldPicture, imageRatio, newId } from '../sim/creator.js';
import { pickFile } from './cropper.js';
import { TIME_SLOTS } from '../sim/daynight.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';
import { CW, W, chk } from './creator.js';
import { mapEditorHtml } from './mapedit.js';
export const PE = { view: 'rooms', floor: '', sel: '' };
const planOf = (w) => (w.plan ??= { floors: [], rooms: [] });
const NOT_ON = 'Not on the floor plan: where this room is has not been set. Click it to put it on this floor.';
function planEditorHtml(w) {
    const plan = planOf(w);
    if (!plan.floors.length)
        return `<div class="mu-pe is-empty"><div class="mu-pe-intro"><h3>Floor plan</h3>
        <p class="mu-muted">Optional. With a floor plan, the house map in the game is a plan of the house: one per floor, each room where it really is. Without one, the game shows the pictures of the rooms (as now).</p>
        <button class="mu-primary" data-act="pe-floor-add">${icon('plus')}<span>Start the floor plan</span></button></div></div>`;
    const floor = plan.floors.find(f => f.id === PE.floor) ?? plan.floors[0];
    PE.floor = floor.id;
    const fi = plan.floors.indexOf(floor);
    const slots = planSlots(w);
    const where = (id) => plan.rooms.find(r => r.id === id && plan.floors.some(f => f.id === r.floor));
    const name = (id) => slots.find(s => s.id === id)?.name ?? id;
    const sel = plan.rooms.find(r => r.id === PE.sel);
    const list = (bed) => slots.filter(s => s.bedroom === bed).map(s => {
        const at = where(s.id);
        const f = at ? plan.floors.find(x => x.id === at.floor) : null;
        return `<button class="mu-pe-item ${PE.sel === s.id ? 'is-on' : ''} ${at ? '' : 'is-lost'}" data-act="pe-pick" data-id="${esc(s.id)}" title="${at ? `On ${esc(f.name)}` : NOT_ON}">
            ${at ? `<i class="mu-pe-dot"></i>` : '<b class="mu-plan-bang">!</b>'}<span data-notr>${esc(s.name)}</span>${at && f.id !== floor.id ? `<small data-notr>${esc(f.name)}</small>` : ''}</button>`;
    }).join('');
    const lost = slots.filter(s => !where(s.id)).length;
    const boxes = plan.rooms.filter(r => r.floor === floor.id).map(r => `<div class="mu-pe-room ${PE.sel === r.id ? 'is-sel' : ''} ${r.id.startsWith('spot:') ? 'is-bed' : ''}" data-pe-room="${esc(r.id)}" style="left:${num(r.x)}%;top:${num(r.y)}%;width:${num(r.w, 10)}%;height:${num(r.h, 10)}%">
        <b data-notr>${esc(name(r.id))}</b><i class="mu-pe-handle" data-pe-handle></i></div>`).join('');
    return `<div class="mu-pe">
        <div class="mu-pe-top">
            <nav class="mu-pe-floors">${plan.floors.map(f => `<button class="${f.id === floor.id ? 'is-on' : ''}" data-act="pe-floor" data-id="${esc(f.id)}" data-notr>${esc(f.name)}</button>`).join('')}<button class="mu-ghost" data-act="pe-floor-add" title="Add a floor">${icon('plus')}<span>Floor</span></button></nav>
            ${chk('Use the floors in the game', 'plan.on', 'With a picture of the plan, the house map is the plan, floor by floor. Without one, the room pictures are listed floor by floor. Off: the room pictures, as always.')}
        </div>
        <div class="mu-pe-main">
            <div class="mu-pe-stage"><div class="mu-pe-plan ${floor.image ? 'has-pic' : ''}" data-pe-plan style="${esc(`--r:${num(floor.ratio, 1.6)};${bgOf(w, floor.image)}`)}">${boxes}
                ${boxes ? '' : '<p class="mu-pe-hint">Click a room on the right to put it on this floor.</p>'}</div></div>
            <aside class="mu-pe-side">
                <section class="mu-pe-card"><h4>This floor</h4>
                    <label class="mu-field"><span>Name</span><input data-input="cw" data-path="plan.floors.${fi}.name" data-focus="pe-fname" value="${esc(floor.name)}"></label>
                    <div class="mu-row"><button class="mu-ghost" data-act="pe-floor-pic">${icon('image')}<span>${floor.image ? 'Change the plan picture' : 'Picture of the plan (optional)'}</span></button>${floor.image ? `<button class="mu-ghost mu-ibtn" data-act="pe-floor-pic-clear" title="No picture (a blueprint)">${icon('x')}</button>` : ''}</div>
                    ${floor.image ? `<details class="mu-me-times" ${Object.keys(floor.images ?? {}).length ? 'open' : ''}><summary>At other times of the day</summary>
                        ${TIME_SLOTS.map(per => {
        const b = floor.images?.[per.id] ? worldFile(w, floor.images[per.id]) : '';
        return `<div class="mu-me-time"><div class="mu-cw-cover is-mini" style="${esc(bgUrl(b))}">${b ? '' : '<span>usual</span>'}</div><b>${esc(per.name)}</b>
                            <button class="mu-ghost mu-ibtn" data-act="pe-floor-pic" data-period="${esc(per.id)}" title="Upload">${icon('upload')}</button>${b ? `<button class="mu-ghost mu-ibtn" data-act="pe-floor-pic-clear" data-period="${esc(per.id)}" title="Use the usual one">${icon('x')}</button>` : ''}</div>`;
    }).join('')}
                        <small class="mu-muted">The same plan by day, in the afternoon and at night (same size).</small></details>` : ''}
                    <div class="mu-row">${fi > 0 ? `<button class="mu-ghost mu-ibtn" data-act="pe-floor-move" data-d="-1" title="Move this floor down the list">${icon('back')}</button>` : ''}${fi < plan.floors.length - 1 ? `<button class="mu-ghost mu-ibtn" data-act="pe-floor-move" data-d="1" title="Move this floor up the list" style="transform:scaleX(-1)">${icon('back')}</button>` : ''}
                        <button class="mu-danger mu-right" data-act="pe-floor-del">${icon('trash')}<span>Remove floor</span></button></div></section>
                ${sel ? `<section class="mu-pe-card is-sel"><h4 data-notr>${esc(name(sel.id))}</h4>
                    <label class="mu-field"><span>Floor</span><select data-input="pe-room-floor">${plan.floors.map(f => `<option value="${esc(f.id)}" ${f.id === sel.floor ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
                    <small class="mu-muted">Drag the box to move it, its corner to resize it.</small>
                    <button class="mu-ghost" data-act="pe-room-off">${icon('x')}<span>Take it off the plan</span></button></section>` : ''}
                <section class="mu-pe-card"><h4>On the plan</h4>
                    <label class="mu-field"><span>Rooms light up with</span><input type="color" data-input="cw" data-path="plan.glow" value="${esc(plan.glow || '#ffa95c')}"></label>
                    ${chk('Room names on the plan', 'plan.labels', 'Off: a name shows when the mouse is over its room.', true)}
                    <small class="mu-muted">The boxes you draw here are the rooms: in the game, a room lights up when the mouse is over it, and a click goes there.</small></section>
                <section class="mu-pe-card"><h4>Rooms ${lost ? `<em class="mu-pe-lostn" title="Rooms not on the plan">${lost} <b class="mu-plan-bang">!</b></em>` : ''}</h4><div class="mu-pe-list">${list(false)}</div>
                    <h4>Bedrooms</h4><div class="mu-pe-list">${list(true) || '<small class="mu-muted">No bedrooms (Homes tab).</small>'}</div></section>
            </aside>
        </div></div>`;
}
// The Maps tab of a scenario: the rooms (as before) or the floor plan.
export function houseMapsHtml(w) {
    const seg = `<div class="mu-pe-seg"><button class="${PE.view === 'rooms' ? 'is-on' : ''}" data-act="pe-view" data-v="rooms">${icon('pin')}<span>Rooms</span></button><button class="${PE.view === 'plan' ? 'is-on' : ''}" data-act="pe-view" data-v="plan">${icon('home')}<span>Floor plan${w.plan?.on ? ' · on' : ''}</span></button></div>`;
    return `<div class="mu-pe-wrap">${seg}${PE.view === 'plan' ? planEditorHtml(w) : mapEditorHtml(w)}</div>`;
}
/* ---------- placing, moving and resizing the boxes ---------- */
const snap = (v) => Math.round(v * 2) / 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// A free spot on the floor for a new box (left to right, top to bottom).
function freeSpot(plan, floor) {
    const on = plan.rooms.filter(r => r.floor === floor);
    for (let y = 4; y <= 76; y += 24)
        for (let x = 3; x <= 75; x += 24) {
            if (!on.some(r => x < r.x + r.w && x + 22 > r.x && y < r.y + r.h && y + 20 > r.y))
                return { x, y };
        }
    return { x: 39, y: 40 };
}
let drag = null;
document.addEventListener('pointerdown', (e) => {
    const t = e.target;
    const box = t.closest?.(`#${ROOT_ID} [data-pe-room]`);
    if (!box || !CW.w)
        return;
    const planEl = box.closest('[data-pe-plan]');
    const r = CW.w.plan?.rooms.find(x => x.id === box.dataset.peRoom);
    if (!planEl || !r)
        return;
    drag = { id: r.id, el: box, plan: planEl, resize: !!t.closest('[data-pe-handle]'), sx: e.clientX, sy: e.clientY, r: { ...r }, moved: false };
    box.setPointerCapture?.(e.pointerId);
    e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
    if (!drag)
        return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3)
        return;
    drag.moved = true;
    const b = drag.plan.getBoundingClientRect();
    const dx = ((e.clientX - drag.sx) / b.width) * 100, dy = ((e.clientY - drag.sy) / b.height) * 100;
    const r = drag.r;
    if (drag.resize) {
        drag.el.style.width = `${clamp(snap(r.w + dx), 5, 100 - r.x)}%`;
        drag.el.style.height = `${clamp(snap(r.h + dy), 5, 100 - r.y)}%`;
    }
    else {
        drag.el.style.left = `${clamp(snap(r.x + dx), 0, 100 - r.w)}%`;
        drag.el.style.top = `${clamp(snap(r.y + dy), 0, 100 - r.h)}%`;
    }
});
document.addEventListener('pointerup', () => {
    if (!drag)
        return;
    const d = drag;
    drag = null;
    const r = CW.w?.plan?.rooms.find(x => x.id === d.id);
    if (!r)
        return;
    if (d.moved) {
        r.x = parseFloat(d.el.style.left);
        r.y = parseFloat(d.el.style.top);
        r.w = parseFloat(d.el.style.width);
        r.h = parseFloat(d.el.style.height);
        CW.dirty = true;
    }
    PE.sel = d.id;
    notify();
});
// Clicking the empty plan lets go of the box.
document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.matches?.(`#${ROOT_ID} [data-pe-plan]`) && PE.sel) {
        PE.sel = '';
        notify();
    }
});
Object.assign(ACT, {
    'pe-view': (el) => {
        PE.view = el.dataset.v === 'plan' ? 'plan' : 'rooms';
        notify();
    },
    'pe-floor': (el) => { PE.floor = el.dataset.id; notify(); },
    'pe-floor-add': () => {
        const plan = planOf(W());
        const f = { id: newId('floor'), name: `Floor ${plan.floors.length + 1}` };
        plan.floors.push(f);
        PE.floor = f.id;
        if (plan.floors.length === 1)
            plan.on = true;
        CW.dirty = true;
        notify();
    },
    'pe-floor-del': () => {
        const plan = planOf(W());
        const f = plan.floors.find(x => x.id === PE.floor);
        if (!f)
            return;
        const n = plan.rooms.filter(r => r.floor === f.id).length;
        if (n && !confirmTwice(`pe-del-${f.id}`, `${n} rooms are on ${f.name}. Click again to remove the floor (the rooms stay in the house, off the plan).`))
            return;
        plan.floors = plan.floors.filter(x => x.id !== f.id);
        plan.rooms = plan.rooms.filter(r => r.floor !== f.id);
        PE.floor = plan.floors[0]?.id ?? '';
        PE.sel = '';
        if (!plan.floors.length)
            plan.on = false;
        CW.dirty = true;
        notify();
    },
    'pe-floor-move': (el) => {
        const plan = planOf(W());
        const i = plan.floors.findIndex(x => x.id === PE.floor);
        const j = i + Number(el.dataset.d);
        if (i < 0 || j < 0 || j >= plan.floors.length)
            return;
        [plan.floors[i], plan.floors[j]] = [plan.floors[j], plan.floors[i]];
        CW.dirty = true;
        notify();
    },
    'pe-floor-pic': async (el) => {
        const plan = planOf(W());
        const f = plan.floors.find(x => x.id === PE.floor);
        if (!f)
            return;
        const file = await pickFile('image/*');
        if (!file)
            return;
        const per = el.dataset.period;
        try {
            if (per)
                (f.images ??= {})[per] = await uploadWorldPicture(W(), file, `plan-${f.id}-${per}`);
            else {
                f.image = await uploadWorldPicture(W(), file, `plan-${f.id}`);
                f.ratio = await imageRatio(f.image);
            }
            CW.dirty = true;
        }
        catch (e) {
            toast(String(e?.message ?? e), 'error');
        }
        notify();
    },
    'pe-floor-pic-clear': (el) => { const f = planOf(W()).floors.find(x => x.id === PE.floor); if (!f)
        return; const per = el.dataset.period; if (per) {
        if (f.images) {
            delete f.images[per];
            if (!Object.keys(f.images).length)
                delete f.images;
        }
    }
    else {
        delete f.image;
        delete f.ratio;
        delete f.images;
    } CW.dirty = true; notify(); },
    'pe-pick': (el) => {
        const plan = planOf(W());
        const id = el.dataset.id;
        const at = plan.rooms.find(r => r.id === id && plan.floors.some(f => f.id === r.floor));
        if (at) {
            PE.floor = at.floor;
            PE.sel = id;
            notify();
            return;
        }
        plan.rooms = plan.rooms.filter(r => r.id !== id);
        const bed = id.startsWith('spot:');
        plan.rooms.push({ id, floor: PE.floor, ...freeSpot(plan, PE.floor), w: bed ? 16 : 22, h: bed ? 18 : 20 });
        PE.sel = id;
        CW.dirty = true;
        notify();
    },
    'pe-room-off': () => { const plan = planOf(W()); plan.rooms = plan.rooms.filter(r => r.id !== PE.sel); PE.sel = ''; CW.dirty = true; notify(); },
});
Object.assign(INPUT, {
    'pe-room-floor': (el) => { const r = planOf(W()).rooms.find(x => x.id === PE.sel); if (!r)
        return; r.floor = el.value; PE.floor = el.value; CW.dirty = true; notify(); },
});
const asked = new Map();
function confirmTwice(key, msg) {
    const t = asked.get(key) ?? 0;
    if (Date.now() - t < 5000) {
        asked.delete(key);
        return true;
    }
    asked.set(key, Date.now());
    toast(msg, 'warn');
    return false;
}
