// Home: who lives in the house. Each one's bedroom can be changed (pick another; with someone there already they
// share it), and a character can move in in the middle of the game.
import { state, notify, esc, game, saveGame, toast } from '../core/store.js';
import { getWorld, isScenario } from '../core/world.js';
import { characters, thumb, charOf } from '../st/bridge.js';
import { addResident, moveToRoom, removeResident } from '../sim/game.js';
import { normalizeHomes } from '../sim/living.js';
import { planSlots, spotOf } from '../sim/plan.js';
import { refreshPrompt } from '../sim/prompt.js';
import { charPicker } from './charpick.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';
export const RS = { open: false, adding: false, out: '' };
export function residentsHtml() {
    const g = game();
    const w = g && getWorld(g.world);
    if (!g || !w || !isScenario(w) || !RS.open)
        return '';
    if (RS.out && g.cast[RS.out]) {
        const r = g.cast[RS.out];
        return `<div class="mu-dlg-veil" data-act="res-out-no"></div><div class="mu-panel mu-dlg mu-glassdlg mu-outback" role="dialog"><h3>${esc(r.name)} moves out?</h3>
            <p class="mu-muted">${esc(r.name)} leaves the house for good: their bedroom is free again and plans with them are called off. Their character card stays in your library, and they can move back in later.</p>
            <div class="mu-row mu-dlg-btns"><button data-act="res-out-no">Stay</button><button class="mu-danger" data-act="res-out-yes">${icon('back')}<span>Move out</span></button></div></div>`;
    }
    if (RS.adding) {
        return `<div class="mu-dlg-veil" data-act="res-add-close"></div><div class="mu-panel mu-scpick mu-glassdlg is-chars" role="dialog"><header><h3>Someone moves in</h3><button class="mu-ibtn mu-ghost" data-act="res-add-close" aria-label="Close">${icon('x')}</button></header>
            <p class="mu-muted">They move into a free bedroom (or share one when the house is full).</p>
            ${charPicker({ key: 'resadd', list: characters().filter(c => !g.cast[c.avatar]), selected: [], act: 'res-add', placeholder: 'Search your characters' })}</div>`;
    }
    const beds = planSlots(w).filter(s => s.bedroom);
    const floorOfSpot = (id) => { const r = w.plan?.rooms.find(x => x.id === id); return r ? w.plan.floors.find(f => f.id === r.floor)?.name ?? '' : ''; };
    const roomName = (id) => { const f = floorOfSpot(id); return `${f ? `${f} · ` : ''}${beds.find(b => b.id === id)?.name ?? id}`; };
    const mine = spotOf(w, g.player.home);
    // who is in each bedroom now
    const inRoom = (id) => [...(mine === id ? ['You'] : []), ...Object.values(g.cast).filter(r => spotOf(w, r.home) === id).map(r => r.name)];
    const people = Object.values(g.cast).sort((a, b) => a.name.localeCompare(b.name));
    const opts = (cur, who) => beds.map(b => { const there = inRoom(b.id).filter(n => (who ? n !== g.cast[who]?.name : n !== 'You')); return `<option value="${esc(b.id)}" ${b.id === cur ? 'selected' : ''}>${esc(roomName(b.id))}${there.length ? ` (with ${esc(there.join(', '))})` : ''}</option>`; }).join('');
    return `<div class="mu-dlg-veil" data-act="res-close"></div><div class="mu-panel mu-glassdlg mu-residents" role="dialog"><header class="mu-row"><h3>${icon('users')} Who lives here</h3><button class="mu-ibtn mu-ghost mu-right" data-act="res-close" aria-label="Close">${icon('x')}</button></header>
        <p class="mu-muted">Choose each one's bedroom. Two people in the same bedroom share it (the AI knows). Someone can move in or move out at any time.</p>
        <div class="mu-res-list">
            <div class="mu-res-row is-you"><span class="mu-res-me">${icon('user')}</span><b>You</b><select data-input="res-room" data-who="">${opts(mine, '')}</select><span></span></div>
            ${people.map(r => `<div class="mu-res-row"><img src="${esc(thumb(r.avatar))}" alt=""><b data-notr>${esc(r.met ? r.name : `${r.name} (not met yet)`)}</b><select data-input="res-room" data-who="${esc(r.avatar)}">${opts(spotOf(w, r.home), r.avatar)}</select><button class="mu-ghost mu-res-out" data-act="res-out" data-who="${esc(r.avatar)}" title="${esc(r.name)} moves out">${icon('back')}<span>Move out</span></button></div>`).join('')}
        </div>
        <div class="mu-row mu-dlg-btns"><button data-act="res-add-open">${icon('plus')}<span>Someone moves in</span></button><button class="mu-primary" data-act="res-close">Done</button></div></div>`;
}
Object.assign(ACT, {
    'res-open': () => { RS.open = true; RS.adding = false; notify(); },
    'res-close': (el, e) => { if (e && el.classList.contains('mu-dlg-veil') && e.target !== el)
        return; RS.open = false; notify(); },
    'res-add-open': () => { RS.adding = true; notify(); },
    'res-out': (el) => { RS.out = el.dataset.who ?? ''; notify(); },
    'res-out-no': (el, e) => { if (e && el.classList.contains('mu-dlg-veil') && e.target !== el)
        return; RS.out = ''; notify(); },
    'res-out-yes': async () => {
        const g = game();
        const a = RS.out;
        RS.out = '';
        if (!g || !a || !g.cast[a]) {
            notify();
            return;
        }
        if (state.generating) {
            toast('Wait until they finish speaking.', 'info');
            notify();
            return;
        }
        const name = g.cast[a].name;
        removeResident(g, a);
        saveGame();
        refreshPrompt();
        const { syncScene } = await import('../sim/game.js');
        await syncScene();
        toast(`${name} moved out of the house.`, 'info');
        notify();
    },
    'res-add-close': () => { RS.adding = false; notify(); },
    'res-add': async (el) => {
        const g = game();
        const w = g && getWorld(g.world);
        const a = el.dataset.avatar;
        if (!g || !w || !a)
            return;
        if (state.generating) {
            toast('Wait until they finish speaking.', 'info');
            return;
        }
        RS.adding = false;
        notify();
        const r = await addResident(g, w, a);
        if (r) {
            saveGame();
            refreshPrompt();
            toast(`${String(charOf(a)?.name ?? r.name)} moved into the house.`, 'success');
        }
        notify();
    },
});
Object.assign(INPUT, {
    'res-room': async (el) => {
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w)
            return;
        const [, zone, k] = el.value.split(':');
        const z = w.homes.zones.find(x => x.id === zone);
        const s = z?.spots[Number(k)];
        if (!z || !s)
            return;
        const who = el.dataset.who ?? '';
        if (!who) {
            g.player.home = { zone: z.id, x: s[0], y: s[1], kind: z.kind };
            normalizeHomes(g);
        }
        else
            moveToRoom(g, who, { zone: z.id, x: s[0], y: s[1] });
        saveGame();
        refreshPrompt();
        const { syncScene } = await import('../sim/game.js');
        await syncScene();
        notify();
    },
});
