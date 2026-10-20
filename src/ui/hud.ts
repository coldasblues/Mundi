import { lookPanelHtml } from './chatlook.js';
import { fmtClock, is12h } from '../core/fmt.js';
import { missingCourses, interviewChance, triedToday } from '../sim/skills.js';
import { courseRow } from './courses.js';
import { payOf, lockedOut } from '../sim/bills.js';
// The in-game HUD (the same layout for every style; skins only tint it). Glass panels around the scene:
//   top left    — you: portrait, bar needs (health, energy) and round needs (hunger, thirst, mood, hygiene)
//   top centre  — the clock: time, weekday, weather, part of the day and game day
//   top right   — the menu button, and the map button below it (money is on your card)
//   left        — the people with you in this scene (bond, and how long they stay with you)
//   right       — things to do here (only inside a scene)
//   bottom      — the dialogue box (scene.ts); bottom right: the phone, peeking up when it is closed
import { needWord } from '../sim/life.js';
import { lifeOverlays, soloOf } from './lifeui.js';
import { game, esc, state, UI, saveSettings, notify, nowAbs, clockMode, onPhone } from '../core/store.js';
import { getWorld, activeStatuses, styleOf, type StatusDef, type WorldDef } from '../core/world.js';
import type { Save } from '../core/store.js';
import { personaThumb, personaName, thumb } from '../st/bridge.js';
import { money, actionsHere, canAfford } from '../sim/needs.js';
import { placeOf, playerHomeId } from '../sim/places.js';
import { traitsOf, jobDef, isOpen } from '../sim/work.js';
import { presentAt } from '../sim/people.js';
import { period, weekday, seasonOf } from '../sim/time.js';
import { icon } from './icons.js';
import { featureOn } from '../sim/creator.js';
import { ACT } from './reg.js';
import { houseBar } from './house.js';
import { eventPanelHtml, stayOf } from './events.js';
const stayHere = (g: Save) => { const s = stayOf(g); return !!s && s.where === g.player.loc && s.where !== 'home:player'; };
import { customActionRow, customModalHtml } from './custom.js';
import { doingHtml } from './doing.js';
import { apptActions, apptReminderHtml, conflictHtml } from './appts.js';
import { social, isWith } from '../sim/social.js';
import { bumpHtml } from './bump.js';
import { P as phone, phoneUnread } from './phone.js';
import { PL, facePlanHtml } from './plans.js';
import { relBar } from './relui.js';
import { weatherOf } from '../sim/weather.js';
import { chanceOf } from '../sim/dice.js';
import { pstateOverlays, walkOnChips } from './pstateui.js';
import { storyOverlays, autosaveLine } from './storyui.js';
import { psOn } from '../sim/pstate-live.js';

/* ---------- you ---------- */

// Health and energy are bars; the other needs are round badges. A world can choose with `hudKind`.
const isBar = (s: StatusDef) => ((s as any).hudKind ? (s as any).hudKind === 'bar' : ['life', 'health', 'energy'].includes(s.id));
const NEED_ICON: Record<string, string> = { life: 'pulse', health: 'pulse', energy: 'bolt', hunger: 'utensils', thirst: 'drop', mood: 'happy', hygiene: 'sparkles' };
const needIcon = (s: StatusDef) => (NEED_ICON[s.id] ? icon(NEED_ICON[s.id]) : `<i>${esc(s.icon)}</i>`);

function personaCard(g: Save, w: WorldDef) {
    const img = personaThumb();
    const shown = activeStatuses(w).filter(s => s.hud);
    const v = (s: StatusDef) => Math.round(g.player.stats[s.id] ?? s.start);
    return `<aside class="mh-persona mh-glass" aria-label="${esc(personaName())}">
        <button class="mh-face" data-act="pa-open" title="Play as…">${img ? `<img src="${esc(img)}" alt="">` : icon('user')}<i class="mh-face-swap">${icon('users')}</i></button>
        <div class="mh-needs">
            <div class="mh-who"><b>${esc(personaName())}</b><span class="mu-cash">${esc(money(w, g.player.money))}</span></div>
            ${shown.filter(isBar).map(s => `<div class="mh-bar ${v(s) <= 20 ? 'is-low' : ''}" data-stat="${esc(s.id)}" data-word="${esc(needWord(s, v(s)))}" style="--c:${esc(s.color)};--v:${v(s)}">
                <span class="mh-bar-ic">${needIcon(s)}</span><span class="mh-bar-name">${esc(s.name)}</span><span class="mh-bar-track"><i></i></span></div>`).join('')}
            <div class="mh-rings">${shown.filter(s => !isBar(s)).map(s => `<div class="mh-ring ${v(s) <= 20 ? 'is-low' : ''}" data-stat="${esc(s.id)}" data-word="${esc(needWord(s, v(s)))}" style="--c:${esc(s.color)};--v:${v(s)}">
                <span class="mh-ring-ic">${needIcon(s)}</span><small>${esc(s.name)}</small></div>`).join('')}</div>
        </div></aside>`;
}

/* ---------- the clock ---------- */

export const clock12 = (m: number) => fmtClock(m, false);
export const ampm = (m: number) => (!is12h() ? '' : Math.floor(m / 60) % 24 < 12 ? 'AM' : 'PM');

function clockCard(g: Save, w: WorldDef) {
    const wx = weatherOf(g);
    const here = placeOf(g, w, g.player.loc);
    const se = seasonOf(g);
    const where = esc(g.player.loc === playerHomeId ? 'Home' : here?.name ?? '');
    // inside a place: one bar across the top (time, day, part of the day, the place, weather and season)
    // (on a phone the clock stays a card beside yours, in a place too)
    if (state.view === 'scene' && !onPhone()) return `<div class="mh-clock mh-glass is-bar">
        <div class="mh-time"><b data-clock>${clock12(g.minutes)}</b><small data-ampm>${ampm(g.minutes)}</small></div>
        <span class="mh-bar-day"><b data-weekday>${esc(weekday(g.day))}</b><small><span data-period>${esc(period(w, g.minutes).name)}</span> · Day ${g.day}</small></span>
        <span class="mh-bar-place">${icon('pin')}<b>${where}</b></span>
        <span class="mh-bar-sky"><span class="mh-weather" title="${esc(wx.name)}">${wx.icon}</span><small class="mh-season" title="Season">${se.name} ${se.icon}</small></span>
    </div>`;
    return `<div class="mh-clock mh-glass">
        <div class="mh-clock-top"><div class="mh-time"><b data-clock>${clock12(g.minutes)}</b><small data-ampm>${ampm(g.minutes)}</small></div><span class="mh-sky"><span class="mh-weather" title="${esc(wx.name)}">${wx.icon}</span></span></div>
        <div class="mh-clock-row"><span class="mh-weekday" data-weekday>${esc(weekday(g.day))}</span><small class="mh-season" title="Season">${se.name} ${se.icon}</small></div>
        <div class="mh-clock-strip"><span data-period>${esc(period(w, g.minutes).name)}</span><span>Day ${g.day}</span></div>
    </div>
    <div class="mh-where">${icon('pin')}<span>${where}</span></div>`;
}

/* ---------- wallet, menu, map ---------- */

let menuOpen = false;
let lookOpen = false;
function corner(g: Save, w: WorldDef) {
    return `<div class="mh-corner">
        <button class="mh-menu mh-glass ${menuOpen ? 'is-on' : ''}" data-act="hud-menu" title="Menu">${icon('menu')}</button>
        ${g.player.job && featureOn(w, 'jobs') && g.player.loc !== jobDef(w, g.player.job.id)?.place ? `<button class="mh-mapbtn mh-glass" data-act="go-work" title="Go to work">${icon('briefcase')}<span>Work</span></button>` : ''}
        ${state.view === 'scene' ? `<button class="mh-mapbtn mh-glass" data-act="to-map" title="${state.generating ? 'Wait until they finish speaking' : 'Map'}" ${state.generating ? 'aria-disabled="true"' : ''}>${icon('map')}<span>Map</span></button>` : `<button class="mh-mapbtn mh-glass" data-act="go-home" title="Go home">${icon('home')}<span>Home</span></button>`}
        ${menuOpen ? `<nav class="mh-menu-pop mh-glass">
            <button data-act="skip">${icon('skip')}<span>${clockMode(g) === 'live' ? 'Skip to the next part of the day' : 'Let time pass'}</span></button>
            ${clockMode(g) === 'live' ? `<button data-act="speed">${icon('pause')}<span>Clock speed: ${g.speed ? `×${g.speed / 60}` : 'paused'}</span></button>` : ''}
            ${g.player.loc !== playerHomeId ? `<button data-act="go-home">${icon('home')}<span>Go home</span></button>` : ''}
            <button data-act="story-save" class="mh-menu-save">${icon('save')}<span>Save…<small>${esc(autosaveLine())}</small></span></button>
            ${psOn() ? `<button data-act="story-open">${icon('users')}<span>People in your story</span></button>` : ''}
            <button data-act="open-world">${icon('globe')}<span>This world</span></button>
            <button data-act="hud-look">${icon('palette')}<span>Chat look</span></button>
            <button data-act="open-settings">${icon('gear')}<span>Settings</span></button>
            <button data-act="to-menu" data-sfx="back">${icon('back')}<span>Main menu</span></button></nav>` : ''}
        ${lookOpen ? `<div class="mh-lookpop mh-glass" data-keep="look"><header><b>Chat look</b><button class="mu-ibtn mu-ghost" data-act="hud-look">${icon('x')}</button></header>${lookPanelHtml()}</div>` : ''}
    </div>`;
}

/* ---------- people with you ---------- */

// Your party: the people who came along with you (in the scene and on the map). Who is simply in this place is
// shown at the top ("Here").
function peopleColumn(g: Save, w: WorldDef) {
    void w;
    const list = Object.values(g.cast).filter(r => isWith(g, r.avatar));
    if (!list.length) return '';
    const now = nowAbs(g);
    return `<aside class="mh-people mh-glass" aria-label="With you">${list.map(r => {
        const c = social(g).with.find(x => x.avatar === r.avatar);
        const left = c ? Math.max(0, Math.min(100, ((c.until - now) / 240) * 100)) : null;
        return `<button class="mh-person ${PL.card === r.avatar ? 'is-on' : ''} ${c ? 'is-with' : ''} ${soloOf(g) === r.avatar ? 'is-solo' : ''}" data-act="pc-open" data-who="${esc(r.avatar)}" title="${esc(r.met ? r.name : 'Someone')}">
            <img src="${esc(thumb(r.avatar))}" alt=""><b data-notr>${esc(r.met ? r.name : '?')}</b>
            <span class="mh-mini-rel">${relBar(r.avatar, false)}</span>
            ${left !== null ? `<span class="mh-mini is-time" title="With you for a while"><i style="width:${left}%"></i></span>` : ''}</button>`;
    }).join('')}</aside>`;
}

// Who is in this place (not in your party): their pictures under the place's name; a click opens their options.
function hereBar(g: Save, w: WorldDef) {
    if (state.view !== 'scene') return '';
    const list = presentAt(g, w, g.player.loc);   // everyone in the place, the people who came with you too
    const extras = walkOnChips(g, w);             // and the people the story brought in
    if (!list.length && !extras) return '';
    return `<nav class="mh-here mh-glass" aria-label="Who is here"><small>Here</small>${extras}${list.map(r => `<button class="mh-here-p ${PL.card === r.avatar ? 'is-on' : ''} ${soloOf(g) === r.avatar ? 'is-solo' : ''} ${isWith(g, r.avatar) ? 'is-with' : ''}" data-act="pc-open" data-who="${esc(r.avatar)}" title="${esc(r.met ? r.name : 'Someone')}"><img src="${esc(thumb(r.avatar))}" alt=""><b data-notr>${esc(r.met ? r.name : '?')}</b></button>`).join('')}</nav>`;
}

/* ---------- things to do (inside a scene) ---------- */

function actsColumn(g: Save, w: WorldDef) {
    if (state.view !== 'scene') return '';
    const acts = actionsHere(g, w);
    const jobsOn = featureOn(w, 'jobs');
    const job = jobsOn && g.player.job && w.occupations.find(o => o.id === g.player.job!.id && o.place === g.player.loc);
    const jobs = jobsOn && !g.player.job ? w.occupations.filter(o => o.place === g.player.loc) : [];
    const atHome = g.player.loc === playerHomeId;
    const rows = [
        ...apptActions(g, w),
        ...(job ? [`<button class="mh-act is-work mh-glass" data-act="work" ${isOpen(g, job) ? '' : 'aria-disabled="true"'}><i>${icon('briefcase')}</i><b>Work a shift · ${job.shift} h</b><small>${isOpen(g, job) ? `${money(w, payOf(g, job.ranks[g.player.job!.rank].pay * job.shift))}` : `Open ${String(job.hours?.[0] ?? 0).padStart(2, '0')}:00–${String(job.hours?.[1] ?? 24).padStart(2, '0')}:00`}</small></button>`] : []),
        ...jobs.map(o => `<button class="mh-act mh-glass" data-act="apply" data-id="${esc(o.id)}" ${missingCourses(g, w, o).length || triedToday(g, o.id) ? 'aria-disabled="true"' : ''}><i>${icon('briefcase')}</i><b>Apply: ${esc(o.name)}</b><small>${missingCourses(g, w, o).length ? `Needs the course: ${esc(missingCourses(g, w, o).join(', '))}` : `${money(w, payOf(g, o.ranks[0].pay))}/h · interview 🎲 ${interviewChance(g, o, traitsOf(g))}%`}</small></button>`),
        ...(atHome && lockedOut(g) ? [`<button class="mh-act mh-glass is-warn" data-act="ph-open-homes"><i>${icon('home')}</i><b>Locked out</b><small>Pay the rent in the Homes app to get back in</small></button>`] : []),
        ...((atHome && !lockedOut(g)) || stayHere(g) ? [`<button class="mh-act mh-glass" data-act="sleep"><i>${icon('moon')}</i><b>Sleep until morning</b><small>${atHome ? 'Rest' : 'Staying the night here'}</small></button>`] : []),
        ...acts.map(a => `<button class="mh-act mh-glass" data-act="do" data-id="${esc(a.id)}" ${canAfford(g, a) ? '' : 'aria-disabled="true" title="Not enough money"'}><i>${a.icon ?? ''}</i><b>${esc(a.label)}</b><small>${a.cost < 0 ? `+${money(w, -a.cost)}` : a.cost ? money(w, a.cost) : 'Free'} · ${a.minutes} min${a.roll ? ` · 🎲 ${chanceOf(g, a)}% chance` : ''}</small></button>`),
    ];
    { const cr = courseRow(g, w); if (cr) rows.splice(rows.length, 0, cr); }
    rows.push(customActionRow());   // an action you name yourself
    const open = actsOpen();
    return `<aside class="mh-acts ${open ? '' : 'is-closed'}" aria-label="Things to do">
        <button class="mh-acts-head mh-glass" data-act="dock-toggle">${icon(open ? 'up' : 'down')}<span>Things to do</span>${onPhone() ? `<em>${rows.length}</em>` : ''}</button>
        ${open ? `<div class="mh-acts-list" data-keep="dock">${rows.join('')}</div>` : ''}</aside>`;
}

// On a phone the list is a sheet over the scene: closed until you open it, and it closes again after a choice.
let actsPhone = false;
const actsOpen = () => (onPhone() ? actsPhone : (UI() as any).actsOpen !== false);

/* ---------- the phone (or the journal), closed ---------- */

function phoneButton(w: WorldDef) {
    if (!w.features?.phone || phone.open) return '';
    const n = phoneUnread();
    if (styleOf(w) === 'medieval') return `<button class="mh-bookbtn mh-glass" data-act="phone" title="${esc(w.features.device ?? 'Journal')}">${icon('book')}${n ? `<em>${n}</em>` : ''}</button>`;
    return `<button class="mh-peek" data-act="phone" title="${esc(w.features.device ?? 'Phone')}"><span class="mh-peek-notch"></span><span class="mh-peek-ic">${icon('phone')}</span><span class="mh-peek-screen">
        <i style="--c:#7fd3ff">${icon('chat')}</i><i style="--c:#ff9ac1">${icon('heart')}</i><i style="--c:#b6a6ff">${icon('users')}</i>
        <i style="--c:#9be7c4">${icon('wallet')}</i><i style="--c:#ffc58a">${icon('calendar')}</i><i style="--c:#ffd36e">${icon('briefcase')}</i></span>${n ? `<em>${n}</em>` : ''}</button>`;
}

export function hudHtml() {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w) return '';
    return `${personaCard(g, w)}${houseBar(g, w)}${clockCard(g, w)}${corner(g, w)}${eventPanelHtml(g, w)}${hereBar(g, w)}${peopleColumn(g, w)}${actsColumn(g, w)}${phoneButton(w)}${bumpHtml()}${apptReminderHtml(g, w)}${conflictHtml(g, w)}${facePlanHtml()}${customModalHtml()}${doingHtml()}${lifeOverlays()}${pstateOverlays(g, w)}${storyOverlays(g, w)}`;
}

Object.assign(ACT, {
    'dock-toggle': () => { if (onPhone()) { actsPhone = !actsPhone; notify(); return; } (UI() as any).actsOpen = (UI() as any).actsOpen === false; saveSettings(); notify(); },
    'hud-menu': () => { menuOpen = !menuOpen; lookOpen = false; notify(); },   // the menu replaces Chat look
    'hud-look': () => { lookOpen = !lookOpen; notify(); },
});
// the menu closes after a choice in it, or a click anywhere else
document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (actsPhone && onPhone() && !t.closest?.('.mh-acts-head') && (t.closest?.('.mh-acts-list button') || !t.closest?.('.mh-acts'))) { actsPhone = false; setTimeout(notify, 0); }
    if (!menuOpen) return;
    if ((e.target as HTMLElement).closest?.('[data-act="hud-menu"]')) return;
    menuOpen = false;
    setTimeout(notify, 0);
}, true);
