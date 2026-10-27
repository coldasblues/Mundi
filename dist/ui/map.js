// The world map: full screen, zoom and drag, a pin for every place. Hovering a pin opens a small card next to it
// (what the place is, who is there; at your own place, what you can do). Clicking a pin goes there.
import { lex, appRef } from '../core/lexicon.js';
import { showTransition } from './lifeui.js';
import { lockedOut } from '../sim/bills.js';
import { afterAction, doorAnswer, sleepMood } from '../sim/life.js';
import { hobbyNeed, practice } from '../sim/hobbies.js';
import { afterEvent } from '../sim/cityevents.js';
import { state, notify, esc, game, toast, saveGame, ROOT_ID, nowAbs, uiZoom } from '../core/store.js';
import { runPlans } from './plans.js';
import { maybeBump } from './bump.js';
import { rollAction, gradeName } from '../sim/dice.js';
import { setPrompt } from '../st/bridge.js';
import { beforeTravel, beforeSleep } from '../sim/plans.js';
import { getWorld, worldFile, bgOf, num, systemOn, isScenario } from '../core/world.js';
import { openNow, pictureAt } from '../sim/daynight.js';
import { isRpg, longRest } from '../sim/rpg.js';
import { journeyOf, travelRoad } from '../sim/journey.js';
import { thumb } from '../st/bridge.js';
import { pins, placeOf, travelMinutes, playerHomeId, isOuting, outingName } from '../sim/places.js';
import { planOn, floorsOn, planTarget, unplaced, floorOf } from '../sim/plan.js';
import { presentAt, whereNow } from '../sim/people.js';
import { writeDiary, diaryOn, markDayStart } from '../sim/diary.js';
import { openWork, diaryWaiting, diaryReady } from './relui.js';
import { askAboutPlans } from './appts.js';
import { doing, isDoing } from './doing.js';
import { stayOf } from './events.js';
import { actionSound, lifeSound } from './sfx.js';
import { refreshPrompt } from '../sim/prompt.js';
import { applyAction, canAfford, money, actionsHere, addStatus, tooTired } from '../sim/needs.js';
import { shiftsToPromote, isOpen, fits, hire, rankOf, pendingBranch } from '../sim/work.js';
import { advance, weekday } from '../sim/time.js';
import { syncScene } from '../sim/game.js';
import { endVisit } from '../sim/visits.js';
import { toolsHtml } from './tools.js';
import { ACT } from './reg.js';
import { featureOn } from '../sim/creator.js';
import { icon } from './icons.js';
import { allow, passOnce, walkOnsHere, PSUI } from './pstateui.js';
const KMAX = 5;
const ctxW = () => { const g = game(); return { g, w: getWorld(g.world) }; };
// The map on screen: the one you are on, unless you opened another (a link pin, or "up" to the bigger map).
let viewMap = null;
const youMap = (g, w) => w.maps.find(m => m.id === placeOf(g, w, g.player.loc)?.map) ?? w.maps[0];
const curMap = (g, w) => (viewMap && w.maps.find(m => m.id === viewMap)) || youMap(g, w);
function pinsHtml(g, w) {
    const map = curMap(g, w);
    const sel = state.sel ?? g.player.loc;
    return pins(g, w).filter(p => p.map === map.id).map(p => {
        const here = presentAt(g, w, p.id);
        const known = here.filter(r => r.met), strangers = here.length - known.length + walkOnsHere(g, w, p.id).length;
        if (p.link)
            return `<button class="mu-pin is-link" data-act="pin" data-loc="${esc(p.id)}" style="left:${num(p.x)}%;top:${num(p.y)}%" aria-label="${esc(p.name)}"><span class="dot">${icon('map')}</span><span class="label">${esc(p.name)}</span></button>`;
        const shut = !p.home && systemOn(w, 'living') && !openNow(g, w, p.id);
        return `<button class="mu-pin ${p.home ? 'is-home' : ''} ${shut ? 'is-closed' : ''} ${p.id === sel ? 'is-sel' : ''} ${p.id === g.player.loc ? 'is-you' : ''}" data-act="pin" data-loc="${esc(p.id)}" style="left:${num(p.x)}%;top:${num(p.y)}%" aria-label="${esc(p.name)}">
            <span class="dot"></span><span class="label">${esc(p.name)}</span>
            ${here.length || strangers ? `<span class="faces">${known.slice(0, 3).map(r => `<img draggable="false" src="${esc(thumb(r.avatar))}" alt="" title="${esc(r.name)}">`).join('')}${strangers || known.length > 3 ? `<i>+${strangers + Math.max(0, known.length - 3)}</i>` : ''}</span>` : ''}
        </button>`;
    }).join('');
}
// Jobs at this place: work a shift at yours, or apply for one.
function jobCard(g, w, sel, you) {
    if (!featureOn(w, 'jobs'))
        return '';
    const jobs = w.occupations.filter(o => o.place === sel);
    if (!jobs.length)
        return '';
    const mine = g.player.job && jobs.find(o => o.id === g.player.job.id);
    if (mine) {
        const j = g.player.job;
        const need = shiftsToPromote(g, mine, j.rank);
        const open = isOpen(g, mine);
        return `<div class="mu-card"><h4>Work</h4><p><b>${esc(rankOf(g, mine).name)}</b> · ${esc(mine.name)}</p>
            <small class="mu-muted">${money(w, rankOf(g, mine).pay)}/h${pendingBranch(g, mine) ? ` · ${esc(lex(w, 'choosePathTitle'))}` : ''}${need !== null ? ` · ${Math.min(99, Math.floor(j.shifts / need * 100))}% to the next rank` : ''}</small>
            ${you ? `<button class="mu-primary" data-act="work" ${open ? '' : 'aria-disabled="true"'}>Work a shift · ${mine.shift} h</button>${open ? '' : `<small class="mu-muted">Open ${String(mine.hours?.[0] ?? 0).padStart(2, '0')}:00–${String(mine.hours?.[1] ?? 24).padStart(2, '0')}:00</small>`}` : ''}</div>`;
    }
    return `<div class="mu-card"><h4>${lex(w, 'jobsHere')}</h4>${jobs.map(o => `<div class="mu-jobrow"><span><b>${esc(o.name)}</b><small>${money(w, o.ranks[0].pay)}/h · ${o.shift} h${o.needs?.length ? ` · ${esc(o.needs.join(' / '))}` : ''}${hobbyNeed(g, w, o) ? ` · ${esc(hobbyNeed(g, w, o))}` : ''}</small></span>
        ${you ? `<button data-act="apply" data-id="${esc(o.id)}" ${fits(g, o) ? '' : 'aria-disabled="true"'}>${lex(w, 'jobApply')}</button>` : ''}</div>`).join('')}
        ${you ? '' : `<small class="mu-muted">${lex(w, 'applyThere')}</small>`}</div>`;
}
// The card that opens next to a pin.
function popHtml(g, w, loc, touch) {
    const p = placeOf(g, w, loc);
    if (!p)
        return '';
    if (p.link) {
        const m = w.maps.find(x => x.id === p.link);
        return `<h3>${esc(p.name)}</h3><small class="mu-muted">${esc(m?.name ?? '')} · click to open the map</small>${touch ? `<button class="mu-primary" data-act="open-map" data-map="${esc(p.link)}">Open the map</button>` : ''}`;
    }
    const you = loc === g.player.loc;
    const here = presentAt(g, w, loc);
    const extras = walkOnsHere(g, w, loc); // people the story brought in (not in the cast)
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
function showPop(pin, touch) {
    const mapEl = pin.closest('.mu-map');
    const g = game();
    const w = g && getWorld(g.world);
    if (!mapEl || !g || !w)
        return;
    clearTimeout(hideTimer);
    let pop = mapEl.querySelector('.mu-pop');
    if (!pop) {
        pop = document.createElement('div');
        pop.className = 'mu-pop';
        pop.setAttribute('role', 'dialog');
        mapEl.appendChild(pop);
    }
    const loc = pin.dataset.loc;
    popFor = loc;
    pop.innerHTML = popHtml(g, w, loc, touch);
    pop.classList.toggle('is-here', loc === g.player.loc);
    const zz = uiZoom(), b0 = mapEl.getBoundingClientRect(), r = pin.querySelector('.dot').getBoundingClientRect(), whole = pin.getBoundingClientRect();
    const box = { width: b0.width / zz, height: b0.height / zz };
    const cx = (r.left + r.width / 2 - b0.left) / zz, top = (r.top - b0.top) / zz, bottom = (whole.bottom - b0.top) / zz; // below: under the label
    pop.style.visibility = 'hidden';
    pop.style.left = '0';
    pop.style.top = '0';
    pop.classList.add('is-open');
    const pw = pop.offsetWidth, gap = 14;
    // the top panels (you, the clock, the menu) stay above the card: it starts under whichever it would run into
    const hud = [...(mapEl.closest(`#${ROOT_ID}`) ?? document).querySelectorAll('.mh-persona, .mh-clock, .mh-where, .mh-corner, .mu-mapnav')]
        .filter(el => el.offsetParent).map(el => el.getBoundingClientRect())
        .map(rc => ({ l: (rc.left - b0.left) / zz, r: (rc.right - b0.left) / zz, b: (rc.bottom - b0.top) / zz }));
    const topFor = (x) => Math.max(8, ...hud.filter(h => h.b < box.height / 2 && h.l < x + pw && h.r > x).map(h => h.b + 8));
    const bottomEdge = box.height - 8;
    // a card taller than the room there scrolls inside (its way in stays at the bottom)
    const fit = (x) => { const t = topFor(x); pop.style.maxHeight = `${Math.min(520, Math.max(160, bottomEdge - t))}px`; return { t, ph: pop.offsetHeight }; };
    let x = Math.max(8, Math.min(box.width - pw - 8, cx - pw / 2));
    let { t, ph } = fit(x);
    const above = top - gap - ph >= t;
    const below = bottom + gap + ph <= bottomEdge;
    let y;
    if (above || below)
        y = above ? top - gap - ph : bottom + gap;
    else {
        // a tall card (a busy place) fits neither above nor below: beside the pin, so the pin stays clickable
        const left = (whole.left - b0.left) / zz, right = (whole.right - b0.left) / zz, mid = (top + bottom) / 2;
        x = right + gap + pw <= box.width - 8 ? right + gap : Math.max(8, left - gap - pw);
        ({ t, ph } = fit(x));
        y = Math.max(t, Math.min(bottomEdge - ph, mid - ph / 2));
    }
    pop.style.left = `${x}px`;
    pop.style.top = `${Math.max(t, Math.min(y, bottomEdge - ph))}px`;
    pop.classList.toggle('is-below', !above && below);
    pop.classList.toggle('is-side', !above && !below);
    pop.style.setProperty('--ax', `${Math.max(16, Math.min(pw - 16, cx - x))}px`);
    // a card shown on hover has nothing to click: it never takes the click meant for the pin under it
    pop.style.pointerEvents = touch || loc === g.player.loc ? '' : 'none';
    pop.style.visibility = '';
}
function hidePop(delay = 160) {
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => { document.getElementById(ROOT_ID)?.querySelector('.mu-pop')?.classList.remove('is-open'); popFor = ''; }, delay);
}
// Who you know is on a map right now (their faces under its name).
function knownHtml(g, w, mapId) {
    const list = Object.values(g.cast).filter(r => r.met && placeOf(g, w, whereNow(g, w, r))?.map === mapId);
    if (!list.length)
        return '';
    return `<span class="mu-world-known" title="${esc(list.map(r => r.name).join(', '))}">${list.slice(0, 4).map(r => `<img src="${esc(thumb(r.avatar))}" alt="">`).join('')}${list.length > 4 ? `<em>+${list.length - 4}</em>` : ''}</span>`;
}
// All the world's maps as round pictures, like choosing a neighborhood in The Sims: click one to look at it.
let mapsPicker = false;
function mapsPickerHtml(g, w, shown) {
    const here = youMap(g, w).id;
    const top = w.maps.filter(m => !m.parent || !w.maps.some(x => x.id === m.parent));
    const order = top.flatMap(t => [t, ...w.maps.filter(m => m.parent === t.id), ...w.maps.filter(m => m.parent && m.parent !== t.id && w.maps.find(x => x.id === m.parent)?.parent === t.id)]);
    const list = [...order, ...w.maps.filter(m => !order.includes(m))];
    return `<div class="mu-worlds-veil" data-act="maps-pick"><section class="mu-worlds mh-glass" role="dialog" aria-label="Maps" data-keep="maps">
        <header><h3>${icon('home')} ${esc(w.name)}</h3><button class="mu-ibtn mu-ghost" data-act="maps-pick" title="Close">${icon('x')}</button></header>
        <div class="mu-worlds-grid">${list.map(m => `<button class="mu-world-dot ${m.id === shown ? 'is-on' : ''}" data-act="maps-go" data-map="${esc(m.id)}">
            <i style="background-image:url('${esc(worldFile(w, pictureAt(w, g.minutes, m.image, m.images)))}')">${m.id === here ? `<em>${icon('pin')} You</em>` : ''}</i>
            <b data-notr>${esc(m.name)}</b><small data-notr>${esc(m.area ?? (m.parent ? w.maps.find(x => x.id === m.parent)?.name ?? '' : 'Main map'))}${m.trip ? ` · ${m.trip} min` : ''}</small>${knownHtml(g, w, m.id)}</button>`).join('')}</div></section></div>`;
}
// A scenario: no floor plan, the rooms of the house as pictures (as they look now); click one to go there.
function roomsHtml(g, w) {
    const kindPic = (p) => { const k = p.home ? w.homes.kinds[p.id === playerHomeId ? g.player.home.kind : (w.homes.zones.find(z => z.id === g.cast[String(p.id).slice(5)]?.home.zone)?.kind ?? '')] : null; return k ? pictureAt(w, g.minutes, k.image, k.images) : ''; };
    const list = pins(g, w).filter(p => !p.link);
    const yours = list.filter(p => p.id === playerHomeId), rooms = list.filter(p => !p.home), beds = list.filter(p => p.home && p.id !== playerHomeId);
    const card = (p) => {
        const pic = p.home ? kindPic(p) : pictureAt(w, g.minutes, p.bg, p.bgs);
        const here = presentAt(g, w, p.id);
        const you = p.id === g.player.loc;
        return `<button class="mu-room ${you ? 'is-you' : ''}" data-act="go" data-loc="${esc(p.id)}" title="${you ? 'Back to this room' : 'Go here'}"><i style="${pic ? `background-image:url('${esc(worldFile(w, pic))}')` : ''}">${you ? `<em>${icon('pin')} You</em>` : ''}</i>
            <b data-notr>${esc(p.id === playerHomeId ? 'Your room' : String(p.name).replace(/'s home$/, "'s room"))}</b>${here.length ? `<span class="faces">${here.slice(0, 5).map(r => `<img src="${esc(thumb(r.avatar))}" alt="" title="${esc(r.met ? r.name : 'Someone')}">`).join('')}${here.length > 5 ? `<i>+${here.length - 5}</i>` : ''}</span>` : ''}</button>`;
    };
    const head = `<div class="mu-rooms-head"><h3 data-notr>${esc(w.name)}</h3></div>`;
    // floors set in the creator (no picture of the plan): the rooms floor by floor, one block above the other
    if (floorsOn(w)) {
        const all = [...yours, ...rooms, ...beds];
        // a room not put on any floor is on the first one
        const first = w.plan.floors[0].id;
        const blocks = w.plan.floors.map(f => [f.name, all.filter(p => (floorOf(g, w, p.id) || first) === f.id)]).filter(([, l]) => l.length);
        const rest = [];
        return `<div class="mu-map is-rooms"><div class="mu-rooms" data-keep="rooms">${head}
            ${blocks.map(([name, l]) => `<h4 class="mu-rooms-floor" ${/^Floor \d+$/.test(name) ? '' : 'data-notr'}>${esc(name)}</h4><div class="mu-rooms-grid">${l.map(card).join('')}</div>`).join('')}
            ${rest.length ? `<h4 class="mu-rooms-floor">Other rooms</h4><div class="mu-rooms-grid">${rest.map(card).join('')}</div>` : ''}</div>${toolsHtml()}</div>`;
    }
    return `<div class="mu-map is-rooms"><div class="mu-rooms" data-keep="rooms">${head}
        <div class="mu-rooms-grid">${[...yours, ...rooms].map(card).join('')}</div>
        ${beds.length ? `<h4>Bedrooms</h4><div class="mu-rooms-grid">${beds.map(card).join('')}</div>` : ''}</div>${toolsHtml()}</div>`;
}
// A scenario with a floor plan: the floor you are on, each room where it is (click to go there), the floors at the
// bottom left, and the rooms not on the plan yet with a red "!".
export const PV = { floor: '', at: '' };
function planHtml(g, w) {
    const plan = w.plan;
    if (PV.at !== g.player.loc) {
        PV.at = g.player.loc;
        PV.floor = '';
    }
    const floor = plan.floors.find(f => f.id === PV.floor) ?? plan.floors.find(f => f.id === floorOf(g, w, g.player.loc)) ?? plan.floors[0];
    const kindPic = (loc) => { const k = loc === playerHomeId ? w.homes.kinds[g.player.home.kind] : w.homes.kinds[w.homes.zones.find(z => z.id === g.cast[loc.slice(5)]?.home.zone)?.kind ?? '']; return k ? pictureAt(w, g.minutes, k.image, k.images) : ''; };
    const faces = (loc) => { const here = presentAt(g, w, loc); return here.length ? `<span class="faces">${here.slice(0, 4).map(r => `<img src="${esc(thumb(r.avatar))}" alt="" title="${esc(r.met ? r.name : 'Someone')}">`).join('')}${here.length > 4 ? `<i>+${here.length - 4}</i>` : ''}</span>` : ''; };
    const rooms = plan.rooms.filter(r => r.floor === floor.id).map(r => {
        const t = planTarget(g, w, r);
        const box = `left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%`;
        if (!t)
            return `<div class="mu-plan-room is-off" style="${box}"><b>${esc(r.id.startsWith('spot:') ? 'Empty bedroom' : w.places.find(p => p.id === r.id)?.name ?? '')}</b></div>`;
        if (!t.known)
            return `<div class="mu-plan-room is-off" style="${box}" title="You have not met who sleeps here"><b>A bedroom</b></div>`;
        const p = placeOf(g, w, t.loc);
        if (!p)
            return '';
        const pic = p.home ? kindPic(t.loc) : pictureAt(w, g.minutes, p.bg, p.bgs);
        const you = t.loc === g.player.loc;
        const name = t.loc === playerHomeId ? 'Your room' : String(p.name).replace(/'s home$/, "'s room");
        return `<button class="mu-plan-room ${you ? 'is-you' : ''}" style="${box}" data-act="go" data-loc="${esc(t.loc)}" title="${you ? 'You are here' : `Go to ${esc(name)}`}">
            <i style="${pic ? `background-image:url('${esc(worldFile(w, pic))}')` : ''}"></i><b data-notr>${esc(name)}</b>${faces(t.loc)}${you ? `<em>${icon('pin')} You</em>` : ''}</button>`;
    }).join('');
    const lost = unplaced(g, w);
    const ratio = floor.ratio ?? 1.6;
    return `<div class="mu-map is-plan"><div class="mu-plan-stage"><div class="mu-plan ${floor.image ? 'has-pic' : ''} ${plan.labels === false ? 'no-labels' : ''}" style="--r:${ratio};${plan.glow ? `--glow:${esc(plan.glow)};` : ''}${floor.image ? `background-image:url('${esc(worldFile(w, pictureAt(w, g.minutes, floor.image, floor.images) ?? floor.image))}')` : ''}">${rooms}</div></div>
        <div class="mu-plan-bar">${lost.length ? `<div class="mu-plan-lost"><small>Not on the plan</small>${lost.map(p => {
        const name = p.id === playerHomeId ? 'Your room' : String(p.name).replace(/'s home$/, "'s room");
        return `<button data-act="go" data-loc="${esc(p.id)}" class="${p.id === g.player.loc ? 'is-you' : ''}" title="${esc(name)}: where this room is on the floor plan is not set yet (World creator › Maps › Floor plan). Click to go there."><b class="mu-plan-bang">!</b><span data-notr>${esc(name)}</span></button>`;
    }).join('')}</div>` : ''}
            ${plan.floors.length > 1 ? `<nav class="mu-plan-floors" aria-label="Floors">${plan.floors.map(f => {
        const who = Object.values(g.cast).filter(r => r.met && floorOf(g, w, whereNow(g, w, r)) === f.id);
        return `<button class="${f.id === floor.id ? 'is-on' : ''}" data-act="plan-floor" data-id="${esc(f.id)}">${who.length ? `<span class="mu-floor-faces">${who.slice(0, 5).map(r => `<img src="${esc(thumb(r.avatar))}" alt="" title="${esc(r.name)}">`).join('')}${who.length > 5 ? `<i>+${who.length - 5}</i>` : ''}</span>` : ''}${floorOf(g, w, g.player.loc) === f.id ? icon('pin') : ''}<span ${/^Floor \d+$/.test(f.name) ? '' : 'data-notr'}>${esc(f.name)}</span></button>`;
    }).join('')}</nav>` : ''}</div>
        ${toolsHtml()}</div>`;
}
export function mapHtml() {
    const { g, w } = ctxW();
    if (planOn(w))
        return planHtml(g, w);
    if (isScenario(w))
        return roomsHtml(g, w);
    const map = curMap(g, w);
    const parent = map.parent ? w.maps.find(m => m.id === map.parent) : null;
    const away = map.id !== youMap(g, w).id;
    const many = w.maps.length > 1;
    const nav = parent || away || many ? `<div class="mu-mapnav">${many ? `<button data-act="maps-pick" title="All maps">${icon('map')}<span>Maps</span></button>` : ''}${parent ? `<button data-act="open-map" data-map="${esc(parent.id)}">${icon('up')}<span>${esc(parent.name)}</span></button>` : ''}
        ${away ? `<button data-act="open-map" data-map="">${icon('pin')}<span>Back to where you are</span></button>` : ''}<b data-notr>${esc(map.name)}</b></div>` : '';
    return `<div class="mu-map">${nav}${mapsPicker ? mapsPickerHtml(g, w, map.id) : ''}
        <div class="mu-stage" data-stage>
            <div class="mu-mapimg" style="${esc(`--r:${num(map.ratio, 1.7914)};${bgOf(w, pictureAt(w, g.minutes, map.image, map.images))}`)}">${pinsHtml(g, w)}</div>
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
    const stage = document.getElementById(ROOT_ID)?.querySelector('[data-stage]');
    const map = stage?.querySelector('.mu-mapimg');
    return stage && map ? { stage, map } : null;
};
function clampView(v, stage, map) {
    const sw = stage.clientWidth, sh = stage.clientHeight, W0 = map.offsetWidth, H0 = map.offsetHeight;
    const kmin = Math.max(1, sw / W0, sh / H0);
    const k = Math.max(kmin, Math.min(kmin * KMAX, v.k || 0));
    const mx = Math.max(0, (W0 * k - sw) / 2), my = Math.max(0, (H0 * k - sh) / 2);
    return { z: 1, k, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
}
let focusNext = null;
export function applyMapView(reset = false) {
    const e = els();
    if (!e)
        return;
    const cur = state.mapView;
    let v = clampView(reset || !cur.k ? { z: 1, k: 0, x: 0, y: 0 } : cur, e.stage, e.map);
    const target = focusNext ?? (reset || !cur.k ? game()?.player.loc ?? null : null);
    focusNext = null;
    if (target) { // brings the pin into the free area left of the side card
        const pin = e.map.querySelector(`.mu-pin[data-loc="${CSS.escape(target)}"]`);
        if (pin) {
            const px = parseFloat(pin.style.left) / 100, py = parseFloat(pin.style.top) / 100;
            const sh = e.stage.clientHeight, card = 0;
            v = clampView({ ...v, x: -card / 2 - (px - 0.5) * e.map.offsetWidth * v.k, y: -(py - 0.5) * e.map.offsetHeight * v.k + sh * 0 }, e.stage, e.map);
        }
    }
    state.mapView = v;
    e.map.style.setProperty('--ik', String(1 / v.k));
    e.map.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
    // smooth while it moves; once it stops, the browser draws the map again at the new size (sharp, not a stretched copy)
    e.map.style.willChange = 'transform';
    clearTimeout(sharpTimer);
    sharpTimer = setTimeout(() => { const m = els()?.map; if (m)
        m.style.willChange = 'auto'; }, 180);
}
let sharpTimer = null;
function zoomBy(f, cx = 0, cy = 0) {
    const e = els();
    const v = state.mapView;
    if (!e || !v.k)
        return applyMapView();
    const k2 = clampView({ z: 1, k: v.k * f, x: 0, y: 0 }, e.stage, e.map).k;
    const r = k2 / v.k;
    state.mapView = { z: 1, k: k2, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
    applyMapView();
}
let pan = null, moved = false;
const pts = new Map();
let pinch = null;
export const mapInput = {
    click(_e) { return false; },
    attach(r) {
        r.addEventListener('wheel', (e) => {
            const stage = e.target.closest?.('[data-stage]');
            if (!stage)
                return;
            e.preventDefault();
            const rc = stage.getBoundingClientRect();
            const zz = uiZoom();
            zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, (e.clientX - rc.left - rc.width / 2) / zz, (e.clientY - rc.top - rc.height / 2) / zz);
        }, { passive: false });
        r.addEventListener('pointerdown', (e) => {
            const stage = e.target.closest?.('[data-stage]');
            if (!stage || e.target.closest('.mu-zoom'))
                return;
            moved = false;
            pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const v = state.mapView;
            if (!v.k)
                return;
            if (pts.size === 2) {
                const [a, b] = [...pts.values()];
                pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: v.k };
                pan = null;
                return;
            }
            pan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, stage };
        });
        r.addEventListener('pointermove', (e) => {
            if (pts.has(e.pointerId))
                pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pinch && pts.size === 2) {
                const [a, b] = [...pts.values()];
                state.mapView = { ...state.mapView, k: pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / (pinch.d || 1) };
                moved = true;
                applyMapView();
                return;
            }
            if (!pan || e.pointerId !== pan.id)
                return;
            const zz = uiZoom(), dx = (e.clientX - pan.sx) / zz, dy = (e.clientY - pan.sy) / zz;
            if (!moved && Math.hypot(dx, dy) < 5)
                return;
            if (!moved) {
                moved = true;
                pan.stage.setPointerCapture?.(e.pointerId);
                pan.stage.classList.add('is-panning');
            }
            state.mapView = { z: 1, k: state.mapView.k, x: pan.vx + dx, y: pan.vy + dy };
            applyMapView();
        });
        const end = (e) => {
            pts.delete(e.pointerId);
            if (pts.size < 2)
                pinch = null;
            if (pan && e.pointerId === pan.id) {
                pan.stage.classList.remove('is-panning');
                pan = null;
            }
        };
        r.addEventListener('pointerup', end);
        r.addEventListener('pointercancel', end);
        window.addEventListener('resize', () => applyMapView());
        // hover a pin: its card opens next to it; leaving pin and card closes it
        r.addEventListener('pointerover', (e) => {
            if (e.pointerType === 'touch' || pan)
                return;
            const t = e.target;
            if (t.closest?.('.mu-pop')) {
                clearTimeout(hideTimer);
                return;
            }
            const pin = t.closest?.('.mu-pin');
            if (pin && pin.dataset.loc !== popFor)
                showPop(pin, false);
            else if (pin)
                clearTimeout(hideTimer);
        });
        r.addEventListener('pointerout', (e) => {
            if (e.pointerType === 'touch')
                return;
            const from = e.target.closest?.('.mu-pin, .mu-pop');
            const to = e.relatedTarget?.closest?.('.mu-pin, .mu-pop');
            if (from && !to)
                hidePop();
        });
    },
};
/* ---------- actions ---------- */
// Moves the player: time passes, the scene follows (who is there now), and the screen goes to the scene.
// A long journey (RPG, between regions): first, how you go (making camp, or pushing on).
export const JOURNEY = { to: '', minutes: 0, camps: 0 };
// `force`: the engine moves you (you already walked out, or got away): no questions asked. A string is the road of a
// long journey ('camp' or 'push').
export async function travelTo(loc, arg = {}) {
    const opts = typeof arg === 'string' ? {} : arg, road = typeof arg === 'string' ? arg : undefined;
    const { g, w } = ctxW();
    if (loc === g.player.loc)
        return false;
    if (state.generating) {
        toast('Wait until they finish speaking.', 'info');
        return false;
    } // nobody walks out mid-sentence
    // player state: in a conversation you walk out (it costs), held or restrained you have to get away first
    if (!opts.force && !allow('travel', () => { void travelTo(loc, { force: true }).then(() => { state.view = 'scene'; notify(); }); }, loc)) {
        notify();
        return false;
    }
    PSUI.gotAwayTo = '';
    const mins = travelMinutes(g, w, g.player.loc, loc);
    const trip = journeyOf(g, w, g.player.loc, loc, mins);
    if (trip && trip.camps > 0 && !road) {
        Object.assign(JOURNEY, { to: loc, minutes: mins, camps: trip.camps });
        notify();
        return false;
    }
    // the scene you leave closes; the next one starts clean. Not in a Home: walking from room to room (often with
    // the same people) is one long scene, and closing it made them forget what was just said.
    if (!isScenario(w))
        await endVisit(g, w);
    beforeTravel(g, w, loc).forEach(m => toast(m, 'info'));
    const from = g.player.loc;
    g.traveling = true; // the trip itself costs no energy (only what you do does)
    const msgs = road ? travelRoad(g, w, mins, road === 'camp') : advance(g, w, mins);
    delete g.traveling;
    JOURNEY.to = '';
    if (g.player.loc === from)
        g.player.loc = loc; // unless something on the way moved you (passing out…)
    viewMap = null;
    msgs.forEach(m => toast(m, 'warn'));
    runPlans();
    state.sel = null;
    saveGame();
    // hostile actions: free of a captor once you leave their place; your captives come along; the law may find you
    const hx = await import('../sim/hostile.js');
    hx.releaseCaptor(g);
    hx.onArrive(g, w);
    await syncScene();
    state.view = 'scene'; // arriving somewhere opens its scene (with its things to do), even when nobody is there
    // (the elevator ride on arriving at an apartment is gone: it only got in the way)
    notify();
    return true;
}
// The journey dialog: the road takes hours; make camp at night, or push on without rest.
export function journeyHtml() {
    const g = game();
    const w = g && getWorld(g.world);
    if (!g || !w || !JOURNEY.to)
        return '';
    const p = placeOf(g, w, JOURNEY.to);
    const h = Math.round(JOURNEY.minutes / 60);
    return `<div class="mu-recap-veil"><section class="mu-recap mh-glass mu-journey" role="dialog" aria-label="Journey">
        <header><small>${esc(lex(w, 'journey'))}</small><h3>${esc(p?.name ?? '')}</h3></header>
        <p>${esc(lex(w, 'journeyText', String(h), String(JOURNEY.camps)))}</p>
        <div class="mu-work-modes">
            <button class="mu-work-mode" data-act="jr-road" data-v="camp"><i>🏕️</i><b>${esc(lex(w, 'makeCamp'))}</b><small>Rest at night: half your hit points and focus back. A Survival check decides how the night goes.</small></button>
            <button class="mu-work-mode" data-act="jr-road" data-v="push"><i>🌙</i><b>${esc(lex(w, 'pushOn'))}</b><small>Arrive sooner, but exhausted (no rest).</small></button>
        </div>
        <button class="mu-ghost" data-act="jr-cancel">Stay here</button></section></div>`;
}
// Goes to a place and straight into its scene.
async function goTo(loc) {
    const { g, w } = ctxW();
    popFor = '';
    // Home: a plan somewhere out of the house: going there is going out (who comes, the background)
    if (isScenario(w) && isOuting(loc) && loc !== g.player.loc) {
        const { openGoOut } = await import('./outing.js');
        openGoOut(outingName(loc));
        return;
    }
    const door = doorAnswer(g, w, loc);
    if (!door.ok) {
        toast(door.text, 'info');
        notify();
        return;
    }
    if (door.text)
        toast(door.text, 'info');
    if (loc !== g.player.loc && !(await travelTo(loc))) {
        notify();
        return;
    }
    state.view = 'scene';
    notify();
}
async function sleep() {
    const { g, w } = ctxW();
    const stay = stayOf(g);
    const away = !!stay && stay.where === g.player.loc && g.player.loc !== playerHomeId;
    if (w.sleep.homeOnly && g.player.loc !== playerHomeId && !away) {
        toast('You can only sleep at home.', 'info');
        return;
    }
    if (g.player.loc === playerHomeId && !away && lockedOut(g)) {
        toast(lex(w, 'lockedOutGo', appRef(w, 'homes')), 'warn');
        return;
    }
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
        if (!d)
            continue;
        g.player.stats[id] = Math.min(d.max, (id === 'energy' ? v : (g.player.stats[id] ?? d.start) + v));
        if (d.decay?.awakeOnly)
            g.tick[`decay:${id}`] = nowAbs(g); // the waking day starts counting now
    }
    if (isRpg(w))
        longRest(g, w); // RPG: a long rest (hit points, focus, preparing spells)
    // a night's sleep leaves you hungry, thirsty and in need of a wash; a good bed lifts the mood
    for (const [id, v] of Object.entries({ hunger: -20, thirst: -25, hygiene: -25 }))
        addStatus(g, w, id, v);
    {
        const m = sleepMood(g, w);
        if (m)
            addStatus(g, w, 'mood', m);
    } // a good bed…
    msgs.forEach(m => toast(m, 'warn'));
    runPlans();
    saveGame();
    await syncScene();
    lifeSound('sleep');
    if (isScenario(w))
        state.view = 'scene'; // Home: you wake up where you were
    showTransition(`Day ${g.day}`, weekday(g.day), 'night');
    notify();
    // the day becomes a diary entry (one AI call), while the night passes on screen
    if (diaryOn() && systemOn(w, 'diary')) {
        setTimeout(() => diaryWaiting(dayEnded), 2600); // after the night: "writing your diary…" until it is done
        writeDiary(g, w, dayEnded)
            .then(res => { markDayStart(g); saveGame(); refreshPrompt(); if (res.ok)
            toast(`Diary updated — day ${dayEnded}. Read it in the Journal.`, 'success'); diaryReady(dayEnded, res.changes, res.ok); })
            .catch((e) => { diaryReady(dayEnded, [], false); toast(`The diary could not be written (${String(e?.message ?? e)}). The facts of the day are still in the Journal.`, 'warn'); });
    }
    else
        markDayStart(g);
}
// After a shift: time has passed; a short transition shows how it went.
export async function finishWork(msgs, jobName) {
    msgs.forEach((m, i) => toast(m, i ? 'success' : 'info'));
    runPlans();
    saveGame();
    await syncScene();
    lifeSound('work');
    showTransition(jobName, msgs[0] ?? 'Shift done', 'work');
    notify();
}
Object.assign(ACT, {
    'plan-floor': (el) => { PV.floor = el.dataset.id ?? ''; notify(); },
    'jr-road': async (el) => { const to = JOURNEY.to; if (!to)
        return; await travelTo(to, el.dataset.v); },
    'jr-cancel': () => { JOURNEY.to = ''; notify(); },
});
Object.assign(ACT, {
    work: async () => {
        if (!allow('work', () => { passOnce(); void ACT.work(document.body, new Event('click')); }))
            return;
        const { g, w } = ctxW();
        const job = g.player.job && w.occupations.find(o => o.id === g.player.job.id);
        if (!job || !isOpen(g, job)) {
            toast('The place is closed now.', 'info');
            return;
        }
        const tired = tooTired(g, w, job.cost ?? {}, 'work a shift');
        if (tired) {
            toast(tired, 'warn');
            return;
        }
        if (askAboutPlans(g, job.shift * 60, 'work'))
            return; // a plan during the shift: ask first
        openWork(); // the work screen: how you spend the shift (like The Sims)
    },
    apply: (el) => {
        const { g, w } = ctxW();
        if (g.player.job && !el.dataset.force) {
            toast(lex(w, 'quitFirst'), 'info');
            return;
        }
        const r = hire(g, w, el.dataset.id);
        toast(r.text, r.ok ? 'success' : 'warn');
        saveGame();
        notify();
    },
    // a click goes to the place (on a touch screen the first tap shows its card, with a "Go here" button)
    'maps-pick': (el, e) => { if (e && el.classList.contains('mu-worlds-veil') && e.target.closest('.mu-worlds'))
        return; mapsPicker = !mapsPicker; notify(); },
    'maps-go': (el) => { mapsPicker = false; const { g, w } = ctxW(); viewMap = el.dataset.map === youMap(g, w).id ? null : el.dataset.map || null; popFor = ''; state.mapView = {}; notify(); setTimeout(() => applyMapView(true), 0); },
    'open-map': (el) => { viewMap = el.dataset.map || null; popFor = ''; state.mapView = {}; notify(); setTimeout(() => applyMapView(true), 0); },
    pin: (el, e) => {
        if (moved)
            return;
        const { g, w } = ctxW();
        const link = placeOf(g, w, el.dataset.loc)?.link;
        if (link) {
            viewMap = link;
            popFor = '';
            state.mapView = {};
            notify();
            setTimeout(() => applyMapView(true), 0);
            return;
        }
        if (e.pointerType === 'touch' && popFor !== el.dataset.loc) {
            showPop(el, true);
            return;
        }
        return goTo(el.dataset.loc);
    },
    go: (el) => goTo(el.dataset.loc),
    travel: (el) => goTo(el.dataset.loc),
    sleep: () => {
        if (!allow('sleep', () => { passOnce(); void ACT.sleep(document.body, new Event('click')); }))
            return;
        const { g, w } = ctxW();
        const until = w.sleep.until;
        const mins = g.minutes < until ? until - g.minutes : 1440 - g.minutes + until;
        if (askAboutPlans(g, mins, 'sleep'))
            return;
        return sleep();
    },
    do: async (el) => {
        const { g, w } = ctxW();
        const a = actionsHere(g, w).find(x => x.id === el.dataset.id);
        if (!a)
            return;
        if (!allow('do', () => undefined))
            return;
        if (!canAfford(g, a)) {
            toast('Not enough money.', 'info');
            return;
        }
        const tired = tooTired(g, w, Object.fromEntries(Object.entries(a.effects ?? {}).map(([k, v]) => [k, -v])), a.label.toLowerCase());
        if (tired) {
            toast(tired, 'warn');
            return;
        }
        if (isDoing())
            return;
        actionSound(a.effects, a.id);
        await doing(a.label, a.icon ?? '⏳', a.minutes); // a moment on screen while the time passes
        applyAction(g, w, a);
        advance(g, w, a.minutes).forEach(m => toast(m, 'warn'));
        const roll = rollAction(g, w, a);
        afterAction(g, w, a, roll ? roll.grade.includes('success') : null).forEach(m => toast(m, 'success'));
        afterEvent(g, w, a);
        practice(g, w, a, roll ? roll.grade.includes('success') : null, roll?.grade === 'critical-success').forEach(m => toast(m, 'success'));
        runPlans();
        saveGame();
        await syncScene();
        if (roll) {
            toast(`${gradeName(roll.grade)} — ${roll.text}`, roll.grade.includes('success') ? 'success' : 'warn');
            // the AI only tells the story of the result the engine decided
            if (state.view === 'scene')
                setPrompt('mundi_roll', `[Just now {{user}} tried to ${a.label.toLowerCase()}: ${gradeName(roll.grade).toLowerCase()}. ${roll.text} Narrate it in that light if it comes up.]`);
        }
        else {
            toast(`${a.name}: done.`, 'success');
            if (isScenario(w) && state.view === 'scene')
                setPrompt('mundi_roll', `[Just now {{user}} chose to ${a.label.toLowerCase()}. Narrate how it goes, in the scene.]`);
        }
        maybeBump(g, w);
        notify();
    },
    zoom: (el) => zoomBy(el.dataset.d === 'in' ? 1.3 : 1 / 1.3),
    'zoom-fit': () => applyMapView(true),
});
