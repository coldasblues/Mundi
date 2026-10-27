// Households (like The Sims): every home of the world, with who lives there, empty ones included. Open one to see
// its people and move one of them, or the whole household, to another home.
import { esc, game, notify, saveGame, toast, type Save } from '../core/store.js';
import { getWorld, isScenario, type WorldDef } from '../core/world.js';
import { thumb, personaThumb, personaName } from '../st/bridge.js';
import { homeAddress } from '../sim/places.js';
import { homeKey, normalizeHomes } from '../sim/living.js';
import { syncScene } from '../sim/game.js';
import { refreshPrompt } from '../sim/prompt.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';

interface Spot { key: string; zone: string; zoneName: string; kind: string; x: number; y: number; n: number; unit?: number; members: string[] }   // '__you' = the player
const HH = { sel: '', moving: [] as string[], q: '' };

function spots(g: Save, w: WorldDef): Spot[] {
    const out: Spot[] = [];
    for (const z of w.homes.zones) z.spots.forEach(([x, y], i) => {
        const key = homeKey({ zone: z.id, x, y });
        const members = Object.values(g.cast).filter(r => homeKey(r.home) === key).map(r => r.avatar);
        if (homeKey(g.player.home) === key) members.unshift('__you');
        out.push({ key, zone: z.id, zoneName: z.name, kind: z.kind, x, y, n: i + 1, members });
        // more flats at the same address (when every home was taken)
        const units = [...new Set([g.player.home, ...Object.values(g.cast).map(r => r.home)].filter(h => h.zone === z.id && h.x === x && h.y === y && (h as any).unit).map(h => (h as any).unit as number))].sort();
        for (const u of units) {
            const k = homeKey({ zone: z.id, x, y, unit: u });
            const m = Object.values(g.cast).filter(r => homeKey(r.home) === k).map(r => r.avatar);
            if (homeKey(g.player.home) === k) m.unshift('__you');
            out.push({ key: k, zone: z.id, zoneName: z.name, kind: z.kind, x, y, n: i + 1, unit: u, members: m });
        }
    });
    return out;
}
const pic = (g: Save, id: string) => (id === '__you' ? personaThumb() : thumb(id));
const nameOf = (g: Save, id: string) => (id === '__you' ? `${personaName()} (you)` : g.cast[id]?.name ?? id);
const addr = (w: WorldDef, s: Spot) => homeAddress(w, { zone: s.zone, x: s.x, y: s.y, n: s.n, unit: s.unit });
const faces = (g: Save, s: Spot, max = 5) => s.members.length
    ? `<span class="mu-hh-faces">${s.members.slice(0, max).map(a => `<img src="${esc(pic(g, a))}" alt="" title="${esc(nameOf(g, a))}">`).join('')}${s.members.length > max ? `<i>+${s.members.length - max}</i>` : ''}</span>`
    : '<span class="mu-hh-empty">Empty</span>';

export function tabHouseholds(g: Save, w: WorldDef): string {
    const all = spots(g, w);
    if (!all.some(s => s.key === HH.sel)) HH.sel = all.find(s => s.members.includes('__you'))?.key ?? all[0]?.key ?? '';
    const zones = w.homes.zones.map(z => ({ z, list: all.filter(s => s.zone === z.id) }));
    const sel = all.find(s => s.key === HH.sel);
    return `<div class="mu-wc-people mu-hh">
        <aside class="mu-wc-list mu-hh-list" data-keep="hh-list">
            ${(() => { const mine = all.find(x => x.members.includes('__you')); return mine ? `<h5>${icon('home')} ${isScenario(w) ? 'Your bedroom' : 'Your household'}</h5>
                <button class="mu-wc-row mu-hh-row is-mine ${mine.key === HH.sel ? 'is-on' : ''}" data-act="hh-sel" data-k="${esc(mine.key)}"><span><b>${esc(addr(w, mine))}</b>${faces(g, mine, 6)}</span>${icon('home')}</button>` : ''; })()}
            ${zones.map(({ z, list }) => `<h5>${esc(z.name)} <small>${esc(w.homes.kinds[z.kind]?.name ?? z.kind)}</small></h5>
                ${list.map(s => `<button class="mu-wc-row mu-hh-row ${s.key === HH.sel ? 'is-on' : ''}" data-act="hh-sel" data-k="${esc(s.key)}">
                    <span><b>${esc(addr(w, s))}</b>${faces(g, s)}</span>${s.members.includes('__you') ? icon('home') : ''}</button>`).join('')}`).join('')}
        </aside>
        <section class="mu-wc-form" data-keep="hh-form">${sel ? detail(g, w, sel) : ''}</section>
    </div>${HH.moving.length ? movePicker(g, w, all) : ''}`;
}

function detail(g: Save, w: WorldDef, s: Spot): string {
    const zone = w.homes.zones.find(z => z.id === s.zone);
    return `<header class="mu-wc-head"><div><h3>${esc(addr(w, s))}</h3><small>${esc(w.homes.kinds[s.kind]?.name ?? s.kind)}${isScenario(w) ? '' : ` · rent ${zone?.rent ?? 0}`}${s.members.includes('__you') ? (isScenario(w) ? ' · your bedroom' : ' · your home') : ''}</small></div></header>
        ${s.members.length ? `<div class="mu-hh-members">${s.members.map(a => `<div class="mu-hh-member"><img src="${esc(pic(g, a))}" alt=""><b data-notr>${esc(nameOf(g, a))}</b>
            <span class="mu-row"><button class="mu-ghost" data-act="hh-move" data-who="${esc(a)}">${icon('move')}<span>Move</span></button>${a === '__you' ? '' : `<button class="mu-ghost" data-act="hh-edit" data-who="${esc(a)}">${icon('edit')}<span>Edit</span></button>`}</span></div>`).join('')}</div>
            ${s.members.length > 1 ? `<button class="mu-primary" data-act="hh-move-all">${icon('move')}<span>${isScenario(w) ? 'Move them all' : 'Move the whole household'}</span></button>` : ''}`
        : `<p class="mu-muted">${isScenario(w) ? 'Nobody sleeps here. Move someone in from another bedroom.' : 'Nobody lives here. Move someone in from another household.'}</p>`}`;
}

function movePicker(g: Save, w: WorldDef, all: Spot[]): string {
    const who = HH.moving.map(a => nameOf(g, a)).join(', ');
    const from = all.find(s => HH.moving.every(a => s.members.includes(a)))?.key;
    const q = HH.q.trim().toLowerCase();
    const hit = (s: Spot) => !q || addr(w, s).toLowerCase().includes(q) || s.members.some(a => nameOf(g, a).toLowerCase().includes(q)) || (q === 'empty' && !s.members.length);
    const list = all.filter(s => s.key !== from && hit(s));
    return `<div class="mu-dlg-veil" data-act="hh-cancel"></div><div class="mu-panel mu-scpick mu-hh-pick" role="dialog"><header><h3>Move ${esc(who)}</h3><button class="mu-ibtn mu-ghost" data-act="hh-cancel" aria-label="Close">${icon('x')}</button></header>
        <p class="mu-muted">${isScenario(w) ? 'Choose the new bedroom. Moving in with someone means sharing the room.' : 'Choose the new home. Moving in with others makes them one household.'}</p>
        <input class="mu-search" type="search" data-input="hh-q" data-focus="hhq" placeholder="Search a person or an address (or type empty)" value="${esc(HH.q)}">
        <div class="mu-hh-grid">${list.length ? '' : '<p class="mu-muted">Nothing found.</p>'}${list.map(s => `<button class="mu-hh-dest" data-act="hh-to" data-k="${esc(s.key)}"><b>${esc(addr(w, s))}</b>${faces(g, s, 4)}</button>`).join('')}</div></div>`;
}

function moveTo(g: Save, w: WorldDef, who: string[], key: string) {
    const s = spots(g, w).find(x => x.key === key); if (!s) return;
    const home = { zone: s.zone, x: s.x, y: s.y, n: s.n, unit: s.unit };
    for (const a of who) {
        if (a === '__you') g.player.home = { ...g.player.home, ...home, kind: s.kind };
        else if (g.cast[a]) { g.cast[a].home = { ...home }; delete (g.cast[a] as any).homeWith; }
    }
    normalizeHomes(g);
}

Object.assign(ACT, {
    'hh-sel': (el) => { HH.sel = el.dataset.k!; notify(); },
    'hh-move': (el) => { HH.moving = [el.dataset.who!]; HH.q = ''; notify(); },
    'hh-edit': (el) => { void import('./worldcfg.js').then(m => m.editPerson(el.dataset.who!)); },
    'hh-move-all': () => { const g = game(); const w = g && getWorld(g.world); if (!g || !w) return; HH.moving = spots(g, w).find(s => s.key === HH.sel)?.members ?? []; HH.q = ''; notify(); },
    'hh-cancel': () => { HH.moving = []; notify(); },
    'hh-to': async (el) => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w || !HH.moving.length) return;
        const names = HH.moving.map(a => nameOf(g, a).replace(' (you)', '')).join(', ');
        moveTo(g, w, HH.moving, el.dataset.k!);
        HH.moving = []; HH.sel = el.dataset.k!;
        saveGame(); await syncScene(); refreshPrompt();
        toast(`${names} moved.`, 'success'); notify();
    },
});

Object.assign(INPUT, { 'hh-q': (el) => { HH.q = el.value; notify(); } });
