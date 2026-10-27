// City events in the Calendar ("I'll go", go there now) and hobbies in the Profile.
import { esc, game, notify, saveGame, toast, nowAbs, type Save } from '../core/store.js';
import { getWorld, type WorldDef } from '../core/world.js';
import { ACT } from './reg.js';
import { money } from '../sim/needs.js';
import { weekday } from '../sim/time.js';
import { comingEvents, isGoing, toggleGoing, placeName, eventHere, type EventTime } from '../sim/cityevents.js';
import { hobbiesOf, progressOf, titleOf, MAX_LEVEL } from '../sim/hobbies.js';

const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function when(g: Save, x: EventTime) {
    const now = nowAbs(g);
    if (x.from <= now) return `on now, until ${hm(x.to % 1440)}`;
    const day = x.day === g.day ? 'Today' : x.day === g.day + 1 ? 'Tomorrow' : weekday(x.day);
    return `${day} · ${hm(x.from % 1440)}–${hm(x.to % 1440)}`;
}

// The Calendar's "In the city" list: the next 7 days.
export function cityEventsHtml(g: Save, w: WorldDef): string {
    const list = comingEvents(g, w, 7);
    if (!list.length) return '';
    const now = nowAbs(g);
    return `<section class="mu-city"><h4>In the city</h4>${list.map(x => {
        const live = x.from <= now && !x.off, going = isGoing(g, x.key), soon = x.day <= g.day + 1;
        const price = x.ev.price ? money(w, x.ev.price) : 'Free';
        return `<div class="mu-city-row ${going ? 'is-going' : ''} ${live ? 'is-live' : ''}">
            <i>${esc(x.ev.icon ?? '🎉')}</i><span><b>${esc(x.ev.name)}</b><small>${esc(placeName(w, x.ev.place))} · ${esc(when(g, x))} · ${esc(price)}</small>
            ${x.off && soon ? '<small class="mu-bad">Called off: rain</small>' : x.ev.desc ? `<small class="mu-muted">${esc(x.ev.desc)}</small>` : ''}
            ${x.ev.stage ? `<small class="mu-muted">🎤 <span>${esc(x.ev.stage.label)}</span> (<span>${esc(hobbiesOf(w).find(h => h.id === x.ev.stage!.hobby)?.name ?? x.ev.stage.hobby)}</span> ${x.ev.stage.level}+)</small>` : ''}</span>
            ${x.off && soon ? '' : live && g.player.loc !== x.ev.place ? `<button class="mu-primary" data-act="go" data-loc="${esc(x.ev.place)}">Go now</button>`
                : live ? '<em class="mu-good">You are here</em>' : `<button class="${going ? 'mu-primary' : 'mu-ghost'}" data-act="ce-go" data-key="${esc(x.key)}">${going ? '✓ Going' : "I'll go"}</button>`}
        </div>`;
    }).join('')}</section>`;
}
// The HUD chip while an event is on where you are.
export const eventChip = (g: Save, w: WorldDef) => { const x = eventHere(g, w); return x ? `<small class="mh-crowd mh-fest" title="${esc(x.ev.desc ?? '')}">${esc(x.ev.icon ?? '🎉')}<span>${esc(x.ev.name)}</span></small>` : ''; };
export const cityBadge = (g: Save, w: WorldDef) => comingEvents(g, w, 1).filter(x => isGoing(g, x.key) && !x.off && x.from - nowAbs(g) <= 120 && x.to > nowAbs(g)).length;

// The Profile's hobbies: level, title and a bar to the next level.
export function hobbiesHtml(g: Save, w: WorldDef): string {
    const list = hobbiesOf(w); if (!list.length) return '';
    return `<section class="mu-hobbies"><h4>🎯 Hobbies</h4><p class="mu-muted">Practice levels them up: each 2 levels are +1 on their rolls, each level pays more, and some jobs ask for them.</p>
        ${list.map(h => { const p = progressOf(g, h.id); return `<div class="mu-pf-row mu-hobby"><b>${esc(h.icon ?? '⭐')} ${esc(h.name)} <em>Lv ${p.level}</em></b>
            <small>${esc(titleOf(p.level))}${p.level < MAX_LEVEL ? ` · ${p.xp}/${p.next} xp` : ' · top level'}${h.desc ? ` · ${esc(h.desc)}` : ''}</small>
            <span class="mu-bond"><i style="width:${p.pct}%"></i></span></div>`; }).join('')}</section>`;
}

Object.assign(ACT, {
    'ce-go': (el) => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        const key = el.dataset.key!; const x = comingEvents(g, w, 7).find(e => e.key === key); if (!x) return;
        const on = toggleGoing(g, key);
        toast(on ? `You'll go to the ${x.ev.name}. You get a reminder an hour before.` : `Not going to the ${x.ev.name}.`, on ? 'success' : 'info');
        saveGame(); notify();
    },
});
