// The top bar in game: day and time, map/scene switch, settings and the menu.
import { showTransition } from './lifeui.js';
import { period } from '../sim/time.js';
import { state, game } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { toNextPeriod, advance } from '../sim/time.js';
import { runPlans } from './plans.js';
import { syncScene } from '../sim/game.js';
import { toast, saveGame, notify } from '../core/store.js';
import { ACT } from './reg.js';
import { playerHomeId } from '../sim/places.js';
const SPEEDS = [0, 30, 60, 120];
// The old top bar is gone: its parts live in the HUD now (hud.ts). Kept so screens can still call it.
export function toolsHtml() { return ''; }
Object.assign(ACT, {
    speed: () => { const g = game(); if (!g)
        return; g.speed = SPEEDS[(SPEEDS.indexOf(g.speed) + 1) % SPEEDS.length]; saveGame(); notify(); },
    skip: async () => {
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w)
            return;
        const { allow, passOnce } = await import('./pstateui.js');
        if (!allow('skip', () => { passOnce(); void ACT.skip(document.body, new Event('click')); }))
            return;
        advance(g, w, toNextPeriod(w, g.minutes)).forEach(m => toast(m, 'warn'));
        showTransition(period(w, g.minutes).name, `Day ${g.day}`, 'time');
        runPlans();
        saveGame();
        await syncScene();
        notify();
    },
    // straight home, into the home scene
    'go-home': async () => {
        const g = game();
        if (!g)
            return;
        if (g.player.loc !== playerHomeId) {
            const { travelTo } = await import('./map.js');
            await travelTo(playerHomeId);
        }
        state.view = 'scene';
        notify();
    },
    // straight to work (and the shift, if it is open)
    'go-work': async () => {
        const g = game();
        const w = g && getWorld(g.world);
        const o = g?.player.job && w?.occupations.find(x => x.id === g.player.job.id);
        if (!g || !w || !o)
            return;
        if (state.generating) {
            toast('Wait until they finish speaking.', 'info');
            return;
        }
        if (g.player.loc !== o.place) {
            const { travelTo } = await import('./map.js');
            await travelTo(o.place);
        }
        state.view = 'scene';
        notify();
    },
    'open-settings': () => { state.backTo = state.view; state.view = 'settings'; notify(); },
});
