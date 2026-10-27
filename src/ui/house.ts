// Your household on the HUD: the faces of who lives with you, under your card. Click one for: play as them,
// call them over, or go to where they are.
import { esc, game, notify, saveGame, toast, nowAbs, type Save } from '../core/store.js';
import { getWorld, isScenario, type WorldDef } from '../core/world.js';
import { thumb } from '../st/bridge.js';
import { homeKey } from '../sim/living.js';
import { social, isWith } from '../sim/social.js';
import { whereNow } from '../sim/people.js';
import { placeOf } from '../sim/places.js';
import { note } from '../sim/facts.js';
import { kidOf, stageOf } from '../sim/family.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';

const H = { open: '' };
export const housemates = (g: Save) => Object.values(g.cast).filter(r => homeKey(r.home) === homeKey(g.player.home) && r.avatar !== ((g as any).swap?.avatar || (g as any).swap?.origCard));
const tooLittle = (g: Save, avatar: string) => { const k = kidOf(g, avatar); return !!k && ['baby', 'toddler'].includes(stageOf(k).id); };

export function houseBar(g: Save, w: WorldDef): string {
    const list = housemates(g);
    if (!list.length) return '';
    const sel = list.find(r => r.avatar === H.open);
    const where = sel ? whereNow(g, w, sel) : '';
    const here = sel && (where === g.player.loc || isWith(g, sel.avatar));
    return `<aside class="mh-house mh-glass" aria-label="Your household"><span class="mh-house-ic" title="Lives with you">${icon('home')}</span>
        ${list.map(r => `<button class="mh-house-p ${H.open === r.avatar ? 'is-on' : ''}" data-act="hs-open" data-who="${esc(r.avatar)}" title="${esc(r.name)}"><img src="${esc(thumb(r.avatar))}" alt=""></button>`).join('')}
        ${sel ? `<div class="mh-house-pop mh-glass"><b data-notr>${esc(sel.name)}</b><small>${here ? 'Here with you' : esc(placeOf(g, w, where)?.name ?? 'Out')}</small>
            ${isScenario(w) ? '' : `<button data-act="swap-to" data-who="${esc(sel.avatar)}">${icon('user')}<span>Play as ${esc(sel.name)}</span></button>`}
            ${here ? '' : `<button data-act="hs-call" data-who="${esc(sel.avatar)}" ${tooLittle(g, sel.avatar) ? 'aria-disabled="true" title="Too little to come on their own"' : ''}>${icon('phone')}<span>Call them over</span></button>
            <button data-act="hs-go" data-who="${esc(sel.avatar)}">${icon('map')}<span>Go to where they are</span></button>`}</div>` : ''}
    </aside>`;
}

Object.assign(ACT, {
    'hs-open': (el) => { H.open = H.open === el.dataset.who ? '' : el.dataset.who!; notify(); },
    'hs-call': (el) => {
        const g = game(); const r = g && g.cast[el.dataset.who!]; if (!g || !r) return;
        if (tooLittle(g, r.avatar)) { toast(`${r.name} is too little to come on their own.`, 'info'); return; }
        const s = social(g);
        if (!s.with.some(c => c.avatar === r.avatar)) s.with.push({ avatar: r.avatar, until: nowAbs(g) + 180 });
        note(g, '{u} called {0} over.', [r.name], [r.avatar]);
        H.open = ''; saveGame();
        toast(`${r.name} is coming to meet you.`, 'success'); notify();
    },
    'hs-go': async (el) => {
        const g = game(); const w = g && getWorld(g.world); const r = g && g.cast[el.dataset.who!];
        if (!g || !w || !r) return;
        H.open = '';
        const { travelTo } = await import('./map.js');
        await travelTo(whereNow(g, w, r));
    },
});
// closes when you click elsewhere
document.addEventListener('click', (e) => {
    if (!H.open) return;
    if ((e.target as HTMLElement).closest?.('.mh-house')) return;
    H.open = ''; setTimeout(notify, 0);
}, true);
