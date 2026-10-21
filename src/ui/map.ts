// The world map: full screen, zoom and drag, a pin for every place. Hovering a pin opens a small card next to it
// (what the place is, who is there; at your own place, what you can do). Clicking a pin goes there.
import { showTransition } from './lifeui.js';
import { lockedOut } from '../sim/bills.js';
import { afterAction, hasItem, doorAnswer } from '../sim/life.js';
import { startElevator } from './lifeui.js';
import { state, notify, esc, game, toast, saveGame, ROOT_ID, nowAbs, uiZoom } from '../core/store.js';
import { runPlans } from './plans.js';
import { maybeBump } from './bump.js';
import { rollAction, gradeName } from '../sim/dice.js';
import { setPrompt } from '../st/bridge.js';
import { beforeTravel, beforeSleep } from '../sim/plans.js';
import { getWorld, worldFile, type WorldDef } from '../core/world.js';
import type { Save } from '../core/store.js';
import { thumb } from '../st/bridge.js';
import { pins, placeOf, travelMinutes, playerHomeId } from '../sim/places.js';
import { presentAt } from '../sim/people.js';
import { writeDiary, diaryOn, markDayStart } from '../sim/diary.js';
import { openWork, diaryWaiting, diaryReady } from './relui.js';
import { askAboutPlans } from './appts.js';
import { doing, isDoing } from './doing.js';
import { stayOf } from './events.js';
import { actionSound, lifeSound } from './sfx.js';
import { refreshPrompt } from '../sim/prompt.js';
import { applyAction, canAfford, money, actionsHere, addStatus, tooTired } from '../sim/needs.js';
import { shiftsToPromote, isOpen, fits, hire } from '../sim/work.js';
import { advance, weekday } from '../sim/time.js';
import { syncScene } from '../sim/game.js';
import { endVisit } from '../sim/visits.js';
import { toolsHtml } from './tools.js';
import { ACT } from './reg.js';
import { featureOn } from '../sim/creator.js';
import { icon } from './icons.js';
import { allow, passOnce, walkOnsHere, PSUI } from './pstateui.js';

const KMAX = 5;
const ctxW = () => { const g = game()!; return { g, w: getWorld(g.world)! }; };
// The map on screen: the one you are on, unless you opened another (a link pin, or "up" to the bigger map).
let viewMap: string | null = null;
const youMap = (g: Save, w: WorldDef) => w.maps.find(m => m.id === placeOf(g, w, g.player.loc)?.map) ?? w.maps[0];
const curMap = (g: Save, w: WorldDef) => (viewMap && w.maps.find(m => m.id === viewMap)) || youMap(g, w);

function pinsHtml(g: Save, w: WorldDef) {
    const map = curMap(g, w);
    const sel = state.sel ?? g.player.loc;
    return pins(g, w).filter(p => p.map === map.id).map(p => {
        const here = presentAt(g, w, p.id);
        const known = here.filter(r => r.met), strangers = here.length - known.length + walkOnsHere(g, w, p.id).length;
        if (p.link) return `<button class="mu-pin is-link" data-act="pin" data-loc="${esc(p.id)}" style="left:${p.x}%;top:${p.y}%" aria-label="${esc(p.name)}"><span class="dot">${icon('map')}</span><span class="label">${esc(p.name)}</span></button>`;
        return `<button class="mu-pin ${p.home ? 'is-home' : ''} ${p.id === sel ? 'is-sel' : ''} ${p.id === g.player.loc ? 'is-you' : ''}" data-act="pin" data-loc="${esc(p.id)}" style="left:${p.x}%;top:${p.y}%" aria-label="${esc(p.name)}">
            <span class="dot"></span><span class="label">${esc(p.name)}</span>
            ${here.length || strangers ? `<span class="faces">${known.slice(0, 3).map(r => `<img draggable="false" src="${esc(thumb(r.avatar))}" alt="" title="${esc(r.name)}">`).join('')}${strangers || known.length > 3 ? `<i>+${strangers + Math.max(0, known.length - 3)}</i>` : ''}</span>` : ''}
        </button>`;
    }).join('');
}

// Jobs at this place: work a shift at yours, or apply for one.
function jobCard(g: Save, w: WorldDef, sel: string, you: boolean) {
    if (!featureOn(w, 'jobs')) return '';
    const jobs = w.occupations.filter(o => o.place === sel);
    if (!jobs.length) return '';
    const mine = g.player.job && jobs.find(o => o.id === g.player.job!.id);
    if (mine) {
        const j = g.player.job!; const need = shiftsToPromote(g, mine, j.rank);
        const open = isOpen(g, mine);
        return `<div class="mu-card"><h4>Work</h4><p><b>${esc(mine.ranks[j.rank].name)}</b> · ${esc(mine.name)}</p>
            <small class="mu-muted">${money(w, mine.ranks[j.rank].pay)}/h${need !== null ? ` · ${Math.min(99, Math.floor(j.shifts / need * 100))}% to the next rank` : ''}</small>
            ${you ? `<button class="mu-primary" data-act="work" ${open ? '' : 'aria-disabled="true"'}>Work a shift · ${mine.shift} h</button>${open ? '' : `<small class="mu-muted">Open ${String(mine.hours?.[0] ?? 0).padStart(2, '0')}:00–${String(mine.hours?.[1] ?? 24).padStart(2, '0')}:00</small>`}` : ''}</div>`;
    }
    return `<div class="mu-card"><h4>Jobs here</h4>${jobs.map(o => `<div class="mu-jobrow"><span><b>${esc(o.name)}</b><small>${money(w, o.ranks[0].pay)}/h · ${o.shift} h${o.needs?.length ? ` · ${esc(o.needs.join(' / '))}` : ''}</small></span>
        ${you ? `<button data-act="apply" data-id="${esc(o.id)}" ${fits(g, o) ? '' : 'aria-disabled="true"'}>Apply</button>` : ''}</div>`).join('')}
        ${you ? '' : '<small class="mu-muted">Go there to apply, or use the phone.</small>'}</div>`;
}

// The card that opens next to a pin.
function popHtml(g: Save, w: WorldDef, loc: string, touch: boolean) {
    const p = placeOf(g, w, loc);
    if (!p) return '';
    if (p.link) {
        const m = w.maps.find(x => x.id === p.link);
        return `<h3>${esc(p.name)}</h3><small class="mu-muted">${esc(m?.name ?? '')} · click to open the map</small>${touch ? `<button class="mu-primary" data-act="open-map" data-map="${esc(p.link)}">Open the map</button>` : ''}`;
    }
    const you = loc === g.player.loc;
    const here = presentAt(g, w, loc);
    const extras = walkOnsHere(g, w, loc);   // people the story brought in (not in the cast)
    const count = here.length + extras.length;
    const people = count ? `<div class="mu-pop-people${count > 6 ? ' is-many' : ''}">${here.map(r => `<span class="mu-pop-person"><img src="${esc(thumb(r.avatar))}" alt=""><b>${esc(r.met ? r.name : 'Someone')}</b></span>`).join('')}${extras.map(n => `<span class="mu-pop-person is-walkon"><i class="mh-walkon-pic">${icon('user')}</i><b data-notr>${esc(n)}</b></span>`).join('')}</div>`
        : '<small class="mu-muted">Nobody here right now.</small>';
    const mins = you ? 0 : travelMinutes(g, w, g.player.loc, loc);
    // the way in is always on the card, at the bottom: a busy place's card can cover its own pin
    const one = count === 1 ? (here[0] ? (here[0].met ? here[0].name.split(' ')[0] : '') : extras[0]) : '';
    const go = you ? 'Enter the scene' : count ? `Join ${one || 'them'}` : 'Go here';
    return `<div class="mu-pop-body"><h3>${esc(p.name)}</h3>
        ${p.desc ? `<p>${esc(p.desc)}</p>` : ''}${p.event ? `<p class="mu-muted">${esc(p.event)}</p>` : ''}
        ${count > 1 ? `<small class="mu-muted mu-pop-count">${count} people here</small>` : ''}
        ${people}
        ${you ? '' : jobCard(g, w, loc, false)}</div>
        <div class="mu-pop-go">
            ${you ? `<span class="mu-badge">You are here</span>` : `<small class="mu-muted">${mins} min away</small>`}
            <button class="mu-primary" data-act="go" data-loc="${esc(loc)}" data-sfx="open">${go}</button>
        </div>`;
}

// Shows the card above the pin (or below, when there is no room), kept inside the screen.
let popFor = '', hideTimer = 0;
function showPop(pin: HTMLElement, touch: boolean) {
    const mapEl = pin.closest<HTMLElement>('.mu-map'); const g = game(); const w = g && getWorld(g.world);
    if (!mapEl || !g || !w) return;
    clearTimeout(hideTimer);
    let pop = mapEl.querySelector<HTMLElement>('.mu-pop');
    if (!pop) { pop = document.createElement('div'); pop.className = 'mu-pop'; pop.setAttribute('role', 'dialog'); mapEl.appendChild(pop); }
    const loc = pin.dataset.loc!;
    popFor = loc;
    pop.innerHTML = popHtml(g, w, loc, touch);
    pop.classList.toggle('is-here', loc === g.player.loc);
    const zz = uiZoom(), b0 = mapEl.getBoundingClientRect(), r = pin.querySelector('.dot')!.getBoundingClientRect(), whole = pin.getBoundingClientRect();
    const box = { width: b0.width / zz, height: b0.height / zz };
    const cx = (r.left + r.width / 2 - b0.left) / zz, top = (r.top - b0.top) / zz, bottom = (whole.bottom - b0.top) / zz;   // below: under the label
    pop.style.visibility = 'hidden'; pop.style.left = '0'; pop.style.top = '0';
    pop.classList.add('is-open');
    const pw = pop.offsetWidth, gap = 14;
    // the top panels (you, the clock, the menu) stay above the card: it starts under whichever it would run into
    const hud = [...(mapEl.closest(`#${ROOT_ID}`) ?? document).querySelectorAll<HTMLElement>('.mh-persona, .mh-clock, .mh-where, .mh-corner, .mu-mapnav')]
        .filter(el => el.offsetParent).map(el => el.getBoundingClientRect())
        .map(rc => ({ l: (rc.left - b0.left) / zz, r: (rc.right - b0.left) / zz, b: (rc.bottom - b0.top) / zz }));
    const topFor = (x: number) => Math.max(8, ...hud.filter(h => h.b < box.height / 2 && h.l < x + pw && h.r > x).map(h => h.b + 8));
    const bottomEdge = box.height - 8;
    // a card taller than the room there scrolls inside (its way in stays at the bottom)
    const fit = (x: number) => { const t = topFor(x); pop!.style.maxHeight = `${Math.min(520, Math.max(160, bottomEdge - t))}px`; return { t, ph: pop!.offsetHeight }; };
    let x = Math.max(8, Math.min(box.width - pw - 8, cx - pw / 2));
    let { t, ph } = fit(x);
    const above = top - gap - ph >= t;
    const below = bottom + gap + ph <= bottomEdge;
    let y: number;
    if (above || below) y = above ? top - gap - ph : bottom + gap;
    else {
        // a tall card (a busy place) fits neither above nor below: beside the pin, so the pin stays clickable
        const left = (whole.left - b0.left) / zz, right = (whole.right - b0.left) / zz, mid = (top + bottom) / 2;
        x = right + gap + pw <= box.width - 8 ? right + gap : Math.max(8, left - gap - pw);
        ({ t, ph } = fit(x));
        y = Math.max(t, Math.min(bottomEdge - ph, mid - ph / 2));
    }
    pop.style.left = `${x}px`; pop.style.top = `${Math.max(t, Math.min(y, bottomEdge - ph))}px`;
    pop.classList.toggle('is-below', !above && below);
    pop.style.visibility = '';
}
function hidePop(delay = 160) {
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => { document.getElementById(ROOT_ID)?.querySelector('.mu-pop')?.classList.remove('is-open'); popFor = ''; }, delay);
}

export function mapHtml() {
    const { g, w } = ctxW();
    const map = curMap(g, w);
    const parent = map.parent ? w.maps.find(m => m.id === map.parent) : null;
    const away = map.id !== youMap(g, w).id;
    const nav = parent || away ? `<div class="mu-mapnav">${parent ? `<button data-act="open-map" data-map="${esc(parent.id)}">${icon('up')}<span>${esc(parent.name)}</span></button>` : ''}
        ${away ? `<button data-act="open-map" data-map="">${icon('pin')}<span>Back to where you are</span></button>` : ''}<b data-notr>${esc(map.name)}</b></div>` : '';
    return `<div class="mu-map">${nav}
        <div class="mu-stage" data-stage>
            <div class="mu-mapimg" style="--r:${map.ratio};background-image:url('${esc(worldFile(w, map.image))}')">${pinsHtml(g, w)}</div>
            <div class="mu-zoom">
                <button data-act="zoom" data-d="in" title="Zoom in">+</button>
                <button data-act="zoom" data-d="out" title="Zoom out">−</button>
                <button data-act="zoom-fit" title="Fit">⌖</button>
            </div>
        </div>
        ${toolsHtml()}
    </div>`;
}

/* ---------- zoom and drag ---------- */

const els = () => {
    const stage = document.getElementById(ROOT_ID)?.querySelector<HTMLElement>('[data-stage]');
    const map = stage?.querySelector<HTMLElement>('.mu-mapimg');
    return stage && map ? { stage, map } : null;
};
type V = { z: number; x: number; y: number; k?: number };

function clampView(v: V, stage: HTMLElement, map: HTMLElement) {
    const sw = stage.clientWidth, sh = stage.clientHeight, W0 = map.offsetWidth, H0 = map.offsetHeight;
    const kmin = Math.max(1, sw / W0, sh / H0);
    const k = Math.max(kmin, Math.min(kmin * KMAX, v.k || 0));
    const mx = Math.max(0, (W0 * k - sw) / 2), my = Math.max(0, (H0 * k - sh) / 2);
    return { z: 1, k, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
}

let focusNext: string | null = null;
export function applyMapView(reset = false) {
    const e = els();
    if (!e) return;
    const cur = state.mapView as V;
    let v = clampView(reset || !cur.k ? { z: 1, k: 0, x: 0, y: 0 } : cur, e.stage, e.map);
    const target = focusNext ?? (reset || !cur.k ? game()?.player.loc ?? null : null);
    focusNext = null;
    if (target) {   // brings the pin into the free area left of the side card
        const pin = e.map.querySelector<HTMLElement>(`.mu-pin[data-loc="${CSS.escape(target)}"]`);
        if (pin) {
            const px = parseFloat(pin.style.left) / 100, py = parseFloat(pin.style.top) / 100;
            const sh = e.stage.clientHeight, card = 0;
            v = clampView({ ...v, x: -card / 2 - (px - 0.5) * e.map.offsetWidth * v.k!, y: -(py - 0.5) * e.map.offsetHeight * v.k! + sh * 0 }, e.stage, e.map);
        }
    }
    state.mapView = v;
    e.map.style.setProperty('--ik', String(1 / v.k!));
    e.map.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
    // smooth while it moves; once it stops, the browser draws the map again at the new size (sharp, not a stretched copy)
    e.map.style.willChange = 'transform';
    clearTimeout(sharpTimer);
    sharpTimer = setTimeout(() => { const m = els()?.map; if (m) m.style.willChange = 'auto'; }, 180);
}
let sharpTimer: any = null;

function zoomBy(f: number, cx = 0, cy = 0) {
    const e = els(); const v = state.mapView as V;
    if (!e || !v.k) return applyMapView();
    const k2 = clampView({ z: 1, k: v.k * f, x: 0, y: 0 }, e.stage, e.map).k;
    const r = k2 / v.k;
    state.mapView = { z: 1, k: k2, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r } as any;
    applyMapView();
}

let pan: any = null, moved = false;
const pts = new Map<number, { x: number; y: number }>();
let pinch: any = null;

export const mapInput = {
    click(_e: Event) { return false; },
    attach(r: HTMLElement) {
        r.addEventListener('wheel', (e) => {
            const stage = (e.target as HTMLElement).closest?.('[data-stage]');
            if (!stage) return;
            e.preventDefault();
            const rc = stage.getBoundingClientRect();
            const zz = uiZoom(); zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, (e.clientX - rc.left - rc.width / 2) / zz, (e.clientY - rc.top - rc.height / 2) / zz);
        }, { passive: false });
        r.addEventListener('pointerdown', (e) => {
            const stage = (e.target as HTMLElement).closest?.<HTMLElement>('[data-stage]');
            if (!stage || (e.target as HTMLElement).closest('.mu-zoom')) return;
            moved = false;
            pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const v = state.mapView as V;
            if (!v.k) return;
            if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: v.k }; pan = null; return; }
            pan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, stage };
        });
        r.addEventListener('pointermove', (e) => {
            if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pinch && pts.size === 2) {
                const [a, b] = [...pts.values()];
                state.mapView = { ...(state.mapView as V), k: pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / (pinch.d || 1) } as any;
                moved = true; applyMapView(); return;
            }
            if (!pan || e.pointerId !== pan.id) return;
            const zz = uiZoom(), dx = (e.clientX - pan.sx) / zz, dy = (e.clientY - pan.sy) / zz;
            if (!moved && Math.hypot(dx, dy) < 5) return;
            if (!moved) { moved = true; pan.stage.setPointerCapture?.(e.pointerId); pan.stage.classList.add('is-panning'); }
            state.mapView = { z: 1, k: (state.mapView as V).k, x: pan.vx + dx, y: pan.vy + dy } as any;
            applyMapView();
        });
        const end = (e: PointerEvent) => {
            pts.delete(e.pointerId);
            if (pts.size < 2) pinch = null;
            if (pan && e.pointerId === pan.id) { pan.stage.classList.remove('is-panning'); pan = null; }
        };
        r.addEventListener('pointerup', end);
        r.addEventListener('pointercancel', end);
        window.addEventListener('resize', () => applyMapView());
        // hover a pin: its card opens next to it; leaving pin and card closes it
        r.addEventListener('pointerover', (e) => {
            if ((e as PointerEvent).pointerType === 'touch' || pan) return;
            const t = e.target as HTMLElement;
            if (t.closest?.('.mu-pop')) { clearTimeout(hideTimer); return; }
            const pin = t.closest?.<HTMLElement>('.mu-pin');
            if (pin && pin.dataset.loc !== popFor) showPop(pin, false);
            else if (pin) clearTimeout(hideTimer);
        });
        r.addEventListener('pointerout', (e) => {
            if ((e as PointerEvent).pointerType === 'touch') return;
            const from = (e.target as HTMLElement).closest?.('.mu-pin, .mu-pop');
            const to = (e.relatedTarget as HTMLElement | null)?.closest?.('.mu-pin, .mu-pop');
            if (from && !to) hidePop();
        });
    },
};

/* ---------- actions ---------- */

// Moves the player: time passes, the scene follows (who is there now), and the screen goes to the scene.
// `force`: the engine moves you (you already walked out, or got away): no questions asked.
export async function travelTo(loc: string, opts: { force?: boolean } = {}): Promise<boolean> {
    const { g, w } = ctxW();
    if (loc === g.player.loc) return false;
    if (state.generating) { toast('Wait until they finish speaking.', 'info'); return false; }   // nobody walks out mid-sentence
    // player state: in a conversation you walk out (it costs), held or restrained you have to get away first
    if (!opts.force && !allow('travel', () => { void travelTo(loc, { force: true }).then(() => { state.view = 'scene'; notify(); }); }, loc)) { notify(); return false; }
    PSUI.gotAwayTo = '';
    const mins = travelMinutes(g, w, g.player.loc, loc);
    await endVisit(g, w);   // the scene you leave closes; the next one starts clean
    beforeTravel(g, w, loc).forEach(m => toast(m, 'info'));
    const from = g.player.loc;
    const msgs = advance(g, w, mins);
    if (g.player.loc === from) g.player.loc = loc;   // unless something on the way moved you (passing out…)
    viewMap = null;
    msgs.forEach(m => toast(m, 'warn'));
    runPlans();
    state.sel = null;
    saveGame();
    // hostile actions: free of a captor once you leave their place; your captives come along; the law may find you
    const hx = await import('../sim/hostile.js');
    hx.releaseCaptor(g); hx.onArrive(g, w);
    await syncScene();
    state.view = 'scene';   // arriving somewhere opens its scene (with its things to do), even when nobody is there
    startElevator(g, w, g.player.loc);
    notify();
    return true;
}

// Goes to a place and straight into its scene.
async function goTo(loc: string) {
    const { g, w } = ctxW();
    popFor = '';
    const door = doorAnswer(g, w, loc);
    if (!door.ok) { toast(door.text, 'info'); notify(); return; }
    if (door.text) toast(door.text, 'info');
    if (loc !== g.player.loc && !(await travelTo(loc))) { notify(); return; }
    state.view = 'scene';
    notify();
}

async function sleep() {
    const { g, w } = ctxW();
    const stay = stayOf(g); const away = !!stay && stay.where === g.player.loc && g.player.loc !== playerHomeId;
    if (w.sleep.homeOnly && g.player.loc !== playerHomeId && !away) { toast('You can only sleep at home.', 'info'); return; }
    if (g.player.loc === playerHomeId && !away && lockedOut(g)) { toast('You are locked out: pay the rent in the Homes app first.', 'warn'); return; }
    const until = w.sleep.until;
    const mins = g.minutes < until ? until - g.minutes : 1440 - g.minutes + until;
    const dayEnded = g.day;
    await endVisit(g, w);
    beforeSleep(g).forEach(m => toast(m, 'info'));
    g.asleep = true;
    const msgs = advance(g, w, mins);
    g.asleep = false;
    for (const [id, v] of Object.entries(w.sleep.restore)) {
        const d = w.statuses.find(s => s.id === id);
        if (!d) continue;
        g.player.stats[id] = Math.min(d.max, (id === 'energy' ? v : (g.player.stats[id] ?? d.start) + v));
        if (d.decay?.awakeOnly) g.tick[`decay:${id}`] = nowAbs(g);   // the waking day starts counting now
    }
    // a night's sleep leaves you hungry, thirsty and in need of a wash; a good bed lifts the mood
    for (const [id, v] of Object.entries({ hunger: -20, thirst: -25, hygiene: -25 })) addStatus(g, w, id, v);
    if (hasItem(g, 'bed')) addStatus(g, w, 'mood', 10);
    msgs.forEach(m => toast(m, 'warn'));
    runPlans();
    saveGame();
    await syncScene();
    lifeSound('sleep');
    showTransition(`Day ${g.day}`, weekday(g.day), 'night');
    notify();
    // the day becomes a diary entry (one AI call), while the night passes on screen
    if (diaryOn()) {
        setTimeout(() => diaryWaiting(dayEnded), 2600);   // after the night: "writing your diary…" until it is done
        writeDiary(g, w, dayEnded)
            .then(res => { markDayStart(g); saveGame(); refreshPrompt(); if (res.ok) toast(`Diary updated — day ${dayEnded}. Read it in the Journal.`, 'success'); diaryReady(dayEnded, res.changes, res.ok); })
            .catch((e: any) => { diaryReady(dayEnded, [], false); toast(`The diary could not be written (${String(e?.message ?? e)}). The facts of the day are still in the Journal.`, 'warn'); });
    } else markDayStart(g);
}

// After a shift: time has passed; a short transition shows how it went.
export async function finishWork(msgs: string[], jobName: string) {
    msgs.forEach((m, i) => toast(m, i ? 'success' : 'info'));
    runPlans();
    saveGame(); await syncScene();
    lifeSound('work');
    showTransition(jobName, msgs[0] ?? 'Shift done', 'work');
    notify();
}

Object.assign(ACT, {
    work: async () => {
        if (!allow('work', () => { passOnce(); void ACT.work(document.body, new Event('click')); })) return;
        const { g, w } = ctxW();
        const job = g.player.job && w.occupations.find(o => o.id === g.player.job!.id);
        if (!job || !isOpen(g, job)) { toast('The place is closed now.', 'info'); return; }
        const tired = tooTired(g, w, job.cost ?? {}, 'work a shift'); if (tired) { toast(tired, 'warn'); return; }
        if (askAboutPlans(g, job.shift * 60, 'work')) return;   // a plan during the shift: ask first
        openWork();   // the work screen: how you spend the shift (like The Sims)
    },
    apply: (el) => {
        const { g, w } = ctxW();
        if (g.player.job && !el.dataset.force) { toast('You already have a job. Quit it first in the phone.', 'info'); return; }
        const r = hire(g, w, el.dataset.id!);
        toast(r.text, r.ok ? 'success' : 'warn'); saveGame(); notify();
    },
    // a click goes to the place (on a touch screen the first tap shows its card, with a "Go here" button)
    'open-map': (el) => { viewMap = el.dataset.map || null; popFor = ''; state.mapView = {} as any; notify(); setTimeout(() => applyMapView(true), 0); },
    pin: (el, e) => {
        if (moved) return;
        const { g, w } = ctxW();
        const link = placeOf(g, w, el.dataset.loc!)?.link;
        if (link) { viewMap = link; popFor = ''; state.mapView = {} as any; notify(); setTimeout(() => applyMapView(true), 0); return; }
        if ((e as PointerEvent).pointerType === 'touch' && popFor !== el.dataset.loc) { showPop(el, true); return; }
        return goTo(el.dataset.loc!);
    },
    go: (el) => goTo(el.dataset.loc!),
    travel: (el) => goTo(el.dataset.loc!),
    sleep: () => {
        if (!allow('sleep', () => { passOnce(); void ACT.sleep(document.body, new Event('click')); })) return;
        const { g, w } = ctxW();
        const until = w.sleep.until;
        const mins = g.minutes < until ? until - g.minutes : 1440 - g.minutes + until;
        if (askAboutPlans(g, mins, 'sleep')) return;
        return sleep();
    },
    do: async (el) => {
        const { g, w } = ctxW();
        const a = actionsHere(g, w).find(x => x.id === el.dataset.id);
        if (!a) return;
        if (!allow('do', () => undefined)) return;
        if (!canAfford(g, a)) { toast('Not enough money.', 'info'); return; }
        const tired = tooTired(g, w, Object.fromEntries(Object.entries(a.effects ?? {}).map(([k, v]) => [k, -v])), a.label.toLowerCase()); if (tired) { toast(tired, 'warn'); return; }
        if (isDoing()) return;
        actionSound(a.effects, a.id);
        await doing(a.label, a.icon ?? '⏳', a.minutes);   // a moment on screen while the time passes
        applyAction(g, w, a);
        advance(g, w, a.minutes).forEach(m => toast(m, 'warn'));
        const roll = rollAction(g, w, a);
        afterAction(g, w, a, roll ? roll.grade.includes('success') : null).forEach(m => toast(m, 'success'));
        runPlans();
        saveGame();
        await syncScene();
        if (roll) {
            toast(`${gradeName(roll.grade)} — ${roll.text}`, roll.grade.includes('success') ? 'success' : 'warn');
            // the AI only tells the story of the result the engine decided
            if (state.view === 'scene') setPrompt('mundi_roll', `[Just now {{user}} tried to ${a.label.toLowerCase()}: ${gradeName(roll.grade).toLowerCase()}. ${roll.text} Narrate it in that light if it comes up.]`);
        } else toast(`${a.name}: done.`, 'success');
        maybeBump(g, w);
        notify();
    },
    zoom: (el) => zoomBy(el.dataset.d === 'in' ? 1.3 : 1 / 1.3),
    'zoom-fit': () => applyMapView(true),
});
